const fs = require('node:fs');

function readLegacyGeminiKey(file) {
    try {
        const entry = fs.lstatSync(file, { throwIfNoEntry: false });
        if (!entry?.isFile()) return '';
        const { apiKey } = JSON.parse(fs.readFileSync(file, 'utf8'));
        if (typeof apiKey === 'string' && /^[\x21-\x7e]{1,8192}$/.test(apiKey)) return apiKey;
    } catch { /* A missing or unreadable legacy file must not block current settings. */ }
    return '';
}

module.exports = { readLegacyGeminiKey };
