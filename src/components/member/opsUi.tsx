/* Small shared pieces for the operations tabs (Tasks, Reports, Calendar, Stats, Records) and the shared dialog every members-area panel uses. */
import { useEffect, useRef, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { friendlyError } from '@/lib/friendlyError'
import { safeHref } from '@/lib/safeHref'

export function Pill({ kind = '', children }: { kind?: string; children: React.ReactNode }) { return <span className={`cpill ${kind}`}>{children}</span> }
export function F({ l, children, full = false, hint }: { l: string; children: React.ReactNode; full?: boolean; hint?: string }) { return <div className={full ? 'full' : ''}><label className="flabel">{l}</label>{children}{hint && <div className="evt-hint">{hint}</div>}</div> }
export function useEsc(onClose: () => void) { useEffect(() => { const k = (e: KeyboardEvent) => e.key === 'Escape' && onClose(); document.addEventListener('keydown', k); return () => document.removeEventListener('keydown', k) }, [onClose]) }
export function friendly(err: string, who = 'the Executive Director or the Board'): string {
  if (/locked/.test(err)) return 'This report is locked — the Board meeting it was filed for has passed. The Executive Director can unlock it.'
  if (/row-level security|42501|not authorized/.test(err)) return `You don’t have permission for that. Only ${who} can make this change.`
  return friendlyError(err)
}
/** A link to an address typed into the database. It becomes an anchor only
 *  when the address is plainly a web URL; anything else is shown as text. */
export function SafeLink({ href, children, className }: { href: string | null | undefined; children: React.ReactNode; className?: string }) {
  const h = safeHref(href)
  return h ? <a className={className} href={h} target="_blank" rel="noopener noreferrer">{children}</a> : <span className="muted">{children}</span>
}
export function Modal({ children, wide = false, onClose, cls = '' }: { children: React.ReactNode; wide?: boolean; onClose: () => void; cls?: string }) {
  useEsc(onClose)
  return <div className="cert-veil" onClick={(e) => e.target === e.currentTarget && onClose()}><div className={`cert-modal ${wide ? 'wide' : ''} ${cls}`} role="dialog" aria-modal="true">{children}</div></div>
}
export function Head({ title, lede, right }: { title: string; lede: React.ReactNode; right?: React.ReactNode }) {
  return <div className="cert-head"><div><h1>{title}</h1><div className="ma-sub" style={{ marginBottom: 0, maxWidth: '80ch' }}>{lede}</div></div>{right && <div className="cert-actions">{right}</div>}</div>
}
export function Sec({ children, r }: { children: React.ReactNode; r?: React.ReactNode }) { return <div className="ogrp">{children}{r && <span className="r">{r}</span>}</div> }
export const todayLocal = () => new Date().toISOString().slice(0, 10)

/* ── Shared dialog: confirm, ask for text, a small form, or a plain notice ──
   Replaces the browser's confirm()/prompt()/alert() boxes, which are unstyled, say
   "localhost says" and fail in iOS standalone mode. Same look as the "Remove …?" veil.
   Each helper returns a promise, so a call site reads like the native box it replaces:
     if (!(await askConfirm('Delete this task?', { ok: 'Delete', danger: true }))) return */
export type AskField = { key: string; label: string; initial?: string; placeholder?: string; required?: boolean; full?: boolean }
type AskOpts = {
  title: string
  body?: React.ReactNode
  ok?: string
  cancel?: string | null
  danger?: boolean
  fields?: AskField[]
  /** The person must type this exactly before the main button unlocks. */
  typeToConfirm?: string
}
type AskResult = Record<string, string> | null

export function AskDialog({ title, body, ok = 'OK', cancel = 'Cancel', danger = false, fields = [], typeToConfirm, onDone }: AskOpts & { onDone: (r: AskResult) => void }) {
  const [vals, setVals] = useState<Record<string, string>>(() => Object.fromEntries(fields.map((f) => [f.key, f.initial ?? ''])))
  const [typed, setTyped] = useState('')
  const okRef = useRef<HTMLButtonElement>(null)
  useEffect(() => {
    // Capture phase on window: Escape closes only this dialog, not a form open underneath it.
    const k = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.stopPropagation(); onDone(null) } }
    window.addEventListener('keydown', k, true); return () => window.removeEventListener('keydown', k, true)
  }, [onDone])
  useEffect(() => { if (!fields.length && !typeToConfirm) okRef.current?.focus() }, [fields.length, typeToConfirm])
  const ready = fields.every((f) => !f.required || (vals[f.key] ?? '').trim()) && (!typeToConfirm || typed.trim() === typeToConfirm.trim())
  const submit = (e: React.FormEvent) => { e.preventDefault(); if (ready) onDone(Object.fromEntries(Object.entries(vals).map(([k, v]) => [k, v.trim()]))) }
  return (
    <div className="cert-veil ask-veil" onClick={(e) => e.target === e.currentTarget && onDone(null)}>
      <form className="cert-modal ask-modal" role={cancel === null ? 'alertdialog' : 'dialog'} aria-modal="true" aria-labelledby="ask-title" onSubmit={submit}>
        <div className="mh"><div><h3 id="ask-title">{title}</h3>{body && <p>{body}</p>}</div><button type="button" className="x" aria-label="Close" onClick={() => onDone(null)}>×</button></div>
        {(fields.length > 0 || typeToConfirm) && <div className="mb"><div className="mform">
          {fields.map((f, i) => <div key={f.key} className={f.full === false ? '' : 'full'}><label className="flabel" htmlFor={`ask-${f.key}`}>{f.label}</label><input id={`ask-${f.key}`} className="fi" autoFocus={i === 0} value={vals[f.key] ?? ''} placeholder={f.placeholder} onChange={(e) => setVals((s) => ({ ...s, [f.key]: e.target.value }))} /></div>)}
          {typeToConfirm && <div className="full"><label className="flabel" htmlFor="ask-typed">Type “{typeToConfirm}” to confirm</label><input id="ask-typed" className="fi" autoFocus={!fields.length} autoComplete="off" value={typed} onChange={(e) => setTyped(e.target.value)} /></div>}
        </div></div>}
        <div className="mf">{cancel !== null && <button type="button" className="b s-btn on-light sm" onClick={() => onDone(null)}>{cancel}</button>}<button ref={okRef} type="submit" className={`b ${danger ? 'dgr' : 'p-btn'} sm`} disabled={!ready}>{ok}</button></div>
      </form>
    </div>
  )
}

/** Opens one AskDialog on top of everything and resolves when it closes. */
export function ask(opts: AskOpts): Promise<AskResult> {
  return new Promise((resolve) => {
    const host = document.createElement('div'); document.body.appendChild(host)
    const root = createRoot(host)
    const back = document.activeElement as HTMLElement | null
    const done = (r: AskResult) => { root.unmount(); host.remove(); back?.focus?.(); resolve(r) }
    root.render(<AskDialog {...opts} onDone={done} />)
  })
}
/** A yes/no question. Resolves true only when the main button is pressed. */
export const askConfirm = async (title: string, o: Omit<AskOpts, 'title' | 'fields'> = {}) => (await ask({ title, ok: 'OK', ...o })) !== null
/** One line of text. Resolves the trimmed text, or null when canceled. */
export const askText = async (title: string, f: Omit<AskField, 'key'>, o: Omit<AskOpts, 'title' | 'fields'> = {}) => { const r = await ask({ title, ...o, fields: [{ ...f, key: 'v' }] }); return r ? r.v ?? '' : null }
/** A small form. Resolves the trimmed values by key, or null when canceled. */
export const askForm = (title: string, fields: AskField[], o: Omit<AskOpts, 'title' | 'fields'> = {}) => ask({ title, ...o, fields })
/** A plain message with a single button. */
export const notice = async (title: string, body?: React.ReactNode) => { await ask({ title, body, ok: 'OK', cancel: null }) }
