/* ----------------------------------------------------------------------------
 * Tasks — assignments across the Board and committees, with two stamped acts:
 * completing (who did it, their role, when) and checking off (who verified,
 * their role, when). Reopening clears both.
 *
 * Visibility comes from RLS: ED/Board see all; a chair sees their committee's
 * tasks; anyone else sees what is assigned to them. An assignee may complete
 * or reopen their own task; everything else is ED/Board.
 * -------------------------------------------------------------------------- */
import { select, patch, insert, remove } from '@/lib/supabase'

export type Who = { name: string; id: string | null; role: string }
export type Task = {
  id: number; title: string; description: string | null; committee_id: number | null; assigned_person_id: string | null; assigned_name: string | null
  due_date: string | null; priority: 'normal' | 'urgent' | string | null; status: 'open' | 'done' | string
  created_by_name: string | null; created_at: string
  completed_at: string | null; completed_by_name: string | null; completed_by_role: string | null
  verified_by_name: string | null; verified_by_role: string | null; verified_at: string | null
  committees?: { name: string } | null
}
export type Assignee = { id: string; name: string; why: string }

export async function tasks(): Promise<{ rows: Task[]; error?: string }> {
  const q = await select<Task>('tasks', 'select=*,committees(name)&order=status.desc,due_date.asc.nullslast,created_at.desc&limit=1000')
  if (q.data) return { rows: q.data }
  return { rows: [], error: q.error ?? 'unknown' }
}
/** Anyone with a login-role: Board, chairs/co-chairs, ED, treasurer, instructors, past Board/ED, nominees, research team with a contact card. */
export async function assignable(): Promise<Assignee[]> {
  const out = new Map<string, Assignee>()
  const add = (id: string | null | undefined, name: string, why: string) => { if (id && !out.has(id)) out.set(id, { id, name, why }) }
  const ROLE: Record<string, string> = { executive_director: 'Executive Director', board_member: 'Board', board_chair: 'Chair of the Board', vice_chair: 'Vice Chair', secretary: 'Secretary', committee_chair: 'Committee chair', committee_cochair: 'Committee co-chair', research_director: 'Research Director', treasurer: 'Treasurer', instructor: 'Instructor', past_board_member: 'Past Board', past_executive_director: 'Past ED', committee_member: 'Committee member' }
  const roles = await select<{ person_id: string; role_key: string; people: { first_name: string; last_name: string; credentials: string | null } | null }>('person_roles', 'select=person_id,role_key,people!person_roles_person_id_fkey(first_name,last_name,credentials)&limit=500')
  for (const r of roles.data ?? []) if (r.people) add(r.person_id, `${r.people.first_name} ${r.people.last_name}`, ROLE[r.role_key] ?? r.role_key)
  const noms = await select<{ person_id: string | null; person_name: string }>('board_service', 'select=person_id,person_name&status=eq.nominee&limit=50')
  for (const n of noms.data ?? []) add(n.person_id, n.person_name.replace(/^Dr\.\s+/, ''), 'Board nominee')
  const team = await select<{ person_id: string | null; name: string; role: string }>('research_team', 'select=person_id,name,role&person_id=not.is.null&limit=200')
  for (const m of team.data ?? []) add(m.person_id, m.name.replace(/^Dr\.\s+/, ''), m.role === 'pi' ? 'Principal investigator' : 'Research team')
  return [...out.values()].sort((a, b) => a.name.split(' ').pop()!.localeCompare(b.name.split(' ').pop()!))
}

export const dayDiff = (ymd: string, today = new Date().toISOString().slice(0, 10)) => Math.round((Date.parse(ymd + 'T12:00:00Z') - Date.parse(today + 'T12:00:00Z')) / 86400000)
export const isOverdue = (t: Task) => t.status === 'open' && !!t.due_date && dayDiff(t.due_date) < 0
export const fmtD = (ymd: string | null) => ymd ? new Date(ymd + 'T12:00:00Z').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' }) : ''
export const fmtTs = (iso: string) => new Date(iso).toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' })

export type TaskInput = { title: string; description: string; committee_id: number | null; assignee: Assignee | null; due_date: string; priority: 'normal' | 'urgent' }
export const createTask = (v: TaskInput, who: Who) => insert('tasks', [{
  title: v.title, description: v.description || null, committee_id: v.committee_id, assigned_person_id: v.assignee?.id ?? null, assigned_name: v.assignee?.name ?? null,
  due_date: v.due_date || null, priority: v.priority, status: 'open', created_by_name: who.name, created_by_person_id: who.id,
}])
export const updateTask = (id: number, v: TaskInput) => patch('tasks', `id=eq.${id}`, {
  title: v.title, description: v.description || null, committee_id: v.committee_id, assigned_person_id: v.assignee?.id ?? null, assigned_name: v.assignee?.name ?? null, due_date: v.due_date || null, priority: v.priority,
})
export const completeTask = (id: number, who: Who) => patch('tasks', `id=eq.${id}`, { status: 'done', completed_at: new Date().toISOString(), completed_by_name: who.name, completed_by_role: who.role })
export const reopenTask = (id: number) => patch('tasks', `id=eq.${id}`, { status: 'open', completed_at: null, completed_by_name: null, completed_by_role: null, verified_by_name: null, verified_by_role: null, verified_at: null })
export const verifyTask = (id: number, who: Who) => patch('tasks', `id=eq.${id}`, { verified_by_name: who.name, verified_by_role: who.role, verified_at: new Date().toISOString() })
export const deleteTask = (id: number) => remove('tasks', `id=eq.${id}`)
