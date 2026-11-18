-- Run in the SeekGRnJobs Supabase SQL Editor.
-- Preserves the existing Auth user, identities, password and application data.
begin;
do $$
declare
  target_id uuid;
begin
  select id into strict target_id from auth.users
  where lower(email) = 'mwaikange@gmail.com' and email_confirmed_at is not null;

  if exists(select 1 from public.app_admins where user_id <> target_id) then
    raise exception 'Another admin membership exists. No changes were made; review app_admins first.';
  end if;

  insert into public.app_admins(user_id) values(target_id)
  on conflict(user_id) do nothing;

  -- User metadata remembers the contact only; it never grants permissions.
  -- Phone verification will happen through the real SMS OTP flow.
  update auth.users
  set raw_app_meta_data = coalesce(raw_app_meta_data,'{}'::jsonb)
        || jsonb_build_object('role','super_admin'),
      raw_user_meta_data = coalesce(raw_user_meta_data,'{}'::jsonb)
        || jsonb_build_object('contact_phone','+264818083704'),
      updated_at = now()
  where id = target_id;

  -- Enforce one specific PSM uploader, including future membership inserts.
  if not exists(select 1 from pg_constraint
    where conrelid='public.app_admins'::regclass and conname='seekgrn_sole_super_admin') then
    execute format('alter table public.app_admins add constraint seekgrn_sole_super_admin check (user_id = %L::uuid)',target_id);
  end if;
end $$;
revoke insert, update, delete on public.app_admins from anon, authenticated;
commit;

select u.id,u.email,u.raw_app_meta_data->>'role' as role,
       u.raw_user_meta_data->>'contact_phone' as contact_phone,
       u.phone_confirmed_at,
       exists(select 1 from public.app_admins a where a.user_id=u.id) as can_upload_psm
from auth.users u where lower(u.email)='mwaikange@gmail.com';
