const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');
const { startFixtures, configureFixtures } = require('./service-fixtures.cjs');
const { createServer } = require('../scripts/dev-server.cjs');
const output = path.resolve(__dirname, '..', 'scratch', 'visual-check');
fs.mkdirSync(output, { recursive: true });
const report = { screens: [], errors: [], checks: [] };
(async () => {
    const fixture = await startFixtures(); configureFixtures(fixture);
    const server = createServer(); await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    const base = `http://127.0.0.1:${server.address().port}`;
    const browser = await chromium.launch({ headless: true });
    try {
        const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
        const page = await context.newPage();
        page.setDefaultTimeout(8000);
        page.on('pageerror', error => report.errors.push(error.message));
        page.on('dialog', dialog => dialog.accept());
        await page.goto(base); await page.waitForFunction(() => window.KweekLocalData);
        async function shot(name) {
            await page.waitForTimeout(300);
            const metrics = await page.evaluate(() => ({ width: innerWidth, scrollWidth: document.documentElement.scrollWidth }));
            report.screens.push({ name, ...metrics });
            await page.screenshot({ path: path.join(output, name + '.png'), fullPage: true });
        }
        for (const width of [1440, 390]) {
            await page.setViewportSize({ width, height: width === 1440 ? 1000 : 844 });
            await shot(`${width}-onboarding-1`);
        }
        await page.locator('.onboarding-next[data-next="2"]').click(); await shot('390-onboarding-2');
        await page.locator('[data-choice-group="places"][data-val="Volle grond"]').click();
        await page.locator('[data-choice-group="light"][data-val="Zon"]').click();
        await page.locator('.onboarding-next[data-next="3"]').click(); await shot('390-onboarding-3');
        await page.locator('#btn-onboarding-finish').click();
        await page.waitForFunction(() => localStorage.getItem('onboarding_done') === 'true');
        await page.waitForSelector('#view-home:not(.hidden)');
        await page.evaluate(async () => {
            await window.KweekLocalData.restore({ backupVersion: 1, seeds: [
                { id: '1', naam: 'Tomaat met een lange eigen rasnaam', type: 'Groente', standplaats: 'Zon', water: 'Gemiddeld', status: 'Voorraad', zaaitijd: ['maart', 'april'], oogsttijd: ['augustus'], beschrijving: 'Eigen notitie behouden.', tags: ['Beginner'], isFavorite: true },
                { id: '2', naam: 'Basilicum', type: 'Kruid', standplaats: 'Zon', status: 'Gezaaid', zaaitijd: ['oktober'], oogsttijd: ['oktober'], tags: ['Potten'], fase_gezaaid: true }
            ], wishlist: [{ id: 1, name: 'Basilicum voor volgend seizoen', type: 'seed', note: 'Eigen notitie' }, { id: 2, name: 'Grote bak voor op het terras', type: 'item', note: 'Let op de afmetingen' }], userProfile: { name: 'Lokale tuin', light: 'Zon', gardenType: 'Volle grond', experience: 'Beginner' }, onboardingDone: 'true' });
        });
        await page.reload(); await page.waitForFunction(() => window.KweekLocalData);
        await page.evaluate(() => window.toggleSettingsPanel_REPAIR_V131());
        await page.waitForFunction(() => document.querySelector('#cloud-status')?.textContent.includes('Niet ingelogd'));
        const beforeLogin = await page.evaluate(() => window.KweekLocalData.capture());
        await page.fill('#cloud-email', 'a@example.test'); await page.fill('#cloud-password', 'wrong'); await page.click('#cloud-login-form button');
        await page.waitForFunction(() => document.querySelector('#cloud-status').textContent.includes('Inloggen mislukt'));
        await page.fill('#cloud-password', 'test-password'); await page.click('#cloud-login-form button');
        await page.waitForFunction(() => document.querySelector('#cloud-status').textContent.includes('nog geen tuin'));
        assert.deepEqual(await page.evaluate(() => window.KweekLocalData.capture()), beforeLogin);
        report.checks.push('Inloggen (fout en succes) behoudt lokale data en wist wachtwoordveld');
        assert.equal(await page.inputValue('#cloud-password'), '');
        const cookies = await context.cookies(); assert(cookies.filter(c => c.name.startsWith('kk_')).every(c => c.httpOnly));
        await page.selectOption('#ai-provider', 'ollama'); await page.fill('#ai-model', 'test-model'); await page.click('#ai-settings-form button');
        await page.click('[data-cloud-action="upload"]');
        await page.waitForFunction(() => document.querySelector('#cloud-status').textContent.includes('versie 1 opgeslagen'));
        assert.deepEqual(fixture.snapshots.get(fixture.ids.a).payload.seeds, beforeLogin.seeds);
        report.checks.push('Lokaal naar cloud behoudt profiel, notities, verlanglijst en zaden');
        await page.click('[data-cloud-action="logout"]');
        await page.waitForFunction(() => document.querySelector('#cloud-status').textContent.includes('Niet ingelogd'));
        assert.deepEqual(await page.evaluate(() => window.KweekLocalData.capture()), beforeLogin);
        await page.fill('#cloud-email', 'b@example.test'); await page.fill('#cloud-password', 'test-password'); await page.click('#cloud-login-form button');
        await page.waitForFunction(() => document.querySelector('#cloud-status').textContent.includes('b@example.test') && document.querySelector('#cloud-status').textContent.includes('nog geen tuin'));
        report.checks.push('Account B ziet de cloudtuin van A niet; uitloggen behoudt lokale tuin');
        await page.click('[data-cloud-action="logout"]'); await page.waitForFunction(() => !document.querySelector('#cloud-login-form').hidden);
        await page.fill('#cloud-email', 'a@example.test'); await page.fill('#cloud-password', 'test-password'); await page.click('#cloud-login-form button');
        await page.waitForFunction(() => document.querySelector('#cloud-status').textContent.includes('Cloudkopie versie 1'));
        await page.evaluate(async () => { const payload = await window.KweekLocalData.capture(); payload.seeds.find(s => s.id === '1').beschrijving = 'Lokaal gewijzigd na upload'; await window.KweekLocalData.restore(payload); });
        await page.click('[data-cloud-action="download"]'); await page.waitForEvent('load'); await page.waitForFunction(() => window.KweekLocalData);
        assert.equal((await page.evaluate(() => window.KweekLocalData.capture())).seeds.find(s => s.id === '1').beschrijving, beforeLogin.seeds.find(s => s.id === '1').beschrijving);
        await page.evaluate(() => window.toggleSettingsPanel_REPAIR_V131());
        await page.waitForFunction(() => document.querySelector('#cloud-status')?.textContent.includes('Cloudkopie versie 1'));
        await page.click('[data-cloud-action="recover"]'); await page.waitForEvent('load'); await page.waitForFunction(() => window.KweekLocalData);
        assert.equal((await page.evaluate(() => window.KweekLocalData.capture())).seeds.find(s => s.id === '1').beschrijving, 'Lokaal gewijzigd na upload');
        report.checks.push('Cloudherstel en terugzetten van de persistente veiligheidskopie werken');
        await page.evaluate(() => window.switchView('home'));
        await page.fill('#ai-question-input', 'Hoe verzorg ik tomaat?'); await page.click('#btn-ask-ai');
        await page.waitForFunction(() => document.querySelector('#ai-assistant-output').textContent.includes('bodemvochtigheid'));
        await page.evaluate(() => window.switchView('list')); await page.click('#btn-add-zaden-top');
        await page.fill('#naam', 'Tomaat'); await page.click('#btn-auto-fill-info');
        await page.waitForFunction(() => document.querySelector('#beschrijving').value.includes('Eigen teeltadvies'));
        assert.equal(await page.locator('#zaaitijd-picker .active').innerText(), 'Mrt');
        assert.equal(await page.locator('#oogsttijd-picker .active').innerText(), 'Aug');
        assert(fixture.calls.slice(-2).every(call => call.path === '/api/generate' && call.body.model === 'test-model'));
        report.checks.push('Tuinassistent en zadenhulp gebruiken opgeslagen Ollama-provider en model');
        await page.click('#btn-submit-form'); await page.waitForSelector('#view-list:not(.hidden)');
        assert((await page.evaluate(() => window.KweekLocalData.capture())).seeds.some(s => s.naam === 'Tomaat' && s.beschrijving.includes('Eigen teeltadvies')));
        report.checks.push('AI-voorstel wordt pas na de opslagactie als lokaal zaad bewaard');
        await page.evaluate(() => window.toggleSettingsPanel_REPAIR_V131());
        await page.waitForFunction(() => document.querySelector('#ai-provider-status')?.textContent.includes('backend ingesteld'));
        await page.selectOption('#ai-provider', 'openai-compatible'); await page.fill('#ai-model', 'test-custom'); await page.click('#ai-settings-form button');
        await page.evaluate(() => window.toggleSettingsPanel_REPAIR_V131());
        await page.evaluate(() => window.switchView('home')); await page.fill('#ai-question-input', 'Nog een vraag'); await page.click('#btn-ask-ai');
        await page.waitForFunction(() => !document.querySelector('#btn-ask-ai').disabled);
        await page.evaluate(() => window.switchView('add')); await page.fill('#naam', 'Tomaat'); await page.click('#btn-auto-fill-info');
        await page.waitForFunction(() => !document.querySelector('#btn-auto-fill-info').disabled);
        assert(fixture.calls.slice(-2).every(call => call.path === '/v1/chat/completions' && call.body.model === 'test-custom'));
        report.checks.push('Providerwissel naar eigen API werkt voor beide hulpen met hetzelfde model');
        await page.evaluate(() => window.toggleSettingsPanel_REPAIR_V131());
        await page.waitForFunction(() => document.querySelector('#ai-provider-status')?.textContent.includes('backend ingesteld'));
        await page.selectOption('#ai-provider', 'ollama'); await page.fill('#ai-model', 'fail'); await page.click('#ai-settings-form button');
        await page.evaluate(() => window.toggleSettingsPanel_REPAIR_V131());
        await page.evaluate(() => window.switchView('home')); await page.fill('#ai-question-input', 'Fouttest'); await page.click('#btn-ask-ai');
        await page.waitForSelector('#ai-assistant-output [role="alert"]');
        assert((await page.locator('#ai-assistant-output').innerText()).includes('fout (500)'));
        assert.equal(await page.locator('#btn-ask-ai').isDisabled(), false);
        await page.evaluate(() => window.switchView('add')); await page.click('#btn-auto-fill-info');
        await page.waitForFunction(() => document.querySelector('#ai-source-status').textContent.includes('fout (500)'));
        assert.equal(await page.locator('#btn-auto-fill-info').isDisabled(), false);
        report.checks.push('Providerfout is zichtbaar en de AI-knop wordt opnieuw bruikbaar');
        await page.evaluate(() => window.toggleSettingsPanel_REPAIR_V131());
        await page.waitForFunction(() => document.querySelector('#ai-provider-status')?.textContent.includes('backend ingesteld'));
        await page.fill('#ai-model', 'test-model'); await page.click('#ai-settings-form button');
        await page.evaluate(() => window.toggleSettingsPanel_REPAIR_V131());
        await page.evaluate(() => window.switchView('home'));
        await page.fill('#ai-question-input', 'Hoe verzorg ik tomaat?'); await page.click('#btn-ask-ai');
        await page.waitForFunction(() => document.querySelector('#ai-assistant-output').textContent.includes('bodemvochtigheid'));
        await page.evaluate(() => window.switchView('calendar')); await page.click('#btn-add-event-fab');
        await page.fill('#new-reminder-input', 'Water geven na het testen'); await page.click('#btn-add-reminder');
        assert((await page.evaluate(() => window.KweekLocalData.capture())).reminders.some(r => r.title === 'Water geven na het testen'));
        report.checks.push('Kalenderherinnering toevoegen en opnemen in de back-up werkt');
        const downloadWait = page.waitForEvent('download'); await page.evaluate(() => window.exportData());
        const download = await downloadWait;
        const exported = JSON.parse(fs.readFileSync(await download.path(), 'utf8'));
        assert(exported.seeds.some(s => s.naam === 'Tomaat'));
        assert(exported.reminders.some(r => r.title === 'Water geven na het testen'));
        assert.doesNotMatch(JSON.stringify(exported), /test-backend-secret|kk_access|refresh-a/);
        report.checks.push('Echte browserdownload bevat zaden en herinneringen, zonder providersleutels');
        await page.click('#shell-mobile-menu'); await page.waitForSelector('.app-sidebar.mobile-open');
        await shot('390-mobile-menu');
        await page.click('.shell-nav-item[data-view="list"]'); await page.waitForSelector('#view-list:not(.hidden)');
        assert.equal(await page.locator('#shell-mobile-menu').getAttribute('aria-expanded'), 'false');
        report.checks.push('Mobiele navigatie opent, wisselt scherm en sluit');
        const storage = await page.evaluate(() => ({ local: { ...localStorage }, session: { ...sessionStorage } }));
        assert.doesNotMatch(JSON.stringify(storage), /test-backend-secret|test-password|refresh-a|kk_access/);
        report.checks.push('Geen providersleutel of sessietoken in browseropslag');
        for (const width of [1440, 390, 320]) {
            await page.setViewportSize({ width, height: width === 1440 ? 1000 : 844 });
            for (const theme of ['light', 'dark', 'playful']) {
                await page.evaluate(theme => window.setAppTheme(theme), theme);
                for (const view of ['home', 'list', 'sowing-grid', 'calendar', 'wishlist', 'add']) {
                    await page.evaluate(view => window.switchView(view), view);
                    await shot(`${width}-${theme}-${view}`);
                }
                await page.evaluate(async () => window.openDetailView((await window.KweekLocalData.capture()).seeds[0])); await shot(`${width}-${theme}-detail`);
                await page.evaluate(async () => window.openDetailView((await window.KweekLocalData.capture()).seeds.find(s => s.id === '2'))); await shot(`${width}-${theme}-detail-no-photo`);
                await page.evaluate(() => window.toggleSettingsPanel_REPAIR_V131());
                await page.waitForFunction(() => document.querySelector('#ai-provider-status')?.textContent.includes('backend ingesteld'));
                await shot(`${width}-${theme}-settings`);
                for (const section of ['ai', 'cloud', 'storage']) {
                    await page.locator(`#settings-section-${section}`).scrollIntoViewIfNeeded(); await shot(`${width}-${theme}-settings-${section}`);
                }
                await page.evaluate(() => window.toggleSettingsPanel_REPAIR_V131());
                await page.evaluate(() => window.switchView('wishlist'));
                await page.locator('.wishlist-list-grid button').first().click();
                await shot(`${width}-${theme}-wishlist-modal`);
                await page.locator('#btn-close-wish-modal').click();
                await page.evaluate(() => window.switchView('list')); await page.click('#btn-scan-notes'); await shot(`${width}-${theme}-notes-modal`);
                await page.locator('#note-parser-modal .modal-close-btn').click();
            }
        }
        for (const sensitive of ['/.env', '/.git/config', '/netlify/functions/_shared/lib/ai.js', '/scratch/initial-desktop.png', '/package.json']) assert.equal((await page.request.get(base + sensitive)).status(), 404);
        report.checks.push('Lokale server weigert geheimen, backendcode en werkbestanden');
        const resetLoad = page.waitForEvent('load');
        await page.evaluate(() => window.resetApp()); await resetLoad; await page.waitForFunction(() => window.KweekLocalData);
        assert.equal((await page.evaluate(() => window.KweekLocalData.capture())).seeds.length, 0);
        assert.equal(await page.evaluate(async () => (await indexedDB.databases()).some(db => db.name === 'KweekKompasSafety')), false);
        assert(fixture.snapshots.has(fixture.ids.a));
        report.checks.push('Reset wist de lokale testtuin en veiligheidskopie; cloudkopie blijft bestaan');
        await context.close();
        assert.deepEqual(report.errors, []);
        const overflow = report.screens.filter(s => s.scrollWidth > s.width + 1);
        console.log(JSON.stringify({ checks: report.checks, screens: report.screens.length, overflow, errors: report.errors }, null, 2));
        fs.writeFileSync(path.join(output, 'report.json'), JSON.stringify(report, null, 2));
        if (overflow.length) process.exitCode = 1;
    } finally { await browser.close(); await new Promise(resolve => server.close(resolve)); await fixture.stop(); }
})().catch(error => { fs.writeFileSync(path.join(output, 'report.json'), JSON.stringify({ ...report, failure: error.message }, null, 2)); console.error(error); process.exitCode = 1; });
