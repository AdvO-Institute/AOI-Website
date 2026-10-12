/* ----------------------------------------------------------------------------
 * Committee reports — the Institute's central reporting system.
 *
 * One report per committee per month, filed for the Board meeting that follows
 * the month (see meetings.ts). Numbers go to committee_report_metrics one row
 * per figure (exactly as CCI OS wrote them), name lists and narrative texts
 * live in committee_reports.data. Draft → Submit → (edit until the meeting)
 * → locked after the meeting and filed in Records.
 * -------------------------------------------------------------------------- */
import { select, patch, insert, remove, rpc, headers, SB_URL, ensureSession } from '@/lib/supabase'
import type { Meeting } from './meetings'
import { cycleForMonth, monthLabel } from './meetings'

export type Who = { name: string; id: string | null }
export type Committee = { id: number; key: string; name: string }
/** `net` is a figure worked out from two others (first minus second), shown but never typed. */
export type Template = { nums?: [string, string][]; net?: [label: string, plus: string, minus: string]; lists?: [string, string][]; texts: [string, string][]; docs?: [string, string][] }

/** One template per committee, as CCI OS defined them, plus the Treasurer. `($)` in a label marks a dollar figure. */
export const TEMPLATES: Record<string, Template> = {
  instructor: { lists: [['started_l1', 'Started Level 1 this month'], ['started_l2', 'Started Level 2 (Senior) this month'], ['in_process', 'Currently in process'], ['completed_l1', 'Completed Level 1 this month'], ['completed_l2', 'Completed Level 2 this month']], texts: [['additional', 'Additional information']] },
  curriculum: { texts: [['updates', 'Overall updates'], ['changes', 'Any changes this month'], ['concerns', 'Any concerns'], ['meetings', 'Curriculum meetings scheduled (also add them to the Calendar)']] },
  seminar: { nums: [['seminars_held', 'Seminars held'], ['total_registrations', 'Registrations'], ['total_attendance', 'Total in attendance'], ['revenue', 'Revenue ($)'], ['expenses', 'Expenses ($)'], ['avg_feedback', 'Average feedback (/5)']], texts: [['notes', 'Additional notes'], ['upcoming', 'Upcoming seminars (next 3 months)'], ['needs', 'Particular needs']] },
  college_outreach: { nums: [['active_relationships', 'Colleges with active partnerships'], ['doctors_speaking', 'Doctors currently speaking']], texts: [['scheduled', 'Events scheduled this month (also add them to the Calendar)'], ['completed', 'Events completed + attendance'], ['requests', 'Seminars / requests at colleges'], ['narrative', 'Chair narrative']] },
  internship: { nums: [['active_sites', 'Clinics with active internships'], ['students_committed', 'Students committed'], ['students_seeking', 'Students seeking a home']], lists: [['active_clinics', 'Clinics running active internships'], ['active_interns', 'Active interns (with preceptor)'], ['completed', 'Recently completed internships']], texts: [['narrative', 'Narrative']] },
  certification: { nums: [['active_l1', 'Actively certified Level 1'], ['active_l2', 'Actively certified Level 2'], ['completed_month', 'Completed this month'], ['inproc_student', 'In process · Student'], ['inproc_l1', 'In process · Level 1'], ['inproc_l2', 'In process · Level 2']], texts: [['notes', 'Additional notes']] },
  research: { nums: [['active_projects', 'Active research projects'], ['funds_raised', 'Funds raised ($)'], ['profit', 'Profit to the Institute ($)'], ['overhead', 'Institutional overhead ($)']], texts: [['active_detail', 'Active projects — detail'], ['completed', 'Completed projects'], ['starting', 'Projects to start'], ['narrative', 'Narrative']] },
  marketing: { nums: [['spend', 'Marketing spend ($)'], ['leads', 'Leads generated'], ['committed', 'Committed from those leads']], texts: [['campaigns', 'Active campaigns'], ['narrative', 'Narrative']] },
  nominations: { nums: [['forms_sent', 'Election forms sent'], ['forms_collected', 'Forms collected'], ['nominated', 'People nominated'], ['accepted', 'Nominations accepted']], texts: [['stage', 'Current stage'], ['results', 'Results (if applicable)'], ['narrative', 'Narrative']] },
  treasury: { nums: [['revenue', 'Gross income ($)'], ['event_revenue', 'of which event registrations ($)'], ['expenditures', 'Expenses ($)'], ['cash', 'Balance ($)']], net: ['Net income ($)', 'revenue', 'expenditures'], texts: [['notes', 'Notes for the Board']], docs: [['profit_loss', 'Profit & loss statement (QuickBooks PDF)'], ['balance_sheet', 'Balance sheet (QuickBooks PDF)']] },
}
export const isMoney = (label: string) => /\(\$\)/.test(label)
export const AUTO_SOURCE: Record<string, string> = { instructor: 'Instructors', certification: 'Certifications', college_outreach: 'Colleges', research: 'Research', internship: 'Internships', nominations: 'Board', seminar: 'Events', marketing: 'Contacts', treasury: 'Events' }

export type Report = {
  id: number; committee_id: number; period_label: string; period_ym: string | null; meeting_date: string | null; due_date: string | null
  status: 'draft' | 'submitted'; submitted_at: string | null; submitted_by_name: string | null; edited_at: string | null; edited_by_name: string | null
  locked_at: string | null; locked_by_name: string | null; narrative: string | null
  data: { texts?: Record<string, string>; lists?: Record<string, string[]> } | null
  committee_report_metrics: { metric_key: string; value: number | null }[]
  committees?: { key: string; name: string } | null
}
export type ReportDoc = { id: number; report_id: number | null; kind: string; title: string; file_name: string | null; storage_path: string | null; size_bytes: number | null; uploaded_by_name: string | null; created_at: string }

export async function committees(): Promise<Committee[]> {
  const q = await select<Committee & { active: boolean; sort: number }>('committees', 'select=id,key,name,active,sort&order=sort&limit=50')
  return (q.data ?? []).filter((c) => c.active !== false)
}
export async function reports(): Promise<{ rows: Report[]; error?: string }> {
  const q = await select<Report>('committee_reports', 'select=*,committee_report_metrics(metric_key,value),committees(key,name)&order=period_ym.desc.nullslast,committee_id&limit=500')
  if (q.data) return { rows: q.data.map((r) => ({ ...r, committee_report_metrics: (r.committee_report_metrics ?? []).map((m) => ({ ...m, value: m.value == null ? null : Number(m.value) })) })) }
  return { rows: [], error: q.error ?? 'unknown' }
}
export async function reportDocs(): Promise<ReportDoc[]> {
  const q = await select<ReportDoc>('records', 'select=id,report_id,kind,title,file_name,storage_path,size_bytes,uploaded_by_name,created_at&report_id=not.is.null&order=created_at.desc&limit=500')
  return q.data ?? []
}
/** Month-end numbers and name lists from the live tabs. Empty for people who cannot file this committee's report. */
export async function autofill(key: string, ym: string): Promise<{ nums: Record<string, number>; lists: Record<string, string[]> }> {
  const r = await rpc<{ nums?: Record<string, number>; lists?: Record<string, string[]> }>('report_autofill', { p_key: key, p_ym: ym })
  return { nums: r?.nums ?? {}, lists: r?.lists ?? {} }
}

/* ---- derive ------------------------------------------------------------------ */
export const num = (r: Report, k: string) => r.committee_report_metrics.find((m) => m.metric_key === k)?.value ?? null
/** First figure minus the second, once both are filled in. */
export const netOf = (vals: Record<string, number | null | undefined>, net: [string, string, string]) => vals[net[1]] != null && vals[net[2]] != null ? Number(vals[net[1]]) - Number(vals[net[2]]) : null
export const isLocked = (r: Report) => !!r.locked_at
export const money = (n: number | null | undefined) => n == null ? '—' : '$' + Math.round(Number(n)).toLocaleString('en-US')
export const fmtTs = (iso: string) => new Date(iso).toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' })

export type CommitteeStatus = { c: Committee; state: 'ok' | 'draft' | 'miss'; report: Report | null; latest: Report | null }
/** Reporting status for one cycle, missing first — what Oversight reads. */
export function statusFor(coms: Committee[], rows: Report[], ym: string): CommitteeStatus[] {
  const order = { miss: 0, draft: 1, ok: 2 }
  return coms.map((c) => {
    const report = rows.find((r) => r.committee_id === c.id && r.period_ym === ym) ?? null
    const latest = rows.filter((r) => r.committee_id === c.id && r.status === 'submitted').sort((a, b) => (b.period_ym ?? '').localeCompare(a.period_ym ?? ''))[0] ?? null
    const state: CommitteeStatus['state'] = report?.status === 'submitted' ? 'ok' : report ? 'draft' : 'miss'
    return { c, state, report, latest }
  }).sort((a, b) => order[a.state] - order[b.state] || a.c.name.localeCompare(b.c.name))
}

/* ---- writes -------------------------------------------------------------------- */
export type ReportInput = { nums: Record<string, number | null>; lists: Record<string, string[]>; texts: Record<string, string> }
export async function saveReport(existing: Report | null, committee: Committee, ym: string, v: ReportInput, status: 'draft' | 'submitted', who: Who, meetings: Meeting[]): Promise<{ ok?: true; id?: number; error?: string }> {
  await ensureSession()
  const cyc = cycleForMonth(ym, meetings)
  const t = TEMPLATES[committee.key]
  const narrative = t?.texts.map(([k]) => v.texts[k]).filter(Boolean).join('\n\n') || null
  const row: Record<string, unknown> = {
    committee_id: committee.id, period_label: monthLabel(ym), period_ym: ym, meeting_date: cyc.meetingDate, due_date: cyc.dueDate,
    period_start: `${ym}-01`, period_end: new Date(Date.UTC(Number(ym.slice(0, 4)), Number(ym.slice(5, 7)), 0)).toISOString().slice(0, 10),
    data: { ym, texts: v.texts, lists: v.lists }, narrative, status, updated_at: new Date().toISOString(),
  }
  const wasSubmitted = existing?.status === 'submitted'
  if (status === 'submitted' && !wasSubmitted) { row.submitted_at = new Date().toISOString(); row.submitted_by_name = who.name; row.submitted_by_person_id = who.id }
  else if (status === 'submitted' && wasSubmitted) { row.edited_at = new Date().toISOString(); row.edited_by_name = who.name }
  else { row.submitted_by_name = who.name; row.submitted_by_person_id = who.id }
  let id = existing?.id ?? null
  if (id) { const r = await patch('committee_reports', `id=eq.${id}`, row); if (r.error) return r }
  else {
    const res = await fetch(`${SB_URL}/rest/v1/committee_reports`, { method: 'POST', headers: { ...headers(true), Prefer: 'return=representation' }, body: JSON.stringify([row]) })
    if (!res.ok) return { error: await res.text() }
    id = ((await res.json()) as { id: number }[])[0]?.id ?? 0
  }
  // numbers: replace the metric rows to match, as CCI OS did
  if (existing) { const d = await remove('committee_report_metrics', `report_id=eq.${id}`); if (d.error) return d }
  const metrics = Object.entries(v.nums).filter(([, val]) => val != null && Number.isFinite(Number(val))).map(([metric_key, value]) => ({ report_id: id, metric_key, value }))
  if (metrics.length) { const r = await insert('committee_report_metrics', metrics); if (r.error) return r }
  return { ok: true, id: id! }
}
export const discardDraft = (id: number) => remove('committee_reports', `id=eq.${id}`)
/** Oversight only: reopen a locked report so it can be corrected. */
export const unlockReport = (id: number) => patch('committee_reports', `id=eq.${id}`, { locked_at: null, locked_by_name: null })

/* ---- documents on a report (records bucket) ------------------------------------- */
export async function uploadReportDoc(report: Report, committee: Committee, kind: string, title: string, file: File, who: Who): Promise<{ ok?: true; error?: string }> {
  await ensureSession()
  const folder = committee.key === 'treasury' ? 'financials' : 'committee_reports'
  const safe = file.name.replace(/[^A-Za-z0-9._-]+/g, '_')
  const path = `${folder}/${committee.key === 'treasury' ? (report.period_ym ?? 'undated') : committee.id}/${report.period_ym ?? 'undated'}-${kind}-${Date.now()}-${safe}`
  const up = await fetch(`${SB_URL}/storage/v1/object/records/${path}`, { method: 'POST', headers: { ...headers(), 'Content-Type': file.type || 'application/octet-stream', 'x-upsert': 'false' }, body: file })
  if (!up.ok) return { error: await up.text() }
  return insert('records', [{ folder, committee_id: committee.key === 'treasury' ? null : committee.id, report_id: report.id, period_ym: report.period_ym, kind, title, file_name: file.name, storage_path: path, size_bytes: file.size, uploaded_by_id: who.id, uploaded_by_name: who.name }])
}
export async function docUrl(path: string): Promise<string | null> {
  await ensureSession()
  const r = await fetch(`${SB_URL}/storage/v1/object/sign/records/${path}`, { method: 'POST', headers: headers(true), body: JSON.stringify({ expiresIn: 600 }) })
  if (!r.ok) return null
  const j = (await r.json()) as { signedURL?: string }
  return j.signedURL ? `${SB_URL}/storage/v1${j.signedURL}` : null
}
export async function removeDoc(doc: ReportDoc): Promise<{ ok?: true; error?: string }> {
  await ensureSession()
  if (doc.storage_path) await fetch(`${SB_URL}/storage/v1/object/records`, { method: 'DELETE', headers: headers(true), body: JSON.stringify({ prefixes: [doc.storage_path] }) })
  return remove('records', `id=eq.${doc.id}`)
}
