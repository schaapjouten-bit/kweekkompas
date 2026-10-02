// --- CRITICAL REPAIR SYSTEM V1.3.1 ---
console.log("🚀 KWEEKKOMPAS REPAIR ENGINE STARTING...");

let isSettingsOpen = false;

// --- SHARED APP-SHELL THEME ---
// Theme values are intentionally small and explicit so legacy preferences can
// be migrated without touching profile, seed, or backup data.
const APP_THEME_VALUES = new Set(['light', 'dark', 'playful']);

function normalizeAppTheme(value) {
    return APP_THEME_VALUES.has(value) ? value : 'light';
}

function getStoredAppTheme() {
    try {
        return normalizeAppTheme(localStorage.getItem('theme'));
    } catch (error) {
        return 'light';
    }
}

function applyAppTheme(value) {
    const theme = normalizeAppTheme(value);
    if (typeof document !== 'undefined' && document.documentElement) {
        document.documentElement.setAttribute('data-theme', theme);
        document.documentElement.style.colorScheme = theme === 'dark' ? 'dark' : 'light';
    }
    return theme;
}

function saveAppTheme(value) {
    const theme = applyAppTheme(value);
    try {
        localStorage.setItem('theme', theme);
    } catch (error) {
        // Rendering still works when local storage is temporarily unavailable.
    }
    return theme;
}

// --- SAFE LOCAL STORAGE ---
// Canonical profile storage is `userProfile`; `moestuin_user_profile` is kept
// as a synchronized compatibility mirror for the older profile interface.
const CANONICAL_PROFILE_STORAGE_KEY = 'userProfile';
const LEGACY_PROFILE_STORAGE_KEY = 'moestuin_user_profile';
const DEFAULT_USER_PROFILE = {
    name: '',
    climate: 'Nederland (Zeeklimaat)',
    units: 'Metric',
    gardenType: '',
    light: '',
    experience: '',
    photo: ''
};
const unreadableStoredJSONKeys = new Set();

function cloneStorageFallback(fallback) {
    if (Array.isArray(fallback)) return [...fallback];
    if (fallback && typeof fallback === 'object') return { ...fallback };
    return fallback;
}

function normalizeStoredObject(value) {
    return value && typeof value === 'object' && !Array.isArray(value) ? value : undefined;
}

function hasMeaningfulProfileValue(value) {
    return value !== undefined && value !== null &&
        (typeof value !== 'string' || value.trim() !== '');
}

function firstNonEmptyString(...values) {
    return values.find(value => typeof value === 'string' && value.trim() !== '') || '';
}

function prepareProfileAliases(value) {
    const profile = normalizeStoredObject(value);
    if (!profile) return {};

    const prepared = { ...profile };
    if (!firstNonEmptyString(prepared.gardenType)) {
        prepared.gardenType = firstNonEmptyString(
            prepared.tuinType, prepared.tuintype, prepared.type, prepared.onboarding_type
        );
    }
    if (!firstNonEmptyString(prepared.experience)) {
        prepared.experience = firstNonEmptyString(prepared.level, prepared.onboarding_level);
    }
    if (!firstNonEmptyString(prepared.light)) prepared.light = firstNonEmptyString(prepared.onboarding_sun);
    return prepared;
}

function mergeProfileRecords(...records) {
    const merged = {};
    for (const record of records) {
        const prepared = prepareProfileAliases(record);
        for (const [key, value] of Object.entries(prepared)) {
            if (!hasMeaningfulProfileValue(merged[key]) && hasMeaningfulProfileValue(value)) {
                merged[key] = value;
            }
        }
    }
    return merged;
}

function normalizeUserProfile(value) {
    const profile = prepareProfileAliases(value);
    if (!Object.keys(profile).length) return undefined;

    const normalized = {
        name: typeof profile.name === 'string' ? profile.name : DEFAULT_USER_PROFILE.name,
        climate: typeof profile.climate === 'string' && profile.climate.trim() !== '' ? profile.climate : DEFAULT_USER_PROFILE.climate,
        units: typeof profile.units === 'string' && profile.units.trim() !== '' ? profile.units : DEFAULT_USER_PROFILE.units,
        gardenType: firstNonEmptyString(profile.gardenType),
        light: normalizeOnboardingLight(profile.light),
        experience: firstNonEmptyString(profile.experience),
        photo: typeof profile.photo === 'string' ? profile.photo : DEFAULT_USER_PROFILE.photo
    };
    const knownFields = new Set(['name', 'climate', 'units', 'gardenType', 'light', 'experience', 'photo']);
    for (const [key, fieldValue] of Object.entries(profile)) {
        if (!knownFields.has(key)) normalized[key] = fieldValue;
    }
    return normalized;
}

function normalizeStoredArray(value) {
    return Array.isArray(value) ? value : undefined;
}

// Keep legacy onboarding wording compatible with the canonical seed value.
function normalizeStandplaatsValue(value) {
    return value === 'Volle zon' ? 'Zon' : value;
}

function normalizeOnboardingLight(value) {
    return normalizeStandplaatsValue(value) || '';
}

function readStoredString(key) {
    try {
        const value = localStorage.getItem(key);
        return typeof value === 'string' ? value : '';
    } catch (error) {
        return '';
    }
}

function normalizeReminders(value) {
    const reminders = normalizeStoredArray(value);
    if (!reminders) return undefined;

    return reminders.filter(reminder => reminder && typeof reminder === 'object' &&
        typeof reminder.title === 'string' && typeof reminder.date === 'string');
}

function normalizeDailyProgress(value) {
    const progress = normalizeStoredObject(value);
    if (!progress) return undefined;

    const count = Number(progress.count);
    return {
        ...progress,
        date: typeof progress.date === 'string' ? progress.date : '',
        count: Number.isFinite(count) && count >= 0 ? count : 0
    };
}

function normalizeWishlist(value) {
    const wishlist = normalizeStoredArray(value);
    if (!wishlist) return undefined;

    return wishlist.filter(item => item && typeof item === 'object' && typeof item.name === 'string');
}

function readStoredJSON(key, fallback, normalize) {
    let rawValue;

    try {
        rawValue = localStorage.getItem(key);
    } catch (error) {
        unreadableStoredJSONKeys.add(key);
        console.warn(`[KweekKompas] Opgeslagen data voor "${key}" is niet beschikbaar.`);
        return cloneStorageFallback(fallback);
    }

    if (rawValue === null) return cloneStorageFallback(fallback);

    try {
        const parsedValue = JSON.parse(rawValue);
        const normalizedValue = normalize ? normalize(parsedValue) : parsedValue;

        if (normalizedValue === undefined) {
            unreadableStoredJSONKeys.add(key);
            console.warn(`[KweekKompas] Opgeslagen data voor "${key}" heeft een onverwacht formaat.`);
            return cloneStorageFallback(fallback);
        }

        return normalizedValue;
    } catch (error) {
        unreadableStoredJSONKeys.add(key);
        console.warn(`[KweekKompas] Opgeslagen data voor "${key}" kon niet worden gelezen.`);
        return cloneStorageFallback(fallback);
    }
}

function profileRecordHasMeaningfulData(value) {
    const profile = normalizeStoredObject(value);
    if (!profile) return false;
    return Object.values(profile).some(hasMeaningfulProfileValue);
}

const ONBOARDING_GARDEN_PLACE_VALUES = Object.freeze([
    'Volle grond', 'Bakken of potten', 'Balkon of terras'
]);
const ONBOARDING_LIGHT_VALUES = new Set(['Zon', 'Halfschaduw', 'Schaduw']);
const ONBOARDING_EXPERIENCE_VALUES = new Set(['Beginner', 'Gemiddeld', 'Ervaren']);

function normalizeOnboardingGardenPlaces(value) {
    if (!Array.isArray(value)) return [];
    return [...new Set(value.filter(place => ONBOARDING_GARDEN_PLACE_VALUES.includes(place)))];
}

function toggleOnboardingGardenPlace(places, primaryPlace, toggledPlace) {
    const currentPlaces = normalizeOnboardingGardenPlaces(places);
    if (!ONBOARDING_GARDEN_PLACE_VALUES.includes(toggledPlace)) {
        return {
            places: currentPlaces,
            primaryPlace: currentPlaces.includes(primaryPlace) ? primaryPlace : (currentPlaces[0] || '')
        };
    }

    const wasSelected = currentPlaces.includes(toggledPlace);
    const nextPlaces = wasSelected
        ? currentPlaces.filter(place => place !== toggledPlace)
        : [...currentPlaces, toggledPlace];
    const nextPrimaryPlace = wasSelected && primaryPlace === toggledPlace
        ? (nextPlaces[0] || '')
        : (nextPlaces.includes(primaryPlace) ? primaryPlace : (nextPlaces[0] || ''));
    return { places: nextPlaces, primaryPlace: nextPrimaryPlace };
}

function getOnboardingProfileFields() {
    return {
        gardenType: readStoredString('onboarding_type').trim(),
        light: normalizeOnboardingLight(readStoredString('onboarding_sun').trim()),
        experience: readStoredString('onboarding_level').trim()
    };
}

function buildLegacyProfileMirror(profile) {
    const mirror = { ...profile };
    mirror.level = profile.experience || '';
    return mirror;
}

function saveUserProfileData(profile, { syncOnboarding = true } = {}) {
    const normalized = normalizeUserProfile(profile) || { ...DEFAULT_USER_PROFILE };
    const canonical = JSON.stringify(normalized);
    const legacy = JSON.stringify(buildLegacyProfileMirror(normalized));

    localStorage.setItem(CANONICAL_PROFILE_STORAGE_KEY, canonical);
    localStorage.setItem(LEGACY_PROFILE_STORAGE_KEY, legacy);

    if (syncOnboarding) {
        const synchronizedFields = [
            ['onboarding_type', normalized.gardenType],
            ['onboarding_sun', normalized.light],
            ['onboarding_level', normalized.experience]
        ];
        for (const [key, value] of synchronizedFields) {
            if (hasMeaningfulProfileValue(value) || readStoredString(key) !== '') {
                localStorage.setItem(key, value || '');
            }
        }
    }

    window.userProfile = normalized;
    return normalized;
}

function loadUserProfile() {
    const canonicalStored = readStoredJSON(CANONICAL_PROFILE_STORAGE_KEY, null, normalizeStoredObject);
    const legacyStored = readStoredJSON(LEGACY_PROFILE_STORAGE_KEY, null, normalizeStoredObject);
    const onboardingFields = getOnboardingProfileFields();
    const hasStoredProfile = profileRecordHasMeaningfulData(canonicalStored) ||
        profileRecordHasMeaningfulData(legacyStored);
    const onboardingCompleted = readStoredString('onboarding_done') === 'true';
    // Precedence is canonical non-empty values, then legacy, then onboarding,
    // and only finally the defaults.
    const merged = mergeProfileRecords(canonicalStored, legacyStored, onboardingFields);
    const normalized = normalizeUserProfile(merged) || { ...DEFAULT_USER_PROFILE };

    // Migrate only when a real profile already exists; partial onboarding
    // selections remain temporary until the user presses Finish.
    if (hasStoredProfile || (onboardingCompleted && profileRecordHasMeaningfulData(onboardingFields))) {
        try {
            saveUserProfileData(normalized);
        } catch (error) {
            console.warn('[KweekKompas] Profielmigratie kon niet worden opgeslagen.');
        }
    }

    return normalized;
}

function hasStoredUserProfile() {
    const canonicalStored = readStoredJSON(CANONICAL_PROFILE_STORAGE_KEY, null, normalizeStoredObject);
    const legacyStored = readStoredJSON(LEGACY_PROFILE_STORAGE_KEY, null, normalizeStoredObject);
    const onboardingStored = getOnboardingProfileFields();
    return profileRecordHasMeaningfulData(canonicalStored) ||
        profileRecordHasMeaningfulData(legacyStored) ||
        (readStoredString('onboarding_done') === 'true' && profileRecordHasMeaningfulData(onboardingStored));
}

function buildProfileFromOnboarding(profile, onboardingData) {
    const baseProfile = normalizeUserProfile(profile) || { ...DEFAULT_USER_PROFILE };
    const usesNewPlaceSelection = Array.isArray(onboardingData?.places);
    const gardenPlaces = usesNewPlaceSelection
        ? normalizeOnboardingGardenPlaces(onboardingData.places)
        : normalizeOnboardingGardenPlaces(baseProfile.gardenPlaces);
    const requestedPrimary = onboardingData?.primaryPlace;
    const primaryPlace = gardenPlaces.includes(requestedPrimary) ? requestedPrimary : (gardenPlaces[0] || '');
    const legacyType = !usesNewPlaceSelection ? firstNonEmptyString(onboardingData?.type) : '';
    const requestedLight = usesNewPlaceSelection
        ? (ONBOARDING_LIGHT_VALUES.has(onboardingData?.light) ? onboardingData.light : '')
        : normalizeOnboardingLight(onboardingData?.light || baseProfile.light || '');
    const requestedExperience = usesNewPlaceSelection
        ? (ONBOARDING_EXPERIENCE_VALUES.has(onboardingData?.level) ? onboardingData.level : '')
        : firstNonEmptyString(onboardingData?.level, baseProfile.experience);
    const gardenType = usesNewPlaceSelection ? primaryPlace : (legacyType || baseProfile.gardenType || '');
    const savedPrimaryPlace = gardenPlaces.includes(baseProfile.primaryGardenPlace)
        ? baseProfile.primaryGardenPlace
        : (gardenPlaces.includes(baseProfile.gardenType) ? baseProfile.gardenType : '');
    return {
        ...baseProfile,
        gardenType,
        gardenPlaces,
        primaryGardenPlace: usesNewPlaceSelection ? primaryPlace : savedPrimaryPlace,
        light: requestedLight,
        experience: requestedExperience
    };
}

function shouldStartOnboarding(doneOnboarding, profileExists, seedCount, databaseAvailable) {
    return !doneOnboarding && !profileExists && seedCount === 0 && databaseAvailable;
}

// Global State
window.userProfile = loadUserProfile();

window.toggleSettingsPanel_REPAIR_V131 = function() {
    isSettingsOpen = !isSettingsOpen;
    renderSettingsPanel();
}

window.openInfoModal = function(section) {
    console.log("Opening modal section:", section);
    const modal = document.getElementById('info-modal');
    if (!modal) { console.error("Modal #info-modal not found!"); return; }

    // Hide all views
    document.querySelectorAll('.info-view').forEach(v => v.classList.add('hidden'));

    const targetView = document.getElementById('info-view-' + section);
    if (targetView) {
        targetView.classList.remove('hidden');
    } else {
        console.error("View not found: info-view-" + section);
    }

    const title = document.getElementById('info-modal-title');
    if (title) {
        const titles = {
            'about': 'Over KweekKompas',
            'faq': 'Veelgestelde vragen',
            'privacy': 'Privacy',
            'data': 'Data & Opslag',
            'profile': '👤 Profiel Bewerken'
        };
        title.textContent = titles[section] || 'Info & Support';
    }

    if (section === 'profile') {
        const iN = document.getElementById('profile-input-name');
        const iC = document.getElementById('profile-input-climate');
        const iT = document.getElementById('profile-input-tuin');
        const iL = document.getElementById('profile-input-level');
        const iU = document.getElementById('profile-input-units');
        if (iN) iN.value = window.userProfile.name || '';
        if (iC) iC.value = window.userProfile.climate || '';
        if (iT) iT.value = window.userProfile.gardenType || '';
        if (iL) iL.value = window.userProfile.experience || '';
        if (iU) iU.value = window.userProfile.units || 'Metric';

        // 🔥 Foto updaten
        const avatar = targetView.querySelector('.profile-avatar');
        if (avatar) {
            avatar.src = safeProfileImageUrl(window.userProfile.photo);
        }
    }

    modal.classList.remove('hidden');
};

window.closeInfoModal = function() {
    document.getElementById('info-modal')?.classList.add('hidden');
};

window.saveUserProfile = function() {
    const iN = document.getElementById('profile-input-name');
    const iC = document.getElementById('profile-input-climate');
    const iT = document.getElementById('profile-input-tuin');
    const iL = document.getElementById('profile-input-level');
    const iU = document.getElementById('profile-input-units');
    const profile = {
        ...window.userProfile,
        name: iN ? iN.value : window.userProfile.name,
        climate: iC ? iC.value : window.userProfile.climate,
        gardenType: iT ? iT.value : window.userProfile.gardenType,
        experience: iL ? iL.value : window.userProfile.experience,
        units: iU ? iU.value : window.userProfile.units
    };
    saveUserProfileData(profile);
    if (window.updateProfileUI) window.updateProfileUI();
    if (isSettingsOpen) renderSettingsPanel();
    window.closeInfoModal();
    if (typeof showToast === 'function') showToast("Profiel opgeslagen! ✅");
};

function renderSettingsPanel() {
    const panel = document.getElementById('settings-panel');
    const overlay = document.getElementById('settings-overlay');
    if (!panel || !overlay) {
        console.error("ELEMENTS NOT FOUND!");
        return;
    }

    if (isSettingsOpen) {
        panel.classList.add('open');
        overlay.classList.remove('hidden');
        // Re-render to ensure theme labels and state are correct
        panel.innerHTML = getSettingsHTML();
        applySettingsPanelValues(panel);
        window.KweekServices?.mount(panel);
    } else {
        panel.classList.remove('open');
        overlay.classList.add('hidden');
        // We no longer destroy panel.innerHTML on close!
    }
}

window.openSettingsModal = function(html) {
  let modal = document.getElementById('settings-generic-modal');
  if (modal) modal.remove();

  modal = document.createElement('div');
  modal.id = 'settings-generic-modal';
  modal.className = 'modal-overlay';
  modal.style.zIndex = '30000';
  modal.style.display = 'flex';
  modal.style.alignItems = 'center';
  modal.style.justifyContent = 'center';

  modal.innerHTML = `
    <div class="modal-content" style="max-width: 440px; width: 90%; margin: auto; background: #1E201E; border-radius: 16px; overflow: hidden; display: flex; flex-direction: column; max-height: 90vh; border: 1px solid rgba(255,255,255,0.05); box-shadow: 0 20px 40px rgba(0,0,0,0.5); position: relative;">
      <button class="modal-close-btn" style="position: absolute; top: 12px; right: 12px; background: rgba(255,255,255,0.05); border: none; border-radius: 50%; width: 32px; height: 32px; display: flex; align-items: center; justify-content: center; font-size: 16px; color: #D1D5DB; cursor: pointer; z-index: 10;" onclick="document.getElementById('settings-generic-modal').remove()">✕</button>
      <div class="modal-body" style="padding: 24px 16px; overflow-y: auto;">
        ${html}
      </div>
    </div>
  `;
  document.body.appendChild(modal);
  populateProfileModal(modal);

  modal.addEventListener('click', function(e) {
    if (e.target === modal) modal.remove();
  });
}

window.openSettingsSection = function(section) {
    const targetId = `settings-section-${section}`;
    const focusSection = () => {
        const panel = document.getElementById('settings-panel');
        const target = panel?.querySelector(`#${targetId}`);
        if (!target) return;
        target.scrollIntoView({ behavior: 'smooth', block: 'start' });
        target.focus?.({ preventScroll: true });
    };
    if (!isSettingsOpen) {
        window.toggleSettingsPanel_REPAIR_V131();
        window.setTimeout(focusSection, 0);
    } else {
        focusSection();
    }
}

function safeFiniteNumber(value, fallback = 0) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
}

function applySettingsPanelValues(panel) {
    if (!panel) return;
    const profile = normalizeUserProfile(window.userProfile) || { ...DEFAULT_USER_PROFILE };
    const photo = panel.querySelector('#settings-drawer-photo');
    if (photo) {
        photo.src = safeProfileImageUrl(profile.photo);
        const zoom = Math.min(3, Math.max(1, safeFiniteNumber(profile.photoZoom, 1)));
        const x = safeFiniteNumber(profile.photoX);
        const y = safeFiniteNumber(profile.photoY);
        photo.style.transform = `scale(${zoom}) translate(${x * (56 / 120)}px, ${y * (56 / 120)}px)`;
    }

    const name = panel.querySelector('#settings-drawer-name');
    if (name) name.textContent = profile.name || 'Jouw profiel';
    const meta = panel.querySelector('#settings-drawer-meta');
    if (meta) meta.textContent = `${profile.gardenType || 'Geen type'} \u2022 ${profile.climate || 'Nederland'}`;

    populateProfileModal(panel);
    bindSettingsProfileControls(panel);

    const currentTheme = normalizeAppTheme(document.documentElement.getAttribute('data-theme') || getStoredAppTheme());
    panel.querySelectorAll('[data-theme-choice]').forEach(button => {
        const active = button.dataset.themeChoice === currentTheme;
        button.classList.toggle('active', active);
        button.setAttribute('aria-pressed', active ? 'true' : 'false');
    });

    const layout = localStorage.getItem('layout_width') === 'wide' ? 'wide' : 'standard';
    panel.querySelectorAll('[data-layout-choice]').forEach(button => {
        const active = button.dataset.layoutChoice === layout;
        button.classList.toggle('active', active);
        button.style.background = active ? 'rgba(255,255,255,0.12)' : 'transparent';
    });
}

function bindSettingsProfileControls(panel) {
    if (!panel) return;
    const fieldMap = {
        'profile-modal-name': 'name',
        'profile-modal-experience': 'experience',
        'profile-modal-light': 'light',
        'profile-modal-climate': 'climate',
        'profile-modal-units': 'units',
        'profile-modal-garden-type': 'gardenType'
    };
    Object.entries(fieldMap).forEach(([id, key]) => {
        const field = panel.querySelector(`#${id}`);
        field?.addEventListener('change', () => window.saveProfileField(key, field.value));
    });
    panel.querySelectorAll('[data-profile-garden-place]').forEach(field => {
        field.addEventListener('change', () => {
            const places = Array.from(panel.querySelectorAll('[data-profile-garden-place]:checked'))
                .map(input => input.value);
            window.saveProfileField('gardenPlaces', places);
        });
    });
    panel.querySelector('#profile-photo-upload')?.addEventListener('change', window.handleProfilePhotoUpload);
    panel.querySelector('#profile-modal-zoom')?.addEventListener('input', event => window.handleAvatarZoom(event.target.value));
    panel.querySelector('#profile-avatar-container')?.addEventListener('mousedown', window.initAvatarDrag);
    panel.querySelector('#profile-avatar-container')?.addEventListener('touchstart', window.initAvatarDrag, { passive: false });
    panel.querySelector('[data-profile-photo-trigger]')?.addEventListener('click', () => panel.querySelector('#profile-photo-upload')?.click());
}

function populateProfileModal(modal) {
    const preview = modal?.querySelector('#profile-avatar-preview');
    if (!preview) return;
    const profile = normalizeUserProfile(window.userProfile) || { ...DEFAULT_USER_PROFILE };
    const name = modal.querySelector('#profile-modal-name');
    const experience = modal.querySelector('#profile-modal-experience');
    const light = modal.querySelector('#profile-modal-light');
    const climate = modal.querySelector('#profile-modal-climate');
    const units = modal.querySelector('#profile-modal-units');
    const gardenType = modal.querySelector('#profile-modal-garden-type');
    if (name) name.value = profile.name || '';
    if (experience) experience.value = profile.experience || '';
    if (light) light.value = ONBOARDING_LIGHT_VALUES.has(profile.light) ? profile.light : '';
    if (climate) climate.value = profile.climate || 'Nederland (Zeeklimaat)';
    if (units) units.value = profile.units === 'Imperial' ? 'Imperial' : 'Metric';
    if (gardenType) gardenType.value = profile.primaryGardenPlace || profile.gardenType || '';

    const gardenPlaces = normalizeOnboardingGardenPlaces(profile.gardenPlaces);
    if (!gardenPlaces.length && ONBOARDING_GARDEN_PLACE_VALUES.includes(profile.gardenType)) {
        gardenPlaces.push(profile.gardenType);
    }
    modal.querySelectorAll('[data-profile-garden-place]').forEach(field => {
        field.checked = gardenPlaces.includes(field.value);
    });

    preview.src = safeProfileImageUrl(profile.photo);
    const zoom = Math.min(3, Math.max(1, safeFiniteNumber(profile.photoZoom, 1)));
    const x = safeFiniteNumber(profile.photoX);
    const y = safeFiniteNumber(profile.photoY);
    preview.style.transform = `scale(${zoom}) translate(${x}px, ${y}px)`;
    const zoomValue = modal.querySelector('#zoom-value');
    if (zoomValue) zoomValue.textContent = `${Math.round(zoom * 100)}%`;
    const zoomSlider = modal.querySelector('#profile-modal-zoom');
    if (zoomSlider) zoomSlider.value = String(zoom);
}

function getProfileHTML() {
  return `
    <div style="display: flex; flex-direction: column; gap: 16px;">

      <div style="text-align:center; margin-bottom: 8px;">
        <h2 style="margin: 0; font-size: 24px; font-weight: 800; letter-spacing: -0.5px; color: var(--text-main);">Jouw profiel</h2>
      </div>

      <!-- FOTO / AVATAR TOOL -->
      <div style="display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 12px; margin-bottom: 8px;">
        <div style="position: relative;">
          <div id="profile-avatar-container"
               style="width: 120px; height: 120px; border-radius: 50%; overflow: hidden; border: 3px solid rgba(255,255,255,0.1); background: #2a2c2a; cursor: grab; position: relative; display: flex; align-items: center; justify-content: center;"
               onmousedown="window.initAvatarDrag(event)"
               ontouchstart="window.initAvatarDrag(event)">
            <img id="profile-avatar-preview"
                 src="assets/default-avatar.png"
                 style="position: absolute; width: 100%; height: 100%; object-fit: cover; pointer-events: none; transform: scale(1) translate(0px, 0px); transition: transform 0.1s ease-out; transform-origin: center;">
          </div>
          <div onclick="document.getElementById('profile-photo-upload').click()"
               style="position: absolute; z-index: 10; bottom: 4px; right: 4px; background: #648166; width: 32px; height: 32px; border-radius: 50%; display: flex; align-items: center; justify-content: center; color: white; font-size: 14px; border: 3px solid #1E201E; box-shadow: 0 4px 10px rgba(0,0,0,0.3); cursor: pointer;">✏️</div>
        </div>

        <!-- ZOOM CONTROLS -->
        <div style="width: 160px; display: flex; flex-direction: column; gap: 4px;">
          <div style="display: flex; justify-content: space-between; font-size: 11px; opacity: 0.6; color: #fff;">
            <span>Zoom</span>
            <span id="zoom-value">100%</span>
          </div>
          <input id="profile-modal-zoom" type="range" min="1" max="3" step="0.05" value="1"
                 style="width: 100%; accent-color: #648166; cursor: pointer;"
                 oninput="window.handleAvatarZoom(this.value)">
          <p style="font-size: 10px; opacity: 0.4; text-align: center; margin-top: 4px;">Sleep de foto om te verplaatsen</p>
        </div>

        <input type="file" id="profile-photo-upload" accept="image/*" style="display:none;" onchange="window.handleProfilePhotoUpload(event)">
      </div>

      <!-- NAAM -->
      <div style="display: flex; flex-direction: column; gap: 6px;">
        <label style="font-size: 13px; font-weight: 600; color: var(--text-muted);">Jouw Naam</label>
        <input id="profile-modal-name" type="text" value="" placeholder="Hoe mogen we je noemen?" onchange="window.saveProfileField('name', this.value)" style="padding: 14px; border-radius: 12px; border: 1px solid var(--border-color); background: var(--surface-color); color: var(--text-main); font-size: 15px; font-family: inherit;">
      </div>

      <!-- ERVARING -->
      <div style="display: flex; flex-direction: column; gap: 6px;">
        <label style="font-size: 13px; font-weight: 600; color: var(--text-muted);">Ervaring</label>
        <select id="profile-modal-experience" onchange="window.saveProfileField('experience', this.value)" style="padding: 14px; border-radius: 12px; border: 1px solid var(--border-color); background: var(--surface-color); color: var(--text-main); font-size: 15px; font-family: inherit; appearance: none; position: relative;">
          <option value="Beginner">Beginner (Startende tuinder)</option>
          <option value="Gemiddeld">Gemiddeld (Al oogst gehad)</option>
          <option value="Expert">Expert (Groene vingers)</option>
          <option value="Ervaren">Ervaren (Groene vingers)</option>
        </select>
      </div>

      <!-- ZONE -->
      <div style="display: flex; flex-direction: column; gap: 6px;">
        <label style="font-size: 13px; font-weight: 600; color: var(--text-muted);">Klimaatzone</label>
        <select id="profile-modal-climate" onchange="window.saveProfileField('climate', this.value)" style="padding: 14px; border-radius: 12px; border: 1px solid var(--border-color); background: var(--surface-color); color: var(--text-main); font-size: 15px; font-family: inherit; appearance: none;">
          <option value="Nederland (Zeeklimaat)">Nederland / België (Zeeklimaat)</option>
          <option value="Warm (Subtropisch)">Warm / Kas (Subtropisch)</option>
          <option value="Koud (Continentaal)">Koud (Continentaal)</option>
        </select>
      </div>

      <!-- EENHEDEN -->
      <div style="display: flex; flex-direction: column; gap: 6px; margin-bottom: 8px;">
        <label style="font-size: 13px; font-weight: 600; color: var(--text-muted);">Eenheden</label>
        <select id="profile-modal-units" onchange="window.saveProfileField('units', this.value)" style="padding: 14px; border-radius: 12px; border: 1px solid var(--border-color); background: var(--surface-color); color: var(--text-main); font-size: 15px; font-family: inherit; appearance: none;">
          <option value="Metric">Metrisch (cm / °C)</option>
          <option value="Imperial">Imperiaal (inch / °F)</option>
        </select>
      </div>

      <!-- TYPE TUIN -->
      <div style="display: flex; flex-direction: column; gap: 6px;">
        <label style="font-size: 13px; font-weight: 600; color: var(--text-muted);">Type Tuin</label>
        <select id="profile-modal-garden-type" onchange="window.saveProfileField('gardenType', this.value)" style="padding: 14px; border-radius: 12px; border: 1px solid var(--border-color); background: var(--surface-color); color: var(--text-main); font-size: 15px; font-family: inherit; appearance: none;">
          <option value="Moestuin">Moestuin</option>
          <option value="Achtertuin">Achtertuin</option>
          <option value="Balkon">Balkon</option>
          <option value="Gemengd">Gemengd</option>
          <option value="Volkstuin">Volkstuin</option>
          <option value="Geen">Geen (potten)</option>
        </select>
      </div>

      <button onclick="document.getElementById('settings-generic-modal').remove()" style="margin-top: 16px; width: 100%; border-radius: 12px; padding: 14px; background: #648166; color: white; border: none; font-weight: bold; font-size: 15px; cursor: pointer;">Opslaan & Sluiten</button>
    </div>
  `;
}

window.saveProfileField = function(key, value) {
  const profile = { ...(window.userProfile || loadUserProfile()) };
  if (key === 'photo') {
    const safePhoto = safeWishlistImageUrl(value);
    if (!safePhoto) return;
    value = safePhoto;
  }
  if (key === 'light') {
    value = ONBOARDING_LIGHT_VALUES.has(value) ? value : '';
    profile.light = value;
  } else if (key === 'gardenPlaces') {
    const places = normalizeOnboardingGardenPlaces(value);
    const primary = places.includes(profile.primaryGardenPlace)
      ? profile.primaryGardenPlace
      : (places[0] || '');
    profile.gardenPlaces = places;
    profile.primaryGardenPlace = primary;
    profile.gardenType = primary;
  } else if (key === 'gardenType') {
    profile.gardenType = value;
    if (ONBOARDING_GARDEN_PLACE_VALUES.includes(value)) {
      profile.primaryGardenPlace = value;
      profile.gardenPlaces = normalizeOnboardingGardenPlaces([...(profile.gardenPlaces || []), value]);
    } else {
      const places = normalizeOnboardingGardenPlaces(profile.gardenPlaces);
      if (value === '') {
        const primary = places.includes(profile.primaryGardenPlace)
          ? profile.primaryGardenPlace
          : (places[0] || '');
        profile.primaryGardenPlace = primary;
        profile.gardenType = primary;
      } else {
        profile.primaryGardenPlace = '';
      }
    }
  } else {
    profile[key] = value;
  }
  const savedProfile = saveUserProfileData(profile);

  if (key === 'gardenType' || key === 'gardenPlaces') {
    const profilePanel = document.getElementById('settings-panel') || document.getElementById('settings-generic-modal');
    const primaryField = profilePanel?.querySelector('#profile-modal-garden-type');
    if (primaryField) primaryField.value = savedProfile.primaryGardenPlace || savedProfile.gardenType || '';
    const savedPlaces = normalizeOnboardingGardenPlaces(savedProfile.gardenPlaces);
    profilePanel?.querySelectorAll('[data-profile-garden-place]').forEach(field => {
      field.checked = savedPlaces.includes(field.value);
    });
  }

  if (key === 'name') {
    const el = document.getElementById('settings-drawer-name');
    if (el) el.textContent = value || 'Jouw profiel';
  }
  if (key === 'photo') {
    const el = document.getElementById('settings-drawer-photo');
    if (el) {
       el.src = safeProfileImageUrl(value);
       el.style.display = 'block';
       if(el.nextElementSibling) el.nextElementSibling.style.display = 'none';
    }
  }
  const meta = document.getElementById('settings-drawer-meta');
  if (meta) meta.textContent = `${savedProfile.gardenType || 'Geen type'} \u2022 ${savedProfile.climate || 'Nederland'}`;
};

window.handleProfilePhotoUpload = function(e) {
  const file = e.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = function(event) {
    const dataUrl = event.target.result;
    const safeDataUrl = safeWishlistImageUrl(dataUrl);
    if (!safeDataUrl) {
      showToast('Ongeldige profielfoto.');
      return;
    }
    // Reset zoom and position on new upload
    const profile = { ...(window.userProfile || loadUserProfile()) };
    profile.photo = safeDataUrl;
    profile.photoZoom = 1;
    profile.photoX = 0;
    profile.photoY = 0;
    saveUserProfileData(profile);

    const preview = document.getElementById('profile-avatar-preview');
    if (preview) {
      preview.src = safeDataUrl;
      preview.style.transform = 'scale(1) translate(0px, 0px)';
    }
    const drawerPhoto = document.getElementById('settings-drawer-photo');
    if (drawerPhoto) drawerPhoto.src = safeProfileImageUrl(safeDataUrl);
    const zoomSlider = document.querySelector('input[type="range"]');
    if (zoomSlider) zoomSlider.value = 1;
    const zoomVal = document.getElementById('zoom-value');
    if (zoomVal) zoomVal.textContent = '100%';
  };
  reader.readAsDataURL(file);
};

// --- AVATAR MANIPULATION HELPERS ---

let isDraggingAvatar = false;
let startX, startY, initialX, initialY;

window.handleAvatarZoom = function(val) {
    const preview = document.getElementById('profile-avatar-preview');
    const zoomVal = document.getElementById('zoom-value');
    if (!preview) return;

    // Get current translation from userProfile
    const profile = window.userProfile || loadUserProfile();
    const x = profile.photoX || 0;
    const y = profile.photoY || 0;

    preview.style.transform = `scale(${val}) translate(${x}px, ${y}px)`;
    if (zoomVal) zoomVal.textContent = Math.round(val * 100) + '%';

    // Auto-save zoom state
    window.saveProfileField('photoZoom', parseFloat(val));
};

window.initAvatarDrag = function(e) {
    e.preventDefault();
    isDraggingAvatar = true;
    const container = document.getElementById('profile-avatar-container');
    if (container) container.style.cursor = 'grabbing';

    const clientX = e.type === 'touchstart' ? e.touches[0].clientX : e.clientX;
    const clientY = e.type === 'touchstart' ? e.touches[0].clientY : e.clientY;

    startX = clientX;
    startY = clientY;

    const profile = window.userProfile || loadUserProfile();
    initialX = profile.photoX || 0;
    initialY = profile.photoY || 0;

    document.addEventListener('mousemove', window.doAvatarDrag);
    document.addEventListener('mouseup', window.stopAvatarDrag);
    document.addEventListener('touchmove', window.doAvatarDrag, { passive: false });
    document.addEventListener('touchend', window.stopAvatarDrag);
};

window.doAvatarDrag = function(e) {
    if (!isDraggingAvatar) return;
    if (e.type === 'touchmove') e.preventDefault();

    const clientX = e.type === 'touchmove' ? e.touches[0].clientX : e.clientX;
    const clientY = e.type === 'touchmove' ? e.touches[0].clientY : e.clientY;

    const dx = (clientX - startX);
    const dy = (clientY - startY);

    const newX = initialX + dx;
    const newY = initialY + dy;

    const preview = document.getElementById('profile-avatar-preview');
    if (preview) {
        const profile = window.userProfile || loadUserProfile();
        const zoom = profile.photoZoom || 1;
        preview.style.transform = `scale(${zoom}) translate(${newX}px, ${newY}px)`;

        // Update local memory but dont save to localStorage every pixel for performance
        profile.photoX = newX;
        profile.photoY = newY;
    }
};

window.stopAvatarDrag = function() {
    if (!isDraggingAvatar) return;
    isDraggingAvatar = false;
    const container = document.getElementById('profile-avatar-container');
    if (container) container.style.cursor = 'grab';

    document.removeEventListener('mousemove', window.doAvatarDrag);
    document.removeEventListener('mouseup', window.stopAvatarDrag);
    document.removeEventListener('touchmove', window.doAvatarDrag);
    document.removeEventListener('touchend', window.stopAvatarDrag);

    // Final save of position
    const profile = window.userProfile || loadUserProfile();
    saveUserProfileData(profile);
};

function getAboutHTML() {
  return `
    <div style="display: flex; flex-direction: column; align-items: center; text-align: center; color: #fff;">

      <!-- ICON GRAPHIC -->
      <div style="position: relative; width: 80px; height: 80px; display: flex; align-items: center; justify-content: center; margin-bottom: 16px;">
        <div style="position: absolute; width: 140px; height: 100px;">
          <span style="position: absolute; top: 10%; left: 0px; color: #5B8A61; font-size: 12px;">✦</span>
          <span style="position: absolute; top: 5%; right: 10%; color: #5B8A61; font-size: 8px;">✦</span>
          <span style="position: absolute; bottom: 20%; left: 15%; color: #5B8A61; font-size: 8px;">✦</span>
          <span style="position: absolute; bottom: 10%; right: -10px; color: #5B8A61; font-size: 12px;">✦</span>
        </div>

        <div style="width: 72px; height: 72px; border-radius: 50%; border: 2px solid #5B8A61; display: flex; align-items: center; justify-content: center; background: rgba(91, 138, 97, 0.1); position: relative; z-index: 2;">
          <span style="font-size: 32px;">🌱</span>
        </div>
      </div>

      <h2 style="margin: 0; font-size: 24px; font-weight: 800; letter-spacing: -0.5px; margin-bottom: 16px; color: #fff;">Over de app</h2>

      <!-- Green Separator -->
      <div style="width: 24px; height: 3px; background: #648166; border-radius: 4px; margin-bottom: 32px;"></div>

      <div style="text-align: left; width: 100%; display: flex; flex-direction: column; gap: 24px;">

        <div>
          <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 8px; color: #7DBA84;">
            <span style="font-size: 16px;">🌱</span>
            <strong style="font-size: 15px;">Over KweekKompas</strong>
          </div>
          <p style="margin: 0; font-size: 14px; color: #D1D5DB; line-height: 1.5;">KweekKompas helpt je simpel en overzichtelijk bij het plannen, zaaien en verzorgen van je planten.</p>
          <p style="margin: 8px 0 0 0; font-size: 13px; color: #9CA3AF; font-style: italic;">Altijd weten wat je wanneer moet doen — zonder gedoe.</p>
        </div>

        <div>
          <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 8px; color: #7DBA84;">
            <span style="font-size: 16px;">🔒</span>
            <strong style="font-size: 15px;">Jouw gegevens</strong>
          </div>
          <p style="margin: 0; font-size: 14px; color: #D1D5DB; line-height: 1.5;">Je gegevens worden automatisch op dit apparaat opgeslagen. Een account is niet nodig. Cloud-synchronisatie gebeurt alleen op jouw verzoek.</p>
        </div>

      </div>

      <button onclick="document.getElementById('settings-generic-modal').remove()" style="margin-top: 40px; width: 100%; border-radius: 12px; padding: 14px; background: #648166; color: white; border: none; font-weight: 700; font-size: 15px; cursor: pointer;">Begrepen</button>

    </div>
  `;
}

function getDataStorageHTML() {
  return `
    <div style="display: flex; flex-direction: column; color: #fff;">

      <h2 class="modal-title">💾 Data & Opslag</h2>
      <p class="modal-subtitle">Je gegevens worden automatisch op dit apparaat opgeslagen. Een account is niet nodig.</p>

      <div class="data-section">
        <h4>💾 Backup maken</h4>
        <p>Sla je huidige gegevens op in een bestand voor later.</p>
        <button class="data-button" onclick="exportData()">Back-up downloaden</button>
      </div>

      <div class="data-section">
        <h4>♻️ Herstellen</h4>
        <p>Zet gegevens uit een back-up terug. Wat in het bestand staat vervangt de bijbehorende gegevens; de rest blijft bewaard. Je bevestigt dit eerst.</p>
        <button class="data-button" onclick="restoreBackup()">Backup herstellen</button>
      </div>

      <div class="data-section">
        <h4>📥 Importeren</h4>
        <p>Open een opgeslagen bestand. Importeren werkt hetzelfde als herstellen: je controleert en bevestigt eerst wat wordt vervangen.</p>
        <button class="data-button" onclick="importData()">Data importeren</button>
      </div>

      <div class="data-section data-warning">
        <h4>⚠️ Reset applicatie</h4>
        <p>Verwijder alle zaden en instellingen. Dit is definitief.</p>
        <button class="data-button" onclick="resetApp()">Alles verwijderen</button>
      </div>

      <button class="modal-footer-button" onclick="document.getElementById('settings-generic-modal').remove()">Sluiten</button>

    </div>
  `;
}

if (typeof window.restoreBackup !== 'function' || true) {
  window.restoreBackup = function() {
    window.importData();
  };
}

function getFAQHTML() {
  return `
    <div style="display: flex; flex-direction: column; align-items: center; text-align: center; color: #fff;">

      <!-- ICON GRAPHIC -->
      <div style="position: relative; width: 80px; height: 80px; display: flex; align-items: center; justify-content: center; margin-bottom: 16px;">
        <div style="position: absolute; width: 140px; height: 100px;">
          <span style="position: absolute; top: 10%; left: 0px; color: #5B8A61; font-size: 12px;">✦</span>
          <span style="position: absolute; top: 5%; right: 10%; color: #5B8A61; font-size: 8px;">✦</span>
          <span style="position: absolute; bottom: 20%; left: 15%; color: #5B8A61; font-size: 8px;">✦</span>
          <span style="position: absolute; bottom: 10%; right: -10px; color: #5B8A61; font-size: 12px;">✦</span>
        </div>

        <div style="width: 72px; height: 72px; border-radius: 50%; border: 2px solid #5B8A61; display: flex; align-items: center; justify-content: center; background: rgba(91, 138, 97, 0.1); position: relative; z-index: 2;">
          <span style="font-size: 32px;">❓</span>
        </div>
      </div>

      <h2 style="margin: 0; font-size: 24px; font-weight: 800; letter-spacing: -0.5px; margin-bottom: 16px; color: #fff;">Veelgestelde vragen</h2>

      <!-- Green Separator -->
      <div style="width: 24px; height: 3px; background: #648166; border-radius: 4px; margin-bottom: 32px;"></div>

      <div style="text-align: left; width: 100%; display: flex; flex-direction: column; gap: 24px;">

        <div class="faq-item">
          <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 8px; color: #7DBA84;">
            <span style="font-size: 16px;">🌱</span>
            <strong style="font-size: 15px;">Hoe werkt de app?</strong>
          </div>
          <p style="margin: 0; font-size: 14px; color: #D1D5DB; line-height: 1.5;">Voeg je zaden toe, bekijk wat je wanneer kunt zaaien en volg je taken via de planner en kalender.</p>
        </div>

        <div class="faq-item">
          <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 8px; color: #7DBA84;">
            <span style="font-size: 16px;">💾</span>
            <strong style="font-size: 15px;">Worden mijn gegevens opgeslagen?</strong>
          </div>
          <p style="margin: 0; font-size: 14px; color: #D1D5DB; line-height: 1.5;">Ja. Je gegevens worden automatisch op dit apparaat opgeslagen. Een account is niet nodig.</p>
        </div>

        <div class="faq-item">
          <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 8px; color: #7DBA84;">
            <span style="font-size: 16px;">📥</span>
            <strong style="font-size: 15px;">Kan ik een backup maken?</strong>
          </div>
          <p style="margin: 0; font-size: 14px; color: #D1D5DB; line-height: 1.5;">Ja. Via Data & Opslag kun je je gegevens exporteren en later weer herstellen.</p>
        </div>

      </div>

      <button onclick="document.getElementById('settings-generic-modal').remove()" style="margin-top: 40px; width: 100%; border-radius: 12px; padding: 14px; background: #648166; color: white; border: none; font-weight: 700; font-size: 15px; cursor: pointer;">Begrepen</button>

    </div>
  `;
}

function getLegacySettingsHTML() {
    return `
        <div class="settings-header">
            <h2>Instellingen</h2>
            <button onclick="toggleSettingsPanel_REPAIR_V131()" style="background:none; border:none; color:#fff; font-size:20px; cursor:pointer; opacity:0.6;">✕</button>
        </div>

        <div class="settings-content" style="flex: 1; overflow-y: auto;">

            <!-- PROFIEL CARD -->
            <div class="settings-profile-card">
                <div style="display: flex; align-items: center; gap: 16px; margin-bottom: 16px;">
                    <div style="width: 56px; height: 56px; border-radius: 50%; overflow: hidden; border: 2px solid rgba(255,255,255,0.1); background: #2a2c2a; flex-shrink: 0; display: flex; align-items: center; justify-content: center; position: relative;">
                        <img id="settings-drawer-photo" src="assets/default-avatar.png"
                             style="position: absolute; width: 100%; height: 100%; object-fit: cover; transform: scale(1) translate(0px, 0px); transform-origin: center;">
                    </div>
                    <div>
                        <p id="settings-drawer-name" style="font-weight: 700; font-size: 18px; color: #fff; opacity: 1; margin: 0; letter-spacing: -0.3px;">Jouw profiel</p>
                        <p id="settings-drawer-meta" style="font-size: 13px; opacity: 0.6; margin: 2px 0;">Geen type • Nederland</p>
                    </div>
                <button class="settings-button" onclick="window.openSettingsSection('profile')">
                    Profiel bewerken
            </div>

            <!-- MENU SECTIES -->
            <div class="settings-section">
                <div class="settings-item" onclick="window.openSettingsSection('about')">
                    <i>🏷️</i>
                    <span>Over de app</span>
                </div>
                <div class="settings-item" onclick="window.openSettingsSection('storage')">
                    <i>💾</i>
                    <span>Data & Opslag</span>
                </div>
                <div class="settings-item" onclick="window.openSettingsSection('faq')">
                    <i>❓</i>
                    <span>Veelgestelde vragen</span>
                </div>
            </div>

            <!-- THEME SECTIE -->
            <div class="settings-section settings-theme-section">
                <p class="settings-section-label">Thema</p>
                <div class="theme-choice-list" role="group" aria-label="Kies thema">
                    <button type="button" class="theme-choice" data-theme-choice="light" aria-pressed="false" onclick="window.setAppTheme('light')">
                        <span class="theme-choice-swatch theme-choice-swatch-light" aria-hidden="true"></span><span>Licht</span>
                    </button>
                    <button type="button" class="theme-choice" data-theme-choice="dark" aria-pressed="false" onclick="window.setAppTheme('dark')">
                        <span class="theme-choice-swatch theme-choice-swatch-dark" aria-hidden="true"></span><span>Donker</span>
                    </button>
                    <button type="button" class="theme-choice" data-theme-choice="playful" aria-pressed="false" onclick="window.setAppTheme('playful')">
                        <span class="theme-choice-swatch theme-choice-swatch-playful" aria-hidden="true"></span><span>Warm</span>
                    </button>
                </div>
            </div>

            <!-- WEERGAVE SECTIE (DESKTOP) -->
            <div class="settings-section hidden-mobile-settings" style="margin-top: 10px;">
                <p style="font-size: 11px; font-weight: 700; color: #fff; opacity: 0.4; margin: 0 0 8px 14px; text-transform: uppercase;">Werkruimte breedte</p>
                <div style="display: flex; gap: 8px; padding: 0 12px; margin-bottom: 12px;">
                    <button class="layout-toggle-btn" data-layout-choice="standard"
                            onclick="window.toggleLayoutWidth('standard')"
                            style="flex: 1; padding: 10px; border-radius: 10px; border: 1px solid rgba(255,255,255,0.1); background: transparent; color: #fff; font-size: 13px; font-weight: 600; cursor: pointer;">
                        Standaard
                    </button>
                    <button class="layout-toggle-btn" data-layout-choice="wide"
                            onclick="window.toggleLayoutWidth('wide')"
                            style="flex: 1; padding: 10px; border-radius: 10px; border: 1px solid rgba(255,255,255,0.1); background: transparent; color: #fff; font-size: 13px; font-weight: 600; cursor: pointer;">
                        Breed
                    </button>
                </div>
            </div>

            <style>
                @media (max-width: 800px) {
                    .hidden-mobile-settings { display: none !important; }
                }
            </style>

            <div class="settings-footer" style="padding: 20px 14px; opacity: 0.4; font-size: 12px; text-align: center;">
                Versie 1.3.2 🌱 KweekKompas
            </div>

        </div>
    `;
}

/* Fase 7C settings page: one scrollable overview keeps profile, display,
   local data and help in the existing drawer without changing storage APIs. */
function getSettingsHTML() {
    return `
        <div class="settings-page" aria-labelledby="settings-page-title">
            <div class="settings-header settings-page-header">
                <div>
                    <p class="settings-kicker">Persoonlijk en lokaal</p>
                    <h2 id="settings-page-title">Instellingen</h2>
                    <p class="settings-page-intro">Beheer je profiel, weergave en lokale gegevens op één rustige plek.</p>
                </div>
                <button class="settings-close-button" type="button" aria-label="Instellingen sluiten" onclick="toggleSettingsPanel_REPAIR_V131()">×</button>
            </div>

            <div class="settings-content">
                <section class="settings-page-section settings-profile-section" id="settings-section-profile" aria-labelledby="settings-profile-title" tabindex="-1">
                    <div class="settings-section-heading">
                        <div><p class="settings-section-eyebrow">Profiel</p><h3 id="settings-profile-title">Jouw profiel</h3><p>Deze gegevens helpen KweekKompas je tuin en planning persoonlijk te tonen.</p></div>
                        <div class="settings-profile-summary" aria-label="Huidig profiel"><div class="settings-profile-avatar"><img id="settings-drawer-photo" src="assets/default-avatar.png" alt="" aria-hidden="true"></div><div><strong id="settings-drawer-name">Jouw profiel</strong><span id="settings-drawer-meta">Geen type • Nederland</span></div></div>
                    </div>
                    <div class="settings-profile-editor">
                        <div class="settings-avatar-editor">
                            <div class="settings-avatar-frame" id="profile-avatar-container"><img id="profile-avatar-preview" src="assets/default-avatar.png" alt="Voorbeeld van je profielfoto"></div>
                            <button class="settings-secondary-button settings-photo-trigger" type="button" data-profile-photo-trigger>Nieuwe foto</button>
                            <input type="file" id="profile-photo-upload" accept="image/*" hidden>
                            <label class="settings-range-label" for="profile-modal-zoom"><span>Foto bijsnijden</span><output id="zoom-value">100%</output></label>
                            <input id="profile-modal-zoom" class="settings-range" type="range" min="1" max="3" step="0.05" value="1" aria-label="Profielfoto zoomen">
                            <small>Sleep de foto om de uitsnede te verplaatsen.</small>
                        </div>
                        <div class="settings-form-grid">
                            <label class="settings-field"><span>Jouw naam</span><input id="profile-modal-name" type="text" placeholder="Hoe mogen we je noemen?"></label>
                            <label class="settings-field"><span>Ervaring</span><select id="profile-modal-experience"><option value="">Later invullen</option><option value="Beginner">Beginner</option><option value="Gemiddeld">Gemiddeld</option><option value="Expert">Expert (bestaand profiel)</option><option value="Ervaren">Ervaren</option></select></label>
                            <label class="settings-field"><span>Klimaat</span><select id="profile-modal-climate"><option value="Nederland (Zeeklimaat)">Nederland / België (zeeklimaat)</option><option value="Warm (Subtropisch)">Warm / kas (subtropisch)</option><option value="Koud (Continentaal)">Koud (continentaal)</option></select></label>
                            <label class="settings-field"><span>Eenheden</span><select id="profile-modal-units"><option value="Metric">Metrisch (cm / °C)</option><option value="Imperial">Imperiaal (inch / °F)</option></select></label>
                            <label class="settings-field"><span>Zonlicht</span><select id="profile-modal-light"><option value="">Later invullen</option><option value="Zon">Volle zon</option><option value="Halfschaduw">Halfschaduw</option><option value="Schaduw">Schaduw</option></select></label>
                            <label class="settings-field"><span>Hoofdplek</span><select id="profile-modal-garden-type"><option value="">Geen hoofdplek</option><option value="Volle grond">Volle grond</option><option value="Bakken of potten">Bakken of potten</option><option value="Balkon of terras">Balkon of terras</option><option value="Moestuin">Moestuin (bestaand profiel)</option><option value="Achtertuin">Achtertuin (bestaand profiel)</option><option value="Balkon">Balkon (bestaand profiel)</option><option value="Gemengd">Gemengd (bestaand profiel)</option><option value="Volkstuin">Volkstuin (bestaand profiel)</option><option value="Geen">Geen (potten)</option></select></label>
                            <fieldset class="settings-field settings-field-wide settings-garden-places"><legend>Tuinplekken</legend><div class="settings-garden-place-options"><label><input type="checkbox" data-profile-garden-place value="Volle grond">Volle grond</label><label><input type="checkbox" data-profile-garden-place value="Bakken of potten">Bakken of potten</label><label><input type="checkbox" data-profile-garden-place value="Balkon of terras">Balkon of terras</label></div></fieldset>
                        </div>
                    </div>
                </section>

                <section class="settings-page-section" id="settings-section-display" aria-labelledby="settings-display-title" tabindex="-1">
                    <div class="settings-section-heading"><div><p class="settings-section-eyebrow">Weergave</p><h3 id="settings-display-title">Kies je sfeer</h3><p>Dezelfde functies, met een andere visuele toon.</p></div></div>
                    <div class="theme-choice-list settings-theme-grid" role="group" aria-label="Kies thema">
                        <button type="button" class="theme-choice" data-theme-choice="light" aria-pressed="false" onclick="window.setAppTheme('light')"><span class="theme-choice-swatch theme-choice-swatch-light" aria-hidden="true"></span><span>Licht</span><small>Rustig en helder</small></button>
                        <button type="button" class="theme-choice" data-theme-choice="dark" aria-pressed="false" onclick="window.setAppTheme('dark')"><span class="theme-choice-swatch theme-choice-swatch-dark" aria-hidden="true"></span><span>Donker</span><small>Diep en kalm</small></button>
                        <button type="button" class="theme-choice" data-theme-choice="playful" aria-pressed="false" onclick="window.setAppTheme('playful')"><span class="theme-choice-swatch theme-choice-swatch-playful" aria-hidden="true"></span><span>Warm</span><small>Crème, groen en koraal</small></button>
                    </div>
                    <div class="settings-layout-control"><div><strong>Werkruimtebreedte</strong><span>Gebruik de beschikbare ruimte op grotere schermen.</span></div><div class="settings-layout-buttons" role="group" aria-label="Werkruimtebreedte"><button class="layout-toggle-btn" type="button" data-layout-choice="standard" onclick="window.toggleLayoutWidth('standard')">Standaard</button><button class="layout-toggle-btn" type="button" data-layout-choice="wide" onclick="window.toggleLayoutWidth('wide')">Breed</button></div></div>
                </section>

                ${window.KweekServices?.settingsHTML() || ''}

                <section class="settings-page-section" id="settings-section-storage" aria-labelledby="settings-storage-title" tabindex="-1">
                    <div class="settings-section-heading"><div><p class="settings-section-eyebrow">Data & opslag</p><h3 id="settings-storage-title">Opgeslagen op dit apparaat</h3><p>Je gegevens worden automatisch op dit apparaat opgeslagen.</p></div></div>
                    <div class="settings-info-note"><strong>Een account is niet nodig</strong><span>Je kunt de app zonder account gebruiken. Via Account & cloud kun je zelf een kopie synchroniseren. Inloggen verandert je lokale tuin niet.</span></div>
                    <div class="settings-data-grid">
                        <article class="settings-data-card"><div><h4>Back-up downloaden</h4><p>Download een volledige back-up als bestand om zelf te bewaren.</p></div><button class="settings-primary-button" type="button" onclick="exportData()">Back-up downloaden</button></article>
                        <article class="settings-data-card"><div><h4>Back-up herstellen</h4><p>Zet een back-up terug. Wat in het bestand staat vervangt de bijbehorende gegevens; de rest blijft bewaard. Je bevestigt dit eerst.</p></div><button class="settings-primary-button" type="button" onclick="restoreBackup()">Back-up herstellen</button></article>
                        <article class="settings-data-card"><div><h4>Data importeren</h4><p>Open een opgeslagen bestand. Importeren werkt hetzelfde als herstellen: je bevestigt eerst wat wordt vervangen.</p></div><button class="settings-secondary-button" type="button" onclick="importData()">Data importeren</button></article>
                        <article class="settings-data-card"><div><h4>Voorbeeldtuin</h4><p>Voeg voorbeeldplanten met foto's en teeltinformatie toe. Je eigen planten blijven bewaard. Planten die er al staan worden overgeslagen.</p><p id="example-garden-status" role="status" aria-live="polite"></p></div><button id="load-example-garden" class="settings-secondary-button" type="button" onclick="loadExampleGarden(this)" aria-describedby="example-garden-status">Voorbeeldtuin laden</button></article>
                    </div>
                    <div class="settings-danger-zone"><div><p class="settings-section-eyebrow">Gevarenzone</p><h4>Applicatie resetten</h4><p>Verwijdert alle zaden, instellingen en lokale gegevens. Dit kan niet ongedaan worden gemaakt.</p></div><button class="settings-danger-button" type="button" onclick="resetApp()">Alles verwijderen</button></div>
                </section>

                <section class="settings-page-section" id="settings-section-about" aria-labelledby="settings-about-title" tabindex="-1"><div class="settings-section-heading"><div><p class="settings-section-eyebrow">Over de app</p><h3 id="settings-about-title">KweekKompas</h3><p>Een overzichtelijke lokale planner voor zaaien, verzorgen en oogsten.</p></div><span class="settings-version">Versie 1.3.2</span></div></section>

                <section class="settings-page-section settings-faq-section" id="settings-section-faq" aria-labelledby="settings-faq-title" tabindex="-1"><div class="settings-section-heading"><div><p class="settings-section-eyebrow">Hulp</p><h3 id="settings-faq-title">Veelgestelde vragen</h3></div></div><details><summary>Worden mijn gegevens opgeslagen?</summary><p>Ja. Je gegevens worden automatisch op dit apparaat opgeslagen. Een account is niet nodig.</p></details><details><summary>Kan ik een back-up maken?</summary><p>Ja. Gebruik Back-up downloaden en bewaar het bestand op een veilige plek.</p></details></section>
            </div>
        </div>
    `;
}

window.setAppTheme = function(theme) {
    saveAppTheme(theme);
    if (isSettingsOpen) renderSettingsPanel();
};

// Compatibility for older markup/extensions that still call the checkbox API.
window.toggleThemeFromPanel = function(checkbox) {
    window.setAppTheme(checkbox?.checked ? 'dark' : 'light');
};

window.toggleLayoutWidth = function(type) {
    document.body.classList.remove('layout-standard', 'layout-full', 'layout-wide');
    document.body.classList.add('layout-' + type);
    localStorage.setItem('layout_width', type);
    renderSettingsPanel(); // Ververs om actieve staat te tonen
}

const tagCategories = {
    "Groei": ["Voorzaaien", "Direct zaaien", "Klimplant", "Snelle groeier"],
    "Levenscyclus": ["Eenjarig", "Tweejarig", "Vaste plant", "Winterhard"],
    "Gebruik": ["Eetbaar", "Kruidenplant", "Sierplant", "Snijbloem", "Droogbloem", "Potten", "Border"],
    "Ecosysteem": ["Bijvriendelijk", "Vlinderplant", "Insectwerend", "Companion plant"],
    "Moeilijkheid": ["Beginner", "Makkelijk", "Weinig onderhoud", "Gevoelig voor vorst", "Niet verplanten", "Lastige kiemer"]
};

const tagCategoryOrder = ["Groei", "Levenscyclus", "Gebruik", "Ecosysteem", "Moeilijkheid"];

const mockData = {
    "tomaat": { type: "Groente", zaaitijd: "Maart - April", oogsttijd: "Juli - Oktober", standplaats: "Kas", water: "Veel", tips: "Heel veel zon en warmte (Kas is perfect). Geef ruim water en dief wekelijks de okselscheuten. Vraagt veel voeding (vruchtgroente-mest).", tags: ["Voorzaaien", "Eenjarig", "Eetbaar", "Potten", "Snelle groeier"] },
    "paprika": { type: "Groente", zaaitijd: "Februari - Maart", oogsttijd: "Juli - Oktober", standplaats: "Kas", water: "Gemiddeld", tips: "Warmte en zon zijn cruciaal. Heeft veel water nodig maar absoluut geen natte voeten. Geef regelmatig voeding zodra bloemetjes verschijnen.", tags: ["Voorzaaien", "Eenjarig", "Eetbaar", "Potten", "Gevoelig voor vorst"] },
    "komkommer": { type: "Groente", zaaitijd: "April - Mei", oogsttijd: "Juli - September", standplaats: "Kas", water: "Veel", tips: "Warmteminner. Houdt van een hoge luchtvochtigheid. Zeer dorstig, geef dagelijks lauw water bij de voet (niet op het blad). Verwijder zijscheuten.", tags: ["Voorzaaien", "Klimplant", "Snelle groeier", "Eenjarig", "Eetbaar"] },
    "courgette": { type: "Groente", zaaitijd: "April - Mei", oogsttijd: "Juli - Oktober", standplaats: "Zon", water: "Veel", tips: "Bizarre groeier, vraagt veel ruimte. Geef dagelijks een grote slok water op de aarde (niet op het blad, i.v.m. meeldauw). Zorg voor zeer voedzame grond.", tags: ["Voorzaaien", "Snelle groeier", "Eetbaar", "Bijvriendelijk", "Eenjarig"] },
    "aubergine": { type: "Groente", zaaitijd: "Februari - Maart", oogsttijd: "Augustus - Oktober", standplaats: "Kas", water: "Gemiddeld", tips: "Zeer warmtebehoevend, het liefst in een kas. Giet altijd op aarde (niet op de plant). Top de plant als er 4-5 vruchten aanzitten.", tags: ["Voorzaaien", "Gevoelig voor vorst", "Eetbaar", "Potten", "Eenjarig"] },
    "peper": { type: "Groente", zaaitijd: "Januari - Maart", oogsttijd: "Augustus - Oktober", standplaats: "Kas", water: "Weinig", tips: "Pepertjes kiemen traag en heet! Vinden het vaak fijner iets droger te staan in goed doorlatende grond. Dat bevordert bovendien de pittigheid.", tags: ["Voorzaaien", "Eetbaar", "Potten", "Gevoelig voor vorst", "Eenjarig"] },
    "meloen": { type: "Fruit", zaaitijd: "April - Mei", oogsttijd: "Augustus - September", standplaats: "Kas", water: "Gemiddeld", tips: "Tropische wensen! Heeft de warmte van de kas nodig. Zijtakken die vrucht dragen knip je na 1 blad boven de vrucht af.", tags: ["Voorzaaien", "Klimplant", "Eetbaar", "Gevoelig voor vorst", "Snelle groeier"] },
    "sla": { type: "Groente", zaaitijd: "Maart - Augustus", oogsttijd: "Mei - Oktober", standplaats: "Halfschaduw", water: "Gemiddeld", tips: "Zon is prima, maar bij hitte schieten ze snel door of worden sappige bladen bitter. Geef water om de bladeren knapperig te houden.", tags: ["Direct zaaien", "Makkelijk", "Eetbaar", "Potten", "Snelle groeier"] },
    "zonnebloem": { type: "Bloem", zaaitijd: "April - Mei", oogsttijd: "Augustus - September", standplaats: "Zon", water: "Veel", tips: "De absolute grootgebruiker van water, warmte en zon. Snel and groot dus ideaal voor in de volle grond.", tags: ["Direct zaaien", "Eenjarig", "Sierplant", "Bijvriendelijk", "Vlinderplant", "Snelle groeier", "Potten", "Makkelijk"] },
    "radijs": { type: "Groente", zaaitijd: "Maart - Augustus", oogsttijd: "Mei - Oktober", standplaats: "Halfschaduw", water: "Gemiddeld", tips: "Groeit razendsnel. Houd de grond vochtig voor malse radijsjes; te droge grond maakt ze houterig en te scherp.", tags: ["Direct zaaien", "Makkelijk", "Eetbaar", "Snelle groeier", "Potten"] },
    "augurk": { type: "Groente", zaaitijd: "Mei - Juni", oogsttijd: "Juli - September", standplaats: "Zon", water: "Hoog", tips: "Houdt van warmte en veel vocht. Laat de plant bij voorkeur klimmen tegen gaas om ziektes en kromme vruchten te voorkomen.", tags: ["Voorzaaien", "Klimplant", "Hittebestendig", "Eetbaar"] },
    "wortel": { type: "Groente", zaaitijd: "Maart - Juli", oogsttijd: "Juni - November", standplaats: "Zon", water: "Gemiddeld", tips: "Zorg for een diep losgemaakte grond zonder stenen voor rechte wortels. Zaai dun uit of dun later uit om ruimte te geven.", tags: ["Direct zaaien", "Makkelijk", "Eetbaar", "Winterhard"] },
    "madeliefje": { type: "Bloem", zaaitijd: "Maart - Mei", oogsttijd: "Mei - Oktober", standplaats: "Zon", water: "Gemiddeld", tips: "Madeliefjes zijn ijzersterk en bloeien bijna het hele jaar door. Ze zaaien zichzelf ook makkelijk uit in het gazon.", tags: ["Vaste plant", "Makkelijk", "Sierplant", "Eetbaar", "Bijvriendelijk"] },
    "lavendel": { type: "Struik", zaaitijd: "Maart - April", oogsttijd: "Juli - September", standplaats: "Zon", water: "Weinig", tips: "Zet op een zonnige plek in kalkrijke grond. Snoei twee keer per jaar om de plant compact te houden.", tags: ["Vaste plant", "Bijvriendelijk", "Sierplant", "Winterhard"] },
    "siergras": { type: "Sierplant", zaaitijd: "Maart - Mei", oogsttijd: "Geheel Jaar", standplaats: "Zon", water: "Gemiddeld", tips: "Knip in het vroege voorjaar (maart) de dode stengels terug tot 10cm boven de grond voor frisse nieuwe groei.", tags: ["Sierplant", "Winterhard", "Weinig onderhoud"] },
    "spinazie": { type: "Groente", zaaitijd: "Februari - September", oogsttijd: "April - November", standplaats: "Halfschaduw", water: "Gemiddeld", tips: "Groeit snel en houdt niet van te veel hitte. Zaai in het voorjaar en najaar voor de beste resultaten.", tags: ["Direct zaaien", "Makkelijk", "Eetbaar", "Snelle groeier"] },
    "boerenkool": { type: "Groente", zaaitijd: "Mei - Juli", oogsttijd: "Oktober - Februari", standplaats: "Zon", water: "Gemiddeld", tips: "Een echte wintergroente. Smaakt het lekkerst als de vorst eroverheen is gegaan.", tags: ["Direct zaaien", "Winterhard", "Eetbaar"] },
    "broccoli": { type: "Groente", zaaitijd: "Maart - Juni", oogsttijd: "Juni - September", standplaats: "Zon", water: "Gemiddeld", tips: "Heeft veel voeding nodig. Oogst de hoofdscherm op tijd om zijscheuten te stimuleren.", tags: ["Voorzaaien", "Eetbaar"] },
    "bloemkool": { type: "Groente", zaaitijd: "Februari - Juli", oogsttijd: "Juni - Oktober", standplaats: "Zon", water: "Hoog", tips: "Vraagt constante vochtigheid en veel voeding. Dek de kool af met eigen blad tegen verkleuring.", tags: ["Voorzaaien", "Eetbaar"] },
    "prei": { type: "Groente", zaaitijd: "Maart - Mei", oogsttijd: "September - April", standplaats: "Zon", water: "Gemiddeld", tips: "Plant diep in een geul voor een lange witte schacht. Kan goed tegen vorst.", tags: ["Voorzaaien", "Winterhard", "Eetbaar"] },
    "ui": { type: "Groente", zaaitijd: "Maart - April", oogsttijd: "Augustus - September", standplaats: "Zon", water: "Laag", tips: "Houdt van goed doorlatende grond. Oogst als het loof gaat liggen en laat goed drogen.", tags: ["Direct zaaien", "Eetbaar"] },
    "knoflook": { type: "Groente", zaaitijd: "September - November", oogsttijd: "Juni - Juli", standplaats: "Zon", water: "Laag", tips: "Plant in het najaar voor de beste ontwikkeling van de bollen. Heeft een koudeperiode nodig.", tags: ["Direct zaaien", "Winterhard", "Eetbaar"] },
    "peterselie": { type: "Kruid", zaaitijd: "Maart - Juli", oogsttijd: "Juni - November", standplaats: "Halfschaduw", water: "Gemiddeld", tips: "Kiemt traag. Houd de grond goed vochtig tijdens het kiemen.", tags: ["Direct zaaien", "Eetbaar", "Potten"] },
    "bieslook": { type: "Kruid", zaaitijd: "Maart - Augustus", oogsttijd: "Mei - Oktober", standplaats: "Zon", water: "Gemiddeld", tips: "Vaste plant die elk jaar terugkomt. Knip regelmatig om nieuwe groei te stimuleren.", tags: ["Vaste plant", "Eetbaar", "Bijvriendelijk"] },
    "munt": { type: "Kruid", zaaitijd: "Maart - Mei", oogsttijd: "Mei - Oktober", standplaats: "Halfschaduw", water: "Gemiddeld", tips: "Woekert enorm, dus plant bij voorkeur in een pot.", tags: ["Vaste plant", "Eetbaar", "Potten"] },
    "rozemarijn": { type: "Kruid", zaaitijd: "Maart - Mei", oogsttijd: "Geheel Jaar", standplaats: "Zon", water: "Laag", tips: "Houdt van kalkrijke, droge grond. Snoei licht na de bloei.", tags: ["Vaste plant", "Winterhard", "Bijvriendelijk"] },
    "tijm": { type: "Kruid", zaaitijd: "Maart - Mei", oogsttijd: "Geheel Jaar", standplaats: "Zon", water: "Laag", tips: "Zet op een zonnige, droge plek. Perfect voor rotstuinen of potten.", tags: ["Vaste plant", "Winterhard", "Bijvriendelijk"] },
    "salie": { type: "Kruid", zaaitijd: "Maart - Mei", oogsttijd: "Geheel Jaar", standplaats: "Zon", water: "Laag", tips: "Heeft zilverachtig blad en prachtige bloemen. Houdt van zon en droogte.", tags: ["Vaste plant", "Winterhard", "Bijvriendelijk"] },
    "aardbei": { type: "Fruit", zaaitijd: "Maart - April", oogsttijd: "Juni - Juli", standplaats: "Zon", water: "Gemiddeld", tips: "Vaste plant die uitlopers maakt. Geef stro onder de vruchten tegen rot.", tags: ["Vaste plant", "Eetbaar", "Potten"] },
    "framboos": { type: "Fruit", zaaitijd: "Oktober - Maart", oogsttijd: "Juli - September", standplaats: "Zon", water: "Gemiddeld", tips: "Snoei zomerframbozen na de oogst tot de grond terug.", tags: ["Vaste plant", "Winterhard", "Eetbaar"] },
    "blauwe bes": { type: "Fruit", zaaitijd: "Oktober - Maart", oogsttijd: "Juli - Augustus", standplaats: "Zon", water: "Gemiddeld", tips: "Houdt van zure grond. Gebruik tuinturf bij het planten.", tags: ["Vaste plant", "Winterhard", "Eetbaar"] },
    "goudsbloem": { type: "Bloem", zaaitijd: "Maart - Juni", oogsttijd: "Juni - Oktober", standplaats: "Zon", water: "Gemiddeld", tips: "Makkelijke plant die zichzelf uitzaait. De bloemblaadjes zijn eetbaar.", tags: ["Eenjarig", "Eetbaar", "Bijvriendelijk", "Makkelijk"] },
    "oost-indische kers": { type: "Bloem", zaaitijd: "April - Juni", oogsttijd: "Juni - Oktober", standplaats: "Zon", water: "Gemiddeld", tips: "Bloemen en bladeren zijn eetbaar en hebben een peperige smaak. Houdt bladluis weg.", tags: ["Eenjarig", "Eetbaar", "Snelle groeier", "Klimplant"] },
    "lavatera": { type: "Bloem", zaaitijd: "Maart - Mei", oogsttijd: "Juli - September", standplaats: "Zon", water: "Gemiddeld", tips: "Bloeit zeer rijk met grote roze of witte bloemen. Houdt van voedzame grond.", tags: ["Eenjarig", "Bijvriendelijk", "Sierplant"] },
    "lathyrus": { type: "Bloem", zaaitijd: "Maart - Mei", oogsttijd: "Juni - September", standplaats: "Zon", water: "Gemiddeld", tips: "Heerlijk geurende klimplant. Hoe meer je plukt, hoe meer hij bloeit.", tags: ["Eenjarig", "Klimplant", "Aromatisch"] },
    "cosmea": { type: "Bloem", zaaitijd: "April - Mei", oogsttijd: "Juli - Oktober", standplaats: "Zon", water: "Gemiddeld", tips: "Elegante plant met fijn blad. Bloeit tot de eerste vorst.", tags: ["Eenjarig", "Bijvriendelijk", "Sierplant"] },
    "tagetes": { type: "Bloem", zaaitijd: "Maart - Mei", oogsttijd: "Juni - Oktober", standplaats: "Zon", water: "Gemiddeld", tips: "Ook wel afrikaantjes genoemd. Helpt aaltjes in de grond te bestrijden.", tags: ["Eenjarig", "Bijvriendelijk", "Companion plant"] },
    "dahlias": { type: "Bloem", zaaitijd: "April - Mei", oogsttijd: "Juli - November", standplaats: "Zon", water: "Veel", tips: "Haal de knollen voor de vorst uit de grond. Bloeit fantastisch tot diep in de herfst.", tags: ["Vaste plant", "Sierplant", "Snijbloem"] }
};

// --- INDEXED DB WRAPPER ---
const DB_NAME = 'MoestuinDB';
const STORE_NAME = 'seeds';
let db = null;
let seeds = [];

function initDB() {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open(DB_NAME, 1);
        request.onupgradeneeded = (e) => {
            const database = e.target.result;
            if (!database.objectStoreNames.contains(STORE_NAME)) {
                database.createObjectStore(STORE_NAME, { keyPath: 'id' });
            }
        };
        request.onsuccess = (e) => {
            db = e.target.result;
            db.onversionchange = () => {
                db.close();
                db = null;
                console.warn('[KweekKompas] Lokale database is niet meer beschikbaar.');
            };
            resolve(db);
        };
        request.onerror = (e) => reject(e.target.error);
    });
}

function getAllSeeds() {
    if (!db) return Promise.reject(new Error('Lokale database is niet beschikbaar.'));

    return new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, 'readonly');
        const store = tx.objectStore(STORE_NAME);
        const req = store.getAll();
        req.onsuccess = () => {
            seeds = req.result.sort((a, b) => Number(b.id) - Number(a.id));
            resolve(seeds);
        };
        req.onerror = () => reject(req.error);
    });
}

function saveSeed(seed) {
    if (!db) return Promise.reject(new Error('Lokale database is niet beschikbaar.'));

    return new Promise((resolve, reject) => {
        let tx;
        let requestResult;
        let settled = false;
        const fail = error => {
            if (settled) return;
            settled = true;
            reject(error || new Error('Opslaan van zaad is mislukt.'));
        };

        try {
            tx = db.transaction(STORE_NAME, 'readwrite');
            tx.oncomplete = () => {
                if (settled) return;
                settled = true;
                void requestResult;
                resolve();
            };
            tx.onerror = event => fail(tx.error || event?.target?.error || new Error('Opslaan van zaad is mislukt.'));
            tx.onabort = event => fail(tx.error || event?.target?.error || new Error('Opslaan van zaad is afgebroken.'));

            const request = tx.objectStore(STORE_NAME).put(seed);
            request.onsuccess = () => { requestResult = request.result; };
            request.onerror = event => fail(request.error || event?.target?.error || new Error('Opslaan van zaad is mislukt.'));
        } catch (error) {
            fail(error);
            try { tx?.abort(); } catch (abortError) { /* already closed */ }
        }
    });
}

function replaceAllSeedsAtomic(seedsToRestore) {
    if (!db) return Promise.reject(new Error('Lokale database is niet beschikbaar.'));

    return new Promise((resolve, reject) => {
        let transaction;
        try {
            transaction = db.transaction(STORE_NAME, 'readwrite');
            const store = transaction.objectStore(STORE_NAME);
            store.clear();
            for (const seed of seedsToRestore) store.put(seed);

            transaction.oncomplete = () => resolve();
            transaction.onerror = () => reject(transaction.error || new Error('Opslaan van zaden is mislukt.'));
            transaction.onabort = () => reject(transaction.error || new Error('Opslaan van zaden is afgebroken.'));
        } catch (error) {
            try { transaction?.abort(); } catch (abortError) { /* already closed */ }
            reject(error);
        }
    });
}

function addExampleSeedsAtomic(examples) {
    if (!db) return Promise.reject(new Error('Lokale opslag is niet beschikbaar.'));
    const nameKey = value => String(value || '').normalize('NFKC').trim().replace(/\s+/g, ' ').toLocaleLowerCase('nl-NL');
    // Read and add in one transaction: simultaneous tabs cannot overwrite user
    // edits or add the same example twice. Existing records are never written.
    return new Promise((resolve, reject) => {
        let transaction;
        let added = 0;
        try {
            transaction = db.transaction(STORE_NAME, 'readwrite');
            const store = transaction.objectStore(STORE_NAME);
            const request = store.getAll();
            request.onsuccess = () => {
                try {
                    const existing = request.result;
                    const ids = new Set(existing.map(plant => String(plant.id)));
                    const names = new Set(existing.map(plant => nameKey(plant.naam)));
                    const keys = new Set(existing.map(plant => plant.examplePlantKey).filter(Boolean));
                    for (const example of examples) {
                        const key = String(example.id);
                        const name = nameKey(example.naam);
                        if (keys.has(key) || names.has(name)) continue;
                        let id = key;
                        let suffix = 2;
                        while (ids.has(id)) id = `${key}-${suffix++}`;
                        store.add({ ...example, id, examplePlantKey: key });
                        ids.add(id); names.add(name); keys.add(key); added++;
                    }
                } catch { transaction.abort(); }
            };
            transaction.oncomplete = () => resolve(added);
            transaction.onerror = () => reject(new Error('Voorbeeldtuin opslaan is mislukt. Er is niets toegevoegd.'));
            transaction.onabort = () => reject(new Error('Voorbeeldtuin opslaan is afgebroken. Er is niets toegevoegd.'));
        } catch (error) {
            try { transaction?.abort(); } catch { /* already closed */ }
            reject(error);
        }
    });
}

function deleteSeedDB(id) {
    if (!db) return Promise.reject(new Error('Lokale database is niet beschikbaar.'));

    return new Promise((resolve, reject) => {
        let tx;
        let requestResult;
        let settled = false;
        const fail = error => {
            if (settled) return;
            settled = true;
            reject(error || new Error('Verwijderen van zaad is mislukt.'));
        };

        try {
            tx = db.transaction(STORE_NAME, 'readwrite');
            tx.oncomplete = () => {
                if (settled) return;
                settled = true;
                void requestResult;
                resolve();
            };
            tx.onerror = event => fail(tx.error || event?.target?.error || new Error('Verwijderen van zaad is mislukt.'));
            tx.onabort = event => fail(tx.error || event?.target?.error || new Error('Verwijderen van zaad is afgebroken.'));

            const request = tx.objectStore(STORE_NAME).delete(id);
            request.onsuccess = () => { requestResult = request.result; };
            request.onerror = event => fail(request.error || event?.target?.error || new Error('Verwijderen van zaad is mislukt.'));
        } catch (error) {
            fail(error);
            try { tx?.abort(); } catch (abortError) { /* already closed */ }
        }
    });
}

// --- SAFE DYNAMIC CONTENT ---
const SAFE_AI_ACTION_TYPES = new Set(['sow', 'plant', 'harvest', 'care', 'log', 'recommend', 'buy', 'wishlist', 'none']);
const SAFE_AI_DESTINATIONS = new Set(['wishlist', 'todo']);
const AI_ACTION_ICONS = {
    sow: '🌱',
    plant: '🌱',
    harvest: '🥗',
    care: '💧',
    log: '📝',
    none: '💡'
};

function safeHttpUrl(value) {
    if (typeof value !== 'string' || !value.trim()) return '';
    try {
        const url = new URL(value);
        return url.protocol === 'http:' || url.protocol === 'https:' ? url.href : '';
    } catch (error) {
        return '';
    }
}

function safeWishlistImageUrl(value) {
    if (typeof value !== 'string') return '';
    const trimmed = value.trim();
    if (/^data:image\/(?:png|gif|jpe?g|webp|avif);base64,[a-z0-9+/]+={0,2}$/i.test(trimmed)) return trimmed;
    if (/^(?:\.?\/)?assets\/[a-z0-9/_-]+\.(?:png|gif|jpe?g|webp|avif)$/i.test(trimmed)) return trimmed;
    return safeHttpUrl(trimmed);
}

function safeProfileImageUrl(value) {
    return safeWishlistImageUrl(value) || 'assets/default-avatar.png';
}

function normalizeExternalImageResult(item) {
    if (!item || typeof item !== 'object') return null;
    const imageUrl = safeWishlistImageUrl(item.url || item.image || item.src);
    if (!imageUrl) return null;

    const sourceLink = safeHttpUrl(item.sourceLink || item.sourceUrl || item.link || item.photographerUrl || item.user?.links?.html);
    const title = typeof item.title === 'string' ? item.title : (typeof item.name === 'string' ? item.name : '');
    const description = typeof item.description === 'string' ? item.description : '';
    const photographer = typeof item.photographer === 'string' ? item.photographer :
        (typeof item.photographerName === 'string' ? item.photographerName : (typeof item.user?.name === 'string' ? item.user.name : ''));
    const alt = typeof item.alt === 'string' && item.alt.trim() ? item.alt : (title || description || 'Plantafbeelding');

    return { ...item, imageUrl, sourceLink, title, description, photographer, alt };
}

function buildImageSearchCard(item, { isSelected = false, isFeatured = false, onFeature, onToggle } = {}) {
    const normalized = normalizeExternalImageResult(item);
    if (!normalized) return null;

    const card = document.createElement('div');
    card.className = `unified-gallery-card ${isSelected ? 'selected' : ''} ${isFeatured ? 'featured' : ''}`.trim();
    const accessibleText = [normalized.title, normalized.description, normalized.photographer].filter(Boolean).join(' — ');
    if (accessibleText) card.setAttribute('aria-label', accessibleText);

    const image = document.createElement('img');
    image.src = normalized.imageUrl;
    image.alt = normalized.alt;
    image.loading = 'lazy';
    card.appendChild(image);

    const selectedCheck = document.createElement('div');
    selectedCheck.className = 'selected-check';
    selectedCheck.textContent = '\u2713';
    card.appendChild(selectedCheck);

    const featuredStar = document.createElement('div');
    featuredStar.className = 'featured-star';
    featuredStar.title = 'Stel in als hoofdfoto';
    featuredStar.textContent = '\u2605';
    featuredStar.addEventListener('click', event => {
        event.stopPropagation();
        onFeature?.(normalized);
    });
    card.appendChild(featuredStar);

    const featuredLabel = document.createElement('div');
    featuredLabel.className = 'featured-label';
    featuredLabel.textContent = 'Hoofdfoto';
    card.appendChild(featuredLabel);

    const overlay = document.createElement('div');
    overlay.className = 'card-overlay';
    const featureButton = document.createElement('button');
    featureButton.type = 'button';
    featureButton.className = 'card-feature-btn';
    featureButton.textContent = '\u2605 Maak hoofdfoto';
    featureButton.addEventListener('click', event => {
        event.stopPropagation();
        onFeature?.(normalized);
    });
    const selectButton = document.createElement('button');
    selectButton.type = 'button';
    selectButton.className = 'card-select-btn';
    selectButton.textContent = isSelected ? 'Verwijder' : 'Selecteer';
    selectButton.addEventListener('click', event => {
        event.stopPropagation();
        onToggle?.(normalized);
    });
    overlay.append(featureButton, selectButton);
    card.appendChild(overlay);

    if (normalized.sourceLink) {
        const sourceLink = document.createElement('a');
        sourceLink.className = 'image-source-link';
        sourceLink.href = normalized.sourceLink;
        sourceLink.target = '_blank';
        sourceLink.rel = 'noopener noreferrer';
        sourceLink.textContent = normalized.photographer ? `Foto: ${normalized.photographer}` : 'Bron';
        sourceLink.addEventListener('click', event => event.stopPropagation());
        card.appendChild(sourceLink);
    }

    card.addEventListener('click', event => {
        if (event.target.closest('button, a')) return;
        onToggle?.(normalized);
    });
    return card;
}

function setSafeText(element, value, fallback = '') {
    if (!element) return element;
    element.textContent = value === null || value === undefined ? fallback : String(value);
    return element;
}

function safeClassToken(value, fallback = 'item') {
    const token = typeof value === 'string' ? value.toLowerCase().replace(/[^a-z0-9_-]/g, '') : '';
    return /^[a-z][a-z0-9_-]*$/.test(token) ? token : fallback;
}

function appendHighlightedText(container, value, query) {
    if (!container) return;
    const text = value === null || value === undefined ? '' : String(value);
    const search = typeof query === 'string' ? query : '';
    if (!search) {
        container.textContent = text;
        return;
    }
    const escaped = search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const matcher = new RegExp(`(${escaped})`, 'gi');
    let cursor = 0;
    text.replace(matcher, (match, _group, offset) => {
        if (offset > cursor) container.appendChild(document.createTextNode(text.slice(cursor, offset)));
        const mark = document.createElement('mark');
        mark.textContent = match;
        container.appendChild(mark);
        cursor = offset + match.length;
        return match;
    });
    if (cursor < text.length) container.appendChild(document.createTextNode(text.slice(cursor)));
}

function groupUpcomingCalendarReminders(reminderList, todayStr) {
    const groups = [
        { label: 'Vandaag', items: [] },
        { label: 'Binnenkort', items: [] },
        { label: 'Later', items: [] }
    ];
    if (typeof todayStr !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(todayStr)) return groups;

    const [year, month, day] = todayStr.split('-').map(Number);
    const today = new Date(year, month - 1, day);
    if (today.getFullYear() !== year || today.getMonth() !== month - 1 || today.getDate() !== day) return groups;
    const soonEnd = new Date(year, month - 1, day);
    soonEnd.setDate(soonEnd.getDate() + 7);
    const soonEndStr = `${soonEnd.getFullYear()}-${String(soonEnd.getMonth() + 1).padStart(2, '0')}-${String(soonEnd.getDate()).padStart(2, '0')}`;
    const openReminders = (Array.isArray(reminderList) ? reminderList : [])
        .filter(reminder => !reminder?.done && typeof reminder?.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(reminder.date) && reminder.date >= todayStr)
        .sort((a, b) => a.date.localeCompare(b.date) || a.id - b.id);

    groups[0].items = openReminders.filter(reminder => reminder.date === todayStr);
    groups[1].items = openReminders.filter(reminder => reminder.date > todayStr && reminder.date <= soonEndStr);
    groups[2].items = openReminders.filter(reminder => reminder.date > soonEndStr);
    return groups;
}

function buildReminderRow(item, handlers = {}) {
    const row = document.createElement('div');
    row.className = `reminder-row ${item?.done ? 'done' : ''}`;

    const checkColumn = document.createElement('div');
    checkColumn.className = 'reminder-check-col';
    const checkbox = document.createElement('div');
    checkbox.className = `custom-checkbox ${item?.done ? 'active' : ''}`;
    checkbox.setAttribute('role', 'checkbox');
    checkbox.setAttribute('tabindex', '0');
    checkbox.setAttribute('aria-checked', String(Boolean(item?.done)));
    checkbox.setAttribute('aria-label', `${item?.done ? 'Heropen' : 'Voltooien'}: ${typeof item?.title === 'string' ? item.title : 'herinnering'}`);
    checkColumn.appendChild(checkbox);

    const textColumn = document.createElement('div');
    textColumn.className = 'reminder-text-col';
    const title = document.createElement('span');
    title.textContent = typeof item?.title === 'string' ? item.title : '';
    textColumn.appendChild(title);
    const meta = document.createElement('div');
    meta.className = 'reminder-meta';
    const date = document.createElement('span');
    date.className = 'reminder-date';
    const rawDate = typeof item?.date === 'string' ? item.date : '';
    const parsedDate = /^\d{4}-\d{2}-\d{2}$/.test(rawDate) ? new Date(`${rawDate}T00:00:00`) : null;
    date.textContent = parsedDate && Number.isFinite(parsedDate.getTime())
        ? parsedDate.toLocaleDateString('nl-NL', { day: 'numeric', month: 'long', year: 'numeric' })
        : rawDate;
    const status = document.createElement('span');
    status.className = `reminder-status ${item?.done ? 'is-done' : 'is-open'}`;
    status.textContent = item?.done ? 'Afgerond' : 'Open';
    meta.append(date, status);
    textColumn.appendChild(meta);

    const actionColumn = document.createElement('div');
    actionColumn.className = 'reminder-actions-col';
    const deleteButton = document.createElement('button');
    deleteButton.type = 'button';
    deleteButton.className = 'btn-delete-reminder';
    deleteButton.title = 'Verwijder';
    deleteButton.setAttribute('aria-label', 'Verwijder herinnering');
    deleteButton.textContent = '×';
    actionColumn.appendChild(deleteButton);

    const toggleReminder = event => {
        event.stopPropagation();
        handlers.onToggle?.(item);
    };
    checkbox.addEventListener('click', toggleReminder);
    checkbox.addEventListener('keydown', event => {
        if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            toggleReminder(event);
        }
    });
    deleteButton.addEventListener('click', event => {
        event.stopPropagation();
        handlers.onDelete?.(item);
    });

    row.append(checkColumn, textColumn, actionColumn);
    return row;
}

function buildCalendarReminderPills(dayReminders) {
    const wrapper = document.createElement('div');
    wrapper.className = 'cal-pills-container';
    const remindersForDay = Array.isArray(dayReminders) ? dayReminders : [];
    const visibleCount = Math.min(remindersForDay.length, 2);

    for (let index = 0; index < visibleCount; index += 1) {
        const pill = document.createElement('div');
        pill.className = 'cal-reminder-pill';
        const title = typeof remindersForDay[index]?.title === 'string' ? remindersForDay[index].title : '';
        let label = title.split(' ')[0] || '';
        if (label.length > 10) label = `${label.substring(0, 9)}…`;
        pill.textContent = label;
        wrapper.appendChild(pill);
    }

    if (remindersForDay.length > 2) {
        const more = document.createElement('div');
        more.className = 'cal-pill-more';
        more.textContent = `+${remindersForDay.length - 2}`;
        wrapper.appendChild(more);
    }
    return wrapper;
}

function normalizeAIAction(action) {
    if (!action || typeof action !== 'object' || typeof action.type !== 'string') return null;
    const type = action.type.trim().toLowerCase();
    if (!SAFE_AI_ACTION_TYPES.has(type)) return null;
    if (action.destination !== undefined && !SAFE_AI_DESTINATIONS.has(action.destination)) return null;
    if (action.plantName !== undefined && typeof action.plantName !== 'string') return null;
    const plantName = action.plantName?.trim() || '';
    const subject = plantName || (['buy', 'wishlist', 'care', 'log'].includes(type) && typeof action.subject === 'string' ? action.subject.trim() : '');
    if (!subject || subject.length > 160 || /^(?:plant|plantnaam|unknown|onbekend|n\/a|none|null|-|\?)$/i.test(subject)) return null;
    const wishlist = ['recommend', 'buy', 'wishlist'].includes(type) || action.destination === 'wishlist';
    if (type === 'none' && !wishlist) return null;
    if (wishlist && action.destination === 'todo') return null;
    const label = typeof action.label === 'string' ? action.label.trim() : '';
    const bareLabel = !label || /^(?:sow|plant|harvest|care|log|zaaien|planten|oogsten|verzorgen|noteren)$/i.test(label);
    const verbs = {
        sow: /\b(?:zaai|zaaien|sow|sowing)\b/i,
        plant: /\b(?:plant|planten|uitplanten|aanplanten|planting)\b/i,
        harvest: /\b(?:oogst|oogsten|harvest|harvesting)\b/i,
        care: /\b(?:water|bemest|bemesten|snoei|snoeien|verpot|verpotten|wied|wieden|controleer|controleren|bescherm|beschermen|verzorg|verzorgen|prune|fertilize)\b/i,
        log: /\b(?:noteer|noteren|registreer|registreren|log|record)\b/i
    };
    // A description or variety recommendation is not evidence of a garden task.
    if (!wishlist && ((!bareLabel && !verbs[type]?.test(label)) || (['care', 'log'].includes(type) && bareLabel))) return null;
    const date = action.date == null || action.date === '' ? '' : action.date;
    if (typeof date !== 'string' || (date && !isAIPlanningDate(date))) return null;
    const titles = { sow: 'Zaaien', plant: 'Planten', harvest: 'Oogsten', care: 'Verzorgen', log: 'Noteren' };
    return {
        type, plantName, subject, date,
        label: `${wishlist ? 'Op verlanglijst' : titles[type]}: ${subject}`,
        detail: bareLabel || ['sow', 'plant', 'harvest'].includes(type) ? '' : label,
        title: ['care', 'log'].includes(type) ? `${subject}: ${label}` : `${subject} ${titles[type]?.toLowerCase()}`,
        wishlistType: plantName ? 'seed' : 'item',
        destination: wishlist ? 'wishlist' : 'todo'
    };
}

function isAIPlanningDate(value) {
    if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
    const [year, month, day] = value.split('-').map(Number);
    const date = new Date(year, month - 1, day);
    return year >= 1000 && date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day;
}

function filterWishlistItems(items, typeFilter = 'all', query = '') {
    const normalizedQuery = typeof query === 'string' ? query.trim().toLocaleLowerCase('nl-NL') : '';
    return (Array.isArray(items) ? items : []).filter(item => {
        if (typeFilter !== 'all' && item?.type !== typeFilter) return false;
        if (!normalizedQuery) return true;
        return [item?.name, item?.note, item?.link, item?.type].some(value =>
            typeof value === 'string' && value.toLocaleLowerCase('nl-NL').includes(normalizedQuery)
        );
    });
}

function createWishlistIcon(name) {
    const paths = {
        seed: 'M12 20v-8m0 3c-4 0-6-2.2-6-6 4 0 6 2 6 6Zm0-2c0-4 2.2-6 6-6 0 4-2 6-6 6Z',
        item: 'M4 8h16l-1.5 12h-13L4 8Zm-1-4h18v4H3Zm9 4V4',
        open: 'M14 4h6v6m0-6-9 9m5-4v9H4V6h9',
        edit: 'm4 16.5-.8 4.3 4.3-.8L20 7.5 16.5 4 4 16.5Zm10.8-10.8 3.5 3.5',
        trash: 'M4 7h16m-10 4v6m4-6v6M6 7l1 14h10l1-14M9 7V4h6v3',
        plus: 'M12 5v14M5 12h14'
    };
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('viewBox', '0 0 24 24');
    svg.setAttribute('aria-hidden', 'true');
    svg.setAttribute('focusable', 'false');
    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    path.setAttribute('d', paths[name] || paths.seed);
    path.setAttribute('fill', 'none');
    path.setAttribute('stroke', 'currentColor');
    path.setAttribute('stroke-width', '1.7');
    path.setAttribute('stroke-linecap', 'round');
    path.setAttribute('stroke-linejoin', 'round');
    svg.appendChild(path);
    return svg;
}

function createPlantDetailIcon(name, filled = false) {
    const paths = {
        sprout: 'M12 20V10m0 3c-4.5 0-7-2.2-7-6 4.8 0 7 2 7 6Zm0 1c4.3 0 7-2.3 7-6-4.6 0-7 2.2-7 6Z',
        leaf: 'M19.5 4.5C10 4 5 8 5 13.5A5.5 5.5 0 0 0 10.5 19C16 19 20 14 19.5 4.5ZM5 20c2.5-4 6-7.5 11-10',
        basket: 'M4 10h16l-2 10H6L4 10Zm3-1 5-5 5 5m-8 4v4m4-4v4m4-4v4',
        sun: 'M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8Zm0-5v2m0 14v2M4.9 4.9l1.4 1.4m11.4 11.4 1.4 1.4M3 12h2m14 0h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4',
        water: 'M12 3c-2.5 4-7 8-7 12a7 7 0 0 0 14 0c0-4-4.5-8-7-12Zm-4 12a4 4 0 0 0 4 4',
        status: 'M7 4h10v4H7V4ZM7 6H4v15h16V6h-3M8 13l3 3 5-5',
        location: 'M19 10c0 5-7 11-7 11S5 15 5 10a7 7 0 1 1 14 0Zm-4 0a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z',
        calendar: 'M7 3v3m10-3v3M4 9h16M5 5h14a1 1 0 0 1 1 1v13H4V6a1 1 0 0 1 1-1Z',
        link: 'm10 13 4-4m-5-1 2-2a4 4 0 0 1 6 6l-2 2m-6-4-2 2a4 4 0 0 0 6 6l2-2',
        star: 'm12 3 2.8 5.7 6.2.9-4.5 4.4 1.1 6.2L12 17.3l-5.6 2.9 1.1-6.2L3 9.6l6.2-.9Z',
        tags: 'M3 3h8l10 10-8 8L3 11V3Zm4 4h.01',
        info: 'M12 11v6m0-10h.01M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z',
        book: 'M12 5v16M3 4c3-1 6-1 9 1 3-2 6-2 9-1v15c-3-1-6-1-9 2-3-3-6-3-9-2V4Z',
        image: 'M3 3h18v18H3V3Zm1 14 5-5 4 4 3-3 5 5M9 8h.01',
        external: 'M14 4h6v6m0-6-9 9m5-4v9H4V6h5',
        recipe: 'M7 12a4 4 0 0 1 0-8 5 5 0 0 1 10 0 4 4 0 0 1 0 8v8H7v-8Zm0 4h10'
    };
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('viewBox', '0 0 24 24'); svg.setAttribute('aria-hidden', 'true');
    svg.classList.add('plant-detail-icon');
    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    path.setAttribute('d', paths[name] || paths.sprout);
    path.setAttribute('fill', filled ? 'currentColor' : 'none');
    path.setAttribute('stroke', 'currentColor'); path.setAttribute('stroke-width', '1.6');
    path.setAttribute('stroke-linecap', 'round'); path.setAttribute('stroke-linejoin', 'round');
    svg.appendChild(path); return svg;
}

function buildWishlistCard(item, handlers = {}) {
    const card = document.createElement('article');
    card.className = 'wish-item-card';

    const openButton = document.createElement('button');
    openButton.type = 'button';
    openButton.className = 'wish-card-open';
    openButton.setAttribute('aria-label', 'Bekijk details van ' + (typeof item.name === 'string' ? item.name : 'verlanglijstitem'));

    const imageBox = document.createElement('span');
    imageBox.className = 'wish-img-box';
    const imageUrl = safeWishlistImageUrl(item.image);
    if (imageUrl) {
        const image = document.createElement('img');
        image.src = imageUrl;
        image.alt = '';
        image.loading = 'lazy';
        imageBox.appendChild(image);
    } else {
        const placeholder = document.createElement('span');
        placeholder.className = 'wish-img-placeholder';
        placeholder.appendChild(createWishlistIcon(item.type === 'item' ? 'item' : 'seed'));
        imageBox.appendChild(placeholder);
    }

    const contentBox = document.createElement('span');
    contentBox.className = 'wish-content-box';
    const title = document.createElement('span');
    title.className = 'wish-title';
    title.textContent = typeof item.name === 'string' ? item.name : '';
    contentBox.appendChild(title);

    const meta = document.createElement('span');
    meta.className = 'wish-card-meta';
    const badge = document.createElement('span');
    const isSeed = item.type === 'seed';
    badge.className = 'wish-type-label ' + (isSeed ? 'is-seed' : 'is-item');
    badge.textContent = isSeed ? 'Zaad' : 'Item';
    meta.appendChild(badge);
    contentBox.appendChild(meta);

    if (typeof item.note === 'string' && item.note.trim()) {
        const note = document.createElement('span');
        note.className = 'wish-note-preview';
        note.textContent = item.note.trim();
        contentBox.appendChild(note);
    }
    openButton.append(imageBox, contentBox);
    openButton.addEventListener('click', event => {
        event.stopPropagation();
        handlers.onOpen?.(item.id);
    });

    const actions = document.createElement('div');
    actions.className = 'wish-card-actions';
    const addActionButton = (className, iconName, label, handler) => {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = className;
        button.setAttribute('aria-label', label);
        button.title = label;
        button.appendChild(createWishlistIcon(iconName));
        const buttonLabel = document.createElement('span');
        buttonLabel.textContent = label;
        button.appendChild(buttonLabel);
        button.addEventListener('click', event => {
            event.stopPropagation();
            handler?.(button);
        });
        actions.appendChild(button);
        return button;
    };

    addActionButton('btn-wish-icon', 'edit', 'Bewerken', () => handlers.onEdit?.(item.id));
    const link = safeHttpUrl(item.link);
    if (link) addActionButton('btn-wish-icon', 'open', 'Bekijk online', () => handlers.onLink?.(link));
    if (isSeed) addActionButton('btn-convert-seed', 'plus', 'Naar zaden', button => handlers.onConvert?.(item.id, button));

    const deleteButton = document.createElement('button');
    deleteButton.type = 'button'; deleteButton.className = 'wish-card-delete';
    deleteButton.setAttribute('aria-label', 'Verwijder ' + (item.name || 'verlanglijstitem'));
    deleteButton.title = 'Verwijderen'; deleteButton.appendChild(createWishlistIcon('trash'));
    deleteButton.addEventListener('click', event => {
        event.stopPropagation(); handlers.onDelete?.(item.id);
    });

    card.append(openButton, actions, deleteButton);
    card.addEventListener('click', () => handlers.onOpen?.(item.id));
    return card;
}
function buildAISuggestionRow(action, handlers = {}) {
    const normalized = normalizeAIAction(action);
    if (!normalized) return null;

    const row = document.createElement('div');
    row.className = 'ai-suggestion-row';
    const copy = document.createElement('div');
    copy.className = 'ai-suggestion-copy';
    const label = document.createElement('span');
    label.style.cssText = 'font-size: 14px; font-weight: 600;';
    label.textContent = normalized.label;
    copy.appendChild(label);
    if (normalized.detail) {
        const detail = document.createElement('p');
        detail.textContent = normalized.detail;
        copy.appendChild(detail);
    }
    row.appendChild(copy);

    if (normalized.subject) {
        const actionGroup = document.createElement('div');
        actionGroup.className = 'ai-actions-group';
        const destinations = [normalized.destination];
        if (destinations.includes('wishlist')) {
            const wishlistButton = document.createElement('button');
            wishlistButton.type = 'button';
            wishlistButton.className = 'btn-ai-action ghost';
            wishlistButton.title = 'Op verlanglijst';
            wishlistButton.textContent = 'Op verlanglijst';
            wishlistButton.addEventListener('click', event => {
                event.stopPropagation();
                handlers.onWishlist?.(normalized.subject, wishlistButton, normalized);
            });
            actionGroup.appendChild(wishlistButton);
        }
        if (destinations.includes('todo')) {
            const todoButton = document.createElement('button');
            todoButton.type = 'button';
            todoButton.className = 'btn-ai-action secondary';
            todoButton.title = 'Inplannen';
            todoButton.textContent = 'Inplannen';
            todoButton.addEventListener('click', event => {
                event.stopPropagation();
                handlers.onPlan?.(normalized, todoButton);
            });
            actionGroup.appendChild(todoButton);
        }
        row.appendChild(actionGroup);
    }
    return row;
}


document.addEventListener('DOMContentLoaded', async () => {
    let databaseAvailable = false;
    try {
        await initDB();
        databaseAvailable = true;
    } catch (err) {
        console.warn('[KweekKompas] Lokale database kon niet worden geopend.');
    }

    // --- USER PROFILE & ONBOARDING ---
    window.updateProfileUI = function() {
        const nameRow = document.getElementById('display-profile-name-row');
        const nameDisplay = document.getElementById('display-profile-name');
        const climateDisplay = document.getElementById('display-profile-climate');
        const unitsDisplay = document.getElementById('display-profile-units');

        const profile = window.userProfile;
        if (profile.name) {
            if (nameRow) nameRow.classList.remove('hidden');
            if (nameDisplay) nameDisplay.textContent = profile.name;
        } else {
            if (nameRow) nameRow.classList.add('hidden');
        }

        if (climateDisplay) climateDisplay.textContent = profile.climate;
        if (unitsDisplay) unitsDisplay.textContent = profile.units === 'Metric' ? 'Metric (cm/°C)' : 'Imperial (in/°F)';
    }
    window.updateProfileUI();

    const savedOnboardingFields = getOnboardingProfileFields();
    const initialGardenPlaces = normalizeOnboardingGardenPlaces(userProfile.gardenPlaces);
    const savedPrimaryPlace = ONBOARDING_GARDEN_PLACE_VALUES.includes(userProfile.primaryGardenPlace)
        ? userProfile.primaryGardenPlace
        : (ONBOARDING_GARDEN_PLACE_VALUES.includes(userProfile.gardenType) ? userProfile.gardenType : '');
    if (!initialGardenPlaces.length && savedPrimaryPlace) initialGardenPlaces.push(savedPrimaryPlace);
    let onboardingData = {
        places: initialGardenPlaces,
        primaryPlace: initialGardenPlaces.includes(savedPrimaryPlace) ? savedPrimaryPlace : (initialGardenPlaces[0] || ''),
        light: ONBOARDING_LIGHT_VALUES.has(savedOnboardingFields.light || userProfile.light)
            ? (savedOnboardingFields.light || userProfile.light) : '',
        level: ONBOARDING_EXPERIENCE_VALUES.has(savedOnboardingFields.experience || userProfile.experience)
            ? (savedOnboardingFields.experience || userProfile.experience) : ''
    };

    async function finishOnboarding() {
        const onboardingProfile = buildProfileFromOnboarding(userProfile, onboardingData);
        saveUserProfileData(onboardingProfile);
        const onboardingLight = onboardingProfile.light;
        updateProfileUI();

        localStorage.setItem('onboarding_done', 'true');
        const starters = [
            {
                id: Date.now() + 1,
                naam: "Cherry Tomaat 'Sweet Million'",
                type: "Groente",
                standplaats: onboardingLight || 'Zon',
                zaaitijd: "Maart - April (Binnen)",
                oogsttijd: "Juli - September",
                status: "Voorraad",
                tags: ["Zoet", "Productief", "Starter"],
                image: "assets/starters/tomaat.png",
                isFavorite: true
            },
            {
                id: Date.now() + 2,
                naam: "Radijs 'Cherry Belle'",
                type: "Groente",
                standplaats: onboardingLight || 'Halfschaduw',
                zaaitijd: "Maart - Augustus",
                oogsttijd: "April - September",
                status: "Voorraad",
                tags: ["Snel", "Krokant", "Makkelijk"],
                image: "assets/starters/radijs.png"
            },
            {
                id: Date.now() + 3,
                naam: "Courgette 'Black Beauty'",
                type: "Groente",
                standplaats: "Zon",
                zaaitijd: "Mei - Juni",
                oogsttijd: "Juli - September",
                status: "Voorraad",
                tags: ["Groot", "Rijke oogst", "Populair"],
                image: "assets/starters/courgette.png"
            },
            {
                id: Date.now() + 4,
                naam: "Pluksla 'Gemengd'",
                type: "Groente",
                standplaats: "Halfschaduw",
                zaaitijd: "Maart - Augustus",
                oogsttijd: "Mei - Oktober",
                status: "Voorraad",
                tags: ["Gezond", "Snel", "Vers"],
                image: "assets/starters/sla.png"
            },
            {
                id: Date.now() + 5,
                naam: "Basilicum 'Genovese'",
                type: "Kruid",
                standplaats: "Zon",
                zaaitijd: "Mei - Juli",
                oogsttijd: "Juli - September",
                status: "Voorraad",
                tags: ["Aromatisch", "Keuken", "Pot"],
                image: "assets/starters/basilicum.png"
            },
            {
                id: Date.now() + 6,
                naam: "Regenboog Snijbiet",
                type: "Groente",
                standplaats: "Halfschaduw",
                zaaitijd: "Maart - Augustus",
                oogsttijd: "Juni - November",
                status: "Voorraad",
                tags: ["Kleurrijk", "Vitamines", "Makkelijk"],
                image: "assets/starters/snijbiet.png"
            }
        ];
        // Only add if not already present by name
        const existingSeeds = await getAllSeeds();
        for (let s of starters) {
            const exists = existingSeeds.some(es => es.naam.toLowerCase() === s.naam.toLowerCase());
            if (!exists) {
                await saveSeed(s);
            }
        }
        seeds = await getAllSeeds();
        renderHome();
        switchView('home');
        showToast("Je tuin is klaar 🌱");
    }

    function renderOnboardingChoices() {
        document.querySelectorAll('[data-choice-group]').forEach(button => {
            const { choiceGroup, val } = button.dataset;
            const selected = choiceGroup === 'places'
                ? onboardingData.places.includes(val)
                : onboardingData[choiceGroup] === val;
            button.setAttribute('aria-pressed', String(selected));
            button.classList.toggle('is-selected', selected);
        });

        const primaryWrap = document.getElementById('onboarding-primary-place-wrap');
        const primarySelect = document.getElementById('onboarding-primary-place');
        if (primaryWrap && primarySelect) {
            primaryWrap.hidden = onboardingData.places.length === 0;
            primarySelect.replaceChildren();
            onboardingData.places.forEach(place => {
                const option = document.createElement('option');
                option.value = place;
                option.textContent = place;
                primarySelect.appendChild(option);
            });
            if (onboardingData.places.length && !onboardingData.places.includes(onboardingData.primaryPlace)) {
                onboardingData.primaryPlace = onboardingData.places[0];
            }
            primarySelect.value = onboardingData.primaryPlace;
        }
    }

    function renderOnboardingSummary() {
        const summary = document.getElementById('onboarding-summary');
        if (!summary) return;
        summary.replaceChildren();

        const locations = onboardingData.places.length
            ? onboardingData.places.map(place => place === onboardingData.primaryPlace ? `${place} (hoofdplek)` : place).join(', ')
            : 'Later invullen';
        const lightLabel = onboardingData.light === 'Zon' ? 'Volle zon' : (onboardingData.light || 'Later invullen');
        const rows = [
            ['Tuinplekken', locations],
            ['Zonlicht', lightLabel],
            ['Ervaring', onboardingData.level || 'Later invullen']
        ];

        rows.forEach(([label, value]) => {
            const row = document.createElement('div');
            row.className = 'onboarding-summary-row';
            const term = document.createElement('dt');
            term.textContent = label;
            const detail = document.createElement('dd');
            detail.textContent = value;
            row.append(term, detail);
            summary.appendChild(row);
        });
    }

    function showOnboardingStep(stepNumber) {
        document.querySelectorAll('.onboarding-step').forEach(step => {
            const isCurrent = step.id === `onboarding-step-${stepNumber}`;
            step.classList.toggle('hidden', !isCurrent);
            step.setAttribute('aria-hidden', String(!isCurrent));
            step.inert = !isCurrent;
        });

        const progressLabel = document.getElementById('onboarding-progress-label');
        const progressFill = document.getElementById('onboarding-progress-fill');
        const progress = document.querySelector('.onboarding-progress');
        if (progressLabel) progressLabel.textContent = `Stap ${stepNumber} van 3`;
        if (progressFill) progressFill.style.width = `${(stepNumber / 3) * 100}%`;
        if (progress) progress.setAttribute('aria-valuenow', String(stepNumber));
        document.querySelectorAll('[data-progress-name]').forEach(label => {
            const labelStep = Number(label.dataset.progressName);
            label.classList.toggle('is-current', labelStep === stepNumber);
            label.classList.toggle('is-complete', labelStep < stepNumber);
            if (labelStep === stepNumber) label.setAttribute('aria-current', 'step');
            else label.removeAttribute('aria-current');
        });
        if (stepNumber === 3) renderOnboardingSummary();
        renderOnboardingChoices();
    }

    document.querySelectorAll('.onboarding-next').forEach(button => {
        button.addEventListener('click', () => showOnboardingStep(Number(button.dataset.next)));
    });
    document.querySelectorAll('.onboarding-back').forEach(button => {
        button.addEventListener('click', () => showOnboardingStep(Number(button.dataset.back)));
    });

    document.querySelectorAll('[data-choice-group]').forEach(button => {
        button.addEventListener('click', () => {
            const group = button.dataset.choiceGroup;
            const value = button.dataset.val;
            if (group === 'places') {
                const selection = toggleOnboardingGardenPlace(onboardingData.places, onboardingData.primaryPlace, value);
                onboardingData.places = selection.places;
                onboardingData.primaryPlace = selection.primaryPlace;
            } else if (group === 'light' && ONBOARDING_LIGHT_VALUES.has(value)) {
                onboardingData.light = onboardingData.light === value ? '' : value;
            } else if (group === 'level' && ONBOARDING_EXPERIENCE_VALUES.has(value)) {
                onboardingData.level = onboardingData.level === value ? '' : value;
            }
            renderOnboardingChoices();
        });
    });

    document.querySelectorAll('[data-later]').forEach(button => {
        button.addEventListener('click', () => {
            if (button.dataset.later === 'places') {
                onboardingData.places = [];
                onboardingData.primaryPlace = '';
            } else if (button.dataset.later === 'light') {
                onboardingData.light = '';
            } else if (button.dataset.later === 'level') {
                onboardingData.level = '';
            }
            renderOnboardingChoices();
        });
    });

    document.getElementById('onboarding-primary-place')?.addEventListener('change', event => {
        const nextPrimary = event.currentTarget.value;
        onboardingData.primaryPlace = onboardingData.places.includes(nextPrimary) ? nextPrimary : (onboardingData.places[0] || '');
    });

    document.getElementById('btn-onboarding-restore')?.addEventListener('click', () => {
        if (typeof window.restoreBackup === 'function') window.restoreBackup();
    });

    showOnboardingStep(1);

    const btnFinishOnboarding = document.getElementById('btn-onboarding-finish');
    if (btnFinishOnboarding) btnFinishOnboarding.onclick = finishOnboarding;

    // Expose switchView immediately so it works for early clicks
    window.switchView = switchView;

    if (databaseAvailable) {
        try {
            seeds = await getAllSeeds();
        } catch (err) {
            databaseAvailable = false;
            seeds = [];
            console.warn('[KweekKompas] Lokale databasegegevens konden niet worden geladen.');
        }
    } else {
        seeds = [];
    }

    let reminders = readStoredJSON('moestuin_reminders', [], normalizeReminders);
    let dailyProgress = readStoredJSON('daily_progress', { date: '', count: 0 }, normalizeDailyProgress);
    let curCalDate = new Date();
    let selectedDateStr = null;
    let calendarTaskWeek = false;
    let aiPlanningDraft = null;
    let calendarHasRendered = false;

    const todayStr = new Date().toISOString().split('T')[0];
    if (dailyProgress.date !== todayStr) {
        dailyProgress = { date: todayStr, count: 0 };
        if (!unreadableStoredJSONKeys.has('daily_progress')) {
            localStorage.setItem('daily_progress', JSON.stringify(dailyProgress));
        }
    }


    const btnReset = document.getElementById('btn-factory-reset');
    if (btnReset) {
        btnReset.onclick = async () => {
            if (confirm("Weet je het zeker? Al je zaden en instellingen worden gewist.")) {
                localStorage.clear();
                // Sluit de connectie eerst, anders kan de DB niet verwijderd worden
                if (db) db.close();

                const req = indexedDB.deleteDatabase('MoestuinDB');
                req.onsuccess = () => {
                    location.reload();
                };
                req.onblocked = () => {
                    // Als er nog andere tabbladen open staan kan dit gebeuren
                    alert("Sluit a.u.b. andere KweekKompas schermen en probeer opnieuw.");
                };
                req.onerror = () => {
                    alert("Fout bij wissen database. Probeer de pagina te verversen.");
                };
            }
        };
    }


    function updateProgressUI() {
        const el = document.getElementById('daily-progress-hint');
        if (!el) return;
        if (dailyProgress.count > 0) {
            el.textContent = `${dailyProgress.count} ${dailyProgress.count === 1 ? 'actie' : 'acties'} voltooid vandaag 🌱`;
            el.style.display = 'block';
            el.classList.add('pulse-subtle');
            setTimeout(() => el.classList.remove('pulse-subtle'), 1000);
        } else {
            el.style.display = 'none';
        }
    }

    function incrementDailyProgress() {
        dailyProgress.count++;
        localStorage.setItem('daily_progress', JSON.stringify(dailyProgress));
        updateProgressUI();
    }

    const saveReminders = () => {
        localStorage.setItem('moestuin_reminders', JSON.stringify(reminders));
    };

    const addQuickReminder = (seed, customDate = null) => {
        const today = new Date();
        const dateToUse = customDate || today;
        const dateStr = dateToUse.toISOString().split('T')[0];
        const title = `${seed.naam} zaaien`;

        const isDuplicateDay = reminders.some(r => r.title.toLowerCase().includes(seed.naam.toLowerCase()) && r.date === dateStr);

        if (isDuplicateDay) {
            showToast(`Staat al in je kalender op deze dag. 📅`);
            return;
        }

        const newReminder = {
            id: Date.now(),
            date: dateStr,
            title: title,
            done: false
        };

        reminders.push(newReminder);
        saveReminders();
        incrementDailyProgress();
        showToast(`Reminder toegevoegd voor ${dateStr.split('-').reverse().slice(0,2).join('-')}: ${title} 📅`);
    };

    // MIGRATIONS
    let migrationNeeded = false;
    const currentYear = new Date().getFullYear();

    for (let s of seeds) {
        let changed = false;
        if (!s.tags || s.tags.length === 0) {
            const queryLower = s.naam.toLowerCase();
            for (let key in mockData) {
                if (queryLower.includes(key) || key.includes(queryLower)) {
                    s.tags = mockData[key].tags || [];
                    changed = true;
                    break;
                }
            }
        }
        if (!s.status) {
            s.status = (s.lastSownYear === currentYear) ? 'Gezaaid' : 'Voorraad';
            changed = true;
        }

        // Initialize flags based on status if missing
        if (s.fase_gezaaid === undefined) { s.fase_gezaaid = (s.status === 'Gezaaid' || s.status === 'Groeit' || s.status === 'Geoogst'); changed = true; }
        if (s.fase_groeit === undefined) { s.fase_groeit = (s.status === 'Groeit'); changed = true; }
        if (s.fase_geoogst === undefined) { s.fase_geoogst = (s.status === 'Geoogst'); changed = true; }

        if (s.isFavorite === undefined) {
            s.isFavorite = false;
            changed = true;
        }


        if (changed) {
            await saveSeed(s);
            migrationNeeded = true;
        }

        // --- SEASONAL RESET (New System) ---
        if (s.lastSownYear && s.lastSownYear < currentYear && s.status !== 'Voorraad') {
            // Determine if plant is perennial based on tags or isPerennial flag
            const isPerennial = (s.tags || []).some(t =>
                t.toLowerCase().includes('vaste plant') ||
                t.toLowerCase().includes('winterhard') ||
                t.toLowerCase().includes('perennial')
            ) || s.isPerennial === true;

            if (!isPerennial) {
                s.status = 'Voorraad';
                await saveSeed(s);
                migrationNeeded = true;
            }
        }

        // --- CATEGORY MAPPING (New System) ---
        if (s.type === 'Plant') {
            s.type = 'Sierplant';
            await saveSeed(s);
            migrationNeeded = true;
        }
        if (s.type === 'Gras') {
            s.type = 'Sierplant';
            await saveSeed(s);
            migrationNeeded = true;
        }
    }
    if (migrationNeeded) seeds = await getAllSeeds();

    let pendingImages = [];
    let photoSearchResults = []; // Local cache of search results (not necessarily selected)
    let displayedPhotoCount = 6; // How many web results to show initially
    let editingId = null;
    let activeCategory = 'Alles';
    let activePlantStatus = null;
    let dashboardPlantStatus = 'Gezaaid';
    let activeMonthFilter = null; // null or 0-11
    let showAllMissed = false;

    // --- LIGHTBOX LOGIC ---
    let currentLightboxIdx = 0;
    let currentLightboxImages = [];

    function openLightbox(images, idx) {
        currentLightboxImages = images;
        currentLightboxIdx = idx;
        const lb = document.getElementById('lightbox');
        const img = document.getElementById('lightbox-img');
        if (lb && img && currentLightboxImages[idx]) {
            img.src = currentLightboxImages[idx].url || currentLightboxImages[idx];
            lb.classList.remove('hidden');
        }
    }
    window.openLightbox = openLightbox;

    // --- CALENDAR STATE ---
    let calendarFilters = { sow: true, grow: true, harvest: true };
    document.querySelectorAll('.cal-filter-btn').forEach(btn => {
        btn.onclick = () => {
            const type = btn.dataset.type;
            calendarFilters[type] = !calendarFilters[type];
            btn.classList.toggle('active', calendarFilters[type]);
            renderCalendar();
        };
    });

    function closeLightbox() {
        document.getElementById('lightbox')?.classList.add('hidden');
    }
    window.closeLightbox = closeLightbox;

    function nextLightboxImage() {
        if (currentLightboxImages.length === 0) return;
        currentLightboxIdx = (currentLightboxIdx + 1) % currentLightboxImages.length;
        const img = document.getElementById('lightbox-img');
        if (img) img.src = currentLightboxImages[currentLightboxIdx].url || currentLightboxImages[currentLightboxIdx];
    }
    window.nextLightboxImage = nextLightboxImage;

    function prevLightboxImage() {
        if (currentLightboxImages.length === 0) return;
        currentLightboxIdx = (currentLightboxIdx - 1 + currentLightboxImages.length) % currentLightboxImages.length;
        const img = document.getElementById('lightbox-img');
        if (img) img.src = currentLightboxImages[currentLightboxIdx].url || currentLightboxImages[currentLightboxIdx];
    }
    window.prevLightboxImage = prevLightboxImage;

    // Attach Lightbox Events
    document.getElementById('lightbox-close')?.addEventListener('click', closeLightbox);
    document.getElementById('lightbox-next')?.addEventListener('click', nextLightboxImage);
    document.getElementById('lightbox-prev')?.addEventListener('click', prevLightboxImage);
    document.getElementById('lightbox')?.addEventListener('click', (e) => {
        if (e.target.id === 'lightbox') closeLightbox();
    });

    // --- CATEGORY FILTER LISTENERS ---
    const filterChips = document.querySelectorAll('.filter-chip');
    filterChips.forEach(chip => {
        chip.addEventListener('click', () => {
            const filterValue = chip.dataset.filter;
            if (!filterValue) return;
            activePlantStatus = null;

            if (filterValue === 'Alles') {
                activeCategory = 'Alles';
                activeMonthFilter = null;
                localStorage.removeItem('activeMonthFilter');
                if (window.clearMonthFilter) window.clearMonthFilter(); // Ensure banner is hidden
                filterChips.forEach(c => {
                    const v = c.dataset.filter;
                    c.classList.toggle('active', v === 'Alles');
                });
            } else {
                activeCategory = filterValue;
                filterChips.forEach(c => {
                    const v = c.dataset.filter;
                    c.classList.toggle('active', v === activeCategory);
                });
            }
            applyFilters();
        });
    });

    // --- INFO PROPOSAL LOGIC (Refined) ---
    const btnAutoFill = document.getElementById('btn-auto-fill-info');
    const btnResetAi = document.getElementById('btn-reset-ai-fields');
    const banner = document.getElementById('suggestion-banner');

    function clearAiIndicators() {
        document.querySelectorAll('.ai-badge').forEach(b => b.remove());
    }

    function addAiIndicatorToLabel(inputId) {
        const input = document.getElementById(inputId);
        if (!input) return;

        // Find label (either for=ID or parent)
        let label = document.querySelector(`label[for="${inputId}"]`);
        if (!label) {
            const group = input.closest('.form-group');
            if (group) label = group.querySelector('label');
        }

        if (label && !label.querySelector('.ai-badge')) {
            const badge = document.createElement('span');
            badge.className = 'ai-badge';
            badge.textContent = '✨';
            label.appendChild(badge);
        }
    }

    const triggerAutoFill = async (force = false) => {
        const inputNaam = document.getElementById('naam');
        const naamRaw = inputNaam ? inputNaam.value.trim() : '';

        if (!naamRaw) {
            showToast("Vul eerst een naam in om info aan te vullen! ✍️");
            if (inputNaam) inputNaam.focus();
            return;
        }

        const sourceStatusEl = document.getElementById('ai-source-status');
        const setSourceStatus = (text, type = 'info') => {
            if (!sourceStatusEl) return;
            sourceStatusEl.textContent = text;
            sourceStatusEl.className = 'ai-source-status visible ' + type;
            if (type === 'hidden') sourceStatusEl.className = 'ai-source-status hidden';
        };

        const hideBanner = () => { if (banner) banner.classList.add('hidden'); };

        const btn = force ? btnResetAi : btnAutoFill;
        if (btn) {
            btn.disabled = true;
            btn.classList.add('btn-loading');
            btn.innerHTML = `✨ Even nadenken...`;
        }

        try {
            const existingFields = {
                type: document.getElementById('type')?.value || "",
                standplaats: document.getElementById('standplaats')?.value || "",
                waterbehoefte: document.getElementById('water')?.value || "",
                notes: document.getElementById('beschrijving')?.value || ""
            };
            const data = await window.KweekServices.requestAI('seed-info', { name: naamRaw, existingFields });
            let fieldsUpdated = 0;

            // Bestaand starter-icoon / foto mapping op basis van plantnaam
            const lowerName = naamRaw.toLowerCase();
            let matchedStarterUrl = null;
            if (lowerName.includes('tomaat')) matchedStarterUrl = 'assets/starters/tomaat.png';
            else if (lowerName.includes('basilicum')) matchedStarterUrl = 'assets/starters/basilicum.png';
            else if (lowerName.includes('courgette')) matchedStarterUrl = 'assets/starters/courgette.png';
            else if (lowerName.includes('radijs')) matchedStarterUrl = 'assets/starters/radijs.png';
            else if (lowerName.includes('sla')) matchedStarterUrl = 'assets/starters/sla.png';
            else if (lowerName.includes('snijbiet')) matchedStarterUrl = 'assets/starters/snijbiet.png';

            if (matchedStarterUrl) {
                if (!pendingImages.some(img => img.url === matchedStarterUrl)) {
                    pendingImages.unshift({ url: matchedStarterUrl, id: 'starter-' + Date.now(), caption: 'Starter Foto' });
                }
                if (force || !inputNaam.dataset.featuredUrl) {
                    inputNaam.dataset.featuredUrl = matchedStarterUrl;
                    fieldsUpdated++;
                }
                renderUnifiedGallery();
            }

            const safeSetVal = (id, value) => {
                if (!value || value.toLowerCase() === 'onbekend') return;
                const el = document.getElementById(id);
                if (el) {
                    const isSelect = el.tagName === 'SELECT';
                    const shouldOverwrite = force || (!isSelect && !el.value) || (isSelect && !el.dataset.userChanged);
                    if (shouldOverwrite) {
                        if (isSelect) {
                            const option = Array.from(el.options).find(o => o.value.toLowerCase() === value.toLowerCase());
                            if (option) {
                                el.value = option.value;
                                addAiIndicatorToLabel(id);
                                fieldsUpdated++;
                            }
                        } else {
                            el.value = value;
                            addAiIndicatorToLabel(id);
                            fieldsUpdated++;
                        }
                    }
                }
            };

            safeSetVal('type', data.type);
            safeSetVal('standplaats', data.standplaats);
            safeSetVal('water', data.waterbehoefte);

            const descEl = document.getElementById('beschrijving');
            if (descEl && (force || !descEl.value) && data.notes) {
                let cleanNotes = data.notes;
                // Strip redundant "📋 Informatie" header and surrounding whitespace/newlines
                cleanNotes = cleanNotes.replace(/^📋\s*Informatie\s*\n*/i, '');
                cleanNotes = cleanNotes.replace(/^Informatie\s*\n*/i, '');
                descEl.value = cleanNotes.trim();
                addAiIndicatorToLabel('beschrijving');
                fieldsUpdated++;
            }

            const setMonths = (containerId, months) => {
                if (!months || months.length === 0) return;
                const container = document.getElementById(containerId);
                if (!container) return;

                const items = container.querySelectorAll('.month-picker-item');
                const anyChecked = Array.from(items).some(item => item.classList.contains('active'));

                if (force || !anyChecked) {
                    const activeIndices = getActiveMonths(months);
                    items.forEach(item => {
                        const idx = parseInt(item.dataset.monthIndex);
                        item.classList.toggle('active', activeIndices.has(idx));
                    });
                    addAiIndicatorToLabel(containerId);
                    fieldsUpdated++;
                }
            };

            setMonths('zaaitijd-picker', data.sow_months);
            setMonths('oogsttijd-picker', data.harvest_months);

            if (data.tags && Array.isArray(data.tags)) {
                const availableTagNames = Array.from(document.querySelectorAll('.tag-picker-chip')).map(c => c.dataset.tag);
                const currentTags = Array.from(document.querySelectorAll('.tag-picker-chip.active')).map(c => c.dataset.tag);
                const validAiTags = data.tags.filter(t => availableTagNames.some(e => e.toLowerCase() === t.toLowerCase())).map(t => availableTagNames.find(e => e.toLowerCase() === t.toLowerCase()));
                const mergedTags = [...new Set([...currentTags, ...validAiTags])];
                if (mergedTags.length > currentTags.length || force) {
                    renderTagPicker(mergedTags);
                    addAiIndicatorToLabel('tag-picker');
                    fieldsUpdated++;
                }
            }

            if (banner) {
                banner.classList.remove('hidden');
                banner.querySelector('span').textContent = `🪄 AI-voorstel geladen — controleer de gegevens.`;
            }

            setSourceStatus("AI-voorstel opgehaald", 'success');
            showToast(fieldsUpdated > 0 ? "Info aangevuld! ✨" : "Bestaande velden behouden. ✨");

        } catch (err) {
            console.error("AutoFill Error:", err);
            hideBanner();
            setSourceStatus("AI tijdelijk niet beschikbaar.", 'error');
            showToast("AI kon dit zaad nu niet aanvullen.");
            const errorState = document.createElement('div');
            errorState.className = 'ai-error-state';
            errorState.className = 'ai-error';
            errorState.appendChild(document.createTextNode('Fout: '));
            errorState.appendChild(document.createTextNode(err?.message || 'Onbekende fout'));
            errorState.appendChild(document.createElement('br'));
            const hint = document.createElement('small');
            hint.textContent = 'Controleer je keuze bij Instellingen → AI.';
            errorState.appendChild(hint);
            sourceStatusEl?.replaceChildren(errorState);
        } finally {
            if (btn) {
                btn.disabled = false;
                btn.classList.remove('btn-loading');
                btn.innerHTML = force ? "🔄 Opnieuw" : "✨ Vul info aan met AI";
            }
        }
    };

    if (btnAutoFill) {
        btnAutoFill.innerHTML = `✨ Vul info aan met AI`;
        btnAutoFill.onclick = () => triggerAutoFill(false);
    }
    if (btnResetAi) {
        btnResetAi.onclick = () => triggerAutoFill(true);
    }
    // Apply the migrated theme before rendering the first view. Older values
    // (including a missing preference) safely resolve to Light.
    applyAppTheme(getStoredAppTheme());

    // Layout Width Init
    const storedLayout = localStorage.getItem('layout_width') || 'standard';
    document.body.classList.add('layout-' + storedLayout);

    // Collapsible state is now handled within the toggle initialization below

    // Helpers
    const monthNamesShort = ['Jan', 'Feb', 'Mrt', 'Apr', 'Mei', 'Jun', 'Jul', 'Aug', 'Sep', 'Okt', 'Nov', 'Dec'];
    const calMonthNames = ["Januari", "Februari", "Maart", "April", "Mei", "Juni", "Juli", "Augustus", "September", "Oktober", "November", "December"];

    function initMonthPicker(containerId) {
        const container = document.getElementById(containerId);
        if (!container) return;
        container.innerHTML = '';
        monthNamesShort.forEach((name, i) => {
            const item = document.createElement('div');
            item.className = 'month-picker-item';
            item.textContent = name;
            item.dataset.monthIndex = i;
            item.addEventListener('click', () => item.classList.toggle('active'));
            container.appendChild(item);
        });
    }

    function getSelectedMonthsFromPicker(containerId) {
        const container = document.getElementById(containerId);
        if (!container) return '';
        return [...container.querySelectorAll('.month-picker-item.active')].map(item => item.textContent).join(', ');
    }

    function setSelectedMonthsInPicker(containerId, valueString) {
        const activeIndices = getActiveMonths(valueString);
        const container = document.getElementById(containerId);
        if (!container) return;
        container.querySelectorAll('.month-picker-item').forEach(item => {
            const idx = parseInt(item.dataset.monthIndex);
            item.classList.toggle('active', activeIndices.has(idx));
        });
    }

    function renderStars(value, interactive = false) {
        let numericValue = (typeof value === 'number') ? value : (parseInt(value) || 0);
        let starsHTML = '';
        for (let i = 1; i <= 5; i++) {
            const starChar = i <= numericValue ? '\u2605' : '\u2606';
            starsHTML += `<span class="star-item ${i <= numericValue ? 'active' : ''}" data-star="${i}">${starChar}</span>`;
        }
        return `<div class="star-rating ${interactive ? 'interactive' : ''}">${starsHTML}</div>`;
    }

    function initStarPicker() {
        const container = document.getElementById('star-rating-picker');
        if (!container) return;
        container.dataset.value = container.dataset.value || 0;
        container.innerHTML = renderStars(parseInt(container.dataset.value), true);
        initStarPickerEvents(container);
    }

    function initStarPickerEvents(container) {
        container.querySelectorAll('.star-item').forEach(star => {
            star.addEventListener('click', (e) => {
                const val = parseInt(e.target.dataset.star);
                container.dataset.value = val;
                container.innerHTML = renderStars(val, true);
                initStarPickerEvents(container);
            });
        });
    }

    // Elements
    const btnHome = document.getElementById('btn-home');
    const btnList = document.getElementById('btn-list');
    const btnSowingGrid = document.getElementById('btn-sowing-grid');
    const btnAdd = document.getElementById('btnAdd') || document.getElementById('btn-add');
    const btnWishlist = document.getElementById('btn-wishlist');
    const btnCalendar = document.getElementById('btn-calendar');
    const viewHome = document.getElementById('view-home');
    const viewList = document.getElementById('view-list');
    const viewSowingGrid = document.getElementById('view-sowing-grid');
    const viewAdd = document.getElementById('view-add');
    const viewDetail = document.getElementById('view-detail');
    const viewWishlist = document.getElementById('view-wishlist');
    const viewCalendar = document.getElementById('view-calendar');
    const viewOnboarding = document.getElementById('view-onboarding');
    const seedGrid = document.getElementById('seed-grid');
    const seedForm = document.getElementById('seed-form');
    const searchInput = document.getElementById('search-input');
    const detailBody = document.getElementById('detail-page-body');
    const toastContainer = document.getElementById('toast-container');
    const galleryPreview = document.getElementById('image-gallery-preview');

    const inputNaam = document.getElementById('naam');
    const inputType = document.getElementById('type');
    const inputStandplaats = document.getElementById('standplaats');
    const inputWater = document.getElementById('water');
    const inputStatus = document.getElementById('status');
    const inputBeschrijving = document.getElementById('beschrijving');
    const inputErvaringen = document.getElementById('ervaringen');
    const btnSubmitForm = document.getElementById('btn-submit-form');
    const btnDetailEdit = document.getElementById('btn-detail-edit');
    const btnDetailBack = document.getElementById('btn-detail-back');
    const btnDetailDelete = document.getElementById('btn-detail-delete');
    const btnQuickPhoto = document.getElementById('btn-quick-photo-search');
    if (inputNaam && btnQuickPhoto) {
        btnQuickPhoto.onclick = () => {
            const naam = inputNaam.value.trim();
            const pexelsInput = document.getElementById('pexels-search-input');
            const pexelsBtn = document.getElementById('btn-search-pexels-unified');
            if (pexelsInput && pexelsBtn) {
                pexelsInput.value = naam;
                pexelsBtn.click();
            }
        };

        // NEW: Handle Enter key in name field - Search photos & fill info instead of submitting form!
        inputNaam.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault(); // Stop form submit
                btnQuickPhoto.click(); // Trigger photo search

                // ALSO trigger AI info fill automatically if empty
                if (window._autoFillSeedInfo) {
                    window._autoFillSeedInfo(false);
                }
            }
        });
    }

    let nuDoenExpandedGroups = { missed: false, now: false, soon: false };

    let lastToast = { message: '', time: 0 };
    function showToastContent(buildContent) {
        // Anti-spam: max 1 toast. Build content as DOM so user values can
        // never become executable markup in a toast.
        const container = document.getElementById('toast-container');
        if (container) Array.from(container.children).forEach(c => c.remove());

        const toast = document.createElement('div');
        toast.className = 'toast show';
        const content = document.createElement('span');
        buildContent(content);
        toast.appendChild(content);
        if (container) container.appendChild(toast);

        setTimeout(() => {
            toast.classList.remove('show');
            setTimeout(() => toast.remove(), 300);
        }, 2000);
    }

    function showToast(message) {
        if (!message) return;
        showToastContent(content => {
            content.textContent = String(message);
        });
    }

    function showAssistantFeedback(message) {
        showToast(message);
        document.querySelector('#toast-container .toast')?.classList.add('ai-action-feedback');
    }

    function showToastWithHomeLink(prefix, suffix) {
        showToastContent(content => {
            content.appendChild(document.createTextNode(String(prefix || '')));
            const link = document.createElement('button');
            link.type = 'button';
            link.className = 'toast-link';
            link.textContent = 'je tuin';
            link.addEventListener('click', () => switchView('home'));
            content.appendChild(link);
            content.appendChild(document.createTextNode(String(suffix || '')));
        });
    }



    // --- CLEAR INDICATORS ON MANUAL EDIT ---
    [inputNaam, inputType, inputStandplaats, inputWater, inputBeschrijving].forEach(inp => {
        if (inp) {
            inp.addEventListener('input', () => {
                const group = inp.closest('.form-group');
                if (group) {
                    const badge = group.querySelector('.ai-badge');
                    if (badge) badge.remove();
                }
                if (inp.id === 'standplaats' || inp.id === 'water' || inp.id === 'type') {
                    inp.dataset.userChanged = 'true';
                }
            });
            inp.addEventListener('change', () => {
                const group = inp.closest('.form-group');
                if (group) {
                    const badge = group.querySelector('.ai-badge');
                    if (badge) badge.remove();
                }
                if (inp.id === 'standplaats' || inp.id === 'water' || inp.id === 'type') {
                    inp.dataset.userChanged = 'true';
                }
            });
        }
    });

    // Reset userChanged when opening add view for new seed
    window.openAddForm = (seed = null) => {
        // This is a bridge, the real implementation is at line 1050
        if (typeof openAddForm === 'function') openAddForm();
    };

    // Handle month pickers manually
    document.querySelectorAll('.month-picker-container').forEach(cont => {
        cont.addEventListener('click', () => {
            const group = cont.closest('.form-group');
            if (group) {
                const badge = group.querySelector('.ai-badge');
                if (badge) badge.remove();
            }
        });
    });

    if (btnDetailEdit) {
        btnDetailEdit.onclick = () => {
            const seedId = viewDetail.dataset.currentSeedId;
            const seed = seeds.find(s => String(s.id) === String(seedId));
            if (seed) openEditView(seed);
        };
    }

    if (btnDetailDelete) {
        btnDetailDelete.onclick = async () => {
            const seedId = viewDetail.dataset.currentSeedId;
            const seed = seeds.find(s => String(s.id) === String(seedId));
            if (!seed) return;
            if (confirm(`Weet je zeker dat je "${seed.naam}" wilt verwijderen?`)) {
                await deleteSeedDB(seed.id);
                seeds = await getAllSeeds();
                showToast("Zaadje verwijderd! 🗑️");

                // Force global UI refresh
                renderHome();
                applyFilters();
                renderSowingGrid();
                renderCalendar();

                switchView('list');
            }
        };
    }

    async function saveCurrentForm() {
        if (viewAdd.classList.contains('hidden')) return;
        const naam = inputNaam.value.trim();
        if (!naam) return;

        // Duplicate check for new entries
        if (!editingId) {
            const exists = seeds.some(s => s.naam.toLowerCase() === naam.toLowerCase());
            if (exists) {
                showToast("Deze plant staat al in je tuin! 🌿");
                const btnSave = document.getElementById('btn-save-seed');
                if (btnSave) btnSave.disabled = false;
                return;
            }
        }

        const selectedTags = Array.from(document.querySelectorAll('.tag-picker-chip.active')).map(c => c.dataset.tag);
        const existing = editingId ? seeds.find(s => s.id === editingId) : null;
        const safeImages = pendingImages.map(image => {
            const safeUrl = safeWishlistImageUrl(image?.url);
            return safeUrl ? { ...image, url: safeUrl } : null;
        }).filter(Boolean);
        const safeFeaturedImage = safeWishlistImageUrl(inputNaam.dataset.featuredUrl) || safeImages[0]?.url || '';

        const newSeed = {
            id: editingId || Date.now().toString(),
            naam: naam,
            code: document.getElementById('code')?.value.trim() || '',
            type: inputType?.value || 'Overig',
            standplaats: inputStandplaats?.value || 'Zon',
            water: inputWater?.value || 'Gemiddeld',
            status: inputStatus?.value || 'Voorraad',
            fase_gezaaid: (existing && inputStatus?.value === existing.status) ? existing.fase_gezaaid : (inputStatus?.value !== 'Voorraad' && inputStatus?.value !== 'Wishlist'),
            fase_groeit: (existing && inputStatus?.value === existing.status) ? existing.fase_groeit : (inputStatus?.value === 'Groeit'),
            fase_geoogst: (existing && inputStatus?.value === existing.status) ? existing.fase_geoogst : (inputStatus?.value === 'Geoogst'),
            zaaitijd: getSelectedMonthsFromPicker('zaaitijd-picker'),

            oogsttijd: getSelectedMonthsFromPicker('oogsttijd-picker'),
            lastSownYear: (inputStatus?.value === 'Gezaaid' || inputStatus?.value === 'Groeit') ? new Date().getFullYear() : (existing ? existing.lastSownYear : null),
            ervaringScore: parseInt(document.getElementById('star-rating-picker')?.dataset.value) || 0,
            purchaseYear: parseInt(document.getElementById('purchaseYear')?.value) || null,
            shopLink: document.getElementById('shopLink')?.value.trim() || '',
            beschrijving: inputBeschrijving?.value.trim() || '',
            ervaringen: inputErvaringen?.value.trim() || '',
            images: safeImages,
            tags: selectedTags,
            featuredImageUrl: safeFeaturedImage,
            isFavorite: existing ? (existing.isFavorite || false) : false
        };
        if (newSeed.status === 'Wishlist') {
            addToWishlistFromCard(newSeed);
        }
        await saveSeed(newSeed);
        seeds = await getAllSeeds();

        // Ensure UI reflects changes everywhere
        renderHome();
        applyFilters();
        renderSowingGrid();
        renderCalendar();

        showToast(editingId ? "Wijzigingen opgeslagen! ✨" : "Nieuwe plant toegevoegd! 🌱");
        switchView('list');
    }

    // --- LIST RENDERING ---
    function getStatusLabel(status) {
        const labels = {
            'Voorraad': 'In voorraad',
            'Gezaaid': 'Gezaaid',
            'Groeit': 'Groeit',
            'Geoogst': 'Geoogst',
            'Wishlist': 'Op wishlist'
        };
        return labels[status] || status;
    }

    // Helper to determine the visual main status based on priority
    function deriveMainStatus(s) {
        if (s.fase_groeit) return 'Groeit';
        if (s.fase_geoogst) return 'Geoogst';
        if (s.fase_gezaaid) return 'Gezaaid';
        if (s.status === 'Wishlist') return 'Wishlist';
        return 'Voorraad';
    }

    function updateSeedSummary() {
        const total = document.getElementById('seed-summary-total');
        const favorites = document.getElementById('seed-summary-favorites');
        const season = document.getElementById('seed-summary-season');
        if (!total && !favorites && !season) return;

        const allSeeds = Array.isArray(seeds) ? seeds : [];
        if (total) total.textContent = String(allSeeds.length);
        if (favorites) favorites.textContent = String(allSeeds.filter(seed => seed.isFavorite).length);
        if (season) {
            const currentMonth = new Date().getMonth();
            season.textContent = String(allSeeds.filter(seed => getActiveMonths(seed).has(currentMonth)).length);
        }
    }

    function renderSeeds(items) {
        if (!seedGrid) return;
        updateSeedSummary();
        seedGrid.replaceChildren();

        if (items.length === 0) {
            const q = searchInput?.value || '';
            const hasFilters = activePlantStatus !== null || activeCategory !== 'Alles' || activeMonthFilter !== null || q;
            const empty = document.createElement('div');
            empty.className = 'empty-state';
            empty.style.cssText = 'padding: 60px 20px;';
            const message = document.createElement('p');
            message.style.cssText = 'font-size: 16px; font-weight: 700; color: var(--text-main); margin-bottom: 4px;';
            message.textContent = activePlantStatus === 'Actief' ? 'Geen actieve planten' : hasFilters ? 'Geen resultaten gevonden' : 'Je hebt nog geen zaden toegevoegd';
            const submessage = document.createElement('p');
            submessage.style.cssText = 'font-size: 13px; color: var(--text-muted); margin-bottom: 20px;';
            submessage.textContent = hasFilters ? 'Met deze filters of zoekterm konden we niets vinden.' : 'Begin met het toevoegen van je eerste plant.';
            const button = document.createElement('button');
            button.type = 'button';
            button.className = 'empty-state-btn';
            button.textContent = hasFilters ? 'Wis filters & toon alles' : 'Eerste zaad toevoegen';
            button.addEventListener('click', () => hasFilters ? window._resetAllFilters() : window.openAddForm());
            empty.append(message, submessage, button);
            seedGrid.appendChild(empty);
            return;
        }

        const favorites = items.filter(seed => seed.isFavorite);
        const others = items.filter(seed => !seed.isFavorite);
        const addSectionHeader = (label, className) => {
            const header = document.createElement('div');
            header.className = `list-section-header${className ? ` ${className}` : ''}`;
            header.style.gridColumn = '1 / -1';
            header.textContent = label;
            seedGrid.appendChild(header);
        };

        if (favorites.length > 0) {
            addSectionHeader('Favorieten', 'fav');
            favorites.forEach(seed => seedGrid.appendChild(createSeedCard(seed)));
            if (others.length > 0) addSectionHeader('Overige zaden', '');
        }
        others.forEach(seed => seedGrid.appendChild(createSeedCard(seed)));
    }

    function createSeedCard(seed) {
        const card = document.createElement('article');
        card.className = 'seed-card';
        card.dataset.id = String(seed.id ?? '');
        card.id = `seed-card-${String(seed.id ?? '')}`;
        card.tabIndex = 0;
        card.setAttribute('aria-label', `Bekijk details van ${String(seed.naam || 'plant')}`);

        const appendPlaceholder = imageBox => {
            imageBox.replaceChildren();
            imageBox.classList.add('placeholder-img');
            const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
            svg.setAttribute('viewBox', '0 0 24 24');
            svg.setAttribute('aria-hidden', 'true');
            svg.classList.add('seed-placeholder-icon');
            const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
            path.setAttribute('d', 'M12 20V8M12 12C8 12 5 9.7 5 5c4.4 0 7 2.1 7 7Zm0 2c4 0 7-2.3 7-7-4.4 0-7 2.1-7 7Z');
            path.setAttribute('fill', 'none');
            path.setAttribute('stroke', 'currentColor');
            path.setAttribute('stroke-linecap', 'round');
            path.setAttribute('stroke-linejoin', 'round');
            path.setAttribute('stroke-width', '1.5');
            svg.appendChild(path);
            imageBox.appendChild(svg);
        };

        const imageBox = document.createElement('div');
        const imageUrl = safeWishlistImageUrl(seed.featuredImageUrl || seed.image || seed.images?.[0]?.url);
        if (imageUrl) {
            imageBox.className = 'card-img seed-card-media';
            const image = document.createElement('img');
            image.className = 'seed-card-image';
            image.setAttribute('src', imageUrl);
            image.setAttribute('alt', `Foto van ${String(seed.naam || 'plant')}`);
            image.setAttribute('loading', 'lazy');
            image.addEventListener('error', () => appendPlaceholder(imageBox), { once: true });
            imageBox.appendChild(image);
        } else {
            imageBox.className = 'card-img seed-card-media';
            appendPlaceholder(imageBox);
        }
        card.appendChild(imageBox);

        const actions = document.createElement('div');
        actions.className = 'card-actions-top-right';
        const favorite = document.createElement('button');
        favorite.type = 'button';
        favorite.className = `card-favorite-button${seed.isFavorite ? ' active' : ''}`;
        favorite.setAttribute('aria-pressed', seed.isFavorite ? 'true' : 'false');
        favorite.setAttribute('aria-label', seed.isFavorite ? `Verwijder ${String(seed.naam || 'plant')} uit favorieten` : `Markeer ${String(seed.naam || 'plant')} als favoriet`);
        favorite.textContent = seed.isFavorite ? '\u2605' : '\u2606';
        favorite.addEventListener('click', event => {
            event.stopPropagation();
            window._toggleFavContent?.(seed.id, { openDetail: false });
        });
        actions.appendChild(favorite);
        card.appendChild(actions);

        const content = document.createElement('div');
        content.className = 'card-content';
        const badges = document.createElement('div');
        badges.className = 'card-badges';
        const typeBadge = document.createElement('span');
        typeBadge.className = `badge ${safeClassToken(seed.type)}`;
        typeBadge.textContent = typeof seed.type === 'string' ? seed.type : '';
        const statusBadge = document.createElement('span');
        statusBadge.className = `badge ${safeClassToken(seed.status)}`;
        statusBadge.textContent = getStatusLabel(seed.status);
        const locationBadge = document.createElement('span');
        locationBadge.className = 'badge seed-location-badge';
        locationBadge.textContent = typeof seed.standplaats === 'string' && seed.standplaats ? seed.standplaats : 'Standplaats onbekend';
        badges.append(typeBadge, statusBadge);
        badges.appendChild(locationBadge);
        content.appendChild(badges);

        const name = document.createElement('h3');
        appendHighlightedText(name, seed.naam, searchInput?.value || '');
        content.appendChild(name);

        if (seed.code) {
            const code = document.createElement('div');
            code.className = 'seed-code';
            code.textContent = `# ${String(seed.code)}`;
            content.appendChild(code);
        }

        const meta = document.createElement('div');
        meta.className = 'seed-meta';
        const sowing = document.createElement('p');
        sowing.className = 'seed-meta-item seed-sow';
        sowing.textContent = `Zaaien: ${formatMonthRanges(getActiveMonths(seed)) || 'n.v.t.'}`;
        const harvest = document.createElement('p');
        harvest.className = 'seed-meta-item seed-harvest';
        harvest.textContent = `Oogst: ${formatMonthRanges(getActiveMonths(seed.oogsttijd)) || 'n.v.t.'}`;
        meta.append(sowing, harvest);
        content.appendChild(meta);

        const cardActions = document.createElement('div');
        cardActions.className = 'seed-card-actions';
        const detailButton = document.createElement('button');
        detailButton.type = 'button';
        detailButton.className = 'seed-detail-button';
        detailButton.textContent = 'Bekijk details';
        detailButton.addEventListener('click', event => {
            event.stopPropagation();
            openDetailView(seed);
        });
        cardActions.appendChild(detailButton);
        content.appendChild(cardActions);
        card.appendChild(content);

        card.addEventListener('click', () => openDetailView(seed));
        card.addEventListener('keydown', event => {
            if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault();
                openDetailView(seed);
            }
        });
        return card;
    }

    function addToWishlistFromCard(seed) {
        const exists = wishlist.some(item => item.name.toLowerCase() === seed.naam.toLowerCase());
        if (exists) {
            showToast("Staat al op je wishlist! 🔖");
            return;
        }

        const img = seed.featuredImageUrl || (seed.images && seed.images.length > 0 ? seed.images[0].url : '');

        const newItem = {
            id: Date.now().toString(),
            name: seed.naam,
            link: '',
            image: img,
            note: '',
            type: 'seed',
            bought: false
        };

        wishlist.unshift(newItem);
        saveWish();
        showToast("Toegevoegd aan wishlist ✨");
    }

    // --- DETAIL VIEW ---
    function openDetailView(seed) {
        const focusedAction = document.activeElement?.closest('#view-detail .btn-action-chip')?.dataset.detailAction;
        viewDetail.dataset.currentSeedId = seed.id;
        window.scrollTo({ top: 0, behavior: 'smooth' });

        const sowingMonthsSet = getActiveMonths(seed);
        const text = value => value === null || value === undefined ? '' : String(value);
        const make = (tag, className, value) => {
            const element = document.createElement(tag);
            if (className) element.className = className;
            if (value !== undefined) setSafeText(element, value);
            return element;
        };
        const appendDetailItem = (grid, icon, label, value, options = {}) => {
            const item = make('div', 'detail-item');
            if (options.fullWidth) item.style.gridColumn = '1/-1';
            const iconElement = make('div', 'detail-item-icon');
            iconElement.appendChild(createPlantDetailIcon(icon));
            const content = make('div', 'detail-item-content');
            content.appendChild(make('strong', '', label));
            const valueElement = make('span', '', value);
            if (options.valueStyle) valueElement.style.cssText = options.valueStyle;
            content.appendChild(valueElement);
            item.append(iconElement, content);
            grid.appendChild(item);
            return { item, content, valueElement };
        };

        detailBody.replaceChildren();
        const summaryColumn = make('div', 'detail-summary-column');
        const informationColumn = make('div', 'detail-information-column');
        const heading = (label, icon) => {
            const element = make('h4', 'detail-section-heading');
            element.append(createPlantDetailIcon(icon), document.createTextNode(label));
            return element;
        };

        const header = make('div', 'detail-photo');
        const featuredImg = seed.featuredImageUrl || seed.image || (seed.images && seed.images[0]?.url);
        const safeFeaturedImg = safeWishlistImageUrl(featuredImg);
        if (safeFeaturedImg) {
            const image = make('img', 'detail-hero-img');
            image.setAttribute('src', safeFeaturedImg);
            image.setAttribute('alt', text(seed.naam));
            image.addEventListener('error', () => {
                header.classList.add('detail-without-photo');
                const placeholder = make('div', 'detail-photo-placeholder');
                placeholder.append(createPlantDetailIcon('sprout'), make('span', '', 'Geen foto beschikbaar'));
                header.replaceChildren(placeholder);
            }, { once: true });
            header.appendChild(image);
        } else {
            header.classList.add('detail-without-photo');
            const placeholder = make('div', 'detail-photo-placeholder');
            placeholder.append(createPlantDetailIcon('sprout'), make('span', '', 'Geen foto toegevoegd'));
            header.appendChild(placeholder);
        }

        const titleOverlay = make('div', 'detail-heading');
        const title = make('h1', '', text(seed.naam) || 'Naam niet ingevuld');
        titleOverlay.appendChild(title);
        summaryColumn.appendChild(titleOverlay);

        const badgeOverlay = make('div', 'detail-heading-badges');
        const badgeLeft = make('div');
        badgeLeft.style.cssText = 'display: flex; gap: 8px;';
        const tags = Array.isArray(seed.tags) ? seed.tags.filter(tag => typeof tag === 'string') : [];
        if (tags.some(tag => tag.toLowerCase().includes('lastige kiemer'))) {
            const difficult = make('span', 'category-badge difficult-germinator');
            difficult.append(createPlantDetailIcon('sprout'), document.createTextNode('Lastige kiemer'));
            badgeLeft.appendChild(difficult);
        }
        const statusBadge = make('span', 'category-badge', seed.status ? getStatusLabel(seed.status) : 'Status niet ingevuld');
        const badgeRight = make('div');
        badgeRight.appendChild(statusBadge);
        badgeOverlay.append(badgeLeft, badgeRight);
        titleOverlay.appendChild(badgeOverlay);
        summaryColumn.appendChild(header);

        const actionRow = make('div', 'detail-action-row');
        actionRow.setAttribute('role', 'group'); actionRow.setAttribute('aria-label', 'Status en favoriet');
        const addStatusButton = (icon, label, status, active, ariaLabel) => {
            const button = make('button', `btn-action-chip ${active ? 'active' : ''}`);
            button.append(createPlantDetailIcon(icon), make('span', '', label));
            button.type = 'button';
            button.setAttribute('aria-label', ariaLabel);
            button.setAttribute('aria-pressed', String(active)); button.dataset.detailAction = status;
            button.addEventListener('click', () => window._updateStatus(seed.id, status));
            actionRow.appendChild(button);
        };
        addStatusButton('sprout', 'Gezaaid', 'Gezaaid', Boolean(seed.fase_gezaaid), 'Markeer als gezaaid');
        addStatusButton('leaf', 'Groeit', 'Groeit', Boolean(seed.fase_groeit), 'Markeer als Groeit');
        addStatusButton('basket', 'Geoogst', 'Geoogst', Boolean(seed.fase_geoogst), 'Markeer als geoogst');
        const favorite = make('button', `btn-action-chip fav-chip ${seed.isFavorite ? 'active' : ''}`);
        favorite.type = 'button';
        favorite.setAttribute('aria-label', 'Wissel favoriet');
        favorite.setAttribute('aria-pressed', String(Boolean(seed.isFavorite))); favorite.dataset.detailAction = 'favorite';
        favorite.append(createPlantDetailIcon('star', Boolean(seed.isFavorite)), make('span', '', 'Favoriet'));
        favorite.addEventListener('click', () => window._toggleFavContent(seed.id));
        actionRow.appendChild(favorite);
        summaryColumn.appendChild(actionRow);

        const detailGrid = make('div', 'detail-grid');
        appendDetailItem(detailGrid, 'sun', 'Standplaats', text(seed.standplaats) || 'Niet ingevuld');
        appendDetailItem(detailGrid, 'water', 'Waterbehoefte', seed.water ? text(seed.water).split(' (')[0] : 'Niet ingevuld');

        const sowing = appendDetailItem(detailGrid, 'sprout', 'Wanneer zaaien?', formatMonthRanges(sowingMonthsSet) || 'Niet ingevuld', {
            fullWidth: true,
            valueStyle: 'font-size: 13px; color: var(--text-muted); margin-bottom: 4px;'
        });
        if (sowingMonthsSet.size > 0) {
            const monthBar = make('div', 'month-bar');
            monthNamesShort.forEach((month, index) => {
                const bubble = make('div', `month-bubble ${sowingMonthsSet.has(index) ? 'active' : ''}`, month);
                bubble.setAttribute('aria-label', `${month}: ${sowingMonthsSet.has(index) ? 'zaaimaand' : 'buiten de opgeslagen zaaitijd'}`);
                monthBar.appendChild(bubble);
            });
            sowing.content.appendChild(monthBar);
        }

        appendDetailItem(detailGrid, 'basket', 'Wanneer oogsten?', formatMonthRanges(getActiveMonths(seed.oogsttijd)) || 'Niet ingevuld');
        appendDetailItem(detailGrid, 'status', 'Huidige status', text(seed.status) || 'Niet ingevuld');
        if (seed.code) appendDetailItem(detailGrid, 'location', 'Code / Locatie', text(seed.code));
        if (seed.purchaseYear) appendDetailItem(detailGrid, 'calendar', 'Gekocht', text(seed.purchaseYear));
        if (seed.shopLink) {
            const safeShopLink = safeHttpUrl(seed.shopLink);
            if (safeShopLink) {
                const shop = make('div', 'detail-item');
                const icon = make('div', 'detail-item-icon'); icon.appendChild(createPlantDetailIcon('link')); shop.appendChild(icon);
                const content = make('div', 'detail-item-content');
                content.appendChild(make('strong', '', 'Webshop'));
                const link = make('a', '', 'Bekijk product');
                link.setAttribute('href', safeShopLink);
                link.setAttribute('target', '_blank');
                link.setAttribute('rel', 'noopener noreferrer');
                link.style.cssText = 'color: var(--primary-color); text-decoration: none; font-weight: 600;';
                content.appendChild(link);
                shop.appendChild(content);
                detailGrid.appendChild(shop);
            }
        }
        informationColumn.appendChild(detailGrid);

        if (Number(seed.ervaringScore) > 0) {
            const rating = make('div', 'rating-section');
            const ratingLine = make('div');
            ratingLine.style.cssText = 'display: flex; align-items: center; gap: 8px;';
            const ratingLabel = make('span', '', 'Mijn ervaring:');
            ratingLabel.style.cssText = 'font-size: 13px; font-weight: 600; color: var(--text-muted);';
            const stars = make('div', 'star-rating');
            const score = Math.max(0, Math.min(5, Number.parseInt(seed.ervaringScore, 10) || 0));
            stars.setAttribute('role', 'img'); stars.setAttribute('aria-label', `Ervaringsscore: ${score} van 5`);
            for (let index = 1; index <= 5; index += 1) {
                const star = make('span', `star-item ${index <= score ? 'active' : ''}`);
                star.appendChild(createPlantDetailIcon('star', index <= score)); stars.appendChild(star);
            }
            ratingLine.append(ratingLabel, stars);
            rating.appendChild(ratingLine);
            summaryColumn.appendChild(rating);
        }

        if (tags.length > 0) {
            const tagsSection = make('div', 'tags-section');
            const tagsHeading = heading('Kenmerken', 'tags');
            tagsSection.appendChild(tagsHeading);
            const tagsContainer = make('div', 'tags-container');
            tagsContainer.style.cssText = 'display: flex; flex-wrap: wrap; gap: 8px;';
            tags.forEach(tag => {
                const chip = make('span', 'tag-chip');
                chip.appendChild(make('span', 'tag-text', tag));
                tagsContainer.appendChild(chip);
            });
            tagsSection.appendChild(tagsContainer);
            summaryColumn.appendChild(tagsSection);
        }

        const copySection = make('div', 'detail-copy-section');
        const infoItem = make('div', 'detail-item');
        infoItem.appendChild(heading('Informatie', 'info'));
        const infoText = make('p', '', seed.beschrijving || 'Geen informatie toegevoegd.');
        infoText.style.cssText = 'white-space:pre-wrap; margin: 0; font-size: 14px; line-height: 1.6; color: var(--text-main);';
        infoItem.appendChild(infoText);
        const experienceItem = make('div', 'detail-item');
        experienceItem.appendChild(heading('Eigen notities', 'book'));
        const experienceText = make('p', '', seed.ervaringen || 'Geen notities toegevoegd.');
        experienceText.style.cssText = 'white-space:pre-wrap; margin: 0; font-size: 14px; line-height: 1.6; color: var(--text-main);';
        experienceItem.appendChild(experienceText);
        copySection.append(infoItem, experienceItem);
        informationColumn.appendChild(copySection);

        const getRecipeSearchUrl = (plant, recipe) => `https://www.google.com/search?q=${encodeURIComponent(`${plant} ${recipe} recept`)}`;
        const shuffleArray = values => [...values].sort(() => 0.5 - Math.random());
        const recipesData = {
            tomaat: ['Pasta saus', 'Bruschetta', 'Tomatensoep', 'Gepofte tomaatjes', 'Caprese salade', 'Tomaten salsa'],
            courgette: ['Pannenkoekjes', 'Gevulde courgette', 'Courgette soep', 'Gegrilde plakjes', 'Ratatouille', 'Courgette taart'],
            radijs: ['Salade', 'Toast met roomkaas', 'Ingelegde radijsjes', 'Gebakken radijs', 'Dip met kwark'],
            spinazie: ['Pasta pesto', 'Spinazie a la creme', 'Gado Gado', 'Frisse spinazie salade', 'Quiche met spinazie'],
            sla: ['Groene salade', 'Stamppot sla', 'Wraps', 'Sla soep', 'Salade niçoise'],
            paprika: ['Gevulde paprika', 'Ratatouille', 'Huisgemaakte sambal', 'Geroosterde paprika dip', 'Paprika soep'],
            peper: ['Chilisaus', 'Peperolie', 'Salsa', 'Sambal', 'Gedroogde vlokken'],
            komkommer: ['Komkommersalade', 'Tzatziki', 'Pickles', 'Komkommer soep', 'Frisse smoothie'],
            aardbei: ['Jam', 'Smoothie', 'Salade', 'Aardbeien kwark', 'Zomerse bowl'],
            basilicum: ['Pesto', 'Caprese', 'Kruidenolie', 'Basilicum siroop', 'Infused water'],
            munt: ['Muntthee', 'Mocktail', 'Tabbouleh', 'Munt dipsaus', 'Verse salade'],
            wortel: ['Worteltaart', 'Ovenwortels', 'Hutspot', 'Wortelsalade', 'Wortelsoep'],
            biet: ['Salade met geitenkaas', 'Borsjt', 'Geroosterde bieden', 'Bietenhulmus', 'Carpaccio van biet'],
            broccoli: ['Broccoli ovenschotel', 'Broccolisoep', 'Wokgerecht', 'Broccoli salade', 'Pasta broccoli'],
            boerenkool: ['Stamppot', 'Chips', 'Smoothie', 'Salade met appel', 'Boerenkool pesto'],
            pompoen: ['Pompoensoep', 'Geroosterde pompoen', 'Pompoentaart', 'Gevulde pompoen', 'Risotto met pompoen']
        };
        const rawPlantName = text(seed.naam);
        const plantName = rawPlantName || 'deze plant';
        const edible = tags.some(tag => tag.toLowerCase().includes('eetbaar')) || ['Groente', 'Fruit', 'Kruid'].includes(seed.type);
        if (edible) {
            const lowerName = plantName.toLowerCase();
            let recipes = [];
            for (const [key, values] of Object.entries(recipesData)) {
                if (lowerName.includes(key)) { recipes = values; break; }
            }
            if (recipes.length === 0) recipes = ['Simpele bereiding', 'Salade', 'Oven gerecht', 'Snelle snack', 'Roerbak gerecht', 'Gezonde lunch'];
            const recipeSection = make('div', 'recipe-section');
            const recipeHeader = make('div');
            recipeHeader.style.cssText = 'margin-bottom: 16px;';
            const recipeTitle = heading(rawPlantName ? `Met je ${plantName} maken` : 'Recept ideeën', 'recipe');
            recipeTitle.style.cssText = 'font-size: 15px; font-weight: 700; color: var(--text-main); margin-bottom: 4px;';
            const recipeIntro = make('p', '', 'Gebruik je oogst direct in de keuken.');
            recipeIntro.style.cssText = 'font-size: 12px; color: var(--text-muted); margin: 0;';
            recipeHeader.append(recipeTitle, recipeIntro);
            const recipeList = make('div');
            recipeList.style.cssText = 'display: flex; flex-direction: column; gap: 8px;';
            shuffleArray(recipes).slice(0, 3).forEach((recipe, index) => {
                const recipeLink = make('a', `recipe-card-v2 ${index === 0 ? 'prominent' : ''}`);
                const safeRecipeUrl = safeHttpUrl(getRecipeSearchUrl(plantName, recipe));
                if (!safeRecipeUrl) return;
                recipeLink.setAttribute('href', safeRecipeUrl);
                recipeLink.setAttribute('target', '_blank');
                recipeLink.setAttribute('rel', 'noopener noreferrer');
                recipeLink.append(make('span', '', recipe), createPlantDetailIcon('external'));
                recipeList.appendChild(recipeLink);
            });
            recipeSection.append(recipeHeader, recipeList);
            informationColumn.appendChild(recipeSection);
        }

        const allImages = Array.isArray(seed.images) ? [...seed.images] : [];
        if (seed.image && !allImages.some(image => image && image.url === seed.image)) {
            allImages.unshift({ url: seed.image, id: 'starter', caption: 'Starter Foto' });
        }
        const safeImages = allImages
            .map(image => ({ ...image, url: safeWishlistImageUrl(image?.url) }))
            .filter(image => image.url);
        window._currentDetailImages = safeImages;
        if (safeImages.length > 0) {
            const gallerySection = make('div', 'detail-carousel-section');
            gallerySection.appendChild(heading('Fotogalerij', 'image'));
            const carousel = make('div', 'detail-carousel');
            safeImages.forEach((image, index) => {
                const carouselItem = make('button', 'detail-carousel-item');
                carouselItem.type = 'button'; carouselItem.setAttribute('aria-label', `Open foto ${index + 1} van ${text(seed.naam)}`);
                const imageElement = make('img');
                imageElement.setAttribute('src', image.url);
                imageElement.setAttribute('alt', `Foto ${index + 1}`);
                imageElement.setAttribute('loading', 'lazy');
                carouselItem.appendChild(imageElement);
                carouselItem.addEventListener('click', () => openLightbox(window._currentDetailImages, index));
                carousel.appendChild(carouselItem);
            });
            gallerySection.appendChild(carousel);
            summaryColumn.appendChild(gallerySection);
        }

        detailBody.append(summaryColumn, informationColumn);
        switchView('detail');
        if (focusedAction) detailBody.querySelector(`[data-detail-action="${focusedAction}"]`)?.focus({ preventScroll: true });
    }
    window.openDetailView = openDetailView;

    // Helper exposed for inline onclicks
    window._updateStatus = async (id, status) => {
        const seed = seeds.find(s => String(s.id) === String(id));
        if (seed) {
            updateQuickStatus(seed, status);
            incrementDailyProgress();
        }
    };
    window._toggleFavContent = async (id, options = {}) => {
        const seed = seeds.find(s => String(s.id) === String(id));
        if (seed) toggleQuickFavorite(seed, options);
    };

    function openEditView(seed) {
        editingId = seed.id;
        inputNaam.value = seed.naam;
        inputNaam.dataset.featuredUrl = seed.featuredImageUrl || '';
        if (inputType) {
            inputType.value = seed.type;
            delete inputType.dataset.userChanged;
        }
        if (inputStandplaats) {
            inputStandplaats.value = seed.standplaats;
            delete inputStandplaats.dataset.userChanged;
        }
        if (inputWater) {
            inputWater.value = seed.water;
            delete inputWater.dataset.userChanged;
        }
        if (inputStatus) inputStatus.value = seed.status || 'Voorraad';
        const codeInput = document.getElementById('code');
        if (codeInput) codeInput.value = seed.code || '';

        // ALWAYS initialize pickers so 12 months are rendered
        initMonthPicker('zaaitijd-picker');
        initMonthPicker('oogsttijd-picker');

        // Highlight active months (using seed object for sowing to pick up varied fields)
        setSelectedMonthsInPicker('zaaitijd-picker', seed);
        setSelectedMonthsInPicker('oogsttijd-picker', seed.oogsttijd);

        if (inputBeschrijving) inputBeschrijving.value = seed.beschrijving || '';
        if (inputErvaringen) inputErvaringen.value = seed.ervaringen || '';

        const pyInput = document.getElementById('purchaseYear');
        if (pyInput) pyInput.value = seed.purchaseYear || '';
        const slInput = document.getElementById('shopLink');
        if (slInput) slInput.value = seed.shopLink || '';

        const starPicker = document.getElementById('star-rating-picker');
        if (starPicker) {
            starPicker.dataset.value = seed.ervaringScore || 0;
            initStarPicker();
        }

        renderTagPicker(seed.tags || []);

        // Ensure all historical image sources are captured in the editable gallery
        pendingImages = seed.images ? [...seed.images] : [];
        if (seed.image && !pendingImages.some(img => img.url === seed.image)) {
            pendingImages.unshift({ url: seed.image, id: 'legacy-import-' + Date.now(), caption: 'Geadviseerde Foto' });
        }
        if (seed.featuredImageUrl && !pendingImages.some(img => img.url === seed.featuredImageUrl)) {
            pendingImages.unshift({ url: seed.featuredImageUrl, id: 'featured-import-' + Date.now(), caption: 'Hoofdfoto' });
        }

        photoSearchResults = [];
        const pexelsInput = document.getElementById('pexels-search-input');
        if (pexelsInput) pexelsInput.value = '';
        const banner = document.getElementById('suggestion-banner');
        if (banner) banner.classList.add('hidden');
        clearAiIndicators();
        renderUnifiedGallery();

        btnSubmitForm.textContent = 'Wijzigingen Opslaan';
        document.getElementById('btn-form-delete')?.classList.remove('hidden');
        switchView('add');
    }

    function renderQuickActions(seed) {
        const container = document.getElementById('detail-sticky-actions');
        if (!container) return;
        container.innerHTML = `
            <button class="action-btn-quick ${seed.fase_gezaaid ? 'active-sown' : ''}" id="q-sown" aria-label="Gezaaid"><span>🌱</span>Gezaaid</button>
            <button class="action-btn-quick ${seed.fase_groeit ? 'active-growing' : ''}" id="q-grow" aria-label="Groeit"><span>🌿</span>Groeit</button>
            <button class="action-btn-quick ${seed.fase_geoogst ? 'active-harvested' : ''}" id="q-harvest" aria-label="Oogst"><span>🧺</span>Oogst</button>
            <button class="action-btn-quick ${seed.isFavorite ? 'active-favorite' : ''}" id="q-fav" aria-label="Favoriet"><span>${seed.isFavorite ? '⭐' : '☆'}</span>Fav</button>
        `;
        document.getElementById('q-sown').onclick = () => { window._updateStatus(seed.id, 'Gezaaid'); };
        document.getElementById('q-grow').onclick = () => { window._updateStatus(seed.id, 'Groeit'); };
        document.getElementById('q-harvest').onclick = () => { window._updateStatus(seed.id, 'Geoogst'); };
        document.getElementById('q-fav').onclick = () => toggleQuickFavorite(seed);
    }

    async function updateQuickStatus(seed, togglePhase) {
        // Initialize flags for existing data if missing
        if (seed.fase_gezaaid === undefined) seed.fase_gezaaid = (seed.status === 'Gezaaid' || seed.status === 'Groeit' || seed.status === 'Geoogst');
        if (seed.fase_groeit === undefined) seed.fase_groeit = (seed.status === 'Groeit');
        if (seed.fase_geoogst === undefined) seed.fase_geoogst = (seed.status === 'Geoogst');

        // Toggle the selected phase
        if (togglePhase === 'Gezaaid') seed.fase_gezaaid = !seed.fase_gezaaid;
        if (togglePhase === 'Groeit') seed.fase_groeit = !seed.fase_groeit;
        if (togglePhase === 'Geoogst') seed.fase_geoogst = !seed.fase_geoogst;

        // Auto-detect Gezaaid if Growing or Harvested is active
        if (seed.fase_groeit || seed.fase_geoogst) seed.fase_gezaaid = true;

        // Recalculate main status for filters/badges
        const newMainStatus = deriveMainStatus(seed);
        seed.status = newMainStatus;

        if (seed.fase_gezaaid) {
            seed.lastSownYear = seed.lastSownYear || new Date().getFullYear();
        }

        await saveSeed(seed);
        showToast(`Status bijgewerkt naar: ${getStatusLabel(newMainStatus)} ✨`);
        openDetailView(seed);
        seeds = await getAllSeeds();
        if (!viewHome.classList.contains('hidden')) renderHome();
        if (!viewList.classList.contains('hidden')) applyFilters();
    }

    async function toggleQuickFavorite(seed, options = {}) {
        seed.isFavorite = !seed.isFavorite;
        await saveSeed(seed);
        showToast(seed.isFavorite ? 'Favoriet! ⭐' : 'Verwijderd');
        if (options.openDetail !== false) openDetailView(seed);
        seeds = await getAllSeeds();
        if (!viewList.classList.contains('hidden')) applyFilters();
        if (!viewHome.classList.contains('hidden')) renderHome();
    }

    // View Switching
    function switchView(name, options = {}) {
        window.scrollTo({ top: 0, behavior: 'instant' });
        [viewHome, viewList, viewSowingGrid, viewAdd, viewDetail, viewWishlist, viewCalendar, viewOnboarding].forEach(v => v?.classList.add('hidden'));
        // Sync Mobile Nav (Desktop & Mobile)
        document.querySelectorAll('.nav-buttons button').forEach(b => b?.classList.remove('active'));
        document.querySelectorAll('.mobile-nav-item').forEach(b => b.classList.remove('active'));
        document.querySelectorAll('.shell-nav-item').forEach(b => {
            const active = b.dataset.shellView === name;
            b.classList.toggle('active', active);
            if (active) b.setAttribute('aria-current', 'page');
            else b.removeAttribute('aria-current');
        });

        const activeDesktopBtn = document.querySelector(`.nav-buttons button[onclick*="${name}"]`);
        if (activeDesktopBtn) activeDesktopBtn.classList.add('active');

        const activeMobileBtn = document.querySelector(`.mobile-nav-item[data-view="${name}"]`);
        if (activeMobileBtn) activeMobileBtn.classList.add('active');

        if (name === 'home') { viewHome?.classList.remove('hidden'); btnHome?.classList.add('active'); renderHome(); }
        else if (name === 'onboarding') { viewOnboarding?.classList.remove('hidden'); }
        else if (name === 'list') {
            viewList?.classList.remove('hidden');
            btnList?.classList.add('active');

            const activeMonth = localStorage.getItem('activeMonthFilter');
            if (activeMonth) {
                applyMonthFilter(activeMonth);
            } else {
                applyFilters();
            }
        }
        else if (name === 'add') { viewAdd?.classList.remove('hidden'); btnAdd?.classList.add('active'); }
        else if (name === 'detail') { viewDetail?.classList.remove('hidden'); }
        else if (name === 'sowing-grid') { viewSowingGrid?.classList.remove('hidden'); btnSowingGrid?.classList.add('active'); renderSowingGrid(); }
        else if (name === 'wishlist') { viewWishlist?.classList.remove('hidden'); btnWishlist?.classList.add('active'); renderWishlist(); }
        else if (name === 'calendar') { calendarTaskWeek = Boolean(options.taskWeek); viewCalendar?.classList.remove('hidden'); btnCalendar?.classList.add('active'); renderCalendar(); }
    }

    if (btnHome) btnHome.onclick = () => switchView('home');
    if (btnList) btnList.onclick = () => {
        activePlantStatus = null;
        localStorage.removeItem('activeMonthFilter');
        activeMonthFilter = null;
        activeCategory = 'Alles'; // RESET CATEGORY TOO
        if (searchInput) searchInput.value = ''; // CLEAR SEARCH
        switchView('list');
    };
    if (btnSowingGrid) btnSowingGrid.onclick = () => switchView('sowing-grid');

    // Shared sidebar and mobile drawer navigation. The existing view switcher
    // remains the single source of truth for all production screens.
    const shellSidebar = document.getElementById('app-sidebar');
    const shellMobileMenu = document.getElementById('shell-mobile-menu');
    const shellMobileScrim = document.getElementById('shell-mobile-scrim');
    let shellMenuReturnFocus = null;

    const closeShellMenu = () => {
        document.body.classList.remove('shell-menu-open');
        if (shellMobileMenu) shellMobileMenu.setAttribute('aria-expanded', 'false');
        if (shellMobileScrim) shellMobileScrim.hidden = true;
        shellSidebar?.classList.remove('mobile-open');
        shellMenuReturnFocus?.focus?.();
    };

    const openShellMenu = () => {
        shellMenuReturnFocus = document.activeElement;
        document.body.classList.add('shell-menu-open');
        if (shellMobileMenu) shellMobileMenu.setAttribute('aria-expanded', 'true');
        if (shellMobileScrim) shellMobileScrim.hidden = false;
        shellSidebar?.classList.add('mobile-open');
        shellSidebar?.querySelector('.shell-nav-item')?.focus();
    };

    shellMobileMenu?.addEventListener('click', () => {
        if (document.body.classList.contains('shell-menu-open')) closeShellMenu();
        else openShellMenu();
    });
    shellMobileScrim?.addEventListener('click', closeShellMenu);
    document.addEventListener('keydown', event => {
        if (event.key === 'Escape' && document.body.classList.contains('shell-menu-open')) closeShellMenu();
    });

    document.querySelectorAll('.shell-nav-item, [data-shell-home]').forEach(button => {
        button.addEventListener('click', () => {
            const view = button.dataset.shellView;
            if (!view) return;
            if (view === 'list') {
                activePlantStatus = null;
                localStorage.removeItem('activeMonthFilter');
                activeMonthFilter = null;
                activeCategory = 'Alles';
                if (searchInput) searchInput.value = '';
            }
            switchView(view);
            if (document.body.classList.contains('shell-menu-open')) closeShellMenu();
        });
    });

    document.getElementById('shell-settings-button')?.addEventListener('click', () => {
        if (document.body.classList.contains('shell-menu-open')) closeShellMenu();
        toggleSettingsPanel_REPAIR_V131();
    });

    // MOBILE NAV LISTENERS (Safe & Robust)
    document.querySelectorAll('.mobile-nav-item').forEach(btn => {
        btn.addEventListener('click', function(e) {
            e.preventDefault();
            const view = this.dataset.view;
            if (!view) return;

            if (view === 'list') {
                activePlantStatus = null;
                localStorage.removeItem('activeMonthFilter');
                activeMonthFilter = null;
                activeCategory = 'Alles';
                if (searchInput) searchInput.value = '';
            }
            switchView(view);
        });
    });

    // New simplified Add trigger from Zaden page
    const btnAddZadenTop = document.getElementById('btn-add-zaden-top');
    const btnAddPlantHome = document.getElementById('btn-add-plant-home');
    if (btnAddPlantHome) btnAddPlantHome.addEventListener('click', () => openAddForm());
    // Initialize notes scanning independently of opening the seed form.
        // --- NOTE PARSER LOGIC ---
        const btnScanNotes = document.getElementById('btn-scan-notes');
        const parserModal = document.getElementById('note-parser-modal');
        const btnRunParser = document.getElementById('btn-run-parser');
        const parserInput = document.getElementById('note-parser-input');
        const parserList = document.getElementById('parser-results-list');
        const parserSection = document.getElementById('parser-results-section');

        if (btnScanNotes) {
            btnScanNotes.onclick = () => {
                parserModal.classList.remove('hidden');
                parserInput.value = '';
                parserSection.classList.add('hidden');
            };
        }

        if (btnRunParser) {
            btnRunParser.onclick = async () => {
                const text = parserInput.value.trim();
                if (!text) {
                    showToast("Voer eerst wat tekst in! ✍️");
                    return;
                }

                btnRunParser.disabled = true;
                const originalText = btnRunParser.textContent;
                btnRunParser.textContent = "Bezig met scannen... ✨";

                try {
                    const foundPlants = [];
                    const lowerText = text.toLowerCase();

                    // 1. Lokale match (mockData)
                    for (let key in mockData) {
                        if (lowerText.includes(key.toLowerCase())) {
                            foundPlants.push({ name: key });
                        }
                    }

                    // 2. AI Fallback (if few plants or just to be smart)
                    if (foundPlants.length < 5) {
                        try {
                            const aiRes = await vraagAI('parse_notes_for_seeds', text);
                            const jsonStr = aiRes.match(/\[[\s\S]*\]/)?.[0];
                            if (jsonStr) {
                                const aiPlants = JSON.parse(jsonStr);
                                aiPlants.forEach(p => {
                                    const pName = typeof p === 'string' ? p : p.name;
                                    if (pName && !foundPlants.some(fp => fp.name.toLowerCase() === pName.toLowerCase())) {
                                        foundPlants.push({ name: pName });
                                    }
                                });
                            }
                        } catch(e) { console.warn("AI Parser failed", e); }
                    }

                    if (foundPlants.length > 0) {
                        parserSection.classList.remove('hidden');
                        parserList.replaceChildren();
                        foundPlants.forEach(plant => {
                            const name = typeof plant?.name === 'string' ? plant.name : String(plant?.name || '');
                            if (!name) return;
                            const row = document.createElement('div');
                            row.style.cssText = 'display: flex; align-items: center; justify-content: space-between; padding: 12px; background: var(--bg-color); border-radius: 12px; border: 1px solid var(--border-color);';
                            const label = document.createElement('span');
                            label.style.cssText = 'font-weight: 600; color: var(--text-main);';
                            label.textContent = name;
                            const button = document.createElement('button');
                            button.type = 'button';
                            button.className = 'btn-primary-sm';
                            button.style.cssText = 'padding: 6px 12px; font-size: 11px;';
                            button.textContent = 'Toevoegen';
                            button.addEventListener('click', () => window._addParsedSeed(name));
                            row.append(label, button);
                            parserList.appendChild(row);
                        });
                    } else {
                        showToast("Geen planten herkend. Probeer duidelijker namen.");
                    }
                } finally {
                    btnRunParser.disabled = false;
                    btnRunParser.textContent = originalText;
                }
            };
        }

        window._addParsedSeed = async (name) => {
            parserModal.classList.add('hidden');
            openAddForm();
            inputNaam.value = name;
            // Trigger auto-fill automatically to make it feel magic
            triggerAutoFill(false);
            showToast(`Seed herkend: ${name} ✨`);
        };


    const openAddForm = () => {
        editingId = null;
        seedForm?.reset();
        pendingImages = [];
        photoSearchResults = [];
        displayedPhotoCount = 15;
        if (inputNaam) delete inputNaam.dataset.featuredUrl;
        if (inputType) delete inputType.dataset.userChanged;
        if (inputStandplaats) delete inputStandplaats.dataset.userChanged;
        if (inputWater) delete inputWater.dataset.userChanged;

        // Reset manual change tracking
        [inputType, inputStandplaats, inputWater, inputBeschrijving].forEach(inp => {
            if (inp) {
                delete inp.dataset.userChanged;
                const group = inp.closest('.form-group');
                if (group) {
                    const badge = group.querySelector('.ai-badge');
                    if (badge) badge.remove();
                }
            }
        });

        const banner = document.getElementById('suggestion-banner');
        if (banner) banner.classList.add('hidden');

        const sourceStatus = document.getElementById('ai-source-status');
        if (sourceStatus) {
            sourceStatus.classList.add('hidden');
            sourceStatus.classList.remove('visible');
        }

        clearAiIndicators();

        renderUnifiedGallery();
        renderTagPicker();
        initMonthPicker('zaaitijd-picker');
        initMonthPicker('oogsttijd-picker');
        initStarPicker();

        const pyInput = document.getElementById('purchaseYear');
        if (pyInput) pyInput.value = new Date().getFullYear();
        const slInput = document.getElementById('shopLink');
        if (slInput) slInput.value = '';

        btnSubmitForm.textContent = 'Zaadje Opslaan';
        document.getElementById('btn-form-delete')?.classList.add('hidden');
        document.getElementById('pexels-mini-search')?.classList.add('hidden');
        switchView('add');
    };
    if (btnAddZadenTop) btnAddZadenTop.onclick = openAddForm;
    window.openAddForm = openAddForm;
    const btnQuickPhotoSearch = document.getElementById('btn-quick-photo-search');
    const unifiedGallery = document.getElementById('unified-image-gallery');

    if (btnQuickPhotoSearch) {
        btnQuickPhotoSearch.onclick = async () => {
            const query = inputNaam.value.trim();
            if (!query) {
                showToast("Vul eerst een naam in om foto's te zoeken! ✌️");
                return;
            }

            // --- CRITICAL FIX: Clear old results immediately ---
            photoSearchResults = [];
            photoSearchResults = [];
            displayedPhotoCount = 15;
            renderUnifiedGallery();

            btnQuickPhotoSearch.disabled = true;
            btnQuickPhotoSearch.textContent = "⏳ Bezig met zoeken...";

            try {
                const results = await searchPlantImage(query);
                if (results && results.length > 0) {
                    photoSearchResults = results.map(r => r && typeof r === 'object' ? ({
                        ...r,
                        url: r.url,
                        source: 'web',
                        id: r.id || Math.random().toString(36).substr(2, 9)
                    }) : null).filter(Boolean);
                } else {
                    // No results is not a hard error, just show toast once
                    showToast(`Geen foto's gevonden voor "${query}".`);
                }
                renderUnifiedGallery();
            } catch (err) {
                console.error("Pexels Search Error:", err);
                showToast("Foto-informatie niet bereikbaar.");
            } finally {
                btnQuickPhotoSearch.disabled = false;
                btnQuickPhotoSearch.textContent = "🔍 Zoek foto's op naam";
            }
        };
    }

    function renderUnifiedGallery() {
        if (!unifiedGallery) return;
        unifiedGallery.replaceChildren();

        const validSearchResults = photoSearchResults.map(normalizeExternalImageResult).filter(Boolean);
        const validPendingImages = pendingImages.map(normalizeExternalImageResult).filter(Boolean);
        const loadMoreWrap = document.getElementById('photo-load-more');
        if (loadMoreWrap) loadMoreWrap.classList.toggle('hidden', validSearchResults.length <= displayedPhotoCount);

        if (validPendingImages.length === 0 && validSearchResults.length === 0) {
            const empty = document.createElement('div');
            empty.className = 'hub-empty';
            const title = document.createElement('span');
            title.textContent = '📸 Nog geen foto\'s geselecteerd of gezocht.';
            const hint = document.createElement('span');
            hint.style.cssText = 'font-size: 11px; font-weight: 400; opacity: 0.6;';
            hint.textContent = 'Voer een naam in en klik op "Zoek foto\'s" om resultaten te zien.';
            empty.append(title, hint);
            unifiedGallery.appendChild(empty);
            return;
        }

        const displayedItems = [...validSearchResults];
        validPendingImages.forEach(item => {
            if (!displayedItems.some(displayed => displayed.imageUrl === item.imageUrl)) displayedItems.unshift(item);
        });

        displayedItems.forEach(item => {
            const isSelected = validPendingImages.some(pending => pending.imageUrl === item.imageUrl);
            if (!isSelected && validSearchResults.some(result => result.imageUrl === item.imageUrl)) {
                const searchIndex = validSearchResults.findIndex(result => result.imageUrl === item.imageUrl);
                if (searchIndex >= displayedPhotoCount) return;
            }

            const currentFeatured = safeWishlistImageUrl(inputNaam.dataset.featuredUrl);
            const isFeatured = currentFeatured === item.imageUrl || (!currentFeatured && validPendingImages[0]?.imageUrl === item.imageUrl && isSelected);
            if (isFeatured && !inputNaam.dataset.featuredUrl && isSelected) inputNaam.dataset.featuredUrl = item.imageUrl;

            const card = buildImageSearchCard(item, {
                isSelected,
                isFeatured,
                onFeature: selectedItem => {
                    if (!pendingImages.some(pending => safeWishlistImageUrl(pending.url) === selectedItem.imageUrl)) pendingImages.push(selectedItem);
                    inputNaam.dataset.featuredUrl = selectedItem.imageUrl;
                    renderUnifiedGallery();
                },
                onToggle: selectedItem => {
                    if (isSelected) {
                        pendingImages = pendingImages.filter(pending => safeWishlistImageUrl(pending.url) !== selectedItem.imageUrl);
                        if (inputNaam.dataset.featuredUrl === selectedItem.imageUrl) inputNaam.dataset.featuredUrl = pendingImages[0]?.url || '';
                    } else {
                        pendingImages.push(selectedItem);
                        if (!safeWishlistImageUrl(inputNaam.dataset.featuredUrl)) inputNaam.dataset.featuredUrl = selectedItem.imageUrl;
                    }
                    renderUnifiedGallery();
                }
            });
            if (card) unifiedGallery.appendChild(card);
        });

        if (validSearchResults.length > displayedPhotoCount) {
            const moreContainer = document.createElement('div');
            moreContainer.style.gridColumn = '1 / -1';
            moreContainer.style.textAlign = 'center';
            moreContainer.style.marginTop = '10px';
            const btnMore = document.createElement('button');
            btnMore.type = 'button';
            btnMore.className = 'btn-helper-link';
            btnMore.style.fontSize = '12px';
            btnMore.textContent = '⏷ Toon meer foto\'s (' + (validSearchResults.length - displayedPhotoCount) + ' meer)';
            btnMore.addEventListener('click', () => {
                displayedPhotoCount += 15;
                renderUnifiedGallery();
            });
            moreContainer.appendChild(btnMore);
            unifiedGallery.appendChild(moreContainer);
        }
    }

    // --- PHOTO SEARCH IMPROVEMENTS ---
    const btnPexelsCustom = document.getElementById('btn-pexels-custom-search');
    const inputPexelsCustom = document.getElementById('pexels-custom-query');

    if (btnPexelsCustom) {
        btnPexelsCustom.onclick = async () => {
            const query = inputPexelsCustom.value.trim();
            if (!query) return;

            btnPexelsCustom.disabled = true;
            btnPexelsCustom.textContent = "⏳...";

            try {
                const results = await searchPlantImage(query);
                if (results && results.length > 0) {
                    const newItems = results.map(r => r && typeof r === 'object' ? ({
                        ...r,
                        url: r.url,
                        source: 'web',
                        id: r.id || Math.random().toString(36).substr(2, 9)
                    }) : null).filter(Boolean);
                    // Add new unique items to the result set
                    newItems.forEach(item => {
                        if (!photoSearchResults.some(existing => existing.url === item.url)) {
                            photoSearchResults.push(item);
                        }
                    });
                    displayedPhotoCount = Math.max(displayedPhotoCount, 15);
                    showToast(`${results.length} nieuwe foto's gevonden! 📸`);
                }
                renderUnifiedGallery();
            } catch (e) {
                console.error(e);
            } finally {
                btnPexelsCustom.disabled = false;
                btnPexelsCustom.textContent = "🔍 Zoek";
            }
        };

        if (inputPexelsCustom) {
            inputPexelsCustom.addEventListener('keydown', (e) => {
                if (e.key === 'Enter') {
                    e.preventDefault();
                    btnPexelsCustom.click();
                }
            });
        }
    }

    // Link top save button
    const btnSaveTop = document.getElementById('btn-save-top');
    if (btnSaveTop && typeof seedForm !== 'undefined') {
        btnSaveTop.onclick = (e) => {
             e.preventDefault();
             console.log("Top save button clicked");
             // Directly call submit instead of dispatchEvent for better reliability
             const form = document.getElementById('seed-form');
             if (form) {
                 // Trigger the form submit logic
                 form.requestSubmit ? form.requestSubmit() : form.dispatchEvent(new Event('submit', { cancelable: true, bubbles: true }));
             }
        };
    }

    // Wrap the original file upload logic
    const fileInput = document.getElementById('file-upload');
    const dropzone = document.getElementById('dropzone-wide');

    if (dropzone && fileInput) {
        dropzone.onclick = () => fileInput.click();

        fileInput.onchange = (e) => {
            const files = Array.from(e.target.files);
            files.forEach(file => {
                const reader = new FileReader();
                reader.onload = (re) => {
                    const url = safeWishlistImageUrl(re.target.result);
                    if (!url) return;
                    if (!pendingImages.some(p => p.url === url)) {
                        pendingImages.push({ url, source: 'upload' });
                        if (!inputNaam.dataset.featuredUrl) {
                            inputNaam.dataset.featuredUrl = url;
                        }
                        renderUnifiedGallery();
                    }
                };
                reader.readAsDataURL(file);
            });
        };
    }

    // Toggle logic for Extra Section (Notes & Tags)
    const toggleBtn = document.querySelector(".collapsible-toggle-bar");
    const extraSection = document.getElementById("extra-section");

    if (toggleBtn && extraSection) {
        const chevron = toggleBtn.querySelector(".toggle-icon-chevron");
        const textSpan = toggleBtn.querySelector(".toggle-text");

        // Ensure initial state matches localStorage
        const shouldBeExpanded = localStorage.getItem("expanded_extra-section") === "true";
        if (shouldBeExpanded) {
            extraSection.style.display = "block";
            extraSection.classList.remove("collapsed");
            if (chevron) chevron.textContent = "▾";
            if (textSpan) textSpan.textContent = "Notities & kenmerken";
        } else {
            extraSection.style.display = "none";
            extraSection.classList.add("collapsed");
            if (chevron) chevron.textContent = "▸";
            if (textSpan) textSpan.textContent = "Notities & kenmerken (optioneel)";
        }

        toggleBtn.addEventListener("click", (e) => {
            e.preventDefault();
            const isCurrentlyHidden = extraSection.style.display === "none";

            if (isCurrentlyHidden) {
                extraSection.style.display = "block";
                extraSection.classList.remove("collapsed");
                if (chevron) chevron.textContent = "▾";
                if (textSpan) textSpan.textContent = "Notities & kenmerken";
                localStorage.setItem("expanded_extra-section", "true");
            } else {
                extraSection.style.display = "none";
                extraSection.classList.add("collapsed");
                if (chevron) chevron.textContent = "▸";
                if (textSpan) textSpan.textContent = "Notities & kenmerken (optioneel)";
                localStorage.setItem("expanded_extra-section", "false");
            }
        });
    }

    if (btnWishlist) btnWishlist.onclick = () => switchView('wishlist');
    if (btnCalendar) btnCalendar.onclick = () => switchView('calendar');
    if (btnDetailBack) btnDetailBack.onclick = () => switchView('list');

    // Shared selections for dashboard counts and their filtered destinations.
    const activeGardenStatuses = ['Gezaaid', 'Groeit', 'Geoogst'];
    const getActiveGardenPlants = () => seeds.filter(seed => activeGardenStatuses.includes(seed.status));
    function getDashboardSelection(today = new Date()) {
        const reminderGroups = classifyDashboardReminders(reminders, today);
        const currentMonth = today.getMonth();
        const nextMonth = (currentMonth + 1) % 12;
        const monthPrefix = reminderGroups.todayKey.slice(0, 7);
        const sowing = seeds.filter(seed => seed.status === 'Voorraad' && !reminders.some(reminder =>
            reminder.title.toLowerCase().includes(seed.naam.toLowerCase()) && reminder.date.startsWith(monthPrefix)
        )).map(seed => {
            const months = getActiveMonths(seed);
            const category = months.has(currentMonth) ? 'now' : months.has(nextMonth) ? 'soon' : months.size ? 'missed' : '';
            return { ...seed, category };
        }).filter(seed => seed.category);
        return { reminderGroups, sowing, now: sowing.filter(seed => seed.category === 'now'), soon: sowing.filter(seed => seed.category === 'soon') };
    }

    function focusInsightDestination(id) {
        const destination = document.getElementById(id);
        destination?.setAttribute('tabindex', '-1');
        destination?.focus({ preventScroll: true });
    }

    function openGardenList(status) {
        activePlantStatus = status; activeCategory = 'Alles'; activeMonthFilter = null;
        localStorage.removeItem('activeMonthFilter'); searchInput.value = '';
        filterChips.forEach(chip => chip.classList.toggle('active', chip.dataset.filter === 'Alles'));
        switchView('list');
    }

    // Home Logic - MIJN TUIN DASHBOARD
    function renderHome() {
        window.KweekServices?.updateDashboardProvider?.();
        const homeIconPaths = {
            sprout: 'M12 20V10m0 3c-4.5 0-7-2.2-7-6 4.8 0 7 2 7 6Zm0 1c4.3 0 7-2.3 7-6-4.6 0-7 2.2-7 6Z',
            calendar: 'M7 3v3m10-3v3M4 9h16M5 5h14a1 1 0 0 1 1 1v13H4V6a1 1 0 0 1 1-1Zm2 8h3m2 0h3m-8 4h3',
            check: 'm5 12 4 4L19 6',
            star: 'm12 3 2.8 5.7 6.2.9-4.5 4.4 1.1 6.2L12 17.3l-5.6 2.9 1.1-6.2L3 9.6l6.2-.9Z',
            leaf: 'M19.5 4.5C10 4 5 8 5 13.5A5.5 5.5 0 0 0 10.5 19C16 19 20 14 19.5 4.5ZM5 20c2.5-4 6-7.5 11-10',
            bulb: 'M12 3.5a7 7 0 0 0-4.2 12.6c.9.7 1.2 1.5 1.2 2.4h6c0-.9.3-1.7 1.2-2.4A7 7 0 0 0 12 3.5ZM9.5 21h5m-4.5-4h4'
        };
        const makeHomeIcon = (name) => {
            const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
            svg.setAttribute('viewBox', '0 0 24 24');
            svg.setAttribute('aria-hidden', 'true');
            svg.classList.add('home-inline-icon');
            const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
            path.setAttribute('d', homeIconPaths[name] || homeIconPaths.sprout);
            path.setAttribute('fill', 'none');
            path.setAttribute('stroke', 'currentColor');
            path.setAttribute('stroke-width', '1.6');
            path.setAttribute('stroke-linecap', 'round');
            path.setAttribute('stroke-linejoin', 'round');
            svg.appendChild(path);
            return svg;
        };

        const homeTitle = document.getElementById('home-title');
        if (homeTitle) {
            homeTitle.replaceChildren();
            const titleText = document.createElement('span');
            titleText.className = 'home-heading-name';
            titleText.textContent = 'Mijn tuin';
            homeTitle.append(titleText);
        }
        const today = new Date();
        const selection = getDashboardSelection(today);
        const { reminderGroups } = selection;
        const dateLabel = document.getElementById('home-current-date');
        if (dateLabel) {
            const dateText = today.toLocaleDateString('nl-NL', { weekday: 'long', day: 'numeric', month: 'long' });
            dateLabel.textContent = dateText.charAt(0).toUpperCase() + dateText.slice(1);
        }
        const yearLabel = document.getElementById('header-year-select');
        if (yearLabel) yearLabel.textContent = String(today.getFullYear());

        // Rustige start: Verberg AI output bij render indien niet actief gezocht
        const aiOutput = document.getElementById('ai-assistant-output');
        if (aiOutput && !aiOutput.dataset.active) {
            aiOutput.style.display = 'none';
        }

        const monthsNames = ["januari", "februari", "maart", "april", "mei", "juni", "juli", "augustus", "september", "oktober", "november", "december"];
        const currentMonth = today.getMonth();

        // 2. NU DOEN (Smart Action List)
        // EXPLICIT: Only seeds in 'Voorraad' state can be 'Now' or 'Missed'.
        // Once sown (Gezaaid), they move out of this list entirely.
        const nuDoenRaw = selection.sowing;
        const nuDoenAnnotated = nuDoenRaw.map(s => {
            let urgency = 10;
            let label = "";
            const category = s.category;
            let context = "";

            let suggestion = "";
            let suggestDate = null;
            let calendarStatus = "";

            if (category === 'now') {
                label = "Nu zaaien";
                urgency = 1;
                context = ""; // We use suggestion instead for 'now'


    // Suggestion/Calendar logic
    const today = new Date();
    const hasReminder = (reminders || []).some(r => r.title.toLowerCase().includes(s.naam.toLowerCase()) && r.date.startsWith(today.toISOString().substring(0, 7)));

    if (hasReminder) {
        calendarStatus = "Staat in je kalender";
    } else {
        suggestion = "Laatste kans — plan vandaag";
        suggestDate = today;
    }
} else if (category === 'soon') {
    label = "Binnenkort";
    urgency = 5;
                context = "Binnenkort ideaal moment";
            } else if (category === 'missed') {
                label = 'Later / volgend seizoen';
                urgency = 20;
                context = 'Voor een volgend zaaimoment';
            }

            return { ...s, urgency, label, category, context, suggestion, suggestDate, calendarStatus };
        }).filter(s => s.category !== "").sort((a, b) => a.urgency - b.urgency || a.naam.localeCompare(b.naam));

        const nuDoenContainer = document.getElementById('dashboard-nu-doen');
        if (nuDoenContainer) {
            nuDoenContainer.replaceChildren();
            const { current: currentReminders, future: futureReminders, overdue } = reminderGroups;
            const appendReminders = (items, container) => items.sort((a, b) => a.date.localeCompare(b.date)).forEach(reminder => {
                const row = document.createElement('div');
                row.className = 'mini-card home-reminder-task';
                const copy = document.createElement('div');
                copy.className = 'mini-card-content';
                const name = document.createElement('strong');
                name.textContent = reminder.title;
                const date = document.createElement('span');
                date.className = 'mini-card-context';
                date.textContent = `Gepland: ${new Date(`${reminder.date}T00:00:00`).toLocaleDateString('nl-NL', { day: 'numeric', month: 'long', year: 'numeric' })}`;
                copy.append(name, date);
                const done = document.createElement('button');
                done.type = 'button'; done.className = 'btn-mini-action';
                done.setAttribute('aria-label', `Voltooi ${reminder.title}`);
                done.append(makeHomeIcon('check'));
                done.addEventListener('click', () => { reminder.done = true; saveReminders(); incrementDailyProgress(); renderHome(); });
                row.append(copy, done); container.append(row);
            });
            appendReminders(currentReminders, nuDoenContainer);
            let overdueSection = null;
            if (overdue.length) {
                const section = document.createElement('section');
                section.className = 'home-overdue-tasks';
                section.setAttribute('aria-label', 'Achterstallige taken');
                const heading = document.createElement('h4');
                heading.textContent = `Achterstallig (${overdue.length})`;
                section.append(heading);
                appendReminders(overdue, section);
                overdueSection = section;
            }
            if (!nuDoenAnnotated.some(s => s.category === 'now') && !currentReminders.length) {
                const empty = document.createElement('div');
                empty.className = 'empty-state home-task-empty';
                const icon = makeHomeIcon('sprout');
                const message = document.createElement('p');
                message.textContent = 'Je bent bij voor deze week.';
                const detail = document.createElement('p');
                detail.className = 'home-task-empty-detail';
                detail.textContent = 'Bekijk je planning of bereid het volgende seizoen voor.';
                const calendar = document.createElement('button');
                calendar.type = 'button'; calendar.className = 'btn-primary home-calendar-link';
                calendar.append(makeHomeIcon('calendar'), document.createTextNode('Bekijk kalender'));
                calendar.addEventListener('click', () => switchView('calendar'));
                empty.append(icon, message, detail, calendar);
                nuDoenContainer.appendChild(empty);
            }
            {
                const laterItems = nuDoenAnnotated.filter(s => s.category !== 'now');
                const later = document.createElement('details');
                later.className = 'home-later-tasks';
                const summary = document.createElement('summary');
                summary.textContent = `Later / volgend seizoen · ${laterItems.length + futureReminders.length}`;
                later.append(summary);
                appendReminders(futureReminders, later);
                const groups = [
                    { id: 'now', label: 'Nu doen', icon: 'sprout', urgency: 0 },
                    { id: 'soon', label: 'Binnenkort', icon: 'calendar', urgency: 5 },
                    { id: 'missed', label: 'Later / volgend seizoen', icon: 'leaf', urgency: 20 }
                ].sort((a,b) => a.urgency - b.urgency);


                groups.forEach(group => {
                    const groupItems = nuDoenAnnotated.filter(s => s.category === group.id);
                    if (groupItems.length === 0) return;

                    const currentLimit = groupItems.length;

                    const groupDiv = document.createElement('div');
                    groupDiv.className = 'status-group';
                    const groupTitle = document.createElement('div');
                    groupTitle.className = `status-group-title ${safeClassToken(group.id)}`;
                    groupTitle.append(makeHomeIcon(group.icon), document.createTextNode(group.label));
                    const groupCount = document.createElement('span');
                    groupCount.style.cssText = 'font-size:10px; margin-left:4px; opacity:0.6; font-weight:400;';
                    groupCount.textContent = `(${groupItems.length})`;
                    groupTitle.appendChild(groupCount);
                    groupDiv.appendChild(groupTitle);

                    const grid = document.createElement('div');
                    grid.className = 'mini-cards-grid';

                    let itemsInGroup = 0;
                    groupItems.forEach(s => {
                        if (itemsInGroup >= currentLimit) return;

                        const mini = document.createElement('div');
                        mini.className = 'mini-card';
                        mini.tabIndex = 0;
                        mini.setAttribute('role', 'group');
                        mini.setAttribute('aria-label', `Open ${String(s.naam || 'plant')}`);



                        const miniContent = document.createElement('div');
                        miniContent.className = 'mini-card-content';
                        const miniName = document.createElement('div');
                        miniName.className = 'mini-card-name';
                        if (s.isFavorite) miniName.appendChild(document.createTextNode('Favoriet · '));
                        miniName.appendChild(document.createTextNode(typeof s.naam === 'string' ? s.naam : ''));
                        miniContent.appendChild(miniName);
                        if (!s.calendarStatus && !s.suggestion) {
                            const context = document.createElement('div');
                            context.className = 'mini-card-context';
                            context.textContent = typeof s.context === 'string' ? s.context : '';
                            miniContent.appendChild(context);
                        } else if (s.calendarStatus) {
                            const calendarStatus = document.createElement('div');
                            calendarStatus.className = 'mini-card-suggestion done';
                            calendarStatus.style.cssText = 'opacity:0.5; cursor:default;';
                            calendarStatus.textContent = s.calendarStatus;
                            miniContent.appendChild(calendarStatus);
                        } else if (s.suggestion) {
                            const suggestion = document.createElement('div');
                            suggestion.className = 'mini-card-suggestion';
                            suggestion.dataset.type = 'suggest';
                            suggestion.textContent = s.suggestion;
                            miniContent.appendChild(suggestion);
                        }
                        mini.appendChild(miniContent);

                        const miniActions = document.createElement('div');
                        miniActions.className = 'mini-card-actions';
                        const calendarButton = document.createElement('button');
                        calendarButton.type = 'button';
                        calendarButton.className = 'btn-mini-action';
                        calendarButton.title = 'Zet in Kalender';
                        calendarButton.setAttribute('aria-label', `Plan ${String(s.naam || 'plant')} in de kalender`);
                        calendarButton.dataset.type = 'cal';
                        calendarButton.appendChild(makeHomeIcon('calendar'));
                        const sownButton = document.createElement('button');
                        sownButton.type = 'button';
                        sownButton.className = 'btn-mini-action';
                        sownButton.title = 'Markeer als gezaaid';
                        sownButton.setAttribute('aria-label', `Markeer ${String(s.naam || 'plant')} als gezaaid`);
                        sownButton.dataset.type = 'sown';
                        sownButton.appendChild(makeHomeIcon('check'));
                        miniActions.append(calendarButton, sownButton);
                        mini.appendChild(miniActions);

                        // Main click -> Direct to Detail (New requirement)
                        mini.onclick = (e) => {
                            if (e.target.closest('.btn-mini-action')) return;
                            window.openDetailView(s);
                        };
                        mini.addEventListener('keydown', (event) => {
                            if ((event.key === 'Enter' || event.key === ' ') && !event.target.closest('.btn-mini-action')) {
                                event.preventDefault();
                                window.openDetailView(s);
                            }
                        });

                        // Action Buttons
                        mini.querySelectorAll('.btn-mini-action').forEach(btn => {
                            btn.onclick = async (e) => {
                                e.stopPropagation();
                                const type = btn.dataset.type;

                                if (type === 'sown') {
                                    mini.classList.add('removing');
                                    const targetId = s.id;
                                    setTimeout(async () => {
                                        const plant = seeds.find(seed => String(seed.id) === String(targetId));
                                        if (!plant) return;
                                        plant.fase_gezaaid = true;
                                        plant.status = deriveMainStatus(plant);
                                        plant.lastSownYear = new Date().getFullYear();

                                        await saveSeed(plant);
                                        incrementDailyProgress();
                                        showToastWithHomeLink('Toegevoegd aan ', ' 🌱');
                                        renderHome();
                                        // Optional: Scroll to it in the garden list for feedback (5.17)
                                        setTimeout(() => window.scrollToGardenItem(targetId), 100);
                                    }, 250);
                                } else if (type === 'cal') {
                                    // Requirement 16.1 & 16.2: Direct intent with date picker
                                    const picker = document.createElement('input');
                                    picker.type = 'date';
                                    picker.style.position = 'fixed';
                                    picker.style.top = '0';
                                    picker.style.left = '0';
                                    picker.style.opacity = '0';
                                    picker.style.pointerEvents = 'none';
                                    document.body.appendChild(picker);

                                    // Default to suggested date if it exists
                                    if (s.suggestDate) {
                                        picker.value = (s.suggestDate instanceof Date) ? s.suggestDate.toISOString().split('T')[0] : s.suggestDate;
                                    } else {
                                        picker.value = new Date().toISOString().split('T')[0];
                                    }

                                    if (picker.showPicker) {
                                        picker.showPicker();
                                    } else {
                                        picker.click();
                                    }

                                    picker.onchange = () => {
                                        if (picker.value) {
                                            const selectedDate = new Date(picker.value);
                                            const day = selectedDate.getDate();
                                            const month = selectedDate.toLocaleDateString('nl-NL', { month: 'short' });

                                            // Visual confirmation: Requirement 17.2
                                            mini.replaceChildren();
                                            const confirmation = document.createElement('div');
                                            confirmation.style.cssText = 'display:flex; align-items:center; justify-content:center; width:100%; height:100%; color:var(--primary-color); background:var(--bg-alt); border-radius:12px; font-size:12px;';
                                            const confirmationText = document.createElement('span');
                                            confirmationText.style.fontWeight = '700';
                                            confirmationText.textContent = `Gepland op ${day} ${month}`;
                                            confirmation.appendChild(confirmationText);
                                            mini.appendChild(confirmation);

                                            mini.classList.add('removing');
                                            setTimeout(() => {
                                                addQuickReminder(s, selectedDate);
                                                renderHome(); // Refreshes list, item is now filtered out (17.1)
                                            }, 750);
                                        }
                                        picker.remove();
                                    };
                                    picker.addEventListener('cancel', () => picker.remove());
                                    setTimeout(() => { if (document.body.contains(picker)) picker.remove(); }, 60000);
                                }
                            };
                        });

                        const suggestionEl = mini.querySelector('.mini-card-suggestion');
                        if (suggestionEl && s.suggestDate) {
                            suggestionEl.onclick = (e) => {
                                e.stopPropagation();
                                // Reuse the picker logic for intent from text too
                                const btnCal = mini.querySelector('.btn-mini-action[data-type="cal"]');
                                if (btnCal) btnCal.click();
                            };
                        }

                        grid.appendChild(mini);
                        itemsInGroup++;
                    });

                    groupDiv.appendChild(grid);

                    (group.id === 'now' ? nuDoenContainer : later).appendChild(groupDiv);
                });
                if (overdueSection) nuDoenContainer.append(overdueSection);
                nuDoenContainer.append(later);
            }
        }

        // 3. MIJN PLANTEN (Mini-cards grouped by status)
        const gardenPlants = getActiveGardenPlants();
        const insightsContainer = document.getElementById('home-insights');
        if (insightsContainer) {
            insightsContainer.replaceChildren();
            const remindersThisWeek = reminderGroups.current.length + selection.now.length;
            const insightItems = [
                { icon: 'sprout', label: 'Actieve planten', value: gardenPlants.length, open: () => {
                    openGardenList('Actief'); focusInsightDestination('seeds-context-banner');
                } },
                { icon: 'calendar', label: 'Taken deze week', value: remindersThisWeek, open: () => {
                    curCalDate = new Date(); selectedDateStr = formatDate(curCalDate);
                    switchView('calendar', { taskWeek: true }); focusInsightDestination('selected-date-label');
                } },
                { icon: 'leaf', label: 'Binnenkort zaaien', value: selection.soon.length, open: () => {
                    plannerSoonDate = new Date(today);
                    plannerSelectedMonth = (plannerSoonDate.getMonth() + 1) % 12;
                    plannerSelectedYear = new Date(today.getFullYear(), today.getMonth() + 1, 1).getFullYear();
                    switchView('sowing-grid'); focusInsightDestination('planner-active-month-title');
                } }
            ];
            insightItems.slice(0, 3).forEach(item => {
                const insight = document.createElement('button');
                insight.type = 'button';
                insight.className = 'home-insight-card';
                insight.addEventListener('click', item.open);
                const copy = document.createElement('span');
                copy.className = 'home-insight-copy';
                const label = document.createElement('span');
                label.textContent = item.label;
                const value = document.createElement('strong');
                value.textContent = String(item.value);
                copy.append(label, value);
                insight.append(makeHomeIcon(item.icon), copy);
                const arrow = document.createElement('span');
                arrow.className = 'home-insight-arrow'; arrow.textContent = '→';
                arrow.setAttribute('aria-hidden', 'true'); insight.append(arrow);
                insightsContainer.appendChild(insight);
            });
        }

        const groupedContainer = document.getElementById('dashboard-mijn-planten-grouped');
        if (groupedContainer) {
            groupedContainer.replaceChildren();
            const statuses = ['Gezaaid', 'Groeit', 'Geoogst'];
            const tabs = document.createElement('div');
            tabs.className = 'home-plant-tabs';
            tabs.setAttribute('role', 'tablist');
            tabs.setAttribute('aria-label', 'Plantstatus');
            statuses.forEach(status => {
                const tab = document.createElement('button');
                tab.type = 'button'; tab.id = 'home-tab-' + status;
                tab.setAttribute('role', 'tab');
                tab.setAttribute('aria-selected', String(status === dashboardPlantStatus));
                tab.setAttribute('aria-controls', 'home-plant-panel');
                tab.tabIndex = status === dashboardPlantStatus ? 0 : -1;
                const count = document.createElement('span');
                count.textContent = String(gardenPlants.filter(s => s.status === status).length);
                tab.append(document.createTextNode(status + ' '), count);
                const select = next => { dashboardPlantStatus = next; renderHome(); document.getElementById('home-tab-' + next)?.focus(); };
                tab.addEventListener('click', () => select(status));
                tab.addEventListener('keydown', event => {
                    const index = statuses.indexOf(status);
                    const next = event.key === 'ArrowRight' ? statuses[(index+1)%statuses.length] : event.key === 'ArrowLeft' ? statuses[(index+statuses.length-1)%statuses.length] : event.key === 'Home' ? statuses[0] : event.key === 'End' ? statuses[statuses.length-1] : null;
                    if (next) { event.preventDefault(); select(next); }
                });
                tabs.append(tab);
            });
            const panel = document.createElement('div');
            panel.id = 'home-plant-panel'; panel.className = 'home-plants-grid mini-cards-grid';
            panel.setAttribute('role', 'tabpanel');
            panel.setAttribute('aria-labelledby', 'home-tab-' + dashboardPlantStatus);
            const plants = gardenPlants.filter(s => s.status === dashboardPlantStatus)
                .sort((a,b) => Number(Boolean(b.isFavorite)) - Number(Boolean(a.isFavorite)) || a.naam.localeCompare(b.naam));
            plants.slice(0,4).forEach(s => {
                const row = document.createElement('div');
                row.className = 'mini-card'; row.id = 'garden-card-' + s.id;
                const open = document.createElement('button');
                open.type = 'button'; open.className = 'home-plant-open';
                open.setAttribute('aria-label', 'Open ' + s.naam);
                open.title = s.naam;
                const thumb = document.createElement('div'); thumb.className = 'home-plant-thumb';
                const fallback = () => { thumb.replaceChildren(makeHomeIcon('sprout')); thumb.classList.add('is-placeholder'); };
                const imageUrl = safeWishlistImageUrl(s.featuredImageUrl || s.image || s.images?.[0]?.url);
                if (imageUrl) {
                    const image = document.createElement('img'); image.src = imageUrl; image.alt = ''; image.loading = 'lazy';
                    image.addEventListener('error', fallback, { once: true }); thumb.append(image);
                } else fallback();
                const name = document.createElement('span'); name.className = 'mini-card-name';
                name.textContent = s.naam;
                open.append(thumb, name);
                open.addEventListener('click', () => openDetailView(s));
                const favorite = document.createElement('button');
                favorite.type = 'button'; favorite.className = 'home-plant-favorite';
                favorite.setAttribute('aria-label', 'Favoriet: ' + s.naam);
                favorite.setAttribute('aria-pressed', String(Boolean(s.isFavorite)));
                const star = makeHomeIcon('star');
                if (s.isFavorite) star.querySelector('path').setAttribute('fill', 'currentColor');
                favorite.append(star);
                favorite.addEventListener('click', () => toggleQuickFavorite(s, { openDetail: false }));
                row.append(open, favorite); panel.append(row);
            });
            if (!plants.length) {
                const empty = document.createElement('p'); empty.className = 'empty-state';
                empty.textContent = 'Geen planten met status ' + dashboardPlantStatus.toLowerCase() + '.';
                panel.append(empty);
            }
            const all = document.createElement('button');
            all.type = 'button'; all.className = 'home-view-all-plants';
            const statusDescription = { Gezaaid: 'gezaaide', Groeit: 'groeiende', Geoogst: 'geoogste' };
            all.textContent = 'Bekijk alle ' + statusDescription[dashboardPlantStatus] + ' planten (' + plants.length + ') →';
            all.addEventListener('click', () => {
                openGardenList(dashboardPlantStatus);
            });
            groupedContainer.append(tabs, panel, all);
        }

        updateProgressUI();
    }

    // --- QUICK ACTION HELPERS (Global Access) ---
    window.updateQuickStatusById = async function (id, newStatus) {
        const seed = seeds.find(s => s.id === id);
        if (seed) {
            if (newStatus === 'Groeit') seed.fase_groeit = true;
            if (newStatus === 'Geoogst') seed.fase_geoogst = true;
            await updateQuickStatus(seed, newStatus);
        }
    };

    window.markAsSownById = async function (id) {
        const seed = seeds.find(s => s.id === id);
        if (seed) {
            seed.fase_gezaaid = true;
            seed.status = deriveMainStatus(seed);
            seed.lastSownYear = new Date().getFullYear();
            const months = getActiveMonths(seed);
            seed.sownLate = !months.has(new Date().getMonth());
            await saveSeed(seed);
            showToast(`${seed.naam} gemarkeerd als gezaaid! 🌱`);
            seeds = await getAllSeeds(); // Refresh local list
            renderHome(); // Refresh dashboard
        }
    };

    // --- Image Upload & Photo Hub Logic ---
    const fileUpload = document.getElementById('file-upload');
    const dropzoneWide = document.getElementById('dropzone-wide');

    if (dropzoneWide) {
        dropzoneWide.onclick = () => fileUpload?.click();

        dropzoneWide.ondragover = (e) => {
            e.preventDefault();
            dropzoneWide.classList.add('dragover');
        };
        dropzoneWide.ondragleave = () => {
            dropzoneWide.classList.remove('dragover');
        };
        dropzoneWide.ondrop = (e) => {
            e.preventDefault();
            dropzoneWide.classList.remove('dragover');
            if (e.dataTransfer.files) handleFiles(e.dataTransfer.files);
        };

        window.addEventListener('paste', (e) => {
            const viewAdd = document.getElementById('view-add');
            if (!viewAdd || viewAdd.classList.contains('hidden')) return;
            const items = (e.clipboardData || e.originalEvent.clipboardData).items;
            for (let i = 0; i < items.length; i++) {
                if (items[i].type.indexOf('image') !== -1) {
                    e.preventDefault();
                    const blob = items[i].getAsFile();
                    if (blob) handleFiles([blob]);
                }
            }
        });
    }

    if (fileUpload) {
        fileUpload.onchange = (e) => handleFiles(e.target.files);
    }

    function handleFiles(files) {
        Array.from(files).forEach(file => {
            const reader = new FileReader();
            reader.onload = (re) => {
                const url = safeWishlistImageUrl(re.target.result);
                if (!url) return;
                if (!pendingImages.some(p => p.url === url)) {
                    pendingImages.push({ url: url, source: 'upload' });
                    if (!inputNaam.dataset.featuredUrl) {
                        inputNaam.dataset.featuredUrl = url;
                    }
                    renderUnifiedGallery();
                }
            };
            reader.readAsDataURL(file);
        });
    }

    // Reuse Pexels search but pipe to unified gallery
    const btnSearchPexelsUnified = document.getElementById('btn-search-pexels-unified');
    const inputSearchPexels = document.getElementById('pexels-search-input');

    if (btnSearchPexelsUnified && inputSearchPexels) {
        btnSearchPexelsUnified.addEventListener('click', async () => {
            const query = inputSearchPexels.value.trim();
            if (!query) return;
            btnSearchPexelsUnified.disabled = true;
            btnSearchPexelsUnified.textContent = "Zoeken...";
            const results = await searchPlantImage(query);
            if (results && results.length > 0) {
                photoSearchResults = results.map(r => r && typeof r === 'object' ? ({ ...r, url: r.url, source: 'web', id: r.id }) : null).filter(Boolean);
            }
            renderUnifiedGallery();
            btnSearchPexelsUnified.disabled = false;
            btnSearchPexelsUnified.textContent = "Zoek foto's 🔍";
        });
        inputSearchPexels.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') { e.preventDefault(); btnSearchPexelsUnified.click(); }
        });
    }

    // General Filters
    function applyFilters() {
        const q = searchInput.value.toLowerCase();
        let filtered = seeds;
        if (activePlantStatus) filtered = activePlantStatus === 'Actief' ? getActiveGardenPlants() : filtered.filter(s => s.status === activePlantStatus);
        const currentMonth = new Date().getMonth();

        // 1. Filter by Category
        if (activeCategory !== 'Alles') {
            if (activeCategory === 'Gezaaid') {
                filtered = filtered.filter(s => s.status === 'Gezaaid' || s.status === 'Groeit');
            } else {
                filtered = filtered.filter(s => s.type === activeCategory);
            }
        }

        // 2. Filter by Month (activeMonthFilter)
        if (activeMonthFilter !== null) {
            filtered = filtered.filter(s => getActiveMonths(s).has(activeMonthFilter));
        }

        // 3. Search query
        if (q) {
            filtered = filtered.filter(s => s.naam.toLowerCase().includes(q));
        }

        renderSeeds(filtered);
        const statusBanner = document.getElementById('seeds-context-banner');
        if (activePlantStatus && statusBanner) {
            statusBanner.replaceChildren();
            const banner = document.createElement('div'); banner.className = 'seeds-month-context';
            const label = document.createElement('span');
            label.textContent = `${activePlantStatus === 'Actief' ? 'Actieve planten (Gezaaid, Groeit, Geoogst)' : activePlantStatus} · ${filtered.length} planten`;
            const reset = document.createElement('button'); reset.type = 'button'; reset.className = 'context-reset-btn';
            reset.textContent = 'Alle planten';
            reset.addEventListener('click', () => { activePlantStatus = null; applyFilters(); });
            banner.append(label, reset); statusBanner.replaceChildren(banner);
            statusBanner.dataset.plantStatus = 'true'; statusBanner.classList.remove('hidden');
        } else if (statusBanner?.dataset.plantStatus) {
            delete statusBanner.dataset.plantStatus;
            statusBanner.replaceChildren(); statusBanner.classList.add('hidden');
        }

        // Update sown count (always on the Gezaaid chip)
        const sownCount = document.getElementById('sown-count');
        if (sownCount) {
            const count = seeds.filter(s => s.status === 'Gezaaid' || s.status === 'Groeit').length;
            sownCount.textContent = count > 0 ? `(${count})` : '';
        }
    }

    window.clearMonthFilter = function () {
        activeMonthFilter = null;
        applyFilters();
    };

    searchInput.oninput = applyFilters;

    window._resetAllFilters = () => {
        activePlantStatus = null;
        activeCategory = 'Alles';
        activeMonthFilter = null;
        localStorage.removeItem('activeMonthFilter');
        if (searchInput) searchInput.value = '';

        // Reset filter chip UI
        document.querySelectorAll('.filter-chip').forEach(c => {
            c.classList.remove('active');
            if (c.textContent.includes('Alle Zaden')) c.classList.add('active');
        });

        applyFilters();
    };

    // Sowing planner overview: all month and activity values come from saved seed/reminder data.
    let plannerSelectedMonth = new Date().getMonth();
    let plannerSelectedYear = new Date().getFullYear();
    let plannerSoonDate = null;

    function getPlannerReminders(monthIndex, year) {
        return (Array.isArray(reminders) ? reminders : []).filter(reminder => {
            const date = parseCalendarDate(reminder?.date);
            return date && date.getFullYear() === year && date.getMonth() === monthIndex;
        }).sort((a, b) => a.date.localeCompare(b.date));
    }

    function selectPlannerPeriod(year, month) {
        if (!Number.isInteger(year) || year < 1000 || year > 9999 || !Number.isInteger(month)) return;
        const date = new Date(year, month, 1);
        if (date.getFullYear() < 1000 || date.getFullYear() > 9999) return;
        if (!plannerSoonDate && plannerSelectedYear === date.getFullYear() && plannerSelectedMonth === date.getMonth()) return;
        plannerSoonDate = null;
        plannerSelectedYear = date.getFullYear();
        plannerSelectedMonth = date.getMonth();
        renderSowingGrid();
    }

    function getPlannerActivities(monthIndex, soonDate = null) {
        if (soonDate) {
            const plants = monthIndex === (soonDate.getMonth() + 1) % 12 ? getDashboardSelection(soonDate).soon : [];
            return plants.length ? [{ id: 'sow', label: 'Binnenkort zaaien', icon: 'seed', period: 'zaaitijd', plants }] : [];
        }
        const groups = [
            { id: 'indoor-sow', label: 'Binnen voorzaaien', icon: 'sprout', period: 'zaaitijd', plants: [] },
            { id: 'outdoor-sow', label: 'Buiten zaaien', icon: 'sun', period: 'zaaitijd', plants: [] },
            { id: 'sow', label: 'Zaaien', icon: 'seed', period: 'zaaitijd', plants: [] },
            { id: 'transplant', label: 'Uitplanten', icon: 'plant', period: 'plant_months', plants: [] },
            { id: 'harvest', label: 'Oogsten', icon: 'basket', period: 'oogsttijd', plants: [] }
        ];

        seeds.forEach(seed => {
            const sowMonths = getActiveMonths(seed);
            const harvestMonths = getActiveMonths(seed.oogsttijd || seed.harvest_months || seed.harvestMonths);
            const plantMonths = getActiveMonths(seed.plant_months || seed.plantMonths || seed.planttijd || seed.uitplanttijd || seed.uitplanten);
            const tags = Array.isArray(seed.tags) ? seed.tags : (typeof seed.tags === 'string' ? [seed.tags] : []);
            const hasPreseedTag = tags.some(tag => typeof tag === 'string' && tag.toLowerCase().includes('voorzaaien'));
            const hasDirectSowTag = tags.some(tag => typeof tag === 'string' && tag.toLowerCase().includes('direct zaaien'));

            if (sowMonths.has(monthIndex)) {
                if (hasPreseedTag) groups.find(group => group.id === 'indoor-sow').plants.push(seed);
                if (hasDirectSowTag) groups.find(group => group.id === 'outdoor-sow').plants.push(seed);
                if (!hasPreseedTag && !hasDirectSowTag) groups.find(group => group.id === 'sow').plants.push(seed);
            }
            if (plantMonths.has(monthIndex)) groups.find(group => group.id === 'transplant').plants.push(seed);
            if (harvestMonths.has(monthIndex)) groups.find(group => group.id === 'harvest').plants.push(seed);
        });

        return groups.filter(group => group.plants.length > 0);
    }

    async function renderSowingGrid() {
        const grid = document.getElementById('sowing-month-grid');
        const activityContent = document.getElementById('planner-activities-content');
        if (!grid || !activityContent) return;

        const currentMonth = new Date().getMonth();
        const currentYear = plannerSelectedYear;
        const isCurrentYear = currentYear === new Date().getFullYear();
        const focusId = document.activeElement?.id || '';
        const yearLabel = document.getElementById('sowing-current-year');
        if (yearLabel) yearLabel.textContent = String(currentYear);

        const createIcon = (name) => {
            const paths = {
                calendar: 'M7 3v3m10-3v3M4 9h16M5 5h14a1 1 0 0 1 1 1v13H4V6a1 1 0 0 1 1-1Zm2 8h3m2 0h3',
                sprout: 'M12 20V10m0 3c-4.5 0-7-2.2-7-6 4.8 0 7 2 7 6Zm0 1c4.3 0 7-2.3 7-6-4.6 0-7 2.2-7 6Z',
                sun: 'M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8Zm0-5v2m0 14v2M4.9 4.9l1.4 1.4m11.4 11.4 1.4 1.4M3 12h2m14 0h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4',
                seed: 'M12 20v-7m0 1c-4 0-6-2-6-5 4 0 6 1.7 6 5Zm0-2c0-3.5 2-5.5 6-5.5 0 3.5-2 5.5-6 5.5Z',
                plant: 'M5 20h14M8 20v-4m8 4v-4M12 16V7m0 4c-3.5 0-5.5-1.8-5.5-5 3.8 0 5.5 1.8 5.5 5Zm0 1c3.5 0 5.5-1.8 5.5-5-3.8 0-5.5 1.8-5.5 5Z',
                basket: 'M4 10h16l-2 10H6L4 10Zm3-1 5-5 5 5m-8 4v4m4-4v4m4-4v4'
            };
            const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
            svg.setAttribute('viewBox', '0 0 24 24');
            svg.setAttribute('aria-hidden', 'true');
            const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
            path.setAttribute('d', paths[name] || paths.calendar);
            path.setAttribute('fill', 'none');
            path.setAttribute('stroke', 'currentColor');
            path.setAttribute('stroke-width', '1.7');
            path.setAttribute('stroke-linecap', 'round');
            path.setAttribute('stroke-linejoin', 'round');
            svg.appendChild(path);
            return svg;
        };

        const reminderCountForMonth = monthIndex => getPlannerReminders(monthIndex, currentYear).length;

        grid.replaceChildren();
        for (let monthIndex = 0; monthIndex < 12; monthIndex++) {
            const monthGroups = getPlannerActivities(monthIndex, plannerSoonDate);
            const actionCount = monthGroups.reduce((total, group) => total + group.plants.length, 0);
            const reminderCount = plannerSoonDate ? 0 : reminderCountForMonth(monthIndex);
            const card = document.createElement('button');
            card.type = 'button';
            card.id = `planner-month-${monthIndex}`;
            card.className = 'month-card';
            card.setAttribute('aria-pressed', String(monthIndex === plannerSelectedMonth));
            card.setAttribute('aria-label', `${calMonthNames[monthIndex]} ${currentYear}: ${actionCount} plantactiviteiten${reminderCount ? `, ${reminderCount} kalenderitems` : ''}${monthIndex === currentMonth && isCurrentYear ? ', huidige maand' : ''}`);
            if (monthIndex === currentMonth && isCurrentYear) {
                card.classList.add('current');
                card.setAttribute('aria-current', 'date');
            }
            if (monthIndex === plannerSelectedMonth) card.classList.add('selected');
            if (actionCount > 0) card.classList.add('has-items');

            const monthTop = document.createElement('span');
            monthTop.className = 'planner-month-card-top';
            monthTop.append(createIcon('calendar'));
            if (monthIndex === currentMonth && isCurrentYear) {
                const badge = document.createElement('span');
                badge.className = 'planner-current-badge';
                badge.textContent = 'Nu';
                monthTop.appendChild(badge);
            }
            const monthName = document.createElement('span');
            monthName.className = 'month-name';
            monthName.textContent = calMonthNames[monthIndex];
            const summary = document.createElement('span');
            summary.className = 'month-count';
            summary.textContent = actionCount === 0 ? 'Geen activiteiten' : `${actionCount} ${actionCount === 1 ? 'activiteit' : 'activiteiten'}`;
            card.append(monthTop, monthName, summary);
            if (reminderCount > 0) {
                const reminderBadge = document.createElement('span');
                reminderBadge.className = 'planner-reminder-count';
                reminderBadge.textContent = `${reminderCount} kalenderitems`;
                card.appendChild(reminderBadge);
            }
            card.addEventListener('click', () => {
                plannerSoonDate = null;
                plannerSelectedMonth = monthIndex;
                renderSowingGrid();
            });
            grid.appendChild(card);
        }

        const selectedMonthTitle = document.getElementById('planner-active-month-title');
        const selectedMonthSummary = document.getElementById('planner-active-month-summary');
        const selectedMonthSelect = document.getElementById('planner-month-select');
        const activityCount = document.getElementById('planner-activity-count');
        const monthGroups = getPlannerActivities(plannerSelectedMonth, plannerSoonDate);
        const actionsForMonth = monthGroups.reduce((total, group) => total + group.plants.length, 0);
        const uniquePlants = new Set(monthGroups.flatMap(group => group.plants.map(seed => seed.id)));
        const reminderCount = plannerSoonDate ? 0 : reminderCountForMonth(plannerSelectedMonth);
        const summaryParts = [];
        if (uniquePlants.size) summaryParts.push(`${uniquePlants.size} ${uniquePlants.size === 1 ? 'plant' : 'planten'}`);
        if (actionsForMonth) summaryParts.push(`${actionsForMonth} ${actionsForMonth === 1 ? 'activiteit' : 'activiteiten'}`);
        if (reminderCount) summaryParts.push(`${reminderCount} ${reminderCount === 1 ? 'kalenderitem' : 'kalenderitems'}`);
        if (selectedMonthTitle) selectedMonthTitle.textContent = `${calMonthNames[plannerSelectedMonth]} ${currentYear}`;
        if (selectedMonthSummary) selectedMonthSummary.textContent = summaryParts.join(' · ') || 'Geen activiteiten uit je opgeslagen plantgegevens';
        if (selectedMonthSelect) selectedMonthSelect.value = String(plannerSelectedMonth);
        if (activityCount) activityCount.textContent = `${actionsForMonth} ${actionsForMonth === 1 ? 'activiteit' : 'activiteiten'}`;
        const soonFilter = document.getElementById('planner-soon-filter');
        soonFilter?.classList.toggle('hidden', !plannerSoonDate);
        const clearSoonFilter = document.getElementById('planner-clear-soon-filter');
        if (clearSoonFilter) clearSoonFilter.onclick = () => { plannerSoonDate = null; renderSowingGrid(); };

        activityContent.replaceChildren();
        if (monthGroups.length === 0) {
            const empty = document.createElement('div');
            empty.className = 'planner-empty-state';
            empty.append(createIcon('sprout'));
            const emptyText = document.createElement('p');
            emptyText.textContent = plannerSoonDate ? 'Geen voorraadplanten om binnenkort te zaaien in deze periode.' : 'Voor deze maand zijn geen zaai-, uitplant- of oogstperiodes opgeslagen bij je planten.';
            empty.appendChild(emptyText);
            activityContent.appendChild(empty);
        } else {
            monthGroups.forEach(group => {
                const groupElement = document.createElement('section');
                groupElement.className = `planner-activity-group planner-activity-${safeClassToken(group.id)}`;
                const heading = document.createElement('div');
                heading.className = 'planner-activity-group-heading';
                heading.append(createIcon(group.icon));
                const headingText = document.createElement('h4');
                headingText.textContent = group.label;
                const groupCount = document.createElement('span');
                groupCount.textContent = String(group.plants.length);
                heading.append(headingText, groupCount);
                const list = document.createElement('div');
                list.className = 'planner-plant-list';

                group.plants
                    .sort((a, b) => String(a.naam || '').localeCompare(String(b.naam || ''), 'nl'))
                    .forEach(seed => {
                        const row = document.createElement('button');
                        row.type = 'button';
                        row.className = 'planner-plant-row';
                        row.setAttribute('aria-label', `Open ${String(seed.naam || 'plant')}, ${group.label}`);
                        const name = document.createElement('span');
                        name.className = 'planner-plant-name';
                        name.textContent = typeof seed.naam === 'string' ? seed.naam : '';
                        const meta = document.createElement('span');
                        meta.className = 'planner-plant-meta';
                        const periodValue = group.period === 'plant_months'
                            ? (seed.plant_months || seed.plantMonths || seed.planttijd || seed.uitplanttijd || seed.uitplanten)
                            : (group.period === 'oogsttijd' ? (seed.oogsttijd || seed.harvest_months || seed.harvestMonths) : seed);
                        const period = document.createElement('span');
                        const periodLabel = group.period === 'plant_months' ? 'Uitplantperiode' : (group.period === 'oogsttijd' ? 'Oogstperiode' : 'Zaaitijd');
                        period.textContent = `${periodLabel}: ${formatMonthRanges(getActiveMonths(periodValue)) || calMonthNames[plannerSelectedMonth]}`;
                        const status = document.createElement('span');
                        status.className = `badge ${safeClassToken(seed.status)}`;
                        status.textContent = getStatusLabel(seed.status);
                        meta.append(period, status);
                        row.append(name, meta);
                        row.addEventListener('click', () => openDetailView(seed));
                        list.appendChild(row);
                    });

                groupElement.append(heading, list);
                activityContent.appendChild(groupElement);
            });
        }

        // Dated tasks stay in their saved month/year; recurring periods above
        // are displayed independently and never become copied reminders.
        const selectedReminders = plannerSoonDate ? [] : getPlannerReminders(plannerSelectedMonth, currentYear);
        if (selectedReminders.length) {
            const planning = document.createElement('section');
            planning.className = 'planner-activity-group planner-saved-planning';
            const heading = document.createElement('div');
            heading.className = 'planner-activity-group-heading';
            const headingText = document.createElement('h4'); headingText.textContent = 'Ingeplande kalenderitems';
            const count = document.createElement('span'); count.textContent = String(selectedReminders.length);
            heading.append(createIcon('calendar'), headingText, count);
            const list = document.createElement('div'); list.className = 'planner-plant-list';
            selectedReminders.forEach(reminder => {
                const row = document.createElement('button'); row.type = 'button'; row.className = 'planner-plant-row';
                const name = document.createElement('span'); name.className = 'planner-plant-name'; name.textContent = reminder.title;
                const meta = document.createElement('span'); meta.className = 'planner-plant-meta';
                const date = document.createElement('span');
                date.textContent = parseCalendarDate(reminder.date).toLocaleDateString('nl-NL', { day: 'numeric', month: 'long', year: 'numeric' });
                meta.append(date);
                if (reminder.done) {
                    const done = document.createElement('span'); done.className = 'badge'; done.textContent = 'Afgerond'; meta.append(done);
                }
                row.append(name, meta);
                row.addEventListener('click', () => {
                    selectedDateStr = reminder.date;
                    curCalDate = new Date(currentYear, plannerSelectedMonth, 1);
                    switchView('calendar');
                });
                list.append(row);
            });
            planning.append(heading, list); activityContent.append(planning);
        }

        const previousButton = document.getElementById('planner-prev-month');
        const nextButton = document.getElementById('planner-next-month');
        const thisMonthButton = document.getElementById('planner-this-month');
        const openCalendarButton = document.getElementById('planner-open-calendar');
        const openSeedsButton = document.getElementById('planner-open-seeds');
        if (previousButton) previousButton.onclick = () => selectPlannerPeriod(currentYear, plannerSelectedMonth - 1);
        if (nextButton) nextButton.onclick = () => selectPlannerPeriod(currentYear, plannerSelectedMonth + 1);
        if (thisMonthButton) thisMonthButton.onclick = () => {
            const today = new Date();
            selectPlannerPeriod(today.getFullYear(), today.getMonth());
        };
        if (selectedMonthSelect) selectedMonthSelect.onchange = () => {
            selectPlannerPeriod(currentYear, Number(selectedMonthSelect.value));
        };
        const yearInput = document.getElementById('planner-year-input');
        if (yearInput) {
            yearInput.value = String(currentYear);
            yearInput.onchange = () => {
                if (yearInput.checkValidity() && Number.isInteger(Number(yearInput.value))) selectPlannerPeriod(Number(yearInput.value), plannerSelectedMonth);
                else yearInput.value = String(currentYear);
            };
            yearInput.onkeydown = event => { if (event.key === 'Enter') { event.preventDefault(); yearInput.onchange(); } };
        }
        const previousYear = document.getElementById('planner-prev-year');
        const nextYear = document.getElementById('planner-next-year');
        if (previousYear) { previousYear.disabled = currentYear === 1000; previousYear.onclick = () => selectPlannerPeriod(currentYear - 1, plannerSelectedMonth); }
        if (nextYear) { nextYear.disabled = currentYear === 9999; nextYear.onclick = () => selectPlannerPeriod(currentYear + 1, plannerSelectedMonth); }
        if (previousButton) previousButton.disabled = currentYear === 1000 && plannerSelectedMonth === 0;
        if (nextButton) nextButton.disabled = currentYear === 9999 && plannerSelectedMonth === 11;
        if (openCalendarButton) openCalendarButton.onclick = () => {
            calendarTaskWeek = false; selectedDateStr = null;
            curCalDate = new Date(currentYear, plannerSelectedMonth, 1);
            switchView('calendar');
            renderCalendar();
        };
        if (openSeedsButton) openSeedsButton.onclick = () => {
            localStorage.setItem('activeMonthFilter', calMonthNames[plannerSelectedMonth]);
            switchView('list');
        };

        if (focusId.startsWith('planner-')) document.getElementById(focusId)?.focus();
    }

    const plannerSeasonalAdvice = [
        { title: "Januari - Winterrust en planning", sub: "Maak je tuinplan en bestel je zaden voor het nieuwe jaar", focus: "Plannen en zaden inventariseren", alert: "Bescherm kranen en planten tegen strenge vorst", tip: "Maak een schets van je wisselteelt", icon: "❄️" },
        { title: "Februari - De eerste kriebels", sub: "De eerste zaden kunnen binnen onder glas worden gezaaid", focus: "Voorbereiden van kweekbakken", alert: "Pas op voor te natte grond in de moestuin", tip: "Begin met pepers en paprika's (lange kiem)", icon: "🌱" },
        { title: "Maart - De lente ontwaakt", sub: "Veel zaden kunnen nu direct de volle grond in", focus: "Bodem verbeteren met compost", alert: "Houd rekening met plotselinge nachtvorst", tip: "Zaai doperwten en peultjes direct buiten", icon: "🌸" },
        { title: "April - Drukke zaaimaand", sub: "Tijd voor voorzaaien, afharden en de eerste snelle groeiers", focus: "Voorzaaien van zomergroenten", alert: "Slakken worden nu ook weer actief", tip: "Denk aan klimrekken voor je komkommers", icon: "☀️" },
        { title: "Mei - Na de IJsheiligen", sub: "Alles mag nu eindelijk veilig naar buiten", focus: "Planten uitplanten in de volle grond", alert: "Zorg voor voldoende water bij droge dagen", tip: "Zet tomaten en courgettes op hun plek", icon: "🏡" },
        { title: "Juni - Groei en bloei", sub: "Houd de tuin bij en geniet van de eerste oogst", focus: "Watergeven en onkruid wieden", alert: "Valse meeldauw bij aardappelen", tip: "Mulch de bodem om vocht vast te houden", icon: "🌿" },
        { title: "Juli - Oogsttijd", sub: "Blijf oogsten voor meer groei", focus: "Oogsten en bewaren van groenten", alert: "Tomatenplanten kunnen last krijgen van neusrot", tip: "Zaai nu herfstspinazie en boerenkool", icon: "🥗" },
        { title: "Augustus - Nazomeren", sub: "Geniet van de overvloed en win je eigen zaden", focus: "Zaden oogsten voor volgend jaar", alert: "Witte vlieg houdt van warm weer", tip: "Verwijder overtollig blad bij tomaten", icon: "☀️" },
        { title: "September - Herfst voorbereiden", sub: "Tijd om de tuin klaar te maken voor najaar", focus: "Laatste zomeroogst binnenhalen", alert: "Schimmelgroei door hoge vochtigheid", tip: "Plant nu knoflook voor volgend jaar", icon: "🍂" },
        { title: "Oktober - De tuin vertraagt", sub: "Ruim op waar nodig, maar laat ook wat natuur liggen", focus: "Opruimen en composteren", alert: "Eerste nachtvorst kan bloeiers raken", tip: "Plant nu je voorjaarsbollen", icon: "🍄" },
        { title: "November - Grondbewerking", sub: "Bedek de bodem en maak je gereedschap schoon", focus: "Winterklaar maken van de borders", alert: "Buitenkranen afsluiten tegen vorst", tip: "Laat uitgebloeide stengels staan", icon: "🌧️" },
        { title: "December - Winterrust", sub: "Reflecteer op het jaar en plan alvast vooruit", focus: "Gereedschap onderhoud en olie", alert: "Sneeuwdruk op structuren", tip: "Vergeet de vogels niet bij te voeren", icon: "❄️" }
    ];

    function openPlannerMonthModal(mIndex, year = plannerSelectedYear) {
        const modal = document.getElementById('planner-month-modal');
        const title = document.getElementById('planner-month-title');
        const subtitle = document.getElementById('planner-month-subtitle');
        const icon = document.getElementById('planner-month-header-icon');
        const focusText = document.getElementById('planner-focus-text');
        const alertText = document.getElementById('planner-alert-text');
        const tipText = document.getElementById('planner-tip-text');
        const list = document.getElementById('planner-seeds-list');
        const count = document.getElementById('planner-seeds-count');
        const focusIcon = document.getElementById('planner-focus-icon');

        if (!modal) return;

        const advice = plannerSeasonalAdvice[mIndex];
        title.textContent = `${advice.title} · ${year}`;
        subtitle.textContent = advice.sub;
        icon.textContent = advice.icon;
        focusText.textContent = advice.focus;
        alertText.textContent = advice.alert;
        tipText.textContent = advice.tip;
        focusIcon.textContent = advice.icon;

        const plants = seeds.filter(s => getActiveMonths(s).has(mIndex));
        count.textContent = `${plants.length} planten`;

        list.replaceChildren();
        if (plants.length === 0) {
            const empty = document.createElement('p');
            empty.style.cssText = 'text-align:center; padding:20px; color:#999; font-size:13px;';
            empty.textContent = 'Geen zaaiplannen voor deze maand.';
            list.appendChild(empty);
        } else {
            plants.sort((a, b) => a.naam.localeCompare(b.naam)).forEach(plant => {
                const item = document.createElement('div');
                item.className = 'planner-seed-item';
                const info = document.createElement('div');
                info.className = 'planner-seed-info';
                const name = document.createElement('div');
                name.className = 'planner-seed-name';
                name.textContent = typeof plant.naam === 'string' ? plant.naam : '';
                const badges = document.createElement('div');
                badges.style.cssText = 'display:flex; gap:4px; margin-top:2px;';
                const typeBadge = document.createElement('span');
                typeBadge.className = `badge ${safeClassToken(plant.type)}`;
                typeBadge.style.cssText = 'font-size:9px; padding:1px 6px; font-weight:700;';
                typeBadge.textContent = typeof plant.type === 'string' ? plant.type : '';
                const statusBadge = document.createElement('span');
                statusBadge.className = `badge ${safeClassToken(plant.status)}`;
                statusBadge.style.cssText = 'font-size:9px; padding:1px 6px; opacity:0.8;';
                statusBadge.textContent = getStatusLabel(plant.status);
                badges.append(typeBadge, statusBadge);
                info.append(name, badges);
                item.appendChild(info);
                item.addEventListener('click', () => { closePlannerModal(); openDetailView(plant); });
                list.appendChild(item);
            });
        }

        modal.classList.remove('hidden');

        const footer = modal.querySelector('.planner-modal-footer');
        if (footer) {
            footer.replaceChildren();
            const ctaCalendar = document.createElement('button');
            ctaCalendar.type = 'button';
            ctaCalendar.className = 'planner-btn-primary btn-goto-calendar';
            ctaCalendar.textContent = 'Bekijk Kalender \u{1F5D3}\uFE0F';
            ctaCalendar.addEventListener('click', () => {
                selectedDateStr = null;
                curCalDate = new Date(year, mIndex, 1);
                closePlannerModal();
                switchView('calendar');
                renderCalendar();
            });
            footer.appendChild(ctaCalendar);

            const ctaSeeds = document.createElement('button');
            ctaSeeds.type = 'button';
            ctaSeeds.className = 'planner-btn-secondary';
            ctaSeeds.textContent = 'Bekijk Zaden \u{1F4E6}';
            ctaSeeds.addEventListener('click', () => {
                localStorage.setItem('activeMonthFilter', calMonthNames[mIndex]);
                closePlannerModal();
                switchView('list');
            });
            footer.appendChild(ctaSeeds);
        }
    }

    const closePlannerModal = () => {
        document.getElementById('planner-month-modal')?.classList.add('hidden');
    };
    window.closePlannerModal = closePlannerModal;

    window.viewAllSeedsFromPlanner = () => {
        closePlannerModal();
        switchView('list');
    };


    // Form logic simple
    seedForm.onsubmit = async (e) => {
        e.preventDefault();
        await saveCurrentForm();
        switchView('list');
    };

    // Initial load
    // FAQ Toggle
    window.toggleFAQ = function(element) {
        element.classList.toggle('open');
    };

    // Info Modal Logic

    // Data Bridge Functions
    window.closeInfoModal = function() {
        document.getElementById('info-modal')?.classList.add('hidden');
    };

    // --- IMPORT / EXPORT SAFETY ---
    const BACKUP_VERSION = 1;
    const ACTIVE_REMINDERS_STORAGE_KEY = 'moestuin_reminders';
    const LEGACY_CALENDAR_STORAGE_KEY = 'moestuin_calendar';
    const BACKUP_DATASET_KEYS = [
        'seeds', 'calendar', 'wishlist', 'settings', 'userProfile',
        'reminders', 'dailyProgress', 'theme', 'onboardingDone', 'uiState'
    ];
    const BACKUP_STORAGE_KEYS = [
        LEGACY_CALENDAR_STORAGE_KEY, 'moestuin_wishlist', 'moestuin_settings',
        'userProfile', 'moestuin_user_profile', ACTIVE_REMINDERS_STORAGE_KEY,
        'daily_progress', 'theme', 'onboarding_done'
    ];
    const BACKUP_UI_STATE_KEYS = [
        'expanded_extra-section', 'activeMonthFilter', 'layout_width',
        'onboarding_sun', 'onboarding_type', 'onboarding_level'
    ];
    const BACKUP_DATASET_LABELS = {
        seeds: 'zaden',
        calendar: 'kalender',
        wishlist: 'wishlist',
        settings: 'instellingen',
        userProfile: 'profiel',
        reminders: 'herinneringen',
        dailyProgress: 'dagelijkse voortgang',
        theme: 'thema',
        onboardingDone: 'onboarding',
        uiState: 'interface-instellingen'
    };

    function isBackupObject(value) {
        return value !== null && typeof value === 'object' && !Array.isArray(value);
    }

    function cloneBackupData(value) {
        return JSON.parse(JSON.stringify(value));
    }

    function backupValidationError(message = 'Ongeldige backup') {
        const error = new Error(message);
        error.name = 'BackupValidationError';
        return error;
    }

    function hasBackupKey(value, key) {
        return Object.prototype.hasOwnProperty.call(value, key);
    }

    function isValidBackupId(value) {
        if (typeof value === 'number') return Number.isFinite(value);
        return typeof value === 'string' && value.trim() !== '';
    }

    const BACKUP_SEED_TYPES = new Set([
        'Groente', 'Fruit', 'Kruid', 'Bloem', 'Bloembol', 'Boom', 'Struik', 'Sierplant', 'Overig'
    ]);
    const BACKUP_SEED_STANDPLAATSEN = new Set(['Zon', 'Halfschaduw', 'Schaduw', 'Kas', 'Binnen', 'Onbekend']);
    const BACKUP_SEED_WATERBEHOEFTES = new Set(['Laag', 'Gemiddeld', 'Hoog', 'Weinig', 'Veel', 'Onbekend']);
    const BACKUP_SEED_STATUSES = new Set(['Voorraad', 'Gezaaid', 'Groeit', 'Geoogst', 'Wishlist']);

    function seedValidationError(index, field) {
        return backupValidationError(`Ongeldige backup: zaad ${index + 1} heeft een ongeldig of ontbrekend veld "${field}".`);
    }

    function isValidMonthField(value) {
        return typeof value === 'string' ||
            (Array.isArray(value) && value.every(item =>
                (typeof item === 'string') || (typeof item === 'number' && Number.isFinite(item))));
    }

    function normalizeBackupSeed(seed, index) {
        if (!isBackupObject(seed)) throw seedValidationError(index, 'record');
        if (!isValidBackupId(seed.id)) throw seedValidationError(index, 'id');
        if (typeof seed.naam !== 'string' || seed.naam.trim() === '') throw seedValidationError(index, 'naam');
        if (!BACKUP_SEED_TYPES.has(seed.type)) throw seedValidationError(index, 'type');
        if (!BACKUP_SEED_STATUSES.has(seed.status)) throw seedValidationError(index, 'status');

        const normalized = cloneBackupData(seed);
        if (!hasBackupKey(seed, 'standplaats')) {
            normalized.standplaats = 'Zon';
        } else {
            const standplaats = normalizeStandplaatsValue(seed.standplaats);
            if (typeof seed.standplaats !== 'string' || !BACKUP_SEED_STANDPLAATSEN.has(standplaats)) {
                throw seedValidationError(index, 'standplaats');
            }
            normalized.standplaats = standplaats;
        }
        const optionalStrings = [
            ['water', 'Gemiddeld', BACKUP_SEED_WATERBEHOEFTES],
            ['code', '', null],
            ['beschrijving', '', null],
            ['ervaringen', '', null],
            ['featuredImageUrl', '', null],
            ['image', '', null],
            ['shopLink', '', null]
        ];
        for (const [field, fallback, allowedValues] of optionalStrings) {
            if (!hasBackupKey(seed, field)) normalized[field] = fallback;
            else if (typeof seed[field] !== 'string' || (allowedValues && !allowedValues.has(seed[field]))) {
                throw seedValidationError(index, field);
            }
        }

        for (const field of ['zaaitijd', 'oogsttijd']) {
            if (!hasBackupKey(seed, field)) normalized[field] = '';
            else if (!isValidMonthField(seed[field])) throw seedValidationError(index, field);
        }

        if (!hasBackupKey(seed, 'tags')) normalized.tags = [];
        else if (!Array.isArray(seed.tags) || !seed.tags.every(tag => typeof tag === 'string')) {
            throw seedValidationError(index, 'tags');
        }

        if (!hasBackupKey(seed, 'images')) normalized.images = [];
        else if (!Array.isArray(seed.images) || !seed.images.every(image =>
            isBackupObject(image) && typeof image.url === 'string' && image.url.trim() !== '')) {
            throw seedValidationError(index, 'images');
        }

        for (const field of ['isFavorite', 'fase_gezaaid', 'fase_groeit', 'fase_geoogst']) {
            if (!hasBackupKey(seed, field)) normalized[field] = false;
            else if (typeof seed[field] !== 'boolean') throw seedValidationError(index, field);
        }

        if (!hasBackupKey(seed, 'ervaringScore')) normalized.ervaringScore = 0;
        else if (typeof seed.ervaringScore !== 'number' || !Number.isFinite(seed.ervaringScore) ||
            seed.ervaringScore < 0 || seed.ervaringScore > 5) throw seedValidationError(index, 'ervaringScore');

        for (const field of ['purchaseYear', 'lastSownYear']) {
            if (!hasBackupKey(seed, field)) normalized[field] = null;
            else if (seed[field] !== null && (typeof seed[field] !== 'number' || !Number.isFinite(seed[field]))) {
                throw seedValidationError(index, field);
            }
        }

        return normalized;
    }

    function normalizeBackupSeeds(value) {
        if (!Array.isArray(value)) throw backupValidationError();

        const ids = new Set();
        return value.map((seed, index) => {
            const normalizedSeed = normalizeBackupSeed(seed, index);
            const idKey = String(normalizedSeed.id);
            if (ids.has(idKey)) throw seedValidationError(index, 'id (dubbel)');
            ids.add(idKey);
            return normalizedSeed;
        });
    }

    function normalizeBackupArray(value, itemValidator) {
        if (!Array.isArray(value)) throw backupValidationError();
        return value.map(item => {
            if (!isBackupObject(item) || !itemValidator(item)) throw backupValidationError();
            return cloneBackupData(item);
        });
    }

    function reminderValidationError(index, field = 'record') {
        return backupValidationError(`Ongeldige backup: herinnering ${index + 1} heeft een ongeldig of ontbrekend veld "${field}".`);
    }

    function normalizeBackupReminders(value) {
        if (!Array.isArray(value)) throw backupValidationError();

        return value.map((reminder, index) => {
            if (!isBackupObject(reminder)) throw reminderValidationError(index);
            if (typeof reminder.title !== 'string' || reminder.title.trim() === '') {
                throw reminderValidationError(index, 'title');
            }
            if (typeof reminder.date !== 'string' || reminder.date.trim() === '') {
                throw reminderValidationError(index, 'date');
            }
            if (hasBackupKey(reminder, 'id') && !isValidBackupId(reminder.id)) {
                throw reminderValidationError(index, 'id');
            }
            if (hasBackupKey(reminder, 'done') && typeof reminder.done !== 'boolean') {
                throw reminderValidationError(index, 'done');
            }

            // Keep optional notes and unknown future fields intact.
            return cloneBackupData(reminder);
        });
    }

    function isBackupUIStateKey(key) {
        return BACKUP_UI_STATE_KEYS.includes(key) ||
            key.startsWith('dashboard_nu_doen_expanded_') ||
            key.startsWith('garden_group_');
    }

    function normalizeBackupUIState(value) {
        if (!isBackupObject(value)) throw backupValidationError();

        const normalized = {};
        for (const [key, item] of Object.entries(value)) {
            if (!isBackupUIStateKey(key)) continue;
            if (typeof item !== 'string' && typeof item !== 'number' && typeof item !== 'boolean') {
                throw backupValidationError();
            }
            normalized[key] = String(item);
        }
        return normalized;
    }

    function normalizeImportedBackup(input) {
        // Older exports could be a plain seed array; keep that format readable.
        if (Array.isArray(input) && input.length === 0) throw backupValidationError();
        const root = Array.isArray(input) ? { seeds: input } : input;
        if (!isBackupObject(root)) throw backupValidationError();

        const version = hasBackupKey(root, 'backupVersion') ? root.backupVersion : BACKUP_VERSION;
        if (typeof version !== 'number' || !Number.isInteger(version) || version < 1) {
            throw backupValidationError();
        }
        if (version > BACKUP_VERSION) {
            throw backupValidationError(`Deze backup is nieuwer dan deze app ondersteunt (versie ${version}).`);
        }
        if (version !== BACKUP_VERSION) throw backupValidationError();

        const hasLegacyCalendarDataset = hasBackupKey(root, LEGACY_CALENDAR_STORAGE_KEY);
        const hasDataset = BACKUP_DATASET_KEYS.some(key => hasBackupKey(root, key)) || hasLegacyCalendarDataset;
        if (!hasDataset) throw backupValidationError();

        const normalized = {
            backupVersion: BACKUP_VERSION,
            seeds: [],
            calendar: {},
            wishlist: [],
            settings: {},
            userProfile: {},
            reminders: [],
            dailyProgress: {},
            theme: 'light',
            onboardingDone: 'false',
            uiState: {},
            providedDatasets: []
        };

        if (hasBackupKey(root, 'seeds')) {
            normalized.seeds = normalizeBackupSeeds(root.seeds);
            normalized.providedDatasets.push('seeds');
        }
        if (hasBackupKey(root, 'calendar') || hasLegacyCalendarDataset) {
            const calendarData = hasBackupKey(root, 'calendar')
                ? root.calendar
                : root[LEGACY_CALENDAR_STORAGE_KEY];
            if (!isBackupObject(calendarData)) throw backupValidationError();
            normalized.calendar = cloneBackupData(calendarData);
            normalized.providedDatasets.push('calendar');
        }
        if (hasBackupKey(root, 'wishlist')) {
            normalized.wishlist = normalizeBackupArray(root.wishlist, item => typeof item.name === 'string' && item.name.trim() !== '');
            normalized.providedDatasets.push('wishlist');
        }
        if (hasBackupKey(root, 'settings')) {
            if (!isBackupObject(root.settings)) throw backupValidationError();
            normalized.settings = cloneBackupData(root.settings);
            normalized.providedDatasets.push('settings');
        }
        if (hasBackupKey(root, 'userProfile')) {
            if (!isBackupObject(root.userProfile)) throw backupValidationError();
            const importedProfile = normalizeUserProfile(root.userProfile) || { ...DEFAULT_USER_PROFILE };
            normalized.userProfile = cloneBackupData(importedProfile);
            normalized.providedDatasets.push('userProfile');
        }
        if (hasBackupKey(root, 'reminders')) {
            normalized.reminders = normalizeBackupReminders(root.reminders);
            normalized.providedDatasets.push('reminders');
        }
        if (hasBackupKey(root, 'dailyProgress')) {
            if (!isBackupObject(root.dailyProgress)) throw backupValidationError();
            normalized.dailyProgress = cloneBackupData(root.dailyProgress);
            normalized.providedDatasets.push('dailyProgress');
        }
        if (hasBackupKey(root, 'theme')) {
            if (typeof root.theme !== 'string') throw backupValidationError();
            normalized.theme = typeof normalizeAppTheme === 'function'
                ? normalizeAppTheme(root.theme)
                : (root.theme === 'dark' || root.theme === 'playful' ? root.theme : 'light');
            normalized.providedDatasets.push('theme');
        }
        if (hasBackupKey(root, 'onboardingDone')) {
            if (typeof root.onboardingDone !== 'string') throw backupValidationError();
            normalized.onboardingDone = root.onboardingDone;
            normalized.providedDatasets.push('onboardingDone');
        }
        if (hasBackupKey(root, 'uiState')) {
            normalized.uiState = normalizeBackupUIState(root.uiState);
            normalized.providedDatasets.push('uiState');
        }

        return normalized;
    }

    function parseAndNormalizeBackup(rawText) {
        let parsed;
        try {
            parsed = JSON.parse(rawText);
        } catch (error) {
            throw backupValidationError();
        }
        return normalizeImportedBackup(parsed);
    }

    function buildBackupPayload(seedData) {
        return {
            backupVersion: BACKUP_VERSION,
            seeds: cloneBackupData(seedData),
            calendar: readStoredJSON(LEGACY_CALENDAR_STORAGE_KEY, {}, normalizeStoredObject),
            wishlist: readStoredJSON('moestuin_wishlist', [], normalizeStoredArray),
            settings: readStoredJSON('moestuin_settings', {}, normalizeStoredObject),
            userProfile: cloneBackupData(loadUserProfile()),
            reminders: readStoredJSON(ACTIVE_REMINDERS_STORAGE_KEY, [], normalizeReminders),
            dailyProgress: readStoredJSON('daily_progress', {}, normalizeStoredObject),
            theme: typeof getStoredAppTheme === 'function'
                ? getStoredAppTheme()
                : (localStorage.getItem('theme') === 'dark' || localStorage.getItem('theme') === 'playful'
                    ? localStorage.getItem('theme')
                    : 'light'),
            onboardingDone: localStorage.getItem('onboarding_done') || 'false',
            uiState: {}
        };
    }

    function isRestoredUIStateKey(key) {
        return isBackupUIStateKey(key);
    }

    function isRestoredStorageKey(key) {
        return BACKUP_STORAGE_KEYS.includes(key) || isRestoredUIStateKey(key);
    }

    function hasProvidedDataset(backup, dataset) {
        return Array.isArray(backup.providedDatasets) && backup.providedDatasets.includes(dataset);
    }

    function getProvidedDatasetLabels(backup) {
        return backup.providedDatasets
            .map(dataset => BACKUP_DATASET_LABELS[dataset] || dataset)
            .join(', ');
    }

    function confirmBackupRestore(backup, confirmFn) {
        const ask = confirmFn || window.confirm;
        return ask(`Deze backup vervangt: ${getProvidedDatasetLabels(backup)}. Doorgaan?`);
    }

    function captureLocalStorageSnapshot() {
        const snapshot = {};
        for (let i = 0; i < localStorage.length; i++) {
            const key = localStorage.key(i);
            if (key !== null) snapshot[key] = localStorage.getItem(key);
        }
        return snapshot;
    }

    function restoreLocalStorageSnapshot(snapshot) {
        const currentKeys = [];
        for (let i = 0; i < localStorage.length; i++) {
            const key = localStorage.key(i);
            if (key !== null) currentKeys.push(key);
        }
        for (const key of currentKeys) {
            if (!Object.prototype.hasOwnProperty.call(snapshot, key)) localStorage.removeItem(key);
        }
        for (const [key, value] of Object.entries(snapshot)) localStorage.setItem(key, value);
    }

    function buildRestoreStorageWrites(backup) {
        const writes = [];
        if (hasProvidedDataset(backup, 'calendar')) writes.push([LEGACY_CALENDAR_STORAGE_KEY, JSON.stringify(backup.calendar)]);
        if (hasProvidedDataset(backup, 'wishlist')) writes.push(['moestuin_wishlist', JSON.stringify(backup.wishlist)]);
        if (hasProvidedDataset(backup, 'settings')) writes.push(['moestuin_settings', JSON.stringify(backup.settings)]);
        if (hasProvidedDataset(backup, 'userProfile')) {
            const profile = normalizeUserProfile(backup.userProfile) || { ...DEFAULT_USER_PROFILE };
            writes.push([CANONICAL_PROFILE_STORAGE_KEY, JSON.stringify(profile)]);
            writes.push([LEGACY_PROFILE_STORAGE_KEY, JSON.stringify(buildLegacyProfileMirror(profile))]);
            if (hasMeaningfulProfileValue(profile.gardenType)) writes.push(['onboarding_type', profile.gardenType]);
            if (hasMeaningfulProfileValue(profile.light)) writes.push(['onboarding_sun', profile.light]);
            if (hasMeaningfulProfileValue(profile.experience)) writes.push(['onboarding_level', profile.experience]);
        }
        if (hasProvidedDataset(backup, 'reminders')) writes.push([ACTIVE_REMINDERS_STORAGE_KEY, JSON.stringify(backup.reminders)]);
        if (hasProvidedDataset(backup, 'dailyProgress')) writes.push(['daily_progress', JSON.stringify(backup.dailyProgress)]);
        if (hasProvidedDataset(backup, 'theme')) writes.push(['theme', backup.theme]);
        if (hasProvidedDataset(backup, 'onboardingDone')) writes.push(['onboarding_done', backup.onboardingDone]);
        if (hasProvidedDataset(backup, 'uiState')) writes.push(...Object.entries(backup.uiState));
        return writes;
    }

    function applyRestoreToLocalStorage(backup) {
        const storageKeysToReplace = new Set(buildRestoreStorageWrites(backup).map(([key]) => key));
        const currentKeys = [];
        for (let i = 0; i < localStorage.length; i++) {
            const key = localStorage.key(i);
            if (key !== null && (storageKeysToReplace.has(key) ||
                (hasProvidedDataset(backup, 'uiState') && isRestoredUIStateKey(key)))) {
                currentKeys.push(key);
            }
        }
        for (const key of currentKeys) localStorage.removeItem(key);
        for (const [key, value] of buildRestoreStorageWrites(backup)) localStorage.setItem(key, String(value));
    }

    async function captureRestoreSafetyBackup(backup) {
        return {
            seeds: hasProvidedDataset(backup, 'seeds') ? cloneBackupData(await getAllSeeds()) : null,
            storage: captureLocalStorageSnapshot()
        };
    }

    async function restoreBackupData(backup) {
        const safetyBackup = await captureRestoreSafetyBackup(backup);
        let seedsReplaced = false;
        try {
            applyRestoreToLocalStorage(backup);
            if (hasProvidedDataset(backup, 'seeds')) {
                await replaceAllSeedsAtomic(backup.seeds);
                seeds = cloneBackupData(backup.seeds);
                seedsReplaced = true;
            }
        } catch (error) {
            try {
                restoreLocalStorageSnapshot(safetyBackup.storage);
                if (seedsReplaced || safetyBackup.seeds) {
                    await replaceAllSeedsAtomic(safetyBackup.seeds);
                    seeds = cloneBackupData(safetyBackup.seeds);
                }
            } catch (rollbackError) {
                console.warn('[KweekKompas] Veilig terugzetten van de vorige backup is mislukt.');
            }
            throw error;
        }
    }

    window.KweekLocalData = {
        capture: async () => {
            const payload = buildBackupPayload(await getAllSeeds());
            for (let i = 0; i < localStorage.length; i++) {
                const key = localStorage.key(i);
                if (key && isBackupUIStateKey(key)) payload.uiState[key] = localStorage.getItem(key);
            }
            return payload;
        },
        restore: async payload => {
            const normalized = normalizeImportedBackup(payload);
            await restoreBackupData(normalized);
        }
    };

    // --- DATA MANAGEMENT LOGIC ---
    let exampleGardenLoading = false;
    window.loadExampleGarden = async function(button) {
        if (exampleGardenLoading) return;
        exampleGardenLoading = true;
        if (button) button.disabled = true;
        const status = message => {
            const element = document.getElementById('example-garden-status');
            if (element) element.textContent = message;
        };
        try {
            status('Voorbeeldtuin laden…');
            const response = await fetch('assets/example-garden/voorbeeldtuin.json');
            if (!response.ok) throw new Error('Voorbeeldtuin kan nu niet worden geladen. Probeer later opnieuw.');
            // Reuse the complete backup validation, but import plants only.
            const input = await response.json();
            const examples = normalizeImportedBackup({ backupVersion: input.backupVersion, seeds: input.seeds }).seeds;
            if (!confirm(`${examples.length} voorbeeldplanten aan je tuin toevoegen? Je eigen planten blijven bewaard. Planten die er al staan worden overgeslagen.`)) {
                status('Voorbeeldtuin laden geannuleerd.');
                return;
            }
            const added = await addExampleSeedsAtomic(examples);
            seeds = await getAllSeeds();
            renderHome();
            status(`${added} voorbeeldplanten toegevoegd.${added === 0 ? ' Deze planten staan al in je tuin.' : ''}`);
        } catch (error) {
            status(error?.name === 'BackupValidationError' ? 'Het voorbeeldbestand is niet geldig. Er is niets toegevoegd.' : error.message || 'Voorbeeldtuin laden is mislukt.');
        } finally {
            exampleGardenLoading = false;
            if (button?.isConnected) button.disabled = false;
        }
    };

    window.exportData = async function() {
        try {
            const data = await getAllSeeds();
            const fullBackup = buildBackupPayload(data);

            // Collect dynamic UI states and preferences
            for (let i = 0; i < localStorage.length; i++) {
                const key = localStorage.key(i);
                if (key.startsWith('dashboard_nu_doen_expanded_') ||
                    key.startsWith('garden_group_') ||
                    [
                        'expanded_extra-section',
                        'activeMonthFilter',
                        'layout_width',
                        'onboarding_sun',
                        'onboarding_type',
                        'onboarding_level'
                    ].includes(key)) {
                    fullBackup.uiState[key] = localStorage.getItem(key);
                }
            }

            const blob = new Blob([JSON.stringify(fullBackup, null, 2)], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `moestuin-backup-${new Date().toISOString().split('T')[0]}.json`;
            a.click();
            URL.revokeObjectURL(url);
            showToast("Backup gedownload! 📥");
        } catch (err) {
            console.error(err);
            showToast("Export mislukt ❌");
        }
    };

    window.importData = function() {
        const input = document.getElementById('import-file');
        if (input) {
            input.click();
        }
    };
    // Beide zichtbare acties valideren eerst alle aangeleverde datasets en
    // vervangen daarna alleen die datasets.
    window.restoreBackup = window.importData;


    window.resetApp = async function() {
        if (confirm("WEET JE HET ZEKER? Dit verwijdert alle zaden en instellingen. Dit kan niet ongedaan worden.")) {
            try { await window.KweekServices?.removeSafetyBackup(); }
            catch (error) { showToast(error.message); return; }
            localStorage.clear();
            if (db) { db.close(); db = null; }
            const request = indexedDB.deleteDatabase("MoestuinDB");
            request.onsuccess = () => {
                showToast("App gereset. Herstarten...");
                setTimeout(() => location.reload(), 1500);
            };
            request.onblocked = () => showToast('Sluit andere KweekKompas-tabbladen om de lokale database te wissen.');
            request.onerror = () => showToast('Wissen van de lokale database is mislukt.');
        }
    };

    const inputImportRelocated = document.getElementById('import-file');
    if (inputImportRelocated) {
        inputImportRelocated.onchange = (e) => {
            const file = e.target.files[0];
            if (!file) return;
            const r = new FileReader();
            r.onload = async (evt) => {
                try {
                    const normalizedBackup = parseAndNormalizeBackup(evt.target.result);
                    if (!confirmBackupRestore(normalizedBackup)) {
                        showToast('Herstellen geannuleerd.');
                        inputImportRelocated.value = '';
                        return;
                    }
                    await restoreBackupData(normalizedBackup);

                    showToast(`${normalizedBackup.seeds.length} zaden en alle instellingen hersteld!`);
                    setTimeout(() => location.reload(), 1500);
                    inputImportRelocated.value = '';
                    return;

                    /* Legacy restore code is intentionally unreachable after validation.


                    showToast(`${count} zaden en alle instellingen hersteld! 🌿`);

                    setTimeout(() => location.reload(), 1500);
                    */
                } catch (err) {
                    if (err?.name === 'BackupValidationError') {
                        showToast(`${err.message || 'Ongeldige backup'} Er is niets gewijzigd.`);
                    } else {
                        showToast('Herstellen mislukt. Er is niets gewijzigd.');
                    }
                    console.warn('[KweekKompas] Backup kon niet worden hersteld.');
                }
                inputImportRelocated.value = '';
            };
            r.readAsText(file);
        };
    }

    // --- WISHLIST LOGIC (Redesigned) ---

    let wishlist = readStoredJSON('moestuin_wishlist', [], normalizeWishlist);
    let editingWishId = null;
    let activeWishFilter = 'all';
    let activeWishSearch = '';

    const bekendeZaden = [
        'tomaat', 'sla', 'courgette', 'pompoen', 'wortel', 'boon', 'erwt', 'radijs',
        'paprika', 'peper', 'spinazie', 'kool', 'ui', 'knoflook', 'prei', 'biet',
        'aardappel', 'aardbei', 'framboos', 'bes', 'munt', 'rozemarijn', 'tijm',
        'peterselie', 'basilicum', 'komkommer', 'augurk', 'melano', 'aubergine',
        'bloemkool', 'broccoli', 'spruitjes', 'boerenkool', 'rode kool', 'witte kool',
        'savooiekool', 'andijvie', 'rucola', 'veldsla', 'raapsteel', 'postelein',
        'venkel', 'selderij', 'pastinaak', 'schorseneer', 'rammenas', 'koolrabi',
        'tuinboon', 'peul', 'kapucijner', 'snijboon', 'sperzieboon', 'pronkboon',
        'mais', 'zonnebloem', 'goudsbloem', 'oost-indische kers', 'lavendel'
    ];

    function detectWishType(name) {
        const lower = name.toLowerCase();
        // Check if it's in our known list or ends with 'zaad' or 'zaden'
        if (bekendeZaden.some(z => lower.includes(z)) || lower.includes('zaad') || lower.includes('zaden')) {
            return 'seed';
        }
        return 'item';
    }

    function renderWishlist() {
        const container = document.getElementById('wishlist-items');
        const emptyState = document.getElementById('wishlist-empty-state');
        if (!container) return;

        const seedCount = wishlist.filter(item => item.type === 'seed').length;
        const totalCount = document.getElementById('wishlist-count-total');
        const seedCountLabel = document.getElementById('wishlist-count-seeds');
        const itemCountLabel = document.getElementById('wishlist-count-items');
        if (totalCount) totalCount.textContent = String(wishlist.length);
        if (seedCountLabel) seedCountLabel.textContent = String(seedCount);
        if (itemCountLabel) itemCountLabel.textContent = String(wishlist.length - seedCount);

        container.replaceChildren();
        if (wishlist.length === 0) {
            activeWishFilter = 'all';
            activeWishSearch = '';
            const searchInput = document.getElementById('wishlist-search-input');
            if (searchInput) searchInput.value = '';
            document.querySelectorAll('[data-wish-filter]').forEach(tab => {
                const isActive = tab.dataset.wishFilter === 'all';
                tab.classList.toggle('active', isActive);
                tab.setAttribute('aria-pressed', String(isActive));
            });
            if (emptyState) emptyState.classList.remove('hidden');
            return;
        }

        if (emptyState) emptyState.classList.add('hidden');

        const filtered = filterWishlistItems(wishlist, activeWishFilter, activeWishSearch);
        if (filtered.length === 0) {
            const emptyMessage = document.createElement('p');
            emptyMessage.className = 'wishlist-empty-msg';
            emptyMessage.textContent = activeWishSearch
                ? 'Geen items gevonden. Pas je zoekopdracht of filter aan.'
                : 'Geen items in deze categorie.';
            container.appendChild(emptyMessage);
            return;
        }

        filtered.forEach(item => {
            const card = buildWishlistCard(item, {
                onOpen: id => openWishModal(id),
                onConvert: (id, button) => window._convertToSeed(id, button),
                onLink: link => window.open(link, '_blank', 'noopener,noreferrer'),
                onEdit: id => window._editWish(id),
                onDelete: id => window._deleteWish(id)
            });
            container.appendChild(card);
        });
    }
    // Wishlist Tab handling (7.2)
    document.querySelectorAll('[data-wish-filter]').forEach(tab => {
        tab.onclick = () => {
            document.querySelectorAll('[data-wish-filter]').forEach(t => {
                const isActive = t === tab;
                t.classList.toggle('active', isActive);
                t.setAttribute('aria-pressed', String(isActive));
            });
            activeWishFilter = tab.dataset.wishFilter;
            renderWishlist();
        };
    });

    const wishlistSearchInput = document.getElementById('wishlist-search-input');
    if (wishlistSearchInput) {
        wishlistSearchInput.addEventListener('input', () => {
            activeWishSearch = wishlistSearchInput.value;
            renderWishlist();
        });
    }

    // Exposed Helpers for Wishlist Cards
    window._deleteWish = (id) => {
        if (confirm('Weet je zeker dat je dit item wilt verwijderen?')) {
            wishlist = wishlist.filter(item => String(item.id) !== String(id));
            saveWish();
        }
    };

    window._editWish = (id) => {
        openWishModal(id);
    };

    window._convertToSeed = async (id, btn) => {
        const item = wishlist.find(i => String(i.id) === String(id));
        if (!item || (btn && btn.disabled)) return;

        // Duplicate check before converting
        const exists = seeds.some(s => s.naam.toLowerCase() === item.name.toLowerCase());
        if (exists) {
            showToast("Staat al in je tuin 🌿");
            return;
        }

        if (btn) {
            btn.disabled = true;
            btn.textContent = 'Bezig...';
        }

        const newSeed = {
            id: Date.now().toString(),
            naam: item.name,
            type: 'Overig', // Default
            standplaats: 'Zon',
            water: 'Gemiddeld',
            status: 'Voorraad',
            zaaitijd: '',
            oogsttijd: '',
            ervaringScore: 0,
            beschrijving: item.note || '',
            ervaringen: '',
            images: item.image ? [{ url: item.image, source: 'wishlist' }] : [],
            tags: [],
            featuredImageUrl: item.image || '',
            isFavorite: false
        };

        // Try to enrich from mockData
        const lowerName = item.name.toLowerCase();
        for (let key in mockData) {
            if (lowerName.includes(key)) {
                newSeed.type = mockData[key].type;
                newSeed.standplaats = mockData[key].standplaats;
                newSeed.water = mockData[key].water;
                newSeed.zaaitijd = mockData[key].zaaitijd;
                newSeed.oogsttijd = mockData[key].oogsttijd;
                newSeed.tags = mockData[key].tags || [];
                break;
            }
        }

        await saveSeed(newSeed);
        seeds = await getAllSeeds();

        // Remove from wishlist
        wishlist = wishlist.filter(i => String(i.id) !== String(id));
        saveWish();

        showToast("Toegevoegd aan je zaden 🌱");
        if (!viewList.classList.contains('hidden')) applyFilters();
    };

    function saveWish() {
        localStorage.setItem('moestuin_wishlist', JSON.stringify(wishlist));
        renderWishlist();
    }

    // Modal management
    const wishModal = document.getElementById('wishlist-detail-modal');
    const wishInputQuick = document.getElementById('wishlist-quick-input');
    const btnAddWishQuick = document.getElementById('btn-add-wish-quick');
    let wishImageDraft = null; // null keeps the stored image unchanged until Save.
    let wishImageReadVersion = 0;
    let wishReturnFocus = null;

    function openWishModal(id) {
        editingWishId = id;


        const item = wishlist.find(i => String(i.id) === String(id));
        if (!item) {
            console.warn("Item not found for ID:", id);
            return;
        }

        document.getElementById('edit-wish-name').value = item.name || '';
        document.getElementById('edit-wish-type').value = item.type || 'seed';
        document.getElementById('edit-wish-link').value = item.link || '';
        wishImageDraft = null;
        wishImageReadVersion++;
        document.getElementById('btn-wish-save').disabled = false;
        document.getElementById('edit-wish-img-file').value = '';
        document.getElementById('wish-image-link').open = false;
        document.getElementById('edit-wish-img-url').value = safeHttpUrl(item.image);
        document.getElementById('edit-wish-img-url').setCustomValidity('');
        document.getElementById('edit-wish-note').value = item.note || '';

        updateWishImgPreview(item.image);
        updateVisitLink(item.link);

        wishReturnFocus = document.activeElement;
        wishModal.classList.remove('hidden');
        document.getElementById('edit-wish-name').focus();
    }

    function closeWishModal() {
        wishModal.classList.add('hidden');
        editingWishId = null;
        wishImageDraft = null;
        wishImageReadVersion++;
        (wishReturnFocus?.isConnected ? wishReturnFocus : wishInputQuick)?.focus();
    }

    function readWishImage(file) {
        if (!file || !file.type.startsWith('image/')) return;
        const version = ++wishImageReadVersion;
        const saveButton = document.getElementById('btn-wish-save');
        saveButton.disabled = true;
        const reader = new FileReader();
        reader.onload = () => {
            if (version !== wishImageReadVersion || !editingWishId) return;
            const safeImage = safeWishlistImageUrl(reader.result);
            if (safeImage) {
                wishImageDraft = safeImage;
                const urlField = document.getElementById('edit-wish-img-url');
                urlField.value = ''; urlField.setCustomValidity('');
                updateWishImgPreview(safeImage);
            } else showToast('Gebruik een PNG-, JPG-, GIF-, WebP- of AVIF-afbeelding.');
            saveButton.disabled = false;
        };
        reader.onerror = () => {
            if (version !== wishImageReadVersion) return;
            saveButton.disabled = false; showToast('Deze afbeelding kon niet worden gelezen.');
        };
        reader.readAsDataURL(file);
    }

    function updateWishImgPreview(src) {
        const preview = document.getElementById('edit-wish-img-preview');
        const placeholder = document.getElementById('wish-img-placeholder');
        if (!preview || !placeholder) return;

        const safeSrc = safeWishlistImageUrl(src);
        if (safeSrc) {
            preview.src = safeSrc;
            preview.style.display = 'block';
            placeholder.style.display = 'none';
        } else {
            preview.style.display = 'none';
            placeholder.style.display = 'block';
        }
    }

    function updateVisitLink(url) {
        const btn = document.getElementById('btn-visit-link');
        if (!btn) return;
        const safeUrl = safeHttpUrl(url);
        if (safeUrl) {
            btn.href = safeUrl;
            btn.style.opacity = '1';
            btn.style.pointerEvents = 'auto';
        } else {
            btn.style.opacity = '0.5';
            btn.style.pointerEvents = 'none';
        }
    }

    // Event Listeners
    if (btnAddWishQuick && wishInputQuick) {
        const handleAdd = (inputEl) => {
            const val = inputEl.value.trim();
            if (!val) {
                // UX Pass: Shake if empty
                inputEl.classList.add('shake-input');
                setTimeout(() => inputEl.classList.remove('shake-input'), 400);
                return;
            }

            const newItem = {
                id: Date.now().toString(),
                name: val,
                link: '',
                image: '',
                note: '',
                type: detectWishType(val),
                bought: false
            };
            wishlist.unshift(newItem); // Add to top
            saveWish();
            inputEl.value = '';

            inputEl.focus();
        };

        btnAddWishQuick.onclick = () => handleAdd(wishInputQuick);
        wishInputQuick.onkeydown = (e) => { if (e.key === 'Enter') handleAdd(wishInputQuick); };

    }

    // --- PASTE SUPPORT (Ctrl+V) ---
    wishModal?.addEventListener('paste', (e) => {
        for (const item of Array.from(e.clipboardData?.items || [])) {
            if (item.kind === 'file' && item.type.startsWith('image/')) {
                e.preventDefault(); readWishImage(item.getAsFile()); break;
            }
        }
    });

    document.getElementById('btn-close-wish-modal')?.addEventListener('click', closeWishModal);

    // Close on click outside
    wishModal?.addEventListener('click', (e) => {
        if (e.target === wishModal) closeWishModal();
    });

    // Close on ESC
    window.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && !wishModal.classList.contains('hidden')) {
            closeWishModal();
        }
    });

    document.getElementById('btn-wish-save')?.addEventListener('click', () => {
        if (!editingWishId) return;
        const index = wishlist.findIndex(i => String(i.id) === String(editingWishId));
        if (index === -1) return;

        const nameField = document.getElementById('edit-wish-name');
        const imgUrlField = document.getElementById('edit-wish-img-url');
        if (!nameField.reportValidity() || !imgUrlField.reportValidity()) return;

        wishlist[index].name = document.getElementById('edit-wish-name').value;
        wishlist[index].type = document.getElementById('edit-wish-type').value;
        wishlist[index].link = document.getElementById('edit-wish-link').value;
        wishlist[index].note = document.getElementById('edit-wish-note').value;

        if (wishImageDraft !== null) wishlist[index].image = wishImageDraft;
        saveWish();
        closeWishModal();
    });

    document.getElementById('btn-wish-delete')?.addEventListener('click', (e) => {
        e.preventDefault();


        if (!editingWishId) return;

        if (confirm('Weet je zeker dat je dit item wilt verwijderen?')) {
            const targetId = String(editingWishId);
            wishlist = wishlist.filter(item => String(item.id) !== targetId);

            localStorage.setItem('moestuin_wishlist', JSON.stringify(wishlist));
            renderWishlist();
            closeWishModal();
        }
    });

    document.getElementById('edit-wish-link')?.addEventListener('input', (e) => {
        updateVisitLink(e.target.value);
    });

    document.getElementById('edit-wish-img-url')?.addEventListener('input', (e) => {
        const rawUrl = e.target.value.trim();
        const safeUrl = safeHttpUrl(rawUrl);
        e.target.setCustomValidity(rawUrl && !safeUrl ? 'Gebruik een afbeeldingslink die begint met https:// of http://.' : '');
        wishImageReadVersion++;
        document.getElementById('btn-wish-save').disabled = false;
        wishImageDraft = safeUrl || null;
        const storedImage = wishlist.find(item => String(item.id) === String(editingWishId))?.image;
        updateWishImgPreview(safeUrl || storedImage);
    });

    document.getElementById('btn-wish-upload')?.addEventListener('click', () => document.getElementById('edit-wish-img-file').click());
    document.getElementById('edit-wish-img-file')?.addEventListener('change', (e) => {
        readWishImage(e.target.files[0]);
    });

    // --- CALENDAR VIEW ---
    function renderCalendar() {
        const grid = document.getElementById('calendar-grid');
        if (!grid) return;

        const year = curCalDate.getFullYear();
        const month = curCalDate.getMonth();
        const monthKey = `${year}-${String(month + 1).padStart(2, '0')}`;
        const today = new Date();
        const todayStr = formatDate(today);
        const title = document.getElementById('cal-month-title');
        const currentMonthLabel = document.getElementById('cal-current-month-indicator');
        const currentYearLabel = document.getElementById('cal-current-year-indicator');
        const tipsBadge = document.getElementById('btn-cal-sow-tips');

        if (!aiPlanningDraft && !calendarHasRendered && !selectedDateStr && year === today.getFullYear() && month === today.getMonth()) {
            selectedDateStr = todayStr;
        }
        calendarHasRendered = true;

        if (title) title.textContent = `${calMonthNames[month]} ${year}`;
        if (currentMonthLabel) currentMonthLabel.textContent = calMonthNames[today.getMonth()];
        if (currentYearLabel) currentYearLabel.textContent = `Tuinjaar ${today.getFullYear()}`;

        if (tipsBadge) {
            const plants = seeds.filter(seed => getActiveMonths(seed).has(month));
            if (plants.length > 0) {
                tipsBadge.classList.remove('hidden');
                tipsBadge.onclick = event => {
                    event.stopPropagation();
                    openPlannerMonthModal(month, year);
                };
            } else {
                tipsBadge.classList.add('hidden');
            }
        }

        grid.replaceChildren();
        const firstDay = new Date(year, month, 1).getDay();
        const daysInMonth = new Date(year, month + 1, 0).getDate();
        const offset = (firstDay === 0 ? 7 : firstDay) - 1;
        for (let index = 0; index < offset; index += 1) {
            const empty = document.createElement('div');
            empty.className = 'calendar-day other-month';
            empty.setAttribute('aria-hidden', 'true');
            grid.appendChild(empty);
        }

        for (let day = 1; day <= daysInMonth; day += 1) {
            const dateStr = `${monthKey}-${String(day).padStart(2, '0')}`;
            const dayReminders = reminders.filter(reminder => reminder.date === dateStr);
            const dayButton = document.createElement('button');
            dayButton.type = 'button';
            dayButton.className = 'calendar-day';
            if (dateStr === todayStr) {
                dayButton.classList.add('today');
                dayButton.setAttribute('aria-current', 'date');
            }
            if (dateStr === selectedDateStr) dayButton.classList.add('selected');
            dayButton.setAttribute('aria-pressed', String(dateStr === selectedDateStr));
            dayButton.setAttribute('aria-label', `${day} ${calMonthNames[month]} ${year}${dayReminders.length ? `, ${dayReminders.length} ${dayReminders.length === 1 ? 'herinnering' : 'herinneringen'}` : ''}`);

            const dayNumber = document.createElement('span');
            dayNumber.className = 'day-num';
            dayNumber.textContent = String(day);
            dayButton.appendChild(dayNumber);

            if (dayReminders.length > 0) {
                const marker = document.createElement('span');
                marker.className = 'calendar-activity-marker';
                marker.setAttribute('aria-hidden', 'true');
                marker.textContent = dayReminders.length > 1 ? String(Math.min(dayReminders.length, 9)) : '';
                dayButton.appendChild(marker);
            }

            dayButton.addEventListener('click', () => selectDay(dateStr, day));
            grid.appendChild(dayButton);
        }

        const panel = document.getElementById('day-details');
        const selectedDate = parseCalendarDate(selectedDateStr);
        document.getElementById('ai-planning-review')?.classList.toggle('hidden', !aiPlanningDraft);
        document.getElementById('ai-planning-cancel')?.classList.toggle('hidden', !aiPlanningDraft);
        const addButton = document.getElementById('btn-add-reminder');
        if (addButton) addButton.textContent = aiPlanningDraft ? 'Inplannen' : 'Toevoegen';
        document.querySelector('.calendar-upcoming-panel')?.classList.toggle('hidden', calendarTaskWeek);
        document.querySelector('#day-details .day-input-area')?.classList.toggle('hidden', calendarTaskWeek);
        const agendaEyebrow = document.querySelector('#day-details .calendar-panel-eyebrow');
        if (agendaEyebrow) agendaEyebrow.textContent = calendarTaskWeek ? 'Weekagenda' : 'Dagagenda';
        const periodsHeading = document.getElementById('calendar-periods-heading');
        if (periodsHeading) periodsHeading.textContent = calendarTaskWeek ? 'Zaaitaken deze week' : 'Plantperiodes deze maand';
        const periodNote = document.querySelector('#day-details .calendar-period-note');
        if (periodNote) periodNote.textContent = calendarTaskWeek ? 'Voorraadplanten die je nu kunt zaaien; nog niet ingepland deze maand.' : 'Deze plantgegevens hebben een maandperiode, geen ingeplande dag.';
        if (panel && aiPlanningDraft) {
            panel.classList.remove('hidden');
            const label = document.getElementById('selected-date-label');
            if (label) label.textContent = 'Voorgestelde planning';
            const context = document.getElementById('reminder-context-line');
            if (context) context.textContent = 'Pas het voorstel hieronder aan. Er is nog niets toegevoegd.';
            renderReminderList(aiPlanningDraft.date);
            renderCalendarPlantPeriods(month);
        } else if (panel && calendarTaskWeek) {
            panel.classList.remove('hidden');
            const selection = getDashboardSelection(today);
            const label = document.getElementById('selected-date-label');
            const weekEnd = parseCalendarDate(selection.reminderGroups.weekEndKey);
            weekEnd.setDate(weekEnd.getDate() - 1);
            if (label) label.textContent = `Taken deze week · ${today.toLocaleDateString('nl-NL', { day: 'numeric', month: 'long', year: 'numeric' })} – ${weekEnd.toLocaleDateString('nl-NL', { day: 'numeric', month: 'long', year: 'numeric' })}`;
            updateCalendarContext(panel);
            renderReminderList(selectedDateStr);
            const container = document.getElementById('calendar-plant-period-list');
            container.replaceChildren();
            selection.now.forEach(seed => {
                const row = document.createElement('button');
                row.type = 'button'; row.className = 'calendar-period-task';
                row.textContent = `${seed.naam} zaaien`;
                row.addEventListener('click', () => openDetailView(seed));
                container.append(row);
            });
            if (!selection.now.length) {
                const empty = document.createElement('p'); empty.className = 'calendar-empty-message';
                empty.textContent = 'Geen zaaitaken voor deze week.'; container.append(empty);
            }
        } else if (panel && selectedDate && formatDate(selectedDate).slice(0, 7) === monthKey) {
            panel.classList.remove('hidden');
            const label = document.getElementById('selected-date-label');
            if (label) label.textContent = selectedDate.toLocaleDateString('nl-NL', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
            updateCalendarContext(panel);
            renderReminderList(selectedDateStr);
            renderCalendarPlantPeriods(selectedDate.getMonth());
        } else if (panel) {
            panel.classList.add('hidden');
        }

        renderUpcomingReminders(todayStr);
    }

    function formatDate(date) {
        const day = date.getDate();
        const month = date.getMonth() + 1;
        const year = date.getFullYear();
        return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    }

    function parseCalendarDate(value) {
        if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
        const [year, month, day] = value.split('-').map(Number);
        const date = new Date(year, month - 1, day);
        return date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day ? date : null;
    }

    function updateCalendarContext(panel) {
        const contextLine = document.getElementById('reminder-context-line');
        if (!contextLine) return;
        contextLine.replaceChildren();
        contextLine.append(calendarTaskWeek ? 'Open taken vanaf vandaag tot en met zondag · ' : 'Geselecteerde dag · ');
        const changeDayButton = document.createElement('button');
        changeDayButton.type = 'button';
        changeDayButton.id = 'btn-change-day';
        changeDayButton.className = 'link-button';
        changeDayButton.textContent = 'Dag kiezen';
        changeDayButton.addEventListener('click', event => {
            event.stopPropagation();
            calendarTaskWeek = false;
            selectedDateStr = null;
            panel.classList.add('hidden');
            renderCalendar();
        });
        contextLine.appendChild(changeDayButton);
    }

    function selectDay(dateStr) {
        if (!parseCalendarDate(dateStr)) return;
        calendarTaskWeek = false;
        selectedDateStr = dateStr;
        if (aiPlanningDraft) {
            aiPlanningDraft.date = dateStr;
            document.getElementById('ai-planning-date').value = dateStr;
        }
        const selectedDate = parseCalendarDate(dateStr);
        curCalDate = new Date(selectedDate.getFullYear(), selectedDate.getMonth(), 1);
        renderCalendar();

        const input = document.getElementById('new-reminder-input');
        if (input) {
            input.focus();
            input.onkeydown = event => {
                if (event.key === 'Enter') document.getElementById('btn-add-reminder')?.click();
            };
        }
    }

    function renderReminderList(dateStr) {
        const container = document.getElementById('reminder-list');
        if (!container) return;

        const selection = calendarTaskWeek ? getDashboardSelection() : null;
        const dayItems = selection ? selection.reminderGroups.current : reminders.filter(reminder => reminder.date === dateStr);
        container.replaceChildren();
        if (dayItems.length === 0) {
            const emptyMessage = document.createElement('p');
            emptyMessage.className = 'calendar-empty-message';
            emptyMessage.textContent = selection ? (selection.now.length ? 'Geen open herinneringen meer deze week.' : 'Geen taken meer voor deze week.') : 'Geen herinneringen op deze dag.';
            container.appendChild(emptyMessage);
            return;
        }

        dayItems.sort((a, b) => a.id - b.id).forEach(item => {
            const row = buildReminderRow(item, {
                onToggle: () => {
                    item.done = !item.done;
                    saveReminders();
                    renderCalendar();
                },
                onDelete: () => {
                    if (!window.confirm('Weet je zeker dat je deze herinnering wilt verwijderen?')) return;
                    reminders = reminders.filter(reminder => reminder.id !== item.id);
                    saveReminders();
                    renderCalendar();
                }
            });
            container.appendChild(row);
        });
    }

    function renderCalendarPlantPeriods(monthIndex) {
        const container = document.getElementById('calendar-plant-period-list');
        if (!container) return;
        container.replaceChildren();

        const activities = getPlannerActivities(monthIndex);
        const sections = [
            { label: 'Zaaien', ids: ['indoor-sow', 'outdoor-sow', 'sow'] },
            { label: 'Uitplanten', ids: ['transplant'] },
            { label: 'Oogsten', ids: ['harvest'] }
        ];
        let activityCount = 0;

        sections.forEach(section => {
            const sectionGroups = activities.filter(group => section.ids.includes(group.id));
            if (!sectionGroups.length) return;
            const block = document.createElement('div');
            block.className = 'calendar-period-group';
            const heading = document.createElement('h5');
            heading.textContent = section.label;
            block.appendChild(heading);

            const list = document.createElement('ul');
            sectionGroups.forEach(group => group.plants.forEach(seed => {
                const name = typeof seed?.naam === 'string' ? seed.naam : (typeof seed?.name === 'string' ? seed.name : '');
                if (!name) return;
                const item = document.createElement('li');
                const action = document.createElement('span');
                action.className = 'calendar-period-action';
                action.textContent = group.label;
                const plantName = document.createElement('span');
                plantName.className = 'calendar-period-plant';
                plantName.textContent = name;
                item.append(action, plantName);
                list.appendChild(item);
                activityCount += 1;
            }));
            if (list.childElementCount > 0) block.appendChild(list);
            if (list.childElementCount > 0) container.appendChild(block);
        });

        if (activityCount === 0) {
            const emptyMessage = document.createElement('p');
            emptyMessage.className = 'calendar-empty-message';
            emptyMessage.textContent = `Geen plantperiodes voor ${calMonthNames[monthIndex].toLowerCase()}.`;
            container.appendChild(emptyMessage);
        }
    }

    function renderUpcomingReminders(todayStr) {
        const container = document.getElementById('calendar-upcoming-list');
        if (!container) return;
        container.replaceChildren();

        const groups = groupUpcomingCalendarReminders(reminders, todayStr);

        groups.forEach(group => {
            const section = document.createElement('section');
            section.className = 'calendar-upcoming-group';
            const heading = document.createElement('h3');
            heading.textContent = group.label;
            section.appendChild(heading);
            if (group.items.length === 0) {
                const emptyMessage = document.createElement('p');
                emptyMessage.className = 'calendar-upcoming-empty';
                emptyMessage.textContent = 'Geen open herinneringen';
                section.appendChild(emptyMessage);
            } else {
                group.items.forEach(reminder => {
                    const button = document.createElement('button');
                    button.type = 'button';
                    button.className = 'calendar-upcoming-item';
                    const title = document.createElement('span');
                    title.className = 'calendar-upcoming-title';
                    title.textContent = typeof reminder.title === 'string' ? reminder.title : '';
                    const date = document.createElement('span');
                    date.className = 'calendar-upcoming-date';
                    const parsedDate = parseCalendarDate(reminder.date);
                    date.textContent = parsedDate ? parsedDate.toLocaleDateString('nl-NL', { day: 'numeric', month: 'short' }) : reminder.date;
                    button.append(title, date);
                    button.setAttribute('aria-label', `${title.textContent}, ${date.textContent}. Open deze dag`);
                    button.addEventListener('click', () => {
                        const selectedDate = parseCalendarDate(reminder.date);
                        if (!selectedDate) return;
                        selectedDateStr = reminder.date;
                        curCalDate = new Date(selectedDate.getFullYear(), selectedDate.getMonth(), 1);
                        renderCalendar();
                    });
                    section.appendChild(button);
                });
            }
            container.appendChild(section);
        });
    }

    // saveReminders moved to top for dashboard access


    const btnCalPrev = document.getElementById('cal-prev');
    const btnCalNext = document.getElementById('cal-next');
    if (btnCalPrev) btnCalPrev.onclick = () => { calendarTaskWeek = false; curCalDate = new Date(curCalDate.getFullYear(), curCalDate.getMonth() - 1, 1); selectedDateStr = null; renderCalendar(); };
    if (btnCalNext) btnCalNext.onclick = () => { calendarTaskWeek = false; curCalDate = new Date(curCalDate.getFullYear(), curCalDate.getMonth() + 1, 1); selectedDateStr = null; renderCalendar(); };

    const btnCalToday = document.getElementById('cal-today');
    if (btnCalToday) btnCalToday.onclick = () => {
        calendarTaskWeek = false;
        const today = new Date();
        curCalDate = new Date(today.getFullYear(), today.getMonth(), 1);
        selectedDateStr = formatDate(today);
        renderCalendar();
    };

    const btnAddReminder = document.getElementById('btn-add-reminder');
    const reminderInput = document.getElementById('new-reminder-input');

    function cancelAIPlanning(returnHome = true) {
        if (!aiPlanningDraft) return;
        const draft = aiPlanningDraft;
        aiPlanningDraft = null;
        reminderInput.value = draft.previousTitle;
        selectedDateStr = draft.previousDate;
        curCalDate = draft.previousCalendar;
        calendarTaskWeek = false;
        renderCalendar();
        if (returnHome) {
            switchView('home');
            draft.button?.focus();
        }
    }

    window._planAssistantSuggestion = (action, button) => {
        if (!action || action.destination !== 'todo' || button?.disabled) return;
        if (aiPlanningDraft) {
            switchView('calendar');
            showAssistantFeedback('Er staat al een voorstel klaar.');
            return;
        }
        aiPlanningDraft = { ...action, button, previousTitle: reminderInput.value,
            previousDate: selectedDateStr, previousCalendar: new Date(curCalDate) };
        calendarTaskWeek = false;
        selectedDateStr = action.date || null;
        const date = parseCalendarDate(action.date);
        if (date) curCalDate = new Date(date.getFullYear(), date.getMonth(), 1);
        document.getElementById('ai-planning-date').value = action.date;
        reminderInput.value = action.title;
        switchView('calendar');
        reminderInput.scrollIntoView({ block: 'center' });
        reminderInput.focus();
        showAssistantFeedback('Voorstel klaar; nog niet ingepland.');
    };
    document.getElementById('ai-planning-cancel').onclick = () => cancelAIPlanning();
    document.getElementById('ai-planning-date').onchange = event => {
        if (!aiPlanningDraft) return;
        aiPlanningDraft.date = isAIPlanningDate(event.target.value) ? event.target.value : '';
        selectedDateStr = aiPlanningDraft.date || null;
        const date = parseCalendarDate(aiPlanningDraft.date);
        if (date) curCalDate = new Date(date.getFullYear(), date.getMonth(), 1);
        renderCalendar();
    };

    const handleAdd = () => {
        if (aiPlanningDraft) {
            const dateInput = document.getElementById('ai-planning-date');
            const date = dateInput.value;
            const title = reminderInput.value.trim();
            if (!isAIPlanningDate(date)) { showAssistantFeedback('Kies een geldige datum.'); dateInput.focus(); return; }
            if (!title) { showAssistantFeedback('Vul een activiteit in.'); reminderInput.focus(); return; }
            const duplicate = reminders.some(item => item.date === date && item.title.trim().toLocaleLowerCase('nl-NL') === title.toLocaleLowerCase('nl-NL'));
            if (!duplicate) {
                reminders.push({ id: Date.now(), date, title, done: false });
                saveReminders();
            }
            const button = aiPlanningDraft.button;
            aiPlanningDraft = null;
            selectedDateStr = date;
            reminderInput.value = '';
            if (button) { button.textContent = 'Ingepland'; button.disabled = true; }
            renderCalendar();
            showAssistantFeedback(duplicate ? 'Staat al in je planning.' : 'Ingepland.');
            return;
        }
        if (!selectedDateStr) return;
        const val = reminderInput.value.trim();
        if (!val) return;
        reminders.push({ id: Date.now(), date: selectedDateStr, title: val, done: false });
        saveReminders();
        reminderInput.value = '';
        renderCalendar();
        reminderInput.focus();
    };

    if (btnAddReminder) btnAddReminder.onclick = handleAdd;
    if (reminderInput) {
        reminderInput.onkeydown = (e) => { if (e.key === 'Enter') handleAdd(); };
    }

    const btnCloseDetails = document.getElementById('btn-close-details');
    if (btnCloseDetails) {
        btnCloseDetails.onclick = () => {
            if (aiPlanningDraft) { cancelAIPlanning(); return; }
            calendarTaskWeek = false;
            document.getElementById('day-details')?.classList.add('hidden');
            selectedDateStr = null;
            renderCalendar();
        };
    }

    const btnFab = document.getElementById('btn-add-event-fab');
    if (btnFab) {
        btnFab.onclick = () => {
            if (viewCalendar.classList.contains('hidden')) {
                switchView('calendar');
            }
            if (!selectedDateStr) {
                const today = new Date();
                curCalDate = new Date(today.getFullYear(), today.getMonth(), today.getDate());
                selectDay(formatDate(today), today.getDate());
            } else {
                document.getElementById('new-reminder-input')?.focus();
            }
        };
    }

    // Delete seed from form
    // Dashboard Tips link
    const btnHomeTips = document.getElementById('btn-home-tips');
    if (btnHomeTips) {
        btnHomeTips.onclick = (e) => {
            e.stopPropagation();
            const currentMonth = new Date().getMonth();
            window.openPlannerMonthModal(currentMonth);
        };
    }

    window.deleteCurrentSeed = async function() {
        if (!editingId) return;
        if (confirm("Weet je zeker dat je dit zaadje wilt verwijderen?")) {
            try {
                await deleteSeedDB(editingId);
                seeds = await getAllSeeds();
                showToast("Zaadje verwijderd! 🗑️");
                switchView('list');
            } catch (err) {
                console.error("Delete failed", err);
                showToast("Verwijderen mislukt ❌");
            }
        }
    };

    const btnFormDelete = document.getElementById('btn-form-delete');
    if (btnFormDelete) {
        btnFormDelete.onclick = window.deleteCurrentSeed;
    }



    function updateTagsSummary() {
        const summary = document.getElementById('tags-summary');
        if (!summary) return;
        const count = document.querySelectorAll('.tag-picker-chip.active').length;
        summary.textContent = count > 0 ? `${count} tag${count === 1 ? '' : 's'} geselecteerd` : 'Kies kenmerken en gebruik';
    }

    // Tag Picker Init
    function renderTagPicker(selectedNames = []) {
        const p = document.getElementById('tag-picker');
        if (!p) return;
        p.innerHTML = '';

        const selLow = selectedNames.map(s => s.toLowerCase());
        const allPredefined = [];

        tagCategoryOrder.forEach(cat => {
            const g = document.createElement('div');
            g.innerHTML = `<h5>${cat}</h5><div class="tag-picker-list"></div>`;
            tagCategories[cat].forEach(t => {
                const lowerT = t.toLowerCase();
                allPredefined.push(lowerT);
                const chip = document.createElement('div');
                chip.className = `tag-picker-chip ${selLow.includes(lowerT) ? 'active' : ''}`;
                chip.textContent = t;
                chip.dataset.tag = t;
                chip.onclick = () => {
                    chip.classList.toggle('active');
                    updateTagsSummary();
                };
                g.querySelector('.tag-picker-list').appendChild(chip);
            });
            p.appendChild(g);
        });

        updateTagsSummary();
    }

    // Convert month indices to readable ranges (e.g. [2,3,4,8,9] -> "Mrt – Mei, Sep – Okt")
    function formatMonthRanges(months) {
        if (!months) return '';
        const sorted = Array.from(months).sort((a, b) => a - b);
        if (sorted.length === 0) return '';
        if (sorted.length === 12) return 'Hele jaar door';

        const ranges = [];
        let start = sorted[0];
        let prev = sorted[0];

        for (let i = 1; i < sorted.length; i++) {
            if (sorted[i] === prev + 1) {
                prev = sorted[i];
            } else {
                ranges.push([start, prev]);
                start = sorted[i];
                prev = sorted[i];
            }
        }
        ranges.push([start, prev]);

        return ranges.map(([s, e]) => {
            return s === e ? monthNamesShort[s] : `${monthNamesShort[s]} - ${monthNamesShort[e]}`;
        }).join(', ');
    }

    // Small helper for month recognition
    function getActiveMonths(valueOrSeed) {
        let value = valueOrSeed;
        // If a seed object is passed, automatically pick the best sowing months field
        if (valueOrSeed && typeof valueOrSeed === 'object' && !Array.isArray(valueOrSeed)) {
            value = valueOrSeed.zaaitijd || valueOrSeed.sowingMonths || valueOrSeed.zaaiTijd || valueOrSeed.sowMonths;
        }

        let active = new Set();
        if (!value) return active;

        // Common month abbreviations and their index
        const mMap = {
            'jan': 0, 'feb': 1, 'mrt': 2, 'mar': 2, 'maa': 2, 'apr': 3,
            'mei': 4, 'may': 4, 'jun': 5, 'jul': 6, 'aug': 7,
            'sep': 8, 'okt': 9, 'oct': 9, 'nov': 10, 'dec': 11
        };

        // Support array of numbers or strings
        if (Array.isArray(value)) {
            value.forEach(v => {
                if (typeof v === 'number') {
                    if (v >= 0 && v <= 11) active.add(v);
                    else if (v >= 1 && v <= 12) active.add(v - 1);
                } else if (typeof v === 'string') {
                    const cleanV = v.toLowerCase().substring(0, 3);
                    if (mMap[cleanV] !== undefined) active.add(mMap[cleanV]);
                }
            });
            return active;
        }

        const text = value.toString().toLowerCase();
        if (text.includes('jaar door')) { for (let i = 0; i < 12; i++) active.add(i); return active; }

        // --- RANGE DETECTION ---
        const rangeParts = text.split(/[-–]| tot /);
        if (rangeParts.length === 2) {
            let startIdx = -1;
            let endIdx = -1;

            Object.keys(mMap).forEach(k => {
                if (rangeParts[0].includes(k)) startIdx = mMap[k];
                if (rangeParts[1].includes(k)) endIdx = mMap[k];
            });

            if (startIdx !== -1 && endIdx !== -1) {
                // Determine loop direction (handling Dec-Jan wrap-around)
                if (startIdx <= endIdx) {
                    for (let i = startIdx; i <= endIdx; i++) active.add(i);
                } else {
                    for (let i = startIdx; i <= 11; i++) active.add(i);
                    for (let i = 0; i <= endIdx; i++) active.add(i);
                }
                return active;
            }
        }

        Object.keys(mMap).forEach(k => {
            if (text.includes(k)) active.add(mMap[k]);
        });

        // Robust numeric check (e.g. "1, 2, 3" or 0-indexed values)
        const nums = text.match(/\d+/g);
        if (nums) {
            nums.forEach(n => {
                const val = parseInt(n);
                // Assume 1-12 for text strings
                if (val >= 1 && val <= 12) active.add(val - 1);
            });
        }
        return active;
    }

    renderTagPicker();

    // All AI features use the same provider/model settings and backend.
    async function vraagAI(mode, input = '', month = '') {
        const data = await window.KweekServices.requestAI('gemini-ai', { mode, input, month });
        return data.text || '';
    }

    async function stelAIHulpVraag(vraag) {
        const input = document.getElementById('ai-question-input');
        const btn = document.getElementById('btn-ask-ai');
        const output = document.getElementById('ai-assistant-output');
        if (!output) return;

        const months = ["januari", "februari", "maart", "april", "mei", "juni", "juli", "augustus", "september", "oktober", "november", "december"];
        const currentMonth = months[new Date().getMonth()];

        // Map quick questions if they match exactly
        const questionMap = {
            'Wat moet ik nu doen?': 'Wat moet ik deze week concreet doen in mijn moestuin?',
            'Waar ben ik te laat?': 'Waar ben ik nu te laat mee met zaaien?',
            'Wat kan ik nu zaaien?': 'Welke planten kan ik nu nog zaaien en waarom?'
        };
        const userInput = questionMap[vraag] || vraag || (input ? input.value.trim() : '');
        if (!userInput) {
            output.style.display = 'block';
            output.innerHTML = '<div style="font-size: 13px; color: var(--text-muted); padding: 8px;">Typ eerst je tuinvraag.</div>';
            return;
        }

        if (btn && btn.disabled) return;

        if (input && !questionMap[vraag]) input.value = userInput;
        if (btn) {
            btn.disabled = true;
            btn.classList.add('btn-loading');
            btn.innerText = "Even denken...";
        }

        output.innerHTML = '<div class="ai-loading-text">🪄 Tuinassistent denkt even...</div>';
        output.style.display = 'block';
        output.dataset.active = "true";

        try {
            const activePlants = typeof seeds !== 'undefined' ? seeds.filter(s => s.status === 'Voorraad' || s.status === 'Gezaaid').map(s => s.naam) : [];
            const data = await window.KweekServices.requestAI('tuinassistent', {
                question: userInput, context: { month: currentMonth, plants: activePlants }
            });
            output.innerHTML = '';

            // Handle standard fallback for bad parsing
            if (!data || !data.answer) {
                throw new Error("Ongeldig of leeg antwoord.");
            }

            // Display Answer
            const answerCard = document.createElement('div');
            answerCard.className = 'ai-advies-card';
            answerCard.style.fontSize = '13px';
            answerCard.textContent = String(data.answer);
            output.appendChild(answerCard);

            // Display Actions
            if (data.actions && Array.isArray(data.actions) && data.actions.length > 0) {
                const actionsContainer = document.createElement('div');
                actionsContainer.style.marginTop = '16px';
                actionsContainer.style.padding = '12px 16px';
                actionsContainer.style.borderTop = '1px solid var(--border-color)';
                actionsContainer.style.background = 'rgba(0,0,0,0.02)';
                actionsContainer.style.borderRadius = '0 0 var(--radius-content) var(--radius-content)';
                const heading = document.createElement('div');
                heading.style.cssText = 'font-size: 11px; font-weight: 800; color: var(--text-muted); text-transform: uppercase; letter-spacing: 0.1em; margin-bottom: 12px; margin-top: 5px;';
                heading.textContent = 'Voorgestelde Acties';
                actionsContainer.appendChild(heading);

                const actionList = document.createElement('div');
                actionList.style.cssText = 'display: flex; flex-direction: column; gap: 6px;';
                data.actions.forEach(action => {
                    if (actionList.children.length >= 3) return;
                    const row = buildAISuggestionRow(action, {
                        onWishlist: (name, button, proposal) => window._addSuggestionToWishlist(name, button, proposal.wishlistType),
                        onPlan: (proposal, button) => window._planAssistantSuggestion(proposal, button)
                    });
                    if (row) actionList.appendChild(row);
                });
                if (actionList.children.length > 0) {
                    actionsContainer.appendChild(actionList);
                    output.appendChild(actionsContainer);
                }
            }

        } catch (err) {
            console.error("Technical Assistant Error:", err);
            output.replaceChildren();
            const errorCard = document.createElement('div');
            errorCard.className = 'ai-advies-card ai-error';
            errorCard.setAttribute('role', 'alert');
            errorCard.textContent = err.message || 'AI is tijdelijk niet beschikbaar. Controleer Instellingen → AI.';
            output.appendChild(errorCard);
        } finally {
            if (btn) {
                btn.disabled = false;
                btn.classList.remove('btn-loading');
                btn.textContent = "Vraag AI";
            }
        }
    }

    const btnAskAi = document.getElementById('btn-ask-ai');
if (btnAskAi) btnAskAi.onclick = () => stelAIHulpVraag();

const aiInput = document.getElementById('ai-question-input');
if (aiInput) {
    aiInput.onkeypress = (e) => {
        if (e.key === 'Enter') stelAIHulpVraag();
    };
}

window._quickAskAI = (vraag) => stelAIHulpVraag(vraag);

function applyMonthFilter(monthName) {
    if (!monthName) return;

    // Map full month name to short name because seeds are stored with short names
    const mIdx = calMonthNames.indexOf(monthName);
    const shortName = mIdx !== -1 ? monthNamesShort[mIdx] : monthName;

    const filtered = seeds.filter(seed =>
        seed.zaaitijd && (seed.zaaitijd.includes(monthName) || seed.zaaitijd.includes(shortName))
    );

    renderSeeds(filtered);
    showMonthContextBanner(monthName, filtered.length);
}

function showMonthContextBanner(month, count) {
    const container = document.getElementById('seeds-context-banner');
    if (!container) return;

    container.replaceChildren();
    const banner = document.createElement('div');
    banner.className = 'seeds-month-context';
    const info = document.createElement('div');
    info.className = 'context-info';
    const icon = document.createElement('span');
    icon.className = 'context-icon';
    icon.textContent = '\u{1F331}';
    const text = document.createElement('span');
    text.className = 'context-text';
    const monthLabel = document.createElement('strong');
    monthLabel.textContent = month === null || month === undefined ? '' : String(month);
    text.append(monthLabel, document.createTextNode(` \u00A0\u2022\u00A0 ${Number.isFinite(Number(count)) ? Number(count) : 0} planten`));
    info.append(icon, text);

    const reset = document.createElement('button');
    reset.type = 'button';
    reset.className = 'context-reset-btn';
    reset.title = 'Filter herstellen';
    reset.setAttribute('aria-label', 'Filter herstellen');
    const resetIcon = document.createElement('span');
    resetIcon.textContent = '\u2715';
    reset.appendChild(resetIcon);
    reset.addEventListener('click', () => window.clearMonthFilter());

    banner.append(info, reset);
    container.appendChild(banner);
    container.classList.remove('hidden');
}

window.revealInList = function (seedId) {
    // 1. Ensure any month filters are cleared so the item is definitely visible
    if (window.clearMonthFilter) window.clearMonthFilter();
    activeCategory = 'Alles';
    localStorage.removeItem('nu_doen_show_all'); // Small reset if needed

    // 2. Refresh the list filters
    applyFilters();
    switchView('list');

    // 3. Scroll and Highlight (with a small delay for UI switch)
    setTimeout(() => {
        const card = document.getElementById(`seed-card-${seedId}`);
        if (card) {
            card.scrollIntoView({ behavior: 'smooth', block: 'center' });
            card.classList.add('highlight-target');
            setTimeout(() => {
                card.classList.remove('highlight-target');
            }, 1800);
        }
    }, 150);
};

window.scrollToGardenItem = function (seedId) {
    const card = document.getElementById(`garden-card-${seedId}`);
    if (card) {
        card.scrollIntoView({ behavior: 'smooth', block: 'center' });
        card.classList.add('highlight-target');
        setTimeout(() => {
            card.classList.remove('highlight-target');
        }, 1500);
    }
};

window.clearMonthFilter = function () {
    activeMonthFilter = null;
    localStorage.removeItem('activeMonthFilter');
    const container = document.getElementById('seeds-context-banner');
    if (container) {
        container.replaceChildren();
        container.classList.add('hidden');
    }
    applyFilters(); // Re-apply current general filters/search
};

window._addToWishlistFromDetail = (id) => {
    const seed = seeds.find(s => String(s.id) === String(id));
    if (seed) addToWishlistFromCard(seed);
};

// 8.1b: Add Suggestion to Wishlist (Full Integration)
window._addSuggestionToWishlist = (name, btn, type = 'seed') => {
    const safeName = typeof name === 'string' ? name.trim() : '';
    const lowerName = safeName.toLowerCase();
    if (!lowerName || (btn && btn.disabled)) return;

    // Check for duplicates
    const exists = wishlist.some(item => item.name.toLowerCase() === lowerName);

    if (exists) {
        showAssistantFeedback('Staat al op je verlanglijst.');
        if (btn) { btn.textContent = 'Op verlanglijst'; btn.disabled = true; }
        return;
    }

    const newItem = {
        id: Date.now().toString(),
        name: safeName,
        link: '',
        image: '',
        note: 'Gevonden via Tuinassistent',
        type: type === 'item' ? 'item' : 'seed',
        bought: false
    };

    wishlist.unshift(newItem);
    saveWish();

    showAssistantFeedback('Toegevoegd aan je verlanglijst.');

    if (btn) {
        btn.textContent = 'Op verlanglijst';
        btn.disabled = true;
    }
};

// Internal helper for temporary button feedback
window._tempSuggestionFeedback = (btn) => {
    const originalText = btn.textContent;
    btn.textContent = '✔';
    btn.disabled = true;
    btn.style.borderColor = 'var(--primary-color)';
    btn.style.color = 'var(--primary-color)';

    setTimeout(() => {
        btn.textContent = originalText;
        btn.disabled = false;
        btn.style.borderColor = '';
        btn.style.color = '';
    }, 800);
};

// 8.1c: Add Suggestion to Seeds (Direct Sow)
window._addSuggestionToSeeds = async (name, btn) => {
    const lowerName = name.toLowerCase().trim();
    if (!lowerName || (btn && btn.disabled)) return;

    // Check for duplicates in actual seeds
    const existingSeeds = await getAllSeeds();
    const exists = existingSeeds.some(s => s.naam.toLowerCase() === lowerName);

    if (exists) {
        showToast("Staat al in je tuin");
        return;
    }

    // Prepare new seed object (Match starter structure for ID)
    const newSeed = {
        id: Number(Date.now()),
        naam: name.charAt(0).toUpperCase() + name.slice(1),
        type: 'Overig',
        standplaats: 'Zon',
        water: 'Gemiddeld',
        status: 'Gezaaid',
        zaaitijd: '',
        oogsttijd: '',
        tags: ['Gevonden via AI'],
        beschrijving: 'Direct toegevoegd vanuit assistent advies.',
        images: [],
        featuredImageUrl: '',
        isFavorite: false,
        lastSownYear: new Date().getFullYear()
    };

    // Enrichment
    for (let key in mockData) {
        if (lowerName.includes(key)) {
            newSeed.type = mockData[key].type;
            newSeed.standplaats = mockData[key].standplaats;
            newSeed.water = mockData[key].water;
            newSeed.zaaitijd = mockData[key].zaaitijd;
            newSeed.oogsttijd = mockData[key].oogsttijd;
            if (mockData[key].tags) newSeed.tags = [...newSeed.tags, ...mockData[key].tags];
            break;
        }
    }

    try {
        await saveSeed(newSeed);
        // FORCE update of local seeds array used for rendering
        const updatedSeeds = await getAllSeeds();
        if (typeof seeds !== 'undefined') {
            seeds.length = 0;
            seeds.push(...updatedSeeds);
        }

        showToast("Toegevoegd aan je tuin 🌱");
        if (btn) window._tempSuggestionFeedback(btn);

        // Refresh UI
        renderHome();
        if (!viewList.classList.contains('hidden')) applyFilters();
    } catch (err) {
        showToast("Fout bij opslaan");
        console.error(err);
    }
};

// 8.2: Add Suggestion to 'Nu doen' (Quick Action)
window._addSuggestionToTodo = async (name, btn) => {
    const safeName = typeof name === 'string' ? name.trim() : '';
    const lowerName = safeName.toLowerCase();
    if (!lowerName || (btn && btn.disabled)) return;

    // Check for duplicates in actual seeds
    const existingSeeds = await getAllSeeds();
    const exists = existingSeeds.some(s => s.naam.toLowerCase() === lowerName);

    if (exists) {
        showToast("Staat al in je lijst");
        return;
    }

    const monthsNames = ["januari", "februari", "maart", "april", "mei", "juni", "juli", "augustus", "september", "oktober", "november", "december"];
    const currentMonth = monthsNames[new Date().getMonth()];
    const currentMonthCap = currentMonth.charAt(0).toUpperCase() + currentMonth.slice(1);

    const newSeed = {
        id: Number(Date.now()),
        naam: safeName.charAt(0).toUpperCase() + safeName.slice(1),
        type: 'Overig',
        standplaats: 'Zon',
        water: 'Gemiddeld',
        status: 'Voorraad',
        zaaitijd: currentMonthCap, // Default to now
        oogsttijd: '',
        tags: ['Gevonden via AI', 'Nu doen'],
        beschrijving: 'Toegevoegd via snelle AI actie.',
        images: [],
        featuredImageUrl: '',
        isFavorite: false
    };

    // Enrichment
    for (let key in mockData) {
        if (lowerName.includes(key)) {
            newSeed.type = mockData[key].type;
            newSeed.standplaats = mockData[key].standplaats;
            newSeed.water = mockData[key].water;
            newSeed.zaaitijd = mockData[key].zaaitijd;
            newSeed.oogsttijd = mockData[key].oogsttijd;
            if (mockData[key].tags) newSeed.tags = [...newSeed.tags, ...mockData[key].tags];
            break;
        }
    }

    // Force current month to ensure it shows up in "Nu zaaien"
    if (!newSeed.zaaitijd.toLowerCase().includes(currentMonth)) {
        newSeed.zaaitijd = newSeed.zaaitijd ? `${newSeed.zaaitijd}, ${currentMonthCap}` : currentMonthCap;
    }

    try {
        await saveSeed(newSeed);
        const updatedSeeds = await getAllSeeds();
        if (typeof seeds !== 'undefined') {
            seeds.length = 0;
            seeds.push(...updatedSeeds);
        }

        showToast("Toegevoegd aan je acties ⚡");
        if (btn) window._tempSuggestionFeedback(btn);

        renderHome();
    } catch (err) {
        showToast("Fout bij opslaan");
        console.error(err);
    }
};

window.applyMonthFilter = applyMonthFilter;

    // --- STARTUP LOGIC ---
    const doneOnb = localStorage.getItem('onboarding_done');
    const hasProfile = hasStoredUserProfile();
    if (!databaseAvailable) {
        showToast("Lokale opslag is tijdelijk niet beschikbaar. Je gegevens zijn niet geladen.");
    }

    if (shouldStartOnboarding(doneOnb, hasProfile, seeds.length, databaseAvailable)) {
        switchView('onboarding');
    } else {
        switchView('home');
    }
});



// --- IMAGE SEARCH INTEGRATION (Unsplash) ---
async function searchPlantImage(query) {
    const ACCESS_KEY = 'SKRS2cE9UySRiAEXZ6wW2__-Tsl-BelT7Y7ryi1IwUs';

    // Simple NL -> EN mapping for common garden plants to boost Unsplash results
    const translations = {
        'tomaat': 'tomato', 'paprika': 'bell pepper', 'peper': 'chili pepper', 'pepers': 'hot peppers',
        'komkommer': 'cucumber', 'courgette': 'zucchini', 'sla': 'lettuce', 'rucola': 'arugula',
        'wortel': 'carrot', 'prei': 'leek', 'ui': 'onion', 'knoflook': 'garlic', 'spinazie': 'spinach',
        'aardappel': 'potato', 'aardbei': 'strawberry', 'framboos': 'raspberry', 'bes': 'berry',
        'erwt': 'pea', 'peul': 'snow pea', 'boon': 'bean', 'pompoen': 'pumpkin', 'biet': 'beetroot', 'radijs': 'radish',
        'tijm': 'thyme', 'basilicum': 'basil', 'peterselie': 'parsley', 'bieslook': 'chive', 'rozemarijn': 'rosemary',
        'munt': 'mint', 'salie': 'sage', 'dille': 'dill', 'koriander': 'cilantro', 'oregano': 'oregano',
        'appel': 'apple', 'peer': 'pear', 'kers': 'cherry', 'pruim': 'plum', 'perzik': 'peach',
        'broccoli': 'broccoli', 'bloemkool': 'cauliflower', 'boerenkool': 'kale', 'paksoi': 'bok choy', 'pastinaak': 'parsnip',
        'zonnebloem': 'sunflower', 'tulp': 'tulip', 'roos': 'rose', 'lavendel': 'lavender', 'papaver': 'poppy', 'goudsbloem': 'calendula',
        'madeliefje': 'daisy', 'moestuin': 'vegetable garden', 'tuin': 'garden'
    };

    const qLower = query.toLowerCase().split('(')[0].trim().split(' ')[0]; // Get base word
    const enTerm = translations[qLower] || query;
    const searchQuery = `${enTerm} plant garden`;

    const url = `https://api.unsplash.com/search/photos?query=${encodeURIComponent(searchQuery)}&client_id=${ACCESS_KEY}&per_page=12`;

    try {
        const response = await fetch(url);
        if (!response.ok) throw new Error("Unsplash API fout");

        const data = await response.json();

        if (data && data.results) {
            return data.results.map(r => ({
                url: r.urls?.regular || r.urls?.small,
                source: 'web',
                id: r.id,
                title: r.alt_description || r.description || '',
                description: r.description || '',
                photographer: r.user?.name || '',
                sourceLink: r.user?.links?.html || ''
            }));
        }
        return [];
    } catch (error) {
        console.error("Fout bij ophalen afbeeldingen van Unsplash:", error);
        return [];
    }
}


// --- SETTINGS PANEL HELPERS ---

window.setAppTheme = function(theme) {
    saveAppTheme(theme);
    if (isSettingsOpen) renderSettingsPanel();
};

window.toggleThemeFromPanel = function(checkbox) {
    window.setAppTheme(checkbox?.checked ? 'dark' : 'light');
};

// Calendar-only classification: compare local dates, never alter stored reminders.
function classifyDashboardReminders(items, today = new Date()) {
    const dateKey = date => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
    const todayKey = dateKey(today);
    const end = new Date(today.getFullYear(), today.getMonth(), today.getDate());
    end.setDate(end.getDate() + 7 - ((end.getDay() + 6) % 7));
    const weekEndKey = dateKey(end);
    const open = (Array.isArray(items) ? items : []).filter(item => {
        if (item?.done || typeof item?.date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(item.date)) return false;
        const date = new Date(`${item.date}T00:00:00`);
        return Number.isFinite(date.getTime()) && dateKey(date) === item.date;
    });
    return { todayKey, weekEndKey,
        overdue: open.filter(item => item.date < todayKey),
        current: open.filter(item => item.date >= todayKey && item.date < weekEndKey),
        future: open.filter(item => item.date >= weekEndKey) };
}

