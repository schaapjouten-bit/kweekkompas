(() => {
  'use strict';

  const root = document.getElementById('preview-root');
  const screenSelect = document.getElementById('screen-select');
  const themeSelect = document.getElementById('theme-select');
  const previewMark = document.querySelector('[data-icon="sprout"]');

  const icons = {
    sprout: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 21V10"/><path d="M12 14c-4.5 0-7-2.4-7-6.5C9.3 7.5 12 9.5 12 14Z"/><path d="M12 11c0-4.2 2.6-6.5 7-6.5 0 4.1-2.5 6.5-7 6.5Z"/></svg>',
    sun: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><circle cx="12" cy="12" r="3.5"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></svg>',
    moon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M20 15.3A8.3 8.3 0 0 1 8.7 4a8.5 8.5 0 1 0 11.3 11.3Z"/></svg>',
    search: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><circle cx="10.8" cy="10.8" r="6.3"/><path d="m16 16 5 5"/></svg>',
    plus: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M12 5v14M5 12h14"/></svg>',
    heart: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M20.8 8.8c0 5.4-8.8 10-8.8 10s-8.8-4.6-8.8-10A4.7 4.7 0 0 1 12 6.1a4.7 4.7 0 0 1 8.8 2.7Z"/></svg>',
    heartFilled: '<svg viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"><path d="M20.8 8.8c0 5.4-8.8 10-8.8 10s-8.8-4.6-8.8-10A4.7 4.7 0 0 1 12 6.1a4.7 4.7 0 0 1 8.8 2.7Z"/></svg>',
    leaf: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M19.5 4.5C10 4.7 5.3 8.2 5.3 13.5c0 3.2 2.3 5.2 5.4 5.2 5.2 0 8.8-4.7 8.8-14.2Z"/><path d="M4 21c2.6-5.1 6.4-8.4 11.4-11.2"/></svg>',
    calendar: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3.5" y="5" width="17" height="16" rx="2"/><path d="M7.5 3v4M16.5 3v4M3.5 10h17"/></svg>',
    grid: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="4" width="6" height="6" rx="1"/><rect x="14" y="4" width="6" height="6" rx="1"/><rect x="4" y="14" width="6" height="6" rx="1"/><rect x="14" y="14" width="6" height="6" rx="1"/></svg>',
    bookmark: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M6 4.5A2.5 2.5 0 0 1 8.5 2h7A2.5 2.5 0 0 1 18 4.5V21l-6-3.7L6 21V4.5Z"/></svg>',
    settings: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3v2M12 19v2M3 12h2M19 12h2M5.6 5.6 7 7M17 17l1.4 1.4M18.4 5.6 17 7M7 17l-1.4 1.4"/><circle cx="12" cy="12" r="4"/></svg>',
    user: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="8" r="3.5"/><path d="M5 20c.8-3.4 3.1-5 7-5s6.2 1.6 7 5"/></svg>',
    box: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="m4 8 8-4 8 4-8 4-8-4Z"/><path d="M4 8v8l8 4 8-4V8M12 12v8"/></svg>',
    arrowRight: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14M13 6l6 6-6 6"/></svg>',
    arrowLeft: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M19 12H5M11 18l-6-6 6-6"/></svg>',
    check: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="m5 12 4.2 4.2L19 6.8"/></svg>',
    cloud: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M7 18.5h10.5a3.5 3.5 0 0 0 .4-7A5.8 5.8 0 0 0 6.8 9.2 4.7 4.7 0 0 0 7 18.5Z"/><path d="M9 21h6"/></svg>',
    ground: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 17c2.5-3 5.1-3 8 0 2.4 2.5 5.2 2.5 8 0"/><path d="M5 21c2.4-2.5 5-2.5 7.5 0 2.3 2.3 5.1 2.3 6.5 0"/><path d="M12 15V5M12 8c-2.8 0-4.5-1.5-4.5-4.2C10.4 3.8 12 5.2 12 8ZM12 9c0-2.8 1.8-4.3 4.7-4.3 0 2.7-1.7 4.3-4.7 4.3Z"/></svg>',
    pot: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M6 9h12l-1.2 10H7.2L6 9Z"/><path d="M4 9h16M9 6c.4-2 1.5-3 3-3s2.6 1 3 3M12 9V4"/></svg>',
    balcony: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M5 20V7h14v13M3 20h18M5 11h14M8 7V4h8v3M8 15h8M8 20v-5M12 20v-5M16 20v-5"/></svg>',
    lock: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="5" y="10" width="14" height="11" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/></svg>',
    info: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><circle cx="12" cy="12" r="9"/><path d="M12 10v6M12 7.2h.01"/></svg>'
  };

  const plants = [
    { id: 'tomaat', name: "Tomaat 'Sweet Million'", category: 'Groente', image: '../../assets/starters/tomaat.png', sow: 'Februari – april', harvest: 'Juli – september', stock: 'Op voorraad', favorite: true },
    { id: 'courgette', name: "Courgette 'Black Beauty'", category: 'Groente', image: '../../assets/starters/courgette.png', sow: 'April – mei', harvest: 'Juli – september', stock: 'Op voorraad', favorite: false },
    { id: 'basilicum', name: "Basilicum 'Genovese'", category: 'Kruid', image: '../../assets/starters/basilicum.png', sow: 'Maart – juni', harvest: 'Juli – oktober', stock: 'Op voorraad', favorite: true },
    { id: 'radijs', name: "Radijs 'Cherry Belle'", category: 'Groente', image: '../../assets/starters/radijs.png', sow: 'Maart – augustus', harvest: 'April – september', stock: 'Op voorraad', favorite: false },
    { id: 'sla', name: "Pluksla 'Gemengd'", category: 'Groente', image: '../../assets/starters/sla.png', sow: 'Maart – augustus', harvest: 'Mei – oktober', stock: 'Op voorraad', favorite: false },
    { id: 'snijbiet', name: 'Regenboogsnijbiet', category: 'Groente', image: '../../assets/starters/snijbiet.png', sow: 'April – juli', harvest: 'Juni – november', stock: 'Op voorraad', favorite: true }
  ];

  const state = {
    screen: 'seeds',
    theme: 'light',
    query: '',
    filter: 'Alle',
    favorites: new Set(plants.filter(plant => plant.favorite).map(plant => plant.id)),
    // Preview-only shape for the future multi-place profile model.
    gardenPlaces: [],
    primaryGardenPlace: '',
    choices: { light: '', experience: '' },
    notice: ''
  };

  function icon(name, className = 'icon') {
    return `<span class="${className}" aria-hidden="true">${icons[name] || icons.info}</span>`;
  }

  function escapeHtml(value) {
    return String(value)
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;')
      .replaceAll("'", '&#039;');
  }

  function setTheme(theme) {
    const themes = ['light', 'dark', 'playful'];
    state.theme = themes.includes(theme) ? theme : 'light';
    document.documentElement.dataset.theme = state.theme;
    themeSelect.value = state.theme;
  }

  function setScreen(screen) {
    state.screen = screen;
    state.notice = '';
    screenSelect.value = screen;
    render();
    root.focus({ preventScroll: true });
  }

  function navMarkup(active) {
    const links = [
      ['seeds', 'grid', 'Mijn zaden'],
      ['storage', 'lock', 'Onboarding'],
      ['garden', 'ground', 'Jouw tuin']
    ];
    return `<nav class="screen-nav" aria-label="Voorbeeldnavigatie">
      <div class="brand-lockup">
        <div class="brand-mark">${icons.sprout}</div>
        <div><h2>KweekKompas</h2><p>Rust voor je tuinwerk</p></div>
      </div>
      <div class="screen-nav-list">
        ${links.map(([screen, symbol, label]) => `<button class="screen-nav-link ${active === screen ? 'active' : ''}" type="button" data-screen="${screen}">${icon(symbol)}<span>${label}</span></button>`).join('')}
      </div>
      <div class="screen-nav-utility">${icon('user', 'avatar-dot')} <span>Voorbeeldprofiel</span></div>
    </nav>`;
  }

  function progressMarkup(active) {
    const steps = [['storage', 'Opslag'], ['garden', 'Jouw tuin'], ['seeds', 'Beginnen']];
    const activeIndex = steps.findIndex(([screen]) => screen === active);
    return `<div class="progress-steps" aria-label="Onboardingvoortgang">
      ${steps.map(([screen, label], index) => `<div class="progress-step ${index === activeIndex ? 'active' : ''} ${index < activeIndex ? 'complete' : ''}">
        <span class="progress-dot">${index < activeIndex ? icons.check : index + 1}</span><span>${label}</span>
      </div>`).join('')}
    </div>`;
  }

  function renderSeeds() {
    const query = state.query.trim().toLowerCase();
    const filtered = plants.filter(plant => {
      const matchesQuery = !query || `${plant.name} ${plant.category}`.toLowerCase().includes(query);
      const matchesFilter = state.filter === 'Alle' || plant.category === state.filter || (state.filter === 'Favorieten' && state.favorites.has(plant.id));
      return matchesQuery && matchesFilter;
    });

    return `<section class="app-frame app-frame-inner" aria-labelledby="seeds-title">
      ${navMarkup('seeds')}
      <div class="page-header">
        <div><h2 id="seeds-title">Mijn zaden</h2><p>Een rustig overzicht van wat je hebt, zaait en straks oogst.</p></div>
        <div class="heading-actions"><button class="primary-button" type="button" data-action="add-seed">${icon('plus')}<span>Zaden toevoegen</span></button></div>
      </div>
      <div class="search-controls">
        <label class="search-wrap"><span class="icon">${icons.search}</span><span class="sr-only">Zoek in zaden</span><input class="search-input" id="seed-search" type="search" placeholder="Zoek op plant of categorie" value="${escapeHtml(state.query)}"></label>
        <button class="secondary-button" type="button" data-action="sort">${icon('settings')}<span>Sorteren</span></button>
      </div>
      <div class="filter-row" aria-label="Zadenfilters">
        ${['Alle', 'Groente', 'Kruid', 'Favorieten'].map(filter => `<button class="filter-chip ${state.filter === filter ? 'active' : ''}" type="button" aria-pressed="${state.filter === filter}" data-filter="${filter}">${filter}</button>`).join('')}
      </div>
      <div class="collection-summary" aria-label="Collectiesamenvatting">
        <div class="summary-card"><strong>34</strong><span>Zaden in je tuin</span></div>
        <div class="summary-card"><strong>12</strong><span>Deze maand relevant</span></div>
        <div class="summary-card"><strong>${state.favorites.size}</strong><span>Favorieten</span></div>
      </div>
      <div class="seed-grid" aria-live="polite">
        ${filtered.length ? filtered.map(seedCardMarkup).join('') : '<p class="empty-note">Geen zaden gevonden. Pas je zoekterm of filter aan.</p>'}
      </div>
      ${state.notice ? `<p class="selection-summary" role="status">${state.notice}</p>` : ''}
    </section>`;
  }

  function seedCardMarkup(plant) {
    const isFavorite = state.favorites.has(plant.id);
    return `<article class="seed-card">
      <div class="seed-card-image">
        <img src="${plant.image}" alt="Voorbeeldfoto van ${plant.name}" loading="lazy">
        <span class="category-tag">${plant.category}</span>
        <button class="favorite-button ${isFavorite ? 'active' : ''}" type="button" aria-label="${isFavorite ? 'Verwijder uit favorieten' : 'Voeg toe aan favorieten'}" aria-pressed="${isFavorite}" data-favorite="${plant.id}">${isFavorite ? icons.heartFilled : icons.heart}</button>
      </div>
      <div class="seed-card-body">
        <div class="card-topline"><h3>${plant.name}</h3><span class="stock-label">${icon('check')}${plant.stock}</span></div>
        <dl>
          <div><span class="inline-icon">${icons.leaf}</span><dt>Zaaitijd</dt><dd>${plant.sow}</dd></div>
          <div><span class="inline-icon">${icons.calendar}</span><dt>Oogsttijd</dt><dd>${plant.harvest}</dd></div>
        </dl>
        <div class="card-footer"><span>Voorbeeldrecord</span><button class="details-link" type="button" data-details="${plant.id}">Bekijk details ${icon('arrowRight')}</button></div>
      </div>
    </article>`;
  }

  function renderStorage() {
    return `<section class="app-frame onboarding-frame" aria-labelledby="storage-title">
      <div class="onboarding-card">
        ${progressMarkup('storage')}
        <div class="onboarding-intro">
          <div class="onboarding-icon">${icons.lock}</div>
          <div><h2 id="storage-title">Jouw tuin blijft hier</h2><p>Begin met een rustige, lokale basis. Je hoeft geen account aan te maken.</p></div>
        </div>
        <div class="storage-copy">
          <p><strong>Gegevens worden lokaal in deze browser bewaard.</strong> Je zaden, keuzes en notities blijven op dit apparaat.</p>
          <p>Er is geen automatische synchronisatie tussen apparaten. Download af en toe een back-up als je je gegevens ook elders wilt bewaren.</p>
        </div>
        <div class="storage-callout">${icons.info}<span>Deze ontwerpconceptweergave gebruikt geen localStorage, IndexedDB of netwerkverbinding.</span></div>
        <div class="storage-actions">
          <button class="primary-button" type="button" data-action="continue-storage">Verder met lokale opslag ${icon('arrowRight')}</button>
          <button class="secondary-button" type="button" data-action="restore-backup">${icon('bookmark')}<span>Back-up herstellen</span></button>
        </div>
        ${state.notice ? `<p class="selection-summary" role="status">${state.notice}</p>` : ''}
        <div class="onboarding-footer"><button class="text-button" type="button" data-screen="seeds">Preview sluiten</button><span class="status-pair">${icon('lock')} Alleen dit concept</span></div>
      </div>
    </section>`;
  }

  function choiceMarkup(group, value, symbol, title, description) {
    const isMultiChoice = group === 'garden';
    const selected = isMultiChoice ? state.gardenPlaces.includes(value) : state.choices[group] === value;
    const isPrimary = isMultiChoice && state.primaryGardenPlace === value;
    const role = isMultiChoice ? 'checkbox' : 'radio';
    const primaryControl = isMultiChoice && selected
      ? (isPrimary
        ? '<span class="primary-badge">Hoofdplek</span>'
        : `<button class="make-primary" type="button" data-primary-place="${escapeHtml(value)}">Maak hoofdplek</button>`)
      : '';
    return `<div class="choice-card ${selected ? 'selected' : ''} ${isMultiChoice ? 'multi-choice' : 'single-choice'}">
      <button class="choice-select" type="button" role="${role}" aria-checked="${selected}" data-choice-group="${group}" data-choice-value="${escapeHtml(value)}">
        <span class="choice-check">${icons.check}</span>${icon(symbol, `icon choice-symbol symbol-${symbol}`)}<strong>${title}</strong><small>${description}</small>
      </button>
      ${primaryControl}
    </div>`;
  }

  function renderGarden() {
    const selected = state.gardenPlaces.length + [state.choices.light, state.choices.experience].filter(Boolean).length;
    const placeLabels = { Moestuin: 'Volle grond', Potten: 'Bakken of potten', Balkon: 'Balkon of terras' };
    const primaryLabel = placeLabels[state.primaryGardenPlace];
    return `<section class="app-frame onboarding-frame" aria-labelledby="garden-title">
      <div class="onboarding-card">
        ${progressMarkup('garden')}
        <div class="onboarding-intro">
          <div class="onboarding-icon">${icons.ground}</div>
          <div><h2 id="garden-title">Jouw tuin, jouw ritme</h2><p>Kies wat nu klopt. Je kunt deze gegevens later altijd aanpassen.</p></div>
        </div>
        <div class="choice-section"><h3 id="garden-place-label">Waar kweek je vooral?</h3><p>Je kunt meerdere tuinplekken selecteren. De eerste wordt automatisch je hoofdplek.</p><div class="choice-grid" role="group" aria-labelledby="garden-place-label">
          ${choiceMarkup('garden', 'Moestuin', 'ground', 'Volle grond', 'Bedden of borders')}
          ${choiceMarkup('garden', 'Potten', 'pot', 'Bakken of potten', 'Flexibel en compact')}
          ${choiceMarkup('garden', 'Balkon', 'balcony', 'Balkon of terras', 'Kweken op hoogte')}
        </div></div>
        <div class="choice-section"><h3 id="light-label">Hoeveel zon krijgt je hoofdplek?</h3><p>Een eerste inschatting is genoeg.</p><div class="choice-grid" role="radiogroup" aria-labelledby="light-label">
          ${choiceMarkup('light', 'Zon', 'sun', 'Volle zon', 'Meer dan zes uur licht')}
          ${choiceMarkup('light', 'Halfschaduw', 'leaf', 'Halfschaduw', 'Licht met rustmomenten')}
          ${choiceMarkup('light', 'Schaduw', 'grid', 'Schaduw', 'Weinig direct licht')}
        </div></div>
        <div class="choice-section"><h3 id="experience-label">Ervaring</h3><p>Dit helpt om suggesties passend te maken.</p><div class="choice-grid" role="radiogroup" aria-labelledby="experience-label">
          ${choiceMarkup('experience', 'Beginner', 'sprout', 'Beginner', 'Ik begin rustig')}
          ${choiceMarkup('experience', 'Gemiddeld', 'leaf', 'Gemiddeld', 'Ik heb al geoogst')}
          ${choiceMarkup('experience', 'Ervaren', 'bookmark', 'Ervaren', 'Ik ken mijn weg')}
        </div></div>
        <div class="selection-summary" aria-live="polite">${primaryLabel ? `Hoofdplek: ${primaryLabel} · ${selected} keuzes geselecteerd` : (selected ? `${selected} keuzes geselecteerd` : 'Kies wat je al weet; de rest kan later.')}</div>
        <div class="onboarding-footer"><button class="text-button" type="button" data-screen="storage">${icon('arrowLeft')} Terug</button><div class="right-actions"><button class="ghost-button" type="button" data-action="later">Later invullen</button><button class="primary-button" type="button" data-action="finish-garden">Verder ${icon('arrowRight')}</button></div></div>
      </div>
    </section>`;
  }

  function render() {
    if (state.screen === 'storage') root.innerHTML = renderStorage();
    else if (state.screen === 'garden') root.innerHTML = renderGarden();
    else root.innerHTML = renderSeeds();
    hydrateIcons();
    bindEvents();
  }

  function hydrateIcons() {
    if (previewMark) previewMark.innerHTML = icons.sprout;
  }

  function showNotice(message) {
    state.notice = message;
    render();
  }

  function bindEvents() {
    root.querySelectorAll('[data-screen]').forEach(button => {
      button.addEventListener('click', () => setScreen(button.dataset.screen));
    });

    root.querySelectorAll('[data-filter]').forEach(button => {
      button.addEventListener('click', () => {
        state.filter = button.dataset.filter;
        render();
      });
    });

    const search = root.querySelector('#seed-search');
    if (search) {
      search.addEventListener('input', event => {
        state.query = event.target.value;
        render();
        const nextSearch = root.querySelector('#seed-search');
        nextSearch.focus();
        nextSearch.setSelectionRange(state.query.length, state.query.length);
      });
    }

    root.querySelectorAll('[data-favorite]').forEach(button => {
      button.addEventListener('click', () => {
        const id = button.dataset.favorite;
        if (state.favorites.has(id)) state.favorites.delete(id);
        else state.favorites.add(id);
        render();
      });
    });

    root.querySelectorAll('[data-details]').forEach(button => {
      button.addEventListener('click', () => showNotice('Detailweergave is in dit ontwerp een volgende stap.'));
    });

    const addButton = root.querySelector('[data-action="add-seed"]');
    if (addButton) addButton.addEventListener('click', () => showNotice('Hier komt de invoer voor een nieuw zaad.'));

    const sortButton = root.querySelector('[data-action="sort"]');
    if (sortButton) sortButton.addEventListener('click', () => showNotice('Sorteren op naam, zaaitijd of favoriet.'));

    const continueButton = root.querySelector('[data-action="continue-storage"]');
    if (continueButton) continueButton.addEventListener('click', () => setScreen('garden'));

    const restoreButton = root.querySelector('[data-action="restore-backup"]');
    if (restoreButton) restoreButton.addEventListener('click', () => showNotice('In de werkende app opent dit de back-upkiezer.'));

    root.querySelectorAll('[data-choice-group]').forEach(button => {
      button.addEventListener('click', () => {
        const group = button.dataset.choiceGroup;
        const value = button.dataset.choiceValue;
        if (group === 'garden') {
          if (state.gardenPlaces.includes(value)) {
            state.gardenPlaces = state.gardenPlaces.filter(place => place !== value);
            if (state.primaryGardenPlace === value) state.primaryGardenPlace = state.gardenPlaces[0] || '';
          } else {
            state.gardenPlaces = [...state.gardenPlaces, value];
            if (!state.primaryGardenPlace) state.primaryGardenPlace = value;
          }
        } else {
          state.choices[group] = value;
        }
        render();
      });
    });

    root.querySelectorAll('[data-primary-place]').forEach(button => {
      button.addEventListener('click', () => {
        state.primaryGardenPlace = button.dataset.primaryPlace;
        render();
      });
    });

    const laterButton = root.querySelector('[data-action="later"]');
    if (laterButton) laterButton.addEventListener('click', () => {
      setScreen('seeds');
      state.notice = 'Je kunt dit later invullen vanuit je profiel.';
      render();
    });

    const finishButton = root.querySelector('[data-action="finish-garden"]');
    if (finishButton) finishButton.addEventListener('click', () => {
      setScreen('seeds');
      state.notice = 'Voorbeeldkeuzes klaar — zo zou Mijn zaden daarna openen.';
      render();
    });
  }

  screenSelect.addEventListener('change', () => setScreen(screenSelect.value));
  themeSelect.addEventListener('change', () => setTheme(themeSelect.value));

  setTheme('light');
  render();
})();
