-- Draft only: create an official migration with the Supabase CLI before deployment.
begin;
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('kweekkompas-ai-config', 'kweekkompas-ai-config', false, 32768, array['application/json'])
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;
drop policy if exists kweek_ai_config_no_client_access on storage.objects;
create policy kweek_ai_config_no_client_access on storage.objects as restrictive for all to anon, authenticated
using (bucket_id <> 'kweekkompas-ai-config') with check (bucket_id <> 'kweekkompas-ai-config');
commit;
