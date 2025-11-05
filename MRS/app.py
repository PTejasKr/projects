from fastapi import FastAPI, HTTPException
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse, JSONResponse
from pydantic import BaseModel
import os
import requests
from bs4 import BeautifulSoup
from typing import List, Dict, Any
import re
from urllib.parse import quote_plus
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.metrics.pairwise import cosine_similarity
import sqlite3
from datetime import datetime

app = FastAPI()

# Serve static frontend
app.mount("/static", StaticFiles(directory="./static"), name="static")


class RecommendRequest(BaseModel):
    genre: str
    dice: int


DB_PATH = "movies.db"

def get_db_conn():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn

def init_db():
    conn = get_db_conn()
    cur = conn.cursor()
    cur.execute("""
    CREATE TABLE IF NOT EXISTS favorites (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        title TEXT NOT NULL,
        link TEXT,
        poster TEXT,
        streaming_link TEXT,
        added_at TEXT
    )
    """)
    conn.commit()
    conn.close()

init_db()


def imdb_search_genre(genre: str, max_results: int = 50) -> List[Dict[str, Any]]:
    headers = {"User-Agent": "Mozilla/5.0 (compatible)"}
    url = f"https://www.imdb.com/search/title/?genres={quote_plus(genre)}&sort=user_rating,desc&count={max_results}"
    r = requests.get(url, headers=headers, timeout=10)
    if r.status_code != 200:
        raise HTTPException(status_code=502, detail="IMDb unreachable")
    soup = BeautifulSoup(r.text, "html.parser")
    items = soup.select(".lister-item.mode-advanced")
    results = []
    for it in items:
        header = it.select_one(".lister-item-header a")
        title = header.get_text(strip=True) if header else None
        link = "https://www.imdb.com" + header["href"] if header and header.has_attr("href") else None
        rating_tag = it.select_one(".ratings-imdb-rating strong")
        try:
            rating = float(rating_tag.get_text(strip=True)) if rating_tag and rating_tag.get_text(strip=True) else None
        except Exception:
            rating = None
        poster_tag = it.select_one(".lister-item-image img")
        poster = poster_tag["loadlate"] if poster_tag and poster_tag.has_attr("loadlate") else (poster_tag["src"] if poster_tag and poster_tag.has_attr("src") else None)
        year_tag = it.select_one(".lister-item-year")
        year = year_tag.get_text(strip=True) if year_tag else None
        results.append({"title": title, "link": link, "rating": rating, "poster": poster, "year": year})
    return results


def imdb_fetch_plot(imdb_url: str) -> str:
    if not imdb_url:
        return ""
    headers = {"User-Agent": "Mozilla/5.0 (compatible)"}
    try:
        r = requests.get(imdb_url, headers=headers, timeout=10)
    except Exception:
        return ""
    if r.status_code != 200:
        return ""
    soup = BeautifulSoup(r.text, "html.parser")
    plot = ""
    meta = soup.find("meta", {"name": "description"})
    if meta and meta.get("content"):
        plot = meta.get("content")
    if not plot:
        summary = soup.select_one(".plot_summary .summary_text")
        if summary:
            plot = summary.get_text(strip=True)
    if not plot:
        story = soup.select_one("#titleStoryLine .inline")
        if story:
            plot = story.get_text(strip=True)
    return plot


@app.get("/genres")
def genres_list():
    return ["action", "comedy", "drama", "thriller", "sci-fi", "romance", "horror", "animation"]


@app.post("/scrape_imdb")
def scrape_imdb(genre: str):
    movies = imdb_search_genre(genre, max_results=30)
    for i, m in enumerate(movies[:20]):
        try:
            m["plot"] = imdb_fetch_plot(m["link"]) if m.get("link") else ""
        except Exception:
            m["plot"] = ""
    return JSONResponse(content={"movies": movies})


@app.post("/recommend")
def recommend(req: RecommendRequest):
    movies = imdb_search_genre(req.genre, max_results=50)
    if not movies:
        raise HTTPException(status_code=404, detail="No movies found for genre")
    idx = (req.dice - 1) % len(movies)
    recommended = movies[idx]
    for m in movies[:40]:
        m["plot"] = imdb_fetch_plot(m.get("link") or "")

    def streaming_search_link(title):
        return f"https://www.justwatch.com/us/search?q={quote_plus(title)}"

    for m in movies:
        m["streaming_link"] = streaming_search_link(m.get("title") or "")
    return {"recommended": recommended, "movies": movies}


@app.post("/remove_similar")
def remove_similar(payload: Dict[str, Any]):
    """Given a genre and a title, return list of movies that are similar by plot (cosine similarity).
    Payload: {"genre": "drama", "title": "Movie Title", "threshold": 0.35}
    """
    genre = payload.get("genre")
    title = payload.get("title")
    threshold = float(payload.get("threshold", 0.35))
    if not genre or not title:
        raise HTTPException(status_code=400, detail="genre and title required")
    movies = imdb_search_genre(genre, max_results=40)
    for m in movies:
        m["plot"] = imdb_fetch_plot(m.get("link") or "")

    # find base movie plot
    base_plot = ""
    for m in movies:
        if m.get("title") and m["title"].lower() == title.lower():
            base_plot = m.get("plot") or ""
            break
    if not base_plot:
        # couldn't find base in scraped list; return empty
        return {"removed": []}

    plots = [m.get("plot") or "" for m in movies]
    if not any(plots):
        return {"removed": []}

    vectorizer = TfidfVectorizer(stop_words="english")
    tf = vectorizer.fit_transform(plots)
    base_vec = vectorizer.transform([base_plot])
    sims = cosine_similarity(base_vec, tf)[0]
    removed = []
    for idx, sim in enumerate(sims):
        if sim >= threshold and movies[idx].get("title") and movies[idx]["title"].lower() != title.lower():
            removed.append({"title": movies[idx].get("title"), "link": movies[idx].get("link")})
    return {"removed": removed}


@app.post("/favorites/add")
def add_favorite(payload: Dict[str, Any]):
    title = payload.get("title")
    if not title:
        raise HTTPException(status_code=400, detail="title required")
    link = payload.get("link")
    poster = payload.get("poster")
    streaming_link = payload.get("streaming_link")
    conn = get_db_conn()
    cur = conn.cursor()
    cur.execute("INSERT INTO favorites (title, link, poster, streaming_link, added_at) VALUES (?,?,?,?,?)",
                (title, link, poster, streaming_link, datetime.utcnow().isoformat()))
    conn.commit()
    fid = cur.lastrowid
    conn.close()
    return {"id": fid, "title": title}


@app.get("/favorites")
def list_favorites():
    conn = get_db_conn()
    cur = conn.cursor()
    cur.execute("SELECT id, title, link, poster, streaming_link, added_at FROM favorites ORDER BY added_at DESC")
    rows = cur.fetchall()
    conn.close()
    out = [dict(r) for r in rows]
    return {"favorites": out}


@app.delete("/favorites/{fid}")
def delete_favorite(fid: int):
    conn = get_db_conn()
    cur = conn.cursor()
    cur.execute("DELETE FROM favorites WHERE id=?", (fid,))
    conn.commit()
    conn.close()
    return {"deleted": fid}


@app.get("/")
def root():
    return FileResponse("./static/index.html")
