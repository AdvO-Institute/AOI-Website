/* ----------------------------------------------------------------------------
 * Full CCI OS — the executive surface.
 *
 * One screen that answers "what is the state of the Institute right now", and
 * one screen where the thing most likely to be wrong can be put right without
 * opening another tool: an event that is still a draft cannot be sold, so the
 * publish control lives here.
 *
 * Every read on this page is the visitor's own read. There is no service key,
 * no elevated client, no server relay. A board member who opened this URL would
 * see the subset their policies allow, which is the point — the screen cannot
 * grant what the database withholds.
 * -------------------------------------------------------------------------- */
import { useCallback, useEffect, useState } from 'react'
import { fmtDate } from '@/lib/dates'
import {
  pulse, allEvents, setEventStatus, committeeSeats, instructorRegister, enquiries, openTasks,
} from '@/lib/queries/os'
import type {
  Pulse, OsEvent, OsCommittee, OsInstructor, OsEnquiry, OsTask,
} from '@/lib/queries/os'

const money = (cents: number) => `$${(Math.round(cents) / 100).toLocaleString()}`

const dollars = (v: unknown) => {
  const n = Number(v)
  if (v === null || v === undefined || v === '' || !Number.isFinite(n)) return '—'
  return n <= 0 ? 'Free' : `$${n.toLocaleString()}`
}

const day = (iso?: string | null) => fmtDate(iso) || '—'

/* ------------------------------------------------------------------ pieces */

function Stat({ n, label, note, tone }: { n: string; label: string; note?: string; tone?: 'warn' | 'good' }) {
  return (
    <div className={`os-stat${tone ? ` ${tone}` : ''}`}>
      <b>{n}</b>
      <span>{label}</span>
      {note && <i>{note}</i>}
    </div>
  )
}

function Section({
  title, lede, children, action,
}: {
  title: string
  lede: string
  children: React.ReactNode
  action?: React.ReactNode
}) {
  return (
    <section className="os-section">
      <div className="os-head">
        <div>
          <h2>{title}</h2>
          <p>{lede}</p>
        </div>
        {action}
      </div>
      {children}
    </section>
  )
}

/* -------------------------------------------------------------------- page */

export default function OperatingSystem() {
  const [stats, setStats] = useState<Pulse | null>(null)
  const [events, setEvents] = useState<OsEvent[]>([])
  const [coms, setComs] = useState<OsCommittee[]>([])
  const [instr, setInstr] = useState<OsInstructor[]>([])
  const [mail, setMail] = useState<OsEnquiry[]>([])
  const [tasks, setTasks] = useState<OsTask[]>([])
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState<number | null>(null)
  const [note, setNote] = useState<string | null>(null)

  const load = useCallback(async () => {
    const [p, e, c, i, m, t] = await Promise.all([
      pulse(), allEvents(), committeeSeats(), instructorRegister(), enquiries(), openTasks(),
    ])
    setStats(p)
    setEvents(e)
    setComs(c)
    setInstr(i)
    setMail(m)
    setTasks(t)
    setLoading(false)
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  async function toggle(ev: OsEvent) {
    const next = ev.status === 'published' ? 'draft' : 'published'
    setBusy(ev.id)
    setNote(null)
    const res = await setEventStatus(ev.id, next)
    if (res.error) {
      setNote(`Could not change "${ev.title}" — the database refused the write.`)
      setBusy(null)
      return
    }
    setNote(
      next === 'published'
        ? `"${ev.title}" is now live on the public site and can be registered for.`
        : `"${ev.title}" has been taken off the public site.`,
    )
    await load()
    setBusy(null)
  }

  if (loading || !stats) {
    return (
      <>
        <h1>Full CCI OS</h1>
        <div className="ma-sub">Reading the Institute…</div>
        <div className="ma-panel">
          <p className="ma-empty">One moment.</p>
        </div>
      </>
    )
  }

  const noAccount = stats.members - stats.membersWithAccount
  const unseated = stats.committeesTotal - stats.committeesSeated
  const brokenInstructors = instr.filter((r) => r.status === 'current' && !r.hasRole).length

  return (
    <>
      <h1>Full CCI OS</h1>
      <div className="ma-sub">
        The whole Institute on one screen, read live. Everything here obeys the same policies as
        the rest of the site — this is a view of your access, not an exception to it.
      </div>

      {note && <div className="os-note">{note}</div>}

      {/* ------------------------------------------------------------ pulse */}
      <div className="os-stats">
        <Stat n={String(stats.members)} label="Active members" note={`of ${stats.people} on file`} />
        <Stat
          n={String(noAccount)}
          label="Members with no login"
          note={stats.membersNoEmail > 0 ? `${stats.membersNoEmail} have no email either` : undefined}
          tone={noAccount > 0 ? 'warn' : 'good'}
        />
        <Stat
          n={String(stats.eventsPublished)}
          label="Events published"
          note={stats.eventsDraft > 0 ? `${stats.eventsDraft} still draft` : 'none waiting'}
          tone={stats.eventsDraft > 0 ? 'warn' : 'good'}
        />
        <Stat n={String(stats.registrations)} label="Registrations" note={`${money(stats.revenueCents)} collected`} />
        <Stat
          n={`${stats.committeesSeated}/${stats.committeesTotal}`}
          label="Committees led"
          note={unseated > 0 ? `${unseated} with no chair` : 'all seated'}
          tone={unseated > 0 ? 'warn' : 'good'}
        />
        <Stat n={String(stats.certifications)} label="Certifications issued" />
        <Stat n={String(stats.instructors)} label="Current instructors" note={brokenInstructors > 0 ? `${brokenInstructors} cannot sign in to tools` : 'all reachable'} tone={brokenInstructors > 0 ? 'warn' : 'good'} />
        <Stat n={String(stats.enquiriesNew)} label="New enquiries" note={`${stats.tasksOpen} open tasks`} />
      </div>

      {/* ----------------------------------------------------------- events */}
      <Section
        title="Events and registrations"
        lede="Drafts are invisible to the public site and cannot be registered for. Publishing one here puts it on sale immediately."
      >
        <div className="os-table" role="table">
          <div className="os-tr os-th" role="row">
            <span>Event</span><span>When</span><span>Price</span><span>Registered</span><span>Revenue</span><span>Status</span>
          </div>
          {events.map((ev) => (
            <div className="os-tr" role="row" key={ev.id}>
              <span>
                <b>{ev.title ?? ev.slug}</b>
                {ev.location && <i>{ev.location}</i>}
              </span>
              <span>{day(ev.starts_at)}</span>
              <span>
                {dollars(ev.price)}
                {ev.member_price !== null && ev.member_price !== undefined && ev.member_price !== '' && (
                  <i>members {dollars(ev.member_price)}</i>
                )}
              </span>
              <span>{ev.regs ?? 0}{ev.capacity ? ` / ${ev.capacity}` : ''}</span>
              <span>{money(ev.revenueCents ?? 0)}</span>
              <span>
                <button
                  type="button"
                  className={`os-pill${ev.status === 'published' ? ' on' : ''}`}
                  disabled={busy === ev.id}
                  onClick={() => void toggle(ev)}
                  title={ev.status === 'published' ? 'Take off the public site' : 'Put on sale now'}
                >
                  {busy === ev.id ? '…' : ev.status === 'published' ? 'Live' : 'Draft'}
                </button>
              </span>
            </div>
          ))}
          {events.length === 0 && <p className="ma-empty">No events on file.</p>}
        </div>
      </Section>

      {/* ------------------------------------------------------- committees */}
      <Section
        title="Committees"
        lede="A committee with no chair grants nobody its management surface. These seats are what unlock access."
      >
        <div className="os-grid">
          {coms.map((c) => (
            <div className={`os-card${c.chairs === 0 ? ' vacant' : ''}`} key={c.id}>
              <b>{c.name}</b>
              <span>
                {c.chairs === 0
                  ? 'No chair seated'
                  : `${c.chairs} leading${c.members > c.chairs ? `, ${c.members - c.chairs} serving` : ''}`}
              </span>
            </div>
          ))}
        </div>
      </Section>

      {/* ------------------------------------------------------ instructors */}
      <Section
        title="Instructor register"
        lede="An instructor reaches their teaching tools only when their record is attached to a person and that person holds the instructor role. Both halves are shown."
      >
        <div className="os-table" role="table">
          <div className="os-tr os-th os-th-3" role="row">
            <span>Instructor</span><span>Level</span><span>Can reach their tools</span>
          </div>
          {instr.map((r, n) => (
            <div className="os-tr os-tr-3" role="row" key={`${r.person_name}-${n}`}>
              <span><b>{r.person_name}</b></span>
              <span>{(r.level ?? '').replace(/_/g, ' ')}</span>
              <span>
                {r.hasRole ? (
                  <em className="os-ok">Yes</em>
                ) : !r.linked ? (
                  <em className="os-bad">No — record not attached to a person</em>
                ) : (
                  <em className="os-bad">No — missing the instructor role</em>
                )}
              </span>
            </div>
          ))}
        </div>
      </Section>

      {/* --------------------------------------------------- work and inbox */}
      <div className="os-two">
        <Section title="Open tasks" lede="Assigned and not yet done.">
          {tasks.length === 0 ? (
            <p className="ma-empty">Nothing outstanding.</p>
          ) : (
            tasks.map((t) => (
              <div className="ma-row" key={t.id}>
                <div>
                  <b>{t.title}</b>
                  <span>{t.assigned_name ?? 'Unassigned'} · due {day(t.due_date)}</span>
                </div>
              </div>
            ))
          )}
        </Section>

        <Section title="Inquiries" lede="Submitted through the public contact form.">
          {mail.length === 0 ? (
            <p className="ma-empty">No inquiries yet.</p>
          ) : (
            mail.map((m) => (
              <div className="ma-row" key={m.id}>
                <div>
                  <b>{m.full_name ?? m.email}</b>
                  <span>{m.subject ?? 'No subject'} · {day(m.created_at)}</span>
                </div>
              </div>
            ))
          )}
        </Section>
      </div>
    </>
  )
}
