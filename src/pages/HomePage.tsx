import { useEffect, useState } from 'react'
import { Link } from '@/lib/router'
import ProblemGrid from '@/components/blocks/ProblemGrid'
import TestimonialReel from '@/components/blocks/TestimonialReel'
import HeroVideo from '@/components/blocks/HeroVideo'
import { SEMINARS, datesAsOf } from '@/content/seminars'
import { AS_OF } from '@/content/calendar'
import ConferenceHero from '@/components/blocks/ConferenceHero'

/* The morning after the conference's last day, Eastern. Until then the hero
 * announces the conference; from then on the standing hero comes back on its
 * own, with nothing to remember and nothing to deploy. */
const CONFERENCE_ENDS = new Date('2026-11-08T00:00:00-05:00')

export default function HomePage() {
  /* Everything here that depends on the date starts from the build's date
   * (`AS_OF`), which is what the prerendered HTML was drawn from, so the first
   * client render matches it and hydrates cleanly. On mount each is worked out
   * again from the visitor's clock: a browser opening the page after the
   * conference swaps the standing hero back in, and the morning after a
   * weekend passes the cards already show the next one. */
  const [over, setOver] = useState(AS_OF.getTime() >= CONFERENCE_ENDS.getTime())
  useEffect(() => setOver(Date.now() >= CONFERENCE_ENDS.getTime()), [])
  /* "Explore 2026–2027 Seminars": this year and next, moving on by itself
   * each January, the same way. */
  const [year, setYear] = useState(AS_OF.getFullYear())
  useEffect(() => setYear(new Date().getFullYear()), [])
  /* The Intensive and Bootcamp date chips on the cards. */
  const [dates, setDates] = useState({ intensive: SEMINARS.intensive!.dates, bootcamp: SEMINARS.bootcamp!.dates })
  useEffect(() => setDates(datesAsOf(new Date())), [])

  return (
    <div className="page-home">
      {!over ? <ConferenceHero /> : (
      <div className="hero-img">
          <div className="bg ph-b"></div>
          <HeroVideo />
          <div className="duo"></div><div className="duo2"></div><div className="scrim"></div>
          <div className="wrap inner">
            <div className="herolead">
              <div className="kick">The Advanced Orthogonal Institute</div>
              <h1>Handle Complex Upper Cervical Cases with Greater Confidence</h1>
              <p className="sub">Learn a precise, repeatable clinical system that helps you make clearer decisions, deliver patient-specific corrections, and reduce the physical strain of adjusting.</p>
              <div className="herocta">
                <Link to="/seminars/intro-to-advo" className="b lg p-btn">Start the Free Intro Course</Link>
              </div>
              <div className="heronote">For chiropractors and chiropractic students <b>&middot;</b> Free <b>&middot;</b> Self-paced <b>&middot;</b> Two hours</div>
            </div>
          </div>
        </div>
      )}


        <section>
          <div className="wrap">
            <div className="kick">Where Cases Get Hard</div>
            <h2 className="t">When a Case Gets Complicated, Guesswork Isn't Good Enough</h2>
            <div className="goldrule"></div>
            <p className="lede">You take your patients' care seriously. But difficult upper cervical cases can still leave you questioning the measurements, correction vector, or next clinical step.</p>
            <p className="lede" style={{"marginTop": "14px"}}><b>You may be dealing with:</b></p>
            <ProblemGrid />
            <p className="probclose">You should not have to rely on trial and error to move a case forward.</p>
          </div>
        </section>


        <section className="mist">
          <div className="wrap">
            <div className="solsplit">
              <div>
                <div className="kick">The System</div>
                <h2 className="t">A More Precise and Repeatable Way Forward</h2>
                <div className="goldrule"></div>
                <div className="prose">
                  <p>Advanced Orthogonal is a complete upper cervical clinical system built around detailed analysis, patient-specific correction vectors, instrument-based adjusting, and continued evaluation.</p>
                  <p>It gives you a clear process to follow&mdash;not only when a case is simple, but when the findings are more difficult.</p>
                </div>
                <Link to="/seminars/intro-to-advo" className="b lg p-btn">Start with the Free Intro Course</Link>
              </div>
              <div className="solimg" id="sol-img" style={{"backgroundImage": "url(/images/analyze.webp)", "backgroundSize": "cover", "backgroundPosition": "center"}}></div>
            </div>
          </div>
        </section>


        <section>
          <div className="wrap">
            <div className="kick">What You Gain</div>
            <h2 className="t">Build a Clinical Process You Can Trust</h2>
            <div className="goldrule"></div>
            <div className="benegrid">
              <div className="bene"><div className="bar"></div><h3>Make Clearer Decisions</h3><p>Use patient-specific measurements and a defined clinical process to guide each correction.</p></div>
              <div className="bene"><div className="bar"></div><h3>Improve Repeatability</h3><p>Reduce variables that can make results depend too heavily on the individual doctor.</p></div>
              <div className="bene"><div className="bar"></div><h3>Approach Difficult Cases with Confidence</h3><p>Follow a system designed to help you evaluate results and make informed changes.</p></div>
              <div className="bene"><div className="bar"></div><h3>Reduce Physical Strain</h3><p>Deliver the correction through a table-mounted instrument instead of relying on forceful manual adjusting.</p></div>
              <div className="bene"><div className="bar"></div><h3>Keep Advancing</h3><p>Continue your training through seminars, certification, mentorship, and an active community of upper cervical doctors.</p></div>
            </div>
          </div>
        </section>


        <section className="mist">
          <div className="wrap">
            <div className="kick">The Path</div>
            <h2 className="t">See Whether Advanced Orthogonal Fits Your Practice</h2>
            <div className="goldrule"></div>
            <div className="steps">
              <div className="step">
                <div className="n">STEP 01</div>
                <h3>Take the Free Intro Course</h3>
                <p>Get a two-hour overview of the principles, procedures, and clinical approach.</p>
                <Link to="/seminars/intro-to-advo" className="b sm p-btn">Start the Free Course</Link>
              </div>
              <div className="step">
                <div className="n">STEP 02</div>
                <h3>Train Hands-On</h3>
                <p>Build your skills through seminars, Intensives, and Bootcamp.</p>
                <Link to="/seminars" className="b sm s-btn on-light">Explore {year}–{year + 1} Seminars</Link>
              </div>
              <div className="step">
                <div className="n">STEP 03</div>
                <h3>Work Toward Certification</h3>
                <p>Show your understanding and ability through the Institute's certification process.</p>
                <Link to="/certification" className="b sm s-btn on-light">The Certification Path</Link>
              </div>
            </div>
          </div>
        </section>


        <section className="dark quoteband">
          <div className="wrap">
            <div>
              <div className="kick">The Institute</div>
              <h2 className="t">Built for Doctors Who Refuse to Stop Improving</h2>
              <div className="goldrule"></div>
              <p className="lede">The Advanced Orthogonal Institute brings together practicing doctors, instructors, and students who believe upper cervical care should keep moving forward.</p>
              <p className="lede" style={{"marginTop": "16px"}}>Through training, research, collaboration, and certification, the Institute helps doctors develop a more precise and dependable approach to care.</p>
              <div style={{"marginTop": "24px"}}><Link to="/about" className="t-link" style={{"color": "var(--color-brand-accent-bright)"}}>Discover the Institute<span className="a">&rarr;</span></Link></div>
            </div>
            <div>
              <TestimonialReel />

              <div className="attr" style={{"marginTop": "16px"}}>IN THEIR OWN WORDS &middot; <b>ADVANCED ORTHOGONAL DOCTORS</b></div>
            </div>
          </div>
        </section>


        <section>
          <div className="wrap">
            <div className="kick">Fit Check</div>
            <h2 className="t">Is This Training Right for You?</h2>
            <div className="goldrule"></div>
            <p className="lede">Advanced Orthogonal may be a strong fit when you are:</p>
            <div className="quallist">
              <div className="qi"><span className="ck">&#10003;</span><span>An upper cervical doctor looking for more consistency</span></div>
              <div className="qi"><span className="ck">&#10003;</span><span>An Atlas Orthogonal doctor interested in transitioning or cross-training</span></div>
              <div className="qi"><span className="ck">&#10003;</span><span>A chiropractor exploring a precision-based upper cervical system</span></div>
              <div className="qi"><span className="ck">&#10003;</span><span>A student choosing how you want to practice</span></div>
              <div className="qi"><span className="ck">&#10003;</span><span>An experienced doctor looking to reduce physical strain</span></div>
              <div className="qi"><span className="ck">&#10003;</span><span>Ready to follow a detailed clinical process and continue developing your skills</span></div>
            </div>
          </div>
        </section>


        <section className="mist">
          <div className="wrap">
            <div className="kick">Train With Us</div>
            <h2 className="t">Upcoming Training Opportunities</h2>
            <div className="goldrule"></div>
            <div className="grid3">
              <Link to="/seminars/advo-intensive" className="card">
                <div className="imgwrap"><div className="img ph-b"><div className="duo"></div><div className="duo2"></div></div><div className="scrim"></div><span className="datechip">{dates.intensive.toUpperCase()}</span><span className="loc">ST. PETERSBURG <span>&middot; FL</span> &amp; OREM <span>&middot; UT</span></span></div>
                <div className="bd">
                  <h3>AdvO Intensive</h3>
                  <div className="meta">2 DAYS &middot; <b>HANDS-ON</b></div>
                  <p className="desc">Two days of hands-on training: the exam, X-ray and CBCT, corrective setup and the adjustment — demonstrated, then practiced.</p>
                  <div className="foot"><span className="t-link">View Event Details<span className="a">&rarr;</span></span></div>
                </div>
              </Link>
              <Link to="/seminars/advo-bootcamp-2027" className="card">
                <div className="imgwrap"><div className="img ph-a"><div className="duo"></div><div className="duo2"></div></div><div className="scrim"></div><span className="datechip">{dates.bootcamp.toUpperCase()}</span><span className="loc">TAMPA BAY <span>&middot; FL</span></span></div>
                <div className="bd">
                  <h3>AdvO Bootcamp</h3>
                  <div className="meta">5 DAYS &middot; <b>ALL LEVELS</b></div>
                  <p className="desc">Five days of hands-on training, guest education, clinical updates, and connection with the Advanced Orthogonal community.</p>
                  <div className="foot"><span className="t-link">View Bootcamp<span className="a">&rarr;</span></span></div>
                </div>
              </Link>
              <Link to="/seminars/annual-conference-2026" className="card">
                <div className="imgwrap"><div className="img ph-c"><div className="duo"></div><div className="duo2"></div></div><div className="scrim"></div><span className="datechip">NOV 6&ndash;7</span><span className="loc">ST. PETERSBURG <span>&middot; FL</span></span></div>
                <div className="bd">
                  <h3>AOI Annual Conference</h3>
                  <div className="meta">2 DAYS &middot; <b>ALL LEVELS</b></div>
                  <p className="desc">Advanced training, special topics, professional connection, and the Institute's annual community gathering.</p>
                  <div className="foot"><span className="t-link">View the Conference<span className="a">&rarr;</span></span></div>
                </div>
              </Link>
            </div>
            <div style={{"marginTop": "30px"}}><Link to="/seminars" className="t-link">View every {year}–{year + 1} event, including the Fundamentals Series<span className="a">&rarr;</span></Link></div>
          </div>
        </section>


        <section>
          <div className="wrap">
            <div className="kick">Questions</div>
            <h2 className="t">Frequently Asked Questions</h2>
            <div className="goldrule"></div>
            <div className="faq">
              <details className="faqi"><summary>Who is Advanced Orthogonal training for?</summary><div className="ans"><p>Training is designed for chiropractors and chiropractic students who want to learn a precise, instrument-based upper cervical approach. It may also be useful for doctors trained in Atlas Orthogonal, EPIC, Orthospinology, or other upper cervical systems who want to cross-train.</p></div></details>
              <details className="faqi"><summary>Do I need experience in upper cervical care?</summary><div className="ans"><p>No. The free Intro to AdvO course has no prerequisites and is a good starting point for doctors and students who are new to the technique.</p></div></details>
              <details className="faqi"><summary>What happens after the free course?</summary><div className="ans"><p>After the introduction, you can continue into the Fundamentals Series, attend a hands-on Intensive or Bootcamp, and begin working toward certification.</p></div></details>
              <details className="faqi"><summary>How long is the free course?</summary><div className="ans"><p>The Intro to AdvO course is self-paced and takes about two hours.</p></div></details>
              <details className="faqi"><summary>Does the technique use manual adjusting?</summary><div className="ans"><p>Advanced Orthogonal uses a percussive sound-wave instrument to deliver a patient-specific correction.</p></div></details>
              <details className="faqi"><summary>What equipment is needed?</summary><div className="ans"><p>You do not need to own equipment to begin. The free Intro course requires nothing but your time, and hands-on seminars provide the instruments and imaging you train on.</p><p>Clinical use of Advanced Orthogonal requires a percussive sound-wave instrument and access to the imaging the analysis depends on. Contact the Institute for current equipment details before you invest.</p></div></details>
              <details className="faqi"><summary>How is Advanced Orthogonal different from other upper cervical methods?</summary><div className="ans"><p>Advanced Orthogonal combines detailed digital measurements, patient-specific correction vectors, instrument-based adjusting, and a reproducible clinical process.</p></div></details>
              <details className="faqi"><summary>Can students attend seminars?</summary><div className="ans"><p>Yes. Chiropractic students are welcome at Institute training, and students are part of who this work is built for. Where a student rate is offered it is published on the event page — the Annual Conference student rate is $347. Bring proof of current enrollment.</p></div></details>
              <details className="faqi"><summary>How long does certification take?</summary><div className="ans"><p>The time needed depends on your previous training, seminar attendance, clinical experience, and completion of the Institute's requirements.</p></div></details>
              <details className="faqi"><summary>Do I need to become a member?</summary><div className="ans"><p>Membership is not required to begin with the free course.</p></div></details>
            </div>
          </div>
        </section>


        <section className="ctaband">
          <div className="wrap">
            <div style={{"maxWidth": "640px"}}>
              <h3>Stop Guessing and Start Building a More Repeatable Process</h3>
              <p style={{"marginTop": "12px"}}>Whether you are new to upper cervical care or ready to refine years of experience, your next step can be simple.</p>
              <p style={{"marginTop": "10px"}}>Start with the free two-hour Intro to Advanced Orthogonal course and see whether the approach fits your goals, your practice, and the patients you serve.</p>
            </div>
            <div style={{"textAlign": "right"}}>
              <Link to="/seminars/intro-to-advo" className="b lg p-btn" style={{"background": "var(--color-surface-base)", "color": "var(--color-brand-primary-deep)"}}>Start the Free Intro Course</Link>
              <div style={{"marginTop": "12px", "fontFamily": "var(--font-label)", "fontWeight": "600", "fontSize": "11px", "letterSpacing": ".14em", "textTransform": "uppercase", "color": "color-mix(in oklab, var(--color-surface-base) 85.0%, transparent)"}}>No prerequisites &middot; Self-paced &middot; Free</div>
              <div style={{"marginTop": "16px"}}><Link to="/seminars" className="t-link" style={{"color": "var(--color-surface-base)"}}>Explore {year}–{year + 1} Seminars<span className="a">&rarr;</span></Link></div>
            </div>
          </div>
        </section>
    </div>
  )
}
