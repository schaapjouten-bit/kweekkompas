// Fresh browser contexts and a static server: no real storage, keys or cloud.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const { chromium } = require('playwright');
const root = path.resolve(__dirname, '..');
const out = path.join(root, 'scratch/ollama-check');
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

    let state='ready', runtime='local', tagsRequests=0, fixtureErrors=0, copied='';
    await context.grantPermissions(['clipboard-read','clipboard-write'],{origin:base});
    await context.route('**/*', async route=>{
      const url=new URL(route.request().url());
      if(url.origin!==base) return route.abort();
      if(url.pathname==='/api/ai-config') {
        tagsRequests++;
        return route.fulfill({json:{defaultProvider:'ollama',providers:{ollama:{label:'Lokale AI (Ollama)',configured:state!=='unconfigured',model:'llama3:latest',models:['llama3:latest','custom:latest'],connection:{runtime,state:state==='ready'||state==='missing'?'reachable':state,installedModels:state==='ready'?['llama3:latest','custom:latest']:[]}},gemini:{label:'Gemini',configured:false},'openai-compatible':{label:'Eigen API',configured:false}}}});
      }
      if(url.pathname==='/api/auth') return route.fulfill({json:{configured:false,user:null}});
      if(['/api/tuinassistent','/api/seed-info'].includes(url.pathname)) {fixtureErrors++; return route.fulfill({status:502,json:{error:'Lokale AI is niet bereikbaar.',code:'OLLAMA_UNREACHABLE'}});}
      if(url.pathname.startsWith('/api/')) throw Error('Unexpected API request: '+url.pathname);
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

    const gardenBefore=await capture();
    await page.evaluate(()=>window.openSettingsSection('ai'));
    await page.waitForSelector('#ollama-setup:not([hidden])');
    assert.equal(await page.inputValue('#ai-provider'),'ollama');assert.equal(await page.inputValue('#ai-model'),'llama3:latest');
    assert.equal(await page.getAttribute('#ollama-setup a','href'),'https://ollama.com/download');
    await page.click('#ollama-setup [data-ollama-copy]'); await page.waitForFunction(()=>document.querySelector('#ollama-setup .ollama-copy-status').textContent.includes('gekopieerd'));
    assert.equal(await page.evaluate(()=>navigator.clipboard.readText()),'ollama pull llama3:latest');
    const test=async()=>{await page.click('#ollama-test');await page.waitForFunction(()=>!document.getElementById('ollama-test').disabled);return page.locator('#ollama-test-status').innerText();};
    assert.match(await test(),/llama3:latest is beschikbaar/);
    state='missing';assert.match(await test(),/niet gedownload/);
    state='unreachable';assert.match(await test(),/niet bereikbaar/);
    runtime='hosted';state='unconfigured';assert.match(await test(),/online backend/);assert.match(await page.locator('#ollama-route-note').innerText(),/Jouw localhost/);
    runtime='local';state='ready'; await test();
    await page.fill('#ai-model','custom:latest'); await page.locator('#ai-settings-form button[type="submit"]').click();
    await page.evaluate(()=>toggleSettingsPanel_REPAIR_V131());await page.evaluate(()=>window.openSettingsSection('ai'));
    await page.waitForSelector('#ollama-setup:not([hidden])');assert.equal(await page.inputValue('#ai-model'),'custom:latest');assert.match(await test(),/custom:latest is beschikbaar/);
    await page.fill('#ai-model','llama3:latest');await page.locator('#ai-settings-form button[type="submit"]').click();
    await page.setViewportSize({width:390,height:1000});
    await page.evaluate(()=>window.openSettingsSection('ai'));await page.waitForSelector('#ollama-setup:not([hidden])');await test();
    fs.mkdirSync(path.join(root,'assets/help'),{recursive:true});await page.locator('#ai-settings-form').screenshot({style: '.settings-page-header { visibility: hidden !important; }', path:path.join(root,'assets/help/local-ai-settings.png')});
    for(const theme of ['light','dark','playful']) {
      await page.evaluate(theme=>window.setAppTheme(theme),theme);
      for(const width of [1440,390,320]) {
        await page.setViewportSize({width,height:1000});await page.evaluate(()=>window.openSettingsSection('ai'));await page.waitForSelector('#ollama-setup:not([hidden])');await test();
        if (!await page.locator('#settings-panel').evaluate(el=>el.scrollWidth<=el.clientWidth)) console.log('overflow',theme,width,await page.locator('#settings-panel').evaluate(el=>({client:el.clientWidth,scroll:el.scrollWidth,rows:[...el.querySelectorAll('*')].filter(item=>item.scrollWidth>item.clientWidth+2).map(item=>[item.id,item.className,item.clientWidth,item.scrollWidth]).slice(0,12)})));
        assert(await page.locator('#settings-panel').evaluate(el=>el.scrollWidth<=el.clientWidth));
        if(width!==320) await page.locator('#ai-settings-form').screenshot({style: '.settings-page-header { visibility: hidden !important; }', path:path.join(out,theme+'-'+width+'-settings.png')});
        if(theme==='light'&&width===390) {fs.mkdirSync(path.join(root,'assets/help'),{recursive:true});await page.locator('#ai-settings-form').screenshot({style: '.settings-page-header { visibility: hidden !important; }', path:path.join(root,'assets/help/local-ai-settings.png')});}
        await page.click('[data-ollama-help]');await page.waitForSelector('#local-ai-help[open]');
        assert.match(await page.locator('#local-ai-help').innerText(),/Netlify kan jouw Ollama op localhost niet bereiken/);
        await page.locator('#local-ai-help img').scrollIntoViewIfNeeded();await page.waitForFunction(()=>document.querySelector('#local-ai-help img').naturalWidth>0);
        assert(await page.locator('#settings-panel').evaluate(el=>el.scrollWidth<=el.clientWidth));
        if(width!==320) { await page.locator('#local-ai-help > summary').scrollIntoViewIfNeeded(); await page.screenshot({path:path.join(out,theme+'-'+width+'-help.png')}); }
      }
    }
    await page.evaluate(()=>toggleSettingsPanel_REPAIR_V131());await page.setViewportSize({width:390,height:1000});
    await page.fill('#ai-question-input','Mijn vraag blijft bewaard');await page.click('#btn-ask-ai');await page.waitForSelector('#ai-assistant-output .ollama-help-link');
    assert.equal(await page.inputValue('#ai-question-input'),'Mijn vraag blijft bewaard');await page.click('#ai-assistant-output .ollama-help-link');await page.waitForSelector('#local-ai-help[open]');
    await page.evaluate(()=>toggleSettingsPanel_REPAIR_V131());
    await page.click('#btn-add-plant-home');await page.fill('#naam','Neutrale testplant');await page.click('#toggle-extra');await page.fill('#beschrijving','Eigen plantgegevens blijven bewaard');
    await page.click('#btn-auto-fill-info');await page.waitForSelector('#ai-source-status .ollama-help-link');assert.equal(await page.inputValue('#naam'),'Neutrale testplant');assert.equal(await page.inputValue('#beschrijving'),'Eigen plantgegevens blijven bewaard');
    await page.click('#ai-source-status .ollama-help-link');await page.waitForSelector('#local-ai-help[open]');
    assert.equal(fixtureErrors,2);assert(tagsRequests>=10);
    const gardenAfter=await capture();assert.deepEqual(gardenAfter.seeds,gardenBefore.seeds);assert.deepEqual(gardenAfter.reminders,gardenBefore.reminders);assert.deepEqual(errors,[]);
    console.log(JSON.stringify({checks:['Downloadlink, echte clipboard-copy, hulp en screenshot, tags-only test success/missing/offline/hosted, expliciet custom model behouden, beide AI-fouthulplinks met behoud invoer, desktop/mobiel Licht/Donker/Warm'],errors,tagsRequests,simulatedErrors:fixtureErrors,liveGenerationRequests:0,screenshots:out},null,2));
    await context.close();
  } finally {await browser.close();server.close();}
})().catch(error=>{console.error(error);server.close();process.exitCode=1;});
