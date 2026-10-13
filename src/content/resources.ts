/* ----------------------------------------------------------------------------
 * The Resources pages. Each seminar has its own page of materials, and each
 * Fundamentals session has one of its own (/resources/f1.1 … f3.4); the QR
 * code shown in a session points to that session's page. /resources lists them
 * all, with the quick links and partners that every page shares.
 *
 * To add a handout or link, copy a line in the right `items` list; to remove
 * one, delete it. `href` starting with `/` is a page on this site; anything
 * else opens in a new tab. Board members will edit these from the members area
 * once the Supabase side exists (#191), and the pages will move behind
 * membership: attending a seminar gives a year's access to its materials.
 * -------------------------------------------------------------------------- */
import { SEMINARS } from '@/content/seminars'

export type Resource = {
  title: string
  note?: string
  href: string
}

export type ResourcePage = {
  /** The address after /resources/. */
  slug: string
  /** The seminar it belongs to, a key of SEMINARS. */
  seminar: keyof typeof SEMINARS
  /** Which Fundamentals session (0–3); unset for a whole seminar. */
  session?: number
  items: Resource[]
}

const FUNDAMENTALS = ['fund1', 'fund2', 'fund3'] as const

/** Handouts and links for each page, by slug. A page left out has none yet. */
const MATERIALS: Record<string, Resource[]> = {
  'f1.1': [
    {
      title: 'New Terms & Glossary',
      note: 'The Advanced Orthogonal vocabulary in one place.',
      href: 'https://drive.google.com/file/d/1_9JtsFBGjF0w0Mdi8w8IS_Ai1HroIh_Z/view?usp=drive_link',
    },
    {
      title: 'Patient History Clues to Upper Cervical',
      note: 'What in a patient’s history points to an upper cervical problem.',
      href: 'https://drive.google.com/file/d/1Od3PUWZ_3SmoK8TzodAVhRVTFGIElTLS/view?usp=drive_link',
    },
  ],
}

export const RESOURCE_PAGES: ResourcePage[] = [
  ...FUNDAMENTALS.flatMap((seminar, f) =>
    [0, 1, 2, 3].map((session) => ({ slug: `f${f + 1}.${session + 1}`, seminar, session })),
  ),
  { slug: 'intensive', seminar: 'intensive' as const },
  { slug: 'bootcamp', seminar: 'bootcamp' as const },
  { slug: 'annual-conference', seminar: 'conference' as const },
].map((page) => ({ ...page, items: MATERIALS[page.slug] ?? [] }))

type AgendaDay = { items: { title: string }[] }

/** "Fundamental 1 · Session 1" or "AdvO Intensive". */
export function resourcePageLabel(page: ResourcePage): string {
  const seminar = SEMINARS[page.seminar]!
  return page.session === undefined
    ? seminar.title
    : `${seminar.title} · Session ${page.session + 1}`
}

/** The session's title from the seminar's agenda ("Introduction — Why AdvO"),
 *  or the seminar's own title for a whole-seminar page. */
export function resourcePageTitle(page: ResourcePage): string {
  const seminar = SEMINARS[page.seminar]!
  if (page.session === undefined) return seminar.title
  const agenda = seminar.agenda as AgendaDay[] | undefined
  return agenda?.[0]?.items[page.session]?.title ?? resourcePageLabel(page)
}

/** Shared by every Resources page. */
export const QUICK_LINKS: Resource[] = [
  {
    title: 'Seminars & Events',
    note: 'Fundamentals, the Intensive, Bootcamp and the Annual Conference.',
    href: '/seminars',
  },
  {
    title: 'Certification',
    note: 'What Level 1 and Level 2 certification involve.',
    href: '/certification',
  },
  {
    title: 'Membership',
    note: 'What membership includes, and how to join.',
    href: '/membership',
  },
  {
    title: 'Suggest an Update',
    note: 'Tell the Institute what to add or change in the technique materials.',
    href: 'https://forms.gle/vYx5SLMvkzrnf9uy6',
  },
]

export type Partner = {
  name: string
  href: string
  /** A file in public/images, with its pixel size; `.webp` unless it names
   *  its own extension. `light` puts a logo made for white on a white tile, as
   *  on the conference page. */
  logo: string
  w: number
  h: number
  light?: boolean
}

/** Shared by every Resources page; the same logos as the conference sponsors. */
export const PARTNERS: Partner[] = [
  { name: 'Spinalight', href: 'https://www.spinalight.com/', logo: 'sponsor-spinalight', w: 317, h: 240, light: true },
  { name: 'Sonus: Blueprint', href: 'https://sonusblueprint.com/', logo: 'sponsor-sonus', w: 420, h: 182 },
  { name: 'The Adjustment Bureau Systems', href: 'https://adjustmentbureausystems.com/', logo: 'sponsor-tabs.svg', w: 324, h: 23 },
]

/** Shown under the partner logos. */
export const PARTNER_LINKS: Resource[] = [
  {
    title: 'Schedule a Meeting with Dr. Beadle',
    href: 'https://calendly.com/sonus_blueprint/meeting-with-dr-beadle',
  },
]
