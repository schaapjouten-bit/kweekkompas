// Isolated dropdown/storage checks; GET responses simulated, all POSTs blocked.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const { chromium } = require('playwright');
const root = path.resolve(__dirname, '..');
const output = path.join(root, 'scratch/gemini-fallback');
const files = new Set(['index.html', 'app-v132.js', 'services.js', 'services.css', 'styles.css', 'calendar.css', 'onboarding.css', 'planner.css', 'wishlist.css']);
const server = http.createServer((req, res) => {
    const file = new URL(req.url, 'http://localhost').pathname.slice(1) || 'index.html';
    if ((!files.has(file) && !/^assets\/[\w/-]+\.(png|svg|jpg|webp)$/.test(file)) || !fs.existsSync(path.join(root, file))) { res.writeHead(404).end(); return; }
    const mime = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.svg': 'image/svg+xml' };
    res.writeHead(200, { 'Content-Type': (mime[path.extname(file)] || 'application/octet-stream') + '; charset=utf-8' });
    fs.createReadStream(path.join(root, file)).pipe(res);
});
const models = [
    { id: 'gemini-3.5-flash-lite', label: 'Gemini 3.5 Flash-Lite', hint: 'snel en zuinig' },
    { id: 'gemini-3.8-flash', label: 'Gemini 3.8 Flash', hint: 'tekstmodel' },
    { id: 'gemini-3.1-pro-preview', label: 'Gemini 3.1 Pro Preview', hint: 'preview' },
    { id: 'gemini-2.5-flash', label: 'Gemini 2.5 Flash', hint: 'tekstmodel' }
];
const configuration = { defaultProvider: 'gemini', providers: {
    gemini: { label: 'Gemini', configured: true, model: 'gemini-2.5-flash', models: [] },
    ollama: { label: 'Ollama', configured: true, available: true, model: 'llama3:latest', models: ['llama3:latest', 'qwen3:8b'] },
    'openai-compatible': { label: 'Eigen API', configured: true, model: 'my-custom-model', models: [] }
} };
const report = { checks: [], screenshots: [], errors: [], generationRequests: 0 };
(async () => {
    fs.mkdirSync(output, { recursive: true });
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    const base = `http://127.0.0.1:${server.address().port}`;
    const browser = await chromium.launch();
    async function setup({ theme = 'playful', width = 1440, preference, mode = 'success' } = {}) {
        const context = await browser.newContext({ viewport: { width, height: 960 } });
        let modelRequests = 0;
        let currentMode = mode;
        let resolveModels;
        const delayedModels = new Promise(resolve => { resolveModels = resolve; });
        await context.addInitScript(({ theme, preference }) => {
            localStorage.setItem('onboarding_done', 'true'); localStorage.setItem('theme', theme);
            if (preference && !localStorage.getItem('kweekkompas_ai')) localStorage.setItem('kweekkompas_ai', JSON.stringify(preference));
        }, { theme, preference });
        await context.route('**/*', async route => {
            const request = route.request(); const url = new URL(request.url());
            if (url.origin !== base) return route.abort();
            if (url.pathname.startsWith('/api/')) {
                if (request.method() !== 'GET') { report.generationRequests++; return route.abort(); }
                let data; let status = 200;
                if (url.pathname === '/api/ai-config') {
                    data = currentMode === 'backend-down' ? { error: 'Backend niet bereikbaar.' } : configuration;
                    if (currentMode === 'backend-down') status = 503;
                }
                else if (url.pathname === '/api/auth') data = { configured: false, user: null };
                else if (url.pathname === '/api/ai-models') {
                    modelRequests++;
                    if (currentMode === 'delayed') await delayedModels;
                    if (currentMode === 'network') return route.abort();
                    data = ['success', 'delayed'].includes(currentMode) ? { models, defaultModel: models[0].id } : currentMode === 'partial' ? { models: [models[2]], defaultModel: models[2].id } : currentMode === 'empty' ? { models: [], defaultModel: '' } : { error: 'Gemini-modellenlijst niet beschikbaar. Je bestaande keuze blijft behouden.' };
                    if (['error', 'backend-down'].includes(currentMode)) status = 502;
                } else { report.errors.push('Unexpected API route: ' + url.pathname); return route.abort(); }
                return route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(data) });
            }
            return route.continue();
        });
        const page = await context.newPage(); page.on('pageerror', error => report.errors.push(error.message));
        await page.goto(base); await page.waitForSelector('#home-ai-provider');
        assert.equal(modelRequests, 0, 'Dashboard must not fetch Gemini metadata');
        await page.evaluate(() => window.openSettingsSection('ai'));
        await page.waitForSelector('#ai-gemini-model:not([disabled])');
        if (['success', 'partial'].includes(currentMode)) await page.waitForSelector('#ai-gemini-model option[value="gemini-3.1-pro-preview"]', { state: 'attached' });
        return { context, page, count: () => modelRequests, succeed: () => { currentMode = 'success'; }, release: resolveModels };
    }
    async function save(page) {
        await page.locator('#ai-settings-form button[type="submit"]').click();
        await page.waitForFunction(() => document.querySelector('#ai-save-status').textContent.startsWith('Opgeslagen'));
        return page.evaluate(() => JSON.parse(localStorage.getItem('kweekkompas_ai')));
    }
    async function shot(page, file) {
        await page.locator('#settings-section-ai').screenshot({ path: path.join(output, file), animations: 'disabled' });
        report.screenshots.push(file);
    }
    async function checkHelperPayloads(page, model) {
        // Replace fetch in this isolated page: no POST or AI request reaches a server.
        const calls = await page.evaluate(async () => {
            const original = window.fetch;
            const calls = [];
            window.fetch = async (route, options) => {
                calls.push({ route, body: JSON.parse(options.body) });
                return new Response('{}', { headers: { 'Content-Type': 'application/json' } });
            };
            try {
                await window.KweekServices.requestAI('tuinassistent', { question: 'mock' });
                await window.KweekServices.requestAI('seed-info', { name: 'mock' });
                await window.KweekServices.requestAI('gemini-ai', { question: 'mock' });
            } finally { window.fetch = original; }
            return calls;
        });
        assert.deepEqual(calls.map(call => call.route), ['/api/tuinassistent', '/api/seed-info', '/api/gemini-ai']);
        for (const call of calls) assert.deepEqual(call.body.ai, { provider: 'gemini', model });
    }
    try {
        for (const theme of ['light', 'dark', 'playful']) for (const width of [1440, 390, 320]) {
            const { context, page, count } = await setup({ theme, width });
            assert.equal(await page.inputValue('#ai-gemini-model'), models[0].id);
            assert.equal(await page.locator('#ai-gemini-model option').count(), 4);
            assert.match(await page.locator('#ai-gemini-model').innerText(), /snel en zuinig/);
            assert(await page.locator('#ai-model').isHidden());
            if (theme === 'playful' && width !== 320) await shot(page, `warm-${width}-standaard.png`);
            await page.locator('#ai-gemini-model').focus(); await page.keyboard.press('ArrowDown'); await page.keyboard.press('Enter');
            await page.selectOption('#ai-gemini-model', 'gemini-3.8-flash');
            assert.deepEqual(await save(page), { provider: 'gemini', model: 'gemini-3.8-flash' });
            await checkHelperPayloads(page, 'gemini-3.8-flash');
            assert.match(await page.locator('#home-ai-provider').getAttribute('title'), /gemini-3.8-flash/);
            await shot(page, `${theme}-${width}-dropdown.png`);
            assert((await page.evaluate(() => document.documentElement.scrollWidth)) <= width);
            await page.selectOption('#ai-provider', 'ollama');
            assert(await page.locator('#ai-gemini-model').isHidden());
            assert.equal(await page.inputValue('#ai-model'), 'llama3:latest');
            assert.match(await page.locator('#ai-model-options').innerHTML(), /qwen3:8b/);
            await page.fill('#ai-model', 'qwen3:8b'); assert.deepEqual(await save(page), { provider: 'ollama', model: 'qwen3:8b' });
            await page.selectOption('#ai-provider', 'openai-compatible'); await page.fill('#ai-model', 'my-custom-model');
            assert.deepEqual(await save(page), { provider: 'openai-compatible', model: 'my-custom-model' });
            await page.selectOption('#ai-provider', 'gemini'); assert.equal(count(), 1);
            const other = await context.newPage(); await other.goto(base); await other.evaluate(() => window.openSettingsSection('ai'));
            await other.waitForFunction(() => document.querySelector('#ai-provider').value === 'openai-compatible');
            await other.selectOption('#ai-provider', 'gemini');
            await other.waitForFunction(() => document.querySelector('#ai-gemini-model').value === 'gemini-3.5-flash-lite');
            await other.selectOption('#ai-gemini-model', 'gemini-3.1-pro-preview'); await save(other);
            await page.waitForFunction(() => document.querySelector('#ai-gemini-model').value === 'gemini-3.1-pro-preview');
            assert.match(await page.locator('#home-ai-provider').getAttribute('title'), /gemini-3.1-pro-preview/);
            await page.reload(); await page.evaluate(() => window.openSettingsSection('ai'));
            await page.waitForFunction(() => document.querySelector('#ai-gemini-model').value === 'gemini-3.1-pro-preview' && !document.querySelector('#ai-gemini-model').disabled);
            assert.equal(await page.inputValue('#ai-gemini-model'), 'gemini-3.1-pro-preview');
            report.checks.push(`${theme}/${width}: dropdown, zuinige standaard, opslaan, Ollama/eigen API, tweede tab en herladen`);
            await context.close();
        }
        for (const mode of ['empty', 'error', 'network', 'backend-down']) {
            const preference = { provider: 'gemini', model: 'gemini-2.5-flash' };
            const { context, page, count, succeed } = await setup({ mode, preference, width: ['error', 'network'].includes(mode) ? 320 : 1440, theme: mode === 'network' ? 'dark' : 'playful' });
            assert.deepEqual(await page.evaluate(() => JSON.parse(localStorage.getItem('kweekkompas_ai'))), preference);
            assert.equal(await page.inputValue('#ai-gemini-model'), preference.model);
            assert.equal(await page.locator('#ai-gemini-model option').count(), 3);
            assert.equal(await page.locator('#ai-provider-status').innerText(), 'Standaardmodellen — beschikbaarheid nog niet gecontroleerd.');
            assert.deepEqual(await save(page), preference);
            await shot(page, `${mode}-bestaande-keuze.png`);
            assert(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth));
            for (const model of ['gemini-3.8-flash', 'gemini-3.5-flash-lite']) {
                assert.match(await page.locator(`#ai-gemini-model option[value="${model}"]`).innerText(), /niet gecontroleerd/);
                await page.selectOption('#ai-gemini-model', model);
                assert.deepEqual(await save(page), { provider: 'gemini', model });
                await checkHelperPayloads(page, model);
            }
            for (let n = 0; n < 3; n++) {
                await page.selectOption('#ai-provider', 'ollama'); await page.selectOption('#ai-provider', 'gemini');
                await page.evaluate(() => window.openSettingsSection('ai'));
            }
            assert.equal(count(), 1, 'No retry on reopening/provider switching');
            // Recovery on the next page load; no automatic retries after a failure.
            succeed();
            await page.reload(); await page.evaluate(() => window.openSettingsSection('ai'));
            await page.waitForSelector('#ai-gemini-model option[value="gemini-3.1-pro-preview"]', { state: 'attached' });
            assert.equal(await page.inputValue('#ai-gemini-model'), 'gemini-3.5-flash-lite');
            assert.equal(await page.locator('#ai-gemini-model option').count(), 4);
            assert.doesNotMatch(await page.locator('#ai-provider-status').innerText(), /Standaardmodellen/);
            assert.deepEqual(await save(page), { provider: 'gemini', model: 'gemini-3.5-flash-lite' });
            assert.equal(count(), 2);
            report.checks.push(`${mode}: opgeslagen keuze en selecteerbare fallback, beide hulpen via fetchmock, één melding, geen herhaalde pogingen, herstel na herladen`);
            await context.close();
        }
        for (const chosen of ['gemini-2.5-flash', 'gemini-retired-choice']) {
            const preference = { provider: 'gemini', model: chosen };
            const { context, page } = await setup({ preference });
            assert.equal(await page.inputValue('#ai-gemini-model'), chosen);
            assert.equal(await page.locator('#ai-settings-form button[type="submit"]').isDisabled(), false);
            assert.deepEqual(await page.evaluate(() => JSON.parse(localStorage.getItem('kweekkompas_ai'))), preference);
            assert.deepEqual(await save(page), preference);
            report.checks.push(`${chosen}: bestaande keuze behouden en opnieuw opslaan mogelijk`);
            await context.close();
        }
        for (const mode of ['empty', 'error']) {
            const { context, page, count } = await setup({ mode });
            assert.equal(await page.inputValue('#ai-gemini-model'), 'gemini-3.5-flash-lite');
            assert.equal(await page.evaluate(() => localStorage.getItem('kweekkompas_ai')), null);
            assert.equal(count(), 1);
            report.checks.push(`${mode}: zuinige fallbackstandaard; geen stilzwijgende 2.5 Flash of opslagwijziging`);
            await context.close();
        }
        {
            const { context, page, release } = await setup({ mode: 'delayed' });
            await page.selectOption('#ai-gemini-model', 'gemini-3.8-flash');
            assert.deepEqual(await save(page), { provider: 'gemini', model: 'gemini-3.8-flash' });
            release();
            await page.waitForSelector('#ai-gemini-model option[value="gemini-3.1-pro-preview"]', { state: 'attached' });
            assert.equal(await page.inputValue('#ai-gemini-model'), 'gemini-3.8-flash');
            assert.deepEqual(await save(page), { provider: 'gemini', model: 'gemini-3.8-flash' });
            report.checks.push('Late Models API-respons vult lijst aan zonder de inmiddels opgeslagen keuze te verliezen');
            await context.close();
        }
        {
            const { context, page } = await setup({ mode: 'partial', preference: { provider: 'gemini', model: 'gemini-retired-choice' } });
            assert.equal(await page.locator('#ai-gemini-model option').count(), 4);
            assert.equal(await page.inputValue('#ai-gemini-model'), 'gemini-retired-choice');
            assert.match(await page.locator('#ai-provider-status').innerText(), /Standaardmodellen/);
            await page.selectOption('#ai-gemini-model', 'gemini-3.8-flash');
            assert.deepEqual(await save(page), { provider: 'gemini', model: 'gemini-3.8-flash' });
            report.checks.push('Gedeeltelijke lijst: API-modellen + fallback + opgeslagen keuze, zonder duplicaten of beschikbaarheidsclaims');
            await context.close();
        }
        assert.equal(report.generationRequests, 0); assert.deepEqual(report.errors, []);
        fs.writeFileSync(path.join(output, 'report.json'), JSON.stringify(report, null, 2));
        console.log(JSON.stringify({ ...report, screenshots: report.screenshots.length }, null, 2));
    } finally { await browser.close(); await new Promise(resolve => server.close(resolve)); }
})().catch(error => { console.error(error); process.exitCode = 1; });
