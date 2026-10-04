# Account- en synchronisatiecontrole — 3 oktober 2026

## Echt en gesimuleerd zijn afzonderlijk

**Door de gebruiker bevestigd:** echte registratie, bevestigingsmail en login zijn uitgevoerd. Dat is niet opnieuw door de agent gedaan.

**Door de agent lokaal uitgevoerd:** de huidige app en backend/SDK zijn getest met volledig aparte tijdelijke Chromium-browserprofielen, lokale HTTP-fixtures voor Supabase en tijdelijke lokale PostgreSQL/PGlite-databases. Dit bewijst appgedrag tegen gecontroleerde responses, niet de configuratie of werking van het echte Supabase-project. Er zijn geen echte accounts, mails, snapshots of Storage-bestanden aangemaakt, gewijzigd of verwijderd. De eigen accountcookies, tuin en cloudbestanden zijn niet als testmateriaal gebruikt.

**Live blokkades:** geen apart bevestigd testaccount of testmailbox beschikbaar in de lokale configuratie; de Supabase-connector antwoordt dat opnieuw authenticeren nodig is. Er is niet gezocht in de persoonlijke mailbox. Zonder testaccounts/mailbox is live wachtwoordherstel, mailaflevering, private Storage, tokenverval en gebruikersafscherming niet bewezen. De geïnstalleerde live bucket/policies/redirects zijn niet uitleesbaar via de connector en daarom niet als juist of ontbrekend aangemerkt.

## Geslaagde onafhankelijke controles

- Wachtwoordherstel: juiste lokale en productie-redirect; directe recovery-popup bij token-hash én bestaande tokenroute; credentials verdwijnen uit de URL. Ongelijke wachtwoorden worden geweigerd. Het nieuwe wachtwoord gaat via de bestaande backend/SDK; de herstelcookie vervalt na succes. Verlopen links geven een inline fout. De lokale tuin blijft intact, ook na herladen. De wachtwoorden/tokens in deze tests zijn uitsluitend lokale fixturewaarden.
- Twee browserprofielen met dezelfde gesimuleerde gebruiker: kleine tuin met plantfoto, favoriet, kalender, planning/reminder, verlanglijstfoto en tuinprofiel/profielfoto. Expliciete upload, expliciet terughalen en vergelijking van alle gesynchroniseerde gegevens slagen.
- Foto’s: lokale originelen blijven intact; private objectpaden worden afgeleid van gebruiker + SHA256. De snapshot bevat permanente supabase-photo-verwijzingen, geen ingebedde data-URL’s of tijdelijke signed URLs. Herhaalde upload hergebruikt dezelfde foto. Statische voorbeeldfoto’s blijven hun bestaande adres gebruiken.
- Fototoegang: de fixture laat één download verlopen met HTTP 403; de app vraagt opnieuw tijdelijke toegang aan en herstelt daarna alle foto’s lokaal. Foto’s zijn na herstel ingebed in de lokale tuin en hangen bij herladen niet van een nog geldige signed URL af. Dit is gesimuleerd verval, geen wachttest tegen de echte Storage-tokenserver.
- Downloadbare back-up: werkelijk via de appknop gedownload JSON-bestand bevat plant-, verlanglijst- en profielfoto’s als data-URL’s. Herstel in een derde browserprofiel met het netwerk volledig uit levert dezelfde tuin op; alle ingebedde afbeeldingen decoderen. Oude back-ups met ingebedde afbeeldingen blijven werken.
- Netwerkuitval: snapshot-upload, terughalen, foto-upload, fotodownload en uitloggen behouden lokale gegevens. Herladen behoudt de wijzigingen. Een mislukte upload laat de vorige gesimuleerde cloudkopie staan.
- Conflicten: twee sessies wijzigen dezelfde cloudversie. Een achterhaalde upload wordt geweigerd; lokale gegevens blijven behouden. Het conflict blijft na herladen zichtbaar. Gewone upload is geblokkeerd totdat de gebruiker expliciet kiest; ook die keuze gebruikt revisiecontrole.
- Ontbrekende foto, ongeldige snapshot en mislukte veiligheidskopie blokkeren de volledige vervanging van lokale gegevens.
- Twee gesimuleerde gebruikers: backend weigert een foto van de andere gebruiker en geeft alleen de eigen snapshot. De exacte snapshot- en Storage-policies zijn in lokale PostgreSQL/PGlite uitgevoerd: andere eigenaar, anonieme toegang en eigenaarverplaatsing worden geweigerd. Dit is geen bewijs dat dezelfde policies live zijn geïnstalleerd.
- Inloggen en voorbeeldcollecties laden veroorzaken geen upload. Geen automatische synchronisatie gebouwd.

## Herhaalbare controles

Vanuit C:\Dev\Kweekkompas:

```powershell
node --test tests/auth-account.test.js tests/photo-storage.test.js tests/photo-storage-rls.test.js tests/cloud-sync-contract.test.js tests/cloud-rls.test.js
node tests/account-recovery-browser.cjs
node tests/cloud-step3-browser.cjs
```

Resultaten: 7 unit/integratietests geslaagd; herstel-browsercontrole geslaagd; volledige tweesessie-browsercontrole geslaagd; geen JavaScript-fouten. Rapporten staan in scratch/account-recovery/report.json en scratch/cloud-step3/browser-report.json. Live requests/writes: 0.

De bestaande cloudsynchronisatietest is aangepast aan de compacte accountpopup en verborgen Details. De test controleert nu ook een werkelijk gedownloade back-up met alle foto’s in een volledig offline derde browserprofiel. Er zijn geen concrete appfouten gevonden; productiecode, compacte instellingen, authcode, AI, modellen, sleutels en keepalive zijn in deze stap niet gewijzigd.

## Korte live checklist voor de gebruiker

1. Gebruik uitsluitend eigen aparte testaccounts en een testmailbox. Open twee **verschillende tijdelijke browserprofielen** (of twee verschillende browsers) op http://127.0.0.1:4173/. Twee incognitotabs in hetzelfde profiel zijn geen geïsoleerde opslag. Laat de gewone browser met de echte collectie buiten deze controle.
2. Profiel A: kies Lokaal doorgaan en maak de kleine testtuin. Voeg een foto/favoriet aan een plant toe, een kalenderitem, een verlanglijstitem met foto en een tuinprofiel. Log in met bevestigd testaccount A. Download vooraf een lokale back-up. In Instellingen → Account kies Uploaden en bevestig.
3. In Supabase: Storage → kweekkompas-photos moet Private zijn, met objecten in de map van testgebruiker A. Open alleen diens rij in public.kweekkompas_snapshots. Foto’s moeten verwijzingen zoals supabase-photo://kweekkompas-photos/<test-user-id>/<sha256>.webp bevatten, zonder data:image of /object/sign/. Controleer ook dat kalender, favoriet, verlanglijst en tuinprofiel aanwezig zijn. Herhaalde upload mag geen extra identieke objecten opleveren.
4. Profiel B: log in met hetzelfde testaccount A. Kies Cloudkopie terughalen en bevestig de vervanging van alleen deze testtuin. Controleer alle velden/foto’s en herlaad. Download een back-up en herstel die met netwerk uit in een derde leeg tijdelijk profiel; controleer foto’s zonder internet.
5. Tijdelijke toegang: bekijk bij terughalen een fotodownload in DevTools → Network. Open uitsluitend de signed URL van een eigen testfoto, wacht langer dan de 60 seconden geldigheid en controleer dat de oude toegang verloopt. Haal opnieuw terug: de app moet een nieuwe URL aanvragen en de foto tonen. Deel de URL of tokens niet in de chat. Een al lokaal herstelde foto blijft zonder signed URL zichtbaar.
6. Conflict: wijzig de tuin in A en B. Upload A; upload daarna de oudere gewijzigde tuin van B. Er moet een conflict verschijnen zonder stille vervanging of lokaal verlies. Herlaad B; kies pas daarna bewust welke kopie je wilt behouden. Netwerkfout: zet B offline in DevTools en probeer uploaden/terughalen; herlaad en controleer dat de lokale testgegevens behouden zijn.
7. Testmailbox: log uit in het aparte testprofiel, kies Wachtwoord vergeten voor het testaccount, open de echte herstelmail in dat profiel. De popup moet direct Nieuw wachtwoord instellen tonen. Vul zelf een nieuw testwachtwoord in, verzend en controleer na uitloggen dat het nieuwe werkt en het oude niet. Gebruik je gewone account niet.
8. Indien testaccount C beschikbaar is: open nog een apart browserprofiel en log daar in met C. Cloudkopie terughalen mag nooit A tonen. Voor een gerichte foto-aanvraag kun je in DevTools uitsluitend het pad van A’s testfoto gebruiken, met C’s huidige account-id; /api/photo-access moet weigeren. Voor volledige live RLS-verificatie zijn daarnaast requests met de eigen Supabase-authsessie van C nodig. Beheertoegang via de Table Editor bewijst geen RLS-afscherming.

Controleer bij Authentication → URL Configuration exact: Site URL https://kweekkompas.netlify.app/, Redirect URL https://kweekkompas.netlify.app/ en http://127.0.0.1:4173/; alleen bij gebruik van localhost ook http://localhost:4173/. De herstelmail moet de standaard ConfirmationURL of de al ondersteunde token_hash-route met type=recovery gebruiken. Deze instellingen zijn niet gewijzigd of live geverifieerd. De authaanpak en tijdelijke Storage-toegang zijn vergeleken met de officiële documentatie: https://supabase.com/docs/guides/auth/passwords en https://supabase.com/docs/guides/storage/serving/downloads.

Geen SQL-wijziging nodig op basis van deze onafhankelijke controles. Geen bestaande cloudbestanden automatisch verwijderd. Niets gecommit, gepusht of gepubliceerd.
