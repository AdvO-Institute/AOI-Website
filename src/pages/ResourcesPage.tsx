import { Link } from '@/lib/router'
import { RESOURCE_GROUPS, type Resource } from '@/content/resources'

function ResourceTile({ item }: { item: Resource }) {
  const inner = (
    <>
      <span className="res-h">
        {item.title}
        <span className="a" aria-hidden="true">
          {item.href.startsWith('/') ? '→' : '↗'}
        </span>
      </span>
      {item.note && <span className="res-p">{item.note}</span>}
    </>
  )
  return item.href.startsWith('/') ? (
    <Link to={item.href} className="res-tile">
      {inner}
    </Link>
  ) : (
    <a href={item.href} className="res-tile" target="_blank" rel="noopener noreferrer">
      {inner}
    </a>
  )
}

export default function ResourcesPage() {
  return (
    <>
      <div className="hero-img short">
        <div className="bg ph-b" />
        <div className="duo" />
        <div className="duo2" />
        <div className="scrim" />
        <div className="wrap inner">
          <div className="crumbs">
            <Link to="/">HOME</Link> <b>/</b> RESOURCES
          </div>
          <div className="kick">For Students &amp; Doctors</div>
          <h1>Resources</h1>
          <p className="sub">
            Handouts to download, the links you need most, and the businesses that work with
            the Institute.
          </p>
        </div>
      </div>

      {RESOURCE_GROUPS.map((group, i) => (
        <section key={group.key} className={i % 2 ? 'mist tight' : 'tight'}>
          <div className="wrap">
            <div className="kick">{group.kicker}</div>
            <h2 className="t" style={{ fontSize: '28px' }}>
              {group.heading}
            </h2>
            <div className="goldrule" />
            <div className="res-grid">
              {group.items.map((item) => (
                <ResourceTile key={item.href} item={item} />
              ))}
            </div>
          </div>
        </section>
      ))}
    </>
  )
}
