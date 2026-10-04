-- Run in Supabase SQL Editor with permission to manage Storage policies.
-- Repeatable; no file deletion. Supabase manages storage.objects and its RLS:
-- do not ALTER this table, change its owner or toggle its security settings.
-- If policy DDL is denied, configure through Storage > Policies as documented
-- in docs/SUPABASE_STORAGE_SQL_HERSTEL.md. Do not bypass ownership checks.
begin;
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('kweekkompas-photos', 'kweekkompas-photos', false, 1000000,
        array['image/png','image/jpeg','image/webp','image/gif','image/avif'])
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists kweek_photos_read on storage.objects;
create policy kweek_photos_read on storage.objects for select to authenticated
using (bucket_id = 'kweekkompas-photos' and split_part(name, '/', 1) = (select auth.uid())::text);
drop policy if exists kweek_photos_insert on storage.objects;
create policy kweek_photos_insert on storage.objects for insert to authenticated
with check (bucket_id = 'kweekkompas-photos' and split_part(name, '/', 1) = (select auth.uid())::text);
drop policy if exists kweek_photos_update on storage.objects;
create policy kweek_photos_update on storage.objects for update to authenticated
using (bucket_id = 'kweekkompas-photos' and split_part(name, '/', 1) = (select auth.uid())::text)
with check (bucket_id = 'kweekkompas-photos' and split_part(name, '/', 1) = (select auth.uid())::text);
drop policy if exists kweek_photos_delete on storage.objects;
create policy kweek_photos_delete on storage.objects for delete to authenticated
using (bucket_id = 'kweekkompas-photos' and split_part(name, '/', 1) = (select auth.uid())::text);

-- Restrictive guard also protects this bucket if an older permissive policy
-- grants authenticated/anonymous users access to every bucket. Other buckets
-- retain their existing policies. Both old and new rows are checked on UPDATE.
drop policy if exists kweek_photos_owner_guard on storage.objects;
create policy kweek_photos_owner_guard on storage.objects as restrictive for all to authenticated
using (bucket_id <> 'kweekkompas-photos' or (split_part(name, '/', 1) = (select auth.uid())::text and not coalesce(((select auth.jwt())->>'is_anonymous')::boolean, false)))
with check (bucket_id <> 'kweekkompas-photos' or (split_part(name, '/', 1) = (select auth.uid())::text and not coalesce(((select auth.jwt())->>'is_anonymous')::boolean, false)));
drop policy if exists kweek_photos_anon_guard on storage.objects;
create policy kweek_photos_anon_guard on storage.objects as restrictive for all to anon
using (bucket_id <> 'kweekkompas-photos')
with check (bucket_id <> 'kweekkompas-photos');
commit;
