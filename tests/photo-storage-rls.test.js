const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { PGlite } = require('@electric-sql/pglite');
test('exacte herhaalbare Storage-SQL: twee gebruikers, anon, lezen/schrijven/verplaatsen/verwijderen', async () => {
    const db = new PGlite(), a = '11111111-1111-4111-8111-111111111111', b = '22222222-2222-4222-8222-222222222222';
    try {
        await db.exec(`create role authenticated; create role anon; create schema auth; create schema storage;
            create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
            create function auth.jwt() returns jsonb language sql stable as $$ select coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb $$;
            create table storage.buckets(id text primary key, name text, public boolean, file_size_limit bigint, allowed_mime_types text[]);
            create table storage.objects(id serial primary key, bucket_id text, name text);
            -- Mirror the managed Supabase table: RLS exists before app SQL.
            alter table storage.objects enable row level security;
            grant usage on schema auth, storage to authenticated, anon;
            grant execute on function auth.uid(), auth.jwt() to authenticated, anon;
            grant all on storage.objects to authenticated, anon; grant usage on sequence storage.objects_id_seq to authenticated, anon;`);
        const sql = fs.readFileSync('supabase/migrations/20261003093611_kweekkompas_private_photos.sql', 'utf8');
        const statements = sql.replace(/--[^\n]*/g, '');
        assert.doesNotMatch(statements, /alter\s+table\s+storage\.objects|owner\s+to|disable\s+row\s+level\s+security|set\s+role/i);
        await db.exec(sql);
        const asUser = id => db.exec(`reset role; set role authenticated; set request.jwt.claim.sub='${id}'; set request.jwt.claims='{}';`);
        const insert = name => db.query(`insert into storage.objects(bucket_id,name) values ('kweekkompas-photos',$1)`, [name]);
        await asUser(a); await insert(a + '/photo.png');
        await db.exec('reset role'); await db.exec(sql);
        const limitSQL = fs.readFileSync('supabase/migrations/20261003095425_kweekkompas_photo_limit_1mb.sql', 'utf8');
        assert.doesNotMatch(limitSQL.replace(/--[^\n]*/g, ''), /storage\.objects|owner\s+to|disable\s+row\s+level\s+security/i);
        await db.exec("update storage.buckets set file_size_limit=10000000 where id='kweekkompas-photos'");
        await db.exec(limitSQL); await db.exec(limitSQL);
        assert.equal(Number((await db.query('select file_size_limit from storage.buckets')).rows[0].file_size_limit), 1_000_000);
        assert.equal((await db.query('select * from storage.objects')).rows.length, 1);
        assert.equal((await db.query('select public from storage.buckets')).rows[0].public, false);
        await db.exec(`create policy legacy_broad_access on storage.objects for all to authenticated, anon using(true) with check(true);`);
        await asUser(b);
        assert.equal((await db.query('select * from storage.objects')).rows.length, 0);
        assert.equal((await db.query('update storage.objects set name=$1 returning *', [b + '/stolen.png'])).rows.length, 0);
        assert.equal((await db.query('delete from storage.objects returning *')).rows.length, 0);
        await assert.rejects(insert(a + '/injected.png'), /row-level security/);
        await insert(b + '/photo.png');
        await assert.rejects(db.query('update storage.objects set name=$1', [a + '/photo.png']), /row-level security/);
        assert.equal((await db.query('update storage.objects set name=$1 returning *', [b + '/renamed.png'])).rows.length, 1);
        assert.equal((await db.query('delete from storage.objects returning *')).rows.length, 1);
        await asUser(a); assert.equal((await db.query('select * from storage.objects')).rows.length, 1);
        await db.exec(`set request.jwt.claims='{"is_anonymous":true}';`);
        assert.equal((await db.query('select * from storage.objects')).rows.length, 0);
        await assert.rejects(insert(a + '/anon.png'), /row-level security/);
        await db.exec('reset role; set role anon;');
        assert.equal((await db.query('select * from storage.objects')).rows.length, 0);
        await assert.rejects(insert(a + '/anon.png'), /row-level security/);
        // UI fallback: no restrictive guards, owner checks in every own policy,
        // and old broad policies explicitly exclude this bucket.
        await db.exec(`reset role;
            drop policy kweek_photos_owner_guard on storage.objects;
            drop policy kweek_photos_anon_guard on storage.objects;
            alter policy legacy_broad_access on storage.objects
                using(bucket_id <> 'kweekkompas-photos') with check(bucket_id <> 'kweekkompas-photos');`);
        const own = `bucket_id='kweekkompas-photos' and split_part(name,'/',1)=(select auth.uid())::text
            and not coalesce(((select auth.jwt())->>'is_anonymous')::boolean,false)`;
        await db.exec(`alter policy kweek_photos_read on storage.objects using(${own});
            alter policy kweek_photos_insert on storage.objects with check(${own});
            alter policy kweek_photos_update on storage.objects using(${own}) with check(${own});
            alter policy kweek_photos_delete on storage.objects using(${own});`);
        await asUser(b);
        assert.equal((await db.query('select * from storage.objects')).rows.length, 0);
        await assert.rejects(insert(a + '/foreign-ui.png'), /row-level security/);
        await insert(b + '/own-ui.png');
        await assert.rejects(db.query('update storage.objects set name=$1', [a + '/foreign-ui.png']), /row-level security/);
        assert.equal((await db.query('delete from storage.objects returning *')).rows.length, 1);
        await asUser(a);
        assert.equal((await db.query('select * from storage.objects')).rows.length, 1);
        await db.exec(`set request.jwt.claims='{"is_anonymous":true}';`);
        assert.equal((await db.query('select * from storage.objects')).rows.length, 0);
        await assert.rejects(insert(a + '/anon-ui.png'), /row-level security/);
        await db.exec('reset role; set role anon;');
        assert.equal((await db.query('select * from storage.objects')).rows.length, 0);
        await assert.rejects(insert(a + '/anon-ui.png'), /row-level security/);
    } finally { await db.close(); }
});
