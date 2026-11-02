// M52, the review of every change (F30): the rules for what a change touches and how it is rated, as plain code with no
// model and no file access. Safe, worth a look, or stop. A model may only add words, and at most raise safe to worth a
// look; it can never lower a rating these rules gave. Every sentence here is about a file and a line, never a value: no
// secret, and no line of the person's code, is ever put into a reason.
import { isEnvFile } from "../secretfiles.ts";
import { clip, hasKeyShape, redactOutput } from "../redact.ts";
import { REVIEW_RATINGS, REVIEW_REASONS, REVIEW_TOUCHES, type ReviewChecks, type ReviewFile, type ReviewRating, type ReviewReason, type ReviewReasonKind, type ReviewTouch } from "../../../protocol/index.ts";

export type FileChange = ReviewFile;
/** The lines a change took away and added in one file (from teach.ts hunks), still as written: in memory only. */
export type FileLines = { file: string; added: string[]; removed: string[] };
/** One added line, with its place, for the secret check. Never sent or shown: only its file and line number leave here. */
export type AddedLine = { file: string; line: number; text: string };

// The lists are the protocol's own (protocol/index.ts), so the engine and the pages can never disagree on a word.
export const TOUCHES = REVIEW_TOUCHES;
export type Touch = ReviewTouch;
export const RATINGS = REVIEW_RATINGS;
export type Rating = ReviewRating;
export const REASON_KINDS = REVIEW_REASONS;
export type ReasonKind = ReviewReasonKind;
export type Reason = ReviewReason;
/** What the checks said about the batch: passed, failed, could not tell (unknown), or not asked for (not_run). */
export type Checks = ReviewChecks;
export type StillUsed = { file: string; by: string; line: number };

// ---------- what a change touches ----------

const SIGN_IN_PATH = /(^|\/)(auth|login|log-in|logout|signin|sign-in|signup|sign-up|register|session|sessions|oauth|passport|nextauth|clerk|middleware\.[cm]?[jt]sx?$)|auth\.[cm]?[jt]sx?$|(^|[/_.-])(login|signin|signup)/i;
const SIGN_IN_LINE = /\b(signIn|signOut|signUp|getSession|getServerSession|useSession|currentUser|auth\(\)|onAuthStateChanged|signInWith\w*|createUserWith\w*|verifyIdToken|jwt\.(sign|verify)|bcrypt|passport\.|clerk|NextAuth|supabase\.auth|firebase\/auth|withAuth|requireAuth|isAuthenticated|password)\b/;
const PAY_PATH = /(stripe|payment|payments|checkout|billing|invoice|subscription|subscriptions|paddle|lemonsqueezy|razorpay|paypal|dodo|pricing)/i;
const PAY_LINE = /\b(stripe|Stripe|paymentIntent|PaymentIntent|checkout\.sessions|createCheckout\w*|billing|subscription|invoice|paypal|razorpay|lemonsqueezy|paddle|amount_total|unit_amount|price_id|priceId)\b/;
const DATA_PATH = /(^|\/)(db|database|prisma|schema|schemas|migrations?|models?|supabase|firebase|firestore|drizzle|sql|seeds?)(\/|\.|$)|\.(sql|prisma)$|firestore\.rules$|storage\.rules$/i;
const DATA_LINE = /(\bsupabase\.(from|rpc|storage)\b|\bprisma\.\w+\.(create|update|delete|upsert|findMany)|\b(CREATE|ALTER|DROP)\s+TABLE\b|\bPOLICY\b|row level security|\bdb\.(insert|update|delete|query|collection|select)\b|\bcollection\(|\.insert\(|\.delete\(\)|\bfirestore\b|\bmongoose\b|\bknex\b)/i;
const SETTINGS_PATH = /(^|\/)(next\.config\.[cm]?[jt]s|vite\.config\.[cm]?[jt]s|nuxt\.config\.[cm]?[jt]s|svelte\.config\.[cm]?js|astro\.config\.[cm]?[jt]s|webpack\.config\.[cm]?js|tsconfig(\.[a-z]+)?\.json|jsconfig\.json|vercel\.json|netlify\.toml|firebase\.json|\.firebaserc|wrangler\.toml|fly\.toml|render\.yaml|Procfile|Dockerfile|docker-compose\.ya?ml|\.eslintrc(\.[a-z]+)?|eslint\.config\.[cm]?js|\.prettierrc(\.[a-z]+)?|babel\.config\.[cm]?js|\.babelrc|\.npmrc|\.nvmrc|\.gitignore|\.github\/workflows\/[^/]+)$/i;
const DEP_PATH = /(^|\/)(package-lock\.json|npm-shrinkwrap\.json|yarn\.lock|pnpm-lock\.yaml|bun\.lockb?|requirements(-[a-z]+)?\.txt|Pipfile(\.lock)?|poetry\.lock|pyproject\.toml|Cargo\.toml|Cargo\.lock|go\.mod|go\.sum|Gemfile(\.lock)?|composer\.(json|lock))$/i;
// A line of a package.json dependency list: "name": "version". A script line ("dev": "next dev") is not one.
const DEP_LINE = /^\s*"(@[a-z0-9._-]+\/)?[a-z0-9._-]+"\s*:\s*"(\^|~|>=?|<=?|=)?\s*(\d[^"\s]*|\*|latest|next|canary|beta|(workspace|file|link|npm|github|https?):[^"\s]*|git\+[^"\s]*)"/i;
const LOOK_FILE = /\.(css|scss|sass|less|styl|pcss|png|jpe?g|gif|webp|avif|svg|ico|bmp|woff2?|ttf|otf|eot)$|(^|\/)tailwind\.config\.[cm]?[jt]s$|(^|\/)postcss\.config\.[cm]?js$/i;

/** What one batch touches, in the order of TOUCHES, each at most once. secretFiles: settings or key files that changed
 *  (names only; their contents are never read). The look only is said only when nothing else is touched and every file
 *  is a style, a picture or a font. */
export function touchesOf(changes: FileChange[], lines: FileLines[], secretFiles: string[] = []): Touch[] {
  const got = new Set<Touch>();
  const linesOf = new Map(lines.map((l) => [l.file, [...l.added, ...l.removed]]));
  for (const c of changes) {
    const f = c.file, text = linesOf.get(f) ?? [];
    if (isEnvFile(f)) { got.add("secrets"); continue; }
    if (SIGN_IN_PATH.test(f) || text.some((l) => SIGN_IN_LINE.test(l))) got.add("sign_in");
    if (PAY_PATH.test(f) || text.some((l) => PAY_LINE.test(l))) got.add("payments");
    if (DATA_PATH.test(f) || text.some((l) => DATA_LINE.test(l))) got.add("data");
    if (DEP_PATH.test(f)) got.add("dependencies");
    if (/(^|\/)package\.json$/i.test(f)) {
      if (text.some((l) => DEP_LINE.test(l))) got.add("dependencies");
      if (text.some((l) => !DEP_LINE.test(l) && /\S/.test(l))) got.add("settings");
      if (!text.length) got.add("settings");
    }
    if (SETTINGS_PATH.test(f)) got.add("settings");
  }
  if (secretFiles.length) got.add("secrets");
  if (!got.size && changes.length > 0 && changes.every((c) => LOOK_FILE.test(c.file))) got.add("look_only");
  return TOUCHES.filter((t) => got.has(t));
}

// ---------- a key written into code ----------

const NAMED_LITERAL = /(?:^|[^A-Za-z0-9])[A-Za-z0-9_$.]*(?:password|passwd|pwd|secret|token|api[_-]?key|apikey|access[_-]?key|private[_-]?key|service[_-]?role|client[_-]?secret|auth[_-]?key)[A-Za-z0-9_$]*["']?\s*[:=]\s*(["'`])([^"'`\s]{8,})\1/i;
const PLACEHOLDER = /^(x+|\*+|\.+|_+|-+|0+|your[-_ ].*|<.*>|\[.*\]|\{.*\}|changeme|change[-_]me|example.*|sample.*|dummy.*|placeholder.*|replace[-_]?me.*|todo.*|test(ing)?|password|secret|token|undefined|null)$/i;

/** The added lines that write a key or secret into code: a key shaped value anywhere (redact.ts patterns), or a secret's name
 *  given a quoted value that is not a placeholder. Settings and key files are left out: that is where a key belongs. Only
 *  the file and line come back. */
export function secretsInCode(added: AddedLine[]): { file: string; line: number }[] {
  const out: { file: string; line: number }[] = [];
  for (const a of added) {
    if (isEnvFile(a.file)) continue;
    const m = NAMED_LITERAL.exec(a.text);
    const named = !!m && !m[2].includes("${") && !PLACEHOLDER.test(m[2]);
    if (hasKeyShape(a.text) || named) out.push({ file: a.file, line: a.line });
  }
  return out;
}

// ---------- a removed file that is still used ----------

const CODE_ENDINGS = ["", ".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs", ".mts", ".cts", ".vue", ".svelte", ".astro", ".json", ".css", ".scss", ".sass", ".less"];
const JS_SPEC = /(?:\bfrom\s*|\bimport\s*\(?\s*|\brequire\s*\(\s*|\bimport\s+)(["'`])([^"'`\n]+)\1/g;
const CSS_SPEC = /@(?:import|use|forward)\s+(?:url\()?\s*(["'])([^"'\n]+)\1/g;
const PY_FROM = /^\s*from\s+(\.*[A-Za-z_][\w.]*|\.+)\s+import\b/;
const PY_IMPORT = /^\s*import\s+([A-Za-z_][\w.]*)/;

const dirOf = (p: string) => (p.includes("/") ? p.slice(0, p.lastIndexOf("/")) : "");
function join(dir: string, rel: string): string | null {
  const parts = (dir ? dir.split("/") : []);
  for (const seg of rel.split("/")) {
    if (seg === "" || seg === ".") continue;
    if (seg === "..") { if (!parts.length) return null; parts.pop(); continue; }
    parts.push(seg);
  }
  return parts.join("/");
}
/** The project paths a JavaScript or style import may mean: its own path, with each ending, or its folder's index file. */
function candidates(path: string): string[] {
  const out: string[] = [];
  for (const e of CODE_ENDINGS) out.push(path + e);
  for (const e of CODE_ENDINGS.slice(1)) out.push(`${path}/index${e}`);
  // A style import may leave out the underscore of a partial (Sass).
  const slash = path.lastIndexOf("/");
  out.push(`${path.slice(0, slash + 1)}_${path.slice(slash + 1)}.scss`);
  return out;
}
function jsTargets(importer: string, spec: string): string[] {
  const s = spec.split("?")[0].split("#")[0];
  if (s.startsWith("./") || s.startsWith("../")) { const p = join(dirOf(importer), s); return p ? candidates(p) : []; }
  if (s.startsWith("@/")) return [...candidates(`src/${s.slice(2)}`), ...candidates(s.slice(2))];
  if (s.startsWith("~/")) return [...candidates(`src/${s.slice(2)}`), ...candidates(s.slice(2))];
  if (s.startsWith("/")) return candidates(s.slice(1));
  return [];   // a package
}
function pyTargets(importer: string, mod: string): string[] {
  const dots = /^\.*/.exec(mod)![0].length;
  const rest = mod.slice(dots).split(".").filter(Boolean).join("/");
  let base: string | null;
  if (dots > 0) { base = dirOf(importer); for (let i = 1; i < dots && base !== null; i++) base = base ? dirOf(base) : null; if (base === null) return []; }
  else base = "";
  const path = [base, rest].filter(Boolean).join("/");
  return path ? [`${path}.py`, `${path}/__init__.py`] : [];
}

/** The files that still import a file the batch removed: their path and the line that imports it, sorted. files: the
 *  project's code as it is now (no settings or key files). A removed file importing another removed file does not count. */
export function importersOf(deleted: string[], files: Record<string, string>): StillUsed[] {
  if (!deleted.length) return [];
  const gone = new Set(deleted);
  const out: StillUsed[] = [];
  const seen = new Set<string>();
  const add = (file: string, by: string, line: number) => { const k = `${file}\u0000${by}`; if (!seen.has(k)) { seen.add(k); out.push({ file, by, line }); } };
  for (const [by, text] of Object.entries(files)) {
    if (gone.has(by)) continue;
    const py = by.endsWith(".py"), css = /\.(css|scss|sass|less)$/i.test(by);
    text.split("\n").forEach((row, i) => {
      const hits: string[] = [];
      if (py) { const m = PY_FROM.exec(row) ?? PY_IMPORT.exec(row); if (m) hits.push(...pyTargets(by, m[1])); }
      else {
        for (const m of row.matchAll(css ? CSS_SPEC : JS_SPEC)) hits.push(...jsTargets(by, m[2]));
      }
      for (const h of hits) if (gone.has(h)) add(h, by, i + 1);
    });
  }
  return out.sort((a, b) => a.file.localeCompare(b.file) || a.by.localeCompare(b.by));
}

// ---------- the rating ----------

export type RateInput = {
  changes: FileChange[]; touches: Touch[]; secrets: { file: string; line: number }[]; stillUsed: StillUsed[]; secretFiles: string[];
  checks: Checks; checksNote?: string; count: number; capped: boolean;
  /** The model's own worry about the change (words only), which may raise safe to worth a look. */
  concern?: boolean; concernSay?: string;
};

const TOUCH_WORDS: Record<Touch, string> = { sign_in: "sign in", payments: "payments", data: "your data", settings: "settings", secrets: "secrets and keys", dependencies: "the packages it uses", look_only: "the look only" };
/** The plain words for a touch, for sentences the engine writes (the pages have their own, in strings.ts). */
export const touchWords = (t: Touch): string => TOUCH_WORDS[t];
export const listWords = (xs: string[]): string => (xs.length <= 1 ? xs.join("") : `${xs.slice(0, -1).join(", ")} and ${xs.at(-1)}`);
const RISKY: readonly Touch[] = ["sign_in", "payments", "data", "settings", "dependencies"];
/** How many files one batch may have before it is "too many to look at one by one" (the cap on a batch). */
export const MAX_BATCH_FILES = 200;
const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/** The rating and its reasons, the most serious first. Stop: a key in the code, a removed file still used, checks that fail
 *  (and payments or sign in with failing checks). Worth a look: a risky area, a settings or key file, removed files, a batch
 *  too big to read, or the model's worry. Otherwise safe. */
export function rate(i: RateInput): { rating: Rating; reasons: Reason[] } {
  const stop: Reason[] = [], look: Reason[] = [];
  for (const s of i.secrets.slice(0, 5)) stop.push({ kind: "secret_in_code", file: s.file, line: s.line, say: `A key or password is written into ${s.file} at line ${s.line}. It belongs in a settings file such as .env, not in the code.` });
  // The place named is the line that still uses the removed file, in the file that is still there: the removed one has no
  // lines any more.
  for (const u of i.stillUsed.slice(0, 5)) stop.push({ kind: "removed_still_used", file: u.by, line: u.line, say: `${u.file} was removed, but ${u.by} still uses it at line ${u.line}, so the project may not start.` });
  if (i.checks === "failed") {
    const note = i.checksNote ? clip(redactOutput(i.checksNote).replace(/\s+/g, " ").trim(), 160) : "";
    stop.push({ kind: "checks_failed", say: note ? `The project's own checks did not pass. ${note}` : "The project's own checks did not pass." });
    const risky = i.touches.filter((t) => t === "payments" || t === "sign_in");
    if (risky.length) stop.push({ kind: "risky_with_failing_checks", say: `This change touches ${listWords(risky.map(touchWords))}, and the checks did not pass.` });
  }
  if (i.secretFiles.length) look.push({ kind: "secret_file_changed", say: `A settings or key file changed (${listWords(i.secretFiles.slice(0, 3))}). It was not read and nothing in it was sent anywhere.` });
  const risky = i.touches.filter((t) => RISKY.includes(t));
  if (risky.length) look.push({ kind: "touches_risky", say: `It touches ${listWords(risky.map(touchWords))}. Worth a careful look.` });
  const removed = i.changes.filter((c) => c.kind === "deleted" && !i.stillUsed.some((u) => u.file === c.file)).length;
  if (removed) look.push({ kind: "files_removed", say: `${plural(removed, "file was", "files were")} removed.` });
  if (i.capped || i.count > MAX_BATCH_FILES) look.push({ kind: "too_many", say: `${plural(i.count, "file", "files")} changed at once, more than can be looked at one by one.` });
  if (i.concern) look.push({ kind: "model_concern", say: i.concernSay ? clip(i.concernSay, 200) : "Something in the change may not do what was meant." });
  const rating: Rating = stop.length ? "stop" : look.length ? "worth_a_look" : "safe";
  return { rating, reasons: [...stop, ...look] };
}

/** T10: the cheap lane writes the words, the stronger model only for a stop or a change to sign in or payments. */
export const needsStrongModel = (rating: Rating, touches: Touch[]): boolean => rating === "stop" || touches.includes("sign_in") || touches.includes("payments");
