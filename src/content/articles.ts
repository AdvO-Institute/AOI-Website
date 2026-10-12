/* ----------------------------------------------------------------------------
 * Articles
 * Lifted verbatim from the v4.8 single-file build. Content lives here, outside
 * components, so the same object feeds the page, its metadata and its
 * structured data — what a human reads and what a machine reads cannot drift.
 * -------------------------------------------------------------------------- */

export type Article = {
  id: string
  cat: string
  img: string
  date: string
  title: string
  /** A shorter title for the browser tab and search results, when `title`
   *  runs past what a search result shows. The page still shows `title`. */
  seoTitle?: string
  ex: string
  body: string
}

export const ARTICLES = [
  {id:'a1', cat:'RESEARCH', img:'ph-c', date:'JULY 2026', title:'X-Ray Reliability: What the Research Actually Says',
   ex:'A 1998 JMPT study found line drawings for X-ray displacement reach ICCs of 0.8–0.9 — higher than locating pathology itself.',
   body:'<p>There is a common misconception in the chiropractic community that measuring osseous displacement on X-ray is unreliable, and radiographs should only be taken to assess pathology.</p><p>However, a 1998 study published in the Journal of Manipulative and Physiological Therapeutics showed that interclass correlation coefficients (ICC) for locating pathology on X-ray was only 0.4–0.75, while line drawings for X-ray displacement had ICC\'s in the 0.8–0.9 range.</p><p>Many chiropractic schools also suggest digital palpation is all you need to determine where a patient needs to be adjusted. Despite these teachings, static and motion palpation repeatedly shows below average to poor intra-examiner reliability in the published research. Trained Advanced Orthogonal doctors utilize clinical procedures that promote the highest degree of intra and inter examiner reliability.</p>'},
  {id:'a2', cat:'TECHNIQUE', img:'ph-b', date:'JULY 2026', title:'Corrections, Not Adjustments: The Sustainable Corrections Model', seoTitle:'Corrections, Not Adjustments: Sustainable Corrections',
   ex:'Why accurate upper cervical correction can normalize postural reflex loops and stabilize spinal structures.',
   body:'<p>It has become accepted in the chiropractic profession that the adjustment itself only produces a transient correction. It is expected that patients will need frequent adjusting in their initial care, and continued adjusting throughout their lifetime.</p><p>Advanced Orthogonal chiropractic teaches the concept of sustainable corrections. Accurate correction of the upper cervical spine normalizes postural reflex loops, which allow the body to permanently stabilize spinal structures, often without the need for specific exercises or physical therapy modalities.</p><p>Many Advanced Orthogonal patients have shown marked reduction in thoracolumbar scoliosis curves, and mid and low back pain conditions consistently respond favorably as a byproduct of this upper cervical correction.</p>'},
  {id:'a3', cat:'PHYSICS', img:'ph-a', date:'JUNE 2026', title:'How a Percussive Sound Wave Corrects the Atlas',
   ex:'From the plunger spring to the patient-stylus interface — the physics of the Orthogonal Adjusting Instrument.',
   body:'<p>The Advanced Orthogonal procedure uses a percussive sound wave to correct the upper cervical misalignment complex. The low force of this technique allows wider patient populations to be candidates for this treatment, and the correction takes place within the patient\'s normal range of motion.</p><p>Eugene T. Patronis, Jr., Ph.D., professor at the School of Physics, Georgia Institute of Technology, describes the operation of the Orthogonal Adjusting Instrument: "A mechanical impulse is imparted to the metal stylus by means of a spring loaded plunger. The strength of this impulse is determined by the initial degree of compression given to the plunger spring… At the patient-stylus interface, dependent on the impedance match, a portion of this wave energy is transmitted into the patient and a portion is reflected back to the plunger."</p>'}
] as unknown as Article[]

export function articleSlug(article: Article): string {
  return article.title
    .toLowerCase()
    .replace(/[\u2018\u2019']/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
}

export const SLUG_TO_ARTICLE: Record<string, Article> = Object.fromEntries(
  ARTICLES.map((a) => [articleSlug(a), a]),
)
