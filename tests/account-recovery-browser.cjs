// Isolated app + real Supabase SDK against local HTTP fixtures. No live mail/accounts.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');
const { createServer } = require('../scripts/dev-server.cjs');
const { startFixtures } = require('./service-fixtures.cjs');
(async () => {
    const fixture = await startFixtures();
    Object.assign(process.env, { SUPABASE_URL: fixture.base, SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_fixture', KWEEK_LOCAL_DEV: 'true' });
    const realFetch = global.fetch;
    const requests = []; let changes = 0;
    global.fetch = async (input, options = {}) => {
        const url = new URL(input);
        assert.equal(url.origin, fixture.base, 'Backend may only access local fixture');
        const body = options.body ? JSON.parse(options.body) : {};
        const send = (data, status = 200) => new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } });
        if (url.pathname === '/auth/v1/recover') { requests.push(url.searchParams.get('redirect_to')); return send({}); }
        if (url.pathname === '/auth/v1/verify') return body.token_hash === 'local-recovery' ? send({ access_token: fixture.tokens.a, refresh_token: 'refresh-a', expires_in: 3600, token_type: 'bearer', user: { id: fixture.ids.a, email: 'a@example.test' } }) : send({ msg: 'Expired', error_code: 'otp_expired' }, 403);
        if (url.pathname === '/auth/v1/user' && options.method === 'PUT') { changes++; assert.equal(body.password, 'fixture-new-password'); return send({ id: fixture.ids.a, email: 'a@example.test' }); }
        return realFetch(input, options);
    };
    const server = createServer(); await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    const base = `http://127.0.0.1:${server.address().port}`;
    const browser = await chromium.launch();
    const errors = [], report = { simulated: [], liveRequests: 0 };
    try {
        const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
        await context.addInitScript(() => { localStorage.setItem('onboarding_done', 'true'); sessionStorage.setItem('kweekkompas_account_choice', 'local'); });
        await context.route('**/*', route => {
            const url = new URL(route.request().url());
            if (url.origin !== base && url.origin !== fixture.base) return route.abort();
            if (url.pathname.startsWith('/api/ai-')) return route.fulfill({ json: { defaultProvider: 'ollama', providers: {}, models: [] } });
            return route.continue();
        });
        const page = await context.newPage(); page.setDefaultTimeout(8000); page.on('pageerror', e => errors.push(e.message));
        await page.goto(base); await page.waitForFunction(() => window.KweekLocalData);
        const garden = { backupVersion: 1, seeds: [{ id: 'recovery-local', naam: 'Eigen testplant', type: 'Groente', status: 'Voorraad', standplaats: 'Zon', isFavorite: true }], wishlist: [{ id: 1, name: 'Testwens', type: 'item' }], calendar: { '2026-10-03': ['Testplanning'] }, userProfile: { name: 'Hersteltest' }, onboardingDone: 'true' };
        await page.evaluate(value => window.KweekLocalData.restore(value), garden);
        const before = await page.evaluate(() => window.KweekLocalData.capture());
        await page.evaluate(() => window.openSettingsSection('cloud')); await page.click('#cloud-open-account'); await page.click('#account-forgot');
        await page.fill('#cloud-email', 'a@example.test'); await page.click('#cloud-auth-submit');
        await page.waitForFunction(() => document.getElementById('cloud-auth-status').textContent.includes('herstelmail'));
        assert.deepEqual(requests, [base + '/']); assert.equal(changes, 0);
        await page.goto(base + '?token_hash=local-recovery&type=recovery');
        await page.waitForSelector('#account-popup[open]'); await page.waitForFunction(() => document.getElementById('cloud-auth-submit').textContent === 'Nieuw wachtwoord opslaan');
        assert.equal(page.url(), base + '/'); assert.equal(await page.locator('.settings-panel.open').count(), 0);
        assert.equal(await page.locator('#cloud-email').isVisible(), false); assert.equal(await page.locator('#account-tabs').isVisible(), false);
        await page.fill('#cloud-password', 'fixture-new-password'); await page.fill('#cloud-password-confirm', 'different-password'); await page.click('#cloud-auth-submit');
        await page.waitForFunction(() => document.getElementById('cloud-auth-status').textContent.includes('niet gelijk')); assert.equal(changes, 0);
        await page.fill('#cloud-password-confirm', 'fixture-new-password'); await page.click('#cloud-auth-submit');
        await page.waitForFunction(() => !document.querySelector('#account-popup[open]'));
        assert.equal(changes, 1); assert.deepEqual(await page.evaluate(() => window.KweekLocalData.capture()), before);
        assert(!(await context.cookies()).some(cookie => cookie.name === 'kk_recovery' && cookie.value));
        assert.equal(fixture.snapshots.size, 0); assert.equal(fixture.objects.size, 0);
        await page.reload(); assert.deepEqual(await page.evaluate(() => window.KweekLocalData.capture()), before);
        await page.goto(base + '?token_hash=expired-recovery&type=recovery');
        await page.waitForFunction(() => document.querySelector('#account-popup[open]') && document.getElementById('cloud-auth-status').textContent.includes('verlopen'));
        assert.equal(page.url(), base + '/'); assert.equal(changes, 1);
        assert.deepEqual(await page.evaluate(() => window.KweekLocalData.capture()), before);
        report.simulated.push('Herstelmailaanvraag met correcte redirect; token-hash herstel-link opent direct nieuw wachtwoord; URL opgeschoond; ongelijke wachtwoorden geweigerd; wijziging via SDK slaagt en herstelcookie vervalt; tuin blijft na herladen intact; verlopen herstel-link geeft inline fout');
        assert.deepEqual(errors, []); report.errors = errors;
        const out = path.resolve('scratch/account-recovery'); fs.mkdirSync(out, { recursive: true }); fs.writeFileSync(path.join(out, 'report.json'), JSON.stringify(report, null, 2)); console.log(JSON.stringify(report, null, 2));
        await context.close();
    } finally { await browser.close(); await new Promise(resolve => server.close(resolve)); global.fetch = realFetch; await fixture.stop(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
