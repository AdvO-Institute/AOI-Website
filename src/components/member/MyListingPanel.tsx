/* ----------------------------------------------------------------------------
 * Business Information — a member's own entry in the public directory (Find a Doctor).
 *
 * Reads the member's own `people` row and saves through `update_my_listing`,
 * a database function that changes only the clinic fields of the signed-in
 * member's row — a member cannot touch their level or membership from here.
 * Until that function exists, saving says so and offers the contact form.
 * -------------------------------------------------------------------------- */
import { useEffect, useState } from 'react'
import { Link } from '@/lib/router'
import { useAccess } from '@/lib/queries/AccessProvider'
import { select, ensureSession, headers, SB_URL } from '@/lib/supabase'
import { CERT_LABEL } from '@/lib/chips'

type Own = {
  practice_name: string | null; practice_address: string | null; practice_city: string | null; practice_state: string | null
  practice_zip: string | null; practice_phone: string | null; office_phone: string | null; practice_website: string | null; cert_level: string | null
}
type Form = { name: string; address: string; city: string; state: string; zip: string; phone: string; email: string; website: string }

const EMPTY: Form = { name: '', address: '', city: '', state: '', zip: '', phone: '', email: '', website: '' }

/** Many records repeat ", City, ST 12345" on the street line; show just the street when the city and state boxes already hold it. */
function streetOnly(address: string | null, city: string | null, state: string | null): string {
  const a = (address ?? '').trim()
  if (!a || !city || !state) return a
  const tail = new RegExp(`,\\s*${city.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')},?\\s*${state}\\.?(\\s+[A-Za-z0-9 -]{3,10})?\\s*$`, 'i')
  return a.replace(tail, '').trim()
}

async function saveListing(v: Form, shareClinic: boolean): Promise<{ ok?: true; missing?: true; error?: string }> {
  await ensureSession()
  const res = await fetch(`${SB_URL}/rest/v1/rpc/update_my_listing`, {
    method: 'POST',
    headers: headers(true),
    body: JSON.stringify({ p_name: v.name, p_address: v.address, p_city: v.city, p_state: v.state.toUpperCase(), p_zip: v.zip, p_phone: v.phone, p_email: v.email.trim().toLowerCase(), p_website: v.website, p_share_clinic: shareClinic }),
  })
  if (res.ok) return { ok: true }
  const text = await res.text()
  if (res.status === 404 || text.includes('PGRST202')) return { missing: true }
  return { error: text }
}

export default function MyListingPanel() {
  const { access } = useAccess()
  const id = access.person?.id
  const [v, setV] = useState<Form>(EMPTY)
  const [level, setLevel] = useState<string | null>(null)
  // Clinic details start shared with other members (James, 2026-10-24).
  const [shareClinic, setShareClinic] = useState(true)
  const [state, setState] = useState<'loading' | 'ready' | 'saving' | 'saved' | 'missing' | 'error'>('loading')
  const [err, setErr] = useState('')

  useEffect(() => {
    if (!id) return
    void (async () => {
      await ensureSession()
      const [r, m] = await Promise.all([
        select<Own>('people', `select=practice_name,practice_address,practice_city,practice_state,practice_zip,practice_phone,office_phone,practice_website,cert_level&id=eq.${id}`),
        // practice_email and share_clinic are new; until they exist this leaves the defaults.
        select<{ practice_email: string | null; share_clinic: boolean }>('people', `select=practice_email,share_clinic&id=eq.${id}`),
      ])
      const p = r.data?.[0]
      if (p) {
        setV({ name: p.practice_name ?? '', address: streetOnly(p.practice_address, p.practice_city, p.practice_state), city: p.practice_city ?? '', state: p.practice_state ?? '', zip: p.practice_zip ?? '', phone: p.practice_phone ?? p.office_phone ?? '', email: m.data?.[0]?.practice_email ?? '', website: p.practice_website ?? '' })
        setLevel(p.cert_level)
        if (m.data?.[0]) setShareClinic(m.data[0].share_clinic)
      } else {
        // Fall back to what the members area already knows.
        const a = access.person
        setV({ ...EMPTY, name: a?.practice_name ?? '', city: a?.practice_city ?? '', state: a?.practice_state ?? '' })
        setLevel(a?.cert_level ?? null)
      }
      setState('ready')
    })()
  }, [id])

  const set = (k: keyof Form) => (e: React.ChangeEvent<HTMLInputElement>) => { setV({ ...v, [k]: e.target.value }); if (state !== 'loading') setState('ready') }
  const field = (k: keyof Form, label: string, opts: { full?: boolean; type?: string; placeholder?: string } = {}) => (
    <label className="ml-cell" htmlFor={`ml-${k}`}>
      <span className="ml-lbl">{label}</span>
      <input id={`ml-${k}`} className="ml-in" type={opts.type ?? 'text'} value={v[k]} onChange={set(k)} placeholder={opts.placeholder} disabled={state === 'loading' || state === 'saving'} />
    </label>
  )

  async function save() {
    if (v.email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.email.trim())) { setErr('The clinic email does not look like an email address.'); setState('error'); return }
    if (!v.name.trim() || !v.address.trim() || !v.city.trim() || !v.state.trim()) { setErr('Clinic name, street, city and state are needed for the directory.'); setState('error'); return }
    setState('saving'); setErr('')
    const r = await saveListing(v, shareClinic)
    if (r.ok) setState('saved')
    else if (r.missing) setState('missing')
    else { setErr(r.error ?? 'Could not save.'); setState('error') }
  }

  const levelText = level === 'level_2' || level === 'level_1' ? CERT_LABEL[level] : 'Member'

  return (
    <>
      <h1>Business Information</h1>
      <div className="ma-sub">
        Your clinic as patients see it in <Link to="/find-a-doctor">Find a Doctor</Link>. Every current member is listed; certified doctors show their level.
      </div>
      <div className="ma-panel">
        {state === 'error' && err && <div className="cert-err">{err}</div>}
        <div className="ml-table">
          {field('name', 'Clinic name')}
          {field('website', 'Website', { placeholder: 'yourclinic.com' })}
          <div className="ml-cell ml-ro" title="Your certification level is set by the Institute">
            <span className="ml-lbl">Listed as · set by the Institute</span>
            <span className="ml-val">{levelText}</span>
          </div>
          {field('address', 'Street address', { placeholder: '123 Main St, Suite 4' })}
          {field('city', 'City')}
          {field('state', 'State', { placeholder: 'FL' })}
          {field('zip', 'ZIP')}
          {field('phone', 'Clinic phone', { type: 'tel' })}
          {field('email', 'Clinic email', { type: 'email', placeholder: 'Shown to patients' })}
        </div>
        <label className="mi-share">
          <input type="checkbox" checked={shareClinic} onChange={(e) => { setShareClinic(e.target.checked); if (state !== 'loading') setState('ready') }} disabled={state === 'loading' || state === 'saving'} />{' '}
          Show my clinic details to other members in the Member Directory
        </label>
        <div className="ml-actions">
          <button type="button" className="b sm p-btn" onClick={() => void save()} disabled={state === 'loading' || state === 'saving'}>
            {state === 'saving' ? 'Saving…' : 'Save business information'}
          </button>
          {state === 'saved' && <span className="ml-ok">Saved. Find a Doctor shows the change right away.</span>}
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
