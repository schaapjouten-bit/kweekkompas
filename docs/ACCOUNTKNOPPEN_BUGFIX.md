# Accountknoppen — lokale bugfix

Onderzocht op de huidige app via `http://127.0.0.1:4173/` in de bestaande
Chrome-tab, vóór het aanpassen. Er zijn geen echte login-, registratie-,
herstelmail- of bevestigingsmail-POSTs verstuurd. De persoonlijke collectie,
foto's en profielvelden zijn niet bewerkt. AI-keuzes en sleutels zijn ongemoeid.

## Oorzaak en bewijs

- Navigatieknoppen hadden al `type="button"` en stonden buiten het formulier.
  Ze werkten in de onderzochte tab met lege velden, via klik, Enter en Spatie.
  Er was geen extra modal-overlay boven het formulier. Sluiten/heropenen bouwt
  de DOM opnieuw op en `KweekServices.mount` bindt de handlers opnieuw.
  Een permanent verloren handler of blokkerende overlay is niet gereproduceerd.
- Verzenden van een leeg formulier werd door native browservalidatie gestopt
  vóór `onsubmit`. `cloud-auth-status` bleef leeg. Hierdoor ontbrak zichtbare
  terugkoppeling bij het formulier. Navigatie en verzending hadden ook dubbele
  knopnamen, terwijl de actuele modus geen eigen kop of geselecteerde knop had.
- De mode-handlers deden `if (busy) return`. Een lopende aanvraag blokkeerde
  daardoor zonder uitleg alle formuliernavigatie. Authrequests hadden bovendien
  geen clienttimeout. Dit pad is aanvullend met een geblokkeerde aanvraag in de
  fixture gecontroleerd; de echte bedieningstest verstuurde geen auth-POST.
- `updateLocalStatus` koos bij ontbrekende syncmetadata altijd
  “Lokale tuin nog niet gesynchroniseerd voor dit account”, ook wanneer
  `user` null was. Een zichtbaar registratieformulier betekent geen login.
- Na opnieuw opbouwen toonde de template eerst standaard “Inloggen”; de
  werkelijke, bewaarde modus werd pas bij het async accountantwoord gerenderd.

## Oplossing

`services.js` valideert nu alleen bij verzenden. `novalidate` voorkomt dat de
browser de submit-handler overslaat; de handler controleert ontbrekende e-mail,
e-mailformaat, benodigd wachtwoord, minimumlengte en wachtwoordherhaling. Fouten
staan direct bij het formulier, het betreffende veld krijgt `aria-invalid` en
focus. Er worden bij validatiefouten geen aanvragen verstuurd.

Elke modus heeft een kop, uitleg en een geselecteerde navigatieknop
(`aria-pressed`). Registratie verzenden heeft een andere naam dan de
navigatieknop “Account aanmaken”. Bij remount wordt de juiste modus meteen
gerenderd. Meldingen blijven behouden wanneer de async accountstatus arriveert.

Een lopende aanvraag meldt zijn voortgang. Formuliernavigatie blijft werken;
een tweede verzending wordt tegengehouden. Authrequests hebben een timeout van
20 seconden en verbindings-/timeoutfouten krijgen een begrijpelijke melding
bij het formulier. Er zijn geen automatische herhaalverzoeken toegevoegd.

Zonder ingelogde gebruiker staat er nu “Synchronisatie is niet actief: er is
geen account ingelogd” en “Je tuin staat lokaal op dit apparaat”. De
accountgebonden syncstatus verschijnt alleen bij een daadwerkelijk ingelogde
gebruiker. Een formulierkeuze wijzigt de loginstatus niet.

## Controles

**Echte huidige app in de bestaande Chrome-tab:** alle vier modeknoppen met
muisklik en Enter, Spatie bij herstel/bevestiging, en de volledige Tab-volgorde
van e-mail → wachtwoord → verzenden → vier modeknoppen → terug. Via Tab/Enter/
Spatie wisselt de kop telkens correct. Leeg verzenden in alle modi, ongeldige
e-mail en ontbrekend wachtwoord geven de juiste melding. Terug naar KweekKompas
werkt via klik én Enter. Heropenen bevestigt dat de handlers opnieuw werken.
Er zijn geen geldige credentials of complete mailformulieren verzonden.

**Aanvullend geïsoleerd, niet live Supabase:**
`node tests/auth-account-browser.cjs` controleert lege navigatie/validatie zonder
POST, heropenen/remount, een geblokkeerde aanvraag met nog werkende navigatie,
zichtbare netwerkfout, succesvolle en foutieve authflows met fixtures, recovery
en behoud van lokale gegevens. Desktop/mobiel en alle drie thema's.
Rapport en screenshots: `scratch/auth-account/`.

`node tests/cloud-step3-browser.cjs` controleert nog steeds cloudsynchronisatie,
fotoherstel, conflicten, veiligheidskopie en behoud bij netwerkfouten met
geïsoleerde fixtures. Geen live tuin of Storage wordt gewijzigd.

Gerichte Node-tests voor auth, settings en foto-opslag slagen; de build slaagt.
Echte account-/mailaflevering is niet bewezen of aangevraagd. Geen commit, push
of publicatie uitgevoerd.
