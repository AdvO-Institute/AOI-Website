/* ----------------------------------------------------------------------------
 * What needs the signed-in person's attention right now — the red dots on the
 * rail. Everything here is date-driven:
 *   reports   a report you can file for the current cycle is not submitted
 *             and is inside its window (opens after the last Board meeting;
 *             due two weeks before the next)
 *   tasks     a task assigned to you is due within 3 days or overdue
 *   events    paid registrations that arrived since you last opened Events
 *             (for people who manage events)
 * -------------------------------------------------------------------------- */
import { select, rpc } from '@/lib/supabase'
import type { Access } from '@/lib/access'
import { boardMeetings, currentCycle, dayET, daysUntil } from './meetings'

export type Attention = { reports: { count: number; overdue: boolean; label: string }; tasks: { count: number; overdue: number }; events: { count: number } }
export const EMPTY: Attention = { reports: { count: 0, overdue: false, label: '' }, tasks: { count: 0, overdue: 0 }, events: { count: 0 } }

const seenKey = (uid: string) => `aoi:events-seen:${uid}`
export function markEventsSeen(uid: string | null | undefined) { if (!uid) return; try { localStorage.setItem(seenKey(uid), new Date().toISOString()) } catch { /* private window */ } }
function eventsSeen(uid: string | null | undefined): string { if (!uid) return '1970-01-01'; try { return localStorage.getItem(seenKey(uid)) ?? '1970-01-01' } catch { return '1970-01-01' } }

export async function attention(access: Access, uid: string | null | undefined): Promise<Attention> {
  const out: Attention = { reports: { count: 0, overdue: false, label: '' }, tasks: { count: 0, overdue: 0 }, events: { count: 0 } }
  const caps = new Set(access.capabilities as string[])
  const today = dayET()
  try {
    // reports I can file
    const mine = access.committees.filter((c) => c.leads)
    if (mine.length || caps.has('full_admin')) {
      const meetings = await boardMeetings()
      const cyc = currentCycle(meetings, today)
      const q = await select<{ committee_id: number; status: string; period_ym: string | null }>('committee_reports', `select=committee_id,status,period_ym&period_ym=eq.${cyc.reportMonth}&limit=100`)
      const filed = new Set((q.data ?? []).filter((r) => r.status === 'submitted').map((r) => r.committee_id))
      let owed = mine.filter((c) => !filed.has(c.id))
      // a chair is reminded from the day the cycle opens; the ED (who files none) once the due date has passed and something is still missing
      if (!mine.length && caps.has('full_admin') && today > cyc.dueDate) {
        const all = await select<{ id: number; name: string; active: boolean }>('committees', 'select=id,name,active&limit=50')
        owed = (all.data ?? []).filter((c) => c.active !== false && !filed.has(c.id)).map((c) => ({ id: c.id, key: '', name: c.name, leads: false }))
      }
      if (owed.length) {
        const d = daysUntil(cyc.dueDate, today)
        out.reports = { count: owed.length, overdue: d < 0, label: d < 0 ? `${owed.length} report${owed.length > 1 ? 's' : ''} overdue` : `${owed.length} report${owed.length > 1 ? 's' : ''} due ${d === 0 ? 'today' : 'in ' + d + ' days'}` }
      }
    }
    // my tasks
    if (access.person?.id) {
      const q = await select<{ due_date: string | null }>('tasks', `select=due_date&assigned_person_id=eq.${access.person.id}&status=eq.open&limit=200`)
      const rows = q.data ?? []
      const overdue = rows.filter((t) => t.due_date && t.due_date < today).length
      const soon = rows.filter((t) => t.due_date && t.due_date >= today && daysUntil(t.due_date, today) <= 3).length
      out.tasks = { count: overdue + soon, overdue }
    }
    // new registrations
    if (caps.has('manage_seminars') || caps.has('full_admin')) {
      const since = eventsSeen(uid)
      const q = await select<{ id: string }>('event_registrations', `select=id&payment_status=in.(paid,free)&registration_status=neq.cancelled&created_at=gt.${encodeURIComponent(since)}&limit=200`)
      out.events = { count: (q.data ?? []).length }
    }
  } catch { /* the rail must never fail because a count did */ }
  return out
}

/** Records that this person is in the member area (sign-in) or opened a tab — groundwork for the ED control center. */
export async function logActivity(kind: 'sign_in' | 'tab_open' | 'write', tab?: string, detail?: Record<string, unknown>): Promise<void> {
  try { await rpc('log_activity', { p_kind: kind, p_tab: tab ?? null, p_detail: detail ?? null }) } catch { /* never block the UI */ }
}
export function logSignInOnce(uid: string | null | undefined): void {
  if (!uid) return
  try {
    const k = `aoi:signin-logged:${uid}`
    if (sessionStorage.getItem(k)) return
    sessionStorage.setItem(k, '1')
    void logActivity('sign_in')
  } catch { void logActivity('sign_in') }
}

/** One committee's report for the cycle in force, as the Overview shows it. */
export type ReportDue = {
  committee: Access['committees'][number]
  /** The month being reported, YYYY-MM. */
  month: string
  dueDate: string
  /** Days until the due date; negative once it has passed. */
  days: number
  state: 'submitted' | 'draft' | 'due'
}
/** The current cycle's report, per committee this person leads or sits on. Empty if it cannot be read. */
export async function myReports(access: Access): Promise<ReportDue[]> {
  if (!access.committees.length) return []
  try {
    const today = dayET()
    const cyc = currentCycle(await boardMeetings(), today)
    const ids = access.committees.map((c) => c.id).join(',')
    const q = await select<{ committee_id: number; status: string }>('committee_reports', `select=committee_id,status&period_ym=eq.${cyc.reportMonth}&committee_id=in.(${ids})&limit=100`)
    const rows = q.data ?? []
    const days = daysUntil(cyc.dueDate, today)
    return access.committees.map((c) => {
      const mine = rows.filter((r) => r.committee_id === c.id)
      const state: ReportDue['state'] = mine.some((r) => r.status === 'submitted') ? 'submitted' : mine.length ? 'draft' : 'due'
      return { committee: c, month: cyc.reportMonth, dueDate: cyc.dueDate, days, state }
    })
  } catch {
    return []
  }
}
