from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import os
import requests
import sqlite3
from datetime import datetime
from typing import List, Dict, Any
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.metrics.pairwise import cosine_similarity
from functools import lru_cache

TMDB_API_KEY = os.environ.get('TMDB_API_KEY')
if not TMDB_API_KEY:
    raise RuntimeError('Please set TMDB_API_KEY environment variable for the API')

TMDB_BASE = 'https://api.themoviedb.org/3'

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
