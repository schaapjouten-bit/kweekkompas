# Private foto-opslag — stap 4

Lokaal gebouwd in `C:\Dev\Kweekkompas`. Er is niets gecommit, gepusht of
gepubliceerd. Er zijn geen live Storage-aanvragen of SQL-wijzigingen uitgevoerd.
`laatste.json` en de persoonlijke browsertuin zijn niet gewijzigd. AI, modellen,
keepalive, accountbediening en voorbeeldcollecties blijven behouden.

## Gebruik en gegevens

Gebruik **Instellingen → Account & cloud → Lokaal naar cloud**. Na bevestiging
worden de lokale foto's van planten/zaden, hun omslag, verlanglijst en profiel
naar de private bucket `kweekkompas-photos` gestuurd. Daarna wordt de bestaande
database-snapshot met versiecontrole opgeslagen. Er is geen automatische upload
bij inloggen, voorbeeldladen of lokale wijzigingen. Automatische synchronisatie
is niet gebouwd.

Nieuwe gekozen bestanden bij planten, verlanglijst en profiel worden lokaal
verwerkt naar WebP (of JPEG als terugval), maximaal 1600 pixels aan de langste
zijde en maximaal 1.000.000 bytes (1 MB). De beeldverhouding blijft behouden;
kleine afbeeldingen worden niet vergroot. De encoder probeert aflopende
kwaliteitsniveaus. Lukt de grens niet, dan volgt een duidelijke melding en wordt
de bestaande foto niet vervangen. Bij JPEG wordt transparantie op wit gezet;
geanimeerde nieuwe afbeeldingen worden als stilstaande foto verwerkt.

Bestaande lokale foto's en ingesloten foto's uit oude back-ups worden niet
achteraf aangepast. De cloudupload maakt
een afzonderlijke kopie en vervangt daarin afbeeldingen door permanente paden:

```text
supabase-photo://kweekkompas-photos/<auth-user-id>/<sha256-inhoud>.png
```

Voor upload wordt een bestaande foto alleen verwerkt als hij groter is dan
1 MB of 1600 pixels. Het lokale origineel en de lokale back-up blijven intact;
de bevestiging vermeldt dat de cloudkopie zo nodig een verkleinde versie bevat.
Een cloudherstel haalt deze cloudversie op, zoals vooraf expliciet bevestigd.
Identieke verwerkte inhoud binnen hetzelfde formaat krijgt hetzelfde pad, ook wanneer
de foto bij meerdere planten, wensen en het profiel staat. JPEG/jpg wordt
genormaliseerd naar `.jpeg`. Aanwezige objecten worden op omvang en type
gecontroleerd en hergebruikt; er wordt niet overschreven. Statische voorbeeld-
assets en bestaande gewone HTTP(S)-afbeeldingslinks blijven verwijzingen.
Afbeeldingsaliases uit de bestaande galerij worden ook meegenomen.

De overige cloudgegevens blijven die van stap 3: planten/favorieten/notities,
kalender, planning, reminders, dagelijkse voortgang, verlanglijst en tuinprofiel
inclusief uitsnede. API-sleutels, sessies en apparaatinstellingen gaan niet mee.

**Cloud naar dit apparaat** haalt na login en bevestiging eerst alle private
foto's op. De backend controleert de sessie en het gebruikerspad, en verstrekt
leeslinks die 60 seconden geldig zijn. Een verlopen link wordt eenmaal opnieuw
aangevraagd. Links blijven uitsluitend in het geheugen van de aanvraag; ze
worden niet in snapshots, lokale gegevens of back-ups opgeslagen. Na controle
van de SHA-256-inhoud worden foto's lokaal ingebed, zodat ze offline blijven
werken en geen periodieke linkvernieuwing nodig hebben. Inloggen alleen haalt
geen cloudtuin over de lokale tuin heen.

Een ontbrekende, beschadigde, te grote of onbereikbare foto blokkeert het hele
herstel. Er wordt dan niets lokaal vervangen, ook niet een deel van de tuin.
Voor een geslaagd herstel wordt de bestaande volledige lokale veiligheidskopie
gemaakt. Wijzigingen tijdens het ophalen en fouten bij de veiligheidskopie
blokkeren vervanging. De bestaande hersteltransactie en rollback blijven gelden.

Downloadbare lokale back-ups blijven zelfstandig met ingebedde eigen foto's;
oudere back-ups en oude cloudkopieën met ingebedde foto's blijven leesbaar.
Statische/externe links in zo'n back-up houden hun bestaande afhankelijkheid
van de assets of externe website. Er zijn geen tijdelijke cloudlinks nodig.

## Fouten en conflicten

Foto's worden eerst geüpload; pas na beschikbaarheidscontrole volgt de atomaire
snapshot-write met de bestaande `revision`-controle. Een Storage-fout verhindert
die write. Een conflict of snapshotfout laat de eerdere snapshot bestaan.
Een verloren antwoord na een geslaagde snapshot-write blijft, zoals in stap 3,
een onzekere uitkomst; opnieuw uploaden kan niet stil de nieuwe revisie vervangen.
De lokale tuin wordt bij upload, fouten of uitloggen nooit veranderd.

Al geüploade foto's kunnen bij een fout of conflict zonder snapshot achterblijven.
Die worden bij een volgende upload hergebruikt. Deze stap verwijdert geen
cloudbestanden automatisch. Storage-fouten wijzen op verbinding, toegangsregels,
bestandslimiet of beschikbare ruimte; bij een ontbrekende bucket wordt de
benodigde SQL genoemd. De app kan niet uit elke Storage-fout afleiden of juist
quota, policies of een tijdelijke storing de oorzaak is.

## Appgrenzen en Supabase-quota zijn afzonderlijk

| Appgrens | Waarde |
| --- | --- |
| Compacte snapshot zonder ingebedde foto's | 3.500.000 bytes (3,5 MB) |
| Bestaande snapshot-body/databasegrens | 4.000.000 bytes; JSONB-opmaak kan eerder de databasegrens raken |
| Nieuwe/verwerkte foto en nieuwe Storage-upload | 1.000.000 bytes (1 MB), langste zijde maximaal 1600 pixels |
| Nieuwe gekozen fotobestanden | Uitvoer WebP of JPEG; invoer PNG/JPEG/WebP/GIF/AVIF |
| Oud cloudobject terughalen | Bestaande objecten tot de eerdere 10 MB blijven leesbaar; niet verwijderd of overschreven |
| Eén upload/herstel | maximaal 500 unieke foto's en 250.000.000 bytes foto's |
| Private leeslink | 60 seconden; eenmaal vernieuwen bij verlopen toegang |

De instellingen tonen de omvang van de overige snapshot en foto's vóór verwerking.
Snapshotomvang wordt vóór bevestiging/netwerkverzoeken gecontroleerd. Na
bevestiging worden foto's zo nodig verwerkt; pas als dat volledig lukt begint
de upload. De backend weigert nieuwe bestanden boven 1 MB en Storage dwingt
dezelfde grens af. Foto's gaan rechtstreeks naar Storage en niet door de
Netlify Function-body. Er wordt geen foto weggelaten of lokaal origineel vervangen.
De lokale browserquota en beschikbaar geheugen blijven daarnaast beperkingen;
Storage maakt lokale opslag niet onbeperkt. Een grote profielfoto kan bijvoorbeeld
de kleinere localStorage-ruimte raken; een mislukte herstel-write wordt teruggedraaid.

Supabase Storage-ruimte is gedeeld door alle gebruikers en buckets van het
project. Volgens de actuele [Supabase-prijzen](https://supabase.com/pricing)
bevat Free 1 GB file storage en Pro 100 GB; egress heeft eigen quota/kosten.
Dit is geen gereserveerde ruimte per gebruiker. Achtergebleven of oudere foto's
tellen mee. Het plan en actuele gebruik van dit project zijn niet live geverifieerd.
Controleer ze in het dashboard bij Storage/Usage/Billing.

De [globale Storage-bestandslimiet](https://supabase.com/docs/guides/storage/uploads/file-limits)
moet minimaal 1.000.000 bytes toelaten; een bucket kan de globale limiet niet
verhogen. Free ondersteunt globaal tot 50 MB per bestand. Voor dit project
blijft de app/bucket op 1 MB. De app gebruikt standaard signed uploads met
herhaalbare inhoudspaden.
Een onderbroken upload wordt hier volledig opnieuw geprobeerd, niet hervat.

## SQL uitvoeren en configuratie

Bij fout `42501: must be owner of table objects`: de onnodige `ALTER TABLE`
is uit de bucketmigratie verwijderd. Gebruik de gecorrigeerde versie en zie
[SQL-herstel en exacte Storage → Policies-stappen](SUPABASE_STORAGE_SQL_HERSTEL.md).
Deze uitleg maakt onderscheid tussen de SQL Editor-rechten en de lokaal
geteste policies; er wordt geen tabel-eigenaar of beveiligingsstatus gewijzigd.

Exact bestand:
`supabase/migrations/20261003093611_kweekkompas_private_photos.sql`.

1. Open het juiste Supabase-project als beheerder → **SQL Editor → New query**.
2. Plak de volledige inhoud van dit bestand en kies **Run**. De transactie maakt
   de bucket private, stelt 1 MB en de MIME-types in en maakt gebruikersregels.
   Het bestand is opnieuw uitvoerbaar en verwijdert geen objecten of tuingegevens.
3. Controleer bij **Storage** dat `kweekkompas-photos` private is en de limieten
   kloppen. Controleer de globale bestandslimiet en vrije projectruimte.
4. Controleer daarna met apart bevestigde testaccounts A/B: eigen upload/lezen,
   herhaalde upload, geweigerde toegang tot elkaars pad, conflict en netwerkfout.
   Gebruik daarvoor niet de persoonlijke tuin. Er is geen service-role-key nodig.

Als de eerdere bucket-SQL al was uitgevoerd, voer aanvullend
`supabase/migrations/20261003095425_kweekkompas_photo_limit_1mb.sql` uit in
dezelfde SQL Editor. Dit verlaagt alleen de bucketlimiet naar **1.000.000 bytes**;
het verandert of verwijdert bestaande objecten niet. Het is veilig opnieuw
uitvoerbaar. Zonder uitvoering is de live bucketlimiet nog niet aangepast.

SELECT/INSERT/UPDATE/DELETE zijn alleen toegestaan onder de map met de eigen
`auth.uid()`. UPDATE controleert het oude én nieuwe pad. Restrictieve regels
beschermen deze bucket ook tegen een eventuele oudere brede permissieve policy;
anonymous Auth-gebruikers en de `anon`-rol hebben geen toegang. Regels voor andere
buckets worden niet aangepast. De app heeft geen verwijderactie in deze stap.
Zie [Storage access control](https://supabase.com/docs/guides/storage/security/access-control).
Signed links zijn tijdelijke bearer-toegang: deel ze niet; de app logt ze niet.

Backendconfiguratie blijft `SUPABASE_URL` en `SUPABASE_PUBLISHABLE_KEY` (of de
bestaande anon-key), met de ingelogde gebruikerssessie. Bevoorrechte sleutels
worden geweigerd. `/api/photo-access` is de nieuwe metadata-/toegangsroute;
de bestaande Netlify Functions-configuratie volstaat. Geen extra dependency,
nieuw databasemodel of publieke bucket is nodig.

De Auth-redirects uit stap 1 blijven nodig: Site URL en productie-redirect
`https://kweekkompas.netlify.app/`, lokaal `http://127.0.0.1:4173/` en, indien
gebruikt, `http://localhost:4173/`. Storage voegt geen redirect toe. Of deze
instellingen daadwerkelijk ontbreken, kan niet worden vastgesteld: de connector
vereist herauthenticatie. Er zijn geen dashboardinstellingen gewijzigd.

## Controles: werkelijk lokaal versus live

Uitgevoerd met uitsluitend geïsoleerde gegevens:

- Node-tests voor oude ingebedde back-ups, alle foto-slots/aliases, inhoudspaden,
  duplicaten, formaat/omvang en snapshotcontract.
- De werkelijke backend en Supabase SDK tegen een lokale HTTP-fixture: upload,
  herhaald uploaden zonder nieuwe object-write, compleet herstel, verlopen link,
  ontbrekend/corrupt object, uploadfout, conflict en geweigerde toegang door B.
- Exacte bovenstaande SQL tweemaal uitgevoerd in lokale PostgreSQL/PGlite met
  nagebootste `auth.uid()`/JWT en Storage-tabellen. SELECT/INSERT/UPDATE/DELETE,
  eigenaarwisseling, anonymous toegang en brede oude policies gecontroleerd.
  Dit controleert RLS, niet de echte Supabase Storage-dienst of signed tokenserver.
- Twee tijdelijke Chromium-sessies (1440 px en 390 px) tegen de lokale backend
  en Storage-fixture: behoud lokale data/safety/status na herladen, conflict,
  netwerkuitval bij snapshot en foto's, ontbrekende foto, limieten en uitloggen.
  Geen upload door login/voorbeelden; geen horizontale overflow op mobiel.
- Aanvullende echte browserverwerking op 1440/390 px: gegenereerde PNG van
  8.475.882 bytes en 2400 × 1200 pixels wordt WebP van 856.386 bytes en
  1600 × 800 pixels; JPEG-terugval 837.139 bytes. Bestandsinvoer, plantgalerij en profielhandler,
  onveranderde lokale originelen bij uploadvoorbereiding en stabiele herhaalde
  paden slagen. Een nagebootste encoder die steeds meer dan 1 MB levert wordt
  duidelijk afgewezen. Oud cloudobject boven 1 MB blijft leesbaar in de fixture;
  nieuwe uploads/snapshots boven de nieuwe grens worden geweigerd. De aparte
  limiet-SQL is tweemaal lokaal uitgevoerd en gecontroleerd op 1.000.000 bytes.
  De verlanglijstcontroles slagen op 1440/390/320 px in alle drie thema's,
  inclusief verwerking bij upload/plakken, annuleren en behoud van oudere foto's.
- Alle 47 gerichte Node-tests slagen, inclusief account-, keepalive- en lokale
  servercontroles. De accountbrowsercontroles (desktop/mobiel, alle drie thema's)
  en voorbeeldcollectiecontroles (1440/390/320 px) slagen. `npm run build` slaagt;
  desktop- en mobiele screenshots zijn visueel nagekeken.
  Persoonlijk bronbestand wordt uitsluitend met een SHA-256-integriteitscontrole
  gecontroleerd; de tests lezen geen persoonlijke tuinrecords.

**Niet live bewezen:** echte bucket/policies, signed upload/download, projectquota
en gebruikersisolatie op het verbonden Supabase-project. Er zijn geen apart
bevestigde testaccounts beschikbaar; de Supabase-connector is bovendien
ongeautoriseerd. De SQL staat klaar maar is niet op het project uitgevoerd.

Herhalen: `node --test tests/photo-storage.test.js tests/photo-storage-rls.test.js
tests/cloud-sync-contract.test.js tests/auth-cloud.test.js tests/cloud-rls.test.js
tests/storage-safety.test.js tests/indexeddb-transaction.test.js` en
`node tests/cloud-step3-browser.cjs`. Browserrapport/screenshots staan in
`scratch/cloud-step3/`. Deze fixtures maken geen verbinding met live Supabase.
Fotoverwerking: `node tests/photo-processing-browser.cjs`; rapport in
`scratch/photo-processing/report.json`.
