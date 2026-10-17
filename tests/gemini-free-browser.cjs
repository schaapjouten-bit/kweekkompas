// Full local UI/backend flow; Google responses are fixtures, no real key or AI usage.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { chromium } = require('playwright');
const { createServer } = require('../scripts/dev-server.cjs');
const output = path.resolve(__dirname, '../scratch/gemini-free');
const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'kweek-gemini-ui-'));
const file = path.join(directory, '.kweek-gemini-free.json');
const originalFetch = global.fetch;
const calls = [], errors = [], checks = [];
let failure = 0;
global.fetch = async (url, options) => {
    if (String(url).startsWith('https://generativelanguage.googleapis.com/')) {
        calls.push({ url: String(url), body: JSON.parse(options.body) });
        if (failure) return Response.json({ error: { message: 'Provider secret error' } }, { status: failure });
        return Response.json({ candidates: [{ content: { parts: [{ text: JSON.stringify({ ok: true, answer: 'Basilicum houdt van warmte.', actions: [], name: 'Basilicum', type: 'Kruid', notes: 'Testinformatie', sow_months: ['maart'], harvest_months: ['juli'], tags: [] }) }] } }] });
    }
    if (String(url).includes('127.0.0.1:11434/api/tags')) return Response.json({ models: [{ name: 'gemma4:latest' }] });
    return originalFetch(url, options);
};
(async () => {
    const server = createServer({ geminiFreeFile: file, chatGPTFile: path.join(directory, 'chatgpt.json') });
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
            assert.equal(await page.locator('#gemini-free-setup').isHidden(), true);
            assert.equal(calls.length, count);
            await page.selectOption('#ai-provider', 'gemini-free');
            await page.waitForFunction(() => !document.querySelector('#ai-settings-form button[type="submit"]').disabled);
            assert.equal(await page.inputValue('#ai-gemini-model'), 'gemini-3.5-flash-lite');
            assert.equal(await page.locator('#ai-gemini-model option').count(), 1);
            assert.equal(await submit.textContent(), 'Opslaan en testen');
            assert.equal(await page.locator('#gemini-free-key').getAttribute('type'), 'password');
            assert.equal(calls.length, count);
            await submit.click();
            assert.equal(calls.length, count, 'Empty key cannot trigger a test');
            await page.locator('#settings-section-ai').screenshot({ path: path.join(output, `${width}-sleutelveld.png`) });
            await page.fill('#gemini-free-key', 'neutral-browser-mock-key');
            failure = 403;
            await submit.click();
            await page.waitForFunction(() => document.querySelector('#ai-save-status').textContent.includes('weigert'));
            assert.equal(fs.existsSync(file), false);
            assert.deepEqual(await page.evaluate(() => JSON.parse(localStorage.getItem('kweekkompas_ai'))), { provider: 'gemini', model: 'gemini-3.8-flash' });
            assert.equal(await page.inputValue('#gemini-free-key'), '');
            failure = 0;
            await page.fill('#gemini-free-key', 'neutral-browser-mock-key');
            await submit.click();
            await page.waitForFunction(() => document.querySelector('#ai-save-status').textContent.includes('Verbinding geslaagd'));
            assert.equal(calls.length, count + 2);
            assert.equal(await page.inputValue('#gemini-free-key'), '');
            assert.deepEqual(await page.evaluate(() => JSON.parse(localStorage.getItem('kweekkompas_ai'))), { provider: 'gemini-free', model: 'gemini-3.5-flash-lite' });
            assert.match(await page.locator('#home-ai-provider').innerText(), /Gemini – Free tier/);
            assert.equal(await page.evaluate(() => JSON.stringify({ ...localStorage, ...sessionStorage }).includes('neutral-browser-mock-key')), false);
            await page.locator('#settings-section-ai').screenshot({ path: path.join(output, `${width}-verbonden.png`) });
            assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
            await page.reload();
            await open();
            await page.waitForFunction(() => document.querySelector('#gemini-free-key-status').textContent.includes('lokaal opgeslagen'));
            assert.equal(await page.inputValue('#ai-provider'), 'gemini-free');
            assert.equal(await page.inputValue('#gemini-free-key'), '');
            assert.equal(calls.length, count + 2, 'Reload never re-tests the key');
            await page.click('.settings-close-button');
            await page.fill('#ai-question-input', 'Kan basilicum tegen vorst?');
            await page.click('#btn-ask-ai');
            await page.waitForSelector('#ai-assistant-output .ai-advies-card');
            await page.evaluate(() => window.openAddForm());
            await page.fill('#naam', 'Basilicum');
            await page.click('#btn-auto-fill-info');
            await page.waitForFunction(() => document.querySelector('#ai-source-status').textContent.includes('AI-voorstel opgehaald'));
            assert.equal(calls.length, count + 4);
            for (const call of calls.slice(count)) assert.match(call.url, /\/gemini-3\.5-flash-lite:generateContent$/);
            assert.deepEqual(await page.evaluate(() => window.KweekLocalData.captureCloud()), garden, 'Settings and AI suggestions preserve garden data');
            await open();
            await page.click('#gemini-free-delete');
            await page.waitForFunction(() => document.querySelector('#ai-save-status').textContent.includes('verwijderd'));
            assert.equal(fs.existsSync(file), false);
            await page.selectOption('#ai-provider', 'gemini');
            assert.equal(await page.locator('#ai-gemini-model option').count(), 2);
            await page.selectOption('#ai-gemini-model', 'gemini-3.8-flash');
            await submit.click();
            assert.deepEqual(await page.evaluate(() => JSON.parse(localStorage.getItem('kweekkompas_ai'))), { provider: 'gemini', model: 'gemini-3.8-flash' });
            assert.equal(await page.locator('#gemini-free-setup').isHidden(), true);
            assert.equal(await submit.textContent(), 'AI-keuze opslaan');
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
    }
})().catch(error => { console.error(error); process.exitCode = 1; }).finally(() => {
    global.fetch = originalFetch;
    fs.rmSync(directory, { recursive: true, force: true });
});
