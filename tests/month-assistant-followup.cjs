// Only month-control layout and assistant field behavior; no AI requests.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const { chromium } = require('playwright');
const root = path.resolve(__dirname, '..');
const output = path.join(root, 'scratch/month-assistant-followup');
const files = new Set(['index.html', 'app-v132.js', 'services.js', 'services.css', 'styles.css', 'calendar.css', 'onboarding.css', 'planner.css', 'wishlist.css']);
const server = http.createServer((req, res) => {
  const file = new URL(req.url, 'http://localhost').pathname.slice(1) || 'index.html';
  if ((!files.has(file) && !/^assets\/[\w/-]+\.(png|svg|jpg|webp)$/.test(file)) || !fs.existsSync(path.join(root, file))) { res.writeHead(404).end(); return; }
  const mime = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.svg': 'image/svg+xml' };
  res.writeHead(200, { 'Content-Type': (mime[path.extname(file)] || 'application/octet-stream') + '; charset=utf-8' });
  fs.createReadStream(path.join(root, file)).pipe(res);
});
const report = { checks: [], screenshots: [], errors: [], generationRequests: 0 };
(async () => {
  fs.mkdirSync(output, { recursive: true });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  const browser = await chromium.launch();
  try {
    for (const theme of ['light', 'dark', 'playful']) for (const width of [1440, 900, 390, 320]) {
      const context = await browser.newContext({ viewport: { width, height: 900 }, timezoneId: 'Europe/Amsterdam', hasTouch: width < 769 });
      await context.route('**/*', route => {
        const request = route.request(), url = new URL(request.url());
        if (/\/api\/(tuinassistent|gemini-ai|seed-info)/.test(url.pathname)) report.generationRequests++;
        return url.origin === base && !url.pathname.startsWith('/api/') ? route.continue() : route.abort();
      });
      await context.addInitScript(theme => {
        localStorage.setItem('onboarding_done', 'true'); localStorage.setItem('theme', theme);
        if (!localStorage.getItem('userProfile')) localStorage.setItem('userProfile', JSON.stringify({ name: 'Naam in profiel', experience: 'Beginner' }));
        if (!localStorage.getItem('kweekkompas_ai')) localStorage.setItem('kweekkompas_ai', JSON.stringify({ provider: 'ollama', model: 'llama3:latest' }));
      }, theme);
      const page = await context.newPage();
      page.on('pageerror', error => report.errors.push(error.message));
      await page.clock.setFixedTime(new Date('2026-10-02T12:00:00+02:00'));
      await page.goto(base); await page.waitForSelector('#view-home:not(.hidden)');
      const saved = await page.evaluate(() => window.KweekLocalData.capture());
      const provider = await page.evaluate(() => localStorage.getItem('kweekkompas_ai'));
      const input = page.locator('#ai-question-input');
      assert.equal(await input.inputValue(), '');
      assert.equal(await input.getAttribute('value'), '');
      assert.equal(await input.getAttribute('placeholder'), 'Vraag iets over je tuin…');
      assert.equal(await input.getAttribute('autocomplete'), 'off');
      assert.equal(await input.getAttribute('name'), 'garden-question');
      await input.fill('Mijn zelf geschreven tuinvraag.');
      await page.evaluate(() => window.switchView('sowing-grid'));
      assert.equal(await page.locator('#planner-active-month-title').innerText(), 'Oktober 2026');
      assert.equal(await page.locator('#planner-month-select').getAttribute('aria-label'), 'Kies maand');
      assert(!((await page.locator('.planner-month-navigation').innerText()).includes('Kies maand')));
      async function layout() {
        const bounds = await page.locator('.planner-month-navigation').evaluate(panel => {
          const rect = id => { const r=document.getElementById(id).getBoundingClientRect(); return { x:r.x, y:r.y, right:r.right, bottom:r.bottom, width:r.width }; };
          const p=panel.getBoundingClientRect();
          return { prev:rect('planner-prev-month'), title:rect('planner-active-month-title'), next:rect('planner-next-month'), select:rect('planner-month-select'), today:rect('planner-this-month'), panel:{left:p.left,right:p.right,bottom:p.bottom} };
        });
        assert(bounds.prev.right < bounds.title.x);
        assert(bounds.next.x > bounds.title.right && bounds.next.x - bounds.title.right <= 11);
        assert(Math.abs(bounds.prev.y - bounds.next.y) < 1);
        assert(bounds.select.right < bounds.today.x);
        assert(bounds.today.right <= bounds.panel.right);
        assert(bounds.select.x >= bounds.panel.left);
        if (width >= 900) assert(bounds.select.x > bounds.next.right);
        assert((await page.evaluate(() => document.documentElement.scrollWidth)) <= width);
      }
      await layout();
      await page.selectOption('#planner-month-select', '11');
      await page.click('#planner-next-month'); assert.equal(await page.locator('#planner-active-month-title').innerText(), 'Januari 2027');
      await page.click('#planner-prev-month'); assert.equal(await page.locator('#planner-active-month-title').innerText(), 'December 2026');
      await page.fill('#planner-year-input', '2031'); await page.locator('#planner-year-input').press('Enter');
      await page.selectOption('#planner-month-select', '8'); await layout();
      const navShot = `${theme}-${width}-maandnavigatie.png`;
      await page.locator('.sowing-planner-header').scrollIntoViewIfNeeded();
      await page.locator('.planner-month-navigation').screenshot({ path: path.join(output, navShot), animations: 'disabled' }); report.screenshots.push(navShot);
      await page.click('#planner-this-month'); assert.equal(await page.locator('#planner-active-month-title').innerText(), 'Oktober 2026');
      await page.evaluate(() => window.switchView('home'));
      assert.equal(await input.inputValue(), 'Mijn zelf geschreven tuinvraag.');
      // A name deliberately typed by the user must also remain intact.
      await input.fill('Naam in profiel');
      await page.evaluate(() => { window.switchView('sowing-grid'); window.switchView('home'); });
      assert.equal(await input.inputValue(), 'Naam in profiel');
      await input.fill('');
      const fieldShot = `${theme}-${width}-vraagveld.png`;
      await page.locator('.dashboard-assistant-section').screenshot({ path: path.join(output, fieldShot), animations: 'disabled' }); report.screenshots.push(fieldShot);
      assert.deepEqual(await page.evaluate(() => window.KweekLocalData.capture()), saved);
      assert.equal(await page.evaluate(() => localStorage.getItem('kweekkompas_ai')), provider);
      await page.reload(); await page.waitForSelector('#view-home:not(.hidden)'); assert.equal(await input.inputValue(), '');
      report.checks.push(`${theme}/${width}: compacte maandgroep, verborgen label, dropdown/Deze maand rechts, jaarwisseling en jaarkeuze, leeg vraagveld, autofill-attributen en eigen tekst behouden`);
      await context.close();
    }
    assert.equal(report.generationRequests, 0); assert.deepEqual(report.errors, []);
    for (const file of ['app-v132.js', 'services.js']) assert.deepEqual(fs.readFileSync(path.join(root, file)), fs.readFileSync(path.join(output, 'before', file)));
    fs.writeFileSync(path.join(output, 'report.json'), JSON.stringify(report, null, 2));
    console.log(JSON.stringify({ ...report, screenshots: report.screenshots.length }, null, 2));
  } finally { await browser.close(); await new Promise(resolve => server.close(resolve)); }
})().catch(error => { console.error(error); process.exitCode = 1; });
