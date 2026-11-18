-- SeekGRNJobs subscriptions. Run once in the EXISTING project's SQL Editor.
-- Does not change Auth accounts, credentials, admin memberships or existing packs.
begin;
create table if not exists public.subscription_orders (
 invoice_id text primary key,
 user_id uuid not null references auth.users(id) on delete cascade,
 plan text not null check(plan in ('monthly','biannual','annual')),
 amount numeric(12,2) not null check(amount>0),
 town text not null,
 app_prefix text not null default 'SEEKGRN',
 app_name text not null default 'SeekGRNJobs',
 currency text not null default 'NAD',
 status text not null default 'pending' check(status in ('pending','paid')),
 transaction_id text unique,
 created_at timestamptz not null default now(),
 paid_at timestamptz
);
alter table public.subscription_orders add column if not exists app_prefix text not null default 'SEEKGRN';
alter table public.subscription_orders add column if not exists app_name text not null default 'SeekGRNJobs';
alter table public.subscription_orders add column if not exists currency text not null default 'NAD';
create table if not exists public.subscription_terms (
 id uuid primary key default gen_random_uuid(),
 user_id uuid not null references auth.users(id) on delete cascade,
 invoice_id text not null unique references public.subscription_orders(invoice_id),
 plan text not null check(plan in ('monthly','biannual','annual')),
 starts_at timestamptz not null,
 ends_at timestamptz not null check(ends_at>starts_at)
);
create table if not exists public.form_preparations (
 user_id uuid not null references auth.users(id) on delete cascade,
 job_id text not null,
 source text not null check(source in ('free','subscription','admin','legacy')),
 term_id uuid references public.subscription_terms(id),
 created_at timestamptz not null default now(),
 primary key(user_id,job_id)
);
create index if not exists subscription_terms_user_idx on public.subscription_terms(user_id,starts_at,ends_at);
create index if not exists form_preparations_term_idx on public.form_preparations(term_id,created_at);
create index if not exists subscription_orders_user_idx on public.subscription_orders(user_id,created_at);
alter table public.subscription_orders enable row level security;
alter table public.subscription_terms enable row level security;
alter table public.form_preparations enable row level security;
revoke all on public.subscription_orders,public.subscription_terms,public.form_preparations from anon,authenticated;
grant select on public.subscription_orders,public.subscription_terms,public.form_preparations to authenticated;
drop policy if exists subscription_orders_owner on public.subscription_orders;
create policy subscription_orders_owner on public.subscription_orders for select to authenticated using(user_id=(select auth.uid()));
drop policy if exists subscription_terms_owner on public.subscription_terms;
create policy subscription_terms_owner on public.subscription_terms for select to authenticated using(user_id=(select auth.uid()));
drop policy if exists form_preparations_owner on public.form_preparations;
create policy form_preparations_owner on public.form_preparations for select to authenticated using(user_id=(select auth.uid()));

-- Grandfather existing saved packs. They remain accessible and do not use the new free pack.
insert into public.form_preparations(user_id,job_id,source)
 select a.user_id,b->>'jobId','legacy' from public.applicant_data a,
 lateral jsonb_array_elements(case when jsonb_typeof(a.value)='array' then a.value else '[]'::jsonb end) b
 where a.key='documents' and length(b->>'jobId') between 1 and 200
 on conflict do nothing;

-- Internal status calculator; callers cannot request another user's allowance.
create or replace function public.seekgrn_entitlement(p_user uuid) returns jsonb
 language plpgsql security definer set search_path=pg_catalog,public as $$
declare
 t public.subscription_terms%rowtype;
 next_term public.subscription_terms%rowtype;
 period_start timestamptz; period_end timestamptz;
 quota integer; used integer:=0; free_left integer; n integer;
begin
 if exists(select 1 from public.app_admins where user_id=p_user) then
  return jsonb_build_object('plan','admin','unlimited',true,'free_remaining',1,'used',0);
 end if;
 select case when exists(select 1 from public.form_preparations where user_id=p_user and source='free') then 0 else 1 end into free_left;
 select * into t from public.subscription_terms where user_id=p_user and starts_at<=now() and ends_at>now() order by starts_at desc limit 1;
 select * into next_term from public.subscription_terms where user_id=p_user and starts_at>now() order by starts_at limit 1;
 if t.id is null then
  return jsonb_build_object('plan','free','unlimited',false,'quota',0,'used',0,'remaining',0,'free_remaining',free_left,'upcoming_plan',next_term.plan,'upcoming_at',next_term.starts_at);
 end if;
 quota:=case t.plan when 'monthly' then 20 when 'biannual' then 30 else null end;
 period_start:=t.starts_at;
 for n in 1..12 loop
  period_end:=least(t.ends_at,t.starts_at+(n*interval '1 month'));
  exit when period_end>now();
  period_start:=period_end;
 end loop;
 select count(*)::integer into used from public.form_preparations where term_id=t.id and created_at>=period_start and created_at<period_end;
 return jsonb_build_object('plan',t.plan,'unlimited',quota is null,'quota',quota,'used',used,'remaining',case when quota is null then null else greatest(0,quota-used) end,'free_remaining',free_left,'renews_at',period_end,'ends_at',t.ends_at,'upcoming_plan',next_term.plan,'upcoming_at',next_term.starts_at);
end $$;
revoke all on function public.seekgrn_entitlement(uuid) from public,anon,authenticated;

create or replace function public.subscription_status() returns jsonb
 language plpgsql security definer set search_path=pg_catalog,public as $$
begin
 if auth.uid() is null then raise exception 'Sign in to view your subscription.'; end if;
 return public.seekgrn_entitlement(auth.uid());
end $$;
revoke all on function public.subscription_status() from public,anon;
grant execute on function public.subscription_status() to authenticated;

create or replace function public.create_subscription_order(p_plan text,p_town text) returns jsonb
 language plpgsql security definer set search_path=pg_catalog,public as $$
declare u uuid:=auth.uid(); o public.subscription_orders%rowtype; price numeric; attempt integer;
begin
 if u is null then raise exception 'Sign in to subscribe.'; end if;
 if exists(select 1 from public.app_admins where user_id=u) then raise exception 'Administrators have free unlimited access.'; end if;
 if not exists(select 1 from auth.users where id=u and email_confirmed_at is not null and phone_confirmed_at is not null) then raise exception 'Verify your email and mobile before subscribing.'; end if;
 price:=case p_plan when 'monthly' then 50 when 'biannual' then 240 when 'annual' then 360 else null end;
 if price is null or p_town is null or length(trim(p_town)) not between 1 and 100 then raise exception 'Choose a valid package and town.'; end if;
 perform pg_advisory_xact_lock(hashtextextended(u::text,0));
 select * into o from public.subscription_orders where user_id=u and plan=p_plan and status='pending' and app_prefix='SEEKGRN' and currency='NAD' order by created_at desc limit 1;
 if o.invoice_id is null then
  -- Seven random hexadecimal characters; the PK and retry loop guarantee uniqueness.
  for attempt in 1..10 loop
   insert into public.subscription_orders(invoice_id,user_id,plan,amount,town,app_prefix,app_name,currency)
    values('SEEKGRN-'||upper(substr(replace(gen_random_uuid()::text,'-',''),1,7)),u,p_plan,price,trim(p_town),'SEEKGRN','SeekGRNJobs','NAD')
    on conflict(invoice_id) do nothing returning * into o;
   exit when found;
  end loop;
  if o.invoice_id is null then raise exception 'Unable to reserve a payment reference. Please retry.'; end if;
 end if;
 return jsonb_build_object('invoice_id',o.invoice_id,'plan',o.plan,'amount',o.amount,'town',o.town,'status',o.status,'app_prefix',o.app_prefix,'app_name',o.app_name,'currency',o.currency);
end $$;
revoke all on function public.create_subscription_order(text,text) from public,anon;
grant execute on function public.create_subscription_order(text,text) to authenticated;

-- Only the signed server webhook may call this service-role-only function.
drop function if exists public.apply_subscription_payment(text,text,numeric);
create or replace function public.apply_subscription_payment(p_invoice text,p_transaction text,p_amount numeric,p_currency text) returns jsonb
 language plpgsql security definer set search_path=pg_catalog,public as $$
declare o public.subscription_orders%rowtype; starts timestamptz; months integer;
begin
 select * into o from public.subscription_orders where invoice_id=p_invoice;
 if o.invoice_id is null then raise exception 'Unknown invoice.'; end if;
 perform pg_advisory_xact_lock(hashtextextended(o.user_id::text,0));
 select * into o from public.subscription_orders where invoice_id=p_invoice for update;
 if o.app_prefix<>'SEEKGRN' or p_currency is distinct from o.currency or p_amount is distinct from o.amount or p_transaction is null or length(p_transaction) not between 1 and 150 then raise exception 'Payment details do not match.'; end if;
 if o.status='paid' then
  if o.transaction_id<>p_transaction then raise exception 'Invoice already paid by another transaction.'; end if;
  return jsonb_build_object('replayed',true);
 end if;
 if exists(select 1 from public.subscription_orders where transaction_id=p_transaction) then raise exception 'Transaction already applied.'; end if;
 select greatest(now(),coalesce(max(ends_at),now())) into starts from public.subscription_terms where user_id=o.user_id;
 months:=case o.plan when 'monthly' then 1 when 'biannual' then 6 else 12 end;
 insert into public.subscription_terms(user_id,invoice_id,plan,starts_at,ends_at) values(o.user_id,o.invoice_id,o.plan,starts,starts+(months*interval '1 month'));
 update public.subscription_orders set status='paid',paid_at=now(),transaction_id=p_transaction where invoice_id=p_invoice;
 return jsonb_build_object('replayed',false,'starts_at',starts);
end $$;
revoke all on function public.apply_subscription_payment(text,text,numeric,text) from public,anon,authenticated;
grant execute on function public.apply_subscription_payment(text,text,numeric,text) to service_role;

-- Atomic allowance charge + pack save. Failures roll back BOTH operations.
create or replace function public.save_prepared_pack(p_bundle jsonb) returns jsonb
 language plpgsql security definer set search_path=pg_catalog,public as $$
declare u uuid:=auth.uid(); entitlement jsonb; job text:=p_bundle->>'jobId';
 source_name text; active_term uuid; packs jsonb;
begin
 if u is null then raise exception 'Sign in to prepare forms.'; end if;
 if jsonb_typeof(p_bundle)<>'object' or job is null or length(job) not between 1 and 200 or jsonb_typeof(p_bundle->'files') is distinct from 'array' or jsonb_array_length(p_bundle->'files') not between 2 and 3 then raise exception 'Invalid application pack.'; end if;
 if not exists(select 1 from public.app_admins where user_id=u) and not exists(select 1 from auth.users where id=u and email_confirmed_at is not null and phone_confirmed_at is not null) then raise exception 'Verify your email and mobile before preparing forms.'; end if;
 perform pg_advisory_xact_lock(hashtextextended(u::text,0));
 if not exists(select 1 from public.form_preparations where user_id=u and job_id=job) then
  entitlement:=public.seekgrn_entitlement(u);
  if entitlement->>'plan'='admin' then source_name:='admin';
  elsif (entitlement->>'unlimited')::boolean or coalesce((entitlement->>'remaining')::integer,0)>0 then
   source_name:='subscription';
   select id into active_term from public.subscription_terms where user_id=u and starts_at<=now() and ends_at>now() order by starts_at desc limit 1;
  elsif (entitlement->>'free_remaining')::integer>0 then source_name:='free';
  else raise exception 'FORM_ALLOWANCE: Your preparation allowance is used. Choose a subscription or wait for your monthly reset.';
  end if;
  insert into public.form_preparations(user_id,job_id,source,term_id) values(u,job,source_name,active_term);
 end if;
 select value into packs from public.applicant_data where user_id=u and key='documents' for update;
 select coalesce(jsonb_agg(item),'[]'::jsonb) into packs from jsonb_array_elements(coalesce(packs,'[]'::jsonb)) item where item->>'jobId'<>job;
 packs:=jsonb_build_array(p_bundle)||packs;
 insert into public.applicant_data(user_id,key,value,updated_at) values(u,'documents',packs,now())
 on conflict(user_id,key) do update set value=excluded.value,updated_at=excluded.updated_at;
 return jsonb_build_object('documents',packs,'subscription',public.seekgrn_entitlement(u));
end $$;
revoke all on function public.save_prepared_pack(jsonb) from public,anon;
grant execute on function public.save_prepared_pack(jsonb) to authenticated;

-- Existing document edits/removal cannot bypass quotas or restore the free allowance.
create or replace function public.check_prepared_documents() returns trigger
 language plpgsql security definer set search_path=pg_catalog,public as $$
declare bundle jsonb;
begin
 if new.key='documents' then
  if jsonb_typeof(new.value) is distinct from 'array' then raise exception 'Invalid document list.'; end if;
  for bundle in select * from jsonb_array_elements(new.value) loop
   if not exists(select 1 from public.form_preparations where user_id=new.user_id and job_id=bundle->>'jobId') then raise exception 'Use Prepare forms to create a new application pack.'; end if;
  end loop;
 end if;
 return new;
end $$;
revoke all on function public.check_prepared_documents() from public,anon,authenticated;
drop trigger if exists check_prepared_documents on public.applicant_data;
create trigger check_prepared_documents before insert or update on public.applicant_data for each row execute function public.check_prepared_documents();
commit;
select 'Subscription setup complete. Existing accounts and packs preserved.' as result;

notify pgrst, 'reload schema';
