/* Account-bound browser storage. The legacy database is never copied or deleted. */
(function(root) {
    const raw = root.localStorage;
    const prefix = '__kweek_account_v1__:';
    const ownerKey = '__kweek_legacy_admin_v1__';
    const seenKey = '__kweek_seen_account_v1__';
    const leadingKey = '__kweek_legacy_local_leading_v1__';
    const signalKey = '__kweek_session_changed_v1__';
    function createStorage(id, legacy) {
        const ownPrefix = prefix + id + ':';
        const allowed = key => legacy ? !key.startsWith(prefix) && key !== ownerKey && key !== seenKey && key !== leadingKey && key !== signalKey : key.startsWith(ownPrefix);
        const physical = key => legacy ? String(key) : ownPrefix + key;
        const keys = () => Array.from({ length: raw.length }, (_, i) => raw.key(i)).filter(key => key !== null && allowed(key));
        return {
            get length() { return keys().length; },
            key(i) { const key = keys()[i]; return key === undefined ? null : legacy ? key : key.slice(ownPrefix.length); },
            getItem(key) { return allowed(physical(key)) ? raw.getItem(physical(key)) : null; },
            setItem(key, value) { if (!allowed(physical(key))) throw new Error('Ongeldige opslagsleutel.'); raw.setItem(physical(key), value); },
            removeItem(key) { if (allowed(physical(key))) raw.removeItem(physical(key)); },
            clear() { for (const key of keys()) raw.removeItem(key); }
        };
    }
    function create(user) {
        const owner = raw.getItem(ownerKey);
        if (user && (!/^[a-f0-9-]{36}$/i.test(user.id) || !['admin', 'user'].includes(user.role))) throw new Error('Ongeldige accountstatus.');
        if (user) raw.setItem(seenKey, '1');
        if (user?.role === 'admin' && !owner) {
            // Preserve the queue, but require an explicit choice before any sync.
            const queueKey = 'kweekkompas_auto_' + user.id;
            const saved = raw.getItem(queueKey);
            if (saved) {
                const queue = JSON.parse(saved);
                queue.enabled = false;
                queue.paused = 'choose';
                raw.setItem(queueKey, JSON.stringify(queue));
            }
            raw.setItem(leadingKey, user.id);
            raw.setItem(ownerKey, user.id);
        }
        const bound = raw.getItem(ownerKey);
        const legacy = user ? user.role === 'admin' && bound === user.id : !bound && !raw.getItem(seenKey);
        const id = user?.id || 'guest';
        return { id, role: user?.role || null, legacy, storage: createStorage(id, legacy), database(name) { return legacy ? name : `${name}::${id}`; },
            get localLeading() { return legacy && raw.getItem(leadingKey) === id; },
            confirmCloudUpload() { if (legacy && raw.getItem(leadingKey) === id) raw.removeItem(leadingKey); },
            signal() { raw.setItem(signalKey, crypto.randomUUID()); } };
    }
    root.KweekAccountStorage = { create, signalKey };
})(globalThis);
