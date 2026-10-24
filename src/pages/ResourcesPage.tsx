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

/** A page with a folded corner: marks a handout. */
function DocIcon() {
  return (
    <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" />
      <path d="M14 3v5h5M9 13h6M9 17h6" />
    </svg>
  )
}

export function ResourceTile({ item, handout }: { item: Resource; handout?: boolean }) {
  const cls = handout ? 'res-tile handout' : 'res-tile'
  const inner = (
    <>
      {handout && (
        <span className="res-top">
          <span className="res-ic">
            <DocIcon />
          </span>
          {item.tag && <span className="res-tag">{item.tag}</span>}
        </span>
      )}
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
    <Link to={item.href} className={cls}>
      {inner}
    </Link>
  ) : (
    <a href={item.href} className={cls} target="_blank" rel="noopener noreferrer">
      {inner}
    </a>
  )
}

export function ResourceSection({
  kicker,
  heading,
  items,
  mist,
  handouts,
}: {
  kicker: string
  heading: string
  items: Resource[]
  mist?: boolean
  /** Show each item as a handout: icon, label and accent color. */
  handouts?: boolean
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
            <ResourceTile key={item.href} item={item} handout={handouts} />
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
