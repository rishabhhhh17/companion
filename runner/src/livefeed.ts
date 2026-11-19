// M113 (docs/milestones/M113-live-feed.md): the live feed in the notch. While the person's own AI tool works, the notch
// says the file it edited with the lines it added and took away, and the command it ran, newest first, one block per
// session. Three sources, each already the person's yes:
//  - the feed hook (donesignal.ts, kind "feed"): the tool's own note after an edit, handed to Squibby's guard folder. Only
//    the file's path and the line counts are taken from it; the note is removed as it is read (guard.ts), and the edit's
//    text is never kept, said to the pages or logged.
//  - the guard hook (M77, M80): each command the tool runs, said in the short redacted form History already uses.
//  - the review's folder watcher (M52), for a tool with no hooks: the files that changed, with no counts, said as seen in
//    the folder, only in a project with such a tool connected, only when no hook spoke for that project just now, and only
//    after a short hold in which no hook named it (M113 review).
// Everything lives in memory and goes with the session: nothing is written anywhere (rule 15). Nothing here runs git.
import { createHash } from "node:crypto";
import { basename, isAbsolute, relative, resolve, sep } from "node:path";
import type { DoneTool } from "./donesignal.ts";
import { parseRequest, shortCommand } from "./guard.ts";
import { redact } from "./redact.ts";

/** The tools with an after edit event the feed hook sits under (donesignal.ts TOOL_HOOKS has "feed" for exactly these). */
export const FEED_TOOLS: readonly DoneTool[] = ["claude", "codex", "cursor", "copilot", "gemini"];
/** M113 review: the tools with no after edit event: only for a project with one of these connected does the folder fill in. */
export const HOOKLESS_TOOLS: readonly DoneTool[] = ["antigravity", "windsurf"];
/** At most this many lines in one session's block, and this many blocks said at once. */
export const FEED_MAX_ITEMS = 4;
export const FEED_MAX_SESSIONS = 3;
/** Kept in memory beyond what is said, so a quiet session coming back keeps its place. */
const KEEP_SESSIONS = 8;
/** A finished session says Finished this long, then goes. */
export const FEED_DONE_MS = 60_000;
/** A session nothing happens in goes after this (a tool with no done signal never stays on). */
export const FEED_IDLE_MS = 3 * 60_000;
/** Updates are said at most this often. */
export const FEED_EMIT_MS = 200;
/** The folder watcher fills in for a project only when no hook spoke for it this long. */
export const FEED_HOOK_FRESH_MS = 15_000;
/** M113 review: a folder path waits this long before it shows, so the tool's own hook note (which lands after the file is
 *  written) can name it first; when a hook speaks for the project in that time, the path is dropped. */
export const FEED_FOLDER_HOLD_MS = 1500;
/** M113 review: how long the answer to "is a hook-less tool connected here" is kept (it reads the tools' hook files). */
const HOOKLESS_KEEP_MS = 5000;
/** The longest path said, in characters (the start is cut, the file's name kept). */
export const FEED_PATH_MAX = 80;
/** A note bigger than this is never read whole (guard.ts reads its start for the file's name only). */
export { FEED_NOTE_MAX } from "./guard.ts";
/** Above this many cells the line diff counts the middle as all changed (the ends are still trimmed). */
const DIFF_CELLS = 250_000;

export type RawEdit = { path: string; added?: number; removed?: number; session?: string; cwd?: string };
export type FeedEditItem = { kind: "edit"; path: string; added?: number; removed?: number; n: number };
export type FeedRunItem = { kind: "run"; command: string; n: number };
export type FeedItem = FeedEditItem | FeedRunItem;
export type FeedSessionView = { key: string; project: string; tool?: DoneTool; via: "hook" | "folder"; state: "working" | "done"; items: FeedItem[] };
export type FeedEvent = { type: "feed.update"; sessions: FeedSessionView[] };

type Json = Record<string, unknown>;
const objOf = (v: unknown): Json | null => {
  if (typeof v === "string") { try { v = JSON.parse(v); } catch { return null; } }
  return v && typeof v === "object" && !Array.isArray(v) ? (v as Json) : null;
};
const str = (v: unknown): string | null => (typeof v === "string" && v.trim() ? v : null);
const textOr = (v: unknown): string | null => (typeof v === "string" ? v : null);
const firstStr = (o: Json | null, keys: readonly string[]): string | null => { if (!o) return null; for (const k of keys) { const s = str(o[k]); if (s) return s; } return null; };

/** A text's lines: "a\nb\n" is two lines, "" is none. */
const linesOf = (s: string): string[] => { if (!s) return []; const l = s.replace(/\r\n/g, "\n").split("\n"); if (l.at(-1) === "") l.pop(); return l; };
/** How many lines `after` added and took away from `before`: the common start and end are trimmed, then the longest common
 *  run of lines (a real line diff, as git counts a change), or, for a huge middle, all of it. */
export function lineCounts(before: string, after: string): { added: number; removed: number } {
  const a = linesOf(before), b = linesOf(after);
  let s = 0;
  while (s < a.length && s < b.length && a[s] === b[s]) s++;
  let ea = a.length, eb = b.length;
  while (ea > s && eb > s && a[ea - 1] === b[eb - 1]) { ea--; eb--; }
  const n = ea - s, m = eb - s;
  if (n === 0 || m === 0) return { added: m, removed: n };
  if (n * m > DIFF_CELLS) return { added: m, removed: n };
  let prev = new Int32Array(m + 1), cur = new Int32Array(m + 1);
  for (let i = 1; i <= n; i++) {
    for (let j = 1; j <= m; j++) cur[j] = a[s + i - 1] === b[s + j - 1] ? prev[j - 1]! + 1 : Math.max(prev[j]!, cur[j - 1]!);
    [prev, cur] = [cur, prev];
  }
  const common = prev[m]!;
  return { added: m - common, removed: n - common };
}
/** Claude Code's own patch (tool_response.structuredPatch): its + and - lines. */
function patchCounts(v: unknown): { added: number; removed: number } | null {
  if (!Array.isArray(v)) return null;
  let added = 0, removed = 0;
  for (const h of v) {
    const lines = objOf(h)?.lines;
    if (!Array.isArray(lines)) return null;
    for (const l of lines) { if (typeof l !== "string") continue; if (l.startsWith("+")) added++; else if (l.startsWith("-")) removed++; }
  }
  return { added, removed };
}
/** Codex's apply_patch text: each file with its own counts (a deleted file's lines are not in the patch, so none). */
function applyPatch(text: string): { path: string; added?: number; removed?: number }[] {
  const out: { path: string; added?: number; removed?: number }[] = [];
  let cur: { path: string; added?: number; removed?: number } | null = null;
  for (const line of text.replace(/\r\n/g, "\n").split("\n")) {
    const head = /^\*\*\* (Add|Update|Delete) File: (.+)$/.exec(line);
    if (head) { cur = head[1] === "Delete" ? { path: head[2]!.trim() } : { path: head[2]!.trim(), added: 0, removed: 0 }; out.push(cur); continue; }
    const moved = /^\*\*\* Move to: (.+)$/.exec(line);
    if (moved && cur) { cur.path = moved[1]!.trim(); continue; }
    if (!cur || cur.added === undefined || line.startsWith("***")) continue;
    if (line.startsWith("+")) cur.added!++;
    else if (line.startsWith("-")) cur.removed!++;
  }
  return out.filter((f) => f.path);
}

const EDIT_TOOLS = new Set(["Edit", "replace", "replace_string_in_file"]);
const WRITE_TOOLS = new Set(["Write", "write_file", "create_file"]);
const PATH_KEYS = ["file_path", "filePath", "absolute_path", "path", "notebook_path"] as const;

/** What a tool's feed note says was edited: each file with its line counts where they can be known, or nothing for any
 *  other note (a shell call, a read, a note that is not JSON, a tool not known here). Only the tool's name, its input's
 *  path and texts, its own patch and the session's id and folder are looked at; the texts are only counted. */
export function editsOf(text: string): RawEdit[] {
  const o = objOf(text);
  if (!o) return [];
  const session = firstStr(o, ["session_id", "sessionId", "conversation_id", "conversationId"]);
  const roots = Array.isArray(o.workspace_roots) ? o.workspace_roots.find((r) => typeof r === "string" && r) : undefined;
  const cwd = str(o.cwd) ?? (typeof roots === "string" ? roots : null);
  const tag = (e: { path: string; added?: number; removed?: number }): RawEdit => ({ ...e, ...(session ? { session } : {}), ...(cwd ? { cwd } : {}) });
  // Cursor's afterFileEdit: the file and its edits at the top.
  if (o.hook_event_name === "afterFileEdit" || (o.tool_name === undefined && o.toolName === undefined && typeof o.file_path === "string" && Array.isArray(o.edits))) {
    const path = str(o.file_path);
    if (!path) return [];
    if (!Array.isArray(o.edits)) return [tag({ path })];
    let added = 0, removed = 0;
    for (const e of o.edits) { const x = objOf(e); if (!x) continue; const c = lineCounts(textOr(x.old_string) ?? "", textOr(x.new_string) ?? ""); added += c.added; removed += c.removed; }
    return [tag({ path, added, removed })];
  }
  const name = str(o.tool_name) ?? str(o.toolName);
  if (!name) return [];
  const input = objOf(o.tool_input ?? o.toolArgs);
  const response = objOf(o.tool_response ?? o.toolResponse);
  if (name === "apply_patch") {
    const patch = firstStr(input, ["command", "patch", "input"]) ?? (Array.isArray(input?.command) ? (input!.command as unknown[]).filter((x): x is string => typeof x === "string").find((x) => x.includes("*** Begin Patch")) ?? null : null);
    return patch ? applyPatch(patch).map(tag) : [];
  }
  const known = EDIT_TOOLS.has(name) || WRITE_TOOLS.has(name) || name === "MultiEdit" || name === "NotebookEdit";
  if (!known || !input) return [];
  const path = firstStr(input, PATH_KEYS);
  if (!path) return [];
  // A huge note's start, as guard.ts hands it on: the file's name only.
  if (o.truncated === true) return [tag({ path })];
  const fromPatch = patchCounts(response?.structuredPatch);
  if (fromPatch && (response?.type !== "create")) return [tag({ path, ...fromPatch })];
  if (EDIT_TOOLS.has(name)) {
    const old = textOr(input.old_string ?? input.oldString), neu = textOr(input.new_string ?? input.newString);
    return old === null && neu === null ? [tag({ path })] : [tag({ path, ...lineCounts(old ?? "", neu ?? "") })];
  }
  if (name === "MultiEdit") {
    if (!Array.isArray(input.edits)) return [tag({ path })];
    let added = 0, removed = 0;
    for (const e of input.edits) { const x = objOf(e); if (!x) continue; const c = lineCounts(textOr(x.old_string) ?? "", textOr(x.new_string) ?? ""); added += c.added; removed += c.removed; }
    return [tag({ path, added, removed })];
  }
  if (name === "NotebookEdit") { const src = textOr(input.new_source); return [tag(src === null ? { path } : { path, added: linesOf(src).length })]; }
  // A write: every line of its text is added. A new file (create) took nothing away; over an old file, what it took away is
  // known only from the tool's own patch (above) or the old text it gives back.
  const content = textOr(input.content);
  if (content === null) return [tag({ path })];
  const original = textOr(response?.originalFile);
  if (original !== null) return [tag({ path, ...lineCounts(original, content) })];
  const created = response?.type === "create" || name === "create_file";
  return [tag(created ? { path, added: linesOf(content).length, removed: 0 } : { path, added: linesOf(content).length })];
}

/** A guard request as a run line: the redacted short command (History's own form) and the session's id, or null for
 *  anything that is not a shell command. */
export function runOf(text: string): { command: string; session?: string } | null {
  const req = parseRequest(text);
  if (!req) return null;
  const command = shortCommand(req.command);
  if (!command) return null;
  const session = firstStr(objOf(text), ["session_id", "sessionId", "conversation_id", "conversationId"]);
  return { command, ...(session ? { session } : {}) };
}

/** A path as the notch says it: from the project down, or only the file's name when it is outside the project. One line,
 *  redacted, at most FEED_PATH_MAX characters (the start is cut, the name kept). */
export function shownPath(project: string, path: string, cwd?: string): string {
  const root = resolve(project);
  const abs = isAbsolute(path) ? resolve(path) : resolve(cwd ?? root, path);
  const rel = relative(root, abs);
  let out = !rel || rel.startsWith("..") || isAbsolute(rel) ? basename(abs) : rel.split(sep).join("/");
  out = redact(out).replace(/[\u0000-\u001f\u007f]+/g, " ").replace(/\s+/g, " ").trim();
  const chars = Array.from(out);
  return chars.length > FEED_PATH_MAX ? `…${chars.slice(chars.length - (FEED_PATH_MAX - 1)).join("")}` : out;
}

type Session = { key: string; project: string; tool: DoneTool | null; via: "hook" | "folder"; state: "working" | "done"; items: FeedItem[]; at: number; doneAt: number };
const keyOf = (...parts: string[]) => createHash("sha256").update(parts.join("\u0000")).digest("hex").slice(0, 12);

export type LiveFeedDeps = {
  emit: (e: FeedEvent) => void;
  now?: () => number;
  /** For tests: 0 says each update at once. */
  emitMs?: number;
  /** For tests: false runs no timer (the test calls sweep()). */
  timers?: boolean;
  /** M113 review: whether the project has a tool with no hooks for the feed connected (Antigravity or Windsurf, main.ts).
   *  The folder fills in only then, so the person's own saves never show as an AI tool's work. None given: never. */
  hookless?: (project: string) => boolean;
  /** For tests: FEED_FOLDER_HOLD_MS. */
  folderHoldMs?: number;
};

/** The feed: sessions in memory, said as feed.update. */
export class LiveFeed {
  private sessions = new Map<string, Session>();
  /** When a hook last spoke for each project (the folder watcher waits for this to be old). */
  private hookAt = new Map<string, number>();
  private lastEmit = -Infinity;
  private pending: ReturnType<typeof setTimeout> | null = null;
  private sweeper: ReturnType<typeof setTimeout> | null = null;
  private lastSaid = "";
  /** M113 review: folder paths waiting out FEED_FOLDER_HOLD_MS, and their timer. */
  private held: { project: string; rel: string; at: number }[] = [];
  private holdTimer: ReturnType<typeof setTimeout> | null = null;
  private hooklessAt = new Map<string, { at: number; yes: boolean }>();
  constructor(private o: LiveFeedDeps) {}
  private now(): number { return (this.o.now ?? Date.now)(); }

  /** A feed note from a tool's feed hook. */
  edit(project: string, tool: DoneTool | null, text: string): void {
    const edits = editsOf(text);
    if (!edits.length) return;
    const p = resolve(project);
    this.hookAt.set(p, this.now());
    for (const e of edits) {
      const s = this.session(p, tool, "hook", e.session ?? "");
      const path = shownPath(p, e.path, e.cwd);
      if (path) this.putEdit(s, { kind: "edit", path, ...(e.added !== undefined ? { added: e.added } : {}), ...(e.removed !== undefined ? { removed: e.removed } : {}), n: 1 });
    }
    this.changed();
  }
  /** A guard request: the tool runs a command. */
  ran(project: string, tool: DoneTool | null, text: string): void {
    const r = runOf(text);
    if (!r) return;
    const p = resolve(project);
    this.hookAt.set(p, this.now());
    const s = this.session(p, tool, "hook", r.session ?? "");
    const top = s.items[0];
    if (top && top.kind === "run" && top.command === r.command) top.n++;
    else s.items = [{ kind: "run" as const, command: r.command, n: 1 }, ...s.items].slice(0, FEED_MAX_ITEMS);
    this.changed();
  }
  /** A path the review's watcher counted, for a tool with no hooks. Only for a project with such a tool connected, only when
   *  no hook spoke for the project just now, and only after FEED_FOLDER_HOLD_MS with still no hook (M113 review). */
  folder(project: string, rel: string): void {
    const p = resolve(project), t = this.now();
    if (this.hookFresh(p, t) || !this.hooklessIn(p, t)) return;
    this.held.push({ project: p, rel, at: t });
    this.armHold();
  }
  private hookFresh(p: string, t: number): boolean { const h = this.hookAt.get(p); return h !== undefined && t - h < FEED_HOOK_FRESH_MS; }
  private hooklessIn(p: string, t: number): boolean {
    if (!this.o.hookless) return false;
    const was = this.hooklessAt.get(p);
    if (was && t - was.at < HOOKLESS_KEEP_MS) return was.yes;
    let yes = false;
    try { yes = this.o.hookless(p) === true; } catch { yes = false; }
    this.hooklessAt.set(p, { at: t, yes });
    return yes;
  }
  private holdMs(): number { return this.o.folderHoldMs ?? FEED_FOLDER_HOLD_MS; }
  /** The held folder paths whose wait is over: shown, unless a hook spoke for their project meanwhile. */
  private release(): void {
    const t = this.now(), ms = this.holdMs();
    const due = this.held.filter((h) => t - h.at >= ms);
    if (!due.length) return;
    this.held = this.held.filter((h) => t - h.at < ms);
    let any = false;
    for (const h of due) {
      if (this.hookFresh(h.project, t)) continue;
      const path = shownPath(h.project, h.rel);
      if (!path) continue;
      this.putEdit(this.session(h.project, null, "folder", ""), { kind: "edit", path, n: 1 });
      any = true;
    }
    if (any) this.changed();
  }
  private armHold(): void {
    if (this.o.timers === false || this.holdTimer || !this.held.length) return;
    const wait = Math.max(0, this.held[0]!.at + this.holdMs() - this.now());
    this.holdTimer = setTimeout(() => { this.holdTimer = null; this.release(); this.armHold(); }, wait + 5);
    this.holdTimer.unref?.();
  }
  /** The tool's done marker: its sessions in the project say Finished (every hook session of the project when the tool is
   *  not known, and the folder's). */
  done(project: string, tool: DoneTool | null): void {
    const p = resolve(project), t = this.now();
    let any = false;
    for (const s of this.sessions.values()) {
      if (s.project !== p || s.state === "done") continue;
      if (s.via === "hook" && tool !== null && s.tool !== tool) continue;
      s.state = "done"; s.doneAt = t; any = true;
    }
    if (any) this.changed();
  }
  /** Stop everything: the feed empties now (the person's tools keep running; the next event fills it again). */
  stop(): void {
    this.sessions.clear(); this.hookAt.clear(); this.held = []; this.hooklessAt.clear();
    if (this.holdTimer) { clearTimeout(this.holdTimer); this.holdTimer = null; }
    if (this.pending) { clearTimeout(this.pending); this.pending = null; }
    if (this.sweeper) { clearTimeout(this.sweeper); this.sweeper = null; }
    this.say(true);
  }
  /** Finished sessions after FEED_DONE_MS, and quiet ones after FEED_IDLE_MS, go. */
  sweep(): void {
    this.release();
    const t = this.now();
    let gone = false;
    for (const [k, s] of this.sessions) {
      if ((s.state === "done" && t - s.doneAt > FEED_DONE_MS) || (s.state === "working" && t - s.at > FEED_IDLE_MS)) { this.sessions.delete(k); gone = true; }
    }
    for (const [p, h] of this.hookAt) if (t - h > FEED_IDLE_MS) this.hookAt.delete(p);
    if (gone) this.changed(); else this.arm();
  }
  /** For tests and the protocol: what is said now. */
  view(): FeedSessionView[] {
    const all = [...this.sessions.values()].sort((a, b) => (a.state === b.state ? b.at - a.at : a.state === "working" ? -1 : 1));
    return all.slice(0, FEED_MAX_SESSIONS).map((s) => ({ key: s.key, project: s.project, ...(s.tool ? { tool: s.tool } : {}), via: s.via, state: s.state, items: s.items.map((i) => ({ ...i })) }));
  }

  private session(project: string, tool: DoneTool | null, via: "hook" | "folder", id: string): Session {
    const key = keyOf(project, tool ?? "", via, id), t = this.now();
    let s = this.sessions.get(key);
    if (!s) {
      s = { key, project, tool, via, state: "working", items: [], at: t, doneAt: 0 };
      this.sessions.set(key, s);
      // Only a few kept: the quietest go first.
      if (this.sessions.size > KEEP_SESSIONS) {
        const oldest = [...this.sessions.values()].filter((x) => x !== s).sort((a, b) => a.at - b.at)[0];
        if (oldest) this.sessions.delete(oldest.key);
      }
    } else if (s.state === "done") { s.state = "working"; s.items = []; }   // a new turn starts clean
    s.at = t;
    return s;
  }
  private putEdit(s: Session, item: FeedEditItem): void {
    const i = s.items.findIndex((x) => x.kind === "edit" && x.path === item.path);
    if (i >= 0) {
      const was = s.items[i] as FeedEditItem;
      s.items.splice(i, 1);
      const sum = (a?: number, b?: number) => (a === undefined && b === undefined ? undefined : (a ?? 0) + (b ?? 0));
      const added = sum(was.added, item.added), removed = sum(was.removed, item.removed);
      item = { kind: "edit", path: item.path, ...(added !== undefined ? { added } : {}), ...(removed !== undefined ? { removed } : {}), n: was.n + 1 };
    }
    s.items = [item, ...s.items].slice(0, FEED_MAX_ITEMS);
  }
  private changed(): void { this.say(false); this.arm(); }
  /** Says the feed: at once when the last update was long enough ago, else once at the end of the wait. */
  private say(now: boolean): void {
    const ms = this.o.emitMs ?? FEED_EMIT_MS, t = this.now();
    if (now || ms <= 0 || t - this.lastEmit >= ms) {
      if (this.pending) { clearTimeout(this.pending); this.pending = null; }
      this.lastEmit = t;
      const sessions = this.view();
      const said = JSON.stringify(sessions);
      if (said === this.lastSaid && !now) return;
      this.lastSaid = said;
      try { this.o.emit({ type: "feed.update", sessions }); } catch { /* the feed is a nicety */ }
      return;
    }
    if (this.pending) return;
    const wait = Math.max(0, ms - (t - this.lastEmit));
    this.pending = setTimeout(() => { this.pending = null; this.say(false); }, wait);
    this.pending.unref?.();
  }
  /** One timer for the next session to go. */
  private arm(): void {
    if (this.o.timers === false) return;
    if (this.sweeper) { clearTimeout(this.sweeper); this.sweeper = null; }
    let next = Infinity;
    for (const s of this.sessions.values()) next = Math.min(next, s.state === "done" ? s.doneAt + FEED_DONE_MS : s.at + FEED_IDLE_MS);
    if (next === Infinity) return;
    this.sweeper = setTimeout(() => { this.sweeper = null; this.sweep(); }, Math.max(50, next - this.now() + 10));
    this.sweeper.unref?.();
  }
}
