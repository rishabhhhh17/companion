// M110 (docs/milestones/M110-daily-feel.md): measures the 7 speed budgets on this Mac and exits non-zero when any is over.
// No model calls, no money spent, temporary folders only.
import { chromium } from "playwright-core";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { extname, join, resolve } from "node:path";
import { performance } from "node:perf_hooks";
import { DoneSignals } from "../src/donesignal.ts";
import { evaluateSpeed, formatSpeedReport, type SpeedSample } from "../src/speed.ts";

const ROOT = resolve(import.meta.dir, "../..");
const DIST = join(ROOT, "app/dist");
const EXE = `${process.env.HOME}/Library/Application Support/Companion/browsers/chromium_headless_shell-1248/chrome-headless-shell-mac-arm64/chrome-headless-shell`;
const TYPES: Record<string, string> = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".svg": "image/svg+xml", ".png": "image/png", ".woff2": "font/woff2", ".json": "application/json" };

if (!existsSync(join(DIST, "card.html")) || !existsSync(join(DIST, "island.html"))) {
  console.error("app/dist is missing; run (cd app && bun --bun vite build) first.");
  process.exit(2);
}

const server = Bun.serve({
  port: 0,
  fetch(req) {
    const p = decodeURIComponent(new URL(req.url).pathname);
    const f = join(DIST, p === "/" ? "card.html" : p);
    if (!existsSync(f)) return new Response("not found", { status: 404 });
    return new Response(readFileSync(f), { headers: { "content-type": TYPES[extname(f)] ?? "application/octet-stream" } });
  },
});
const base = `http://localhost:${server.port}`;

const stub = (island: Record<string, unknown>) => `(() => {
  const listeners = new Map();
  const P = "/Users/me/practice-app";
  const replay = [
    { v: 1, id: "s1", type: "runner.hello", runnerVersion: "0.0.1", sdk: "test" },
    { v: 1, id: "s2", type: "auth.status", method: "api_key", source: "keychain" },
    { v: 1, id: "s3", type: "ui.folderShown", project: P },
  ];
  const answers = {
    get_project: P, list_projects: [P], claude_status: { state: "ready" }, replay_events: replay,
    settings_get: { values: { "you.name": "Founder", "review.mode": "automatic" }, usual: {}, project: P, migrated: ["pageStorage.v1"], problems: [], changed: [] },
    island_state: ${JSON.stringify(island)}, home_geom: { shown: true }, key_map: null, practice_list: [], quiet_now: false,
  };
  try { localStorage.setItem("companion.onboarded", "1"); } catch {}
  window.__TAURI__ = {
    core: { invoke: async (cmd) => answers[cmd] },
    event: { listen: async (e, cb) => { const s = listeners.get(e) ?? new Set(); s.add(cb); listeners.set(e, s); return () => s.delete(cb); } },
  };
  window.__fire = (e, payload) => { for (const cb of [...(listeners.get(e) ?? [])]) cb({ payload }); };
})();`;

const browser = await chromium.launch({ executablePath: EXE });

// 1 & 2: Launch to notch ready + Hover to small notch shown
const islandCtx = await browser.newContext({ viewport: { width: 420, height: 220 }, deviceScaleFactor: 2, colorScheme: "dark" });
const islandPage = await islandCtx.newPage();
await islandPage.addInitScript(stub({ mode: "rest", kind: "notch", w: 185, h: 32, core: 185, row: 32, wing: 0, hover: false, home: false }));
const tLaunch = performance.now();
await islandPage.goto(`${base}/island.html`, { waitUntil: "domcontentloaded" });
await islandPage.waitForSelector(".island", { state: "visible" });
const launchToNotchMs = performance.now() - tLaunch;

const hoverToSmallMs = await islandPage.evaluate(async () => {
  const t0 = performance.now();
  (window as unknown as { __fire: (e: string, p: unknown) => void }).__fire("island-mode", { mode: "panel", kind: "notch", w: 320, h: 120, core: 185, row: 32, wing: 0, hover: true, home: false });
  return await new Promise<number>((resolveDone) => {
    const check = () => {
      const p = document.querySelector(".island-panel") as HTMLElement | null;
      if (p && p.getBoundingClientRect().height > 0) { resolveDone(performance.now() - t0); return; }
      if (performance.now() - t0 > 5000) { resolveDone(Number.NaN); return; }
      requestAnimationFrame(check);
    };
    requestAnimationFrame(check);
  });
});
await islandCtx.close();

// 3 & 4: Click to notch opened + Ask box key to typing
const cardCtx = await browser.newContext({ viewport: { width: 688, height: 480 }, deviceScaleFactor: 2, colorScheme: "dark" });
const cardPage = await cardCtx.newPage();
await cardPage.addInitScript(stub({ mode: "rest", kind: "notch", w: 185, h: 32, core: 185, row: 32, wing: 0, hover: false, home: false }));
await cardPage.goto(`${base}/card.html`, { waitUntil: "domcontentloaded" });
await cardPage.waitForSelector("main.card.home");

const clickToOpenMs = await cardPage.evaluate(async () => {
  const t0 = performance.now();
  (window as unknown as { __fire: (e: string, p: unknown) => void }).__fire("opened", { keyboard: false, instant: true });
  return await new Promise<number>((resolveDone) => {
    requestAnimationFrame(() => requestAnimationFrame(() => resolveDone(performance.now() - t0)));
  });
});

const askKeyToTypingMs = await cardPage.evaluate(async () => {
  (window as unknown as { __fire: (e: string, p: unknown) => void }).__fire("closed", {});
  await new Promise((r) => setTimeout(r, 20));
  const t0 = performance.now();
  (window as unknown as { __fire: (e: string, p: unknown) => void }).__fire("opened", { keyboard: true, instant: true });
  return await new Promise<number>((resolveDone) => {
    const check = () => {
      const active = document.activeElement;
      if (active && active.tagName === "TEXTAREA") { resolveDone(performance.now() - t0); return; }
      if (performance.now() - t0 > 5000) { resolveDone(Number.NaN); return; }
      requestAnimationFrame(check);
    };
    requestAnimationFrame(check);
  });
});
await cardCtx.close();
await browser.close();
server.stop();

// 5: Tool saying done to notch lighting (DoneSignals marker -> onDone callback)
const tmp = mkdtempSync(join(tmpdir(), "m110-speed-"));
const dataDir = join(tmp, "data");
const projDir = join(tmp, "proj");
const doneToNotchMs = await new Promise<number>((resolveDone) => {
  let t0 = 0;
  const signals = new DoneSignals(dataDir, {
    onDone: (project) => {
      if (project === projDir) { signals.stop(); resolveDone(performance.now() - t0); }
    },
  });
  const marker = signals.markerFor(projDir, true, "claude")!;
  signals.start();
  setTimeout(() => {
    t0 = performance.now();
    writeFileSync(marker, "");
  }, 50);
});
rmSync(tmp, { recursive: true, force: true });

// 6 & 7: Idle processor and memory with nothing happening (2 s quiet sample)
const cpu0 = process.cpuUsage();
const wall0 = performance.now();
await new Promise((r) => setTimeout(r, 2000));
const wallMs = performance.now() - wall0;
const cpuDelta = process.cpuUsage(cpu0);
const idleCpuPct = ((cpuDelta.user + cpuDelta.system) / 1000 / wallMs) * 100;
const idleRssMb = process.memoryUsage().rss / (1024 * 1024);

const sample: SpeedSample = { launchToNotchMs, hoverToSmallMs, clickToOpenMs, askKeyToTypingMs, doneToNotchMs, idleCpuPct, idleRssMb };
const evaluated = evaluateSpeed(sample);
console.log(formatSpeedReport(evaluated));
process.exit(evaluated.ok ? 0 : 1);
