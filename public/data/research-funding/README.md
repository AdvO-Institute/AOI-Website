# Research Funding Directory data

`research_grants.json` (cash research grants) and `other_research_support.json` (prizes, travel awards, in-kind support and
other mechanisms that are not grants) are the public exports of the AOI research funding tables. The members area reads
both files from this folder and shows them on the **Funding** tab of the Research Library page
(`src/components/member/ResearchFundingPanel.tsx`); nothing is built from them and nothing is in Supabase.

`DATA_DICTIONARY.md` and `SOURCE_README.md` are the files that came with the export: every field, the Application Pathway
values, and the research findings behind the tables. The export also has an `excluded_reviewed` table of programs that were
reviewed and left out; it is internal and is not published here.

## Updating

Replace the two JSON files with a fresh export, commit on a branch and open a pull request. Keep the file names and the
field names. `record_id` never changes, so later exports line up with earlier ones. The page reads `as_of` from the file
for the "last checked" line at the top, and `verification_date` on each record for the row.

## What the page does with the fields

- `aoi_affiliation` is shown under the heading **Application Pathway**, with one mark per value (filled, half, ring,
  dotted). The key is never renamed.
- `application_status` decides the status chip. "Open" shows only when the export says the window was verified open, and
  never once a confirmed deadline in `application_deadline_or_cycle` has passed in the reader's browser (then it says
  "Deadline passed, re-check"). The other values show as "Recurring, next cycle not yet posted", "Closed, expected to
  recur" or "Status unknown".
- `application_deadline_or_cycle` is parsed: an ISO date is a confirmed deadline; "annual; last known deadline …; next cycle
  not yet published" is shown as anticipated; "rolling; no deadline published" as rolling. Anything else is shown as written.
- `award_amount` is shown as written. Filters use `award_max`, falling back to `details.award_typical`, then `award_min`.
- `research_categories` (semicolon-separated) feeds the Research area filter; areas with at least two programs are offered.
- `eligibility_notes` is always visible. `additional_eligibility_requirements`, `eligible_study_types` and the
  `details` fields `funding_duration`, `aoi_affiliation_reasoning`, `membership_details`, `geographic_notes`,
  `irb_requirements`, `application_requirements`, `allowable_expenses_notes` and `application_url` are in the expandable
  details under each entry.
- `official_program_url` is the link on the program name and the "Official program page" link.
