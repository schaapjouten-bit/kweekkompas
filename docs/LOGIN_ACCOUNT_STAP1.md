# Login en accountbeheer — stap 1

Lokaal uitgevoerd op 3 oktober 2026 in `C:\Dev\Kweekkompas`.
Geen commit, push, publicatie of wijziging in Supabase uitgevoerd.
De lokale ontwikkelserver draait op `http://127.0.0.1:4173/`; herlaad de app
om de gewijzigde accountbediening te zien.

## Diagnose

De bestaande backend kon uitsluitend inloggen en uitloggen. Registratie,
bevestigingslinks en wachtwoordherstel ontbraken. Auth-fouten werden samengevoegd
tot één algemene melding, zodat verkeerde gegevens en een onbevestigd adres niet
te onderscheiden waren. Na een geslaagde login werd de cloudstatus gelezen;
een fout daarin overschreef de accountmelding. Een cloudfout kan zo de indruk
wekken dat inloggen faalt, terwijl de sessie wel is aangemaakt.

Echte controles met de lokale publieke sleutel van het bestaande project:

- `/auth/v1/settings`: HTTP 200; e-mailprovider ingeschakeld, registratie toegestaan,
  e-mailbevestiging verplicht. Er ontbreekt dus geen algemene e-maillogininstelling.
- Een willekeurig, niet-bestaand adres onder `example.invalid`: Supabase geeft
  HTTP 400, `invalid_credentials`, `Invalid login credentials`.
- De lokale `/api/auth`: HTTP 200, `configured: true`, geen ingelogde gebruiker.
- Via dezelfde lokale backend wordt de bovenstaande afgewezen testlogin HTTP 401
  met de duidelijke melding over een onjuist adres of wachtwoord.

Dit is **geen diagnose van de gegevens van het persoonlijke account**. Er zijn
geen persoonlijke inloggegevens gebruikt en geen persoonlijke browsersessie of
collectie geopend. Zonder een afzonderlijk bevestigd testaccount kan een
geslaagde live-login niet worden bewezen. Of het persoonlijke account onbevestigd
is, is niet vastgesteld. De app meldt nu specifiek `email_not_confirmed` zodra
Supabase die fout teruggeeft.

## Wijzigingen

- Inloggen, account aanmaken, bevestigingsmail opnieuw aanvragen,
  wachtwoord vergeten, nieuw wachtwoord tweemaal invoeren en uitloggen.
- Begrijpelijke tekst over een KweekKompas-account, mailbevestiging, spammap,
  verlopen links, wachtwoordregels en te veel aanvragen.
- Auth-meldingen staan los van cloudmeldingen; een cloudfout meldt expliciet
  dat je wel bent ingelogd.
- Productiemails verwijzen naar `https://kweekkompas.netlify.app/`.
  Lokale mails gebruiken de lokale oorsprong van de aanvraag.
- Standaard Supabase-links met tokens in het fragment worden verwerkt.
  Links met `token_hash` en type `email`, `signup` of `recovery` worden ook verwerkt.
  Een herstel-link opent het wachtwoordformulier, ook vóór onboarding en wanneer
  het fragment verandert in een al geopend tabblad.
- Auth-parameters worden vóór de accountaanvraag uit de browser-URL verwijderd;
  tokens staan uitsluitend in HttpOnly-cookies en worden niet in JSON-antwoorden,
  localStorage of tuinback-ups opgeslagen. De pagina heeft `no-referrer`.
- De herstelmodus krijgt een HttpOnly-cookie van 15 minuten, gebonden aan het
  geverifieerde account. Zonder herstelmodus weigert de wachtwoordroute toegang.
  Na opslaan, gewone login of uitloggen wordt deze cookie gewist.
- Bestaande stijlen voor Licht, Donker en Warm zijn hergebruikt.
- Auth wijzigt geen lokale collectie en uploadt geen gegevens.
  De bestaande handmatige synchronisatielogica is behouden.

## Supabase-instellingen apart controleren

De private URL-configuratie en mailtemplates zijn niet via de publieke sleutel
zichtbaar. Er zijn geen dashboardinstellingen aangepast. Controleer bij
[Authentication → URL Configuration](https://supabase.com/dashboard/project/cmsthawjpxgyrmfwplfj/auth/url-configuration):

| Instelling | Exacte waarde |
| --- | --- |
| Site URL | `https://kweekkompas.netlify.app/` |
| Redirect URLs — toevoegen/behouden | `https://kweekkompas.netlify.app/` |
| Redirect URLs — lokale controle | `http://127.0.0.1:4173/` |
| Redirect URLs — als localhost wordt gebruikt | `http://localhost:4173/` |

Gebruik steeds hetzelfde lokale adres; localhost en 127.0.0.1 hebben afzonderlijke
browseropslag. De browserfixtures gebruiken een tijdelijke lokale poort en sturen
geen mails; die poorten hoeven niet aan Supabase te worden toegevoegd.

Onder Authentication moet **Allow new users to sign up = aan**, de
**Email-provider = aan** en **Confirm email = aan** blijven. De publieke settings
bevestigen deze drie waarden al.

De standaard mailtemplates met `{{ .ConfirmationURL }}` werken met deze
implementatie. Als aangepaste templates nog naar een andere site of een
niet-bestaande `/auth/confirm`-route verwijzen, zet de link in **Confirm signup** op
`<a href="{{ .ConfirmationURL }}">Bevestig je KweekKompas-account</a>` en in
**Reset password** op
`<a href="{{ .ConfirmationURL }}">Nieuw wachtwoord instellen</a>`.
Die links gebruiken de door de app aangevraagde redirect en het juiste auth-type.

Als mailaflevering buiten de toegestane ontvangers van de standaard Supabase-mailer
nodig is, moet een eigen SMTP-provider worden ingesteld. SMTP-waarden hangen af
van de gekozen mailprovider; er zijn geen waarden verzonnen of instellingen
gewijzigd. E-mailbevestiging en gebruikersafscherming zijn niet uitgezet.

## Verificatie

**Echt:** uitsluitend bovengenoemde Auth-settings, accountstatus en afwijzing van
een niet-bestaand testadres. Geen account aangemaakt en geen echte mail verstuurd.
Er waren geen afzonderlijke testaccountcredentials in de lokale omgeving.

**Gesimuleerd:** lokale HTTP-Auth-fixtures en nieuwe Chromium-browsercontexten;
geen dashboardlogin, bestaande browseropslag of persoonlijke tuin gebruikt.

- 47 tests geslaagd met:
  `node --test tests/auth-account.test.js tests/auth-cloud.test.js tests/storage-safety.test.js tests/settings-redesign.test.js tests/dev-server.test.js tests/theme-shell.test.js tests/services-backend.test.js`.
  De bestaande backendtest gebruikt uitsluitend lokale fixtures, ook voor de
  bestaande AI-routes; geen model of AI-instelling is gewijzigd.
- `node tests/auth-account-browser.cjs`: alle accountflows op 1440 en 390 px in
  Licht, Donker en Warm; nieuw mobiel apparaat vóór onboarding; geen JavaScript-
  fouten of horizontale overflow; lokale testtuin behouden; nul clouduploads.
- Gesimuleerde cloudfout na login blijft gescheiden van succesvolle auth.
- Registratie en reset gebruiken de juiste lokale/productie-redirect.
- Bevestiging, herstel, wachtwoordvergelijking, opnieuw bevestigingsmail aanvragen,
  verlopen links en URL-opruiming gecontroleerd.
- Screenshots visueel nagekeken; rapport en beelden in `scratch/auth-account/`.

**Resterend:** live succesvolle login, daadwerkelijke mailaflevering, bevestiging
en wachtwoordherstel controleren met een afzonderlijk testaccount en testmailbox,
na controle van bovenstaande URL-configuratie. Deze flows zijn lokaal gebouwd
en gesimuleerd getest, maar nog niet end-to-end met echte mails bewezen.

AI, modellen, keepalive, databaseopslag en RLS zijn niet gewijzigd. Stap 2 is
niet gestart.

Bronnen:
[Supabase wachtwoordauth](https://supabase.com/docs/guides/auth/passwords),
[Redirect URLs](https://supabase.com/docs/guides/auth/redirect-urls).
