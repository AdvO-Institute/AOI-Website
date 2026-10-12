/* ----------------------------------------------------------------------------
 * Password reset — its own page, two states.
 *
 * Arriving cold: an email field and one button. Arriving from the link in the
 * email: a new-password form, because the link's token already proves who they
 * are. Which state shows is decided by the recovery flag initSession() raised
 * when it adopted that token, not by anything typed on the login card.
 *
 * Client-only and noindex, like /account.
 * -------------------------------------------------------------------------- */
import { useState } from 'react'
import { Link, useNavigate } from '@/lib/router'
import {
  requestPasswordReset, updatePassword, isRecovery, signOut, linkError, clearLinkError,
} from '@/lib/supabase'
import { requestReset } from '@/lib/queries/access'
import { useAccess } from '@/lib/queries/AccessProvider'
import { useToast } from '@/components/ui/Toast'

function Card({ title, lede, children }: { title: string; lede: string; children: React.ReactNode }) {
  return (
    <>
      <div className="hero-img short">
        <div className="bg ph-b" />
        <div className="duo" />
        <div className="duo2" />
        <div className="scrim" />
        <div className="wrap inner">
          <div className="crumbs">
            <Link to="/">HOME</Link> <b>/</b> <Link to="/account">MEMBER AREA</Link> <b>/</b> RESET
          </div>
          <div className="kick">AOI Members</div>
          <h1>{title}</h1>
          <p className="sub">{lede}</p>
        </div>
      </div>
      <section className="tight">
        <div className="wrap" style={{ maxWidth: '460px' }}>
          <div className="acct-card">{children}</div>
        </div>
      </section>
    </>
  )
}

export default function ResetPasswordPage() {
  const toast = useToast()
  const navigate = useNavigate()
  const { refresh } = useAccess()
  const [recovering] = useState(() => typeof window !== 'undefined' && isRecovery())
  const [email, setEmail] = useState('')
  const [pw1, setPw1] = useState('')
  const [pw2, setPw2] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [sent, setSent] = useState(false)
  const [notice, setNotice] = useState<string | null>(() => (typeof window === 'undefined' ? null : linkError()))

  async function handleRequest(event: React.FormEvent) {
    event.preventDefault()
    setError(null)
    if (!email.trim()) {
      setError('Enter the email address on your account.')
      return
    }
    setBusy(true)
    try {
      // The Institute's own sender, in the Obsidian design; Supabase's shared
      // mailer is the fallback if that ever fails.
      const r = await requestReset(email.trim()).catch(() => null)
      if (!r || r.error) await requestPasswordReset(email.trim(), `${window.location.origin}/reset-password`)
      setSent(true)
    } catch (err) {
      setError((err as Error).message || 'Could not start the reset.')
    }
    setBusy(false)
  }

  async function handleSet(event: React.FormEvent) {
    event.preventDefault()
    setError(null)
    if (pw1.length < 8) {
      setError('Choose a password of at least 8 characters.')
      return
    }
    if (pw1 !== pw2) {
      setError('Those two passwords do not match.')
      return
    }
    setBusy(true)
    try {
      await updatePassword(pw1)
      setPw1('')
      setPw2('')
      toast('Password updated — you are signed in.')
      await refresh()
      navigate('/account')
    } catch (err) {
      setError((err as Error).message || 'Could not set the password.')
      setBusy(false)
    }
  }

  /* ---------------------------------------------------- from the email link */
  if (recovering) {
    return (
      <Card
        title="Choose a New Password"
        lede="You followed the link from your email, so you are already verified. Pick a password and you will be signed in."
      >
        <h3>
          New password<span className="gr" />
        </h3>
        <form onSubmit={handleSet}>
          <label className="flabel" htmlFor="rp-1">
            NEW PASSWORD
          </label>
          <input
            className="fi"
            id="rp-1"
            type="password"
            autoComplete="new-password"
            value={pw1}
            onChange={(e) => {
              setPw1(e.target.value)
              setError(null)
            }}
          />
          <label className="flabel" htmlFor="rp-2">
            CONFIRM
          </label>
          <input
            className="fi"
            id="rp-2"
            type="password"
            autoComplete="new-password"
            value={pw2}
            onChange={(e) => {
              setPw2(e.target.value)
              setError(null)
            }}
          />
          {error && (
            <div className="li-err" role="alert">
              {error}
            </div>
          )}
          <div style={{ marginTop: '20px', display: 'grid', gap: '10px' }}>
            <button type="submit" className="b p-btn" style={{ justifyContent: 'center' }} disabled={busy}>
              {busy ? 'One moment…' : 'Set Password & Sign In'}
            </button>
            <button
              type="button"
              className="b s-btn on-light"
              style={{ justifyContent: 'center' }}
              onClick={() => {
                signOut()
                void refresh()
                navigate('/account')
              }}
            >
              Cancel
            </button>
          </div>
        </form>
      </Card>
    )
  }

  /* ------------------------------------------------------------- arriving cold */
  if (sent) {
    return (
      <Card
        title="Check Your Email"
        lede="If that address has an account, a reset link is on its way."
      >
        <h3>
          Link sent<span className="gr" />
        </h3>
        <p className="acct-help" style={{ marginTop: 0 }}>
          Open the email and follow the link — it brings you straight back here to choose a new
          password. The link works once and expires after an hour.
        </p>
        <div style={{ marginTop: '20px', display: 'grid', gap: '10px' }}>
          <button
            type="button"
            className="b s-btn on-light"
            style={{ justifyContent: 'center' }}
            onClick={() => setSent(false)}
          >
            Didn&rsquo;t get it? Send again
          </button>
          <Link className="t-link" style={{ textAlign: 'center', fontSize: '12px' }} to="/account">
            Back to sign in
          </Link>
        </div>
      </Card>
    )
  }

  return (
    <Card
      title="Reset Your Password"
      lede="Enter the email on your account and we will send you a link to choose a new one."
    >
      <h3>
        Reset password<span className="gr" />
      </h3>
      {notice && (
        <div className="li-err" role="alert" style={{ marginBottom: '16px' }}>
          {notice} Request a new one below.
          <button
            type="button"
            className="li-err-x"
            aria-label="Dismiss"
            onClick={() => {
              clearLinkError()
              setNotice(null)
            }}
          >
            ×
          </button>
        </div>
      )}
      <form onSubmit={handleRequest}>
        <label className="flabel" htmlFor="rp-email">
          EMAIL
        </label>
        <input
          className="fi"
          id="rp-email"
          type="email"
          autoComplete="email"
          placeholder="you@practice.com"
          value={email}
          onChange={(e) => {
            setEmail(e.target.value)
            setError(null)
          }}
        />
        {error && (
          <div className="li-err" role="alert">
            {error}
          </div>
        )}
        <div style={{ marginTop: '20px', display: 'grid', gap: '10px' }}>
          <button type="submit" className="b p-btn" style={{ justifyContent: 'center' }} disabled={busy}>
            {busy ? 'One moment…' : 'Send Reset Link'}
          </button>
          <Link className="t-link" style={{ textAlign: 'center', fontSize: '12px' }} to="/account">
            Back to sign in
          </Link>
        </div>
      </form>
    </Card>
  )
}
