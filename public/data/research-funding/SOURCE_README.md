# AOI research funding tables (publication-ready exports)

Tables of research funding opportunities for Advanced Orthogonal Institute (AOI) members, mostly independent licensed
chiropractors in private practice, and for AOI-sponsored research. Built on 2026-10-20 from the verified canonical datasets
in `funding/data/` (two research rounds, independent quality assurance, 221 logged corrections). Every row carries a
stable record id, the official program URL and the date its facts were last checked. These files are intended to be handed
to a web developer as-is; see `DATA_DICTIONARY.md` for every field.

| File | Rows | What it is |
|---|---|---|
| `research_grants.csv` / `.json` | 56 | **Main display table.** Cash awards that fund a research project. |
| `other_research_support.csv` / `.json` | 21 | Prizes for completed work, travel awards, crowdfunding, in-kind credits, fee-based IRB services, loan repayment, fellowships and affiliation routes. Useful, but **not** research grants, and never to be presented as such. |
| `excluded_reviewed.csv` / `.json` | 48 | Programs that were researched and reviewed but excluded from the two tables above, with the reason (irrelevant, expired or dormant, or clearly ineligible for both an independent chiropractor and any plausible AOI route). Kept for transparency; nothing was deleted. |
| `DATA_DICTIONARY.md` | | Field definitions with display headings, Application Pathway values, status and deadline conventions, sort order. |

The CSV and JSON of each pair hold the same rows in the same order; the JSON adds a `details` object per row with the
full underlying record (eligibility fields, allowable expenses, the classification reasoning and its evidence ids). The
validator (`funding/tools/validate.py`) checks that the pairs agree, that the three sets partition the 125 programs, and that
no file contains local paths or credentials.

## Headline numbers (as of 2026-10-20)

| Measure | Research grants | Other support |
|---|---|---|
| Rows | 56 | 21 |
| Independent | 8 | 7 |
| Independent / AOI | 9 | 3 |
| AOI Affiliation Suggested | 13 | 6 |
| AOI Affiliation Required | 0 | 0 |
| Eligibility Unconfirmed | 26 | 5 |
| Maximum or typical award of 10,000 or less | 7 | 6 |
| Application window open on 2026-10-20 (verified) | 16 | |

Of the seven small research grants, three are Independent (AAOP Research Grant and IMDTRF Continuation Grant in USD;
ASRF Seeding Research Grant in AUD), one is AOI Affiliation Suggested (Foundation for PM&R Grabois grant, which needs a
sponsoring institution) and three are Eligibility Unconfirmed (ASB Junior Faculty grant, BCBSM Physician Investigator
award, IHS Junior Research Grant). Small cash grants that an unaffiliated practitioner can apply for are rare; that is the
central finding of the research, not a gap in the tables.

## The Application Pathway column (`aoi_affiliation`)

**For the web developer:** display the `aoi_affiliation` data key under the heading **Application Pathway**. The key
name is kept for compatibility with the canonical datasets and the export tooling; do not rename it. Its five values
are listed below; since no current record uses "AOI Affiliation Required", the visible legend may omit that value
until it is needed. Every other column's display heading is given in `DATA_DICTIONARY.md`.

The column answers one question for each opportunity: how can a member apply? It was assigned record by record from the
funder's published rules, with the rule quoted or paraphrased in `details.aoi_affiliation_reasoning` and the supporting
evidence listed in `details.aoi_affiliation_evidence_ids` (evidence records are in `funding/data/evidence.json`, each
with URL, quote and access date; the record of the 2026-10-20 refinement is in
`funding/validation/classification/CHANGELOG_2026-10-20.md`).

| Value | Definition | How to read it |
|---|---|---|
| **Independent** | A member can apply without AOI involvement, either individually or through a qualifying private-practice entity. Other eligibility conditions may still apply. | Apply directly, or through your own practice where the funder accepts for-profit organizations. Check `additional_eligibility_requirements` for conditions that still apply (topic, residence or in-state practice, a membership a DC can obtain). |
| **Independent / AOI** | Both a qualifying independent or practice route and an organizational route involving AOI may be available. | Your practice can be the applicant organization; AOI could alternatively apply or administer, if its eligibility is confirmed. Registration and oversight requirements for the applicant organization are in `additional_eligibility_requirements`. |
| **AOI Affiliation Suggested** | A qualifying organization, sponsor or collaborator is needed or beneficial. AOI is a possible option, but not necessarily the only one. | You cannot usually apply alone. Any qualifying nonprofit, institution, fiscal sponsor or lead organization may serve; AOI's own eligibility is not confirmed. `additional_eligibility_requirements` states the organizational requirement plainly. |
| **AOI Affiliation Required** | Reserved for programs specifically requiring AOI involvement. | No current programs have this classification. |
| **Eligibility Unconfirmed** | Available evidence does not establish a reliable application pathway. | Treat as a lead that needs one question answered before investing time. `eligibility_notes` says which question. |

**AOI membership alone does not satisfy any funder's university, nonprofit, geographic, professional or other
institutional requirement.** Such requirements are recorded separately in `additional_eligibility_requirements`: a
university, hospital or health-system appointment; membership of a society; a degree; a career stage (student, trainee,
early-career faculty); citizenship or residence; an in-state organization; a topic restriction. Where such a rule is
mandatory and blocks both an individual chiropractor and AOI, the program is in `excluded_reviewed`, not in the main
tables.

A limitation of the scheme: it has no value for "confirmed ineligible". Programs confirmed closed to every route
therefore carry `Eligibility Unconfirmed` in the underlying record (with the reasoning saying so) and are placed in
`excluded_reviewed`, whose `exclusion_reason` column is the authoritative statement for those rows; that table does not
display the Application Pathway column.

## Unresolved assumptions the reader must know

1. **AOI's own eligibility is unconfirmed.** Wherever a row names AOI as a possible organizational route
   ("Independent / AOI" or "AOI Affiliation Suggested"), that assumes AOI can act as a nonprofit applicant, grantee or
   administering organization. That depends on AOI's tax status, registrations (SAM/UEI,
   Grants.gov, eRA Commons for federal programs), a Federalwide Assurance and IRB route, and each funder's reading of
   "institution". None of this has been confirmed with AOI or with the funders. See
   `funding/validation/unresolved_issues.md`, section "Questions AOI itself must answer".
2. **Society membership for chiropractors.** Several society grants (NASS, AHS, IASP, ASB, ISSLS, CSRS, AAPM&R) gate
   eligibility on membership or on a degree rule; whether a chiropractor can hold the qualifying membership, or counts
   as an "equivalent degree", has not been confirmed by the societies. These rows are Eligibility Unconfirmed.
3. **State programs** almost all require an applicant organization in that state. Two accept for-profit
   organizations (Indiana, Minnesota), so a member's own in-state practice could apply; those are Independent for
   members in that state only, with the in-state rule in `additional_eligibility_requirements`. Programs that require
   an in-state nonprofit (New York) are AOI Affiliation Suggested because any qualifying nonprofit could apply; AOI's
   own fit with the in-state rule is unknown.
4. **Status is as of 2026-10-20.** "Open" means the application window was verified open on the verification date;
   it is never inferred from a projected recurring deadline. Several open windows close within weeks of that date
   (for example NCCIH R34 on 2026-10-20 itself, BCBSM concept paper 2026-10-28, CCRF letter of intent 2026-11-20,
   Indiana 2026-12-03). Re-check the official URL before relying on any status.
5. **Amounts are as published.** "not published" means the funder states no amount; nothing was estimated. Currencies
   are not converted.
6. **Allowable expenses** (in `details.allowable_expenses`) are recorded only where the funder publishes them;
   `ai_subscriptions` is never assumed permitted.
7. **Two program pages were unreachable at verification** (Missouri SCI program, AAPM early-investigator grant; both in
   `excluded_reviewed`). Several government and society sites block automated checks; their facts were verified by
   other means and are noted as such in `details.qa_notes`.

## Provenance and rebuild

Canonical data and evidence: `funding/data/`. Classification source files: `funding/validation/classification/`.
Rebuild: `python3 funding/tools/apply_classification.py funding/validation/classification/*.json`, then
`python3 funding/tools/build_exports.py`, `python3 funding/tools/build_public_exports.py`, `python3 funding/tools/validate.py`.
Method and findings: `funding/research/AOI_FUNDING_RECONNAISSANCE.md`. Quality review: `funding/research/quality_review.md`.
