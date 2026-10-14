/* ----------------------------------------------------------------------------
 * Org chart — who holds which seat. Nothing is entered here: the chart is
 * drawn from the same person_roles rows that Roles & Access writes, so it is
 * always as current as the roles themselves.
 * -------------------------------------------------------------------------- */
import { select } from '@/lib/supabase'

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
export async function orgCommittees(): Promise<OrgCommittee[]> {
  const q = await select<OrgCommittee>('committees', 'select=id,key,name&active=is.true&order=sort&limit=50')
  return q.data ?? []
}
export const personName = (p: OrgPerson) => `${p.first_name ?? ''} ${p.last_name ?? ''}`.trim() + (p.credentials ? `, ${p.credentials}` : '')
export const holds = (p: OrgPerson, role: string, committeeId: number | null = null) => p.person_roles.some((r) => r.role_key === role && (committeeId == null || r.committee_id === committeeId))
