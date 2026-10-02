# Navigatie en zaaiplanner — stap 1

De zichtbare kompaslogo's in de sidebar en mobiele kop zijn native knoppen naar
Mijn tuin. Ze gebruiken de bestaande navigatie, ondersteunen Enter/spatie en
hebben de bestaande zichtbare focusring. Een open mobiel menu sluit bij navigatie.

Uit de verlanglijstkop is uitsluitend het blok met totaal/zaden/spullen verwijderd.
Zoeken, filters, toevoegen, kaarten, fotoverwerking en de bewerkdialoog zijn behouden.

De zaaiplanner heeft een eigen geselecteerd jaar, vorige/volgende jaar en een
direct invoerveld. Maandnavigatie loopt over december/januari en Deze maand
herstelt de actuele maand én het actuele jaar. Kalenderlinks, inclusief het
maandvenster vanuit de kalender, behouden maand en jaar.

Opgeslagen kalenderitems verschijnen uitsluitend bij hun oorspronkelijke
maand/jaar. Ook afgeronde historische items blijven zichtbaar en bewaard.
Klikken opent de bestaande kalender op hun opgeslagen dag. Teeltperiodes blijven
jaarlijkse plantgegevens; er worden geen geplande taken naar andere jaren gekopieerd.

## Scrollcontrole

De eerste inspectie van de planner en zijn voorouders vond geen begrenzende
hoogte, max-height of verticale clipping. De pagina groeit met de inhoud en de
onderste knoppen zijn bereikbaar. De gebruiker bevestigde tijdens deze stap dat
het afgekapt einde niet meer zichtbaar is. Daarom is de scrollstructuur behouden.
De eindcontrole gebruikte langere inhoud met 27 teeltactiviteiten en opgeslagen
planning. Beide onderste knoppen zijn na daadwerkelijk scrollen zichtbaar en
aanklikbaar, ook op mobiel.

## Gerichte lokale controles

`node tests/navigation-planner-step1.cjs` controleert uitsluitend de gewijzigde
onderdelen in Licht, Donker en Warm op 1440, 900, 390 en 320 px:

- Logo met muis, aanraking, Enter/spatie, focus en mobiele menunavigatie.
- Verlanglijstkop zonder aantallen; zoekveld, filters, toevoegen en kaarten aanwezig.
- December/januari in beide richtingen, meerdere jaren vooruit/terug, directe
  jaarkeuze, lege/ongeldige invoer en Deze maand.
- Planning uit 2024/2026/2027/2031 blijft bij zijn eigen jaar; teeltperiodes keren
  terug. Geen taakduplicatie; dezelfde opgeslagen gegevens na navigatie en herladen.
- Correcte maand/jaar/dag bij kalenderlinks en behouden jaar in het maandvenster.
- Lange plannerinhoud volledig scrollbaar; beide onderste knoppen bereikbaar;
  geen horizontale overloop of browserexceptions.

De controles gebruiken een statische lokale server en aparte browseropslag met
tijdelijke controledata. Backend- en externe aanvragen zijn geblokkeerd. Er zijn
geen wijzigingen aan AI, sleutels, Supabase of de bestaande voorbeelddata gemaakt.
Eerdere verlanglijst- en plantdetailcode en de AI-instellingen zijn behouden.

48 screenshots en het resultaat staan in `scratch/navigation-planner-step1/`.
Niets gepusht of gepubliceerd. Werk gestopt na stap 1.
