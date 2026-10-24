# Advanced Orthogonal Institute — architecture

This replaces the v4.8 single-file build (`index.html`, 1.65 MB). That file was
one page: every section was a `<div class="page">` shown and hidden by a
JavaScript `go(page, id)` call, so the whole site shared a single URL. Nothing
could be linked to, Google indexed one page, and AI crawlers had one document
to cite.

This build produces **29 prerendered public URLs**, each a complete static HTML
file, plus 11 client-only shells for per-visitor pages (see below).

---

## The rendering contract

Every public route is rendered to a full HTML file at build time. Cloudflare
Pages serves those files directly; React hydrates afterwards for the
interactive parts. Roughly two thirds of AI crawlers cannot execute JavaScript
— GPTBot, ClaudeBot and PerplexityBot fetch pages but never run scripts — so a
page whose content only exists after hydration does not exist to them.

`scripts/verify-prerender.mjs` runs as part of `npm run build` and fails the
build if any page lacks a title, meta description, canonical, JSON-LD, an
`<h1>`, or 300 characters of real text in the raw HTML. Without that gate,
breaking prerendering is silent: the site still looks perfect in a browser.

**When checking by hand: View Source, not Inspect Element.** Inspect Element
shows the DOM after JavaScript ran, which is not what a crawler receives.

Eleven routes are deliberately client-only and `noindex`: `/account`,
`/reset-password`, `/registration-confirmed`, `/membership/welcome` and the
seven `/seminars/<slug>/pay` pages. They are per-visitor and should never be
crawled; the build writes each an empty shell so a direct hit does not 404.

### URLs and trailing slashes

Every page is written as `<route>.html` (`about.html`; `/` alone is
`index.html`). Cloudflare Pages serves `about.html` at `/about` and redirects
`/about/` back to it, so the URL that is served is the canonical one, and the
canonical, the sitemap and every link agree (#100, fixed in #121). The old
`<route>/index.html` layout did the opposite: every canonical was a 308 to the
slash form. `public/_redirects` explains why it must never carry a rule that
rewrites a page to or from its slash form: Pages already normalizes those, and
a rule pointing the other way loops. `src/App.tsx` still strips a trailing slash
before looking up a route's metadata, so a stray slash never shows the 404
title.

Structured data comes from each route's `meta` (`src/lib/seo.ts`): every page
carries a WebPage graph, seminar pages a `Course`, and the Annual Conference an
`Event` with its dates, venue and offers.

## The route manifest

`src/routes.tsx` exports one array. Four things read it: client routing, the
prerenderer, the sitemap generator and the build-time renderer. Because they
share a source, a page cannot exist in the app but be missing from the sitemap,
or be prerendered without metadata. **Never duplicate a route list elsewhere.**

Each entry carries `path`, `Component`, a required `meta: PageMeta` and
`prerender: boolean`. `PageMeta` is required and typed, so a page cannot ship
without a title, description or canonical.

## Content

Content lives in `src/content/`, outside components: typed modules, plus the
seminar pages' marketing copy as plain Markdown documents. The same object
feeds the page, its metadata and its structured data, so what a human reads and
what a machine reads cannot drift apart.

At launch every string was lifted verbatim from the v4.8 build and verified
phrase by phrase against it (303 content phrases, zero dropped). That was a
one-time check; the copy has been edited since and v4.8 is no longer the
reference.

- `seminars.ts` — the catalog. `DB_SLUG` maps each site key to a
  `public.events.slug`, and that slug is also the page's public URL
  (`SEMINAR_SLUG`). The event a page *registers for* can differ, and `REG_SLUG`
  names it where it does: the three Fundamentals pages share the Monthly Huddle
  event, each Intensive weekend is its own event, and the Bootcamp registers
  through a permanent `advo-bootcamp` event. The browser overlay looks up
  `REG_SLUG` first, then `DB_SLUG`. `npm run check:catalog`
  (`scripts/check-catalog.mjs`, run in CI as a warning) reports any slug the
  site names that the database does not publish, and any published event the
  site does not know.
- `calendar.ts` — the standing calendar. Recurring events are rules ("third
  Friday of October"), so their dates and event slugs are computed, reckoned
  from `AS_OF`: the build date in Eastern time, stamped into both bundles as
  `__BUILD_DATE__` by `scripts/build.mjs` so the browser's first render matches
  the prerendered HTML.
- `seminar-copy/*.md` — one document per seminar page holding its marketing
  text, parsed at build time by `seminarCopy.ts`. A file that breaks the layout
  stops the build with the file and line. Dates, prices, the agenda and the
  instructors stay in `seminars.ts`.
- `people.ts` — speakers, instructors and the seated Board.
- `articles.ts`, `problems.ts`, `faq.ts`, `testimonials.ts`, `access.ts`.

## Tokens

`src/styles/tokens.css` is the single source for every design decision. Colors
are authored in OKLCH, converted from the palette the Board approved on v4.8,
and named by role — `content-secondary`, never `gray-400`. Roles survive a
rebrand; appearances do not. **No raw hex, `rgb()` or `rgba()` appears anywhere
else in the codebase**, including inline styles in components.

When the Institute becomes the CranioCervical Institute, the rebrand is a
change to these values, not to any component.

`src/styles/components.css` is the v4.8 visual design, ported so the rebuild is
pixel-identical to what the Board signed off on, with every color resolved to
a token.

## Navigation

Navigation is a real `<a href>`, never a click handler. `Link` renders a genuine
anchor, so middle-click, copy-link, "open in new tab" and every crawler get a
real URL. The click handler is only an enhancement: with JavaScript off the
anchor still works, because every route is a real file on disk.

## Data and security

The browser only ever holds the Supabase publishable key. Anything needing
`service_role` runs in an Edge Function.

At launch `create-checkout` was left unchanged: that function had already taken
and refunded real money, so the request body sent to it was byte-for-byte what
v4.8 sent, and only the return URL moved, to `/registration-confirmed`; the
function allowlists by **origin**, not path, so that needed no server change.
It has since been extended deliberately (the repo copy is v7, which adds
member RSVP and the CE certificate purchase). Prices are still resolved on the
server, never taken from the browser.

`src/lib/queries/` holds the data layer, on top of the small client in
`src/lib/supabase.ts`. Most components go through it, but not all: thirteen
files outside `src/lib/` import `src/lib/supabase.ts` directly. Most only touch
the session or sign-in (`entry-client.tsx`, `AccountPage`, `ResetPasswordPage`,
`AccountMenu`, `MemberShell`, `Overview`, `CalendarPanel`); the rest read or
write data or call an edge function themselves: `RegistrationDialog`,
`PayPage`, `JoinPage`, `ConfirmPage`, `RolesPanel`, and `ContactPage`, which
posts to the `contact-submit` function with a plain `fetch`. New data access
belongs in `src/lib/queries/`. The prerendered HTML carries the content-module values so a crawler
sees real dates and prices; in the browser, `CatalogProvider` overlays whatever
`v_public_events` currently says, because the database — not this repo — is the
source of truth for what is charged and whether registration is open.

## Access control

One call, `get_my_access()`, returns the person, their tier, every role they
hold with its committee, and a flat capability list. `AccessProvider` makes it
available as `can('manage_seminars')`. **No component reads a role.**

The rail in `src/lib/nav.ts` is generated from that capability list. This is the
one structural change from CCI OS, which keyed tabs to a role name: a committee
chair who was not also a board member fell through to the member list of tabs
and saw two. Here the capability reveals the tab, so seating someone on a
committee gives them the committee's surface and nothing else.

**The UI is not the security boundary.** Hiding a tab is a courtesy; the
row-level policies are what refuse the data. Both derive from the same
`person_roles` rows, so they cannot disagree. A capability decides whether to
ask; RLS decides whether to answer.

`tools/role-matrix.mjs` prints the menu each role resolves to, from the real nav
logic and capability strings measured against the live database. Run it after
any change to `nav.ts`.

### What was repaired in the database

Three role systems had grown up alongside each other. `members` was never
populated, yet `current_role_key()`, `current_committee_id()` and
`current_member_id()` all read it — so they returned NULL, and the six committee
manager checks built on them evaluated to false. 33 policies across 15 tables
had been failing closed, silently.

All of them now read `person_roles`, which is where roles are actually
administered. Alongside that:

- `is_staff()` and `is_oversight()` accept a role from the roster as well as
  from `profiles.role`, so assigning a role is sufficient on its own. That is
  what makes role assignment the only administrative act.
- Committee policies moved from `committee_id = current_committee_id()` to
  `chairs_committee(committee_id)`. A single id can only name one committee;
  anyone leading two silently lost access to one of them.
- `events.created_by` and `messages.member_id` were repointed from `members` to
  `people`.
- Four board members had roles on file that never resolved, because
  `people.auth_user_id` was empty for them. Linked.

There is no membership committee in this database — the nine are instructor,
curriculum, seminar, college_outreach, internship, certification, research,
marketing and nominations. `is_membership_manager()` still checks for the key,
so creating the committee is all it would take to delegate membership; until
then it rests on oversight.

---

## Deviations from the house standard

The standard asks for Vite 7, Tailwind v4 and React Router v7. **None of them
could be installed**: the build environment has no access to the npm registry
(`403 connect_rejected` by organization policy, from both the cloud container
and the local device VM). Rather than ship a project that had never been built
or verified, the three were replaced with equivalents that are in the repo and
that the build actually exercises:

| Standard | Here | Why |
|---|---|---|
| Vite 7 | `scripts/build.mjs` on esbuild | esbuild was available; it bundles, prerenders and generates the SEO files in one pass. |
| Tailwind v4 `@theme` | plain CSS custom properties on `:root` | No utility classes are used — the design is the ported v4.8 stylesheet — so the `@theme` block bought nothing without Tailwind installed. The "one token file, no raw hex elsewhere" rule is unchanged and holds. |
| React Router v7 | `src/lib/router.tsx` (~200 lines) | Provides the slice of the API this site uses, against the History API. Consistent with the standard's principle of copying components into the repo. |

What this costs: no HMR dev server, and the router has no data loaders or
nested layouts. What it preserves: every one of the five non-negotiables.
TypeScript is strict. The type check (`npx tsc --noEmit -p tsconfig.json`, also
`npm run typecheck`) now runs and is clean, with zero errors, and the GitHub
Action runs it on every pull request.

Swapping any of these back is a contained change — the components, content and
routes are untouched by it.

## Known follow-ups

- **Route-level code splitting.** The members area is already split out: `/account`
  loads `MemberShell` with `React.lazy`, so public pages ship about 161 kB of
  gzipped JavaScript (two files, 57 kB + 104 kB) plus 29 kB of gzipped CSS, and
  the members-area chunk (137 kB gzipped) is fetched only on `/account`
  (measured 2026-10-08 with `gzip`; 298 kB of JavaScript in all). No size budget
  is enforced. The old "116 kB, inside a 150 kB budget" figure predates the
  members area and no longer holds: the public pages alone are over it.
  Splitting the public pages themselves is still open; it needs care around
  hydrating prerendered markup.
- **`text-wrap: balance`** on headings was removed so line breaks match the
  approved design exactly. It is a real improvement and can be turned on as a
  deliberate change.
- **AVIF.** Images ship as WebP (about 1.1 MB across 30 files, against 1.32 MB of base64 in
  v4.8, and now loaded per page instead of all at once). AVIF encodes a further
  19% smaller; adding it means `image-set()` for the CSS backgrounds and
  `<picture>` for the headshots.
- **Rebuild on content change.** Events edited in CCI OS appear immediately via
  the live overlay, but the prerendered HTML only updates on the next deploy. A
  Supabase webhook hitting a Cloudflare deploy hook would close that gap.
- **One email layout in practice.** `supabase/functions/_email/email.ts`
  ("Obsidian") is meant to be the one template every email renders through,
  copied into each function folder that sends mail. Today the repo holds only
  that source file, with no copies, and the repo copies of `stripe-webhook`,
  `confirm-checkout` and `pay-link` still build their own plain HTML. Whether the
  deployed functions match is Chris's to confirm; bringing the repo record and
  the deployed functions together is his deploy step.
