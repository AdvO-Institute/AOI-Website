/* ----------------------------------------------------------------------------
 * Control center — the Executive Director's cockpit. Nothing is stored twice:
 * every figure is read from what the other tabs record (reports, tasks,
 * meetings, registrations, records) plus the activity log and the sign-in
 * data that only the ED can read (ed_people, ed_counts, activity_log).
 * -------------------------------------------------------------------------- */
import { select, rpc } from '@/lib/supabase'
import type { Access } from '@/lib/access'

export const isExecutiveDirector = (a: Access) => a.staff_role === 'executive_director' || a.roles.some((r) => r.role_key === 'executive_director')

export type EdPerson = {
  id: string; name: string; credentials: string | null; roles: { role_key: string; committee: string | null }[]; nominee: boolean; has_login: boolean
  last_sign_in_at: string | null; last_activity_at: string | null; last_kind: string | null; last_tab: string | null; last_detail: Record<string, unknown> | null
}
export type Activity = { id: number; at: string; person_id: string | null; person_name: string | null; kind: 'sign_in' | 'tab_open' | 'write'; tab: string | null; detail: Record<string, unknown> | null }
export type Counts = { eligibility_pending?: { name: string; event: string; reg_type: string; created_at: string }[]; nominees_pending?: { name: string; nominated: string | null }[]; registrations_30d?: number; revenue_30d?: number }

export async function people(): Promise<EdPerson[]> { return (await rpc<EdPerson[]>('ed_people')) ?? [] }
export async function counts(): Promise<Counts> { return (await rpc<Counts>('ed_counts')) ?? {} }
export async function activity(days = 90): Promise<Activity[]> {
  const since = new Date(Date.now() - days * 86400000).toISOString()
  const q = await select<Activity>('activity_log', `select=id,at,person_id,person_name,kind,tab,detail&at=gte.${encodeURIComponent(since)}&order=at.desc&limit=2000`)
  return q.data ?? []
}

export const ROLE_LABEL: Record<string, string> = { executive_director: 'Executive Director', board_member: 'Board', board_chair: 'Chair of the Board', vice_chair: 'Vice Chair', secretary: 'Secretary', committee_chair: 'chair', committee_cochair: 'co-chair', research_director: 'Research Director', treasurer: 'Treasurer', instructor: 'Instructor', past_board_member: 'Past Board', past_executive_director: 'Past ED', committee_member: 'member' }
export const TAB_LABEL: Record<string, string> = { overview: 'Overview', membership: 'Membership', mycert: 'My Certification', myce: 'My CE', myinfo: 'Personal Information', mylisting: 'Business Information', events: 'Events', calendar: 'Calendar', reports: 'Reports', tasks: 'Tasks', stats: 'Stats', records: 'Records', directory: 'Members', leads: 'Contacts', certification: 'Certifications', instructors: 'Instructors', internships: 'Internships', research: 'Research', colleges: 'Colleges', board: 'Board', org: 'Org Chart', email: 'Email', roles: 'Roles & Access', oversight: 'Full CCI OS', control: 'Control center' }
export const rolesText = (p: EdPerson) => {
  const out: string[] = []
  for (const r of p.roles) {
    if (r.role_key === 'committee_chair' || r.role_key === 'committee_cochair' || r.role_key === 'committee_member') out.push(`${(r.committee ?? '').replace(' Committee', '')} ${ROLE_LABEL[r.role_key]}`)
    else if (!out.includes(ROLE_LABEL[r.role_key] ?? r.role_key)) out.push(ROLE_LABEL[r.role_key] ?? r.role_key)
  }
  if (p.nominee) out.push('Board nominee')
  return out.join(' · ')
}
export function actionText(a: Pick<Activity, 'kind' | 'tab' | 'detail'>): string {
  if (a.kind === 'sign_in') return 'Signed in to the member area'
  if (a.kind === 'tab_open') return `Opened ${TAB_LABEL[a.tab ?? ''] ?? a.tab ?? 'a tab'}`
  const d = a.detail ?? {}
  const base = typeof d.action === 'string' ? d.action : d.folder ? `Filed a ${String(d.kind ?? 'document').replace('_', ' ')} in Records` : typeof d.period === 'string' ? `Locked the ${d.period} snapshot` : 'Made a change'
  const extra = [typeof d.committee === 'string' ? d.committee.replace('_', ' ') : null, typeof d.ym === 'string' ? d.ym : null].filter(Boolean).join(' · ')
  return `${base}${extra ? ' · ' + extra : ''}`
}
export const daysSince = (iso: string | null | undefined) => iso ? Math.floor((Date.now() - new Date(iso).getTime()) / 86400000) : null
export const silentText = (iso: string | null | undefined) => { const d = daysSince(iso); return d == null ? 'never' : d === 0 ? 'today' : d === 1 ? 'yesterday' : `${d} days ago` }
export const lastSeen = (p: EdPerson) => [p.last_sign_in_at, p.last_activity_at].filter(Boolean).sort().pop() ?? null
