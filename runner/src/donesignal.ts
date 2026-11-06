// M75 (roadmap 19, F30): review the moment the other AI tool says it is done. With the person's yes on a card that shows
// exactly what is written where, Squibby adds one Stop hook to the project's own settings file of that tool:
//  - Claude Code: <project>/.claude/settings.local.json (code.claude.com/docs/en/hooks: "Stop" has no matcher and fires
//    each time Claude finishes responding; exit code 2 would keep it going, so the command always exits 0).
//  - Codex: <project>/.codex/hooks.json (Codex's lifecycle hooks, the same shape; a new project hook runs only after the
//    person trusts it with /hooks, and a Stop hook that exits 0 must print JSON, so the command prints {}). Codex's
//    `notify` is not used: it is user level only, takes one program, and hands it the turn's words.
// The hook's command only touches an empty file named by a random token in Squibby's own data folder. It never reads its
// input (the turn's JSON, with the last message in it), so no content travels (rules 5 and 6): only "done in this folder".
// Nothing here runs git or writes the person's git (rule 10). Every other line of the file is kept as it was, a file that is
// not plain JSON is refused and left alone, and Remove takes out only Squibby's own entry (found by its marker path).
import { existsSync, lstatSync, mkdirSync, readFileSync, readdirSync, rmdirSync, rmSync, statSync, watch as fsWatch } from "node:fs";
import { basename, join, resolve } from "node:path";
import { randomBytes } from "node:crypto";
import { writeAtomic } from "./atomic.ts";
import { PRODUCT } from "./names.ts";

export const DONE_TOOLS = ["claude", "codex"] as const;
export type DoneTool = (typeof DONE_TOOLS)[number];
/** Where each tool's project hook file lives, from the project folder down. */
export const HOOK_FILE: Readonly<Record<DoneTool, string>> = { claude: ".claude/settings.local.json", codex: ".codex/hooks.json" };
/** The folder in Squibby's data folder the hooks touch, and the file that names each project's token. */
export const DONE_DIR = "done";
export const DONE_INDEX = "done-signals.json";
const TOKEN = /^[0-9a-f]{24}$/;

/** A path inside single quotes for /bin/sh: a quote in it is closed, escaped and opened again. */
const shQuote = (s: string) => `'${s.replace(/'/g, `'\\''`)}'`;
/** The hook's whole command. It touches the marker, says nothing on error, prints {} and always ends with 0. */
export const hookCommand = (marker: string): string => `/usr/bin/touch -- ${shQuote(marker)} 2>/dev/null; printf '{}'`;
/** The entry added to the file's hooks.Stop list. */
export const hookEntry = (marker: string) => ({ hooks: [{ type: "command", command: hookCommand(marker) }] });

type Json = Record<string, unknown>;
const isObj = (v: unknown): v is Json => !!v && typeof v === "object" && !Array.isArray(v);
/** Whether a Stop entry is Squibby's own: one of its commands names this marker. */
const ours = (entry: unknown, marker: string): boolean =>
  isObj(entry) && Array.isArray(entry.hooks) && entry.hooks.some((h) => isObj(h) && typeof h.command === "string" && h.command.includes(marker));
/** Whether a Stop entry is any Squibby signal (any marker in this data folder), for a token that changed. */
const anyOurs = (entry: unknown, dir: string): boolean =>
  isObj(entry) && Array.isArray(entry.hooks) && entry.hooks.some((h) => isObj(h) && typeof h.command === "string" && h.command.includes(`${dir}/`) && h.command.startsWith("/usr/bin/touch -- "));

export const NOT_JSON = (file: string) => `${file} is not in a form ${PRODUCT} can change safely, so nothing was written. Nothing in it was changed.`;
export const NOT_A_FOLDER = "That folder could not be found, so nothing was written.";

/** Reads the hook file: null when there is none, the object when it is plain JSON, or "bad" for anything else. */
function readHooks(file: string): Json | null | "bad" {
  let text: string;
  try { if (!lstatSync(file).isFile()) return "bad"; text = readFileSync(file, "utf8"); } catch (e) { return (e as NodeJS.ErrnoException).code === "ENOENT" ? null : "bad"; }
  if (!text.trim()) return {};
  try { const j = JSON.parse(text); return isObj(j) ? j : "bad"; } catch { return "bad"; }
}

type Rec = { token: string; made?: DoneTool[]; folders?: DoneTool[] };
export type DonePlan = { tool: DoneTool; file: string; rel: string; on: boolean; creates: boolean; adds: string; problem?: string };

/** The tokens of each project, kept in Squibby's own data folder. One random token per project, made when first needed. */
export class DoneSignals {
  private dir: string;
  private index: string;
  private w: { close(): void } | null = null;
  constructor(private data: string, private o: { onDone?: (project: string) => void; watch?: typeof fsWatch } = {}) {
    this.dir = join(resolve(data), DONE_DIR);
    this.index = join(resolve(data), DONE_INDEX);
  }
  private read(): Record<string, Rec> {
    try { const j = JSON.parse(readFileSync(this.index, "utf8")); return isObj(j) ? (j as never) : {}; } catch { return {}; }
  }
  private save(all: Record<string, Rec>) {
    mkdirSync(resolve(this.data), { recursive: true, mode: 0o700 });
    writeAtomic(this.index, JSON.stringify(all, null, 2), 0o600);
  }
  /** The marker file the project's hook touches (made with a new token if there is none yet). */
  markerFor(project: string, make = true): string | null {
    const p = resolve(project), all = this.read();
    let t = all[p]?.token;
    if (!t || !TOKEN.test(t)) {
      if (!make) return null;
      t = randomBytes(12).toString("hex");
      all[p] = { token: t, made: all[p]?.made ?? [], folders: all[p]?.folders ?? [] };
      this.save(all);
    }
    return join(this.dir, t);
  }
  /** The project a marker's file name belongs to, or null. */
  projectOf(name: string): string | null {
    if (!TOKEN.test(name)) return null;
    for (const [p, v] of Object.entries(this.read())) if (v.token === name) return p;
    return null;
  }

  /** What would be written, or what is there, for one tool: the exact entry the card shows before the yes. */
  plan(project: string, tool: DoneTool): DonePlan {
    const p = resolve(project), rel = HOOK_FILE[tool], file = join(p, rel);
    const marker = this.markerFor(p, false) ?? join(this.dir, "<made when you say yes>");
    const adds = JSON.stringify({ hooks: { Stop: [hookEntry(marker)] } }, null, 2);
    const now = readHooks(file);
    const on = isObj(now) && this.isOn(now, p);
    const base: DonePlan = { tool, file, rel, on, creates: now === null, adds };
    return now === "bad" ? { ...base, problem: NOT_JSON(rel) } : base;
  }
  private isOn(j: Json, project: string): boolean {
    const m = this.markerFor(project, false);
    const stop = isObj(j.hooks) && Array.isArray(j.hooks.Stop) ? j.hooks.Stop : [];
    return !!m && stop.some((e) => ours(e, m));
  }

  /** Adds the hook after the person's yes. Every other key and hook stays. Adding twice adds once. */
  add(project: string, tool: DoneTool): DonePlan {
    const p = resolve(project);
    try { if (!statSync(p).isDirectory()) return { ...this.plan(p, tool), problem: NOT_A_FOLDER }; } catch { return { ...this.plan(p, tool), problem: NOT_A_FOLDER }; }
    const rel = HOOK_FILE[tool], file = join(p, rel);
    const now = readHooks(file);
    if (now === "bad") return { ...this.plan(p, tool), problem: NOT_JSON(rel) };
    const marker = this.markerFor(p)!;
    try { mkdirSync(this.dir, { recursive: true, mode: 0o700 }); } catch { /* start() makes it too */ }
    const j: Json = now ?? {};
    const hooks: Json = isObj(j.hooks) ? { ...j.hooks } : {};
    if (j.hooks !== undefined && !isObj(j.hooks)) return { ...this.plan(p, tool), problem: NOT_JSON(rel) };
    const stop: unknown[] = Array.isArray(hooks.Stop) ? [...hooks.Stop] : [];
    if (hooks.Stop !== undefined && !Array.isArray(hooks.Stop)) return { ...this.plan(p, tool), problem: NOT_JSON(rel) };
    // Already there: nothing to write. An older Squibby entry (a token made again after Delete everything) is replaced,
    // never left beside the new one.
    if (stop.some((e) => ours(e, marker))) return this.plan(p, tool);
    hooks.Stop = [...stop.filter((e) => !anyOurs(e, this.dir)), hookEntry(marker)];
    const folder = join(p, rel.split("/")[0]!);
    const madeFolder = !existsSync(folder);
    mkdirSync(folder, { recursive: true });
    writeAtomic(file, JSON.stringify({ ...j, hooks }, null, 2) + "\n", "keep");
    // Remember what Squibby made itself, so Remove can take away a file or folder that held nothing else.
    const all = this.read(), rec = all[p]!;
    all[p] = { ...rec, made: now === null ? [...new Set([...(rec.made ?? []), tool])] : rec.made ?? [], folders: madeFolder ? [...new Set([...(rec.folders ?? []), tool])] : rec.folders ?? [] };
    this.save(all);
    return this.plan(p, tool);
  }

  /** Removes only Squibby's own entry. A file Squibby made and that is now empty is removed, and its folder if it made it. */
  remove(project: string, tool: DoneTool): DonePlan {
    const p = resolve(project), rel = HOOK_FILE[tool], file = join(p, rel);
    const now = readHooks(file);
    if (now === "bad") return { ...this.plan(p, tool), problem: NOT_JSON(rel) };
    if (now && isObj(now.hooks) && Array.isArray(now.hooks.Stop)) {
      const hooks: Json = { ...now.hooks };
      const stop = (hooks.Stop as unknown[]).filter((e) => !anyOurs(e, this.dir));
      if (stop.length) hooks.Stop = stop; else delete hooks.Stop;
      const out: Json = { ...now };
      if (Object.keys(hooks).length) out.hooks = hooks; else delete out.hooks;
      const all = this.read(), rec = all[p];
      const folder = join(p, rel.split("/")[0]!);
      if (Object.keys(out).length === 0 && rec?.made?.includes(tool)) {
        rmSync(file, { force: true });
        if (rec.folders?.includes(tool)) { try { if (readdirSync(folder).length === 0) rmdirSync(folder); } catch { /* not empty, or gone */ } }
      } else writeAtomic(file, JSON.stringify(out, null, 2) + "\n", "keep");
      if (rec) { all[p] = { ...rec, made: (rec.made ?? []).filter((t) => t !== tool), folders: (rec.folders ?? []).filter((t) => t !== tool) }; this.save(all); }
    }
    return this.plan(p, tool);
  }

  /** The two tools' state for a project, for the Settings rows. */
  state(project: string): DonePlan[] { return DONE_TOOLS.map((t) => this.plan(project, t)); }

  /** Starts listening to Squibby's own done folder (only that folder). Markers left from while Squibby was closed are
   *  removed first: changes made then are the "changed while closed" batch's, not a signal. */
  start(): boolean {
    if (this.w) return true;
    try { mkdirSync(this.dir, { recursive: true, mode: 0o700 }); } catch { return false; }
    for (const n of this.names()) this.take(n, false);
    try {
      const w = (this.o.watch ?? fsWatch)(this.dir, (_ev, name) => { if (name) this.take(basename(String(name)), true); });
      w.on?.("error", () => { /* the folder went away */ });
      this.w = { close: () => w.close() };
    } catch { return false; }
    return true;
  }
  stop() { try { this.w?.close(); } catch { /* closed */ } this.w = null; }
  private names(): string[] { try { return readdirSync(this.dir); } catch { return []; } }
  /** A marker arrived: it is removed, and its project is told. Anything else in the folder is left alone. */
  private take(name: string, tell: boolean) {
    if (!TOKEN.test(name)) return;
    const f = join(this.dir, name);
    if (!existsSync(f)) return;
    try { rmSync(f, { force: true }); } catch { /* gone already */ }
    const p = this.projectOf(name);
    if (tell && p) this.o.onDone?.(p);
  }
}
