# Supabase voor lokale KweekKompas v2

Gecontroleerd op 2 oktober 2026. Uitsluitend project `cmsthawjpxgyrmfwplfj`:
`https://cmsthawjpxgyrmfwplfj.supabase.co`.

## Configuratie en gebruik

De genegeerde lokale `.env` bevat nu `SUPABASE_URL` en
`SUPABASE_PUBLISHABLE_KEY` met de opgegeven projectwaarden. Er is geen
service-role- of secret-key gebruikt. Andere omgevingsvariabelen zijn behouden.
De bestaande backendroute `GET /api/auth` levert de configuratie- en accountstatus;
de sleutel wordt niet teruggestuurd of in tuinback-ups opgeslagen.

Start vanuit `C:\Dev\Kweekkompas` met `npm start` en open
`http://127.0.0.1:4173`. Herstart een al draaiende ontwikkelserver zodat deze
de nieuwe `.env` inleest. Gebruik steeds hetzelfde adres: `localhost` en
`127.0.0.1` hebben afzonderlijke browseropslag.
De reeds draaiende KweekKompas-server op poort 4173 is tijdens deze stap
herstart en meldt nu `configured: true`. Herlaad de open app om de nieuwe
instellingencode te gebruiken.

Instellingen → Account & cloud gebruikt een bestaand, bevestigd account met
e-mail/wachtwoord. Zonder account blijft de app lokaal bruikbaar. Inloggen en
uitloggen wijzigen de lokale tuin niet. **Lokaal naar cloud** uploadt pas na
bevestiging; **Cloud naar dit apparaat** vervangt pas na bevestiging en het
opslaan van een veiligheidskopie. **Veiligheidskopie terugzetten** herstelt die
vorige lokale tuin. Voorbeeldtuin laden voegt alleen lokaal planten toe.

Een verouderde cloudversie en een accountwissel bij upload worden geweigerd.
Na een mislukte cloudstatusaanvraag moet de status opnieuw worden gelezen
voordat uploaden mogelijk is. Een ontbrekende cloudtabel geeft een aparte
melding; alleen ontbrekende URL/sleutel geeft de configuratiemelding.

## SQL uitvoeren op het opgegeven project

De Supabase-connector gaf `UNAUTHORIZED`: opnieuw aanmelden bij de connector
is nodig voor beheertoegang. Daarom is er **geen live migratie uitgevoerd**.
De publieke sleutel verleent geen SQL-beheerrechten.

1. Open [SQL Editor van dit project](https://supabase.com/dashboard/project/cmsthawjpxgyrmfwplfj/sql/new).
2. Controleer de projectreferentie `cmsthawjpxgyrmfwplfj`.
3. Plak de volledige inhoud van
   `supabase/migrations/20261002131955_kweekkompas_user_snapshots.sql` en voer die uit.
4. Hetzelfde bestand kan opnieuw worden uitgevoerd. Het verwijdert geen tabel
   of opgeslagen rijen. De eigen policies worden vervangen binnen één transactie.
5. Controleer de metadata met de onderstaande query's. Deze lezen geen tuininhoud.

```sql
select relrowsecurity
from pg_class
where oid = 'public.kweekkompas_snapshots'::regclass;

select policyname, permissive, roles, cmd, qual, with_check
from pg_policies
where schemaname = 'public' and tablename = 'kweekkompas_snapshots'
order by policyname;

select grantee, privilege_type
from information_schema.role_table_grants
where table_schema = 'public' and table_name = 'kweekkompas_snapshots'
  and grantee in ('PUBLIC', 'anon', 'authenticated')
order by grantee, privilege_type;
```

Verwacht: RLS aan; drie eigen SELECT/INSERT/UPDATE-policies en een aanvullende
restrictieve eigenaarscontrole; alleen `authenticated` heeft SELECT, INSERT en
UPDATE. De eigenaar moet gelijk zijn aan `auth.uid()`, ook bij UPDATE via
`WITH CHECK`. Anonieme Supabase-accounts worden geweigerd. DELETE/TRUNCATE zijn
niet toegekend. De primaire sleutel staat één cloudkopie per gebruiker toe.
De restrictieve policy houdt andere tuinen afgeschermd, ook als er een oude
ruimere permissieve policy aanwezig is. Er zijn geen SECURITY DEFINER-functies.

## Wat werkelijk is gecontroleerd

- Echte HTTPS-aanvragen met de opgegeven publieke sleutel:
  `/auth/v1/health` → HTTP 200;
  `/auth/v1/settings` → HTTP 200, e-mail/wachtwoordlogin ingeschakeld.
- De Data API-aanvraag voor `kweekkompas_snapshots`, met `limit=0` en zonder
  tuininhoud, gaf HTTP 404 / `PGRST205`: de tabel ontbreekt in de API-schemacache.
  De SQL-inrichting en eventuele Data API-exposure moeten dus nog worden afgerond.
- Lokale `/api/auth` → `{ configured: true, user: null }`;
  `/api/cloud-sync` weigert toegang zonder login (HTTP 401).
- Chromium met afzonderlijke browseropslag op 1440 en 390 px: eigen
  testgegevens, foto, notities, profiel, verlanglijst en taken blijven na
  herladen bewaard. Voorbeeldplanten worden lokaal toegevoegd en blijven
  bewaard. Er volgt geen automatische cloudupload.

## Gesimuleerde controles en beperkingen

- Twee lokale HTTP-testaccounts: login/uitloggen/accountwissel zonder lokale
  vervanging; aparte upload en herstel; conflictweigering; persistente
  veiligheidskopie terugzetten; voorbeeldtuin ook ingelogd zonder upload.
- Accountstatus blijft bruikbaar als een andere instellingenroute blijft hangen.
  Een ongeldige routerespons wordt niet als ontbrekende Supabase-configuratie gemeld.
- PGlite voert de echte SQL tweemaal uit en behoudt bestaande testrijen.
  SELECT/INSERT/UPDATE van andere gebruikers, eigenaarwijziging, anonieme
  toegang en DELETE worden geweigerd, ook met een extra ruime testpolicy.
  Alleen de Supabase-claims/gebruikers zijn in deze lokale PostgreSQL-test nagebootst.
- 39 gerichte backend-, SQL-, opslag- en servertests geslaagd:
  `node --test tests/auth-cloud.test.js tests/cloud-rls.test.js tests/storage-safety.test.js tests/indexeddb-transaction.test.js tests/dev-server.test.js`.
- Browser/verbindingcontrole: `node tests/supabase-connection.cjs`.
  Rapport: `scratch/supabase-connection/report.json`.

Er is geen afzonderlijk live testaccount aangetroffen. Er zijn geen echte
Supabase-logins of schrijf-/synchronisatiecontroles uitgevoerd en geen accounts
aangemaakt. Live synchronisatie is **niet bevestigd**. Voer eerst de SQL uit;
controleer daarna met een afzonderlijk bevestigd testaccount en testtuin zowel
upload als herstel en, met een tweede testaccount, de live gebruikersafscherming.
De echte collectie is niet geopend of gewijzigd. Niets gepusht of gepubliceerd.

Referenties voor de implementatie:
[publieke sleutels](https://supabase.com/docs/guides/getting-started/api-keys),
[RLS en eigenaarscontrole](https://supabase.com/docs/guides/database/postgres/row-level-security),
[Data API-toegang](https://supabase.com/docs/guides/api/securing-your-api).
