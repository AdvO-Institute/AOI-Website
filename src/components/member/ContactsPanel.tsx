/* ----------------------------------------------------------------------------
 * Contacts — everyone in the people table: leads, members and expired members
 * in one list, the full contact card (only what is filled in), a stepped
 * Add / Edit form, offices, roles and the running notes log.
 * -------------------------------------------------------------------------- */
import { friendlyError } from '@/lib/friendlyError'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useAccess } from '@/lib/queries/AccessProvider'
import { useDensity } from '@/lib/density'
import { useToast } from '@/components/ui/Toast'
import { displayName } from '@/lib/access'
import {
  everyone, committees as loadCommittees,
  TECHNIQUES, ROLE_LABEL, LEVEL_LABEL, fullName, state, tabOf, advoLevel, otherCerts,
} from '@/lib/queries/contacts'
import type { Contact, Committee, Tab } from '@/lib/queries/contacts'
import { PersonCard, StatusPill, RoleChips, useContactForm, fmtD, ROLE_TOGGLES, type ContactForm } from './PersonCard'
import { chipsFor } from './PersonChips'

const TABS: [Tab, string][] = [['all', 'All contacts'], ['lead', 'Leads'], ['member', 'Members'], ['expired', 'Expired']]

const editIcon = <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" /></svg>
/** The status pill's words, for the compact rows. */
function statusText(p: Contact): string {
  const s = state(p)
  if (s === 'deceased') return `Deceased${p.deceased_on ? ` · ${p.deceased_on.slice(0, 4)}` : ''}`
  if (s === 'member') return `Member${p.membership_expires ? ` · exp ${fmtD(p.membership_expires)}` : ''}`
  if (s === 'expired') return `Expired${p.membership_expires ? ` · ${fmtD(p.membership_expires)}` : ''}`
  return 'Lead'
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
  const [openEditing, setOpenEditing] = useState(false) // the pencil opens the card already in edit mode
  const show = (id: string, editing = false) => { setOpenEditing(editing); setOpen(id) }
  const [edit, setEdit] = useState<Contact | 'new' | null>(null)
  /* Compact (one row per contact) or comfortable (cards), remembered on this device; phones always get the cards. */
  const { compact, narrow, setDensity } = useDensity('aoi.contacts.density', canEdit ? 'compact' : 'comfortable')

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
      <article key={p.id} className={`ctc${p.deceased_on ? ' dead' : ''}`} tabIndex={0} role="button" aria-label={`Open ${fullName(p)}`} onClick={() => show(p.id)} onKeyDown={(k) => { if ((k.key === 'Enter' || k.key === ' ') && k.target === k.currentTarget) { k.preventDefault(); show(p.id) } }}>
        <div className="nm"><b>{fullName(p)}</b><StatusPill p={p} /></div>
        {line.length > 0 && <div className="ln">{line.map((x, i) => <span key={i}>{x}</span>)}</div>}
        <div className="cert-chips" style={{ marginBottom: 0, marginTop: 8 }}><RoleChips p={p} /></div>
      </article>
    )
  }
  const line = (p: Contact) => (
    <div className={`mem-row${p.deceased_on ? ' dead' : ''}`} key={p.id} role="button" tabIndex={0} aria-label={`Open ${fullName(p)}`} onClick={() => show(p.id)} onKeyDown={(k) => { if (k.key === 'Enter' && k.target === k.currentTarget) show(p.id) }}>
      <span className="n">{fullName(p)}</span>
      <span className="w">{statusText(p)}</span>
      <span className="w ph">{p.office_phone ?? p.mobile_phone ?? <i>—</i>}</span>
      <span className="w">{p.email ? <a href={`mailto:${p.email}`} onClick={(e) => e.stopPropagation()}>{p.email}</a> : <i>—</i>}</span>
      <span className="w">{chipsFor(p, advoLevel(p), otherCerts(p)).map((x) => x.label).join(' · ') || <i>—</i>}</span>
      <span className="ac">{canEdit && <button type="button" className="evt-ic" title="Edit contact" aria-label={`Edit ${fullName(p)}`} onClick={(e) => { e.stopPropagation(); show(p.id, true) }}>{editIcon}</button>}</span>
    </div>
  )
  const table = (items: Contact[]) => <div className="mem-table ctc-table"><div className="mem-row head"><span>Name</span><span>Status</span><span>Phone</span><span>Email</span><span>Certification &amp; roles</span><span /></div>{items.map(line)}</div>
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
      <div className="evt-bar"><span className="cnt">{list.length} of {counts[tab]}{q ? ` match “${q}”` : ''}{tech ? ` · ${tech}` : ''} · alphabetical by first name</span>
        {!narrow && <div className="evt-segs"><div className="evt-seg"><button type="button" className={compact ? 'on' : ''} onClick={() => setDensity('compact')}>Compact</button><button type="button" className={!compact ? 'on' : ''} onClick={() => setDensity('comfortable')}>Comfortable</button></div></div>}</div>
      {list.length === 0 && <div className="cert-card" style={{ textAlign: 'center', color: 'var(--color-content-muted)', padding: 30 }}>{q ? `No one in ${tabLabel} matches “${q}”.` : 'No one in this list.'}</div>}
      {living.length > 0 && (compact ? table(living) : living.map(row))}
      {gone.length > 0 && <div className="msec">Deceased · {gone.length}</div>}
      {gone.length > 0 && (compact ? table(gone) : gone.map(row))}

      {current && <PersonCard key={current.id} startEditing={openEditing} p={current} comms={comms} me={me} meId={meId} canEdit={canEdit} canRoles={canRoles} canInvite={canRoles} canCert={can('manage_certifications')} onClose={() => setOpen(null)} onChanged={load} />}
      {edit && <EditDialog p={edit === 'new' ? null : edit} comms={comms} canRoles={canRoles} me={me} meId={meId} onClose={() => setEdit(null)} onSaved={async (m) => { setEdit(null); await load(); toast(m) }} />}
    </>
  )
}

/* ------------------------------------------------------------------ card -- */

/* ------------------------------------------------------------------ form -- */

type Step = 'who' | 'practice' | 'bg' | 'member' | 'notes'
const STEPS: [Step, string][] = [['who', 'Name & contact'], ['practice', 'Practice & locations'], ['bg', 'Background'], ['member', 'Membership & roles'], ['notes', 'Notes']]





function F({ l, children, full = false, hint }: { l: string; children: React.ReactNode; full?: boolean; hint?: string }) {
  return <div className={full ? 'full' : ''}><label className="flabel">{l}</label>{children}{hint && <div className="evt-hint">{hint}</div>}</div>
}
function Tog({ on, onChange, l, sub }: { on: boolean; onChange: (ev: React.ChangeEvent<HTMLInputElement>) => void; l: string; sub?: string }) {
  return <label className={`evt-tog${on ? ' on' : ''}`}><input type="checkbox" checked={on} onChange={onChange} /><span><b>{l}</b>{sub && <small>{sub}</small>}</span></label>
}


/* The form's sections. Each renders into a .cert-grid form grid, in the card's tabs and in the Add contact window. */
function WhoFields({ f }: { f: ContactForm }) {
  const { v, set, I, tq, setTq } = f
  return <>
    <div className="full" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 130px', gap: '4px 18px' }}><F l="FIRST NAME *">{I('first_name')}</F><F l="LAST NAME *">{I('last_name')}</F><F l="CREDENTIALS">{I('credentials', 'text', 'DC, BCAO')}</F></div>
    <F l="TITLE">{I('title', 'text', 'e.g. Clinic Director')}</F>
    <F l="CONTACT TYPE"><select className="fi" value={v.contact_type} onChange={set('contact_type')}><option value="doctor">Doctor</option><option value="student">Student</option><option value="staff">Staff / other</option></select></F>
    <F l="EMAIL">{I('email', 'email')}</F><F l="MOBILE">{I('mobile_phone', 'tel')}</F><F l="OFFICE PHONE">{I('office_phone', 'tel')}</F><F l="PERSONAL PHONE">{I('personal_phone', 'tel')}</F>
    <div className="cert-fh full">Technique(s) practiced <span className="evt-hint" style={{ display: 'inline', textTransform: 'none', letterSpacing: 0 }}>— what they practice, not a certification</span></div>
    <div className="full ctc-chk">{TECHNIQUES.map((t) => <label key={t} className={tq.includes(t) ? 'on' : ''}><input type="checkbox" checked={tq.includes(t)} onChange={(e) => setTq((s) => (e.target.checked ? [...new Set([...s, t])] : s.filter((x) => x !== t)))} /> {t}</label>)}</div>
  </>
}
function PracticeFields({ f }: { f: ContactForm }) {
  const { I, offices, setOffices, setOffice } = f
  return <>
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
  </>
}
function BgFields({ f }: { f: ContactForm }) {
  const { p, v, set, I, photoRef, photoBusy, pickPhoto } = f
  return <>
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
  </>
}
function MemberFields({ f, comms }: { f: ContactForm; comms: Committee[] }) {
  const { p, canRoles, v, set, I, seats, setSeats, hasSeat } = f
  const committeeSeats = seats.filter((s) => ['committee_chair', 'committee_cochair', 'committee_member', 'research_director'].includes(s.role_key))
  return <>
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
  </>
}

/** Add a contact: the same fields, stepped, in a window of its own (there is no card to edit yet). */
function EditDialog({ p, comms, canRoles, me, meId, onClose, onSaved }: { p: Contact | null; comms: Committee[]; canRoles: boolean; me: string; meId: string | null; onClose: () => void; onSaved: (m: string) => void }) {
  const f = useContactForm(p, canRoles, me, meId)
  const { v, set } = f
  const [step, setStep] = useState<Step>('who')
  const bodyRef = useRef<HTMLDivElement>(null)
  useEffect(() => { const k = (e: KeyboardEvent) => e.key === 'Escape' && onClose(); document.addEventListener('keydown', k); return () => document.removeEventListener('keydown', k) }, [onClose])
  const idx = STEPS.findIndex((s) => s[0] === step)
  const go = (s: Step) => { setStep(s); bodyRef.current?.scrollTo({ top: 0 }) }
  async function save() {
    const r = await f.save()
    if (!r.ok) { if (r.name) go('who'); return }
    onSaved(r.msg)
  }

  return (
    <div className="cert-veil" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="cert-modal evt-form" role="dialog" aria-modal="true">
        <div className="mh"><div><span className="evt-kick">{p ? 'Edit contact' : 'Add a contact'}</span><h3>{`${v.first_name} ${v.last_name}`.trim() || 'New contact'}</h3>{!p && <p>Only a name is required — a lead takes thirty seconds. Fill more as you learn it.</p>}</div><button type="button" className="x" aria-label="Close" onClick={onClose}>×</button></div>
        <div className="evt-tabs">{STEPS.map(([k, l]) => <button type="button" key={k} className={step === k ? 'on' : ''} onClick={() => go(k)}>{l}</button>)}</div>
        <div className="mb" ref={bodyRef}>
          {f.err && <div className="cert-err">{f.err}</div>}
          <div className="cert-grid mform evt-grid">
            {step === 'who' && <WhoFields f={f} />}
            {step === 'practice' && <PracticeFields f={f} />}
            {step === 'bg' && <BgFields f={f} />}
            {step === 'member' && <MemberFields f={f} comms={comms} />}
            {step === 'notes' && <>
              <F l="NEW NOTE" full hint="Saved to the running log with your name and today's date. Earlier notes stay untouched."><textarea className="fi" rows={6} value={v.newNote} onChange={set('newNote')} placeholder="How we met, what they're interested in, follow-ups…" /></F>
              {(p?.contact_notes ?? []).length > 0 && <div className="full">{[...p!.contact_notes].sort((a, b) => b.created_at.localeCompare(a.created_at)).map((n) => <div key={n.id} className="ctc-note">{n.text}<small>{n.by_name ?? 'Institute'} · {fmtD(n.created_at.slice(0, 10))}</small></div>)}</div>}
            </>}
          </div>
        </div>
        <div className="mf evt-foot">
          <div className="r">{idx > 0 && <button type="button" className="b s-btn on-light sm" onClick={() => go(STEPS[idx - 1]![0])}>‹ {STEPS[idx - 1]![1]}</button>}{idx < STEPS.length - 1 && <button type="button" className="b s-btn on-light sm" onClick={() => go(STEPS[idx + 1]![0])}>{STEPS[idx + 1]![1]} ›</button>}</div>
          <div className="r"><button type="button" className="b s-btn on-light sm" onClick={onClose}>Cancel</button><button type="button" className="b p-btn sm" disabled={f.saving} onClick={() => void save()}>{f.saving ? 'Saving…' : p ? 'Save changes' : 'Save contact'}</button></div>
        </div>
      </div>
    </div>
  )
}

