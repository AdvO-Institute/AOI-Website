/* ----------------------------------------------------------------------------
 * Speakers, instructors and the Board of Directors
 * Lifted verbatim from the v4.8 single-file build. Content lives here, outside
 * components, so the same object feeds the page, its metadata and its
 * structured data — what a human reads and what a machine reads cannot drift.
 * -------------------------------------------------------------------------- */

export type Person = {
  name: string
  ini: string
  img: string
  cred: string
  role: string
  bio: string
  photo?: string
}

export const PEOPLE = {
  hulsey:{name:'Dr. Daniel Hulsey', ini:'DH', img:'ph-a', cred:'D.C.', role:'SPEAKER',
      bio:'Dr. Daniel Hulsey is a U.S. Army veteran who served as a recon scout in Afghanistan and now owns and operates Atlas Clinics, a brain health and regenerative care practice focused on neurological recovery. Drawing on that experience, he specializes in Operator Syndrome, the cluster of post-combat traumatic brain injury, chronic pain, sleep disruption, hormonal imbalance, and nervous system dysregulation common among combat veterans and special operations personnel. His practice combines precise upper cervical care with hyperbaric oxygen therapy, PEMF, and related technologies to support long-term recovery.'},
  miranda:{name:'Dr. David Miranda', ini:'DM', img:'ph-b', cred:'D.C., DCCJP', role:'BOARD MEMBER',
      bio:'Dr. David Miranda is a chiropractic physician practicing at Sound Correction Chiropractic in Orem, Utah, dedicated to advancing precision in upper cervical analysis and correction. He is trained in Grostic, Advanced Orthogonal, EPIC, Activator Methods, and Webster Technique. During his final year of chiropractic school he completed his internship at the Pierce Clinic, an experience that sparked his pursuit to understand why these procedures work as consistently as they do. His current research focuses on challenging existing orthogonal models and developing true three-dimensional analytic frameworks to substantiate and evolve upper cervical analysis. He served as a district leader before joining the executive board of the Utah Chiropractic Physicians Association, and remains committed to pursuing truth through measurement and analysis.'},
  damico:{name:'Dr. Dutch D\'Amico', ini:'DD', img:'ph-b', cred:'D.C., BCAO', role:'BOARD MEMBER',
      bio:'Dr. Dutch D\'Amico is a fifth-generation Doctor of Chiropractic and grandson of Dr. G. Stanford Pierce Sr., founder of the Advanced Orthogonal technique. A U.S. Army veteran and Director of Research and Development for SpinalLight, Inc., Dr. D\'Amico is deeply committed to advancing instrument technology and precision in upper cervical care. As both a clinician at the Pierce Clinic of Chiropractic and an instructor for the Advanced Orthogonal Institute, he brings passion, technical mastery, and a legacy of innovation to every aspect of his work.'},
  jobarah:{name:'Dr. Nor Jobarah', ini:'NJ', img:'ph-a', cred:'D.C.', role:'BOARD MEMBER',
      bio:'Dr. Nor Jobarah practices in Arvada, Colorado, where she specializes in complex neurological cases. She earned her bachelor\'s degree in Exercise Physiology in Central Florida and attended Palmer Florida, where she discovered upper cervical care in her third semester and went on to lead and revamp the school\'s Upper Cervical Club, teaching the work to her peers and driving growth in the student clinic. Alongside patient care she mentors chiropractic students and doctors on building purpose-driven upper cervical practices.'},
  pavlovic:{name:'Dr. Debra Pavlovic', ini:'DP', img:'ph-c', cred:'D.C.', role:'SPEAKER',
      bio:'Dr. Debra Pavlovic is an upper cervical chiropractor and owner of Atlas Wellness of Lakeland, Florida. A Sherman College graduate who trained at the Sweat Institute in Atlanta, she became Certified Advanced Orthogonal in 2008 and EPIC certified in 2016. Her practice centers on three-dimensional X-ray analysis and degree-specific, calibrated percussive sound-wave corrections, and her current interest is the lineage of orthogonal work from B.J. Palmer to the present day.'},
  beadle:{name:'Dr. James Beadle', ini:'JB', img:'ph-b', cred:'D.C., DCCJP-c', role:'BOARD MEMBER',
      bio:'Dr. James Beadle graduated from Life Chiropractic College West in 2012, where he developed Sonus: Blueprint, a software system designed to enhance precision and confidence in the Advanced Orthogonal procedure. A former Board Member of EPIC and elective instructor of the EPIC technique at Life West, Dr. Beadle is also a Diplomate of Chiropractic Craniocervical Junction Procedures candidate. He leads Sound Corrections Chiropractic in Orem, Utah, and continues to advance upper cervical research and clinical quality through innovation in software and technology.'},
  wooden:{name:'Dr. Braken Wooden', ini:'BW', img:'ph-c', cred:'D.C.', role:'SPEAKER',
      bio:'Dr. Braken Wooden is the owner of Chiro One Chiropractic in Ogden, Utah, where his clinical focus is upper cervical care. A 2019 graduate of Life Chiropractic College West, he was the first doctor in the world to be certified in the EPIC upper cervical technique, and he also holds certifications in Advanced Muscle Integration Technique, Neural Pathway Integration, and CCEP extremity adjusting. His current work centers on suboccipital muscle and soft-tissue analysis alongside the upper cervical correction.'},
  billiris:{name:'Dr. Chad Billiris', ini:'CB', img:'ph-a', cred:'D.C., DCCJP, BCAO, FABVR', role:'SPEAKER',
      bio:'Dr. Chad Billiris is the owner and founder of Summit Chiropractic & Wellness Center in New Jersey, where personalized upper cervical care is combined with clinical neuroscience. A graduate of Life College of Chiropractic, he earned Board Certification in Atlas Orthogonal at the Sweat Institute under the late Dr. Roy Sweat, and completed advanced certification with the Society of Chiropractic Orthospinology with Advanced Graduate Honors, the only doctor in New Jersey to hold both distinctions. He furthered his postdoctoral work in neurology at the Carrick Institute for Clinical Neuroscience and Rehabilitation, and is a Fellow of the American Board of Vestibular Rehabilitation (FABVR).'},
  fowler:{name:'Dr. Jeff Fowler', ini:'JF', img:'ph-b', cred:'D.C., BCAO', role:'BOARD MEMBER · PRESIDENT',
      bio:'Dr. Jeff Fowler is one of the original instructors of the Advanced Orthogonal technique and has been teaching it for over two decades. He owns and operates Citrus Regional Clinic of Chiropractic in Inverness, Florida, where he maintains an upper cervical-focused practice while continuing to train doctors nationwide through the Institute. He has been involved with the Advanced Orthogonal Institute since its founding and currently serves as President of the Institute and a Senior Instructor. Dr. Fowler is widely respected for the clarity of his instruction and his excellence in hands-on teaching, particularly in helping doctors develop confidence and precision in the practical execution of the technique.'},
  colavita:{name:'Dr. Angelo Colavita', ini:'AC', img:'ph-c', cred:'D.C., BCAO', role:'BOARD MEMBER',
      bio:'Dr. Angelo Colavita graduated Magna Cum Laude from Palmer College of Chiropractic in Davenport, Iowa, in 1998, and became Board Certified in Atlas Orthogonal through Sherman College of Chiropractic the same year, training directly under Dr. Roy W. Sweat, who developed the Atlas Orthogonal technique. He has been in private practice since 1998 and practices in Clifton, New Jersey, where his clinical focus centers on craniocervical misalignment, headaches and migraines, TMJ disorders, and trauma-related injury. Dr. Colavita is a certified instructor of Atlas Orthogonal modular seminars and an FDA-registered inspector of Atlas Orthogonal precision adjusting instruments, and he holds advanced certification in digital motion X-ray functional imaging. He has served as an adjunct professor at Palmer College of Chiropractic, Sherman College of Chiropractic, and Life Chiropractic College West, and has taught at Advanced Atlas Orthogonal conferences across the United States and Canada. He serves on the Board of Directors of the Advanced Orthogonal Institute and teaches on the role of CT imaging in upper cervical practice.'},
  silver:{name:'Dr. Josh Silver', ini:'JS', img:'ph-a', cred:'D.C., DACNB', role:'SPEAKER',
      bio:'Dr. Josh Silver trained for five years at the Pierce Clinic of Chiropractic under Dr. Pierce Sr., the founder of the Advanced Orthogonal technique, and went on to serve on the Advanced Orthogonal Institute board as a technique instructor. A graduate of Life Chiropractic College West, he completed his DACNB through the Carrick Institute and has built several tools now used in AdvO practice, including a laser positioning system, 3D-printed instruments, and CBCT analysis software for the upper cervical spine. He leads Neuroplasticity St. Pete in St. Petersburg, Florida, integrating structural correction with neurological rehabilitation.'},
  bollen:{name:'Dr. Ric Bollen', ini:'RB', img:'ph-b', cred:'D.C.', role:'SPEAKER',
      bio:'Dr. Ric Bollen practices in the Napa Valley, California, and serves as X-Ray Supervisor and Upper Cervical Specialist at Life Chiropractic College West, where he teaches the Advanced Orthogonal elective and assists interns with upper cervical adjusting and X-ray analysis. He graduated from Life West with clinical and academic honors, developed the Joint Clearing Technique during his final year, and completed his Level 1 certification in the Advanced Orthogonal Technique through an internship at the Pierce Clinic of Chiropractic. Before chiropractic he served twenty years in U.S. Air Force Explosive Ordnance Disposal, and was awarded the Bronze Star for Valor in Iraq.'},
  corsello:{name:'Dr. Eddie Corsello', ini:'EC', img:'ph-c', cred:'D.C., BCAO', role:'SPEAKER',
      bio:'Dr. Edward Corsello is a board-certified Atlas Orthogonist with more than twenty years of clinical experience specializing in upper cervical care, and has owned Corsello Clinic of Chiropractic (Upper Cervical Health of CT) since 2004. He completed postgraduate certification in the Atlas Orthogonal Technique through Sherman College and has continued extensive postgraduate education in neurological, complementary, and rehabilitative disciplines. His credentials include a Fellowship with the International Acupuncture Medical Association and certifications in Applied Kinesiology, Quantum Neurology, and Active Release Techniques.'},
  cs:{name:'Dr. Chris Slininger', ini:'CS', img:'ph-b', cred:'D.C., DCCJP', role:'EXECUTIVE DIRECTOR · BOARD MEMBER',
      bio:'Dr. Chris Slininger is a U.S. Army veteran who served during Operation Iraqi Freedom and completed his chiropractic training at Life Chiropractic College West with a focused emphasis on upper cervical care. He owns and operates Cerebral Chiropractic Center in St. Petersburg, Florida, and went on to complete his Diplomate in Chiropractic Craniocervical Junction Procedures through the ICA\'s Council on Upper Cervical Care. He has trained in multiple upper cervical techniques, including Advanced Orthogonal, NUCCA, Orthospinology, and Blair. Clinically he specializes in complex neurological cases, brain health, and mental health. He serves as Executive Director of the Advanced Orthogonal Institute and has served on the Board of Directors of the ICA Council on Upper Cervical Care. He also consults with practices and businesses on strategic planning and execution, and is the founder of Synapse Continuing Education, a national platform for advanced, cross-disciplinary healthcare education.'},
  jk:{name:'Dr. Jeff Kahrs', ini:'JK', img:'ph-a', cred:'D.C. · CERTIFIED ADVO LEVEL 2', role:'INSTRUCTOR',
      bio:'Two decades of precision upper cervical practice. Leads the X-ray analysis intensives and certification case reviews at the Institute.'},
  mr:{name:'Dr. Maria Reyes', ini:'MR', img:'ph-c', cred:'D.C., PH.D. · NEUROLOGY RESEARCH', role:'GUEST EXPERT',
      bio:'Research faculty presenting the latest findings on functional and neurological change following specific upper cervical correction.'},
  lyter:{name:'Dr. Kevin Lyter', ini:'KL', img:'ph-b', cred:'D.C., DCCJP', role:'BOARD MEMBER · SECRETARY',
      bio:'Dr. Kevin Lyter is the owner of Simmons Chiropractic Clinic in Tacoma, Washington, a large and well-established upper cervical practice that has served the region since 1946 and is recognized as a longstanding hub for orthogonal-based care and training. He earned his Doctor of Chiropractic degree from Life Chiropractic College West in 2000 and began practicing in Washington shortly thereafter. After being introduced to the Atlas Orthogonal instrument adjustment, Dr. Lyter joined Simmons Chiropractic Clinic in 2005, where he has remained committed to upper cervical-specific chiropractic care. He has served on the Board of Directors of the Advanced Orthogonal Institute for nearly a decade, is a Senior Instructor, and regularly hosts Advanced Orthogonal hands-on seminars at Simmons Chiropractic Clinic, supporting doctors throughout the western United States.'},
  orris:{name:'Dr. Max Orris', ini:'MO', img:'ph-c', cred:'D.C.', role:'BOARD MEMBER',
      bio:'Dr. Max Orris is the founder of Gateway Upper Cervical Institute in Pacific, Missouri, a practice dedicated exclusively to precision upper cervical care for patients with complex neurological and musculoskeletal conditions. A 2016 graduate of Logan College of Chiropractic, he trained in several upper cervical techniques before clinical exposure at the Pierce Clinic led him to make Advanced Orthogonal the foundation of his practice, and he completed the AdvO Bootcamp in 2025. His clinical focus includes dizziness and vertigo, post-concussion recovery, headaches and migraines, cervical instability, and dysautonomia, and he has built referral relationships with physicians and therapists across the St. Louis region. He is president of the MVR-III Bridge Foundation, serves on the board of the Pacific Area Chamber of Commerce, and is committed to expanding the research behind Advanced Orthogonal.'},
  miller:{name:'Dr. Jeremy Miller', ini:'JM', img:'ph-b', cred:'D.C., M.S.', role:'BOARD MEMBER',
      bio:'Dr. Jeremy Miller is Director of Doctors at the Pierce Clinic of Chiropractic in St. Petersburg, Florida, where he has treated patients since 2016. He earned his Doctor of Chiropractic and a master\'s degree in Sports Health Science from Life University. He has served the Institute as Director of Research and Development and as Executive Director, co-taught the Fundamentals Series, and was lead instructor for the AdvO Bootcamp. His research on posturography and upper cervical care has been published in the Journal of Upper Cervical Chiropractic Research and presented at the ACC-RAC conference and the ICA Council on Upper Cervical Care symposium. He is adjunct faculty at Palmer College of Chiropractic and Life University.'}
} as unknown as Record<string, Person>

/** The seated Board, in the order it is displayed.
 *  Dr. Nick Schar was removed and Dr. Angelo Colavita seated in his place.
 *  Dr. Kevin Lyter then stepped down, and Dr. Nor Jobarah, Dr. Max Orris and
 *  Dr. Jeremy Miller were elected. */
export const BOARD_ROSTER = [
  'cs',
  'fowler',
  'colavita',
  'beadle',
  'miranda',
  'damico',
  'jobarah',
  'orris',
  'miller',
] as const

/** People whose headshot was extracted from the v4.8 build to a real image
 *  file. Anyone absent here renders as initials, exactly as before. */
export const HEADSHOTS = new Set([
  'lyter',
  'cs',
  'miranda',
  'billiris',
  'silver',
  'colavita',
  'beadle',
  'fowler',
  'damico',
  'hulsey',
  'wooden',
  'bollen',
  'corsello',
  'jobarah',
  'pavlovic',
  'orris',
  'miller',
])
