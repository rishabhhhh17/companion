// M57 (docs/milestones/M57-review-every-day.md), features 2, 3, 4 and 7 of the review of every change, as plain code with
// no model, no git and no script:
//  - feature 2, a security look a beginner understands: Ship's own checks (ship/rls.ts analyzeMigrations, ship/scan.ts
//    scanFiles) run on the changed files only. A table anyone can read, or a key that would reach the page every visitor
//    loads, is Fix this first with its file and line. The live database is never read here (that stays on the person's press).
//  - feature 3, house rules: "never edit" and "ask before editing" lines of .companion/rules.txt (rules.ts, the same reading
//    the safety box uses) are checked against every changed path. The project's notes for AI tools (AGENTS.md, CLAUDE.md,
//    Cursor's rules) are read here, safely, to be quoted to the review's words as data, never as instructions.
//  - feature 4, a review that stays current: each reason keeps how to check it again (Recheck), and recheckHolds says
//    whether it still holds against a newer version of the project.
//  - feature 7, how strict: applyStrictness leaves out smaller reasons (Quiet, or a kind the person said not to flag here),
//    never a Fix this first, and never a key, a settings or key file, or open data.
// Every sentence names a file, a line or a table, never a value: no secret and no line of the person's code is ever put in
// a reason. Line texts are kept only as hashes, in memory, for the recheck.
import { createHash } from "node:crypto";
import { lstatSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { REVIEW_SILENCE_LINES, REVIEW_STRICTNESS, type ReviewStrictness } from "../../../protocol/index.ts";
import { clip, redact } from "../redact.ts";
import { pathMatches, type Rule } from "../rules.ts";
import { isEnvFile } from "../secretfiles.ts";
import { analyzeMigrations } from "../ship/rls.ts";
import { PUBLIC_PREFIX, publicDir, scanFiles } from "../ship/scan.ts";
import { importersOf, type AddedLine, type FileChange, type Rating, type Reason, type ReasonKind } from "./rate.ts";

/** The reasons that make a review Fix this first. Strictness never hides one of these. */
export const STOP_KINDS: ReadonlySet<ReasonKind> = new Set<ReasonKind>(["weakened_check", "claimed_passed", "secret_in_code", "key_in_page", "open_table", "removed_still_used", "house_rule", "checks_failed", "risky_with_failing_checks", "chosen_stop", "package_critical"]);
/** Never left out by a "do not flag" line, even when smaller: keys, settings and key files, data open to people, (M77)
 *  a check the change weakened, and (M79) a package with a known serious problem. */
const NEVER_SILENCED: ReadonlySet<ReasonKind> = new Set<ReasonKind>(["weakened_check", "claimed_passed", "secret_in_code", "key_in_page", "secret_file_changed", "open_table", "signed_in_open", "package_critical", "package_high"]);

// ---------- feature 2: open data ----------

/** A Supabase migration (the folder ship/rls.ts reads): the public schema is open through the site's own address. */
export const MIGRATION = /(^|\/)supabase\/migrations\/[^/]+\.sql$/i;

/** Tables this change left open: anyone can read them (no row level security, or a rule for anyone that says true) is Fix
 *  this first; every signed in account can read all rows is worth a look. Only when a changed file is a migration, and only
 *  what was not already open before the change. before, after: every migration of the project at the two versions. */
export function openData(changed: string[], before: Record<string, string>, after: Record<string, string>): Reason[] {
  return openDataItems(changed, before, after).map((x) => x.reason);
}
/** openData, with the table each reason is about and how it is open, for its recheck. */
export function openDataItems(changed: string[], before: Record<string, string>, after: Record<string, string>): { reason: Reason; table: string; open: "anyone" | "signedIn" }[] {
  const migrations = changed.filter((f) => MIGRATION.test(f));
  if (!migrations.length) return [];
  const a = analyzeMigrations(after), b = analyzeMigrations(before);
  const place = (t: string): { file: string; line?: number } => {
    const m = a.made[t];
    return m && migrations.includes(m.file) ? { file: m.file, line: m.line } : { file: migrations[0] };
  };
  const out: { reason: Reason; table: string; open: "anyone" | "signedIn" }[] = [];
  const add = (kind: ReasonKind, t: string, say: string) => out.push({ reason: { kind, ...place(t), say }, table: t, open: kind === "signed_in_open" ? "signedIn" : "anyone" });
  for (const t of a.withoutRls.filter((t) => !b.withoutRls.includes(t)).slice(0, 5)) {
    add("open_table", t, `The table ${t} can be read and changed by anyone who has your site address, because row level security is not on for it.`);
  }
  for (const t of a.openPolicies.filter((t) => !b.openPolicies.includes(t) && !a.withoutRls.includes(t)).slice(0, 5)) {
    add("open_table", t, `The table ${t} can be read or changed by anyone, signed in or not, because one of its rules says "true".`);
  }
  for (const t of a.signedInOpen.filter((t) => !b.signedInOpen.includes(t)).slice(0, 5)) {
    add("signed_in_open", t, `Every signed in account can read or change all rows of ${t}, because one of its rules says "true". Anyone can usually sign up.`);
  }
  return out;
}

// ---------- feature 2: keys that would reach the page ----------

// A secret setting asked for under a name the build puts into the page (NEXT_PUBLIC_, VITE_ and the like). A public token
// (a map's) is meant to be in the page, so a token alone is not one.
const SECRET_PART = /(SECRET|PRIVATE|SERVICE_ROLE|SERVICE_KEY|ADMIN_KEY|MASTER_KEY|PASSWORD|PASSWD|CREDENTIAL)/;
const NAME_IN_CODE = /\b([A-Z][A-Z0-9_]{3,})\b/g;

/** The added lines with a key Ship's scan knows. page: a key in a published folder, or a secret setting read under a public
 *  name: Fix this first, said as key_in_page. code: other keys the scan finds (a password in a web address, a login token),
 *  for the usual "key in the code" reason. Settings and key files are never looked at. */
export function keysInPage(added: AddedLine[]): { page: Reason[]; code: { file: string; line: number }[] } {
  const page: Reason[] = [], code: { file: string; line: number }[] = [];
  const seen = new Set<string>();
  for (const a of added) {
    if (isEnvFile(a.file)) continue;
    const at = `${a.file}\u0000${a.line}`;
    if (seen.has(at)) continue;
    const found = scanFiles({ [a.file]: a.text }, { publicFiles: publicDir });
    const name = [...a.text.matchAll(NAME_IN_CODE)].map((m) => m[1]).find((n) => PUBLIC_PREFIX.test(n) && SECRET_PART.test(n.replace(PUBLIC_PREFIX, "")));
    if (found.some((f) => f.public)) {
      seen.add(at);
      page.push({ kind: "key_in_page", file: a.file, line: a.line, say: `A key is written into ${a.file} at line ${a.line}, and that file is sent to everyone who opens your site.` });
    } else if (name) {
      seen.add(at);
      const prefix = PUBLIC_PREFIX.exec(name)![0];
      page.push({ kind: "key_in_page", file: a.file, line: a.line, say: `${a.file} at line ${a.line} reads a secret setting whose name starts with ${prefix}, so the build puts its value into the page where anyone can read it. Keep it in a setting without that start, used only on the server.` });
    } else if (found.length) { seen.add(at); code.push({ file: a.file, line: a.line }); }
  }
  return { page: page.slice(0, 5), code };
}

// ---------- feature 3: house rules ----------

/** The project's own "never edit" (Fix this first) and "ask before editing" (worth a look) rules that cover a changed file,
 *  quoting the rule. Rules about running commands or installing are not about files and are left to the safety box. */
export function houseRuleReasons(rules: Rule[], changed: FileChange[]): Reason[] {
  const out: Reason[] = [];
  for (const kind of ["never_edit", "ask_edit"] as const) {
    let n = 0;
    for (const r of rules.filter((x) => x.kind === kind && x.pattern)) {
      for (const c of changed) {
        if (n >= 5 || !pathMatches(r.pattern, c.file)) continue;
        n++;
        const rule = clip(redact(r.text), 160);
        out.push(kind === "never_edit"
          ? { kind: "house_rule", file: c.file, say: `Your house rule "${rule}" covers ${c.file}, and it changed.` }
          : { kind: "house_rule_ask", file: c.file, say: `Your house rule "${rule}" covers ${c.file}, and it changed. Check that this change was meant.` });
      }
    }
  }
  return out;
}

// ---------- feature 3: the project's notes for AI tools ----------

export type RuleFile = { name: string; text: string };
const NOTE_MAX_BYTES = 256 * 1024;
const NOTE_CHARS = 4000;
const NOTES_TOTAL = 10_000;
const CURSOR_MAX = 4;

/** One note file, read the safe way: a plain file in the project (never through a link), not too big, text only. */
function readNote(project: string, rel: string): string | null {
  try {
    const st = lstatSync(join(project, rel));
    if (!st.isFile() || st.size > NOTE_MAX_BYTES) return null;
    const buf = readFileSync(join(project, rel));
    if (buf.includes(0)) return null;
    return buf.toString("utf8");
  } catch { return null; }
}

/** The project's notes for AI tools, by name, in a fixed order: AGENTS.md, CLAUDE.md, .cursorrules, then up to four of
 *  Cursor's rule files. Each is cut short and every key looking value hidden. Read on this Mac; they leave it only inside a
 *  review's words request, quoted as data. */
export function ruleFilesOf(project: string): RuleFile[] {
  const names = ["AGENTS.md", "CLAUDE.md", ".cursorrules"];
  try {
    const dir = join(project, ".cursor", "rules");
    if (lstatSync(dir).isDirectory()) names.push(...readdirSync(dir).filter((n) => /\.(mdc|md)$/i.test(n)).sort().map((n) => `.cursor/rules/${n}`));
  } catch { /* no Cursor rules */ }
  const out: RuleFile[] = [];
  let total = 0, cursor = 0;
  for (const name of names) {
    if (name.startsWith(".cursor/") && cursor >= CURSOR_MAX) break;
    const raw = readNote(project, name);
    if (raw === null || !raw.trim()) continue;
    if (name.startsWith(".cursor/")) cursor++;
    const text = clip(redact(raw), Math.min(NOTE_CHARS, NOTES_TOTAL - total)).trim();
    if (!text) break;
    out.push({ name, text });
    total += text.length;
    if (total >= NOTES_TOTAL) break;
  }
  return out;
}

// ---------- feature 7: how strict ----------

/** The reasons shown at this strictness, the rating they make, and how many were left out. Quiet: only Fix this first,
 *  plus the kinds that are never left out.
 *  Normal: everything but the kinds silenced in this project. Careful: everything. A Fix this first, a key, a settings or
 *  key file and open data are never left out. */
export function applyStrictness(r: { rating: Rating; reasons: Reason[] }, strictness: ReviewStrictness, silenced: ReadonlySet<ReasonKind>): { rating: Rating; reasons: Reason[]; hidden: number } {
  const s: ReviewStrictness = (REVIEW_STRICTNESS as readonly string[]).includes(strictness) ? strictness : "normal";
  const keep = (x: Reason): boolean => {
    // Checked before Quiet: a settings or key file that changed, and data every signed in account can read, are never left
    // out at any strictness (review finding, 4 Nov 2026: Quiet used to hide both).
    if (STOP_KINDS.has(x.kind) || NEVER_SILENCED.has(x.kind)) return true;
    if (s === "quiet") return false;
    if (s === "careful" || !REVIEW_SILENCE_LINES[x.kind]) return true;
    return !silenced.has(x.kind);
  };
  const reasons = r.reasons.filter(keep);
  const rating: Rating = reasons.some((x) => STOP_KINDS.has(x.kind)) ? "stop" : reasons.length ? "worth_a_look" : "safe";
  return { rating, reasons, hidden: r.reasons.length - reasons.length };
}

// ---------- feature 4: checking a reason again ----------

/** How a reason is checked again by the rules. line: that line (by its hash) is still in the file. import: the removed file
 *  is still gone and still imported by that file. table: still open. files: not every one of these files is back as it was. */
export type Recheck =
  | { how: "line"; file: string; hash: string }
  | { how: "import"; file: string; by: string }
  | { how: "table"; table: string; open: "anyone" | "signedIn" }
  | { how: "files"; files: string[] };
/** What a recheck looks at: the text of the files it needs at the newer version (a file missing there is gone), the files
 *  that differ from the version before the reviewed change, and every migration at the newer version. */
export type RecheckState = { text: Record<string, string>; changedSinceBefore: ReadonlySet<string>; migrations: Record<string, string> };

/** A line's fingerprint, spaces at either end left out. Kept in memory only, never sent or shown. */
export const lineHash = (text: string): string => createHash("sha256").update(text.trim()).digest("hex").slice(0, 32);

export function recheckHolds(t: Recheck, s: RecheckState): boolean {
  switch (t.how) {
    case "line": { const text = s.text[t.file]; return text !== undefined && text.split("\n").some((l) => lineHash(l) === t.hash); }
    case "import": {
      if (s.text[t.file] !== undefined) return false;
      const by = s.text[t.by];
      return by !== undefined && importersOf([t.file], { [t.by]: by }).length > 0;
    }
    case "table": { const a = analyzeMigrations(s.migrations); return t.open === "signedIn" ? a.signedInOpen.includes(t.table) : a.withoutRls.includes(t.table) || a.openPolicies.includes(t.table); }
    case "files": return t.files.some((f) => s.changedSinceBefore.has(f));
  }
}

/** The files a set of rechecks needs the text of. */
export function recheckFiles(ts: Recheck[]): string[] {
  const out = new Set<string>();
  for (const t of ts) { if (t.how === "line") out.add(t.file); if (t.how === "import") { out.add(t.file); out.add(t.by); } }
  return [...out];
}
