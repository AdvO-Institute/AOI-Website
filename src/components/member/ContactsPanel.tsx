/* ----------------------------------------------------------------------------
 * Contacts — everyone in the people table: leads, members and expired members
 * in one list, the full contact card (only what is filled in), a stepped
 * Add / Edit form, offices, roles and the running notes log.
 * -------------------------------------------------------------------------- */
import { friendlyError } from '@/lib/friendlyError'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useAccess } from '@/lib/queries/AccessProvider'
import { useDensity } from '@/lib/density'
import { displayName } from '@/lib/access'
import {
  everyone, committees as loadCommittees,
  TECHNIQUES, ROLE_LABEL, LEVEL_LABEL, fullName, state, tabOf, advoLevel, otherCerts,
} from '@/lib/queries/contacts'
import type { Contact, Committee, Tab } from '@/lib/queries/contacts'
import { PersonCard, StatusPill, RoleChips, fmtD } from './PersonCard'
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
  const [adding, setAdding] = useState(false) // + Add contact opens the same card, empty
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
        <div className="cert-actions">{canEdit && <button type="button" className="b p-btn sm" onClick={() => setAdding(true)}>+ Add contact</button>}<button type="button" className="b s-btn on-light sm" onClick={exportCsv}>↓ Export {tab === 'all' ? 'all' : tabLabel.toLowerCase()}</button></div>
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
      {adding && <PersonCard p={null} comms={comms} me={me} meId={meId} canEdit={canEdit} canRoles={canRoles} canInvite={canRoles} canCert={false} onClose={() => setAdding(false)} onChanged={load} />}
    </>
  )
}
