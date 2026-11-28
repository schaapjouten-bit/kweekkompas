const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.join(__dirname, '..');
const starterJsonPath = path.join(root, 'assets', 'starters', 'starter-seeds.json');
const appSource = fs.readFileSync(path.join(root, 'app-v132.js'), 'utf8');

test('starter-seeds.json bevat exact de 5 gevraagde voorbeeldkaarten met geldige lokale foto-assets', () => {
    const cards = JSON.parse(fs.readFileSync(starterJsonPath, 'utf8'));
    assert.equal(cards.length, 5);
    assert.deepEqual(cards.map(c => c.naam), [
        'Komkommer Marketmore',
        'Snijbiet Orange Glory',
        'Japanse zelkova (Zelkova serrata)',
        'Peterselie Moskrul',
        'Goudsbloem Geisha Girl'
    ]);

    for (const card of cards) {
        assert.equal(card.id, undefined, 'Starter-sjablonen mogen geen vaste id hebben');
        assert.ok(typeof card.beschrijving === 'string' && card.beschrijving.length > 0);
        assert.ok(typeof card.voeding === 'string' && card.voeding.length > 0);
        assert.equal(typeof card.ervaringen, 'string');

        const urls = [];
        if (card.featuredImageUrl) urls.push(card.featuredImageUrl);
        if (card.image) urls.push(card.image);
        for (const img of card.images || []) {
            const u = typeof img === 'string' ? img : img?.url;
            if (u) urls.push(u);
        }
        assert.ok(urls.length > 0, `${card.naam} heeft minstens één afbeelding`);

        for (const u of urls) {
            assert.doesNotMatch(u, /^data:/i, `${card.naam} mag geen inline data-URL bevatten`);
            if (u.startsWith('assets/starters/examples/')) {
                const filePath = path.join(root, u);
                assert.ok(fs.existsSync(filePath), `Bestand ontbreekt: ${u}`);
                assert.ok(fs.statSync(filePath).size > 0, `Bestand is leeg: ${u}`);
            } else {
                assert.match(u, /^https:\/\//i);
            }
        }
    }
});

test('finishOnboarding laadt de nieuwe voorbeeldcollectie alleen bij een lege tuin en kent verse IDs toe', () => {
    const start = appSource.indexOf('async function finishOnboarding()');
    const end = appSource.indexOf('function renderOnboardingChoices()', start);
    const fn = appSource.slice(start, end);

    assert.doesNotMatch(fn, /Cherry Tomaat|Courgette 'Black Beauty'|Pluksla 'Gemengd'|Basilicum 'Genovese'/);
    assert.match(fn, /assets\/starters\/starter-seeds\.json/);
    assert.match(fn, /if \(existingSeeds\.length === 0\)/);
    assert.match(fn, /saveSeed\(\{ \.\.\.starters\[i\], id: String\(baseId \+ i \+ 1\) \}\)/);
});
