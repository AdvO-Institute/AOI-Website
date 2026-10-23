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
  -- word_similarity scores the query against the best-matching part of the name,
  -- so one misspelled word still matches. 0.4 was tested on live names: a typo
  -- finds the right few people, nonsense finds none.
  select * from public.people
  where deceased_on is null
    and word_similarity(q, coalesce(first_name, '') || ' ' || coalesce(last_name, '') || ' ' || coalesce(practice_name, '')) >= 0.4
  order by word_similarity(q, coalesce(first_name, '') || ' ' || coalesce(last_name, '') || ' ' || coalesce(practice_name, '')) desc
  limit max_rows
$$;

notify pgrst, 'reload schema';
