// Must fix 27 (M57 step 2): a snapshot no longer reads and hashes every file of the project again. The index the last
// snapshot ended with is kept and copied as the next one's start, so git rereads only files whose size or modified time
// changed. These tests check that Undo still restores exactly, that a change is never missed (the same size, the same
// second, a file deleted, a new one, a big one skipped), and that a kept index that does not match is never used.
// Every project here is a temporary fixture folder.
import { afterEach, describe, expect, test } from "bun:test";
import { createHash } from "node:crypto";
import { existsSync, lstatSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, utimesSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, relative } from "node:path";
import { CheckpointStore } from "../src/checkpoints.ts";

const made: string[] = [];
afterEach(() => { while (made.length) rmSync(made.pop()!, { recursive: true, force: true }); });
function tmp(label: string): string { const d = mkdtempSync(join(tmpdir(), `companion-test-fast-${label}-`)); made.push(d); return d; }
function write(dir: string, files: Record<string, string>) { for (const [p, c] of Object.entries(files)) { mkdirSync(join(dir, p, ".."), { recursive: true }); writeFileSync(join(dir, p), c); } }
function treeHash(dir: string): string {
  const h = createHash("sha256");
  const walk = (d: string) => {
    for (const name of readdirSync(d).sort()) {
      const p = join(d, name), st = lstatSync(p);
      h.update(relative(dir, p) + ":" + st.size + ":" + (st.mode & 0o777));
      if (st.isDirectory()) walk(p); else if (st.isFile()) h.update(readFileSync(p));
    }
  };
  walk(dir);
  return h.digest("hex");
}
const kept = (shadow: string) => readdirSync(shadow).filter((n) => n.startsWith("index-snap-"));

describe("must fix 27: snapshots start from the last snapshot's index", () => {
  test("after a snapshot one index is kept, named by the tree it wrote; the next one replaces it", async () => {
    const p = tmp("proj"), shadow = tmp("shadow");
    write(p, { "a.ts": "one\n" });
    const s = new CheckpointStore(shadow, p);
    await s.snapshot("first");
    expect(kept(shadow).length).toBe(1);
    const first = kept(shadow)[0];
    write(p, { "a.ts": "two\n" });
    await s.snapshot("second");
    expect(kept(shadow).length).toBe(1);
    expect(kept(shadow)[0]).not.toBe(first);
  });

  test("a change of the same size in the same second is still caught, and Undo restores every byte", async () => {
    const p = tmp("proj"), shadow = tmp("shadow");
    write(p, { "a.ts": "aaaa\n", "src/b.ts": "bbbb\n", "src/c.ts": "cccc\n" });
    const s = new CheckpointStore(shadow, p);
    const before = treeHash(p);
    const c1 = await s.snapshot("first");
    write(p, { "a.ts": "AAAA\n" });   // same size, at once
    const c2 = await s.snapshot("second");
    expect(await s.diff(c1.id, c2.id)).toEqual([{ file: "a.ts", kind: "modified" }]);
    write(p, { "src/b.ts": "BBBB\n" });
    rmSync(join(p, "src/c.ts"));
    write(p, { "new.ts": "new\n" });
    const c3 = await s.snapshot("third");
    expect((await s.diff(c2.id, c3.id)).sort((x, y) => x.file.localeCompare(y.file))).toEqual([
      { file: "new.ts", kind: "added" }, { file: "src/b.ts", kind: "modified" }, { file: "src/c.ts", kind: "deleted" },
    ]);
    await s.restore(c1.id);
    expect(treeHash(p)).toBe(before);
  });

  test("a file changed with its size and modified time put back the same is the one case trusted by time, as git does", async () => {
    // Kept here so the trade is written down: the change is caught once the time differs.
    const p = tmp("proj"), shadow = tmp("shadow");
    write(p, { "a.ts": "aaaa\n" });
    const old = new Date(Date.now() - 60_000);
    utimesSync(join(p, "a.ts"), old, old);
    const s = new CheckpointStore(shadow, p);
    const c1 = await s.snapshot("first");
    write(p, { "a.ts": "zzzz\n" });
    const c2 = await s.snapshot("second");
    expect(await s.diff(c1.id, c2.id)).toEqual([{ file: "a.ts", kind: "modified" }]);
  });

  test("after Undo, the next snapshot sees the project as Undo left it", async () => {
    const p = tmp("proj"), shadow = tmp("shadow");
    write(p, { "a.ts": "one\n", "b.ts": "keep\n" });
    const s = new CheckpointStore(shadow, p);
    const c1 = await s.snapshot("Before: task");
    write(p, { "a.ts": "two!\n", "c.ts": "added\n" });
    const c2 = await s.snapshot("After: task");
    await s.restore(c1.id);
    const c3 = await s.snapshot("later");
    expect(await s.diff(c1.id, c3.id)).toEqual([]);
    expect(await s.diff(c2.id, c3.id)).toEqual([{ file: "a.ts", kind: "modified" }, { file: "c.ts", kind: "deleted" }]);
    write(p, { "a.ts": "three\n" });
    const c4 = await s.snapshot("again");
    await s.restore(c2.id, { protect: false });
    expect(readFileSync(join(p, "a.ts"), "utf8")).toBe("two!\n");
    expect(readFileSync(join(p, "c.ts"), "utf8")).toBe("added\n");
    await s.restore(c4.id, { protect: false });
    expect(readFileSync(join(p, "a.ts"), "utf8")).toBe("three\n");
    expect(existsSync(join(p, "c.ts"))).toBe(false);
  });

  test("a kept index for another tree, or a damaged one, is never used: the snapshot is still right", async () => {
    const p = tmp("proj"), shadow = tmp("shadow");
    write(p, { "a.ts": "one\n", "b.ts": "two\n" });
    const s = new CheckpointStore(shadow, p);
    const c1 = await s.snapshot("first");
    // Damaged: the snapshot falls back to reading everything.
    for (const n of kept(shadow)) writeFileSync(join(shadow, n), "not an index");
    write(p, { "b.ts": "TWO\n" });
    let c2;
    try { c2 = await s.snapshot("second"); } catch (e) { throw new Error(`a damaged kept index broke the snapshot: ${e}`); }
    expect(await s.diff(c1.id, c2.id)).toEqual([{ file: "b.ts", kind: "modified" }]);
    // For another tree (a stale name): not used.
    for (const n of kept(shadow)) rmSync(join(shadow, n));
    writeFileSync(join(shadow, `index-snap-${"0".repeat(40)}`), "x");
    write(p, { "a.ts": "ONE\n" });
    const c3 = await s.snapshot("third");
    expect(await s.diff(c2.id, c3.id)).toEqual([{ file: "a.ts", kind: "modified" }]);
    const c3files = await s.readFiles(c3.id, () => true);
    expect(c3files).toEqual({ "a.ts": "ONE\n", "b.ts": "TWO\n" });
  });

  test("a big file skipped and a new folder are handled as before", async () => {
    const p = tmp("proj"), shadow = tmp("shadow");
    write(p, { "a.ts": "one\n" });
    const s = new CheckpointStore(shadow, p);
    const c1 = await s.snapshot("first");
    writeFileSync(join(p, "big.bin"), Buffer.alloc(3 * 1024 * 1024, 1));
    write(p, { "deep/x/y.ts": "y\n" });
    const c2 = await s.snapshot("second");
    expect(c2.skipped.map((x) => x.path)).toEqual(["big.bin"]);
    expect(await s.diff(c1.id, c2.id)).toEqual([{ file: "deep/x/y.ts", kind: "added" }]);
    const c3 = await s.snapshot("third");
    expect(await s.diff(c2.id, c3.id)).toEqual([]);
  });

  test("speed: an unchanged project of 4000 files is saved again faster than the first time (printed)", async () => {
    const p = tmp("proj"), shadow = tmp("shadow");
    const body = "x".repeat(20_000);
    for (let i = 0; i < 4000; i++) { if (i % 200 === 0) mkdirSync(join(p, `src/m${i / 200}`), { recursive: true }); writeFileSync(join(p, `src/m${Math.floor(i / 200)}/f${i}.ts`), `// ${i}\n${body}\n`); }
    const s = new CheckpointStore(shadow, p);
    let t = performance.now();
    await s.snapshot("first");
    const first = performance.now() - t;
    t = performance.now();
    await s.snapshot("second, nothing changed");
    const second = performance.now() - t;
    write(p, { "src/m0/f0.ts": "changed\n" });
    t = performance.now();
    const c3 = await s.snapshot("third, one file changed");
    const third = performance.now() - t;
    console.log(`[snapshots, 4000 files of 20 KB] first ${first.toFixed(0)} ms, unchanged ${second.toFixed(0)} ms, one changed ${third.toFixed(0)} ms`);
    expect(second).toBeLessThan(first);
    expect((await s.readFiles(c3.id, (x) => x === "src/m0/f0.ts"))["src/m0/f0.ts"]).toBe("changed\n");
  }, 120_000);
});
