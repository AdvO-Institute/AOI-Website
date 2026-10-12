/* ----------------------------------------------------------------------------
 * Stats — the Board-facing summary. Live tiles computed straight from the
 * tabs; ▸ tiles open the underlying list; trends from the monthly snapshot
 * (locked automatically on the 1st, or by hand); the latest numbers each
 * committee reported; revenue and cash from the Treasurer's reports.
 * -------------------------------------------------------------------------- */
import { useCallback, useEffect, useState } from 'react'
import { useAccess } from '@/lib/queries/AccessProvider'
import { fmtDate } from '@/lib/dates'
import { useToast } from '@/components/ui/Toast'
import { live as loadLive, list as loadList, snapshots as loadSnapshots, lockMonth, saveFinancials, money, monthShort } from '@/lib/queries/stats'
import type { Live, Snapshot, ListRow } from '@/lib/queries/stats'
import { reports as loadReports, committees as loadCommittees, TEMPLATES, isMoney, num } from '@/lib/queries/reports'
import type { Report, Committee } from '@/lib/queries/reports'
import { dayET, monthLabel } from '@/lib/queries/meetings'
import { logActivity } from '@/lib/queries/attention'
import { Modal, Head, Sec, friendly } from './opsUi'

export default function StatsPanel() {
  const toast = useToast()
  const { can } = useAccess()
  const oversight = can('full_admin') || can('board')
  const [L, setL] = useState<Live>({}); const [snaps, setSnaps] = useState<Snapshot[]>([]); const [reports, setReports] = useState<Report[]>([]); const [coms, setComs] = useState<Committee[]>([])
  const [loading, setLoading] = useState(true); const [listOpen, setListOpen] = useState<{ title: string; kind: string } | null>(null)
  const [fin, setFin] = useState({ revenue: '', institutional_overhead: '', expenses: '' })
  const cur = dayET().slice(0, 7); const curSnap = snaps.find((s) => s.period.slice(0, 7) === cur)

  const load = useCallback(async () => {
    const [l, s, r, c] = await Promise.all([loadLive(), loadSnapshots(), loadReports(), loadCommittees()])
    setL(l); setSnaps(s); setReports(r.rows); setComs(c); setLoading(false)
    const cs = s.find((x) => x.period.slice(0, 7) === cur)
    setFin({ revenue: cs?.revenue != null ? String(cs.revenue) : '', institutional_overhead: cs?.institutional_overhead != null ? String(cs.institutional_overhead) : '', expenses: cs?.expenses != null ? String(cs.expenses) : '' })
  }, [cur])
  useEffect(() => { void load() }, [load])

  if (loading) return <><h1>Stats</h1><div className="ma-sub">Counting…</div><div className="ma-panel"><p className="ma-empty">One moment.</p></div></>

  const tile = (n: number | string, label: string, kind?: string, cls = '', small?: string, title?: string) => <button type="button" key={label} className={`cert-tile stile ${kind ? 'open' : ''} ${cls}`} disabled={!kind} onClick={() => kind && setListOpen({ title: title ?? label, kind })}><span>{label}</span><b>{n}</b>{small && <i>{small}</i>}</button>
  const v = (k: string) => L[k] ?? 0
  const pct = v('research_goal') ? Math.round(v('research_raised') / v('research_goal') * 100) : 0
  // trend series: locked snapshots + today live
  const series = snaps.filter((s) => s.period.slice(0, 7) !== cur).map((s) => ({ label: monthShort(s.period), s, live: false })).concat([{ label: monthShort(cur + '-01') + ' · live', s: { members_current: v('members_current'), cert_level1: v('cert_level1'), cert_level2: v('cert_level2'), instructors: v('instructors'), revenue: curSnap?.revenue ?? null } as Snapshot, live: true }])
  const bars = (f: (s: Snapshot) => number | null, title: string, note: string, fmt = (n: number) => String(n)) => { const vals = series.map((x) => f(x.s) ?? 0); const max = Math.max(...vals, 1); return <div className="trend"><h4>{title}</h4><p>{note}</p><div className="bars">{series.map((x, i) => <i key={i} className={x.live ? 'live' : 'on'} style={{ height: `${Math.round(vals[i]! / max * 100)}%` }} data-l={x.label}><b>{f(x.s) == null ? '—' : fmt(f(x.s)!)}</b></i>)}</div></div> }
  // revenue series from the Treasurer's reports (revenue metric per month), falling back to the snapshot's hand-entered figure
  const treasury = coms.find((c) => c.key === 'treasury')
  const tRows = treasury ? reports.filter((r) => r.committee_id === treasury.id && r.status === 'submitted' && r.period_ym).sort((a, b) => a.period_ym!.localeCompare(b.period_ym!)) : []
  const revSeries = tRows.length ? tRows.map((r) => ({ label: monthShort(r.period_ym! + '-01'), value: num(r, 'revenue') })) : snaps.filter((s) => s.revenue != null).map((s) => ({ label: monthShort(s.period), value: s.revenue }))
  const latestByCommittee = coms.map((c) => ({ c, r: reports.filter((r) => r.committee_id === c.id && r.status === 'submitted').sort((a, b) => (b.period_ym ?? '').localeCompare(a.period_ym ?? ''))[0] })).filter((x) => x.r && TEMPLATES[x.c.key]?.nums?.length)

  return <>
    <Head title="Stats" lede="Live Institute numbers computed straight from the tabs — nothing here is typed in except the financial figures. Cards marked ▸ open the underlying list. Trends come from the monthly snapshot, locked on the 1st."
      right={<button type="button" className="b s-btn on-light sm" onClick={() => { const rows = Object.entries(L).map(([k, n]) => `${k},${n}`); const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([['metric,value', ...rows].join('\n')], { type: 'text/csv' })); a.download = `stats-${dayET()}.csv`; a.click() }}>↓ Export</button>} />
    <Sec r="from Members">Membership</Sec>
    <div className="cert-tiles four">{tile(v('members_total'), 'Total members', 'members_current', '', undefined, 'Members')}{tile(v('members_current'), 'Current', 'members_current', 'good')}{tile(v('members_expired_recent'), 'Recently expired', 'members_expired', v('members_expired_recent') ? 'warn' : '', 'lapsed under a year')}{tile(v('members_inactive'), 'Inactive', 'members_expired', '', 'lapsed over a year')}</div>
    <Sec r="highest certification per person · from Certifications and Instructors">Certified doctors</Sec>
    <div className="cert-tiles four">{tile(v('cert_student'), 'Student certified', 'cert_student')}{tile(v('cert_level1'), 'Level 1', 'cert_level1')}{tile(v('cert_level2'), 'Level 2 / Board Certified', 'cert_level2')}{tile(v('instructors'), 'Current instructors', 'instructors', 'good')}</div>
    <Sec r="people with a certification target">In process</Sec>
    <div className="cert-tiles three">{tile(v('inproc_student'), 'Toward Student', 'inproc')}{tile(v('inproc_level1'), 'Toward Level 1', 'inproc')}{tile(v('inproc_level2'), 'Toward Level 2', 'inproc')}</div>
    <Sec r="from Internships">Internships</Sec>
    <div className="cert-tiles three">{tile(v('internship_centers'), 'Training centers', 'centers', '', 'certified preceptors')}{tile(v('active_interns'), 'Active interns', 'interns')}{tile(v('queued_interns'), 'Queued interns', 'queued', '', 'interested, not yet paired')}</div>
    <Sec r="from Research">Research</Sec>
    <div className="cert-tiles three">{tile(v('research_projects'), 'Projects', 'research', '', `${v('research_active')} active`)}{tile(money(v('research_raised')), 'Raised vs goal', 'research', v('research_raised') ? 'good' : 'warn', `of ${money(v('research_goal'))} · ${pct}%`)}{tile(money(v('research_overhead')), 'Institutional overhead', 'research', '', 'from the project ledgers')}</div>
    <Sec r="from Board, Events and Colleges">Board, events &amp; outreach</Sec>
    <div className="cert-tiles four">{tile(v('nominees'), 'Board nominees', 'nominees', v('nominees_pending') ? 'warn' : '', v('nominees_pending') ? `${v('nominees_pending')} acceptance${v('nominees_pending') > 1 ? 's' : ''} outstanding` : undefined)}{tile(v('upcoming_events'), 'Upcoming events', 'upcoming', '', 'published on the site')}{tile(v('registrations_30d'), 'Registrations · 30 days', undefined, '', `${money(v('revenue_30d'))} taken`)}{tile(v('partnerships'), 'Active partnerships', 'partners', '', `${v('outreach_events')} outreach event${v('outreach_events') === 1 ? '' : 's'} coming`)}</div>

    <Sec r="one row per month · stat_snapshots">Trends</Sec>
    <div className="trends">
      {bars((s) => s.members_current, 'Current members over time', 'locked on the 1st of each month; the last bar is today, unlocked')}
      {revSeries.length ? <div className="trend"><h4>Revenue over time</h4><p>{tRows.length ? 'from the Treasurer’s monthly reports' : 'hand-entered on the snapshot until the Treasurer’s reports start'}</p><div className="bars">{revSeries.map((x, i) => { const max = Math.max(...revSeries.map((y) => y.value ?? 0), 1); return <i key={i} className="on" style={{ height: `${Math.round((x.value ?? 0) / max * 100)}%` }} data-l={x.label}><b>{money(x.value)}</b></i> })}</div></div>
        : bars((s) => (s.cert_level1 ?? 0) + (s.cert_level2 ?? 0), 'Certified doctors over time', 'Level 1 + Level 2 · revenue appears here once the Treasurer’s first report is in')}
    </div>
    {oversight && <>
      <div className="lockrow"><span>🔒 {curSnap ? <><b>{monthLabel(cur)}</b> snapshot written {fmtDate(curSnap.created_at, { time: true })}.</> : <><b>{monthLabel(cur)}</b> has not been locked yet — the scheduled job locks each month at 12:05 am on the 1st; lock it early if the Board needs a fixed number.</>}</span>
        <span className="r"><button type="button" className="b s-btn on-light sm" onClick={async () => { const r = await lockMonth(cur + '-01'); if (r.error) return toast(friendly(r.error)); await load(); toast(`${monthLabel(cur)} locked — snapshot_stats() ran`); void logActivity('write', 'stats', { action: 'lock', period: cur }) }}>{curSnap ? 'Re-lock this month' : 'Lock in this month'}</button></span></div>
      <div className="trend" style={{ marginTop: 10 }}><h4>Financial figures — entered, not computed</h4><p>Revenue, institutional overhead and expenses for {monthLabel(cur)}. The Treasurer’s report carries the detail; these go on the snapshot for the trend.</p>
        <div className="fin">{(['revenue', 'institutional_overhead', 'expenses'] as const).map((k) => <div key={k}><label className="flabel">{k === 'institutional_overhead' ? 'Institutional overhead ($)' : k[0]!.toUpperCase() + k.slice(1) + ' ($)'}</label><input className="fi" type="number" value={fin[k]} onChange={(e) => setFin({ ...fin, [k]: e.target.value })} /></div>)}
          <button type="button" className="b s-btn on-light sm" onClick={async () => { const n = (s: string) => s === '' ? null : Number(s); const r = await saveFinancials(cur + '-01', { revenue: n(fin.revenue), institutional_overhead: n(fin.institutional_overhead), expenses: n(fin.expenses) }); if (r.error) return toast(friendly(r.error)); await load(); toast('Financial figures saved to the snapshot') }}>Save to {monthLabel(cur)}</button></div></div>
    </>}

    {latestByCommittee.length > 0 && <>
      <Sec r="the latest submitted report from each committee">Reported by the committees</Sec>
      <div className="repgrid">{latestByCommittee.map(({ c, r }) => <div key={c.id} className="repcard"><div className="rh"><b>{c.name}</b><small>{r!.period_label}</small></div><div className="rnum">{TEMPLATES[c.key]!.nums!.map(([k, l]) => { const val = num(r!, k); return val == null ? null : <div key={k}><b>{isMoney(l) ? money(val) : val}</b><span>{l.replace(' ($)', '')}</span></div> })}</div></div>)}</div>
    </>}

    {listOpen && <StatList title={listOpen.title} kind={listOpen.kind} onClose={() => setListOpen(null)} />}
  </>
}

function StatList({ title, kind, onClose }: { title: string; kind: string; onClose: () => void }) {
  const [rows, setRows] = useState<ListRow[] | null>(null)
  useEffect(() => { void loadList(kind).then(setRows) }, [kind])
  return <Modal onClose={onClose}>
    <div className="mh"><div><h3>{title}</h3><p>{rows ? `${rows.length} ${rows.length === 1 ? 'entry' : 'entries'}` : 'Reading…'} · names open in Contacts</p></div><button type="button" className="x" onClick={onClose} aria-label="Close">×</button></div>
    <div className="mb slist">{rows === null ? <p className="muted">One moment.</p> : rows.length === 0 ? <p className="muted">Nothing to list.</p> : rows.map((r, i) => <div key={i} className="il"><span>{r.id ? <a className="plink" href={`#leads`}>{r.name}</a> : r.name}</span><small>{r.note}</small></div>)}</div>
    <div className="mf"><button type="button" className="b p-btn sm" onClick={onClose}>Close</button></div>
  </Modal>
}
