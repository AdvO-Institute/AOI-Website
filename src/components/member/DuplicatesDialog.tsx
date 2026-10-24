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
import { useNarrow } from '@/lib/density'
import { select } from '@/lib/supabase'
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
const plain = (p: Contact) => `${p.first_name ?? ''} ${p.last_name ?? ''}`.trim()
const shortName = (p: Pair) => (plain(p.a) === plain(p.b) ? plain(p.a) : `${plain(p.a)} / ${plain(p.b)}`)

/* Keep the record with a login, then a member, then the first of the pair. */
const rank = (p: Contact) => (p.auth_user_id ? 2 : 0) + (p.membership_status === 'active' ? 1 : 0)

/* The rows of the side-by-side comparison. A row where both records have a
 * value and they differ is highlighted; one that matches is greyed, so the eye
 * goes to what needs deciding. */
type Line = { k: string; v: (p: Contact) => React.ReactNode; cmp: (p: Contact) => string }
const office = (p: Contact) => [p.practice_name, p.practice_address, [p.practice_city, p.practice_state].filter(Boolean).join(', ')].filter((x): x is string => !!x)
const lines = (lastIn: (p: Contact) => string, roles: (p: Contact) => string, regs: Record<string, number> | null): Line[] => [
  { k: 'Email', v: (p) => [p.email, ...(p.other_emails ?? [])].filter(Boolean).join(', ') || null, cmp: (p) => (p.email ?? '').trim().toLowerCase() },
  { k: 'Phones', v: (p) => [p.mobile_phone && `${p.mobile_phone} (mobile)`, p.personal_phone && `${p.personal_phone} (personal)`].filter(Boolean).join(', ') || null, cmp: (p) => [p.mobile_phone, p.personal_phone].map((x) => (x ?? '').replace(/\D/g, '')).join('|') },
  { k: 'Office', v: (p) => { const o = office(p); const more = p.practice_locations?.length ?? 0; return o.length ? <>{o.map((x, i) => <div key={i}>{x}</div>)}{more > 0 && <div className="muted">+ {more} more office{more === 1 ? '' : 's'}</div>}</> : null }, cmp: (p) => office(p).join('|').toLowerCase() },
  { k: 'Login', v: (p) => (p.auth_user_id ? `Yes · last in ${lastIn(p)}` : null), cmp: (p) => (p.auth_user_id ? 'y' : '') },
  { k: 'Membership', v: (p) => (p.membership_status === 'active' ? `Member${p.member_since ? ` since ${p.member_since.slice(0, 4)}` : ''}` : null), cmp: (p) => (p.membership_status === 'active' ? 'member' : '') },
  { k: 'Roles', v: (p) => roles(p) || null, cmp: (p) => roles(p) },
  { k: 'Seminars', v: (p) => (regs ? (regs[p.id] ? `${regs[p.id]} registration${regs[p.id] === 1 ? '' : 's'}` : null) : '…'), cmp: (p) => String(regs?.[p.id] ?? 0) },
]

export function DuplicatesDialog({ rows, me, lastIn, roles, onClose, onChanged, onView }: { rows: Contact[]; me: string | null; lastIn: (p: Contact) => string; roles: (p: Contact) => string; onClose: () => void; onChanged: () => Promise<void>; onView: (id: string) => void }) {
  const toast = useToast()
  const narrow = useNarrow()
  const [marked, setMarked] = useState<Map<string, NotDuplicate>>(new Map())
  const [all, setAll] = useState(false)
  useEffect(() => { void loadNotDuplicates().then((r) => setMarked(new Map(r.map((m) => [`${m.person_a}|${m.person_b}`, m])))) }, [])
  const [keepB, setKeepB] = useState<Record<string, boolean>>({})
  const [busy, setBusy] = useState<string | null>(null)
  const [seconds, setSeconds] = useState<Record<string, KeepSecond>>({})
  const found = useMemo(() => findPairs(rows), [rows])
  const hidden = found.filter((p) => marked.has(pairKey(p))).length
  const pairs = all ? found : found.filter((p) => !marked.has(pairKey(p)))
  // The pair being looked at: on a computer the first is open; on a phone none until tapped.
  const [sel, setSel] = useState<string | null>(null)
  const cur = pairs.find((p) => pairKey(p) === sel) ?? (narrow || sel === '' ? null : pairs[0] ?? null)
  // After a decision the next pair opens, so the list can be worked straight through.
  const next = (p: Pair) => { const i = pairs.indexOf(p); const n = pairs[i + 1] ?? pairs[i - 1]; setSel(n ? pairKey(n) : null) }

  // How many seminar registrations each side has, read when a pair is opened.
  const [regs, setRegs] = useState<Record<string, number> | null>(null)
  const ids = cur ? `${cur.a.id},${cur.b.id}` : ''
  useEffect(() => {
    if (!ids) return
    let off = false
    setRegs(null)
    void select<{ person_id: string }>('event_registrations', `select=person_id&person_id=in.(${ids})`).then((r) => {
      if (off) return
      const n: Record<string, number> = {}
      for (const x of r.data ?? []) n[x.person_id] = (n[x.person_id] ?? 0) + 1
      setRegs(n)
    })
    return () => { off = true }
  }, [ids])

  async function skip(p: Pair) {
    setBusy(pairKey(p)); const r = await markNotDuplicate(p.a.id, p.b.id, me); setBusy(null)
    if (r.error) { toast(/not_duplicates|PGRST205/.test(r.error) ? 'Saving this is not switched on yet.' : 'That did not save. Please try again.'); return }
    if (!all) next(p)
    setMarked(new Map(marked).set(pairKey(p), { person_a: '', person_b: '', marked_by_name: me, marked_at: new Date().toISOString() }))
    toast('Marked as two different people.')
  }
  async function unskip(p: Pair) {
    setBusy(pairKey(p)); const r = await unmarkNotDuplicate(p.a.id, p.b.id); setBusy(null)
    if (r.error) { toast('That did not save. Please try again.'); return }
    const m = new Map(marked); m.delete(pairKey(p)); setMarked(m)
  }
  const choseB = (p: Pair) => keepB[pairKey(p)] ?? rank(p.b) > rank(p.a)
  async function merge(p: Pair) {
    const [keep, drop] = choseB(p) ? [p.b, p.a] : [p.a, p.b]
    const second = seconds[pairKey(p)] ?? KEEP_BOTH
    if (!(await confirmMerge(keep, drop, second))) return
    setBusy(pairKey(p)); const r = await mergePeople(keep.id, drop.id, second)
    if (r.ok) { next(p); toast('Merged.'); await onChanged() } else toast(opError(r))
    setBusy(null)
  }

  /* One pair, side by side: which to keep, what differs, what else to keep, and the two answers. */
  const compare = (p: Pair) => {
    const m = marked.get(pairKey(p))
    const keepCard = (x: Contact, isB: boolean) => <label className={`dup-keepcard${choseB(p) === isB ? ' on' : ''}`}>
      <input type="radio" name={`keep-${pairKey(p)}`} checked={choseB(p) === isB} onChange={() => setKeepB({ ...keepB, [pairKey(p)]: isB })} />
      <span><small>{choseB(p) === isB ? 'Keep this record' : 'Tap to keep this one instead'}</small><b>{name(x)}</b></span>
    </label>
    return <div className="dup-cmp">
      <div className="dup-q">Is this the same person? <span>{p.why.join(' · ')}</span></div>
      <div className="dup-cards">{keepCard(p.a, false)}{keepCard(p.b, true)}</div>
      <table className="dup-table"><tbody>
        {lines(lastIn, roles, regs).map((l) => {
          const [x, y] = [l.v(p.a), l.v(p.b)]
          const [ca, cb] = [l.cmp(p.a), l.cmp(p.b)]
          return <tr key={l.k} className={ca === cb ? 'same' : ca && cb ? 'diff' : ''}><th scope="row">{l.k}</th><td>{x ?? <i>none</i>}</td><td>{y ?? <i>none</i>}</td></tr>
        })}
        <tr className="links"><th scope="row" /><td><button type="button" className="dup-link" onClick={() => onView(p.a.id)}>View full record</button></td><td><button type="button" className="dup-link" onClick={() => onView(p.b.id)}>View full record</button></td></tr>
      </tbody></table>
      {!m && <KeepSecondChoices keep={choseB(p) ? p.b : p.a} drop={choseB(p) ? p.a : p.b} value={seconds[pairKey(p)] ?? KEEP_BOTH} onChange={(v) => setSeconds({ ...seconds, [pairKey(p)]: v })} />}
      {m ? <div className="dup-answer"><span className="dup-marked">Marked two different people{m.marked_by_name ? ` by ${m.marked_by_name}` : ''}, {fmtD(m.marked_at.slice(0, 10))}</span><button type="button" className="b s-btn on-light sm" disabled={!!busy} onClick={() => void unskip(p)}>Put back on the list</button></div>
        : <div className="dup-answer"><button type="button" className="b s-btn on-light sm" disabled={!!busy} onClick={() => void skip(p)}>No, two different people</button><button type="button" className="b p-btn sm" disabled={!!busy} onClick={() => void merge(p)}>{busy === pairKey(p) ? 'Working…' : 'Yes, merge them'}</button></div>}
    </div>
  }

  const showAll = all ? <button type="button" className="dup-link" onClick={() => setAll(false)}>Hide pairs marked two different people</button>
    : <button type="button" className="dup-link" onClick={() => setAll(true)}>Search all potential duplicates{hidden ? ` (${hidden} marked two different people)` : ''}</button>
  const item = (p: Pair) => <button type="button" className={`dup-item${cur === p ? ' sel' : ''}${marked.has(pairKey(p)) ? ' marked' : ''}`} aria-expanded={narrow ? cur === p : undefined} onClick={() => setSel(narrow && cur === p ? '' : pairKey(p))}>
    <b>{shortName(p)}</b><span>{marked.has(pairKey(p)) ? 'marked two different people' : p.why.join(' · ')}</span>
  </button>

  return <Modal wide onClose={onClose} cls="dup-modal">
    <div className="mh"><div><h3>Possible duplicates</h3><p>{pairs.length ? `${pairs.length} pair${pairs.length === 1 ? '' : 's'} with close names, most likely first.` : 'No likely duplicates left.'}</p></div><button type="button" className="x" aria-label="Close" onClick={onClose}>×</button></div>
    {narrow
      ? <div className="mb dup-acc">{pairs.map((p) => <div key={pairKey(p)} className={cur === p ? 'open' : ''}>{item(p)}{cur === p && compare(p)}</div>)}<div className="dup-more">{showAll}</div></div>
      : <div className="dup-split"><div className="dup-list">{pairs.map((p) => <div key={pairKey(p)}>{item(p)}</div>)}<div className="dup-more">{showAll}</div></div><div className="dup-right">{cur ? compare(cur) : <p className="muted">Pick a pair on the left.</p>}</div></div>}
  </Modal>
}
