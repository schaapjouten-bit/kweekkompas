const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.join(__dirname, '..');
const appSource = fs.readFileSync(path.join(root, 'app-v132.js'), 'utf8');
const indexSource = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const styleSource = fs.readFileSync(path.join(root, 'styles.css'), 'utf8');

function sourceBetween(startMarker, endMarker) {
    const start = appSource.indexOf(startMarker);
    const end = appSource.indexOf(endMarker, start);
    assert.notEqual(start, -1, `startmarker ontbreekt: ${startMarker}`);
    assert.notEqual(end, -1, `eindmarker ontbreekt: ${endMarker}`);
    return appSource.slice(start, end);
}

test('Mijn zaden heeft header, samenvatting, zoekveld, filters en toevoegactie', () => {
    assert.match(indexSource, /<h2>Mijn zaden<\/h2>/);
    assert.match(indexSource, /id="btn-add-zaden-top"[^>]*>Zaad toevoegen<\/button>/);
    assert.match(indexSource, /id="seed-summary-total"/);
    assert.match(indexSource, /id="seed-summary-favorites"/);
    assert.match(indexSource, /id="seed-summary-season"/);
    assert.match(indexSource, /id="search-input"[^>]*placeholder="Zoek op plantnaam/);
    assert.match(indexSource, /id="category-filters"/);
});

test('seedkaarten behouden veilige afbeelding, tekst, favoriet en detailactie', () => {
    const cardSource = sourceBetween('    function createSeedCard(seed) {', '    function addToWishlistFromCard');
    assert.equal(cardSource.includes('innerHTML'), false);
    assert.match(cardSource, /safeWishlistImageUrl\(/);
    assert.match(cardSource, /createElement\('img'\)/);
    assert.match(cardSource, /setAttribute\('alt', `Foto van/);
    assert.match(cardSource, /appendPlaceholder/);
    assert.match(cardSource, /setAttribute\('aria-pressed'/);
    assert.match(cardSource, /window\._toggleFavContent/);
    assert.match(cardSource, /textContent = 'Bekijk details'/);
    assert.match(cardSource, /event\.key === 'Enter' \|\| event\.key === ' '/);
});

test('zoeken, filters en favorieten blijven aan de bestaande koppelingen hangen', () => {
    assert.match(appSource, /searchInput\.oninput = applyFilters/);
    assert.match(appSource, /chip\.addEventListener\('click'/);
    assert.match(appSource, /document\.querySelectorAll\('\.filter-chip'\)/);
    assert.match(appSource, /window\._toggleFavContent = async/);
});

test('lege seedlijst behoudt een werkende toevoegactie', () => {
    const renderSource = sourceBetween('    function renderSeeds(items) {', '    function createSeedCard(seed) {');
    assert.match(renderSource, /empty-state-btn/);
    assert.match(renderSource, /window\.openAddForm\(\)/);
});

test('seed-redesign heeft drie responsieve kolommodi en thematische kaarttokens', () => {
    assert.match(styleSource, /\.seed-grid\s*\{[\s\S]*grid-template-columns: repeat\(auto-fit/);
    assert.match(styleSource, /@media \(max-width: 900px\)[\s\S]*\.seed-grid[\s\S]*repeat\(2/);
    assert.match(styleSource, /@media \(max-width: 620px\)[\s\S]*\.seed-grid[\s\S]*grid-template-columns: 1fr/);
    assert.match(styleSource, /\[data-theme="playful"\] \.seed-card/);
    assert.match(styleSource, /\[data-theme="dark"\] \.seed-card/);
});

test('desktop-shell verbergt de dubbele branding en gebruikt de resterende werkruimte', () => {
    const correctionSource = styleSource.slice(styleSource.indexOf('/* Fase 7B correctie:'));
    assert.match(correctionSource, /\.header\s*\{\s*display: none !important/);
    assert.match(correctionSource, /#main-content\s*\{[\s\S]*width: calc\(100% - 248px\)/);
    assert.match(correctionSource, /\.seed-add-button\s*\{[\s\S]*width: auto !important/);
    assert.match(indexSource, /class="shell-mobile-header"/);
});
