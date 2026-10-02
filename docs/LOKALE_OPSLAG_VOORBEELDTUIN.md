# Lokale opslag en voorbeeldtuin

Uitgevoerd op 2 oktober 2026, uitsluitend lokaal.

De opslagsectie en bijbehorende uitleg vermelden nu: “Je gegevens worden
automatisch op dit apparaat opgeslagen.” De app blijft zonder account bruikbaar.
Cloud-synchronisatie is optioneel en gebeurt op verzoek. Technische teksten over
datasets zijn vervangen door uitleg over wat wordt bewaard of vervangen; de
bestaande acties voor downloaden, herstellen en importeren zijn behouden.

## Voorbeeldbestand

`laatste.json` in de projectroot is uitsluitend gelezen. Een SHA-256-controle
voor en na de werkzaamheden bevestigt dat het oorspronkelijke bestand gelijk
is gebleven. Het bevat 45 planten, naast profielgegevens, persoonlijke
voortgang, verlanglijst en herinneringen.

De aparte statische collectie staat in
`assets/example-garden/voorbeeldtuin.json`, met uitsluitend `backupVersion` en
`seeds`. Plantnamen, categorie, standplaats, waterbehoefte, maandperiodes,
algemene teeltbeschrijvingen en planttags zijn behouden. Profiel, account,
ervaringen, privénotities, codes, aankoopgegevens, favorieten, historische
groeistatus en persoonlijke planning zijn niet overgenomen. De voorbeeldplanten
starten als voorraad; er worden geen persoonlijke teeltdagen ingevuld.

81 aanwezige ingesloten foto's zijn visueel bekeken en als lokale bestanden
naast het JSON-bestand opgenomen. De beeldbytes zijn behouden; tekstbijschriften,
oorspronkelijke bestandsnamen en afbeeldingsmetadata met persoonlijke informatie
zijn niet meegenomen. De PNG-bronnen bevatten uitsluitend beeldchunks; de
WebP-bron bevat geen EXIF/XMP. Externe fotolinks zijn niet nodig. De fotoverzameling
is ongeveer 95,7 MB; het JSON-bestand is klein en verwijst naar de lokale foto's.
De bestaande build kopieert deze assets automatisch mee. Het persoonlijke
bronbestand wordt niet meegebouwd of door de lokale server aangeboden.

`scripts/create-example-garden.cjs` legt de expliciete lokale afleiding vast.
De app en normale build voeren dit script niet uit en lezen `laatste.json` niet.

## Toevoegen

Instellingen → Data & Opslag bevat **Voorbeeldtuin laden**. Na laden en volledige
validatie via de bestaande back-upfuncties vraagt de app om bevestiging. Alleen
voorbeeldplanten worden toegevoegd; geen profiel-, kalender- of cloudgegevens.

Het toevoegen leest de aanwezige planten en schrijft nieuwe planten in één
IndexedDB-transactie. Bestaande records worden niet geschreven of verwijderd.
Dubbele namen worden overgeslagen; voorbeeldidentiteiten blijven ook na
hernoemen herkenbaar. Bij een ID-conflict krijgt het nieuwe voorbeeld een vrije
ID. Gelijktijdige tabbladen kunnen dezelfde voorbeelden niet dubbel toevoegen.
Een korte melding toont het werkelijk toegevoegde aantal, inclusief nul.

## Controle

- `node tests/example-garden.cjs`: aparte tijdelijke browserprofielen, Licht,
  Donker en Warm op 1440, 390 en 320 pixels, met een lege en gevulde tuin.
  Bevestigen, annuleren, ID-conflicten, bestaande foto's/notities/planning,
  opnieuw laden, hernoemde voorbeelden, foto's decoderen, herladen en gelijktijdig
  laden in twee tabbladen zijn gecontroleerd. Een ontbrekend of ongeldig
  voorbeeldbestand verandert niets. Geen AI- of cloudverzoeken uitgevoerd.
- `node --test tests/storage-safety.test.js tests/indexeddb-transaction.test.js
  tests/settings-redesign.test.js`: 40 tests geslaagd, inclusief bestaande
  back-upvalidatie, herstel, rollback en gegevensbehoud.
- De planner-test verwijst nu naar de actuele optionele `soonDate`-parameter.
  Dezelfde fixtures en alle vijf exacte verwachte groepen zijn behouden. De
  gerichte test voor opgeslagen zaai-, uitplant- en oogstperiodes slaagt.
- `node scripts/build.cjs`: statische app met voorbeeldassets gebouwd. Het
  persoonlijke bronbestand en backend/sleutels zitten niet in de build.

Screenshots, visuele fotocontrole en browserrapport staan in
`scratch/example-garden/`. AI-code, provider/modelkeuzes, API-sleutels en
Supabase-configuratie zijn behouden. Alleen cloudteksten zijn vereenvoudigd.
Niets gepusht of gepubliceerd.
