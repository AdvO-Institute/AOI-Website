/**
 * Does the site's event catalog agree with the database?
 *
 * An event's sign-up target is a slug the site works out from the calendar
 * rules (`REG_SLUG`, e.g. `advo-intensive-2027-feb`) or writes by hand
 * (`DB_SLUG`). In the browser, `v_public_events` is overlaid by that slug. When
 * the site names a slug the database has no published row for, the page says
 * "not open yet" even if the event exists under another name; when the
 * database publishes an event the site does not know, nothing links to it.
 * This script reports both (issue #112).
 *
 * It reads the slugs from the real modules — bundled with esbuild the way
 * `tools/role-matrix.mjs` does — so it cannot drift from what the site ships,
 * and it uses the site's own public endpoint and publishable key. The slug
 * looked up for each key follows the precedence in src/lib/queries/events.ts:
 * `REG_SLUG` first, then `DB_SLUG`.
 *
 *   node scripts/check-catalog.mjs            warn and exit 0 (CI, every run)
 *   node scripts/check-catalog.mjs --strict   exit 1 on any warning or failure
 *
 * Non-strict never fails, so a database hiccup can never block a deploy.
 */
import { build } from 'esbuild'
import { existsSync, statSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = dirname(dirname(fileURLToPath(import.meta.url)))
const strict = process.argv.includes('--strict')
const LEVEL = strict ? 'FAIL' : 'WARN'

const alias = {
  name: 'alias-@',
  setup(b) {
    b.onResolve({ filter: /^@\// }, (a) => {
      const base = resolve(root, 'src', a.path.slice(2))
      for (const e of ['.tsx', '.ts', '']) if (existsSync(base + e) && statSync(base + e).isFile()) return { path: base + e }
      return { errors: [{ text: `Cannot resolve alias ${a.path}` }] }
    })
  },
}

const out = await build({
  stdin: {
    contents: [
      "export { DB_SLUG, REG_SLUG, SLUG_TO_SEMINAR } from './src/content/seminars'",
      "export { SB_URL, SB_KEY } from './src/lib/supabase'",
    ].join('\n'),
    resolveDir: root,
    loader: 'ts',
  },
  bundle: true, format: 'esm', platform: 'node', write: false, jsx: 'automatic',
  plugins: [alias], packages: 'external', loader: { '.md': 'text' },
})
const site = await import('data:text/javascript;base64,' + Buffer.from(out.outputFiles[0].text).toString('base64'))

/* ------------------------------------------------- what the site expects */

/** A page whose weekends each register through their own event (keys
 *  `page:session` in REG_SLUG, e.g. the Intensive) and that has no sign-up of
 *  its own: its page address is never a sign-up target, so it is not expected
 *  in the database. */
const sessionsOnly = (key) =>
  !key.includes(':') && !site.REG_SLUG[key] && Object.keys(site.REG_SLUG).some((k) => k.startsWith(key + ':'))

/** slug the site looks up -> the keys that look it up. */
const expected = new Map()
for (const key of new Set([...Object.keys(site.DB_SLUG), ...Object.keys(site.REG_SLUG)])) {
  const slug = site.REG_SLUG[key] ?? site.DB_SLUG[key]
  if (!slug || sessionsOnly(key)) continue
  expected.set(slug, [...(expected.get(slug) ?? []), key])
}
/** Page addresses that are not also looked up — a page whose key registers
 *  through another event (the Fundamentals pages through the Monthly Huddle),
 *  only through its weekends (the Intensive), or has no database row at all
 *  (internships). Listed, not warned about. */
const addressOnly = Object.keys(site.SLUG_TO_SEMINAR).filter((slug) => !expected.has(slug)).sort()

/* ---------------------------------------------- what the database publishes */

let rows
try {
  const res = await fetch(`${site.SB_URL}/rest/v1/v_public_events?select=slug`, {
    headers: { apikey: site.SB_KEY, Authorization: `Bearer ${site.SB_KEY}` },
  })
  if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText}`)
  rows = await res.json()
  if (!Array.isArray(rows)) throw new Error('response was not a list of rows')
} catch (err) {
  console.log(`\n${LEVEL}  could not read v_public_events: ${err instanceof Error ? err.message : String(err)}`)
  if (!strict) console.log('      (not a failure: the check needs the database, and the database was not reachable)')
  console.log()
  process.exitCode = strict ? 1 : 0
  rows = null
}

if (rows) {
  const published = new Set(rows.map((r) => r?.slug).filter(Boolean))
  const warnings = []
  for (const [slug, keys] of [...expected.entries()].sort()) {
    if (!published.has(slug)) warnings.push(`site looks up "${slug}" (for ${keys.join(', ')}) but no published event has that slug`)
  }
  for (const slug of [...published].sort()) {
    if (!expected.has(slug)) warnings.push(`database publishes "${slug}" but the site has no page or sign-up for it`)
  }

  console.log(`\nCatalog check: ${expected.size} slugs looked up by the site, ${published.size} published in the database`)
  console.log(`  site looks up:   ${[...expected.keys()].sort().join(', ')}`)
  console.log(`  published:       ${[...published].sort().join(', ')}`)
  if (addressOnly.length) console.log(`  page address only (not expected in the database): ${addressOnly.join(', ')}`)
  if (!warnings.length) {
    console.log('\nOK  every slug the site looks up is published, and every published event has a page\n')
  } else {
    console.log()
    for (const w of warnings) console.log(`${LEVEL}  ${w}`)
    // On GitHub, also raise each one as an annotation so it shows on the
    // check's summary page instead of only deep in the log.
    if (process.env.GITHUB_ACTIONS) for (const w of warnings) console.log(`::${strict ? 'error' : 'warning'} title=Event catalog::${w}`)
    console.log(`\n${warnings.length} ${warnings.length === 1 ? 'difference' : 'differences'}${strict ? '' : ' (warnings only; pass --strict to fail on them)'}\n`)
    process.exitCode = strict ? 1 : 0
  }
}
// No process.exit(): esbuild's service child is still open, and exiting under
// it trips a libuv assertion on Windows. Node ends on its own once it is done.
