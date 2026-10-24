/* ----------------------------------------------------------------------------
 * Records — the living archive. Three folders, each scoped by role:
 *   Financials         the Treasurer's reports with the QuickBooks PDFs
 *   Board meetings     agenda and minutes for each meeting date
 *   Committee reports  every filed report, by committee and month
 * The database decides what each person can see; this only lays it out.
 * -------------------------------------------------------------------------- */
import { friendlyError } from '@/lib/friendlyError'
import { useCallback, useEffect, useState } from 'react'
import { useAccess } from '@/lib/queries/AccessProvider'
import { useToast } from '@/components/ui/Toast'
import { displayName } from '@/lib/access'
import { records as loadRecords, upload, fileUrl, removeRecord, KIND_LABEL, fmtSize } from '@/lib/queries/records'
import type { Record_, Folder, Who } from '@/lib/queries/records'
import { reports as loadReports, committees as loadCommittees, TEMPLATES, fmtTs, isLocked } from '@/lib/queries/reports'
import type { Report, Committee } from '@/lib/queries/reports'
import { calendar as loadCalendar, startDay, dayLabel } from '@/lib/queries/calendar'
import type { CalEvent } from '@/lib/queries/calendar'
import { dayET, monthLabel, fmtD, addDays } from '@/lib/queries/meetings'
import { logActivity } from '@/lib/queries/attention'
import { Pill, Modal, Head, Sec, friendly, askConfirm } from './opsUi'
import { ReportBody } from './ReportsPanel'

type FolderKey = Folder
const FOLDERS: { key: FolderKey; label: string; blurb: string }[] = [
  { key: 'financials', label: 'Financials', blurb: 'Treasurer reports · profit & loss · balance sheets' },
  { key: 'board_meetings', label: 'Board meetings', blurb: 'Agenda and minutes, by meeting date' },
  { key: 'committee_reports', label: 'Committee reports', blurb: 'Every filed report, by committee and month' },
]

export default function RecordsPanel() {
  const toast = useToast()
  const { access, can } = useAccess()
  const who: Who = { name: displayName(access).replace(/,.*$/, ''), id: access.person?.id ?? null }
  const oversight = can('full_admin') || can('board')
  const treasurer = can('manage_finance')
  const allowed: FolderKey[] = [...(oversight || treasurer ? ['financials' as const] : []), ...(oversight ? ['board_meetings' as const] : []), ...(oversight || access.committees.length ? ['committee_reports' as const] : [])]
  const [folder, setFolder] = useState<FolderKey>(allowed[0] ?? 'committee_reports')
  const [recs, setRecs] = useState<Record_[]>([]); const [reports, setReports] = useState<Report[]>([]); const [coms, setComs] = useState<Committee[]>([]); const [meetings, setMeetings] = useState<CalEvent[]>([])
  const [loading, setLoading] = useState(true); const [error, setError] = useState<string | null>(null)
  const [view, setView] = useState<Report | null>(null); const [com, setCom] = useState<number | 'all'>('all'); const [uploading, setUploading] = useState<string | null>(null)

  const load = useCallback(async () => {
    const [r, rep, c, cal] = await Promise.all([loadRecords(), loadReports(), loadCommittees(), loadCalendar()])
    setError(r.error ? `Records could not be read. ${friendlyError(r.error)}` : null)
    setRecs(r.rows); setReports(rep.rows); setComs(c); setMeetings(cal.rows.filter((e) => e.event_type === 'board')); setLoading(false)
  }, [])
  useEffect(() => { void load() }, [load])

  const open = async (r: Record_) => { if (!r.storage_path) return; const u = await fileUrl(r.storage_path); if (u) window.open(u, '_blank', 'noopener'); else toast('That file could not be opened — you may not have access to it.') }
  const del = async (r: Record_) => { if (!(await askConfirm(`Remove “${r.title}” from Records?`, { ok: 'Remove', danger: true }))) return; const x = await removeRecord(r); if (x.error) return toast(friendly(x.error)); await load(); toast('Removed') }
  const fileRow = (r: Record_) => <div key={r.id} className="recrow"><button type="button" className="rdoc" onClick={() => void open(r)}>📄 {r.title}<small>{KIND_LABEL[r.kind] ?? r.kind} · {r.file_name}{r.size_bytes ? ` · ${fmtSize(r.size_bytes)}` : ''} · {r.uploaded_by_name ?? '—'} · {fmtTs(r.created_at)}</small></button>{oversight && <button type="button" className="x" aria-label="Remove" onClick={() => void del(r)}>×</button>}</div>
  const uploader = (label: string, folderKey: Folder, sub: string, meta: Parameters<typeof upload>[3], key: string) => <label className="b s-btn on-light xs" style={{ cursor: 'pointer' }}>{uploading === key ? 'Uploading…' : label}<input type="file" hidden accept="application/pdf,image/*,.docx,.xlsx,.csv" disabled={!!uploading} onChange={async (e) => { const f = e.target.files?.[0]; e.target.value = ''; if (!f) return; setUploading(key); const r = await upload(folderKey, sub, f, meta, who); setUploading(null); if (r.error) return toast('The upload failed. ' + friendlyError(r.error)); await load(); toast('Filed'); void logActivity('write', 'records', { folder: folderKey, kind: meta.kind }) }} /></label>

  if (loading) return <><h1>Records</h1><div className="ma-sub">Opening the archive…</div><div className="ma-panel"><p className="ma-empty">One moment.</p></div></>
  const treasury = coms.find((c) => c.key === 'treasury')
  const today = dayET()

  return <>
    <Head title="Records" lede="The Institute’s living archive — financial reports, Board meeting agendas and minutes, and every committee report once its Board meeting has passed. You see the folders your role allows." />
    {error && <div className="cert-err" role="alert">{error}</div>}
    <div className="folders">{FOLDERS.filter((f) => allowed.includes(f.key)).map((f) => <button type="button" key={f.key} className={`folder ${folder === f.key ? 'on' : ''}`} onClick={() => setFolder(f.key)}><span className="ic">{folder === f.key ? '📂' : '📁'}</span><b>{f.label}</b><small>{f.blurb}</small></button>)}</div>

    {folder === 'financials' && treasury && <>
      <Sec r="one per month · the QuickBooks P&L and balance sheet attach to each">Treasurer reports</Sec>
      {(() => { const rows = reports.filter((r) => r.committee_id === treasury.id && r.status === 'submitted').sort((a, b) => (b.period_ym ?? '').localeCompare(a.period_ym ?? '')); return rows.length ? rows.map((r) => <div key={r.id} className="recgrp"><div className="rh"><button type="button" className="plink" onClick={() => setView(r)}>{r.period_label}</button><small>{r.submitted_by_name} · {r.submitted_at ? fmtD(r.submitted_at) : ''}{isLocked(r) ? ' · locked' : ' · still editable until the Board meeting'}</small></div>{recs.filter((x) => x.report_id === r.id).map(fileRow)}</div>) : <div className="bnodata">No Treasurer reports filed yet. The Treasurer files them from the Reports tab.</div> })()}
      <Sec r="statements and documents not tied to a monthly report">Other financial documents</Sec>
      {recs.filter((r) => r.folder === 'financials' && !r.report_id).map(fileRow)}
      {(oversight || treasurer) && <div style={{ marginTop: 8 }}>{uploader('+ Upload a financial document', 'financials', 'general', { kind: 'other', title: 'Financial document' }, 'fin-other')}</div>}
    </>}

    {folder === 'board_meetings' && <>
      <Sec r="third Tuesday · agenda before, minutes after">Board meetings</Sec>
      {[...meetings].sort((a, b) => b.starts_at.localeCompare(a.starts_at)).filter((m) => startDay(m) <= addDays(today, 45) || recs.some((r) => r.event_id === m.id)).map((m) => { const d = startDay(m); const files = recs.filter((r) => r.event_id === m.id || (r.folder === 'board_meetings' && r.meeting_date === d)); return <div key={m.id} className="recgrp"><div className="rh"><b>{dayLabel(d, { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}</b><small>{startDay(m) > today ? 'upcoming · file the agenda here' : m.title}{m.agenda ? ` · ${m.agenda.slice(0, 80)}` : ''}</small></div>
        {files.length ? files.map(fileRow) : <div className="muted" style={{ fontSize: 13 }}>No agenda or minutes filed yet.</div>}
        {oversight && <div style={{ display: 'flex', gap: 6, marginTop: 6, flexWrap: 'wrap' }}>{uploader('+ Agenda', 'board_meetings', d, { kind: 'agenda', title: `Agenda — ${fmtD(d)}`, event_id: m.id, meeting_date: d }, `ag-${m.id}`)}{uploader('+ Minutes', 'board_meetings', d, { kind: 'minutes', title: `Minutes — ${fmtD(d)}`, event_id: m.id, meeting_date: d }, `mi-${m.id}`)}{uploader('+ Other', 'board_meetings', d, { kind: 'other', title: `Document — ${fmtD(d)}`, event_id: m.id, meeting_date: d }, `ot-${m.id}`)}</div>}</div> })}
      {oversight && <><Sec r="meetings that pre-date the calendar">Archived meetings</Sec>
        {recs.filter((r) => r.folder === 'board_meetings' && !r.event_id && !meetings.some((m) => startDay(m) === r.meeting_date)).map(fileRow)}
        <div style={{ marginTop: 8 }}><ArchiveUpload onUpload={async (date, kind, f) => { setUploading('arch'); const r = await upload('board_meetings', date, f, { kind, title: `${KIND_LABEL[kind]} — ${fmtD(date)}`, meeting_date: date }, who); setUploading(null); if (r.error) return toast('The upload failed. ' + friendlyError(r.error)); await load(); toast('Filed') }} busy={uploading === 'arch'} /></div></>}
    </>}

    {folder === 'committee_reports' && <>
      <div className="ctc-srow" style={{ gridTemplateColumns: 'auto 1fr' }}><select className="fi" value={com} onChange={(e) => setCom(e.target.value === 'all' ? 'all' : Number(e.target.value))} aria-label="Committee"><option value="all">All committees you can see</option>{coms.filter((c) => c.key !== 'treasury' && (oversight || access.committees.some((a) => a.id === c.id))).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select><span /></div>
      {(() => {
        const rows = reports.filter((r) => r.status === 'submitted' && isLocked(r) && r.committee_id !== treasury?.id && (com === 'all' || r.committee_id === com))
        const byYm = new Map<string, Report[]>(); for (const r of rows) { const k = r.period_ym ?? '0000-00'; byYm.set(k, [...(byYm.get(k) ?? []), r]) }
        const yms = [...byYm.keys()].sort((a, b) => b.localeCompare(a))
        if (!yms.length) return <div className="bnodata">Nothing filed yet — a report moves here once the Board meeting it was written for has passed.</div>
        return yms.map((ym) => <div key={ym} className="recgrp"><div className="rh"><b>{ym === '0000-00' ? 'Undated' : monthLabel(ym)}</b><small>{byYm.get(ym)!.length} report{byYm.get(ym)!.length > 1 ? 's' : ''}{byYm.get(ym)![0]?.meeting_date ? ` · ${fmtD(byYm.get(ym)![0]!.meeting_date)} Board meeting` : ''}</small></div>
          {byYm.get(ym)!.sort((a, b) => a.committee_id - b.committee_id).map((r) => <div key={r.id} className="recrow"><button type="button" className="rdoc" onClick={() => setView(r)}>📑 {coms.find((c) => c.id === r.committee_id)?.name ?? 'Committee'} · {r.period_label}<small>{r.submitted_by_name} · {r.submitted_at ? fmtTs(r.submitted_at) : ''}</small></button><Pill kind="ok">filed</Pill></div>)}
          {recs.filter((r) => r.folder === 'committee_reports' && r.period_ym === ym && (com === 'all' || r.committee_id === com)).map(fileRow)}</div>)
      })()}
    </>}

    {view && <Modal onClose={() => setView(null)} wide cls="print-area">
      <div className="mh"><div><h3>{coms.find((c) => c.id === view.committee_id)?.name ?? 'Committee'} · {view.period_label}</h3><p>Submitted by {view.submitted_by_name ?? '—'}{view.submitted_at ? ' · ' + fmtTs(view.submitted_at) : ''}{view.meeting_date ? ` · for the ${fmtD(view.meeting_date)} Board meeting` : ''}{view.edited_at ? ` · edited ${fmtTs(view.edited_at)} by ${view.edited_by_name}` : ''}</p></div><button type="button" className="x" onClick={() => setView(null)} aria-label="Close">×</button></div>
      <div className="mb">{(() => { const c = coms.find((x) => x.id === view.committee_id); const t = c ? TEMPLATES[c.key] : undefined; return t ? <ReportBody r={view} t={t} docs={recs.filter((d) => d.report_id === view.id).map((d) => ({ ...d, report_id: d.report_id }))} /> : <p>{view.narrative}</p> })()}</div>
      <div className="mf evt-foot"><span><button type="button" className="b s-btn on-light sm" onClick={() => window.print()}>Print / save as PDF</button></span><button type="button" className="b p-btn sm" onClick={() => setView(null)}>Close</button></div>
    </Modal>}
  </>
}

function ArchiveUpload({ onUpload, busy }: { onUpload: (date: string, kind: string, f: File) => Promise<void>; busy: boolean }) {
  const [date, setDate] = useState(''); const [kind, setKind] = useState('minutes')
  return <div className="archup"><label className="flabel">File an older meeting’s document</label><div className="r"><input className="fi" type="date" value={date} onChange={(e) => setDate(e.target.value)} /><select className="fi" value={kind} onChange={(e) => setKind(e.target.value)}><option value="agenda">Agenda</option><option value="minutes">Minutes</option><option value="other">Other</option></select><label className="b s-btn on-light sm" style={{ cursor: date ? 'pointer' : 'not-allowed', opacity: date ? 1 : 0.5 }}>{busy ? 'Uploading…' : 'Choose file'}<input type="file" hidden disabled={!date || busy} accept="application/pdf,image/*,.docx" onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f && date) void onUpload(date, kind, f) }} /></label></div></div>
}
