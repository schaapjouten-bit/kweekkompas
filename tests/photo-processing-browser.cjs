// Disposable browser data; external services are blocked.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { chromium } = require('playwright');
const { createServer } = require('../scripts/dev-server.cjs');
(async () => {
    const server = createServer(); await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    const base = `http://127.0.0.1:${server.address().port}`, browser = await chromium.launch();
    const report = { checks: [], errors: [], liveWrites: 0 };
    try {
        for (const width of [1440, 390]) {
            const context = await browser.newContext({ viewport: { width, height: 1000 } });
            await context.addInitScript(() => {
                localStorage.setItem('onboarding_done', 'true');
                localStorage.setItem('userProfile', JSON.stringify({ name: 'Isolated', gardenType: 'Balkon', experience: 'Beginner' }));
            });
            await context.route('**/*', route => {
                const url = new URL(route.request().url());
                return url.origin === base && !url.pathname.startsWith('/api/') ? route.continue() : route.abort();
            });
            const page = await context.newPage(); page.on('pageerror', error => report.errors.push(error.message));
            await page.goto(base); await page.waitForFunction(() => window.KweekLocalData && window.KweekPhotoStorage);
            const results = await page.evaluate(async () => {
                const api = window.KweekPhotoStorage;
                const c = document.createElement('canvas'); c.width = 2400; c.height = 1200;
                const ctx = c.getContext('2d'), data = ctx.createImageData(c.width, c.height);
                let random = 123456;
                for (let i = 0; i < data.data.length; i += 4) {
                    random = (Math.imul(random, 1664525) + 1013904223) >>> 0;
                    data.data[i] = random & 255; data.data[i + 1] = (random >>> 8) & 255; data.data[i + 2] = (random >>> 16) & 255; data.data[i + 3] = 255;
                }
                ctx.putImageData(data, 0, 0); const original = c.toDataURL('image/png');
                const inspect = async src => {
                    const img = await new Promise((resolve, reject) => { const i = new Image(); i.onload = () => resolve(i); i.onerror = reject; i.src = src; });
                    return { width: img.naturalWidth, height: img.naturalHeight, bytes: (await (await fetch(src)).blob()).size, mime: src.slice(5, src.indexOf(';')) };
                };
                const compressed = await api.processDataURL(original, true);
                const file = new File([await (await fetch(original)).blob()], 'large.png', { type: 'image/png' });
                const fromFile = await api.processFile(file);
                window._photoTestFile = file;
                const payload = { backupVersion: 1, seeds: [{ id: 'large', naam: 'Large test', type: 'Groente', status: 'Groeit', images: [{ url: original }], featuredImageUrl: original }], wishlist: [{ id: 'w', name: 'Photo test', type: 'item', image: compressed }], userProfile: { name: 'Test', level: 1, photo: 'assets/default-avatar.png' } };
                await window.KweekLocalData.restore(payload);
                const before = window.KweekCloudData.stable(await window.KweekLocalData.capture());
                const prepared = await api.prepare(await window.KweekLocalData.captureCloud(), '11111111-1111-4111-8111-111111111111');
                const again = await api.prepare(await window.KweekLocalData.captureCloud(), '11111111-1111-4111-8111-111111111111');
                const after = window.KweekCloudData.stable(await window.KweekLocalData.capture());
                const changed = Object.keys(JSON.parse(before)).filter(key => JSON.stringify(JSON.parse(before)[key]) !== JSON.stringify(JSON.parse(after)[key]));
                const unchanged = after === before;
                const profileChanges = [...new Set([...Object.keys(JSON.parse(before).userProfile), ...Object.keys(JSON.parse(after).userProfile)])].filter(key => JSON.stringify(JSON.parse(before).userProfile[key]) !== JSON.stringify(JSON.parse(after).userProfile[key]));
                // Real profile handler uses the same processing before saving.
                window.handleProfilePhotoUpload({ target: { files: [file] } });
                await new Promise(resolve => { const timer = setInterval(() => { if (/^data:image\/(webp|jpeg)/.test(loadUserProfile().photo)) { clearInterval(timer); resolve(); } }, 20); });
                const profile = await inspect(loadUserProfile().photo);
                // Force WebP-unavailable fallback and impossible encoder output.
                const originalEncoder = HTMLCanvasElement.prototype.toDataURL;
                let jpeg, failed = '';
                try {
                    HTMLCanvasElement.prototype.toDataURL = function(mime, quality) { return originalEncoder.call(this, mime === 'image/webp' ? 'image/png' : mime, quality); };
                    jpeg = await inspect(await api.processDataURL(original, true));
                    HTMLCanvasElement.prototype.toDataURL = function(mime) { return `data:${mime};base64,` + 'A'.repeat(1_333_336); };
                    try { await api.processDataURL(original, true); } catch (error) { failed = error.message; }
                } finally { HTMLCanvasElement.prototype.toDataURL = originalEncoder; }
                return { original: await inspect(original), processed: await inspect(compressed), file: await inspect(fromFile), profile, jpeg, failed, unchanged, changed, profileChanges, files: prepared.files.length, uploadBytes: prepared.files[0].size, repeated: prepared.files[0].path === again.files[0].path };
            });
            assert(results.original.bytes > 1_000_000);
            for (const image of [results.processed, results.file, results.profile, results.jpeg]) {
                assert(image.bytes <= 1_000_000); assert.equal(image.width, 1600); assert.equal(image.height, 800);
                assert(['image/webp', 'image/jpeg'].includes(image.mime));
            }
            assert.equal(results.jpeg.mime, 'image/jpeg'); assert.match(results.failed, /maximaal 1 MB/);
            assert(results.unchanged, JSON.stringify([results.changed, results.profileChanges])); assert(results.repeated); assert.equal(results.files, 1); assert(results.uploadBytes <= 1_000_000);
            await page.evaluate(() => {
                window.openAddForm();
                const input = document.querySelector('#file-upload'), transfer = new DataTransfer();
                transfer.items.add(window._photoTestFile); input.files = transfer.files;
                input.dispatchEvent(new Event('change', { bubbles: true }));
            });
            await page.waitForFunction(() => [...document.querySelectorAll('.unified-gallery-card img')].some(img => /^data:image\/(webp|jpeg)/.test(img.src) && img.naturalWidth === 1600 && img.naturalHeight === 800));
            report.checks.push({ width, plantFileHandler: 'processed photo displayed in gallery' });
            report.checks.push({ width, ...results }); await context.close();
        }
        assert.deepEqual(report.errors, []);
        fs.mkdirSync('scratch/photo-processing', { recursive: true });
        fs.writeFileSync('scratch/photo-processing/report.json', JSON.stringify(report, null, 2));
        console.log(JSON.stringify(report, null, 2));
    } finally { await browser.close(); await new Promise(resolve => server.close(resolve)); }
})().catch(error => { console.error(error); process.exitCode = 1; });
