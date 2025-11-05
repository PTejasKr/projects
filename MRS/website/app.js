// State management
const state = {
    currentGenre: null,
    diceValue: 1,
    movies: [],
    favorites: JSON.parse(localStorage.getItem('favorites') || '[]'),
};

// DOM Elements
const elements = {
    diceBtn: document.getElementById('rollBtn'),
    diceVal: document.getElementById('diceVal'),
    genreSelect: document.getElementById('genre'),
    goBtn: document.getElementById('goBtn'),
    recCard: document.getElementById('recCard'),
    cardsContainer: document.getElementById('cards'),
    favsList: document.getElementById('favs'),
    toast: document.getElementById('toast'),
};

// Helper functions
function showToast(message, type = 'success') {
    const toast = elements.toast;
    toast.textContent = message;
    toast.className = `toast ${type}`;
    toast.style.display = 'block';
    setTimeout(() => {
        toast.style.display = 'none';
    }, 3000);
}

function setLoading(element, isLoading) {
    element.classList.toggle('loading', isLoading);
}

async function fetchFromTMDB(endpoint, params = {}) {
    const queryString = new URLSearchParams({
        api_key: config.tmdbApiKey,
        ...params
    }).toString();
    
    try {
        const response = await fetch(`${config.tmdbBaseUrl}${endpoint}?${queryString}`);
        if (!response.ok) throw new Error('TMDB API request failed');
        return await response.json();
    } catch (error) {
        console.error('TMDB API Error:', error);
        showToast('Failed to fetch movies. Please try again.', 'error');
        throw error;
    }
}

async function getMovieDetails(movieId) {
    try {
        const [details, providers] = await Promise.all([
            fetchFromTMDB(`/movie/${movieId}`),
            fetchFromTMDB(`/movie/${movieId}/watch/providers`)
        ]);
        return {
            ...details,
            providers: providers.results?.US?.flatrate || []
        };
    } catch (error) {
        console.error('Error fetching movie details:', error);
        return null;
    }
}

function renderMovieCard(movie, isRecommended = false) {
    const card = document.createElement('div');
    card.className = 'card';
    card.dataset.movieId = movie.id;
    
    const imageUrl = movie.poster_path 
        ? `${config.imageBaseUrl}${movie.poster_path}`
        : 'https://via.placeholder.com/500x750?text=No+Poster';
    
    card.innerHTML = `
        <img src="${imageUrl}" alt="${movie.title}">
        <div class="content">
            <h4>${movie.title}</h4>
            <div class="rating">
                <i class="fas fa-star"></i>
                <span>${movie.vote_average.toFixed(1)}</span>
            </div>
            ${movie.providers?.map(p => `
                <a href="${p.link}" target="_blank" rel="noopener">
                    Watch on ${p.provider_name}
                </a>
            `).join('') || '<a href="https://www.justwatch.com/us/search?q=' + encodeURIComponent(movie.title) + '" target="_blank">Find where to watch</a>'}
        </div>
    `;
    
    if (!isRecommended) {
        attachSwipeListeners(card, movie);
    }
    
    return card;
}

function attachSwipeListeners(card, movie) {
    let startX = 0;
    let currentX = 0;
    let isDragging = false;
    
    card.addEventListener('pointerdown', e => {
        isDragging = true;
        startX = e.clientX;
        card.setPointerCapture(e.pointerId);
    });
    
    card.addEventListener('pointermove', e => {
        if (!isDragging) return;
        currentX = e.clientX - startX;
        card.style.transform = `translateX(${currentX}px) rotate(${currentX/20}deg)`;
    });
    
    card.addEventListener('pointerup', e => {
        isDragging = false;
        handleSwipeRelease(card, movie, currentX);
    });
    
    card.addEventListener('pointercancel', () => {
        isDragging = false;
        card.style.transform = '';
    });
}

async function handleSwipeRelease(card, movie, deltaX) {
    if (deltaX > 100) {
        // Swipe right - add to favorites
        addToFavorites(movie);
        card.remove();
    } else if (deltaX < -100) {
        // Swipe left - remove and hide similar
        removeSimilarMovies(movie);
        card.remove();
    } else {
        card.style.transform = '';
    }
}

function addToFavorites(movie) {
    if (!state.favorites.some(f => f.id === movie.id)) {
        state.favorites.push(movie);
        localStorage.setItem('favorites', JSON.stringify(state.favorites));
        renderFavorites();
        showToast(`Added "${movie.title}" to favorites!`);
    }
}

function removeFromFavorites(movieId) {
    state.favorites = state.favorites.filter(f => f.id !== movieId);
    localStorage.setItem('favorites', JSON.stringify(state.favorites));
    renderFavorites();
    showToast('Removed from favorites');
}

function renderFavorites() {
    elements.favsList.innerHTML = '';
    state.favorites.forEach(movie => {
        const li = document.createElement('li');
        li.innerHTML = `
            <span>${movie.title}</span>
            <button onclick="removeFromFavorites(${movie.id})">
                <i class="fas fa-times"></i>
            </button>
        `;
        elements.favsList.appendChild(li);
    });
}

async function removeSimilarMovies(movie) {
    try {
        const similar = await fetchFromTMDB(`/movie/${movie.id}/similar`);
        const similarIds = similar.results.map(m => m.id);
        
        // Remove similar movies from DOM
        similarIds.forEach(id => {
            const card = document.querySelector(`.card[data-movie-id="${id}"]`);
            if (card) card.remove();
        });
        
        showToast(`Removed "${movie.title}" and similar movies`);
    } catch (error) {
        console.error('Error fetching similar movies:', error);
    }
}

async function recommendMovies() {
    const genre = elements.genreSelect.value;
    if (!genre || !state.diceValue) {
        showToast('Please roll the dice and select a genre', 'error');
        return;
    }
    
    setLoading(elements.recCard, true);
    setLoading(elements.cardsContainer, true);
    
    try {
        const response = await fetchFromTMDB('/discover/movie', {
            with_genres: genre,
            sort_by: 'vote_average.desc',
            'vote_count.gte': 100,
            page: 1
        });
        
        state.movies = response.results;
        
        if (state.movies.length === 0) {
            showToast('No movies found for this genre', 'error');
            return;
        }
        
        // Use dice value to pick recommended movie
        const recommendedIndex = (state.diceValue - 1) % state.movies.length;
        const recommended = state.movies[recommendedIndex];
        
        // Fetch full details for recommended movie
        const recommendedDetails = await getMovieDetails(recommended.id);
        elements.recCard.innerHTML = '';
        elements.recCard.appendChild(renderMovieCard({...recommended, ...recommendedDetails}, true));
        
        // Render other movies
        const cardsRow = elements.cardsContainer.querySelector('.cards-row');
        cardsRow.innerHTML = '';
        const otherMovies = state.movies.filter((_, idx) => idx !== recommendedIndex);
        
        for (const movie of otherMovies.slice(0, 10)) {
            const details = await getMovieDetails(movie.id);
            cardsRow.appendChild(renderMovieCard({...movie, ...details}));
        }
        
    } catch (error) {
        console.error('Error recommending movies:', error);
        showToast('Failed to load movies. Please try again.', 'error');
    } finally {
        setLoading(elements.recCard, false);
        setLoading(elements.cardsContainer, false);
    }
}

// Event Listeners
elements.diceBtn.addEventListener('click', () => {
    state.diceValue = Math.floor(Math.random() * 6) + 1;
    elements.diceVal.textContent = state.diceValue;
    elements.diceVal.classList.add('fade-in');
    setTimeout(() => elements.diceVal.classList.remove('fade-in'), 500);
});

elements.goBtn.addEventListener('click', recommendMovies);

// Initialize
renderFavorites();