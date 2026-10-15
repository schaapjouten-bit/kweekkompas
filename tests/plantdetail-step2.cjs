// Only theme and plant detail checks; static local server, disposable browser data.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const { chromium } = require('playwright');
const root = path.resolve(__dirname, '..');
const output = path.join(root, 'scratch/plantdetail-step2');
const files = new Set(['index.html', 'app-v132.js', 'services.js', 'services.css', 'styles.css', 'calendar.css', 'onboarding.css', 'planner.css', 'wishlist.css', 'cloud-data.js', 'photo-storage.js', 'auto-sync.js', 'local-backup.js', 'local-drafts.js', 'plant-lifecycle.js', 'ai-contract.js', 'browser-ollama.js']);
const mime = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png' };
const server = http.createServer((req, res) => {
  const file = new URL(req.url, 'http://localhost').pathname.slice(1) || 'index.html';
  if ((!files.has(file) && !/^assets\/[a-z0-9/_-]+\.png$/i.test(file)) || !fs.existsSync(path.join(root, file))) { res.writeHead(404).end(); return; }
  res.writeHead(200, { 'Content-Type': `${mime[path.extname(file)]}; charset=utf-8` });
  fs.createReadStream(path.join(root, file)).pipe(res);
});
(async () => {
  fs.mkdirSync(output, { recursive: true });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const browser = await chromium.launch();
  const base = `http://127.0.0.1:${server.address().port}`;
  const report = { checks: [], screenshots: [], errors: [] };
  try {
    const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, timezoneId: 'Europe/Amsterdam', hasTouch: true });
    await context.route('**/*', route => {
      const url = new URL(route.request().url());
      if (url.origin === base && url.pathname === '/api/ai-config') return route.fulfill({ json: {
        defaultProvider: 'ollama',
        providers: { ollama: { configured: false, model: '', connection: { runtime: 'local', state: 'unavailable', installedModels: [] } }, gemini: { configured: false, model: '' }, chatgpt: { localAvailable: true, configured: false }, 'openai-compatible': { localAvailable: true } }
      } });
      return url.origin === base && !url.pathname.startsWith('/api/') ? route.continue() : route.abort();
    });
    const page = await context.newPage(); page.setDefaultTimeout(10000);
    page.on('pageerror', error => report.errors.push(`${error.message} at ${error.stack}`));
    await page.addInitScript(() => localStorage.setItem('onboarding_done', 'true'));
    await page.goto(base); await page.waitForSelector('#view-home:not(.hidden)');
    const common = { type: 'Sierplant', status: 'Gezaaid', fase_gezaaid: true, fase_groeit: false, fase_geoogst: false, isFavorite: false, lastSownYear: new Date().getFullYear(), tags: ['Eigen kenmerk'], zaaitijd: [], oogsttijd: [], beschrijving: '', ervaringen: '' };
    const complete = { ...common, id: 'complete', naam: 'Basilicum', type: 'Kruid', featuredImageUrl: 'assets/starters/basilicum.png', images: [{ url: 'assets/starters/basilicum.png' }, { url: 'assets/starters/courgette.png' }], detailImageCrop: { fit: 'contain', zoom: 1, x: 0.5, y: 0.5 }, tags: ['Eetbaar', 'Lastige kiemer'], standplaats: 'Zon', water: 'Gemiddeld', zaaitijd: ['maart', 'april', 'mei'], oogsttijd: ['juni', 'juli', 'augustus'], code: 'Bak A · balkon', purchaseYear: 2024, shopLink: 'https://winkel.example.test/basilicum', ervaringScore: 4, beschrijving: 'Eigen opgeslagen plantinformatie.\nTweede regel uit de eigen collectie.', ervaringen: 'Mijn eigen notitie over deze plant.' };
    const long = { ...complete, id: 'long', naam: 'Basilicum met een bijzonder lange eigen rasnaam voor het balkon en de moestuin '.repeat(3), beschrijving: 'Een lange eigen beschrijving. '.repeat(24) + 'Langwoord'.repeat(35), ervaringen: 'Lange eigen notitie. '.repeat(18) };
    const noPhoto = { ...common, id: 'no-photo', naam: 'Plant zonder opgeslagen foto', standplaats: 'Halfschaduw', water: 'Weinig', zaaitijd: ['september'] };
    const incomplete = { ...common, id: 'missing', naam: 'Plant met ontbrekende gegevens', tags: [] };
    const broken = { ...common, id: 'broken', naam: 'Plant met niet-beschikbare foto', featuredImageUrl: `${base}/missing-photo.png` };
    const formCrop = { ...common, id: 'form-crop', naam: 'Courgette voor de focustest', type: 'Groente', featuredImageUrl: 'assets/starters/courgette.png', images: [{ url: 'assets/starters/courgette.png' }] };
    await page.evaluate(async seeds => window.KweekLocalData.restore({ backupVersion: 1, seeds, wishlist: [{ id: 'wish', name: 'Bewaard verlanglijstitem', type: 'seed', image: 'assets/starters/basilicum.png', note: 'Stap 1 behouden' }], reminders: [], onboardingDone: 'true' }), [complete, long, noPhoto, incomplete, broken, formCrop]);
    await page.reload(); await page.waitForSelector('#view-home:not(.hidden)'); await page.waitForFunction(() => typeof window.KweekLocalData?.capture === 'function').catch(error => { throw new Error(`${error.message}; browser errors: ${report.errors.join(' | ')}`); });
    const initial = await page.evaluate(() => window.KweekLocalData.capture());
    const open = async id => { await page.evaluate(async ({ id, incomplete }) => { const snapshot = await window.KweekLocalData.capture(); window.openDetailView(id === 'missing' ? incomplete : snapshot.seeds.find(seed => seed.id === id)); }, { id, incomplete }); await page.waitForSelector('#view-detail:not(.hidden)'); };
    const shot = async file => { await page.locator('.toast').waitFor({ state: 'detached' }); await page.screenshot({ path: path.join(output, file), fullPage: true, animations: 'disabled' }); report.screenshots.push(file); };
    const layout = async width => {
      const metric = await page.evaluate(() => {
        const body = document.querySelector('#detail-page-body');
        const summary = document.querySelector('.detail-summary-column').getBoundingClientRect();
        const info = document.querySelector('.detail-information-column').getBoundingClientRect();
        const controls = [...document.querySelectorAll('#view-detail .btn-action-chip')].map(el => el.getBoundingClientRect());
        const overlap = controls.some((a, i) => controls.slice(i + 1).some(b => Math.min(a.right, b.right) > Math.max(a.left, b.left) && Math.min(a.bottom, b.bottom) > Math.max(a.top, b.top)));
        return { overflow: document.documentElement.scrollWidth > innerWidth, contentOverflow: body.scrollWidth > body.clientWidth, width: body.getBoundingClientRect().width, sameRow: Math.abs(summary.top - info.top) < 2, overlap };
      });
      assert.equal(metric.overflow, false); assert.equal(metric.contentOverflow, false); assert.equal(metric.overlap, false);
      if (width === 1440) { assert(metric.width > 900); assert(metric.sameRow); } else assert(!metric.sameRow);
    };
    for (const theme of ['light', 'dark', 'playful']) {
      await page.evaluate(theme => window.setAppTheme(theme), theme);
      for (const width of [1440, 390, 320]) {
        await page.setViewportSize({ width, height: width === 1440 ? 1000 : 844 });
        for (const id of ['complete', 'long', 'no-photo', 'missing', 'broken']) {
          await open(id);
          if (id === 'complete' || id === 'long') await page.waitForFunction(() => document.querySelector('.detail-hero-img')?.naturalWidth > 0);
          if (id === 'broken') await page.waitForSelector('.detail-photo-placeholder');
          await layout(width);
          assert.equal(await page.locator('#view-detail h1').textContent(), initial.seeds.find(seed => seed.id === id).naam);
          if (id === 'complete') {
            assert.equal(await page.locator('#view-detail .month-bubble').count(), 12);
            assert.equal(await page.locator('#view-detail .month-bubble.active').count(), 3);
            assert.equal(await page.getByRole('link', { name: 'Bekijk product', exact: true }).getAttribute('href'), complete.shopLink);
            assert.match(await page.locator('.detail-information-column').innerText(), /2024/);
            assert.match(await page.locator('.detail-information-column').innerText(), /Bak A/);
            assert.equal(await page.locator('#view-detail .star-rating').getAttribute('aria-label'), 'Ervaringsscore: 4 van 5');
          }
          if (id === 'missing') {
            assert.equal(await page.locator('#view-detail .month-bubble').count(), 0);
            assert.equal(await page.locator('#view-detail .detail-grid .detail-item').count(), 5);
            assert.match(await page.locator('.detail-information-column').innerText(), /Niet ingevuld/);
            assert.match(await page.locator('.detail-information-column').innerText(), /Geen informatie toegevoegd/);
            assert.equal(await page.getByRole('link', { name: 'Bekijk product', exact: true }).count(), 0);
            assert.doesNotMatch(await page.locator('.detail-information-column').innerText(), /Gekocht|2024|2026/);
          }
          const detailText = await page.locator('#view-detail').innerText();
          assert(!/\p{Extended_Pictographic}/u.test(detailText), 'detailicons are SVG, no emoji');
          const icons = await page.locator('#view-detail svg.plant-detail-icon path').evaluateAll(paths => paths.every(path => path.getAttribute('stroke-width') === '1.6'));
          assert(icons);
          await shot(`${theme}-${width}-${id}.png`);
        }
        await open('complete');
        await page.locator('.detail-carousel-item').first().press('Enter'); await page.waitForSelector('#lightbox:not(.hidden)');
        await page.locator('#lightbox-next').click(); await page.locator('#lightbox-close').click();
        await page.locator('#btn-detail-back').press('Enter'); await page.waitForSelector('#view-list:not(.hidden)');
        await open('complete'); await page.locator('#btn-detail-edit').press('Enter'); await page.waitForSelector('#view-add:not(.hidden)');
        assert.equal(await page.locator('#naam').inputValue(), complete.naam);
        assert.equal(await page.locator('#beschrijving').inputValue(), complete.beschrijving);
        if (theme === 'playful') {
          assert.equal(await page.locator('#naam').evaluate(el => getComputedStyle(el).borderRadius), '12px');
          await shot(`warm-${width}-bewerkvelden.png`);
        }
        report.checks.push(`${theme === 'playful' ? 'Warm' : theme}/${width}: volledige gegevens, lange naam/tekst, ontbrekende gegevens/foto en kapotte foto; kolommen, iconen, maanden, links, galerij, Overzicht en Bewerk`);
      }
      await page.setViewportSize({ width: 1440, height: 1000 });
      await open('complete');
      const favorite = page.getByRole('button', { name: 'Wissel favoriet', exact: true });
      await favorite.press('Enter'); await page.waitForFunction(() => document.querySelector('[data-detail-action="favorite"]')?.getAttribute('aria-pressed') === 'true');
      assert.equal(await page.evaluate(() => document.activeElement.dataset.detailAction), 'favorite');
      await favorite.press('Space'); await page.waitForFunction(() => document.querySelector('[data-detail-action="favorite"]')?.getAttribute('aria-pressed') === 'false');
      for (const action of ['Gezaaid', 'Groeit', 'Geoogst']) {
        const button = page.locator(`[data-detail-action="${action}"]`);
        const previous = await button.getAttribute('aria-pressed');
        await button.press('Enter'); await page.waitForFunction(({ action, previous }) => document.querySelector(`[data-detail-action="${action}"]`)?.getAttribute('aria-pressed') !== previous, { action, previous });
        assert.equal(await page.evaluate(() => document.activeElement.dataset.detailAction), action);
        await button.press('Space'); await page.waitForFunction(({ action, previous }) => document.querySelector(`[data-detail-action="${action}"]`)?.getAttribute('aria-pressed') === previous, { action, previous });
      }
      report.checks.push(`${theme}: status- en favorietknoppen behouden bestaande werking en toetsenbordfocus`);
    }
    const after = await page.evaluate(() => window.KweekLocalData.capture());
    const withoutSownAt = rows => rows.map(({ sownAt, ...seed }) => seed);
    assert.deepEqual(withoutSownAt(after.seeds), withoutSownAt(initial.seeds)); assert.deepEqual(after.wishlist, initial.wishlist); assert.deepEqual(after.reminders, initial.reminders);
    // Existing playful preference is selected as Warm, survives reload, and is not migrated.
    await page.evaluate(() => window.setAppTheme('playful'));
    await page.reload(); await page.waitForFunction(() => typeof window.KweekLocalData?.capture === 'function');
    assert.equal(await page.evaluate(() => document.documentElement.dataset.theme), 'playful');
    await page.evaluate(() => window.openSettingsSection('display'));
    assert.equal(await page.locator('[data-theme-choice="playful"] span').last().innerText(), 'Warm');
    assert.equal(await page.locator('[data-theme-choice="playful"]').getAttribute('aria-pressed'), 'true');
    assert.equal(await page.getByText('Levendig', { exact: true }).count(), 0);
    assert.equal(await page.evaluate(() => localStorage.getItem('theme')), 'playful');
    await shot('warm-instellingen.png');
    report.checks.push('Opgeslagen playful blijft playful na herladen en wordt in de interface Warm genoemd; eigen plantgegevens en verlanglijst behouden');
    await page.getByRole('button', { name: 'Instellingen sluiten' }).click();

    await open('form-crop');
    await page.locator('#btn-detail-back').click(); await page.waitForSelector('#view-list:not(.hidden)');
    await page.waitForFunction(() => document.querySelector('#seed-card-form-crop .seed-card-image')?.naturalWidth > 0);
    const formThumbnailBefore = await page.locator('#seed-card-form-crop .seed-card-image').evaluate(img => ({
      src: img.getAttribute('src'), style: img.getAttribute('style'), objectFit: getComputedStyle(img).objectFit, objectPosition: getComputedStyle(img).objectPosition
    }));
    await open('form-crop');
    await page.locator('#btn-detail-edit').click(); await page.waitForSelector('#view-add:not(.hidden)');
    assert.equal(await page.locator('#form-photo-focus').isVisible(), true);
    assert.equal((await page.locator('#form-photo-focus > span').textContent()).trim(), 'Zadenkaart');
    assert.equal((await page.locator('#btn-form-photo-focus').textContent()).trim(), 'Focus instellen');
    await page.locator('#btn-form-photo-focus').click();
    const cardZoom = page.locator('.detail-crop-zoom');
    assert.equal(await cardZoom.getAttribute('min'), '0.8');
    await cardZoom.evaluate(el => { el.value = '0.8'; el.dispatchEvent(new Event('input', { bubbles: true })); });
    assert.equal(await page.locator('.detail-crop-preview-backdrop').count(), 1);
    await page.getByRole('button', { name: 'Opslaan', exact: true }).click();
    await page.locator('#btn-submit-form').click(); await page.waitForSelector('#view-list:not(.hidden)');
    await page.waitForFunction(async () => (await window.KweekLocalData.capture()).seeds.find(seed => seed.id === 'form-crop')?.cardImageCrop?.zoom === 0.8);
    await page.waitForFunction(() => document.querySelector('#seed-card-form-crop .seed-card-image')?.style.position === 'absolute');
    assert.equal(await page.locator('#seed-card-form-crop .seed-card-image-backdrop').count(), 1);
    const formThumbnailAfter = await page.locator('#seed-card-form-crop .seed-card-image').evaluate(img => ({
      src: img.getAttribute('src'), style: img.getAttribute('style'), objectFit: getComputedStyle(img).objectFit, objectPosition: getComputedStyle(img).objectPosition
    }));
    assert.notDeepEqual(formThumbnailAfter, formThumbnailBefore);
    assert.equal(formThumbnailAfter.objectFit, 'fill');
    await page.reload(); await page.waitForFunction(() => typeof window.KweekLocalData?.capture === 'function');
    const formSavedCrop = await page.evaluate(async () => (await window.KweekLocalData.capture()).seeds.find(seed => seed.id === 'form-crop').cardImageCrop);
    assert.deepEqual(formSavedCrop, { fit: 'cover', zoom: 0.8, x: 0.5, y: 0.5 });
    await open('form-crop'); await page.locator('#btn-detail-back').click(); await page.waitForSelector('#view-list:not(.hidden)');
    await page.waitForFunction(() => document.querySelector('#seed-card-form-crop .seed-card-image')?.style.position === 'absolute');
    const reloadedThumbnail = await page.locator('#seed-card-form-crop .seed-card-image').evaluate(img => ({
      style: img.getAttribute('style'), objectFit: getComputedStyle(img).objectFit
    }));
    assert.equal(reloadedThumbnail.objectFit, 'fill');
    await open('form-crop'); await page.locator('#btn-detail-edit').click(); await page.waitForSelector('#view-add:not(.hidden)');
    assert.equal((await page.locator('#btn-form-photo-focus').textContent()).trim(), 'Focus aanpassen');
    await page.locator('#btn-form-photo-focus').click();
    assert.equal(await page.locator('.detail-crop-zoom').inputValue(), '0.8');
    assert.equal(await page.locator('.detail-crop-zoom').getAttribute('min'), '0.8');
    await page.locator('.detail-crop-cancel').click();
    report.checks.push('Focus instellen/bewerken stuurt de miniatuur, kan uitzoomen en blijft na herladen bewaard');

    await open('complete');
    await page.waitForFunction(() => document.querySelector('#seed-card-complete .seed-card-image')?.style.position === 'absolute');
    const legacyThumbnail = await page.locator('#seed-card-complete .seed-card-image').evaluate(img => ({
      style: img.getAttribute('style'), objectFit: getComputedStyle(img).objectFit
    }));
    assert.equal(legacyThumbnail.objectFit, 'fill');
    await open('complete');
    const hero = await page.locator('#view-detail .detail-hero-img').evaluate(img => ({
      src: img.getAttribute('src'), style: img.getAttribute('style'), objectFit: getComputedStyle(img).objectFit
    }));
    assert.equal(hero.src, complete.featuredImageUrl); assert.equal(hero.style, null); assert.equal(hero.objectFit, 'cover');
    assert.equal(await page.getByRole('button', { name: 'Headerfoto aanpassen voor Basilicum' }).count(), 0);
    await page.locator('#btn-detail-edit').click(); await page.waitForSelector('#view-add:not(.hidden)');
    assert.equal(await page.locator('#form-header-photo-focus').isVisible(), true);
    assert.equal((await page.locator('#form-header-photo-focus > span').textContent()).trim(), 'Detailpagina');
    assert.equal((await page.locator('#btn-form-header-photo-focus').textContent()).trim(), 'Focus instellen');
    await page.locator('#btn-form-header-photo-focus').click();
    assert.equal(await page.locator('.detail-crop-dialog h2').textContent(), 'Headerfoto aanpassen');
    assert.equal(await page.locator('.detail-crop-zoom').getAttribute('min'), '0.8');
    await page.locator('.detail-crop-zoom').evaluate(el => { el.value = '0.8'; el.dispatchEvent(new Event('input', { bubbles: true })); });
    assert.equal(await page.locator('.detail-crop-preview-backdrop').count(), 1);
    const headerPreview = await page.locator('.detail-crop-preview').boundingBox();
    await page.mouse.move(headerPreview.x + headerPreview.width / 2, headerPreview.y + headerPreview.height / 2);
    await page.mouse.down();
    await page.mouse.move(headerPreview.x + headerPreview.width / 2 + 24, headerPreview.y + headerPreview.height / 2, { steps: 3 });
    await page.mouse.up();
    await page.getByRole('button', { name: 'Opslaan', exact: true }).click();
    assert.equal(await page.locator('#view-detail:not(.hidden)').count(), 0);
    assert.equal(await page.locator('#form-header-photo-focus').isVisible(), true);
    await page.locator('#btn-submit-form').click(); await page.waitForSelector('#view-list:not(.hidden)');
    await page.waitForFunction(async () => (await window.KweekLocalData.capture()).seeds.find(seed => seed.id === 'complete')?.detailHeaderImageCrop?.zoom === 0.8);
    const cropData = await page.evaluate(async () => {
      const seed = (await window.KweekLocalData.capture()).seeds.find(item => item.id === 'complete');
      return { cardCrop: seed.cardImageCrop, headerCrop: seed.detailHeaderImageCrop };
    });
    assert.deepEqual(cropData.cardCrop, complete.detailImageCrop);
    assert.equal(cropData.headerCrop.fit, 'cover');
    assert.equal(cropData.headerCrop.zoom, 0.8);
    assert(cropData.headerCrop.x > 0.5, 'dragging the header image should change its saved horizontal position');
    assert.equal(cropData.headerCrop.y, 0.5);
    await page.waitForFunction(() => document.querySelector('#seed-card-complete .seed-card-image')?.style.position === 'absolute');
    const legacyThumbnailAfterHeaderEdit = await page.locator('#seed-card-complete .seed-card-image').getAttribute('style');
    assert.equal(legacyThumbnailAfterHeaderEdit, legacyThumbnail.style);
    await open('complete');
    await page.waitForFunction(() => document.querySelector('#view-detail .detail-hero-img')?.style.position === 'absolute');
    assert.equal(await page.locator('#view-detail .detail-hero-backdrop').count(), 1);
    const headerAfterSave = await page.locator('#view-detail .detail-hero-img').evaluate(img => ({
      style: img.getAttribute('style'), objectFit: getComputedStyle(img).objectFit
    }));
    assert(headerAfterSave.style); assert.equal(headerAfterSave.objectFit, 'fill');
    assert.equal(await page.locator('#view-detail .detail-header-crop-button').count(), 0);
    await page.reload(); await page.waitForFunction(() => typeof window.KweekLocalData?.capture === 'function');
    await open('complete');
    const persistedHeader = await page.locator('#view-detail .detail-hero-img').evaluate(img => ({
      style: img.getAttribute('style'), objectFit: getComputedStyle(img).objectFit
    }));
    assert(persistedHeader.style); assert.equal(persistedHeader.objectFit, 'fill');
    assert.equal(await page.locator('#view-detail .detail-header-crop-button').count(), 0);
    await page.locator('#btn-detail-edit').click(); await page.waitForSelector('#view-add:not(.hidden)');
    assert.equal((await page.locator('#form-header-photo-focus > span').textContent()).trim(), 'Detailpagina');
    assert.equal((await page.locator('#btn-form-header-photo-focus').textContent()).trim(), 'Focus aanpassen');
    await page.locator('#btn-form-header-photo-focus').click();
    assert.equal(await page.locator('.detail-crop-zoom').inputValue(), '0.8');
    await page.locator('.detail-crop-cancel').click();
    await page.evaluate(() => window.openAddForm()); await page.waitForSelector('#view-add:not(.hidden)');
    assert.equal(await page.locator('#form-header-photo-focus').isVisible(), false);
    report.checks.push('Detailheader uitsnede is alleen in bewerken instelbaar; detailpagina toont de opgeslagen uitsnede en kaartminiatuur blijft ongewijzigd');
    assert.deepEqual(report.errors, []);
    fs.writeFileSync(path.join(output, 'report.json'), JSON.stringify(report, null, 2));
    console.log(JSON.stringify({ checks: report.checks, screenshots: report.screenshots.length, errors: report.errors }, null, 2));
  } finally { await browser.close(); await new Promise(resolve => server.close(resolve)); }
})().catch(error => { console.error(error); process.exitCode = 1; });
