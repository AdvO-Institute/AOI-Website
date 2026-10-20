/* ----------------------------------------------------------------------------
 * The member-area navigation.
 *
 * Ported from the tab map in CCI OS, with one structural change: CCI OS keyed
 * tabs to a role name, which meant a committee chair who was not also a board
 * member fell through to the member list of tabs. Here each tab declares the
 * capabilities that reveal it, and the capabilities come from the roles a
 * person actually holds. Seat someone on a committee and their tab appears;
 * remove them and it goes. Nothing is hard-coded per person.
 *
 * `group` is what the rail prints as a section heading. An item with `under`
 * is not in the rail at all: it is a tab on its parent's page, which keeps the
 * rail short enough to see whole.
 * -------------------------------------------------------------------------- */
import type { Access, Capability } from './access'

export type NavGroup = 'home' | 'mycommittees' | 'events' | 'library' | 'work' | 'people' | 'committees' | 'admin'

export type NavItem = {
  key: string
  label: string
  group: NavGroup
  /** Any one of these capabilities reveals the tab. */
  any?: Capability[]
  /** Shown to every signed-in person. */
  always?: boolean
  /** A last gate for things a capability alone cannot express. */
  when?: (access: Access) => boolean
  /** Not in the rail: a tab inside the page of the item with this key. */
  under?: string
  /** The item's name on its own page's tab row, when it differs from the rail. */
  tabLabel?: string
  /** The committee this item belongs to — a stem matched against the committee's key or name. */
  committee?: string
}

/** Does a committee row match a stem? Key first, name as the fallback ("nominat" finds "Nominations and Elections"). */
export function isCommittee(c: { key: string; name: string }, stem: string): boolean {
  return c.key.startsWith(stem) || c.name.toLowerCase().includes(stem)
}

/** A committee with no page of its own yet: Board, administrators and its own members see it; it opens its reports. */
const committeeOnly = (stem: string) => (a: Access) =>
  a.capabilities.includes('board') || a.capabilities.includes('full_admin') || a.committees.some((c) => isCommittee(c, stem))

/** Every management surface — used where a tab opens to anyone who runs anything. */
const MANAGES: Capability[] = [
  'manage_seminars',
  'manage_certifications',
  'manage_instructors',
  'manage_internships',
  'manage_research',
  'manage_board',
  'manage_leads',
  'manage_marketing',
  'manage_curriculum',
  'manage_colleges',
  'manage_finance',
  'committee_tools',
]

const LEADERSHIP: Capability[] = ['board', 'full_admin', ...MANAGES]

export const NAV: NavItem[] = [
  { key: 'overview', label: 'Overview', group: 'home', always: true },

  /* ----------------------------------------------------------- my account --
   * A member owns this data and there is nowhere else to reach it. CCI OS gave
   * the member role only Events and Calendar, which left certification, CE and
   * the directory listing with no home. One rail item; the four are its tabs. */
  { key: 'membership', label: 'My Account', tabLabel: 'Membership', group: 'home', always: true },
  { key: 'mycert', label: 'My Certification', tabLabel: 'Certification', group: 'home', under: 'membership', always: true },
  { key: 'myce', label: 'My CE', tabLabel: 'CE', group: 'home', under: 'membership', always: true },
  {
    key: 'mylisting',
    label: 'My Listing',
    tabLabel: 'Listing',
    group: 'home',
    under: 'membership',
    always: true,
    // The directory is reserved to certified doctors at Level 1 or above.
    when: (a) => ['level_1', 'level_2'].includes(a.person?.cert_level ?? ''),
  },

  /* --------------------------------------------------------------- events -- */
  { key: 'events', label: 'Events', group: 'events', always: true },
  { key: 'calendar', label: 'Calendar', group: 'events', always: true },

  /* -------------------------------------------------------------- library --
   * The Research Committee's Upper Cervical Research Library, open to every
   * signed-in person. Separate from Committees → Research, which is the
   * committee's own project tool (#213). */
  { key: 'library', label: 'Research Library', group: 'library', always: true },

  /* ----------------------------------------------------------------- work -- */
  // Tasks: anyone with a role can be assigned, so anyone with a role sees the tab.
  { key: 'tasks', label: 'Tasks', group: 'work', any: [...LEADERSHIP, 'instructor_tools'], when: (a) => a.roles.length > 0 || a.capabilities.includes('full_admin') },
  // Reports: every committee seat can read their committee's submitted reports; chairs file them.
  { key: 'reports', label: 'Reports', group: 'work', any: LEADERSHIP, when: (a) => a.committees.length > 0 || a.capabilities.includes('board') || a.capabilities.includes('full_admin') },
  { key: 'records', label: 'Records', group: 'work', any: LEADERSHIP, when: (a) => a.committees.length > 0 || a.capabilities.includes('board') || a.capabilities.includes('full_admin') },
  { key: 'stats', label: 'Stats', group: 'work', any: [...LEADERSHIP, 'instructor_tools'] },
  { key: 'email', label: 'Email', group: 'work', any: ['full_admin', 'instructor_tools', ...MANAGES] },
  // How to reach the Institute's shared passwords (Vaultwarden); the passwords themselves never pass through this site.
  { key: 'vault', label: 'Password Manager', group: 'work', any: ['board'] },

  /* --------------------------------------------------------------- people -- */
  {
    key: 'directory',
    label: 'Directory',
    group: 'people',
    any: ['board', 'full_admin', 'manage_leads', 'manage_certifications', 'manage_instructors', 'manage_internships'],
  },
  { key: 'board', label: 'Board', group: 'people', any: ['board', 'manage_board'] },
  { key: 'org', label: 'Org Chart', group: 'people', any: ['board', 'full_admin'] },

  /* ----------------------------------------------------------- committees --
   * In the Institute's own numbering (the committee folders, 01–10). Five have
   * a page of their own; the rest open their monthly reports until they do. */
  { key: 'instructors', label: 'Instructor', committee: 'instructor', group: 'committees', any: ['manage_instructors', 'manage_seminars', 'board', 'full_admin'] },
  { key: 'c-curriculum', label: 'Curriculum', committee: 'curriculum', group: 'committees', when: committeeOnly('curriculum') },
  { key: 'c-seminar', label: 'Seminar', committee: 'seminar', group: 'committees', when: committeeOnly('seminar') },
  { key: 'colleges', label: 'College Outreach', committee: 'college', group: 'committees', any: ['manage_colleges', 'manage_internships', 'board', 'full_admin'] },
  { key: 'internships', label: 'Internship', committee: 'internship', group: 'committees', any: ['manage_internships', 'manage_certifications', 'board', 'full_admin'] },
  { key: 'certification', label: 'Certification', committee: 'certification', group: 'committees', any: ['manage_certifications', 'board', 'full_admin'] },
  { key: 'research', label: 'Research', committee: 'research', group: 'committees', any: ['manage_research', 'board', 'full_admin'] },
  { key: 'c-marketing', label: 'Marketing', committee: 'marketing', group: 'committees', when: committeeOnly('marketing') },
  { key: 'c-nominations', label: 'Nominations & Elections', committee: 'nominat', group: 'committees', when: committeeOnly('nominat') },
  { key: 'c-collaboration', label: 'Collaboration', committee: 'collaborat', group: 'committees', when: committeeOnly('collaborat') },

  /* ---------------------------------------------------------------- admin -- */
  // The Executive Director's cockpit — the role, not the capability, so a Board member or administrator never sees it.
  { key: 'control', label: 'Control center', group: 'admin', any: ['full_admin'], when: (a) => a.staff_role === 'executive_director' || a.roles.some((r) => r.role_key === 'executive_director') },
  { key: 'roles', label: 'Roles & Access', group: 'admin', when: (a) => a.can_admin_roles },
  { key: 'oversight', label: 'Full CCI OS', group: 'admin', any: ['full_admin'] },
]

export const GROUP_LABEL: Record<NavGroup, string> = {
  home: 'Home',
  mycommittees: 'My Committees',
  events: 'Events',
  library: 'Library',
  work: 'Work',
  people: 'People',
  committees: 'Committees',
  admin: 'Administration',
}

export function canSee(item: NavItem, access: Access): boolean {
  // `when` is a veto: it can only ever remove a tab.
  if (item.when && !item.when(access)) return false
  if (item.always) return true
  if (item.any) return item.any.some((c) => access.capabilities.includes(c))
  // No capability list means `when` was the whole gate, and it passed.
  return Boolean(item.when)
}

/** Groups that fold shut in the rail until opened, or until you are in one. */
export const FOLDS: NavGroup[] = ['work', 'people', 'committees', 'admin']

/** Every tab this person may open, grouped, with empty groups dropped. The rail skips `under` items. */
export function navFor(access: Access): { group: NavGroup; items: NavItem[] }[] {
  const order: NavGroup[] = ['home', 'mycommittees', 'events', 'library', 'work', 'people', 'committees', 'admin']
  // Committees this person chairs or co-chairs get their own group near the top, still in 01–10 order.
  const chairs = (i: NavItem) => Boolean(i.committee) && access.committees.some((c) => c.leads && isCommittee(c, i.committee!))
  return order
    .map((group) => ({
      group,
      items: NAV.filter((i) => canSee(i, access) && (group === 'mycommittees' ? i.group === 'committees' && chairs(i) : i.group === group && !(group === 'committees' && chairs(i)))),
    }))
    .filter((g) => g.items.length > 0)
}

export function findNav(key: string): NavItem | undefined {
  return NAV.find((i) => i.key === key)
}

/** The rail item a tab lives under — itself, unless it is a tab on another page. */
export function railKey(key: string): string {
  return findNav(key)?.under ?? key
}
