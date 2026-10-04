# Eigen API — lokale geavanceerde optie

Instellingen → AI → Eigen API → Geavanceerd bevat API-adres, model, afgeschermde sleutel, Opslaan, Sleutel verwijderen en Verbinding testen. Opslaan selecteert Eigen API voor zowel tuinassistent als zadenhulp. De bestaande OpenAI-compatibele `/chat/completions`-route wordt hergebruikt; beide hulpen gebruiken het model en adres uit de lokale backendconfiguratie.

De sleutel wordt alleen door de lokale backend opgeslagen in `.kweek-local-api.json` (Git-genegeerd, niet openbaar geserveerd en niet meegenomen in de statische build). De browser krijgt adres, model en alleen `keyConfigured` terug. Browseropslag bevat uitsluitend provider en model. Tuinsnapshots, back-ups en concepten bevatten deze configuratie niet. Bestaande `.env`-instellingen worden lokaal als uitgangspunt gelezen, maar nooit gewijzigd. Sleutel verwijderen wist de opgeslagen override; een bestaande omgevingssleutel wordt daarna voor Eigen API niet opnieuw gebruikt.

Een leeg sleutelveld behoudt de sleutel alleen bij hetzelfde API-adres. Bij wijziging van het adres wordt een oude sleutel niet meegenomen. Alleen HTTPS en HTTP op loopback zijn toegestaan; URL-inloggegevens, queryparameters en redirects zijn uitgesloten. De sleutel wordt alleen naar het ingestelde adres verstuurd.

`/api/local-api` bestaat uitsluitend in `scripts/dev-server.cjs`, met loopback-client-, host-, poort-, JSON- en exacte origincontrole voor alle acties. Er is geen Netlify-handler voor deze route. Online is Eigen API verborgen en niet bruikbaar; een opgeslagen providerkeuze wordt niet stilzwijgend veranderd. Er is geen gebruikersconfiguratie-infrastructuur gebouwd.

Verbinding testen verstuurt uitsluitend na een klik één korte aanvraag met `max_tokens: 1`, naar de opgeslagen dienst. Dit kan bij een betaalde dienst kosten maken. Opslaan, openen en verwijderen sturen geen AI-aanvraag. Fouten tonen geen externe responsebody of sleutel.

Controle: syntax, build en één geïsoleerde lokale mockcontrole voor opslaan/herladen, beide hulpen, expliciete minimale test, verwijderen, origin/adresvalidatie en online afscherming. Geen echte betaalde aanvraag, browserrondes, collectie- of bestaande sleutelwijzigingen, commit, push of publicatie.
