// Isolated browser UI/transport checks; all generation requests use fixtures.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');
const { createServer } = require('../scripts/dev-server.cjs');
const output = path.resolve(__dirname, '../scratch/gemini-compact');
const catalog = {
    models: [{ id: 'gemini-3.8-flash', label: '3.8 Flash' }, { id: 'gemini-3.5-flash-lite', label: '3.5 Flash-Lite' }],
    defaultModel: 'gemini-3.8-flash', rejected: [{ id: 'gemini-2.5-pro', status: 404 }]
};
const report = { checks: [], errors: [], helperCalls: [] };
(async () => {
    const server = createServer();
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    const base = `http://127.0.0.1:${server.address().port}`;
    const browser = await chromium.launch();
    fs.mkdirSync(output, { recursive: true });
    try {
        for (const width of [1440, 390]) {
            const context = await browser.newContext({ viewport: { width, height: 950 } });
            await context.addInitScript(() => {
                localStorage.setItem('onboarding_done', 'true');
                sessionStorage.setItem('kweekkompas_account_choice', 'local');
            });
            let requests = 0, mode = 'success';
            await context.route('**/*', route => {
                const url = new URL(route.request().url());
                if (url.origin !== base) return route.abort();
                if (url.pathname === '/api/ai-config') return route.fulfill({ json: { defaultProvider: 'ollama', providers: {
                    ollama: { label: 'Ollama', configured: true, model: 'llama3:latest' },
                    gemini: { label: 'Gemini', configured: true, model: '' }
                } } });
                if (url.pathname === '/api/ai-models') {
                    requests++;
                    return mode === 'error' ? route.fulfill({ status: 502, json: { error: 'Lijst niet beschikbaar' } })
                        : route.fulfill({ json: mode === 'empty' ? { models: [], defaultModel: '', rejected: catalog.rejected } : catalog });
                }
                if (url.pathname === '/api/seed-info' || url.pathname === '/api/tuinassistent') {
                    report.helperCalls.push({ width, route: url.pathname, ai: route.request().postDataJSON().ai });
                    return route.fulfill({ json: url.pathname === '/api/seed-info'
                        ? { name: 'Basilicum', type: 'Kruid', standplaats: 'Zon', waterbehoefte: 'Gemiddeld', notes: 'Testadvies', sow_months: ['maart'], harvest_months: ['juli'], tags: [] }
                        : { answer: 'Testadvies', actions: [] } });
                }
                if (url.pathname.startsWith('/api/')) return route.fulfill({ json: { configured: false, user: null } });
                return route.continue();
            });
            const page = await context.newPage();
            page.setDefaultTimeout(10000);
            page.on('pageerror', error => report.errors.push(error.message));
            await page.goto(base);
            await page.waitForFunction(() => window.KweekLocalData);
            const garden = await page.evaluate(() => window.KweekLocalData.captureCloud());
            async function open() {
                await page.evaluate(() => window.openSettingsSection('ai'));
                await page.waitForSelector('#ai-provider');
            }
            async function options() {
                return page.locator('#ai-gemini-model option').evaluateAll(items => items.filter(item => item.value).map(item => ({ id: item.value, label: item.textContent })));
            }
            async function uiHelpers(model) {
                const start = report.helperCalls.length;
                await page.click('.settings-close-button');
                await page.evaluate(() => window.switchView('home'));
                await page.fill('#ai-question-input', 'Kan basilicum tegen vorst?');
                await page.click('#btn-ask-ai');
                await page.waitForSelector('#ai-assistant-output .ai-advies-card');
                await page.evaluate(() => window.openAddForm());
                await page.fill('#naam', 'Basilicum');
                await page.click('#btn-auto-fill-info');
                await page.waitForFunction(() => document.getElementById('ai-source-status').textContent.includes('AI-voorstel opgehaald'));
                assert.deepEqual(report.helperCalls.slice(start).map(call => call.ai), [{ provider: 'gemini', model }, { provider: 'gemini', model }]);
                await open();
            }
            await open();
            assert.equal(await page.inputValue('#ai-provider'), 'ollama');
            assert.equal(requests, 0);
            await page.selectOption('#ai-provider', 'gemini');
            await page.waitForFunction(() => document.getElementById('ai-gemini-model').options.length === 2);
            assert.deepEqual(await options(), catalog.models);
            assert.equal(await page.locator('#ai-gemini-model option[value="gemini-3-flash"]').count(), 0);
            assert.equal(await page.locator('#ai-gemini-model option[value="gemini-2.5-pro"]').count(), 0);
            await page.locator('#settings-section-ai').screenshot({ path: path.join(output, `${width}-dropdown.png`) });
            for (const candidate of catalog.models) {
                await page.selectOption('#ai-gemini-model', candidate.id);
                await page.click('#ai-settings-form button[type="submit"]');
                assert.deepEqual(await page.evaluate(() => JSON.parse(localStorage.getItem('kweekkompas_ai'))), { provider: 'gemini', model: candidate.id });
                await uiHelpers(candidate.id);
                await page.reload(); await open();
                await page.waitForFunction(() => !document.getElementById('ai-gemini-model').disabled);
                assert.equal(await page.inputValue('#ai-gemini-model'), candidate.id);
                await uiHelpers(candidate.id);
            }
            assert.deepEqual(await page.evaluate(() => window.KweekLocalData.captureCloud()), garden, 'Suggestions are not saved to the collection');
            report.checks.push(`${width}: only verified short options; both actual helper buttons use each saved model, including after reload`);

            await page.evaluate(() => localStorage.setItem('kweekkompas_ai', JSON.stringify({ provider: 'gemini', model: 'gemini-3-flash' })));
            await page.reload(); await open();
            await page.waitForFunction(() => document.getElementById('ai-provider-status').textContent.includes('geteste selectie'));
            assert.deepEqual(await options(), catalog.models);
            assert.equal(await page.inputValue('#ai-gemini-model'), '');
            assert.equal(await page.locator('#ai-settings-form button[type="submit"]').isDisabled(), true);
            assert.equal(await page.evaluate(() => JSON.parse(localStorage.getItem('kweekkompas_ai')).model), 'gemini-3-flash', 'An unavailable choice is not silently replaced');
            report.checks.push(`${width}: old 404 choice is absent and marked unavailable; saving requires a working selection`);

            for (const failure of ['empty', 'error']) {
                mode = failure;
                await page.reload(); await open();
                await page.waitForFunction(() => !document.getElementById('ai-provider-status').textContent.includes('controleren'));
                assert.deepEqual(await options(), []);
                assert.equal(await page.locator('#ai-gemini-model').isDisabled(), true);
                const before = requests;
                await page.selectOption('#ai-provider', 'ollama');
                assert.equal(await page.inputValue('#ai-model'), 'llama3:latest');
                assert.equal(await page.locator('#ai-settings-form button[type="submit"]').isDisabled(), false);
                await page.selectOption('#ai-provider', 'gemini');
                assert.equal(requests, before, 'No retry on provider switching');
            }
            report.checks.push(`${width}: no untested fallback after empty/error list; Ollama remains usable`);
            await context.close();
        }
        assert.deepEqual(report.errors, []);
        console.log(JSON.stringify({ checks: report.checks, errors: report.errors, helperRequests: report.helperCalls.length }, null, 2));
    } finally {
        fs.writeFileSync(path.join(output, 'browser-report.json'), JSON.stringify(report, null, 2));
        await browser.close(); await new Promise(resolve => server.close(resolve));
    }
})().catch(error => { console.error(error); process.exitCode = 1; });
