/* ----------------------------------------------------------------------------
 * Contacts — everyone in the people table: leads, members and expired members
 * in one list, the full contact card (only what is filled in), a stepped
 * Add / Edit form, offices, roles and the running notes log.
 * -------------------------------------------------------------------------- */
import { friendlyError } from '@/lib/friendlyError'
import { webHref } from '@/lib/safeHref'
import { SafeLink } from './opsUi'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { inviteMember, type AccessReply } from '@/lib/queries/access'
import { useAccess } from '@/lib/queries/AccessProvider'
import { uploadPhotoFor } from '@/lib/queries/photo'
import { useToast } from '@/components/ui/Toast'
import { displayName } from '@/lib/access'
import {
  everyone, committees as loadCommittees, saveProfile, createContact, addNote, saveOffices, saveRoles,
  TECHNIQUES, ROLE_LABEL, LEVEL_LABEL, fullName, state, tabOf, duesLapsed, advoLevel, otherCerts, initials,
} from '@/lib/queries/contacts'
import type { Contact, Committee, Office, Profile, Seat, Tab } from '@/lib/queries/contacts'
import { ResearchSection } from './ResearchPanel'
import { Chips, chipsFor } from './PersonChips'
import { INSTRUCTOR_TITLE } from '@/lib/chips'

const TABS: [Tab, string][] = [['all', 'All contacts'], ['lead', 'Leads'], ['member', 'Members'], ['expired', 'Expired']]
const fmtD = (iso?: string | null) => (iso ? new Date(iso + (iso.length === 10 ? 'T12:00:00Z' : '')).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '')

function Pill({ kind = '', children }: { kind?: string; children: React.ReactNode }) { return <span className={`cpill ${kind}`}>{children}</span> }

function StatusPill({ p }: { p: Contact }) {
  const s = state(p)
  if (s === 'deceased') return <Pill kind="dec">Deceased{p.deceased_on ? ` · ${p.deceased_on.slice(0, 4)}` : ''}</Pill>
  if (s === 'member') return <Pill kind="ok">Member{p.membership_expires ? ` · exp ${fmtD(p.membership_expires)}` : ''}</Pill>
  if (s === 'expired') return <Pill kind="warn">Expired{p.membership_expires ? ` · ${fmtD(p.membership_expires)}` : ''}</Pill>
  return <Pill kind="lead">Lead</Pill>
}
function RoleChips({ p }: { p: Contact }) {
  return <Chips list={chipsFor(p, advoLevel(p), otherCerts(p))} />
}

export default function ContactsPanel() {
  const toast = useToast()
  const { access, can } = useAccess()
  const me = displayName(access), meId = access.person?.id ?? null
  const canEdit = can('full_admin') || can('board') || can('manage_leads')
  const canRoles = can('full_admin') || can('board')
  const [rows, setRows] = useState<Contact[]>([])
  const [comms, setComms] = useState<Committee[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [tab, setTab] = useState<Tab>('all')
  const [q, setQ] = useState('')
  const [tech, setTech] = useState('')
  const [open, setOpen] = useState<string | null>(null)
  const [edit, setEdit] = useState<Contact | 'new' | null>(null)

  const load = useCallback(async () => {
    const r = await everyone()
    setError(r.error ? `The contacts could not be read. ${friendlyError(r.error)}` : null)
    setRows(r.rows); setLoading(false)
  }, [])
  useEffect(() => { void load() }, [load])
  useEffect(() => { if (canEdit) void loadCommittees().then(setComms) }, [canEdit])

  const counts = useMemo(() => { const c: Record<Tab, number> = { all: 0, lead: 0, member: 0, expired: 0 }; for (const p of rows) { c.all++; c[tabOf(p)]++ } return c }, [rows])
  const list = useMemo(() => {
    const t = q.trim().toLowerCase()
    return rows.filter((p) => (tab === 'all' || tabOf(p) === tab) && (!tech || (p.techniques ?? []).includes(tech)) &&
      (!t || [fullName(p), p.email, p.practice_name, p.practice_city, p.practice_state, p.alma_mater, p.office_phone, p.mobile_phone, (p.techniques ?? []).join(' ')].filter(Boolean).some((v) => String(v).toLowerCase().includes(t))))
      .sort((a, b) => (a.first_name ?? '').localeCompare(b.first_name ?? '') || (a.last_name ?? '').localeCompare(b.last_name ?? ''))
  }, [rows, tab, q, tech])

  function exportCsv() {
    const cols = ['first_name', 'last_name', 'credentials', 'status', 'member_since', 'membership_expires', 'email', 'mobile_phone', 'office_phone', 'practice_name', 'practice_address', 'practice_city', 'practice_state', 'practice_zip', 'practice_website', 'techniques', 'advo_level', 'roles', 'alma_mater', 'grad_year', 'npi']
    const val = (p: Contact, c: string) => c === 'status' ? state(p) : c === 'techniques' ? (p.techniques ?? []).join('; ') : c === 'advo_level' ? (LEVEL_LABEL[advoLevel(p)] ?? '') : c === 'roles' ? (p.person_roles ?? []).map((r) => (ROLE_LABEL[r.role_key] ?? r.role_key) + (r.committees?.name ? ` (${r.committees.name})` : '')).join('; ') : (p as unknown as Record<string, unknown>)[c]
    const csv = [cols.join(','), ...list.map((p) => cols.map((c) => `"${String(val(p, c) ?? '').replace(/"/g, '""')}"`).join(','))].join('\n')
    const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' })); a.download = `contacts-${tab}-${new Date().toISOString().slice(0, 10)}.csv`; a.click(); URL.revokeObjectURL(a.href)
  }

  if (loading) return <><h1>Contacts</h1><div className="ma-sub">Reading everyone in the Institute database…</div><div className="ma-panel"><p className="ma-empty">One moment.</p></div></>
  const tabLabel = TABS.find(([k]) => k === tab)![1]
  const living = list.filter((p) => !p.deceased_on), gone = list.filter((p) => p.deceased_on)
  const row = (p: Contact) => {
    const line = [p.email ? <a key="e" href={`mailto:${p.email}`} onClick={(e) => e.stopPropagation()}>{p.email}</a> : null, p.office_phone ?? p.mobile_phone, p.practice_name, [p.practice_city, p.practice_state].filter(Boolean).join(', ')].filter(Boolean)
    return (
      <article key={p.id} className={`ctc${p.deceased_on ? ' dead' : ''}`} tabIndex={0} role="button" aria-label={`Open ${fullName(p)}`} onClick={() => setOpen(p.id)} onKeyDown={(k) => { if ((k.key === 'Enter' || k.key === ' ') && k.target === k.currentTarget) { k.preventDefault(); setOpen(p.id) } }}>
        <div className="nm"><b>{fullName(p)}</b><StatusPill p={p} /></div>
        {line.length > 0 && <div className="ln">{line.map((x, i) => <span key={i}>{x}</span>)}</div>}
        <div className="cert-chips" style={{ marginBottom: 0, marginTop: 8 }}><RoleChips p={p} /></div>
      </article>
    )
  }
  const current = open ? rows.find((x) => x.id === open) ?? null : null

  return (
    <>
      <div className="cert-head">
        <div><h1>Contacts</h1><div className="ma-sub" style={{ marginBottom: 0, maxWidth: '80ch' }}>Everyone we talk to — {rows.length} in the database. Members and expired members appear here automatically from the same record; the full prospect list is the Leads tile.</div></div>
        <div className="cert-actions">{canEdit && <button type="button" className="b p-btn sm" onClick={() => setEdit('new')}>+ Add contact</button>}<button type="button" className="b s-btn on-light sm" onClick={exportCsv}>↓ Export {tab === 'all' ? 'all' : tabLabel.toLowerCase()}</button></div>
      </div>
      {error && <div className="cert-err" role="alert">{error}</div>}
      <div className="cert-tiles four">{TABS.map(([k, l]) => <button type="button" key={k} className={`cert-tile${tab === k ? ' on' : ''}`} onClick={() => setTab(k)} aria-pressed={tab === k}><span>{l}</span><b>{counts[k]}</b></button>)}</div>
      <div className="ctc-srow">
        <div className="cert-search" style={{ margin: 0 }}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></svg>
          <input type="text" value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => e.key === 'Escape' && setQ('')} autoComplete="off" placeholder="Search name, practice, email, city, school…" aria-label="Search contacts" />
          {q && <button type="button" className="clr" aria-label="Clear search" onClick={() => setQ('')}>×</button>}
        </div>
        <select className="fi" style={{ margin: 0 }} value={tech} onChange={(e) => setTech(e.target.value)} aria-label="Filter by technique"><option value="">All techniques</option>{TECHNIQUES.map((t) => <option key={t}>{t}</option>)}</select>
      </div>
      <div className="ctc-cnt">{list.length} of {counts[tab]}{q ? ` match “${q}”` : ''}{tech ? ` · ${tech}` : ''} · alphabetical by first name</div>
      {list.length === 0 && <div className="cert-card" style={{ textAlign: 'center', color: 'var(--color-content-muted)', padding: 30 }}>{q ? `No one in ${tabLabel} matches “${q}”.` : 'No one in this list.'}</div>}
      {living.map(row)}
      {gone.length > 0 && <div className="msec">Deceased · {gone.length}</div>}
      {gone.map(row)}

      {current && <ContactCard p={current} me={me} meId={meId} canEdit={canEdit} canInvite={canRoles} onClose={() => setOpen(null)} onEdit={() => { setOpen(null); setEdit(current) }} onChanged={load} />}
      {edit && <EditDialog p={edit === 'new' ? null : edit} comms={comms} canRoles={canRoles} me={me} meId={meId} onClose={() => setEdit(null)} onSaved={async (m) => { setEdit(null); await load(); toast(m) }} />}
    </>
  )
}

/* ------------------------------------------------------------------ card -- */

function ContactCard({ p, me, meId, canEdit, canInvite, onClose, onEdit, onChanged }: { p: Contact; me: string; meId: string | null; canEdit: boolean; canInvite: boolean; onClose: () => void; onEdit: () => void; onChanged: () => Promise<void> }) {
  const toast = useToast()
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  useEffect(() => { const k = (e: KeyboardEvent) => e.key === 'Escape' && onClose(); document.addEventListener('keydown', k); return () => document.removeEventListener('keydown', k) }, [onClose])
  const s = state(p)
  const kv = (k: string, v: React.ReactNode) => (v ? <><span>{k}</span><div>{v}</div></> : null)
  const Sec = ({ title, items }: { title: string; items: React.ReactNode[] }) => { const has = items.some(Boolean); return has ? <><div className="sec">{title}</div><div className="kv">{items}</div></> : null }
  // Many imported addresses already end in "City, ST ZIP"; don't repeat it.
  const tail = [p.practice_city, [p.practice_state, p.practice_zip].filter(Boolean).join(' ')].filter(Boolean).join(', ')
  const addr = p.practice_address && p.practice_city && p.practice_address.toLowerCase().includes(p.practice_city.toLowerCase()) ? p.practice_address : [p.practice_address, tail].filter(Boolean).join(', ')
  const web = (w: string | null) => (w ? <SafeLink href={webHref(w)}>{w}</SafeLink> : null)
  const offices = p.practice_locations ?? []
  const notes = [...(p.contact_notes ?? [])].sort((a, b) => b.created_at.localeCompare(a.created_at))
  async function invite() {
    setBusy(true)
    const r = await inviteMember(p.id).catch((): AccessReply => ({ error: 'network' }))
    setBusy(false)
    if (!r || r.error || r.ok === false) { toast('Could not send it: ' + String(r?.detail ?? r?.error ?? 'unknown').slice(0, 140)); return }
    toast(`Setup link emailed to ${r.email ?? p.email}`)
    await onChanged()
  }
  async function save() {
    if (!note.trim()) return
    setBusy(true); const r = await addNote(p.id, note.trim(), me, meId); setBusy(false)
    if (r.error) { toast('The note could not be saved. ' + friendlyError(r.error)); return }
    setNote(''); await onChanged(); toast('Note added')
  }
  return (
    <div className="cert-veil" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="cert-modal ctc-card cc" role="dialog" aria-modal="true">
        <div className="ctc-top"><div className="av">{p.photo_url ? <img src={p.photo_url} alt="" onError={(e) => (e.currentTarget.style.display = 'none')} /> : initials(p)}</div>
          <div style={{ flex: 1, minWidth: 0 }}><h3>{fullName(p)}</h3>{p.title && <div className="ti">{p.title}</div>}<div className="cert-chips" style={{ marginBottom: 0 }}><StatusPill p={p} /><RoleChips p={p} /></div></div>
          <button type="button" className="x" aria-label="Close" onClick={onClose}>×</button></div>
        <div className="ctc-body">
          <Sec title="Contact" items={[kv('Email', p.email ? <a href={`mailto:${p.email}`}>{p.email}</a> : null), kv('Mobile', p.mobile_phone), kv('Office', p.office_phone ?? p.practice_phone), kv('Personal', p.personal_phone)]} />
          <Sec title="Practice" items={[kv('Practice', p.practice_name), kv('Address', addr ? <>{addr}<br /><a href={`https://maps.google.com/?q=${encodeURIComponent([p.practice_name, addr].filter(Boolean).join(', '))}`} target="_blank" rel="noreferrer">Open in maps</a></> : null), kv('Website', web(p.practice_website))]} />
          {offices.length > 0 && <><div className="sec">Other offices</div>{offices.map((o) => <div key={o.id} className="kv" style={{ marginBottom: 10 }}>{kv(o.name || 'Office', <>{[o.address, [o.city, [o.state, o.zip].filter(Boolean).join(' ')].filter(Boolean).join(', ')].filter(Boolean).join(', ')}{o.phone ? <><br />{o.phone}</> : null}{o.website ? <><br />{web(o.website)}</> : null}{(o.is_internship_site || o.is_seminar_venue) && <div className="cert-chips" style={{ marginTop: 6, marginBottom: 0 }}>{o.is_internship_site && <Pill>Internship site</Pill>}{o.is_seminar_venue && <Pill>Seminar venue</Pill>}</div>}</>)}</div>)}</>}
          <Sec title="Classification" items={[kv('Type', p.contact_type === 'doctor' ? 'Doctor' : p.contact_type === 'student' ? 'Student' : p.contact_type === 'staff' ? 'Staff' : p.contact_type), kv('Technique(s)', (p.techniques ?? []).join(', '))]} />
          <Sec title="Background" items={[kv('Chiropractic college', p.alma_mater), kv('Graduated', p.grad_year), kv('NPI', p.npi)]} />
          <Sec title="Membership" items={s === 'lead' ? [kv('Status', 'Never a member')] : [kv('Status', s === 'member' ? (duesLapsed(p) ? 'Current — dues lapsed, stays current as a Director' : 'Current member') : s === 'expired' ? 'Expired' : 'Deceased'), kv('Member since', fmtD(p.member_since)), kv(s === 'member' && !duesLapsed(p) ? 'Renews' : 'Dues lapsed on', fmtD(p.membership_expires)), kv('Online account', p.auth_user_id ? 'Yes' : null), kv('Profile', p.profile_completed ? 'Complete' : null)]} />
          {(p.person_roles ?? []).length > 0 && <><div className="sec">Roles &amp; committees</div>{(p.person_roles ?? []).map((r) => <div key={r.id} className="ctc-note" style={{ padding: '8px 12px' }}>{ROLE_LABEL[r.role_key] ?? r.role_key}{r.committees?.name ? ` · ${r.committees.name}` : ''}{r.instructor_level ? ` · ${INSTRUCTOR_TITLE[r.instructor_level] ?? r.instructor_level}` : ''}</div>)}</>}
          <Sec title="Board service" items={(p.board_service ?? []).map((b) => kv(`Term ${b.term_label ?? ''}`, `${b.status ?? ''}${b.term_start ? ` · ${fmtD(b.term_start)} – ${b.term_end ? fmtD(b.term_end) : 'present'}` : ''}`))} />
          <Sec title="Instructor" items={(p.instructor_records ?? []).map((i) => kv(i.level === 'senior_instructor' ? 'Senior instructor' : 'Instructor', `${i.status ?? ''}${i.technique ? ` · ${i.technique}` : ''}${i.instructor_date ? ` · since ${fmtD(i.instructor_date)}` : ''}`))} />
          <Sec title="Certifications" items={(p.person_certifications ?? []).map((c) => kv(c.technique, `${LEVEL_LABEL[c.level] ?? c.level}${c.grandfathered ? ' · Grandfathered' : ''}${c.cert_date ? ` on ${fmtD(c.cert_date)}` : ''}${c.certificate_number ? ` · Certificate #${c.certificate_number}` : ''}${c.certified_by ? ` · ${c.certified_by}` : ''}`))} />
          <ResearchSection personId={p.id} />
          {p.bio && <><div className="sec">Bio</div><p style={{ fontSize: 14, lineHeight: 1.6, margin: 0 }}>{p.bio}</p></>}
          <div className="sec">Notes (running log)</div>
          {notes.length === 0 && !p.notes && <p className="muted">No notes yet.</p>}
          {notes.map((n) => <div key={n.id} className="ctc-note">{n.text}<small>{n.by_name ?? 'Institute'} · {new Date(n.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</small></div>)}
          {p.notes && <div className="ctc-note">{p.notes}<small>Imported note</small></div>}
          {canEdit && <div className="ctc-noteform"><textarea value={note} onChange={(e) => setNote(e.target.value)} placeholder="Add a note — how we met, what they're interested in, a call…" /><div className="r"><button type="button" className="b s-btn on-light sm" disabled={busy || !note.trim()} onClick={() => void save()}>Add note</button></div></div>}
        </div>
        <div className="mf evt-foot">
          <div className="r">{canEdit && s === 'lead' && <span className="evt-hint" style={{ alignSelf: 'center' }}>Becomes a member automatically when they join on the website.</span>}</div>
          <div className="r">{canInvite && p.email && <button type="button" className="b s-btn on-light sm" disabled={busy} onClick={() => void invite()}>{p.auth_user_id ? 'Resend account link' : 'Invite to members area'}</button>}{canEdit && <button type="button" className="b s-btn on-light sm" onClick={onEdit}>Edit</button>}<button type="button" className="b p-btn sm" onClick={onClose}>Close</button></div>
        </div>
      </div>
    </div>
  )
}

/* ------------------------------------------------------------------ form -- */

type Step = 'who' | 'practice' | 'bg' | 'member' | 'notes'
const STEPS: [Step, string][] = [['who', 'Name & contact'], ['practice', 'Practice & locations'], ['bg', 'Background'], ['member', 'Membership & roles'], ['notes', 'Notes']]
type V = Record<string, string>
const ROLE_TOGGLES = ['executive_director', 'board_member', 'board_chair', 'vice_chair', 'secretary', 'instructor', 'past_board_member', 'past_executive_director']

function F({ l, children, full = false, hint }: { l: string; children: React.ReactNode; full?: boolean; hint?: string }) {
  return <div className={full ? 'full' : ''}><label className="flabel">{l}</label>{children}{hint && <div className="evt-hint">{hint}</div>}</div>
}
function Tog({ on, onChange, l, sub }: { on: boolean; onChange: (ev: React.ChangeEvent<HTMLInputElement>) => void; l: string; sub?: string }) {
  return <label className={`evt-tog${on ? ' on' : ''}`}><input type="checkbox" checked={on} onChange={onChange} /><span><b>{l}</b>{sub && <small>{sub}</small>}</span></label>
}

function EditDialog({ p, comms, canRoles, me, meId, onClose, onSaved }: { p: Contact | null; comms: Committee[]; canRoles: boolean; me: string; meId: string | null; onClose: () => void; onSaved: (m: string) => void }) {
  const [v, setV] = useState<V>(() => ({
    first_name: p?.first_name ?? '', last_name: p?.last_name ?? '', credentials: p?.credentials ?? 'DC', title: p?.title ?? '', contact_type: p?.contact_type ?? 'doctor',
    email: p?.email ?? '', mobile_phone: p?.mobile_phone ?? '', office_phone: p?.office_phone ?? '', personal_phone: p?.personal_phone ?? '',
    practice_name: p?.practice_name ?? '', practice_address: p?.practice_address ?? '', practice_city: p?.practice_city ?? '', practice_state: p?.practice_state ?? '', practice_zip: p?.practice_zip ?? '', practice_phone: p?.practice_phone ?? '', practice_website: p?.practice_website ?? '',
    alma_mater: p?.alma_mater ?? '', grad_year: p?.grad_year ? String(p.grad_year) : '', npi: p?.npi ?? '', photo_url: p?.photo_url ?? '', bio: p?.bio ?? '',
    membership_status: p?.deceased_on ? 'deceased' : (p?.membership_status ?? 'never'), deceased_on: p?.deceased_on ?? '', member_since: p?.member_since ?? '', membership_expires: p?.membership_expires ?? '', newNote: '',
  }))
  const [tq, setTq] = useState<string[]>(p?.techniques ?? [])
  const [offices, setOffices] = useState<Office[]>(p?.practice_locations ?? [])
  const [seats, setSeats] = useState<Seat[]>((p?.person_roles ?? []).map((r) => ({ role_key: r.role_key, committee_id: r.committee_id })))
  const instrLevel = (p?.person_roles ?? []).find((r) => r.role_key === 'instructor')?.instructor_level ?? null
  const [step, setStep] = useState<Step>('who')
  const [err, setErr] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const bodyRef = useRef<HTMLDivElement>(null)
  useEffect(() => { const k = (e: KeyboardEvent) => e.key === 'Escape' && onClose(); document.addEventListener('keydown', k); return () => document.removeEventListener('keydown', k) }, [onClose])
  const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => setV((s) => ({ ...s, [k]: e.target.value }))
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
  const I = (k: string, type = 'text', ph = '') => <input className="fi" type={type} value={v[k] ?? ''} onChange={set(k)} placeholder={ph} />
  const setOffice = (i: number, patch: Partial<Office>) => setOffices((o) => o.map((x, j) => (j === i ? { ...x, ...patch } : x)))
  const hasSeat = (k: string) => seats.some((s) => s.role_key === k)
  const committeeSeats = seats.filter((s) => ['committee_chair', 'committee_cochair', 'committee_member', 'research_director'].includes(s.role_key))
  const idx = STEPS.findIndex((s) => s[0] === step)
  const go = (s: Step) => { setStep(s); bodyRef.current?.scrollTo({ top: 0 }) }

  async function save() {
    setErr(null)
    if (!v.first_name!.trim() || !v.last_name!.trim()) { go('who'); setErr('First and last name are required.'); return }
    const dead = v.membership_status === 'deceased'
    const prof: Profile = {
      first_name: v.first_name!.trim(), last_name: v.last_name!.trim(), credentials: v.credentials || null, title: v.title || null, contact_type: v.contact_type || 'doctor',
      email: v.email || null, mobile_phone: v.mobile_phone || null, office_phone: v.office_phone || null, personal_phone: v.personal_phone || null,
      practice_name: v.practice_name || null, practice_address: v.practice_address || null, practice_city: v.practice_city || null, practice_state: v.practice_state || null, practice_zip: v.practice_zip || null, practice_phone: v.practice_phone || null, practice_website: v.practice_website || null,
      alma_mater: v.alma_mater || null, grad_year: v.grad_year ? Number(v.grad_year) : null, npi: v.npi || null, photo_url: v.photo_url || null, bio: v.bio || null,
      techniques: tq, member_since: v.member_since || null, membership_expires: v.membership_expires || null,
      deceased_on: dead ? (v.deceased_on || new Date().toISOString().slice(0, 10)) : null,
    }
    if (!dead) prof.membership_status = v.membership_status
    setSaving(true)
    let id = p?.id ?? null
    if (id) { const r = await saveProfile(id, prof); if (r.error) { setSaving(false); setErr(friendly(r.error)); return } }
    else { const r = await createContact(prof); if (r.error || !r.id) { setSaving(false); setErr(friendly(r.error ?? 'no id returned')); return }; id = r.id }
    const o = await saveOffices(id, offices); if (o.error) { setSaving(false); setErr('Saved, but the extra offices were not. ' + friendlyError(o.error)); return }
    if (canRoles) { const r = await saveRoles(id, seats, instrLevel); if (r.error) { setSaving(false); setErr('Saved, but the roles were not. ' + friendlyError(r.error)); return } }
    if (v.newNote && v.newNote.trim()) { const n = await addNote(id, v.newNote.trim(), me, meId); if (n.error) { setSaving(false); setErr('Saved, but the note was not. ' + friendlyError(n.error)); return } }
    setSaving(false)
    onSaved(p ? 'Saved.' : `${prof.first_name} ${prof.last_name} added${prof.membership_status === 'never' || !prof.membership_status ? ' as a lead' : ''}.`)
  }

  return (
    <div className="cert-veil" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="cert-modal evt-form" role="dialog" aria-modal="true">
        <div className="mh"><div><span className="evt-kick">{p ? 'Edit contact' : 'Add a contact'}</span><h3>{`${v.first_name} ${v.last_name}`.trim() || 'New contact'}</h3>{!p && <p>Only a name is required — a lead takes thirty seconds. Fill more as you learn it.</p>}</div><button type="button" className="x" aria-label="Close" onClick={onClose}>×</button></div>
        <div className="evt-tabs">{STEPS.map(([k, l]) => <button type="button" key={k} className={step === k ? 'on' : ''} onClick={() => go(k)}>{l}</button>)}</div>
        <div className="mb" ref={bodyRef}>
          {err && <div className="cert-err">{err}</div>}
          <div className="cert-grid mform evt-grid">
            {step === 'who' && <>
              <div className="full" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 130px', gap: '4px 18px' }}><F l="FIRST NAME *">{I('first_name')}</F><F l="LAST NAME *">{I('last_name')}</F><F l="CREDENTIALS">{I('credentials', 'text', 'DC, BCAO')}</F></div>
              <F l="TITLE">{I('title', 'text', 'e.g. Clinic Director')}</F>
              <F l="CONTACT TYPE"><select className="fi" value={v.contact_type} onChange={set('contact_type')}><option value="doctor">Doctor</option><option value="student">Student</option><option value="staff">Staff / other</option></select></F>
              <F l="EMAIL">{I('email', 'email')}</F><F l="MOBILE">{I('mobile_phone', 'tel')}</F><F l="OFFICE PHONE">{I('office_phone', 'tel')}</F><F l="PERSONAL PHONE">{I('personal_phone', 'tel')}</F>
              <div className="cert-fh full">Technique(s) practiced <span className="evt-hint" style={{ display: 'inline', textTransform: 'none', letterSpacing: 0 }}>— what they practice, not a certification</span></div>
              <div className="full ctc-chk">{TECHNIQUES.map((t) => <label key={t} className={tq.includes(t) ? 'on' : ''}><input type="checkbox" checked={tq.includes(t)} onChange={(e) => setTq((s) => (e.target.checked ? [...new Set([...s, t])] : s.filter((x) => x !== t)))} /> {t}</label>)}</div>
            </>}
            {step === 'practice' && <>
              <div className="ctc-locbox full"><div className="hd"><span>Primary office</span></div>
                <F l="PRACTICE NAME" full>{I('practice_name')}</F><F l="STREET ADDRESS" full>{I('practice_address')}</F>
                <div className="full" style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr', gap: '4px 10px' }}><F l="CITY">{I('practice_city')}</F><F l="STATE">{I('practice_state')}</F><F l="ZIP">{I('practice_zip')}</F></div>
                <F l="PRACTICE PHONE">{I('practice_phone', 'tel')}</F><F l="WEBSITE">{I('practice_website', 'text', 'https://…')}</F>
              </div>
              {offices.map((o, i) => <div key={i} className="ctc-locbox full"><div className="hd"><span>Office {i + 2}</span><button type="button" aria-label="Remove office" onClick={() => setOffices((s) => s.filter((_, j) => j !== i))}>×</button></div>
                <F l="PRACTICE NAME" full><input className="fi" value={o.name ?? ''} onChange={(e) => setOffice(i, { name: e.target.value })} /></F>
                <F l="STREET ADDRESS" full><input className="fi" value={o.address ?? ''} onChange={(e) => setOffice(i, { address: e.target.value })} /></F>
                <div className="full" style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr', gap: '4px 10px' }}><F l="CITY"><input className="fi" value={o.city ?? ''} onChange={(e) => setOffice(i, { city: e.target.value })} /></F><F l="STATE"><input className="fi" value={o.state ?? ''} onChange={(e) => setOffice(i, { state: e.target.value })} /></F><F l="ZIP"><input className="fi" value={o.zip ?? ''} onChange={(e) => setOffice(i, { zip: e.target.value })} /></F></div>
                <F l="OFFICE PHONE"><input className="fi" value={o.phone ?? ''} onChange={(e) => setOffice(i, { phone: e.target.value })} /></F><F l="WEBSITE"><input className="fi" value={o.website ?? ''} onChange={(e) => setOffice(i, { website: e.target.value })} /></F>
                <div className="full evt-togrow"><Tog on={!!o.is_internship_site} onChange={(e) => setOffice(i, { is_internship_site: e.target.checked })} l="Internship site" sub="Appears under Internships" /><Tog on={!!o.is_seminar_venue} onChange={(e) => setOffice(i, { is_seminar_venue: e.target.checked })} l="Seminar venue" sub="Available in the Events venue list" /></div>
              </div>)}
              <div className="full"><button type="button" className="b s-btn on-light xs" onClick={() => setOffices((s) => [...s, { name: '', address: '', city: '', state: '', zip: '', phone: '', website: '', is_primary: false, is_internship_site: false, is_seminar_venue: false }])}>+ Add another office</button></div>
            </>}
            {step === 'bg' && <>
              <F l="CHIROPRACTIC COLLEGE">{I('alma_mater', 'text', 'e.g. Life University')}</F><F l="GRADUATION YEAR">{I('grad_year', 'number', '2012')}</F>
              <F l="NPI NUMBER">{I('npi', 'text', '10 digits')}</F>
              <F l="HEADSHOT" full hint={p ? 'Members can add their own under My Account. Upload one here, or paste a link.' : 'Save the contact first, then upload a photo.'}>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  {v.photo_url && <span className="ctc-top" style={{ display: 'contents' }}><span className="av" style={{ width: 40, height: 40, fontSize: 13 }}><img src={v.photo_url} alt="" onError={(e) => (e.currentTarget.style.display = 'none')} /></span></span>}
                  {I('photo_url', 'url', 'https://…')}
                  {p && <><input ref={photoRef} type="file" accept="image/*" hidden onChange={(e) => void pickPhoto(e.target.files?.[0])} /><button type="button" className="b s-btn on-light xs" disabled={photoBusy} onClick={() => photoRef.current?.click()}>{photoBusy ? 'Uploading…' : 'Upload'}</button></>}
                </div>
              </F>
              <F l="BIO" full><textarea className="fi" rows={4} value={v.bio} onChange={set('bio')} placeholder="Shown on the public directory once they are a member." /></F>
            </>}
            {step === 'member' && <>
              <F l="MEMBERSHIP STATUS" hint="Joining on the website sets this automatically; change it here only for a manual renewal."><select className="fi" value={v.membership_status} onChange={set('membership_status')}><option value="never">Never a member</option><option value="active">Current member</option><option value="expired">Expired</option><option value="deceased">Deceased</option></select></F>
              {v.membership_status === 'deceased' ? <F l="DATE OF DEATH">{I('deceased_on', 'date')}</F> : <F l="MEMBER SINCE">{I('member_since', 'date')}</F>}
              <F l="MEMBERSHIP EXPIRES (RENEWAL)">{I('membership_expires', 'date')}</F>
              <F l="ADVO CERTIFICATION" hint="Set on the Certifications tab, not here."><input className="fi" value={LEVEL_LABEL[advoLevel(p ?? ({ person_certifications: [], cert_level: null } as unknown as Contact))] || 'Not certified'} disabled /></F>
              <div className="cert-fh full">Roles {!canRoles && <span className="evt-hint" style={{ display: 'inline', textTransform: 'none', letterSpacing: 0 }}>— board and the executive director assign roles</span>}</div>
              <div className="full evt-togrow">{ROLE_TOGGLES.map((k) => <Tog key={k} on={hasSeat(k)} onChange={(e) => canRoles && setSeats((s) => (e.target.checked ? [...s, { role_key: k, committee_id: null }] : s.filter((x) => x.role_key !== k)))} l={ROLE_LABEL[k]!} />)}</div>
              <div className="cert-fh full">Committee seats</div>
              <div className="full evt-rows">{committeeSeats.length === 0 && <p className="muted">No committee seats.</p>}{seats.map((s, i) => ['committee_chair', 'committee_cochair', 'committee_member', 'research_director'].includes(s.role_key) ? <div key={i} className="rr" style={{ gridTemplateColumns: '1fr 180px auto' }}>
                <select className="fi" value={s.committee_id ?? ''} disabled={!canRoles} onChange={(e) => setSeats((all) => all.map((x, j) => (j === i ? { ...x, committee_id: e.target.value ? Number(e.target.value) : null } : x)))}><option value="">— committee —</option>{comms.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select>
                <select className="fi" value={s.role_key} disabled={!canRoles} onChange={(e) => setSeats((all) => all.map((x, j) => (j === i ? { ...x, role_key: e.target.value } : x)))}><option value="committee_chair">Chair</option><option value="committee_cochair">Co-Chair</option><option value="committee_member">Member</option><option value="research_director">Research Director</option></select>
                <button type="button" className="del" aria-label="Remove seat" disabled={!canRoles} onClick={() => setSeats((all) => all.filter((_, j) => j !== i))}>×</button></div> : null)}</div>
              {canRoles && <div className="full"><button type="button" className="b s-btn on-light xs" onClick={() => setSeats((s) => [...s, { role_key: 'committee_member', committee_id: null }])}>+ Add committee seat</button></div>}
            </>}
            {step === 'notes' && <>
              <F l="NEW NOTE" full hint="Saved to the running log with your name and today's date. Earlier notes stay untouched."><textarea className="fi" rows={6} value={v.newNote} onChange={set('newNote')} placeholder="How we met, what they're interested in, follow-ups…" /></F>
              {(p?.contact_notes ?? []).length > 0 && <div className="full">{[...p!.contact_notes].sort((a, b) => b.created_at.localeCompare(a.created_at)).map((n) => <div key={n.id} className="ctc-note">{n.text}<small>{n.by_name ?? 'Institute'} · {fmtD(n.created_at.slice(0, 10))}</small></div>)}</div>}
            </>}
          </div>
        </div>
        <div className="mf evt-foot">
          <div className="r">{idx > 0 && <button type="button" className="b s-btn on-light sm" onClick={() => go(STEPS[idx - 1]![0])}>‹ {STEPS[idx - 1]![1]}</button>}{idx < STEPS.length - 1 && <button type="button" className="b s-btn on-light sm" onClick={() => go(STEPS[idx + 1]![0])}>{STEPS[idx + 1]![1]} ›</button>}</div>
          <div className="r"><button type="button" className="b s-btn on-light sm" onClick={onClose}>Cancel</button><button type="button" className="b p-btn sm" disabled={saving} onClick={() => void save()}>{saving ? 'Saving…' : p ? 'Save changes' : 'Save contact'}</button></div>
        </div>
      </div>
    </div>
  )
}

function friendly(err: string): string {
  if (/row-level security/.test(err)) return 'You don’t have permission for that. Only board, the executive director and the membership committee chair can change contacts.'
  if (/duplicate key/.test(err)) return 'Someone with that key already exists.'
  return friendlyError(err)
}
