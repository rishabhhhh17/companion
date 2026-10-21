// Undo must never overwrite the person's own edits (T06, added 21 Oct 2026). Temporary folders only, no network, no real git of
// the person's: the store works in a shadow folder outside the project.
import { afterEach, describe, expect, test } from "bun:test";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { CheckpointStore } from "../src/checkpoints.ts";

const made: string[] = [];
afterEach(() => { while (made.length) rmSync(made.pop()!, { recursive: true, force: true }); });
const tmp = (l: string) => { const d = realpathSync(mkdtempSync(join(tmpdir(), `companion-mine-${l}-`))); made.push(d); return d; };
const put = (dir: string, rel: string, c: string | Uint8Array) => { mkdirSync(join(dir, rel, ".."), { recursive: true }); writeFileSync(join(dir, rel), c); };
const text = (dir: string, rel: string) => readFileSync(join(dir, rel), "utf8");
const sha = (b: Uint8Array) => createHash("sha256").update(b).digest("hex");
function rig(files: Record<string, string | Uint8Array> = { "a.js": "a0", "b.css": "b0" }) {
  const project = tmp("proj"), shadow = tmp("shadow");
  for (const [p, c] of Object.entries(files)) put(project, p, c);
  const store = new CheckpointStore(shadow, project);
  return { project, shadow, store };
}
type R = ReturnType<typeof rig>;
/** One task of ours: save the start, run `work`, save the end, and say the task ended there. */
async function task(r: R, label: string, work: () => void) {
  const before = await r.store.snapshot(`Before: ${label}`);
  await r.store.noteTaskStart(before.id);
  work();
  const after = await r.store.snapshot(`After: ${label}`);
  await r.store.noteAgentEnd(after.id);
  return { before, after };
}

describe("Undo keeps what you changed yourself", () => {
  test("you edit after the task, then Undo: your file stays, the task's other work goes back", async () => {
    const r = rig();
    const t = await task(r, "one", () => { put(r.project, "a.js", "a1 agent"); put(r.project, "b.css", "b1 agent"); put(r.project, "new.txt", "made by the task"); });
    put(r.project, "a.js", "a2 mine");
    const res = await r.store.restore(t.before.id);
    expect(text(r.project, "a.js")).toBe("a2 mine");
    expect(text(r.project, "b.css")).toBe("b0");
    expect(existsSync(join(r.project, "new.txt"))).toBe(false);
    expect(res.yours).toEqual(["a.js"]);
  });

  test("the task's own files are not mistaken for yours", async () => {
    const r = rig();
    const t = await task(r, "one", () => { put(r.project, "a.js", "a1"); put(r.project, "new.txt", "n"); });
    const res = await r.store.restore(t.before.id);
    expect(res.yours).toEqual([]);
    expect(text(r.project, "a.js")).toBe("a0");
    expect(existsSync(join(r.project, "new.txt"))).toBe(false);
  });

  test("you edit while a plan is paused: undoing the earlier step keeps your edit, undoing the later one does not need to", async () => {
    const r = rig();
    const s1 = await task(r, "step one", () => put(r.project, "a.js", "a1 agent"));
    put(r.project, "a.js", "a2 mine");          // the watcher saw this while no tool of ours ran
    r.store.notePersonEdit("a.js");
    const s2 = await task(r, "step two", () => put(r.project, "b.css", "b1 agent"));
    const res = await r.store.restore(s1.before.id);
    expect(text(r.project, "a.js")).toBe("a2 mine");
    expect(text(r.project, "b.css")).toBe("b0");
    expect(res.yours).toEqual(["a.js"]);
    // the later step starts after your edit, so undoing only it has nothing of yours to protect
    const r2 = rig();
    const x1 = await task(r2, "step one", () => put(r2.project, "a.js", "a1 agent"));
    put(r2.project, "a.js", "a2 mine"); r2.store.notePersonEdit("a.js");
    const x2 = await task(r2, "step two", () => put(r2.project, "a.js", "a3 agent over mine"));
    void x1;
    const back = await r2.store.restore(x2.before.id);
    expect(text(r2.project, "a.js")).toBe("a2 mine");   // the version from just before step two, which is yours
    expect(back.yours).toEqual([]);
    void s2;
  });

  test("you edit during the pause and the next step changed the same file: undoing the whole plan still keeps your version", async () => {
    const r = rig();
    const s1 = await task(r, "step one", () => put(r.project, "a.js", "a1 agent"));
    put(r.project, "a.js", "a2 mine"); r.store.notePersonEdit("a.js");
    await task(r, "step two", () => put(r.project, "a.js", "a3 agent over mine"));
    // the last step's result is not "what our step left" for a file you edited mid plan: the hash alone would call it ours
    const res = await r.store.restore(s1.before.id);
    expect(res.yours).toEqual(["a.js"]);
    expect(text(r.project, "a.js")).toBe("a3 agent over mine");   // left exactly as it is now, never replaced by the old version
  });

  test("both: an edit during a pause and an edit after the task", async () => {
    const r = rig({ "a.js": "a0", "b.css": "b0", "c.md": "c0" });
    const s1 = await task(r, "one", () => { put(r.project, "a.js", "a1"); put(r.project, "c.md", "c1"); });
    put(r.project, "a.js", "a2 mine"); r.store.notePersonEdit("a.js");
    await task(r, "two", () => put(r.project, "b.css", "b1"));
    put(r.project, "c.md", "c2 mine");
    const res = await r.store.restore(s1.before.id);
    expect(res.yours).toEqual(["a.js", "c.md"]);
    expect(text(r.project, "a.js")).toBe("a2 mine");
    expect(text(r.project, "c.md")).toBe("c2 mine");
    expect(text(r.project, "b.css")).toBe("b0");
  });

  test("many files: all are kept, and the list is complete and sorted", async () => {
    const files: Record<string, string> = {};
    for (let i = 0; i < 40; i++) files[`src/f${String(i).padStart(2, "0")}.js`] = `v0 ${i}`;
    const r = rig(files);
    const t = await task(r, "big", () => { for (const f of Object.keys(files)) put(r.project, f, "agent"); });
    for (let i = 0; i < 30; i++) put(r.project, `src/f${String(i).padStart(2, "0")}.js`, `mine ${i}`);
    const res = await r.store.restore(t.before.id);
    expect(res.yours.length).toBe(30);
    expect([...res.yours]).toEqual([...res.yours].sort());
    expect(text(r.project, "src/f05.js")).toBe("mine 5");
    expect(text(r.project, "src/f35.js")).toBe("v0 35");
  });

  test("a file you deleted stays deleted", async () => {
    const r = rig();
    const t = await task(r, "one", () => put(r.project, "a.js", "a1"));
    rmSync(join(r.project, "a.js"));
    const res = await r.store.restore(t.before.id);
    expect(existsSync(join(r.project, "a.js"))).toBe(false);
    expect(res.yours).toEqual(["a.js"]);
  });

  test("a file you made yourself stays", async () => {
    const r = rig();
    const t = await task(r, "one", () => put(r.project, "a.js", "a1"));
    put(r.project, "notes/mine.md", "my notes");
    const res = await r.store.restore(t.before.id);
    expect(text(r.project, "notes/mine.md")).toBe("my notes");
    expect(res.yours).toEqual(["notes/mine.md"]);
  });

  test("a file you made inside a folder the task also used is kept, with the folder", async () => {
    const r = rig();
    const t = await task(r, "one", () => put(r.project, "lib/x.js", "x"));
    put(r.project, "lib/mine.js", "mine");
    await r.store.restore(t.before.id);
    expect(existsSync(join(r.project, "lib/x.js"))).toBe(false);
    expect(text(r.project, "lib/mine.js")).toBe("mine");
  });

  test("a binary file you changed is kept byte for byte", async () => {
    const bin0 = new Uint8Array([0, 1, 2, 3, 0, 255]), bin1 = new Uint8Array([9, 0, 0, 7]), mineBytes = new Uint8Array([0, 0, 250, 251, 0, 1, 2]);
    const r = rig({ "img.bin": bin0, "a.js": "a0" });
    const t = await task(r, "one", () => put(r.project, "img.bin", bin1));
    put(r.project, "img.bin", mineBytes);
    const res = await r.store.restore(t.before.id);
    expect(res.yours).toEqual(["img.bin"]);
    expect(sha(readFileSync(join(r.project, "img.bin")))).toBe(sha(mineBytes));
  });

  test("a task that leaves a file exactly as it was and you leave it too: nothing to report", async () => {
    const r = rig();
    const t = await task(r, "one", () => put(r.project, "a.js", "a1"));
    put(r.project, "a.js", "a0");   // you happen to put back the very same words
    const res = await r.store.restore(t.before.id);
    expect(res.yours).toEqual([]);
  });

  test("the protection holds on a second Undo: the file you kept is still yours", async () => {
    const r = rig();
    const t1 = await task(r, "one", () => put(r.project, "a.js", "a1"));
    put(r.project, "a.js", "a2 mine");
    await r.store.restore(t1.before.id);
    const t2 = await task(r, "two", () => put(r.project, "b.css", "b1"));
    const res = await r.store.restore(t1.before.id);
    expect(text(r.project, "a.js")).toBe("a2 mine");
    expect(text(r.project, "b.css")).toBe("b0");
    expect(res.yours).toEqual(["a.js"]);
    void t2;
  });

  test("the usual guarantees stay: files we made go, ignored folders and git are never touched, Undo is itself undoable", async () => {
    const r = rig();
    Bun.spawnSync(["git", "init", "-q"], { cwd: r.project });
    put(r.project, "node_modules/pkg/i.js", "pkg");
    const gitBefore = readFileSync(join(r.project, ".git", "HEAD"), "utf8");
    const t = await task(r, "one", () => { put(r.project, "a.js", "a1"); put(r.project, "made.txt", "m"); put(r.project, "node_modules/pkg/i.js", "pkg changed"); });
    put(r.project, "b.css", "b2 mine");
    const res = await r.store.restore(t.before.id);
    expect(existsSync(join(r.project, "made.txt"))).toBe(false);
    expect(text(r.project, "a.js")).toBe("a0");
    expect(text(r.project, "node_modules/pkg/i.js")).toBe("pkg changed");
    expect(readFileSync(join(r.project, ".git", "HEAD"), "utf8")).toBe(gitBefore);
    expect(res.yours).toEqual(["b.css"]);
    await r.store.restore(res.safetyCheckpoint);   // undo of the undo
    expect(text(r.project, "a.js")).toBe("a1");
  });

  test("with no record of where a task ended, Undo behaves as it always did", async () => {
    const r = rig();
    const before = await r.store.snapshot("Before");
    put(r.project, "a.js", "a1");
    await r.store.snapshot("After");
    const res = await r.store.restore(before.id);
    expect(res.yours).toEqual([]);
    expect(text(r.project, "a.js")).toBe("a0");
  });
});

describe("the switch (undo.protectMyEdits)", () => {
  test("off: an edit after the task is replaced, as before, and saved aside first", async () => {
    const r = rig();
    const t = await task(r, "one", () => put(r.project, "a.js", "a1"));
    put(r.project, "a.js", "a2 mine");
    const res = await r.store.restore(t.before.id, { protect: false });
    expect(text(r.project, "a.js")).toBe("a0");
    expect(res.yours).toEqual([]);
    // the project as it was just before is still saved, so even this can be undone
    await r.store.restore(res.safetyCheckpoint);
    expect(text(r.project, "a.js")).toBe("a2 mine");
  });

  test("off: an edit made while a plan was paused is still kept", async () => {
    const r = rig();
    const s1 = await task(r, "one", () => put(r.project, "a.js", "a1"));
    put(r.project, "a.js", "a2 mine"); r.store.notePersonEdit("a.js");
    await task(r, "two", () => put(r.project, "b.css", "b1"));
    put(r.project, "c-after.md", "after");   // an edit after the plan: replaced when the switch is off
    const res = await r.store.restore(s1.before.id, { protect: false });
    expect(text(r.project, "a.js")).toBe("a2 mine");
    expect(res.yours).toEqual(["a.js"]);
    expect(existsSync(join(r.project, "c-after.md"))).toBe(false);
  });
});

describe("Put those back too", () => {
  test("saves your version aside, then restores; only the files that were left alone", async () => {
    const r = rig({ "a.js": "a0", "b.css": "b0", "c.md": "c0" });
    const t = await task(r, "one", () => { put(r.project, "a.js", "a1"); put(r.project, "b.css", "b1"); put(r.project, "c.md", "c1"); });
    put(r.project, "a.js", "a2 mine"); put(r.project, "b.css", "b2 mine");
    const res = await r.store.restore(t.before.id);
    expect(res.yours).toEqual(["a.js", "b.css"]);
    const back = await r.store.putBack(t.before.id, ["a.js"]);
    expect(back.putBack).toEqual(["a.js"]);
    expect(text(r.project, "a.js")).toBe("a0");
    expect(text(r.project, "b.css")).toBe("b2 mine");
    expect(readFileSync(join(back.savedTo, "a.js"), "utf8")).toBe("a2 mine");
    // what was left is still offered
    const rest = await r.store.putBack(t.before.id);
    expect(rest.putBack).toEqual(["b.css"]);
    expect(text(r.project, "b.css")).toBe("b0");
  });

  test("a file you made yourself is saved aside and removed", async () => {
    const r = rig();
    const t = await task(r, "one", () => put(r.project, "a.js", "a1"));
    put(r.project, "mine.md", "my notes");
    await r.store.restore(t.before.id);
    const back = await r.store.putBack(t.before.id);
    expect(existsSync(join(r.project, "mine.md"))).toBe(false);
    expect(readFileSync(join(back.savedTo, "mine.md"), "utf8")).toBe("my notes");
  });

  test("a file you deleted comes back", async () => {
    const r = rig();
    const t = await task(r, "one", () => put(r.project, "a.js", "a1"));
    rmSync(join(r.project, "a.js"));
    await r.store.restore(t.before.id);
    const back = await r.store.putBack(t.before.id);
    expect(back.putBack).toEqual(["a.js"]);
    expect(text(r.project, "a.js")).toBe("a0");
  });

  test("a binary file is saved aside byte for byte", async () => {
    const mine = new Uint8Array([0, 0, 250, 251, 0, 1, 2]);
    const r = rig({ "img.bin": new Uint8Array([1, 0, 2]) });
    const t = await task(r, "one", () => put(r.project, "img.bin", new Uint8Array([5, 0, 6])));
    put(r.project, "img.bin", mine);
    await r.store.restore(t.before.id);
    const back = await r.store.putBack(t.before.id);
    expect(sha(readFileSync(join(back.savedTo, "img.bin")))).toBe(sha(mine));
    expect([...readFileSync(join(r.project, "img.bin"))]).toEqual([1, 0, 2]);
  });

  test("it will not touch a file that was not left alone by that Undo", async () => {
    const r = rig();
    const t = await task(r, "one", () => put(r.project, "a.js", "a1"));
    put(r.project, "b.css", "b2 mine");
    await r.store.restore(t.before.id);
    const back = await r.store.putBack(t.before.id, ["b.css", "a.js", "../outside.txt"]);
    expect(back.putBack).toEqual(["b.css"]);
    expect(back.skipped.length).toBe(2);
    expect(existsSync(join(r.project, "..", "outside.txt"))).toBe(false);
  });

  test("a file you changed again after Undo is saved aside too, never lost", async () => {
    const r = rig();
    const t = await task(r, "one", () => put(r.project, "a.js", "a1"));
    put(r.project, "a.js", "a2 mine");
    await r.store.restore(t.before.id);
    put(r.project, "a.js", "a3 mine again");
    const back = await r.store.putBack(t.before.id);
    expect(readFileSync(join(back.savedTo, "a.js"), "utf8")).toBe("a3 mine again");
    expect(text(r.project, "a.js")).toBe("a0");
  });

  test("with nothing left alone there is nothing to put back", async () => {
    const r = rig();
    const t = await task(r, "one", () => put(r.project, "a.js", "a1"));
    await r.store.restore(t.before.id);
    const back = await r.store.putBack(t.before.id);
    expect(back.putBack).toEqual([]);
  });

  test("after Put those back too, a later Undo does not call them yours again", async () => {
    const r = rig();
    const t = await task(r, "one", () => put(r.project, "a.js", "a1"));
    put(r.project, "a.js", "a2 mine");
    await r.store.restore(t.before.id);
    await r.store.putBack(t.before.id);
    const again = await r.store.restore(t.before.id);
    expect(again.yours).toEqual([]);
    expect(readdirSync(join(r.shadow, "recovered")).length).toBeGreaterThan(0);
  });
});

describe("undoing one task in the middle", () => {
  test("it refuses, changes nothing, and says the file is yours", async () => {
    const r = rig();
    const t = await task(r, "one", () => put(r.project, "a.js", "a1"));
    put(r.project, "a.js", "a2 mine"); r.store.notePersonEdit("a.js");
    const err = await r.store.undoOne(t.before.id, t.after.id, "one").catch((e) => e as Error);
    expect(String((err as Error).message)).toMatch(/you changed/i);
    expect(String((err as Error).message)).toContain("a.js");
    expect(String((err as Error).message)).toMatch(/Nothing was changed/);
    expect(text(r.project, "a.js")).toBe("a2 mine");
  });

  test("a task nobody touched still undoes, and the baseline follows so a later whole Undo does not blame you for it", async () => {
    const r = rig();
    const t1 = await task(r, "one", () => put(r.project, "a.js", "a1"));
    const t2 = await task(r, "two", () => put(r.project, "b.css", "b1"));
    await r.store.undoOne(t2.before.id, t2.after.id, "two");
    expect(text(r.project, "b.css")).toBe("b0");
    const res = await r.store.restore(t1.before.id);
    expect(res.yours).toEqual([]);
    expect(text(r.project, "a.js")).toBe("a0");
  });
});

describe("more of what you might have changed", () => {
  test("you edit between two tasks: undoing the first keeps your edit, and the second task's own file goes back", async () => {
    const r = rig();
    const t1 = await task(r, "one", () => put(r.project, "a.js", "a1"));
    put(r.project, "a.js", "a2 mine");
    await task(r, "two", () => put(r.project, "b.css", "b1"));
    const res = await r.store.restore(t1.before.id);
    expect(res.yours).toEqual(["a.js"]);
    expect(text(r.project, "a.js")).toBe("a2 mine");
    expect(text(r.project, "b.css")).toBe("b0");
  });

  test("a .env file you changed yourself is kept, a .env the task changed goes back", async () => {
    const r = rig({ ".env": "KEY=old", "pkg/.env.local": "X=1", "a.js": "a0" });
    const t = await task(r, "one", () => { put(r.project, ".env", "KEY=agent"); put(r.project, "pkg/.env.local", "X=agent"); });
    put(r.project, ".env", "KEY=mine");
    const res = await r.store.restore(t.before.id);
    expect(res.yours).toEqual([".env"]);
    expect(text(r.project, ".env")).toBe("KEY=mine");
    expect(text(r.project, "pkg/.env.local")).toBe("X=1");
    const back = await r.store.putBack(t.before.id);
    expect(back.putBack).toEqual([".env"]);
    expect(text(r.project, ".env")).toBe("KEY=old");
    expect(readFileSync(join(back.savedTo, ".env"), "utf8")).toBe("KEY=mine");
  });

  test("a note about a path outside the project is ignored", async () => {
    const r = rig();
    const t = await task(r, "one", () => put(r.project, "a.js", "a1"));
    r.store.notePersonEdit("../outside.txt"); r.store.notePersonEdit("/etc/passwd"); r.store.notePersonEdit(".git/config");
    const res = await r.store.restore(t.before.id);
    expect(res.yours).toEqual([]);
  });

  test("a damaged note file never blocks Undo", async () => {
    const r = rig();
    const t = await task(r, "one", () => put(r.project, "a.js", "a1"));
    writeFileSync(join(r.shadow, "own.json"), "{ not json");
    const res = await r.store.restore(t.before.id);
    expect(text(r.project, "a.js")).toBe("a0");
    expect(res.yours).toEqual([]);
  });
});
