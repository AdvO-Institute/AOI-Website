/* ----------------------------------------------------------------------------
 * Links typed into the database (Zoom links, websites, study sites) are only
 * rendered as links when they are plainly web addresses. Anything else — a
 * stray "javascript:" or "data:" value, a note someone pasted into the wrong
 * field — is shown as text instead of becoming a clickable href.
 * -------------------------------------------------------------------------- */

/** The address itself when it starts with http:// or https://, otherwise null. */
export function safeHref(value: string | null | undefined): string | null {
  if (!value) return null
  const s = value.trim()
  return /^https?:\/\/\S+$/i.test(s) ? s : null
}

/** Like `safeHref`, but a bare domain ("www.example.com") is read as https.
 *  Anything that names some other scheme is still refused. */
export function webHref(value: string | null | undefined): string | null {
  if (!value) return null
  const s = value.trim()
  if (!s) return null
  if (/^[a-z][a-z0-9+.-]*:/i.test(s)) return safeHref(s)
  return safeHref(`https://${s}`)
}
