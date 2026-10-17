// Merged account/AI regression checks against local Auth + Gemini fixtures.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');
const { createServer } = require('../scripts/dev-server.cjs');
const { startFixtures, configureFixtures } = require('./service-fixtures.cjs');
const output = path.resolve(__dirname, '../scratch/account-settings');
(async () => {
    const fixture = await startFixtures();
    configureFixtures(fixture);
    process.env.GEMINI_API_KEY = 'fixture-gemini-secret';
    const originalFetch = global.fetch;
    global.fetch = (url, options) => originalFetch(String(url).startsWith('https://generativelanguage.googleapis.com/') ? fixture.base + '/gemini' : url, options);
    const server = createServer();
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    const base = `http://127.0.0.1:${server.address().port}`;
    const browser = await chromium.launch();
    const errors = [], cloudRequests = [], checks = [];
    fs.mkdirSync(output, { recursive: true });
    try {
        for (const width of [1440, 390]) {
            const context = await browser.newContext({ viewport: { width, height: 950 }, isMobile: width === 390, hasTouch: width === 390 });
            await context.addInitScript(() => {
                localStorage.setItem('onboarding_done', 'true');
                if (!localStorage.getItem('kweekkompas_ai')) localStorage.setItem('kweekkompas_ai', JSON.stringify({ provider: 'gemini', model: 'gemini-3.5-flash-lite' }));
            });
            await context.route('**/*', route => new URL(route.request().url()).origin === base ? route.continue() : route.abort());
            let authOffline = false;
            await context.route('**/api/auth', route => authOffline && route.request().method() === 'GET'
                ? route.fulfill({ status: 503, json: { error: 'Tijdelijk offline' } }) : route.continue());
            const page = await context.newPage();
            page.setDefaultTimeout(10000);
            page.on('pageerror', error => errors.push(error.message));
            page.on('request', request => { if (new URL(request.url()).pathname === '/api/cloud-sync') cloudRequests.push(request.url()); });
            await page.goto(base);
            await page.waitForFunction(() => window.KweekLocalData);
            await page.evaluate(async () => window.KweekLocalData.restore({ backupVersion: 1, seeds: [{ id: 'mobile-json', naam: 'Tomaat uit JSON-back-up', type: 'Groente', standplaats: 'Zon', status: 'Voorraad', tags: ['Eetbaar'], notities: 'Behouden' }], wishlist: [{ id: 1, name: 'Basilicum', type: 'seed' }], onboardingDone: 'true' }));
            const garden = await page.evaluate(() => window.KweekLocalData.captureCloud());
            const open = () => page.evaluate(() => window.openSettingsSection('account'));
            const aiStatus = () => page.evaluate(async () => {
                try { await window.KweekServices.requestAI('tuinassistent', { question: 'Hoe verzorg ik tomaat?' }); return 200; }
                catch (error) { return error.status; }
            });
            await open();
            await page.waitForFunction(() => document.querySelector('#account-session-status').textContent === 'Niet ingelogd');
            assert.equal(await aiStatus(), 401);
            await page.click('#account-settings-login');
            await page.fill('#cloud-email', 'a@example.test');
            await page.fill('#cloud-password', 'test-password');
            await page.click('#cloud-auth-submit');
            await page.waitForFunction(() => document.querySelector('#account-session-status')?.textContent.includes('a@example.test'));
            assert.equal(await page.locator('#account-settings-logout').isVisible(), true);
            assert.equal(await page.locator('#account-settings-login').isHidden(), true);
            assert.equal(await aiStatus(), 200);
            assert.deepEqual(await page.evaluate(() => window.KweekLocalData.captureCloud()), garden);
            assert((await context.cookies()).filter(cookie => cookie.name.startsWith('kk_')).every(cookie => cookie.httpOnly));
            assert.equal(await page.evaluate(() => JSON.stringify({ ...localStorage, ...sessionStorage }).includes('test-password')), false);

            // Status refresh failure must not pretend a valid session has logged out.
            authOffline = true;
            await page.click('.settings-close-button'); await open();
            await page.waitForFunction(() => document.querySelector('#account-settings-feedback').textContent.includes('Tijdelijk offline'));
            assert.match(await page.locator('#account-session-status').innerText(), /a@example.test/);
            authOffline = false;

            // A stale access cookie is refreshed using the actual backend before AI.
            await context.addCookies([{ name: 'kk_access', value: 'expired', url: base, httpOnly: true }]);
            await page.reload(); await open();
            await page.waitForFunction(() => document.querySelector('#account-session-status').textContent.includes('a@example.test'));
            assert.equal(await aiStatus(), 200);
            await page.locator('#settings-section-account').screenshot({ path: path.join(output, `${width}-account.png`) });
            await page.click('.settings-close-button');
            await page.fill('#ai-question-input', 'Hoe verzorg ik tomaat?');
            await page.click('#btn-ask-ai');
            await page.waitForSelector('#ai-assistant-output .ai-advies-card');
            await open();
            await page.click('#account-settings-logout');
            await page.waitForFunction(() => document.querySelector('#account-session-status').textContent === 'Niet ingelogd');
            assert.equal(await page.locator('#account-settings-login').isVisible(), true);
            assert.equal(await page.locator('#account-settings-logout').isHidden(), true);
            assert.equal((await context.cookies()).filter(cookie => ['kk_access', 'kk_refresh'].includes(cookie.name)).length, 0);
            assert.equal(await aiStatus(), 401);
            assert.deepEqual(await page.evaluate(() => window.KweekLocalData.captureCloud()), garden);
            assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
            checks.push(`${width}: JSON-tuin behouden, inloggen, AI met sessiecookies, offline status, sessievernieuwing en uitloggen; cloudsync blijft uit`);
            await context.close();
        }
        assert.deepEqual(errors, []);
        assert.deepEqual(cloudRequests, []);
        console.log(JSON.stringify({ checks, errors }, null, 2));
    } finally {
        await browser.close(); await new Promise(resolve => server.close(resolve)); await fixture.stop();
        global.fetch = originalFetch;
    }
})().catch(error => { console.error(error); process.exitCode = 1; });
