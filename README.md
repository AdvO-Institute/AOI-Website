# Advanced Orthogonal Institute — AdvancedOrthogonal.com

The Institute keeps the name **Advanced Orthogonal Institute** until November,
when it becomes the CranioCervical Institute. The Advanced Orthogonal technique
name, protocol, and its Level 1 / Level 2 certification are unchanged.

## What changed in v5

The previous build was a single `index.html` where every page was shown and
hidden by JavaScript, so the whole site lived at one URL. This build gives every
page its own real URL — 29 public pages — each served as a complete static HTML file.

That fixes the thing the Board raised on 18 August: event pages can now be
linked to and shared directly, which is what hyper-targeted registration needs.

Nothing about the design changed. The rebuild was compared against the old site
page by page and renders identically.

## Running it

```sh
npm install
npm run build      # bundle, prerender every route, verify, write the SEO files
npm run serve      # preview the built site at http://localhost:4173
npx tsc --noEmit -p tsconfig.json   # TypeScript, strict (also: npm run typecheck)
```

The type check is deliberately kept out of `build` so a type error can never
block a deploy of working content. It must be clean all the same: the GitHub
Action in `.github/workflows/check.yml` runs the build and the type check on
every pull request and on every push to `main`.

`npm run build` fails if any page would reach a crawler without a title,
description, canonical, JSON-LD, an `<h1>`, or real text. That gate is the point
— breaking prerendering is otherwise silent.

## Deploying

Cloudflare Pages, from this repo's `main` branch.

| Setting | Value |
|---|---|
| Build command | `npm run build` |
| Build output directory | `dist/client` |
| Node version | 20 or newer |

The old setup served the repository root as static files with no build step, so
these two settings need to be entered once in the Cloudflare Pages dashboard
under **Settings → Builds & deployments**. After that, every push deploys.

If a build ever fails, Cloudflare keeps serving the last successful deployment —
the live site cannot go down because of a bad commit.

## Editing content

Copy lives in `src/content/`, not inside components:

| File | What it holds |
|---|---|
| `seminars.ts` | Every event: dates, prices, agenda, faculty, registration tiers |
| `people.ts` | Speakers, instructors, and the seated Board |
| `articles.ts` | The AOI Journal |
| `problems.ts` | The five "where cases get hard" pages |
| `faq.ts` | Home page FAQ (also emitted as FAQPage structured data) |

Adding a seminar or an article creates its URL, its sitemap entry and its
structured data automatically — `src/routes.tsx` derives all of it.

Event dates, prices and seat counts come from CCI OS at runtime, so those can be
changed in the database without touching this repo. The prerendered copy catches
up on the next deploy.

## Where things are

```
src/
  routes.tsx        the route manifest — routing, prerendering and sitemap all read this
  content/          all copy, as typed modules
  pages/            one component per page
  components/       layout, blocks, ui
  lib/              router, supabase client, queries, SEO builders
  styles/           tokens.css (every design decision) + components.css
scripts/build.mjs   bundle → prerender → sitemap/llms/robots
tools/              the one-time migration scripts used to port v4.8
```

`ARCHITECTURE.md` covers the rendering contract, the token rules, and where this
build deviates from the house standard and why.

## The member area

`/account` is the role-scoped shell: signed out it is the sign-in card, signed in
it is the left-rail menu generated from the roles the person holds. It is
client-only and `noindex` by design.

Roles are assigned in one place — **Roles & Access** in that menu, visible to
whoever the database reports as oversight. Assigning a role there is the whole
act: the menu that person sees and the rows the database will hand them both
follow from it. There is no second place to grant access.

Run `node tools/role-matrix.mjs` to see what each role currently resolves to.

## Status

Registration checkout is live through Stripe. Member sign-in runs against the
CCI OS Supabase project. The preview-mode bypass that existed for board review
has been removed.
