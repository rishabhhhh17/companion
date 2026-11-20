// M117: the whole money and fines check, as static rules in code. No model decides anything here, no file content leaves the
// Mac, and nothing here runs the person's code or opens a network connection. moneyCheck is pure (files already in memory);
// moneyOfProject reads the project folder the same safe way Ship's key scan does (never through a link, never a .env file,
// never a built or installed folder) and hands the text to moneyCheck. Honesty first: when a rule cannot tell, the part says
// it could not check, with why; "none seen" always comes with how much was read, and is never said as safe.
import { existsSync, lstatSync, readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import {
  MONEY_FAMILIES, moneyFileOk, MONEY_MAX_FINDINGS, MONEY_MAX_GUIDES, MONEY_MAX_PAID, MONEY_MAX_UNSURE, MONEY_NAME, MONEY_PATH, moneyToldCovers, moneyToldOf,
  type MoneyFamily, type MoneyFinding, type MoneyFramework, type MoneyGuide, type MoneyReport, type MoneyService, type MoneyUnsurePart,
} from "../../../protocol/index.ts";
import { isEnvFile } from "../secretfiles.ts";
import { AUTH_OWN_PROTECTION, authRoutesIn, authServicesIn, botChecked, formsIn, passwordFormIn, supabaseCaptchaOn } from "./bots.ts";
import { accountsOf, codedConsentIn, consentOf, deleteAccountOf, deleteByEmailOf, mailingListOf, privacyPageOf, trackersOf } from "./fines.ts";
import { limitOf, projectLimits } from "./limits.ts";
import { routesIn, type Code, type Route } from "./routes.ts";
import { costOf, cronPaths, familyOf, onlyCallerIsProvider, paidServices } from "./services.ts";
import { CODE, LEFT_OUT, reachable, stripComments } from "./text.ts";

export type MoneyOptions = {
  /** The project's memory lines the person pressed "I set this up outside the code" for (told.ts). */
  told?: readonly string[];
  /** Files the reader left out because there were too many, and files it could not read. */
  leftOver?: number; unreadable?: number;
};

const byPlace = (a: { file?: string; line?: number }, b: { file?: string; line?: number }) => (a.file ?? "").localeCompare(b.file ?? "") || (a.line ?? 0) - (b.line ?? 0);

/** The whole check over files already in memory (path from the project folder -> text). */
export function moneyCheck(files: Code, o: MoneyOptions = {}): MoneyReport {
  const raw: Record<string, string> = {};
  // A file whose name the part cannot carry (too long, a control character) is not read: it is counted as could not read,
  // so one odd name never throws away the whole part.
  const odd = new Set<string>();
  for (const [f, t] of Object.entries(files)) { if (isEnvFile(f)) continue; if (!moneyFileOk(f)) { odd.add(f); continue; } raw[f] = t; }
  const code: Record<string, string> = {};
  for (const [f, t] of Object.entries(raw)) code[f] = stripComments(f, t);
  const get = (f: string) => code[f];
  const told = moneyToldOf(o.told ?? []);
  const findings: MoneyFinding[] = [];
  const unsure: MoneyUnsurePart[] = [];
  const guides: MoneyGuide[] = [];

  // 1 to 3: routes that cost money, and their limits.
  const r = routesIn(code, raw);
  for (const u of r.unsure) unsure.push({ family: "rate", why: u.why, ...(u.count ? { count: u.count } : {}), ...(u.name && MONEY_NAME.test(u.name) ? { name: u.name } : {}) });
  const crons = cronPaths(raw);
  const pl = projectLimits(code);
  let unsureRoutes = 0;
  const seenRoute = new Set<string>();
  for (const route of r.routes) {
    if (route.method === "GET" && route.kind === "route" && route.framework === "remix") continue;   // a loader reads data for a page
    const own = code[route.file] ?? "";
    if (onlyCallerIsProvider(own) || (route.path && crons.has(route.path))) continue;
    const services = costOf(route.file, get).filter((s) => familyOf(s) !== "host");
    if (!services.length) continue;
    const limit = limitOf(route, get, pl);
    if (limit === "limited") continue;
    if (limit === "unsure") { unsureRoutes++; continue; }
    const paid = services.filter((s) => familyOf(s) !== "heavy");
    const kind = paid.length ? "paid_route_open" : "heavy_route_open";
    const k = `${kind}|${route.file}|${route.method ?? ""}|${route.path ?? ""}`;
    if (seenRoute.has(k)) continue;
    seenRoute.add(k);
    findings.push(finding(kind, route, paid.length ? paid : services, told));
  }
  if (unsureRoutes) unsure.push({ family: "rate", why: "matcher_not_text", count: unsureRoutes });

  // 4: abuse protection. Forms, then sign in routes.
  const auths = authServicesIn(code);
  const captcha = supabaseCaptchaOn(raw);
  const addGuide = (g: MoneyGuide) => { if (!guides.some((x) => x.auth === g.auth)) guides.push(g); };
  for (const a of auths) if (AUTH_OWN_PROTECTION.includes(a.auth) && !(a.auth === "supabase_auth" && captcha)) addGuide(a);
  const formFiles = new Set<string>();
  for (const f of formsIn(code)) {
    formFiles.add(f.file);
    const reach = reachable(f.file, get).map((x) => code[x] ?? "").join("\n");
    // A form handed to a sign in service is that service's job (guidance above), never a finding.
    if (authServicesIn({ [f.file]: reach }).some((a) => AUTH_OWN_PROTECTION.includes(a.auth) || a.auth === "better_auth")) continue;
    if (botChecked(f.file, get)) continue;
    const target = f.posts ? r.routes.find((x) => x.path === f.posts && x.method !== "GET") ?? r.routes.find((x) => x.path === f.posts) : undefined;
    if (target && botChecked(target.file, get)) continue;
    // A limit on its route stops a flood from a contact or waitlist form (not every bot).
    if (target && (f.form === "contact" || f.form === "waitlist" || f.form === "comment") && limitOf(target, get, pl) === "limited") continue;
    const services = target ? costOf(target.file, get).filter((s) => familyOf(s) === "email" || familyOf(s) === "sms") : [];
    const x: MoneyFinding = { kind: "form_open", file: f.file, line: f.line, form: f.form, ...(f.posts && MONEY_PATH.test(f.posts) ? { path: f.posts } : {}), ...(services.length ? { services: services.slice(0, 10) } : {}) };
    if (moneyToldCovers(told, "form_open", f.file)) x.told = true;
    findings.push(x);
  }
  const authRoutes = authRoutesIn(r.routes, get);
  for (const a of authRoutes) {
    if (botChecked(a.file, get) || limitOf(a, get, pl) === "limited") continue;
    if (findings.some((x) => x.kind === "auth_open" && x.file === a.file)) continue;
    findings.push(finding("auth_open", a, [], told));
  }


  // 6: the fines basics.
  // An app with its own sign in (a password route, or a page form with a password field) has accounts too.
  const accounts = accountsOf(code, raw) || authRoutes.length > 0 || passwordFormIn(code);
  const forms = formsIn(code);
  const emails = forms.some((f) => f.form === "waitlist" || f.form === "contact" || f.form === "signup") || mailingListOf(code);
  if ((accounts || emails) && !privacyPageOf(code)) findings.push({ kind: "no_privacy_page" });
  const t = trackersOf(code);
  if (t.trackers.length && !consentOf(code, raw)) {
    // One line per file a tracker loads from, naming each tracker there. A consent check written in code counts only in the
    // tracker's own file.
    const byFile = new Map<string, { line: number; trackers: MoneyFinding["trackers"] }>();
    for (const x of t.trackers.filter((y) => !codedConsentIn(code[y.file] ?? ""))) { const e = byFile.get(x.file); if (e) { e.trackers!.push(x.tracker); e.line = Math.min(e.line, x.line); } else byFile.set(x.file, { line: x.line, trackers: [x.tracker] }); }
    for (const [file, e] of byFile) findings.push({ kind: "tracker_no_consent", file, line: e.line, trackers: e.trackers });
  }
  const deleteByEmail = accounts && deleteByEmailOf(code);
  if (accounts && !deleteByEmail && !deleteAccountOf(code)) findings.push({ kind: "no_delete_account" });

  // And nothing that names such a file reaches the part.
  const fits = (f?: string) => { if (f === undefined || moneyFileOk(f)) return true; odd.add(f); return false; };
  const kept = findings.filter((x) => fits(x.file));
  const paidKept = paidServices(code, raw).filter((x) => fits(x.file)).sort((a, b) => byPlace(a, b)).slice(0, MONEY_MAX_PAID);
  const guidesKept = guides.filter((g) => fits(g.file));
  const unreadable = (o.unreadable ?? 0) + odd.size;
  if (o.leftOver) for (const fam of MONEY_FAMILIES) unsure.push({ family: fam, why: "too_many_files", count: o.leftOver });
  if (unreadable) unsure.push({ family: "rate", why: "unreadable", count: unreadable });

  // What was read, for "none seen in what I could read".
  const readCode = Object.keys(code).filter((f) => CODE.test(f) && !LEFT_OUT.test(f)).length;
  const routeFiles = new Set(r.routes.map((x) => x.file)).size;
  const seen = [
    { family: "rate" as const, routes: r.routes.length, files: routeFiles, frameworks: r.frameworks },
    { family: "abuse" as const, routes: authRoutes.length, files: formFiles.size, frameworks: r.frameworks },
    { family: "spend" as const, files: readCode, frameworks: [] as MoneyFramework[] },
    { family: "fines" as const, files: readCode, frameworks: [] as MoneyFramework[] },
  ];
  const ordered = kept.sort((a, b) => order(a) - order(b) || byPlace(a, b)).slice(0, MONEY_MAX_FINDINGS);
  return {
    findings: ordered, paid: paidKept, unsure: unsure.slice(0, MONEY_MAX_UNSURE), seen, accounts, ...(emails ? { emails: true as const } : {}),
    ...(deleteByEmail ? { deleteByEmail: true as const } : {}), ...(t.cookieless.length ? { cookieless: t.cookieless } : {}), ...(guidesKept.length ? { guides: guidesKept.slice(0, MONEY_MAX_GUIDES) } : {}),
  };
}
const ORDER = ["paid_route_open", "form_open", "auth_open", "heavy_route_open", "tracker_no_consent", "no_privacy_page", "no_delete_account"];
const order = (f: MoneyFinding) => ORDER.indexOf(f.kind);
function finding(kind: MoneyFinding["kind"], r: Route, services: MoneyService[], told: ReturnType<typeof moneyToldOf>): MoneyFinding {
  const f: MoneyFinding = { kind, file: r.file, line: r.line, framework: r.framework, ...(r.method ? { method: r.method } : {}), ...(r.path && MONEY_PATH.test(r.path) ? { path: r.path } : {}), ...(services.length ? { services: [...new Set(services)].slice(0, 10) } : {}) };
  if (moneyToldCovers(told, kind, r.file)) f.told = true;
  return f;
}

/** The part said as could not check for every family, when the check itself failed: never an empty part. */
export const moneyFailed = (): MoneyReport => ({ findings: [], paid: [], unsure: MONEY_FAMILIES.map((family: MoneyFamily) => ({ family, why: "check_failed" as const })), seen: [], accounts: false });

// ---------- reading the project ----------

/** The most files the check reads; past that, the rest is could not check, with its count. */
export const MONEY_MAX_FILES = 3000;
const MAX_BYTES = 1_000_000;
const SKIP = new Set(["node_modules", ".git", ".venv", "venv", "site-packages", "__pycache__", "target", "vendor", "Pods", ".gradle", ".vercel", ".netlify", ".claude", ".companion", ".turbo", ".cache", "coverage", ".next", ".nuxt", ".output", ".svelte-kit", ".wrangler", "dist", "build", "out", "_site"]);
const READ = /\.(?:[cm]?[jt]sx?|vue|svelte|astro|py|html?|mdx?)$|(^|\/)(?:package\.json|vercel\.json|wrangler\.toml|wrangler\.jsonc?|requirements[^/]*\.txt|pyproject\.toml|Gemfile|composer\.json|go\.mod)$|(^|\/)supabase\/config\.toml$/;

/** The files the check reads, by path from the project folder: code, pages and the package and host lists. Never a .env or
 *  key file, never a link, never a built or installed folder, tests, examples or scripts. */
export function readForMoney(dir: string): { files: Record<string, string>; leftOver: number; unreadable: number } {
  const files: Record<string, string> = {};
  let count = 0, leftOver = 0, unreadable = 0;
  if (!existsSync(dir)) return { files, leftOver, unreadable };
  const walk = (d: string, depth: number) => {
    if (depth > 20) return;
    let names: string[] = [];
    try { names = readdirSync(d).sort(); } catch { unreadable++; return; }
    for (const n of names) {
      if (SKIP.has(n)) continue;
      const full = join(d, n), rel = relative(dir, full).split("\\").join("/");
      let st; try { st = lstatSync(full); } catch { continue; }
      if (st.isSymbolicLink()) continue;                         // never follow a link out of the project
      if (st.isDirectory()) { if (!LEFT_OUT.test(rel + "/")) walk(full, depth + 1); continue; }
      if (!st.isFile() || isEnvFile(rel) || !READ.test(rel) || LEFT_OUT.test(rel)) continue;
      if (count >= MONEY_MAX_FILES) { leftOver++; continue; }
      if (st.size > MAX_BYTES) { unreadable++; continue; }
      let buf: Buffer; try { buf = readFileSync(full); } catch { unreadable++; continue; }
      if (buf.subarray(0, 4096).includes(0)) continue;
      files[rel] = buf.toString("utf8");
      count++;
    }
  };
  walk(dir, 0);
  return { files, leftOver, unreadable };
}

/** The check of a project folder, as the go live check runs it. Never throws: a failure is the whole part as could not check. */
export function moneyOfProject(dir: string, o: { told?: readonly string[]; read?: typeof readForMoney } = {}): MoneyReport {
  try {
    const r = (o.read ?? readForMoney)(dir);
    return moneyCheck(r.files, { told: o.told, leftOver: r.leftOver, unreadable: r.unreadable });
  } catch { return moneyFailed(); }
}
