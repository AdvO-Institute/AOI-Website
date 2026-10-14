/* ----------------------------------------------------------------------------
 * Org Chart. The Board and its officers at the top, the Executive Director
 * under the Board, and the committees under the Executive Director, each with
 * its chair, co-chair and members. Read-only: seats are assigned in Roles &
 * Access, and an empty seat says so rather than being left out. Each name
 * shows its headshot (or initials) and opens a card with whatever email and
 * phone the viewer's own access lets the database return.
 * -------------------------------------------------------------------------- */
import { createContext, useContext, useEffect, useState } from 'react'
import { orgPeople, orgCommittees, OFFICERS, personName, holds } from '@/lib/queries/org'
import type { OrgPerson, OrgCommittee } from '@/lib/queries/org'
import { Head } from './opsUi'

const initials = (p: OrgPerson) => `${p.first_name?.[0] ?? ''}${p.last_name?.[0] ?? ''}`.toUpperCase() || '·'
/** Opens a person's contact card; set by the panel. */
const Pick = createContext<(p: OrgPerson) => void>(() => {})

function Face({ p }: { p: OrgPerson }) {
  const [broken, setBroken] = useState(false)
  return <span className="org-av" aria-hidden="true">{p.photo_url && !broken ? <img src={p.photo_url} alt="" loading="lazy" onError={() => setBroken(true)} /> : initials(p)}</span>
}

/** A name that opens the person's card; `face` adds the thumbnail. */
function Who({ p, face = true }: { p: OrgPerson; face?: boolean }) {
  const pick = useContext(Pick)
  return <button type="button" className="org-who" onClick={() => pick(p)}>{face && <Face p={p} />}<b>{personName(p)}</b></button>
}

function Seat({ title, people, lead = false }: { title: string; people: OrgPerson[]; lead?: boolean }) {
  return <div className={`org-seat${lead ? ' lead' : ''}${people.length ? '' : ' open'}`}>
    <span>{title}</span>
    {people.length ? <div className="org-people">{people.map((p) => <Who key={p.id} p={p} />)}</div> : <i>Vacant</i>}
  </div>
}

export default function OrgPanel() {
  const [rows, setRows] = useState<OrgPerson[] | null>(null)
  const [coms, setComs] = useState<OrgCommittee[]>([])
  const [error, setError] = useState<string | null>(null)
  const [card, setCard] = useState<OrgPerson | null>(null)

  useEffect(() => {
    let off = false
    void (async () => {
      const [p, c] = await Promise.all([orgPeople(), orgCommittees()])
      if (off) return
      setRows(p.rows); setComs(c); setError(p.error ?? null)
    })()
    return () => { off = true }
  }, [])

  const head = <Head title="Org Chart" lede="Who holds each seat, drawn from Roles & Access. To change a seat, assign the role there and the chart follows." />
  if (!rows) return <>{head}<div className="ma-panel"><p className="ma-empty">{error ? 'The org chart could not be loaded.' : 'Loading…'}</p></div></>

  const who = (role: string, committeeId: number | null = null) => rows.filter((p) => holds(p, role, committeeId))
  const officers = new Set<string>(OFFICERS.map(([k]) => k))
  const directors = rows.filter((p) => holds(p, 'board_member') && !p.person_roles.some((r) => officers.has(r.role_key)))
  const committees = coms.filter((c) => c.key !== 'treasury')

  /* What each seat is called on the card: "Treasurer", "Chair · Research Committee". */
  const ROLE: Record<string, string> = { ...Object.fromEntries(OFFICERS), board_member: 'Board of Directors', executive_director: 'Executive Director', research_director: 'Director', committee_chair: 'Chair', committee_cochair: 'Co-chair', committee_member: 'Member' }
  const seats = (p: OrgPerson) => [...new Set(p.person_roles.map((r) => { const c = coms.find((x) => x.id === r.committee_id); return (ROLE[r.role_key] ?? r.role_key) + (c ? ` · ${c.name}` : '') }))]

  return <Pick.Provider value={setCard}>
    {head}
    <div className="org">
      <section className="org-tier">
        <h2>Board of Directors</h2>
        <div className="org-row">{OFFICERS.map(([k, t]) => <Seat key={k} title={t} people={who(k)} lead />)}</div>
        {directors.length > 0 && <div className="org-dirs"><span>Directors</span><div className="org-people">{directors.map((p) => <Who key={p.id} p={p} />)}</div></div>}
      </section>
      <div className="org-line" aria-hidden="true" />
      <section className="org-tier">
        <div className="org-row one"><Seat title="Executive Director" people={who('executive_director')} lead /></div>
      </section>
      <div className="org-line" aria-hidden="true" />
      <section className="org-tier">
        <h2>Committees <small>each files a monthly report to the Board</small></h2>
        <div className="org-coms">{committees.map((c) => {
          const chair = c.key === 'research' ? [...who('research_director', c.id), ...who('committee_chair', c.id)].filter((p, i, all) => all.findIndex((x) => x.id === p.id) === i) : who('committee_chair', c.id)
          const co = who('committee_cochair', c.id)
          const members = who('committee_member', c.id)
          return <div key={c.id} className="org-com">
            <h3>{c.name}</h3>
            <Seat title={c.key === 'research' ? 'Director' : 'Chair'} people={chair} />
            {co.length > 0 && <Seat title="Co-chair" people={co} />}
            <div className="org-mem">{members.length ? <><span>Members</span>{members.map((p, i) => <span key={p.id} className="org-memname">{i > 0 && ' · '}<Who p={p} face={false} /></span>)}</> : <i>No members listed</i>}</div>
          </div>
        })}</div>
      </section>
    </div>
    {card && <Card p={card} seats={seats(card)} onClose={() => setCard(null)} />}
  </Pick.Provider>
}

/** Email, and mobile/office numbers to call or text — only what came back for this viewer. */
function Card({ p, seats, onClose }: { p: OrgPerson; seats: string[]; onClose: () => void }) {
  useEffect(() => { const k = (e: KeyboardEvent) => e.key === 'Escape' && onClose(); document.addEventListener('keydown', k); return () => document.removeEventListener('keydown', k) }, [onClose])
  const dial = (n: string) => n.replace(/[^\d+]/g, '')
  const phone = (label: string, n: string | null | undefined, text: boolean) => n ? <div className="org-line-item"><span>{label}</span><b className="num">{n}</b><span className="org-acts"><a className="b s-btn on-light xs" href={`tel:${dial(n)}`}>Call</a>{text && <a className="b s-btn on-light xs" href={`sms:${dial(n)}`}>Text</a>}</span></div> : null
  const none = !p.email && !p.mobile_phone && !p.office_phone
  return <div className="cert-veil" onClick={(e) => e.target === e.currentTarget && onClose()}>
    <div className="cert-modal org-card" role="dialog" aria-modal="true" aria-label={personName(p)}>
      <div className="ctc-top"><Face p={p} /><div style={{ flex: 1, minWidth: 0 }}><h3>{personName(p)}</h3><div className="ti">{seats.join(' · ')}</div></div><button type="button" className="x" aria-label="Close" onClick={onClose}>×</button></div>
      <div className="mb">
        {p.email && <div className="org-line-item"><span>Email</span><b>{p.email}</b><span className="org-acts"><a className="b s-btn on-light xs" href={`mailto:${p.email}`}>Email</a></span></div>}
        {phone('Mobile', p.mobile_phone, true)}
        {phone('Office', p.office_phone, false)}
        {none && <p className="ma-empty" style={{ margin: 0 }}>No email or phone number on file.</p>}
      </div>
    </div>
  </div>
}
