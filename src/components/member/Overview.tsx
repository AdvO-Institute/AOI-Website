/* ----------------------------------------------------------------------------
 * Overview — the first thing a signed-in person sees.
 *
 * Read top to bottom, it answers three questions:
 *   1. Is something about to happen?  The next event this person is registered
 *      for, louder as it gets closer: a quiet line, then "this week", then
 *      "today", then — from 15 minutes before until it ends — a large alert
 *      with the Zoom button. It re-checks the clock every 30 seconds.
 *   2. What needs me?  This cycle's report for each committee, tasks due, new
 *      registrations — or one calm line when there is nothing.
 *   3. Where do I stand?  Membership, certification, CE and registrations in
 *      a short table. A link appears only where the tab has something for them.
 *
 * Every figure is read from the database for this person. Where a number is
 * not available yet the row says so rather than showing a placeholder that
 * looks like a fact.
 * -------------------------------------------------------------------------- */
import { Fragment, useEffect, useMemo, useState } from 'react'
import { Link } from '@/lib/router'
import { useAccess } from '@/lib/queries/AccessProvider'
import { fmtDate, fmtTime, zoneAbbr, isOnline, viewerZone, ET } from '@/lib/dates'
import { useRegKey } from '@/lib/queries/CatalogProvider'
import { useRegistration } from '@/components/blocks/RegistrationDialog'
import { myRegistrations, upcomingEvents, myCompletions, eventZoom } from '@/lib/queries/member'
import type { Registration, PublicEvent, Completion } from '@/lib/queries/member'
import { attention, myReports, EMPTY } from '@/lib/queries/attention'
import type { Attention, ReportDue } from '@/lib/queries/attention'
import { monthLabel, fmtD } from '@/lib/queries/meetings'
import { toLocal, fromLocal } from '@/lib/queries/calendar'
import { navFor, findNav, isCommittee } from '@/lib/nav'
import { CERT_SHORT } from '@/lib/chips'
import { session } from '@/lib/supabase'
import { HUDDLE_SLUG, nthWeekday } from '@/content/calendar'
import { RoleChips } from './MemberShell'

const MIN = 60_000
const HOUR = 60 * MIN
const DAY = 24 * HOUR
/** A session with no end time is taken to run this long. */
const SESSION_LENGTH = 90 * MIN

function greeting(): string {
  const h = new Date().getHours()
  return h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening'
}

/** YYYY-MM-DD for an instant, in a given zone. */
function dayIn(ms: number, zone: string): string {
  try {
    return new Intl.DateTimeFormat('en-CA', { timeZone: zone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(ms))
  } catch {
    return new Date(ms).toISOString().slice(0, 10)
  }
}

/** "in 5 days", "in 6 hours", "in 10 minutes". */
function countdown(ms: number): string {
  if (ms >= 2 * DAY) return `in ${Math.round(ms / DAY)} days`
  if (ms >= 2 * HOUR) return `in ${Math.round(ms / HOUR)} hours`
  if (ms >= HOUR) return 'in about an hour'
  const m = Math.max(1, Math.round(ms / MIN))
  return `in ${m} minute${m === 1 ? '' : 's'}`
}

/* ------------------------------------------------- the next time it meets -- */

type Run = { start: number; end: number; iso: string }

/** The next sitting of an event that has not yet ended: its next timed session
 *  if it has them, else the event itself. The Monthly Huddle without sessions
 *  in the view falls back to its rule — the second Tuesday, at the series' time. */
function nextRun(ev: PublicEvent | undefined, reg: Registration, now: number): Run | null {
  const sessions = (ev?.sessions ?? [])
    .filter((s) => s.starts_at)
    .map((s) => {
      const start = Date.parse(s.starts_at!)
      const end = s.ends_at ? Date.parse(s.ends_at) : start + SESSION_LENGTH
      return { start, end, iso: s.starts_at! }
    })
    .filter((r) => Number.isFinite(r.start) && r.end > now)
    .sort((a, b) => a.start - b.start)
  if (sessions.length) return sessions[0]!

  const startsAt = ev?.starts_at ?? reg.events?.starts_at ?? null
  if (!startsAt) return null
  const start = Date.parse(startsAt)
  if (!Number.isFinite(start)) return null
  const seriesEnd = ev?.ends_at ? Date.parse(ev.ends_at) : NaN

  const slug = ev?.slug ?? reg.events?.slug
  if (slug === HUDDLE_SLUG && start + SESSION_LENGTH <= now) {
    const time = toLocal(startsAt).slice(11) || '21:00'
    const today = new Date(now)
    for (let i = 0; i < 4; i++) {
      const d = nthWeekday(today.getFullYear(), today.getMonth() + i, 2, 2)
      const ymd = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
      const iso = fromLocal(`${ymd}T${time}`)
      if (!iso) continue
      const s = Date.parse(iso)
      if (Number.isFinite(seriesEnd) && s > seriesEnd) return null
      if (s + SESSION_LENGTH > now) return { start: s, end: s + SESSION_LENGTH, iso }
    }
    return null
  }

  const end = Number.isFinite(seriesEnd) ? seriesEnd : start + 2 * HOUR
  return end > now ? { start, end, iso: startsAt } : null
}

type Booked = { slug: string; title: string; run: Run; online: boolean; zone: string; home: string }

/** "9:00 PM ET", or for an online event outside Eastern "6:00 PM PT (9:00 PM ET)". */
function timeText(b: Booked, iso: string): string {
  const at = new Date(iso)
  const own = fmtTime(iso, b.zone)
  return b.online && zoneAbbr(b.zone, at) !== zoneAbbr(b.home, at) ? `${own} (${fmtTime(iso, b.home)})` : own
}
/** "Tuesday, October 13 · 9:00 PM ET" — with the year when asked or when it is not this one. */
function whenText(b: Booked, withYear = false): string {
  const at = new Date(b.run.iso)
  const thisYear = dayIn(Date.now(), b.zone).slice(0, 4) === dayIn(b.run.start, b.zone).slice(0, 4)
  const day = at.toLocaleDateString('en-US', {
    weekday: 'long', month: 'long', day: 'numeric',
    ...(withYear || !thisYear ? { year: 'numeric' } : {}),
    timeZone: b.zone,
  })
  return `${day} · ${timeText(b, b.run.iso)}`
}

/* -------------------------------------------------------------- the page -- */

export default function Overview({ onOpen }: { onOpen: (tab: string) => void }) {
  const { access, canViewAsMember, viewingAsMember, setViewingAsMember } = useAccess()
  const regKey = useRegKey()
  const register = useRegistration()
  const [regs, setRegs] = useState<Registration[] | null>(null)
  const [events, setEvents] = useState<PublicEvent[] | null>(null)
  const [ce, setCe] = useState<Completion[] | null>(null)
  const [zoom, setZoom] = useState<{ slug: string; url: string | null } | null>(null)
  const [reports, setReports] = useState<ReportDue[]>([])
  const [att, setAtt] = useState<Attention>(EMPTY)
  const [now, setNow] = useState(() => Date.now())

  // The clock the alerts read: every 30 seconds, so they escalate without a reload.
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 30_000)
    return () => clearInterval(t)
  }, [])

  useEffect(() => {
    let cancelled = false
    void (async () => {
      const [r, e] = await Promise.all([myRegistrations(), upcomingEvents()])
      if (cancelled) return
      setRegs(r)
      setEvents(e)
      if (access.person?.id) {
        const c = await myCompletions(access.person.id)
        if (!cancelled) setCe(c)
      } else {
        setCe([])
      }
    })()
    return () => {
      cancelled = true
    }
  }, [access.person?.id])

  useEffect(() => {
    let cancelled = false
    void myReports(access).then((r) => { if (!cancelled) setReports(r) })
    void attention(access, session.user?.id ?? null).then((a) => { if (!cancelled) setAtt(a) })
    return () => { cancelled = true }
  }, [access])

  const person = access.person
  const visible = useMemo(() => new Set(navFor(access).flatMap((g) => g.items.map((i) => i.key))), [access])

  // Everything this person is booked on that has not ended, soonest first.
  const booked: Booked[] = useMemo(() => {
    const bySlug = new Map((events ?? []).map((e) => [e.slug, e]))
    const out: Booked[] = []
    for (const reg of regs ?? []) {
      if (reg.registration_status === 'cancelled' || reg.payment_status === 'pending') continue
      const slug = reg.events?.slug
      if (!slug || out.some((b) => b.slug === slug)) continue
      const ev = bySlug.get(slug)
      const run = nextRun(ev, reg, now)
      if (!run) continue
      const location = ev?.location ?? reg.events?.location ?? null
      const zoomUrl = zoom?.slug === slug ? zoom.url : null
      const online = slug === HUDDLE_SLUG || isOnline({ location, zoom_url: zoomUrl })
      const home = ev?.timezone || ET
      out.push({ slug, title: ev?.title ?? reg.events?.title ?? 'Your event', run, online, home, zone: online ? viewerZone() : home })
    }
    return out.sort((a, b) => a.run.start - b.run.start)
  }, [regs, events, now, zoom])

  const next = booked[0]
  const nextSlug = next?.slug ?? null
  useEffect(() => {
    if (!nextSlug) { setZoom(null); return }
    let cancelled = false
    void eventZoom(nextSlug).then((url) => { if (!cancelled) setZoom({ slug: nextSlug, url }) })
    return () => { cancelled = true }
  }, [nextSlug])

  const hours = (ce ?? []).reduce((sum, c) => sum + Number(c.ce_hours ?? 0), 0)

  return (
    <>
      <div className="ov-head">
        <div>
          <h1>
            {greeting()}
            {person?.last_name ? `, Dr. ${person.last_name}.` : '.'}
          </h1>
          {access.roles.length === 0 && access.tier === 'guest' && (
            <div className="ma-sub">Your account is active. Membership unlocks the rest.</div>
          )}
          <RoleChips />
        </div>
        {canViewAsMember && (
          <button
            type="button"
            role="switch"
            aria-checked={viewingAsMember}
            className={`ov-switch${viewingAsMember ? ' on' : ''}`}
            onClick={() => setViewingAsMember(!viewingAsMember)}
          >
            <span className="track" aria-hidden="true"><span className="knob" /></span>
            View as a member
          </button>
        )}
      </div>

      {next ? (
        <EventBand next={next} zoom={zoom?.slug === next.slug ? zoom.url : null} now={now} onOpen={onOpen} />
      ) : regs !== null ? (
        <NextToBook events={events} tier={access.tier} regKey={regKey} register={register} onOpen={onOpen} now={now} />
      ) : null}

      <NeedsYou reports={reports} att={att} visible={visible} onOpen={onOpen} hasCommittees={access.committees.length > 0} />

      <section className="ov-sec" aria-labelledby="ov-glance-h">
        <h2 id="ov-glance-h" className="ov-h">At a glance</h2>
        <table className="ov-glance">
          <tbody>
            <tr>
              <th scope="row">Membership</th>
              <td>
                {access.tier === 'member' ? (
                  <>Active{person?.membership_expires ? <> · renews {fmtDate(person.membership_expires)}</> : null}</>
                ) : (
                  <>
                    {access.tier === 'expired'
                      ? `Expired${person?.membership_expires ? ` ${fmtDate(person.membership_expires)}` : ''}`
                      : access.tier === 'student' ? 'Student' : 'Not a member'}
                    <Link className="ov-go" to="/membership">Join the Institute</Link>
                  </>
                )}
              </td>
            </tr>
            <tr>
              <th scope="row">Certification</th>
              <td>
                {person?.cert_level && person.cert_level !== 'none' ? (
                  <>
                    <span className="cpill gold">{CERT_SHORT[person.cert_level] ?? person.cert_level}</span>
                    <button type="button" className="ov-go" onClick={() => onOpen('mycert')}>View my record</button>
                  </>
                ) : (
                  'Not yet certified'
                )}
              </td>
            </tr>
            <tr>
              <th scope="row">Continuing education</th>
              <td className="num">
                {ce === null ? '—' : hours > 0 ? (
                  <>
                    {hours} {hours === 1 ? 'hour' : 'hours'} recorded
                    <button type="button" className="ov-go" onClick={() => onOpen('myce')}>Certificates</button>
                  </>
                ) : (
                  'None recorded yet'
                )}
              </td>
            </tr>
            <tr>
              <th scope="row">Registrations</th>
              <td>
                {regs === null ? '—' : booked.length === 0 ? (
                  <>
                    Nothing booked
                    <button type="button" className="ov-go" onClick={() => onOpen('events')}>Browse events</button>
                  </>
                ) : (
                  <ul className="ov-regs">
                    {booked.map((b) => (
                      <li key={b.slug}>
                        <button type="button" className="ov-link" onClick={() => onOpen('events')}>{b.title}</button>
                        <span className="num">{whenText(b)}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </td>
            </tr>
          </tbody>
        </table>
      </section>

      {access.tier === 'guest' && access.roles.length === 0 && (
        <div className="ma-note">
          <b>Your access starts here.</b> An account is created automatically when you register
          for an event. Membership, committee seats and Institute roles are assigned by the
          Executive Director and appear in this menu as soon as they are.
        </div>
      )}
    </>
  )
}

/* ------------------------------------------------------- 1. the alert band -- */

function EventBand({ next, zoom, now, onOpen }: { next: Booked; zoom: string | null; now: number; onOpen: (tab: string) => void }) {
  const { run, title } = next
  const until = run.start - now
  const live = now >= run.start - 15 * MIN && now < run.end
  const today = dayIn(run.start, next.zone) === dayIn(now, next.zone)
  const week = until <= 7 * DAY
  const join = zoom ? (
    <a className={`b ${live ? 'p-btn' : 's-btn on-light xs'} ov-join`} href={zoom} target="_blank" rel="noopener noreferrer">Join on Zoom</a>
  ) : null
  const details = <button type="button" className="ov-go" onClick={() => onOpen('events')}>Event details</button>

  if (live) {
    return (
      <section className="ov-alert live timed" role="alert">
        <div>
          <span className="ov-eyebrow">{until > 0 ? 'Starting soon' : 'Happening now'}</span>
          <h2>
            {until > 0 ? (
              <>
                <span className="ov-wide">{title} is about to start</span>
                <span className="ov-narrow">{title} starts {countdown(until)}</span>
              </>
            ) : `${title} is underway`}
          </h2>
          <p className="num">{timeText(next, run.iso)}{next.online ? ' · live on Zoom' : ''}</p>
          <div className="ov-act">
            {join ?? <span className="ov-hint">The Zoom link is in your confirmation email.</span>}
          </div>
        </div>
        <Timer start={run.start} />
      </section>
    )
  }
  if (today) {
    const evening = Number(new Date(run.start).toLocaleTimeString('en-US', { hour: 'numeric', hourCycle: 'h23', timeZone: next.zone })) >= 17
    return (
      <section className="ov-alert today timed" role="status">
        <div>
          <span className="ov-eyebrow">Today</span>
          <h2>{title} — {evening ? 'tonight' : 'today'} at {timeText(next, run.iso)}</h2>
          <p><span className="ov-narrow">Starts {countdown(until)}. </span>You’re registered.</p>
          <div className="ov-act">{join}{details}</div>
        </div>
        <Timer start={run.start} />
      </section>
    )
  }
  if (week) {
    return (
      <section className="ov-alert week" role="status">
        <span className="ov-eyebrow">This week</span>
        <h2>{title} — {whenText(next)}</h2>
        <p>{countdown(until).replace(/^in/, 'In')}. You’re registered.</p>
        <div className="ov-act">{details}</div>
      </section>
    )
  }
  return (
    <p className="ov-quiet">
      <span className="ov-eyebrow">Next on your calendar</span>
      <b>{title}</b> <span className="num">{whenText(next, true)}</span>
      {details}
    </p>
  )
}

/** The countdown at the right of the band, on wider screens only (hidden on a
 *  phone by the stylesheet). It keeps its own one-second clock so the rest of
 *  the page does not redraw every second. On the day it shows hours and
 *  minutes; in the last fifteen, minutes and seconds over a bar that fills as
 *  the start nears; once started, how long it has been running. */
function Timer({ start }: { start: number }) {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(t)
  }, [])
  const ms = start - now
  const pad = (n: number) => String(n).padStart(2, '0')
  const sec = Math.ceil(Math.abs(ms) / 1000)
  let label: string
  let units: [string, string][]
  if (ms > 15 * MIN) {
    const m = Math.ceil(ms / MIN)
    label = 'Starts in'
    units = [[pad(Math.floor(m / 60)), 'hrs'], [pad(m % 60), 'min']]
  } else if (ms > 0) {
    label = 'Starts in'
    units = [[pad(Math.floor(sec / 60)), 'min'], [pad(sec % 60), 'sec']]
  } else {
    const m = Math.floor(-ms / MIN)
    label = 'Running for'
    units = m >= 60 ? [[String(Math.floor(m / 60)), 'hr'], [pad(m % 60), 'min']] : [[pad(m), 'min'], [pad(Math.floor(-ms / 1000) % 60), 'sec']]
  }
  const fill = ms > 0 && ms <= 15 * MIN ? 1 - ms / (15 * MIN) : null
  return (
    <div className="ov-timer" aria-hidden="true">
      <span className="ov-eyebrow">{label}</span>
      <div className="digits">
        {units.map(([n, u], i) => (
          <Fragment key={u}>
            {i > 0 && <span className="colon">:</span>}
            <span className="unit">
              <span className="tile num">{n}</span>
              <span className="u">{u}</span>
            </span>
          </Fragment>
        ))}
      </div>
      {fill !== null && <span className="bar"><span style={{ width: `${(fill * 100).toFixed(2)}%` }} /></span>}
    </div>
  )
}

/** Nothing booked: the next event open for registration, quietly. */
function NextToBook({ events, tier, regKey, register, onOpen, now }: {
  events: PublicEvent[] | null; tier: string; regKey: (slug?: string | null) => string | null
  register: (key: string) => void; onOpen: (tab: string) => void; now: number
}) {
  const ev = (events ?? []).filter((e) => e.starts_at && Date.parse(e.starts_at) > now)
    .sort((a, b) => String(a.starts_at).localeCompare(String(b.starts_at)))[0]
  if (!ev) return null
  const key = regKey(ev.slug)
  const free = (ev.free_with_membership && tier === 'member') || Number(ev.price) === 0
  const zone = isOnline({ location: ev.location }) ? viewerZone() : ev.timezone || ET
  return (
    <p className="ov-quiet">
      <span className="ov-eyebrow">Nothing booked yet</span>
      <b>{ev.title ?? 'Next event'}</b> <span className="num">{fmtDate(ev.starts_at, { tz: zone })}{ev.location ? ` · ${ev.location}` : ''}</span>
      <button type="button" className="ov-go" onClick={() => (key ? register(key) : onOpen('events'))}>
        {free ? 'RSVP for this event' : 'Register for this event'}
      </button>
    </p>
  )
}

/* ----------------------------------------------------------- 2. needs you -- */

type Need = { key: string; tone: 'bad' | 'warn' | 'ok' | ''; text: string; action?: string; tab?: string | null }

const shortDay = (ymd: string) => fmtD(ymd).replace(/, \d{4}$/, '')
/** "due today", "due tomorrow", "due this Friday", "due Oct 30", "overdue since Oct 6". */
function duePhrase(r: ReportDue): string {
  if (r.days < 0) return `overdue since ${shortDay(r.dueDate)}`
  if (r.days === 0) return 'due today'
  if (r.days === 1) return 'due tomorrow'
  if (r.days < 7) return `due this ${new Date(r.dueDate + 'T12:00:00Z').toLocaleDateString('en-US', { weekday: 'long', timeZone: 'UTC' })}`
  return `due ${shortDay(r.dueDate)}`
}

function NeedsYou({ reports, att, visible, onOpen, hasCommittees }: {
  reports: ReportDue[]; att: Attention; visible: Set<string>; onOpen: (tab: string) => void; hasCommittees: boolean
}) {
  // The tab that opens a committee's reports: its own report page if it has one, else Reports.
  const reportTab = (c: ReportDue['committee']): string | null => {
    const own = [...visible].find((k) => {
      const stem = k.startsWith('c-') ? findNav(k)?.committee : undefined
      return Boolean(stem) && isCommittee(c, stem!)
    })
    return own ?? (visible.has('reports') ? 'reports' : null)
  }
  const short = (name: string) => name.replace(/ Committee.*/, '')

  const urgent: Need[] = []
  const status: Need[] = []
  for (const r of reports) {
    const month = monthLabel(r.month).split(' ')[0]
    const tab = reportTab(r.committee)
    if (r.committee.leads && r.state !== 'submitted') {
      urgent.push({
        key: `r${r.committee.id}`,
        tone: r.days <= 0 ? 'bad' : 'warn',
        text: `${short(r.committee.name)}: ${month} report ${duePhrase(r)}${r.state === 'draft' ? ' — started, not submitted' : ''}`,
        action: r.state === 'draft' ? 'Finish it' : 'Fill it out',
        tab,
      })
    } else {
      status.push({
        key: `r${r.committee.id}`,
        tone: r.state === 'submitted' ? 'ok' : '',
        text: `${short(r.committee.name)}: ${month} report ${r.state === 'submitted' ? 'submitted' : `${duePhrase(r)} · your chair files it`}`,
        action: r.state === 'submitted' ? 'Read it' : undefined,
        tab,
      })
    }
  }
  if (att.tasks.overdue) urgent.push({ key: 'to', tone: 'bad', text: `${att.tasks.overdue} task${att.tasks.overdue > 1 ? 's' : ''} overdue`, action: 'Open tasks', tab: 'tasks' })
  const soon = att.tasks.count - att.tasks.overdue
  if (soon > 0) urgent.push({ key: 'ts', tone: 'warn', text: `${soon} task${soon > 1 ? 's' : ''} due in the next 3 days`, action: 'Open tasks', tab: 'tasks' })
  if (att.events.count) urgent.push({ key: 'ev', tone: '', text: `${att.events.count} new registration${att.events.count > 1 ? 's' : ''} since you last opened Events`, action: 'Review them', tab: 'events' })

  // Someone with no committees and no tasks tab has nothing that could land here.
  if (!hasCommittees && !visible.has('tasks') && !urgent.length) return null

  const row = (n: Need) => (
    <li key={n.key} className={n.tone || undefined}>
      <span className="dot" aria-hidden="true" />
      <span className="tx">{n.text}</span>
      {n.action && n.tab && visible.has(n.tab) && (
        <button type="button" className="ov-go" onClick={() => onOpen(n.tab!)}>{n.action}</button>
      )}
    </li>
  )
  return (
    <section className="ov-sec" aria-labelledby="ov-needs-h">
      <h2 id="ov-needs-h" className="ov-h">Needs you</h2>
      {urgent.length ? <ul className="ov-needs">{urgent.map(row)}</ul> : <p className="ov-calm">Nothing needs you right now.</p>}
      {status.length > 0 && <ul className="ov-needs ov-status">{status.map(row)}</ul>}
    </section>
  )
}
