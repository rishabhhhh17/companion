// Shadow snapshots: Companion's own undo. Never writes the user's git (F13).
//
// One private git repository per project, kept OUTSIDE the project. Every git
// call uses GIT_DIR=<shadow> and GIT_WORK_TREE=<project> with a temporary
// index, so the user's .git, index, branches and history are never read for
// writing. A project that is not a git project never gets a .git.

import { chmodSync, copyFileSync, existsSync, lstatSync, mkdirSync, readdirSync, readFileSync, realpathSync, rmSync, rmdirSync, statSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { randomBytes } from "node:crypto";
import { RULES_FILE } from "./rules.ts";

export type Skipped = { path: string; reason: string };
export type Checkpoint = { id: string; commit: string; label: string; files: number; skipped: Skipped[]; createdAt: string; envFiles: string[] };
// recovered: big live files (over 2 MiB, which a checkpoint cannot hold) that undo replaced, copied to <shadow>/recovered/<safety id>/.
// largeLeftAlone: big files undo did not touch (the checkpoint only holds an older small version, or there was no room to copy aside).
export type RestoreResult = { restored: string; safetyCheckpoint: string; envRestored: string[]; leftAlone: string[]; recovered: string[]; largeLeftAlone: string[] };
// Undoing one task in the middle (from the version before it to the version after it), against the project as it is now.
// conflicts: files that one task changed and later work changed again, or that cannot be written safely; any conflict means
// the task can only be shown, never undone on its own, so nothing done after it is lost.
export type Changed = { file: string; kind: "added" | "modified" | "deleted" };
export type UndoOnePlan = { safe: boolean; changed: Changed[]; env: string[]; conflicts: string[]; reason?: string };
export type UndoOneResult = { safetyCheckpoint: string; reverted: string[]; env: string[] };
/** Undoing one task stopped partway (after something was written): the version from just before it is in safetyCheckpoint. */
export class UndoOneError extends Error { constructor(message: string, readonly safetyCheckpoint?: string) { super(message); } }
const MAX_UNDO_ONE_FILES = 1000;

const MAX_NEW_FILE_BYTES = 2 * 1024 * 1024;
const GIT_TIMEOUT_MS = 5 * 60_000;   // a snapshot that has not finished in five minutes is stuck, not slow
const DEFAULT_EXCLUDES = [
  "node_modules/", ".next/", "dist/", "build/", ".turbo/", ".cache/", "__pycache__/", ".venv/", "venv/", "target/", "coverage/", ".DS_Store",
  ".claude/.cc-writes",   // Claude Code's own write tracking, not the user's work
];
// The person's own house rules (rules.ts RULES_FILE), changed only from Settings. They are not a task's work, so no Undo
// ever changes them: putting a version back, or undoing one task, leaves the file exactly as it is now, there or not (T16).
// They stay in every snapshot, so a copy of an earlier version (a before picture, which task broke it) still has them.
const KEPT_ON_UNDO: readonly string[] = [RULES_FILE];
const ENV_SKIP_DIRS = new Set(["node_modules", ".git", ".next", "dist", "build", ".turbo", ".cache", "target", "venv", ".venv", "__pycache__", "coverage"]);

const stores = new Map<string, CheckpointStore>();

// git is Apple's, and a new Mac asks to install it the first time it is used. Say what to do, in plain words.
export const NEEDS_GIT = "Companion needs Apple's free developer tools to keep a safe copy of your project. Open Terminal, type  xcode-select --install  and press Return. When it finishes, try again.";
const friendly = (e: unknown): Error => {
  const m = String((e as Error)?.message ?? e);
  return /xcode-select|developer tools|Executable not found|ENOENT|not found in \$PATH|spawn git/i.test(m) ? new Error(NEEDS_GIT) : (e as Error);
};

export class CheckpointStore {
  /** One store per project for the whole program, so two jobs can never take a snapshot at the same moment. */
  static shared(shadowDir: string, projectDir: string): CheckpointStore {
    const key = `${resolve(shadowDir)}|${resolve(projectDir)}`;
    let s = stores.get(key);
    if (!s) { s = new CheckpointStore(shadowDir, projectDir); stores.set(key, s); }
    return s;
  }
  readonly shadowDir: string;
  readonly projectDir: string;
  private queue: Promise<unknown> = Promise.resolve();

  private recoveryBudget: number;
  private maxFiles: number;
  /** How long one git step of a snapshot may take: five minutes, doubled by "my internet is slow" (set by the runner). */
  gitTimeoutMs = GIT_TIMEOUT_MS;
  constructor(shadowDir: string, projectDir: string, opts: { recoveryBudgetBytes?: number; maxFiles?: number } = {}) {
    this.recoveryBudget = opts.recoveryBudgetBytes ?? 2 * 1024 * 1024 * 1024;
    this.maxFiles = opts.maxFiles ?? 150_000;
    this.shadowDir = resolve(shadowDir);
    this.projectDir = resolve(projectDir);
    this.assertSensible();
    const rel = relative(this.projectDir, this.shadowDir);
    if (rel === "" || (!rel.startsWith("..") && !rel.startsWith(sep))) {
      throw new Error("The shadow store must live outside the project folder");
    }
  }

  // Operations run one at a time per project.
  private serial<T>(fn: () => Promise<T>): Promise<T> {
    const run = this.queue.then(fn, fn);
    this.queue = run.catch(() => undefined);
    return run;
  }

  snapshot(label: string): Promise<Checkpoint> { return this.serial(() => this.snapshotNow(label)).catch((e) => { throw friendly(e); }); }
  restore(id: string): Promise<RestoreResult> { return this.serial(() => this.restoreNow(id)).catch((e) => { throw friendly(e); }); }
  readFiles(id: string, keep: (path: string) => boolean, maxBytes = 200_000): Promise<Record<string, string>> { return this.serial(() => this.readFilesNow(id, keep, maxBytes)); }
  /** An id of the content of selected files at a checkpoint (the same content gives the same id), without reading them. */
  fileIds(id: string, keep: (path: string) => boolean): Promise<Record<string, string>> {
    return this.serial(async () => {
      const m = this.readMeta(id);
      if (!m) throw new Error(`Unknown checkpoint: ${id}`);
      const out: Record<string, string> = {};
      for (const row of (await this.git(["ls-tree", "-r", "-z", m.commit])).split("\0")) {
        const tab = row.indexOf("\t");
        if (tab < 0) continue;
        const path = row.slice(tab + 1), oid = row.slice(0, tab).split(" ")[2];
        if (path && oid && keep(path)) out[path] = oid;
      }
      return out;
    });
  }
  diff(fromId: string, toId: string): Promise<{ file: string; kind: "added" | "modified" | "deleted" }[]> { return this.serial(() => this.diffNow(fromId, toId)); }
  /** Copy the project as it was at a checkpoint (its private .env copies too) into an empty folder outside the project,
   *  for the "before" picture of a visual receipt. The project itself is never touched. */
  exportTo(id: string, dir: string): Promise<void> { return this.serial(() => this.exportNow(id, dir)); }
  list(): Promise<Checkpoint[]> { return this.serial(async () => this.refs().map((r) => this.readMeta(r.id)!).filter(Boolean)); }
  /** Do two saved versions hold different files, counting the private .env copies kept beside them (usually not in the saved files)? */
  differs(fromId: string, toId: string): Promise<boolean> {
    return this.serial(async () => {
      if ((await this.diffNow(fromId, toId)).length > 0) return true;
      const a = this.readMeta(fromId)!, b = this.readMeta(toId)!;
      return [...new Set([...a.envFiles, ...b.envFiles])].some((rel) => { const [x, y] = [this.envCopy(fromId, rel), this.envCopy(toId, rel)]; return !(x === y || (x && y && x.equals(y))); });
    });
  }
  /** Could the one task that went from `fromId` to `toId` be undone on its own, given the project as saved in `nowId`? Writes nothing. */
  undoOnePlan(fromId: string, toId: string, nowId: string): Promise<UndoOnePlan> { return this.serial(() => this.planOneNow(fromId, toId, nowId)); }
  /** Undo only that task: save the project first (so this is undoable too), check again against that, then put back only the
   *  files that task changed. Refuses, changing nothing, if later work changed any of them. */
  undoOne(fromId: string, toId: string, label: string): Promise<UndoOneResult> { return this.serial(() => this.undoOneNow(fromId, toId, label)).catch((e) => { throw e instanceof UndoOneError ? e : friendly(e); }); }

  // ---------- git plumbing ----------

  private env(index?: string): Record<string, string> {
    const e: Record<string, string> = {};
    for (const [k, v] of Object.entries(process.env)) if (v !== undefined && !k.startsWith("GIT_")) e[k] = v;
    Object.assign(e, {
      GIT_DIR: this.shadowDir, GIT_WORK_TREE: this.projectDir,
      GIT_CONFIG_GLOBAL: "/dev/null", GIT_CONFIG_SYSTEM: "/dev/null", GIT_TERMINAL_PROMPT: "0",
      GIT_AUTHOR_NAME: "Companion", GIT_AUTHOR_EMAIL: "companion@localhost",
      GIT_COMMITTER_NAME: "Companion", GIT_COMMITTER_EMAIL: "companion@localhost",
    });
    if (index) e.GIT_INDEX_FILE = index;
    return e;
  }

  private async git(args: string[], opts: { index?: string } = {}): Promise<string> {
    const p = Bun.spawn(["git", "-c", "core.quotepath=off", ...args], { cwd: this.projectDir, env: this.env(opts.index), stdout: "pipe", stderr: "pipe", timeout: this.gitTimeoutMs });
    const [out, err] = await Promise.all([new Response(p.stdout).text(), new Response(p.stderr).text()]);
    const code = await p.exited;
    if (code !== 0) throw new Error(`git ${args.join(" ")} failed: ${err.trim()}`);
    return out;
  }

  private async gitFull(args: string[], opts: { index?: string } = {}): Promise<{ out: string; err: string; code: number }> {
    const p = Bun.spawn(["git", "-c", "core.quotepath=off", ...args], { cwd: this.projectDir, env: this.env(opts.index), stdout: "pipe", stderr: "pipe", timeout: this.gitTimeoutMs });
    const [out, err] = await Promise.all([new Response(p.stdout).text(), new Response(p.stderr).text()]);
    return { out, err, code: await p.exited };
  }

  // Folders that have their own git history (a project inside a project, or a submodule). Undo cannot cover them.
  private findNestedGit(): string[] {
    const found: string[] = [];
    const walk = (dir: string, depth: number) => {
      if (depth > 4) return;
      let names: string[];
      try { names = readdirSync(dir); } catch { return; }
      for (const name of names) {
        if (name === ".git" || ENV_SKIP_DIRS.has(name)) continue;
        const p = join(dir, name);
        let st; try { st = lstatSync(p); } catch { continue; }
        if (!st.isDirectory()) continue;
        if (existsSync(join(p, ".git"))) { found.push(relative(this.projectDir, p)); continue; }
        walk(p, depth + 1);
      }
    };
    walk(this.projectDir, 0);
    return found.sort();
  }

  // Is any folder on the way to this path a link? A link could lead outside the project, and Companion must never write or delete through one.
  private hasLinkOnTheWay(abs: string): boolean {
    let dir = dirname(abs);
    while (dir.length > this.projectDir.length && dir.startsWith(this.projectDir + sep)) {
      try { if (lstatSync(dir).isSymbolicLink()) return true; } catch { /* gone */ }
      dir = dirname(dir);
    }
    return false;
  }

  private ensureInit() {
    if (existsSync(join(this.shadowDir, "HEAD"))) return;
    mkdirSync(this.shadowDir, { recursive: true });
    const p = Bun.spawnSync(["git", "init", "--bare", "-q", this.shadowDir], { env: { PATH: process.env.PATH ?? "", HOME: process.env.HOME ?? "", GIT_CONFIG_GLOBAL: "/dev/null", GIT_CONFIG_SYSTEM: "/dev/null" } });
    if (p.exitCode !== 0) throw new Error(`could not create the shadow store: ${p.stderr.toString()}`);
    for (const [k, v] of [["core.autocrlf", "false"], ["core.symlinks", "true"], ["core.fileMode", "true"], ["gc.auto", "0"]]) {
      Bun.spawnSync(["git", "--git-dir", this.shadowDir, "config", k, v], { env: { PATH: process.env.PATH ?? "", HOME: process.env.HOME ?? "", GIT_CONFIG_GLOBAL: "/dev/null", GIT_CONFIG_SYSTEM: "/dev/null" } });
    }
    mkdirSync(join(this.shadowDir, "meta"), { recursive: true });
  }

  // Companion's excludes, plus the project's own .git/info/exclude (read only).
  // Undo must give back every byte: whatever the project's own .gitattributes asks for (line ending changes, filters) is switched off in the safe copy.
  private writeAttributes() {
    mkdirSync(join(this.shadowDir, "info"), { recursive: true });
    writeFileSync(join(this.shadowDir, "info", "attributes"), "* -text -eol -ident -filter -working-tree-encoding\n");
  }

  private assertSensible() {
    let real: string;
    try { real = realpathSync(this.projectDir); } catch { throw new Error("That project folder is not there any more."); }
    const home = (() => { try { return realpathSync(homedir()); } catch { return homedir(); } })();
    if (real === "/" || real === home || ["/System", "/usr", "/bin", "/sbin", "/etc", "/private/etc", "/Library", "/Applications", "/Users"].includes(real)) {
      throw new Error("That folder is too broad to keep a safe copy of. Choose the folder of one project.");
    }
  }

  private writeExcludes() {
    let extra = "";
    const own = join(this.projectDir, ".git", "info", "exclude");
    try { if (existsSync(own)) extra = readFileSync(own, "utf8"); } catch { /* unreadable: ignore */ }
    mkdirSync(join(this.shadowDir, "info"), { recursive: true });
    writeFileSync(join(this.shadowDir, "info", "exclude"), DEFAULT_EXCLUDES.join("\n") + "\n" + extra);
  }

  private refs(): { id: string; n: number; ref: string }[] {
    const dir = join(this.shadowDir, "refs", "cp");
    if (!existsSync(dir)) return [];
    return readdirSync(dir).filter((f) => /^\d+$/.test(f)).map((f) => ({ n: Number(f), id: `cp_${f.padStart(4, "0")}`, ref: `refs/cp/${f}` })).sort((a, b) => a.n - b.n);
  }

  private metaPath(id: string) { return join(this.shadowDir, "meta", id); }
  private readMeta(id: string): Checkpoint | null {
    try { return JSON.parse(readFileSync(join(this.metaPath(id), "meta.json"), "utf8")); } catch { return null; }
  }

  private tmpIndex(): string { return join(this.shadowDir, `index-tmp-${process.pid}-${randomBytes(4).toString("hex")}`); }

  // ---------- snapshot ----------

  private async snapshotNow(label: string): Promise<Checkpoint> {
    this.assertSensible();
    this.ensureInit();
    this.writeExcludes();
    this.writeAttributes();
    const idx = this.tmpIndex();
    try {
      const all = this.refs();
      const last = all[all.length - 1];
      const parent = last ? (await this.git(["rev-parse", last.ref])).trim() : null;
      if (parent) await this.git(["read-tree", parent], { index: idx });

      // Files over 2 MiB, new or grown, are skipped and reported, never silently saved. Folders with their own git history are
      // reported as not covered. Neither is allowed to break the snapshot.
      const skipped: Skipped[] = [];
      const excluded: string[] = [];
      const candidates = [
        ...(await this.git(["ls-files", "-z", "--others", "--exclude-standard"], { index: idx })).split("\0"),
        ...(await this.git(["ls-files", "-z", "-m"], { index: idx })).split("\0"),
      ].filter(Boolean);
      if (candidates.length > this.maxFiles) throw new Error(`This folder has too many files (${candidates.length.toLocaleString("en-US")}) to keep a safe copy of. Choose the folder of one project, not a folder that holds many.`);
      for (const rel of new Set(candidates)) {
        try {
          const st = lstatSync(join(this.projectDir, rel));
          if (st.isFile() && st.size > MAX_NEW_FILE_BYTES) { skipped.push({ path: rel, reason: `over 2 MiB (${(st.size / 1048576).toFixed(1)} MiB), so the earlier saved version is kept` }); excluded.push(rel); }
        } catch { /* vanished while scanning */ }
      }
      for (const rel of this.findNestedGit()) { skipped.push({ path: `${rel}/`, reason: "this folder has its own git history, so changes inside it are not covered by Undo" }); excluded.push(rel); }

      const addOnce = async (extra: string[]) => {
        const specFile = join(this.shadowDir, `pathspec-${process.pid}-${randomBytes(4).toString("hex")}`);
        try {
          writeFileSync(specFile, [".", ...[...excluded, ...extra].map((p) => `:(exclude,literal)${p}`)].join("\0") + "\0");
          return await this.gitFull(["add", "-A", "--ignore-errors", `--pathspec-from-file=${specFile}`, "--pathspec-file-nul"], { index: idx });
        } finally { rmSync(specFile, { force: true }); }
      };
      let added = await addOnce([]);
      if (added.code !== 0) {
        // Some file could not be read (permissions, a locked Docker volume). Leave it out, say so, and keep going.
        const unreadable = [...added.err.matchAll(/(?:open\("([^"]+)"\)|unable to index file '([^']+)'|could not open directory '([^']+?)\/?')/g)].map((m) => m[1] ?? m[2] ?? m[3]).filter(Boolean);
        if (unreadable.length === 0) throw new Error(`git add failed: ${added.err.trim()}`);
        for (const rel of new Set(unreadable)) skipped.push({ path: rel, reason: "could not be read, so it was left out of the saved state" });
        added = await addOnce(unreadable);
        if (added.code !== 0) throw new Error(`git add failed: ${added.err.trim()}`);
      }

      const tree = (await this.git(["write-tree"], { index: idx })).trim();
      const commitArgs = ["commit-tree", tree, ...(parent ? ["-p", parent] : []), "-m", label];
      const commit = (await this.git(commitArgs, { index: idx })).trim();
      const n = (last?.n ?? 0) + 1;
      await this.git(["update-ref", `refs/cp/${n}`, commit]);
      const id = `cp_${String(n).padStart(4, "0")}`;
      const files = (await this.git(["ls-tree", "-r", "--name-only", "-z", tree])).split("\0").filter(Boolean).length;
      const envFiles = this.saveEnvFiles(id);
      const cp: Checkpoint = { id, commit, label, files, skipped, createdAt: new Date().toISOString(), envFiles };
      mkdirSync(this.metaPath(id), { recursive: true });
      writeFileSync(join(this.metaPath(id), "meta.json"), JSON.stringify(cp));
      return cp;
    } finally {
      rmSync(idx, { force: true });
    }
  }

  // .env* files are normally ignored by git, so keep private (0600) copies per checkpoint.
  private findEnvFiles(): string[] {
    const found: string[] = [];
    const walk = (dir: string, depth: number) => {
      if (depth > 3) return;
      let names: string[];
      try { names = readdirSync(dir); } catch { return; }
      for (const name of names) {
        const p = join(dir, name);
        let st;
        try { st = lstatSync(p); } catch { continue; }          // a link is never followed or copied
        if (st.isDirectory()) { if (!ENV_SKIP_DIRS.has(name)) walk(p, depth + 1); }
        else if (st.isFile() && (name === ".env" || name.startsWith(".env."))) found.push(relative(this.projectDir, p));
      }
    };
    walk(this.projectDir, 0);
    return found.sort();
  }

  private saveEnvFiles(id: string): string[] {
    const files = this.findEnvFiles();
    for (const rel of files) {
      const dst = join(this.metaPath(id), "env", rel);
      mkdirSync(dirname(dst), { recursive: true, mode: 0o700 });
      copyFileSync(join(this.projectDir, rel), dst);
      chmodSync(dst, 0o600);
    }
    return files;
  }

  // Text of selected files as they were at a checkpoint (for comparing before and after). Only files (blobs) are read.
  private async readFilesNow(id: string, keep: (p: string) => boolean, maxBytes: number): Promise<Record<string, string>> {
    const m = this.readMeta(id);
    if (!m) throw new Error(`Unknown checkpoint: ${id}`);
    const names: string[] = [];
    for (const row of (await this.git(["ls-tree", "-r", "-z", m.commit])).split("\0")) {
      const tab = row.indexOf("\t");
      if (tab < 0 || row.slice(0, tab).split(" ")[1] !== "blob") continue;
      const n = row.slice(tab + 1);
      if (keep(n)) names.push(n);
      if (names.length >= 2000) break;
    }
    const out: Record<string, string> = {};
    for (const n of names) {
      const text = await this.readBlob(m.commit, n);
      if (text.length <= maxBytes) out[n] = text;
    }
    return out;
  }

  /** One saved file's text. git can fail now and then on a busy Mac: a read that failed is tried once more, and then is an
   *  error. Text from a failed read is never taken as the file's, because empty or cut off text would make the checks judge
   *  wrongly (a test file "emptied" that was not, a deleted one missed, packages "not installed" in a project that needs none). */
  private async readBlob(commit: string, path: string): Promise<string> {
    let why = "";
    for (let attempt = 0; attempt < 2; attempt++) {
      let r: { out: string; err: string; code: number };
      try { r = await this.gitFull(["cat-file", "blob", `${commit}:${path}`]); } catch (e) { why = String((e as Error).message ?? e).split("\n")[0]; continue; }   // git could not even be started
      if (r.code === 0) return r.out;
      why = r.err.trim().split("\n")[0] ?? "";
    }
    throw new Error(`Could not read ${path} from the saved version (${why || "git stopped"}).`);
  }

  private async exportNow(id: string, dir: string): Promise<void> {
    const m = this.readMeta(id);
    if (!m) throw new Error(`Unknown checkpoint: ${id}`);
    const target = resolve(dir);
    const rel = relative(this.projectDir, target);
    if (rel === "" || (!rel.startsWith("..") && !isAbsolute(rel))) throw new Error("The copy must go outside the project folder");
    if (!existsSync(target) || readdirSync(target).length > 0) throw new Error("The copy needs an empty folder");
    const p = Bun.spawn(["sh", "-c", 'git -c core.quotepath=off archive --format=tar "$1" | tar -x -C "$2"', "sh", m.commit, target], { cwd: this.projectDir, env: this.env(), stdout: "ignore", stderr: "pipe" });
    const err = await new Response(p.stderr).text();
    if ((await p.exited) !== 0) throw new Error(`Could not copy the earlier version: ${err.trim().slice(0, 200)}`);
    const envDir = join(this.metaPath(id), "env");
    for (const f of m.envFiles ?? []) {
      const src = join(envDir, f), dst = join(target, f);
      if (!existsSync(src)) continue;
      mkdirSync(dirname(dst), { recursive: true, mode: 0o700 });
      copyFileSync(src, dst); chmodSync(dst, 0o600);
    }
  }

  private async diffNow(fromId: string, toId: string) {
    const a = this.readMeta(fromId), b = this.readMeta(toId);
    if (!a || !b) throw new Error(`Unknown checkpoint: ${!a ? fromId : toId}`);
    const out = await this.git(["diff-tree", "-r", "--name-status", "--no-renames", "-z", a.commit, b.commit]);
    const parts = out.split("\0").filter(Boolean);
    const res: { file: string; kind: "added" | "modified" | "deleted" }[] = [];
    for (let i = 0; i + 1 < parts.length; i += 2) res.push({ file: parts[i + 1], kind: parts[i] === "A" ? "added" : parts[i] === "D" ? "deleted" : "modified" });
    return res.sort((x, y) => x.file.localeCompare(y.file));
  }

  // ---------- restore ----------

  private inProject(rel: string): string {
    const abs = resolve(this.projectDir, rel);
    const r = relative(this.projectDir, abs);
    if (r === "" || r.startsWith("..") || r.split(sep)[0] === ".git") throw new Error(`refusing to touch ${rel}`);
    return abs;
  }

  private async restoreNow(id: string): Promise<RestoreResult> {
    const target = this.refs().find((r) => r.id === id);
    const targetMeta = target ? this.readMeta(id) : null;
    if (!target || !targetMeta) throw new Error(`Unknown checkpoint: ${id}`);

    // Undo must itself be undoable: save the current state first.
    const safety = await this.snapshotNow(`Before undo to ${id}`);

    // A file too big for a checkpoint is never destroyed by undo. Where the checkpoint only holds an older small copy of a file
    // that was already too big when it was taken, the live file is left exactly as it is. Where undo really does mean to put
    // the older version back over a big live file, that file is copied aside first (and left alone if there is no room).
    const recovered: string[] = [], largeLeftAlone: string[] = [], keep: string[] = [...KEPT_ON_UNDO];
    const stale = new Set(targetMeta.skipped.filter((x) => !x.path.endsWith("/")).map((x) => x.path));
    let budget = this.recoveryBudget;
    for (const rel of (await this.git(["ls-tree", "-r", "--name-only", "-z", targetMeta.commit])).split("\0").filter(Boolean)) {
      let abs: string, st;
      try { abs = this.inProject(rel); st = lstatSync(abs); } catch { continue; }          // not there now: nothing to protect
      if (!st.isFile()) continue;
      if (stale.has(rel)) { keep.push(rel); largeLeftAlone.push(rel); continue; }
      if (st.size <= MAX_NEW_FILE_BYTES || this.hasLinkOnTheWay(abs)) continue;
      if (st.size <= budget) {
        const copy = join(this.shadowDir, "recovered", safety.id, rel);
        mkdirSync(dirname(copy), { recursive: true });
        copyFileSync(abs, copy);
        budget -= st.size; recovered.push(rel);
      } else { keep.push(rel); largeLeftAlone.push(rel); }
    }

    const idx = this.tmpIndex();
    try {
      await this.git(["read-tree", targetMeta.commit], { index: idx });
      if (keep.length) {
        const specFile = join(this.shadowDir, `keep-${process.pid}-${randomBytes(4).toString("hex")}`);
        try {
          writeFileSync(specFile, keep.map((p) => `:(literal)${p}`).join("\0") + "\0");
          await this.git(["rm", "--cached", "-f", "-q", "--ignore-unmatch", `--pathspec-from-file=${specFile}`, "--pathspec-file-nul"], { index: idx });
        } finally { rmSync(specFile, { force: true }); }
      }
      await this.git(["checkout-index", "-a", "-f"], { index: idx });
    } finally {
      rmSync(idx, { force: true });
    }

    // Remove what exists now but did not exist then. Never through a link: it could lead out of the project.
    const leftAlone: string[] = [];
    const added = (await this.git(["diff-tree", "-r", "--name-only", "--no-renames", "--diff-filter=A", "-z", targetMeta.commit, safety.commit]))
      .split("\0").filter((rel) => rel && !KEPT_ON_UNDO.includes(rel));
    for (const rel of added) {
      const abs = this.inProject(rel);
      if (this.hasLinkOnTheWay(abs)) { leftAlone.push(rel); continue; }
      rmSync(abs, { force: true, recursive: false });
      let dir = dirname(abs);
      while (dir !== this.projectDir && dir.startsWith(this.projectDir + sep)) {
        try { if (readdirSync(dir).length === 0) rmdirSync(dir); else break; } catch { break; }
        dir = dirname(dir);
      }
    }

    // .env files: put back the old ones, remove ones created since. Never write through a link.
    const envRestored: string[] = [];
    for (const rel of targetMeta.envFiles) {
      const src = join(this.metaPath(id), "env", rel);
      if (!existsSync(src)) continue;
      const dst = this.inProject(rel);
      if (this.hasLinkOnTheWay(dst)) { leftAlone.push(rel); continue; }
      mkdirSync(dirname(dst), { recursive: true });
      try { if (lstatSync(dst).isSymbolicLink()) rmSync(dst, { force: true }); } catch { /* not there */ }   // replace the link itself, not what it points at
      copyFileSync(src, dst);
      envRestored.push(rel);
    }
    for (const rel of safety.envFiles) {
      if (targetMeta.envFiles.includes(rel)) continue;
      const abs = this.inProject(rel);
      if (this.hasLinkOnTheWay(abs)) { leftAlone.push(rel); continue; }
      rmSync(abs, { force: true });
    }
    return { restored: id, safetyCheckpoint: safety.id, envRestored, leftAlone, recovered, largeLeftAlone };
  }

  // ---------- undo one task in the middle ----------

  private envCopy(id: string, rel: string): Buffer | null {
    try { return readFileSync(join(this.metaPath(id), "env", rel)); } catch { return null; }
  }

  private async planOneNow(fromId: string, toId: string, nowId: string): Promise<UndoOnePlan> {
    const a = this.readMeta(fromId), b = this.readMeta(toId), c = this.readMeta(nowId);
    if (!a || !b || !c) throw new Error(`Unknown checkpoint: ${!a ? fromId : !b ? toId : nowId}`);
    // What the task changed, with each file's kind (an ordinary file, a link, a folder with its own history).
    const parts = (await this.git(["diff-tree", "-r", "--no-renames", "-z", a.commit, b.commit])).split("\0");
    const changed: Changed[] = [], odd = new Set<string>();
    for (let i = 0; i + 1 < parts.length; i++) {
      if (!parts[i].startsWith(":")) continue;
      const [srcMode, dstMode, , , status] = parts[i].slice(1).split(" ");
      const file = parts[++i];
      if (!file || KEPT_ON_UNDO.includes(file)) continue;
      changed.push({ file, kind: status === "A" ? "added" : status === "D" ? "deleted" : "modified" });
      if ([srcMode, dstMode].some((m) => m === "120000" || m === "160000")) odd.add(file);
    }
    changed.sort((x, y) => x.file.localeCompare(y.file));
    // What changed after the task, up to now.
    const later = new Set((await this.git(["diff-tree", "-r", "--name-only", "--no-renames", "-z", b.commit, c.commit])).split("\0").filter(Boolean));
    // Files left out of a saved version (too big, or unreadable) and folders with their own git history, in any of the three.
    // Before the task counts too: such a file is missing from the version before it (so a task that shrank it looks like it
    // added it, and undo would delete it) or is there only as an older small copy (which undo would wrongly put back).
    const all = [...a.skipped, ...b.skipped, ...c.skipped];
    const files = all.filter((x) => !x.path.endsWith("/"));
    const big = new Set(files.filter((x) => String(x.reason ?? "").startsWith("over 2 MiB")).map((x) => x.path));
    const unsaved = new Set(files.map((x) => x.path).filter((p) => !big.has(p)));
    const ownGit = all.filter((x) => x.path.endsWith("/")).map((x) => x.path);
    const why: Record<"later" | "link" | "big" | "unsaved" | "git", string[]> = { later: [], link: [], big: [], unsaved: [], git: [] };
    const blocked = (rel: string): keyof typeof why | null => {
      if (later.has(rel)) return "later";
      if (big.has(rel)) return "big";
      if (unsaved.has(rel)) return "unsaved";
      if (ownGit.some((g) => rel.startsWith(g))) return "git";
      if (odd.has(rel)) return "link";
      try { if (this.hasLinkOnTheWay(this.inProject(rel))) return "link"; } catch { return "link"; }
      try { if (lstatSync(join(this.projectDir, rel)).isSymbolicLink()) return "link"; } catch { /* not there now */ }
      return null;
    };
    for (const ch of changed) { const k = blocked(ch.file); if (k) why[k].push(ch.file); }
    // .env files are kept beside each version (they are usually not in the saved files): a change to one counts too.
    const env: string[] = [];
    for (const rel of [...new Set([...a.envFiles, ...b.envFiles])].sort()) {
      const [ea, eb] = [this.envCopy(fromId, rel), this.envCopy(toId, rel)];
      if (ea === eb || (ea && eb && ea.equals(eb))) continue;
      env.push(rel);
      const ec = this.envCopy(nowId, rel);
      if (!(eb === null ? ec === null : ec !== null && eb.equals(ec))) { if (!why.later.includes(rel)) why.later.push(rel); continue; }
      try { if (this.hasLinkOnTheWay(this.inProject(rel)) || lstatSync(join(this.projectDir, rel)).isSymbolicLink()) why.link.push(rel); } catch { /* not there now: fine */ }
    }
    const conflicts = [...new Set([...why.later, ...why.link, ...why.big, ...why.unsaved, ...why.git])].sort();
    const names = (l: string[]) => (l.length <= 5 ? l.join(", ") : `${l.slice(0, 5).join(", ")} and ${l.length - 5} more`);
    const are = (l: string[]) => (l.length === 1 ? "is" : "are");
    let reason: string | undefined;
    if (why.later.length) reason = `Later work changed the same ${why.later.length === 1 ? "file" : "files"} (${names(why.later)}), so undoing this task on its own would lose that work.`;
    else if (why.link.length) reason = `${names(why.link)} ${are(why.link)} behind a link now, so Companion will not write there.`;
    else if (why.big.length) reason = `${names(why.big)} ${are(why.big)} too big to have a saved copy (over 2 MiB).`;
    else if (why.unsaved.length) reason = `${names(why.unsaved)} could not be read when a version was saved, so there is no copy to put back.`;
    else if (why.git.length) reason = `${names(why.git)} ${are(why.git)} inside a folder with its own git history, which Undo does not cover.`;
    else if (changed.length + env.length === 0) reason = "This task changed nothing that can be undone.";
    else if (changed.length > MAX_UNDO_ONE_FILES) reason = `This task changed ${changed.length} files, too many to undo one by one.`;
    return { safe: !reason, changed, env, conflicts, ...(reason ? { reason } : {}) };
  }

  private async undoOneNow(fromId: string, toId: string, label: string): Promise<UndoOneResult> {
    const a = this.readMeta(fromId);
    if (!a || !this.readMeta(toId)) throw new Error(`Unknown checkpoint: ${!a ? fromId : toId}`);
    // The project exactly as it is now: what the check below compares with, and what Undo can go back to.
    const safety = await this.snapshotNow(`Before undoing one task: ${label.slice(0, 60)}`);
    const plan = await this.planOneNow(fromId, toId, safety.id);
    if (!plan.safe) throw new UndoOneError(`${plan.reason ?? "This task cannot be undone on its own."} Nothing was changed.`);
    try {
      // Files the task changed or removed come back as they were before it.
      const back = plan.changed.filter((x) => x.kind !== "added").map((x) => x.file);
      if (back.length) {
        const idx = this.tmpIndex();
        try {
          await this.git(["read-tree", a.commit], { index: idx });
          await this.git(["checkout-index", "-f", "--", ...back], { index: idx });
        } finally { rmSync(idx, { force: true }); }
      }
      // Files the task added go, with any folder that is left empty.
      for (const x of plan.changed.filter((y) => y.kind === "added")) {
        const abs = this.inProject(x.file);
        rmSync(abs, { force: true, recursive: false });
        let dir = dirname(abs);
        while (dir !== this.projectDir && dir.startsWith(this.projectDir + sep)) {
          try { if (readdirSync(dir).length === 0) rmdirSync(dir); else break; } catch { break; }
          dir = dirname(dir);
        }
      }
      // .env files: the copy from before the task, or none if it did not exist then.
      for (const rel of plan.env) {
        const dst = this.inProject(rel), src = join(this.metaPath(fromId), "env", rel);
        if (existsSync(src)) { mkdirSync(dirname(dst), { recursive: true }); copyFileSync(src, dst); }
        else rmSync(dst, { force: true });
      }
    } catch (e) {
      throw new UndoOneError(`Undoing the task stopped partway (${String((e as Error).message ?? e).split("\n")[0].slice(0, 120)}). Your project as it was just before is saved, so it can be put back.`, safety.id);
    }
    return { safetyCheckpoint: safety.id, reverted: plan.changed.map((x) => x.file), env: plan.env };
  }
}
