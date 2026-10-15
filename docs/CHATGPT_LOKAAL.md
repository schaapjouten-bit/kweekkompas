# ChatGPT in de lokale app

Start met `npm start`. Ga naar **Instellingen → AI → ChatGPT**, klik **Doorgaan met ChatGPT**, rond de login af en kies een beschikbaar model. Sla de AI-keuze op. Deze keuze geldt voor de tuinassistent en de zadenhulp. Gemini en Ollama blijven beschikbaar.

Deze koppeling gebruikt het eigen ChatGPT-abonnement via OpenAI's directe OAuth-flow voor persoonlijke lokale apps. Er is geen API-sleutel nodig. De beschikbare modellen en gebruikslimieten komen van het account. De huidige preview ondersteunt Plus en Pro. Op de live Netlify-site loopt ChatGPT via een beveiligde verbinding naar `127.0.0.1:4173`; daarvoor moet KweekKompas op dezelfde pc draaien met `npm start`. De login en tokens blijven op die pc. Op een andere computer moet de lokale app daar ook draaien en moet je daar apart inloggen.

De lokale backend bewaart de accountregistraties en tokens in `.kweek-chatgpt.json`. Het bestand is uitgesloten van Git en van de statische app. Browseropslag bevat alleen de gekozen provider en modelnaam. Uitloggen trekt de geselecteerde sessie in en verwijdert de lokale tokens; de registratie blijft beschikbaar voor opnieuw inloggen.

Implementatie: `scripts/chatgpt.cjs`, uitsluitend geladen door `scripts/dev-server.cjs`. De lokale brug accepteert alleen aanvragen vanaf `https://kweekkompas.netlify.app`, vanaf de eigen computer, en alleen voor de ChatGPT-login en AI-hulpen. De backend registreert een stabiel host-ID, gebruikt PKCE, controleert de callback en valideert de ID-tokenhandtekening, issuer, audience en nonce. Modellen komen uit `/v1/models`; beide AI-hulpen gebruiken `/v1/responses` met streaming en accepteren alleen een afgerond antwoord. Sessievernieuwing wordt binnen de lokale server geserialiseerd.

Verificatie: `node --test tests/chatgpt.test.js tests/chatgpt-bridge.test.js` en `node tests/chatgpt-browser.cjs` gebruiken uitsluitend testaccounts en nagebootste OpenAI-antwoorden. De browsercontrole loopt op 1440 en 390 pixels en test beide echte lokale AI-routes. Inloggen en een antwoord met een echt ChatGPT-account moeten nog door de gebruiker worden gecontroleerd.

Bronnen: [OpenAI registratie en login](https://developers.openai.com/siwc/token-sharing-open-source/sign-in), [modellen en antwoorden](https://developers.openai.com/siwc/token-sharing-open-source/models-and-inference), [accounts en sessies](https://developers.openai.com/siwc/token-sharing-open-source/profiles-and-sessions).
