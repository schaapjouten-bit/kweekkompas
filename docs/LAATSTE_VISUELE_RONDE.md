# Laatste visuele ronde — 3 oktober 2026

De actuele app is bekeken op http://127.0.0.1:4173/ in zichtbaar Chromium, met aparte tijdelijke browserprofielen. De lokale server is gestart omdat poort 4173 nog niet actief was. Gebruikersgegevens uit bestaande browserprofielen zijn niet geopend of gewijzigd. Alle API-aanvragen en externe bronnen zijn onderschept: geen echte mails, cloudwrites of AI-aanvragen.

## Concrete problemen en oplossingen

- Instellingen hield de toetsenbordfocus buiten het paneel en sloot niet met Escape. Instellingen en het bestaande verlanglijstvenster maken de achtergrond nu tijdelijk inert, houden Tab/Shift+Tab bij zichtbare bediening en geven focus na sluiten terug. Ingeklapte inhoud telt niet mee. Escape blijft ook werken als een aanvraag het actieve veld uitschakelt.
- Het verlanglijstvenster liet de achtergrond scrollen. Alleen de vensterinhoud scrolt nu; de vaste kop met sluitknop blijft bereikbaar. De app achter het venster beweegt niet mee. Ook scrollen aan het einde van panelen wordt niet doorgegeven aan de achtergrond.
- Een back-upfoutmelding viel op mobiel buiten de rechterrand. Meldingen worden nu in alle schermen binnen de viewport geplaatst en afgebroken. Het bestaande meldingsgebied kondigt tekst ook als status aan en blijft toegankelijk bij een geopend paneel.
- Een themakeuze herbouwde het instellingenpaneel, verloor focus/scrollpositie en toonde kort de lokale accountindeling. De scrollpositie en gekozen bediening worden behouden; de al bekende accountindeling staat direct klaar tijdens verversen.
- Op 320 pixels overlapte de titel van het verlanglijstvenster de sluitknop. De kop loopt nu om en de sluitknop houdt zijn eigen vierkante ruimte.
- De starttekst zei dat een databaseoptie later zou komen; opslagdetails noemden alleen handmatige synchronisatie en herhaalden limieten. De teksten sluiten nu aan op de bestaande optionele synchronisatie en zelfstandige back-ups.

Geen nieuw ontwerp, extra functies of wijzigingen aan opslag-, foto- of synchronisatieprocessen. AI, sleutels en keepalive zijn ongemoeid gelaten.

## Gerichte controles

Eerste visuele inspectie: Mijn tuin, zaden, plantdetail, zaaiplanner, kalender en verlanglijst op 1440 × 1000 en 390 × 844, in Licht, Donker en Warm. Geïsoleerde planten met zeer lange namen/notities en een lange taak zijn gebruikt. De screenshots zijn naast elkaar bekeken; geen horizontale overloop in deze hoofdschermen.

Na de wijzigingen zijn uitsluitend de relevante panelen/bediening gecontroleerd:

- Startkeuze, accountpopup, validatiefouten, actieve tabs, pijltjestoetsen en sluiten zonder aanvragen te versturen.
- Compacte instellingen, inklappen/uitklappen, één scrollzone, Tab/Shift+Tab, Escape en focusherstel.
- Themaselectie met behoud van scrollpositie en focus.
- Automatische schakelaar standaard uit, bruikbaar bij gesimuleerde login, expliciete uitgangspuntkeuze en één hoofdstatus.
- Back-up werkelijk als lokaal bestand gedownload; ongeldige import afgewezen met volledig zichtbare melding. Voorbeeldcollecties bekeken en laden geannuleerd. Vergelijking voor/na bevestigt ongewijzigde geïsoleerde collectie.
- Verlanglijstvenster en achtergrondscroll in alle drie thema's, met extra nacontrole op 320 × 568. Titel en sluitknop overlappen niet; onderste bediening is via de ene scrollzone bereikbaar.
- Lege toestanden van Mijn tuin, zaden, planner, kalender en verlanglijst in de zes combinaties.
- Cloudfout visueel bekeken via een lokale foutfixture. Gesynchroniseerd, Offline en Conflict zijn aanvullend bekeken via uitsluitend lokale gesimuleerde wachtrijstatus; Synchroniseren via een vertraagde testrespons. De extra wachtcontrole op terugkeer na die vertraagde respons bereikte de 30-secondenlimiet van de interactieve tooling. Hieruit wordt geen nieuwe conclusie over echte synchronisatie getrokken; de screenshot bewijst alleen de bezig-status.

De gerichte browsercontrole heeft 87 screenshots/checkpoints en geen JavaScript-fouten. De nacontrole van de venstertitel heeft zes combinaties zonder overlap/overloop. Vijf relevante instellingencontroles en JavaScript-syntaxcontroles slagen. Geen herhaalde brede testsuite uitgevoerd.

Rapporten: `scratch/final-visual/report.json`, `before-metrics.json`, `short-dialog-checks.json` en `status-checks.json`. Browsergegevens en gedownloade bestanden zijn uitsluitend testgegevens.

## Representatieve screenshots

- `scratch/final-visual/1440-light-compact-settings.png`: desktop, Licht, compacte instellingen en synchronisatieschakelaar.
- `scratch/final-visual/390-dark-backup-error.png`: mobiel, Donker, back-upbediening en leesbare foutmelding.
- `scratch/final-visual/320-playful-wishlist-final.png`: klein mobiel scherm, Warm, omgebroken titel, vrije sluitknop en één scrollzone.
- `scratch/final-visual/mobile-warm-status-conflict.png`: mobiel, Warm, expliciete conflictkeuze.

Herhalen: start lokaal `npm start`, daarna `node tests/final-visual-browser.cjs`. De test gebruikt altijd aparte Chromium-profielen en onderschept alle API-aanvragen.

## Open punten

Echte Supabase Storage-upload/download en echte wachtwoordherstelmail/herstelstroom blijven open zolang aparte testaccounts en een testmailbox ontbreken. Mobiel is gecontroleerd met browserviewports, niet op fysieke telefoons. Niets gecommit, gepusht of gepubliceerd.
