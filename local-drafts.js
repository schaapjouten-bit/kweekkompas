/* Device-only concepts. Text is saved synchronously; photos use IndexedDB. */
(function(root) {
    const PREFIX = 'kweekkompas_draft_', LAST = PREFIX + 'last';
    const pending = new Map();
    let database;
    const open = () => database ||= new Promise((resolve, reject) => {
        const request = indexedDB.open('KweekKompasDrafts', 1);
        request.onupgradeneeded = () => request.result.createObjectStore('media');
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(new Error('Conceptfoto’s konden niet worden bewaard.'));
    });
    const media = async (key, action, value) => {
        const db = await open();
        return new Promise((resolve, reject) => {
            const tx = db.transaction('media', action === 'get' ? 'readonly' : 'readwrite');
            const store = tx.objectStore('media');
            const request = action === 'get' ? store.get(key) : action === 'put' ? store.put(value, key) : store.delete(key);
            tx.oncomplete = () => resolve(request.result);
            tx.onerror = tx.onabort = () => reject(new Error('Conceptfoto’s konden niet worden bewaard.'));
        });
    };
    const enqueue = (key, action, value) => {
        const work = (pending.get(key) || Promise.resolve()).catch(() => {}).then(() => media(key, action, value));
        pending.set(key, work);
        work.finally(() => { if (pending.get(key) === work) pending.delete(key); }).catch(() => {});
        return work;
    };
    const put = (key, values, assets) => {
        try {
            localStorage.setItem(PREFIX + key, JSON.stringify({ version: 1, values }));
            localStorage.setItem(LAST, key);
        } catch { return Promise.reject(new Error('Het concept kon niet worden bewaard. Controleer vrije opslagruimte.')); }
        return assets === undefined ? Promise.resolve() : enqueue(key, 'put', structuredClone(assets));
    };
    const get = async key => {
        await pending.get(key)?.catch(() => {});
        let saved;
        try { saved = JSON.parse(localStorage.getItem(PREFIX + key) || 'null'); } catch { return null; }
        if (saved?.version !== 1 || !saved.values || typeof saved.values !== 'object') return null;
        return { values: saved.values, assets: await media(key, 'get').catch(() => null) };
    };
    const drop = key => {
        localStorage.removeItem(PREFIX + key);
        if (localStorage.getItem(LAST) === key) localStorage.removeItem(LAST);
        return enqueue(key, 'delete');
    };
    root.KweekDrafts = { put, get, drop, last: () => localStorage.getItem(LAST), idle: () => Promise.allSettled([...pending.values()]) };
})(globalThis);
