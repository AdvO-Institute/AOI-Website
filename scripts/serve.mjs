/** Static preview of dist/client, with clean-URL resolution like Cloudflare Pages. */
import { createServer } from 'node:http'
import { readFile, stat } from 'node:fs/promises'
import { dirname, extname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(dirname(fileURLToPath(import.meta.url))), 'dist', 'client')
const port = Number(process.env.PORT ?? 4173)

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json',
  '.xml': 'application/xml',
  '.txt': 'text/plain; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.webp': 'image/webp',
  '.avif': 'image/avif',
  '.jpg': 'image/jpeg',
  '.png': 'image/png',
  '.mp4': 'video/mp4',
  '.woff2': 'font/woff2',
  '.map': 'application/json',
}

createServer(async (req, res) => {
  const url = decodeURIComponent((req.url ?? '/').split('?')[0])
  // Same lookup order as Pages: the file itself, `<path>.html`, then `<path>/index.html`.
  // (Pages also redirects between `/about` and `/about/`; this preview does not.)
  const candidates = [
    join(root, url),
    join(root, `${url.replace(/\/+$/, '')}.html`),
    join(root, url, 'index.html'),
  ]
  for (const file of candidates) {
    try {
      const info = await stat(file)
      if (!info.isFile()) continue
      const body = await readFile(file)
      res.writeHead(200, { 'Content-Type': TYPES[extname(file)] ?? 'application/octet-stream' })
      res.end(body)
      return
    } catch {
      /* try the next candidate */
    }
  }
  const notFound = await readFile(join(root, '404.html')).catch(() => 'Not found')
  res.writeHead(404, { 'Content-Type': 'text/html; charset=utf-8' })
  res.end(notFound)
}).listen(port, () => console.log(`preview → http://localhost:${port}`))
