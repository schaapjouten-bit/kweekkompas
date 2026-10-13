// Isolated local OAuth and both real app helper routes; no real accounts or calls.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { chromium } = require('playwright');
const { createServer } = require('../scripts/dev-server.cjs');
const { fixture } = require('./chatgpt-fixture.cjs');
(async () => {
    for (const name of ['SUPABASE_URL', 'SUPABASE_ANON_KEY', 'SUPABASE_PUBLISHABLE_KEY']) delete process.env[name];
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'kweek-gpt-browser-'));
    const mock = fixture();
    const server = createServer({ localAPIFile: path.join(dir, 'custom.json'), chatGPTFile: path.join(dir, 'chatgpt.json'), chatGPTOptions: { fetch: mock.fetch } });
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    const base = 'http://127.0.0.1:' + server.address().port;
    const browser = await chromium.launch();
    const errors = [];
    try {
        for (const width of [1440, 390]) {
            const context = await browser.newContext({ viewport: { width, height: 950 } });
            await context.addInitScript(() => { localStorage.setItem('onboarding_done', 'true'); sessionStorage.setItem('kweekkompas_account_choice', 'local'); });
            await context.route('**/*', async route => {
                const url = new URL(route.request().url());
                if (url.origin === 'https://auth.openai.com') {
                    mock.state.auth = url;
                    const callback = new URL(url.searchParams.get('redirect_uri'));
                    callback.search = new URLSearchParams({ state: url.searchParams.get('state'), client_id: 'oaiapp_fixture', code: 'fixture' }).toString();
                    return route.fulfill({ status: 302, headers: { location: callback.href }, body: '' });
                }
                if (url.hostname !== '127.0.0.1') return route.abort();
                if (url.pathname === '/api/ai-config') return route.fulfill({ json: { defaultProvider: 'ollama', providers: { ollama: { configured: true, model: 'llama3:latest' }, gemini: { configured: true, model: '' }, chatgpt: { localAvailable: true, configured: false }, 'openai-compatible': { localAvailable: true } } } });
                if (url.pathname === '/api/ai-models') return route.fulfill({ json: { models: [{ id: 'gemini-fixture', label: 'Gemini Test' }], defaultModel: 'gemini-fixture' } });
                return route.continue();
            });
            const page = await context.newPage(); page.on('pageerror', error => errors.push(error.message));
            await page.goto(base); await page.waitForFunction(() => window.KweekServices);
            await page.evaluate(() => window.openSettingsSection('ai'));
            await page.waitForFunction(() => !document.querySelector('#ai-provider [value="chatgpt"]').disabled);
            await page.selectOption('#ai-provider', 'chatgpt');
            await page.waitForSelector('#chatgpt-login:enabled');
            if (await page.locator('#chatgpt-login').isHidden()) await page.locator('#chatgpt-management summary').click();
            await page.click('#chatgpt-login');
            await page.waitForFunction(() => document.querySelector('#ai-chatgpt-model').value === 'gpt-fixture');
            assert.equal(await page.locator('#chatgpt-account').textContent(), 'tuin@example.test');
            if (await page.locator('#chatgpt-acknowledge').isVisible()) await page.click('#chatgpt-acknowledge');
            await page.waitForSelector('#chatgpt-welcome[hidden]', { state: 'attached' });
            await page.click('#ai-settings-form button[type="submit"]');
            assert.deepEqual(await page.evaluate(() => JSON.parse(localStorage.getItem('kweekkompas_ai'))), { provider: 'chatgpt', model: 'gpt-fixture' });
            const result = await page.evaluate(async () => ({
                seed: await window.KweekServices.requestAI('seed-info', { name: 'Tomaat', existingFields: {} }),
                garden: await window.KweekServices.requestAI('tuinassistent', { question: 'Wat doe ik vandaag?', context: {} })
            }));
            assert.equal(result.seed.name, 'Tomaat'); assert.equal(result.garden.answer, 'Geef water.');
            assert.doesNotMatch(await page.evaluate(() => JSON.stringify({ ...localStorage, ...sessionStorage })), /test-access|test-refresh|id_token/);
            await page.selectOption('#ai-provider', 'ollama');
            assert.equal(await page.inputValue('#ai-model'), 'llama3:latest');
            assert.equal(await page.locator('#ollama-setup').isVisible(), true);
            await page.selectOption('#ai-provider', 'gemini');
            await page.waitForFunction(() => document.querySelector('#ai-gemini-model').value === 'gemini-fixture');
            assert.equal(await page.locator('#chatgpt-setup').isVisible(), false);
            await page.selectOption('#ai-provider', 'chatgpt');
            await page.waitForFunction(() => document.querySelector('#ai-chatgpt-model').value === 'gpt-fixture');
            await page.evaluate(() => { document.querySelector('#chatgpt-management').open = true; });
            await page.click('#chatgpt-logout');
            await page.waitForFunction(() => document.querySelector('#ai-chatgpt-model').disabled && document.querySelector('#chatgpt-logout').hidden);
            const unavailable = await page.evaluate(() => window.KweekServices.requestAI('seed-info', { name: 'Tomaat' }).then(() => '', error => error.message));
            assert.match(unavailable, /Log eerst in met ChatGPT/);
            const output = path.resolve(__dirname, '../scratch/chatgpt'); fs.mkdirSync(output, { recursive: true });
            await page.screenshot({ path: path.join(output, `settings-${width}.png`) });
            console.log(`PASS ${width}px: login, account, models, both helpers, Gemini/Ollama switching, logout`);
            await context.close();
        }
        assert.deepEqual(errors, []);
        for (const route of ['/.kweek-chatgpt.json', '/scripts/chatgpt.cjs', '/assets/..%5c.kweek-chatgpt.json']) assert.equal((await fetch(base + route)).status, 404);
        console.log('PASS no browser errors; credentials inaccessible as static files');
    } finally { await browser.close(); await new Promise(resolve => server.close(resolve)); fs.rmSync(dir, { recursive: true, force: true }); }
})().catch(error => { console.error(error); process.exitCode = 1; });
