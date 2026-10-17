const test = require('node:test');
const assert = require('node:assert/strict');
const { chromium } = require('playwright');

test('hosted Gemini Free tier: own key works on mobile, survives reload, stays out of backups and is removable', async () => {
    const { createServer } = require('../scripts/dev-server.cjs');
    const { handler } = require('../netlify/functions/_shared/gemini-free');
    const { callAI, providerConfig } = require('../netlify/functions/_shared/lib/ai');
    const originalFetch = global.fetch;
    const originalMode = process.env.KWEEK_LOCAL_DEV;
    const server = createServer();
    const local = globalThis.KweekGeminiFree;
    delete globalThis.KweekGeminiFree; // Emulate the hosted runtime without a local key file.
    const calls = [];
    global.fetch = async (url, options) => {
        if (String(url).includes('127.0.0.1:11434/api/tags')) return Response.json({ models: [] });
        if (!String(url).startsWith('https://generativelanguage.googleapis.com/')) return originalFetch(url, options);
        calls.push({ url: String(url), key: options.headers['x-goog-api-key'] });
        if (options.headers['x-goog-api-key'] === 'rejected-key') return Response.json({ error: { message: 'rejected-key' } }, { status: 403 });
        return Response.json({ candidates: [{ content: { parts: [{ text: JSON.stringify({ ok: true, answer: 'Testadvies', actions: [], name: 'Basilicum', type: 'Kruid', notes: 'Testinformatie', sow_months: ['maart'], harvest_months: ['juli'], tags: [] }) }] } }] });
    };
    let browser;
    try {
        process.env.KWEEK_LOCAL_DEV = 'false';
        assert.equal(providerConfig()['gemini-free'].available, true);
        assert.equal(providerConfig()['gemini-free'].localAvailable, false);
        await assert.rejects(callAI({ ai: { provider: 'gemini-free' } }, 'test', 'test'), { status: 400 });
        assert.equal(calls.length, 0);
        assert.deepEqual((await callAI({ ai: { provider: 'gemini-free', model: 'wrong-model', apiKey: 'production-own-key' } }, 'test', 'test')).ok, true);
        assert.match(calls[0].url, /gemini-3\.5-flash-lite:generateContent$/);
        assert.equal(calls[0].key, 'production-own-key');
        const denied = await handler({ httpMethod: 'POST', headers: { host: 'app.test', origin: 'https://foreign.test' }, body: JSON.stringify({ action: 'save-test', apiKey: 'private-test-key' }) });
        assert.equal(denied.statusCode, 403);
        assert.equal(calls.length, 1);
        process.env.KWEEK_LOCAL_DEV = 'true';
        await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
        const base = `http://127.0.0.1:${server.address().port}`;
        browser = await chromium.launch();
        const context = await browser.newContext({ viewport: { width: 390, height: 900 }, isMobile: true, hasTouch: true });
        await context.addInitScript(() => localStorage.setItem('onboarding_done', 'true'));
        await context.route('**/*', route => new URL(route.request().url()).origin === base ? route.continue() : route.abort());
        await context.route('**/api/gemini-free', async route => {
            const request = route.request();
            const result = await handler({ httpMethod: request.method(), headers: { ...request.headers(), host: new URL(base).host, origin: base }, body: request.postData() });
            await route.fulfill({ status: result.statusCode, headers: result.headers, body: result.body });
        });
        const page = await context.newPage();
        page.setDefaultTimeout(8000);
        const open = async () => {
            await page.evaluate(() => window.openSettingsSection('ai'));
            await page.waitForFunction(() => !document.querySelector('#ai-provider option[value="gemini-free"]').disabled);
        };
        await page.goto(base); await open();
        const garden = await page.evaluate(() => window.KweekLocalData.captureCloud());
        await page.selectOption('#ai-provider', 'gemini-free');
        assert.equal(await page.inputValue('#ai-gemini-model'), 'gemini-3.5-flash-lite');
        const save = page.locator('#ai-settings-form button[type="submit"]');
        await page.fill('#gemini-free-key', 'hosted-personal-key'); await save.click();
        await page.waitForFunction(() => document.querySelector('#ai-save-status').textContent.includes('Verbinding geslaagd'));
        assert.equal(await page.inputValue('#gemini-free-key'), '');
        assert.equal(await page.evaluate(() => JSON.stringify(localStorage).includes('hosted-personal-key')), false);
        assert.deepEqual(await page.evaluate(() => window.KweekLocalData.captureCloud()), garden);
        assert.equal(await page.evaluate(async () => JSON.stringify(await window.KweekLocalData.capture()).includes('hosted-personal-key')), false);
        await page.fill('#gemini-free-key', 'rejected-key'); await save.click();
        await page.waitForFunction(() => document.querySelector('#ai-save-status').textContent.includes('weigert'));
        await page.reload(); await open();
        await page.waitForFunction(() => document.querySelector('#gemini-free-key-status').textContent.includes('dit tabblad'));
        for (const route of ['tuinassistent', 'seed-info', 'gemini-ai']) {
            await page.evaluate(async route => window.KweekServices.requestAI(route, route === 'seed-info' ? { name: 'Basilicum' } : route === 'gemini-ai' ? { mode: 'garden_assistant', input: 'Testvraag', month: 10 } : { question: 'Testvraag' }), route);
            assert.equal(calls.at(-1).key, 'hosted-personal-key');
        }
        const second = await context.newPage(); await second.goto(base);
        await second.evaluate(() => window.openSettingsSection('ai'));
        await second.waitForFunction(() => document.querySelector('#gemini-free-key')?.required);
        await second.close();
        await page.click('#gemini-free-delete');
        await page.waitForFunction(() => document.querySelector('#ai-save-status').textContent.includes('verwijderd'));
        const before = calls.length;
        const status = await page.evaluate(async () => {
            try { await window.KweekServices.requestAI('tuinassistent', { question: 'Testvraag' }); }
            catch (error) { return error.status; }
        });
        assert.equal(status, 400); assert.equal(calls.length, before);
        assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
        await context.close();
    } finally {
        if (browser) await browser.close();
        if (server.listening) await new Promise(resolve => server.close(resolve));
        global.fetch = originalFetch; globalThis.KweekGeminiFree = local;
        if (originalMode === undefined) delete process.env.KWEEK_LOCAL_DEV; else process.env.KWEEK_LOCAL_DEV = originalMode;
    }
});
