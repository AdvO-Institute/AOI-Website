import { Link } from '@/lib/router'

export default function AboutPage() {
  return (
    <>
      <div className="hero-img short">
          <div className="bg ph-a"></div><div className="duo"></div><div className="duo2"></div><div className="scrim"></div>
          <div className="wrap inner">
            <div className="crumbs">HOME <b>/</b> ABOUT</div>
            <div className="kick">Remaining on the Cutting Edge</div>
            <h1>About the Institute</h1>
            <p className="sub">The training ground, the support system, and the professional community you need at every stage of your career.</p>
          </div>
        </div>

        <section className="tight">
          <div className="wrap grid2" style={{"alignItems": "center", "gap": "56px"}}>
            <div>
              <h2 className="t" style={{"fontSize": "28px"}}>An Institute built for you.</h2>
              <div className="prose">
                <p>The Advanced Orthogonal Institute exists for one reason: to help you become the best upper cervical doctor you can be.</p>
                <p>Whether you're a student just discovering precision-based chiropractic, a practicing doctor looking to refine your skills, or an experienced clinician ready to master the most advanced applications of the technique—this is your home.</p>
              </div>
            </div>
            <div className="video">
              <div className="play"><svg width="26" height="26" viewBox="0 0 24 24" fill="var(--color-surface-inverse)"><path d="M8 5v14l11-7z" /></svg></div>
              <span className="lbl">VIDEO — INSIDE THE INSTITUTE</span>
              <span className="dur">3:05</span>
            </div>
          </div>
        </section>

        <section className="mist">
          <div className="wrap">
            <div className="prose" style={{"maxWidth": "860px"}}>
              <h3>Who We Are</h3>
              <p>We are a nonprofit organization of doctors, educators, and leaders united by a shared commitment to precision upper cervical care. Our members practice across the country and around the world, but we share a common language: the Advanced Orthogonal technique.</p>
              <p>What sets us apart isn't just the technique—it's the culture. AOI was founded on the belief that doctors grow best when they learn together, challenge one another, and share what works. We are clinicians first. We teach what we practice, and we practice what we teach. When you train with us, you're learning from doctors who are in the trenches every day, refining their skills and pushing the boundaries of what's possible in patient care.</p>
              <h3>What We Believe</h3>
              <p>We believe that precision matters—not for its own sake, but because your patients deserve care that is accurate, reproducible, and grounded in sound biomechanics and neurology.</p>
              <p>We believe that growth is a lifelong pursuit. No matter how experienced you are, there's always more to learn, and we've designed our training pathways to meet you wherever you are and take you further.</p>
              <p>We believe that collaboration accelerates progress. The most important breakthroughs in this work have come not from individuals working alone, but from doctors sharing insights, questioning assumptions, and building on one another's discoveries.</p>
              <p>And we believe that you belong here. Whether you trained in Atlas Orthogonal, Orthospinology, EPIC, or are brand new to upper cervical care—if you're committed to precision and excellence, there's a place for you at AOI.</p>
            </div>
          </div>
        </section>

        <section className="mist tight">
          <div className="wrap">
            <div className="kick">Founded on Advancement</div>
            <h2 className="t">A legacy of precision, still moving forward.</h2>
            <div className="goldrule"></div>
            <div className="prose">
              <p>The Advanced Orthogonal Institute is founded on the advancements of the chiropractic profession dating back to the original upper cervical philosophy presented by B.J. Palmer, and the extensive research by John F. Grostic, D.C., the developer of Orthogonal chiropractic. In the same nature as the Institute was founded on advancement to upper cervical chiropractic care, the Institute will continue to grow, expand, and refine the technique and procedure.</p>
              <p>The Advanced Orthogonal Institute and its affiliated doctors are constantly striving to incorporate the latest research in chiropractic, developments in upper cervical care, and breaking discoveries in neurology. Furthermore, the Institute is dedicated to participating in and initiating research to further validate the functional and neurological changes of specific upper cervical procedures.</p>
            </div>
            <div style={{"marginTop": "10px"}}><Link to="/research" className="t-link">Research at the Institute<span className="a">&rarr;</span></Link></div>
          </div>
        </section>

        <section className="dark quoteband">
          <div className="wrap">
            <div>
              <div className="kick">Our Mission</div>
              <blockquote>To preserve, advance, and expand the life-changing potential of precision upper cervical care by equipping doctors with the <em>training, tools, and collaborative ecosystem</em> needed to deliver reproducible, neurologically focused correction.</blockquote>
              <div className="attr">THE ADVANCED ORTHOGONAL INSTITUTE · <b>MISSION</b></div>
            </div>
            <div className="prose">
              <p style={{"color": "var(--color-content-on-inverse-muted)"}}>We exist to cultivate a higher standard of clinical mastery—one that demands precision, objective application, and continual innovation grounded in reproducible results. Our aim is to unify and empower a growing community of upper cervical chiropractors who pursue clinical excellence for the sake of their patients.</p>
            </div>
          </div>
        </section>

        <section>
          <div className="wrap">
            <div className="kick">How We Support You</div>
            <h2 className="t">Four ways AOI has your back.</h2>
            <div className="goldrule"></div>
            <div className="steps" style={{"gridTemplateColumns": "1fr 1fr"}}>
              <div className="step">
                <div className="n">TRAINING</div>
                <h3>Training that meets you where you are</h3>
                <p>From our free Intro to AdvO online course to the immersive week-long Bootcamp, we offer a full spectrum of training options. Our Fundamentals Series builds your foundation. Our AdvO Intensive sharpens your hands-on skills. And our Annual Conference brings the community together for advanced education and connection.</p>
                <Link to="/seminars" className="b sm s-btn on-light">See All Training</Link>
              </div>
              <div className="step">
                <div className="n">CERTIFICATION</div>
                <h3>A clear path to certification</h3>
                <p>Our certification process is rigorous, transparent, and designed to ensure that every Certified Advanced Orthogonist meets the highest standards of proficiency and clinical excellence. We'll guide you through every step—from your first seminar to your final exam.</p>
                <Link to="/certification" className="b sm s-btn on-light">The Certification Path</Link>
              </div>
              <div className="step">
                <div className="n">COMMUNITY</div>
                <h3>A community that has your back</h3>
                <p>When you join AOI, you gain access to a network of doctors who want to see you succeed. You'll find mentorship, collaboration, and camaraderie—whether you're troubleshooting a complex case, preparing for certification, or looking for your next opportunity.</p>
                <Link to="/membership" className="b sm s-btn on-light">Meet the Community</Link>
              </div>
              <div className="step">
                <div className="n">RESOURCES</div>
                <h3>Resources to help you thrive</h3>
                <p>Certified members are listed in our doctor directory. Members receive continuing education opportunities, marketing support tools, and discounts on all AOI training events. We're continually developing new resources to help you grow your skills and your practice.</p>
                <Link to="/membership" className="b sm s-btn on-light">Member Resources</Link>
              </div>
            </div>
          </div>
        </section>

        <section className="ctaband tight">
          <div className="wrap">
            <div>
              <h3>You don't have to figure this out alone.</h3>
              <p>Explore our training. Connect with our community. And when you're ready, step into ownership of your future.</p>
            </div>
            <Link to="/membership" className="b lg p-btn">Join the Institute</Link>
          </div>
        </section>
    </>
  )
}
