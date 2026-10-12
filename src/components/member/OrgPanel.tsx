/* ----------------------------------------------------------------------------
 * Org Chart. The Board and its officers at the top, the Executive Director
 * under the Board, and the committees under the Executive Director, each with
 * its chair, co-chair and members. Read-only: seats are assigned in Roles &
 * Access, and an empty seat says so rather than being left out.
 * -------------------------------------------------------------------------- */
import { useEffect, useState } from 'react'
import { orgPeople, orgCommittees, OFFICERS, personName, holds } from '@/lib/queries/org'
import type { OrgPerson, OrgCommittee } from '@/lib/queries/org'
import { Head } from './opsUi'

function Seat({ title, people, lead = false }: { title: string; people: OrgPerson[]; lead?: boolean }) {
  return <div className={`org-seat${lead ? ' lead' : ''}${people.length ? '' : ' open'}`}>
    <span>{title}</span>
    {people.length ? people.map((p) => <b key={p.id}>{personName(p)}</b>) : <i>Vacant</i>}
  </div>
}

export default function OrgPanel() {
  const [rows, setRows] = useState<OrgPerson[] | null>(null)
  const [coms, setComs] = useState<OrgCommittee[]>([])
  const [error, setError] = useState<string | null>(null)

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

  return <>
    {head}
    <div className="org">
      <section className="org-tier">
        <h2>Board of Directors</h2>
        <div className="org-row">{OFFICERS.map(([k, t]) => <Seat key={k} title={t} people={who(k)} lead />)}</div>
        {directors.length > 0 && <div className="org-dirs"><span>Directors</span>{directors.map((p) => <b key={p.id}>{personName(p)}</b>)}</div>}
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
            <div className="org-mem">{members.length ? <><span>Members</span>{members.map((p) => personName(p)).join(' · ')}</> : <i>No members listed</i>}</div>
          </div>
        })}</div>
      </section>
    </div>
  </>
}
