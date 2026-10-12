import { useEffect, useState } from 'react'
import { Link } from '@/lib/router'
import SeminarCard from '@/components/blocks/SeminarCard'
import { SEMINARS, SEMINAR_SLUG } from '@/content/seminars'
import { AS_OF, calendarRows, firstCalendarYear, longRange, nextInPerson } from '@/content/calendar'
import { useRegistration } from '@/components/blocks/RegistrationDialog'

/** `intro` has the START HERE pointer (and the featured card under Free), so it is not in the grid. */
const ORDER = ['fund1', 'fund2', 'fund3', 'intensive', 'bootcamp', 'conference', 'internship']

const FILTERS = [
  { cat: 'all', label: 'All Events' },
  { cat: 'fundamentals', label: 'Fundamentals' },
  { cat: 'intensive', label: 'Intensive' },
  { cat: 'bootcamp', label: 'Bootcamp' },
  { cat: 'conference', label: 'Conference' },
  { cat: 'free', label: 'Free' },
  { cat: 'internship', label: 'Internships' },
]

export default function SeminarsPage() {
  const first = firstCalendarYear()
  const years = [first, first + 1]
  const [filter, setFilter] = useState('all')
  const register = useRegistration()
  /* The featured card is the next in-person event. It starts from the build's
   * date (`AS_OF`), which the prerendered HTML was drawn from, so the first
   * client render matches it; on mount it is worked out again from the
   * visitor's clock, so an event that has passed since the build gives way
   * to the next one. */
  const [today, setToday] = useState(AS_OF)
  useEffect(() => setToday(new Date()), [])
  const next = nextInPerson(today)
  const nextSem = SEMINARS[next.page]!
  const nextHref = `/seminars/${SEMINAR_SLUG[next.page]}`
  const showNext = filter === 'all' || filter === nextSem.cat

  /* The featured event is not repeated in the grid beneath it. */
  const visible = ORDER.filter((id) => (filter === 'all' || SEMINARS[id]?.cat === filter) && !(showNext && id === next.page))
  const empty = visible.length === 0 && filter !== 'free' && !showNext

  return (
    <>
      <div className="hero-img short">
        <div className="bg ph-b" />
        <div className="duo" />
        <div className="duo2" />
        <div className="scrim" />
        <div className="wrap inner">
          <div className="crumbs">
            <Link to="/">HOME</Link> <b>/</b> SEMINARS
          </div>
          <div className="kick">Train With Us</div>
          <h1>Seminars &amp; Events</h1>
          <p className="sub">
            From your first free course to full mastery — every training pathway through the
            Institute.
          </p>
        </div>
      </div>

      <section className="tight">
        <div className="wrap">
          {/* On a phone the filter is hidden and every event is listed */}
          <div
            style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', marginBottom: '34px' }}
            id="filterrow"
            role="group"
            aria-label="Filter events by category"
          >
            {FILTERS.map((f) => (
              <button
                type="button"
                key={f.cat}
                className={`b sm ${filter === f.cat ? 'p-btn' : 's-btn on-light'} fchip`}
                aria-pressed={filter === f.cat}
                onClick={() => setFilter(f.cat)}
              >
                {f.label}
              </button>
            ))}
          </div>

          {/* START HERE — a pointer to the free intro, under every filter but Free */}
          {filter !== 'free' && (
            <div className="startfree">
              <span className="startfree-flag">START HERE · FREE</span>
              <p>
                <b>New to Advanced Orthogonal?</b> Take the free two-hour Intro to AdvO course online,
                at your own pace.
              </p>
              <div className="startfree-actions">
                <button type="button" className="b sm p-btn" onClick={() => register('intro')}>
                  Sign Up Free
                </button>
                <Link className="t-link" to="/seminars/intro-to-advo">
                  Course Details<span className="a">→</span>
                </Link>
              </div>
            </div>
          )}

          {/* NEXT UP — the soonest in-person event, worked out from the calendar */}
          {showNext && (
            <div className="featintro">
              <Link className="featintro-media" to={nextHref} aria-label={`${nextSem.title} details`}>
                <div
                  className={nextSem.img ?? 'ph-c'}
                  style={{
                    position: 'absolute',
                    inset: 0,
                    ...(nextSem.photo
                      ? { backgroundImage: `url(/images/${nextSem.photo}.webp)`, backgroundSize: 'cover', backgroundPosition: 'center' }
                      : {}),
                  }}
                >
                  <div className="duo" />
                  <div className="duo2" />
                </div>
                <div className="featintro-fade" />
              </Link>
              <div className="featintro-body">
                <span className="featintro-flag">NEXT UP · IN PERSON</span>
                <div className="featintro-eyebrow">
                  {longRange(next.o).toUpperCase()} · {next.where.toUpperCase()}
                </div>
                <h3>{next.page === 'conference' ? `${next.o.year} ${nextSem.title}` : nextSem.title}</h3>
                <p>{nextSem.sub}</p>
                <div>
                  <Link className="b p-btn" to={nextHref}>
                    Details &amp; Registration
                  </Link>
                </div>
              </div>
            </div>
          )}

          {/* Under the Free filter, the intro course takes the featured spot */}
          {filter === 'free' && (
            <div className="featintro">
              <Link
                className="featintro-media"
                to="/seminars/intro-to-advo"
                aria-label="Intro to AdvO course details"
              >
                <div className="ph-c" style={{ position: 'absolute', inset: 0 }}>
                  <div className="duo" />
                  <div className="duo2" />
                </div>
                <div className="featintro-fade" />
              </Link>
              <div className="featintro-body">
                <span className="featintro-flag">START HERE · FREE</span>
                <div className="featintro-eyebrow">ONLINE · SELF-PACED · 2 HOURS</div>
                <h3>Intro to AdvO</h3>
                <p>
                  New to Advanced Orthogonal? Start with our free two-hour Intro to AdvO course—a
                  comprehensive overview of the technique, its principles, and the training pathways
                  available through the Institute.
                </p>
                <div style={{ display: 'flex', gap: '14px', alignItems: 'center', flexWrap: 'wrap' }}>
                  <button type="button" className="b p-btn" onClick={() => register('intro')}>
                    Sign Up Free
                  </button>
                  <Link className="t-link featintro-link" to="/seminars/intro-to-advo">
                    Course Details<span className="a">→</span>
                  </Link>
                </div>
              </div>
            </div>
          )}

          <div className="grid3" id="semgrid">
            {visible.map((id) => (
              <SeminarCard id={id} key={id} />
            ))}
            {/* On a phone the free intro is the last row instead of the strip at the top */}
            {filter !== 'free' && <SeminarCard id="intro" key="intro" />}
          </div>
          {empty && (
            <p id="semempty" style={{ fontSize: '15px', color: 'var(--color-content-muted)', padding: '30px 0' }}>
              No events in this category right now — check back soon.
            </p>
          )}
        </div>
      </section>

      <section className="mist tight" id="calendar">
        <div className="wrap">
          <div className="kick">Plan Ahead</div>
          <h2 className="t">The {years[0]} &amp; {years[1]} Calendar</h2>
          <div className="goldrule"></div>
          <p className="lede">
            Every event falls on the same days each year — the rule under each name tells you
            which — so you can plan your practice around it long before registration opens. Dates are subject to change.
          </p>
          <div className="evcal" role="table" aria-label={`${years[0]} and ${years[1]} event calendar`}>
            <div className="evcal-row evcal-head" role="row">
              <span role="columnheader">Event</span>
              {years.map((y) => <span role="columnheader" key={y}>{y}</span>)}
              <span role="columnheader">Where</span>
            </div>
            {calendarRows(years).map((row) => (
              <div className="evcal-row" role="row" key={row.rule}>
                <span className="ev" role="cell">
                  {row.page ? <Link to={`/seminars/${SEMINAR_SLUG[row.page]}`}>{row.event}</Link> : <b>{row.event}</b>}
                  <small>{row.rule}</small>
                </span>
                {row.years.map((d, i) => <span className="yr" role="cell" data-yr={years[i]} key={years[i]}>{d}</span>)}
                <span className="where" role="cell">{row.where}</span>
              </div>
            ))}
          </div>
          <p className="evcal-note">
            <b>Fundamentals 1–3</b> are taught live on Zoom in the <b>Monthly Huddle</b> for AOI members, on the second
            Tuesday of the month at 9:00 pm Eastern (8:00 Central, 7:00 Mountain, 6:00 Pacific):
            Fundamental 1 October–January, Fundamental 2 February–May, Fundamental 3 June–September.
          </p>
        </div>
      </section>

      <section className="ctaband tight">
        <div className="wrap">
          <div>
            <h3>Members save $200 on every Intensive and $600 on Bootcamp.</h3>
            <p>The Monthly Huddle and the Annual Conference are included with membership.</p>
          </div>
          <Link className="b lg p-btn" to="/membership">
            Join the Institute
          </Link>
        </div>
      </section>
    </>
  )
}
