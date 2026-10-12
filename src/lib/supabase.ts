/* ----------------------------------------------------------------------------
 * Minimal Supabase client for the public site.
 *
 * The browser only ever holds the publishable key. Everything that needs the
 * service role — pricing, registration writes, contact submissions — runs in an
 * Edge Function. Ported from the v4.8 build with the same endpoints and the
 * same session handling, so the checkout path that has already taken real money
 * is unchanged.
 * -------------------------------------------------------------------------- */

export const SB_URL = 'https://hwbvbqmunjhkpefubfhq.supabase.co'
export const SB_KEY = 'sb_publishable_2FqwETbdoEJqlDuhP00E-w_aNlt1Ny5'

export type SupabaseUser = { id: string; email?: string }

type SessionState = {
  token: string | null
  refresh: string | null
  /** Epoch ms at which `token` stops being accepted. */
  expires: number
  user: SupabaseUser | null
}

export const session: SessionState = { token: null, refresh: null, expires: 0, user: null }

const STORAGE_KEY = 'aoi.session'

/* Supabase access tokens last an hour. Without the refresh token the member
 * area simply stopped working after that — every call came back unauthorized
 * and the shell read it as "signed out", which is what made sign-in feel
 * unreliable. We keep the refresh token and renew before expiry. */
const RENEW_MARGIN_MS = 60_000

/* Every call to Supabase goes through `sbFetch`, which gives up after this long.
 * Without a deadline a slow or unreachable server left every button that waits
 * on it ("Register", the sign-in card, the member rail) hanging with no message
 * at all. A clear failure can be shown and retried; a hang cannot. */
export const REQUEST_TIMEOUT_MS = 12_000

/** `fetch` with a deadline. Rejects with a plain-English Error when the server
 *  has not answered in `timeoutMs`; every other failure passes through as-is. */
export async function sbFetch(url: string, init: RequestInit = {}, timeoutMs = REQUEST_TIMEOUT_MS): Promise<Response> {
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), timeoutMs)
  // A caller's own signal still cancels the request.
  init.signal?.addEventListener('abort', () => ctrl.abort(), { once: true })
  try {
    return await fetch(url, { ...init, signal: ctrl.signal })
  } catch (err) {
    if (ctrl.signal.aborted && !init.signal?.aborted) {
      throw new Error('The server took too long to answer. Please try again.')
    }
    throw err
  } finally {
    clearTimeout(timer)
  }
}

/* Password recovery.
 *
 * Supabase sends the recovery link to `email_redirect_to` only when that URL is
 * on the project's allow-list; otherwise it falls back to the Site URL, which
 * is the homepage. So the token can arrive on any page. We adopt it wherever it
 * lands, raise a flag, and send the visitor to the reset page. The flag lives in
 * sessionStorage so it survives that redirect and dies with the tab. */
const RECOVERY_KEY = 'aoi.recovery'
const LINK_ERROR_KEY_EARLY = 'aoi.linkerror'
const RESET_PATH = '/reset-password'

export function isRecovery(): boolean {
  try {
    return window.sessionStorage.getItem(RECOVERY_KEY) === '1'
  } catch {
    return false
  }
}
export function clearRecovery(): void {
  try {
    window.sessionStorage.removeItem(RECOVERY_KEY)
  } catch {
    /* ignore */
  }
}

function store(): Storage | null {
  try {
    // localStorage so the session survives closing the tab. sessionStorage
    // signed people out every time they closed the window, which read as a bug.
    return window.localStorage
  } catch {
    return null
  }
}

function persist(): void {
  const s = store()
  if (!s) return
  try {
    s.setItem(
      STORAGE_KEY,
      JSON.stringify({
        token: session.token,
        refresh: session.refresh,
        expires: session.expires,
        user: session.user,
      }),
    )
  } catch {
    /* quota or private mode — the session simply will not survive a reload */
  }
}

function adopt(payload: {
  access_token?: string
  refresh_token?: string
  expires_in?: number | string
  user?: SupabaseUser
}): void {
  session.token = payload.access_token ?? null
  session.refresh = payload.refresh_token ?? null
  session.expires = Date.now() + (Number(payload.expires_in) || 3600) * 1000
  if (payload.user) session.user = payload.user
  persist()
}

/** Restores a session across reloads, and adopts one from a link in the hash. */
export function initSession(): void {
  if (typeof window === 'undefined') return

  const hash = window.location.hash
  if (hash.includes('access_token=')) {
    const params = new URLSearchParams(hash.slice(1))
    adopt({
      access_token: params.get('access_token') ?? undefined,
      refresh_token: params.get('refresh_token') ?? undefined,
      expires_in: params.get('expires_in') ?? undefined,
    })
    if (params.get('type') === 'recovery') {
      try {
        window.sessionStorage.setItem(RECOVERY_KEY, '1')
      } catch {
        /* ignore */
      }
      if (window.location.pathname !== RESET_PATH) {
        window.location.replace(RESET_PATH)
        return
      }
    }
    window.history.replaceState({}, '', window.location.pathname + window.location.search)
    return
  }

  // An expired or already-used link comes back as an error in the hash rather
  // than as a token, and — like the token — it can land on any page. Keep the
  // message across the redirect and take the visitor to the page that can act
  // on it.
  if (hash.includes('error_description=')) {
    const params = new URLSearchParams(hash.slice(1))
    const msg = (params.get('error_description') ?? 'That link is no longer valid.').replace(/\+/g, ' ')
    try {
      window.sessionStorage.setItem(LINK_ERROR_KEY_EARLY, msg)
    } catch {
      /* ignore */
    }
    if (window.location.pathname !== RESET_PATH) {
      window.location.replace(RESET_PATH)
      return
    }
    window.history.replaceState({}, '', window.location.pathname + window.location.search)
  }

  const s = store()
  if (!s) return
  try {
    const raw = s.getItem(STORAGE_KEY)
    if (!raw) return
    const parsed = JSON.parse(raw) as SessionState
    session.token = parsed.token
    session.refresh = parsed.refresh
    session.expires = parsed.expires ?? 0
    session.user = parsed.user
  } catch {
    /* unreadable — start signed out */
  }
}

/** The reason a magic or recovery link could not be used, if any. */
const LINK_ERROR_KEY = 'aoi.linkerror'
export function linkError(): string | null {
  try {
    return window.sessionStorage.getItem(LINK_ERROR_KEY)
  } catch {
    return null
  }
}
export function clearLinkError(): void {
  try {
    window.sessionStorage.removeItem(LINK_ERROR_KEY)
  } catch {
    /* ignore */
  }
}

let renewing: Promise<void> | null = null

/** Renews the access token when it is close to expiring. Every data call awaits
 *  this, so a long session stays signed in instead of quietly going dead. */
export async function ensureSession(): Promise<void> {
  if (!session.token || !session.refresh) return
  if (Date.now() < session.expires - RENEW_MARGIN_MS) return
  if (renewing) return renewing

  renewing = (async () => {
    try {
      const res = await sbFetch(`${SB_URL}/auth/v1/token?grant_type=refresh_token`, {
        method: 'POST',
        headers: { apikey: SB_KEY, 'Content-Type': 'application/json' },
        body: JSON.stringify({ refresh_token: session.refresh }),
      })
      if (!res.ok) {
        // A 4xx means the refresh token is spent or revoked. Clearing is
        // correct: it sends the visitor to a sign-in card rather than an
        // endlessly failing page. A 5xx is the server's problem, not the
        // session's — keep what we have and try again on the next call.
        if (res.status < 500) void signOut()
        return
      }
      adopt(await res.json())
    } catch {
      /* offline or timed out — keep what we have and try again on the next call */
    } finally {
      renewing = null
    }
  })()

  return renewing
}

export function headers(json = false): Record<string, string> {
  const h: Record<string, string> = {
    apikey: SB_KEY,
    Authorization: `Bearer ${session.token ?? SB_KEY}`,
  }
  if (json) h['Content-Type'] = 'application/json'
  return h
}

export async function signIn(email: string, password: string): Promise<SupabaseUser> {
  const res = await sbFetch(`${SB_URL}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: { apikey: SB_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  })
  const data = await res.json()
  if (!res.ok) {
    throw new Error(data.error_description || data.msg || data.message || 'Sign-in failed')
  }
  adopt(data)
  return data.user
}

export async function sendMagicLink(email: string, redirect: string): Promise<void> {
  const res = await sbFetch(`${SB_URL}/auth/v1/otp`, {
    method: 'POST',
    headers: { apikey: SB_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email,
      create_user: false,
      options: { email_redirect_to: redirect },
    }),
  })
  if (!res.ok) {
    const data = await res.json()
    throw new Error(data.error_description || data.msg || 'Could not send link')
  }
}

/** Starts a password reset. Supabase emails a one-time link; the new password
 *  is chosen on our own page and sent straight to Supabase. Nothing about a
 *  password is ever stored or logged by this site. */
export async function requestPasswordReset(email: string, redirect: string): Promise<void> {
  const res = await sbFetch(`${SB_URL}/auth/v1/recover`, {
    method: 'POST',
    headers: { apikey: SB_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, options: { email_redirect_to: redirect } }),
  })
  if (!res.ok) {
    const data = await res.json()
    throw new Error(data.error_description || data.msg || 'Could not start the reset')
  }
}

/** Sets a new password for whoever the current token belongs to — either a
 *  signed-in member changing it, or someone arriving from a recovery link. */
export async function updatePassword(password: string): Promise<void> {
  await ensureSession()
  const res = await sbFetch(`${SB_URL}/auth/v1/user`, {
    method: 'PUT',
    headers: headers(true),
    body: JSON.stringify({ password }),
  })
  if (!res.ok) {
    const data = await res.json()
    throw new Error(data.error_description || data.msg || data.message || 'Could not set the password')
  }
  clearRecovery()
}

/** Signs out here and at Supabase. The browser's copy of the session is
 *  cleared first and synchronously, so the page reads as signed out at once;
 *  the server call that revokes the refresh token follows, and its failure
 *  (offline, token already expired) changes nothing locally. */
export function signOut(): Promise<void> {
  const token = session.token
  session.token = null
  session.refresh = null
  session.expires = 0
  session.user = null
  clearRecovery()
  try {
    store()?.removeItem(STORAGE_KEY)
  } catch {
    /* ignore */
  }
  if (!token) return Promise.resolve()
  return sbFetch(`${SB_URL}/auth/v1/logout`, {
    method: 'POST',
    headers: { apikey: SB_KEY, Authorization: `Bearer ${token}` },
  }, 5_000).then(
    () => undefined,
    () => undefined,
  )
}

const searchWords = (term: string) => term.replace(/[,.*()"]/g, ' ').trim().split(/\s+/).filter(Boolean)

/** Filter for a people search: every word typed has to appear in one of the
 *  fields, so "Nor J" finds Nor Jobarah. Returns '' when nothing was typed.
 *  With `prefix`, each word is cut to that many letters first. */
export function wordsFilter(term: string, fields: string[], prefix?: number): string {
  const words = searchWords(term).map((w) => (prefix ? w.slice(0, prefix) : w))
  if (!words.length) return ''
  const one = (w: string) => `or(${fields.map((f) => `${f}.ilike.*${encodeURIComponent(w)}*`).join(',')})`
  return `and=(${words.map(one).join(',')})`
}

/** Letters to change, add or drop to turn one string into the other. */
function editDistance(a: string, b: string): number {
  const d = Array.from({ length: b.length + 1 }, (_, j) => j)
  for (let i = 1; i <= a.length; i++) {
    let diag = d[0]!
    d[0] = i
    for (let j = 1; j <= b.length; j++) {
      const up = d[j]!
      d[j] = Math.min(up + 1, d[j - 1]! + 1, diag + (a[i - 1] === b[j - 1] ? 0 : 1))
      diag = up
    }
  }
  return d[b.length]!
}

/** How close a row is to what was typed, 0 to 1. Each typed word is compared
 *  with every word in the fields, whole and as a prefix, so "Jobara" and
 *  "Jobbarah" both come out close to "Jobarah". */
function closeness(term: string, row: Record<string, unknown>, fields: string[]): number {
  const words = searchWords(term).map((w) => w.toLowerCase())
  const names = fields.flatMap((f) => String(row[f] ?? '').toLowerCase().split(/[\s'-]+/)).filter(Boolean)
  if (!words.length || !names.length) return 0
  const best = (w: string) => Math.max(...names.map((n) => 1 - Math.min(editDistance(w, n), editDistance(w, n.slice(0, w.length))) / w.length))
  return words.reduce((sum, w) => sum + best(w), 0) / words.length
}

/** A people search that forgives typos. It runs the exact search first; if
 *  that finds nobody, it searches again on the first three letters of each
 *  word and keeps the closest names. `build` turns a filter and a row limit
 *  into the query string. */
export async function searchSelect<T>(
  table: string,
  term: string,
  fields: string[],
  limit: number,
  build: (filter: string, limit: number) => string,
): Promise<{ data: T[] | null; error?: string }> {
  const exact = wordsFilter(term, fields)
  const first = await select<T>(table, build(exact, limit))
  if (first.error || (first.data ?? []).length) return first
  const loose = wordsFilter(term, fields, 3)
  if (!loose || loose === exact) return first
  const wide = await select<T>(table, build(loose, 100))
  if (!wide.data) return wide
  const ranked = wide.data
    .map((row) => ({ row, score: closeness(term, row as Record<string, unknown>, fields) }))
    .filter((x) => x.score >= 0.6)
    .sort((a, b) => b.score - a.score)
  return { data: ranked.slice(0, limit).map((x) => x.row) }
}

export async function select<T = unknown>(
  table: string,
  params: string,
): Promise<{ data: T[] | null; error?: string }> {
  await ensureSession()
  const res = await sbFetch(`${SB_URL}/rest/v1/${table}?${params}`, { headers: headers() })
  if (!res.ok) return { data: null, error: await res.text() }
  return { data: (await res.json()) as T[] }
}

export async function patch(
  table: string,
  params: string,
  body: Record<string, unknown>,
): Promise<{ ok?: true; error?: string }> {
  await ensureSession()
  const res = await sbFetch(`${SB_URL}/rest/v1/${table}?${params}`, {
    method: 'PATCH',
    headers: headers(true),
    body: JSON.stringify(body),
  })
  return res.ok ? { ok: true } : { error: await res.text() }
}

export async function insert(
  table: string,
  rows: Record<string, unknown>[],
): Promise<{ ok?: true; error?: string }> {
  await ensureSession()
  if (rows.length === 0) return { ok: true }
  const res = await sbFetch(`${SB_URL}/rest/v1/${table}`, {
    method: 'POST',
    headers: { ...headers(true), Prefer: 'return=minimal' },
    body: JSON.stringify(rows),
  })
  return res.ok ? { ok: true } : { error: await res.text() }
}

export async function remove(
  table: string,
  params: string,
): Promise<{ ok?: true; error?: string }> {
  await ensureSession()
  const res = await sbFetch(`${SB_URL}/rest/v1/${table}?${params}`, {
    method: 'DELETE',
    headers: headers(),
  })
  return res.ok ? { ok: true } : { error: await res.text() }
}

export type RpcResult<T> = {
  data: T | null
  /** What went wrong, when `data` is null. */
  error?: string
  /** The HTTP status; 0 when the request never got an answer (offline, timed out). */
  status: number
}

/** A database function call that says *why* it failed. A 401 or 403 means the
 *  caller is not allowed; a 5xx or a status of 0 means the server could not be
 *  reached just now and the call is worth retrying. `rpc()` below is the
 *  simpler form for callers that only need the value. */
export async function rpcResult<T = unknown>(name: string, args: Record<string, unknown> = {}): Promise<RpcResult<T>> {
  await ensureSession()
  let res: Response
  try {
    res = await sbFetch(`${SB_URL}/rest/v1/rpc/${name}`, {
      method: 'POST',
      headers: headers(true),
      body: JSON.stringify(args),
    })
  } catch (err) {
    return { data: null, error: (err as Error).message || 'Could not reach the server.', status: 0 }
  }
  if (!res.ok) return { data: null, error: await res.text().catch(() => `${res.status}`), status: res.status }
  return { data: (await res.json()) as T, status: res.status }
}

export async function rpc<T = unknown>(name: string, args: Record<string, unknown> = {}): Promise<T | null> {
  const r = await rpcResult<T>(name, args)
  // Unchanged contract: null when the server refused, a thrown error when it
  // could not be reached at all.
  if (r.status === 0) throw new Error(r.error)
  return r.data
}

export async function getUser(): Promise<SupabaseUser | null> {
  await ensureSession()
  if (!session.token) return null
  if (session.user) return session.user
  const res = await sbFetch(`${SB_URL}/auth/v1/user`, { headers: headers() })
  if (!res.ok) return null
  session.user = await res.json()
  persist()
  return session.user
}

/** POSTs to an Edge Function with whatever credentials the visitor has. */
export async function invoke<T = unknown>(
  name: string,
  body: Record<string, unknown>,
): Promise<T> {
  await ensureSession()
  const res = await sbFetch(`${SB_URL}/functions/v1/${name}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers() },
    body: JSON.stringify(body),
  })
  const text = await res.text()
  try {
    return JSON.parse(text) as T
  } catch {
    // A gateway error page is HTML, not JSON. Every caller already reads an
    // `error` field from the function's own replies, so hand them one rather
    // than a SyntaxError.
    if (!res.ok) return { error: `The server answered ${res.status}. Please try again in a moment.` } as T
    throw new Error('The server sent an answer this page could not read.')
  }
}

/** Row count without transferring rows. Uses PostgREST's Content-Range header. */
export async function count(table: string, params = ''): Promise<number> {
  await ensureSession()
  const res = await sbFetch(`${SB_URL}/rest/v1/${table}?select=*&limit=1${params ? `&${params}` : ''}`, {
    headers: { ...headers(), Prefer: 'count=exact' },
  })
  if (!res.ok) return 0
  const range = res.headers.get('content-range') ?? ''
  const total = range.split('/')[1]
  const n = Number(total)
  return Number.isFinite(n) ? n : 0
}
