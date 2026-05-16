const https = require('https');

exports.handler = async (event, context) => {
    // DEBUG: Log alle keys en de specifieke Gemini key
    console.log("DEBUG START: gemini-ai function");
    console.log("SPECIFIC KEY CHECK:", process.env.GEMINI_API_KEY ? "EXISTS" : "UNDEFINED");
    
    // Stap 2: Fallback check met lijst van beschikbare keys
    if (!process.env.GEMINI_API_KEY) {
        console.error("CRITICAL: GEMINI_API_KEY is missing!");
        return {
            statusCode: 500,
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                error: "API KEY UNDEFINED",
                note: "De GEMINI_API_KEY lijkt niet correct ingesteld in het Netlify Dashboard."
            })
        };
    }

    if (event.httpMethod !== "POST") {
        return { 
            statusCode: 405, 
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ ok: false, error: "POST required" }) 
        };
    }

    try {
        const body = JSON.parse(event.body || "{}");
        const { mode, input, month } = body;
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

        // Gebruik de stabiele v1beta API en het gemini-1.5-flash-latest model
        const model = "gemini-1.5-flash-latest";
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
            const req = https.request(options, (res) => {
                let data = '';
                res.on('data', (chunk) => data += chunk);
                res.on('end', () => {
                    console.log("DEBUG: Google API Response Status:", res.statusCode);
                    try {
                        const json = JSON.parse(data);
                        if (res.statusCode === 200) {
                            const aiText = json.candidates?.[0]?.content?.parts?.[0]?.text || "";
                            resolve({
                                statusCode: 200,
                                headers: { 
                                    "Content-Type": "application/json",
                                    "Access-Control-Allow-Origin": "*" 
                                },
                                body: JSON.stringify({ ok: true, text: aiText })
                            });
                        } else {
                            console.error("DEBUG: Google API Error Details:", JSON.stringify(json));
                            resolve({
                                statusCode: res.statusCode,
                                headers: { 
                                    "Content-Type": "application/json",
                                    "Access-Control-Allow-Origin": "*" 
                                },
                                body: JSON.stringify({ 
                                    ok: false, 
                                    error: json.error?.message || "Google API Error",
                                    details: json.error || null,
                                    status: res.statusCode
                                })
                            });
                        }
                    } catch (e) {
                        console.error("DEBUG: JSON Parse Error:", data);
                        resolve({ 
                            statusCode: 500, 
                            headers: { "Content-Type": "application/json" },
                            body: JSON.stringify({ ok: false, error: "Fout bij verwerken van AI antwoord" }) 
                        });
                    }
                });
            });

            req.on('error', (e) => {
                console.error("DEBUG: Request Error:", e.message);
                resolve({ 
                    statusCode: 500, 
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ ok: false, error: "Netwerkfout richting AI" }) 
                });
            });

            req.write(postData);
            req.end();
        });

    } catch (err) {
        return {
            statusCode: 500,
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ ok: false, error: "Global catch: " + err.message })
        };
    }
};
