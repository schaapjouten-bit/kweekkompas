# Herstel van Storage-migratie: fout 42501

De eerste instructie op `storage.objects` in het oorspronkelijke bestand was:

```sql
alter table storage.objects enable row level security;
```

Deze `ALTER TABLE` vereist tabel-eigenaarschap. Supabase beheert deze tabel en
de bijbehorende RLS; de app hoeft dit niet opnieuw in te stellen. De regel is
verwijderd. Er is geen wijziging van eigenaar, rol, tabelstructuur of RLS-status
toegevoegd. Ook `DROP/CREATE POLICY` vereist geschikte rechten: als de fout na
de correctie bij een policy optreedt, gebruik dan de dashboardroute hieronder.
Alleen een projectbeheerder zijn bewijst niet dat de SQL Editor die DDL mag doen.

De lokale test had zelf de Storage-tabel aangemaakt en was daardoor eigenaar.
Dat verklaart waarom die eerdere controle deze rechtenfout niet ontdekte. De
test bootst nu de vooraf ingeschakelde RLS van de beheerde tabel na; de app-SQL
wijzigt die status niet. Live SQL Editor-rechten zijn niet lokaal bewijsbaar.

## Gecorrigeerde SQL en volgorde

1. Gebruik de **volledige gecorrigeerde**
   `supabase/migrations/20261003093611_kweekkompas_private_photos.sql` in het juiste
   Supabase-project → **SQL Editor → New query → Run**.
   Deze stelt de bucket private en op **1.000.000 bytes**, en maakt de bestaande
   vier eigen-gebruikerpolicies plus twee restrictieve beschermingspolicies.
2. Voer daarna
   `supabase/migrations/20261003095425_kweekkompas_photo_limit_1mb.sql` uit.
   Dit is veilig herhaalbaar en zet dezelfde limiet nogmaals. Het bevat geen
   `storage.objects`-instructies en verandert of verwijdert geen bestanden.
   Ontbreekt de bucket, dan volgt bewust een fout met de eerste bestandsnaam.
3. Controleer **Storage → kweekkompas-photos → bucketinstellingen**:
   private, bestandslimiet **1 MB / 1.000.000 bytes**, toegestane MIME-types
   `image/png`, `image/jpeg`, `image/webp`, `image/gif`, `image/avif`.
   De globale Storage-limiet moet ten minste 1.000.000 bytes toelaten.
4. Controleer de policies met de onderstaande alleen-lezen query. Test echte
   upload/lezen en onderlinge afscherming uitsluitend met bevestigde testaccounts.

Beide bestanden bevatten `BEGIN`/`COMMIT`. Een fout vóór de commit maakt de
uitvoering niet geslaagd; ga er niet van uit dat de bucket al is aangemaakt.
Controleer dat in Storage. Als een hergebruikte SQL-sessie expliciet
`current transaction is aborted` meldt, voer eerst `ROLLBACK;` uit en start de
gecorrigeerde query opnieuw. Een nieuwe dashboardquery is normaal voldoende.

## Wanneer de SQL Editor ook policy-DDL weigert

Ga niet de eigenaar aanpassen, `SET ROLE` gebruiken of RLS uitschakelen. De
Storage-policies zijn de bedoelde manier om toegang te regelen. Zie
[Supabase Storage access control](https://supabase.com/docs/guides/storage/security/access-control)
en [de beheerde Storage-schemaopzet](https://supabase.com/docs/guides/storage/schema/design).

**Bucket via het dashboard:** open **Storage → New bucket**, naam/id
`kweekkompas-photos`, **Public bucket uit**, bestandslimiet **1 MB**, bovenstaande
MIME-types, en sla op. Bestaat de bucket al, open zijn instellingen en pas alleen
privacy/limieten aan. Upload of verwijder hierbij geen bestanden.

**Policies via het dashboard:** open **Storage → Policies**. Dit betreft
`storage.objects`; controleer alle daar getoonde policies, ook de algemene
policies die niet onder deze bucket gegroepeerd zijn.

1. Controleer eerst bestaande **permissive** policies voor `public`, `anon` of
   `authenticated` die deze bucket zouden kunnen toelaten. Een eigen policy
   blokkeert een brede andere permissive policy niet: ze worden met OR gecombineerd.
   Als de restrictieve guards uit de SQL al bestaan, behoud ze.
2. Ontbreken die guards en kan de UI geen **Restrictive** policy maken, begrens
   bestaande brede permissive policies zodat ze deze bucket niet toelaten.
   Open **Edit policy**; voeg aan elke toepasselijke **USING expression** en
   **WITH CHECK expression** toe:

   ```sql
   (<de volledige bestaande expressie>)
   and bucket_id <> 'kweekkompas-photos'
   ```

   Vervang de placeholder door de bestaande expressie, bijvoorbeeld `true`.
   Bewaar de bestaande operatie en rollen. SELECT/DELETE hebben USING;
   INSERT heeft WITH CHECK; UPDATE heeft beide. Was bij UPDATE WITH CHECK leeg,
   gebruik daar dezelfde begrensde USING-expressie. Policies die al expliciet
   uitsluitend andere buckets toelaten hoeven niet te worden aangepast.
   Dit sluit alleen deze bucket uit van brede toegang; toegang tot andere
   buckets blijft gelijk. Verwijder geen onbekende policies.
3. Klik naast `kweekkompas-photos` op **New policy → For full customization**.
   Maak de onderstaande vier permissive policies afzonderlijk. Selecteer als
   **Target roles** uitsluitend **authenticated**, niet `public` of `anon`.
   Gebruik voor alle genoemde expressievelden exact deze voorwaarde:

   ```sql
   bucket_id = 'kweekkompas-photos'
   and split_part(name, '/', 1) = (select auth.uid())::text
   and not coalesce(((select auth.jwt())->>'is_anonymous')::boolean, false)
   ```

   | Naam | Allowed operation | USING | WITH CHECK |
   | --- | --- | --- | --- |
   | `kweek_photos_read` | SELECT | bovenstaande voorwaarde | niet van toepassing |
   | `kweek_photos_insert` | INSERT | niet van toepassing | bovenstaande voorwaarde |
   | `kweek_photos_update` | UPDATE | bovenstaande voorwaarde | bovenstaande voorwaarde |
   | `kweek_photos_delete` | DELETE | bovenstaande voorwaarde | niet van toepassing |

   Bestaat een van deze policies al, kies **Edit policy** in plaats van een
   tweede exemplaar. Sommige dashboardversies hebben één **Policy definition**
   in plaats van twee expressievelden: plak dezelfde voorwaarde en controleer
   bij **Review** dat UPDATE zowel USING als WITH CHECK toepast (of de USING
   voorwaarde voor WITH CHECK overneemt). Een automatisch meeselecteerde SELECT
   voor UPDATE/DELETE mag dezelfde eigenaarsvoorwaarde gebruiken. Eventuele
   automatisch gegenereerde naamsuffixen veranderen de werking niet.
4. Kies telkens **Review → Save policy**. Controleer de gegenereerde SQL:
   `ON storage.objects`, bedoelde operatie, `TO authenticated` en de complete
   eigenaars-/anonymousvoorwaarde. Nooit `USING (true)`/`WITH CHECK (true)`.
5. Voer na het aanmaken van de bucket ook de aansluitende 1 MB-migratie uit;
   zo staat de grens exact op **1.000.000 bytes**, ongeacht de eenheidsweergave
   van het dashboard. Controleer onderstaande query en voer daarna de
   twee-accountcontroles uit. Als ook bucketconfiguratie-SQL wegens rechten
   wordt geweigerd, controleer de opgeslagen bytewaarde met de query en laat
   een bevoegde beheerder de exacte limiet instellen.

De huidige Storage-policyformuliercode biedt niet overal een keuzeknop voor
restrictieve policies. Het Review-scherm is geen betrouwbare manier om zelf
`AS RESTRICTIVE` aan de opgeslagen query toe te voegen. Daarom combineert de
UI-route de eigen voorwaarden met het uitsluiten van deze bucket uit brede
policies. Dit behoudt gebruikersisolatie, mits **alle** toepasselijke permissive
policies zijn nagekeken. Als ook Storage → Policies wegens rechten niet kan
opslaan, laat een bevoegde projectbeheerder dit via deze route uitvoeren of
schakel Supabase Support in. Claim de beveiliging dan nog niet als ingericht.
Bron voor de formulierstappen: [Supabase Studio policy-editor](https://github.com/supabase/supabase/tree/master/apps/studio/components/interfaces/Storage/StoragePolicies).

## Alleen-lezen controlequery

```sql
select c.relrowsecurity as rls_enabled
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'storage' and c.relname = 'objects';

select id, public, file_size_limit, allowed_mime_types
from storage.buckets where id = 'kweekkompas-photos';

select policyname, permissive, roles, cmd, qual, with_check
from pg_policies
where schemaname = 'storage' and tablename = 'objects'
order by policyname;
```

Verwacht RLS `true`, public `false`, limiet `1000000`. Bij de SQL-route zijn de
twee guards `RESTRICTIVE`. Bij de UI-route moeten de eigen policies de complete
voorwaarde hebben en mag geen andere permissive policy toegang tot deze bucket
verlenen. Als RLS onverwacht niet actief is, laat Supabase dit controleren;
schakel zelf geen beveiliging uit of tabel-eigenaar om.

## Lokale controle en beperking

`node --test tests/photo-storage-rls.test.js` controleert de exacte gecorrigeerde
SQL, herhaald uitvoeren, bestaande objecten behouden, twee gebruikers,
anonymous-toegang, UPDATE-padwisseling en de aansluitende 1 MB-migratie.
Ook de beschreven UI-voorwaarden met uitgesloten brede policies zijn lokaal
met twee gebruikers en anonymous-toegang gecontroleerd.
Er is lokaal gecontroleerd dat de app-SQL geen tabel-, eigenaar-, rol- of
RLS-statuswijziging bevat. Dit bewijst niet dat policy-DDL met jouw live
SQL Editor-rol is toegestaan. Er is niets live uitgevoerd, gepusht of gepubliceerd.
