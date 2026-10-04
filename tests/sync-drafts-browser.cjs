// Real browser storage/UI and local HTTP backend, with isolated Supabase fixtures.
// All external origins and all AI calls are blocked. No real account/cloud writes.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');
const { createServer } = require('../scripts/dev-server.cjs');
const { startFixtures } = require('./service-fixtures.cjs');
const output = path.resolve('scratch/sync-drafts');
const photo = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aX1kAAAAASUVORK5CYII=';
const payload = { backupVersion: 1, seeds: [{ id: 'existing', naam: 'Bestaande plant', type: 'Groente', status: 'Voorraad', standplaats: 'Zon', images: [{ url: photo }], featuredImageUrl: photo }],
    reminders: [{ id: 1, title: 'Bestaande planning', date: '2026-10-04', done: false }], wishlist: [{ id: 'wish', name: 'Bestaande wens', type: 'item', note: 'Origineel' }], userProfile: { name: 'Testprofiel' }, onboardingDone: 'true' };
const report = { checks: [], errors: [], liveWrites: 0 };
(async () => {
    const fixture = await startFixtures();
    Object.assign(process.env, { SUPABASE_URL: fixture.base, SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_fixture', KWEEK_LOCAL_DEV: 'true' });
    const server = createServer(); await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    const base = `http://127.0.0.1:${server.address().port}`;
    const browser = await chromium.launch(); fs.mkdirSync(output, { recursive: true });
    try {
        for (const width of [1440, 390]) {
            fixture.snapshots.clear();
            const context = await browser.newContext({ viewport: { width, height: 1000 }, timezoneId: 'Europe/Amsterdam' });
            await context.addInitScript(() => { localStorage.setItem('onboarding_done', 'true'); sessionStorage.setItem('kweekkompas_account_choice', 'local'); });
            let offline = false, holdUpload = null, held = false;
            await context.route('**/*', async route => {
                const url = new URL(route.request().url());
                if (url.origin !== base && url.origin !== fixture.base) return route.abort();
                if (/^\/api\/(ai-|seed-info|tuinassistent|gemini-ai)/.test(url.pathname)) return route.fulfill({ json: { defaultProvider: 'ollama', providers: {}, models: [] } });
                if (offline && ['/api/auth', '/api/cloud-sync', '/api/photo-access'].includes(url.pathname)) return route.abort();
                if (url.pathname === '/api/cloud-sync' && route.request().method() === 'POST' && holdUpload) {
                    held = true; await holdUpload; await route.continue().catch(() => {}); return;
                }
                return route.continue();
            });
            let page;
            async function reopen() {
                page = await context.newPage(); page.setDefaultTimeout(12000); page.on('pageerror', error => report.errors.push(error.message));
                await page.clock.setFixedTime(new Date('2026-10-04T12:00:00+02:00'));
                await page.goto(base); await page.waitForFunction(() => window.KweekLocalData && window.KweekDrafts);
            }
            const capture = () => page.evaluate(() => window.KweekLocalData.captureCloud());
            const draft = key => page.evaluate(key => window.KweekDrafts.get(key), key);
            const queue = () => page.evaluate(id => JSON.parse(localStorage.getItem('kweekkompas_auto_' + id)), fixture.ids.a);
            async function cloud() {
                await page.evaluate(() => window.openSettingsSection('cloud'));
                await page.waitForFunction(() => document.getElementById('cloud-login-status').textContent.length > 0);
            }
            async function login(email = 'a@example.test') {
                await cloud(); await page.click('#cloud-open-account'); await page.fill('#cloud-email', email); await page.fill('#cloud-password', 'test-password'); await page.click('#cloud-auth-submit');
                await page.waitForFunction(() => !document.querySelector('#account-popup[open]') && document.getElementById('cloud-login-status').textContent.includes('Ingelogd'));
            }
            async function mode(expected) {
                await page.waitForFunction(expected => document.getElementById('settings-section-cloud').dataset.syncMode === expected, expected);
                assert.equal(await page.locator('#cloud-actions').isVisible(), expected === 'normal');
                assert.equal(await page.locator('#cloud-auto-choices').isVisible(), expected !== 'normal');
                assert(await page.locator('#cloud-conflict-actions').isHidden(), 'Only one choice group');
            }
            await reopen(); await page.evaluate(payload => window.KweekLocalData.restore(payload), payload); await page.reload();
            await page.evaluate(() => window.openSettingsSection('profile'));
            await page.fill('#profile-modal-name', 'Direct bewaard');
            assert.equal((await capture()).userProfile.name, 'Direct bewaard', 'No blur needed');
            await page.reload(); assert.equal((await capture()).userProfile.name, 'Direct bewaard');

            await page.evaluate(() => window.openAddForm());
            await page.fill('#naam', 'Nieuwe conceptplant'); await page.selectOption('#type', 'Groente'); await page.click('#toggle-extra'); await page.fill('#ervaringen', 'Nog een concept');
            await page.setInputFiles('#file-upload', { name: 'isolated.png', mimeType: 'image/png', buffer: Buffer.from(photo.split(',')[1], 'base64') });
            await page.waitForFunction(async () => (await window.KweekDrafts.get('seed:new'))?.assets?.images?.length > 0);
            assert.equal((await capture()).seeds.length, 1);
            await page.reload(); await page.waitForSelector('#view-add:not(.hidden)');
            await page.waitForFunction(() => document.getElementById('naam').value === 'Nieuwe conceptplant');
            assert.equal(await page.inputValue('#ervaringen'), 'Nog een concept');
            assert((await draft('seed:new')).assets.images[0].url.startsWith('data:image/'));
            await page.click('#btn-submit-form'); await page.waitForSelector('#view-list:not(.hidden)');
            assert.equal(await draft('seed:new'), null);
            assert.equal((await capture()).seeds.length, 2);
            assert((await capture()).seeds.find(seed => seed.naam === 'Nieuwe conceptplant').images.length > 0);

            await page.locator('#seed-card-existing').press('Enter'); await page.click('#btn-detail-edit');
            await page.fill('#naam', 'Onvoltooide bewerking'); await page.reload();
            await page.waitForFunction(() => document.getElementById('naam').value === 'Onvoltooide bewerking');
            assert.equal((await capture()).seeds.find(seed => seed.id === 'existing').naam, 'Bestaande plant');
            await page.click('#btn-cancel-seed-draft'); assert.equal(await draft('seed:existing'), null);
            await page.locator('#seed-card-existing .card-favorite-button').click();
            await page.waitForFunction(async () => (await window.KweekLocalData.captureCloud()).seeds.find(seed => seed.id === 'existing').isFavorite);
            await page.reload(); assert.equal((await capture()).seeds.find(seed => seed.id === 'existing').isFavorite, true);
            report.checks.push(`${width}: profile while typing, plant/photo concepts survive reload; Save finalizes and Cancel discards; favorite persists`);

            await page.evaluate(() => window.switchView('calendar'));
            await page.locator('.calendar-day[aria-current="date"]').click(); await page.click('#planning-add'); await page.fill('#new-reminder-input', 'Conceptplanning');
            assert.equal((await capture()).reminders.length, 1); await page.reload();
            await page.waitForFunction(() => document.getElementById('new-reminder-input').value === 'Conceptplanning');
            await page.click('#btn-add-reminder'); assert.equal(await draft('task'), null);
            assert.equal((await capture()).reminders.length, 2);
            await page.click('#planning-add'); await page.fill('#new-reminder-input', 'Annuleren'); await page.click('#planning-cancel'); assert.equal(await draft('task'), null);

            await page.evaluate(() => window.switchView('wishlist')); await page.fill('#wishlist-quick-input', 'Nieuwe conceptwens');
            assert.equal((await capture()).wishlist.length, 1); await page.reload();
            await page.waitForFunction(() => document.getElementById('wishlist-quick-input').value === 'Nieuwe conceptwens');
            await page.click('#btn-add-wish-quick'); assert.equal(await draft('wish-quick'), null);
            assert.equal((await capture()).wishlist.length, 2);
            await page.evaluate(() => window._editWish('wish')); await page.fill('#edit-wish-note', 'Conceptnotitie'); await page.reload();
            await page.waitForFunction(() => document.getElementById('edit-wish-note').value === 'Conceptnotitie');
            assert.equal((await capture()).wishlist.find(item => item.id === 'wish').note, 'Origineel');
            await page.click('#btn-wish-save'); assert.equal(await draft('wish:wish'), null);
            await page.reload(); assert.equal((await capture()).wishlist.find(item => item.id === 'wish').note, 'Conceptnotitie');
            report.checks.push(`${width}: task and wishlist concepts restore without becoming final entries, then persist after explicit Add/Save`);

            await login(); await mode('normal');
            assert.equal(await page.locator('#cloud-auto-sync').isChecked(), false);
            await page.locator('#settings-section-cloud').screenshot({ path: path.join(output, `${width}-normal.png`) });
            await page.click('#cloud-auto-sync'); await mode('basis');
            assert(await page.locator('#cloud-auto-choose-remote').isHidden(), 'No nonexistent cloud version');
            await page.locator('#settings-section-cloud').screenshot({ path: path.join(output, `${width}-basis.png`) });
            let release; holdUpload = new Promise(resolve => { release = resolve; });
            page.once('dialog', dialog => dialog.accept()); await page.click('[data-auto-choice="local"]');
            await page.waitForFunction(id => JSON.parse(localStorage.getItem('kweekkompas_auto_' + id))?.resolving, fixture.ids.a);
            const until = Date.now() + 12000; while (!held) { if (Date.now() > until) throw Error('Upload not held'); await new Promise(resolve => setTimeout(resolve, 25)); }
            assert.equal(fixture.snapshots.size, 0);
            assert.equal(await page.evaluate(id => localStorage.getItem('kweekkompas_sync_' + id), fixture.ids.a), null);
            assert.match(await page.locator('#cloud-status').innerText(), /Synchroniseren/);
            await page.close(); holdUpload = null; release(); await reopen(); await cloud();
            await page.waitForFunction(id => JSON.parse(localStorage.getItem('kweekkompas_auto_' + id))?.basis?.revision === 1, fixture.ids.a);
            await mode('normal'); assert(await page.locator('#cloud-last-sync').isVisible());
            assert.match(await page.locator('#cloud-last-sync').innerText(), /Laatste geslaagde/);
            report.checks.push(`${width}: initial version choice; no success before acknowledgement; closing mid-upload retains queue and reopening finishes`);

            offline = true;
            await page.evaluate(async () => { const seed = (await window.KweekLocalData.captureCloud()).seeds.find(seed => seed.id === 'existing'); await saveSeed({ ...seed, naam: 'Offline wijziging' }); });
            const waiting = await queue(); assert(waiting.counter > waiting.done);
            await page.close(); await reopen(); assert.equal((await capture()).seeds.find(seed => seed.id === 'existing').naam, 'Offline wijziging');
            assert((await queue()).counter > (await queue()).done);
            offline = false; await page.evaluate(() => window.dispatchEvent(new Event('online'))); await cloud();
            await page.waitForFunction(id => JSON.parse(localStorage.getItem('kweekkompas_auto_' + id))?.basis?.revision === 2, fixture.ids.a);
            assert.equal(fixture.snapshots.get(fixture.ids.a).payload.seeds.find(seed => seed.id === 'existing').naam, 'Offline wijziging');
            report.checks.push(`${width}: offline service reopen preserves edits and queue; online event restores account and resumes`);

            const remote = fixture.snapshots.get(fixture.ids.a);
            fixture.snapshots.set(fixture.ids.a, { ...remote, revision: 3, payload: { ...remote.payload, seeds: remote.payload.seeds.map(seed => ({ ...seed, naam: 'Ander apparaat' })) } });
            await page.evaluate(async () => { const seed = (await window.KweekLocalData.captureCloud()).seeds.find(seed => seed.id === 'existing'); await saveSeed({ ...seed, naam: 'Mijn conflictversie' }); });
            await mode('conflict'); assert.equal((await queue()).paused, 'conflict');
            await page.locator('#settings-section-cloud').screenshot({ path: path.join(output, `${width}-conflict.png`) });
            assert.equal(fixture.snapshots.get(fixture.ids.a).revision, 3);
            page.once('dialog', dialog => dialog.accept()); await page.click('[data-auto-choice="local"]');
            await page.waitForFunction(id => JSON.parse(localStorage.getItem('kweekkompas_auto_' + id))?.basis?.revision === 4, fixture.ids.a);
            await mode('normal');
            const beforeLogout = await capture(); await page.click('[data-cloud-action="logout"]');
            await page.waitForSelector('#cloud-open-account:not([hidden])'); await login('b@example.test');
            assert.equal(await page.locator('#cloud-auto-sync').isChecked(), false);
            assert.deepEqual(await capture(), beforeLogout); assert.equal(fixture.snapshots.has(fixture.ids.b), false);
            report.checks.push(`${width}: conflict pauses sync and offers only version choices; confirmed resolution hides choices; account switch preserves local garden without uploading`);
            await context.close();
        }
        assert.deepEqual(report.errors, []);
        console.log(JSON.stringify(report, null, 2));
    } finally {
        fs.writeFileSync(path.join(output, 'report.json'), JSON.stringify(report, null, 2));
        await browser.close(); await new Promise(resolve => server.close(resolve)); await fixture.stop();
    }
})().catch(error => { console.error(error); process.exitCode = 1; });
