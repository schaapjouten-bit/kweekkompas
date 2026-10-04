// Temporary browsers and local service fixtures only. No real account/data writes.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');
const { createServer } = require('../scripts/dev-server.cjs');
const { startFixtures } = require('./service-fixtures.cjs');
const output = path.resolve(__dirname, '../scratch/ai-seed-cards');
const report = { checks: [], errors: [], aiCalls: [] };
(async () => {
    const fixture = await startFixtures();
    Object.assign(process.env, { SUPABASE_URL: fixture.base, SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_fixture', KWEEK_LOCAL_DEV: 'true' });
    const server = createServer();
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    const base = `http://127.0.0.1:${server.address().port}`;
    const browser = await chromium.launch();
    fs.mkdirSync(output, { recursive: true });
    try {
        for (const width of [1440, 390]) {
            const context = await browser.newContext({ viewport: { width, height: 950 }, timezoneId: 'Europe/Amsterdam' });
            await context.addInitScript(() => {
                localStorage.setItem('onboarding_done', 'true');
                sessionStorage.setItem('kweekkompas_account_choice', 'local');
            });
            let modelLists = 0;
            await context.route('**/*', route => {
                const url = new URL(route.request().url());
                if (url.origin !== base && url.origin !== fixture.base) return route.abort();
                if (url.pathname === '/api/ai-config') return route.fulfill({ json: { defaultProvider: 'gemini', providers: {
                    ollama: { label: 'Ollama', configured: true, model: 'llama3:latest' },
                    gemini: { label: 'Gemini', configured: true, model: '' }
                } } });
                if (url.pathname === '/api/ai-models') {
                    modelLists++;
                    return route.fulfill({ json: { models: [{ id: 'gemini-3.8-flash', label: '3.8 Flash' }, { id: 'gemini-3.5-flash-lite', label: '3.5 Flash-Lite' }], defaultModel: 'gemini-3.8-flash', rejected: [] } });
                }
                if (['/api/seed-info', '/api/tuinassistent', '/api/gemini-ai'].includes(url.pathname)) {
                    report.aiCalls.push({ route: url.pathname, ai: route.request().postDataJSON().ai });
                    return route.fulfill({ json: url.pathname === '/api/seed-info' ? {
                        name: 'Basilicum', type: 'Kruid', standplaats: 'Zon', waterbehoefte: 'Gemiddeld', sow_months: ['maart'], harvest_months: ['juli'], notes: 'Testadvies', tags: [], confidence: 'hoog', needs_review: true
                    } : { answer: 'Testadvies', actions: [] } });
                }
                return route.continue();
            });
            const page = await context.newPage();
            page.setDefaultTimeout(10000);
            page.on('pageerror', error => report.errors.push(error.message));
            await page.goto(base);
            await page.waitForFunction(() => window.KweekLocalData);
            const initialGarden = await page.evaluate(() => window.KweekLocalData.captureCloud());
            async function settings() {
                await page.evaluate(() => window.openSettingsSection('ai'));
                await page.waitForSelector('#ai-provider');
            }
            async function helpers(expected) {
                const start = report.aiCalls.length;
                await page.evaluate(async () => {
                    await window.KweekServices.requestAI('tuinassistent', { question: 'Test' });
                    await window.KweekServices.requestAI('seed-info', { name: 'Basilicum' });
                });
                assert.deepEqual(report.aiCalls.slice(start).map(c => c.ai), [expected, expected]);
            }
            await settings();
            assert.equal(await page.inputValue('#ai-provider'), 'ollama');
            assert.equal(await page.inputValue('#ai-model'), 'llama3:latest');
            assert.equal(modelLists, 0);
            await helpers({ provider: 'ollama', model: 'llama3:latest' });
            await page.reload(); await settings();
            assert.equal(await page.inputValue('#ai-provider'), 'ollama');
            assert.equal(modelLists, 0);
            const listResponse = page.waitForResponse(r => r.url().endsWith('/api/ai-models'));
            await page.selectOption('#ai-provider', 'gemini');
            await listResponse;
            assert.equal(modelLists, 1);
            assert.equal(await page.inputValue('#ai-gemini-model'), 'gemini-3.8-flash');
            for (const model of ['gemini-3.5-flash-lite', 'gemini-3.8-flash']) {
                await page.selectOption('#ai-gemini-model', model);
                await page.click('#ai-settings-form button[type="submit"]');
                await helpers({ provider: 'gemini', model });
            }
            await page.reload(); await settings();
            assert.equal(await page.inputValue('#ai-provider'), 'gemini');
            assert.equal(await page.inputValue('#ai-gemini-model'), 'gemini-3.8-flash');
            await helpers({ provider: 'gemini', model: 'gemini-3.8-flash' });
            assert.equal(modelLists, 2);
            await page.selectOption('#ai-provider', 'ollama');
            await page.fill('#ai-model', 'retained-model');
            await page.click('#ai-settings-form button[type="submit"]');
            await helpers({ provider: 'ollama', model: 'retained-model' });
            assert.equal(modelLists, 2);
            await page.reload(); await settings();
            assert.equal(await page.inputValue('#ai-model'), 'retained-model');
            assert.equal(modelLists, 2, 'Reload of Ollama does not request Gemini list');
            assert.deepEqual(await page.evaluate(() => window.KweekLocalData.captureCloud()), initialGarden);
            report.checks.push(`${width}: Ollama default, lazy validated Gemini list, both helper payloads, explicit saved choice after reload`);

            const seeds = [
                { id: 'fav', naam: 'Favoriet buiten seizoen', type: 'Kruid', status: 'Voorraad', isFavorite: true, zaaitijd: ['april'] },
                { id: 'season', naam: 'Deze maand', type: 'Groente', status: 'Voorraad', sow_months: ['oktober'] },
                { id: 'winter', naam: 'Winterfavoriet', type: 'Bloem', status: 'Voorraad', isFavorite: true, zaaitijd: 'September - Februari' },
                { id: 'other', naam: 'Overige', type: 'Groente', status: 'Groeit', zaaitijd: ['juni'] }
            ];
            await page.clock.install({ time: new Date('2026-10-04T12:00:00+02:00') });
            await page.evaluate(seeds => window.KweekLocalData.restore({ backupVersion: 1, seeds }), seeds);
            await page.reload();
            await page.waitForFunction(() => window.KweekLocalData);
            await page.evaluate(() => window.switchView('list'));
            const ids = async () => (await page.locator('#seed-grid .seed-card').evaluateAll(cards => cards.map(c => c.dataset.id))).sort();
            const select = mode => page.locator(`[data-seed-summary="${mode}"]`);
            assert.equal(await page.locator('#seed-summary-total').innerText(), '4');
            assert.equal(await page.locator('#seed-summary-favorites').innerText(), '2');
            assert.equal(await page.locator('#seed-summary-season').innerText(), '2');
            await select('favorites').click({ position: { x: 6, y: 6 } });
            assert.deepEqual(await ids(), ['fav', 'winter']);
            assert.equal(await select('favorites').getAttribute('aria-pressed'), 'true');
            await page.click('.filter-chip[data-filter="Kruid"]');
            assert.deepEqual(await ids(), ['fav']);
            await page.fill('#search-input', 'onvindbaar');
            assert.equal(await page.locator('#seed-grid .seed-card').count(), 0);
            await select('all').click();
            assert.deepEqual(await ids(), ['fav', 'other', 'season', 'winter']);
            assert.equal(await page.inputValue('#search-input'), '');
            assert.equal(await page.locator('.filter-chip.active').getAttribute('data-filter'), 'Alles');
            await select('season').focus(); await page.keyboard.press('Enter');
            assert.deepEqual(await ids(), ['season', 'winter']);
            assert.equal(await select('season').getAttribute('aria-pressed'), 'true');
            assert.equal(await page.locator('#seed-grid .seed-card').count(), Number(await page.locator('#seed-summary-season').innerText()));
            assert.equal(await select('season').evaluate(el => getComputedStyle(el).outlineStyle), 'solid');
            await select('favorites').focus(); await page.keyboard.press('Space');
            assert.deepEqual(await ids(), ['fav', 'winter']);
            await select('season').click();
            await page.locator('#view-list').screenshot({ path: path.join(output, `${width}-season.png`) });
            assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'No horizontal page overflow');
            await page.locator('#seed-card-season').press('Enter');
            await page.waitForSelector('#view-detail:not(.hidden)');
            assert.deepEqual(await page.evaluate(() => window.KweekLocalData.captureCloud()).then(p => p.seeds.map(s => s.id).sort()), ['fav', 'other', 'season', 'winter']);
            report.checks.push(`${width}: whole-card click, Enter/Space, active/focus, count=result, category/search intersection, reset, detail and no garden mutation`);
            await page.evaluate(() => window.KweekLocalData.restore({ backupVersion: 1, seeds: [] }));
            await page.reload(); await page.waitForFunction(() => window.KweekLocalData);
            await page.evaluate(() => window.switchView('list'));
            await select('favorites').click();
            assert.match(await page.locator('#seed-grid').innerText(), /geen favorieten/);
            await select('season').click();
            assert.match(await page.locator('#seed-grid').innerText(), /Geen zaden om deze maand/);
            await select('all').click();
            assert.match(await page.locator('#seed-grid').innerText(), /geen zaden toegevoegd/);
            report.checks.push(`${width}: three appropriate empty states`);
            await context.close();
        }
        assert.deepEqual(report.errors, []);
    } finally {
        fs.writeFileSync(path.join(output, 'report.json'), JSON.stringify(report, null, 2));
        await browser.close(); await new Promise(resolve => server.close(resolve)); await fixture.stop();
    }
    console.log(JSON.stringify(report, null, 2));
})().catch(error => { console.error(error); process.exitCode = 1; });
