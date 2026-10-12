/**
 * The View Source gate.
 *
 * The rule from ARCHITECTURE.md §5.2 is that every public page's meaningful
 * content must exist in the raw HTML before any JavaScript runs. This script
 * enforces it. It reads the built files off disk — exactly what a crawler
 * that cannot execute JavaScript receives — and fails the build if a page
 * would arrive empty or without metadata.
 *
 * Without this, an SPA regression is silent: the site still looks perfect in
 * a browser while becoming invisible to every AI answer engine.
 */
import { readFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const root = dirname(dirname(fileURLToPath(import.meta.url)))
const clientDir = join(root, 'dist', 'client')
const { manifest } = await import(pathToFileURL(join(root, 'dist', 'server', 'entry-server.js')).href)

/** Minimum visible characters inside #root for a page to count as real. */
const MIN_TEXT_LENGTH = 300

const failures = []

function textInsideRoot(html) {
  const match = html.match(/<div id="root">([\s\S]*?)<\/div>\s*<script/)
  if (!match) return ''
  return match[1]
    .replace(/<script[\s\S]*?<\/script>/g, ' ')
    .replace(/<style[\s\S]*?<\/style>/g, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

for (const path of manifest.paths) {
  // Mirrors `fileFor` in build.mjs: `/` is index.html, everything else `<route>.html`.
  const file =
    path === '/'
      ? join(clientDir, 'index.html')
      : join(clientDir, `${path.replace(/^\//, '')}.html`)

  let html
  try {
    html = await readFile(file, 'utf-8')
  } catch {
    failures.push(`${path} — no static HTML was written`)
    continue
  }

  const title = html.match(/<title>([^<]*)<\/title>/)?.[1]?.trim()
  if (!title) failures.push(`${path} — missing <title>`)

  if (!/<meta name="description" content="[^"]{20,}"/.test(html)) {
    failures.push(`${path} — missing or too-short meta description`)
  }

  if (!/<link rel="canonical"/.test(html)) {
    failures.push(`${path} — missing canonical link`)
  }

  if (!/<script type="application\/ld\+json">/.test(html)) {
    failures.push(`${path} — missing JSON-LD structured data`)
  }

  const text = textInsideRoot(html)
  if (text.length < MIN_TEXT_LENGTH) {
    failures.push(
      `${path} — only ${text.length} characters of text in the raw HTML ` +
        `(need ${MIN_TEXT_LENGTH}). A JS-less crawler would see an empty page.`,
    )
  }

  if (!/<h1[\s>]/.test(html)) {
    failures.push(`${path} — no <h1> in the static HTML`)
  }
}

if (failures.length > 0) {
  console.error('\n✗ Prerender verification failed:\n')
  for (const failure of failures) console.error(`  • ${failure}`)
  console.error(
    '\nThese pages would be invisible to GPTBot, ClaudeBot, and PerplexityBot.\n',
  )
  process.exit(1)
}

console.log(`✓ ${manifest.paths.length} route(s) verified — content present in raw HTML`)
