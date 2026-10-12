/* Institute administration surfaces and role labels, lifted from the v4.8 build. */

export type AdminSurface = {
  tag: string
  title: string
  desc: string
  live?: boolean
}

export const ADMIN_SURFACES: Record<string, AdminSurface> = {
  manage_seminars: { tag: 'SEMINAR COMMITTEE', title: 'Seminar Management', desc: 'Registrations, attendance, and revenue for every event.', live: true },
  manage_certifications: { tag: 'CERTIFICATION COMMITTEE', title: 'Certification Management', desc: 'Applications, reviewers, and cert progress.' },
  manage_instructors: { tag: 'INSTRUCTOR COMMITTEE', title: 'Instructor Management', desc: 'Roster, assignments, and Train-the-Trainer.' },
  manage_internships: { tag: 'INTERNSHIP COMMITTEE', title: 'Internship Management', desc: 'Preceptors, interns, and site placements.' },
  manage_research: { tag: 'RESEARCH COMMITTEE', title: 'Research Management', desc: 'Projects, grants, and funding.' },
  manage_board: { tag: 'NOMINATIONS', title: 'Board & Elections', desc: 'Terms, nominations, and eligibility.' },
  manage_leads: { tag: 'MEMBERSHIP', title: 'Leads & Directory', desc: 'Prospects and the member directory.' },
  manage_marketing: { tag: 'MARKETING', title: 'Marketing Workspace', desc: 'Campaigns and promotion.' },
  manage_curriculum: { tag: 'CURRICULUM', title: 'Curriculum Workspace', desc: 'Course and seminar content.' },
  manage_colleges: { tag: 'COLLEGE OUTREACH', title: 'College Partnerships', desc: 'Schools, contacts, and outreach.' },
  instructor_tools: { tag: 'INSTRUCTOR', title: 'My Teaching', desc: 'Your seminar assignments and attendee follow-up.' },
  board: { tag: 'GOVERNANCE', title: 'Board Room', desc: 'Reports, stats, and board materials.' },
  full_admin: { tag: 'EXECUTIVE', title: 'Full CCI OS', desc: 'Complete operating system access.' },
}

export const ROLE_LABELS: Record<string, string> = {
  member: 'AOI MEMBER',
  instructor: 'INSTRUCTOR',
  committee_member: 'COMMITTEE',
  committee_cochair: 'CO-CHAIR',
  committee_chair: 'CHAIR',
  board_member: 'BOARD',
  board_chair: 'CHAIR OF THE BOARD',
  vice_chair: 'VICE CHAIR',
  secretary: 'SECRETARY',
  executive_director: 'EXECUTIVE DIRECTOR',
  past_board_member: 'PAST BOARD',
  past_executive_director: 'PAST ED',
}

export const GOLD_ROLES = new Set(['committee_chair', 'board_member', 'executive_director'])
