// js/settings.js (Version with Manual Location)

// Ito ang default settings
const DEFAULT_SETTINGS = {
    alertQuakes: true,
    alertStorm: true,
    alertRadius: 150, // km
    locationMode: 'gps', // 'gps' or 'manual'
    manualLocationName: '',
    manualLat: null,
    manualLon: null
};

// Function para kunin ang settings mula sa localStorage
function getSettings() {
    let settings = localStorage.getItem('earthWatchSettings');
    let loadedSettings = settings ? JSON.parse(settings) : {};
    // Merge defaults with loaded settings to ensure all keys exist
    return { ...DEFAULT_SETTINGS, ...loadedSettings };
}

// Function para i-save ang isang setting
function saveSetting(key, value) {
    let settings = getSettings();
    settings[key] = value;
    localStorage.setItem('earthWatchSettings', JSON.stringify(settings));
    console.log(`Setting saved: ${key} =`, value);
}

// Function para i-save ang lahat ng settings (useful for manual location)
function saveAllSettings(settingsObject) {
     localStorage.setItem('earthWatchSettings', JSON.stringify(settingsObject));
     console.log("All settings saved:", settingsObject);
}


// Function para i-load ang settings sa UI (checkboxes AND radio buttons)
function loadSettingsToUI() {
    const settings = getSettings();

    // Load Checkbox settings
    document.querySelectorAll('#settings-panel input[type="checkbox"][data-setting]').forEach(checkbox => {
        const key = checkbox.dataset.setting;
        if (settings[key] !== undefined) {
            checkbox.checked = settings[key];
        }
        checkbox.addEventListener('change', (e) => {
            saveSetting(key, e.target.checked);
        });
    });

    // Load Radio button settings (Location Mode)
    const locationMode = settings.locationMode || 'gps';
    const radioToCheck = document.getElementById(locationMode === 'gps' ? 'useGps' : 'useManual');
    if (radioToCheck) {
        radioToCheck.checked = true;
    }
    // Update visibility based on initial load
    toggleLocationControls(locationMode);

    document.querySelectorAll('input[name="locationSource"]').forEach(radio => {
        radio.addEventListener('change', (e) => {
            const newMode = e.target.value;
            saveSetting('locationMode', newMode);
            toggleLocationControls(newMode);
            // Tell app.js to re-evaluate location
             if (typeof initializeLocation === 'function') {
                 initializeLocation();
             }
        });
    });

    // Display saved manual location name in input field or placeholder
    const manualInput = document.getElementById('manual-location-input');
    if (settings.manualLocationName && manualInput) {
         manualInput.value = settings.manualLocationName; // Pre-fill input if name exists
         manualInput.placeholder = settings.manualLocationName; // Show as placeholder too
         const statusEl = document.getElementById('manual-location-status');
         if (statusEl) statusEl.textContent = `Current: ${settings.manualLocationName}`;
    } else if (manualInput) {
        manualInput.placeholder = 'City, PH'; // Default placeholder
    }
}

// Function to show/hide GPS or Manual controls
function toggleLocationControls(mode) {
    const gpsControls = document.getElementById('gps-controls');
    const manualControls = document.getElementById('manual-location-controls');
    if (gpsControls && manualControls) {
        if (mode === 'gps') {
            gpsControls.style.display = 'block';
            manualControls.style.display = 'none';
        } else { // manual
            gpsControls.style.display = 'none';
            manualControls.style.display = 'block';
        }
    }
}