// M117, money and fines before you go live (docs/milestones/M117-cost-and-fines.md). The ids the engine's static rules
// (runner/src/money/) send in the "money" part of ship.gates, and the shape every side checks. No free text: every word on
// the page is made from these ids and the finding's file, line, method and route path, so nothing of the person's code, no
// value and no key can ride along. The part is never a gate: it never changes canShip, blockedBy or needsYou.
export const MONEY_FAMILIES = ["rate", "abuse", "spend", "fines"] as const;
export type MoneyFamily = (typeof MONEY_FAMILIES)[number];
export const MONEY_KINDS = ["paid_route_open", "heavy_route_open", "form_open", "auth_open", "no_privacy_page", "tracker_no_consent", "no_delete_account"] as const;
export type MoneyKind = (typeof MONEY_KINDS)[number];
/** The kinds that are about a route or a form, and so may be said to be set up outside the code (a dashboard rule). */
export const MONEY_TOLD_KINDS = ["paid_route_open", "heavy_route_open", "form_open", "auth_open"] as const;
export type MoneyToldKind = (typeof MONEY_TOLD_KINDS)[number];
/** The family each kind belongs to. */
export const MONEY_FAMILY_OF: Record<MoneyKind, MoneyFamily> = {
  paid_route_open: "rate", heavy_route_open: "rate", form_open: "abuse", auth_open: "abuse", no_privacy_page: "fines", tracker_no_consent: "fines", no_delete_account: "fines",
};
// other_ai: an AI model called through the AI SDK (the "ai" package) or an @ai-sdk provider not on this list. vercel,
// supabase and cloudflare: hosts that bill by use, for the spending list only.
export const MONEY_SERVICES = ["openai", "anthropic", "google_ai", "replicate", "groq", "mistral", "cohere", "together", "fal", "huggingface", "deepgram", "assemblyai", "elevenlabs", "openrouter", "other_ai",
  "resend", "sendgrid", "postmark", "mailgun", "ses", "nodemailer", "twilio", "sns", "vonage", "plivo", "puppeteer", "playwright", "ffmpeg", "sharp", "vercel", "supabase", "cloudflare"] as const;
export type MoneyService = (typeof MONEY_SERVICES)[number];
export const MONEY_TRACKERS = ["google_analytics", "google_ads", "meta_pixel", "posthog", "mixpanel", "hotjar", "segment", "amplitude", "heap", "clarity", "linkedin", "tiktok", "chat_widget"] as const;
export type MoneyTracker = (typeof MONEY_TRACKERS)[number];
/** Analytics their makers say use no cookies: listed, never flagged. */
export const MONEY_COOKIELESS = ["plausible", "fathom", "simple_analytics", "umami", "vercel_analytics", "cloudflare_analytics", "pirsch"] as const;
export type MoneyCookieless = (typeof MONEY_COOKIELESS)[number];
export const MONEY_FRAMEWORKS = ["next_app", "next_pages", "express", "hono", "fastify", "remix", "sveltekit", "nuxt", "supabase_fn", "cloudflare", "vercel_fn", "flask", "fastapi"] as const;
export type MoneyFramework = (typeof MONEY_FRAMEWORKS)[number];
export const MONEY_UNSURE = ["dynamic_routes", "unknown_framework", "matcher_not_text", "too_many_files", "unreadable", "import_too_deep", "check_failed"] as const;
export type MoneyUnsure = (typeof MONEY_UNSURE)[number];
/** Sign in services with protection of their own that Squibby cannot see: said as guidance, never a pass. */
export const MONEY_AUTH = ["clerk", "auth0", "supabase_auth", "firebase_auth", "better_auth"] as const;
export type MoneyAuth = (typeof MONEY_AUTH)[number];
export const MONEY_FORMS = ["signup", "contact", "waitlist", "comment", "other"] as const;
export type MoneyForm = (typeof MONEY_FORMS)[number];
export const MONEY_METHODS = ["GET", "POST", "PUT", "PATCH", "DELETE", "ALL"] as const;
export type MoneyMethod = (typeof MONEY_METHODS)[number];

export type MoneyFinding = {
  kind: MoneyKind; file?: string; line?: number; method?: MoneyMethod; path?: string; framework?: MoneyFramework;
  services?: MoneyService[]; trackers?: MoneyTracker[]; form?: MoneyForm;
  /** The person said this is set up outside the code (a line in What I remember they added). Never a pass. */
  told?: true;
};
export type MoneyPaid = { service: MoneyService; file: string; line?: number };
export type MoneyUnsurePart = { family: MoneyFamily; why: MoneyUnsure; count?: number; name?: string };
export type MoneySeen = { family: MoneyFamily; routes?: number; files: number; frameworks: MoneyFramework[] };
export type MoneyGuide = { auth: MoneyAuth; file: string };
export type MoneyReport = {
  findings: MoneyFinding[]; paid: MoneyPaid[]; unsure: MoneyUnsurePart[]; seen: MoneySeen[];
  /** The project has sign in accounts; emails: it collects email addresses (a form or a mailing list). */
  accounts: boolean; emails?: true;
  /** A privacy page that asks people to email to be deleted: a known way, never flagged. */
  deleteByEmail?: true;
  cookieless?: MoneyCookieless[]; guides?: MoneyGuide[];
};
/** The part as ship.gates carries it: off in Settings (money.checks), or the whole report. */
export type MoneyPart = MoneyReport | { off: true };
export const isMoneyOff = (m: MoneyPart | null | undefined): m is { off: true } => !!m && "off" in m && m.off === true;
export const MONEY_MAX_FINDINGS = 50, MONEY_MAX_PAID = 30, MONEY_MAX_UNSURE = 20, MONEY_MAX_GUIDES = 10;

/** A route path as written in a project: from /, letters, numbers and the marks routes use ([id], :id, *, $). */
export const MONEY_PATH = /^\/[A-Za-z0-9_\-./:[\]*$]{0,200}$/;
/** A framework or package name for "I could not read this framework": a plain package name, never a path or a sentence. */
export const MONEY_NAME = /^(?:@[a-z0-9][a-z0-9._-]{0,40}\/)?[a-z0-9][a-z0-9._-]{0,60}$/;

const inList = (xs: readonly string[], v: unknown): boolean => typeof v === "string" && xs.includes(v);
/** A file name the money part may carry: from the project folder, one line, at most 400 characters. */
export const moneyFileOk = (f: unknown): boolean => typeof f === "string" && f.length > 0 && f.length <= 400 && !f.startsWith("/") && !f.includes("\\") && !/[\u0000-\u001f\u007f]/.test(f) && !f.split("/").some((p) => p === ".." || p === "");
const lineOk = (v: unknown): boolean => v === undefined || (Number.isInteger(v) && (v as number) >= 1 && (v as number) <= 1_000_000);
const countOk = (v: unknown): boolean => v === undefined || (Number.isInteger(v) && (v as number) >= 0 && (v as number) <= 10_000_000);
const plain = (o: unknown): o is Record<string, unknown> => !!o && typeof o === "object" && !Array.isArray(o);
const only = (o: Record<string, unknown>, keys: readonly string[]): boolean => Object.keys(o).every((k) => keys.includes(k));
const idList = (v: unknown, ids: readonly string[], max: number, min = 0): boolean => v === undefined || (Array.isArray(v) && v.length >= min && v.length <= max && v.every((x) => inList(ids, x)) && new Set(v).size === v.length);
const WITH_FILE: ReadonlySet<string> = new Set(["paid_route_open", "heavy_route_open", "form_open", "auth_open", "tracker_no_consent"]);

const findingOk = (x: unknown): boolean => {
  if (!plain(x) || !only(x, ["kind", "file", "line", "method", "path", "framework", "services", "trackers", "form", "told"])) return false;
  if (!inList(MONEY_KINDS, x.kind)) return false;
  if (WITH_FILE.has(x.kind as string) ? !moneyFileOk(x.file) : x.file !== undefined && !moneyFileOk(x.file)) return false;
  return lineOk(x.line) && (x.method === undefined || inList(MONEY_METHODS, x.method)) && (x.path === undefined || (typeof x.path === "string" && MONEY_PATH.test(x.path)))
    && (x.framework === undefined || inList(MONEY_FRAMEWORKS, x.framework)) && idList(x.services, MONEY_SERVICES, 10, 1) && idList(x.trackers, MONEY_TRACKERS, MONEY_TRACKERS.length, 1)
    && (x.form === undefined || inList(MONEY_FORMS, x.form)) && (x.told === undefined || (x.told === true && inList(MONEY_TOLD_KINDS, x.kind)));
};
const paidOk = (x: unknown): boolean => plain(x) && only(x, ["service", "file", "line"]) && inList(MONEY_SERVICES, x.service) && moneyFileOk(x.file) && lineOk(x.line);
const unsureOk = (x: unknown): boolean => plain(x) && only(x, ["family", "why", "count", "name"]) && inList(MONEY_FAMILIES, x.family) && inList(MONEY_UNSURE, x.why) && countOk(x.count)
  && (x.name === undefined || (typeof x.name === "string" && MONEY_NAME.test(x.name)));
const seenOk = (x: unknown): boolean => plain(x) && only(x, ["family", "routes", "files", "frameworks"]) && inList(MONEY_FAMILIES, x.family) && countOk(x.routes) && x.files !== undefined && countOk(x.files) && idList(x.frameworks, MONEY_FRAMEWORKS, MONEY_FRAMEWORKS.length) && Array.isArray(x.frameworks);
const guideOk = (x: unknown): boolean => plain(x) && only(x, ["auth", "file"]) && inList(MONEY_AUTH, x.auth) && moneyFileOk(x.file);
const listOf = (v: unknown, ok: (x: unknown) => boolean, max: number): boolean => Array.isArray(v) && v.length <= max && v.every(ok);

/** The money part of ship.gates: off, or the whole part with ids, file names, lines, methods and paths only. */
export function moneyReportOk(v: unknown): boolean {
  if (!plain(v)) return false;
  if (v.off === true) return only(v, ["off"]);
  return only(v, ["findings", "paid", "unsure", "seen", "accounts", "emails", "deleteByEmail", "cookieless", "guides"]) && listOf(v.findings, findingOk, MONEY_MAX_FINDINGS) && listOf(v.paid, paidOk, MONEY_MAX_PAID)
    && listOf(v.unsure, unsureOk, MONEY_MAX_UNSURE) && listOf(v.seen, seenOk, MONEY_FAMILIES.length) && typeof v.accounts === "boolean" && (v.emails === undefined || v.emails === true)
    && (v.deleteByEmail === undefined || v.deleteByEmail === true) && idList(v.cookieless, MONEY_COOKIELESS, MONEY_COOKIELESS.length) && (v.guides === undefined || listOf(v.guides, guideOk, MONEY_MAX_GUIDES));
}

// "I set this up outside the code": one line in the project's memory (What I remember), with its source, that the person
// can read and forget. The engine reads the same lines back, only those the person pressed for (runner/src/money/told.ts),
// and marks the finding told: still shown, never a pass.
const TOLD_WHAT: Record<MoneyToldKind, string> = { paid_route_open: "Rate limit", heavy_route_open: "Rate limit", form_open: "Bot check", auth_open: "Limit on sign in tries" };
const TOLD_LINE = /^(Rate limit|Bot check|Limit on sign in tries) for (.+) is set up outside the code \(you told me\)\.$/;
/** The memory line for a told finding, or null for a file that cannot be said on one line. */
export function moneyToldLine(kind: MoneyToldKind, file: string): string | null {
  if (!inList(MONEY_TOLD_KINDS, kind) || !moneyFileOk(file) || file.length > 200) return null;
  return `${TOLD_WHAT[kind]} for ${file} is set up outside the code (you told me).`;
}
/** What told lines say: which kind of protection, for which file. Anything else is ignored. */
export function moneyToldOf(lines: readonly string[]): { what: "limit" | "bot" | "tries"; file: string }[] {
  const out: { what: "limit" | "bot" | "tries"; file: string }[] = [];
  for (const l of lines) {
    const m = TOLD_LINE.exec(l.trim());
    if (!m || !moneyFileOk(m[2])) continue;
    out.push({ what: m[1] === "Rate limit" ? "limit" : m[1] === "Bot check" ? "bot" : "tries", file: m[2] });
  }
  return out;
}
/** Does a told line cover this finding? */
export const moneyToldCovers = (told: readonly { what: string; file: string }[], kind: MoneyKind, file: string | undefined): boolean =>
  !!file && inList(MONEY_TOLD_KINDS, kind) && told.some((t) => t.file === file && t.what === (kind === "form_open" ? "bot" : kind === "auth_open" ? "tries" : "limit"));
