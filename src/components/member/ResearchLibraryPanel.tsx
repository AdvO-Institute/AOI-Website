/* ----------------------------------------------------------------------------
 * Research Library — the Research Committee's Upper Cervical Research
 * Library, for every signed-in person (#213).
 *
 * The records are a static export of the committee's library, kept in the
 * repo at public/data/research-library/publications.json and fetched when
 * the tab opens (not bundled: 500+ records). The Research Director replaces
 * the file by pull request; nothing lives in Supabase. The export is
 * provisional — extracted automatically, not yet checked by a person — so the
 * page says so, hides only what carries nothing readable, and never merges,
 * corrects or invents a value. Field meanings: the README beside the file.
 * -------------------------------------------------------------------------- */
import { useEffect, useMemo, useState } from 'react'
import { SafeLink } from './opsUi'

type Publication = {
  record_id: string
  title: string | null
  authors: string | null
  year: string | null
  venue: string | null
  volume: string | null
  issue: string | null
  pages: string | null
  doi: string | null
  doi_url: string | null
  publication_type: string | null
  topics: string[]
  citation: string | null
  source_kind: string | null
  review_state: string | null
  review_flags: string[]
  possible_duplicate_of: string[]
}
type Export = { schema: string; generated_at: string; record_count: number; records: Publication[] }

export const LIBRARY_URL = '/data/research-library/publications.json'

const TYPE_LABEL: Record<string, string> = { case_report: 'Case report', case_series: 'Case series', review: 'Review', book_chapter: 'Book chapter' }
type Kind = 'all' | 'case_report' | 'review' | 'doi'
type Sort = 'newest' | 'oldest' | 'title' | 'author'
const PAGE = 50

/** Years outside the span of the literature are a misread number, not a date; they sort last and print as unknown. */
const plausibleYear = (y: string | null): number | null => { const n = Number(y); return y && n >= 1895 && n <= 2026 ? n : null }
/** A record is readable when it has a title or the bibliography's own citation line; a parse the library itself marked incomplete is not. */
const readable = (p: Publication) => Boolean(p.title || p.citation) && !p.review_flags.includes('citation_parse_incomplete')
/** The compilation's headings are printed in capitals; sentence case reads better in a menu. */
const ACRONYMS = new Set(['ADD/ADHD', 'TMJ'])
export function topicLabel(t: string): string {
  return t.split(' ').map((w, i) => ACRONYMS.has(w) ? w : w === 'X-RAY' ? 'X-ray' : i === 0 ? w.charAt(0) + w.slice(1).toLowerCase() : w.toLowerCase()).join(' ')
}
const shownTitle = (p: Publication) => p.title || p.citation || ''
const journalLine = (p: Publication) => {
  if (!p.venue) return ''
  const vol = [p.volume, p.issue ? `(${p.issue})` : ''].filter(Boolean).join('')
  return [p.venue, [vol, p.pages].filter(Boolean).join(':')].filter(Boolean).join(' ')
}
const firstAuthor = (p: Publication) => (p.authors ?? '').split(';')[0]?.trim().toLowerCase() ?? ''
function exportDate(iso: string): string {
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric', timeZone: 'UTC' })
}

export default function ResearchLibraryPanel() {
  const [data, setData] = useState<Export | null>(null); const [error, setError] = useState<string | null>(null)
  const [kind, setKind] = useState<Kind>('all'); const [q, setQ] = useState(''); const [topic, setTopic] = useState(''); const [sort, setSort] = useState<Sort>('newest')
  const [shown, setShown] = useState(PAGE); const [open, setOpen] = useState<string | null>(null)

  useEffect(() => {
    let alive = true
    void fetch(LIBRARY_URL, { cache: 'no-cache' })
      .then(async (r) => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return (await r.json()) as Export })
      .then((d) => { if (alive) setData(d) })
      .catch((e: unknown) => { if (alive) setError(`The library could not be read. ${e instanceof Error ? e.message : String(e)}`) })
    return () => { alive = false }
  }, [])
  useEffect(() => { setShown(PAGE) }, [kind, q, topic, sort])

  const rows = useMemo(() => (data?.records ?? []).filter(readable), [data])
  const hidden = (data?.records.length ?? 0) - rows.length
  const topics = useMemo(() => { const c = new Map<string, number>(); for (const p of rows) for (const t of p.topics) c.set(t, (c.get(t) ?? 0) + 1); return [...c].sort((a, b) => a[0].localeCompare(b[0])) }, [rows])
  const cnt = useMemo(() => ({
    all: rows.length,
    case_report: rows.filter((p) => p.publication_type === 'case_report').length,
    review: rows.filter((p) => p.publication_type === 'review' || p.publication_type === 'case_series').length,
    doi: rows.filter((p) => p.doi_url).length,
  }), [rows])

  const lq = q.trim().toLowerCase()
  const list = useMemo(() => rows
    .filter((p) => kind === 'all' || (kind === 'doi' ? Boolean(p.doi_url) : kind === 'review' ? p.publication_type === 'review' || p.publication_type === 'case_series' : p.publication_type === kind))
    .filter((p) => !topic || p.topics.includes(topic))
    .filter((p) => !lq || `${p.title ?? ''} ${p.citation ?? ''} ${p.authors ?? ''} ${p.venue ?? ''} ${p.year ?? ''} ${p.topics.join(' ')}`.toLowerCase().includes(lq))
    .sort((a, b) => {
      if (sort === 'title') return shownTitle(a).localeCompare(shownTitle(b))
      if (sort === 'author') return (firstAuthor(a) || '￿').localeCompare(firstAuthor(b) || '￿') || shownTitle(a).localeCompare(shownTitle(b))
      const ya = plausibleYear(a.year) ?? (sort === 'newest' ? -1 : 9999); const yb = plausibleYear(b.year) ?? (sort === 'newest' ? -1 : 9999)
      return (sort === 'newest' ? yb - ya : ya - yb) || shownTitle(a).localeCompare(shownTitle(b))
    }), [rows, kind, topic, lq, sort])

  function exportCsv() {
    const cols = ['year', 'title', 'authors', 'venue', 'volume', 'issue', 'pages', 'doi', 'publication_type', 'topics', 'citation', 'record_id'] as const
    const cell = (p: Publication, c: typeof cols[number]) => c === 'topics' ? p.topics.join('; ') : String(p[c] ?? '')
    const csv = [cols.join(','), ...list.map((p) => cols.map((c) => `"${cell(p, c).replace(/"/g, '""')}"`).join(','))].join('\n')
    const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' })); a.download = `research-library-${new Date().toISOString().slice(0, 10)}.csv`; a.click(); URL.revokeObjectURL(a.href)
  }

  if (!data && !error) return <><h1>Research Library</h1><div className="ma-sub">Reading the library…</div><div className="ma-panel"><p className="ma-empty">One moment.</p></div></>

  const tile = (k: Kind, label: string, n: number) => <button type="button" className={`cert-tile${kind === k ? ' on' : ''}`} onClick={() => setKind(k)}><span>{label}</span><b>{n}</b></button>

  return (
    <>
      <div className="cert-head">
        <div><h1>Research Library</h1><div className="ma-sub" style={{ marginBottom: 0, maxWidth: '80ch' }}>The Upper Cervical Research Library: published research on upper cervical care, compiled by the <b>Research Committee</b> from its article collection and bibliography. Search by title, author, journal, year or topic.</div></div>
        <div className="cert-actions"><button type="button" className="b s-btn on-light sm" onClick={exportCsv} disabled={!list.length}>↓ Export</button></div>
      </div>
      {error && <div className="cert-err" role="alert">{error}</div>}
      {data && <>
        <div className="rlib-note"><b>Preliminary.</b> These records were extracted automatically and have not yet been checked by a person. A title, year or author may be wrong or incomplete, and the same work can appear twice. Listing a study here is not an endorsement of its findings, and most are not Institute studies.</div>
        <div className="cert-tiles four">
          {tile('all', 'All publications', cnt.all)}
          {tile('case_report', 'Case reports', cnt.case_report)}
          {tile('review', 'Reviews & case series', cnt.review)}
          {tile('doi', 'With a DOI link', cnt.doi)}
        </div>
        <div className="rlib-filters">
          <div className="cert-search" style={{ margin: 0 }}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></svg>
            <input type="text" value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => e.key === 'Escape' && setQ('')} autoComplete="off" placeholder="Search by title, author, journal, year or topic…" aria-label="Search publications" />
            {q && <button type="button" className="clr" aria-label="Clear search" onClick={() => setQ('')}>×</button>}
          </div>
          <select className="fi" value={topic} onChange={(e) => setTopic(e.target.value)} aria-label="Topic">
            <option value="">All topics</option>
            {topics.map(([t, n]) => <option key={t} value={t}>{topicLabel(t)} ({n})</option>)}
          </select>
          <select className="fi" value={sort} onChange={(e) => setSort(e.target.value as Sort)} aria-label="Sort">
            <option value="newest">Newest first</option><option value="oldest">Oldest first</option><option value="title">Title A–Z</option><option value="author">First author A–Z</option>
          </select>
        </div>
        <div className="bpanel"><div className="ph">{kind === 'all' ? 'All publications' : kind === 'case_report' ? 'Case reports' : kind === 'review' ? 'Reviews & case series' : 'With a DOI link'}{topic ? ` · ${topicLabel(topic)}` : ''}<span className="r">{list.length === rows.length ? `${list.length} shown` : `${list.length} of ${rows.length} shown`}</span></div>
          {list.length ? list.slice(0, shown).map((p) => {
            const y = plausibleYear(p.year); const j = journalLine(p); const dup = p.review_flags.includes('possible_duplicate'); const more = Boolean(p.title && p.citation)
            return <div key={p.record_id} className="rlib-row">
              <div className="yr">{y ?? <i title="The year could not be read reliably">—</i>}</div>
              <div className="main">
                <div className="ttl">{more ? <button type="button" className="plink" aria-expanded={open === p.record_id} onClick={() => setOpen(open === p.record_id ? null : p.record_id)}>{p.title}</button> : shownTitle(p)}</div>
                {p.authors && <div className="au">{p.authors.split(';').map((a) => a.trim()).filter(Boolean).join(', ')}</div>}
                {j && <div className="jr">{j}</div>}
                {(p.publication_type || p.topics.length > 0 || dup) && <div className="ctc-chips">
                  {p.publication_type && <span className="cpill info">{TYPE_LABEL[p.publication_type] ?? p.publication_type}</span>}
                  {p.topics.map((t) => <button key={t} type="button" className={`cpill link${topic === t ? ' on' : ''}`} onClick={() => setTopic(topic === t ? '' : t)} title={topic === t ? 'Show all topics' : `Only ${topicLabel(t)}`}>{topicLabel(t)}</button>)}
                  {dup && <span className="cpill past" title="The library's duplicate search found a similar record; a person has not yet decided">Possible duplicate</span>}
                </div>}
                {open === p.record_id && p.citation && <div className="cit"><span>As cited in the bibliography</span>{p.citation}</div>}
              </div>
              <div className="lnk">{p.doi_url && <SafeLink className="b s-btn on-light xs" href={p.doi_url}>DOI ↗</SafeLink>}</div>
            </div>
          }) : <div className="bnodata">No publications match.</div>}
          {list.length > shown && <div className="rlib-more"><button type="button" className="b s-btn on-light sm" onClick={() => setShown((n) => n + PAGE)}>Show {Math.min(PAGE, list.length - shown)} more</button><span className="muted">{shown} of {list.length}</span></div>}
        </div>
        <div className="rlib-foot">{data.record_count} records in the export of {exportDate(data.generated_at)}{hidden > 0 ? ` · ${hidden} incomplete ${hidden === 1 ? 'record is' : 'records are'} not shown` : ''} · Upper Cervical Research Library, Research Committee</div>
      </>}
    </>
  )
}
