# KweekKompas — vernieuwingsplan

Werkplan op basis van de screenshots, de bekeken instap en de besproken wensen. De eerste code-inventarisatie en de hierboven vastgelegde opslag-, profiel- en previewverbeteringen zijn uitgevoerd. Dit plan beschrijft daarnaast de resterende gewenste verbeteringen.

## Doel en afspraken

Een persoonlijke tuinapp die prettig werkt, betrouwbare opslag heeft en helpt met zaden, eetbare planten, tuinideeën en experimenten. Eerst de bestaande basis afmaken. Nieuwe functies daarna één voor één kiezen.

- Bestaande tuingegevens, foto's, eigen teksten en functies behouden.
- Kleine, genummerde bouwopdrachten; per opdracht één duidelijk resultaat.
- Geen volledige herbouw, frameworkwissel of nieuwe afhankelijkheden zonder concrete noodzaak.
- Eerst lokaal of in een aparte preview bouwen. Live publiceren is een aparte beslissing.
- Light, Dark en Speels blijven beschikbaar. De lichte Mijn zaden-mock-up blijft de visuele basis voor structuur en leesbaarheid; de definitieve Speels-richting is `docs/design/speels1-def.png`. De latere botanische en kaartgerichte ontwerpen zijn alleen inspiratie.
- De bestaande afbeeldingenzoeker behouden en verbeteren.
- Light, Dark en Speels blijven als drie gelijkwaardige modi beschikbaar. Alle modi delen functies, informatiearchitectuur en basislayout.
- De sidebar/app-shell en menu-indeling volgen vooral `docs/design/dark1-vb.png` en `docs/design/dark2-vb.png`; `docs/design/idee2.png` is aanvullende inspiratie voor de sidebar en het appsysteem.
- `docs/design/speels1-def.png` is de definitieve Speels-referentie. `docs/design/speels1-vb.png` is geen hoofdreferentie.
- `docs/design/icon-light-speels.png` en `docs/design/icondark.png` zijn de iconenreferenties. Ontbrekende iconen worden later als samenhangende sets voor alle drie modi aangevuld.
- Volgens de gebruiker zijn OpenAI-, Gemini- en Ollama-koppelingen al aanwezig. Bereik, instellingen en werking moeten in de code worden vastgesteld.
- De gebruiker heeft OpenAI- en Gemini-credits. Niet veronderstellen dat ieder gewenst model, zoeken of beeldgeneratie al werkt.
- Tuinopslag en AI-verwerking zijn twee verschillende zaken. Lokale opslag betekent niet dat AI-vragen lokaal worden verwerkt.

## Actuele projectstatus

- Fase 1A (veilige opslaglezing) is volledig afgerond.
- `Volle zon` wordt veilig genormaliseerd naar `Zon`.
- Reminderdata is opgenomen in veilige back-up en herstel.
- `userProfile` is het canonieke profielmodel; legacyprofielen blijven compatibel.
- Onboarding schrijft `gardenType`, `light` en `experience` correct.
- Gerichte regressietests voor deze onderdelen zijn toegevoegd en slagen.
- Er is een losstaande design-preview; deze is geen productie-implementatie.
- De geautomatiseerde Fase 1B-code- en testpunten zijn afgerond: versie-1-exports, afwijzing van toekomstige versies, volledige validatie vóór schrijven, atomiciteit/rollback, datasetsemantiek en round-triptests.
- Fase 1B is nog niet volledig afgerond; de handmatige browsercontrole voor export en herstel staat nog open.

## 1. Projectinventarisatie — uitgevoerd

Status: de inventarisatie is uitgevoerd. De onderstaande punten blijven de referentie voor eventuele open verificatie; een productie-redesign blijft een aparte stap.

Open de actuele projectmap lokaal in VS Code/Codex, of lever een ZIP zonder geheimen en gegenereerde afhankelijkheden aan voor onderzoek hier. Leg bestaande wijzigingen vast voordat er wordt aangepast; overschrijf geen onopgeslagen werk.

Onderzoek:

- Projectinstructies, techniek, startcommando's, build en bestaande tests.
- Schermen: Mijn tuin, Zaden, Zaaiplanner, Kalender, Verlanglijst, Instellingen en onboarding.
- Gegevensmodel, versiebeheer/migraties, localStorage/IndexedDB en foutafhandeling.
- Back-up, herstellen, importeren en afbeeldingenopslag.
- Afbeeldingenzoeker: gebruikte dienst, zoektermen, resultaten, broninformatie, selectie en opslag.
- OpenAI, Gemini en Ollama: bestaande endpoints, modellen, configuratie en bereikbaarheid. Geheimen niet in rapporten of chat afdrukken.
- Gebruik van tuintype, zonlicht en ervaring in suggesties.
- Bekeken probleem: na keuze Gemengd verschijnt nog Geen type in Instellingen. Vaststellen of dit een opslag-, vertaal- of weergaveprobleem is.
- Nagaan wat de automatisch toegevoegde voorbeeldcollectie precies doet en of die werkelijk afhangt van de antwoorden.

Oplevering: een korte tabel met bestaat / werkt / defect / ontbreekt, betrokken bestanden en de kleinste veilige eerste wijziging. De losse design-preview is inmiddels beschikbaar, maar geldt niet als productie-redesign.

## 2. Opslag en bestaande gegevens veilig maken

- Maak en bewaar een back-up voordat gegevenslogica verandert.
- Controleer opslaan, herladen, exporteren, herstellen en importeren met afzonderlijke testgegevens.
- Een ongeldig bestand of opslagfout mag bestaande gegevens niet stil overschrijven of leegmaken.
- Maak duidelijk of herstellen vervangt en importeren aanvult; implementeer teksten passend bij het werkelijke gedrag.
- Controleer dubbele records, ontbrekende velden en oudere back-upversies voor zover ondersteund.
- Neem AI-geheimen niet op in gewone tuinback-ups.
- Toon in Instellingen waar gegevens staan: deze browser/lokaal of, als later beschikbaar, online.
- Verander Backup bouwen naar Back-up downloaden.
- Maak een eventueel vervangende herstelactie vooraf inzichtelijk.

Databasebeslissing: lokale opslag blijft bruikbaar. Als telefoon/computer automatisch dezelfde tuin moeten tonen, is online opslag een aparte werkstroom met toegang, gegevensmigratie en conflictafhandeling. Pas een echte online keuze aanbieden wanneer deze werkt; niet automatisch tuingegevens uploaden. Dit is nog geen vast onderdeel van de eerste vernieuwde versie.

Klaar (nog niet bereikt): de bewaarroutes zijn aantoonbaar betrouwbaar en een gebruiker begrijpt waar gegevens staan.

## 3. Visuele basis vastleggen en op één scherm uitvoeren

Begin bij Mijn zaden. Gebruik de goedgekeurde lichte mock-up als stijlbasis:

- Warme gebroken witte achtergrond, witte kaarten, donkergroene tekst en rustig groen voor acties.
- Vaste tekstgroottes, tussenruimtes, hoeken, velden en knoppen.
- Consistente iconen, minder gloed en een duidelijke primaire actie per scherm.
- Compacte navigatie; beschikbare breedte gebruiken zonder onnodig lege randen.
- Bestaande Standaard/Breed-keuze behouden.
- Dark als gelijkwaardige modus met leesbare tekst en onderscheid tussen achtergrond, kaarten en velden. Speels krijgt dezelfde functies en basislayout met een eigen rustige, geïllustreerde stijl.
- Alle drie modi op desktop, tablet en telefoon beoordelen; toetsenbordfocus en contrast blijven gelijkwaardig.
- De vaste app-shell/sidebar en menu-inhoud volgen vooral `docs/design/dark1-vb.png` en `docs/design/dark2-vb.png`; `docs/design/idee2.png` is aanvullende inspiratie.
- De iconenreferenties zijn `docs/design/icon-light-speels.png` en `docs/design/icondark.png`; ontbrekende iconen worden later als samenhangende sets voor Light, Dark en Speels aangevuld.

Zadenpagina: één doorlopend raster, volledige namen op maximaal enkele regels, favorieten als filter of sortering, herkenbare categorieën en zichtbare zaai-/oogstperiodes. Kaart- en eventueel lijstweergave alleen toevoegen als dit nuttig is.

Klaar (productie-implementatie, nog niet bereikt): één compleet scherm is visueel akkoord in Light, Dark en Speels. Pas daarna de rest omzetten.

Acceptatiecriteria voor de visuele omzetting:

- Functionele pariteit tussen alle drie modi.
- Goede zichtbare toetsenbordfocus.
- Responsive desktop-, tablet- en mobiele weergave.
- Minimaal WCAG 4.5:1 voor normale tekst.
- Geen functiewijzigingen tijdens puur visuele omzetting.
- Eerst per scherm controleren voordat de stijl app-breed wordt toegepast.
- De design-preview blijft een ontwerpomgeving en wordt niet als productie-implementatie beschouwd.

### Definitieve volgorde Fase 7

1. **Fase 7A — Gedeeld designsysteem:** gedeeld designsysteem, thematokens en responsive sidebar/app-shell voor Light, Dark en Speels.
2. **Fase 7B — Mijn zaden:** eerste productie-styleproof.
3. **Fase 7C — Instellingen:** Instellingen, inclusief Data & opslag.
4. **Fase 7D — Onboarding:** onboarding zonder wijzigingen aan opslag- of profielgedrag.
5. **Fase 7E — Dagelijkse schermen:** Mijn tuin, Zaaiplanner, Kalender en Verlanglijst.
6. **Fase 7F — Afronding:** ontbrekende iconen aanvullen, volledige moduspariteit en app-brede visuele controle.

Elke subfase behoudt bestaande functionaliteit en wordt afzonderlijk gecontroleerd voordat de volgende subfase begint.

## 4. Eerste instap opnieuw vormgeven

Houd de stappen kort en overzichtelijk. Voorgestelde volgorde:

1. Welkom en opslag: meteen uitleg over bewaren in deze browser, ontbreken van automatische synchronisatie en back-up. Beginnen of Back-up herstellen. Light, Dark en Speels direct beschikbaar.
2. Jouw tuin: concrete kweekplekken zoals volle grond, bakken/potten, balkon/terras. Meerdere keuzes waar het gegevensmodel dat ondersteunt; bestaande profielwaarden behouden of migreren.
3. Zonlicht: kies `Volle zon` (technische waarde `Zon`), `Halfschaduw` of `Schaduw`. Wie nu niets wil invullen gebruikt de bestaande actie `Later invullen`.
4. Ervaring: alleen vragen als het antwoord daadwerkelijk invloed heeft. Uitleggen waarvoor het wordt gebruikt.
5. Beginnen: keuzes samenvatten. Leeg beginnen of zelf voorbeeldplanten kiezen. Geen ongevraagde vulling van de collectie.

Elke vraag: duidelijke voortgang, selectie zichtbaar, Terug en Verder op dezelfde plek, ingevulde antwoorden behouden. Optionele vragen kunnen later worden ingevuld. Bestaande gebruikers niet zonder reden opnieuw door onboarding sturen.

Klaar: nieuwe gebruiker begrijpt opslag, kan corrigeren en ziet de juiste keuzes terug in het profiel.

## 5. Bestaande dagelijkse schermen verbeteren

| Scherm | Verbetering |
| --- | --- |
| Mijn tuin | Nu doen en Volgend seizoen scheiden; eigen planten en eerstvolgende handelingen zichtbaar; tuinassistent compacter. |
| Zaden | Stijl uit stap 3 doortrekken; begrijpelijke knoppen zoals Inplannen en Gezaaid; bestaande zoek- en filtermogelijkheden behouden. |
| Planning | Voorstel: Zaaiplanner en Kalender onder één navigatieonderdeel met Jaar en Maand. Een Agendaweergave is optioneel. Bestaande gegevensrelaties behouden. |
| Jaaroverzicht | Compactere maanden, aantallen met betekenis en enkele plantnamen; doorklikken naar de relevante lijst. |
| Kalender | Zichtbaar raster, Vandaag, Taak toevoegen bij de titel en begrijpelijke dagdetails. |
| Verlanglijst | Overal dezelfde naam, invoer bovenaan, items direct eronder. Planten als categorie pas toevoegen als het model dat netjes ondersteunt. |
| Instellingen | Groeperen in Tuinprofiel, Weergave, Data & opslag, AI & verbindingen, Help. Ruimere vensters, sluitknop vrijhouden van de scrollbar. |

Klaar: ieder bestaand scherm heeft dezelfde vormgeving en duidelijke hoofdhandelingen.

## 6. AI & verbindingen instelbaar maken

Werk bestaande koppelingen uit tot één begrijpelijke instellingensectie:

- AI aan/uit; gewone tuinfuncties blijven zonder AI werken.
- Standaardaanbieder: OpenAI, Gemini of Ollama.
- Een werkelijk beschikbaar/ondersteund model selecteren.
- Verbinding testen met zichtbaar resultaat en begrijpelijke foutmelding.
- Aanbieder/modelkeuze onthouden; aangeven wanneer een test een API-aanvraag uitvoert.
- API-sleutels veilig aan serverzijde/configuratie houden, niet als publiek frontend-geheim of in tuinexport opslaan.
- Voor Ollama adres, modellen en verbinding vanuit zowel lokale ontwikkeling als de gehoste app onderzoeken. Lokale bereikbaarheid niet veronderstellen; geen onbeveiligde publieke Ollama-server als snelle oplossing.
- Geen stille overstap naar een betaalde aanbieder bij uitval. De gebruiker kiest een alternatief.
- Per model/koppeling tonen welke mogelijkheden werken: tekst, afbeeldingen begrijpen, webzoeken, beelden genereren. Een modelnaam alleen is geen garantie dat alle hulpmiddelen beschikbaar zijn.
- Relevante tuincontext selectief meesturen, niet standaard de hele collectie en alle foto's.
- Duidelijk melden: tuin lokaal opgeslagen; bij online AI worden vraag en geselecteerde gegevens naar de gekozen dienst gestuurd.
- Instelbare gebruiksgrenzen, hergebruik van eerder opgehaalde informatie en bescherming van betaalde endpoints bij publiek bereikbare hosting.

Eerst één standaardaanbieder. Later optioneel per taak kiezen. Login met ChatGPT is geen aangenomen vervanging voor deze bestaande API-koppelingen.

Klaar: aanbieder wisselen, testen en foutafhandeling werken; kosten en gegevensverwerking zijn begrijpelijk.

## 7. AI nuttig maken in de bestaande functies

Begin met twee concrete taken:

1. Plantinformatie aanvullen: naam/ras invullen, relevante velden met bron en datum laten voorstellen. Onbekend blijft onbekend. Bestaande eigen tekst en ervaringen blijven beschermd.
2. Tuinvragen: de assistent krijgt relevante planten, plekken en notities. Antwoorden kunnen een taak of notitie voorstellen die de gebruiker bewust overneemt.

Daarna: planten zoeken vanuit een tuinplek, met dezelfde vergelijkingsvelden voor alle kandidaten. Zoekprofielen kunnen Eetbaar, Mulch/compost, Weinig onderhoud of Eetbare siertuin zijn.

Zichtbaar onderscheid tussen opgezochte informatie, AI-suggesties en eigen ervaringen. Webbronnen daadwerkelijk ophalen; een gegenereerde bronvermelding is niet voldoende. Nieuwe feiten en taken eerst als voorstel tonen. Fotoherkenning is geen bevestiging van eetbaarheid.

Klaar: een gekozen voorbeeldplant en tuinvraag leveren controleerbare, bruikbare voorstellen op zonder eigen gegevens te overschrijven.

## 8. Bestaande afbeeldingenzoeker verbeteren

Pas de verbeteringen aan op de gevonden implementatie:

- Eerst gericht zoeken op plantnaam én ras; eventueel wetenschappelijke naam gebruiken.
- Zoekopdracht in hetzelfde venster aanpassen en opnieuw uitvoeren.
- Mogelijke filters: hele plant, vrucht, bloem, zaadverpakking; alleen als de bron dit bruikbaar ondersteunt.
- Grotere resultaten en een duidelijke preview.
- Bron en bekende gebruiksrechten zichtbaar houden. Onbekende rechten niet voorstellen als toestemming.
- Niet claimen dat een foto het juiste ras toont als dat niet is bevestigd.
- Zelf uploaden/foto maken gelijkwaardig aanbieden.
- Uitsnede kiezen met preview van de uiteindelijke plantenkaart.
- Afbeelding efficiënt opslaan en controleren dat deze na herladen en herstellen behouden blijft.
- AI gebruiken om zoektermen te verbeteren waar dat voordeel geeft. Gevonden foto's onderscheiden van gegenereerde inspiratiebeelden.

Optioneel later: een eigen zaadzakje fotograferen, naam en ras laten uitlezen, gevonden velden controleren en de eigen foto bewaren.

Klaar: een zaadje met passend gekozen beeld toevoegen en later terugvinden werkt vlot.

## 9. Eerste vernieuwde versie afronden

Loop met afzonderlijke testdata twee volledige routes door:

- Nieuwe gebruiker: opslaguitleg → instap → zaad toevoegen → foto kiezen → inplannen → markeren als gezaaid.
- Bestaande gebruiker: huidige data openen → wijzigen → herladen → back-up → herstellen.

Controleer daarnaast Light/Dark/Speels, desktop/tablet/mobiel, toetsenbord, contrast, lange namen, lege schermen, ongeldige import, AI uit, verbindingsfouten en aanbiederwissel. Gebruik bestaande tests en voeg gerichte controles toe voor opslag/migratie/providerlogica waar dat nodig is; geen overbodige testprojecten.

Na build en relevante controles: zelf gebruiken in lokale versie of preview, resterende fouten oplossen, daarna apart besluiten over live publiceren.

## Ideeënbank — nog geen bouwverplichting

Kies na de vernieuwde basis één kleine uitbreiding. Onderstaande volgorde is een voorstel, geen definitieve keuze.

| Idee | Gebruik |
| --- | --- |
| Tuinplekken + plantenmatch | Planten zoeken en vergelijken vanuit licht, bodem, ruimte en gewenste functie. |
| Eetbare vaste planten | Eigen shortlist met bruikbaar deel, formaat, onderhoud en gecontroleerde bronnen. |
| Mulchhoek | Een plek plannen voor eigen blad- en snoeimateriaal, met eigen knipmomenten en ervaringen. |
| Kringloop | Komt vrij / Beschikbaar / Bestemming voor snoeisel, blad, compost en mulch. |
| Tuin-tijdmachine | Dezelfde tuinplek op verschillende datums fotograferen en vergelijken. |
| Tuinproeven | Bijvoorbeeld met/zonder mulch of twee rassen; eigen waarnemingen zonder ongefundeerde conclusies. |
| Eetbare siertuin | Planten combineren op uitstraling, gebruik, hoogte en seizoen. |
| Tuinrondje | Kleine selectie uit eigen taken op basis van beschikbare tijd. |
| Ingesproken notities | Spraak omzetten naar een voorstel voor notitie, taak of oogstregistratie. |
| QR-plantpaspoort | Plantlabel koppelen aan eigen plant- of bedgegevens; offline/lokaal gedrag vooraf bepalen. |
| Nog een keer? | Planten beoordelen op smaak, opbrengst, werk en plezier; meenemen naar volgend jaar. |
| Tuin naar bord | Eigen oogst en recepten verbinden aan wat je werkelijk gebruikt. |
| Inspiratiebank | Foto's, links en ideeën aan een concrete tuinplek koppelen. |
| Wat-als-ontwerpen | Varianten van een tuinindeling naast elkaar bewaren. |
| AI-ontwerp op eigen foto | Duidelijk gelabelde impressie, geen voorspelling van groei. |
| Tuin met geheugen | Relevante eigen notities op een geschikt moment terugtonen. |
| Tuinkaart | Eenvoudig bovenaanzicht dat verandert met eigen registraties; eerst klein zonder complexe simulator. |
| Plantenasiel | Ontvangen stekken en onbekende zaailingen bewaren met herkomst en nog te bepalen bestemming. |
| Seizoensboek | Een export van eigen foto's, ervaringen, oogst en plannen. |

## Eerste bouwsessie

1. [x] Actuele projectmap beschikbaar maken en bestaande wijzigingen veilig vastleggen.
2. [x] Stap 1 uitvoeren en de actuele stand rapporteren.
3. [x] De kleinste noodzakelijke opslag-/profielfix kiezen op basis van de code.
4. [x] Losstaande Light/Dark/Speels-design-preview maken; de productie-stijlproef blijft afhankelijk van de technische veiligheidsstappen.

Aan het einde van iedere bouwopdracht vastleggen: gewijzigd, gecontroleerd, nog open, volgende opdracht. De volledige roadmap hoeft niet op één dag af.
