# Multi-user: migratievolgorde (productiestatus)

> **Toegepast op 2026-11-28 via Supabase SQL Editor:** `20261127215501_central_ai_setup.sql`, `20261127215502_central_ai_quota.sql` en `20261127215503_user_active_guard.sql` zijn in deze volgorde op productie uitgevoerd (daarom niet opgenomen in `supabase_migrations.schema_migrations`; niet opnieuw uitvoeren). Openbare registratie is uitgeschakeld en `jaaphh@ziggo.nl` heeft `app_metadata.kweek_role = "admin"`.

De lokale implementatie is getest met fixtures. Deze volgorde is nog niet op
productie uitgevoerd. De actuele lokale tuin is leidend; de bestaande
cloudsnapshot mag niet worden teruggezet vóór een bewuste nieuwe upload.

1. Bewaar en controleer eerst een recente export van de lokale tuin en foto's.
2. Test de accountgebonden opslag met de productie-identiteit in een aparte
   testomgeving. De oude opslag wordt niet verwijderd of naar de cloud gestuurd.
3. Wijs uitsluitend na identificatie van het juiste bestaande account de rol
   `admin` toe in door Supabase beheerde `app_metadata.kweek_role`. Niet in
   `user_metadata`: die kan de gebruiker zelf wijzigen. Andere accounts zijn
   standaard `user`.
4. Controleer op de testomgeving dat alleen een geverifieerde admin de
   gebruikersbeheerroute kan gebruiken en dat die de server-only Supabase-secret
   gebruikt. De admin maakt accounts met een wachtwoord aan; er is geen uitnodiging.
5. Schakel publieke registratie bij Supabase uit. Alleen de app-route blokkeren
   is onvoldoende zolang de publieke Auth API registratie accepteert.
6. Bij de eerste start als geverifieerde admin koppelt de app de bestaande
   opslag aan dat account. De oude synchronisatiewachtrij wordt gepauzeerd;
   cloudherstel is geblokkeerd tot een bewuste succesvolle upload van de lokale
   tuin. Een nieuw account krijgt lege opslag.
7. Maak een officiële migratie van `supabase/user-active-guard.sql` en pas die
   na de bestaande snapshot- en Storage-regels op de testomgeving toe. Houd er
   rekening mee dat reeds uitgegeven tijdelijke foto-URLs geldig blijven tot
   hun vervaldatum en dat een ban of wachtwoordreset bestaande JWT's niet zelf
   ongeldig maakt; de guard voorkomt toegang tot deze cloudgegevens tijdens
   de ban. Bestaande lokale gegevens op andermans apparaat blijven aanwezig.
8. Test het volledige traject lokaal en op een aparte testomgeving, inclusief
   directe API-aanroepen, twee accounts en een achterlopende cloudkopie.
9. Pas productieconfiguratie uitsluitend in een afzonderlijke opdracht aan.

De serverroute controleert de rol opnieuw op basis van `getUser`; lokale
gebruikersinterface en lokaal opgeslagen rolwaarden geven geen autorisatie.
