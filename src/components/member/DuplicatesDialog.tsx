/* ----------------------------------------------------------------------------
 * Find duplicates: every pair of records in the Directory that may be one
 * person entered twice, best first, each saying why. Opened from the Directory
 * by Board or full admin. Tap the record to keep, then Merge and confirm once.
 * Worked out from the rows the Directory has loaded,
 * so it needs nothing new on the database side.
 * -------------------------------------------------------------------------- */
import { useMemo, useState } from 'react'
import type { Contact } from '@/lib/queries/contacts'
import { Modal } from './opsUi'
import { confirmMerge, opError } from './MergePeople'
import { mergePeople } from '@/lib/queries/contacts'
import { useToast } from '@/components/ui/Toast'

type Pair = { a: Contact; b: Contact; why: string[]; score: number }

const digits = (s: string | null | undefined) => (s ?? '').replace(/\D/g, '').slice(-10)
const norm = (s: string | null | undefined) => (s ?? '').toLowerCase().replace(/[^a-z]/g, '')
function edits(a: string, b: string): number {
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i)
  for (let i = 1; i <= a.length; i++) {
    const cur = [i]
    for (let j = 1; j <= b.length; j++) cur[j] = Math.min((prev[j] ?? 0) + 1, (cur[j - 1] ?? 0) + 1, (prev[j - 1] ?? 0) + (a[i - 1] === b[j - 1] ? 0 : 1))
    prev = cur
  }
  return prev[b.length] ?? 0
}

/* Same email, or a shared personal or mobile phone, or a close name, is enough
 * to list a pair. An office phone only adds weight to one of those: doctors in
 * one practice share it. */
function findPairs(rows: Contact[]): Pair[] {
  const own = (p: Contact) => [p.personal_phone, p.mobile_phone].map(digits).filter((d) => d.length >= 7)
  const any = (p: Contact) => [p.personal_phone, p.mobile_phone, p.office_phone, p.practice_phone].map(digits).filter((d) => d.length >= 7)
  const live = rows.filter((p) => !p.deceased_on).map((p) => ({ p, email: (p.email ?? '').trim().toLowerCase(), first: norm(p.first_name), last: norm(p.last_name), own: own(p), any: any(p) }))
  const out: Pair[] = []
  live.forEach((x, i) => live.slice(i + 1).forEach((y) => {
    const why: string[] = []
    let score = 0
    if (x.email && x.email === y.email) { why.push('same email'); score += 3 }
    if (x.own.some((d) => y.any.includes(d)) || y.own.some((d) => x.any.includes(d))) { why.push('same phone'); score += 2 }
    const xn = x.first + x.last, yn = y.first + y.last
    if (xn.length >= 4 && xn === yn) { why.push('same name'); score += 2 }
    else if (x.last && y.last && edits(x.last, y.last) <= 1 && (edits(x.first, y.first) <= 2 || (Math.min(x.first.length, y.first.length) >= 3 && (x.first.startsWith(y.first) || y.first.startsWith(x.first))))) { why.push('similar name'); score += 1 }
    if (!why.length) return
    if (!why.includes('same phone') && x.any.some((d) => y.any.includes(d))) { why.push('same office phone'); score += 1 }
    out.push({ a: x.p, b: y.p, why, score })
  }))
  return out.sort((m, n) => n.score - m.score || (m.a.last_name ?? '').localeCompare(n.a.last_name ?? ''))
}

/* "Not the same person" is remembered on this device. */
const KEY = 'aoi.directory.notDuplicates'
const pairKey = (p: Pair) => [p.a.id, p.b.id].sort().join('|')
function readSkipped(): Set<string> {
  try { return new Set(JSON.parse(localStorage.getItem(KEY) ?? '[]') as string[]) } catch { return new Set() }
}

const name = (p: Contact) => `${p.first_name ?? ''} ${p.last_name ?? ''}`.trim() + (p.credentials ? `, ${p.credentials}` : '')
const detail = (p: Contact) => [p.email ?? 'no email', p.membership_status === 'active' ? 'member' : 'not a member', p.practice_city].filter(Boolean).join(' · ')

/* Keep the record with a login, then a member, then the first of the pair. */
const rank = (p: Contact) => (p.auth_user_id ? 2 : 0) + (p.membership_status === 'active' ? 1 : 0)

export function DuplicatesDialog({ rows, onClose, onChanged }: { rows: Contact[]; onClose: () => void; onChanged: () => Promise<void> }) {
  const toast = useToast()
  const [skipped, setSkipped] = useState(readSkipped)
  const [keepB, setKeepB] = useState<Record<string, boolean>>({})
  const [busy, setBusy] = useState<string | null>(null)
  const pairs = useMemo(() => findPairs(rows).filter((p) => !skipped.has(pairKey(p))), [rows, skipped])
  function skip(p: Pair) {
    const next = new Set(skipped).add(pairKey(p))
    setSkipped(next)
    try { localStorage.setItem(KEY, JSON.stringify([...next])) } catch { /* private window: forgotten on close */ }
  }
  const choseB = (p: Pair) => keepB[pairKey(p)] ?? rank(p.b) > rank(p.a)
  async function merge(p: Pair) {
    const [keep, drop] = choseB(p) ? [p.b, p.a] : [p.a, p.b]
    if (!(await confirmMerge(keep, drop))) return
    setBusy(pairKey(p)); const r = await mergePeople(keep.id, drop.id)
    if (r.ok) { toast('Merged.'); await onChanged() } else toast(opError(r))
    setBusy(null)
  }
  const side = (p: Pair, x: Contact, isB: boolean) => <label className={`dup-side${choseB(p) === isB ? ' on' : ''}`}>
    <input type="radio" name={`keep-${pairKey(p)}`} checked={choseB(p) === isB} onChange={() => setKeepB({ ...keepB, [pairKey(p)]: isB })} />
    <span><b>{name(x)}</b>{x.auth_user_id && <em>has a login</em>}<span>{detail(x)}</span></span>
  </label>

  return <Modal wide onClose={onClose}>
    <div className="mh"><div><h3>Possible duplicates</h3><p>{pairs.length ? `${pairs.length} pairs of records that may be one person entered twice, most likely first.` : 'No likely duplicates left.'} Tap the record to keep, then Merge. Or mark a pair as two different people.</p></div><button type="button" className="x" aria-label="Close" onClick={onClose}>×</button></div>
    <div className="mb">
      <div className="merge-hits">{pairs.map((p) => <div key={pairKey(p)} className="dup-pair">
        {side(p, p.a, false)}
        {side(p, p.b, true)}
        <div className="dup-why">{p.why.join(' · ')}</div>
        <div className="dup-act"><button type="button" className="b s-btn on-light xs" disabled={!!busy} onClick={() => skip(p)}>Not the same person</button><button type="button" className="b dgr xs" disabled={!!busy} onClick={() => void merge(p)}>{busy === pairKey(p) ? 'Merging…' : 'Merge'}</button></div>
      </div>)}</div>
    </div>
    <div className="mf"><button type="button" className="b s-btn on-light sm" onClick={onClose}>Done</button></div>
  </Modal>
}
