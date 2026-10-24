/* ----------------------------------------------------------------------------
 * Where Stripe sends a new member after they pay.
 *
 * Deliberately says nothing it cannot know. The membership is recorded when
 * Stripe reports the paid invoice to stripe-webhook, which happens seconds
 * later and independently of this page — so this page thanks them and tells
 * them what is coming, rather than claiming an outcome it did not witness.
 *
 * Client-only and noindex: it exists only at the end of a checkout.
 * -------------------------------------------------------------------------- */
import { Link } from '@/lib/router'

export default function MembershipWelcomePage() {
  return (
    <>
      <div className="hero-img short">
        <div className="bg ph-b" />
        <div className="duo" /><div className="duo2" /><div className="scrim" />
        <div className="wrap inner">
          <div className="crumbs">
            <Link to="/">HOME</Link> <b>/</b> <Link to="/membership">MEMBERSHIP</Link> <b>/</b> WELCOME
          </div>
          <h1>Welcome to the Institute.</h1>
          <p className="sub">
            Your payment went through and your membership is being set up right now.
          </p>
        </div>
      </div>

      <section>
        <div className="wrap">
          <div className="kick">What happens next</div>
          <h2 className="t">Two emails, then you are in.</h2>
          <div className="goldrule" />

          <div className="steps" style={{ gridTemplateColumns: '1fr 1fr' }}>
            <div className="step">
              <div className="n">01</div>
              <h3>Your receipt</h3>
              <p>
                Stripe emails it within a minute or two. Keep it — it is your record of the annual
                membership fee.
              </p>
            </div>
            <div className="step">
              <div className="n">02</div>
              <h3>Your members-area link</h3>
              <p>
                A second email arrives shortly after, with one button to choose a password. That is
                the whole setup. If it has not landed in ten minutes, check your spam folder, then
                use “Forgot your password?” on the member login page.
              </p>
              <Link to="/account" className="b sm s-btn on-light">Member Login</Link>
            </div>
          </div>

          <div className="answerbox" style={{ marginTop: '34px' }}>
            <div className="kick">Your first benefit</div>
            <p className="lede">
              Annual Conference registration is included with membership. Register for the 2026
              Annual Conference and the $797 fee comes off at checkout — sign in first so we can see
              your membership.
            </p>
            <div style={{ marginTop: '18px' }}>
              <Link to="/seminars/annual-conference-2026" className="b lg p-btn">
                RSVP for the Conference
              </Link>
            </div>
          </div>

          <p className="lede" style={{ marginTop: '30px' }}>
            Anything look wrong? Reply to your receipt or email{' '}
            <a href="mailto:info@advancedorthogonal.com">info@advancedorthogonal.com</a> and a person
            will sort it out.
          </p>
        </div>
      </section>
    </>
  )
}
