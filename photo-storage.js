/* Permanent cloud references; photos stay embedded in local data and backups. */
(function(root) {
    const BUCKET = 'kweekkompas-photos';
    const PREFIX = `supabase-photo://${BUCKET}/`;
    const MAX_FILE_BYTES = 1_000_000, MAX_LEGACY_FILE_BYTES = 10_000_000, MAX_SIDE = 1600;
    const MAX_BATCH_BYTES = 250_000_000, MAX_PHOTOS = 500;
    const types = { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', webp: 'image/webp', gif: 'image/gif', avif: 'image/avif' };
    const clone = value => Array.isArray(value) ? value.map(clone) : value && typeof value === 'object' ? Object.fromEntries(Object.entries(value).map(([k, v]) => [k, clone(v)])) : value;
    function slots(payload) {
        const result = [];
        const add = (object, key) => { if (object && typeof object[key] === 'string' && object[key]) result.push({ object, key }); };
        for (const item of [...(payload.seeds || []), ...(payload.wishlist || [])]) {
            for (const image of item.images || []) {
                for (const key of ['url', 'imageUrl', 'image', 'src']) add(image, key);
            }
            for (const key of ['featuredImageUrl', 'image', 'imageUrl']) add(item, key);
        }
        add(payload.userProfile, 'photo');
        return result;
    }
    function parseReference(value, userId) {
        if (typeof value !== 'string' || !value.startsWith(PREFIX)) throw new Error('Ongeldige permanente fotoverwijzing.');
        const path = value.slice(PREFIX.length);
        const match = /^([a-f0-9-]{36})\/([a-f0-9]{64})\.(png|jpeg|webp|gif|avif)$/.exec(path);
        if (!match || (userId && match[1] !== userId)) throw new Error('Deze foto hoort niet bij het ingelogde account of heeft een ongeldig pad.');
        return { path, hash: match[2], mime: types[match[3]] };
    }
    function inline(value) {
        const match = /^data:image\/(png|jpe?g|webp|gif|avif);base64,([a-z0-9+/]+={0,2})$/i.exec(value);
        if (!match || match[2].length % 4 !== 0) throw new Error('Een lokale foto heeft een ongeldig formaat. Upload is gestopt; je lokale tuin blijft behouden.');
        const extension = /^jpe?g$/i.test(match[1]) ? 'jpeg' : match[1].toLowerCase();
        const size = match[2].length / 4 * 3 - (match[2].endsWith('==') ? 2 : match[2].endsWith('=') ? 1 : 0);
        if (size < 1) throw new Error('Deze foto is leeg. Je lokale tuin blijft behouden.');
        return { base64: match[2], mime: types[extension], extension, size };
    }
    const processingError = () => new Error('Deze foto kon niet tot maximaal 1 MB worden verwerkt. Kies een kleinere of andere afbeelding. Je bestaande foto en lokale tuin blijven behouden.');
    async function processDataURL(value, force = false) {
        const original = inline(value);
        // Browser canvas is required only for processing. Small legacy data in
        // backend/unit-test callers can still be hashed without image decoding.
        if (!root.document || !root.Image) {
            if (!force && original.size <= MAX_FILE_BYTES) return value;
            throw processingError();
        }
        let image;
        try {
            image = await new Promise((resolve, reject) => {
                const img = new root.Image(); img.onload = () => resolve(img); img.onerror = reject; img.src = value;
            });
            if (!image.naturalWidth || !image.naturalHeight) throw processingError();
            if (!force && original.size <= MAX_FILE_BYTES && Math.max(image.naturalWidth, image.naturalHeight) <= MAX_SIDE) return value;
            const scale = Math.min(1, MAX_SIDE / Math.max(image.naturalWidth, image.naturalHeight));
            const canvas = root.document.createElement('canvas');
            canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
            canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
            const context = canvas.getContext('2d'); if (!context) throw processingError();
            context.drawImage(image, 0, 0, canvas.width, canvas.height);
            // Prefer WebP (including alpha), fall back to JPEG on unsupported
            // encoders or an image that does not fit even at lower quality.
            for (const mime of ['image/webp', 'image/jpeg']) {
                if (mime === 'image/jpeg') {
                    context.globalCompositeOperation = 'destination-over';
                    context.fillStyle = '#fff'; context.fillRect(0, 0, canvas.width, canvas.height);
                    context.globalCompositeOperation = 'source-over';
                }
                for (const quality of [0.88, 0.78, 0.65, 0.5, 0.35, 0.2]) {
                    const result = canvas.toDataURL(mime, quality);
                    if (result.startsWith(`data:${mime};base64,`) && inline(result).size <= MAX_FILE_BYTES) return result;
                }
            }
            throw processingError();
        } catch { throw processingError(); }
    }
    async function processFile(file) {
        if (!file?.type?.startsWith('image/')) throw processingError();
        const value = await new Promise((resolve, reject) => {
            const reader = new root.FileReader(); reader.onload = () => resolve(reader.result);
            reader.onerror = () => reject(processingError()); reader.readAsDataURL(file);
        });
        return processDataURL(value, true);
    }
    function checkOther(value) {
        if (/^supabase-photo:/i.test(value)) { parseReference(value); return; }
        if (/^data:/i.test(value) || /^(blob|file):/i.test(value) || /\/storage\/v1\/object\/(?:upload\/)?sign\//i.test(value)) throw new Error('Een foto gebruikt een tijdelijk of niet ondersteund lokaal adres. Kies de foto opnieuw voordat je uploadt.');
    }
    function estimate(input, userId = '00000000-0000-0000-0000-000000000000') {
        const payload = clone(input), unique = new Set(); let photoBytes = 0;
        for (const { object, key } of slots(payload)) {
            const value = object[key];
            if (/^data:/i.test(value)) {
                const image = inline(value);
                if (!unique.has(value)) { unique.add(value); photoBytes += image.size; }
                // Reserve the longest possible output extension before encoding.
                object[key] = `${PREFIX}${userId}/${'0'.repeat(64)}.jpeg`;
            } else checkOther(value);
        }
        if (unique.size > MAX_PHOTOS || photoBytes > MAX_BATCH_BYTES) throw new Error('Deze upload bevat te veel foto’s (maximaal 500 unieke foto’s en 250 MB per upload). Je lokale tuin blijft behouden.');
        return { payload, photoBytes, photoCount: unique.size };
    }
    async function hash(bytes) {
        const digest = await root.crypto.subtle.digest('SHA-256', bytes);
        return Array.from(new Uint8Array(digest), b => b.toString(16).padStart(2, '0')).join('');
    }
    async function prepare(input, userId) {
        estimate(input, userId);
        const payload = clone(input), files = new Map(), cache = new Map();
        for (const { object, key } of slots(payload)) {
            const value = object[key];
            if (/^data:/i.test(value)) {
                let ref = cache.get(value);
                if (!ref) {
                    const image = inline(await processDataURL(value));
                    const bytes = Uint8Array.from(root.atob(image.base64), c => c.charCodeAt(0));
                    const sha256 = await hash(bytes);
                    const path = `${userId}/${sha256}.${image.extension}`;
                    ref = PREFIX + path; cache.set(value, ref);
                    files.set(path, { path, sha256, bytes, size: bytes.length, mime: image.mime, extension: image.extension });
                }
                object[key] = ref;
            } else if (value.startsWith(PREFIX)) parseReference(value, userId);
        }
        return { payload, files: [...files.values()] };
    }
    function references(payload, userId, forbidInline = false) {
        const result = new Map();
        for (const { object, key } of slots(payload)) {
            const value = object[key];
            if (value.startsWith(PREFIX)) { const ref = parseReference(value, userId); result.set(ref.path, ref); }
            else {
                if (forbidInline && /^data:/i.test(value)) throw new Error('Foto’s moeten eerst apart worden geüpload; de cloudkopie mag geen ingebedde foto’s bevatten.');
                if (!/^data:/i.test(value)) checkOther(value);
            }
        }
        if (result.size > MAX_PHOTOS) throw new Error('Deze cloudkopie bevat te veel fotoverwijzingen (maximaal 500).');
        return [...result.values()];
    }
    async function upload(prepared, userId, request, progress = () => {}, { signal } = {}) {
        let index = 0;
        for (const file of prepared.files) {
            progress(`Foto ${++index} van ${prepared.files.length} controleren en uploaden…`);
            const body = { action: 'upload', sha256: file.sha256, extension: file.extension, size: file.size, expectedUserId: userId };
            const access = await request('photo-access', body);
            if (access.userId !== userId || access.path !== file.path) throw new Error('Het account is gewijzigd. Foto-upload is gestopt.');
            if (!access.exists) {
                let response;
                try { response = await root.fetch(access.signedUrl, { method: 'PUT', body: new Blob([file.bytes], { type: file.mime }), credentials: 'omit', referrerPolicy: 'no-referrer', headers: { 'Content-Type': file.mime }, signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(60000)]) : AbortSignal.timeout(60000) }); }
                catch { throw new Error('Foto-upload is onderbroken door een verbindingsfout. Je lokale tuin en de bestaande cloudkopie blijven behouden. Probeer opnieuw; aanwezige foto’s worden hergebruikt.'); }
                if (!response.ok) {
                    // Another tab may have uploaded the identical content first.
                    if (response.status !== 409) throw Object.assign(new Error('Foto-upload is geweigerd. Controleer de Storage-ruimte, bestandslimiet en gebruikersregels. Je lokale tuin en bestaande cloudkopie blijven behouden.'), { status: response.status });
                    const check = await request('photo-access', body);
                    if (!check.exists || check.userId !== userId) throw new Error('Foto-upload kon niet worden bevestigd. De cloudkopie is niet vervangen.');
                }
            }
        }
        return prepared.payload;
    }
    async function hydrate(input, userId, request, progress = () => {}, { signal } = {}) {
        const payload = clone(input), resolved = new Map();
        const refs = references(payload, userId); let total = 0, index = 0;
        for (const ref of refs) {
            signal?.throwIfAborted();
            progress(`Foto ${++index} van ${refs.length} terughalen…`);
            let response;
            for (let attempt = 0; attempt < 2; attempt++) {
                signal?.throwIfAborted();
                const access = await request('photo-access', { action: 'download', path: ref.path, expectedUserId: userId });
                signal?.throwIfAborted();
                if (access.userId !== userId || access.path !== ref.path) throw new Error('Het account is gewijzigd. Je lokale tuin is niet vervangen.');
                try { response = await root.fetch(access.signedUrl, { credentials: 'omit', referrerPolicy: 'no-referrer', signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(60000)]) : AbortSignal.timeout(60000) }); }
                catch (error) { signal?.throwIfAborted(); throw new Error('Een cloudfoto kon niet worden opgehaald door een verbindingsfout. Je lokale tuin is niet vervangen.'); }
                if (response.ok || ![400, 401, 403].includes(response.status)) break; // Renew expired capability once.
            }
            if (!response?.ok) throw new Error('Een cloudfoto ontbreekt of kan niet worden opgehaald. Je lokale tuin is niet vervangen.');
            let bytes;
            try { bytes = new Uint8Array(await response.arrayBuffer()); }
            catch { throw new Error('Een cloudfoto is niet volledig ontvangen. Je lokale tuin is niet vervangen.'); }
            signal?.throwIfAborted();
            total += bytes.length;
            if (!bytes.length || bytes.length > MAX_LEGACY_FILE_BYTES || total > MAX_BATCH_BYTES || await hash(bytes) !== ref.hash) throw new Error('Een cloudfoto is onvolledig, gewijzigd of te groot. Je lokale tuin is niet vervangen.');
            let binary = '';
            for (let offset = 0; offset < bytes.length; offset += 32768) binary += String.fromCharCode(...bytes.subarray(offset, offset + 32768));
            resolved.set(ref.path, `data:${ref.mime};base64,${root.btoa(binary)}`);
        }
        for (const { object, key } of slots(payload)) if (object[key].startsWith(PREFIX)) object[key] = resolved.get(parseReference(object[key], userId).path);
        return payload;
    }
    const api = { BUCKET, PREFIX, MAX_FILE_BYTES, MAX_LEGACY_FILE_BYTES, MAX_SIDE, MAX_BATCH_BYTES, MAX_PHOTOS, types, slots, parseReference, estimate, prepare, references, upload, hydrate, processDataURL, processFile };
    if (typeof module === 'object' && module.exports) module.exports = api;
    else root.KweekPhotoStorage = api;
})(globalThis);
