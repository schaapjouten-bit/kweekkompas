/* Same cloud contract on the device and backend; local backups stay complete. */
(function(root) {
    const MAX_BYTES = 3_500_000; // Reserve room for envelope and JSONB whitespace under 4 MB.
    const datasets = ['seeds', 'calendar', 'wishlist', 'userProfile', 'reminders', 'dailyProgress'];
    const profileFields = ['name', 'climate', 'gardenType', 'gardenPlaces', 'primaryGardenPlace', 'light', 'experience', 'photo', 'photoZoom', 'photoX', 'photoY'];
    const secret = key => /^(api[_-]?key|.*[_-]api[_-]?key|access[_-]?token|refresh[_-]?token|authorization|password|session|authSession|credentials|service[_-]?role[_-]?key)$/i.test(key);
    function clean(value) {
        if (Array.isArray(value)) return value.map(clean);
        if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).filter(([key]) => !secret(key)).map(([key, item]) => [key, clean(item)]));
        return value;
    }
    function select(input) {
        if (!input || input.backupVersion !== 1 || !Array.isArray(input.seeds)) throw new Error('De cloudkopie heeft geen geldig tuinformaat. Je lokale gegevens blijven behouden.');
        const result = { backupVersion: 1 };
        for (const key of datasets) if (Object.hasOwn(input, key)) result[key] = clean(input[key]);
        if (result.userProfile && typeof result.userProfile === 'object' && !Array.isArray(result.userProfile)) {
            result.userProfile = Object.fromEntries(profileFields.filter(key => Object.hasOwn(result.userProfile, key)).map(key => [key, result.userProfile[key]]));
        }
        return result;
    }
    function stable(value) {
        if (Array.isArray(value)) return '[' + value.map(stable).join(',') + ']';
        if (value && typeof value === 'object') return '{' + Object.keys(value).sort().map(key => JSON.stringify(key) + ':' + stable(value[key])).join(',') + '}';
        return JSON.stringify(value);
    }
    const bytes = value => new TextEncoder().encode(JSON.stringify(value)).length;
    function assertSize(payload) {
        const size = bytes(payload);
        if (size > MAX_BYTES) throw new Error(`Je overige tuingegevens zijn te groot voor deze cloudkopie (${(size / 1_000_000).toFixed(2)} MB; maximaal 3,5 MB). Er is niets geüpload. Je lokale tuin blijft volledig bewaard; download een back-up. Foto’s worden apart opgeslagen; verklein de overige tuingegevens of download een back-up.`);
        return size;
    }
    const api = { select, stable, bytes, assertSize, MAX_BYTES };
    if (typeof module === 'object' && module.exports) module.exports = api;
    else root.KweekCloudData = api;
})(typeof window === 'object' ? window : globalThis);
