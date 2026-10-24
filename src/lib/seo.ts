/* ----------------------------------------------------------------------------
 * Page metadata and structured-data builders.
 *
 * `PageMeta` is required on every route entry, so the compiler rejects a page
 * that ships without a title, description or canonical. Structured data is
 * generated from the same content object that renders the page — never written
 * by hand — so the two cannot disagree.
 * -------------------------------------------------------------------------- */

export const ORIGIN = 'https://www.advancedorthogonal.com'

/** The day the site was built, injected by `scripts/build.mjs` (esbuild
 *  `define`). It drives `dateModified` and the sitemap's `lastmod`. Where
 *  nothing injects it (the type check), it falls back to today. */
declare const __BUILD_DATE__: string | undefined
export const BUILD_DATE: string =
  typeof __BUILD_DATE__ === 'string' ? __BUILD_DATE__ : new Date().toISOString().slice(0, 10)

const BRAND_SUFFIX = ' — Advanced Orthogonal Institute'
/** The longest title a search result shows without cutting it off. */
const TITLE_MAX = 60

/** Appends the Institute's name to a page title when the result still fits a
 *  search result. A long title stands alone; `og:site_name` carries the brand. */
export function pageTitle(title: string): string {
  return title.length + BRAND_SUFFIX.length <= TITLE_MAX ? `${title}${BRAND_SUFFIX}` : title
}

export const ORG = {
  name: 'Advanced Orthogonal Institute',
  legalName: 'Advanced Orthogonal Institute',
  url: ORIGIN,
  logo: `${ORIGIN}/images/logo.webp`,
  description:
    'The Advanced Orthogonal Institute trains chiropractors in precision, ' +
    'instrument-based upper cervical care and certifies doctors in the ' +
    'Advanced Orthogonal procedure.',
  sameAs: [
    'https://www.facebook.com/advancedorthogonal',
    'https://www.instagram.com/advancedorthogonal',
    'https://www.youtube.com/@advancedorthogonal',
  ],
} as const

export type PageMeta = {
  title: string
  description: string
  /** Defaults to the route path. Set explicitly only to collapse duplicates. */
  canonical?: string
  /** Open Graph image, relative to the site root. */
  image?: string
  /** Keep out of the sitemap and tell crawlers not to index. */
  noindex?: boolean
  /** ISO date surfaced as `dateModified` and in the sitemap. */
  updatedAt?: string
  /** Open Graph object type. Articles say so; everything else is a `website`. */
  type?: 'website' | 'article'
  /** ISO date an article first appeared, surfaced as `article:published_time`. */
  publishedAt?: string
  changefreq?: 'always' | 'hourly' | 'daily' | 'weekly' | 'monthly' | 'yearly' | 'never'
  priority?: number
  /** Extra JSON-LD nodes merged into the page `@graph`. */
  graph?: Record<string, unknown>[]
  /** Breadcrumb trail, excluding Home which is prepended automatically. */
  breadcrumbs?: { name: string; path: string }[]
}

export type JsonLdNode = Record<string, unknown>

/** The sitewide nodes. Present on every page, which is what teaches an answer
 *  engine that every mention refers to one organization. */
function siteGraph(): JsonLdNode[] {
  return [
    {
      '@type': 'Organization',
      '@id': `${ORIGIN}/#organization`,
      name: ORG.name,
      legalName: ORG.legalName,
      url: ORG.url,
      logo: { '@type': 'ImageObject', url: ORG.logo },
      description: ORG.description,
      sameAs: [...ORG.sameAs],
    },
    {
      '@type': 'WebSite',
      '@id': `${ORIGIN}/#website`,
      url: ORIGIN,
      name: ORG.name,
      publisher: { '@id': `${ORIGIN}/#organization` },
      inLanguage: 'en-US',
    },
  ]
}

function breadcrumbNode(meta: PageMeta, path: string): JsonLdNode {
  const trail = [{ name: 'Home', path: '/' }, ...(meta.breadcrumbs ?? [])]
  if (path !== '/' && !trail.some((t) => t.path === path)) {
    trail.push({ name: meta.title.split('—')[0]!.trim(), path })
  }
  return {
    '@type': 'BreadcrumbList',
    '@id': `${ORIGIN}${path}#breadcrumbs`,
    itemListElement: trail.map((item, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      name: item.name,
      item: `${ORIGIN}${item.path}`,
    })),
  }
}

export function buildGraph(meta: PageMeta, path: string): string {
  const canonical = `${ORIGIN}${meta.canonical ?? path}`
  const graph: JsonLdNode[] = [
    ...siteGraph(),
    {
      '@type': 'WebPage',
      '@id': `${canonical}#webpage`,
      url: canonical,
      name: meta.title,
      description: meta.description,
      isPartOf: { '@id': `${ORIGIN}/#website` },
      about: { '@id': `${ORIGIN}/#organization` },
      inLanguage: 'en-US',
      ...(meta.updatedAt ? { dateModified: meta.updatedAt } : {}),
    },
    breadcrumbNode(meta, path),
    ...(meta.graph ?? []),
  ]
  return JSON.stringify({ '@context': 'https://schema.org', '@graph': graph })
}

function escapeAttr(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

/** Renders the complete <head> content for one route as a string. Used by the
 *  prerenderer; the client mirrors it in `useDocumentMeta` for SPA navigation. */
export function renderHead(meta: PageMeta, path: string): string {
  const canonical = `${ORIGIN}${meta.canonical ?? path}`
  const image = `${ORIGIN}${meta.image ?? '/images/conference.webp'}`
  const tags = [
    `<title>${escapeAttr(meta.title)}</title>`,
    `<meta name="description" content="${escapeAttr(meta.description)}">`,
    `<link rel="canonical" href="${canonical}">`,
    meta.noindex
      ? '<meta name="robots" content="noindex,nofollow">'
      : '<meta name="robots" content="index,follow,max-image-preview:large">',
    `<meta property="og:type" content="${meta.type ?? 'website'}">`,
    ...(meta.type === 'article'
      ? [
          ...(meta.publishedAt
            ? [`<meta property="article:published_time" content="${meta.publishedAt}">`]
            : []),
          ...(meta.updatedAt
            ? [`<meta property="article:modified_time" content="${meta.updatedAt}">`]
            : []),
        ]
      : []),
    `<meta property="og:site_name" content="${escapeAttr(ORG.name)}">`,
    `<meta property="og:title" content="${escapeAttr(meta.title)}">`,
    `<meta property="og:description" content="${escapeAttr(meta.description)}">`,
    `<meta property="og:url" content="${canonical}">`,
    `<meta property="og:image" content="${image}">`,
    `<meta name="twitter:card" content="summary_large_image">`,
    `<meta name="twitter:title" content="${escapeAttr(meta.title)}">`,
    `<meta name="twitter:description" content="${escapeAttr(meta.description)}">`,
    `<meta name="twitter:image" content="${image}">`,
    `<script type="application/ld+json">${buildGraph(meta, path).replace(/</g, '\\u003c')}</script>`,
  ]
  return tags.join('\n    ')
}

/** Strips HTML and clamps to a usable meta-description length. */
export function summarize(html: string, max = 155): string {
  const text = html
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  if (text.length <= max) return text
  const cut = text.slice(0, max)
  return `${cut.slice(0, cut.lastIndexOf(' '))}…`
}
