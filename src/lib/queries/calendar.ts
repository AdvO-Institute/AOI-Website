/* ----------------------------------------------------------------------------
 * Calendar — a second view of the `events` table the Events tab manages,
 * through v_calendar, which hands the Zoom link only to leadership. Members
 * see Board meetings as dates; directors, chairs and committee members can
 * join them.
 * -------------------------------------------------------------------------- */
import { select, insert, patch, remove } from '@/lib/supabase'
import { dayET } from './meetings'
import { shownZone, isOnline, zoneAbbr as abbr } from '@/lib/dates'

export type CalEvent = {
  id: number; title: string; subtitle: string | null; event_type: string | null; category: string | null; starts_at: string; ends_at: string | null; timezone: string | null
  location: string | null; committee_id: number | null; is_keystone: boolean | null; agenda: string | null; audience: string | null; status: string | null; slug: string | null
  visibility: string | null; zoom_url: string | null; has_zoom: boolean
}
export const TYPE_LABEL: Record<string, string> = { seminar: 'Seminar', conference: 'Conference', training: 'Training', board: 'Board meeting', committee: 'Committee meeting', deadline: 'Deadline', meeting: 'Meeting', Other: 'Event' }
export const GOV = new Set(['board', 'committee', 'deadline', 'meeting'])

export async function calendar(): Promise<{ rows: CalEvent[]; error?: string }> {
  const q = await select<CalEvent>('v_calendar', 'select=*&order=starts_at&limit=500')
  if (q.data) return { rows: q.data }
  return { rows: [], error: q.error ?? 'unknown' }
}
export async function myRegisteredEventIds(uid: string | null): Promise<Set<number>> {
  if (!uid) return new Set()
  const q = await select<{ event_id: number }>('event_registrations', `select=event_id&auth_user_id=eq.${uid}&registration_status=neq.cancelled&limit=200`)
  return new Set((q.data ?? []).map((r) => r.event_id))
}

/* ---- derive ------------------------------------------------------------------ */
/** Online meetings show in the viewer's own zone; in-person ones in the event's. */
const tz = (e: CalEvent) => shownZone(e)
export const startDay = (e: CalEvent) => dayET(e.starts_at)
export const endDay = (e: CalEvent) => dayET(e.ends_at ?? e.starts_at)
export const isPast = (e: CalEvent, today = dayET()) => endDay(e) < today
export const isOngoing = (e: CalEvent) => !e.ends_at && (e.category === 'free' || e.category === 'internship')
export const timeOf = (iso: string, e: CalEvent) => new Date(iso).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', timeZone: tz(e) })
export const dayLabel = (ymd: string, opts: Intl.DateTimeFormatOptions) => new Date(ymd + 'T12:00:00Z').toLocaleDateString('en-US', { ...opts, timeZone: 'UTC' })
/** "10:00 AM – 6:00 PM ET", "All day", or "Oct 17 – Oct 18, 2026" for multi-day.
 *  An online meeting outside Eastern time adds the Institute's: "6:00 PM PT (9:00 PM ET)". */
export function whenLine(e: CalEvent): string {
  const s = startDay(e), l = endDay(e)
  if (s !== l) return `${dayLabel(s, { month: 'short', day: 'numeric' })} – ${dayLabel(l, { month: 'short', day: 'numeric', year: 'numeric' })}`
  if (!e.ends_at && isOngoing(e)) return 'Ongoing'
  const at = new Date(e.starts_at), home = e.timezone || 'America/New_York'
  const z = abbr(tz(e), at)
  const h = isOnline(e) && z !== abbr(home, at) ? ` (${new Date(e.starts_at).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', timeZone: home })} ${abbr(home, at)})` : ''
  return `${timeOf(e.starts_at, e)}${e.ends_at ? ` – ${timeOf(e.ends_at, e)}` : ''} ${z}${h}`
}

/* ---- writes (meetings; seminars and conferences are managed from Events) -------- */
export type MeetingInput = { title: string; event_type: string; committee_id: number | null; starts_at: string; ends_at: string | null; location: string; zoom_url: string; agenda: string; is_keystone: boolean; visibility: 'members' | 'leadership' | 'board' }
export const createMeeting = (v: MeetingInput, createdBy: string | null) => insert('events', [{
  title: v.title, event_type: v.event_type, committee_id: v.committee_id, starts_at: v.starts_at, ends_at: v.ends_at, timezone: 'America/New_York',
  location: v.location || null, zoom_url: v.zoom_url || null, agenda: v.agenda || null, is_keystone: v.is_keystone, status: 'published', visibility: v.visibility, created_by: createdBy,
}])
export const updateMeeting = (id: number, v: MeetingInput) => patch('events', `id=eq.${id}`, {
  title: v.title, event_type: v.event_type, committee_id: v.committee_id, starts_at: v.starts_at, ends_at: v.ends_at, location: v.location || null, zoom_url: v.zoom_url || null, agenda: v.agenda || null, is_keystone: v.is_keystone, visibility: v.visibility, updated_at: new Date().toISOString(),
})
export const deleteMeeting = (id: number) => remove('events', `id=eq.${id}`)
/** Local datetime-local value (in ET) ↔ ISO. */
export function toLocal(iso: string | null): string {
  if (!iso) return ''
  const p = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false }).formatToParts(new Date(iso))
  const g = (t: string) => p.find((x) => x.type === t)?.value ?? '00'
  return `${g('year')}-${g('month')}-${g('day')}T${g('hour') === '24' ? '00' : g('hour')}:${g('minute')}`
}
export function fromLocal(v: string): string | null {
  if (!v) return null
  // find the UTC instant whose ET wall-clock equals v
  const guess = new Date(v + ':00Z')
  const wall = toLocal(guess.toISOString())
  const diff = (Date.parse(v + ':00Z') - Date.parse(wall + ':00Z'))
  return new Date(guess.getTime() + diff).toISOString()
}
