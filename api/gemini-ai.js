const https = require('https');

module.exports = async (req, res) => {
    console.log("DEBUG START: Vercel gemini-ai function");
    console.log("SPECIFIC KEY CHECK:", process.env.GEMINI_API_KEY ? "EXISTS" : "UNDEFINED");
    
    // Check CORS (if needed, Vercel allows wildcard but usually good to set headers)
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    if (!process.env.GEMINI_API_KEY) {
        console.error("CRITICAL: GEMINI_API_KEY is missing!");
        return res.status(500).json({
            error: "API KEY UNDEFINED",
            note: "De GEMINI_API_KEY lijkt niet correct ingesteld in het Vercel Dashboard."
        });
    }

    if (req.method !== "POST") {
        return res.status(405).json({ ok: false, error: "POST required" });
    }

    try {
        // Vercel parses the body automatically if Content-Type is application/json
        let body = req.body;
        if (typeof body === 'string') {
            body = JSON.parse(body || "{}");
        }

        const { mode, input, month } = body || {};
        const API_KEY = process.env.GEMINI_API_KEY;

        let prompt = "";
        const contextNL = "Je bent een nuchtere, ervaren Nederlandse moestuin-expert. Context: Gematigd zeeklimaat, klei/zandgrond.";
        
        if (mode === "fill_seed_info") {
            prompt = `Analyseer de plant '${input}'. Gebruik de maand ${month} als referentiekader. ${contextNL}
            Geef EXACT deze JSON structuur terug:
            {
              "type": "Groente|Fruit|Kruid|Bloem|Bloembol|Boom|Struik|Sierplant",
              "standplaats": "Zon|Halfschaduw|Schaduw",
              "waterbehoefte": "Laag|Gemiddeld|Hoog",
              "zaaitijd": ["jan", "feb", "etc"],
              "oogsttijd": ["mei", "jun", "etc"],
              "tags": ["minstens 5-8 diverse tags zoals: Beginner, Winterhard, Bijvriendelijk, Snelle groeier, etc"],
              "teeltinformatie": "Verplicht veld! Geef 2-3 concrete zinnen met praktisch advies voor de moestuinier over succesvol kweken van deze plant."
            }`;
        } else if (mode === "garden_assistant") {
            prompt = `Je bent de KweekKompas Expert. Vraag: ${input}. Maand: ${month}. ${contextNL}
            Geef praktisch, enthousiast en concreet advies. 
            Regels:
            - Max 3-4 krachtige bullet points.
            - Focus op wat NU gedaan moet worden.
            - Geen algemeenheden, wees specifiek voor de plant en het klimaat.
            - Eindig met een korte motiverende zin.`;
        } else {
            prompt = `Beantwoord kort in NL: ${input}. Maand: ${month}.`;
        }

        const postData = JSON.stringify({
            contents: [{ parts: [{ text: prompt }] }],
            generationConfig: { 
                temperature: 0.7,
                maxOutputTokens: 1000,
                topP: 0.95
            }
        });

        // Gebruik het stabiele gemini-2.5-flash model via de v1beta API
        const model = "gemini-2.5-flash";
        const apiVersion = "v1beta";
        console.log(`DEBUG: Calling Google API ${apiVersion} with model ${model}`);

        const options = {
            hostname: 'generativelanguage.googleapis.com',
            path: `/${apiVersion}/models/${model}:generateContent?key=${API_KEY}`,
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Content-Length': Buffer.byteLength(postData)
            }
        };

        return new Promise((resolve) => {
            const googleReq = https.request(options, (googleRes) => {
                let data = '';
                googleRes.on('data', (chunk) => data += chunk);
                googleRes.on('end', () => {
                    console.log("DEBUG: Google API Response Status:", googleRes.statusCode);
                    try {
                        const json = JSON.parse(data);
                        if (googleRes.statusCode === 200) {
                            const aiText = json.candidates?.[0]?.content?.parts?.[0]?.text || "";
                            resolve(res.status(200).json({ ok: true, text: aiText }));
                        } else {
                            console.error("DEBUG: Google API Error Details:", JSON.stringify(json));
                            resolve(res.status(googleRes.statusCode).json({ 
                                ok: false, 
                                error: json.error?.message || "Google API Error",
                                details: json.error || null,
                                status: googleRes.statusCode
                            }));
                        }
                    } catch (e) {
                        console.error("DEBUG: JSON Parse Error:", data);
                        resolve(res.status(500).json({ ok: false, error: "Fout bij verwerken van AI antwoord" }));
                    }
                });
            });

            googleReq.on('error', (e) => {
                console.error("DEBUG: Request Error:", e.message);
                resolve(res.status(500).json({ ok: false, error: "Netwerkfout richting AI" }));
            });

            googleReq.write(postData);
            googleReq.end();
        });

    } catch (err) {
        return res.status(500).json({ ok: false, error: "Global catch: " + err.message });
    }
};
