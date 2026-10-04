/* Durable device queue. Garden payloads remain in the app's existing local stores. */
(function(root) {
    const PREFIX = 'kweekkompas_auto_', GUARD = 'kweekkompas_auto_guard';
    const create = (io, options = {}) => {
        const debounce = options.debounce ?? 1800, backoff = options.backoff ?? [2000, 5000, 15000, 30000, 60000];
        const now = io.now || Date.now;
        let account = null, session = 0, running = null, runningSession = null, requireActive = false, controller = null, timer = null, message = '', fatal = false;
        const read = id => {
            const raw = io.storage.getItem(PREFIX + id);
            const value = raw ? JSON.parse(raw) : {};
            return { enabled: false, paused: null, counter: 0, done: 0, retries: 0, basis: null, guard: null, resolving: false, ...value };
        };
        const guard = () => io.storage.getItem(GUARD);
        const write = (id, value) => { try { io.storage.setItem(PREFIX + id, JSON.stringify(value)); } catch (error) { fatal = true; cancel(); message = 'Wachtrij bewaren lukt niet. Synchroniseer handmatig.'; throw error; } };
        const emit = () => {
            let state;
            try { state = account ? read(account) : null; } catch { fatal = true; }
            io.status({ account, state, message, busy: !!running, fatal, text: running && runningSession === session ? 'Synchroniseren…' : state?.paused === 'conflict' ? 'Conflict — kies een versie' : state?.paused === 'offline' || state?.retries ? 'Offline — wijzigingen wachten' : state?.enabled && !state.paused && state.basis && state.counter === state.done ? 'Gesynchroniseerd' : 'Opgeslagen op dit apparaat' });
        };
        const cancel = () => { session++; clearTimeout(timer); controller?.abort(); };
        const check = (id, token, signal, stamp) => {
            if (account !== id || token !== session || signal.aborted || (stamp !== undefined && guard() !== stamp)) throw Object.assign(new Error('Synchronisatie gestopt; lokale gegevens blijven bewaard.'), { name: 'AbortError' });
            if (requireActive) {
                const state = read(id);
                if (!state.enabled || state.paused || io.owner() !== id) throw Object.assign(new Error('Synchronisatie gepauzeerd op dit apparaat.'), { name: 'AbortError' });
            }
        };
        const schedule = (delay = debounce) => { clearTimeout(timer); if (account && !fatal) timer = setTimeout(() => tick(), delay); };
        const pause = reason => { cancel(); if (account) { const s = read(account); s.paused = reason; write(account, s); } emit(); };
        function setAccount(id, explicitLogin = false) {
            if (id === account && !explicitLogin) return;
            const previous = account;
            cancel();
            if (previous && previous !== id) { const s = read(previous); s.paused = 'account'; write(previous, s); }
            account = id || null; message = '';
            io.choice(false);
            if (account) {
                const s = read(account);
                if (s.paused === 'offline' && (io.online?.() ?? true)) { s.paused = null; s.retries = 0; s.nextAttemptAt = 0; write(account, s); }
                if (explicitLogin || s.guard !== guard()) { s.paused = s.paused || 'account'; write(account, s); }
                if (s.enabled && !s.paused && s.guard === guard()) schedule();
            }
            emit();
        }
        function external(reason) {
            cancel();
            io.storage.setItem(GUARD, JSON.stringify({ reason, nonce: io.nonce() }));
            if (account) { const s = read(account); s.paused = reason; write(account, s); }
            message = reason === 'example' ? 'Voorbeelden geladen. Kies bewust welke tuin je verder wilt synchroniseren.' : 'Gegevens teruggezet. Kies bewust welke tuin je verder wilt synchroniseren.';
            emit();
        }
        function changed() {
            if (!account) { external('account'); return; }
            // All tabs share the garden. An edit under another account must also
            // invalidate the previous owner's queue, including an active upload.
            if (io.owner() !== account) external('account');
            const s = read(account);
            if (s.guard !== guard() || io.owner() !== account) s.paused = s.paused || 'account';
            s.counter++; s.retries = 0; write(account, s);
            if (s.enabled && !s.paused) schedule(); emit();
        }
        async function exclusive(job, active = false) {
            if (running) return false;
            controller = new AbortController();
            const id = account, token = session, signal = controller.signal;
            runningSession = token;
            requireActive = active;
            running = Promise.resolve().then(() => io.lock(async () => { check(id, token, signal); return job(id, token, signal); }));
            emit();
            try { return await running; }
            catch (error) { if (signal.aborted || account !== id || session !== token) throw Object.assign(new Error('Gestopt'), { name: 'AbortError' }); throw error; }
            finally { running = null; runningSession = null; requireActive = false; controller = null; emit(); }
        }
        const remoteFor = async (id, token, signal, stamp) => { check(id, token, signal, stamp); const value = await io.remote(id, signal); check(id, token, signal, stamp); return value; };
        async function applyRemote(remote, id, token, signal, explicit = false, expected) {
            const stamp = guard(), counter = expected?.counter ?? read(id).counter;
            const before = await io.capture(), hash = expected?.hash ?? await io.hash(before);
            const payload = await io.hydrate(remote.payload, id, signal);
            check(id, token, signal, stamp);
            if (read(id).counter !== counter || await io.hash(await io.capture()) !== hash) throw Object.assign(new Error('Lokale wijzigingen wachten. Kies een versie.'), { status: 409 });
            check(id, token, signal, stamp);
            if (!explicit && io.canRestore && !io.canRestore()) return;
            await io.safety(); check(id, token, signal, stamp);
            if (read(id).counter !== counter || await io.hash(await io.capture()) !== hash) throw Object.assign(new Error('Lokale wijzigingen wachten. Kies een versie.'), { status: 409 });
            check(id, token, signal, stamp);
            if (!explicit && io.canRestore && !io.canRestore()) return;
            const restoreCheck = () => {
                check(id, token, signal, stamp);
                if (read(id).counter !== counter) throw Object.assign(new Error('Lokale wijzigingen wachten. Kies een versie.'), { status: 409 });
            };
            await io.restore(payload, restoreCheck, signal); check(id, token, signal, stamp);
            // Restore may normalize legacy fields. Use the actual restored local
            // snapshot as the basis, so migration cannot cause a return upload.
            const restored = await io.capture(), baseline = await io.hash(restored);
            restoreCheck();
            const s = read(id); s.basis = { revision: remote.revision, hash: baseline }; s.done = counter; s.retries = 0;
            delete s.uploadAttempt;
            if (explicit) { s.enabled = true; s.paused = null; s.resolving = false; }
            s.guard = stamp; write(id, s); io.claim(id);
            await io.record(remote, restored, 'download', id, () => check(id, token, signal, stamp)); check(id, token, signal, stamp);
        }
        async function enable() {
            if (!account || fatal) return;
            cancel(); message = '';
            try { await exclusive(async (id, token, signal) => {
                const stamp = guard(), counter = read(id).counter;
                const remote = await remoteFor(id, token, signal, stamp), local = await io.capture();
                const same = remote.payload && await io.equal(local, remote.payload, id);
                const localHash = await io.hash(local);
                check(id, token, signal, stamp);
                const s = read(id);
                if (!same || ['example', 'import', 'conflict', 'manual', 'choose', 'error'].includes(s.paused) || io.owner() && io.owner() !== id || s.counter !== counter) {
                    s.enabled = false; s.paused = 'choose'; s.remoteExists = !!remote.payload; write(id, s); io.choice(true, !!remote.payload); return;
                }
                s.enabled = true; s.paused = null; s.resolving = false; s.done = s.counter; s.basis = { revision: remote.revision, hash: localHash }; s.guard = stamp; s.retries = 0;
                delete s.uploadAttempt;
                check(id, token, signal, stamp); write(id, s); io.claim(id); io.choice(false); schedule();
            }); } catch (error) { failure(error); }
        }
        async function choose(direction) {
            if (!account || fatal) return;
            cancel(); message = '';
            try { await exclusive(async (id, token, signal) => {
                const stamp = guard(), remote = await remoteFor(id, token, signal, stamp);
                if (!await io.confirm(direction, !!remote.payload)) return;
                check(id, token, signal, stamp);
                if (direction === 'cloud') {
                    if (!remote.payload) throw new Error('Er is geen cloudkopie om terug te halen.');
                    await applyRemote(remote, id, token, signal, true);
                } else {
                    const s = read(id); s.enabled = true; s.paused = null; s.resolving = true; s.remoteExists = !!remote.payload; s.guard = stamp; s.basis = { revision: remote.revision, hash: null }; s.counter++; s.retries = 0; delete s.uploadAttempt; write(id, s); io.claim(id);
                }
                io.choice(direction === 'local', !!remote.payload); schedule(0);
            }); } catch (error) { failure(error); }
        }
        function failure(error) {
            if (error.name === 'AbortError' || !account) return;
            const s = read(account); message = error.message;
            if (error.status === 409) { s.paused = 'conflict'; io.choice(true, true); }
            else if (error.status === 401) s.paused = 'account';
            else if (error.retryable !== false && (!error.status || error.status >= 500)) { s.retries++; if (s.retries > backoff.length) s.paused = 'offline'; else { s.nextAttemptAt = now() + backoff[s.retries - 1]; schedule(backoff[s.retries - 1]); } }
            else s.paused = 'error';
            write(account, s); emit();
        }
        async function tick() {
            if (!account || fatal || running || !io.visible() || io.manualBusy()) return;
            const s = read(account);
            if (!s.enabled || s.paused) return;
            if (io.online && !io.online()) { s.paused = 'offline'; write(account, s); emit(); return; }
            if (s.retries && s.nextAttemptAt > now()) { schedule(s.nextAttemptAt - now()); return; }
            if (s.guard !== guard() || io.owner() !== account) { pause('account'); return; }
            try {
                const locked = await exclusive(async (id, token, signal) => {
                    const stamp = guard(), remote = await remoteFor(id, token, signal, stamp);
                    const generation = read(id).counter;
                    const payload = await io.capture(), hash = await io.hash(payload);
                    check(id, token, signal, stamp);
                    let current = read(id);
                    if (!current.basis) throw Object.assign(new Error('Kies eerst een uitgangspunt.'), { status: 409 });
                    const attempt = current.uploadAttempt;
                    // A lost response is not evidence of a failed write. Reconcile
                    // only the exact revision and snapshot sent by this account.
                    if (attempt && remote.revision === attempt.revision + 1 && remote.payload && await io.hash(remote.payload) === attempt.cloudHash) {
                        check(id, token, signal, stamp);
                        current = read(id);
                        current.basis = { revision: remote.revision, hash: attempt.hash };
                        current.done = attempt.generation; current.retries = 0; current.resolving = false;
                        delete current.uploadAttempt; write(id, current);
                        await io.record(remote, payload, 'upload', id, () => check(id, token, signal, stamp), attempt.hash);
                        check(id, token, signal, stamp); io.choice(false); message = '';
                    }
                    if (hash !== current.basis.hash && current.counter === current.done) { current.counter++; write(id, current); }
                    if (hash === current.basis.hash && current.counter === generation && current.counter > current.done) { current.done = current.counter; write(id, current); }
                    const pending = hash !== current.basis.hash || current.counter > current.done;
                    if (remote.revision !== current.basis.revision) {
                        if (pending) throw Object.assign(new Error('De cloudtuin en lokale tuin zijn gewijzigd. Kies een versie.'), { status: 409 });
                        if (io.canRestore && !io.canRestore()) return;
                        if (!remote.payload) throw Object.assign(new Error('De cloudkopie is gewijzigd of verdwenen. Kies een versie.'), { status: 409 });
                        await applyRemote(remote, id, token, signal, false, { hash, counter: generation }); return;
                    }
                    if (!pending) { current.retries = 0; message = ''; write(id, current); return; }
                    const beforeSnapshot = async cloudPayload => {
                        check(id, token, signal, stamp);
                        const cloudHash = await io.hash(cloudPayload);
                        check(id, token, signal, stamp);
                        const latest = read(id);
                        latest.uploadAttempt = { revision: remote.revision, hash, cloudHash, generation };
                        write(id, latest);
                    };
                    const result = await io.upload(payload, remote.revision, id, signal, () => check(id, token, signal, stamp), beforeSnapshot);
                    check(id, token, signal, stamp);
                    const latest = read(id); latest.basis = { revision: result.revision, hash }; latest.done = generation; latest.retries = 0; latest.resolving = false; delete latest.uploadAttempt; write(id, latest);
                    await io.record(result, payload, 'upload', id, () => check(id, token, signal, stamp)); check(id, token, signal, stamp);
                    io.choice(false);
                    message = '';
                    if (latest.counter > latest.done) schedule();
                }, true);
                if (locked === false) schedule();
            } catch (error) { failure(error); }
        }
        function disable() { cancel(); if (account) { const s = read(account); s.enabled = false; write(account, s); } io.choice(false); emit(); }
        function online() { if (!account) return; const s = read(account); if (!s.paused || s.paused === 'offline') { s.paused = null; s.retries = 0; s.nextAttemptAt = 0; write(account, s); } schedule(0); }
        function manualBaseline(result, payload, direction, id) {
            // Manual actions never silently resume a paused/imported queue.
            if (!id) return;
            return io.hash(payload).then(hash => { const s = read(id); s.basis = { revision: result.revision, hash }; if (direction === 'download') s.done = s.counter; s.resolving = false; delete s.uploadAttempt; if (s.paused) s.paused = 'manual'; write(id, s); io.choice(false); emit(); });
        }
        return { setAccount, changed, external, enable, choose, disable, tick, online, pause, cancel, manualBaseline, status: emit, idle: () => running || Promise.resolve(), dispose: cancel, state: () => account ? read(account) : null };
    };
    const api = { create, PREFIX, GUARD };
    if (typeof module === 'object' && module.exports) module.exports = api; else root.KweekAutoSync = api;
})(globalThis);
