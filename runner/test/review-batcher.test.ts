// M52: the watcher on the open project folder. A batch is ready only once nothing has changed for the quiet time, never
// while files still change and never while the engine's own work runs there. Ignored folders, editor scratch files and
// the engine's own writes never count, and one batch holds at most a fixed number of paths.
import { afterEach, describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ChangeBatcher, ignoredPath, type WatchFn } from "../src/review/batcher.ts";

const made: string[] = [];
afterEach(() => { while (made.length) rmSync(made.pop()!, { recursive: true, force: true }); });
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** A file event source the test drives by hand. */
function fake() {
  let send: ((rel: string) => void) | null = null;
  let closed = 0;
  const watch: WatchFn = (_dir, on) => { send = on; return { close: () => { closed++; send = null; } }; };
  return { watch, fire: (...rels: string[]) => { for (const r of rels) send?.(r); }, closed: () => closed, live: () => send !== null };
}
function batcher(o: { quietMs?: number; maxPaths?: number; busy?: () => boolean; graceMs?: number } = {}) {
  const f = fake();
  const ready: { paths: string[]; capped: boolean }[] = [];
  const b = new ChangeBatcher({ project: "/tmp/x", quietMs: () => o.quietMs ?? 60, maxPaths: o.maxPaths, busy: o.busy, graceMs: o.graceMs ?? 40, watch: f.watch, onReady: (paths, capped) => ready.push({ paths, capped }) });
  b.start();
  return { b, f, ready };
}

describe("what is ignored", () => {
  test("git, installed packages, build and cache folders, the engine's own folder, Claude's, and editor scratch files", () => {
    for (const p of [".git/index", "node_modules/react/index.js", "dist/app.js", "build/x", ".next/cache/a", "out/index.html", "coverage/lcov.info", ".turbo/x", ".cache/y", ".venv/lib/a.py", "app/__pycache__/m.pyc", ".companion/notes.md", ".claude/settings.json", ".DS_Store", "src/.DS_Store", ".svelte-kit/x", ".vercel/output/a", "src/App.tsx~", "src/.#App.tsx", "src/.App.tsx.swp", "src/4913", "target/debug/app"]) {
      expect(ignoredPath(p), p).toBe(true);
    }
    for (const p of ["src/App.tsx", ".env", "package.json", "public/logo.svg", "app/page.tsx", "docs/build-notes.md", ".github/workflows/ci.yml"]) expect(ignoredPath(p), p).toBe(false);
  });
  test("a path that leaves the folder is never taken", () => {
    for (const p of ["../outside.txt", "/etc/passwd", "a/../../b", ""]) expect(ignoredPath(p), p).toBe(true);
  });
});

describe("debounce: ready only after the quiet time", () => {
  test("changes that keep coming push the batch back; one batch once they stop", async () => {
    const { f, ready } = batcher({ quietMs: 80 });
    f.fire("src/a.ts");
    await sleep(40); f.fire("src/b.ts");
    await sleep(40); f.fire("src/a.ts");
    await sleep(40);
    expect(ready).toEqual([]);
    await sleep(120);
    expect(ready).toEqual([{ paths: ["src/a.ts", "src/b.ts"], capped: false }]);
  });
  test("ignored paths never start or extend a batch", async () => {
    const { f, ready } = batcher({ quietMs: 40 });
    f.fire("node_modules/x/y.js", ".git/HEAD", ".companion/state.json");
    await sleep(100);
    expect(ready).toEqual([]);
  });
  test("the quiet time is read each time a batch is armed, so a new setting is used for the next one", async () => {
    let quiet = 40;
    const f = fake();
    const ready: string[][] = [];
    const b = new ChangeBatcher({ project: "/tmp/x", quietMs: () => quiet, watch: f.watch, onReady: (p) => ready.push(p) });
    b.start();
    quiet = 200;
    f.fire("a.ts");
    await sleep(100);
    expect(ready).toEqual([]);
    await sleep(160);
    expect(ready).toEqual([["a.ts"]]);
    b.stop();
  });
});

describe("the cap on one batch", () => {
  test("past the cap no more paths are kept, and the batch says it was capped", async () => {
    const { f, ready } = batcher({ quietMs: 40, maxPaths: 3 });
    f.fire("a", "b", "c", "d", "e");
    await sleep(100);
    expect(ready).toEqual([{ paths: ["a", "b", "c"], capped: true }]);
  });
});

describe("the engine's own work", () => {
  test("while its own work runs in the project, changes are not counted, and for a moment after it ends", async () => {
    const { b, f, ready } = batcher({ quietMs: 40, graceMs: 60 });
    b.holdOwn();
    f.fire("src/fixed.ts");
    await sleep(80);
    b.releaseOwn();
    f.fire("src/late-event.ts");   // file events can arrive a little after the work that caused them ended
    await sleep(100);
    expect(ready).toEqual([]);
    f.fire("src/theirs.ts");
    await sleep(80);
    expect(ready).toEqual([{ paths: ["src/theirs.ts"], capped: false }]);
  });
  test("own work that overlaps counts as one: changes are counted only once all of it has ended", async () => {
    const { b, f, ready } = batcher({ quietMs: 30, graceMs: 10 });
    b.holdOwn(); b.holdOwn();
    b.releaseOwn();
    await sleep(30);
    f.fire("src/a.ts");
    await sleep(60);
    expect(ready).toEqual([]);
    b.releaseOwn();
    await sleep(30);
    f.fire("src/b.ts");
    await sleep(60);
    expect(ready).toEqual([{ paths: ["src/b.ts"], capped: false }]);
  });
  test("when the quiet time ends while other work of the engine is busy, the batch waits for it", async () => {
    let busy = true;
    const { f, ready } = batcher({ quietMs: 40, busy: () => busy });
    f.fire("src/a.ts");
    await sleep(100);
    expect(ready).toEqual([]);
    busy = false;
    await sleep(80);
    expect(ready).toEqual([{ paths: ["src/a.ts"], capped: false }]);
  });
  test("take hands over what is waiting now and stops its timer", async () => {
    const { b, f, ready } = batcher({ quietMs: 40 });
    f.fire("src/a.ts", "src/b.ts");
    expect(b.take()).toEqual({ paths: ["src/a.ts", "src/b.ts"], capped: false });
    await sleep(80);
    expect(ready).toEqual([]);
    expect(b.take()).toEqual({ paths: [], capped: false });
  });
});

describe("start and stop", () => {
  test("stop closes the folder's events and drops what was waiting; nothing fires after", async () => {
    const { b, f, ready } = batcher({ quietMs: 40 });
    f.fire("src/a.ts");
    b.stop();
    expect(f.closed()).toBe(1);
    await sleep(80);
    expect(ready).toEqual([]);
    b.stop();
    expect(f.closed()).toBe(1);
  });
  test("a folder that cannot be watched is said so, and nothing is started", () => {
    const b = new ChangeBatcher({ project: "/tmp/x", quietMs: () => 10, watch: () => { throw new Error("no"); }, onReady: () => {} });
    expect(b.start()).toBe(false);
    b.stop();
  });
});

describe("the real file events on this Mac", () => {
  test("a change deep in the folder is seen, installed packages are not, and the paths are relative", async () => {
    const dir = mkdtempSync(join(tmpdir(), "companion-test-review-watch-"));
    made.push(dir);
    mkdirSync(join(dir, "src/deep"), { recursive: true });
    mkdirSync(join(dir, "node_modules/pkg"), { recursive: true });
    const ready: string[][] = [];
    const b = new ChangeBatcher({ project: dir, quietMs: () => 400, onReady: (p) => ready.push(p) });
    expect(b.start()).toBe(true);
    await sleep(300);
    writeFileSync(join(dir, "src/deep/a.ts"), "export const a = 1;\n");
    writeFileSync(join(dir, "node_modules/pkg/i.js"), "x");
    for (let i = 0; i < 40 && !ready.length; i++) await sleep(100);
    b.stop();
    expect(ready.length).toBe(1);
    expect(ready[0]).toContain("src/deep/a.ts");
    expect(ready[0].some((p) => p.startsWith("node_modules"))).toBe(false);
    expect(ready[0].every((p) => !p.startsWith("/"))).toBe(true);
  });
});
