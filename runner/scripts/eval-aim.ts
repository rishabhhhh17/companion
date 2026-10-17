// MANUAL, REAL CLAUDE ON THE FOUNDER'S API KEY: how often does Claude's pointer land on the right thing?
// Pages are rendered in the hidden browser, so the true position of every button is known from the page itself.
// Scores: raw hit (the point is inside the target), and snapped hit (the clickable thing under the point IS the target,
// which is what the Mac's Accessibility lookup gives us in the app).
//   bun run scripts/eval-aim.ts [count] [--real]            the plan, spends nothing (--real: real web pages, not drawn ones)
//   bun run scripts/eval-aim.ts [count] [--real] --spend    runs it through the real run harness (realrun-harness.ts)
// The vision lane on its default model (COMPANION_VISION_MODEL switches it), or the Computer Use lane with
// COMPANION_AIM=computer_use (COMPANION_AIM_MODEL switches it; it falls back to the vision lane as the app does).
import { chromium } from "playwright-core";
import { browserExecutable } from "../src/proof/browser.ts";
import { API_URL, ComputerUseVision, withFallback } from "../src/aim.ts";
import { VisionLane, clickPoint, type Located, type VisionLike } from "../src/lanes.ts";
import { MODELS, estimateUsd } from "../src/models.ts";
import { release as releaseShotDrive } from "../src/ramdisk.ts";
import { isHarnessStop, parseArgs, runCases, type CaseCtx } from "./realrun-harness.ts";

const argv = process.argv.slice(2);
const harnessArgs = parseArgs(argv.filter((a) => a !== "--real" && !/^\d+$/.test(a)));
if ("error" in harnessArgs) { console.error(harnessArgs.error); process.exit(2); }
const aimLane = process.env.COMPANION_AIM === "computer_use";
const visionModel = process.env.COMPANION_VISION_MODEL?.trim() || MODELS.vision;
const aimModel = process.env.COMPANION_AIM_MODEL?.trim() || MODELS.aim;
function lanesFor(ctx: CaseCtx): { vision: VisionLike } {
  const classic = new VisionLane({ claudeBinary: ctx.claudeBinary, env: ctx.env, model: visionModel, queryFn: ctx.guard({ tools: [], model: visionModel }) as never });
  if (!aimLane) return { vision: classic };
  let n = 0;
  // The pointing lane calls the Messages API itself: only that address, never after a stop or with no room left, and
  // metered from each answer's usage.
  const fetchFn = (async (url: string, init: RequestInit) => {
    if (url !== API_URL) throw new Error("only the Messages API may be called");
    ctx.meter.assertRoom();
    const res = await fetch(url, { ...init, signal: ctx.signal });
    ctx.meter.settle(`aim-${++n}`, estimateUsd(aimModel, (await res.clone().json().catch(() => null))?.usage));
    return res;
  }) as unknown as typeof fetch;
  return { vision: withFallback(new ComputerUseVision({ apiKey: async () => ctx.key, model: aimModel, fetchFn }), classic) };
}
let lanes!: { vision: VisionLike };

const css = (dark: boolean, dense: boolean) => `*{box-sizing:border-box}body{margin:0;font:${dense ? 12 : 15}px -apple-system,Helvetica,sans-serif;background:${dark ? "#111418" : "#f6f7f9"};color:${dark ? "#e7e9ec" : "#1b1f24"}}
a{color:${dark ? "#7cb7ff" : "#0b57d0"};text-decoration:none}button,.btn{font:inherit;padding:${dense ? "3px 8px" : "8px 14px"};border-radius:6px;border:1px solid ${dark ? "#3a4048" : "#c9ced6"};background:${dark ? "#1d2229" : "#fff"};color:inherit;cursor:pointer}
button.primary{background:#2563eb;color:#fff;border-color:#2563eb}.side{position:fixed;left:0;top:0;bottom:0;width:200px;background:${dark ? "#0c0f12" : "#fff"};padding:16px;border-right:1px solid ${dark ? "#262c33" : "#e3e6ea"}}
.side a{display:block;padding:7px 8px;border-radius:6px}.main{margin-left:200px;padding:20px}.top{display:flex;justify-content:space-between;align-items:center;margin-bottom:16px}.row{display:flex;gap:10px;align-items:center;margin:10px 0}
table{width:100%;border-collapse:collapse}td,th{padding:${dense ? 4 : 10}px;border-bottom:1px solid ${dark ? "#262c33" : "#e3e6ea"};text-align:left}.card{background:${dark ? "#161a1f" : "#fff"};border:1px solid ${dark ? "#262c33" : "#e3e6ea"};border-radius:10px;padding:16px;margin:12px 0}`;
type Page = { name: string; html: string; asks: { target: string; question: string }[] };
const pages = (): Page[] => {
  const out: Page[] = [];
  for (const [dark, dense] of [[false, false], [true, false], [false, true], [true, true]] as const) {
    const tag = `${dark ? "dark" : "light"}${dense ? "-dense" : ""}`;
    out.push({ name: `dashboard-${tag}`, asks: [
      { target: "New project", question: "How do I start a new project?" }, { target: "Invite", question: "How do I add a teammate?" },
      { target: "Billing", question: "Where do I go to see my invoices?" }, { target: "Delete", question: "How do I remove the Marketing site project?" } ],
      html: `<style>${css(dark, dense)}</style><div class="side"><b>Acme</b><br><br><a href="#">Overview</a><a href="#">Projects</a><a href="#">Domains</a><a href="#">Billing</a><a href="#">Settings</a></div><div class="main"><div class="top"><h2>Projects</h2><div class="row"><button>Invite</button><button class="primary">New project</button></div></div>
<table><tr><th>Name</th><th>Status</th><th></th></tr><tr><td>Marketing site</td><td>Live</td><td><button>Edit</button> <button>Delete</button></td></tr><tr><td>Docs</td><td>Preview</td><td><button>Edit</button> <button>Archive</button></td></tr></table></div>` });
    out.push({ name: `settings-${tag}`, asks: [
      { target: "Save changes", question: "How do I keep the changes I made here?" }, { target: "Cancel", question: "How do I leave without saving?" },
      { target: "Change password", question: "Where do I change my password?" }, { target: "Notifications", question: "Where can I turn off emails?" } ],
      html: `<style>${css(dark, dense)}</style><div class="side"><a href="#">Profile</a><a href="#">Security</a><a href="#">Notifications</a><a href="#">Team</a></div><div class="main"><h2>Profile</h2><div class="card"><div class="row"><label>Name</label><input value="Sam Rivera"></div><div class="row"><label>Email</label><input value="sam@example.com"></div><div class="row"><a href="#">Change password</a></div></div><div class="row"><button class="primary">Save changes</button><button>Cancel</button></div></div>` });
    out.push({ name: `deploy-${tag}`, asks: [
      { target: "Deploy", question: "How do I put this on the internet?" }, { target: "Environment variables", question: "Where do I add my API keys for this project?" },
      { target: "View logs", question: "Where can I see why it failed?" }, { target: "Domains", question: "How do I connect my own domain name?" } ],
      html: `<style>${css(dark, dense)}</style><div class="main" style="margin-left:0"><div class="top"><h2>shop-site</h2><div class="row"><a href="#">Domains</a><a href="#">Environment variables</a><button>View logs</button><button class="primary">Deploy</button></div></div><div class="card"><h3>Last deployment</h3><p>Failed 3 minutes ago</p><div class="row"><button>Redeploy</button><button>Rollback</button></div></div></div>` });
  }
  return out;
};

const FIND = `() => { const sel = 'a,button,[role=button],input,select,summary'; const out = []; for (const e of document.querySelectorAll(sel)) { const r = e.getBoundingClientRect(); const t = (e.innerText || e.value || e.getAttribute('aria-label') || '').trim().replace(/\\s+/g,' '); if (r.width < 8 || r.height < 8 || r.bottom < 0 || r.top > innerHeight) continue; out.push({ t, x: r.x, y: r.y, w: r.width, h: r.height }); } return out; }`;

const real = argv.includes("--real");
const want = Number(argv.find((a) => /^\d+$/.test(a))) || 999;
const SITES = ["https://github.com/login", "https://news.ycombinator.com", "https://en.wikipedia.org/wiki/Main_Page", "https://www.python.org", "https://vercel.com", "https://stripe.com", "https://supabase.com", "https://www.npmjs.com"];
let seed = 7; const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
async function score(run: CaseCtx): Promise<boolean> {
  const browser = await chromium.launch({ headless: true, executablePath: browserExecutable()! });
  run.onCleanup(() => browser.close().catch(() => {}));
  let n = 0, raw = 0, snapped = 0, none = 0, ms: number[] = [], cost = 0;
  const misses: string[] = [], errors: string[] = [];
  const realPages: Page[] = [];
  if (real) for (const url of SITES) realPages.push({ name: new URL(url).host, html: url, asks: [] });
  for (const pg of real ? realPages : pages()) {
    if (run.signal.aborted) break;
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1 });
    const page = await ctx.newPage();
    if (real) { try { await page.goto(pg.html, { waitUntil: "domcontentloaded", timeout: 20000 }); await page.waitForTimeout(2500); } catch { await ctx.close(); continue; } } else await page.setContent(pg.html);
    const els: { t: string; x: number; y: number; w: number; h: number }[] = await page.evaluate(`(${FIND})()`);
    if (real) {
      // Pick up to six links or buttons with short, unique visible text.
      const counts = new Map<string, number>(); for (const e of els) counts.set(e.t.toLowerCase(), (counts.get(e.t.toLowerCase()) ?? 0) + 1);
      const ok = els.filter((e) => e.t.length >= 3 && e.t.length <= 30 && counts.get(e.t.toLowerCase()) === 1 && e.w >= 20 && e.h >= 14 && e.x >= 0 && e.x + e.w <= 1280 && e.y + e.h <= 800).sort(() => rnd() - 0.5).slice(0, 6);
      pg.asks = ok.map((e) => ({ target: e.t, question: `Where is the "${e.t}" button or link?` }));
    }
    const png = await page.screenshot({ type: "png" });
    for (const ask of pg.asks) {
      if (n >= want || run.signal.aborted) break;
      const target = els.find((e) => e.t.toLowerCase() === ask.target.toLowerCase()) ?? els.find((e) => e.t.toLowerCase().includes(ask.target.toLowerCase()));
      if (!target) continue;
      n++;
      const t0 = Date.now();
      // A refusal or a spending stop ends the eval (it is never "no answer"); any other error is counted apart from the misses.
      let r: Located;
      try { r = await lanes.vision.locate({ image: { base64: png.toString("base64"), mediaType: "image/png", w: 1280, h: 800 }, question: ask.question, ocr: [] }, run.signal); }
      catch (e) {
        if (isHarnessStop(e) || run.signal.aborted) { await ctx.close(); throw e; }
        errors.push(`${pg.name}: "${ask.question}" -> ${(e as Error)?.message ?? String(e)}`); continue;
      }
      ms.push(Date.now() - t0); cost += r.costUsd;
      // Scored on where the person would click: the last target of an answer with several (the ones before it are "look here").
      const hit = clickPoint(r);
      if (!hit) { none++; misses.push(`${pg.name}: "${ask.question}" -> no answer`); continue; }
      const inside = (e: { x: number; y: number; w: number; h: number }) => hit.x >= e.x && hit.x <= e.x + e.w && hit.y >= e.y && hit.y <= e.y + e.h;
      const rawHit = inside(target);
      // What the Mac would report: the smallest clickable thing under the point.
      const under = els.filter(inside).sort((a, b) => a.w * a.h - b.w * b.h)[0];
      const snapHit = !!under && under.t === target.t && Math.abs(under.x - target.x) < 1 && Math.abs(under.y - target.y) < 1;
      if (rawHit) raw++; if (snapHit) snapped++;
      if (!rawHit) misses.push(`${pg.name}: "${ask.question}" wanted ${target.t} at (${Math.round(target.x)},${Math.round(target.y)}); got (${Math.round(hit.x)},${Math.round(hit.y)}) "${hit.targetText}"`);
    }
    await ctx.close();
  }
  await browser.close();
  if (run.signal.aborted || run.refusals.length) { console.log(`\nStopped after ${n} questions, so nothing is scored: ${run.refusals[0] ?? "the case was stopped"}`); return false; }
  // Scored on the questions that got an answer (a point, or "nothing to point at"); an error is not a miss.
  const answered = n - errors.length;
  ms.sort((a, b) => a - b);
  console.log(`\nquestions: ${n}; answered: ${answered}\nraw hit rate: ${raw}/${answered} = ${Math.round((100 * raw) / answered)}%\nsnapped hit rate: ${snapped}/${answered} = ${Math.round((100 * snapped) / answered)}%\nno answer: ${none}\nmedian time: ${ms[Math.floor(ms.length / 2)]} ms; slowest: ${ms.at(-1)} ms\nestimated cost: $${cost.toFixed(2)}`);
  for (const m of misses) console.log("  miss:", m);
  for (const e of errors) console.log("  error (not scored):", e);
  if (errors.length) run.note(`${errors.length} questions ended in an error, not an answer: they are listed above and left out of the rates`);
  return answered > 0 && errors.length === 0;
}

const count = Math.min(want, real ? SITES.length * 6 : 48);
process.exit(await runCases("Aim eval", [{
  name: "aim", what: `${count} questions on ${real ? "real web pages" : "drawn pages"}; scored on where the person would click`,
  models: [aimLane ? `${aimModel} (computer use, falling back to ${visionModel})` : visionModel], estimateUsd: Math.max(0.01, count * 0.006), capUsd: 1, timeoutS: 1800,
  async run(ctx) { lanes = lanesFor(ctx); ctx.onCleanup(() => releaseShotDrive()); return score(ctx); },
}], harnessArgs, { totalUsd: 1, perCaseUsd: 1 }));
