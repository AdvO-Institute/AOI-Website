import { useEffect, useState } from 'react'
import { Link } from '@/lib/router'
import { useToast } from '@/components/ui/Toast'
import { AS_OF } from '@/content/calendar'

export default function SiteFooter() {
  const toast = useToast()
  /* The copyright year: the build's year in the prerendered HTML (so the first
   * client render matches it), then the visitor's own year once mounted. */
  const [year, setYear] = useState(AS_OF.getFullYear())
  useEffect(() => setYear(new Date().getFullYear()), [])
  return (
    <footer>
      <div className="wrap">
        <div className="fgrid">
          <div>
            <Link to="/" className="logo" style={{ alignItems: 'flex-start' }}>
              <img
                className="logoimg"
                src="/images/logo.webp"
                alt="Advanced Orthogonal Institute"
                width={456}
                height={110}
                style={{ height: '52px', width: 'auto', display: 'block' }}
              />
            </Link>
            <p className="tag">
              Advancing precision upper cervical care through training, collaboration, and
              clinical excellence.
            </p>
          </div>
          <div>
            <h5>Institute</h5>
            <Link to="/about">About the Institute</Link>
            <Link to="/advo-difference">The AdvO Difference</Link>
            <Link to="/board-of-directors">Board of Directors</Link>
            <Link to="/articles">Articles &amp; Research</Link>
            <Link to="/contact">Contact</Link>
          </div>
          <div>
            <h5>Training</h5>
            <Link to="/seminars/intro-to-advo">Intro to AdvO (Free)</Link>
            <Link to="/seminars">Seminars &amp; Events</Link>
            <Link to="/seminars/internships">Internships</Link>
            <Link to="/certification">Certification</Link>
          </div>
          <div>
            <h5>Connect</h5>
            <Link to="/membership">Membership</Link>
            <button
              type="button"
              className="flink"
              onClick={() =>
                toast(
                  'The Doctor Directory is coming soon. Call (727) 677-0001 and we will connect you with a certified doctor near you.',
                )
              }
            >
              Doctor Directory
            </button>
            <a href="tel:+17276770001">(727) 677-0001</a>
            <a href="mailto:Info@AdvancedOrthogonal.com">Info@AdvancedOrthogonal.com</a>
          </div>
        </div>
        <div className="fbot">
          <span>© {year} The Advanced Orthogonal Institute. All rights reserved.</span>
          <span>Home of the Advanced Orthogonal technique.</span>
        </div>
      </div>
    </footer>
  )
}
