/* Optional services. Local data stays under the existing app's storage/backup logic. */
(() => {
    const PREFS_KEY = 'kweekkompas_ai';
    const OWNER_KEY = 'kweekkompas_local_owner';
    const providers = ['gemini', 'ollama', 'openai-compatible'];
    let config = null;
    let user = null;
    let cloud = null;
    let busy = false;
    let prefs = {};
    let configPromise = null;
    let geminiCatalog = null;
    let geminiModelsPromise = null;
    // Official Google model IDs, checked 2026-10-02. These are suggestions,
    // not a statement that the configured key can use them.
    // https://ai.google.dev/gemini-api/docs/pricing#gemini-3.5-flash-lite
    // Standard paid tier: $0.30 input / $2.50 output per 1M tokens.
    const geminiFallbackModels = [
        { id: 'gemini-3.5-flash-lite', label: 'Gemini 3.5 Flash-Lite', hint: 'snel en zuinig' },
        { id: 'gemini-3.8-flash', label: 'Gemini 3.8 Flash', hint: 'tekstmodel' }
    ];
    function readPreferences() {
      try {
        const saved = JSON.parse(localStorage.getItem(PREFS_KEY) || '{}');
        prefs = providers.includes(saved.provider) && typeof saved.model === 'string' ? { provider: saved.provider, model: saved.model } : {};
      } catch { prefs = {}; }
      return { ...prefs };
    }
    readPreferences();
    async function updateDashboardProvider() {
        readPreferences();
        const button = document.getElementById('home-ai-provider');
        if (!button) return;
        button.onclick = () => {
            window.toggleSettingsPanel_REPAIR_V131();
            requestAnimationFrame(() => {
                const section = document.getElementById('settings-section-ai');
                section?.scrollIntoView({ block: 'start' }); section?.focus({ preventScroll: true });
            });
        };
        const display = () => {
            const provider = prefs.provider || config?.defaultProvider;
            const labels = { gemini: 'Gemini', ollama: 'Ollama', 'openai-compatible': 'Eigen API' };
            button.textContent = `${labels[provider] || 'AI-instellingen'} ⌄`;
            button.setAttribute('aria-label', `Open AI-instellingen${provider ? ': ' + (config?.providers?.[provider]?.label || labels[provider]) : ''}`);
            const model = prefs.model || config?.providers?.[provider]?.model;
            button.title = model ? `Model: ${model}` : 'Provider en model instellen';
        };
        display();
        if (!config) {
            configPromise ||= request('ai-config').then(value => { config = value; }).catch(() => {});
            await configPromise; display();
        }
    }
    async function request(route, body) {
        const response = await fetch(`/api/${route}`, { method: body === undefined ? 'GET' : 'POST',
            credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
        const data = await response.json().catch(() => ({ error: 'Start KweekKompas met npm start zodat de backend beschikbaar is.' }));
        if (!response.ok) throw new Error(data.error || `Aanvraag mislukt (${response.status}).`);
        return data;
    }
    const settingsHTML = () => `
        <section class="settings-page-section" id="settings-section-ai" aria-labelledby="settings-ai-title" tabindex="-1">
            <div class="settings-section-heading"><div><p class="settings-section-eyebrow">AI</p><h3 id="settings-ai-title">Provider en model</h3><p>Deze keuze geldt voor de tuinassistent en de zadenhulp. Vragen en meegestuurde tuingegevens worden door de gekozen provider verwerkt.</p></div></div>
            <form id="ai-settings-form" class="service-form">
                <div class="settings-form-grid">
                    <label class="settings-field"><span>Provider</span><select id="ai-provider"><option value="gemini">Gemini</option><option value="ollama">Ollama</option><option value="openai-compatible">Eigen OpenAI-compatibele API</option></select></label>
                    <label class="settings-field"><span>Model</span><select id="ai-gemini-model" aria-describedby="ai-provider-status" required></select><input id="ai-model" list="ai-model-options" maxlength="160" placeholder="Modelnaam" hidden disabled><datalist id="ai-model-options"></datalist></label>
                </div>
                <p id="ai-provider-status" class="service-status" role="status">Backendconfiguratie laden…</p>
                <p class="service-note">Sleutels en API-adressen worden uitsluitend in de backend ingesteld. Ollama moet bereikbaar zijn vanaf de backend.</p>
                <button class="settings-primary-button" type="submit">AI-keuze opslaan</button>
                <p id="ai-save-status" class="service-status" role="status"></p>
            </form>
        </section>
        <section class="settings-page-section" id="settings-section-cloud" aria-labelledby="settings-cloud-title" tabindex="-1">
            <div class="settings-section-heading"><div><p class="settings-section-eyebrow">Account & cloud</p><h3 id="settings-cloud-title">Optionele synchronisatie</h3><p>Inloggen laat je lokale tuin intact. Kies zelf welke kopie je wilt bewaren. Er is geen automatische synchronisatie.</p></div></div>
            <p id="cloud-status" class="service-status" role="status">Cloudconfiguratie laden…</p>
            <form id="cloud-login-form" class="service-form">
                <div class="settings-form-grid"><label class="settings-field"><span>E-mailadres</span><input id="cloud-email" type="email" required autocomplete="username"></label><label class="settings-field"><span>Wachtwoord</span><input id="cloud-password" type="password" required autocomplete="current-password"></label></div>
                <button class="settings-primary-button" type="submit">Inloggen</button>
                <p class="service-note">Gebruik een bestaand, bevestigd Supabase-account.</p>
            </form>
            <div id="cloud-actions" class="service-actions" hidden>
                <button class="settings-secondary-button" type="button" data-cloud-action="status">Cloudstatus vernieuwen</button>
                <button class="settings-primary-button" type="button" data-cloud-action="upload">Lokaal naar cloud</button>
                <button class="settings-secondary-button" type="button" data-cloud-action="download">Cloud naar dit apparaat</button>
                <button class="settings-secondary-button" type="button" data-cloud-action="logout">Uitloggen</button>
            </div>
            <p class="service-note">Een cloudkopie terugzetten vervangt je lokale tuin na bevestiging. Eerst bewaren we een veiligheidskopie op dit apparaat. Uitloggen verwijdert je lokale gegevens niet.</p>
            <button class="settings-secondary-button" type="button" data-cloud-action="recover">Veiligheidskopie terugzetten</button>
        </section>`;
    function say(id, message, panel = document) { const el = panel.querySelector(`#${id}`); if (el) el.textContent = message; }
    function loadGeminiModels() {
        // One attempt per page session, including errors. Opening settings or
        // switching providers must not retry a rejected credential.
        geminiModelsPromise ||= request('ai-models').then(data => {
            if (!Array.isArray(data.models)) throw new Error();
            geminiCatalog = { ...data, state: data.models.length ? 'ready' : 'empty' };
        }).catch(() => {
            geminiCatalog = { models: [], state: 'error' };
        });
        return geminiModelsPromise;
    }
    function renderGeminiModel(panel, current) {
        const select = panel.querySelector('#ai-gemini-model');
        const catalog = geminiCatalog;
        const listed = catalog?.models || [];
        const models = new Map(geminiFallbackModels.map(item => [item.id, item]));
        for (const item of listed) models.set(item.id, item);
        const isListed = id => listed.some(item => item.id === id);
        const fallback = geminiFallbackModels.some(item => !isListed(item.id));
        const saved = current.replace(/^models\//, '');
        select.replaceChildren();
        if (saved && !models.has(saved)) {
            const option = document.createElement('option');
            option.value = saved;
            option.textContent = `${saved} — bestaande keuze; niet gecontroleerd`;
            select.append(option);
        }
        for (const item of models.values()) {
            const option = document.createElement('option'); option.value = item.id;
            option.textContent = `${item.label || item.id}${item.hint ? ' — ' + item.hint : ''}${!isListed(item.id) ? ' — niet gecontroleerd' : ''}`;
            select.append(option);
        }
        select.value = saved || (models.has(catalog?.defaultModel) ? catalog.defaultModel : geminiFallbackModels[0].id);
        select.disabled = false;
        const submit = panel.querySelector('#ai-settings-form button[type="submit"]');
        const checkSelection = () => {
            submit.disabled = !select.value;
        };
        select.onchange = () => { checkSelection(); say('ai-save-status', '', panel); };
        checkSelection();
        say('ai-provider-status', fallback
            ? 'Standaardmodellen — beschikbaarheid nog niet gecontroleerd.'
            : saved && !isListed(saved) ? 'Je bestaande keuze blijft behouden; dit model staat niet in de opgehaalde lijst.'
            : 'Tekstmodellen uit de Gemini Models API. Geen generatiecontrole uitgevoerd.', panel);
    }
    async function updateModel(panel, reset = false) {
        const provider = panel.querySelector('#ai-provider').value;
        const info = config?.providers?.[provider];
        const model = panel.querySelector('#ai-model');
        const select = panel.querySelector('#ai-gemini-model');
        const isGemini = provider === 'gemini';
        model.hidden = isGemini; model.disabled = isGemini; model.required = !isGemini;
        select.hidden = !isGemini; select.required = isGemini; select.disabled = !isGemini;
        panel.querySelector('#ai-settings-form button[type="submit"]').disabled = false;
        const saved = prefs.provider === provider ? prefs.model : '';
        if (isGemini) {
            const backendModel = info?.model === 'gemini-2.5-flash' ? '' : info?.model;
            const current = reset ? saved || backendModel || '' : select.value || saved || backendModel || '';
            renderGeminiModel(panel, current);
            await loadGeminiModels();
            if (select.isConnected && panel.querySelector('#ai-provider').value === 'gemini') {
                renderGeminiModel(panel, select.value);
            }
            return;
        }
        if (reset) model.value = saved || info?.model || '';
        const options = panel.querySelector('#ai-model-options');
        options.replaceChildren();
        for (const name of [...new Set([info?.model, ...(info?.models || [])].filter(Boolean))]) {
            const option = document.createElement('option'); option.value = name; options.append(option);
        }
        say('ai-provider-status', info ? (info.configured ? `${info.label}: backend ingesteld. ${info.available === false ? 'De Ollama-server is momenteel niet bereikbaar.' : 'Beschikbaarheid van het model wordt bij de aanvraag gecontroleerd.'}` : `${info.label}: backendconfiguratie ontbreekt.`) : 'Backend niet beschikbaar.', panel);
    }
    function displayAccount(panel, configured) {
        panel.querySelector('#cloud-login-form').hidden = Boolean(user) || !configured;
        panel.querySelector('#cloud-actions').hidden = !user;
        say('cloud-status', !configured ? 'Supabase is nog niet geconfigureerd. Je lokale gegevens blijven beschikbaar.' : user ? `Ingelogd als ${user.email}. Cloudstatus laden…` : 'Niet ingelogd. Je werkt met de lokale tuin op dit apparaat.', panel);
    }
    async function readCloud(panel) {
        cloud = null;
        const data = await request('cloud-sync');
        if (data.userId !== user?.id) throw new Error('Het account is gewijzigd. Open Instellingen opnieuw.');
        cloud = data.snapshot || { revision: 0 };
        say('cloud-status', `${user.email} · ${cloud.revision ? `Cloudkopie versie ${cloud.revision}, bijgewerkt op ${new Date(cloud.updated_at).toLocaleString('nl-NL')}.` : 'Er staat nog geen tuin in de cloud.'}`, panel);
    }
    async function safetyStore() {
        return new Promise((resolve, reject) => {
            const req = indexedDB.open('KweekKompasSafety', 1);
            req.onupgradeneeded = () => req.result.createObjectStore('backups');
            req.onsuccess = () => resolve(req.result);
            req.onerror = () => reject(new Error('De veiligheidskopie is niet beschikbaar.'));
        });
    }
    async function safetyBackup(value) {
        const db = await safetyStore();
        try {
            return await new Promise((resolve, reject) => {
                const tx = db.transaction('backups', value === undefined ? 'readonly' : 'readwrite');
                const req = value === undefined ? tx.objectStore('backups').get('before-cloud-restore') : tx.objectStore('backups').put(value, 'before-cloud-restore');
                tx.oncomplete = () => resolve(req.result);
                tx.onerror = tx.onabort = () => reject(new Error('Veiligheidskopie opslaan/lezen mislukt. Lokale gegevens zijn niet vervangen.'));
            });
        } finally { db.close(); }
    }
    async function action(kind, panel) {
        if (busy) return;
        busy = true;
        panel.querySelectorAll('#settings-section-cloud button').forEach(button => { button.disabled = true; });
        try {
            if (kind === 'recover') {
                const saved = await safetyBackup();
                if (!saved) throw new Error('Er is nog geen veiligheidskopie van een cloudherstel.');
                if (!confirm('De vorige lokale tuin terugzetten? Dit vervangt je huidige lokale gegevens.')) return;
                await window.KweekLocalData.restore(saved.payload);
                if (saved.owner) localStorage.setItem(OWNER_KEY, saved.owner); else localStorage.removeItem(OWNER_KEY);
                location.reload();
            } else if (kind === 'logout') {
                await request('auth', { action: 'logout' }); user = null; cloud = null; displayAccount(panel, true);
            } else if (kind === 'status') await readCloud(panel);
            else if (kind === 'upload') {
                if (!user || !cloud) throw new Error('Lees eerst de cloudstatus.');
                const owner = localStorage.getItem(OWNER_KEY);
                const warning = owner && owner !== user.id ? 'Deze lokale tuin is aan een ander account gekoppeld. Kopieer deze tuin bewust naar dit account?\n\n' : '';
                if (!confirm(`${warning}De lokale tuin opslaan voor ${user.email}? ${cloud.revision ? 'De bestaande cloudkopie wordt vervangen.' : 'Je maakt een nieuwe cloudkopie.'}`)) return;
                const result = await request('cloud-sync', { payload: await window.KweekLocalData.capture(), revision: cloud.revision, expectedUserId: user.id });
                if (result.userId !== user.id) throw new Error('Het account is gewijzigd.');
                localStorage.setItem(OWNER_KEY, user.id); cloud = result;
                say('cloud-status', `Cloudkopie versie ${result.revision} opgeslagen voor ${user.email}.`, panel);
            } else if (kind === 'download') {
                if (!user) throw new Error('Log eerst in.');
                await readCloud(panel);
                if (!cloud.payload) throw new Error('Er staat nog geen tuin in de cloud.');
                if (!confirm(`De cloudtuin van ${user.email} naar dit apparaat halen? Je lokale gegevens worden vervangen; eerst wordt een veiligheidskopie gemaakt.`)) return;
                await safetyBackup({ payload: await window.KweekLocalData.capture(), owner: localStorage.getItem(OWNER_KEY), savedAt: new Date().toISOString() });
                await window.KweekLocalData.restore(cloud.payload);
                localStorage.setItem(OWNER_KEY, user.id);
                location.reload();
            }
        } catch (error) { say('cloud-status', error.message, panel); }
        finally { busy = false; panel.querySelectorAll('#settings-section-cloud button').forEach(button => { button.disabled = false; }); }
    }
    async function mount(panel) {
        readPreferences();
        const providerInput = panel.querySelector('#ai-provider');
        if (!providerInput) return;
        providerInput.value = prefs.provider || config?.defaultProvider || 'gemini';
        panel.querySelector('#ai-model').value = prefs.model || '';
        if (config || providerInput.value !== 'gemini') updateModel(panel, true);
        else renderGeminiModel(panel, prefs.model || '');
        providerInput.onchange = () => updateModel(panel, true);
        panel.querySelector('#ai-settings-form').onsubmit = event => {
            event.preventDefault();
            const provider = providerInput.value;
            const model = panel.querySelector(provider === 'gemini' ? '#ai-gemini-model' : '#ai-model').value.trim();
            if (provider === 'gemini' && !panel.querySelector('#ai-gemini-model').selectedOptions.length) return;
            if (!/^[a-zA-Z0-9][a-zA-Z0-9_.:/-]{0,159}$/.test(model)) return say('ai-save-status', 'Vul een geldige modelnaam in.', panel);
            try {
                const next = { provider, model };
                localStorage.setItem(PREFS_KEY, JSON.stringify(next));
                prefs = next;
                updateDashboardProvider();
                say('ai-save-status', 'Opgeslagen voor de tuinassistent en de zadenhulp.', panel);
            } catch { say('ai-save-status', 'Opslaan is niet mogelijk in deze browser.', panel); }
        };
        panel.querySelector('#cloud-login-form').onsubmit = async event => {
            event.preventDefault();
            if (busy) return;
            busy = true;
            const button = event.target.querySelector('button'); button.disabled = true;
            const passwordInput = panel.querySelector('#cloud-password');
            const password = passwordInput.value; passwordInput.value = '';
            try {
                const data = await request('auth', { action: 'login', email: panel.querySelector('#cloud-email').value.trim(), password });
                user = data.user; cloud = null; displayAccount(panel, true); await readCloud(panel);
            } catch (error) { say('cloud-status', error.message, panel); }
            finally { busy = false; button.disabled = false; }
        };
        panel.querySelectorAll('[data-cloud-action]').forEach(button => { button.onclick = () => action(button.dataset.cloudAction, panel); });
        // Account status must remain usable even when another settings request stalls.
        const accountPromise = (async () => {
            try {
                const data = await request('auth');
                if (!providerInput.isConnected) return;
                if (typeof data.configured !== 'boolean') throw new Error('Cloudconfiguratie kon niet worden gelezen. Je lokale tuin blijft beschikbaar.');
                user = data.user; cloud = null; displayAccount(panel, data.configured);
                if (user) await readCloud(panel);
            } catch (error) { say('cloud-status', error.message, panel); }
        })();
        try {
            configPromise ||= request('ai-config').then(value => { config = value; });
            await configPromise;
            updateDashboardProvider();
            if (!providerInput.isConnected) return;
            if (!prefs.provider) providerInput.value = providers.includes(config.defaultProvider) ? config.defaultProvider : 'gemini';
            updateModel(panel, true);
        } catch (error) { if (providerInput.isConnected) updateModel(panel, true); }
        await accountPromise;
    }
    const removeSafetyBackup = () => new Promise((resolve, reject) => {
        const req = indexedDB.deleteDatabase('KweekKompasSafety');
        req.onsuccess = resolve;
        req.onerror = req.onblocked = () => reject(new Error('Sluit andere KweekKompas-tabbladen om de veiligheidskopie te wissen.'));
    });
    window.addEventListener('storage', event => {
        if (event.key === PREFS_KEY || event.key === null) {
            updateDashboardProvider();
            const panel = document.querySelector('#settings-section-ai');
            const input = panel?.querySelector('#ai-provider');
            if (input) {
                input.value = prefs.provider || config?.defaultProvider || 'gemini';
                panel.querySelector('#ai-model').value = prefs.model || config?.providers?.[input.value]?.model || '';
                updateModel(panel, true);
            }
        }
    });
    window.KweekServices = { settingsHTML, mount, removeSafetyBackup, updateDashboardProvider, requestAI: (route, body) => request(route, { ...body, ai: readPreferences() }) };
})();
