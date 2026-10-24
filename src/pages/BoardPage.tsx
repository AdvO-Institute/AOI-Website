import { Link } from '@/lib/router'
import { PEOPLE, BOARD_ROSTER, HEADSHOTS } from '@/content/people'
import { useBio } from '@/components/blocks/BioDialog'

export default function BoardPage() {
  const openBio = useBio()

  return (
    <>
      <div className="hero-img short">
        <div className="bg ph-a" />
        <div className="duo" />
        <div className="duo2" />
        <div className="scrim" />
        <div className="wrap inner">
          <div className="crumbs">
            <Link to="/">HOME</Link> <b>/</b> <Link to="/about">ABOUT</Link> <b>/</b> BOARD OF
            DIRECTORS
          </div>
          <div className="kick">Leadership</div>
          <h1>Board of Directors</h1>
          <p className="sub">
            Nine seats. Three open every year. Guided by the members, for the members.
          </p>
        </div>
      </div>

      <section>
        <div className="wrap">
          <p className="lede" style={{ marginBottom: '40px' }}>
            The Institute is governed by a nine-member board elected by the membership, with three
            seats opening every year — ensuring new voices and forward-thinking leaders always have
            opportunities to influence the direction of the Institute and the profession.
          </p>
          <div className="people" id="boardgrid">
            {BOARD_ROSTER.map((key) => {
              const person = PEOPLE[key]
              if (!person) return null
              return (
                <button
                  type="button"
                  className="person"
                  key={key}
                  onClick={person.bio ? () => openBio(key) : undefined}
                  disabled={!person.bio}
                  style={{ cursor: person.bio ? 'pointer' : 'default' }}
                >
                  <div className="photo">
                    {HEADSHOTS.has(key) ? (
                      <img
                        src={`/images/${key}.webp`}
                        alt={person.name}
                        width={400}
                        height={400}
                        loading="lazy"
                        decoding="async"
                        style={{
                          position: 'absolute',
                          inset: 0,
                          width: '100%',
                          height: '100%',
                          objectFit: 'cover',
                        }}
                      />
                    ) : (
                      <>
                        <span className={person.img} style={{ position: 'absolute', inset: 0 }} />
                        <span className="duo" style={{ position: 'absolute', inset: 0 }} />
                      </>
                    )}
                  </div>
                  <div className="bd">
                    <h3>
                      {person.name}, {person.cred}
                    </h3>
                    <div className="role">{person.role}</div>
                    {person.bio && (
                      <div className="t-link" style={{ marginTop: '10px', fontSize: '11px' }}>
                        Read bio<span className="a">→</span>
                      </div>
                    )}
                  </div>
                </button>
              )
            })}
          </div>
        </div>
      </section>

      <section className="ctaband tight">
        <div className="wrap">
          <div>
            <h3>Certified members can run for the board.</h3>
            <p>Three of nine seats open every year. Your voice, your vote, your Institute.</p>
          </div>
          <Link className="b lg p-btn" to="/membership">
            Join the Institute
          </Link>
        </div>
      </section>
    </>
  )
}
