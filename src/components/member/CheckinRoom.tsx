/* ----------------------------------------------------------------------------
 * Check-in room — Eventbrite-style, phone first.
 *
 * Opened from an event in the Events tab ("Go to check-in"). Full screen; on a
 * phone it is one list with a sheet that slides up for a person, on a laptop
 * the list sits beside a person panel and the day's log. Each row answers the
 * two questions the desk has: are they here, and do they owe anything? Line 1
 * is how they got on the list; line 2 is their CE. Checking in someone whose
 * CE isn't paid asks the question on the spot and, on a yes, emails a $50 pay
 * link. Door walk-ups: a member is seated free, anyone else is registered and
 * emailed the ticket link. Every write goes through a gated RPC.
 * -------------------------------------------------------------------------- */
import { friendlyError } from '@/lib/friendlyError'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useToast } from '@/components/ui/Toast'
import {
  roster, setCheckin, walkup, setRole, sendPayLink, eventDays, todayIn, dayLabel, shortDate, clock, money,
  statusLine, ceLine, canBuyCE, needsPayment,
} from '@/lib/queries/checkin'
import type { Roster, Row, PayLinkResult } from '@/lib/queries/checkin'

type Filter = 'expected' | 'out' | 'in' | 'owes' | 'roles' | 'awaiting'
const FILTERS: [Filter, string][] = [['expected', 'Expected'], ['out', 'Not here yet'], ['in', 'Checked in'], ['owes', 'Owes payment'], ['roles', 'Speakers & sponsors'], ['awaiting', 'Members not RSVP’d']]
const first = (n: string) => n.replace(/^dr\.?\s+/i, '').split(/[\s,]+/)[0] ?? n

export default function CheckinRoom({ eventId, onClose }: { eventId: number; onClose: () => void }) {
  const toast = useToast()
  const [data, setData] = useState<Roster | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const [day, setDay] = useState<string>('')
  const [q, setQ] = useState('')
  const [f, setF] = useState<Filter>('expected')
  const [sel, setSel] = useState<string | null>(null)
  const [ask, setAsk] = useState<Row | null>(null)
  const [walk, setWalk] = useState(false)
  const [busy, setBusy] = useState<string | null>(null)
  const [links, setLinks] = useState<Record<string, PayLinkResult & { at: string }>>({})
  const wide = useWide()

  const load = useCallback(async () => {
    const r = await roster(eventId)
    if (!r) { setErr('Could not load the attendee list — check-in is for Directors, the Executive Director and the Seminar chair.'); return }
    setErr(null); setData(r)
  }, [eventId])
  useEffect(() => { void load(); const t = setInterval(() => void load(), 20000); return () => clearInterval(t) }, [load])
  useEffect(() => {
    if (!data || day) return
    const days = eventDays(data.event), today = todayIn(data.event.timezone)
    setDay(days.includes(today) ? today : days[0] ?? today)
  }, [data, day])
  useEffect(() => { const k = (e: KeyboardEvent) => { if (e.key === 'Escape') { if (ask) setAsk(null); else if (walk) setWalk(false); else if (sel && !wide) setSel(null); else onClose() } }; document.addEventListener('keydown', k); return () => document.removeEventListener('keydown', k) }, [ask, walk, sel, wide, onClose])
  useEffect(() => { document.body.style.overflow = 'hidden'; return () => { document.body.style.overflow = '' } }, [])

  const ev = data?.event
  const days = ev ? eventDays(ev) : []
  const rows = data?.rows ?? []
  const inToday = (r: Row) => r.checkins.find((c) => c.day === day)
  const expected = rows.filter((r) => r.status !== 'awaiting')
  const here = expected.filter(inToday).length + rows.filter((r) => r.status === 'awaiting' && inToday(r)).length
  const ceCount = rows.filter((r) => r.ce === 'included' || r.ce === 'paid').length
  const owes = rows.filter((r) => needsPayment(r)).length

  const shown = useMemo(() => {
    const t = q.trim().toLowerCase()
    return rows.filter((r) => {
      if (t && !`${r.name} ${r.practice ?? ''} ${r.email ?? ''}`.toLowerCase().includes(t)) return false
      if (t) return true // a search looks everywhere, members not yet RSVP'd included
      switch (f) {
        case 'expected': return r.status !== 'awaiting'
        case 'out': return r.status !== 'awaiting' && !inToday(r)
        case 'in': return !!inToday(r)
        case 'owes': return needsPayment(r) || r.ce === 'link_sent'
        case 'roles': return r.speaker || r.sponsor
        case 'awaiting': return r.status === 'awaiting'
      }
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, q, f, day])
  const selected = rows.find((r) => r.key === sel) ?? null

  async function doCheckin(r: Row, on = true) {
    if (!ev) return
    setBusy(r.key)
    const x = await setCheckin(ev.id, r, day, on)
    setBusy(null)
    if (x.error) { toast(friendlyError(x.error)); return }
    toast(on ? `${first(r.name)} checked in` : `${first(r.name)} — check-in undone`)
    await load()
    if (r.key.startsWith('p:') && x.data) setSel((s) => (s === r.key ? `r:${x.data}` : s))
  }
  /** Tapping Check in on someone with no CE asks the question the desk would ask. */
  function onTap(r: Row) {
    if (inToday(r)) { void doCheckin(r, false); return }
    if (ev?.ce_credits && canBuyCE(r) && r.status !== 'pending') { setAsk(r); return }
    void doCheckin(r)
  }
  async function link(r: Row, kind: 'ce' | 'registration', regId?: string, email?: string) {
    const id = regId ?? r.reg_id
    if (!id) { toast('Check them in first — that creates their seat.'); return }
    setBusy('link:' + r.key)
    const x = await sendPayLink(id, kind, email)
    setBusy(null)
    if (x.error || !x.url) { toast(x.detail ?? 'Could not create the link: ' + (x.error ?? 'unknown')); return }
    setLinks((m) => ({ ...m, [id]: { ...x, at: new Date().toISOString() } }))
    toast(x.emailed ? `Payment link emailed to ${x.email}` : 'Link ready — email is not switched on yet, so copy or text it')
    await load()
  }
  async function checkinWithCE(r: Row) {
    if (!ev) return
    setAsk(null); setBusy(r.key)
    const x = await setCheckin(ev.id, r, day, true)
    setBusy(null)
    if (x.error || !x.data) { toast('The check-in did not go through. ' + friendlyError(x.error)); return }
    await link(r, 'ce', x.data)
    setSel(`r:${x.data}`)
  }

  if (err) return <div className="cr"><div className="cr-top"><div className="cr-bar"><button type="button" className="cr-back" onClick={onClose}>‹ Events</button></div></div><div className="cr-empty">{err}</div></div>
  if (!data || !ev) return <div className="cr"><div className="cr-top"><div className="cr-bar"><button type="button" className="cr-back" onClick={onClose}>‹ Events</button></div></div><div className="cr-empty">Loading the attendee list…</div></div>

  return (
    <div className="cr" role="dialog" aria-modal="true" aria-label={`Check-in — ${ev.title}`}>
      <div className="cr-top">
        <div className="cr-bar"><button type="button" className="cr-back" onClick={onClose}>‹ Events</button><span className="cr-lab">Check-in</span><button type="button" className="cr-back" onClick={() => void load()}>Refresh</button></div>
        <h3>{ev.title}</h3>
        <div className="cr-where">{ev.location}</div>
        {days.length > 1 && <div className="cr-days">{days.map((d) => <button type="button" key={d} className={d === day ? 'on' : ''} onClick={() => setDay(d)}>{dayLabel(d)}</button>)}</div>}
        <div className="cr-prog"><div className="n"><span><b>{here}</b> checked in</span><span><b>{expected.length}</b> expected · <b>{ceCount}</b> CE{owes ? <> · <b className="w">{owes}</b> owe</> : null}</span></div><div className="bar"><i style={{ width: `${expected.length ? Math.min(100, (here / expected.length) * 100) : 0}%` }} /></div></div>
      </div>

      <div className="cr-body">
        <div className="cr-main">
          <div className="cr-search"><input placeholder="Search by name, practice or email" value={q} onChange={(e) => setQ(e.target.value)} />{wide && <button type="button" className="b p-btn" onClick={() => setWalk(true)}>+ Walk-up</button>}</div>
          <div className="cr-filters">{FILTERS.map(([k, l]) => <button type="button" key={k} className={f === k && !q ? 'on' : ''} onClick={() => { setF(k); setQ('') }}>{l}</button>)}</div>
          <div className="cr-list">
            {shown.length === 0 && <div className="cr-empty">{q ? 'No one matches. Use Walk-up to add them.' : 'No one here.'}</div>}
            {shown.map((r) => {
              const ci = inToday(r), ce = ceLine(r)
              return (
                <div key={r.key} className={`cr-row${ci ? ' in' : ''}${sel === r.key ? ' sel' : ''}`}>
                  <button type="button" className="who" onClick={() => setSel(r.key)}>
                    <span className="nm">{r.name}</span>
                    <span className="tags"><Tags r={r} /></span>
                    <span className="l1">{statusLine(r)}</span>
                    <span className={`l2 ${ce.kind}`}>{ce.text}</span>
                  </button>
                  {ci
                    ? <button type="button" className="ck done" disabled={busy === r.key} onClick={() => onTap(r)}>✓ {clock(ci.at)}<small>tap to undo</small></button>
                    : <button type="button" className={`ck${r.status === 'awaiting' ? ' seat' : ''}`} disabled={busy === r.key} onClick={() => onTap(r)}>{busy === r.key ? '…' : r.status === 'awaiting' ? 'Seat & check in' : 'Check in'}</button>}
                </div>
              )
            })}
          </div>
        </div>

        {wide && (
          <aside className="cr-side">
            {selected ? <Person r={selected} day={day} days={days} ev={data.event} busy={busy} links={links} onCheck={onTap} onLink={link} onRole={async (role) => { if (!selected.reg_id) return; const x = await setRole(selected.reg_id, role); if (x.error) toast(x.error); await load() }} />
              : <div className="cr-hint">Tap a name to see their registration, membership and CE, and to send a payment link.</div>}
            <Log data={data} />
          </aside>
        )}
      </div>

      {!wide && <div className="cr-fab"><button type="button" className="b p-btn" onClick={() => setWalk(true)}>+ Walk-up</button></div>}

      {!wide && selected && (
        <Sheet onClose={() => setSel(null)}>
          <Person r={selected} day={day} days={days} ev={data.event} busy={busy} links={links} onCheck={onTap} onLink={link} onRole={async (role) => { if (!selected.reg_id) return; const x = await setRole(selected.reg_id, role); if (x.error) toast(x.error); await load() }} />
        </Sheet>
      )}

      {ask && (
        <Sheet onClose={() => setAsk(null)} center>
          <h4>Does {first(ask.name)} want CE credit?</h4>
          <p className="cr-p">{ask.status === 'awaiting' || ask.status === 'rsvp' ? 'Their seat is included with membership.' : ask.speaker ? 'Their seat is complimentary as a speaker.' : 'Their seat is covered.'} The CE certificate is {money(Math.round(Number(ev.ce_price ?? 0) * 100))}. A yes checks them in and emails a secure link{ask.email ? ` to ${ask.email}` : ''} they can pay from their phone right here.</p>
          <div className="cr-2">
            <button type="button" className="b s-btn on-light" onClick={() => { const r = ask; setAsk(null); void doCheckin(r) }}>No — just check in</button>
            <button type="button" className="b p-btn" disabled={!ask.email} onClick={() => void checkinWithCE(ask)}>Yes — check in &amp; email link</button>
          </div>
          {!ask.email && <p className="cr-p warn">No email on file — check them in, then add CE from their card.</p>}
        </Sheet>
      )}

      {walk && <Walkup rows={rows} ev={data.event} day={day} onClose={() => setWalk(false)} onSeat={async (r) => { setWalk(false); await doCheckin(r); setSel(null) }}
        onNew={async (name, email, phone, t) => {
          const x = await walkup(ev.id, name, email, phone, t)
          if (x.error || !x.data) { toast(x.error ?? 'Could not register'); return false }
          await setCheckin(ev.id, { key: `r:${x.data}`, reg_id: x.data } as Row, day, true)
          const l = await sendPayLink(x.data, 'registration')
          if (l.url) setLinks((m) => ({ ...m, [x.data!]: { ...l, at: new Date().toISOString() } }))
          toast(l.emailed ? `${first(name)} is checked in — payment link emailed` : `${first(name)} is checked in — copy the payment link from their card`)
          await load(); setWalk(false); setSel(`r:${x.data}`)
          return true
        }} />}
    </div>
  )
}

/* ------------------------------------------------------------ person card */
function Person({ r, day, days, ev, busy, links, onCheck, onLink, onRole }: {
  r: Row; day: string; days: string[]; ev: Roster['event']; busy: string | null; links: Record<string, PayLinkResult & { at: string }>
  onCheck: (r: Row) => void; onLink: (r: Row, kind: 'ce' | 'registration') => void; onRole: (role: 'sponsor' | null) => void
}) {
  const ci = r.checkins.find((c) => c.day === day)
  const ce = ceLine(r)
  const l = r.reg_id ? links[r.reg_id] : undefined
  const url = l?.url
  const cePrice = Math.round(Number(ev.ce_price ?? 0) * 100)
  return (
    <div className="cr-person">
      <h4>{r.name}</h4>
      <div className="tags"><Tags r={r} /></div>
      <div className="kv">
        <span>On the list</span><div>{statusLine(r)}</div>
        {r.member && <><span>Membership</span><div>{r.membership_expires ? `Through ${shortDate(r.membership_expires)}` : 'Current'}{r.last_renewed ? ` · renewed ${shortDate(r.last_renewed)}` : ''}</div></>}
        {r.speaker && r.talks && <><span>Speaking</span><div>{r.talks}</div></>}
        {r.practice && <><span>Practice</span><div>{r.practice}{r.place ? ` · ${r.place}` : ''}</div></>}
        {r.email && <><span>Email</span><div><a href={`mailto:${r.email}`}>{r.email}</a></div></>}
        {r.phone && <><span>Phone</span><div><a href={`tel:${r.phone}`}>{r.phone}</a></div></>}
      </div>

      {!(needsPayment(r) && r.ce === 'with_payment') && <div className={`cr-ce ${ce.kind}`}>
        <div><b>{ce.text}</b>{canBuyCE(r) && ev.ce_credits ? <small>Certificate {money(cePrice)} — emailed as a secure link they can pay right away.</small> : null}</div>
        {canBuyCE(r) && ev.ce_credits && r.reg_id && <button type="button" className="b p-btn sm" disabled={busy === 'link:' + r.key || !r.email} onClick={() => onLink(r, 'ce')}>{r.ce === 'link_sent' ? 'Resend' : 'Email'} {money(cePrice)} CE link</button>}
        {canBuyCE(r) && ev.ce_credits && !r.reg_id && <small>Check them in first — then the CE link can be sent.</small>}
      </div>}
      {needsPayment(r) && r.reg_id && (
        <div className="cr-ce warn">
          <div><b>Ticket not paid — {money(r.price_paid_cents)}</b><small>{r.pay_link_sent_at ? `Link sent ${clock(r.pay_link_sent_at)}.` : 'No link sent yet.'} CE is included once it clears.</small></div>
          <button type="button" className="b p-btn sm" disabled={busy === 'link:' + r.key} onClick={() => onLink(r, 'registration')}>{r.pay_link_sent_at ? 'Resend' : 'Email'} payment link</button>
        </div>
      )}
      {url && (
        <div className="cr-linkout">
          <span>{l?.emailed ? `Emailed to ${l.email} at ${clock(l.at)}.` : 'Email is not switched on yet — share it directly:'}</span>
          <div className="cr-2">
            <button type="button" className="b s-btn on-light sm" onClick={() => { void navigator.clipboard?.writeText(url) }}>Copy link</button>
            {r.phone ? <a className="b s-btn on-light sm" href={`sms:${r.phone.replace(/[^\d+]/g, '')}?&body=${encodeURIComponent(`Advanced Orthogonal Institute — pay here: ${url}`)}`}>Text it</a> : <a className="b s-btn on-light sm" href={url} target="_blank" rel="noreferrer">Open on this device</a>}
          </div>
        </div>
      )}

      <div className="cr-days-list">
        {days.map((d) => { const c = r.checkins.find((x) => x.day === d); return <div key={d} className={d === day ? 'cur' : ''}><span>{dayLabel(d)}</span><b>{c ? `✓ ${clock(c.at)}${c.by ? ` · ${c.by}` : ''}` : '—'}</b></div> })}
      </div>
      <button type="button" className={`b ${ci ? 's-btn on-light' : 'p-btn'} cr-big`} disabled={busy === r.key} onClick={() => onCheck(r)}>{ci ? `Undo ${dayLabel(day)} check-in` : r.status === 'awaiting' ? `Seat & check in — ${dayLabel(day)}` : `Check in — ${dayLabel(day)}`}</button>
      {r.reg_id && !r.speaker && <button type="button" className="flink" style={{ marginTop: 10 }} onClick={() => onRole(r.sponsor ? null : 'sponsor')}>{r.sponsor ? 'Remove sponsor label' : 'Mark as sponsor'}</button>}
      {r.notes && <p className="cr-p" style={{ marginTop: 10 }}>{r.notes}</p>}
    </div>
  )
}

function Tags({ r }: { r: Row }) {
  return <><span className={`cpill ${r.member ? 'cert' : ''}`}>{r.member ? 'Member' : 'Non-member'}</span>{r.speaker && <span className="cpill dec">Speaker</span>}{r.sponsor && <span className="cpill dec">Sponsor</span>}</>
}

function Log({ data }: { data: Roster }) {
  if (!data.log.length) return null
  return <div className="cr-log"><div className="cr-lab">Check-in log</div>{data.log.slice(0, 12).map((l, i) => <div key={i}>{clock(l.at)} · {l.name}{l.by ? ` · by ${l.by}` : ''}</div>)}</div>
}

function Sheet({ children, onClose, center }: { children: React.ReactNode; onClose: () => void; center?: boolean }) {
  return <div className="cr-veil" onClick={(e) => e.target === e.currentTarget && onClose()}><div className={`cr-sheet${center ? ' center' : ''}`}><div className="grab" onClick={onClose} />{children}</div></div>
}

/* --------------------------------------------------------------- walk-up */
function Walkup({ rows, ev, onClose, onSeat, onNew }: {
  rows: Row[]; ev: Roster['event']; day: string; onClose: () => void; onSeat: (r: Row) => Promise<void>
  onNew: (name: string, email: string, phone: string, t: 'doctor' | 'student') => Promise<boolean>
}) {
  const [q, setQ] = useState('')
  const [name, setName] = useState(''), [email, setEmail] = useState(''), [phone, setPhone] = useState('')
  const [busy, setBusy] = useState(false)
  const hits = rows.filter((r) => r.status === 'awaiting' && q.trim().length > 1 && r.name.toLowerCase().includes(q.trim().toLowerCase())).slice(0, 5)
  const price = (t: 'doctor' | 'student') => money(Math.round(Number(t === 'student' ? ev.student_price : ev.price) * 100))
  const go = async (t: 'doctor' | 'student') => { setBusy(true); await onNew(name, email, phone, t); setBusy(false) }
  const valid = name.trim().length > 1 && /^[^@\s]+@[^@\s]+\.[^@\s]{2,}$/.test(email.trim())
  return (
    <Sheet onClose={onClose}>
      <h4>Walk-up</h4>
      {ev.free_with_membership && <>
        <div className="cr-lab" style={{ marginTop: 10 }}>A member</div>
        <input className="fi" placeholder="Type a member's name…" value={q} onChange={(e) => setQ(e.target.value)} />
        {hits.map((r) => <div key={r.key} className="cr-pick"><div><b>{r.name}</b><small>Member{r.membership_expires ? ` through ${shortDate(r.membership_expires)}` : ''} · seat included</small></div><button type="button" className="b p-btn sm" onClick={() => void onSeat(r)}>Seat &amp; check in</button></div>)}
        {q.trim().length > 1 && hits.length === 0 && <p className="cr-p">No current member by that name who isn’t already on the list.</p>}
      </>}
      <div className="cr-lab" style={{ marginTop: 16 }}>Not a member — register now</div>
      <input className="fi" placeholder="Full name, e.g. Dr. Jane Smith, DC" value={name} onChange={(e) => setName(e.target.value)} />
      <input className="fi" type="email" placeholder="Email — the payment link goes here" value={email} onChange={(e) => setEmail(e.target.value)} />
      <input className="fi" type="tel" placeholder="Mobile (optional)" value={phone} onChange={(e) => setPhone(e.target.value)} />
      <div className="cr-2">
        <button type="button" className="b p-btn" disabled={!valid || busy} onClick={() => void go('doctor')}>Doctor · {price('doctor')}</button>
        {ev.student_price != null && <button type="button" className="b s-btn on-light" disabled={!valid || busy} onClick={() => void go('student')}>Student · {price('student')}</button>}
      </div>
      <p className="cr-p">They’re checked in now and emailed a secure payment link for the full ticket (CE included). The row stays amber until Stripe confirms the payment.</p>
    </Sheet>
  )
}

function useWide() {
  const q = '(min-width: 980px)'
  const [w, setW] = useState(() => typeof window !== 'undefined' && window.matchMedia(q).matches)
  useEffect(() => { const m = window.matchMedia(q); const h = () => setW(m.matches); m.addEventListener('change', h); return () => m.removeEventListener('change', h) }, [])
  return w
}
