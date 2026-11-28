# Centrale Gemini voor gebruikers

De betaalde gebruikerssleutel staat versleuteld met AES-256-GCM in de private
Storage-bucket `kweekkompas-ai-config`. De applicatie gebruikt uitsluitend
`gemini-3.5-flash-lite` voor geverifieerde reguliere accounts. Persoonlijke
administratorinstellingen en sleutels blijven afzonderlijk.

Voor latere ingebruikname, niet tijdens deze lokale opdracht:

1. Maak met de Supabase CLI officiële migraties van de SQL in
   `supabase/central-ai-setup.sql` en `supabase/central-ai-quota.sql`; controleer de Storage-policies en test die
   eerst buiten productie. De CLI was lokaal niet beschikbaar.
2. Stel uitsluitend voor serverfuncties de bestaande `SUPABASE_SECRET_KEY` en
   een nieuwe onafhankelijke `KWEEK_CENTRAL_AI_ENCRYPTION_KEY` in. Deze laatste
   is 32 cryptografisch willekeurige bytes in base64. Bewaar een veilige kopie:
   zonder dezelfde sleutel is de opgeslagen Gemini-sleutel niet te ontsleutelen.
   Draai de encryptiesleutel alleen met een gecontroleerde her-encryptie of voer
   daarna de Gemini-sleutel opnieuw in.
3. Richt de bestaande adminrol in zoals beschreven in de multi-user-migratie.
4. Na afzonderlijk goedgekeurde publicatie kan de beheerder via **AI voor
   gebruikers** een betaalde Gemini-sleutel invoeren en testen. De sleutel wordt
   pas opgeslagen na een succesvolle test en wordt nooit teruggestuurd.

De standaardlimiet is 500 aanvragen per kalendermaand in de tijdzone
Europe/Amsterdam. Reserveringen worden vóór de Gemini-aanroep atomair gedaan;
bevestigde weigeringen geven de reservering terug. Een time-out of andere
onzekere provideruitkomst blijft meetellen omdat de aanvraag mogelijk is
verwerkt. Aanvraag-ID's voorkomen een tweede aanroep voor dezelfde poging.
De bescherming werkt pas nadat de budgetmigratie is toegepast; zonder de
databasefunctie weigert de centrale route aanvragen in plaats van zonder limiet
door te gaan. Er worden geen limieten op persoonlijke admin-AI toegepast.
