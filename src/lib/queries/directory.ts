/* ----------------------------------------------------------------------------
 * Public doctor directory.
 *
 * Reads `v_public_directory` with the publishable key: one row per current
 * member per office, carrying only what a patient needs (name, credentials,
 * Advanced Orthogonal level, clinic name, address, phone, website). The view
 * lives in Supabase and decides who is listed; this file groups the rows into
 * clinics and searches them.
 *
 * Until the view exists, a local or test preview (localhost, *.pages.dev)
 * shows SAMPLE clinics so the page can be judged; the live site shows the
 * phone fallback instead.
 * -------------------------------------------------------------------------- */
import { SB_URL, SB_KEY } from '@/lib/supabase'

export type DirectoryRow = {
  person_id: string
  first_name: string
  last_name: string
  credentials: string | null
  /** Resolved Advanced Orthogonal level: 'level_2', 'level_1', or null for a member without one. */
  cert_level: string | null
  clinic_name: string | null
  address: string | null
  city: string | null
  state: string | null
  zip: string | null
  phone: string | null
  website: string | null
  /** The clinic's public email, from Business Information. */
  email?: string | null
}

export type Doctor = { id: string; name: string; credentials: string | null; level: 'level_2' | 'level_1' | 'member' }

export type Clinic = {
  key: string
  name: string
  address: string | null
  city: string | null
  state: string | null
  zip: string | null
  phone: string | null
  website: string | null
  email: string | null
  doctors: Doctor[]
  /** The highest level among its doctors; sets the card's color and its place in the state. */
  level: Doctor['level']
  /** Lowercased words a search can match, built once. */
  words: string[]
  zipText: string
}

export type DirectoryResult = { clinics: Clinic[]; sample: boolean; error?: string }

export async function fetchDirectory(): Promise<DirectoryResult> {
  try {
    const res = await fetch(`${SB_URL}/rest/v1/v_public_directory?select=*`, { headers: { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}` } })
    if (res.ok) return { clinics: groupClinics((await res.json()) as DirectoryRow[]), sample: false }
    if (isLocal()) return { clinics: groupClinics(SAMPLE), sample: true }
    return { clinics: [], sample: false, error: await res.text() }
  } catch (e) {
    if (isLocal()) return { clinics: groupClinics(SAMPLE), sample: true }
    return { clinics: [], sample: false, error: String(e) }
  }
}

const isLocal = () => typeof window !== 'undefined' && (['localhost', '127.0.0.1'].includes(window.location.hostname) || window.location.hostname.endsWith('.pages.dev'))

/* ---------------------------------------------------------------- grouping */

const LEVEL_RANK = { level_2: 2, level_1: 1, member: 0 } as const

function norm(s: string | null | undefined): string {
  return (s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()
}

/** Many records carry the whole address on the street line ("251 E 1200 S,
 *  Orem, UT 84058"). Fill city, state and ZIP from it where those are empty,
 *  and keep just the street, so the clinic lands under the right state. */
function splitAddress(r: DirectoryRow): DirectoryRow {
  const m = r.address?.match(/^(.*?),\s*([^,]+?),\s*([A-Za-z]{2})\.?\s*([A-Za-z0-9]{3}\s?[A-Za-z0-9]{3}|\d{5}(?:-\d{4})?)?\s*$/)
  if (!m || !STATES[m[3]!.toUpperCase()]) return r
  return { ...r, address: m[1]!.trim(), city: r.city || m[2]!.trim(), state: r.state || m[3]!.toUpperCase(), zip: r.zip || m[4] || null }
}

/** Doctors who share a clinic name and street number are one clinic — so one
 *  record missing the city doesn't split a clinic in two. */
export function groupClinics(rows: DirectoryRow[]): Clinic[] {
  const map = new Map<string, Clinic>()
  for (const row of rows) {
    const r = splitAddress(row)
    const name = r.clinic_name?.trim() || null
    if (!name && !r.address && !r.city) continue // nowhere to send a patient
    const key = `${norm(name ?? r.address)}|${r.address?.match(/^\s*(\d+)/)?.[1] ?? norm(r.city)}`
    let c = map.get(key)
    if (!c) {
      c = { key, name: name ?? 'Private practice', address: r.address, city: r.city, state: r.state?.toUpperCase() ?? null, zip: r.zip, phone: r.phone, website: r.website, email: r.email ?? null, doctors: [], level: 'member', words: [], zipText: '' }
      map.set(key, c)
    }
    // Fill gaps from a colleague's record at the same clinic.
    c.address ??= r.address; c.zip ??= r.zip; c.phone ??= r.phone; c.website ??= r.website; c.email ??= r.email ?? null
    if (!c.doctors.some((d) => d.id === r.person_id)) {
      const level = r.cert_level === 'level_2' || r.cert_level === 'level_1' ? r.cert_level : 'member'
      c.doctors.push({ id: r.person_id, name: `${r.first_name} ${r.last_name}`.trim(), credentials: r.credentials, level })
    }
  }
  const out = [...map.values()]
  for (const c of out) {
    c.doctors.sort((a, b) => LEVEL_RANK[b.level] - LEVEL_RANK[a.level] || a.name.localeCompare(b.name))
    c.level = c.doctors[0]?.level ?? 'member'
    const stateName = c.state ? STATES[c.state] ?? '' : ''
    c.words = norm([c.name, c.address, c.city, c.state, stateName, ...c.doctors.flatMap((d) => [d.name, d.credentials])].join(' ')).split(' ').filter(Boolean)
    c.zipText = norm(c.zip).replace(/ /g, '')
  }
  return out.sort(byPlace)
}

/** By state, then Level 2 clinics first, then Level 1, then the rest. */
export function byPlace(a: Clinic, b: Clinic): number {
  return stateLabel(a.state).localeCompare(stateLabel(b.state)) || LEVEL_RANK[b.level] - LEVEL_RANK[a.level] || (a.city ?? '').localeCompare(b.city ?? '') || a.name.localeCompare(b.name)
}

export const stateLabel = (code: string | null) => (code ? STATES[code] ?? code : 'Other')

/* ------------------------------------------------------------------ search
 * Forgiving on purpose: every word typed must match something on the clinic
 * card — a whole word, the start of one, or a near miss ("Pittsburg",
 * "Jhonson") — and a ZIP matches by its first digits. */

const SKIP = new Set(['dr', 'doctor', 'doctors', 'in', 'near', 'the', 'of', 'and', 'at'])

function distance(a: string, b: string, max: number): number {
  if (Math.abs(a.length - b.length) > max) return max + 1
  let prev = Array.from({ length: b.length + 1 }, (_, j) => j)
  for (let i = 1; i <= a.length; i++) {
    const cur = [i]
    let low = i
    for (let j = 1; j <= b.length; j++) {
      cur[j] = Math.min(prev[j]! + 1, cur[j - 1]! + 1, prev[j - 1]! + (a[i - 1] === b[j - 1] ? 0 : 1))
      low = Math.min(low, cur[j]!)
    }
    if (low > max) return max + 1
    prev = cur
  }
  return prev[b.length]!
}

function wordScore(token: string, words: string[], zip: string): number {
  if (/^\d+$/.test(token)) return zip.startsWith(token) ? 3 : 0
  let best = 0
  const slack = token.length >= 7 ? 2 : token.length >= 4 ? 1 : 0
  for (const w of words) {
    if (w === token) return 3
    if (w.startsWith(token)) best = Math.max(best, 2.5)
    else if (token.length >= 3 && w.includes(token)) best = Math.max(best, 1.5)
    else if (slack && distance(token, w.slice(0, token.length + slack), slack) <= slack && distance(token, w, slack) <= slack) best = Math.max(best, 1)
  }
  return best
}

export function searchClinics(clinics: Clinic[], query: string): Clinic[] {
  const tokens = norm(query).split(' ').filter((t) => t && !SKIP.has(t))
  if (!tokens.length) return clinics
  const scored: { c: Clinic; s: number }[] = []
  for (const c of clinics) {
    let s = 0
    for (const t of tokens) {
      const w = wordScore(t, c.words, c.zipText)
      if (!w) { s = 0; break }
      s += w
    }
    if (s) scored.push({ c, s })
  }
  return scored.sort((a, b) => b.s - a.s || byPlace(a.c, b.c)).map((x) => x.c)
}

/* ------------------------------------------------------------------ places */

export const STATES: Record<string, string> = {
  AL: 'Alabama', AK: 'Alaska', AZ: 'Arizona', AR: 'Arkansas', CA: 'California', CO: 'Colorado', CT: 'Connecticut', DE: 'Delaware',
  DC: 'District of Columbia', FL: 'Florida', GA: 'Georgia', HI: 'Hawaii', ID: 'Idaho', IL: 'Illinois', IN: 'Indiana', IA: 'Iowa',
  KS: 'Kansas', KY: 'Kentucky', LA: 'Louisiana', ME: 'Maine', MD: 'Maryland', MA: 'Massachusetts', MI: 'Michigan', MN: 'Minnesota',
  MS: 'Mississippi', MO: 'Missouri', MT: 'Montana', NE: 'Nebraska', NV: 'Nevada', NH: 'New Hampshire', NJ: 'New Jersey', NM: 'New Mexico',
  NY: 'New York', NC: 'North Carolina', ND: 'North Dakota', OH: 'Ohio', OK: 'Oklahoma', OR: 'Oregon', PA: 'Pennsylvania', RI: 'Rhode Island',
  SC: 'South Carolina', SD: 'South Dakota', TN: 'Tennessee', TX: 'Texas', UT: 'Utah', VT: 'Vermont', VA: 'Virginia', WA: 'Washington',
  WV: 'West Virginia', WI: 'Wisconsin', WY: 'Wyoming', PR: 'Puerto Rico',
  AB: 'Alberta', BC: 'British Columbia', MB: 'Manitoba', NB: 'New Brunswick', NL: 'Newfoundland and Labrador', NS: 'Nova Scotia',
  ON: 'Ontario', PE: 'Prince Edward Island', QC: 'Quebec', SK: 'Saskatchewan',
}

/* ------------------------------------------------------------------ sample
 * Made-up clinics and doctors for local and test previews only. Never shown on the
 * live site. */

const s = (person_id: string, first_name: string, last_name: string, cert_level: string | null, clinic_name: string, address: string, city: string, state: string, zip: string, phone: string): DirectoryRow =>
  ({ person_id, first_name, last_name, credentials: 'DC', cert_level, clinic_name, address, city, state, zip, phone, website: 'https://example.com' })

const SAMPLE: DirectoryRow[] = [
  { ...s('s1', 'Sample', 'Avery', 'level_2', 'Sample Upper Cervical Center', '100 Example Ave N', 'St. Petersburg', 'FL', '33701', '(555) 010-0101'), email: 'avery@example.com' },
  s('s2', 'Sample', 'Brooks', 'level_1', 'Sample Upper Cervical Center', '100 Example Ave N', 'St. Petersburg', 'FL', '33701', '(555) 010-0101'),
  s('s3', 'Sample', 'Castillo', null, 'Sample Upper Cervical Center', '100 Example Ave N', 'St. Petersburg', 'FL', '33701', '(555) 010-0101'),
  s('s4', 'Sample', 'Dunn', 'level_1', 'Example Family Chiropractic', '22 Placeholder Rd', 'Orlando', 'FL', '32801', '(555) 010-0102'),
  s('s5', 'Sample', 'Ellis', 'level_2', 'Demo Atlas Clinic', '9 Test Street, Suite 4', 'Orem', 'UT', '84058', '(555) 010-0103'),
  s('s6', 'Sample', 'Fischer', null, 'Placeholder Spine & Wellness', '450 Sample Blvd', 'Pittsburgh', 'PA', '15222', '(555) 010-0104'),
  s('s7', 'Sample', 'Garcia', 'level_1', 'Placeholder Spine & Wellness', '450 Sample Blvd', 'Pittsburgh', 'PA', '15222', '(555) 010-0104'),
  s('s8', 'Sample', 'Hughes', 'level_2', 'Example Neck & Head Center', '7 Demo Lane', 'Austin', 'TX', '78701', '(555) 010-0105'),
  s('s9', 'Sample', 'Ito', null, 'Test Chiropractic Studio', '31 Sample Way', 'Portland', 'OR', '97204', '(555) 010-0106'),
  s('s10', 'Sample', 'Johnson', 'level_1', 'Sample Upper Cervical of Toronto', '88 Example St W', 'Toronto', 'ON', 'M5V 2T6', '(555) 010-0107'),
]
