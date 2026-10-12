/* ----------------------------------------------------------------------------
 * Roles & Access.
 *
 * The one administrative screen. Assigning a role here is the whole act: the
 * capability list, the rail, and the row-level policies all read the same
 * person_roles rows, so access follows the assignment with nothing else to do.
 *
 * Who may use it is decided by the database, not by this component — the tab
 * only appears when get_my_access() reports can_admin_roles, and the writes
 * below are refused by RLS for anyone else even if they reach them.
 * -------------------------------------------------------------------------- */
import { useCallback, useEffect, useState } from 'react'
import { useAccess } from '@/lib/queries/AccessProvider'
import { roster, committees } from '@/lib/queries/member'
import type { RosterRow } from '@/lib/queries/member'
import { insert, remove } from '@/lib/supabase'
import { ROLE_LABEL } from '@/lib/access'
import { roleChipClass } from '@/lib/chips'

type Committee = { id: number; key: string; name: string }

/** Roles that stand alone. */
const PLAIN_ROLES = ['executive_director', 'board_member', 'instructor'] as const
/** Roles that need a committee. */
const COMMITTEE_ROLES = ['committee_chair', 'committee_cochair', 'committee_member'] as const

export default function RolesPanel() {
  const { access, refresh } = useAccess()
  const [rows, setRows] = useState<RosterRow[] | null>(null)
  const [coms, setComs] = useState<Committee[]>([])
  const [search, setSearch] = useState('')
  const [open, setOpen] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<string | null>(null)

  const load = useCallback(async (term: string) => {
    const [people, cs] = await Promise.all([roster(term), committees()])
    setRows(people)
    setComs(cs)
  }, [])

  useEffect(() => {
    void load('')
  }, [load])

  async function toggle(
    person: RosterRow,
    roleKey: string,
    committeeId: number | null,
    currentlyHas: boolean,
  ) {
    setBusy(true)
    setMessage(null)
    const label = `${person.first_name} ${person.last_name}`
    const result = currentlyHas
      ? await remove(
          'person_roles',
          `person_id=eq.${person.id}&role_key=eq.${roleKey}` +
            (committeeId === null ? '&committee_id=is.null' : `&committee_id=eq.${committeeId}`),
        )
      : await insert('person_roles', [
          { person_id: person.id, role_key: roleKey, committee_id: committeeId },
        ])

    if (result.error) {
      setMessage(
        `That change was refused. You may not have permission to assign roles, or the record is locked. Nothing was saved.`,
      )
    } else {
      setMessage(
        `${currentlyHas ? 'Removed' : 'Assigned'} ${ROLE_LABEL[roleKey] ?? roleKey} for ${label}. Their access updates the next time they load the page.`,
      )
      await load(search)
      // If the change was to your own roles, your own rail updates immediately.
      if (person.id === access.person?.id) await refresh()
    }
    setBusy(false)
  }

  const has = (person: RosterRow, roleKey: string, committeeId: number | null) =>
    (person.person_roles ?? []).some(
      (r) => r.role_key === roleKey && (r.committee_id ?? null) === committeeId,
    )

  return (
    <>
      <h1>Roles &amp; Access</h1>
      <div className="ma-sub">
        Assigning a role is the only step. What a person sees, and what the database will let them
        read or change, both follow from the rows below.
      </div>

      <div className="ma-panel" style={{ marginBottom: '16px' }}>
        <label className="flabel" htmlFor="roster-search">
          FIND A PERSON
        </label>
        <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
          <input
            className="fi"
            id="roster-search"
            placeholder="Name or email"
            value={search}
            style={{ flex: 1, minWidth: '220px' }}
            onChange={(e) => setSearch(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') void load(search)
            }}
          />
          <button type="button" className="b sm p-btn" onClick={() => void load(search)}>
            Search
          </button>
        </div>
        <p className="ma-empty" style={{ marginTop: '8px' }}>
          {search
            ? 'Showing matches from the whole rolodex.'
            : 'Showing everyone who currently holds a role. Search to find anyone else.'}
        </p>
      </div>

      {message && <div className="ma-note">{message}</div>}

      <div className="ma-panel" style={{ marginTop: '16px' }}>
        {rows === null ? (
          <p className="ma-empty">Reading the roster…</p>
        ) : rows.length === 0 ? (
          <p className="ma-empty">No one matched that search.</p>
        ) : (
          rows.map((person) => {
            const roles = person.person_roles ?? []
            const isOpen = open === person.id
            return (
              <div className="ma-row" key={person.id} style={{ alignItems: 'flex-start' }}>
                <div style={{ flex: 1, minWidth: '240px' }}>
                  <b>
                    {person.first_name} {person.last_name}
                  </b>
                  <span>{person.email ?? 'No email on file'}</span>
                  <div className="ma-chips" style={{ marginTop: '6px' }}>
                    {roles.length === 0 ? (
                      <span className="cpill">NO ROLES</span>
                    ) : (
                      roles.map((r, i) => (
                        <span className={roleChipClass(r.role_key)} key={i}>
                          {(ROLE_LABEL[r.role_key] ?? r.role_key).toUpperCase()}
                          {r.committee_id
                            ? ` · ${(coms.find((c) => c.id === r.committee_id)?.name ?? '').replace(/ Committee.*/, '')}`
                            : ''}
                        </span>
                      ))
                    )}
                  </div>

                  {isOpen && (
                    <div style={{ marginTop: '14px' }}>
                      <div className="flabel">INSTITUTE ROLES</div>
                      <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginBottom: '14px' }}>
                        {PLAIN_ROLES.map((roleKey) => {
                          const on = has(person, roleKey, null)
                          return (
                            <button
                              type="button"
                              key={roleKey}
                              className={`b sm ${on ? 'p-btn' : 's-btn on-light'}`}
                              disabled={busy}
                              aria-pressed={on}
                              onClick={() => void toggle(person, roleKey, null, on)}
                            >
                              {ROLE_LABEL[roleKey]}
                            </button>
                          )
                        })}
                      </div>

                      <div className="flabel">COMMITTEE SEATS</div>
                      {coms.map((committee) => (
                        <div
                          key={committee.id}
                          style={{
                            display: 'flex',
                            gap: '8px',
                            flexWrap: 'wrap',
                            alignItems: 'center',
                            padding: '6px 0',
                          }}
                        >
                          <span style={{ minWidth: '170px', fontSize: '13.5px' }}>
                            {committee.name.replace(/ Committee.*/, '')}
                          </span>
                          {COMMITTEE_ROLES.map((roleKey) => {
                            const on = has(person, roleKey, committee.id)
                            return (
                              <button
                                type="button"
                                key={roleKey}
                                className={`b sm ${on ? 'p-btn' : 's-btn on-light'}`}
                                disabled={busy}
                                aria-pressed={on}
                                onClick={() => void toggle(person, roleKey, committee.id, on)}
                              >
                                {roleKey === 'committee_chair'
                                  ? 'Chair'
                                  : roleKey === 'committee_cochair'
                                    ? 'Co-Chair'
                                    : 'Member'}
                              </button>
                            )
                          })}
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <button
                  type="button"
                  className="b sm s-btn on-light"
                  onClick={() => setOpen(isOpen ? null : person.id)}
                >
                  {isOpen ? 'Done' : 'Change roles'}
                </button>
              </div>
            )
          })
        )}
      </div>

      <div className="ma-note">
        <b>Why this is the only screen you need.</b> The rail each person sees, and every row the
        database will hand them, are both derived from these assignments. There is no second place
        to grant access, and nothing to keep in step by hand.
      </div>
    </>
  )
}
