const assert=require('node:assert/strict');const fs=require('node:fs');
const {chromium}=require('playwright');
const {startFixtures,configureFixtures}=require('./service-fixtures.cjs');
const {createServer}=require('../scripts/dev-server.cjs');
(async()=>{
 const fixture=await startFixtures();configureFixtures(fixture);const server=createServer();await new Promise(r=>server.listen(0,'127.0.0.1',r));
 const browser=await chromium.launch();const checks=[];
 try{
  const context=await browser.newContext({viewport:{width:1586,height:992},timezoneId:'Europe/Amsterdam'});const page=await context.newPage();
  await page.clock.setFixedTime(new Date('2026-10-02T12:00:00+02:00'));
  await page.addInitScript(()=>localStorage.setItem('onboarding_done','true'));
  const base=`http://127.0.0.1:${server.address().port}`;await page.goto(base);await page.waitForSelector('#view-home:not(.hidden)');
  await page.evaluate(async()=>{await window.KweekLocalData.restore({backupVersion:1,seeds:[],reminders:[{id:'old',title:'Taak van 17 april',date:'2026-04-17',done:false},{id:'current',title:'Taak vandaag',date:'2026-10-02',done:false},{id:'sunday',title:'Taak zondag',date:'2026-10-04',done:false},{id:'future',title:'Taak maandag',date:'2026-10-05',done:false},{id:'done',title:'Afgerond gisteren',date:'2026-10-01',done:true}],onboardingDone:'true'});});
  await page.reload();await page.waitForSelector('.home-overdue-tasks');
  const before=await page.evaluate(()=>window.KweekLocalData.capture());
  assert.match(await page.locator('.home-overdue-tasks').innerText(),/Achterstallig \(1\)/);
  assert.match(await page.locator('.home-overdue-tasks').innerText(),/17 april 2026/);
  assert.equal(await page.locator('#home-insights strong').nth(1).innerText(),'2');
  assert.match(await page.locator('.home-later-tasks summary').innerText(),/ 1$/);
  assert.equal(await page.locator('#dashboard-nu-doen > .home-reminder-task').count(),2);
  await page.reload();await page.waitForSelector('.home-overdue-tasks');
  assert.deepEqual(await page.evaluate(()=>window.KweekLocalData.capture()),before);
  checks.push('17 april blijft ongewijzigd in Achterstallig; actuele teller 2, toekomstige teller 1; afgeronde taak uitgesloten; herladen wijzigt geen data');
  await page.click('#home-ai-provider');await page.waitForSelector('#ai-provider');
  await page.waitForFunction(()=>document.querySelector('#ai-provider-status').textContent.includes('backend ingesteld'));
  await page.selectOption('#ai-provider','ollama');await page.fill('#ai-model','test-model');await page.click('#ai-settings-form button');
  assert.match(await page.locator('#home-ai-provider').innerText(),/Ollama/);
  await page.fill('#cloud-email','a@example.test');await page.fill('#cloud-password','test-password');await page.click('#cloud-login-form button');
  await page.waitForFunction(()=>document.querySelector('#cloud-status').textContent.includes('nog geen tuin'));await page.click('.settings-close-button');
  const other=await context.newPage();await other.goto(base);await other.waitForSelector('#home-ai-provider');
  await other.evaluate(()=>localStorage.setItem('kweekkompas_ai',JSON.stringify({provider:'openai-compatible',model:'test-custom'})));
  await page.waitForFunction(()=>document.querySelector('#home-ai-provider').textContent.includes('Eigen API'));
  await page.fill('#ai-question-input','Advies');await page.click('#btn-ask-ai');await page.waitForFunction(()=>!document.querySelector('#btn-ask-ai').disabled);
  assert.equal(fixture.calls.at(-1).path,'/v1/chat/completions');assert.equal(fixture.calls.at(-1).body.model,'test-custom');
  await page.click('#home-ai-provider');await page.waitForSelector('#ai-provider');assert.equal(await page.inputValue('#ai-provider'),'openai-compatible');assert.equal(await page.inputValue('#ai-model'),'test-custom');
  await other.evaluate(()=>localStorage.setItem('kweekkompas_ai',JSON.stringify({provider:'ollama',model:'test-model'})));
  await page.waitForFunction(()=>document.querySelector('#ai-provider').value==='ollama');
  await page.click('.settings-close-button');await page.evaluate(()=>window.switchView('list'));await page.click('#btn-add-zaden-top');await page.fill('#naam','Basilicum');await page.click('#btn-auto-fill-info');await page.waitForFunction(()=>!document.querySelector('#btn-auto-fill-info').disabled);
  assert.equal(fixture.calls.at(-1).path,'/api/generate');assert.equal(fixture.calls.at(-1).body.model,'test-model');
  checks.push('Providerlabel, geopende instellingen en beide AI-hulpen volgen dezelfde opgeslagen keuze, ook na wijziging in een tweede tab (mockprotocollen)');
  await page.evaluate(()=>{document.querySelector('#ai-assistant-output').dataset.active='';window.switchView('home');});
  for(const width of [1586,390]){await page.setViewportSize({width,height:width===1586?992:844});await page.evaluate(()=>window.scrollTo(0,0));await page.screenshot({path:`scratch/dashboard-followup-${width}.png`,fullPage:true});assert((await page.evaluate(()=>document.documentElement.scrollWidth))<=width);}
  fs.writeFileSync('scratch/dashboard-followup.json',JSON.stringify(checks,null,2));console.log(JSON.stringify(checks));
 }finally{await browser.close();await new Promise(r=>server.close(r));await fixture.stop();}
})().catch(e=>{console.error(e);process.exitCode=1;});
