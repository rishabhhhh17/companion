// M57 step 1 (rule 18): the review's watcher on this real Mac, with the real folder events (Bun's recursive fs.watch, which
// is FSEvents on macOS), a temporary folder only and no model. It writes the way AI coding tools write: many small saves,
// a save that writes a new file and renames it over the old one, a burst of 1500 files, one file rewritten 50 times in 5
// seconds, a folder deleted and made again, and writes into node_modules and .git that must never count. It checks that a
// batch forms only after the quiet time, that the cap holds, that nothing is lost or counted twice, and it prints the
// time a batch takes and the processor time the watcher uses while idle and during a burst.
// Real Claude Code, Codex and Cursor are not run here: that needs a person's hands (M52 [verify]).
import { afterEach, describe, expect, test } from "bun:test";
import { appendFileSync, mkdirSync, mkdtempSync, realpathSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ChangeBatcher, MAX_PATHS } from "../src/review/batcher.ts";
import { CheckpointStore } from "../src/checkpoints.ts";
import { ReviewService } from "../src/review/service.ts";

const MAC = process.platform === "darwin";
const made: string[] = [];
const live: ChangeBatcher[] = [];
const services: ReviewService[] = [];
afterEach(() => { while (services.length) services.pop()!.stop(); while (live.length) live.pop()!.stop(); while (made.length) rmSync(made.pop()!, { recursive: true, force: true }); });
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const QUIET = 400;

type Ready = { paths: string[]; capped: boolean; at: number };
function folder(): string { const d = realpathSync(mkdtempSync(join(tmpdir(), "companion-test-watch-real-"))); made.push(d); return d; }
async function watching(dir: string, o: { maxPaths?: number } = {}) {
  const ready: Ready[] = [];
  const b = new ChangeBatcher({ project: dir, quietMs: () => QUIET, maxPaths: o.maxPaths, onReady: (paths, capped) => ready.push({ paths, capped, at: performance.now() }) });
  expect(b.start()).toBe(true);
  live.push(b);
  await sleep(300);   // FSEvents starts a moment after the stream is made
  return { b, ready };
}
async function until(pred: () => boolean, ms = 10_000) { const end = Date.now() + ms; while (!pred() && Date.now() < end) await sleep(20); return pred(); }
/** Processor time (user plus system, in milliseconds) this process used while fn ran. */
async function cpu(fn: () => Promise<void>): Promise<{ ms: number; wall: number }> {
  const a = process.cpuUsage(), t = performance.now();
  await fn();
  const d = process.cpuUsage(a);
  return { ms: (d.user + d.system) / 1000, wall: performance.now() - t };
}
const say = (line: string) => console.log(`[watcher on this Mac] ${line}`);
const all = (r: Ready[]) => r.flatMap((x) => x.paths);
const twice = (r: Ready[]) => { const seen = new Set<string>(), out: string[] = []; for (const p of all(r)) { if (seen.has(p)) out.push(p); seen.add(p); } return out; };

describe.skipIf(!MAC)("the review's watcher on this Mac (real folder events)", () => {
  test("many small saves with short gaps: one batch, only after the quiet time, the file once", async () => {
    const dir = folder();
    const { ready } = await watching(dir);
    let last = 0;
    for (let i = 0; i < 20; i++) { appendFileSync(join(dir, "app.ts"), `line ${i}\n`); last = performance.now(); await sleep(40); }
    expect(ready).toEqual([]);   // still writing: nothing said yet
    expect(await until(() => ready.length === 1)).toBe(true);
    expect(ready[0].paths).toEqual(["app.ts"]);
    expect(ready[0].at - last).toBeGreaterThanOrEqual(QUIET - 50);
    say(`20 small saves 40 ms apart: one batch ${Math.round(ready[0].at - last)} ms after the last save (quiet time ${QUIET} ms)`);
    await sleep(1500);
    expect(ready.length).toBe(1);   // no late event makes a second batch
  }, 20_000);

  test("a save that writes a new file and renames it over the old one (how editors and tools save)", async () => {
    const dir = folder();
    mkdirSync(join(dir, "src"));
    writeFileSync(join(dir, "src/page.tsx"), "old\n");
    writeFileSync(join(dir, "src/util.ts"), "old\n");
    const { ready } = await watching(dir);
    // A temporary name beside the file, then a rename over it (Claude Code's own writes, VS Code and Cursor's atomic save).
    const tmpA = join(dir, `src/page.tsx.tmp.${process.pid}.${Date.now()}`);
    writeFileSync(tmpA, "new\n"); renameSync(tmpA, join(dir, "src/page.tsx"));
    // An editor that keeps a backup name: util.ts~ is written and removed (vim's backup), then util.ts is written.
    writeFileSync(join(dir, "src/util.ts~"), "old\n"); writeFileSync(join(dir, "src/util.ts"), "new\n"); rmSync(join(dir, "src/util.ts~"));
    expect(await until(() => ready.length === 1)).toBe(true);
    await sleep(QUIET + 600);
    const paths = all(ready);
    expect(paths).toContain("src/page.tsx");
    expect(paths).toContain("src/util.ts");
    expect(paths).not.toContain("src/util.ts~");
    // Found here first: the temporary name and the folder were in the batch's paths. Both are left out now (batcher.ts).
    expect(paths).toEqual(["src/page.tsx", "src/util.ts"]);
    say(`rename over a file: batch paths ${JSON.stringify(paths)}`);
    expect(twice(ready)).toEqual([]);
  }, 20_000);

  test("a burst of 1500 new files: one batch after the quiet time, capped at the limit; with a higher limit none is lost", async () => {
    const dir = folder();
    const { ready } = await watching(dir);
    const t0 = performance.now();
    for (let i = 0; i < 1500; i++) { if (i % 100 === 0) mkdirSync(join(dir, `gen/d${i / 100}`), { recursive: true }); writeFileSync(join(dir, `gen/d${Math.floor(i / 100)}/f${i}.ts`), `export const n = ${i};\n`); }
    const wrote = performance.now() - t0;
    expect(await until(() => ready.length >= 1)).toBe(true);
    await sleep(QUIET + 600);
    expect(ready.length).toBe(1);
    expect(ready[0].capped).toBe(true);
    expect(ready[0].paths.length).toBe(MAX_PATHS);
    say(`1500 files written in ${Math.round(wrote)} ms: one batch, capped at ${ready[0].paths.length} paths`);

    // The same burst with room for all of them: every file arrives once (folders are paths too).
    const dir2 = folder();
    const w2 = await watching(dir2, { maxPaths: 10_000 });
    for (let i = 0; i < 1500; i++) { if (i % 100 === 0) mkdirSync(join(dir2, `gen/d${i / 100}`), { recursive: true }); writeFileSync(join(dir2, `gen/d${Math.floor(i / 100)}/f${i}.ts`), `export const n = ${i};\n`); }
    expect(await until(() => w2.ready.length >= 1)).toBe(true);
    await sleep(QUIET + 1000);
    const got = new Set(all(w2.ready));
    const missing: string[] = [];
    for (let i = 0; i < 1500; i++) { const p = `gen/d${Math.floor(i / 100)}/f${i}.ts`; if (!got.has(p)) missing.push(p); }
    say(`1500 files with no cap: ${got.size} paths in ${w2.ready.length} batch(es), ${missing.length} missing, ${twice(w2.ready).length} counted twice`);
    expect(missing).toEqual([]);
    expect(got.size).toBe(1500);   // the 15 folders take no place
    expect(twice(w2.ready)).toEqual([]);
  }, 40_000);

  test("one file rewritten 50 times in 5 seconds: no batch while it is written, one after, the file once", async () => {
    const dir = folder();
    const { ready } = await watching(dir);
    let last = 0;
    for (let i = 0; i < 50; i++) { writeFileSync(join(dir, "main.py"), `print(${i})\n`); last = performance.now(); await sleep(100); }
    expect(ready).toEqual([]);
    expect(await until(() => ready.length === 1)).toBe(true);
    expect(ready[0].paths).toEqual(["main.py"]);
    say(`one file rewritten 50 times over 5 s: one batch ${Math.round(ready[0].at - last)} ms after the last write`);
    await sleep(1500);
    expect(ready.length).toBe(1);
  }, 30_000);

  test("a folder deleted and made again: its files are seen, and the watcher keeps working after", async () => {
    const dir = folder();
    mkdirSync(join(dir, "components"));
    for (const n of ["a", "b", "c"]) writeFileSync(join(dir, `components/${n}.tsx`), "x\n");
    const { ready } = await watching(dir);
    rmSync(join(dir, "components"), { recursive: true });
    mkdirSync(join(dir, "components"));
    for (const n of ["a", "d"]) writeFileSync(join(dir, `components/${n}.tsx`), "y\n");
    expect(await until(() => ready.length === 1)).toBe(true);
    const first = all(ready);
    for (const p of ["components/a.tsx", "components/d.tsx"]) expect(first).toContain(p);
    say(`folder deleted and made again: batch paths ${JSON.stringify(first)}`);
    // Still watching: a later save in the new folder is the next batch.
    writeFileSync(join(dir, "components/d.tsx"), "z\n");
    expect(await until(() => ready.length === 2)).toBe(true);
    expect(ready[1].paths).toEqual(["components/d.tsx"]);
  }, 20_000);

  test("writes into node_modules and .git never count", async () => {
    const dir = folder();
    mkdirSync(join(dir, "node_modules/react"), { recursive: true });
    mkdirSync(join(dir, ".git/objects/ab"), { recursive: true });
    const { ready } = await watching(dir);
    for (let i = 0; i < 300; i++) writeFileSync(join(dir, `node_modules/react/f${i}.js`), "x");
    for (let i = 0; i < 50; i++) writeFileSync(join(dir, `.git/objects/ab/o${i}`), "x");
    writeFileSync(join(dir, ".git/index.lock"), "x"); renameSync(join(dir, ".git/index.lock"), join(dir, ".git/index"));
    await sleep(QUIET + 1200);
    expect(ready).toEqual([]);
  }, 20_000);

  test("a pause longer than the quiet time between saves: two batches, each with only its own file, none lost or merged", async () => {
    const dir = folder();
    const { ready } = await watching(dir);
    writeFileSync(join(dir, "first.ts"), "1\n");
    expect(await until(() => ready.length === 1)).toBe(true);
    await sleep(QUIET * 3);   // well past the quiet time, with nothing written
    expect(ready.length).toBe(1);
    const t = performance.now();
    writeFileSync(join(dir, "second.ts"), "2\n");
    expect(await until(() => ready.length === 2)).toBe(true);
    expect(ready[0].paths).toEqual(["first.ts"]);
    expect(ready[1].paths).toEqual(["second.ts"]);
    say(`a pause of ${QUIET * 3} ms between two saves: two batches, the second ${Math.round(ready[1].at - t)} ms after its save`);
    await sleep(1000);
    expect(ready.length).toBe(2);
  }, 20_000);

  test("the folder closed and opened again: the watcher stops, sees nothing while closed, and the first save after reopening arrives", async () => {
    const dir = folder();
    const one = await watching(dir);
    writeFileSync(join(dir, "before.ts"), "1\n");
    expect(await until(() => one.ready.length === 1)).toBe(true);
    one.b.stop();
    writeFileSync(join(dir, "while-closed.ts"), "x\n");
    await sleep(QUIET + 600);
    expect(one.ready.length).toBe(1);   // a stopped watcher says nothing
    const two = await watching(dir);
    const t = performance.now();
    writeFileSync(join(dir, "after.ts"), "2\n");
    expect(await until(() => two.ready.length === 1)).toBe(true);
    expect(two.ready[0].paths).toEqual(["after.ts"]);   // what changed while closed is the shadow store's job, not the events'
    say(`closed and opened again: the first save after reopening arrived ${Math.round(two.ready[0].at - t)} ms after it`);
  }, 20_000);

  test("through the review service with the real shadow store: real batches reach the snapshot diff, and the while closed comparison works after a reopen", async () => {
    const dir = folder(), shadow = folder();
    mkdirSync(join(dir, "src"));
    writeFileSync(join(dir, "src/app.ts"), "export const a = 1;\n");
    const store = new CheckpointStore(join(shadow, "p.git"), dir);
    const start = (events: Record<string, any>[]) => {
      const values: Record<string, unknown> = { "review.mode": "ask", "flow.on": true };
      const svc = new ReviewService({ emit: (e) => events.push(e), setting: (k) => values[k], store: () => store, cheap: null, strong: null, spend: { room: () => 10, book: () => {} }, quietMs: () => QUIET });
      services.push(svc);
      return svc;
    };
    const batches = (ev: Record<string, any>[]) => ev.filter((e) => e.type === "review.batch" && e.count > 0);
    // First run: real folder events, a real snapshot, the diff names the file.
    const ev1: Record<string, any>[] = [];
    const s1 = start(ev1);
    s1.setProject(dir); await s1.ready(); await sleep(300);
    writeFileSync(join(dir, "src/app.ts"), "export const a = 2;\n");
    expect(await until(() => batches(ev1).length >= 1)).toBe(true);
    expect(batches(ev1)[0]).toMatchObject({ files: [{ file: "src/app.ts", kind: "modified" }], count: 1 });
    expect(batches(ev1)[0].away).toBeUndefined();
    s1.stop();
    // Closed: a file is added. Opened again: the comparison offers it, marked as from while closed.
    writeFileSync(join(dir, "src/late.ts"), "export const late = 1;\n");
    const ev2: Record<string, any>[] = [];
    const s2 = start(ev2);
    s2.setProject(dir); await s2.ready(); await sleep(300);
    expect(batches(ev2)[0]).toMatchObject({ away: "closed", files: [{ file: "src/late.ts", kind: "added" }] });
    // The first save after reopening is not lost: once the card from while closed is closed, it is its own batch.
    writeFileSync(join(dir, "src/app.ts"), "export const a = 3;\n");
    await sleep(QUIET + 600);
    await s2.handle({ v: 1, id: "d", type: "review.dismiss", project: dir, batch: batches(ev2)[0].batch } as never);
    expect(await until(() => batches(ev2).length >= 2)).toBe(true);
    const after = batches(ev2)[1];
    expect(after).toMatchObject({ files: [{ file: "src/app.ts", kind: "modified" }], count: 1 });
    expect(after.away).toBeUndefined();
    say("review service with the real store: a real batch named its file; after a reopen the while closed batch and the next save were both found");
  }, 40_000);

  test("processor time: idle, and during a burst of 1500 files (printed for the research doc)", async () => {
    // Without a watcher, the same writes, as the base to take away.
    const base = folder();
    const plain = await cpu(async () => { for (let i = 0; i < 1500; i++) writeFileSync(join(base, `f${i}.ts`), "x\n"); await sleep(QUIET + 600); });
    const dir = folder();
    const { ready } = await watching(dir);
    const idle = await cpu(async () => { await sleep(5000); });
    const burst = await cpu(async () => { for (let i = 0; i < 1500; i++) writeFileSync(join(dir, `f${i}.ts`), "x\n"); await until(() => ready.length >= 1); await sleep(QUIET + 600 - 0); });
    const idlePct = (idle.ms / idle.wall) * 100;
    say(`idle 5 s with the watcher on: ${idle.ms.toFixed(1)} ms of processor time (${idlePct.toFixed(2)}% of one core)`);
    say(`burst of 1500 files: ${burst.ms.toFixed(0)} ms with the watcher, ${plain.ms.toFixed(0)} ms for the same writes without it (the watcher's share about ${Math.max(0, burst.ms - plain.ms).toFixed(0)} ms)`);
    expect(idlePct).toBeLessThan(2);
    expect(ready.length).toBe(1);
  }, 40_000);
});
