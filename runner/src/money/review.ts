// M117 step 7: the money rules in the review of every change. Only what the change added (a finding at the newer version that
// was not there before, matched by kind, file and route) and only Worth a look, never Fix this first: these kinds are not
// in rate.ts FOUND_STOP or look.ts STOP_KINDS. What a rule cannot tell is never raised in a review (the go live check says
// it). The privacy page and delete account rules stay in the go live check. Reading goes through the undo store's own
// snapshots (read below), never the folder.
import type { MoneyFinding, MoneyService } from "../../../protocol/index.ts";
import type { Reason } from "../review/rate.ts";
import { isEnvFile } from "../secretfiles.ts";
import { moneyCheck } from "./check.ts";
import { familyOf } from "./services.ts";
import { CODE, importsOf, LEFT_OUT, PAGE, resolveLocal, stripComments } from "./text.ts";

/** The files the money rules need beside the changed ones: package lists, middleware and hooks, host settings, server entry
 *  files and the root layouts where a consent banner usually is. Never a settings or key file. */
export const MONEY_CONTEXT = /^(?:[^/]+\/){0,2}package\.json$|^(?:[^/]+\/){1,2}(?:src\/)?(?:middleware|proxy)\.[cm]?[jt]s$|^requirements[^/]*\.txt$|^pyproject\.toml$|^(?:src\/)?(?:middleware|proxy)\.[cm]?[jt]s$|^src\/hooks\.server\.(?:ts|js)$|^server\/middleware\/[^/]+\.(?:ts|js|mjs)$|^nuxt\.config\.(?:ts|js|mjs)$|^wrangler\.(?:toml|jsonc?)$|^vercel\.json$|^supabase\/config\.toml$|^(?:src\/|server\/)?(?:server|app|index|main)\.(?:[cm]?[jt]sx?|py)$|^(?:src\/)?app\/layout\.[jt]sx?$|^(?:src\/)?pages\/_(?:app|document)\.[jt]sx?$|^app\/root\.[jt]sx?$|^src\/app\.html$|^index\.html$|^app\.vue$|^src\/routes\/\+layout\.svelte$/;
const MAX_CONTEXT = 40, MAX_FOLLOWED = 40, MAX_NEAR = 40;

export type ReadFiles = (id: string, keep: (path: string) => boolean) => Promise<Record<string, string>>;
/** The files of one saved version the money rules need for the changed files: the changed code and pages, the context list,
 *  the files beside them that mount a changed router file, and the project files all of these import, two steps. At most
 *  40 context files, 40 nearby ones and 40 followed ones. */
export async function moneyFilesAt(read: ReadFiles, id: string, changed: readonly string[]): Promise<Record<string, string>> {
  const all = new Set<string>();
  await read(id, (p) => { all.add(p); return false; });
  const want = new Set(changed.filter((f) => all.has(f) && (CODE.test(f) || PAGE.test(f)) && !isEnvFile(f) && !LEFT_OUT.test(f)));
  let ctx = 0;
  for (const p of [...all].sort()) if (MONEY_CONTEXT.test(p) && !isEnvFile(p) && !want.has(p) && ctx < MAX_CONTEXT) { want.add(p); ctx++; }
  // The files that may mount a changed router file (app.use("/api", chatRouter)): code in its own folder or the one above.
  const dirs = new Set<string>();
  for (const f of want) if (changed.includes(f) && CODE.test(f)) { const d = dirOf(f); dirs.add(d); dirs.add(dirOf(d)); }
  const near = new Set<string>();
  for (const p of [...all].sort()) if (near.size < MAX_NEAR && CODE.test(p) && !want.has(p) && !isEnvFile(p) && !LEFT_OUT.test(p) && dirs.has(dirOf(p))) near.add(p);
  const out = await read(id, (p) => want.has(p) || near.has(p));
  const has = (x: string) => all.has(x);
  for (const p of near) {
    const t = out[p] === undefined ? "" : stripComments(p, out[p]);
    const mounts = /\.\s*(?:use|route|register)\s*\(/.test(t) && importsOf(p, t).local.some((l) => { const r = resolveLocal(p, l.spec, has); return r !== null && changed.includes(r); });
    if (!mounts) delete out[p];
  }
  let followed = 0;
  // Followed from the changed files first, then from the context and mounting files (a middleware's limiter helper).
  let front = [...Object.keys(out).filter((f) => changed.includes(f)), ...Object.keys(out).filter((f) => !changed.includes(f))];
  for (let depth = 0; depth < 2 && front.length && followed < MAX_FOLLOWED; depth++) {
    const more = new Set<string>();
    for (const f of front) {
      const t = out[f];
      if (t === undefined || !CODE.test(f)) continue;
      for (const l of importsOf(f, stripComments(f, t)).local) {
        const r = resolveLocal(f, l.spec, has);
        if (r && out[r] === undefined && !isEnvFile(r) && followed + more.size < MAX_FOLLOWED) more.add(r);
      }
    }
    if (!more.size) break;
    followed += more.size;
    Object.assign(out, await read(id, (p) => more.has(p)));
    front = [...more];
  }
  return out;
}
const dirOf = (p: string) => (p.includes("/") ? p.slice(0, p.lastIndexOf("/")) : "");

const SERVICE: Partial<Record<MoneyService, string>> = {
  openai: "OpenAI", anthropic: "Anthropic", google_ai: "Google's AI", replicate: "Replicate", groq: "Groq", mistral: "Mistral", cohere: "Cohere", together: "Together AI", fal: "fal",
  huggingface: "Hugging Face", deepgram: "Deepgram", assemblyai: "AssemblyAI", elevenlabs: "ElevenLabs", openrouter: "OpenRouter", other_ai: "an AI model", resend: "Resend", sendgrid: "SendGrid",
  postmark: "Postmark", mailgun: "Mailgun", ses: "Amazon SES", nodemailer: "email", twilio: "Twilio", sns: "Amazon SNS", vonage: "Vonage", plivo: "Plivo",
};
const TRACKER: Record<string, string> = { google_analytics: "Google Analytics", google_ads: "Google Ads", meta_pixel: "Meta Pixel", posthog: "PostHog", mixpanel: "Mixpanel", hotjar: "Hotjar", segment: "Segment", amplitude: "Amplitude", heap: "Heap", clarity: "Microsoft Clarity", linkedin: "LinkedIn Insight", tiktok: "TikTok Pixel", chat_widget: "a chat widget" };
const FORM: Record<string, string> = { signup: "sign up", contact: "contact", waitlist: "waitlist", comment: "comment", other: "email" };
const list = (xs: string[]) => (xs.length <= 1 ? xs.join("") : `${xs.slice(0, -1).join(", ")} and ${xs.at(-1)}`);
const at = (f: MoneyFinding) => `${f.file}${f.line ? ` at line ${f.line}` : ""}`;
const route = (f: MoneyFinding) => (f.path ? ` (${f.method && f.method !== "ALL" ? `${f.method} ` : ""}${f.path})` : "");

/** The finding's own place, for "was it there before": the kind, the file and the route (or the form, or the trackers). */
export const anchorOf = (f: MoneyFinding): string => (f.kind === "tracker_no_consent" ? [...(f.trackers ?? [])].sort().join(",") : f.kind === "form_open" ? `${f.form ?? ""}` : `${f.method ?? ""}|${f.path ?? ""}`);
const REVIEW_KIND = { paid_route_open: "paid_route_open", form_open: "form_open", auth_open: "form_open", tracker_no_consent: "tracker_no_consent" } as const;
type RaisedKind = keyof typeof REVIEW_KIND;

function sayOf(f: MoneyFinding): string {
  if (f.kind === "paid_route_open") {
    const s = (f.services ?? []).map((x) => SERVICE[x] ?? x);
    const ai = (f.services ?? []).some((x) => familyOf(x) === "ai");
    return `${at(f)}${route(f)} ${ai ? `calls ${list(s)}` : `sends messages through ${list(s)}`}, and nothing limits how often it can be called. If you set a limit in your host's dashboard, this is already covered.`;
  }
  if (f.kind === "auth_open") return `The sign in at ${at(f)}${route(f)} has no limit on tries and no bot check.`;
  if (f.kind === "form_open") return `The ${FORM[f.form ?? "other"]} form in ${at(f)} has no bot check and no limit.`;
  return `${at(f)} loads ${list((f.trackers ?? []).map((t) => TRACKER[t] ?? t))} with no cookie consent found. This is the usual baseline; it is not legal advice.`;
}

export type MoneyItem = { reason: Reason; kind: MoneyFinding["kind"]; file: string; anchor: string };
/** What the change added, as review reasons (Worth a look), with how each is checked again, and the one spending note when
 *  the change starts using a paid AI service the project did not use before. */
export function moneyReasons(o: { changed: readonly string[]; before: Readonly<Record<string, string>>; after: Readonly<Record<string, string>>; told?: readonly string[] }): { items: MoneyItem[]; notes: string[] } {
  const a = moneyCheck(o.after, { told: o.told }), b = moneyCheck(o.before, { told: o.told });
  const changed = new Set(o.changed);
  const key = (f: MoneyFinding) => `${f.kind}|${f.file}|${anchorOf(f)}`;
  const was = new Set(b.findings.map(key));
  const items: MoneyItem[] = [];
  for (const f of a.findings) {
    if (!(f.kind in REVIEW_KIND) || !f.file || !changed.has(f.file) || f.told || was.has(key(f))) continue;
    // A tracker that was already there in that file, now joined by another: only the new one is news.
    if (f.kind === "tracker_no_consent") {
      const old = b.findings.find((x) => x.kind === f.kind && x.file === f.file);
      const added = (f.trackers ?? []).filter((t) => !(old?.trackers ?? []).includes(t));
      if (!added.length) continue;
      f.trackers = added;
    }
    const kind = REVIEW_KIND[f.kind as RaisedKind];
    items.push({ reason: { kind, file: f.file, ...(f.line ? { line: f.line } : {}), say: sayOf(f) }, kind: f.kind, file: f.file, anchor: anchorOf(f) });
    if (items.length >= 5) break;
  }
  const notes: string[] = [];
  for (const p of a.paid) {
    if (familyOf(p.service) !== "ai" || !changed.has(p.file) || b.paid.some((x) => x.service === p.service)) continue;
    notes.push(`This change starts using ${SERVICE[p.service] ?? "a paid AI service"}. Set a monthly budget and an alert in its dashboard.`);
    if (notes.length >= 2) break;
  }
  return { items, notes };
}

/** Does a money finding still hold in these files (a recheck after a newer change or a fix)? */
export function moneyHolds(t: { kind: MoneyFinding["kind"]; file: string; anchor: string }, files: Readonly<Record<string, string>>): boolean {
  if (files[t.file] === undefined) return false;
  return moneyCheck(files).findings.some((f) => f.kind === t.kind && f.file === t.file && (t.kind === "tracker_no_consent" ? (f.trackers ?? []).some((x) => t.anchor.split(",").includes(x)) : anchorOf(f) === t.anchor));
}
