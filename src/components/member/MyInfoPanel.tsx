/* ----------------------------------------------------------------------------
 * Personal Information — a member's own name, birthday, emails, phones and
 * home address. None of it is public.
 *
 * Reads the member's own `people` row and saves through `update_my_info`, a
 * database function that changes only these fields on the signed-in member's
 * row. Until the function exists, saving says so and offers the contact form.
 *
 * Emails: the main email is the sign-in address and changes through Supabase
 * Auth, which mails a confirmation link first. The other email is the first of
 * `other_emails`. The public email is the clinic's, under Business Information.
 *
 * Sharing: each "Share with other members" box decides what the Member
 * Directory shows of this person. All start unticked (#67).
 * -------------------------------------------------------------------------- */
import { useEffect, useState } from 'react'
import { Link } from '@/lib/router'
import PhotoCard from './PhotoCard'
import { useAccess } from '@/lib/queries/AccessProvider'
import { select, ensureSession, headers, session, SB_URL } from '@/lib/supabase'

type Form = {
  first: string; last: string; credentials: string; birthday: string; mobile: string; personal: string
  address: string; city: string; state: string; zip: string
}
const EMPTY: Form = { first: '', last: '', credentials: '', birthday: '', mobile: '', personal: '', address: '', city: '', state: '', zip: '' }

/** What other members may see; matches the share_* columns on people. */
type Share = { email: boolean; other_emails: boolean; mobile: boolean; home_phone: boolean; home_address: boolean }
const NONE: Share = { email: false, other_emails: false, mobile: false, home_phone: false, home_address: false }

type Own = {
  first_name: string | null; last_name: string | null; credentials: string | null; email: string | null; mobile_phone: string | null; personal_phone: string | null
  date_of_birth: string | null; mail_address_line1: string | null; mail_city: string | null; mail_region: string | null; mail_postal_code: string | null; other_emails: string[] | null
}
type Shared = { share_email: boolean; share_other_emails: boolean; share_mobile: boolean; share_home_phone: boolean; share_home_address: boolean }

const looksLikeEmail = (s: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s.trim())
const missingFn = (status: number, text: string) => status === 404 || text.includes('PGRST202') || text.includes('PGRST205')

/** Supabase Auth mails a confirmation link to the new address; the sign-in changes when it is clicked. */
async function changeSignInEmail(email: string): Promise<{ ok?: true; error?: string }> {
  await ensureSession()
  const res = await fetch(`${SB_URL}/auth/v1/user?redirect_to=${encodeURIComponent(`${window.location.origin}/account`)}`, {
    method: 'PUT',
    headers: headers(true),
    body: JSON.stringify({ email: email.trim() }),
  })
  if (res.ok) return { ok: true }
  try { const j = await res.json(); return { error: String(j.msg ?? j.message ?? j.error_description ?? res.status) } } catch { return { error: String(res.status) } }
}

async function saveInfo(v: Form, others: string[], sh: Share): Promise<{ ok?: true; missing?: true; error?: string }> {
  await ensureSession()
  const res = await fetch(`${SB_URL}/rest/v1/rpc/update_my_info`, {
    method: 'POST',
    headers: headers(true),
    body: JSON.stringify({
      p_first_name: v.first, p_last_name: v.last, p_credentials: v.credentials, p_birthday: v.birthday || null,
      p_mobile_phone: v.mobile, p_personal_phone: v.personal,
      p_home_address: v.address, p_home_city: v.city, p_home_state: v.state.toUpperCase(), p_home_zip: v.zip,
      p_other_emails: others.map((e) => e.trim().toLowerCase()).filter(Boolean),
      p_share_email: sh.email, p_share_other_emails: sh.other_emails, p_share_mobile: sh.mobile,
      p_share_home_phone: sh.home_phone, p_share_home_address: sh.home_address,
    }),
  })
  if (res.ok) return { ok: true }
  const text = await res.text()
  return missingFn(res.status, text) ? { missing: true } : { error: text }
}

export default function MyInfoPanel() {
  const { access } = useAccess()
  const id = access.person?.id
  const [v, setV] = useState<Form>(EMPTY)
  const [login, setLogin] = useState('')
  const [main, setMain] = useState('')
  // The first other email is editable; any more (from merged records) are kept as they are.
  const [others, setOthers] = useState<string[]>([''])
  const [share, setShare] = useState<Share>(NONE)
  const [loginMsg, setLoginMsg] = useState<{ ok: boolean; text: string } | null>(null)
  const [state, setState] = useState<'loading' | 'ready' | 'saving' | 'saved' | 'missing' | 'error'>('loading')
  const [err, setErr] = useState('')

  useEffect(() => {
    if (!id) return
    void (async () => {
      await ensureSession()
      const me = `id=eq.${id}`
      const [r, x] = await Promise.all([
        select<Own>('people', `select=first_name,last_name,credentials,email,mobile_phone,personal_phone,date_of_birth,mail_address_line1,mail_city,mail_region,mail_postal_code,other_emails&${me}`),
        // The sharing columns may not exist yet; an error just leaves every box unticked.
        select<Shared>('people', `select=share_email,share_other_emails,share_mobile,share_home_phone,share_home_address&${me}`),
      ])
      const p = r.data?.[0]
      const sh = x.data?.[0]
      const a = access.person
      setV({
        first: p?.first_name ?? a?.first_name ?? '', last: p?.last_name ?? a?.last_name ?? '', credentials: p?.credentials ?? a?.credentials ?? '',
        birthday: p?.date_of_birth ?? '', mobile: p?.mobile_phone ?? '', personal: p?.personal_phone ?? '',
        address: p?.mail_address_line1 ?? '', city: p?.mail_city ?? '', state: p?.mail_region ?? '', zip: p?.mail_postal_code ?? '',
      })
      if (sh) setShare({ email: sh.share_email, other_emails: sh.share_other_emails, mobile: sh.share_mobile, home_phone: sh.share_home_phone, home_address: sh.share_home_address })
      const signIn = session.user?.email ?? p?.email ?? a?.email ?? ''
      setLogin(signIn)
      setMain(signIn)
      const rest = (p?.other_emails ?? []).filter((e) => e.toLowerCase() !== signIn.toLowerCase())
      setOthers(rest.length ? rest : [''])
      setState('ready')
    })()
  }, [id])

  const busy = state === 'loading' || state === 'saving'
  const touch = () => { if (!busy) setState('ready') }
  const set = (k: keyof Form) => (e: React.ChangeEvent<HTMLInputElement>) => { setV({ ...v, [k]: e.target.value }); touch() }
  const shareBox = (k: keyof Share) => (
    <label className="mi-share">
      <input type="checkbox" checked={share[k]} onChange={(e) => { setShare({ ...share, [k]: e.target.checked }); touch() }} disabled={busy} /> Share with other members
    </label>
  )
  const cell = (k: keyof Form, label: string, cls: string, opts: { type?: string; placeholder?: string; share?: keyof Share } = {}) => (
    <div className={`ml-cell ${cls}`}>
      <label className="ml-lbl" htmlFor={`mi-${k}`}>{label}</label>
      <input id={`mi-${k}`} className="ml-in" type={opts.type ?? 'text'} value={v[k]} onChange={set(k)} placeholder={opts.placeholder} disabled={busy} />
      {opts.share && shareBox(opts.share)}
    </div>
  )
  const emailCell = (i: 0 | 1, label: string) => (
    <div className="ml-cell mi-c6">
      <label className="ml-lbl" htmlFor={`mi-email-${i}`}>{label}</label>
      <input id={`mi-email-${i}`} className="ml-in" type="email" value={i === 0 ? main : others[0] ?? ''}
        onChange={(e) => { if (i === 0) setMain(e.target.value); else setOthers([e.target.value, ...others.slice(1)]); touch() }}
        placeholder={i === 0 ? 'you@example.com' : 'Optional'} disabled={busy} />
      {shareBox(i === 0 ? 'email' : 'other_emails')}
    </div>
  )

  async function save() {
    if (!v.first.trim() || !v.last.trim()) { setErr('First and last name are needed.'); setState('error'); return }
    const signIn = main.trim()
    if (!looksLikeEmail(signIn)) { setErr('Your main email needs to be a full email address.'); setState('error'); return }
    const other = (others[0] ?? '').trim()
    if (other && !looksLikeEmail(other)) { setErr(`"${other}" doesn't look like an email address.`); setState('error'); return }
    setState('saving'); setErr(''); setLoginMsg(null)
    // A new main email is not changed directly: Supabase Auth mails a confirmation link first.
    const loginChanged = signIn.toLowerCase() !== login.toLowerCase()
    const [r, l] = await Promise.all([
      saveInfo(v, others, share),
      loginChanged ? changeSignInEmail(signIn) : Promise.resolve(null),
    ])
    if (l) setLoginMsg(l.ok ? { ok: true, text: `We sent a confirmation link to ${signIn}. You'll sign in with it once you click the link.` } : { ok: false, text: l.error ?? 'Could not start the email change.' })
    if (r.error) { setErr(r.error); setState('error') }
    else if (r.missing) setState('missing')
    else setState('saved')
  }

  return (
    <>
      <h1>Personal Information</h1>
      <div className="ma-sub">
        How the Institute reaches you. None of this is public. Tick "Share with other members" on anything you want
        members to see in the Member Directory; your clinic details are under{' '}
        <a href="#mylisting">Business Information</a>.
      </div>
      <div className="ma-panel">
        <PhotoCard />
        {state === 'error' && err && <div className="cert-err">{err}</div>}
        <div className="ml-table mi-table">
          {cell('first', 'First name', 'mi-c4')}
          {cell('last', 'Last name', 'mi-c4')}
          {cell('credentials', 'Credentials', 'mi-c2', { placeholder: 'DC' })}
          {cell('birthday', 'Birthday', 'mi-c2', { type: 'date' })}

          {emailCell(0, 'Main email · used to sign in')}
          {emailCell(1, 'Other email')}

          {cell('mobile', 'Mobile phone', 'mi-c6', { type: 'tel', share: 'mobile' })}
          {cell('address', 'Home address', 'mi-c6', { placeholder: 'Street', share: 'home_address' })}

          {cell('personal', 'Home phone', 'mi-c6', { type: 'tel', share: 'home_phone' })}
          {cell('city', 'City', 'mi-c3')}
          {cell('state', 'State', 'mi-c1')}
          {cell('zip', 'ZIP', 'mi-c2')}
        </div>
        {loginMsg && <div className={loginMsg.ok ? 'ml-ok mi-msg' : 'cert-err mi-msg'}>{loginMsg.text}</div>}
        <div className="ml-actions">
          <button type="button" className="b sm p-btn" onClick={() => void save()} disabled={busy}>
            {state === 'saving' ? 'Saving…' : 'Save personal information'}
          </button>
          {state === 'saved' && <span className="ml-ok">Saved.</span>}
          {state === 'missing' && (
            <span className="ml-wait">
              Saving from here is being switched on. Until then, <Link to="/contact">send us the change</Link> and we will update it.
            </span>
          )}
        </div>
      </div>
    </>
  )
}
