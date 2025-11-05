# Underrated Reel — MRS folder

This folder (`MRS/`) contains the finalized prototype web app for the movie recommender:

- `app.py` — FastAPI backend with SQLite favorites, `/remove_similar` endpoint, and scraping helpers for IMDb/news.
- `static/` — frontend (index.html, styles.css, app.js).
- `requirements.txt` — Python dependencies.

Run locally (Windows PowerShell):

```powershell
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
uvicorn app:app --reload
```

Open http://127.0.0.1:8000/ to view the app.

Notes:
- The app creates `movies.db` in the same folder to persist favorites.
- `remove_similar` re-scrapes IMDb for the given genre to compute plot similarity (TF-IDF + cosine). This is a prototype — caching and rate limiting are recommended.
