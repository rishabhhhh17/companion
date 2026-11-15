// M97 follow up: a layout test for sheets opened in Settings, in a real browser. The first fix (m97Sheet.test.ts) only reads
// the CSS text; this one lays the page out. Found 15 Nov while taking the M97 shots: Get Pro in Settings, Account drew under
// Settings' list of pages and the top row, its title and Cancel hidden and its lines cut on the left. The cause: Settings'
// page has a fade at its foot made with a CSS mask, and a mask clips everything inside it, the fixed sheet layer too (and
// makes the page its own layer, so the sheet's z-index only counts inside it). A happy-dom test cannot see that, it does no
// layout or painting, so this bundles the real Home page (Bun.build, the same entry and CSS as card.html), opens it in the
// headless browser Squibby already uses for proof, presses through to each sheet and asks the browser what is on top.
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
if (!CAN) console.warn("sheetLayout.test.ts: SKIPPED, no headless browser (open a proof check once in Squibby to install it) or no runner/node_modules");

const LICENSE = { paymentsOn: true, plan: "free", state: "free", key: null, trial: null, trialUsed: true, checkout: { yearly: true, monthly: true, report: true }, portal: false };
let seq = 0;
const ev = (o: Record<string, unknown>) => ({ v: 1, id: `s${++seq}`, ...o });
const REPLAY = [ev({ type: "runner.hello", runnerVersion: "0.0.1", sdk: "test" }), ev({ type: "auth.status", method: "api_key", source: "keychain" })];

/** The shell's stand in, as the dom suite's: answers each command the page asks at start, and lets the test fire events. */
const stub = `(() => {
  const answers = {
    get_project: "/Users/me/shop", list_projects: ["/Users/me/shop"], claude_status: { state: "ready" },
    replay_events: ${JSON.stringify(REPLAY)},
    settings_get: { values: { "developer.tools": true }, usual: {}, project: "/Users/me/shop", migrated: ["pageStorage.v1"], problems: [], changed: [] },
    home_geom: { shown: true }, key_map: null, license_status: ${JSON.stringify(LICENSE)}, practice_list: [], quiet_now: false,
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

type Probe = {
  sheet: { left: number; right: number; top: number; bottom: number };
  side: { left: number; right: number } | null;
  /** For each spot: is the topmost element there inside the sheet layer, and inside the sheet itself? */
  spots: { name: string; inLayer: boolean; inSheet: boolean; at: string }[];
  title: string; animation: string;
};

/** Asks the browser what is painted on top at the sheet's corners, its title, its Cancel, and over the list of pages. */
const probe = () => {
  const layer = document.querySelector(".ui-sheet-layer")!;
  const sheet = layer.querySelector(".ui-sheet")!;
  const r = sheet.getBoundingClientRect();
  const sideEl = document.querySelector(".settings-side");
  const s = sideEl?.getBoundingClientRect();
  const title = sheet.querySelector(".ui-sheet-title")!.getBoundingClientRect();
  const cancel = [...sheet.querySelectorAll("button")].find((b) => b.textContent?.trim() === "Cancel")?.getBoundingClientRect();
  const body = sheet.querySelector(".ui-sheet-body")!.getBoundingClientRect();
  const mid = (b: DOMRect) => [b.left + Math.min(b.width / 2, 20), b.top + b.height / 2] as const;
  const pts: [string, number, number][] = [
    ["title", ...mid(title)],
    ["body's left edge", body.left + 6, body.top + 12],
    ["sheet's top left", r.left + 4, r.top + 4],
    ["sheet's bottom left", r.left + 4, r.bottom - 4],
    ["sheet's top right", r.right - 4, r.top + 4],
  ];
  if (cancel) pts.push(["Cancel", cancel.left + cancel.width / 2, cancel.top + cancel.height / 2]);
  if (s && s.width > 0 && s.right <= r.left) pts.push(["over the list of pages", s.left + s.width / 2, s.top + 40]);
  const spots = pts.map(([name, x, y]) => {
    const e = document.elementFromPoint(x, y);
    return { name, inLayer: !!e && layer.contains(e), inSheet: !!e && sheet.contains(e), at: e ? `${e.tagName.toLowerCase()}.${String(e.className).split(" ")[0]}` : "nothing" };
  });
  return { sheet: { left: r.left, right: r.right, top: r.top, bottom: r.bottom }, side: s ? { left: s.left, right: s.right } : null, spots,
    title: sheet.querySelector(".ui-sheet-title")!.textContent ?? "", animation: getComputedStyle(sheet).animationName } satisfies Probe;
};

let dir = "";
let server: ReturnType<typeof Bun.serve> | null = null;
// biome-ignore lint: playwright's types are not a dependency of the pages
let browser: any = null;

beforeAll(async () => {
  if (!CAN) return;
  dir = mkdtempSync(join(tmpdir(), "sheet-layout-"));
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

/** Opens Home at this size, presses through to a sheet, and returns what the browser paints. */
async function open(vp: { width: number; height: number }, path: string[], reduce = false): Promise<Probe> {
  const ctx = await browser.newContext({ viewport: vp, colorScheme: "dark", reducedMotion: reduce ? "reduce" : "no-preference" });
  try {
    const page = await ctx.newPage();
    const errors: string[] = [];
    page.on("pageerror", (e: Error) => errors.push(e.message));
    await page.addInitScript(stub);
    await page.goto(`http://localhost:${server!.port}/`);
    await page.waitForSelector(".home");
    await page.evaluate(() => (window as unknown as { __fire: (e: string, p: unknown) => void }).__fire("opened", { keyboard: false, instant: true }));
    for (const name of path) {
      const b = page.getByRole("button", { name, exact: true }).first();
      await b.waitFor({ timeout: 5000 });
      await b.click();
    }
    await page.waitForSelector(".ui-sheet");
    // The sheet slides in; wait until it has stopped moving.
    await page.waitForFunction(() => document.querySelector(".ui-sheet")!.getAnimations().every((a) => a.playState === "finished"));
    expect(errors).toEqual([]);
    return await page.evaluate(probe);
  } finally { await ctx.close(); }
}

const SIZES = { wide: { width: 960, height: 640 }, tall: { width: 688, height: 940 }, narrow: { width: 460, height: 820 } };
const SHEETS: { name: string; path: string[]; title: string }[] = [
  { name: "Get Pro", path: ["Settings", "Account", "Get Pro"], title: "Get Pro" },
  { name: "Replace your key", path: ["Settings", "More options", "For developers", "Replace"], title: "Replace your Claude key" },
];

describe.skipIf(!CAN)("a sheet opened in Settings is on top and whole, in a real browser (M97)", () => {
  for (const sh of SHEETS) for (const [size, vp] of Object.entries(SIZES)) {
    test(`${sh.name}, ${size} Home: nothing paints over it and nothing of it is cut off`, async () => {
      const p = await open(vp, sh.path);
      expect(p.title).toBe(sh.title);
      // Whole: inside the window on every side.
      expect(p.sheet.left).toBeGreaterThanOrEqual(0);
      expect(p.sheet.top).toBeGreaterThanOrEqual(0);
      expect(p.sheet.right).toBeLessThanOrEqual(vp.width + 0.5);
      expect(p.sheet.bottom).toBeLessThanOrEqual(vp.height + 0.5);
      // On top: the browser's own hit test finds the sheet at its title, its Cancel, its corners and its body's left edge.
      for (const s of p.spots.filter((x) => x.name !== "over the list of pages")) expect({ spot: s.name, inSheet: s.inSheet, at: s.at }).toEqual({ spot: s.name, inSheet: true, at: s.at });
      // With the list of pages beside it (wide), the sheet covers only the page column, and the scrim lies over the list.
      if (p.side && p.side.right <= p.sheet.left) {
        expect(Math.abs(p.sheet.left - p.side.right)).toBeLessThanOrEqual(1);
        const over = p.spots.find((x) => x.name === "over the list of pages")!;
        expect({ inLayer: over.inLayer, inSheet: over.inSheet, at: over.at }).toEqual({ inLayer: true, inSheet: false, at: "div.ui-scrim" });
      }
    }, 30_000);
  }

  test("the wide Home's Get Pro covers the page column, never the list of pages", async () => {
    const p = await open(SIZES.wide, SHEETS[0]!.path);
    expect(p.side).not.toBeNull();
    expect(p.sheet.left).toBeGreaterThanOrEqual(p.side!.right - 1);
  }, 30_000);

  test("with Reduce Motion the sheet fades in instead of sliding, and still sits on top", async () => {
    const p = await open(SIZES.wide, SHEETS[0]!.path, true);
    expect(p.animation).toBe("ui-fade-in");
    for (const s of p.spots.filter((x) => x.name !== "over the list of pages")) expect(s.inSheet).toBe(true);
  }, 30_000);
});
