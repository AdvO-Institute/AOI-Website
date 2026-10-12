import { Routes, Route, useLocation } from '@/lib/router'
import { useEffect } from 'react'
import Layout from '@/components/layout/Layout'
import { ToastProvider } from '@/components/ui/Toast'
import { BioProvider } from '@/components/blocks/BioDialog'
import { RegistrationProvider } from '@/components/blocks/RegistrationDialog'
import { CatalogProvider } from '@/lib/queries/CatalogProvider'
import { AccessProvider } from '@/lib/queries/AccessProvider'
import { routes, notFoundRoute, routeByPath } from '@/routes'
import { ORIGIN } from '@/lib/seo'
import type { PageMeta } from '@/lib/seo'
import PayPage from '@/pages/PayPage'

/** Keeps the document head correct on client-side navigation. */
function DocumentMeta() {
  const { pathname } = useLocation()
  useEffect(() => {
    // Cloudflare serves client-only routes with a trailing slash (/registration-confirmed/); the table is keyed without one.
    const entry = routeByPath.get(pathname) ?? routeByPath.get(pathname.replace(/\/+$/, '') || '/')
    const meta: PageMeta = entry?.meta ?? notFoundRoute.meta
    document.title = meta.title

    const set = (selector: string, attr: string, value: string) => {
      let el = document.head.querySelector(selector)
      if (!el) {
        el = document.createElement(selector.startsWith('meta[name') ? 'meta' : 'link')
        const match = selector.match(/\[(\w+)="([^"]+)"\]/)
        if (match) el.setAttribute(match[1]!, match[2]!)
        document.head.appendChild(el)
      }
      el.setAttribute(attr, value)
    }
    set('meta[name="description"]', 'content', meta.description)
    set('link[rel="canonical"]', 'href', `${ORIGIN}${meta.canonical ?? pathname}`)
    set(
      'meta[name="robots"]',
      'content',
      meta.noindex ? 'noindex,nofollow' : 'index,follow,max-image-preview:large',
    )
  }, [pathname])
  return null
}

/** Client-side navigation should land at the top of the new page — at once,
 *  not with the smooth scrolling the stylesheet sets for in-page links. */
function ScrollToTop() {
  const { pathname } = useLocation()
  useEffect(() => {
    window.scrollTo({ top: 0, left: 0, behavior: 'instant' })
  }, [pathname])
  return null
}

export default function App() {
  return (
    <ToastProvider>
      <CatalogProvider>
        <AccessProvider>
        <BioProvider>
          <RegistrationProvider>
            <DocumentMeta />
            <ScrollToTop />
            <Layout>
              <Routes>
                {routes.map(({ path, Component, param }) => (
                  <Route
                    path={path}
                    key={path}
                    element={param ? <Component param={param} /> : <Component />}
                  />
                ))}
                {/* Pattern routes so a link typed by hand still resolves. */}
                <Route path="/seminars/:slug/pay" element={<PayPage />} />
                <Route path="/seminars/:slug" element={<SeminarByParam />} />
                <Route path="/articles/:slug" element={<ArticleByParam />} />
                <Route path="/clinical-challenges/:slug" element={<ProblemByParam />} />
                <Route path="*" element={<notFoundRoute.Component />} />
              </Routes>
            </Layout>
          </RegistrationProvider>
        </BioProvider>
        </AccessProvider>
      </CatalogProvider>
    </ToastProvider>
  )
}

/* The manifest already registers a concrete route per item; these catch any
   slug that is not in the manifest and render the 404 through the same page
   component rather than a bare error. */
import SeminarPage from '@/pages/SeminarPage'
import ArticlePage from '@/pages/ArticlePage'
import ProblemPage from '@/pages/ProblemPage'

function SeminarByParam() {
  return <SeminarPage />
}
function ArticleByParam() {
  return <ArticlePage />
}
function ProblemByParam() {
  return <ProblemPage />
}
