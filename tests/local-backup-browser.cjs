const assert = require('node:assert/strict');
const fs = require('node:fs');
const { chromium } = require('playwright');
const { createServer } = require('../scripts/dev-server.cjs');

const seed = (id, naam) => ({ id, naam, type: 'Groente', standplaats: 'Zon', status: 'Voorraad' });

(async () => {
    const server = createServer();
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    const browser = await chromium.launch({ headless: true });
    try {
        const context = await browser.newContext({ acceptDownloads: true });
        const page = await context.newPage();
        const errors = [];
        const cloudRequests = [];
        page.on('pageerror', error => errors.push(error.message));
        page.on('request', request => { if (/\/api\/cloud-sync(?:\?|$)/.test(request.url())) cloudRequests.push(request.url()); });
        page.on('dialog', dialog => dialog.accept());
        await page.addInitScript(() => sessionStorage.setItem('kweekkompas_account_choice', 'chosen'));
        await page.goto(`http://127.0.0.1:${server.address().port}`);
        await page.waitForFunction(() => window.KweekLocalData && document.querySelector('#view-onboarding:not(.hidden), #view-home:not(.hidden)'));
        await page.evaluate(async value => window.KweekLocalData.restore(value), { backupVersion: 1, seeds: [seed('original', 'Oorspronkelijke plant')] });

        await page.evaluate(() => window.openSettingsSection('storage'));
        await page.waitForSelector('#local-backup-status');
        assert.match(await page.locator('#local-backup-status').innerText(), /nog geen back-upmap gekozen/i);
        assert.equal(await page.locator('#settings-section-cloud').count(), 0);
        assert.equal(await page.locator('#settings-section-account').count(), 1);
        assert.equal(await page.getByRole('button', { name: 'Lokale tuin gebruiken' }).count(), 0);
        assert.equal(await page.getByRole('button', { name: 'Cloudtuin gebruiken' }).count(), 0);
        assert.equal(await page.getByRole('button', { name: 'Kies back-upmap' }).count(), 1);

        const downloadPromise = page.waitForEvent('download');
        await page.getByRole('button', { name: 'Back-up downloaden' }).click();
        const download = await downloadPromise;
        const backupPath = await download.path();
        const downloaded = JSON.parse(fs.readFileSync(backupPath, 'utf8'));
        assert.equal(downloaded.seeds[0].naam, 'Oorspronkelijke plant');

        await page.evaluate(async () => window.KweekLocalData.restore({ backupVersion: 1, seeds: [{ id: 'changed', naam: 'Tijdelijke plant', type: 'Bloem', standplaats: 'Zon', status: 'Voorraad' }] }));
        const chooserPromise = page.waitForEvent('filechooser');
        await page.locator('#settings-section-storage').getByRole('button', { name: 'Back-up herstellen' }).click();
        const chooser = await chooserPromise;
        await chooser.setFiles(backupPath);
        await page.waitForFunction(() => document.querySelector('#toast-container .toast')?.textContent.includes('hersteld'), null, { timeout: 5000 });
        await page.waitForLoadState('load').catch(() => {});

        assert.equal((await page.evaluate(async () => window.KweekLocalData.capture())).seeds[0].naam, 'Oorspronkelijke plant');
        assert.deepEqual(errors, []);
        assert.deepEqual(cloudRequests, []);
        console.log('Geslaagd: cloudkeuzes zijn uitgeschakeld; lokale back-up downloaden en JSON herstellen werken in de browser.');
        await context.close();
    } finally {
        await browser.close();
        await new Promise(resolve => server.close(resolve));
    }
})().catch(error => { console.error(error); process.exitCode = 1; });
