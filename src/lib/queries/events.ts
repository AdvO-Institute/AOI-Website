/* ----------------------------------------------------------------------------
 * Live event catalog.
 *
 * The prerendered HTML carries the content-module values, so a crawler and a
 * visitor with JavaScript disabled both see real dates and prices. In the
 * browser this overlays whatever `v_public_events` currently says, because the
 * database — not this repo — is the source of truth for what is charged and
 * whether registration is open.
 *
 * Ported from `dbSync()` in the v4.8 build with the same precedence rules.
 * -------------------------------------------------------------------------- */
import { SB_URL, SB_KEY, sbFetch } from '@/lib/supabase'
import { DB_SLUG, REG_SLUG, SEMINARS } from '@/content/seminars'
import { HUDDLE_SLUG } from '@/content/calendar'

export type PublicEvent = {
  id: number
  slug: string
  title?: string
  starts_at?: string | null
  ends_at?: string | null
  timezone?: string | null
  location?: string | null
  price?: number | string | null
  member_price?: number | string | null
  student_price?: number | string | null
  free_with_membership?: boolean
  faculty_free?: boolean
  ce_credits?: boolean
  ce_price?: number | string | null
  ce_mode?: string | null
  ce_school?: string | null
  seats_remaining?: number | string | null
  reg_closes?: string | null
  /** The event's speakers and timed sessions, as entered in the members area.
   *  Absent until the public view carries them; pages then keep their own list. */
  speakers?: PublicSpeaker[] | null
  sessions?: PublicSession[] | null
}

export type PublicSpeaker = { name: string; speaker_title?: string | null; is_keynote?: boolean | null; sort?: number | null }
export type PublicSession = { title?: string | null; starts_at?: string | null; speaker?: string | null; sort?: number | null }

export type EventOverlay = {
  event?: PublicEvent
  id: number | null
  open: boolean
  dates?: string
  loc?: string
  price?: string
  fullPrice?: number
  memPrice?: number
  /** Set when the hand-written banner would contradict live pricing. */
  suppressMbText?: boolean
  calendar?: { mo: string; dy: string; yr: string }
  seats?: string
  seatFlag?: string
  soldOut?: boolean
}

export type EventCatalog = {
  synced: boolean
  byKey: Record<string, EventOverlay>
}

/* ------------------------------------------------------------- formatting */

function parts(iso: string, tz?: string | null) {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return null
  const zone = tz || 'America/New_York'
  try {
    const fmt = new Intl.DateTimeFormat('en-US', {
      timeZone: zone,
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    })
    const out: Record<string, string> = {}
    for (const part of fmt.formatToParts(date)) out[part.type] = part.value
    if (out.year && out.month && out.day) {
      return { y: out.year, mo: out.month, d: String(Number(out.day)) }
    }
  } catch {
    /* fall through to UTC */
  }
  const MONTHS = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December',
  ]
  return {
    y: String(date.getUTCFullYear()),
    mo: MONTHS[date.getUTCMonth()]!,
    d: String(date.getUTCDate()),
  }
}

export function formatRange(a?: string | null, b?: string | null, tz?: string | null) {
  if (!a) return null
  const p1 = parts(a, tz)
  if (!p1) return null
  const p2 = b ? parts(b, tz) : null
  if (!p2 || (p2.y === p1.y && p2.mo === p1.mo && p2.d === p1.d)) {
    return `${p1.mo} ${p1.d}, ${p1.y}`
  }
  if (p2.y === p1.y && p2.mo === p1.mo) return `${p1.mo} ${p1.d}–${p2.d}, ${p1.y}`
  if (p2.y === p1.y) return `${p1.mo} ${p1.d} – ${p2.mo} ${p2.d}, ${p1.y}`
  return `${p1.mo} ${p1.d}, ${p1.y} – ${p2.mo} ${p2.d}, ${p2.y}`
}

function formatCalendar(a?: string | null, b?: string | null, tz?: string | null) {
  if (!a) return null
  const p1 = parts(a, tz)
  if (!p1) return null
  const p2 = b ? parts(b, tz) : null
  let mo = p1.mo.slice(0, 3).toUpperCase()
  let dy = p1.d
  if (p2 && p2.mo === p1.mo && p2.y === p1.y && p2.d !== p1.d) {
    dy = `${p1.d}–${p2.d}`
  } else if (p2 && (p2.mo !== p1.mo || p2.y !== p1.y)) {
    mo = `${mo}–${p2.mo.slice(0, 3).toUpperCase()}`
    dy = `${p1.d}–${p2.d}`
  }
  return { mo, dy, yr: p1.y }
}

export function formatPrice(value: unknown): string | null {
  if (value === null || value === undefined || value === '') return null
  const n = Number(value)
  if (!Number.isFinite(n)) return null
  return n <= 0 ? 'FREE' : `$${n.toLocaleString()}`
}

/* ------------------------------------------------------------------ fetch */

export async function fetchCatalog(): Promise<EventCatalog> {
  const byKey: Record<string, EventOverlay> = {}

  try {
    const res = await sbFetch(`${SB_URL}/rest/v1/v_public_events?select=*`, {
      headers: { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}` },
    })
    if (!res.ok) throw new Error(`sync ${res.status}`)
    const rows = (await res.json()) as PublicEvent[]
    if (!Array.isArray(rows)) throw new Error('sync shape')

    const bySlug: Record<string, PublicEvent> = {}
    for (const row of rows) if (row?.slug) bySlug[row.slug] = row

    for (const key of new Set([...Object.keys(DB_SLUG), ...Object.keys(REG_SLUG)])) {
      const slug = REG_SLUG[key] ?? DB_SLUG[key]
      const row = slug ? bySlug[slug] : undefined
      const base = SEMINARS[key.split(':')[0]!]

      // Not published in CCI OS means not sellable from the public site.
      if (!row) {
        byKey[key] = { id: null, open: false }
        continue
      }

      const overlay: EventOverlay = { event: row, id: row.id, open: true }

      // The Monthly Huddle never ends, so its pages keep their own monthly dates.
      if (slug !== HUDDLE_SLUG) {
        const when = formatRange(row.starts_at, row.ends_at, row.timezone)
        if (when) overlay.dates = when

        const cal = formatCalendar(row.starts_at, row.ends_at, row.timezone)
        if (cal) overlay.calendar = cal
      }

      const seats = row.seats_remaining
      if (seats === null || seats === undefined || !Number.isFinite(Number(seats))) {
        overlay.seats = 'Registration open'
      } else {
        const left = Number(seats)
        if (left <= 0) {
          overlay.seats = 'Sold out'
          overlay.soldOut = true
          overlay.seatFlag = 'SOLD OUT'
        } else {
          overlay.seats = left === 1 ? '1 seat left' : `${left} seats left`
          if (left <= 10) overlay.seatFlag = 'ALMOST FULL'
        }
      }

      if (row.location) overlay.loc = row.location

      // Money: the database decides what is charged.
      const full = Number(row.price)
      if (row.price !== null && row.price !== undefined && row.price !== '' && Number.isFinite(full)) {
        overlay.fullPrice = full
        const label = formatPrice(row.price)
        if (label) overlay.price = label
      }

      const effectiveFull = overlay.fullPrice ?? base?.fullPrice
      if (row.free_with_membership === true) {
        overlay.memPrice = 0
      } else {
        const member = Number(row.member_price)
        if (
          row.member_price !== null &&
          row.member_price !== undefined &&
          row.member_price !== '' &&
          Number.isFinite(member)
        ) {
          overlay.memPrice = member
        } else if (Number.isFinite(effectiveFull) && (effectiveFull ?? 0) > 0) {
          overlay.memPrice = Math.max(0, (effectiveFull ?? 0) - 200)
        }
      }

      // The hand-written member banner survives only while every dollar figure
      // it quotes is still the full price, the member price, or the difference.
      if (base?.mbText) {
        const quoted = String(base.mbText).match(/\$[\d,]+/g) ?? []
        const allowed = new Set<string>()
        const fp = overlay.fullPrice ?? base.fullPrice
        const mp = overlay.memPrice ?? base.memPrice
        for (const n of [fp, mp, Number.isFinite(fp) && Number.isFinite(mp) ? fp - (mp ?? 0) : null]) {
          if (n !== null && n !== undefined && Number.isFinite(n)) {
            allowed.add(`$${Number(n).toLocaleString()}`)
          }
        }
        if (quoted.some((q) => !allowed.has(q))) overlay.suppressMbText = true
      }

      byKey[key] = overlay
    }

    return { synced: true, byKey }
  } catch (error) {
    if (typeof console !== 'undefined') {
      console.warn('[AOI] catalog sync unavailable:', (error as Error).message)
    }
    return { synced: false, byKey }
  }
}
