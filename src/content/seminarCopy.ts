/* ----------------------------------------------------------------------------
 * Seminar page copy, written in plain documents
 *
 * The marketing text for each seminar page lives in its own file under
 * `seminar-copy/`, so it can be edited like a document: open the file on
 * GitHub, press the pencil, change the words, and propose the change. The
 * build reads the files below and turns each into a `SeminarStory`. A file
 * that does not follow the layout stops the build with a message saying
 * which file and which line, so a mistake cannot reach the live site.
 * -------------------------------------------------------------------------- */

import type { SeminarStory } from './seminars'
import intro from './seminar-copy/intro-to-advo.md'
import intensive from './seminar-copy/advo-intensive.md'
import fund1 from './seminar-copy/fundamental-1.md'
import fund2 from './seminar-copy/fundamental-2.md'
import fund3 from './seminar-copy/fundamental-3.md'
import bootcamp from './seminar-copy/advo-bootcamp.md'
import conference from './seminar-copy/annual-conference.md'

const FILES: Record<string, [string, string]> = {
  intro: ['intro-to-advo.md', intro],
  intensive: ['advo-intensive.md', intensive],
  fund1: ['fundamental-1.md', fund1],
  fund2: ['fundamental-2.md', fund2],
  fund3: ['fundamental-3.md', fund3],
  bootcamp: ['advo-bootcamp.md', bootcamp],
  conference: ['annual-conference.md', conference],
}

const LABELS = ['Heading', 'Intro', 'Closing', 'Photo', 'Note', 'Label', 'Subtitle', 'Button', 'Good fit', 'Not the best fit', 'What to expect']

type Block = { name: string; line: number; labels: Record<string, string>; items: string[]; paras: string[]; fitYes: string[]; fitNo: string[]; fitExpect: string[]; faq: { q: string; a: string }[] }

function parse(file: string, text: string): SeminarStory {
  const fail = (line: number, msg: string): never => {
    throw new Error(`seminar-copy/${file}, line ${line}: ${msg}`)
  }
  const blocks: Block[] = []
  let cur: Block | null = null
  let fitList: 'yes' | 'no' | 'expect' | null = null
  let para: string[] = []
  const endPara = () => {
    if (!cur || !para.length) { para = []; return }
    const p = para.join(' ')
    const q = cur.faq[cur.faq.length - 1]
    if (cur.name === 'questions' && q) q.a = q.a ? `${q.a} ${p}` : p
    else cur.paras.push(p)
    para = []
  }

  text.split(/\r?\n/).forEach((raw, i) => {
    const n = i + 1
    const line = raw.trim()
    if (line.startsWith('## ')) {
      endPara()
      cur = { name: line.slice(3).trim().toLowerCase(), line: n, labels: {}, items: [], paras: [], fitYes: [], fitNo: [], fitExpect: [], faq: [] }
      fitList = null
      blocks.push(cur)
      return
    }
    if (!cur) return // the notes at the top of the file
    const c: Block = cur
    if (!line) { endPara(); return }
    if (line.startsWith('### ')) {
      endPara()
      if (c.name !== 'questions') fail(n, 'a "###" question only belongs under "## Questions".')
      c.faq.push({ q: line.slice(4).trim(), a: '' })
      return
    }
    if (line.startsWith('- ')) {
      endPara()
      const item = line.slice(2).trim()
      if (fitList === 'yes') c.fitYes.push(item)
      else if (fitList === 'no') c.fitNo.push(item)
      else if (fitList === 'expect') c.fitExpect.push(item)
      else c.items.push(item)
      return
    }
    const label = LABELS.find((l) => line.toLowerCase().startsWith(`${l.toLowerCase()}:`))
    if (label) {
      endPara()
      const value = line.slice(label.length + 1).trim()
      if (label === 'Good fit') fitList = 'yes'
      else if (label === 'Not the best fit') fitList = 'no'
      else if (label === 'What to expect') fitList = 'expect'
      else c.labels[label] = value
      return
    }
    para.push(line)
  })
  endPara()

  const find = (name: string) => blocks.find((b) => b.name === name)
  const known = ['hero', 'problem', 'solution', 'why it works', 'benefits', 'research', 'steps', 'fit', 'questions']
  for (const b of blocks) if (!known.includes(b.name)) fail(b.line, `"## ${b.name}" is not a section this page knows. Sections are: ${known.join(', ')}.`)
  const need = (b: Block, label: string) => b.labels[label] || fail(b.line, `the "${b.name}" section needs a "${label}:" line.`)
  const pair = (b: Block, s: string) => {
    const at = s.indexOf(': ')
    if (at < 1) fail(b.line, `each line under "${b.name}" needs a title, a colon, then the text: "- Title: text". This one doesn't: "${s}"`)
    return { h: s.slice(0, at).trim(), rest: s.slice(at + 2).trim() }
  }

  const hero = find('hero')
  const problem = find('problem')
  const solution = find('solution')
  const why = find('why it works')
  const benefits = find('benefits')
  const research = find('research')
  const steps = find('steps')
  const fit = find('fit')
  const questions = find('questions')

  return {
    goals: hero?.items ?? [],
    ...(hero && { hero: { kick: need(hero, 'Label'), sub: need(hero, 'Subtitle'), btn: need(hero, 'Button') } }),
    ...(problem && { problem: { h: need(problem, 'Heading'), lede: need(problem, 'Intro'), qs: problem.items, close: problem.labels.Closing ?? '' } }),
    ...(solution && { solution: { h: need(solution, 'Heading'), p: solution.paras, ...(solution.labels.Label && { kick: solution.labels.Label }), ...(solution.labels.Photo && { img: solution.labels.Photo }) } }),
    ...(why && { why: { h: need(why, 'Heading'), items: why.items.map((s) => { const x = pair(why, s); return { h: x.h, p: x.rest } }) } }),
    ...(benefits && { benefits: { h: need(benefits, 'Heading'), items: benefits.items.map((s) => { const x = pair(benefits, s); return { h: x.h, p: x.rest } }) } }),
    ...(research && { data: { h: need(research, 'Heading'), ...(research.labels.Intro && { lede: research.labels.Intro }), items: research.items.map((s) => { const x = pair(research, s); const [k, n] = x.h.includes(' | ') ? x.h.split(' | ', 2) as [string, string] : ['', x.h]; return { n: n.trim(), t: x.rest, ...(k.trim() && { k: k.trim() }) } }), note: need(research, 'Note') } }),
    ...(steps && { steps: { h: need(steps, 'Heading'), items: steps.items.map((s) => { const x = pair(steps, s); return { h: x.h, p: x.rest } }) } }),
    ...(fit && { fit: { h: need(fit, 'Heading'), yes: fit.fitYes, no: fit.fitNo, ...(fit.fitExpect.length ? { expect: fit.fitExpect } : {}) } }),
    ...(questions && { faq: questions.faq.map((x) => (x.a ? x : fail(questions.line, `the question "${x.q}" has no answer under it.`))) }),
  }
}

/** Seminar key -> its page copy. */
export const SEMINAR_COPY: Record<string, SeminarStory> = Object.fromEntries(
  Object.entries(FILES).map(([key, [file, text]]) => [key, parse(file, text)]),
)
