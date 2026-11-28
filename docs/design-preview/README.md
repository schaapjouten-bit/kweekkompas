# KweekKompas ontwerp-preview

Dit is een losstaand, klikbaar ontwerpconcept. Het verandert niets aan de werkende KweekKompas-app en gebruikt geen `localStorage`, IndexedDB, AI, netwerkverbinding of bestaande applicatielogica.

## Lokaal openen

Open `docs/design-preview/index.html` rechtstreeks in een browser, of serveer de projectmap met een eenvoudige lokale webserver. Er zijn geen dependencies of buildstappen nodig.

Gebruik bovenaan de preview:

- **Scherm** om te wisselen tussen Mijn zaden, Onboarding — opslag en Onboarding — jouw tuin.
- **Thema** om Licht, Donker of Speels direct te bekijken.

De plantfoto’s komen uit de bestaande lokale starterassets onder `assets/starters/`.

## Stijlrichting

- Licht: warme gebroken witte achtergrond, witte kaarten, donkergroen voor tekst en rustig saliegroen voor acties.
- Donker: diep donkergroen, duidelijk lichtere kaarten, gebroken witte tekst en gedempt saliegroen.
- Speels: warme crème, donkergroene tekst en rustige accenten in koraal, geel, bladgroen en lichtblauw.
- Definitieve Speels-visuele referentie: `docs/design/speels1-def.png`. De preview neemt daarvan de rustige geïllustreerde boven- en buitenranden, lichte werkruimte en kleurrijke iconenrichting over.
- `speels1-vb.png` is niet de hoofdreferentie; `idee1.png` tot en met `idee5.png` zijn alleen inspiratie.
- `icon-light-speels.png` is de referentie voor de aanvullende Speels-iconenrichting; `icondark.png` blijft de vormtaal voor Donker.
- CSS-variabelen in `styles.css` houden kleur, randen, focus en schaduwen per thema bij elkaar.
- Inline SVG-lijniconen vervangen emoji als hoofdiconen.
- Desktop is de basis; grids, navigatie en onboardingkeuzes vallen terug naar een compacte mobiele indeling.

Op **Onboarding — jouw tuin** zijn tuinplekken tijdelijk meervoudig te selecteren. De preview gebruikt daarbij de toekomstige vorm `gardenPlaces` en `primaryGardenPlace`; de eerste plek wordt automatisch hoofdplek en een andere geselecteerde plek kan dat overnemen. Zonlicht en ervaring blijven enkelvoudige keuzes.

## Bekende beperkingen

De knoppen en keuzes zijn alleen preview-interacties. Favorieten, filters, onboardingkeuzes en thema wisselen tijdelijk in het geheugen van de pagina; niets wordt opgeslagen. Detailweergave, toevoegen en back-up herstellen tonen alleen een korte voorbeeldmelding.
