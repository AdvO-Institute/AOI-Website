/* ----------------------------------------------------------------------------
 * Chip vocabulary — the one place that decides what a chip says and what
 * color it is. Six meanings, one color each:
 *   gold  – a person's highest certification (and keystone events)
 *   cert  – any other certification level (blue)
 *   (none)– who someone is or where they are: roles, committees, schools
 *   leader– a leadership role: Executive Director, Director, Chair (navy)
 *   ok    – done / filed / paid / current
 *   warn  – draft / pending / expiring / urgent
 *   bad   – missing / overdue / cancelled / lapsed
 * -------------------------------------------------------------------------- */

export type ChipKind = '' | 'gold' | 'cert' | 'leader' | 'ok' | 'warn' | 'bad'
export type Chip = { key: string; kind: ChipKind; label: string; title?: string }

/** Level keys → how the Institute says them. */
export const CERT_LABEL: Record<string, string> = {
  none: 'Not certified',
  student: 'Student Certification',
  level_1: 'Certified Level 1',
  level_2: 'Certified Level 2',
  certified: 'Certified',
  board_certification: 'Board Certified',
}
/** Short form for tight spots (tables, tiles). */
export const CERT_SHORT: Record<string, string> = {
  none: '—', student: 'Student', level_1: 'Level 1', level_2: 'Level 2', certified: 'Certified', board_certification: 'Board Certified',
}
/** Technique names as they read on a chip. */
export const TECH_SHORT: Record<string, string> = {
  'Advanced Orthogonal': 'AdvO', 'Atlas Orthogonal': 'Atlas Orthogonal', 'Atlas Orthometrics': 'Atlas Orthometrics',
  Orthospinology: 'Orthospinology', EPIC: 'Epic', NUCCA: 'NUCCA', Blair: 'Blair',
}
const RANK: Record<string, number> = { student: 1, level_1: 2, level_2: 3, certified: 2, board_certification: 3 }

/** Role keys → titles. Board members are Directors; there is one Executive Director. */
export const ROLE_TITLE: Record<string, string> = {
  executive_director: 'Executive Director',
  past_executive_director: 'Past Executive Director',
  board_member: 'Director',
  past_board_member: 'Past Director',
  treasurer: 'Treasurer',
  research_director: 'Research Director',
  committee_chair: 'Chair',
  committee_cochair: 'Co-chair',
  committee_member: 'Member',
  instructor: 'Instructor',
}
/** Roles that lead the Institute; their chips are navy ('leader'), never gold. */
export const LEADER_ROLES = new Set(['executive_director', 'board_member', 'committee_chair'])
/** The chip class for a role: 'cpill leader' for leadership roles, plain 'cpill' otherwise. */
export const roleChipClass = (roleKey: string) => (LEADER_ROLES.has(roleKey) ? 'cpill leader' : 'cpill')
export const INSTRUCTOR_TITLE: Record<string, string> = { instructor: 'Instructor', level_1: 'Instructor', level_2: 'Senior Instructor', senior_instructor: 'Senior Instructor' }

type CertLike = { id?: number; technique: string | null; level: string | null }
type RoleLike = { id?: number; role_key: string; instructor_level?: string | null; committees?: { name: string } | null }

/** Certification chips: the person's highest certification is gold, the rest blue.
 *  `advo` is the resolved Advanced Orthogonal level ('' when none). */
export function certChips(advo: string, others: CertLike[]): Chip[] {
  const out: Chip[] = []
  if (advo && advo !== 'none') out.push({ key: 'advo', kind: 'cert', label: CERT_LABEL[advo] ?? advo, title: `Advanced Orthogonal · ${CERT_LABEL[advo] ?? advo}` })
  for (const c of others) {
    if (!c.technique || !c.level || c.level === 'none') continue
    const tech = TECH_SHORT[c.technique] ?? c.technique
    const lvl = c.level === 'certified' ? 'Certified' : c.level === 'board_certification' ? 'Board Certified' : (CERT_LABEL[c.level] ?? c.level)
    out.push({ key: `c${c.id ?? c.technique}`, kind: 'cert', label: `${tech} ${lvl}`, title: `${c.technique} · ${lvl}` })
  }
  // gold = the single highest
  let best = -1, bi = -1
  const rank = (label: string, lvl: string) => (RANK[lvl] ?? 0) + (label.startsWith('Certified') || label.startsWith('Student') ? 0.5 : 0) // AdvO wins ties
  out.forEach((c, i) => {
    const lvl = c.key === 'advo' ? advo : (others.find((o) => `c${o.id ?? o.technique}` === c.key)?.level ?? '')
    const r = rank(c.label, lvl)
    if (r > best) { best = r; bi = i }
  })
  if (bi >= 0) out[bi]!.kind = 'gold'
  return out
}

/** Role chips, neutral. Order: Executive Director, Director, Treasurer, Research Director, committee seats, instructor. */
export function roleChips(roles: RoleLike[], opts: { director?: boolean; nominee?: boolean; instructorLevel?: string | null; pastDirector?: boolean } = {}): Chip[] {
  const out: Chip[] = []
  const has = (k: string) => roles.some((r) => r.role_key === k)
  if (has('executive_director')) out.push({ key: 'ed', kind: '', label: 'Executive Director' })
  if (opts.director || has('board_member')) out.push({ key: 'dir', kind: '', label: 'Director' })
  else if (opts.nominee) out.push({ key: 'nom', kind: '', label: 'Director Nominee' })
  else if (opts.pastDirector || has('past_board_member')) out.push({ key: 'pdir', kind: '', label: 'Past Director' })
  if (has('treasurer')) out.push({ key: 'tr', kind: '', label: 'Treasurer' })
  if (has('research_director')) out.push({ key: 'rd', kind: '', label: 'Research Director' })
  for (const r of roles) {
    if (!r.committees?.name || !['committee_chair', 'committee_cochair', 'committee_member'].includes(r.role_key)) continue
    out.push({ key: `r${r.id ?? r.committees.name}`, kind: '', label: `${r.committees.name.replace(' Committee', '')} ${ROLE_TITLE[r.role_key]}` })
  }
  const il = opts.instructorLevel ?? roles.find((r) => r.role_key === 'instructor')?.instructor_level ?? (has('instructor') ? 'instructor' : null)
  if (il) out.push({ key: 'in', kind: '', label: INSTRUCTOR_TITLE[il] ?? 'Instructor' })
  return out
}
