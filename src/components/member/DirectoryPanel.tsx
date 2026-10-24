/* ----------------------------------------------------------------------------
 * Directory — everyone in the people table in one list: leads, members (current,
 * recently expired, inactive), vendors and the deceased. One record per person;
 * the tiles are views of it. Board, the Executive Director and the membership
 * chair see everyone; the other committee chairs who use it see members only.
 * Names open the person card (PersonCard), which is also where people are added.
 * -------------------------------------------------------------------------- */
import { friendlyError } from '@/lib/friendlyError'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { inviteAllMembers, loginStatus, type InviteRow } from '@/lib/queries/access'
import { useAccess } from '@/lib/queries/AccessProvider'
import { useDensity } from '@/lib/density'
import { useToast } from '@/components/ui/Toast'
import { displayName } from '@/lib/access'
import { similarPeopleIds } from '@/lib/supabase'
import {
  everyone, membersOnly, vendorDetails, committees as loadCommittees,
  TECHNIQUES, ROLE_LABEL, LEVEL_LABEL, fullName, state, advoLevel, otherCerts,
} from '@/lib/queries/contacts'
import type { Contact, Committee } from '@/lib/queries/contacts'
import { PersonCard, StatusPill, RoleChips, Pill, fmtD } from './PersonCard'
import { chipsFor } from './PersonChips'
import { askConfirm } from './opsUi'
import { DuplicatesDialog } from './DuplicatesDialog'

type Tab = 'all' | 'lead' | 'current' | 'recent' | 'inactive' | 'vendor' | 'deceased'
type Where = Exclude<Tab, 'all' | 'vendor'>
const TABS: [Tab, string][] = [['all', 'Everyone'], ['lead', 'Leads'], ['current', 'Current'], ['recent', 'Recently expired'], ['inactive', 'Inactive'], ['vendor', 'Vendors'], ['deceased', 'Deceased']]
const MEMBER_TABS: Tab[] = ['all', 'current', 'recent', 'inactive', 'deceased']

/* A vendor who is not a doctor or student is not a prospect, so they sit under Vendors, not Leads. */
const vendorOnly = (p: Contact) => !!p.is_vendor && !['doctor', 'student'].includes(p.contact_type ?? '')
/** Which tile a person counts under. Recently expired = lapsed within six months and reactivatable; Inactive = longer. */
function where(p: Contact): Where | null {
  const s = state(p)
  if (s === 'deceased') return 'deceased'
  if (s === 'member') return 'current'
  if (s === 'lead') return vendorOnly(p) ? null : 'lead'
  const days = p.membership_expires ? (Date.now() - Date.parse(p.membership_expires + 'T12:00:00Z')) / 864e5 : Infinity
  return days <= 183 ? 'recent' : 'inactive'
}
const STATUS: Record<Where, string> = { lead: 'Lead', current: 'Member', recent: 'Recently expired', inactive: 'Inactive', deceased: 'Deceased' }
const statusText = (p: Contact) => { const w = where(p); return w ? STATUS[w] : 'Vendor' }
const editIcon = <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" /></svg>

export default function DirectoryPanel() {
  const { access, can } = useAccess()
  const me = displayName(access), meId = access.person?.id ?? null
  const seeAll = can('full_admin') || can('board') || can('manage_leads')
  const canEdit = seeAll
  const canRoles = can('full_admin') || can('board')
  const [rows, setRows] = useState<Contact[]>([])
  const [vendorReady, setVendorReady] = useState(false)
  const [comms, setComms] = useState<Committee[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [tab, setTab] = useState<Tab>('all')
  const [q, setQ] = useState('')
  const [tech, setTech] = useState('')
  const [open, setOpen] = useState<string | null>(null)
  const [openEditing, setOpenEditing] = useState(false) // the pencil opens the card already in edit mode
  const show = (id: string, editing = false) => { setOpenEditing(editing); setOpen(id) }
  const [adding, setAdding] = useState(false) // + Add person opens the same card, empty
  const [invites, setInvites] = useState(false)
  const [dupes, setDupes] = useState(false)
  /* Compact (one row per person) or comfortable (cards), remembered on this device; phones always get the cards. */
  const { compact, narrow, setDensity } = useDensity('aoi.directory.density', canEdit ? 'compact' : 'comfortable')

  const load = useCallback(async () => {
    const [r, v] = await Promise.all([seeAll ? everyone() : membersOnly(), seeAll ? vendorDetails() : Promise.resolve({ rows: [], ready: false })])
    setError(r.error ? `The directory could not be read. ${friendlyError(r.error)}` : null)
    const vend = new Map(v.rows.map((x) => [x.id, x]))
    setRows(r.rows.map((p) => ({ ...p, ...(vend.get(p.id) ?? {}), id: p.id })))
    setVendorReady(v.ready); setLoading(false)
  }, [seeAll])
  useEffect(() => { void load() }, [load])
  useEffect(() => { if (canEdit) void loadCommittees().then(setComms) }, [canEdit])
  // Last sign-in comes from the logins themselves, which only the access function can read.
  const [logins, setLogins] = useState<Record<string, { last_sign_in_at: string | null }> | null>(null)
  useEffect(() => { if (canRoles) void loginStatus().then((r) => setLogins(r?.logins ?? null)).catch(() => {}) }, [canRoles])

  const tabs = TABS.filter(([k]) => seeAll || MEMBER_TABS.includes(k))
  const inTab = (p: Contact, t: Tab) => t === 'all' ? where(p) !== 'deceased' : t === 'vendor' ? !!p.is_vendor : where(p) === t
  const counts = useMemo(() => { const c = Object.fromEntries(TABS.map(([k]) => [k, 0])) as Record<Tab, number>; for (const p of rows) for (const [k] of TABS) if (inTab(p, k)) c[k]++; return c }, [rows])
  const exact = useMemo(() => {
    const t = q.trim().toLowerCase()
    return rows.filter((p) => inTab(p, tab) && (!tech || (p.techniques ?? []).includes(tech)) &&
      (!t || [fullName(p), `${p.first_name} ${p.last_name}`, p.email, (p.other_emails ?? []).join(' '), p.practice_name, p.practice_city, p.practice_state, p.alma_mater, p.office_phone, p.mobile_phone, p.vendor_company, (p.techniques ?? []).join(' ')].filter(Boolean).some((v) => String(v).toLowerCase().includes(t))))
      .sort((a, b) => (a.first_name ?? '').localeCompare(b.first_name ?? '', undefined, { sensitivity: 'base' }) || (a.last_name ?? '').localeCompare(b.last_name ?? '', undefined, { sensitivity: 'base' }))
  }, [rows, tab, q, tech])
  /* Nothing matches what was typed: show the closest names instead, from the
   * database's typo-proof search, best first. */
  const [near, setNear] = useState<{ q: string; ids: string[] }>({ q: '', ids: [] })
  const wantNear = q.trim().length >= 3 && exact.length === 0
  useEffect(() => {
    if (!wantNear) return
    const term = q.trim()
    const t = setTimeout(() => { void similarPeopleIds(term).then((ids) => setNear({ q: term, ids })).catch(() => {}) }, 300)
    return () => clearTimeout(t)
  }, [wantNear, q])
  const closest = wantNear && near.q === q.trim()
    ? rows.filter((p) => near.ids.includes(p.id) && inTab(p, tab) && (!tech || (p.techniques ?? []).includes(tech))).sort((a, b) => near.ids.indexOf(a.id) - near.ids.indexOf(b.id))
    : []
  const list = closest.length ? closest : exact

  function exportCsv() {
    const cols = ['first_name', 'last_name', 'credentials', 'status', 'member_since', 'membership_expires', 'email', 'mobile_phone', 'office_phone', 'practice_name', 'practice_address', 'practice_city', 'practice_state', 'practice_zip', 'practice_website', 'techniques', 'advo_level', 'roles', 'vendor_company', 'alma_mater', 'grad_year', 'npi']
    const val = (p: Contact, c: string) => c === 'status' ? statusText(p) : c === 'techniques' ? (p.techniques ?? []).join('; ') : c === 'advo_level' ? (LEVEL_LABEL[advoLevel(p)] ?? '') : c === 'roles' ? (p.person_roles ?? []).map((r) => (ROLE_LABEL[r.role_key] ?? r.role_key) + (r.committees?.name ? ` (${r.committees.name})` : '')).join('; ') : (p as unknown as Record<string, unknown>)[c]
    const csv = [cols.join(','), ...list.map((p) => cols.map((c) => `"${String(val(p, c) ?? '').replace(/"/g, '""')}"`).join(','))].join('\n')
    const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' })); a.download = `directory-${tab}-${new Date().toISOString().slice(0, 10)}.csv`; a.click(); URL.revokeObjectURL(a.href)
  }

  if (loading) return <><h1>Directory</h1><div className="ma-sub">Reading the directory…</div><div className="ma-panel"><p className="ma-empty">One moment.</p></div></>
  const tabLabel = TABS.find(([k]) => k === tab)![1]
  /* When they last signed in: a date, 'Never', or unknown until the access function answers. */
  const lastIn = (p: Contact) => {
    if (!p.auth_user_id) return 'No login yet'
    const seen = logins?.[p.id]
    return !seen ? '—' : seen.last_sign_in_at ? fmtD(seen.last_sign_in_at.slice(0, 10)) : 'Never'
  }
  const rolesText = (p: Contact) => [...chipsFor(p, advoLevel(p), otherCerts(p)).map((x) => x.label), ...(p.is_vendor ? ['Vendor'] : [])].join(' · ')
  const living = list.filter((p) => !p.deceased_on), gone = list.filter((p) => p.deceased_on)
  const card = (p: Contact) => {
    const line = [p.email ? <a key="e" href={`mailto:${p.email}`} onClick={(e) => e.stopPropagation()}>{p.email}</a> : null, p.office_phone ?? p.practice_phone ?? p.mobile_phone, p.practice_name, [p.practice_city, p.practice_state].filter(Boolean).join(', ')].filter(Boolean)
    return (
      <article key={p.id} className={`ctc${p.deceased_on ? ' dead' : ''}`} tabIndex={0} role="button" aria-label={`Open ${fullName(p)}`} onClick={() => show(p.id)} onKeyDown={(k) => { if ((k.key === 'Enter' || k.key === ' ') && k.target === k.currentTarget) { k.preventDefault(); show(p.id) } }}>
        <div className="nm"><b>{fullName(p)}</b>{vendorOnly(p) ? <Pill>Vendor</Pill> : <StatusPill p={p} />}</div>
        {line.length > 0 && <div className="ln">{line.map((x, i) => <span key={i}>{x}</span>)}</div>}
        <div className="cert-chips" style={{ marginBottom: 0, marginTop: 8 }}><RoleChips p={p} />{p.is_vendor && !vendorOnly(p) && <Pill>Vendor</Pill>}</div>
      </article>
    )
  }
  const line = (p: Contact) => (
    <div className={`mem-row${p.deceased_on ? ' dead' : ''}`} key={p.id} role="button" tabIndex={0} aria-label={`Open ${fullName(p)}`} onClick={() => show(p.id)} onKeyDown={(k) => { if (k.key === 'Enter' && k.target === k.currentTarget) show(p.id) }}>
      <span className="n">{fullName(p)}</span>
      <span className="w ph">{p.office_phone ?? p.practice_phone ?? p.mobile_phone ?? <i>—</i>}</span>
      <span className="w">{p.email ? <a href={`mailto:${p.email}`} onClick={(e) => e.stopPropagation()}>{p.email}</a> : <i>—</i>}</span>
      <span className="w">{statusText(p)}</span>
      <span className="w ph">{p.membership_expires ? fmtD(p.membership_expires) : <i>—</i>}</span>
      <span className="w">{rolesText(p) || <i>—</i>}</span>
      <span className="ac">{canEdit && <button type="button" className="evt-ic" title="Edit" aria-label={`Edit ${fullName(p)}`} onClick={(e) => { e.stopPropagation(); show(p.id, true) }}>{editIcon}</button>}</span>
    </div>
  )
  const table = (items: Contact[]) => <div className="mem-table dir-table"><div className="mem-row head"><span>Name</span><span>Phone</span><span>Email</span><span>Status</span><span>Expires</span><span>Certification &amp; roles</span><span /></div>{items.map(line)}</div>
  const current = open ? rows.find((x) => x.id === open) ?? null : null
  const cardProps = { comms, me, meId, canEdit, canRoles, canInvite: canRoles, canCert: can('manage_certifications'), vendorReady, onChanged: load }

  return (
    <>
      <div className="cert-head">
        <div><h1>Directory</h1><div className="ma-sub" style={{ marginBottom: 0, maxWidth: '80ch' }}>{seeAll ? `Everyone we talk to — ${rows.length} people: leads, members and vendors, one record each.` : `Members, and current or former board members — ${counts.all} people.`} Recently expired = lapsed within six months; Inactive = longer than that.</div></div>
        <div className="cert-actions">{canRoles && <button type="button" className="b s-btn on-light sm" onClick={() => setInvites(true)}>Invite members without a login</button>}{canRoles && seeAll && <button type="button" className="b s-btn on-light sm" onClick={() => setDupes(true)}>Find duplicates</button>}{canEdit && <button type="button" className="b p-btn sm" onClick={() => setAdding(true)}>+ Add person</button>}<button type="button" className="b s-btn on-light sm" onClick={exportCsv}>↓ Export {tab === 'all' ? 'all' : tabLabel.toLowerCase()}</button></div>
      </div>
      {error && <div className="cert-err" role="alert">{error}</div>}
      <div className={`cert-tiles${seeAll ? ' seven' : ''}`}>{tabs.map(([k, l]) => <button type="button" key={k} className={`cert-tile${tab === k ? ' on' : ''}`} onClick={() => setTab(k)} aria-pressed={tab === k}><span>{l}</span><b>{counts[k]}</b></button>)}</div>
      <div className="ctc-srow">
        <div className="cert-search" style={{ margin: 0 }}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></svg>
          <input type="text" value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => e.key === 'Escape' && setQ('')} autoComplete="off" placeholder="Search name, practice, email, city, school…" aria-label="Search the directory" />
          {q && <button type="button" className="clr" aria-label="Clear search" onClick={() => setQ('')}>×</button>}
        </div>
        <select className="fi" style={{ margin: 0 }} value={tech} onChange={(e) => setTech(e.target.value)} aria-label="Filter by technique"><option value="">All techniques</option>{TECHNIQUES.map((t) => <option key={t}>{t}</option>)}</select>
      </div>
      <div className="evt-bar"><span className="cnt">{closest.length ? `No exact match for “${q.trim()}” · ${closest.length} closest name${closest.length === 1 ? '' : 's'}${tech ? ` · ${tech}` : ''} · closest first` : `${list.length} of ${counts[tab]}${q ? ` match “${q}”` : ''}${tech ? ` · ${tech}` : ''} · alphabetical by first name`}</span>
        {!narrow && <div className="evt-segs"><div className="evt-seg"><button type="button" className={compact ? 'on' : ''} onClick={() => setDensity('compact')}>Compact</button><button type="button" className={!compact ? 'on' : ''} onClick={() => setDensity('comfortable')}>Comfortable</button></div></div>}</div>
      {list.length === 0 && <div className="cert-card" style={{ textAlign: 'center', color: 'var(--color-content-muted)', padding: 30 }}>{q ? `No one in ${tabLabel} matches “${q}”.` : tab === 'vendor' && !vendorReady ? 'Vendors appear here once the database has the vendor fields.' : 'No one in this list.'}</div>}
      {living.length > 0 && (compact ? table(living) : living.map(card))}
      {gone.length > 0 && tab !== 'deceased' && <div className="msec">Deceased · {gone.length}</div>}
      {gone.length > 0 && (compact ? table(gone) : gone.map(card))}

      {/* A record opened from Find duplicates sits on top; Escape closes only it. */}
      {dupes && <DuplicatesDialog rows={rows} me={me} lastIn={lastIn} roles={rolesText} onClose={() => { if (!open) setDupes(false) }} onChanged={load} onView={(id) => show(id)} />}
      {invites && <InviteAllDialog onClose={() => { setInvites(false); void load() }} />}
      {current && <PersonCard key={current.id} startEditing={openEditing} p={current} lastIn={lastIn(current)} {...cardProps} onClose={() => setOpen(null)} />}
      {adding && <PersonCard p={null} {...cardProps} onClose={() => setAdding(false)} />}
    </>
  )
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
