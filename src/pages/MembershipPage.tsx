import { Link } from '@/lib/router'

export default function MembershipPage() {
  return (
    <>
      <div className="hero-img short">
          <div className="bg ph-a"></div><div className="duo"></div><div className="duo2"></div><div className="scrim"></div>
          <div className="wrap inner">
            <div className="crumbs">HOME <b>/</b> MEMBERSHIP</div>
            <div className="kick">Advance Your Practice · Strengthen Your Network · Shape the Future</div>
            <h1>AOI Membership</h1>
            <p className="sub">The members of the Advanced Orthogonal Institute are the keystone of our Institute's strength and progress.</p>
          </div>
        </div>

        <section className="tight">
          <div className="wrap" style={{"display": "grid", "gridTemplateColumns": "1.15fr .85fr", "gap": "56px", "alignItems": "start"}}>
            <div className="prose">
              <p>As a member, you not only guide the future of the organization through your voice and your vote, but you also gain access to essential resources designed to propel your career as an Advanced Orthogonal doctor and strengthen your expertise in the upper cervical specialty.</p>
              <p>The culture of our Institute—built on trust, collaboration, and shared purpose—is the fuel that drives innovation and growth. Together, our members pool resources, advance research, and pursue key goals that shape the future of Advanced Orthogonal care.</p>
              <h3>Who is membership for?</h3>
              <p>Membership in the Advanced Orthogonal Institute is intentionally broad and inclusive. Membership is open to:</p>
              <ul>
                <li><b>Veteran AdvO Doctors</b> — ongoing opportunities to continue training, shape the future of the organization, and, for those who are certified, pursue eligibility for board membership.</li>
                <li><b>Students</b> — access to resources that accelerate your learning and prepare you for a successful career.</li>
                <li><b>A.O. or EPIC Doctors</b> — a powerful way to accelerate your cross-training and certification, with a professional home and opportunities to engage in events and collaborative projects.</li>
                <li><b>Other Upper Cervical Chiropractors</b> — for doctors trained in other upper cervical techniques who want to transition into Advanced Orthogonal, refine their approach, or cross-train to expand their expertise.</li>
              </ul>
              <p>This is not a closed membership requiring prior certification. Instead, it serves as the gateway to growth—an open access point designed to accelerate your learning, strengthen your expertise, and expand your professional opportunities.</p>
            </div>

            <div style={{"position": "sticky", "top": "120px"}}>
              <div style={{"background": "var(--color-surface-inverse)", "borderRadius": "6px", "padding": "36px", "color": "var(--color-surface-base)", "position": "relative", "overflow": "hidden"}}>
                <div style={{"position": "absolute", "right": "-70px", "top": "-70px", "width": "220px", "height": "220px", "border": "1.5px solid color-mix(in oklab, var(--color-brand-accent) 35.0%, transparent)", "borderRadius": "50%"}}></div>
                <div className="kick" style={{"color": "var(--color-brand-accent)"}}>Annual Membership</div>
                <div style={{"fontFamily": "'Outfit',sans-serif"}}><span style={{"fontSize": "50px", "fontWeight": "800"}}>$799</span><span style={{"fontSize": "14px", "color": "var(--color-content-on-inverse-muted)"}}> / year</span></div>
                <div style={{"fontFamily": "var(--font-label)", "fontWeight": "600", "fontSize": "11px", "letterSpacing": ".14em", "color": "var(--color-brand-accent-bright)", "margin": "6px 0 8px"}}>ANNUAL MEMBERSHIP</div><div style={{"fontSize": "13px", "color": "var(--color-content-on-inverse-muted)", "margin": "0 0 22px", "lineHeight": "1.6"}}>Joining or renewing before December 31, 2026 is <b style={{"color": "var(--color-surface-base)"}}>$799</b>. From January 1, 2027 annual membership is <b style={{"color": "var(--color-surface-base)"}}>$999</b>.</div>
                <div style={{"borderTop": "1px solid color-mix(in oklab, var(--color-surface-base) 12.0%, transparent)", "paddingTop": "20px", "fontSize": "14px", "color": "var(--color-content-on-inverse-subtle)", "lineHeight": "2"}}>
                  ✓ Annual Conference registration included ($797 value)<br />
                  ✓ $600 off AdvO Bootcamp<br />
                  ✓ $200 off every Intensive<br />
                  ✓ Voting rights &amp; board eligibility<br />
                  ✓ Doctor Directory listing (Level 1 certified)<br />
                  ✓ Exclusive partner discounts
                </div>
                <div style={{"marginTop": "26px"}}><Link to="/membership/join" className="b lg p-btn" style={{"width": "100%", "justifyContent": "center"}}>Join the Institute</Link></div>
                <p style={{"fontSize": "11.5px", "color": "var(--color-content-muted)", "marginTop": "14px", "textAlign": "center"}}>Membership renews annually and automatically.</p>
              </div>
            </div>
          </div>
        </section>

        <section className="mist">
          <div className="wrap">
            <div className="kick">Membership Benefits</div>
            <h2 className="t">What your membership unlocks.</h2>
            <div className="goldrule"></div>
            <div className="steps" style={{"gridTemplateColumns": "1fr 1fr"}}>
              <div className="step">
                <div className="n">01</div>
                <h3>Annual Conference registration included</h3>
                <p>Your membership comes with full registration for the AOI Annual Conference, a value of $797. This event is more than a meeting; it is the ultimate homecoming for AdvO doctors, students, and colleagues from across the upper cervical field. Members may also add continuing education credits for just $50.</p>
                <Link to="/seminars/annual-conference-2026" className="b sm s-btn on-light">About the Conference</Link>
              </div>
              <div className="step">
                <div className="n">02</div>
                <h3>Voting rights &amp; board eligibility</h3>
                <p>Membership gives you the right to vote in board elections, and certified members are eligible to run for board positions themselves. With three of the nine seats opening every year, new voices and forward-thinking leaders always have opportunities to influence the direction of the Institute and the profession.</p>
                <Link to="/board-of-directors" className="b sm s-btn on-light">Meet the Board</Link>
              </div>
              <div className="step">
                <div className="n">03</div>
                <h3>Discounts on training &amp; seminars</h3>
                <p>Members receive $600 off the AdvO Bootcamp, $200 off every Intensive, and exclusive partner discounts through UC Strategic Solutions, Synapse Continuing Education, and other collaborations that will expand as the Institute grows. These savings quickly add up, often covering the cost of membership itself.</p>
                <Link to="/seminars" className="b sm s-btn on-light">Browse Seminars</Link>
              </div>
              <div className="step">
                <div className="n">04</div>
                <h3>Directory listing &amp; patient exposure</h3>
                <p>Certified members — Level 1 or above — are listed in the Doctor Directory, an actively promoted resource that helps patients find qualified doctors they can trust. This visibility not only builds your credibility but also expands your practice reach.</p>
                <span className="b sm s-btn on-light">Doctor Directory</span>
              </div>
            </div>
          </div>
        </section>

        <section className="dark quoteband tight">
          <div className="wrap">
            <div>
              <div className="kick">Free Membership After Level 1</div>
              <blockquote>Complete your Level 1 Certification and receive <em>one free year of membership</em> — full conference registration and every standard benefit included.</blockquote>
              <div className="attr">OUR INVESTMENT BACK INTO <b>NEWLY CERTIFIED DOCTORS</b></div>
            </div>
            <div className="prose">
              <p style={{"color": "var(--color-content-on-inverse-muted)"}}>Certification marks the beginning of your professional journey, and your complimentary membership ensures that you stay plugged into the Institute at the very moment you are ready to grow the most.</p>
              <Link to="/certification" className="t-link" style={{"color": "var(--color-brand-accent-bright)"}}>The Certification Path<span className="a">→</span></Link>
            </div>
          </div>
        </section>

        <section className="ctaband tight">
          <div className="wrap">
            <div>
              <h3>Invest in your practice, your profession, and the future.</h3>
              <p>With conference registration included and deep seminar discounts, membership often pays for itself in the first year.</p>
            </div>
            <Link to="/membership/join" className="b lg p-btn">Join the Institute</Link>
          </div>
        </section>
    </>
  )
}
