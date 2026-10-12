import { useEffect, useRef, useState } from 'react'
import { Link, useParams } from '@/lib/router'
import { refundLine } from '@/lib/refund'
import { SEMINARS, SLUG_TO_SEMINAR } from '@/content/seminars'
import type { Seminar } from '@/content/seminars'
import { PEOPLE, HEADSHOTS } from '@/content/people'
import { SpeakerPill, useBio } from '@/components/blocks/BioDialog'
import SeminarCard from '@/components/blocks/SeminarCard'
import { StoryGoals, StoryProblem, StorySolution, StoryWhy, StoryBenefits, StoryData, StorySteps, StoryVoices, StoryFit, StoryFaq } from '@/components/blocks/SeminarStory'
import { useRegistration } from '@/components/blocks/RegistrationDialog'
import { useToast } from '@/components/ui/Toast'
import { useAccess } from '@/lib/queries/AccessProvider'
import { useCatalog } from '@/lib/queries/CatalogProvider'
import { myRegistrations } from '@/lib/queries/member'
import type { PublicEvent } from '@/lib/queries/events'
import { HUDDLE_SLUG } from '@/content/calendar'
import NotFoundPage from './NotFoundPage'

type Session = {
  mo: string
  dy: string
  yr?: string
  city: string
  venue: string
  seats: string
  flag?: string
  soon?: boolean
  free?: boolean
  apply?: boolean
  /** Catalog key this session registers for; it opens when that event is published. */
  reg?: string
  /** Only signed-in members can RSVP; everyone else is pointed to membership. */
  members?: boolean
}
type AgendaItem = { t: string; ap: string; title: string; desc: string; who?: string[]; on?: string }
type AgendaDay = { day: string; date?: string; items: AgendaItem[] }
type NoSess = {
  kick?: string
  h2?: string
  title?: string
  msg?: string
  btn?: string
  primary?: boolean
  /** Set when the button should start registration rather than go to Contact. */
  act?: string
}

/* The Monthly Huddle's instructors come from its event in the members area. A
 * session on an agenda line's date names that line's instructor; otherwise the
 * event's speaker list stands for every line. Names match the site's people by
 * first and last name ("Dr." and credentials ignored); a name with no bio on the
 * site is left off. With nothing usable, the page keeps its own list. */
const plainName = (n: string) => n.toLowerCase().replace(/^dr\.?\s+/, '').replace(/[^a-z' -]/g, '').replace(/\s+/g, ' ').trim()
const PERSON_BY_NAME = new Map(Object.entries(PEOPLE).map(([id, p]) => [plainName(p.name), id]))
function peopleNamed(names: string): string[] {
  return names.split(/\s*(?:,|&|\band\b)\s*/i).map((n) => PERSON_BY_NAME.get(plainName(n))).filter((id): id is string => !!id)
}
function dayIn(iso: string, tz: string): string | null {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return null
  try {
    return new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).format(d)
  } catch {
    return null
  }
}
function liveInstructors(event: PublicEvent | undefined, agenda: AgendaDay[], fallback: string[]) {
  if (!event || event.slug !== HUDDLE_SLUG) return { agenda, speakers: fallback }
  const listed = [...new Set([...(event.speakers ?? [])].sort((a, b) => (a.sort ?? 0) - (b.sort ?? 0)).flatMap((x) => peopleNamed(x.name ?? '')))]
  const byDay = new Map<string, string[]>()
  for (const x of event.sessions ?? []) {
    const day = x.starts_at ? dayIn(x.starts_at, event.timezone || 'America/New_York') : null
    const ids = x.speaker ? peopleNamed(x.speaker) : []
    if (day && ids.length) byDay.set(day, ids)
  }
  if (!listed.length && !byDay.size) return { agenda, speakers: fallback }
  const next = agenda.map((day) => ({
    ...day,
    items: day.items.map((it) => ({ ...it, who: (it.on && byDay.get(it.on)) || (listed.length ? listed : it.who) })),
  }))
  const taught = [...new Set(next.flatMap((day) => day.items.flatMap((it) => it.who ?? [])))]
  return { agenda: next, speakers: listed.length ? [...new Set([...listed, ...taught])] : taught }
}

const money = (n: number) => n.toLocaleString()
const r_paid = (r: { payment_status?: string | null }) => r.payment_status === 'paid'

function Face({ id }: { id: string }) {
  const person = PEOPLE[id]
  if (!person) return null
  const fill = { position: 'absolute', inset: 0 } as const
  return HEADSHOTS.has(id) ? (
    <img
      src={`/images/${id}.webp`}
      alt={person.name}
      width={400}
      height={400}
      loading="lazy"
      decoding="async"
      style={{ ...fill, width: '100%', height: '100%', objectFit: 'cover' }}
    />
  ) : (
    <>
      <span className={person.img} style={fill} />
      <span className="duo" style={fill} />
      <span className="ini">{person.ini}</span>
    </>
  )
}

export default function SeminarPage({ param }: { param?: string }) {
  const { slug } = useParams()
  const key = param ?? (slug ? SLUG_TO_SEMINAR[slug] : undefined)
  const seminar = key ? SEMINARS[key] : undefined

  const openBio = useBio()
  const register = useRegistration()
  const toast = useToast()
  const { access, signedIn, loading } = useAccess()
  const catalog = useCatalog()
  /* The page is prerendered signed out, so the first client render has to match
   * it; `mounted` flips after that frame (the same guard the header uses). */
  const [mounted, setMounted] = useState(false)
  useEffect(() => setMounted(true), [])
  const [agendaDay, setAgendaDay] = useState(0)
  const [presenter, setPresenter] = useState<string | null>(null)
  /* On phones the agenda folds behind a button; computers always show it. */
  const [agendaOpen, setAgendaOpen] = useState(false)
  /* The presenter row scrolls sideways on phones; arrows show which way there is more. */
  const stripRef = useRef<HTMLDivElement>(null)
  const [stripEnds, setStripEnds] = useState({ start: true, end: false })
  const readStrip = () => {
    const el = stripRef.current
    if (!el) return
    setStripEnds({ start: el.scrollLeft <= 4, end: el.scrollLeft + el.clientWidth >= el.scrollWidth - 4 })
  }
  const moveStrip = (dir: number) => {
    const el = stripRef.current
    if (el) el.scrollBy({ left: dir * Math.max(180, el.clientWidth * 0.75), behavior: 'smooth' })
  }
  useEffect(() => {
    readStrip()
    window.addEventListener('resize', readStrip)
    return () => window.removeEventListener('resize', readStrip)
  }, [])
  /* The back-to-top button appears once the reader is well down the page. */
  const [showTop, setShowTop] = useState(false)
  useEffect(() => {
    const on = () => setShowTop(window.scrollY > 900)
    on()
    window.addEventListener('scroll', on, { passive: true })
    return () => window.removeEventListener('scroll', on)
  }, [])
  const [attending, setAttending] = useState<null | { paid: boolean; ce: boolean }>(null)
  /* Worked out in the browser, so the prerendered page never shows a stale count. */
  const [daysLeft, setDaysLeft] = useState<number | null>(null)
  useEffect(() => {
    const to = seminar?.countdownTo
    const d = to ? Math.ceil((new Date(to).getTime() - Date.now()) / 86400000) : 0
    setDaysLeft(d > 0 ? d : null)
  }, [seminar?.countdownTo])

  /* A signed-in current member RSVPs instead of registering when the event is
   * free with membership; once they are on the list the buttons say so. */
  const overlay = key ? catalog.byKey[key] : undefined
  const freeWithMembership = overlay?.event?.free_with_membership === true || (!catalog.synced && seminar?.memPrice === 0 && (seminar?.fullPrice ?? 0) > 0)
  const rsvpMode = signedIn && access.tier === 'member' && freeWithMembership
  /* A signed-in visitor whose membership has not come back yet: hold the
   * non-member prices out of sight so a member never sees them flip to RSVP. */
  const checking = mounted && signedIn && loading
  const soldOut = overlay?.soldOut === true
  useEffect(() => {
    if (!signedIn || !overlay?.event?.slug) { setAttending(null); return }
    let cancelled = false
    void (async () => {
      const mine = await myRegistrations()
      const hit = mine.find((r) => r.events?.slug === overlay.event?.slug && r.registration_status !== 'cancelled' && (r.payment_status === 'paid' || r.payment_status === 'free'))
      if (!cancelled) setAttending(hit ? { paid: r_paid(hit), ce: hit.ce_credits === true } : null)
    })()
    return () => { cancelled = true }
  }, [signedIn, overlay?.event?.slug])

  if (!seminar || !key) return <NotFoundPage />

  const s = seminar as Seminar & {
    noSess?: NoSess
    keynote?: string
    keynoteBlurb?: string
    muxName?: string
    ctaP?: string
    ctaBtn?: string
  }

  const save =
    Number.isFinite(s.fullPrice) && Number.isFinite(s.memPrice) && s.fullPrice > 0
      ? s.fullPrice - (s.memPrice ?? 0)
      : 0

  const priceNote =
    s.cat === 'free'
      ? 'NO COST'
      : s.cat === 'internship'
        ? 'MEMBER PRIORITY'
        : s.memPrice === 0 && s.fullPrice > 0
          ? 'INCLUDED IN MEMBERSHIP'
          : save > 0
            ? `MEMBERS: $${money(s.memPrice ?? 0)}`
            : ''

  const memberBanner =
    s.mbText ??
    (s.memPrice === 0 && s.fullPrice > 0
      ? `This program is included with AOI membership — a $${money(s.fullPrice)} value.`
      : save > 0
        ? `AOI Members save $${money(save)} on this seminar — $${money(s.memPrice ?? 0)} instead of $${money(s.fullPrice)}.`
        : 'AOI membership connects you with the full Institute community.')

  const sessions = (s.sessions ?? []) as unknown as Session[]
  const { agenda, speakers } = liveInstructors(overlay?.event, (s.agenda ?? []) as unknown as AgendaDay[], s.spk ?? [])
  const keynote = s.keynote
  const rest = speakers.filter((id) => id !== keynote)

  /* One verb per action: a member's free seat is an RSVP, so "Register for
   * the Conference" reads "RSVP for the Conference" for them. */
  const regLabel = (fallback: string) => attending ? '\u2713 You\u2019re attending' : rsvpMode ? (/^(Register|RSVP) for /.test(fallback) ? fallback.replace(/^Register /, 'RSVP ') : `RSVP for ${s.title}`) : fallback
  const onRegister = () => { if (attending) { toast('You are already on the attendee list for this event.'); return } register(key) }

  const scrollToRegistration = () => {
    const target =
      document.getElementById('sd-reg-sec') ?? document.getElementById('sd-sessions-sec')
    if (target) target.scrollIntoView({ behavior: 'smooth' })
  }

  /* The bottom button does what the session's own button does when there is
   * only one session to choose; with several (or none open) it scrolls up. */
  /* Every registration button: open the sign-up window when there is one
   * choice and it is open to this visitor; otherwise go to the dates (pick a
   * weekend, join first, or see that it opens soon). */
  const onBottom = () => {
    if (!sessions.length && s.noSess?.act) { onRegister(); return }
    if (s.regBand && (overlay?.open ?? true)) { onRegister(); return }
    const only = sessions.length === 1 ? sessions[0]! : null
    if (only) {
      const open = only.reg ? catalog.byKey[only.reg]?.open === true : !only.soon && !only.apply
      const membersOnly = only.members === true && !(signedIn && access.tier === 'member')
      if (open && !membersOnly) {
        if (only.reg && only.reg !== key) register(only.reg)
        else onRegister()
        return
      }
    }
    scrollToRegistration()
  }

  /* Related training follows the path a doctor takes: the seminar before this
   * one and the two after it. Near either end the window slides so there are
   * always three. Pages off the path (Internships) show its start. */
  const FLOW = ['intro', 'fund1', 'fund2', 'fund3', 'intensive', 'bootcamp', 'conference'].filter((k) => SEMINARS[k])
  const at = FLOW.indexOf(key)
  const from = at < 0 ? 0 : Math.max(0, Math.min(at - 1, FLOW.length - 4))
  const related = FLOW.slice(from, from + 4).filter((k) => k !== key).slice(0, 3)

  /* Pages with a story follow the homepage's marketing flow; one button
   * wording runs through the whole page and leads to the dates. */
  const story = s.story
  const cta = (
    <button type="button" className="b lg p-btn" onClick={onBottom}>
      {regLabel(s.ctaBtn ?? 'Register Now')}
    </button>
  )

  const sessionsSec = !s.hideSess && (
        <section className="tight" id="sd-sessions-sec">
          <div className="wrap">
            <div className="kick">{sessions.length ? 'Dates & Locations' : (s.noSess?.kick ?? 'Dates & Locations')}</div>
            <h2 className="t" style={{ fontSize: '26px' }}>
              {sessions.length
                ? 'Choose your session'
                : (s.noSess?.h2 ?? 'No sessions currently scheduled')}
            </h2>
            <div className="goldrule" />
            <div className="sessions">
              {sessions.length === 0 ? (
                <div className="nosess">
                  <div className="ns-ic">
                    <svg
                      width="22"
                      height="22"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="var(--color-brand-primary)"
                      strokeWidth="1.9"
                    >
                      <rect x="3" y="4.5" width="18" height="16" rx="2" />
                      <path d="M3 9.5h18M8 2.5v4M16 2.5v4" />
                    </svg>
                  </div>
                  <div className="ns-bd">
                    <h4>{s.noSess?.title ?? 'Dates for the next offering are being finalized.'}</h4>
                    <p>
                      {s.noSess?.msg ??
                        'There are no sessions on the calendar for this seminar right now. New dates are posted here as soon as they are confirmed — tell us you are interested and we will let you know first.'}
                    </p>
                  </div>
                  <div className="ns-cta">
                    {s.noSess?.act ? (
                      /* An open-enrollment course (the free Intro) starts from here. */
                      <button type="button" className="b sm p-btn" onClick={onRegister}>
                        {regLabel(s.noSess.btn ?? 'Start Now')}
                      </button>
                    ) : (
                    <Link
                      className={`b sm ${s.noSess?.primary ? 'p-btn' : 's-btn on-light'}`}
                      to="/contact"
                    >
                      {s.noSess?.btn ?? 'Notify Me When Dates Are Set'}
                    </Link>
                    )}
                  </div>
                </div>
              ) : (
                sessions.map((x, i) => {
                  const live = x.reg ? catalog.byKey[x.reg] : undefined
                  const soon = x.reg ? live?.open !== true : x.soon
                  const membersOnly = x.members === true && !(signedIn && access.tier === 'member')
                  const flag = live?.seatFlag ?? x.flag
                  const full = live?.soldOut === true
                  return (
                  <div className={`sess${soon ? ' soon' : ''}`} key={`${x.city}-${i}`}>
                    {flag && <span className={`flag${full ? ' sold' : ''}`}>{flag}</span>}
                    <div className="top">
                      <div className="cal">
                        <div className="mo">{x.mo}</div>
                        <div className="dy">{x.dy}</div>
                        {x.yr && (
                          <div className="mo" style={{ color: 'var(--color-content-on-inverse-muted)' }}>
                            {x.yr}
                          </div>
                        )}
                      </div>
                      <div className="where">
                        <h4>{x.city}</h4>
                        <span>{x.venue.toUpperCase()}</span>
                      </div>
                    </div>
                    <div className="mid">
                      <div className="prices">
                        {x.free ? (
                          <>
                            <span className="mem">FREE</span>
                            <span className="lbl">FOR EVERYONE</span>
                          </>
                        ) : x.apply ? (
                          <>
                            <span className="mem" style={{ fontSize: '15px' }}>
                              By Application
                            </span>
                            <span className="lbl">MATCHED PLACEMENT</span>
                          </>
                        ) : s.memPrice === 0 ? (
                          <>
                            {s.fullPrice > 0 && <><span className="full">${money(s.fullPrice)}</span>{' '}</>}
                            <span className="mem">FREE</span>
                            <span className="lbl">WITH AOI MEMBERSHIP</span>
                          </>
                        ) : (
                          <>
                            <span className="full">${money(s.fullPrice)}</span>{' '}
                            <span className="mem">${money(s.memPrice ?? 0)}</span>
                            <span className="lbl">
                              AOI MEMBER PRICE
                              {Math.max(0, s.fullPrice - (s.memPrice ?? 0)) > 0 &&
                                ` · SAVE $${money(s.fullPrice - (s.memPrice ?? 0))}`}
                            </span>
                          </>
                        )}
                      </div>
                      <div className="seats">
                        <b>{soon ? x.seats : (live?.seats ?? x.seats)}</b>
                        <span>{soon ? 'OPENING SOON' : catalog.synced && live?.seats ? 'LIVE SEAT COUNT' : 'UPDATED WEEKLY'}</span>
                      </div>
                    </div>
                    <div className="bot">
                      {soon ? (
                        <button
                          type="button"
                          className="b sm s-btn on-light"
                          onClick={() =>
                            toast(
                              "We'll open registration for this session soon — contact us to be notified.",
                            )
                          }
                        >
                          Notify Me
                        </button>
                      ) : x.apply ? (
                        <Link className="b sm p-btn" to="/contact">
                          Apply Now
                        </Link>
                      ) : full && !attending ? (
                        <Link className="b sm s-btn on-light" to="/contact">
                          Sold out — join the waiting list
                        </Link>
                      ) : membersOnly ? (
                        <Link className="b sm s-btn on-light" to="/membership">
                          Members Only — Join
                        </Link>
                      ) : (
                        <button
                          type="button"
                          className="b sm p-btn"
                          onClick={x.reg && x.reg !== key ? () => register(x.reg!) : onRegister}
                        >
                          {attending ? '\u2713 Attending' : rsvpMode ? 'RSVP' : `Register — ${x.city.split(',')[0]}`}
                        </button>
                      )}
                    </div>
                  </div>
                  )
                })
              )}
            </div>
          </div>
        </section>
  )

  const videoEl = (
            <div>
              {s.mux ? (
                <>
                  <div className="embed">
                    <iframe
                      src={`https://player.mux.com/${s.mux}?accent-color=%23C29A4B`}
                      allow="accelerometer; gyroscope; autoplay; encrypted-media; picture-in-picture;"
                      allowFullScreen
                      title={s.muxName ?? s.title}
                    />
                  </div>
                  {s.muxName && (
                    <div className="embed-cap">DOCTOR TESTIMONIAL — {s.muxName.toUpperCase()}</div>
                  )}
                </>
              ) : s.video ? (
                <div className="embed">
                  <iframe
                    src={s.video}
                    allow="autoplay; fullscreen; picture-in-picture"
                    allowFullScreen
                    title={`${s.title} — preview video`}
                  />
                </div>
              ) : null}
            </div>
  )

  /* The About section normally follows the marketing story; a page can put
   * it first instead (the conference leads with its theme). */
  const aboutFirst = Boolean(story && s.aboutFirst)
  const aboutSec = (
      <section className="tight" style={{ paddingTop: '20px' }}>
          <div className={story ? 'wrap' : 'wrap grid2'} style={story ? undefined : { gap: '56px', alignItems: 'start' }}>
            <div className={story ? 'about-wide' : undefined}>
              <div className="kick">About This Event</div>
              <h2 className="t" style={{ fontSize: '26px' }}>
                {s.h2}
              </h2>
              <div className="goldrule" />
              <div className="prose" dangerouslySetInnerHTML={{ __html: s.overview }} />
            </div>
            {!story && (
            <div>
              {videoEl}
              <div className="memberprice">
                <div className="mp-h">Member pricing</div>
                <p>{s.member}</p>
                <Link className="t-link" to="/membership">
                  About Membership<span className="a">→</span>
                </Link>
              </div>
            </div>
            )}
          </div>
        </section>
  )

  /* The registration band sits at the bottom, or near the top on a page that
   * leads with its About section (the conference). */
  const regSec = s.regBand && (
        <section className="tight" id="sd-reg-sec" style={{ paddingTop: '8px' }}>
          <div className="wrap">
            <div className="regband">
              <div className="rb-top">
                <div className="rb-kick">Registration</div>
                <h2>{s.regBand.h ?? `Register for ${s.title}`}</h2>
                <div className="rb-rule" />
                <p className="rb-sub">{s.regBand.sub ?? `${s.dates} · ${s.loc}`}</p>
              </div>
              {rsvpMode && (
                <div className="rb-member">
                  <b>{attending ? 'You\u2019re on the attendee list.' : 'You\u2019re an AOI member \u2014 your seat is included.'}</b>
                  <span>{attending ? 'Your RSVP is confirmed. Details and reminders will follow as the date approaches.' : 'RSVP for yourself below. The only optional charge is the CE credit certificate.'}</span>
                </div>
              )}
              {/* A member sees only their own card; while membership is still
               * being checked the cards keep their space but stay out of sight. */}
              <div className={`rb-tiers${checking ? ' checking' : ''}`}>
                {(rsvpMode ? s.regBand.tiers.filter((tier) => tier.member) : s.regBand.tiers).map((tier) => (
                  <div className={`rt${tier.hi ? ' hi' : ''}`} key={tier.k}>
                    {tier.flag && <span className="rt-flag">{tier.flag}</span>}
                    <div className="rt-k">{tier.k}</div>
                    <div className="rt-p">{tier.p}</div>
                    <div className="rt-n">{tier.n}</div>
                  </div>
                ))}
              </div>
              <div className="rb-go">
                {soldOut && !attending ? (
                  <Link className="b lg s-btn on-dark" to="/contact">
                    Sold out — join the waiting list
                  </Link>
                ) : (
                  <button type="button" className="b lg p-btn" onClick={onRegister} disabled={Boolean(attending)}>
                    {regLabel(s.regBand.btn ?? 'Register Now')}
                  </button>
                )}
                {!rsvpMode && !checking && s.regBand.note && <p className="rb-note">{s.regBand.note}</p>}
              </div>
            </div>
          </div>
        </section>
  )

  const facultySec = (
      speakers.length > 0 && (
        <section className="tight" style={{ paddingTop: '8px' }} id="presenters">
          <div className="wrap">
            <div className="kick">{s.speakerFaces ? 'Presenters' : 'Faculty'}</div>
            <h2 className="t" style={{ fontSize: '26px' }}>
              {s.speakerFaces ? `${speakers.length} presenters, one weekend` : 'Your instructors'}
            </h2>
            <div className="goldrule" />
            {s.speakerFaces && (() => {
              /* Pick a presenter on the left; their bio and sessions show on the
               * right (below, on a phone). The first presenter shows by default,
               * so the prerendered page carries a real bio. */
              const sel = presenter && PEOPLE[presenter] ? presenter : speakers.find((id) => PEOPLE[id])
              const p = sel ? PEOPLE[sel] : undefined
              const talks = sel ? agenda.flatMap((day) => day.items.filter((it) => it.who?.includes(sel)).map((it) => ({ day: day.date ?? day.day, t: `${it.t} ${it.ap.split(' · ')[0]}`, title: it.title }))) : []
              return (
                <>
                  <p className="spres-hint">Tap a presenter to read their bio.<span className="swipe"> Swipe or tap the arrows to see everyone.</span></p>
                  <div className="spres">
                    <div className={`spres-strip${stripEnds.start ? ' at-start' : ''}${stripEnds.end ? ' at-end' : ''}`}>
                    <button type="button" className="spres-arrow prev" aria-label="Previous presenters" disabled={stripEnds.start} onClick={() => moveStrip(-1)}>
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" aria-hidden="true"><path d="M15 5l-7 7 7 7" /></svg>
                    </button>
                    <div className="spres-grid" role="tablist" aria-label="Presenters" ref={stripRef} onScroll={readStrip}>
                      {speakers.map((id) => PEOPLE[id] && (
                        <button type="button" role="tab" aria-selected={id === sel} aria-controls="spres-bio" key={id} className={`spres-face${id === sel ? ' on' : ''}`} onClick={() => setPresenter(id)}>
                          <span className="ph"><Face id={id} /></span>
                          <span className="nm">{PEOPLE[id]!.name}</span>
                        </button>
                      ))}
                    </div>
                    <button type="button" className="spres-arrow next" aria-label="More presenters" disabled={stripEnds.end} onClick={() => moveStrip(1)}>
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" aria-hidden="true"><path d="M9 5l7 7-7 7" /></svg>
                    </button>
                    </div>
                    {p && (
                      <div className="spres-bio" id="spres-bio" role="tabpanel" aria-live="polite">
                        <div className="top">
                          <span className="ph"><Face id={sel!} /></span>
                          <div>
                            <h3>{p.name}</h3>
                            <div className="cred">{p.cred}</div>
                          </div>
                        </div>
                        {talks.length > 0 && (
                          <ul className="talks">
                            {talks.map((x) => <li key={x.title}><span>{x.day} · {x.t}</span>{x.title}</li>)}
                          </ul>
                        )}
                        <p>{p.bio}</p>
                      </div>
                    )}
                  </div>
                </>
              )
            })()}
            {keynote && PEOPLE[keynote] && (
              <button type="button" className="keynote" onClick={() => openBio(keynote)}>
                <div className="bd">
                  <span className="flag">KEYNOTE SPEAKER</span>
                  <h4>{PEOPLE[keynote]!.name}</h4>
                  <div className="cred">{PEOPLE[keynote]!.cred}</div>
                  <p>{s.keynoteBlurb ?? PEOPLE[keynote]!.bio}</p>
                  <span className="t-link" style={{ color: 'var(--color-brand-accent-bright)' }}>
                    Full Bio →
                  </span>
                </div>
                <div className="pho">
                  <Face id={keynote} />
                </div>
              </button>
            )}
            {!s.speakerFaces && <div className="spk-grid">
              {rest.map((id) => {
                const person = PEOPLE[id]
                if (!person) return null
                return (
                  <button type="button" className="spk-card" key={id} onClick={() => openBio(id)}>
                    <div className="pho">
                      <Face id={id} />
                    </div>
                    <span className="rtag">{person.role}</span>
                    <div className="bd">
                      <h4>{person.name}</h4>
                      <div className="cred">{person.cred}</div>
                      <p>Tap for bio</p>
                    </div>
                  </button>
                )
              })}
            </div>}
          </div>
        </section>
      )
  )

  const sponsorsSec = (
      s.sponsors && s.sponsors.length > 0 && (
        <section className="dark tight sponsors">
          <div className="wrap">
            <div className="kick">Sponsors</div>
            <h2 className="t" style={{ fontSize: '26px' }}>
              Thank you to this year’s sponsors
            </h2>
            <div className="goldrule" />
            <div className="spons">
              {s.sponsors.map((x) => (
                <a className={`spon${x.light ? ' light' : ''}`} key={x.name} href={x.url} target="_blank" rel="noopener noreferrer">
                  <img src={`/images/${x.logo}.webp`} alt={x.name} width={x.w} height={x.h} loading="lazy" decoding="async" />
                </a>
              ))}
            </div>
            <p className="spon-note">
              Interested in sponsoring?{' '}
              <Link className="t-link" to="/contact">
                Contact the Institute
              </Link>
            </p>
          </div>
        </section>
      )
  )

  const curriculumSec = (
      <section className="mist">
        <div className="wrap">
          <div className="learn-center">
          <div className="kick">Curriculum</div>
          <h2 className="t" style={{ fontSize: '26px' }}>
            What you&apos;ll learn
          </h2>
          <div className="goldrule" />
          </div>
          <div className="learn learn-centered">
            {s.learn.map((item) => (
              <div className="li" key={item}>
                <svg
                  width="17"
                  height="17"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="var(--color-brand-accent)"
                  strokeWidth="2.6"
                >
                  <path d="M20 6 9 17l-5-5" />
                </svg>
                {item}
              </div>
            ))}
          </div>

        </div>
      </section>
  )

  const agendaSec = (
      agenda.length > 0 && (
        <section className="tight">
          <div className="wrap">
            <div id="agenda" className={`agwrap${agendaOpen ? ' open' : ''}`}>
              <div className="kick">Agenda</div>
              <h2 className="t" style={{ fontSize: '26px' }}>
                How the time is spent
              </h2>
              <div className="goldrule" />
              <button type="button" className="b sm s-btn on-light agopen" onClick={() => setAgendaOpen(true)}>
                View the full agenda
              </button>
              <div className="agbody">
                {agenda.length > 1 && (
                  <div className="agtabs" role="tablist">
                    {agenda.map((day, i) => (
                      <button
                        type="button"
                        role="tab"
                        aria-selected={i === agendaDay}
                        className={`agtab${i === agendaDay ? ' on' : ''}`}
                        key={day.day}
                        onClick={() => setAgendaDay(i)}
                      >
                        {day.day}
                        <small>{day.date ?? ''}</small>
                      </button>
                    ))}
                  </div>
                )}
                {agenda.map((day, i) => (
                  <div
                    className={`agday${i === agendaDay || agenda.length === 1 ? ' on' : ''}`}
                    key={day.day}
                  >
                    {day.items.map((item) => (
                      <div className="agrow" key={`${item.t}-${item.title}`}>
                        <div className="rail">
                          <div className="tm">{item.t}</div>
                          <div className="ap">{item.ap}</div>
                        </div>
                        <div className="acard">
                          <h4>{item.title}</h4>
                          <p>{item.desc}</p>
                          {item.who && item.who.length > 0 && (
                            <div>
                              {item.who.map((id) => (
                                <SpeakerPill id={id} key={id} />
                              ))}
                            </div>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                ))}
              </div>
              {agenda.some((day) => day.items.some((item) => item.who && item.who.length > 0)) && (
                <p className="agenda-hint">TAP ANY INSTRUCTOR PILL FOR THEIR BIO</p>
              )}
            </div>

          </div>
        </section>
      )
  )

  const ceSec = (
      s.ce && (
        <section className="tight" id="sd-ce">
          <div className="wrap">
            <div className="kick">Continuing Education</div>
            <h2 className="t" style={{ fontSize: '26px' }}>
              {Number(s.ce.hours)} CE hours through {s.ce.sponsor.split(',')[0]}
            </h2>
            <div className="goldrule" />
            <p className="cesum">{s.ce.note}</p>
            <p className="cesum">
              <b>CE counts in</b>{' '}
              {[...s.ce.approved.map(([st]) => st), ...s.ce.auto, ...s.ce.self].sort().join(', ')}.
              {s.ce.pending.length > 0 && <> <b>Pending:</b> {s.ce.pending.join(', ')}.</>}
            </p>
            <details className="cedetails">
              <summary>Approval numbers, states not covered and special cases</summary>
              <div className="cegrid">
                <div className="cecard">
                  <div className="cek">Approved</div>
                  <ul>{s.ce.approved.map(([st, n]) => <li key={st}><b>{st}</b><span>{n}</span></li>)}</ul>
                </div>
                <div className="cecard">
                  <div className="cek">Auto-approved</div>
                  <p>{s.ce.auto.join(' · ')}</p>
                  <div className="cek" style={{ marginTop: '14px' }}>DC self-reporting</div>
                  <p>{s.ce.self.join(' · ')}</p>
                </div>
                <div className="cecard">
                  <div className="cek">Not applied for</div>
                  <p>{s.ce.notApplied.join(' · ')}</p>
                  <div className="cek" style={{ marginTop: '14px' }}>Special cases</div>
                  <ul className="plain">{s.ce.special.map(([st, n]) => <li key={st}><b>{st}</b> {n}</li>)}</ul>
                </div>
              </div>
              <p className="cenote">{s.ce.disclaimer}</p>
            </details>
          </div>
        </section>
      )
  )

  return (
    <div className="sempage">
      <div className="hero-img short">
        <div
          className={`bg ${s.img ?? ''}`}
          id="sd-img"
          style={
            s.photo
              ? {
                  backgroundImage: `url(/images/${s.photo}.webp)`,
                  backgroundSize: 'cover',
                  backgroundPosition: 'center',
                }
              : undefined
          }
        />
        <div className="duo" />
        <div className="duo2" />
        <div className="scrim" />
        <div className="wrap inner">
          <div className="crumbs">
            <Link to="/">HOME</Link> <b>/</b> <Link to="/seminars">SEMINARS</Link> <b>/</b>{' '}
            <span>{s.title.toUpperCase()}</span>
          </div>
          <div className="kick">{s.kicker}</div>
          <h1>{s.title}</h1>
          <p className="sub">{s.sub}</p>
          {story && (
            <>
              <StoryGoals story={story} />
              <div className="sherocta">{cta}</div>
            </>
          )}
        </div>
      </div>

      <div className="wrap">
        <div className="facts">
          <div className="fact">
            <span>DATES</span>
            <b>{s.dates}</b>
          </div>
          <div className="fact">
            <span>LOCATION</span>
            <b>{s.loc}</b>
          </div>
          <div className="fact">
            <span>LEVEL</span>
            <b>{s.level}</b>
          </div>
          <div className="fact">
            <span>FORMAT</span>
            <b>{s.format}</b>
          </div>
          <div className="fact">
            <span>TUITION</span>
            <b>
              {s.price}
              {priceNote && <em>{priceNote}</em>}
            </b>
          </div>
        </div>
        {s.ruleNote && <p className="rulenote">{s.ruleNote}</p>}
        {s.cat !== 'free' && s.cat !== 'internship' && s.fullPrice > 0 && <p className="rulenote">{refundLine(overlay?.event?.starts_at)}</p>}

        <div className="memberbar">
          <div>
            <div className="mb-t">{memberBanner}</div>
            {s.mbSub && <div className="mb-s">{s.mbSub}</div>}
          </div>
          <Link className="b sm" to="/membership">
            Join the Institute
          </Link>
        </div>
      </div>

      {!story && sessionsSec}

      {aboutFirst && aboutSec}

      {s.stats && (
        <section className="dark tight scd">
          <div className="wrap">
            {daysLeft !== null && (
              <div className="scd-big">
                <span className="n">{daysLeft}</span>
                <span className="l">{daysLeft === 1 ? 'Day' : 'Days'} to go</span>
              </div>
            )}
            <div>
              {s.statsH && <h3>{s.statsH}</h3>}
              <div className="scd-pills">
                {s.stats.map(([n, t]) => <span className="pill" key={t}><b>{n}</b> {t}</span>)}
              </div>
              <div style={{ marginTop: '22px' }}>{cta}</div>
            </div>
          </div>
        </section>
      )}

      {s.featured && (
        <section className="tight">
          <div className="wrap">
            {s.featured && (
              <>
                <div className="kick">Featured Sessions</div>
                <h2 className="t">A few of the talks you won’t want to miss</h2>
                <div className="goldrule" />
                <div className="sfeat">
                  {s.featured.map((f) => {
                    const person = PEOPLE[f.who]
                    return (
                      <div className="sf" key={f.title}>
                        <button type="button" className="who" onClick={() => openBio(f.who)}>
                          <span className="ph"><Face id={f.who} /></span>
                          <span><span className="nm">{person?.name}</span><span className="when">{f.when}</span></span>
                        </button>
                        <h3>{f.title}</h3>
                        <p>{f.desc}</p>
                        <button type="button" className="go" onClick={() => { setAgendaDay(f.day); setAgendaOpen(true); document.getElementById('agenda')?.scrollIntoView({ behavior: 'smooth' }) }}>
                          In the agenda <span aria-hidden="true">→</span>
                        </button>
                      </div>
                    )
                  })}
                </div>
                {s.speakerFaces && speakers.length > 0 && (
                  <button type="button" className="b sm s-btn on-light" style={{ marginTop: '26px' }} onClick={() => document.getElementById('presenters')?.scrollIntoView({ behavior: 'smooth' })}>
                    Meet all {speakers.length} presenters
                  </button>
                )}
              </>
            )}
          </div>
        </section>
      )}

      {aboutFirst && regSec}

      {story && (
        <>
          <StoryProblem story={story} />
          <StorySolution story={story} cta={cta} />
          <StoryBenefits story={story} />
          <StoryWhy story={story} />
          <StoryData story={story} />
          <StorySteps story={story} cta={cta} />
        </>
      )}

      {/* Pages with a story say all of this in How We Help; the About text
       * still feeds the page's search description. */}
      {!story && aboutSec}

      {story && !aboutFirst ? (
        /* Seminar pages: proof and fit come before the detail, then dates,
         * the instructors and the questions. */
        <>
          <StoryVoices story={story} video={s.mux || s.video ? videoEl : undefined} />
          <StoryFit story={story} />
          {curriculumSec}
          {agendaSec}
          {sessionsSec}
          {facultySec}
          <StoryFaq story={story} />
          {ceSec}
          {sponsorsSec}
          {regSec}
        </>
      ) : aboutFirst && story ? (
        /* The conference: presenters, then doctors' own words when there are
         * any, fit, sponsors, then the detail. */
        <>
          {facultySec}
          <StoryVoices story={story} video={s.mux || s.video ? videoEl : undefined} />
          <StoryFit story={story} />
          {sponsorsSec}
          {curriculumSec}
          {agendaSec}
          {ceSec}
          <StoryFaq story={story} />
        </>
      ) : (
        <>
          {facultySec}
          {sponsorsSec}
          {curriculumSec}
          {agendaSec}
          {ceSec}
          {story && (
            <>
              <StoryVoices story={story} video={s.mux || s.video ? videoEl : undefined} />
              <StoryFit story={story} />
              <StoryFaq story={story} />
              {sessionsSec}
            </>
          )}
          {!aboutFirst && regSec}
        </>
      )}

      <section className="ctaband tight">
        <div className="wrap">
          <div>
            <h3>{s.ctaH}</h3>
            <p>{s.ctaP}</p>
          </div>
          <button type="button" className="b lg p-btn" onClick={onBottom}>
            {regLabel(s.ctaBtn ?? 'Register Now')}
          </button>
        </div>
      </section>

      <section className="tight">
        <div className="wrap">
          <div className="kick">Keep Exploring</div>
          <h2 className="t" style={{ fontSize: '24px' }}>
            Related training
          </h2>
          <div className="goldrule" />
          <div className="grid3">
            {related.map((id) => (
              <SeminarCard id={id} key={id} />
            ))}
          </div>
        </div>
      </section>
      <button type="button" className={`totop${showTop ? ' show' : ''}`} aria-label="Back to top" tabIndex={showTop ? 0 : -1} onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" aria-hidden="true"><path d="M12 19V5M5 12l7-7 7 7" /></svg>
      </button>
    </div>
  )
}
