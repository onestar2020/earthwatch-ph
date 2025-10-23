// --- Telegram & OWM Keys ---
const TELEGRAM_BOT_TOKEN = '7823356722:AAHjlLaea-8Dz1x_OYYiRZWscQp9MFp-Ogs';
const TELEGRAM_CHAT_ID = '@EarthWatchAlertsPH';
const OPENWEATHER_API_KEY = 'f59ff0b9ad2a8a41b031a90ba2107b20';
// ------------------------------------------------

// --- Map Initialization (with layers) ---
const osmMap = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '© OSM contributors' });
const satelliteMap = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', { maxZoom: 19, attribution: '© Esri' });
const cloudsLayer = L.tileLayer(`https://tile.openweathermap.org/map/clouds_new/{z}/{x}/{y}.png?appid=${OPENWEATHER_API_KEY}`, { attribution: '© OWM', opacity: 0.7 });
const precipitationLayer = L.tileLayer(`https://tile.openweathermap.org/map/precipitation_new/{z}/{x}/{y}.png?appid=${OPENWEATHER_API_KEY}`, { attribution: '© OWM', opacity: 0.7 });
const tempLayer = L.tileLayer(`https://tile.openweathermap.org/map/temp_new/{z}/{x}/{y}.png?appid=${OPENWEATHER_API_KEY}`, { attribution: '© OWM', opacity: 0.6 });
const windLayer = L.tileLayer(`https://tile.openweathermap.org/map/wind_new/{z}/{x}/{y}.png?appid=${OPENWEATHER_API_KEY}`, { attribution: '© OWM', opacity: 0.6 });

const map = L.map('map', { center: [12.8797, 121.7740], zoom: 6, layers: [osmMap] });
const baseMaps = { "Street Map": osmMap, "Satellite": satelliteMap };
const overlayMaps = { "Clouds": cloudsLayer, "Precipitation": precipitationLayer, "Temperature": tempLayer, "Wind": windLayer };
L.control.layers(baseMaps, overlayMaps, { collapsed: true }).addTo(map); // Changed to collapsed: true
// --- End Map Init ---

const earthquakeLayer = L.layerGroup().addTo(map);
let userMarker = null;
let userRadiusCircle = null;
let currentCoords = null;
let gpsWatcherId = null;
let weatherIntervalId = null;
let tempLocationMarker = null;

// --- State Management ---
let notifiedEarthquakeIds = new Set();
let notifiedTelegramAlerts = new Set();
let loggedHistoryAlerts = new Set();

// --- 1. Initialization ---
document.addEventListener('DOMContentLoaded', () => {
    loadSettingsToUI();
    initializeLocation();
    setupEventListeners();
    setupMapClickListener();
    fetchEarthquakes();
    setInterval(fetchEarthquakes, 60000);
});

function setupEventListeners() {
    const followBtn = document.getElementById('follow-me-btn');
    const centerBtn = document.getElementById('center-map-btn');
    const setManualBtn = document.getElementById('set-manual-location-btn');
    const manualInput = document.getElementById('manual-location-input');

    followBtn?.addEventListener('click', startGpsTracking);
    centerBtn?.addEventListener('click', centerMapOnCurrentLocation);
    setManualBtn?.addEventListener('click', () => {
        const cityName = manualInput.value.trim();
        if (cityName) { geocodeCityAndSetManual(cityName); }
        else { showManualStatus('Please enter a city name.'); }
    });
    manualInput?.addEventListener('keypress', (e) => { if (e.key === 'Enter') setManualBtn.click(); });
}

function setupMapClickListener() {
    map.on('click', handleMapClick);
    console.log("Map click listener added.");
}

function handleMapClick(e) {
    const clickedLat = e.latlng.lat;
    const clickedLon = e.latlng.lng;
    if (tempLocationMarker) { map.removeLayer(tempLocationMarker); }
    tempLocationMarker = L.marker([clickedLat, clickedLon]).addTo(map);
    const popupContent = `<div>Lat: ${clickedLat.toFixed(4)}, Lon: ${clickedLon.toFixed(4)}<br><button id="set-loc-btn-${Date.now()}">Set This as Manual Location</button></div>`;
    tempLocationMarker.bindPopup(popupContent, { className: 'map-click-popup' }).openPopup();
    map.once('popupopen', (ev) => {
        const setButton = ev.popup.getElement()?.querySelector('button');
        if (setButton) {
            setButton.onclick = () => {
                const manualRadio = document.getElementById('useManual');
                if (manualRadio && !manualRadio.checked) {
                     manualRadio.checked = true; manualRadio.dispatchEvent(new Event('change'));
                }
                reverseGeocodeAndSetManual(clickedLat, clickedLon);
                map.closePopup(); // Close popup after button click
                // Temp marker is removed inside setManualLocation
            };
        }
    });
}

function initializeLocation() {
    const settings = getSettings();
    const centerBtn = document.getElementById('center-map-btn');
    const weatherFeed = document.getElementById('weather-feed');
    stopGpsTracking(); clearWeatherInterval();
    if (tempLocationMarker) { map.removeLayer(tempLocationMarker); tempLocationMarker = null;}

    if (settings.locationMode === 'gps') {
        showGpsStatus('Click "Follow My Location" button');
        currentCoords = null; updateMapMarker(null);
        if(centerBtn) centerBtn.disabled = true;
        if(weatherFeed) weatherFeed.innerHTML = '<h2>Local Weather</h2><p>Click "Follow My Location" to load weather.</p>';
    } else { // Manual mode
        if (settings.manualLat !== null && settings.manualLon !== null) {
            currentCoords = { lat: settings.manualLat, lon: settings.manualLon };
            showManualStatus(`Using: ${settings.manualLocationName}`);
            updateMapMarker(currentCoords.lat, currentCoords.lon, settings.manualLocationName || "Manual Location");
            centerMapOnCurrentLocation(); // Centers map (uses new zoom)
            fetchWeather(currentCoords.lat, currentCoords.lon);
            startWeatherInterval();
            if(centerBtn) centerBtn.disabled = false;
        } else {
            showManualStatus('No manual location set. Enter city or click map.');
            currentCoords = null; updateMapMarker(null);
            if(centerBtn) centerBtn.disabled = true;
             if(weatherFeed) weatherFeed.innerHTML = '<h2>Local Weather</h2><p>Set manual location to load weather.</p>';
        }
    }
}


function startGpsTracking() {
    const followBtn = document.getElementById('follow-me-btn');
    const centerBtn = document.getElementById('center-map-btn');
    const statusEl = document.getElementById('location-status');

    if (!navigator.geolocation) { showGpsStatus('Geolocation is not supported.'); return; }
    if (tempLocationMarker) { map.removeLayer(tempLocationMarker); tempLocationMarker = null;}
    Notification.requestPermission();
    showGpsStatus('Locating...');
    if(followBtn) followBtn.disabled = true; if(followBtn) followBtn.textContent = 'Tracking GPS...';
    if(centerBtn) centerBtn.disabled = true; clearWeatherInterval();

    // Use getCurrentPosition for one-time fetch, watchPosition for continuous
    // Let's stick to watchPosition for now as it handles updates
    gpsWatcherId = navigator.geolocation.watchPosition(
        (position) => {
            const lat = position.coords.latitude; const lon = position.coords.longitude;
            const accuracy = position.coords.accuracy;
            if (getSettings().locationMode === 'gps') {
                 showGpsStatus(`GPS Location found (accuracy: ${accuracy.toFixed(0)}m)`);
                 currentCoords = { lat, lon };
                 if(centerBtn) centerBtn.disabled = false;
                 updateMapMarker(lat, lon, "Your Location (GPS)");
                 fetchWeather(lat, lon);
                 startWeatherInterval(); // Start interval only after getting first coords
                  // Center map on first GPS fix with closer zoom
                 if (!map.hasLayer(userMarker) || !map.getBounds().contains([lat, lon])) { // Center if marker is new or outside view
                    map.setView([lat, lon], 14); // Use closer zoom for GPS too
                 }
            } else { stopGpsTracking(); }
        },
        () => {
             if (getSettings().locationMode === 'gps') {
                showGpsStatus('Unable to retrieve GPS location.');
                if(followBtn) followBtn.disabled = false; if(followBtn) followBtn.textContent = 'Follow My Location (GPS)';
                if(centerBtn) centerBtn.disabled = true;
                currentCoords = null; updateMapMarker(null); clearWeatherInterval();
             }
        }, { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 } // Added timeout and maximumAge
    );
}

function stopGpsTracking() {
    if (gpsWatcherId !== null) {
        navigator.geolocation.clearWatch(gpsWatcherId);
        gpsWatcherId = null; console.log("Stopped GPS tracking.");
        const followBtn = document.getElementById('follow-me-btn');
         if(followBtn) {
            followBtn.disabled = false;
            followBtn.textContent = 'Follow My Location (GPS)';
         }
         // Optional: Clear GPS status message when stopped?
         // showGpsStatus('');
    }
}

function startWeatherInterval() {
    clearWeatherInterval();
    weatherIntervalId = setInterval(() => {
        if (currentCoords) { fetchWeather(currentCoords.lat, currentCoords.lon); }
        else { console.log("Skipping weather: no coords."); }
    }, 300000); // 5 minutes
    console.log("Started weather interval.");
}

function clearWeatherInterval() {
    if (weatherIntervalId !== null) {
        clearInterval(weatherIntervalId);
        weatherIntervalId = null; console.log("Cleared weather interval.");
    }
}

// Geocode City Name -> Lat/Lon
function geocodeCityAndSetManual(cityName) {
    const geocodeUrl = `https://api.openweathermap.org/geo/1.0/direct?q=${encodeURIComponent(cityName)},PH&limit=1&appid=${OPENWEATHER_API_KEY}`;
    const setManualBtn = document.getElementById('set-manual-location-btn');
    showManualStatus('Searching...');
    if(setManualBtn) setManualBtn.disabled = true;

    fetch(geocodeUrl)
        .then(response => { if (!response.ok) throw new Error(`HTTP ${response.status}`); return response.json(); })
        .then(data => {
            if (data && data.length > 0) {
                const { lat, lon, local_names, name, state } = data[0];
                const displayName = local_names?.en || name + (state ? `, ${state}` : '');
                setManualLocation(lat, lon, displayName);
            } else {
                 showManualStatus('City not found in PH. Try format "City, Province" or click map.');
                 document.getElementById('center-map-btn').disabled = true;
            }
        })
        .catch(error => { console.error('Geocoding error:', error); showManualStatus('Error finding city.'); document.getElementById('center-map-btn').disabled = true; })
        .finally(() => { if(setManualBtn) setManualBtn.disabled = false; });
}

// Reverse Geocode Lat/Lon -> City Name
function reverseGeocodeAndSetManual(lat, lon) {
    const reverseGeocodeUrl = `https://api.openweathermap.org/geo/1.0/reverse?lat=${lat}&lon=${lon}&limit=1&appid=${OPENWEATHER_API_KEY}`;
    showManualStatus('Getting location name...');

    fetch(reverseGeocodeUrl)
        .then(response => { if (!response.ok) throw new Error(`HTTP ${response.status}`); return response.json(); })
        .then(data => {
            let name = `Lat: ${lat.toFixed(4)}, Lon: ${lon.toFixed(4)}`;
            if (data && data.length > 0) {
                const { name: cityName, state, country } = data[0];
                 name = cityName + (state ? `, ${state}` : '') + (country ? `, ${country}`: '');
            }
             setManualLocation(lat, lon, name);
        })
        .catch(error => {
            console.error('Reverse geocoding error:', error);
            showManualStatus('Error getting name. Set with coordinates.');
             setManualLocation(lat, lon, `Lat: ${lat.toFixed(4)}, Lon: ${lon.toFixed(4)}`);
        });
}

// Common logic to set manual location
function setManualLocation(lat, lon, name) {
    const inputEl = document.getElementById('manual-location-input');
    const centerBtn = document.getElementById('center-map-btn');
    let settings = getSettings();
    settings.manualLat = lat; settings.manualLon = lon; settings.manualLocationName = name;
    saveAllSettings(settings);
    currentCoords = { lat, lon };
    showManualStatus(`Location set: ${name}`);
    if(inputEl) inputEl.value = name; if(inputEl) inputEl.placeholder = name;
    updateMapMarker(lat, lon, name);
    centerMapOnCurrentLocation(); // Uses new zoom
    fetchWeather(lat, lon);
    startWeatherInterval();
    if(centerBtn) centerBtn.disabled = false;
    if (tempLocationMarker) { map.removeLayer(tempLocationMarker); tempLocationMarker = null; }
}


function updateMapMarker(lat, lon, popupText = "Current Location") {
     if (userMarker) { map.removeLayer(userMarker); userMarker = null; }
     if (userRadiusCircle) { map.removeLayer(userRadiusCircle); userRadiusCircle = null; }
    if (lat !== null && lon !== null && typeof lat === 'number' && typeof lon === 'number') {
        userMarker = L.marker([lat, lon]).addTo(map).bindPopup(popupText);
        userRadiusCircle = L.circle([lat, lon], { radius: DEFAULT_SETTINGS.alertRadius * 1000, color: '#007bff', fillColor: '#007bff', fillOpacity: 0.1, weight: 1 }).addTo(map);
    }
}

// UPDATED ZOOM LEVEL
function centerMapOnCurrentLocation() {
    if (currentCoords) {
        map.setView([currentCoords.lat, currentCoords.lon], 14); // Zoom level 14
    } else {
        map.setView([12.8797, 121.7740], 6); // Default PH view
    }
}

function showGpsStatus(message) { const el = document.getElementById('location-status'); if (el) el.textContent = message; }
function showManualStatus(message) { const el = document.getElementById('manual-location-status'); if (el) el.textContent = message; }


// --- 2. Weather Fetch (Uses currentCoords) ---
function fetchWeather(lat, lon) {
    if (typeof lat !== 'number' || typeof lon !== 'number') { console.error("Invalid coords for fetchWeather:", lat, lon); return; }
    const weatherFeed = document.getElementById('weather-feed');
    const settings = getSettings();
    const weatherUrl = `https://api.openweathermap.org/data/2.5/weather?lat=${lat}&lon=${lon}&appid=${OPENWEATHER_API_KEY}&units=metric`;
    fetch(weatherUrl)
        .then(response => response.json())
        .then(data => {
            if (!weatherFeed) return;
            if (data.cod === 200) {
                const { temp, humidity } = data.main;
                const { description, icon, main: mainCondition } = data.weather[0];
                const { speed: windSpeed } = data.wind;
                const name = data.name;
                const weatherHtml = `<h2>Weather in ${name}</h2> <img src="https://openweathermap.org/img/wn/${icon}.png" alt="${description}"> <p><strong>${temp.toFixed(1)}°C</strong></p> <p>Condition: ${description}</p> <p>Humidity: ${humidity}%</p> <p>Wind: ${windSpeed.toFixed(1)} m/s</p>`;
                weatherFeed.innerHTML = weatherHtml;
                if (settings.alertStorm) {
                    let stormDetected = false; let stormMessage = "";
                    const alertId = `storm-${Math.floor(data.dt / 3600)}`;
                    if (mainCondition === "Thunderstorm") { stormDetected = true; stormMessage = `⛈️ Storm Alert: Thunderstorm detected in your area (${name}).`; }
                    else if (windSpeed > 17) { stormDetected = true; stormMessage = `💨 Storm Alert: Strong winds (${windSpeed.toFixed(1)} m/s) detected in your area (${name}). Possible storm conditions.`; }
                    if (stormDetected) { sendBrowserNotification('Potential Storm Condition!', stormMessage, alertId); sendTelegramAlert(stormMessage, alertId); }
                }
            } else { weatherFeed.innerHTML = `<h2>Local Weather</h2><p>Error: ${data.message}</p>`; }
        })
        .catch(error => { console.error('Error fetching weather:', error); if(weatherFeed) weatherFeed.innerHTML = '<h2>Local Weather</h2><p>Failed to load weather data.</p>'; });
}

// --- 3. Earthquake Fetch (Uses currentCoords for Alerts) ---
function fetchEarthquakes() {
    const quakeFeed = document.getElementById('earthquake-feed')?.querySelector('ul');
    const settings = getSettings();
    const usgsUrl = 'https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/4.5_day.geojson';
    fetch(usgsUrl)
        .then(response => response.json())
        .then(data => {
            if (!quakeFeed) return;
            quakeFeed.innerHTML = ''; earthquakeLayer.clearLayers();
            const features = data.features;
            if (features.length === 0) { quakeFeed.innerHTML = '<li>No significant earthquakes (M4.5+) globally in the past 24 hours.</li>'; return; }
            features.forEach(quake => {
                const { mag, place, time } = quake.properties;
                const [quakeLon, quakeLat] = quake.geometry.coordinates;
                const magnitude = mag.toFixed(1); const location = place || 'Unknown';
                const quakeTime = new Date(time).toLocaleString(); const quakeId = quake.id;
                const listItem = document.createElement('li');
                listItem.innerHTML = `<strong>M ${magnitude}</strong> - ${location}<br><small>${quakeTime}</small>`;
                quakeFeed.appendChild(listItem);
                const marker = L.circleMarker([quakeLat, quakeLon], { radius: magnitude * 1.5, color: 'red', fillColor: '#f03', fillOpacity: 0.5 }).addTo(earthquakeLayer);
                marker.bindPopup(`<strong>M ${magnitude}</strong><br>${location}<br>${quakeTime}`);
                if (settings.alertQuakes && currentCoords && typeof mag === 'number' && mag >= 5.0) {
                    const userLat = currentCoords.lat; const userLon = currentCoords.lon;
                    if (typeof quakeLat === 'number' && typeof quakeLon === 'number') {
                         const distance = getDistance(userLat, userLon, quakeLat, quakeLon);
                        if (distance !== null && distance <= settings.alertRadius) {
                            const message = `⚠️ Nearby Earthquake Alert: Magnitude ${magnitude} (${location}), ${distance.toFixed(0)} km away from you.`;
                            sendBrowserNotification('Nearby Earthquake!', message, quakeId); sendTelegramAlert(message, quakeId);
                        }
                    }
                }
            });
        })
        .catch(error => { console.error('Error fetching earthquakes:', error); if (quakeFeed) quakeFeed.innerHTML = '<li>Failed to load earthquake data.</li>'; });
}

// --- 4. Utility Functions ---
function logAutoAlertToHistory(type, sentVia, message, uniqueId) { if (loggedHistoryAlerts.has(uniqueId + '-' + sentVia)) { return; } const historyKey = 'earthWatchAlertHistory'; let history = localStorage.getItem(historyKey); history = history ? JSON.parse(history) : []; const logEntry = { timestamp: Date.now(), type: type, sentVia: sentVia, message: message.substring(0, 200) + (message.length > 200 ? '...' : '') }; history.push(logEntry); if (history.length > 100) { history = history.slice(history.length - 100); } localStorage.setItem(historyKey, JSON.stringify(history)); loggedHistoryAlerts.add(uniqueId + '-' + sentVia); console.log("Auto alert logged:", logEntry); }
function sendBrowserNotification(title, body, notificationId) { if (notifiedEarthquakeIds.has(notificationId)) { return; } if (Notification.permission === 'granted') { const notification = new Notification(title, { body: body }); const alertType = title.includes('Quake') ? 'Auto Quake' : 'Auto Storm'; logAutoAlertToHistory(alertType, 'Browser', body, notificationId); notifiedEarthquakeIds.add(notificationId); } }
function sendTelegramAlert(originalMessage, alertId) { if (notifiedTelegramAlerts.has(alertId)) { return; } const fullMessage = `🚨 EARTHWATCH PH (AUTO-ALERT) 🚨\n\n${originalMessage}`; const url = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`; const params = { chat_id: TELEGRAM_CHAT_ID, text: fullMessage }; fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(params) }).then(response => response.json()).then(data => { if (data.ok) { console.log('Telegram auto-alert sent!'); const alertType = originalMessage.includes('Quake') ? 'Auto Quake' : 'Auto Storm'; logAutoAlertToHistory(alertType, 'Telegram', originalMessage, alertId); notifiedTelegramAlerts.add(alertId); } else { console.error('Telegram auto-alert error:', data); } }).catch(error => { console.error('Fetch error (Telegram Send):', error); }); }
function getDistance(lat1, lon1, lat2, lon2) { if (typeof lat1 !== 'number' || typeof lon1 !== 'number' || typeof lat2 !== 'number' || typeof lon2 !== 'number') { return null; } const R = 6371; const dLat = deg2rad(lat2 - lat1); const dLon = deg2rad(lon2 - lon1); const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) + Math.cos(deg2rad(lat1)) * Math.cos(deg2rad(lat2)) * Math.sin(dLon / 2) * Math.sin(dLon / 2); const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)); const d = R * c; return d; }
function deg2rad(deg) { return deg * (Math.PI / 180); }