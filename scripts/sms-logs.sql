-- Paste into the existing SeekGRNJobs project's SQL Editor.
-- Creates OTP audit storage only. Does not change Auth users, passwords or roles.
begin;

-- Stop without changes if a differently structured sms_logs table already exists.
do $$
begin
 if to_regclass('public.sms_logs') is not null and (
  exists(select 1 from information_schema.columns where table_schema='public' and table_name='sms_logs' and column_name in ('phone','message'))
  or exists(select 1 from unnest(array['id','user_id','phone_last4','message_type','status','provider_http_status','provider_response','error_code','created_at','completed_at']) required(name)
    where not exists(select 1 from information_schema.columns c where c.table_schema='public' and c.table_name='sms_logs' and c.column_name=required.name))
 ) then
  raise exception 'An incompatible sms_logs table already exists. No changes were made. Share its schema before adapting this script.';
 end if;
 if exists(select 1 from pg_policies where schemaname='public' and tablename='sms_logs' and policyname<>'admin_read_sms_logs') then
  raise exception 'sms_logs already has other access policies. No changes were made; review those policies first.';
 end if;
end $$;

create table if not exists public.sms_logs (
 id uuid primary key default gen_random_uuid(),
 user_id uuid references auth.users(id) on delete set null,
 phone_last4 text not null check(phone_last4 ~ '^[0-9]{4}$'),
 message_type text not null default 'otp' check(message_type='otp'),
 status text not null check(status in ('queued','accepted','failed','unknown')),
 provider_http_status integer check(provider_http_status between 100 and 599),
 provider_response jsonb not null default '{}'::jsonb check(jsonb_typeof(provider_response)='object'),
 error_code text,
 created_at timestamptz not null default now(),
 completed_at timestamptz
);
create index if not exists sms_logs_created_at_idx on public.sms_logs(created_at desc);
alter table public.sms_logs enable row level security;

drop policy if exists admin_read_sms_logs on public.sms_logs;
create policy admin_read_sms_logs on public.sms_logs for select to authenticated
 using(exists(select 1 from public.app_admins a where a.user_id=(select auth.uid())));
revoke all on public.sms_logs from anon,authenticated;
grant select on public.sms_logs to authenticated;
grant select,insert,update on public.sms_logs to service_role;
comment on table public.sms_logs is 'OTP delivery metadata only. No plaintext OTPs, message bodies, API secrets, or full phone numbers.';
commit;

-- Run after requesting one code while signed in to the existing email account.
select id,user_id,phone_last4,status,provider_http_status,error_code,
       provider_response,created_at,completed_at
from public.sms_logs order by created_at desc limit 20;
