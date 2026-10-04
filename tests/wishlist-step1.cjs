// Wishlist-only checks in isolated browser storage. No backend, AI or live user data.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const { chromium } = require('playwright');
const root = path.resolve(__dirname, '..');
const output = path.join(root, 'scratch/wishlist-step1');
const files = new Set(['index.html', 'app-v132.js', 'cloud-data.js', 'photo-storage.js', 'example-collections.js', 'services.js', 'services.css', 'styles.css', 'calendar.css', 'onboarding.css', 'planner.css', 'wishlist.css']);
const original = fs.readFileSync(path.join(root, 'assets/starters/basilicum.png'));
const replacement = fs.readFileSync(path.join(root, 'assets/starters/courgette.png'));
const mime = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png' };
const server = http.createServer((req, res) => {
  const file = new URL(req.url, 'http://localhost').pathname.slice(1) || 'index.html';
  if (file === 'test-images/original.png' || file === 'test-images/replacement.png') {
    res.writeHead(200, { 'Content-Type': 'image/png' }).end(file.includes('original') ? original : replacement); return;
  }
  const asset = /^assets\/[a-z0-9/_-]+\.png$/i.test(file);
  if ((!files.has(file) && !asset) || !fs.existsSync(path.join(root, file))) { res.writeHead(404).end(); return; }
  res.writeHead(200, { 'Content-Type': `${mime[path.extname(file)]}; charset=utf-8` });
  fs.createReadStream(path.join(root, file)).pipe(res);
});

(async () => {
  fs.mkdirSync(output, { recursive: true });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const browser = await chromium.launch();
  const base = `http://127.0.0.1:${server.address().port}`;
  const report = { checks: [], screenshots: [], errors: [] };
  const dataImage = `data:image/png;base64,${original.toString('base64')}`;
  const replacementImage = `data:image/png;base64,${replacement.toString('base64')}`;
  try {
    for (const theme of ['light', 'dark', 'playful']) for (const width of [1440, 390, 320]) {
      const context = await browser.newContext({ viewport: { width, height: width === 1440 ? 1000 : 844 }, timezoneId: 'Europe/Amsterdam', hasTouch: width !== 1440 });
      await context.route('**/*', route => {
        const url = new URL(route.request().url());
        return url.origin === base && !url.pathname.startsWith('/api/') ? route.continue() : route.abort();
      });
      const page = await context.newPage(); page.setDefaultTimeout(10000);
      page.on('pageerror', error => report.errors.push(`${theme}/${width}: ${error.message}`));
      await page.addInitScript(({ dataImage, base }) => {
        localStorage.setItem('onboarding_done', 'true');
        if (!localStorage.getItem('wishlist-test-initialized')) {
          localStorage.setItem('wishlist-test-initialized', 'true');
          localStorage.setItem('moestuin_wishlist', JSON.stringify([
            { id: 'data', name: 'Basilicum foto', type: 'seed', image: dataImage, note: 'Oorspronkelijke notitie', link: 'https://winkel.example.test/basilicum', bought: false, customField: 'behouden' },
            { id: 'remote', name: 'Foto via link', type: 'seed', image: `${base}/test-images/original.png`, note: 'Opgeslagen webfoto', link: 'https://winkel.example.test/foto' },
            { id: 'asset', name: 'Handschop met een heel lange naam voor het balkon en de moestuin', type: 'item', image: 'assets/starters/basilicum.png', note: 'Lange eigen notitie die op een smal scherm binnen de kaart moet blijven passen.', link: 'https://winkel.example.test/handschop' },
            { id: 'delete', name: 'Item verwijderen', type: 'item', image: '', note: 'Bevestiging testen', link: '' }
          ]));
        }
      }, { dataImage, base });
      const wishlistPage = async () => { await page.waitForFunction(() => typeof window.switchView === 'function' && !!window.KweekLocalData); await page.evaluate(() => window.switchView('wishlist')); await page.waitForSelector('#view-wishlist:not(.hidden)'); };
      const reload = async () => { await page.reload(); await page.waitForSelector('#view-home:not(.hidden)'); await wishlistPage(); };
      const card = name => page.locator('.wish-item-card').filter({ has: page.locator('.wish-title', { hasText: name }) });
      const readWishlist = () => page.evaluate(() => JSON.parse(localStorage.getItem('moestuin_wishlist')));
      const edit = async name => { await card(name).getByRole('button', { name: 'Bewerken', exact: true }).click(); await page.waitForSelector('#wishlist-detail-modal:not(.hidden)'); };
      const save = async () => { await page.locator('#btn-wish-save').click(); await page.waitForSelector('#wishlist-detail-modal.hidden', { state: 'attached' }); };
      const photoReady = () => page.waitForFunction(() => document.querySelector('#edit-wish-img-preview').naturalWidth > 0 && document.querySelector('#edit-wish-img-preview').style.display !== 'none');
      const screenshot = async name => { const file = `${theme}-${width}-${name}.png`; await page.screenshot({ path: path.join(output, file), fullPage: name !== 'bewerkvenster', animations: 'disabled' }); report.screenshots.push(file); };
      const layout = async () => {
        const issues = await page.evaluate(() => {
          const issues = [];
          if (document.documentElement.scrollWidth > innerWidth) issues.push('page overflow');
          const modal = document.querySelector('#wishlist-detail-modal:not(.hidden) .modal-content');
          if (modal && modal.scrollWidth > modal.clientWidth) issues.push('modal overflow');
          for (const card of document.querySelectorAll('#view-wishlist:not(.hidden) .wish-item-card')) {
            const controls = [...card.querySelectorAll('button')];
            const bounds = card.getBoundingClientRect();
            for (const control of controls) {
              const r = control.getBoundingClientRect();
              if (r.right > bounds.right + 1 || r.left < bounds.left - 1) issues.push('button outside card');
              if (control.closest('.wish-card-actions') && control.scrollWidth > control.clientWidth + 1) issues.push('button text overflow');
            }
            for (let i = 0; i < controls.length; i++) for (let j = i + 1; j < controls.length; j++) {
              const a = controls[i].getBoundingClientRect(), b = controls[j].getBoundingClientRect();
              if (Math.min(a.right, b.right) > Math.max(a.left, b.left) + 1 && Math.min(a.bottom, b.bottom) > Math.max(a.top, b.top) + 1) issues.push('overlapping controls');
            }
          }
          return issues;
        });
        assert.deepEqual(issues, [], `${theme}/${width}`);
      };
      await page.goto(base); await page.waitForSelector('#view-home:not(.hidden)'); await wishlistPage();
      const replacementImage = await page.evaluate(value => window.KweekPhotoStorage.processDataURL(value, true), `data:image/png;base64,${replacement.toString('base64')}`);
      await page.evaluate(theme => window.setAppTheme(theme), theme);
      const initial = await page.evaluate(() => window.KweekLocalData.capture());
      assert.equal(await page.locator('#btn-wishlist-add').count(), 0);
      assert.equal(await page.locator('.wishlist-eyebrow').count(), 0);
      assert(await page.locator('#wishlist-controls #wishlist-fast-add').isVisible());
      assert.equal(await page.locator('#wishlist-fast-add').evaluate(el => getComputedStyle(el).flexDirection), 'row');
      assert((await page.locator('#wishlist-controls').boundingBox()).height < (width === 1440 ? 100 : 190));
      await layout(); await screenshot('verlanglijst');

      // Both adding routes: button and Enter in the same integrated field.
      await page.locator('#wishlist-quick-input').fill('Basilicum nieuw');
      if (width === 1440) await page.locator('#btn-add-wish-quick').click(); else await page.locator('#btn-add-wish-quick').tap();
      await page.locator('#wishlist-quick-input').fill('Nieuwe pot'); await page.locator('#wishlist-quick-input').press('Enter');
      assert.equal((await readWishlist()).length, 6);
      await page.locator('#wishlist-search-input').fill('oorspronkelijke notitie');
      assert.equal(await page.locator('.wish-item-card').count(), 1);
      await page.locator('[data-wish-filter="item"]').click(); assert.match(await page.locator('#wishlist-items').innerText(), /Geen items gevonden/);
      await page.locator('#wishlist-search-input').fill(''); assert.equal(await page.locator('.wish-item-card').count(), 3);
      await page.locator('[data-wish-filter="seed"]').click(); assert.equal(await page.locator('.wish-item-card').count(), 3);
      await page.locator('[data-wish-filter="all"]').click();

      // Editing a local photo keeps the exact bytes, extra fields and saved notes.
      await edit('Basilicum foto'); await photoReady();
      assert.equal(await page.locator('#edit-wish-img-url').inputValue(), '');
      assert.equal(await page.locator('#wish-image-link').getAttribute('open'), null);
      const sizes = await page.evaluate(() => ({ save: document.querySelector('#btn-wish-save').getBoundingClientRect().width, body: document.querySelector('.wishlist-modal-body').getBoundingClientRect().width }));
      assert(sizes.save < sizes.body * .6);
      await layout(); await screenshot('bewerkvenster');
      await page.locator('#edit-wish-name').fill('Basilicum foto bewerkt');
      await page.locator('#edit-wish-note').fill('Notities gewijzigd zonder fotoverlies'); await save();
      await reload();
      let updated = (await readWishlist()).find(item => item.id === 'data');
      assert.equal(updated.image, dataImage); assert.equal(updated.note, 'Notities gewijzigd zonder fotoverlies'); assert.equal(updated.customField, 'behouden');

      // Upload replaces a saved web photo only on Save; cancel discards the draft.
      await edit('Foto via link');
      await page.locator('#edit-wish-img-file').setInputFiles({ name: 'vervanging.png', mimeType: 'image/png', buffer: replacement });
      await page.waitForFunction(src => document.querySelector('#edit-wish-img-preview').src === src && !document.querySelector('#btn-wish-save').disabled, replacementImage);
      assert.equal((await readWishlist()).find(item => item.id === 'remote').image, `${base}/test-images/original.png`);
      await page.locator('#btn-close-wish-modal').click();
      await edit('Foto via link'); assert.equal(await page.locator('#edit-wish-img-preview').getAttribute('src'), `${base}/test-images/original.png`);
      const chooser = page.waitForEvent('filechooser'); await page.locator('#btn-wish-upload').press('Enter');
      await (await chooser).setFiles({ name: 'vervanging.png', mimeType: 'image/png', buffer: replacement });
      await page.waitForFunction(src => document.querySelector('#edit-wish-img-preview').src === src && !document.querySelector('#btn-wish-save').disabled, replacementImage);
      assert.equal(await page.locator('#edit-wish-img-url').inputValue(), '');
      await save(); await reload(); assert.equal((await readWishlist()).find(item => item.id === 'remote').image, replacementImage);

      // Pasting a real image file and a separate URL retain the existing features.
      await edit('Basilicum foto bewerkt');
      await page.evaluate(base64 => {
        const bytes = Uint8Array.from(atob(base64), char => char.charCodeAt(0));
        const clipboard = new DataTransfer(); clipboard.items.add(new File([bytes], 'geplakt.png', { type: 'image/png' }));
        document.querySelector('#edit-wish-note').dispatchEvent(new ClipboardEvent('paste', { bubbles: true, cancelable: true, clipboardData: clipboard }));
      }, replacement.toString('base64'));
      await page.waitForFunction(src => document.querySelector('#edit-wish-img-preview').src === src && !document.querySelector('#btn-wish-save').disabled, replacementImage);
      await save(); await reload(); assert.equal((await readWishlist()).find(item => item.id === 'data').image, replacementImage);
      await edit('Basilicum foto bewerkt'); await page.locator('#wish-image-link summary').click();
      await page.locator('#edit-wish-img-url').fill(`${base}/test-images/replacement.png`); await photoReady(); await save(); await reload();
      assert.equal((await readWishlist()).find(item => item.id === 'data').image, `${base}/test-images/replacement.png`);

      // Online action uses the existing safe opener, without contacting a webshop.
      await page.evaluate(() => { window.open = (...args) => { window.wishlistTestOpened = args; return null; }; });
      await card('Basilicum foto bewerkt').getByRole('button', { name: 'Bekijk online', exact: true }).click();
      assert.deepEqual(await page.evaluate(() => window.wishlistTestOpened), ['https://winkel.example.test/basilicum', '_blank', 'noopener,noreferrer']);
      await page.locator('#wishlist-search-input').fill('nieuwe pot');
      const cancel = page.waitForEvent('dialog').then(dialog => { assert.equal(dialog.type(), 'confirm'); return dialog.dismiss(); });
      await card('Nieuwe pot').getByRole('button', { name: 'Verwijder Nieuwe pot', exact: true }).click(); await cancel;
      assert.equal(await page.locator('.wish-item-card').count(), 1);
      const accept = page.waitForEvent('dialog').then(dialog => dialog.accept());
      await card('Nieuwe pot').getByRole('button', { name: 'Verwijder Nieuwe pot', exact: true }).click(); await accept;
      assert.equal(await page.locator('.wish-item-card').count(), 0);
      await page.locator('#wishlist-search-input').fill('');

      // Conversion uses the unchanged saveSeed route, in this disposable browser only.
      const beforeConversion = await page.evaluate(() => window.KweekLocalData.capture());
      assert.deepEqual(beforeConversion.seeds, initial.seeds);
      await card('Basilicum foto bewerkt').getByRole('button', { name: 'Naar zaden', exact: true }).click();
      await page.waitForFunction(async () => (await window.KweekLocalData.capture()).seeds.some(seed => seed.naam === 'Basilicum foto bewerkt'));
      const after = await page.evaluate(() => window.KweekLocalData.capture());
      const converted = after.seeds.find(seed => seed.naam === 'Basilicum foto bewerkt');
      assert.equal(converted.featuredImageUrl, `${base}/test-images/replacement.png`);
      assert.equal(converted.images[0].url, `${base}/test-images/replacement.png`);
      assert.equal(converted.beschrijving, 'Notities gewijzigd zonder fotoverlies');
      assert(!after.wishlist.some(item => item.id === 'data'));
      assert.deepEqual(after.reminders, initial.reminders); assert.deepEqual(after.userProfile, initial.userProfile); assert.deepEqual(after.settings, initial.settings);
      assert.deepEqual(after.wishlist.find(item => item.id === 'asset'), initial.wishlist.find(item => item.id === 'asset'));
      await reload(); await layout();
      report.checks.push(`${theme}/${width}: toevoegen, zoeken/filteren, naam/notities zonder fotoverlies, upload/vervangen/annuleren, plakken, afbeeldingslink, onlineknop, verwijderen met bevestiging en overzetten met foto/notities geslaagd`);
      await context.close();
    }
    // The single addition field is also available on an empty wishlist.
    const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
    await context.route('**/*', route => { const url = new URL(route.request().url()); return url.origin === base && !url.pathname.startsWith('/api/') ? route.continue() : route.abort(); });
    const page = await context.newPage();
    await page.addInitScript(() => localStorage.setItem('onboarding_done', 'true'));
    await page.goto(base); await page.waitForSelector('#view-home:not(.hidden)'); await page.evaluate(() => window.switchView('wishlist'));
    assert(await page.locator('#wishlist-empty-state').isVisible());
    await page.locator('#wishlist-quick-input').fill('Eerste pot'); await page.locator('#btn-add-wish-quick').click();
    assert.equal(await page.locator('.wish-item-card').count(), 1); assert(!await page.locator('#wishlist-empty-state').isVisible());
    await context.close(); report.checks.push('Lege verlanglijst: hetzelfde geïntegreerde toevoegveld werkt');
    assert.deepEqual(report.errors, []);
    fs.writeFileSync(path.join(output, 'report.json'), JSON.stringify(report, null, 2));
    console.log(JSON.stringify({ checks: report.checks, screenshots: report.screenshots.length, errors: report.errors }, null, 2));
  } finally { await browser.close(); await new Promise(resolve => server.close(resolve)); }
})().catch(error => { console.error(error); process.exitCode = 1; });
