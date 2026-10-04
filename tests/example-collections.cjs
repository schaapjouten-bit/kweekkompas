// Only temporary browser contexts; never the user's browser or real services.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { chromium } = require('playwright');
const { createServer } = require('../scripts/dev-server.cjs');
const contract = require('../example-collections.js');
const root = path.resolve(__dirname, '..');
const hash = () => crypto.createHash('sha256').update(fs.readFileSync(path.join(root, 'laatste.json'))).digest('hex');
const sourceHash = hash();
const sample = JSON.parse(fs.readFileSync(path.join(root, 'assets/example-collections/kruiden-in-potten.json')));
const garden = JSON.parse(fs.readFileSync(path.join(root, 'assets/example-collections/voorbeeldtuin.json')));
const server = createServer();
const report = { checks: [], cloudReads: 0, cloudUploads: 0, aiRequests: 0, errors: [] };
const output = path.join(root, 'scratch/example-collections');
(async () => {
    assert.throws(() => contract.collection({ ...sample, userProfile: { name: 'Private' } }));
    assert.throws(() => contract.collection({ ...sample, seeds: [{ ...sample.seeds[0], ervaringen: 'Private' }] }));
    assert.throws(() => contract.manifest({ version: 1, collections: [{ id: 'test', name: 'Test', description: 'Test', file: '../laatste.json' }] }));
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    const base = `http://127.0.0.1:${server.address().port}`;
    const browser = await chromium.launch();
    fs.mkdirSync(output, { recursive: true });
    async function pageFor(width = 1440) {
        const context = await browser.newContext({ viewport: { width, height: 950 }, hasTouch: width < 769 });
        await context.addInitScript(() => {
            localStorage.setItem('onboarding_done', 'true');
            localStorage.setItem('userProfile', JSON.stringify({ name: 'Isolated', gardenType: 'Balkon', experience: 'Beginner' }));
        });
        await context.route('**/*', route => {
            const url = new URL(route.request().url());
            if (url.pathname === '/api/cloud-sync') {
                if (route.request().method() === 'GET') {
                    report.cloudReads++;
                    return route.fulfill({ json: { userId: 'isolated-user', snapshot: null } });
                }
                report.cloudUploads++;
                return route.abort();
            }
            if (/\/api\/(tuinassistent|gemini-ai|seed-info|ai-models)/.test(url.pathname)) report.aiRequests++;
            if (url.origin !== base) return route.abort();
            if (url.pathname === '/api/auth') return route.fulfill({ json: { configured: true, user: { id: 'isolated-user', email: 'isolated@example.invalid' } } });
            if (url.pathname === '/api/ai-config') return route.fulfill({ json: { defaultProvider: 'ollama', providers: { ollama: { configured: false } } } });
            if (url.pathname.startsWith('/api/')) return route.abort();
            return route.continue();
        });
        const page = await context.newPage();
        page.on('pageerror', error => report.errors.push(error.message));
        await page.goto(base); await page.waitForSelector('#view-home:not(.hidden)');
        await page.locator(width < 769 ? '.shell-mobile-settings' : '#shell-settings-button').click();
        await page.locator('.settings-storage-shortcut').click();
        await page.waitForSelector('[data-collection-id="kruiden-in-potten"]:enabled');
        return { context, page };
    }
    const capture = page => page.evaluate(() => window.KweekLocalData.capture());
    async function load(page, id, accept = true) {
        page.once('dialog', async dialog => {
            assert.match(dialog.message(), /eigen planten blijven bewaard/);
            assert.match(dialog.message(), /niets naar de cloud/);
            await (accept ? dialog.accept() : dialog.dismiss());
        });
        await page.locator(`[data-collection-id="${id}"]`).click();
        await page.waitForFunction(() => !document.querySelector('#example-collections-list button:disabled'));
        return page.locator('#example-garden-status').innerText();
    }
    try {
        for (const width of [1440, 390, 320]) {
            const { context, page } = await pageFor(width);
            const originals = [
                { ...sample.seeds[0], id: 'kruiden-in-potten:basilicum', naam: 'Eigen bewaarde plant', ervaringen: 'Private fixture' },
                { ...sample.seeds[1], id: 'own', naam: '  BIESLOOK  ', beschrijving: 'Eigen tekst' },
                { ...garden.seeds[0], naam: 'Eigen plant met conflicterend tuin-id' }
            ];
            await page.evaluate(seeds => window.KweekLocalData.restore({ backupVersion: 1, seeds,
                wishlist: [{ id: 'own-wish', name: 'Eigen wens', type: 'item' }], reminders: [{ id: 12, title: 'Eigen planning', date: '2026-11-04', done: false }] }), originals);
            const before = await capture(page);
            assert.match(await page.locator('#example-collections-list').innerText(), /45 planten/);
            assert.match(await page.locator('#example-collections-list').innerText(), /2 planten/);
            await page.screenshot({ path: path.join(output, `settings-${width}.png`) });
            assert.match(await load(page, 'kruiden-in-potten', false), /geannuleerd/);
            assert.deepEqual(await capture(page), before);
            assert.match(await load(page, 'kruiden-in-potten'), /^1 voorbeeldplanten toegevoegd/);
            const after = await capture(page);
            for (const plant of before.seeds) assert.deepEqual(after.seeds.find(item => item.id === plant.id), plant);
            const added = after.seeds.find(item => item.examplePlantKey === 'kruiden-in-potten:basilicum');
            assert.equal(added.id, 'kruiden-in-potten:basilicum-2');
            assert.deepEqual(after.wishlist, before.wishlist); assert.deepEqual(after.reminders, before.reminders); assert.deepEqual(after.userProfile, before.userProfile);
            assert.match(await load(page, 'kruiden-in-potten'), /^0 voorbeeldplanten toegevoegd/);
            assert.deepEqual(await capture(page), after);
            await page.evaluate(seed => saveSeed({ ...seed, naam: 'Hernoemd voorbeeld' }), added);
            assert.match(await load(page, 'kruiden-in-potten'), /^0 voorbeeldplanten toegevoegd/);
            assert.match(await load(page, 'voorbeeldtuin'), /^45 voorbeeldplanten toegevoegd/);
            const loaded = await capture(page);
            assert.equal(loaded.seeds.find(seed => seed.examplePlantKey === garden.seeds[0].id).id, garden.seeds[0].id + '-2');
            assert.equal(new Set(loaded.seeds.map(seed => String(seed.id))).size, loaded.seeds.length);
            assert.match(await load(page, 'voorbeeldtuin'), /^0 voorbeeldplanten toegevoegd/);
            await page.locator('[data-collection-id="kruiden-in-potten"]').scrollIntoViewIfNeeded();
            await page.screenshot({ path: path.join(output, `storage-${width}.png`) });
            assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
            const button = await page.locator('#load-example-garden').boundingBox(); assert(button.width >= 44 && button.height >= 32);
            await page.reload(); await page.waitForSelector('#view-home:not(.hidden)');
            assert.deepEqual((await capture(page)).seeds, loaded.seeds);
            await page.evaluate(() => window.openInfoModal('data'));
            await page.waitForSelector('#load-example-garden:enabled');
            assert(await page.locator('#settings-panel').evaluate(panel => panel.classList.contains('open')));
            assert.match(await load(page, 'voorbeeldtuin'), /^0 voorbeeldplanten toegevoegd/);
            report.checks.push(`${width}px: normale ingang en oude data-ingang, metadata, bevestigen/annuleren, eigen gegevens, ID-conflicten, dubbele namen, herhaald laden en hernoemen, herladen, bediening zonder horizontale overflow`);
            await context.close();
        }
        // Plant ids belong to a collection: matching source ids in different
        // collections must not suppress unrelated plants.
        {
            const { context, page } = await pageFor();
            assert.match(await load(page, 'kruiden-in-potten'), /^2 voorbeeldplanten toegevoegd/);
            await page.route('**/assets/example-collections/voorbeeldtuin.json', route => route.fulfill({ json: {
                backupVersion: 1, seeds: [{ ...sample.seeds[0], naam: 'Andere collectieplant' }]
            } }));
            assert.match(await load(page, 'voorbeeldtuin'), /^1 voorbeeldplanten toegevoegd/);
            assert.equal((await capture(page)).seeds.length, 3);
            assert.match(await load(page, 'voorbeeldtuin'), /^0 voorbeeldplanten toegevoegd/);
            report.checks.push('Gelijke bron-id in verschillende collecties: beide planten toegevoegd, opnieuw laden zonder duplicaten');
            await context.close();
        }
        for (const mode of ['missing', 'syntax', 'invalid', 'private', 'manifest']) {
            const { context, page } = await pageFor(); const before = await capture(page);
            const file = mode === 'manifest' ? 'manifest.json' : 'kruiden-in-potten.json';
            await page.route(`**/assets/example-collections/${file}`, route => {
                if (mode === 'missing') return route.fulfill({ status: 404 });
                if (mode === 'syntax') return route.fulfill({ contentType: 'application/json', body: '{invalid' });
                return route.fulfill({ json: mode === 'private' ? { ...sample, userProfile: { name: 'Private' } } : mode === 'manifest' ? { version: 99 } : { backupVersion: 1, seeds: [{ ...sample.seeds[0], naam: '' }] } });
            });
            if (mode !== 'manifest') {
                await page.locator('[data-collection-id="kruiden-in-potten"]').click();
                await page.waitForFunction(() => /ontbreekt|ongeldige JSON|niet geldig/.test(document.getElementById('example-garden-status').textContent));
                assert.deepEqual(await capture(page), before);
            }
            await page.getByRole('button', { name: 'Lijst vernieuwen', exact: true }).click();
            await page.waitForFunction(() => document.getElementById('example-collections-list').getAttribute('aria-busy') === 'false');
            if (mode === 'manifest') assert.match(await page.locator('#example-garden-status').innerText(), /niet geldig/);
            else assert(await page.locator('[data-collection-id="kruiden-in-potten"]').isDisabled());
            assert.deepEqual(await capture(page), before);
            await page.unroute(`**/assets/example-collections/${file}`);
            await page.getByRole('button', { name: 'Lijst vernieuwen', exact: true }).click();
            await page.waitForSelector('[data-collection-id="kruiden-in-potten"]:enabled');
            report.checks.push(`${mode}: begrijpelijke melding, geen wijzigingen, lijst vernieuwen herstelt beschikbaarheid`);
            await context.close();
        }
        assert.equal(hash(), sourceHash); assert.equal(report.cloudUploads, 0); assert.equal(report.aiRequests, 0); assert.deepEqual(report.errors, []);
        fs.writeFileSync(path.join(output, 'report.json'), JSON.stringify(report, null, 2));
        console.log(JSON.stringify(report, null, 2));
    } finally { await browser.close(); await new Promise(resolve => server.close(resolve)); }
})().catch(error => { console.error(error); server.close(); process.exitCode = 1; });
