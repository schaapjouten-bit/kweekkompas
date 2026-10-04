# Prompt 4 — browserverbinding met lokale Ollama

De online HTTPS-app gebruikt bij provider `ollama` rechtstreeks
`http://127.0.0.1:11434/api/tags` en `/api/generate`. De lokaal gestarte
app behoudt de backendroute. Browser en backend delen de oorspronkelijke
prompts en JSON-validatie via `ai-contract.js`. Er is geen Gemini-fallback.

## Gerichte controle op 4 oktober 2026

- Geïsoleerde Chromium-context, echte document-origin
  `https://kweekkompas.netlify.app`, secure context. Voor publicatie zijn alleen
  de gewijzigde appbestanden lokaal geleverd via Playwright resource-routing;
  de Ollama-aanvragen waren echt en ongemockt. Geen preview-origin nodig.
- Lokale-netwerktoestemming verleend voor uitsluitend de productie-origin;
  geen flags om CORS, mixed content of netwerkbeveiliging uit te schakelen.
- GET `/api/tags`: bereikbaar, `llama3:latest` aanwezig. Test genereert niets.
  Een niet-bestaand testmodel werd apart als ontbrekend gemeld.
- Precies één echte generatie per AI-hulp: zadenhulp vulde een Tuinkers-voorstel
  in, zonder opslaan. De tuinassistent bereikte Ollama, maar het modelantwoord
  miste vereiste gegevens; bestaande validatie wees dit af en toonde hulp.
  Dit is geen geslaagde inhoudelijke tuinassistentcontrole.
- Browserrechten daadwerkelijk op denied gezet in dezelfde geïsoleerde
  context: specifieke rechtenmelding met hulplink bij test en beide helpers.
  Vraag en plantnaam bleven behouden; geen generatie of Gemini-aanvraag.
- Downloadlink, kopiëren en installatiehulp gecontroleerd. Gewijzigde
  instellingen bekeken op desktop Licht en mobiel Donker/Warm. Neutrale
  hulpscreenshot vernieuwd.
- Syntaxcontroles en één lokale build geslaagd. Geen brede testsuite,
  betaalde aanvragen, cloudwrites, herstelmails of echte tuingegevens.

## Windows-instelling nog door de gebruiker uit te voeren

De bestaande gebruikersvariabele `OLLAMA_ORIGINS` was `*`; de draaiende server
antwoordde met `Access-Control-Allow-Origin: *`. De agent heeft dit niet
ingesteld. De automatische goedkeuringscontrole weigerde het wijzigen van
de variabele en herstarten met `blocked by policy`.

Stel via **Omgevingsvariabelen voor uw account** de gebruikersvariabele
`OLLAMA_ORIGINS` in op `https://kweekkompas.netlify.app`, zonder slash of
wildcard. Behoud andere bestaande expliciete origins, kommagescheiden.
Er waren hier geen andere expliciete origins ingesteld. Sluit Ollama volledig
af en start het opnieuw. Laat de standaardbinding 127.0.0.1 behouden.

De verbinding is getest met de bestaande serverinstelling; beperking tot de
exacte origin is daarmee niet bewezen. Een telefoon gebruikt zijn eigen
loopbackadres en bereikt via deze route geen Ollama op de pc.
