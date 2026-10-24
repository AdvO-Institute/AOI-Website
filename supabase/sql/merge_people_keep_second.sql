-- Merge without losing a second email or a second office (#226).
-- merge_people(keep, drop) fills the kept record's blanks, so when both records
-- have an email or a practice, the other record's one was lost. This adds:
--   1. people.other_emails: more email addresses for one person.
--   2. merge_people(keep, drop, second_email, second_location): runs the
--      existing merge, then, when asked, keeps the other record's email as a
--      second email and adds its practice as another office. Phone numbers the
--      merge could not keep go in the merge note, so nothing is lost.
-- Additive: a new column and a new four-argument function beside the existing
-- two-argument one, which is unchanged.

alter table public.people add column if not exists other_emails text[];

create or replace function public.merge_people(p_keep uuid, p_drop uuid, p_second_email boolean, p_second_location boolean)
returns void
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  k public.people%rowtype;
  d public.people%rowtype;
  n public.people%rowtype;
  v_lost text;
begin
  -- Both records as they were; the existing merge checks who may do this.
  select * into k from public.people where id = p_keep;
  select * into d from public.people where id = p_drop;
  perform public.merge_people(p_keep, p_drop);
  select * into n from public.people where id = p_keep;

  -- 1. The other record's email (and any second emails) stay as second emails.
  if p_second_email then
    update public.people t
       set other_emails = (select nullif(array_agg(distinct e order by e), '{}')
                             from unnest(coalesce(t.other_emails, '{}') || array[d.email] || coalesce(d.other_emails, '{}')) e
                            where nullif(trim(e), '') is not null and lower(trim(e)) <> lower(coalesce(t.email, '')))
     where t.id = p_keep;
  end if;

  -- 2. The other record's practice becomes another office, unless the kept
  --    record had none (the merge already made it the main one) or already
  --    lists the same address and city.
  if p_second_location
     and coalesce(nullif(trim(d.practice_address), ''), nullif(trim(d.practice_city), ''), nullif(trim(d.practice_name), '')) is not null
     and coalesce(nullif(trim(k.practice_address), ''), nullif(trim(k.practice_city), ''), nullif(trim(k.practice_name), '')) is not null
     and lower(concat_ws('|', trim(d.practice_address), trim(d.practice_city))) <> lower(concat_ws('|', trim(n.practice_address), trim(n.practice_city)))
     and not exists (select 1 from public.practice_locations l
                      where l.person_id = p_keep
                        and lower(concat_ws('|', trim(l.address), trim(l.city))) = lower(concat_ws('|', trim(d.practice_address), trim(d.practice_city))))
  then
    insert into public.practice_locations (person_id, name, address, city, state, zip, phone, website, is_primary, sort)
    values (p_keep, d.practice_name, d.practice_address, d.practice_city, d.practice_state, d.practice_zip, d.practice_phone, d.practice_website, false,
            (select coalesce(max(sort), 0) + 1 from public.practice_locations where person_id = p_keep));
  end if;

  -- 3. Phone numbers from the other record that the kept one does not have.
  select string_agg(x, ', ') into v_lost
    from unnest(array[d.mobile_phone, d.personal_phone, d.office_phone, d.practice_phone]) x
   where nullif(trim(x), '') is not null
     and regexp_replace(x, '\D', '', 'g') not in (
       select regexp_replace(coalesce(y, ''), '\D', '', 'g')
         from unnest(array[n.mobile_phone, n.personal_phone, n.office_phone, n.practice_phone]) y
       union select regexp_replace(coalesce(l.phone, ''), '\D', '', 'g') from public.practice_locations l where l.person_id = p_keep);
  if v_lost is not null then
    insert into public.contact_notes (person_id, text, by_name, by_id)
    select p_keep, 'Other phone numbers from the merged record: ' || v_lost || '.', by_name, by_id
      from public.contact_notes where person_id = p_keep order by created_at desc limit 1;
  end if;
end
$function$;

notify pgrst, 'reload schema';
