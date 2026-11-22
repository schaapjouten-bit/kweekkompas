const test = require('node:test');
const assert = require('node:assert/strict');
const { chromium } = require('playwright');
const { startFixtures, configureFixtures } = require('./service-fixtures.cjs');

test('hosted settings use shared credentials, while an old tab key can still be used under Gemini – eigen sleutel', async () => {
    const { createServer } = require('../scripts/dev-server.cjs');
    const fixture = await startFixtures();
    configureFixtures(fixture);
    process.env.KWEEK_LOCAL_DEV = 'false';
    process.env.GEMINI_FREE_API_KEY = 'hosted-shared-fixture-key';
    const server = createServer();
    const origin = 'https://kweekkompas.test';
    const originalFetch = global.fetch;
    const googleCalls = [];
    global.fetch = async (url, options) => {
        if (!String(url).startsWith('https://generativelanguage.googleapis.com/')) return originalFetch(url, options);
        googleCalls.push({ url: String(url), key: options.headers['x-goog-api-key'] });
        return originalFetch(fixture.base + '/gemini', options);
    };
    let browser;
    try {
        await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
        const local = 'http://127.0.0.1:' + server.address().port;
        browser = await chromium.launch();
        const context = await browser.newContext({ viewport: { width: 390, height: 900 }, isMobile: true, hasTouch: true });
        await context.addInitScript(() => {
            localStorage.setItem('onboarding_done', 'true');
            localStorage.setItem('kweekkompas_ai', JSON.stringify({ provider: 'gemini-free', model: 'gemini-3.5-flash-lite' }));
            sessionStorage.setItem('kweekkompas_gemini_free_session', 'legacy-tab-fixture-key');
        });
        await context.addCookies([{ name: 'kk_access', value: fixture.tokens.a, url: origin, httpOnly: true, secure: true }]);
        await context.route('**/*', async route => {
            const request = route.request();
            const url = new URL(request.url());
            if (url.origin !== origin) return route.abort();
            if (['/api/ai-config', '/api/gemini-free', '/api/tuinassistent', '/api/auth'].includes(url.pathname)) {
                const { handler } = require('../netlify/functions/_shared/' + url.pathname.slice(5));
                const result = await handler({
                    httpMethod: request.method(), headers: { ...await request.allHeaders(), host: url.host, origin },
                    body: request.postData() || ''
                });
                return route.fulfill({ status: result.statusCode, headers: result.headers, body: result.body });
            }
            if (url.pathname.startsWith('/api/')) return route.fulfill({ status: 404 });
            const result = await originalFetch(local + url.pathname);
            return route.fulfill({ status: result.status, contentType: result.headers.get('content-type') || 'text/plain', body: Buffer.from(await result.arrayBuffer()) });
        });
        const page = await context.newPage();
        await page.goto(origin);
        await page.waitForFunction(() => window.KweekServices);
        await page.evaluate(() => window.openSettingsSection('ai'));
        await page.waitForFunction(() => document.querySelector('#ai-provider-status')?.textContent.includes('Beschikbaar'));
        assert.equal(await page.locator('#gemini-free-key').isVisible(), false);
        assert.equal(await page.inputValue('#ai-gemini-model'), 'gemini-3.5-flash-lite');
        const ask = () => page.evaluate(() => window.KweekServices.requestAI('tuinassistent', { question: 'Testvraag' }));
        await ask();
        assert.ok(googleCalls.at(-1).key === 'hosted-shared-fixture-key');

        await page.selectOption('#ai-provider', 'gemini');
        await page.selectOption('#ai-gemini-model', 'gemini-3.8-flash');
        await page.check('#gemini-use-legacy-key');
        await page.locator('#ai-settings-form button[type="submit"]').click();
        await page.waitForFunction(() => document.querySelector('#ai-save-status').textContent.includes('Opgeslagen'));
        await ask();
        assert.ok(googleCalls.at(-1).key === 'legacy-tab-fixture-key');
        assert.match(googleCalls.at(-1).url, /gemini-3[.]8-flash:generateContent$/);
        assert.equal(await page.evaluate(() => JSON.stringify(localStorage).includes('legacy-tab-fixture-key')), false);
        assert.equal(fixture.geminiFreeUsage.get('a'), 1);
        await context.close();
    } finally {
        if (browser) await browser.close();
        if (server.listening) await new Promise(resolve => server.close(resolve));
        await fixture.stop();
        global.fetch = originalFetch;
    }
});
