/* ----------------------------------------------------------------------------
 * Merge two records for the same person, or delete one. Opened from a person's
 * card by Board or full admin. The work itself is done by two database
 * functions (see mergePeople / deletePerson in contacts.ts); this is only the
 * choosing and the confirming.
 * -------------------------------------------------------------------------- */
import { useEffect, useState } from 'react'
import { mergePeople, deletePerson, findPeople, suggestMerges, type PeopleOp, type MergeHit, type MergeSuggestion } from '@/lib/queries/contacts'
import { Modal, askConfirm } from './opsUi'

type Who = { id: string; first_name: string | null; last_name: string | null; credentials?: string | null; email?: string | null; membership_status?: string | null; practice_city?: string | null; auth_user_id?: string | null }
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

export function MergeDialog({ p, onClose, onDone }: { p: Who; onClose: () => void; onDone: (r: PeopleOp, kept: string) => void }) {
  const [q, setQ] = useState('')
  const [hits, setHits] = useState<MergeHit[]>([])
  const [other, setOther] = useState<MergeHit | null>(null)
  const [keepThis, setKeepThis] = useState(false)
  const [busy, setBusy] = useState(false)
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
    const tag = (x: Who) => `${name(x)}${x.email ? ` (${x.email})` : ''}`
    if (!(await askConfirm(`Merge into ${tag(keep)}?`, { body: `Everything on ${tag(drop)}, including registrations, payments, certifications, roles, notes and the login, moves to the record you keep. Its blanks are filled in, and the duplicate is removed.${keep.auth_user_id && drop.auth_user_id ? ` Both records have a login: the one on ${name(keep)} stays, and the other is switched off.` : ''} This cannot be undone.`, ok: 'Merge', danger: true }))) return
    setBusy(true); const r = await mergePeople(keep.id, drop.id); setBusy(false)
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
        <button type="button" className="b s-btn on-light xs" style={{ marginTop: 10 }} onClick={() => setOther(null)}>Pick a different record</button>
      </>}
    </div>
    <div className="mf"><button type="button" className="b s-btn on-light sm" onClick={onClose}>Cancel</button><button type="button" className="b dgr sm" disabled={!other || busy} onClick={() => void go()}>{busy ? 'Merging…' : 'Merge'}</button></div>
  </Modal>
}
