import { useState } from 'react'
import { Link } from '@/lib/router'
import { SB_URL, SB_KEY, session } from '@/lib/supabase'

type ContactResponse = { ok?: boolean; error?: string; detail?: string }

export default function ContactPage() {
  const [sent, setSent] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [form, setForm] = useState({
    name: '',
    email: '',
    subject: '',
    message: '',
    company: '', // honeypot
  })

  const update = (field: keyof typeof form) => (
    event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>,
  ) => {
    setForm((f) => ({ ...f, [field]: event.target.value }))
    setError(null)
  }

  async function send(event: React.FormEvent) {
    event.preventDefault()
    const name = form.name.trim()
    const email = form.email.trim()
    const message = form.message.trim()

    if (name.length < 2) return setError('Please enter your name.')
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]{2,}$/.test(email)) {
      return setError('Please enter a valid email address so we can reply.')
    }
    if (message.length < 5) return setError('Please tell us how we can help.')

    setBusy(true)
    try {
      const res = await fetch(`${SB_URL}/functions/v1/contact-submit`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          apikey: SB_KEY,
          Authorization: `Bearer ${session.token ?? SB_KEY}`,
        },
        body: JSON.stringify({
          full_name: name,
          email,
          subject: form.subject.trim() || null,
          message,
          company: form.company,
          page_url: window.location.origin + window.location.pathname,
        }),
      })
      const data = (await res.json().catch(() => ({}))) as ContactResponse
      if (res.ok && data.ok) {
        setSent(true)
        setBusy(false)
        return
      }
      if (data.error === 'rate_limited') {
        setError(
          data.detail ??
            'Too many messages from this connection. Please try again shortly or call (656) 222-1099.',
        )
      } else if (data.error === 'invalid_fields') {
        setError('Please check the highlighted details and try again.')
      } else {
        setError(
          'We could not send that just now. Please email Info@AdvancedOrthogonal.com or call (656) 222-1099.',
        )
      }
    } catch {
      setError(
        'Connection problem — please check your internet, or email Info@AdvancedOrthogonal.com.',
      )
    }
    setBusy(false)
  }

  return (
    <>
      <div className="hero-img short">
        <div className="bg ph-b" />
        <div className="duo" />
        <div className="duo2" />
        <div className="scrim" />
        <div className="wrap inner">
          <div className="crumbs">
            <Link to="/">HOME</Link> <b>/</b> CONTACT
          </div>
          <div className="kick">How Can We Help You?</div>
          <h1>Contact Us</h1>
          <p className="sub">
            For general inquiries, use the form — or call us directly. We respond within one
            business day.
          </p>
        </div>
      </div>

      <section className="tight">
        <div className="wrap grid2" style={{ gap: '56px', alignItems: 'start' }}>
          <div>
            <div style={{ display: 'grid', gap: '16px' }}>
              <div className="contact-tile">
                <svg
                  width="34"
                  height="34"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="var(--color-brand-primary-deep)"
                  strokeWidth="1.8"
                >
                  <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 22 16.92z" />
                </svg>
                <div>
                  <div className="ct-h">Call the Institute</div>
                  <div className="ct-p">
                    <a href="tel:+16562221099">+1 (656) 222-1099</a>
                  </div>
                </div>
              </div>
              <div className="contact-tile">
                <svg
                  width="34"
                  height="34"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="var(--color-brand-primary-deep)"
                  strokeWidth="1.8"
                >
                  <rect x="2" y="4" width="20" height="16" rx="2" />
                  <path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7" />
                </svg>
                <div>
                  <div className="ct-h">Email</div>
                  <div className="ct-p">
                    <a href="mailto:Info@AdvancedOrthogonal.com">Info@AdvancedOrthogonal.com</a>
                  </div>
                </div>
              </div>
              <div className="contact-tile">
                <svg
                  width="34"
                  height="34"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="var(--color-brand-accent-strong)"
                  strokeWidth="1.8"
                >
                  <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
                </svg>
                <div>
                  <div className="ct-h">Certification Committee</div>
                  <div className="ct-p">
                    Questions about certification, grandfathering, or reviews — mention
                    &quot;Certification Committee&quot; in your message.
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className="contact-card">
            <h3 style={{ fontSize: '20px', marginBottom: '20px' }}>Send us a message</h3>
            {sent ? (
              <div className="cm-done">
                <div className="cm-done-ic">
                  <svg
                    width="26"
                    height="26"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="var(--color-brand-primary)"
                    strokeWidth="2.6"
                  >
                    <path d="M20 6 9 17l-5-5" />
                  </svg>
                </div>
                <h3>Message sent</h3>
                <p>
                  Thank you — the Institute has your message and will be in touch shortly. For
                  anything urgent, call (656) 222-1099.
                </p>
              </div>
            ) : (
              <form style={{ display: 'grid', gap: '14px' }} onSubmit={send}>
                <label className="sr-only" htmlFor="cm-name">
                  Full name
                </label>
                <input
                  className="cfi"
                  id="cm-name"
                  name="name"
                  placeholder="Full name"
                  autoComplete="name"
                  value={form.name}
                  onChange={update('name')}
                />
                <label className="sr-only" htmlFor="cm-email">
                  Email address
                </label>
                <input
                  className="cfi"
                  id="cm-email"
                  name="email"
                  type="email"
                  placeholder="Email address"
                  autoComplete="email"
                  value={form.email}
                  onChange={update('email')}
                />
                <label className="sr-only" htmlFor="cm-subject">
                  Subject
                </label>
                <input
                  className="cfi"
                  id="cm-subject"
                  name="subject"
                  placeholder="Subject"
                  value={form.subject}
                  onChange={update('subject')}
                />
                <label className="sr-only" htmlFor="cm-message">
                  How can we help?
                </label>
                <textarea
                  className="cfi"
                  id="cm-message"
                  name="message"
                  placeholder="How can we help?"
                  rows={5}
                  style={{ resize: 'vertical' }}
                  value={form.message}
                  onChange={update('message')}
                />
                {/* Honeypot — real people never see or fill this. */}
                <input
                  id="cm-company"
                  className="honeypot"
                  tabIndex={-1}
                  autoComplete="off"
                  aria-hidden="true"
                  value={form.company}
                  onChange={update('company')}
                />
                {error && (
                  <div className="cm-err" role="alert">
                    {error}
                  </div>
                )}
                <button
                  type="submit"
                  className="b p-btn"
                  style={{ justifyContent: 'center' }}
                  disabled={busy}
                >
                  {busy ? 'Sending…' : 'Send Message'}
                </button>
                <p className="cm-note">
                  We answer every message. Urgent? Call (656) 222-1099.
                </p>
              </form>
            )}
          </div>
        </div>
      </section>
    </>
  )
}
