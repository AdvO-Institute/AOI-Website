// CCI Website — member-access (v2)
// Gives a member their way in. The site can check a password but could never
// create an account, which left most current members with nothing to sign in to.
//
// Actions:
//   invite      (staff)  one person: create the login if missing, link it to
//                        their contact record, and email a set-your-password link.
//   invite_all  (staff)  every current member who has no login yet.
//   activate    (public) "set up my account": only works for an email that
//                        belongs to a current member. Always answers the same
//                        way, so the endpoint cannot be used to discover who is
//                        a member.
//   reset       (public) forgot password, sent through Resend in the Institute's
//                        own design rather than Supabase's shared mailer.
//   signin      (public) "email me a sign-in link", the same way: our design,
//                        our address, and only to someone who already has a login.
//   status      (staff)  who has a login and when they last signed in, for the
//                        Members list.
//
// The link itself comes from Supabase (admin generate_link), so no password is
// ever created, seen, or sent by this function. Password links point at our own
// reset page with the token in the address, and the email also prints a
// one-time code. Neither is used until the member presses a button there:
// email scanners open every link, and spent Supabase's one-time link before the
// member ever clicked.
// Env: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, SUPABASE_ANON_KEY, RESEND_API_KEY.
// Optional: NOTIFY_FROM, REPLY_TO, SITE_ORIGIN.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { renderEmail, type EmailRow } from "./email.ts";

const SB_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
const RESEND_KEY = Deno.env.get("RESEND_API_KEY") ?? "";
const FROM = Deno.env.get("NOTIFY_FROM") ?? "Advanced Orthogonal Institute <registrations@advancedorthogonal.com>";
const REPLY_TO = Deno.env.get("REPLY_TO") ?? "info@advancedorthogonal.com";
const SITE_ORIGIN = (Deno.env.get("SITE_ORIGIN") ?? "https://www.advancedorthogonal.com").replace(/\/+$/, "");
const REDIRECT = `${SITE_ORIGIN}/reset-password`;

const CORS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { ...CORS, "Content-Type": "application/json" } });
const sb = (path: string, init: RequestInit = {}) => fetch(`${SB_URL}${path}`, { ...init, headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}`, "Content-Type": "application/json", ...(init.headers ?? {}) } });
const likeEscape = (v: string) => v.replace(/([\\%_])/g, "\\$1");
const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]{2,}$/;

type Person = { id: string; first_name: string; last_name: string; credentials: string | null; email: string | null; auth_user_id: string | null; membership_status: string | null; membership_expires: string | null };

const isCurrentMember = (p: Person) => {
  const today = new Date().toISOString().slice(0, 10);
  if (p.membership_expires) return p.membership_expires >= today;
  return ["active", "current", "good_standing"].includes(String(p.membership_status ?? "").toLowerCase());
};
const greeting = (p: Person) => (/\bDC\b|\bDO\b|\bMD\b|DCCJP/i.test(String(p.credentials ?? "")) ? `Dr. ${p.last_name}` : p.first_name);

/* ------------------------------------------------------------------ auth */
/** A password-setting link for this email. Creates the account only when asked;
 *  the public reset path never creates one, so an unknown address stays unknown. */
async function linkFor(email: string, createIfMissing = false): Promise<{ link: string; userId: string; code: string } | { error: string }> {
  const gen = async () => {
    const r = await sb(`/auth/v1/admin/generate_link`, { method: "POST", body: JSON.stringify({ type: "recovery", email, options: { redirect_to: REDIRECT } }) });
    return { ok: r.ok, body: await r.json().catch(() => ({})) } as { ok: boolean; body: any };
  };
  let g = await gen();
  if (!g.ok && !createIfMissing) return { error: "no account for that address" };
  if (!g.ok) {
    const made = await sb(`/auth/v1/admin/users`, { method: "POST", body: JSON.stringify({ email, email_confirm: true }) });
    if (!made.ok) return { error: `could not create the login: ${(await made.text()).slice(0, 200)}` };
    g = await gen();
    if (!g.ok) return { error: `could not make the link: ${JSON.stringify(g.body).slice(0, 200)}` };
  }
  const hashed = g.body?.hashed_token ?? g.body?.properties?.hashed_token;
  const action = g.body?.action_link ?? g.body?.properties?.action_link;
  const code = String(g.body?.email_otp ?? g.body?.properties?.email_otp ?? "");
  const userId = g.body?.user?.id ?? g.body?.id;
  // Our page with the token, used only on a click; Supabase's own link if no token came back.
  const link = hashed ? `${REDIRECT}?token_hash=${encodeURIComponent(hashed)}&type=recovery` : action;
  if (!link || !userId) return { error: "no link returned" };
  return { link, userId, code };
}

/** A one-click sign-in link, only for an address that already has a login.
 *  The login is looked up first because Supabase would otherwise create one. */
async function signInLinkFor(email: string): Promise<{ link: string; userId: string } | null> {
  const pr = await sb(`/rest/v1/profiles?email=ilike.${encodeURIComponent(likeEscape(email))}&select=id&limit=1`);
  const rows = pr.ok ? await pr.json() : [];
  if (!Array.isArray(rows) || !rows[0]?.id) return null;
  const r = await sb(`/auth/v1/admin/generate_link`, { method: "POST", body: JSON.stringify({ type: "magiclink", email, options: { redirect_to: `${SITE_ORIGIN}/account` } }) });
  const b: any = await r.json().catch(() => ({}));
  const link = b?.action_link ?? b?.properties?.action_link;
  const userId = b?.user?.id ?? b?.id;
  return r.ok && link && userId === rows[0].id ? { link, userId } : null;
}

/** Last sign-in for every login, keyed by login id. */
async function lastSignIns(): Promise<Map<string, string | null>> {
  const out = new Map<string, string | null>();
  for (let page = 1; page <= 20; page++) {
    const r = await sb(`/auth/v1/admin/users?page=${page}&per_page=500`);
    if (!r.ok) break;
    const b: any = await r.json().catch(() => ({}));
    const users: any[] = Array.isArray(b?.users) ? b.users : [];
    for (const u of users) out.set(u.id, u.last_sign_in_at ?? null);
    if (users.length < 500) break;
  }
  return out;
}

/** Whose contact record does this login already belong to? */
async function profileOwner(userId: string): Promise<string | null> {
  const r = await sb(`/rest/v1/profiles?id=eq.${userId}&select=person_id&limit=1`);
  const rows = r.ok ? await r.json() : [];
  return Array.isArray(rows) && rows[0] ? rows[0].person_id ?? null : null;
}

/** Makes sure the login, the profile row and the contact record all point at each other. */
async function linkProfile(person: Person, userId: string, email: string) {
  await sb(`/rest/v1/profiles?on_conflict=id`, {
    method: "POST", headers: { Prefer: "resolution=merge-duplicates" },
    body: JSON.stringify({ id: userId, person_id: person.id, email, full_name: `${person.first_name} ${person.last_name}`.trim() }),
  });
  if (person.auth_user_id !== userId) await sb(`/rest/v1/people?id=eq.${person.id}`, { method: "PATCH", body: JSON.stringify({ auth_user_id: userId, updated_at: new Date().toISOString() }) });
}

/* ----------------------------------------------------------------- mail */
async function send(to: string, subject: string, html: string): Promise<boolean> {
  if (!RESEND_KEY) { console.log("email skipped (RESEND_API_KEY not set)", subject); return false; }
  const logo = await logoBase64();
  const r = await fetch("https://api.resend.com/emails", {
    method: "POST", headers: { Authorization: `Bearer ${RESEND_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from: FROM, to: [to], reply_to: REPLY_TO, subject, html, ...(logo ? { attachments: [{ filename: "aoi-logo.png", content: logo, content_type: "image/png", content_id: "aoilogo" }] } : {}) }),
  });
  if (!r.ok) console.error("email send failed", r.status, (await r.text()).slice(0, 200));
  return r.ok;
}
let LOGO: string | null | undefined;
async function logoBase64(): Promise<string | null> {
  if (LOGO !== undefined) return LOGO;
  try {
    const r = await fetch(`${SITE_ORIGIN}/images/aoi-logo-email.png`);
    if (!r.ok) { LOGO = null; return LOGO; }
    const buf = new Uint8Array(await r.arrayBuffer());
    let s = "";
    for (let i = 0; i < buf.length; i += 0x8000) s += String.fromCharCode(...buf.subarray(i, i + 0x8000));
    LOGO = btoa(s);
  } catch { LOGO = null; }
  return LOGO;
}

const codeNote = (code: string) => code ? ` If the button says the link has expired, go to ${SITE_ORIGIN.replace(/^https?:\/\//, "")}/reset-password, choose “Already have a code from the email?” and enter the code above.` : "";

function inviteEmail(p: Person, link: string, email: string, code = ""): { subject: string; html: string } {
  const rows: EmailRow[] = [["Your login", email], ["Code", code], ["Membership", p.membership_expires ? `Current through ${new Date(p.membership_expires + "T12:00:00Z").toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric", timeZone: "UTC" })}` : "Current"]];
  return {
    subject: "Set up your Advanced Orthogonal Institute account",
    html: renderEmail({
      origin: SITE_ORIGIN, logoSrc: "cid:aoilogo",
      preheader: "One click, choose a password, and your member account is ready.",
      eyebrow: "Members area", title: "Your account is", titleAccent: "ready.",
      paragraphs: [
        `Hi ${greeting(p)}, your Advanced Orthogonal Institute membership now comes with an account on the website. Click below and choose a password — that is the whole setup.`,
        "Inside you will find your certification, your CE, the events you are registered for, and your listing in the doctor directory.",
      ],
      rows,
      cta: { label: "Choose your password", href: link },
      note: `This link and code are good for 24 hours.${codeNote(code)} If both have expired, go to advancedorthogonal.com, click Member Login, then “Forgot your password?” and we will send a new one.`,
    }),
  };
}
function signInEmail(name: string, link: string): { subject: string; html: string } {
  return {
    subject: "Your sign-in link for the Advanced Orthogonal Institute",
    html: renderEmail({
      origin: SITE_ORIGIN, logoSrc: "cid:aoilogo",
      preheader: "One click and you are in the members area.",
      eyebrow: "Members area", title: "Your sign-in", titleAccent: "link.",
      paragraphs: [`Hi ${name}, here is your link to sign in to the members area. No password needed.`, "If you did not ask for this, you can ignore this email — nobody can sign in without the link."],
      cta: { label: "Sign in", href: link },
      note: "This link works once and expires within the hour.",
    }),
  };
}
function resetEmail(name: string, link: string, email: string, code = ""): { subject: string; html: string } {
  return {
    subject: "Reset your Advanced Orthogonal Institute password",
    html: renderEmail({
      origin: SITE_ORIGIN, logoSrc: "cid:aoilogo",
      preheader: "Choose a new password for your member account.",
      eyebrow: "Members area", title: "Choose a new", titleAccent: "password.",
      paragraphs: [`Hi ${name}, here is your link to set a new password for the members area.`, "If you did not ask for this, you can ignore this email — nothing changes until a new password is saved."],
      rows: [["Your login", email], ["Code", code]],
      cta: { label: "Set a new password", href: link },
      note: `This link and code are good for 24 hours.${codeNote(code)}`,
    }),
  };
}

/* ----------------------------------------------------------------- work */
async function personBy(filter: string): Promise<Person | null> {
  const r = await sb(`/rest/v1/people?${filter}&select=id,first_name,last_name,credentials,email,auth_user_id,membership_status,membership_expires&limit=1`);
  const rows = r.ok ? await r.json() : [];
  return Array.isArray(rows) && rows[0] ? rows[0] : null;
}

/** Creates the login if needed and emails the set-password link. */
async function invitePerson(p: Person, overrideEmail?: string): Promise<{ ok: boolean; email?: string; detail?: string }> {
  const email = String(overrideEmail ?? p.email ?? "").trim();
  if (!EMAIL_RE.test(email)) return { ok: false, detail: "no usable email address on this contact record" };
  // Two people cannot share one login. If this address already belongs to
  // someone else's account, stop — repointing it would hand them each other's
  // membership, certification and CE.
  const taken = await sb(`/rest/v1/profiles?email=ilike.${encodeURIComponent(likeEscape(email))}&select=person_id&limit=1`);
  const takenRows = taken.ok ? await taken.json() : [];
  const takenBy = Array.isArray(takenRows) && takenRows[0] ? takenRows[0].person_id : null;
  if (takenBy && takenBy !== p.id) return { ok: false, email, detail: "another member already logs in with this address — they each need their own" };

  const l = await linkFor(email, true);
  if ("error" in l) return { ok: false, email, detail: l.error };
  const owner = await profileOwner(l.userId);
  if (owner && owner !== p.id) return { ok: false, email, detail: "that login already belongs to a different contact record" };
  await linkProfile(p, l.userId, email);
  const m = inviteEmail(p, l.link, email, l.code);
  const sent = await send(email, m.subject, m.html);
  return { ok: sent, email, detail: sent ? undefined : "the link was created but the email did not send" };
}

async function staffOk(req: Request): Promise<boolean> {
  const jwt = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
  if (!jwt || jwt === SERVICE_KEY) return false;
  const r = await fetch(`${SB_URL}/rest/v1/rpc/is_oversight`, { method: "POST", headers: { apikey: ANON_KEY || SERVICE_KEY, Authorization: `Bearer ${jwt}`, "Content-Type": "application/json" }, body: "{}" });
  return r.ok && (await r.json()) === true;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json(405, { error: "method_not_allowed" });
  let body: any; try { body = await req.json(); } catch { return json(400, { error: "invalid_json" }); }
  const action = String(body?.action ?? "");

  if (action === "status") {
    if (!(await staffOk(req))) return json(403, { error: "not_allowed" });
    const q = await sb(`/rest/v1/people?select=id,auth_user_id&auth_user_id=not.is.null&limit=5000`);
    const people: { id: string; auth_user_id: string }[] = q.ok ? await q.json() : [];
    const seen = await lastSignIns();
    const logins: Record<string, { last_sign_in_at: string | null }> = {};
    for (const p of people) if (seen.has(p.auth_user_id)) logins[p.id] = { last_sign_in_at: seen.get(p.auth_user_id) ?? null };
    return json(200, { ok: true, logins });
  }

  if (action === "invite" || action === "invite_all") {
    if (!(await staffOk(req))) return json(403, { error: "not_allowed" });

    if (action === "invite") {
      const p = await personBy(`id=eq.${encodeURIComponent(String(body?.person_id ?? ""))}`);
      if (!p) return json(404, { error: "person_not_found" });
      const r = await invitePerson(p, typeof body?.email === "string" ? body.email : undefined);
      return json(r.ok ? 200 : 422, { ...r, name: `${p.first_name} ${p.last_name}` });
    }

    const today = new Date().toISOString().slice(0, 10);
    const q = await sb(`/rest/v1/people?select=id,first_name,last_name,credentials,email,auth_user_id,membership_status,membership_expires&or=(membership_expires.gte.${today},membership_status.eq.active)&auth_user_id=is.null&deceased_on=is.null&order=last_name&limit=60`);
    // Only the people ticked in the list, when the list was trimmed.
    const pick: string[] | null = Array.isArray(body?.person_ids) ? body.person_ids.map(String) : null;
    const people: Person[] = (q.ok ? await q.json() as Person[] : []).filter((p) => !pick || pick.includes(p.id));
    const results: unknown[] = [];
    // Two contact records sharing one address cannot both have a login, so the
    // second one is listed and skipped rather than quietly taking the first
    // one's account.
    const seen = new Set<string>();
    for (const p of people) {
      const addr = String(p.email ?? "").trim().toLowerCase();
      const usable = EMAIL_RE.test(addr);
      const shared = usable && seen.has(addr);
      if (usable) seen.add(addr);
      if (body?.dry_run) {
        results.push({ id: p.id, name: `${p.first_name} ${p.last_name}`, email: p.email, would_invite: usable && !shared, ...(shared ? { detail: "another member on this list uses the same address" } : {}) });
        continue;
      }
      if (shared) { results.push({ name: `${p.first_name} ${p.last_name}`, ok: false, email: p.email, detail: "another member on this list uses the same address" }); continue; }
      const r = await invitePerson(p);
      results.push({ name: `${p.first_name} ${p.last_name}`, ...r });
      await new Promise((res) => setTimeout(res, 700)); // Resend rate limit
    }
    return json(200, { count: people.length, dry_run: !!body?.dry_run, results });
  }

  /* ------- public: same answer either way, so nothing can be fished out ---- */
  const email = String(body?.email ?? "").trim();
  const generic = { ok: true, message: "If that address belongs to a current member, a link is on its way. It can take a few minutes." };

  if (action === "activate") {
    if (!EMAIL_RE.test(email)) return json(400, { error: "invalid_email" });
    let p = await personBy(`email=ilike.${encodeURIComponent(likeEscape(email))}`);
    if (!p) {
      const pr = await sb(`/rest/v1/profiles?email=ilike.${encodeURIComponent(likeEscape(email))}&select=person_id&limit=1`);
      const rows = pr.ok ? await pr.json() : [];
      const pid = Array.isArray(rows) ? rows[0]?.person_id : null;
      if (pid) p = await personBy(`id=eq.${pid}`);
    }
    if (p && isCurrentMember(p)) await invitePerson(p, email);
    return json(200, generic);
  }

  if (action === "reset") {
    if (!EMAIL_RE.test(email)) return json(400, { error: "invalid_email" });
    const l = await linkFor(email); // never creates an account
    if (!("error" in l)) {
      const p = await personBy(`auth_user_id=eq.${l.userId}`);
      const m = resetEmail(p ? greeting(p) : "there", l.link, email, l.code);
      await send(email, m.subject, m.html);
    }
    return json(200, { ok: true, message: "If that address has an account, a reset link is on its way." });
  }

  if (action === "signin") {
    if (!EMAIL_RE.test(email)) return json(400, { error: "invalid_email" });
    const l = await signInLinkFor(email); // never creates an account
    if (l) {
      const p = await personBy(`auth_user_id=eq.${l.userId}`);
      const m = signInEmail(p ? greeting(p) : "there", l.link);
      await send(email, m.subject, m.html);
    }
    return json(200, { ok: true, message: "If that address has an account, a sign-in link is on its way." });
  }

  return json(400, { error: "unknown_action" });
});
