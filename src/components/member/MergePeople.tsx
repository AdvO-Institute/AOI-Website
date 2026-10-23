/* ----------------------------------------------------------------------------
 * Merge two records for the same person, or delete one. Opened from a person's
 * card by Board or full admin. The work itself is done by two database
 * functions (see mergePeople / deletePerson in contacts.ts); this is only the
 * choosing and the confirming.
 * -------------------------------------------------------------------------- */
import { useEffect, useState } from 'react'
import { mergePeople, deletePerson, findPeople, suggestMerges, type PeopleOp, type MergeHit, type MergeSuggestion, type KeepSecond } from '@/lib/queries/contacts'
import { Modal, askConfirm } from './opsUi'

type Who = { id: string; first_name: string | null; last_name: string | null; credentials?: string | null; email?: string | null; membership_status?: string | null; practice_name?: string | null; practice_address?: string | null; practice_city?: string | null; auth_user_id?: string | null }
/** What tells two same-name records apart: email, membership, city. */
const detail = (p: Who) => [p.email ?? 'no email', p.membership_status, p.practice_city].filter(Boolean).join(' · ')
const name = (p: Who) => `${p.first_name ?? ''} ${p.last_name ?? ''}`.trim() + (p.credentials ? `, ${p.credentials}` : '')
const NOT_YET = 'Merging and deleting are not switched on yet. Chris needs to add them on the database side.'

/** Words for a failed merge or delete. */
export const opError = (r: PeopleOp) => (r.missing ? NOT_YET : r.error ?? 'Something went wrong. Please try again.')

export async function confirmDelete(p: Who): Promise<PeopleOp | null> {
  if (!(await askConfirm(`Delete ${name(p)}?`, { body: 'This removes the record for good. A record with registrations, payments, certifications or board service cannot be deleted; merge it into the right record instead.', ok: 'Delete', danger: true }))) return null
  return deletePerson(p.id)
}

/* What the other record has that the kept one would otherwise lose: a different
 * email, or a practice somewhere else. Each can be kept as a second one. */
const t = (x?: string | null) => (x ?? '').trim().toLowerCase()
const place = (p: Who) => [p.practice_name, p.practice_address, p.practice_city].map((x) => (x ?? '').trim()).filter(Boolean)
export function secondsOf(keep: Who, drop: Who): { email: string | null; location: string | null } {
  const email = t(drop.email) && t(keep.email) && t(drop.email) !== t(keep.email) ? drop.email!.trim() : null
  const at = (p: Who) => `${t(p.practice_address)}|${t(p.practice_city)}`
  const location = place(drop).length && place(keep).length && at(drop) !== at(keep) ? place(drop).join(', ') : null
  return { email, location }
}

/** The two tick boxes: keep the other email, add the other office. Both start ticked. */
export function KeepSecondChoices({ keep, drop, value, onChange }: { keep: Who; drop: Who; value: KeepSecond; onChange: (v: KeepSecond) => void }) {
  const s = secondsOf(keep, drop)
  if (!s.email && !s.location) return null
  return <div className="merge-keep">
    {s.email && <label><input type="checkbox" checked={value.email} onChange={(e) => onChange({ ...value, email: e.target.checked })} /> Keep <b>{s.email}</b> as a second email</label>}
    {s.location && <label><input type="checkbox" checked={value.location} onChange={(e) => onChange({ ...value, location: e.target.checked })} /> Add <b>{s.location}</b> as another office</label>}
  </div>
}
export const KEEP_BOTH: KeepSecond = { email: true, location: true }

/** The one confirmation before a merge, also used by Find duplicates. */
export function confirmMerge(keep: Who, drop: Who, second: KeepSecond = KEEP_BOTH): Promise<boolean> {
  const tag = (x: Who) => `${name(x)}${x.email ? ` (${x.email})` : ''}`
  const s = secondsOf(keep, drop)
  const kept = [s.email && second.email ? `${s.email} stays as a second email` : null, s.location && second.location ? `${s.location} is added as another office` : null].filter(Boolean).join(', and ')
  return askConfirm(`Merge into ${tag(keep)}?`, { body: `Everything on ${tag(drop)}, including registrations, payments, certifications, roles, notes and the login, moves to the record you keep. Its blanks are filled in${kept ? `, ${kept}` : ''}, and the duplicate is removed.${keep.auth_user_id && drop.auth_user_id ? ` Both records have a login: the one on ${name(keep)} stays, and the other is switched off.` : ''} This cannot be undone.`, ok: 'Merge', danger: true })
}

export function MergeDialog({ p, start, onClose, onDone }: { p: Who; start?: Who; onClose: () => void; onDone: (r: PeopleOp, kept: string) => void }) {
  const [q, setQ] = useState('')
  const [hits, setHits] = useState<MergeHit[]>([])
  const [other, setOther] = useState<Who | null>(start ?? null)
  const [keepThis, setKeepThis] = useState(false)
  const [busy, setBusy] = useState(false)
  const [second, setSecond] = useState<KeepSecond>(KEEP_BOTH)
  const [likely, setLikely] = useState<MergeSuggestion[] | null>(null)
  useEffect(() => {
    let off = false
    void suggestMerges(p.id).then((r) => { if (!off) setLikely(r) })
    return () => { off = true }
  }, [p.id])
  useEffect(() => {
    let off = false
    const t = setTimeout(() => void findPeople(q).then((r) => { if (!off) setHits(r.filter((h) => h.id !== p.id)) }), 250)
    return () => { off = true; clearTimeout(t) }
  }, [q, p.id])

  const keep = other && (keepThis ? p : other)
  const drop = other && (keepThis ? other : p)
  async function go() {
    if (!keep || !drop) return
    if (!(await confirmMerge(keep, drop, second))) return
    setBusy(true); const r = await mergePeople(keep.id, drop.id, second); setBusy(false)
    onDone(r, keep.id)
  }

  return <Modal onClose={onClose}>
    <div className="mh"><div><h3>Merge {name(p)} with another record</h3><p>For one person entered twice. Pick the other record, then choose which one to keep.</p></div><button type="button" className="x" aria-label="Close" onClick={onClose}>×</button></div>
    <div className="mb">
      {!other ? <>
        {q.trim().length < 2 && <>
          <div className="flabel">Possible matches</div>
          <div className="merge-hits">{likely === null ? <p className="muted" style={{ margin: 0 }}>Looking for records with the same email, phone or a similar name…</p>
            : likely.length ? likely.map((h) => <button type="button" key={h.id} className="merge-hit" onClick={() => setOther(h)}><b>{name(h)}</b><span>{h.why.join(' · ')} · {detail(h)}</span></button>)
            : <p className="muted" style={{ margin: 0 }}>No one shares this email or phone, and no one has a similar name.</p>}</div>
        </>}
        <label className="flabel" htmlFor="merge-q" style={{ marginTop: 12 }}>Or find the other record by name</label>
        <input id="merge-q" className="fi" autoComplete="off" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Type a first or last name" />
        <div className="merge-hits">{hits.map((h) => <button type="button" key={h.id} className="merge-hit" onClick={() => setOther(h)}><b>{name(h)}</b><span>{detail(h)}</span></button>)}
          {q.trim().length >= 2 && hits.length === 0 && <p className="muted" style={{ margin: '8px 0 0' }}>No one else by that name.</p>}</div>
      </> : <>
        <div className="flabel">Keep which record?</div>
        <label className="merge-pick"><input type="radio" name="keep" checked={!keepThis} onChange={() => setKeepThis(false)} /> <span><b>{name(other)}</b> <span className="muted">the one you found · {detail(other)}</span></span></label>
        <label className="merge-pick"><input type="radio" name="keep" checked={keepThis} onChange={() => setKeepThis(true)} /> <span><b>{name(p)}</b> <span className="muted">this card · {detail(p)}</span></span></label>
        {keep && drop && <KeepSecondChoices keep={keep} drop={drop} value={second} onChange={setSecond} />}
        <button type="button" className="b s-btn on-light xs" style={{ marginTop: 10 }} onClick={() => setOther(null)}>Pick a different record</button>
      </>}
    </div>
    <div className="mf"><button type="button" className="b s-btn on-light sm" onClick={onClose}>Cancel</button><button type="button" className="b dgr sm" disabled={!other || busy} onClick={() => void go()}>{busy ? 'Merging…' : 'Merge'}</button></div>
  </Modal>
}
