// Compatibility adapter for an existing Vercel installation.
const { handler } = require('../netlify/functions/_shared/gemini-ai');
module.exports = async (req, res) => {
  const result = await handler({ httpMethod: req.method, headers: req.headers, body: JSON.stringify(req.body || {}) });
  for (const [key, value] of Object.entries(result.headers || {})) res.setHeader(key, value);
  if (result.multiValueHeaders?.['Set-Cookie']) res.setHeader('Set-Cookie', result.multiValueHeaders['Set-Cookie']);
  res.status(result.statusCode).send(result.body);
};
