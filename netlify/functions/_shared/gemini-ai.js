const { endpoint, readBody, reply } = require('./lib/http');
const { authorizeAI, callAI } = require('./lib/ai');
exports.handler = endpoint(async event => {
  const body = readBody(event);
  if (body.mode === 'fill_seed_info' || body.mode === 'garden_assistant') {
    const route = body.mode === 'fill_seed_info' ? 'seed-info' : 'tuinassistent';
    const result = await require('./' + route).handler({ ...event, body: JSON.stringify({ ...body, name: body.input, question: body.input, context: { month: body.month } }) });
    if (result.statusCode !== 200) return result;
    const data = JSON.parse(result.body);
    result.body = JSON.stringify({ text: body.mode === 'garden_assistant' ? data.answer : JSON.stringify(data) });
    return result;
  }
  if (event.httpMethod !== 'POST') return reply(405, { error: 'Gebruik POST.' });
  const cookies = await authorizeAI(event);
  const parsing = body.mode === 'parse_notes_for_seeds';
  const data = await callAI(body, parsing ? 'Haal uitsluitend genoemde plantnamen uit deze notities. Verzin geen extra planten. Output uitsluitend JSON: { "planten": ["Naam"] }.' : 'Geef praktische Nederlandse zaaisuggesties. Output uitsluitend JSON: { "planten": ["Naam"] }.', parsing ? String(body.input || '').slice(0, 4000) : 'Maand: ' + String(body.month || '').slice(0, 40));
  return reply(200, { text: JSON.stringify(data) }, cookies);
});
