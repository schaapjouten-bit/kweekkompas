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
    const model = process.env.GEMINI_MODEL || "gemini-1.5-flash-latest";
    
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
    
    const postData = JSON.stringify({
        systemInstruction: { parts: [{ text: systemPrompt }] },
        contents: [{ parts: [{ text: userPrompt }] }],
        generationConfig: {
            temperature: 0.2,
            responseMimeType: "application/json"
        }
    });

    const options = { method: 'POST', headers: { 'Content-Type': 'application/json' } };
    const { statusCode, data } = await fetchJsonUrl(url, options, postData);
    
    if (statusCode !== 200) throw new Error(data.error?.message || "Gemini API Error");
    
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
    return JSON.parse(text);
};

const callOpenAI = async (systemPrompt, userPrompt) => {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) throw new Error("OPENAI_API_KEY is missing");
    const model = process.env.OPENAI_MODEL || "gpt-4o-mini";

    const postData = JSON.stringify({
        model: model,
        messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: userPrompt }
        ],
        response_format: { type: "json_object" },
        temperature: 0.2
    });

    const options = {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${apiKey}`
        }
    };
    
    const { statusCode, data } = await fetchJsonUrl('https://api.openai.com/v1/chat/completions', options, postData);
    
    if (statusCode !== 200) throw new Error(data.error?.message || "OpenAI API Error");
    
    const text = data.choices?.[0]?.message?.content;
    return JSON.parse(text);
};

const callOllama = async (systemPrompt, userPrompt) => {
    const baseUrl = process.env.OLLAMA_BASE_URL || "http://localhost:11434";
    const model = process.env.OLLAMA_MODEL || "llama3.1";
    
    const postData = JSON.stringify({
        model: model,
        system: systemPrompt,
        prompt: userPrompt,
        format: "json",
        stream: false
    });

    const options = { method: 'POST', headers: { 'Content-Type': 'application/json' } };
    const { statusCode, data } = await fetchJsonUrl(`${baseUrl}/api/generate`, options, postData);
    
    if (statusCode !== 200) throw new Error(data.error || "Ollama API Error");
    
    return JSON.parse(data.response);
};

exports.handler = async (event, context) => {
    if (event.httpMethod !== "POST") {
        return { statusCode: 405, body: JSON.stringify({ error: "POST required" }) };
    }

    try {
        const body = JSON.parse(event.body || "{}");
        const { question, context: tuinContext } = body;

        if (!question) {
            return { statusCode: 400, body: JSON.stringify({ error: "question is required" }) };
        }

        const systemPrompt = `Je bent de Tuinassistent van KweekKompas, een rustige minimalistische moestuin-app.
Geef korte praktische antwoorden in het Nederlands.
Geef alleen advies dat leidt tot concrete tuinacties.
Geen lange theorie. Geen commerciële toon. Geen over-engineering.
Als je onzeker bent, zeg dat eerlijk.
Geef maximaal 3 actievoorstellen.
Output uitsluitend geldig JSON volgens dit schema:
{
  "answer": "kort antwoord",
  "actions": [
    {
      "label": "actieknop tekst",
      "type": "sow | plant | harvest | care | log | none",
      "plantName": "optioneel"
    }
  ]
}`;

        const userPrompt = `Vraag: ${question}
Context: ${JSON.stringify(tuinContext || {})}`;

        const provider = process.env.AI_PROVIDER || "gemini";
        let result;

        try {
            if (provider === "openai") {
                result = await callOpenAI(systemPrompt, userPrompt);
            } else if (provider === "ollama") {
                result = await callOllama(systemPrompt, userPrompt);
            } else {
                result = await callGemini(systemPrompt, userPrompt);
            }
        } catch (apiError) {
            console.error(`Provider ${provider} failed:`, apiError);
            return {
                statusCode: 500,
                body: JSON.stringify({ error: `AI Provider fout (${provider})`, details: apiError.message })
            };
        }

        return {
            statusCode: 200,
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(result)
        };

    } catch (err) {
        console.error("Global Error:", err);
        return {
            statusCode: 500,
            body: JSON.stringify({ error: "Interne serverfout" })
        };
    }
};
