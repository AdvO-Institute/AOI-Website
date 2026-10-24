/* ----------------------------------------------------------------------------
 * The standing event calendar.
 *
 * The Board adopted these as rules, not dates: every recurring event falls on
 * an ordinal weekday ("third Friday of October"), so its dates are computed
 * here and nothing has to be retyped each year. The member database still
 * holds one event per weekend (price, seats, attendees); each event's slug is
 * built from its rule and year so the site finds it without being edited.
 *
 * Dates are worked out from `AS_OF`, the day the site was built, so the
 * calendar rolls forward with each deploy and the browser's first render
 * agrees with the prerendered HTML. A component that must show today's answer
 * recomputes after mount with the built value as its fallback.
 *
 * supabase/functions/roll-calendar creates the matching events from the same
 * rules; keep the two in step.
 * -------------------------------------------------------------------------- */

/** Stamped in by `scripts/build.mjs` (`define`); absent in the type check,
 *  the preview harnesses and any other bundle that does not set it. */
declare const __BUILD_DATE__: string | undefined

/** The day the site's computed dates are reckoned from.
 *
 *  The build stamps its own date (Eastern, `YYYY-MM-DD`) into both bundles, so a
 *  browser works out the same dates the build box did. Without this each
 *  browser used its own clock: the morning after any date passed, the
 *  prerendered HTML said one thing and the first client render another, and
 *  React 19 threw the page away and drew it again (a hydration mismatch).
 *
 *  Noon, local time, so the calendar's day-of-month math lands on the same
 *  day in every time zone. Where nothing is stamped, it is today. */
export const AS_OF: Date = typeof __BUILD_DATE__ === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(__BUILD_DATE__)
  ? new Date(`${__BUILD_DATE__}T12:00:00`)
  : new Date()

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']
const SHORT = MONTHS.map((m) => m.slice(0, 3))

export type Occurrence = { start: Date; end: Date; year: number }

export type Rule = {
  id: string
  event: string
  /** The rule as it reads to a visitor. */
  rule: string
  /** 0 = January. */
  month: number
  /** 0 = Sunday, 1 = Monday, 5 = Friday. */
  weekday: number
  nth: number
  days: number
  where: string
  venue: string
  /** Seminar page key the row links to. */
  page?: string
  /** Event slug in the member database, before `-<year>` (and `-<mon>`). */
  slug?: string
}

/** The nth given weekday of a month, as a local date. */
export function nthWeekday(year: number, month: number, weekday: number, nth: number): Date {
  const first = new Date(year, month, 1)
  const offset = (weekday - first.getDay() + 7) % 7
  return new Date(year, month, 1 + offset + (nth - 1) * 7)
}

export function occurrence(r: Rule, year: number): Occurrence {
  const start = nthWeekday(year, r.month, r.weekday, r.nth)
  const end = new Date(start.getFullYear(), start.getMonth(), start.getDate() + r.days - 1)
  return { start, end, year }
}

/** The rules take effect in 2027; the 2026 conference kept its November date. */
export const FIRST_YEAR = 2027

/** The next time a rule falls that has not finished yet. */
export function nextOccurrence(r: Rule, today = new Date()): Occurrence {
  const day = new Date(today.getFullYear(), today.getMonth(), today.getDate())
  const year = Math.max(FIRST_YEAR, day.getFullYear())
  const now = occurrence(r, year)
  return now.end >= day ? now : occurrence(r, year + 1)
}

/** "Feb 19–20" — one month, so it never spans. */
export function shortRange(o: Occurrence): string {
  return `${SHORT[o.start.getMonth()]} ${o.start.getDate()}–${o.end.getDate()}`
}

/** "February 19–20, 2027" */
export function longRange(o: Occurrence): string {
  return `${MONTHS[o.start.getMonth()]} ${o.start.getDate()}–${o.end.getDate()}, ${o.year}`
}

/** "advo-intensive-2027-feb" */
export function eventSlug(r: Rule, o: Occurrence, withMonth: boolean): string {
  return `${r.slug}-${o.year}${withMonth ? `-${SHORT[o.start.getMonth()]!.toLowerCase()}` : ''}`
}

/* ------------------------------------------------------------------- rules */

const PIERCE = { where: 'St. Petersburg, FL', venue: 'Pierce Clinic of Chiropractic' }
const OREM = { where: 'Orem, UT', venue: 'Sound Corrections Chiropractic' }
const CEREBRAL = { where: 'St. Petersburg, FL', venue: 'Cerebral' }

export const INTENSIVE_RULES: Rule[] = [
  { id: 'intensive-feb', event: 'AdvO Intensive', rule: 'Third Friday–Saturday of February', month: 1, weekday: 5, nth: 3, days: 2, ...PIERCE, page: 'intensive', slug: 'advo-intensive' },
  { id: 'intensive-apr', event: 'AdvO Intensive', rule: 'Third Friday–Saturday of April', month: 3, weekday: 5, nth: 3, days: 2, ...OREM, page: 'intensive', slug: 'advo-intensive' },
  { id: 'intensive-aug', event: 'AdvO Intensive', rule: 'Fourth Friday–Saturday of August', month: 7, weekday: 5, nth: 4, days: 2, ...CEREBRAL, page: 'intensive', slug: 'advo-intensive' },
]

export const BOOTCAMP_RULE: Rule = { id: 'bootcamp', event: 'AdvO Bootcamp', rule: 'The week of the third Monday of June', month: 5, weekday: 1, nth: 3, days: 5, where: 'Tampa Bay, FL', venue: '', page: 'bootcamp', slug: 'advo-bootcamp' }

export const CONFERENCE_RULE: Rule = { id: 'conference', event: 'Annual Conference', rule: 'Third Friday–Saturday of October', month: 9, weekday: 5, nth: 3, days: 2, where: 'Tampa Bay, FL', venue: '', page: 'conference' }

/** Every weekend event, in calendar order. */
export const WEEKEND_RULES: Rule[] = [INTENSIVE_RULES[0]!, INTENSIVE_RULES[1]!, BOOTCAMP_RULE, INTENSIVE_RULES[2]!, CONFERENCE_RULE]

/** The 2026 conference, which kept its November date ahead of the rules. */
export const CONFERENCE_2026: Occurrence = { start: new Date(2026, 10, 6), end: new Date(2026, 10, 7), year: 2026 }

export type NextEvent = { page: string; o: Occurrence; where: string }

/** The soonest in-person weekend event (Intensive, Bootcamp or Conference)
 *  that has not finished yet. Reckoned from the build date by default, so the
 *  seminars page hydrates cleanly; it recomputes from today after mount. */
export function nextInPerson(today = AS_OF): NextEvent {
  const day = new Date(today.getFullYear(), today.getMonth(), today.getDate())
  const list: NextEvent[] = WEEKEND_RULES.map((r) => ({ page: r.page!, o: nextOccurrence(r, today), where: r.where }))
  if (CONFERENCE_2026.end >= day) list.push({ page: 'conference', o: CONFERENCE_2026, where: 'St. Petersburg, FL' })
  return list.sort((a, b) => a.o.start.getTime() - b.o.start.getTime())[0]!
}

/* -------------------------------------------------------- member Zoom call */

/** The second Tuesday of the month. The Fundamentals year runs October to
 *  September: Fundamental 1 in Oct–Jan, 2 in Feb–May, 3 in Jun–Sep. */
export const ZOOM_PARTS: Record<string, number[]> = { fund1: [9, 10, 11, 0], fund2: [1, 2, 3, 4], fund3: [5, 6, 7, 8] }

/** The Fundamentals year (its October) that the next call belongs to. */
export function zoomSeason(today = new Date()): number {
  const day = new Date(today.getFullYear(), today.getMonth(), today.getDate())
  let d = nthWeekday(day.getFullYear(), day.getMonth(), 2, 2)
  if (d < day) d = nthWeekday(day.getFullYear(), day.getMonth() + 1, 2, 2)
  return d.getMonth() >= 9 ? d.getFullYear() : d.getFullYear() - 1
}

/** The four call dates for one Fundamentals part in a season. */
export function zoomDates(part: string, season: number): Date[] {
  return (ZOOM_PARTS[part] ?? []).map((m) => nthWeekday(m >= 9 ? season : season + 1, m, 2, 2))
}

/** The Monthly Huddle: one permanent event, each monthly call a session in it.
 *  Members RSVP once; the address carries no year. */
export const HUDDLE_SLUG = 'monthly-huddle'

/** "October 13, November 10 and December 8, 2026, and January 12, 2027" */
export function listDates(dates: Date[]): string {
  const byYear = new Map<number, Date[]>()
  for (const d of dates) byYear.set(d.getFullYear(), [...(byYear.get(d.getFullYear()) ?? []), d])
  const groups = [...byYear.entries()].map(([year, ds]) => {
    const parts = ds.map((d) => `${MONTHS[d.getMonth()]} ${d.getDate()}`)
    const joined = parts.length > 1 ? `${parts.slice(0, -1).join(', ')} and ${parts[parts.length - 1]}` : parts[0]
    return `${joined}, ${year}`
  })
  return groups.join(', and ')
}

/* ------------------------------------------------------------- the table */

export type CalendarRow = { event: string; rule: string; years: string[]; where: string; page?: string }

/** The first year worth showing: the year of the next weekend event. Reckoned
 *  from the build date by default, so the seminars page hydrates cleanly. */
export function firstCalendarYear(today = AS_OF): number {
  return Math.min(...WEEKEND_RULES.map((r) => nextOccurrence(r, today).year))
}

export function calendarRows(years: number[]): CalendarRow[] {
  return [
    { event: 'Fundamentals 1–3', rule: `Second Tuesday monthly, 9:00 pm Eastern · F1 Oct–Jan, F2 Feb–May, F3 Jun–Sep · members only`, years: years.map(() => 'Monthly'), where: 'Live on Zoom', page: 'fund1' },
    ...WEEKEND_RULES.map((r) => ({
      event: r.event,
      rule: r.rule,
      years: years.map((y) => shortRange(occurrence(r, y))),
      where: r.venue ? `${r.venue.replace(' of Chiropractic', '').replace(' Chiropractic', '')}, ${r.where}` : r.where,
      page: r.page,
    })),
  ]
}
