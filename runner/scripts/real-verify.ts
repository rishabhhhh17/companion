// MANUAL, REAL CLAUDE: checks that Drive, Rescue, Research, house rules, undo, take the wheel, the daily limit and the
// second model review work with the real engine, through the runner exactly as the app starts it.
// Uses the separate test sign in folder and the cheap model, with small spending limits. Run: bun run scripts/real-verify.ts [scenario...]
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, realpathSync, writeFileSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { join } from "node:path";

const CONFIG = join(homedir(), "Library/Application Support/Companion-test-claude");
const MODEL = "claude-haiku-4-5-20251001";
type Ev = Record<string, any>;
const results: { name: string; pass: boolean; notes: string[] }[] = [];
let totalUsd = 0;

const tmp = (l: string) => realpathSync(mkdtempSync(join(tmpdir(), `companion-rv-${l}-`)));
const put = (dir: string, files: Record<string, string>) => { for (const [p, c] of Object.entries(files)) { mkdirSync(join(dir, p, ".."), { recursive: true }); writeFileSync(join(dir, p), c); } };

class Real {
  data = tmp("data"); events: Ev[] = []; proc: ReturnType<typeof Bun.spawn>; private buf = ""; t0 = Date.now(); unexpectedApprovals = 0;
  constructor(public project: string, env: Record<string, string> = {}) {
    this.proc = Bun.spawn(["bun", join(import.meta.dir, "../src/main.ts")], {
      stdin: "pipe", stdout: "pipe", stderr: "inherit",
      env: { ...process.env, COMPANION_DATA: (this.data = tmp("data")), COMPANION_ROUTE: "plan", COMPANION_MODEL: MODEL, CLAUDE_CONFIG_DIR: CONFIG, ...env },
    });
    void this.pump();
  }
  private async pump() {
    const dec = new TextDecoder();
    for await (const chunk of this.proc.stdout as AsyncIterable<Uint8Array>) {
      this.buf += dec.decode(chunk, { stream: true });
      let i: number;
      while ((i = this.buf.indexOf("\n")) >= 0) {
        const line = this.buf.slice(0, i); this.buf = this.buf.slice(i + 1);
        try {
          const e = JSON.parse(line); e.at = Date.now() - this.t0; this.events.push(e);
          if (e.type === "approval.request") { this.unexpectedApprovals++; this.send({ v: 1, id: "deny", type: "approval.resolve", approval: e.approval, decision: "deny", scope: "once" }); }
        } catch { /* not json */ }
      }
    }
  }
  send(o: Record<string, unknown>) { (this.proc.stdin as any).write(JSON.stringify(o) + "\n"); (this.proc.stdin as any).flush(); }
  of(t: string) { return this.events.filter((e) => e.type === t); }
  async until(pred: (e: Ev) => boolean, ms: number, from = 0): Promise<Ev | null> {
    const end = Date.now() + ms;
    while (Date.now() < end) { const f = this.events.slice(from).find(pred); if (f) return f; await Bun.sleep(100); }
    return null;
  }
  usd() { return Math.max(0, ...this.of("cost.update").map((e) => Number(e.usdEstimate) || 0), ...this.of("receipt").map((e) => Number(e.usdEstimate) || 0), ...this.of("drive.done").map((e) => Number(e.usdEstimate) || 0), ...this.of("rescue.report").map((e) => Number(e.estimateUsd) * 0)); }
  async ready() { return this.until((e) => e.type === "auth.status", 30_000); }
  stop() { try { (this.proc.stdin as any).end(); } catch {} setTimeout(() => this.proc.kill(), 1500); }
}

async function scenario(name: string, only: string[], body: (note: (s: string) => void) => Promise<boolean>) {
  if (only.length && !only.includes(name)) return;
  const notes: string[] = [];
  const t0 = Date.now();
  console.log(`\n=== ${name}`);
  let pass = false;
  try { pass = await body((s) => { notes.push(s); console.log("   ", s); }); } catch (e) { notes.push(`CRASH: ${(e as Error).message}`); console.log("    CRASH", (e as Error).message); }
  results.push({ name, pass, notes });
  console.log(`=== ${name}: ${pass ? "PASS" : "FAIL"} (${Math.round((Date.now() - t0) / 1000)}s)`);
}

const only = process.argv.slice(2);

await scenario("house-rule-and-undo", only, async (note) => {
  const dir = tmp("rule"); put(dir, { "pricing.txt": "Haircut: 20", ".companion/rules.txt": "never edit pricing.txt", "notes.txt": "start" });
  const r = new Real(dir); if (!await r.ready()) { note("runner never said hello"); return false; }
  r.send({ v: 1, id: "s", type: "agent.start", project: dir, agent: "b1", mode: "drive", prompt: "Do two things: change the price in pricing.txt to 25, and create a file hello.txt containing the word hi. Then stop.", model: "claude-sonnet-5-5", budgetUsd: 0.4 });
  const rec = await r.until((e) => e.type === "receipt", 150_000);
  if (!rec) { note("no receipt in time"); r.stop(); return false; }
  const blocked = r.of("agent.tool").filter((e) => e.outcome === "blocked").map((e) => e.summary);
  const price = readFileSync(join(dir, "pricing.txt"), "utf8");
  const hello = existsSync(join(dir, "hello.txt"));
  note(`blocked: ${JSON.stringify(blocked)}; pricing.txt = "${price}"; hello.txt exists = ${hello}; proof = ${rec.proof}; cost = ${rec.usdEstimate}`);
  totalUsd += rec.usdEstimate ?? 0;
  let ok = price === "Haircut: 20" && hello && blocked.length > 0;
  if (!ok) { note("rule or task did not behave"); r.stop(); return false; }
  r.send({ v: 1, id: "u", type: "checkpoint.restore", project: dir, checkpoint: rec.checkpoint });
  await Bun.sleep(1500);
  const undone = !existsSync(join(dir, "hello.txt")) && readFileSync(join(dir, "pricing.txt"), "utf8") === "Haircut: 20";
  note(`after Undo: hello.txt gone = ${!existsSync(join(dir, "hello.txt"))}`);
  r.stop();
  return undone;
});

await scenario("drive", only, async (note) => {
  const dir = tmp("drive"); put(dir, { "index.html": "<!doctype html><html><head><title>Site</title></head><body><h1>My site</h1></body></html>" });
  const r = new Real(dir); if (!await r.ready()) return false;
  await Bun.sleep(200);
  r.send({ v: 1, id: "p", type: "drive.plan", project: dir, agent: "d1", goal: "Add a paragraph that says 'Welcome to my site' under the heading, and then add a footer that says 'Made with Companion'.", model: "claude-sonnet-5-5", budgetUsd: 0.6 });
  const plan = await r.until((e) => e.type === "plan.ready" || e.type === "protocol.error", 120_000);
  if (!plan || plan.type !== "plan.ready") { note(`no plan: ${JSON.stringify(plan)}`); r.stop(); return false; }
  const steps: string[] = plan.steps.map((s: any) => s.title);
  note(`plan (${steps.length} steps, estimate $${plan.estimateUsd}): ${JSON.stringify(steps)}`);
  const okPlan = steps.length >= 1 && steps.length <= 6 && !steps.some((s) => /open.*(editor|browser)|save the file/i.test(s));
  if (!okPlan) note("PLAN QUALITY: too many steps or editor chores");
  r.send({ v: 1, id: "a", type: "drive.approve", agent: "d1", steps });
  const done = await r.until((e) => e.type === "drive.done", 300_000);
  if (!done) { note("plan never finished"); r.stop(); return false; }
  const html = readFileSync(join(dir, "index.html"), "utf8");
  const proofs = r.of("proof.result").map((e) => e.verdict);
  const cps = r.of("checkpoint.created").map((e) => e.checkpoint);
  note(`drive.done: ${JSON.stringify({ status: done.status, completed: done.completed, total: done.total, cost: done.usdEstimate })}; proofs: ${JSON.stringify(proofs)}; snapshots per step: ${cps.length}`);
  note(`page has welcome = ${/Welcome to my site/.test(html)}, footer = ${/Made with Companion/.test(html)}`);
  totalUsd += done.usdEstimate ?? 0;
  // Undo only the last step: the earlier work must stay.
  const lastCp = cps.at(-1);
  r.send({ v: 1, id: "u", type: "checkpoint.restore", project: dir, checkpoint: lastCp });
  await Bun.sleep(1500);
  const after = readFileSync(join(dir, "index.html"), "utf8");
  note(`after undoing the last step the page changed = ${after !== html}`);
  r.stop();
  return done.status === "done" && /Welcome to my site/.test(html) && /Made with Companion/.test(html) && proofs.every((v) => v !== "failed") && after !== html && okPlan;
});

await scenario("take-the-wheel", only, async (note) => {
  const dir = tmp("wheel"); put(dir, { "index.html": "<!doctype html><html><body><h1>Hi</h1></body></html>", "mine.txt": "my notes" });
  const r = new Real(dir); if (!await r.ready()) return false;
  await Bun.sleep(300);
  r.send({ v: 1, id: "p", type: "drive.plan", project: dir, agent: "d1", goal: "Add a short paragraph about a cat to index.html.", model: "claude-sonnet-5-5", budgetUsd: 0.5 });
  const plan = await r.until((e) => e.type === "plan.ready", 120_000);
  if (!plan) { note("no plan"); r.stop(); return false; }
  r.send({ v: 1, id: "a", type: "drive.approve", agent: "d1", steps: plan.steps.slice(0, 1).map((s: any) => s.title) });
  const started = await r.until((e) => e.type === "drive.step" && e.status === "started", 30_000);
  if (!started) { note("step never started"); r.stop(); return false; }
  await Bun.sleep(700);
  const t = Date.now(); writeFileSync(join(dir, "mine.txt"), "I edited this by hand");
  const paused = await r.until((e) => e.type === "drive.paused", 8000);
  if (!paused) { note("it did not pause. events: " + JSON.stringify(r.events.map((e) => e.type + (e.state ? ":" + e.state : "") + (e.status ? ":" + e.status : "") + (e.reason ? ":" + String(e.reason).slice(0, 80) : "") + (e.outcome ? ":" + e.outcome : "")))); const d = await r.until((e) => e.type === "drive.done", 120_000); note(`drive.done = ${d?.status}`); r.stop(); return false; }
  const ms = Date.now() - t;
  note(`paused ${ms} ms after the hand edit: ${JSON.stringify({ reason: paused.reason, path: paused.path })}`);
  r.send({ v: 1, id: "r", type: "drive.resume", agent: "d1" });
  const done = await r.until((e) => e.type === "drive.done", 240_000);
  const mine = readFileSync(join(dir, "mine.txt"), "utf8");
  note(`after resume: drive.done = ${done?.status}; my hand edit kept = ${mine === "I edited this by hand"}`);
  totalUsd += done?.usdEstimate ?? 0;
  r.stop();
  return !!done && done.status === "done" && mine === "I edited this by hand" && ms < 2500 && paused.reason === "files_changed";
});

await scenario("rescue", only, async (note) => {
  const dir = tmp("rescue"); put(dir, { "index.html": `<!doctype html><html><head><title>Portfolio</title></head><body><h1>Portfolio</h1><button onclick="showGallery()">Show gallery</button><script>function show() { document.title = "ok"; }</script></body></html>` });
  const r = new Real(dir); if (!await r.ready()) return false;
  await Bun.sleep(300);
  r.send({ v: 1, id: "d", type: "rescue.diagnose", project: dir, agent: "r1", model: "claude-opus-5-5", budgetUsd: 0.6 });
  const rep = await r.until((e) => e.type === "rescue.report" || e.type === "protocol.error", 180_000);
  if (!rep || rep.type !== "rescue.report") { note(`no report: ${JSON.stringify(rep)}`); r.stop(); return false; }
  note(`summary: ${rep.summary}`); note(`broken: ${rep.broken}`); note(`steps: ${JSON.stringify(rep.steps.map((s: any) => s.title))}`);
  note(`evidence: ${JSON.stringify(rep.evidence.filter((x: any) => x.status === "failed").map((x: any) => x.detail.slice(0, 120)))}`);
  const mentions = /showGallery|gallery|button|function/i.test(rep.broken + rep.steps.map((s: any) => s.title).join(" "));
  if (readFileSync(join(dir, "index.html"), "utf8").includes("showGallery()") === false) note("WARNING: the project changed during diagnosis");
  r.send({ v: 1, id: "a", type: "drive.approve", agent: "r1", steps: rep.steps.map((s: any) => s.title) });
  const done = await r.until((e) => e.type === "drive.done", 300_000);
  const proofs = r.of("proof.result").map((e) => e.verdict);
  note(`after approving: drive.done = ${JSON.stringify({ status: done?.status, completed: done?.completed, total: done?.total })}; proofs ${JSON.stringify(proofs)}`);
  totalUsd += done?.usdEstimate ?? 0;
  r.stop();
  return mentions && !!done && done.status === "done" && proofs.at(-1) === "passed";
});

await scenario("research", only, async (note) => {
  const dir = tmp("research"); put(dir, { "index.html": "<h1>site</h1>" });
  const r = new Real(dir); if (!await r.ready()) return false;
  r.send({ v: 1, id: "q", type: "research.ask", project: dir, agent: "x1", question: "What does the HTML <dialog> element do, and which browsers support it?", model: "claude-sonnet-5-5", budgetUsd: 0.4 });
  const res = await r.until((e) => e.type === "research.done" || e.type === "protocol.error", 180_000);
  if (!res || res.type !== "research.done") { note(`no notes: ${JSON.stringify(res)}`); note(`tools tried: ${JSON.stringify(r.of("agent.tool").map((t) => `${t.tool}:${t.outcome}`))}`); r.stop(); return false; }
  note(`title: ${res.title}`); note(`notes: ${res.notes.length}; first source: ${res.notes[0]?.source}`);
  const file = join(dir, res.file); const filed = existsSync(file);
  const only1 = readdirSync(dir).filter((f) => f !== "index.html" && f !== ".companion");
  note(`filed at ${res.file} = ${filed}; other new files in project = ${JSON.stringify(only1)}`);
  note(`tools: ${JSON.stringify(r.of("agent.tool").map((t) => `${t.tool}:${t.outcome}`))}`);
  r.stop();
  return filed && res.notes.length >= 1 && res.notes.every((n: any) => /^https?:\/\//.test(n.source)) && only1.length === 0;
});

await scenario("daily-limit", only, async (note) => {
  const dir = tmp("limit"); put(dir, { "a.txt": "x" });
  const r = new Real(dir, { COMPANION_DAILY_CEILING_USD: "0.0005" }); if (!await r.ready()) return false;
  r.send({ v: 1, id: "p", type: "drive.plan", project: dir, agent: "d1", goal: "Add a heading to a.txt", model: "claude-sonnet-5-5", budgetUsd: 0.3 });
  const pl = await r.until((e) => e.type === "plan.ready" || e.type === "protocol.error", 120_000);
  note(`plan result: ${pl?.type} ${pl?.reason ?? ""}`);
  try { const { Database } = await import("bun:sqlite"); const db = new Database(join(r.data, "ledger.db"), { readonly: true }); note("ledger: " + JSON.stringify(db.query("select * from spend").all())); } catch (e) { note("ledger unreadable: " + (e as Error).message); }
  const from = r.events.length;
  r.send({ v: 1, id: "s", type: "agent.start", project: dir, agent: "b1", mode: "drive", prompt: "Append the word hello to a.txt", model: "claude-sonnet-5-5", budgetUsd: 0.3 });
  const err = await r.until((e) => e.type === "protocol.error" && /daily limit/i.test(e.reason), 20_000, from);
  note(`second job: ${err ? "refused with: " + err.reason : "NOT refused"}; file untouched = ${readFileSync(join(dir, "a.txt"), "utf8") === "x"}`);
  r.stop();
  return !!err && readFileSync(join(dir, "a.txt"), "utf8") === "x";
});

await scenario("second-model-review", only, async (note) => {
  process.env.COMPANION_ROUTE = "plan"; process.env.COMPANION_MODEL = MODEL; process.env.CLAUDE_CONFIG_DIR = CONFIG;
  const { AgentRunner } = await import("../src/agent.ts");
  const { ScriptedEngine } = await import("../src/engine.ts");
  const { TaskLog } = await import("../src/tasklog.ts");
  const { createEngine, readSettings } = await import("../src/engines.ts");
  const run = async (label: string, files: Record<string, string>, goal: string) => {
    const dir = tmp("rv"); put(dir, { "index.html": "<h1>shop</h1>", "package.json": JSON.stringify({ name: "shop", scripts: {} }) });
    const events: Ev[] = [];
    const script = Object.entries(files).map(([p, c]) => ({ tool: { name: "Write", input: { file_path: p, content: c } }, costUsd: 0.001 }));
    const runner = new AgentRunner({ shadowRoot: tmp("sh"), engine: new ScriptedEngine([script]), reviewer: createEngine(readSettings(process.env)), log: new TaskLog(":memory:"), emit: (e) => events.push(e as Ev),
      proof: async (c: any) => { const rev = c.review ? await c.review() : null; return { verdict: rev && rev.verdict === "changes" ? "failed" : "passed", steps: [{ rung: "review", label: "A second model reviewed the change", status: rev ? (rev.verdict === "approve" ? "passed" : "failed") : "skipped", detail: rev ? rev.concerns.join(" ") : "no review", ms: 1 }], review: rev } as never; } });
    await runner.handle({ v: 1, id: "c", type: "agent.start", project: dir, agent: "a", mode: "drive", prompt: goal, model: "m", budgetUsd: 1 });
    const res = events.find((e) => e.type === "proof.result"); const review = (res?.steps ?? []).find((s: any) => s.rung === "review");
    note(`${label}: review = ${review?.status}; detail = ${String(review?.detail).slice(0, 200)}`);
    return review;
  };
  const good = await run("harmless package change", { "package.json": JSON.stringify({ name: "shop", scripts: { dev: "vite" }, dependencies: { vite: "8" } }) }, "add vite as a dev server");
  const bad = await run("exposed live secret key in a page anyone can open", { "public/app.js": `const stripe = Stripe("sk_live_51H8aAbCdEfGhIjKlMnOpQrStUvWx123456789ABCDEFGHIJKL");\nfetch("/charge");`, "package.json": JSON.stringify({ name: "shop", scripts: {} }) }, "add a pay button to the shop");
  return good?.status === "passed" && bad?.status === "failed";
});

await scenario("ship-gates", only, async (note) => {
  // No model is used: this is the real runner process with the real proof ladder and the real gates.
  const gatesOf = async (dir: string, extra: Record<string, unknown> = {}) => {
    const r = new Real(dir); await r.ready();
    r.send({ v: 1, id: "s", type: "ship.check", project: dir, runChecks: true, ...extra });
    const g = await r.until((e) => e.type === "ship.gates", 120_000);
    const raw = JSON.stringify(r.events); r.stop();
    return { g, raw };
  };
  const clean = tmp("shipclean"); put(clean, { "index.html": "<!doctype html><h1>My studio</h1><p>Welcome</p>" });
  const a = await gatesOf(clean);
  note(`clean page: canShip = ${a.g?.canShip}; gates = ${JSON.stringify(a.g?.gates.map((x: any) => x.id + ":" + x.status))}`);
  const leak = tmp("shipleak"); put(leak, { "index.html": "<!doctype html><h1>Shop</h1>", "src/pay.js": 'const k = "sk_live_51H8aAbCdEfGhIjKlMnOpQrStUvWx123456789ABCDEFGHIJKL";' });
  const b = await gatesOf(leak);
  const sec = b.g?.gates.find((x: any) => x.id === "secrets");
  note(`leaked key: canShip = ${b.g?.canShip}; secrets = ${sec?.status}; says: ${String(sec?.detail).slice(0, 110)}; key in any event = ${b.raw.includes("sk_live_51H8aAb")}`);
  const built = tmp("shipbuilt"); put(built, { "index.html": "<!doctype html><h1>x</h1>", "dist/main.js": 'k="sk_live_51H8aAbCdEfGhIjKlMnOpQrStUvWx123456789ABCDEFGHIJKL"' });
  const c = await gatesOf(built);
  note(`key inside the built site: ${String(c.g?.gates.find((x: any) => x.id === "secrets")?.detail).slice(0, 120)}`);
  const db = tmp("shipdb"); put(db, { "index.html": "<!doctype html><h1>app</h1>", "package.json": JSON.stringify({ name: "app", dependencies: { "@supabase/supabase-js": "2" } }), "supabase/migrations/001.sql": "create table public.orders (id int);" });
  const d = await gatesOf(db);
  note(`unprotected table: canShip = ${d.g?.canShip}; ${d.g?.gates.find((x: any) => x.id === "database_access")?.status}: ${String(d.g?.gates.find((x: any) => x.id === "database_access")?.detail).slice(0, 100)}`);
  const stale = tmp("shipstale"); put(stale, { "index.html": "<!doctype html><h1>one</h1>" });
  const rr = new Real(stale); await rr.ready();
  rr.send({ v: 1, id: "s1", type: "ship.check", project: stale, runChecks: true });
  await rr.until((e) => e.type === "ship.gates", 120_000);
  writeFileSync(join(stale, "index.html"), "<!doctype html><h1>two, changed by hand</h1>");
  const n = rr.events.length;
  rr.send({ v: 1, id: "s2", type: "ship.check", project: stale });
  const e2 = await rr.until((e) => e.type === "ship.gates", 30_000, n); rr.stop();
  note(`changed after the check: canShip = ${e2?.canShip}; ${e2?.gates.find((x: any) => x.id === "checked")?.detail}`);
  return a.g?.canShip === true && b.g?.canShip === false && sec?.status === "blocked" && !b.raw.includes("sk_live_51H8aAb") && /anyone who opens your site/i.test(String(c.g?.gates.find((x: any) => x.id === "secrets")?.detail)) && d.g?.canShip === false && e2?.canShip === false;
});

console.log("\n\n================ SUMMARY ================");
for (const r of results) console.log(`${r.pass ? "PASS" : "FAIL"}  ${r.name}`);
console.log(`estimated usage: about $${totalUsd.toFixed(3)} (an estimate, on the test plan login)`);
process.exit(results.every((r) => r.pass) ? 0 : 1);
