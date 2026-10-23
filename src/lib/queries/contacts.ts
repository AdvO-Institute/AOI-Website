/* ----------------------------------------------------------------------------
 * Contacts — everyone in `people`, with everything attached to them.
 *
 * A lead, a member and an expired member are the same row at different
 * points in membership_status / membership_expires, so this reads the whole
 * table (one request, embedded relations) and derives the tile from the row.
 * Writes are plain column updates on `people`, plus rows in
 * `practice_locations` (extra offices), `person_roles` and `contact_notes`.
 * RLS decides who may: board, the executive director and the membership
 * committee chair (is_membership_manager) read and write; everyone else
 * only sees themselves.
 * -------------------------------------------------------------------------- */
import { select, patch, insert, remove, headers, SB_URL, ensureSession, rpcResult, searchSelect } from '@/lib/supabase'

export const TECHNIQUES = ['Advanced Orthogonal', 'Atlas Orthogonal', 'Atlas Orthometrics', 'Orthospinology', 'EPIC', 'NUCCA', 'Blair']
export const ROLE_LABEL: Record<string, string> = {
  executive_director: 'Executive Director', past_executive_director: 'Past Executive Director', board_member: 'Director',
  past_board_member: 'Past Director', board_chair: 'Chair of the Board', vice_chair: 'Vice Chair', secretary: 'Secretary', treasurer: 'Treasurer', instructor: 'Instructor', committee_chair: 'Chair', committee_cochair: 'Co-chair',
  committee_member: 'Committee Member', research_director: 'Research Director',
}
export const LEVEL_LABEL: Record<string, string> = { none: '', student: 'Student Certification', level_1: 'Certified Level 1', level_2: 'Certified Level 2', board_certification: 'Board Certified', certified: 'Certified' }
const RANK: Record<string, number> = { none: 0, student: 1, level_1: 2, level_2: 3 }

export type Cert = { id: number; technique: string; level: string; cert_date: string | null; certificate_number: string | null; grandfathered: boolean | null; certified_by: string | null }
export type Instr = { id: number; level: string | null; status: string | null; technique: string | null; instructor_date: string | null }
export type Board = { id: number; term_label: string | null; status: string | null; term_start: string | null; term_end: string | null }
export type Role = { id: number; role_key: string; committee_id: number | null; instructor_level: string | null; committees: { name: string } | null }
export type Note = { id: number; text: string; by_name: string | null; created_at: string }
export type Office = { id?: number; person_id?: string; name: string | null; address: string | null; city: string | null; state: string | null; zip: string | null; phone: string | null; website: string | null; is_primary: boolean | null; is_internship_site: boolean; is_seminar_venue: boolean; sort?: number }
export type Committee = { id: number; key: string; name: string }

export type Contact = {
  id: string; first_name: string; last_name: string; credentials: string | null; title: string | null; email: string | null
  personal_phone: string | null; mobile_phone: string | null; office_phone: string | null
  practice_name: string | null; practice_address: string | null; practice_city: string | null; practice_state: string | null; practice_zip: string | null
  practice_phone: string | null; practice_website: string | null
  membership_status: string | null; member_since: string | null; membership_expires: string | null
  contact_type: string | null; techniques: string[] | null; cert_level: string | null; instructor_status: string | null
  alma_mater: string | null; grad_year: number | null; npi: string | null; bio: string | null; photo_url: string | null
  notes: string | null; deceased_on: string | null; profile_completed: boolean | null; auth_user_id: string | null
  person_certifications: Cert[]; instructor_records: Instr[]; board_service: Board[]
  person_roles: Role[]; contact_notes: Note[]; practice_locations: Office[]
  /** Read separately (vendorDetails) and merged in, so the list still loads before the database has these fields. */
  is_vendor?: boolean | null; vendor_company?: string | null; vendor_services?: string | null; vendor_website?: string | null; vendor_notes?: string | null
}

const SELECT =
  'id,first_name,last_name,credentials,title,email,personal_phone,mobile_phone,office_phone,practice_name,practice_address,' +
  'practice_city,practice_state,practice_zip,practice_phone,practice_website,membership_status,member_since,membership_expires,' +
  'contact_type,techniques,cert_level,instructor_status,alma_mater,grad_year,npi,bio,photo_url,notes,deceased_on,profile_completed,auth_user_id,' +
  'person_certifications(id,technique,level,cert_date,certificate_number,grandfathered,certified_by),' +
  'instructor_records!instructor_records_person_id_fkey(id,level,status,technique,instructor_date),' +
  'board_service!board_service_person_id_fkey(id,term_label,status,term_start,term_end),' +
  'person_roles(id,role_key,committee_id,instructor_level,committees(name)),' +
  'contact_notes!contact_notes_person_id_fkey(id,text,by_name,created_at),' +
  'practice_locations(id,name,address,city,state,zip,phone,website,is_primary,is_internship_site,is_seminar_venue,sort)'

/* ------------------------------------------------------------------ reads */

export async function everyone(): Promise<{ rows: Contact[]; error?: string }> {
  // PostgREST caps a page at 1000 by default; the table is 616 today. Page anyway so it never silently truncates.
  const out: Contact[] = []
  for (let from = 0; ; from += 1000) {
    await ensureSession()
    const res = await fetch(`${SB_URL}/rest/v1/people?select=${SELECT}&order=first_name.asc,last_name.asc`, { headers: { ...headers(), Range: `${from}-${from + 999}` } })
    if (!res.ok) return { rows: out, error: await res.text() }
    const page = (await res.json()) as Contact[]
    out.push(...page)
    if (page.length < 1000) break
  }
  return { rows: out }
}

const PAID_STATUSES = 'active,current,member,good,good_standing,expired'
const BOARD_ROLES = 'board_member,past_board_member,executive_director,past_executive_director'

/** Members only — paid (now or before) or on the board, now or before. For the
 *  committee chairs who use the Directory but do not see leads. Two reads,
 *  merged: PostgREST cannot express that OR across an embedded table. */
export async function membersOnly(): Promise<{ rows: Contact[]; error?: string }> {
  const [a, b] = await Promise.all([
    select<Contact>('people', `select=${SELECT}&membership_status=in.(${PAID_STATUSES})&limit=2000`),
    select<{ id: string }>('people', `select=id,person_roles!inner(role_key)&person_roles.role_key=in.(${BOARD_ROLES})&limit=2000`),
  ])
  if (!a.data) return { rows: [], error: a.error ?? 'unknown' }
  const seen = new Map(a.data.map((p) => [p.id, p]))
  const missing = (b.data ?? []).map((x) => x.id).filter((id) => !seen.has(id))
  if (missing.length) { const c = await select<Contact>('people', `select=${SELECT}&id=in.(${missing.join(',')})&limit=2000`); for (const p of c.data ?? []) seen.set(p.id, p) }
  return { rows: [...seen.values()] }
}

export type Vendor = Required<Pick<Contact, 'is_vendor' | 'vendor_company' | 'vendor_services' | 'vendor_website' | 'vendor_notes'>> & { id: string }
/** Everyone marked as a vendor. `ready` is false until the database has the vendor fields. */
export async function vendorDetails(): Promise<{ rows: Vendor[]; ready: boolean }> {
  const r = await select<Vendor>('people', 'select=id,is_vendor,vendor_company,vendor_services,vendor_website,vendor_notes&is_vendor=is.true&limit=2000')
  return { rows: r.data ?? [], ready: !!r.data }
}
export const saveVendor = (id: string, v: Omit<Vendor, 'id'>) => patch('people', `id=eq.${id}`, v)

/** One person with everything attached. */
export async function contactById(id: string): Promise<{ row: Contact | null; error?: string }> {
  const r = await select<Contact>('people', `select=${SELECT}&id=eq.${encodeURIComponent(id)}&limit=1`)
  return r.data ? { row: r.data[0] ?? null } : { row: null, error: r.error ?? 'unknown' }
}

export async function committees(): Promise<Committee[]> {
  const r = await select<Committee>('committees', 'select=id,key,name&order=name.asc')
  return r.data ?? []
}

/* ----------------------------------------------------------------- derive */

export type State = 'lead' | 'member' | 'expired' | 'deceased'
export const fullName = (p: Pick<Contact, 'first_name' | 'last_name' | 'credentials'>) => `${p.first_name} ${p.last_name}${p.credentials ? ', ' + p.credentials : ''}`
export const activeBoard = (p: Contact) => (p.board_service ?? []).some((b) => b.status === 'active') || (p.person_roles ?? []).some((r) => r.role_key === 'board_member')
export const currentInstructor = (p: Contact) => (p.instructor_records ?? []).find((i) => i.status === 'current') ?? null
const PAID = /(current|active|good|member)/i
export function state(p: Contact, now = new Date()): State {
  if (p.deceased_on) return 'deceased'
  if (activeBoard(p)) return 'member'
  const paid = PAID.test(p.membership_status ?? '')
  const exp = p.membership_expires ? new Date(p.membership_expires + 'T12:00:00Z') : null
  if (paid && (!exp || exp >= now)) return 'member'
  if (paid || p.membership_status === 'expired' || p.member_since || p.membership_expires) return 'expired'
  return 'lead'
}
export type Tab = 'all' | 'lead' | 'member' | 'expired'
export const tabOf = (p: Contact): Exclude<Tab, 'all'> => { const s = state(p); return s === 'deceased' ? 'expired' : s }
export const duesLapsed = (p: Contact, now = new Date()) => !!p.membership_expires && new Date(p.membership_expires + 'T12:00:00Z') < now
export const advoLevel = (p: Contact) => (p.person_certifications ?? []).filter((c) => c.technique === 'Advanced Orthogonal').reduce((b, c) => (RANK[c.level] ?? 0) > (RANK[b] ?? 0) ? c.level : b, p.cert_level && p.cert_level !== 'none' ? p.cert_level : '')
export const otherCerts = (p: Contact) => (p.person_certifications ?? []).filter((c) => c.technique !== 'Advanced Orthogonal')
export const initials = (p: Pick<Contact, 'first_name' | 'last_name'>) => `${(p.first_name ?? '?')[0] ?? ''}${(p.last_name ?? '?')[0] ?? ''}`.toUpperCase()

/* ----------------------------------------------------------------- writes */

export type Profile = Partial<Pick<Contact,
  'first_name' | 'last_name' | 'credentials' | 'title' | 'email' | 'personal_phone' | 'mobile_phone' | 'office_phone' |
  'practice_name' | 'practice_address' | 'practice_city' | 'practice_state' | 'practice_zip' | 'practice_phone' | 'practice_website' |
  'membership_status' | 'member_since' | 'membership_expires' | 'contact_type' | 'techniques' | 'alma_mater' | 'grad_year' | 'npi' |
  'bio' | 'photo_url' | 'deceased_on'>>

/** Blanks become nulls so a cleared field clears the column. */
export function clean(v: Profile): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  for (const [k, x] of Object.entries(v)) out[k] = x === '' || x === undefined ? null : x
  return out
}

export const saveProfile = (id: string, v: Profile) => patch('people', `id=eq.${id}`, clean(v))

export async function createContact(v: Profile): Promise<{ id?: string; error?: string }> {
  await ensureSession()
  const res = await fetch(`${SB_URL}/rest/v1/people?select=id`, {
    method: 'POST', headers: { ...headers(true), Prefer: 'return=representation' },
    body: JSON.stringify({ ...clean(v), membership_status: v.membership_status || 'never', contact_type: v.contact_type || 'doctor' }),
  })
  if (!res.ok) return { error: await res.text() }
  const rows = (await res.json()) as { id: string }[]
  return { id: rows[0]?.id }
}

export const addNote = (personId: string, text: string, byName: string, byId: string | null) =>
  insert('contact_notes', [{ person_id: personId, text, by_name: byName, by_id: byId }])

/** Replace the extra offices for a person (the primary office lives on the people row). */
export async function saveOffices(personId: string, list: Office[]): Promise<{ ok?: true; error?: string }> {
  const d = await remove('practice_locations', `person_id=eq.${personId}`)
  if (d.error) return d
  const rows = list.filter((o) => (o.name ?? '').trim() || (o.address ?? '').trim()).map((o, i) => ({
    person_id: personId, name: o.name || null, address: o.address || null, city: o.city || null, state: o.state || null, zip: o.zip || null,
    phone: o.phone || null, website: o.website || null, is_primary: false, is_internship_site: !!o.is_internship_site, is_seminar_venue: !!o.is_seminar_venue, sort: i,
  }))
  return insert('practice_locations', rows)
}

export type Seat = { role_key: string; committee_id: number | null }
/** Replace a person's roles. Oversight only (RLS); the panel hides the controls otherwise. */
export async function saveRoles(personId: string, seats: Seat[], keepInstructorLevel: string | null): Promise<{ ok?: true; error?: string }> {
  const d = await remove('person_roles', `person_id=eq.${personId}`)
  if (d.error) return d
  const rows = seats.map((s) => ({ person_id: personId, role_key: s.role_key, committee_id: s.committee_id, instructor_level: s.role_key === 'instructor' ? keepInstructorLevel : null }))
  return insert('person_roles', rows)
}

/* Merging two records for the same person, and deleting a record. Both are
 * database functions on the Supabase side (merge_people, delete_person) that
 * check the caller is Board or full admin and do the work in one step: a merge
 * moves every registration, payment, role, note and the login onto the record
 * kept, fills its blanks, then removes the other; a delete refuses a record
 * with history. Until they exist, `missing` says so. */
export type PeopleOp = { ok: boolean; error?: string; missing?: boolean }
async function peopleOp(name: string, args: Record<string, unknown>): Promise<PeopleOp> {
  const r = await rpcResult(name, args)
  if (!r.error) return { ok: true }
  const missing = r.status === 404 || /PGRST202|Could not find the function/i.test(r.error)
  let msg = r.error
  try { msg = (JSON.parse(r.error) as { message?: string }).message ?? msg } catch { /* plain text */ }
  return { ok: false, error: msg, missing }
}
export const mergePeople = (keep: string, drop: string) => peopleOp('merge_people', { p_keep: keep, p_drop: drop })
export const deletePerson = (id: string) => peopleOp('delete_person', { p_id: id })

/** Name search for the merge picker, with enough to tell two records apart. */
export type MergeHit = { id: string; first_name: string | null; last_name: string | null; credentials: string | null; email: string | null; membership_status: string | null; practice_city: string | null; auth_user_id: string | null }
export async function findPeople(q: string): Promise<MergeHit[]> {
  const t = q.trim().replace(/[,.*()]/g, '')
  if (t.length < 2) return []
  const r = await searchSelect<MergeHit>('people', t, ['first_name', 'last_name'], 8, (f, n) => `select=id,first_name,last_name,credentials,email,membership_status,practice_city,auth_user_id&${f}&order=last_name.asc&limit=${n}`)
  return r.data ?? []
}
