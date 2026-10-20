// Companion's memory: plain markdown files a person can read and edit. Every line has a source and a date.
// The project's file lives in the project (.companion/project.md); the profile lives in Companion's own folder.
import { createHash } from "node:crypto";
import { chmodSync, copyFileSync, existsSync, mkdirSync, readFileSync, rmSync } from "node:fs";
import { dirname, join } from "node:path";
import { screenLine } from "./filter.ts";
import { writeAtomic } from "../atomic.ts";
import { companionDirUsable, readCompanionFile } from "../companionfile.ts";
import { EXPLAIN_MODES, type ExplainMode } from "../../../protocol/index.ts";

export type Scope = "project" | "profile";
export type Entry = { id: string; text: string; source: string; date: string };
export type ListResult = { entries: Entry[]; problems: string[] };
export type AddResult = { ok: true; entry: Entry } | { ok: false; reason: string };
export type Plain = { ok: true } | { ok: false; reason: string };

const PROFILE_CAP = 200;
const HEAD: Record<Scope, string> = {
  project: "# What Companion knows about this project\n\nCompanion keeps this file. You can read it, edit it, or delete any line. Each line says where it came from.\n",
  profile: "# How you like to work\n\nCompanion keeps this file. You can read it, edit it, or delete any line. Each line says where it came from.\n",
};
const LINE = /^- (.+?) — (.+?), (\d{4}-\d{2}-\d{2})(?: \{(m_[a-z0-9]{6,})\})?\s*$/;
const oneLine = (s: string) => s.replace(/[\r\n\u2028\u2029]+/g, " ").replace(/\s+/g, " ").trim();
const idFor = (text: string) => "m_" + createHash("sha256").update(text.toLowerCase()).digest("hex").slice(0, 8);

// explain is the switch before Explain after a task had three choices (explainMode); both are written, so going back a
// version keeps Explain on or off.
type Prefs = { paused: boolean; forgotten: Record<string, string[]>; agents: Record<string, "approved" | "declined">; explain: boolean; explainMode: ExplainMode };
type Raw = { kind: "other"; text: string } | { kind: "entry"; entry: Entry; hand: boolean };

export class MemoryStore {
  constructor(private o: { project: string; profileDir: string }) {}

  private file(scope: Scope) { return scope === "project" ? join(this.o.project, ".companion", "project.md") : join(this.o.profileDir, "profile.md"); }
  private settings() { return join(this.o.profileDir, "memory-settings.json"); }

  private read(scope: Scope): { raw: Raw[]; problem?: string } {
    if (scope === "project" && !this.o.project) return { raw: [] };   // no project given: only the profile exists
    const f = this.file(scope);
    let text: string;
    if (scope === "project") {
      // The project's file is in the project, which may have come from a link on the internet: read safely
      // (companionfile.ts), never through a link, at most 1 MB. One refused is never read, never sent and never written over.
      const r = readCompanionFile(this.o.project, "project.md", 1024 * 1024);
      if (r.state === "none") return { raw: [] };
      if (r.state === "unreadable") return { raw: [], problem: "The project's memory file could not be read here (it is a link, not a plain file, or too large), so it was left alone." };
      text = r.text;
    } else {
      if (!existsSync(f)) return { raw: [] };
      try { text = readFileSync(f, "utf8"); } catch (e) { return { raw: [], problem: `The memory file could not be read (${(e as NodeJS.ErrnoException).code ?? "error"}), so it was left alone.` }; }
    }
    const raw: Raw[] = text.split("\n").map((line): Raw => {
      const m = LINE.exec(line);
      if (m) return { kind: "entry", entry: { id: m[4] ?? idFor(m[1]), text: m[1], source: m[2], date: m[3] }, hand: false };
      const bullet = /^- (.+?)\s*$/.exec(line);
      if (bullet) return { kind: "entry", entry: { id: idFor(bullet[1]), text: bullet[1], source: "you wrote it", date: "" }, hand: true };
      return { kind: "other", text: line };
    });
    while (raw.length && raw[raw.length - 1].kind === "other" && (raw[raw.length - 1] as { text: string }).text === "") raw.pop();
    return { raw };
  }

  private write(scope: Scope, raw: Raw[]) {
    const f = this.file(scope);
    if (scope === "project" && !companionDirUsable(this.o.project)) throw new Error("The project's .companion folder is a link, so nothing was written there.");
    const body = raw.map((r) => (r.kind === "other" ? r.text : r.hand ? `- ${r.entry.text}` : `- ${r.entry.text} — ${r.entry.source}, ${r.entry.date} {${r.entry.id}}`)).join("\n");
    const hasHead = raw.some((r) => r.kind === "other" && r.text.startsWith("# "));
    const out = (hasHead ? body : HEAD[scope] + "\n" + body).replace(/\n*$/, "\n");
    mkdirSync(dirname(f), { recursive: true });
    writeAtomic(f, out, scope === "profile" ? 0o600 : 0o644);
    if (scope === "profile") { try { chmodSync(f, 0o600); } catch { /* best effort */ } }
  }

  list(scope: Scope): ListResult {
    const { raw, problem } = this.read(scope);
    this.prefs();
    const problems = [...(problem ? [problem] : []), ...(this.damagedNote ? ["Companion's memory settings file was damaged, so learning is paused. The old file was kept as memory-settings.damaged.json. Turn learning back on to start it again."] : [])];
    return { entries: raw.filter((r): r is Extract<Raw, { kind: "entry" }> => r.kind === "entry").map((r) => r.entry), problems };
  }

  // Only a missing file means the usual choices. A file that is there but cannot be read or understood (cut short, edited by
  // hand, unreadable for a moment) must not switch learning back on or bring forgotten lines back: learning is paused until the
  // person turns it back on, the file is kept as memory-settings.damaged.json, and the memory page says so.
  private damagedNote = false;
  private prefs(): Prefs {
    const f = this.settings();
    try {
      const j = JSON.parse(readFileSync(f, "utf8"));
      if (!j || typeof j !== "object" || Array.isArray(j)) throw new Error("not an object");
      this.damagedNote = false;
      // A file from before the choice: the old switch off is off, on (or nothing) is reasons and a question, as it was.
      const explainMode: ExplainMode = (EXPLAIN_MODES as readonly string[]).includes(j.explainMode) ? j.explainMode : j.explain === false ? "off" : "reasonsAndQuestion";
      return { paused: j.paused === true, forgotten: j.forgotten && typeof j.forgotten === "object" ? j.forgotten : {}, agents: j.agents && typeof j.agents === "object" ? j.agents : {}, explain: explainMode !== "off", explainMode };
    } catch (e) {
      const usual: Prefs = { paused: false, forgotten: {}, agents: {}, explain: true, explainMode: "reasonsAndQuestion" };
      if ((e as NodeJS.ErrnoException).code === "ENOENT") { this.damagedNote = false; return usual; }
      this.damagedNote = true;
      const keep = join(this.o.profileDir, "memory-settings.damaged.json");
      try { if (!existsSync(keep)) copyFileSync(f, keep); } catch { /* the original is still where it was */ }
      return { ...usual, paused: true };
    }
  }
  // Whether the person said yes or no to Companion adding its block to their own AGENTS.md and CLAUDE.md.
  agentsChoice(): "approved" | "declined" | undefined { return this.prefs().agents[this.key("project")]; }
  setAgentsChoice(c: "approved" | "declined" | undefined) { const p = this.prefs(), k = this.key("project"); const { [k]: _old, ...rest } = p.agents; this.savePrefs({ ...p, agents: c ? { ...rest, [k]: c } : rest }); }
  private savePrefs(p: Prefs) {
    mkdirSync(this.o.profileDir, { recursive: true });
    writeAtomic(this.settings(), JSON.stringify(p), 0o600);
  }
  // A line that was forgotten stays forgotten: it is not learned again from the same file or the same words.
  private key(scope: Scope) { return scope === "profile" ? "profile" : "project:" + createHash("sha256").update(this.o.project).digest("hex").slice(0, 12); }
  // Explain after a task (the setting explain.mode): reasons and a check question unless the person chooses otherwise.
  explainMode(): ExplainMode { return this.prefs().explainMode; }
  explainEnabled(): boolean { return this.explainMode() !== "off"; }
  setExplainMode(mode: ExplainMode) { this.savePrefs({ ...this.prefs(), explainMode: mode, explain: mode !== "off" }); }
  isPaused(): boolean { return this.prefs().paused; }
  setPaused(paused: boolean) { this.savePrefs({ ...this.prefs(), paused }); }

  add(scope: Scope, text: string, source: string, now: Date = new Date()): AddResult {
    if (this.isPaused()) return { ok: false, reason: "Learning is paused." };
    const t = oneLine(text), src = oneLine(source).replace(/[,{}]/g, " ").replace(/\s+/g, " ").trim().slice(0, 80) || "Companion";
    const s = screenLine(t);
    if (!s.ok) return s;
    if (/ — .+, \d{4}-\d{2}-\d{2}|\{m_[a-z0-9]+\}/.test(t) || t.startsWith("- ")) return { ok: false, reason: "That text has a format Companion uses itself." };
    const { raw, problem } = this.read(scope);
    if (problem) return { ok: false, reason: problem };
    if ((this.prefs().forgotten[this.key(scope)] ?? []).includes(idFor(t))) return { ok: false, reason: "You asked me to forget that." };
    const dup = raw.find((r) => r.kind === "entry" && r.entry.text.toLowerCase() === t.toLowerCase());
    if (dup && dup.kind === "entry") return { ok: true, entry: dup.entry };
    const entry: Entry = { id: idFor(t), text: t, source: src, date: now.toISOString().slice(0, 10) };
    raw.push({ kind: "entry", entry, hand: false });
    this.write(scope, scope === "profile" ? trim(raw, PROFILE_CAP) : raw);
    return { ok: true, entry };
  }

  forget(scope: Scope, id: string): Plain {
    const { raw, problem } = this.read(scope);
    if (problem) return { ok: false, reason: problem };
    const at = raw.findIndex((r) => r.kind === "entry" && r.entry.id === id);
    if (at < 0) return { ok: false, reason: "That line is not in memory." };
    const gone = (raw[at] as Extract<Raw, { kind: "entry" }>).entry.id;
    raw.splice(at, 1);
    this.write(scope, raw);
    const p = this.prefs(), k = this.key(scope);
    this.savePrefs({ ...p, forgotten: { ...p.forgotten, [k]: [...new Set([...(p.forgotten[k] ?? []), gone])].slice(-500) } });
    return { ok: true };
  }

  edit(scope: Scope, id: string, text: string, now: Date = new Date()): Plain {
    const t = oneLine(text), s = screenLine(t);
    if (!s.ok) return s;
    const { raw, problem } = this.read(scope);
    if (problem) return { ok: false, reason: problem };
    const at = raw.findIndex((r) => r.kind === "entry" && r.entry.id === id);
    if (at < 0) return { ok: false, reason: "That line is not in memory." };
    raw[at] = { kind: "entry", hand: false, entry: { id: idFor(t), text: t, source: "you edited it", date: now.toISOString().slice(0, 10) } };
    this.write(scope, raw);
    return { ok: true };
  }

  eraseAll(scope: Scope): Plain {
    if (scope === "project" && this.o.project && !companionDirUsable(this.o.project)) return { ok: false, reason: "The project's .companion folder is a link, so nothing was erased there." };
    try {
      rmSync(this.file(scope), { force: true });
      const p = this.prefs(), k = this.key(scope);
      if (p.forgotten[k]) { const { [k]: _gone, ...rest } = p.forgotten; this.savePrefs({ ...p, forgotten: rest }); }
      return { ok: true };
    } catch (e) { return { ok: false, reason: `Could not erase (${(e as Error).message}).` }; }
  }

  // What an agent is told, newest first within each part, the profile ahead of the project, cut to a number of words.
  forAgent(maxWords = 1500): string {
    const part = (title: string, scope: Scope) => {
      const e = this.list(scope).entries.slice().reverse();
      return { title, lines: e.map((x) => `- ${x.text}`) };
    };
    const parts = [part("How this person likes to work:", "profile"), part("About this project:", "project")];
    let used = 0;
    const out: string[] = [];
    for (const p of parts) {
      const keep: string[] = [];
      for (const l of p.lines) { const w = l.split(/\s+/).length; if (used + w > maxWords) break; used += w; keep.push(l); }
      if (keep.length) out.push(p.title, ...keep);
    }
    return out.join("\n");
  }

  exportText(): string {
    const fmt = (title: string, scope: Scope) => {
      const e = this.list(scope).entries;
      return [`## ${title}`, ...(e.length ? e.map((x) => `- ${x.text} (from ${x.source}${x.date ? `, ${x.date}` : ""})`) : ["- Nothing yet."])].join("\n");
    };
    return `# Everything Companion remembers\n\n${fmt("About this project", "project")}\n\n${fmt("How you like to work", "profile")}\n`;
  }
}

// Oldest lines go first; text a person wrote by hand is kept whenever anything else can go instead.
function trim(raw: Raw[], cap: number): Raw[] {
  const entries = raw.filter((r) => r.kind === "entry");
  let over = entries.length - cap;
  if (over <= 0) return raw;
  const drop = new Set<Raw>();
  for (const pass of [false, true]) for (const r of entries) { if (over <= 0) break; if (r.kind === "entry" && r.hand === pass && !drop.has(r)) { drop.add(r); over--; } }
  return raw.filter((r) => !drop.has(r));
}
