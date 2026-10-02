const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const root = path.join(__dirname, '..');
const appSource = fs.readFileSync(path.join(root, 'app-v132.js'), 'utf8');
const indexSource = fs.readFileSync(path.join(root, 'index.html'), 'utf8');

function loadThemeHelpers() {
    const start = appSource.indexOf('// --- SHARED APP-SHELL THEME ---');
    const end = appSource.indexOf('// --- SAFE LOCAL STORAGE ---', start);
    const storage = new Map();
    const document = {
        documentElement: {
            dataset: {},
            style: {},
            setAttribute(name, value) {
                if (name === 'data-theme') this.dataset.theme = value;
                else this.dataset[name] = value;
            }
        }
    };
    const context = {
        Set,
        document,
        localStorage: {
            getItem: key => storage.has(key) ? storage.get(key) : null,
            setItem: (key, value) => storage.set(key, String(value))
        }
    };
    vm.runInNewContext(`${appSource.slice(start, end)}\nglobalThis.hooks = { normalizeAppTheme, getStoredAppTheme, applyAppTheme, saveAppTheme };`, context);
    return { ...context.hooks, storage, document };
}

test('bestaande Light- en Dark-voorkeuren migreren zonder nieuwe opslagkey', () => {
    const helpers = loadThemeHelpers();
    helpers.storage.set('theme', 'dark');
    assert.equal(helpers.getStoredAppTheme(), 'dark');
    helpers.storage.set('theme', 'light');
    assert.equal(helpers.getStoredAppTheme(), 'light');
    assert.equal(helpers.normalizeAppTheme('onbekend'), 'light');
});

test('Warm kan worden opgeslagen, toegepast en opnieuw geladen', () => {
    const helpers = loadThemeHelpers();
    assert.equal(helpers.saveAppTheme('playful'), 'playful');
    assert.equal(helpers.storage.get('theme'), 'playful');
    assert.equal(helpers.document.documentElement.dataset.theme, 'playful');
    assert.equal(helpers.getStoredAppTheme(), 'playful');
});

test('onbekende themawaarde valt veilig terug naar Light', () => {
    const helpers = loadThemeHelpers();
    helpers.storage.set('theme', 'future-theme');
    assert.equal(helpers.getStoredAppTheme(), 'light');
    assert.equal(helpers.applyAppTheme('future-theme'), 'light');
    assert.equal(helpers.document.documentElement.dataset.theme, 'light');
});

test('app-shell bevat alle bestaande productiesecties en geen nieuwe pagina', () => {
    for (const view of ['home', 'list', 'sowing-grid', 'calendar', 'wishlist']) {
        assert.match(indexSource, new RegExp(`data-shell-view="${view}"`));
    }
    assert.match(indexSource, /id="shell-settings-button"/);
    assert.doesNotMatch(indexSource, /data-shell-view="(?:reports|lab|account)"/);
});

test('Warm is de zichtbare naam en playful blijft de interne waarde', () => {
    assert.match(appSource, /data-theme-choice="playful"/);
    assert.match(appSource, /<span>Warm<\/span>/);
    assert.doesNotMatch(appSource, /Levendig/);
    assert.doesNotMatch(appSource, /data-theme-choice="playful"[^\n]*>[^<]*Speels/);
    assert.match(appSource, /new Set\(\['light', 'dark', 'playful'\]\)/);
});

test('sidebarnav gebruikt de bestaande view-switcher en mobiele drawer-acties', () => {
    assert.match(appSource, /document\.querySelectorAll\('\.shell-nav-item'\)/);
    assert.match(appSource, /switchView\(view\)/);
    assert.match(appSource, /event\.key === 'Escape'/);
    assert.match(appSource, /shellMobileScrim\?\.addEventListener\('click', closeShellMenu\)/);
});
