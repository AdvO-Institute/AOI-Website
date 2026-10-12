/* ----------------------------------------------------------------------------
 * Instructors — the teaching faculty per technique: All · In training ·
 * Current · Past. Certification criteria come from the register and are
 * never ticked by hand; Train the Trainer and practice years are two-step
 * lock-ins; Certify, Initiate Senior and End service are dated and stamped.
 * -------------------------------------------------------------------------- */
import { friendlyError } from '@/lib/friendlyError'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useAccess } from '@/lib/queries/AccessProvider'
import { useToast } from '@/components/ui/Toast'
import { displayName } from '@/lib/access'
import {
  records as loadRecords, logFor, notesFor, searchPeople, tick, certify, initiateSenior, endService, saveRecord, removeRecord, addLog, addNote, exportRows,
  TECHNIQUES, SEMINARS, LEVEL_LABEL, END_REASONS, LOG_KINDS, CRITERIA, fullName, initials, lastName, certLabel, certRank, critMet, critDone, critAll, isReady, inTraining, registerGap, fmtD, fmtM, fmtTs,
} from '@/lib/queries/instructors'
import type { InstructorRecord, PersonLite, Level, Status, LogEntry, Note, Who, Stamp } from '@/lib/queries/instructors'
import { askConfirm } from './opsUi'

const today = () => new Date().toISOString().slice(0, 10)
function Pill({ kind = '', children, title }: { kind?: string; children: React.ReactNode; title?: string }) { return <span className={`cpill ${kind}`} title={title}>{children}</span> }
function F({ l, children, full = false, hint }: { l: string; children: React.ReactNode; full?: boolean; hint?: string }) {
  return <div className={full ? 'full' : ''}><label className="flabel">{l}</label>{children}{hint && <div className="evt-hint">{hint}</div>}</div>
}
function useEsc(onClose: () => void) { useEffect(() => { const k = (e: KeyboardEvent) => e.key === 'Escape' && onClose(); document.addEventListener('keydown', k); return () => document.removeEventListener('keydown', k) }, [onClose]) }
function friendly(err: string): string {
  if (/row-level security/.test(err)) return 'You don’t have permission for that. Only the executive director and the Instructor Committee chair can change instructor records.'
  return friendlyError(err)
}
function ChkRow({ id, label, done, pending, canEdit, auto, onPend, onDate, onLock, onUntick }: {
  id: string; label: string; done?: Stamp; pending?: string; canEdit: boolean; auto?: { ok: boolean; have: string; need: string; technique: string }
  onPend: () => void; onDate: (d: string) => void; onLock: () => void; onUntick: () => void
}) {
  if (auto) return <div className={`bchk ichk${auto.ok ? ' done' : ''}`}><input type="checkbox" id={id} checked={auto.ok} disabled readOnly /><label htmlFor={id}>{label}<small className={auto.ok ? 'ok-txt' : ''}>{auto.ok ? `✓ from the certification register · ${auto.have}` : `auto — register shows ${auto.have}; needs ${auto.need} in ${auto.technique}`}</small></label><span className="auto">AUTO</span></div>
  if (done) return <div className="bchk ichk done"><input type="checkbox" id={id} checked disabled={!canEdit} onChange={onUntick} /><label htmlFor={id}>{label}<small className="ok-txt">✓ {fmtD(done.date)} · {done.name}</small></label><span /></div>
  if (pending !== undefined) return <div className="bchk ichk pending"><input type="checkbox" id={id} checked onChange={onUntick} /><label htmlFor={id}>{label}<small>Choose the date, then lock it in</small></label><span className="lock"><input type="date" value={pending} onChange={(e) => onDate(e.target.value)} /><button type="button" className="b p-btn sm" onClick={onLock}>Lock in</button></span></div>
  return <div className="bchk ichk"><input type="checkbox" id={id} checked={false} disabled={!canEdit} onChange={onPend} /><label htmlFor={id}>{label}</label><span /></div>
}

export default function InstructorsPanel() {
  const toast = useToast()
  const { access, can } = useAccess()
  const who: Who = { name: displayName(access).replace(/,.*$/, ''), id: access.person?.id ?? null }
  const canManage = can('full_admin') || can('manage_instructors')
  const [rows, setRows] = useState<InstructorRecord[]>([]); const [loading, setLoading] = useState(true); const [error, setError] = useState<string | null>(null)
  const [filter, setFilter] = useState<'all' | 'training' | 'current' | 'past'>('all'); const [q, setQ] = useState(''); const [tech, setTech] = useState('')
  const [pending, setPending] = useState<Record<string, string>>({}); const [action, setAction] = useState<Record<string, string>>({})
  const [person, setPerson] = useState<PersonLite | null>(null); const [edit, setEdit] = useState<InstructorRecord | null | 'new'>(null); const [presetPerson, setPresetPerson] = useState<PersonLite | null>(null)
  const [initiate, setInitiate] = useState<InstructorRecord | null>(null); const [ending, setEnding] = useState<InstructorRecord | null>(null)

  const load = useCallback(async () => {
    const r = await loadRecords()
    setError(r.error ? `The instructor records could not be read. ${friendlyError(r.error)}` : null)
    setRows(r.rows); setLoading(false)
  }, [])
  useEffect(() => { void load() }, [load])
  async function run(p: Promise<{ ok?: true; error?: string }>, okMsg?: string) {
    const r = await p; if (r.error) { toast(friendly(r.error)); return false }
    await load(); if (okMsg) toast(okMsg); return true
  }
  const pk = (id: number, key: string) => `${id}:${key}`
  async function lock(r: InstructorRecord, key: string) {
    const k = pk(r.id, key); const date = pending[k]; if (!date) return toast('Choose a date first')
    if (await run(tick(r, key, true, date, who), `Locked in · ${fmtD(date)} · ${who.name}`)) setPending((s) => { const n = { ...s }; delete n[k]; return n })
  }
  async function untick(r: InstructorRecord, key: string) { if (!(await askConfirm('Clear this item?', { body: 'The date and verifier will be removed.', ok: 'Clear', danger: true }))) return; await run(tick(r, key, false, '', who)) }

  const cnt = useMemo(() => ({ training: rows.filter(inTraining).length, current: rows.filter((r) => r.status === 'current').length, past: rows.filter((r) => r.status === 'past').length, senior: rows.filter((r) => r.status === 'current' && r.level === 'senior_instructor').length, instr: rows.filter((r) => r.status === 'current' && r.level === 'instructor').length }), [rows])
  const lq = q.trim().toLowerCase()
  const grp = (r: InstructorRecord) => r.status === 'past' ? 2 : inTraining(r) ? 0 : 1
  const list = rows.filter((r) => filter === 'all' || (filter === 'training' ? inTraining(r) : r.status === filter))
    .filter((r) => !tech || r.technique === tech)
    .filter((r) => !lq || `${fullName(r.people, r.person_name)} ${r.technique} ${r.people?.practice_name ?? ''}`.toLowerCase().includes(lq))
    .sort((a, b) => (grp(a) - grp(b)) || (Number(b.level === 'senior_instructor') - Number(a.level === 'senior_instructor')) || lastName(a).localeCompare(lastName(b)))
  async function exportCsv() { const csv = await exportRows(); if (!csv) return toast('Nothing to export'); const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' })); a.download = `instructors-${today()}.csv`; a.click(); URL.revokeObjectURL(a.href) }

  if (loading) return <><h1>Instructors</h1><div className="ma-sub">Reading the instructor records…</div><div className="ma-panel"><p className="ma-empty">One moment.</p></div></>

  const row = (r: InstructorRecord) => {
    const name = fullName(r.people, r.person_name); const gap = registerGap(r); const ak = `cert:${r.id}`
    const dates = [r.instructor_date && `Instructor since ${fmtM(r.instructor_date)}`, r.senior_date && `Senior since ${fmtM(r.senior_date)}`, r.initiated_date && r.target_level && `${LEVEL_LABEL[r.target_level]} initiated ${fmtD(r.initiated_date)}${r.initiated_by_name ? ' by ' + r.initiated_by_name : ''}`].filter(Boolean).join(' · ')
    return <div key={r.id} className={`irow ${r.status}`}>
      <div className="hd"><button type="button" className="pname" onClick={() => r.people && setPerson(r.people)}>{name}</button><span className="sp">{canManage && <button type="button" className="b s-btn on-light xs" onClick={() => setEdit(r)}>Override</button>}</span></div>
      <div className="meta under"><Pill>{r.technique}</Pill>{r.level && <Pill>{LEVEL_LABEL[r.level]}</Pill>}{r.target_level && <Pill kind="warn">Working toward {LEVEL_LABEL[r.target_level]}</Pill>}{r.status === 'past' ? <Pill>Past</Pill> : r.status === 'upcoming' ? <Pill kind="warn">In training</Pill> : null}</div>
      {dates ? <div className="meta dates">{dates}{r.certified_by ? ` · certified by ${r.certified_by}` : ''}</div> : r.status === 'current' ? <div className="meta dates muted">Award dates not recorded (awarded before these records began)</div> : null}
      {gap && <div className="meta warn-txt">⚠ {gap} — reconcile on the Certifications tab</div>}
      {r.status !== 'past' && <div className="meta"><span className="lbl">Cleared to teach</span>{(r.seminars ?? []).length ? (r.seminars ?? []).map((s) => <Pill key={s} kind="lead">{s}</Pill>) : <i>not set — set under Override</i>}</div>}
      {r.status === 'past' && <div className="meta muted">Past instructor · ended {fmtD(r.end_date)} · {END_REASONS[r.end_reason ?? ''] ?? r.end_reason ?? ''}{r.ended_by_name ? ` · by ${r.ended_by_name}` : ''}</div>}
      {r.target_level ? <div className="body">
        <div className="sec">Criteria for {LEVEL_LABEL[r.target_level]} <span className="r">{critDone(r)} of {critAll(r)} · {Math.round(critDone(r) / critAll(r) * 100)}%</span></div>
        <div className="iprog"><i style={{ width: `${Math.round(critDone(r) / critAll(r) * 100)}%` }} /></div>
        {CRITERIA[r.target_level].map((c) => c.auto
          ? <ChkRow key={c.key} id={`r${r.id}_${c.key}`} label={c.label} auto={{ ok: certRank(r.people, r.technique) >= c.auto, have: certLabel(r.people, r.technique), need: c.auto === 2 ? 'Level 2' : 'Level 1', technique: r.technique }} canEdit={false} onPend={() => {}} onDate={() => {}} onLock={() => {}} onUntick={() => {}} />
          : <ChkRow key={c.key} id={`r${r.id}_${c.key}`} label={c.label} done={r.progress?.[c.key]} pending={pending[pk(r.id, c.key)]} canEdit={canManage} onPend={() => setPending((s) => ({ ...s, [pk(r.id, c.key)]: today() }))} onDate={(d) => setPending((s) => ({ ...s, [pk(r.id, c.key)]: d }))} onLock={() => void lock(r, c.key)} onUntick={() => r.progress?.[c.key] ? void untick(r, c.key) : setPending((s) => { const n = { ...s }; delete n[pk(r.id, c.key)]; return n })} />)}
        {canManage && <div className="acts">
          {ak in action
            ? <span className="ilock"><label>Award date</label><input type="date" className="fi" value={action[ak]} onChange={(e) => setAction((s) => ({ ...s, [ak]: e.target.value }))} /><button type="button" className="b p-btn sm" onClick={async () => { if (await run(certify(r, action[ak]!, who), `${name} certified as ${LEVEL_LABEL[r.target_level!]} · ${fmtD(action[ak])} · instructor role on the site updated`)) { setAction((s) => { const n = { ...s }; delete n[ak]; return n }); setFilter('current') } }}>Lock in &amp; certify {LEVEL_LABEL[r.target_level]}</button><button type="button" className="b s-btn on-light sm" onClick={() => setAction((s) => { const n = { ...s }; delete n[ak]; return n })}>Cancel</button></span>
            : <button type="button" className="b p-btn sm" disabled={!isReady(r)} onClick={() => setAction((s) => ({ ...s, [ak]: today() }))}>✓ Certify — {LEVEL_LABEL[r.target_level]}</button>}
          {!isReady(r) && <span className="hint">Complete &amp; date every criterion to certify. Certification levels come from the register — award them on the Certifications tab.</span>}
        </div>}
      </div> : r.status === 'current' && r.level === 'instructor' && canManage ? <div className="acts"><button type="button" className="b s-btn on-light sm" onClick={() => setInitiate(r)}>Initiate Senior Instructor</button><span className="hint">Opens the Senior criteria with a date of initiation.</span></div> : null}
    </div>
  }

  return (
    <>
      <div className="cert-head">
        <div><h1>Instructors</h1><div className="ma-sub" style={{ marginBottom: 0, maxWidth: '80ch' }}>The teaching faculty by technique — Instructor and Senior Instructor — and the pipeline toward each. Certification criteria are read from the register, never ticked by hand; everything else is a two-step lock-in recorded with who verified it and when.{!canManage && <> <Pill>view only</Pill></>}</div></div>
        <div className="cert-actions">{canManage && <button type="button" className="b p-btn sm" onClick={() => { setPresetPerson(null); setEdit('new') }}>+ Add / manage</button>}<button type="button" className="b s-btn on-light sm" onClick={() => void exportCsv()}>↓ Export</button></div>
      </div>
      {error && <div className="cert-err" role="alert">{error}</div>}
      <div className="cert-tiles four">
        <button type="button" className={`cert-tile${filter === 'all' ? ' on' : ''}`} onClick={() => setFilter('all')}><span>All records</span><b>{rows.length}</b></button>
        <button type="button" className={`cert-tile${filter === 'training' ? ' on' : ''}`} onClick={() => setFilter('training')}><span>In training</span><b>{cnt.training}</b></button>
        <button type="button" className={`cert-tile${filter === 'current' ? ' on' : ''}`} onClick={() => setFilter('current')}><span>Current</span><b>{cnt.current}</b></button>
        <button type="button" className={`cert-tile${filter === 'past' ? ' on' : ''}`} onClick={() => setFilter('past')}><span>Past</span><b>{cnt.past}</b></button>
      </div>
      <div className="ctc-srow"><div className="cert-search" style={{ margin: 0 }}>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></svg>
        <input type="text" value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => e.key === 'Escape' && setQ('')} autoComplete="off" placeholder="Search instructors by name, technique or practice…" aria-label="Search instructors" />
        {q && <button type="button" className="clr" aria-label="Clear search" onClick={() => setQ('')}>×</button>}</div>
        <select className="fi" value={tech} onChange={(e) => setTech(e.target.value)} aria-label="Technique"><option value="">All techniques</option>{TECHNIQUES.map((t) => <option key={t}>{t}</option>)}</select></div>
      <div className="bpanel"><div className="ph">{filter === 'all' ? 'All instructor records' : filter === 'training' ? 'In training' : `${filter} instructors`}<span className="r">{filter === 'all' ? `in training first, then current (${cnt.senior} senior · ${cnt.instr} instructor), then past` : filter === 'training' ? 'criteria and the certify step — Instructor is the only way from in training to current' : filter === 'past' ? 'kept so there is always a list of anyone who was' : 'seniors first'}</span></div>
        {list.length ? list.map(row) : <div className="bnodata">{rows.length ? 'Nobody matches.' : 'No instructor records yet.'}</div>}</div>

      {person && <PersonCard p={person} rows={rows} who={who} canManage={canManage} onClose={() => setPerson(null)} onChanged={load} onEnd={(r) => { setPerson(null); setEnding(r) }} onAdd={(p) => { setPerson(null); setPresetPerson(p); setEdit('new') }} />}
      {edit && <RecordDialog r={edit === 'new' ? null : edit} preset={presetPerson} rows={rows} onClose={() => setEdit(null)} onSaved={async (m, st) => { setEdit(null); await load(); setFilter(st === 'upcoming' ? 'training' : st); toast(m) }} onRemoved={async () => { setEdit(null); await load() }} />}
      {initiate && <InitiateDialog r={initiate} who={who} onClose={() => setInitiate(null)} onDone={async (m) => { setInitiate(null); await load(); toast(m) }} />}
      {ending && <EndDialog r={ending} who={who} onClose={() => setEnding(null)} onDone={async (m) => { setEnding(null); await load(); setFilter('past'); toast(m) }} />}
    </>
  )
}

/* ---------------------------------------------------------------- person card */
function PersonCard({ p, rows, who, canManage, onClose, onChanged, onEnd, onAdd }: { p: PersonLite; rows: InstructorRecord[]; who: Who; canManage: boolean; onClose: () => void; onChanged: () => Promise<void>; onEnd: (r: InstructorRecord) => void; onAdd: (p: PersonLite) => void }) {
  const toast = useToast()
  useEsc(onClose)
  const mine = rows.filter((r) => r.person_id === p.id)
  const [logs, setLogs] = useState<Record<number, LogEntry[]>>({}); const [notes, setNotes] = useState<Note[]>([]); const [txt, setTxt] = useState('')
  const [lf, setLf] = useState<Record<number, { kind: LogEntry['kind']; date: string; text: string }>>({})
  const reload = useCallback(async () => { const e: Record<number, LogEntry[]> = {}; for (const r of mine) e[r.id] = await logFor(r.id); setLogs(e); setNotes(await notesFor(p.id)) }, [p.id, mine.map((r) => r.id).join(',')]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { void reload() }, [reload])
  const tick = (ok: boolean, label: string, sub?: string | null) => <div className={`tick${ok ? ' ok' : ''}`}><i /><div>{label}{sub && <small>{sub}</small>}</div></div>
  const certs = (p.person_certifications ?? []).map((c) => `${c.technique} · ${certLabel({ ...p, person_certifications: [c] }, c.technique)}`)
  return (
    <div className="cert-veil" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="cert-modal ctc-card bdir" role="dialog" aria-modal="true">
        <div className="ctc-top"><div className="av">{initials(p)}</div>
          <div style={{ flex: 1 }}><h3>{fullName(p)}</h3><div className="ti">{[p.practice_name, [p.practice_city, p.practice_state].filter(Boolean).join(', ')].filter(Boolean).join(' · ')}</div>
            <div className="ctc-chips">{mine.filter((r) => r.status !== 'past').map((r) => <Pill key={r.id} kind={r.level ? '' : 'warn'}>{r.technique} · {r.level ? LEVEL_LABEL[r.level] : 'In training'}{r.target_level ? ` → ${LEVEL_LABEL[r.target_level]}` : ''}</Pill>)}{certs.map((c) => <Pill key={c}>{c}</Pill>)}{/(active|current|good)/.test(p.membership_status ?? '') && <Pill>Member</Pill>}</div></div>
          <button type="button" className="x" onClick={onClose} aria-label="Close">×</button></div>
        <div className="ctc-body">
          <div className="sec">Contact</div>
          <div className="kv">{p.email && <><span>Email</span><div>{p.email}</div></>}<span>Practice</span><div>{p.practice_name ?? '—'}{p.practice_city ? ` · ${p.practice_city}, ${p.practice_state ?? ''}` : ''}</div></div>
          {mine.map((r) => <div key={r.id}>
            <div className="sec">Instructor record · {r.technique} <span className="r">{r.status === 'past' ? 'past' : r.level ? LEVEL_LABEL[r.level] : 'in training'}{r.target_level ? ` · working toward ${LEVEL_LABEL[r.target_level]}` : ''}</span></div>
            <div className="kv">{r.instructor_date && <><span>Instructor awarded</span><div>{fmtD(r.instructor_date)}</div></>}{r.senior_date && <><span>Senior awarded</span><div>{fmtD(r.senior_date)}</div></>}{r.initiated_date && r.target_level && <><span>{LEVEL_LABEL[r.target_level]} initiated</span><div>{fmtD(r.initiated_date)}{r.initiated_by_name ? ` · ${r.initiated_by_name}` : ''}</div></>}{r.certified_by && <><span>Certified by</span><div>{r.certified_by}</div></>}<span>Register</span><div className={registerGap(r) ? 'warn-txt' : ''}>{certLabel(p, r.technique)} in {r.technique}{registerGap(r) ? ' — below the level held' : ''}</div>{r.status === 'past' && <><span>Service ended</span><div>{fmtD(r.end_date)} · {END_REASONS[r.end_reason ?? ''] ?? ''}</div></>}<span>Cleared to teach</span><div>{(r.seminars ?? []).length ? (r.seminars ?? []).join(', ') : <i>not set</i>}</div></div>
            {r.target_level && <div style={{ marginTop: 8 }}>{CRITERIA[r.target_level].map((c) => { const ok = critMet(r, c); const d = r.progress?.[c.key]; return <div key={c.key}>{tick(ok, c.label, ok ? (c.auto ? 'from the certification register' : `${fmtD(d?.date)} · ${d?.name ?? ''}`) : null)}</div> })}</div>}
            {(logs[r.id] ?? []).length > 0 && <><div className="sec">Feedback &amp; observation <span className="r">{r.technique}</span></div>{(logs[r.id] ?? []).map((l) => <div key={l.id} className="ctc-note"><Pill kind={l.kind === 'retraining' ? 'warn' : ''}>{LOG_KINDS[l.kind as LogEntry['kind']] ?? l.kind}</Pill> {l.text}<small>{fmtD(l.log_date)} · {l.by_name ?? '—'}</small></div>)}</>}
            {canManage && r.status !== 'past' && <div className="baddform">
              <div className="g2" style={{ gridTemplateColumns: '1fr 1fr' }}><select className="fi" value={lf[r.id]?.kind ?? 'attendee_feedback'} onChange={(e) => setLf((s) => ({ ...s, [r.id]: { kind: e.target.value as LogEntry['kind'], date: s[r.id]?.date ?? today(), text: s[r.id]?.text ?? '' } }))}>{(Object.entries(LOG_KINDS) as [LogEntry['kind'], string][]).map(([k, lbl]) => <option key={k} value={k}>{lbl}</option>)}</select><input className="fi" type="date" value={lf[r.id]?.date ?? today()} onChange={(e) => setLf((s) => ({ ...s, [r.id]: { kind: s[r.id]?.kind ?? 'attendee_feedback', date: e.target.value, text: s[r.id]?.text ?? '' } }))} /></div>
              <textarea className="fi" value={lf[r.id]?.text ?? ''} onChange={(e) => setLf((s) => ({ ...s, [r.id]: { kind: s[r.id]?.kind ?? 'attendee_feedback', date: s[r.id]?.date ?? today(), text: e.target.value } }))} placeholder="What was observed, the scores, the plan…" />
              <div className="r"><button type="button" className="b s-btn on-light sm" onClick={async () => { const v = lf[r.id]; if (!v?.text.trim()) return; const w = await addLog(r, v.kind, v.date || today(), v.text.trim(), who); if (w.error) return toast(friendly(w.error)); setLf((s) => ({ ...s, [r.id]: { kind: v.kind, date: today(), text: '' } })); await reload(); toast('Added to the log') }}>Add to the log</button><button type="button" className="b s-btn on-light sm" onClick={() => onEnd(r)}>End instructor service</button></div>
            </div>}
          </div>)}
          <div className="sec">Running notes <span className="r">per person, time-stamped</span></div>
          {canManage && <div className="ctc-noteform"><textarea value={txt} onChange={(e) => setTxt(e.target.value)} placeholder="Add a running note…" /><div className="r"><button type="button" className="b p-btn sm" onClick={async () => { const t = txt.trim(); if (!t) return; const w = await addNote(p.id, t, who); if (w.error) return toast(friendly(w.error)); setTxt(''); await reload(); toast('Note added') }}>Add note</button></div></div>}
          {notes.length ? notes.map((n) => <div key={n.id} className="ctc-note">{n.text}<small>{n.by_name ?? '—'} · {fmtTs(n.created_at)}</small></div>) : <p className="muted" style={{ marginTop: 8 }}>No notes yet.</p>}
        </div>
        <div className="mf evt-foot"><span><a className="b s-btn on-light sm" href="#leads">Open in Contacts</a></span><span style={{ display: 'flex', gap: 8 }}>{canManage && <button type="button" className="b s-btn on-light sm" onClick={() => onAdd(p)}>{mine.length ? 'Add another technique' : 'Add as instructor'}</button>}<button type="button" className="b s-btn on-light sm" onClick={() => { void onChanged(); onClose() }}>Close</button></span></div>
      </div>
    </div>
  )
}

/* ------------------------------------------------------------ record dialog */
function RecordDialog({ r, preset, rows, onClose, onSaved, onRemoved }: { r: InstructorRecord | null; preset: PersonLite | null; rows: InstructorRecord[]; onClose: () => void; onSaved: (m: string, status: Status) => void; onRemoved: () => void }) {
  const toast = useToast()
  useEsc(onClose)
  const [pick, setPick] = useState<PersonLite | null>(r?.people ?? preset); const [q, setQ] = useState(''); const [hits, setHits] = useState<PersonLite[]>([])
  const [v, setV] = useState({ technique: r?.technique ?? 'Advanced Orthogonal', level: (r?.level ?? '') as Level | '', target_level: (r?.target_level ?? '') as Level | '', status: (r?.status ?? 'upcoming') as Status, instructor_date: r?.instructor_date ?? '', senior_date: r?.senior_date ?? '', certified_by: r?.certified_by ?? '', notes: r?.notes ?? '' })
  const [sems, setSems] = useState<string[]>(r?.seminars ?? []); const [saving, setSaving] = useState(false)
  useEffect(() => { if (pick || q.trim().length < 2) { setHits([]); return } const h = setTimeout(() => { void searchPeople(q).then(setHits) }, 200); return () => clearTimeout(h) }, [q, pick])
  const set = (k: keyof typeof v) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => setV({ ...v, [k]: e.target.value })
  async function save() {
    if (!pick) return toast('Pick a person first')
    if (!r && rows.some((x) => x.person_id === pick.id && x.technique === v.technique)) return toast(`${fullName(pick)} already has a ${v.technique} record — open it with Override`)
    setSaving(true)
    const w = await saveRecord(r?.id ?? null, { person: pick, technique: v.technique, level: v.level || null, target_level: v.target_level || null, status: v.status, instructor_date: v.instructor_date, senior_date: v.senior_date, certified_by: v.certified_by, seminars: sems, notes: v.notes }, r)
    setSaving(false)
    if (w.error) return toast(friendly(w.error))
    onSaved(r ? 'Record saved' : `${fullName(pick)} added · ${v.technique}`, v.status)
  }
  return (
    <div className="cert-veil" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="cert-modal wide" role="dialog" aria-modal="true">
        <div className="mh"><div><h3>{r ? 'Override instructor record' : 'Add instructor'}</h3><p>Instructor Committee only · the escape hatch for data entry and corrections; the normal path is the checklist and Certify</p></div><button type="button" className="x" onClick={onClose} aria-label="Close">×</button></div>
        <div className="mb"><div className="cert-grid mform evt-grid">
          <div className="full"><label className="flabel">Person</label>
            {pick ? <div className="ipicked"><b>{fullName(pick)}</b><span>{pick.practice_name ?? ''}</span>{!r && !preset && <button type="button" className="x" onClick={() => setPick(null)} aria-label="Change">×</button>}</div>
              : <div className="iwho"><input className="fi" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Type a last name…" autoComplete="off" />{hits.length > 0 && <div className="who-list">{hits.map((h) => <div key={h.id} onClick={() => { setPick(h); setQ('') }}><b>{fullName(h)}</b> <small>· {h.practice_name ?? ''} · {(h.person_certifications ?? []).map((c) => `${c.technique.split(' ')[0]} ${certLabel({ ...h, person_certifications: [c] }, c.technique)}`).join(', ') || 'not certified'}</small></div>)}</div>}{q.trim().length >= 2 && !hits.length && <div className="evt-hint">No match — add them in Contacts first.</div>}</div>}</div>
          <F l="Technique"><select className="fi" value={v.technique} onChange={set('technique')}>{TECHNIQUES.map((t) => <option key={t}>{t}</option>)}</select></F>
          <F l="Register shows"><input className="fi" value={pick ? certLabel(pick, v.technique) : '—'} disabled readOnly /></F>
          <F l="Achieved level"><select className="fi" value={v.level} onChange={set('level')}><option value="">None (in training)</option><option value="instructor">Instructor</option><option value="senior_instructor">Senior Instructor</option></select></F>
          <F l="Working toward"><select className="fi" value={v.target_level} onChange={set('target_level')}><option value="">None</option><option value="instructor">Instructor</option><option value="senior_instructor">Senior Instructor</option></select></F>
          <F l="Status"><select className="fi" value={v.status} onChange={set('status')}><option value="upcoming">In training</option><option value="current">Current</option><option value="past">Past</option></select></F>
          <F l="Certified by"><input className="fi" value={v.certified_by} onChange={set('certified_by')} placeholder="who awarded it" /></F>
          <F l="Instructor awarded"><input className="fi" type="date" value={v.instructor_date} onChange={set('instructor_date')} /></F>
          <F l="Senior awarded"><input className="fi" type="date" value={v.senior_date} onChange={set('senior_date')} /></F>
          <div className="full"><label className="flabel">Cleared to teach</label><div className="ctc-chk">{SEMINARS.map((s) => <label key={s} className={sems.includes(s) ? 'on' : ''}><input type="checkbox" checked={sems.includes(s)} onChange={(e) => setSems((x) => e.target.checked ? [...x, s] : x.filter((y) => y !== s))} />{s}</label>)}</div><div className="evt-hint">Drives who can be picked as a speaker on the Events tab.</div></div>
          <F l="Notes" full><textarea className="fi" value={v.notes} onChange={set('notes')} /></F>
        </div></div>
        <div className="mf evt-foot"><span>{r && <button type="button" className="b d-btn sm" onClick={async () => { if (!(await askConfirm('Remove this record entirely?', { body: 'This cannot be undone. Use End instructor service to keep the history.', ok: 'Remove record', danger: true }))) return; const w = await removeRecord(r.id); if (w.error) return toast(friendly(w.error)); onRemoved() }}>Remove record</button>}</span><span style={{ display: 'flex', gap: 8 }}><button type="button" className="b s-btn on-light sm" onClick={onClose}>Cancel</button><button type="button" className="b p-btn sm" disabled={saving} onClick={() => void save()}>{saving ? 'Saving…' : r ? 'Save' : 'Add instructor'}</button></span></div>
      </div>
    </div>
  )
}
function InitiateDialog({ r, who, onClose, onDone }: { r: InstructorRecord; who: Who; onClose: () => void; onDone: (m: string) => void }) {
  const toast = useToast(); useEsc(onClose)
  const [date, setDate] = useState(today()); const l2 = certRank(r.people, r.technique) >= 2
  return <div className="cert-veil" onClick={(e) => e.target === e.currentTarget && onClose()}><div className="cert-modal" role="dialog" aria-modal="true">
    <div className="mh"><div><h3>Initiate Senior Instructor</h3><p>{fullName(r.people, r.person_name)} · {r.technique} · opens the Senior criteria; each is still locked in separately</p></div><button type="button" className="x" onClick={onClose} aria-label="Close">×</button></div>
    <div className="mb"><F l="Date of initiation"><input className="fi" type="date" value={date} onChange={(e) => setDate(e.target.value)} /></F><div className="evt-hint">Recorded as initiated by {who.name}. The register shows <b>{certLabel(r.people, r.technique)}</b> for {r.technique}{l2 ? ' — the Level 2 criterion will show as met.' : ' — Level 2 must be awarded on the Certifications tab before Senior can be certified.'}</div></div>
    <div className="mf"><button type="button" className="b s-btn on-light sm" onClick={onClose}>Cancel</button><button type="button" className="b p-btn sm" onClick={async () => { if (!date) return toast('Choose a date'); const w = await initiateSenior(r, date, who); if (w.error) return toast(friendly(w.error)); onDone(`Senior Instructor initiated · ${fmtD(date)} · ${who.name}`) }}>Lock in &amp; initiate</button></div>
  </div></div>
}
function EndDialog({ r, who, onClose, onDone }: { r: InstructorRecord; who: Who; onClose: () => void; onDone: (m: string) => void }) {
  const toast = useToast(); useEsc(onClose)
  const [reason, setReason] = useState('stepped_down'); const [date, setDate] = useState(today())
  return <div className="cert-veil" onClick={(e) => e.target === e.currentTarget && onClose()}><div className="cert-modal" role="dialog" aria-modal="true">
    <div className="mh"><div><h3>End instructor service</h3><p>{fullName(r.people, r.person_name)} · {r.technique} · Executive Director and Instructor Committee chair only</p></div><button type="button" className="x" onClick={onClose} aria-label="Close">×</button></div>
    <div className="mb"><div className="cert-grid mform evt-grid"><F l="Reason"><select className="fi" value={reason} onChange={(e) => setReason(e.target.value)}>{Object.entries(END_REASONS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></F><F l="Effective date"><input className="fi" type="date" value={date} onChange={(e) => setDate(e.target.value)} /></F>
      <div className="full evt-hint">Moves the record to Past, keeps the level and dates as history, removes the instructor role on the site, and is reported to the Board at the next monthly meeting (P&amp;P 3.2.4).</div></div></div>
    <div className="mf"><button type="button" className="b s-btn on-light sm" onClick={onClose}>Cancel</button><button type="button" className="b d-btn sm" onClick={async () => { if (!date) return toast('Choose a date'); const w = await endService(r, reason, date, who); if (w.error) return toast(friendly(w.error)); onDone(`Instructor service ended · ${fmtD(date)}`) }}>End instructor service</button></div>
  </div></div>
}
