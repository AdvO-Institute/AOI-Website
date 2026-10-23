-- Typo-proof people search, part 2 (#61): also forgive swapped letters.
-- Trigrams (search_people.sql) miss "Jmaes" and "Baedle", where two letters
-- trade places. This adds edit distance from fuzzystrmatch: a record also
-- matches when every word typed (3+ letters) is within 1 edit of a word in the
-- name (2 edits for words of 5+ letters; a swap counts as 2).
-- Additive: an extension, and the same function with the same arguments and
-- return type. It still runs as the caller, so row-level security applies.

create extension if not exists fuzzystrmatch with schema extensions;

create or replace function public.search_people(q text, max_rows int default 12)
returns setof public.people
language sql stable
set search_path = public, extensions
as $$
  with typed as (
    select lower(w) as w from regexp_split_to_table(trim(q), '\s+') w where length(w) >= 3
  ),
  scored as (
    select p,
      word_similarity(q, coalesce(p.first_name, '') || ' ' || coalesce(p.last_name, '') || ' ' || coalesce(p.practice_name, '')) as ws,
      (select bool_and(exists (
         select 1 from regexp_split_to_table(lower(coalesce(p.first_name, '') || ' ' || coalesce(p.last_name, '') || ' ' || coalesce(p.practice_name, '')), '[^a-z'']+') n
         where n <> '' and levenshtein(t.w, n) <= case when length(t.w) <= 4 then 1 else 2 end))
       from typed t) as close
    from public.people p
    where p.deceased_on is null
  )
  select (p).* from scored
  where ws >= 0.4 or close
  -- Every word close beats one word close; then the trigram score.
  order by coalesce(close, false) desc, ws desc
  limit max_rows
$$;

notify pgrst, 'reload schema';
