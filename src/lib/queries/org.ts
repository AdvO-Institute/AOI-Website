/* ----------------------------------------------------------------------------
 * Org chart — who holds which seat. Nothing is entered here: the chart is
 * drawn from the same person_roles rows that Roles & Access writes, so it is
 * always as current as the roles themselves.
 * -------------------------------------------------------------------------- */
import { select } from '@/lib/supabase'
import { PEOPLE, HEADSHOTS } from '@/content/people'

export type OrgPerson = { id: string; first_name?: string; last_name?: string; credentials?: string | null; photo_url?: string | null; email?: string | null; mobile_phone?: string | null; office_phone?: string | null; person_roles: { role_key: string; committee_id: number | null }[] }
export type OrgCommittee = { id: number; key: string; name: string }

/** Board officers, in the order they are shown. */
export const OFFICERS = [['board_chair', 'Chair of the Board'], ['vice_chair', 'Vice Chair'], ['secretary', 'Secretary'], ['treasurer', 'Treasurer']] as const

const KEYS = ['executive_director', 'board_member', 'board_chair', 'vice_chair', 'secretary', 'treasurer', 'research_director', 'committee_chair', 'committee_cochair', 'committee_member']

/** Everyone holding a current seat, with all of their seats. */
export async function orgPeople(): Promise<{ rows: OrgPerson[]; error?: string }> {
  const q = await select<OrgPerson>('people', `select=id,first_name,last_name,credentials,photo_url,email,mobile_phone,office_phone,person_roles!inner(role_key,committee_id)&person_roles.role_key=in.(${KEYS.join(',')})&order=last_name&limit=500`)
  return q.data ? { rows: q.data } : { rows: [], error: q.error ?? 'unknown' }
}
/** Everyone on a seated or active board term, as the Board page counts them,
 *  so a director whose board_member role is missing still appears. */
export async function orgBoardTerms(): Promise<OrgPerson[]> {
  const q = await select<{ people: OrgPerson | null }>('board_service', 'select=people!board_service_person_id_fkey(id,first_name,last_name,credentials,photo_url,email,mobile_phone,office_phone,person_roles(role_key,committee_id))&status=in.(active,seated)&limit=100')
  return (q.data ?? []).map((t) => t.people).filter((p): p is OrgPerson => !!p)
}

/* The public site's headshots (public/images/<key>.webp), by name, for anyone
 * whose record has no photo yet: full name first, then, for a board member
 * (who goes by a nickname on the site), a last name only one
 * person on the site has. */
const norm = (s: string) => s.toLowerCase().replace(/^dr\.?\s+/, '').replace(/[^a-z ]/g, '').trim()
const SITE = Object.entries(PEOPLE).filter(([k]) => HEADSHOTS.has(k)).map(([k, v]) => ({ k, full: norm(v.name), last: norm(v.name).split(' ').pop() ?? '' }))
export function siteHeadshot(p: OrgPerson): string | null {
  const full = norm(`${p.first_name ?? ''} ${p.last_name ?? ''}`), last = norm(p.last_name ?? '').split(' ').pop() ?? ''
  const hit = SITE.find((x) => x.full === full) ?? (holds(p, 'board_member') && SITE.filter((x) => x.last === last).length === 1 ? SITE.find((x) => x.last === last) : undefined)
  return hit ? `/images/${hit.k}.webp` : null
}
export async function orgCommittees(): Promise<OrgCommittee[]> {
  const q = await select<OrgCommittee>('committees', 'select=id,key,name&active=is.true&order=sort&limit=50')
  return q.data ?? []
}
export const personName = (p: OrgPerson) => `${p.first_name ?? ''} ${p.last_name ?? ''}`.trim() + (p.credentials ? `, ${p.credentials}` : '')
export const holds = (p: OrgPerson, role: string, committeeId: number | null = null) => p.person_roles.some((r) => r.role_key === role && (committeeId == null || r.committee_id === committeeId))
