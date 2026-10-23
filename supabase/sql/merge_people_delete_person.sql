-- Merge two records for the same person, and delete a record (#209, front end #210).
--
-- Additive only: two new functions, nothing existing is changed. Both run as the
-- database owner (SECURITY DEFINER) and refuse unless the caller is Board or full
-- admin (is_oversight()). Each runs as one transaction: any refusal undoes it all.
-- A refusal's message is shown to the user as written.
--
-- Checked against the live schema 2026-10-22: 38 foreign keys point at people.id;
-- the only unique keys that include a person are person_cert_progress
-- (person, requirement), person_locations (person, location) and
-- session_attendance (person, session). The existing update guards on people,
-- profiles, tasks and committee_reports all let is_oversight() callers through.

create or replace function public.merge_people(p_keep uuid, p_drop uuid)
returns void
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  k public.people%rowtype;
  d public.people%rowtype;
  v_login uuid;
  v_sets text;
  v_by_id uuid;
  v_by_name text;
  r record;
begin
  if not coalesce(public.is_oversight(), false) then
    raise exception 'Only the Board or a full administrator can merge records.';
  end if;
  if p_keep is null or p_drop is null or p_keep = p_drop then
    raise exception 'Choose two different records to merge.';
  end if;

  select * into k from public.people where id = p_keep for update;
  if not found then raise exception 'The record to keep no longer exists.'; end if;
  select * into d from public.people where id = p_drop for update;
  if not found then raise exception 'The record to merge in no longer exists.'; end if;

  if k.auth_user_id is not null and d.auth_user_id is not null then
    raise exception 'Both records have their own login, so they cannot be merged here. Ask the Executive Director which login to keep.';
  end if;

  -- 1. Rows that would clash with a unique key: the kept record's row wins.
  delete from public.person_cert_progress x
   where x.person_id = p_drop
     and exists (select 1 from public.person_cert_progress y where y.person_id = p_keep and y.requirement_id = x.requirement_id);
  delete from public.person_locations x
   where x.person_id = p_drop
     and exists (select 1 from public.person_locations y where y.person_id = p_keep and y.location_id = x.location_id);
  delete from public.session_attendance x
   where x.person_id = p_drop
     and exists (select 1 from public.session_attendance y where y.person_id = p_keep and y.session_id = x.session_id);

  -- 2. Every column that points at people.id, read from the database itself so a
  --    table added later is included too.
  for r in
    select c.conrelid::regclass as tbl, a.attname as col
      from pg_constraint c
      join pg_attribute a on a.attrelid = c.conrelid and a.attnum = any (c.conkey)
     where c.contype = 'f' and c.confrelid = 'public.people'::regclass
  loop
    execute format('update %s set %I = $1 where %I = $2', r.tbl, r.col, r.col) using p_keep, p_drop;
  end loop;

  -- 3. The other record goes now, so nothing unique on it (email, login) can clash
  --    while its details are copied below. Everything that pointed at it already
  --    points at the kept record, so nothing cascades.
  v_login := d.auth_user_id;
  delete from public.people where id = p_drop;

  -- 4. Fill the kept record's blanks from the other record's details.
  select string_agg(
           case when data_type in ('text', 'character', 'character varying')
                then format('%1$I = coalesce(nullif(k.%1$I, ''''), d.%1$I)', column_name)
                else format('%1$I = coalesce(k.%1$I, d.%1$I)', column_name) end,
           ', ')
    into v_sets
    from information_schema.columns
   where table_schema = 'public' and table_name = 'people'
     and column_name not in ('id', 'auth_user_id', 'created_at', 'updated_at', 'notes', 'techniques',
                             'member_since', 'membership_expires', 'membership_status');
  execute format('update public.people k set %s from jsonb_populate_record(null::public.people, $2) d where k.id = $1', v_sets)
    using p_keep, to_jsonb(d);

  -- Membership: earliest start, latest expiry, and the status that goes with it.
  -- The login moves over if only the other record had one.
  update public.people t
     set member_since = least(t.member_since, d.member_since),
         membership_expires = greatest(t.membership_expires, d.membership_expires),
         membership_status = case
           when d.membership_expires is not null
            and (t.membership_expires is null or d.membership_expires > t.membership_expires)
           then coalesce(d.membership_status, t.membership_status)
           else coalesce(t.membership_status, d.membership_status) end,
         techniques = coalesce((select array_agg(distinct x) from unnest(coalesce(t.techniques, '{}') || coalesce(d.techniques, '{}')) x), t.techniques),
         notes = nullif(concat_ws(E'\n\n', nullif(t.notes, ''), nullif(d.notes, '')), ''),
         auth_user_id = coalesce(t.auth_user_id, v_login)
   where t.id = p_keep;

  -- 5. A note on the kept record saying what happened.
  select p.id, concat_ws(' ', p.first_name, p.last_name) into v_by_id, v_by_name
    from public.people p where p.auth_user_id = auth.uid() limit 1;
  insert into public.contact_notes (person_id, text, by_name, by_id)
  values (p_keep,
          'Merged a duplicate record into this one: '
            || coalesce(nullif(concat_ws(' ', d.first_name, d.last_name), ''), 'no name')
            || coalesce(' (' || nullif(d.email, '') || ')', '') || '.',
          v_by_name, v_by_id);
end
$$;

create or replace function public.delete_person(p_id uuid)
returns void
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  p public.people%rowtype;
begin
  if not coalesce(public.is_oversight(), false) then
    raise exception 'Only the Board or a full administrator can delete a record.';
  end if;

  select * into p from public.people where id = p_id for update;
  if not found then raise exception 'That record no longer exists.'; end if;

  if p.auth_user_id is not null then
    raise exception 'This person has a login, so the record cannot be deleted. If it is a duplicate, merge it instead.';
  end if;
  if exists (select 1 from public.event_registrations where person_id = p_id)
     or exists (select 1 from public.membership_payments where person_id = p_id)
     or exists (select 1 from public.person_certifications where person_id = p_id)
     or exists (select 1 from public.completions where person_id = p_id)
     or exists (select 1 from public.attestations where person_id = p_id)
     or exists (select 1 from public.session_attendance where person_id = p_id)
     or exists (select 1 from public.instructor_records where person_id = p_id)
     or exists (select 1 from public.board_service where person_id = p_id)
     or exists (select 1 from public.board_documents where person_id = p_id)
     or exists (select 1 from public.board_reviews where person_id = p_id) then
    raise exception 'This person has history (registrations, payments, certifications or Board records), so the record cannot be deleted. If it is a duplicate, merge it into the right record instead.';
  end if;

  -- Notes, offices and roles go with the record (their keys cascade);
  -- anything that only mentions this person as author or assignee is kept with the name cleared.
  delete from public.people where id = p_id;
end
$$;

revoke all on function public.merge_people(uuid, uuid) from public, anon;
revoke all on function public.delete_person(uuid) from public, anon;
grant execute on function public.merge_people(uuid, uuid) to authenticated;
grant execute on function public.delete_person(uuid) to authenticated;
