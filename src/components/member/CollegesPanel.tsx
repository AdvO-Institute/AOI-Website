/* ----------------------------------------------------------------------------
 * Chiropractic Colleges — the 51 schools, our partnerships, our liaison at
 * each, the school's own contacts, students and leads from there, and the
 * school approvals our preceptors hold with it (written on the Internships
 * tab, read here).
 * -------------------------------------------------------------------------- */
import { friendlyError } from '@/lib/friendlyError'
import { SafeLink, askConfirm } from './opsUi'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useAccess } from '@/lib/queries/AccessProvider'
import { useToast } from '@/components/ui/Toast'
import { displayName } from '@/lib/access'
import { colleges as loadColleges, contactsFor, peopleAt, approvalsFor, collegeCounts, inTraining, partnerText, webHost, fullName, saveCollege, addOurContact, addSchoolContact, removeContact } from '@/lib/queries/colleges'
import type { College, CollegeContact, CollegeApproval, CollegeInput } from '@/lib/queries/colleges'
import { preceptors as loadPreceptors, interns as loadInterns, sites as loadSites, requirements as loadReqs, searchPeople, approvalStatus, approvalLine, advoLevel, LEVEL_LABEL } from '@/lib/queries/internships'
import type { Preceptor, Intern, Site, PersonLite, Who } from '@/lib/queries/internships'
import type { Requirement } from '@/lib/queries/certifications'
import { PersonCard } from './InternshipsPanel'

function Pill({ kind = '', children }: { kind?: string; children: React.ReactNode }) { return <span className={`cpill ${kind}`}>{children}</span> }
function F({ l, children, full = false }: { l: string; children: React.ReactNode; full?: boolean }) { return <div className={full ? 'full' : ''}><label className="flabel">{l}</label>{children}</div> }
function friendly(err: string): string {
  if (/row-level security/.test(err)) return 'You don’t have permission for that. Only the executive director and board can change college records.'
  return friendlyError(err)
}
function useEsc(onClose: () => void) { useEffect(() => { const k = (e: KeyboardEvent) => e.key === 'Escape' && onClose(); document.addEventListener('keydown', k); return () => document.removeEventListener('keydown', k) }, [onClose]) }
const partnerPill = (c: College) => c.active_partnership ? <Pill kind="ok">{c.partnership_type === 'teaching' ? 'Teaching' : 'Visiting'}</Pill> : null

export default function CollegesPanel() {
  const toast = useToast()
  const { access, can } = useAccess()
  const who: Who = { name: displayName(access).replace(/,.*$/, ''), id: access.person?.id ?? null }
  const canManage = can('full_admin') || can('board')
  const canManageInternships = can('full_admin') || can('manage_internships')
  const [rows, setRows] = useState<College[]>([]); const [loading, setLoading] = useState(true); const [error, setError] = useState<string | null>(null)
  const [counts, setCounts] = useState<Awaited<ReturnType<typeof collegeCounts>> | null>(null)
  const [filter, setFilter] = useState<'partners' | 'all' | 'usa' | 'intl'>('partners'); const [q, setQ] = useState('')
  const [card, setCard] = useState<College | null>(null); const [edit, setEdit] = useState<College | null | 'new'>(null)
  const [person, setPerson] = useState<PersonLite | null>(null)
  const [precs, setPrecs] = useState<Preceptor[]>([]); const [ints, setInts] = useState<Intern[]>([]); const [siteRows, setSiteRows] = useState<Site[]>([]); const [reqs, setReqs] = useState<Requirement[]>([])

  const load = useCallback(async () => {
    const r = await loadColleges()
    setError(r.error ? `The college list could not be read. ${friendlyError(r.error)}` : null)
    setRows(r.rows); setLoading(false)
    void collegeCounts().then(setCounts)
  }, [])
  useEffect(() => { void load(); void loadPreceptors().then((r) => setPrecs(r.rows)); void loadInterns().then((r) => setInts(r.rows)); void loadSites().then((r) => setSiteRows(r.rows)); void loadReqs().then((r) => setReqs(r.rows)) }, [load])

  const n = useMemo(() => ({ partners: rows.filter((c) => c.active_partnership).length, usa: rows.filter((c) => c.country === 'USA').length, intl: rows.filter((c) => c.country !== 'USA').length }), [rows])
  const lq = q.trim().toLowerCase()
  const list = rows.filter((c) => filter === 'all' || (filter === 'partners' && c.active_partnership) || (filter === 'usa' && c.country === 'USA') || (filter === 'intl' && c.country !== 'USA'))
    .filter((c) => !lq || `${c.name} ${c.short_name ?? ''} ${c.city ?? ''} ${c.state ?? ''} ${c.country ?? ''} ${c.accreditation ?? ''}`.toLowerCase().includes(lq))
    .sort((a, b) => Number(!!b.active_partnership) - Number(!!a.active_partnership) || (a.country === 'USA' ? -1 : b.country === 'USA' ? 1 : (a.country ?? '').localeCompare(b.country ?? '')) || a.name.localeCompare(b.name))
  function exportCsv() {
    const cols = ['name', 'short_name', 'accreditation', 'city', 'state', 'country', 'address', 'phone', 'website', 'active_partnership', 'partnership_type', 'notes']
    const csv = [cols.join(','), ...list.map((c) => cols.map((k) => `"${String((c as unknown as Record<string, unknown>)[k] ?? '').replace(/"/g, '""')}"`).join(','))].join('\n')
    const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' })); a.download = `colleges-${new Date().toISOString().slice(0, 10)}.csv`; a.click(); URL.revokeObjectURL(a.href)
  }

  if (loading) return <><h1>Chiropractic Colleges</h1><div className="ma-sub">Reading the college list…</div><div className="ma-panel"><p className="ma-empty">One moment.</p></div></>

  return (
    <>
      <div className="cert-head">
        <div><h1>Chiropractic Colleges</h1><div className="ma-sub" style={{ marginBottom: 0, maxWidth: '80ch' }}>{rows.length} colleges — recruiting and instructor relationships. Which schools we partner with, who our liaison is, who their people are, which students and leads come from there, and which of our preceptors each school has approved.{!canManage && <> <Pill>view only</Pill></>}</div></div>
        <div className="cert-actions">{canManage && <button type="button" className="b p-btn sm" onClick={() => setEdit('new')}>+ Add college</button>}<button type="button" className="b s-btn on-light sm" onClick={exportCsv}>↓ Export</button></div>
      </div>
      {error && <div className="cert-err" role="alert">{error}</div>}
      <div className="cert-tiles four">
        <button type="button" className={`cert-tile${filter === 'partners' ? ' on' : ''}`} onClick={() => setFilter('partners')}><span>Active partnerships</span><b>{n.partners}</b></button>
        <button type="button" className={`cert-tile${filter === 'all' ? ' on' : ''}`} onClick={() => setFilter('all')}><span>All colleges</span><b>{rows.length}</b></button>
        <button type="button" className={`cert-tile${filter === 'usa' ? ' on' : ''}`} onClick={() => setFilter('usa')}><span>USA</span><b>{n.usa}</b></button>
        <button type="button" className={`cert-tile${filter === 'intl' ? ' on' : ''}`} onClick={() => setFilter('intl')}><span>International</span><b>{n.intl}</b></button>
      </div>
      <div className="ctc-srow" style={{ gridTemplateColumns: '1fr' }}><div className="cert-search" style={{ margin: 0 }}>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></svg>
        <input type="text" value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => e.key === 'Escape' && setQ('')} autoComplete="off" placeholder="Search colleges by name, city, state, country or accreditation…" aria-label="Search colleges" />
        {q && <button type="button" className="clr" aria-label="Clear search" onClick={() => setQ('')}>×</button>}</div></div>
      <div className="bpanel"><div className="ph">{filter === 'partners' ? 'Active partnerships' : filter === 'all' ? 'All colleges' : filter === 'usa' ? 'United States' : 'International'}<span className="r">{list.length} shown · click a school for its card</span></div>
        {list.length ? list.map((c) => { const ap = counts?.approvals.get(c.id); const pp = counts?.people.get(c.id); return <div key={c.id} className="isite">
          <div><button type="button" className="pname" onClick={() => setCard(c)}>{c.name}</button> {c.accreditation && <Pill>{c.accreditation}</Pill>}{partnerPill(c)}
            <div className="addr">{[c.city, c.state, c.country].filter(Boolean).join(', ')}{c.phone ? ` · ${c.phone}` : ''}{c.website ? <> · <SafeLink href={c.website}>{webHost(c.website)}</SafeLink></> : null}</div>
            {(ap || pp) && <div className="who">{ap && <Pill kind={ap.active ? 'ok' : 'warn'}>{ap.active} preceptor{ap.active === 1 ? '' : 's'} approved{ap.other ? ` · ${ap.other} pending/lapsed` : ''}</Pill>}{pp?.students ? <Pill kind="info">{pp.students} student{pp.students === 1 ? '' : 's'} in training</Pill> : null}{pp?.leads ? <Pill>{pp.leads} other lead{pp.leads === 1 ? '' : 's'}</Pill> : null}</div>}
          </div><div className="cnts" /></div> }) : <div className="bnodata">No colleges match.</div>}
      </div>

      {card && <CollegeCard c={card} precs={precs} sites={siteRows} ints={ints} canManage={canManage} onClose={() => setCard(null)} onEdit={() => { const c = card; setCard(null); setEdit(c) }} onOpenPerson={(p) => setPerson(p)} />}
      {person && <PersonCard p={person} precs={precs} ints={ints} sites={siteRows} cols={rows} reqs={reqs} who={who} canManage={canManageInternships} onClose={() => setPerson(null)} onOpenSite={() => setPerson(null)} onOpenPerson={(p) => setPerson(p)} onMakePreceptor={() => { setPerson(null); window.location.hash = 'internships' }} />}
      {edit && <CollegeDialog c={edit === 'new' ? null : edit} onClose={() => setEdit(null)} onSaved={async (m) => { setEdit(null); await load(); toast(m) }} />}
    </>
  )
}

/* ------------------------------------------------------------- school card -- */
function CollegeCard({ c, precs, sites, ints, canManage, onClose, onEdit, onOpenPerson }: { c: College; precs: Preceptor[]; sites: Site[]; ints: Intern[]; canManage: boolean; onClose: () => void; onEdit: () => void; onOpenPerson: (p: PersonLite) => void }) {
  const toast = useToast()
  useEsc(onClose)
  const [contacts, setContacts] = useState<CollegeContact[]>([]); const [ppl, setPpl] = useState<PersonLite[]>([]); const [apps, setApps] = useState<CollegeApproval[]>([])
  const [adding, setAdding] = useState<'ours' | 'theirs' | null>(null)
  const reload = useCallback(async () => { const [a, b, d] = await Promise.all([contactsFor(c.id), peopleAt(c), approvalsFor(c.id)]); setContacts(a); setPpl(b); setApps(d) }, [c])
  useEffect(() => { void reload() }, [reload])
  const ours = contacts.filter((x) => x.is_our_contact); const theirs = contacts.filter((x) => !x.is_our_contact)
  const students = ppl.filter(inTraining); const leads = ppl.filter((p) => !inTraining(p))
  const approvedSites = [...new Set(apps.filter((a) => a.location_id && approvalStatus(a) !== 'lapsed').map((a) => a.location_id as number))]
  const personOf = (id: string | null) => precs.find((p) => p.person_id === id)?.people ?? ints.find((i) => i.person_id === id)?.people ?? null
  const engagement = (id: string) => ints.find((i) => i.person_id === id)
  const statusPill = (a: CollegeApproval) => { const st = approvalStatus(a); return <Pill kind={st === 'active' ? 'ok' : st === 'lapsed' ? 'bad' : 'warn'}>{st}</Pill> }
  return (
    <div className="cert-veil" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="cert-modal ctc-card bdir" role="dialog" aria-modal="true">
        <div className="ctc-top"><div className="av" style={{ fontSize: 11, fontFamily: 'var(--font-label)', fontWeight: 600 }}>{(c.short_name ?? c.name).split(' ')[0]?.slice(0, 6).toUpperCase() ?? ''}</div>
          <div style={{ flex: 1 }}><h3>{c.name}</h3><div className="ti">{[c.city, c.state, c.country].filter(Boolean).join(', ')}{c.accreditation ? ` · ${c.accreditation}` : ''}</div>
            <div className="ctc-chips">{c.active_partnership ? <Pill kind="ok">{c.partnership_type === 'teaching' ? 'Active partner · we teach here' : 'Active partner · we visit'}</Pill> : <Pill>No partnership</Pill>}{apps.length > 0 && <Pill>{apps.length} school approval{apps.length === 1 ? '' : 's'}</Pill>}</div></div>
          <button type="button" className="x" onClick={onClose} aria-label="Close">×</button></div>
        <div className="ctc-body">
          <div className="sec">Location &amp; contact</div>
          <div className="kv"><span>Address</span><div>{[c.address, c.city, c.state, c.country].filter(Boolean).join(', ') || '—'}</div>{c.phone && <><span>Phone</span><div>{c.phone}</div></>}{c.website && <><span>Website</span><div><SafeLink href={c.website}>{webHost(c.website)}</SafeLink></div></>}<span>Partnership</span><div>{partnerText(c)}</div></div>

          <div className="sec">Our contact / instructor <span className="r">our people who are the liaison here</span></div>
          {ours.length ? ours.map((x) => <div key={x.id} className="il"><span>{x.people ? <button type="button" className="plink" onClick={() => onOpenPerson(x.people!)}>{fullName(x.people)}</button> : <b>{x.name}</b>} <small>· {x.role ?? ''}</small></span>{canManage && <button type="button" className="link" onClick={async () => { if (!(await askConfirm('Remove this contact from the school?', { ok: 'Remove', danger: true }))) return; const r = await removeContact(x.id); if (r.error) return toast(friendly(r.error)); void reload() }}>remove</button>}</div>) : <div className="il"><i>No liaison recorded yet</i></div>}
          {canManage && adding !== 'ours' && <div className="ctc-noteform" style={{ marginTop: 8 }}><div className="r" style={{ justifyContent: 'flex-start' }}><button type="button" className="b s-btn on-light sm" onClick={() => setAdding('ours')}>+ Add our contact (from Contacts)</button></div></div>}
          {adding === 'ours' && <OurContactForm collegeId={c.id} onDone={(m) => { setAdding(null); if (m) toast(m); void reload() }} />}

          <div className="sec">School contact points <span className="r">the school's own people</span></div>
          {theirs.length ? theirs.map((x) => <div key={x.id} className="il"><span><b>{x.name}</b> <small>· {[x.role, x.email, x.phone].filter(Boolean).join(' · ')}</small></span><span>{x.is_keystone && <Pill kind="gold">Keystone</Pill>}{x.is_instructor && <Pill>Instructor</Pill>}{canManage && <button type="button" className="link" style={{ marginLeft: 8 }} onClick={async () => { if (!(await askConfirm('Remove this school contact?', { ok: 'Remove', danger: true }))) return; const r = await removeContact(x.id); if (r.error) return toast(friendly(r.error)); void reload() }}>remove</button>}</span></div>) : <div className="il"><i>None recorded yet</i></div>}
          {canManage && adding !== 'theirs' && <div className="ctc-noteform" style={{ marginTop: 8 }}><div className="r" style={{ justifyContent: 'flex-start' }}><button type="button" className="b s-btn on-light sm" onClick={() => setAdding('theirs')}>+ Add school contact</button></div></div>}
          {adding === 'theirs' && <SchoolContactForm collegeId={c.id} onDone={(m) => { setAdding(null); if (m) toast(m); void reload() }} />}

          <div className="sec">Students in training <span className="r">still in school · approximate graduation beside the name</span></div>
          {students.length ? students.map((p) => { const e = engagement(p.id); return <div key={p.id} className="il"><span><button type="button" className="plink" onClick={() => onOpenPerson(p)}>{fullName(p)}</button>{e && <> <Pill kind={e.status === 'current' ? 'ok' : e.status === 'planned' ? 'warn' : ''}>intern · {e.status === 'planned' ? 'interested' : e.status}</Pill></>}</span><small>grad {p.grad_year ?? '?'}</small></div> }) : <div className="il"><i>None yet — fills in as the website's forms capture school and graduation date</i></div>}

          <div className="sec">Other leads <span className="r">graduated or not enrolled, still associated with this school</span></div>
          {leads.length ? leads.map((p) => <div key={p.id} className="il"><span><button type="button" className="plink" onClick={() => onOpenPerson(p)}>{fullName(p)}</button></span><small>{[p.grad_year ? `grad ${p.grad_year}` : '', advoLevel(p) !== 'none' ? `AdvO ${LEVEL_LABEL[advoLevel(p)]}` : ''].filter(Boolean).join(' · ')}</small></div>) : <div className="il"><i>None</i></div>}

          <div className="sec">Our preceptors approved by this school <span className="r">recorded on the Internships tab · one line per preceptor × site × period</span></div>
          {apps.length ? apps.map((a) => { const p = personOf(a.preceptors?.person_id ?? null); return <div key={a.id} className="il"><span>{p ? <button type="button" className="plink" onClick={() => onOpenPerson(p)}>{fullName(p)}</button> : <b>{a.preceptors?.person_name ?? '—'}</b>} <small>· {a.preceptors?.status === 'certified' ? 'certified preceptor' : 'preceptor in process'} · {a.locations?.name ?? 'site to be set'}</small></span><span>{statusPill(a)} <small>{approvalLine(a)}</small></span></div> }) : <div className="il"><i>None yet — add a school approval on a preceptor and it shows here</i></div>}
          {approvedSites.length > 0 && <><div className="sec">Internship sites this school has approved</div><div className="ctc-chips" style={{ marginBottom: 8 }}>{approvedSites.map((id) => <Pill key={id}>{sites.find((s) => s.id === id)?.name ?? apps.find((a) => a.location_id === id)?.locations?.name ?? '—'}</Pill>)}</div></>}
          {c.notes && <><div className="sec">Notes</div><div className="ctc-note">{c.notes}</div></>}
        </div>
        <div className="mf evt-foot"><span>{canManage && <button type="button" className="b s-btn on-light sm" onClick={onEdit}>Edit college</button>}</span><button type="button" className="b s-btn on-light sm" onClick={onClose}>Close</button></div>
      </div>
    </div>
  )
}
function OurContactForm({ collegeId, onDone }: { collegeId: number; onDone: (m: string | null) => void }) {
  const toast = useToast()
  const [q, setQ] = useState(''); const [hits, setHits] = useState<PersonLite[]>([]); const [pick, setPick] = useState<PersonLite | null>(null); const [role, setRole] = useState('')
  useEffect(() => { if (pick || q.trim().length < 2) { setHits([]); return } const h = setTimeout(() => { void searchPeople(q).then(setHits) }, 200); return () => clearTimeout(h) }, [q, pick])
  return <div className="baddform">
    {pick ? <div className="ipicked"><b>{fullName(pick)}</b><span>{pick.practice_name ?? ''}</span><button type="button" className="x" onClick={() => setPick(null)} aria-label="Change">×</button></div>
      : <div className="iwho"><input className="fi" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Type a name from Contacts…" autoComplete="off" />{hits.length > 0 && <div className="who-list">{hits.map((h) => <div key={h.id} onClick={() => { setPick(h); setQ('') }}><b>{fullName(h)}</b> <small>· {h.practice_name ?? ''}</small></div>)}</div>}</div>}
    <input className="fi" value={role} onChange={(e) => setRole(e.target.value)} placeholder="Role with the school — liaison, guest lecturer, alumni contact…" />
    <div className="r"><button type="button" className="b s-btn on-light sm" onClick={() => onDone(null)}>Cancel</button><button type="button" className="b p-btn sm" disabled={!pick} onClick={async () => { if (!pick) return; const r = await addOurContact(collegeId, pick, role.trim()); if (r.error) return toast(friendly(r.error)); onDone('Contact added') }}>Add</button></div>
  </div>
}
function SchoolContactForm({ collegeId, onDone }: { collegeId: number; onDone: (m: string | null) => void }) {
  const toast = useToast()
  const [v, setV] = useState({ name: '', role: '', email: '', phone: '', is_instructor: false, is_keystone: false, notes: '' })
  return <div className="baddform">
    <div className="g2" style={{ gridTemplateColumns: '1fr 1fr' }}><input className="fi" value={v.name} onChange={(e) => setV({ ...v, name: e.target.value })} placeholder="Name" /><input className="fi" value={v.role} onChange={(e) => setV({ ...v, role: e.target.value })} placeholder="Role — dean, clinic director, club advisor…" /></div>
    <div className="g2" style={{ gridTemplateColumns: '1fr 1fr' }}><input className="fi" value={v.email} onChange={(e) => setV({ ...v, email: e.target.value })} placeholder="Email" /><input className="fi" value={v.phone} onChange={(e) => setV({ ...v, phone: e.target.value })} placeholder="Phone" /></div>
    <div style={{ display: 'flex', gap: 18, fontSize: 13 }}><label><input type="checkbox" checked={v.is_instructor} onChange={(e) => setV({ ...v, is_instructor: e.target.checked })} /> Instructor</label><label><input type="checkbox" checked={v.is_keystone} onChange={(e) => setV({ ...v, is_keystone: e.target.checked })} /> Keystone contact</label></div>
    <div className="r"><button type="button" className="b s-btn on-light sm" onClick={() => onDone(null)}>Cancel</button><button type="button" className="b p-btn sm" disabled={!v.name.trim()} onClick={async () => { const r = await addSchoolContact(collegeId, { ...v, name: v.name.trim() }); if (r.error) return toast(friendly(r.error)); onDone('School contact added') }}>Add</button></div>
  </div>
}

/* ---------------------------------------------------------- college dialog -- */
function CollegeDialog({ c, onClose, onSaved }: { c: College | null; onClose: () => void; onSaved: (m: string) => void }) {
  const toast = useToast()
  useEsc(onClose)
  const [v, setV] = useState<CollegeInput>({ name: c?.name ?? '', short_name: c?.short_name ?? '', city: c?.city ?? '', state: c?.state ?? '', country: c?.country ?? 'USA', address: c?.address ?? '', phone: c?.phone ?? '', website: c?.website ?? '', accreditation: c?.accreditation ?? '', active_partnership: !!c?.active_partnership, partnership_type: c?.partnership_type ?? 'teaching', notes: c?.notes ?? '' })
  const [saving, setSaving] = useState(false)
  const set = (k: keyof CollegeInput) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => setV({ ...v, [k]: e.target.value })
  return (
    <div className="cert-veil" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="cert-modal wide" role="dialog" aria-modal="true">
        <div className="mh"><div><h3>{c ? 'Edit college' : 'Add college'}</h3><p>Executive Director and Board</p></div><button type="button" className="x" onClick={onClose} aria-label="Close">×</button></div>
        <div className="mb"><div className="cert-grid mform evt-grid">
          <F l="Name" full><input className="fi" value={v.name} onChange={set('name')} /></F>
          <F l="Short name"><input className="fi" value={v.short_name} onChange={set('short_name')} /></F>
          <F l="Accreditation"><input className="fi" value={v.accreditation} onChange={set('accreditation')} placeholder="CCE-USA, ECCE, CCEA…" /></F>
          <F l="City"><input className="fi" value={v.city} onChange={set('city')} /></F>
          <F l="State"><input className="fi" value={v.state} onChange={set('state')} /></F>
          <F l="Country"><input className="fi" value={v.country} onChange={set('country')} /></F>
          <F l="Phone"><input className="fi" value={v.phone} onChange={set('phone')} /></F>
          <F l="Website" full><input className="fi" value={v.website} onChange={set('website')} placeholder="https://…" /></F>
          <F l="Address" full><input className="fi" value={v.address} onChange={set('address')} /></F>
          <div className="full"><label className="evt-tog" style={{ marginTop: 4 }}><input type="checkbox" checked={v.active_partnership} onChange={(e) => setV({ ...v, active_partnership: e.target.checked })} /><span><b>Active partnership</b><small>shows under Active partnerships and on the public site's partner list, when there is one</small></span></label></div>
          <F l="Partnership type"><select className="fi" value={v.partnership_type} disabled={!v.active_partnership} onChange={set('partnership_type')}><option value="teaching">We teach here (official)</option><option value="visiting">Relationship / we visit</option></select></F>
          <F l="Notes" full><textarea className="fi" value={v.notes} onChange={set('notes')} /></F>
        </div></div>
        <div className="mf"><button type="button" className="b s-btn on-light sm" onClick={onClose}>Cancel</button><button type="button" className="b p-btn sm" disabled={saving} onClick={async () => { if (!v.name.trim()) return toast('Name?'); setSaving(true); const r = await saveCollege(c?.id ?? null, { ...v, name: v.name.trim() }); setSaving(false); if (r.error) return toast(friendly(r.error)); onSaved(c ? 'College saved' : `${v.name.trim()} added`) }}>{saving ? 'Saving…' : c ? 'Save' : 'Add college'}</button></div>
      </div>
    </div>
  )
}
