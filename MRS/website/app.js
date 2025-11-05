// State management
const state = {
    currentGenre: null,
    diceValue: 1,
    movies: [],
    favorites: [],
    undoStack: [] // store arrays of removed cards for undo
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
    // support message with undo callback: {text, undo}
    if (typeof message === 'object' && message !== null) {
        const { text, undo } = message;
        toast.innerHTML = `<span>${text}</span>`;
        if (undo) {
            const btn = document.createElement('button');
            btn.textContent = 'Undo';
            btn.style.marginLeft = '12px';
            btn.onclick = () => { undo(); toast.style.display = 'none'; };
            toast.appendChild(btn);
        }
    } else {
        toast.textContent = message;
    }
    toast.className = `toast ${type}`;
    toast.style.display = 'flex';
    // hide automatically after 5s unless undo provided
    if (!(typeof message === 'object' && message !== null && message.undo)) {
        setTimeout(() => { toast.style.display = 'none'; }, 5000);
    }
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
    try{ card.dataset.movieJson = JSON.stringify(movie); }catch(e){}
    
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
        // animate off-screen if threshold passed
        handleSwipeRelease(card, movie, currentX);
    });
    
    card.addEventListener('pointercancel', () => {
        isDragging = false;
        card.style.transform = '';
    });
}

async function handleSwipeRelease(card, movie, deltaX) {
    const cardsRow = elements.cardsContainer.querySelector('.cards-row');
    if (deltaX > 100) {
        // Swipe right - animate right then add to favorites
        card.style.transition = 'transform 300ms ease-out, opacity 300ms';
        card.style.transform = 'translateX(120%) rotate(20deg)';
        card.style.opacity = '0';
        card.addEventListener('transitionend', () => {
            try { addToFavorites(movie); } catch(e){}
            card.remove();
        }, { once: true });
    } else if (deltaX < -100) {
        // Swipe left - animate left then remove and request similar
        card.style.transition = 'transform 300ms ease-out, opacity 300ms';
        card.style.transform = 'translateX(-120%) rotate(-20deg)';
        card.style.opacity = '0';
        card.addEventListener('transitionend', async () => {
            // collect removed items for undo
            const removed = [];
            // include the swiped movie
            removed.push(movie);
            // request similar from backend
            try {
                const res = await fetch(`${config.apiBase}/similar`, {
                    method: 'POST', headers: {'Content-Type':'application/json'},
                    body: JSON.stringify({ movie_id: movie.id, genre_id: elements.genreSelect.value, threshold: 0.35 })
                });
                const data = await res.json();
                const toRemove = data.removed || [];
                toRemove.forEach(r => {
                    const c = document.querySelector(`.card[data-movie-id="${r.id}"]`);
                    if (c) {
                        try{ removed.push(JSON.parse(c.dataset.movieJson)); }catch(e){}
                        c.remove();
                    }
                });
            } catch (err) {
                console.warn('similar api failed', err);
            }
            // push to undo stack and show undo toast
            state.undoStack.push(removed);
            showToast({ text: `Removed "${movie.title}" and similar`, undo: () => {
                const items = state.undoStack.pop();
                if (!items) return;
                const row = elements.cardsContainer.querySelector('.cards-row');
                items.forEach(it => { row.insertAdjacentElement('afterbegin', renderMovieCard(it)); });
            }}, 'info');
            card.remove();
        }, { once: true });
    } else {
        card.style.transform = '';
    }
}

async function addToFavorites(movie) {
    try {
        const res = await fetch(`${config.apiBase}/favorites`, {
            method: 'POST', headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({ tmdb_id: movie.id, title: movie.title, poster_path: movie.poster_path, streaming_link: '' })
        });
        const data = await res.json();
        // reload favorites from server
        await loadFavoritesFromServer();
        showToast(`Added "${movie.title}" to favorites!`);
    } catch (err) {
        console.error('Failed to add favorite', err);
        showToast('Failed to add favorite', 'error');
    }
}

async function removeFromFavorites(movieId) {
    try {
        await fetch(`${config.apiBase}/favorites/${movieId}`, { method: 'DELETE' });
        await loadFavoritesFromServer();
        showToast('Removed from favorites');
    } catch (err) {
        console.error('Failed to remove favorite', err);
        showToast('Failed to remove favorite', 'error');
    }
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

async function loadFavoritesFromServer() {
    try {
        const res = await fetch(`${config.apiBase}/favorites`);
        const data = await res.json();
        state.favorites = (data.favorites || []).map(f => ({ id: f.id, tmdb_id: f.tmdb_id, title: f.title, poster_path: f.poster_path }));
        renderFavorites();
    } catch (err) {
        console.warn('Failed to load favorites from server, falling back to empty', err);
        state.favorites = [];
        renderFavorites();
    }
}

async function removeSimilarMovies(movie) {
    // This function is now handled by the server call in handleSwipeRelease
    return;
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
loadFavoritesFromServer();