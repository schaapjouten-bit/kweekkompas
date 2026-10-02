# Supabase elke 12 uur benaderen

De nieuwe Netlify Scheduled Function staat in
`netlify/functions/supabase-keepalive.mts`. Het schema staat uitsluitend in
`netlify.toml`: `0 */12 * * *`, dus om 00:00 en 12:00 UTC.

De taak wordt op Netlify uitgevoerd zonder open browser of ingelogde gebruiker.
Per uitvoering doet deze één kleine databaseaanvraag:
`POST /rest/v1/rpc/kweekkompas_keepalive`, zonder argumenten. De SQL-functie geeft
alleen de constante `1` terug. Een antwoord anders dan `1` wordt als fout behandeld.
De aanvraag heeft een timeout van 10 seconden.

De bestaande Supabase-client gebruikt `SUPABASE_URL` en
`SUPABASE_PUBLISHABLE_KEY`, met de bestaande legacyfallback `SUPABASE_ANON_KEY`.
Secret- en service-role-sleutels worden geweigerd. Er wordt geen gebruikerssessie
gebruikt. Logs bevatten alleen een vaste succesmelding of een vaste veilige
foutmelding, zonder sleutels, externe foutdetails of tuingegevens.

## SQL vooraf uitvoeren

1. Open de [SQL Editor van KweekKompas](https://supabase.com/dashboard/project/cmsthawjpxgyrmfwplfj/sql/new).
2. Controleer projectreferentie `cmsthawjpxgyrmfwplfj`.
3. Voer de volledige inhoud van `supabase/keepalive.sql` uit.

Het bestand is zelfstandig en herhaalbaar. De functie gebruikt
`SECURITY INVOKER` en een lege `search_path`; de body bevat uitsluitend
`SELECT 1`. Alleen `anon` krijgt EXECUTE-recht op deze ene functie.
Er worden geen tuintabellen, gegevens, grants op tuintabellen of RLS-policies
gewijzigd. De bestaande login en handmatige synchronisatie blijven behouden.
De inrichting van de cloudtabel uit de eerdere stap blijft een afzonderlijke stap.

De gebruiker heeft deze SQL uitgevoerd op project `cmsthawjpxgyrmfwplfj`.
Daarna is één echte RPC-aanroep met de publieke sleutel gecontroleerd:
HTTP 200 met resultaat `1`; de lokale Scheduled Function rondde af met HTTP 204.

## Publicatie en configuratie

De automatische planning werkt pas op een **gepubliceerde productieversie op
Netlify**. Lokaal, in Deploy Previews en in branchdeploys loopt geen automatisch
schema. In deze stap is niets gepusht of gepubliceerd.

Stel vóór een toekomstige publicatie de bestaande variabelen voor de productie-
Functions-runtime op Netlify in:

- `SUPABASE_URL=https://cmsthawjpxgyrmfwplfj.supabase.co`
- `SUPABASE_PUBLISHABLE_KEY`: dezelfde opgegeven publieke KweekKompas-sleutel
  als in de lokale `.env`.

De lokale `.env` wordt niet gepubliceerd en configureert Netlify niet vanzelf.
Controleer na een latere publicatie in Netlify → Functions de functie
`supabase-keepalive`, de geplande uitvoering en de logs. Via **Run now** kan
deze eenmalig handmatig worden uitgevoerd; een openbaar URL-verzoek is niet
de productieroute voor een Scheduled Function.

## Gericht lokaal gecontroleerd

Uitgevoerd op 2 oktober 2026 met Node.js 24:

```powershell
node --test tests/supabase-keepalive.test.js tests/auth-cloud.test.js tests/cloud-rls.test.js
```

Alle vijf gerichte tests slagen:

- De function-handler doet precies de RPC-aanvraag met de publieke sleutel en
  zonder gebruikerspayload. De HTTP-respons is in deze test gesimuleerd.
- Ontbrekende databasefunctie, permissiefout, timeout, afwijkend resultaat,
  ontbrekende configuratie en bevoorrechte sleutels geven een veilige fout.
- De echte SQL is tweemaal uitgevoerd in lokale PostgreSQL via PGlite.
  `anon` krijgt `1` terug, maar kan de tuintabel nog steeds niet lezen of wijzigen.
  Bestaande testrijen, tuinrechten en RLS-policies blijven identiek.
- De gerichte bestaande login-/synchronisatie- en RLS-tests slagen opnieuw.

De functie is ook lokaal gebundeld met Netlify's bundler: runtime API v2 en
schema `0 */12 * * *` worden herkend. Controle-uitvoer staat onder
`scratch/supabase-keepalive-bundle/verification.json`; er is geen deployment uitgevoerd.

Vóór de SQL-inrichting gaf een echte lokale handler-aanroep veilig aan dat de
databasefunctie ontbrak. Na het uitvoeren van de SQL door de gebruiker is de
aanroep opnieuw gecontroleerd: HTTP 200, SQL-resultaat `1`, handler HTTP 204.
Dit bevestigt de echte databaseaanvraag vanaf deze computer, nog niet de
automatische Netlify-planning. Er zijn geen tuingegevens opgevraagd of gewijzigd.

Na het uitvoeren van de SQL kan dezelfde handler lokaal worden gecontroleerd:

```powershell
node --env-file=.env --input-type=module -e "import keepalive from './netlify/functions/supabase-keepalive.mts'; const response = await keepalive(); process.exitCode = response.ok ? 0 : 1;"
```

Bij succes verschijnt uitsluitend de succesmelding. Deze opdracht voert één
databaseaanvraag uit; hij start geen lokaal schema.

Documentatie:
[Netlify Scheduled Functions](https://docs.netlify.com/build/functions/scheduled-functions/),
[Supabase databasefuncties](https://supabase.com/docs/guides/database/functions),
[Supabase RPC](https://supabase.com/docs/reference/javascript/rpc).
