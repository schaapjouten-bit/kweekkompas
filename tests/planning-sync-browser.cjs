// Only isolated backend fixtures; no real account or cloud requests.
const assert = require('node:assert/strict');
const {chromium} = require('playwright');
const {createServer} = require('../scripts/dev-server.cjs');
const {startFixtures} = require('./service-fixtures.cjs');
(async () => {
  const fixture = await startFixtures();
  Object.assign(process.env,{SUPABASE_URL:fixture.base,SUPABASE_PUBLISHABLE_KEY:'sb_publishable_fixture',KWEEK_LOCAL_DEV:'true'});
  const server = createServer(); await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  const browser = await chromium.launch();
  try {
    const context = await browser.newContext({timezoneId:'Europe/Amsterdam'});
    await context.addInitScript(()=>{localStorage.setItem('onboarding_done','true');sessionStorage.setItem('kweekkompas_account_choice','local');});
    await context.route('**/*',route=>{
      const url = new URL(route.request().url());
      if (![base,fixture.base].includes(url.origin)) return route.abort();
      if (/^\/api\/(ai-|seed-info|tuinassistent|gemini-ai)/.test(url.pathname)) return route.fulfill({json:{defaultProvider:'ollama',providers:{},models:[]}});
      return route.continue();
    });
    const page = await context.newPage(); page.setDefaultTimeout(12000); page.on('dialog',dialog=>dialog.accept());
    await page.goto(base); await page.waitForFunction(()=>window.KweekLocalData);
    await page.evaluate(()=>window.KweekLocalData.restore({backupVersion:1,seeds:[],reminders:[],onboardingDone:'true'}));
    await page.reload(); await page.waitForSelector('#view-home:not(.hidden)');
    await page.evaluate(()=>window.openSettingsSection('cloud'));
    await page.click('#cloud-open-account'); await page.fill('#cloud-email','a@example.test'); await page.fill('#cloud-password','test-password'); await page.click('#cloud-auth-submit');
    await page.waitForFunction(()=>!document.querySelector('#account-popup[open]') && document.getElementById('cloud-login-status').textContent.includes('Ingelogd'));
    await page.click('#cloud-auto-sync'); await page.waitForSelector('[data-auto-choice="local"]'); await page.click('[data-auto-choice="local"]');
    await page.waitForFunction(id=>JSON.parse(localStorage.getItem('kweekkompas_auto_'+id))?.basis?.revision===1,fixture.ids.a);
    await page.evaluate(()=>{toggleSettingsPanel_REPAIR_V131();window.switchView('planning',{tab:'agenda'});});
    await page.click('#planning-add'); await page.fill('#new-reminder-input','Planning fixture');
    const chosen = await page.inputValue('#ai-planning-date'); assert(chosen); await page.click('#btn-add-reminder');
    await page.waitForFunction(id=>JSON.parse(localStorage.getItem('kweekkompas_auto_'+id))?.basis?.revision===2,fixture.ids.a);
    let saved = fixture.snapshots.get(fixture.ids.a).payload.reminders[0]; assert.equal(saved.title,'Planning fixture'); assert.equal(saved.activity,'custom'); assert.equal(saved.date,chosen);
    await page.getByRole('button',{name:'Bewerk: Planning fixture',exact:true}).click(); await page.fill('#new-reminder-input','Planning bewerkt'); await page.click('#btn-add-reminder');
    await page.waitForFunction(id=>JSON.parse(localStorage.getItem('kweekkompas_auto_'+id))?.basis?.revision===3,fixture.ids.a);
    await page.getByRole('checkbox',{name:'Voltooien: Planning bewerkt',exact:true}).click();
    await page.waitForFunction(id=>JSON.parse(localStorage.getItem('kweekkompas_auto_'+id))?.basis?.revision===4,fixture.ids.a);
    saved = fixture.snapshots.get(fixture.ids.a).payload.reminders[0]; assert.equal(saved.done,true); assert.equal(saved.title,'Planning bewerkt');
    await page.getByRole('button',{name:'Verwijder herinnering'}).click();
    await page.waitForFunction(id=>JSON.parse(localStorage.getItem('kweekkompas_auto_'+id))?.basis?.revision===5,fixture.ids.a);
    assert.deepEqual(fixture.snapshots.get(fixture.ids.a).payload.reminders,[]);
    console.log('PASS: Planning create/edit/complete/delete use existing automatic sync; fixture revisions 2–5, no live cloud writes.');
  } finally {await browser.close();await new Promise(resolve=>server.close(resolve));await fixture.stop();}
})().catch(error=>{console.error(error);process.exitCode=1;});
