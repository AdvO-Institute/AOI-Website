/* ----------------------------------------------------------------------------
 * Getting members into the members area.
 *
 * The site can check a password but cannot create an account, so every one of
 * these calls goes to the `member-access` edge function, which holds the only
 * key that can. Nothing here ever sees or sets a password: the function asks
 * Supabase for a one-time link and emails it in the Institute's own design.
 * -------------------------------------------------------------------------- */
import { invoke } from '@/lib/supabase'

export type AccessReply = { ok?: boolean; message?: string; error?: string; detail?: string; email?: string; name?: string }
export type InviteRow = { id?: string; name: string; email?: string | null; ok?: boolean; would_invite?: boolean; detail?: string }

/** A member setting themself up. Answers the same way whatever the address, so
 *  the form cannot be used to find out who is a member. */
export const activateAccount = (email: string) => invoke<AccessReply>('member-access', { action: 'activate', email })

/** Forgot password. Sent through the Institute's own mail, not Supabase's. */
export const requestReset = (email: string) => invoke<AccessReply>('member-access', { action: 'reset', email })

/** Staff: create this person's login if needed and email them the setup link. */
export const inviteMember = (personId: string, email?: string) =>
  invoke<AccessReply>('member-access', { action: 'invite', person_id: personId, ...(email ? { email } : {}) })

/** Staff: every current member who has no login yet. `dryRun` only lists them;
 *  `personIds` limits the send to the people ticked in the list. */
export const inviteAllMembers = (dryRun = true, personIds?: string[]) =>
  invoke<{ count: number; dry_run: boolean; results: InviteRow[]; error?: string }>('member-access', { action: 'invite_all', dry_run: dryRun, ...(personIds ? { person_ids: personIds } : {}) })

/** "Email me a sign-in link", in the Institute's design. Answers the same way
 *  whatever the address. */
export const requestSignInLink = (email: string) => invoke<AccessReply>('member-access', { action: 'signin', email })

/** Staff: who has a login, and when each last signed in, keyed by person id. */
export const loginStatus = () =>
  invoke<{ ok?: boolean; logins?: Record<string, { last_sign_in_at: string | null }>; error?: string }>('member-access', { action: 'status' })
