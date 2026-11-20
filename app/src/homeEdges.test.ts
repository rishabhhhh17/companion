// Feel round 1 (the founder, 18 Nov 2026, on the tall Home: "can you take the X button to the side of the screens and just
// completely use all the space?"): Close and Settings sit in the panel's top right corner, on the same right edge as the
// cards and the ask box, and every row of the top bar runs the full width of the column. The places never move when you
// switch between them, and the top bar stays in view while the page scrolls under it. A happy-dom test does no layout, so
// this bundles the real Home page (Bun.build, as sheetLayout.test.ts does), lays it out in the headless browser Squibby
// already uses for proof, and measures it.
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { existsSync, mkdtempSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const APP = join(import.meta.dir, "..");
const PW = join(APP, "../runner/node_modules/playwright-core/index.mjs");

/** The headless shell Squibby installs for proof, in the folder runner/src/proof/browser.ts names (read from there, one source). */
async function headlessShell(): Promise<string | null> {
  if (!existsSync(PW)) return null;
  let root: string;
  try { root = (await import("../../runner/src/proof/browser.ts")).browsersPath(); } catch { return null; }
  if (!existsSync(root)) return null;
  const dir = readdirSync(root).filter((d) => d.startsWith("chromium_headless_shell") && existsSync(join(root, d, "INSTALLATION_COMPLETE"))).sort().pop();
  if (!dir) return null;
  const inner = readdirSync(join(root, dir)).find((d) => d.startsWith("chrome-headless-shell"));
  const exe = inner ? join(root, dir, inner, "chrome-headless-shell") : "";
  return exe && existsSync(exe) ? exe : null;
}

const EXE = await headlessShell();
const CAN = !!EXE && existsSync(PW);
// Never a quiet pass: a Mac without the browser says so in the run's output.
if (!CAN) console.warn("homeEdges.test.ts: SKIPPED, no headless browser (open a proof check once in Squibby to install it) or no runner/node_modules");

const P = "/Users/me/shop";
let seq = 0;
const ev = (o: Record<string, unknown>) => ({ v: 1, id: `e${++seq}`, ...o });
const ago = (min: number) => new Date(Date.now() - min * 60_000).toISOString();
const REPLAY = [
  ev({ type: "runner.hello", runnerVersion: "0.0.1", sdk: "test" }), ev({ type: "auth.status", method: "api_key", source: "keychain" }),
  ev({ type: "tasks.list", project: P, tasks: [{ id: 1, label: "Make the signup button work", status: "done", usd: 0, startedAt: ago(43), endedAt: ago(40), checkpoint: "cp_0001", changed: 2, proof: "passed" }] }),
];
const stub = (layout: "tall" | "wide") => `(() => {
  const answers = {
    get_project: ${JSON.stringify(P)}, list_projects: [${JSON.stringify(P)}], claude_status: { state: "ready" },
    replay_events: ${JSON.stringify(REPLAY)},
    // GLASS (19 Nov 2026): these measure the bar of Before (look.material classic), where Close and the places live in the
    // bar; Glass puts them in the top strip and is measured in its own test (glassEdges.test.ts).
    settings_get: { values: { "look.layout": ${JSON.stringify(layout)}, "look.material": "classic" }, usual: {}, project: ${JSON.stringify(P)}, migrated: ["pageStorage.v1"], problems: [], changed: [] },
    home_geom: { shown: true }, key_map: null, practice_list: [], quiet_now: false,
    data_inventory: { items: [], keySaved: true, projectsWithNotes: 0 },
  };
  try { localStorage.setItem("companion.onboarded", "1"); } catch {}
  const listeners = new Map();
  window.__TAURI__ = {
    core: { invoke: async (cmd) => answers[cmd] },
    event: { listen: async (ev, cb) => { const s = listeners.get(ev) ?? new Set(); s.add(cb); listeners.set(ev, s); return () => s.delete(cb); } },
  };
  window.__fire = (ev, payload) => { for (const cb of [...(listeners.get(ev) ?? [])]) cb({ payload }); };
})();`;

let dir = "";
let server: ReturnType<typeof Bun.serve> | null = null;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let browser: any = null;

beforeAll(async () => {
  if (!CAN) return;
  dir = mkdtempSync(join(tmpdir(), "home-edges-"));
  const built = await Bun.build({ entrypoints: [join(APP, "src/card.tsx")], outdir: dir, target: "browser", define: { "process.env.NODE_ENV": '"production"' } });
  if (!built.success) throw new Error(`could not bundle the Home page: ${built.logs.join("\n")}`);
  const html = `<!doctype html><html lang="en" class="home-page"><head><meta charset="utf-8"><link rel="stylesheet" href="/card.css"></head>`
    + `<body class="home-page" data-label="card"><div id="root"></div><script type="module" src="/card.js"></script></body></html>`;
  server = Bun.serve({ port: 0, fetch(req) {
    const p = new URL(req.url).pathname;
    if (p === "/") return new Response(html, { headers: { "content-type": "text/html" } });
    const f = Bun.file(join(dir, p));
    return f.size ? new Response(f) : new Response("no", { status: 404 });
  } });
  const { chromium } = await import(PW);
  browser = await chromium.launch({ executablePath: EXE! });
}, 60_000);

afterAll(async () => {
  await browser?.close();
  server?.stop(true);
  if (dir) rmSync(dir, { recursive: true, force: true });
});

type Box = { left: number; right: number; top: number; bottom: number };
type Edges = { close: Box; gear: Box | null; chip: Box | null; places: Box | null; lastPlace: Box | null; ask: Box | null; list: Box | null; view: string; height: number };

/** Where the top bar's parts, the ask box and the list are, as the browser lays them out. */
function edges(): Edges {
  const box = (sel: string): Box | null => { const e = document.querySelector(sel); if (!e || !(e as HTMLElement).offsetParent) return null; const r = e.getBoundingClientRect(); return { left: r.left, right: r.right, top: r.top, bottom: r.bottom }; };
  const places = [...document.querySelectorAll(".bar > .places > .ui-place")];
  const last = places.at(-1)?.getBoundingClientRect();
  return {
    close: box(".bar .close")!, gear: box(".bar .bar-gear"), chip: box(".bar .bar-chip"), places: box(".bar > .places"),
    lastPlace: last ? { left: last.left, right: last.right, top: last.top, bottom: last.bottom } : null,
    ask: box(".askwrap .ask"), list: box(".work .ui-mlist"), view: document.querySelector(".home")!.getAttribute("data-view") ?? "", height: window.innerHeight,
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function open(vp: { width: number; height: number }, layout: "tall" | "wide", run: (page: any) => Promise<unknown>): Promise<unknown> {
  const ctx = await browser.newContext({ viewport: vp, colorScheme: "dark", reducedMotion: "reduce" });
  try {
    const page = await ctx.newPage();
    const errors: string[] = [];
    page.on("pageerror", (e: Error) => errors.push(e.message));
    await page.addInitScript(stub(layout));
    await page.goto(`http://localhost:${server!.port}/`);
    await page.waitForSelector(".home .bar .close");
    await page.evaluate(() => (window as unknown as { __fire: (e: string, p: unknown) => void }).__fire("opened", { keyboard: false, instant: true }));
    await page.waitForSelector(".work .ui-mlist");
    const out = await run(page);
    expect(errors).toEqual([]);
    return out;
  } finally { await ctx.close(); }
}

const near = (a: number, b: number, by = 1) => Math.abs(a - b) <= by;

describe.skipIf(!CAN)("Close sits in the top right corner and every row uses the full width (the founder, 18 Nov 2026)", () => {
  test("tall Home: Close's right edge is the cards' and the ask box's right edge, in the first row, after Settings", async () => {
    const e = await open({ width: 688, height: 760 }, "tall", (page) => page.evaluate(edges)) as Edges;
    expect(e.view).toBe("now");
    expect(e.ask && e.list && e.places && e.chip && e.gear).toBeTruthy();
    expect(near(e.close.right, e.ask!.right), `Close ${e.close.right}, ask ${e.ask!.right}`).toBe(true);
    expect(near(e.close.right, e.list!.right), `Close ${e.close.right}, list ${e.list!.right}`).toBe(true);
    expect(near(e.close.right, e.places!.right), `Close ${e.close.right}, places ${e.places!.right}`).toBe(true);
    // The first row: the project chip on the left, Settings then Close on the right; the places under it.
    expect(e.close.bottom).toBeLessThanOrEqual(e.places!.top + 1);
    expect(e.gear!.right).toBeLessThanOrEqual(e.close.left);
    expect(near(e.gear!.top + e.gear!.bottom, e.close.top + e.close.bottom, 2)).toBe(true);
    // Every row starts on the same left edge.
    expect(near(e.chip!.left, e.ask!.left), `chip ${e.chip!.left}, ask ${e.ask!.left}`).toBe(true);
    expect(near(e.places!.left, e.ask!.left), `places ${e.places!.left}, ask ${e.ask!.left}`).toBe(true);
    expect(near(e.list!.left, e.ask!.left)).toBe(true);
  }, 30_000);

  test("tall Home: the places share the whole row, the last one ending on the column's right edge", async () => {
    const e = await open({ width: 688, height: 760 }, "tall", (page) => page.evaluate(edges)) as Edges;
    // Feel round 3 (19 Nov 2026), changed on purpose: the places sit in one full width track, so the track ends on the
    // column's edge and the last place ends inside its 4 point padding.
    expect(near(e.places!.right, e.ask!.right), `places ${e.places!.right}, ask ${e.ask!.right}`).toBe(true);
    expect(e.ask!.right - e.lastPlace!.right, `last place ${e.lastPlace!.right}, ask ${e.ask!.right}`).toBeLessThanOrEqual(5);
    // No dead strip between the places and the corner: the row is as wide as the ask box.
    expect(near(e.places!.right - e.places!.left, e.ask!.right - e.ask!.left)).toBe(true);
  }, 30_000);

  test("tall Home: the places and Close stay at the same height on every place", async () => {
    const all = await open({ width: 688, height: 760 }, "tall", async (page) => {
      const seen: Edges[] = [await page.evaluate(edges)];
      for (const name of ["Learn", "History", "Memory"]) {
        await page.getByRole("button", { name, exact: true }).first().click();
        await page.waitForFunction((n: string) => document.querySelector(".home")?.getAttribute("data-view") === n, name === "History" ? "did" : name.toLowerCase());
        seen.push(await page.evaluate(edges));
      }
      return seen;
    }) as Edges[];
    expect(all.map((e) => e.view)).toEqual(["now", "learn", "did", "memory"]);
    for (const e of all) {
      expect(near(e.places!.top, all[0].places!.top), `${e.view}: places at ${e.places!.top}, on Now ${all[0].places!.top}`).toBe(true);
      expect(near(e.close.top, all[0].close.top) && near(e.close.right, all[0].close.right), `${e.view}: Close moved`).toBe(true);
    }
  }, 60_000);

  test("tall Home: the top bar stays in view while the page scrolls under it", async () => {
    const e = await open({ width: 688, height: 520 }, "tall", async (page) => {
      await page.getByRole("button", { name: "Learn", exact: true }).first().click();
      await page.waitForFunction(() => document.querySelector(".home")?.getAttribute("data-view") === "learn");
      const scrolled = await page.evaluate(() => { const h = document.querySelector(".home")!; h.scrollTop = h.scrollHeight; return h.scrollTop; });
      expect(scrolled).toBeGreaterThan(0);
      return page.evaluate(edges);
    }) as Edges;
    expect(e.close.top).toBeGreaterThanOrEqual(0);
    expect(e.close.bottom).toBeLessThanOrEqual(e.height);
    expect(e.places!.top).toBeGreaterThanOrEqual(0);
  }, 30_000);

  test("wide Home: Close's right edge is the ask box's right edge too", async () => {
    const e = await open({ width: 960, height: 640 }, "wide", (page) => page.evaluate(edges)) as Edges;
    expect(near(e.close.right, e.ask!.right), `Close ${e.close.right}, ask ${e.ask!.right}`).toBe(true);
    expect(near(e.close.right, e.list!.right)).toBe(true);
  }, 30_000);

  // Feel round 2 (19 Nov 2026): Stop pushed into the row of places moved every tab under the pointer when a job started.
  test("tall Home: the four places keep their rectangles when a job starts working", async () => {
    const [before, after] = await open({ width: 688, height: 760 }, "tall", async (page) => {
      const rects = () => page.evaluate(() => [...document.querySelectorAll(".bar > .places > .ui-place")].map((e) => { const r = e.getBoundingClientRect(); return [Math.round(r.left), Math.round(r.top), Math.round(r.width), Math.round(r.height)]; }));
      const a = await rects();
      await page.evaluate(() => {
        let i = 0;
        for (const e of [{ type: "checkpoint.created", agent: "b1", project: "/Users/me/shop", checkpoint: "cp_0002", label: "Before: make it blue" }, { type: "agent.state", agent: "b1", state: "working" }]) (window as any).__fire("runner-event", { v: 1, id: `w${++i}`, ...e });
      });
      await page.waitForTimeout(200);
      return [a, await rects()];
    }) as number[][][];
    expect(before.length).toBe(4);
    expect(after).toEqual(before);
  }, 30_000);

  test("wide Home: Close stays inside the panel while the column scrolls", async () => {
    const e = await open({ width: 960, height: 420 }, "wide", async (page) => {
      await page.evaluate(() => { const h = document.querySelector(".home")!; h.scrollTop = h.scrollHeight; });
      await page.waitForTimeout(50);
      return page.evaluate(edges);
    }) as Edges;
    expect(e.close.top).toBeGreaterThanOrEqual(0);
    expect(e.close.bottom).toBeLessThanOrEqual(e.height);
  }, 30_000);
});
