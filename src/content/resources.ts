/* ----------------------------------------------------------------------------
 * The Resources page (/resources): handouts, quick links and partners. It
 * replaces the old Linktree, and the huddle QR code points here.
 *
 * To add a link, copy a line in the right group; to remove one, delete it.
 * `href` starting with `/` is a page on this site; anything else opens in a
 * new tab. Board members will edit these from the members area once the
 * Supabase side exists (#191); until then this file is the list.
 * -------------------------------------------------------------------------- */

export type Resource = {
  title: string
  note?: string
  href: string
}

export type ResourceGroup = {
  key: string
  kicker: string
  heading: string
  items: Resource[]
}

export const RESOURCE_GROUPS: ResourceGroup[] = [
  {
    key: 'downloads',
    kicker: 'Downloads',
    heading: 'Handouts for students and doctors.',
    items: [
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
  },
  {
    key: 'links',
    kicker: 'Quick Links',
    heading: 'Training, membership and feedback.',
    items: [
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
    ],
  },
  {
    key: 'partners',
    kicker: 'Partners',
    heading: 'Businesses that work with the Institute.',
    items: [
      {
        title: 'Spinalight',
        note: 'Adjusting tables.',
        href: 'https://www.spinalightinc.com',
      },
      {
        title: 'Sonus Blueprint',
        href: 'https://www.sonusblueprint.com',
      },
      {
        title: 'Sonus Blueprint Sign-up',
        href: 'https://docs.google.com/forms/d/e/1FAIpQLSduDB0bSFbOEVmFBSR_yRrF-6LnC_V0GkC-bWH98Mc5kFefug/viewform',
      },
      {
        title: 'Schedule a Meeting with Dr. Beadle',
        href: 'https://calendly.com/sonus_blueprint/meeting-with-dr-beadle',
      },
    ],
  },
]
