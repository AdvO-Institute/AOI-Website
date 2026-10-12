/* ----------------------------------------------------------------------------
 * Members — the roster the Institute runs on.
 *
 * Four tiles filter it: All · Current · Recently expired · Inactive. Someone
 * who has died counts under Inactive and is labelled Deceased, listed in a
 * short section beneath the living. Every list is alphabetical by first name
 * and searchable. Names open the full contact card with a running notes log.
 * -------------------------------------------------------------------------- */
import { friendlyError } from '@/lib/friendlyError'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { inviteAllMembers, loginStatus, type InviteRow } from '@/lib/queries/access'
import { useAccess } from '@/lib/queries/AccessProvider'
import { useDensity } from '@/lib/density'
import { useToast } from '@/components/ui/Toast'
import { displayName } from '@/lib/access'
import {
  roster, state, tabOf, fullName, activeBoard, currentInstructor, advoLevel, otherCerts,
} from '@/lib/queries/members'
import type { Member } from '@/lib/queries/members'
import { Chips as PersonChips, chipsFor } from './PersonChips'
import { CERT_LABEL } from '@/lib/chips'
import { askConfirm } from './opsUi'
import { PersonCard } from './PersonCard'
import { contactById, committees as loadCommittees, type Contact, type Committee } from '@/lib/queries/contacts'

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
  /* The card is the same one Contacts uses, so it reads the full record (offices, background, roles) when a member is opened. */
  const [openContact, setOpenContact] = useState<Contact | null>(null)
  const [comms, setComms] = useState<Committee[]>([])
  useEffect(() => { if (canEdit) void loadCommittees().then(setComms) }, [canEdit])
  useEffect(() => {
    if (!open) { setOpenContact(null); return }
    void contactById(open).then((r) => { if (r.row) setOpenContact(r.row); else toast(r.error ? friendlyError(r.error) : 'Could not read that record.') })
  }, [open, toast])
  const refreshOpen = async () => { await load(); if (open) { const r = await contactById(open); if (r.row) setOpenContact(r.row) } }
  const [adding, setAdding] = useState(false) // + Add member opens the same card, empty
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
        <div className="cert-actions">{canInvite && <button type="button" className="b s-btn on-light sm" onClick={() => setInvites(true)}>Invite members without a login</button>}{canEdit && <button type="button" className="b p-btn sm" onClick={() => setAdding(true)}>+ Add member</button>}<button type="button" className="b s-btn on-light sm" onClick={exportCsv}>↓ Export {tab === 'all' ? 'all' : tabLabel.toLowerCase()}</button></div>
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
      {current && openContact?.id === current.id && <PersonCard key={current.id} startEditing={openEditing} p={openContact} comms={comms} me={me} meId={meId} canEdit={canEdit} canRoles={canInvite} canInvite={canInvite} canCert={can('manage_certifications')} lastIn={lastIn(current)} onClose={() => setOpen(null)} onChanged={refreshOpen} />}
      {adding && <PersonCard p={null} newStatus="active" comms={comms} me={me} meId={meId} canEdit={canEdit} canRoles={canInvite} canInvite={canInvite} canCert={can('manage_certifications')} onClose={() => setAdding(false)} onChanged={load} />}
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
