/* ----------------------------------------------------------------------------
 * Member-area data.
 *
 * Every query goes through here rather than being issued from a component, so
 * a change of source or a cache rule touches one file. Each one is also
 * row-level-security gated in the database: if a person is not entitled to a
 * row, Postgres does not return it. The capability check in the UI decides
 * whether to ask; RLS decides whether to answer.
 * -------------------------------------------------------------------------- */
import { select, searchSelect, patch, session, SB_URL, SB_KEY } from '@/lib/supabase'

export type Registration = {
  id?: number
  payment_status?: string
  registration_status?: string
  price_paid_cents?: number
  created_at?: string
  discount_applied?: string
  reg_type?: string
  ce_credits?: boolean
  events?: { title?: string; starts_at?: string; location?: string; slug?: string } | null
}

export type Certification = {
  technique?: string
  level?: string
  cert_date?: string
  certificate_number?: string
}

export type Completion = {
  ce_hours?: number
  certificate_number?: string
  issued_at?: string
}

export type PublicEvent = {
  id: number
  slug: string
  title?: string
  starts_at?: string | null
  ends_at?: string | null
  location?: string | null
  price?: number | string | null
  seats_remaining?: number | string | null
  /** The rest arrive with `select=*`; each is absent if the view does not carry it. */
  timezone?: string | null
  member_price?: number | string | null
  free_with_membership?: boolean | null
  /** Timed sessions (the Monthly Huddle's monthly calls), once the view carries them. */
  sessions?: { starts_at?: string | null; ends_at?: string | null }[] | null
}

export type CommitteeReport = {
  id: string
  committee_id: number
  period_label?: string
  status?: string
  submitted_at?: string
  committees?: { name?: string } | null
}

export type BoardSeat = {
  id: string
  status?: string
  term_start?: string
  term_end?: string
  office?: string
  people?: { first_name?: string; last_name?: string } | null
}

export type DirectoryPerson = {
  id: string
  first_name?: string
  last_name?: string
  credentials?: string
  email?: string
  membership_status?: string
  cert_level?: string
  practice_city?: string
  practice_state?: string
}

const uid = () => session.user?.id ?? ''

export async function myRegistrations(): Promise<Registration[]> {
  const q = await select<Registration>(
    'event_registrations',
    'select=id,payment_status,registration_status,price_paid_cents,created_at,discount_applied,reg_type,ce_credits,' +
      `events(title,starts_at,location,slug)&auth_user_id=eq.${uid()}&order=created_at.desc`,
  )
  return q.data ?? []
}

/** A member cancels their own free RSVP. The row stays, marked canceled, so
 * the seat count and the history are both right. Paid registrations go
 * through `requestCancellation` instead — a refund is the Institute's call. */
export async function cancelMyRegistration(id: number): Promise<{ ok?: true; error?: string }> {
  return patch('event_registrations', `id=eq.${id}&auth_user_id=eq.${uid()}`, { registration_status: 'cancelled' })
}

/** Sends a cancellation request for a paid seminar through the contact form's
 * function, so it lands where the Institute already reads its mail. */
export async function requestCancellation(opts: { name: string; email: string; eventTitle: string; reason: string }): Promise<{ ok?: true; error?: string }> {
  const res = await fetch(`${SB_URL}/functions/v1/contact-submit`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', apikey: SB_KEY, Authorization: `Bearer ${session.token ?? SB_KEY}` },
    body: JSON.stringify({
      full_name: opts.name, email: opts.email,
      subject: `Cancellation request: ${opts.eventTitle}`,
      message: `${opts.name} would like to cancel their registration for ${opts.eventTitle}.${opts.reason ? `\n\nReason: ${opts.reason}` : ''}\n\nSent from the members area.`,
      company: '', page_url: window.location.origin + window.location.pathname,
    }),
  })
  const data = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string }
  return res.ok && data.ok ? { ok: true } : { error: data.error ?? `status ${res.status}` }
}

export async function myCertifications(personId: string): Promise<Certification[]> {
  const q = await select<Certification>(
    'person_certifications',
    `select=technique,level,cert_date,certificate_number&person_id=eq.${personId}`,
  )
  return q.data ?? []
}

export async function myCompletions(personId: string): Promise<Completion[]> {
  const q = await select<Completion>(
    'completions',
    `select=ce_hours,certificate_number,issued_at&person_id=eq.${personId}&order=issued_at.desc`,
  )
  return q.data ?? []
}

/** An event's Zoom link, asked for on its own so a refusal never blanks the
 *  rest of the Overview. Null when there is none or this person can't see it. */
export async function eventZoom(slug: string): Promise<string | null> {
  const q = await select<{ zoom_url: string | null }>('events', `select=zoom_url&slug=eq.${encodeURIComponent(slug)}&limit=1`)
  return q.data?.[0]?.zoom_url || null
}

export async function upcomingEvents(): Promise<PublicEvent[]> {
  const q = await select<PublicEvent>(
    'v_public_events',
    // Every column the view has, so timed sessions come along whenever it carries them.
    'select=*&order=starts_at',
  )
  return q.data ?? []
}

export async function committeeReports(): Promise<CommitteeReport[]> {
  const q = await select<CommitteeReport>(
    'committee_reports',
    'select=id,committee_id,period_label,status,submitted_at,committees(name)&order=submitted_at.desc',
  )
  return q.data ?? []
}

export async function boardSeats(): Promise<BoardSeat[]> {
  const q = await select<BoardSeat>(
    'board_service',
    'select=id,status,term_start,term_end,office,people(first_name,last_name)&order=term_end.desc',
  )
  return q.data ?? []
}

export async function directory(limit = 100): Promise<DirectoryPerson[]> {
  const q = await select<DirectoryPerson>(
    'people',
    'select=id,first_name,last_name,credentials,email,membership_status,cert_level,practice_city,practice_state' +
      `&order=last_name&limit=${limit}`,
  )
  return q.data ?? []
}

/* ------------------------------------------------------------ role admin -- */

export type RosterRow = {
  id: string
  first_name?: string
  last_name?: string
  email?: string
  person_roles?: { role_key: string; committee_id: number | null }[]
}

export async function roster(search: string): Promise<RosterRow[]> {
  const term = search.trim()
  const cols = 'select=id,first_name,last_name,email,person_roles(role_key,committee_id)&order=last_name'
  const q = term
    ? await searchSelect<RosterRow>('people', term, ['last_name', 'first_name', 'email'], 40, (f, n) => `${cols}&limit=${n}&${f}`)
    : await select<RosterRow>('people', `${cols}&limit=40&person_roles=not.is.null`)
  return q.data ?? []
}

export async function committees(): Promise<{ id: number; key: string; name: string }[]> {
  const q = await select<{ id: number; key: string; name: string }>(
    'committees',
    'select=id,key,name&active=is.true&order=sort',
  )
  return q.data ?? []
}
