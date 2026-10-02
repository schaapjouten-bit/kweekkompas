// Static local UI check with isolated browser storage. No backend, keys or AI.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const { chromium } = require('playwright');
const root = path.resolve(__dirname, '..');
const output = path.join(root, 'scratch/navigation-planner-step1');
const files = new Set(['index.html', 'app-v132.js', 'services.js', 'services.css', 'styles.css', 'calendar.css', 'onboarding.css', 'planner.css', 'wishlist.css']);
const server = http.createServer((req, res) => {
  const file = new URL(req.url, 'http://localhost').pathname.slice(1) || 'index.html';
  if ((!files.has(file) && !/^assets\/[\w/-]+\.(png|svg|jpg|webp)$/.test(file)) || !fs.existsSync(path.join(root, file))) { res.writeHead(404).end(); return; }
  const mime = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.svg': 'image/svg+xml' };
  res.writeHead(200, { 'Content-Type': (mime[path.extname(file)] || 'application/octet-stream') + '; charset=utf-8' });
  fs.createReadStream(path.join(root, file)).pipe(res);
});
const report = { checks: [], screenshots: [], errors: [] };
(async () => {
  fs.mkdirSync(output, { recursive: true });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  const browser = await chromium.launch();
  try {
    for (const theme of ['light', 'dark', 'playful']) for (const width of [1440, 900, 390, 320]) {
      const context = await browser.newContext({ viewport: { width, height: 800 }, timezoneId: 'Europe/Amsterdam', hasTouch: width !== 1440 });
      await context.route('**/*', route => {
        const url = new URL(route.request().url());
        return url.origin === base && !url.pathname.startsWith('/api/') ? route.continue() : route.abort();
      });
      const page = await context.newPage();
      page.on('pageerror', error => report.errors.push(error.message));
      await page.clock.setFixedTime(new Date('2026-10-02T12:00:00+02:00'));
      await page.addInitScript(theme => { localStorage.setItem('onboarding_done', 'true'); localStorage.setItem('theme', theme); }, theme);
      await page.goto(base); await page.waitForSelector('#view-home:not(.hidden)');
      // Temporary browser-only fixtures. No starter/example data files change.
      const plants = Array.from({ length: 9 }, (_, i) => ({ id: 'check-' + i, naam: 'Opgeslagen plant ' + (i + 1), type: 'Groente', status: 'Voorraad', zaaitijd: ['januari', 'oktober', 'december'], plant_months: ['oktober'], oogsttijd: ['oktober'], lastSownYear: 2024, tags: i % 2 ? ['Voorzaaien'] : ['Direct zaaien'] }));
      const tasks = [
        { id: 'history', title: 'Historische planning', date: '2024-10-12', done: true },
        { id: 'now', title: 'Bestaande planning oktober', date: '2026-10-14', done: false },
        { id: 'december', title: 'Planning december', date: '2026-12-28', done: false },
        { id: 'january', title: 'Planning januari', date: '2027-01-04', done: false },
        { id: 'future', title: 'Toekomstige eigen planning', date: '2031-10-16', done: false },
        { id: 'invalid', title: 'Onvolledige datum', date: '2031-10-99', done: false }
      ];
      await page.evaluate(async ({ plants, tasks }) => {
        await window.KweekLocalData.restore({ backupVersion: 1, seeds: plants, reminders: tasks, wishlist: [{ id: 'wish-seed', name: 'Bestaand zaad', type: 'seed', note: 'Eigen notitie' }, { id: 'wish-tool', name: 'Bestaand tuinitem', type: 'item', note: 'Bewaren' }], onboardingDone: 'true' });
      }, { plants, tasks });
      await page.reload(); await page.waitForSelector('#view-home:not(.hidden)');
      const original = await page.evaluate(() => window.KweekLocalData.capture());
      const shot = async (name, fullPage = true) => {
        const file = `${theme}-${width}-${name}.png`;
        await page.screenshot({ path: path.join(output, file), fullPage, animations: 'disabled' }); report.screenshots.push(file);
      };
      const planner = () => page.evaluate(() => window.switchView('sowing-grid'));
      const title = () => page.locator('#planner-active-month-title').innerText();
      const chooseYear = async year => { await page.fill('#planner-year-input', String(year)); await page.locator('#planner-year-input').press('Enter'); assert.equal(await page.inputValue('#planner-year-input'), String(year)); };
      const planned = () => page.locator('.planner-saved-planning .planner-plant-name').allTextContents();
      await planner();
      assert.equal(await title(), 'Oktober 2026');
      const recurring = await page.locator('#planner-activities-content > :not(.planner-saved-planning) .planner-plant-name').allTextContents();
      assert.equal(recurring.length, 27);
      assert.deepEqual(await planned(), ['Bestaande planning oktober']);
      await page.selectOption('#planner-month-select', '11'); assert.equal(await title(), 'December 2026');
      assert.deepEqual(await planned(), ['Planning december']);
      await page.click('#planner-next-month'); assert.equal(await title(), 'Januari 2027');
      assert.deepEqual(await planned(), ['Planning januari']);
      assert.equal(await page.locator('#planner-month-9[aria-current]').count(), 0);
      await page.click('#planner-prev-month'); assert.equal(await title(), 'December 2026');
      await page.selectOption('#planner-month-select', '0'); await page.click('#planner-prev-month'); assert.equal(await title(), 'December 2025');
      await page.click('#planner-next-month'); assert.equal(await title(), 'Januari 2026');
      await page.click('#planner-next-year'); await page.click('#planner-next-year'); assert.equal(await title(), 'Januari 2028');
      await page.click('#planner-prev-year'); assert.equal(await title(), 'Januari 2027');
      await chooseYear(2031); await page.selectOption('#planner-month-select', '9');
      assert.deepEqual(await planned(), ['Toekomstige eigen planning']);
      assert.deepEqual(await page.locator('#planner-activities-content > :not(.planner-saved-planning) .planner-plant-name').allTextContents(), recurring);
      assert.match(await page.locator('#planner-month-9').getAttribute('aria-label'), /Oktober 2031.*1 kalenderitems/);
      await shot('jaarplanning');
      await page.click('#planner-open-calendar'); assert.equal(await page.locator('#cal-month-title').innerText(), 'Oktober 2031');
      assert.equal(await page.locator('.calendar-day').filter({ hasText: /^16$/ }).getAttribute('aria-label'), '16 Oktober 2031, 1 herinnering');
      // Month modal must retain the calendar's selected year when returning.
      await page.click('#btn-cal-sow-tips'); assert.match(await page.locator('#planner-month-title').innerText(), /2031/);
      await page.click('#planner-month-modal .btn-goto-calendar'); assert.equal(await page.locator('#cal-month-title').innerText(), 'Oktober 2031');
      await planner(); await chooseYear(2024);
      assert.deepEqual(await planned(), ['Historische planning']);
      assert.match(await page.locator('.planner-saved-planning').innerText(), /12 oktober 2024.*Afgerond/s);
      await page.locator('.planner-saved-planning .planner-plant-row').click();
      assert.equal(await page.locator('#cal-month-title').innerText(), 'Oktober 2024');
      assert.match(await page.locator('#selected-date-label').innerText(), /12 oktober 2024/);
      assert.match(await page.locator('#reminder-list').innerText(), /Historische planning/);
      await planner(); await chooseYear(2021); assert.deepEqual(await planned(), []);
      await page.fill('#planner-year-input', ''); await page.locator('#planner-year-input').press('Enter'); assert.equal(await page.inputValue('#planner-year-input'), '2021');
      await page.fill('#planner-year-input', '999'); await page.locator('#planner-year-input').press('Enter'); assert.equal(await page.inputValue('#planner-year-input'), '2021');
      await page.click('#planner-this-month'); assert.equal(await title(), 'Oktober 2026');
      assert.equal(await page.locator('#planner-month-9[aria-current="date"]').count(), 1);
      const logo = page.locator(width > 768 ? '.sidebar-brand' : '.shell-mobile-brand');
      await logo.focus(); assert.equal(await logo.evaluate(el => el.tagName), 'BUTTON');
      await logo.press('Tab'); await page.keyboard.press('Shift+Tab');
      assert.equal(await logo.evaluate(el => getComputedStyle(el).outlineStyle), 'solid');
      await shot('logo-focus', false);
      await logo.press('Enter'); await page.waitForSelector('#view-home:not(.hidden)');
      await planner(); await logo.focus(); await logo.press('Space'); await page.waitForSelector('#view-home:not(.hidden)');
      await planner(); if (width <= 768) await logo.tap(); else await logo.click();
      await page.waitForSelector('#view-home:not(.hidden)');
      if (width <= 768) {
        await planner(); await page.click('#shell-mobile-menu'); await page.locator('.sidebar-brand').press('Enter');
        await page.waitForSelector('#view-home:not(.hidden)');
        assert.equal(await page.locator('#shell-mobile-menu').getAttribute('aria-expanded'), 'false');
        assert.equal(await page.locator('body.shell-menu-open').count(), 0);
      }
      await page.evaluate(() => window.switchView('wishlist'));
      assert.equal(await page.locator('.wishlist-summary,[id^="wishlist-count-"]').count(), 0);
      assert.equal(await page.locator('.wish-item-card').count(), 2);
      for (const id of ['wishlist-search-input', 'wishlist-quick-input', 'btn-add-wish-quick']) assert(await page.locator('#' + id).isVisible());
      assert.equal(await page.locator('[data-wish-filter]').count(), 3);
      await shot('verlanglijstkop');
      await page.evaluate(() => window.switchView('sowing-grid'));
      const metrics = await page.evaluate(() => {
        const bottom = document.querySelector('#planner-open-seeds');
        const result = []; let node = bottom;
        while (node) {
          const css = getComputedStyle(node), rect = node.getBoundingClientRect();
          result.push({ element: node.id || node.className || node.tagName, height: rect.height, top: rect.top, bottom: rect.bottom, scrollHeight: node.scrollHeight, clientHeight: node.clientHeight, overflowX: css.overflowX, overflowY: css.overflowY, maxHeight: css.maxHeight, position: css.position, flex: css.flex });
          node = node.parentElement;
        }
        return { ancestors: result, documentHeight: document.scrollingElement.scrollHeight, viewport: innerHeight };
      });
      assert(metrics.documentHeight > metrics.viewport);
      await page.mouse.move(width > 768 ? width - 100 : width / 2, 700);
      await page.mouse.wheel(0, 100000);
      await page.waitForFunction(() => document.querySelector('#planner-open-seeds').getBoundingClientRect().bottom <= innerHeight);
      for (const id of ['planner-open-calendar', 'planner-open-seeds']) {
        assert(await page.locator('#' + id).evaluate(el => {
          const r=el.getBoundingClientRect(); const hit=document.elementFromPoint(r.x+r.width/2,r.y+r.height/2);
          return r.top >= 60 && r.bottom <= innerHeight && hit?.closest('button') === el;
        }));
      }
      await shot('onderkant-bereikbaar', false);
      assert((await page.evaluate(() => document.documentElement.scrollWidth)) <= width);
      assert.deepEqual(await page.evaluate(() => window.KweekLocalData.capture()), original);
      await page.reload(); await page.waitForSelector('#view-home:not(.hidden)');
      assert.deepEqual(await page.evaluate(() => window.KweekLocalData.capture()), original);
      report.checks.push(`${theme}/${width}: logo muis/toetsenbord/aanraking, verlanglijstkop, volledig scrollen, december/januari, jaarkeuze, Deze maand, kalenderlinks, historische planning en ongewijzigde opslag`);
      await context.close();
    }
    assert.deepEqual(report.errors, []);
    fs.writeFileSync(path.join(output, 'report.json'), JSON.stringify(report, null, 2));
    console.log(JSON.stringify({ ...report, screenshots: report.screenshots.length }, null, 2));
  } finally { await browser.close(); await new Promise(resolve => server.close(resolve)); }
})().catch(error => { console.error(error); process.exitCode = 1; });
