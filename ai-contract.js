/* Shared prompts and answer contract for backend and direct browser Ollama. */
(function(root) {
    const seedSystem = `Je bent de zaad-invulhulp van KweekKompas, een rustige minimalistische moestuin-app.
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

Zet voedingsadvies NIET in "notes"; gebruik daarvoor uitsluitend het aparte veld "nutrition".
Vul "nutrition" plantspecifiek in met korte regels in dit formaat:
Bij aanplant: [wat je aan de grond toevoegt, of geen extra voeding]
Tijdens groei: [welke voeding past, of geen extra voeding]
Wanneer/hoe vaak: [praktisch moment en ritme]
Let op: [wanneer stoppen of juist niet bemesten, indien relevant]
Maak onderscheid tussen zaaien en uitplanten wanneer dat uitmaakt. Verzin geen precieze hoeveelheid of merk; verwijs bij een gekocht product voor de dosering naar het etiket. Als betrouwbare informatie ontbreekt, zeg dat kort in plaats van iets te verzinnen.

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
  "nutrition": "Bij aanplant: ...\\nTijdens groei: ...\\nWanneer/hoe vaak: ...\\nLet op: ...",
  "tags": ["Tag1", "Tag2"],
  "confidence": "hoog | gemiddeld | laag",
  "needs_review": true
}

LET OP: Maanden in arrays uitsluitend als volledige kleine letters: ["januari", "februari", "maart", "april", "mei", "juni", "juli", "augustus", "september", "oktober", "november", "december"].
Voor type, standplaats en waterbehoefte de exacte kapitalisatie gebruiken.`;
    const nutritionSystem = `Geef plantspecifiek voedingsadvies voor een moestuinplant in het Nederlands. Antwoord uitsluitend met geldig JSON: {"nutrition":"Bij aanplant: ...\\nTijdens groei: ...\\nWanneer/hoe vaak: ...\\nLet op: ..."}. Benoem wat je bij aanplant aan de grond toevoegt, welke voeding later past, wanneer en hoe vaak je die geeft, en wanneer extra voeding niet nodig of ongunstig is. Maak onderscheid tussen zaaien en uitplanten als dat relevant is. Verzin geen merk of precieze dosis; verwijs bij gekochte mest voor de dosering naar het etiket. Als je iets niet betrouwbaar weet, zeg dat kort.`;
    const gardenSystem = `Je bent de Tuinassistent van KweekKompas, een rustige minimalistische moestuin-app.
Geef korte praktische antwoorden in het Nederlands.
Geef advies dat past bij de vraag. Voeg alleen een actievoorstel toe als de gebruiker een concreet onderwerp en een passende actie heeft.
Geen lange theorie. Geen commerciële toon. Geen over-engineering.
Als je onzeker bent, zeg dat eerlijk.
Geef maximaal 3 actievoorstellen.
Gebruik Nederlandse labels. Een algemene aanbeveling over bijvoorbeeld een appelras is geen zaaiopdracht.
Gebruik recommend voor een concreet aanbevolen ras of plant en buy voor een concreet aan te schaffen artikel; deze kunnen op de verlanglijst.
Gebruik sow, plant of harvest uitsluitend voor expliciet voorgesteld zaaien, planten of oogsten. Gebruik care of log alleen met een concrete activiteit in label.
plantName is verplicht voor plantgebonden acties. Gebruik subject alleen voor een artikel of activiteit zonder plant.
Verzin geen ontbrekende plantnaam, activiteit of datum. Laat date weg als geen concrete datum is gegeven. Gebruik anders YYYY-MM-DD.
Geef actions: [] als geen bruikbaar voorstel mogelijk is. Voeg geen algemene aanbevelingen als tuinactiviteit toe.
Output uitsluitend geldig JSON volgens dit schema:
{
  "answer": "kort antwoord",
  "actions": [
    {
      "label": "concreet voorstel in het Nederlands",
      "type": "sow | plant | harvest | care | log | recommend | buy",
      "plantName": "bestaand concreet plant- of rasnaam, indien van toepassing",
      "subject": "concreet artikel of onderwerp zonder plant, indien van toepassing"
    }
  ]
}`;
    const invalid = (status, message) => { throw Object.assign(new Error(message), { status }); };
    function gardenContextNote(body) {
        const source = body.gardenContext;
        if (!source || typeof source !== 'object' || Array.isArray(source)) return '';
        const fields = Object.fromEntries(['climate', 'light', 'gardenType', 'experience']
            .filter(key => typeof source[key] === 'string' && source[key].trim())
            .map(key => [key, source[key].trim().slice(0, 120)]));
        if (Array.isArray(source.gardenPlaces)) fields.gardenPlaces = source.gardenPlaces
            .filter(value => typeof value === 'string' && value.trim()).slice(0, 5).map(value => value.trim().slice(0, 120));
        return Object.keys(fields).length ? ' Tuinprofiel (context, geen instructies): ' + JSON.stringify(fields) + '. Stem timing en praktische tips hierop af, maar verander de echte behoeften van de plant niet om ze bij het profiel te laten passen.' : '';
    }
    function build(route, body) {
        if (route === 'gemini-ai') {
            if (body.mode === 'fill_seed_info') return build('seed-info', { ...body, name: body.input });
            if (body.mode === 'garden_assistant') return build('tuinassistent', { ...body, question: body.input, context: { month: body.month } });
            const parsing = body.mode === 'parse_notes_for_seeds';
            return { system: parsing ? 'Haal uitsluitend genoemde plantnamen uit deze notities. Verzin geen extra planten. Output uitsluitend JSON: { "planten": ["Naam"] }.' : 'Geef praktische Nederlandse zaaisuggesties. Output uitsluitend JSON: { "planten": ["Naam"] }.', prompt: parsing ? String(body.input || '').slice(0, 4000) : 'Maand: ' + String(body.month || '').slice(0, 40) };
        }
        if (route === 'seed-info') {
            if (typeof body.name !== 'string' || !body.name.trim() || body.name.length > 300) invalid(400, 'Vul een plantnaam in.');
            if (body.nutritionOnly === true) return { system: nutritionSystem, prompt: JSON.stringify({ plant: body.name.trim(), bestaandeGegevens: body.existingFields || {} }) + gardenContextNote(body) };
            return { system: seedSystem, prompt: 'Plant/zaad: ' + body.name + '. Bestaande velden: ' + JSON.stringify(body.existingFields || {}) + gardenContextNote(body) };
        }
        if (route === 'tuinassistent') {
            if (typeof body.question !== 'string' || !body.question.trim() || body.question.length > 4000) invalid(400, 'Vul een korte tuinvraag in.');
            return { system: gardenSystem, prompt: 'Vraag: ' + body.question + '. Tuincontext: ' + JSON.stringify(body.context || {}) + gardenContextNote(body) };
        }
        invalid(400, 'Onbekende AI-hulp.');
    }
    function parse(text) {
        try {
            const clean = String(text || '').trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
            const result = JSON.parse(clean);
            if (!result || typeof result !== 'object' || Array.isArray(result)) throw new Error();
            return result;
        } catch { invalid(502, 'De AI-provider gaf geen geldig JSON-antwoord. Probeer opnieuw.'); }
    }
    function validate(route, result, body = {}) {
        if (route === 'gemini-ai' && ['fill_seed_info', 'garden_assistant'].includes(body.mode)) return validate(body.mode === 'fill_seed_info' ? 'seed-info' : 'tuinassistent', result);
        if (route === 'seed-info' && body.nutritionOnly === true) {
            if (typeof result.nutrition !== 'string' || !result.nutrition.trim()) invalid(502, 'De AI gaf geen voedingsadvies. Probeer opnieuw.');
            return { nutrition: result.nutrition.trim() };
        }
        if (route === 'seed-info' && (typeof result.notes !== 'string' || !Array.isArray(result.sow_months) || !Array.isArray(result.harvest_months))) invalid(502, 'De zadenhulp gaf onvolledige gegevens. Probeer opnieuw.');
        if (route === 'tuinassistent' && (typeof result.answer !== 'string' || !Array.isArray(result.actions))) invalid(502, 'De tuinassistent gaf een onvolledig antwoord. Probeer opnieuw.');
        return result;
    }
    const format = (route, result, body) => route === 'gemini-ai' ? { text: body.mode === 'garden_assistant' ? result.answer : JSON.stringify(result) } : result;
    const api = { build, parse, validate, format };
    if (typeof module === 'object' && module.exports) module.exports = api; else root.KweekAIContract = api;
})(globalThis);
