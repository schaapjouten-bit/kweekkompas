# Compacte accountpopup — lokale controle

De accountformulieren staan in één native dialoog. Instellingen sluit vóór de dialoog opent; Escape, de sluitknop en Terug naar KweekKompas brengen de gebruiker terug naar de gekozen accountbediening. Uploaden en terughalen worden nooit automatisch hervat na login. Herstel-links openen de modus Nieuw wachtwoord. Registratie en e-mailbevestiging gebruiken de bestaande authcode.

Instellingen toont een compacte accountsectie en inklapbare onderdelen. Technische cloudinformatie staat achter Details bij een ingelogd account. Veiligheidskopie terugzetten staat bij Data & opslag; fouten verschijnen bij die actie, vervangen vraagt bevestiging. Alleen settings-content scrolt; de achtergrondpagina is tijdens beide overlays geblokkeerd. De sessiekeuze staat in sessionStorage en gaat niet mee in cloudkopieën.

## Uitgevoerde korte controle

Echte Chrome-browser, aparte lege lokale omgeving op localhost:4174 (andere origin dan de echte collectie op 127.0.0.1:4173). De tijdelijke testserver blokkeerde alle API-POSTs; geen echte registratie-, mail-, upload- of herstelverzoeken uitgevoerd.

- Startkeuze zichtbaar; Lokaal doorgaan via Enter; na herladen dezelfde tab geen nieuwe popup.
- Muis: instellingen, accountpopup, registratie-tab, herstel-link, sluitknop, terugknop en thema’s.
- Toetsenbord: Enter, tabnavigatie, pijltjestoetsen tussen tabs, Escape en inklapbare onderdelen.
- Lege velden: navigatie werkt; alleen verzenden toont inline validatie en focust het ontbrekende veld.
- Accountpopup: instellingen gesloten; native modale dialoog blokkeert de achtergrond.
- Desktop en mobiele viewport (390 × 844) in Licht, Donker en Warm; screenshots zonder persoonlijke gegevens in scratch/compact-account.
- Echte scrollbediening in Data & opslag; één actieve scrollzone en geen achtergrondscrollbar.
- JavaScript-syntax, npm run build en tests/auth-account.test.js geslaagd. De auth-regressietest gebruikt fixtures, geen live accounts.
- SHA256 van laatste.json gelijk aan de eerder vastgelegde waarde; echte collectie niet gewijzigd.

Geen nieuwe live auth- of synchronisatiewerking geclaimd. Geen commit, push of publicatie.
