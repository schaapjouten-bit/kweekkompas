# KweekKompas v2 — lokale controle

## Klikbare dashboardinzichten — 2 oktober 2026

De drie inzichtkaarten zijn volledige knoppen met een pijltje, subtiele hoverstijl en zichtbare toetsenbordfocus. Actieve planten opent het bestaande overzicht voor Gezaaid, Groeit en Geoogst. Taken deze week opent de kalender met dezelfde actuele open herinneringen en zaaitaken als de teller; achterstallige, toekomstige en voltooide herinneringen vallen buiten deze selectie. Binnenkort zaaien opent de volgende maand in de zaaiplanner met dezelfde voorraadselectie als de teller. De bestaande regels blijven gelden: planten die ook deze maand gezaaid kunnen worden en planten met een bestaande planning deze maand tellen niet als binnenkort.

Getest met `node tests/dashboard-navigation.cjs`: alle drie thema's op 1440, 390 en 320 px; muis, aanraking, Tab, Enter en spatie; zichtbare focus; exacte aantallen en bestemmingsfilters; wissen van filters; oude zoekterm/categorie/maandfilter; nulresultaten; weekgrens en december/januari-jaarwisseling. Geen browserexceptions of horizontale overloop bij de gecontroleerde schermen. Tuingegevens en herinneringen bleven ongewijzigd. De mobiele screenshot is ook visueel bekeken.

Deze controle gebruikte een aparte browsercontext met tijdelijke testgegevens en een statische lokale server. Backend- en externe aanvragen waren geblokkeerd; AI, API-sleutels en AI-tests zijn voor deze wijziging niet gebruikt of gewijzigd. Screenshots en testresultaat staan lokaal in `scratch/dashboard-navigation/`. Niets gepusht of gepubliceerd.

## Gerichte afronding — achterstallige taken, provider en Gemini

Uitgevoerd op 2 oktober 2026, uitsluitend lokaal. Vormgeving en bestaande opslagroutes behouden; geen planning automatisch verplaatst of voltooid.

### Achterstallige taken

Oorzaak: het dashboard nam alle open herinneringen met een datum vóór de volgende maandag op als actuele taak. Een ondergrens ontbrak, waardoor ook 17 april 2026 op 2 oktober onder Nu doen stond.

De gedeelde datumselectie vergelijkt nu geldige lokale kalenderdatums: **Achterstallig** vóór vandaag, **actueel** vandaag tot de volgende maandag (exclusief), **toekomstig** vanaf die maandag. Afgeronde en ongeldige herinneringen worden uitgesloten. Achterstallige taken staan in een aparte zichtbare sectie met echt aantal en hun oorspronkelijke geplande datum. De kaart Taken deze week telt dezelfde actuele open herinneringen plus de rechtstreeks getoonde actuele zaaitaken; achterstallige en voltooide taken tellen niet mee. De toekomstige sectie gebruikt dezelfde toekomstselectie. Oorspronkelijke datums en done-status blijven ongewijzigd totdat de gebruiker zelf handelt.

### Actieve provider

Dashboardlabel, instellingen en aanvragen van beide AI-hulpen lezen dezelfde opgeslagen provider/modelvoorkeur. Voorheen bleef een kopie van de voorkeur uit het laden van de pagina in geheugen staan. Dat kon achterlopen bij een wijziging vanuit een andere tab. Nu wordt bij renderen, openen van instellingen en elke AI-aanvraag opnieuw gelezen; een storage-event werkt ook een open instellingenpaneel en het dashboardlabel bij. Zonder eigen voorkeur geldt de backenddefault. Klikken op het label opent en focust de bestaande AI-instellingen.

### Werkelijke Gemini-diagnose — geen mockbewijs

Beide echte routes, tuinassistent én seed-info, zijn opnieuw aangeroepen met de daadwerkelijk geladen backendconfiguratie. Google antwoordde voor beide met:

- HTTP **400**, status **INVALID_ARGUMENT**.
- `google.rpc.ErrorInfo.reason`: **API_KEY_INVALID**; domain: **googleapis.com**.
- Bericht: “API key not valid. Please pass a valid API key.”

Gecontroleerd zonder sleutelwaarden te tonen: GEMINI_API_KEY is aanwezig, heeft geen buitenste spaties en voldoet aan het legacy Google-sleutelpatroon. Model: `gemini-2.5-flash`; backenddefault: `gemini`. Er is geen alternatieve GOOGLE_API_KEY geladen; naast .env staat uitsluitend .env.example. De externe reden is dus daadwerkelijk sleutelvalidatie; een modelwissel is geen aangetoonde oplossing. Of de sleutel bijvoorbeeld is ingetrokken of verkeerd is aangeleverd, valt niet uit deze fout te onderscheiden.

De backend leest deze specifieke Google-redencode en geeft alleen een vaste veilige uitleg door. Ruwe externe foutinhoud en sleutelwaarden worden niet naar de browser gestuurd. De huidige credential kan zonder geldige vervanging niet lokaal gerepareerd worden. **Nog nodig:** een door Google geaccepteerde GEMINI_API_KEY uitsluitend in de genegeerde backend-.env instellen en de lokale server herstarten; daarna beide echte hulpen opnieuw uitvoeren. Er is geen sleutel gewijzigd, geen mocktest als geslaagde Gemini-test opgevoerd en geen succesvolle Gemini-generatie geclaimd.

Veilig diagnostisch bewijs: `scratch/gemini-diagnosis.json`. Zie ook [Google: API keys](https://ai.google.dev/gemini-api/docs/api-key) en [Gemini troubleshooting](https://ai.google.dev/gemini-api/docs/troubleshooting).

### Daadwerkelijk getest

- `npm test`: **93/93 geslaagd**, inclusief 17 april tegenover 2 oktober, gisteren/vandaag/zondag/maandag, afgeronde taken, ongeldige datums, jaarwisseling en veilige verwerking van API_KEY_INVALID.
- `node tests/dashboard-followup.cjs`: achterstallig 1, actueel 2, toekomstig 1; oorspronkelijke planning en done-status na herladen identiek. Providerkeuze en model synchroniseren met een tweede tab, instellingen en beide AI-hulpen; de protocolaanvragen hiervoor zijn lokaal gemockt.
- `node tests/dashboard-visual.cjs`: bestaande functionele en visuele controles opnieuw geslaagd op 1586/768/390/320 px, alle drie thema’s, zonder overloop of paginafouten.
- `npm run build`: geslaagd.
- Echte Gemini voor beide hulpen: afgewezen met hierboven vastgelegde fout. Succescontrole geblokkeerd door ontbrekende geldige credential. Geen andere externe AI- of databaseconfiguratie gewijzigd.

Screenshots van de datumcorrectie: `scratch/dashboard-followup-1586.png` en `scratch/dashboard-followup-390.png`. Er is niets gepusht of gepubliceerd.

## Dashboard — eindcontrole stap 3 (2 oktober 2026)

De indeling uit stap 1 en inhoud uit stap 2 zijn behouden. Alleen concrete afwerking is toegevoegd: grotere sectie-iconen, uniforme SVG-favorietsterren, vierkante foto’s met `object-fit: cover`, grotere aanraakvlakken, minder geneste kaders en betere placeholder- en knopcontrastwaarden in Donker. Lange plantnamen worden op maximaal drie regels afgebroken; de volledige naam staat in de toegankelijke knopnaam en tooltip. Er zijn geen database- of AI-backendwijzigingen voor stap 3 uitgevoerd.

Bij de herhaalde stap-3-opdracht zijn de browsercontrole, echte AI-tests, 90 regressietests en build opnieuw uitgevoerd. De eindscreenshots zijn opnieuw gemaakt. Er waren geen aanvullende codecorrecties nodig.

### Echte verbindingstests — stap 3

- **Ollama:** echte aanvraag vanuit een geïsoleerde mobiele Chromium-browser via de lokale appbackend naar de aanwezige Ollama-server. `llama3:latest`: HTTP 200, geldig antwoord en zichtbaar in de tuinassistent. De laatste aanvraag duurde circa 5,1 seconden. Provider en model zijn via de bestaande AI-instellingen geselecteerd. Geen sleutels afgedrukt.
- **Gemini:** echte aanvraag met de aanwezige backendconfiguratie en `gemini-2.5-flash`. Gemini antwoordde HTTP 400; de appbackend gaf de veilige foutmelding via HTTP 502 door. De foutmelding is zichtbaar en de verzendknop wordt weer bruikbaar. Dit is **geen geslaagde Gemini-generatie**. De eerder vastgestelde ongeldige sleutel blijft een open configuratiepunt; er is geen nieuwe sleutel ingesteld.
- **Eigen OpenAI-compatibele API:** niet uitgevoerd, omdat de echte backendconfiguratie ontbreekt.
- Stap 3 heeft de echte tuinassistent getest. De echte zadenhulp is niet opnieuw uitgevoerd in deze stap; de eerdere Ollama-controle daarvan staat verderop in dit rapport.

Details zonder geheimen: `scratch/live-step3-report.json`. Screenshot van het echte Ollama-antwoord: `scratch/live-step3-ollama.png`.

### Mocktests en lokale browsercontroles — stap 3

- `node tests/dashboard-visual.cjs`: geslaagd in geïsoleerde browseropslag met opgeslagen testtuingegevens. Geen bestaande gebruikersgegevens of instellingen gewijzigd.
- Eindcontrole: `npm test` — **90/90 geslaagd**; `npm run build` — **geslaagd**. De build bevat geen backendgeheimen.
- Actuele en toekomstige taken, standaard ingeklapte sectie en echte aantallen, lege toestand, plannen, herinneringen afvinken en zaaien afvinken via bestaande opslagroutes.
- Planttabs, maximaal vier planten, werkende favorieten, thumbnails inclusief fallback bij een mislukte afbeelding, openen met toetsenbord, bewerken en doorklik naar exact de gekozen status in de bestaande zadenweergave.
- Providerknop opent en focust bestaande AI-instellingen. Opgeslagen eigen API-model gebruikt door gewone vraag en suggestieknop met een **lokale mockprovider**. Dit bewijst geen bereikbaarheid van een echte externe API.
- Aanvullende gesimuleerde AI-antwoorden: laden/uitgeschakelde verzendknop, lange tekst en lange woorden, veilige foutmelding en herstel van de knop.
- Desktop **1586 px**, tablet **768 px**, mobiel **390 en 320 px**, elk in Licht, Donker en Levendig. Geen horizontale pagina-overloop; lange AI-antwoorden blijven binnen het uitvoervak. Mobiele volgorde: titel/toevoegen, inzichten, Nu doen, Tuinassistent, Mijn planten.
- Zichtbare toetsenbordfocus, toetsenbordbediening van tabs en planten, begrijpelijke knopnamen, mobiele navigatie naar zaden/planning/kalender en dashboardlink naar AI-instellingen gecontroleerd.
- Tekstcontrast berekend uit browserkleuren: minimaal **4,5:1** voor datumondertekst, inzichtlabels, toevoegen/verzenden, providerknop, niet-geselecteerde tab en plantnaam in alle drie thema’s. Dit is een gerichte contrastcontrole, geen volledige toegankelijkheidsaudit.
- Volledige lokale dataset en AI-provider/model blijven gelijk na herladen. Er zijn geen pagina-JavaScriptfouten in de browserronde.

Eindscreenshots en machineleesbaar rapport: `scratch/dashboard-step3/`. Belangrijkste beelden: `light-1586.png`, `light-768.png`, `light-390.png`, `dark-320.png`, `playful-390.png`. Daarnaast staan er stress-, fout- en lege-toestandsbeelden.

### Resterende afwijkingen en niet uitgevoerde controles

- De bestaande zijbalkbreedte en navigatie zijn behouden; ze verschillen van het ontwerp. De drie bestaande plantstatussen blijven alle beschikbaar. Geen plantdatums getoond: er is geen eenduidig opgeslagen datumveld voor die betekenis aangetroffen.
- De ontwerpen tonen andere voorbeeldplanten en aantallen. Screenshots gebruiken uitsluitend aantallen uit de opgeslagen testtuin; de app hardcodeert geen ontwerpgegevens.
- Gemini vereist geldige externe configuratie; een eigen API is niet ingesteld. Productie-Supabase en hostingbereikbaarheid zijn in stap 3 niet getest of gewijzigd.
- Alleen Chromium met gesimuleerde viewports, geen fysieke telefoon, Safari of Firefox. Geen volledige screenreaderaudit.
- Geen push, publicatie of deploy uitgevoerd. Stap 3 stopt bij lokale controle en build.

Uitgevoerd op 2 oktober 2026. Er is niets gepusht, gepubliceerd of op een extern Supabase-project gewijzigd. Bestaande niet-gecommitte wijzigingen zijn behouden. De bestaande app, IndexedDB (`MoestuinDB`), profielmigratie en versie-1-back-ups blijven in gebruik.

## Wat is aangepast

- Optioneel inloggen met een bestaand, bevestigd Supabase-account via de backend. Sessietokens staan in HttpOnly-cookies, met SameSite=Strict en Secure buiten de lokale ontwikkelserver. Auth valideert de gebruiker via `getUser`; sessies kunnen worden vernieuwd en worden bij uitloggen ingetrokken.
- Handmatige synchronisatie van zaden, foto's/notities, profiel, verlanglijst, herinneringen, voortgang, thema en bestaande interfacevoorkeuren. Inloggen en uitloggen vervangen geen lokale gegevens. Uploaden en downloaden vragen in de app expliciet welke kopie wordt vervangen.
- Versiecontrole bij upload voorkomt stil overschrijven door een verouderd apparaat. Een wijziging van account tijdens het uploaden wordt ook geweigerd. Een bewuste kopie naar een ander account vraagt een afzonderlijke bevestiging in de app.
- Cloudherstel gebruikt de bestaande volledige back-upvalidatie en herstel met rollback. Vooraf wordt een persistente veiligheidskopie in `KweekKompasSafety` gemaakt. Deze is via Instellingen terug te zetten en wordt bij een lokale reset verwijderd. Reset verwijdert de cloudkopie niet.
- SQL-migratie met RLS en expliciete SELECT/INSERT/UPDATE-rechten voor de eigen gebruiker. Geen service-role-sleutel, SECURITY DEFINER, openbare schrijfpolicy of DELETE-recht voor browsergebruikers.
- Instellingen → AI biedt Gemini, Ollama en een eigen OpenAI-compatibele API, met een gedeelde provider/modelkeuze voor tuinassistent en zadenhulp. Ollama-modellen worden vanaf de backend opgehaald. Modelnamen kunnen ook worden ingevuld.
- Sleutels en API-adressen blijven in backendomgevingsvariabelen. Browseropslag bevat uitsluitend provider en model. De server echoot geen externe foutdetails of sleutels. Er is geen automatische overstap naar een andere provider.
- Bestaande teeltprompts en veilige rendering blijven behouden. AI-fouten zijn zichtbaar en laten de knoppen opnieuw werken. Notities scannen werkt ook vóór het eerste openen van het zaadformulier.
- Concrete visuele correcties: zoekicoon/tekstoverlap, kompas- en merkcontrast, schaduwen van gesloten panelen, smalle meldingen, afknippende AI-acties, planttitels zonder foto, donkere verlanglijstvelden, modallabels en scrollbare mobiele modals.
- De lokale server serveert alleen appbestanden en assets. De statische build bevat geen `.env`, backendcode, Git-map, testbestanden of back-ups.

## Daadwerkelijk getest

- `npm test`: 90 tests geslaagd, inclusief de 87 bestaande regressietests. De lokale server is ook getest tegen padtraversal met Windows-backslashes en gecodeerde paden.
- PostgreSQL via PGlite: de echte migratie uitgevoerd; eigen rijen leesbaar/schrijfbaar, andere accounts afgeschermd, eigenaarwijziging geweigerd, anonieme toegang en DELETE geblokkeerd; verouderde updates wijzigen geen rijen. Alleen de Supabase-claimfuncties en gebruikersfixture worden hiervoor lokaal nagebootst.
- Backend met een lokale HTTP-testdienst: geslaagde/onjuiste login, cookieflags, sessievernieuwing, uitloggen, accountisolatie, uploads/downloads, conflicten, accountwissel, alle drie providerprotocollen voor beide hulpen, ongeldige JSON/modelkeuze en veilige foutmeldingen. Vernieuwde cookies blijven ook bij een daaropvolgende providerfout behouden.
- Playwright/Chromium in een afzonderlijk browserprofiel: lokale gegevens behouden bij inloggen/uitloggen; twee accounts; cloudherstel en veiligheidskopie terugzetten; Ollama en eigen API kiezen; AI-voorstel, inclusief zaai-/oogstmaanden, handmatig opslaan; providerfouten; kalenderherinnering; echte back-updownload; mobiele navigatie; geheimen buiten localStorage/sessionStorage; lokale reset met behoud van de cloudfixture.
- 131 schermafbeeldingen op 1440, 390 en 320 pixels: Mijn tuin, Zaden, Zaaiplanner, Kalender, Verlanglijst, zaadformulier, plantdetails met/zonder foto, Instellingen inclusief AI/cloud/opslag en de verlanglijst-/notitiemodals. Light, Dark en Levendig gecontroleerd. Ook onboardingstappen en mobiel menu bekeken. Geen pagina-overflow of JavaScript-paginafouten in de laatste browserronde.
- Echte Ollama op deze computer: `llama3:latest` levert HTTP 200 en geldig gestructureerde antwoorden voor tuinassistent én zadenhulp. Ook beide functies via de mobiele browser uitgevoerd; geïnstalleerde modellen verschijnen in Instellingen.
- Echte Gemini-aanvraag geprobeerd: HTTP 400, `INVALID_ARGUMENT`, reden `API_KEY_INVALID`. Er is dus geen geslaagde Gemini-generatie met de aanwezige sleutel geclaimd.
- Statische build en lokale Netlify-functionbundeling van de zes moderne routes geslaagd. Geen deploy uitgevoerd.

Screenshots, het machineleesbare browserrapport en tijdelijke functionbundels staan onder de door Git genegeerde map `scratch/`. Dit is visuele controle in Chromium met mobiele viewports; er is geen fysieke iPhone/Android- of Safari-test uitgevoerd.

## Externe configuratie die nog nodig is

1. **Supabase:** stel `SUPABASE_URL` en `SUPABASE_PUBLISHABLE_KEY` in de backend in. Een bestaande legacy anon-sleutel kan via `SUPABASE_ANON_KEY`; secret/service-role-sleutels worden geweigerd. Voer `supabase/migrations/20261002131955_kweekkompas_user_snapshots.sql` op het bedoelde project uit en zorg voor een bestaand bevestigd account met e-mail/wachtwoordlogin. Het echte project, e-mailconfiguratie en productie-RLS zijn hier niet getest: projecttoegang/configuratie ontbreekt. De migratie is uitsluitend lokaal getest.
2. **Gemini:** vervang de ongeldige `GEMINI_API_KEY` in de backend door een geldige sleutel en kies een model waarvoor dat project toegang/quota heeft. Optioneel: `GEMINI_MODEL` en `GEMINI_MODELS` (komma's).
3. **Eigen API:** stel `OPENAI_COMPATIBLE_BASE_URL` inclusief bijvoorbeeld `/v1`, `OPENAI_COMPATIBLE_MODEL` en, indien de dienst authenticatie vereist, `OPENAI_COMPATIBLE_API_KEY` in. Optionele modellijst: `OPENAI_COMPATIBLE_MODELS`. De echte externe dienst is niet ingesteld/getest; het protocol is lokaal nagebootst.
4. **Ollama bij een andere backend:** lokaal werkt `http://127.0.0.1:11434` met het aanwezige `llama3:latest`. Een gehoste backend heeft zijn eigen bereikbare Ollama-server nodig via `OLLAMA_BASE_URL`; localhost op een hostingserver verwijst niet naar deze computer. Externe AI-adressen moeten HTTPS gebruiken.

`KWEEK_LOCAL_DEV=true` wordt uitsluitend door `npm start` voor de lokale ontwikkelserver gezet. Zet dit niet op een gehoste backend. Gehoste AI-aanvragen vereisen Supabase-login; lokale AI kan zonder cloudaccount worden getest.

## Lokaal starten

Gebruik Node.js 22 of nieuwer (getest met Node.js 24). Voer `npm ci` en `npm start` uit en open `http://127.0.0.1:4173`. Kies bij Instellingen → AI **Ollama** en **llama3:latest** voor de hier werkende lokale provider. Bewaar echte sleutels in de genegeerde `.env` of backendsecretconfiguratie; `.env.example` bevat alleen de variabelenamen/voorbeelden.

Voor browsercontroles: `npx playwright install chromium`, daarna `npm run test:browser`. `npm run build` maakt alleen de lokale statische map `dist`.

De bestaande Vercel-Gemini-route heeft een compatibiliteitsadapter behouden. Het volledige nieuwe routeset en de bundeling zijn voor Netlify/lokale server ingericht; een Vercel-publicatie is niet getest of voorbereid.

## Geraadpleegde documentatie

- [Supabase-sessies](https://supabase.com/docs/guides/auth/sessions)
- [Supabase Row Level Security](https://supabase.com/docs/guides/database/postgres/row-level-security)
- [Supabase inloggen met wachtwoord](https://supabase.com/docs/reference/javascript/auth-signinwithpassword)
- [Gemini gestructureerde output](https://ai.google.dev/gemini-api/docs/structured-output)
- [Ollama generate API](https://docs.ollama.com/api/generate)
