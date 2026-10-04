# Publicatie van de afgeronde lokale wijzigingen

Doel: de bestaande site https://kweekkompas.netlify.app/ via de bestaande Git-productiebranch `main`, repository `schaapjouten-bit/kweekkompas`, Netlify-site `1dd87b6b-a014-4194-866b-28dd59637923`.

De commit bevat de afgeronde Planning-, account-, foto-opslag-, voorbeeldcollectie-, concept-, synchronisatie- en AI-instellingenwijzigingen, bijbehorende broncode, gerichte controles en documentatie. Ontwerpinspiratie en losse lokale ontwerpvoorstellen zijn buiten de commit gehouden. Het oude voorbeeldtuinbestand is vervangen door het opgeschoonde collectiecontract en manifest.

Productieconfiguratie:

- Bestaande Supabase-URL blijft `https://cmsthawjpxgyrmfwplfj.supabase.co`; de publieke/publishable key en bestaande Gemini-productiekey zijn ingesteld en niet gewijzigd.
- Gemini-model: `gemini-3.8-flash`; catalogus: `gemini-3.8-flash,gemini-3.5-flash-lite`. Deze expliciete catalogus voert geen generatieprobes uit bij het openen van de instellingen. Er zijn voor deze publicatie geen model- of sleutelgeneraties getest.
- Nieuwe online gebruikers krijgen Gemini als standaard. Lokaal blijft Ollama de standaard; expliciet opgeslagen provider/modelkeuzes blijven behouden. De instellingen en providerknop melden voor opgeslagen online Ollama-keuzes dat de huidige backendroute niet bereikbaar is.
- Eigen API-configuratie bestaat alleen in de lokale server. De route staat niet in `netlify/functions`, de lokale sleutelconfiguratie is Git-genegeerd en wordt niet door de build gekopieerd. De online invoer is verborgen en de provider niet bruikbaar.
- Keepalive blijft gepland met `0 */12 * * *`; broncode en SQL zijn niet gewijzigd. De bestaande gepubliceerde deploymetadata bevestigde deze planning vóór publicatie.
- Private foto-opslag en de limiet van 1.000.000 bytes blijven in de bestaande code/migraties behouden. De volgens de gebruiker al toegepaste SQL is niet opnieuw uitgevoerd. Geen live foto- of snapshotwrites.

De statische build kopieert alleen de openbare appbestanden en assets. `.env`, `.kweek-local-api.json`, `laatste.json`, persoonlijke back-ups, `scratch`, `node_modules`, lokale server/configuratieroutes en ontwerpmappen komen niet in `dist`. De neutrale hulpafbeelding en opgeschoonde voorbeeldcollecties mogen mee.

Voor publicatie is één lokale build uitgevoerd en zijn de gewijzigde scripts op syntax gecontroleerd. Geen herhaling van brede suites of afgeronde browserrondes. De korte livecontrole gebruikt een nieuw leeg browserprofiel, zonder aanmeldsessie, herstelmails, live uploads of AI-generaties. Het uiteindelijke commit/deploy/livecontroleresultaat wordt na publicatie afzonderlijk gerapporteerd.
