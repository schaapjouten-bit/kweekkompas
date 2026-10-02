# Gemini-modelkeuze — stap 3

Provider en model blijven samen opgeslagen onder `kweekkompas_ai`. De bestaande
`requestAI`-functie leest deze voorkeur opnieuw voor iedere aanvraag; het
storage-event werkt ook de instellingen en het dashboard in andere tabbladen bij.
De backendcode voor Ollama en de eigen API is behouden.

Gemini gebruikt een dropdown. `/api/ai-models` haalt de lijst op met een backend-
sleutel in de `x-goog-api-key`-header, volgt paginering en geeft uitsluitend
model-id, zichtbare naam, korte aanduiding en aanbevolen standaard terug.
De filter vereist `generateContent` en een tekstmodel uit de Flash/Flash-Lite/Pro-
familie; aparte audio-, live-, afbeeldings- en embeddingmodellen vallen buiten de
lijst. Om beschikbare modellen te bepalen worden geen generatieaanvragen gedaan.

Aanvulling op 2 oktober 2026: de dropdown bevat altijd de vaste standaardmodellen
`gemini-3.8-flash` (Gemini 3.8 Flash) en `gemini-3.5-flash-lite` (Gemini 3.5
Flash-Lite). Flash-Lite is de zuinige standaard wanneer er geen bestaande keuze
is. Google documenteert voor de standaard betaalde API $0,30 invoer en $2,50
uitvoer (inclusief denktokens) per miljoen tokens voor deze Flash-Lite-variant.
De model-ID, tekstuitvoer en prijs zijn gecontroleerd in de officiële Google-
documentatie; beschikbaarheid met de huidige sleutel is niet gecontroleerd.
Er worden geen prijzen in de interface getoond. Een opgeslagen keuze krijgt voorrang.
`gemini-2.5-flash` wordt alleen behouden als bestaande keuze, nooit stilzwijgend
als nieuwe standaard gebruikt.

Bij een ontbrekende, lege of mislukte lijst blijven de standaardmodellen én de
opgeslagen keuze selecteerbaar en opnieuw op te slaan. De melding is:
“Standaardmodellen — beschikbaarheid nog niet gecontroleerd.” Niet teruggegeven
modellen hebben ook een korte aanduiding “niet gecontroleerd” bij hun optie.
Een succesvolle Models API-respons vult de lijst zonder duplicaten aan met de
ondersteunde modellen en behoudt de actuele selectie. Een eerder opgeslagen
model dat niet in de API-lijst staat, blijft zichtbaar en selecteerbaar; dit is
geen uitspraak over beschikbaarheid of een geslaagde generatieaanvraag.
De frontend doet één lijstpoging per pagina; opnieuw openen of wisselen van
provider doet geen nieuwe poging. Herladen maakt een nieuwe lijstpoging mogelijk
en behoudt de opgeslagen keuze. Een late succesvolle respons in dezelfde pagina
behoudt ook een inmiddels opgeslagen fallbackkeuze. De backend deelt gelijktijdige aanvragen en
cacht resultaten en tijdelijke fouten vijf minuten. Bij een geweigerde sleutel
blijft de fout gecacht zolang dezelfde backendinstantie en configuratie bestaan.
Een nieuwe backendinstantie kan opnieuw een lijstpoging doen.

## Lokale controle

- `node --test tests/gemini-models-step3.test.js`: alleen gesimuleerde GET-
  modelantwoorden; filtering, paginering, veilige fouten, caching, lege lijst,
  providerconfiguratie en bestaande koppeling van beide AI-hulpen.
- `node tests/gemini-step3.cjs`: geïsoleerde browseropslag; Licht/Donker/Warm op
  1440/390/320 px, dropdown, opslaan, bestaande en verdwenen keuzes, lege lijst,
  foutmelding, netwerkfout en onbereikbare backend, tabbladsynchronisatie,
  herladen, laat binnenkomende/gedeeltelijke lijsten, Ollama en eigen modelveld.
  De gedeelde aanvraagfunctie is met vervangen `fetch` gecontroleerd voor beide
  AI-hulpen; daarbij bereikt geen POST-aanvraag een server.
  Alle POST-aanvragen en externe browseraanvragen zijn geblokkeerd.
- Stap 1/2-bestanden zijn byte voor byte gelijk aan de veiligheidskopie van vóór
  stap 3. De bestaande sleutel en databasecode zijn niet gewijzigd.

Oorspronkelijke screenshots: `scratch/gemini-step3/`. Aanvullende screenshots en
resultaten: `scratch/gemini-fallback/`. Er is geen echte modelaanvraag
met de gebruikerssleutel uitgevoerd en geen AI-generatieaanvraag gedaan.
Beschikbaarheid met die sleutel is dus niet bevestigd; die hangt af van Google
en de backendconfiguratie. Sleutelproblemen zijn niet onderzocht of hersteld.
Niets gepusht of gepubliceerd.

## Bronnen

- [Gemini Models API](https://ai.google.dev/api/models)
- [Beschikbare modellen](https://ai.google.dev/gemini-api/docs/models)
- [Gemini 3.5 Flash-Lite](https://ai.google.dev/gemini-api/docs/models/gemini-3.5-flash-lite)
- [Gemini 3.1 Flash-Lite](https://ai.google.dev/gemini-api/docs/models/gemini-3.1-flash-lite)
- [Gemini 3.8 Flash](https://ai.google.dev/gemini-api/docs/models/gemini-3.8-flash)
- [Officiële API-prijzen](https://ai.google.dev/gemini-api/docs/pricing#gemini-3.5-flash-lite)
