from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import os
import requests
import sqlite3
from datetime import datetime
import json
import time
from typing import List, Dict, Any
from bs4 import BeautifulSoup
import aiohttp
import asyncio
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.metrics.pairwise import cosine_similarity
from functools import lru_cache

TMDB_API_KEY = os.environ.get('TMDB_API_KEY')
if not TMDB_API_KEY:
    raise RuntimeError('Please set TMDB_API_KEY environment variable for the API')

TMDB_BASE = 'https://api.themoviedb.org/3'
JUSTWATCH_BASE = 'https://www.justwatch.com'

app = FastAPI()
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

DB_PATH = os.path.join(os.path.dirname(__file__), 'movies.db')

def get_conn():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn

def init_db():
    conn = get_conn()
    cur = conn.cursor()
    cur.execute('''
    CREATE TABLE IF NOT EXISTS favorites (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        tmdb_id INTEGER,
        title TEXT,
        poster_path TEXT,
        streaming_link TEXT,
        added_at TEXT
    )
    ''')
    # caching table for scraped streaming providers
    cur.execute('''
    CREATE TABLE IF NOT EXISTS streaming_cache (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        tmdb_id INTEGER UNIQUE,
        title TEXT,
        providers_json TEXT,
        fetched_at INTEGER
    )
    ''')
    conn.commit()
    conn.close()

init_db()


class FavoriteIn(BaseModel):
    tmdb_id: int
    title: str
    poster_path: str = None
    streaming_link: str = None


@app.post('/favorites')
def add_favorite(fav: FavoriteIn):
    conn = get_conn()
    cur = conn.cursor()
    cur.execute('INSERT INTO favorites (tmdb_id, title, poster_path, streaming_link, added_at) VALUES (?,?,?,?,?)',
                (fav.tmdb_id, fav.title, fav.poster_path, fav.streaming_link, datetime.utcnow().isoformat()))
    conn.commit()
    fid = cur.lastrowid
    conn.close()
    return {'id': fid, 'title': fav.title}


@app.get('/favorites')
def list_favorites():
    conn = get_conn()
    cur = conn.cursor()
    cur.execute('SELECT id, tmdb_id, title, poster_path, streaming_link, added_at FROM favorites ORDER BY added_at DESC')
    rows = cur.fetchall()
    conn.close()
    return {'favorites': [dict(r) for r in rows]}


@app.delete('/favorites/{fid}')
def delete_favorite(fid: int):
    conn = get_conn()
    cur = conn.cursor()
    cur.execute('DELETE FROM favorites WHERE id=?', (fid,))
    conn.commit()
    conn.close()
    return {'deleted': fid}


def tmdb_get(endpoint: str, params: Dict[str, Any] = None) -> Dict[str, Any]:
    params = params or {}
    params['api_key'] = TMDB_API_KEY
    r = requests.get(f"{TMDB_BASE}{endpoint}", params=params, timeout=10)
    r.raise_for_status()
    return r.json()


async def scrape_justwatch_for_title(title: str, country: str = 'us') -> Dict[str, str]:
    """Search JustWatch for the title and try to extract streaming provider links.
    Returns a dict mapping provider name -> provider-specific URL when available.
    If an exact provider link cannot be found, returns {'justwatch_search': search_url}.
    """
    search_url = f"{JUSTWATCH_BASE}/{country}/search?q={requests.utils.quote(title)}"
    headers = {'User-Agent': 'Mozilla/5.0 (compatible; MRS-bot/1.0)'}

    try:
        async with aiohttp.ClientSession(headers=headers) as session:
            async with session.get(search_url, timeout=10) as resp:
                if resp.status != 200:
                    return {'justwatch_search': search_url}
                html = await resp.text()
                soup = BeautifulSoup(html, 'lxml')

                # Try to find the first movie link on the search results page
                a = None
                for link in soup.find_all('a', href=True):
                    href = link['href']
                    # typical JustWatch movie url contains '/movie/' or '/title/'
                    if f'/{country}/movie/' in href or f'/{country}/title/' in href:
                        a = link
                        break

                if not a:
                    # fallback: return search url so frontend can open JustWatch search
                    return {'justwatch_search': search_url}

                movie_page = JUSTWATCH_BASE + a['href']
                async with session.get(movie_page, timeout=10) as mresp:
                    if mresp.status != 200:
                        return {'justwatch_search': search_url}
                    movie_html = await mresp.text()
                    msoup = BeautifulSoup(movie_html, 'lxml')

                    providers = {}
                    # Look for offer elements that contain provider anchors
                    # This is somewhat heuristic because JustWatch HTML can change.
                    for offer in msoup.find_all('a', href=True):
                        href = offer['href']
                        # provider links often point to external sites and include provider names in aria-label/alt/text
                        text = (offer.get('aria-label') or '' ).strip() or (offer.get('title') or '').strip() or (offer.get_text() or '').strip()
                        if not text:
                            # check for img alt
                            img = offer.find('img', alt=True)
                            if img:
                                text = img['alt'].strip()
                        if text and ('watch' in href or 'amazon' in href or 'netflix' in href or 'hulu' in href or 'disney' in href or 'peacock' in href or 'paramount' in href):
                            # normalize absolute url
                            if href.startswith('/'):
                                href = JUSTWATCH_BASE + href
                            providers[text] = href

                    # If no provider-specific external links were found, try to extract provider tiles
                    if not providers:
                        # provider tiles may be buttons with provider names; build links back to JustWatch provider section
                        for prov in msoup.select('.price-comparison__grid__row__holder, .offers__list__item'):
                            name = prov.get('data-provider-name') or prov.get('data-provider') or ''
                            if not name:
                                img = prov.find('img', alt=True)
                                if img:
                                    name = img['alt']
                            if name:
                                # create a JustWatch anchor to provider filter for the page
                                providers[name.strip()] = movie_page

                    if providers:
                        return providers
                    return {'justwatch_search': search_url}
    except Exception:
        return {'justwatch_search': search_url}


@app.get('/movies/{movie_id}/streaming')
async def movie_streaming(movie_id: int):
    """Return streaming provider links for the given TMDB movie id.
    Uses TMDB to get the movie title then scrapes JustWatch for provider links.
    If scraping fails, returns a fallback JustWatch search URL.
    """
    # Try to use cached providers first (TTL: 7 days)
    CACHE_TTL = 7 * 24 * 60 * 60
    conn = get_conn()
    cur = conn.cursor()
    cur.execute('SELECT providers_json, fetched_at, title FROM streaming_cache WHERE tmdb_id=?', (movie_id,))
    row = cur.fetchone()
    now = int(time.time())
    if row:
        try:
            providers_json = row['providers_json']
            fetched_at = int(row['fetched_at'] or 0)
            cached_title = row['title']
            if fetched_at and (now - fetched_at) < CACHE_TTL:
                # return cached providers
                try:
                    providers = json.loads(providers_json)
                except Exception:
                    providers = {'justwatch_search': f'https://www.justwatch.com/us/search?q={requests.utils.quote(cached_title)}'}
                conn.close()
                return {'movie_id': movie_id, 'title': cached_title, 'providers': providers, 'cached': True}
        except Exception:
            # fall through to re-scrape
            pass

    # not cached or expired: fetch TMDB title and scrape
    try:
        movie = tmdb_get(f'/movie/{movie_id}')
    except Exception as e:
        conn.close()
        raise HTTPException(status_code=502, detail=f'Failed to fetch movie details: {str(e)}')

    title = movie.get('title') or movie.get('name') or ''
    if not title:
        conn.close()
        raise HTTPException(status_code=404, detail='Movie title not found')

    providers = await scrape_justwatch_for_title(title)

    # store in cache (replace existing)
    try:
        providers_json = json.dumps(providers)
        fetched_at = now
        cur.execute('INSERT OR REPLACE INTO streaming_cache (tmdb_id, title, providers_json, fetched_at) VALUES ((SELECT tmdb_id FROM streaming_cache WHERE tmdb_id=?) ,?,?,?)', (movie_id, title, providers_json, fetched_at))
        # The above INSERT OR REPLACE with subselect ensures unique constraint behaviour across SQLite versions
        # Simpler: use UPSERT syntax when available
    except Exception:
        try:
            # fallback: delete then insert
            cur.execute('DELETE FROM streaming_cache WHERE tmdb_id=?', (movie_id,))
            cur.execute('INSERT INTO streaming_cache (tmdb_id, title, providers_json, fetched_at) VALUES (?,?,?,?)', (movie_id, title, providers_json, fetched_at))
        except Exception:
            pass
    conn.commit()
    conn.close()

    return {'movie_id': movie_id, 'title': title, 'providers': providers, 'cached': False}


@lru_cache(maxsize=64)
def discover_genre_movies(genre_id: int, pages: int = 1) -> List[Dict[str, Any]]:
    results = []
    for page in range(1, pages + 1):
        resp = tmdb_get('/discover/movie', {'with_genres': genre_id, 'sort_by': 'vote_average.desc', 'vote_count.gte': 50, 'page': page})
        results.extend(resp.get('results', []))
    return results


@app.post('/similar')
def find_similar(payload: Dict[str, Any]):
    """Compute similarity between the given TMDB movie and movies in the specified genre.
    Payload: {movie_id: int, genre_id: int, threshold: float (0-1)}
    Returns list of similar movies (id, title, similarity)
    """
    movie_id = int(payload.get('movie_id'))
    genre_id = int(payload.get('genre_id'))
    threshold = float(payload.get('threshold', 0.35))

    # fetch target movie details
    try:
        target = tmdb_get(f'/movie/{movie_id}')
    except Exception as e:
        raise HTTPException(status_code=502, detail=f'Failed to fetch movie {movie_id}: {str(e)}')

    target_overview = (target.get('overview') or '').strip()
    if not target_overview:
        return {'removed': [], 'message': 'No overview available for the target movie'}

    # fetch candidate movies in genre (first 2 pages => up to 40 results)
    candidates = discover_genre_movies(genre_id, pages=2)
    overviews = [ (c.get('overview') or '').strip() for c in candidates ]

    if not any(overviews):
        return {'removed': [], 'message': 'No overviews available for genre candidates'}

    try:
        vectorizer = TfidfVectorizer(stop_words='english')
        tf = vectorizer.fit_transform([target_overview] + overviews)
        sims = cosine_similarity(tf[0:1], tf[1:]).flatten()
    except Exception as e:
        raise HTTPException(status_code=500, detail=f'Failed to compute similarity: {str(e)}')

    removed = []
    for idx, sim in enumerate(sims):
        if sim >= threshold:
            c = candidates[idx]
            removed.append({'id': c.get('id'), 'title': c.get('title'), 'similarity': float(sim)})

    # sort by similarity desc
    removed.sort(key=lambda x: x['similarity'], reverse=True)
    return {'removed': removed, 'message': 'Success'}
