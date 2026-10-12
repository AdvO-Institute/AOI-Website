/* ----------------------------------------------------------------------------
 * One place that turns a raw database error into a sentence for the reader.
 *
 * PostgREST answers a failed call with a JSON body — code, message, details,
 * hint — and on a constraint violation the details echo the offending value
 * ("Key (email)=(someone@example.com) already exists."). None of that belongs
 * on a member's screen. Every panel passes the raw text through here; the
 * reader gets one plain sentence and the raw text goes to the browser console
 * for whoever is debugging.
 *
 * Panels that know more than the code does (a named unique constraint, which
 * role may make the change) test for their specific case first and fall back
 * to this for everything else.
 * -------------------------------------------------------------------------- */

const SESSION = 'Your session has expired. Please sign in again.'
const DENIED = 'The database did not allow that. You may not have permission to make this change.'
const DUPLICATE = 'That would create a duplicate. A record with that key already exists.'
const LINKED = 'That could not be saved because it is linked to another record.'
const REQUIRED = 'A required field is missing.'
const NOT_ALLOWED = 'One of the values is not allowed here. Check the fields and try again.'
const FORMAT = 'One of the values is in the wrong format.'
const MISSING = 'That record could not be found. It may have been removed.'
const TIMEOUT = 'The connection timed out. Please try again.'
const OFFLINE = 'The connection failed. Check your internet connection and try again.'
const BUSY = 'The database was busy. Please try again.'
const SERVER = 'The database is not responding. Please try again in a moment.'
const GENERIC = 'That could not be completed. Please try again.'

/* Order matters: the first match wins. Codes are PostgreSQL SQLSTATE values
 * and PostgREST's own PGRST codes; the words cover the same errors when only
 * the message survived. */
const RULES: [RegExp, string][] = [
  [/PGRST30[0-3]|\bJWT\b|token is expired|invalid token/i, SESSION],
  [/\b42501\b|row-level security|permission denied|not authorized|unauthorized|forbidden/i, DENIED],
  [/\b23505\b|duplicate key|already exists/i, DUPLICATE],
  [/\b23503\b|foreign key|still referenced/i, LINKED],
  [/\b23502\b|not-null|null value in column/i, REQUIRED],
  [/\b23514\b|check constraint|violates check/i, NOT_ALLOWED],
  [/\b22P02\b|\b22\d{3}\b|invalid input syntax|out of range|malformed/i, FORMAT],
  [/PGRST116|\b0 rows\b|no rows/i, MISSING],
  [/\b57014\b|timed? ?out|\b504\b/i, TIMEOUT],
  [/failed to fetch|networkerror|load failed|network request failed/i, OFFLINE],
  [/\b40001\b|\b40P01\b|deadlock|could not serialize/i, BUSY],
  [/\bP0001\b|raise_exception/i, DENIED],
  [/"code"\s*:\s*"?5\d\d|^5\d\d$|internal server error|service unavailable/i, SERVER],
]

/* Some call sites answer with the HTTP status alone ("403", "409"). */
const STATUS: Record<string, string> = {
  '401': SESSION, '403': DENIED, '404': MISSING, '409': DUPLICATE, '408': TIMEOUT, '429': BUSY, '500': SERVER, '502': SERVER, '503': SERVER, '504': TIMEOUT,
}

/** A short plain-English sentence for whatever the database or network
 *  answered. Never returns any part of `raw`; that goes to `console.warn`. */
export function friendlyError(raw: string | null | undefined): string {
  if (!raw) return GENERIC
  const text = String(raw).trim()
  if (typeof console !== 'undefined') console.warn('[database]', text)

  /* A query helper may have put context in front of the raw body
   * ("Seated, but the board role was refused: {...}"). Keep that lead-in; it
   * was written for the reader. */
  const lead = /^([^{}"\n]{3,140}?):\s*(?=\{)/.exec(text)?.[1]
  const prefix = lead ? lead.replace(/[.:\s]+$/, '') + '. ' : ''

  const status = /^\s*(\d{3})\s*$/.exec(text)?.[1]
  if (status) return prefix + (STATUS[status] ?? GENERIC)

  for (const [re, sentence] of RULES) if (re.test(text)) return prefix + sentence
  return prefix + GENERIC
}
