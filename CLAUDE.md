# Rules for Claude on advancedorthogonal.com

Two people edit this site — Chris Slininger (Executive Director) and James — each
in their own Claude sessions, which cannot see one another. GitHub is the only
shared picture. These rules keep the work from colliding.

Read `ARCHITECTURE.md` before changing anything structural. It explains the
rendering contract, the route manifest and why both matter.

## Never touch main directly

- `main` is the live site. Cloudflare Pages publishes it automatically within a
  few minutes of every merge.
- Never commit to, push to, or force-push `main`.
- Start every piece of work from a fresh `main`: switch to `main`, pull, then
  create a branch named for the change (`speaker-photos`, `fix-jobarah-spelling`).
  One change per branch.
- Finish by committing with a clear message, pushing the branch and opening a
  pull request that says what changed and why. Then stop.
- Approve or merge a pull request — yours or the other person's — only when the
  person you are working for tells you to, in that session, and only after its
  build check has passed. Never approve or merge on your own initiative.
- Chris's Claude runs in a cloud session that cannot reach GitHub. It makes the
  branch and the commits on his computer; Chris presses Publish/Push and Create
  Pull Request in GitHub Desktop. Say so when handing work back.

## Stay in your lane

- Before starting, list the open pull requests and branches. If one already
  touches the same pages or files, stop and say so.
- Keep changes small and on topic. Do not reformat, rename or tidy files the task
  did not ask about — that is what turns two people's work into a conflict.
- If `main` moved while you were working, update the branch from `main` before
  asking for review. If that conflicts in lines someone else wrote, stop and ask.

## The half of this site that is not in GitHub

The database, the edge functions (payments, email, check-in) and every secret
live in Supabase and take effect the moment they are changed. No branch, no
review, no undo. They belong to the Executive Director.

- Only Chris's sessions change Supabase: SQL, edge function deploys, secrets,
  Auth settings. A change James needs there goes through Chris.
- The repo copies of the edge functions under `supabase/functions/` are the
  record of what is deployed. Edit them in a pull request like any other file;
  deploying them is Chris's step.
- Database changes are additive. Never rename or drop an existing table, column
  or function without explicit permission, even when it looks unused.
- Never put a password, API key, token, or member's personal information in the
  repo. Secrets live in Supabase and Cloudflare settings. Git history keeps
  everything forever, including deleted files.
- Stripe, Resend, Cloudflare and GoDaddy dashboards are Chris's too. Claude never
  signs in, creates an account, or handles a key or a 2FA code.

## Building and checking

```bash
npm install          # once
npm run build        # prerenders every route; fails if a page loses its metadata
npm run serve        # preview the built site at http://localhost:4173
npx tsc --noEmit -p tsconfig.json   # type check
```

- `npm run build` must pass before a pull request. `verify-prerender.mjs` is part
  of it and is the gate that keeps pages readable to crawlers that never run
  JavaScript.
- The type check must be clean: zero errors. The GitHub Action in
  `.github/workflows/check.yml` runs the build and the type check on every pull
  request, so an error in a file you edited is yours to fix before review.
- `package-lock.json` is committed so every build installs the same versions.
  Commit it whenever `package.json` changes.
- `tools/preview/*-harness.mjs` build standalone pages that render one members-area
  panel against sample data, for screenshots without a login.

## House conventions

- Routes live in one place: `src/routes.tsx`. Never keep a second list of pages.
- Colors, spacing and type come from `src/styles/tokens.css`. Do not hard-code a
  hex value in a component.
- Two typefaces only: Outfit for display and small uppercase labels, Figtree for
  body text and numbers. Numbers that line up in columns use tabular figures.
- Person and status chips use the `.cpill` classes and the helpers in
  `src/lib/chips.ts`. Gold is reserved for a person's highest certification.
- Emails all render through `supabase/functions/_email/email.ts` (the "Obsidian"
  layout). It is meant to be copied into each function folder that sends mail,
  and the copies kept identical; no copies are in the repo yet (see
  `OPERATIONS-TODO.md`).
- Write for the reader, not the system: "Members awaiting RSVP", not
  "unconfirmed registrations".

## Tell the other person what you are doing

Open a GitHub issue for the work and assign it to yourself before starting, and
say in the pull request what changed and why. Two Claudes have no other way to
know about each other.
