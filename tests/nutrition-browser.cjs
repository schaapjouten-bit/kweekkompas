const assert = require('node:assert/strict');
const path = require('node:path');
const { chromium } = require('playwright');
const { createServer } = require('../scripts/dev-server.cjs');
const contract = require('../ai-contract.js');

(async () => {
    const nutrition = 'Bij aanplant: meng rijpe compost door de grond.\nTijdens groei: geef passende organische voeding.\nWanneer/hoe vaak: volg het etiket.\nLet op: geef niet te veel.';
    assert.match(contract.build('seed-info', { name: 'Tomaat', nutritionOnly: true }).system, /voedingsadvies/);
    assert.equal(contract.validate('seed-info', { nutrition }, { nutritionOnly: true }).nutrition, nutrition);
    const fixtureDir = path.resolve(__dirname, '../scratch/nutrition');
    const server = createServer({ localAPIFile: path.join(fixtureDir, 'local.json'), chatGPTFile: path.join(fixtureDir, 'gpt.json') });
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    const base = `http://127.0.0.1:${server.address().port}`;
    const browser = await chromium.launch();
    const requests = [];
    try {
        const context = await browser.newContext();
        await context.addInitScript(() => {
            localStorage.setItem('onboarding_done', 'true');
            sessionStorage.setItem('kweekkompas_account_choice', 'local');
            localStorage.setItem('kweekkompas_ai', '{"provider":"chatgpt","model":"fixture"}');
        });
        await context.route('**/*', route => {
            const url = new URL(route.request().url());
            if (url.origin !== base) return route.abort();
            if (url.pathname === '/api/auth') return route.fulfill({ json: { configured: false, user: null } });
            if (url.pathname.startsWith('/api/ai-')) return route.fulfill({ json: { defaultProvider: 'ollama', providers: {} } });
            if (url.pathname === '/api/seed-info') {
                const body = route.request().postDataJSON();
                requests.push(body);
                return route.fulfill({ json: body.nutritionOnly ? { nutrition: nutrition.replace('rijpe compost', 'compost') } : {
                    name: 'Tomaat', type: 'Groente', standplaats: 'Zon', waterbehoefte: 'Gemiddeld',
                    sow_months: ['maart'], harvest_months: ['augustus'], notes: 'Teeltadvies', nutrition, tags: []
                } });
            }
            return route.continue();
        });
        const page = await context.newPage();
        await page.goto(base);
        await page.waitForFunction(() => window.openAddForm);
        await page.evaluate(() => window.openAddForm());
        await page.fill('#naam', 'Tomaat');
        await page.click('#btn-auto-fill-info');
        await page.waitForFunction(() => document.querySelector('#voeding').value.includes('rijpe compost'));
        assert.equal(requests[0].nutritionOnly, undefined);
        await page.click('#btn-auto-fill-voeding');
        await page.waitForFunction(() => document.querySelector('#voeding').value.startsWith('Bij aanplant: meng compost'));
        assert.equal(requests[1].nutritionOnly, true);
        await page.fill('#voeding', 'Eigen voedingsadvies');
        await page.click('#btn-submit-form');
        await page.waitForFunction(async () => (await window.KweekLocalData.capture()).seeds.some(seed => seed.naam === 'Tomaat'));
        const saved = await page.evaluate(async () => (await window.KweekLocalData.capture()).seeds.find(seed => seed.naam === 'Tomaat'));
        assert.equal(saved.voeding, 'Eigen voedingsadvies');
        await page.evaluate(seed => window.openDetailView(seed), saved);
        assert.match(await page.locator('#view-detail').innerText(), /Voeding\s+Eigen voedingsadvies/);
        await page.click('#btn-detail-edit');
        assert.equal(await page.inputValue('#voeding'), 'Eigen voedingsadvies');
        console.log('PASS: AI vult voeding, aparte AI-knop, handmatig bewaren en terugzien');
        await context.close();
    } finally {
        await browser.close();
        await new Promise(resolve => server.close(resolve));
    }
})().catch(error => { console.error(error); process.exitCode = 1; });
