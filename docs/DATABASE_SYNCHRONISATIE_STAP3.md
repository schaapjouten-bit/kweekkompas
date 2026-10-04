# Database en synchronisatie — stap 3

Dit beschrijft de oplevering van stap 3. Stap 4 vervangt de ingebedde foto's in
nieuwe cloudkopieën door private Storage-verwijzingen; zie
[Private foto-opslag — stap 4](FOTO_OPSLAG_STAP4.md) voor de actuele foto-opslag,
limieten, SQL en controles. Lokale back-ups blijven ingebedde foto's gebruiken.

Lokaal uitgevoerd op 3 oktober 2026 in `C:\Dev\Kweekkompas`. De projectafspraken
in `KWEEK_KOMPAS_PLAN.md` en `ROADMAP.md` zijn gelezen. Er is geen `AGENTS.md`
in de projectmap of bovenliggende werkmap aangetroffen. Supabase en de bestaande
Netlify Functions-opzet zijn geïnspecteerd; geen nieuwe dependencies, tabellen,
Storage-buckets, migraties of wijzigingen aan de toegangsregels aangebracht.

## Wat gaat mee?

De oude upload gebruikte de volledige lokale back-up. De gevraagde onderdelen
waren al aanwezig, maar apparaatinstellingen gingen daardoor ook mee. Er is nu
een apart cloudcontract in `cloud-data.js`, gedeeld door browser en backend.

| Onderdeel | Cloudkopie |
| --- | --- |
| Zaden en planten | Alle plantrecords, inclusief eigen notities, groeistatus, favorieten en teelt-/uitplant-/oogstplanning |
| Foto's | Plantfoto's en omslag, foto's bij wensen en profielfoto; ingesloten data-URL's blijven bytegetrouw, URL-verwijzingen blijven verwijzingen |
| Kalender en planning | `calendar`, actieve `reminders`, `dailyProgress` en de periodes/statusvelden op planten |
| Verlanglijst | Volledige `wishlist` |
| Tuinprofiel | Naam, klimaat, tuintype, tuinplekken/hoofdplek, licht, ervaring, foto en bijbehorende uitsnede |
| Apparaatinstellingen | Niet: thema, schermindeling, UI-staat, onboardingstatus, meeteenheden en `settings` |
| Geheimen en account | Niet: AI-keuzes, API-sleutels, authsessies/tokens, wachtwoorden of accountcookies |

De backend filtert beide richtingen, ook bij oude snapshots met apparaatinstellingen.
Het profiel heeft een expliciete lijst velden; bekende credentialvelden worden
ook uit geneste tuinrecords verwijderd. Vrije tekst blijft eigen tekst; dit is
geen detector voor geheimen die iemand zelf in een notitie heeft geplakt.
De gewone downloadbare lokale back-up blijft volledig en ongewijzigd van opzet.
Bij cloudherstel blijven thema, meeteenheden, AI-keuze en andere lokale
instellingen behouden. Ontbrekende onderdelen in oudere cloudkopieën vervangen
geen bestaande lokale onderdelen.

## Snapshot en foto's: afgebakend bruikbaar

De bestaande tabel `public.kweekkompas_snapshots` bewaart één JSONB-snapshot per
gebruiker. Voor een bescheiden tuin past dit bij het bestaande back-upmodel en
de handmatige upload/herstelacties. Er is geen concrete noodzaak voor nieuwe
plant-, kalender- of profieltabellen om deze onderdelen te synchroniseren.

De huidige beperkingen zijn concreet:

- Backend en lokale server: maximaal **4.000.000 bytes** voor de aanvraagbody.
- Bestaande SQL: `octet_length(payload::text) <= 4000000`; dit meet de
  JSONB-tekstrepresentatie, die iets groter kan zijn dan compacte JSON.
- Netlify buffered Functions: request/response maximaal **6 MB**, volgens de
  [Netlify Functions-documentatie](https://www.netlify.com/knowledge-base/how-to-add-a-backend-api-endpoint-with-netlify-functions/).
- Nieuwe appgrens: **3.500.000 bytes** compacte cloud-JSON (3,5 MB), met marge
  voor aanvraagvelden en JSONB-opmaak. Bij uitzonderlijk veel kleine velden kan
  de databasegrens alsnog ingrijpen; ook die fout wordt begrijpelijk gemeld.

De instellingen tonen de actuele cloudomvang. Upload controleert formaat en
omvang vóór bevestiging en vóór het netwerkverzoek. De backend controleert
opnieuw en vertaalt een SQL-constraintfout naar een duidelijke limietmelding.
Een te grote tuin wordt helemaal niet geüpload; foto's worden niet stil
weggelaten, verkleind of verwijderd. De volledige lokale tuin blijft bewaard.

Alleen de bestandsomvang van `laatste.json` is voor deze beoordeling genoteerd:
**188.451.445 bytes**. Dit is geen meting van de actieve persoonlijke browsertuin.
Het bestand is niet gewijzigd of naar Supabase gestuurd. Het illustreert dat
een grote back-up met ingesloten foto's niet binnen deze route past. Een hogere
SQL-limiet alleen lost de Netlify-aanvraaggrens niet op. Voor zulke collecties
is een afzonderlijke foto-opslag/uploadroute nodig, met private toegang en
verwijzingen vanuit het snapshot. Die uitbreiding is niet gebouwd in deze stap;
de snapshot wordt dus niet als geschikt voor grote fotoverzamelingen voorgesteld.

## Handmatige bediening en bescherming

Instellingen → Account & cloud toont loginstatus, de laatste **geslaagde** upload
of terughaalactie op dit apparaat/account, lokale wijzigingen en de cloudomvang.
Een lokale SHA-256-vingerafdruk vergelijkt uitsluitend de cloudgegevens; een
thema- of eenhedenwijziging maakt de tuin niet ten onrechte gewijzigd.
Deze metadata blijft lokaal, ook na herladen. Opslagmeldingen worden na
opgeslagen plant-, profiel-, wens- en taakwijzigingen gebundeld bijgewerkt;
er wordt daarvoor niet per toetsaanslag een netwerkverzoek verstuurd.

**Lokaal naar cloud** en **Cloud naar dit apparaat** zijn afzonderlijke acties,
beide met bevestiging. Upload gebruikt de bestaande atomaire versiecontrole:
alleen schrijven wanneer de gelezen `revision` nog overeenkomt. Twee apparaten
kunnen een oude cloudversie daardoor niet ongemerkt over een nieuwe schrijven.

Een gewijzigd snapshot na de vorige geslaagde synchronisatie, of een HTTP 409,
toont een conflictkeuze. Gewone upload blijft geblokkeerd, ook na herladen en
cloudstatus vernieuwen. Je kiest **Cloudkopie kiezen** of **Mijn lokale tuin
bewust naar cloud sturen**. De tweede actie leest eerst de huidige cloudversie,
vraagt expliciet om bevestiging en gebruikt opnieuw de versiecontrole. Het is
een bewuste keuze voor één hele tuin; geen automatische samenvoeging.

Cloudherstel valideert vóór schrijven. Eerst wordt de volledige vorige lokale
tuin in de bestaande IndexedDB-veiligheidskopie bewaard. Mislukt dat, dan wordt
niets vervangen. Een wijziging tijdens het maken van de kopie blokkeert herstel.
De bestaande hersteltransactie en rollback blijven in gebruik. De
**Veiligheidskopie terugzetten**-actie blijft beschikbaar.

Netwerkuitval, een ongeldige cloudkopie, een conflict en uitloggen verwijderen
geen lokale gegevens. Cloudrequests hebben een timeout van 20 seconden. De
laatste geslaagde status wordt pas na een bevestigde geslaagde actie bijgewerkt.
Wanneer een antwoord verloren gaat na een mogelijk geslaagde server-write,
vangt de versiecontrole een herhaalde upload af; de app claimt dan geen succes.
Inloggen en het laden van voorbeeldcollecties uploaden niets.

## Automatische synchronisatie: concrete blokkade

Automatisch synchroniseren is **niet toegevoegd en niet inschakelbaar**. De
bestaande versiecontrole beschermt afzonderlijke requests, maar vormt nog geen
betrouwbare automatische synchronisatiecyclus. De opslagmeldingen hebben nog
geen bron/bedoeling: eigen wijzigingen, voorbeelden en herstel melden allemaal
dat de lokale tuin veranderd is. Er ontbreekt een blijvende, accountgebonden
wachtrij met oorsprong en afhandeling van onzekere netwerkuitkomsten. Die moet
na herladen veilig kunnen hervatten zonder dat inloggen of voorbeeldladen een
upload veroorzaakt, en bij conflicten stoppen voor een keuze. Daarnaast zijn
grote foto-snapshots via de bestaande route niet verstuurbaar.

Een eenvoudige automatische timer zou die problemen niet oplossen. Deze stap
houdt daarom de gecontroleerde handmatige route. Voor een latere implementatie
blijven de gewenste voorwaarden: standaard uit, per apparaat/account expliciet
aanzetten, uitsluitend ingelogd, gebundelde eigen wijzigingen, geen uploadtrigger
door login/voorbeelden en persistente blokkering bij conflicten.

## Echte controles, SQL en redirectinstellingen

Er is **geen apart bevestigd live testaccount** in de beschikbare omgeving.
Er zijn geen wachtwoorden gevraagd, geen persoonlijke browser of collectie
geopend en geen echte login, mail, upload of herstel uitgevoerd.

Alleen-lezen aanvragen aan het bestaande project `cmsthawjpxgyrmfwplfj`:

- Auth-settings: HTTP 200; e-mailprovider aan, registratie toegestaan,
  `mailer_autoconfirm: false` (mailbevestiging blijft verplicht).
- Data API `kweekkompas_snapshots?select=user_id&limit=0`: HTTP 401 / `42501`.
  Er is geen tuinrij gelezen. Anonieme tabeltoegang wordt geweigerd. Dit is geen
  bewijs dat ingelogde synchronisatie of alle live policies juist werken.
- De Supabase-connector weigert beheertoegang met **UNAUTHORIZED: opnieuw
  aanmelden vereist**. Live tabeldefinitie, constraints, RLS en private
  URL-configuratie zijn daardoor niet geverifieerd.

Er is **geen nieuwe SQL-migratie nodig voor de lokale wijzigingen**: de bestaande
snapshot, kolommen en versiecontrole blijven gebruikt. Als de live inrichting
ontbreekt of afwijkt, staat de volledige bestaande SQL met eigenaarscontrole
klaar in `supabase/migrations/20261002131955_kweekkompas_user_snapshots.sql`;
de uitvoering en metadataqueries staan in `docs/SUPABASE_LOKAAL_V2.md`.
Niet blind opnieuw uitvoeren: controleer eerst live tabel/constraints/policies
met beheertoegang. Deze stap heeft geen SQL uitgevoerd in het echte project.

De code gebruikt nog steeds onderstaande redirects. Het is niet vastgesteld
welke waarden in het dashboard ontbreken; ze zijn **niet toegankelijk**, niet
bewezen afwezig. Controleer exact bij
[Authentication → URL Configuration](https://supabase.com/dashboard/project/cmsthawjpxgyrmfwplfj/auth/url-configuration):

| Instelling | Vereiste waarde |
| --- | --- |
| Site URL | `https://kweekkompas.netlify.app/` |
| Redirect URL productie | `https://kweekkompas.netlify.app/` |
| Redirect URL lokale standaard | `http://127.0.0.1:4173/` |
| Redirect URL indien localhost gebruikt wordt | `http://localhost:4173/` |

Gebruik steeds dezelfde lokale oorsprong; beide adressen hebben eigen
browseropslag. Behoud e-mailbevestiging en toegangsregels. De standaard
`{{ .ConfirmationURL }}`-links worden ondersteund; exacte mailtemplate-uitleg
staat in `docs/LOGIN_ACCOUNT_STAP1.md`. Supabase vereist dat de aangevraagde
redirect overeenkomt met de toegestane lijst:
[officiële redirectdocumentatie](https://supabase.com/docs/guides/auth/redirect-urls).

## Gesimuleerde verificatie

- `node tests/cloud-step3-browser.cjs`: twee onafhankelijke Chromium-contexten,
  desktop 1440 px en mobiel 390 px, tegen de echte lokale app/backend met lokale
  HTTP-Supabase-fixtures. Volledige round-trip inclusief foto's/favorieten,
  profiel, kalender/planning en verlanglijst; apparaatinstellingen behouden;
  persistente veiligheidskopie en syncstatus; conflict en expliciete keuze;
  upload/terughalen bij netwerkuitval; herladen; ongeldige cloudtuin; mislukte
  veiligheidskopie; te grote foto; mislukte en geslaagde logout. Allemaal geslaagd,
  nul JavaScript-fouten, nul echte writes. Beelden ook visueel nagekeken.
- 49 gerichte tests geslaagd met `node --test` voor `cloud-sync-contract`,
  `auth-cloud`, `cloud-rls`, `storage-safety`, `indexeddb-transaction`,
  `settings-redesign`, `auth-account`, `dev-server` en `supabase-keepalive`.
  De echte SQL wordt in lokale PGlite uitgevoerd, met nagebootste Auth-claims;
  eigenaarsafscherming, anonieme toegang en herhaalbaarheid blijven beschermd.
- Stap 1: `node tests/auth-account-browser.cjs` opnieuw geslaagd in drie thema's,
  desktop/mobiel, inclusief mailflows met fixtures en behoud van lokale gegevens.
- Stap 2: `node tests/example-collections.cjs` opnieuw geslaagd op 1440/390/320 px,
  inclusief herhaald laden, foutgevallen en nul automatische uploads.
- `node scripts/build.cjs` en `git diff --check` geslaagd.

Rapporten staan in `scratch/cloud-step3/`, `scratch/auth-account/` en
`scratch/example-collections/`. Live synchronisatie is **niet bewezen**.
`laatste.json` houdt SHA-256
`E29C35E9D590806DAB088B49C02C333BEC8660EA418FB0F229E0C8263327CC05`.
De echte collectie is niet gewijzigd. Stap 1 en 2, lokaal gebruik zonder account,
AI/providers/modellen en keepalive blijven behouden. Niets gecommit, gepusht
of gepubliceerd.

Aanvullende geraadpleegde primaire bronnen:
[JSONB in Supabase](https://supabase.com/docs/guides/database/json),
[RLS](https://supabase.com/docs/guides/database/postgres/row-level-security),
[Supabase changelog](https://supabase.com/changelog).
