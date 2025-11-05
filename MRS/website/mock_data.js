// Small mock dataset to run the site offline. Posters use placeholder URLs.
window.MOCK_MOVIES = [
  {
    id: 100001,
    title: 'The Quiet Storm',
    poster_path: '/q1.jpg',
    vote_average: 7.8,
    overview: 'A moving drama about unexpected friendship and second chances.',
    providers: []
  },
  {
    id: 100002,
    title: 'Midnight Heist',
    poster_path: '/q2.jpg',
    vote_average: 8.1,
    overview: 'A slick thriller following a crew planning the perfect robbery.',
    providers: []
  },
  {
    id: 100003,
    title: 'Lost in Aurora',
    poster_path: '/q3.jpg',
    vote_average: 7.4,
    overview: 'A sci-fi adventure across dazzling landscapes and inner journeys.',
    providers: []
  },
  {
    id: 100004,
    title: 'The Last Comedy Club',
    poster_path: '/q4.jpg',
    vote_average: 7.0,
    overview: 'An ensemble comedy about reclaiming joy in a changing city.',
    providers: []
  },
  {
    id: 100005,
    title: 'Shadows of Winter',
    poster_path: '/q5.jpg',
    vote_average: 8.4,
    overview: 'A dark mystery that unravels secrets in a snowbound town.',
    providers: []
  }
];

// Provide placeholder images mapping (local files not included). Use via config.imageBaseUrl + poster_path