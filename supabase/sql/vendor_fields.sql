-- Vendor details on people, for the Directory's Vendor tab (#183).
-- Additive only. Row-level security on people already covers new columns:
-- the board and lead managers read and edit them, as with other contact fields.

alter table public.people
  add column if not exists is_vendor boolean not null default false,
  add column if not exists vendor_company text,
  add column if not exists vendor_services text,
  add column if not exists vendor_website text,
  add column if not exists vendor_notes text;

notify pgrst, 'reload schema';
