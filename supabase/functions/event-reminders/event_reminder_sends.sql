-- event-reminders: the record of every reminder email sent.
-- Run once in the Supabase SQL editor before the event-reminders function is
-- deployed and scheduled. Additive only: a new table, nothing existing changes.
--
-- One row per registration, per kind of reminder, per date. The function
-- inserts the row *before* it sends (and removes it again if the send fails),
-- so a re-run, a second schedule, or two runs at once never email anyone twice.
--
-- occurs_on is the date the reminder is about, in the event's time zone: the
-- Huddle call's date, the in-person event's first day, or the hotel book-by
-- date. It is part of the unique key instead of session_id because the Events
-- tab replaces an event's sessions as a set on every save, so a session's id
-- changes whenever anyone edits the event. session_id is kept for reference.

create table if not exists public.event_reminder_sends (
  id              bigint generated always as identity primary key,
  event_id        bigint not null references public.events (id) on delete cascade,
  session_id      uuid,
  registration_id uuid not null references public.event_registrations (id) on delete cascade,
  kind            text not null check (kind in (
                    'huddle_two_days', 'huddle_day_of',
                    'week_before', 'day_before', 'morning_of', 'hotel_book_by')),
  occurs_on       date not null,
  sent_at         timestamptz not null default now(),
  constraint event_reminder_sends_once unique (registration_id, kind, occurs_on)
);

create index if not exists event_reminder_sends_event_idx on public.event_reminder_sends (event_id, occurs_on);

comment on table public.event_reminder_sends is
  'One row per reminder email sent by the event-reminders edge function. The unique key stops a re-run from sending twice.';

-- Only the edge function (service role, which bypasses RLS) reads or writes it.
alter table public.event_reminder_sends enable row level security;
