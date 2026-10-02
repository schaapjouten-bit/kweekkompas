# Voorgestelde acties van de tuinassistent

Uitgevoerd op 2 oktober 2026, uitsluitend lokaal.

De oude algemene actieknop stuurde een plantnaam naar een functie die meteen een
nieuw zaaditem met standaardgegevens en de huidige zaaimaand aanmaakte. De
voorgestelde acties gebruiken dit pad nu niet meer.

- De frontend accepteert alleen bekende actietypes met een concreet onderwerp.
  Engelse actiewaarden zijn hoofdletterongevoelig; de zichtbare actielabels zijn
  Nederlands. Een beschrijving van een appelras vormt geen bewijs voor zaaien.
- Plantgebonden voorstellen vereisen een opgegeven plantnaam. Voor aankopen en
  concrete algemene werkzaamheden kan een expliciet onderwerp worden gebruikt.
  Ontbrekende namen worden niet uit antwoordtekst afgeleid. Ongeldige datums,
  onbekende bestemmingen en algemene verzorgingslabels vallen weg.
- Concrete aanbevelingen en aankopen krijgen uitsluitend **Op verlanglijst**.
  Tuinactiviteiten krijgen uitsluitend **Inplannen**. Een lege sectie verschijnt
  niet; eerst worden bruikbare voorstellen gezocht, vervolgens maximaal drie
  getoond.
- Inplannen opent de bestaande dagagenda in de kalender met een tijdelijk
  voorstel. De gebruiker kan titel en datum aanpassen. Een ontbrekende datum
  blijft leeg; de gebruiker kiest deze via het datumveld of de kalender.
  Pas de bevestigingsknop schrijft een herinnering. Annuleren of het sluiten
  van de dagagenda bewaart niets en herstelt eventueel eerder ingevulde tekst.
- Een herhaalde verlanglijsttoevoeging wordt op naam voorkomen. Een herhaalde
  planning wordt op titel en datum voorkomen. Bevestigingsknoppen en korte
  meldingen geven feedback. Meldingen blijven ook op mobiel binnen het scherm.
- Antwoorden, onderwerpen en aanvullende AI-labels gaan via tekstnodes;
  AI-inhoud wordt niet als HTML geïnterpreteerd. De backendprompt vraagt om
  passende voorstellen en verbiedt verzonnen namen, werkzaamheden en datums.

Provider/modelinstellingen (`services.js`) en de databasecode zijn byte voor
byte behouden. De backendaanroep en bestaande Ollama-, Gemini- en eigen-API-
koppelingen zijn behouden. Er zijn geen sleutels gelezen of gewijzigd.

## Lokale controle

`node tests/assistant-actions.cjs` gebruikt een afzonderlijke browseropslag,
een statische lokale server en gesimuleerde antwoorden in de browser.
Externe en AI-endpointaanvragen worden geblokkeerd. Negen controlescenario's:
Licht, Donker en Warm op 1440, 390 en 320 pixels. Per scherm worden geldige,
Engelse, onvolledige, onbekende en lege voorstellen, rasadvies, aankopen,
ongeldige datums, late geldige voorstellen, dubbelklikken, bevestigen,
aanpassen, annuleren en HTML-payloads gecontroleerd. Er worden geen zaaditems
aangemaakt of gewijzigd; provider/modelkeuze blijft behouden.

Gerichte tekstveiligheids- en actietests:

```powershell
node --test --test-name-pattern='AI-label|normale AI-actie|AI-voorstellen|Mijn tuin toont AI|generieke AI-actiefeedback|dashboardtoast' tests/dynamic-content-safety.test.js
```

Deze zes tests slagen. Bij een eerste volledige uitvoering van dit testbestand
bleek één bestaande planner-test naar de oude functietekst
`getPlannerActivities(monthIndex)` te zoeken. De functie had al vóór deze stap
de parameter `soonDate = null`. Die test valt buiten deze stap en is ongemoeid
gelaten; de AI-tests zijn afzonderlijk gecontroleerd.

Screenshots en browserrapport: `scratch/assistant-actions/`. Geen echte
AI-aanvragen, push of publicatie uitgevoerd.
