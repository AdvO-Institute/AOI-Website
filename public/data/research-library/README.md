# Research Library data

`publications.json` is the public export of the Research Committee's Upper Cervical Research Library. The members area reads it at
`/data/research-library/publications.json` and shows it on the **Research Library** tab (`src/components/member/ResearchLibraryPanel.tsx`).

## Updating it

Replace the file with a fresh export (`python -m research_library.public_export` in the library's own project writes it), commit
it on a branch and open a pull request. Nothing else changes: no database, no Supabase step. Keep the file name and the field
names; a record's `record_id` never changes, so later exports line up with earlier ones.

## What the page does with the fields

- Shows `title`, falling back to the bibliography's `citation` line when there is no title. A record with neither, or one flagged
  `citation_parse_incomplete`, is not shown (the page counts them in its footer).
- `year` outside 1895–2026 is printed as unknown and sorted last; the value in the file is left alone.
- `publication_type` tokens become labels (`case_report` → "Case report"); empty means "not yet determined" and shows nothing.
- `topics` are the compilation's headings; they are filters.
- `doi_url` is the only link. There are no links to files.
- `possible_duplicate` in `review_flags` shows a chip; records are never merged.

The full field list is the committee's `DATA_DICTIONARY.md`, kept with the library, not here.
