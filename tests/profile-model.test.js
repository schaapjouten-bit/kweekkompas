const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const appSource = fs.readFileSync(path.join(__dirname, '..', 'app-v132.js'), 'utf8');

function sourceBetween(startMarker, endMarker) {
    const start = appSource.indexOf(startMarker);
    const bodyStart = appSource.indexOf('\n', start) + 1;
    const end = appSource.indexOf(endMarker, bodyStart);
    if (start === -1 || end === -1) throw new Error(`Test markers not found: ${startMarker}`);
    return appSource.slice(bodyStart, end);
}

function createStorage(initialValues = {}) {
    const values = new Map(Object.entries(initialValues));
    return {
        get length() {
            return values.size;
        },
        key(index) {
            return Array.from(values.keys())[index] ?? null;
        },
        getItem(key) {
            return values.has(key) ? values.get(key) : null;
        },
        setItem(key, value) {
            values.set(key, String(value));
        },
        removeItem(key) {
            values.delete(key);
        }
    };
}

function loadProfileHooks(storage = createStorage()) {
    const warnings = [];
    const context = {
        localStorage: storage,
        window: {},
        console: { warn: message => warnings.push(message) }
    };
    const helperSource = sourceBetween('// --- SAFE LOCAL STORAGE ---', '// Global State');
    vm.runInNewContext(`${helperSource}
globalThis.__hooks = {
        buildProfileFromOnboarding,
        hasStoredUserProfile,
        loadUserProfile,
        mergeProfileRecords,
        normalizeUserProfile,
        saveUserProfileData,
        shouldStartOnboarding,
        toggleOnboardingGardenPlace
    };`, context);
    return { ...context.__hooks, warnings, context };
}

function loadBackupHooks(storage = createStorage()) {
    const context = {
        localStorage: storage,
        window: {},
        console: { warn: () => {} }
    };
    const helperSource = sourceBetween('// --- SAFE LOCAL STORAGE ---', '// Global State');
    const importSource = sourceBetween('// --- IMPORT / EXPORT SAFETY ---', '// --- DATA MANAGEMENT LOGIC ---');
    vm.runInNewContext(`let seeds = [];
${helperSource}
${importSource}
globalThis.__hooks = { buildBackupPayload, normalizeImportedBackup, restoreBackupData };`, context);
    return { ...context.__hooks, context };
}

test('nieuw onboardingprofiel met Gemengd gebruikt het canonieke profielmodel', () => {
    const storage = createStorage();
    const hooks = loadProfileHooks(storage);
    const profile = hooks.buildProfileFromOnboarding({}, {
        type: 'Gemengd',
        light: 'Volle zon',
        level: 'Ervaren'
    });

    hooks.saveUserProfileData(profile);

    const canonical = JSON.parse(storage.getItem('userProfile'));
    const legacy = JSON.parse(storage.getItem('moestuin_user_profile'));
    assert.equal(canonical.gardenType, 'Gemengd');
    assert.equal(canonical.light, 'Zon');
    assert.equal(canonical.experience, 'Ervaren');
    assert.equal(legacy.level, 'Ervaren');
    assert.equal(storage.getItem('onboarding_type'), 'Gemengd');
    assert.equal(storage.getItem('onboarding_sun'), 'Zon');
    assert.equal(storage.getItem('onboarding_level'), 'Ervaren');
});

test('onboarding bewaart meerdere tuinplekken en kiest een geldige resterende hoofdplek', () => {
    const storage = createStorage();
    const hooks = loadProfileHooks(storage);
    const profile = hooks.buildProfileFromOnboarding({}, {
        places: ['Volle grond', 'Bakken of potten', 'Balkon of terras'],
        primaryPlace: 'Bakken of potten',
        light: 'Zon',
        level: 'Gemiddeld'
    });
    hooks.saveUserProfileData(profile);

    const selection = hooks.toggleOnboardingGardenPlace(profile.gardenPlaces, profile.primaryGardenPlace, 'Bakken of potten');
    assert.deepEqual(JSON.parse(JSON.stringify(selection)), {
        places: ['Volle grond', 'Balkon of terras'],
        primaryPlace: 'Volle grond'
    });
    assert.deepEqual(JSON.parse(storage.getItem('userProfile')).gardenPlaces, ['Volle grond', 'Bakken of potten', 'Balkon of terras']);
    assert.equal(JSON.parse(storage.getItem('userProfile')).gardenType, 'Bakken of potten');
    assert.equal(JSON.parse(storage.getItem('userProfile')).light, 'Zon');
    assert.equal(storage.getItem('onboarding_type'), 'Bakken of potten');
    assert.equal(storage.getItem('onboarding_sun'), 'Zon');
});

test('Later invullen bewaart geen ongeldige onboardingwaarden', () => {
    const storage = createStorage();
    const hooks = loadProfileHooks(storage);
    const profile = hooks.buildProfileFromOnboarding({}, {
        places: [], primaryPlace: '', light: '', level: ''
    });
    hooks.saveUserProfileData(profile);

    const saved = JSON.parse(storage.getItem('userProfile'));
    assert.equal(saved.gardenType, '');
    assert.deepEqual(saved.gardenPlaces, []);
    assert.equal(saved.primaryGardenPlace, '');
    assert.equal(saved.light, '');
    assert.equal(saved.experience, '');
    assert.equal(storage.getItem('onboarding_sun'), null);
    assert.equal(storage.getItem('onboarding_level'), null);
});

test('migreert een profiel dat alleen onder userProfile staat', () => {
    const storage = createStorage({
        userProfile: JSON.stringify({ name: 'Lina', level: 'Gemiddeld', gardenType: 'Balkon' })
    });
    const hooks = loadProfileHooks(storage);
    const profile = hooks.loadUserProfile();

    assert.equal(profile.name, 'Lina');
    assert.equal(profile.gardenType, 'Balkon');
    assert.equal(profile.experience, 'Gemiddeld');
    assert.equal(JSON.parse(storage.getItem('moestuin_user_profile')).level, 'Gemiddeld');
});

test('migreert een profiel dat alleen onder moestuin_user_profile staat', () => {
    const storage = createStorage({
        moestuin_user_profile: JSON.stringify({ name: 'Mila', level: 'Expert', gardenType: 'Volkstuin' })
    });
    const hooks = loadProfileHooks(storage);
    const profile = hooks.loadUserProfile();

    assert.equal(profile.name, 'Mila');
    assert.equal(profile.gardenType, 'Volkstuin');
    assert.equal(profile.experience, 'Expert');
    assert.equal(JSON.parse(storage.getItem('userProfile')).experience, 'Expert');
});

test('promoveert afgeronde onboardingkeuzes naar het canonieke profiel', () => {
    const storage = createStorage({
        onboarding_done: 'true',
        onboarding_type: 'Gemengd',
        onboarding_sun: 'Volle zon',
        onboarding_level: 'Gemiddeld'
    });
    const hooks = loadProfileHooks(storage);
    const profile = hooks.loadUserProfile();

    assert.equal(profile.gardenType, 'Gemengd');
    assert.equal(profile.light, 'Zon');
    assert.equal(profile.experience, 'Gemiddeld');
    assert.equal(JSON.parse(storage.getItem('userProfile')).gardenType, 'Gemengd');
});

test('combineert deels verschillende profielkeys zonder niet-lege waarden te verliezen', () => {
    const storage = createStorage({
        userProfile: JSON.stringify({
            name: 'Canoniek', experience: '', photo: 'data:image/png;base64,AAAA',
            canonicalUnknown: { keep: true }
        }),
        moestuin_user_profile: JSON.stringify({
            name: 'Legacy', climate: 'Warm (Subtropisch)', gardenType: 'Gemengd',
            level: 'Expert', legacyUnknown: 'behouden'
        })
    });
    const hooks = loadProfileHooks(storage);
    const profile = hooks.loadUserProfile();

    assert.equal(profile.name, 'Canoniek');
    assert.equal(profile.climate, 'Warm (Subtropisch)');
    assert.equal(profile.gardenType, 'Gemengd');
    assert.equal(profile.experience, 'Expert');
    assert.equal(profile.photo, 'data:image/png;base64,AAAA');
    assert.deepEqual(JSON.parse(JSON.stringify(profile.canonicalUnknown)), { keep: true });
    assert.equal(profile.legacyUnknown, 'behouden');
});

test('herhaald laden en migreren is idempotent', () => {
    const storage = createStorage({
        moestuin_user_profile: JSON.stringify({ name: 'Noor', level: 'Beginner', gardenType: 'Moestuin' })
    });
    const hooks = loadProfileHooks(storage);
    const first = hooks.loadUserProfile();
    const firstCanonical = storage.getItem('userProfile');
    const second = hooks.loadUserProfile();

    assert.deepEqual(second, first);
    assert.equal(storage.getItem('userProfile'), firstCanonical);
});

test('avatar en onbekende profielvelden blijven behouden bij opslag', () => {
    const storage = createStorage({
        userProfile: JSON.stringify({
            name: 'Ravi', photo: 'data:image/jpeg;base64,BBBB', photoZoom: 1.4,
            photoX: 8, photoY: -3, futurePreference: { compact: true }
        })
    });
    const hooks = loadProfileHooks(storage);
    const profile = hooks.loadUserProfile();

    assert.equal(profile.photo, 'data:image/jpeg;base64,BBBB');
    assert.equal(profile.photoZoom, 1.4);
    assert.equal(profile.photoX, 8);
    assert.equal(profile.photoY, -3);
    assert.deepEqual(JSON.parse(JSON.stringify(profile.futurePreference)), { compact: true });
});

test('profiel blijft behouden via export en herstel', async () => {
    const original = {
        name: 'Sofie', gardenType: 'Gemengd', light: 'Zon', experience: 'Gemiddeld',
        photo: 'data:image/png;base64,CCCC', customNote: 'Eigen profielnotitie'
    };
    const sourceStorage = createStorage({ userProfile: JSON.stringify(original) });
    const sourceHooks = loadBackupHooks(sourceStorage);
    const exported = sourceHooks.buildBackupPayload([]);

    const targetStorage = createStorage();
    const targetHooks = loadBackupHooks(targetStorage);
    const imported = targetHooks.normalizeImportedBackup({ userProfile: exported.userProfile });
    await targetHooks.restoreBackupData(imported);

    assert.deepEqual(JSON.parse(targetStorage.getItem('userProfile')), JSON.parse(JSON.stringify(exported.userProfile)));
    assert.equal(JSON.parse(targetStorage.getItem('moestuin_user_profile')).level, 'Gemiddeld');
    assert.equal(targetStorage.getItem('onboarding_type'), 'Gemengd');
    assert.equal(targetStorage.getItem('onboarding_sun'), 'Zon');
    assert.equal(targetStorage.getItem('onboarding_level'), 'Gemiddeld');
});

test('bestaande gebruiker krijgt geen onboarding opnieuw', () => {
    const storage = createStorage({
        moestuin_user_profile: JSON.stringify({ name: 'Bestaand', gardenType: 'Gemengd' })
    });
    const hooks = loadProfileHooks(storage);

    assert.equal(hooks.shouldStartOnboarding('', false, 0, true), true);
    assert.equal(hooks.hasStoredUserProfile(), true);
    assert.equal(hooks.shouldStartOnboarding('', true, 0, true), false);
    assert.equal(hooks.shouldStartOnboarding('true', false, 0, true), false);
});

test('alleen openen schrijft geen leeg standaardprofiel weg', () => {
    const storage = createStorage();
    const hooks = loadProfileHooks(storage);

    const profile = hooks.loadUserProfile();

    assert.equal(profile.name, '');
    assert.equal(profile.gardenType, '');
    assert.equal(storage.length, 0);
});
