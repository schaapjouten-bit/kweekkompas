// Isolated local navigation check: static files only, no backend or AI fixtures.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const { chromium } = require('playwright');
const root = path.resolve(__dirname, '..');
const output = path.join(root, 'scratch/dashboard-navigation');
const files = new Set(['index.html', 'app-v132.js', 'services.js', 'services.css', 'styles.css', 'calendar.css', 'onboarding.css', 'planner.css', 'wishlist.css', 'cloud-data.js', 'auto-sync.js', 'local-drafts.js', 'photo-storage.js', 'example-collections.js']);
const mime = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png' };
const server = http.createServer((req, res) => {
  const file = new URL(req.url, 'http://localhost').pathname.slice(1) || 'index.html';
  if (!files.has(file)) { res.writeHead(404).end(); return; }
  res.writeHead(200, { 'Content-Type': `${mime[path.extname(file)]}; charset=utf-8` });
  fs.createReadStream(path.join(root, file)).pipe(res);
});

(async () => {
  fs.mkdirSync(output, { recursive: true });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const browser = await chromium.launch();
  const base = `http://127.0.0.1:${server.address().port}`;
  const checks = [];
  try {
    const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, timezoneId: 'Europe/Amsterdam', hasTouch: true });
    // Block backend and external requests; credentials and services are never loaded by this check.
    await context.route('**/*', route => {
      const url = new URL(route.request().url());
      return url.origin === base && !url.pathname.startsWith('/api/') ? route.continue() : route.abort();
    });
    const page = await context.newPage();
    page.setDefaultTimeout(10000);
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.clock.setFixedTime(new Date('2026-10-02T12:00:00+02:00'));
    await page.addInitScript(() => localStorage.setItem('onboarding_done', 'true'));
    await page.goto(base);
    await page.waitForSelector('#view-home:not(.hidden)');
    const plant = (id, status, months, tags = ['controle']) => ({ id, naam: `Plant ${id}`, type: 'Groente', status, tags, zaaitijd: months, oogsttijd: [], fase_gezaaid: status !== 'Voorraad' && status !== 'Wishlist', fase_groeit: status === 'Groeit', fase_geoogst: status === 'Geoogst', isFavorite: false });
    const seeds = [plant('sown', 'Gezaaid', ['november']), plant('grow', 'Groeit', ['november']), plant('harvest', 'Geoogst', ['november']), plant('wish', 'Wishlist', ['november']), plant('now', 'Voorraad', ['oktober']), plant('both', 'Voorraad', ['oktober', 'november']), plant('soon', 'Voorraad', ['november'], ['voorzaaien', 'direct zaaien']), plant('scheduled', 'Voorraad', ['november']), plant('later', 'Voorraad', ['december'])];
    const reminders = [{ id: 1, title: 'Vandaag', date: '2026-10-02', done: false }, { id: 2, title: 'Zondag', date: '2026-10-04', done: false }, { id: 3, title: 'Achterstallig', date: '2026-10-01', done: false }, { id: 4, title: 'Volgende week', date: '2026-10-05', done: false }, { id: 5, title: 'Klaar', date: '2026-10-03', done: true }, { id: 6, title: 'Plant scheduled zaaien', date: '2026-10-22', done: false }];
    const restore = async (plants, tasks) => {
      await page.evaluate(async ({ seeds, reminders }) => window.KweekLocalData.restore({ backupVersion: 1, seeds, reminders, onboardingDone: 'true' }), { seeds: plants, reminders: tasks });
      await page.reload(); await page.waitForSelector('#home-insights button');
    };
    const home = () => page.evaluate(() => window.switchView('home'));
    const card = index => page.locator('#home-insights button').nth(index);
    await restore(seeds, reminders);
    const before = await page.evaluate(() => window.KweekLocalData.capture());
    assert.deepEqual(await page.locator('#home-insights strong').allTextContents(), ['3', '4', '1']);

    for (const theme of ['light', 'dark', 'playful']) {
      await page.evaluate(theme => window.setAppTheme(theme), theme);
      for (const width of [1440, 390, 320]) {
        await page.setViewportSize({ width, height: 1000 });
        await home();
        assert.equal(await card(0).evaluate(el => el.tagName), 'BUTTON');
        if (width === 1440) {
          await page.mouse.move(0, 0);
          const originalBorder = await card(0).evaluate(el => getComputedStyle(el).borderColor);
          await card(0).hover();
          await page.waitForFunction(border => getComputedStyle(document.querySelector('#home-insights button')).borderColor !== border, originalBorder);
          await page.mouse.move(0, 0);
        }
        await page.keyboard.press('Tab');
        // Walk real tab order to the first insight and verify visible keyboard focus.
        for (let i = 0; i < 30 && !await card(0).evaluate(el => el === document.activeElement); i++) await page.keyboard.press('Tab');
        assert(await card(0).evaluate(el => el === document.activeElement && el.matches(':focus-visible')));
        assert.equal(await card(0).evaluate(el => getComputedStyle(el).outlineStyle), 'solid');
        await page.screenshot({ path: path.join(output, `${theme}-${width}-focus.png`), fullPage: true });
        await card(0).press('Enter');
        await page.waitForSelector('#view-list:not(.hidden)');
        assert.equal(await page.locator('#seed-grid .seed-card').count(), 3);
        assert.match(await page.locator('#seeds-context-banner').innerText(), /Gezaaid, Groeit, Geoogst/);
        await page.getByRole('button', { name: 'Alle planten', exact: true }).click();
        assert.equal(await page.locator('#seed-grid .seed-card').count(), 9);

        await home(); await card(1).press('Space');
        await page.waitForSelector('#view-calendar:not(.hidden)');
        assert.equal(await page.locator('#reminder-list .reminder-row').count(), 2);
        assert.equal(await page.locator('#calendar-plant-period-list .calendar-period-task').count(), 2);
        assert.match(await page.locator('#selected-date-label').innerText(), /2 oktober 2026.*4 oktober 2026/);
        assert((await page.evaluate(() => document.documentElement.scrollWidth)) <= width);
        await page.screenshot({ path: path.join(output, `${theme}-${width}-calendar.png`), fullPage: true });
        await page.getByRole('button', { name: 'Dag kiezen', exact: true }).click();
        await page.getByRole('button', { name: '3 Oktober 2026, 1 herinnering', exact: true }).click();
        assert.match(await page.locator('#reminder-list').innerText(), /Klaar/);

        await home();
        if (width === 1440) await card(2).click({ position: { x: 5, y: 5 } });
        else await card(2).tap({ position: { x: 5, y: 5 } });
        await page.waitForSelector('#view-sowing-grid:not(.hidden)');
        assert.equal(await page.locator('#planner-month-select').inputValue(), '10');
        assert.equal(await page.locator('#planner-activities-content .planner-plant-row').count(), 1);
        assert.match(await page.locator('#planner-activities-content').innerText(), /Plant soon/);
        assert(await page.locator('#planner-soon-filter').isVisible());
        assert((await page.evaluate(() => document.documentElement.scrollWidth)) <= width);
        await page.screenshot({ path: path.join(output, `${theme}-${width}-planner.png`), fullPage: true });
        await page.getByRole('button', { name: 'Alle activiteiten', exact: true }).click();
        assert((await page.locator('#planner-activities-content .planner-plant-row').count()) > 1);
        await home();
        assert((await page.evaluate(() => document.documentElement.scrollWidth)) <= width);
      }
      checks.push(`${theme}: muis, Enter, spatie, Tab/focus en aanraking; exacte selecties; filters wissen; 1440/390/320px`);
    }
    // Navigation leaves the stored garden and reminders unchanged.
    const after = await page.evaluate(() => window.KweekLocalData.capture());
    assert.deepEqual(after.seeds, before.seeds);
    assert.deepEqual(after.reminders, before.reminders);

    // Stale category/search/month and calendar/planner positions must not narrow a card destination.
    await page.evaluate(() => { window.switchView('list'); localStorage.setItem('activeMonthFilter', 'December'); });
    await page.locator('.filter-chip[data-filter="Kruid"]').click();
    await page.locator('#search-input').fill('geen overeenkomst');
    await home(); await card(0).click();
    assert.equal(await page.locator('#seed-grid .seed-card').count(), 3);
    assert.equal(await page.locator('#search-input').inputValue(), '');
    assert.equal(await page.locator('.filter-chip.active').getAttribute('data-filter'), 'Alles');
    checks.push('Oude zoekterm, categorie en maandfilter worden bij Actieve planten gereset');

    await restore([], []);
    assert.deepEqual(await page.locator('#home-insights strong').allTextContents(), ['0', '0', '0']);
    for (let index = 0; index < 3; index++) {
      await home(); assert(await card(index).isEnabled()); await card(index).click();
      if (index === 0) assert.match(await page.locator('#seed-grid').innerText(), /Geen actieve planten/);
      if (index === 1) assert.match(await page.locator('#reminder-list').innerText(), /Geen taken meer voor deze week/);
      if (index === 2) assert.match(await page.locator('#planner-activities-content').innerText(), /Geen voorraadplanten/);
    }
    checks.push('Alle nulkaarten blijven klikbaar en openen een passende lege toestand');

    await page.clock.setFixedTime(new Date('2026-12-31T23:30:00+01:00'));
    await restore([plant('january', 'Voorraad', ['januari'])], [{ id: 8, title: 'Nieuwjaarsdag', date: '2027-01-01', done: false }, { id: 9, title: 'Volgende maandag', date: '2027-01-04', done: false }]);
    assert.deepEqual(await page.locator('#home-insights strong').allTextContents(), ['0', '1', '1']);
    await card(1).click(); assert.equal(await page.locator('#reminder-list .reminder-row').count(), 1);
    assert.match(await page.locator('#selected-date-label').innerText(), /3 januari 2027/);
    await home(); await card(2).click();
    assert.equal(await page.locator('#planner-active-month-title').innerText(), 'Januari 2027');
    assert.equal(await page.locator('#planner-activities-content .planner-plant-row').count(), 1);
    checks.push('Jaarwisseling: weekagenda loopt door tot zondag; Binnenkort zaaien opent januari 2027');
    assert.deepEqual(errors, []);
    fs.writeFileSync(path.join(output, 'report.json'), JSON.stringify({ checks, errors }, null, 2));
    console.log(JSON.stringify({ checks, errors }, null, 2));
  } finally { await browser.close(); await new Promise(resolve => server.close(resolve)); }
})().catch(error => { console.error(error); process.exitCode = 1; });
