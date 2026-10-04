const { endpoint, readBody, reply, HttpError } = require('./lib/http');
const { authorizeAI, callAI } = require('./lib/ai');
const contract = require('../../../ai-contract');
exports.handler = endpoint(async event => {
  if (event.httpMethod !== 'POST') throw new HttpError(405, 'Gebruik POST.');
  const cookies = await authorizeAI(event);
  const body = readBody(event);
  const { system, prompt } = contract.build('seed-info', body);
  const result = contract.validate('seed-info', await callAI(body, system, prompt));
  return reply(200, result, cookies);
});
