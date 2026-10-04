# Optionele automatische synchronisatie

Lokaal toegevoegd op 3 oktober 2026. Niets gecommit, gepusht of gepubliceerd. AI, modellen, sleutels, keepalive en Supabase-schema zijn niet veranderd.

## Bediening

Instellingen → Account & synchronisatie bevat één schakelaar **Automatisch synchroniseren**. Standaard uit; alleen na login bruikbaar. De keuze staat per account op dit apparaat, niet in de cloud of in een downloadbare tuinback-up.

Inschakelen leest eerst de cloudkopie en vergelijkt de volledige tuin, met permanente fotoverwijzingen. Bij verschillende gegevens, een importpauze of een conflict kies je expliciet:

- **Lokale tuin gebruiken:** deze volledige lokale tuin, inclusief eventuele geïmporteerde gegevens of voorbeelden, wordt bewust het uitgangspunt. De cloudkopie wordt met revisiecontrole bijgewerkt.
- **Cloudtuin gebruiken:** expliciete bevestiging van lokale vervanging. Eerst alle foto’s ophalen, gegevens valideren en een lokale veiligheidskopie maken. Tussentijdse bewerkingen blokkeren de vervanging.

Gelijke lokale en cloudgegevens met dezelfde eigenaar kunnen direct als basis worden gebruikt. Inloggen alleen start geen upload; een eerder ingeschakelde wachtrij wordt na expliciet uitloggen/login gepauzeerd. Herladen met dezelfde nog ingelogde sessie hervat een geldige wachtrij.

## Wachtrij en beveiliging tegen overschrijven

`auto-sync.js` bewaart onder `kweekkompas_auto_<account-id>` de instelling, pauzereden, generatie van wijzigingen, verwerkte generatie, cloudrevisie, lokale vingerafdruk en retrytijd. De tuin/foto’s blijven in de bestaande lokale IndexedDB/localStorage-opslag; ze worden niet nogmaals in deze wachtrij gedupliceerd. Een duurzame gegevensmarkering onder `kweekkompas_auto_guard` voorkomt dat een oudere wachtrij doorwerkt na import of een andere gegevensbasis.

Planten, foto’s, favorieten, reminders/planning, verlanglijst, voortgang en het tuinprofiel gebruiken de bestaande opslagmeldingen. Relevante wijzigingen worden circa **1,8 seconden** na de laatste bewerking gebundeld. De volledige snapshot gaat via dezelfde foto-upload en backend: foto’s eerst, snapshot daarna, met `expectedUserId` en compare-and-swap op de revisie. Ongewijzigde gegevens geven geen nieuwe snapshot-upload.

Een actieve ronde bevestigt alleen de generatie die zij heeft opgehaald. Nieuwe wijzigingen tijdens upload blijven klaarstaan. Lokale gegevens en niet verwerkte generaties blijven na herladen/netwerkuitval behouden. De queue controleert account, sessiegeneratie, gegevensmarkering en account-eigenaar voordat nieuwe aanvragen of lokale synchronisatiemetadata worden geschreven.

De generatie wordt vóór het asynchrone ophalen en hashen vastgelegd: ook een bewerking tijdens het berekenen van de snapshot blijft duurzaam wachten. Een bewerking in een tabblad onder een andere account-eigenaar maakt de gedeelde gegevensmarkering ongeldig voor oudere wachtrijen. Vóór vervolgaanvragen wordt de actuele gedeelde instelling opnieuw gelezen, zodat uitschakelen in een ander tabblad ook stopt voordat het storage-event aankomt.

Web Locks laat maximaal één synchronisatie tegelijk toe in hetzelfde browserprofiel, ook tussen tabbladen en naast handmatige acties. Andere profielen/apparaten gebruiken afzonderlijke locks; conflicten daar worden door de bestaande database-revisiecontrole tegengehouden. Browsers zonder Web Locks bieden alleen handmatige synchronisatie aan.

Uitloggen, uitschakelen, accountwissel en import annuleren lopende automatische fetches en verhinderen vervolgaanvragen. Een snapshot die de server al heeft geaccepteerd voordat annulering aankomt, kan niet worden teruggedraaid. Dat blijft een write voor het oorspronkelijke account; het resultaat mag geen basis/status voor een ander account worden en wordt na een expliciete hervatting opnieuw gecontroleerd. Bestaande cloudbestanden worden niet automatisch verwijderd.

## Imports en inkomende cloudwijzigingen

Voorbeeldladen en back-upimport zetten vóór lokale vervanging/toevoeging een duurzame pauze. Ook latere eigen bewerkingen uploaden daardoor niet ongemerkt geïmporteerde gegevens. De gebruiker moet bewust een uitgangspunt kiezen. Handmatig cloudherstel pauzeert automatische synchronisatie eveneens; een automatisch, gecontroleerd cloudherstel zet juist een nieuwe basis zonder terug-upload.

Nieuwe cloudwijzigingen worden bij terugkeer naar de app en iedere **60 seconden zolang zichtbaar** gecontroleerd. Bij wachtende lokale wijzigingen pauzeert de queue met **Conflict — kies een versie**. Zonder lokale wijzigingen mag de volledige cloudtuin automatisch worden teruggehaald: alle foto’s moeten slagen, er wordt eerst een veiligheidskopie gemaakt en de lokale vingerafdruk/generatie wordt opnieuw gecontroleerd vóór vervanging.

Tijdens een zichtbaar plantbewerkformulier, verlanglijstbewerkvenster of tekstinvoer wordt automatische lokale vervanging uitgesteld. Na een geslaagde automatische vervanging wordt de app herladen om alle bestaande views/in-memory gegevens opnieuw in te lezen. De queue/basis en veiligheidskopie zijn dan al lokaal opgeslagen.

Cloudherstel controleert de oorspronkelijke lokale vingerafdruk en generatie ook tussen de eerste vergelijking en de herstelvoorbereiding. Na het voorbereiden van lokale opslag volgt opnieuw een annulering/generatiecontrole vóór writes. Lopende fotodownloads en een nog niet voltooide hersteltransactie in IndexedDB ontvangen het annuleringssignaal. Rollback van zo'n geannuleerd automatisch herstel herstelt uitsluitend nog ongewijzigde tuinsleutels; nieuwe accountstatus, wachtrijmarkeringen en tussentijdse eigen bewerkingen blijven staan.

Na herstel wordt de daadwerkelijk opgeslagen, eventueel genormaliseerde lokale tuin als synchronisatiebasis vastgelegd. Normalisatie van een oudere cloudkopie geldt daardoor niet als een eigen bewerking en veroorzaakt geen automatische terug-upload.

## Meldingen en fouten

Eén hoofdstatus: **Opgeslagen op dit apparaat**, **Synchroniseren…**, **Gesynchroniseerd**, **Offline — wijzigingen wachten** of **Conflict — kies een versie**. Pauzes die een keuze vragen krijgen een korte verklaring en de twee versieknoppen. Technische fouten staan achter Details.

Tijdelijke fouten gebruiken maximaal vijf extra pogingen met wachttijden **2, 5, 15, 30 en 60 seconden**. De retrytijd blijft na herladen behouden; focussen omzeilt de wachttijd niet. Daarna blijft de queue wachten. Een online-event begint een nieuwe begrensde pogingreeks. Ongeldige lokale data/foto’s en geweigerde aanvragen pauzeren met een fout in Details. Opslagruimtegebrek bij het bewaren van de wachtrij stopt automatische acties; de tuin blijft lokaal en handmatige synchronisatie blijft beschikbaar.

De bestaande grenzen blijven: 1 MB per nieuwe/verwerkte foto, maximaal 1600 pixels, 3,5 MB voor de overige snapshotgegevens. Lokale foto-originelen en zelfstandige back-ups blijven behouden.

## Controles: echt versus gesimuleerd

**Lokaal daadwerkelijk uitgevoerd, Supabase gesimuleerd:**

- Vijftien gerichte queue-tests: bundeling; nieuwe wijzigingen tijdens upload en hashing; duurzame offline queue; begrensde retrytijden; schoon cloudherstel met veiligheidskopie; conflicten en bewerkingen tijdens fotohydratatie en vlak vóór herstel; imports/voorbeelden; stoppen en accountwissel; een al geaccepteerde snapshot mag geen metadata voor een ander account schrijven; één actieve ronde bij overlappende callbacks; edits in een tabblad onder een ander account; gedeeld uitschakelen vóór het storage-event; normalisatie na cloudherstel zonder terug-upload.
- Twee volledig geïsoleerde Chromium-profielen met de actuele app, DOM-bediening, backend en echte Supabase SDK tegen uitsluitend lokale HTTP-fixtures: standaard uit, login zonder upload, expliciete basiskeuze, twaalf snelle edits in één upload, tweede ronde voor een wijziging tijdens upload, hergebruik van foto’s, automatisch schoon terughalen, offline/herladen en online hervatten, duurzaam conflict en expliciete keuze, back-upimport, voorbeeldladen, uitschakelen en tweede account.
- De bestaande handmatige tweesessiecontrole blijft slagen, inclusief gedownloade back-up die alle foto’s volledig offline herstelt, ontbrekende foto’s, netwerkfouten, revisieconflict en behoud na uitloggen/herladen.
- Auth-/herstelregressie en profiel-, foto-, opslag-, cloudcontract- en lokale SQL/RLS-tests slagen. Aanvullende gesimuleerde controles bewijzen annulering van fotodownloads, stoppen vóór lokale herstelwrites en behoud van nieuwe accountstatus/eigen edits tijdens rollback. De gerichte unit/integratieronde telt 72 tests; de volledige suite telt 127 tests.
- Bij de browsercontrole is een concrete fout hersteld: profiel uitlezen/migreren schreef identieke data opnieuw en meldde dat als eigen wijziging. Alleen een echt gewijzigd profiel meldt nu een eigen bewerking; migratie is een afzonderlijke bron.

**Niet live bewezen:** echte Storage-upload/download, echte policies, tijdelijk-tokenverval, wachtwoordherstel en mailaflevering. Er ontbreken aparte bevestigde testaccounts/testmailbox; geen echte account/collectie/cloudbestanden als testmateriaal gebruikt. Bestaande registratie/login zijn eerder door de gebruiker bevestigd. Er is geen nieuwe SQL nodig voor deze wachtrij.

Herhalen vanuit C:\Dev\Kweekkompas:

```powershell
node --test tests/auto-sync.test.js tests/auth-account.test.js tests/profile-model.test.js tests/photo-storage.test.js tests/cloud-sync-contract.test.js tests/storage-safety.test.js tests/indexeddb-transaction.test.js tests/photo-storage-rls.test.js tests/cloud-rls.test.js
node tests/auto-sync-browser.cjs
node tests/cloud-step3-browser.cjs
node tests/account-recovery-browser.cjs
npm run build
```

Browserrapporten staan in scratch/auto-sync/report.json, scratch/cloud-step3/browser-report.json en scratch/account-recovery/report.json. Live writes/requests zijn 0.

## Grenzen

De queue werkt wanneer de app open en zichtbaar is; er is geen achtergrondservice als de browser/app gesloten is. De queue blijft lokaal staan en kan later hervatten. Er is geen samenvoeging van conflicterende tuinen per plant: de gebruiker kiest expliciet een volledige versie. Gegevens blijven apparaatgebonden zolang niet gesynchroniseerd; wissen van browseropslag wist ook de lokale wachtrij. Bewaar zelfstandige back-ups.
