// Focused visual review of the local app; all API traffic is intercepted.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');
const base = 'http://127.0.0.1:4173';
const output = path.resolve('scratch/final-visual');
const id = '11111111-1111-4111-8111-111111111111';
const report = { origin: base, browser: 'headed Chromium', checks: [], screens: [], errors: [], mockedRequests: [], liveCloudWrites: 0, realMails: 0 };
const garden = { backupVersion: 1, seeds: [
    { id: 'visual-long', naam: 'Basilicum met een bijzonder lange eigen rasnaam voor balkon en moestuin '.repeat(3), type: 'Kruid', status: 'Gezaaid', fase_gezaaid: true, standplaats: 'Zon', water: 'Gemiddeld', zaaitijd: ['oktober', 'maart'], oogsttijd: ['oktober'], isFavorite: true, image: 'assets/starters/basilicum.png', beschrijving: 'Eigen notitie '.repeat(35) + 'Langwoord'.repeat(25) },
    { id: 'visual-stock', naam: 'Winterpostelein', type: 'Groente', status: 'Voorraad', standplaats: 'Halfschaduw', zaaitijd: ['oktober'] }
], wishlist: [{ id: 'w1', name: 'Een heel lange naam voor een gewenste plant en pot '.repeat(4), type: 'seed', note: 'Een eigen notitie '.repeat(30) }], reminders: [], userProfile: { name: 'Visuele testtuin', gardenType: 'Volle grond', light: 'Zon' }, onboardingDone: 'true' };
async function isolated(browser, width, theme, logged = false) {
    const context = await browser.newContext({ viewport: { width, height: width === 1440 ? 1000 : 844 }, timezoneId: 'Europe/Amsterdam' });
    const state = { logged, error: false };
    await context.addInitScript(theme => localStorage.setItem('theme', theme), theme);
    await context.route('**/*', route => {
        const request = route.request(), url = new URL(request.url());
        if (url.origin !== base) return route.abort();
        if (!url.pathname.startsWith('/api/')) return route.continue();
        report.mockedRequests.push({ path: url.pathname, method: request.method() });
        if (url.pathname === '/api/auth') return route.fulfill({ json: { configured: true, user: state.logged ? { id, email: 'visueel@example.test' } : null, recovery: false } });
        if (url.pathname === '/api/cloud-sync') return route.fulfill({ status: state.error ? 503 : 200, json: state.error ? { error: 'Geen verbinding met de cloud. Je lokale tuin blijft bewaard.' } : { userId: id, snapshot: null } });
        return route.fulfill({ json: { defaultProvider: 'ollama', providers: { ollama: { label: 'Lokale controle', configured: false } }, models: [] } });
    });
    const page = await context.newPage(); page.setDefaultTimeout(7000);
    page.on('pageerror', error => report.errors.push(error.message));
    await page.goto(base); await page.waitForFunction(() => window.KweekLocalData);
    return { context, page, state };
}
async function shot(page, name, scope = 'body') {
    const metric = await page.locator(scope).evaluate(element => {
        const scrollZones = [element, ...element.querySelectorAll('*')].filter(el => {
            const style = getComputedStyle(el), rect = el.getBoundingClientRect();
            return el.tagName !== 'TEXTAREA' && el.checkVisibility({ checkVisibilityCSS: true }) && rect.width && rect.height && /(auto|scroll)/.test(style.overflowY) && el.scrollHeight > el.clientHeight + 2;
        }).map(el => el.id || el.className);
        return { width: innerWidth, height: innerHeight, overflow: document.documentElement.scrollWidth > innerWidth + 1, panelOverflow: element.scrollWidth > element.clientWidth + 1, scrollZones };
    });
    assert.equal(metric.overflow, false, name + ': horizontal page overflow');
    assert.equal(metric.panelOverflow, false, name + ': horizontal panel overflow');
    assert(metric.scrollZones.length <= 1, name + ': multiple panel scroll zones');
    await page.screenshot({ path: path.join(output, name + '.png'), animations: 'disabled' });
    report.screens.push({ name, ...metric });
}
const settle = page => page.waitForTimeout(550); // Only settle explicit smooth-scroll UI transitions.
(async () => {
    fs.mkdirSync(output, { recursive: true });
    const browser = await chromium.launch({ headless: false });
    try {
        for (const theme of ['light', 'dark', 'playful']) for (const width of [1440, 390]) {
            const { context, page, state } = await isolated(browser, width, theme);
            const tag = `${width}-${theme}`;
            try {
                await page.waitForSelector('#account-popup[open]');
                await shot(page, tag + '-start', '#account-popup');
                await page.getByRole('button', { name: 'Inloggen', exact: true }).click();
                await page.fill('#cloud-email', 'ongeldig'); await page.click('#cloud-auth-submit');
                assert.match(await page.locator('#cloud-auth-status').innerText(), /geldig e-mailadres/);
                await shot(page, tag + '-account-error', '#account-popup');
                await page.locator('[data-auth-mode="signup"]').click();
                assert.equal(await page.locator('[data-auth-mode="signup"]').getAttribute('aria-selected'), 'true');
                await page.locator('[data-auth-mode="signup"]').press('ArrowLeft');
                assert.equal(await page.locator('[data-auth-mode="login"]').getAttribute('aria-selected'), 'true');
                await page.click('#account-forgot');
                assert.equal(await page.locator('#cloud-password').isVisible(), false);
                await page.keyboard.press('Escape');
                assert.equal(await page.locator('#account-popup').evaluate(el => el.open), false);
                await page.evaluate(async garden => { sessionStorage.setItem('kweekkompas_account_choice', 'local'); await window.KweekLocalData.restore(garden); }, garden);
                state.logged = true; await page.reload(); await page.waitForSelector('#view-home:not(.hidden)');
                const original = await page.evaluate(() => window.KweekLocalData.capture());
                const openSettings = () => page.locator(width === 1440 ? '#shell-settings-button' : '.shell-mobile-settings').click();
                await openSettings();
                await page.waitForFunction(() => document.getElementById('cloud-account-name').textContent.includes('@'));
                assert.equal(await page.locator('#cloud-auto-sync').isChecked(), false);
                assert.equal(await page.locator('#cloud-auto-sync').isEnabled(), true);
                assert.equal(await page.locator('.settings-collapse[open]').count(), 0);
                assert.equal(await page.evaluate(() => document.activeElement.className), 'settings-close-button');
                await page.locator('.settings-storage-shortcut').focus(); await page.keyboard.press('Shift+Tab');
                assert.equal(await page.evaluate(() => document.activeElement.textContent), 'Hulp');
                await page.keyboard.press('Tab');
                assert.equal(await page.evaluate(() => document.activeElement.className), 'settings-secondary-button settings-storage-shortcut');
                await shot(page, tag + '-compact-settings', '#settings-panel');
                await page.locator('.settings-collapse > summary').filter({ hasText: /^Weergave$/ }).click();
                await page.locator(`[data-theme-choice="${theme}"]`).scrollIntoViewIfNeeded(); await settle(page);
                const scroll = await page.locator('.settings-content').evaluate(el => el.scrollTop);
                await page.locator(`[data-theme-choice="${theme}"]`).click(); await settle(page);
                const afterThemeScroll = await page.locator('.settings-content').evaluate(el => el.scrollTop);
                assert(Math.abs(afterThemeScroll - scroll) < 5, `${tag}: theme changes must preserve drawer position (${scroll} -> ${afterThemeScroll})`);
                assert.equal(await page.evaluate(() => document.activeElement.dataset.themeChoice), theme);
                assert.equal(await page.locator(`[data-theme-choice="${theme}"]`).getAttribute('aria-pressed'), 'true');
                await page.keyboard.press('Escape');
                assert.equal(await page.locator('#settings-panel').evaluate(el => el.classList.contains('open')), false);
                assert.equal(await page.locator('#main-content').evaluate(el => el.inert), false);
                assert.equal(await page.locator(width === 1440 ? '#shell-settings-button' : '.shell-mobile-settings').evaluate(el => el === document.activeElement), true);
                await openSettings(); await page.click('#cloud-auto-sync');
                await page.waitForSelector('#cloud-auto-choices:not([hidden])');
                assert.equal(await page.locator('#cloud-status').count(), 1);
                await shot(page, tag + '-sync-choice', '#settings-panel');
                await page.keyboard.press('Escape'); await openSettings();
                await page.click('.settings-storage-shortcut'); await settle(page);
                await page.waitForSelector('[data-collection-id]');
                await shot(page, tag + '-backup-controls', '#settings-panel');
                const downloading = page.waitForEvent('download'); await page.getByRole('button', { name: 'Back-up downloaden', exact: true }).click();
                await (await downloading).saveAs(path.join(output, tag + '-isolated-backup.json'));
                const choosing = page.waitForEvent('filechooser'); await page.getByRole('button', { name: 'Back-up herstellen', exact: true }).click();
                await (await choosing).setFiles({ name: 'ongeldig.json', mimeType: 'application/json', buffer: Buffer.from('{ongeldig') });
                await page.waitForFunction(() => document.querySelector('.toast')?.textContent.includes('Ongeldige backup'));
                const toast = await page.locator('.toast').boundingBox(); assert(toast.x >= 0 && toast.x + toast.width <= width);
                assert.equal(await page.locator('#toast-container').evaluate(el => el.inert), false);
                await shot(page, tag + '-backup-error', '#settings-panel');
                await page.locator('#example-collections-list').scrollIntoViewIfNeeded(); await settle(page);
                await shot(page, tag + '-examples', '#settings-panel');
                page.once('dialog', dialog => dialog.dismiss()); await page.locator('[data-collection-id="kruiden-in-potten"]').click();
                assert.deepEqual(await page.evaluate(() => window.KweekLocalData.capture()), original);
                await page.locator('.settings-close-button').press('Escape');
                await page.evaluate(() => window.switchView('wishlist')); await page.getByRole('button', { name: 'Bewerken', exact: true }).click();
                await page.locator('.toast').waitFor({ state: 'detached' });
                const beforeY = await page.evaluate(() => scrollY); await page.mouse.move(5, 300); await page.mouse.wheel(0, 500); await page.waitForTimeout(100);
                assert.equal(await page.evaluate(() => scrollY), beforeY);
                await page.locator('#btn-close-wish-modal').focus(); await page.keyboard.press('Shift+Tab');
                assert.equal(await page.evaluate(() => document.activeElement.id), 'btn-wish-save');
                await page.keyboard.press('Tab'); assert.equal(await page.evaluate(() => document.activeElement.id), 'btn-close-wish-modal');
                await shot(page, tag + '-wishlist-dialog', '#wishlist-detail-modal');
                if (width === 390) {
                    await page.setViewportSize({ width: 320, height: 568 });
                    await shot(page, '320-' + theme + '-short-wishlist-dialog', '#wishlist-detail-modal');
                    await page.locator('.wishlist-modal-body').evaluate(el => el.scrollTop = el.scrollHeight);
                    assert(await page.locator('#btn-wish-save').isVisible());
                    const close = await page.locator('#btn-close-wish-modal').boundingBox(); assert(close.y >= 0 && close.y + close.height <= 568);
                    const title = await page.locator('#wish-modal-title').boundingBox(); assert(title.x + title.width < close.x, 'short mobile title must not overlap close button');
                    await page.setViewportSize({ width, height: 844 });
                }
                await page.keyboard.press('Escape');
                assert.equal(await page.locator('#main-content').evaluate(el => el.inert), false);
                assert.equal(await page.evaluate(() => document.activeElement.getAttribute('aria-label')), 'Bewerken');
                assert.deepEqual(await page.evaluate(() => window.KweekLocalData.capture()), original);
                state.error = true; await openSettings(); await page.click('#cloud-details > summary');
                await page.getByRole('button', { name: 'Cloudstatus vernieuwen', exact: true }).click();
                await page.waitForFunction(() => document.getElementById('cloud-error-detail').textContent.includes('Geen verbinding'));
                await page.locator('#cloud-details').scrollIntoViewIfNeeded(); await settle(page);
                await shot(page, tag + '-cloud-error', '#settings-panel');
                await page.keyboard.press('Escape');
                await page.evaluate(async () => window.KweekLocalData.restore({ backupVersion: 1, seeds: [], wishlist: [], reminders: [], onboardingDone: 'true' }));
                await page.reload(); await page.waitForFunction(() => window.KweekLocalData);
                for (const view of ['home', 'list', 'sowing-grid', 'calendar', 'wishlist']) {
                    await page.evaluate(view => { window.switchView(view); window.scrollTo(0, 0); }, view);
                    await shot(page, tag + '-empty-' + view, '#view-' + view);
                }
                report.checks.push(`${tag}: start/accountvalidatie/tabs; compacte instellingen en themafocus; één scrollzone, Escape/Tab/focusterugkeer; expliciete sync-keuze; back-updownload/ongeldige import; voorbeeldkeuze annuleren; verlanglijstvenster en achtergrondscroll; cloudfout; lege hoofdschermen`);
            } finally { await context.close(); }
        }
        assert.deepEqual(report.errors, []);
        assert.equal(report.mockedRequests.filter(request => request.method === 'POST').length, 0, 'visual review must not submit account or cloud writes');
        fs.writeFileSync(path.join(output, 'report.json'), JSON.stringify(report, null, 2));
        console.log(JSON.stringify({ checks: report.checks, screens: report.screens.length, errors: report.errors, liveCloudWrites: 0, realMails: 0 }, null, 2));
    } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
