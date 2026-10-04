/* Shared public collection contract for the browser and local build. */
(function(root) {
    const fields = new Set(['id', 'naam', 'type', 'status', 'standplaats', 'water', 'zaaitijd', 'oogsttijd',
        'plant_months', 'plantMonths', 'planttijd', 'uitplanttijd', 'uitplanten', 'beschrijving', 'tags', 'images', 'featuredImageUrl']);
    const object = value => value && typeof value === 'object' && !Array.isArray(value);
    const text = value => typeof value === 'string' && value.trim() !== '';
    function manifest(value) {
        if (!object(value) || value.version !== 1 || !Array.isArray(value.collections) || Object.keys(value).some(key => !['version', 'collections'].includes(key))) throw new Error('De lijst met voorbeeldcollecties is niet geldig.');
        const ids = new Set(), files = new Set();
        for (const entry of value.collections) {
            if (!object(entry) || Object.keys(entry).some(key => !['id', 'name', 'description', 'file'].includes(key)) || typeof entry.id !== 'string' || !/^[a-z0-9][a-z0-9-]*$/.test(entry.id || '') || !text(entry.name) || !text(entry.description) ||
                !/^[a-z0-9][a-z0-9-]*\.json$/.test(entry.file || '') || entry.file === 'manifest.json' || ids.has(entry.id) || files.has(entry.file)) {
                throw new Error('De lijst met voorbeeldcollecties is niet geldig: controleer naam, beschrijving, unieke id en bestandsnaam.');
            }
            ids.add(entry.id); files.add(entry.file);
        }
        return value.collections;
    }
    function collection(value) {
        if (!object(value) || value.backupVersion !== 1 || !Array.isArray(value.seeds) || !value.seeds.length ||
            Object.keys(value).some(key => !['backupVersion', 'seeds'].includes(key))) {
            throw new Error('Het voorbeeldbestand is niet geldig. Gebruik backupVersion: 1 en een niet-lege seeds-lijst, zonder profiel of andere gegevens.');
        }
        const ids = new Set();
        for (const plant of value.seeds) {
            if (!object(plant) || Object.keys(plant).some(key => !fields.has(key)) ||
                !(text(plant.id) || (typeof plant.id === 'number' && Number.isFinite(plant.id))) || ids.has(String(plant.id)) || !text(plant.naam) ||
                !['Groente', 'Fruit', 'Kruid', 'Bloem', 'Bloembol', 'Boom', 'Struik', 'Sierplant', 'Overig'].includes(plant.type) || plant.status !== 'Voorraad') {
                throw new Error('Het voorbeeldbestand is niet geldig. Controleer unieke plant-id, naam, type en status Voorraad; persoonlijke of onbekende velden zijn niet toegestaan.');
            }
            if (plant.images && (!Array.isArray(plant.images) || plant.images.some(image => !object(image) || !text(image.url) || Object.keys(image).some(key => key !== 'url')))) {
                throw new Error('Het voorbeeldbestand is niet geldig. Afbeeldingen bevatten uitsluitend een url.');
            }
            ids.add(String(plant.id));
        }
        return value;
    }
    const api = { manifest, collection };
    if (typeof module === 'object' && module.exports) module.exports = api;
    else root.KweekExampleCollections = api;
})(typeof window === 'object' ? window : globalThis);
