const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const { chromium } = require('playwright');

const root = path.resolve(__dirname, '..');
const files = new Set(['index.html', 'app-v132.js', 'cloud-data.js', 'photo-storage.js', 'auto-sync.js', 'local-drafts.js', 'plant-lifecycle.js', 'ai-contract.js', 'browser-ollama.js', 'services.js', 'services.css', 'styles.css', 'calendar.css', 'onboarding.css', 'planner.css', 'wishlist.css']);
const mime = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png' };
const server = http.createServer((req, res) => {
  const file = new URL(req.url, 'http://localhost').pathname.slice(1) || 'index.html';
  if ((!files.has(file) && !/^assets\/[a-z0-9/_-]+\.png$/i.test(file)) || !fs.existsSync(path.join(root, file))) { res.writeHead(404).end(); return; }
  res.writeHead(200, { 'Content-Type': `${mime[path.extname(file)] || 'application/octet-stream'}; charset=utf-8` });
  fs.createReadStream(path.join(root, file)).pipe(res);
});

(async () => {
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const browser = await chromium.launch();
  try {
    const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    await context.route('**/*', route => {
      const url = new URL(route.request().url());
      return url.origin === `http://127.0.0.1:${server.address().port}` ? route.continue() : route.abort();
    });
    const page = await context.newPage();
    page.on('pageerror', error => console.error('PAGEERROR:', error.message));
    await page.addInitScript(() => localStorage.setItem('onboarding_done', 'true'));
    await page.goto(`http://127.0.0.1:${server.address().port}`);
    await page.waitForSelector('#view-home:not(.hidden)');
    await page.waitForFunction(() => typeof window.openDetailView === 'function');
    const base = { type: 'Groente', status: 'Gezaaid', fase_gezaaid: true, fase_groeit: false, fase_geoogst: false, isFavorite: false, lastSownYear: new Date().getFullYear(), tags: [], zaaitijd: [], oogsttijd: [], beschrijving: '', voeding: '', ervaringen: '' };
    const plants = [
      { ...base, id: 'nav-1', naam: 'Eerste plant' },
      { ...base, id: 'nav-2', naam: 'Middelste plant' },
      { ...base, id: 'nav-3', naam: 'Laatste plant' }
    ];
    await page.evaluate(seeds => window.KweekLocalData.restore({ backupVersion: 1, seeds, wishlist: [], reminders: [], onboardingDone: 'true' }), plants);
    await page.reload();
    await page.waitForSelector('#view-home:not(.hidden)');
    await page.waitForFunction(() => typeof window.openDetailView === 'function');
    await page.evaluate(() => {
      document.getElementById('view-home').classList.add('hidden');
      document.getElementById('view-list').classList.remove('hidden');
      window._resetAllFilters();
    });
    await page.waitForSelector('#view-list:not(.hidden)');
    await page.evaluate(seed => window.openDetailView(seed), plants[0]);
    await page.waitForSelector('#view-detail:not(.hidden)');

    const previous = page.locator('#btn-detail-plant-prev');
    const next = page.locator('#btn-detail-plant-next');
    assert.equal(await previous.isVisible(), true);
    assert.equal(await previous.isDisabled(), true);
    assert.equal(await next.isDisabled(), false);
    await next.click();
    assert.equal(await page.locator('#view-detail h1').innerText(), 'Middelste plant');
    assert.equal(await previous.isDisabled(), false);
    assert.equal(await next.isDisabled(), false);
    await next.click();
    assert.equal(await page.locator('#view-detail h1').innerText(), 'Laatste plant');
    assert.equal(await next.isDisabled(), true);
    await previous.click();
    assert.equal(await page.locator('#view-detail h1').innerText(), 'Middelste plant');
    await page.setViewportSize({ width: 320, height: 844 });
    const headerFit = await page.locator('.detail-page-header').evaluate(header => {
      const prev = document.getElementById('btn-detail-plant-prev').getBoundingClientRect();
      const next = document.getElementById('btn-detail-plant-next').getBoundingClientRect();
      const bounds = header.getBoundingClientRect();
      return { fits: header.scrollWidth <= header.clientWidth && prev.left >= bounds.left && next.right <= bounds.right, headerWidth: bounds.width, scrollWidth: header.scrollWidth, clientWidth: header.clientWidth, prevLeft: prev.left, nextRight: next.right, headerLeft: bounds.left, headerRight: bounds.right };
    });
    assert.equal(headerFit.fits, true, `Navigatiepijlen blijven binnen de plantdetailkop op mobiel: ${JSON.stringify(headerFit)}`);
    console.log('Plantdetail navigatie werkt in beide richtingen; de pijlen stoppen aan het begin en einde van de lijst.');
  } finally {
    await browser.close();
    await new Promise(resolve => server.close(resolve));
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
