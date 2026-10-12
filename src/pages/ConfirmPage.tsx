import { useEffect, useState } from 'react'
import { Link, useLocation } from '@/lib/router'
import { refundLine } from '@/lib/refund'
import { invoke } from '@/lib/supabase'
import { fmtDate } from '@/lib/dates'

/* ----------------------------------------------------------------------------
 * Landing after Stripe Checkout. The visitor arrives with ?session_id=…, and
 * this page asks the Institute's confirm-checkout function to verify the
 * session with Stripe and record the registration — the same finalizer the
 * webhook uses, so the sale is recorded whichever path arrives first, and
 * the page can show the ticket that was actually bought rather than a
 * generic "you're registered".
 * -------------------------------------------------------------------------- */

type Confirm = {
  status?: 'paid' | 'pending' | 'expired'
  recorded?: boolean
  event_title?: string | null
  starts_at?: string | null
  reg_type?: string
  amount_cents?: number | null
  email?: string | null
  needs_verification?: boolean
  kind?: string | null
  error?: string
}

const TIER: Record<string, string> = { doctor: 'Doctor', student: 'Student', faculty: 'College faculty', member: 'Member' }

export default function ConfirmPage() {
  const location = useLocation()
  const state = location.state as { message?: string } | null
  const sessionId = typeof window !== 'undefined' ? new URLSearchParams(window.location.search).get('session_id') : null
  const [c, setC] = useState<Confirm | null | 'loading'>(sessionId ? 'loading' : null)

  useEffect(() => {
    if (!sessionId) return
    let tries = 0
    const go = async () => {
      try {
        const r = await invoke<Confirm>('confirm-checkout', { session_id: sessionId })
        // Stripe can take a moment to mark a fresh session paid — ask again briefly rather than show "pending" to someone who just paid.
        if (r.status === 'pending' && tries++ < 3) { setTimeout(() => void go(), 2500); return }
        setC(r)
      } catch {
        setC({ error: 'network' })
      }
    }
    void go()
  }, [sessionId])

  const paid = c && c !== 'loading' && c.status === 'paid'
  const when = paid && c.starts_at ? fmtDate(c.starts_at, { long: true }) : null
  const amount = paid && typeof c.amount_cents === 'number' ? `$${(c.amount_cents / 100).toLocaleString('en-US', { minimumFractionDigits: 2 })}` : null

  const headline = c === 'loading' ? 'Recording your payment…'
    : c && c.status === 'paid' && c.kind === 'ce_payment' ? 'CE certificate paid'
    : c && c.status === 'expired' ? 'That checkout has expired'
    : c && c.status === 'pending' ? 'Payment still processing'
    : "You're registered!"
  const sub = c === 'loading' ? 'One moment while we confirm your payment with Stripe.'
    : c && c.status === 'expired' ? 'The payment session timed out before it was completed. Nothing was charged — please register again.'
    : c && c.status === 'pending' ? 'Your bank has not confirmed the payment yet. Your seat will be recorded automatically the moment it clears, and a receipt will follow by email.'
    : paid && c.kind === 'ce_payment' ? `Your CE credit certificate for ${c.event_title ?? 'this event'} is paid. It will be issued after the event, and the registration desk can see it now.`
    : paid && c.reg_type === 'member' ? `Your RSVP for ${c.event_title ?? 'this event'} is confirmed and your CE credit certificate is paid. Your seat is included with your AOI membership.`
    : paid ? `Your ${TIER[c.reg_type ?? 'doctor'] ?? 'Doctor'} registration for ${c.event_title ?? 'this event'} is confirmed${c.needs_verification ? ' — we will confirm your student or faculty status by email before the event' : ''}.`
    : state?.message ?? 'Your registration is confirmed. A receipt has been emailed to you.'

  return (
    <>
      <div className="hero-img short">
        <div className="bg ph-a" />
        <div className="duo" />
        <div className="duo2" />
        <div className="scrim" />
        <div className="wrap inner" style={{ textAlign: 'center' }}>
          <div className="confirm-tick">
            <svg width="42" height="42" viewBox="0 0 24 24" fill="none" stroke="var(--color-surface-inverse)" strokeWidth="3">
              <path d="M20 6 9 17l-5-5" />
            </svg>
          </div>
          <h1 style={{ maxWidth: 'none' }}>{headline}</h1>
          <p className="sub confirm-sub">{sub}</p>
        </div>
      </div>
      <section className="tight">
        <div className="wrap" style={{ maxWidth: '720px' }}>
          <div className="steps" style={{ gridTemplateColumns: '1fr' }}>
            {paid && (
              <div className="step">
                <div className="n">{c.kind === 'ce_payment' ? 'YOUR CE CERTIFICATE' : 'YOUR REGISTRATION'}</div>
                <p><b>{c.event_title}</b>{when ? ` · ${when}` : ''}</p>
                <p>{c.kind === 'ce_payment' ? 'CE credit certificate' : c.reg_type === 'member' ? 'Member RSVP + CE credit' : `${TIER[c.reg_type ?? 'doctor'] ?? 'Doctor'} ticket`}{amount ? ` · ${amount} paid` : ''}{c.email ? ` · receipt sent to ${c.email}` : ''}</p>
              </div>
            )}
            <div className="step">
              <div className="n">WHAT HAPPENS NEXT</div>
              <p>
                Your seat is reserved and your registration is recorded with the Institute. You&apos;ll receive event
                details and reminders by email as the date approaches. If you have a member login, this event now
                appears in the members area under <Link to="/account#events"><b>Events</b></Link>.
              </p>
              {paid && c.kind !== 'ce_payment' && c.reg_type !== 'member' && (
                <p>Need to cancel? {refundLine(c.starts_at)} Members can request a cancellation from the event in the members area; everyone else, <Link to="/contact">contact us</Link>.</p>
              )}
              <div style={{ marginTop: '18px', display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
                <Link className="b p-btn" to="/seminars">Browse More Events</Link>
                <Link className="b s-btn on-light" to="/account#events">My Events</Link>
              </div>
            </div>
          </div>
        </div>
      </section>
    </>
  )
}
