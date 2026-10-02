const { endpoint, readBody, reply, HttpError } = require('./lib/http');
const { authorizeAI, callAI } = require('./lib/ai');
exports.handler = endpoint(async event => {
  if (event.httpMethod !== 'POST') throw new HttpError(405, 'Gebruik POST.');
  const cookies = await authorizeAI(event);
  const body = readBody(event);
  const { name, existingFields } = body;
  if (typeof name !== 'string' || !name.trim() || name.length > 300) throw new HttpError(400, 'Vul een plantnaam in.');
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


  const userPrompt = `Plant/zaad: ${name}. Bestaande velden: ${JSON.stringify(existingFields || {})}`;
  const result = await callAI(body, systemPrompt, userPrompt);
  if (typeof result.notes !== 'string' || !Array.isArray(result.sow_months) || !Array.isArray(result.harvest_months)) throw new HttpError(502, 'De zadenhulp gaf onvolledige gegevens. Probeer opnieuw.');
  return reply(200, result, cookies);
});
