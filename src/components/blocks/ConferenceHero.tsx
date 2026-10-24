/* ----------------------------------------------------------------------------
 * Home hero: the Annual Conference.
 *
 * Replaces the standing hero while the conference is ahead of us. The copy and
 * every number come from `SEMINARS.conference`, which is the same object that
 * feeds the conference page, its metadata and its structured data — so a price
 * or a date can never say one thing here and another there.
 *
 * The background (film, duotone, scrim) is the standing hero's, unchanged.
 *
 * `HeroConferenceOver` in HomePage decides which hero renders; this component
 * assumes it is wanted. The "N days out" chip is filled in after mount so the
 * prerendered HTML never carries a number that has since gone stale.
 * -------------------------------------------------------------------------- */
import { useEffect, useState } from 'react'
import { Link } from '@/lib/router'
import HeroVideo from '@/components/blocks/HeroVideo'
import { SEMINARS, SEMINAR_SLUG } from '@/content/seminars'

const C = SEMINARS.conference!
const HREF = `/seminars/${SEMINAR_SLUG.conference}`
const REGISTER = `${HREF}#sd-reg-sec`

/** First morning of the conference, Eastern. */
const STARTS = new Date('2026-11-06T08:00:00-05:00')

const money = (n?: number) => (n ? `$${n.toLocaleString('en-US')}` : 'Free')
/** "14.0" reads as "14" to a person. */
const CE_HOURS = String(C.ce?.hours ?? '').replace(/\.0$/, '')
/** "Sherman College of Chiropractic, Office of Continuing Education" -> the college. */
const CE_SPONSOR = String(C.ce?.sponsor ?? '').split(',')[0]

function daysOut(): string | null {
  const ms = STARTS.getTime() - Date.now()
  if (ms <= 0) return 'Happening now'
  const days = Math.ceil(ms / 86_400_000)
  if (days === 1) return 'Tomorrow'
  return `${days} days out`
}

export default function ConferenceHero() {
  const [countdown, setCountdown] = useState<string | null>(null)
  useEffect(() => setCountdown(daysOut()), [])

  return (
    <div className="hero-img cfhero">
      <div className="bg ph-b"></div>
      <HeroVideo />
      <div className="duo"></div><div className="duo2"></div><div className="scrim"></div>

      <div className="wrap inner">
        <div className="cfh-grid">

          <div className="cfh-lead">
            <div className="cfh-flags">
              <span className="cfh-open">Registration is open</span>
              <span className="cfh-meta">{C.format.replace(/ · .*$/, '')} &middot; {C.level}</span>
            </div>

            <h1>2026 Annual<br />Conference</h1>
            <div className="goldrule"></div>

            <p className="cfh-theme">
              This year&rsquo;s theme: <b>Inflection Point.</b>
            </p>

            {/* Phones only (CSS): the card and its button are a long scroll below. */}
            <div className="cfh-lead-cta">
              <Link to={REGISTER} className="b p-btn cfh-reg">Register for the Conference</Link>
            </div>

            <p className="sub">
              Two days of advanced clinical training, imaging, research, and case studies with the
              doctors moving this work forward: cone-beam CT and three-dimensional analysis of
              anatomical position and spatial relationships; updated terminology and corrective
              positioning; Sonus: Blueprint; vestibular-ocular rehabilitation; and why a correction
              doesn&rsquo;t hold. Plus the Institute&rsquo;s practice-based research project and what
              comes in 2027.
            </p>

            <div className="cfh-line">
              <b>{C.dates}</b>
              <span>{C.loc}</span>
              <span>{C.spk?.length ?? 0} presenters</span>
              <span>{CE_HOURS} CE hours</span>
            </div>
          </div>

          <aside className="cfh-card">
            <div className="cfh-top">
              <div className="cfh-status">
                <span>Registration open</span>
                {countdown && <span className="cfh-days">{countdown}</span>}
              </div>
              <div className="cfh-when">
                <b>Nov 6&ndash;7</b><i>2026</i>
              </div>
              <p className="cfh-where">Pierce Clinic of Chiropractic<br />St. Petersburg, Florida</p>
            </div>

            <ul className="cfh-tiers">
              <li className="hi"><span>AOI member</span><b>Included</b></li>
              <li><span>Doctor</span><b>{money(C.fullPrice)}</b></li>
              <li><span>Student</span><b>{money(C.studentPrice)}</b></li>
              {C.facultyFree && <li><span>Chiropractic college faculty</span><b>Free</b></li>}
            </ul>

            <div className="cfh-act">
              <Link to={REGISTER} className="b p-btn cfh-reg">Register for the Conference</Link>
              <p className="cfh-note">
                Members and faculty still register; the fee comes off at checkout. Members:
                sign in first so we can see your membership. {CE_HOURS} CE hours through {CE_SPONSOR}.
              </p>
            </div>
          </aside>

          <div className="cfh-more">
            <Link to={HREF} className="b lg s-btn on-dark">See the Full Program</Link>
          </div>

        </div>
      </div>
    </div>
  )
}
