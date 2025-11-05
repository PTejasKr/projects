const config = {
    // Replace with your TMDB API key
    tmdbApiKey: 'YOUR_TMDB_API_KEY',
    tmdbBaseUrl: 'https://api.themoviedb.org/3',
    imageBaseUrl: 'https://image.tmdb.org/t/p/w500',
    // API backend for favorites/similarity (FastAPI). Run it with TMDB_API_KEY env var.
    apiBase: 'http://127.0.0.1:8000'
};

// Toggle to run entirely offline using bundled mock data
// Set to true to avoid any external network calls
config.useLocal = true;