// The virtual folder survives real browser-storage deletion, like a user's disk folder.
const assert = require('node:assert/strict');
const { chromium } = require('playwright');
const { createServer } = require('../scripts/dev-server.cjs');
const { FILE_NAME, HISTORY_DIRECTORY } = require('../local-backup.js');

(async () => {
    const server = createServer();
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    const base = `http://127.0.0.1:${server.address().port}`;
    const browser = await chromium.launch();
    const disk = new Map();
    const errors = [];
    try {
        const context = await browser.newContext();
        await context.exposeBinding('backupDisk', (_source, { action, name, text }) => {
            if (action === 'read') return disk.get(name) ?? null;
            if (action === 'write') { disk.set(name, text); return true; }
        });
        await context.addInitScript(() => {
            function directory(prefix = '') {
                return {
                    name: prefix || 'Testback-ups',
                    queryPermission: async () => 'granted',
                    requestPermission: async () => 'granted',
                    getDirectoryHandle: async name => directory(prefix + name + '/'),
                    async getFileHandle(name, options = {}) {
                        const key = prefix + name;
                        if (!options.create && await window.backupDisk({ action: 'read', name: key }) === null) throw new DOMException('Missing', 'NotFoundError');
                        return {
                            getFile: async () => ({ text: async () => window.backupDisk({ action: 'read', name: key }), lastModified: Date.now() }),
                            async createWritable() {
                                let text;
                                return { write: async blob => { text = await blob.text(); }, close: async () => window.backupDisk({ action: 'write', name: key, text }), abort: async () => {} };
                            }
                        };
                    }
                };
            }
            window.showDirectoryPicker = async () => directory();
        });
        await context.route('**/*', route => new URL(route.request().url()).origin === base ? route.continue() : route.abort());
        const page = await context.newPage();
        page.on('pageerror', error => errors.push(error.message));
        await page.goto(base);
        await page.waitForFunction(() => window.KweekLocalData && window.KweekLocalBackupManager?.state().initialized);
        const originalPlant = { id: 'keep', naam: 'Oorspronkelijke tomaat', type: 'Groente', standplaats: 'Zon', status: 'Voorraad' };
        await page.evaluate(async plant => window.KweekLocalData.restore({ backupVersion: 1, seeds: [plant], onboardingDone: 'true' }), originalPlant);
        assert.equal(await page.evaluate(() => window.KweekLocalBackupManager.chooseDirectory()), true);
        const original = disk.get(FILE_NAME);
        assert.equal(JSON.parse(original).seeds[0].naam, originalPlant.naam);

        // Clear all origin storage (including IndexedDB); the folder on disk survives.
        const cdp = await context.newCDPSession(page);
        await cdp.send('Storage.clearDataForOrigin', { origin: base, storageTypes: 'all' });
        await page.reload();
        await page.waitForFunction(() => window.KweekLocalData && window.KweekLocalBackupManager?.state().initialized);
        assert.equal((await page.evaluate(() => window.KweekLocalData.capture())).seeds.length, 0);
        assert.equal(disk.get(FILE_NAME), original);
        assert.equal(await page.evaluate(() => window.KweekLocalBackupManager.chooseDirectory()), false);
        await page.evaluate(() => window.openSettingsSection('storage'));
        assert.match(await page.locator('#local-backup-status').innerText(), /bestaande back-up is behouden/);
        assert.equal(disk.get(FILE_NAME), original, 'Re-selecting the folder after real storage deletion cannot overwrite it');
        await page.evaluate(() => window.KweekLocalBackupManager.changed());
        assert.equal(disk.get(FILE_NAME), original);

        const replacement = { ...originalPlant, id: 'new', naam: 'Nieuwe plant na opslagverlies' };
        await page.evaluate(async plant => window.KweekLocalData.restore({ backupVersion: 1, seeds: [plant] }), replacement);
        await page.evaluate(() => window.KweekLocalBackupManager.flush());
        const versions = [...disk].filter(([name]) => name.startsWith(HISTORY_DIRECTORY + '/'));
        assert(versions.some(([, text]) => text === original), 'The original remains restorable after new plants are added');
        assert.equal(JSON.parse(disk.get(FILE_NAME)).seeds[0].naam, replacement.naam);
        await page.evaluate(async snapshot => window.KweekLocalData.restore(JSON.parse(snapshot)), original);
        assert.equal((await page.evaluate(() => window.KweekLocalData.capture())).seeds[0].naam, originalPlant.naam);
        assert.deepEqual(errors, []);
        console.log('Geslaagd: volledige browseropslag wissen, dezelfde map opnieuw kiezen, lege app blokkeren, oude versie bewaren na nieuwe plant en oorspronkelijke tuin herstellen.');
        await context.close();
    } finally {
        await browser.close();
        await new Promise(resolve => server.close(resolve));
    }
})().catch(error => { console.error(error); process.exitCode = 1; });
