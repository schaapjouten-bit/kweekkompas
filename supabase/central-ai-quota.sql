-- Local migration draft; create an official CLI migration before deployment.
begin;
create schema if not exists kweekkompas_private;
create table if not exists kweekkompas_private.ai_budget_config (id boolean primary key default true check (id), monthly_limit integer not null default 500 check (monthly_limit between 0 and 1000000));
insert into kweekkompas_private.ai_budget_config (id) values (true) on conflict do nothing;
create table if not exists kweekkompas_private.ai_budget_overrides (user_id uuid primary key references auth.users(id) on delete cascade, monthly_limit integer not null check (monthly_limit between 0 and 1000000));
create table if not exists kweekkompas_private.ai_monthly_usage (user_id uuid references auth.users(id) on delete cascade, month date not null, requests integer not null default 0 check (requests >= 0), input_tokens bigint not null default 0, output_tokens bigint not null default 0, primary key(user_id, month));
create table if not exists kweekkompas_private.ai_requests (user_id uuid references auth.users(id) on delete cascade, request_id uuid not null, month date not null, state text not null check (state in ('reserved','success','rejected','unknown')), primary key(user_id, request_id));
alter table kweekkompas_private.ai_budget_config enable row level security;
alter table kweekkompas_private.ai_budget_overrides enable row level security;
alter table kweekkompas_private.ai_monthly_usage enable row level security;
alter table kweekkompas_private.ai_requests enable row level security;
revoke all on kweekkompas_private.ai_budget_config, kweekkompas_private.ai_budget_overrides, kweekkompas_private.ai_monthly_usage, kweekkompas_private.ai_requests from public, anon, authenticated;

create or replace function kweekkompas_private.ai_budget(p_action text, p_user uuid default null, p_request uuid default null, p_limit integer default null, p_input integer default null, p_output integer default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
    current_month date := date_trunc('month', statement_timestamp() at time zone 'Europe/Amsterdam')::date;
    default_limit integer; effective_limit integer; used integer; request_month date; request_state text; result jsonb;
begin
    select monthly_limit into default_limit from kweekkompas_private.ai_budget_config where id = true;
    if p_action in ('set-default','set-limit') and (p_limit is null or p_limit < 0 or p_limit > 1000000) then raise exception 'invalid limit'; end if;
    if p_action = 'set-default' then
        update kweekkompas_private.ai_budget_config set monthly_limit = p_limit where id = true;
        return jsonb_build_object('ok',true);
    elsif p_action = 'set-limit' then
        if not exists(select 1 from auth.users where id = p_user and coalesce(raw_app_meta_data->>'kweek_role','user') <> 'admin') then raise exception 'invalid user'; end if;
        insert into kweekkompas_private.ai_budget_overrides values(p_user,p_limit) on conflict(user_id) do update set monthly_limit = excluded.monthly_limit;
        return jsonb_build_object('ok',true);
    elsif p_action = 'clear-limit' then
        delete from kweekkompas_private.ai_budget_overrides where user_id = p_user;
        return jsonb_build_object('ok',true);
    elsif p_action = 'admin-list' then
        select jsonb_build_object('defaultLimit',default_limit,'month',current_month,'users',coalesce(jsonb_agg(jsonb_build_object('id',u.id,'email',u.email,'name',coalesce(u.raw_user_meta_data->>'name',''),'active',u.banned_until is null or u.banned_until <= statement_timestamp(),'limit',coalesce(o.monthly_limit,default_limit),'override',o.monthly_limit,'used',coalesce(m.requests,0),'remaining',greatest(0,coalesce(o.monthly_limit,default_limit)-coalesce(m.requests,0)),'inputTokens',coalesce(m.input_tokens,0),'outputTokens',coalesce(m.output_tokens,0)) order by u.email),'[]'::jsonb),'totalRequests',coalesce(sum(m.requests),0),'totalInputTokens',coalesce(sum(m.input_tokens),0),'totalOutputTokens',coalesce(sum(m.output_tokens),0)) into result
        from auth.users u left join kweekkompas_private.ai_budget_overrides o on o.user_id=u.id left join kweekkompas_private.ai_monthly_usage m on m.user_id=u.id and m.month=current_month
        where coalesce(u.raw_app_meta_data->>'kweek_role','user') <> 'admin' and coalesce(u.is_anonymous,false) = false;
        return result;
    end if;
    if p_user is null then raise exception 'missing user'; end if;
    if p_action in ('status','reserve') then
        select coalesce((select monthly_limit from kweekkompas_private.ai_budget_overrides where user_id=p_user),default_limit) into effective_limit;
        if p_action = 'status' then
            select coalesce((select requests from kweekkompas_private.ai_monthly_usage where user_id=p_user and month=current_month),0) into used;
            return jsonb_build_object('limit',effective_limit,'used',used,'remaining',greatest(0,effective_limit-used),'month',current_month);
        end if;
        if p_request is null then raise exception 'missing request'; end if;
        insert into kweekkompas_private.ai_monthly_usage (user_id,month) values(p_user,current_month) on conflict do nothing;
        select requests into used from kweekkompas_private.ai_monthly_usage where user_id=p_user and month=current_month for update;
        if exists(select 1 from kweekkompas_private.ai_requests where user_id=p_user and request_id=p_request) then return jsonb_build_object('result','duplicate'); end if;
        if used >= effective_limit then return jsonb_build_object('result','limit'); end if;
        insert into kweekkompas_private.ai_requests values(p_user,p_request,current_month,'reserved');
        update kweekkompas_private.ai_monthly_usage set requests=requests+1 where user_id=p_user and month=current_month;
        return jsonb_build_object('result','reserved');
    elsif p_action in ('success','reject','unknown') then
        select month,state into request_month,request_state from kweekkompas_private.ai_requests where user_id=p_user and request_id=p_request for update;
        if not found then raise exception 'unknown request'; end if;
        if request_state <> 'reserved' then return jsonb_build_object('ok',true); end if;
        update kweekkompas_private.ai_requests set state=case p_action when 'success' then 'success' when 'reject' then 'rejected' else 'unknown' end where user_id=p_user and request_id=p_request;
        update kweekkompas_private.ai_monthly_usage set requests=requests-case when p_action='reject' then 1 else 0 end, input_tokens=input_tokens+case when p_action='success' then greatest(coalesce(p_input,0),0) else 0 end, output_tokens=output_tokens+case when p_action='success' then greatest(coalesce(p_output,0),0) else 0 end where user_id=p_user and month=request_month;
        return jsonb_build_object('ok',true);
    end if;
    raise exception 'invalid action';
end $$;
create or replace function public.kweek_ai_budget(p_action text, p_user uuid default null, p_request uuid default null, p_limit integer default null, p_input integer default null, p_output integer default null)
returns jsonb language sql security invoker set search_path = '' as $$ select kweekkompas_private.ai_budget(p_action,p_user,p_request,p_limit,p_input,p_output) $$;
revoke all on function kweekkompas_private.ai_budget(text,uuid,uuid,integer,integer,integer) from public, anon, authenticated;
revoke all on function public.kweek_ai_budget(text,uuid,uuid,integer,integer,integer) from public, anon, authenticated;
grant usage on schema kweekkompas_private to service_role;
grant execute on function kweekkompas_private.ai_budget(text,uuid,uuid,integer,integer,integer) to service_role;
grant execute on function public.kweek_ai_budget(text,uuid,uuid,integer,integer,integer) to service_role;
notify pgrst, 'reload schema';
commit;
