import { Link } from '@/lib/router'
import {
  PARTNERS,
  PARTNER_LINKS,
  QUICK_LINKS,
  RESOURCE_PAGES,
  resourcePageLabel,
  resourcePageTitle,
  type Resource,
} from '@/content/resources'

export function ResourceTile({ item }: { item: Resource }) {
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

export function ResourceSection({
  kicker,
  heading,
  items,
  mist,
}: {
  kicker: string
  heading: string
  items: Resource[]
  mist?: boolean
}) {
  return (
    <section className={mist ? 'mist tight' : 'tight'}>
      <div className="wrap">
        <div className="kick">{kicker}</div>
        <h2 className="t" style={{ fontSize: '28px' }}>
          {heading}
        </h2>
        <div className="goldrule" />
        <div className="res-grid">
          {items.map((item) => (
            <ResourceTile key={item.href} item={item} />
          ))}
        </div>
      </div>
    </section>
  )
}

/** The partners' logos, styled like the conference's sponsors. */
export function PartnersSection() {
  return (
    <section className="dark tight sponsors">
      <div className="wrap">
        <div className="kick">Partners</div>
        <h2 className="t" style={{ fontSize: '28px' }}>
          Businesses that work with the Institute.
        </h2>
        <div className="goldrule" />
        <div className="spons">
          {PARTNERS.map((x) => (
            <a
              className={`spon${x.light ? ' light' : ''}`}
              key={x.name}
              href={x.href}
              target="_blank"
              rel="noopener noreferrer"
            >
              <img src={`/images/${x.logo.includes('.') ? x.logo : `${x.logo}.webp`}`} alt={x.name} width={x.w} height={x.h} loading="lazy" decoding="async" />
            </a>
          ))}
        </div>
        {PARTNER_LINKS.map((link) => (
          <p className="spon-note" key={link.href}>
            <a className="t-link" href={link.href} target="_blank" rel="noopener noreferrer">
              {link.title}
            </a>
          </p>
        ))}
      </div>
    </section>
  )
}

export default function ResourcesPage() {
  const seminarPages: Resource[] = RESOURCE_PAGES.map((page) => ({
    title: resourcePageLabel(page),
    note: page.session === undefined ? undefined : resourcePageTitle(page),
    href: `/resources/${page.slug}`,
  }))

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
            Handouts and links for each seminar and Fundamentals session, the links you need
            most, and the businesses that work with the Institute.
          </p>
        </div>
      </div>

      <ResourceSection
        kicker="By Seminar"
        heading="Materials for each seminar and session."
        items={seminarPages}
      />
      <ResourceSection
        kicker="Quick Links"
        heading="Training, membership and feedback."
        items={QUICK_LINKS}
        mist
      />
      <PartnersSection />
    </>
  )
}
