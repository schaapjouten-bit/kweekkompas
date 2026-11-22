// Full local UI/backend flow; Google responses are fixtures, no real key or AI usage.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { chromium } = require('playwright');
const { createServer } = require('../scripts/dev-server.cjs');
const { startFixtures, configureFixtures } = require('./service-fixtures.cjs');
const output = path.resolve(__dirname, '../scratch/gemini-free');
const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'kweek-gemini-ui-'));
const file = path.join(directory, '.kweek-gemini-free.json');
const personalFile = path.join(directory, '.kweek-gemini.json');
const originalFetch = global.fetch;
const calls = [], errors = [], checks = [];
let failure = 0;
global.fetch = async (url, options) => {
    if (String(url).startsWith('https://generativelanguage.googleapis.com/')) {
        calls.push({ url: String(url), body: JSON.parse(options.body), apiKey: options.headers['x-goog-api-key'] });
        if (failure) return Response.json({ error: { message: 'Provider secret error', details: failure === 400 ? [{ reason: 'API_KEY_INVALID' }] : [] } }, { status: failure });
        return Response.json({ candidates: [{ content: { parts: [{ text: JSON.stringify({ ok: true, answer: 'Basilicum houdt van warmte.', actions: [], name: 'Basilicum', type: 'Kruid', notes: 'Testinformatie', sow_months: ['maart'], harvest_months: ['juli'], tags: [] }) }] } }] });
    }
    if (String(url).includes('127.0.0.1:11434/api/tags')) return Response.json({ models: [{ name: 'gemma4:latest' }] });
    return originalFetch(url, options);
};
(async () => {
    const fixture = await startFixtures();
    configureFixtures(fixture);
    process.env.GEMINI_FREE_API_KEY = 'fixture-shared-key';
    const server = createServer({ geminiFreeFile: file, geminiPersonalFile: personalFile, chatGPTFile: path.join(directory, 'chatgpt.json') });
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    const base = `http://127.0.0.1:${server.address().port}`;
    const browser = await chromium.launch();
    fs.mkdirSync(output, { recursive: true });
    try {
        for (const width of [1440, 390]) {
            if (fs.existsSync(file)) fs.unlinkSync(file);
            const context = await browser.newContext({ viewport: { width, height: 950 } });
            await context.addInitScript(() => {
                localStorage.setItem('onboarding_done', 'true');
                localStorage.setItem('theme', 'playful');
                if (!localStorage.getItem('kweekkompas_ai')) localStorage.setItem('kweekkompas_ai', JSON.stringify({ provider: 'gemini', model: 'gemini-3.8-flash' }));
            });
            await context.route('**/*', route => new URL(route.request().url()).origin === base ? route.continue() : route.abort());
            const page = await context.newPage();
            page.setDefaultTimeout(10000);
            page.on('pageerror', error => errors.push(error.message));
            await page.goto(base);
            await page.waitForFunction(() => window.KweekLocalData);
            const garden = await page.evaluate(() => window.KweekLocalData.captureCloud());
            const open = async () => {
                await page.evaluate(() => window.openSettingsSection('ai'));
                await page.waitForFunction(() => !document.querySelector('#ai-provider option[value="gemini-free"]').disabled);
            };
            const submit = page.locator('#ai-settings-form button[type="submit"]');
            const count = calls.length;
            await open();
            assert.equal(await page.inputValue('#ai-provider'), 'gemini');
            assert.equal(await page.inputValue('#ai-gemini-model'), 'gemini-3.8-flash');
            await page.selectOption('#ai-provider', 'gemini-free');
            assert.equal(await page.inputValue('#ai-gemini-model'), 'gemini-3.5-flash-lite');
            assert.equal(await page.locator('#ai-gemini-model').isDisabled(), true);
            assert.equal(await page.locator('#gemini-free-key').isVisible(), false);
            await page.waitForFunction(() => document.querySelector('#ai-provider-status').textContent.includes('Log in'));
            assert.equal(calls.length, count);
            const login = await page.request.post(`${base}/api/auth`, {
                headers: { Origin: base },
                data: { action: 'login', email: 'a@example.test', password: 'test-password' }
            });
            assert.equal(login.status(), 200);
            assert.ok((await context.cookies(base)).some(cookie => cookie.name === 'kk_access' && cookie.httpOnly));
            await submit.click();
            await page.waitForFunction(() => document.querySelector('#ai-save-status').textContent.includes('Opgeslagen'));
            assert.equal(await page.locator('#ai-settings-form input[type="password"]:visible').count(), 0);
            const transmitted = page.waitForRequest(request => request.url().endsWith('/api/tuinassistent') && request.method() === 'POST');
            assert.equal(await page.evaluate(() => window.KweekServices.requestAI('tuinassistent', { question: 'Basilicum?' }).then(result => result.answer)), 'Basilicum houdt van warmte.');
            assert.deepEqual((await transmitted).postDataJSON().ai, { provider: 'gemini-free', model: 'gemini-3.5-flash-lite' });
            assert.equal(calls.length, count + 1);
            assert.ok(calls.at(-1).apiKey === 'fixture-shared-key');
            assert.deepEqual(await page.evaluate(() => window.KweekLocalData.captureCloud()), garden);
            await page.reload();
            await open();
            await page.waitForFunction(() => document.querySelector('#ai-provider').value === 'gemini-free');
            assert.equal(await page.locator('#gemini-free-key').isVisible(), false);
            const retained = { provider: 'gemini', model: 'gemini-3.1-flash-lite' };
            await page.evaluate(choice => localStorage.setItem('kweekkompas_ai', JSON.stringify(choice)), retained);
            await page.reload();
            await open();
            await page.selectOption('#ai-provider', 'gemini');
            assert.equal(await page.inputValue('#ai-gemini-model'), retained.model);
            assert.deepEqual(await page.locator('#ai-gemini-model option').evaluateAll(options => options.map(option => option.value)),
                ['gemini-4-neon', 'gemini-3.8-flash', 'gemini-3.5-flash-lite', retained.model]);
            assert.equal(await submit.textContent(), 'Opslaan en testen');
            await page.selectOption('#ai-gemini-model', 'gemini-4-neon');
            const keyInput = page.locator('#gemini-free-key');
            for (const [status, message] of [[400, 'Ongeldige'], [403, 'geen toegang'], [404, 'geen toegang'], [429, 'quotum']]) {
                failure = status;
                const before = calls.length;
                await keyInput.fill('fixture-unverified-personal-key');
                await submit.click();
                await page.waitForFunction(text => document.querySelector('#ai-save-status').textContent.includes(text), message);
                assert.equal(calls.length, before + 1);
                assert.equal(calls.at(-1).url.split('/').at(-1), 'gemini-4-neon:generateContent');
                assert.ok(calls.at(-1).apiKey === 'fixture-unverified-personal-key');
                assert.equal(await page.inputValue('#ai-gemini-model'), 'gemini-4-neon');
                assert.deepEqual(await page.evaluate(() => JSON.parse(localStorage.getItem('kweekkompas_ai'))), retained);
                assert.doesNotMatch(await page.locator('#ai-save-status').textContent(), /fixture-|Provider secret error/);
            }
            failure = 0;
            await keyInput.fill('fixture-verified-personal-key');
            await submit.click();
            await page.waitForFunction(() => document.querySelector('#ai-save-status').textContent.includes('Verbinding geslaagd'));
            assert.deepEqual(await page.evaluate(() => JSON.parse(localStorage.getItem('kweekkompas_ai'))), { provider: 'gemini', model: 'gemini-4-neon' });
            assert.equal(await keyInput.inputValue(), '');
            assert.deepEqual(await page.evaluate(() => window.KweekServices.requestAI('tuinassistent', { question: 'Basilicum?' }).then(result => result.answer)), 'Basilicum houdt van warmte.');
            assert.equal(calls.at(-1).url.split('/').at(-1), 'gemini-4-neon:generateContent');
            assert.ok(calls.at(-1).apiKey === 'fixture-verified-personal-key');
            const beforeUntrustedRequest = calls.length;
            const untrusted = await page.request.post(`${base}/api/tuinassistent`, {
                headers: { Origin: 'https://other.example' },
                data: { question: 'Basilicum?', ai: { provider: 'gemini', model: 'gemini-4-neon' } }
            });
            assert.equal(untrusted.status(), 403);
            assert.equal(calls.length, beforeUntrustedRequest);
            assert.equal((await page.request.get(`${base}/.kweek-gemini.json`)).status(), 404);
            assert.equal(await page.locator('#gemini-free-key').isVisible(), true);
            await page.selectOption('#ai-provider', 'ollama');
            assert.equal(await page.locator('#ollama-setup').isVisible(), true);
            assert.equal(await page.locator('#gemini-free-key').isDisabled(), true);
            checks.push(`${width}: dropdown, afgeschermde sleutel, fout/succes, herladen, echte hulpknoppen, verwijderen en bestaande providers`);
            await context.close();
        }
        assert.deepEqual(errors, []);
        console.log(JSON.stringify({ checks, errors, mockedGoogleRequests: calls.length }, null, 2));
    } finally {
        await browser.close();
        await new Promise(resolve => server.close(resolve));
        await fixture.stop();
    }
})().catch(error => { console.error(error); process.exitCode = 1; }).finally(() => {
    global.fetch = originalFetch;
    fs.rmSync(directory, { recursive: true, force: true });
});
