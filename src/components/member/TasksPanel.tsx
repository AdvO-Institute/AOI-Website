/* ----------------------------------------------------------------------------
 * Tasks — Open · Done · All. Completing and checking off are separate acts,
 * each stamped with name, role and time. The ED and Board manage; a chair
 * sees their committee's tasks; an assignee sees and can complete their own.
 * -------------------------------------------------------------------------- */
import { friendlyError } from '@/lib/friendlyError'
import { useCallback, useEffect, useState } from 'react'
import { useAccess } from '@/lib/queries/AccessProvider'
import { useToast } from '@/components/ui/Toast'
import { displayName, primaryRole } from '@/lib/access'
import { tasks as loadTasks, assignable, createTask, updateTask, completeTask, reopenTask, verifyTask, deleteTask, dayDiff, isOverdue, fmtD, fmtTs } from '@/lib/queries/tasks'
import type { Task, Assignee, Who, TaskInput } from '@/lib/queries/tasks'
import { committees as loadCommittees } from '@/lib/queries/reports'
import type { Committee } from '@/lib/queries/reports'
import { logActivity } from '@/lib/queries/attention'
import { Pill, F, Modal, Head, Sec, friendly, askConfirm } from './opsUi'

export default function TasksPanel() {
  const toast = useToast()
  const { access, can } = useAccess()
  const who: Who = { name: displayName(access).replace(/,.*$/, ''), id: access.person?.id ?? null, role: primaryRole(access) }
  const canManage = can('full_admin') || can('board')
  const [rows, setRows] = useState<Task[]>([]); const [coms, setComs] = useState<Committee[]>([]); const [loading, setLoading] = useState(true); const [error, setError] = useState<string | null>(null)
  const [filter, setFilter] = useState<'open' | 'done' | 'all'>('open'); const [q, setQ] = useState('')
  const [edit, setEdit] = useState<Task | null | 'new'>(null)

  const load = useCallback(async () => {
    const [r, c] = await Promise.all([loadTasks(), loadCommittees()])
    setError(r.error ? `The tasks could not be read. ${friendlyError(r.error)}` : null)
    setRows(r.rows); setComs(c); setLoading(false)
  }, [])
  useEffect(() => { void load() }, [load])

  const me = access.person?.id ?? null
  const open = rows.filter((t) => t.status === 'open'), done = rows.filter((t) => t.status === 'done')
  const overdue = open.filter(isOverdue).length
  const lq = q.trim().toLowerCase()
  const list = (filter === 'open' ? open : filter === 'done' ? done : rows).filter((t) => !lq || `${t.title} ${t.description ?? ''} ${t.assigned_name ?? ''} ${t.committees?.name ?? ''}`.toLowerCase().includes(lq))
    .sort((a, b) => (a.status === b.status ? 0 : a.status === 'open' ? -1 : 1) || (a.due_date ?? '9999').localeCompare(b.due_date ?? '9999'))
  const mine = list.filter((t) => t.assigned_person_id === me), others = list.filter((t) => t.assigned_person_id !== me)

  async function act(p: Promise<{ ok?: true; error?: string }>, msg: string) {
    const r = await p; if (r.error) return toast(friendly(r.error)); await load(); toast(msg); void logActivity('write', 'tasks', { action: msg })
  }
  const card = (t: Task) => {
    const d = t.due_date ? dayDiff(t.due_date) : null
    const dueCls = t.status === 'open' && d !== null ? (d < 0 ? 'over' : d <= 3 ? 'soon' : '') : ''
    const canTick = canManage || t.assigned_person_id === me
    return <div key={t.id} className={`task ${t.status} ${t.assigned_person_id === me ? 'mine' : ''}`}>
      <input type="checkbox" checked={t.status === 'done'} disabled={!canTick} aria-label="Complete" onChange={(e) => void act(e.target.checked ? completeTask(t.id, who) : reopenTask(t.id), e.target.checked ? 'Marked done — stamped with your name and role' : 'Reopened — completion and check-off cleared')} />
      <div>
        <div className="tt"><b>{t.title}</b>{t.priority === 'urgent' && <Pill kind="warn">Urgent</Pill>}</div>
        <div className="tl"><span>→ {t.assigned_name ?? 'Unassigned'}</span>{t.committees?.name && <span>· {t.committees.name}</span>}{t.due_date && <span className={`due ${dueCls}`}>· due {fmtD(t.due_date)}{dueCls === 'over' ? ` (${-d!} day${-d! === 1 ? '' : 's'} overdue)` : dueCls === 'soon' ? (d === 0 ? ' (today)' : ` (in ${d} day${d === 1 ? '' : 's'})`) : ''}</span>}</div>
        {t.description && <div className="td">{t.description}</div>}
        {t.status === 'done' && t.completed_at && <div className="stamp ok">✓ Done by {t.completed_by_name} ({t.completed_by_role}) · {fmtTs(t.completed_at)}</div>}
        {t.verified_at && <div className="stamp ver">☑ Checked off by {t.verified_by_name} ({t.verified_by_role}) · {fmtTs(t.verified_at)}</div>}
      </div>
      <div className="ta">
        {canManage && t.status === 'done' && !t.verified_at && <button type="button" className="b s-btn on-light xs" onClick={() => void act(verifyTask(t.id, who), 'Checked off')}>Check off</button>}
        {canManage && t.status === 'open' && <button type="button" className="b s-btn on-light xs" onClick={() => setEdit(t)}>Edit</button>}
        {canManage && <button type="button" className="x" title="Delete" onClick={async () => { if (await askConfirm('Delete this task?', { body: 'This cannot be undone.', ok: 'Delete', danger: true })) void act(deleteTask(t.id), 'Task deleted') }}>×</button>}
      </div>
    </div>
  }

  if (loading) return <><h1>Tasks</h1><div className="ma-sub">Reading the task list…</div><div className="ma-panel"><p className="ma-empty">One moment.</p></div></>
  return <>
    <Head title="Tasks" lede={<>Assignments across the Board and committees. Completing a task and checking it off are two separate acts, each stamped with who, their role and when.{!canManage && <> You see the tasks assigned to you{access.committees.some((c) => c.leads) ? ' and your committee’s' : ''}.</>}</>}
      right={canManage ? <button type="button" className="b p-btn sm" onClick={() => setEdit('new')}>+ Add task</button> : undefined} />
    {error && <div className="cert-err" role="alert">{error}</div>}
    <div className="cert-tiles three">
      <button type="button" className={`cert-tile${filter === 'open' ? ' on' : ''}`} onClick={() => setFilter('open')}><span>Open</span><b>{open.length}</b><i className={overdue ? 'warn-txt' : ''}>{overdue ? `${overdue} overdue` : 'nothing overdue'}</i></button>
      <button type="button" className={`cert-tile${filter === 'done' ? ' on' : ''}`} onClick={() => setFilter('done')}><span>Done</span><b>{done.length}</b><i>{done.filter((t) => !t.verified_at).length} awaiting check-off</i></button>
      <button type="button" className={`cert-tile${filter === 'all' ? ' on' : ''}`} onClick={() => setFilter('all')}><span>All</span><b>{rows.length}</b></button>
    </div>
    <div className="ctc-srow" style={{ gridTemplateColumns: '1fr' }}><div className="cert-search" style={{ margin: 0 }}>
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></svg>
      <input type="text" value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => e.key === 'Escape' && setQ('')} autoComplete="off" placeholder="Search tasks by title, person or committee…" aria-label="Search tasks" />
      {q && <button type="button" className="clr" aria-label="Clear search" onClick={() => setQ('')}>×</button>}</div></div>
    {list.length === 0 ? <div className="bnodata">{rows.length ? 'No tasks match.' : canManage ? 'No tasks yet — add the first one.' : 'Nothing assigned to you right now.'}</div> : <>
      {mine.length > 0 && <><Sec>Assigned to you</Sec>{mine.map(card)}</>}
      {others.length > 0 && <><Sec r="sorted open first, then by due date">{mine.length ? 'Everyone else' : 'All tasks'}</Sec>{others.map(card)}</>}
    </>}
    {edit && <TaskDialog t={edit === 'new' ? null : edit} coms={coms} onClose={() => setEdit(null)} onSaved={async (m) => { setEdit(null); setFilter('open'); await load(); toast(m); void logActivity('write', 'tasks', { action: m }) }} who={who} />}
  </>
}

function TaskDialog({ t, coms, onClose, onSaved, who }: { t: Task | null; coms: Committee[]; onClose: () => void; onSaved: (m: string) => void; who: Who }) {
  const toast = useToast()
  const [people, setPeople] = useState<Assignee[]>([]); const [saving, setSaving] = useState(false)
  const [v, setV] = useState<TaskInput>({ title: t?.title ?? '', description: t?.description ?? '', committee_id: t?.committee_id ?? null, assignee: t?.assigned_person_id ? { id: t.assigned_person_id, name: t.assigned_name ?? '', why: '' } : null, due_date: t?.due_date ?? '', priority: (t?.priority === 'urgent' ? 'urgent' : 'normal') })
  useEffect(() => { void assignable().then(setPeople) }, [])
  async function save() {
    if (!v.title.trim()) return toast('Give the task a title')
    setSaving(true)
    const r = t ? await updateTask(t.id, { ...v, title: v.title.trim() }) : await createTask({ ...v, title: v.title.trim() }, who)
    setSaving(false)
    if (r.error) return toast(friendly(r.error))
    onSaved(t ? 'Task updated' : 'Task added')
  }
  return <Modal onClose={onClose}>
    <div className="mh"><div><h3>{t ? 'Edit task' : 'Add task'}</h3><p>Anyone with a role — Board, chairs and co-chairs, the ED, Treasurer, instructors, past Board/ED, nominees, research investigators — can be assigned.</p></div><button type="button" className="x" onClick={onClose} aria-label="Close">×</button></div>
    <div className="mb"><div className="cert-grid mform evt-grid">
      <F l="Title" full><input className="fi" value={v.title} onChange={(e) => setV({ ...v, title: e.target.value })} placeholder="Required" autoFocus /></F>
      <F l="Description" full><textarea className="fi" value={v.description} onChange={(e) => setV({ ...v, description: e.target.value })} /></F>
      <F l="Assign to"><select className="fi" value={v.assignee?.id ?? ''} onChange={(e) => setV({ ...v, assignee: people.find((p) => p.id === e.target.value) ?? null })}><option value="">— unassigned —</option>{people.map((p) => <option key={p.id} value={p.id}>{p.name} · {p.why}</option>)}</select></F>
      <F l="Committee"><select className="fi" value={v.committee_id ?? ''} onChange={(e) => setV({ ...v, committee_id: e.target.value ? Number(e.target.value) : null })}><option value="">— none —</option>{coms.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></F>
      <F l="Due date"><input className="fi" type="date" value={v.due_date} onChange={(e) => setV({ ...v, due_date: e.target.value })} /></F>
      <F l="Priority"><select className="fi" value={v.priority} onChange={(e) => setV({ ...v, priority: e.target.value as 'normal' | 'urgent' })}><option value="normal">Normal</option><option value="urgent">Urgent</option></select></F>
    </div></div>
    <div className="mf"><button type="button" className="b s-btn on-light sm" onClick={onClose}>Cancel</button><button type="button" className="b p-btn sm" disabled={saving} onClick={() => void save()}>{saving ? 'Saving…' : t ? 'Save' : 'Add task'}</button></div>
  </Modal>
}
