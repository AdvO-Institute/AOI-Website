/* Research Funding Directory.
 *
 * Reads the two public exports under /data/research-funding/ and renders them.
 * Field names come from the exports' DATA_DICTIONARY.md; the `aoi_affiliation`
 * key is shown under the heading "Application Pathway" and is never renamed.
 *
 * Rules the page keeps whatever the data says:
 *   - "Open" is shown only when the export's application_status says the window
 *     was verified open, and never once a confirmed deadline has passed.
 *   - A confirmed deadline (an ISO date in application_deadline_or_cycle) is
 *     shown as a deadline; a cycle with only a last known date is shown as
 *     anticipated, never as upcoming.
 *   - Every entry shows the date its facts were last checked.
 */
(function () {
  'use strict'

  const DATA = {
    grants: '/data/research-funding/research_grants.json',
    other: '/data/research-funding/other_research_support.json',
  }

  const SET_NOTES = {
    grants: 'Cash awards that fund a research project. Sorted by Application Pathway, then smallest award first.',
    other:
      'Prizes for completed work, travel awards, crowdfunding, in-kind credits, fee-based services, loan repayment and fellowships. Useful, but not research grants.',
  }

  const PATHWAY_ORDER = [
    'Independent',
    'Independent / AOI',
    'AOI Affiliation Suggested',
    'AOI Affiliation Required',
    'Eligibility Unconfirmed',
  ]
  const PATHWAY_CLASS = {
    'Independent': 'pmark-independent',
    'Independent / AOI': 'pmark-independent-aoi',
    'AOI Affiliation Suggested': 'pmark-suggested',
    'AOI Affiliation Required': 'pmark-required',
    'Eligibility Unconfirmed': 'pmark-unconfirmed',
  }

  const el = (id) => document.getElementById(id)
  const $list = el('list')
  const $count = el('result-count')
  const $empty = el('empty')
  const $error = el('load-error')
  const $asOf = el('as-of')
  const $setNote = el('set-note')
  const $form = el('controls')
  const $q = el('q')
  const $pathway = el('f-pathway')
  const $status = el('f-status')
  const $award = el('f-award')
  const $area = el('f-area')
  const $mechanism = el('f-mechanism')
  const $sort = el('sort')

  const sets = { grants: null, other: null }
  let active = 'grants'

  /* ------------------------------------------------------------ dates --- */

  const today = (() => {
    const d = new Date()
    return new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()))
  })()

  const fmtDate = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' })
  const fmtMonth = new Intl.DateTimeFormat('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' })

  function isoToDate(iso) {
    const m = /^(\d{4})-(\d{2})(?:-(\d{2}))?$/.exec(iso || '')
    if (!m) return null
    return new Date(Date.UTC(+m[1], +m[2] - 1, m[3] ? +m[3] : 1))
  }
  function showDate(iso) {
    const d = isoToDate(iso)
    if (!d) return iso
    return iso.length === 7 ? fmtMonth.format(d) : fmtDate.format(d)
  }

  const CYCLE_WORDS = {
    annual: 'annual',
    biannual: 'twice a year',
    rolling: 'rolling',
    irregular: 'irregular',
    unknown: 'cycle unknown',
  }
  const cycleWord = (c) => CYCLE_WORDS[c] || c

  /** Reads application_deadline_or_cycle into one of four shapes. */
  function parseDeadline(text) {
    const t = (text || '').trim()
    let m
    if ((m = /^(\d{4}-\d{2}(?:-\d{2})?)(?: \((\w+)\))?$/.exec(t))) {
      return { kind: 'confirmed', date: m[1], cycle: m[2] || '' }
    }
    if ((m = /^(\w+); last known deadline (\d{4}-\d{2}(?:-\d{2})?); next cycle not yet published$/.exec(t))) {
      return { kind: 'anticipated', cycle: m[1], last: m[2] }
    }
    if ((m = /^(\w+); no deadline published$/.exec(t))) {
      return { kind: 'none', cycle: m[1] }
    }
    return { kind: 'other', text: t }
  }

  /** The status the page shows: open only when verified and not past. */
  function deriveStatus(rec, dl) {
    const s = (rec.application_status || '').toLowerCase()
    const passed = dl.kind === 'confirmed' && dl.date.length === 10 && isoToDate(dl.date) < today
    if (s.startsWith('open')) {
      return passed
        ? { key: 'expired', label: 'Deadline passed, re-check', cls: 'status-expired' }
        : { key: 'open', label: 'Open, verified ' + showDate(rec.verification_date), cls: 'status-open' }
    }
    if (s.startsWith('closed')) return { key: 'upcoming', label: 'Closed, expected to recur', cls: 'status-closed' }
    if (s.startsWith('recurring')) return { key: 'upcoming', label: 'Recurring, next cycle not yet posted', cls: 'status-recurring' }
    if (s.startsWith('discontinued')) return { key: 'discontinued', label: 'Discontinued', cls: 'status-expired' }
    return { key: 'unknown', label: 'Status unknown', cls: 'status-unknown' }
  }

  function deadlineHtml(dl, status) {
    if (dl.kind === 'confirmed') {
      const when = showDate(dl.date)
      const cyc = dl.cycle ? ', ' + cycleWord(dl.cycle) : ''
      if (status.key === 'expired') return '<span class="deadline deadline-passed">Deadline was ' + esc(when) + esc(cyc) + '</span>'
      return '<span class="deadline">Deadline <b>' + esc(when) + '</b>' + esc(cyc) + '</span>'
    }
    if (dl.kind === 'anticipated') {
      const cyc = dl.cycle === 'unknown' ? 'cycle unknown' : cycleWord(dl.cycle) + ' cycle'
      return '<span class="deadline deadline-anticipated">' + esc(cyc) + ', last deadline ' + esc(showDate(dl.last)) + ', next not yet published</span>'
    }
    if (dl.kind === 'none') {
      const c = dl.cycle
      const txt = c === 'rolling' ? 'Rolling, no deadline published' : cap(cycleWord(c)) + ' cycle, no deadline published'
      return '<span class="deadline">' + esc(txt) + '</span>'
    }
    return dl.text ? '<span class="deadline">' + esc(dl.text) + '</span>' : ''
  }

  /* ---------------------------------------------------------- helpers --- */

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
  }
  const cap = (s) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s)
  const splitList = (s) =>
    (s || '')
      .split(';')
      .map((x) => x.trim())
      .filter(Boolean)

  function awardValue(rec) {
    const v = rec.award_max ?? (rec.details && rec.details.award_typical) ?? rec.award_min
    return typeof v === 'number' ? v : null
  }

  function prepare(rec) {
    const dl = parseDeadline(rec.application_deadline_or_cycle)
    const status = deriveStatus(rec, dl)
    const areas = splitList(rec.research_categories)
    const hay = [
      rec.program_name,
      rec.funding_organization,
      rec.research_categories,
      rec.eligible_study_types,
      rec.eligibility_notes,
      rec.additional_eligibility_requirements,
      rec.aoi_affiliation,
      rec.mechanism,
      rec.award_amount,
      rec.record_id,
    ]
      .join(' \n ')
      .toLowerCase()
    return {
      rec,
      dl,
      status,
      areas,
      areaKeys: areas.map((a) => a.toLowerCase()),
      award: awardValue(rec),
      hay,
      deadlineSort: dl.kind === 'confirmed' && status.key !== 'expired' ? isoToDate(dl.date).getTime() : Infinity,
      pathwayRank: Math.max(0, PATHWAY_ORDER.indexOf(rec.aoi_affiliation)),
    }
  }

  /* ----------------------------------------------------------- render --- */

  function rowHtml(item, idx) {
    const r = item.rec
    const pClass = PATHWAY_CLASS[r.aoi_affiliation] || 'pmark-unconfirmed'
    const unpublished = !r.award_amount || /not published/i.test(r.award_amount)
    const d = r.details || {}
    const applyUrl = d.application_url && d.application_url !== r.official_program_url ? d.application_url : ''
    const reqs = Array.isArray(d.application_requirements) ? d.application_requirements.filter(Boolean) : []

    const detailRows = []
    const add = (dt, dd) => {
      if (dd) detailRows.push('<dt>' + esc(dt) + '</dt><dd>' + dd + '</dd>')
    }
    add('Additional eligibility requirements', esc(r.additional_eligibility_requirements))
    add('Eligible study types', esc(splitList(r.eligible_study_types).join('; ')))
    add('Funding duration', esc(d.funding_duration))
    add('Why this pathway', esc(d.aoi_affiliation_reasoning))
    add('Membership', d.membership_details ? esc(d.membership_details) : '')
    add('Where applicants must be', esc(d.geographic_notes))
    add('Review board (IRB)', esc(d.irb_requirements))
    add('Application requirements', reqs.length ? '<ul>' + reqs.map((x) => '<li>' + esc(x) + '</li>').join('') + '</ul>' : '')
    add('Allowable expenses', esc(d.allowable_expenses_notes))
    add('Apply at', applyUrl ? '<a href="' + esc(applyUrl) + '" rel="noopener" target="_blank">' + esc(applyUrl) + '</a>' : '')
    add('Record', esc(r.record_id) + ', last checked ' + esc(showDate(r.verification_date)))

    return (
      '<li class="row" data-i="' + idx + '">' +
      '<span class="row-mark"><span class="pmark ' + pClass + '" title="' + esc(r.aoi_affiliation) + '" aria-hidden="true"></span></span>' +
      '<div class="row-head">' +
      '<h3 class="row-title"><a href="' + esc(r.official_program_url) + '" rel="noopener" target="_blank">' + esc(r.program_name) + '</a></h3>' +
      '<div class="row-org">' + esc(r.funding_organization) + '</div>' +
      '<div class="row-pathway">Application Pathway: <b>' + esc(r.aoi_affiliation) + '</b></div>' +
      '</div>' +
      '<div class="row-money">' +
      '<div class="row-amount' + (unpublished ? ' is-unpublished' : '') + '">' + esc(unpublished ? 'Amount not published' : r.award_amount) + '</div>' +
      (active === 'other' ? '<div class="row-mech">' + esc(r.mechanism) + '</div>' : '') +
      '</div>' +
      '<div class="row-when"><span class="status ' + item.status.cls + '">' + esc(item.status.label) + '</span>' + deadlineHtml(item.dl, item.status) + '</div>' +
      (r.eligibility_notes ? '<p class="row-note">' + esc(r.eligibility_notes) + '</p>' : '') +
      (item.areas.length ? '<p class="row-areas"><b>Research areas:</b> ' + esc(item.areas.join('; ')) + '</p>' : '') +
      '<div class="row-links">' +
      '<a class="official" href="' + esc(r.official_program_url) + '" rel="noopener" target="_blank">Official program page</a>' +
      '<span class="verified">Last checked ' + esc(showDate(r.verification_date)) + '</span>' +
      '</div>' +
      '<details class="row-more"><summary>Eligibility details and why this pathway</summary><dl>' + detailRows.join('') + '</dl></details>' +
      '</li>'
    )
  }

  /* ----------------------------------------------------------- filter --- */

  function currentItems() {
    const items = sets[active]
    if (!items) return []
    const q = $q.value.trim().toLowerCase()
    const pathway = $pathway.value
    const status = $status.value
    const award = $award.value
    const area = $area.value
    const mech = $mechanism.value

    let out = items.filter((it) => {
      const r = it.rec
      if (q && !it.hay.includes(q)) return false
      if (pathway && r.aoi_affiliation !== pathway) return false
      if (status) {
        if (status === 'open' && it.status.key !== 'open') return false
        if (status === 'upcoming' && it.status.key !== 'upcoming') return false
        if (status === 'unknown' && it.status.key !== 'unknown') return false
      }
      if (award) {
        if (award === 'none') {
          if (it.award != null) return false
        } else if (award === 'over') {
          if (it.award == null || it.award <= 250000) return false
        } else if (it.award == null || it.award > +award) return false
      }
      if (area && !it.areaKeys.includes(area)) return false
      if (mech && r.mechanism !== mech) return false
      return true
    })

    const sort = $sort.value
    const byName = (a, b) => a.rec.program_name.localeCompare(b.rec.program_name)
    const awardAsc = (a, b) => (a.award ?? Infinity) - (b.award ?? Infinity) || byName(a, b)
    if (sort === 'deadline') out.sort((a, b) => a.deadlineSort - b.deadlineSort || byName(a, b))
    else if (sort === 'award-asc') out.sort(awardAsc)
    else if (sort === 'award-desc') out.sort((a, b) => (b.award ?? -1) - (a.award ?? -1) || byName(a, b))
    else if (sort === 'name') out.sort(byName)
    else out.sort((a, b) => a.pathwayRank - b.pathwayRank || awardAsc(a, b))
    return out
  }

  function render() {
    const items = currentItems()
    const total = sets[active] ? sets[active].length : 0
    $list.innerHTML = items.map(rowHtml).join('')
    $empty.hidden = items.length > 0 || total === 0
    const noun = active === 'grants' ? 'research grant' : 'program'
    $count.textContent =
      items.length === total
        ? 'Showing all ' + total + ' ' + noun + (total === 1 ? '' : 's') + '.'
        : 'Showing ' + items.length + ' of ' + total + ' ' + noun + 's.'
  }

  /* ----------------------------------------------------------- setup ---- */

  function fillSelect(select, values, keepFirst) {
    while (select.options.length > (keepFirst ? 1 : 0)) select.remove(select.options.length - 1)
    for (const v of values) {
      const o = document.createElement('option')
      o.value = v.value
      o.textContent = v.label
      select.appendChild(o)
    }
  }

  function populateFilters() {
    const items = sets[active] || []
    const areaCounts = new Map()
    for (const it of items) {
      for (const k of it.areaKeys) areaCounts.set(k, (areaCounts.get(k) || 0) + 1)
    }
    const areas = [...areaCounts.entries()]
      .filter(([, n]) => n >= 2)
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
      .map(([k, n]) => ({ value: k, label: cap(k) + ' (' + n + ')' }))
    const keepArea = areas.some((a) => a.value === $area.value) ? $area.value : ''
    fillSelect($area, areas, true)
    $area.value = keepArea

    const mechWrap = $mechanism.closest('.control')
    if (active === 'other') {
      const mechs = new Map()
      for (const it of items) mechs.set(it.rec.mechanism, (mechs.get(it.rec.mechanism) || 0) + 1)
      const list = [...mechs.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([k, n]) => ({ value: k, label: k + ' (' + n + ')' }))
      fillSelect($mechanism, list, true)
      mechWrap.hidden = false
    } else {
      $mechanism.value = ''
      mechWrap.hidden = true
    }
  }

  function switchTab(set) {
    active = set
    for (const b of document.querySelectorAll('.tabs [role="tab"]')) {
      b.setAttribute('aria-selected', b.dataset.set === set ? 'true' : 'false')
    }
    $setNote.textContent = SET_NOTES[set]
    populateFilters()
    render()
  }

  async function load() {
    const [g, o] = await Promise.all([fetch(DATA.grants), fetch(DATA.other)])
    if (!g.ok || !o.ok) throw new Error('fetch failed')
    const gj = await g.json()
    const oj = await o.json()
    sets.grants = (gj.records || []).map(prepare)
    sets.other = (oj.records || []).map(prepare)

    el('count-grants').textContent = '(' + sets.grants.length + ')'
    el('count-other').textContent = '(' + sets.other.length + ')'

    const asOf = gj.as_of || oj.as_of
    const openNow = sets.grants.filter((it) => it.status.key === 'open').length
    $asOf.innerHTML =
      'Information last checked <b>' + esc(showDate(asOf)) + '</b>. ' +
      sets.grants.length + ' research grants and ' + sets.other.length + ' other kinds of support; ' +
      openNow + ' grant window' + (openNow === 1 ? '' : 's') + ' verified open on that date. ' +
      'Re-check the official page before relying on any deadline or status.'
    switchTab('grants')
  }

  for (const b of document.querySelectorAll('.tabs [role="tab"]')) {
    b.addEventListener('click', () => switchTab(b.dataset.set))
  }
  $form.addEventListener('input', render)
  $form.addEventListener('change', render)
  $form.addEventListener('submit', (e) => e.preventDefault())
  $form.addEventListener('reset', () => setTimeout(render, 0))
  el('year').textContent = String(new Date().getFullYear())

  load().catch((err) => {
    console.error('Research Funding Directory: ' + (err && err.message))
    $error.hidden = false
    $asOf.textContent = ''
  })
})()
