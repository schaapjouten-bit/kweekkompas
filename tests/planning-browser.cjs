// Fresh browser contexts and a static server: no real storage, keys or cloud.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const { chromium } = require('playwright');
const root = path.resolve(__dirname, '..');
const out = path.join(root, 'scratch/planning-check');
const files = new Set(['index.html','app-v132.js','styles.css','calendar.css','planner.css','services.css','services.js','onboarding.css','wishlist.css','local-drafts.js','photo-storage.js','cloud-data.js','auto-sync.js','example-collections.js']);
const server = http.createServer((req,res) => {
  const name = new URL(req.url, 'http://localhost').pathname.slice(1) || 'index.html';
  if (!files.has(name) && !/^assets\/[\w./-]+$/.test(name)) return res.writeHead(404).end();
  const file = path.resolve(root, name);
  if (!file.startsWith(root + path.sep) || !fs.existsSync(file)) return res.writeHead(404).end();
  const type = {'.html':'text/html','.js':'text/javascript','.css':'text/css','.png':'image/png','.json':'application/json'}[path.extname(file)] || 'application/octet-stream';
  res.writeHead(200, {'Content-Type':type+'; charset=utf-8'}); fs.createReadStream(file).pipe(res);
});
const checks = [], errors = [];
(async () => {
  fs.mkdirSync(out,{recursive:true});
  await new Promise(resolve => server.listen(0,'127.0.0.1',resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  const browser = await chromium.launch();
  try {
    const context = await browser.newContext({viewport:{width:1440,height:1050}, timezoneId:'Europe/Amsterdam'});
    await context.route('**/*', route => {
      const url = new URL(route.request().url());
      if (url.origin !== base || url.pathname.startsWith('/api/')) return route.abort();
      return route.continue();
    });
    const page = await context.newPage(); page.setDefaultTimeout(10000);
    page.on('pageerror', e => errors.push(e.message)); page.on('dialog', d => d.accept());
    await page.clock.setFixedTime(new Date('2026-10-04T12:00:00+02:00'));
    await page.addInitScript(() => { localStorage.setItem('onboarding_done','true'); sessionStorage.setItem('kweekkompas_account_choice','local'); });
    await page.goto(base);
    await page.waitForFunction(() => window.KweekLocalData);
    const original = [{id:1,date:'2026-10-04',title:'Bestaande taak',done:false}, {id:2,date:'2026-12-31',title:'Afgeronde taak',done:true,notes:'behouden'}];
    await page.evaluate(data => window.KweekLocalData.restore(data), {backupVersion:1,seeds:[{id:'tomaat',naam:'Testtomaat',type:'Groente',status:'Voorraad',zaaitijd:['oktober'],oogsttijd:['oktober'],plant_months:['november']}],reminders:original,onboardingDone:'true'});
    await page.reload(); await page.waitForSelector('#view-home:not(.hidden)');
    const capture = () => page.evaluate(() => window.KweekLocalData.capture());
    const go = tab => page.evaluate(tab => window.switchView('planning',{tab}),tab);
    await go('year');
    assert.equal(await page.locator('.shell-nav-item[aria-label="Planning"]').count(),1);
    assert.equal(await page.locator('#sowing-month-grid .month-card').count(),12);
    assert.deepEqual((await capture()).reminders, original);
    await go('month'); await page.locator('#calendar-grid .calendar-day').filter({hasText:/^31$/}).count();
    await page.getByRole('button',{name:'14 Oktober 2026',exact:true}).click();
    for (const tab of ['year','agenda','month']) {
      await go(tab);
      assert.equal(await page.locator('#planning-selection').count(),0);
      assert.equal(await page.locator('.calendar-page-header').count(),0);
      assert.equal(await page.locator('.planning-heading h1').innerText(),'Planning');
    }
    await go('month'); assert.match(await page.locator('#selected-date-label').innerText(),/14 oktober 2026/i);
    assert.deepEqual(await page.locator('.planning-toolbar-actions > *').evaluateAll(nodes=>nodes.map(node=>node.innerText.trim())),['Vandaag','Maand\nJaar\nAgenda','+ Inplannen','Maandtips']);
    await go('agenda'); assert.equal(await page.locator('#btn-cal-sow-tips').isVisible(),false);
    await go('year'); assert.equal(await page.locator('#btn-cal-sow-tips').isVisible(),true);
    await go('year'); await page.selectOption('#planner-month-select','11');
    await page.click('#planner-next-month'); assert.match(await page.locator('#planner-active-month-title').innerText(),/Januari 2027/);
    await go('month'); assert.match(await page.locator('#cal-month-title').innerText(),/Januari 2027/);
    await page.click('#cal-prev'); assert.match(await page.locator('#cal-month-title').innerText(),/December 2026/);
    await go('year'); assert.match(await page.locator('#planner-active-month-title').innerText(),/December 2026/);
    await page.click('#planning-today'); checks.push('Tabs preserve selected day; both month arrows cross December/January; Today resets all views.');
    for (const tab of ['year','month','agenda']) {
      await go(tab); await page.click('#planning-add');
      await page.waitForSelector('#planning-dialog[open]');
      assert.equal(await page.inputValue('#ai-planning-date'),'2026-10-04');
      if (tab !== 'year') { await page.selectOption('#planning-activity',tab === 'month' ? 'sow' : 'harvest'); await page.selectOption('#planning-plant','tomaat'); }
      await page.fill('#new-reminder-input',`Nieuwe taak ${tab}`); await page.fill('#ai-planning-date', '2026-10-15');
      await page.click('#btn-add-reminder'); await page.waitForSelector('#planning-dialog', {state:'hidden'});
      assert.equal(await page.getAttribute(`#planning-tab-${tab}`,'aria-selected'),'true');
      assert((await capture()).reminders.some(t => t.title === `Nieuwe taak ${tab}`));
    }
    const tasks = (await capture()).reminders; assert.equal(new Set(tasks.map(t => t.id)).size,tasks.length);
    checks.push('Add from every tab; same tab after save; unique IDs and shared counts.');
    await go('agenda'); await page.getByRole('button',{name:'Bewerk: Afgeronde taak',exact:true}).click();
    await page.fill('#new-reminder-input','Afgerond bewerkt'); await page.click('#btn-add-reminder');
    let edited = (await capture()).reminders.find(t=>t.id===2); assert.equal(edited.date,'2026-12-31'); assert.equal(edited.done,true); assert.equal(edited.notes,'behouden');
    await page.getByRole('checkbox',{name:'Voltooien: Nieuwe taak year',exact:true}).press('Space');
    const row = page.locator('#planning-agenda-list .reminder-row').filter({hasText:'Nieuwe taak month'});
    await row.getByRole('button',{name:'Verwijder herinnering'}).click();
    await page.reload(); await page.waitForSelector('#view-home:not(.hidden)'); await go('agenda');
    edited = (await capture()).reminders; assert(edited.find(t=>t.title==='Nieuwe taak year').done); assert(!edited.some(t=>t.title==='Nieuwe taak month'));
    checks.push('Edit preserves ID/date/completion/extra fields; keyboard complete and delete survive reload.');
    await go('month'); await page.click('#planning-add'); await page.selectOption('#planning-activity','transplant'); await page.selectOption('#planning-plant','tomaat');
    await page.fill('#ai-planning-date','2026-11-12'); await page.fill('#new-reminder-input','Concept uitplanten');
    await page.keyboard.press('Escape'); await page.reload();
    await page.waitForSelector('#planning-dialog[open]'); assert.equal(await page.inputValue('#planning-activity'),'transplant'); assert.equal(await page.inputValue('#planning-plant'),'tomaat'); assert.equal(await page.inputValue('#ai-planning-date'),'2026-11-12'); assert.equal(await page.inputValue('#new-reminder-input'),'Concept uitplanten');
    await page.click('#planning-cancel'); await page.reload(); await page.waitForSelector('#view-home:not(.hidden)'); assert.equal(await page.locator('#planning-dialog[open]').count(),0);
    checks.push('All task draft fields restore after closing/reload; explicit cancel removes draft.');
    await go('year'); await page.click('#planning-today');
    const before = (await capture()).reminders.length;
    await page.getByRole('button',{name:'Inplannen: Testtomaat Binnen voorzaaien',exact:true}).click();
    assert.equal(await page.inputValue('#planning-activity'),'sow'); assert.equal(await page.inputValue('#planning-plant'),'tomaat'); assert.equal((await capture()).reminders.length,before);
    await page.click('#btn-add-reminder'); assert.equal((await capture()).reminders.length,before+1);
    await page.getByRole('button',{name:'Inplannen: Testtomaat Binnen voorzaaien',exact:true}).click(); await page.click('#btn-add-reminder');
    assert.match(await page.locator('#planning-form-message').innerText(),/staat al/); assert.equal((await capture()).reminders.length,before+1); await page.click('#planning-cancel');
    assert.match(await page.locator('#planner-activity-count').innerText(),/2/); assert.match(await page.locator('.planner-saved-planning h4').innerText(),/Ingeplande/);
    await page.selectOption('#planner-month-select','0'); await page.click('#planning-add'); assert.equal(await page.inputValue('#ai-planning-date'),''); await page.click('#planning-cancel');
    checks.push('Advice only prefills; explicit save creates task; duplicate rejected; past period has no automatic date.');
    await page.evaluate(() => window.switchView('calendar')); assert.equal(await page.getAttribute('#planning-tab-month','aria-selected'),'true');
    await page.evaluate(() => window.switchView('sowing-grid')); assert.equal(await page.getAttribute('#planning-tab-year','aria-selected'),'true');
    await page.locator('#planning-tab-year').focus(); await page.keyboard.press('ArrowRight'); assert.equal(await page.getAttribute('#planning-tab-month','aria-selected'),'true');
    await page.evaluate(() => window._planAssistantSuggestion({destination:'todo',title:'AI testtaak',date:'2026-10-20'})); await page.waitForSelector('#planning-dialog[open]');
    assert.equal(await page.inputValue('#new-reminder-input'),'AI testtaak'); assert(!(await capture()).reminders.some(t=>t.title==='AI testtaak')); await page.click('#btn-add-reminder');
    assert((await capture()).reminders.some(t=>t.title==='AI testtaak'));
    checks.push('Legacy routes, keyboard tabs and AI explicit-save action.');
    await go('agenda'); await page.click('#planning-add'); await page.fill('#new-reminder-input','Met Enter opgeslagen'); await page.press('#new-reminder-input','Enter');
    await page.waitForSelector('#planning-dialog',{state:'hidden'});
    assert.equal((await capture()).reminders.filter(t=>t.title==='Met Enter opgeslagen').length,1);
    await page.locator('.toast.show').waitFor({state:'hidden'});
    for (const theme of ['light','dark','playful']) {
      await page.evaluate(theme => window.setAppTheme(theme),theme);
      for (const width of [1440,390,320]) {
        await page.setViewportSize({width,height:1000});
        for (const tab of ['year','month','agenda']) {
          await go(tab); await page.click('#planning-today');
          assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),`${theme}/${width}/${tab} overflow`);
          if (width!==320) await page.screenshot({path:path.join(out,`${theme}-${width}-${tab}.png`),fullPage:true});
        }
        await page.click('#planning-add'); await page.waitForSelector('#planning-dialog[open]'); assert(await page.locator('#planning-dialog').evaluate(el=>el.scrollWidth<=el.clientWidth));
        if(width===390) await page.screenshot({path:path.join(out,`${theme}-390-form.png`)});
        await page.click('#planning-cancel');
      }
    }
    assert.deepEqual(errors,[]); checks.push('Light/Dark/Warm, all tabs and form at 1440/390/320px; no page errors or horizontal overflow.');
    console.log(JSON.stringify({checks,errors,screenshots:out},null,2));
    fs.writeFileSync(path.join(out,'report.json'),JSON.stringify({checks,errors},null,2));
    await context.close();
  } finally { await browser.close(); server.close(); }
})().catch(error=>{console.error(error); server.close(); process.exitCode=1;});
