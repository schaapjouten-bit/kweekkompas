// All collection edits occur in temporary Playwright browser contexts.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const crypto = require('node:crypto');
const { chromium } = require('playwright');
const root = path.resolve(__dirname, '..');
const output = path.join(root, 'scratch/example-garden');
const exampleFile = 'assets/example-collections/voorbeeldtuin.json';
const example = JSON.parse(fs.readFileSync(path.join(root, exampleFile)));
const sourceHash = () => crypto.createHash('sha256').update(fs.readFileSync(path.join(root, 'laatste.json'))).digest('hex').toUpperCase();
const originalHash = sourceHash();
const allowed = new Set(['index.html', 'app-v132.js', 'example-collections.js', 'cloud-data.js', 'photo-storage.js', 'services.js', 'services.css', 'styles.css', 'calendar.css', 'onboarding.css', 'planner.css', 'wishlist.css']);
const server = http.createServer((req, res) => {
    const file = new URL(req.url, 'http://localhost').pathname.slice(1) || 'index.html';
    if ((!allowed.has(file) && !/^assets\/[\w./-]+\.(png|svg|jpg|webp|json)$/.test(file)) || file.includes('..') || !fs.existsSync(path.join(root, file))) return res.writeHead(404).end();
    const mime = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.svg': 'image/svg+xml', '.webp': 'image/webp' };
    res.writeHead(200, { 'Content-Type': mime[path.extname(file)] || 'application/octet-stream' });
    fs.createReadStream(path.join(root, file)).pipe(res);
});
const report = { checks: [], screenshots: [], errors: [], aiRequests: 0, cloudRequests: 0 };
(async () => {
    assert.deepEqual(Object.keys(example).sort(), ['backupVersion', 'seeds']);
    assert.equal(example.seeds.length, 45);
    for (const plant of example.seeds) {
        for (const field of ['ervaringen', 'code', 'purchaseYear', 'lastSownYear', 'userProfile', 'note', 'shopLink', 'isFavorite', 'ervaringScore', 'fase_gezaaid']) assert(!Object.hasOwn(plant, field), field);
        assert.equal(plant.status, 'Voorraad');
        for (const image of plant.images) {
            assert.deepEqual(Object.keys(image), ['url']);
            assert.match(image.url, /^assets\/example-garden\/photo-[a-f0-9]+\.(png|webp)$/);
            assert(fs.statSync(path.join(root, image.url)).size > 0);
        }
    }
    fs.mkdirSync(output, { recursive: true });
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    const base = `http://127.0.0.1:${server.address().port}`;
    const browser = await chromium.launch();
    async function contextFor(theme = 'playful', width = 1440) {
        const context = await browser.newContext({ viewport: { width, height: 950 }, timezoneId: 'Europe/Amsterdam', hasTouch: width < 769 });
        await context.addInitScript(theme => {
            localStorage.setItem('onboarding_done', 'true'); localStorage.setItem('theme', theme);
            if (!localStorage.getItem('userProfile')) localStorage.setItem('userProfile', JSON.stringify({ name: 'Isolated test profile', gardenType: 'Balkon', experience: 'Beginner' }));
            if (!localStorage.getItem('kweekkompas_ai')) localStorage.setItem('kweekkompas_ai', JSON.stringify({ provider: 'ollama', model: 'llama3:latest' }));
        }, theme);
        await context.route('**/*', route => {
            const request = route.request(), url = new URL(request.url());
            if (/\/api\/(tuinassistent|gemini-ai|seed-info|ai-models)/.test(url.pathname)) report.aiRequests++;
            if (url.pathname === '/api/cloud-sync') report.cloudRequests++;
            if (url.origin !== base) return route.abort();
            if (url.pathname === '/api/ai-config') return route.fulfill({ json: { defaultProvider: 'ollama', providers: { ollama: { label: 'Ollama', configured: true, model: 'llama3:latest' } } } });
            if (url.pathname === '/api/auth') return route.fulfill({ json: { configured: false, user: null } });
            return url.pathname.startsWith('/api/') ? route.abort() : route.continue();
        });
        return context;
    }
    async function pageFor(context) {
        const page = await context.newPage(); page.on('pageerror', e => report.errors.push(e.message));
        await page.goto(base); await page.waitForSelector('#view-home:not(.hidden)');
        return page;
    }
    async function capture(page) { return page.evaluate(() => window.KweekLocalData.capture()); }
    async function settings(page) {
        await page.evaluate(() => window.openSettingsSection('storage'));
        await page.waitForSelector('#load-example-garden:enabled');
        assert((await page.locator('#settings-section-storage').innerText()).includes('Je gegevens worden automatisch op dit apparaat opgeslagen.'));
        assert.doesNotMatch(await page.locator('#settings-section-storage').innerText(), /datasets/i);
        assert.equal(await page.locator('#settings-section-storage button[onclick="exportData()"], #settings-section-storage button[onclick="restoreBackup()"], #settings-section-storage button[onclick="importData()"]').count(), 3);
    }
    async function load(page, accept = true) {
        page.once('dialog', async dialog => {
            assert.match(dialog.message(), /eigen planten blijven bewaard/);
            await (accept ? dialog.accept() : dialog.dismiss());
        });
        await page.click('#load-example-garden');
        await page.waitForFunction(() => !document.getElementById('load-example-garden').disabled);
        return page.locator('#example-garden-status').innerText();
    }
    try {
        for (const theme of ['light', 'dark', 'playful']) for (const width of [1440, 390, 320]) for (const filled of [false, true]) {
            const context = await contextFor(theme, width);
            const page = await pageFor(context);
            const originals = filled ? [
                { ...example.seeds[0], id: example.seeds[0].id, naam: 'Eigen bewaarde plant', status: 'Groeit', fase_groeit: true, ervaringen: 'Eigen privé testnotitie' },
                { ...example.seeds[1], id: 9876, naam: '  ' + example.seeds[1].naam.toUpperCase() + '  ', beschrijving: 'Eigen omschrijving', isFavorite: true }
            ] : [];
            await page.evaluate(seeds => window.KweekLocalData.restore({ backupVersion: 1, seeds,
                wishlist: [{ id: 'own-wish', name: 'Eigen wens', type: 'item' }],
                reminders: [{ id: 12, title: 'Eigen planning', date: '2026-11-04', done: false }] }), originals);
            await settings(page);
            const before = await capture(page);
            const prefs = await page.evaluate(() => localStorage.getItem('kweekkompas_ai'));
            assert.match(await load(page, false), /geannuleerd/);
            assert.deepEqual(await capture(page), before);
            const expected = 45 - (filled ? 1 : 0);
            assert.match(await load(page), new RegExp(`^${expected} voorbeeldplanten toegevoegd`));
            const loaded = await capture(page);
            assert.equal(loaded.seeds.length, originals.length + expected);
            for (const plant of before.seeds) assert.deepEqual(loaded.seeds.find(s => String(s.id) === String(plant.id)), plant);
            assert.equal(new Set(loaded.seeds.map(s => String(s.id))).size, loaded.seeds.length);
            if (filled) assert.equal(loaded.seeds.find(s => s.examplePlantKey === example.seeds[0].id).id, example.seeds[0].id + '-2');
            const withoutSeeds = ({ seeds, ...rest }) => rest;
            assert.deepEqual(withoutSeeds(loaded), withoutSeeds(before));
            assert.equal(await page.evaluate(() => localStorage.getItem('kweekkompas_ai')), prefs);
            assert.match(await load(page), /^0 voorbeeldplanten toegevoegd/);
            assert.deepEqual(await capture(page), loaded);
            const shot = `${theme}-${width}-${filled ? 'gevuld' : 'leeg'}-instellingen.png`;
            await page.locator('#settings-section-storage').screenshot({ path: path.join(output, shot), animations: 'disabled' });
            report.screenshots.push(shot);
            assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
            // Decode first/last covers from local files and verify their album survives reload.
            const samples = [loaded.seeds.find(s => s.examplePlantKey === example.seeds[0].id), loaded.seeds.find(s => s.examplePlantKey === example.seeds.at(-1).id)].filter(Boolean);
            for (const plant of samples) {
                const url = plant.featuredImageUrl;
                assert(await page.evaluate(async url => { const image = new Image(); image.src = url; await image.decode(); return image.naturalWidth > 0 && image.naturalHeight > 0; }, url));
            }
            await page.reload(); await page.waitForSelector('#view-home:not(.hidden)');
            assert.deepEqual((await capture(page)).seeds, loaded.seeds);
            await settings(page); assert.match(await load(page), /^0 voorbeeldplanten toegevoegd/);
            // Renaming an example keeps its identity, so reloading cannot duplicate it.
            if (theme === 'playful' && width === 1440 && !filled) {
                const renamed = { ...samples[0], naam: 'Eigen gewijzigde voorbeeldnaam' };
                await page.evaluate(seed => saveSeed(seed), renamed);
                assert.match(await load(page), /^0 voorbeeldplanten toegevoegd/);
                assert.equal((await capture(page)).seeds.find(s => s.id === renamed.id).naam, renamed.naam);
            }
            report.checks.push(`${theme}/${width}/${filled ? 'gevuld' : 'leeg'}: bevestiging/annuleren, toevoegen, ID-conflict, bestaande gegevens behouden, opnieuw laden, foto's, herladen, geen cloud`);
            await context.close();
        }
        // Concurrent tabs must add each source plant exactly once.
        {
            const context = await contextFor(); const first = await pageFor(context); const second = await pageFor(context);
            await settings(first); await settings(second);
            await Promise.all([first.evaluate(() => { window.confirm = () => true; return window.loadExampleGarden(document.getElementById('load-example-garden')); }),
                second.evaluate(() => { window.confirm = () => true; return window.loadExampleGarden(document.getElementById('load-example-garden')); })]);
            const plants = (await capture(first)).seeds;
            assert.equal(plants.length, 45);
            assert.equal(new Set(plants.map(s => s.examplePlantKey)).size, 45);
            report.checks.push('Gelijktijdig laden in twee geïsoleerde tabbladen: geen conflicten of duplicaten');
            await context.close();
        }
        for (const invalid of [false, true]) {
            const context = await contextFor(); const page = await pageFor(context); await settings(page);
            const before = await capture(page);
            await page.route('**/assets/example-collections/voorbeeldtuin.json', route => invalid ? route.fulfill({ json: { backupVersion: 1, seeds: [example.seeds[0], { ...example.seeds[1], naam: '' }] } }) : route.fulfill({ status: 404, body: '' }));
            await page.click('#load-example-garden'); await page.waitForFunction(() => !document.getElementById('load-example-garden').disabled);
            assert.deepEqual(await capture(page), before);
            assert.match(await page.locator('#example-garden-status').innerText(), invalid ? /niet geldig/ : /ontbreekt/);
            await context.close();
        }
        assert.equal(sourceHash(), originalHash);
        assert.equal(sourceHash(), JSON.parse(fs.readFileSync(path.join(output, 'source-hash.json'), 'utf8').replace(/^\uFEFF/, '')).Hash);
        assert.equal(report.aiRequests, 0); assert.equal(report.cloudRequests, 0); assert.deepEqual(report.errors, []);
        fs.writeFileSync(path.join(output, 'report.json'), JSON.stringify(report, null, 2));
        console.log(JSON.stringify({ ...report, screenshots: report.screenshots.length, sourceUnchanged: true, plants: example.seeds.length }, null, 2));
    } finally { await browser.close(); await new Promise(resolve => server.close(resolve)); }
})().catch(error => { console.error(error); process.exitCode = 1; });
