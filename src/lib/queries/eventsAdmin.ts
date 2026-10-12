/* ----------------------------------------------------------------------------
 * Events tab — the Institute calendar and its writes.
 *
 * One read pulls `events` with its venue, speakers, timed sessions and
 * registrations embedded. Every field on the form is a column on `events`;
 * speakers and sessions live in their own tables and are replaced as a set
 * when the form saves. Publishing is `events.status = 'published'`, which is
 * the single switch the public site's `v_public_events` view reads.
 *
 * Everything runs as the signed-in person. RLS decides what comes back and
 * what may change: everyone sees published events; board, the executive
 * director and the seminar committee see drafts and can edit.
 * -------------------------------------------------------------------------- */
import { zoneAbbr, shownZone, isOnline } from '@/lib/dates'
import { select, searchSelect, patch, insert, remove, rpc, headers, SB_URL, ensureSession } from '@/lib/supabase'

export const CATEGORIES: [string, string][] = [
  ['free', 'Intro Course (free)'], ['fundamentals', 'Fundamentals'], ['intensive', 'AdvO Intensive'],
  ['bridging', 'Bridging the Gap'], ['bootcamp', 'Bootcamp'], ['conference', 'Annual Conference'],
  ['webinar', 'Webinar'], ['internship', 'Internship'], ['Other', 'Other'],
]
export const TYPES: [string, string][] = [
  ['seminar', 'Seminar'], ['conference', 'Conference'], ['training', 'Training'], ['board', 'Board meeting'],
  ['committee', 'Committee'], ['deadline', 'Deadline'], ['meeting', 'Meeting'], ['Other', 'Other'],
]
export const GOV = new Set(['board', 'committee', 'deadline', 'meeting'])
export const TIMEZONES = ['America/New_York', 'America/Chicago', 'America/Denver', 'America/Los_Angeles', 'America/Phoenix']
export const catLabel = (k?: string | null) => CATEGORIES.find((c) => c[0] === k)?.[1] ?? (k || 'Uncategorized')
export const typeLabel = (k?: string | null) => TYPES.find((c) => c[0] === k)?.[1] ?? (k || 'Event')

export type Venue = { id: number; name: string; loc_type: string; address: string | null; city: string | null; state: string | null; website?: string | null }
export type Committee = { id: number; key: string; name: string }
export type Speaker = { id?: number; person_id: string | null; name: string; speaker_title: string | null; note: string | null; is_keynote: boolean; sort: number }
export type Session = { id?: string; title: string | null; starts_at: string | null; ends_at: string | null; ce_hours: number | null; speaker: string | null; sort: number }
export type Reg = {
  id: string; event_id: number; full_name: string; email: string; phone: string | null; practice_name: string | null
  reg_type: string; is_member_at_registration: boolean; price_paid_cents: number; payment_status: string
  registration_status: string; checked_in_at: string | null; checkin_method: string | null; created_at: string
  verification_status?: string | null; discount_applied?: string | null; ce_credits?: boolean | null; source?: string | null; notes?: string | null
}

export type EventRow = {
  id: number; slug: string | null; title: string; subtitle: string | null; description: string | null
  category: string | null; event_type: string | null; status: string | null; is_keystone: boolean
  starts_at: string; ends_at: string | null; timezone: string | null; location: string | null; location_id: number | null
  audience: string | null; agenda: string | null; prerequisites: string | null; refund_policy: string | null
  price: number | null; member_price: number | null; student_price: number | null
  early_bird: boolean | null; early_bird_price: number | null; early_bird_until: string | null
  free_with_membership: boolean; faculty_free: boolean
  ce_credits: boolean | null; ce_school: string | null; ce_mode: string | null; ce_price: number | null
  capacity: number | null; reg_opens: string | null; reg_closes: string | null
  primary_image: string | null; social_image: string | null; gallery_images: string[] | null
  room_block_hotel: string | null; room_block_rate: string | null; room_block_by: string | null
  zoom_url: string | null; video_url: string | null; committee_id: number | null; created_by: string | null
  visibility: string | null
  venue?: Venue | null
  event_speakers?: Speaker[]
  event_sessions?: Session[]
  event_registrations?: Pick<Reg, 'id' | 'registration_status' | 'checked_in_at' | 'payment_status' | 'created_at' | 'verification_status'>[]
}

/** The columns the form edits. Everything else on EventRow is derived or embedded. */
export const FORM_KEYS = [
  'slug', 'title', 'subtitle', 'description', 'category', 'event_type', 'status', 'is_keystone', 'starts_at', 'ends_at', 'timezone',
  'location', 'location_id', 'audience', 'agenda', 'prerequisites', 'refund_policy', 'price', 'member_price', 'student_price',
  'early_bird', 'early_bird_price', 'early_bird_until', 'free_with_membership', 'faculty_free', 'ce_credits', 'ce_school', 'ce_mode',
  'ce_price', 'capacity', 'reg_opens', 'reg_closes', 'primary_image', 'social_image', 'gallery_images', 'room_block_hotel',
  'room_block_rate', 'room_block_by', 'zoom_url', 'video_url', 'committee_id',
] as const
export type FormKey = (typeof FORM_KEYS)[number]
export type EventInput = Pick<EventRow, FormKey>

const SELECT = [
  '*',
  'venue:locations(id,name,loc_type,address,city,state,website)',
  'event_speakers(id,person_id,name,speaker_title,note,is_keynote,sort)',
  'event_sessions(id,title,starts_at,ends_at,ce_hours,speaker,sort)',
  'event_registrations(id,registration_status,checked_in_at,payment_status,created_at,verification_status)',
].join(',')

/* ------------------------------------------------------------------ reads */

export async function listEvents(): Promise<{ rows: EventRow[]; error?: string }> {
  const r = await select<EventRow>('events', `select=${SELECT}&order=starts_at.asc,id.asc`)
  return { rows: r.data ?? [], error: r.error }
}

export async function venues(): Promise<Venue[]> {
  const r = await select<Venue>('locations', 'select=id,name,loc_type,address,city,state,website&is_seminar_venue=eq.true&active=eq.true&order=sort.asc,name.asc')
  return r.data ?? []
}

export async function committees(): Promise<Committee[]> {
  const r = await select<Committee>('committees', 'select=id,key,name&order=name.asc')
  return r.data ?? []
}

/* Named columns, never `*`: a registration row also carries the pay token and
 * the Stripe session id, which the roster has no use for. */
const REG_SELECT = [
  'id', 'event_id', 'full_name', 'email', 'phone', 'practice_name', 'reg_type', 'is_member_at_registration', 'price_paid_cents',
  'payment_status', 'registration_status', 'checked_in_at', 'checkin_method', 'created_at', 'verification_status', 'discount_applied',
  'ce_credits', 'source', 'notes',
].join(',')

export async function registrations(eventId: number): Promise<{ rows: Reg[]; error?: string }> {
  const r = await select<Reg>('event_registrations', `select=${REG_SELECT}&event_id=eq.${eventId}&order=created_at.asc`)
  return { rows: r.data ?? [], error: r.error }
}

/* ------------------------------------------------------------ member RSVP --
 * Events that are free with membership: every current member has a seat until
 * they say otherwise. The candidates list is members who have not RSVP'd yet;
 * a Director or the Seminar chair can confirm one by hand (an RSVP that came
 * in by text or phone). Both are gated in the database by can_manage_rsvps(). */
export type RsvpCandidate = { person_id: string; full_name: string; credentials: string | null; email: string | null; phone: string | null; membership_expires: string | null; member_since: string | null }
export async function rsvpCandidates(eventId: number): Promise<RsvpCandidate[]> {
  return (await rpc<RsvpCandidate[]>('event_rsvp_candidates', { p_event_id: eventId })) ?? []
}
export async function manualRsvp(eventId: number, personId: string, note?: string): Promise<{ ok?: true; error?: string }> {
  await ensureSession()
  const res = await fetch(`${SB_URL}/rest/v1/rpc/event_manual_rsvp`, { method: 'POST', headers: headers(true), body: JSON.stringify({ p_event_id: eventId, p_person_id: personId, p_note: note ?? null }) })
  if (res.ok) return { ok: true }
  try { const j = await res.json(); return { error: String(j.message ?? j.hint ?? res.status) } } catch { return { error: String(res.status) } }
}
export async function canManageRsvps(): Promise<boolean> { try { return (await rpc<boolean>('can_manage_rsvps')) === true } catch { return false } }

export type PersonHit = { id: string; first_name: string | null; last_name: string | null; credentials: string | null; photo_url: string | null }
export async function searchPeople(q: string): Promise<PersonHit[]> {
  const t = q.trim().replace(/[,.*()]/g, '')
  if (t.length < 2) return []
  const r = await searchSelect<PersonHit>('people', t, ['first_name', 'last_name'], 8, (f, n) => `select=id,first_name,last_name,credentials,photo_url&${f}&order=last_name.asc&limit=${n}`)
  return r.data ?? []
}

/* ----------------------------------------------------------------- writes */

/** Turn the form's values into a row PostgREST will accept (blanks → null). */
export function toRow(v: Partial<EventInput>): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  for (const k of FORM_KEYS) {
    if (!(k in v)) continue
    const x = v[k] as unknown
    out[k] = x === '' || x === undefined ? null : x
  }
  return out
}

async function returning<T>(table: string, method: 'POST' | 'PATCH', params: string, body: unknown): Promise<{ row?: T; error?: string }> {
  await ensureSession()
  const res = await fetch(`${SB_URL}/rest/v1/${table}${params ? `?${params}` : ''}`, {
    method,
    headers: { ...headers(true), Prefer: 'return=representation' },
    body: JSON.stringify(body),
  })
  if (!res.ok) return { error: await res.text() }
  const rows = (await res.json()) as T[]
  return { row: rows[0] }
}

export async function createEvent(v: EventInput, createdBy: string | null): Promise<{ id?: number; error?: string }> {
  const r = await returning<{ id: number }>('events', 'POST', 'select=id', { ...toRow(v), created_by: createdBy })
  return r.error ? { error: r.error } : { id: r.row?.id }
}

export async function updateEvent(id: number, v: Partial<EventInput>): Promise<{ ok?: true; error?: string }> {
  return patch('events', `id=eq.${id}`, toRow(v))
}

export async function setStatus(id: number, status: 'published' | 'draft'): Promise<{ ok?: true; error?: string }> {
  return patch('events', `id=eq.${id}`, { status })
}

export async function deleteEvent(id: number): Promise<{ ok?: true; error?: string }> {
  return remove('events', `id=eq.${id}`)
}

/** Replace the speaker list for an event. */
export async function saveSpeakers(eventId: number, list: Speaker[]): Promise<{ ok?: true; error?: string }> {
  const d = await remove('event_speakers', `event_id=eq.${eventId}`)
  if (d.error) return d
  const rows = list.filter((s) => s.name.trim()).map((s, i) => ({
    event_id: eventId, person_id: s.person_id, name: s.name.trim(), speaker_title: s.speaker_title || null,
    note: s.note || null, is_keynote: !!s.is_keynote, sort: i,
  }))
  return insert('event_speakers', rows)
}

/** Replace the timed sessions for an event. */
export async function saveSessions(eventId: number, list: Session[]): Promise<{ ok?: true; error?: string }> {
  const d = await remove('event_sessions', `event_id=eq.${eventId}`)
  if (d.error) return d
  const rows = list.filter((s) => (s.title ?? '').trim() || s.starts_at).map((s, i) => ({
    event_id: eventId, title: s.title || null, starts_at: s.starts_at, ends_at: s.ends_at, ce_hours: s.ce_hours, speaker: s.speaker || null, sort: i,
  }))
  return insert('event_sessions', rows)
}

/** Copy an event (and its speakers and sessions) as a new draft. */
export async function duplicateEvent(e: EventRow, createdBy: string | null): Promise<{ id?: number; error?: string }> {
  const v: EventInput = { ...(e as EventInput) }
  const copy: EventInput = { ...v, title: `${e.title} (copy)`, slug: e.slug ? `${e.slug}-copy` : null, status: 'draft' }
  const c = await createEvent(copy, createdBy)
  if (c.error || !c.id) return c
  if (e.event_speakers?.length) { const r = await saveSpeakers(c.id, e.event_speakers); if (r.error) return { id: c.id, error: r.error } }
  if (e.event_sessions?.length) { const r = await saveSessions(c.id, e.event_sessions); if (r.error) return { id: c.id, error: r.error } }
  return { id: c.id }
}

export async function checkIn(regId: string, undo = false): Promise<{ ok?: true; error?: string }> {
  return patch('event_registrations', `id=eq.${regId}`, undo
    ? { checked_in_at: null, checkin_method: null }
    : { checked_in_at: new Date().toISOString(), checkin_method: 'manual' })
}

/* ---------------------------------------------------------------- derive */

export const isGov = (e: Pick<EventRow, 'event_type'>) => GOV.has(e.event_type ?? '')
export const isOngoing = (e: Pick<EventRow, 'ends_at' | 'category'>) => !e.ends_at && (e.category === 'free' || e.category === 'internship')
export function isPast(e: Pick<EventRow, 'starts_at' | 'ends_at' | 'category'>, now = Date.now()): boolean {
  if (isOngoing(e)) return false
  const end = e.ends_at ? new Date(e.ends_at).getTime() : new Date(e.starts_at).getTime() + 86_400_000
  return end < now
}
export const activeRegs = (e: EventRow) => (e.event_registrations ?? []).filter((r) => r.registration_status !== 'cancelled')
/** Seats that are actually taken: paid or free. A pending Stripe session is not a registration yet. */
export const confirmedRegs = (e: EventRow) => activeRegs(e).filter((r) => r.payment_status === 'paid' || r.payment_status === 'free')
export const pendingRegs = (e: EventRow) => activeRegs(e).filter((r) => r.payment_status === 'pending')
export const recentRegs = (e: EventRow, days = 7) => confirmedRegs(e).filter((r) => r.created_at && Date.now() - new Date(r.created_at).getTime() < days * 86400000)
export const unverifiedRegs = (e: EventRow) => confirmedRegs(e).filter((r) => r.verification_status === 'pending')
/** Student / faculty tickets are self-declared at checkout; the Institute confirms them here. */
export async function setVerification(regId: string, status: 'verified' | 'pending' | 'rejected'): Promise<{ ok?: true; error?: string }> {
  return patch('event_registrations', `id=eq.${regId}`, { verification_status: status, updated_at: new Date().toISOString() })
}
export const slugify = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')

export function zoned(iso: string | null | undefined, tz?: string | null) {
  if (!iso) return null
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return null
  try {
    const f = new Intl.DateTimeFormat('en-US', { timeZone: tz || 'America/New_York', year: 'numeric', month: 'numeric', day: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true, weekday: 'long' })
    const o: Record<string, string> = {}
    for (const p of f.formatToParts(d)) o[p.type] = p.value
    return { y: +o.year!, m: +o.month! - 1, d: +o.day!, time: `${o.hour}:${o.minute} ${o.dayPeriod}`, wd: o.weekday! }
  } catch {
    return { y: d.getUTCFullYear(), m: d.getUTCMonth(), d: d.getUTCDate(), time: '', wd: '' }
  }
}
export const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
export const MONL = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']

/** The date tile on a card. A range inside one month fits the tile ("OCT 13–14");
 * one that crosses months shows the start and spells the whole range in `range`
 * for the card to print ("Oct 13, 2026 – Sep 14, 2027"). */
export function dateBlock(e: EventRow): { mo: string; dy: string; yr: string; tm: string; range?: string } {
  if (isOngoing(e)) return { mo: 'Ongoing', dy: 'Any', yr: 'time', tm: '' }
  const zone = shownZone(e)
  const a = zoned(e.starts_at, zone)
  if (!a) return { mo: 'TBD', dy: '—', yr: '', tm: '' }
  const b = zoned(e.ends_at, zone)
  const mo = MON[a.m]!.toUpperCase(); let dy = String(a.d); let range: string | undefined
  if (b && (b.d !== a.d || b.m !== a.m || b.y !== a.y)) {
    if (b.m === a.m && b.y === a.y) dy = `${a.d}–${b.d}`
    else range = `${MON[a.m]} ${a.d}${b.y !== a.y ? `, ${a.y}` : ''} – ${MON[b.m]} ${b.d}, ${b.y}`
  }
  return { mo, dy, yr: String(a.y), tm: a.time === '12:00 AM' && !b ? '' : `${a.time} ${zoneAbbr(zone, new Date(e.starts_at))}`.trim(), range }
}

/** For an online event, its times in the viewer's zone, then the Institute's in
 *  brackets when the two differ: "6:00 – 7:30 PM PT (9:00 PM ET)". */
export function whenText(e: Pick<EventRow, 'starts_at' | 'ends_at' | 'timezone' | 'category'> & Partial<Pick<EventRow, 'location' | 'location_id' | 'venue' | 'zoom_url'>>): string {
  if (isOngoing(e)) return 'Ongoing · enroll any time'
  const zone = shownZone(e)
  const a = zoned(e.starts_at, zone)
  if (!a) return 'Date to be announced'
  const b = zoned(e.ends_at, zone)
  const at = new Date(e.starts_at)
  const home = e.timezone || 'America/New_York'
  const h = isOnline(e) && zoneAbbr(zone, at) !== zoneAbbr(home, at) ? zoned(e.starts_at, home) : null
  const tz = ` ${zoneAbbr(zone, at)}${h ? ` (${h.time} ${zoneAbbr(home, at)})` : ''}`
  if (!b) return `${a.wd}, ${MONL[a.m]} ${a.d}, ${a.y}${a.time && a.time !== '12:00 AM' ? ' · ' + a.time + tz : ''}`
  if (b.d === a.d && b.m === a.m) return `${a.wd}, ${MONL[a.m]} ${a.d}, ${a.y} · ${a.time} – ${b.time}${tz}`
  return `${MONL[a.m]} ${a.d}${b.y !== a.y ? `, ${a.y}` : ''} – ${b.m === a.m && b.y === a.y ? '' : MONL[b.m] + ' '}${b.d}, ${b.y} · ${a.time} start, ${b.time} finish${tz}`
}

export function money(n: unknown): string | null {
  if (n === null || n === undefined || n === '') return null
  const v = Number(n)
  if (!Number.isFinite(v)) return null
  return v <= 0 ? 'FREE' : `$${v.toLocaleString()}`
}
