# Synchronisatiestatus en lokale concepten

Controle uitgevoerd op 4 oktober 2026, uitsluitend lokaal.

## Oorzaak en wijzigingen

De gewone cloudacties en versiekeuzes werden onafhankelijk getoond. Bovendien schreven meerdere callbacks naar dezelfde status. De bediening kiest nu centraal tussen normaal, uitgangspunt nodig en conflict. Alleen de bijbehorende acties verschijnen; details met extra acties verdwijnen tijdens een versiekeuze. De laatste bevestigde synchronisatietijd en lokale wijzigingen blijven zichtbaar.

Een lokale versiekeuze blijft in behandeling tot de server de upload bevestigt. Een geslaagde afhandeling verwijdert de keuzes. De bestaande bevestigingen, veiligheidskopieën, revisiecontrole, accountisolatie en pauzering na voorbeelden/import/herstel blijven behouden. Een handmatige afhandeling hervat geen gepauzeerde automatische upload.

Definitieve tuinwijzigingen werden al direct in IndexedDB of localStorage opgeslagen. De profielnaam wachtte op blur/change; die wordt nu bij input opgeslagen. Plant-, foto-, planning- en verlanglijstconcepten hadden geen duurzaam herstel. Tekstconcepten worden nu bij invoer opgeslagen; conceptfoto's gaan naar een aparte IndexedDB-database. Concepten blijven uitsluitend op het apparaat, worden bij terugkeer hersteld en verdwijnen na opslaan of expliciet annuleren. Onvoltooide formulieren worden geen definitieve planten of taken.

Automatische synchronisatie blijft standaard uit. De bestaande rustperiode, enkele lopende synchronisatie en duurzame wachtrij blijven actief. Bij pagehide wordt de lopende verwerking geannuleerd zonder onbevestigde wijzigingen als gesynchroniseerd te markeren. Een upload die al loopt mag in de achtergrond afronden met serverbevestiging; daar start geen nieuwe upload. Heropenen/pageshow en opnieuw beschikbare accountservice/verbinding hervatten de resterende wachtrij.

## Werkelijk uitgevoerd

- 133 geautomatiseerde tests geslaagd; lokale statische build geslaagd.
- Echte Chromium-browser met echte IndexedDB/localStorage en de lokale HTTP-backend, in aparte browsercontexten op 1440 en 390 pixels.
- Profielnaam bewaren tijdens typen, plant met foto als concept herstellen, onvoltooide bewerking zonder definitieve mutatie, expliciet opslaan/annuleren, favoriet na herladen.
- Planning en verlanglijst herstellen als concept, vervolgens expliciet toevoegen/opslaan en herladen.
- Visuele controle van normaal, uitgangspunt nodig en conflict op desktop en mobiel.
- Bestaande browsercontroles voor handmatige synchronisatie, veiligheidskopieën, fotoherstel en automatische synchronisatie geslaagd.
- Lokale server opnieuw gestart met npm start; nieuwe conceptmodule wordt geserveerd.

## Gesimuleerd en begrenzing

Accounts, cloudrevisies, cloudfoto-opslag en serverantwoorden komen uit een lokale testservice. Netwerkuitval werd voor account/cloud/foto-aanvragen gesimuleerd; de lokale appbestanden bleven beschikbaar. Sluiten tijdens een geblokkeerde upload, offline heropenen, online hervatten, conflictafhandeling en accountwissel zijn zo in een echte browser gecontroleerd. Een server die de upload al heeft geaccepteerd maar waarvan de bevestiging verloren gaat, is aanvullend met de synchronisatie-engine getest: de wachtrij blijft onbevestigd en heropenen controleert de cloudrevisie.

Geen echte Supabase-account- of cloudschrijfacties uitgevoerd. Geen eigen browserprofiel of echte tuin gewijzigd. AI-provider/modelgedrag, sleutels, fotoverwerking en keepalive zijn in deze stap niet veranderd. Niets gecommit, gepusht of gepubliceerd.

Browserresultaten en beelden: `scratch/sync-drafts/report.json` en `scratch/sync-drafts/*-normal.png`, `*-basis.png`, `*-conflict.png`.
