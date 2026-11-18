-- Run after scripts/subscriptions.sql if subscriptions already exist.
-- Preserves all existing invoices, accounts, payments and subscription terms.
begin;
alter table public.subscription_orders add column if not exists app_prefix text not null default 'SEEKGRN';
alter table public.subscription_orders add column if not exists app_name text not null default 'SeekGRNJobs';
alter table public.subscription_orders add column if not exists currency text not null default 'NAD';
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

commit;
notify pgrst, 'reload schema';
select 'SEEKGRN short invoices and currency verification ready.' as result;
