-- Typo-proof people search (#61): trigram similarity across the whole name.
-- Additive: an extension, an index and a new function. The function runs as the
-- caller (not security definer), so row-level security on people still applies.
-- The site switches to it in a separate pull request.

create extension if not exists pg_trgm with schema extensions;

create index if not exists people_name_trgm on public.people
  using gin ((coalesce(first_name, '') || ' ' || coalesce(last_name, '') || ' ' || coalesce(practice_name, '')) extensions.gin_trgm_ops);

create or replace function public.search_people(q text, max_rows int default 12)
returns setof public.people
language sql stable
set search_path = public, extensions
as $$
  select * from public.people
  where deceased_on is null
    and (coalesce(first_name, '') || ' ' || coalesce(last_name, '') || ' ' || coalesce(practice_name, '')) % q
  order by similarity(coalesce(first_name, '') || ' ' || coalesce(last_name, '') || ' ' || coalesce(practice_name, ''), q) desc
  limit max_rows
$$;

notify pgrst, 'reload schema';
