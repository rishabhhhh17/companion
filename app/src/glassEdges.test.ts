// GLASS (the founder, 19 Nov 2026, direction B), measured as homeEdges.test.ts measures Before: under Glass, the usual, Close,
// Settings and Stop sit in the black strip's top right corner and the places are tabs under it. The GLASS review found this
// geometry untested once homeEdges.test.ts was pinned to Before. A happy-dom test does no layout, so this bundles the real
// Home page and lays it out in the headless browser Squibby already uses for proof.
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
if (!CAN) console.warn("glassEdges.test.ts: SKIPPED, no headless browser (open a proof check once in Squibby to install it) or no runner/node_modules");

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
    settings_get: { values: { "look.layout": ${JSON.stringify(layout)}, "look.material": "glass" }, usual: {}, project: ${JSON.stringify(P)}, migrated: ["pageStorage.v1"], problems: [], changed: [] },
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
  dir = mkdtempSync(join(tmpdir(), "glass-edges-"));
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
type Edges = { close: Box | null; gear: Box | null; stop: Box | null; anyStop: Box | null; tabs: Box | null; tabRects: number[][]; panel: Box; view: string; width: number; height: number };

/** Where the top strip's parts and the tabs are, as the browser lays them out. */
function edges(): Edges {
  const box = (sel: string): Box | null => { const e = document.querySelector(sel); if (!e || !(e as HTMLElement).offsetParent) return null; const r = e.getBoundingClientRect(); return { left: r.left, right: r.right, top: r.top, bottom: r.bottom }; };
  const tabRects = [...document.querySelectorAll(".gl-tabs > .gl-tab")].map((e) => { const r = e.getBoundingClientRect(); return [Math.round(r.left), Math.round(r.top), Math.round(r.width), Math.round(r.height)]; });
  return {
    // Any Stop on screen: Now keeps its own in the lead or the working card (homeHero.ts barStopCan); the others use the strip's.
    anyStop: (() => { const b = [...document.querySelectorAll("button")].find((x) => (x as HTMLElement).offsetParent && x.textContent?.trim() === "Stop"); if (!b) return null; const r = b.getBoundingClientRect(); return { left: r.left, right: r.right, top: r.top, bottom: r.bottom }; })(),
    close: box(".gl-top .gl-end .close"), gear: box(".gl-top .gl-end .bar-gear"), stop: box(".gl-top .gl-end .bar-stop"), tabs: box(".gl-tabs"), tabRects,
    panel: box(".card.home")!, view: document.querySelector(".home")!.getAttribute("data-view") ?? "", width: window.innerWidth, height: window.innerHeight,
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
    await page.waitForSelector(".gl-top .close");
    await page.evaluate(() => (window as unknown as { __fire: (e: string, p: unknown) => void }).__fire("opened", { keyboard: false, instant: true }));
    await page.waitForSelector(".gl-tabs");
    const out = await run(page);
    expect(errors).toEqual([]);
    return out;
  } finally { await ctx.close(); }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const startJob = (page: any) => page.evaluate(() => {
  let i = 0;
  for (const e of [{ type: "checkpoint.created", agent: "b1", project: "/Users/me/shop", checkpoint: "cp_0002", label: "Before: make it blue" }, { type: "agent.state", agent: "b1", state: "working" }]) (window as any).__fire("runner-event", { v: 1, id: `w${++i}`, ...e });
});
const inside = (b: Box, e: Edges) => b.left >= e.panel.left - 1 && b.right <= e.panel.right + 1 && b.top >= 0 && b.bottom <= e.height;
const SIZES = [["tall", { width: 688, height: 760 }], ["wide", { width: 960, height: 640 }]] as const;

describe.skipIf(!CAN)("GLASS: Close, Stop and the tabs in the top strip, in tall and wide Home", () => {
  for (const [layout, vp] of SIZES) {
    test(`${layout} Home: Close is in the top right corner, inside the panel, after Settings`, async () => {
      const e = await open(vp, layout, (page) => page.evaluate(edges)) as Edges;
      expect(e.view).toBe("now");
      expect(e.close && e.gear && e.tabs).toBeTruthy();
      expect(inside(e.close!, e), `Close ${JSON.stringify(e.close)}`).toBe(true);
      expect(e.panel.right - e.close!.right, `Close ends ${e.close!.right}, panel ${e.panel.right}`).toBeLessThanOrEqual(24);
      expect(e.close!.top).toBeLessThan(e.tabs!.top);
      expect(e.gear!.right).toBeLessThanOrEqual(e.close!.left);
      // The tabs sit in the middle of the panel.
      expect(Math.abs((e.tabs!.left + e.tabs!.right) / 2 - (e.panel.left + e.panel.right) / 2)).toBeLessThanOrEqual(2);
    }, 30_000);

    test(`${layout} Home: while a job runs, Stop is in reach on every place (the top strip's off Now)`, async () => {
      const all = await open(vp, layout, async (page) => {
        await startJob(page);
        await page.waitForFunction(() => [...document.querySelectorAll("button")].some((x) => x.textContent?.trim() === "Stop"));
        const seen: Edges[] = [await page.evaluate(edges)];
        for (const name of ["Learn", "History", "Memory"]) {
          await page.getByRole("tab", { name, exact: true }).first().click();
          await page.waitForFunction((n: string) => document.querySelector(".home")?.getAttribute("data-view") === n, name === "History" ? "did" : name.toLowerCase());
          seen.push(await page.evaluate(edges));
        }
        return seen;
      }) as Edges[];
      expect(all.map((e) => e.view)).toEqual(["now", "learn", "did", "memory"]);
      for (const e of all) {
        expect(e.anyStop && inside(e.anyStop, e), `${e.view}: Stop ${JSON.stringify(e.anyStop)}`).toBe(true);
        if (e.view !== "now") expect(e.stop && inside(e.stop, e), `${e.view}: the strip's Stop ${JSON.stringify(e.stop)}`).toBe(true);
      }
    }, 60_000);

    test(`${layout} Home: the tabs keep their rectangles when a job starts working`, async () => {
      const [before, after] = await open(vp, layout, async (page) => {
        const a = (await page.evaluate(edges)).tabRects;
        await startJob(page);
        await page.waitForTimeout(200);
        return [a, (await page.evaluate(edges)).tabRects];
      }) as number[][][];
      expect(before.length).toBeGreaterThanOrEqual(3);
      expect(after).toEqual(before);
    }, 30_000);
  }

  test("tall Home: the tabs and Close stay in view while the page scrolls under them", async () => {
    const e = await open({ width: 688, height: 520 }, "tall", async (page) => {
      await page.getByRole("tab", { name: "Learn", exact: true }).first().click();
      await page.waitForFunction(() => document.querySelector(".home")?.getAttribute("data-view") === "learn");
      const scrolled = await page.evaluate(() => { const h = document.querySelector(".home")!; h.scrollTop = h.scrollHeight; return h.scrollTop; });
      expect(scrolled).toBeGreaterThan(0);
      return page.evaluate(edges);
    }) as Edges;
    expect(e.close && inside(e.close, e)).toBe(true);
    expect(e.tabs!.top).toBeGreaterThanOrEqual(0);
    expect(e.tabs!.bottom).toBeLessThanOrEqual(e.height);
  }, 30_000);
});
