const http = require('http');
const https = require('https');

const fetchJsonUrl = (urlString, options, postData) => {
    return new Promise((resolve, reject) => {
        const url = new URL(urlString);
        const reqModule = url.protocol === 'https:' ? https : http;
        
        const reqOptions = {
            hostname: url.hostname,
            port: url.port,
            path: url.pathname + url.search,
            method: options.method || 'GET',
            headers: options.headers || {}
        };

        const req = reqModule.request(reqOptions, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                try {
                    resolve({ statusCode: res.statusCode, data: JSON.parse(data) });
                } catch (e) {
                    resolve({ statusCode: res.statusCode, data });
                }
            });
        });
        req.on('error', reject);
        if (postData) req.write(postData);
        req.end();
    });
};

const callGemini = async (systemPrompt, userPrompt) => {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) throw new Error("GEMINI_API_KEY is missing");
    
    const model = process.env.GEMINI_MODEL || "gemini-2.5-flash";
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
    
    const postData = JSON.stringify({
        contents: [{ parts: [{ text: systemPrompt + "\n\nData: " + userPrompt }] }]
    });

    const options = {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
    };

    console.log(`[DEBUG] Seed-info calling Gemini API with model: ${model}`);
    const { statusCode, data } = await fetchJsonUrl(url, options, postData);
    
    if (statusCode !== 200) {
        throw new Error(data.error?.message || `Status ${statusCode}`);
    }

    const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!text) throw new Error("No text returned from Gemini API");

    try {
        return JSON.parse(text);
    } catch (e) {
        const jsonMatch = text.match(/\{[\s\S]*\}/);
        if (!jsonMatch) throw new Error("Could not parse JSON response: " + text);
        return JSON.parse(jsonMatch[0]);
    }
};

exports.handler = async (event, context) => {
    if (event.httpMethod !== "POST") {
        return { statusCode: 405, body: JSON.stringify({ error: "POST required" }) };
    }

    try {
        const body = JSON.parse(event.body || "{}");
        const { name, existingFields } = body;

        if (!name) {
            return { statusCode: 400, body: JSON.stringify({ error: "name is required" }) };
        }

        const systemPrompt = `Je bent de zaad-invulhulp van KweekKompas, een rustige minimalistische moestuin-app.
Je helpt bij het invullen van een nieuw zaad/gewas.
Geef praktische moestuin-informatie in het Nederlands.
Vul alleen gestructureerde velden.
Doe geen wilde claims. Als je onzeker bent, geef confidence "laag" of gebruik "onbekend".
De gebruiker controleert altijd zelf voordat iets wordt opgeslagen.

Zorg dat de inhoud van het veld "notes" is opgemaakt als een duidelijke, praktische teeltfiche. Gebruik in "notes" GÉÉN markdown (dus geen ** of #), alleen simpele platte tekst en witregels. Zorg dat alle newlines correct ge-escaped worden in JSON (als \\n).

Gebruik exact dit format voor "notes":

📋 Informatie

Zaaien: [maanden]
Kiemduur: [dagen]
Kiemtemperatuur: [temperatuur]

Zaaimethode:
[Kort praktisch zaaiadvies]

Uitplanten:
[Wanneer en hoe, indien relevant]

Standplaats: [volle zon / halfschaduw / schaduw]
Grond: [korte grondsoort of bodemadvies]

Water:
[Kort praktisch wateradvies]

Plantafstand: ± [afstand]
Hoogte: ± [hoogte]

Bloei: [maanden, indien relevant]
Oogst: [maanden, indien relevant]
Seizoen: [eenjarig / tweejarig / vaste plant / onbekend]

Kies voor het veld "tags" maximaal 6 relevante kenmerken uit uitsluitend deze lijst:
Voorzaaien, Direct zaaien, Klimplant, Snelle groeier, Eenjarig, Tweejarig, Vaste plant, Winterhard, Eetbaar, Kruidenplant, Sierplant, Snijbloem, Droogbloem, Potten, Border, Bijvriendelijk, Vlinderplant, Insectwerend, Companion plant, Beginner, Makkelijk, Weinig onderhoud, Gevoelig voor vorst, Niet verplanten, Lastige kiemer.

Output uitsluitend geldig JSON volgens exact dit schema:
{
  "name": "string",
  "type": "Groente | Fruit | Kruid | Bloem | Bloembol | Boom | Struik | Sierplant | Overig",
  "standplaats": "Zon | Halfschaduw | Schaduw | Kas | Binnen | Onbekend",
  "waterbehoefte": "Laag | Gemiddeld | Hoog | Onbekend",
  "sow_months": ["maart", "april"],
  "plant_months": ["mei"],
  "harvest_months": ["juli", "augustus"],
  "spacing": "string",
  "germination_days": "string",
  "notes": "de rijk opgemaakte teeltfiche zoals hierboven gevraagd",
  "tags": ["Tag1", "Tag2"],
  "confidence": "hoog | gemiddeld | laag",
  "needs_review": true
}

LET OP: Maanden in arrays uitsluitend als volledige kleine letters: ["januari", "februari", "maart", "april", "mei", "juni", "juli", "augustus", "september", "oktober", "november", "december"].
Voor type, standplaats en waterbehoefte de exacte kapitalisatie gebruiken.`;

        const userPrompt = `Vul de informatie aan voor plant/zaad: "${name}".
Huidige bekende velden: ${JSON.stringify(existingFields || {})}`;

        const result = await callGemini(systemPrompt, userPrompt);

        return {
            statusCode: 200,
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(result)
        };

    } catch (err) {
        console.error("Seed Info API Error:", err);
        return {
            statusCode: 500,
            body: JSON.stringify({ error: "Interne serverfout bij ophalen plantinfo" })
        };
    }
};
