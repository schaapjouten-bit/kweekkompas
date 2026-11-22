create schema if not exists kweekkompas_private;

create table if not exists kweekkompas_private.gemini_free_quota (
    account_id uuid primary key references auth.users(id) on delete cascade,
    utc_day date not null,
    request_count integer not null check (request_count between 1 and 20)
);

alter table kweekkompas_private.gemini_free_quota enable row level security;
revoke all on schema kweekkompas_private from public, anon, authenticated;
revoke all on kweekkompas_private.gemini_free_quota from public, anon, authenticated;

create or replace function kweekkompas_private.reserve_gemini_free_request()
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
    account uuid := auth.uid();
    today date := (statement_timestamp() at time zone 'UTC')::date;
    reserved boolean;
begin
    if account is null or coalesce((auth.jwt() ->> 'is_anonymous') = 'true', false) then
        raise insufficient_privilege;
    end if;

    insert into kweekkompas_private.gemini_free_quota as quota (account_id, utc_day, request_count)
    values (account, today, 1)
    on conflict (account_id) do update
    set utc_day = excluded.utc_day,
        request_count = case when quota.utc_day < excluded.utc_day then 1 else quota.request_count + 1 end
    where quota.utc_day < excluded.utc_day
       or (quota.utc_day = excluded.utc_day and quota.request_count < 20)
    returning true into reserved;

    return coalesce(reserved, false);
end;
$$;

create or replace function public.reserve_gemini_free_request()
returns boolean
language sql
security invoker
set search_path = ''
as $$
    select kweekkompas_private.reserve_gemini_free_request();
$$;

revoke all on function kweekkompas_private.reserve_gemini_free_request() from public, anon, authenticated;
revoke all on function public.reserve_gemini_free_request() from public, anon, authenticated;
grant usage on schema kweekkompas_private to authenticated;
grant execute on function kweekkompas_private.reserve_gemini_free_request() to authenticated;
grant execute on function public.reserve_gemini_free_request() to authenticated;
