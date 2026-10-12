/* ----------------------------------------------------------------------------
 * Certifications — the Advanced Orthogonal register and its writes.
 *
 * Reads people who hold, are pursuing, or are interested in an AdvO level,
 * with their certification rows, requirement progress, notes and practice
 * locations embedded in one request. Every write below maps to exactly one
 * of the tables CCI OS already uses, so both applications stay consistent:
 *
 *   achieved level + date   → person_certifications (+ people.cert_level)
 *   working toward          → people.target_cert_level
 *   interested              → people.cert_interest
 *   a ticked criterion      → person_cert_progress (completed_date, approver)
 *   certify                 → insert person_certifications, set cert_level,
 *                             clear target; progress rows stay as history
 *
 * All of it runs as the signed-in person; RLS decides what they may touch.
 * -------------------------------------------------------------------------- */
import { select, searchSelect, patch, insert, remove, headers, SB_URL, ensureSession } from '@/lib/supabase'

export type Level = 'none' | 'student' | 'level_1' | 'level_2'
export const LEVELS: [Level, string][] = [
  ['none', 'Not certified'], ['student', 'Student Certification'], ['level_1', 'Certified Level 1'], ['level_2', 'Certified Level 2'],
]
export const LEVEL_LABEL: Record<string, string> = {
  none: 'Not certified', student: 'Student Certification', level_1: 'Certified Level 1', level_2: 'Certified Level 2',
  board_certification: 'Board Certified', certified: 'Certified',
}
export const RANK: Record<string, number> = { none: 0, student: 1, level_1: 2, level_2: 3 }
export const NEXT: Record<string, Level | null> = { none: 'level_1', student: 'level_1', level_1: 'level_2', level_2: null }

export type Requirement = { id: number; target_level: string; key: string; label: string; sort: number; applies_to?: string }
export type CertRow = {
  id?: number; technique: string; level: string; cert_date: string | null; certified_by: string | null
  certificate_number: string | null; grandfathered: boolean | null
}
export type ProgressRow = {
  requirement_id: number; completed: boolean; completed_date: string | null; approved_by_name: string | null
}
export type Note = { id: number; text: string; by_name: string | null; created_at: string }
export type Location = { id: number; name: string | null; address: string | null; phone: string | null; website: string | null; is_primary: boolean | null }
export type Person = {
  id: string; first_name: string; last_name: string; credentials: string | null; email: string | null
  office_phone: string | null; mobile_phone: string | null; practice_phone: string | null; practice_name: string | null
  practice_address: string | null; practice_city: string | null; practice_state: string | null
  practice_website: string | null; membership_status: string | null; contact_type: string | null
  techniques: string[] | null; cert_level: string | null; target_cert_level: string | null
  cert_interest: boolean | null
  person_certifications: CertRow[]
  person_cert_progress: ProgressRow[]
  contact_notes: Note[]
  practice_locations: Location[]
}

const PERSON_SELECT =
  'id,first_name,last_name,credentials,email,office_phone,mobile_phone,practice_phone,practice_name,practice_address,' +
  'practice_city,practice_state,practice_website,membership_status,contact_type,techniques,cert_level,' +
  'target_cert_level,cert_interest,' +
  'person_certifications(id,technique,level,cert_date,certified_by,certificate_number,grandfathered),' +
  // Both tables now carry two foreign keys to people (the subject and the
  // approver/author), so the embed must name which one to follow or PostgREST
  // refuses the request as ambiguous.
  'person_cert_progress!person_cert_progress_person_id_fkey(requirement_id,completed,completed_date,approved_by_name),' +
  'contact_notes!contact_notes_person_id_fkey(id,text,by_name,created_at),' +
  'practice_locations(id,name,address,phone,website,is_primary)'

export async function requirements(): Promise<{ rows: Requirement[]; error?: string }> {
  const q = await select<Requirement>('cert_requirements', 'select=id,target_level,key,label,sort,applies_to&order=target_level,sort')
  return q.data ? { rows: q.data } : { rows: [], error: q.error ?? 'unknown' }
}

/** Everyone on the register: holds a level, is working toward one, or is interested. */
export async function register(): Promise<{ rows: Person[]; error?: string }> {
  const q = await select<Person>(
    'people',
    `select=${PERSON_SELECT}&or=(cert_level.neq.none,cert_interest.eq.true,target_cert_level.not.is.null)&order=first_name&limit=1000`,
  )
  return q.data ? { rows: q.data } : { rows: [], error: q.error ?? 'unknown' }
}

/** Directory search for the Add popup — anyone, not just the register. */
export async function searchPeople(term: string): Promise<Person[]> {
  const t = encodeURIComponent(term.trim())
  if (!t) return []
  const q = await searchSelect<Person>('people', term, ['first_name', 'last_name', 'practice_name'], 12, (f, n) => `select=${PERSON_SELECT}&${f}&order=last_name&limit=${n}`)
  return q.data ?? []
}

/* ------------------------------------------------------------------ derive */

export const advo = (p: Person) => (p.person_certifications ?? []).filter((c) => c.technique === 'Advanced Orthogonal')
export const topLevel = (p: Person): Level =>
  advo(p).reduce<Level>((best, c) => (RANK[c.level] ?? -1) > RANK[best]! ? (c.level as Level) : best, 'none')
export const topCert = (p: Person) => { const l = topLevel(p); return advo(p).find((c) => c.level === l) ?? null }
export const otherCerts = (p: Person) => (p.person_certifications ?? []).filter((c) => c.technique !== 'Advanced Orthogonal')
export const bucket = (p: Person): Level | 'interest' | null => {
  const l = topLevel(p)
  if (l !== 'none') return l
  return p.cert_interest || p.target_cert_level ? 'interest' : null
}
export const isMember = (p: Person) => /(active|current|good)/.test(p.membership_status ?? '')
export const fullName = (p: Person) => `${p.first_name} ${p.last_name}${p.credentials ? ', ' + p.credentials : ''}`
export const progressFor = (p: Person, reqs: Requirement[]) => {
  if (!p.target_cert_level) return null
  const list = reqs.filter((r) => r.target_level === p.target_cert_level)
  const done = new Map((p.person_cert_progress ?? []).filter((x) => x.completed).map((x) => [x.requirement_id, x]))
  return { list, done }
}

/* ------------------------------------------------------------------ writes */

export async function setTarget(personId: string, level: Level | null) {
  return patch('people', `id=eq.${personId}`, { target_cert_level: level })
}
export async function setInterest(personId: string, on: boolean) {
  return patch('people', `id=eq.${personId}`, { cert_interest: on })
}

/** Tick or untick a criterion. A tick without a date is allowed (the row is
 *  created) but Certify refuses until every completed row carries a date. */
export async function markRequirement(
  personId: string, requirementId: number, completed: boolean, date: string | null, approverName: string, approverId: string | null,
) {
  await ensureSession()
  const res = await fetch(`${SB_URL}/rest/v1/person_cert_progress?on_conflict=person_id,requirement_id`, {
    method: 'POST',
    headers: { ...headers(true), Prefer: 'resolution=merge-duplicates,return=minimal' },
    body: JSON.stringify([{
      person_id: personId, requirement_id: requirementId, completed,
      completed_date: completed ? date : null,
      approved_by_name: completed ? approverName : null,
      approved_by: completed ? approverId : null,
      updated_at: new Date().toISOString(),
    }]),
  })
  return res.ok ? { ok: true as const } : { error: await res.text() }
}

/** Continue the existing numbering: the largest numeric certificate number plus one. */
export async function nextCertificateNumber(): Promise<string> {
  const q = await select<{ certificate_number: string }>(
    'person_certifications', 'select=certificate_number&certificate_number=not.is.null&limit=2000',
  )
  const max = (q.data ?? []).map((r) => Number(r.certificate_number)).filter((n) => Number.isFinite(n)).reduce((a, b) => Math.max(a, b), 0)
  return String(max + 1)
}

/** Award a level. Inserts the certification, sets people.cert_level, clears the target. */
export async function certify(p: Person, level: Level, byName: string, number?: string) {
  const num = number || (await nextCertificateNumber())
  const today = new Date().toISOString().slice(0, 10)
  const existing = advo(p).find((c) => c.level === level)
  const w = existing
    ? await patch('person_certifications', `id=eq.${existing.id}`, { cert_date: today, certified_by: byName, certificate_number: num, grandfathered: false })
    : await insert('person_certifications', [{ person_id: p.id, technique: 'Advanced Orthogonal', level, cert_date: today, certified_by: byName, certificate_number: num, grandfathered: false }])
  if (w.error) return w
  const u = await patch('people', `id=eq.${p.id}`, { cert_level: level, target_cert_level: null, cert_interest: false })
  return u.error ? u : { ok: true as const, number: num }
}

/** The Add / Override popup: set the achieved level and date directly. */
export async function overrideCertification(
  p: Person, level: Level, date: string | null, number: string | null, byName: string, target: Level | null, interest: boolean,
) {
  if (level === 'none') {
    for (const c of advo(p)) if (c.id) { const r = await remove('person_certifications', `id=eq.${c.id}`); if (r.error) return r }
  } else {
    const existing = advo(p).find((c) => c.level === level)
    const row = { cert_date: date, certificate_number: number || null, certified_by: byName }
    const w = existing
      ? await patch('person_certifications', `id=eq.${existing.id}`, row)
      : await insert('person_certifications', [{ person_id: p.id, technique: 'Advanced Orthogonal', level, grandfathered: false, ...row }])
    if (w.error) return w
    // Anything above the new level is no longer valid.
    for (const c of advo(p)) if (c.id && RANK[c.level]! > RANK[level]!) { const r = await remove('person_certifications', `id=eq.${c.id}`); if (r.error) return r }
  }
  return patch('people', `id=eq.${p.id}`, { cert_level: level, target_cert_level: target, cert_interest: interest })
}

export async function addNote(personId: string, text: string, byName: string, byId: string | null) {
  return insert('contact_notes', [{ person_id: personId, text, by_name: byName, by_id: byId }])
}
