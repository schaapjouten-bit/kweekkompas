import supabase from './_shared/lib/supabase.js';

// Uses the existing public-key-only client without a user session.
// The schedule lives in netlify.toml; no browser or local timer is involved.
export default async () => {
    try {
        const { data, error } = await supabase.client()
            .rpc('kweekkompas_keepalive')
            .abortSignal(AbortSignal.timeout(10_000));
        if (error || data !== 1) {
            const message = ['PGRST202', '42883'].includes(error?.code)
                ? 'Supabase-keepalive: databasefunctie ontbreekt; voer de keepalive-SQL uit.'
                : 'Supabase-keepalive: databaseaanvraag mislukt; controleer verbinding en configuratie.';
            console.error(message);
            return new Response(null, { status: 503 });
        }
        console.log('Supabase-keepalive: databaseaanvraag geslaagd.');
        return new Response(null, { status: 204 });
    } catch {
        // Never log upstream errors, credentials, response bodies or user data.
        console.error('Supabase-keepalive: aanvraag mislukt; controleer verbinding en publieke configuratie.');
        return new Response(null, { status: 503 });
    }
};
