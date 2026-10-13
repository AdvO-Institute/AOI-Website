import { Link } from '@/lib/router'
import { SEMINAR_SLUG } from '@/content/seminars'
import {
  PARTNERS,
  QUICK_LINKS,
  RESOURCE_PAGES,
  resourcePageLabel,
  resourcePageTitle,
} from '@/content/resources'
import { ResourceSection } from '@/pages/ResourcesPage'
import NotFoundPage from '@/pages/NotFoundPage'

/** One seminar's or Fundamentals session's materials: /resources/f1.1. */
export default function ResourcePage({ param }: { param?: string }) {
  const page = RESOURCE_PAGES.find((p) => p.slug === param)
  if (!page) return <NotFoundPage />
  const isSession = page.session !== undefined

  return (
    <>
      <div className="hero-img short">
        <div className="bg ph-b" />
        <div className="duo" />
        <div className="duo2" />
        <div className="scrim" />
        <div className="wrap inner">
          <div className="crumbs">
            <Link to="/">HOME</Link> <b>/</b> <Link to="/resources">RESOURCES</Link> <b>/</b>{' '}
            {page.slug.toUpperCase()}
          </div>
          <div className="kick">{isSession ? resourcePageLabel(page) : 'Seminar Resources'}</div>
          <h1>{resourcePageTitle(page)}</h1>
          <p className="sub">
            Handouts and links from this {isSession ? 'session' : 'seminar'}.{' '}
            <Link to={`/seminars/${SEMINAR_SLUG[page.seminar]}`} style={{ color: 'inherit' }}>
              About the seminar
            </Link>
            .
          </p>
        </div>
      </div>

      {page.items.length ? (
        <ResourceSection
          kicker="Materials"
          heading={`From this ${isSession ? 'session' : 'seminar'}.`}
          items={page.items}
        />
      ) : (
        <section className="tight">
          <div className="wrap">
            <div className="kick">Materials</div>
            <h2 className="t" style={{ fontSize: '28px' }}>
              Nothing posted yet.
            </h2>
            <div className="goldrule" />
            <p className="lede" style={{ marginTop: '20px' }}>
              Handouts and links for this {isSession ? 'session' : 'seminar'} will appear here
              once they are ready.
            </p>
          </div>
        </section>
      )}
      <ResourceSection
        kicker="Quick Links"
        heading="Training, membership and feedback."
        items={QUICK_LINKS}
        mist
      />
      <ResourceSection
        kicker="Partners"
        heading="Businesses that work with the Institute."
        items={PARTNERS}
      />
    </>
  )
}
