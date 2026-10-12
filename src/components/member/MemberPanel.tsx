/* ----------------------------------------------------------------------------
 * The per-tab surfaces.
 *
 * Tabs that have a real table behind them read it. Tabs whose CCI OS module has
 * not been ported yet say exactly that, rather than showing sample rows that
 * would read as real data.
 * -------------------------------------------------------------------------- */
import { useEffect, useState } from 'react'
import { Link } from '@/lib/router'
import { useAccess } from '@/lib/queries/AccessProvider'
import {
  myCertifications, myCompletions, directory,
} from '@/lib/queries/member'
import type {
  Certification, Completion, BoardSeat, DirectoryPerson,
} from '@/lib/queries/member'
import { TIER_LABEL } from '@/lib/access'
import RolesPanel from './RolesPanel'
import OperatingSystem from './OperatingSystem'
import CertificationPanel from './CertificationPanel'
import MembersPanel from './MembersPanel'
import EventsPanel from './EventsPanel'
import ContactsPanel from './ContactsPanel'
import BoardPanel from './BoardPanel'
import InternshipsPanel from './InternshipsPanel'
import CollegesPanel from './CollegesPanel'
import InstructorsPanel from './InstructorsPanel'
import ResearchPanel from './ResearchPanel'
import TasksPanel from './TasksPanel'
import { findNav } from '@/lib/nav'
import ReportsPanel from './ReportsPanel'
import CalendarPanel from './CalendarPanel'
import StatsPanel from './StatsPanel'
import RecordsPanel from './RecordsPanel'
import ControlPanel from './ControlPanel'
import VaultPanel from './VaultPanel'
import OrgPanel from './OrgPanel'
import PhotoCard from './PhotoCard'
import { fmtDate } from '@/lib/dates'

const date = (iso?: string | null) => fmtDate(iso) || '—'

function Row({ title, detail, right }: { title: string; detail: string; right?: React.ReactNode }) {
  return (
    <div className="ma-row">
      <div>
        <b>{title}</b>
        <span>{detail}</span>
      </div>
      {right}
    </div>
  )
}

function Panel({ title, lede, children }: { title: string; lede: string; children: React.ReactNode }) {
  return (
    <>
      <h1>{title}</h1>
      <div className="ma-sub">{lede}</div>
      <div className="ma-panel">{children}</div>
    </>
  )
}

/** Modules still to be ported from CCI OS. Named honestly. */
const PENDING: Record<string, string> = {
  instructors: 'The instructor register and Train the Trainer',
  internships: 'Preceptors, interns and placements',
  research: 'Research projects and grants',
  colleges: 'College relationships and outreach',
  email: 'Institute correspondence',
}

export default function MemberPanel({ tab, label }: { tab: string; label: string }) {
  const { access } = useAccess()
  const [data, setData] = useState<unknown>(null)
  const [loading, setLoading] = useState(true)
  const personId = access.person?.id

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setData(null)
    void (async () => {
      let result: unknown = null
      if (tab === 'mycert') {
        result = personId ? await myCertifications(personId) : []
      } else if (tab === 'myce') {
        result = personId ? await myCompletions(personId) : []
      } else if (tab === 'directory') {
        result = await directory()
      }
      if (!cancelled) {
        setData(result)
        setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [tab, personId])

  if (tab === 'roles') return <RolesPanel />
  if (tab === 'oversight') return <OperatingSystem />
  if (tab === 'certification') return <CertificationPanel />
  if (tab === 'directory') return <MembersPanel />
  if (tab === 'events') return <EventsPanel />
  if (tab === 'leads') return <ContactsPanel />
  if (tab === 'board') return <BoardPanel />
  if (tab === 'internships') return <InternshipsPanel />
  if (tab === 'colleges') return <CollegesPanel />
  if (tab === 'instructors') return <InstructorsPanel />
  if (tab === 'research') return <ResearchPanel />
  if (tab === 'tasks') return <TasksPanel />
  if (tab === 'reports') return <ReportsPanel />
  if (tab.startsWith('c-')) return <ReportsPanel committee={findNav(tab)?.committee} key={tab} />
  if (tab === 'calendar') return <CalendarPanel />
  if (tab === 'stats') return <StatsPanel />
  if (tab === 'records') return <RecordsPanel />
  if (tab === 'control') return <ControlPanel />
  if (tab === 'vault') return <VaultPanel />
  if (tab === 'org') return <OrgPanel />

  if (PENDING[tab]) {
    return (
      <Panel title={label} lede={PENDING[tab]!}>
        <p className="ma-empty">
          This module is still in CCI OS and has not been moved across yet. Your access to it is
          already correct — the permission that reveals this tab is the same one the database
          enforces, so nothing changes about who can see it when it arrives.
        </p>
      </Panel>
    )
  }

  if (loading) {
    return (
      <Panel title={label} lede="Reading the Institute database…">
        <p className="ma-empty">One moment.</p>
      </Panel>
    )
  }

  /* ---------------------------------------------------------- membership -- */
  if (tab === 'membership') {
    const p = access.person
    return (
      <Panel title="Membership" lede={TIER_LABEL[access.tier]}>
        <PhotoCard />
        <Row title="Status" detail={p?.membership_status ? p.membership_status.charAt(0).toUpperCase() + p.membership_status.slice(1) : 'No membership on file'} />
        <Row title="Member since" detail={date(p?.member_since)} />
        <Row title="Renews" detail={date(p?.membership_expires)} />
        {access.tier !== 'member' && (
          <Row
            title="Join the Institute"
            detail="Monthly Huddle and conference registration included, $200 off every Intensive, $600 off Bootcamp, directory listing"
            right={
              <Link className="b sm p-btn" to="/membership">
                See membership
              </Link>
            }
          />
        )}
      </Panel>
    )
  }

  /* --------------------------------------------------------------- certs -- */
  if (tab === 'mycert') {
    const certs = (data ?? []) as Certification[]
    return (
      <Panel title="My Certification" lede="Credentials issued to you by the Institute.">
        {certs.length === 0 ? (
          <p className="ma-empty">
            No certification on record yet.{' '}
            <Link className="t-link" style={{ fontSize: '11px' }} to="/certification">
              The certification path
            </Link>
          </p>
        ) : (
          certs.map((c, i) => (
            <Row
              key={i}
              title={`${c.technique ?? 'Advanced Orthogonal'} — ${c.level === 'level_2' ? 'Level 2' : c.level === 'level_1' ? 'Level 1' : (c.level ?? '—')}`}
              detail={`Certified ${date(c.cert_date)}${c.certificate_number ? ` · ${c.certificate_number}` : ''}`}
              right={<span className="cpill ok">ACTIVE</span>}
            />
          ))
        )}
      </Panel>
    )
  }

  /* ------------------------------------------------------------------ CE -- */
  if (tab === 'myce') {
    const rows = (data ?? []) as Completion[]
    const total = rows.reduce((s, r) => s + Number(r.ce_hours ?? 0), 0)
    return (
      <Panel title="My CE" lede={`${total} ${total === 1 ? 'hour' : 'hours'} recorded by the Institute.`}>
        {rows.length === 0 ? (
          <p className="ma-empty">
            No CE credits recorded yet — they appear here automatically as you complete accredited
            courses and events.
          </p>
        ) : (
          rows.map((r, i) => (
            <Row
              key={i}
              title={`${r.ce_hours ?? 0} CE hours`}
              detail={`Issued ${date(r.issued_at)}${r.certificate_number ? ` · ${r.certificate_number}` : ''}`}
            />
          ))
        )}
      </Panel>
    )
  }

  /* ----------------------------------------------------------- my listing -- */
  if (tab === 'mylisting') {
    const p = access.person
    return (
      <Panel
        title="My Listing"
        lede="Your entry in the doctor directory. Reserved to certified doctors at Level 1 or above."
      >
        <Row title="Practice" detail={p?.practice_name ?? 'Not set'} />
        <Row
          title="Location"
          detail={[p?.practice_city, p?.practice_state].filter(Boolean).join(', ') || 'Not set'}
        />
        <Row
          title="Edit your details"
          detail="Changes update the Institute database and your listing"
          right={
            <Link className="b sm s-btn on-light" to="/contact">
              Request a change
            </Link>
          }
        />
      </Panel>
    )
  }

  /* -------------------------------------------------------------- reports -- */
  /* ---------------------------------------------------------------- board -- */
  if (tab === 'board') {
    const rows = (data ?? []) as BoardSeat[]
    return (
      <Panel title="Board" lede="Terms, offices and elections.">
        {rows.length === 0 ? (
          <p className="ma-empty">No board terms to show.</p>
        ) : (
          rows.map((r) => (
            <Row
              key={r.id}
              title={`${r.people?.first_name ?? ''} ${r.people?.last_name ?? ''}`.trim() || 'Seat'}
              detail={`${r.office ?? 'Board member'} · ${date(r.term_start)} – ${date(r.term_end)}`}
              right={
                <span className={`cpill ${r.status === 'active' ? 'ok' : 'warn'}`}>
                  {(r.status ?? '').toUpperCase()}
                </span>
              }
            />
          ))
        )}
      </Panel>
    )
  }

  /* ------------------------------------------------------------ directory -- */
  if (tab === 'directory') {
    const rows = (data ?? []) as DirectoryPerson[]
    return (
      <Panel title="Members" lede={`${rows.length} ${rows.length === 1 ? 'member' : 'members'}.`}>
        {rows.length === 0 ? (
          <p className="ma-empty">No members to show.</p>
        ) : (
          rows.slice(0, 60).map((p) => (
            <Row
              key={p.id}
              title={`${p.first_name ?? ''} ${p.last_name ?? ''}${p.credentials ? `, ${p.credentials}` : ''}`}
              detail={
                [
                  [p.practice_city, p.practice_state].filter(Boolean).join(', '),
                  p.membership_status === 'active' ? 'Member' : null,
                  p.cert_level && p.cert_level !== 'none'
                    ? p.cert_level === 'level_2'
                      ? 'Level 2'
                      : 'Level 1'
                    : null,
                ]
                  .filter(Boolean)
                  .join(' · ') || '—'
              }
            />
          ))
        )}
      </Panel>
    )
  }

  return (
    <Panel title={label} lede="Not built yet.">
      <p className="ma-empty">Nothing here yet.</p>
    </Panel>
  )
}
