// Undo tests. Every test uses temporary folders under the system temp dir.
// Nothing here ever touches a real project or the founder's own git.
import { afterEach, describe, expect, test } from "bun:test";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync, lstatSync, symlinkSync, chmodSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, relative } from "node:path";
import { CheckpointStore } from "../src/checkpoints.ts";

const made: string[] = [];
afterEach(() => { while (made.length) rmSync(made.pop()!, { recursive: true, force: true }); });

function tmp(label: string): string {
  const d = mkdtempSync(join(tmpdir(), `companion-test-${label}-`));
  made.push(d);
  return d;
}
function project(files: Record<string, string>): string {
  const d = tmp("proj");
  for (const [p, c] of Object.entries(files)) {
    mkdirSync(join(d, p, ".."), { recursive: true });
    writeFileSync(join(d, p), c);
  }
  return d;
}
const read = (d: string, p: string) => readFileSync(join(d, p), "utf8");
function git(cwd: string, ...args: string[]): string {
  const r = Bun.spawnSync(["git", ...args], { cwd, env: { ...process.env, GIT_CONFIG_GLOBAL: "/dev/null", GIT_CONFIG_SYSTEM: "/dev/null" } });
  if (r.exitCode !== 0) throw new Error(`git ${args.join(" ")}: ${r.stderr.toString()}`);
  return r.stdout.toString();
}
// A fingerprint of a whole directory tree: names, sizes, contents.
function treeHash(dir: string): string {
  const h = createHash("sha256");
  const walk = (d: string) => {
    for (const name of readdirSync(d).sort()) {
      const p = join(d, name);
      const st = lstatSync(p);
      h.update(relative(dir, p) + ":" + st.size + ":" + (st.mode & 0o777));
      if (st.isDirectory()) walk(p);
      else if (st.isFile()) h.update(readFileSync(p));
    }
  };
  walk(dir);
  return h.digest("hex");
}

describe("snapshot and undo", () => {
  test("undo brings back changed, deleted and added files", async () => {
    const p = project({ "a.txt": "one", "src/b.txt": "two" });
    const s = new CheckpointStore(tmp("shadow"), p);
    const cp = await s.snapshot("Before: change things");
    writeFileSync(join(p, "a.txt"), "CHANGED");
    rmSync(join(p, "src/b.txt"));
    writeFileSync(join(p, "new.txt"), "added by agent");
    mkdirSync(join(p, "newdir/deep"), { recursive: true });
    writeFileSync(join(p, "newdir/deep/x.txt"), "deep");
    await s.restore(cp.id);
    expect(read(p, "a.txt")).toBe("one");
    expect(read(p, "src/b.txt")).toBe("two");
    expect(existsSync(join(p, "new.txt"))).toBe(false);
    expect(existsSync(join(p, "newdir/deep/x.txt"))).toBe(false);
  });

  test("a file created by a shell command is undone too", async () => {
    const p = project({ "a.txt": "one" });
    const s = new CheckpointStore(tmp("shadow"), p);
    const cp = await s.snapshot("Before: run a command");
    Bun.spawnSync(["sh", "-c", "echo made-by-bash > bash-made.txt && mkdir -p out && echo x > out/y.txt && echo more >> a.txt"], { cwd: p });
    await s.restore(cp.id);
    expect(existsSync(join(p, "bash-made.txt"))).toBe(false);
    expect(existsSync(join(p, "out/y.txt"))).toBe(false);
    expect(read(p, "a.txt")).toBe("one");
  });

  test("a folder that is not a git project never gets a .git", async () => {
    const p = project({ "a.txt": "one" });
    const s = new CheckpointStore(tmp("shadow"), p);
    const cp = await s.snapshot("x");
    writeFileSync(join(p, "a.txt"), "two");
    await s.restore(cp.id);
    expect(existsSync(join(p, ".git"))).toBe(false);
    expect(readdirSync(p).sort()).toEqual(["a.txt"]);
  });

  test("undo of an undo works", async () => {
    const p = project({ "a.txt": "original" });
    const s = new CheckpointStore(tmp("shadow"), p);
    const cp = await s.snapshot("Before");
    writeFileSync(join(p, "a.txt"), "agent version");
    writeFileSync(join(p, "extra.txt"), "agent extra");
    const undo = await s.restore(cp.id);
    expect(read(p, "a.txt")).toBe("original");
    expect(existsSync(join(p, "extra.txt"))).toBe(false);
    expect(undo.safetyCheckpoint).toBeTruthy();
    await s.restore(undo.safetyCheckpoint);
    expect(read(p, "a.txt")).toBe("agent version");
    expect(read(p, "extra.txt")).toBe("agent extra");
  });

  test("a changed .env file is restorable even though git would ignore it", async () => {
    const p = project({ ".gitignore": ".env\n", ".env": "KEY=original\n", "a.txt": "1" });
    const s = new CheckpointStore(tmp("shadow"), p);
    const cp = await s.snapshot("Before");
    writeFileSync(join(p, ".env"), "KEY=agent-changed\n");
    writeFileSync(join(p, ".env.local"), "NEW=1\n");
    const r = await s.restore(cp.id);
    expect(read(p, ".env")).toBe("KEY=original\n");
    expect(r.envRestored).toContain(".env");
  });

  test("the saved .env copy is private to the user (mode 0600)", async () => {
    const shadow = tmp("shadow");
    const p = project({ ".env": "KEY=1\n" });
    const s = new CheckpointStore(shadow, p);
    await s.snapshot("x");
    const copies: string[] = [];
    const walk = (d: string) => { for (const n of readdirSync(d)) { const q = join(d, n); statSync(q).isDirectory() ? walk(q) : n === ".env" && copies.push(q); } };
    walk(join(shadow, "meta"));
    expect(copies.length).toBe(1);
    expect(statSync(copies[0]).mode & 0o777).toBe(0o600);
  });

  test("a 3 MB new file is skipped and reported, and undo leaves it alone", async () => {
    const p = project({ "a.txt": "one" });
    const s = new CheckpointStore(tmp("shadow"), p);
    writeFileSync(join(p, "video.mp4"), Buffer.alloc(3 * 1024 * 1024, 7));
    const cp = await s.snapshot("Before");
    expect(cp.skipped.map((x) => x.path)).toContain("video.mp4");
    expect(cp.skipped[0].reason).toContain("2 MiB");
    writeFileSync(join(p, "a.txt"), "two");
    await s.restore(cp.id);
    expect(read(p, "a.txt")).toBe("one");
    expect(existsSync(join(p, "video.mp4"))).toBe(true);
  });

  test("node_modules and build folders are not snapshotted and not touched by undo", async () => {
    const p = project({ "a.txt": "one", "node_modules/pkg/index.js": "lib", "dist/out.js": "built" });
    const s = new CheckpointStore(tmp("shadow"), p);
    const cp = await s.snapshot("Before");
    expect(cp.files).toBe(1);
    writeFileSync(join(p, "node_modules/pkg/index.js"), "changed");
    writeFileSync(join(p, "dist/new.js"), "x");
    await s.restore(cp.id);
    expect(read(p, "node_modules/pkg/index.js")).toBe("changed");
    expect(existsSync(join(p, "dist/new.js"))).toBe(true);
  });

  test("Claude Code's own bookkeeping folder is not part of a snapshot or a receipt", async () => {
    const p = project({ "a.txt": "one" });
    const s = new CheckpointStore(tmp("shadow"), p);
    const first = await s.snapshot("Before");
    mkdirSync(join(p, ".claude"), { recursive: true });
    writeFileSync(join(p, ".claude/.cc-writes"), "x");
    const second = await s.snapshot("After");
    expect(await s.diff(first.id, second.id)).toEqual([]);
  });

  test("files the project's own .gitignore ignores are left alone", async () => {
    const p = project({ ".gitignore": "*.log\n", "a.txt": "one", "debug.log": "first" });
    const s = new CheckpointStore(tmp("shadow"), p);
    const cp = await s.snapshot("Before");
    writeFileSync(join(p, "debug.log"), "second");
    await s.restore(cp.id);
    expect(read(p, "debug.log")).toBe("second");
  });

  test("file permissions and symlinks survive an undo", async () => {
    const p = project({ "run.sh": "#!/bin/sh\necho hi\n", "a.txt": "x" });
    chmodSync(join(p, "run.sh"), 0o755);
    symlinkSync("a.txt", join(p, "link"));
    const s = new CheckpointStore(tmp("shadow"), p);
    const cp = await s.snapshot("Before");
    rmSync(join(p, "run.sh")); rmSync(join(p, "link"));
    writeFileSync(join(p, "run.sh"), "gone");
    await s.restore(cp.id);
    expect(statSync(join(p, "run.sh")).mode & 0o777).toBe(0o755);
    expect(lstatSync(join(p, "link")).isSymbolicLink()).toBe(true);
  });

  test("checkpoint ids go up in order and list shows labels", async () => {
    const p = project({ "a.txt": "1" });
    const s = new CheckpointStore(tmp("shadow"), p);
    const a = await s.snapshot("first");
    writeFileSync(join(p, "a.txt"), "2");
    const b = await s.snapshot("second");
    expect(a.id).not.toBe(b.id);
    const l = await s.list();
    expect(l.map((c) => c.label)).toEqual(["first", "second"]);
  });

  test("restoring an unknown checkpoint fails clearly and changes nothing", async () => {
    const p = project({ "a.txt": "1" });
    const s = new CheckpointStore(tmp("shadow"), p);
    await s.snapshot("x");
    writeFileSync(join(p, "a.txt"), "changed");
    await expect(s.restore("cp_9999")).rejects.toThrow(/unknown checkpoint/i);
    expect(read(p, "a.txt")).toBe("changed");
  });

  test("the shadow store may never live inside the project", () => {
    const p = project({ "a.txt": "1" });
    expect(() => new CheckpointStore(join(p, "shadow"), p)).toThrow(/outside the project/i);
  });
});

describe("the user's own git is never written (F13, rule 10)", () => {
  function gitProject() {
    const p = project({ "a.txt": "one", "b.txt": "bee", "keep.txt": "k" });
    git(p, "init", "-q", "-b", "main");
    git(p, "-c", "user.name=T", "-c", "user.email=t@t", "add", "-A");
    git(p, "-c", "user.name=T", "-c", "user.email=t@t", "commit", "-q", "-m", "first");
    git(p, "branch", "feature");
    writeFileSync(join(p, "a.txt"), "staged change");
    git(p, "add", "a.txt");            // user staged this
    writeFileSync(join(p, "b.txt"), "unstaged change");
    return p;
  }

  test("the whole .git folder is byte for byte identical after snapshot and undo", async () => {
    const p = gitProject();
    const before = treeHash(join(p, ".git"));
    const s = new CheckpointStore(tmp("shadow"), p);
    const cp = await s.snapshot("Before");
    writeFileSync(join(p, "keep.txt"), "agent edit");
    writeFileSync(join(p, "agent-new.txt"), "n");
    await s.restore(cp.id);
    expect(treeHash(join(p, ".git"))).toBe(before);
  });

  test("the user's staged and unstaged changes are still staged and unstaged after undo", async () => {
    const p = gitProject();
    const s = new CheckpointStore(tmp("shadow"), p);
    const cp = await s.snapshot("Before");
    writeFileSync(join(p, "keep.txt"), "agent edit");
    await s.restore(cp.id);
    expect(git(p, "diff", "--cached", "--name-only").trim()).toBe("a.txt");
    expect(git(p, "diff", "--name-only").trim()).toBe("b.txt");
    expect(read(p, "a.txt")).toBe("staged change");
    expect(read(p, "keep.txt")).toBe("k");
  });

  test("HEAD, branches and history do not move", async () => {
    const p = gitProject();
    const head = git(p, "rev-parse", "HEAD");
    const branches = git(p, "branch", "--list");
    const s = new CheckpointStore(tmp("shadow"), p);
    const cp = await s.snapshot("Before");
    await s.restore(cp.id);
    expect(git(p, "rev-parse", "HEAD")).toBe(head);
    expect(git(p, "branch", "--list")).toBe(branches);
    expect(git(p, "log", "--oneline").trim().split("\n").length).toBe(1);
  });

  test("the user's .git folder is never part of a snapshot", async () => {
    const p = gitProject();
    const s = new CheckpointStore(tmp("shadow"), p);
    const cp = await s.snapshot("Before");
    rmSync(join(p, ".git/refs/heads/feature"));
    await s.restore(cp.id);
    // undo must not recreate or delete anything inside .git
    expect(existsSync(join(p, ".git/refs/heads/feature"))).toBe(false);
  });
});
