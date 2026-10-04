const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
// These are public assets. Reject accidental profile/backup fields before copying.
const contract = require('../example-collections.js');
const collections = path.join(root, 'assets/example-collections');
const entries = contract.manifest(JSON.parse(fs.readFileSync(path.join(collections, 'manifest.json'), 'utf8')));
for (const entry of entries) {
    if (!fs.existsSync(path.join(collections, entry.file))) throw new Error(`Voorbeeldcollectie ontbreekt: ${entry.file}`);
}
for (const file of fs.readdirSync(collections).filter(file => file.endsWith('.json') && file !== 'manifest.json')) {
    try { contract.collection(JSON.parse(fs.readFileSync(path.join(collections, file), 'utf8'))); }
    catch (error) { throw new Error(`${file}: ${error.message}`); }
}
const target = path.join(root, 'dist');
if (path.dirname(target) !== root || path.basename(target) !== 'dist') throw new Error('Ongeldige buildmap.');
fs.rmSync(target, { recursive: true, force: true });
fs.mkdirSync(target, { recursive: true });
for (const name of ['index.html', 'app-v132.js', 'example-collections.js', 'cloud-data.js', 'photo-storage.js', 'auto-sync.js', 'local-drafts.js', 'services.js', 'services.css', 'styles.css', 'calendar.css', 'onboarding.css', 'planner.css', 'wishlist.css']) fs.copyFileSync(path.join(root, name), path.join(target, name));
fs.cpSync(path.join(root, 'assets'), path.join(target, 'assets'), { recursive: true });
console.log('Statische app gebouwd in dist; backendcode en .env zijn niet opgenomen.');
