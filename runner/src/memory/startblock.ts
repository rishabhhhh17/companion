// M78: the start block. What Claude is handed as a Claude Code session starts (a SessionStart hook the person said yes to,
// donesignal.ts), and the same pick, capped the same way, for the shared AGENTS.md block (agentsmd.ts).
// Only what Claude cannot see in the code: house rules, decisions with their reason, "tried and failed" lines and the
// person's own lines. Lines learned from the project's files (package.json, README, deploy files) stay out of the start
// block, since Claude can read those files itself; they stay in search (notesindex.ts).
// The research (docs/research/2026-11-08-memory-for-ai-tools.md, section 2) found that big context files raised cost with
// no gain, so the block is small: at most START_LINES lines in all, under START_CHARS characters. It is built in a fixed
// order, so the same notes give the same bytes, and it is written to a file Claude Code reads once as a session starts:
// it never changes inside a session, so prompt caching keeps working.
// Nothing here reads anything but Squibby's own notes file and the house rules file (rules 5 and 6).
import { screenLine } from "./filter.ts";
import type { Entry, MemoryStore } from "./store.ts";
import { readCompanionFile } from "../companionfile.ts";
import { PRODUCT } from "../names.ts";
import { redact } from "../redact.ts";

/** At most this many lines in the whole block, its first and last lines included (the research's "about 30"). */
export const START_LINES = 30;
/** Well under Claude Code's 10,000 character cap on a hook's output (over it, only a preview reaches Claude). */
export const START_CHARS = 6000;
/** At most this many tried and failed lines, so the newest few never crowd out the rules and decisions. */
export const FAILED_MAX = 8;
/** The shared block's own cap (agentsmd.ts): the same size, its headings included. */
export const SHARED_LINES = 30;

export type NoteKind = "rule" | "decision" | "failed" | "note" | "code";
/** One line of the pick: the words, where they came from, and the memory line's id (absent for a house rule, which lives in
 *  rules.txt and is changed in Settings). */
export type Picked = { kind: NoteKind; text: string; source: string; date: string; id?: string };

export const DECIDED = /^decided:\s/i;
export const TRIED = /^tried and failed:\s/i;
/** The prefix a house rule from rules.txt gets in the block. */
export const RULE_PREFIX = "House rule: ";
export const RULES_SOURCE = "your house rules";

// Where a line learned from the project's own files says it came from (learn.ts projectFacts): Claude can read those.
const CODE_SOURCES = new Set(["package.json", "readme.md", "index.html", "supabase folder", "vercel.json", "wrangler.toml", "wrangler.jsonc", "wrangler.json", "netlify.toml", "fly.toml"]);
export const fromCode = (source: string): boolean => CODE_SOURCES.has(source.trim().toLowerCase());

/** The kind of one memory line. */
export function kindOf(e: Pick<Entry, "text" | "source">): NoteKind {
  if (DECIDED.test(e.text)) return "decision";
  if (TRIED.test(e.text)) return "failed";
  if (/^never touch\s/i.test(e.text)) return "rule";
  if (fromCode(e.source)) return "code";
  return "note";
}

/** The house rules file's lines, never through a link (companionfile.ts), comments left out, at most 20. */
export function houseRules(project: string): string[] {
  if (!project) return [];
  const r = readCompanionFile(project, "rules.txt");
  return r.state === "ok" ? r.text.split("\n").map((l) => l.replace(/\s+/g, " ").trim()).filter((l) => l && !l.startsWith("#") && screenLine(l).ok).slice(0, 20) : [];
}

/** Every project note, ranked: house rules (as written), decisions, tried and failed (newest first, at most FAILED_MAX),
 *  the person's own lines (newest first), then lines from the code (newest first). Each line passes the filter today.
 *  allFailed: every tried and failed line (for search). */
export function pickNotes(project: string, m: MemoryStore, o: { allFailed?: boolean } = {}): Picked[] {
  const entries = m.list("project").entries.filter((e) => screenLine(e.text).ok);
  const newest = (a: Entry[]) => a.slice().reverse();
  const of = (k: NoteKind) => entries.filter((e) => kindOf(e) === k);
  const put = (e: Entry): Picked => ({ kind: kindOf(e), text: e.text, source: e.source, date: e.date, id: e.id });
  const rules: Picked[] = houseRules(project).map((r) => ({ kind: "rule", text: `${RULE_PREFIX}${r}`, source: RULES_SOURCE, date: "" }));
  return [...rules, ...of("rule").map(put), ...newest(of("decision")).map(put), ...newest(of("failed")).slice(0, o.allFailed ? undefined : FAILED_MAX).map(put), ...newest(of("note")).map(put), ...newest(of("code")).map(put)];
}

export const START_TITLE = `Notes from ${PRODUCT} for this project: what the code does not show. The person keeps them; follow the house rules.`;
/** The block's last line: how Claude asks for the rest. */
export const searchLine = (command: string) => `More notes: run ${command} followed by a few words (for example: payments) to search them.`;

export type StartBlock = { text: string; lines: Picked[] };

/** The block as Claude sees it. `shared`: lines Claude Code already reads from the shared AGENTS.md block, left out so
 *  nothing is said twice. `search`: the command that searches the rest (absent: no search line). Empty when there is
 *  nothing to say and no search. */
export function startBlock(picked: Picked[], o: { shared?: ReadonlySet<string>; search?: string } = {}): StartBlock {
  const shared = o.shared ?? new Set<string>();
  const last = o.search ? [searchLine(o.search)] : [];
  const room = START_LINES - 1 - last.length;
  let chars = START_TITLE.length + 1 + last.reduce((n, l) => n + l.length + 1, 0);
  const lines: Picked[] = [];
  for (const p of picked) {
    if (p.kind === "code" || shared.has(p.text) || (p.text.startsWith(RULE_PREFIX) && shared.has(p.text.slice(RULE_PREFIX.length)))) continue;
    if (lines.length >= room) break;
    const l = `- ${p.text}`;
    if (chars + l.length + 1 > START_CHARS) break;
    chars += l.length + 1;
    lines.push(p);
  }
  if (!lines.length && !last.length) return { text: "", lines: [] };
  return { text: [START_TITLE, ...lines.map((p) => `- ${p.text}`), ...last].join("\n") + "\n", lines };
}

/** The lines of Squibby's own block in an AGENTS.md text (between its markers), as they are written there. */
export function sharedLinesOf(agentsText: string): Set<string> {
  const m = /<!-- companion:begin[^\n]*?-->([\s\S]*?)<!-- companion:end -->/.exec(agentsText);
  if (!m) return new Set();
  return new Set(m[1].split("\n").map((l) => /^- (.+)$/.exec(l.trim())?.[1]).filter((l): l is string => !!l && l !== "Nothing yet."));
}

/** M78: where a tried and failed line says it came from. */
export const TRIED_SOURCE = { loop: "the loop breaker stopped a fix", unproven: "a fix that was not proven" } as const;
const short = (t: string, n: number) => { const one = redact(t).replace(/[\u0000-\u001f\u007f]+/g, " ").replace(/\s+/g, " ").trim(); return one.length > n ? `${one.slice(0, n - 1).replace(/\s+\S*$/, "")}...` : one; };
/** M78: the tried and failed line: what was tried, and the proof that it failed (the check and the first line of what it
 *  said). Redacted, one line, within the filter's length. Null when there is nothing to say or it would not pass the filter. */
export function triedLine(what: string, failure: { label: string; detail: string }): string | null {
  const w = short(what, 90).replace(/[.!?]+$/, ""), check = short(failure.label, 60), first = short((failure.detail ?? "").split("\n").find((l) => l.trim()) ?? "", 110).replace(/[.]+$/, "");
  if (!w || !check) return null;
  const line = `Tried and failed: ${w}. The checks still failed on ${check}${first ? `: ${first}` : ""}.`;
  return screenLine(line).ok && !/ — |\{m_/.test(line) ? line : null;
}
