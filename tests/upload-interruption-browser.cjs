// Only interrupted uploads: real app + local account/storage/snapshot fixture.
// Fresh browser storage; every external origin and AI request is blocked.
const assert = require('node:assert/strict');
const { chromium } = require('playwright');
const { createServer } = require('../scripts/dev-server.cjs');
const { startFixtures } = require('./service-fixtures.cjs');
const photo = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aX1kAAAAASUVORK5CYII=';
const garden = { backupVersion: 1, seeds: [{ id: 'existing', naam: 'Uploadtest', type: 'Groente', status: 'Voorraad', images: [{ url: photo }], featuredImageUrl: photo }], reminders: [{ id: 1, title: 'Behouden taak', date: '2026-10-04', done: false }], wishlist: [], userProfile: { name: 'Testprofiel' }, onboardingDone: 'true' };
const deferred = () => { let resolve; const promise = new Promise(value => { resolve = value; }); return { promise, resolve }; };
(async () => {
    const fixture = await startFixtures();
    Object.assign(process.env, { SUPABASE_URL: fixture.base, SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_fixture', KWEEK_LOCAL_DEV: 'true' });
    const server = createServer(); await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    const base = `http://127.0.0.1:${server.address().port}`;
    const browser = await chromium.launch();
    const context = await browser.newContext();
    const errors = [], events = [], checks = [];
    let page, nextGate;
    function hold(stage) {
        const gate = { stage, reached: deferred(), release: deferred(), finished: deferred() };
        nextGate = gate; return gate;
    }
    try {
        await context.addInitScript(() => { localStorage.setItem('onboarding_done', 'true'); sessionStorage.setItem('kweekkompas_account_choice', 'local'); });
        await context.route('**/*', async route => {
            const url = new URL(route.request().url());
            if (![base, fixture.base].includes(url.origin)) return route.abort();
            if (/^\/api\/(ai-|seed-info|tuinassistent|gemini-ai)/.test(url.pathname)) return route.fulfill({ json: { providers: {}, models: [] } });
            if (url.pathname === '/api/cloud-sync') {
                const method = route.request().method();
                events.push(method);
                if (method === 'POST') {
                    assert(fixture.storage.uploads > 0, 'foto staat op de server vóór snapshotverzending');
                    const gate = nextGate; nextGate = null;
                    if (gate) {
                        try {
                            const response = gate.stage === 'after-commit' ? await route.fetch() : null;
                            if (response) assert.equal(response.status(), 200);
                            gate.reached.resolve(); await gate.release.promise;
                            if (response) await route.fulfill({ response }); else await route.continue();
                        } catch (error) { if (!route.request().frame().page().isClosed()) throw error; }
                        finally { gate.finished.resolve(); }
                        return;
                    }
                }
            }
            return route.continue();
        });
        async function reopen() {
            page = await context.newPage(); page.setDefaultTimeout(12000);
            page.on('pageerror', error => errors.push(error.message));
            await page.goto(base); await page.waitForFunction(() => window.KweekLocalData);
        }
        const capture = () => page.evaluate(() => window.KweekLocalData.captureCloud());
        const queue = () => page.evaluate(id => JSON.parse(localStorage.getItem('kweekkompas_auto_' + id)), fixture.ids.a);
        const record = id => page.evaluate(id => JSON.parse(localStorage.getItem('kweekkompas_sync_' + id)), id);
        async function cloud() { await page.evaluate(() => window.openSettingsSection('cloud')); await page.waitForFunction(() => document.getElementById('cloud-login-status').textContent.length > 0); }
        async function login(email) {
            await cloud(); await page.click('#cloud-open-account'); await page.fill('#cloud-email', email); await page.fill('#cloud-password', 'test-password'); await page.click('#cloud-auth-submit');
            await page.waitForFunction(() => !document.querySelector('#account-popup[open]') && document.getElementById('cloud-login-status').textContent.includes('Ingelogd'));
        }
        const edit = name => page.evaluate(async name => { const seed = (await window.KweekLocalData.captureCloud()).seeds[0]; await saveSeed({ ...seed, naam: name }); }, name);
        const acknowledged = revision => page.waitForFunction(({ id, revision }) => { const state = JSON.parse(localStorage.getItem('kweekkompas_auto_' + id)); return state?.basis?.revision === revision && state.counter === state.done; }, { id: fixture.ids.a, revision });
        async function closeHeld(gate) { await page.close(); gate.release.resolve(); await gate.finished.promise; }
        async function waitHeld(gate) { await Promise.race([gate.reached.promise, new Promise((_, reject) => { const timeout = setTimeout(() => reject(new Error('Upload niet vastgehouden')), 12000); gate.reached.promise.then(() => clearTimeout(timeout)); })]); }

        await reopen(); await page.evaluate(value => window.KweekLocalData.restore(value), garden); await page.reload();
        await login('a@example.test'); await page.click('#cloud-auto-sync'); await page.waitForSelector('#cloud-auto-choices:not([hidden])');
        const cancelled = hold('before-send'); page.once('dialog', dialog => dialog.accept()); await page.click('[data-auto-choice="local"]'); await waitHeld(cancelled);
        const original = await capture();
        assert.equal(fixture.snapshots.size, 0); assert.equal(await record(fixture.ids.a), null);
        assert((await queue()).counter > (await queue()).done); assert.match(await page.locator('#cloud-status').innerText(), /Synchroniseren/);
        await closeHeld(cancelled); events.length = 0; await reopen(); await cloud(); await acknowledged(1);
        assert.equal(events[0], 'GET', 'hervatten leest eerst de revisie');
        assert.deepEqual(await capture(), original); assert.equal(fixture.storage.uploads, 1);
        checks.push('Bestaand sluitscenario: gegevens/wachtrij behouden, geen vroege successtatus, eerst revisie lezen, foto hergebruiken');

        const lost = hold('after-commit'); await edit('Verstuurde versie'); await waitHeld(lost);
        assert.equal(fixture.snapshots.get(fixture.ids.a).revision, 2);
        assert.equal((await queue()).basis.revision, 1); assert.equal((await record(fixture.ids.a)).revision, 1);
        assert.match(await page.locator('#cloud-status').innerText(), /Synchroniseren/);
        const attempt = (await queue()).uploadAttempt;
        await edit('Wijziging tijdens upload');
        assert((await queue()).counter > attempt.generation);
        const edited = await capture(); await closeHeld(lost);
        const followup = hold('before-send'); events.length = 0; await reopen(); await cloud(); await waitHeld(followup);
        const resumed = await queue();
        assert.equal(resumed.basis.revision, 2); assert.equal(resumed.done, attempt.generation); assert(resumed.counter > resumed.done);
        assert.equal((await record(fixture.ids.a)).hash, attempt.hash, 'latere wijzigingen krijgen geen geslaagde status');
        assert.deepEqual(await capture(), edited); assert.equal(events[0], 'GET');
        assert.notEqual(await page.locator('#cloud-status').innerText(), 'Gesynchroniseerd');
        followup.release.resolve(); await followup.finished.promise; await acknowledged(3);
        assert.equal(fixture.snapshots.get(fixture.ids.a).payload.seeds[0].naam, 'Wijziging tijdens upload');
        assert.equal(fixture.storage.uploads, 1);
        checks.push('Verloren bevestiging: exacte serverrevisie/inhoud erkend; tussentijdse wijziging blijft klaarstaan en wordt apart bevestigd');

        const conflicting = hold('after-commit'); await edit('Lokale versie bij conflict'); await waitHeld(conflicting);
        const committed = fixture.snapshots.get(fixture.ids.a);
        fixture.snapshots.set(fixture.ids.a, { ...committed, payload: { ...committed.payload, seeds: committed.payload.seeds.map(seed => ({ ...seed, naam: 'Andere serverinhoud' })) } });
        const beforeConflict = await capture(); await closeHeld(conflicting); events.length = 0; await reopen(); await cloud();
        await page.waitForFunction(id => JSON.parse(localStorage.getItem('kweekkompas_auto_' + id))?.paused === 'conflict', fixture.ids.a);
        assert.deepEqual(await capture(), beforeConflict); assert.equal(events.filter(method => method === 'POST').length, 0);
        assert.equal(fixture.snapshots.get(fixture.ids.a).payload.seeds[0].naam, 'Andere serverinhoud');
        checks.push('Afwijkende serverinhoud op de verwachte revisie: conflict, geen blinde overschrijving');

        page.once('dialog', dialog => dialog.accept()); await page.click('[data-auto-choice="local"]'); await acknowledged(5);
        const switching = hold('before-send'); await edit('Account A in uitvoering'); await waitHeld(switching);
        const beforeSwitch = await capture(); const basisBeforeSwitch = (await queue()).basis.revision;
        await page.click('[data-cloud-action="logout"]');
        await page.waitForFunction(id => JSON.parse(localStorage.getItem('kweekkompas_auto_' + id))?.paused === 'account', fixture.ids.a);
        // Playwright's held route must be released before the aborted fetch can
        // settle and logout can finish; do not simulate an unending test barrier.
        switching.release.resolve(); await switching.finished.promise;
        await page.waitForSelector('#cloud-open-account:not([hidden])'); await login('b@example.test');
        assert.equal(await record(fixture.ids.b), null); assert.equal(fixture.snapshots.has(fixture.ids.b), false);
        assert.deepEqual(await capture(), beforeSwitch); assert.equal((await queue()).basis.revision, basisBeforeSwitch);
        assert.equal((await queue()).paused, 'account'); assert((await queue()).counter > (await queue()).done);
        checks.push('Uitloggen/accountwissel: lopende aanvraag bevestigt niets voor account B; account A houdt zijn wachtende wijziging');
        assert.deepEqual(errors, []);
        console.log(JSON.stringify({ checks, pageErrors: errors, liveCloudWrites: 0 }, null, 2));
    } finally {
        nextGate?.release.resolve();
        await browser.close(); await new Promise(resolve => server.close(resolve)); await fixture.stop();
    }
})().catch(error => { console.error(error); process.exitCode = 1; });
