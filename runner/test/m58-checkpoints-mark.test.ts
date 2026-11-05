// M58 (the shortlist, item 5): star or name a save point. Kept in the shadow store's own notes, never in the project and
// never in its git; a starred or named save is never pruned; the mark outlasts a restart. Temporary folders only.
import { afterEach, describe, expect, test } from "bun:test";
import { mkdtempSync, readdirSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { CheckpointStore, cleanSaveName } from "../src/checkpoints.ts";

const made: string[] = [];
afterEach(() => { while (made.length) rmSync(made.pop()!, { recursive: true, force: true }); });
const tmp = (l: string) => { const d = realpathSync(mkdtempSync(join(tmpdir(), `companion-mark-${l}-`))); made.push(d); return d; };
const env = { PATH: process.env.PATH ?? "", HOME: process.env.HOME ?? "", GIT_CONFIG_GLOBAL: "/dev/null", GIT_CONFIG_SYSTEM: "/dev/null" };
const run = (cwd: string, ...a: string[]) => Bun.spawnSync(["git", ...a], { cwd, env: { ...env, GIT_AUTHOR_NAME: "t", GIT_AUTHOR_EMAIL: "t@t", GIT_COMMITTER_NAME: "t", GIT_COMMITTER_EMAIL: "t@t" } });
function setup(o: ConstructorParameters<typeof CheckpointStore>[2] = {}) {
  const p = tmp("p"), shadow = join(tmp("s"), "p.git");
  writeFileSync(join(p, "a.txt"), "0");
  return { p, shadow, s: new CheckpointStore(shadow, p, { keepNewest: 3, pruneSlack: 0, ...o }) };
}

describe("a save point's star and name", () => {
  test("mark, read back, and take away", async () => {
    const t = setup();
    const c = await t.s.snapshot("Before: one");
    expect(t.s.mark(c.id, { star: true })).toEqual({ ok: true });
    expect(t.s.mark(c.id, { name: "Before the new menu" })).toEqual({ ok: true });
    expect(t.s.marks()[c.id]).toEqual({ star: true, name: "Before the new menu" });
    t.s.mark(c.id, { star: false });
    expect(t.s.marks()[c.id]).toEqual({ name: "Before the new menu" });
    t.s.mark(c.id, { name: "" });
    expect(t.s.marks()[c.id]).toBeUndefined();
  });
  test("an unknown save point is refused in plain words, and nothing is kept", async () => {
    const t = setup();
    await t.s.snapshot("Before: one");
    const r = t.s.mark("cp_9999", { star: true });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toMatch(/not there/i);
    expect(t.s.mark("../../etc", { star: true }).ok).toBe(false);
    expect(t.s.marks()).toEqual({});
  });
  test("names are cleaned: one line, no control characters, at most 40 characters", () => {
    expect(cleanSaveName("  Menu\n works \u0007 ")).toBe("Menu works");
    expect(cleanSaveName("x".repeat(60)).length).toBe(40);
    expect(cleanSaveName("   ")).toBe("");
  });
  test("the mark outlasts a restart (a new store on the same folder reads it)", async () => {
    const t = setup();
    const c = await t.s.snapshot("Before: one");
    t.s.mark(c.id, { star: true, name: "Works" });
    const again = new CheckpointStore(t.shadow, t.p, { keepNewest: 3, pruneSlack: 0 });
    expect(again.marks()[c.id]).toEqual({ star: true, name: "Works" });
  });
  test("a starred or a named save is never pruned, however old", async () => {
    const t = setup();
    const first = await t.s.snapshot("Before: one");
    const second = await t.s.snapshot("Before: two");
    t.s.mark(first.id, { star: true });
    t.s.mark(second.id, { name: "Kept" });
    for (let i = 0; i < 8; i++) { writeFileSync(join(t.p, "a.txt"), String(i)); await t.s.snapshot(`Before: n${i}`); }
    const ids = (await t.s.list()).map((c) => c.id);
    expect(ids).toContain(first.id);
    expect(ids).toContain(second.id);
    expect(ids.length).toBeLessThan(10);   // the others were pruned as usual
  });
  test("marking never touches the project or its git: the project's own history and files are the same after", async () => {
    const t = setup();
    run(t.p, "init", "-q"); run(t.p, "add", "-A"); run(t.p, "commit", "-qm", "first");
    const logBefore = run(t.p, "log", "--format=%H %s").stdout.toString();
    const filesBefore = readdirSync(t.p).sort();
    const c = await t.s.snapshot("Before: one");
    t.s.mark(c.id, { star: true, name: "Mine" });
    expect(run(t.p, "log", "--format=%H %s").stdout.toString()).toBe(logBefore);
    expect(run(t.p, "status", "--porcelain").stdout.toString()).toBe("");
    expect(readdirSync(t.p).sort()).toEqual(filesBefore);
    expect(readFileSync(join(t.p, "a.txt"), "utf8")).toBe("0");
  });
});
