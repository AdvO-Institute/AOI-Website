/* ----------------------------------------------------------------------------
 * Members — the roster and its writes.
 *
 * A member is anyone with a paid membership (active or lapsed) or a seat on
 * the board, current or past. Prospects live under Leads. One request brings
 * each person with their certifications, instructor record, board terms,
 * practice locations and notes embedded.
 *
 * State rules, in one place so the tiles, the labels and the export agree:
 *   deceased  — people.deceased_on is set (listed under Inactive, labelled)
 *   current   — paid and in date, OR an active board seat (complimentary)
 *   recent    — lapsed within the last six months (reactivatable)
 *   inactive  — anything else
 * -------------------------------------------------------------------------- */
import { select, patch, insert, remove } from '@/lib/supabase'

export type Cert = { id: number; technique: string; level: string; cert_date: string | null; certificate_number: string | null; grandfathered: boolean | null; certified_by: string | null }
export type Instr = { id: number; level: string | null; status: string | null; technique: string | null }
export type Board = { id: number; term_label: string | null; status: string | null; term_start: string | null; term_end: string | null }
export type Role = { id: number; role_key: string; committee_id: number | null; committees: { name: string } | null }
export type Note = { id: number; text: string; by_name: string | null; created_at: string }
export type Location = { id: number; name: string | null; address: string | null; phone: string | null; website: string | null; is_primary: boolean | null }
export type Member = {
  id: string; first_name: string; last_name: string; credentials: string | null; email: string | null
  mobile_phone: string | null; office_phone: string | null; practice_phone: string | null
  practice_name: string | null; practice_address: string | null; practice_city: string | null; practice_state: string | null
  practice_zip: string | null; practice_website: string | null; photo_url: string | null
  membership_status: string | null; member_since: string | null; membership_expires: string | null
  contact_type: string | null; techniques: string[] | null; deceased_on: string | null; notes: string | null
  person_certifications: Cert[]; instructor_records: Instr[]; board_service: Board[]
  person_roles: Role[]; contact_notes: Note[]; practice_locations: Location[]
}

const SELECT =
  'id,first_name,last_name,credentials,email,mobile_phone,office_phone,practice_phone,practice_name,practice_address,photo_url,' +
  'practice_city,practice_state,practice_zip,practice_website,membership_status,member_since,membership_expires,' +
  'contact_type,techniques,deceased_on,notes,' +
  'person_certifications(id,technique,level,cert_date,certificate_number,grandfathered,certified_by),' +
  'instructor_records!instructor_records_person_id_fkey(id,level,status,technique),' +
  'board_service!board_service_person_id_fkey(id,term_label,status,term_start,term_end),' +
  'person_roles(id,role_key,committee_id,committees(name)),' +
  'contact_notes!contact_notes_person_id_fkey(id,text,by_name,created_at),' +
  'practice_locations(id,name,address,phone,website,is_primary)'

const PAID = 'active,current,member,good,good_standing,expired'

/** Everyone on the roster. Two reads, merged: paid members, and anyone who
 *  holds or held a board seat — PostgREST cannot express that OR in one filter. */
export async function roster(): Promise<{ rows: Member[]; error?: string }> {
  const [a, b] = await Promise.all([
    select<Member>('people', `select=${SELECT}&membership_status=in.(${PAID})&limit=1000`),
    select<Member>('people', `select=${SELECT}&person_roles.role_key=in.(board_member,past_board_member,executive_director,past_executive_director)&person_roles=not.is.null&limit=1000`),
  ])
  if (!a.data) return { rows: [], error: a.error ?? 'unknown' }
  const seen = new Map<string, Member>()
  for (const p of [...a.data, ...(b.data ?? [])]) if (!seen.has(p.id)) seen.set(p.id, p)
  // The second read filtered person_roles down to board roles; re-read the
  // full role list for those people so their chips are complete.
  const ids = [...seen.keys()]
  if (ids.length) {
    const r = await select<{ person_id: string; id: number; role_key: string; committee_id: number | null; committees: { name: string } | null }>(
      'person_roles', `select=person_id,id,role_key,committee_id,committees(name)&person_id=in.(${ids.join(',')})&limit=2000`)
    if (r.data) { for (const p of seen.values()) p.person_roles = [] ; for (const x of r.data) seen.get(x.person_id)?.person_roles.push(x) }
  }
  return { rows: [...seen.values()] }
}

/* ------------------------------------------------------------------ derive */
export type State = 'current' | 'recent' | 'inactive' | 'deceased'
const today = () => new Date().toISOString().slice(0, 10)
export const fullName = (p: Member) => `${p.first_name} ${p.last_name}${p.credentials ? ', ' + p.credentials : ''}`
export const activeBoard = (p: Member) => (p.board_service ?? []).some((b) => b.status === 'active')
export const currentInstructor = (p: Member) => (p.instructor_records ?? []).find((i) => i.status === 'current') ?? null
export function state(p: Member): State {
  if (p.deceased_on) return 'deceased'
  if (activeBoard(p)) return 'current'
  const paid = /(active|current|member|good)/.test(p.membership_status ?? '')
  const exp = p.membership_expires
  if (paid && exp && exp >= today()) return 'current'
  if (exp) {
    const days = Math.round((Date.parse(today()) - Date.parse(exp)) / 864e5)
    if (days <= 183) return 'recent'
  }
  return 'inactive'
}
/** The tile a person counts under: the deceased sit inside Inactive. */
export const tabOf = (p: Member) => (state(p) === 'deceased' ? 'inactive' : state(p))
const RANK: Record<string, number> = { student: 1, level_1: 2, level_2: 3 }
export const advoLevel = (p: Member) => (p.person_certifications ?? []).filter((c) => c.technique === 'Advanced Orthogonal').reduce((b, c) => (RANK[c.level] ?? 0) > (RANK[b] ?? 0) ? c.level : b, '')
export const otherCerts = (p: Member) => (p.person_certifications ?? []).filter((c) => c.technique !== 'Advanced Orthogonal')

/* ------------------------------------------------------------------ writes */
export type Profile = Partial<Pick<Member,
  'first_name' | 'last_name' | 'credentials' | 'email' | 'mobile_phone' | 'office_phone' | 'practice_name' | 'practice_address' |
  'practice_website' | 'membership_status' | 'member_since' | 'membership_expires' | 'contact_type' | 'techniques' | 'deceased_on' | 'photo_url'>>

export const saveProfile = (id: string, v: Profile) => patch('people', `id=eq.${id}`, v)
export const createMember = (v: Profile) => insert('people', [{ ...v, membership_status: v.membership_status ?? 'active' }])
export const addNote = (personId: string, text: string, byName: string, byId: string | null) =>
  insert('contact_notes', [{ person_id: personId, text, by_name: byName, by_id: byId }])
export const addLocation = (personId: string, name: string, address: string, website: string) =>
  insert('practice_locations', [{ person_id: personId, name, address, website, is_primary: false }])

/** Ends teaching: the record is kept with a reason; the role that grants the tools is removed. */
export async function endInstructor(p: Member, reason: string) {
  const rec = currentInstructor(p)
  if (rec) { const r = await patch('instructor_records', `id=eq.${rec.id}`, { status: 'ended', end_reason: reason, end_date: today() }); if (r.error) return r }
  return remove('person_roles', `person_id=eq.${p.id}&role_key=eq.instructor`)
}
/** Ends board service: the term closes today, the seat role becomes past. */
export async function endBoard(p: Member) {
  for (const b of (p.board_service ?? []).filter((x) => x.status === 'active')) {
    const r = await patch('board_service', `id=eq.${b.id}`, { status: 'past', term_end: today() }); if (r.error) return r
  }
  const d = await remove('person_roles', `person_id=eq.${p.id}&role_key=eq.board_member`); if (d.error) return d
  if (!(p.person_roles ?? []).some((r) => r.role_key === 'past_board_member')) return insert('person_roles', [{ person_id: p.id, role_key: 'past_board_member' }])
  return { ok: true as const }
}
