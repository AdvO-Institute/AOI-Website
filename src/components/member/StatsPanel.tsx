/* ----------------------------------------------------------------------------
 * Stats — the Board-facing dashboard. Pick a month, quarter, year or custom
 * range; the table shows the period before it beside it, and the change.
 *
 * Counts (members, certified doctors, interns …) are taken at the end of each
 * period: the snapshot locked on the 1st of the month after it, or the live
 * number for the period we are in. Totals (registrations, money) are added up
 * across the period. ▸ rows open today's list behind the number. The month
 * lock and the hand-entered financial figures sit folded at the bottom.
 * -------------------------------------------------------------------------- */
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useAccess } from '@/lib/queries/AccessProvider'
import { fmtDate } from '@/lib/dates'
import { useToast } from '@/components/ui/Toast'
import { live as loadLive, list as loadList, snapshots as loadSnapshots, lockMonth, saveFinancials, money, registrationsBetween } from '@/lib/queries/stats'
import type { Live, Snapshot, ListRow } from '@/lib/queries/stats'
import { reports as loadReports, committees as loadCommittees, TEMPLATES, isMoney, num } from '@/lib/queries/reports'
import type { Report, Committee } from '@/lib/queries/reports'
import { dayET, monthLabel } from '@/lib/queries/meetings'
import { logActivity } from '@/lib/queries/attention'
import { Modal, Head, Sec, friendly } from './opsUi'

/* ------------------------------------------------------------ periods */
type Mode = 'month' | 'quarter' | 'year' | 'custom'
/** A run of whole months: first month 'YYYY-MM' and how many. */
type Period = { start: string; months: number }
const addM = (ym: string, n: number) => { const [y, m] = ym.split('-').map(Number); const d = new Date(Date.UTC(y!, m! - 1 + n, 1)); return d.toISOString().slice(0, 7) }
const endM = (p: Period) => addM(p.start, p.months - 1)
const before = (p: Period): Period => ({ start: addM(p.start, -p.months), months: p.months })
const after = (p: Period): Period => ({ start: addM(p.start, p.months), months: p.months })
const span = (a: string, b: string) => { const [y1, m1] = a.split('-').map(Number); const [y2, m2] = b.split('-').map(Number); return (y2! - y1!) * 12 + (m2! - m1!) + 1 }
const mon = (ym: string, year = false) => new Date(ym + '-15T12:00:00Z').toLocaleDateString('en-US', { month: 'short', ...(year ? { year: 'numeric' } : {}), timeZone: 'UTC' })
function periodFor(mode: Mode, ym: string): Period {
  const [y, m] = ym.split('-').map(Number)
  if (mode === 'quarter') return { start: `${y}-${String(Math.floor((m! - 1) / 3) * 3 + 1).padStart(2, '0')}`, months: 3 }
  if (mode === 'year') return { start: `${y}-01`, months: 12 }
  return { start: ym, months: 1 }
}
function label(mode: Mode, p: Period, short = false) {
  const [y, m] = p.start.split('-').map(Number)
  if (mode === 'quarter') return `Q${Math.floor((m! - 1) / 3) + 1}${short ? '' : ' '}${short ? ` ’${String(y).slice(2)}` : y}`
  if (mode === 'year') return String(y)
  if (p.months === 1) return short ? mon(p.start) : monthLabel(p.start)
  return `${mon(p.start)}${p.start.slice(0, 4) !== endM(p).slice(0, 4) ? ' ' + p.start.slice(0, 4) : ''} – ${mon(endM(p), true)}`
}

/* --------------------------------------------------------------- rows */
type Row = { sec: string; label: string; live: string; snap?: keyof Snapshot; kind?: string; note?: string; money?: boolean }
const ROWS: Row[] = [
  { sec: 'Membership', label: 'Current members', live: 'members_current', snap: 'members_current', kind: 'members_current' },
  { sec: 'Membership', label: 'Recently expired', live: 'members_expired_recent', kind: 'members_expired', note: 'lapsed under a year' },
  { sec: 'Membership', label: 'Inactive', live: 'members_inactive', kind: 'members_expired', note: 'lapsed over a year' },
  { sec: 'Membership', label: 'Total members', live: 'members_total', snap: 'members_total', kind: 'members_current' },
  { sec: 'Certified doctors', label: 'Student certified', live: 'cert_student', snap: 'cert_student', kind: 'cert_student' },
  { sec: 'Certified doctors', label: 'Level 1', live: 'cert_level1', snap: 'cert_level1', kind: 'cert_level1' },
  { sec: 'Certified doctors', label: 'Level 2 / Board Certified', live: 'cert_level2', snap: 'cert_level2', kind: 'cert_level2' },
  { sec: 'Certified doctors', label: 'Current instructors', live: 'instructors', snap: 'instructors', kind: 'instructors' },
  { sec: 'In process', label: 'Toward Student', live: 'inproc_student', snap: 'inproc_student', kind: 'inproc' },
  { sec: 'In process', label: 'Toward Level 1', live: 'inproc_level1', snap: 'inproc_level1', kind: 'inproc' },
  { sec: 'In process', label: 'Toward Level 2', live: 'inproc_level2', snap: 'inproc_level2', kind: 'inproc' },
  { sec: 'Internships', label: 'Training centers', live: 'internship_centers', snap: 'internship_centers', kind: 'centers', note: 'certified preceptors' },
  { sec: 'Internships', label: 'Active interns', live: 'active_interns', snap: 'active_interns', kind: 'interns' },
  { sec: 'Internships', label: 'Queued interns', live: 'queued_interns', snap: 'queued_interns', kind: 'queued', note: 'interested, not yet paired' },
  { sec: 'Research', label: 'Projects', live: 'research_projects', snap: 'research_projects', kind: 'research' },
  { sec: 'Research', label: 'Raised', live: 'research_raised', snap: 'research_funding', kind: 'research', money: true },
  { sec: 'Research', label: 'Institutional overhead', live: 'research_overhead', kind: 'research', money: true, note: 'from the project ledgers' },
  { sec: 'Board, events & outreach', label: 'Board nominees', live: 'nominees', kind: 'nominees' },
  { sec: 'Board, events & outreach', label: 'Upcoming events', live: 'upcoming_events', kind: 'upcoming', note: 'published on the site' },
  { sec: 'Board, events & outreach', label: 'Active partnerships', live: 'partnerships', kind: 'partners' },
]
type Totals = { regs: { count: number; cents: number } | null; revenue: number | null }

export default function StatsPanel() {
  const toast = useToast()
  const { can } = useAccess()
  const oversight = can('full_admin') || can('board')
  const [L, setL] = useState<Live>({}); const [snaps, setSnaps] = useState<Snapshot[]>([]); const [reports, setReports] = useState<Report[]>([]); const [coms, setComs] = useState<Committee[]>([])
  const [loading, setLoading] = useState(true); const [listOpen, setListOpen] = useState<{ title: string; kind: string } | null>(null)
  const [fin, setFin] = useState({ revenue: '', institutional_overhead: '', expenses: '' })
  const cur = dayET().slice(0, 7); const curSnap = snaps.find((s) => s.period.slice(0, 7) === cur)

  const [mode, setMode] = useState<Mode>('quarter')
  // Month and quarter open on the last complete one (a period in progress has partial
  // totals); year opens on this year so far beside last year.
  const [period, setPeriod] = useState<Period>(() => before(periodFor('quarter', dayET().slice(0, 7))))
  const [from, setFrom] = useState(addM(cur, -2)); const [to, setTo] = useState(cur)
  const pick = (m: Mode) => { setMode(m); setPeriod(m === 'custom' ? { start: from, months: Math.max(1, span(from, to)) } : m === 'year' ? periodFor(m, cur) : before(periodFor(m, cur))) }
  const prev = before(period)
  const isNow = (p: Period) => p.start <= cur && cur <= endM(p)
  const future = period.start > cur

  const load = useCallback(async () => {
    const [l, s, r, c] = await Promise.all([loadLive(), loadSnapshots(), loadReports(), loadCommittees()])
    setL(l); setSnaps(s); setReports(r.rows); setComs(c); setLoading(false)
    const cs = s.find((x) => x.period.slice(0, 7) === cur)
    setFin({ revenue: cs?.revenue != null ? String(cs.revenue) : '', institutional_overhead: cs?.institutional_overhead != null ? String(cs.institutional_overhead) : '', expenses: cs?.expenses != null ? String(cs.expenses) : '' })
  }, [cur])
  useEffect(() => { void load() }, [load])

  // Monthly revenue: the Treasurer's reports where filed, otherwise the figure entered on the snapshot.
  const revenueByMonth = useMemo(() => {
    const m = new Map<string, number>()
    for (const s of snaps) if (s.revenue != null) m.set(s.period.slice(0, 7), s.revenue)
    const treasury = coms.find((c) => c.key === 'treasury')
    if (treasury) for (const r of reports) if (r.committee_id === treasury.id && r.status === 'submitted' && r.period_ym) { const v = num(r, 'revenue'); if (v != null) m.set(r.period_ym.slice(0, 7), v) }
    return m
  }, [snaps, reports, coms])
  const revenueIn = useCallback((p: Period) => { let t = 0, any = false; for (let i = 0; i < p.months; i++) { const v = revenueByMonth.get(addM(p.start, i)); if (v != null) { t += v; any = true } } return any ? t : null }, [revenueByMonth])

  // Totals for the two periods on screen.
  const [totals, setTotals] = useState<{ a: Totals; b: Totals } | null>(null)
  useEffect(() => {
    let off = false
    const until = (p: Period) => `${addM(endM(p), 1)}-01`
    void Promise.all([registrationsBetween(`${prev.start}-01`, until(prev)), registrationsBetween(`${period.start}-01`, until(period))]).then(([a, b]) => {
      if (!off) setTotals({ a: { regs: a, revenue: revenueIn(prev) }, b: { regs: b, revenue: revenueIn(period) } })
    })
    return () => { off = true }
  }, [period, revenueIn]) // prev follows from period

  if (loading) return <><h1>Stats</h1><div className="ma-sub">Counting…</div><div className="ma-panel"><p className="ma-empty">One moment.</p></div></>

  /** A count at the end of a period: live for the period we are in, else the snapshot after it. */
  const snapAt = (p: Period) => {
    const next = addM(endM(p), 1)
    return snaps.find((s) => s.period.slice(0, 7) === next) ?? [...snaps].reverse().find((s) => s.period.slice(0, 7) >= p.start && s.period.slice(0, 7) <= endM(p)) ?? null
  }
  const valueAt = (r: Row, p: Period): number | null => {
    if (p.start > cur) return null
    if (isNow(p)) return L[r.live] ?? 0
    const s = snapAt(p)
    return r.snap && s && s[r.snap] != null ? Number(s[r.snap]) : null
  }
  const fmtN = (n: number | null, isMoneyRow?: boolean) => n == null ? '—' : isMoneyRow ? money(n) : n.toLocaleString('en-US')
  const change = (a: number | null, b: number | null, isMoneyRow?: boolean) => {
    if (a == null || b == null) return <span className="sd-flat">—</span>
    const d = b - a
    if (!d) return <span className="sd-flat">— same</span>
    const s = isMoneyRow ? money(Math.abs(d)) : Math.abs(d).toLocaleString('en-US')
    return d > 0 ? <span className="sd-up">▲ {s}</span> : <span className="sd-down">▼ {s}</span>
  }
  const liveNote = (r: Row) => !isNow(period) ? r.note : r.live === 'research_projects' ? `${L.research_active ?? 0} active`
    : r.live === 'research_raised' ? `of ${money(L.research_goal ?? 0)} goal${L.research_goal ? ` · ${Math.round((L.research_raised ?? 0) / L.research_goal * 100)}%` : ''}`
    : r.live === 'nominees' && L.nominees_pending ? `${L.nominees_pending} acceptance${L.nominees_pending > 1 ? 's' : ''} outstanding`
    : r.live === 'partnerships' ? `${L.outreach_events ?? 0} outreach event${L.outreach_events === 1 ? '' : 's'} coming` : r.note

  const nowLabel = (p: Period) => `${label(mode, p)}${isNow(p) ? ' · so far' : ''}`
  const A = totals?.a, B = totals?.b
  const kpis: [string, number | null, number | null, boolean?][] = [
    ['Current members', valueAt(ROWS[0]!, prev), valueAt(ROWS[0]!, period)],
    ['Level 1 doctors', valueAt(ROWS[5]!, prev), valueAt(ROWS[5]!, period)],
    ['Level 2 doctors', valueAt(ROWS[6]!, prev), valueAt(ROWS[6]!, period)],
    ['Instructors', valueAt(ROWS[7]!, prev), valueAt(ROWS[7]!, period)],
    ['Registrations', A?.regs?.count ?? null, B?.regs?.count ?? null],
    ['Registration payments', A?.regs ? A.regs.cents / 100 : null, B?.regs ? B.regs.cents / 100 : null, true],
  ]

  // Trend: six bars of the chosen unit, ending at the period on screen.
  const unit: Period = mode === 'custom' ? { start: endM(period), months: 1 } : period
  const series = Array.from({ length: 6 }, (_, i) => { let p = unit; for (let k = 0; k < 5 - i; k++) p = before(p); return p })
  const bars = (vals: (number | null)[], fmt: (n: number) => string) => { const max = Math.max(...vals.map((v) => v ?? 0), 1); return <div className="bars">{series.map((p, i) => <i key={i} className={isNow(p) ? 'live' : 'on'} style={{ height: `${Math.round((vals[i] ?? 0) / max * 100)}%` }} data-l={mode === 'custom' ? mon(p.start) : label(mode, p, true)}><b>{vals[i] == null ? '—' : fmt(vals[i]!)}</b></i>)}</div> }

  const latestByCommittee = coms.map((c) => ({ c, r: reports.filter((r) => r.committee_id === c.id && r.status === 'submitted').sort((a, b) => (b.period_ym ?? '').localeCompare(a.period_ym ?? ''))[0] })).filter((x) => x.r && TEMPLATES[x.c.key]?.nums?.length)

  function exportCsv() {
    const q = (s: unknown) => `"${String(s ?? '').replace(/"/g, '""')}"`
    const lines = [['Measure', label(mode, prev), label(mode, period)].map(q).join(','),
      ...ROWS.map((r) => [r.label, valueAt(r, prev), valueAt(r, period)].map(q).join(',')),
      [q('Registrations'), q(A?.regs?.count), q(B?.regs?.count)].join(','),
      [q('Registration payments ($)'), q(A?.regs ? A.regs.cents / 100 : ''), q(B?.regs ? B.regs.cents / 100 : '')].join(','),
      [q('Revenue, Treasurer ($)'), q(A?.revenue), q(B?.revenue)].join(',')]
    const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([lines.join('\n')], { type: 'text/csv' })); a.download = `stats-${label(mode, period).replace(/[^\w]+/g, '-')}.csv`; a.click()
  }

  const sections = [...new Set(ROWS.map((r) => r.sec))]
  return <>
    <Head title="Stats" lede="Each period beside the one before it. Counts are taken at the end of each period; registrations and money are totals for the period. Rows marked ▸ open today’s list."
      right={<button type="button" className="b s-btn on-light sm" onClick={exportCsv}>↓ Export</button>} />

    <div className="sd-per">
      <div className="sd-seg" role="group" aria-label="Period">{(['month', 'quarter', 'year', 'custom'] as Mode[]).map((m) => <button type="button" key={m} className={mode === m ? 'on' : ''} aria-pressed={mode === m} onClick={() => pick(m)}>{m}</button>)}</div>
      {mode === 'custom'
        ? <div className="sd-cust"><label>From <input className="fi" type="month" value={from} max={to} onChange={(e) => { const v = e.target.value; if (!v) return; setFrom(v); setPeriod({ start: v, months: Math.max(1, span(v, to)) }) }} /></label><label>to <input className="fi" type="month" value={to} min={from} onChange={(e) => { const v = e.target.value; if (!v) return; setTo(v); setPeriod({ start: from, months: Math.max(1, span(from, v)) }) }} /></label></div>
        : <div className="sd-step"><button type="button" aria-label="Earlier" onClick={() => setPeriod(before(period))}>◂</button><b>{label(mode, period)}</b>{isNow(period) && <small>so far</small>}<button type="button" aria-label="Later" disabled={isNow(period) || future} onClick={() => setPeriod(after(period))}>▸</button></div>}
    </div>

    <div className="sd-kpis">{kpis.map(([l, a, b, m]) => <div key={l} className="sd-kpi"><span>{l}</span><b>{fmtN(b, m)}</b><i>{change(a, b, m)} <span className="sd-flat">vs {label(mode, prev, true)}</span></i></div>)}</div>

    <Sec r={`${label(mode, prev)} beside ${label(mode, period)}`}>At a glance</Sec>
    <div className="sd-tbl"><table>
      <thead><tr><th>Measure</th><th>{label(mode, prev)}</th><th>{nowLabel(period)}</th><th>Change</th><th aria-label="Open list" /></tr></thead>
      <tbody>
        {sections.map((s) => <SecRows key={s} name={s}>{ROWS.filter((r) => r.sec === s).map((r) => { const a = valueAt(r, prev), b = valueAt(r, period); const note = liveNote(r); return (
          <tr key={r.label} className={r.kind ? 'go' : ''} onClick={() => r.kind && setListOpen({ title: r.label, kind: r.kind })}>
            <td>{r.label}{note && <small>{note}</small>}</td><td>{fmtN(a, r.money)}</td><td><b>{fmtN(b, r.money)}</b></td><td>{change(a, b, r.money)}</td><td className="ar">{r.kind ? '▸' : ''}</td>
          </tr>) })}</SecRows>)}
        <SecRows name="Totals for the period">
          <tr><td>Registrations<small>paid or free, not canceled</small></td><td>{fmtN(A?.regs?.count ?? null)}</td><td><b>{fmtN(B?.regs?.count ?? null)}</b></td><td>{change(A?.regs?.count ?? null, B?.regs?.count ?? null)}</td><td /></tr>
          <tr><td>Registration payments<small>seats and CE certificates</small></td><td>{fmtN(A?.regs ? A.regs.cents / 100 : null, true)}</td><td><b>{fmtN(B?.regs ? B.regs.cents / 100 : null, true)}</b></td><td>{change(A?.regs ? A.regs.cents / 100 : null, B?.regs ? B.regs.cents / 100 : null, true)}</td><td /></tr>
          <tr><td>Revenue<small>from the Treasurer’s monthly reports</small></td><td>{fmtN(A?.revenue ?? null, true)}</td><td><b>{fmtN(B?.revenue ?? null, true)}</b></td><td>{change(A?.revenue ?? null, B?.revenue ?? null, true)}</td><td /></tr>
        </SecRows>
      </tbody>
    </table></div>
    <p className="sd-foot">— means no number was saved for that date: the monthly snapshot keeps most counts, but not the split between recently expired and inactive, research overhead, or the Board and events counts.</p>

    <Sec r={`one bar per ${mode === 'custom' ? 'month' : mode}; the dashed bar is still in progress`}>Trends</Sec>
    <div className="trends">
      <div className="trend"><h4>Current members</h4><p>at the end of each {mode === 'custom' ? 'month' : mode}</p>{bars(series.map((p) => valueAt(ROWS[0]!, p)), (n) => String(n))}</div>
      <div className="trend"><h4>Revenue</h4><p>from the Treasurer’s monthly reports, added up</p>{bars(series.map((p) => revenueIn(p)), (n) => n >= 1000 ? `$${(n / 1000).toFixed(1)}k` : money(n))}</div>
    </div>

    {latestByCommittee.length > 0 && <>
      <Sec r="the latest submitted report from each committee">Reported by the committees</Sec>
      <div className="sd-tbl"><table><tbody>{latestByCommittee.map(({ c, r }) => <tr key={c.id}><td><b>{c.name}</b><small>{r!.period_label}</small></td><td className="sd-nums">{TEMPLATES[c.key]!.nums!.map(([k, l]) => { const val = num(r!, k); return val == null ? null : <span key={k}><b>{isMoney(l) ? money(val) : val}</b> {l.replace(' ($)', '')}</span> })}</td></tr>)}</tbody></table></div>
    </>}

    {oversight && <details className="sd-snap">
      <summary>Monthly snapshot and financial figures</summary>
      <div className="lockrow"><span>🔒 {curSnap ? <><b>{monthLabel(cur)}</b> snapshot written {fmtDate(curSnap.created_at, { time: true })}.</> : <><b>{monthLabel(cur)}</b> has not been locked yet — the scheduled job locks each month at 12:05 am on the 1st; lock it early if the Board needs a fixed number.</>}</span>
        <span className="r"><button type="button" className="b s-btn on-light sm" onClick={async () => { const r = await lockMonth(cur + '-01'); if (r.error) return toast(friendly(r.error)); await load(); toast(`${monthLabel(cur)} locked — snapshot_stats() ran`); void logActivity('write', 'stats', { action: 'lock', period: cur }) }}>{curSnap ? 'Re-lock this month' : 'Lock in this month'}</button></span></div>
      <div className="trend" style={{ marginTop: 10 }}><h4>Financial figures — entered, not computed</h4><p>Revenue, institutional overhead and expenses for {monthLabel(cur)}. The Treasurer’s report carries the detail; these go on the snapshot for the trend.</p>
        <div className="fin">{(['revenue', 'institutional_overhead', 'expenses'] as const).map((k) => <div key={k}><label className="flabel">{k === 'institutional_overhead' ? 'Institutional overhead ($)' : k[0]!.toUpperCase() + k.slice(1) + ' ($)'}</label><input className="fi" type="number" value={fin[k]} onChange={(e) => setFin({ ...fin, [k]: e.target.value })} /></div>)}
          <button type="button" className="b s-btn on-light sm" onClick={async () => { const n = (s: string) => s === '' ? null : Number(s); const r = await saveFinancials(cur + '-01', { revenue: n(fin.revenue), institutional_overhead: n(fin.institutional_overhead), expenses: n(fin.expenses) }); if (r.error) return toast(friendly(r.error)); await load(); toast('Financial figures saved to the snapshot') }}>Save to {monthLabel(cur)}</button></div></div>
    </details>}

    {listOpen && <StatList title={listOpen.title} kind={listOpen.kind} onClose={() => setListOpen(null)} />}
  </>
}

function SecRows({ name, children }: { name: string; children: React.ReactNode }) {
  return <><tr className="sd-sec"><td colSpan={5}>{name}</td></tr>{children}</>
}

function StatList({ title, kind, onClose }: { title: string; kind: string; onClose: () => void }) {
  const [rows, setRows] = useState<ListRow[] | null>(null)
  useEffect(() => { void loadList(kind).then(setRows) }, [kind])
  return <Modal onClose={onClose}>
    <div className="mh"><div><h3>{title}</h3><p>{rows ? `${rows.length} ${rows.length === 1 ? 'entry' : 'entries'} today` : 'Reading…'} · names open in Contacts</p></div><button type="button" className="x" onClick={onClose} aria-label="Close">×</button></div>
    <div className="mb slist">{rows === null ? <p className="muted">One moment.</p> : rows.length === 0 ? <p className="muted">Nothing to list.</p> : rows.map((r, i) => <div key={i} className="il"><span>{r.id ? <a className="plink" href={`#leads`}>{r.name}</a> : r.name}</span><small>{r.note}</small></div>)}</div>
    <div className="mf"><button type="button" className="b p-btn sm" onClick={onClose}>Close</button></div>
  </Modal>
}
