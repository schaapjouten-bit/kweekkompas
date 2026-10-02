const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const appSource = fs.readFileSync(path.join(__dirname, '..', 'app-v132.js'), 'utf8');

function sourceBetween(startMarker, endMarker) {
    const start = appSource.indexOf(startMarker);
    const bodyStart = appSource.indexOf('\n', start) + 1;
    const end = appSource.indexOf(endMarker, bodyStart);
    return appSource.slice(bodyStart, end);
}

class FakeElement {
    constructor(tagName) {
        this.tagName = tagName.toUpperCase();
        this.children = [];
        this.attributes = {};
        this.listeners = {};
        this.style = {};
        this.dataset = {};
        this.className = '';
        this._textContent = '';
    }

    appendChild(child) {
        this.children.push(child);
        return child;
    }

    append(...nodes) {
        nodes.forEach(node => {
            if (typeof node === 'string') {
                const textNode = new FakeElement('#text');
                textNode.textContent = node;
                this.appendChild(textNode);
            } else if (node) {
                this.appendChild(node);
            }
        });
    }

    setAttribute(name, value) {
        this.attributes[name] = String(value);
    }

    addEventListener(type, listener) {
        this.listeners[type] = listener;
    }

    closest() {
        return null;
    }

    set textContent(value) {
        this._textContent = String(value);
        this.children = [];
    }

    get textContent() {
        return this._textContent + this.children.map(child => child.textContent).join('');
    }

    get innerHTML() {
        return '';
    }
}

function loadSafeBuilders() {
    const context = {
        URL,
        document: {
            createElement: tagName => new FakeElement(tagName),
            createElementNS: (_namespace, tagName) => new FakeElement(tagName),
            createTextNode: value => {
                const node = new FakeElement('#text');
                node.textContent = value;
                return node;
            }
        }
    };
    const source = sourceBetween('// --- SAFE DYNAMIC CONTENT ---', 'document.addEventListener(\'DOMContentLoaded\'');
    vm.runInNewContext(`${source}\nglobalThis.__hooks = { buildWishlistCard, buildAISuggestionRow, buildReminderRow, buildCalendarReminderPills, groupUpcomingCalendarReminders, filterWishlistItems, safeHttpUrl, safeWishlistImageUrl, safeProfileImageUrl, normalizeExternalImageResult, buildImageSearchCard, setSafeText, safeClassToken, appendHighlightedText };`, context);
    return context.__hooks;
}

function findElements(root, predicate) {
    const found = [];
    const visit = element => {
        if (predicate(element)) found.push(element);
        element.children.forEach(visit);
    };
    visit(root);
    return found;
}

function assertNoInlineHandlers(root) {
    for (const element of findElements(root, () => true)) {
        assert.equal(Object.prototype.hasOwnProperty.call(element.attributes, 'onclick'), false);
        assert.equal(element.innerHTML, '');
    }
}

test('wishlistnaam met HTML blijft tekst zonder inline handler', () => {
    const { buildWishlistCard } = loadSafeBuilders();
    const payload = '<img src=x onerror=alert(1)>';
    const card = buildWishlistCard({ id: 'wish-1', name: payload, type: 'item' });
    const title = findElements(card, element => element.className === 'wish-title')[0];

    assert.equal(title.textContent, payload);
    assertNoInlineHandlers(card);
    assert.equal(findElements(card, element => element.tagName === 'IMG').length, 0);
});

test('normale wishlist wordt als kaart opgebouwd', () => {
    const { buildWishlistCard } = loadSafeBuilders();
    const card = buildWishlistCard({ id: 'wish-1', name: 'Basilicum', type: 'seed' });
    const title = findElements(card, element => element.className === 'wish-title')[0];
    const buttons = findElements(card, element => element.tagName === 'BUTTON');

    assert.equal(title.textContent, 'Basilicum');
    assert.equal(buttons.length, 4);
    assert.equal(buttons[0].attributes['aria-label'], 'Bekijk details van Basilicum');
    assertNoInlineHandlers(card);
});

test('verlanglijst zoekt in bestaande naam, notitie en linkvelden en behoudt typefilters', () => {
    const { filterWishlistItems } = loadSafeBuilders();
    const items = [
        { id: 'wish-1', name: 'Tomaat', type: 'seed', note: 'Voorzaaien in kas', link: '' },
        { id: 'wish-2', name: 'Handschep', type: 'item', note: '', link: 'https://tuinwinkel.example/schep' },
        { id: 'wish-3', name: 'Basilicum', type: 'seed', note: '', link: '' }
    ];
    const ids = values => JSON.parse(JSON.stringify(values.map(item => item.id)));

    assert.deepEqual(ids(filterWishlistItems(items, 'all', 'kas')), ['wish-1']);
    assert.deepEqual(ids(filterWishlistItems(items, 'all', 'tuinwinkel')), ['wish-2']);
    assert.deepEqual(ids(filterWishlistItems(items, 'seed', 'basil')), ['wish-3']);
});

test('AI-label met scriptpayload blijft tekst en actie gebruikt eventlistener', () => {
    const { buildAISuggestionRow } = loadSafeBuilders();
    const payload = '<script>alert(1)</script>';
    let wishlistName = '';
    const row = buildAISuggestionRow({ type: 'recommend', label: payload, plantName: 'Tomaat' }, {
        onWishlist: name => { wishlistName = name; }
    });
    const label = findElements(row, element => element.tagName === 'SPAN')[0];
    const buttons = findElements(row, element => element.tagName === 'BUTTON');

    assert.equal(label.textContent, 'Op verlanglijst: Tomaat');
    assert.equal(findElements(row, element => element.tagName === 'P')[0].textContent, payload);
    assert.equal(buttons.length, 1);
    assertNoInlineHandlers(row);
    buttons[0].listeners.click({ stopPropagation() {} });
    assert.equal(wishlistName, 'Tomaat');
});

test('normale AI-actie werkt en onbekende bestemming wordt genegeerd', () => {
    const { buildAISuggestionRow } = loadSafeBuilders();
    const row = buildAISuggestionRow({ type: 'sow', label: 'Zaai tomaat', plantName: 'Tomaat' });

    assert.equal(findElements(row, element => element.tagName === 'SPAN')[0].textContent, 'Zaaien: Tomaat');
    assert.equal(findElements(row, element => element.tagName === 'BUTTON')[0].textContent, 'Inplannen');
    assert.equal(findElements(row, element => element.tagName === 'BUTTON').length, 1);
    assert.equal(buildAISuggestionRow({ type: 'unsupported', label: 'Voer uit' }), null);
    assert.equal(buildAISuggestionRow({ type: 'care', label: 'Voer uit', destination: 'javascript' }), null);
});

test('AI-voorstellen vereisen een bekend actietype, concreet onderwerp en geldige opgegeven datum', () => {
    const { buildAISuggestionRow } = loadSafeBuilders();
    const rejected = [
        { type: 'sow', label: 'Zaai tomaat' },
        { type: 'sow', label: 'Sow', plantName: 'Onbekend' },
        { type: 'sow', label: 'Elstar is een goed appelras', plantName: 'Elstar' },
        { type: 'care', label: 'Care', plantName: 'Tomaat' },
        { type: 'sow', label: 'Sow', plantName: 'Tomaat', date: '2026-02-30' },
        { type: 'sow', label: 'Sow', plantName: 'Tomaat', date: 0 },
        { type: 'recommend', plantName: 'Elstar', destination: 'todo' },
        { type: 'unknown', plantName: 'Tomaat' }
    ];
    rejected.forEach(action => assert.equal(buildAISuggestionRow(action), null, JSON.stringify(action)));
    for (const action of [
        { type: 'Sow', label: 'Sow', plantName: 'Tomaat' },
        { type: 'care', label: 'Geef de tomaat water', plantName: 'Tomaat' },
        { type: 'log', label: 'Noteer de groei', plantName: 'Tomaat' }
    ]) {
        let planned;
        const row = buildAISuggestionRow(action, { onPlan: value => { planned = value; } });
        const button = findElements(row, element => element.tagName === 'BUTTON')[0];
        assert.equal(button.textContent, 'Inplannen');
        button.listeners.click({ stopPropagation() {} });
        assert.equal(planned.date, '');
        assert.equal(planned.subject, 'Tomaat');
        assert.equal(planned.destination, 'todo');
    }
});

test('plantnaam, beschrijving, ervaring en notitie blijven tekst', () => {
    const { setSafeText } = loadSafeBuilders();
    const payload = '<script>alert(1)</script><img src=x onerror=alert(2)>';
    const title = setSafeText(new FakeElement('h1'), payload);
    const description = setSafeText(new FakeElement('p'), payload);
    const experience = setSafeText(new FakeElement('p'), payload);

    assert.equal(title.textContent, payload);
    assert.equal(description.textContent, payload);
    assert.equal(experience.textContent, payload);
    assert.equal(title.children.length, 0);
    assert.equal(description.children.length, 0);
    assert.equal(experience.children.length, 0);
});

test('actief plantdetailpad gebruikt geen dynamische innerHTML of inline handlers', () => {
    const start = appSource.indexOf('    function openDetailView(seed) {');
    const end = appSource.indexOf('    window.openDetailView = openDetailView;', start);
    const detailSource = appSource.slice(start, end);

    assert.equal(detailSource.includes('innerHTML'), false);
    assert.equal(detailSource.includes('onclick='), false);
});

test('seednaam en zoekmarkering blijven tekst zonder HTML-injectie', () => {
    const { appendHighlightedText } = loadSafeBuilders();
    const heading = new FakeElement('h3');
    const payload = '<img src=x onerror=alert(1)>';

    appendHighlightedText(heading, payload, '<img');

    assert.equal(heading.textContent, payload);
    assert.equal(findElements(heading, element => element.tagName === 'MARK')[0].textContent, '<img');
    assertNoInlineHandlers(heading);
});

test('seed-, planner- en dashboardrenderers interpoleren geen gebruikerswaarden in innerHTML', () => {
    const section = (start, end) => appSource.slice(appSource.indexOf(start), appSource.indexOf(end, appSource.indexOf(start)));
    const seedSource = section('    function renderSeeds(items) {', '    function createSeedCard(seed) {');
    const cardSource = section('    function createSeedCard(seed) {', '    function addToWishlistFromCard');
    const homeSource = section('    function renderHome() {', '    // --- QUICK ACTION HELPERS');
    const plannerSource = section('    async function renderSowingGrid()', '    const plannerSeasonalAdvice');
    const modalSource = section('    function openPlannerMonthModal(mIndex)', '    const closePlannerModal');
    const contextSource = section('function showMonthContextBanner(month, count) {', 'window.revealInList =');

    for (const source of [seedSource, cardSource, homeSource, plannerSource, modalSource, contextSource]) {
        assert.equal(/innerHTML\s*=/.test(source), false);
        assert.equal(source.includes('onclick='), false);
    }
});

test('planner- en dashboardlabels blijven tekstnodes, ook met HTML-payloads', () => {
    const { setSafeText } = loadSafeBuilders();
    const payload = '<img src=x onerror=alert(1)>';
    const plannerLabel = setSafeText(new FakeElement('div'), payload);
    const dashboardMessage = setSafeText(new FakeElement('p'), payload);

    assert.equal(plannerLabel.textContent, payload);
    assert.equal(dashboardMessage.textContent, payload);
    assertNoInlineHandlers(plannerLabel);
    assertNoInlineHandlers(dashboardMessage);
});

test('Zaaiplanner groepeert alleen opgeslagen zaai-, uitplant- en oogstperiodes', () => {
    const start = appSource.indexOf('    function getPlannerActivities(monthIndex, soonDate = null) {');
    const end = appSource.indexOf('    async function renderSowingGrid()', start);
    assert.notEqual(start, -1);
    assert.notEqual(end, -1);

    const monthIndex = 8;
    const monthIndexes = { sep: 8, mrt: 2 };
    const getActiveMonths = value => {
        const raw = value && typeof value === 'object' && !Array.isArray(value)
            ? (value.zaaitijd || value.sowingMonths || value.zaaiTijd || value.sowMonths)
            : value;
        const entries = Array.isArray(raw) ? raw : (typeof raw === 'string' ? [raw] : []);
        return new Set(entries.map(entry => typeof entry === 'string' ? monthIndexes[entry.toLowerCase().slice(0, 3)] : undefined)
            .filter(index => index !== undefined));
    };
    const seeds = [
        { id: 'indoors', naam: 'Peper', zaaitijd: ['september'], tags: ['Voorzaaien'] },
        { id: 'outdoors', naam: 'Wortel', zaaitijd: ['september'], tags: ['Direct zaaien'] },
        { id: 'both', naam: 'Sla', zaaitijd: ['september'], tags: ['Voorzaaien', 'Direct zaaien'] },
        { id: 'general', naam: 'Munt', zaaitijd: ['september'], tags: [] },
        { id: 'plant', naam: 'Tomaat', plant_months: ['september'], tags: [] },
        { id: 'harvest', naam: 'Courgette', oogsttijd: ['september'], tags: [] },
        { id: 'other-month', naam: 'Radijs', zaaitijd: ['maart'], tags: ['Direct zaaien'] }
    ];
    const context = { seeds, getActiveMonths };
    vm.runInNewContext(`${appSource.slice(start, end)}\nglobalThis.groups = getPlannerActivities(${monthIndex}).map(group => [group.id, group.plants.map(seed => seed.naam)]);`, context);

    assert.equal(JSON.stringify(context.groups), JSON.stringify([
        ['indoor-sow', ['Peper', 'Sla']],
        ['outdoor-sow', ['Wortel', 'Sla']],
        ['sow', ['Munt']],
        ['transplant', ['Tomaat']],
        ['harvest', ['Courgette']]
    ]));
});

test('Mijn tuin toont AI-antwoorden als tekst en niet via HTML-interpolatie', () => {
    const aiSource = sourceBetween('    async function stelAIHulpVraag(vraag) {', '    const btnAskAi =');

    assert.match(aiSource, /answerCard\.textContent\s*=\s*String\(data\.answer\)/);
    assert.equal(/(?:innerHTML|outerHTML)\s*=\s*[^;\n]*data\.answer/.test(aiSource), false);
});

test('dashboardtoast gebruikt tekstnodes en een gecontroleerde tuinlink', () => {
    const toastSource = sourceBetween('    function showToastContent(buildContent) {', '    // --- CLEAR INDICATORS ON MANUAL EDIT ---');

    assert.equal(toastSource.includes('innerHTML'), false);
    assert.equal(toastSource.includes('onclick='), false);
    assert.match(toastSource, /showToastWithHomeLink/);
});

test('onveilige URL-protocollen worden geweigerd, geldige afbeeldingen blijven werken', () => {
    const { safeHttpUrl, safeWishlistImageUrl, safeProfileImageUrl } = loadSafeBuilders();

    assert.equal(safeHttpUrl('javascript:alert(1)'), '');
    assert.equal(safeWishlistImageUrl('data:text/html,<script>alert(1)</script>'), '');
    assert.equal(safeWishlistImageUrl('data:image/png;base64,AAAA<script>alert(1)</script>'), '');
    assert.equal(safeHttpUrl('https://example.test/photo.jpg'), 'https://example.test/photo.jpg');
    assert.equal(safeHttpUrl('http://example.test/photo.jpg'), 'http://example.test/photo.jpg');
    assert.equal(safeWishlistImageUrl('data:image/png;base64,AAAA'), 'data:image/png;base64,AAAA');
    assert.equal(safeWishlistImageUrl('assets/starters/tomaat.png'), 'assets/starters/tomaat.png');
    assert.equal(safeProfileImageUrl('javascript:alert(1)'), 'assets/default-avatar.png');
});

test('profielwaarden bereiken instellingen-HTML niet als interpolatie', () => {
    const settingsSource = sourceBetween('function getSettingsHTML() {', 'window.toggleThemeFromPanel =');
    const profileSource = sourceBetween('function getProfileHTML() {', 'window.saveProfileField =');
    const applySource = sourceBetween('function applySettingsPanelValues(panel) {', 'function populateProfileModal');

    assert.equal(settingsSource.includes('${profile'), false);
    assert.equal(settingsSource.includes('${isDark'), false);
    assert.equal(profileSource.includes('${profile'), false);
    assert.match(applySource, /textContent\s*=\s*profile\.name/);
    assert.match(applySource, /safeProfileImageUrl\(profile\.photo\)/);
});

test('HTML-payload in profielnaam blijft tekst', () => {
    const { setSafeText } = loadSafeBuilders();
    const payload = '<img src=x onerror=alert(1)>';
    const name = setSafeText(new FakeElement('p'), payload);

    assert.equal(name.textContent, payload);
    assertNoInlineHandlers(name);
});

test('afbeeldingsresultaten behandelen HTML als tekst en weigeren onveilige bronlinks', () => {
    const { buildImageSearchCard, normalizeExternalImageResult } = loadSafeBuilders();
    const payload = '<img src=x onerror=alert(1)>';
    const invalid = normalizeExternalImageResult({ url: 'javascript:alert(1)', description: payload });
    const card = buildImageSearchCard({
        url: 'https://example.test/photo.jpg',
        title: payload,
        description: payload,
        photographer: payload,
        sourceLink: 'javascript:alert(1)'
    });
    const normalCard = buildImageSearchCard({
        url: 'https://example.test/photo.jpg',
        photographer: 'Tuinmaker',
        sourceLink: 'https://example.test/source'
    });
    const image = findElements(card, element => element.tagName === 'IMG')[0];
    const links = findElements(card, element => element.tagName === 'A');
    const normalLink = findElements(normalCard, element => element.tagName === 'A')[0];

    assert.equal(invalid, null);
    assert.equal(image.src, 'https://example.test/photo.jpg');
    assert.equal(image.alt, payload);
    assert.equal(card.attributes['aria-label'], `${payload} — ${payload} — ${payload}`);
    assert.equal(links.length, 0);
    assert.equal(normalLink.href, 'https://example.test/source');
    assert.equal(normalLink.target, '_blank');
    assert.equal(normalLink.rel, 'noopener noreferrer');
    assertNoInlineHandlers(card);
});

test('ongeldig zoekresultaat blokkeert een geldig resultaat niet en selectie blijft werken', () => {
    const { buildImageSearchCard } = loadSafeBuilders();
    let toggled = 0;
    let featured = 0;
    const invalidCard = buildImageSearchCard({ url: 'data:text/html,<script>alert(1)</script>' });
    const validCard = buildImageSearchCard({ url: 'https://example.test/photo.webp' }, {
        onToggle: () => { toggled += 1; },
        onFeature: () => { featured += 1; }
    });
    const buttons = findElements(validCard, element => element.tagName === 'BUTTON');
    const star = findElements(validCard, element => element.className === 'featured-star')[0];

    assert.equal(invalidCard, null);
    assert.equal(buttons.length, 2);
    star.listeners.click({ stopPropagation() {} });
    buttons[0].listeners.click({ stopPropagation() {} });
    buttons[1].listeners.click({ stopPropagation() {} });
    assert.equal(featured, 2);
    assert.equal(toggled, 1);
});

test('seed-info parser bouwt API-resultaten veilig op', () => {
    const parserSource = sourceBetween('if (foundPlants.length > 0) {', '                    } else {');

    assert.equal(parserSource.includes('innerHTML'), false);
    assert.equal(parserSource.includes('onclick='), false);
    assert.match(parserSource, /label\.textContent\s*=\s*name/);
    assert.match(parserSource, /addEventListener\('click'/);
});

test('AI-seed-info blijft tekst of veldwaarde en wordt niet als HTML gerenderd', () => {
    const infoSource = sourceBetween('    const triggerAutoFill = async (force = false) => {', '    if (btnAutoFill) {');

    assert.equal(/(?:innerHTML|outerHTML)\s*=\s*[^;\n]*(?:data\.|cleanNotes)/.test(infoSource), false);
    assert.match(infoSource, /descEl\.value\s*=\s*cleanNotes\.trim\(\)/);
    assert.match(infoSource, /banner\.querySelector\('span'\)\.textContent/);
});

test('generieke AI-actiefeedback herstelt knoptekst zonder HTML-sink', () => {
    const feedbackSource = sourceBetween('window._tempSuggestionFeedback = (btn) => {', '// 8.1c: Add Suggestion to Seeds');

    assert.equal(feedbackSource.includes('innerHTML'), false);
    assert.match(feedbackSource, /btn\.textContent\s*=\s*'✔'/);
});

test('reminderregels en kalenderpillen gebruiken tekstnodes voor titels', () => {
    const { buildReminderRow, buildCalendarReminderPills } = loadSafeBuilders();
    const payload = '<img src=x onerror=alert(1)>';
    const row = buildReminderRow({ id: 7, title: payload, done: true });
    const title = findElements(row, element => element.tagName === 'SPAN')[0];
    const pills = buildCalendarReminderPills([{ title: payload }, { title: 'Water geven' }, { title: 'Extra' }]);

    assert.equal(title.textContent, payload);
    assert.equal(row.className, 'reminder-row done');
    assert.equal(findElements(pills, element => element.className === 'cal-reminder-pill')[0].textContent, '<img');
    assert.equal(findElements(pills, element => element.className === 'cal-pill-more')[0].textContent, '+1');
    assertNoInlineHandlers(row);
    assertNoInlineHandlers(pills);
});

test('kalender groepeert open herinneringen als vandaag, binnenkort en later', () => {
    const { groupUpcomingCalendarReminders } = loadSafeBuilders();
    const groups = groupUpcomingCalendarReminders([
        { id: 1, date: '2026-09-25', title: 'Vandaag' },
        { id: 2, date: '2026-09-26', title: 'Morgen' },
        { id: 3, date: '2026-10-02', title: 'Over zeven dagen' },
        { id: 4, date: '2026-10-03', title: 'Later' },
        { id: 5, date: '2026-09-25', title: 'Afgerond', done: true },
        { id: 6, date: '2026-09-24', title: 'Voorbij' },
        { id: 7, date: 'ongeldige datum', title: 'Ongeldig' }
    ], '2026-09-25');

    assert.deepEqual(JSON.parse(JSON.stringify(groups.map(group => ({
        label: group.label,
        ids: group.items.map(item => item.id)
    })))), [
        { label: 'Vandaag', ids: [1] },
        { label: 'Binnenkort', ids: [2, 3] },
        { label: 'Later', ids: [4] }
    ]);
});
