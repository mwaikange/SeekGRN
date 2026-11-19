-- Run after subscriptions.sql (or after payment-return-update.sql on an existing install).
begin;

alter table public.subscription_orders add column if not exists review_required boolean not null default false;
alter table public.subscription_orders drop constraint if exists subscription_orders_status_check;
alter table public.subscription_orders add constraint subscription_orders_status_check
 check(status in ('pending','paid','cancelled','expired'));
create index if not exists subscription_orders_pending_idx
 on public.subscription_orders(user_id,created_at) where status='pending';

create or replace function public.subscription_status() returns jsonb
 language plpgsql security definer set search_path=pg_catalog,public as $$
declare u uuid:=auth.uid(); pending jsonb;
begin
 if u is null then raise exception 'Sign in to view your subscription.'; end if;
 select coalesce(jsonb_agg(invoice_id order by created_at desc),'[]'::jsonb) into pending
  from public.subscription_orders where user_id=u and app_prefix='SEEKGRN' and currency='NAD' and status='pending';
 return public.seekgrn_entitlement(u)||jsonb_build_object('pending_invoices',pending);
end $$;
revoke all on function public.subscription_status() from public,anon;
grant execute on function public.subscription_status() to authenticated;

drop function if exists public.create_subscription_order(text,text);
create or replace function public.create_subscription_order(p_plan text) returns jsonb
 language plpgsql security definer set search_path=pg_catalog,public as $$
declare u uuid:=auth.uid(); o public.subscription_orders%rowtype; price numeric; town text; attempt integer;
begin
 if u is null then raise exception 'Sign in to subscribe.'; end if;
 if exists(select 1 from public.app_admins where user_id=u) then raise exception 'Administrators have free unlimited access.'; end if;
 select raw_user_meta_data->>'checkout_town' into town
  from auth.users where id=u and email_confirmed_at is not null and phone_confirmed_at is not null;
 if not found then raise exception 'Verify your email and mobile before subscribing.'; end if;
 if town is null or length(trim(town)) not between 1 and 100 then raise exception 'Save your town in My account before subscribing.'; end if;
 price:=case p_plan when 'monthly' then 50 when 'biannual' then 240 when 'annual' then 360 else null end;
 if price is null then raise exception 'Choose a valid package.'; end if;

 perform pg_advisory_xact_lock(hashtextextended(u::text,0));
 if exists(select 1 from public.subscription_terms where user_id=u and ends_at>now()) then
  raise exception 'You can choose another package when your current subscription ends.' using errcode='P0409';
 end if;
 if exists(select 1 from public.subscription_orders where user_id=u and status='pending' and app_prefix='SEEKGRN' and currency='NAD') then
  raise exception 'You already have a pending payment request.' using errcode='P0409';
 end if;

 for attempt in 1..10 loop
  insert into public.subscription_orders(invoice_id,user_id,plan,amount,town,app_prefix,app_name,currency)
   values('SEEKGRN-'||upper(substr(replace(gen_random_uuid()::text,'-',''),1,7)),u,p_plan,price,town,'SEEKGRN','SeekGRNJobs','NAD')
   on conflict(invoice_id) do nothing returning * into o;
  exit when found;
 end loop;
 if o.invoice_id is null then raise exception 'Unable to reserve a payment reference. Please retry.'; end if;
 return jsonb_build_object('invoice_id',o.invoice_id,'plan',o.plan,'amount',o.amount,'town',o.town,'status',o.status,
  'app_prefix',o.app_prefix,'app_name',o.app_name,'currency',o.currency);
end $$;
revoke all on function public.create_subscription_order(text) from public,anon,authenticated;
-- The authenticated checkout API supplies the caller's access token to this RPC.
grant execute on function public.create_subscription_order(text) to authenticated;

create or replace function public.close_subscription_order(p_invoice text,p_status text,p_amount numeric,p_currency text)
 returns jsonb language plpgsql security definer set search_path=pg_catalog,public as $$
declare o public.subscription_orders%rowtype;
begin
 select * into o from public.subscription_orders where invoice_id=p_invoice;
 if not found then raise exception 'Unknown invoice.'; end if;
 perform pg_advisory_xact_lock(hashtextextended(o.user_id::text,0));
 select * into o from public.subscription_orders where invoice_id=p_invoice for update;
 if o.app_prefix<>'SEEKGRN' or p_currency is distinct from o.currency or p_amount is distinct from o.amount
  or p_status is null or p_status not in ('cancelled','expired') then
  raise exception 'Payment details do not match.';
 end if;
 if o.status='pending' then
  update public.subscription_orders set status=p_status where invoice_id=p_invoice returning * into o;
 end if;
 return jsonb_build_object('status',o.status,'paid_at',o.paid_at,'review_required',o.review_required);
end $$;
revoke all on function public.close_subscription_order(text,text,numeric,text) from public,anon,authenticated;
grant execute on function public.close_subscription_order(text,text,numeric,text) to service_role;

create or replace function public.apply_subscription_payment(p_invoice text,p_transaction text,p_amount numeric,p_currency text)
 returns jsonb language plpgsql security definer set search_path=pg_catalog,public as $$
declare o public.subscription_orders%rowtype; starts timestamptz; months integer; needs_review boolean;
begin
 select * into o from public.subscription_orders where invoice_id=p_invoice;
 if not found then raise exception 'Unknown invoice.'; end if;
 perform pg_advisory_xact_lock(hashtextextended(o.user_id::text,0));
 select * into o from public.subscription_orders where invoice_id=p_invoice for update;
 if o.app_prefix<>'SEEKGRN' or p_currency is distinct from o.currency or p_amount is distinct from o.amount
  or p_transaction is null or length(p_transaction) not between 1 and 150 then
  raise exception 'Payment details do not match.';
 end if;
 if o.status='paid' then
  if o.transaction_id<>p_transaction then raise exception 'Invoice already paid by another transaction.'; end if;
  return jsonb_build_object('replayed',true);
 end if;
 if exists(select 1 from public.subscription_orders where transaction_id=p_transaction) then raise exception 'Transaction already applied.'; end if;
 starts:=now();
 needs_review:=o.status<>'pending' or exists(select 1 from public.subscription_terms where user_id=o.user_id and ends_at>starts);
 -- Record a late or duplicate legacy payment for review without granting a second term.
 if not needs_review then
  months:=case o.plan when 'monthly' then 1 when 'biannual' then 6 else 12 end;
  insert into public.subscription_terms(user_id,invoice_id,plan,starts_at,ends_at)
   values(o.user_id,o.invoice_id,o.plan,starts,starts+(months*interval '1 month'));
 end if;
 update public.subscription_orders set status='paid',paid_at=starts,transaction_id=p_transaction,review_required=needs_review
  where invoice_id=p_invoice;
 return jsonb_build_object('replayed',false,'review_required',needs_review);
end $$;
revoke all on function public.apply_subscription_payment(text,text,numeric,text) from public,anon,authenticated;
grant execute on function public.apply_subscription_payment(text,text,numeric,text) to service_role;

commit;
notify pgrst, 'reload schema';
