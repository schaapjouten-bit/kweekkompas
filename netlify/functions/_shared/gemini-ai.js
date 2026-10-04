const { endpoint, readBody, reply } = require('./lib/http');
const { authorizeAI, callAI } = require('./lib/ai');
const contract = require('../../../ai-contract');
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
  const { system, prompt } = contract.build('gemini-ai', body);
  const data = await callAI(body, system, prompt);
  return reply(200, { text: JSON.stringify(data) }, cookies);
});
