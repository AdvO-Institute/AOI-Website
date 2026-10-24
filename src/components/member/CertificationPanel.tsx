/* ----------------------------------------------------------------------------
 * Certifications — the tab the Certification Committee runs.
 *
 * Five tiles filter the register (All · Interest · Student · Level 1 ·
 * Level 2), a search narrows the current tile, and each person is a card:
 * their level, how they got it, and — if they are working toward the next
 * level — the real requirement checklist from cert_requirements, ticked with
 * a date and the approver's name. Certify unlocks only when every criterion is
 * complete and dated. Override is the manual path for corrections.
 *
 * Ordering: All is alphabetical by first name. Every other tile lists people
 * with a certification in progress first, then everyone else, both
 * alphabetical — the chair's active work is always at the top.
 * -------------------------------------------------------------------------- */
import { friendlyError } from '@/lib/friendlyError'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useAccess } from '@/lib/queries/AccessProvider'
import { useDensity } from '@/lib/density'
import { useToast } from '@/components/ui/Toast'
import { displayName } from '@/lib/access'
import {
  requirements, register, searchPeople, setTarget, markRequirement, certify, overrideCertification, addNote,
  advo, topLevel, topCert, otherCerts, bucket, isMember, fullName, progressFor,
  LEVELS, LEVEL_LABEL, RANK, NEXT,
} from '@/lib/queries/certifications'
import type { Person, Requirement, Level } from '@/lib/queries/certifications'
import { askConfirm, notice } from './opsUi'

type Tab = 'all' | 'interest' | 'student' | 'level_1' | 'level_2'
const TABS: [Tab, string][] = [['all', 'All'], ['interest', 'Interest'], ['student', 'Student'], ['level_1', 'Level 1'], ['level_2', 'Level 2']]

const fmt = (d?: string | null) => (d ? new Date(d.slice(0, 10) + 'T12:00').toLocaleDateString('en-US') : '')
const today = () => new Date().toISOString().slice(0, 10)
const byFirst = (a: Person, b: Person) =>
  a.first_name.localeCompare(b.first_name, undefined, { sensitivity: 'base' }) ||
  a.last_name.localeCompare(b.last_name, undefined, { sensitivity: 'base' })

const editIcon = <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" /></svg>
/** A label and its field. Module-level so an input keeps focus while typing. */
function Row({ k, children }: { k: string; children: React.ReactNode }) { return <><span>{k}</span><div>{children}</div></> }
function Pill({ children, kind = '' }: { children: React.ReactNode; kind?: string }) {
  return <span className={`cpill ${kind}`}>{children}</span>
}

export default function CertificationPanel() {
  const toast = useToast()
  const { access, can } = useAccess()
  const me = displayName(access)
  // approved_by / by_id reference people(id) — the signed-in person's record.
  const meId = access.person?.id ?? null
  const canManage = can('manage_certifications')

  const [reqs, setReqs] = useState<Requirement[]>([])
  const [people, setPeople] = useState<Person[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [tab, setTab] = useState<Tab>('all')
  const [q, setQ] = useState('')
  const [busy, setBusy] = useState<string | null>(null)
  const [manageFor, setManageFor] = useState<Person | null | 'new'>(null)
  const [contactFor, setContactFor] = useState<Person | null>(null)
  /* Compact (one row per person; a click opens their card in place) or comfortable (the cards). */
  const { compact, narrow, setDensity } = useDensity('aoi.certs.density', canManage ? 'compact' : 'comfortable')

  const load = useCallback(async () => {
    setError(null)
    const [r, p] = await Promise.all([requirements(), register()])
    // A failed read must never look like an empty register.
    const problem = p.error ?? r.error
    if (problem) setError(`The register could not be read. ${friendlyError(problem)}`)
    setReqs(r.rows)
    setPeople(p.rows)
    setLoading(false)
  }, [])
  useEffect(() => { void load() }, [load])

  const counts = useMemo(() => {
    const c: Record<Tab, number> = { all: 0, interest: 0, student: 0, level_1: 0, level_2: 0 }
    for (const p of people) { const b = bucket(p); if (!b) continue; c.all++; c[b as Tab]++ }
    return c
  }, [people])

  const rows = useMemo(() => {
    const term = q.trim().toLowerCase()
    const hit = (p: Person) => !term || [
      fullName(p), `${p.first_name} ${p.last_name}`, `${p.last_name}, ${p.first_name}`, p.practice_name, p.practice_city, p.practice_state, p.email,
      ...(p.person_certifications ?? []).map((c) => c.certificate_number),
    ].filter(Boolean).some((v) => String(v).toLowerCase().includes(term))
    return people
      .filter((p) => { const b = bucket(p); return b !== null && (tab === 'all' || b === tab) && hit(p) })
      .sort((a, b) => tab === 'all' ? byFirst(a, b) : ((b.target_cert_level ? 1 : 0) - (a.target_cert_level ? 1 : 0)) || byFirst(a, b))
  }, [people, tab, q])

  /* ------------------------------------------------------------- actions */
  async function run(key: string, fn: () => Promise<{ error?: string } | { ok: true } | void>, done?: string) {
    setBusy(key)
    const r = await fn()
    if (r && 'error' in r && r.error) toast(friendlyError(r.error))
    else if (done) toast(done)
    await load()
    setBusy(null)
  }
  const initiate = (p: Person, level: Level) => run(p.id, () => setTarget(p.id, level), `${p.first_name} ${p.last_name} is now working toward ${LEVEL_LABEL[level]}.`)
  const withdraw = async (p: Person) => { if (await askConfirm(`Stop ${p.first_name}'s progression toward ${LEVEL_LABEL[p.target_cert_level!]}?`, { body: 'Ticked criteria stay on record.', ok: 'Stop progression', danger: true })) { setManageFor(null); void run(p.id, () => setTarget(p.id, null)) } }
  const tick = (p: Person, r: Requirement, on: boolean) => run(`${p.id}:${r.id}`, () => markRequirement(p.id, r.id, on, on ? today() : null, me, meId))
  const date = (p: Person, r: Requirement, d: string) => run(`${p.id}:${r.id}`, () => markRequirement(p.id, r.id, true, d || null, me, meId))
  const award = async (p: Person) => {
    const lvl = p.target_cert_level as Level
    if (!(await askConfirm(`Award ${LEVEL_LABEL[lvl]} to ${fullName(p)}?`, { body: `This writes the certification (dated today, certified by ${me}), sets their level, and clears the progression.`, ok: 'Award' }))) return
    setManageFor(null)
    void run(p.id, async () => { const r = await certify(p, lvl, me); if ('number' in r) toast(`${p.first_name} ${p.last_name} is now ${LEVEL_LABEL[lvl]} — certificate #${r.number}.`); return r })
  }

  function exportCsv() {
    const cols = ['Last', 'First', 'Credentials', 'Level', 'Awarded', 'Grandfathered', 'Certificate', 'Working toward', 'Interested', 'Practice', 'City', 'State', 'Membership', 'Email']
    const lines = [cols.join(','), ...rows.map((p) => { const c = topCert(p); return [
      p.last_name, p.first_name, p.credentials, LEVEL_LABEL[topLevel(p)], c?.cert_date ?? '', c?.grandfathered ? 'yes' : '', c?.certificate_number ?? '',
      p.target_cert_level ? LEVEL_LABEL[p.target_cert_level] : '', p.cert_interest ? 'yes' : '', p.practice_name, p.practice_city, p.practice_state, p.membership_status, p.email,
    ].map((v) => `"${String(v ?? '').replace(/"/g, '""')}"`).join(',') })]
    const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8' })
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `certifications-${tab}-${today()}.csv`; a.click(); URL.revokeObjectURL(a.href)
  }

  /* -------------------------------------------------------------- render */
  if (loading) return <><h1>Certifications</h1><div className="ma-sub">Reading the register…</div><div className="ma-panel"><p className="ma-empty">One moment.</p></div></>

  const tabLabel = TABS.find(([k]) => k === tab)![1]
  /** Start the next level: Student or Level 1 from nothing, then the level above. Hidden while one is in progress. */
  const initBtn = (p: Person) => {
    const l = topLevel(p)
    const next = l === 'none' ? (p.contact_type === 'student' ? 'student' : 'level_1') : NEXT[l]
    if (!canManage || p.target_cert_level || !next) return null
    const label = l === 'none' ? (p.contact_type === 'student' ? 'Student' : 'Level 1') : LEVEL_LABEL[next]
    return <button type="button" className="b s-btn on-light xs" disabled={busy === p.id} onClick={() => void initiate(p, next)}>Initiate {label} Certification</button>
  }
  /** The requirement checklist and Certify, for someone working toward a level. */
  const checklist = (p: Person) => {
    const prog = progressFor(p, reqs)
    if (!prog) return null
    const done = prog.list.filter((r) => prog.done.has(r.id)), dated = done.filter((r) => prog.done.get(r.id)!.completed_date)
    const ready = dated.length === prog.list.length && prog.list.length > 0, pct = prog.list.length ? Math.round(done.length / prog.list.length * 100) : 0
    return <>
      <div className="cert-prog"><i style={{ width: `${pct}%` }} /></div>
      <div className="cert-progtxt">{done.length}/{prog.list.length} requirements complete · {pct}%{done.length > dated.length ? ` · ${done.length - dated.length} need a date` : ''}</div>
      {prog.list.map((r) => { const d = prog.done.get(r.id); const id = `rq_${p.id}_${r.id}`; return (
        <div className={`cert-req${d ? ' done' : ''}`} key={r.id}>
          <input type="checkbox" id={id} checked={!!d} disabled={!canManage || busy === `${p.id}:${r.id}`} onChange={(e) => void tick(p, r, e.target.checked)} />
          <label htmlFor={id}>{r.label}</label>
          {d && <span className="when">Completed <input type="date" className={d.completed_date ? '' : 'need'} value={d.completed_date ?? ''} disabled={!canManage} onChange={(e) => void date(p, r, e.target.value)} aria-label="Completion date" />{d.completed_date && d.approved_by_name ? ` · ${d.approved_by_name}` : ''}</span>}
        </div>) })}
      {canManage && <div className="cert-certify">
        <button type="button" className="b p-btn" disabled={!ready || busy === p.id} onClick={() => award(p)}>✓ Certify — {LEVEL_LABEL[p.target_cert_level!]}</button>
        <span className="hint">{ready ? 'Every criterion is complete and dated.' : 'Complete & date every criterion to certify.'}</span>
        <button type="button" className="t-link" style={{ marginLeft: 'auto', color: 'var(--color-content-muted)' }} onClick={() => withdraw(p)}>Stop progression</button>
      </div>}
    </>
  }
  const card = (p: Person) => {
    const l = topLevel(p), c = topCert(p)
    const meta = c ? [c.grandfathered ? `Grandfathered on ${fmt(c.cert_date)}` : c.cert_date ? `Certified ${fmt(c.cert_date)}${c.certified_by ? ' · ' + c.certified_by : ''}` : '', c.certificate_number ? `Certificate #${c.certificate_number}` : ''].filter(Boolean).join(' · ') : ''
    const list = checklist(p)
    return (
      <div className="cert-card" key={p.id}>
        <div className="cert-ph">
          <div className="cert-nm">
            <a href="#" onClick={(e) => { e.preventDefault(); setContactFor(p) }}>{fullName(p)}</a>
            {l !== 'none' && <Pill kind={l === 'level_2' ? 'ok' : 'info'}>{LEVEL_LABEL[l]}</Pill>}
            {otherCerts(p).map((o) => <Pill key={o.technique} kind="ok">{o.technique === 'Atlas Orthogonal' ? 'AO' : o.technique} · {o.level === 'board_certification' ? 'Board Certified' : 'Certified'}</Pill>)}
          </div>
          <div className="cert-side">
            <div className="cert-actions">
              {p.target_cert_level && <Pill kind="warn">Working toward {LEVEL_LABEL[p.target_cert_level]}</Pill>}
              {canManage && <button type="button" className="b s-btn on-light xs" onClick={() => setManageFor(p)}>✎ Edit</button>}
            </div>
            {initBtn(p)}
          </div>
        </div>
        {meta && <div className="cert-meta">{meta}</div>}
        {list ?? <div className="cert-st">{l === 'none' ? (p.cert_interest ? 'Interested / in conversation — not yet pursuing a level.' : 'No certification on file.') : 'Fully certified — no active progression.'}</div>}
      </div>
    )
  }
  return (
    <>
      <div className="cert-head">
        <div><h1>Certifications</h1><div className="ma-sub" style={{ marginBottom: 0 }}>Record each completed step with its date, award certification levels, and track who is working toward which level.</div></div>
        <div className="cert-actions">
          {canManage && <button type="button" className="b p-btn sm" onClick={() => setManageFor('new')}>+ Add</button>}
          <button type="button" className="b s-btn on-light sm" onClick={exportCsv}>↓ Export {tab === 'all' ? 'all' : tabLabel.toLowerCase()}</button>
        </div>
      </div>
      {error && <div className="cert-err" role="alert">{error}</div>}

      <div className="cert-tiles">
        {TABS.map(([k, l]) => (
          <button type="button" key={k} className={`cert-tile${tab === k ? ' on' : ''}`} onClick={() => setTab(k)} aria-pressed={tab === k}>
            <span>{l}</span><b>{counts[k]}</b>
          </button>
        ))}
      </div>

      <div className="cert-search">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></svg>
        <input type="text" value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => e.key === 'Escape' && setQ('')} autoComplete="off"
          placeholder={`Search ${tab === 'all' ? 'everyone' : tabLabel} by name, practice, city or certificate number…`} aria-label="Search this list" />
        {q && <button type="button" className="clr" aria-label="Clear search" onClick={() => setQ('')}>×</button>}
        {q && <div className="cnt">{rows.length} of {counts[tab]} match “{q}”</div>}
      </div>

      {rows.length === 0 && <div className="cert-card" style={{ textAlign: 'center', color: 'var(--color-content-muted)', padding: 30 }}>{q ? `No one in ${tabLabel} matches “${q}”.` : 'No one in this list.'}</div>}
      {rows.length > 0 && <div className="evt-bar"><span className="cnt">{rows.length} {rows.length === 1 ? 'person' : 'people'}{q ? ` matching “${q}”` : ''}</span>
        {!narrow && <div className="evt-segs"><div className="evt-seg"><button type="button" className={compact ? 'on' : ''} onClick={() => setDensity('compact')}>Compact</button><button type="button" className={!compact ? 'on' : ''} onClick={() => setDensity('comfortable')}>Comfortable</button></div></div>}</div>}
      {rows.length > 0 && (compact
        ? <div className="mem-table cert-table"><div className="mem-row head"><span>Name</span><span>Level</span><span>Awarded</span><span>Certificate</span><span>In progress</span><span /></div>
          {rows.map((p) => {
            const l = topLevel(p), c = topCert(p), prog = progressFor(p, reqs)
            const progress = prog ? `Working toward ${LEVEL_LABEL[p.target_cert_level!]} · ${prog.done.size}/${prog.list.length}` : p.cert_interest ? 'Interested' : ''
            const others = otherCerts(p).map((o) => o.technique === 'Atlas Orthogonal' ? 'AO' : o.technique).join(', ')
            const edit = () => canManage ? setManageFor(p) : setContactFor(p)
            return <div key={p.id} style={{ display: 'contents' }}>
              <div className="mem-row" role="button" tabIndex={0} onClick={edit} onKeyDown={(e) => e.key === 'Enter' && edit()}>
                <span className="n">{fullName(p)}</span>
                <span className="w">{l === 'none' ? <i>—</i> : LEVEL_LABEL[l]}{others && <i> · {others}</i>}</span>
                <span className="w ph">{c?.cert_date ? `${c.grandfathered ? 'Grandfathered ' : ''}${fmt(c.cert_date)}` : <i>—</i>}</span>
                <span className="w ph">{c?.certificate_number ? `#${c.certificate_number}` : <i>—</i>}</span>
                <span className="w">{progress || <i>—</i>}</span>
                <span className="ac">{canManage && <button type="button" className="evt-ic" title="Edit certification" aria-label={`Edit ${fullName(p)}`} onClick={(e) => { e.stopPropagation(); setManageFor(p) }}>{editIcon}</button>}</span>
              </div>
            </div>
          })}</div>
        : rows.map(card))}

      {manageFor && <ManageDialog person={manageFor === 'new' ? null : manageFor} extra={manageFor === 'new' ? null : <>{initBtn(people.find((x) => x.id === manageFor.id) ?? manageFor) && <div className="act">{initBtn(people.find((x) => x.id === manageFor.id) ?? manageFor)}</div>}{(() => { const live = people.find((x) => x.id === manageFor.id) ?? manageFor; const list = checklist(live); return list && <><div className="sec">Working toward {LEVEL_LABEL[live.target_cert_level!]}</div>{list}</> })()}</>} me={me} onClose={() => setManageFor(null)} onSaved={async (msg) => { setManageFor(null); await load(); toast(msg) }} />}
      {contactFor && <ContactCard person={people.find((x) => x.id === contactFor.id) ?? contactFor} reqs={reqs} me={me} meId={meId} canNote={canManage} onClose={() => setContactFor(null)} onChanged={load} />}
    </>
  )
}

/* ------------------------------------------------------------ Add / Override */
function ManageDialog({ person, extra, me, onClose, onSaved }: { person: Person | null; extra?: React.ReactNode; me: string; onClose: () => void; onSaved: (msg: string) => void }) {
  const [chosen, setChosen] = useState<Person | null>(person)
  const [term, setTerm] = useState(person ? fullName(person) : '')
  const [hits, setHits] = useState<Person[]>([])
  const c = chosen ? topCert(chosen) : null
  const [level, setLevel] = useState<Level>((c?.level as Level) ?? 'none')
  const [date, setDate] = useState(c?.cert_date ?? '')
  const [num, setNum] = useState(c?.certificate_number ?? '')
  const [target, setTarget_] = useState<Level | ''>((chosen?.target_cert_level as Level) ?? '')
  const [interest, setInterest] = useState(!!chosen?.cert_interest)
  const [err, setErr] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => { const k = (e: KeyboardEvent) => e.key === 'Escape' && onClose(); document.addEventListener('keydown', k); return () => document.removeEventListener('keydown', k) }, [onClose])

  function pick(p: Person) {
    setChosen(p); setTerm(fullName(p)); setHits([])
    const cc = topCert(p); setLevel((cc?.level as Level) ?? 'none'); setDate(cc?.cert_date ?? ''); setNum(cc?.certificate_number ?? '')
    setTarget_((p.target_cert_level as Level) ?? ''); setInterest(!!p.cert_interest)
  }
  function onType(v: string) {
    setTerm(v); setChosen(null)
    if (timer.current) clearTimeout(timer.current)
    if (v.trim().length < 2) { setHits([]); return }
    timer.current = setTimeout(async () => setHits(await searchPeople(v)), 220)
  }
  async function save() {
    setErr(null)
    if (!chosen) { setErr('Choose a member first.'); return }
    if (level !== 'none' && !date) { setErr('An award date is required for an achieved level.'); return }
    if (target && RANK[target]! <= RANK[level]!) { setErr('“Working toward” must be above the achieved level.'); return }
    setSaving(true)
    const r = await overrideCertification(chosen, level, date || null, num || null, me, (target || null) as Level | null, interest)
    setSaving(false)
    if (r.error) { setErr(friendlyError(r.error)); return }
    onSaved(`${chosen.first_name} ${chosen.last_name} saved.`)
  }

  return (
    <div className="cert-veil" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="cert-modal wide cc editing" role="dialog" aria-modal="true" aria-labelledby="cm-title">
        <div className="mh"><div><h3 id="cm-title">{person ? fullName(person) : 'Add certification'}</h3><p>Certification Committee only. Set the achieved level and award date, or the level being pursued.</p></div>
          <div className="cc-ctl"><button type="button" className="x" aria-label="Close" onClick={onClose}>×</button>
            <div className="cc-btns"><button type="button" className="b s-btn on-light xs" onClick={onClose}>Cancel</button><button type="button" className="b p-btn xs" disabled={saving} onClick={() => void save()}>{saving ? 'Saving…' : 'Save'}</button></div>
          </div></div>
        <div className="mb">
          {err && <div className="cert-err">{err}</div>}
          {!person && <>
            <label className="flabel" htmlFor="cm-who">MEMBER</label>
            <div className="cert-who">
              <input className="fi" id="cm-who" value={term} autoComplete="off" placeholder="Type a name to search…" onChange={(e) => onType(e.target.value)} autoFocus />
              {hits.length > 0 && <div className="list">{hits.map((h) => <div key={h.id} onClick={() => pick(h)}>{fullName(h)} <small>· {h.practice_name ?? ''}{h.practice_city ? ` · ${h.practice_city}, ${h.practice_state ?? ''}` : ''}</small></div>)}</div>}
              {term.trim().length >= 2 && hits.length === 0 && !chosen && <div className="list"><div><small>No match in the directory — add them under Members first.</small></div></div>}
            </div>
          </>}
          <div className="sec">Achieved certification</div>
          <div className="kv">
            <Row k="Level"><select className="fi" value={level} onChange={(e) => setLevel(e.target.value as Level)} aria-label="Level">{LEVELS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></Row>
            <Row k="Date awarded"><input className="fi" type="date" value={date} onChange={(e) => setDate(e.target.value)} aria-label="Date awarded" /></Row>
            <Row k="Certificate #"><input className="fi" value={num} placeholder="Optional" onChange={(e) => setNum(e.target.value)} aria-label="Certificate number" /></Row>
          </div>
          <div className="sec">Progression</div>
          <div className="kv">
            <Row k="Working toward"><select className="fi" value={target} onChange={(e) => setTarget_(e.target.value as Level | '')} aria-label="Working toward"><option value="">None (not pursuing)</option>{LEVELS.slice(1).map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></Row>
            <Row k="Interested"><label className="cert-tog" style={{ margin: 0 }}><input type="checkbox" checked={interest} onChange={(e) => setInterest(e.target.checked)} /> In conversation about the next level</label></Row>
          </div>
          {extra}
        </div>
      </div>
    </div>
  )
}

/* ------------------------------------------------------------- Contact card */
function ContactCard({ person: p, reqs, me, meId, canNote, onClose, onChanged }: { person: Person; reqs: Requirement[]; me: string; meId: string | null; canNote: boolean; onClose: () => void; onChanged: () => Promise<void> }) {
  const [note, setNote] = useState('')
  const [saving, setSaving] = useState(false)
  const l = topLevel(p), prog = progressFor(p, reqs)
  const locs = (p.practice_locations ?? []).slice().sort((a, b) => (b.is_primary ? 1 : 0) - (a.is_primary ? 1 : 0))
  const primary = locs[0] ?? { name: p.practice_name, address: p.practice_address ?? [p.practice_city, p.practice_state].filter(Boolean).join(', '), website: p.practice_website, phone: p.practice_phone ?? null, is_primary: true }
  useEffect(() => { const k = (e: KeyboardEvent) => e.key === 'Escape' && onClose(); document.addEventListener('keydown', k); return () => document.removeEventListener('keydown', k) }, [onClose])
  async function add() {
    const t = note.trim(); if (!t) return
    setSaving(true); const r = await addNote(p.id, t, me, meId); setSaving(false)
    if (r.error) return void notice('The note could not be saved', friendlyError(r.error))
    setNote(''); await onChanged()
  }
  const KV = ({ k, v }: { k: string; v: React.ReactNode }) => <><span>{k}</span><div>{v ?? '—'}</div></>
  return (
    <div className="cert-veil" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="cert-modal wide cc" role="dialog" aria-modal="true" aria-labelledby="cc-title">
        <div className="mh"><div><h3 id="cc-title">{fullName(p)}</h3></div><button type="button" className="x" aria-label="Close" onClick={onClose}>×</button></div>
        <div className="mb">
          <div className="cert-chips">
            {isMember(p) ? <Pill kind="ok">Active member</Pill> : p.membership_status === 'expired' ? <Pill kind="bad">Expired member</Pill> : <Pill>{p.contact_type === 'student' ? 'Student — not a member' : 'Lead — not a member'}</Pill>}
            {l !== 'none' && <Pill kind={l === 'level_2' ? 'ok' : 'info'}>{LEVEL_LABEL[l]}</Pill>}
            {otherCerts(p).map((o) => <Pill key={o.technique} kind="ok">{o.technique} · {o.level === 'board_certification' ? 'Board Certified' : 'Certified'}</Pill>)}
          </div>
          <div className="sec">Contact</div>
          <div className="kv"><KV k="Email" v={p.email ? <a href={`mailto:${p.email}`}>{p.email}</a> : null} /><KV k="Office" v={p.office_phone ?? p.practice_phone ?? null} />{p.mobile_phone && <KV k="Mobile" v={p.mobile_phone} />}</div>
          <div className="sec">Office location</div>
          {locs.length === 0 && !p.practice_name ? <p className="muted">No practice on file.</p> : (locs.length ? locs : [primary]).map((loc, i) => (
            <div className="loc" key={i}><b>{loc.name ?? p.practice_name}</b>{loc.is_primary && <Pill kind="info">Primary</Pill>}
              <div className="kv"><KV k="Address" v={loc.address} /><KV k="Website" v={loc.website ? <a href={/^https?:/.test(loc.website) ? loc.website : `https://${loc.website}`} target="_blank" rel="noopener">{loc.website}</a> : null} />{loc.phone && <KV k="Phone" v={loc.phone} />}</div></div>
          ))}
          <div className="sec">Classification</div>
          <div className="kv"><KV k="Type" v={p.contact_type === 'student' ? 'Student' : p.contact_type === 'lead' ? 'Lead' : 'Doctor'} /><KV k="Technique(s)" v={(p.techniques ?? []).join(', ') || null} /></div>
          <div className="sec">Membership</div>
          <div className="kv"><KV k="Status" v={isMember(p) ? 'Active member' : p.membership_status === 'expired' ? 'Expired' : 'Never a member'} /></div>
          <div className="sec">Certifications</div>
          <div className="kv">
            {advo(p).length === 0 && otherCerts(p).length === 0 && <KV k="—" v="None on file" />}
            {advo(p).sort((a, b) => RANK[b.level]! - RANK[a.level]!).map((c) => <KV key={c.id ?? c.level} k="Advanced Orthogonal" v={`${LEVEL_LABEL[c.level]}${c.grandfathered ? ' · Grandfathered on ' + fmt(c.cert_date) : c.cert_date ? ' · Awarded ' + fmt(c.cert_date) : ''}${c.certificate_number ? ' · Certificate #' + c.certificate_number : ''}${c.certified_by && !c.grandfathered ? ' · ' + c.certified_by : ''}`} />)}
            {otherCerts(p).map((o) => <KV key={o.technique} k={o.technique} v={o.level === 'board_certification' ? 'Board Certified' : 'Certified'} />)}
            {prog && <KV k="In progress" v={`Working toward ${LEVEL_LABEL[p.target_cert_level!]} · ${prog.done.size}/${prog.list.length} criteria`} />}
          </div>
          <div className="sec">Notes (running log)</div>
          {(p.contact_notes ?? []).length === 0 && <p className="muted">No notes yet.</p>}
          {(p.contact_notes ?? []).slice().sort((a, b) => b.created_at.localeCompare(a.created_at)).map((n) => <div className="ma-row" key={n.id}><div><b style={{ fontWeight: 500 }}>{n.text}</b><span>{n.by_name ?? '—'} · {fmt(n.created_at)}</span></div></div>)}
          {canNote && <><textarea className="fi" value={note} placeholder="Add a note…" onChange={(e) => setNote(e.target.value)} style={{ marginTop: 8, minHeight: 70 }} /><div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 8 }}><button type="button" className="b s-btn on-light sm" disabled={saving || !note.trim()} onClick={() => void add()}>Add note</button></div></>}
        </div>
      </div>
    </div>
  )
}
