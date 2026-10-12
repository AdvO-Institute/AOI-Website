/* ----------------------------------------------------------------------------
 * Stats — the Board-facing summary. Live tiles come from stats_live() (the
 * same definitions as the monthly snapshot); trends from stat_snapshots;
 * reported numbers from the latest submitted committee reports, so what the
 * chairs file each month ends up here.
 * -------------------------------------------------------------------------- */
import { select, patch, insert, rpc, headers, SB_URL, ensureSession } from '@/lib/supabase'

export type Live = Record<string, number>
export type Snapshot = {
  id: number; period: string; members_total: number | null; members_current: number | null; members_expired: number | null
  cert_student: number | null; cert_level1: number | null; cert_level2: number | null; inproc_student: number | null; inproc_level1: number | null; inproc_level2: number | null
  instructors: number | null; internship_centers: number | null; active_interns: number | null; queued_interns: number | null
  research_projects: number | null; research_funding: number | null; research_budget: number | null
  revenue: number | null; institutional_overhead: number | null; expenses: number | null; created_at: string
}
export type ListRow = { id: string | null; name: string; note: string | null }

export async function live(): Promise<Live> { return (await rpc<Live>('stats_live')) ?? {} }
export async function list(kind: string): Promise<ListRow[]> { return (await rpc<ListRow[]>('stats_list', { p_kind: kind })) ?? [] }
export async function snapshots(): Promise<Snapshot[]> {
  const q = await select<Snapshot>('stat_snapshots', 'select=*&order=period&limit=120')
  return (q.data ?? []).map((s) => ({ ...s, revenue: s.revenue == null ? null : Number(s.revenue), institutional_overhead: s.institutional_overhead == null ? null : Number(s.institutional_overhead), expenses: s.expenses == null ? null : Number(s.expenses), research_funding: s.research_funding == null ? null : Number(s.research_funding) }))
}
/** Runs snapshot_stats() for the month (ED / Board). */
export async function lockMonth(period: string): Promise<{ ok?: true; error?: string }> {
  await ensureSession()
  const r = await fetch(`${SB_URL}/rest/v1/rpc/snapshot_stats`, { method: 'POST', headers: headers(true), body: JSON.stringify({ p_period: period }) })
  return r.ok ? { ok: true } : { error: await r.text() }
}
export async function saveFinancials(period: string, v: { revenue: number | null; institutional_overhead: number | null; expenses: number | null }): Promise<{ ok?: true; error?: string }> {
  const q = await select<{ id: number }>('stat_snapshots', `select=id&period=eq.${period}&limit=1`)
  if (q.data?.[0]) return patch('stat_snapshots', `id=eq.${q.data[0].id}`, v)
  return insert('stat_snapshots', [{ period, ...v }])
}
export const money = (n: number | null | undefined) => n == null ? '—' : '$' + Math.round(Number(n)).toLocaleString('en-US')
export const monthShort = (period: string) => new Date(period.slice(0, 7) + '-15T12:00:00Z').toLocaleDateString('en-US', { month: 'short', year: '2-digit', timeZone: 'UTC' })

/** Registrations made between two dates (paid or free, not cancelled), and the
 *  money they brought in. `to` is exclusive. Null when the list cannot be read. */
export async function registrationsBetween(from: string, to: string): Promise<{ count: number; cents: number } | null> {
  const base = `payment_status=in.(paid,free)&registration_status=neq.cancelled&created_at=gte.${from}&created_at=lt.${to}&limit=5000`
  let q = await select<{ price_paid_cents: number | null; ce_paid_cents?: number | null }>('event_registrations', `select=price_paid_cents,ce_paid_cents&${base}`)
  if (q.error) q = await select<{ price_paid_cents: number | null }>('event_registrations', `select=price_paid_cents&${base}`)
  if (q.error || !q.data) return null
  return { count: q.data.length, cents: q.data.reduce((s, r) => s + Number(r.price_paid_cents ?? 0) + Number(r.ce_paid_cents ?? 0), 0) }
}
