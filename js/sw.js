// sw.js - Basic Service Worker for Caching

const CACHE_NAME = 'earthwatch-ph-cache-v1';
// Listahan ng mga files na i-ca-cache natin
const urlsToCache = [
  '/', // Cache the root URL
  '/index.html',
  '/history.html', // Cache history page too
  '/css/main.css',
  '/js/app.js',
  '/js/settings.js',
  '/js/history.js',
  'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css', // Cache Leaflet CSS
  'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js', // Cache Leaflet JS
  // --- MAHALAGA: Idagdag dito ang path papunta sa mga icons mo ---
  '/images/icons/icon-192x192.png',
  '/images/icons/icon-512x512.png'
  // Pwede mo ring idagdag ang OpenStreetMap tiles kung gusto mo, pero baka lumaki ang cache
];

// Install event: Cache the core files
self.addEventListener('install', event => {
  console.log('[Service Worker] Install');
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => {
        console.log('[Service Worker] Caching app shell');
        return cache.addAll(urlsToCache);
      })
      .catch(error => {
          console.error('[Service Worker] Failed to cache app shell:', error);
      })
  );
});

// Activate event: Clean up old caches if any
self.addEventListener('activate', event => {
  console.log('[Service Worker] Activate');
  const cacheWhitelist = [CACHE_NAME]; // Only keep the current cache
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames.map(cacheName => {
          if (cacheWhitelist.indexOf(cacheName) === -1) {
            console.log('[Service Worker] Deleting old cache:', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    })
  );
  return self.clients.claim(); // Take control of pages immediately
});

// Fetch event: Serve cached content when offline
self.addEventListener('fetch', event => {
    // console.log('[Service Worker] Fetching:', event.request.url);
  event.respondWith(
    caches.match(event.request)
      .then(response => {
        // Cache hit - return response from cache
        if (response) {
          // console.log('[Service Worker] Returning from cache:', event.request.url);
          return response;
        }

        // Not in cache - fetch from network
        // console.log('[Service Worker] Fetching from network:', event.request.url);
        return fetch(event.request).then(
          function(networkResponse) {
            // IMPORTANT: Check if the request is for an API (OpenWeatherMap, USGS)
            // We usually DON'T want to cache API responses with this basic strategy
            // because we need live data.
            if (event.request.url.includes('api.openweathermap.org') || event.request.url.includes('earthquake.usgs.gov')) {
                 // console.log('[Service Worker] Not caching API request:', event.request.url);
                return networkResponse; // Return network response directly for APIs
            }

            // For non-API requests, try to cache them dynamically (optional)
            // Cloning the response is necessary because response streams can only be consumed once.
             let responseToCache = networkResponse.clone();
             caches.open(CACHE_NAME)
               .then(function(cache) {
                 // console.log('[Service Worker] Caching new resource:', event.request.url);
                 // Be careful caching EVERYTHING dynamically, cache storage has limits.
                 // cache.put(event.request, responseToCache);
               });


            return networkResponse;
          }
        ).catch(error => {
            console.error('[Service Worker] Fetch failed:', error);
            // Optional: Return a fallback offline page here if fetch fails
            // return caches.match('/offline.html');
        });
      })
    );
});