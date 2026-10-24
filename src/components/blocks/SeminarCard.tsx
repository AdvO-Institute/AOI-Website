import { Link } from '@/lib/router'
import { SEMINARS, SEMINAR_SLUG, CATEGORY_LABEL } from '@/content/seminars'

export default function SeminarCard({ id }: { id: string }) {
  const seminar = SEMINARS[id]
  if (!seminar) return null
  return (
    <Link
      className="card semcard"
      data-cat={seminar.cat}
      to={`/seminars/${SEMINAR_SLUG[id]}`}
      style={{ cursor: 'pointer' }}
    >
      <div className="imgwrap">
        <div
          className={`img ${seminar.img ?? ''}`}
          style={
            seminar.photo
              ? {
                  backgroundImage: `url(/images/${seminar.photo}.webp)`,
                  backgroundSize: 'cover',
                  backgroundPosition: 'center',
                }
              : undefined
          }
        >
          <div className="duo" />
          <div className="duo2" />
        </div>
        <div className="scrim" />
        <span className="datechip">{seminar.dates.toUpperCase()}</span>
        <span className="loc">{seminar.loc.toUpperCase()}</span>
      </div>
      <div className="bd">
        <h3>{seminar.title}</h3>
        <div className="when">{seminar.dates} · {seminar.loc}</div>
        <div className="meta">
          {seminar.format.toUpperCase()} · <b>{CATEGORY_LABEL[seminar.cat]}</b>
        </div>
        <p className="desc">{seminar.sub}</p>
        <div className="foot">
          <span className="t-link">
            Details &amp; Registration<span className="a">→</span>
          </span>
        </div>
      </div>
    </Link>
  )
}
