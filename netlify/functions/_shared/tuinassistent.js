const { endpoint, readBody, reply, HttpError } = require('./lib/http');
const { authorizeAI, callAI } = require('./lib/ai');
exports.handler = endpoint(async event => {
  if (event.httpMethod !== 'POST') throw new HttpError(405, 'Gebruik POST.');
  const cookies = await authorizeAI(event);
  const body = readBody(event);
  const { question, context: tuinContext } = body;
  if (typeof question !== 'string' || !question.trim() || question.length > 4000) throw new HttpError(400, 'Vul een korte tuinvraag in.');
  const systemPrompt = `Je bent de Tuinassistent van KweekKompas, een rustige minimalistische moestuin-app.
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


  const userPrompt = `Vraag: ${question}. Tuincontext: ${JSON.stringify(tuinContext || {})}`;
  const result = await callAI(body, systemPrompt, userPrompt);
  if (typeof result.answer !== 'string' || !Array.isArray(result.actions)) throw new HttpError(502, 'De tuinassistent gaf een onvolledig antwoord. Probeer opnieuw.');
  return reply(200, result, cookies);
});
