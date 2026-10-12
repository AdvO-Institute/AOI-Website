/* ----------------------------------------------------------------------------
 * Members — the roster the Institute runs on.
 *
 * Four tiles filter it: All · Current · Recently expired · Inactive. Someone
 * who has died counts under Inactive and is labelled Deceased, listed in a
 * short section beneath the living. Every list is alphabetical by first name
 * and searchable. Names open the full contact card with a running notes log.
 * -------------------------------------------------------------------------- */
import { friendlyError } from '@/lib/friendlyError'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { inviteAllMembers, inviteMember, loginStatus, requestReset, type AccessReply, type InviteRow } from '@/lib/queries/access'
import { uploadPhotoFor } from '@/lib/queries/photo'
import { useAccess } from '@/lib/queries/AccessProvider'
import { useDensity } from '@/lib/density'
import { useToast } from '@/components/ui/Toast'
import { displayName } from '@/lib/access'
import {
  roster, state, tabOf, fullName, activeBoard, currentInstructor, advoLevel, otherCerts,
  saveProfile, createMember, addNote, addLocation, endInstructor, endBoard,
} from '@/lib/queries/members'
import type { Member, Profile } from '@/lib/queries/members'
import { Chips as PersonChips, chipsFor } from './PersonChips'
import { CERT_LABEL } from '@/lib/chips'
import { askConfirm, askForm, askText } from './opsUi'
import { personById, topCert, overrideCertification, LEVELS, RANK, type Person, type Level } from '@/lib/queries/certifications'

type Tab = 'all' | 'current' | 'recent' | 'inactive' | 'deceased'
// Deceased members keep their record but sit in their own tab, last, and out of All members.
const TABS: [Tab, string][] = [['all', 'All members'], ['current', 'Current'], ['recent', 'Recently expired'], ['inactive', 'Inactive'], ['deceased', 'Deceased']]
const LVL = CERT_LABEL
const fmt = (d?: string | null) => (d ? new Date(d.slice(0, 10) + 'T12:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '')
const byFirst = (a: Member, b: Member) => a.first_name.localeCompare(b.first_name, undefined, { sensitivity: 'base' }) || a.last_name.localeCompare(b.last_name, undefined, { sensitivity: 'base' })
const editIcon = <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" /></svg>
const Pill = ({ children, kind = '' }: { children: React.ReactNode; kind?: string }) => <span className={`cpill ${kind}`}>{children}</span>

function StatusPill({ p }: { p: Member }) {
  const s = state(p)
  if (s === 'deceased') return <span className="mpill dec">Deceased{p.deceased_on ? ` · ${p.deceased_on.slice(0, 4)}` : ''}</span>
  if (s === 'current') return <span className="mpill cur">Current{activeBoard(p) && !(p.membership_expires && p.membership_expires >= new Date().toISOString().slice(0, 10)) ? ' · director' : p.membership_expires ? ` · exp ${fmt(p.membership_expires)}` : ''}</span>
  if (s === 'recent') return <span className="mpill rec">Recently expired · {fmt(p.membership_expires)}</span>
  return <span className="mpill ina">Inactive{p.membership_expires ? ` · exp ${fmt(p.membership_expires)}` : ''}</span>
}
function Chips({ p }: { p: Member }) {
  return <div className="cert-chips" style={{ marginBottom: 0 }}><PersonChips list={chipsFor(p, advoLevel(p), otherCerts(p))} /></div>
}

export default function MembersPanel() {
  const toast = useToast()
  const { access, can } = useAccess()
  const me = displayName(access), meId = access.person?.id ?? null
  const canEdit = can('full_admin') || can('manage_leads') || can('board')
  const canInvite = can('full_admin') || can('board')
  const [invites, setInvites] = useState(false)
  const [rows, setRows] = useState<Member[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [tab, setTab] = useState<Tab>('all')
  const [q, setQ] = useState('')
  const [open, setOpen] = useState<string | null>(null)
  const [openEditing, setOpenEditing] = useState(false) // the pencil opens the card already in edit mode
  const show = (id: string, editing = false) => { setOpenEditing(editing); setOpen(id) }
  const [edit, setEdit] = useState<Member | 'new' | null>(null)
  /* Compact (one row per member) or comfortable (cards), remembered on this
   * device. Phones always get the cards. */
  const { compact, narrow, setDensity } = useDensity('aoi.members.density', canEdit ? 'compact' : 'comfortable')

  const load = useCallback(async () => {
    const r = await roster()
    setError(r.error ? `The roster could not be read. ${friendlyError(r.error)}` : null)
    setRows(r.rows); setLoading(false)
  }, [])
  useEffect(() => { void load() }, [load])
  // Last sign-in comes from the logins themselves, which only the access
  // function can read. Until it answers, a row just says whether a login exists.
  const [logins, setLogins] = useState<Record<string, { last_sign_in_at: string | null }> | null>(null)
  useEffect(() => { if (canInvite) void loginStatus().then((r) => setLogins(r?.logins ?? null)).catch(() => {}) }, [canInvite])
  const [sending, setSending] = useState<string | null>(null)
  async function rowInvite(p: Member) {
    if (!(await askConfirm(`Send ${p.first_name} ${p.last_name} the welcome letter?`, { body: `The “Your account is ready” email, with a link to choose a password, goes to ${p.email}.${p.auth_user_id ? ' Their current password keeps working until they choose a new one.' : ''}`, ok: 'Send welcome letter' }))) return
    setSending(p.id)
    const r = await inviteMember(p.id).catch((): AccessReply => ({ error: 'network' }))
    setSending(null)
    if (!r || r.error || r.ok === false) { toast('Could not send it: ' + String(r?.detail ?? r?.error ?? 'unknown').slice(0, 140)); return }
    toast(`Welcome letter emailed to ${r.email ?? p.email}`)
    await load()
  }
  async function rowReset(p: Member) {
    if (!p.email) return
    if (!(await askConfirm(`Send ${p.first_name} ${p.last_name} a password reset?`, { body: `An email with a link to choose a new password goes to ${p.email}. Their current password keeps working until they change it.`, ok: 'Send reset' }))) return
    setSending(p.id)
    const r = await requestReset(p.email).catch((): AccessReply => ({ error: 'network' }))
    setSending(null)
    toast(r?.ok ? `Password reset link emailed to ${p.email}` : 'Could not send it. Please try again in a moment.')
  }

  const counts = useMemo(() => { const c: Record<Tab, number> = { all: 0, current: 0, recent: 0, inactive: 0, deceased: 0 }; for (const p of rows) { const t = tabOf(p) as Tab; if (t !== 'deceased') c.all++; c[t]++ } return c }, [rows])
  const list = useMemo(() => {
    const t = q.trim().toLowerCase()
    return rows.filter((p) => (tab === 'all' ? tabOf(p) !== 'deceased' : tabOf(p) === tab) && (!t || [fullName(p), `${p.first_name} ${p.last_name}`, p.practice_name, p.email, p.practice_address, p.practice_city].filter(Boolean).some((v) => String(v).toLowerCase().includes(t)))).sort(byFirst)
  }, [rows, tab, q])

  function exportCsv() {
    const cols = ['Last', 'First', 'Credentials', 'Status', 'Member since', 'Expires', 'Email', 'Mobile', 'Office', 'Practice', 'Address', 'Website', 'Techniques', 'AdvO level', 'Board', 'Instructor']
    const csv = [cols.join(','), ...list.map((p) => [p.last_name, p.first_name, p.credentials, state(p), p.member_since, p.membership_expires, p.email, p.mobile_phone, p.office_phone, p.practice_name, p.practice_address, p.practice_website, (p.techniques ?? []).join('; '), LVL[advoLevel(p)] ?? '', (p.board_service ?? []).map((b) => `${b.term_label ?? ''} ${b.status ?? ''}`).join('; '), currentInstructor(p)?.level ?? ''].map((x) => `"${String(x ?? '').replace(/"/g, '""')}"`).join(','))].join('\n')
    const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' })); a.download = `members-${tab}-${new Date().toISOString().slice(0, 10)}.csv`; a.click(); URL.revokeObjectURL(a.href)
  }

  if (loading) return <><h1>Members</h1><div className="ma-sub">Reading the roster…</div><div className="ma-panel"><p className="ma-empty">One moment.</p></div></>
  const tabLabel = TABS.find(([k]) => k === tab)![1]
  /* When they last signed in: a date, 'never', or unknown until the access function answers. */
  const lastIn = (p: Member) => {
    if (!p.auth_user_id) return 'No login yet'
    const seen = logins?.[p.id]
    return !seen ? '—' : seen.last_sign_in_at ? fmt(seen.last_sign_in_at) : 'Never'
  }

  const phone = (p: Member) => p.mobile_phone ?? p.office_phone ?? p.practice_phone
  const certText = (p: Member) => chipsFor(p, advoLevel(p), otherCerts(p)).map((c) => c.label).join(' · ')
  const editBtn = (p: Member) => canEdit && <button type="button" className="evt-ic" title="Edit profile" aria-label={`Edit ${fullName(p)}`} onClick={(e) => { e.stopPropagation(); show(p.id, true) }}>{editIcon}</button>
  const row = (p: Member) => (
    <div className={`mem-row${p.deceased_on ? ' dead' : ''}`} key={p.id} role="button" tabIndex={0} onClick={() => show(p.id)} onKeyDown={(e) => e.key === 'Enter' && show(p.id)}>
      <span className="n">{fullName(p)}</span>
      <span className="w ph">{phone(p) ?? <i>—</i>}</span>
      <span className="w">{p.email ? <a href={`mailto:${p.email}`} onClick={(e) => e.stopPropagation()}>{p.email}</a> : <i>—</i>}</span>
      <span className="w">{certText(p) || <i>—</i>}</span>
      <span className="ac">{editBtn(p)}</span>
    </div>
  )
  const card = (p: Member) => (
    <div className={`cert-card mem-card${p.deceased_on ? ' dead' : ''}${canEdit ? ' has-acc' : ''}`} key={p.id}>
      <div>
      <div className="cert-nm"><a href="#" onClick={(e) => { e.preventDefault(); show(p.id) }}>{fullName(p)}</a><StatusPill p={p} /></div>
      <div className="mline">{[p.email ? <a key="e" href={`mailto:${p.email}`}>{p.email}</a> : null, p.mobile_phone, p.office_phone ?? p.practice_phone, p.practice_name].filter(Boolean).map((x, i, arr) => <span key={i}>{x}{i < arr.length - 1 ? ' · ' : ''}</span>)}</div>
      <Chips p={p} />
      </div>
      {canEdit && <div><button type="button" className="b s-btn on-light xs" onClick={() => show(p.id, true)}>✎ Edit</button></div>}
    </div>
  )
  const current = open ? rows.find((x) => x.id === open) ?? null : null

  return (
    <>
      <div className="cert-head">
        <div><h1>Members</h1><div className="ma-sub" style={{ marginBottom: 0, maxWidth: '80ch' }}>Paid members and current or former board members — {counts.all} total. The full prospect list is under Leads. Recently expired = lapsed within six months and reactivatable; Inactive = longer than that.</div></div>
        <div className="cert-actions">{canInvite && <button type="button" className="b s-btn on-light sm" onClick={() => setInvites(true)}>Invite members without a login</button>}{canEdit && <button type="button" className="b p-btn sm" onClick={() => setEdit('new')}>+ Add member</button>}<button type="button" className="b s-btn on-light sm" onClick={exportCsv}>↓ Export {tab === 'all' ? 'all' : tabLabel.toLowerCase()}</button></div>
      </div>
      {error && <div className="cert-err" role="alert">{error}</div>}
      <div className="cert-tiles">{TABS.map(([k, l]) => <button type="button" key={k} className={`cert-tile${tab === k ? ' on' : ''}`} onClick={() => setTab(k)} aria-pressed={tab === k}><span>{l}</span><b>{counts[k]}</b></button>)}</div>
      <div className="cert-search">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></svg>
        <input type="text" value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => e.key === 'Escape' && setQ('')} autoComplete="off" placeholder={`Search ${tab === 'all' ? 'members' : tabLabel.toLowerCase()} by name, practice or email…`} aria-label="Search this list" />
        {q && <button type="button" className="clr" aria-label="Clear search" onClick={() => setQ('')}>×</button>}
        {q && <div className="cnt">{list.length} of {counts[tab]} match “{q}”</div>}
      </div>
      {list.length === 0 && <div className="cert-card" style={{ textAlign: 'center', color: 'var(--color-content-muted)', padding: 30 }}>{q ? `No one in ${tabLabel} matches “${q}”.` : 'No one in this list.'}</div>}
      {list.length > 0 && <div className="evt-bar"><span className="cnt">{list.length} {list.length === 1 ? 'member' : 'members'}{q ? ` matching “${q}”` : ''} · alphabetical by first name</span>
        {!narrow && <div className="evt-segs"><div className="evt-seg"><button type="button" className={compact ? 'on' : ''} onClick={() => setDensity('compact')}>Compact</button><button type="button" className={!compact ? 'on' : ''} onClick={() => setDensity('comfortable')}>Comfortable</button></div></div>}</div>}
      {list.length > 0 && (compact
        ? <div className="mem-table"><div className="mem-row head"><span>Name</span><span>Phone</span><span>Email</span><span>Certification &amp; roles</span><span /></div>{list.map(row)}</div>
        : list.map(card))}

      {invites && <InviteAllDialog onClose={() => { setInvites(false); void load() }} />}
      {current && <ContactCard key={current.id} startEditing={openEditing} p={current} me={me} meId={meId} canEdit={canEdit} canInvite={canInvite} lastIn={lastIn(current)} sending={sending === current.id} onInvite={() => void rowInvite(current)} onReset={() => void rowReset(current)} onClose={() => setOpen(null)} onChanged={load} />}
      {edit && <EditDialog p={edit === 'new' ? null : edit} onClose={() => setEdit(null)} onSaved={async (m) => { setEdit(null); await load(); toast(m) }} />}
    </>
  )
}

/* A label and its value. Lives outside the card so an input inside it keeps focus while typing. */
function KV({ k, v }: { k: string; v: React.ReactNode }) { return <><span>{k}</span><div>{v ?? '—'}</div></> }
const fromMember = (p: Member): Record<string, string> => ({
  first_name: p.first_name ?? '', last_name: p.last_name ?? '', credentials: p.credentials ?? '', contact_type: p.contact_type ?? 'doctor',
  email: p.email ?? '', mobile_phone: p.mobile_phone ?? '', office_phone: p.office_phone ?? '', practice_website: p.practice_website ?? '',
  practice_name: p.practice_name ?? '', practice_address: p.practice_address ?? '', techniques: (p.techniques ?? []).join(', '),
  status: p.deceased_on ? 'deceased' : (p.membership_status ?? 'active'), deceased_on: p.deceased_on ?? '', member_since: p.member_since ?? '', membership_expires: p.membership_expires ?? '',
  photo_url: p.photo_url ?? '',
})

function ContactCard({ startEditing = false, p, me, meId, canEdit, canInvite, lastIn, sending, onInvite, onReset, onClose, onChanged }: { p: Member; me: string; meId: string | null; canEdit: boolean; canInvite: boolean; lastIn: string; sending: boolean; onInvite: () => void; onReset: () => void; onClose: () => void; onChanged: () => Promise<void>; startEditing?: boolean }) {
  const toast = useToast()
  const [note, setNote] = useState('')
  const noteCount = (p.contact_notes ?? []).length + (p.notes ? 1 : 0)
  type CardTab = 'profile' | 'business' | 'membership' | 'certification' | 'notes'
  const [tab, setTab] = useState<CardTab>('profile')
  const tabs: [CardTab, string][] = [['profile', 'Profile'], ['business', 'Business info'], ['membership', 'Membership & service'], ['certification', 'Certification'], ['notes', `Notes${noteCount ? ` (${noteCount})` : ''}`]]
  const canCert = useAccess().can('manage_certifications')
  /* Edit turns the fields of every tab into inputs in place; Save writes them all at once. */
  const canChange = canEdit || canCert
  const [editing, setEditing] = useState(startEditing && canChange)
  const editP = editing && canEdit // profile, business and membership fields
  const editC = editing && canCert // certification fields
  /* The certification record carries what the roster doesn't (the level being worked toward, interest), so it is read when editing starts. */
  const [rec, setRec] = useState<Person | null>(null)
  type CertForm = { level: Level; date: string; num: string; target: Level | ''; interest: boolean }
  const [cv, setCv] = useState<CertForm | null>(null)
  const [cv0, setCv0] = useState<CertForm | null>(null)
  useEffect(() => {
    if (!editC || rec) return
    void personById(p.id).then((r) => {
      if (!r.row) { setErr(r.error ? friendlyError(r.error) : 'Could not read their certification record.'); return }
      const c = topCert(r.row)
      const f: CertForm = { level: (c?.level as Level) ?? 'none', date: c?.cert_date ?? '', num: c?.certificate_number ?? '', target: (r.row.target_cert_level as Level) ?? '', interest: !!r.row.cert_interest }
      setRec(r.row); setCv(f); setCv0(f)
    })
  }, [editC, rec, p.id])
  const [v, setV] = useState<Record<string, string>>(() => fromMember(p))
  const [err, setErr] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const startEdit = () => { setV(fromMember(p)); setErr(null); setRec(null); setCv(null); setEditing(true) }
  const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setV((x) => ({ ...x, [k]: e.target.value }))
  const inp = (k: string, type = 'text', placeholder?: string) => <input className="fi" type={type} value={v[k] ?? ''} placeholder={placeholder} onChange={set(k)} aria-label={k.replace(/_/g, ' ')} />
  const ed = (k: string, view: React.ReactNode, type = 'text') => editP ? inp(k, type) : view
  const photoRef = useRef<HTMLInputElement>(null)
  const [photoBusy, setPhotoBusy] = useState(false)
  async function pickPhoto(file: File | undefined) {
    if (!file) return
    setPhotoBusy(true)
    const r = await uploadPhotoFor(p.id, file)
    setPhotoBusy(false)
    if (photoRef.current) photoRef.current.value = ''
    if (r.missing) return setErr('Photo uploads are being switched on — paste a link for now.')
    if (r.error) return setErr('The photo could not be uploaded. Try a JPG or PNG under 10 MB.')
    setV((x) => ({ ...x, photo_url: r.url ?? '' }))
  }
  async function save() {
    setErr(null)
    const certChanged = editC && rec && cv && JSON.stringify(cv) !== JSON.stringify(cv0)
    if (certChanged && cv.level !== 'none' && !cv.date) { setErr('An award date is required for an achieved level.'); setTab('certification'); return }
    if (certChanged && cv.target && RANK[cv.target]! <= RANK[cv.level]!) { setErr('“Working toward” must be above the achieved level.'); setTab('certification'); return }
    if (certChanged) {
      setSaving(true)
      const c = await overrideCertification(rec, cv.level, cv.date || null, cv.num || null, me, cv.target || null, cv.interest)
      setSaving(false)
      if (c.error) { setErr(friendlyError(c.error)); return }
    }
    if (!editP) { setEditing(false); await onChanged(); toast(certChanged ? 'Certification saved.' : 'No changes.'); return }
    if (!v.first_name?.trim() || !v.last_name?.trim()) { setErr('First and last name are required.'); setTab('profile'); return }
    const dead = v.status === 'deceased'
    const prof: Profile = { photo_url: v.photo_url || null, first_name: v.first_name.trim(), last_name: v.last_name.trim(), credentials: v.credentials || null, contact_type: v.contact_type ?? 'doctor', email: v.email || null, mobile_phone: v.mobile_phone || null, office_phone: v.office_phone || null, practice_website: v.practice_website || null, practice_name: v.practice_name || null, practice_address: v.practice_address || null, techniques: (v.techniques ?? '').split(',').map((x) => x.trim()).filter(Boolean), member_since: v.member_since || null, membership_expires: v.membership_expires || null, deceased_on: dead ? (v.deceased_on || new Date().toISOString().slice(0, 10)) : null }
    if (!dead) prof.membership_status = v.status
    setSaving(true); const r = await saveProfile(p.id, prof); setSaving(false)
    if (r.error) { setErr(friendlyError(r.error)); return }
    setEditing(false); await onChanged(); toast('Saved.')
  }
  const s = state(p), instr = currentInstructor(p), boards = p.board_service ?? [], active = boards.find((b) => b.status === 'active')
  // Escape leaves edit mode first, and only closes the card when nothing is being edited.
  useEffect(() => { const k = (e: KeyboardEvent) => { if (e.key !== 'Escape') return; if (editing) setEditing(false); else onClose() }; document.addEventListener('keydown', k); return () => document.removeEventListener('keydown', k) }, [onClose, editing])
  const fail = (r: { error?: string }) => { if (r.error) { toast(friendlyError(r.error)); return true } return false }
  const locs = (p.practice_locations ?? []).slice().sort((a, b) => (b.is_primary ? 1 : 0) - (a.is_primary ? 1 : 0))
  return (
    <div className="cert-veil" onClick={(e) => e.target === e.currentTarget && !editing && onClose()}>
      <div className={`cert-modal wide cc${editing ? ' editing' : ''}`} role="dialog" aria-modal="true">
        <div className="mh"><div><h3>{fullName(p)}</h3>
          <div className="cert-chips" style={{ margin: '8px 0 0' }}><StatusPill p={p} /><Chips p={p} /></div>
        </div><div className="cc-ctl"><button type="button" className="x" aria-label="Close" onClick={onClose}>×</button>
          {canChange && (editing
            ? <div className="cc-btns"><button type="button" className="b s-btn on-light xs" onClick={() => { setEditing(false); setErr(null) }}>Cancel</button><button type="button" className="b p-btn xs" disabled={saving} onClick={() => void save()}>{saving ? 'Saving…' : 'Save'}</button></div>
            : <button type="button" className="b s-btn on-light xs" onClick={startEdit}>✎ Edit</button>)}
        </div></div>
        <div className="evt-tabs" role="tablist">{tabs.map(([k, l]) => <button type="button" role="tab" aria-selected={tab === k} key={k} className={tab === k ? 'on' : ''} onClick={() => setTab(k)}>{l}</button>)}</div>
        <div className="mb cc-body">
          {err && <div className="cert-err" role="alert">{err}</div>}
          {tab === 'profile' && <>
          <div className="sec">Contact</div><div className="kv">{editP && <><KV k="First name" v={inp('first_name')} /><KV k="Last name" v={inp('last_name')} /><KV k="Credentials" v={inp('credentials', 'text', 'DC')} /></>}<KV k="Email" v={ed('email', p.email ? <a href={`mailto:${p.email}`}>{p.email}</a> : null, 'email')} /><KV k="Mobile" v={ed('mobile_phone', p.mobile_phone)} />
            {editP && <KV k="Headshot" v={<div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>{inp('photo_url', 'url', 'https://…')}<input ref={photoRef} type="file" accept="image/*" hidden onChange={(e) => void pickPhoto(e.target.files?.[0])} /><button type="button" className="b s-btn on-light xs" disabled={photoBusy} onClick={() => photoRef.current?.click()}>{photoBusy ? 'Uploading…' : 'Upload'}</button></div>} />}</div>
          <div className="sec">Classification</div><div className="kv"><KV k="Type" v={editP ? <select className="fi" value={v.contact_type} onChange={set('contact_type')} aria-label="Type"><option value="doctor">Doctor</option><option value="student">Student</option></select> : p.contact_type === 'student' ? 'Student' : 'Doctor'} /><KV k="Technique(s)" v={editP ? inp('techniques', 'text', 'Comma separated') : (p.techniques ?? []).join(', ') || null} />{instr && <KV k="Instructor track" v={instr.level === 'senior_instructor' ? 'Senior Instructor' : 'Instructor'} />}</div>
          {canInvite && !p.deceased_on && <>
            <div className="sec">Members area</div>
            <div className="kv"><KV k="Login" v={!p.email ? 'No email on file' : p.auth_user_id ? 'Set up' : 'Not set up yet'} /><KV k="Last signed in" v={lastIn} /></div>
            {p.email && <div className="act" style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              {p.auth_user_id && <button type="button" className="b s-btn on-light xs" disabled={sending} onClick={onReset}>Send password reset</button>}
              <button type="button" className="b s-btn on-light xs" disabled={sending} onClick={onInvite}>Send welcome letter</button>
            </div>}
          </>}
          </>}
          {tab === 'business' && <>
          <div className="sec">Office location</div>
          <div className="loc">{!editP && <><b>{p.practice_name ?? 'No practice on file'}</b>{p.practice_name && locs.length > 0 && <Pill kind="info">Primary</Pill>}</>}<div className="kv" style={{ marginTop: editP ? 0 : 8 }}>{editP && <KV k="Practice name" v={inp('practice_name')} />}<KV k="Office phone" v={ed('office_phone', p.office_phone ?? p.practice_phone)} /><KV k="Address" v={ed('practice_address', p.practice_address ?? ([p.practice_city, p.practice_state].filter(Boolean).join(', ') || null))} /><KV k="Website" v={editP ? inp('practice_website') : p.practice_website ? <a href={/^https?:/.test(p.practice_website) ? p.practice_website : `https://${p.practice_website}`} target="_blank" rel="noopener">{p.practice_website}</a> : null} /></div></div>
          {locs.map((l) => <div className="loc" key={l.id}><b>{l.name}</b><div className="kv" style={{ marginTop: 8 }}><KV k="Office phone" v={l.phone} /><KV k="Address" v={l.address} /><KV k="Website" v={l.website} /></div></div>)}
          {canEdit && <button type="button" className="t-link" onClick={async () => { const v = await askForm('Add a second location', [{ key: 'n', label: 'Location name', required: true }, { key: 'a', label: 'Address' }, { key: 'w', label: 'Website', placeholder: 'https://' }], { ok: 'Add location' }); if (!v) return; if (!fail(await addLocation(p.id, v.n ?? '', v.a ?? '', v.w ?? ''))) await onChanged() }}>+ Add second location</button>}
          </>}
          {tab === 'membership' && <>
          <div className="sec">Membership</div><div className="kv"><KV k="Status" v={editP ? <select className="fi" value={v.status} onChange={set('status')} aria-label="Status"><option value="active">Active</option><option value="expired">Expired</option><option value="never">Never a member</option><option value="deceased">Deceased</option></select> : s === 'deceased' ? `Deceased${p.deceased_on ? ' · ' + fmt(p.deceased_on) : ''}` : s === 'current' ? <>Active member {activeBoard(p) && <Pill kind="ok">Director — complimentary</Pill>}</> : s === 'recent' ? 'Recently expired — reactivatable' : 'Inactive'} />{editP && v.status === 'deceased' && <KV k="Date of passing" v={inp('deceased_on', 'date')} />}<KV k="Member since" v={ed('member_since', p.member_since, 'date')} /><KV k="Expires" v={ed('membership_expires', p.membership_expires, 'date')} /></div>
          {boards.length > 0 && <><div className="sec">Board service</div><div className="kv">{boards.map((b) => <KV key={b.id} k={b.term_label ?? `${b.term_start ?? ''}–${b.term_end ?? ''}`} v={b.status === 'active' ? 'Active board member' : b.status === 'nominee' ? 'Nominee' : 'Past board member'} />)}</div>{active && canEdit && <div className="act"><button type="button" className="b s-btn on-light xs" onClick={async () => { if (!(await askConfirm('End board service?', { body: 'The seat is vacated and they become a past board member.', ok: 'End service', danger: true }))) return; if (!fail(await endBoard(p))) { toast('Board service ended.'); await onChanged() } }}>End board service</button></div>}</>}
          </>}
          {tab === 'certification' && <>
          {!editC && <><div className="sec">Certifications</div><div className="kv">{(p.person_certifications ?? []).length === 0 && <KV k="—" v="None on file" />}{(p.person_certifications ?? []).map((c) => <KV key={c.id} k={c.technique} v={`${LVL[c.level] ?? c.level}${c.grandfathered ? ' · Grandfathered on ' + fmt(c.cert_date) : c.cert_date ? ' · ' + fmt(c.cert_date) : ''}${c.certificate_number ? ' · Certificate #' + c.certificate_number : ''}${c.certified_by && !c.grandfathered ? ' · ' + c.certified_by : ''}`} />)}</div></>}
          {editC && <>
            <div className="sec">Advanced Orthogonal</div>
            {!cv ? <p className="muted">Reading their certification record…</p> : <div className="kv">
              <KV k="Level" v={<select className="fi" value={cv.level} onChange={(e) => setCv({ ...cv, level: e.target.value as Level })} aria-label="Level">{LEVELS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select>} />
              <KV k="Date awarded" v={<input className="fi" type="date" value={cv.date} onChange={(e) => setCv({ ...cv, date: e.target.value })} aria-label="Date awarded" />} />
              <KV k="Certificate #" v={<input className="fi" value={cv.num} placeholder="Optional" onChange={(e) => setCv({ ...cv, num: e.target.value })} aria-label="Certificate number" />} />
              <KV k="Working toward" v={<select className="fi" value={cv.target} onChange={(e) => setCv({ ...cv, target: e.target.value as Level | '' })} aria-label="Working toward"><option value="">None (not pursuing)</option>{LEVELS.slice(1).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select>} />
              <KV k="Interested" v={<label className="cert-tog" style={{ margin: 0 }}><input type="checkbox" checked={cv.interest} onChange={(e) => setCv({ ...cv, interest: e.target.checked })} /> In conversation about the next level</label>} />
            </div>}
          </>}
          {!canCert && <p className="muted" style={{ marginTop: 10 }}>Only the Executive Director and the Certification Committee chair or co-chair can change certifications.</p>}
          {instr && <><div className="sec">Instructor</div><div className="kv"><KV k={instr.technique ?? 'Advanced Orthogonal'} v={instr.level === 'senior_instructor' ? 'Senior Instructor' : 'Instructor'} /></div>{canEdit && <div className="act"><button type="button" className="b s-btn on-light xs" onClick={async () => { const why = await askText('End instructor service', { label: 'Reason (optional)', placeholder: 'e.g. Retired from teaching' }, { ok: 'End service', danger: true }); if (why === null) return; if (!fail(await endInstructor(p, why))) { toast('Instructor service ended.'); await onChanged() } }}>End instructor service</button></div>}</>}
          </>}
          {tab === 'notes' && <>
          {p.notes && <div className="ma-row"><div><b style={{ fontWeight: 500 }}>{p.notes}</b><span>From the original record</span></div></div>}
          {(p.contact_notes ?? []).length === 0 && !p.notes && <p className="muted">No notes yet.</p>}
          {(p.contact_notes ?? []).slice().sort((a, b) => b.created_at.localeCompare(a.created_at)).map((n) => <div className="ma-row" key={n.id}><div><b style={{ fontWeight: 500 }}>{n.text}</b><span>{n.by_name ?? '—'} · {fmt(n.created_at)}</span></div></div>)}
          {canEdit && <><textarea className="fi" value={note} placeholder="Add a note…" onChange={(e) => setNote(e.target.value)} style={{ marginTop: 8, minHeight: 70 }} /><div className="act"><button type="button" className="b s-btn on-light sm" disabled={!note.trim()} onClick={async () => { if (!fail(await addNote(p.id, note.trim(), me, meId))) { setNote(''); await onChanged() } }}>Add note</button></div></>}
          </>}
        </div>
      </div>
    </div>
  )
}

function EditDialog({ p, onClose, onSaved }: { p: Member | null; onClose: () => void; onSaved: (m: string) => void }) {
  const [v, setV] = useState<Record<string, string>>({
    first_name: p?.first_name ?? '', last_name: p?.last_name ?? '', credentials: p?.credentials ?? 'DC', contact_type: p?.contact_type ?? 'doctor',
    email: p?.email ?? '', mobile_phone: p?.mobile_phone ?? '', office_phone: p?.office_phone ?? '', practice_website: p?.practice_website ?? '',
    practice_name: p?.practice_name ?? '', practice_address: p?.practice_address ?? '', techniques: (p?.techniques ?? []).join(', '),
    status: p?.deceased_on ? 'deceased' : (p?.membership_status ?? 'active'), deceased_on: p?.deceased_on ?? '', member_since: p?.member_since ?? '', membership_expires: p?.membership_expires ?? '',
    photo_url: p?.photo_url ?? '',
  })
  const [err, setErr] = useState<string | null>(null); const [saving, setSaving] = useState(false)
  /* A manager's upload lands in the headshot bucket; the address is saved with the rest of the form. */
  const photoRef = useRef<HTMLInputElement>(null)
  const [photoBusy, setPhotoBusy] = useState(false)
  const pickPhoto = async (file: File | undefined) => {
    if (!file || !p) return
    setPhotoBusy(true)
    const r = await uploadPhotoFor(p.id, file)
    setPhotoBusy(false)
    if (photoRef.current) photoRef.current.value = ''
    if (r.missing) return setErr('Photo uploads are being switched on — paste a link for now.')
    if (r.error) return setErr('The photo could not be uploaded. Try a JPG or PNG under 10 MB.')
    setV((s) => ({ ...s, photo_url: r.url ?? '' }))
  }
  useEffect(() => { const k = (e: KeyboardEvent) => e.key === 'Escape' && onClose(); document.addEventListener('keydown', k); return () => document.removeEventListener('keydown', k) }, [onClose])
  const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setV((s) => ({ ...s, [k]: e.target.value }))
  async function save() {
    setErr(null); if (!v.first_name?.trim() || !v.last_name?.trim()) { setErr('First and last name are required.'); return }
    const dead = v.status === 'deceased'
    const prof: Profile = { photo_url: v.photo_url || null, first_name: v.first_name!.trim(), last_name: v.last_name!.trim(), credentials: v.credentials || null, contact_type: v.contact_type, email: v.email || null, mobile_phone: v.mobile_phone || null, office_phone: v.office_phone || null, practice_website: v.practice_website || null, practice_name: v.practice_name || null, practice_address: v.practice_address || null, techniques: (v.techniques ?? '').split(',').map((s) => s.trim()).filter(Boolean), member_since: v.member_since || null, membership_expires: v.membership_expires || null, deceased_on: dead ? (v.deceased_on || new Date().toISOString().slice(0, 10)) : null }
    if (!dead) prof.membership_status = v.status
    setSaving(true); const r = p ? await saveProfile(p.id, prof) : await createMember(prof); setSaving(false)
    if (r.error) { setErr(friendlyError(r.error)); return }
    onSaved(p ? 'Saved.' : `${prof.first_name} ${prof.last_name} added.`)
  }
  return (
    <div className="cert-veil" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="cert-modal wide" role="dialog" aria-modal="true">
        <div className="mh"><div><h3>{p ? `Edit — ${fullName(p)}` : 'Add a member'}</h3><p>The people record. Roles, board seats and certifications are managed from their own tabs.</p></div><button type="button" className="x" aria-label="Close" onClick={onClose}>×</button></div>
        <div className="mb">{err && <div className="cert-err">{err}</div>}
          <div className="cert-grid mform">
            <div className="cert-fh full" style={{ borderTop: 0, paddingTop: 0 }}>Identity</div><MF k="first_name" l="FIRST NAME" type="text" full={false} v={v} set={set} /><MF k="last_name" l="LAST NAME" type="text" full={false} v={v} set={set} /><MF k="credentials" l="CREDENTIALS" type="text" full={false} v={v} set={set} /><div><label className="flabel" htmlFor="m_type">TYPE</label><select className="fi" id="m_type" value={v.contact_type} onChange={set('contact_type')}><option value="doctor">Doctor</option><option value="student">Student</option></select></div>
            <div className="cert-fh full">Contact</div><MF k="email" l="EMAIL" type="email" full={false} v={v} set={set} /><MF k="mobile_phone" l="MOBILE" type="text" full={false} v={v} set={set} /><MF k="office_phone" l="OFFICE PHONE" type="text" full={false} v={v} set={set} /><MF k="practice_website" l="WEBSITE" type="text" full={false} v={v} set={set} />
            <div className="cert-fh full">Practice</div><MF k="practice_name" l="PRACTICE NAME" type="text" full={false} v={v} set={set} /><MF k="practice_address" l="ADDRESS" type="text" full={false} v={v} set={set} /><MF k="techniques" l="TECHNIQUES (COMMA SEPARATED)" type="text" full={true} v={v} set={set} />
            <div className="cert-fh full">Photo</div>
            <div className="full"><label className="flabel">HEADSHOT</label>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                {v.photo_url && <span className="ctc-top" style={{ display: 'contents' }}><span className="av" style={{ width: 40, height: 40, fontSize: 13 }}><img src={v.photo_url} alt="" onError={(e) => (e.currentTarget.style.display = 'none')} /></span></span>}
                <input className="fi" type="url" value={v.photo_url ?? ''} onChange={set('photo_url')} placeholder="https://…" />
                {p && <><input ref={photoRef} type="file" accept="image/*" hidden onChange={(e) => void pickPhoto(e.target.files?.[0])} /><button type="button" className="b s-btn on-light xs" disabled={photoBusy} onClick={() => photoRef.current?.click()}>{photoBusy ? 'Uploading…' : 'Upload'}</button></>}
              </div>
              <div className="evt-hint">{p ? 'Members can add their own under My Account. Upload one here, or paste a link.' : 'Save the member first, then upload a photo.'}</div>
            </div>
            <div className="cert-fh full">Membership</div><div><label className="flabel" htmlFor="m_status">STATUS</label><select className="fi" id="m_status" value={v.status} onChange={set('status')}><option value="active">Active</option><option value="expired">Expired</option><option value="never">Never a member</option><option value="deceased">Deceased</option></select></div><MF k="deceased_on" l="DATE OF PASSING (IF DECEASED)" type="date" full={false} v={v} set={set} /><MF k="member_since" l="MEMBER SINCE" type="date" full={false} v={v} set={set} /><MF k="membership_expires" l="EXPIRES" type="date" full={false} v={v} set={set} />
          </div>
        </div>
        <div className="mf"><button type="button" className="b s-btn on-light sm" onClick={onClose}>Cancel</button><button type="button" className="b p-btn sm" disabled={saving} onClick={() => void save()}>{saving ? 'Saving…' : 'Save'}</button></div>
      </div>
    </div>
  )
}

/** Module-level so React keeps the input mounted (and focused) between keystrokes. */
function MF({ k, l, type, full, v, set }: { k: string; l: string; type: string; full: boolean; v: Record<string, string>; set: (k: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => void }) {
  return <div className={full ? 'full' : ''}><label className="flabel" htmlFor={`m_${k}`}>{l}</label><input className="fi" id={`m_${k}`} type={type} value={v[k] ?? ''} onChange={set(k)} /></div>
}

/* ------------------------------------------------------- members area access
 * Every current member who has no login yet, and one button to email them all
 * a set-your-password link. Lists them first: a name with no email address
 * cannot be invited, and that is worth seeing before anything is sent. */
function InviteAllDialog({ onClose }: { onClose: () => void }) {
  const toast = useToast()
  const [rows, setRows] = useState<InviteRow[] | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [done, setDone] = useState<InviteRow[] | null>(null)
  const [skip, setSkip] = useState<Set<string>>(new Set())
  useEffect(() => {
    void (async () => {
      const r = await inviteAllMembers(true).catch(() => null)
      if (!r || r.error) { setErr('Could not read the list — this is for Directors and the Executive Director.'); return }
      setRows(r.results)
    })()
  }, [])
  const listed = (rows ?? []).filter((r) => r.would_invite)
  const sendable = listed.filter((r) => !r.id || !skip.has(r.id))
  const toggle = (id?: string) => id && setSkip((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n })
  const missing = (rows ?? []).filter((r) => !r.would_invite)
  async function send() {
    if (!(await askConfirm(`Send ${sendable.length} invitation${sendable.length === 1 ? '' : 's'}?`, { body: `Each person ticked gets one email with a link to set up their members-area login.`, ok: 'Send' }))) return
    setBusy(true)
    const ids = sendable.map((x) => x.id).filter((x): x is string => !!x)
    const r = await inviteAllMembers(false, ids.length === sendable.length ? ids : undefined).catch(() => null)
    setBusy(false)
    if (!r || r.error) { setErr('The invitations did not go out. Nothing was sent.'); return }
    setDone(r.results)
    toast(`${r.results.filter((x) => x.ok).length} of ${r.results.length} invitations sent`)
  }
  return (
    <div className="cert-veil" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="cert-modal" role="dialog" aria-modal="true">
        <div className="mh"><div><h3>Invite to the members area</h3><p>Current members who have no login yet. Untick anyone you don't want to email.</p></div><button type="button" className="x" aria-label="Close" onClick={onClose}>×</button></div>
        <div className="mb">
          {err && <div className="cert-err">{err}</div>}
          {!rows && !err && <p className="ma-empty">Reading the roster…</p>}
          {done ? (
            <>
              <p style={{ marginTop: 0 }}>Invitations sent. Each person gets one email with a link to choose their own password.</p>
              <div className="evt-tbl"><table><tbody>
                {done.map((r, i) => <tr key={i}><td>{r.name}</td><td>{r.email ?? '—'}</td><td>{r.ok ? <Pill kind="ok">sent</Pill> : <Pill kind="bad">{r.detail ?? 'not sent'}</Pill>}</td></tr>)}
              </tbody></table></div>
            </>
          ) : rows ? (
            rows.length === 0 ? <p className="ma-empty">Every current member already has a login.</p> : (
              <>
                <p style={{ marginTop: 0 }}>{listed.length} member{listed.length === 1 ? '' : 's'} can be invited now. Each gets one email with a link to choose their own password — no password is ever sent or set by us.</p>
                <div className="evt-tbl"><table><tbody>
                  {listed.map((r, i) => <tr key={r.id ?? i}><td><label className="inv-pick"><input type="checkbox" checked={!r.id || !skip.has(r.id)} disabled={!r.id} onChange={() => toggle(r.id)} /> {r.name}</label></td><td>{r.email}</td></tr>)}
                </tbody></table></div>
                {missing.length > 0 && <>
                  <p style={{ marginTop: 16 }}><b>No email address on file</b> — these {missing.length} cannot be invited until a contact card has an address:</p>
                  <p className="muted" style={{ fontSize: 13 }}>{missing.map((r) => r.name).join(' · ')}</p>
                </>}
              </>
            )
          ) : null}
        </div>
        <div className="mf">
          {!done && rows && sendable.length > 0 && <button type="button" className="b p-btn sm" disabled={busy} onClick={() => void send()}>{busy ? 'Sending…' : `Send ${sendable.length} invitation${sendable.length === 1 ? '' : 's'}`}</button>}
          <button type="button" className="b s-btn on-light sm" onClick={onClose}>Close</button>
        </div>
      </div>
    </div>
  )
}
