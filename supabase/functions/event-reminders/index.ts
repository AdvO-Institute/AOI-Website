// CCI Website — event-reminders (v1)
// Runs once a day and emails reminders to everyone with a confirmed seat
// (paid or free, not cancelled) for an upcoming event. Issue #35.
//
// Monthly Huddle (one permanent event, slug `monthly-huddle`; each monthly
// call is a row in event_sessions — date, topic as the title, teacher as the
// speaker). Two emails per call, each about that one call only:
//   huddle_two_days  2 days before: the topic, who's teaching, how many are coming
//   huddle_day_of    the day of: a one-tap Zoom join button (events.zoom_url)
//
// In-person events (published seminars, conferences and trainings with a date):
//   week_before      1 week before: plan your trip — dates, venue, hotel, schedule
//   day_before       1 day before: see you tomorrow — start time, address, check-in
//   morning_of       the morning of: today's the day — check-in and a map link
//   hotel_book_by    a few days before the hotel's book-by date, only when the
//                    event has a room block
//
// Every date and time is shown in the event's own time zone. Each email
// carries a calendar invite (.ics) that Apple, Google and Outlook calendars
// open, and the Huddle's two-day email has an "Add to your calendar" button.
//
// Never sends twice: before each email a row goes into event_reminder_sends
// (unique on registration, kind and date); if that row already exists the
// email is skipped, and if the send fails the row is removed so the next run
// tries again. Each reminder has a small window of days (see WINDOWS), so a
// missed run, or someone who registers late, still gets it a day later.
//
// Call: POST, Authorization: Bearer <service role key>. Body (optional):
//   { "dry_run": true }                         — report what would go out; send nothing
//   { "dry_run": true, "today": "2026-10-11" }  — the same, as if today were that date
// The report gives counts only, never names or email addresses.
// Meant to run daily from pg_cron; see the pull request for the schedule.
//
// Env: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY. Optional: RESEND_API_KEY,
// NOTIFY_FROM, REPLY_TO (default info@advancedorthogonal.com), SITE_ORIGIN,
// EVENT_CONTACT_PHONE (a phone number shown on the day-before email).
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { renderEmail, eventDates, eventHours, eventPlace, greetingName, type EmailRow, type EventInfo } from "./email.ts";

const SB_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const RESEND_KEY = Deno.env.get("RESEND_API_KEY") ?? "";
const NOTIFY_FROM = Deno.env.get("NOTIFY_FROM") ?? "Advanced Orthogonal Institute <registrations@advancedorthogonal.com>";
const REPLY_TO = Deno.env.get("REPLY_TO") ?? "info@advancedorthogonal.com";
const SITE_ORIGIN = (Deno.env.get("SITE_ORIGIN") ?? "https://advancedorthogonal.com").replace(/\/+$/, "");
const CONTACT_PHONE = Deno.env.get("EVENT_CONTACT_PHONE") ?? "";

const HUDDLE_SLUG = "monthly-huddle"; // must match src/content/calendar.ts
const DEFAULT_TZ = "America/New_York";
// Not in-person: governance meetings, webinars, and the always-open courses.
const NOT_IN_PERSON_TYPES = new Set(["board", "committee", "deadline", "meeting"]);
const NOT_IN_PERSON_CATEGORIES = new Set(["webinar", "free", "internship"]);

type Kind = "huddle_two_days" | "huddle_day_of" | "week_before" | "day_before" | "morning_of" | "hotel_book_by";
/** How many days ahead each reminder may go out. The first number is the
 *  normal day; the rest catch a missed run or a late registration. The
 *  windows never overlap, so nobody gets two of these on the same day. */
const WINDOWS: Record<Kind, number[]> = {
  huddle_two_days: [2, 1],
  huddle_day_of: [0],
  week_before: [7, 6, 5, 4, 3],
  day_before: [1],
  morning_of: [0],
  hotel_book_by: [3, 2, 1],
};

const json = (status: number, body: unknown) => new Response(JSON.stringify(body, null, 2), { status, headers: { "Content-Type": "application/json" } });
const sb = (path: string, init: RequestInit = {}) => fetch(`${SB_URL}${path}`, { ...init, headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}`, "Content-Type": "application/json", ...(init.headers ?? {}) } });
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/* ------------------------------------------------------------- the rows */

type Session = { id: string | null; title: string | null; starts_at: string | null; ends_at: string | null; speaker: string | null; sort: number | null };
type Ev = EventInfo & {
  id: number; category: string | null; event_type: string | null; location_id: number | null; zoom_url: string | null;
  room_block_hotel: string | null; room_block_rate: string | null; room_block_by: string | null;
  event_sessions?: Session[] | null;
};
type Reg = { id: string; full_name: string | null; email: string | null };

const EVENT_SELECT = [
  "id,slug,title,subtitle,category,event_type,starts_at,ends_at,timezone,location,location_id,zoom_url",
  "room_block_hotel,room_block_rate,room_block_by,ce_school,ce_mode",
  "venue:locations(name,address,city,state)",
  "event_sessions(id,title,starts_at,ends_at,speaker,sort)",
].join(",");

async function events(filter: string): Promise<Ev[]> {
  const r = await sb(`/rest/v1/events?status=eq.published&${filter}&select=${EVENT_SELECT}`);
  if (!r.ok) throw new Error(`events read failed: ${r.status} ${await r.text()}`);
  return await r.json();
}

/** Confirmed seats only: paid or free, and not cancelled — the same test the Events tab uses. */
async function confirmed(eventId: number): Promise<Reg[]> {
  const r = await sb(`/rest/v1/event_registrations?event_id=eq.${eventId}&registration_status=neq.cancelled&payment_status=in.(paid,free)&select=id,full_name,email&order=created_at.asc`);
  if (!r.ok) throw new Error(`registrations read failed: ${r.status} ${await r.text()}`);
  return await r.json();
}

/* ------------------------------------------------------------ the dates */

/** The calendar date of an instant in a time zone, as YYYY-MM-DD. */
const ymd = (at: string | Date, tz: string) => new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(at));
/** Whole days from one YYYY-MM-DD to another. */
const daysFrom = (a: string, b: string) => Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86_400_000);
const addDays = (d: string, n: number) => new Date(Date.parse(`${d}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);

const tzOf = (ev: Ev) => ev.timezone || DEFAULT_TZ;
const clock = (iso: string, tz: string) => new Date(iso).toLocaleTimeString("en-US", { timeZone: tz, hour: "numeric", minute: "2-digit" });
function zone(iso: string, tz: string): string {
  const z = new Date(iso).toLocaleTimeString("en-US", { timeZone: tz, timeZoneName: "short" }).split(" ").pop() ?? "";
  return /^E[SD]T$/.test(z) ? "ET" : /^C[SD]T$/.test(z) ? "CT" : /^M[SD]T$/.test(z) ? "MT" : /^P[SD]T$/.test(z) ? "PT" : z;
}
/** "9:00 PM ET" */
const clockZ = (iso: string, tz: string) => `${clock(iso, tz)} ${zone(iso, tz)}`;
/** "9:00 PM – 10:00 PM ET", or just the start when there is no end. */
const hours = (start: string, end: string | null, tz: string) => end ? eventHours({ starts_at: start, ends_at: end, timezone: tz }) : clockZ(start, tz);
/** "Tuesday, October 13" */
const dayLong = (iso: string, tz: string) => new Date(iso).toLocaleDateString("en-US", { timeZone: tz, weekday: "long", month: "long", day: "numeric" });
const weekday = (iso: string, tz: string) => new Date(iso).toLocaleDateString("en-US", { timeZone: tz, weekday: "long" });
/** A YYYY-MM-DD date column (the hotel book-by date) as "Friday, January 29". */
const dateLong = (d: string) => new Date(`${d}T12:00:00Z`).toLocaleDateString("en-US", { timeZone: "UTC", weekday: "long", month: "long", day: "numeric" });

/* ------------------------------------------------------- calendar links */

const icsText = (s: unknown) => String(s ?? "").replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");
const icsTime = (ms: number) => new Date(ms).toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
/** Long lines are folded at 75 characters, as calendar apps expect. */
const fold = (line: string) => line.length <= 75 ? line : line.match(/.{1,74}/g)!.join("\r\n ");

type Slot = { start: number; end: number };
/** An in-person event shows as one calendar entry per day, at the daily hours,
 *  rather than one block running through the nights. */
function eventSlots(ev: Ev): Slot[] {
  const start = Date.parse(ev.starts_at!);
  const end = ev.ends_at ? Date.parse(ev.ends_at) : start + 3600_000;
  const days = Math.max(1, daysFrom(ymd(ev.starts_at!, tzOf(ev)), ymd(new Date(end), tzOf(ev))) + 1);
  if (days === 1) return [{ start, end }];
  const daily = ((end - start) % 86_400_000) || 3600_000;
  return Array.from({ length: days }, (_, i) => ({ start: start + i * 86_400_000, end: start + i * 86_400_000 + daily }));
}

function ics(uid: string, slots: Slot[], summary: string, location: string, description: string, url: string): string {
  const stamp = icsTime(Date.now());
  const lines = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Advanced Orthogonal Institute//Event reminders//EN", "CALSCALE:GREGORIAN", "METHOD:PUBLISH"];
  slots.forEach((s, i) => lines.push("BEGIN:VEVENT", `UID:${uid}-${i}@advancedorthogonal.com`, `DTSTAMP:${stamp}`, `DTSTART:${icsTime(s.start)}`, `DTEND:${icsTime(s.end)}`,
    `SUMMARY:${icsText(summary)}`, ...(location ? [`LOCATION:${icsText(location)}`] : []), ...(description ? [`DESCRIPTION:${icsText(description)}`] : []), ...(url ? [`URL:${url}`] : []), "END:VEVENT"));
  lines.push("END:VCALENDAR");
  return lines.map(fold).join("\r\n") + "\r\n";
}

function googleCalendar(summary: string, slot: Slot, location: string, details: string): string {
  const q = new URLSearchParams({ action: "TEMPLATE", text: summary, dates: `${icsTime(slot.start)}/${icsTime(slot.end)}`, details, location });
  return `https://calendar.google.com/calendar/render?${q.toString()}`;
}

const mapUrl = (place: string) => `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(place)}`;
const eventUrl = (ev: Ev) => ev.slug ? `${SITE_ORIGIN}/seminars/${ev.slug}` : `${SITE_ORIGIN}/account`;

/* ------------------------------------------------------------ the emails */

type Out = { subject: string; html: string; ics: string; icsName: string };

/** "12 doctors are coming." Never names; left out when it would read oddly. */
const headcount = (n: number) => n >= 3 ? `${n} doctors are coming.` : "";

function huddleTwoDays(reg: Reg, ev: Ev, s: Session, days: number, count: number): Out {
  const tz = tzOf(ev), at = s.starts_at!;
  const topic = (s.title ?? "").trim(), teacher = (s.speaker ?? "").trim();
  const when = days <= 1 ? "tomorrow" : `this ${weekday(at, tz)}`;
  const slot = { start: Date.parse(at), end: s.ends_at ? Date.parse(s.ends_at) : Date.parse(at) + 3600_000 };
  const summary = `Monthly Huddle${topic ? `: ${topic}` : ""}`;
  const details = [topic && `This month: ${topic}`, teacher && `Teaching: ${teacher}`, "We'll email the Zoom link the day of the call."].filter(Boolean).join("\n");
  const where = ev.zoom_url || "Zoom";
  return {
    subject: `Monthly Huddle ${when}${topic ? `: ${topic}` : ""}`,
    icsName: "monthly-huddle.ics",
    ics: ics(`huddle-${ev.id}-${ymd(at, tz)}`, [slot], summary, where, details, ev.zoom_url ?? ""),
    html: renderEmail({
      origin: SITE_ORIGIN,
      preheader: [dayLong(at, tz), clockZ(at, tz), teacher && `with ${teacher}`].filter(Boolean).join(" · "),
      eyebrow: "Monthly Huddle",
      title: "See you", titleAccent: days <= 1 ? "tomorrow." : `on ${weekday(at, tz)}.`,
      paragraphs: [
        `Hi ${greetingName(reg.full_name)}, this month’s Huddle is ${days <= 1 ? "tomorrow," : "on"} ${dayLong(at, tz)}, at ${clockZ(at, tz)}.${topic ? ` ${teacher ? `${teacher} is teaching` : "The topic is"} “${topic}.”` : ""}`,
        [headcount(count), "The Huddle is about connecting with each other first, so come ready to catch up."].filter(Boolean).join(" "),
      ],
      rows: [["Date", dayLong(at, tz)], ["Time", hours(at, s.ends_at, tz)], ["Topic", topic], ["Teaching", teacher], ["Where", "On Zoom. We’ll email your join link the day of the call."]],
      cta: { label: "Add to your calendar", href: googleCalendar(summary, slot, where, details) },
      note: "Use Apple or Outlook Calendar? Open the invite attached to this email.",
    }),
  };
}

function huddleDayOf(reg: Reg, ev: Ev, s: Session, count: number): Out {
  const tz = tzOf(ev), at = s.starts_at!;
  const topic = (s.title ?? "").trim(), teacher = (s.speaker ?? "").trim();
  const evening = Number(new Date(at).toLocaleString("en-US", { timeZone: tz, hour: "numeric", hourCycle: "h23" })) >= 17;
  const slot = { start: Date.parse(at), end: s.ends_at ? Date.parse(s.ends_at) : Date.parse(at) + 3600_000 };
  const summary = `Monthly Huddle${topic ? `: ${topic}` : ""}`;
  return {
    subject: `${evening ? "Tonight" : "Today"} at ${clockZ(at, tz)}: Monthly Huddle${topic ? ` — ${topic}` : ""}`,
    icsName: "monthly-huddle.ics",
    ics: ics(`huddle-${ev.id}-${ymd(at, tz)}`, [slot], summary, ev.zoom_url || "Zoom", [topic && `This month: ${topic}`, teacher && `Teaching: ${teacher}`].filter(Boolean).join("\n"), ev.zoom_url ?? ""),
    html: renderEmail({
      origin: SITE_ORIGIN,
      preheader: `${clockZ(at, tz)}${topic ? ` · ${topic}` : ""} · one tap to join`,
      eyebrow: "Monthly Huddle",
      title: "Join us", titleAccent: evening ? "tonight." : "today.",
      paragraphs: [
        `Hi ${greetingName(reg.full_name)}, the Huddle starts at ${clockZ(at, tz)}.${topic ? ` ${teacher ? `${teacher} is teaching` : "This month’s topic is"} “${topic}.”` : ""} ${headcount(count)}`.trim(),
        ev.zoom_url ? "When it’s time, tap the button below and you’re in." : "Your Zoom link is in the members area calendar.",
      ],
      rows: [["Time", hours(at, s.ends_at, tz)], ["Topic", topic], ["Teaching", teacher]],
      cta: ev.zoom_url ? { label: "Join on Zoom", href: ev.zoom_url } : { label: "Open the members area", href: `${SITE_ORIGIN}/account` },
      note: "Running late? Join whenever you can — we’re glad to see you.",
    }),
  };
}

function scheduleText(ev: Ev): string {
  const tz = tzOf(ev);
  const list = [...(ev.event_sessions ?? [])].filter((s) => s.starts_at && (s.title ?? "").trim())
    .sort((a, b) => String(a.starts_at).localeCompare(String(b.starts_at)) || (Number(a.sort ?? 0) - Number(b.sort ?? 0)));
  const lines = list.slice(0, 14).map((s) => {
    const d = new Date(s.starts_at!).toLocaleDateString("en-US", { timeZone: tz, weekday: "short" });
    return `${d} ${clock(s.starts_at!, tz)} · ${s.title!.trim()}${s.speaker ? ` (${s.speaker.trim()})` : ""}`;
  });
  if (list.length > 14) lines.push("…and more on the event page");
  return lines.join("\n");
}

function hotelText(ev: Ev, today: string, withDate = true): string {
  if (!ev.room_block_hotel) return "";
  const open = ev.room_block_by && ev.room_block_by >= today;
  return [ev.room_block_hotel, ev.room_block_rate ? `Group rate: ${ev.room_block_rate}` : "", withDate && open ? `Book by ${dateLong(ev.room_block_by!)}` : ""].filter(Boolean).join("\n");
}

function inPerson(kind: Kind, reg: Reg, ev: Ev, days: number, today: string): Out {
  const tz = tzOf(ev), start = ev.starts_at!;
  const place = eventPlace(ev);
  const placeLine = place.replace(/\n/g, ", ");
  const name = greetingName(reg.full_name);
  const title = ev.title ?? "your event";
  const startsAt = clockZ(start, tz);
  const ce = !!(ev.ce_school || ev.ce_mode);
  const out = (subject: string, html: string): Out => ({
    subject, html, icsName: `${ev.slug || "aoi-event"}.ics`,
    ics: ics(`event-${ev.id}`, eventSlots(ev), title, placeLine, `${eventDates(ev)}\n${eventHours(ev)}`, eventUrl(ev)),
  });
  const contact = [CONTACT_PHONE, REPLY_TO].filter(Boolean).join("\n");

  if (kind === "week_before") {
    const lead = days === 7 ? `the ${title} is one week away` : `the ${title} is coming up on ${dayLong(start, tz)}`;
    return out(days === 7 ? `One week to go — ${title}` : `Coming up ${weekday(start, tz)} — ${title}`, renderEmail({
      origin: SITE_ORIGIN,
      preheader: `${eventDates(ev)} · ${place.split("\n")[0] ?? ""}`,
      eyebrow: title,
      title: "Plan your", titleAccent: "trip.",
      paragraphs: [`Hi ${name}, ${lead}. Here’s everything you need to plan your travel. We can’t wait to see you.`],
      rows: [["Dates", eventDates(ev)], ["Hours", eventHours(ev)], ["Location", place], ["Hotel", hotelText(ev, today)], ["Schedule", scheduleText(ev)]],
      cta: ev.slug ? { label: "View the program", href: eventUrl(ev) } : undefined,
      note: `${ce ? "For CE credit, sign in and out of every session.\n" : ""}The attached invite adds the event to your calendar.`,
    }));
  }
  if (kind === "day_before") {
    return out(`See you tomorrow — ${title}`, renderEmail({
      origin: SITE_ORIGIN,
      preheader: `Starts tomorrow at ${startsAt} · ${place.split("\n")[0] ?? ""}`,
      eyebrow: title,
      title: "See you", titleAccent: "tomorrow.",
      paragraphs: [`Hi ${name}, we’re looking forward to seeing you tomorrow. The ${title} starts at ${startsAt}. Please plan to arrive a few minutes early so you have time to check in.`],
      rows: [["Starts", `${dayLong(start, tz)} at ${startsAt}`], ["Location", place], ["Check in", "At the registration desk when you arrive. Just give us your name."], ["Contact", contact]],
      cta: placeLine ? { label: "Get directions", href: mapUrl(placeLine) } : undefined,
      note: ce ? "For CE credit, sign in and out of every session." : undefined,
    }));
  }
  if (kind === "morning_of") {
    return out(`Today’s the day — ${title}`, renderEmail({
      origin: SITE_ORIGIN,
      preheader: `Check in before ${startsAt} · ${place.split("\n")[0] ?? ""}`,
      eyebrow: title,
      title: "Today’s", titleAccent: "the day.",
      paragraphs: [`Good morning, ${name}! The ${title} starts at ${startsAt}. When you arrive, stop by the registration desk and give us your name, and we’ll check you in.`],
      rows: [["Check in", `At the registration desk, before the ${startsAt} start`], ["Location", place]],
      cta: placeLine ? { label: "Open the map", href: mapUrl(placeLine) } : undefined,
      note: ce ? "For CE credit, sign in and out of every session." : "See you soon!",
    }));
  }
  // hotel_book_by
  return out(`Book your hotel by ${dateLong(ev.room_block_by!)} — ${title}`, renderEmail({
    origin: SITE_ORIGIN,
    preheader: `The group rate at ${ev.room_block_hotel} is held until ${dateLong(ev.room_block_by!)}.`,
    eyebrow: title,
    title: "Book your", titleAccent: "hotel.",
    paragraphs: [`Hi ${name}, a quick reminder: the room block for the ${title} at ${ev.room_block_hotel} is held until ${dateLong(ev.room_block_by!)}. After that, the group rate may not be available.`],
    rows: [["Hotel", hotelText(ev, today, false)], ["Book by", dateLong(ev.room_block_by!)], ["Event", `${eventDates(ev)}\n${place}`]],
    cta: ev.slug ? { label: "View the event page", href: eventUrl(ev) } : undefined,
    note: "Already booked? You’re all set — no need to reply.",
  }));
}

/* ------------------------------------------------------------ sending */

const b64 = (s: string) => { const bytes = new TextEncoder().encode(s); let bin = ""; for (const b of bytes) bin += String.fromCharCode(b); return btoa(bin); };

async function send(to: string, m: Out): Promise<boolean> {
  if (!RESEND_KEY) { console.log("email skipped (RESEND_API_KEY not set)", m.subject); return false; }
  const r = await fetch("https://api.resend.com/emails", {
    method: "POST", headers: { Authorization: `Bearer ${RESEND_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from: NOTIFY_FROM, to: [to], subject: m.subject, html: m.html, reply_to: REPLY_TO,
      attachments: [{ filename: m.icsName, content: b64(m.ics), content_type: "text/calendar" }] }),
  });
  if (!r.ok) console.error("email send failed", r.status, await r.text());
  return r.ok;
}

type Claim = { event_id: number; session_id: string | null; registration_id: string; kind: Kind; occurs_on: string };

/** Records the send first. False means this reminder already went out. */
async function claim(c: Claim): Promise<boolean> {
  const r = await sb(`/rest/v1/event_reminder_sends?on_conflict=registration_id,kind,occurs_on`, {
    method: "POST", headers: { Prefer: "resolution=ignore-duplicates,return=representation" }, body: JSON.stringify(c),
  });
  if (!r.ok) throw new Error(`event_reminder_sends write failed: ${r.status} ${await r.text()}`);
  const rows = await r.json();
  return Array.isArray(rows) && rows.length > 0;
}
async function release(c: Claim): Promise<void> {
  await sb(`/rest/v1/event_reminder_sends?registration_id=eq.${c.registration_id}&kind=eq.${c.kind}&occurs_on=eq.${c.occurs_on}`, { method: "DELETE" });
}

/* ---------------------------------------------------------------- plan */

type Job = { ev: Ev; kind: Kind; occurs_on: string; days: number; session: Session | null };

function huddleJobs(ev: Ev, today: (tz: string) => string): Job[] {
  const tz = tzOf(ev), t = today(tz), jobs: Job[] = [];
  for (const s of ev.event_sessions ?? []) {
    if (!s.starts_at) continue;
    const on = ymd(s.starts_at, tz), days = daysFrom(t, on);
    for (const kind of ["huddle_two_days", "huddle_day_of"] as Kind[]) if (WINDOWS[kind].includes(days)) jobs.push({ ev, kind, occurs_on: on, days, session: s });
  }
  return jobs;
}

const isInPerson = (ev: Ev) => ev.slug !== HUDDLE_SLUG && !!ev.starts_at
  && !NOT_IN_PERSON_TYPES.has(ev.event_type ?? "") && !NOT_IN_PERSON_CATEGORIES.has(ev.category ?? "")
  && !(ev.zoom_url && !ev.location_id); // an online-only event

function inPersonJobs(ev: Ev, today: (tz: string) => string): Job[] {
  if (!isInPerson(ev)) return [];
  const tz = tzOf(ev), t = today(tz), on = ymd(ev.starts_at!, tz), days = daysFrom(t, on), jobs: Job[] = [];
  for (const kind of ["week_before", "day_before", "morning_of"] as Kind[]) if (WINDOWS[kind].includes(days)) jobs.push({ ev, kind, occurs_on: on, days, session: null });
  // The plan-your-trip email already carries the hotel and its book-by date,
  // so the separate hotel reminder only goes out outside that week.
  if (ev.room_block_hotel && ev.room_block_by && days > 0 && !jobs.some((j) => j.kind === "week_before")) {
    const bookBy = ev.room_block_by.slice(0, 10), d = daysFrom(t, bookBy);
    if (WINDOWS.hotel_book_by.includes(d)) jobs.push({ ev, kind: "hotel_book_by", occurs_on: bookBy, days: d, session: null });
  }
  return jobs;
}

/* --------------------------------------------------------------- serve */

Deno.serve(async (req) => {
  if (req.method !== "POST") return json(405, { error: "method_not_allowed" });
  if ((req.headers.get("Authorization") ?? "") !== `Bearer ${SERVICE_KEY}`) return json(401, { error: "unauthorized" });
  let body: Record<string, unknown> = {};
  try { const t = await req.text(); body = t ? JSON.parse(t) : {}; } catch { return json(400, { error: "invalid_json" }); }
  const dry = body.dry_run === true;
  const fixed = dry && typeof body.today === "string" && /^\d{4}-\d{2}-\d{2}$/.test(body.today) ? body.today : null;
  const today = (tz: string) => fixed ?? ymd(new Date(), tz);

  try {
    // The Huddle; in-person events starting in the next ten days; and any
    // event whose hotel book-by date is in the next week.
    const base = fixed ?? new Date().toISOString().slice(0, 10);
    const [huddle, soon, hotels] = await Promise.all([
      events(`slug=eq.${HUDDLE_SLUG}`),
      events(`starts_at=gte.${addDays(base, -2)}&starts_at=lte.${addDays(base, 10)}`),
      events(`room_block_hotel=not.is.null&room_block_by=gte.${addDays(base, -1)}&room_block_by=lte.${addDays(base, 7)}`),
    ]);
    const seen = new Set<number>();
    const jobs: Job[] = [];
    for (const ev of huddle) { seen.add(ev.id); jobs.push(...huddleJobs(ev, today)); }
    for (const ev of [...soon, ...hotels]) { if (seen.has(ev.id)) continue; seen.add(ev.id); jobs.push(...inPersonJobs(ev, today)); }

    const report: Record<string, unknown>[] = [];
    let sent = 0, already = 0, failed = 0;
    const regCache = new Map<number, Reg[]>();
    for (const job of jobs) {
      const regs = regCache.get(job.ev.id) ?? await confirmed(job.ev.id);
      regCache.set(job.ev.id, regs);
      const line = { event: job.ev.title, kind: job.kind, date: job.occurs_on, topic: job.session?.title ?? undefined, recipients: regs.filter((r) => r.email).length, sent: 0, already_sent: 0, failed: 0 };
      report.push(line);
      if (dry) continue;
      for (const reg of regs) {
        if (!reg.email) continue;
        const c: Claim = { event_id: job.ev.id, session_id: job.session?.id ?? null, registration_id: reg.id, kind: job.kind, occurs_on: job.occurs_on };
        if (!(await claim(c))) { line.already_sent++; already++; continue; }
        const m = job.kind === "huddle_two_days" ? huddleTwoDays(reg, job.ev, job.session!, job.days, regs.length)
          : job.kind === "huddle_day_of" ? huddleDayOf(reg, job.ev, job.session!, regs.length)
          : inPerson(job.kind, reg, job.ev, job.days, today(tzOf(job.ev)));
        if (await send(reg.email, m)) { line.sent++; sent++; } else { await release(c); line.failed++; failed++; }
        await sleep(550); // Resend allows about two sends a second
      }
    }
    return json(200, { dry_run: dry, today: fixed ?? ymd(new Date(), DEFAULT_TZ), reminders: report, sent, already_sent: already, failed });
  } catch (e) {
    console.error("event-reminders error", e);
    return json(500, { error: String((e as Error)?.message ?? e) });
  }
});
