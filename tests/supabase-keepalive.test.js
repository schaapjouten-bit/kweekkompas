const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { PGlite } = require('@electric-sql/pglite');

test('keepalive doet een RPC met publieke sleutel; fouten en logs bevatten geen externe details', async () => {
    const { default: keepalive } = await import('../netlify/functions/supabase-keepalive.mts');
    const savedFetch = global.fetch;
    const savedLog = console.log;
    const savedError = console.error;
    const logs = [];
    const calls = [];
    let result = () => new Response('1', { headers: { 'Content-Type': 'application/json' } });
    Object.assign(process.env, { SUPABASE_URL: 'https://cmsthawjpxgyrmfwplfj.supabase.co', SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_fixture' });
    delete process.env.SUPABASE_ANON_KEY;
    console.log = console.error = (...values) => logs.push(values.join(' '));
    global.fetch = async (url, options) => { calls.push({ url: String(url), options }); return result(); };
    try {
        assert.equal((await keepalive()).status, 204);
        assert.equal(calls.length, 1);
        assert.equal(calls[0].url, 'https://cmsthawjpxgyrmfwplfj.supabase.co/rest/v1/rpc/kweekkompas_keepalive');
        assert.equal(calls[0].options.method, 'POST');
        assert.equal(new Headers(calls[0].options.headers).get('apikey'), 'sb_publishable_fixture');
        assert.deepEqual(JSON.parse(calls[0].options.body), {});
        assert.ok(calls[0].options.signal instanceof AbortSignal);
        assert.match(logs.at(-1), /databaseaanvraag geslaagd/);
        result = () => new Response(JSON.stringify({ code: 'PGRST202', message: 'private upstream content' }), { status: 404 });
        assert.equal((await keepalive()).status, 503);
        assert.match(logs.at(-1), /databasefunctie ontbreekt/);
        result = () => new Response(JSON.stringify({ code: '42501', message: 'private upstream content' }), { status: 403 });
        assert.equal((await keepalive()).status, 503);
        result = () => { throw new DOMException('private upstream content', 'TimeoutError'); };
        assert.equal((await keepalive()).status, 503);
        result = () => new Response('2', { headers: { 'Content-Type': 'application/json' } });
        assert.equal((await keepalive()).status, 503, 'unexpected value must not be called a successful database ping');
        const count = calls.length;
        process.env.SUPABASE_PUBLISHABLE_KEY = 'sb_secret_forbidden-fixture';
        assert.equal((await keepalive()).status, 503);
        assert.equal(calls.length, count, 'privileged key must not be used');
        process.env.SUPABASE_PUBLISHABLE_KEY = 'header.' + Buffer.from(JSON.stringify({ role: 'service_role' })).toString('base64url') + '.signature';
        assert.equal((await keepalive()).status, 503);
        assert.equal(calls.length, count);
        process.env.SUPABASE_URL = '';
        assert.equal((await keepalive()).status, 503);
        assert.equal(calls.length, count);
        assert.ok(logs.length >= 8);
        assert.doesNotMatch(logs.join('\n'), /private upstream content|sb_publishable|sb_secret|service_role|signature/);
    } finally { global.fetch = savedFetch; console.log = savedLog; console.error = savedError; }
});

test('keepalive-SQL is herhaalbaar, draait als anon en behoudt gebruikersafscherming', async () => {
    const db = new PGlite();
    try {
        await db.exec(`create role anon; create role authenticated;
            create schema auth; create table auth.users(id uuid primary key);
            create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
            create function auth.jwt() returns jsonb language sql stable as $$ select '{}'::jsonb $$;
            grant usage on schema auth to authenticated;
            grant execute on function auth.uid(), auth.jwt() to authenticated;
            insert into auth.users values ('11111111-1111-4111-8111-111111111111');`);
        const root = path.resolve(__dirname, '..');
        await db.exec(fs.readFileSync(path.join(root, 'supabase/migrations/20261002131955_kweekkompas_user_snapshots.sql'), 'utf8'));
        await db.exec(`insert into public.kweekkompas_snapshots values ('11111111-1111-4111-8111-111111111111', '{"backupVersion":1,"seeds":[{"id":"test","naam":"Eigen testplant"}]}', 1, now());`);
        const policiesBefore = (await db.query(`select policyname, permissive, roles, cmd, qual, with_check from pg_policies where tablename='kweekkompas_snapshots' order by policyname`)).rows;
        const grantsBefore = (await db.query(`select grantee, privilege_type from information_schema.role_table_grants where table_name='kweekkompas_snapshots' order by grantee, privilege_type`)).rows;
        const sql = fs.readFileSync(path.join(root, 'supabase/keepalive.sql'), 'utf8');
        await db.exec(sql); await db.exec(sql);
        assert.deepEqual((await db.query(`select policyname, permissive, roles, cmd, qual, with_check from pg_policies where tablename='kweekkompas_snapshots' order by policyname`)).rows, policiesBefore);
        assert.deepEqual((await db.query(`select grantee, privilege_type from information_schema.role_table_grants where table_name='kweekkompas_snapshots' order by grantee, privilege_type`)).rows, grantsBefore);
        await db.exec('set role anon;');
        assert.equal((await db.query('select public.kweekkompas_keepalive() as result')).rows[0].result, 1);
        await assert.rejects(db.query('select * from public.kweekkompas_snapshots'), /permission denied/);
        await assert.rejects(db.query(`update public.kweekkompas_snapshots set revision=2`), /permission denied/);
        await db.exec('reset role; set role authenticated;');
        await assert.rejects(db.query('select public.kweekkompas_keepalive()'), /permission denied/);
        await db.exec('reset role;');
        assert.equal((await db.query('select revision, payload from public.kweekkompas_snapshots')).rows[0].revision, 1);
        const fn = (await db.query(`select prosecdef, provolatile, proconfig from pg_proc where oid='public.kweekkompas_keepalive()'::regprocedure`)).rows[0];
        assert.equal(fn.prosecdef, false);
        assert.equal(fn.provolatile, 's');
        assert.ok(fn.proconfig.some(value => value.startsWith('search_path=')));
    } finally { await db.close(); }
});
