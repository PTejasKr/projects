# Underrated Reel - Movie Recommendation Website

A responsive movie recommendation website that uses dice rolls and genre selection to suggest movies. Features include:

- Roll a dice to add randomness to recommendations
- Select from popular movie genres
- View movie details including streaming availability
- Swipe interface for movie cards:
  - Swipe right to add to favorites
  - Swipe left to remove and hide similar movies
- Responsive design that works on mobile and desktop
- Local storage to persist favorites

## Setup

1. Get a TMDB API key:
   - Sign up at https://www.themoviedb.org/signup
   - Go to your account settings
   - Click on "API" in the left sidebar
   - Request an API key (choose "Developer" option)

2. Configure the API key:
   - Open `config.js`
   - Replace `YOUR_TMDB_API_KEY` with your actual TMDB API key

3. Serve the website:
   You can use any static file server. Here are some options:

   Using Python:
   ```powershell
   python -m http.server 8000
   ```

   Using Node.js's `http-server`:
   ```powershell
   npm install -g http-server
   http-server
   ```

4. Open in browser:
   - Open http://localhost:8000 or http://localhost:8080 (depending on your server)

## Features

- **Movie Data**: Uses TMDB API for reliable movie information and posters
- **Streaming Links**: Provides links to streaming services where available
- **Local Storage**: Favorites persist between sessions
- **Responsive Design**: Works on all screen sizes
- **Touch/Mouse Interface**: Swipeable cards work with both touch and mouse
- **Loading States**: Visual feedback during API calls
- **Error Handling**: User-friendly error messages via toast notifications

## Development

- `index.html`: Main page structure
- `styles.css`: All styling with CSS variables for theming
- `config.js`: TMDB API configuration
- `app.js`: Core application logic and TMDB API integration

## Notes

- The website respects TMDB's terms of service
- Uses the official TMDB API instead of scraping
- All movie data and images are from TMDB
- The recommendation algorithm considers:
  - Genre selection
  - Dice roll value
  - Movie ratings
  - Vote counts (to ensure quality)

## Contributing

1. Fork the repository
2. Create a feature branch
3. Commit your changes
4. Push to the branch
5. Open a Pull Request