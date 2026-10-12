/* ----------------------------------------------------------------------------
 * Reports — the Institute's central reporting system, driven by the Board
 * meeting date (meetings.ts). The day after a Board meeting the next month's
 * Start-cards appear for every chair; numbers auto-fill from the live tabs and
 * settle at month end; the due date is two weeks before the next meeting;
 * submitted reports stay editable until the meeting, then lock and file into
 * Records. Board members see every submitted report; a chair sees their own
 * committees; the reporting-status strip is what Oversight reads.
 * -------------------------------------------------------------------------- */
import { friendlyError } from '@/lib/friendlyError'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useAccess } from '@/lib/queries/AccessProvider'
import { useToast } from '@/components/ui/Toast'
import { displayName } from '@/lib/access'
import {
  committees as loadCommittees, reports as loadReports, reportDocs, autofill, saveReport, discardDraft, unlockReport, uploadReportDoc, docUrl, removeDoc,
  TEMPLATES, AUTO_SOURCE, isMoney, num, isLocked, money, fmtTs, statusFor,
} from '@/lib/queries/reports'
import type { Committee, Report, ReportDoc, ReportInput, Who, CommitteeStatus } from '@/lib/queries/reports'
import { boardMeetings, currentCycle, previousCycle, cycleForMonth, monthLabel, fmtD, daysUntil, dayET } from '@/lib/queries/meetings'
import type { Meeting, Cycle } from '@/lib/queries/meetings'
import { logActivity } from '@/lib/queries/attention'
import { Pill, Modal, Head, Sec, friendly, askConfirm } from './opsUi'
import { isCommittee } from '@/lib/nav'

export default function ReportsPanel({ committee }: { committee?: string } = {}) {
  const toast = useToast()
  const { access, can } = useAccess()
  const who: Who = { name: displayName(access).replace(/,.*$/, ''), id: access.person?.id ?? null }
  const oversight = can('full_admin') || can('board')
  const leads = useMemo(() => new Set(access.committees.filter((c) => c.leads).map((c) => c.id)), [access.committees])
  const canSubmit = useCallback((cid: number) => can('full_admin') || leads.has(cid), [can, leads])
  const [coms, setComs] = useState<Committee[]>([]); const [rows, setRows] = useState<Report[]>([]); const [meetings, setMeetings] = useState<Meeting[]>([]); const [docs, setDocs] = useState<ReportDoc[]>([])
  const [loading, setLoading] = useState(true); const [error, setError] = useState<string | null>(null)
  const [com, setCom] = useState<number | 'all'>('all'); const [q, setQ] = useState(''); const [openIds, setOpenIds] = useState<Set<number>>(new Set())
  const [form, setForm] = useState<{ report: Report | null; committee: Committee; ym: string } | null>(null)
  const [view, setView] = useState<Report | null>(null)

  const load = useCallback(async () => {
    const [c, r, m, d] = await Promise.all([loadCommittees(), loadReports(), boardMeetings(), reportDocs()])
    setError(r.error ? `The reports could not be read. ${friendlyError(r.error)}` : null)
    setComs(c); setRows(r.rows); setMeetings(m); setDocs(d); setLoading(false)
  }, [])
  useEffect(() => { void load() }, [load])
  // default the dropdown to the person's own committee when they lead exactly one
  useEffect(() => { if (!oversight && leads.size === 1) setCom([...leads][0]!) }, [oversight, leads])
  // opened from a committee in the rail: show that committee's reports
  useEffect(() => { const c = committee ? coms.find((x) => isCommittee(x, committee)) : undefined; if (c) setCom(c.id) }, [committee, coms])

  const visible = oversight ? coms : coms.filter((c) => access.committees.some((a) => a.id === c.id))
  const cycle: Cycle = useMemo(() => currentCycle(meetings), [meetings])
  const prev = useMemo(() => previousCycle(meetings), [meetings])
  const today = dayET()

  if (loading) return <><h1>Reports</h1><div className="ma-sub">Reading the committee reports…</div><div className="ma-panel"><p className="ma-empty">One moment.</p></div></>

  // opened from a committee the database does not have yet: say so rather than show every committee
  if (committee && !coms.some((x) => isCommittee(x, committee))) return <><h1>Reports</h1><div className="ma-sub">This committee hasn’t been set up yet.</div><div className="ma-panel"><p className="ma-empty">Once the Executive Director adds it, its monthly reports will appear here.</p></div></>

  const inView = com === 'all' ? visible : visible.filter((c) => c.id === com)
  const status = statusFor(coms, rows, cycle.reportMonth)
  const missing = status.filter((s) => s.state === 'miss')
  const dueIn = daysUntil(cycle.dueDate, today)
  // start-cards: the current cycle for every committee I can file; the previous cycle too if it was never filed
  const starts: { c: Committee; ym: string; late: boolean }[] = []
  // the ED can file for any committee, but with every committee in view only their own (or overdue ones) get a Start-card — the status strip opens the rest
  for (const c of inView) if (canSubmit(c.id) && (com !== 'all' || leads.has(c.id) || !oversight || dueIn < 0)) {
    if (!rows.some((r) => r.committee_id === c.id && r.period_ym === cycle.reportMonth)) starts.push({ c, ym: cycle.reportMonth, late: false })
    if (prev && !rows.some((r) => r.committee_id === c.id && r.period_ym === prev.reportMonth)) starts.push({ c, ym: prev.reportMonth, late: true })
  }
  const lq = q.trim().toLowerCase()
  const active = rows.filter((r) => inView.some((c) => c.id === r.committee_id)).filter((r) => r.status === 'submitted' || canSubmit(r.committee_id)).filter((r) => !isLocked(r))
    .filter((r) => !lq || `${r.committees?.name ?? ''} ${r.period_label} ${r.submitted_by_name ?? ''} ${Object.values(r.data?.texts ?? {}).join(' ')}`.toLowerCase().includes(lq))
  const filed = rows.filter((r) => inView.some((c) => c.id === r.committee_id) && isLocked(r)).length

  const openForm = (c: Committee, ym: string, report: Report | null) => setForm({ report, committee: c, ym })
  const onStatus = (s: CommitteeStatus) => { if (s.report) { if (s.report.status === 'submitted') setView(s.report); else if (canSubmit(s.c.id)) openForm(s.c, cycle.reportMonth, s.report) } else if (canSubmit(s.c.id)) openForm(s.c, cycle.reportMonth, null); else setCom(s.c.id) }

  const card = (r: Report) => {
    const c = coms.find((x) => x.id === r.committee_id); const t = c ? TEMPLATES[c.key] : undefined; const open = openIds.has(r.id) || r.status === 'draft'
    const rdocs = docs.filter((d) => d.report_id === r.id)
    return <div key={r.id} className={`rcpt ${r.status}`}>
      <div className="rh" onClick={() => setOpenIds((s) => { const n = new Set(s); n.has(r.id) ? n.delete(r.id) : n.add(r.id); return n })}>
        <span className="car">{open ? '▾' : '▸'}</span>
        <h3>{c?.name ?? 'Committee'} · {r.period_label}{r.status === 'draft' ? <Pill kind="warn">Draft</Pill> : <Pill kind="ok">Submitted</Pill>}{r.meeting_date && <small className="muted"> for the {fmtD(r.meeting_date)} meeting</small>}</h3>
        <span className="meta">{r.status === 'draft' ? `saved by ${r.submitted_by_name ?? '—'} · only the committee, Admin and the ED see this` : `${r.submitted_by_name ?? '—'} · ${r.submitted_at ? fmtTs(r.submitted_at) : ''}${r.edited_at ? ` · edited ${fmtTs(r.edited_at)} by ${r.edited_by_name}` : ''}`}</span>
        {r.status === 'draft' && canSubmit(r.committee_id) ? <button type="button" className="b p-btn sm" onClick={(e) => { e.stopPropagation(); c && openForm(c, r.period_ym ?? cycle.reportMonth, r) }}>Continue &amp; submit</button>
          : <span style={{ display: 'flex', gap: 6 }} onClick={(e) => e.stopPropagation()}><button type="button" className="b s-btn on-light xs" onClick={() => setView(r)}>View</button>{canSubmit(r.committee_id) && <button type="button" className="b s-btn on-light xs" onClick={() => c && openForm(c, r.period_ym ?? cycle.reportMonth, r)}>Edit</button>}</span>}
      </div>
      {open && t && <div className="rb"><ReportBody r={r} t={t} docs={rdocs} /></div>}
    </div>
  }

  return <>
    <Head title="Reports" lede={<>Each chair files their committee’s monthly report here — numbers as of the end of the month, names pulled from the live tabs, and the narrative. The Board meets the third Tuesday; the report on <b>{monthLabel(cycle.reportMonth)}</b> is due <b>{fmtD(cycle.dueDate)}</b> for the <b>{fmtD(cycle.meetingDate)}</b> meeting.</>}
      right={<a className="b s-btn on-light sm" href="#records">Records archive{filed ? ` · ${filed}` : ''}</a>} />
    {error && <div className="cert-err" role="alert">{error}</div>}
    {oversight && <>
      <Sec r="missing first · click a card to open the report">Reporting status · {monthLabel(cycle.reportMonth)}</Sec>
      {missing.length > 0 && <div className="onote">{dueIn < 0 ? 'Overdue' : dueIn === 0 ? 'Due today' : `Due in ${dueIn} days`}: {missing.map((s) => s.c.name).join(', ')} — no {monthLabel(cycle.reportMonth)} report yet.</div>}
      <div className="rstat">{status.map((s) => <button type="button" key={s.c.id} className={`rs ${s.state}`} onClick={() => onStatus(s)}><i /><div><b>{s.c.name}</b><span>{s.state === 'ok' ? `Submitted · ${s.report?.submitted_by_name ?? ''}${s.report?.submitted_at ? ' · ' + fmtD(s.report.submitted_at) : ''}` : s.state === 'draft' ? `Draft started · ${s.report?.submitted_by_name ?? ''}` : s.latest ? `Missing · last was ${s.latest.period_label}` : 'Missing · never filed'}</span></div></button>)}</div>
    </>}
    <div className="ctc-srow" style={{ gridTemplateColumns: 'auto 1fr' }}>
      <select className="fi" value={com} onChange={(e) => setCom(e.target.value === 'all' ? 'all' : Number(e.target.value))} aria-label="Committee"><option value="all">{oversight ? 'All committees' : 'All my committees'}</option>{visible.map((c) => <option key={c.id} value={c.id}>{c.name}{leads.has(c.id) ? ' · you file this' : ''}</option>)}</select>
      <div className="cert-search" style={{ margin: 0 }}><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></svg><input type="text" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search reports…" aria-label="Search reports" autoComplete="off" />{q && <button type="button" className="clr" aria-label="Clear search" onClick={() => setQ('')}>×</button>}</div>
    </div>
    {starts.map((s) => <div key={`${s.c.id}-${s.ym}`} className="rcpt start"><div className="rh" onClick={() => openForm(s.c, s.ym, null)}>
      <h3>{s.c.name} · {monthLabel(s.ym)}{s.late ? <Pill kind="bad">Not filed — meeting passed</Pill> : dueIn < 0 ? <Pill kind="bad">Overdue</Pill> : dueIn <= 14 ? <Pill kind="warn">Due {fmtD(cycle.dueDate)}</Pill> : <Pill>Due {fmtD(cycle.dueDate)}</Pill>}</h3>
      <span className="meta">{s.late ? 'file it late — it still feeds Stats' : cycle.monthClosed ? 'month closed · numbers are final' : 'you can start now · numbers settle at month end'}</span>
      <button type="button" className="b p-btn sm" onClick={(e) => { e.stopPropagation(); openForm(s.c, s.ym, null) }}>Start this report</button></div></div>)}
    {active.map(card)}
    {!active.length && !starts.length && <div className="bnodata">{rows.length ? 'Nothing active for this cycle. Filed reports are in Records.' : 'No reports yet.'}</div>}

    {form && <ReportForm key={`${form.committee.id}-${form.ym}-${form.report?.id ?? 'new'}`} committee={form.committee} ym={form.ym} report={form.report} meetings={meetings} docs={docs.filter((d) => d.report_id === form.report?.id)} who={who} oversight={oversight} onClose={() => setForm(null)}
      onSaved={async (m) => { setForm(null); await load(); toast(m); void logActivity('write', 'reports', { action: m, committee: form.committee.key, ym: form.ym }) }} onReload={load} />}
    {view && <ReportView r={view} committee={coms.find((c) => c.id === view.committee_id)} docs={docs.filter((d) => d.report_id === view.id)} oversight={oversight} canEdit={canSubmit(view.committee_id) && !isLocked(view)} onEdit={() => { const c = coms.find((x) => x.id === view.committee_id); setView(null); if (c) openForm(c, view.period_ym ?? cycle.reportMonth, view) }} onUnlock={async () => { const r = await unlockReport(view.id); if (r.error) return toast(friendly(r.error)); setView(null); await load(); toast('Report unlocked — it is editable until you lock it again or the next daily lock runs') }} onClose={() => setView(null)} />}
  </>
}

/* --------------------------------------------------------------- read view */
export function ReportBody({ r, t, docs, onDoc }: { r: Report; t: { nums?: [string, string][]; lists?: [string, string][]; texts: [string, string][]; docs?: [string, string][] }; docs: ReportDoc[]; onDoc?: (d: ReportDoc) => void }) {
  const open = async (d: ReportDoc) => { if (onDoc) return onDoc(d); if (!d.storage_path) return; const u = await docUrl(d.storage_path); if (u) window.open(u, '_blank', 'noopener') }
  return <>
    {t.nums && <div className="rnum">{t.nums.map(([k, l]) => { const v = num(r, k); return <div key={k}><b>{v == null ? '—' : isMoney(l) ? money(v) : v}</b><span>{l.replace(' ($)', '')}</span></div> })}</div>}
    {t.lists?.map(([k, l]) => <div key={k} className="rtx"><label className="flabel">{l}</label>{(r.data?.lists?.[k] ?? []).length ? <ul className="rlist">{r.data!.lists![k]!.map((n, i) => <li key={i}>{n}</li>)}</ul> : <p><i>none</i></p>}</div>)}
    {t.texts.map(([k, l]) => r.data?.texts?.[k] ? <div key={k} className="rtx"><label className="flabel">{l}</label><p>{r.data.texts[k]}</p></div> : null)}
    {!t.texts.some(([k]) => r.data?.texts?.[k]) && r.narrative && <div className="rtx"><label className="flabel">Narrative</label><p>{r.narrative}</p></div>}
    {docs.length > 0 && <div className="rtx"><label className="flabel">Documents</label><div className="rdocs">{docs.map((d) => <button type="button" key={d.id} className="rdoc" onClick={() => void open(d)}>📄 {d.title}<small>{d.file_name}</small></button>)}</div></div>}
  </>
}
function ReportView({ r, committee, docs, oversight, canEdit, onEdit, onUnlock, onClose }: { r: Report; committee?: Committee; docs: ReportDoc[]; oversight: boolean; canEdit: boolean; onEdit: () => void; onUnlock: () => void; onClose: () => void }) {
  const t = committee ? TEMPLATES[committee.key] : undefined
  return <Modal onClose={onClose} wide cls="print-area">
    <div className="mh"><div><h3>{committee?.name ?? 'Committee'} · {r.period_label}</h3><p>{r.status === 'submitted' ? `Submitted by ${r.submitted_by_name ?? '—'}${r.submitted_at ? ' · ' + fmtTs(r.submitted_at) : ''}` : 'Draft'}{r.meeting_date ? ` · for the ${fmtD(r.meeting_date)} Board meeting` : ''}{r.edited_at ? ` · edited ${fmtTs(r.edited_at)} by ${r.edited_by_name}` : ''}{isLocked(r) ? ' · locked' : ''}</p></div><button type="button" className="x" onClick={onClose} aria-label="Close">×</button></div>
    <div className="mb">{t ? <ReportBody r={r} t={t} docs={docs} /> : <p>{r.narrative}</p>}</div>
    <div className="mf evt-foot"><span style={{ display: 'flex', gap: 8 }}><button type="button" className="b s-btn on-light sm" onClick={() => window.print()}>Print / save as PDF</button>{oversight && isLocked(r) && <button type="button" className="b s-btn on-light sm" onClick={onUnlock}>Unlock</button>}</span><span style={{ display: 'flex', gap: 8 }}>{canEdit && <button type="button" className="b s-btn on-light sm" onClick={onEdit}>Edit</button>}<button type="button" className="b p-btn sm" onClick={onClose}>Close</button></span></div>
  </Modal>
}

/* ------------------------------------------------------------------- form */
function ReportForm({ committee, ym, report, meetings, docs, who, oversight, onClose, onSaved, onReload }: { committee: Committee; ym: string; report: Report | null; meetings: Meeting[]; docs: ReportDoc[]; who: Who; oversight: boolean; onClose: () => void; onSaved: (m: string) => void; onReload: () => Promise<void> }) {
  const toast = useToast()
  const t = TEMPLATES[committee.key] ?? { texts: [['narrative', 'Narrative']] as [string, string][] }
  const [v, setV] = useState<ReportInput>({
    nums: Object.fromEntries((t.nums ?? []).map(([k]) => [k, num(report ?? { committee_report_metrics: [] } as unknown as Report, k)])),
    lists: Object.fromEntries((t.lists ?? []).map(([k]) => [k, report?.data?.lists?.[k] ?? []])),
    texts: Object.fromEntries(t.texts.map(([k]) => [k, report?.data?.texts?.[k] ?? ''])),
  })
  const [auto, setAuto] = useState<{ nums: Record<string, number>; lists: Record<string, string[]> } | null>(null)
  const [saving, setSaving] = useState<false | 'draft' | 'submitted'>(false); const [uploading, setUploading] = useState<string | null>(null)
  const [savedReport, setSavedReport] = useState<Report | null>(report)
  const locked = report ? isLocked(report) && !oversight : false
  const fill = useCallback(async (overwrite: boolean) => {
    const a = await autofill(committee.key, ym); setAuto(a)
    setV((cur) => ({
      ...cur,
      nums: Object.fromEntries(Object.entries(cur.nums).map(([k, val]) => [k, (overwrite || val == null) && a.nums[k] != null ? a.nums[k]! : val])),
      lists: Object.fromEntries(Object.entries(cur.lists).map(([k, val]) => [k, (overwrite || !(val as string[]).length) && a.lists[k] ? a.lists[k]! : val])),
    }))
  }, [committee.key, ym])
  useEffect(() => { void fill(!report) }, [fill, report])

  async function save(status: 'draft' | 'submitted') {
    setSaving(status)
    const r = await saveReport(savedReport, committee, ym, v, status, who, meetings)
    setSaving(false)
    if (r.error) return toast(friendly(r.error, 'the committee’s chair or co-chair, the Treasurer and the Executive Director'))
    onSaved(status === 'submitted' ? (savedReport?.status === 'submitted' ? 'Report updated' : 'Report submitted — the Board can see it now') : 'Progress saved — only your committee, Admin and the ED see drafts')
  }
  async function upload(kind: string, title: string, file: File) {
    setUploading(kind)
    let rep = savedReport
    if (!rep) { // the file needs a report row to hang on — save a draft first
      const r = await saveReport(null, committee, ym, v, 'draft', who, meetings)
      if (r.error || !r.id) { setUploading(null); return toast(friendly(r.error ?? 'could not save')) }
      rep = { id: r.id, committee_id: committee.id, period_ym: ym, status: 'draft' } as Report; setSavedReport(rep)
    }
    const u = await uploadReportDoc(rep, committee, kind, title, file, who)
    setUploading(null)
    if (u.error) return toast('The upload failed. ' + friendlyError(u.error))
    await onReload(); toast(`${title} attached`)
  }
  const cyc = meetings.length ? cycleForMonth(ym, meetings).meetingDate : null
  return <Modal onClose={onClose} wide>
    <div className="mh"><div><h3>{committee.name} · {monthLabel(ym)}</h3><p>{locked ? 'This report is locked — the Board meeting has passed. Ask the Executive Director to unlock it.' : report?.status === 'submitted' ? 'Editing a submitted report — the edit is stamped with your name and time.' : `Numbers reflect the end of ${monthLabel(ym)}${cyc ? ` · for the ${fmtD(cyc)} Board meeting` : ''}. Fields marked auto are filled from the live tabs; change them if you need to.`}</p></div><button type="button" className="x" onClick={onClose} aria-label="Close">×</button></div>
    <div className="mb rform">
      {t.nums && <><div className="fsec">Numbers <span className="r">as of month end{auto && Object.keys(auto.nums).length ? <> · <button type="button" className="link" onClick={() => void fill(true)}>refresh from the tabs</button></> : null}</span></div>
        <div className="fnum">{t.nums.map(([k, l]) => <div key={k}><label className="flabel">{l}</label><input className="fi" type="number" step="any" value={v.nums[k] ?? ''} disabled={locked} onChange={(e) => setV({ ...v, nums: { ...v.nums, [k]: e.target.value === '' ? null : Number(e.target.value) } })} />{auto?.nums[k] != null && <div className="auto"><b>auto</b> · {AUTO_SOURCE[committee.key] ?? 'live'} tab says {isMoney(l) ? money(auto.nums[k]) : auto.nums[k]}</div>}</div>)}</div></>}
      {t.lists && <><div className="fsec">Names <span className="r">pre-filled from the {AUTO_SOURCE[committee.key] ?? 'live'} tab · one per line</span></div>
        <div className="cert-grid mform evt-grid">{t.lists.map(([k, l]) => <div key={k}><label className="flabel">{l}{auto?.lists[k] ? <span className="ok-txt"> · auto</span> : null}</label><textarea className="fi" value={(v.lists[k] ?? []).join('\n')} disabled={locked} onChange={(e) => setV({ ...v, lists: { ...v.lists, [k]: e.target.value.split('\n').map((s) => s.trim()).filter(Boolean) } })} /></div>)}</div></>}
      <div className="fsec">Narrative</div>
      <div className="cert-grid mform" style={{ gridTemplateColumns: '1fr' }}>{t.texts.map(([k, l]) => <div key={k}><label className="flabel">{l}</label><textarea className="fi" value={v.texts[k] ?? ''} disabled={locked} onChange={(e) => setV({ ...v, texts: { ...v.texts, [k]: e.target.value } })} /></div>)}</div>
      {t.docs && <><div className="fsec">Documents <span className="r">PDF from QuickBooks · stored in Records → Financials</span></div>
        <div className="rdocs">{t.docs.map(([k, l]) => { const have = docs.filter((d) => d.kind === k); return <div key={k} className="rdocslot"><b>{l}</b>{have.map((d) => <div key={d.id} className="rdocrow"><button type="button" className="link" onClick={async () => { if (!d.storage_path) return; const u = await docUrl(d.storage_path); if (u) window.open(u, '_blank', 'noopener') }}>📄 {d.file_name}</button>{!locked && <button type="button" className="x" aria-label="Remove" onClick={async () => { if (!(await askConfirm('Remove this document?', { ok: 'Remove', danger: true }))) return; const r = await removeDoc(d); if (r.error) return toast(friendly(r.error)); await onReload() }}>×</button>}</div>)}{!locked && <label className="b s-btn on-light xs" style={{ cursor: 'pointer' }}>{uploading === k ? 'Uploading…' : have.length ? '+ Replace / add' : '+ Upload PDF'}<input type="file" accept="application/pdf,image/*" hidden disabled={!!uploading} onChange={(e) => { const f = e.target.files?.[0]; if (f) void upload(k, l.replace(/\s*\(.*\)$/, ''), f); e.target.value = '' }} /></label>}</div> })}</div></>}
    </div>
    <div className="mf evt-foot"><span>{savedReport?.status === 'draft' && !locked && <button type="button" className="b d-btn sm" onClick={async () => { if (!(await askConfirm('Discard this draft?', { body: 'This cannot be undone.', ok: 'Discard', danger: true }))) return; const r = await discardDraft(savedReport.id); if (r.error) return toast(friendly(r.error)); onSaved('Draft discarded') }}>Discard draft</button>}</span>
      <span style={{ display: 'flex', gap: 8 }}><button type="button" className="b s-btn on-light sm" onClick={onClose}>Cancel</button>
        {!locked && savedReport?.status !== 'submitted' && <button type="button" className="b s-btn on-light sm" disabled={!!saving} onClick={() => void save('draft')}>{saving === 'draft' ? 'Saving…' : 'Save progress'}</button>}
        {!locked && <button type="button" className="b p-btn sm" disabled={!!saving} onClick={() => void save('submitted')}>{saving === 'submitted' ? 'Submitting…' : savedReport?.status === 'submitted' ? 'Save changes' : 'Submit report'}</button>}</span></div>
  </Modal>
}
