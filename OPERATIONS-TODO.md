# Operations to-do — Advanced Orthogonal Institute

Standing items that live outside the code. Keep the newest decisions at the top of
each section.

## Email (Resend)

**Open: the Institute needs its own Resend account.**
Today (Sep 23, 2026) advancedorthogonal.com is verified inside Chris Slininger's
personal "vitalid" Resend account, and the sending API key from that account is
stored as the Supabase secret `RESEND_API_KEY`. That was the fastest way to get
sending working, not the right long-term home.

Eventually:

1. Create a Resend account owned by the Institute, under an Institute email
   address (for example info@advancedorthogonal.com), so a future Executive
   Director or the Board can manage it without touching Chris's clinic accounts,
   and so the Institute can be billed directly.
2. Add advancedorthogonal.com there and verify it. The GoDaddy DNS records stay
   as they are — the new account issues its own DKIM record, so expect to replace
   `resend._domainkey` and re-verify; `send` and `rsend` CNAMEs and `_dmarc` can
   stay.
3. Create a sending-only API key scoped to advancedorthogonal.com, replace
   `RESEND_API_KEY` in Supabase (Edge Functions → Secrets), and send the test
   emails again.
4. Remove advancedorthogonal.com from the vitalid account once the new account is
   sending, and revoke the old key.

Current settings, for reference:

- From: `Advanced Orthogonal Institute <registrations@advancedorthogonal.com>`
  (override with the `NOTIFY_FROM` secret)
- Replies from attendees and members go to `info@advancedorthogonal.com`
  (override with `REPLY_TO`)
- Institute notices go to `drslininger@cerebralchiropractic.com`
  (override with `NOTIFY_TO`, comma-separated)
- Email design: "Obsidian" — `supabase/functions/_email/email.ts` is the source of
  truth and is meant to be copied into each function folder that sends mail. No
  copies are in the repo today: the repo versions of `stripe-webhook`,
  `confirm-checkout` and `pay-link` still build their own plain HTML. Chris to
  confirm what the deployed functions use, and bring the repo record in line.

## Working with a second editor

James joined the repository as a collaborator in September 2026. The website's
files go through branches and pull requests (`CLAUDE.md` holds the rules both of
our Claude sessions follow). Supabase — the database, the edge functions and the
secrets — stays with the Executive Director, because changes there are live the
moment they are made and no pull request can catch them.

Still open:

- Add James's GitHub username to `.github/CODEOWNERS` if he should also be a
  required reviewer on payments, email or members-area code.
- Previewing a change before it is merged: rather than a preview per pull
  request, the branch being tested is mirrored to the `preview` branch
  (`git push -f origin <branch>:preview`) and checked at
  https://preview.advancedorthogonal.pages.dev. One fixed address, one change at
  a time; its members area uses the live database.

## Members area

- Registrations are matched to a member only by their login id, so a registration
  made at checkout never appears under My Registrations. Match by contact record
  as well.
- Build My Events (upcoming and past, with attendance) and a real My CE tab with
  downloadable attendance / CE verification letters.
