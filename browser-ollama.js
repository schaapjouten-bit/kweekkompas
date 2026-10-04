/* Direct online connection: fixed loopback address, no credentials or fallback. */
(() => {
    const base = 'http://127.0.0.1:11434';
    const direct = location.protocol === 'https:' && !['localhost', '127.0.0.1', '[::1]'].includes(location.hostname);
    let state = { runtime: 'browser', state: 'unchecked', installedModels: [], message: 'Nog niet getest. Ollama moet op deze computer draaien.' };
    const failure = (code, message) => Object.assign(new Error(message), { code });
    async function permissionState() {
        for (const name of ['loopback-network', 'local-network-access']) {
            try { return (await navigator.permissions.query({ name })).state; }
            catch { /* Browser versions use different descriptors or expose none. */ }
        }
        return 'unknown';
    }
    async function request(path, options = {}, timeout = 6000) {
        if (await permissionState() === 'denied') throw failure('OLLAMA_BROWSER_PERMISSION_DENIED', 'Lokale-netwerktoegang is geweigerd. Sta die voor KweekKompas toe in de site-instellingen van je browser.');
        let response;
        try {
            response = await fetch(base + path, { ...options, mode: 'cors', credentials: 'omit', referrerPolicy: 'no-referrer', redirect: 'error', signal: AbortSignal.timeout(timeout) });
        } catch (error) {
            if (await permissionState() === 'denied') throw failure('OLLAMA_BROWSER_PERMISSION_DENIED', 'Lokale-netwerktoegang is geweigerd. Sta die voor KweekKompas toe in de site-instellingen van je browser.');
            if (error.name === 'TimeoutError') throw failure('OLLAMA_BROWSER_TIMEOUT', 'Ollama reageert te langzaam of is niet bereikbaar. Start Ollama op deze computer en controleer de verbinding.');
            if (error.name === 'SecurityError') throw failure('OLLAMA_BROWSER_SECURITY', 'De browser blokkeert HTTPS naar lokale HTTP. Bekijk de installatiehulp en de melding in de browserconsole.');
            // Fetch deliberately hides whether this is CORS or an unavailable
            // service. Do not claim a stopped server or CORS failure as fact.
            throw failure('OLLAMA_BROWSER_BLOCKED', 'Ollama niet bereikt: controleer of het draait, OLLAMA_ORIGINS en lokale-netwerkrechten. De browser maakt CORS en een verbindingsfout niet afzonderlijk zichtbaar.');
        }
        if (!response.ok) {
            if (response.status === 403) throw failure('OLLAMA_BROWSER_ORIGIN_DENIED', 'Ollama weigert toegang. Voeg de exacte site-origin toe aan OLLAMA_ORIGINS en start Ollama volledig opnieuw.');
            if (response.status === 404) {
                const data = await response.json().catch(() => ({}));
                if (/model.*not found/i.test(data.error || '')) throw failure('OLLAMA_MODEL_MISSING', 'Het gekozen Ollama-model is niet gedownload.');
            }
            throw failure('OLLAMA_BROWSER_RESPONSE', `Ollama weigert de aanvraag (${response.status}). Controleer het gekozen model via Verbinding testen.`);
        }
        try { return await response.json(); }
        catch { throw failure('OLLAMA_INVALID_ANSWER', 'Ollama gaf geen geldig antwoord. Controleer het model en probeer opnieuw.'); }
    }
    async function inspect(model) {
        try {
            const data = await request('/api/tags');
            if (!Array.isArray(data.models)) throw failure('OLLAMA_INVALID_ANSWER', 'Ollama gaf geen geldige modellenlijst.');
            const installedModels = data.models.map(item => item?.name).filter(name => typeof name === 'string' && /^[a-zA-Z0-9][a-zA-Z0-9_.:/-]{0,159}$/.test(name));
            const normalized = value => value.includes(':') ? value : value + ':latest';
            const present = installedModels.some(name => normalized(name) === normalized(model));
            state = { runtime: 'browser', state: 'reachable', installedModels, modelAvailable: present, message: present ? `Verbonden met Ollama op deze computer. ${model} is beschikbaar. Geen AI-vraag verstuurd.` : `Ollama draait, maar ${model} is niet gedownload. Download dat model of kies een geïnstalleerd model.` };
            return { ...state };
        } catch (error) { state = { ...state, state: 'blocked', message: error.message, installedModels: [] }; throw error; }
    }
    async function generate(route, body, model) {
        if (!/^[a-zA-Z0-9][a-zA-Z0-9_.:/-]{0,159}$/.test(model)) throw failure('OLLAMA_MODEL_MISSING', 'Kies een geldige modelnaam bij Instellingen → AI.');
        const { system, prompt } = window.KweekAIContract.build(route, body);
        try {
            const data = await request('/api/generate', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ model, system, prompt, format: 'json', stream: false }) }, 120000);
            const result = window.KweekAIContract.validate(route, window.KweekAIContract.parse(data.response), body);
            state = { ...state, state: 'reachable', message: 'Ollama heeft rechtstreeks op deze computer geantwoord.' };
            return window.KweekAIContract.format(route, result, body);
        } catch (error) {
            error.code ||= 'OLLAMA_INVALID_ANSWER';
            const connected = ['OLLAMA_INVALID_ANSWER', 'OLLAMA_MODEL_MISSING', 'OLLAMA_BROWSER_RESPONSE'].includes(error.code);
            state = { ...state, state: connected ? 'reachable' : 'blocked', message: connected ? 'Ollama is bereikt, maar de aanvraag is niet gelukt: ' + error.message : error.message };
            throw error;
        }
    }
    window.KweekBrowserOllama = { direct, inspect, generate, status: () => ({ ...state }) };
})();
