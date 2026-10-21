/* ----------------------------------------------------------------------------
 * Research Funding — the research funding directory compiled for members:
 * cash research grants and, kept apart from them, other kinds of research
 * support (prizes, travel awards, in-kind credits, fee-based services).
 * A tab on the Research Library page; who sees it is set in src/lib/nav.ts.
 *
 * The records are two static exports in public/data/research-funding/
 * (README and DATA_DICTIONARY beside them), fetched when the tab opens and
 * replaced by pull request. Nothing lives in Supabase.
 *
 * Rules the page keeps whatever the data says:
 *   - `aoi_affiliation` is shown under the heading "Application Pathway"; the
 *     key is never renamed.
 *   - "Open" is shown only when the export says the window was verified open,
 *     and never once a confirmed deadline has passed.
 *   - A confirmed deadline (an ISO date) is shown as a deadline; a cycle with
 *     only a last known date is shown as anticipated, never as upcoming.
 *   - Every entry shows the date its facts were last checked.
 * -------------------------------------------------------------------------- */
import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { SafeLink } from './opsUi'

type Details = {
  application_url: string | null
  award_typical: number | null
  funding_duration: string | null
  membership_details: string | null
  geographic_notes: string | null
  irb_requirements: string | null
  application_requirements: string[] | null
  allowable_expenses_notes: string | null
  aoi_affiliation_reasoning: string | null
}
type Program = {
  record_id: string
  program_name: string
  funding_organization: string
  mechanism: string
  award_amount: string | null
  award_min: number | null
  award_max: number | null
  currency: string | null
  research_categories: string | null
  eligible_study_types: string | null
  aoi_affiliation: string
  additional_eligibility_requirements: string | null
  application_deadline_or_cycle: string | null
  application_status: string | null
  official_program_url: string
  verification_date: string
  eligibility_notes: string | null
  details?: Partial<Details>
}
type Export = { schema: string; as_of: string; record_count: number; records: Program[] }

export const FUNDING_URLS = {
  grants: '/data/research-funding/research_grants.json',
  other: '/data/research-funding/other_research_support.json',
} as const

type SetKey = keyof typeof FUNDING_URLS
type StatusKey = 'open' | 'upcoming' | 'expired' | 'discontinued' | 'unknown'
type Sort = 'default' | 'deadline' | 'award-asc' | 'award-desc' | 'name'

const PATHWAYS = ['Independent', 'Independent / AOI', 'AOI Affiliation Suggested', 'AOI Affiliation Required', 'Eligibility Unconfirmed'] as const
const PATHWAY_MARK: Record<string, string> = {
  'Independent': 'independent',
  'Independent / AOI': 'either',
  'AOI Affiliation Suggested': 'suggested',
  'AOI Affiliation Required': 'required',
  'Eligibility Unconfirmed': 'unconfirmed',
}
const PATHWAY_HELP: Record<string, string> = {
  'Independent': 'Apply directly, or through your own practice where the funder accepts for-profit organizations. Other conditions may still apply.',
  'Independent / AOI': 'Your practice can be the applicant, or the Institute could apply or administer the award if its eligibility is confirmed.',
  'AOI Affiliation Suggested': 'You usually cannot apply alone. A qualifying nonprofit, institution or sponsor is needed; the Institute is one possible option.',
  'AOI Affiliation Required': 'The program specifically requires the Institute’s involvement.',
  'Eligibility Unconfirmed': 'A lead that needs one question answered before you invest time. The eligibility note says which question.',
}
const CYCLE_WORD: Record<string, string> = { annual: 'annual', biannual: 'twice a year', rolling: 'rolling', irregular: 'irregular', unknown: 'cycle unknown' }
const cycleWord = (c: string) => CYCLE_WORD[c] ?? c
const cap = (s: string) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s)
const splitList = (s: string | null | undefined) => (s ?? '').split(';').map((x) => x.trim()).filter(Boolean)

/* ------------------------------------------------------------------ dates -- */

const todayUtc = () => { const d = new Date(); return Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) }
function isoToUtc(iso: string | null | undefined): number | null {
  const m = /^(\d{4})-(\d{2})(?:-(\d{2}))?$/.exec(iso ?? '')
  return m ? Date.UTC(Number(m[1]), Number(m[2]) - 1, m[3] ? Number(m[3]) : 1) : null
}
function showDate(iso: string | null | undefined): string {
  const t = isoToUtc(iso)
  if (t === null) return iso ?? ''
  return new Date(t).toLocaleDateString('en-US', iso!.length === 7 ? { month: 'long', year: 'numeric', timeZone: 'UTC' } : { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' })
}

type Deadline =
  | { kind: 'confirmed'; date: string; cycle: string }
  | { kind: 'anticipated'; cycle: string; last: string }
  | { kind: 'none'; cycle: string }
  | { kind: 'other'; text: string }

/** Reads application_deadline_or_cycle into one of four shapes. */
function parseDeadline(text: string | null | undefined): Deadline {
  const t = (text ?? '').trim()
  let m: RegExpExecArray | null
  if ((m = /^(\d{4}-\d{2}(?:-\d{2})?)(?: \((\w+)\))?$/.exec(t))) return { kind: 'confirmed', date: m[1] ?? '', cycle: m[2] ?? '' }
  if ((m = /^(\w+); last known deadline (\d{4}-\d{2}(?:-\d{2})?); next cycle not yet published$/.exec(t))) return { kind: 'anticipated', cycle: m[1] ?? '', last: m[2] ?? '' }
  if ((m = /^(\w+); no deadline published$/.exec(t))) return { kind: 'none', cycle: m[1] ?? '' }
  return { kind: 'other', text: t }
}

/** The status the page shows: open only when verified and not past. */
function deriveStatus(p: Program, dl: Deadline, today: number): { key: StatusKey; label: string; cls: string } {
  const s = (p.application_status ?? '').toLowerCase()
  const passed = dl.kind === 'confirmed' && dl.date.length === 10 && (isoToUtc(dl.date) ?? Infinity) < today
  if (s.startsWith('open')) {
    return passed
      ? { key: 'expired', label: 'Deadline passed, re-check', cls: 'rfd-expired' }
      : { key: 'open', label: `Open, verified ${showDate(p.verification_date)}`, cls: 'ok' }
  }
  if (s.startsWith('closed')) return { key: 'upcoming', label: 'Closed, expected to recur', cls: 'warn' }
  if (s.startsWith('recurring')) return { key: 'upcoming', label: 'Recurring, next cycle not yet posted', cls: 'past' }
  if (s.startsWith('discontinued')) return { key: 'discontinued', label: 'Discontinued', cls: 'rfd-expired' }
  return { key: 'unknown', label: 'Status unknown', cls: 'rfd-unknown' }
}

function DeadlineText({ dl, status }: { dl: Deadline; status: StatusKey }) {
  if (dl.kind === 'confirmed') {
    const cyc = dl.cycle ? `, ${cycleWord(dl.cycle)}` : ''
    if (status === 'expired') return <span className="rfd-dl rfd-dl-passed">Deadline was {showDate(dl.date)}{cyc}</span>
    return <span className="rfd-dl">Deadline <b>{showDate(dl.date)}</b>{cyc}</span>
  }
  if (dl.kind === 'anticipated') {
    const cyc = dl.cycle === 'unknown' ? 'cycle unknown' : `${cycleWord(dl.cycle)} cycle`
    return <span className="rfd-dl rfd-dl-anticipated"><b>Anticipated:</b> {cyc}, last deadline {showDate(dl.last)}, next not yet published</span>
  }
  if (dl.kind === 'none') return <span className="rfd-dl">{dl.cycle === 'rolling' ? 'Rolling, no deadline published' : `${cap(cycleWord(dl.cycle))} cycle, no deadline published`}</span>
  return dl.text ? <span className="rfd-dl">{dl.text}</span> : null
}

/* ---------------------------------------------------------------- records -- */

type Item = {
  p: Program
  dl: Deadline
  status: ReturnType<typeof deriveStatus>
  areas: string[]
  areaKeys: string[]
  award: number | null
  hay: string
  deadlineSort: number
  pathwayRank: number
}

function prepare(p: Program, today: number): Item {
  const dl = parseDeadline(p.application_deadline_or_cycle)
  const status = deriveStatus(p, dl, today)
  const areas = splitList(p.research_categories)
  const v = p.award_max ?? p.details?.award_typical ?? p.award_min
  const rank = PATHWAYS.indexOf(p.aoi_affiliation as typeof PATHWAYS[number])
  return {
    p, dl, status, areas,
    areaKeys: areas.map((a) => a.toLowerCase()),
    award: typeof v === 'number' ? v : null,
    hay: [p.program_name, p.funding_organization, p.research_categories, p.eligible_study_types, p.eligibility_notes, p.additional_eligibility_requirements, p.aoi_affiliation, p.mechanism, p.award_amount, p.record_id].join(' \n ').toLowerCase(),
    deadlineSort: dl.kind === 'confirmed' && status.key !== 'expired' ? (isoToUtc(dl.date) ?? Infinity) : Infinity,
    pathwayRank: rank < 0 ? PATHWAYS.length : rank,
  }
}

export default function ResearchFundingPanel() {
  const [data, setData] = useState<Record<SetKey, Export> | null>(null); const [error, setError] = useState<string | null>(null)
  const [set, setSet] = useState<SetKey>('grants')
  const [q, setQ] = useState(''); const [pathway, setPathway] = useState(''); const [status, setStatus] = useState(''); const [award, setAward] = useState(''); const [area, setArea] = useState(''); const [mech, setMech] = useState('')
  const [sort, setSort] = useState<Sort>('default'); const [open, setOpen] = useState<string | null>(null)
  const today = useMemo(todayUtc, [])

  useEffect(() => {
    let alive = true
    const get = async (url: string) => { const r = await fetch(url, { cache: 'no-cache' }); if (!r.ok) throw new Error(`HTTP ${r.status}`); return (await r.json()) as Export }
    void Promise.all([get(FUNDING_URLS.grants), get(FUNDING_URLS.other)])
      .then(([grants, other]) => { if (alive) setData({ grants, other }) })
      .catch((e: unknown) => { if (alive) setError(`The funding directory could not be read. ${e instanceof Error ? e.message : String(e)}`) })
    return () => { alive = false }
  }, [])
  // A research area or kind of support belongs to one set; switching sets clears them.
  useEffect(() => { setArea(''); setMech(''); setOpen(null) }, [set])

  const items = useMemo(() => ({
    grants: (data?.grants.records ?? []).map((p) => prepare(p, today)),
    other: (data?.other.records ?? []).map((p) => prepare(p, today)),
  }), [data, today])
  const rows = items[set]

  const areas = useMemo(() => {
    const c = new Map<string, number>()
    for (const it of rows) for (const k of it.areaKeys) c.set(k, (c.get(k) ?? 0) + 1)
    return [...c].filter(([, n]) => n >= 2).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
  }, [rows])
  const mechs = useMemo(() => {
    const c = new Map<string, number>()
    for (const it of rows) c.set(it.p.mechanism, (c.get(it.p.mechanism) ?? 0) + 1)
    return [...c].sort((a, b) => a[0].localeCompare(b[0]))
  }, [rows])

  const lq = q.trim().toLowerCase()
  const list = useMemo(() => {
    const byName = (a: Item, b: Item) => a.p.program_name.localeCompare(b.p.program_name)
    const awardAsc = (a: Item, b: Item) => (a.award ?? Infinity) - (b.award ?? Infinity) || byName(a, b)
    return rows
      .filter((it) => !lq || it.hay.includes(lq))
      .filter((it) => !pathway || it.p.aoi_affiliation === pathway)
      .filter((it) => !status || it.status.key === status)
      .filter((it) => !award || (award === 'none' ? it.award === null : award === 'over' ? it.award !== null && it.award > 250000 : it.award !== null && it.award <= Number(award)))
      .filter((it) => !area || it.areaKeys.includes(area))
      .filter((it) => !mech || it.p.mechanism === mech)
      .sort((a, b) => {
        if (sort === 'deadline') return a.deadlineSort - b.deadlineSort || byName(a, b)
        if (sort === 'award-asc') return awardAsc(a, b)
        if (sort === 'award-desc') return (b.award ?? -1) - (a.award ?? -1) || byName(a, b)
        if (sort === 'name') return byName(a, b)
        return a.pathwayRank - b.pathwayRank || awardAsc(a, b)
      })
  }, [rows, lq, pathway, status, award, area, mech, sort])

  function exportCsv() {
    const cols = ['program_name', 'funding_organization', 'mechanism', 'award_amount', 'aoi_affiliation', 'application_status', 'application_deadline_or_cycle', 'research_categories', 'eligible_study_types', 'eligibility_notes', 'additional_eligibility_requirements', 'official_program_url', 'verification_date', 'record_id'] as const
    const csv = [cols.join(','), ...list.map((it) => cols.map((c) => `"${String(it.p[c] ?? '').replace(/"/g, '""')}"`).join(','))].join('\n')
    const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' })); a.download = `research-funding-${set}-${new Date().toISOString().slice(0, 10)}.csv`; a.click(); URL.revokeObjectURL(a.href)
  }

  if (!data && !error) return <><h1>Research Funding</h1><div className="ma-sub">Reading the directory…</div><div className="ma-panel"><p className="ma-empty">One moment.</p></div></>

  const openNow = items.grants.filter((it) => it.status.key === 'open').length
  const asOf = data?.grants.as_of ?? data?.other.as_of
  const tile = (k: SetKey, label: string, n: number, note: string) => <button type="button" className={`cert-tile${set === k ? ' on' : ''}`} onClick={() => setSet(k)}><span>{label}</span><b>{n}</b><i>{note}</i></button>

  return (
    <>
      <div className="cert-head">
        <div><h1>Research Funding</h1><div className="ma-sub" style={{ marginBottom: 0, maxWidth: '80ch' }}>Funding that a member in private practice, or the Institute on a member's behalf, can realistically apply for. Each program was checked against the funder's own published rules; the date of that check is on every entry.</div></div>
        <div className="cert-actions"><button type="button" className="b s-btn on-light sm" onClick={exportCsv} disabled={!list.length}>↓ Export</button></div>
      </div>
      {error && <div className="cert-err" role="alert">{error}</div>}
      {data && <>
        <div className="rlib-note"><b>Checked {showDate(asOf)}.</b> "Open" means the application window was verified open on that date; it is never inferred from a recurring deadline. {openNow} grant {openNow === 1 ? 'window was' : 'windows were'} open then, and several close within weeks. Re-check the official page before relying on any status.</div>
        <div className="cert-tiles two">
          {tile('grants', 'Research grants', items.grants.length, 'Cash awards that fund a research project')}
          {tile('other', 'Other research support', items.other.length, 'Prizes, travel awards, in-kind credits, services. Not grants')}
        </div>

        <details className="rfd-legend">
          <summary>Application Pathway: how a member can apply</summary>
          <p>Institute membership on its own never satisfies a funder's university, nonprofit, geographic or professional requirement; those conditions are listed on each entry. The Institute's own eligibility as an applicant organization has not yet been confirmed with any funder.</p>
          <ul>
            {PATHWAYS.filter((k) => k !== 'AOI Affiliation Required' || rows.some((it) => it.p.aoi_affiliation === k)).map((k) => <li key={k}><span className={`rfd-mark rfd-mark-${PATHWAY_MARK[k]}`} aria-hidden="true" /><div><b>{k}</b><span>{PATHWAY_HELP[k]}</span></div></li>)}
          </ul>
        </details>

        <div className="rfd-filters">
          <div className="cert-search" style={{ margin: 0 }}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></svg>
            <input type="text" value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => e.key === 'Escape' && setQ('')} autoComplete="off" placeholder="Search by program, funder, research area or keyword…" aria-label="Search funding programs" />
            {q && <button type="button" className="clr" aria-label="Clear search" onClick={() => setQ('')}>×</button>}
          </div>
          <select className="fi" value={pathway} onChange={(e) => setPathway(e.target.value)} aria-label="Application Pathway">
            <option value="">Any pathway</option>
            {PATHWAYS.map((k) => <option key={k} value={k}>{k}</option>)}
          </select>
          <select className="fi" value={status} onChange={(e) => setStatus(e.target.value)} aria-label="Application status">
            <option value="">Any status</option><option value="open">Open now, verified</option><option value="upcoming">Next cycle not yet posted</option><option value="unknown">Status unknown</option>
          </select>
          <select className="fi" value={award} onChange={(e) => setAward(e.target.value)} aria-label="Award size">
            <option value="">Any amount</option><option value="10000">Up to 10,000</option><option value="50000">Up to 50,000</option><option value="250000">Up to 250,000</option><option value="over">Over 250,000</option><option value="none">Amount not published</option>
          </select>
          <select className="fi" value={area} onChange={(e) => setArea(e.target.value)} aria-label="Research area">
            <option value="">Any research area</option>
            {areas.map(([k, n]) => <option key={k} value={k}>{cap(k)} ({n})</option>)}
          </select>
          {set === 'other' && <select className="fi" value={mech} onChange={(e) => setMech(e.target.value)} aria-label="Kind of support">
            <option value="">Any kind of support</option>
            {mechs.map(([k, n]) => <option key={k} value={k}>{k} ({n})</option>)}
          </select>}
          <select className="fi" value={sort} onChange={(e) => setSort(e.target.value as Sort)} aria-label="Sort">
            <option value="default">Pathway, smallest award first</option><option value="deadline">Confirmed deadline, soonest first</option><option value="award-asc">Award, smallest first</option><option value="award-desc">Award, largest first</option><option value="name">Program name A–Z</option>
          </select>
        </div>

        <div className="bpanel"><div className="ph">{set === 'grants' ? 'Research grants' : 'Other research support'}<span className="r">{list.length === rows.length ? `${list.length} shown` : `${list.length} of ${rows.length} shown`}</span></div>
          {list.length ? list.map((it) => {
            const p = it.p; const d = p.details ?? {}
            const unpublished = !p.award_amount || /not published/i.test(p.award_amount)
            const applyUrl = d.application_url && d.application_url !== p.official_program_url ? d.application_url : null
            const reqs = (d.application_requirements ?? []).filter(Boolean)
            const isOpen = open === p.record_id
            const rowsDl: [string, ReactNode][] = [
              ['Additional eligibility requirements', p.additional_eligibility_requirements],
              ['Eligible study types', splitList(p.eligible_study_types).join('; ')],
              ['Funding duration', d.funding_duration],
              ['Why this pathway', d.aoi_affiliation_reasoning],
              ['Membership', d.membership_details],
              ['Where applicants must be', d.geographic_notes],
              ['Review board (IRB)', d.irb_requirements],
              ['Application requirements', reqs.length ? <ul>{reqs.map((r) => <li key={r}>{r}</li>)}</ul> : null],
              ['Allowable expenses', d.allowable_expenses_notes],
              ['Apply at', applyUrl ? <SafeLink href={applyUrl}>{applyUrl}</SafeLink> : null],
              ['Record', `${p.record_id}, last checked ${showDate(p.verification_date)}`],
            ]
            return <div key={p.record_id} className="rfd-row">
              <span className={`rfd-mark rfd-mark-${PATHWAY_MARK[p.aoi_affiliation] ?? 'unconfirmed'}`} title={p.aoi_affiliation} aria-hidden="true" />
              <div className="main">
                <div className="ttl"><SafeLink href={p.official_program_url}>{p.program_name}</SafeLink></div>
                <div className="org">{p.funding_organization}</div>
                <div className="pw">Application Pathway: <b>{p.aoi_affiliation}</b></div>
                <div className="when"><span className={`cpill ${it.status.cls}`}>{it.status.label}</span><DeadlineText dl={it.dl} status={it.status.key} /></div>
                {p.eligibility_notes && <p className="note">{p.eligibility_notes}</p>}
                {it.areas.length > 0 && <div className="areas"><b>Research areas:</b> {it.areas.join('; ')}</div>}
                <div className="links">
                  <SafeLink className="b s-btn on-light xs" href={p.official_program_url}>Official program page ↗</SafeLink>
                  <button type="button" className="plink" aria-expanded={isOpen} onClick={() => setOpen(isOpen ? null : p.record_id)}>{isOpen ? 'Hide details' : 'Eligibility details and why this pathway'}</button>
                  <span className="muted">Last checked {showDate(p.verification_date)}</span>
                </div>
                {isOpen && <dl className="rfd-dl-list">{rowsDl.filter(([, v]) => v).map(([k, v]) => <div key={k}><dt>{k}</dt><dd>{v}</dd></div>)}</dl>}
              </div>
              <div className="amt"><div className={`sum${unpublished ? ' none' : ''}`}>{unpublished ? 'Amount not published' : p.award_amount}</div>{set === 'other' && <div className="mech">{p.mechanism}</div>}</div>
            </div>
          }) : <div className="bnodata">No programs match these filters.</div>}
        </div>
        <div className="rlib-foot">{data.grants.record_count} research grants and {data.other.record_count} other kinds of support in the export of {showDate(asOf)} · Amounts as published, currencies not converted · The internal list of reviewed and excluded programs is not shown</div>
      </>}
    </>
  )
}
