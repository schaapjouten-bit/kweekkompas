const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { PGlite } = require('@electric-sql/pglite');
test('PostgreSQL RLS isoleert twee accounts, blokkeert anon en eigenaarwijzigingen', async () => {
    const db = new PGlite();
    const a = '11111111-1111-4111-8111-111111111111';
    const b = '22222222-2222-4222-8222-222222222222';
    try {
        await db.exec(`create role anon; create role authenticated;
            create schema auth;
            create table auth.users(id uuid primary key);
            insert into auth.users values ('${a}'), ('${b}');
            create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
            create function auth.jwt() returns jsonb language sql stable as $$ select coalesce(nullif(current_setting('request.jwt.claims', true), ''), '{}')::jsonb $$;
            grant usage on schema auth to authenticated;
            grant execute on function auth.uid(), auth.jwt() to authenticated;`);
        const migrationDir = path.join(__dirname, '..', 'supabase', 'migrations');
        const file = fs.readdirSync(migrationDir).find(name => name.endsWith('_kweekkompas_user_snapshots.sql'));
        const sql = fs.readFileSync(path.join(migrationDir, file), 'utf8');
        await db.exec(sql);
        const asUser = async id => db.exec(`reset role; set role authenticated; set request.jwt.claim.sub = '${id}'; set request.jwt.claims = '{}';`);
        await asUser(a);
        await db.query(`insert into public.kweekkompas_snapshots(user_id, payload, revision) values ($1, $2, 1)`, [a, { backupVersion: 1, seeds: [{ id: 'a', naam: 'Tomaat' }] }]);
        assert.equal((await db.query('select * from public.kweekkompas_snapshots')).rows.length, 1);
        // Reapplying the exact SQL must preserve data and permissions.
        await db.exec('reset role;');
        await db.exec(sql);
        assert.equal((await db.query('select payload from public.kweekkompas_snapshots')).rows[0].payload.seeds[0].naam, 'Tomaat');
        // Even a stray permissive policy cannot grant access to another garden.
        await db.exec(`create policy "legacy broad access" on public.kweekkompas_snapshots for all to authenticated using (true) with check (true);`);
        await asUser(b);
        assert.equal((await db.query('select * from public.kweekkompas_snapshots')).rows.length, 0);
        assert.equal((await db.query(`update public.kweekkompas_snapshots set revision=2 where user_id=$1 returning *`, [a])).rows.length, 0);
        await assert.rejects(db.query(`insert into public.kweekkompas_snapshots values ($1, $2, 1, now())`, [a, { backupVersion: 1, seeds: [] }]), /row-level security/);
        await db.query(`insert into public.kweekkompas_snapshots values ($1, $2, 1, now())`, [b, { backupVersion: 1, seeds: [] }]);
        await assert.rejects(db.query('update public.kweekkompas_snapshots set user_id=$1 where user_id=$2', [a, b]), /row-level security/);
        assert.equal((await db.query('update public.kweekkompas_snapshots set revision=2 where user_id=$1 and revision=1 returning revision', [b])).rows[0].revision, 2);
        assert.equal((await db.query('update public.kweekkompas_snapshots set revision=3 where user_id=$1 and revision=1 returning revision', [b])).rows.length, 0);
        await assert.rejects(db.query(`delete from public.kweekkompas_snapshots where user_id=$1`, [b]), /permission denied/);
        await db.exec(`set request.jwt.claims = '{"is_anonymous":true}';`);
        assert.equal((await db.query('select * from public.kweekkompas_snapshots')).rows.length, 0);
        assert.equal((await db.query('update public.kweekkompas_snapshots set revision=3 returning revision')).rows.length, 0);
        await assert.rejects(db.query(`insert into public.kweekkompas_snapshots values ($1, $2, 1, now())`, [b, { backupVersion: 1, seeds: [] }]), /row-level security/);
        await db.exec('reset role; set role anon;');
        await assert.rejects(db.query('select * from public.kweekkompas_snapshots'), /permission denied/);
        await db.exec('reset role;');
        const policies = await db.query(`select cmd, roles, qual, with_check from pg_policies where tablename='kweekkompas_snapshots'`);
        assert.equal(policies.rows.length, 5);
        const fence = await db.query(`select permissive from pg_policies where tablename='kweekkompas_snapshots' and policyname='enforce garden ownership'`);
        assert.equal(fence.rows[0].permissive, 'RESTRICTIVE');
    } finally { await db.close(); }
});
