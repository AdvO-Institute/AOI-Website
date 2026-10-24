/**
 * The Institute's refund rule, in one place so every surface that takes money
 * says the same thing: the registration dialog before Pay, the seminar page
 * under the price, the confirmation page, and the cancel-request box in the
 * members area. Decided 2026-10-07 (#126): a seminar registration is refunded
 * in full when canceled 30 or more days before it starts; inside 30 days the
 * payment becomes a credit toward another seminar. An event's own
 * refund-policy text, when the Institute has written one, wins.
 */
export const REFUND_DAYS = 30

const DAY = 86_400_000

/** The last day a cancellation is refunded in full, or null without a start date. */
export function refundDeadline(startsAt?: string | null): Date | null {
  if (!startsAt) return null
  const t = new Date(startsAt).getTime()
  return Number.isFinite(t) ? new Date(t - REFUND_DAYS * DAY) : null
}

const fmt = (d: Date) => d.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric', timeZone: 'America/New_York' })

/** The rule for the reader. With a date: "Full refund if you cancel by March 14,
 * 2027 (30 days before the seminar); after that, credit toward another seminar."
 * Without one: the general rule. */
export function refundLine(startsAt?: string | null, own?: string | null): string {
  if (own && own.trim()) return own.trim()
  const by = refundDeadline(startsAt)
  return by && by.getTime() > Date.now()
    ? `Full refund if you cancel by ${fmt(by)} (${REFUND_DAYS} days before the seminar); after that, credit toward another seminar.`
    : `Full refund if you cancel ${REFUND_DAYS} or more days before the seminar; inside ${REFUND_DAYS} days, credit toward another seminar.`
}

/** true = a cancellation today is refunded in full; false = inside 30 days (credit instead); null = no date. */
export function refundable(startsAt?: string | null, now = Date.now()): boolean | null {
  const by = refundDeadline(startsAt)
  return by ? now <= by.getTime() : null
}
