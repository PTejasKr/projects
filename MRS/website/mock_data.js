// Small mock dataset to run the site offline. Posters use placeholder URLs.
window.MOCK_MOVIES = [
  {
    id: 100001,
    title: 'The Quiet Storm',
    poster_path: 'https://picsum.photos/500/750?random=1',
    vote_average: 7.8,
    overview: 'A moving drama about unexpected friendship and second chances.',
    genre_ids: [18, 10749], // Drama, Romance
    providers: [
      { provider_name: 'Netflix', link: 'https://www.netflix.com' },
      { provider_name: 'Prime Video', link: 'https://www.amazon.com/Prime-Video' }
    ],
    streaming_services: {
      'Netflix': 'https://www.netflix.com',
      'Prime Video': 'https://www.amazon.com/Prime-Video'
    }
  },
  {
    id: 100002,
    title: 'Midnight Heist',
    poster_path: 'https://picsum.photos/500/750?random=2',
    vote_average: 8.1,
    overview: 'A slick thriller following a crew planning the perfect robbery.',
    genre_ids: [28, 53], // Action, Thriller
    providers: [
      { provider_name: 'Hulu', link: 'https://www.hulu.com' }
    ],
    streaming_services: {
      'Hulu': 'https://www.hulu.com'
    }
  },
  {
    id: 100003,
    title: 'Lost in Aurora',
    poster_path: 'https://picsum.photos/500/750?random=3',
    vote_average: 7.4,
    overview: 'A sci-fi adventure across dazzling landscapes and inner journeys.',
    genre_ids: [878, 12], // Sci-Fi, Adventure
    providers: [
      { provider_name: 'Disney+', link: 'https://www.disneyplus.com' }
    ],
    streaming_services: {
      'Disney+': 'https://www.disneyplus.com'
    }
  },
  {
    id: 100004,
    title: 'The Last Comedy Club',
    poster_path: 'https://picsum.photos/500/750?random=4',
    vote_average: 7.0,
    overview: 'An ensemble comedy about reclaiming joy in a changing city.',
    genre_ids: [35], // Comedy
    providers: [
      { provider_name: 'HBO Max', link: 'https://www.max.com' }
    ],
    streaming_services: {
      'HBO Max': 'https://www.max.com'
    }
  },
  {
    id: 100005,
    title: 'Shadows of Winter',
    poster_path: 'https://picsum.photos/500/750?random=5',
    vote_average: 8.4,
    overview: 'A dark mystery that unravels secrets in a snowbound town.',
    genre_ids: [53, 9648], // Thriller, Mystery
    providers: [
      { provider_name: 'Prime Video', link: 'https://www.amazon.com/Prime-Video' },
      { provider_name: 'Paramount+', link: 'https://www.paramountplus.com' }
    ],
    streaming_services: {
      'Prime Video': 'https://www.amazon.com/Prime-Video',
      'Paramount+': 'https://www.paramountplus.com'
    }
  }
];

// Provide placeholder images mapping (local files not included). Use via config.imageBaseUrl + poster_path