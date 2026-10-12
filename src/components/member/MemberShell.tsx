/* ----------------------------------------------------------------------------
 * The signed-in member area.
 *
 * The rail is generated from the capability list, so what a person sees is a
 * consequence of the roles they hold. Assigning a role in the roster is the
 * only administrative act needed — no code changes, no per-person switches.
 *
 * Who is signed in, and Sign Out, live in the header's account menu only.
 * -------------------------------------------------------------------------- */
import { useEffect, useState } from 'react'
import { Link, useLocation, useNavigate } from '@/lib/router'
import { useAccess } from '@/lib/queries/AccessProvider'
import { navFor, findNav, railKey, isCommittee, FOLDS, GROUP_LABEL } from '@/lib/nav'
import type { NavGroup } from '@/lib/nav'
import { roleLabel } from '@/lib/access'
import { roleChipClass } from '@/lib/chips'
import { session, signOut } from '@/lib/supabase'
import { attention, EMPTY, markEventsSeen, logSignInOnce, logActivity } from '@/lib/queries/attention'
import type { Attention } from '@/lib/queries/attention'
import MemberPanel from './MemberPanel'
import Overview from './Overview'

const RAIL_KEY = 'aoi-rail-open'

/** Waits for access to be settled before the shell draws anything that depends
 *  on who this is. Until then — the first read in flight, or failed — a neutral
 *  frame of the same shape holds the spot, so a Director never sees the
 *  plain-member rail and a member never sees the sign-in card (#103). */
export default function MemberShell() {
  const { ready, loading, error, refresh } = useAccess()
  if (ready) return <Shell />
  return (
    <div className="ma">
      <div className="ma-railwrap">
        <button type="button" className="ma-railbtn" disabled>
          <span className="lbl">Menu</span>
          <b>Overview</b>
        </button>
        <nav id="ma-rail" className="ma-rail" aria-hidden="true" />
      </div>
      <main className="ma-main" aria-busy={loading || undefined}>
        <h1>Member Area</h1>
        <p className="ma-empty" role="status">{error ?? 'Checking your access…'}</p>
        {error && (
          <p className="ma-access-note">
            <button type="button" onClick={() => void refresh()}>Try again</button>
            <button type="button" onClick={() => { void signOut(); void refresh() }}>Sign out</button>
          </p>
        )}
      </main>
    </div>
  )
}

function Shell() {
  const { access, error, refresh } = useAccess()
  const navigate = useNavigate()
  const { hash } = useLocation()
  const groups = navFor(access)

  // The rail uses the hash so a tab can be linked to and the back button works,
  // without adding 20 indexable routes to a page that must stay noindex.
  const requested = (hash || '#overview').slice(1)
  const allowed = groups.some((g) => g.items.some((i) => i.key === requested))
  const [tab, setTab] = useState(allowed ? requested : 'overview')

  useEffect(() => {
    const next = (hash || '#overview').slice(1)
    const ok = groups.some((g) => g.items.some((i) => i.key === next))
    setTab(ok ? next : 'overview')
  }, [hash, access])

  const item = findNav(tab)
  const here = railKey(tab)
  const tabs = groups.flatMap((g) => g.items).filter((i) => i.key === here || i.under === here)

  // Folded groups: shut until opened. Arriving on a tab opens its group; any group can be shut again.
  // Which groups were left open is remembered in this browser, so the rail looks the same next visit.
  const [opened, setOpened] = useState<Set<NavGroup>>(() => {
    try { return new Set(JSON.parse(localStorage.getItem(RAIL_KEY) ?? '[]') as NavGroup[]) } catch { return new Set() }
  })
  useEffect(() => { try { localStorage.setItem(RAIL_KEY, JSON.stringify([...opened])) } catch { /* private window */ } }, [opened])
  const hereGroup = groups.find((g) => g.items.some((i) => i.key === here))?.group
  useEffect(() => { if (hereGroup) setOpened((o) => (o.has(hereGroup) ? o : new Set(o).add(hereGroup))) }, [hereGroup])
  // Committees this person chairs or co-chairs stand out in the rail.
  const chairs = (stem?: string) => Boolean(stem) && access.committees.some((c) => c.leads && isCommittee(c, stem!))
  const hasMine = groups.some((g) => g.group === 'mycommittees')
  const toggle = (g: NavGroup) => setOpened((o) => { const n = new Set(o); if (n.has(g)) n.delete(g); else n.add(g); return n })

  // Red dots: what needs this person right now — a report they owe, a task due, new registrations.
  const [att, setAtt] = useState<Attention>(EMPTY)
  const uid = session.user?.id ?? null
  useEffect(() => {
    let alive = true
    logSignInOnce(uid)
    const run = () => { void attention(access, uid).then((a) => { if (alive) setAtt(a) }) }
    run()
    const t = setInterval(run, 5 * 60 * 1000)
    return () => { alive = false; clearInterval(t) }
  }, [access, uid, tab])
  useEffect(() => {
    void logActivity('tab_open', tab)
    if (tab === 'events') { markEventsSeen(uid); setAtt((a) => ({ ...a, events: { count: 0 } })) }
  }, [tab, uid])
  const dot = (key: string): { n: number; urgent: boolean; title: string } | null => {
    if (key === 'reports' && att.reports.count) return { n: att.reports.count, urgent: att.reports.overdue, title: att.reports.label }
    if (key === 'tasks' && att.tasks.count) return { n: att.tasks.count, urgent: att.tasks.overdue > 0, title: att.tasks.overdue ? `${att.tasks.overdue} overdue` : `${att.tasks.count} due soon` }
    if (key === 'events' && att.events.count) return { n: att.events.count, urgent: false, title: `${att.events.count} new registration${att.events.count > 1 ? 's' : ''}` }
    return null
  }

  // On a phone the rail folds away behind one button; picking a page closes it again.
  const [railOpen, setRailOpen] = useState(false)
  useEffect(() => setRailOpen(false), [tab])
  // While it is open the page behind stays put, and a tap outside the menu closes it.
  useEffect(() => {
    if (!railOpen) return
    const was = document.documentElement.style.overflow
    document.documentElement.style.overflow = 'hidden'
    const onDown = (e: PointerEvent) => { if (!(e.target as Element).closest?.('.ma-railwrap')) setRailOpen(false) }
    document.addEventListener('pointerdown', onDown)
    return () => { document.documentElement.style.overflow = was; document.removeEventListener('pointerdown', onDown) }
  }, [railOpen])
  const anyDot = groups.some((g) => g.items.some((i) => dot(i.key)))

  return (
    <>
      <div className="ma">
        <div className="ma-railwrap">
          <button type="button" className="ma-railbtn" aria-expanded={railOpen} aria-controls="ma-rail" onClick={() => setRailOpen((v) => !v)}>
            <span className="lbl">Menu</span>
            <b>{findNav(here)?.label ?? 'Overview'}</b>
            {!railOpen && anyDot && <span className="ma-dot" aria-hidden="true" />}
          </button>
          <nav id="ma-rail" className={`ma-rail${railOpen ? ' open' : ''}`} aria-label="Member area">
            {groups.map((group) => {
              const folds = FOLDS.includes(group.group)
              const open = !folds || opened.has(group.group)
              const dots = group.items.some((i) => dot(i.key))
              return (
                <div key={group.group} className={open ? undefined : 'shut'}>
                  {folds ? (
                    <button type="button" className="grp" aria-expanded={open} onClick={() => toggle(group.group)}>
                      {group.group === 'committees' && hasMine ? 'Other Committees' : GROUP_LABEL[group.group]}
                      {!open && dots && <span className="ma-dot" aria-hidden="true" />}
                    </button>
                  ) : (
                    <span className="grp">{GROUP_LABEL[group.group]}</span>
                  )}
                  {group.items.filter((nav) => !nav.under).map((nav) => (
                    <Link
                      key={nav.key}
                      to={`/account#${nav.key}`}
                      className={[nav.key === here ? 'on' : '', chairs(nav.committee) ? 'lead' : ''].filter(Boolean).join(' ') || undefined}
                      aria-current={nav.key === here ? 'page' : undefined}
                    >
                      <span>
                        {nav.label}
                        {chairs(nav.committee) && <span className="ma-lead">Chair</span>}
                      </span>
                      {dot(nav.key) && <span className={`ma-dot${dot(nav.key)!.urgent ? ' urgent' : ''}`} title={dot(nav.key)!.title} aria-label={dot(nav.key)!.title} />}
                    </Link>
                  ))}
                </div>
              )
            })}
          </nav>
        </div>

        <main className="ma-main">
          {error && (
            <p className="ma-access-note" role="status">
              {error}
              <button type="button" onClick={() => void refresh()}>Try again</button>
            </p>
          )}
          {tabs.length > 1 && (
            <nav className="ma-tabs" aria-label={findNav(here)?.label}>
              {tabs.map((t) => (
                <Link key={t.key} to={`/account#${t.key}`} className={t.key === tab ? 'on' : undefined} aria-current={t.key === tab ? 'page' : undefined}>
                  {t.tabLabel ?? t.label}
                </Link>
              ))}
            </nav>
          )}
          {tab === 'overview' ? (
            <Overview onOpen={(key) => navigate(`/account#${key}`)} />
          ) : (
            <MemberPanel tab={tab} label={item?.label ?? tab} />
          )}
        </main>
      </div>
    </>
  )
}

/** The person's roles, as chips. Shown on Overview. */
export function RoleChips() {
  const { access } = useAccess()
  // Roles are neutral chips and leadership roles navy; gold is kept for a
  // person's highest certification (see src/lib/chips.ts).
  return (
    <div className="ma-chips">
      {access.tier === 'member' && <span className="cpill">AOI MEMBER</span>}
      {access.tier === 'student' && <span className="cpill">STUDENT</span>}
      {access.tier === 'expired' && <span className="cpill bad">MEMBERSHIP EXPIRED</span>}
      {access.roles
        .filter((r) => !r.role_key.startsWith('past_'))
        .map((role) => (
          <span className={roleChipClass(role.role_key)} key={`${role.role_key}-${role.committee_id ?? ''}`}>
            {roleLabel(role).toUpperCase()}
          </span>
        ))}
      {access.staff_role === 'administrator' && <span className="cpill">ADMINISTRATOR</span>}
    </div>
  )
}
