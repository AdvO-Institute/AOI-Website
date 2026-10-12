/**
 * One way to show a date in the members area: en-US, "Oct 6, 2026".
 * With a time: "Oct 6, 2026 · 7:00 PM ET". Times are read in the Institute's
 * zone (America/New_York) unless an event names its own, and carry its short label.
 * Online events show in the viewer's own zone (`shownZone`).
 * A plain "YYYY-MM-DD" is a calendar day and never shifts with the viewer's zone.
 */
const ZONE_ABBR: Record<string, string> = {
  'America/New_York': 'ET',
  'America/Chicago': 'CT',
  'America/Denver': 'MT',
  'America/Los_Angeles': 'PT',
  'America/Phoenix': 'MST',
}
export const ET = 'America/New_York'
/** "ET", "CT", "MT", "PT"; for a zone outside the list, the browser's short name
 *  with daylight time folded in ("EDT" → "ET"), else e.g. "GMT+1". */
export function zoneAbbr(tz?: string | null, at: Date = new Date()): string {
  const zone = tz || ET
  if (ZONE_ABBR[zone]) return ZONE_ABBR[zone]!
  try {
    const name = new Intl.DateTimeFormat('en-US', { timeZone: zone, timeZoneName: 'short' })
      .formatToParts(at).find((p) => p.type === 'timeZoneName')?.value ?? ''
    return name.replace(/^([ECMP])[SD]T$/, '$1T').replace(/^AK[SD]T$/, 'AKT').replace(/^H[SD]T$/, 'HT')
  } catch {
    return ''
  }
}

/** The viewer's own time zone, from their computer or phone. */
export function viewerZone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || ET
  } catch {
    return ET
  }
}

/** An event with no venue that meets on Zoom (or says online/virtual). */
export function isOnline(e: { location?: string | null; location_id?: number | null; venue?: unknown; zoom_url?: string | null; has_zoom?: boolean | null }): boolean {
  if (e.venue || e.location_id) return false
  const where = (e.location ?? '').trim()
  if (where) return /zoom|online|virtual/i.test(where) // a written-in place means in person
  return !!(e.zoom_url || e.has_zoom)
}

/** The zone to show an event's times in: the viewer's own for an online event,
 *  the event's (the venue's) for one held in person. */
export const shownZone = (e: Parameters<typeof isOnline>[0] & { timezone?: string | null }): string =>
  isOnline(e) ? viewerZone() : e.timezone || ET

export function fmtDate(
  iso: string | null | undefined,
  opts: { time?: boolean; long?: boolean; tz?: string | null } = {},
): string {
  if (!iso) return ''
  const dayOnly = /^\d{4}-\d{2}-\d{2}$/.test(iso)
  const d = new Date(dayOnly ? `${iso}T12:00:00Z` : iso)
  if (Number.isNaN(d.getTime())) return ''
  const zone = dayOnly ? 'UTC' : opts.tz || ET
  const day = d.toLocaleDateString('en-US', {
    ...(opts.long ? { weekday: 'long', month: 'long' } : { month: 'short' }),
    day: 'numeric',
    year: 'numeric',
    timeZone: zone,
  })
  if (!opts.time || dayOnly) return day
  return `${day} · ${fmtTime(iso, zone)}`
}

/** Just the time, in the Institute's zone: "7:00 PM ET". */
export const fmtTime = (iso: string | null | undefined, tz?: string | null): string => {
  if (!iso) return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  const zone = tz || ET
  return `${d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', timeZone: zone })} ${zoneAbbr(zone, d)}`.trim()
}
