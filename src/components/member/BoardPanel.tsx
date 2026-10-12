/* ----------------------------------------------------------------------------
 * Board of Directors — term cards (soonest expiring first), nominees with
 * the eligibility and process checklist (every tick stamped with who and
 * when), seating with a hard seat limit, past directors, and the director
 * record: service trail, reviews, documents, board-only notes.
 * -------------------------------------------------------------------------- */
import { friendlyError } from '@/lib/friendlyError'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { Chips } from './PersonChips'
import { CERT_LABEL, roleChips } from '@/lib/chips'
import { useAccess } from '@/lib/queries/AccessProvider'
import { useToast } from '@/components/ui/Toast'
import { displayName } from '@/lib/access'
import {
  terms as loadTerms, reviews as loadReviews, documents as loadDocs, boardNotes as loadNotes, searchPeople,
  tick, setProcDate, setNominatedBy, setServiceStart, addNominee, withdraw, seat, endService, addReview, addBoardNote, uploadDocument, documentUrl, deleteDocument,
  SEATS_PER_TERM, ELIGIBILITY, PROCESS, fullName, initials, isCurrentMember, hasLevel1, eligDone, procDone, stepDone, isReady, nextTermLabel, seatedIn, fmtD,
} from '@/lib/queries/board'
import type { Term, Review, Doc, BoardNote, Hit, AuditEntry } from '@/lib/queries/board'
import { askConfirm, askText } from './opsUi'

function Pill({ kind = '', children }: { kind?: string; children: React.ReactNode }) { return <span className={`cpill ${kind}`}>{children}</span> }
const Verified = ({ a }: { a?: AuditEntry }) => (a ? <small>Verified by {a.by === 'system' ? 'the database (membership & certification records)' : a.by} · {fmtD(a.at)}</small> : null)

export default function BoardPanel() {
  const toast = useToast()
  const { access, can } = useAccess()
  const who = { name: displayName(access).replace(/,.*$/, ''), id: access.person?.id ?? null }
  const canManage = can('full_admin') || can('board') || can('manage_board')
  const [rows, setRows] = useState<Term[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [open, setOpen] = useState<Set<number>>(new Set())
  const [dir, setDir] = useState<Term | null>(null)
  const [adding, setAdding] = useState(false)
  const [confirm, setConfirm] = useState<{ kind: 'seat' | 'withdraw'; t: Term } | null>(null)

  const load = useCallback(async () => {
    const r = await loadTerms()
    setError(r.error ? `The board record could not be read. ${friendlyError(r.error)}` : null)
    setRows(r.rows); setLoading(false)
  }, [])
  useEffect(() => { void load() }, [load])

  const nt = nextTermLabel()
  const active = useMemo(() => rows.filter((t) => t.status === 'active' || t.status === 'seated'), [rows])
  const nominees = useMemo(() => rows.filter((t) => t.status === 'nominee').sort((a, b) => (a.people?.first_name ?? a.person_name ?? '').localeCompare(b.people?.first_name ?? b.person_name ?? '')), [rows])
  const past = useMemo(() => rows.filter((t) => t.status === 'past').sort((a, b) => (b.term_end ?? '').localeCompare(a.term_end ?? '')), [rows])
  const cards = useMemo(() => {
    const m = new Map<string, { label: string; start: string | null; end: string | null; rows: Term[]; incoming: boolean }>()
    for (const t of active) { const k = t.term_label ?? '—'; const c = m.get(k) ?? { label: k, start: t.term_start, end: t.term_end, rows: [] as Term[], incoming: t.status === 'seated' }; c.rows.push(t); m.set(k, c) }
    return [...m.values()].sort((a, b) => (a.end ?? '').localeCompare(b.end ?? ''))
  }, [active])
  const seatedCount = seatedIn(rows, nt).length

  /** Flip the box on screen at once; the database write follows and the reload confirms it. */
  function optimistic(id: number, patch: Partial<Term>) { setRows((rs) => rs.map((x) => (x.id === id ? { ...x, ...patch } : x))) }
  async function run(p: Promise<{ ok?: true; error?: string }>, okMsg?: string) {
    const r = await p
    if (r.error) { toast(friendly(r.error)); return false }
    await load(); if (okMsg) toast(okMsg); return true
  }
  function exportCsv() {
    const cols = ['name', 'term_label', 'status', 'term_start', 'term_end', 'service_start', 'nominated_by', 'nominated_date', 'accepted_nomination_date', 'elected_date', 'accepted_role_date', 'end_reason', 'resignation_date']
    const csv = [cols.join(','), ...rows.map((t) => cols.map((c) => `"${String(c === 'name' ? fullName(t.people, t.person_name) : (t as unknown as Record<string, unknown>)[c] ?? '').replace(/"/g, '""')}"`).join(','))].join('\n')
    const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' })); a.download = `board-service-${new Date().toISOString().slice(0, 10)}.csv`; a.click(); URL.revokeObjectURL(a.href)
  }

  if (loading) return <><h1>Board of Directors</h1><div className="ma-sub">Reading the board record…</div><div className="ma-panel"><p className="ma-empty">One moment.</p></div></>

  const nomRow = (t: Term) => {
    const isOpen = open.has(t.id)
    const p = t.people
    const ready = isReady(t), seatOpen = seatedIn(rows, t.term_label ?? nt).length < SEATS_PER_TERM
    const a = t.eligibility_audit ?? {}
    const name = fullName(p, t.person_name)
    return (
      <div key={t.id} className={`bnom${isOpen ? ' open' : ''}`}>
        <div className="row" onClick={() => setOpen((s) => { const n = new Set(s); n.has(t.id) ? n.delete(t.id) : n.add(t.id); return n })}>
          <b onClick={(e) => { e.stopPropagation(); setDir(t) }}>{name}</b>
          {isCurrentMember(p) ? <Pill kind="ok">Member</Pill> : <Pill kind="warn">Not a member</Pill>}
          <Pill kind={ready ? 'ok' : 'info'}>{eligDone(t)}/{ELIGIBILITY.length} eligibility · {procDone(t)}/{PROCESS.length} process</Pill>
          <span className="by">Nominated by {t.nominated_by || '—'}<span className="caret" /></span>
        </div>
        {isOpen && <div className="body">
          <div className="sec">Eligibility (Section 2.2)</div>
          {ELIGIBILITY.map((e) => <div key={e.key} className={`bchk${t[e.key] ? ' done' : ''}`}>
            <input type="checkbox" id={`${t.id}_${e.key}`} checked={!!t[e.key]} disabled={!canManage || e.auto} onChange={(ev) => { optimistic(t.id, { [e.key]: ev.target.checked }); void run(tick(t, e.key, ev.target.checked, who)) }} />
            <label htmlFor={`${t.id}_${e.key}`}>{e.label}<Verified a={a[e.key]} /></label>
            {e.auto ? <span className="auto">{t[e.key] ? 'AUTO ✓' : 'AUTO ✗'}</span> : <span />}
          </div>)}
          <div className="sec">Nomination process</div>
          <div className="bchk one"><label className="flabel" style={{ margin: 0 }}>Nominated by</label><input className="fi" style={{ margin: 0 }} defaultValue={t.nominated_by ?? ''} disabled={!canManage} placeholder="Board of Directors / name" onBlur={(ev) => { if (ev.target.value !== (t.nominated_by ?? '')) void run(setNominatedBy(t, ev.target.value)) }} /></div>
          {PROCESS.map((s) => <div key={s.key} className={`bchk${stepDone(t, s.key) ? ' done' : ''}`}>
            <input type="checkbox" id={`${t.id}_${s.key}`} checked={stepDone(t, s.key)} disabled={!canManage} onChange={(ev) => { optimistic(t.id, { [s.key]: ev.target.checked, [s.date]: ev.target.checked ? (t[s.date] ?? new Date().toISOString().slice(0, 10)) : null }); void run(tick(t, s.key, ev.target.checked, who)) }} />
            <label htmlFor={`${t.id}_${s.key}`}>{s.label}<small>{s.help}</small><Verified a={a[s.key]} /></label>
            <input type="date" value={t[s.date] ?? ''} disabled={!canManage} onChange={(ev) => { optimistic(t.id, { [s.date]: ev.target.value || null }); void run(setProcDate(t, s.date, ev.target.value || null)) }} />
          </div>)}
          {canManage && <div className="acts">
            <button type="button" className="b p-btn sm" disabled={!ready || !seatOpen} onClick={() => setConfirm({ kind: 'seat', t })}>Seat to {t.term_label} term</button>
            <button type="button" className="b s-btn on-light sm" onClick={() => setConfirm({ kind: 'withdraw', t })}>Remove nominee</button>
            <span className="hint">{!ready ? 'Complete every eligibility item and the process through “Accepted the role” to seat this member.' : !seatOpen ? `All ${SEATS_PER_TERM} seats for ${nt} are filled — a seat must open before another nominee can be seated.` : 'Ready to seat. Seating records the term, moves them to the board and grants board access on the site.'}</span>
          </div>}
        </div>}
      </div>
    )
  }

  return (
    <>
      <div className="cert-head">
        <div><h1>Board of Directors</h1><div className="ma-sub" style={{ marginBottom: 0, maxWidth: '80ch' }}>Three-year terms (Oct 1 – Sep 30), staggered, {SEATS_PER_TERM} seats each. Elections certify by Sep 1; the new class is seated at the October Annual Meeting. Every tick below is recorded with who verified it and when.</div></div>
        <div className="cert-actions">{canManage && <button type="button" className="b p-btn sm" onClick={() => setAdding(true)}>+ Add nominee</button>}<button type="button" className="b s-btn on-light sm" onClick={exportCsv}>↓ Export service record</button></div>
      </div>
      {error && <div className="cert-err" role="alert">{error}</div>}
      <div className={`bterms${cards.length > 3 ? ' four' : ''}`}>{cards.map((c, i) => (
        <div key={c.label} className={`bterm${i === 0 && !c.incoming ? ' soon' : ''}${c.incoming ? ' incoming' : ''}`}>
          <div className="th">Term {c.label}{c.incoming ? ' · incoming' : ''}</div>
          <div className="td">{fmtD(c.start)} – {fmtD(c.end)}{i === 0 && !c.incoming ? <> · <span className="warn-txt">expires next</span></> : null}{c.incoming ? ` · takes office ${fmtD(c.start)}` : ''}</div>
          {c.rows.map((t) => <div key={t.id} className="bseat" role="button" tabIndex={0} onClick={() => setDir(t)} onKeyDown={(k) => { if (k.key === 'Enter' || k.key === ' ') { k.preventDefault(); setDir(t) } }}><b>{fullName(t.people, t.person_name)}</b>{t.service_start ? <small>On the board since {t.service_start}</small> : <small className="miss">Service start not recorded{canManage ? ' — add it on the record' : ''}</small>}</div>)}
          {Array.from({ length: Math.max(0, SEATS_PER_TERM - c.rows.length) }).map((_, j) => <div key={j} className="empty">Open seat</div>)}
          <div className="cnt">{c.rows.length} of {SEATS_PER_TERM} seats</div>
        </div>))}
        {cards.length === 0 && <div className="cert-card" style={{ gridColumn: '1 / -1', textAlign: 'center', color: 'var(--color-content-muted)' }}>No active terms on file.</div>}
      </div>

      <div className="bpanel">
        <div className="ph">Nominees — {nt} term <span className="r">{seatedCount} of {SEATS_PER_TERM} seats filled · {nominees.length} nominee{nominees.length === 1 ? '' : 's'}</span></div>
        {nominees.length ? nominees.map(nomRow) : <div className="bnodata">No nominees yet. The call for nominations opens the process; add a nominee from Contacts.</div>}
      </div>
      <div className="bpanel">
        <div className="ph">Past Directors <span className="r">{past.length}</span></div>
        {past.map((t) => <div key={t.id} className="bpast" role="button" tabIndex={0} onClick={() => setDir(t)} onKeyDown={(k) => { if (k.key === 'Enter' || k.key === ' ') { k.preventDefault(); setDir(t) } }}><div className="yrs">{t.term_label}</div><div><b>{fullName(t.people, t.person_name)}</b><small>{t.resignation_date ? `Resigned ${fmtD(t.resignation_date)}` : `Served ${t.term_label}${t.end_reason === 'resigned' ? ' · resigned' : t.end_reason === 'term_ended' ? ' · term ended' : t.end_reason ? ` · ${t.end_reason}` : ''}`}{t.people?.deceased_on ? ` · deceased ${t.people.deceased_on.slice(0, 4)}` : ''}</small></div></div>)}
        {past.length === 0 && <p className="ma-empty">No past terms on file.</p>}
      </div>

      {dir && <DirectorCard t={dir} all={rows} who={who} canManage={canManage} onClose={() => setDir(null)} onChanged={async () => { await load(); const fresh = (await loadTerms()).rows.find((x) => x.id === dir.id); setDir(fresh ?? null) }} />}
      {adding && <AddNominee rows={rows} who={who} label={nt} onClose={() => setAdding(false)} onSaved={async (m) => { setAdding(false); await load(); toast(m) }} />}
      {confirm && (
        <div className="cert-veil" onClick={(e) => e.target === e.currentTarget && setConfirm(null)}>
          <div className="cert-modal" role="dialog" aria-modal="true">
            {confirm.kind === 'seat'
              ? <><div className="mh"><div><h3>Seat {fullName(confirm.t.people, confirm.t.person_name)} to the {confirm.t.term_label} term?</h3><p>Records the term {fmtD(confirm.t.term_start)} – {fmtD(confirm.t.term_end)}, adds the Board Member role (board access on the site) and lists them under the incoming term. Logged as verified by {who.name}.</p></div><button type="button" className="x" aria-label="Close" onClick={() => setConfirm(null)}>×</button></div>
                <div className="mf"><button type="button" className="b s-btn on-light sm" onClick={() => setConfirm(null)}>Not yet</button><button type="button" className="b p-btn sm" onClick={async () => { const t = confirm.t; setConfirm(null); if (await run(seat(t, who))) toast(`${fullName(t.people, t.person_name)} seated — ${seatedIn((await loadTerms()).rows, t.term_label ?? '').length} of ${SEATS_PER_TERM} seats for ${t.term_label}`) }}>Seat to {confirm.t.term_label}</button></div></>
              : <><div className="mh"><div><h3>Remove {fullName(confirm.t.people, confirm.t.person_name)} as a nominee?</h3><p>The nomination record is kept (status “withdrawn”, with who removed it and when) so the audit trail stays complete; it just leaves this list.</p></div><button type="button" className="x" aria-label="Close" onClick={() => setConfirm(null)}>×</button></div>
                <div className="mf"><button type="button" className="b s-btn on-light sm" onClick={() => setConfirm(null)}>Keep</button><button type="button" className="b dgr sm" onClick={async () => { const t = confirm.t; setConfirm(null); await run(withdraw(t, who), 'Nomination withdrawn') }}>Remove</button></div></>}
          </div>
        </div>
      )}
    </>
  )
}

function friendly(err: string): string {
  if (/row-level security/.test(err)) return 'You don’t have permission for that. Only board, the executive director and the Nominations & Elections chair can change board records.'
  return friendlyError(err)
}

/* ------------------------------------------------------------ add nominee -- */
function AddNominee({ rows, who, label, onClose, onSaved }: { rows: Term[]; who: { name: string; id: string | null }; label: string; onClose: () => void; onSaved: (m: string) => void }) {
  const toast = useToast()
  const [q, setQ] = useState(''); const [hits, setHits] = useState<Hit[]>([]); const [pick, setPick] = useState<Hit | null>(null)
  const y = Number(label.slice(0, 4))
  const [term, setTerm] = useState(label); const [date, setDate] = useState(new Date().toISOString().slice(0, 10)); const [by, setBy] = useState(`Dr. ${who.name}`)
  const [saving, setSaving] = useState(false)
  useEffect(() => { const k = (e: KeyboardEvent) => e.key === 'Escape' && onClose(); document.addEventListener('keydown', k); return () => document.removeEventListener('keydown', k) }, [onClose])
  useEffect(() => { if (pick || q.trim().length < 2) { setHits([]); return } const h = setTimeout(() => { void searchPeople(q).then((r) => setHits(r.filter((p) => !rows.some((t) => t.person_id === p.id && ['active', 'seated', 'nominee'].includes(t.status ?? ''))))) }, 180); return () => clearTimeout(h) }, [q, pick, rows])
  async function save() {
    if (!pick) return
    setSaving(true); const r = await addNominee(pick, term, by, date, who); setSaving(false)
    if (r.error) { toast(friendly(r.error)); return }
    onSaved(`${pick.first_name} ${pick.last_name} added as a nominee for ${term}`)
  }
  return (
    <div className="cert-veil" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="cert-modal" role="dialog" aria-modal="true">
        <div className="mh"><div><h3>Add nominee</h3><p>Pick the person from Contacts so eligibility reads straight from their record. Someone not in Contacts is added there first.</p></div><button type="button" className="x" aria-label="Close" onClick={onClose}>×</button></div>
        <div className="mb">
          <div className="cert-who"><label className="flabel">NAME</label><input className="fi" value={q} autoComplete="off" placeholder="Start typing a name…" onChange={(e) => { setQ(e.target.value); setPick(null) }} />
            {hits.length > 0 && !pick && <div className="list" style={{ top: '100%' }}>{hits.map((h) => <div key={h.id} onMouseDown={() => { setPick(h); setQ(`${h.first_name} ${h.last_name}${h.credentials ? ', ' + h.credentials : ''}`) }}>{h.first_name} {h.last_name}{h.credentials ? `, ${h.credentials}` : ''} <small>· {isCurrentMember(h) ? 'member' : 'not a member'}{hasLevel1(h) ? ' · AdvO Level 1+' : ''}{h.practice_name ? ` · ${h.practice_name}` : ''}</small></div>)}</div>}
            {q.trim().length >= 2 && hits.length === 0 && !pick && <div className="evt-hint">No contact matches — add them under Contacts first.</div>}
          </div>
          <div className="cert-grid mform"><div><label className="flabel">TERM</label><select className="fi" value={term} onChange={(e) => setTerm(e.target.value)}><option>{`${y - 1}–${y + 2}`}</option><option>{label}</option><option>{`${y + 1}–${y + 4}`}</option></select></div><div><label className="flabel">NOMINATION DATE</label><input className="fi" type="date" value={date} onChange={(e) => setDate(e.target.value)} /></div></div>
          <label className="flabel">NOMINATED BY</label><input className="fi" value={by} onChange={(e) => setBy(e.target.value)} placeholder="Board of Directors / name" />
          {pick && <div className="evt-hint">Eligibility from their record: <b className={isCurrentMember(pick) ? 'ok-txt' : 'warn-txt'}>{isCurrentMember(pick) ? 'current member' : 'not a current member'}</b> · <b className={hasLevel1(pick) ? 'ok-txt' : 'warn-txt'}>{hasLevel1(pick) ? 'AdvO Level 1 or higher' : 'no AdvO certification'}</b>. The other three items are verified by hand.</div>}
        </div>
        <div className="mf"><button type="button" className="b s-btn on-light sm" onClick={onClose}>Cancel</button><button type="button" className="b p-btn sm" disabled={!pick || saving} onClick={() => void save()}>{saving ? 'Saving…' : 'Add nominee'}</button></div>
      </div>
    </div>
  )
}

/* ------------------------------------------------------- director record -- */
function DirectorCard({ t, all, who, canManage, onClose, onChanged }: { t: Term; all: Term[]; who: { name: string; id: string | null }; canManage: boolean; onClose: () => void; onChanged: () => Promise<void> }) {
  const toast = useToast()
  const p = t.people
  const pid = t.person_id
  const mine = all.filter((x) => x.person_id && x.person_id === pid).sort((a, b) => (a.term_start ?? '').localeCompare(b.term_start ?? ''))
  const [rv, setRv] = useState<Review[]>([]); const [docs, setDocs] = useState<Doc[]>([]); const [notes, setNotes] = useState<BoardNote[]>([])
  const [rvForm, setRvForm] = useState(false); const [dcForm, setDcForm] = useState(false); const [ending, setEnding] = useState<Term | null>(null)
  const [rvT, setRvT] = useState(''); const [rvO, setRvO] = useState('Meets expectations'); const [rvX, setRvX] = useState(''); const [rvD, setRvD] = useState(new Date().toISOString().slice(0, 10))
  const [dcL, setDcL] = useState(''); const [dcD, setDcD] = useState(new Date().toISOString().slice(0, 10)); const [dcF, setDcF] = useState<File | null>(null)
  const [note, setNote] = useState(''); const [busy, setBusy] = useState(false)
  const [endR, setEndR] = useState('resigned'); const [endD, setEndD] = useState(new Date().toISOString().slice(0, 10)); const [endN, setEndN] = useState('')
  const reload = useCallback(async () => { if (!pid) return; const [a, b, c] = await Promise.all([loadReviews(pid), loadDocs(pid), loadNotes(pid)]); setRv(a); setDocs(b); setNotes(c) }, [pid])
  useEffect(() => { void reload() }, [reload])
  useEffect(() => { const k = (e: KeyboardEvent) => e.key === 'Escape' && onClose(); document.addEventListener('keydown', k); return () => document.removeEventListener('keydown', k) }, [onClose])
  const name = fullName(p, t.person_name)
  const status = (x: Term) => x.status === 'active' ? <Pill>Director</Pill> : x.status === 'seated' ? <Pill>Director · incoming</Pill> : x.status === 'nominee' ? <Pill>Director Nominee</Pill> : x.status === 'withdrawn' ? <Pill>Withdrawn</Pill> : <Pill>Past Director</Pill>
  const served = mine.filter((x) => !['nominee', 'withdrawn'].includes(x.status ?? '')).map((x) => `${(x.term_start ?? '').slice(0, 4)}–${(x.resignation_date ?? x.term_end ?? '').slice(0, 4)}`).join(', ')
  const roles = p?.person_roles ?? []
  const instr = (p?.instructor_records ?? []).find((i) => i.status === 'current')
  async function act(pr: Promise<{ ok?: true; error?: string }>, msg: string) { setBusy(true); const r = await pr; setBusy(false); if (r.error) { toast(friendly(r.error)); return false } await reload(); await onChanged(); toast(msg); return true }
  return (
    <div className="cert-veil" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="cert-modal bdir" role="dialog" aria-modal="true">
        <div className="ctc-top"><div className="av">{p?.photo_url ? <img src={p.photo_url} alt="" onError={(e) => (e.currentTarget.style.display = 'none')} /> : initials(p, t.person_name)}</div>
          <div style={{ flex: 1, minWidth: 0 }}><h3>{name}</h3><div className="ti">{t.service_start ? `On the board since ${t.service_start}` : served ? `Served ${served}` : 'Nominee'}{p?.deceased_on ? ` · deceased ${p.deceased_on.slice(0, 4)}` : ''}</div>
            <div className="cert-chips" style={{ marginBottom: 0 }}>{status(t)}{isCurrentMember(p) ? <Pill kind="ok">Member{p?.membership_expires ? ` · exp ${fmtD(p.membership_expires)}` : ''}</Pill> : <Pill kind="warn">Not a member</Pill>}{hasLevel1(p) && <Pill kind="gold">{CERT_LABEL[p?.cert_level ?? 'level_1']}</Pill>}<Chips list={roleChips(roles, { instructorLevel: instr?.level ?? null }).filter((c) => c.key !== 'dir' && c.key !== 'pdir' && c.key !== 'nom')} /></div></div>
          <button type="button" className="x" aria-label="Close" onClick={onClose}>×</button></div>
        <div className="ctc-body cc">
          <div className="sec">Service record</div>
          <div className="kv" style={{ marginBottom: 10 }}><span>Board service</span><div>{served || '—'}{t.service_start ? ` · first seated ${t.service_start}` : ''}</div><span>Terms on file</span><div>{mine.length || 1}</div></div>
          {(mine.length ? mine.slice().reverse() : [t]).map((x) => { const a = x.eligibility_audit ?? {}; return (
            <div key={x.id} className="btrail"><div className="t1"><b>Term {x.term_label}</b><span>{status(x)}</span></div>
              <div style={{ fontSize: 12.5, color: 'var(--color-content-muted)' }}>{fmtD(x.term_start)} – {fmtD(x.term_end)}{x.resignation_date ? ` · resigned ${fmtD(x.resignation_date)}` : x.end_reason === 'term_ended' ? ' · term ended' : ''}{x.nominated_by ? ` · nominated by ${x.nominated_by}` : ''}</div>
              <ul>{PROCESS.map((s) => <li key={s.key} className={stepDone(x, s.key) ? 'ok' : ''}><i /><span>{s.label}{x[s.date] ? ` · ${fmtD(x[s.date])}` : ''}{a[s.key] ? <small>verified by {a[s.key]!.by} · {fmtD(a[s.key]!.at)}</small> : (x.status === 'past' || x.status === 'active') && !stepDone(x, s.key) ? <small>not recorded (pre-dates this system)</small> : null}</span></li>)}
                {a.seated && <li className="ok"><i /><span>Seated<small>by {a.seated.by} · {fmtD(a.seated.at)}</small></span></li>}{a.ended && <li className="ok"><i /><span>Service ended<small>by {a.ended.by} · {fmtD(a.ended.at)}</small></span></li>}</ul>
              {canManage && (x.status === 'active' || x.status === 'seated') && <div style={{ marginTop: 10, display: 'flex', gap: 8, flexWrap: 'wrap' }}><button type="button" className="b s-btn on-light xs" onClick={() => setEnding(x)}>End board service</button>{!x.service_start && <button type="button" className="b s-btn on-light xs" onClick={async () => { const y = await askText('Add service start year', { label: 'Year first seated on the board', initial: (x.term_start ?? '').slice(0, 4), placeholder: 'e.g. 2019', required: true }, { ok: 'Save' }); if (y) void act(setServiceStart(x, y.trim()), 'Service start recorded') }}>Add service start year</button>}</div>}
            </div>) })}
          <div className="sec">Reviews <span className="r">{rv.length}</span></div>
          {rv.length === 0 && <p className="muted">No reviews on file.</p>}
          {rv.map((r) => <div key={r.id} className="brev"><div className="rh"><b>{r.title}</b>{r.outcome && <Pill kind={/meets|exceeds/i.test(r.outcome) ? 'ok' : 'warn'}>{r.outcome}</Pill>}</div>{r.summary}<small>{r.reviewer_name ?? 'Board'} · {fmtD(r.review_date)}</small></div>)}
          {canManage && pid && (rvForm
            ? <div className="baddform"><div className="g2"><div><label className="flabel">TITLE</label><input className="fi" value={rvT} onChange={(e) => setRvT(e.target.value)} placeholder="Annual director review 2026" /></div><div><label className="flabel">OUTCOME</label><select className="fi" value={rvO} onChange={(e) => setRvO(e.target.value)}><option>Meets expectations</option><option>Exceeds expectations</option><option>Needs improvement</option><option>Informational</option></select></div><div><label className="flabel">REVIEW DATE</label><input className="fi" type="date" value={rvD} onChange={(e) => setRvD(e.target.value)} /></div></div><label className="flabel">SUMMARY</label><textarea className="fi" rows={3} value={rvX} onChange={(e) => setRvX(e.target.value)} placeholder="Attendance, contributions, committee work, anything the board should remember." /><div className="r"><button type="button" className="b s-btn on-light xs" onClick={() => setRvForm(false)}>Cancel</button><button type="button" className="b p-btn xs" disabled={busy || !rvT.trim()} onClick={async () => { if (await act(addReview(pid, t.id, { title: rvT.trim(), outcome: rvO, summary: rvX.trim(), review_date: rvD }, who), 'Review saved')) { setRvForm(false); setRvT(''); setRvX('') } }}>Save review</button></div></div>
            : <button type="button" className="b s-btn on-light xs" onClick={() => setRvForm(true)}>+ Add review</button>)}
          <div className="sec">Documents <span className="r">{docs.length}</span></div>
          {docs.length === 0 && <p className="muted">No documents. Contracts, agreements and conflict-of-interest disclosures live here, attached to the director record.</p>}
          <div className="bdocs">{docs.map((d) => <div key={d.id} className="bdoc"><div className="ic">{d.kind ?? 'FILE'}</div><div><b>{d.label}</b><small>{fmtD(d.doc_date)}{d.uploaded_by_name ? ` · uploaded by ${d.uploaded_by_name}` : ''}</small></div><div style={{ display: 'flex', gap: 8 }}><button type="button" className="flink" onClick={async () => { const u = await documentUrl(d); if (u) window.open(u, '_blank', 'noopener'); else toast('Could not open that file') }}>Open</button>{canManage && <button type="button" className="flink" style={{ color: 'var(--color-status-danger)' }} onClick={async () => { if (await askConfirm(`Delete “${d.label}”?`, { body: 'The file is removed from the board documents. This cannot be undone.', ok: 'Delete', danger: true })) void act(deleteDocument(d), 'Document deleted') }}>Delete</button>}</div></div>)}</div>
          {canManage && pid && (dcForm
            ? <div className="baddform"><div className="g2"><div><label className="flabel">LABEL</label><input className="fi" value={dcL} onChange={(e) => setDcL(e.target.value)} placeholder="Board member agreement 2026–2029" /></div><div><label className="flabel">DATE</label><input className="fi" type="date" value={dcD} onChange={(e) => setDcD(e.target.value)} /></div></div><label className="flabel">FILE</label><input className="fi" type="file" accept=".pdf,.doc,.docx,image/*" onChange={(e) => setDcF(e.target.files?.[0] ?? null)} /><div className="r"><button type="button" className="b s-btn on-light xs" onClick={() => setDcForm(false)}>Cancel</button><button type="button" className="b p-btn xs" disabled={busy || !dcL.trim() || !dcF} onClick={async () => { if (dcF && await act(uploadDocument(pid, t.id, dcF, dcL.trim(), dcD || null, who), 'Document uploaded')) { setDcForm(false); setDcL(''); setDcF(null) } }}>{busy ? 'Uploading…' : 'Upload'}</button></div></div>
            : <button type="button" className="b s-btn on-light xs" style={{ marginTop: 8 }} onClick={() => setDcForm(true)}>+ Upload document</button>)}
          <div className="sec">Board notes</div>
          {notes.length === 0 && <p className="muted">No notes yet. These are board-only — separate from the contact notes the membership side sees.</p>}
          {notes.map((n) => <div key={n.id} className="ctc-note">{n.text}<small>{n.by_name ?? 'Board'} · {fmtD(n.created_at)}</small></div>)}
          {canManage && pid && <div className="ctc-noteform"><textarea value={note} onChange={(e) => setNote(e.target.value)} placeholder="Add a board note…" /><div className="r"><button type="button" className="b s-btn on-light sm" disabled={busy || !note.trim()} onClick={async () => { if (await act(addBoardNote(pid, note.trim(), who), 'Note added')) setNote('') }}>Add note</button></div></div>}
        </div>
        <div className="mf evt-foot"><div className="r"><a className="flink" href="#contacts" onClick={(e) => { e.preventDefault(); window.location.hash = 'leads'; onClose() }}>Open full contact record →</a></div><div className="r"><button type="button" className="b p-btn sm" onClick={onClose}>Close</button></div></div>
        {ending && (
          <div className="cert-veil" onClick={(e) => e.target === e.currentTarget && setEnding(null)}>
            <div className="cert-modal" role="dialog" aria-modal="true">
              <div className="mh"><div><h3>End board service — {name}</h3><p>Moves them to Past Directors, keeps the full record, and swaps the Director role for Past Director (board access on the site ends). Logged as recorded by {who.name}.</p></div><button type="button" className="x" aria-label="Close" onClick={() => setEnding(null)}>×</button></div>
              <div className="mb"><div className="cert-grid mform"><div><label className="flabel">REASON</label><select className="fi" value={endR} onChange={(e) => setEndR(e.target.value)}><option value="resigned">Resigned</option><option value="term_ended">Term ended</option><option value="removed">Removed by board vote</option><option value="deceased">Deceased</option></select></div><div><label className="flabel">EFFECTIVE DATE</label><input className="fi" type="date" value={endD} onChange={(e) => setEndD(e.target.value)} /></div><div className="full"><label className="flabel">NOTE (OPTIONAL)</label><input className="fi" value={endN} onChange={(e) => setEndN(e.target.value)} placeholder="e.g. Resignation letter received" /></div></div></div>
              <div className="mf"><button type="button" className="b s-btn on-light sm" onClick={() => setEnding(null)}>Back</button><button type="button" className="b dgr sm" disabled={busy} onClick={async () => { const x = ending; setEnding(null); if (await act(endService(x, endR, endD, who), 'Board service ended — a seat is open')) { if (endN.trim() && pid) await addBoardNote(pid, endN.trim(), who); await reload(); onClose() } }}>End service</button></div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
