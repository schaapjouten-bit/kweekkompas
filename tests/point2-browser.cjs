const assert = require('node:assert/strict');
const { chromium } = require('playwright');
const { createServer } = require('../scripts/dev-server.cjs');

(async () => {
    const server = createServer();
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    const browser = await chromium.launch({ headless: true });
    const context = await browser.newContext();
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    page.on('dialog', dialog => dialog.accept());
    await context.route('**/api/**', route => {
        return route.abort();
    });
    try {
        const base = `http://127.0.0.1:${server.address().port}`;
        await page.goto(base);
        await page.waitForFunction(() => window.KweekLocalData?.capture);
        await page.locator('.onboarding-next[data-next="2"]').click();
        await page.locator('[data-choice-group="places"][data-val="Volle grond"]').click();
        await page.locator('[data-choice-group="light"][data-val="Zon"]').click();
        await page.locator('.onboarding-next[data-next="3"]').click();
        await page.locator('#btn-onboarding-finish').click();
        await page.waitForFunction(() => localStorage.getItem('onboarding_done') === 'true');
        await page.waitForFunction(async () => (await window.KweekLocalData.capture()).seeds.length === 4);
        assert.equal((await page.evaluate(() => window.KweekLocalData.capture())).seeds.length, 4);

        await page.evaluate(() => window.switchView('add'));
        await page.fill('#naam', 'Mijn onvoltooide plant');
        await page.reload();
        await page.waitForFunction(() => window.KweekLocalData?.capture && !document.getElementById('view-list').classList.contains('hidden'));
        assert.equal(await page.evaluate(() => sessionStorage.getItem('kweekkompas_current_page')?.includes('"view":"list"')), true);
        await page.reload();
        await page.waitForFunction(() => window.KweekLocalData?.capture && !document.getElementById('view-list').classList.contains('hidden'));

        const own = { id: 'eigen-plant', naam: 'Mijn eigen plant', type: 'Groente', status: 'Voorraad', standplaats: 'Zon', water: 'Gemiddeld' };
        await page.evaluate(plant => window.KweekLocalData.restore({ backupVersion: 1, seeds: [plant], onboardingDone: 'true', userProfile: { name: 'Test', gardenType: 'Volle grond', experience: 'Beginner' } }), own);
        await page.reload();
        await page.waitForFunction(() => window.KweekLocalData?.capture);
        assert.equal((await page.evaluate(() => window.KweekLocalData.capture())).seeds.length, 1);

        await page.evaluate(() => window.openSettingsSection('storage'));
        assert.equal(await page.locator('#load-example-garden, #example-collections-list').count(), 0);
        assert.doesNotMatch(await page.locator('#settings-section-storage').innerText(), /voorbeeldplanten|proeftuin/i);
        const existing = await page.evaluate(() => window.KweekLocalData.capture());
        assert.equal(existing.seeds.length, 1);
        assert(existing.seeds.some(seed => seed.id === own.id && seed.naam === own.naam));
        assert.deepEqual(errors.filter(message => message !== 'Failed to fetch'), []);
        console.log('Vier starters, refresh naar lijst, bestaande plant behouden, geen Proeftuin-knop: OK');
    } finally {
        await context.close();
        await browser.close();
        await new Promise(resolve => server.close(resolve));
    }
})().catch(error => { console.error(error); process.exitCode = 1; });
