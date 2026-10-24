/* ----------------------------------------------------------------------------
 * The header's account control.
 *
 * Signed out it is the Member Login button, unchanged. Signed in it becomes the
 * person — their headshot, or their initials when there isn't one — with a
 * menu straight to the four things a member actually comes back for.
 *
 * The header is prerendered on every page, so the first client render has to
 * match the HTML the crawler and the browser were served. `mounted` holds the
 * signed-out markup for one frame and then swaps, which avoids a hydration
 * mismatch without making the whole header client-only.
 * -------------------------------------------------------------------------- */
import { useEffect, useRef, useState } from 'react'
import { Link, useLocation, useNavigate } from '@/lib/router'
import { useAccess } from '@/lib/queries/AccessProvider'
import { displayName, initials, primaryRole } from '@/lib/access'
import { signOut } from '@/lib/supabase'

const ITEMS = [
  { label: 'My Account', to: '/account#membership' },
  { label: 'My Events', to: '/account#events' },
  { label: 'My Certification', to: '/account#mycert' },
  { label: 'My CE', to: '/account#myce' },
]

export default function AccountMenu() {
  const { access, signedIn, ready, refresh, canViewAsMember, viewingAsMember, setViewingAsMember } = useAccess()
  const navigate = useNavigate()
  const { pathname, hash } = useLocation()
  const [mounted, setMounted] = useState(false)
  const [open, setOpen] = useState(false)
  const wrap = useRef<HTMLDivElement>(null)

  useEffect(() => setMounted(true), [])

  // Close on navigation, on Escape, and on a click anywhere else.
  useEffect(() => setOpen(false), [pathname, hash])
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false)
    const onDown = (e: MouseEvent) => {
      if (wrap.current && !wrap.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('keydown', onKey)
    document.addEventListener('mousedown', onDown)
    return () => {
      document.removeEventListener('keydown', onKey)
      document.removeEventListener('mousedown', onDown)
    }
  }, [open])

  if (!mounted || !signedIn) {
    // Two renderings of one link: the gold button on wide screens, and a quiet
    // outlined "Log in" beside the burger on phones, where the button would
    // crowd the logo. CSS shows one at a time, so only one is ever read out.
    return (
      <>
        <Link className="b p-btn hdr-btn" to="/account">
          Member Login
        </Link>
        <Link className="hdr-login" to="/account" aria-label="Member Login">
          Log in
        </Link>
      </>
    )
  }

  if (!ready) {
    // Signed in, but who this is has not come back yet. A blank circle the size
    // of the avatar holds the spot; the name and role follow. Showing "Member
    // Login" or a placeholder name here is the flash of wrong state (#103).
    return (
      <div className="acctmenu">
        <span className="acctbtn wait" role="status" aria-busy="true" aria-label="Checking your account">
          <span className="acctav" aria-hidden="true" />
        </span>
      </div>
    )
  }

  const photo = access.person?.photo_url
  const name = displayName(access)

  return (
    <div className="acctmenu" ref={wrap}>
      {viewingAsMember && (
        <div className="viewas" role="status">
          You're seeing the site as a member sees it.
          <button type="button" onClick={() => setViewingAsMember(false)}>Back to my view</button>
        </div>
      )}
      <button
        type="button"
        className="acctbtn"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-haspopup="menu"
        aria-label={`Account menu for ${name}`}
      >
        {photo ? (
          <img className="acctav" src={photo} alt="" width={38} height={38} />
        ) : (
          <span className="acctav">{initials(access)}</span>
        )}
        <span className="acctname">
          <b>{name}</b>
          <span>{primaryRole(access)}</span>
        </span>
      </button>

      {open && (
        <div className="acctdrop" role="menu">
          <div className="acctwho">
            <b>{name}</b>
            <span>{primaryRole(access)}</span>
          </div>
          {ITEMS.map((item) => (
            <Link key={item.to} to={item.to} role="menuitem" onClick={() => setOpen(false)}>
              {item.label}
            </Link>
          ))}
          <div className="acctsep" />
          {canViewAsMember && (
            <button
              type="button"
              role="menuitemcheckbox"
              aria-checked={viewingAsMember}
              className="acctout acctview"
              onClick={() => {
                setViewingAsMember(!viewingAsMember)
                setOpen(false)
              }}
            >
              {viewingAsMember ? 'Back to my view' : 'View as a member'}
            </button>
          )}
          <Link to="/account#overview" role="menuitem" onClick={() => setOpen(false)}>
            Member Area
          </Link>
          <button
            type="button"
            role="menuitem"
            className="acctout"
            onClick={() => {
              void signOut()
              setViewingAsMember(false)
              setOpen(false)
              void refresh()
              navigate('/account')
            }}
          >
            Sign Out
          </button>
        </div>
      )}
    </div>
  )
}
