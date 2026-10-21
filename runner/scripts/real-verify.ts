// MANUAL, REAL CLAUDE ON THE FOUNDER'S API KEY: checks that Drive, Rescue, Research, house rules, undo, take the wheel,
// the daily limit, Explain, memory, Draw it for me, the practice project, the ship gates and the second model review work
// with the real engine, through the runner exactly as the app starts it (the key handed over the pipe, Companion's own
// Claude Code folder inside a throwaway data folder). Dry by default: it prints the plan and spends nothing.
//   bun run scripts/real-verify.ts                     the plan, free
//   bun run scripts/real-verify.ts --spend             every scenario, on the models the app ships with
//   bun run scripts/real-verify.ts --spend drive explain        only those
//   --cheap            every agent task on Haiku 4.5 instead (checks the wiring, not the quality)
//   --loop-different   answer a loop card with "try a different way" instead of "stop" (spends more)
//   --total-usd=N --per-case-usd=N --timeout-s=N        the stops (defaults below)
// Every rule for real runs is in realrun-harness.ts. A task that fails the same way three times shows the loop card
// (loop.stuck); it is answered and noted, so no scenario waits forever, and each scenario has its own time limit.
// Since 17 Oct 2026 this runs on the API key route; the older test plan login is no longer used here.
// Money: a runner books a round when that round's result arrives (or, for a round stopped first, an estimate from its
// token counts as it ends), so a round still running is not seen by the spending watcher. The hard bound is each task's own budget (the runner passes it to Claude Code as its spending limit):
// before a command is sent, its budget is cut to the room left under the case's and the run's stops, and a task that is
// cut short (Stop everything, a spending stop, a time limit, the end of a scenario) counts its whole budget, less what
// the runner booked for it. A small Explain or diagram call the runner makes in the background is not bounded this way.
import { execFileSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { parseCommand } from "../../protocol/index.ts";
import { AgentRunner } from "../src/agent.ts";
import { ScriptedEngine } from "../src/engine.ts";
import { createEngine, readSettings } from "../src/engines.ts";
import { minimalEnv } from "../src/env.ts";
import { heldKey } from "../src/keychain.ts";
import { FastLane } from "../src/lanes.ts";
import { MODELS } from "../src/models.ts";
import { SdkEngine, SessionTotals } from "../src/sdkEngine.ts";
import { TaskLog } from "../src/tasklog.ts";
import { fixFoundPrompt, PRACTICE_BUDGET_USD } from "../src/fixfound.ts";
import { noTableOpen } from "../src/ship/opentables.ts";
import { RunnerDriver, approvalTally, ledgerSpent, parseArgs, runCases, spawnRunner, type ApproveRule, type Case, type CaseCtx, type Proc } from "./realrun-harness.ts";

type Ev = Record<string, any>;
const CHEAP = "claude-haiku-4-5-20251001";
const put = (dir: string, files: Record<string, string>) => { for (const [p, c] of Object.entries(files)) { mkdirSync(join(dir, p, ".."), { recursive: true }); writeFileSync(join(dir, p), c); } };

/** One runner process, as the app starts it. */
export type Live = {
  project: string; data: string; events: Ev[];
  send(c: Ev): void; of(t: string): Ev[]; until(pred: (e: Ev) => boolean, ms: number, from?: number): Promise<Ev | null>;
  ready(): Promise<boolean>; usd(): number; stop(): void;
};
/** What a scenario is given: runners, folders, the models, and the case's own context. */
export type RunnerOpts = { approve?: ApproveRule };
/** The one command approve-after-wait allows: git init in the throwaway project, alone (a cd into it first is fine). */
/** The two commands approve-git-save allows, each alone: git add of named files, and git commit with a short message. */
export const GIT_SAVE_ONLY = /^(cd [^;&|`$()<>\n]+ && )?git (add [^;&|`$()<>\n]+|commit -m ("[^"`$\n]+"|'[^'\n]+'))$/;
/** What approve-env-line allows: adding a line with a shell append, or an edit or write of a settings file (its summary names the file). */
export const ENV_LINE_ONLY = /^(?:(?:printf|echo) .*>> \.env(?: .*)?|(?:Edit|Write|MultiEdit): .*\.env)$/;
export const GIT_INIT_ONLY = /^(cd [^;&|`$()<>\n]+ && )?git init( [^;&|`$()<>\n]+)?$/;
export type Kit = { runner(project: string, env?: Record<string, string>, o?: RunnerOpts): Live; scratch(label: string): string; agentModel: string; diagnoseModel: string; reviewModel: string; cheap: boolean; ctx: CaseCtx };
export type Scenario = { name: string; what: string; estimateUsd: number; capUsd: number; timeoutS: number; inProcess?: boolean; run(kit: Kit, note: (s: string) => void): Promise<boolean> };

/** A command this script would send that the runner would refuse is a bug in the script: it is caught before it is sent. */
export function checkedCommand(c: Ev): string {
  const line = JSON.stringify(c);
  const p = parseCommand(line);
  if (!p.ok) throw new Error(`this script built a command the runner refuses (${p.error})`);
  return line;
}


// The practice projects (app/sample/practices.json) the person fixes with Claude: the copy as the shell makes it (the
// sample and its house rule), Find with no model, then the fix through the shipped request and cap (runner/src/fixfound.ts,
// the same the page sends), then Find again. Each notes its seconds and dollars, so the times and costs on the Learn tab can
// be replaced by measured ones, and checks that the protected file is untouched. A mismatch is noted and the case fails,
// but every step is still sent, so a dry run checks every command.
type PracticeEntry = { id: string; folder: string; find: "checks" | "gate"; expect: { file: string; line: number; gate?: string }; fix: string; protect: string[] };
const PRACTICE_CATALOG = (JSON.parse(readFileSync(join(import.meta.dir, "../../app/sample/practices.json"), "utf8")) as { practices: PracticeEntry[] }).practices;
function practiceCase(e: PracticeEntry): Scenario {
  return {
    name: e.id === "signup" ? "practice" : `practice-${e.id}`,
    what: `the ${e.id} practice project: Find (no Claude), then Fix it with me on the shipped request and cap, then Find again, with its own check untouched`,
    estimateUsd: 0.3, capUsd: 1.0, timeoutS: 480,
    async run(kit, note) {
      const dir = kit.scratch(`practice-${e.id}`);
      cpSync(join(import.meta.dir, "../../app/sample", e.folder), dir, { recursive: true });
      mkdirSync(join(dir, ".companion"), { recursive: true });
      writeFileSync(join(dir, ".companion/rules.txt"), `# Companion added these rules to its practice copy, so the fix cannot pass by changing the check.\n${e.protect.map((f) => `never edit ${f}`).join("\n")}\n`);
      const kept = e.protect.map((f) => readFileSync(join(dir, f), "utf8"));
      const r = kit.runner(dir); if (!await r.ready()) return false;
      const t0 = Date.now();
      let ok = true;
      const find = async () => {
        const n = r.events.length;
        if (e.find === "gate") { r.send({ v: 1, id: `g${n}`, type: "ship.check", project: dir }); const g = await r.until((x) => x.type === "ship.gates", 90_000, n); return g?.gates?.find((x: Ev) => x.id === e.expect.gate) ?? null; }
        r.send({ v: 1, id: `f${n}`, type: "problem.find", project: dir, agent: "builder-1" });
        return await r.until((x) => x.type === "problem.found", 90_000, n);
      };
      const found = await find();
      const place = e.find === "gate" ? found?.places?.[0] : found?.problem;
      note(`found: ${JSON.stringify({ status: found?.verdict ?? found?.status, file: place?.file, line: place?.line })}`);
      if (place?.file !== e.expect.file) ok = false;
      const evidence = e.find === "gate"
        ? { label: found?.label, detail: found?.detail, problem: place ? { kind: "line" as const, file: place.file, line: place.line, lineText: place.lineText ?? "", message: found?.detail ?? "", from: "ship" } : undefined }
        : { label: found?.label, detail: found?.detail, problem: found?.problem };
      r.send({ v: 1, id: "s", type: "agent.start", project: dir, agent: "builder-1", mode: "drive", prompt: fixFoundPrompt(evidence), model: kit.agentModel, budgetUsd: PRACTICE_BUDGET_USD, practice: e.id });
      const rec = await r.until((x) => x.type === "receipt", 360_000);
      if (!rec) { note("no receipt"); return false; }
      const after = await find();
      // The open table is fixed only when the check shows no open table (a rule that says "true" still leaves it open).
      const fixed = e.find === "gate" ? noTableOpen(after) : !!after && after.verdict !== "failed";
      const untouched = e.protect.every((f, i) => readFileSync(join(dir, f), "utf8") === kept[i]);
      note(`receipt proof = ${rec.proof}; practice = ${rec.practice}; changed = ${JSON.stringify(rec.changed?.map((c: Ev) => c.file))}; Find again fixed = ${fixed}; protected files untouched = ${untouched}; ${Math.round((Date.now() - t0) / 1000)} s; cost ${rec.usdEstimate}`);
      return ok && ["passed", "partial"].includes(rec.proof) && rec.practice === e.id && fixed && untouched;
    },
  };
}
const PRACTICE_CASES: Scenario[] = PRACTICE_CATALOG.filter((e) => e.fix === "task").map(practiceCase);

export const SCENARIOS: Scenario[] = [
  {
    name: "init-check", what: "system/init lists only the expected tools for an agent session and for the fast lane (in process, same options)", estimateUsd: 0.05, capUsd: 0.2, timeoutS: 180, inProcess: true,
    async run(kit, note) {
      const { ctx } = kit;
      const project = kit.scratch("init");
      const seen: string[] = [];
      const engine = new SdkEngine({ claudeBinary: ctx.claudeBinary, env: ctx.env, totals: new SessionTotals(), queryFn: ctx.guard({ tools: "agent", model: kit.agentModel }, { onInit: (m) => seen.push(`agent: ${m.tools.length} tools, model ${m.model}, Claude Code ${m.claude_code_version}`) }) as never });
      let text = "";
      const gen = engine.start({ prompt: "Reply with the single word ok.", project, model: kit.agentModel, signal: ctx.signal, budgetUsd: 0.1, planOnly: true, authorize: async () => ({ allow: false, reason: "no tools in this check" }) });
      for (let n = await gen.next(); !n.done; n = await gen.next(undefined)) if (n.value.text) text += n.value.text;
      const fast = await new FastLane({ claudeBinary: ctx.claudeBinary, env: ctx.env, model: MODELS.fast, queryFn: ctx.guard({ tools: [], model: MODELS.fast }, { onInit: (m) => seen.push(`fast lane: ${m.tools.length} tools`) }) as never })
        .run({ text: "Reply with exactly the word ok.", system: "You reply with exactly what you are asked for.", raw: true }, () => {}, ctx.signal);
      for (const s of seen) note(s);
      return /ok/i.test(text) && /ok/i.test(fast.text) && seen.length === 2;
    },
  },
  {
    name: "house-rule-and-undo", what: "a house rule blocks an edit; Undo takes the task back", estimateUsd: 0.15, capUsd: 0.8, timeoutS: 300,
    async run(kit, note) {
      const dir = kit.scratch("rule"); put(dir, { "pricing.txt": "Haircut: 20", ".companion/rules.txt": "never edit pricing.txt", "notes.txt": "start" });
      const r = kit.runner(dir); if (!await r.ready()) { note("runner never said hello on the key route"); return false; }
      r.send({ v: 1, id: "s", type: "agent.start", project: dir, agent: "b1", mode: "drive", prompt: "Do two things: change the price in pricing.txt to 25, and create a file hello.txt containing the word hi. Then stop.", model: kit.agentModel, budgetUsd: 0.6 });
      const rec = await r.until((e) => e.type === "receipt", 240_000);
      if (!rec) { note("no receipt in time"); return false; }
      const blocked = r.of("agent.tool").filter((e) => e.outcome === "blocked").map((e) => e.summary);
      const price = readFileSync(join(dir, "pricing.txt"), "utf8"), hello = existsSync(join(dir, "hello.txt"));
      note(`blocked: ${JSON.stringify(blocked)}; pricing.txt = "${price}"; hello.txt exists = ${hello}; proof = ${rec.proof}; cost = ${rec.usdEstimate}`);
      const behaved = price === "Haircut: 20" && hello && blocked.length > 0;
      if (!behaved) note("rule or task did not behave");
      // Undo is checked either way: it costs nothing, and the task has already been paid for.
      const n = r.events.length;
      r.send({ v: 1, id: "u", type: "checkpoint.restore", project: dir, checkpoint: rec.checkpoint });
      await r.until((e) => e.type === "checkpoint.restored" || e.type === "protocol.error", 20_000, n);
      const undone = !existsSync(join(dir, "hello.txt")) && readFileSync(join(dir, "pricing.txt"), "utf8") === "Haircut: 20";
      note(`after Undo: hello.txt gone = ${!existsSync(join(dir, "hello.txt"))}`);
      return behaved && undone;
    },
  },
  {
    name: "drive", what: "a short plan, approved and run step by step with proof; undoing the last step keeps the earlier work", estimateUsd: 0.4, capUsd: 1.5, timeoutS: 600,
    async run(kit, note) {
      const dir = kit.scratch("drive"); put(dir, { "index.html": "<!doctype html><html><head><title>Site</title></head><body><h1>My site</h1></body></html>" });
      const r = kit.runner(dir); if (!await r.ready()) return false;
      r.send({ v: 1, id: "p", type: "drive.plan", project: dir, agent: "d1", goal: "Add a paragraph that says 'Welcome to my site' under the heading, and then add a footer that says 'Made with Companion'.", model: kit.agentModel, budgetUsd: 1.2 });
      const plan = await r.until((e) => e.type === "plan.ready" || e.type === "protocol.error", 180_000);
      if (!plan || plan.type !== "plan.ready") { note(`no plan: ${JSON.stringify(plan)}`); return false; }
      const steps: string[] = plan.steps.map((s: Ev) => s.title);
      note(`plan (${steps.length} steps, estimate $${plan.estimateUsd}): ${JSON.stringify(steps)}`);
      const okPlan = steps.length >= 1 && steps.length <= 6 && !steps.some((s) => /open.*(editor|browser)|save the file/i.test(s));
      if (!okPlan) note("PLAN QUALITY: too many steps or editor chores");
      r.send({ v: 1, id: "a", type: "drive.approve", agent: "d1", steps });
      const done = await r.until((e) => e.type === "drive.done", 360_000);
      if (!done) { note("plan never finished"); return false; }
      const html = readFileSync(join(dir, "index.html"), "utf8");
      const proofs = r.of("proof.result").map((e) => e.verdict);
      const cps = r.of("checkpoint.created").map((e) => e.checkpoint);
      note(`drive.done: ${JSON.stringify({ status: done.status, completed: done.completed, total: done.total, cost: done.usdEstimate })}; proofs: ${JSON.stringify(proofs)}; snapshots per step: ${cps.length}`);
      note(`page has welcome = ${/Welcome to my site/.test(html)}, footer = ${/Made with Companion/.test(html)}`);
      const n = r.events.length;
      r.send({ v: 1, id: "u", type: "checkpoint.restore", project: dir, checkpoint: cps.at(-1) });
      await r.until((e) => e.type === "checkpoint.restored" || e.type === "protocol.error", 20_000, n);
      const after = readFileSync(join(dir, "index.html"), "utf8");
      note(`after undoing the last step the page changed = ${after !== html}`);
      return done.status === "done" && /Welcome to my site/.test(html) && /Made with Companion/.test(html) && proofs.every((v) => v !== "failed") && after !== html && okPlan;
    },
  },
  {
    name: "visual-receipt", what: "a proven change gets a before and after picture with the change circled", estimateUsd: 0.15, capUsd: 0.6, timeoutS: 420,
    async run(kit, note) {
      const dir = kit.scratch("pic"); put(dir, { "index.html": "<!doctype html><html><head><title>Mugs</title></head><body style=\"font:16px sans-serif;margin:24px\"><h1>Hand made mugs</h1><p>Each one is thrown by hand.</p></body></html>" });
      const r = kit.runner(dir); if (!await r.ready()) return false;
      r.send({ v: 1, id: "s", type: "agent.start", project: dir, agent: "a1", mode: "drive", prompt: "In index.html, add a button labelled 'Add to cart' right under the paragraph. Change nothing else.", model: kit.agentModel, budgetUsd: 0.5 });
      const rec = await r.until((e) => e.type === "receipt", 240_000);
      if (!rec) { note("no receipt"); return false; }
      const pic = await r.until((e) => e.type === "receipt.visual", 90_000);
      note(`receipt proof = ${rec.proof}; picture after ${pic ? Math.round((pic.at - rec.at) / 100) / 10 : "-"} s; ${pic ? JSON.stringify({ made: pic.made, caption: pic.caption, circles: pic.circles, file: !!pic.file }) : "no picture"}`);
      if (pic?.file && process.env.COMPANION_KEEP_PICTURE) writeFileSync(process.env.COMPANION_KEEP_PICTURE, readFileSync(pic.file));
      return rec.proof === "passed" && !!pic && pic.made === true && pic.circles >= 1 && /works now/.test(pic.caption) && !!pic.file && existsSync(pic.file);
    },
  },
  ...PRACTICE_CASES,
  {
    name: "diagram", what: "Draw it for me on the fast lane: a small diagram of why the sign up breaks", estimateUsd: 0.01, capUsd: 0.1, timeoutS: 150,
    async run(kit, note) {
      const dir = kit.scratch("dg"); put(dir, {
        "package.json": JSON.stringify({ name: "signup-demo", dependencies: { react: "18", express: "4" } }),
        "src/Signup.jsx": "export function Signup() {\n  async function submit(email) {\n    const res = await fetch('/api/signup', { method: 'POST', body: JSON.stringify({ email }) });\n    return res.json();\n  }\n  return <button onClick={() => submit('a@b.c')}>Sign up</button>;\n}\n",
        "server/routes.js": "const express = require('express');\nconst app = express();\napp.post('/api/register', (req, res) => { saveUser(req.body.email); res.json({ ok: true }); });\n",
      });
      const r = kit.runner(dir); if (!await r.ready()) return false;
      const t0 = Date.now();
      r.send({ v: 1, id: "d", type: "diagram.ask", project: dir, question: "Why did this break?", problem: { kind: "line", file: "src/Signup.jsx", line: 3, message: "POST /api/signup 404 (Not Found)" } });
      const out = await r.until((e) => e.type === "diagram.ready", 90_000);
      if (!out) { note("no answer"); return false; }
      const d = out.diagram;
      note(`${Math.round((Date.now() - t0) / 100) / 10} s; made=${out.made}; ${d ? JSON.stringify({ nodes: d.nodes.map((n: Ev) => n.label), broken: d.broken, caption: d.caption }) : out.reason}`);
      const words = JSON.stringify(d ?? {}).toLowerCase();
      return out.made === true && d.nodes.length >= 2 && d.nodes.length <= 6 && /signup|register|route|api/.test(words) && /signup|register|route|exist|match|name/.test(String(d.broken.reason).toLowerCase());
    },
  },
  {
    name: "take-the-wheel", what: "a hand edit pauses Drive within a moment, and resuming keeps the person's edit", estimateUsd: 0.3, capUsd: 1.0, timeoutS: 540,
    async run(kit, note) {
      const dir = kit.scratch("wheel"); put(dir, { "index.html": "<!doctype html><html><body><h1>Hi</h1></body></html>", "mine.txt": "my notes" });
      const r = kit.runner(dir); if (!await r.ready()) return false;
      await Bun.sleep(300);
      r.send({ v: 1, id: "p", type: "drive.plan", project: dir, agent: "d1", goal: "Add a short paragraph about a cat to index.html.", model: kit.agentModel, budgetUsd: 0.8 });
      const plan = await r.until((e) => e.type === "plan.ready", 180_000);
      if (!plan) { note("no plan"); return false; }
      r.send({ v: 1, id: "a", type: "drive.approve", agent: "d1", steps: plan.steps.slice(0, 1).map((s: Ev) => s.title) });
      const started = await r.until((e) => e.type === "drive.step" && e.status === "started", 30_000);
      if (!started) { note("step never started"); return false; }
      await Bun.sleep(700);
      const t = Date.now(); writeFileSync(join(dir, "mine.txt"), "I edited this by hand");
      const paused = await r.until((e) => e.type === "drive.paused", 8000);
      if (!paused) { note("it did not pause. events: " + JSON.stringify(r.events.map((e) => e.type + (e.state ? ":" + e.state : "") + (e.status ? ":" + e.status : "") + (e.reason ? ":" + String(e.reason).slice(0, 80) : "") + (e.outcome ? ":" + e.outcome : "")))); const d = await r.until((e) => e.type === "drive.done", 180_000); note(`drive.done = ${d?.status}`); return false; }
      const ms = Date.now() - t;
      note(`paused ${ms} ms after the hand edit: ${JSON.stringify({ reason: paused.reason, path: paused.path })}`);
      r.send({ v: 1, id: "r", type: "drive.resume", agent: "d1" });
      const done = await r.until((e) => e.type === "drive.done", 300_000);
      const mine = readFileSync(join(dir, "mine.txt"), "utf8");
      note(`after resume: drive.done = ${done?.status}; my hand edit kept = ${mine === "I edited this by hand"}`);
      return !!done && done.status === "done" && mine === "I edited this by hand" && ms < 2500 && paused.reason === "files_changed";
    },
  },
  {
    name: "rescue", what: "Rescue diagnoses a broken button on Opus 5.5 without changing anything, then its plan fixes it with proof", estimateUsd: 0.6, capUsd: 1.5, timeoutS: 720,
    async run(kit, note) {
      // A finished page with one bug: the button calls a name the script does not have. (An unfinished page, a button with no gallery
// behind it, is a fair plan to finish the gallery, and Rescue rightly hands "add your photos" back to the person.)
      const page = `<!doctype html><html><head><title>Portfolio</title></head><body><h1>Portfolio</h1><button onclick="showGallery()">Show gallery</button><div id="gallery" hidden><p>Three photos of my work</p></div><script>function show() { document.getElementById("gallery").hidden = false; }</script></body></html>`;
      const dir = kit.scratch("rescue"); put(dir, { "index.html": page });
      const r = kit.runner(dir); if (!await r.ready()) return false;
      await Bun.sleep(300);
      r.send({ v: 1, id: "d", type: "rescue.diagnose", project: dir, agent: "r1", model: kit.diagnoseModel, budgetUsd: 1.2 });
      const rep = await r.until((e) => e.type === "rescue.report" || e.type === "protocol.error", 240_000);
      if (!rep || rep.type !== "rescue.report") { note(`no report: ${JSON.stringify(rep)}`); return false; }
      note(`summary: ${rep.summary}`); note(`broken: ${rep.broken}`); note(`steps: ${JSON.stringify(rep.steps.map((s: Ev) => s.title))}`);
      note(`evidence: ${JSON.stringify(rep.evidence.filter((x: Ev) => x.status === "failed").map((x: Ev) => String(x.detail).slice(0, 120)))}`);
      const mentions = /showGallery|gallery|button|function/i.test(rep.broken + rep.steps.map((s: Ev) => s.title).join(" "));
      const untouched = readFileSync(join(dir, "index.html"), "utf8") === page;
      if (!untouched) note("WARNING: the project changed during diagnosis");
      r.send({ v: 1, id: "a", type: "drive.approve", agent: "r1", steps: rep.steps.map((s: Ev) => s.title) });
      const done = await r.until((e) => e.type === "drive.done", 360_000);
      const proofs = r.of("proof.result").map((e) => e.verdict);
      note(`after approving: drive.done = ${JSON.stringify({ status: done?.status, completed: done?.completed, total: done?.total })}; proofs ${JSON.stringify(proofs)}`);
      return mentions && untouched && !!done && done.status === "done" && proofs.at(-1) === "passed";
    },
  },
  {
    name: "memory", what: "project memory and the profile learn from a task; off the record learns and keeps nothing; forgetting a line removes it everywhere", estimateUsd: 0.2, capUsd: 0.8, timeoutS: 480,
    async run(kit, note) {
      const dir = kit.scratch("mem"); put(dir, { "package.json": JSON.stringify({ name: "shop", dependencies: { react: "18.0.0" } }) });
      const r = kit.runner(dir); if (!await r.ready()) return false;
      r.send({ v: 1, id: "s1", type: "agent.start", project: dir, agent: "b1", mode: "drive", prompt: "Create a file hello.txt containing the word hi, and keep your answer shorter. Then stop.", model: kit.agentModel, budgetUsd: 0.35 });
      const rec = await r.until((e) => e.type === "receipt", 180_000);
      if (!rec) { note(`no receipt in time; errors: ${JSON.stringify(r.of("protocol.error").map((e) => e.reason))}; states: ${JSON.stringify(r.of("agent.state").map((e) => e.state))}; tools: ${JSON.stringify(r.of("agent.tool").map((e) => `${e.tool}:${e.outcome}`))}`); return false; }
      const readIf = (f: string) => (existsSync(f) ? readFileSync(f, "utf8") : "");
      const mem = readIf(join(dir, ".companion/project.md")), prof = readIf(join(r.data, "profile.md")), agents = readIf(join(dir, "AGENTS.md")), claude = readIf(join(dir, "CLAUDE.md"));
      note(`project memory learned the stack = ${/Built with React/.test(mem)}; profile learned the preference = ${/Prefers short answers/.test(prof)}; saved events = ${r.of("memory.saved").length}`);
      note(`AGENTS.md has the facts = ${/Built with React/.test(agents)}; no profile in it = ${!/short answers/.test(agents)}; CLAUDE.md imports it = ${claude.startsWith("@AGENTS.md")}`);
      let ok = /Built with React/.test(mem) && /Prefers short answers/.test(prof) && /Built with React/.test(agents) && !/short answers/.test(agents) && claude.startsWith("@AGENTS.md") && rec.proof !== undefined;
      // Off the record: nothing read, nothing written, nothing kept in the log or the snapshot label.
      const before = readIf(join(dir, ".companion/project.md"));
      const n0 = r.events.length;
      r.send({ v: 1, id: "s2", type: "agent.start", project: dir, agent: "b1", mode: "drive", prompt: "Create a file private.txt containing ok. My brother Tomas is secretly selling the shop, keep it shorter. Then stop.", model: kit.agentModel, budgetUsd: 0.35, offTheRecord: true });
      const rec2 = await r.until((e) => e.type === "receipt", 180_000, n0);
      if (!rec2) { note("off the record task never finished"); return false; }
      const after = readIf(join(dir, ".companion/project.md"));
      const cp = r.events.slice(n0).find((e) => e.type === "checkpoint.created");
      r.send({ v: 1, id: "t", type: "tasks.list", project: dir });
      const tl = await r.until((e) => e.type === "tasks.list", 5000, n0);
      const logText = JSON.stringify(tl?.tasks ?? []);
      note(`off the record: memory unchanged = ${before === after}; new lines announced = ${r.events.slice(n0).filter((e) => e.type === "memory.saved").length}; snapshot label = "${cp?.label}"; log mentions Tomas = ${/Tomas/.test(logText)}`);
      ok = ok && before === after && !/Tomas/.test(logText) && !/Tomas/.test(String(cp?.label)) && r.events.slice(n0).every((e) => e.type !== "memory.saved");
      // Forget a line: it leaves the project memory and the shared file, and stays out.
      r.send({ v: 1, id: "l", type: "memory.list", project: dir });
      const st = await r.until((e) => e.type === "memory.state", 5000, n0);
      const line = st?.projectLines?.find((l: Ev) => /^Built with/.test(l.text));
      if (!line) { note("no line to forget"); return false; }
      const n1 = r.events.length;
      r.send({ v: 1, id: "f", type: "memory.forget", project: dir, scope: "project", line: line.id });
      await r.until((e) => e.type === "memory.state" || e.type === "memory.refused", 5000, n1);
      const agents2 = readIf(join(dir, "AGENTS.md")), mem2 = readIf(join(dir, ".companion/project.md"));
      note(`after forgetting: gone from memory = ${!/Built with/.test(mem2)}; gone from AGENTS.md = ${!/Built with/.test(agents2)}`);
      return ok && !/Built with/.test(mem2) && !/Built with/.test(agents2);
    },
  },
  {
    name: "explain", what: "Explain says why, from the real change, in two short lines with one check question; Where was I gives three lines", estimateUsd: 0.15, capUsd: 0.6, timeoutS: 360,
    async run(kit, note) {
      const dir = kit.scratch("expl"); put(dir, { "index.html": "<h1>shop</h1>" });
      const r = kit.runner(dir); if (!await r.ready()) return false;
      r.send({ v: 1, id: "s1", type: "agent.start", project: dir, agent: "b1", mode: "drive", prompt: "Add a paragraph under the heading in index.html that says the shop opens at nine. Then stop.", model: kit.agentModel, budgetUsd: 0.5 });
      const rec = await r.until((e) => e.type === "receipt", 180_000);
      if (!rec) { note("no receipt in time"); return false; }
      const ex = await r.until((e) => e.type === "explain.ready", 90_000);
      if (!ex) { note("no explanation arrived"); return false; }
      note(`bullets: ${JSON.stringify(ex.bullets)}; question: ${JSON.stringify(ex.question ?? null)}; cost = ${ex.usdEstimate}`);
      note(`first changed line: ${JSON.stringify(rec.changedAt ?? null)}; mentions the change: ${ex.bullets.some((b: string) => /nine|9|open/i.test(b))}`);
      r.send({ v: 1, id: "rc", type: "recap.ask", project: dir, since: new Date(Date.now() - 3600_000).toISOString() });
      const rc = await r.until((e) => e.type === "recap.ready", 5000);
      note(`recap: ${JSON.stringify(rc?.lines)}`);
      // The "why" must be about the work, never about the prompt (the fast lane once wrapped Explain in "improve the prompt").
      const aboutPrompt = ex.bullets.some((b: string) => /\b(original |the )?prompt\b|vague|too short/i.test(b));
      if (aboutPrompt) note("EXPLAIN WAS ABOUT THE PROMPT, NOT THE WORK");
      const questionOk = !ex.question || (ex.question.options.length >= 2 && ex.question.options.length <= 3);
      return ex.bullets.length >= 1 && ex.bullets.length <= 2 && questionOk && rec.changedAt?.file === "index.html" && (rc?.lines?.length ?? 0) === 3 && !aboutPrompt;
    },
  },
  {
    name: "research", what: "Research answers with sources and files its notes, changing nothing else in the project", estimateUsd: 0.3, capUsd: 1.0, timeoutS: 360,
    async run(kit, note) {
      const dir = kit.scratch("research"); put(dir, { "index.html": "<h1>site</h1>" });
      const r = kit.runner(dir); if (!await r.ready()) return false;
      r.send({ v: 1, id: "q", type: "research.ask", project: dir, agent: "x1", question: "What does the HTML <dialog> element do, and which browsers support it?", model: kit.agentModel, budgetUsd: 0.8 });
      const res = await r.until((e) => e.type === "research.done" || e.type === "protocol.error", 240_000);
      if (!res || res.type !== "research.done") { note(`no notes: ${JSON.stringify(res)}`); note(`tools tried: ${JSON.stringify(r.of("agent.tool").map((t) => `${t.tool}:${t.outcome}`))}`); return false; }
      note(`title: ${res.title}`); note(`notes: ${res.notes.length}; first source: ${res.notes[0]?.source}`);
      const filed = existsSync(join(dir, res.file));
      const others = readdirSync(dir).filter((f) => f !== "index.html" && f !== ".companion");
      note(`filed at ${res.file} = ${filed}; other new files in project = ${JSON.stringify(others)}`);
      note(`tools: ${JSON.stringify(r.of("agent.tool").map((t) => `${t.tool}:${t.outcome}`))}`);
      return filed && res.notes.length >= 1 && res.notes.every((n: Ev) => /^https?:\/\//.test(n.source)) && others.length === 0;
    },
  },
  {
    name: "daily-limit", what: "a project over its daily limit refuses new work in plain words and changes nothing", estimateUsd: 0.02, capUsd: 0.3, timeoutS: 300,
    async run(kit, note) {
      const dir = kit.scratch("limit"); put(dir, { "a.txt": "x" });
      const r = kit.runner(dir, { COMPANION_DAILY_CEILING_USD: "0.0005" }); if (!await r.ready()) return false;
      r.send({ v: 1, id: "p", type: "drive.plan", project: dir, agent: "d1", goal: "Add a heading to a.txt", model: kit.agentModel, budgetUsd: 0.3 });
      const pl = await r.until((e) => e.type === "plan.ready" || e.type === "protocol.error", 180_000);
      note(`plan result: ${pl?.type} ${pl?.reason ?? ""}; ledger: $${ledgerSpent(r.data).toFixed(4)}`);
      const from = r.events.length;
      r.send({ v: 1, id: "s", type: "agent.start", project: dir, agent: "b1", mode: "drive", prompt: "Append the word hello to a.txt", model: kit.agentModel, budgetUsd: 0.3 });
      const err = await r.until((e) => e.type === "protocol.error" && /daily limit/i.test(e.reason), 20_000, from);
      note(`second job: ${err ? "refused with: " + err.reason : "NOT refused"}; file untouched = ${readFileSync(join(dir, "a.txt"), "utf8") === "x"}`);
      return !!err && readFileSync(join(dir, "a.txt"), "utf8") === "x";
    },
  },
  {
    name: "second-model-review", what: "the second model review passes a harmless change and stops an exposed live secret key (in process, the review engine is real)", estimateUsd: 0.3, capUsd: 1.2, timeoutS: 420, inProcess: true,
    async run(kit, note) {
      const { ctx } = kit;
      // The review engine is created exactly as the runner creates it, with the key held in memory as the app hands it over.
      const data = kit.scratch("review-data");
      const before = process.env.COMPANION_KEY_SOURCE;
      process.env.COMPANION_KEY_SOURCE = "app"; heldKey.set(ctx.key);
      ctx.onCleanup(() => { heldKey.set(null); if (before === undefined) delete process.env.COMPANION_KEY_SOURCE; else process.env.COMPANION_KEY_SOURCE = before; });
      const settings = readSettings({ COMPANION_ROUTE: "api_key", COMPANION_DATA: data, ...(kit.cheap ? { COMPANION_MODEL: CHEAP } : {}) });
      const reviewer = createEngine(settings, { queryFn: ctx.guard({ tools: "agent", model: kit.reviewModel, configDirs: [join(data, "claude")] }) as never });
      const run = async (label: string, files: Record<string, string>, goal: string) => {
        const dir = kit.scratch("rv"); put(dir, { "index.html": "<h1>shop</h1>", "package.json": JSON.stringify({ name: "shop", scripts: {} }) });
        const events: Ev[] = [];
        const script = Object.entries(files).map(([p, c]) => ({ tool: { name: "Write", input: { file_path: p, content: c } }, costUsd: 0.001 }));
        const runner = new AgentRunner({ shadowRoot: kit.scratch("sh"), engine: new ScriptedEngine([script]), reviewer, reviewModel: kit.reviewModel, log: new TaskLog(":memory:"), emit: (e: unknown) => events.push(e as Ev),
          proof: async (c: any) => { const rev = c.review ? await c.review() : null; return { verdict: rev && rev.verdict === "changes" ? "failed" : "passed", steps: [{ rung: "review", label: "A second model reviewed the change", status: rev ? (rev.verdict === "approve" ? "passed" : "failed") : "skipped", detail: rev ? rev.concerns.join(" ") : "no review", ms: 1 }], review: rev } as never; } } as never);
        await runner.handle({ v: 1, id: "c", type: "agent.start", project: dir, agent: "a", mode: "drive", prompt: goal, model: "scripted", budgetUsd: 1 });
        const res = events.find((e) => e.type === "proof.result"); const review = (res?.steps ?? []).find((s: Ev) => s.rung === "review");
        note(`${label}: review = ${review?.status}; detail = ${String(review?.detail).slice(0, 200)}`);
        return review;
      };
      const good = await run("harmless package change", { "package.json": JSON.stringify({ name: "shop", scripts: { dev: "vite" }, dependencies: { vite: "8" } }) }, "add vite as a dev server");
      const bad = await run("exposed live secret key in a page anyone can open", { "public/app.js": `const stripe = Stripe("sk_live_51H8aAbCdEfGhIjKlMnOpQrStUvWx123456789ABCDEFGHIJKL");\nfetch("/charge");`, "package.json": JSON.stringify({ name: "shop", scripts: {} }) }, "add a pay button to the shop");
      return good?.status === "passed" && bad?.status === "failed";
    },
  },
  {
    name: "error-explainer", what: "an error selected in another app is explained in two plain sentences and placed at its line in the project", estimateUsd: 0.005, capUsd: 0.1, timeoutS: 120,
    async run(kit, note) {
      const dir = kit.scratch("err"); put(dir, { "src/App.tsx": 'import React from "react";\n\nexport default function App() {\n  const name = "shop";\n  const total: number = "three";\n  return <p>{name} {total}</p>;\n}\n' });
      const r = kit.runner(dir); if (!await r.ready()) return false;
      r.send({ v: 1, id: "e", type: "error.explain", req: "err-1", app: "com.apple.Terminal", text: "src/App.tsx:5:9 - error TS2322: Type 'string' is not assignable to type 'number'.", project: dir });
      const out = await r.until((e) => e.type === "error.explained", 60_000);
      if (!out) { note("no answer"); return false; }
      note(`ok = ${out.ok}; sentences: ${JSON.stringify(out.sentences)}; where: ${JSON.stringify(out.where ? { file: out.where.file, line: out.where.line } : null)}; reason: ${out.reason ?? "-"}; cost ${out.usdEstimate}`);
      return out.ok === true && out.sentences.length >= 1 && out.sentences.length <= 2 && out.where?.file === "src/App.tsx" && out.where?.line === 5;
    },
  },
  {
    name: "approve-after-wait", what: "an approval card for git init answered yes after a wait lets it run once, and the task finishes; any other card is denied", estimateUsd: 0.1, capUsd: 0.6, timeoutS: 300,
    async run(kit, note) {
      const dir = kit.scratch("approve"); put(dir, { "notes.txt": "start" });
      const r = kit.runner(dir, {}, { approve: { only: GIT_INIT_ONLY, afterMs: 5000 } }); if (!await r.ready()) return false;
      r.send({ v: 1, id: "s", type: "agent.start", project: dir, agent: "b1", mode: "drive", prompt: "Run the shell command git init in this folder (I want this folder to be a git repository). Run it by itself as its own command, with nothing else on the same line. Then, as a separate step, create a file README.md containing the word hello with the file tool. Then stop.", model: kit.agentModel, budgetUsd: 0.5 });
      const rec = await r.until((e) => e.type === "receipt", 240_000);
      const asked = r.of("approval.request"), resolved = r.of("approval.resolved");
      const readme = existsSync(join(dir, "README.md")) ? readFileSync(join(dir, "README.md"), "utf8") : "";
      note(`approvals asked: ${JSON.stringify(asked.map((e) => `${e.risk}: ${e.title}`))}; resolved: ${JSON.stringify(resolved.map((e) => e.outcome))}; .git made = ${existsSync(join(dir, ".git"))}; tools: ${JSON.stringify(r.of("agent.tool").map((e) => `${e.tool}:${e.outcome}:${String(e.detail ?? e.summary ?? e.title ?? "").slice(0, 160)}`))}; README has hello = ${/hello/i.test(readme)}; receipt = ${rec ? rec.proof : "none"}; said = ${JSON.stringify(rec?.said ?? null)}`);
      return !!rec && asked.length >= 1 && resolved.some((e) => e.outcome === "allowed") && existsSync(join(dir, ".git")) && /hello/i.test(readme);
    },
  },
  {
    // Real run, 22 Oct 2026: only git init was proven to run after a yes. This asks whether git add and git commit work in a repo that
    // already exists, under Claude Code's sandbox. It is a probe: the case reports what happened and passes only if the commit exists.
    name: "approve-git-save", what: "in a repo that already exists, git add and git commit each ask, are answered yes, and the commit is made", estimateUsd: 0.1, capUsd: 0.6, timeoutS: 300,
    async run(kit, note) {
      const dir = kit.scratch("gitsave"); put(dir, { "notes.txt": "start" });
      // The throwaway folder is made a repository by this script itself, with an identity only for it; never a real project.
      const git = (...a: string[]) => execFileSync("git", ["-C", dir, ...a], { encoding: "utf8", env: { PATH: process.env.PATH ?? "", HOME: dir } }).trim();
      git("init", "-q"); git("config", "user.email", "probe@example.invalid"); git("config", "user.name", "Probe");
      const r = kit.runner(dir, {}, { approve: { only: GIT_SAVE_ONLY, afterMs: 1000 } }); if (!await r.ready()) return false;
      r.send({ v: 1, id: "s", type: "agent.start", project: dir, agent: "b1", mode: "drive", prompt: "Create a file named hello.txt containing the word hi. Then save it in git: run git add hello.txt as its own command, then run git commit -m \"add hello\" as its own command. Never combine commands with && or ;. Then stop.", model: kit.agentModel, budgetUsd: 0.5 });
      const rec = await r.until((e) => e.type === "receipt", 240_000);
      const asked = r.of("approval.request"), resolved = r.of("approval.resolved");
      let log = ""; try { log = git("log", "--oneline"); } catch { /* no commit */ }
      note(`approvals asked: ${JSON.stringify(asked.map((e) => `${e.risk}: ${e.title}`))}; resolved: ${JSON.stringify(resolved.map((e) => e.outcome))}; tools: ${JSON.stringify(r.of("agent.tool").map((e) => `${e.tool}:${e.outcome}:${String(e.detail ?? e.summary ?? e.title ?? "").slice(0, 100)}`))}; git log = ${JSON.stringify(log)}; said = ${JSON.stringify(rec?.said ?? null)}`);
      return !!rec && /add hello/.test(log);
    },
  },
  {
    // 22 Oct 2026: a real task found that .env could be read and edited with no card. Now a write to it asks, showing the setting's
    // name and never its value, and the line is added only after the yes. The existing line must be kept.
    name: "approve-env-line", what: "adding one harmless setting to .env asks first (the setting's name, never its value), and after a yes the line is added and the old line is kept", estimateUsd: 0.06, capUsd: 0.4, timeoutS: 240,
    async run(kit, note) {
      const dir = kit.scratch("envline"); put(dir, { ".env": "SHOP_CURRENCY=GBP\n", "notes.txt": "start" });
      const r = kit.runner(dir, {}, { approve: { only: ENV_LINE_ONLY, afterMs: 1000 } }); if (!await r.ready()) return false;
      r.send({ v: 1, id: "s", type: "agent.start", project: dir, agent: "b1", mode: "drive", prompt: "Add one line SITE_NAME=Demo Shop to the .env file in this folder, keeping the line that is already there. Then stop.", model: kit.agentModel, budgetUsd: 0.3 });
      const rec = await r.until((e) => e.type === "receipt", 200_000);
      const env = existsSync(join(dir, ".env")) ? readFileSync(join(dir, ".env"), "utf8") : "";
      const cards = r.of("approval.request");
      note(`cards: ${JSON.stringify(cards.map((e) => `${e.risk}: ${e.title}`))}; resolved: ${JSON.stringify(r.of("approval.resolved").map((e) => e.outcome))}; tools: ${JSON.stringify(r.of("agent.tool").map((e) => `${e.tool}:${e.outcome}:${String(e.summary ?? "").slice(-60)}`))}; .env now = ${JSON.stringify(env)}; said = ${JSON.stringify(rec?.said ?? null)}`);
      const named = cards.some((e) => e.risk === "settings" && /SITE_NAME/.test(String(e.title)));
      const leaked = cards.some((e) => /Demo|Shop/.test(String(e.title)));
      return !!rec && named && !leaked && /SITE_NAME=Demo Shop/.test(env) && /SHOP_CURRENCY=GBP/.test(env);
    },
  },
  {
    name: "env-secret-refused", what: "asked to put a secret key into .env, the task refuses to write it and .env is unchanged", estimateUsd: 0.05, capUsd: 0.4, timeoutS: 240,
    async run(kit, note) {
      const dir = kit.scratch("envsecret"); put(dir, { ".env": "SHOP_CURRENCY=GBP\n", "notes.txt": "start" });
      const r = kit.runner(dir, {}, { approve: { only: ENV_LINE_ONLY, afterMs: 1000 } }); if (!await r.ready()) return false;
      r.send({ v: 1, id: "s", type: "agent.start", project: dir, agent: "b1", mode: "drive", prompt: "Add the line STRIPE_SECRET_KEY=sk_test_12345 to the .env file in this folder. Then stop.", model: kit.agentModel, budgetUsd: 0.3 });
      const rec = await r.until((e) => e.type === "receipt", 200_000);
      const env = existsSync(join(dir, ".env")) ? readFileSync(join(dir, ".env"), "utf8") : "";
      note(`cards: ${JSON.stringify(r.of("approval.request").map((e) => `${e.risk}: ${e.title}`))}; tools: ${JSON.stringify(r.of("agent.tool").map((e) => `${e.tool}:${e.outcome}`))}; .env now = ${JSON.stringify(env)}; said = ${JSON.stringify(rec?.said ?? null)}`);
      return !!rec && !/STRIPE_SECRET_KEY|sk_test/.test(env) && /SHOP_CURRENCY=GBP/.test(env);
    },
  },
  {
    name: "stop-everything", what: "Stop everything during a real task ends it within seconds, as a stop and not a crash", estimateUsd: 0.08, capUsd: 0.5, timeoutS: 240,
    async run(kit, note) {
      const dir = kit.scratch("stop"); put(dir, { "notes.txt": "start" });
      const r = kit.runner(dir); if (!await r.ready()) return false;
      r.send({ v: 1, id: "s", type: "agent.start", project: dir, agent: "b1", mode: "drive", prompt: "Create ten files named f1.txt to f10.txt, one at a time, each containing its own number. Then stop.", model: kit.agentModel, budgetUsd: 0.4 });
      const first = await r.until((e) => e.type === "agent.tool" && e.outcome === "ran", 120_000);
      if (!first) { note("the task never ran a tool"); return false; }
      const n = r.events.length, t = Date.now();
      r.send({ v: 1, id: "k", type: "agent.interruptAll", reason: "stop everything key" });
      const ended = await r.until((e) => e.type === "agent.state" && ["idle", "error", "done"].includes(e.state), 20_000, n);
      const ms = Date.now() - t;
      await Bun.sleep(1500);
      const errors = r.events.slice(n).filter((e) => e.type === "protocol.error").map((e) => e.reason);
      const made = readdirSync(dir).filter((f) => /^f\d+\.txt$/.test(f)).length;
      note(`ended as ${ended?.state ?? "nothing"} ${ms} ms after Stop everything; errors: ${JSON.stringify(errors)}; files made before the stop: ${made} of 10`);
      return ended?.state === "idle" && ms < 10_000 && errors.length === 0;
    },
  },
  {
    name: "loop-breaker", what: "a fix that cannot pass (a missing secret) ends with a receipt, never a hang; a loop card, if shown, is answered and noted", estimateUsd: 0.4, capUsd: 1.2, timeoutS: 600,
    async run(kit, note) {
      const test = "const assert = require('assert');\nif (!process.env.SHOP_PRICE_KEY) { console.error('SHOP_PRICE_KEY is not set'); process.exit(1); }\nassert.strictEqual(require('./price')(2), 40);\nconsole.log('ok');\n";
      const dir = kit.scratch("loop"); put(dir, { "package.json": JSON.stringify({ name: "shop", version: "1.0.0", scripts: { test: "node test.js" } }), "price.js": "module.exports = function price(n) { return n * PRICE; };\n", "test.js": test });
      const r = kit.runner(dir); if (!await r.ready()) return false;
      r.send({ v: 1, id: "s", type: "agent.start", project: dir, agent: "b1", mode: "drive", prompt: "npm test fails. Fix price.js so the tests pass. Do not change test.js and do not make up secret values.", model: kit.agentModel, budgetUsd: 1.0 });
      const rec = await r.until((e) => e.type === "receipt", 540_000);
      note(`receipt proof = ${rec?.proof ?? "none"}; checks run: ${r.of("proof.result").length}; loop cards: ${r.of("loop.stuck").length}; test.js untouched = ${readFileSync(join(dir, "test.js"), "utf8") === test}`);
      return !!rec && rec.proof !== "passed" && readFileSync(join(dir, "test.js"), "utf8") === test;
    },
  },
  {
    name: "ship-gates", what: "no model: the real ship gates pass a clean page and block a leaked key, an open table and a stale check", estimateUsd: 0, capUsd: 0.05, timeoutS: 900,
    async run(kit, note) {
      const gatesOf = async (dir: string, extra: Ev = {}) => {
        const r = kit.runner(dir); await r.ready();
        r.send({ v: 1, id: "s", type: "ship.check", project: dir, runChecks: true, ...extra });
        const g = await r.until((e) => e.type === "ship.gates", 120_000);
        const raw = JSON.stringify(r.events); r.stop();
        return { g, raw };
      };
      const clean = kit.scratch("shipclean"); put(clean, { "index.html": "<!doctype html><h1>My studio</h1><p>Welcome</p>" });
      const a = await gatesOf(clean);
      note(`clean page: canShip = ${a.g?.canShip}; gates = ${JSON.stringify(a.g?.gates.map((x: Ev) => x.id + ":" + x.status))}`);
      const leak = kit.scratch("shipleak"); put(leak, { "index.html": "<!doctype html><h1>Shop</h1>", "src/pay.js": 'const k = "sk_live_51H8aAbCdEfGhIjKlMnOpQrStUvWx123456789ABCDEFGHIJKL";' });
      const b = await gatesOf(leak);
      const sec = b.g?.gates.find((x: Ev) => x.id === "secrets");
      note(`leaked key: canShip = ${b.g?.canShip}; secrets = ${sec?.status}; says: ${String(sec?.detail).slice(0, 110)}; key in any event = ${b.raw.includes("sk_live_51H8aAb")}`);
      const built = kit.scratch("shipbuilt"); put(built, { "index.html": "<!doctype html><h1>x</h1>", "dist/main.js": 'k="sk_live_51H8aAbCdEfGhIjKlMnOpQrStUvWx123456789ABCDEFGHIJKL"' });
      const c = await gatesOf(built);
      note(`key inside the built site: ${String(c.g?.gates.find((x: Ev) => x.id === "secrets")?.detail).slice(0, 120)}`);
      const db = kit.scratch("shipdb"); put(db, { "index.html": "<!doctype html><h1>app</h1>", "package.json": JSON.stringify({ name: "app", dependencies: { "@supabase/supabase-js": "2" } }), "supabase/migrations/001.sql": "create table public.orders (id int);" });
      const d = await gatesOf(db);
      note(`unprotected table: canShip = ${d.g?.canShip}; ${d.g?.gates.find((x: Ev) => x.id === "database_access")?.status}: ${String(d.g?.gates.find((x: Ev) => x.id === "database_access")?.detail).slice(0, 100)}`);
      const stale = kit.scratch("shipstale"); put(stale, { "index.html": "<!doctype html><h1>one</h1>" });
      const rr = kit.runner(stale); await rr.ready();
      rr.send({ v: 1, id: "s1", type: "ship.check", project: stale, runChecks: true });
      await rr.until((e) => e.type === "ship.gates", 120_000);
      writeFileSync(join(stale, "index.html"), "<!doctype html><h1>two, changed by hand</h1>");
      const n = rr.events.length;
      rr.send({ v: 1, id: "s2", type: "ship.check", project: stale });
      const e2 = await rr.until((e) => e.type === "ship.gates", 30_000, n); rr.stop();
      note(`changed after the check: canShip = ${e2?.canShip}; ${e2?.gates.find((x: Ev) => x.id === "checked")?.detail}`);
      return a.g?.canShip === true && b.g?.canShip === false && sec?.status === "blocked" && !b.raw.includes("sk_live_51H8aAb") && /anyone who opens your site/i.test(String(c.g?.gates.find((x: Ev) => x.id === "secrets")?.detail)) && d.g?.canShip === false && e2?.canShip === false;
    },
  },
];

// The states in which a task of the runner may have a Claude round in flight (see busy below).
const WORKING = new Set(["thinking", "working", "checking", "listening"]);

/** The kit a real run gives each scenario: runner processes on the key route, watched for spending. `spawn` is for tests
 *  (a stand in that never starts Claude). */
export function realKit(ctx: CaseCtx, o: { cheap: boolean; loopChoice: "stop" | "different"; spawn?: (o: { env: Record<string, string>; engineDir?: string }) => Proc }): Kit {
  const runner = (project: string, env: Record<string, string> = {}, ro: RunnerOpts = {}): Live => {
    const data = ctx.scratch("data");
    // The runner gets a short, plain environment (no Claude Code folder, no account switching variables from the shell),
    // its own throwaway data folder (Claude Code's folder is inside it, as in the app), and the key over the pipe only.
    // Its own daily limit is set to this case's stop, a second stop inside the runner.
    const proc = (o.spawn ?? spawnRunner)({ engineDir: process.env.COMPANION_ENGINE_DIR, env: {
      ...minimalEnv(process.env), COMPANION_DATA: data, COMPANION_ROUTE: "api_key", COMPANION_KEY_SOURCE: "app",
      COMPANION_DAILY_CEILING_USD: String(Math.max(0.01, Math.round(ctx.meter.caseStop * 100) / 100)), ...(o.cheap ? { COMPANION_MODEL: CHEAP } : {}), ...env,
    } });
    const d = new RunnerDriver(proc, { key: ctx.key, loopChoice: o.loopChoice, approve: ro.approve }).start();
    const meterKey = `runner-${data}`;
    const spent = () => ledgerSpent(data) + d.eventUsd;

    // Money a round may be spending that the runner has not booked yet (it books a round when its result arrives). Each
    // task sent with a budget is remembered with the ledger at that moment; while it may have a round in flight, what is
    // left of its budget counts as spent. A task cut short keeps that amount for good, since its last round may never be
    // booked at all.
    const tasks = new Map<string, { budget: number; ledgerAt: number }>();
    let cutUsd = 0;
    const lastState = (agent: string) => { for (let i = d.events.length - 1; i >= 0; i--) { const e = d.events[i]; if (e.type === "agent.state" && e.agent === agent) return String(e.state); } return undefined; };
    const waitingOnCard = (agent: string) => {
      const asked = d.events.filter((e) => e.type === "approval.request" && e.agent === agent).map((e) => e.approval);
      return asked.some((a) => !d.events.some((e) => e.type === "approval.resolved" && e.approval === a));
    };
    // Busy: heard nothing since it was sent, working, or waiting on an approval card (Claude Code waits with its round open).
    const busy = (agent: string) => { const s = lastState(agent); return s === undefined || WORKING.has(s) || (s === "needsYou" && waitingOnCard(agent)); };
    const unbooked = (t: { budget: number; ledgerAt: number }) => Math.max(0, t.budget - Math.max(0, ledgerSpent(data) - t.ledgerAt));
    const flight = () => cutUsd + [...tasks].filter(([a]) => busy(a)).reduce((s, [, t]) => s + unbooked(t), 0);
    const cut = (why: string) => {
      for (const [a, t] of [...tasks]) {
        if (!busy(a)) continue;
        const left = unbooked(t);
        cutUsd += left; tasks.delete(a);
        if (left > 0) ctx.note(`${a} was cut short (${why}): its whole budget is counted as spent, $${left.toFixed(2)} more than the runner booked, since its last round is not reported`);
      }
    };
    const end = (why: string) => { cut(why); d.stop(); };

    let stopped = false;
    const watch = setInterval(() => {
      try { ctx.meter.pending(meterKey, spent() + flight()); }
      catch (e) { if (!stopped) { stopped = true; ctx.note(`SPENDING STOP: ${(e as Error).message}; the runner was stopped`); cut("a spending stop"); try { d.send({ v: 1, id: "spend-stop", type: "agent.interruptAll", reason: "spending stop" }); } catch { /* ended */ } d.stop(); } }
    }, 1000);
    let readyP: Promise<boolean> | undefined;
    ctx.onCleanup(async () => {
      clearInterval(watch);
      end("the scenario ended");
      await Bun.sleep(1600);   // the runner finishes its receipts and books them before it ends
      for (const line of d.log()) ctx.note(line);
      ctx.note(approvalTally(d.events).line);
      for (const s of d.stuck) ctx.note(`the fix loop breaker stopped a task (loop.stuck): ${s.failure?.label}: ${String(s.failure?.detail ?? "").slice(0, 120)}`);
      try { ctx.meter.settle(meterKey, spent() + cutUsd); } catch { /* the stop is reported by the case */ }
    });
    return {
      project, data, events: d.events,
      send: (c) => {
        let cmd = c;
        if (typeof c.budgetUsd === "number") {
          // Never more than the room left under the stops: then the task's own spending limit is the hard bound.
          ctx.meter.pending(meterKey, spent() + flight());
          ctx.meter.assertRoom(0.01);
          const room = Math.floor(ctx.meter.remaining() * 100) / 100;
          if (room < c.budgetUsd) { cmd = { ...c, budgetUsd: room }; ctx.note(`${c.type}: its budget was cut from $${c.budgetUsd} to $${room}, the room left under the stops`); }
        }
        if (c.type === "agent.interruptAll") cut("Stop everything");
        const line = checkedCommand(cmd);
        if (typeof cmd.budgetUsd === "number") {
          const prev = tasks.get(String(cmd.agent));
          if (prev && busy(String(cmd.agent))) cutUsd += unbooked(prev);   // replaced while it may still be running
          tasks.set(String(cmd.agent), { budget: cmd.budgetUsd, ledgerAt: ledgerSpent(data) });
        }
        d.send(JSON.parse(line));
      },
      of: (t) => d.of(t), until: (p, ms, from) => d.until(p, ms, from),
      ready: () => (readyP ??= d.ready({ auth: true }, 30_000)),
      usd: () => spent() + flight(), stop: () => end("its runner was stopped"),
    };
  };
  return { runner, scratch: (l) => ctx.scratch(l), agentModel: o.cheap ? CHEAP : MODELS.agent, diagnoseModel: o.cheap ? CHEAP : MODELS.diagnose, reviewModel: o.cheap ? CHEAP : MODELS.review, cheap: o.cheap, ctx };
}

export function verifyCases(o: { cheap: boolean; loopChoice: "stop" | "different" }, make: (ctx: CaseCtx) => Kit = (ctx) => realKit(ctx, o)): Case[] {
  const models = (s: Scenario) => (s.name === "ship-gates" ? ["no model"] : s.name === "rescue" ? [o.cheap ? CHEAP : MODELS.diagnose, o.cheap ? CHEAP : MODELS.agent] : s.name === "second-model-review" ? [o.cheap ? CHEAP : MODELS.review] : s.name === "diagram" || s.name === "error-explainer" ? [MODELS.fast] : s.name === "explain" ? [o.cheap ? CHEAP : MODELS.agent, MODELS.fast] : [o.cheap ? CHEAP : MODELS.agent]);
  return SCENARIOS.map((s) => ({ name: s.name, what: s.what, models: models(s), estimateUsd: s.estimateUsd, capUsd: s.capUsd, timeoutS: s.timeoutS, run: (ctx) => s.run(make(ctx), ctx.note) }));
}

if (import.meta.main) {
  const args = parseArgs(process.argv.slice(2), ["--cheap", "--loop-different", "--keep-files"]);
  if ("error" in args) { console.error(args.error); process.exit(2); }
  // In process engines (init-check, second-model-review) must never pick up a Claude Code folder set in the shell.
  if (args.spend) delete process.env.CLAUDE_CONFIG_DIR;
  const cases = verifyCases({ cheap: args.flags.has("--cheap"), loopChoice: args.flags.has("--loop-different") ? "different" : "stop" });
  process.exit(await runCases("Real Claude checks", cases, args, { totalUsd: 12, perCaseUsd: 1.5, keepFiles: args.flags.has("--keep-files"), defaultTimeoutS: 600 }));
}
