-- The Board panel's "Nominated" checkbox (#56).
-- The site already works without this column (a nomination date marks the step
-- done) and reads it when it exists. Additive only.

alter table public.board_service add column if not exists nominated boolean;

-- Rows already past the nomination step count as nominated.
update public.board_service
   set nominated = true
 where nominated is null
   and (nominated_date is not null or status in ('nominee', 'seated', 'active'));

notify pgrst, 'reload schema';
