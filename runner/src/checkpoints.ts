// Shadow snapshots: Companion's own undo. Never writes the user's git (F13).
//
// One private git repository per project, kept OUTSIDE the project. Every git
// call uses GIT_DIR=<shadow> and GIT_WORK_TREE=<project> with a temporary
// index, so the user's .git, index, branches and history are never read for
// writing. A project that is not a git project never gets a .git.

import { chmodSync, copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, rmdirSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, relative, resolve, sep } from "node:path";
import { randomBytes } from "node:crypto";

export type Skipped = { path: string; reason: string };
export type Checkpoint = { id: string; commit: string; label: string; files: number; skipped: Skipped[]; createdAt: string; envFiles: string[] };
export type RestoreResult = { restored: string; safetyCheckpoint: string; envRestored: string[] };

const MAX_NEW_FILE_BYTES = 2 * 1024 * 1024;
const DEFAULT_EXCLUDES = [
  "node_modules/", ".next/", "dist/", "build/", ".turbo/", ".cache/", "__pycache__/", ".venv/", "venv/", "target/", "coverage/", ".DS_Store",
];
const ENV_SKIP_DIRS = new Set(["node_modules", ".git", ".next", "dist", "build", ".turbo", ".cache", "target", "venv", ".venv", "__pycache__", "coverage"]);

export class CheckpointStore {
  readonly shadowDir: string;
  readonly projectDir: string;
  private queue: Promise<unknown> = Promise.resolve();

  constructor(shadowDir: string, projectDir: string) {
    this.shadowDir = resolve(shadowDir);
    this.projectDir = resolve(projectDir);
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

  snapshot(label: string): Promise<Checkpoint> { return this.serial(() => this.snapshotNow(label)); }
  restore(id: string): Promise<RestoreResult> { return this.serial(() => this.restoreNow(id)); }
  diff(fromId: string, toId: string): Promise<{ file: string; kind: "added" | "modified" | "deleted" }[]> { return this.serial(() => this.diffNow(fromId, toId)); }
  list(): Promise<Checkpoint[]> { return this.serial(async () => this.refs().map((r) => this.readMeta(r.id)!).filter(Boolean)); }

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

  private async git(args: string[], opts: { index?: string; allowFail?: boolean } = {}): Promise<string> {
    const p = Bun.spawn(["git", "-c", "core.quotepath=off", ...args], { cwd: this.projectDir, env: this.env(opts.index), stdout: "pipe", stderr: "pipe" });
    const [out, err] = await Promise.all([new Response(p.stdout).text(), new Response(p.stderr).text()]);
    const code = await p.exited;
    if (code !== 0 && !opts.allowFail) throw new Error(`git ${args.join(" ")} failed: ${err.trim()}`);
    return out;
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
    this.ensureInit();
    this.writeExcludes();
    const idx = this.tmpIndex();
    try {
      const all = this.refs();
      const last = all[all.length - 1];
      const parent = last ? (await this.git(["rev-parse", last.ref])).trim() : null;
      if (parent) await this.git(["read-tree", parent], { index: idx });

      // New files over 2 MiB are skipped and reported, never silently saved.
      const skipped: Skipped[] = [];
      const fresh = (await this.git(["ls-files", "-z", "--others", "--exclude-standard"], { index: idx })).split("\0").filter(Boolean);
      for (const rel of fresh) {
        try {
          const st = statSync(join(this.projectDir, rel));
          if (st.isFile() && st.size > MAX_NEW_FILE_BYTES) skipped.push({ path: rel, reason: `over 2 MiB (${(st.size / 1048576).toFixed(1)} MiB)` });
        } catch { /* vanished while scanning */ }
      }

      await this.git(["add", "-A", "--", "."], { index: idx });
      for (const s of skipped) await this.git(["rm", "--cached", "-q", "--ignore-unmatch", "--", s.path], { index: idx });

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
        try { st = statSync(p); } catch { continue; }
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

    const idx = this.tmpIndex();
    try {
      await this.git(["read-tree", targetMeta.commit], { index: idx });
      await this.git(["checkout-index", "-a", "-f"], { index: idx });
    } finally {
      rmSync(idx, { force: true });
    }

    // Remove what exists now but did not exist then.
    const added = (await this.git(["diff-tree", "-r", "--name-only", "--no-renames", "--diff-filter=A", "-z", targetMeta.commit, safety.commit]))
      .split("\0").filter(Boolean);
    for (const rel of added) {
      const abs = this.inProject(rel);
      rmSync(abs, { force: true, recursive: false });
      let dir = dirname(abs);
      while (dir !== this.projectDir && dir.startsWith(this.projectDir + sep)) {
        try { if (readdirSync(dir).length === 0) rmdirSync(dir); else break; } catch { break; }
        dir = dirname(dir);
      }
    }

    // .env files: put back the old ones, remove ones created since.
    const envRestored: string[] = [];
    for (const rel of targetMeta.envFiles) {
      const src = join(this.metaPath(id), "env", rel);
      if (!existsSync(src)) continue;
      const dst = this.inProject(rel);
      mkdirSync(dirname(dst), { recursive: true });
      copyFileSync(src, dst);
      envRestored.push(rel);
    }
    for (const rel of safety.envFiles) {
      if (!targetMeta.envFiles.includes(rel)) rmSync(this.inProject(rel), { force: true });
    }
    return { restored: id, safetyCheckpoint: safety.id, envRestored };
  }
}
