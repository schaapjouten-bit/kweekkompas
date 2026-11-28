const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const { PGlite } = require('@electric-sql/pglite');

test('monthly limits, duplicate reservations, rejected requests and token totals', async () => {
    const db = new PGlite();
    const a = '11111111-1111-4111-8111-111111111111', b = '22222222-2222-4222-8222-222222222222', admin = '33333333-3333-4333-8333-333333333333';
    try {
        await db.exec(`create role anon; create role authenticated; create role service_role; create schema auth; create table auth.users(id uuid primary key,email text,raw_app_meta_data jsonb,raw_user_meta_data jsonb,banned_until timestamptz,is_anonymous boolean default false);`);
        await db.query("insert into auth.users(id,email,raw_app_meta_data) values ($1,'a@example.test','{}'),($2,'b@example.test','{}'),($3,'admin@example.test','{\"kweek_role\":\"admin\"}')", [a,b,admin]);
        const sql = fs.readFileSync(path.join(__dirname, '../supabase/central-ai-quota.sql'), 'utf8').replace("statement_timestamp() at time zone 'Europe/Amsterdam'", "current_setting('test.now')::timestamptz at time zone 'Europe/Amsterdam'");
        await db.exec(sql);
        await db.exec("set test.now = '2026-11-30T22:59:00Z'");
        const call = async (action, user = null, request = null, limit = null, input = null, output = null) => (await db.query('select public.kweek_ai_budget($1,$2,$3,$4,$5,$6) value', [action,user,request,limit,input,output])).rows[0].value;
        assert.equal((await call('status', a)).limit, 500);
        await call('set-default', null, null, 2);
        await call('set-limit', b, null, 1);
        const id1 = randomUUID(), id2 = randomUUID(), id3 = randomUUID();
        const simultaneous = await Promise.all([call('reserve',a,id1),call('reserve',a,id2),call('reserve',a,id3)]);
        assert.equal(simultaneous.filter(v => v.result === 'reserved').length, 2);
        assert.equal(simultaneous.filter(v => v.result === 'limit').length, 1);
        assert.equal((await call('reserve',a,id1)).result, 'duplicate');
        await call('success', a, id1, null, 15, 7);
        await call('success', a, id1, null, 15, 7);
        await call('reject', a, id2);
        assert.equal((await call('status',a)).remaining, 1);
        assert.equal((await call('reserve',a,id3)).result, 'reserved');
        const b1 = randomUUID(); assert.equal((await call('reserve',b,b1)).result, 'reserved');
        assert.equal((await call('reserve',b,randomUUID())).result, 'limit');
        const report = await call('admin-list');
        assert.equal(report.totalRequests,3); assert.equal(report.totalInputTokens,15); assert.equal(report.totalOutputTokens,7); assert.equal(report.users.length,2);
        await db.query("update auth.users set raw_user_meta_data = '{\"name\":\"Testnaam\"}', banned_until = now() + interval '1 year' where id = $1", [b]);
        const blocked = (await call('admin-list')).users.find(user => user.id === b);
        assert.equal(blocked.name, 'Testnaam'); assert.equal(blocked.active, false);
        await db.exec('set role authenticated');
        await assert.rejects(call('admin-list'), /permission denied/);
        await db.exec('reset role');
        await db.exec("set test.now = '2026-11-30T23:01:00Z'");
        assert.equal((await call('status',a)).remaining,2);
        assert.equal((await call('status',b)).remaining,1);
        assert.equal((await call('reserve',a,id1)).result,'duplicate');
        await call('clear-limit',b); assert.equal((await call('status',b)).limit,2);
    } finally { await db.close(); }
});
