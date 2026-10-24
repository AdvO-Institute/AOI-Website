-- Member profiles, sharing choices, Find a Doctor and the Member Directory (#67, #68, PR #69).
-- All additive: new columns, one view, functions and a trigger. Nothing is renamed or dropped.
-- Run one step at a time and check the preview address before the next.
--
-- Reuses columns that already exist and were empty: date_of_birth (birthday),
-- mail_address_line1 / mail_city / mail_region / mail_postal_code (home address)
-- and other_emails (extra email addresses).
--
-- "Current" everywhere below matches the members area's rule (state() in
-- src/lib/queries/members.ts): an active Board seat, or an active membership that
-- has not expired; never deceased.

-- ---------------------------------------------------------------- step 1 --
-- The clinic email, and what each member shares with other members.
-- Clinic details start shared; personal details start private (James, 2026-10-24).
alter table public.people
  add column if not exists practice_email text,
  add column if not exists share_clinic boolean not null default true,
  add column if not exists share_email boolean not null default false,
  add column if not exists share_other_emails boolean not null default false,
  add column if not exists share_mobile boolean not null default false,
  add column if not exists share_home_phone boolean not null default false,
  add column if not exists share_home_address boolean not null default false;

-- ---------------------------------------------------------------- step 2 --
-- Find a Doctor: the public, read-only list of current members' clinics.
-- Runs with its owner's rights so it can read people past row security; that is
-- why the column list is short. No personal email, phone or home address.
create or replace view public.v_public_directory as
with lvl as (
  select person_id,
         max(case level when 'level_2' then 2 when 'level_1' then 1 else 0 end) as r
  from person_certifications
  where technique = 'Advanced Orthogonal'
  group by person_id
)
select p.id as person_id, p.first_name, p.last_name, p.credentials,
       case l.r when 2 then 'level_2' when 1 then 'level_1' end as cert_level,
       p.practice_name as clinic_name, p.practice_address as address,
       p.practice_city as city, p.practice_state as state, p.practice_zip as zip,
       coalesce(p.practice_phone, p.office_phone) as phone,
       p.practice_website as website,
       p.practice_email as email
from people p
left join lvl l on l.person_id = p.id
where p.deceased_on is null
  and (p.practice_name is not null or p.practice_address is not null)
  and (
    exists (select 1 from board_service b where b.person_id = p.id and b.status = 'active')
    or (p.membership_status ~ '(active|current|member|good)' and p.membership_expires >= current_date)
  );

grant select on public.v_public_directory to anon, authenticated;

-- ---------------------------------------------------------------- step 3 --
-- Members save their own Business Information (My Account → Business).
-- Changes only the clinic fields of the signed-in member's own row.
create or replace function public.update_my_listing(
  p_name text, p_address text, p_city text, p_state text, p_zip text, p_phone text, p_email text, p_website text,
  p_share_clinic boolean
) returns integer
language sql security definer set search_path = public as $$
  with u as (
    update people set
      practice_name    = nullif(trim(p_name), ''),
      practice_address = nullif(trim(p_address), ''),
      practice_city    = nullif(trim(p_city), ''),
      practice_state   = nullif(upper(trim(p_state)), ''),
      practice_zip     = nullif(trim(p_zip), ''),
      practice_phone   = nullif(trim(p_phone), ''),
      office_phone     = nullif(trim(p_phone), ''),
      practice_email   = nullif(lower(trim(p_email)), ''),
      practice_website = nullif(trim(p_website), ''),
      share_clinic     = coalesce(p_share_clinic, true)
    where auth_user_id = auth.uid()
    returning 1
  )
  select count(*)::int from u;
$$;
revoke execute on function public.update_my_listing(text, text, text, text, text, text, text, text, boolean) from public, anon;
grant execute on function public.update_my_listing(text, text, text, text, text, text, text, text, boolean) to authenticated;

-- ---------------------------------------------------------------- step 4 --
-- Members save their own Personal Information (My Account → Personal) and
-- choose what other members see. Changes only these fields on their own row.
-- The sign-in email is not changed here: Supabase Auth mails a confirmation
-- link first, and the trigger below copies it to people.email once confirmed.
create or replace function public.update_my_info(
  p_first_name text, p_last_name text, p_credentials text, p_birthday date,
  p_mobile_phone text, p_personal_phone text,
  p_home_address text, p_home_city text, p_home_state text, p_home_zip text,
  p_other_emails text[],
  p_share_email boolean, p_share_other_emails boolean, p_share_mobile boolean,
  p_share_home_phone boolean, p_share_home_address boolean
) returns integer
language sql security definer set search_path = public as $$
  with u as (
    update people set
      first_name         = coalesce(nullif(trim(p_first_name), ''), first_name),
      last_name          = coalesce(nullif(trim(p_last_name), ''), last_name),
      credentials        = nullif(trim(p_credentials), ''),
      date_of_birth      = p_birthday,
      mobile_phone       = nullif(trim(p_mobile_phone), ''),
      personal_phone     = nullif(trim(p_personal_phone), ''),
      mail_address_line1 = nullif(trim(p_home_address), ''),
      mail_city          = nullif(trim(p_home_city), ''),
      mail_region        = nullif(upper(trim(p_home_state)), ''),
      mail_postal_code   = nullif(trim(p_home_zip), ''),
      other_emails       = (select nullif(array_agg(distinct lower(trim(e))), '{}')
                              from unnest(coalesce(p_other_emails, '{}')) e
                             where trim(e) <> ''),
      share_email        = coalesce(p_share_email, false),
      share_other_emails = coalesce(p_share_other_emails, false),
      share_mobile       = coalesce(p_share_mobile, false),
      share_home_phone   = coalesce(p_share_home_phone, false),
      share_home_address = coalesce(p_share_home_address, false)
    where auth_user_id = auth.uid()
    returning 1
  )
  select count(*)::int from u;
$$;
revoke execute on function public.update_my_info(text, text, text, date, text, text, text, text, text, text, text[], boolean, boolean, boolean, boolean, boolean) from public, anon;
grant execute on function public.update_my_info(text, text, text, date, text, text, text, text, text, text, text[], boolean, boolean, boolean, boolean, boolean) to authenticated;

-- Keep people.email in step when a member confirms a new sign-in email.
create or replace function public.sync_people_email() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.email is distinct from old.email then
    update people set email = new.email where auth_user_id = new.id;
  end if;
  return new;
end $$;
drop trigger if exists sync_people_email on auth.users;
create trigger sync_people_email after update of email on auth.users
  for each row execute function public.sync_people_email();

-- ---------------------------------------------------------------- step 5 --
-- Member Directory: what signed-in current members see of each other.
-- Name, credentials, level and photo always; everything else only when that
-- member chose to share it. Anyone who is not a current member (or an
-- administrator) gets no rows; the database enforces this, not the page.
create or replace function public.member_directory()
returns table (
  person_id uuid, first_name text, last_name text, credentials text, cert_level text, photo_url text,
  clinic_name text, clinic_address text, clinic_city text, clinic_state text, clinic_zip text,
  clinic_phone text, clinic_email text, clinic_website text,
  email text, other_emails text[], mobile_phone text, home_phone text,
  home_address text, home_city text, home_state text, home_zip text
)
language sql stable security definer set search_path = public as $$
  with cur as (
    select p.* from people p
    where p.deceased_on is null
      and (
        exists (select 1 from board_service b where b.person_id = p.id and b.status = 'active')
        or (p.membership_status ~ '(active|current|member|good)' and p.membership_expires >= current_date)
      )
  ), lvl as (
    select person_id,
           max(case level when 'level_2' then 2 when 'level_1' then 1 else 0 end) as r
    from person_certifications
    where technique = 'Advanced Orthogonal'
    group by person_id
  )
  select c.id, c.first_name, c.last_name, c.credentials,
         case l.r when 2 then 'level_2' when 1 then 'level_1' end,
         c.photo_url,
         case when c.share_clinic then c.practice_name end,
         case when c.share_clinic then c.practice_address end,
         case when c.share_clinic then c.practice_city end,
         case when c.share_clinic then c.practice_state end,
         case when c.share_clinic then c.practice_zip end,
         case when c.share_clinic then coalesce(c.practice_phone, c.office_phone) end,
         case when c.share_clinic then c.practice_email end,
         case when c.share_clinic then c.practice_website end,
         case when c.share_email then c.email end,
         case when c.share_other_emails then c.other_emails end,
         case when c.share_mobile then c.mobile_phone end,
         case when c.share_home_phone then c.personal_phone end,
         case when c.share_home_address then c.mail_address_line1 end,
         case when c.share_home_address then c.mail_city end,
         case when c.share_home_address then c.mail_region end,
         case when c.share_home_address then c.mail_postal_code end
  from cur c
  left join lvl l on l.person_id = c.id
  where exists (select 1 from cur me where me.auth_user_id = auth.uid()) or is_oversight()
  order by c.last_name, c.first_name;
$$;
revoke execute on function public.member_directory() from public, anon;
grant execute on function public.member_directory() to authenticated;
