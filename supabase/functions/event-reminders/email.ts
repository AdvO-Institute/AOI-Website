// CCI Website — email layout ("Obsidian").
// One template for every email the site sends: black ground, the AOI logo,
// a gold hairline, a light display headline, a ruled list of details, one
// gold button. Built with tables and inline styles so Gmail, Outlook and
// Apple Mail all show the same thing. Copied into each function folder that
// sends mail (stripe-webhook, confirm-checkout, pay-link) — keep the copies
// identical; the source of truth is supabase/functions/_email/email.ts.

export type EmailRow = [label: string, value: string];
export type EmailInput = {
  /** Inbox preview text (hidden in the body). */
  preheader: string;
  /** Small teal caps line above the headline, e.g. the event name. */
  eyebrow?: string;
  /** Headline: plain part, then the gold part. "You're" + "registered." */
  title: string;
  titleAccent?: string;
  /** Paragraphs of plain text (escaped). */
  paragraphs?: string[];
  rows?: EmailRow[];
  /** A large amount line above the button, e.g. "$50". */
  amount?: string;
  cta?: { label: string; href: string };
  /** Small line under the button. */
  note?: string;
  /** Institute notices (to staff) get a quieter footer. */
  internal?: boolean;
  /** Absolute site origin for the logo and links. */
  origin: string;
  /** Override the logo src: a preview's data: URI, or `cid:aoilogo` when the
   *  logo travels with the message as an inline attachment (which is what the
   *  live senders do, so the logo shows even when remote images are blocked). */
  logoSrc?: string;
};

export const REPLY_TO_DEFAULT = "info@advancedorthogonal.com";

const esc = (s: unknown) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));
const nl = (s: string) => esc(s).replace(/\n/g, "<br>");

const C = { ground: "#000000", text: "#E9EEF0", soft: "#B7C6CB", label: "#7B9199", rule: "#1D2529", teal: "#4D9AA6", gold: "#ECB971", ink: "#000000", foot: "#6F858D" };
const SANS = "Figtree,'Helvetica Neue',Helvetica,Arial,sans-serif";
const DISPLAY = "Outfit,'Helvetica Neue',Helvetica,Arial,sans-serif";

export function renderEmail(o: EmailInput): string {
  const origin = o.origin.replace(/\/+$/, "");
  const logo = o.logoSrc ?? `${origin}/images/aoi-logo-email.png`;
  const rows = (o.rows ?? []).filter(([, v]) => v !== "" && v != null);
  const rowHtml = rows.map(([k, v], i) => `
              <tr>
                <td class="k" width="108" valign="top" style="border-top:1px solid ${C.rule};padding:14px 12px 12px 0;font:600 11px/1.4 ${DISPLAY};letter-spacing:2px;text-transform:uppercase;color:${C.label};${i === rows.length - 1 ? `border-bottom:1px solid ${C.rule};` : ""}">${esc(k)}</td>
                <td valign="top" style="border-top:1px solid ${C.rule};padding:11px 0;font:400 15px/1.55 ${SANS};color:${C.text};${i === rows.length - 1 ? `border-bottom:1px solid ${C.rule};` : ""}">${nl(v)}</td>
              </tr>`).join("");
  const paras = (o.paragraphs ?? []).map((p) => `<p style="margin:0 0 16px;font:400 16px/1.6 ${SANS};color:${C.text};">${nl(p)}</p>`).join("");
  const button = o.cta ? `
          <tr><td class="px" style="padding:28px 48px 0;">
            <table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>
              <td bgcolor="${C.gold}" style="background:${C.gold};">
                <a href="${esc(o.cta.href)}" target="_blank" style="display:inline-block;padding:16px 32px;font:700 14px/1 ${DISPLAY};letter-spacing:1.5px;text-transform:uppercase;color:${C.ink};text-decoration:none;">${esc(o.cta.label)}</a>
              </td></tr></table>
          </td></tr>` : "";
  const amount = o.amount ? `
          <tr><td class="px" style="padding:26px 48px 0;font:300 44px/1 ${DISPLAY};color:#FFFFFF;letter-spacing:-0.5px;">${esc(o.amount)}</td></tr>` : "";
  const note = o.note ? `
          <tr><td class="px" style="padding:22px 48px 0;font:400 14px/1.6 ${SANS};color:${C.soft};">${nl(o.note)}</td></tr>` : "";
  const footer = o.internal
    ? `Sent by the Advanced Orthogonal Institute website.<br><a href="${origin}/account" style="color:${C.gold};text-decoration:none;">Open the members area</a>`
    : `Questions? Just reply — it reaches <a href="mailto:${REPLY_TO_DEFAULT}" style="color:${C.gold};text-decoration:none;">${REPLY_TO_DEFAULT}</a><br>Advanced Orthogonal Institute · <a href="${origin}" style="color:${C.foot};text-decoration:none;">advancedorthogonal.com</a>`;

  return `<!DOCTYPE html>
<html lang="en" xmlns="http://www.w3.org/1999/xhtml">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="dark">
<meta name="supported-color-schemes" content="dark">
<title>${esc(o.titleAccent ? `${o.title} ${o.titleAccent}` : o.title)}</title>
<link href="https://fonts.googleapis.com/css2?family=Outfit:wght@300;500;600;700&family=Figtree:wght@400;600&display=swap" rel="stylesheet">
<style>
  body{margin:0;padding:0;background:#000000;}
  a{color:${C.gold};}
  @media only screen and (max-width:620px){
    .shell{width:100% !important;}
    .px{padding-left:24px !important;padding-right:24px !important;}
    .rule{margin:0 24px !important;}
    .logo{width:240px !important;height:auto !important;}
    .h1{font-size:32px !important;}
    .k{width:84px !important;}
  }
</style>
</head>
<body style="margin:0;padding:0;background:#000000;" bgcolor="#000000">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:#000000;">${esc(o.preheader)}&#8203;&nbsp;&#8203;&nbsp;&#8203;&nbsp;</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="#000000" style="background:#000000;">
  <tr><td align="center" style="padding:0;">
    <table role="presentation" class="shell" width="600" cellpadding="0" cellspacing="0" border="0" style="width:600px;max-width:600px;background:#000000;">
      <tr><td align="center" class="px" style="padding:40px 48px 30px;">
        <a href="${origin}" target="_blank" style="text-decoration:none;"><img class="logo" src="${esc(logo)}" width="300" alt="Advanced Orthogonal Institute" style="display:block;width:300px;max-width:100%;height:auto;border:0;outline:none;color:${C.text};font:600 18px/1.3 ${DISPLAY};letter-spacing:1px;text-decoration:none;"></a>
      </td></tr>
      <tr><td class="px" style="padding:0 48px;"><div class="rule" style="height:1px;line-height:1px;font-size:1px;background:${C.gold};">&nbsp;</div></td></tr>
      <tr><td class="px" style="padding:38px 48px 0;">
        ${o.eyebrow ? `<div style="font:600 11px/1.5 ${DISPLAY};letter-spacing:3px;text-transform:uppercase;color:${C.teal};">${esc(o.eyebrow)}</div>` : ""}
        <h1 class="h1" style="margin:12px 0 18px;font:300 40px/1.12 ${DISPLAY};color:#FFFFFF;letter-spacing:-0.4px;">${esc(o.title)}${o.titleAccent ? ` <span style="color:${C.gold};font-weight:500;">${esc(o.titleAccent)}</span>` : ""}</h1>
        ${paras}
        ${rowHtml ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;margin-top:6px;">${rowHtml}
        </table>` : ""}
      </td></tr>${amount}${button}${note}
      <tr><td align="center" class="px" style="padding:40px 48px 36px;font:400 12.5px/1.7 ${SANS};color:${C.foot};">${footer}</td></tr>
    </table>
  </td></tr>
</table>
</body>
</html>`;
}

/* ------------------------------------------------------------ event text */
export type EventInfo = { title?: string | null; subtitle?: string | null; slug?: string | null; starts_at?: string | null; ends_at?: string | null; timezone?: string | null; location?: string | null; ce_school?: string | null; ce_mode?: string | null; venue?: { name?: string | null; address?: string | null; city?: string | null; state?: string | null } | null };

export function eventDates(ev: EventInfo): string {
  if (!ev.starts_at) return "";
  const tz = ev.timezone || "America/New_York";
  const d = (iso: string, o: Intl.DateTimeFormatOptions) => new Date(iso).toLocaleDateString("en-US", { timeZone: tz, ...o });
  const a = ev.starts_at, b = ev.ends_at ?? ev.starts_at;
  if (d(a, { dateStyle: "short" }) === d(b, { dateStyle: "short" })) return d(a, { weekday: "long", month: "long", day: "numeric", year: "numeric" });
  const sameMonth = d(a, { month: "long" }) === d(b, { month: "long" });
  return `${d(a, { weekday: "long" })} & ${d(b, { weekday: "long" })}, ${d(a, { month: "long" })} ${d(a, { day: "numeric" })}–${sameMonth ? "" : d(b, { month: "long" }) + " "}${d(b, { day: "numeric" })}, ${d(b, { year: "numeric" })}`;
}
export function eventHours(ev: EventInfo): string {
  if (!ev.starts_at || !ev.ends_at) return "";
  const tz = ev.timezone || "America/New_York";
  const t = (iso: string) => new Date(iso).toLocaleTimeString("en-US", { timeZone: tz, hour: "numeric", minute: "2-digit" });
  const zone = new Date(ev.starts_at).toLocaleTimeString("en-US", { timeZone: tz, timeZoneName: "short" }).split(" ").pop() ?? "";
  const multi = new Date(ev.ends_at).getTime() - new Date(ev.starts_at).getTime() > 20 * 3600 * 1000;
  const z = /^E[SD]T$/.test(zone) ? "ET" : /^C[SD]T$/.test(zone) ? "CT" : /^M[SD]T$/.test(zone) ? "MT" : /^P[SD]T$/.test(zone) ? "PT" : zone;
  return `${t(ev.starts_at)} – ${t(ev.ends_at)} ${z}${multi ? ", each day" : ""}`;
}
export function eventPlace(ev: EventInfo): string {
  const v = ev.venue;
  if (v?.name) return [v.name, [v.address, [v.city, v.state].filter(Boolean).join(", ")].filter(Boolean).join(", ")].filter(Boolean).join("\n");
  return String(ev.location ?? "").replace(/ · /g, "\n");
}
export function ceHours(ev: EventInfo): string {
  const m = String(ev.ce_mode ?? "").match(/([\d.]+)\s*(instructional\s*)?hours?/i);
  return m ? `${m[1]} hours` : "";
}
export function ceText(ev: EventInfo): string {
  const h = ceHours(ev);
  return [h, ev.ce_school ? `through ${ev.ce_school}` : ""].filter(Boolean).join(" ");
}
export const money = (cents: unknown) => { const n = Number(cents ?? 0) / 100; return `$${n.toLocaleString("en-US", { minimumFractionDigits: n % 1 ? 2 : 0, maximumFractionDigits: 2 })}`; };
export const firstName = (full: unknown) => String(full ?? "").replace(/^dr\.?\s+/i, "").split(/[\s,]+/)[0] || "there";
export const greetingName = (full: unknown) => { const f = String(full ?? "").trim(); const last = f.replace(/,.*$/, "").split(/\s+/).pop(); return /^dr\.?\s/i.test(f) && last ? `Dr. ${last}` : firstName(f); };

/* ------------------------------------------------------------- the emails
 * Each returns { subject, html }. Values come from the database row; no
 * browser input reaches these. */
type Reg = Record<string, any>;
type Out = { subject: string; html: string };
const eventUrl = (origin: string, ev: EventInfo) => `${origin.replace(/\/+$/, "")}/seminars/${ev.slug ?? ""}`;
const TIER: Record<string, string> = { doctor: "Doctor", student: "Student", faculty: "College faculty", member: "Member" };

/** To the attendee: a paid ticket, a free seat, or a member RSVP. */
export function registeredEmail(reg: Reg, ev: EventInfo, origin: string, kind: "paid" | "free", logoSrc?: string): Out {
  const tier = String(reg.reg_type ?? "doctor");
  const member = tier === "member";
  const ce = ceText(ev);
  const ticket = member
    ? `Member · included with membership${Number(reg.price_paid_cents ?? 0) > 0 ? `\nCE certificate · ${money(reg.price_paid_cents)} paid` : ""}`
    : kind === "free" ? `${TIER[tier] ?? "Doctor"} · complimentary` : `${TIER[tier] ?? "Doctor"} · ${money(reg.price_paid_cents)} paid${reg.discount_applied ? ` (${String(reg.discount_applied).replace(/\+/g, " + ")})` : ""}`;
  const ceLine = !ev.ce_school && !ev.ce_mode ? ""
    : member ? (reg.ce_credits ? `Paid — ${ce}` : `Not included — add a CE certificate at the event or from the event page`)
    : `Included — ${ce}`;
  return {
    subject: member ? `Your seat is confirmed — ${ev.title}` : `You're registered — ${ev.title}`,
    html: renderEmail({
      origin, logoSrc,
      preheader: `${eventDates(ev)} · ${String(eventPlace(ev)).split("\n")[0]}`,
      eyebrow: [ev.title, (ev.subtitle ?? "").split("·")[0].trim()].filter(Boolean).join(" · "),
      title: member ? "Your seat is" : "You’re", titleAccent: member ? "confirmed." : "registered.",
      paragraphs: [`Hi ${greetingName(reg.full_name)}, ${member ? `your RSVP for the ${ev.title} is confirmed. Your seat is included with your AOI membership.` : `your seat for the ${ev.title} is confirmed.`} Everything you need is below; we’ll send reminders as the date gets closer.`],
      rows: [["Dates", eventDates(ev)], ["Hours", eventHours(ev)], ["Location", eventPlace(ev)], ["Ticket", ticket], ["CE", ceLine],
        ...(reg.verification_status === "pending" ? [["Next step", "We’ll confirm your student or faculty status by email before the event."] as EmailRow] : [])],
      cta: ev.slug ? { label: "View the program", href: eventUrl(origin, ev) } : undefined,
      note: ev.ce_school || ev.ce_mode ? "For CE credit, sign in and out of every session." : undefined,
    }),
  };
}

/** To the attendee: a secure link to pay for a CE certificate or a door registration. */
export function payLinkEmail(reg: Reg, ev: EventInfo, origin: string, kind: "ce" | "registration", amountCents: number, url: string, logoSrc?: string): Out {
  const ce = kind === "ce";
  return {
    subject: ce ? `Your CE certificate — ${ev.title} (${money(amountCents)})` : `Complete your registration — ${ev.title}`,
    html: renderEmail({
      origin, logoSrc,
      preheader: ce ? `Pay ${money(amountCents)} for your CE certificate — takes a minute on your phone.` : `Pay ${money(amountCents)} to confirm your seat.`,
      eyebrow: ev.title ?? "",
      title: ce ? "Your CE" : "Complete your", titleAccent: ce ? "certificate." : "registration.",
      paragraphs: [ce
        ? `Hi ${greetingName(reg.full_name)}, here’s the secure link to add CE credit for the ${ev.title}. Your seat is already confirmed — this is only for the certificate.`
        : `Hi ${greetingName(reg.full_name)}, you’re checked in for the ${ev.title}. Pay below to confirm your registration — CE is included.`],
      rows: [["Event", [ev.title, eventDates(ev)].filter(Boolean).join("\n")], ...(ce ? [["CE", ceText(ev) || "Continuing education certificate"] as EmailRow] : [["Ticket", `${TIER[String(reg.reg_type ?? "doctor")] ?? "Doctor"} · CE included`] as EmailRow])],
      amount: money(amountCents),
      cta: { label: `Pay ${money(amountCents)} now`, href: url },
      note: "Payments are processed securely by Stripe. You’ll get a confirmation as soon as it goes through.",
    }),
  };
}

/** To the attendee: their CE certificate payment went through. */
export function ceConfirmedEmail(reg: Reg, ev: EventInfo, origin: string, logoSrc?: string): Out {
  return {
    subject: `CE certificate confirmed — ${ev.title}`,
    html: renderEmail({
      origin, logoSrc,
      preheader: `${money(reg.ce_paid_cents)} received — remember to sign in and out of every session.`,
      eyebrow: ev.title ?? "",
      title: "CE certificate", titleAccent: "confirmed.",
      paragraphs: [`Hi ${greetingName(reg.full_name)}, your CE credit for the ${ev.title} is paid. Your certificate is issued after the event once attendance is verified.`],
      rows: [["CE", ceText(ev) || "Continuing education certificate"], ["Paid", money(reg.ce_paid_cents)], ["Event", [ev.title, eventDates(ev)].filter(Boolean).join("\n")]],
      note: "To receive credit, sign in and out of every session.",
    }),
  };
}

/** To the member: thank you for renewing. */
export function renewalThanksEmail(person: { first_name?: string; last_name?: string; credentials?: string | null }, amountCents: number, through: string | null, origin: string, logoSrc?: string): Out {
  const thru = through ? new Date(through + "T12:00:00Z").toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric", timeZone: "UTC" }) : "";
  const dr = /\bD\.?C\b|DC|MD|DO/.test(String(person.credentials ?? "")) ? `Dr. ${person.last_name}` : person.first_name;
  return {
    subject: "Thank you for renewing your AOI membership",
    html: renderEmail({
      origin, logoSrc,
      preheader: thru ? `Your membership now runs through ${thru}.` : "Your membership is renewed.",
      eyebrow: "Membership",
      title: "Thank you for", titleAccent: "renewing.",
      paragraphs: [`Hi ${dr ?? "there"}, your Advanced Orthogonal Institute membership is renewed. Thank you for supporting the Institute and the doctors moving this technique forward.`],
      rows: [["Amount", money(amountCents)], ["Member through", thru], ["Includes", "Your seat at the Annual Conference, member pricing on seminars, and the members area"]],
      cta: { label: "Open the members area", href: `${origin.replace(/\/+$/, "")}/account` },
    }),
  };
}

/** To the Institute: a short notice with the facts. */
export function noticeEmail(o: { subject: string; eyebrow: string; title: string; accent?: string; lead: string; rows: EmailRow[]; link?: { label: string; href: string } }, origin: string, logoSrc?: string): Out {
  return { subject: o.subject, html: renderEmail({ origin, logoSrc, internal: true, preheader: o.lead, eyebrow: o.eyebrow, title: o.title, titleAccent: o.accent, paragraphs: [o.lead], rows: o.rows, cta: o.link }) };
}
