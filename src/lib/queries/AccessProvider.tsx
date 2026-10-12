/* ----------------------------------------------------------------------------
 * Access context.
 *
 * Calls `get_my_access()` once after sign-in and hands the result to the whole
 * member area. Components never read a role — they ask `can('manage_seminars')`.
 *
 * Three questions, answered separately, because conflating them is what made
 * sign-in look broken (#103):
 *
 *   signedIn  Do we hold a session token we believe is valid?
 *   ready     Can `access` be trusted to drive what is shown? False while the
 *             first read is in flight or has failed — show a neutral placeholder
 *             then, never the signed-out or plain-member state.
 *   error     Did the last read fail for a reason other than being signed out?
 *             The last good access is kept and a retry is scheduled.
 *
 * Only a 401/403, or no token at all, means signed out. A timeout, a network
 * error or a 5xx is the server's problem, and is reported as one.
 *
 * "View as a member" swaps in a member's access — no offices, no committees —
 * so a Director can see the site the way an ordinary member does. It only ever
 * removes: the database still answers with the person's real permissions.
 * -------------------------------------------------------------------------- */
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { rpcResult, session, isRecovery } from '@/lib/supabase'
import { NO_ACCESS } from '@/lib/access'
import type { Access, Capability } from '@/lib/access'

/** The quiet line shown when access could not be read. */
export const ACCESS_CHECK_FAILED = "We couldn't check your access just now — retrying…"

type AccessState = {
  access: Access
  /** A read of access is in flight. */
  loading: boolean
  /** True once `access` is settled: read from the server, or definitely signed
   *  out. Role-dependent UI waits for this so nobody sees the wrong state. */
  ready: boolean
  signedIn: boolean
  /** Set when the last read failed for a reason other than being signed out. */
  error: string | null
  can: (capability: Capability) => boolean
  /** Re-read after a role change, so the rail updates without a reload. Also the retry. */
  refresh: () => Promise<void>
  /** True when this person holds anything beyond membership, so "view as a member" means something. */
  canViewAsMember: boolean
  viewingAsMember: boolean
  setViewingAsMember: (on: boolean) => void
}

/** Exported for the build-time preview harness only; the app uses the provider. */
export const AccessContext = createContext<AccessState>({
  access: NO_ACCESS,
  loading: false,
  ready: true,
  signedIn: false,
  error: null,
  can: () => false,
  refresh: async () => {},
  canViewAsMember: false,
  viewingAsMember: false,
  setViewingAsMember: () => {},
})

const VIEW_KEY = 'aoi-view-as-member'

/* Retry schedule after a failed read: 3 s, 6 s, 12 s, 24 s, then every 30 s. */
const RETRY_BASE_MS = 3_000
const RETRY_MAX_MS = 30_000

/** The same person, as an ordinary member would be: membership only. */
function asMember(a: Access): Access {
  return { ...a, staff_role: null, tier: 'member', roles: [], committees: [], can_admin_roles: false, capabilities: ['account', 'member'] }
}

export function useAccess() {
  return useContext(AccessContext)
}

export function AccessProvider({ children }: { children: ReactNode }) {
  const [access, setAccess] = useState<Access>(NO_ACCESS)
  const [loading, setLoading] = useState(Boolean(session.token))
  const [signedIn, setSignedIn] = useState(Boolean(session.token))
  const [ready, setReady] = useState(!session.token)
  const [error, setError] = useState<string | null>(null)
  const failures = useRef(0)
  const retryTimer = useRef<number | null>(null)
  /** Whether `access` came from the server for the current token. */
  const haveAccess = useRef(false)
  // Kept for this browser tab only, so it survives moving between pages but never sticks.
  const [viewingAsMember, setViewing] = useState(() => {
    try { return typeof window !== 'undefined' && sessionStorage.getItem(VIEW_KEY) === '1' } catch { return false }
  })
  const setViewingAsMember = useCallback((on: boolean) => {
    setViewing(on)
    try { if (on) sessionStorage.setItem(VIEW_KEY, '1'); else sessionStorage.removeItem(VIEW_KEY) } catch { /* private window */ }
  }, [])

  const clearRetry = () => {
    if (retryTimer.current !== null) {
      clearTimeout(retryTimer.current)
      retryTimer.current = null
    }
  }

  const refresh = useCallback(async () => {
    clearRetry()
    const signedOut = () => {
      setAccess(NO_ACCESS)
      setSignedIn(false)
      setReady(true)
      setError(null)
      failures.current = 0
      haveAccess.current = false
    }
    // A recovery token is a real session, but the person has not chosen a
    // password yet. Reporting "signed out" keeps the header on Member Login
    // and the shell closed until the reset page finishes the job.
    if (!session.token || isRecovery()) {
      signedOut()
      setLoading(false)
      return
    }
    setLoading(true)
    // If the token had already lapsed and the renewal could not go through,
    // the 401 that follows is the outage talking, not a sign-out.
    const lapsed = Date.now() >= session.expires && Boolean(session.refresh)
    const r = await rpcResult<Access>('get_my_access')
    if (!session.token) {
      // The renewal inside the call found the refresh token spent or revoked.
      signedOut()
    } else if (r.data) {
      setAccess(r.data)
      setSignedIn(true)
      setReady(true)
      setError(null)
      failures.current = 0
      haveAccess.current = true
    } else if ((r.status === 401 || r.status === 403) && !lapsed) {
      signedOut()
    } else if (r.status >= 200 && r.status < 300) {
      // The server answered and had nothing for this token: not a member record we can use.
      signedOut()
    } else {
      // Offline, timed out, or a 5xx. Keep whatever access was last read and
      // say so quietly; `ready` is only false when there was none yet. The
      // token still stands, so this is a signed-in person we cannot describe.
      setSignedIn(true)
      if (!haveAccess.current) setReady(false)
      setError(ACCESS_CHECK_FAILED)
      failures.current += 1
      const delay = Math.min(RETRY_MAX_MS, RETRY_BASE_MS * 2 ** (failures.current - 1))
      retryTimer.current = window.setTimeout(() => { void refresh() }, delay)
    }
    setLoading(false)
  }, [])

  useEffect(() => {
    void refresh()
    return clearRetry
  }, [refresh])

  // Coming back online is the moment a retry is most likely to succeed.
  useEffect(() => {
    if (!error) return
    const again = () => { void refresh() }
    window.addEventListener('online', again)
    return () => window.removeEventListener('online', again)
  }, [error, refresh])

  const canViewAsMember =
    access.roles.length > 0 || Boolean(access.staff_role) || access.can_admin_roles ||
    access.capabilities.some((c) => !['account', 'member', 'student'].includes(c))
  const viewing = viewingAsMember && canViewAsMember
  const shown = useMemo(() => (viewing ? asMember(access) : access), [viewing, access])

  const can = useCallback(
    (capability: Capability) => shown.capabilities.includes(capability),
    [shown],
  )

  const value = useMemo<AccessState>(
    () => ({ access: shown, loading, ready, signedIn, error, can, refresh, canViewAsMember, viewingAsMember: viewing, setViewingAsMember }),
    [shown, loading, ready, signedIn, error, can, refresh, canViewAsMember, viewing, setViewingAsMember],
  )

  return <AccessContext.Provider value={value}>{children}</AccessContext.Provider>
}
