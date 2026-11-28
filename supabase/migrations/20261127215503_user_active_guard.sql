begin;
create schema if not exists kweekkompas_private;
create or replace function kweekkompas_private.is_active_account()
returns boolean language sql stable security definer set search_path = '' as $$
    select exists(
        select 1 from auth.users u
        where u.id = (select auth.uid())
          and not coalesce(u.is_anonymous, false)
          and (u.banned_until is null or u.banned_until <= statement_timestamp())
          and (
              nullif(u.raw_app_meta_data->>'kweek_session_not_before', '') is null
              or coalesce(((select auth.jwt())->>'iat')::bigint, 0) >= (u.raw_app_meta_data->>'kweek_session_not_before')::bigint
          )
    );
$$;
revoke all on function kweekkompas_private.is_active_account() from public, anon, authenticated;
grant usage on schema kweekkompas_private to authenticated;
grant execute on function kweekkompas_private.is_active_account() to authenticated;

create or replace function kweekkompas_private.revoke_user_sessions(p_user uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
begin
    if p_user is null then raise exception 'missing user'; end if;
    delete from auth.refresh_tokens where user_id = p_user::text;
    delete from auth.sessions where user_id = p_user;
    return jsonb_build_object('ok', true);
end $$;
create or replace function public.kweek_revoke_user_sessions(p_user uuid)
returns jsonb language sql security invoker set search_path = '' as $$
    select kweekkompas_private.revoke_user_sessions(p_user)
$$;
revoke all on function kweekkompas_private.revoke_user_sessions(uuid) from public, anon, authenticated;
revoke all on function public.kweek_revoke_user_sessions(uuid) from public, anon, authenticated;
grant usage on schema kweekkompas_private to service_role;
grant execute on function kweekkompas_private.revoke_user_sessions(uuid) to service_role;
grant execute on function public.kweek_revoke_user_sessions(uuid) to service_role;

drop policy if exists "active garden owner" on public.kweekkompas_snapshots;
create policy "active garden owner" on public.kweekkompas_snapshots as restrictive for all to authenticated
using ((select kweekkompas_private.is_active_account())) with check ((select kweekkompas_private.is_active_account()));
drop policy if exists kweek_photos_active_guard on storage.objects;
create policy kweek_photos_active_guard on storage.objects as restrictive for all to authenticated
using (bucket_id <> 'kweekkompas-photos' or (select kweekkompas_private.is_active_account()))
with check (bucket_id <> 'kweekkompas-photos' or (select kweekkompas_private.is_active_account()));
notify pgrst, 'reload schema';
commit;
