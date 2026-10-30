// Launch check (15 Oct 2026, "ignored (gitignored) files are not covered by undo"): a file git ignores that a task edits is
// kept just before the edit, and Undo puts it back (or removes one the task made). Temporary folders only.
import { afterEach, describe, expect, test } from "bun:test";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { CheckpointStore } from "../src/checkpoints.ts";

const made: string[] = [];
afterEach(() => { while (made.length) rmSync(made.pop()!, { recursive: true, force: true }); });
const tmp = (label: string) => { const d = mkdtempSync(join(tmpdir(), `companion-test-${label}-`)); made.push(d); return d; };
function project(files: Record<string, string>): string {
  const d = tmp("proj");
  for (const [p, c] of Object.entries(files)) { mkdirSync(join(d, p, ".."), { recursive: true }); writeFileSync(join(d, p), c); }
  return d;
}
const read = (d: string, p: string) => readFileSync(join(d, p), "utf8");

describe("undo covers ignored files a task edits", () => {
  test("an ignored file edited after a checkpoint comes back on undo, and one the task made goes", async () => {
    const p = project({ ".gitignore": "secret-config.json\nlocal/\n", "app.js": "a", "secret-config.json": "{\"v\":1}", "local/notes.txt": "mine" });
    const s = new CheckpointStore(tmp("shadow"), p);
    const cp = await s.snapshot("Before");
    expect(await s.keepIgnored(cp.id, "secret-config.json")).toBe("kept");
    writeFileSync(join(p, "secret-config.json"), "{\"v\":2}");
    expect(await s.keepIgnored(cp.id, join(p, "local/new.txt"))).toBe("absent");   // an absolute path inside the project works
    writeFileSync(join(p, "local/new.txt"), "made by the task");
    expect(await s.keepIgnored(cp.id, "app.js")).toBe("tracked");                   // the snapshot already covers it
    const r = await s.restore(cp.id, { force: true });
    expect(read(p, "secret-config.json")).toBe("{\"v\":1}");
    expect(existsSync(join(p, "local/new.txt"))).toBe(false);
    expect(read(p, "local/notes.txt")).toBe("mine");
    expect(r.ignoredRestored.sort()).toEqual(["local/new.txt", "secret-config.json"]);
  });
  test("only the state before the first edit is kept, and undo to an earlier checkpoint goes back that far", async () => {
    const p = project({ ".gitignore": "cache.txt\n", "cache.txt": "one" });
    const s = new CheckpointStore(tmp("shadow"), p);
    const a = await s.snapshot("A");
    await s.keepIgnored(a.id, "cache.txt"); writeFileSync(join(p, "cache.txt"), "two");
    await s.keepIgnored(a.id, "cache.txt"); writeFileSync(join(p, "cache.txt"), "three");
    const b = await s.snapshot("B");
    await s.keepIgnored(b.id, "cache.txt"); writeFileSync(join(p, "cache.txt"), "four");
    await s.restore(b.id, { force: true });
    expect(read(p, "cache.txt")).toBe("three");
    await s.restore(a.id, { force: true });
    expect(read(p, "cache.txt")).toBe("one");
  });
  test("undo itself can be undone: the safe copy taken before undo keeps the ignored files it changes", async () => {
    const p = project({ ".gitignore": "cache.txt\n", "cache.txt": "before" });
    const s = new CheckpointStore(tmp("shadow"), p);
    const a = await s.snapshot("A");
    await s.keepIgnored(a.id, "cache.txt"); writeFileSync(join(p, "cache.txt"), "after");
    const r = await s.restore(a.id, { force: true });
    expect(read(p, "cache.txt")).toBe("before");
    await s.restore(r.safetyCheckpoint, { force: true });
    expect(read(p, "cache.txt")).toBe("after");
  });
  test("never through a link, never outside the project, never a private settings file twice, never a huge file", async () => {
    const outside = tmp("outside"); writeFileSync(join(outside, "x.txt"), "keep");
    const p = project({ ".gitignore": "linked\nbig.bin\n.env\n" , ".env": "K=1" });
    symlinkSync(outside, join(p, "linked"));
    writeFileSync(join(p, "big.bin"), Buffer.alloc(3 * 1024 * 1024));
    const s = new CheckpointStore(tmp("shadow"), p);
    const cp = await s.snapshot("Before");
    expect(await s.keepIgnored(cp.id, "linked/x.txt")).toBe("skipped");
    expect(await s.keepIgnored(cp.id, "../elsewhere.txt")).toBe("skipped");
    expect(await s.keepIgnored(cp.id, ".env")).toBe("tracked");   // .env files have their own private copies already
    expect(await s.keepIgnored(cp.id, "big.bin")).toBe("too_big");
    const copies = join(s["shadowDir" as never] as unknown as string, "meta", cp.id, "ignored", "files");
    if (existsSync(copies)) for (const f of ["big.bin"]) expect(existsSync(join(copies, f))).toBe(false);
  });
  test("a kept copy is private to this Mac's user", async () => {
    const p = project({ ".gitignore": "token.json\n", "token.json": "{}" });
    const shadow = tmp("shadow");
    const s = new CheckpointStore(shadow, p);
    const cp = await s.snapshot("Before");
    await s.keepIgnored(cp.id, "token.json");
    expect(statSync(join(shadow, "meta", cp.id, "ignored", "files", "token.json")).mode & 0o777).toBe(0o600);
  });
});

describe("the engine keeps an ignored file before a task edits it", () => {
  test("every file writing tool is covered, after the approval and before the tool runs", () => {
    const src = readFileSync(new URL("../src/agent.ts", import.meta.url), "utf8");
    expect(src).toContain('const EDIT_TOOLS = new Set(["Write", "Edit", "MultiEdit", "NotebookEdit"]);');
    const auth = src.slice(src.indexOf("private async authorizeTool("));
    const keep = auth.indexOf(".keepIgnored(checkpoint, path)");
    expect(keep).toBeGreaterThan(auth.indexOf('if (verdict.decision === "deny")'));
    expect(keep).toBeLessThan(auth.indexOf("this.watchers.get(cmd.agent)?.begin(wid);"));
  });
});
