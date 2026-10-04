// Actual app/SDK/DOM, two isolated browsers, only local Supabase HTTP fixtures.
const assert = require('node:assert/strict');
const fs = require('node:fs'); const path = require('node:path');
const { chromium } = require('playwright');
const { createServer } = require('../scripts/dev-server.cjs');
const { startFixtures } = require('./service-fixtures.cjs');
const photo = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aX1kAAAAASUVORK5CYII=';
const garden = name => ({ backupVersion: 1, seeds: [{ id: 'auto-test', naam: name, type: 'Groente', status: 'Groeit', standplaats: 'Zon', isFavorite: true, images: [{ url: photo }], featuredImageUrl: photo }], wishlist: [{ id: 1, type: 'item', name: 'Wens', image: photo }], calendar: { '2026-10-03': ['Plan'] }, reminders: [{ id: 1, title: 'Water', date: '2026-10-03', done: false }], userProfile: { name: 'Autotest', photo }, onboardingDone: 'true' });
(async () => {
 const fixture = await startFixtures(); Object.assign(process.env, { SUPABASE_URL: fixture.base, SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_fixture', KWEEK_LOCAL_DEV: 'true' });
 const server = createServer(); await new Promise(resolve => server.listen(0, '127.0.0.1', resolve)); const base = `http://127.0.0.1:${server.address().port}`;
 const browser = await chromium.launch(); const errors = [], checks = []; let writes = 0;
 const wait = async predicate => { const until = Date.now() + 12000; while (!predicate()) { if (Date.now() > until) throw Error('Fixture state timeout'); await new Promise(resolve => setTimeout(resolve, 40)); } };
 const queue = page => page.evaluate(id => JSON.parse(localStorage.getItem('kweekkompas_auto_' + id)), fixture.ids.a);
 const capture = page => page.evaluate(() => window.KweekLocalData.captureCloud());
 const edit = (page, name) => page.evaluate(async name => { const p = (await window.KweekLocalData.capture()).seeds.find(x => x.id === 'auto-test'); await saveSeed({ ...p, naam: name }); }, name);
 const open = async page => { await page.evaluate(() => window.openSettingsSection('cloud')); await page.waitForFunction(() => document.getElementById('cloud-login-status').textContent.length > 0); };
 const clickChoice = async (page, direction) => { page.once('dialog', d => d.accept()); await page.click('[data-auto-choice="' + direction + '"]'); };
 const login = async (page, email = 'a@example.test') => { await open(page); await page.click('#cloud-open-account'); await page.fill('#cloud-email', email); await page.fill('#cloud-password', 'test-password'); await page.click('#cloud-auth-submit'); await page.waitForFunction(() => !document.querySelector('#account-popup[open]') && document.getElementById('cloud-login-status').textContent.includes('Ingelogd')); };
 async function device(width, name) {
  const context = await browser.newContext({ viewport: { width, height: 900 } });
  await context.addInitScript(() => { localStorage.setItem('onboarding_done', 'true'); sessionStorage.setItem('kweekkompas_account_choice', 'local'); });
  await context.route('**/*', route => { const url = new URL(route.request().url()); if (url.origin !== base && url.origin !== fixture.base) return route.abort(); if (url.pathname.startsWith('/api/ai-')) return route.fulfill({ json: { defaultProvider: 'ollama', providers: {}, models: [] } }); if (url.pathname === '/api/cloud-sync' && route.request().method() === 'POST') writes++; return route.continue(); });
  const page = await context.newPage(); page.setDefaultTimeout(12000); page.on('pageerror', e => errors.push(e.message)); await page.goto(base); await page.waitForFunction(() => window.KweekLocalData); await page.evaluate(value => window.KweekLocalData.restore(value), garden(name)); await login(page); return { page, context };
 }
 try {
  const a = await device(1440, 'Device A'), b = await device(390, 'Device B');
  assert.equal(writes, 0); assert.equal(await a.page.locator('#cloud-auto-sync').isChecked(), false);
  await a.page.locator('#cloud-auto-sync').click(); await a.page.waitForSelector('#cloud-auto-choices:not([hidden])'); assert.equal(writes, 0);
  await clickChoice(a.page, 'local'); await wait(() => fixture.snapshots.get(fixture.ids.a)?.revision === 1); assert.equal(fixture.storage.uploads, 1);
  await a.page.waitForFunction(id => { const s = JSON.parse(localStorage.getItem('kweekkompas_auto_' + id)); return s?.basis?.revision === 1; }, fixture.ids.a);
  const beforeRead = (await queue(a.page)).counter;
  for (let i = 0; i < 5; i++) await capture(a.page);
  assert.equal((await queue(a.page)).counter, beforeRead, 'reading the profile is not an edit');
  await b.page.locator('#cloud-auto-sync').click(); await b.page.waitForSelector('#cloud-auto-choices:not([hidden])'); await clickChoice(b.page, 'cloud');
  await b.page.waitForFunction(() => document.getElementById('settings-panel')?.classList.contains('open') === false && document.getElementById('view-home') && !document.getElementById('view-home').classList.contains('hidden')).catch(async error => { console.log('B queue:', await queue(b.page), await b.page.locator('#cloud-error-detail').textContent(), await b.page.locator('#cloud-auto-note').textContent()); throw error; });
  await b.page.waitForFunction(id => JSON.parse(localStorage.getItem('kweekkompas_auto_' + id))?.basis?.revision === 1, fixture.ids.a);
  assert.deepEqual(await capture(b.page), await capture(a.page));
  checks.push('Schakelaar standaard uit; login uploadt niets; verschillende tuinen vragen keuze; cloudkeuze maakt veiligheidskopie en herstelt alle fotoslots');
  for (let i = 0; i < 12; i++) await edit(a.page, 'Rapid ' + i);
  await wait(() => fixture.snapshots.get(fixture.ids.a)?.revision === 2); assert.equal(fixture.snapshots.get(fixture.ids.a).payload.seeds[0].naam, 'Rapid 11'); assert.equal(fixture.storage.uploads, 1);
  let release; const blocked = new Promise(resolve => release = resolve); let holding = false;
  await a.page.route('**/api/cloud-sync', async route => { if (route.request().method() !== 'POST') return route.continue(); holding = true; await blocked; return route.continue(); });
  await edit(a.page, 'Before upload'); await wait(() => holding); await edit(a.page, 'During upload'); release();
  await wait(() => fixture.snapshots.get(fixture.ids.a)?.revision === 4); await a.page.unroute('**/api/cloud-sync'); assert.equal(fixture.snapshots.get(fixture.ids.a).payload.seeds[0].naam, 'During upload');
  checks.push('Twaalf snelle bewerkingen geven één upload; bewerking tijdens upload blijft klaarstaan voor tweede ronde; identieke fotos hergebruikt');
  // Force a return-to-app check via the real visibility handler, not engine internals.
  const refreshed = b.page.waitForEvent('framenavigated');
  await b.page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
  await refreshed; await b.page.waitForFunction(() => window.KweekLocalData);
  await b.page.waitForFunction(id => JSON.parse(localStorage.getItem('kweekkompas_auto_' + id))?.basis?.revision === 4, fixture.ids.a);
  assert.equal((await capture(b.page)).seeds[0].naam, 'During upload');
  checks.push('Schoon tweede apparaat haalt nieuwe cloudversie automatisch terug, met lokale veiligheidskopie');
  await b.context.setOffline(true); await edit(b.page, 'Offline edit'); await b.page.waitForFunction(id => { const s = JSON.parse(localStorage.getItem('kweekkompas_auto_' + id)); return s?.retries > 0 || s?.paused === 'offline'; }, fixture.ids.a);
  assert((await queue(b.page)).counter > (await queue(b.page)).done);
  // Allow only local document/assets after reload; keep API network failures.
  await b.context.setOffline(false); await b.page.route('**/api/cloud-sync', route => route.abort()); await b.page.reload(); await b.page.waitForFunction(() => window.KweekLocalData);
  assert.equal((await capture(b.page)).seeds[0].naam, 'Offline edit'); assert((await queue(b.page)).counter > (await queue(b.page)).done);
  await b.page.unroute('**/api/cloud-sync'); await b.page.evaluate(() => window.dispatchEvent(new Event('online'))); await wait(() => fixture.snapshots.get(fixture.ids.a)?.revision === 5);
  checks.push('Offline wijzigingen blijven duurzaam klaarstaan na herladen; online-event hervat upload');
  await edit(a.page, 'Conflict A'); await wait(() => fixture.snapshots.get(fixture.ids.a)?.revision === 5); await a.page.waitForFunction(id => JSON.parse(localStorage.getItem('kweekkompas_auto_' + id))?.paused === 'conflict', fixture.ids.a);
  assert.equal((await capture(a.page)).seeds[0].naam, 'Conflict A'); assert.equal(fixture.snapshots.get(fixture.ids.a).payload.seeds[0].naam, 'Offline edit');
  await a.page.reload(); await open(a.page); assert.equal((await queue(a.page)).paused, 'conflict'); assert(await a.page.locator('#cloud-auto-choices').isVisible());
  await clickChoice(a.page, 'local'); await wait(() => fixture.snapshots.get(fixture.ids.a)?.revision === 6);
  checks.push('Twee gewijzigde sessies veroorzaken conflict; geen stil verlies; conflict en keuze blijven na herladen aanwezig');
  await a.page.evaluate(value => window.KweekLocalData.restore(value), garden('Backup import'));
  assert.equal((await queue(a.page)).paused, 'import'); await edit(a.page, 'Edit after backup import');
  await new Promise(resolve => setTimeout(resolve, 2200)); assert.equal(fixture.snapshots.get(fixture.ids.a).revision, 6);
  await a.page.reload(); await open(a.page); assert.equal((await queue(a.page)).paused, 'import');
  checks.push('Back-upimport pauzeert duurzaam, ook bij latere eigen bewerkingen en herladen; profiel uitlezen veroorzaakt geen wijzigingen');
  await a.page.evaluate(() => window.openSettingsSection('storage')); a.page.once('dialog', d => d.accept()); await a.page.click('[data-collection-id="kruiden-in-potten"]');
  await a.page.waitForFunction(id => JSON.parse(localStorage.getItem('kweekkompas_auto_' + id))?.paused === 'example', fixture.ids.a);
  assert.equal((await queue(a.page)).paused, 'example'); await edit(a.page, 'Edit after examples'); await new Promise(resolve => setTimeout(resolve, 2200)); assert.equal(fixture.snapshots.get(fixture.ids.a).revision, 6);
  await a.page.reload(); await open(a.page); assert.equal((await queue(a.page)).paused, 'example'); assert.equal(fixture.snapshots.get(fixture.ids.a).revision, 6);
  checks.push('Voorbeeldladen pauzeert duurzaam; ook latere eigen bewerking neemt voorbeelden niet ongemerkt mee');
  await clickChoice(a.page, 'cloud'); await a.page.waitForFunction(() => document.getElementById('settings-panel')?.classList.contains('open') === false); await open(a.page);
  await a.page.locator('#cloud-auto-sync').uncheck(); await edit(a.page, 'Disabled edit'); await new Promise(resolve => setTimeout(resolve, 2200)); assert.equal(fixture.snapshots.get(fixture.ids.a).revision, 6);
  a.page.once('dialog', d => d.accept()); await a.page.click('[data-cloud-action="logout"]'); await a.page.waitForSelector('#cloud-open-account:not([hidden])'); await login(a.page, 'b@example.test');
  assert.equal(await a.page.locator('#cloud-auto-sync').isChecked(), false); await edit(a.page, 'Other account edit'); await new Promise(resolve => setTimeout(resolve, 2200)); assert.equal(fixture.snapshots.has(fixture.ids.b), false);
  checks.push('Uitschakelen en accountwissel starten geen nieuwe uploads; wijzigingen van account A gaan niet naar account B');
  assert.deepEqual(errors, []); const out = path.resolve('scratch/auto-sync'); fs.mkdirSync(out, { recursive: true }); await a.page.screenshot({ path: path.join(out, 'desktop.png') }); await b.page.screenshot({ path: path.join(out, 'mobile.png') });
  const report = { simulated: checks, browserObservedWrites: writes, finalFixtureRevision: fixture.snapshots.get(fixture.ids.a).revision, errors, liveWrites: 0 }; fs.writeFileSync(path.join(out, 'report.json'), JSON.stringify(report, null, 2)); console.log(JSON.stringify(report, null, 2)); await a.context.close(); await b.context.close();
 } finally { await browser.close(); await new Promise(resolve => server.close(resolve)); await fixture.stop(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
