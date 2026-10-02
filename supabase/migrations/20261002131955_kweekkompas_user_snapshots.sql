-- Optional cloud copy. Never imports or deletes the existing local browser data.
-- Target project: cmsthawjpxgyrmfwplfj. Safe to rerun; stored rows are retained.
begin;
create table if not exists public.kweekkompas_snapshots (
    user_id uuid primary key references auth.users(id) on delete cascade,
    payload jsonb not null,
    revision bigint not null check (revision > 0),
    updated_at timestamptz not null default now(),
    constraint valid_backup check (
        jsonb_typeof(payload) = 'object'
        and payload ? 'backupVersion' and payload -> 'backupVersion' = '1'::jsonb
        and payload ? 'seeds' and jsonb_typeof(payload -> 'seeds') = 'array'
        and octet_length(payload::text) <= 4000000
    )
);
alter table public.kweekkompas_snapshots enable row level security;
revoke all on public.kweekkompas_snapshots from public, anon, authenticated;
grant usage on schema public to authenticated;
grant select, insert, update on public.kweekkompas_snapshots to authenticated;
drop policy if exists "read own garden" on public.kweekkompas_snapshots;
drop policy if exists "insert own garden" on public.kweekkompas_snapshots;
drop policy if exists "update own garden" on public.kweekkompas_snapshots;
drop policy if exists "enforce garden ownership" on public.kweekkompas_snapshots;
-- Restrictive ownership also protects against any pre-existing permissive policy.
create policy "enforce garden ownership" on public.kweekkompas_snapshots
    as restrictive for all to authenticated
    using ((select auth.uid()) = user_id and coalesce((select auth.jwt() ->> 'is_anonymous'), 'false') <> 'true')
    with check ((select auth.uid()) = user_id and coalesce((select auth.jwt() ->> 'is_anonymous'), 'false') <> 'true');
create policy "read own garden" on public.kweekkompas_snapshots
    for select to authenticated
    using ((select auth.uid()) = user_id and coalesce((select auth.jwt() ->> 'is_anonymous'), 'false') <> 'true');
create policy "insert own garden" on public.kweekkompas_snapshots
    for insert to authenticated
    with check ((select auth.uid()) = user_id and coalesce((select auth.jwt() ->> 'is_anonymous'), 'false') <> 'true');
create policy "update own garden" on public.kweekkompas_snapshots
    for update to authenticated
    using ((select auth.uid()) = user_id and coalesce((select auth.jwt() ->> 'is_anonymous'), 'false') <> 'true')
    with check ((select auth.uid()) = user_id and coalesce((select auth.jwt() ->> 'is_anonymous'), 'false') <> 'true');
notify pgrst, 'reload schema';
commit;
