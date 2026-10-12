/* ----------------------------------------------------------------------------
 * Research — Active · Past. Each project card carries everything: the team
 * (every Institute person linked to their card, outside people name-only),
 * funding against budget with the grant & expense ledger, the overview,
 * publication details and outcomes.
 * -------------------------------------------------------------------------- */
import { friendlyError } from '@/lib/friendlyError'
import { SafeLink, askConfirm } from './opsUi'
import { useCallback, useEffect, useState } from 'react'
import { useAccess } from '@/lib/queries/AccessProvider'
import { useToast } from '@/components/ui/Toast'
import { displayName } from '@/lib/access'
import {
  projects as loadProjects, researchFor, searchPeople, notesFor, saveProject, removeProject, addEntry, removeEntry, addNote,
  ROLE_LABEL, KIND_LABEL, fullName, initials, memberName, pi, received, spent, overhead, funded, money, fmtD, fmtTs,
} from '@/lib/queries/research'
import type { Project, Member, PersonLite, Role, Kind, Note, Who, ProjectInput } from '@/lib/queries/research'

const today = () => new Date().toISOString().slice(0, 10)
function Pill({ kind = '', children }: { kind?: string; children: React.ReactNode }) { return <span className={`cpill ${kind}`}>{children}</span> }
function F({ l, children, full = false, hint }: { l: string; children: React.ReactNode; full?: boolean; hint?: string }) { return <div className={full ? 'full' : ''}><label className="flabel">{l}</label>{children}{hint && <div className="evt-hint">{hint}</div>}</div> }
function useEsc(onClose: () => void) { useEffect(() => { const k = (e: KeyboardEvent) => e.key === 'Escape' && onClose(); document.addEventListener('keydown', k); return () => document.removeEventListener('keydown', k) }, [onClose]) }
function friendly(err: string): string {
  if (/row-level security/.test(err)) return 'You don’t have permission for that. Only the executive director and the Research Director can change research records.'
  return friendlyError(err)
}
const host = (u: string) => u.replace(/^https?:\/\//, '').replace(/\/$/, '')

export default function ResearchPanel() {
  const toast = useToast()
  const { access, can } = useAccess()
  const who: Who = { name: displayName(access).replace(/,.*$/, ''), id: access.person?.id ?? null }
  const canManage = can('full_admin') || can('manage_research')
  const [rows, setRows] = useState<Project[]>([]); const [loading, setLoading] = useState(true); const [error, setError] = useState<string | null>(null)
  const [filter, setFilter] = useState<'active' | 'past'>('active'); const [q, setQ] = useState('')
  const [openLedger, setOpenLedger] = useState<Set<number>>(new Set()); const [entry, setEntry] = useState<Record<number, { date: string; kind: Kind; amount: string; note: string }>>({})
  const [person, setPerson] = useState<PersonLite | null>(null); const [edit, setEdit] = useState<Project | null | 'new'>(null)

  const load = useCallback(async () => {
    const r = await loadProjects()
    setError(r.error ? `The research projects could not be read. ${friendlyError(r.error)}` : null)
    setRows(r.rows); setLoading(false)
  }, [])
  useEffect(() => { void load() }, [load])

  const lq = q.trim().toLowerCase()
  const list = rows.filter((p) => p.status === filter).filter((p) => !lq || `${p.name} ${p.irb ?? ''} ${p.primary_location ?? ''} ${p.research_team.map(memberName).join(' ')}`.toLowerCase().includes(lq)).sort((a, b) => a.name.localeCompare(b.name))
  const cnt = { active: rows.filter((p) => p.status === 'active').length, past: rows.filter((p) => p.status === 'past').length }
  function exportCsv() {
    const cols = ['name', 'status', 'published', 'pi_name', 'irb', 'primary_location', 'estimated_budget', 'estimated_funding', 'published_date', 'publication_citation', 'publication_doi']
    const csv = [cols.join(','), ...rows.map((p) => cols.map((c) => `"${String((p as unknown as Record<string, unknown>)[c] ?? '').replace(/"/g, '""')}"`).join(','))].join('\n')
    const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' })); a.download = `research-${today()}.csv`; a.click(); URL.revokeObjectURL(a.href)
  }
  const link = (m: Member) => m.people ? <button type="button" className="plink" onClick={() => setPerson(m.people!)}>{fullName(m.people)}</button> : <span>{m.name}{m.affiliation && <small style={{ color: 'var(--color-content-muted)' }}> ({m.affiliation})</small>}</span>

  if (loading) return <><h1>Research</h1><div className="ma-sub">Reading the research projects…</div><div className="ma-panel"><p className="ma-empty">One moment.</p></div></>

  const card = (p: Project) => {
    const P = pi(p); const cos = p.research_team.filter((m) => m.role === 'co_investigator'); const others = p.research_team.filter((m) => m.role !== 'pi' && m.role !== 'co_investigator')
    const budget = Number(p.estimated_budget ?? 0); const pct = budget ? Math.min(100, Math.round(funded(p) / budget * 100)) : 0; const open = openLedger.has(p.id)
    const e = entry[p.id] ?? { date: today(), kind: 'grant_received' as Kind, amount: '', note: '' }
    return <div key={p.id} className={`rcard ${p.status}`}>
      <div className="rh"><div><h3>{p.name}</h3>
        <div className="ctc-chips">{p.published && <Pill kind="ok">Published{p.published_date ? ` · ${fmtD(p.published_date)}` : ''}</Pill>}<small className="muted">{p.status === 'active' ? 'Active' : 'Past'}{p.irb ? ` · IRB ${p.irb}` : ''}</small></div></div>
        {canManage && <button type="button" className="b s-btn on-light xs" onClick={() => setEdit(p)}>Manage</button>}</div>
      <div className="rkv">
        <span>Principal investigator</span><div>{P ? link(P) : p.pi_name ? <span>{p.pi_name}</span> : <i>not set</i>}</div>
        {cos.length > 0 && <><span>Co-investigators</span><div>{cos.map((m, i) => <span key={m.id ?? i}>{i > 0 ? ', ' : ''}{link(m)}</span>)}</div></>}
        {others.length > 0 && <><span>Team</span><div>{others.map((m, i) => <div key={m.id ?? i}>{link(m)} <small style={{ color: 'var(--color-content-muted)' }}>· {ROLE_LABEL[m.role]}</small></div>)}</div></>}
        {p.primary_location && <><span>Primary location</span><div>{p.primary_location}</div></>}
        {p.study_url && <><span>Study site</span><div><SafeLink href={p.study_url}>{host(p.study_url)}</SafeLink></div></>}
      </div>
      <div className="rfund"><div className="rfl"><span><b>{money(funded(p))}</b> funded of <b>{money(p.estimated_budget)}</b> estimated budget · {pct}%</span><span className="muted">{money(received(p))} received · {money(spent(p))} spent · {money(received(p) - spent(p))} remaining · {money(overhead(p))} overhead</span></div><div className="iprog" style={{ margin: 0 }}><i style={{ width: `${pct}%` }} /></div></div>
      {p.overview && <><div className="rsec">Overview</div><div className="rtext" style={{ whiteSpace: 'pre-line' }}>{p.overview}</div></>}
      {p.published && (p.publication_citation || p.publication_doi || p.publication_url) && <><div className="rsec">Publication</div><div className="rtext">{[
        p.publication_citation ? <span key="c">{p.publication_citation}</span> : null,
        p.publication_doi ? <a key="d" href={`https://doi.org/${p.publication_doi}`} target="_blank" rel="noopener noreferrer">doi:{p.publication_doi}</a> : null,
        p.publication_url ? <SafeLink key="u" href={p.publication_url}>full text</SafeLink> : null,
      ].filter(Boolean).map((el, i) => <span key={i}>{i > 0 ? ' · ' : ''}{el}</span>)}</div></>}
      {p.outcomes && <><div className="rsec">Outcomes <span className="r">for the Curriculum Committee</span></div><div className="rtext" style={{ whiteSpace: 'pre-line' }}>{p.outcomes}</div></>}
      <div className="rsec"><button type="button" className="link" onClick={() => setOpenLedger((s) => { const n = new Set(s); n.has(p.id) ? n.delete(p.id) : n.add(p.id); return n })}>{open ? '▾ Hide' : '▸ Show'} grant &amp; expense ledger · {p.research_ledger.length} {p.research_ledger.length === 1 ? 'entry' : 'entries'}</button></div>
      {open && <>
        <table className="rled"><thead><tr><th>Date</th><th>Kind</th><th>Note</th><th className="num">Amount</th><th>By</th>{canManage && <th />}</tr></thead><tbody>
          {p.research_ledger.length ? [...p.research_ledger].sort((a, b) => b.entry_date.localeCompare(a.entry_date)).map((l) => <tr key={l.id}><td>{fmtD(l.entry_date)}</td><td><Pill kind={l.kind === 'expense' ? 'warn' : l.kind === 'overhead' ? '' : 'ok'}>{KIND_LABEL[l.kind]}</Pill></td><td>{l.note}</td><td className="num">{l.kind === 'expense' ? '−' : ''}{money(l.amount)}</td><td>{l.by_name}</td>{canManage && <td><button type="button" className="link" onClick={async () => { if (!(await askConfirm('Remove this ledger entry?', { body: 'This cannot be undone.', ok: 'Remove', danger: true }))) return; const r = await removeEntry(l.id); if (r.error) return toast(friendly(r.error)); await load() }}>remove</button></td>}</tr>) : <tr><td colSpan={6} style={{ color: 'var(--color-content-muted)' }}>No entries yet.</td></tr>}</tbody></table>
        {canManage && <div className="rledadd">
          <input className="fi" type="date" value={e.date} onChange={(ev) => setEntry((s) => ({ ...s, [p.id]: { ...e, date: ev.target.value } }))} />
          <select className="fi" value={e.kind} onChange={(ev) => setEntry((s) => ({ ...s, [p.id]: { ...e, kind: ev.target.value as Kind } }))}>{(Object.entries(KIND_LABEL) as [Kind, string][]).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
          <input className="fi" type="number" placeholder="Amount" value={e.amount} onChange={(ev) => setEntry((s) => ({ ...s, [p.id]: { ...e, amount: ev.target.value } }))} />
          <input className="fi" placeholder="Note — who from, what for" value={e.note} onChange={(ev) => setEntry((s) => ({ ...s, [p.id]: { ...e, note: ev.target.value } }))} />
          <button type="button" className="b s-btn on-light sm" onClick={async () => { const a = Number(e.amount); if (!a) return toast('Enter an amount'); const r = await addEntry(p.id, e.date || today(), e.kind, a, e.note.trim(), who); if (r.error) return toast(friendly(r.error)); setEntry((s) => ({ ...s, [p.id]: { date: today(), kind: e.kind, amount: '', note: '' } })); await load(); toast('Ledger entry added') }}>+ Add entry</button>
        </div>}
      </>}
    </div>
  }

  return (
    <>
      <div className="cert-head">
        <div><h1>Research</h1><div className="ma-sub" style={{ marginBottom: 0, maxWidth: '80ch' }}>Clean oversight of the Institute's research projects — who is running them, who is on them, where they stand on funding, and what they found. Led by the <b>Research Director</b>. Grant administration itself sits with the Executive Director and Board (P&amp;P 8.4); the figures here are for oversight.{!canManage && <> <Pill>view only</Pill></>}</div></div>
        <div className="cert-actions">{canManage && <button type="button" className="b p-btn sm" onClick={() => setEdit('new')}>+ Add project</button>}<button type="button" className="b s-btn on-light sm" onClick={exportCsv}>↓ Export</button></div>
      </div>
      {error && <div className="cert-err" role="alert">{error}</div>}
      <div className="cert-tiles two">
        <button type="button" className={`cert-tile${filter === 'active' ? ' on' : ''}`} onClick={() => setFilter('active')}><span>Active projects</span><b>{cnt.active}</b></button>
        <button type="button" className={`cert-tile${filter === 'past' ? ' on' : ''}`} onClick={() => setFilter('past')}><span>Past projects</span><b>{cnt.past}</b></button>
      </div>
      <div className="ctc-srow" style={{ gridTemplateColumns: '1fr' }}><div className="cert-search" style={{ margin: 0 }}>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></svg>
        <input type="text" value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => e.key === 'Escape' && setQ('')} autoComplete="off" placeholder="Search projects by name, investigator, IRB or location…" aria-label="Search projects" />
        {q && <button type="button" className="clr" aria-label="Clear search" onClick={() => setQ('')}>×</button>}</div></div>
      {list.length ? list.map(card) : <div className="bnodata">{rows.length ? 'No projects match.' : 'No research projects yet.'}</div>}

      {person && <PersonCard p={person} who={who} canNote={canManage} onClose={() => setPerson(null)} />}
      {edit && <ProjectDialog p={edit === 'new' ? null : edit} onClose={() => setEdit(null)} onSaved={async (m, st) => { setEdit(null); await load(); setFilter(st); toast(m) }} onRemoved={async () => { setEdit(null); await load() }} />}
    </>
  )
}

/* ---------------------------------------------------------------- person card */
export function ResearchSection({ personId }: { personId: string }) {
  const [rows, setRows] = useState<Awaited<ReturnType<typeof researchFor>> | null>(null)
  useEffect(() => { void researchFor(personId).then(setRows) }, [personId])
  if (!rows || !rows.length) return null
  return <>
    <div className="sec">Research <span className="r">{rows.filter((r) => r.project.status === 'active').length} active</span></div>
    {rows.map((r, i) => <div key={i} className="il"><span><b>{r.project.name}</b> <small>· {ROLE_LABEL[r.role as Role] ?? r.role}</small></span>{r.project.published ? <Pill kind="ok">Published</Pill> : <small className="muted">{r.project.status}</small>}</div>)}
  </>
}
function PersonCard({ p, who, canNote, onClose }: { p: PersonLite; who: Who; canNote: boolean; onClose: () => void }) {
  const toast = useToast(); useEsc(onClose)
  const [notes, setNotes] = useState<Note[]>([]); const [txt, setTxt] = useState('')
  useEffect(() => { void notesFor(p.id).then(setNotes) }, [p.id])
  return <div className="cert-veil" onClick={(e) => e.target === e.currentTarget && onClose()}><div className="cert-modal ctc-card bdir" role="dialog" aria-modal="true">
    <div className="ctc-top"><div className="av">{initials(p)}</div><div style={{ flex: 1 }}><h3>{fullName(p)}</h3><div className="ti">{p.contact_type === 'student' ? `Student${p.school ? ' · ' + p.school : ''}` : [p.practice_name, [p.practice_city, p.practice_state].filter(Boolean).join(', ')].filter(Boolean).join(' · ')}</div><div className="ctc-chips">{/(active|current|good)/.test(p.membership_status ?? '') && <Pill>Member</Pill>}</div></div><button type="button" className="x" onClick={onClose} aria-label="Close">×</button></div>
    <div className="ctc-body">
      <div className="sec">Contact</div>
      <div className="kv">{p.email && <><span>Email</span><div>{p.email}</div></>}{p.practice_name && <><span>Practice</span><div>{p.practice_name}{p.practice_city ? ` · ${p.practice_city}, ${p.practice_state ?? ''}` : ''}</div></>}</div>
      <ResearchSection personId={p.id} />
      <div className="sec">Running notes <span className="r">per person, time-stamped</span></div>
      {canNote && <div className="ctc-noteform"><textarea value={txt} onChange={(e) => setTxt(e.target.value)} placeholder="Add a running note…" /><div className="r"><button type="button" className="b p-btn sm" onClick={async () => { const t = txt.trim(); if (!t) return; const r = await addNote(p.id, t, who); if (r.error) return toast(friendly(r.error)); setTxt(''); setNotes(await notesFor(p.id)); toast('Note added') }}>Add note</button></div></div>}
      {notes.length ? notes.map((n) => <div key={n.id} className="ctc-note">{n.text}<small>{n.by_name ?? '—'} · {fmtTs(n.created_at)}</small></div>) : <p className="muted" style={{ marginTop: 8 }}>No notes yet.</p>}
    </div>
    <div className="mf evt-foot"><span><a className="b s-btn on-light sm" href="#leads">Open in Contacts</a></span><button type="button" className="b s-btn on-light sm" onClick={onClose}>Close</button></div>
  </div></div>
}

/* ------------------------------------------------------------- project dialog */
function ProjectDialog({ p, onClose, onSaved, onRemoved }: { p: Project | null; onClose: () => void; onSaved: (m: string, status: 'active' | 'past') => void; onRemoved: () => void }) {
  const toast = useToast(); useEsc(onClose)
  const [v, setV] = useState<ProjectInput>({
    name: p?.name ?? '', irb: p?.irb ?? '', primary_location: p?.primary_location ?? '', estimated_budget: p?.estimated_budget != null ? String(p.estimated_budget) : '', estimated_funding: p?.estimated_funding != null ? String(p.estimated_funding) : '',
    study_url: p?.study_url ?? '', overview: p?.overview ?? '', status: p?.status ?? 'active', published: !!p?.published, published_date: p?.published_date ?? '', publication_citation: p?.publication_citation ?? '', publication_doi: p?.publication_doi ?? '', publication_url: p?.publication_url ?? '', outcomes: p?.outcomes ?? '',
    team: (p?.research_team ?? []).map((m) => ({ ...m })),
  })
  const [q, setQ] = useState(''); const [hits, setHits] = useState<PersonLite[]>([]); const [saving, setSaving] = useState(false)
  useEffect(() => { if (q.trim().length < 2) { setHits([]); return } const h = setTimeout(() => { void searchPeople(q).then((r) => setHits(r.filter((x) => !v.team.some((m) => m.person_id === x.id)))) }, 200); return () => clearTimeout(h) }, [q, v.team])
  const set = (k: keyof ProjectInput) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => setV({ ...v, [k]: e.target.value })
  const addMember = (m: Member) => { const role: Role = v.team.some((x) => x.role === 'pi') ? 'co_investigator' : 'pi'; setV({ ...v, team: [...v.team, { ...m, role }] }); setQ('') }
  async function save() {
    if (!v.name.trim()) return toast('Give the project a name')
    setSaving(true); const r = await saveProject(p?.id ?? null, { ...v, name: v.name.trim() }, p); setSaving(false)
    if (r.error) return toast(friendly(r.error))
    onSaved(p ? 'Project saved' : `${v.name.trim()} added`, v.status)
  }
  return <div className="cert-veil" onClick={(e) => e.target === e.currentTarget && onClose()}><div className="cert-modal wide" role="dialog" aria-modal="true">
    <div className="mh"><div><h3>{p ? 'Manage project' : 'Add project'}</h3><p>Research Director and Executive Director · every Institute person on the team links to their contact card; outside people can be name-only</p></div><button type="button" className="x" onClick={onClose} aria-label="Close">×</button></div>
    <div className="mb"><div className="cert-grid mform evt-grid">
      <F l="Project name" full><input className="fi" value={v.name} onChange={set('name')} placeholder="Required" /></F>
      <div className="full"><label className="flabel">Team</label>
        {v.team.length > 0 && <div className="rteam">{v.team.map((m, n) => <div key={m.id ?? `n${n}`} className="rtm"><div><b>{memberName(m)}</b>{!m.person_id && <small>{m.affiliation || 'name only — no contact card'}</small>}</div><select className="fi" value={m.role} onChange={(e) => setV({ ...v, team: v.team.map((x, i) => i === n ? { ...x, role: e.target.value as Role } : x) })}>{(Object.entries(ROLE_LABEL) as [Role, string][]).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select><button type="button" className="x" onClick={() => setV({ ...v, team: v.team.filter((_, i) => i !== n) })} aria-label="Remove">×</button></div>)}</div>}
        {!v.team.length && <div className="evt-hint">No one on the team yet. The first person you add becomes the Principal investigator.</div>}
        <div className="iwho"><input className="fi" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Type a name from Contacts, or an outside investigator's name…" autoComplete="off" />
          {q.trim().length >= 2 && <div className="who-list">{hits.map((h) => <div key={h.id} onClick={() => addMember({ person_id: h.id, name: fullName(h), role: 'co_investigator', affiliation: null, people: h })}><b>{fullName(h)}</b> <small>· {h.practice_name ?? h.school ?? ''}</small></div>)}<div className="new" onClick={() => addMember({ person_id: null, name: q.trim(), role: 'co_investigator', affiliation: 'outside investigator' })}>+ Add “{q.trim()}” as an outside investigator (no contact card)</div></div>}</div></div>
      <F l="IRB of record"><input className="fi" value={v.irb} onChange={set('irb')} placeholder="e.g. Sherman College of Chiropractic" /></F>
      <F l="Primary research location"><input className="fi" value={v.primary_location} onChange={set('primary_location')} /></F>
      <F l="Estimated budget ($)"><input className="fi" type="number" value={v.estimated_budget} onChange={set('estimated_budget')} /></F>
      <F l="Estimated funding ($)" hint="Grants in the ledger count toward this automatically."><input className="fi" type="number" value={v.estimated_funding} onChange={set('estimated_funding')} /></F>
      <F l="Study website / fundraising page" full><input className="fi" value={v.study_url} onChange={set('study_url')} placeholder="https://" /></F>
      <F l="Overview" full><textarea className="fi" value={v.overview} onChange={set('overview')} style={{ minHeight: 90 }} /></F>
      <F l="Status"><select className="fi" value={v.status} onChange={set('status')}><option value="active">Active</option><option value="past">Past</option></select></F>
      <F l="Published"><select className="fi" value={v.published ? 'yes' : 'no'} onChange={(e) => setV({ ...v, published: e.target.value === 'yes' })}><option value="no">No</option><option value="yes">Yes</option></select></F>
      {v.published && <>
        <F l="Publication date"><input className="fi" type="date" value={v.published_date} onChange={set('published_date')} /></F>
        <F l="DOI"><input className="fi" value={v.publication_doi} onChange={set('publication_doi')} placeholder="10.xxxx/…" /></F>
        <F l="Citation" full><input className="fi" value={v.publication_citation} onChange={set('publication_citation')} /></F>
        <F l="Full-text link" full><input className="fi" value={v.publication_url} onChange={set('publication_url')} placeholder="https://" /></F>
      </>}
      <F l="Outcomes & findings — for the Curriculum Committee (P&P 3.8.5)" full><textarea className="fi" value={v.outcomes} onChange={set('outcomes')} /></F>
    </div></div>
    <div className="mf evt-foot"><span>{p && <button type="button" className="b d-btn sm" onClick={async () => { if (!(await askConfirm('Remove this project entirely?', { body: 'This cannot be undone. Set it to Past instead to keep the record.', ok: 'Remove project', danger: true }))) return; const r = await removeProject(p.id); if (r.error) return toast(friendly(r.error)); onRemoved() }}>Remove project</button>}</span><span style={{ display: 'flex', gap: 8 }}><button type="button" className="b s-btn on-light sm" onClick={onClose}>Cancel</button><button type="button" className="b p-btn sm" disabled={saving} onClick={() => void save()}>{saving ? 'Saving…' : p ? 'Save' : 'Add project'}</button></span></div>
  </div></div>
}
