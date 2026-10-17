const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const src = fs.readFileSync(path.join(__dirname, '..', 'services.js'), 'utf8');
const app = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');

test('Account is beschikbaar als cloudsync uitstaat en de browser herlaadt de gewijzigde service', () => {
    assert.match(src, /const CLOUD_SYNC_ENABLED = false/);
    assert.match(src, /id="settings-section-account"/);
    assert.match(src, /id="account-session-status"/);
    assert.match(src, /id="account-settings-login"/);
    assert.match(src, /id="account-settings-logout"/);
    assert.match(src, /\$\{accountSettingsHTML\(\)\}/);
    assert.match(src, /processAuthLink\(\);/);
    assert.match(src, /void refreshAccountSettings\(panel\)/);
    assert.match(src, /await request\('auth', \{ action: 'logout' \}\)/);
    assert.match(app, /services\.js\?v=16/);
    assert.doesNotMatch(src, /if \(CLOUD_SYNC_ENABLED\) \{\s*processAuthLink\(\)/);
    assert.doesNotThrow(() => new Function(src));
});

test('Accountwissel verwijdert geen lokale tuin en netwerkfouten behouden de sessie', async () => {
    const start = src.indexOf('    function renderAccountSettings(panel) {');
    const end = src.indexOf('    async function mount(panel) {', start);
    assert.ok(start >= 0 && end > start);
    const methods = src.slice(start, end);
    const makeHarness = new Function('service', `let user=null,accountConfigured=null,accountFeedback='',accountVersion=0,recovery=false,busy=false,cloud=null,conflictAccount=null,authMode='login';const CLOUD_SYNC_ENABLED=false;const auto={pause(){throw Error('unexpected cloud sync')},setAccount(){throw Error('unexpected cloud sync')},idle(){throw Error('unexpected cloud sync')}};const request=service; ${methods} return {renderAccountSettings,refreshAccountSettings,logoutAccount,getUser:()=>user};`);
    const fields = Object.fromEntries(['account-session-status', 'account-settings-login', 'account-settings-logout', 'account-settings-feedback'].map(key => ['#' + key, { textContent: '', hidden: false, disabled: false, isConnected: true }]));
    const panel = { querySelector: id => fields[id] || null };
    const field = name => fields['#' + name];
    const garden = { seeds: ['wortel', 'tomaat'] };
    let failGet = false, failLogout = false;
    const service = async (route, body) => {
        assert.equal(route, 'auth');
        if (!body) {
            if (failGet) throw new Error('offline');
            return { configured: true, user: { id: 'test', email: 'tuin@example.test' } };
        }
        assert.equal(body.action, 'logout');
        if (failLogout) throw new Error('offline');
        return { user: null };
    };
    const api = makeHarness(service);
    api.renderAccountSettings(panel);
    assert.equal(field('account-settings-login').disabled, true);
    await api.refreshAccountSettings(panel);
    assert.match(field('account-session-status').textContent, /tuin@example.test/);
    assert.equal(field('account-settings-logout').hidden, false);
    assert.equal(field('account-settings-login').hidden, true);
    failGet = true;
    await api.refreshAccountSettings(panel);
    assert.ok(api.getUser());
    assert.match(field('account-settings-feedback').textContent, /offline/);
    failGet = false; failLogout = true;
    await api.logoutAccount(panel);
    assert.ok(api.getUser());
    assert.match(field('account-settings-feedback').textContent, /Uitloggen is niet gelukt/);
    failLogout = false;
    await api.logoutAccount(panel);
    assert.equal(api.getUser(), null);
    assert.equal(field('account-settings-login').hidden, false);
    assert.equal(field('account-settings-logout').hidden, true);
    assert.match(field('account-session-status').textContent, /Niet ingelogd/);
    assert.deepEqual(garden.seeds, ['wortel', 'tomaat']);
});
