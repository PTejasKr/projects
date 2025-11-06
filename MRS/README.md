# Movie Recommendation System (MRS)

A web-based movie recommendation system with swipe gestures, streaming service links, and personalized suggestions based on genre and user preferences.

## Project Structure

```
MRS/
├── api/               # FastAPI backend
│   ├── main.py       # API endpoints and JustWatch scraping
│   └── requirements.txt
├── website/          # Frontend (production)
│   ├── app.js       # Core application logic
│   ├── config.js    # Configuration (API keys, endpoints)
│   ├── index.html   # Main HTML
│   ├── mock_data.js # Offline mode sample data
│   └── styles.css   # Styling
└── static/          # Legacy/development files (to be removed)
    ├── app.js
    ├── index.html
    └── styles.css
```

## Features

- 🎲 Dice-based movie recommendations
- 🎭 Genre filtering
- 👆 Swipe gestures for like/dislike
- 📺 Streaming service availability (via JustWatch)
- ❤️ Favorites list with local/server storage
- 🔄 Similar movie suggestions
- 📱 Responsive design
- 🌐 Online/offline mode support

## Setup & Run

### Backend (FastAPI)

1. Set up Python environment and install dependencies:
```bash
cd MRS/api
python -m venv env
source env/bin/activate  # or `env\Scripts\activate` on Windows
pip install -r requirements.txt
```

2. Set environment variables:
```bash
# Linux/macOS
export TMDB_API_KEY="your_tmdb_api_key"

# Windows PowerShell
$env:TMDB_API_KEY="your_tmdb_api_key"
```

3. Run the API server:
```bash
uvicorn main:app --host 127.0.0.1 --port 8000 --reload
```

### Frontend

1. Configure the application:
   - Edit `website/config.js`:
     - Set your TMDB API key
     - Set `useLocal = false` for online mode
     - Ensure `apiBase` points to your FastAPI server

2. Serve the frontend:
   - Using Python:
   ```bash
   cd MRS/website
   python -m http.server 5500
   ```
   - Or any static file server

3. Open http://localhost:5500 in your browser

## Development Notes

- The `static/` directory contains development/legacy files and will be removed
- `website/` contains the production frontend code
- Set `useLocal = true` in `config.js` for offline development (uses mock_data.js)
- The backend caches scraped streaming links for 7 days to minimize JustWatch requests

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
