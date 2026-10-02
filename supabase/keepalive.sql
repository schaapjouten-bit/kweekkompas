-- Only for KweekKompas project cmsthawjpxgyrmfwplfj.
-- Standalone, repeatable setup. Does not read or change garden data or RLS.
begin;

create or replace function public.kweekkompas_keepalive()
returns integer
language sql
stable
security invoker
set search_path = ''
as $$
    select 1;
$$;

revoke all on function public.kweekkompas_keepalive() from public, anon, authenticated;
grant execute on function public.kweekkompas_keepalive() to anon;

notify pgrst, 'reload schema';
commit;
