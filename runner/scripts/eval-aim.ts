// MANUAL, REAL CLAUDE ON THE FOUNDER'S API KEY WITH --spend: how often does Claude's pointer land on the right thing?
// Pages are rendered in the hidden browser (headless: nothing is shown on the screen, and it is never the person's screen),
// so the true place of every target is known from the page itself. Scores: raw hit (the point is inside the target), and
// snapped hit (the clickable thing under the point IS the target, which is what the Mac's Accessibility lookup gives us in
// the app); see evals/show-me-how/score.ts. Two sets: the basic generated dashboards (48 asks) and the hard set
// (evals/show-me-how: 40 asks on four synthetic busy dashboards, made up products, local files only).
// DRY by default: every page is rendered and every target checked, and nothing is asked of Claude, so nothing is spent.
//   bun run scripts/eval-aim.ts [--set basic|hard|all] [--count n]
//   bun run scripts/eval-aim.ts --spend [--vision-model id] [--lane computer_use] [--aim-model id] [--per-case 0.05] [--total 6]
//     real Claude through the eval sets' real harness (evals/lib/harness.ts), which is runner/scripts/realrun-harness.ts
//     underneath: the bundled binary, the key read in code from the companion-dev Keychain item, a throwaway Claude Code
//     folder, the system/init check and the spending stops. The vision lane on its default model (COMPANION_VISION_MODEL
//     or --vision-model switches it), or the Computer Use lane with --lane computer_use or COMPANION_AIM=computer_use
//     (COMPANION_AIM_MODEL or --aim-model switches its model; it falls back to the vision lane as the app does). Its one
//     network call goes only to the Messages API, is checked against models.ts before it leaves, and is metered.
//   --real   the older opt in: open eight public websites instead (network; their asks are made from each page)
// A refusal or a spending stop ends the run and nothing is scored (it is never "no answer"); a lane error is counted apart
// from the misses. The command line, the harness and the scoring of one ask come from evals/show-me-how/aim.ts, where they
// are tested.
import { join } from "node:path";
import { chromium } from "playwright-core";
import { browserExecutable } from "../src/proof/browser.ts";
import { COMMON_HELP, type EvalHarness } from "../../evals/lib/harness.ts";
import { explainFailure, runSet } from "../../evals/lib/runset.ts";
import { isClean } from "../../evals/lib/results.ts";
import { aimHarness, aimReport, parseAimArgs, runAimAsk, summarizeAim, type AimArgs, type AimAsk } from "../../evals/show-me-how/aim.ts";
import { FIND_ELEMENTS, hardPages, rightTargets, type HardAsk } from "../../evals/show-me-how/hard.ts";
import type { Element } from "../../evals/show-me-how/score.ts";

let aim: AimArgs;
try { aim = parseAimArgs(process.argv.slice(2), process.env); } catch (e) { explainFailure(e); }
const { args, count: want, which, real, lane } = aim;
if (args.help) { console.log(`bun run scripts/eval-aim.ts [--set basic|hard|all] [--count n] [options]${COMMON_HELP}\n  --lane computer_use, --real`); process.exit(0); }
// Refused before any page is rendered when spending is asked for but cannot happen (no key in the Keychain item).
const harness: EvalHarness | undefined = await aimHarness(aim).catch(explainFailure);
/** Ends the script before the run, removing the harness's throwaway folder first. */
const fail = async (e: unknown): Promise<never> => { await harness?.close?.(); return explainFailure(e); };

const css = (dark: boolean, dense: boolean) => `*{box-sizing:border-box}body{margin:0;font:${dense ? 12 : 15}px -apple-system,Helvetica,sans-serif;background:${dark ? "#111418" : "#f6f7f9"};color:${dark ? "#e7e9ec" : "#1b1f24"}}
a{color:${dark ? "#7cb7ff" : "#0b57d0"};text-decoration:none}button,.btn{font:inherit;padding:${dense ? "3px 8px" : "8px 14px"};border-radius:6px;border:1px solid ${dark ? "#3a4048" : "#c9ced6"};background:${dark ? "#1d2229" : "#fff"};color:inherit;cursor:pointer}
button.primary{background:#2563eb;color:#fff;border-color:#2563eb}.side{position:fixed;left:0;top:0;bottom:0;width:200px;background:${dark ? "#0c0f12" : "#fff"};padding:16px;border-right:1px solid ${dark ? "#262c33" : "#e3e6ea"}}
.side a{display:block;padding:7px 8px;border-radius:6px}.main{margin-left:200px;padding:20px}.top{display:flex;justify-content:space-between;align-items:center;margin-bottom:16px}.row{display:flex;gap:10px;align-items:center;margin:10px 0}
table{width:100%;border-collapse:collapse}td,th{padding:${dense ? 4 : 10}px;border-bottom:1px solid ${dark ? "#262c33" : "#e3e6ea"};text-align:left}.card{background:${dark ? "#161a1f" : "#fff"};border:1px solid ${dark ? "#262c33" : "#e3e6ea"};border-radius:10px;padding:16px;margin:12px 0}`;
type Page = { name: string; html: string; asks: HardAsk[] };
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

const SITES = ["https://github.com/login", "https://news.ycombinator.com", "https://en.wikipedia.org/wiki/Main_Page", "https://www.python.org", "https://vercel.com", "https://stripe.com", "https://supabase.com", "https://www.npmjs.com"];
let seed = 7; const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
const exe = browserExecutable();
if (!exe) await fail(new Error("The hidden browser is not installed, so no page can be rendered. Install it from Companion first."));

// Render every page once and keep what each ask needs: the picture, the controls on it, the target (and any other control
// that answers it as well, on the hard set) and the question.
async function render(): Promise<{ asks: AimAsk[]; leftOut: number }> {
  const asks: AimAsk[] = [];
  let leftOut = 0;
  const browser = await chromium.launch({ headless: true, executablePath: exe! });
  try {
    const list: { name: string; html: string; asks: HardAsk[]; set: AimAsk["set"]; byLabel: boolean }[] = real
      ? SITES.map((url) => ({ name: new URL(url).host, html: url, asks: [], set: "real", byLabel: false }))
      : [...(which !== "hard" ? pages().map((p) => ({ ...p, set: "basic" as const, byLabel: false })) : []), ...(which !== "basic" ? hardPages().map((p) => ({ ...p, set: "hard" as const, byLabel: true })) : [])];
    for (const pg of list) {
      const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1 });
      const page = await ctx.newPage();
      if (pg.set === "real") { try { await page.goto(pg.html, { waitUntil: "domcontentloaded", timeout: 20000 }); await page.waitForTimeout(2500); } catch { await ctx.close(); continue; } } else await page.setContent(pg.html);
      const els: Element[] = await page.evaluate(`(${FIND_ELEMENTS})()`);
      if (pg.set === "real") {
        // Pick up to six links or buttons with short, unique visible text.
        const counts = new Map<string, number>(); for (const e of els) counts.set(e.t.toLowerCase(), (counts.get(e.t.toLowerCase()) ?? 0) + 1);
        const ok = els.filter((e) => e.t.length >= 3 && e.t.length <= 30 && counts.get(e.t.toLowerCase()) === 1 && e.w >= 20 && e.h >= 14 && e.x >= 0 && e.x + e.w <= 1280 && e.y + e.h <= 800).sort(() => rnd() - 0.5).slice(0, 6);
        pg.asks = ok.map((e) => ({ target: e.t, question: `Where is the "${e.t}" button or link?` }));
      }
      const png = (await page.screenshot({ type: "png" })).toString("base64");
      for (const ask of pg.asks) {
        if (asks.length >= want) break;
        // A hard page names its targets by label; the others by the words on it.
        const targets = pg.byLabel ? rightTargets(ask).map((id) => els.find((e) => e.id === id)) : [els.find((e) => e.t.toLowerCase() === ask.target.toLowerCase()) ?? els.find((e) => e.t.toLowerCase().includes(ask.target.toLowerCase()))];
        if (targets.some((t) => !t)) { leftOut++; console.log(`  ${pg.name}: not every right answer to ${ask.target} is on the page, so that ask is left out`); continue; }
        asks.push({ id: `${pg.name}:${ask.target}`, page: pg.name, png, els, target: targets[0]!, targets: targets as Element[], question: ask.question, set: pg.set });
      }
      await ctx.close();
    }
  } finally { await browser.close(); }
  return { asks, leftOut };
}
const { asks, leftOut } = await render().catch(fail);

try {
  const { results } = await runSet({
    set: "show-me-how", setDir: join(import.meta.dir, "..", "..", "evals", "show-me-how"), cases: asks, args, summarize: summarizeAim, harness,
    models: { vision: args.models.vision, lane, ...(lane === "computer_use" ? { aim: args.models.aim } : {}) },
    // One ask over its cap means the estimates are off: the run ends there rather than spending on.
    endRunOnCaseStop: true,
    run: (a, ctx) => runAimAsk(a, ctx, { model: args.models.vision, lane, aimModel: args.models.aim }),
  });
  if (results.mode === "dry") console.log(`\n${asks.length} asks rendered${leftOut ? `; ${leftOut} left out because their target was not on the page` : ", every target found on its page"} (basic ${asks.filter((a) => a.set === "basic").length}, hard ${asks.filter((a) => a.set === "hard").length}${real ? `, public sites ${asks.filter((a) => a.set === "real").length}` : ""}). Nothing was asked of Claude.`);
  else for (const line of aimReport(results, real)) console.log(line);
  if (!isClean(results)) process.exitCode = 1;
} catch (e) { explainFailure(e); }
