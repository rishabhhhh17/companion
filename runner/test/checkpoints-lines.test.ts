// M66 (the size of a change on the result card): how many lines each file gained and lost between two saved versions, as
// git counts them, and for a file that lost many, how long it was before. Temporary fixture folders only (never a real
// project's git).
import { afterEach, describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { CheckpointStore, REWRITE_MIN_LINES } from "../src/checkpoints.ts";

const made: string[] = [];
afterEach(() => { while (made.length) rmSync(made.pop()!, { recursive: true, force: true }); });
const tmp = (label: string) => { const d = mkdtempSync(join(tmpdir(), `companion-lines-${label}-`)); made.push(d); return d; };
const put = (root: string, files: Record<string, string | Uint8Array>) => { for (const [p, c] of Object.entries(files)) { mkdirSync(join(root, p, ".."), { recursive: true }); writeFileSync(join(root, p), c); } };
const lines = (n: number, word = "line") => Array.from({ length: n }, (_, i) => `${word} ${i + 1}`).join("\n") + "\n";

describe("line counts between two versions", () => {
  test("a small edit, an added file, a removed file and a rewrite are each counted by git", async () => {
    const p = tmp("proj");
    put(p, { "login.js": lines(30), "page.html": lines(400), "old.txt": lines(5) });
    const s = new CheckpointStore(tmp("shadow"), p);
    const a = await s.snapshot("before");
    const login = lines(30).replace("line 3\n", "line three\n").replace("line 7\n", "line seven\n");
    put(p, { "login.js": login, "page.html": lines(412, "new"), "new.css": lines(4) });
    rmSync(join(p, "old.txt"));
    const b = await s.snapshot("after");
    const c = await s.lineCounts(a.id, b.id);
    expect(c["login.js"]).toEqual({ added: 2, removed: 2 });
    expect(c["new.css"]).toEqual({ added: 4, removed: 0 });
    expect(c["old.txt"]).toEqual({ added: 0, removed: 5 });
    // Lost at least REWRITE_MIN_LINES lines: how long it was before is read too.
    expect(c["page.html"]).toEqual({ added: 412, removed: 400, was: 400 });
    expect(REWRITE_MIN_LINES).toBe(40);
  });
  test("a file that is not text has no numbers, and no change gives nothing", async () => {
    const p = tmp("proj");
    put(p, { "logo.png": new Uint8Array([137, 80, 78, 71, 0, 1, 2, 3, 0, 0]) });
    const s = new CheckpointStore(tmp("shadow"), p);
    const a = await s.snapshot("before");
    put(p, { "logo.png": new Uint8Array([137, 80, 78, 71, 0, 9, 9, 9, 0, 0]) });
    const b = await s.snapshot("after");
    expect(await s.lineCounts(a.id, b.id)).toEqual({});
    expect(await s.lineCounts(b.id, b.id)).toEqual({});
  });
  test("counting only reads: the shadow store and the project are exactly as they were, and the project gets no git", async () => {
    const p = tmp("proj"); put(p, { "a.txt": lines(50) });
    const shadow = tmp("shadow");
    const s = new CheckpointStore(shadow, p);
    const a = await s.snapshot("before");
    put(p, { "a.txt": lines(3) });
    const b = await s.snapshot("after");
    const tree = (root: string) => {
      const out: string[] = [];
      const walk = (d: string) => { for (const e of readdirSync(d, { withFileTypes: true })) { const f = join(d, e.name); if (e.isDirectory()) walk(f); else { const st = statSync(f); out.push(`${f}:${st.size}:${st.mtimeMs}`); } } };
      walk(root); return out.sort();
    };
    const before = { shadow: tree(shadow), proj: tree(p) };
    expect(await s.lineCounts(a.id, b.id)).toEqual({ "a.txt": { added: 0, removed: 47, was: 50 } });
    expect(tree(shadow)).toEqual(before.shadow);
    expect(tree(p)).toEqual(before.proj);
    expect(readdirSync(p)).not.toContain(".git");
  });
  test("an unknown version is an error, never made up numbers", async () => {
    const p = tmp("proj"); put(p, { "a.txt": "a\n" });
    const s = new CheckpointStore(tmp("shadow"), p);
    const a = await s.snapshot("before");
    await expect(s.lineCounts(a.id, "cp_9999")).rejects.toThrow();
  });
});
