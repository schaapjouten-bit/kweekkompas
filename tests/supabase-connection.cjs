// Real project: read-only health/settings/schema checks, no login or writes.
// All collection edits and sync writes use isolated browser storage and a local fixture.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');
const { createServer } = require('../scripts/dev-server.cjs');
const { startFixtures } = require('./service-fixtures.cjs');
const output = path.resolve(__dirname, '../scratch/supabase-connection');
const report = { real: [], local: [], simulated: [], errors: [] };

(async () => {
    fs.mkdirSync(output, { recursive: true });
    const url = process.env.SUPABASE_URL;
    const key = process.env.SUPABASE_PUBLISHABLE_KEY;
    assert.equal(url, 'https://cmsthawjpxgyrmfwplfj.supabase.co', 'Only the specified project may be checked');
    assert.ok(key?.startsWith('sb_publishable_'));
    for (const endpoint of ['/auth/v1/health', '/auth/v1/settings', '/rest/v1/kweekkompas_snapshots?select=user_id&limit=0']) {
        const response = await fetch(url + endpoint, { headers: { apikey: key }, signal: AbortSignal.timeout(15000) });
        const data = await response.json();
        report.real.push({ endpoint, status: response.status, ...(endpoint.endsWith('/settings') ? { emailLoginEnabled: data.external?.email } : endpoint.includes('/rest/') ? { code: data.code, rowsRead: Array.isArray(data) ? data.length : 0 } : {}) });
        if (!endpoint.includes('/rest/')) assert.equal(response.status, 200);
    }
    const server = createServer();
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    const base = `http://127.0.0.1:${server.address().port}`;
    const browser = await chromium.launch();
    let fixture;
    const capture = page => page.evaluate(() => window.KweekLocalData.capture());
    const openSettings = page => page.evaluate(() => window.toggleSettingsPanel_REPAIR_V131());
    async function newPage(width = 1440) {
        const context = await browser.newContext({ viewport: { width, height: 900 }, timezoneId: 'Europe/Amsterdam' });
        await context.addInitScript(() => localStorage.setItem('onboarding_done', 'true'));
        // No AI/config/model endpoint reaches the backend during these checks.
        await context.route('**/*', route => {
            const requestUrl = new URL(route.request().url());
            if (requestUrl.origin !== base) return route.abort();
            if (/^\/api\/(ai-|tuinassistent|seed-info|gemini-ai)/.test(requestUrl.pathname)) return route.fulfill({ status: 503, json: { error: 'Andere instellingen niet geladen tijdens deze controle.' } });
            return route.continue();
        });
        const page = await context.newPage();
        page.setDefaultTimeout(8000);
        page.on('pageerror', error => report.errors.push(error.message));
        page.on('dialog', dialog => dialog.accept());
        await page.goto(base); await page.waitForSelector('#view-home:not(.hidden)');
        await page.evaluate(() => window.KweekLocalData.restore({ backupVersion: 1, seeds: [{ id: 'local-check', naam: 'Afzonderlijke testplant', type: 'Groente', status: 'Voorraad', beschrijving: 'Eigen testnotitie behouden', images: [{ url: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLbtAAAAABJRU5ErkJggg==' }] }], userProfile: { name: 'Testprofiel', light: 'Zon', gardenType: 'Balkon', experience: 'Beginner' }, reminders: [{ id: 'local-task', title: 'Testtaak', date: '2026-10-15', done: false }], wishlist: [{ id: 'local-wish', name: 'Testwens', type: 'item', note: 'Eigen notitie' }], onboardingDone: 'true' }));
        await page.reload(); await page.waitForSelector('#view-home:not(.hidden)');
        return { context, page };
    }
    try {
        assert.deepEqual(await (await fetch(base + '/api/auth')).json(), { configured: true, user: null });
        assert.equal((await fetch(base + '/api/cloud-sync')).status, 401);
        report.local.push('Bestaande /api/auth route meldt configured=true; cloudroute vereist login');
        for (const width of [1440, 390]) {
            const { context, page } = await newPage(width);
            const before = await capture(page);
            let writes = 0;
            page.on('request', request => { if (request.url().endsWith('/api/cloud-sync') && request.method() === 'POST') writes++; });
            await openSettings(page);
            await page.waitForFunction(() => document.querySelector('#cloud-status')?.textContent.includes('Niet ingelogd'));
            assert.ok(await page.locator('#cloud-login-form').isVisible());
            assert.doesNotMatch(await page.locator('#cloud-status').innerText(), /nog niet geconfigureerd/);
            await page.reload(); await page.waitForSelector('#view-home:not(.hidden)');
            assert.deepEqual(await capture(page), before);
            await openSettings(page);
            await page.click('#load-example-garden');
            await page.waitForFunction(() => document.querySelector('#example-garden-status')?.textContent.includes('45 voorbeeldplanten toegevoegd'));
            const withExamples = await capture(page);
            assert.equal(withExamples.seeds.length, before.seeds.length + 45);
            assert.deepEqual(withExamples.seeds.find(seed => seed.id === 'local-check'), before.seeds[0]);
            await page.reload(); await page.waitForSelector('#view-home:not(.hidden)');
            assert.deepEqual(await capture(page), withExamples);
            assert.equal(writes, 0);
            report.local.push(`${width}px: lokaal zonder account, eigen gegevens/foto/notities na herladen; voorbeeldtuin zonder cloudupload`);
            await context.close();
        }
        // Session/login/write tests are intentionally restricted to the local fixture.
        fixture = await startFixtures();
        process.env.SUPABASE_URL = fixture.base;
        process.env.SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_fixture';
        const { context, page } = await newPage();
        const before = await capture(page);
        // Keep another settings request pending: account status must still appear.
        let release;
        const pending = new Promise(resolve => { release = resolve; });
        await page.route('**/api/ai-config', async route => { await pending; await route.fulfill({ status: 503, json: { error: 'Andere instellingen niet geladen.' } }); });
        await page.reload(); await page.waitForSelector('#view-home:not(.hidden)');
        await openSettings(page);
        await page.waitForFunction(() => document.querySelector('#cloud-status')?.textContent.includes('Niet ingelogd'));
        release();
        report.simulated.push('Accountstatus verschijnt terwijl een andere instellingenroute blijft hangen');
        await page.fill('#cloud-email', 'a@example.test'); await page.fill('#cloud-password', 'test-password'); await page.click('#cloud-login-form button');
        await page.waitForFunction(() => document.querySelector('#cloud-status').textContent.includes('nog geen tuin'));
        assert.deepEqual(await capture(page), before);
        assert.equal(await page.inputValue('#cloud-password'), '');
        assert.equal(fixture.snapshots.size, 0);
        await page.click('[data-cloud-action="upload"]');
        await page.waitForFunction(() => document.querySelector('#cloud-status').textContent.includes('versie 1 opgeslagen'));
        assert.deepEqual(fixture.snapshots.get(fixture.ids.a).payload, before);
        // Simulate a second device saving after the browser read its cloud status.
        fixture.snapshots.get(fixture.ids.a).revision = 2;
        await page.click('[data-cloud-action="upload"]');
        await page.waitForFunction(() => document.querySelector('#cloud-status').textContent.includes('gewijzigd op een ander apparaat'));
        assert.equal(fixture.snapshots.get(fixture.ids.a).revision, 2);
        assert.deepEqual(await capture(page), before);
        await page.evaluate(async () => { const value = await window.KweekLocalData.capture(); value.seeds[0].beschrijving = 'Lokaal gewijzigd na upload'; await window.KweekLocalData.restore(value); });
        await Promise.all([page.waitForEvent('load'), page.click('[data-cloud-action="download"]')]);
        await page.waitForSelector('#view-home:not(.hidden)');
        await page.waitForFunction(async () => (await window.KweekLocalData.capture()).seeds[0].beschrijving === 'Eigen testnotitie behouden');
        await openSettings(page);
        await page.waitForFunction(() => document.querySelector('#cloud-status')?.textContent.includes('Cloudkopie versie 2'));
        await Promise.all([page.waitForEvent('load'), page.click('[data-cloud-action="recover"]')]);
        await page.waitForFunction(async () => (await window.KweekLocalData.capture()).seeds[0].beschrijving === 'Lokaal gewijzigd na upload');
        await page.waitForSelector('#view-home:not(.hidden)'); await openSettings(page);
        await page.waitForFunction(() => document.querySelector('#cloud-status')?.textContent.includes('Cloudkopie versie 2'));
        const restored = await capture(page);
        await page.click('[data-cloud-action="logout"]');
        await page.waitForFunction(() => document.querySelector('#cloud-status').textContent.includes('Niet ingelogd'));
        assert.deepEqual(await capture(page), restored);
        await page.fill('#cloud-email', 'b@example.test'); await page.fill('#cloud-password', 'test-password'); await page.click('#cloud-login-form button');
        await page.waitForFunction(() => document.querySelector('#cloud-status').textContent.includes('b@example.test') && document.querySelector('#cloud-status').textContent.includes('nog geen tuin'));
        assert.deepEqual(await capture(page), restored);
        assert.equal(fixture.snapshots.has(fixture.ids.b), false);
        let writes = 0;
        page.on('request', request => { if (request.url().endsWith('/api/cloud-sync') && request.method() === 'POST') writes++; });
        await page.click('#load-example-garden');
        await page.waitForFunction(() => document.querySelector('#example-garden-status')?.textContent.includes('45 voorbeeldplanten toegevoegd'));
        assert.equal(writes, 0); assert.equal(fixture.snapshots.has(fixture.ids.b), false);
        report.simulated.push('Login/uitloggen/accountwissel behouden lokale tuin; aparte upload, conflictweigering, cloudherstel en persistente veiligheidskopie; voorbeeldtuin uploadt ook ingelogd niet');
        await context.close();
        process.env.SUPABASE_URL = '';
        const absent = await newPage();
        await openSettings(absent.page);
        await absent.page.waitForFunction(() => document.querySelector('#cloud-status')?.textContent.includes('Supabase is nog niet geconfigureerd'));
        assert.ok(await absent.page.locator('#cloud-login-form').isHidden());
        await absent.page.route('**/api/auth', route => route.fulfill({ json: { user: null } }));
        await openSettings(absent.page); await openSettings(absent.page);
        await absent.page.waitForFunction(() => document.querySelector('#cloud-status')?.textContent.includes('Cloudconfiguratie kon niet worden gelezen'));
        assert.doesNotMatch(await absent.page.locator('#cloud-status').innerText(), /Supabase is nog niet geconfigureerd/);
        report.simulated.push('Melding over ontbrekende configuratie verschijnt bij lege configuratie; een ongeldige routerespons krijgt een andere melding');
        await absent.context.close();
        assert.deepEqual(report.errors, []);
    } finally {
        process.env.SUPABASE_URL = url; process.env.SUPABASE_PUBLISHABLE_KEY = key;
        await browser.close(); await new Promise(resolve => server.close(resolve));
        if (fixture) await fixture.stop();
        fs.writeFileSync(path.join(output, 'report.json'), JSON.stringify(report, null, 2));
    }
    console.log(JSON.stringify(report, null, 2));
})().catch(error => { console.error(error); process.exitCode = 1; });
