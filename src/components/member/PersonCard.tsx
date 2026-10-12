/* ----------------------------------------------------------------------------
 * The person card — one detail view for Members and Contacts, so the two can
 * never show a person differently.
 *
 * Tabs: Profile · Business info · Background · Membership & roles ·
 * Certification · Notes. Edit (top right, under the close button) turns the
 * fields into inputs in place — label on the left, field on the right — and
 * Save writes them all at once. Certification fields open only for the
 * Executive Director and the Certification Committee chair or co-chair.
 * -------------------------------------------------------------------------- */
import { useEffect, useRef, useState } from 'react'
import { friendlyError } from '@/lib/friendlyError'
import { webHref } from '@/lib/safeHref'
import { useToast } from '@/components/ui/Toast'
import { inviteMember, requestReset, type AccessReply } from '@/lib/queries/access'
import { uploadPhotoFor } from '@/lib/queries/photo'
import {
  saveProfile, createContact, addNote, saveOffices, saveRoles,
  TECHNIQUES, ROLE_LABEL, LEVEL_LABEL, fullName, state, duesLapsed, advoLevel, otherCerts, initials,
} from '@/lib/queries/contacts'
import type { Contact, Committee, Office, Profile, Seat } from '@/lib/queries/contacts'
import { endInstructor, endBoard } from '@/lib/queries/members'
import { personById, topCert, overrideCertification, LEVELS, RANK, type Person, type Level } from '@/lib/queries/certifications'
import { INSTRUCTOR_TITLE } from '@/lib/chips'
import { ResearchSection } from './ResearchPanel'
import { Chips, chipsFor } from './PersonChips'
import { SafeLink, askConfirm, askText } from './opsUi'

export const fmtD = (iso?: string | null) => (iso ? new Date(iso + (iso.length === 10 ? 'T12:00:00Z' : '')).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '')

export function Pill({ kind = '', children }: { kind?: string; children: React.ReactNode }) { return <span className={`cpill ${kind}`}>{children}</span> }
export function StatusPill({ p }: { p: Contact }) {
  const s = state(p)
  if (s === 'deceased') return <Pill kind="dec">Deceased{p.deceased_on ? ` · ${p.deceased_on.slice(0, 4)}` : ''}</Pill>
  if (s === 'member') return <Pill kind="ok">Member{p.membership_expires ? ` · exp ${fmtD(p.membership_expires)}` : ''}</Pill>
  if (s === 'expired') return <Pill kind="warn">Expired{p.membership_expires ? ` · ${fmtD(p.membership_expires)}` : ''}</Pill>
  return <Pill kind="lead">Lead</Pill>
}
export function RoleChips({ p }: { p: Contact }) {
  return <Chips list={chipsFor(p, advoLevel(p), otherCerts(p))} />
}

export function friendly(err: string): string {
  if (/row-level security/.test(err)) return 'You don’t have permission for that. Only board, the executive director and the membership committee chair can change contacts.'
  if (/duplicate key/.test(err)) return 'Someone with that key already exists.'
  return friendlyError(err)
}

/* Officers in the first column, then board seat, teaching and past service. */
export const ROLE_TOGGLES = ['executive_director', 'board_chair', 'vice_chair', 'secretary', 'treasurer', 'board_member', 'instructor', 'past_executive_director', 'past_board_member']
const TOGGLE_LABEL: Record<string, string> = { board_member: 'Board member (Director)', past_board_member: 'Past board member' }
const SEAT_KEYS = ['committee_chair', 'committee_cochair', 'committee_member', 'research_director']
type V = Record<string, string>

/** The contact form: its fields' state and the save. Shared by the card's in-place editor and the Add contact window. */
export function useContactForm(p: Contact | null, canRoles: boolean, me: string, meId: string | null, newStatus = 'never') {
  // The record has two phone columns for the office (office and practice); the form shows one and keeps both in step.
  const phone0 = p?.office_phone || p?.practice_phone || ''
  const init = (): V => ({
    first_name: p?.first_name ?? '', last_name: p?.last_name ?? '', credentials: p?.credentials ?? 'DC', title: p?.title ?? '', contact_type: p?.contact_type ?? 'doctor',
    email: p?.email ?? '', mobile_phone: p?.mobile_phone ?? '', office_phone: phone0, personal_phone: p?.personal_phone ?? '',
    practice_name: p?.practice_name ?? '', practice_address: p?.practice_address ?? '', practice_city: p?.practice_city ?? '', practice_state: p?.practice_state ?? '', practice_zip: p?.practice_zip ?? '', practice_website: p?.practice_website ?? '',
    alma_mater: p?.alma_mater ?? '', grad_year: p?.grad_year ? String(p.grad_year) : '', npi: p?.npi ?? '', photo_url: p?.photo_url ?? '', bio: p?.bio ?? '',
    membership_status: p?.deceased_on ? 'deceased' : (p?.membership_status ?? newStatus), deceased_on: p?.deceased_on ?? '', member_since: p?.member_since ?? '', membership_expires: p?.membership_expires ?? '', newNote: '',
  })
  const initSeats = (): Seat[] => (p?.person_roles ?? []).map((r) => ({ role_key: r.role_key, committee_id: r.committee_id }))
  const [v, setV] = useState<V>(init)
  const [tq, setTq] = useState<string[]>(p?.techniques ?? [])
  const [offices, setOffices] = useState<Office[]>(p?.practice_locations ?? [])
  const [seats, setSeats] = useState<Seat[]>(initSeats)
  const instrLevel = (p?.person_roles ?? []).find((r) => r.role_key === 'instructor')?.instructor_level ?? null
  const [err, setErr] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  /** Back to what the record says now — before each edit, and on Cancel. */
  const reset = () => { setV(init()); setTq(p?.techniques ?? []); setOffices(p?.practice_locations ?? []); setSeats(initSeats()); setErr(null) }
  const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => setV((s) => ({ ...s, [k]: e.target.value }))
  /* A manager's upload lands in the headshot bucket; the address is saved with the rest of the form. */
  const photoRef = useRef<HTMLInputElement>(null)
  const [photoBusy, setPhotoBusy] = useState(false)
  const [pendingPhoto, setPendingPhoto] = useState<File | null>(null)
  const [preview, setPreview] = useState('')
  const pickPhoto = async (file: File | undefined) => {
    if (!file) return
    if (!p) { setPendingPhoto(file); setPreview(URL.createObjectURL(file)); if (photoRef.current) photoRef.current.value = ''; return }
    setPhotoBusy(true)
    const r = await uploadPhotoFor(p.id, file)
    setPhotoBusy(false)
    if (photoRef.current) photoRef.current.value = ''
    if (r.missing) return setErr('Photo uploads are being switched on — paste a link for now.')
    if (r.error) return setErr('The photo could not be uploaded. Try a JPG or PNG under 10 MB.')
    setV((s) => ({ ...s, photo_url: r.url ?? '' }))
  }
  const I = (k: string, type = 'text', ph = '') => <input className="fi" type={type} value={v[k] ?? ''} onChange={set(k)} placeholder={ph} aria-label={k.replace(/_/g, ' ')} />
  const setOffice = (i: number, patch: Partial<Office>) => setOffices((o) => o.map((x, j) => (j === i ? { ...x, ...patch } : x)))
  const hasSeat = (k: string) => seats.some((s) => s.role_key === k)

  async function save(): Promise<{ ok: true; msg: string; id: string } | { ok: false; name?: true }> {
    setErr(null)
    if (!v.first_name!.trim() || !v.last_name!.trim()) { setErr('First and last name are required.'); return { ok: false, name: true } }
    const dead = v.membership_status === 'deceased'
    const prof: Profile = {
      first_name: v.first_name!.trim(), last_name: v.last_name!.trim(), credentials: v.credentials || null, title: v.title || null, contact_type: v.contact_type || 'doctor',
      email: v.email || null, mobile_phone: v.mobile_phone || null, office_phone: v.office_phone || null, personal_phone: v.personal_phone || null,
      practice_name: v.practice_name || null, practice_address: v.practice_address || null, practice_city: v.practice_city || null, practice_state: v.practice_state || null, practice_zip: v.practice_zip || null, practice_phone: v.office_phone !== phone0 ? (v.office_phone || null) : (p?.practice_phone ?? null), practice_website: v.practice_website || null,
      alma_mater: v.alma_mater || null, grad_year: v.grad_year ? Number(v.grad_year) : null, npi: v.npi || null, photo_url: v.photo_url || null, bio: v.bio || null,
      techniques: tq, member_since: v.member_since || null, membership_expires: v.membership_expires || null,
      deceased_on: dead ? (v.deceased_on || new Date().toISOString().slice(0, 10)) : null,
    }
    if (!dead) prof.membership_status = v.membership_status
    setSaving(true)
    let id = p?.id ?? null
    if (id) { const r = await saveProfile(id, prof); if (r.error) { setSaving(false); setErr(friendly(r.error)); return { ok: false } } }
    else { const r = await createContact(prof); if (r.error || !r.id) { setSaving(false); setErr(friendly(r.error ?? 'no id returned')); return { ok: false } }; id = r.id }
    const o = await saveOffices(id, offices); if (o.error) { setSaving(false); setErr('Saved, but the extra offices were not. ' + friendlyError(o.error)); return { ok: false } }
    if (canRoles) { const r = await saveRoles(id, seats, instrLevel); if (r.error) { setSaving(false); setErr('Saved, but the roles were not. ' + friendlyError(r.error)); return { ok: false } } }
    if (v.newNote && v.newNote.trim()) { const n = await addNote(id, v.newNote.trim(), me, meId); if (n.error) { setSaving(false); setErr('Saved, but the note was not. ' + friendlyError(n.error)); return { ok: false } } }
    let photoNote = ''
    if (!p && pendingPhoto) {
      const up = await uploadPhotoFor(id, pendingPhoto)
      const w = up.url ? await saveProfile(id, { photo_url: up.url }) : null
      if (!up.url || w?.error) photoNote = ' The photo could not be uploaded; add it from their card.'
    }
    setSaving(false)
    return { ok: true, id, msg: (p ? 'Saved.' : `${prof.first_name} ${prof.last_name} added${prof.membership_status === 'never' || !prof.membership_status ? ' as a lead' : ''}.`) + photoNote }
  }
  return { p, canRoles, v, set, I, tq, setTq, offices, setOffices, setOffice, seats, setSeats, hasSeat, err, saving, save, reset, photoRef, photoBusy, pickPhoto, pendingPhoto, preview }
}
export type ContactForm = ReturnType<typeof useContactForm>

/* Label on the left, value or field on the right. Module-level so an input inside keeps focus while typing. */
function Row({ k, children }: { k: string; children: React.ReactNode }) { return <><span>{k}</span><div>{children}</div></> }
/* A section heading and its rows; hidden when every row is empty. */
function Sec({ title, items }: { title: string; items: React.ReactNode[] }) { const has = items.some(Boolean); return has ? <><div className="sec">{title}</div><div className="kv">{items}</div></> : null }
const kv = (k: string, v: React.ReactNode) => (v ? <Row key={k} k={k}>{v}</Row> : null)
const TYPE_LABEL: Record<string, string> = { doctor: 'Doctor', student: 'Student', staff: 'Staff' }
const chk = (on: boolean, label: string, onChange: (on: boolean) => void, disabled = false) =>
  <label key={label} className="cert-tog" style={{ margin: 0 }}><input type="checkbox" checked={on} disabled={disabled} onChange={(e) => onChange(e.target.checked)} /> {label}</label>

type CardTab = 'profile' | 'business' | 'background' | 'membership' | 'certification' | 'notes'
type CertForm = { level: Level; date: string; num: string; target: Level | ''; interest: boolean }

export function PersonCard({ p: given, newStatus = 'never', comms, me, meId, canEdit, canRoles, canInvite, canCert, lastIn, startEditing = false, onClose, onChanged }: {
  /** null adds someone new: the card opens in edit mode and Save creates the record. */
  p: Contact | null; newStatus?: string; comms: Committee[]; me: string; meId: string | null
  canEdit: boolean; canRoles: boolean; canInvite: boolean; canCert: boolean
  /** When they last signed in, if the page knows. */
  lastIn?: string
  startEditing?: boolean
  onClose: () => void; onChanged: () => Promise<void>
}) {
  const toast = useToast()
  const isNew = !given
  const p: Contact = given ?? ({ id: '', first_name: '', last_name: '', credentials: null, contact_type: 'doctor', membership_status: newStatus } as unknown as Contact)
  const [tab, setTab] = useState<CardTab>('profile')
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)

  /* ---- edit mode: profile fields for editors, certification fields for the committee */
  const f = useContactForm(given, canRoles, me, meId, newStatus)
  const canChange = canEdit || canCert
  const [editing, setEditing] = useState(isNew || (startEditing && canChange))
  const editP = editing && canEdit
  const editC = editing && canCert
  // The certification record carries what the contact list doesn't (the level being worked toward, interest), so it is read when editing starts.
  const [rec, setRec] = useState<Person | null>(null)
  const [cv, setCv] = useState<CertForm | null>(null)
  const [cv0, setCv0] = useState<CertForm | null>(null)
  const [certErr, setCertErr] = useState<string | null>(null)
  const [certSaving, setCertSaving] = useState(false)
  useEffect(() => {
    if (!editC || rec || cv) return
    if (isNew) { const x: CertForm = { level: 'none', date: '', num: '', target: '', interest: false }; setCv(x); setCv0(x); return }
    void personById(p.id).then((r) => {
      if (!r.row) { setCertErr(r.error ? friendlyError(r.error) : 'Could not read their certification record.'); return }
      const c = topCert(r.row)
      const x: CertForm = { level: (c?.level as Level) ?? 'none', date: c?.cert_date ?? '', num: c?.certificate_number ?? '', target: (r.row.target_cert_level as Level) ?? '', interest: !!r.row.cert_interest }
      setRec(r.row); setCv(x); setCv0(x)
    })
  }, [editC, rec, cv, isNew, p.id])
  const startEdit = () => { f.reset(); setRec(null); setCv(null); setCertErr(null); setEditing(true) }
  const cancel = () => { if (isNew) return onClose(); f.reset(); setCertErr(null); setEditing(false) }
  async function saveAll() {
    setCertErr(null)
    const certForm = editC && (rec || isNew) && cv && JSON.stringify(cv) !== JSON.stringify(cv0) ? cv : null
    if (certForm && certForm.level !== 'none' && !certForm.date) { setCertErr('An award date is required for an achieved level.'); setTab('certification'); return }
    if (certForm && certForm.target && RANK[certForm.target]! <= RANK[certForm.level]!) { setCertErr('“Working toward” must be above the achieved level.'); setTab('certification'); return }
    if (editP) { const r = await f.save(); if (!r.ok) { if (r.name) setTab('profile'); return } if (isNew) {
      // The record exists now; a certification problem is reported, not retried here (that would add them twice).
      const c = certForm ? await overrideCertification({ id: r.id, person_certifications: [] } as unknown as Person, certForm.level, certForm.date || null, certForm.num || null, me, certForm.target || null, certForm.interest) : null
      await onChanged(); toast(c?.error ? `${r.msg} The certification was not saved; set it from their card.` : r.msg); onClose(); return
    } }
    if (certForm && rec) {
      setCertSaving(true)
      const c = await overrideCertification(rec, certForm.level, certForm.date || null, certForm.num || null, me, certForm.target || null, certForm.interest)
      setCertSaving(false)
      if (c.error) { setCertErr(friendlyError(c.error)); setTab('certification'); return }
    }
    setEditing(false); await onChanged(); toast(editP ? 'Saved.' : certForm ? 'Certification saved.' : 'No changes.')
  }
  // Escape leaves edit mode first, and only closes the card when nothing is being edited.
  useEffect(() => { const k = (e: KeyboardEvent) => { if (e.key !== 'Escape') return; if (editing) cancel(); else onClose() }; document.addEventListener('keydown', k); return () => document.removeEventListener('keydown', k) })

  /* ---- what the card shows */
  const s = state(p)
  // Many imported addresses already end in "City, ST ZIP"; don't repeat it.
  const tail = [p.practice_city, [p.practice_state, p.practice_zip].filter(Boolean).join(' ')].filter(Boolean).join(', ')
  const addr = p.practice_address && p.practice_city && p.practice_address.toLowerCase().includes(p.practice_city.toLowerCase()) ? p.practice_address : [p.practice_address, tail].filter(Boolean).join(', ')
  const web = (w: string | null) => (w ? <SafeLink href={webHref(w)}>{w}</SafeLink> : null)
  const offices = p.practice_locations ?? []
  const notes = [...(p.contact_notes ?? [])].sort((a, b) => b.created_at.localeCompare(a.created_at))
  const noteCount = notes.length + (p.notes ? 1 : 0)
  const instr = (p.instructor_records ?? []).find((i) => i.status === 'current') ?? null
  const activeBoard = (p.board_service ?? []).some((b) => b.status === 'active')
  const fail = (r: { error?: string }) => { if (r.error) { toast(friendlyError(r.error)); return true } return false }
  const tabs: [CardTab, string][] = [['profile', 'Profile'], ['business', 'Business info'], ['background', 'Background'], ['membership', 'Membership & roles'], ['certification', 'Certification'], ['notes', `Notes${noteCount ? ` (${noteCount})` : ''}`]]

  async function welcome() {
    if (!(await askConfirm(`Send ${p.first_name} ${p.last_name} the welcome letter?`, { body: `The “Your account is ready” email, with a link to choose a password, goes to ${p.email}.${p.auth_user_id ? ' Their current password keeps working until they choose a new one.' : ''}`, ok: 'Send welcome letter' }))) return
    setBusy(true)
    const r = await inviteMember(p.id).catch((): AccessReply => ({ error: 'network' }))
    setBusy(false)
    if (!r || r.error || r.ok === false) { toast('Could not send it: ' + String(r?.detail ?? r?.error ?? 'unknown').slice(0, 140)); return }
    toast(`Welcome letter emailed to ${r.email ?? p.email}`)
    await onChanged()
  }
  async function reset() {
    if (!p.email) return
    if (!(await askConfirm(`Send ${p.first_name} ${p.last_name} a password reset?`, { body: `An email with a link to choose a new password goes to ${p.email}. Their current password keeps working until they change it.`, ok: 'Send reset' }))) return
    setBusy(true)
    const r = await requestReset(p.email).catch((): AccessReply => ({ error: 'network' }))
    setBusy(false)
    toast(r?.ok ? `Password reset link emailed to ${p.email}` : 'Could not send it. Please try again in a moment.')
  }
  async function addTheNote() {
    if (!note.trim()) return
    setBusy(true); const r = await addNote(p.id, note.trim(), me, meId); setBusy(false)
    if (r.error) { toast('The note could not be saved. ' + friendlyError(r.error)); return }
    setNote(''); await onChanged(); toast('Note added')
  }
  async function endInstr() {
    const why = await askText('End instructor service', { label: 'Reason (optional)', placeholder: 'e.g. Retired from teaching' }, { ok: 'End service', danger: true })
    if (why === null) return
    if (!fail(await endInstructor(p, why))) { toast('Instructor service ended.'); await onChanged() }
  }
  async function endSeat() {
    if (!(await askConfirm('End board service?', { body: 'The seat is vacated and they become a past board member.', ok: 'End service', danger: true }))) return
    if (!fail(await endBoard(p))) { toast('Board service ended.'); await onChanged() }
  }

  const { v, set, I } = f
  const err = (editing ? f.err : null) ?? certErr
  return (
    <div className="cert-veil" onClick={(e) => e.target === e.currentTarget && !editing && onClose()}>
      <div className={`cert-modal ctc-card cc${editing ? ' editing' : ''}`} role="dialog" aria-modal="true">
        <div className="ctc-top"><div className="av">{isNew ? (f.preview ? <img src={f.preview} alt="" /> : '+') : p.photo_url ? <img src={p.photo_url} alt="" onError={(e) => (e.currentTarget.style.display = 'none')} /> : initials(p)}</div>
          <div style={{ flex: 1, minWidth: 0 }}><h3>{isNew ? (`${v.first_name} ${v.last_name}`.trim() || (newStatus === 'never' ? 'New contact' : 'New member')) : fullName(p)}</h3>{isNew ? <div className="ti">Only a name is required. Fill in more as you learn it.</div> : <>{p.title && <div className="ti">{p.title}</div>}<div className="cert-chips" style={{ marginBottom: 0 }}><StatusPill p={p} /><RoleChips p={p} /></div></>}</div>
          <div className="cc-ctl"><button type="button" className="x" aria-label="Close" onClick={onClose}>×</button>
            {canChange && (editing
              ? <div className="cc-btns"><button type="button" className="b s-btn on-dark xs" onClick={cancel}>Cancel</button><button type="button" className="b p-btn xs" disabled={f.saving || certSaving} onClick={() => void saveAll()}>{f.saving || certSaving ? 'Saving…' : 'Save'}</button></div>
              : <button type="button" className="b s-btn on-dark xs" onClick={startEdit}>✎ Edit</button>)}
          </div></div>
        <div className="evt-tabs" role="tablist">{tabs.map(([k, l]) => <button type="button" role="tab" aria-selected={tab === k} key={k} className={tab === k ? 'on' : ''} onClick={() => setTab(k)}>{l}</button>)}</div>
        <div className="ctc-body cc-body">
          {err && <div className="cert-err" role="alert" style={{ marginTop: 14 }}>{err}</div>}

          {tab === 'profile' && (editP ? <>
            <div className="sec">Name</div>
            <div className="kv">
              <Row k="First name">{I('first_name')}</Row><Row k="Last name">{I('last_name')}</Row>
              <Row k="Credentials">{I('credentials', 'text', 'DC, BCAO')}</Row><Row k="Title">{I('title', 'text', 'e.g. Clinic Director')}</Row>
              <Row k="Type"><select className="fi" value={v.contact_type} onChange={set('contact_type')} aria-label="Type"><option value="doctor">Doctor</option><option value="student">Student</option><option value="staff">Staff / other</option></select></Row>
            </div>
            <div className="sec">Contact</div>
            <div className="kv"><Row k="Email">{I('email', 'email')}</Row><Row k="Mobile">{I('mobile_phone', 'tel')}</Row><Row k="Personal phone">{I('personal_phone', 'tel')}</Row></div>
            <div className="sec">Headshot &amp; bio</div>
            <div className="kv">
              <Row k="Headshot"><div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>{I('photo_url', 'url', 'https://…')}<input ref={f.photoRef} type="file" accept="image/*" hidden onChange={(e) => void f.pickPhoto(e.target.files?.[0])} /><button type="button" className="b s-btn on-light xs" disabled={f.photoBusy} onClick={() => f.photoRef.current?.click()}>{f.photoBusy ? 'Uploading…' : isNew && f.pendingPhoto ? 'Change' : 'Upload'}</button></div>{isNew && f.pendingPhoto && <div className="evt-hint">{f.pendingPhoto.name} — uploads when you save.</div>}</Row>
              <Row k="Bio"><textarea className="fi" rows={4} value={v.bio} onChange={set('bio')} placeholder="Shown on the public directory once they are a member." aria-label="Bio" /></Row>
            </div>
          </> : <>
            <Sec title="Contact" items={[kv('Email', p.email ? <a href={`mailto:${p.email}`}>{p.email}</a> : null), kv('Mobile', p.mobile_phone), kv('Personal phone', p.personal_phone)]} />
            <Sec title="Profile" items={[kv('Type', TYPE_LABEL[p.contact_type ?? ''] ?? p.contact_type), kv('Title', p.title), kv('Bio', p.bio)]} />
            {canInvite && !p.deceased_on && <>
              <div className="sec">Members area</div>
              <div className="kv"><Row k="Login">{!p.email ? 'No email on file' : p.auth_user_id ? 'Set up' : 'Not set up yet'}</Row>{lastIn !== undefined && p.auth_user_id && <Row k="Last signed in">{lastIn}</Row>}</div>
              {p.email && !editing && <div className="act" style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                {p.auth_user_id && <button type="button" className="b s-btn on-light xs" disabled={busy} onClick={() => void reset()}>Send password reset</button>}
                <button type="button" className="b s-btn on-light xs" disabled={busy} onClick={() => void welcome()}>Send welcome letter</button>
              </div>}
            </>}
          </>)}

          {tab === 'business' && (editP ? <>
            <div className="sec">Primary office</div>
            <div className="kv">
              <Row k="Practice name">{I('practice_name')}</Row><Row k="Street address">{I('practice_address')}</Row>
              <Row k="City · State · ZIP"><div className="cc-3">{I('practice_city', 'text', 'City')}{I('practice_state', 'text', 'State')}{I('practice_zip', 'text', 'ZIP')}</div></Row>
              <Row k="Office phone">{I('office_phone', 'tel')}</Row><Row k="Website">{I('practice_website', 'text', 'https://…')}</Row>
            </div>
            {f.offices.map((o, i) => <div key={i}>
              <div className="sec">Office {i + 2}</div>
              <div className="kv">
                <Row k="Practice name"><input className="fi" value={o.name ?? ''} onChange={(e) => f.setOffice(i, { name: e.target.value })} aria-label="Practice name" /></Row>
                <Row k="Street address"><input className="fi" value={o.address ?? ''} onChange={(e) => f.setOffice(i, { address: e.target.value })} aria-label="Street address" /></Row>
                <Row k="City · State · ZIP"><div className="cc-3"><input className="fi" value={o.city ?? ''} placeholder="City" onChange={(e) => f.setOffice(i, { city: e.target.value })} aria-label="City" /><input className="fi" value={o.state ?? ''} placeholder="State" onChange={(e) => f.setOffice(i, { state: e.target.value })} aria-label="State" /><input className="fi" value={o.zip ?? ''} placeholder="ZIP" onChange={(e) => f.setOffice(i, { zip: e.target.value })} aria-label="ZIP" /></div></Row>
                <Row k="Office phone"><input className="fi" value={o.phone ?? ''} onChange={(e) => f.setOffice(i, { phone: e.target.value })} aria-label="Office phone" /></Row>
                <Row k="Website"><input className="fi" value={o.website ?? ''} onChange={(e) => f.setOffice(i, { website: e.target.value })} aria-label="Website" /></Row>
                <Row k="Used as"><div className="cc-wrap">{chk(!!o.is_internship_site, 'Internship site', (on) => f.setOffice(i, { is_internship_site: on }))}{chk(!!o.is_seminar_venue, 'Seminar venue', (on) => f.setOffice(i, { is_seminar_venue: on }))}</div></Row>
              </div>
              <div className="act"><button type="button" className="t-link" style={{ color: 'var(--color-content-muted)' }} onClick={() => f.setOffices((x) => x.filter((_, j) => j !== i))}>Remove this office</button></div>
            </div>)}
            <div className="act" style={{ justifyContent: 'flex-start' }}><button type="button" className="b s-btn on-light xs" onClick={() => f.setOffices((x) => [...x, { name: '', address: '', city: '', state: '', zip: '', phone: '', website: '', is_primary: false, is_internship_site: false, is_seminar_venue: false }])}>+ Add another office</button></div>
          </> : <>
            <Sec title="Practice" items={[kv('Practice', p.practice_name), kv('Office phone', p.office_phone ?? p.practice_phone), kv('Address', addr ? <>{addr}<br /><a href={`https://maps.google.com/?q=${encodeURIComponent([p.practice_name, addr].filter(Boolean).join(', '))}`} target="_blank" rel="noreferrer">Open in maps</a></> : null), kv('Website', web(p.practice_website))]} />
            {offices.length > 0 && <><div className="sec">Other offices</div>{offices.map((o) => <div key={o.id} className="kv" style={{ marginBottom: 10 }}>{kv(o.name || 'Office', <>{[o.address, [o.city, [o.state, o.zip].filter(Boolean).join(' ')].filter(Boolean).join(', ')].filter(Boolean).join(', ')}{o.phone ? <><br />{o.phone}</> : null}{o.website ? <><br />{web(o.website)}</> : null}{(o.is_internship_site || o.is_seminar_venue) && <div className="cert-chips" style={{ marginTop: 6, marginBottom: 0 }}>{o.is_internship_site && <Pill>Internship site</Pill>}{o.is_seminar_venue && <Pill>Seminar venue</Pill>}</div>}</>)}</div>)}</>}
            {!p.practice_name && !addr && !p.practice_website && offices.length === 0 && <p className="muted" style={{ marginTop: 14 }}>No practice on file.</p>}
          </>)}

          {tab === 'background' && (editP ? <>
            <div className="sec">Training</div>
            <div className="kv">
              <Row k="Technique(s)"><div className="ctc-chk cc-chk">{TECHNIQUES.map((t) => <label key={t} className={f.tq.includes(t) ? 'on' : ''}><input type="checkbox" checked={f.tq.includes(t)} onChange={(e) => f.setTq((x) => (e.target.checked ? [...new Set([...x, t])] : x.filter((y) => y !== t)))} /> {t}</label>)}</div></Row>
              <Row k="Chiropractic college">{I('alma_mater', 'text', 'e.g. Life University')}</Row>
              <Row k="Graduation year">{I('grad_year', 'number', '2012')}</Row>
              <Row k="NPI number">{I('npi', 'text', '10 digits')}</Row>
            </div>
          </> : <>
            <Sec title="Training" items={[kv('Technique(s)', (p.techniques ?? []).join(', ')), kv('Chiropractic college', p.alma_mater), kv('Graduated', p.grad_year), kv('NPI', p.npi)]} />
            {!(p.techniques ?? []).length && !p.alma_mater && !p.grad_year && !p.npi && <p className="muted" style={{ marginTop: 14 }}>No background on file.</p>}
            <ResearchSection personId={p.id} />
          </>)}

          {tab === 'membership' && (editP ? <>
            <div className="sec">Membership</div>
            <div className="kv">
              <Row k="Status"><select className="fi" value={v.membership_status} onChange={set('membership_status')} aria-label="Membership status"><option value="never">Never a member</option><option value="active">Current member</option><option value="expired">Expired</option><option value="deceased">Deceased</option></select></Row>
              {v.membership_status === 'deceased' ? <Row k="Date of death">{I('deceased_on', 'date')}</Row> : <Row k="Member since">{I('member_since', 'date')}</Row>}
              <Row k="Expires (renewal)">{I('membership_expires', 'date')}</Row>
            </div>
            <p className="muted" style={{ margin: '6px 0 0' }}>Joining on the website sets these automatically; change them here only for a manual renewal.</p>
            <div className="sec">Roles</div>
            <div className="kv">
              <Row k="Roles"><div className="cc-roles">{ROLE_TOGGLES.map((k) => chk(f.hasSeat(k), TOGGLE_LABEL[k] ?? ROLE_LABEL[k]!, (on) => f.setSeats((x) => (on ? [...x, { role_key: k, committee_id: null }] : x.filter((y) => y.role_key !== k))), !canRoles))}</div></Row>
              <Row k="Committee seats"><div className="evt-rows">{!f.seats.some((x) => SEAT_KEYS.includes(x.role_key)) && <span className="muted">None</span>}{f.seats.map((x, i) => SEAT_KEYS.includes(x.role_key) ? <div key={i} className="rr" style={{ gridTemplateColumns: '1fr 150px auto' }}>
                <select className="fi" value={x.committee_id ?? ''} disabled={!canRoles} onChange={(e) => f.setSeats((all) => all.map((y, j) => (j === i ? { ...y, committee_id: e.target.value ? Number(e.target.value) : null } : y)))} aria-label="Committee"><option value="">— committee —</option>{comms.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select>
                <select className="fi" value={x.role_key} disabled={!canRoles} onChange={(e) => f.setSeats((all) => all.map((y, j) => (j === i ? { ...y, role_key: e.target.value } : y)))} aria-label="Seat"><option value="committee_chair">Chair</option><option value="committee_cochair">Co-Chair</option><option value="committee_member">Member</option><option value="research_director">Research Director</option></select>
                <button type="button" className="del" aria-label="Remove seat" disabled={!canRoles} onClick={() => f.setSeats((all) => all.filter((_, j) => j !== i))}>×</button></div> : null)}
                {canRoles && <button type="button" className="b s-btn on-light xs" style={{ justifySelf: 'start' }} onClick={() => f.setSeats((x) => [...x, { role_key: 'committee_member', committee_id: null }])}>+ Add committee seat</button>}</div></Row>
            </div>
            {!canRoles && <p className="muted" style={{ margin: '6px 0 0' }}>Board and the Executive Director assign roles.</p>}
          </> : <>
            <Sec title="Membership" items={s === 'lead' ? [kv('Status', 'Never a member')] : [kv('Status', s === 'member' ? (duesLapsed(p) ? 'Current — dues lapsed, stays current as a Director' : activeBoard ? 'Current member · Director' : 'Current member') : s === 'expired' ? 'Expired' : 'Deceased'), kv('Member since', fmtD(p.member_since)), kv(s === 'member' && !duesLapsed(p) ? 'Renews' : 'Dues lapsed on', fmtD(p.membership_expires)), kv('Profile', p.profile_completed ? 'Complete' : null)]} />
            {canEdit && s === 'lead' && <p className="muted" style={{ marginTop: 8 }}>Becomes a member automatically when they join on the website.</p>}
            {(p.person_roles ?? []).length > 0 && <><div className="sec">Roles &amp; committees</div>{(p.person_roles ?? []).map((r) => <div key={r.id} className="ctc-note" style={{ padding: '8px 12px' }}>{ROLE_LABEL[r.role_key] ?? r.role_key}{r.committees?.name ? ` · ${r.committees.name}` : ''}{r.instructor_level ? ` · ${INSTRUCTOR_TITLE[r.instructor_level] ?? r.instructor_level}` : ''}</div>)}</>}
            <Sec title="Board service" items={(p.board_service ?? []).map((b) => kv(`Term ${b.term_label ?? b.id}`, `${b.status ?? ''}${b.term_start ? ` · ${fmtD(b.term_start)} – ${b.term_end ? fmtD(b.term_end) : 'present'}` : ''}`))} />
            {activeBoard && canEdit && <div className="act"><button type="button" className="b s-btn on-light xs" onClick={() => void endSeat()}>End board service</button></div>}
            <Sec title="Instructor" items={(p.instructor_records ?? []).map((i) => kv(i.level === 'senior_instructor' ? 'Senior instructor' : 'Instructor',`${i.status ?? ''}${i.technique ? ` · ${i.technique}` : ''}${i.instructor_date ? ` · since ${fmtD(i.instructor_date)}` : ''}`))} />
            {instr && canEdit && <div className="act"><button type="button" className="b s-btn on-light xs" onClick={() => void endInstr()}>End instructor service</button></div>}
          </>)}

          {tab === 'certification' && <>
            {!editC && <Sec title="Certifications" items={(p.person_certifications ?? []).map((c) => kv(c.technique, `${LEVEL_LABEL[c.level] ?? c.level}${c.grandfathered ? ' · Grandfathered' : ''}${c.cert_date ? ` on ${fmtD(c.cert_date)}` : ''}${c.certificate_number ? ` · Certificate #${c.certificate_number}` : ''}${c.certified_by ? ` · ${c.certified_by}` : ''}`))} />}
            {!editC && (p.person_certifications ?? []).length === 0 && <p className="muted" style={{ marginTop: 14 }}>No certification on file.</p>}
            {editC && <>
              <div className="sec">Advanced Orthogonal</div>
              {!cv ? <p className="muted">Reading their certification record…</p> : <div className="kv">
                <Row k="Level"><select className="fi" value={cv.level} onChange={(e) => setCv({ ...cv, level: e.target.value as Level })} aria-label="Level">{LEVELS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></Row>
                <Row k="Date awarded"><input className="fi" type="date" value={cv.date} onChange={(e) => setCv({ ...cv, date: e.target.value })} aria-label="Date awarded" /></Row>
                <Row k="Certificate #"><input className="fi" value={cv.num} placeholder="Optional" onChange={(e) => setCv({ ...cv, num: e.target.value })} aria-label="Certificate number" /></Row>
                <Row k="Working toward"><select className="fi" value={cv.target} onChange={(e) => setCv({ ...cv, target: e.target.value as Level | '' })} aria-label="Working toward"><option value="">None (not pursuing)</option>{LEVELS.slice(1).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></Row>
                <Row k="Interested">{chk(cv.interest, 'In conversation about the next level', (on) => setCv({ ...cv, interest: on }))}</Row>
              </div>}
            </>}
            {!canCert && <p className="muted" style={{ marginTop: 10 }}>Only the Executive Director and the Certification Committee chair or co-chair can change certifications.</p>}
          </>}

          {tab === 'notes' && isNew && <><div className="sec">First note</div><textarea className="fi" rows={4} value={v.newNote} onChange={set('newNote')} placeholder="How we met, what they're interested in, a call…" aria-label="First note" /></>}
          {tab === 'notes' && !isNew && <>
            <div className="sec">Notes (running log)</div>
            {notes.length === 0 && !p.notes && <p className="muted">No notes yet.</p>}
            {notes.map((n) => <div key={n.id} className="ctc-note">{n.text}<small>{n.by_name ?? 'Institute'} · {new Date(n.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</small></div>)}
            {p.notes && <div className="ctc-note">{p.notes}<small>Imported note</small></div>}
            {canEdit && <div className="ctc-noteform"><textarea value={note} onChange={(e) => setNote(e.target.value)} placeholder="Add a note — how we met, what they're interested in, a call…" /><div className="r"><button type="button" className="b s-btn on-light sm" disabled={busy || !note.trim()} onClick={() => void addTheNote()}>Add note</button></div></div>}
          </>}
        </div>
      </div>
    </div>
  )
}
