/* Optional services. Local data stays under the existing app's storage/backup logic. */
(() => {
    const PREFS_KEY = 'kweekkompas_ai';
    const PROFILE_AI_CONSENT_KEY = 'kweekkompas_ai_profile_consent';
    const GEMINI_MODEL = 'gemini-3.5-flash-lite';
    const GEMINI_FLASH_MODEL = 'gemini-3.8-flash';
    const OWNER_KEY = 'kweekkompas_local_owner';
    const providers = ['gemini', 'ollama', 'openai-compatible', 'chatgpt'];
    let config = null;
    let user = null;
    let accountVersion = 0;
    let authMode = 'login';
    let recovery = false;
    let authMessage = '';
    // Capture links once, then remove credentials before any network requests.
    let callbackPromise = Promise.resolve();
    function processAuthLink() {
    const authURL = new URL(location.href);
    const fragment = new URLSearchParams(authURL.hash.slice(1));
    const authKeys = ['access_token', 'refresh_token', 'token_hash', 'error', 'error_code', 'code'];
    const linkParams = authKeys.some(key => fragment.has(key)) ? fragment : authURL.searchParams;
    const hasAuthLink = ['access_token', 'refresh_token', 'token_hash', 'error', 'error_code', 'code'].some(key => linkParams.has(key));
    if (hasAuthLink) {
        const linkFailed = linkParams.has('error') || linkParams.has('error_code') || linkParams.has('code');
        const body = { action: 'callback', type: linkParams.get('type') || 'email', access_token: linkParams.get('access_token'), refresh_token: linkParams.get('refresh_token'), token_hash: linkParams.get('token_hash') };
        for (const key of ['access_token', 'refresh_token', 'token_hash', 'type', 'expires_in', 'expires_at', 'token_type', 'error', 'error_code', 'error_description', 'code']) authURL.searchParams.delete(key);
        if (linkParams === fragment) authURL.hash = '';
        history.replaceState(history.state, '', authURL.pathname + authURL.search + authURL.hash);
        callbackPromise = (linkFailed ? Promise.reject(new Error('Deze accountlink is verlopen of niet bruikbaar. Vraag een nieuwe mail aan.')) : request('auth', body)).then(data => {
            accountVersion++; user = data.user; recovery = data.recovery; auto.setAccount(recovery ? null : user?.id, true); authMode = recovery ? 'password' : 'login';
            authMessage = recovery ? 'Herstel-link verwerkt. Kies hieronder een nieuw wachtwoord.' : 'Je e-mailadres is bevestigd. Welkom terug bij KweekKompas. Je lokale tuin is behouden.';
        }).catch(error => { authMessage = error.message; confirmationPending = ['email', 'signup'].includes(body.type); });
        const openAccount = async () => {
            await callbackPromise;
            if (user && !recovery) window.openSettingsSection?.('cloud');
            else openAccountPopup(recovery ? 'password' : 'login');
        };
        if (document.readyState === 'loading') window.addEventListener('DOMContentLoaded', openAccount, { once: true });
        else openAccount();
    }
    }
    processAuthLink();
    window.addEventListener('hashchange', processAuthLink);
    let cloud = null;
    let conflictAccount = null;
    let localStatusTimer;
    let localStatusRequest = 0;
    let busy = false;
    let prefs = {};
    let configPromise = null;
    function readPreferences() {
      const defaultProvider = config?.defaultProvider || (['localhost', '127.0.0.1', '[::1]'].includes(location.hostname) ? 'ollama' : 'gemini');
      const defaults = { provider: defaultProvider, model: config?.providers?.[defaultProvider]?.model || (defaultProvider === 'ollama' ? 'llama3:latest' : '') };
      try {
        const saved = JSON.parse(localStorage.getItem(PREFS_KEY) || '{}');
        prefs = providers.includes(saved?.provider) && typeof saved.model === 'string' ? { provider: saved.provider, model: saved.model } : defaults;
        if (prefs.provider === 'gemini' && ![GEMINI_MODEL, GEMINI_FLASH_MODEL].includes(prefs.model)) prefs.model = GEMINI_MODEL;
      } catch { prefs = defaults; }
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
                const collapse = section?.closest('details.settings-collapse');
                if (collapse) collapse.open = true;
                section?.scrollIntoView({ block: 'start' }); section?.focus({ preventScroll: true });
            });
        };
        const display = () => {
            const provider = prefs.provider || config?.defaultProvider;
            const labels = { gemini: 'Gemini', ollama: 'Lokale AI (Ollama)', 'openai-compatible': 'Eigen API', chatgpt: 'ChatGPT' };
            const directStatus = provider === 'ollama' && window.KweekBrowserOllama?.direct ? window.KweekBrowserOllama.status().state : null;
            const suffix = directStatus === 'reachable' ? ' · verbonden op deze computer' : directStatus === 'blocked' ? ' · verbinding controleren' : directStatus ? ' · nog niet getest' : '';
            button.textContent = `${labels[provider] || 'AI-instellingen'}${suffix} ⌄`;
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
    async function request(route, body, { signal } = {}) {
        const response = await fetch(`/api/${route}`, { method: body === undefined ? 'GET' : 'POST',
            credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, ...(['cloud-sync', 'auth'].includes(route) ? { signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(20000)]) : AbortSignal.timeout(20000) } : {}), ...(body === undefined ? {} : { body: JSON.stringify(body) }) }).catch(error => {
                if (signal?.aborted) throw Object.assign(new Error('Gestopt'), { name: 'AbortError' });
                if (route === 'cloud-sync') throw new Error('Geen verbinding met de cloud. Je lokale tuin blijft volledig bewaard. Probeer later opnieuw.');
                if (route === 'auth') throw new Error(error.name === 'TimeoutError' ? 'De accountaanvraag duurt te lang. Probeer later opnieuw; je lokale tuin blijft behouden.' : 'Geen verbinding met de accountservice. Probeer later opnieuw; je lokale tuin blijft behouden.');
                throw error;
            });
        const data = await response.json().catch(() => ({ error: 'Start KweekKompas met npm start zodat de backend beschikbaar is.' }));
        if (!response.ok) {
            const error = new Error(data.error || `Aanvraag mislukt (${response.status}).`);
            error.status = response.status;
            error.code = data.code;
            throw error;
        }
        return data;
    }
    const ollamaCommandHTML = () => `<div class="ollama-command"><input aria-label="Commando om het standaardmodel te downloaden" value="ollama pull llama3:latest" readonly><button type="button" class="settings-secondary-button" data-ollama-copy>Kopiëren</button><span class="ollama-copy-status" role="status"></span></div>`;
    const localHelpHTML = () => `<details id="local-ai-help" class="local-ai-help"><summary>Lokale AI gebruiken</summary>
        <p>Ollama draait op je eigen computer en gebruikt geen Gemini-tegoed. Gebruik KweekKompas op dezelfde computer en laat Ollama draaien.</p>
        <ol>
            <li><a href="https://ollama.com/download" target="_blank" rel="noopener noreferrer">Download en installeer Ollama</a>.</li>
            <li>Open PowerShell of Terminal en download het model:${ollamaCommandHTML()}Wacht tot de download klaar is.</li>
            <li>Ga naar <strong>Instellingen → AI</strong>. Kies <strong>Lokale AI (Ollama)</strong> en <code>llama3:latest</code>. Klik op <strong>AI-keuze opslaan</strong>.</li>
            <li>Klik op <strong>Verbinding testen</strong>.</li>
        </ol>
        <details><summary>Online gebruiken op Windows</summary>
            <ol>
                <li>Sluit Ollama af via het systeemvak. Open via Start <strong>Omgevingsvariabelen voor uw account bewerken</strong>.</li>
                <li>Maak of bewerk de gebruikersvariabele <code>OLLAMA_ORIGINS</code> en voeg dit adres toe. Behoud eventuele andere site-adressen, gescheiden door komma’s; vervang <code>*</code> door het site-adres.
                    <div class="ollama-command"><input aria-label="KweekKompas-siteadres voor Ollama" readonly value="https://kweekkompas.netlify.app"><button type="button" class="settings-secondary-button" data-ollama-copy>Kopieer adres</button><span class="ollama-copy-status" role="status"></span></div>
                </li>
                <li>Klik op OK, start Ollama opnieuw en test de verbinding. Geef toestemming als je browser om lokale-netwerktoegang vraagt.</li>
            </ol>
        </details>
        <details><summary>Verbinding lukt niet?</summary>
            <ul>
                <li><strong>Niet bereikbaar:</strong> open Ollama via Start, of gebruik <code>ollama serve</code> in de terminal als het nog niet draait.</li>
                <li><strong>Model ontbreekt:</strong> controleer de modelnaam met <code>ollama list</code> of download het model met <code>ollama pull modelnaam</code>.</li>
                <li><strong>Online geblokkeerd:</strong> controleer de Windows-instelling hierboven en lokale-netwerktoegang in je browser. Je kunt ook de lokale app gebruiken via <code>npm start</code>.</li>
            </ul>
            <p>Vanaf je telefoon werkt deze verbinding met Ollama op je pc niet.</p>
            <a href="https://docs.ollama.com/faq" target="_blank" rel="noopener noreferrer">Meer hulp bij Ollama</a>
        </details>
    </details>`;
    function openLocalHelp() {
        window.openSettingsSection?.('faq');
        requestAnimationFrame(() => { const help = document.getElementById('local-ai-help'); if (help) { help.open = true; help.scrollIntoView({ block: 'start' }); help.querySelector('summary').focus(); } });
    }
    function appendOllamaHelp(container, error) {
        if (!/^OLLAMA_/.test(error?.code || '')) return;
        const link = document.createElement('button'); link.type = 'button'; link.className = 'ollama-help-link'; link.textContent = 'Lees de installatiehulp'; link.onclick = openLocalHelp;
        container.append(document.createTextNode(' '), link);
    }
    const settingsHTML = () => `
        <section class="settings-page-section" id="settings-section-ai" aria-labelledby="settings-ai-title" tabindex="-1">
            <div class="settings-section-heading"><div><p class="settings-section-eyebrow">AI</p><h3 id="settings-ai-title">Provider en model</h3></div></div>
            <form id="ai-settings-form" class="service-form">
                <div class="settings-form-grid">
                    <label class="settings-field"><span>Provider</span><select id="ai-provider"><option value="gemini">Gemini</option><option value="ollama">Lokale AI (Ollama)</option><option value="chatgpt" hidden disabled>ChatGPT</option><option value="openai-compatible" hidden disabled>Eigen API</option><option value="" hidden disabled>Kies een beschikbare provider</option></select></label>
                    <label class="settings-field" id="ai-standard-model"><span>Model</span><select id="ai-gemini-model" aria-describedby="ai-provider-status" required></select><select id="ai-chatgpt-model" aria-describedby="chatgpt-status" hidden disabled></select><input id="ai-model" list="ai-model-options" maxlength="160" placeholder="Modelnaam" hidden disabled><datalist id="ai-model-options"></datalist></label>
                </div>
                <div id="chatgpt-setup" hidden>
                    <div id="chatgpt-entry" class="service-actions"><button id="chatgpt-login" class="settings-secondary-button" type="button">Doorgaan met ChatGPT</button></div>
                    <details id="chatgpt-management" hidden><summary>Account</summary>
                    <p id="chatgpt-account" class="service-note"></p>
                    <label id="chatgpt-accounts-field" class="settings-field" hidden><span>ChatGPT-account</span><select id="chatgpt-accounts"></select></label>
                    <div id="chatgpt-management-actions" class="service-actions"><button id="chatgpt-other-account" class="settings-secondary-button" type="button" hidden>Ander account</button><button id="chatgpt-logout" class="settings-secondary-button" type="button" hidden>Uitloggen</button><button id="chatgpt-reload" class="settings-secondary-button" type="button" hidden>Modellen vernieuwen</button></div>
                    </details>
                    <button id="chatgpt-cancel" class="settings-secondary-button" type="button" hidden>Annuleren</button>
                    <p id="chatgpt-status" class="service-status" role="status" aria-live="polite"></p>
                    <p id="chatgpt-welcome" hidden>Je gebruikt je ChatGPT-abonnement voor KweekKompas. <button id="chatgpt-acknowledge" type="button" class="settings-secondary-button">Begrepen</button></p>
                </div>
                <details id="custom-api-setup" hidden><summary>Geavanceerd</summary>
                    <label class="settings-field"><span>API-adres</span><input id="custom-api-address" type="url" maxlength="2048" placeholder="https://dienst.example/v1" autocomplete="off"></label>
                    <label class="settings-field"><span>Model</span><input id="custom-api-model" maxlength="160" autocomplete="off"></label>
                    <label class="settings-field"><span>API-sleutel</span><input id="custom-api-key" type="password" maxlength="8192" autocomplete="off" spellcheck="false" placeholder="Nieuwe sleutel (optioneel)"></label>
                    <p id="custom-api-key-status" class="service-note"></p>
                    <div class="ollama-actions"><button id="custom-api-save" class="settings-primary-button" type="button">Opslaan</button><button id="custom-api-delete" class="settings-secondary-button" type="button">Sleutel verwijderen</button><button id="custom-api-test" class="settings-secondary-button" type="button">Verbinding testen</button></div>
                    <p id="custom-api-status" class="service-status" role="status" aria-live="polite"></p>
                </details>
                <div id="ollama-setup" hidden>
                <p><a href="https://ollama.com/download" target="_blank" rel="noopener noreferrer">Download Ollama</a></p>${ollamaCommandHTML()}
                <div class="ollama-actions"><button id="ollama-test" class="settings-secondary-button" type="button">Verbinding testen</button><button class="ollama-help-link" type="button" data-ollama-help>Lees de installatiehulp</button></div>
                <p id="ollama-test-status" class="service-status" role="status" aria-live="polite"></p></div>
                <p id="ai-provider-status" class="service-status" role="status"></p>
                <button class="settings-primary-button" type="submit">AI-keuze opslaan</button>
                <p id="ai-save-status" class="service-status" role="status"></p>
                <p id="chatgpt-usage" class="service-note" hidden><a href="https://chatgpt.com/settings/usage" target="_blank" rel="noopener noreferrer">ChatGPT-abonnement beheren</a></p>
            </form>
            <label class="ai-profile-consent"><input id="ai-profile-consent" type="checkbox"><span>Mijn tuinprofiel gebruiken voor AI-advies</span></label>
            <p class="service-note">Stuurt klimaat, licht, tuinplek en ervaring mee bij AI-vragen. Naam en foto gaan niet mee. Deze keuze geldt alleen op dit apparaat.</p>
        </section>
        <section class="settings-page-section compact-account" id="settings-section-cloud" aria-labelledby="settings-cloud-title" tabindex="-1">
<h3 id="settings-cloud-title">Account & synchronisatie</h3><p id="cloud-account-name">Je werkt lokaal</p>
<button class="settings-primary-button" id="cloud-open-account" type="button">Inloggen / Registreren</button>
<label class="auto-sync-switch"><input id="cloud-auto-sync" type="checkbox" role="switch" disabled><span>Automatisch synchroniseren</span></label>
<p id="cloud-status" class="service-status" role="status" aria-live="polite">Opgeslagen op dit apparaat</p>
<p id="cloud-auto-note" class="service-note"></p>
<div id="cloud-auto-choices" class="service-actions" hidden><button class="settings-secondary-button" type="button" data-auto-choice="local">Lokale tuin gebruiken</button><button class="settings-secondary-button" id="cloud-auto-choose-remote" type="button" data-auto-choice="cloud">Cloudtuin gebruiken</button></div>
<div id="cloud-actions" class="service-actions" hidden><button class="settings-primary-button" type="button" data-cloud-action="upload">Uploaden</button><button class="settings-secondary-button" type="button" data-cloud-action="download">Cloudkopie terughalen</button><button class="settings-secondary-button" type="button" data-cloud-action="logout">Uitloggen</button></div>
<div id="cloud-conflict-actions" class="service-actions" hidden><button class="settings-secondary-button" type="button" data-cloud-action="download">Cloudkopie kiezen</button><button class="settings-secondary-button" type="button" data-cloud-action="replace">Lokale tuin naar cloud sturen</button></div>
<p id="cloud-last-sync" class="service-note"></p><p id="cloud-local-status" class="service-note"></p><div hidden><p id="cloud-error-detail"></p><p id="cloud-login-status"></p><p id="cloud-copy-size"></p></div>
</section>`;
    function say(id, message, panel = document) {
        const el = panel.querySelector('#' + id);
        if (id === 'cloud-status' && !['Opgeslagen op dit apparaat', 'Synchroniseren…', 'Gesynchroniseerd', 'Offline — wijzigingen wachten', 'Conflict — kies een versie'].includes(message)) {
            const detail = panel.querySelector('#cloud-error-detail'); if (detail) detail.textContent = message;
            if (el) el.textContent = busy ? 'Synchroniseren…' : hasConflict() ? 'Conflict — kies een versie' : 'Opgeslagen op dit apparaat';
        } else if (el) el.textContent = message;
    }
    const syncKey = id => `kweekkompas_sync_${id}`;
    const conflictKey = id => `kweekkompas_sync_conflict_${id}`;
    function hasConflict(id = user?.id) {
        return !!id && (conflictAccount === id || localStorage.getItem(conflictKey(id)) === 'true');
    }
    function lastSync(id = user?.id) {
        try { return id ? JSON.parse(localStorage.getItem(syncKey(id)) || 'null') : null; }
        catch { return null; }
    }
    async function fingerprint(payload) {
        const ordered = { ...payload, seeds: [...payload.seeds].sort((a, b) => String(a.id).localeCompare(String(b.id))) };
        const bytes = new TextEncoder().encode(window.KweekCloudData.stable(ordered));
        const digest = await crypto.subtle.digest('SHA-256', bytes);
        return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('');
    }
    async function recordSync(result, payload, direction, accountId, guard = () => {}, confirmedHash) {
        const saved = { revision: result.revision, hash: confirmedHash ?? await fingerprint(payload), completedAt: new Date().toISOString(), direction };
        guard();
        // This is device bookkeeping, never part of a garden backup/cloud payload.
        try {
            localStorage.setItem(syncKey(accountId), JSON.stringify(saved));
            localStorage.removeItem(conflictKey(accountId));
        } catch { throw new Error('De cloudactie is geslaagd, maar de synchronisatiestatus kon niet op dit apparaat worden bewaard. Controleer vrije opslagruimte en lees daarna de cloudstatus opnieuw.'); }
    }
    function showConflict(panel) {
        conflictAccount = user?.id;
        try { localStorage.setItem(conflictKey(user.id), 'true'); } catch { /* Still block in memory. */ }
        auto.pause('conflict');
        say('cloud-status', 'De cloudkopie is gewijzigd op een ander apparaat. Er is niets overschreven. Kies de cloudkopie of stuur je lokale tuin bewust naar de cloud; je lokale gegevens blijven intussen bewaard.', panel);
        renderAutoUI(panel);
    }
    async function updateLocalStatus(panel = document.getElementById('settings-panel')) {
        if (!panel?.querySelector('#cloud-local-status') || !window.KweekLocalData) return;
        const requestId = ++localStatusRequest;
        const accountId = user?.id;
        const saved = lastSync(accountId);
        say('cloud-login-status', user ? `Ingelogd als ${user.email}.` : 'Niet ingelogd · lokaal gebruik zonder account.', panel);
        say('cloud-last-sync', user && saved?.completedAt ? `Laatste synchronisatie: ${new Date(saved.completedAt).toLocaleString('nl-NL')}` : '', panel);
        try {
            const payload = await window.KweekLocalData.captureCloud();
            const currentHash = user ? await fingerprint(payload) : null;
            if (requestId !== localStatusRequest || accountId !== user?.id) return;
            localSame = !!saved?.hash && currentHash === saved.hash;
            say('cloud-local-status', '', panel);
            const status = panel.querySelector('#cloud-status');
            if (status && !busy) status.textContent = hasConflict() ? 'Conflict — kies een versie' : user && saved?.hash === currentHash ? 'Gesynchroniseerd' : 'Opgeslagen op dit apparaat';
            renderAutoUI(panel);
            const estimate = window.KweekPhotoStorage.estimate(payload, accountId);
            const size = window.KweekCloudData.bytes(estimate.payload);
            say('cloud-copy-size', `Cloudkopie zonder ingebedde foto's: ${(size / 1_000_000).toFixed(2)} MB van maximaal 3,5 MB. Foto’s vóór verwerking: ${estimate.photoCount} uniek, ${(estimate.photoBytes / 1_000_000).toFixed(2)} MB; maximaal 1 MB per foto na verwerking.${size > window.KweekCloudData.MAX_BYTES ? ' Te groot om te uploaden; je lokale tuin blijft bewaard.' : ''}`, panel);
        } catch (error) { say('cloud-copy-size', error.message, panel); say('cloud-local-status', 'Lokale wijzigingen konden niet worden gecontroleerd. Er wordt niets automatisch geüpload.', panel); }
    }
    let autoReport = null, autoChoice = false, autoRemote = false, autoRefresh = false, localSame = false;
    function renderAutoUI(panel = document.getElementById('settings-panel')) {
        if (!panel?.querySelector('#cloud-auto-sync')) return;
        const state = autoReport?.state;
        const control = panel.querySelector('#cloud-auto-sync');
        control.checked = !!state?.enabled; control.disabled = !user || recovery || !navigator.locks || !!autoReport?.fatal || !!autoReport?.busy && !state?.enabled;
        const conflict = !!user && (hasConflict() || state?.paused === 'conflict');
        const needsBasis = !!user && (autoChoice || state?.paused === 'choose' || state?.resolving || state?.enabled && ['example', 'import'].includes(state.paused));
        const mode = conflict ? 'conflict' : needsBasis ? 'basis' : 'normal';
        panel.querySelector('#settings-section-cloud').dataset.syncMode = mode;
        const manualConflict = conflict && !state?.enabled;
        panel.querySelector('#cloud-actions').hidden = !user || recovery || mode !== 'normal';
        control.closest('label').hidden = mode !== 'normal';
        panel.querySelector('#cloud-auto-choices').hidden = mode === 'normal' || manualConflict;
        panel.querySelector('#cloud-conflict-actions').hidden = !manualConflict;
        panel.querySelector('#cloud-auto-choose-remote').hidden = !(cloud ? !!cloud.payload : state?.remoteExists ?? autoRemote);
        panel.querySelectorAll('[data-auto-choice]').forEach(button => { button.disabled = !!autoReport?.busy; });
        panel.querySelector('#cloud-auto-choose-remote').disabled = !autoRemote || !!autoReport?.busy;
        const notes = { manual: 'Handmatige actie uitgevoerd. Zet de schakelaar opnieuw aan om automatisch verder te gaan.', choose: 'Kies het uitgangspunt. Er wordt nog niets vervangen.', conflict: 'Beide tuinen zijn gewijzigd. Kies bewust welke je wilt behouden.', example: 'Voorbeelden geladen. Automatisch synchroniseren is gepauzeerd; kies bewust hoe verder.', import: 'De lokale tuin is gewijzigd. Automatisch synchroniseren is gepauzeerd; kies welke tuin je wilt gebruiken.', account: 'Account gewijzigd of uitgelogd. Zet de schakelaar opnieuw aan om een uitgangspunt te kiezen.', error: 'Automatisch synchroniseren is gepauzeerd. Zet de schakelaar opnieuw aan na het oplossen van de fout.', offline: 'Pogingen tijdelijk gestopt. Bij terugkeer van de verbinding wordt opnieuw geprobeerd.' };
        say('cloud-auto-note', ((state?.enabled || autoChoice || autoReport?.fatal) ? notes[state?.paused] : '') || (!navigator.locks && user ? 'Deze browser ondersteunt geen veilige wachtrijvergrendeling. Gebruik handmatige synchronisatie.' : ''), panel);
        if (autoReport?.message && (state?.enabled || autoChoice || autoReport.fatal) && state?.paused !== 'manual') say('cloud-error-detail', autoReport.message, panel);
        const note = panel.querySelector('#cloud-auto-note');
        if (mode === 'conflict') note.textContent = 'De cloudkopie en lokale tuin verschillen. Automatische synchronisatie is gepauzeerd; kies een versie.';
        else if (mode === 'basis') note.textContent = state?.resolving ? 'Je gekozen lokale tuin wordt verwerkt. Wacht op de serverbevestiging.' : notes[state?.paused] || 'Kies eerst welke tuin het uitgangspunt wordt.';
        const syncing = busy || autoReport?.busy;
        const pending = state?.counter > state?.done;
        const status = panel.querySelector('#cloud-status');
        status.textContent = syncing ? 'Synchroniseren…' : mode === 'conflict' ? 'Conflict — kies een versie' : mode === 'basis' ? 'Uitgangspunt nodig' : state?.paused === 'offline' || state?.retries ? 'Offline — wijzigingen wachten' : pending && state?.enabled && !localSame ? 'Lokale wijzigingen wachten' : user && localSame ? 'Gesynchroniseerd' : 'Opgeslagen op dit apparaat';
    }
    const cloudLock = async fn => navigator.locks ? navigator.locks.request('kweekkompas-cloud-sync', { ifAvailable: true }, lock => lock ? fn() : false) : fn();
    const auto = window.KweekAutoSync.create({
        storage: localStorage, nonce: () => crypto.randomUUID(), owner: () => localStorage.getItem(OWNER_KEY), claim: id => localStorage.setItem(OWNER_KEY, id),
        visible: () => document.visibilityState === 'visible', online: () => navigator.onLine, manualBusy: () => busy, lock: cloudLock,
        canRestore: () => !document.querySelector('#view-add:not(.hidden), #wishlist-detail-modal:not(.hidden), #settings-generic-modal') && !document.activeElement?.matches('input:not([type="checkbox"]):not([type="button"]), textarea, [contenteditable="true"]'),
        capture: () => window.KweekLocalData.captureCloud(), hash: fingerprint,
        remote: async (id, signal) => { const data = await request('cloud-sync', undefined, { signal }); if (data.userId !== id) throw Object.assign(new Error('Account gewijzigd.'), { status: 409 }); cloud = data.snapshot || { revision: 0 }; return cloud; },
        equal: async (local, remote, id) => fingerprint((await window.KweekPhotoStorage.prepare(local, id)).payload).then(async hash => hash === await fingerprint(window.KweekLocalData.validateCloud(remote))),
        hydrate: async (payload, id, signal) => window.KweekLocalData.validateCloud(await window.KweekPhotoStorage.hydrate(payload, id, (route, body) => request(route, body, { signal }), () => {}, { signal })),
        safety: async () => safetyBackup({ payload: await window.KweekLocalData.capture(), owner: localStorage.getItem(OWNER_KEY), savedAt: new Date().toISOString() }),
        restore: async (payload, check, signal) => { await window.KweekLocalData.restoreCloud(payload, { managed: true, check, signal }); autoRefresh = true; },
        record: recordSync,
        upload: async (payload, revision, id, signal, check, beforeSnapshot) => {
            let prepared;
            try {
                window.KweekLocalData.validateCloud(payload);
                window.KweekCloudData.assertSize(window.KweekPhotoStorage.estimate(payload, id).payload);
                prepared = await window.KweekPhotoStorage.prepare(payload, id);
            } catch (error) { error.retryable = false; throw error; }
            check();
            const guarded = (route, body) => { check(); return request(route, body, { signal }); };
            const cloudPayload = await window.KweekPhotoStorage.upload(prepared, id, guarded, () => {}, { signal }); check();
            window.KweekCloudData.assertSize(cloudPayload);
            await beforeSnapshot(cloudPayload); check();
            const result = await guarded('cloud-sync', { payload: cloudPayload, revision, expectedUserId: id }); check();
            if (result.userId !== id) throw Object.assign(new Error('Account gewijzigd.'), { status: 409 }); cloud = result; return result;
        },
        confirm: (direction, exists) => confirm(direction === 'cloud' ? 'De cloudtuin als uitgangspunt gebruiken? Dit vervangt de lokale tuin, inclusief eventuele wachtende wijzigingen. Eerst wordt een veiligheidskopie gemaakt.' : 'Deze volledige lokale tuin als uitgangspunt gebruiken en automatisch opslaan? Ook geïmporteerde planten en voorbeelden gaan dan bewust mee.' + (exists ? ' De cloudtuin wordt vervangen na revisiecontrole.' : ' Er wordt een nieuwe cloudkopie gemaakt.')),
        choice: (show, exists) => { autoChoice = show; autoRemote = exists; renderAutoUI(); },
        status: report => {
            if (autoReport?.message && !report.message && !report.busy && report.text === 'Gesynchroniseerd') say('cloud-error-detail', '');
            autoReport = report;
            if (report.state?.enabled && ['example', 'import', 'conflict'].includes(report.state.paused)) { autoChoice = true; autoRemote = true; }
            renderAutoUI();
            if (!report.busy) updateLocalStatus();
            if (!report.busy && autoRefresh) { autoRefresh = false; setTimeout(() => location.reload(), 0); }
        }
    });
    window.KweekCloudStatus = { changed: (source = 'own') => {
        localSame = false;
        if (source === 'own') { try { auto.changed(); } catch { say('cloud-error-detail', 'De wachtrij kon niet worden bewaard. Je bewerking staat wel lokaal; synchroniseer handmatig.'); } }
        clearTimeout(localStatusTimer); localStatusTimer = setTimeout(() => updateLocalStatus(), 600);
    }, external: source => auto.external(source) };
    window.addEventListener('storage', event => {
        if (event.key === window.KweekAutoSync.GUARD) { auto.cancel(); auto.status(); }
        if (event.key?.startsWith(window.KweekAutoSync.PREFIX) && event.key !== window.KweekAutoSync.GUARD) {
            const state = auto.state();
            if (!state?.enabled || state.paused) auto.cancel();
            auto.status();
        }
        if (event.key === 'moestuin_wishlist' || event.key === 'userProfile' || event.key === 'moestuin_reminders' || event.key === 'moestuin_calendar') auto.status();
        clearTimeout(localStatusTimer); localStatusTimer = setTimeout(() => updateLocalStatus(), 600);
    });
    window.addEventListener('focus', () => { updateLocalStatus(); auto.tick(); });
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') auto.tick(); });
    window.addEventListener('online', async () => { if (!user) await startAccountChoice(); auto.online(); });
    window.addEventListener('pagehide', () => auto.cancel());
    window.addEventListener('pageshow', () => { updateLocalStatus(); auto.online(); });
    setInterval(() => { if (document.visibilityState === 'visible') auto.tick(); }, 60000);
    function renderGeminiModel(panel) {
        const select = panel.querySelector('#ai-gemini-model');
        select.replaceChildren();
        for (const [value, label] of [[GEMINI_MODEL, '3.5 Flash-Lite'], [GEMINI_FLASH_MODEL, '3.8 Flash']]) {
            const option = document.createElement('option');
            option.value = value;
            option.textContent = label;
            select.append(option);
        }
        select.value = prefs.provider === 'gemini' ? prefs.model : GEMINI_MODEL;
        select.disabled = panel.querySelector('#ai-provider').value !== 'gemini';
        say('ai-provider-status', '', panel);
    }
    async function updateModel(panel, reset = false) {
        const providerInput = panel.querySelector('#ai-provider');
        const localCustom = false; // Eigen API voorlopig uit de providerkeuze.
        const customOption = providerInput.querySelector('[value="openai-compatible"]');
        customOption.hidden = customOption.disabled = !localCustom;
        const localGPT = Boolean(config?.providers?.chatgpt?.localAvailable);
        const gptOption = providerInput.querySelector('[value="chatgpt"]');
        gptOption.hidden = gptOption.disabled = !localGPT;
        if (providerInput.value === 'chatgpt' && !localGPT) providerInput.value = '';
        if (providerInput.value === 'openai-compatible' && !localCustom) providerInput.value = '';
        const provider = providerInput.value;
        const isCustom = provider === 'openai-compatible' && localCustom;
        panel.querySelector('#custom-api-setup').hidden = !isCustom;
        panel.querySelector('#ai-standard-model').hidden = isCustom || !provider;
        const info = config?.providers?.[provider];
        const model = panel.querySelector('#ai-model');
        const select = panel.querySelector('#ai-gemini-model');
        const isGemini = provider === 'gemini';
        const isGPT = provider === 'chatgpt';
        panel.querySelector('#chatgpt-setup').hidden = !isGPT;
        panel.querySelector('#chatgpt-usage').hidden = !isGPT || !info?.configured;
        const gptModel = panel.querySelector('#ai-chatgpt-model');
        gptModel.hidden = !isGPT; gptModel.disabled = !isGPT; gptModel.required = isGPT;
        panel.querySelector('#ollama-setup').hidden = provider !== 'ollama';
        say('ollama-test-status', '', panel);
        const directOllama = window.KweekBrowserOllama?.direct;
        model.hidden = isGemini || isCustom || isGPT; model.disabled = isGemini || isCustom || isGPT || !provider; model.required = !isGemini && !isCustom && !isGPT && Boolean(provider);
        select.hidden = !isGemini; select.required = isGemini; select.disabled = !isGemini;
        panel.querySelector('#ai-settings-form button[type="submit"]').disabled = false;
        panel.querySelector('#ai-settings-form button[type="submit"]').hidden = isCustom;
        if (!provider) {
            select.hidden = true; select.disabled = true; select.required = false;
            panel.querySelector('#ai-settings-form button[type="submit"]').disabled = true;
            say('ai-provider-status', 'Deze provider is alleen beschikbaar in de lokale app. Kies hier een beschikbare provider.', panel);
            return;
        }
        if (isGPT) { say('ai-provider-status', '', panel); loadChatGPT(panel); return; }
        if (isCustom) {
            select.hidden = true; select.disabled = true; select.required = false;
            say('ai-provider-status', '', panel);
            if (reset) loadCustomAPI(panel);
            return;
        }
        const saved = prefs.provider === provider ? prefs.model : '';
        if (isGemini) {
            renderGeminiModel(panel);
            return;
        }
        if (reset) model.value = saved || info?.model || (provider === 'ollama' ? 'llama3:latest' : '');
        const options = panel.querySelector('#ai-model-options');
        options.replaceChildren();
        for (const name of [...new Set([info?.model, ...(info?.models || [])].filter(Boolean))]) {
            const option = document.createElement('option'); option.value = name; options.append(option);
        }
        say('ai-provider-status', info ? (info.configured ? `${info.label}: backend ingesteld. ${info.available === false ? 'De Ollama-server is momenteel niet bereikbaar.' : 'Beschikbaarheid van het model wordt bij de aanvraag gecontroleerd.'}` : `${info.label}: backendconfiguratie ontbreekt.`) : 'Backend niet beschikbaar.', panel);
        if (provider === 'ollama') say('ai-provider-status', '', panel);
    }
    function renderChatGPT(panel, value) {
        const select = panel.querySelector('#ai-chatgpt-model');
        const current = select.value || (prefs.provider === 'chatgpt' ? prefs.model : '');
        const ready = value.connected && !value.pending;
        panel.querySelector('#chatgpt-account').textContent = value.email || '';
        panel.querySelector('#chatgpt-account').hidden = !value.email;
        panel.querySelector('#chatgpt-management').hidden = !value.connected && !value.accounts?.length;
        panel.querySelector(value.connected ? '#chatgpt-management-actions' : '#chatgpt-entry').append(panel.querySelector('#chatgpt-login'));
        panel.querySelector('#chatgpt-entry').hidden = value.connected;
        panel.querySelector('#chatgpt-login').textContent = value.connected ? 'Opnieuw inloggen' : 'Doorgaan met ChatGPT';
        panel.querySelector('#chatgpt-login').disabled = value.pending;
        panel.querySelector('#chatgpt-other-account').hidden = !value.accounts?.length;
        panel.querySelector('#chatgpt-other-account').disabled = value.pending;
        panel.querySelector('#chatgpt-logout').hidden = !value.connected;
        panel.querySelector('#chatgpt-cancel').hidden = !value.pending;
        panel.querySelector('#chatgpt-reload').hidden = !ready;
        panel.querySelector('#chatgpt-usage').hidden = !value.connected;
        panel.querySelector('#chatgpt-welcome').hidden = !value.welcome;
        const accounts = panel.querySelector('#chatgpt-accounts');
        const selected = accounts.value || value.selected;
        accounts.replaceChildren();
        for (const account of value.accounts || []) { const option = document.createElement('option'); option.value = account.id; option.textContent = account.label; accounts.append(option); }
        if ([...accounts.options].some(option => option.value === selected)) accounts.value = selected;
        panel.querySelector('#chatgpt-accounts-field').hidden = accounts.options.length < 2;
        if (value.models || !ready) {
            select.replaceChildren();
            for (const item of value.models || []) { const option = document.createElement('option'); option.value = item.id; option.textContent = item.label; select.append(option); }
            if ([...select.options].some(option => option.value === current)) select.value = current;
            else if (current && select.options.length) { const option = document.createElement('option'); option.value = ''; option.textContent = 'Kies een beschikbaar model'; option.disabled = true; select.prepend(option); select.value = ''; }
        }
        select.disabled = !ready || !select.options.length;
        panel.querySelector('#ai-settings-form button[type="submit"]').disabled = !ready || !select.value;
        say('chatgpt-status', value.pending ? 'Rond de login af in het geopende venster.' : value.connected && value.message === 'Verbonden met ChatGPT.' ? '' : value.message || '', panel);
        if (config?.providers?.chatgpt) config.providers.chatgpt.configured = value.connected;
    }
    async function loadChatGPT(panel) {
        const version = panel._chatgptVersion = (panel._chatgptVersion || 0) + 1;
        const valid = () => panel.isConnected && panel._chatgptVersion === version && panel.querySelector('#ai-provider').value === 'chatgpt';
        try {
            const value = await request('chatgpt', { action: 'status' });
            if (!valid()) return;
            renderChatGPT(panel, value);
            if (value.pending) { setTimeout(() => { if (valid()) loadChatGPT(panel); }, 1500); return; }
            if (value.connected) {
                const catalog = await request('chatgpt', { action: 'models' });
                if (valid()) { renderChatGPT(panel, catalog); if (!catalog.models.length) say('chatgpt-status', 'Er zijn geen ChatGPT-modellen beschikbaar voor dit account.', panel); }
            }
        } catch (error) { if (valid()) { panel.querySelector('#ai-chatgpt-model').disabled = true; panel.querySelector('#ai-settings-form button[type="submit"]').disabled = true; say('chatgpt-status', error.message, panel); } }
    }
    async function chatGPTAction(panel, action, newAccount = false) {
        ++panel._chatgptVersion;
        let popup;
        if (action === 'login') { popup = window.open('about:blank', '_blank', 'popup,width=620,height=760'); if (!popup) { say('chatgpt-status', 'Sta het inlogvenster toe en probeer opnieuw.', panel); return; } popup.opener = null; }
        panel.querySelectorAll('#chatgpt-setup button').forEach(button => { button.disabled = true; });
        try {
            const value = await request('chatgpt', { action, ...(newAccount ? { newAccount: true } : action === 'login' ? { accountId: panel.querySelector('#chatgpt-accounts').value || undefined } : {}) });
            if (popup && value.authorizationURL) popup.location.href = value.authorizationURL;
            if (panel.isConnected && panel.querySelector('#ai-provider').value === 'chatgpt') { renderChatGPT(panel, value); loadChatGPT(panel); }
        } catch (error) { popup?.close(); if (panel.isConnected) say('chatgpt-status', error.message, panel); }
        finally { panel.querySelectorAll('#chatgpt-setup button').forEach(button => { button.disabled = false; }); }
    }
    function showCustomMetadata(panel, value) {
        panel.querySelector('#custom-api-address').value = value.address;
        panel.querySelector('#custom-api-model').value = value.model;
        panel.querySelector('#custom-api-key').value = '';
        say('custom-api-key-status', value.keyConfigured ? 'Sleutel ingesteld.' : 'Geen sleutel ingesteld.', panel);
    }
    async function loadCustomAPI(panel) {
        try {
            const value = await request('local-api', { action: 'get' });
            if (panel.querySelector('#ai-provider')?.value === 'openai-compatible' && panel.isConnected) showCustomMetadata(panel, value);
        } catch { say('custom-api-status', 'Lokale instellingen zijn niet bereikbaar.', panel); }
    }
    async function customAPIAction(panel, action) {
        const buttons = [...panel.querySelectorAll('#custom-api-setup button')];
        if (buttons.some(button => button.disabled)) return;
        buttons.forEach(button => { button.disabled = true; });
        const keyInput = panel.querySelector('#custom-api-key');
        const body = { action };
        if (action === 'save') Object.assign(body, { address: panel.querySelector('#custom-api-address').value.trim(), model: panel.querySelector('#custom-api-model').value.trim(), apiKey: keyInput.value });
        say('custom-api-status', action === 'test' ? 'Eén minimale testaanvraag uitvoeren…' : 'Instellingen verwerken…', panel);
        try {
            const value = await request('local-api', body);
            showCustomMetadata(panel, value);
            if (action === 'save') {
                const next = { provider: 'openai-compatible', model: value.model };
                localStorage.setItem(PREFS_KEY, JSON.stringify(next)); prefs = next;
                if (config) Object.assign(config.providers['openai-compatible'], { model: value.model, configured: true });
                updateDashboardProvider();
            }
            say('custom-api-status', action === 'save' ? 'Lokaal opgeslagen voor de tuinassistent en de zadenhulp.' : action === 'delete-key' ? 'Opgeslagen sleutel verwijderd.' : value.message, panel);
        } catch (error) { say('custom-api-status', error.status ? error.message : 'Lokale instellingen zijn niet bereikbaar.', panel); }
        finally { keyInput.value = ''; delete body.apiKey; buttons.forEach(button => { button.disabled = false; }); }
    }
    async function testOllama(panel) {
        const button = panel.querySelector('#ollama-test');
        const model = panel.querySelector('#ai-model').value.trim();
        if (!model) return say('ollama-test-status', 'Vul eerst een modelnaam in.', panel);
        button.disabled = true; say('ollama-test-status', 'Verbinding controleren…', panel);
        try {
            if (window.KweekBrowserOllama?.direct) {
                const connection = await window.KweekBrowserOllama.inspect(model);
                if (button.isConnected && panel.querySelector('#ai-provider').value === 'ollama') {
                    say('ollama-test-status', connection.message, panel);
                    say('ai-provider-status', connection.message, panel);
                    if (!connection.modelAvailable) appendOllamaHelp(panel.querySelector('#ollama-test-status'), { code: 'OLLAMA_MODEL_MISSING' });
                }
                updateDashboardProvider(); return;
            }
            config = await request('ai-config');
            if (!button.isConnected || panel.querySelector('#ai-provider').value !== 'ollama') return;
            const connection = config.providers?.ollama?.connection;
            const state = connection?.state;
            const normalized = value => value.includes(':') ? value : value + ':latest';
            const present = connection?.installedModels?.some(name => normalized(name) === normalized(model));
            const message = state === 'reachable' ? present ? `Verbonden. ${model} is beschikbaar. Er is geen AI-vraag verstuurd.` : `Ollama draait, maar ${model} is niet gedownload. Download dat model of kies een geïnstalleerd model.`
                : state === 'invalid-config' ? 'Het Ollama-adres in de backend is ongeldig. Controleer de configuratie.'
                : state === 'unconfigured' ? 'Ollama is niet ingesteld op de online backend. Gebruik de lokale app voor Ollama op je computer.'
                : state === 'unreachable' ? 'Ollama is niet bereikbaar vanaf de backend. Start Ollama en test opnieuw; controleer ook het adres en de firewall.'
                : 'De backend kan de Ollama-verbinding niet controleren. Start de lokale app met npm start.';
            say('ollama-test-status', message, panel);
            say('ollama-route-note', connection?.runtime === 'hosted' ? 'Online loopt deze test op Netlify. Jouw localhost is daar niet bereikbaar; CORS of browsertoestemming verandert dat niet.' : 'Getest via de lokale KweekKompas-backend, met alleen de modellenlijst.', panel);
        } catch (error) {
            say('ollama-test-status', error.code ? error.message : 'De KweekKompas-backend is niet bereikbaar. Start de lokale app met npm start en probeer opnieuw.', panel);
            appendOllamaHelp(panel.querySelector('#ollama-test-status'), error);
            if (window.KweekBrowserOllama?.direct) { say('ai-provider-status', error.message, panel); updateDashboardProvider(); }
        }
        finally { if (button.isConnected) button.disabled = false; }
    }
    function displayAccount(panel, configured) {
        say('cloud-account-name', user ? user.email : 'Je werkt lokaal', panel);
        panel.querySelector('#cloud-open-account').hidden = Boolean(user) && !recovery;
        panel.querySelector('#cloud-actions').hidden = !user || recovery;
        say('cloud-status', !configured ? 'Accountservice niet beschikbaar. Je tuin blijft lokaal bewaard.' : recovery ? 'Stel je nieuwe wachtwoord in via de accountpopup.' : user ? 'Cloudstatus laden…' : '', panel);
        panel.querySelector('#cloud-conflict-actions').hidden = !hasConflict() || !user || recovery;
        updateLocalStatus(panel); renderAutoUI(panel);
    }
    function renderAuthMode(panel) {
        const descriptions = {
            login: ['Inloggen', 'Gebruik je bestaande KweekKompas-account.'],
            signup: ['Account aanmaken', 'Gebruik een wachtwoord van minimaal 8 tekens.'],
            reset: ['Wachtwoord vergeten', 'Vul je e-mailadres in om een herstelmail aan te vragen.'],
            resend: ['Bevestigingsmail opnieuw sturen', 'Vul je e-mailadres in om opnieuw een bevestigingsmail aan te vragen.'],
            password: ['Nieuw wachtwoord instellen', 'Kies een nieuw wachtwoord en herhaal het hieronder.']
        };
        say('cloud-form-title', descriptions[authMode][0], panel);
        say('cloud-form-description', descriptions[authMode][1], panel);
        panel.querySelectorAll('[data-auth-mode]').forEach(button => {
            const active = button.dataset.authMode === authMode;

            button.classList.toggle('active', active);
        });
        panel.querySelector('#account-tabs').hidden = authMode === 'password';
        panel.querySelector('#account-forgot').hidden = !['login', 'signup'].includes(authMode);
        panel.querySelector('#account-resend').hidden = !confirmationPending || authMode === 'password';
        panel.querySelectorAll('[role="tab"]').forEach(button => {
            const active = button.dataset.authMode === (authMode === 'signup' ? 'signup' : 'login');
            button.setAttribute('aria-selected', String(active)); button.tabIndex = active ? 0 : -1;
        });
        const password = panel.querySelector('#cloud-password');
        const needsPassword = ['login', 'signup', 'password'].includes(authMode);
        password.closest('label').hidden = !needsPassword; password.disabled = !needsPassword;
        password.required = needsPassword; password.minLength = authMode === 'login' ? 1 : 8;
        password.autocomplete = authMode === 'login' ? 'current-password' : 'new-password';
        password.closest('label').querySelector('span').textContent = authMode === 'password' ? 'Nieuw wachtwoord (minimaal 8 tekens)' : authMode === 'signup' ? 'Wachtwoord (minimaal 8 tekens)' : 'Wachtwoord';
        panel.querySelector('#cloud-email').closest('label').hidden = authMode === 'password';
        panel.querySelector('#cloud-email').disabled = authMode === 'password';
        const confirm = panel.querySelector('#cloud-password-confirm');
        confirm.disabled = authMode !== 'password'; confirm.required = authMode === 'password';
        panel.querySelector('#cloud-password-confirm-field').hidden = authMode !== 'password';
        panel.querySelector('#cloud-auth-submit').textContent = { login: 'Inloggen', signup: 'Registratie verzenden', reset: 'Herstelmail sturen', resend: 'Bevestigingsmail sturen', password: 'Nieuw wachtwoord opslaan' }[authMode];
    }
    function validateAuthForm(panel) {
        const email = panel.querySelector('#cloud-email');
        const password = panel.querySelector('#cloud-password');
        const repeat = panel.querySelector('#cloud-password-confirm');
        panel.querySelectorAll('#cloud-login-form input').forEach(input => input.removeAttribute('aria-invalid'));
        const fail = (input, message) => {
            input.setAttribute('aria-invalid', 'true');
            authMessage = message;
            say('cloud-auth-status', message, panel); input.focus(); return false;
        };
        if (!email.disabled && !email.value.trim()) return fail(email, 'Vul je e-mailadres in voordat je verzendt.');
        if (!email.disabled && email.validity.typeMismatch) return fail(email, 'Vul een geldig e-mailadres in.');
        if (!password.disabled && !password.value) return fail(password, 'Vul je wachtwoord in voordat je verzendt.');
        if (!password.disabled && password.value.length < password.minLength) return fail(password, `Gebruik een wachtwoord van minimaal ${password.minLength} tekens.`);
        if (!repeat.disabled && !repeat.value) return fail(repeat, 'Herhaal je nieuwe wachtwoord.');
        if (!repeat.disabled && password.value !== repeat.value) return fail(repeat, 'De twee wachtwoorden zijn niet gelijk.');
        return true;
    }
    async function readCloud(panel) {
        cloud = null;
        const data = await request('cloud-sync');
        if (data.userId !== user?.id) throw new Error('Het account is gewijzigd. Open Instellingen opnieuw.');
        cloud = data.snapshot || { revision: 0 };
        say('cloud-status', `${cloud.revision ? `Cloudkopie versie ${cloud.revision}, bijgewerkt op ${new Date(cloud.updated_at).toLocaleString('nl-NL')}.` : 'Nog geen cloudkopie.'}`, panel);
        const saved = lastSync();
        if (!auto.state()?.enabled || auto.state()?.paused) {
            if ((saved && cloud.revision !== saved.revision) || hasConflict()) showConflict(panel);
        }
        await updateLocalStatus(panel);
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
        if (kind === 'logout') {
            auto.pause('account'); auto.setAccount(null);
            // Aborting an active upload rejects its promise. That expected
            // cancellation must not prevent the logout request from running.
            // Photo-upload also wraps network aborts in an ordinary Error.
            // This job was explicitly cancelled; none of its failures block logout.
            await auto.idle().catch(() => {});
        }
        else if (['upload', 'download', 'replace', 'recover'].includes(kind)) { if (auto.state()?.enabled && !auto.state()?.paused) auto.pause('manual'); else auto.cancel(); await auto.idle(); }
        const result = await cloudLock(() => actionUnlocked(kind, panel));
        if (result === false) say('cloud-error-detail', 'Er loopt al een synchronisatie in een ander tabblad. Probeer straks opnieuw.', panel);
    }
    async function actionUnlocked(kind, panel) {
        if (!user && kind !== 'recover' && kind !== 'logout') {
            openAccountPopup('login', { section: 'cloud', action: kind });
            return;
        }
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
                accountVersion++;
                await request('auth', { action: 'logout' }); user = null; cloud = null; conflictAccount = null; recovery = false; authMode = 'login'; authMessage = 'Uitgelogd. Je lokale tuin is behouden.'; displayAccount(panel, true);
            } else if (kind === 'status') await readCloud(panel);
            else if (kind === 'upload' || kind === 'replace') {
                if (kind === 'upload') await readCloud(panel);
                if (!user || !cloud) throw new Error('Lees eerst de cloudstatus.');
                const accountId = user.id;
                const saved = lastSync(accountId);
                if (kind === 'upload' && (hasConflict(accountId) || (saved && saved.revision !== cloud.revision))) { showConflict(panel); return; }
                if (kind === 'replace') {
                    if (!hasConflict(accountId)) throw new Error('Lees eerst de cloudstatus en kies bij een conflict welke tuin je wilt bewaren.');
                    await readCloud(panel); // Read before explicit destructive choice; CAS still protects this revision.
                }
                const owner = localStorage.getItem(OWNER_KEY);
                const warning = (['example', 'import'].includes(auto.state()?.paused) ? 'Ook geïmporteerde gegevens en voorbeelden in deze lokale tuin gaan bewust mee.\n\n' : '') + (owner && owner !== user.id ? 'Deze lokale tuin is aan een ander account gekoppeld. Kopieer deze tuin bewust naar dit account?\n\n' : '');
                const payload = window.KweekLocalData.validateCloud(await window.KweekLocalData.captureCloud());
                window.KweekCloudData.assertSize(window.KweekPhotoStorage.estimate(payload, accountId).payload);
                if (!confirm(`${warning}${kind === 'replace' ? 'Je kiest bewust je lokale tuin boven de gewijzigde cloudkopie.\n\n' : ''}De lokale tuin opslaan voor ${user.email}? ${cloud.revision ? `De bestaande cloudkopie (versie ${cloud.revision}) wordt vervangen.` : 'Je maakt een nieuwe cloudkopie.'} Planten, foto’s, favorieten, kalender, planning, verlanglijst en tuinprofiel gaan mee. Foto’s worden voor upload zo nodig verkleind naar maximaal 1600 pixels en 1 MB; lokale originelen blijven behouden. Apparaatinstellingen blijven lokaal.`)) return;
                const revision = cloud.revision;
                say('cloud-status', 'Foto’s voorbereiden voor private opslag…', panel);
                const prepared = await window.KweekPhotoStorage.prepare(payload, accountId);
                const cloudPayload = await window.KweekPhotoStorage.upload(prepared, accountId, request, message => say('cloud-status', message, panel));
                window.KweekCloudData.assertSize(cloudPayload);
                say('cloud-status', 'Foto’s beschikbaar. Cloudkopie opslaan…', panel);
                const result = await request('cloud-sync', { payload: cloudPayload, revision, expectedUserId: accountId });
                if (result.userId !== accountId || user?.id !== accountId) throw new Error('Het account is gewijzigd.');
                localStorage.setItem(OWNER_KEY, accountId); cloud = result;
                await recordSync(result, payload, 'upload', accountId); await auto.manualBaseline(result, payload, 'upload', accountId);
                conflictAccount = null; panel.querySelector('#cloud-conflict-actions').hidden = true;
                say('cloud-status', `Cloudkopie versie ${result.revision} opgeslagen voor ${user.email}.`, panel);
                await updateLocalStatus(panel);
            } else if (kind === 'download') {
                if (!user) throw new Error('Log eerst in.');
                await readCloud(panel);
                if (!cloud.payload) throw new Error('Er staat nog geen tuin in de cloud.');
                const accountId = user.id;
                let selected = window.KweekLocalData.validateCloud(cloud.payload);
                if (!confirm(`De cloudtuin van ${user.email} (versie ${cloud.revision}) naar dit apparaat halen? De tuingegevens in deze kopie worden vervangen; apparaatinstellingen blijven lokaal. Eerst wordt een veiligheidskopie gemaakt.`)) return;
                const before = await window.KweekLocalData.capture();
                const beforeHash = await fingerprint(window.KweekCloudData.select(before));
                selected = window.KweekLocalData.validateCloud(await window.KweekPhotoStorage.hydrate(selected, accountId, request, message => say('cloud-status', message, panel)));
                await safetyBackup({ payload: before, owner: localStorage.getItem(OWNER_KEY), savedAt: new Date().toISOString() });
                if (beforeHash !== await fingerprint(await window.KweekLocalData.captureCloud())) throw new Error('De lokale tuin is intussen gewijzigd. Er is niets vervangen. Probeer het terughalen opnieuw.');
                if (user?.id !== accountId) throw new Error('Het account is gewijzigd. Er is niets vervangen.');
                await window.KweekLocalData.restoreCloud(selected);
                localStorage.setItem(OWNER_KEY, user.id);
                const restoredPayload = await window.KweekLocalData.captureCloud();
                await recordSync(cloud, restoredPayload, 'download', accountId); await auto.manualBaseline(cloud, restoredPayload, 'download', accountId);
                conflictAccount = null;
                location.reload();
            }
        } catch (error) {
            if (kind === 'recover') say('cloud-recover-status', error.message, panel);
            if (error.status === 409 && user) showConflict(panel);
            else say('cloud-status', error.name === 'BackupValidationError' ? 'De cloudkopie bevat ongeldige tuingegevens. Je lokale gegevens zijn niet vervangen.' : error.name === 'TypeError' ? 'Geen verbinding. De actie is niet afgerond; je lokale tuin blijft volledig behouden.' : error.message, panel);
            await updateLocalStatus(panel);
        }
        finally { busy = false; panel.querySelectorAll('#settings-section-cloud button').forEach(button => { button.disabled = false; }); updateLocalStatus(panel); }
    }
    const ACCOUNT_CHOICE = 'kweekkompas_account_choice';
    let confirmationPending = false;
    let accountReturn = null;
    let accountDialog = null;
    function closeAccount(returnToSettings = false) {
        if (!accountDialog?.open) return;
        accountDialog.close();
        if (returnToSettings && accountReturn) {
            const target = accountReturn;
            window.openSettingsSection?.(target.section);
            setTimeout(() => document.querySelector(target.action ? '[data-cloud-action="' + target.action + '"]' : '#cloud-open-account:not([hidden]), #settings-section-cloud')?.focus({ preventScroll: true }), 50);
        }
        accountReturn = null;
    }
    function ensureAccountPopup() {
        if (accountDialog) return accountDialog;
        const panel = document.createElement('dialog');
        panel.id = 'account-popup'; panel.setAttribute('aria-labelledby', 'account-title');
        panel.innerHTML = `<div class="account-popup-header"><h2 id="account-title">KweekKompas account</h2><button type="button" id="account-close" aria-label="Accountpopup sluiten">×</button></div>
<div id="account-choice"><p>Hoe wil je beginnen?</p><div class="account-choice-actions"><button class="settings-primary-button" type="button" data-start-mode="login">Inloggen</button><button class="settings-secondary-button" type="button" data-start-mode="signup">Account aanmaken</button><button class="account-link" type="button" id="account-local">Lokaal doorgaan</button></div></div>
<div id="account-form-area" hidden><div id="account-tabs" role="tablist" aria-label="Account"><button type="button" role="tab" aria-controls="account-form-content" data-auth-mode="login">Inloggen</button><button type="button" role="tab" aria-controls="account-form-content" data-auth-mode="signup">Registreren</button></div>
<div id="account-form-content"><h3 id="cloud-form-title">Inloggen</h3><p id="cloud-form-description" class="service-note"></p>
<form id="cloud-login-form" class="service-form" novalidate aria-labelledby="cloud-form-title" aria-describedby="cloud-auth-status"><label class="settings-field"><span>E-mailadres</span><input id="cloud-email" type="email" required autocomplete="username"></label><label class="settings-field"><span>Wachtwoord</span><input id="cloud-password" type="password" required autocomplete="current-password"></label><label class="settings-field" id="cloud-password-confirm-field" hidden><span>Herhaal nieuw wachtwoord</span><input id="cloud-password-confirm" type="password" autocomplete="new-password" disabled></label><p id="cloud-auth-status" class="service-status" role="status" aria-live="polite"></p><button class="settings-primary-button" type="submit" id="cloud-auth-submit">Inloggen</button></form></div>
<div class="account-links"><button type="button" id="account-forgot" class="account-link" data-auth-mode="reset">Wachtwoord vergeten</button><button type="button" id="account-resend" class="account-link" data-auth-mode="resend" hidden>Bevestigingsmail opnieuw sturen</button></div><button class="account-link account-return" type="button" id="cloud-return">Terug naar KweekKompas</button></div>`;
        document.body.append(panel); accountDialog = panel;
        panel.querySelector('#account-local').onclick = () => { sessionStorage.setItem(ACCOUNT_CHOICE, 'local'); closeAccount(); };
        panel.querySelector('#account-close').onclick = () => { sessionStorage.setItem(ACCOUNT_CHOICE, 'chosen'); closeAccount(true); };
        panel.addEventListener('cancel', event => { event.preventDefault(); sessionStorage.setItem(ACCOUNT_CHOICE, 'chosen'); closeAccount(true); });
        panel.querySelector('#cloud-return').onclick = () => closeAccount(true);
        panel.querySelectorAll('[data-start-mode]').forEach(button => button.onclick = () => openAccountPopup(button.dataset.startMode));
        panel.querySelectorAll('[data-auth-mode]').forEach(button => {
            button.onclick = () => {
                authMode = button.dataset.authMode; authMessage = ''; renderAuthMode(panel);
                panel.querySelector('#cloud-password').value = ''; panel.querySelector('#cloud-password-confirm').value = '';
                panel.querySelectorAll('input').forEach(input => input.removeAttribute('aria-invalid'));
                say('cloud-auth-status', '', panel);
            };
            if (button.getAttribute('role') === 'tab') button.onkeydown = event => {
                if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
                event.preventDefault(); const tabs = [...panel.querySelectorAll('[role="tab"]')];
                const next = event.key === 'Home' ? tabs[0] : event.key === 'End' ? tabs[1] : tabs.find(tab => tab !== button);
                next.click(); next.focus();
            };
        });
        panel.querySelector('#cloud-login-form').onsubmit = async event => {
            event.preventDefault();
            if (busy) return say('cloud-auth-status', 'Een aanvraag loopt nog. Wacht op de melding voordat je opnieuw verzendt.', panel);
            if (!validateAuthForm(panel)) return;
            busy = true;
            const button = event.target.querySelector('button'); button.disabled = true;
            const passwordInput = panel.querySelector('#cloud-password');
            const password = passwordInput.value; passwordInput.value = '';
            panel.querySelector('#cloud-password-confirm').value = '';
            try {
                const mode = authMode;
                accountVersion++; auto.setAccount(null);
                authMessage = 'Aanvraag wordt verstuurd…';
                say('cloud-auth-status', authMessage, panel);
                const data = await request('auth', { action: mode, email: panel.querySelector('#cloud-email').value.trim(), ...(['login', 'signup', 'password'].includes(mode) ? { password } : {}) });
                authMessage = data.message || (mode === 'password' ? 'Je nieuwe wachtwoord is opgeslagen. Je lokale tuin is behouden.' : 'Ingelogd. Je lokale tuin is behouden.');
                if (data.user) { user = data.user; recovery = false; auto.setAccount(user.id, true); authMode = 'login'; cloud = null; confirmationPending = false; closeAccount(true); }
                if (mode === 'signup' && !data.user) confirmationPending = true;
                renderAuthMode(panel);
                say('cloud-auth-status', authMessage, panel);
            } catch (error) { authMessage = error.message; if (/bevestig|confirmation/i.test(authMessage)) confirmationPending = true; renderAuthMode(panel); say('cloud-auth-status', authMessage, panel); }
            finally { busy = false; button.disabled = false; }
        };
        return panel;
    }
    function openAccountPopup(mode = 'login', target = null) {
        const panel = ensureAccountPopup();
        if (target) accountReturn = target;
        else if (document.querySelector('.settings-panel.open')) accountReturn = { section: 'cloud' };
        if (document.querySelector('.settings-panel.open')) window.toggleSettingsPanel_REPAIR_V131?.();
        const choice = mode === 'choice';
        panel.querySelector('#account-choice').hidden = !choice;
        panel.querySelector('#account-form-area').hidden = choice;
        if (!choice) { sessionStorage.setItem(ACCOUNT_CHOICE, 'chosen'); authMode = recovery ? 'password' : mode; renderAuthMode(panel); say('cloud-auth-status', authMessage, panel); }
        if (!panel.open) panel.showModal();
        (choice ? panel.querySelector('[data-start-mode="login"]') : panel.querySelector(authMode === 'password' ? '#cloud-password' : '#cloud-email')).focus();
    }
    async function startAccountChoice() {
        await callbackPromise;
        try {
            const version = accountVersion;
            const data = await request('auth');
            if (version !== accountVersion) return;
            user = data.user; recovery = Boolean(data.recovery); auto.setAccount(recovery ? null : user?.id);
            if (recovery) openAccountPopup('password');
            else if (!user && !sessionStorage.getItem(ACCOUNT_CHOICE) && !accountDialog?.open) openAccountPopup('choice');
        } catch (error) { console.warn('Accountstart:', error.message); /* Local use remains available when account service is offline. */ }
    }
    if (document.readyState === 'loading') window.addEventListener('DOMContentLoaded', startAccountChoice, { once: true });
    else startAccountChoice();
    async function mount(panel) {
        readPreferences();
        const providerInput = panel.querySelector('#ai-provider');
        if (!providerInput) return;
        const profileConsent = panel.querySelector('#ai-profile-consent');
        profileConsent.checked = localStorage.getItem(PROFILE_AI_CONSENT_KEY) === 'true';
        profileConsent.onchange = () => {
            try { localStorage.setItem(PROFILE_AI_CONSENT_KEY, String(profileConsent.checked)); }
            catch { profileConsent.checked = false; say('ai-save-status', 'Deze keuze kon niet worden opgeslagen.', panel); }
        };
        panel.querySelector('#ollama-test').onclick = () => testOllama(panel);
        panel.querySelector('#chatgpt-login').onclick = () => chatGPTAction(panel, 'login');
        panel.querySelector('#chatgpt-other-account').onclick = () => chatGPTAction(panel, 'login', true);
        panel.querySelector('#chatgpt-logout').onclick = () => chatGPTAction(panel, 'logout');
        panel.querySelector('#chatgpt-cancel').onclick = () => chatGPTAction(panel, 'cancel');
        panel.querySelector('#chatgpt-reload').onclick = () => loadChatGPT(panel);
        panel.querySelector('#chatgpt-acknowledge').onclick = () => chatGPTAction(panel, 'acknowledge');
        panel.querySelector('#ai-chatgpt-model').onchange = () => { panel.querySelector('#ai-settings-form button[type="submit"]').disabled = !panel.querySelector('#ai-chatgpt-model').value; };
        panel.querySelector('#custom-api-save').onclick = () => customAPIAction(panel, 'save');
        panel.querySelector('#custom-api-delete').onclick = () => customAPIAction(panel, 'delete-key');
        panel.querySelector('#custom-api-test').onclick = () => customAPIAction(panel, 'test');
        providerInput.value = prefs.provider;
        panel.querySelector('#ai-model').value = prefs.model || '';
        if (config || providerInput.value !== 'gemini') updateModel(panel, true);
        else renderGeminiModel(panel);
        providerInput.onchange = () => updateModel(panel, true);
        panel.querySelector('#ai-settings-form').onsubmit = event => {
            event.preventDefault();
            const provider = providerInput.value;
            if (provider === 'openai-compatible') { customAPIAction(panel, 'save'); return; }
            if (!providers.includes(provider)) return;
            const model = panel.querySelector(provider === 'gemini' ? '#ai-gemini-model' : provider === 'chatgpt' ? '#ai-chatgpt-model' : '#ai-model').value.trim();
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
        panel.querySelector('#cloud-auto-sync').onchange = event => { if (event.target.checked) auto.enable(); else auto.disable(); };
        panel.querySelectorAll('[data-auto-choice]').forEach(button => button.onclick = () => auto.choose(button.dataset.autoChoice));
        auto.status();
        panel.querySelector('#cloud-open-account').onclick = () => openAccountPopup(recovery ? 'password' : 'login', { section: 'cloud' });
        panel.querySelectorAll('[data-cloud-action]').forEach(button => { button.onclick = () => action(button.dataset.cloudAction, panel); });
        // Reuse the known account layout while refreshing it. Otherwise a theme
        // rerender briefly shows the local/login layout and shifts the drawer.
        if (user) displayAccount(panel, true);
        // Account status must remain usable even when another settings request stalls.
        const accountPromise = (async () => {
            try {
                await callbackPromise;
                const version = accountVersion;
                const data = await request('auth');
                if (version !== accountVersion) return;
                if (!providerInput.isConnected) return;
                if (typeof data.configured !== 'boolean') throw new Error('Cloudconfiguratie kon niet worden gelezen. Je lokale tuin blijft beschikbaar.');
                user = data.user; recovery = Boolean(data.recovery); auto.setAccount(recovery ? null : user?.id); if (recovery) authMode = 'password'; cloud = null; displayAccount(panel, data.configured);
                if (user && !recovery) { try { await readCloud(panel); } catch (error) { say('cloud-status', `Je bent ingelogd. ${error.message}`, panel); } }
            } catch (error) { say('cloud-status', error.message, panel); }
        })();
        try {
            configPromise ||= request('ai-config').then(value => { config = value; });
            await configPromise;
            updateDashboardProvider();
            if (!providerInput.isConnected) return;
            // Backend defaults never override the device's explicit choice.
            readPreferences();
            providerInput.value = prefs.provider;
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
                input.value = prefs.provider;
                panel.querySelector('#ai-model').value = prefs.model || config?.providers?.[input.value]?.model || '';
                updateModel(panel, true);
            }
        }
    });
    document.addEventListener('click', async event => {
        if (event.target.closest('[data-ollama-help]')) openLocalHelp();
        const copy = event.target.closest('[data-ollama-copy]');
        if (!copy) return;
        const widget = copy.closest('.ollama-command'), input = widget.querySelector('input'), status = widget.querySelector('.ollama-copy-status');
        try { await navigator.clipboard.writeText(input.value); status.textContent = 'Commando gekopieerd.'; }
        catch { input.focus(); input.select(); status.textContent = 'Commando geselecteerd. Kopieer met Ctrl+C of via het selectiemenu.'; }
    });
    async function requestAI(route, body) {
        const choice = readPreferences();
        const useProfile = localStorage.getItem(PROFILE_AI_CONSENT_KEY) === 'true' &&
            (route === 'seed-info' || route === 'tuinassistent' || route === 'gemini-ai' && ['fill_seed_info', 'garden_assistant'].includes(body?.mode));
        const profile = useProfile ? window.userProfile : null;
        const shortText = value => typeof value === 'string' ? value.trim().slice(0, 120) : '';
        const gardenContext = profile ? {
            climate: shortText(profile.climate),
            light: shortText(profile.light),
            gardenType: shortText(profile.gardenType),
            gardenPlaces: Array.isArray(profile.gardenPlaces) ? profile.gardenPlaces.filter(value => typeof value === 'string').slice(0, 5).map(shortText) : [],
            experience: shortText(profile.experience)
        } : null;
        const aiBody = gardenContext ? { ...body, gardenContext } : body;
        try {
            if (choice.provider === 'ollama' && window.KweekBrowserOllama?.direct) {
                try { return await window.KweekBrowserOllama.generate(route, aiBody, choice.model || 'llama3:latest'); }
                finally { updateDashboardProvider(); }
            }
            return await request(route, { ...aiBody, ai: choice });
        }
        catch (error) {
            if (choice.provider === 'ollama') {
                if (!error.status && !error.code) error.code = 'OLLAMA_BACKEND_UNREACHABLE';
                const messages = { OLLAMA_UNREACHABLE: 'Lokale AI is niet bereikbaar. Start Ollama en controleer de verbinding.', OLLAMA_MODEL_MISSING: 'Het gekozen Ollama-model is niet gedownload.', OLLAMA_UNCONFIGURED: 'Ollama is niet ingesteld op deze backend. Gebruik de lokale app voor Ollama op je computer.', OLLAMA_BACKEND_UNREACHABLE: 'De KweekKompas-backend is niet bereikbaar. Start de lokale app.' };
                if (messages[error.code]) error.message = messages[error.code];
            }
            throw error;
        }
    }
    window.KweekServices = { settingsHTML, localHelpHTML, openLocalHelp, appendOllamaHelp, mount, removeSafetyBackup, updateDashboardProvider, requestAI };
})();
