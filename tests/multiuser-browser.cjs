const assert = require('node:assert/strict');
const { chromium } = require('playwright');
const { createServer } = require('../scripts/dev-server.cjs');
const { startFixtures, configureFixtures } = require('./service-fixtures.cjs');

(async () => {
    const fixture = await startFixtures(); configureFixtures(fixture);
    const server = createServer(); await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    const base = `http://127.0.0.1:${server.address().port}`;
    const browser = await chromium.launch();
    const context = await browser.newContext();
    let current = null, cloudReads = 0, unblockStartup, authUnavailable = false;
    const startupGate = new Promise(resolve => { unblockStartup = resolve; });
    let firstAuth = true;
    const users = { a: { id: fixture.ids.a, email: 'a@example.test', role: 'admin' }, b: { id: fixture.ids.b, email: 'b@example.test', role: 'user' } };
    await context.route('**/api/auth', async route => {
        const req = route.request();
        if (firstAuth && req.method() === 'GET') { firstAuth = false; await startupGate; }
        if (authUnavailable && req.method() === 'GET') return route.fulfill({ status: 503, json: { error: 'offline' } });
        if (req.method() === 'POST') {
            const body = req.postDataJSON();
            if (body.action === 'login') current = users[body.email[0]] || null;
            if (body.action === 'logout') current = null;
        }
        await route.fulfill({ status: 200, json: { configured: true, user: current } });
    });
    await context.route('**/api/cloud-sync', async route => { cloudReads++; await route.abort(); });
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    const ready = () => page.waitForFunction(() => window.KweekLocalData && window.KweekDrafts);
    const login = async email => {
        await page.evaluate(() => window.openSettingsSection('account'));
        await page.waitForFunction(() => document.querySelector('#account-settings-login') && !document.querySelector('#account-settings-login').disabled);
        await page.click('#account-settings-login');
        await page.fill('#cloud-email', email);
        await page.fill('#cloud-password', 'test-password');
        await Promise.all([page.waitForNavigation(), page.click('#cloud-auth-submit')]);
        await ready();
    };
    const logout = async () => {
        await page.evaluate(() => window.openSettingsSection('account'));
        await page.waitForFunction(() => !document.querySelector('#account-settings-logout')?.hidden);
        await Promise.all([page.waitForNavigation(), page.click('#account-settings-logout')]);
        await ready();
    };
    try {
        await page.goto(base, { waitUntil: 'domcontentloaded' });
        await page.waitForFunction(() => document.body.innerText.includes('Account en lokale tuin worden gecontroleerd'));
        assert.equal(await page.evaluate(() => Boolean(window.KweekLocalData)), false);
        unblockStartup(); await ready();
        await page.evaluate(async () => {
            await KweekLocalData.restore({ backupVersion: 1, seeds: [{ id: 'a1', naam: 'Adminplant', type: 'Groente', status: 'Voorraad', standplaats: 'Zon', image: 'data:image/png;base64,YQ==' }], wishlist: [{ id: 1, name: 'Adminwens' }], onboardingDone: 'true' });
            await KweekDrafts.put('draft', { name: 'adminconcept' }, { image: 'adminfoto' });
        });
        await login('a@example.test');
        assert.equal(await page.evaluate(() => KweekScope.legacy), true);
        assert.equal((await page.evaluate(() => KweekLocalData.capture())).seeds[0].naam, 'Adminplant');
        assert.equal(await page.evaluate(async () => { try { await KweekLocalData.restoreCloud({ backupVersion: 1, seeds: [] }); return false; } catch { return true; } }), true);
        assert.equal((await page.evaluate(() => KweekLocalData.capture())).seeds[0].naam, 'Adminplant');
        assert.equal((await page.evaluate(() => KweekDrafts.get('draft'))).assets.image, 'adminfoto');
        const otherTab = await context.newPage();
        await otherTab.goto(base); await otherTab.waitForFunction(() => window.KweekLocalData);
        assert.equal((await otherTab.evaluate(() => KweekLocalData.capture())).seeds[0].naam, 'Adminplant');
        await logout();
        await otherTab.waitForFunction(() => window.KweekScope?.id === 'guest' && window.KweekLocalData);
        assert.equal((await otherTab.evaluate(() => KweekLocalData.capture())).seeds.length, 0);
        await otherTab.close();
        assert.equal((await page.evaluate(() => KweekLocalData.capture())).seeds.length, 0);
        await login('b@example.test');
        assert.equal((await page.evaluate(() => KweekLocalData.capture())).seeds.length, 0);
        assert.equal(await page.evaluate(() => KweekDrafts.get('draft')), null);
        await page.evaluate(async () => {
            await KweekLocalData.restore({ backupVersion: 1, seeds: [{ id: 'b1', naam: 'Gebruikersplant', type: 'Groente', status: 'Voorraad', standplaats: 'Zon', image: 'data:image/png;base64,Yg==' }], onboardingDone: 'true' });
            await KweekDrafts.put('draft', { name: 'gebruikersconcept' }, { image: 'gebruikersfoto' });
        });
        await logout(); await login('a@example.test');
        const admin = await page.evaluate(() => KweekLocalData.capture());
        assert.equal(admin.seeds.length, 1); assert.equal(admin.seeds[0].naam, 'Adminplant');
        assert.equal(admin.seeds[0].image, 'data:image/png;base64,YQ==');
        assert.equal((await page.evaluate(() => KweekDrafts.get('draft'))).assets.image, 'adminfoto');
        await logout(); await login('b@example.test');
        assert.equal((await page.evaluate(() => KweekLocalData.capture())).seeds[0].naam, 'Gebruikersplant');
        assert.equal((await page.evaluate(() => KweekDrafts.get('draft'))).assets.image, 'gebruikersfoto');
        assert.equal(cloudReads, 0);
        authUnavailable = true;
        await page.reload({ waitUntil: 'domcontentloaded' });
        await page.waitForFunction(() => document.body.innerText.includes('kon niet veilig worden vastgesteld'));
        assert.equal(await page.evaluate(() => Boolean(window.KweekLocalData)), false);
        assert.deepEqual(errors, []);
        console.log('Accountwisselingen, lege tuin, lokale foto’s, concepten en legacy-adminopslag geslaagd.');
    } finally { await browser.close(); await new Promise(resolve => server.close(resolve)); await fixture.stop(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
