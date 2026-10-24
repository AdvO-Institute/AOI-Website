import type { ReactNode } from 'react'
import type { SeminarStory } from '@/content/seminars'

/* ----------------------------------------------------------------------------
 * The marketing sections of a seminar page, in the homepage's order: problem,
 * solution, benefits, three steps, doctors' own words, fit and questions.
 * Each renders only when the seminar has text for it. The call-to-action
 * button is passed in, so every button on the page says the same thing.
 * -------------------------------------------------------------------------- */

type Props = { story: SeminarStory }

/** Copy may mark a phrase **like this** to set it in bold. */
function rich(text: string): ReactNode {
  return text.split(/\*\*(.+?)\*\*/g).map((part, i) => (i % 2 ? <b key={i}>{part}</b> : part))
}

export function StoryGoals({ story }: Props) {
  if (!story.goals.length) return null
  return (
    <ul className="sgoals">
      {story.goals.map((g) => (
        <li key={g}><span className="sck">&#10003;</span>{g}</li>
      ))}
    </ul>
  )
}

export function StoryProblem({ story }: Props) {
  const p = story.problem
  if (!p) return null
  return (
    <section>
      <div className="wrap">
        <div className="kick">Where You Are</div>
        <h2 className="t">{p.h}</h2>
        <div className="goldrule" />
        {p.qs.length === 0 && p.close ? (
          <div className="spain">
            <p className="lede">{p.lede}</p>
            <p className="lede">{p.close}</p>
          </div>
        ) : <p className="lede">{p.lede}</p>}
        {/* The questions read as short paragraphs, two to a paragraph: no
            boxes, so they stay compact on a phone. */}
        {p.qs.length > 0 && <div className="sqp">
          {p.qs.reduce<string[][]>((rows, q, i) => (i % 2 ? rows[rows.length - 1]!.push(q) : rows.push([q]), rows), []).map((pair) => (
            <p key={pair[0]}>{pair.join(' ')}</p>
          ))}
        </div>}
        {p.close && p.qs.length > 0 && <p className="probclose">{p.close}</p>}
      </div>
    </section>
  )
}

export function StorySolution({ story, cta }: Props & { cta: ReactNode }) {
  const s = story.solution
  if (!s) return null
  return (
    <section className="mist">
      <div className="wrap">
        <div className={s.img ? 'solsplit' : undefined}>
          <div>
            <div className="kick">{s.kick ?? 'How We Help'}</div>
            <h2 className="t">{s.h}</h2>
            <div className="goldrule" />
            <div className="prose">
              {s.p.map((para) => <p key={para}>{rich(para)}</p>)}
            </div>
            {cta}
          </div>
          {s.img && (
            <div
              className="solimg"
              style={{ backgroundImage: `url(/images/${s.img}.webp)`, backgroundSize: 'cover', backgroundPosition: 'center' }}
            />
          )}
        </div>
      </div>
    </section>
  )
}

export function StoryWhy({ story }: Props) {
  const w = story.why
  if (!w) return null
  return (
    <section>
      <div className="wrap">
        <div className="kick">Why It Works</div>
        <h2 className="t">{w.h}</h2>
        <div className="goldrule" />
        <div className="prose swhy">
          {w.items.map((x) => (
            <p key={x.h}><b>{x.h}.</b> {x.p}</p>
          ))}
        </div>
      </div>
    </section>
  )
}

export function StoryBenefits({ story }: Props) {
  const b = story.benefits
  if (!b) return null
  return (
    <section>
      <div className="wrap">
        <div className="kick">What You Gain</div>
        <h2 className="t">{b.h}</h2>
        <div className="goldrule" />
        <div className={`benegrid${b.items.length === 4 ? ' four' : ''}`}>
          {b.items.map((x) => (
            <div className="bene" key={x.h}><div className="bar" /><h3>{x.h}</h3><p>{x.p}</p></div>
          ))}
        </div>
      </div>
    </section>
  )
}

export function StoryData({ story }: Props) {
  const d = story.data
  if (!d) return null
  return (
    <section className="tight">
      <div className="wrap">
        <div className="kick">Did You Know</div>
        <h2 className="t">{d.h}</h2>
        <div className="goldrule" />
        {d.lede && <p className="lede">{d.lede}</p>}
        <div className="sdata">
          {d.items.map((x) => (
            <div className="sd" key={x.n + x.t}>{x.k && <em>{x.k}</em>}<b>{x.n}</b><span>{x.t}</span></div>
          ))}
        </div>
        <p className="sdnote">{d.note}</p>
      </div>
    </section>
  )
}

export function StorySteps({ story, cta }: Props & { cta: ReactNode }) {
  const st = story.steps
  if (!st) return null
  return (
    <section className="mist">
      <div className="wrap">
        <div className="kick">The Plan</div>
        <h2 className="t">{st.h}</h2>
        <div className="goldrule" />
        <div className="steps">
          {st.items.map((x, i) => (
            <div className="step" key={x.h}>
              <div className="n">STEP {String(i + 1).padStart(2, '0')}</div>
              <h3>{x.h}</h3>
              <p>{x.p}</p>
            </div>
          ))}
        </div>
        <div style={{ marginTop: '30px' }}>{cta}</div>
      </div>
    </section>
  )
}

export function StoryVoices({ story, video }: Props & { video?: ReactNode }) {
  const v = story.voices
  if (!v && !video) return null
  return (
    <section className="dark quoteband">
      <div className="wrap">
        <div>
          <div className="kick">In Their Own Words</div>
          <h2 className="t">{v?.h ?? 'From doctors who have trained with us'}</h2>
          <div className="goldrule" />
          {v?.lede && <p className="lede">{v.lede}</p>}
          {v?.quotes.map((x) => (
            <figure className="squote" key={x.q}>
              <blockquote>&ldquo;{x.q}&rdquo;</blockquote>
              <figcaption className="attr">{x.who.toUpperCase()}{x.cred && <> &middot; <b>{x.cred.toUpperCase()}</b></>}</figcaption>
            </figure>
          ))}
        </div>
        {video && <div>{video}</div>}
      </div>
    </section>
  )
}

export function StoryFit({ story }: Props) {
  const f = story.fit
  if (!f) return null
  // "Who it's for" beside "What to expect": two welcoming lists, no fit check.
  if (f.expect) return (
    <section>
      <div className="wrap">
        <div className="sfit">
          <div>
            <h2 className="t">{f.h}</h2>
            <div className="goldrule" />
            <div className="quallist one">
              {f.yes.map((x) => <div className="qi" key={x}><span className="sck">&#10003;</span><span>{x}</span></div>)}
            </div>
          </div>
          <div>
            <h2 className="t">What to expect</h2>
            <div className="goldrule" />
            <div className="quallist one">
              {f.expect.map((x) => <div className="qi" key={x}><span className="sck">&#10003;</span><span>{x}</span></div>)}
            </div>
          </div>
        </div>
      </div>
    </section>
  )
  return (
    <section>
      <div className="wrap">
        <div className="kick">Fit Check</div>
        <h2 className="t">{f.h}</h2>
        <div className="goldrule" />
        <div className="sfit">
          <div>
            <h3>A strong fit if you are</h3>
            <div className="quallist one">
              {f.yes.map((x) => <div className="qi" key={x}><span className="sck">&#10003;</span><span>{x}</span></div>)}
            </div>
          </div>
          <div>
            <h3>Maybe not the best fit if</h3>
            <div className="quallist one">
              {f.no.map((x) => <div className="qi" key={x}><span className="sck no">&ndash;</span><span>{x}</span></div>)}
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}

export function StoryFaq({ story }: Props) {
  if (!story.faq?.length) return null
  return (
    <section className="mist">
      <div className="wrap">
        <div className="kick">Questions</div>
        <h2 className="t">Frequently Asked Questions</h2>
        <div className="goldrule" />
        <div className="faq">
          {story.faq.map((x) => (
            <details className="faqi" key={x.q}>
              <summary>{x.q}</summary>
              <div className="ans"><p>{x.a}</p></div>
            </details>
          ))}
        </div>
      </div>
    </section>
  )
}
