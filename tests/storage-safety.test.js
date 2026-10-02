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

    if (start === -1 || end === -1) {
        throw new Error(`Test markers not found: ${startMarker}`);
    }

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

function createFailOnceStorage(initialValues = {}, failingKey) {
    const storage = createStorage(initialValues);
    let shouldFail = true;
    return {
        get length() {
            return storage.length;
        },
        key(index) {
            return storage.key(index);
        },
        getItem(key) {
            return storage.getItem(key);
        },
        setItem(key, value) {
            if (shouldFail && key === failingKey) {
                shouldFail = false;
                throw new Error('storage write failed');
            }
            storage.setItem(key, value);
        },
        removeItem(key) {
            storage.removeItem(key);
        }
    };
}

function loadStorageHooks(storage) {
    const warnings = [];
    const context = {
        localStorage: storage,
        window: {},
        console: { warn: message => warnings.push(message) }
    };
    const helperSource = sourceBetween('// --- SAFE LOCAL STORAGE ---', '// Global State');

    vm.runInNewContext(`${helperSource}\nglobalThis.__hooks = { readStoredJSON, normalizeStoredArray, normalizeStoredObject, normalizeOnboardingLight };`, context);
    return { ...context.__hooks, warnings };
}

function loadImportHooks(storage = createStorage()) {
    const warnings = [];
    const context = {
        localStorage: storage,
        window: {},
        console: { warn: message => warnings.push(message) }
    };
    const helperSource = sourceBetween('// --- SAFE LOCAL STORAGE ---', '// Global State');
    const importSource = sourceBetween('// --- IMPORT / EXPORT SAFETY ---', '// --- DATA MANAGEMENT LOGIC ---');

    vm.runInNewContext(`let seeds = [];\n${helperSource}\n${importSource}\nglobalThis.__hooks = {
        buildBackupPayload,
        normalizeImportedBackup,
        parseAndNormalizeBackup,
        applyRestoreToLocalStorage,
        confirmBackupRestore,
        getProvidedDatasetLabels,
        restoreBackupData,
        normalizeOnboardingLight
    };`, context);
    return { ...context.__hooks, warnings, context };
}

function createSeed(id = 'seed-1') {
    return {
        id, naam: 'Tomaat', status: 'Voorraad', type: 'Groente', standplaats: 'Zon', water: 'Gemiddeld',
        code: '', beschrijving: '', ervaringen: '', featuredImageUrl: '', image: '', shopLink: '',
        zaaitijd: '', oogsttijd: '', tags: [], images: [], isFavorite: false,
        fase_gezaaid: false, fase_groeit: false, fase_geoogst: false, ervaringScore: 0,
        purchaseYear: null, lastSownYear: null
    };
}

function createFakeDatabase(initialSeeds, { failWrites = false } = {}) {
    let committed = initialSeeds.map(seed => ({ ...seed }));

    return {
        objectStoreNames: { contains: () => true },
        transaction() {
            const working = committed.map(seed => ({ ...seed }));
            const transaction = {
                error: null,
                oncomplete: null,
                onerror: null,
                onabort: null,
                objectStore() {
                    return {
                        clear() {
                            working.length = 0;
                        },
                        put(seed) {
                            if (failWrites) {
                                transaction.error = new Error('write failed');
                                return;
                            }
                            const index = working.findIndex(item => String(item.id) === String(seed.id));
                            if (index === -1) working.push({ ...seed });
                            else working[index] = { ...seed };
                        }
                    };
                },
                abort() {
                    transaction.error = transaction.error || new Error('aborted');
                    transaction.onabort?.();
                }
            };

            queueMicrotask(() => {
                if (failWrites) transaction.onabort?.();
                else {
                    committed = working;
                    transaction.oncomplete?.();
                }
            });
            return transaction;
        },
        getCommitted() {
            return committed.map(seed => ({ ...seed }));
        }
    };
}

async function loadAtomicDatabaseHook(database) {
    const context = {
        indexedDB: {
            open() {
                const request = {};
                queueMicrotask(() => request.onsuccess?.({ target: { result: database } }));
                return request;
            }
        },
        console: { warn: () => {} }
    };
    const dbSource = sourceBetween('// --- INDEXED DB WRAPPER ---', "document.addEventListener('DOMContentLoaded'");
    vm.runInNewContext(`${dbSource}\nglobalThis.__hooks = { initDB, replaceAllSeedsAtomic };`, context);
    await context.__hooks.initDB();
    return context.__hooks.replaceAllSeedsAtomic;
}

test('leest geldige JSON zonder gegevens te wijzigen', () => {
    const storage = createStorage({ profile: '{"name":"Lina"}' });
    const { readStoredJSON, normalizeStoredObject, warnings } = loadStorageHooks(storage);

    const value = readStoredJSON('profile', {}, normalizeStoredObject);

    assert.deepEqual(JSON.parse(JSON.stringify(value)), { name: 'Lina' });
    assert.equal(storage.getItem('profile'), '{"name":"Lina"}');
    assert.equal(warnings.length, 0);
});

test('valt bij ongeldige JSON terug zonder opgeslagen data te overschrijven', () => {
    const storage = createStorage({ reminders: '{geen-json' });
    const { readStoredJSON, normalizeStoredArray, warnings } = loadStorageHooks(storage);

    const value = readStoredJSON('reminders', [], normalizeStoredArray);

    assert.deepEqual(JSON.parse(JSON.stringify(value)), []);
    assert.equal(storage.getItem('reminders'), '{geen-json');
    assert.equal(warnings.length, 1);
});

test('geeft fallback terug wanneer een key ontbreekt', () => {
    const storage = createStorage();
    const { readStoredJSON, normalizeStoredArray, warnings } = loadStorageHooks(storage);

    const value = readStoredJSON('wishlist', [], normalizeStoredArray);

    assert.deepEqual(JSON.parse(JSON.stringify(value)), []);
    assert.equal(warnings.length, 0);
});

test('valt terug bij een verkeerd opgeslagen datatype', () => {
    const storage = createStorage({ wishlist: '{"name":"geen array"}' });
    const { readStoredJSON, normalizeStoredArray, warnings } = loadStorageHooks(storage);

    const value = readStoredJSON('wishlist', [], normalizeStoredArray);

    assert.deepEqual(JSON.parse(JSON.stringify(value)), []);
    assert.equal(storage.getItem('wishlist'), '{"name":"geen array"}');
    assert.equal(warnings.length, 1);
});

test('normaliseert onboardingwaarde Volle zon naar de canonieke standplaats Zon', () => {
    const { normalizeOnboardingLight } = loadStorageHooks();

    assert.equal(normalizeOnboardingLight('Volle zon'), 'Zon');
    assert.equal(normalizeOnboardingLight('Halfschaduw'), 'Halfschaduw');
});

test('IndexedDB-falen laat getAllSeeds veilig falen', async () => {
    const dbSource = sourceBetween('// --- INDEXED DB WRAPPER ---', "document.addEventListener('DOMContentLoaded'");
    const context = {
        indexedDB: { open: () => { throw new Error('IndexedDB unavailable'); } },
        console: { warn: () => {} }
    };

    vm.runInNewContext(`${dbSource}\nglobalThis.__hooks = { initDB, getAllSeeds };`, context);

    await assert.rejects(context.__hooks.initDB(), /IndexedDB unavailable/);
    await assert.rejects(context.__hooks.getAllSeeds(), /Lokale database is niet beschikbaar/);
});

test('accepteert een geldige oude backup zonder backupVersion', () => {
    const { normalizeImportedBackup } = loadImportHooks();
    const value = normalizeImportedBackup({ seeds: [createSeed()] });

    assert.equal(value.backupVersion, 1);
    assert.deepEqual(JSON.parse(JSON.stringify(value.seeds)), [createSeed()]);
});

test('weigert een geïmporteerd zaad zonder type', () => {
    const storage = createStorage({ userProfile: '{"name":"Lina"}' });
    const { normalizeImportedBackup } = loadImportHooks(storage);
    const invalidSeed = { id: 'seed-1', naam: 'Tomaat', status: 'Voorraad' };

    assert.throws(
        () => normalizeImportedBackup({ seeds: [invalidSeed] }),
        error => error.name === 'BackupValidationError' && /type/.test(error.message)
    );
    assert.throws(
        () => normalizeImportedBackup({ seeds: [{ ...createSeed(), type: 'Onbekend type' }] }),
        error => error.name === 'BackupValidationError' && /type/.test(error.message)
    );
    assert.equal(storage.getItem('userProfile'), '{"name":"Lina"}');
});

test('weigert een geïmporteerd zaad met een verkeerd veldtype', () => {
    const { normalizeImportedBackup } = loadImportHooks();
    const invalidSeed = { ...createSeed(), water: { value: 'Gemiddeld' } };

    assert.throws(
        () => normalizeImportedBackup({ seeds: [invalidSeed] }),
        error => error.name === 'BackupValidationError' && /water/.test(error.message)
    );
});

test('vult ontbrekende optionele seedvelden veilig aan voor de kaartweergave', () => {
    const { normalizeImportedBackup } = loadImportHooks();
    const value = normalizeImportedBackup({
        seeds: [{ id: 'seed-1', naam: 'Tomaat', type: 'Groente', status: 'Voorraad' }]
    });
    const seed = value.seeds[0];

    assert.equal(seed.type.toLowerCase(), 'groente');
    assert.equal(seed.status.toLowerCase(), 'voorraad');
    assert.equal(seed.standplaats, 'Zon');
    assert.equal(seed.water, 'Gemiddeld');
    assert.deepEqual(JSON.parse(JSON.stringify(seed.tags)), []);
    assert.deepEqual(JSON.parse(JSON.stringify(seed.images)), []);
});

test('accepteert een geldige versie-1-backup', () => {
    const { parseAndNormalizeBackup } = loadImportHooks();
    const value = parseAndNormalizeBackup(JSON.stringify({
        backupVersion: 1,
        seeds: [createSeed()],
        wishlist: [{ id: 'wish-1', name: 'Basilicum' }],
        reminders: [{ id: 'rem-1', title: 'Water geven', date: '2026-08-03' }]
    }));

    assert.equal(value.backupVersion, 1);
    assert.equal(value.wishlist[0].name, 'Basilicum');
    assert.equal(value.reminders[0].title, 'Water geven');
});

test('actuele exports gebruiken backupversie 1', () => {
    const { buildBackupPayload } = loadImportHooks();
    const value = buildBackupPayload([createSeed()]);

    assert.equal(value.backupVersion, 1);
});

test('herstelt een oudere backup met Volle zon als Zon', async () => {
    const hooks = loadImportHooks();
    const legacySeed = { ...createSeed('legacy-sun'), standplaats: 'Volle zon' };
    const backup = hooks.normalizeImportedBackup({ seeds: [legacySeed] });
    let restoredSeeds = null;

    hooks.context.getAllSeeds = async () => [createSeed('existing')];
    hooks.context.replaceAllSeedsAtomic = async seeds => { restoredSeeds = seeds; };

    await hooks.restoreBackupData(backup);

    assert.equal(backup.seeds[0].standplaats, 'Zon');
    assert.equal(restoredSeeds[0].standplaats, 'Zon');
    assert.equal(restoredSeeds[0].id, 'legacy-sun');
});

test('export en herstel behouden foto en eigen notities', () => {
    const { buildBackupPayload, normalizeImportedBackup } = loadImportHooks();
    const original = {
        ...createSeed('photo-notes'),
        standplaats: 'Volle zon',
        featuredImageUrl: 'https://images.example.test/tomaat.jpg',
        beschrijving: 'Eigen teeltinformatie',
        ervaringen: 'Mijn eigen notitie',
        images: [{ url: 'data:image/png;base64,AAAA', source: 'upload' }]
    };

    const exported = buildBackupPayload([original]);
    const imported = normalizeImportedBackup(JSON.parse(JSON.stringify(exported)));
    const expected = { ...original, standplaats: 'Zon' };

    assert.deepEqual(JSON.parse(JSON.stringify(imported.seeds)), [expected]);
});

test('weigert ongeldige standplaats zonder bestaande data te wijzigen', () => {
    const storage = createStorage({
        userProfile: '{"name":"Lina"}',
        moestuin_wishlist: '[{"name":"Basilicum"}]'
    });
    const { parseAndNormalizeBackup } = loadImportHooks(storage);
    const invalidSeed = { ...createSeed('invalid-sun'), standplaats: 'Zonnig' };

    assert.throws(
        () => parseAndNormalizeBackup(JSON.stringify({ seeds: [invalidSeed] })),
        error => error.name === 'BackupValidationError' && /standplaats/.test(error.message)
    );
    assert.equal(storage.getItem('userProfile'), '{"name":"Lina"}');
    assert.equal(storage.getItem('moestuin_wishlist'), '[{"name":"Basilicum"}]');
});

test('gedeeltelijke wishlist-import vervangt alleen de aangeleverde dataset', async () => {
    const storage = createStorage({
        moestuin_wishlist: '[{"id":"old-wish","name":"Oude wens"}]',
        userProfile: '{"name":"Lina"}',
        moestuin_user_profile: '{"name":"Lina"}',
        moestuin_reminders: '[{"id":"rem-1","title":"Water geven","date":"2026-08-03"}]'
    });
    const hooks = loadImportHooks(storage);
    const existingSeeds = [createSeed('existing')];
    let seedReplacementCount = 0;
    hooks.context.getAllSeeds = async () => existingSeeds;
    hooks.context.replaceAllSeedsAtomic = async () => { seedReplacementCount += 1; };

    const backup = hooks.normalizeImportedBackup({ wishlist: [] });
    await hooks.restoreBackupData(backup);

    assert.equal(storage.getItem('moestuin_wishlist'), '[]');
    assert.equal(storage.getItem('userProfile'), '{"name":"Lina"}');
    assert.equal(storage.getItem('moestuin_reminders'), '[{"id":"rem-1","title":"Water geven","date":"2026-08-03"}]');
    assert.equal(seedReplacementCount, 0);
});

test('export en herstel behouden meerdere reminders, status, IDs en onbekende velden', async () => {
    const reminders = [
        {
            id: 'rem-1', date: '2026-08-03', title: 'Water geven', done: false,
            note: 'Ook de kas controleren', futureField: { source: 'planner-v2' }
        },
        {
            id: 1700000000000, date: '2026-08-04', title: 'Oogsten', done: true,
            note: 'Tomaten plukken'
        }
    ];
    const legacyCalendar = { '2026-08-02': ['seed-legacy'] };
    const storage = createStorage({
        moestuin_calendar: JSON.stringify(legacyCalendar),
        moestuin_reminders: JSON.stringify(reminders)
    });
    const hooks = loadImportHooks(storage);
    const exported = hooks.buildBackupPayload([]);
    const imported = hooks.normalizeImportedBackup(JSON.parse(JSON.stringify(exported)));

    assert.deepEqual(JSON.parse(JSON.stringify(imported.calendar)), legacyCalendar);
    assert.deepEqual(JSON.parse(JSON.stringify(imported.reminders)), reminders);

    const restoredStorage = createStorage();
    const restoreHooks = loadImportHooks(restoredStorage);
    await restoreHooks.restoreBackupData(restoreHooks.normalizeImportedBackup({ reminders: imported.reminders }));
    assert.deepEqual(JSON.parse(restoredStorage.getItem('moestuin_reminders')), reminders);
});

test('backup zonder reminderdataset laat bestaande reminders ongemoeid', async () => {
    const existing = [{ id: 'old-reminder', date: '2026-08-01', title: 'Bestaand', done: true }];
    const storage = createStorage({ moestuin_reminders: JSON.stringify(existing) });
    const hooks = loadImportHooks(storage);

    await hooks.restoreBackupData(hooks.normalizeImportedBackup({ wishlist: [] }));

    assert.equal(storage.getItem('moestuin_reminders'), JSON.stringify(existing));
});

test('ouder backupformaat met alleen moestuin_calendar blijft compatibel', async () => {
    const calendar = { '2026-08-03': ['seed-1'] };
    const storage = createStorage();
    const hooks = loadImportHooks(storage);
    const backup = hooks.normalizeImportedBackup({ moestuin_calendar: calendar });

    await hooks.restoreBackupData(backup);

    assert.deepEqual(JSON.parse(storage.getItem('moestuin_calendar')), calendar);
    assert.equal(storage.getItem('moestuin_reminders'), null);
});

test('rollback herstelt reminders wanneer een reminder-write faalt', async () => {
    const existing = [{ id: 'old-reminder', date: '2026-08-01', title: 'Bestaand', done: true }];
    const storage = createFailOnceStorage({ moestuin_reminders: JSON.stringify(existing) }, 'moestuin_reminders');
    const hooks = loadImportHooks(storage);
    const backup = hooks.normalizeImportedBackup({
        reminders: [{ id: 'new-reminder', date: '2026-08-02', title: 'Nieuw', done: false }]
    });

    await assert.rejects(hooks.restoreBackupData(backup), /storage write failed/);
    assert.equal(storage.getItem('moestuin_reminders'), JSON.stringify(existing));
});

test('weigert ongeldige reminderdata zonder bestaande gegevens te wijzigen', () => {
    const existing = [{ id: 'old-reminder', date: '2026-08-01', title: 'Bestaand', done: true }];
    const storage = createStorage({
        moestuin_reminders: JSON.stringify(existing),
        userProfile: '{"name":"Lina"}'
    });
    const hooks = loadImportHooks(storage);

    assert.throws(
        () => hooks.parseAndNormalizeBackup(JSON.stringify({
            reminders: [{ id: 'bad-reminder', date: '2026-08-02', title: 'Ongeldig', done: 'ja' }]
        })),
        error => error.name === 'BackupValidationError' && /done/.test(error.message)
    );
    assert.equal(storage.getItem('moestuin_reminders'), JSON.stringify(existing));
    assert.equal(storage.getItem('userProfile'), '{"name":"Lina"}');
});

test('weigert ongeldige JSON zonder gegevens te wijzigen', () => {
    const storage = createStorage({ userProfile: '{"name":"Lina"}' });
    const { parseAndNormalizeBackup } = loadImportHooks(storage);
    assert.throws(() => parseAndNormalizeBackup('{geen-json'), { name: 'BackupValidationError' });
    assert.equal(storage.getItem('userProfile'), '{"name":"Lina"}');
});

test('annuleren meldt de te vervangen datasets en wijzigt niets', () => {
    const storage = createStorage({ moestuin_wishlist: '[{"name":"Oude wens"}]' });
    const hooks = loadImportHooks(storage);
    const backup = hooks.normalizeImportedBackup({ wishlist: [] });
    let askedMessage = '';

    const confirmed = hooks.confirmBackupRestore(backup, message => {
        askedMessage = message;
        return false;
    });

    assert.equal(confirmed, false);
    assert.match(askedMessage, /wishlist/);
    assert.equal(storage.getItem('moestuin_wishlist'), '[{"name":"Oude wens"}]');
});

test('weigert een verkeerd rootdatatype', () => {
    const { normalizeImportedBackup } = loadImportHooks();
    assert.throws(() => normalizeImportedBackup('geen object'), { name: 'BackupValidationError' });
});

test('weigert verkeerde datasettypen', () => {
    const { normalizeImportedBackup } = loadImportHooks();
    assert.throws(() => normalizeImportedBackup({ seeds: {} }), { name: 'BackupValidationError' });
});

test('weigert dubbele IDs binnen een dataset', () => {
    const { normalizeImportedBackup } = loadImportHooks();
    assert.throws(() => normalizeImportedBackup({ seeds: [createSeed('same'), createSeed('same')] }), { name: 'BackupValidationError' });
});

test('weigert een lege backup', () => {
    const { normalizeImportedBackup } = loadImportHooks();
    assert.throws(() => normalizeImportedBackup({}), { name: 'BackupValidationError' });
    assert.throws(() => normalizeImportedBackup([]), { name: 'BackupValidationError' });
});

test('weigert een niet-ondersteunde toekomstige backupversie vóór mutaties', () => {
    const storage = createStorage({
        userProfile: '{"name":"Bestaand"}',
        moestuin_reminders: '[{"id":"old","title":"Bestaand","date":"2026-08-01"}]'
    });
    const { parseAndNormalizeBackup } = loadImportHooks(storage);

    assert.throws(
        () => parseAndNormalizeBackup(JSON.stringify({ backupVersion: 2, seeds: [] })),
        error => error.name === 'BackupValidationError' && /nieuwer dan deze app ondersteunt/.test(error.message)
    );
    assert.equal(storage.getItem('userProfile'), '{"name":"Bestaand"}');
    assert.equal(storage.getItem('moestuin_reminders'), '[{"id":"old","title":"Bestaand","date":"2026-08-01"}]');
});

test('export en import round-trip behouden relevante data', () => {
    const storage = createStorage({
        moestuin_calendar: '{"2026-08-03":["seed-1"]}',
        moestuin_wishlist: '[{"id":"wish-1","name":"Basilicum"}]',
        moestuin_reminders: '[{"id":"rem-1","title":"Water geven","date":"2026-08-03"}]'
    });
    const { buildBackupPayload, normalizeImportedBackup } = loadImportHooks(storage);
    const original = { seeds: [createSeed()], calendar: { '2026-08-03': ['seed-1'] } };
    const exported = buildBackupPayload(original.seeds);
    const imported = normalizeImportedBackup(JSON.parse(JSON.stringify(exported)));

    assert.deepEqual(JSON.parse(JSON.stringify(imported.seeds)), original.seeds);
    assert.deepEqual(JSON.parse(JSON.stringify(imported.calendar)), original.calendar);
    assert.deepEqual(JSON.parse(JSON.stringify(imported.wishlist)), [{ id: 'wish-1', name: 'Basilicum' }]);
});

test('mislukte IndexedDB-schrijfactie laat geen gedeeltelijke import achter', async () => {
    const database = createFakeDatabase([createSeed('old')], { failWrites: true });
    const replaceAllSeedsAtomic = await loadAtomicDatabaseHook(database);

    await assert.rejects(replaceAllSeedsAtomic([createSeed('new-1'), createSeed('new-2')]));
    assert.deepEqual(database.getCommitted(), [createSeed('old')]);
});

test('volledig herstel laat geen oude IndexedDB-records achter', async () => {
    const database = createFakeDatabase([createSeed('old')]);
    const replaceAllSeedsAtomic = await loadAtomicDatabaseHook(database);

    await replaceAllSeedsAtomic([createSeed('new-1')]);
    assert.deepEqual(database.getCommitted(), [createSeed('new-1')]);
});
