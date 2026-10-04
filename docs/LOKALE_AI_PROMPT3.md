# Prompt 3 — Lokale AI en installatiehulp

De provider heet nu **Lokale AI (Ollama)**. De interne waarde `ollama`, standaard `llama3:latest` en expliciet opgeslagen modelkeuzes zijn behouden.

Instellingen → AI bevat de korte uitleg, downloadlink, kopieerbaar modelcommando, Verbinding testen en een directe installatiehulplink. Hulp → Veelgestelde vragen bevat Lokale AI gebruiken, met installatie, modelkeuze, lokale/online/andere-apparaatverbinding, problemen en een actuele screenshot met neutrale testgegevens. Beide AI-hulpen tonen bij Ollama-verbindingsfouten een directe hulplink en laten invoer staan.

## Werkelijke route

- Browser → dezelfde KweekKompas-backend via `/api/ai-config` voor de verbindingstest.
- Backend → `OLLAMA_BASE_URL` (lokaal standaard `http://127.0.0.1:11434`) → `GET /api/tags`. De test verstuurt geen prompt of generatieaanvraag. Alleen daadwerkelijk teruggegeven modellen bepalen of het gekozen model aanwezig is; ingestelde modelnamen gelden niet als bewijs dat ze geïnstalleerd zijn.
- De bestaande generatiepaden blijven Browser → `/api/seed-info`, `/api/tuinassistent` of `/api/gemini-ai` → backend → Ollama `/api/generate`. Het adres blijft backendconfiguratie, niet een willekeurig browseradres.
- Lokaal draait de backend via `scripts/dev-server.cjs`. Online lopen dezelfde routes via Netlify Functions. Netlify-localhost verwijst naar Netlify, niet naar de computer van de gebruiker. Er is geen nieuwe directe browserverbinding of tunnel gemaakt en Ollama is niet publiek opengesteld. Een afwijkende, beveiligde serververbinding zou afzonderlijk geconfigureerd moeten worden. Browserrechten/CORS lossen deze Netlify-localhostbeperking niet op.

Bronnen voor het Ollama-gedeelte: [modellenlijst](https://docs.ollama.com/api/tags), [installatie en bereikbaarheid](https://docs.ollama.com/faq), [download](https://ollama.com/download).

## Gerichte controles

- `node --test tests/ollama-connection.test.js`: geslaagd; mock van alleen `GET /api/tags`, bereikbaar/leeg/onbereikbaar/ongeldig adres/online niet ingesteld, standaard en expliciet model behouden. Geen echte AI- of sleutelverzoeken.
- `node tests/ollama-browser.cjs`: geslaagd met afzonderlijke browseropslag en een statische testserver. Downloadlink, echt clipboard-kopiëren, hulp, voorbeeldafbeelding, verbindingstest bij beschikbaar/ontbrekend/onbereikbaar/online, opgeslagen ander model, fouthulplinks van beide AI-hulpen en behoud van vraag/plantgegevens.
- Licht, Donker en Warm op 1440, 390 en 320 pixels; geen horizontale paneeloverflow of browserfouten. Screenshots staan in `scratch/ollama-check/`. De publieke hulpafbeelding is `assets/help/local-ai-settings.png`.
- De UI-fouten zijn gesimuleerd; geen echte generatieaanvragen. De tuinrecords zijn voor en na gelijk. Backend- en externe netwerkverzoeken zijn in de browsertest onderschept.
- JavaScript-syntax en lokale build geslaagd. Planning, accountbeheer, foto-opslag, voorbeeldcollecties, synchronisatie en keepalive zijn behouden. Geen `.env`- of sleutelwijziging, commit, push of publicatie.
- De lokale server is herstart om de gewijzigde backendcode te laden. Een echte, alleen-lezen controle via `/api/ai-config` bevestigde dat Ollama bereikbaar is en `llama3:latest` aanwezig is; er is geen generatieaanvraag verstuurd.

Werk gestopt na Prompt 3.
