/* ----------------------------------------------------------------------------
 * Find duplicates: every pair of records in the Directory that may be one
 * person entered twice, best first, each saying why. Opened from the Directory
 * by Board or full admin. Tap the record to keep, then merge and confirm once.
 * The names must be close; the same email or personal phone moves a pair up.
 * "Not the same person" is saved for everyone (not_duplicates); "Search all
 * potential duplicates" shows those pairs too, and one can be put back.
 * -------------------------------------------------------------------------- */
import { useEffect, useMemo, useState } from 'react'
import type { Contact, NotDuplicate } from '@/lib/queries/contacts'
import { Modal } from './opsUi'
import { confirmMerge, opError, KeepSecondChoices, KEEP_BOTH } from './MergePeople'
import { mergePeople, nameMatch, loadNotDuplicates, markNotDuplicate, unmarkNotDuplicate, type KeepSecond } from '@/lib/queries/contacts'
import { useToast } from '@/components/ui/Toast'
import { fmtD } from './PersonCard'

type Pair = { a: Contact; b: Contact; why: string[]; score: number }

const digits = (s: string | null | undefined) => (s ?? '').replace(/\D/g, '').slice(-10)

function findPairs(rows: Contact[]): Pair[] {
  const own = (p: Contact) => [p.personal_phone, p.mobile_phone].map(digits).filter((d) => d.length >= 7)
  const live = rows.filter((p) => !p.deceased_on).map((p) => ({ p, email: (p.email ?? '').trim().toLowerCase(), own: own(p) }))
  const out: Pair[] = []
  live.forEach((x, i) => live.slice(i + 1).forEach((y) => {
    const close = nameMatch(x.p, y.p)
    if (!close) return
    const why: string[] = [close]
    let score = close === 'same name' ? 2 : 1
    if (x.email && x.email === y.email) { why.push('same email'); score += 3 }
    if (x.own.some((d) => y.own.includes(d))) { why.push('same phone'); score += 2 }
    out.push({ a: x.p, b: y.p, why, score })
  }))
  return out.sort((m, n) => n.score - m.score || (m.a.last_name ?? '').localeCompare(n.a.last_name ?? ''))
}

const pairKey = (p: Pair) => [p.a.id, p.b.id].sort().join('|')

const name = (p: Contact) => `${p.first_name ?? ''} ${p.last_name ?? ''}`.trim() + (p.credentials ? `, ${p.credentials}` : '')
const detail = (p: Contact) => [p.email ?? 'no email', p.membership_status === 'active' ? 'member' : 'not a member', p.practice_city].filter(Boolean).join(' · ')

/* Keep the record with a login, then a member, then the first of the pair. */
const rank = (p: Contact) => (p.auth_user_id ? 2 : 0) + (p.membership_status === 'active' ? 1 : 0)

export function DuplicatesDialog({ rows, me, onClose, onChanged, onView }: { rows: Contact[]; me: string | null; onClose: () => void; onChanged: () => Promise<void>; onView: (id: string) => void }) {
  const toast = useToast()
  const [marked, setMarked] = useState<Map<string, NotDuplicate>>(new Map())
  const [all, setAll] = useState(false)
  useEffect(() => { void loadNotDuplicates().then((r) => setMarked(new Map(r.map((m) => [`${m.person_a}|${m.person_b}`, m])))) }, [])
  const [keepB, setKeepB] = useState<Record<string, boolean>>({})
  const [busy, setBusy] = useState<string | null>(null)
  const [seconds, setSeconds] = useState<Record<string, KeepSecond>>({})
  const found = useMemo(() => findPairs(rows), [rows])
  const hidden = found.filter((p) => marked.has(pairKey(p))).length
  const pairs = all ? found : found.filter((p) => !marked.has(pairKey(p)))
  async function skip(p: Pair) {
    setBusy(pairKey(p)); const r = await markNotDuplicate(p.a.id, p.b.id, me); setBusy(null)
    if (r.error) { toast(/not_duplicates|PGRST205/.test(r.error) ? 'Saving this is not switched on yet.' : 'That did not save. Please try again.'); return }
    setMarked(new Map(marked).set(pairKey(p), { person_a: '', person_b: '', marked_by_name: me, marked_at: new Date().toISOString() }))
  }
  async function unskip(p: Pair) {
    setBusy(pairKey(p)); const r = await unmarkNotDuplicate(p.a.id, p.b.id); setBusy(null)
    if (r.error) { toast('That did not save. Please try again.'); return }
    const next = new Map(marked); next.delete(pairKey(p)); setMarked(next)
  }
  const choseB = (p: Pair) => keepB[pairKey(p)] ?? rank(p.b) > rank(p.a)
  async function merge(p: Pair) {
    const [keep, drop] = choseB(p) ? [p.b, p.a] : [p.a, p.b]
    const second = seconds[pairKey(p)] ?? KEEP_BOTH
    if (!(await confirmMerge(keep, drop, second))) return
    setBusy(pairKey(p)); const r = await mergePeople(keep.id, drop.id, second)
    if (r.ok) { toast('Merged.'); await onChanged() } else toast(opError(r))
    setBusy(null)
  }
  const side = (p: Pair, x: Contact, isB: boolean) => <div className="dup-col"><label className={`dup-side${choseB(p) === isB ? ' on' : ''}`}>
    <input type="radio" name={`keep-${pairKey(p)}`} checked={choseB(p) === isB} onChange={() => setKeepB({ ...keepB, [pairKey(p)]: isB })} />
    <span><b>{name(x)}</b>{x.auth_user_id && <em>has a login</em>}<span>{detail(x)}</span></span>
  </label><button type="button" className="t-link dup-view" onClick={() => onView(x.id)}>View full record</button></div>

  return <Modal wide onClose={onClose}>
    <div className="mh"><div><h3>Possible duplicates</h3><p>{pairs.length ? `${pairs.length} pairs of records with close names that may be one person entered twice, most likely first.` : 'No likely duplicates left.'} Tap the record to keep. A second email or office on the other record is kept unless you untick it. Then merge, or mark the pair as two different people.</p></div><button type="button" className="x" aria-label="Close" onClick={onClose}>×</button></div>
    <div className="mb">
      <div className="merge-hits">{pairs.map((p) => <div key={pairKey(p)} className="dup-pair">
        {side(p, p.a, false)}
        {side(p, p.b, true)}
        <div className="dup-keep"><KeepSecondChoices keep={choseB(p) ? p.b : p.a} drop={choseB(p) ? p.a : p.b} value={seconds[pairKey(p)] ?? KEEP_BOTH} onChange={(v) => setSeconds({ ...seconds, [pairKey(p)]: v })} /></div>
        <div className="dup-why">{p.why.join(' · ')}</div>
        {marked.has(pairKey(p)) ? <div className="dup-act"><span className="dup-marked">Marked not the same person{marked.get(pairKey(p))?.marked_by_name ? ` by ${marked.get(pairKey(p))?.marked_by_name}` : ''}, {fmtD(marked.get(pairKey(p))?.marked_at?.slice(0, 10) ?? null)}</span><button type="button" className="b s-btn on-light xs" disabled={!!busy} onClick={() => void unskip(p)}>Put back on the list</button></div>
        : <div className="dup-act"><button type="button" className="b s-btn on-light xs" disabled={!!busy} onClick={() => void skip(p)}>Not the same person</button><button type="button" className="b dgr xs" disabled={!!busy} onClick={() => void merge(p)}>{busy === pairKey(p) ? 'Working…' : 'Same person: merge'}</button></div>}
      </div>)}</div>
    </div>
    <div className="mf">{all ? <button type="button" className="b s-btn on-light sm" onClick={() => setAll(false)}>Hide pairs marked not the same</button>
      : <button type="button" className="b s-btn on-light sm" onClick={() => setAll(true)}>Search all potential duplicates{hidden ? ` (${hidden} marked not the same)` : ''}</button>}
      <button type="button" className="b s-btn on-light sm" onClick={onClose}>Done</button></div>
  </Modal>
}
