/* ----------------------------------------------------------------------------
 * Internships — preceptors (approved people), sites (approved places),
 * school approvals (preceptor × school × site × period), interns and the
 * internship → certification-pathway sync.
 *
 * Every table here already existed in CCI OS; the website adds columns,
 * never renames. Checklists are stored the way CCI OS stores them:
 *   progress[key] = { completed: true, date, name }   (who locked it in)
 * -------------------------------------------------------------------------- */
import { select, searchSelect, patch, insert, remove, headers, SB_URL, ensureSession } from '@/lib/supabase'
import { markRequirement, requirements as loadRequirements } from './certifications'
import type { Requirement } from './certifications'

export type Who = { name: string; id: string | null }
export type Stamp = { completed: true; date: string; name: string }
export type Stamps = Record<string, Stamp | undefined>

export type PersonLite = {
  id: string; first_name: string; last_name: string; credentials: string | null; contact_type: string | null
  school: string | null; school_id: number | null; grad_year: number | null; email: string | null
  practice_name: string | null; practice_city: string | null; practice_state: string | null
  cert_level: string | null; target_cert_level: string | null; membership_status: string | null
  person_certifications?: { technique: string; level: string }[]
}
export type Site = {
  id: number; name: string; address: string | null; city: string | null; state: string | null; phone: string | null
  person_id: string | null; is_internship_site: boolean | null; is_seminar_venue: boolean | null
  internship_status: 'pending' | 'approved' | null; site_visit_date: string | null; approved_date: string | null; notes: string | null
}
export type Approval = {
  id?: number; preceptor_id?: number; college_id: number; location_id: number | null; approved_on: string | null; expires_on: string | null
  document_path?: string | null; document_name?: string | null; notes?: string | null; created_by_name?: string | null
}
export type Preceptor = {
  id: number; person_id: string | null; person_name: string | null; status: 'in_process' | 'certified'; certified_date: string | null
  clean_record: boolean | null; progress: Stamps | null; approval: Stamps | null; notes: string | null
  people: PersonLite | null; preceptor_sites: { location_id: number }[]; preceptor_colleges: Approval[]
}
export type Intern = {
  id: number; person_id: string | null; person_name: string | null; preceptor_id: number | null; preceptor_name: string | null
  status: 'planned' | 'current' | 'past'; start_date: string | null; end_date: string | null; completed_date: string | null
  certified_by: string | null; progress: Stamps | null; location_id: number | null
  paired_at: string | null; paired_by_name: string | null; official: boolean; started_by_name: string | null
  people: PersonLite | null
}
export type College = { id: number; name: string; short_name: string | null; city: string | null; state: string | null; country: string | null; active_partnership: boolean | null }
export type Note = { id: number; text: string; by_name: string | null; created_at: string }

/* ---- criteria (labels straight from P&P 7.1 / 7.2 / 3.6.4) ------------------- */
export const PREC_CRITERIA: { key: string; label: string; auto?: true }[] = [
  { key: 'prec_l2', label: 'Level 2 Certification', auto: true },
  { key: 'prec_pv', label: 'Minimum 80 patient visits / week' },
  { key: 'prec_ttt', label: 'Trained via Train the Trainer (Internship Program)' },
  { key: 'prec_college', label: 'Meets the intern’s chiropractic college requirements' },
  { key: 'prec_agreement', label: 'Signed Internship agreement with the Institute' },
]
export const PREC_APPROVAL: { key: string; label: string }[] = [
  { key: 'app_received', label: 'Application received by the Internship Committee chair' },
  { key: 'site_visit', label: 'Site visit completed (in person or virtual)' },
  { key: 'board_presented', label: 'Candidate presented to the Board' },
  { key: 'board_approved', label: 'Approved by the Board · added to the preceptor registry' },
]
export const INT_CRITERIA: { key: string; label: string; sync?: 'exam' }[] = [
  { key: 'int_training', label: 'Completed internship training (all AdvO procedure components)' },
  { key: 'int_exam', label: 'Passed the Advanced Orthogonal Basic Examination', sync: 'exam' },
  { key: 'int_letter', label: 'Preceptor summary letter filed with Certification Committee' },
]

/* ---- reads ------------------------------------------------------------------- */
const PERSON = 'id,first_name,last_name,credentials,contact_type,school,school_id,grad_year,email,practice_name,practice_city,practice_state,cert_level,target_cert_level,membership_status,person_certifications(technique,level)'

export async function preceptors(): Promise<{ rows: Preceptor[]; error?: string }> {
  const q = await select<Preceptor>('preceptors', `select=*,people!preceptors_person_id_fkey(${PERSON}),preceptor_sites(location_id),preceptor_colleges(id,preceptor_id,college_id,location_id,approved_on,expires_on,document_path,document_name,notes,created_by_name)&order=status,person_name&limit=1000`)
  return q.data ? { rows: q.data } : { rows: [], error: q.error ?? 'unknown' }
}
export async function interns(): Promise<{ rows: Intern[]; error?: string }> {
  const q = await select<Intern>('interns', `select=*,people!interns_person_id_fkey(${PERSON})&order=start_date.desc.nullslast&limit=1000`)
  return q.data ? { rows: q.data } : { rows: [], error: q.error ?? 'unknown' }
}
export async function sites(): Promise<{ rows: Site[]; error?: string }> {
  const q = await select<Site>('locations', 'select=id,name,address,city,state,phone,person_id,is_internship_site,is_seminar_venue,internship_status,site_visit_date,approved_date,notes&is_internship_site=eq.true&order=name&limit=1000')
  return q.data ? { rows: q.data } : { rows: [], error: q.error ?? 'unknown' }
}
/** Every location, for "make this existing place a site" and to keep the one list entered once. */
export async function allLocations(): Promise<Site[]> {
  const q = await select<Site>('locations', 'select=id,name,address,city,state,phone,person_id,is_internship_site,is_seminar_venue,internship_status,site_visit_date,approved_date,notes&order=name&limit=2000')
  return q.data ?? []
}
export async function colleges(): Promise<College[]> {
  const q = await select<College>('colleges', 'select=id,name,short_name,city,state,country,active_partnership&order=name&limit=500')
  return q.data ?? []
}
export const requirements = loadRequirements
export async function notesFor(personId: string): Promise<Note[]> {
  const q = await select<Note>('contact_notes', `select=id,text,by_name,created_at&person_id=eq.${personId}&order=created_at.desc&limit=200`)
  return q.data ?? []
}
export async function searchPeople(term: string, doctorsOnly = false): Promise<PersonLite[]> {
  const t = encodeURIComponent(term.trim())
  if (!t) return []
  const q = await searchSelect<PersonLite>('people', term, ['first_name', 'last_name', 'practice_name'], 12, (f, n) => `select=${PERSON}&${f}${doctorsOnly ? '&contact_type=eq.doctor' : ''}&order=last_name&limit=${n}`)
  return q.data ?? []
}
export async function practiceOffices(personId: string): Promise<{ id: number; name: string | null; address: string | null; city: string | null; state: string | null; phone: string | null }[]> {
  const q = await select<{ id: number; name: string | null; address: string | null; city: string | null; state: string | null; phone: string | null }>('practice_locations', `select=id,name,address,city,state,phone&person_id=eq.${personId}&order=is_primary.desc,sort`)
  return q.data ?? []
}

/* ---- derive ------------------------------------------------------------------ */
const today = () => new Date().toISOString().slice(0, 10)
export const fullName = (p: PersonLite | null | undefined, fallback?: string | null) => p ? `${p.first_name} ${p.last_name}${p.credentials ? ', ' + p.credentials : ''}` : (fallback ?? '—')
export const initials = (p: PersonLite | null | undefined, fallback?: string | null) => (p ? `${p.first_name?.[0] ?? ''}${p.last_name?.[0] ?? ''}` : (fallback ?? '?').split(/\s+/).map((w) => w[0]).join('').slice(0, 2)).toUpperCase()
const RANK: Record<string, number> = { none: 0, student: 1, level_1: 2, level_2: 3 }
export const advoLevel = (p: PersonLite | null | undefined): string => {
  const fromCerts = (p?.person_certifications ?? []).filter((c) => c.technique === 'Advanced Orthogonal').reduce((b, c) => ((RANK[c.level] ?? -1) > (RANK[b] ?? -1) ? c.level : b), 'none')
  return (RANK[fromCerts] ?? 0) >= (RANK[p?.cert_level ?? 'none'] ?? 0) ? fromCerts : (p?.cert_level ?? 'none')
}
export const hasLevel2 = (p: PersonLite | null | undefined) => advoLevel(p) === 'level_2'
export const LEVEL_LABEL: Record<string, string> = { none: 'Not certified', student: 'Student Certification', level_1: 'Certified Level 1', level_2: 'Certified Level 2' }
/** Which certification pathway an internship feeds; null when already Level 1 / Level 2. */
export function pathwayOf(p: PersonLite | null | undefined): 'student' | 'level_1' | null {
  const l = advoLevel(p)
  if (l === 'level_1' || l === 'level_2') return null
  return p?.contact_type === 'student' && l !== 'student' ? 'student' : 'level_1'
}
export const pathwayKeys = (path: 'student' | 'level_1') => path === 'student' ? { training: 's_training', exam: 's_basic_exam' } : { training: 'l1_training_pathway', exam: 'l1_basic_exam' }

export const precDone = (p: Preceptor) => PREC_CRITERIA.filter((c) => c.auto ? hasLevel2(p.people) : !!p.progress?.[c.key]?.completed).length
export const precReady = (p: Preceptor) => precDone(p) === PREC_CRITERIA.length
export const intDone = (i: Intern) => INT_CRITERIA.filter((c) => !!i.progress?.[c.key]?.completed).length
export const intReady = (i: Intern) => intDone(i) === INT_CRITERIA.length
export const isPaired = (i: Intern) => !!i.preceptor_id && !!i.location_id

export type ApprovalStatus = 'pending' | 'active' | 'expiring' | 'lapsed'
export function approvalStatus(a: Approval, asOf = today()): ApprovalStatus {
  if (!a.approved_on) return 'pending'
  if (a.expires_on && a.expires_on < asOf) return 'lapsed'
  if (a.approved_on > asOf) return 'pending'
  if (a.expires_on) { const d = (new Date(a.expires_on + 'T12:00:00Z').getTime() - new Date(asOf + 'T12:00:00Z').getTime()) / 86400000; if (d <= 90) return 'expiring' }
  return 'active'
}
export const approvalCovers = (a: Approval, asOf: string) => !!a.approved_on && a.approved_on <= asOf && (!a.expires_on || a.expires_on >= asOf)
export const lapsedApprovals = (p: Preceptor) => (p.preceptor_colleges ?? []).filter((a) => approvalStatus(a) === 'lapsed')
export const recordClean = (p: Preceptor) => p.clean_record !== false && lapsedApprovals(p).length === 0
export const fmtD = (iso: string | null | undefined) => iso ? new Date(iso + 'T12:00:00Z').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : ''
export const fmtTs = (iso: string) => new Date(iso).toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' })
export function approvalLine(a: Approval): string {
  const st = approvalStatus(a)
  if (st === 'pending') return a.approved_on ? `starts ${fmtD(a.approved_on)}` : 'pending school approval'
  if (st === 'lapsed') return `lapsed ${fmtD(a.expires_on)}`
  if (st === 'expiring') return `expires ${fmtD(a.expires_on)} · renew`
  return `approved ${fmtD(a.approved_on)}${a.expires_on ? ' – ' + fmtD(a.expires_on) : ' · no end date'}`
}

/* ---- writes: preceptors ------------------------------------------------------- */
const stamp = (date: string, who: Who): Stamp => ({ completed: true, date, name: who.name })

export async function tickPreceptor(p: Preceptor, field: 'progress' | 'approval', key: string, on: boolean, date: string, who: Who) {
  const cur = { ...(p[field] ?? {}) } as Record<string, Stamp | undefined>
  if (on) cur[key] = stamp(date, who); else delete cur[key]
  return patch('preceptors', `id=eq.${p.id}`, { [field]: cur })
}
export async function certifyPreceptor(p: Preceptor, date: string, who: Who) {
  const approval = { ...(p.approval ?? {}) } as Record<string, Stamp | undefined>
  if (!approval.board_approved) approval.board_approved = stamp(date, who)
  return patch('preceptors', `id=eq.${p.id}`, { status: 'certified', certified_date: date, approval })
}
export type PreceptorInput = { person: PersonLite; status: 'in_process' | 'certified'; clean_record: boolean; notes: string; siteIds: number[]; approvals: Approval[] }
/** Create or update a preceptor, then make the sites and school approvals match the form. */
export async function savePreceptor(id: number | null, v: PreceptorInput, existing: Preceptor | null, who: Who): Promise<{ ok?: true; id?: number; error?: string }> {
  await ensureSession()
  const row: Record<string, unknown> = { person_id: v.person.id, person_name: fullName(v.person), status: v.status, clean_record: v.clean_record, notes: v.notes || null }
  if (v.status === 'certified' && !existing?.certified_date) row.certified_date = today()
  let pid = id
  if (pid) { const r = await patch('preceptors', `id=eq.${pid}`, row); if (r.error) return r }
  else {
    const res = await fetch(`${SB_URL}/rest/v1/preceptors`, { method: 'POST', headers: { ...headers(true), Prefer: 'return=representation' }, body: JSON.stringify([{ ...row, progress: {}, approval: {}, colleges: [] }]) })
    if (!res.ok) return { error: await res.text() }
    pid = (((await res.json()) as { id: number }[])[0]?.id ?? 0)
  }
  // sites
  const had = new Set((existing?.preceptor_sites ?? []).map((s) => s.location_id)); const want = new Set(v.siteIds)
  for (const s of had) if (!want.has(s)) { const r = await remove('preceptor_sites', `preceptor_id=eq.${pid}&location_id=eq.${s}`); if (r.error) return r }
  const addSites = [...want].filter((s) => !had.has(s)).map((location_id) => ({ preceptor_id: pid, location_id }))
  if (addSites.length) { const r = await insert('preceptor_sites', addSites); if (r.error) return r }
  // school approvals: keep ids, update changed, add new, delete removed
  const keep = new Set(v.approvals.filter((a) => a.id).map((a) => a.id))
  for (const a of existing?.preceptor_colleges ?? []) if (a.id && !keep.has(a.id)) { const r = await remove('preceptor_colleges', `id=eq.${a.id}`); if (r.error) return r }
  for (const a of v.approvals) {
    const body = { college_id: a.college_id, location_id: a.location_id, approved_on: a.approved_on || null, expires_on: a.expires_on || null, notes: a.notes || null }
    const r = a.id ? await patch('preceptor_colleges', `id=eq.${a.id}`, body) : await insert('preceptor_colleges', [{ ...body, preceptor_id: pid, created_by_id: who.id, created_by_name: who.name }])
    if (r.error) return r
  }
  // keep the denormalized colleges list CCI OS reads
  const cols = [...new Map(v.approvals.map((a) => [a.college_id, { id: a.college_id }])).values()]
  const r2 = await patch('preceptors', `id=eq.${pid}`, { colleges: cols })
  if (r2.error) return r2
  return { ok: true, id: pid }
}
export const removePreceptor = (id: number) => remove('preceptors', `id=eq.${id}`)

/* ---- writes: sites --------------------------------------------------------------- */
export type SiteInput = { name: string; address: string; city: string; state: string; phone: string; person_id: string | null; internship_status: 'pending' | 'approved'; site_visit_date: string; notes: string }
export async function saveSite(id: number | null, v: SiteInput, existing: Site | null): Promise<{ ok?: true; id?: number; error?: string }> {
  await ensureSession()
  const row: Record<string, unknown> = { name: v.name, address: v.address || null, city: v.city || null, state: v.state || null, phone: v.phone || null, person_id: v.person_id, is_internship_site: true, internship_status: v.internship_status, site_visit_date: v.site_visit_date || null, notes: v.notes || null }
  if (v.internship_status === 'approved' && !existing?.approved_date) row.approved_date = today()
  if (v.internship_status === 'pending') row.approved_date = null
  if (id) { const r = await patch('locations', `id=eq.${id}`, row); return r.error ? r : { ok: true, id } }
  const res = await fetch(`${SB_URL}/rest/v1/locations`, { method: 'POST', headers: { ...headers(true), Prefer: 'return=representation' }, body: JSON.stringify([{ ...row, loc_type: 'clinic', active: true }]) })
  if (!res.ok) return { error: await res.text() }
  return { ok: true, id: (((await res.json()) as { id: number }[])[0]?.id ?? 0) }
}
/** Flag an existing location (a seminar venue, say) as an internship site too — entered once. */
export const makeSite = (locationId: number) => patch('locations', `id=eq.${locationId}`, { is_internship_site: true, internship_status: 'pending' })
export const unmakeSite = (locationId: number) => patch('locations', `id=eq.${locationId}`, { is_internship_site: false, internship_status: null })

/* ---- writes: interns --------------------------------------------------------------- */
export async function createContact(name: string, type: 'student' | 'doctor', school: College | null, gradYear: number | null): Promise<{ person?: PersonLite; error?: string }> {
  await ensureSession()
  const parts = name.trim().split(/\s+/); const first = parts.shift() ?? name; const last = parts.join(' ')
  const res = await fetch(`${SB_URL}/rest/v1/people?select=${PERSON}`, { method: 'POST', headers: { ...headers(true), Prefer: 'return=representation' }, body: JSON.stringify([{ first_name: first, last_name: last, contact_type: type, membership_status: 'never', school: school?.name ?? null, school_id: school?.id ?? null, grad_year: gradYear }]) })
  if (!res.ok) return { error: await res.text() }
  return { person: ((await res.json()) as PersonLite[])[0] }
}
export async function updateContactSchool(personId: string, type: 'student' | 'doctor', school: College | null, gradYear: number | null) {
  return patch('people', `id=eq.${personId}`, { contact_type: type, school: school?.name ?? null, school_id: school?.id ?? null, grad_year: gradYear })
}
export type InternInput = { person: PersonLite; preceptor: Preceptor | null; location_id: number | null; status: 'planned' | 'current' | 'past'; start_date: string; end_date: string; official: boolean }
export async function saveIntern(id: number | null, v: InternInput, who: Who): Promise<{ ok?: true; error?: string }> {
  const row: Record<string, unknown> = {
    person_id: v.person.id, person_name: fullName(v.person), preceptor_id: v.preceptor?.id ?? null, preceptor_name: v.preceptor ? fullName(v.preceptor.people, v.preceptor.person_name) : null,
    location_id: v.location_id, status: v.status, start_date: v.start_date || null, end_date: v.end_date || null, official: v.official,
  }
  if (v.preceptor && v.location_id && !id) { row.paired_at = today(); row.paired_by_id = who.id; row.paired_by_name = who.name }
  if (!v.preceptor) { row.paired_at = null; row.paired_by_id = null; row.paired_by_name = null }
  const r = id ? await patch('interns', `id=eq.${id}`, row) : await insert('interns', [{ ...row, progress: {}, notes_log: [] }])
  if (r.error) return r
  if (v.status !== 'planned') await ensurePathway(v.person)
  return { ok: true }
}
export const removeIntern = (id: number) => remove('interns', `id=eq.${id}`)
export async function pairIntern(i: Intern, p: Preceptor, locationId: number, start: string | null, date: string, official: boolean, who: Who) {
  const r = await patch('interns', `id=eq.${i.id}`, { preceptor_id: p.id, preceptor_name: fullName(p.people, p.person_name), location_id: locationId, start_date: start, paired_at: date, paired_by_id: who.id, paired_by_name: who.name, official })
  if (r.error) return r
  if (i.person_id) await addNote(i.person_id, `Paired with ${fullName(p.people, p.person_name)} for an ${official ? 'official' : 'unaffiliated'} internship${start ? ' starting ' + fmtD(start) : ''}.`, who)
  return r
}
export const unpairIntern = (i: Intern) => patch('interns', `id=eq.${i.id}`, { preceptor_id: null, preceptor_name: null, location_id: null, paired_at: null, paired_by_id: null, paired_by_name: null })
/** Anyone in an internship is active on the matching certification pathway. No-op once Level 1 / 2. */
async function ensurePathway(p: PersonLite) {
  const path = pathwayOf(p)
  if (path && p.target_cert_level !== path) await patch('people', `id=eq.${p.id}`, { target_cert_level: path })
}
export async function startInternship(i: Intern, date: string, who: Who) {
  const r = await patch('interns', `id=eq.${i.id}`, { status: 'current', start_date: date, started_by_name: who.name })
  if (r.error) return r
  if (i.people) await ensurePathway(i.people)
  return r
}
/** Tick an intern criterion. Locking the exam also ticks the exam requirement on the person's pathway. */
export async function tickIntern(i: Intern, key: string, on: boolean, date: string, who: Who, reqs: Requirement[]) {
  const cur = { ...(i.progress ?? {}) } as Record<string, Stamp | undefined>
  if (on) cur[key] = stamp(date, who); else delete cur[key]
  const r = await patch('interns', `id=eq.${i.id}`, { progress: cur })
  if (r.error) return r
  if (on && key === 'int_exam') await syncPathway(i, 'exam', date, who, reqs)
  return r
}
export async function completeInternship(i: Intern, date: string, who: Who, reqs: Requirement[]) {
  const r = await patch('interns', `id=eq.${i.id}`, { status: 'past', completed_date: date, end_date: date, certified_by: who.name })
  if (r.error) return r
  await syncPathway(i, 'training', date, who, reqs)
  return r
}
/** Write the matching person_cert_progress row — same date, same verifier. Returns the requirement label written, if any. */
export async function syncPathway(i: Intern, which: 'exam' | 'training', date: string, who: Who, reqs: Requirement[]): Promise<string | null> {
  if (!i.people || !i.person_id) return null
  const path = pathwayOf(i.people); if (!path) return null
  const key = pathwayKeys(path)[which]
  const req = reqs.find((r) => r.key === key); if (!req) return null
  await ensurePathway(i.people)
  const r = await markRequirement(i.person_id, req.id, true, date, who.name, who.id)
  return r.error ? null : req.label
}
export const addNote = (personId: string, text: string, who: Who) => insert('contact_notes', [{ person_id: personId, text, by_name: who.name, by_id: who.id }])

/* ---- paperwork: private bucket --------------------------------------------------- */
export async function uploadApprovalDoc(a: Approval, file: File): Promise<{ ok?: true; error?: string }> {
  if (!a.id) return { error: 'Save the approval first' }
  await ensureSession()
  const safe = file.name.replace(/[^A-Za-z0-9._-]+/g, '_')
  const path = `approvals/${a.preceptor_id}/${Date.now()}-${safe}`
  const res = await fetch(`${SB_URL}/storage/v1/object/internship-documents/${path}`, { method: 'POST', headers: { ...headers(), 'Content-Type': file.type || 'application/octet-stream', 'x-upsert': 'false' }, body: file })
  if (!res.ok) return { error: await res.text() }
  return patch('preceptor_colleges', `id=eq.${a.id}`, { document_path: path, document_name: file.name })
}
export async function approvalDocUrl(a: Approval): Promise<string | null> {
  if (!a.document_path) return null
  await ensureSession()
  const res = await fetch(`${SB_URL}/storage/v1/object/sign/internship-documents/${a.document_path}`, { method: 'POST', headers: headers(true), body: JSON.stringify({ expiresIn: 600 }) })
  if (!res.ok) return null
  const j = (await res.json()) as { signedURL?: string }
  return j.signedURL ? `${SB_URL}/storage/v1${j.signedURL}` : null
}

/* ---- the person's pathway progress, for the record card ---------------------- */
export type ProgressRow = { requirement_id: number; completed: boolean; completed_date: string | null; approved_by_name: string | null }
export async function progressFor(personId: string): Promise<ProgressRow[]> {
  const q = await select<ProgressRow>('person_cert_progress', `select=requirement_id,completed,completed_date,approved_by_name&person_id=eq.${personId}`)
  return q.data ?? []
}
