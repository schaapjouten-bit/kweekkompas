# Prompt 2 — Planning

Lokaal uitgevoerd in `C:\Dev\Kweekkompas`, 4 oktober 2026. Geen commit, push of publicatie.

## Wijzigingen

- Eén Planning-item in de zijbalk en mobiele navigatie. Jaar hergebruikt de twaalf maanden, Maand de kalender en dagagenda; Agenda groepeert alle gedateerde taken van het gekozen jaar, inclusief afgeronde taken.
- Gedeeld jaar, maand en geselecteerde dag. Navigatie houdt de dag waar mogelijk vast en begrenst die bij kortere maanden. Vandaag en geselecteerd staan apart aangegeven. Tabs ondersteunen pijltjestoetsen, Home en End.
- Eén taakformulier, gebaseerd op de bestaande herinneringsvelden. Zaaien, Uitplanten, Oogsten en Eigen taak; eigen taken vereisen geen plant. Een selectie in het verleden krijgt geen automatisch ingevulde datum voor een nieuwe taak.
- Plantperiodes blijven maandadvies. Inplannen vult alleen het formulier; expliciet Opslaan maakt de taak. Herhaald openen/opslaan en dezelfde titel op dezelfde datum voegen geen dubbele taak toe.
- Bewerken behoudt record-ID, datum tenzij aangepast, voltooiingsstatus en overige opgeslagen velden. Geen gegevensmigratie. Nieuwe records kunnen activiteit en plant-ID bewaren binnen dezelfde reminderopslag.
- Bestaande routes `sowing-grid` en `calendar`, dashboardlinks en AI-Inplannen blijven verwijzen naar passende Planning-tabs. De dashboardactie voor een zaaiadvies gebruikt eveneens het gedeelde formulier.
- Bestaande lokale opslag, `KweekDrafts` en `KweekCloudStatus.changed()` blijven in gebruik. Concepten bewaren titel, datum, activiteit, plant en eventuele bewerking. Sluiten/Escape bewaart; Annuleren verwijdert het concept zonder de bestaande taak aan te passen.
- Licht, Donker en Warm delen de compacte bediening. Brede toevoegenknoppen en dubbele datumknoppen zijn verwijderd uit de zichtbare Planning-bediening.

## Controles

Alle browsers gebruiken nieuwe, geïsoleerde contexten en testgegevens. De Planning- en dashboardtest blokkeren backendverkeer en externe origins. De synchronisatietest gebruikt uitsluitend een lokale account/cloudfixture. De echte collectie en cloudkopie zijn niet gelezen of gewijzigd voor deze controles.

- `npm test`: 133/133 geslaagd.
- `npm run build`: geslaagd; `.env` en backendcode worden niet in de statische app gekopieerd.
- `node tests/planning-browser.cjs`: geslaagd. Tabwisseling, december/januari, Vandaag, toevoegen vanuit alle tabs, activiteit/plant, bewerken, voltooien met toetsenbord, verwijderen/herladen, concept herstellen/annuleren, advies versus taken, dubbele toevoegingen, oude routes, AI-acties en opslaan met Enter.
- `node tests/dashboard-navigation.cjs`: geslaagd. Prompt 1-dashboardselecties, filters, weekagenda en jaarwisseling werken nog; navigatie verandert geen opgeslagen tuinrecords.
- `node tests/planning-sync-browser.cjs`: geslaagd. Toevoegen/bewerken/voltooien/verwijderen bereiken de lokale cloudfixture via de bestaande automatische synchronisatie (revisies 2–5).
- Alle drie thema's en tabs gecontroleerd op 1440, 390 en 320 pixels, zonder horizontale paginaoverflow of browserfouten. Formulier op mobiel nagekeken; native dialoog ondersteunt focusbegrenzing en Escape.
- Screenshots: `scratch/planning-check/`, met Jaar, Maand, Agenda en mobiel formulier. Drie representatieve beelden: `light-1440-year.png`, `dark-390-month.png`, `playful-390-agenda.png`.

## Aanvullende bestaande test

`tests/sync-drafts-browser.cjs` doorloopt de aangepaste taakconcepten, maar faalt later in het afzonderlijke scenario sluiten tijdens upload: timeout bij hervatten naar revisie 1. Een controle met de bewaarde app/HTML/CSS van vóór Prompt 2 faalt eveneens in dit upload-onderbrekingsscenario (`Upload not held`). Die bredere test is dus niet als geslaagd gerapporteerd. Account- en synchronisatiecode zijn niet aangepast om dit scenario buiten Prompt 2 op te lossen. De gerichte Planning-synchronisatietest slaagt.

Accountbeheer, foto-opslag, voorbeeldcollecties, keepalive en AI-providerconfiguratie/sleutels zijn ongemoeid gelaten. Bestaande wijzigingen in de werkmap zijn behouden. Werk gestopt na Prompt 2.

## Gericht vervolg — onderbroken uploads

De oorspronkelijke controle vóór verzending slaagde in deze werkmap, zowel geïsoleerd als met de oorspronkelijke voorbereidende gegevens. De destijds gemelde timeout is daarom niet zonder meer aan de testomgeving toegeschreven. Een deterministische variant met dezelfde lokale account/cloudfixture reproduceerde wel de timeout: de server had revisie 1 opgeslagen, maar de browser ontving geen bevestiging. Na heropenen stond de wachtrij op `paused: conflict`, `counter: 1`, `done: 0`, met basisrevisie 0. De app behield de lokale gegevens, maar herkende de eigen al uitgevoerde upload niet en hervatte daardoor niet automatisch.

Concrete appwijzigingen:

- De bestaande apparaatwachtrij bewaart vlak vóór snapshotverzending een uploadpoging met basisrevisie, wijzigingsteller en SHA-256-vingerafdrukken van de lokale en verstuurde cloudsnapshot. Geen tuingegevens of sleutels worden aan deze metadata toegevoegd. Foto-upload blijft vóór snapshotverzending plaatsvinden.
- Hervatten leest eerst de cloud. Alleen de exact verwachte volgende revisie én exact dezelfde snapshotinhoud bevestigen een eerdere upload. Bij afwijkende inhoud blijft een conflict bestaan en wordt niets automatisch overschreven. De bestaande vergelijking van revisies bij schrijven blijft behouden.
- Een bewerking tijdens de upload blijft boven de bevestigde wijzigingsteller staan. De herstelde succesadministratie gebruikt de vingerafdruk van de eerder verstuurde versie, zodat nieuwe bewerkingen geen onterechte successtatus krijgen.
- Uitloggen wacht nog steeds op het beëindigen van de geannuleerde upload, maar een afwijzing van die expliciet geannuleerde aanvraag blokkeert de uitlogaanvraag niet meer. Deze tweede appfout werd door de gerichte accountwisselcontrole gevonden. De bestaande account/session/origin/`expectedUserId`-controles blijven behouden.

Controle: `node tests/upload-interruption-browser.cjs`, uitsluitend onderbroken uploads met verse browseropslag en een lokale HTTP-account/cloud/fotoservice. Zowel vóór verzending sluiten als na serveropslag een bevestiging verliezen worden expliciet vastgehouden. De test laat een Playwright-blokkade los zodra annulering is ingezet; anders kan de test zelf verhinderen dat de geannuleerde fetch en uitloggen eindigen. De controles op lokale inhoud, duurzame wachtrij, serverrevisie, succesadministratie, foto-volgorde, tussentijdse wijzigingen, afwijkende cloudinhoud en account B blijven intact.

Resultaat: de deterministische verloren-bevestigingcontrole faalde vóór de fix op dezelfde revisie-1-timeout en slaagde daarna. De gerichte gecombineerde controle slaagt met nul browserfouten en nul live cloudwrites. Syntax en build zijn geslaagd. Geen volledige suite, thema-/mobielrondes, betaalde AI-aanvragen of wijzigingen aan de echte collectie, cloudkopie of sleutels. Geen commit, push of publicatie.
