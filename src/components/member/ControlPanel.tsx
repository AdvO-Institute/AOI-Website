/* ----------------------------------------------------------------------------
 * Control center — strictly the Executive Director. One screen for the state
 * of the Institute: loose ends, committee by committee, who is showing up,
 * an audit trail of every consequential action, and every live number.
 * -------------------------------------------------------------------------- */
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useAccess } from '@/lib/queries/AccessProvider'
import { people as loadPeople, counts as loadCounts, activity as loadActivity, isExecutiveDirector, rolesText, actionText, daysSince, silentText, lastSeen, TAB_LABEL } from '@/lib/queries/control'
import type { EdPerson, Activity, Counts } from '@/lib/queries/control'
import { reports as loadReports, committees as loadCommittees, TEMPLATES, isMoney, num, isLocked, money, fmtTs, statusFor } from '@/lib/queries/reports'
import type { Report, Committee } from '@/lib/queries/reports'
import { tasks as loadTasks, isOverdue } from '@/lib/queries/tasks'
import type { Task } from '@/lib/queries/tasks'
import { calendar as loadCalendar, startDay } from '@/lib/queries/calendar'
import type { CalEvent } from '@/lib/queries/calendar'
import { records as loadRecords } from '@/lib/queries/records'
import type { Record_ } from '@/lib/queries/records'
import { live as loadLive, money as m$ } from '@/lib/queries/stats'
import type { Live } from '@/lib/queries/stats'
import { boardMeetings, currentCycle, monthLabel, prevMonth, fmtD, daysUntil, dayET } from '@/lib/queries/meetings'
import type { Meeting } from '@/lib/queries/meetings'
import { Pill, Modal, Head, Sec } from './opsUi'
import { ReportBody } from './ReportsPanel'

type Loose = { key: string; n: number; label: string; sub: string; tone: 'bad' | 'warn' | 'good'; rows: [string, string][] }

export default function ControlPanel() {
  const { access } = useAccess()
  const ed = isExecutiveDirector(access)
  const [ppl, setPpl] = useState<EdPerson[]>([]); const [cnt, setCnt] = useState<Counts>({}); const [act, setAct] = useState<Activity[]>([])
  const [reports, setReports] = useState<Report[]>([]); const [coms, setComs] = useState<Committee[]>([]); const [tasks, setTasks] = useState<Task[]>([]); const [cal, setCal] = useState<CalEvent[]>([]); const [recs, setRecs] = useState<Record_[]>([]); const [L, setL] = useState<Live>({}); const [meetings, setMeetings] = useState<Meeting[]>([])
  const [loading, setLoading] = useState(true)
  const [f, setF] = useState({ who: 'all', tab: 'all', kind: 'all', days: 30 })
  const [loose, setLoose] = useState<Loose | null>(null); const [view, setView] = useState<Report | null>(null)

  const load = useCallback(async () => {
    const [p, c, a, r, co, t, ca, re, l, mt] = await Promise.all([loadPeople(), loadCounts(), loadActivity(365), loadReports(), loadCommittees(), loadTasks(), loadCalendar(), loadRecords(), loadLive(), boardMeetings()])
    setPpl(p); setCnt(c); setAct(a); setReports(r.rows); setComs(co); setTasks(t.rows); setCal(ca.rows); setRecs(re.rows); setL(l); setMeetings(mt); setLoading(false)
  }, [])
  useEffect(() => { if (ed) void load() }, [ed, load])

  const today = dayET()
  const cycle = useMemo(() => currentCycle(meetings, today), [meetings, today])
  if (!ed) return <><h1>Control center</h1><div className="ma-panel"><p className="ma-empty">This tab is reserved for the Executive Director.</p></div></>
  if (loading) return <><h1>Control center</h1><div className="ma-sub">Reading every tab…</div><div className="ma-panel"><p className="ma-empty">One moment.</p></div></>

  const dueIn = daysUntil(cycle.dueDate, today)
  const status = statusFor(coms, reports, cycle.reportMonth)
  const staff = ppl.filter((p) => p.roles.length || p.nominee || p.has_login)

  /* ---- loose ends ---------------------------------------------------------- */
  const missing = status.filter((s) => s.state === 'miss')
  const staleDrafts = reports.filter((r) => r.status === 'draft' && (daysSince(r.submitted_at ?? undefined) ?? 99) >= 7)
  const overdue = tasks.filter(isOverdue)
  const unverified = tasks.filter((t) => t.status === 'done' && !t.verified_at)
  const elig = cnt.eligibility_pending ?? []
  const noms = cnt.nominees_pending ?? []
  const pastMeetings = meetings.filter((mm) => mm.date < today && mm.date >= prevMonth(prevMonth(today.slice(0, 7))) + '-01')
  const noMinutes = pastMeetings.filter((mm) => !recs.some((r) => (r.event_id === mm.id || r.meeting_date === mm.date) && r.kind === 'minutes'))
  const silent = staff.filter((p) => !p.nominee && !p.roles.every((r) => r.role_key.startsWith('past_'))).filter((p) => (daysSince(lastSeen(p)) ?? 999) >= 30)
  const LOOSE: Loose[] = [
    { key: 'reports', n: missing.length, label: dueIn < 0 ? 'reports overdue' : 'reports not yet filed', sub: `due ${fmtD(cycle.dueDate)} · ${monthLabel(cycle.reportMonth)}`, tone: dueIn < 0 && missing.length ? 'bad' : missing.length ? 'warn' : 'good', rows: missing.map((s) => [s.c.name, chairsOf(s.c).map((p) => p.name).join(', ') || 'no chair seated']) },
    { key: 'drafts', n: staleDrafts.length, label: 'drafts started, not submitted', sub: 'older than a week', tone: staleDrafts.length ? 'warn' : 'good', rows: staleDrafts.map((r) => [`${r.committees?.name ?? ''} · ${r.period_label}`, `saved by ${r.submitted_by_name ?? '—'}`]) },
    { key: 'tasks', n: overdue.length, label: 'tasks overdue', sub: 'across every committee', tone: overdue.length ? 'bad' : 'good', rows: overdue.map((t) => [t.title, `${t.assigned_name ?? 'unassigned'} · due ${fmtD(t.due_date)}`]) },
    { key: 'verify', n: unverified.length, label: 'done, awaiting your check-off', sub: 'completed but not verified', tone: unverified.length ? 'warn' : 'good', rows: unverified.map((t) => [t.title, `done by ${t.completed_by_name ?? '—'}${t.completed_at ? ' · ' + fmtTs(t.completed_at) : ''}`]) },
    { key: 'eligibility', n: elig.length, label: 'tickets to confirm eligibility', sub: 'student and faculty rates claimed at checkout', tone: elig.length ? 'warn' : 'good', rows: elig.map((e) => [`${e.name} · ${e.event}`, `${e.reg_type} ticket · ${fmtTs(e.created_at)} · confirm in Events`]) },
    { key: 'nominees', n: noms.length, label: 'nominees not yet accepted', sub: 'acceptance forms outstanding', tone: noms.length ? 'warn' : 'good', rows: noms.map((n) => [n.name, n.nominated ? `nominated ${fmtD(n.nominated)}` : 'nomination acceptance pending']) },
    { key: 'minutes', n: noMinutes.length, label: 'Board meetings without minutes', sub: 'last two months', tone: noMinutes.length ? 'warn' : 'good', rows: noMinutes.map((mm) => [fmtD(mm.date), 'no minutes filed in Records']) },
    { key: 'silent', n: silent.length, label: 'people silent 30+ days', sub: 'no sign-in or activity', tone: silent.length ? 'warn' : 'good', rows: silent.map((p) => [p.name, `${rolesText(p)} · last seen ${silentText(lastSeen(p))}`]) },
  ]
  function chairsOf(c: Committee) { return staff.filter((p) => p.roles.some((r) => (r.committee ?? '') === c.name && ['committee_chair', 'committee_cochair', 'research_director', 'treasurer'].includes(r.role_key))).sort((a, b) => (a.roles.some((r) => r.role_key === 'committee_cochair') ? 1 : 0) - (b.roles.some((r) => r.role_key === 'committee_cochair') ? 1 : 0)) }

  /* ---- committee card ------------------------------------------------------ */
  const card = (c: Committee) => {
    const chairs = chairsOf(c); const st = status.find((s) => s.c.id === c.id)
    const subs = reports.filter((r) => r.committee_id === c.id && r.status === 'submitted').sort((a, b) => (b.period_ym ?? '').localeCompare(a.period_ym ?? '')); const last = subs[0], prev = subs[1]
    const t = TEMPLATES[c.key]; const nums = (t?.nums ?? []).filter(([k]) => last && num(last, k) != null).slice(0, 3)
    const ct = tasks.filter((x) => x.committee_id === c.id); const open = ct.filter((x) => x.status === 'open'); const over = open.filter(isOverdue)
    const next = cal.filter((e) => e.committee_id === c.id && startDay(e) >= today).sort((a, b) => a.starts_at.localeCompare(b.starts_at))[0]
    const ends: string[] = []
    if (!chairs.length) ends.push('No chair seated')
    if (st?.state === 'miss') ends.push(`${monthLabel(cycle.reportMonth)} report not started`); else if (st?.state === 'draft') ends.push(`${monthLabel(cycle.reportMonth)} report still a draft`)
    if (!last) ends.push('Has never filed a report'); else if ((last.period_ym ?? '') < prevMonth(cycle.reportMonth)) ends.push(`Last report was ${last.period_label}`)
    if (over.length) ends.push(`${over.length} task${over.length > 1 ? 's' : ''} overdue`)
    for (const p of chairs) { const d = daysSince(lastSeen(p)); if (d == null || d >= 30) ends.push(`${p.name} has not signed in ${d == null ? 'yet' : `for ${d} days`}`) }
    const delta = (k: string, label: string) => { if (!prev) return null; const a = num(last!, k), b = num(prev, k); if (a == null || b == null) return null; const d = a - b; if (!d) return <small className="muted">· no change</small>; return <small className={d > 0 ? 'ok-txt' : 'warn-txt'}>{d > 0 ? '▲' : '▼'} {isMoney(label) ? money(Math.abs(d)) : Math.abs(d)}</small> }
    return <div key={c.id} className={`ccard ${ends.length ? 'flag' : ''}`}>
      <div className="ch"><div><h3>{c.name}</h3><div className="muted" style={{ fontSize: 12.5 }}>{chairs.length ? chairs.map((p, i) => <span key={p.id}>{i > 0 && ' · '}<a className="plink" href="#leads">{p.name}</a> <small>{p.roles.find((r) => r.committee === c.name)?.role_key === 'committee_cochair' ? 'co-chair' : c.key === 'research' ? 'director' : c.key === 'treasury' ? 'treasurer' : 'chair'} · seen {silentText(lastSeen(p))}</small></span>) : <i>no chair seated</i>}</div></div>
        <Pill kind={st?.state === 'ok' ? 'ok' : st?.state === 'draft' ? 'warn' : 'bad'}>{st?.state === 'ok' ? 'Filed' : st?.state === 'draft' ? 'Draft' : 'Missing'} · {monthLabel(cycle.reportMonth).slice(0, 3)}</Pill></div>
      <div className="ckv">
        <span>Last report</span><div>{last ? <><button type="button" className="plink" onClick={() => setView(last)}>{last.period_label}</button> <small className="muted">· {last.submitted_by_name}{last.submitted_at ? ' · ' + fmtD(last.submitted_at) : ''}{isLocked(last) ? '' : ' · open'}</small></> : <i>none yet</i>}</div>
        {nums.length > 0 && <><span>Numbers</span><div className="cnums">{nums.map(([k, l]) => <div key={k}><b>{isMoney(l) ? money(num(last!, k)) : num(last!, k)}</b> {delta(k, l)}<span>{l.replace(' ($)', '')}</span></div>)}</div></>}
        <span>Tasks</span><div>{open.length} open{over.length ? <> · <span className="warn-txt">{over.length} overdue</span></> : null}{ct.length - open.length ? ` · ${ct.length - open.length} done` : ''}{open.length > 0 && <div className="muted" style={{ fontSize: 12 }}>{open.slice(0, 2).map((x) => x.title + (x.assigned_name ? ' → ' + x.assigned_name.split(' ').pop() : '')).join(' · ')}</div>}</div>
        <span>Next meeting</span><div>{next ? `${fmtD(startDay(next))} · ${next.title}` : <i>none scheduled</i>}</div>
      </div>
      {ends.length ? <div className="cends">{ends.map((e, i) => <div key={i}>⚑ {e}</div>)}</div> : <div className="cends ok">✓ Nothing outstanding</div>}
      <div className="cfoot"><a className="b s-btn on-light xs" href="#reports">Reports</a><a className="b s-btn on-light xs" href="#tasks">Tasks</a>{chairs[0] && <button type="button" className="b s-btn on-light xs" onClick={() => { setF({ ...f, who: chairs[0]!.id }); document.querySelector('.feed')?.scrollIntoView({ behavior: 'smooth' }) }}>Audit trail</button>}</div>
    </div>
  }

  /* ---- people + feed -------------------------------------------------------- */
  const people = [...staff].filter((p) => !p.roles.every((r) => r.role_key.startsWith('past_')) || p.has_login).sort((a, b) => (daysSince(lastSeen(a)) ?? 9999) - (daysSince(lastSeen(b)) ?? 9999))
  const feed = act.filter((a) => (f.who === 'all' || a.person_id === f.who) && (f.tab === 'all' || a.tab === f.tab) && (f.kind === 'all' || a.kind === f.kind) && (daysSince(a.at) ?? 0) <= f.days)
  const exportCsv = () => { const cols = ['at', 'person_name', 'kind', 'tab', 'detail']; const csv = [cols.join(','), ...feed.map((a) => cols.map((c) => `"${String(c === 'detail' ? JSON.stringify(a.detail ?? {}) : (a as unknown as Record<string, unknown>)[c] ?? '').replace(/"/g, '""')}"`).join(','))].join('\n'); const el = document.createElement('a'); el.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' })); el.download = `audit-trail-${today}.csv`; el.click(); URL.revokeObjectURL(el.href) }
  const v = (k: string) => L[k] ?? 0

  return <>
    <Head title="Control center" lede="One screen for the state of the Institute: what is late, what each committee is doing, who is showing up, and an audit trail of every consequential action. Only the Executive Director can open this tab."
      right={<button type="button" className="b s-btn on-light sm" onClick={exportCsv}>↓ Export audit trail</button>} />
    <div className="cyc"><b>Cycle:</b> reporting on {monthLabel(cycle.reportMonth)} · due {fmtD(cycle.dueDate)} ({dueIn < 0 ? `${-dueIn} days ago` : dueIn === 0 ? 'today' : `in ${dueIn} days`}) · Board meets {fmtD(cycle.meetingDate)}{cycle.previous ? ` · last meeting ${fmtD(cycle.previous.date)}` : ''}</div>

    <Sec r="click a tile for the list · counts are live">Loose ends</Sec>
    <div className="cert-tiles four">{LOOSE.map((x) => <button type="button" key={x.key} className={`cert-tile stile open ${x.tone === 'good' ? (x.n ? '' : 'quiet') : x.tone}`} onClick={() => setLoose(x)}><span>{x.label}</span><b>{x.n}</b><i>{x.sub}</i></button>)}</div>

    <Sec r="chair · this cycle · last report · numbers with change from the report before · tasks · next meeting">Committees</Sec>
    <div className="cgrid">{coms.map(card)}</div>

    <Sec r="everyone with a role · last sign-in from the auth system, last action from the activity log">People &amp; engagement</Sec>
    <div className="ptbl"><table><thead><tr><th>Person</th><th>Roles</th><th>Last sign-in</th><th>Last action</th><th>Silent</th></tr></thead><tbody>
      {people.map((p) => { const d = daysSince(lastSeen(p)); return <tr key={p.id} className={d == null || d >= 30 ? 'quiet' : ''}><td><a className="plink" href="#leads">{p.name}</a>{!p.has_login && <><br /><small className="muted">no login yet</small></>}</td><td><small>{rolesText(p)}</small></td><td>{p.last_sign_in_at ? fmtTs(p.last_sign_in_at) : <i>never</i>}</td><td>{p.last_activity_at ? <>{actionText({ kind: p.last_kind as Activity['kind'], tab: p.last_tab, detail: p.last_detail })}<small className="muted"> · {fmtTs(p.last_activity_at)}</small></> : <i>no activity recorded yet</i>}</td><td className={d == null || d >= 30 ? 'silent-bad' : d >= 14 ? 'silent-warn' : 'silent-ok'}>{d == null ? 'never' : d >= 14 ? `${d} days` : silentText(lastSeen(p))}</td></tr> })}
    </tbody></table></div>

    <Sec r="who did what, when · sign-ins, tabs opened, consequential writes · recording since the last release">Audit trail</Sec>
    <div className="ctc-srow" style={{ gridTemplateColumns: 'auto auto auto auto 1fr', alignItems: 'center' }}>
      <select className="fi" value={f.who} onChange={(e) => setF({ ...f, who: e.target.value })} aria-label="Person"><option value="all">Everyone</option>{people.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select>
      <select className="fi" value={f.tab} onChange={(e) => setF({ ...f, tab: e.target.value })} aria-label="Tab"><option value="all">Every tab</option>{Object.entries(TAB_LABEL).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select>
      <select className="fi" value={f.kind} onChange={(e) => setF({ ...f, kind: e.target.value })} aria-label="Kind"><option value="all">Everything</option><option value="sign_in">Sign-ins</option><option value="tab_open">Tabs opened</option><option value="write">Changes made</option></select>
      <select className="fi" value={f.days} onChange={(e) => setF({ ...f, days: Number(e.target.value) })} aria-label="Window">{[7, 30, 90, 365].map((d) => <option key={d} value={d}>Last {d} days</option>)}</select>
      <span className="muted" style={{ fontSize: 12.5 }}>{feed.length} entr{feed.length === 1 ? 'y' : 'ies'}</span>
    </div>
    <div className="feed">{feed.length ? feed.map((a) => <div key={a.id} className={`fe ${a.kind}`}><span className="t">{fmtTs(a.at)}</span><span className="w">{a.person_name ?? '—'}</span><span className="a">{actionText(a)}{a.tab && a.kind === 'write' && <small> in {TAB_LABEL[a.tab] ?? a.tab}</small>}</span></div>) : <div className="bnodata">Nothing recorded in that window yet — the log started with the last release.</div>}</div>

    <Sec r={<>the full Stats set in one place · <a href="#stats">open Stats</a> for the trends</>}>All live numbers</Sec>
    <div className="numtbl">
      <div><span>Members</span><b>{v('members_total')} total · {v('members_current')} current · {v('members_expired_recent')} recently expired · {v('members_inactive')} inactive</b></div>
      <div><span>Certified</span><b>{v('cert_student')} student · {v('cert_level1')} Level 1 · {v('cert_level2')} Level 2 / Board Certified · {v('instructors')} instructors</b></div>
      <div><span>In process</span><b>{v('inproc_student')} toward Student · {v('inproc_level1')} toward Level 1 · {v('inproc_level2')} toward Level 2</b></div>
      <div><span>Internships</span><b>{v('internship_centers')} training centers · {v('active_interns')} active interns · {v('queued_interns')} queued</b></div>
      <div><span>Research</span><b>{v('research_projects')} projects ({v('research_active')} active) · {m$(v('research_raised'))} raised of {m$(v('research_goal'))} · {m$(v('research_overhead'))} overhead</b></div>
      <div><span>Board &amp; events</span><b>{v('nominees')} nominees ({v('nominees_pending')} pending) · {v('upcoming_events')} upcoming events · {v('outreach_events')} outreach · {v('partnerships')} active partnerships</b></div>
      <div><span>Registrations · 30 days</span><b>{cnt.registrations_30d ?? 0} paid or free · {m$(cnt.revenue_30d ?? 0)} taken · {elig.length} awaiting eligibility check</b></div>
    </div>

    {loose && <Modal onClose={() => setLoose(null)}>
      <div className="mh"><div><h3>{loose.n} {loose.label}</h3><p>{loose.sub}</p></div><button type="button" className="x" onClick={() => setLoose(null)} aria-label="Close">×</button></div>
      <div className="mb slist">{loose.rows.length ? loose.rows.map(([a, b], i) => <div key={i} className="il"><span>{a}</span><small>{b}</small></div>) : <p className="muted">Nothing outstanding.</p>}</div>
      <div className="mf"><button type="button" className="b p-btn sm" onClick={() => setLoose(null)}>Close</button></div>
    </Modal>}
    {view && <Modal onClose={() => setView(null)} wide cls="print-area">
      <div className="mh"><div><h3>{view.committees?.name ?? 'Committee'} · {view.period_label}</h3><p>Submitted by {view.submitted_by_name ?? '—'}{view.submitted_at ? ' · ' + fmtTs(view.submitted_at) : ''}</p></div><button type="button" className="x" onClick={() => setView(null)} aria-label="Close">×</button></div>
      <div className="mb">{(() => { const c = coms.find((x) => x.id === view.committee_id); const t = c ? TEMPLATES[c.key] : undefined; return t ? <ReportBody r={view} t={t} docs={recs.filter((d) => d.report_id === view.id)} /> : <p>{view.narrative}</p> })()}</div>
      <div className="mf"><button type="button" className="b p-btn sm" onClick={() => setView(null)}>Close</button></div>
    </Modal>}
  </>
}
