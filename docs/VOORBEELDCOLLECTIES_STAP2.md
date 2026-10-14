# Voorbeeldcollecties — stap 2

**Historisch verslag.** De Voorbeeldcollecties-functie is op 14 oktober 2026 verwijderd. Dit document beschrijft de oude implementatie.

Lokaal uitgevoerd op 3 oktober 2026. Niets committen, pushen of publiceren.

## Vindbaarheid

De huidige instellingen hadden al een knop Voorbeeldtuin laden, maar alleen
onderaan de lange instellingenpagina. De oudere Data & opslag-schermen
(`info-view-data` en `getDataStorageHTML`) bevatten die knop niet. Er waren dus
verschillende versies van hetzelfde scherm. In de lokale code is geen bewijs
voor een ontbrekend voorbeeldbestand als oorzaak van de onzichtbare knop.

Bovenaan Instellingen staat nu **Data & opslag · Voorbeeldcollecties**. Die knop
brengt je direct naar de opslagsectie. De oude `openInfoModal('data')`-ingang
opent voortaan dezelfde sectie. Het oudere losse datavenster heeft ook een
doorverwijzing naar de collecties. Daar staan de collecties met hun naam,
beschrijving en werkelijk aantal planten. **Lijst vernieuwen** leest bestanden
opnieuw. De bediening gebruikt vaste sectie- en collectie-identiteiten die
later ook bruikbaar zijn voor een tutorial; die tutorial is nu niet gebouwd.

## Map en toevoegen

Alle collectie-JSON staat in **`assets/example-collections/`**:

- `manifest.json`: de beschikbare collecties, hun vaste id, naam, beschrijving
  en bestandsnaam.
- `voorbeeldtuin.json`: de bestaande opgeschoonde collectie met 45 planten.
- `kruiden-in-potten.json`: een klein, zelfstandig voorbeeld met twee planten.

De bestaande foto's blijven in `assets/example-garden/`. Zo blijven fotopaden
in eerder geladen planten geldig. `laatste.json` blijft het oorspronkelijke,
persoonlijke bronbestand buiten de publieke assets. Gebruik dat bestand nooit
als publieke collectie en voer het afleidingsscript niet uit voor gewone builds.

1. Kopieer het kleine voorbeeld naar bijvoorbeeld `mijn-bloemen.json` in de
   collectiemap en pas de planten aan. Gebruik uitsluitend algemene informatie.
2. Voeg in de `collections`-lijst van `manifest.json` een object toe:

   ```json
   {
     "id": "mijn-bloemen",
     "name": "Mijn bloemen",
     "description": "Een kleine collectie bloemen voor potten.",
     "file": "mijn-bloemen.json"
   }
   ```

3. Gebruik unieke ids en bestandsnamen. Bestandsnamen bestaan uit kleine letters,
   cijfers en streepjes, gevolgd door `.json`; geen submappen. Vergeet de komma
   tussen manifest-objecten niet. Laat collectie-id en plant-id stabiel als je
   namen of beschrijvingen later wijzigt.
4. Start lokaal met `npm start`, open Instellingen → Data & opslag en klik
   **Lijst vernieuwen** (of sluit en open Instellingen). Een JSON-bestand alleen
   neerzetten is niet genoeg: het moet ook in het manifest staan.
5. Voer `npm run build` uit. De bestaande assetkopie neemt map, manifest en
   foto's mee naar `dist`, de ingestelde Netlify-publicatiemap. Bij een latere
   publicatie gaat de collectie daardoor mee. Deze stap publiceert zelf niets.

Alle bestanden onder `assets` zijn publieke websitebestanden bij een latere
publicatie. Voeg daar geen persoonlijke back-ups of gegevens aan toe.
De build controleert alle collectie-JSON, ook bestanden die nog niet in het
manifest staan, en weigert onbekende/persoonlijke velden en ontbrekende
manifestbestanden. Vrije tekst en zelf toegevoegde foto's moet je zelf op
persoonlijke informatie controleren.

## Ondersteund JSON-formaat

```json
{
  "backupVersion": 1,
  "seeds": [
    {
      "id": "radijs",
      "naam": "Radijs",
      "type": "Groente",
      "status": "Voorraad",
      "standplaats": "Zon",
      "water": "Gemiddeld",
      "zaaitijd": "3,4,5,6,7,8",
      "oogsttijd": "4,5,6,7,8,9",
      "beschrijving": "Zaai in kleine porties en houd de grond vochtig.",
      "tags": ["potten"]
    }
  ]
}
```

`backupVersion: 1` en een niet-lege `seeds`-lijst zijn vereist. Elke plant heeft
een unieke niet-lege `id` (tekst of getal), `naam`, `type` en `status: "Voorraad"`.
Types: Groente, Fruit, Kruid, Bloem, Bloembol, Boom, Struik, Sierplant, Overig.
Optioneel: `standplaats`, `water`, `zaaitijd`, `oogsttijd`, `beschrijving`, `tags`,
`images`, `featuredImageUrl` en bestaande uitplantvelden `plant_months`,
`plantMonths`, `planttijd`, `uitplanttijd`, `uitplanten`. De bestaande importvalidatie
controleert de planten vóór toevoegen; maandvelden ondersteunen bijvoorbeeld
`"3,4,5"` of `[3,4,5]`. Gebruik maandnummers 1–12.

Standplaatsen: Zon, Halfschaduw, Schaduw, Kas, Binnen, Onbekend.
Water: Laag, Gemiddeld, Hoog, Weinig, Veel, Onbekend.
Foto's: `"images": [{"url": "assets/example-garden/foto.png"}]` en eventueel
`"featuredImageUrl": "assets/example-garden/foto.png"`. URL's zijn relatief aan
de app, niet aan het JSON-bestand. Gebruik lokale, zelf gecontroleerde foto's.

Een collectie bevat uitsluitend `backupVersion` en `seeds`. Profielen,
accountgegevens, notities, ervaringen, aankoopgeschiedenis, groeivoortgang,
verlanglijst en herinneringen zijn niet toegestaan. De normale back-upimport
blijft zijn bestaande formaat en herstelgedrag houden.

## Gedrag en controle

Laden leest en valideert het hele bestand opnieuw en vraagt expliciet om
bevestiging met collectienaam, aantal planten en uitleg over behoud en lokale
opslag. Annuleren of een fout verandert niets. Toevoegen gebeurt in één lokale
IndexedDB-transactie. Eigen records worden niet overschreven. Dubbele namen
worden overgeslagen; een vaste combinatie van collectie-id en plant-id voorkomt
herhaald laden, ook na hernoemen. Bij een bezette id krijgt de nieuwe plant een
vrije id met suffix. De oorspronkelijke voorbeeldtuin behoudt de identiteit
uit stap 1. Er is geen automatische Supabase-upload.

Ontbrekende bestanden, ongeldige JSON, ongeldige planten en een ongeldig
manifest krijgen begrijpelijke meldingen. Een ongeldige collectie is in de
lijst niet laadbaar; andere geldige collecties blijven bruikbaar.

Gerichte controle: `node tests/example-collections.cjs`, met tijdelijke
browsercontexten en volledig afgeschermde services. Desktop 1440 px en mobiel
390/320 px; normale en oude ingang, metadata, bevestigen/annuleren, bestaande
gegevens, ID-conflicten, dubbele namen, herhaald laden, hernoemen, herladen,
ontbrekend bestand, kapotte JSON, ongeldige plant en manifest, verboden profiel,
herstel via lijst vernieuwen. Screenshots en rapport:
`scratch/example-collections/`. Geen echte account-, AI- of cloudverzoeken.

Resultaat: alle controles geslaagd. De bestaande voorbeeldtuin is aanvullend
getest in 18 combinaties van thema, breedte en lege/gevulde tuin, inclusief
gelijktijdig laden in twee tabbladen en behoud van foto's. De 41 gerichte
unitcontroles voor opslag, transacties, instellingen en accountgedrag slagen.
De browsercontrole van stap 1 slaagt op desktop en mobiel in alle drie thema's,
met behoud van de lokale tuin en nul schrijfacties naar services.
De build slaagt; beide collectie-JSON-bestanden en het manifest staan
byte-identiek in `dist`. De verplaatste opgeschoonde tuin is byte-identiek aan
de vorige versie. `laatste.json` heeft nog dezelfde SHA-256:
`E29C35E9D590806DAB088B49C02C333BEC8660EA418FB0F229E0C8263327CC05`.
AI, keepalive, Supabase-opslag en de bestaande wijzigingen uit stap 1 zijn
ongemoeid gelaten. Er is niets gecommit, gepusht of gepubliceerd.
