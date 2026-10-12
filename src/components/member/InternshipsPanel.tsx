/* ----------------------------------------------------------------------------
 * Internships — Preceptors (approved people) · Interns · Sites (approved
 * places), matched where they match. Every consequential action is a
 * two-step lock-in with a date, stamped with who did it. School approvals
 * (preceptor × school × site × period) gate official pairings; locking the
 * exam or completing the internship ticks the person's certification
 * pathway with the same date and verifier.
 * -------------------------------------------------------------------------- */
import { friendlyError } from '@/lib/friendlyError'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useAccess } from '@/lib/queries/AccessProvider'
import { useToast } from '@/components/ui/Toast'
import { displayName } from '@/lib/access'
import {
  preceptors as loadPreceptors, interns as loadInterns, sites as loadSites, colleges as loadColleges, requirements as loadReqs, allLocations, notesFor, progressFor, searchPeople, practiceOffices,
  tickPreceptor, certifyPreceptor, savePreceptor, removePreceptor, saveSite, makeSite, createContact, updateContactSchool, saveIntern, removeIntern, pairIntern, unpairIntern, startInternship, tickIntern, completeInternship, addNote, uploadApprovalDoc, approvalDocUrl,
  PREC_CRITERIA, PREC_APPROVAL, INT_CRITERIA, fullName, initials, hasLevel2, advoLevel, LEVEL_LABEL, pathwayOf, pathwayKeys, precDone, precReady, intDone, intReady, isPaired, approvalStatus, approvalCovers, approvalLine, lapsedApprovals, recordClean, fmtD, fmtTs,
} from '@/lib/queries/internships'
import type { Preceptor, Intern, Site, College, Approval, Stamp, PersonLite, Note, Who, ProgressRow } from '@/lib/queries/internships'
import type { Requirement } from '@/lib/queries/certifications'
import { askConfirm } from './opsUi'

const today = () => new Date().toISOString().slice(0, 10)
function Pill({ kind = '', children, title }: { kind?: string; children: React.ReactNode; title?: string }) { return <span className={`cpill ${kind}`} title={title}>{children}</span> }
const statusPill = (st: ReturnType<typeof approvalStatus>) => <Pill kind={st === 'active' ? 'ok' : st === 'lapsed' ? 'bad' : 'warn'}>{st}</Pill>
function friendly(err: string): string {
  if (/row-level security/.test(err)) return 'You don’t have permission for that. Only the executive director and the Internship Committee chair can change internship records.'
  if (/preceptor_colleges_approval_unique/.test(err)) return 'That school approval (same school, site and start date) is already on this preceptor.'
  return friendlyError(err)
}
function F({ l, children, full = false, hint }: { l: string; children: React.ReactNode; full?: boolean; hint?: string }) {
  return <div className={full ? 'full' : ''}><label className="flabel">{l}</label>{children}{hint && <div className="evt-hint">{hint}</div>}</div>
}
function useEsc(onClose: () => void) { useEffect(() => { const k = (e: KeyboardEvent) => e.key === 'Escape' && onClose(); document.addEventListener('keydown', k); return () => document.removeEventListener('keydown', k) }, [onClose]) }

/** One criterion row with the two-step lock-in: tick → date + "Lock in" → stamped. */
function ChkRow({ id, label, done, pending, canEdit, auto, hint, onPend, onDate, onLock, onUntick }: {
  id: string; label: string; done?: Stamp; pending?: string; canEdit: boolean; auto?: 'ok' | 'need'; hint?: string
  onPend: () => void; onDate: (d: string) => void; onLock: () => void; onUntick: () => void
}) {
  if (auto) return <div className={`bchk ichk${auto === 'ok' ? ' done' : ''}`}><input type="checkbox" id={id} checked={auto === 'ok'} disabled readOnly /><label htmlFor={id}>{label}<small className={auto === 'ok' ? 'ok-txt' : ''}>{auto === 'ok' ? '✓ from the certification register · Level 2' : 'auto — needs Level 2 certification on the register'}</small></label><span className="auto">AUTO</span></div>
  if (done) return <div className="bchk ichk done"><input type="checkbox" id={id} checked disabled={!canEdit} onChange={onUntick} /><label htmlFor={id}>{label}<small className="ok-txt">✓ {fmtD(done.date)} · {done.name}</small></label><span /></div>
  if (pending !== undefined) return <div className="bchk ichk pending"><input type="checkbox" id={id} checked onChange={onUntick} /><label htmlFor={id}>{label}<small>Choose the date, then lock it in</small></label><span className="lock"><input type="date" value={pending} onChange={(e) => onDate(e.target.value)} /><button type="button" className="b p-btn sm" onClick={onLock}>Lock in</button></span></div>
  return <div className="bchk ichk"><input type="checkbox" id={id} checked={false} disabled={!canEdit} onChange={onPend} /><label htmlFor={id}>{label}{hint && <small>{hint}</small>}</label><span /></div>
}
/** The dated confirm strip used by Certify / Start / Complete / Pair. */
function LockStrip({ label, date, onDate, onLock, onCancel, lockText }: { label: string; date: string; onDate: (d: string) => void; onLock: () => void; onCancel: () => void; lockText: string }) {
  return <span className="ilock"><label>{label}</label><input type="date" className="fi" value={date} onChange={(e) => onDate(e.target.value)} /><button type="button" className="b p-btn sm" onClick={onLock}>{lockText}</button><button type="button" className="b s-btn on-light sm" onClick={onCancel}>Cancel</button></span>
}

export default function InternshipsPanel() {
  const toast = useToast()
  const { access, can } = useAccess()
  const who: Who = { name: displayName(access).replace(/,.*$/, ''), id: access.person?.id ?? null }
  const canManage = can('full_admin') || can('manage_internships')
  const [precs, setPrecs] = useState<Preceptor[]>([]); const [ints, setInts] = useState<Intern[]>([]); const [siteRows, setSiteRows] = useState<Site[]>([])
  const [cols, setCols] = useState<College[]>([]); const [reqs, setReqs] = useState<Requirement[]>([])
  const [loading, setLoading] = useState(true); const [error, setError] = useState<string | null>(null)
  const [view, setView] = useState<'preceptors' | 'interns' | 'sites'>('preceptors')
  const [pf, setPf] = useState<'all' | 'certified' | 'in_process'>('all'); const [inf, setInf] = useState<'all' | 'planned' | 'current' | 'past'>('all')
  const [q, setQ] = useState('')
  const [openList, setOpenList] = useState<Set<number>>(new Set())
  const [pending, setPending] = useState<Record<string, string>>({}); const [action, setAction] = useState<Record<string, string>>({})
  const [person, setPerson] = useState<PersonLite | null>(null); const [siteCard, setSiteCard] = useState<Site | null>(null)
  const [editPrec, setEditPrec] = useState<Preceptor | null | 'new'>(null); const [editInt, setEditInt] = useState<Intern | null | 'new'>(null); const [editSite, setEditSite] = useState<Site | null | 'new'>(null)
  const [pairing, setPairing] = useState<Intern | null>(null)

  const load = useCallback(async () => {
    const [p, i, s] = await Promise.all([loadPreceptors(), loadInterns(), loadSites()])
    const err = p.error || i.error || s.error
    setError(err ? `The internship records could not be read. ${friendlyError(err)}` : null)
    setPrecs(p.rows); setInts(i.rows); setSiteRows(s.rows); setLoading(false)
  }, [])
  useEffect(() => { void load(); void loadColleges().then(setCols); void loadReqs().then((r) => setReqs(r.rows)) }, [load])

  const site = useCallback((id: number | null | undefined) => siteRows.find((s) => s.id === id) ?? null, [siteRows])
  const college = useCallback((id: number) => cols.find((c) => c.id === id) ?? null, [cols])
  const prec = useCallback((id: number | null | undefined) => precs.find((p) => p.id === id) ?? null, [precs])
  const internsOf = useCallback((p: Preceptor) => ints.filter((i) => i.preceptor_id === p.id), [ints])
  const precsAt = useCallback((s: Site) => precs.filter((p) => (p.preceptor_sites ?? []).some((x) => x.location_id === s.id)), [precs])
  const internsAt = useCallback((s: Site) => ints.filter((i) => i.location_id === s.id), [ints])

  async function run(p: Promise<{ ok?: true; error?: string }>, okMsg?: string) {
    const r = await p
    if (r.error) { toast(friendly(r.error)); return false }
    await load(); if (okMsg) toast(okMsg); return true
  }
  // two-step helpers
  const pk = (kind: string, id: number, key: string) => `${kind}:${id}:${key}`
  const pend = (k: string) => setPending((s) => ({ ...s, [k]: today() }))
  const unpend = (k: string) => setPending((s) => { const n = { ...s }; delete n[k]; return n })
  async function lockPrec(p: Preceptor, field: 'progress' | 'approval', key: string) {
    const k = pk(field, p.id, key); const date = pending[k]; if (!date) return toast('Choose a date first')
    if (await run(tickPreceptor(p, field, key, true, date, who), `Locked in · ${fmtD(date)} · ${who.name}`)) unpend(k)
  }
  async function untickPrec(p: Preceptor, field: 'progress' | 'approval', key: string) {
    if (!(await askConfirm('Clear this item?', { body: 'The date and verifier will be removed.', ok: 'Clear', danger: true }))) return
    await run(tickPreceptor(p, field, key, false, '', who))
  }
  async function lockInt(i: Intern, key: string) {
    const k = pk('int', i.id, key); const date = pending[k]; if (!date) return toast('Choose a date first')
    const path = pathwayOf(i.people)
    if (await run(tickIntern(i, key, true, date, who, reqs), `Locked in · ${fmtD(date)} · ${who.name}`)) {
      unpend(k)
      if (key === 'int_exam' && path) setTimeout(() => toast(`⇄ Also ticked the Basic Examination on ${fullName(i.people, i.person_name)}’s ${path === 'student' ? 'Student' : 'Level 1'} pathway`), 700)
    }
  }
  async function untickInt(i: Intern, key: string) {
    if (!(await askConfirm('Clear this item?', { body: 'The date and verifier will be removed. (The certification pathway keeps what was already written there.)', ok: 'Clear', danger: true }))) return
    await run(tickIntern(i, key, false, '', who, reqs))
  }
  const act = (k: string, d = today()) => setAction((s) => ({ ...s, [k]: d }))
  const unact = (k: string) => setAction((s) => { const n = { ...s }; delete n[k]; return n })

  const cnt = useMemo(() => ({
    certified: precs.filter((p) => p.status === 'certified').length, in_process: precs.filter((p) => p.status === 'in_process').length,
    current: ints.filter((i) => i.status === 'current').length, planned: ints.filter((i) => i.status === 'planned').length, past: ints.filter((i) => i.status === 'past').length,
    approved: siteRows.filter((s) => s.internship_status === 'approved').length,
  }), [precs, ints, siteRows])
  const lq = q.trim().toLowerCase()

  if (loading) return <><h1>Internships</h1><div className="ma-sub">Reading preceptors, interns and sites…</div><div className="ma-panel"><p className="ma-empty">One moment.</p></div></>

  /* ---------------------------------------------------------------- preceptors */
  const precList = precs.filter((p) => (pf === 'all' || p.status === pf) && (!lq || `${fullName(p.people, p.person_name)} ${p.people?.practice_name ?? ''} ${(p.preceptor_sites ?? []).map((s) => site(s.location_id)?.name ?? '').join(' ')}`.toLowerCase().includes(lq)))
    .sort((a, b) => (a.status === b.status ? 0 : a.status === 'certified' ? -1 : 1) || (a.people?.last_name ?? a.person_name ?? '').localeCompare(b.people?.last_name ?? b.person_name ?? ''))
  const precRow = (p: Preceptor) => {
    const name = fullName(p.people, p.person_name); const done = precDone(p); const ready = precReady(p); const ak = `cert:${p.id}`
    const showList = pf === 'in_process' || openList.has(p.id); const lapsed = lapsedApprovals(p); const mine = internsOf(p)
    return <div key={p.id} className="irow">
      <div className="hd"><button type="button" className="pname" onClick={() => p.people && setPerson(p.people)}>{name}</button>
        {p.status === 'certified' ? <Pill kind="ok">Certified preceptor{p.certified_date ? ` · ${fmtD(p.certified_date)}` : ''}</Pill> : <Pill kind="info">In process · {done}/{PREC_CRITERIA.length}</Pill>}
        <Pill kind={recordClean(p) ? 'ok' : 'bad'}>{recordClean(p) ? 'Clean record' : 'Record flagged'}</Pill>
        <span className="sp">{canManage && <button type="button" className="b s-btn on-light xs" onClick={() => setEditPrec(p)}>Manage</button>}</span></div>
      {(lapsed.length > 0 || p.notes) && <div className="meta warn-txt">⚠ {[...lapsed.map((a) => `${college(a.college_id)?.short_name ?? 'School'} approval lapsed ${fmtD(a.expires_on)}`), p.notes].filter(Boolean).join(' · ')}</div>}
      <div className="meta"><span className="lbl">Sites</span>{(p.preceptor_sites ?? []).length ? (p.preceptor_sites ?? []).map((s) => { const st = site(s.location_id); return st ? <span key={s.location_id} className="cpill site link" onClick={() => setSiteCard(st)}>{st.name}{st.internship_status !== 'approved' ? ' · pending' : ''}</span> : null }) : <i>no approved site yet</i>}</div>
      <div className="meta"><span className="lbl">School approvals</span>{(p.preceptor_colleges ?? []).length ? '' : <i>none on file</i>}</div>
      {(p.preceptor_colleges ?? []).length > 0 && <div className="creds">{(p.preceptor_colleges ?? []).map((a) => { const st = site(a.location_id); return <div key={a.id} className="cred"><b>{college(a.college_id)?.short_name ?? college(a.college_id)?.name ?? '—'}</b><span>at {st ? <button type="button" className="plink" onClick={() => setSiteCard(st)}>{st.name}</button> : <i>site to be set</i>}</span><small>{approvalLine(a)}</small>{statusPill(approvalStatus(a))}{a.document_path ? <button type="button" className="link" onClick={async () => { const u = await approvalDocUrl(a); if (u) window.open(u, '_blank', 'noopener'); else toast('The paperwork could not be opened') }}>↓ paperwork</button> : <span />}</div> })}</div>}
      {p.status === 'certified' && <>
        <div className="roll"><b>{mine.length}</b> {mine.length === 1 ? 'intern' : 'interns'} — {['current', 'planned', 'past'].map((s) => `${mine.filter((i) => i.status === s).length} ${s === 'planned' ? 'interested' : s}`).join(' · ')}</div>
        {mine.length > 0 && <div className="ilist">{mine.sort((a, b) => ['current', 'planned', 'past'].indexOf(a.status) - ['current', 'planned', 'past'].indexOf(b.status)).map((i) => <div key={i.id} className="ili"><button type="button" className="plink" onClick={() => i.people && setPerson(i.people)}>{fullName(i.people, i.person_name)}</button><Pill kind={i.status === 'current' ? 'ok' : i.status === 'planned' ? 'warn' : ''}>{i.status === 'planned' ? 'interested' : i.status}</Pill><small>{site(i.location_id)?.name ?? ''}{i.location_id ? ' · ' : ''}{i.status === 'planned' ? (i.paired_at ? `paired ${fmtD(i.paired_at)}${i.start_date ? ' · est. start ' + fmtD(i.start_date) : ''}` : 'not yet paired') : i.status === 'current' ? `started ${fmtD(i.start_date)}` : `completed ${fmtD(i.completed_date)}`}</small></div>)}</div>}
      </>}
      {p.status === 'in_process' && pf !== 'in_process' && <div className="meta"><button type="button" className="link" onClick={() => setOpenList((s) => { const n = new Set(s); n.has(p.id) ? n.delete(p.id) : n.add(p.id); return n })}>{showList ? '▾ Hide checklist' : `▸ Show checklist · ${done} of ${PREC_CRITERIA.length} criteria`}</button></div>}
      {p.status === 'in_process' && showList && <div className="body">
        <div className="sec">Preceptor criteria <span className="r">P&P 7.1 · {done} of {PREC_CRITERIA.length}</span></div>
        <div className="iprog"><i style={{ width: `${Math.round(done / PREC_CRITERIA.length * 100)}%` }} /></div>
        {PREC_CRITERIA.map((c) => c.auto
          ? <ChkRow key={c.key} id={`p${p.id}_${c.key}`} label={c.label} auto={hasLevel2(p.people) ? 'ok' : 'need'} canEdit={false} onPend={() => {}} onDate={() => {}} onLock={() => {}} onUntick={() => {}} />
          : <ChkRow key={c.key} id={`p${p.id}_${c.key}`} label={c.label} done={p.progress?.[c.key]} pending={pending[pk('progress', p.id, c.key)]} canEdit={canManage} onPend={() => pend(pk('progress', p.id, c.key))} onDate={(d) => setPending((s) => ({ ...s, [pk('progress', p.id, c.key)]: d }))} onLock={() => void lockPrec(p, 'progress', c.key)} onUntick={() => p.progress?.[c.key] ? void untickPrec(p, 'progress', c.key) : unpend(pk('progress', p.id, c.key))} />)}
        <div className="sec">Approval <span className="r">P&P 3.6.4 · recorded for the registry; certification waits only on the five criteria</span></div>
        {PREC_APPROVAL.map((c) => <ChkRow key={c.key} id={`p${p.id}_${c.key}`} label={c.label} done={p.approval?.[c.key]} pending={pending[pk('approval', p.id, c.key)]} canEdit={canManage} onPend={() => pend(pk('approval', p.id, c.key))} onDate={(d) => setPending((s) => ({ ...s, [pk('approval', p.id, c.key)]: d }))} onLock={() => void lockPrec(p, 'approval', c.key)} onUntick={() => p.approval?.[c.key] ? void untickPrec(p, 'approval', c.key) : unpend(pk('approval', p.id, c.key))} />)}
        {canManage && <div className="acts">
          {ak in action
            ? <LockStrip label="Certified date" date={action[ak]!} onDate={(d) => act(ak, d)} onLock={async () => { if (await run(certifyPreceptor(p, action[ak]!, who), `${name} is now a certified preceptor · ${fmtD(action[ak])}`)) { unact(ak); setPf('certified') } }} onCancel={() => unact(ak)} lockText="Lock in & certify preceptor" />
            : <button type="button" className="b p-btn sm" disabled={!ready} onClick={() => act(ak)}>✓ Certify as preceptor</button>}
          {!ready && <span className="hint">Complete &amp; date all five criteria to enable certification.{!hasLevel2(p.people) ? ' Level 2 is read from the certification register — award it there.' : ''}</span>}
        </div>}
      </div>}
    </div>
  }

  /* ---------------------------------------------------------------- interns */
  const order: Record<string, number> = { current: 0, planned: 1, past: 2 }
  const ord = (st: string) => order[st] ?? 9
  const intList = ints.filter((i) => (inf === 'all' || i.status === inf) && (!lq || `${fullName(i.people, i.person_name)} ${i.people?.school ?? ''} ${i.preceptor_name ?? ''} ${site(i.location_id)?.name ?? ''}`.toLowerCase().includes(lq)))
    .sort((a, b) => (ord(a.status) - ord(b.status)) || (a.start_date ?? '9').localeCompare(b.start_date ?? '9'))
  const personPill = (p: PersonLite | null) => !p ? null : p.contact_type === 'student' && p.school ? <Pill>Student · {p.school.replace(/ of Chiropractic| University/, '')}{p.grad_year ? ` · grad ${p.grad_year}` : ''}</Pill> : p.contact_type === 'doctor' ? <Pill>Doctor</Pill> : null
  const internRow = (i: Intern) => {
    const name = fullName(i.people, i.person_name); const done = intDone(i); const ready = intReady(i); const ak = `int:${i.id}`; const path = pathwayOf(i.people)
    const pr = prec(i.preceptor_id); const st = site(i.location_id)
    return <div key={i.id} className={`irow ${i.status}`}>
      <div className="hd"><button type="button" className="pname" onClick={() => i.people && setPerson(i.people)}>{name}</button>{personPill(i.people)}{i.official === false && <Pill kind="warn" title="Institute-only — not by school approval">Unaffiliated</Pill>}
        <span className="sp">{canManage && <button type="button" className="b s-btn on-light xs" onClick={() => setEditInt(i)}>Manage</button>}</span></div>
      <div className="meta"><span className="lbl">Preceptor</span>{pr ? <button type="button" className="plink" onClick={() => pr.people && setPerson(pr.people)}>{fullName(pr.people, pr.person_name)}</button> : i.preceptor_name ? <span>{i.preceptor_name}</span> : <i className="warn-txt">none yet — looking for a home</i>}
        <span className="lbl ml">Site</span>{st ? <button type="button" className="plink" onClick={() => setSiteCard(st)}>{st.name}</button> : <i>—</i>}
        {(i.status !== 'planned' || i.paired_at) && <><span className="lbl ml">{i.status === 'planned' ? 'Est. start' : 'Started'}</span>{fmtD(i.start_date) || <i>not set</i>}</>}
        {i.end_date && i.status !== 'past' && <><span className="lbl ml">Est. end</span>{fmtD(i.end_date)}</>}</div>
      {i.status === 'past' ? <div className="body past">✓ Completed {fmtD(i.completed_date)}{i.certified_by ? ` · verified by ${i.certified_by}` : ''} · counts toward {i.people?.contact_type === 'student' ? 'Student' : 'Level 1'} certification.</div>
      : i.status === 'planned' ? <div className="body">
        {isPaired(i) ? <>
          <div className="sec">Paired <span className="r">the preceptor's record and this internship now travel together</span></div>
          <div className="tick ok"><i /><div>Paired with {pr ? fullName(pr.people, pr.person_name) : i.preceptor_name} at {st?.name ?? '—'}{i.paired_at && <small>✓ {fmtD(i.paired_at)} · {i.paired_by_name}</small>}</div></div>
          {canManage && <div className="acts">{ak in action
            ? <LockStrip label="Start date" date={action[ak]!} onDate={(d) => act(ak, d)} onLock={async () => { if (await run(startInternship(i, action[ak]!, who), `Internship started ${fmtD(action[ak])}${path ? ` · ${name} is now on the ${path === 'student' ? 'Student' : 'Level 1'} pathway` : ''}`)) { unact(ak); setInf('current') } }} onCancel={() => unact(ak)} lockText="Lock in & start internship" />
            : <><button type="button" className="b p-btn sm" onClick={() => act(ak, i.start_date ?? today())}>▶ Start internship</button><button type="button" className="b s-btn on-light sm" onClick={() => setPairing(i)}>Change pairing</button><span className="hint">Starting opens the three-item checklist{path ? ` and puts ${name} on the ${path === 'student' ? 'Student' : 'Level 1'} certification pathway` : ''}.</span></>}</div>}
        </> : <>
          <div className="sec">Not yet paired <span className="r">looking for a home</span></div>
          {canManage ? <div className="acts"><button type="button" className="b p-btn sm" onClick={() => setPairing(i)}>⚖ Pair with preceptor</button><span className="hint">Pairing checks the preceptor is certified with a clean record, the site is approved, and the school has approved that preceptor at that site — then locks the match in with a date and your name.</span></div> : <p className="ma-empty" style={{ padding: 0 }}>Waiting on the Internship Committee to pair this intern.</p>}
        </>}
      </div>
      : <div className="body">
        <div className="sec">Internship criteria <span className="r">P&P 7.2 · {done} of {INT_CRITERIA.length}{path ? ` · on the ${path === 'student' ? 'Student' : 'Level 1'} pathway` : ' · already certified, no pathway to advance'}</span></div>
        <div className="iprog"><i style={{ width: `${Math.round(done / INT_CRITERIA.length * 100)}%` }} /></div>
        {INT_CRITERIA.map((c) => <ChkRow key={c.key} id={`i${i.id}_${c.key}`} label={c.label} done={i.progress?.[c.key]} pending={pending[pk('int', i.id, c.key)]} canEdit={canManage} hint={c.sync === 'exam' && path && !i.progress?.[c.key] ? 'Locking this also ticks the exam on the certification pathway' : undefined} onPend={() => pend(pk('int', i.id, c.key))} onDate={(d) => setPending((s) => ({ ...s, [pk('int', i.id, c.key)]: d }))} onLock={() => void lockInt(i, c.key)} onUntick={() => i.progress?.[c.key] ? void untickInt(i, c.key) : unpend(pk('int', i.id, c.key))} />)}
        {canManage && <div className="acts">{ak in action
          ? <LockStrip label="Completion date" date={action[ak]!} onDate={(d) => act(ak, d)} onLock={async () => { if (await run(completeInternship(i, action[ak]!, who, reqs), `Internship completed ${fmtD(action[ak])} · ${who.name}`)) { unact(ak); setInf('past'); if (path) setTimeout(() => toast(`⇄ Also ticked the training pathway on ${name}’s ${path === 'student' ? 'Student' : 'Level 1'} pathway`), 700) } }} onCancel={() => unact(ak)} lockText="Lock in & complete internship" />
          : <><button type="button" className="b p-btn sm" disabled={!ready} onClick={() => act(ak)}>✓ Complete internship</button><span className="hint">{ready ? 'Completing ticks the training requirement on the certification pathway.' : 'Complete & date all three criteria.'}</span></>}</div>}
      </div>}
    </div>
  }

  /* ---------------------------------------------------------------- sites */
  const siteList = siteRows.filter((s) => !lq || `${s.name} ${s.address ?? ''} ${s.city ?? ''} ${s.state ?? ''}`.toLowerCase().includes(lq))
    .sort((a, b) => (a.internship_status === b.internship_status ? a.name.localeCompare(b.name) : a.internship_status === 'approved' ? -1 : 1))
  const siteRow = (s: Site) => {
    const ps = precsAt(s); const is = internsAt(s)
    const approvalsHere = precs.flatMap((p) => (p.preceptor_colleges ?? []).filter((a) => a.location_id === s.id).map((a) => ({ a, p })))
    return <div key={s.id} className="isite">
      <div><button type="button" className="pname" onClick={() => setSiteCard(s)}>{s.name}</button> <Pill kind={s.internship_status === 'approved' ? 'ok' : 'warn'}>{s.internship_status === 'approved' ? 'Approved site' : s.site_visit_date ? 'Site visit done · awaiting approval' : 'Pending site visit'}</Pill>
        <div className="addr">{[s.address, [s.city, s.state].filter(Boolean).join(', ')].filter(Boolean).join(' · ')}</div>
        <div className="who"><span className="lbl">Preceptors</span>{ps.length ? ps.map((p, n) => <span key={p.id}>{n > 0 && <span className="dot">·</span>}<button type="button" className="plink" onClick={() => p.people && setPerson(p.people)}>{fullName(p.people, p.person_name)}</button>{p.status !== 'certified' && <> <Pill kind="info">in process</Pill></>}</span>) : <i>none matched yet</i>}</div>
        <div className="who"><span className="lbl">School approvals here</span>{approvalsHere.length ? approvalsHere.map(({ a, p }) => <Pill key={a.id} kind={approvalStatus(a) === 'active' ? 'ok' : approvalStatus(a) === 'lapsed' ? 'bad' : 'warn'} title={`${fullName(p.people, p.person_name)} · ${approvalLine(a)}`}>{college(a.college_id)?.short_name ?? '—'} · {(p.people?.last_name ?? p.person_name ?? '').split(' ').pop()}</Pill>) : <i>none yet</i>}</div>
      </div>
      <div className="cnts"><b>{is.filter((i) => i.status === 'current').length}</b>active · {is.filter((i) => i.status === 'planned').length} interested · {is.filter((i) => i.status === 'past').length} completed</div>
    </div>
  }

  const search = (ph: string) => <div className="ctc-srow" style={{ gridTemplateColumns: '1fr' }}><div className="cert-search" style={{ margin: 0 }}>
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></svg>
    <input type="text" value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => e.key === 'Escape' && setQ('')} autoComplete="off" placeholder={ph} aria-label={ph} />
    {q && <button type="button" className="clr" aria-label="Clear search" onClick={() => setQ('')}>×</button>}</div></div>

  return (
    <>
      <div className="cert-head">
        <div><h1>Internships</h1><div className="ma-sub" style={{ marginBottom: 0, maxWidth: '80ch' }}>Preceptors are the approved people, sites are the approved places, and they are matched where they match. Every tick is a two-step lock-in recorded with who verified it and when.{!canManage && <> <Pill>view only</Pill></>}</div></div>
        <div className="cert-actions">{canManage && <><button type="button" className="b s-btn on-light sm" onClick={() => setEditPrec('new')}>+ Add preceptor</button><button type="button" className="b s-btn on-light sm" onClick={() => setEditSite('new')}>+ Add site</button><button type="button" className="b p-btn sm" onClick={() => setEditInt('new')}>+ Add intern</button></>}</div>
      </div>
      {error && <div className="cert-err" role="alert">{error}</div>}
      <div className="iseg" role="tablist">
        <button type="button" className={view === 'preceptors' ? 'on' : ''} onClick={() => { setView('preceptors'); setQ('') }}>Preceptors<span>{precs.length}</span></button>
        <button type="button" className={view === 'interns' ? 'on' : ''} onClick={() => { setView('interns'); setQ('') }}>Interns<span>{cnt.current + cnt.planned}</span></button>
        <button type="button" className={view === 'sites' ? 'on' : ''} onClick={() => { setView('sites'); setQ('') }}>Sites<span>{cnt.approved}</span></button>
      </div>

      {view === 'preceptors' && <>
        <div className="cert-tiles three">
          <button type="button" className={`cert-tile${pf === 'all' ? ' on' : ''}`} onClick={() => setPf('all')}><span>All preceptors</span><b>{precs.length}</b></button>
          <button type="button" className={`cert-tile${pf === 'certified' ? ' on' : ''}`} onClick={() => setPf('certified')}><span>Certified</span><b>{cnt.certified}</b></button>
          <button type="button" className={`cert-tile${pf === 'in_process' ? ' on' : ''}`} onClick={() => setPf('in_process')}><span>In process</span><b>{cnt.in_process}</b></button>
        </div>
        {search('Search preceptors by name, practice or site…')}
        <div className="bpanel"><div className="ph">{pf === 'all' ? 'Preceptors' : pf === 'certified' ? 'Certified preceptors' : 'Preceptors in process'}<span className="r">{pf === 'in_process' ? 'five criteria from P&P 7.1, then the approval steps from 3.6.4' : 'the approved people — their sites, school approvals and interns are listed on each'}</span></div>
          {precList.length ? precList.map(precRow) : <div className="bnodata">{precs.length ? 'Nobody matches.' : 'No preceptors yet. Add the first one from Contacts.'}</div>}</div>
      </>}
      {view === 'interns' && <>
        <div className="cert-tiles four">
          <button type="button" className={`cert-tile${inf === 'all' ? ' on' : ''}`} onClick={() => setInf('all')}><span>All interns</span><b>{ints.length}</b></button>
          <button type="button" className={`cert-tile${inf === 'planned' ? ' on' : ''}`} onClick={() => setInf('planned')}><span>Interested</span><b>{cnt.planned}</b></button>
          <button type="button" className={`cert-tile${inf === 'current' ? ' on' : ''}`} onClick={() => setInf('current')}><span>Current</span><b>{cnt.current}</b></button>
          <button type="button" className={`cert-tile${inf === 'past' ? ' on' : ''}`} onClick={() => setInf('past')}><span>Past</span><b>{cnt.past}</b></button>
        </div>
        {search('Search interns by name, school, preceptor or site…')}
        <div className="bpanel"><div className="ph">{inf === 'all' ? 'Interns' : inf === 'planned' ? 'Interested' : `${inf} interns`}<span className="r">{inf === 'past' ? 'completed internships count toward certification' : 'interested → paired → current (checklist) → past'}</span></div>
          {intList.length ? intList.map(internRow) : <div className="bnodata">{ints.length ? 'Nobody matches.' : 'No interns yet. Add the first one — a new name becomes a new contact.'}</div>}</div>
      </>}
      {view === 'sites' && <>
        {search('Search sites by practice, city or state…')}
        <div className="bpanel">{siteList.length ? siteList.map(siteRow) : <div className="bnodata">{siteRows.length ? 'No sites match.' : 'No internship sites yet. Add a preceptor’s practice, or flag an existing location.'}</div>}</div>
      </>}

      {person && <PersonCard p={person} precs={precs} ints={ints} sites={siteRows} cols={cols} reqs={reqs} who={who} canManage={canManage} onClose={() => setPerson(null)} onOpenSite={(s) => { setPerson(null); setSiteCard(s) }} onOpenPerson={(p) => setPerson(p)} onMakePreceptor={(p) => { setPerson(null); setEditPrec({ id: 0, person_id: p.id, person_name: fullName(p), status: 'in_process', certified_date: null, clean_record: true, progress: {}, approval: {}, notes: null, people: p, preceptor_sites: [], preceptor_colleges: [] }) }} />}
      {siteCard && <SiteCard s={siteCard} precs={precsAt(siteCard)} ints={internsAt(siteCard)} allPrecs={precs} cols={cols} canManage={canManage} onClose={() => setSiteCard(null)} onOpenPerson={(p) => { setSiteCard(null); setPerson(p) }} onManage={() => { const s = siteCard; setSiteCard(null); setEditSite(s) }} />}
      {editPrec && <PreceptorDialog p={editPrec === 'new' ? null : editPrec} sites={siteRows} cols={cols} who={who} onClose={() => setEditPrec(null)} onSaved={async (m, status) => { setEditPrec(null); await load(); setView('preceptors'); setPf(status); toast(m) }} onRemoved={async () => { setEditPrec(null); await load() }} />}
      {editInt && <InternDialog i={editInt === 'new' ? null : editInt} precs={precs} sites={siteRows} cols={cols} who={who} onClose={() => setEditInt(null)} onSaved={async (m, status) => { setEditInt(null); await load(); setView('interns'); setInf(status); toast(m) }} onRemoved={async () => { setEditInt(null); await load() }} />}
      {editSite && <SiteDialog s={editSite === 'new' ? null : editSite} precs={precs} onClose={() => setEditSite(null)} onSaved={async (m) => { setEditSite(null); await load(); setView('sites'); toast(m) }} />}
      {pairing && <PairDialog i={pairing} precs={precs.filter((p) => p.status === 'certified')} sites={siteRows} cols={cols} who={who} onClose={() => setPairing(null)} onSaved={async (m) => { setPairing(null); await load(); toast(m) }} />}
    </>
  )
}

/* ------------------------------------------------------------ person card -- */
export function PersonCard({ p, precs, ints, sites, cols, reqs, who, canManage, onClose, onOpenSite, onOpenPerson, onMakePreceptor }: {
  p: PersonLite; precs: Preceptor[]; ints: Intern[]; sites: Site[]; cols: College[]; reqs: Requirement[]; who: Who; canManage: boolean
  onClose: () => void; onOpenSite: (s: Site) => void; onOpenPerson: (p: PersonLite) => void; onMakePreceptor: (p: PersonLite) => void
}) {
  const toast = useToast()
  useEsc(onClose)
  const [notes, setNotes] = useState<Note[]>([]); const [prog, setProg] = useState<ProgressRow[]>([]); const [txt, setTxt] = useState('')
  useEffect(() => { void notesFor(p.id).then(setNotes); void progressFor(p.id).then(setProg) }, [p.id])
  const pr = precs.find((x) => x.person_id === p.id); const engagements = ints.filter((i) => i.person_id === p.id)
  const path = engagements.length ? pathwayOf(p) : (p.target_cert_level === 'student' || p.target_cert_level === 'level_1' ? p.target_cert_level : null)
  const site = (id: number | null | undefined) => sites.find((s) => s.id === id) ?? null
  const college = (id: number) => cols.find((c) => c.id === id)
  const level = advoLevel(p)
  const internsOf = pr ? ints.filter((i) => i.preceptor_id === pr.id) : []
  const tick = (ok: boolean, label: string, sub?: string | null, sync?: boolean) => <div className={`tick${ok ? ' ok' : ''}`}><i /><div>{label}{sub && <small className={sync ? 'sync' : ''}>{sub}</small>}</div></div>
  async function saveNote() { const t = txt.trim(); if (!t) return; const r = await addNote(p.id, t, who); if (r.error) return toast(friendly(r.error)); setTxt(''); setNotes(await notesFor(p.id)); toast('Note added') }
  return (
    <div className="cert-veil" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="cert-modal ctc-card bdir" role="dialog" aria-modal="true">
        <div className="ctc-top"><div className="av">{initials(p)}</div>
          <div style={{ flex: 1 }}><h3>{fullName(p)}</h3>
            <div className="ti">{p.contact_type === 'student' ? `Student${p.school ? ' · ' + p.school : ''}${p.grad_year ? ' · est. graduation ' + p.grad_year : ''}` : [p.practice_name, [p.practice_city, p.practice_state].filter(Boolean).join(', ')].filter(Boolean).join(' · ')}</div>
            <div className="ctc-chips">{pr && <Pill kind={pr.status === 'certified' ? 'ok' : 'warn'}>{pr.status === 'certified' ? 'Certified preceptor' : 'Preceptor in process'}</Pill>}{engagements[0] && <Pill>Intern · {engagements[0].status === 'planned' ? 'interested' : engagements[0].status}</Pill>}{level !== 'none' && <Pill kind="gold">{LEVEL_LABEL[level]}</Pill>}{/(active|current|good)/.test(p.membership_status ?? '') && <Pill>Member</Pill>}</div></div>
          <button type="button" className="x" onClick={onClose} aria-label="Close">×</button></div>
        <div className="ctc-body">
          <div className="sec">Contact</div>
          <div className="kv">{p.email && <><span>Email</span><div>{p.email}</div></>}{p.practice_name && <><span>Practice</span><div>{p.practice_name}{p.practice_city ? ` · ${p.practice_city}, ${p.practice_state ?? ''}` : ''}</div></>}{p.school && <><span>School</span><div>{p.school}{p.grad_year ? ` · grad ${p.grad_year}` : ''}</div></>}</div>
          {pr && <>
            <div className="sec">Preceptor record <span className="r">{pr.status === 'certified' ? `certified ${fmtD(pr.certified_date)}` : `${precDone(pr)} of ${PREC_CRITERIA.length} criteria`}</span></div>
            <div className="kv"><span>Sites</span><div>{(pr.preceptor_sites ?? []).length ? (pr.preceptor_sites ?? []).map((s, n) => { const st = site(s.location_id); return st ? <span key={s.location_id}>{n > 0 ? ', ' : ''}<button type="button" className="plink" onClick={() => onOpenSite(st)}>{st.name}</button></span> : null }) : <i>none yet</i>}</div>
              <span>Record</span><div className={recordClean(pr) ? 'ok-txt' : 'warn-txt'}>{recordClean(pr) ? 'Clean record with schools and the Institute' : 'Flagged — ' + [...lapsedApprovals(pr).map((a) => `${college(a.college_id)?.short_name ?? 'School'} approval lapsed ${fmtD(a.expires_on)}`), pr.notes].filter(Boolean).join(' · ')}</div></div>
            <div className="sec">School approvals <span className="r">one per school × site, each with its own period</span></div>
            {(pr.preceptor_colleges ?? []).length ? (pr.preceptor_colleges ?? []).map((a) => <div key={a.id} className="il"><span><b>{college(a.college_id)?.name ?? '—'}</b> <small>· {site(a.location_id)?.name ?? 'site to be set'}</small></span><span>{statusPill(approvalStatus(a))} <small>{approvalLine(a)}</small></span></div>) : <div className="il"><i>None on file</i></div>}
            <div style={{ marginTop: 10 }}>{PREC_CRITERIA.map((c) => { const d = c.auto ? (hasLevel2(p) ? { date: '', name: 'from the certification register' } : null) : pr.progress?.[c.key]; return <div key={c.key}>{tick(!!d, c.label, d ? `${d.date ? fmtD(d.date) + ' · ' : ''}${d.name}` : null)}</div> })}
              {PREC_APPROVAL.map((c) => { const d = pr.approval?.[c.key]; return <div key={c.key}>{tick(!!d, c.label, d ? `${fmtD(d.date)} · ${d.name}` : null)}</div> })}</div>
            <div className="sec">Interns with {p.first_name} <span className="r">{internsOf.length}</span></div>
            {internsOf.length ? internsOf.map((i) => <div key={i.id} className="il"><span><button type="button" className="plink" onClick={() => i.people && onOpenPerson(i.people)}>{fullName(i.people, i.person_name)}</button> <small>· {site(i.location_id)?.name ?? ''}</small></span><small>{i.status === 'planned' ? (i.start_date ? 'est. start ' + fmtD(i.start_date) : 'interested') : i.status === 'current' ? 'started ' + fmtD(i.start_date) : 'completed ' + fmtD(i.completed_date)}</small></div>) : <div className="il"><i>No interns yet</i></div>}
          </>}
          {engagements.map((i) => { const ip = precs.find((x) => x.id === i.preceptor_id); return <div key={i.id}>
            <div className="sec">Internship <span className="r">{i.status === 'planned' ? 'interested' : i.status}{ip ? ` · with ${fullName(ip.people, ip.person_name)} at ${site(i.location_id)?.name ?? ''}` : ' · no preceptor yet'}{i.official === false ? ' · unaffiliated' : ''}</span></div>
            <div className="kv"><span>{i.status === 'planned' ? 'Est. start' : 'Started'}</span><div>{fmtD(i.start_date) || <i>not set</i>}</div>{i.paired_at && <><span>Paired</span><div>{fmtD(i.paired_at)} · {i.paired_by_name}</div></>}{i.completed_date && <><span>Completed</span><div>{fmtD(i.completed_date)} · verified by {i.certified_by}</div></>}</div>
            <div style={{ marginTop: 8 }}>{INT_CRITERIA.map((c) => { const d = i.progress?.[c.key]; return <div key={c.key}>{tick(!!d, c.label, d ? `${fmtD(d.date)} · ${d.name}` : null)}</div> })}</div>
          </div> })}
          {path && <>
            <div className="sec">Certification pathway <span className="r">{path === 'student' ? 'Student certification' : 'Level 1'} · what the internship feeds</span></div>
            {reqs.filter((r) => r.target_level === path).map((r) => { const d = prog.find((x) => x.requirement_id === r.id && x.completed); const keys = pathwayKeys(path); const sync = !!d && (r.key === keys.exam || r.key === keys.training) && engagements.some((i) => i.progress?.int_exam || i.status === 'past'); return <div key={r.id}>{tick(!!d, r.label, d ? `${fmtD(d.completed_date)} · ${d.approved_by_name ?? ''}${sync ? ' · ⇄ from the internship' : ''}` : null, sync)}</div> })}
          </>}
          <div className="sec">Running notes <span className="r">per person, time-stamped</span></div>
          {canManage && <div className="ctc-noteform"><textarea value={txt} onChange={(e) => setTxt(e.target.value)} placeholder="Add a running note…" /><div className="r"><button type="button" className="b p-btn sm" onClick={() => void saveNote()}>Add note</button></div></div>}
          {notes.length ? notes.map((n) => <div key={n.id} className="ctc-note">{n.text}<small>{n.by_name ?? '—'} · {fmtTs(n.created_at)}</small></div>) : <p className="muted" style={{ marginTop: 8 }}>No notes yet.</p>}
        </div>
        <div className="mf evt-foot"><span><a className="b s-btn on-light sm" href="#leads">Open in Contacts</a></span><span style={{ display: 'flex', gap: 8 }}>{canManage && !pr && p.contact_type === 'doctor' && !engagements.length && <button type="button" className="b s-btn on-light sm" onClick={() => onMakePreceptor(p)}>Make a preceptor</button>}<button type="button" className="b s-btn on-light sm" onClick={onClose}>Close</button></span></div>
      </div>
    </div>
  )
}

/* -------------------------------------------------------------- site card -- */
function SiteCard({ s, precs, ints, allPrecs, cols, canManage, onClose, onOpenPerson, onManage }: { s: Site; precs: Preceptor[]; ints: Intern[]; allPrecs: Preceptor[]; cols: College[]; canManage: boolean; onClose: () => void; onOpenPerson: (p: PersonLite) => void; onManage: () => void }) {
  useEsc(onClose)
  const college = (id: number) => cols.find((c) => c.id === id)
  const approvals = allPrecs.flatMap((p) => (p.preceptor_colleges ?? []).filter((a) => a.location_id === s.id).map((a) => ({ a, p }))).sort((x, y) => x.a.college_id - y.a.college_id)
  const grp = (st: Intern['status'], label: string, dl: (i: Intern) => string) => { const l = ints.filter((i) => i.status === st); return <div className="grp"><div className="gh">{label} · {l.length}</div>{l.length ? l.map((i) => { const pr = allPrecs.find((p) => p.id === i.preceptor_id); return <div key={i.id} className="il"><span><button type="button" className="plink" onClick={() => i.people && onOpenPerson(i.people)}>{fullName(i.people, i.person_name)}</button>{pr && <small> · with {fullName(pr.people, pr.person_name)}</small>}</span><small>{dl(i)}</small></div> }) : <div className="il"><i>none</i></div>}</div> }
  return (
    <div className="cert-veil" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="cert-modal ctc-card bdir" role="dialog" aria-modal="true">
        <div className="ctc-top"><div className="av" style={{ fontSize: 12, fontFamily: 'var(--font-label)', fontWeight: 600 }}>SITE</div>
          <div style={{ flex: 1 }}><h3>{s.name}</h3><div className="ti">{[s.address, [s.city, s.state].filter(Boolean).join(', ')].filter(Boolean).join(' · ')}</div>
            <div className="ctc-chips"><Pill kind={s.internship_status === 'approved' ? 'ok' : 'warn'}>{s.internship_status === 'approved' ? 'Approved internship site' : 'Pending approval'}</Pill>{s.site_visit_date && <Pill>Site visit {fmtD(s.site_visit_date)}</Pill>}{s.approved_date && <Pill>Approved {fmtD(s.approved_date)}</Pill>}{s.is_seminar_venue && <Pill>Also a seminar venue</Pill>}</div></div>
          <button type="button" className="x" onClick={onClose} aria-label="Close">×</button></div>
        <div className="ctc-body">
          <div className="sec">Preceptors at this site <span className="r">approved people matched to this approved place</span></div>
          {precs.length ? precs.map((p) => <div key={p.id} className="il"><span><button type="button" className="plink" onClick={() => p.people && onOpenPerson(p.people)}>{fullName(p.people, p.person_name)}</button></span><small>{p.status === 'certified' ? 'certified ' + fmtD(p.certified_date) : `in process · ${precDone(p)}/${PREC_CRITERIA.length}`}</small></div>) : <div className="il"><i>No preceptor matched to this site yet</i></div>}
          <div className="sec">School approvals at this site <span className="r">who is approved, with which school, for what period</span></div>
          {approvals.length ? approvals.map(({ a, p }) => <div key={a.id} className="il"><span><b>{college(a.college_id)?.name ?? '—'}</b> <small>· {fullName(p.people, p.person_name)}</small></span><span>{statusPill(approvalStatus(a))} <small>{approvalLine(a)}</small></span></div>) : <div className="il"><i>No school approvals yet</i></div>}
          <div className="sec">Interns <span className="r">active → interested → completed</span></div>
          {grp('current', 'Active', (i) => 'started ' + fmtD(i.start_date))}{grp('planned', 'Interested', (i) => i.start_date ? 'est. start ' + fmtD(i.start_date) : 'no start date')}{grp('past', 'Completed', (i) => 'completed ' + fmtD(i.completed_date))}
          {s.notes && <><div className="sec">Notes</div><div className="ctc-note">{s.notes}</div></>}
        </div>
        <div className="mf evt-foot"><span>{canManage && <button type="button" className="b s-btn on-light sm" onClick={onManage}>Manage site</button>}</span><button type="button" className="b s-btn on-light sm" onClick={onClose}>Close</button></div>
      </div>
    </div>
  )
}

/* -------------------------------------------------------- preceptor dialog -- */
type ApprovalDraft = Approval & { key: string }
function PreceptorDialog({ p, sites, cols, who, onClose, onSaved, onRemoved }: { p: Preceptor | null; sites: Site[]; cols: College[]; who: Who; onClose: () => void; onSaved: (m: string, status: 'certified' | 'in_process') => void; onRemoved: () => void }) {
  const toast = useToast()
  useEsc(onClose)
  const isNew = !p || p.id === 0
  const [pick, setPick] = useState<PersonLite | null>(p?.people ?? null); const [q, setQ] = useState(''); const [hits, setHits] = useState<PersonLite[]>([])
  const [status, setStatus] = useState<'in_process' | 'certified'>(p?.status ?? 'in_process'); const [clean, setClean] = useState(p?.clean_record !== false); const [notes, setNotes] = useState(p?.notes ?? '')
  const [siteIds, setSiteIds] = useState<number[]>((p?.preceptor_sites ?? []).map((s) => s.location_id))
  const [creds, setCreds] = useState<ApprovalDraft[]>((p?.preceptor_colleges ?? []).map((a) => ({ ...a, key: String(a.id) })))
  const [nc, setNc] = useState<{ college_id: string; location_id: string; approved_on: string; expires_on: string }>({ college_id: '', location_id: '', approved_on: '', expires_on: '' })
  const [newSite, setNewSite] = useState(true); const [offices, setOffices] = useState<{ id: number; name: string | null; address: string | null; city: string | null; state: string | null; phone: string | null }[]>([])
  const [saving, setSaving] = useState(false); const [docFor, setDocFor] = useState<ApprovalDraft | null>(null)
  useEffect(() => { if (pick || q.trim().length < 2) { setHits([]); return } const h = setTimeout(() => { void searchPeople(q, true).then(setHits) }, 200); return () => clearTimeout(h) }, [q, pick])
  useEffect(() => { if (pick) void practiceOffices(pick.id).then(setOffices); else setOffices([]) }, [pick])
  const practiceMissing = !!pick && !!pick.practice_name && !sites.some((s) => s.name.toLowerCase() === (pick.practice_name ?? '').toLowerCase())
  const college = (id: number) => cols.find((c) => c.id === id)
  function addCred() {
    if (!nc.college_id) return toast('Pick a school')
    setCreds((c) => [...c, { key: 'n' + Date.now(), college_id: Number(nc.college_id), location_id: nc.location_id ? Number(nc.location_id) : null, approved_on: nc.approved_on || null, expires_on: nc.expires_on || null }])
    setNc({ college_id: '', location_id: nc.location_id, approved_on: '', expires_on: '' })
  }
  async function save() {
    if (!pick) return toast('Pick a doctor first')
    setSaving(true)
    let ids = [...siteIds]
    if (isNew && practiceMissing && newSite) {
      const off = offices[0]
      const r = await saveSite(null, { name: pick.practice_name ?? '', address: off?.address ?? '', city: off?.city ?? pick.practice_city ?? '', state: off?.state ?? pick.practice_state ?? '', phone: off?.phone ?? '', person_id: pick.id, internship_status: 'pending', site_visit_date: '', notes: '' }, null)
      if (r.error) { setSaving(false); return toast(friendly(r.error)) }
      if (r.id) { ids.push(r.id); setCreds((c) => c.map((x) => (x.location_id ? x : { ...x, location_id: r.id! }))) }
    }
    const approvals = creds.map((c) => ({ id: c.id, college_id: c.college_id, location_id: c.location_id ?? (ids.length === 1 ? ids[0]! : null), approved_on: c.approved_on, expires_on: c.expires_on, notes: c.notes ?? null }))
    const r = await savePreceptor(isNew ? null : p!.id, { person: pick, status, clean_record: clean, notes, siteIds: ids, approvals }, isNew ? null : p, who)
    setSaving(false)
    if (r.error) return toast(friendly(r.error))
    onSaved(isNew ? `${fullName(pick)} added as a preceptor` : 'Preceptor saved', status)
  }
  async function uploadDoc(a: ApprovalDraft, file: File) {
    if (!a.id) return toast('Save the preceptor first, then attach the paperwork to the saved approval')
    const r = await uploadApprovalDoc(a, file); if (r.error) return toast(friendly(r.error))
    setCreds((c) => c.map((x) => (x.key === a.key ? { ...x, document_path: 'uploaded', document_name: file.name } : x))); toast('Paperwork attached'); setDocFor(null)
  }
  return (
    <div className="cert-veil" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="cert-modal wide" role="dialog" aria-modal="true">
        <div className="mh"><div><h3>{isNew ? 'Add preceptor' : 'Manage preceptor'}</h3><p>Internship Committee only · a preceptor is a doctor already in Contacts</p></div><button type="button" className="x" onClick={onClose} aria-label="Close">×</button></div>
        <div className="mb"><div className="cert-grid mform evt-grid">
          <div className="full"><label className="flabel">Doctor</label>
            {pick ? <div className="ipicked"><b>{fullName(pick)}</b><span>{pick.practice_name ?? ''}</span>{hasLevel2(pick) ? <Pill kind="ok">Level 2</Pill> : <Pill kind="warn">Not Level 2 yet</Pill>}{isNew && <button type="button" className="x" onClick={() => setPick(null)} aria-label="Change">×</button>}</div>
              : <div className="iwho"><input className="fi" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Type a last name…" autoComplete="off" />{hits.length > 0 && <div className="who-list">{hits.map((h) => <div key={h.id} onClick={() => { setPick(h); setQ('') }}><b>{fullName(h)}</b> <small>· {h.practice_name ?? ''} · {LEVEL_LABEL[advoLevel(h)]}</small></div>)}</div>}{q.trim().length >= 2 && !hits.length && <div className="evt-hint">No doctor matches — add them in Contacts first.</div>}</div>}</div>
          <F l="Status"><select className="fi" value={status} onChange={(e) => setStatus(e.target.value as 'in_process' | 'certified')}><option value="in_process">In process</option><option value="certified">Certified</option></select></F>
          <F l="Record"><label className="evt-tog" style={{ marginTop: 0 }}><input type="checkbox" checked={clean} onChange={(e) => setClean(e.target.checked)} /><span><b>Clean record</b><small>with schools and the Institute (lapsed school approvals flag it on their own)</small></span></label></F>
          <div className="full"><label className="flabel">Sites this preceptor works at</label>
            <div className="ctc-chk">{sites.map((s) => <label key={s.id} className={siteIds.includes(s.id) ? 'on' : ''}><input type="checkbox" checked={siteIds.includes(s.id)} onChange={(e) => setSiteIds((ids) => e.target.checked ? [...ids, s.id] : ids.filter((x) => x !== s.id))} />{s.name}<small style={{ marginLeft: 'auto', color: 'var(--color-content-muted)' }}>{s.internship_status === 'approved' ? s.city ?? '' : 'pending'}</small></label>)}</div>
            {isNew && practiceMissing && <label className="evt-tog" style={{ marginTop: 8 }}><input type="checkbox" checked={newSite} onChange={(e) => setNewSite(e.target.checked)} /><span><b>Add {pick?.practice_name} as a new site</b><small>pending site visit · the practice from their contact record, entered once</small></span></label>}</div>
          <div className="full"><label className="flabel">School approvals — one line per school × site, with the period from the paperwork</label>
            {creds.length > 0 && <div className="creds edit">{creds.map((c) => <div key={c.key} className="cred"><b>{college(c.college_id)?.short_name ?? college(c.college_id)?.name ?? '—'}</b><span>at {c.location_id ? sites.find((s) => s.id === c.location_id)?.name ?? '—' : <i>site to be set</i>}</span><small>{approvalLine(c)}</small>{statusPill(approvalStatus(c))}<span className="cacts">{c.id ? (c.document_path ? <small title={c.document_name ?? ''}>📎 attached</small> : <button type="button" className="link" onClick={() => setDocFor(c)}>attach</button>) : null}<button type="button" className="x" title="Remove" onClick={() => setCreds((cs) => cs.filter((x) => x.key !== c.key))}>×</button></span></div>)}</div>}
            {docFor && <div className="icredadd" style={{ gridTemplateColumns: '1fr auto' }}><input type="file" className="fi" onChange={(e) => { const f = e.target.files?.[0]; if (f) void uploadDoc(docFor, f) }} /><button type="button" className="b s-btn on-light sm" onClick={() => setDocFor(null)}>Cancel</button></div>}
            <div className="icredadd hdr"><span>School</span><span>Site</span><span>Approved on</span><span>Expires</span><span /></div>
            <div className="icredadd">
              <select className="fi" value={nc.college_id} onChange={(e) => setNc({ ...nc, college_id: e.target.value })}><option value="">School…</option>{cols.map((c) => <option key={c.id} value={c.id}>{c.short_name ?? c.name}</option>)}</select>
              <select className="fi" value={nc.location_id} onChange={(e) => setNc({ ...nc, location_id: e.target.value })}><option value="">Site to be set</option>{sites.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select>
              <input className="fi" type="date" value={nc.approved_on} onChange={(e) => setNc({ ...nc, approved_on: e.target.value })} title="Approved on" />
              <input className="fi" type="date" value={nc.expires_on} onChange={(e) => setNc({ ...nc, expires_on: e.target.value })} title="Expires" />
              <button type="button" className="b s-btn on-light sm" onClick={addCred}>+ Add</button></div>
            <div className="evt-hint">Leave the dates blank while the school's approval is pending; attach the paperwork once it comes back (after saving).</div></div>
          <F l="Notes" full><textarea className="fi" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Anything the committee should know" /></F>
        </div></div>
        <div className="mf evt-foot"><span>{!isNew && <button type="button" className="b d-btn sm" onClick={async () => { if (!(await askConfirm('Remove this preceptor record?', { body: 'Their interns keep their history. This cannot be undone.', ok: 'Remove preceptor', danger: true }))) return; const r = await removePreceptor(p!.id); if (r.error) return toast(friendly(r.error)); onRemoved() }}>Remove preceptor</button>}</span><span style={{ display: 'flex', gap: 8 }}><button type="button" className="b s-btn on-light sm" onClick={onClose}>Cancel</button><button type="button" className="b p-btn sm" disabled={saving} onClick={() => void save()}>{saving ? 'Saving…' : isNew ? 'Add preceptor' : 'Save'}</button></span></div>
      </div>
    </div>
  )
}

/* ------------------------------------------------------------ intern dialog -- */
function InternDialog({ i, precs, sites, cols, who, onClose, onSaved, onRemoved }: { i: Intern | null; precs: Preceptor[]; sites: Site[]; cols: College[]; who: Who; onClose: () => void; onSaved: (m: string, status: 'planned' | 'current' | 'past') => void; onRemoved: () => void }) {
  const toast = useToast()
  useEsc(onClose)
  const [pick, setPick] = useState<PersonLite | null>(i?.people ?? null); const [q, setQ] = useState(''); const [hits, setHits] = useState<PersonLite[]>([]); const [newName, setNewName] = useState<string | null>(null)
  const [type, setType] = useState<'student' | 'doctor'>((i?.people?.contact_type === 'doctor' ? 'doctor' : 'student')); const [schoolId, setSchoolId] = useState<string>(i?.people?.school_id ? String(i.people.school_id) : (cols.find((c) => c.name === i?.people?.school)?.id.toString() ?? '')); const [grad, setGrad] = useState<string>(i?.people?.grad_year ? String(i.people.grad_year) : '')
  const certified = precs.filter((p) => p.status === 'certified' || p.id === i?.preceptor_id)
  const [precId, setPrecId] = useState<string>(i?.preceptor_id ? String(i.preceptor_id) : ''); const pr = precs.find((p) => String(p.id) === precId) ?? null
  const siteOpts = pr ? (pr.preceptor_sites ?? []).map((s) => sites.find((x) => x.id === s.location_id)).filter((x): x is Site => !!x) : []
  const [locId, setLocId] = useState<string>(i?.location_id ? String(i.location_id) : '')
  useEffect(() => { if (!siteOpts.some((s) => String(s.id) === locId)) setLocId(siteOpts[0] ? String(siteOpts[0].id) : '') }, [precId]) // eslint-disable-line react-hooks/exhaustive-deps
  const [status, setStatus] = useState<'planned' | 'current' | 'past'>(i?.status ?? 'planned'); const [start, setStart] = useState(i?.start_date ?? ''); const [end, setEnd] = useState(i?.end_date ?? ''); const [official, setOfficial] = useState(i?.official !== false)
  const [saving, setSaving] = useState(false)
  useEffect(() => { if (pick || q.trim().length < 2) { setHits([]); return } const h = setTimeout(() => { void searchPeople(q).then(setHits) }, 200); return () => clearTimeout(h) }, [q, pick])
  useEffect(() => { if (pick && !i) { setType(pick.contact_type === 'doctor' ? 'doctor' : 'student'); setSchoolId(pick.school_id ? String(pick.school_id) : (cols.find((c) => c.name === pick.school)?.id.toString() ?? '')); setGrad(pick.grad_year ? String(pick.grad_year) : '') } }, [pick, i, cols])
  async function save() {
    let person = pick
    const school = cols.find((c) => String(c.id) === schoolId) ?? null; const gy = grad ? Number(grad) : null
    setSaving(true)
    if (!person && newName) { const r = await createContact(newName, type, school, gy); if (r.error || !r.person) { setSaving(false); return toast(friendly(r.error ?? 'could not add the contact')) } person = r.person }
    if (!person) { setSaving(false); return toast('Pick or add the intern first') }
    if (pick) { const r = await updateContactSchool(person.id, type, school, gy); if (r.error) { setSaving(false); return toast(friendly(r.error)) } }
    const r = await saveIntern(i?.id ?? null, { person: { ...person, contact_type: type, school: school?.name ?? null, school_id: school?.id ?? null, grad_year: gy }, preceptor: pr, location_id: locId ? Number(locId) : null, status, start_date: start, end_date: end, official }, who)
    setSaving(false)
    if (r.error) return toast(friendly(r.error))
    onSaved(i ? 'Intern saved' : `${fullName(person)} added as an intern`, status)
  }
  return (
    <div className="cert-veil" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="cert-modal wide" role="dialog" aria-modal="true">
        <div className="mh"><div><h3>{i ? 'Manage intern' : 'Add intern'}</h3><p>Internship Committee only · interns are contacts too; a new name becomes a new contact</p></div><button type="button" className="x" onClick={onClose} aria-label="Close">×</button></div>
        <div className="mb"><div className="cert-grid mform evt-grid">
          <div className="full"><label className="flabel">Intern</label>
            {pick || newName ? <div className="ipicked"><b>{pick ? fullName(pick) : newName}</b><span>{pick?.school ?? pick?.practice_name ?? ''}</span>{newName && <Pill kind="info">new contact</Pill>}{!i && <button type="button" className="x" onClick={() => { setPick(null); setNewName(null) }} aria-label="Change">×</button>}</div>
              : <div className="iwho"><input className="fi" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Type a name…" autoComplete="off" />{q.trim().length >= 2 && <div className="who-list">{hits.map((h) => <div key={h.id} onClick={() => { setPick(h); setQ('') }}><b>{fullName(h)}</b> <small>· {h.school ?? h.practice_name ?? 'no details yet'}</small></div>)}<div className="new" onClick={() => { setNewName(q.trim()); setQ('') }}>+ Add “{q.trim()}” as a new contact</div></div>}</div>}</div>
          <F l="Contact type"><select className="fi" value={type} onChange={(e) => setType(e.target.value as 'student' | 'doctor')}><option value="student">Student</option><option value="doctor">Doctor</option></select></F>
          {type === 'student' ? <><F l="School"><select className="fi" value={schoolId} onChange={(e) => setSchoolId(e.target.value)}><option value="">School…</option>{cols.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></F><F l="Est. graduation year"><input className="fi" type="number" value={grad} onChange={(e) => setGrad(e.target.value)} placeholder="2028" /></F></>
            : <div className="full evt-hint">Doctor — school and graduation not needed.</div>}
          <F l="Preceptor (certified only)"><select className="fi" value={precId} onChange={(e) => setPrecId(e.target.value)}><option value="">None yet — looking for a home</option>{certified.map((p) => <option key={p.id} value={p.id}>{fullName(p.people, p.person_name)}{p.status !== 'certified' ? ' (in process)' : ''}</option>)}</select></F>
          <F l="Site">{siteOpts.length > 1 ? <select className="fi" value={locId} onChange={(e) => setLocId(e.target.value)}>{siteOpts.map((s) => <option key={s.id} value={s.id}>{s.name}{s.city ? ` · ${s.city}` : ''}</option>)}</select> : siteOpts.length === 1 && siteOpts[0] ? <input className="fi" value={`${siteOpts[0].name}${siteOpts[0].city ? ' · ' + siteOpts[0].city : ''}`} disabled readOnly /> : <input className="fi" value={pr ? 'This preceptor has no site yet' : '—'} disabled readOnly />}</F>
          <F l="Status"><select className="fi" value={status} onChange={(e) => setStatus(e.target.value as 'planned' | 'current' | 'past')}><option value="planned">Interested</option><option value="current">Current</option><option value="past">Past</option></select></F>
          <F l={status === 'planned' ? 'Estimated start' : 'Start date'}><input className="fi" type="date" value={start} onChange={(e) => setStart(e.target.value)} /></F>
          <F l="Estimated end"><input className="fi" type="date" value={end} onChange={(e) => setEnd(e.target.value)} /></F>
          <div className="full"><label className="evt-tog" style={{ marginTop: 4 }}><input type="checkbox" checked={official} onChange={(e) => setOfficial(e.target.checked)} /><span><b>Official internship — by approval of the intern's school</b><small>Untick for an unaffiliated, Institute-only internship.</small></span></label></div>
        </div></div>
        <div className="mf evt-foot"><span>{i && <button type="button" className="b d-btn sm" onClick={async () => { if (!(await askConfirm('Remove this internship record?', { body: 'This cannot be undone.', ok: 'Remove', danger: true }))) return; const r = await removeIntern(i.id); if (r.error) return toast(friendly(r.error)); onRemoved() }}>Remove</button>}</span><span style={{ display: 'flex', gap: 8 }}><button type="button" className="b s-btn on-light sm" onClick={onClose}>Cancel</button><button type="button" className="b p-btn sm" disabled={saving} onClick={() => void save()}>{saving ? 'Saving…' : i ? 'Save' : 'Add intern'}</button></span></div>
      </div>
    </div>
  )
}

/* ------------------------------------------------------------- pair dialog -- */
function PairDialog({ i, precs, sites, cols, who, onClose, onSaved }: { i: Intern; precs: Preceptor[]; sites: Site[]; cols: College[]; who: Who; onClose: () => void; onSaved: (m: string) => void }) {
  const toast = useToast()
  useEsc(onClose)
  const [precId, setPrecId] = useState<string>(i.preceptor_id ? String(i.preceptor_id) : (precs[0] ? String(precs[0].id) : ''))
  const pr = precs.find((p) => String(p.id) === precId) ?? null
  const siteOpts = pr ? (pr.preceptor_sites ?? []).map((s) => sites.find((x) => x.id === s.location_id)).filter((x): x is Site => !!x) : []
  const [locId, setLocId] = useState<string>(i.location_id ? String(i.location_id) : '')
  useEffect(() => { if (!siteOpts.some((s) => String(s.id) === locId)) setLocId(siteOpts[0] ? String(siteOpts[0].id) : '') }, [precId]) // eslint-disable-line react-hooks/exhaustive-deps
  const st = sites.find((s) => String(s.id) === locId) ?? null
  const [start, setStart] = useState(i.start_date ?? ''); const [date, setDate] = useState(i.paired_at ?? today()); const [official, setOfficial] = useState(i.official !== false)
  const school = cols.find((c) => c.id === i.people?.school_id) ?? cols.find((c) => c.name === i.people?.school) ?? null
  const asOf = start || today()
  const checks: { ok: boolean; text: string; hard: boolean }[] = [
    { ok: !!pr && pr.status === 'certified', text: `${pr ? fullName(pr.people, pr.person_name) : 'Preceptor'} is a certified preceptor${pr?.certified_date ? ' · ' + fmtD(pr.certified_date) : ''}`, hard: true },
    { ok: !!pr && recordClean(pr), text: pr && recordClean(pr) ? 'Clean record with schools and the Institute' : 'Record flagged — ' + (pr ? [...lapsedApprovals(pr).map((a) => `${cols.find((c) => c.id === a.college_id)?.short_name ?? 'school'} approval lapsed ${fmtD(a.expires_on)}`), pr.notes].filter(Boolean).join(' · ') : ''), hard: true },
    { ok: !!st && st.internship_status === 'approved', text: st ? `${st.name} is an approved internship site${st.approved_date ? ' · ' + fmtD(st.approved_date) : ''}` : 'No site chosen', hard: true },
  ]
  if (school && pr) {
    const cs = (pr.preceptor_colleges ?? []).filter((a) => a.college_id === school.id && a.location_id === (st?.id ?? -1))
    const live = cs.find((a) => approvalCovers(a, asOf)); const pend = cs.find((a) => !a.approved_on)
    checks.push({ ok: !!live, hard: official, text: live ? `${school.short_name ?? school.name} approval at ${st?.name ?? ''} covers the start date · ${fmtD(live.approved_on)} – ${live.expires_on ? fmtD(live.expires_on) : 'open'}` : pend ? `${school.short_name ?? school.name} approval at ${st?.name ?? ''} is still pending with the school` : cs.length ? `${school.short_name ?? school.name} approval at ${st?.name ?? ''} does not cover ${fmtD(asOf)}` : `No ${school.short_name ?? school.name} approval for ${fullName(pr.people, pr.person_name)} at ${st?.name ?? 'this site'}${official ? '' : ' — unaffiliated internship, Institute requirements only'}` })
    if (live?.expires_on && i.end_date && live.expires_on < i.end_date) checks.push({ ok: false, hard: false, text: `Approval ends ${fmtD(live.expires_on)}, before the estimated end ${fmtD(i.end_date)} — renew before then` })
  } else if (!school) checks.push({ ok: true, hard: false, text: i.people?.contact_type === 'student' ? 'No school on this intern’s record — set it under Manage to check the school approval' : 'Doctor intern — no college approval needed' })
  const hardOk = checks.filter((c) => c.hard).every((c) => c.ok)
  return (
    <div className="cert-veil" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="cert-modal" role="dialog" aria-modal="true">
        <div className="mh"><div><h3>Pair {fullName(i.people, i.person_name)} with a preceptor</h3><p>Internship Committee only · the preceptor's record and this internship must match before they are locked together</p></div><button type="button" className="x" onClick={onClose} aria-label="Close">×</button></div>
        <div className="mb"><div className="cert-grid mform evt-grid">
          <F l="Certified preceptor"><select className="fi" value={precId} onChange={(e) => setPrecId(e.target.value)}>{precs.map((p) => <option key={p.id} value={p.id}>{fullName(p.people, p.person_name)}</option>)}{!precs.length && <option value="">No certified preceptors yet</option>}</select></F>
          <F l="Site"><select className="fi" value={locId} onChange={(e) => setLocId(e.target.value)}>{siteOpts.map((s) => <option key={s.id} value={s.id}>{s.name}{s.city ? ` · ${s.city}` : ''}{s.internship_status !== 'approved' ? ' (pending)' : ''}</option>)}{!siteOpts.length && <option value="">No site on this preceptor</option>}</select></F>
          <F l="Estimated start"><input className="fi" type="date" value={start} onChange={(e) => setStart(e.target.value)} /></F>
          <F l="Pairing date"><input className="fi" type="date" value={date} onChange={(e) => setDate(e.target.value)} /></F>
          <div className="full"><label className="evt-tog" style={{ marginTop: 4 }}><input type="checkbox" checked={official} onChange={(e) => setOfficial(e.target.checked)} /><span><b>Official internship — by approval of the intern’s school (their requirements plus ours)</b><small>Untick for an unaffiliated, Institute-only internship. Same checklist, still counts toward certification, but the school is not approving it.</small></span></label></div>
          <div className="full"><label className="flabel">Match check</label>{checks.map((c, n) => <div key={n} className={`tick${c.ok ? ' ok' : c.hard ? ' bad' : ' warn'}`}><i /><div>{c.text}{!c.ok && !c.hard && <small>warning only</small>}</div></div>)}</div>
        </div></div>
        <div className="mf evt-foot"><span>{isPaired(i) && <button type="button" className="b d-btn sm" onClick={async () => { if (!(await askConfirm('Unpair this intern?', { body: 'The preceptor and site are cleared; the notes stay.', ok: 'Unpair', danger: true }))) return; const r = await unpairIntern(i); if (r.error) return toast(friendly(r.error)); onSaved('Unpaired') }}>Unpair</button>}</span><span style={{ display: 'flex', gap: 8 }}><button type="button" className="b s-btn on-light sm" onClick={onClose}>Cancel</button><button type="button" className="b p-btn sm" disabled={!hardOk || !pr || !st} onClick={async () => { if (!pr || !st) return; if (!date) return toast('Choose the pairing date'); const r = await pairIntern(i, pr, st.id, start || null, date, official, who); if (r.error) return toast(friendly(r.error)); onSaved(`Paired · ${fmtD(date)} · ${who.name}`) }}>Lock in &amp; pair</button></span></div>
      </div>
    </div>
  )
}

/* -------------------------------------------------------------- site dialog -- */
function SiteDialog({ s, precs, onClose, onSaved }: { s: Site | null; precs: Preceptor[]; onClose: () => void; onSaved: (m: string) => void }) {
  const toast = useToast()
  useEsc(onClose)
  const [v, setV] = useState({ name: s?.name ?? '', address: s?.address ?? '', city: s?.city ?? '', state: s?.state ?? '', phone: s?.phone ?? '', internship_status: (s?.internship_status ?? 'pending') as 'pending' | 'approved', site_visit_date: s?.site_visit_date ?? '', notes: s?.notes ?? '', person_id: s?.person_id ?? '' })
  const [others, setOthers] = useState<Site[]>([]); const [saving, setSaving] = useState(false)
  useEffect(() => { if (!s) void allLocations().then((all) => setOthers(all.filter((l) => !l.is_internship_site))) }, [s])
  const set = (k: keyof typeof v) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => setV({ ...v, [k]: e.target.value })
  async function save() {
    if (!v.name.trim()) return toast('Give the site a name')
    setSaving(true)
    const r = await saveSite(s?.id ?? null, { ...v, name: v.name.trim(), person_id: v.person_id || null }, s)
    setSaving(false)
    if (r.error) return toast(friendly(r.error))
    onSaved(s ? 'Site saved' : `${v.name.trim()} added · pending site visit`)
  }
  return (
    <div className="cert-veil" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="cert-modal" role="dialog" aria-modal="true">
        <div className="mh"><div><h3>{s ? 'Manage site' : 'Add internship site'}</h3><p>Internship Committee only · an approved place, the actual practice; preceptors are matched to it from their own record</p></div><button type="button" className="x" onClick={onClose} aria-label="Close">×</button></div>
        <div className="mb"><div className="cert-grid mform evt-grid">
          {!s && others.length > 0 && <F l="Or flag an existing location (seminar venue, college) as an internship site" full><select className="fi" defaultValue="" onChange={async (e) => { const id = Number(e.target.value); if (!id) return; const r = await makeSite(id); if (r.error) return toast(friendly(r.error)); onSaved(`${others.find((o) => o.id === id)?.name ?? 'Location'} is now an internship site · pending site visit`) }}><option value="">Choose an existing location…</option>{others.map((o) => <option key={o.id} value={o.id}>{o.name}{o.city ? ` · ${o.city}` : ''}</option>)}</select></F>}
          <F l="Practice / site name" full><input className="fi" value={v.name} onChange={set('name')} /></F>
          <F l="Address" full><input className="fi" value={v.address} onChange={set('address')} /></F>
          <F l="City"><input className="fi" value={v.city} onChange={set('city')} /></F>
          <F l="State"><input className="fi" value={v.state} onChange={set('state')} /></F>
          <F l="Phone"><input className="fi" value={v.phone} onChange={set('phone')} /></F>
          <F l="Whose practice"><select className="fi" value={v.person_id} onChange={set('person_id')}><option value="">—</option>{precs.filter((p) => p.person_id).map((p) => <option key={p.id} value={p.person_id!}>{fullName(p.people, p.person_name)}</option>)}</select></F>
          <F l="Status"><select className="fi" value={v.internship_status} onChange={set('internship_status')}><option value="pending">Pending approval</option><option value="approved">Approved</option></select></F>
          <F l="Site visit"><input className="fi" type="date" value={v.site_visit_date} onChange={set('site_visit_date')} /></F>
          <F l="Notes" full><textarea className="fi" value={v.notes} onChange={set('notes')} /></F>
          <div className="full evt-hint">Also a seminar venue? It is the same row in the locations list — tick it under Events → Locations; nothing is entered twice.</div>
        </div></div>
        <div className="mf"><button type="button" className="b s-btn on-light sm" onClick={onClose}>Cancel</button><button type="button" className="b p-btn sm" disabled={saving} onClick={() => void save()}>{saving ? 'Saving…' : s ? 'Save' : 'Add site'}</button></div>
      </div>
    </div>
  )
}
