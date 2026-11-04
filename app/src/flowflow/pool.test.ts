// M66 (the plan's fix 12): opening History, the notch's wings or the practice panel froze for over half a second under
// Friendly, because each small live character started its own WebGL context and compiled its shaders right then, on the
// open path. Now drawings come from a warm pool (pool.ts): made and compiled in an idle moment, taken ready on open, and
// given back (not thrown away) when they close.
import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { WarmPool, type PoolEntry } from "./pool.ts";

type Fake = { id: number; warmed: boolean; lost: boolean; resets: number; disposed: boolean };
function setup(o: { fail?: boolean; max?: number } = {}) {
  let n = 0;
  const idle: (() => void)[] = [];
  const made: Fake[] = [];
  const pool = new WarmPool<Fake>({
    make: () => { if (o.fail) return null; const r: Fake = { id: ++n, warmed: false, lost: false, resets: 0, disposed: false }; made.push(r); return { canvas: {} as HTMLCanvasElement, renderer: r }; },
    warm: async (r) => { r.warmed = true; },
    reset: (r) => { r.resets++; },
    lost: (r) => r.lost,
    dispose: (r) => { r.disposed = true; },
    idle: (f) => { idle.push(f); },
    max: o.max,
  });
  const runIdle = async () => { while (idle.length) idle.shift()!(); await new Promise((r) => setTimeout(r, 0)); };
  return { pool, idle, made, runIdle };
}

describe("the warm pool", () => {
  test("nothing is made or compiled on the open path: a take only hands over one that was warmed in an idle moment", async () => {
    const { pool, made, runIdle } = setup();
    expect(pool.take()).toBeNull();          // nothing warm yet: the caller shows the still picture meanwhile
    expect(made.length).toBe(0);              // and the take made nothing
    const ready = pool.warmSoon();
    expect(made.length).toBe(0);              // only asked: made in the idle callback
    await runIdle(); await ready;
    expect(made.length).toBe(1);
    const got = pool.take() as PoolEntry<Fake>;
    expect(got.renderer.warmed).toBe(true);
    expect(made.length).toBe(1);
  });
  test("keeping warm: once asked, a take is followed by an idle refill, so the next open is ready too", async () => {
    const { pool, made, runIdle } = setup();
    pool.keepWarm(); await runIdle();
    expect(pool.ready).toBe(1);
    pool.take();
    expect(pool.ready).toBe(0);
    await runIdle();
    expect(pool.ready).toBe(1);
    expect(made.length).toBe(2);
  });
  test("asking twice while one is being made makes one", async () => {
    const { pool, made, runIdle } = setup();
    const a = pool.warmSoon(), b = pool.warmSoon();
    await runIdle(); await Promise.all([a, b]);
    expect(made.length).toBe(1);
  });
  test("given back, it is cleaned and kept warm for the next open; past the most kept, it is let go", async () => {
    const { pool, runIdle } = setup({ max: 1 });
    await (async () => { const w = pool.warmSoon(); await runIdle(); await w; })();
    const a = pool.take()!;
    const w2 = pool.warmSoon(); await runIdle(); await w2;
    const b = pool.take()!;
    pool.give(a);
    expect(a.renderer.resets).toBe(1);
    expect(pool.ready).toBe(1);
    pool.give(b);                              // one is kept already: this one goes
    expect(b.renderer.disposed).toBe(true);
    expect(pool.take()).toBe(a);
  });
  test("a drawing whose GPU context was lost is never handed out again", async () => {
    const { pool, runIdle } = setup();
    const w = pool.warmSoon(); await runIdle(); await w;
    const a = pool.take()!;
    a.renderer.lost = true;
    pool.give(a);
    expect(a.renderer.disposed).toBe(true);
    expect(pool.ready).toBe(0);
  });
  test("where WebGL cannot start, warming ends with nothing ready, and the caller keeps the picture", async () => {
    const { pool, runIdle } = setup({ fail: true });
    const w = pool.warmSoon(); await runIdle();
    expect(await w).toBe(false);
    expect(pool.take()).toBeNull();
  });
});

describe("the live character uses the pool", () => {
  const read = (p: string) => readFileSync(new URL(p, import.meta.url), "utf8");
  test("the view takes a warm drawing, gives it back on close, and the small ones wait in the still picture", () => {
    const view = read("./view.tsx");
    expect(view).toContain("const got = flowflowPool().take() ?? (wait ? null : flowflowPool().fresh());");
    expect(view).toContain("flowflowPool().give(got)");
    expect(view).toContain("flowflowPool().warmSoon().then(");
    const mini = read("../flowflowMini.tsx");
    expect(mini).toMatch(/<FlowflowView [^\n]*waitForWarm placeholder=\{picture\} \/>/);
  });
  test("the renderer compiles off the open path and skips a size that did not change", () => {
    const r = read("./renderer.ts");
    expect(r).toContain("async warm(): Promise<void>");
    expect(r).toContain("compileAsync");
    expect(r).toMatch(/if \(cssW === this\.cssW && cssH === this\.cssH && dpr === this\.dpr\) return;/);
  });
});
