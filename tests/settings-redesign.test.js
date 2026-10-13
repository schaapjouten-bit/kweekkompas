const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.join(__dirname, '..');
const appSource = fs.readFileSync(path.join(root, 'app-v132.js'), 'utf8');
const indexSource = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const styleSource = fs.readFileSync(path.join(root, 'styles.css'), 'utf8');

test('kompasbranding staat in sidebar, mobiele header en onboarding als inline SVG', () => {
    assert.equal((indexSource.match(/class="compass-logo"/g) || []).length, 4);
    assert.match(indexSource, /class="sidebar-brand-mark"[\s\S]*class="compass-logo"/);
    assert.match(indexSource, /class="shell-mobile-brand-mark"[\s\S]*class="compass-logo"/);
    assert.match(indexSource, /class="onboarding-brand-mark"[\s\S]*class="compass-logo"/);
    assert.match(indexSource, /class="sidebar-brand-copy"[\s\S]*KweekKompas[\s\S]*Jouw tuin, helder gepland/);
    assert.match(styleSource, /--logo-accent/);
    assert.match(styleSource, /\.compass-logo\s*\{/);
});

test('Instellingen gebruikt één pagina met profiel-, weergave-, opslag- en helpsecties', () => {
    const settingsStart = appSource.lastIndexOf('function getSettingsHTML()');
    const settingsEnd = appSource.indexOf('window.setAppTheme = function', settingsStart);
    const settingsSource = appSource.slice(settingsStart, settingsEnd);
    assert.notEqual(settingsStart, -1);
    assert.doesNotMatch(settingsSource, /style\s*=/);
    for (const section of ['profile', 'display', 'storage', 'about', 'faq']) {
        assert.match(settingsSource, new RegExp(`id="settings-section-${section}"`));
    }
    assert.match(settingsSource, /id="profile-modal-name"/);
    assert.match(settingsSource, /id="profile-modal-garden-type"/);
    assert.match(settingsSource, /id="settings-storage-title"/);
    assert.match(settingsSource, /id="settings-page-title"/);
});

test('themakeuzes behouden light, dark en interne playful-waarde', () => {
    assert.match(appSource, /data-theme-choice="light"/);
    assert.match(appSource, /data-theme-choice="dark"/);
    assert.match(appSource, /data-theme-choice="playful"/);
    assert.match(appSource, /window\.setAppTheme\('playful'\)/);
    assert.match(appSource, /<span>Warm<\/span>/);
});

test('Data & opslag toont back-upacties en een afzonderlijke resetactie', () => {
    assert.match(appSource, /Back-up downloaden/);
    assert.match(appSource, /onclick="exportData\(\)"/);
    assert.match(appSource, /onclick="restoreBackup\(\)"/);
    assert.match(appSource, /onclick="importData\(\)"/);
    assert.match(appSource, /class="settings-reset-action"[\s\S]*class="settings-danger-button"/);
    assert.match(appSource, /onclick="resetApp\(\)"/);
    assert.match(appSource, /Wat in het bestand staat vervangt de bijbehorende gegevens; de rest blijft bewaard/);
    assert.match(appSource, /Je bevestigt dit eerst/);
    assert.match(appSource, /Opgeslagen op dit apparaat/);
    assert.match(appSource, /Worden mijn gegevens opgeslagen\?/);
    assert.match(appSource, /button\.setAttribute\('onclick', 'loadExampleGarden\(this\)'\)/);
    assert.match(appSource, /id="example-collections-title"/);
});

test('Instellingen-secties zijn bereikbaar zonder oude afzonderlijke settingsmodals te gebruiken', () => {
    const sectionSource = appSource.slice(appSource.indexOf('window.openSettingsSection'));
    assert.match(sectionSource, /settings-section-\$\{section\}/);
    assert.match(sectionSource, /scrollIntoView/);
    assert.doesNotMatch(sectionSource.slice(0, sectionSource.indexOf('function safeFiniteNumber')), /openSettingsModal\(get(?:Profile|About|DataStorage|FAQ)HTML\(\)\)/);
});
