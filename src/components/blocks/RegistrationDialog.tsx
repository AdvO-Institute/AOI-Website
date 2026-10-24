/* ----------------------------------------------------------------------------
 * Event registration dialog.
 *
 * Ported from `regOpen` / `regSubmit` in the v4.8 build. The request body sent
 * to the `create-checkout` Edge Function is unchanged — same fields, same
 * reg_type, same headers — because that path has already taken and refunded
 * real money and must keep behaving identically.
 *
 * The one change is the return URL: success now lands on the real
 * /registration-confirmed route. The function allowlists by ORIGIN, not path,
 * so this needs no server change.
 * -------------------------------------------------------------------------- */
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import type { ReactNode } from 'react'
import { useNavigate } from '@/lib/router'
import { refundLine } from '@/lib/refund'
import { SEMINARS } from '@/content/seminars'
import { session, select, invoke } from '@/lib/supabase'
import { useCatalog } from '@/lib/queries/CatalogProvider'
import { useAccess } from '@/lib/queries/AccessProvider'
import { formatPrice } from '@/lib/queries/events'

const RegistrationContext = createContext<(key: string) => void>(() => {})

export function useRegistration() {
  return useContext(RegistrationContext)
}

type Person = {
  first_name?: string
  last_name?: string
  email?: string
  mobile_phone?: string
  office_phone?: string
  credentials?: string
}

type CheckoutResponse = {
  url?: string
  free?: boolean
  rsvp?: boolean
  ce?: boolean
  event_title?: string
  reg_type?: string
  needs_verification?: boolean
  requires_login_for_discount?: boolean
  free_with_membership?: boolean
  error?: string
  detail?: string
}

type Tier = { v: string; k: string; p: string; n: string }

const ERRORS: Record<string, { message: string; fields: string[] }> = {
  payments_not_configured: {
    message: 'Payments are almost ready — Stripe is being connected. Please try again soon.',
    fields: [],
  },
  already_registered: {
    message:
      'That email is already registered for this event. Check your inbox for the confirmation, or contact the Institute.',
    fields: ['email'],
  },
  event_full: {
    message: 'This event has reached capacity. Contact the Institute to be added to the waiting list.',
    fields: [],
  },
  registration_closed: {
    message: 'Registration for this event has closed. Contact the Institute to ask about late enrollment.',
    fields: [],
  },
  registration_not_open: {
    message:
      'Registration for this event has not opened yet. Contact the Institute and we will let you know when it does.',
    fields: [],
  },
  event_not_open: {
    message: 'This event is not open for registration yet. Contact the Institute for the next available date.',
    fields: [],
  },
  event_pricing_not_set: {
    message: 'Pricing for this event is still being finalized — please contact the Institute.',
    fields: [],
  },
  event_not_found: {
    message: 'We could not find that event. Please refresh the page and try again.',
    fields: [],
  },
  event_over: {
    message: 'This session has already taken place. Contact the Institute for the next available date.',
    fields: [],
  },
  bad_return_url: {
    message: 'This copy of the site is not authorized for checkout. Please register from advancedorthogonal.com.',
    fields: [],
  },
  invalid_email: { message: 'Please enter a valid email address.', fields: ['email'] },
  invalid_reg_type: { message: 'Please choose how you are registering.', fields: [] },
}

export function RegistrationProvider({ children }: { children: ReactNode }) {
  const [key, setKey] = useState<string | null>(null)
  const [tier, setTier] = useState('doctor')
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [phone, setPhone] = useState('')
  const [error, setError] = useState<{ message: string; fields: string[] } | null>(null)
  const [busy, setBusy] = useState(false)
  const [interstitial, setInterstitial] = useState<string | null>(null)
  const [signedInName, setSignedInName] = useState('')
  const [wantCE, setWantCE] = useState(false)
  const ref = useRef<HTMLDialogElement>(null)
  const { access, loading } = useAccess()
  const navigate = useNavigate()
  const catalog = useCatalog()

  const open = useCallback(
    (eventKey: string) => {
      setKey(eventKey)
      setTier('doctor')
      setWantCE(false)
      setError(null)
      setInterstitial(null)
      setBusy(false)
    },
    [],
  )
  const value = useMemo(() => open, [open])

  const close = useCallback(() => setKey(null), [])

  useEffect(() => {
    const dialog = ref.current
    if (!dialog) return
    if (key && !dialog.open) dialog.showModal()
    if (!key && dialog.open) dialog.close()
  }, [key])

  // Prefill from the signed-in member's record, as the old dialog did.
  useEffect(() => {
    if (!key || !session.token) {
      setSignedInName('')
      return
    }
    let cancelled = false
    void (async () => {
      const userId = session.user?.id ?? ''
      const query = await select<Person>(
        'people',
        `select=first_name,last_name,email,mobile_phone,office_phone,credentials&auth_user_id=eq.${userId}&limit=1`,
      )
      if (cancelled) return
      const me = query.data?.[0]
      let display = ''
      if (me) {
        display = `${me.first_name ?? ''} ${me.last_name ?? ''}`.trim()
        if (me.credentials) display += `, ${me.credentials}`
        if (display) setName(display)
        if (me.email) setEmail(me.email)
        const p = me.mobile_phone || me.office_phone
        if (p) setPhone(p)
      }
      setSignedInName(display || session.user?.email || '')
    })()
    return () => {
      cancelled = true
    }
  }, [key])

  // A session key (`intensive:feb`) registers for its own event but reads the page's copy.
  const seminar = key ? SEMINARS[key.split(':')[0]!] : undefined
  const overlay = key ? catalog.byKey[key] : undefined

  /* Member RSVP: a signed-in current member, on an event that is free with
   * membership, RSVPs for themself. The only thing they can buy is CE. */
  const freeWithMembership = overlay?.event?.free_with_membership === true || (!catalog.synced && seminar?.memPrice === 0 && (seminar?.fullPrice ?? 0) > 0)
  const rsvpMode = Boolean(session.token) && access.tier === 'member' && freeWithMembership
  const ceOffered = overlay?.event?.ce_credits === true
  const cePrice = Number(overlay?.event?.ce_price ?? 0)
  const ceHours = String(overlay?.event?.ce_mode ?? '').split('·')[0]?.trim() || ''

  /* What membership is worth on this event, from the live catalog with the
   * content module as the fallback. Nothing to say (a free course, an
   * internship) means no strip at all. */
  const fullPrice = overlay?.fullPrice ?? seminar?.fullPrice ?? 0
  const memPrice = overlay?.memPrice ?? seminar?.memPrice ?? fullPrice
  const memberSaves = fullPrice > 0 && memPrice >= 0 ? fullPrice - memPrice : 0
  const memberStrip =
    freeWithMembership && fullPrice > 0
      ? 'Members attend free — sign in for your seat'
      : memberSaves > 0
        ? `Members save $${memberSaves.toLocaleString()} on this seminar`
        : null

  /* States the visitor should see before typing anything, judged the same
   * way `submit` judges them. Before the catalog has answered, the event is
   * given the benefit of the doubt so the form is not hidden for a moment. */
  const notice: 'apply' | 'sold_out' | 'not_open' | null =
    seminar?.cat === 'internship'
      ? 'apply'
      : overlay?.soldOut
        ? 'sold_out'
        : overlay
          ? (!overlay.id || !overlay.open ? 'not_open' : null)
          : catalog.synced
            ? 'not_open'
            : null

  /** Tiers offered for this event, preferring live database configuration. */
  const tiers: Tier[] = useMemo(() => {
    if (!seminar) return []
    const ev = overlay?.event
    const full = ev?.price ?? seminar.fullPrice
    const out: Tier[] = [
      {
        v: 'doctor',
        k: 'Doctor',
        p: formatPrice(full) ?? '',
        n: 'Practicing chiropractors and general registration.',
      },
    ]
    const studentPrice =
      ev?.student_price !== undefined && ev?.student_price !== null && ev?.student_price !== ''
        ? ev.student_price
        : catalog.synced
          ? null
          : seminar.studentPrice
    if (studentPrice !== undefined && studentPrice !== null) {
      out.push({
        v: 'student',
        k: 'Student',
        p: formatPrice(studentPrice) ?? '',
        n: 'Currently enrolled chiropractic students.',
      })
    }
    const facultyFree = catalog.synced
      ? ev?.faculty_free === true
      : ev?.faculty_free === true || seminar.facultyFree === true
    if (facultyFree) {
      out.push({ v: 'faculty', k: 'College Faculty', p: 'FREE', n: 'Faculty of a chiropractic college.' })
    }
    return out
  }, [seminar, overlay, catalog.synced])

  async function submit(forceGuest: boolean) {
    if (!key || !seminar) return
    const trimmedName = name.trim()
    const trimmedEmail = email.trim()
    const bad: string[] = []
    if (!rsvpMode && !trimmedName) bad.push('name')
    if (!rsvpMode && (!trimmedEmail || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(trimmedEmail))) bad.push('email')
    if (bad.length) {
      setInterstitial(null)
      setError({
        message:
          bad.length === 2
            ? 'Please enter your name and a valid email address.'
            : bad[0] === 'name'
              ? 'Please enter your full name.'
              : 'Please enter a valid email address.',
        fields: bad,
      })
      return
    }

    const eventId = overlay?.id ?? null
    if (!eventId || overlay?.open === false) {
      setError({
        message: seminar.cat === 'internship'
          ? 'This program is by application — please use the contact form and we will be in touch.'
          : 'Registration for this event is not open yet. Contact the Institute and we will let you know the moment it is.',
        fields: [],
      })
      return
    }

    setBusy(true)
    setError(null)
    try {
      const origin = window.location.origin
      const data = await invoke<CheckoutResponse>('create-checkout', {
        event_id: eventId,
        full_name: trimmedName,
        email: trimmedEmail,
        phone: phone.trim() || null,
        force_guest: forceGuest,
        reg_type: rsvpMode ? 'member' : tier,
        ce: rsvpMode ? wantCE : undefined,
        success_url: `${origin}/registration-confirmed?registered=1${rsvpMode ? '&rsvp=1' : tier !== 'doctor' ? `&verify=${tier}` : ''}`,
        cancel_url: `${origin}/seminars`,
      })

      if (data.requires_login_for_discount) {
        setInterstitial(
          data.free_with_membership
            ? 'This event is included with your membership. Sign in to claim your seat, or continue as a guest at full price.'
            : 'Sign in to apply your $200 member discount — or continue as a guest at full price.',
        )
      } else if (data.free && data.rsvp) {
        close()
        navigate('/registration-confirmed', {
          state: { message: `You're on the list — your RSVP for ${data.event_title ?? 'this event'} is confirmed. Your seat is included with your AOI membership. See you there!` },
        })
      } else if (data.free) {
        close()
        const detail = data.needs_verification
          ? ` — we will confirm your ${data.reg_type === 'student' ? 'student' : 'college faculty'} status by email before the event.`
          : ' — see you there!'
        navigate('/registration-confirmed', {
          state: { message: `Your free registration for ${data.event_title ?? 'this event'} is confirmed${detail}` },
        })
      } else if (data.url) {
        window.location.href = data.url
      } else if (data.error && ERRORS[data.error]) {
        setError(ERRORS[data.error]!)
      } else if (data.error === 'already_registered') {
        setError({ message: data.detail ?? 'You are already registered for this event.', fields: [] })
      } else if (data.error === 'not_a_member') {
        setError({ message: data.detail ?? 'Your membership is not current.', fields: [] })
      } else if (data.error === 'tier_not_available') {
        setError({
          message: data.detail ?? 'That registration type is not offered for this event — please choose another.',
          fields: [],
        })
      } else {
        /* Anything unexpected (a database error, say) arrives as raw technical
         * text; keep it in the console and show the visitor a plain message. */
        console.error('create-checkout', data.error, data.detail)
        setError({ message: 'Something went wrong and your registration was not saved. Please try again later, or contact the Institute and we will sign you up.', fields: [] })
      }
    } catch {
      setError({ message: 'Connection problem — please check your internet and try again.', fields: [] })
    }
    setBusy(false)
  }

  const signedIn = Boolean(session.token)
  /* Signed in, membership not yet known: show neither price nor RSVP until it is. */
  const checking = signedIn && loading
  const badField = (f: string) => (error?.fields.includes(f) ? ' err' : '')

  const goTo = (path: string) => {
    close()
    navigate(path)
  }
  const NOTICE = {
    apply: {
      h: 'This program is by application',
      p: 'Internship placements are matched by the Institute to your stage of training and preferred region. Tell us about yourself and we will be in touch.',
      btn: 'Contact the Institute',
    },
    sold_out: {
      h: 'This session is sold out',
      p: 'Every seat is taken. Ask to join the waiting list and we will let you know the moment one opens up.',
      btn: 'Join the Waiting List',
    },
    not_open: {
      h: 'Registration opens soon',
      p: 'Registration for this event is not open yet. Tell us you are interested and we will let you know the moment it is.',
      btn: 'Notify Me',
    },
  } as const

  return (
    <RegistrationContext.Provider value={value}>
      {children}
      <dialog
        className="bio-bg"
        ref={ref}
        onClose={close}
        onClick={(e) => {
          if (e.target === ref.current) close()
        }}
        aria-labelledby="reg-title"
      >
        {seminar && key && (
          <div className="bio-m">
            <button type="button" className="x" onClick={close} aria-label="Close">
              ✕
            </button>
            <div className="top" style={{ display: 'block' }}>
              <div className="kick" style={{ marginBottom: '4px' }}>
                {rsvpMode ? 'Member RSVP' : 'Register'}
              </div>
              <h3 id="reg-title">{seminar.title}</h3>
              <div className="cred">
                {`${overlay?.dates ?? seminar.dates} · ${overlay?.loc ?? seminar.loc}`.toUpperCase()}
              </div>
            </div>
            <div className="body">
              {interstitial ? (
                <div className="reg-int">
                  <div className="reg-int-ic">
                    <svg
                      width="26"
                      height="26"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="var(--color-brand-accent-strong)"
                      strokeWidth="2"
                    >
                      <circle cx="12" cy="8" r="4" />
                      <path d="M4 21c0-4.4 3.6-8 8-8s8 3.6 8 8" />
                    </svg>
                  </div>
                  <h3>This email belongs to an AOI member</h3>
                  <p>{interstitial}</p>
                  <div style={{ display: 'grid', gap: '10px' }}>
                    <button
                      type="button"
                      className="b p-btn"
                      style={{ justifyContent: 'center' }}
                      onClick={() => {
                        close()
                        navigate('/account')
                      }}
                    >
                      Sign In &amp; Save
                    </button>
                    <button
                      type="button"
                      className="b s-btn on-light"
                      style={{ justifyContent: 'center' }}
                      onClick={() => void submit(true)}
                    >
                      Continue as Guest — Full Price
                    </button>
                  </div>
                </div>
              ) : notice ? (
                <div className="reg-int">
                  <div className="reg-int-ic">
                    <svg
                      width="26"
                      height="26"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="var(--color-brand-primary)"
                      strokeWidth="2"
                    >
                      <rect x="3" y="4.5" width="18" height="16" rx="2" />
                      <path d="M3 9.5h18M8 2.5v4M16 2.5v4" />
                    </svg>
                  </div>
                  <h3>{NOTICE[notice].h}</h3>
                  <p>{NOTICE[notice].p}</p>
                  <div style={{ display: 'grid', gap: '10px' }}>
                    <button
                      type="button"
                      className="b p-btn"
                      style={{ justifyContent: 'center' }}
                      onClick={() => goTo('/contact')}
                    >
                      {NOTICE[notice].btn}
                    </button>
                  </div>
                </div>
              ) : checking ? (
                <div className="reg-auth" aria-live="polite">
                  <span>Checking your membership…</span>
                </div>
              ) : (
                <form
                  onSubmit={(e) => {
                    e.preventDefault()
                    void submit(false)
                  }}
                >
                  {rsvpMode ? (
                    <>
                      <div className="reg-auth">
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4"><path d="M20 6 9 17l-5-5" /></svg>
                        <span>RSVPing as <b>{signedInName}</b> — your seat is included with your AOI membership.</span>
                      </div>
                      <div className="rsvp-who">
                        <div><span>Name</span><b>{name || signedInName}</b></div>
                        <div><span>Email</span><b>{email || '—'}</b></div>
                        {phone && <div><span>Phone</span><b>{phone}</b></div>}
                        <p>This RSVP is for you only. To bring a colleague who is not a member, they register separately at the doctor or student rate.</p>
                      </div>
                      {ceOffered && cePrice > 0 && (
                        <label className={`rsvp-ce${wantCE ? ' on' : ''}`}>
                          <input type="checkbox" checked={wantCE} onChange={(e) => setWantCE(e.target.checked)} />
                          <span className="rt-l">
                            <b>Add CE credit certificate — {formatPrice(cePrice)}</b>
                            <i>{ceHours ? `${ceHours} through ${overlay?.event?.ce_school ?? 'the CE sponsor'}. ` : ''}Sign in and out of every session at the event to receive credit.</i>
                          </span>
                        </label>
                      )}
                    </>
                  ) : signedIn ? (
                    <div className="reg-auth">
                      <svg
                        width="18"
                        height="18"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2.4"
                      >
                        <path d="M20 6 9 17l-5-5" />
                      </svg>
                      <span>
                        Signed in as <b>{signedInName}</b> — member pricing applies automatically.
                      </span>
                    </div>
                  ) : memberStrip ? (
                    <div className="reg-strip">
                      <span>{memberStrip}</span>
                      <button
                        type="button"
                        className="b sm s-btn on-light"
                        style={{ padding: '8px 14px', fontSize: '10.5px' }}
                        onClick={() => goTo('/account')}
                      >
                        Sign In
                      </button>
                    </div>
                  ) : null}

                  {!rsvpMode && tiers.length > 1 && (
                    <fieldset className="reg-fieldset">
                      <legend className="flabel">I AM REGISTERING AS</legend>
                      <div className="rtiers">
                        {tiers.map((option) => (
                          <label
                            className={`rt-opt${tier === option.v ? ' on' : ''}`}
                            key={option.v}
                          >
                            <input
                              type="radio"
                              name="reg-tier"
                              value={option.v}
                              checked={tier === option.v}
                              onChange={() => {
                                setTier(option.v)
                                setError(null)
                              }}
                            />
                            <span className="rt-dot" />
                            <span className="rt-l">
                              <b>{option.k}</b>
                              <i>{option.n}</i>
                            </span>
                            <span className="rt-pr">{option.p}</span>
                          </label>
                        ))}
                      </div>
                    </fieldset>
                  )}

                  {!rsvpMode && <>
                  <label className={`flabel${badField('name')}`} htmlFor="reg-name">
                    FULL NAME
                  </label>
                  <input
                    className={`fi${badField('name')}`}
                    id="reg-name"
                    name="name"
                    autoComplete="name"
                    placeholder="Dr. Jane Smith, D.C."
                    value={name}
                    onChange={(e) => {
                      setName(e.target.value)
                      setError(null)
                    }}
                  />

                  <label className={`flabel${badField('email')}`} htmlFor="reg-email">
                    EMAIL
                  </label>
                  <input
                    className={`fi${badField('email')}`}
                    id="reg-email"
                    name="email"
                    type="email"
                    autoComplete="email"
                    placeholder="you@practice.com"
                    value={email}
                    onChange={(e) => {
                      setEmail(e.target.value)
                      setError(null)
                    }}
                  />

                  <label className="flabel" htmlFor="reg-phone">
                    PHONE (OPTIONAL)
                  </label>
                  <input
                    className="fi"
                    id="reg-phone"
                    name="phone"
                    autoComplete="tel"
                    placeholder="(555) 555-5555"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                  />
                  </>}

                  {error && (
                    <div id="reg-err" role="alert" style={{ display: 'block' }}>
                      {error.message}
                    </div>
                  )}

                  <div className="reg-summary">
                    {rsvpMode
                      ? (wantCE ? <>Your seat is free. <b>{formatPrice(cePrice)}</b> for the CE certificate is paid securely at checkout.</> : <>Nothing to pay — <b>your seat is included</b> with membership.</>)
                      : <>Pricing is confirmed securely at checkout — <b>members are automatically discounted</b> when signed in.</>}
                  </div>
                  <div style={{ marginTop: '20px', display: 'grid', gap: '10px' }}>
                    <button
                      type="submit"
                      className="b p-btn"
                      style={{ justifyContent: 'center' }}
                      disabled={busy}
                    >
                      {busy ? 'One moment…' : rsvpMode ? (wantCE ? `RSVP & Pay ${formatPrice(cePrice)} for CE` : 'RSVP — I\u2019m Attending') : 'Continue to Secure Checkout'}
                    </button>
                  </div>
                  {(!rsvpMode || wantCE) && (
                    <p className="reg-fineprint">
                      Payments are processed by Stripe. Card details never touch this site.
                      {!rsvpMode && <> {refundLine(overlay?.event?.starts_at)}</>}
                    </p>
                  )}
                </form>
              )}
            </div>
          </div>
        )}
      </dialog>
    </RegistrationContext.Provider>
  )
}
