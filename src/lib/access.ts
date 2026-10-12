/* ----------------------------------------------------------------------------
 * The access contract.
 *
 * One call to `get_my_access()` returns everything the shell needs to decide
 * what a person may see and do. Nothing in the UI reads a role directly: it
 * asks for a capability, and the capability list comes from the database.
 *
 * That matters because the UI is presentation, not security. Hiding a tab is a
 * courtesy; the row-level policies are what actually refuse the data. Both are
 * derived from the same roles, so they cannot disagree.
 * -------------------------------------------------------------------------- */

/** Membership ladder. Independent of any office the person holds. */
export type Tier = 'guest' | 'student' | 'member' | 'expired'

/** Every capability the database can grant. */
export type Capability =
  | 'account'
  | 'member'
  | 'student'
  | 'instructor_tools'
  | 'board'
  | 'full_admin'
  | 'manage_seminars'
  | 'manage_certifications'
  | 'manage_instructors'
  | 'manage_internships'
  | 'manage_research'
  | 'manage_board'
  | 'manage_leads'
  | 'manage_marketing'
  | 'manage_curriculum'
  | 'manage_colleges'
  | 'manage_finance'
  | 'committee_tools'
  /** `committee:<key>` — membership of a specific committee. */
  | `committee:${string}`

export type AccessPerson = {
  id: string
  first_name?: string
  last_name?: string
  credentials?: string
  email?: string
  membership_status?: string
  membership_expires?: string
  member_since?: string
  cert_level?: string
  contact_type?: string
  instructor_status?: string
  practice_name?: string
  practice_city?: string
  practice_state?: string
  photo_url?: string
}

export type AccessRole = {
  role_key: string
  committee_id?: number | null
  committee_key?: string | null
  committee_name?: string | null
  instructor_level?: string | null
}

export type AccessCommittee = {
  id: number
  key: string
  name: string
  /** Chair, co-chair or research director of this committee. */
  leads: boolean
}

export type Access = {
  person: AccessPerson | null
  staff_role: string | null
  tier: Tier
  roles: AccessRole[]
  committees: AccessCommittee[]
  can_admin_roles: boolean
  capabilities: Capability[]
}

/** What a signed-out visitor gets. */
export const NO_ACCESS: Access = {
  person: null,
  staff_role: null,
  tier: 'guest',
  roles: [],
  committees: [],
  can_admin_roles: false,
  capabilities: [],
}

/* ------------------------------------------------------------------ labels */

export const ROLE_LABEL: Record<string, string> = {
  executive_director: 'Executive Director',
  past_executive_director: 'Past Executive Director',
  board_member: 'Board Member',
  board_chair: 'Chair of the Board',
  vice_chair: 'Vice Chair',
  secretary: 'Secretary',
  past_board_member: 'Past Board Member',
  committee_chair: 'Chair',
  committee_cochair: 'Co-Chair',
  committee_member: 'Committee',
  research_director: 'Research Director',
  instructor: 'Instructor',
  member: 'Member',
}

export const TIER_LABEL: Record<Tier, string> = {
  guest: 'Not a member',
  student: 'Student',
  member: 'Member',
  expired: 'Membership expired',
}

/** How a role reads on the person's chip row. */
export function roleLabel(role: AccessRole): string {
  const base = ROLE_LABEL[role.role_key] ?? role.role_key
  if (role.role_key === 'instructor' && role.instructor_level) {
    return `${base} ${role.instructor_level === 'level_2' ? 'L2' : 'L1'}`
  }
  if (role.committee_name) {
    return `${role.committee_name.replace(/ Committee.*/, '')} · ${base}`
  }
  return base
}

/** The most senior role, for the header line. */
export function primaryRole(access: Access): string {
  const order = [
    'executive_director',
    'board_member',
    'committee_chair',
    'research_director',
    'committee_cochair',
    'instructor',
  ]
  for (const key of order) {
    const found = access.roles.find((r) => r.role_key === key)
    if (found) return roleLabel(found)
  }
  if (access.staff_role === 'administrator') return 'Administrator'
  return TIER_LABEL[access.tier]
}

export function displayName(access: Access): string {
  const p = access.person
  if (!p) return 'My Account'
  const name = `${p.first_name ?? ''} ${p.last_name ?? ''}`.trim()
  if (!name) return p.email ?? 'My Account'
  return p.credentials ? `${name}, ${p.credentials}` : name
}

export function initials(access: Access): string {
  const p = access.person
  if (!p) return '—'
  return `${(p.first_name ?? '?')[0] ?? ''}${(p.last_name ?? '?')[0] ?? ''}`.toUpperCase()
}
