const assert = require('node:assert/strict');
const { chromium } = require('playwright');
const { createServer } = require('../scripts/dev-server.cjs');
const { startFixtures, configureFixtures } = require('./service-fixtures.cjs');

(async () => {
    const fixture = await startFixtures(); configureFixtures(fixture);
    const server = createServer(); await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    const base = `http://127.0.0.1:${server.address().port}`;
    const browser = await chromium.launch();
    const errors = [];
    try {
        for (const width of [1440, 390]) for (const role of ['admin', 'user']) {
            const context = await browser.newContext({ viewport: { width, height: 900 }, isMobile: width === 390, hasTouch: width === 390 });
            const user = { id: role === 'admin' ? fixture.ids.a : fixture.ids.b, email: `${role}@example.test`, role };
            let aiRequest, centralKey = '', defaultLimit = 500, override = null, budgetExhausted = false, userActive = true, userActions = [];
            await context.route('**/api/auth', route => route.fulfill({ status: 200, json: { configured: true, user } }));
            await context.route('**/api/ai-budget', route => {
                const body = route.request().postDataJSON();
                if (body.action === 'set-default') defaultLimit = body.limit;
                if (body.action === 'set-limit') override = body.limit;
                if (body.action === 'clear-limit') override = null;
                const value = body.action === 'list' ? { defaultLimit, users: [{ id: fixture.ids.b, name: 'Bert', email: 'b@example.test', active: userActive, limit: override ?? defaultLimit, override, used: 1, remaining: (override ?? defaultLimit) - 1 }], totalRequests: 1, totalInputTokens: 12, totalOutputTokens: 8 } : { remaining: 499, limit: 500, month: '2026-11-01' };
                return route.fulfill({ status: 200, json: value });
            });
            await context.route('**/api/user-management', route => { const body = route.request().postDataJSON(); userActions.push(body); if (body.action === 'set-active') userActive = body.active; return route.fulfill({ status: 200, json: { ok: true } }); });
            await context.route('**/api/tuinassistent', route => { aiRequest = route.request().postDataJSON(); return route.fulfill(budgetExhausted ? { status: 429, json: { error: 'Je AI-maandbudget is op. Volgende maand kun je weer aanvragen doen.' } } : { status: 200, json: { answer: 'Testadvies', actions: [] } }); });
            await context.route('**/api/central-ai-config', route => {
                const body = route.request().postDataJSON();
                if (body.action === 'save-test') centralKey = body.apiKey;
                return route.fulfill({ status: 200, json: { configured: Boolean(centralKey), model: 'gemini-3.5-flash-lite', tested: body.action !== 'status' } });
            });
            await context.route('https://**/*', route => route.abort());
            const page = await context.newPage(); page.on('pageerror', error => errors.push(`${role}/${width}: ${error.message}`));
            await page.goto(base); await page.waitForFunction(() => window.KweekLocalData && window.openSettingsSection);
            await page.evaluate(async () => KweekLocalData.restore({ backupVersion: 1, seeds: [{ id: 'p1', naam: 'Testplant', type: 'Groente', status: 'Voorraad', standplaats: 'Zon' }], onboardingDone: 'true' }));
            await page.evaluate(() => window.openSettingsSection('profile'));
            await page.waitForSelector('#settings-section-account', { state: 'attached' });
            await page.locator('.settings-collapse').evaluateAll(items => items.forEach(item => { item.open = true; }));
            assert.equal(await page.locator('#profile-modal-name').count(), 1);
            assert.equal(await page.locator('#local-backup-choose').count(), 1);
            assert.equal(await page.locator('#settings-panel').getByRole('button', { name: 'Back-up downloaden', exact: true }).count(), 1);
            assert.equal(await page.locator('#settings-panel').getByRole('button', { name: 'Back-up herstellen', exact: true }).count(), 1);
            assert.equal(await page.locator('#account-settings-logout').count(), 1);
            assert.equal(await page.locator('#ai-profile-consent').count(), 1);
            const technical = page.locator('#ai-provider, #ai-gemini-model, #ai-model, #gemini-free-key, #custom-api-address, #custom-api-key, #ollama-setup, #local-ai-help');
            if (role === 'admin') {
                assert.ok(await technical.count() > 0);
                assert.equal(await page.locator('#home-ai-provider').getAttribute('hidden'), null);
                await page.waitForFunction(() => document.querySelector('#central-ai-status')?.textContent.includes('geen sleutel'));
                for (const value of ['first-fixture-key', 'replacement-fixture-key']) {
                    await page.fill('#central-ai-key', value);
                    await page.click('#central-ai-save');
                    await page.waitForFunction(() => document.querySelector('#central-ai-status')?.textContent.includes('geslaagd'));
                    assert.equal(await page.inputValue('#central-ai-key'), '');
                    assert.equal(centralKey, value);
                }
                await page.click('#central-ai-test');
                await page.waitForFunction(() => !document.querySelector('#central-ai-test').disabled);
                await page.waitForFunction(() => document.querySelector('#ai-budget-users input[type=number]'));
                await page.fill('#ai-budget-default', '600'); await page.click('#ai-budget-save-default');
                await page.waitForFunction(() => document.querySelector('#ai-budget-users').textContent.includes('599 over'));
                await page.locator('#ai-budget-users input[type=number]').fill('200');
                await page.getByRole('button', { name: 'Limiet opslaan', exact: true }).click();
                await page.waitForFunction(() => document.querySelector('#ai-budget-users').textContent.includes('199 over'));
                assert.equal(override, 200);
                await page.fill('#user-create-name', 'Nieuwe gebruiker');
                await page.fill('#user-create-email', 'nieuw@example.test');
                await page.fill('#user-create-password', 'tijdelijk-123');
                await page.click('#user-create-form button');
                await page.waitForFunction(() => document.querySelector('#user-management-status').textContent.includes('aangemaakt'));
                assert.equal(userActions.at(-1).action, 'create'); assert.equal(await page.inputValue('#user-create-password'), '');
                await page.getByRole('button', { name: 'Deactiveren', exact: true }).click();
                await page.waitForFunction(() => document.querySelector('#ai-budget-users').textContent.includes('Inactief'));
                await page.getByRole('button', { name: 'Activeren', exact: true }).click();
                await page.waitForFunction(() => document.querySelector('#ai-budget-users').textContent.includes('Actief'));
                await page.locator('#ai-budget-users input[type=password]').fill('nieuw-wachtwoord-123');
                await page.getByRole('button', { name: 'Wachtwoord instellen', exact: true }).click();
                await page.waitForFunction(() => document.querySelector('#ai-budget-admin-status').textContent.includes('ingesteld'));
                assert.equal(userActions.at(-1).action, 'reset-password');
            } else {
                assert.equal(await technical.count(), 0);
                assert.equal(await page.locator('#settings-section-user-ai').count(), 0);
                assert.equal(await page.locator('#settings-section-users').count(), 0);
                assert.equal(await page.locator('#home-ai-provider').isHidden(), true);
                await page.waitForFunction(() => document.querySelector('#ai-budget-remaining').textContent.includes('499 van 500'));
                await page.locator('#settings-section-ai').evaluate(el => { el.closest('details').open = true; });
                await page.locator('#ai-profile-consent').check();
                assert.equal(await page.evaluate(() => KweekScope.storage.getItem('kweekkompas_ai_profile_consent')), 'true');
                assert.equal((await page.evaluate(() => KweekServices.requestAI('tuinassistent', { question: 'Test' }))).answer, 'Testadvies');
                assert.ok(aiRequest.gardenContext);
                assert.equal(aiRequest.ai.provider, 'central');
                assert.equal(aiRequest.ai.model, 'gemini-3.5-flash-lite');
                budgetExhausted = true;
                await page.evaluate(() => { document.querySelector('#ai-question-input').value = 'Test'; document.querySelector('#btn-ask-ai').click(); });
                await page.waitForFunction(() => document.querySelector('#ai-assistant-output')?.textContent.includes('AI-maandbudget is op'));
            }
            assert.equal((await page.evaluate(() => KweekLocalData.capture())).seeds[0].naam, 'Testplant');
            assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, `${role} ${width}: horizontaal overlopend`);
            await context.close();
        }
        assert.deepEqual(errors, []);
        console.log('Admin en gebruiker: instellingen, tuin, back-up en privacykeuze op desktop en mobiel geslaagd.');
    } finally { await browser.close(); await new Promise(resolve => server.close(resolve)); await fixture.stop(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
