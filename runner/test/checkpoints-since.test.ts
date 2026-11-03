// Must fix 11's cost (review of M56): asking whether the project changed since a version runs on every Home refresh, so it
// must not rehash the whole project each time, must not count as work for the weekly clean up's idle test, and must stay
// right after files change, vanish and after that clean up.
import { afterEach, describe, expect, test } from "bun:test";
import { existsSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { CheckpointStore } from "../src/checkpoints.ts";

const made: string[] = [];
afterEach(() => { while (made.length) rmSync(made.pop()!, { recursive: true, force: true }); });
const tmp = (l: string) => { const d = mkdtempSync(join(tmpdir(), `companion-since-${l}-`)); made.push(d); return d; };

describe("changed since a saved version", () => {
  test("keeps one index between asks, so unchanged files are not read again", async () => {
    const p = tmp("p"); writeFileSync(join(p, "a.txt"), "x"); writeFileSync(join(p, "b.txt"), "y");
    const s = new CheckpointStore(join(tmp("s"), "store.git"), p);
    const cp = await s.snapshot("checked");
    expect(await s.changedSinceNow(cp.id)).toEqual([]);
    expect(existsSync(join(s.shadowDir, "index-since"))).toBe(true);
    // No throwaway index is left behind either.
    expect(readdirSync(s.shadowDir).filter((n) => n.startsWith("index-tmp"))).toEqual([]);
    writeFileSync(join(p, "a.txt"), "edited");
    rmSync(join(p, "b.txt"));
    writeFileSync(join(p, "c.txt"), "new");
    expect((await s.changedSinceNow(cp.id)).sort((x, y) => x.file.localeCompare(y.file))).toEqual([
      { file: "a.txt", kind: "modified" }, { file: "b.txt", kind: "deleted" }, { file: "c.txt", kind: "added" },
    ]);
    writeFileSync(join(p, "a.txt"), "x"); writeFileSync(join(p, "b.txt"), "y"); rmSync(join(p, "c.txt"));
    expect(await s.changedSinceNow(cp.id)).toEqual([]);
  });
  test("does not count as work, so the weekly clean up still finds the store idle", async () => {
    const p = tmp("p"); writeFileSync(join(p, "a.txt"), "x");
    const s = new CheckpointStore(join(tmp("s"), "store.git"), p);
    const cp = await s.snapshot("checked");
    (s as unknown as { lastWork: number }).lastWork = 1;
    await s.changedSinceNow(cp.id);
    expect((s as unknown as { lastWork: number }).lastWork).toBe(1);
  });
  test("stays right after the clean up removed what only its index pointed at", async () => {
    const p = tmp("p"); writeFileSync(join(p, "a.txt"), "x");
    const s = new CheckpointStore(join(tmp("s"), "store.git"), p);
    const cp = await s.snapshot("checked");
    writeFileSync(join(p, "a.txt"), "only in the index for now");
    expect(await s.changedSinceNow(cp.id)).toEqual([{ file: "a.txt", kind: "modified" }]);
    await s.maintain({ force: true });
    writeFileSync(join(p, "z.txt"), "z");
    expect((await s.changedSinceNow(cp.id)).map((c) => c.file).sort()).toEqual(["a.txt", "z.txt"]);
  });
});
