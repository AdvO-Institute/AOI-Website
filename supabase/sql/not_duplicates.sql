-- Find duplicates: "Not the same person", remembered for everyone (#226).
-- One row per pair of records someone has said are two different people, so
-- the pair stops showing in Find duplicates for every Board member and admin.
-- "Search all potential duplicates" still shows them, and a pair can be put
-- back. The pair is stored smaller id first.
-- No foreign keys on purpose: merge_people repoints every foreign key to
-- people, which would turn a row into a pair of one record with itself. A row
-- left behind by a merge or a delete matches nothing and does no harm.
-- Additive: a new table and its access rules.

create table if not exists public.not_duplicates (
  person_a uuid not null,
  person_b uuid not null,
  marked_by_name text,
  marked_at timestamptz not null default now(),
  primary key (person_a, person_b),
  check (person_a < person_b)
);

alter table public.not_duplicates enable row level security;

-- The same people who can merge (Board and full administrators).
drop policy if exists not_duplicates_read on public.not_duplicates;
create policy not_duplicates_read on public.not_duplicates for select to authenticated using (coalesce(public.is_oversight(), false));
drop policy if exists not_duplicates_add on public.not_duplicates;
create policy not_duplicates_add on public.not_duplicates for insert to authenticated with check (coalesce(public.is_oversight(), false));
drop policy if exists not_duplicates_remove on public.not_duplicates;
create policy not_duplicates_remove on public.not_duplicates for delete to authenticated using (coalesce(public.is_oversight(), false));

grant select, insert, delete on public.not_duplicates to authenticated;

notify pgrst, 'reload schema';
