/* ----------------------------------------------------------------------------
 * Calendar — the quick "what's coming" view over the shared events table.
 * List (next 30 days, then future) by default; a month grid; Board meetings
 * on the third Tuesday through 2027. What each person sees follows their
 * role: members see the Board meeting as a date, leadership gets the Zoom
 * link. Seminars and conferences are managed from Events; meetings can be
 * added here.
 * -------------------------------------------------------------------------- */
import { friendlyError } from '@/lib/friendlyError'
import { useCallback, useEffect, useState } from 'react'
import { useAccess } from '@/lib/queries/AccessProvider'
import { useToast } from '@/components/ui/Toast'
import { calendar as loadCalendar, myRegisteredEventIds, createMeeting, updateMeeting, deleteMeeting, TYPE_LABEL, GOV, startDay, endDay, isPast, whenLine, dayLabel, toLocal, fromLocal } from '@/lib/queries/calendar'
import type { CalEvent, MeetingInput } from '@/lib/queries/calendar'
import { committees as loadCommittees } from '@/lib/queries/reports'
import type { Committee } from '@/lib/queries/reports'
import { dayET, daysUntil, monthLabel, nextMonth, prevMonth } from '@/lib/queries/meetings'
import { session } from '@/lib/supabase'
import { logActivity } from '@/lib/queries/attention'
import { Pill, F, Modal, Head, Sec, friendly, SafeLink, askConfirm } from './opsUi'

const ZOOM_SCHEDULE = 'https://zoom.us/meeting/schedule'

export default function CalendarPanel() {
  const toast = useToast()
  const { access, can, viewingAsMember } = useAccess()
  const oversight = can('full_admin') || can('board')
  const leads = access.committees.filter((c) => c.leads)
  const canAdd = oversight || leads.length > 0
  const [rows, setRows] = useState<CalEvent[]>([]); const [mine, setMine] = useState<Set<number>>(new Set()); const [coms, setComs] = useState<Committee[]>([])
  const [loading, setLoading] = useState(true); const [error, setError] = useState<string | null>(null)
  const [view, setView] = useState<'list' | 'month'>('list'); const [month, setMonth] = useState(dayET().slice(0, 7))
  const [detail, setDetail] = useState<CalEvent | null>(null); const [edit, setEdit] = useState<CalEvent | null | 'new'>(null)

  const load = useCallback(async () => {
    const [r, m, c] = await Promise.all([loadCalendar(), myRegisteredEventIds(session.user?.id ?? null), loadCommittees()])
    setError(r.error ? `The calendar could not be read. ${friendlyError(r.error)}` : null)
    /* The database still answers an admin viewing as a member as the admin:
     * drop drafts and the leadership-only Zoom links a member never gets. */
    const rows = viewingAsMember ? r.rows.filter((e) => e.status !== 'draft').map((e) => (e.visibility === 'leadership' || e.visibility === 'board' ? { ...e, zoom_url: null } : e)) : r.rows
    setRows(rows); setMine(m); setComs(c); setLoading(false)
  }, [viewingAsMember])
  useEffect(() => { void load() }, [load])

  const today = dayET()
  const upcoming = rows.filter((e) => !isPast(e, today)).sort((a, b) => a.starts_at.localeCompare(b.starts_at))
  const in30 = upcoming.filter((e) => daysUntil(startDay(e), today) <= 30), later = upcoming.filter((e) => daysUntil(startDay(e), today) > 30)
  const kind = (e: CalEvent) => e.event_type === 'board' ? 'gold' : e.event_type === 'deadline' ? 'bad' : GOV.has(e.event_type ?? '') || e.event_type === 'training' ? 'info' : ''
  const canEditRow = (e: CalEvent) => oversight || (!!e.committee_id && leads.some((c) => c.id === e.committee_id) && GOV.has(e.event_type ?? ''))

  const row = (e: CalEvent) => {
    const d = startDay(e); const n = daysUntil(d, today)
    return <div key={e.id} className={`cev ${mine.has(e.id) ? 'mine' : ''}`} onClick={() => setDetail(e)} role="button" tabIndex={0} onKeyDown={(k) => k.key === 'Enter' && setDetail(e)}>
      <div className="when"><b>{dayLabel(d, { month: 'short', day: 'numeric' })}</b>{dayLabel(d, { weekday: 'short' })}{n === 0 ? ' · today' : n === 1 ? ' · tomorrow' : d.slice(0, 4) !== today.slice(0, 4) ? ` · ${d.slice(0, 4)}` : ''}</div>
      <div><div className="ti">{e.is_keystone && <span className="star" title="Keystone event">★</span>}{e.title}<span className={`cev-type ${kind(e)}`}>{TYPE_LABEL[e.event_type ?? ''] ?? 'Event'}</span></div>
        <div className="l2"><span>{whenLine(e)}</span>{e.location && <span>· {e.location}</span>}{e.committee_id && <span>· {coms.find((c) => c.id === e.committee_id)?.name ?? 'Committee'}</span>}</div></div>
      <div className="rt">{e.zoom_url ? <Pill kind="link">Zoom</Pill> : e.has_zoom ? <small className="muted">Zoom · leadership</small> : null}{mine.has(e.id) && <Pill kind="ok">Registered</Pill>}{e.status === 'draft' && <Pill kind="warn">Draft</Pill>}</div>
    </div>
  }

  if (loading) return <><h1>Calendar</h1><div className="ma-sub">Reading the Institute calendar…</div><div className="ma-panel"><p className="ma-empty">One moment.</p></div></>
  return <>
    <Head title="Calendar" lede="Every meeting and event in one place — seminars and conferences from the Events tab, Board and committee meetings, deadlines. Board meetings are the third Tuesday of each month at 9:00 pm Eastern."
      right={<><div className="viewsw"><button type="button" className={view === 'list' ? 'on' : ''} onClick={() => setView('list')}>List</button><button type="button" className={view === 'month' ? 'on' : ''} onClick={() => setView('month')}>Month</button></div>
        {canAdd && <button type="button" className="b p-btn sm" onClick={() => setEdit('new')}>+ Add meeting</button>}
        <a className="b s-btn on-light sm" href={ZOOM_SCHEDULE} target="_blank" rel="noopener noreferrer">Schedule Zoom meeting</a></>} />
    {error && <div className="cert-err" role="alert">{error}</div>}
    {view === 'list' ? <>
      <Sec r="next 30 days">On the radar</Sec>
      {in30.length ? in30.map(row) : <div className="bnodata">Nothing in the next 30 days.</div>}
      <Sec>Future meetings &amp; events</Sec>
      {later.length ? later.map(row) : <div className="bnodata">Nothing further out yet.</div>}
    </> : <MonthGrid month={month} rows={rows} today={today} onMonth={setMonth} onOpen={setDetail} kind={kind} />}

    {detail && <Modal onClose={() => setDetail(null)} cls="evd">
      <div className="mh"><div><h3>{detail.is_keystone ? '★ ' : ''}{detail.title}</h3><p>{TYPE_LABEL[detail.event_type ?? ''] ?? 'Event'}{detail.committee_id ? ` · ${coms.find((c) => c.id === detail.committee_id)?.name ?? ''} Committee` : ''}{detail.subtitle ? ` · ${detail.subtitle}` : ''}</p></div><button type="button" className="x" onClick={() => setDetail(null)} aria-label="Close">×</button></div>
      <div className="mb"><div className="kv">
        <span>When</span><div>{dayLabel(startDay(detail), { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}{endDay(detail) !== startDay(detail) ? ` – ${dayLabel(endDay(detail), { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}` : ''} · {whenLine(detail)}</div>
        {detail.location && <><span>Where</span><div>{detail.location}</div></>}
        {detail.zoom_url ? <><span>Zoom</span><div><SafeLink className="b p-btn sm" href={detail.zoom_url}>Join the meeting</SafeLink></div></> : detail.has_zoom ? <><span>Zoom</span><div><small className="muted">The link is shared with directors, chairs and committee members.</small></div></> : null}
        {detail.agenda && <><span>Agenda</span><div style={{ whiteSpace: 'pre-line' }}>{detail.agenda}</div></>}
        {detail.audience && <><span>Audience</span><div>{detail.audience}</div></>}
        {(detail.event_type === 'seminar' || detail.event_type === 'conference') && <><span>Public site</span><div>{detail.status === 'published' ? 'Published — open for registration' : 'Draft — not yet on the public site'}</div></>}
        {mine.has(detail.id) && <><span>You</span><div><Pill kind="ok">Registered</Pill></div></>}
      </div></div>
      <div className="mf evt-foot"><span>{(detail.event_type === 'seminar' || detail.event_type === 'conference') && detail.slug && detail.status === 'published' && <a className="b s-btn on-light sm" href={`/seminars/${detail.slug}`}>Event page</a>}</span><span style={{ display: 'flex', gap: 8 }}>{canEditRow(detail) && GOV.has(detail.event_type ?? '') && <button type="button" className="b s-btn on-light sm" onClick={() => { const e = detail; setDetail(null); setEdit(e) }}>Edit</button>}{canEditRow(detail) && !GOV.has(detail.event_type ?? '') && <a className="b s-btn on-light sm" href="#events">Manage in Events</a>}<button type="button" className="b p-btn sm" onClick={() => setDetail(null)}>Close</button></span></div>
    </Modal>}
    {edit && <MeetingDialog e={edit === 'new' ? null : edit} coms={oversight ? coms : coms.filter((c) => leads.some((l) => l.id === c.id))} oversight={oversight} onClose={() => setEdit(null)} onSaved={async (m) => { setEdit(null); await load(); toast(m); void logActivity('write', 'calendar', { action: m }) }} createdBy={access.person?.id ?? null} />}
  </>
}

function MonthGrid({ month, rows, today, onMonth, onOpen, kind }: { month: string; rows: CalEvent[]; today: string; onMonth: (m: string) => void; onOpen: (e: CalEvent) => void; kind: (e: CalEvent) => string }) {
  const [y, m] = month.split('-').map(Number)
  const first = new Date(Date.UTC(y!, m! - 1, 1)); const days = new Date(Date.UTC(y!, m!, 0)).getUTCDate(); const pad = first.getUTCDay()
  const cells: (string | null)[] = []
  for (let i = 0; i < pad; i++) cells.push(null)
  for (let d = 1; d <= days; d++) cells.push(`${month}-${String(d).padStart(2, '0')}`)
  while (cells.length % 7) cells.push(null)
  return <>
    <div className="calnav"><button type="button" className="b s-btn on-light sm" onClick={() => onMonth(prevMonth(month))} aria-label="Previous month">‹</button><h3>{monthLabel(month)}</h3><button type="button" className="b s-btn on-light sm" onClick={() => onMonth(nextMonth(month))} aria-label="Next month">›</button><button type="button" className="b s-btn on-light sm" onClick={() => onMonth(today.slice(0, 7))}>Today</button></div>
    <div className="cal">{['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((d) => <div key={d} className="dh">{d}</div>)}
      {cells.map((d, i) => { if (!d) return <div key={i} className="d out" />; const evs = rows.filter((e) => startDay(e) <= d && endDay(e) >= d && !(e.ends_at == null && (e.category === 'free' || e.category === 'internship'))).sort((a, b) => a.starts_at.localeCompare(b.starts_at))
        return <div key={d} className={`d ${d === today ? 'today' : ''}`}><span className="n">{Number(d.slice(8))}</span>{evs.slice(0, 3).map((e) => <button type="button" key={e.id} className={`ev ${kind(e)}`} onClick={() => onOpen(e)} title={e.title}>{e.is_keystone ? '★ ' : ''}{e.title}</button>)}{evs.length > 3 && <div className="more">+{evs.length - 3} more</div>}</div> })}</div>
  </>
}

function MeetingDialog({ e, coms, oversight, onClose, onSaved, createdBy }: { e: CalEvent | null; coms: Committee[]; oversight: boolean; onClose: () => void; onSaved: (m: string) => void; createdBy: string | null }) {
  const toast = useToast()
  const [saving, setSaving] = useState(false)
  const [v, setV] = useState<MeetingInput & { start: string; end: string }>({
    title: e?.title ?? '', event_type: e?.event_type ?? (oversight ? 'committee' : 'committee'), committee_id: e?.committee_id ?? (coms.length === 1 ? coms[0]!.id : null), starts_at: e?.starts_at ?? '', ends_at: e?.ends_at ?? null,
    start: e ? toLocal(e.starts_at) : `${dayET()}T21:00`, end: e?.ends_at ? toLocal(e.ends_at) : `${dayET()}T22:00`,
    location: e?.location ?? 'Zoom', zoom_url: e?.zoom_url ?? '', agenda: e?.agenda ?? '', is_keystone: !!e?.is_keystone, visibility: (e?.visibility as MeetingInput['visibility']) ?? 'leadership',
  })
  async function save() {
    if (!v.title.trim()) return toast('Give the meeting a title')
    if (!v.start) return toast('Pick a start time')
    if (!oversight && !v.committee_id) return toast('Pick your committee')
    setSaving(true)
    const input: MeetingInput = { ...v, title: v.title.trim(), starts_at: fromLocal(v.start)!, ends_at: v.end ? fromLocal(v.end) : null }
    const r = e ? await updateMeeting(e.id, input) : await createMeeting(input, createdBy)
    setSaving(false)
    if (r.error) return toast(friendly(r.error, 'the Executive Director, the Board, or the chair of that committee'))
    onSaved(e ? 'Meeting updated' : 'Added — it shows on the Events tab too')
  }
  return <Modal onClose={onClose}>
    <div className="mh"><div><h3>{e ? 'Edit meeting' : 'Add meeting'}</h3><p>A committee meeting, a deadline, a Board meeting. Seminars and conferences with registration are added from the Events tab.</p></div><button type="button" className="x" onClick={onClose} aria-label="Close">×</button></div>
    <div className="mb"><div className="cert-grid mform evt-grid">
      <F l="Title" full><input className="fi" value={v.title} onChange={(ev) => setV({ ...v, title: ev.target.value })} placeholder="Required" autoFocus /></F>
      <F l="Type"><select className="fi" value={v.event_type} onChange={(ev) => setV({ ...v, event_type: ev.target.value })}><option value="committee">Committee meeting</option>{oversight && <option value="board">Board meeting</option>}<option value="meeting">Meeting</option><option value="deadline">Deadline</option><option value="training">Training</option></select></F>
      <F l="Committee"><select className="fi" value={v.committee_id ?? ''} onChange={(ev) => setV({ ...v, committee_id: ev.target.value ? Number(ev.target.value) : null })}>{oversight && <option value="">— none —</option>}{coms.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></F>
      <F l="Starts (Eastern)"><input className="fi" type="datetime-local" value={v.start} onChange={(ev) => setV({ ...v, start: ev.target.value })} /></F>
      <F l="Ends (Eastern)"><input className="fi" type="datetime-local" value={v.end} onChange={(ev) => setV({ ...v, end: ev.target.value })} /></F>
      <F l="Location"><input className="fi" value={v.location} onChange={(ev) => setV({ ...v, location: ev.target.value })} placeholder="Zoom, or an address" /></F>
      <F l="Zoom link" hint="Shown to directors, chairs and committee members only."><input className="fi" value={v.zoom_url} onChange={(ev) => setV({ ...v, zoom_url: ev.target.value })} placeholder="https://zoom.us/j/…" /></F>
      <F l="Who sees it"><select className="fi" value={v.visibility} onChange={(ev) => setV({ ...v, visibility: ev.target.value as MeetingInput['visibility'] })}><option value="members">All members (date only; Zoom link stays with leadership)</option><option value="leadership">Directors, chairs and committee members</option><option value="board">Board and ED only</option></select></F>
      <F l="Keystone"><label className="evt-tog"><input type="checkbox" checked={v.is_keystone} onChange={(ev) => setV({ ...v, is_keystone: ev.target.checked })} /> Mark with ★ on the calendar</label></F>
      <F l="Agenda / notes" full><textarea className="fi" value={v.agenda} onChange={(ev) => setV({ ...v, agenda: ev.target.value })} /></F>
    </div></div>
    <div className="mf evt-foot"><span>{e && <button type="button" className="b d-btn sm" onClick={async () => { if (!(await askConfirm('Remove this meeting from the calendar?', { body: 'This cannot be undone.', ok: 'Remove', danger: true }))) return; const r = await deleteMeeting(e.id); if (r.error) return toast(friendly(r.error)); onSaved('Meeting removed') }}>Remove</button>}</span><span style={{ display: 'flex', gap: 8 }}><button type="button" className="b s-btn on-light sm" onClick={onClose}>Cancel</button><button type="button" className="b p-btn sm" disabled={saving} onClick={() => void save()}>{saving ? 'Saving…' : e ? 'Save' : 'Add to calendar'}</button></span></div>
  </Modal>
}
