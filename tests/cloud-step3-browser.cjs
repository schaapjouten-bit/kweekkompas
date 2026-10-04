// Two independent temporary browsers against the real local backend and HTTP
// Supabase fixtures. Never authenticates to or writes to the real project.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { chromium } = require('playwright');
const { createServer } = require('../scripts/dev-server.cjs');
const { startFixtures } = require('./service-fixtures.cjs');
const photos = require('../photo-storage');
const root = path.resolve(__dirname, '..');
const sourceHash = () => crypto.createHash('sha256').update(fs.readFileSync(path.join(root, 'laatste.json'))).digest('hex');
const originalHash = sourceHash();
const output = path.join(root, 'scratch/cloud-step3');
const photo = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aX1kAAAAASUVORK5CYII=';
const payload = name => ({ backupVersion: 1,
    seeds: [{ id: 'isolated', naam: name, type: 'Groente', status: 'Groeit', images: [{ url: photo }], featuredImageUrl: photo, isFavorite: true, ervaringen: 'Isolated private note', plant_months: [5], fase_groeit: true }],
    calendar: { '2026-10-03': ['Planning fixture'] },
    reminders: [{ id: 1, title: 'Testtaak', date: '2026-10-03', done: false }],
    wishlist: [{ id: 'w', name: 'Testwens', type: 'item', image: photo }],
    userProfile: { name: 'Isolated profile', gardenType: 'Balkon', experience: 'Beginner', photo, units: 'Metric' },
    dailyProgress: { date: '2026-10-03', count: 2 }
});
const report = { simulated: [], uploads: 0, errors: [], liveWrites: 0 };
(async () => {
    const fixture = await startFixtures();
    Object.assign(process.env, { SUPABASE_URL: fixture.base, SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_fixture', KWEEK_LOCAL_DEV: 'true' });
    const server = createServer(); await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    const base = `http://127.0.0.1:${server.address().port}`;
    const browser = await chromium.launch(); fs.mkdirSync(output, { recursive: true });
    async function pageFor(width) {
        const context = await browser.newContext({ viewport: { width, height: 1000 }, timezoneId: 'Europe/Amsterdam' });
        await context.addInitScript(width => {
            localStorage.setItem('onboarding_done', 'true');
            sessionStorage.setItem('kweekkompas_account_choice', 'local');
            if (!localStorage.getItem('userProfile')) localStorage.setItem('userProfile', JSON.stringify({ name: 'Isolated', gardenType: 'Balkon', experience: 'Beginner' }));
            localStorage.setItem('kweekkompas_ai', JSON.stringify(width === 1440 ? { provider: 'gemini', model: 'gemini-3.8-flash' } : { provider: 'ollama', model: 'fixture-model' }));
        }, width);
        await context.route('**/*', route => {
            const url = new URL(route.request().url());
            if (url.origin !== base && url.origin !== fixture.base && !url.protocol.startsWith('data')) return route.abort();
            if (url.pathname === '/api/ai-config') return route.fulfill({ json: { defaultProvider: 'ollama', providers: { ollama: { configured: false, label: 'Ollama', model: 'fixture-model' } } } });
            if (/\/api\/(ai-models|seed-info|tuinassistent|gemini-ai)/.test(url.pathname)) return route.abort();
            if (url.pathname === '/api/cloud-sync' && route.request().method() === 'POST') report.uploads++;
            return route.continue();
        });
        const page = await context.newPage(); page.on('pageerror', error => report.errors.push(error.message));
        // Keep the fixture's daily progress on its specified day.
        await page.clock.setFixedTime(new Date('2026-10-03T12:00:00+02:00'));
        await page.goto(base); await page.waitForFunction(() => window.KweekLocalData);
        return { page, context };
    }
    const capture = page => page.evaluate(() => window.KweekLocalData.capture());
    const cloudCapture = page => page.evaluate(() => window.KweekLocalData.captureCloud());
    async function open(page) {
        await page.evaluate(() => window.openSettingsSection('cloud'));
        await page.waitForSelector('#cloud-login-status', { state: 'attached' });
        await page.waitForFunction(() => document.getElementById('cloud-login-status').textContent.length > 0 && !document.getElementById('cloud-status').textContent.includes('laden'));
        await page.locator('#cloud-details').evaluate(el => { el.open = true; });
    }
    async function login(page) {
        await open(page); await page.click('#cloud-open-account'); await page.fill('#cloud-email', 'a@example.test'); await page.fill('#cloud-password', 'test-password');
        await page.click('#cloud-auth-submit');
        await page.waitForFunction(() => document.getElementById('cloud-login-status').textContent.includes('Ingelogd als'));
        await page.waitForFunction(() => !document.querySelector('#account-popup[open]') && document.getElementById('cloud-status').textContent.length > 0 && !document.getElementById('cloud-status').textContent.includes('laden'));
        await page.locator('#cloud-details').evaluate(el => { el.open = true; });
    }
    async function action(page, kind, dialog = true, choose = false) {
        const accept = d => d.accept();
        if (dialog) page.once('dialog', accept);
        await page.locator(`${choose ? '#cloud-conflict-actions' : kind === 'status' ? '#cloud-details' : '#cloud-actions'} [data-cloud-action="${kind}"]`).click();
        await page.waitForTimeout(80); // Web Locks acquires asynchronously before buttons disable.
        await page.waitForFunction(() => !document.querySelector('#cloud-actions button:disabled'));
        page.off('dialog', accept);
    }
    async function edit(page, name) {
        await page.evaluate(async name => { const seed = (await window.KweekLocalData.capture()).seeds.find(seed => seed.id === 'isolated'); await saveSeed({ ...seed, naam: name }); }, name);
    }
    try {
        const a = await pageFor(1440), b = await pageFor(390);
        await a.page.evaluate(payload => window.KweekLocalData.restore(payload), payload('Device A'));
        await b.page.evaluate(payload => window.KweekLocalData.restore({ ...payload, theme: 'dark', userProfile: { ...payload.userProfile, name: 'Device B profile', units: 'Imperial' } }), payload('Device B'));
        const bOriginal = await capture(b.page);
        await Promise.all([login(a.page), login(b.page)]);
        assert.deepEqual(await a.page.evaluate(() => JSON.parse(localStorage.getItem('kweekkompas_ai'))), { provider: 'gemini', model: 'gemini-3.8-flash' });
        assert.deepEqual(await b.page.evaluate(() => JSON.parse(localStorage.getItem('kweekkompas_ai'))), { provider: 'ollama', model: 'fixture-model' });
        assert.equal(fixture.snapshots.size, 0); assert.equal(report.uploads, 0);
        // Sample loading is local even while logged in.
        await a.page.evaluate(() => window.openSettingsSection('storage'));
        await a.page.waitForSelector('[data-collection-id="kruiden-in-potten"]:enabled');
        a.page.once('dialog', d => d.accept()); await a.page.click('[data-collection-id="kruiden-in-potten"]');
        await a.page.waitForFunction(() => document.getElementById('example-garden-status').textContent.includes('voorbeeldplanten toegevoegd'));
        assert.equal(report.uploads, 0);
        await a.page.evaluate(() => window.openSettingsSection('cloud'));
        await action(a.page, 'upload');
        assert.deepEqual(await a.page.evaluate(() => JSON.parse(localStorage.getItem('kweekkompas_ai'))), { provider: 'gemini', model: 'gemini-3.8-flash' });
        await a.page.waitForFunction(() => document.getElementById('cloud-local-status').textContent.includes('Geen lokale wijzigingen'));
        const uploaded = fixture.snapshots.get(fixture.ids.a);
        const uploadedLocal = await cloudCapture(a.page);
        assert.equal(uploaded.revision, 1); assert.deepEqual(uploaded.payload, (await photos.prepare(uploadedLocal, fixture.ids.a)).payload);
        assert.equal(uploaded.payload.seeds.find(seed => seed.id === 'isolated').isFavorite, true);
        assert.match(uploaded.payload.seeds.find(seed => seed.id === 'isolated').images[0].url, /^supabase-photo:/);
        assert.match(uploaded.payload.userProfile.photo, /^supabase-photo:/);
        assert.equal(fixture.objects.size, 1); assert.equal(fixture.storage.uploads, 1);
        assert(!JSON.stringify(uploaded.payload).includes('data:image'));
        assert.deepEqual(Object.keys(uploaded.payload).sort(), ['backupVersion', 'calendar', 'dailyProgress', 'reminders', 'seeds', 'userProfile', 'wishlist']);
        assert(!JSON.stringify(uploaded.payload).includes('fixture-model'));
        await a.page.evaluate(() => {
            localStorage.setItem('theme', 'dark'); localStorage.setItem('layout_width', 'wide');
            localStorage.setItem('moestuin_settings', JSON.stringify({ deviceOnly: true, apiKey: 'isolated-secret' }));
            saveUserProfileData({ ...loadUserProfile(), units: 'Imperial' });
        });
        await a.page.waitForFunction(() => document.getElementById('cloud-local-status').textContent.includes('Geen lokale wijzigingen'));
        assert.deepEqual(await cloudCapture(a.page), uploadedLocal);
        fixture.storage.expireDownloadOnce = true;
        await action(b.page, 'download'); await b.page.waitForSelector('#view-home:not(.hidden)'); await open(b.page);
        assert.deepEqual(await cloudCapture(b.page), uploadedLocal);
        const downloaded = await capture(b.page); assert.equal(downloaded.theme, 'dark'); assert.equal(downloaded.userProfile.units, 'Imperial');
        assert.equal(await b.page.evaluate(() => localStorage.getItem('kweekkompas_ai')), JSON.stringify({ provider: 'ollama', model: 'fixture-model' }));
        const savedSafety = await b.page.evaluate(() => new Promise((resolve, reject) => {
            const r = indexedDB.open('KweekKompasSafety', 1); r.onerror = reject; r.onsuccess = () => {
                const db = r.result; const tx = db.transaction('backups', 'readonly'); const get = tx.objectStore('backups').get('before-cloud-restore'); tx.oncomplete = () => { resolve(get.result); db.close(); };
            };
        }));
        assert.deepEqual(savedSafety.payload.seeds, bOriginal.seeds); assert.equal(savedSafety.payload.userProfile.units, 'Imperial');
        assert.match(await b.page.locator('#cloud-last-sync').innerText(), /teruggehaald, versie 1/);
        // A downloaded backup must work with every network connection disabled.
        await b.page.evaluate(() => window.openSettingsSection('storage'));
        const backupDownload = b.page.waitForEvent('download');
        await b.page.getByRole('button', { name: 'Back-up downloaden', exact: true }).click();
        const backupFile = await (await backupDownload).path();
        const backup = JSON.parse(fs.readFileSync(backupFile, 'utf8'));
        assert(!JSON.stringify(backup).includes(photos.PREFIX));
        assert(!JSON.stringify(backup).includes('/object/sign/'));
        assert.match(backup.wishlist[0].image, /^data:image/);
        assert.match(backup.userProfile.photo, /^data:image/);
        const offlineBackup = await pageFor(390);
        await offlineBackup.context.setOffline(true);
        await offlineBackup.page.evaluate(value => window.KweekLocalData.restore(value), backup);
        assert.deepEqual(await cloudCapture(offlineBackup.page), uploadedLocal);
        await offlineBackup.page.evaluate(async () => {
            const value = await window.KweekLocalData.capture();
            for (const { object, key } of window.KweekPhotoStorage.slots(value)) {
                if (!object[key].startsWith('data:image')) continue;
                await new Promise((resolve, reject) => { const image = new Image(); image.onload = resolve; image.onerror = reject; image.src = object[key]; });
            }
        });
        await offlineBackup.context.close(); await open(b.page);
        report.simulated.push('Werkelijk gedownloade JSON-back-up bevat foto’s; apart browserprofiel herstelt en decodeert alle ingebedde foto’s met netwerk volledig uit');
        report.simulated.push('Login en voorbeeldcollecties uploaden niets; volledige tuin/foto’s/favorieten/planning/verlanglijst/profiel via upload en terughalen; device-instellingen behouden; veiligheidskopie en laatste sync blijven na herladen bewaard');

        await edit(a.page, 'Device A revision 2'); await action(a.page, 'upload'); assert.equal(fixture.snapshots.get(fixture.ids.a).revision, 2);
        assert.equal(fixture.storage.uploads, 1);
        await edit(b.page, 'Device B conflicting edit');
        await b.page.waitForFunction(() => document.getElementById('cloud-local-status').textContent.includes('Lokale wijzigingen:'));
        const conflictBefore = await capture(b.page);
        await action(b.page, 'upload'); assert.equal(fixture.snapshots.get(fixture.ids.a).revision, 2); assert.deepEqual(await capture(b.page), conflictBefore);
        assert(await b.page.locator('#cloud-conflict-actions').isVisible());
        await b.page.reload(); await b.page.waitForSelector('#view-home:not(.hidden)'); await open(b.page);
        assert(await b.page.locator('#cloud-conflict-actions').isVisible());
        const writesBefore = report.uploads; assert(await b.page.locator('#cloud-actions').isHidden()); assert.equal(report.uploads, writesBefore);
        await action(b.page, 'replace', true, true); assert.equal(fixture.snapshots.get(fixture.ids.a).revision, 3);
        assert.equal(fixture.snapshots.get(fixture.ids.a).payload.seeds.find(seed => seed.id === 'isolated').naam, 'Device B conflicting edit');
        assert(await b.page.locator('#cloud-conflict-actions').isHidden());
        report.simulated.push('Twee browsers: oude revisie geweigerd zonder lokaal verlies; conflict na herladen behouden; gewone upload geblokkeerd; expliciete keuze schrijft met nieuwe revisiecontrole');

        await edit(b.page, 'Device B offline edit'); const offlineBefore = await capture(b.page); const revisionBefore = fixture.snapshots.get(fixture.ids.a).revision;
        await b.page.route('**/api/cloud-sync', route => route.abort());
        await action(b.page, 'upload'); assert.match(await b.page.locator('#cloud-error-detail').innerText(), /Geen verbinding/);
        assert.deepEqual(await capture(b.page), offlineBefore); assert.equal(fixture.snapshots.get(fixture.ids.a).revision, revisionBefore);
        await action(b.page, 'download', false); assert.deepEqual(await capture(b.page), offlineBefore);
        await b.page.reload(); await b.page.waitForSelector('#view-home:not(.hidden)'); assert.deepEqual((await capture(b.page)).seeds, offlineBefore.seeds);
        await open(b.page); assert.match(await b.page.locator('#cloud-local-status').innerText(), /Lokale wijzigingen/);
        await b.page.unroute('**/api/cloud-sync'); await action(b.page, 'status', false);
        report.simulated.push('Netwerkuitval bij upload en terughalen: lokale gegevens en laatste sync behouden, ook na herladen; geen databasewijziging');

        // Invalid cloud data must not touch local storage or the previous safety copy.
        const validPayload = fixture.snapshots.get(fixture.ids.a).payload;
        fixture.snapshots.get(fixture.ids.a).payload = { backupVersion: 1, seeds: [{ id: 'broken', naam: '' }] };
        await action(b.page, 'download', false); assert.match(await b.page.locator('#cloud-error-detail').innerText(), /ongeldige tuingegevens/); assert.deepEqual(await capture(b.page), offlineBefore);
        fixture.snapshots.get(fixture.ids.a).payload = validPayload;
        await b.page.evaluate(() => {
            window.originalIDBOpen = indexedDB.open.bind(indexedDB);
            indexedDB.open = function(name, ...args) {
                if (name !== 'KweekKompasSafety') return window.originalIDBOpen(name, ...args);
                const request = {}; setTimeout(() => request.onerror?.(), 0); return request;
            };
        });
        await action(b.page, 'download'); assert.match(await b.page.locator('#cloud-error-detail').innerText(), /veiligheidskopie/); assert.deepEqual(await capture(b.page), offlineBefore);
        await b.page.evaluate(() => { indexedDB.open = window.originalIDBOpen; });
        report.simulated.push('Ongeldige cloudtuin en mislukte veiligheidskopie blokkeren herstel vóór lokale vervanging');

        const objectPath = [...fixture.objects.keys()][0], savedObject = fixture.objects.get(objectPath);
        fixture.objects.delete(objectPath);
        await action(b.page, 'download'); assert.match(await b.page.locator('#cloud-error-detail').innerText(), /cloudfoto ontbreekt/); assert.deepEqual(await capture(b.page), offlineBefore);
        fixture.objects.set(objectPath, savedObject);
        await b.page.route(fixture.base + '/storage/v1/object/sign/**', route => route.abort());
        await action(b.page, 'download'); assert.match(await b.page.locator('#cloud-error-detail').innerText(), /verbindingsfout/); assert.deepEqual(await capture(b.page), offlineBefore);
        await b.page.unroute(fixture.base + '/storage/v1/object/sign/**');
        report.simulated.push('Ontbrekende cloudfoto en netwerkuitval tijdens fotodownload blokkeren volledige vervanging; tijdelijke toegang eenmaal vernieuwd');
        await b.page.evaluate(async () => { const seed = (await window.KweekLocalData.capture()).seeds.find(seed => seed.id === 'isolated'); await saveSeed({ ...seed, images: [{ url: (() => { const c = document.createElement('canvas'); c.width = c.height = 2; c.getContext('2d').fillRect(0, 0, 2, 2); return c.toDataURL(); })() }] }); });
        const photoFailureBefore = await capture(b.page); fixture.storage.failUpload = true;
        await action(b.page, 'upload'); assert.match(await b.page.locator('#cloud-error-detail').innerText(), /Foto-upload is geweigerd/); assert.deepEqual(await capture(b.page), photoFailureBefore); assert.equal(fixture.snapshots.get(fixture.ids.a).revision, revisionBefore);
        fixture.storage.failUpload = false;
        await b.page.evaluate(payload => window.KweekLocalData.restore(payload), offlineBefore);
        report.simulated.push('Herhaalde upload hergebruikt object; fout tijdens foto-upload behoudt lokale tuin en vorige snapshot');
        await b.page.evaluate(async () => { const seed = (await window.KweekLocalData.capture()).seeds.find(seed => seed.id === 'isolated'); await saveSeed({ ...seed, images: [{ url: 'data:image/png;base64,' + 'A'.repeat(13_333_336) }] }); });
        const beforeBig = report.uploads; await action(b.page, 'upload'); assert.equal(report.uploads, beforeBig);
        assert.match(await b.page.locator('#cloud-error-detail').innerText(), /maximaal 1 MB/); assert.equal(fixture.snapshots.get(fixture.ids.a).revision, revisionBefore);
        await b.page.evaluate(payload => window.KweekLocalData.restore(payload), offlineBefore);
        await b.page.evaluate(async () => { const seed = (await window.KweekLocalData.capture()).seeds.find(seed => seed.id === 'isolated'); await saveSeed({ ...seed, ervaringen: 'A'.repeat(3_600_000) }); });
        await action(b.page, 'upload', false); assert.equal(report.uploads, beforeBig); assert.match(await b.page.locator('#cloud-error-detail').innerText(), /overige tuingegevens zijn te groot/);
        await b.page.evaluate(payload => window.KweekLocalData.restore(payload), offlineBefore);
        report.simulated.push('Niet verwerkbare grote foto: duidelijke melding na bevestiging, vóór uploadrequest; geen foto’s weggelaten en lokale tuin behouden');

        await b.page.route('**/api/auth', route => route.request().method() === 'POST' ? route.abort() : route.continue());
        await action(b.page, 'logout', false); assert.deepEqual(await capture(b.page), offlineBefore);
        await b.page.unroute('**/api/auth'); await action(b.page, 'logout', false);
        assert.deepEqual(await capture(b.page), offlineBefore); await b.page.reload(); await b.page.waitForSelector('#view-home:not(.hidden)');
        assert.deepEqual((await capture(b.page)).seeds, offlineBefore.seeds); await open(b.page);
        assert.match(await b.page.locator('#cloud-login-status').textContent(), /Niet ingelogd/);
        report.simulated.push('Uitloggen, mislukte logout en herladen behouden alle lokale testgegevens');
        await a.page.screenshot({ path: path.join(output, 'desktop.png') });
        await b.page.locator('#settings-section-cloud').scrollIntoViewIfNeeded(); await b.page.screenshot({ path: path.join(output, 'mobile.png') });
        assert(await b.page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
        assert.deepEqual(report.errors, []); assert.equal(sourceHash(), originalHash);
        fs.writeFileSync(path.join(output, 'browser-report.json'), JSON.stringify(report, null, 2)); console.log(JSON.stringify(report, null, 2));
        await a.context.close(); await b.context.close();
    } finally { await browser.close(); await new Promise(resolve => server.close(resolve)); await fixture.stop(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
