// "It works on my Mac but the deploy failed": when the project's own checks pass here and the folder is linked to Vercel,
// Point at the problem reads the last failed deploy's build log (through a stand in for the person's Vercel tool) and
// rings the failing line, and Rescue gets the same finding as evidence. No model is asked to find the place.
import { afterEach, describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { AgentRunner } from "../src/agent.ts";
import { ScriptedEngine, type Step } from "../src/engine.ts";
import { TaskLog } from "../src/tasklog.ts";
import type { LadderResult } from "../src/proof/ladder.ts";
import type { DeployLogReader, FailedBuild } from "../src/ship/deploy.ts";
import type { Event } from "../../protocol/index.ts";
import { PRODUCT } from "../src/names.ts";

const made: string[] = [];
afterEach(() => { while (made.length) rmSync(made.pop()!, { recursive: true, force: true }); });
const tmp = (l: string) => { const d = realpathSync(mkdtempSync(join(tmpdir(), `companion-dr-${l}-`))); made.push(d); return d; };
const of = (e: Event[], t: string) => e.filter((x) => x.type === t) as any[];
const LOG = readFileSync(join(import.meta.dir, "fixtures", "buildlogs", "next-type-error.txt"), "utf8");
const PAGE = 'type Product = { name: string; price: number };\n\nconst products: Product[] = [{ name: "Mug", price: 12 }];\n\nexport default function Home() {\n  const total: number = products.map((p) => p.price).join(", ");\n  return (\n    <main>\n      <h1>Shop</h1>\n      <p>{total}</p>\n    </main>\n  );\n}\n';
const FAILED: FailedBuild = { state: "failed", url: "https://shop-abc123-sam.vercel.app", log: LOG };
const passed: LadderResult = { verdict: "passed", steps: [{ rung: "checks", label: "Building and checking the code", status: "passed", detail: "build passed.", ms: 1 }] };
const localFail: LadderResult = { verdict: "failed", steps: [{ rung: "checks", label: "Building and checking the code", status: "failed", detail: "tsc failed", ms: 1, problem: { kind: "message", message: "local problem", from: "checks" } }] };
const diag: Step = { text: JSON.stringify({ summary: "A shop made with Next.js.", works: ["It builds on this Mac"], broken: "Vercel's build stops on a type error in app/page.tsx.", steps: ["Fix the type of total", "Deploy again"] }), costUsd: 0.01 };

function setup(answer: FailedBuild | ((signal?: AbortSignal) => Promise<FailedBuild>), ladder: LadderResult = passed) {
  const project = tmp("p");
  for (const [f, c] of Object.entries({ "app/page.tsx": PAGE, "package.json": JSON.stringify({ name: "shop", scripts: { build: "next build" } }) })) { mkdirSync(dirname(join(project, f)), { recursive: true }); writeFileSync(join(project, f), c); }
  const events: Event[] = [];
  const reads: (AbortSignal | undefined)[] = [];
  const deployLogs: DeployLogReader = { lastFailedBuild: async (p, signal) => { expect(p).toBe(project); reads.push(signal); return typeof answer === "function" ? answer(signal) : answer; } };
  const engine = new ScriptedEngine([[diag]]);
  const runner = new AgentRunner({ shadowRoot: tmp("s"), engine, log: new TaskLog(":memory:"), emit: (e) => events.push(e), proof: async () => ladder, deployLogs });
  const find = () => runner.handle({ v: 1, id: "f1", type: "problem.find", project, agent: "a1" });
  const diagnose = async () => { await Bun.sleep(50); return runner.handle({ v: 1, id: "r1", type: "rescue.diagnose", project, agent: "r1", model: "m", budgetUsd: 5 }); };
  return { project, events, engine, runner, find, diagnose, reads };
}

describe("Point at the problem, when it works here but the deploy failed", () => {
  test("the failing line from Vercel's build is the problem found, ringed like any other, with no model asked", async () => {
    const s = setup(FAILED);
    await s.find();
    const f = of(s.events, "problem.found");
    expect(f).toHaveLength(1);
    expect(f[0]).toMatchObject({ project: s.project, agent: "a1", verdict: "failed", label: "Your last Vercel deploy failed", problem: { kind: "line", file: "app/page.tsx", line: 6, column: 9, from: "deploy" } });
    expect(f[0].detail).toBe("Your last Vercel deploy failed at app/page.tsx, line 6: Type error: Type 'string' is not assignable to type 'number'.");
    expect(of(s.events, "agent.state").map((x) => x.state)).toEqual(["checking", "needsYou"]);
    expect(s.engine.calls).toHaveLength(0);
  });
  test("a problem here comes first: the deploy is not even read", async () => {
    const s = setup(FAILED, localFail);
    await s.find();
    expect(s.reads).toHaveLength(0);
    expect(of(s.events, "problem.found")[0].problem.message).toBe("local problem");
  });
  test("a folder that is not a Vercel project, or a deploy that did not fail, changes nothing", async () => {
    for (const answer of [{ state: "not_linked" }, { state: "none" }] as FailedBuild[]) {
      const s = setup(answer);
      await s.find();
      const f = of(s.events, "problem.found")[0];
      expect(f.verdict).toBe("passed"); expect(f.problem).toBeUndefined(); expect(f.note).toBeUndefined();
    }
  });
  test("when the Vercel tool is missing or signed out, the checks still count and one plain line says what to do", async () => {
    const reason = "I could not read why the Vercel deploy failed: you are not signed in to Vercel. Open Terminal, run: vercel login, then try again.";
    const s = setup({ state: "unavailable", reason });
    await s.find();
    expect(of(s.events, "problem.found")[0]).toMatchObject({ verdict: "passed", note: reason });
  });
  test("a Python package to install and a Vercel tool to sign in to are both said, the package first", async () => {
    const reason = "I could not read why the Vercel deploy failed: you are not signed in to Vercel. Open Terminal, run: vercel login, then try again.";
    const gap = `mypy is not installed in this project's virtual environment (.venv), so the type check could not run. ${PRODUCT} does not install Python packages. To install it, in Terminal in the project folder, run: .venv/bin/pip install mypy`;
    const s = setup({ state: "unavailable", reason }, { verdict: "passed_with_gaps", steps: passed.steps, gaps: [gap] });
    await s.find();
    expect(of(s.events, "problem.found")[0]).toMatchObject({ verdict: "passed_with_gaps", note: `${gap} ${reason}` });
  });
  test("the hint to get the browser check is kept when the deploy's problem is shown", async () => {
    const s = setup(FAILED, { verdict: "passed_with_gaps", steps: [{ rung: "browser", label: "Opening it in a browser", status: "skipped", detail: "not installed", ms: 1, needs: "browser" }] });
    await s.find();
    expect(of(s.events, "problem.found")[0]).toMatchObject({ verdict: "failed", needs: "browser" });
  });
  test("Stop everything during the read ends it, and the card does not stay on Checking", async () => {
    const s = setup((signal) => new Promise((res) => signal?.addEventListener("abort", () => res({ state: "cancelled" }), { once: true })));
    const done = s.find();
    for (let i = 0; i < 100 && s.reads.length === 0; i++) await Bun.sleep(20);   // the read has started
    await s.runner.handle({ v: 1, id: "x", type: "agent.interruptAll", reason: "stop" });
    await done;
    expect(s.reads[0]?.aborted).toBe(true);
    expect(of(s.events, "problem.found").map((x) => x.verdict)).toEqual(["cancelled"]);
  });
});

describe("Rescue gets the deploy's failure as evidence", () => {
  test("the failing line is in the evidence on the card and in what Claude is told", async () => {
    const s = setup(FAILED);
    await s.diagnose();
    const rep = of(s.events, "rescue.report")[0];
    // The card shows "label: status detail", so the detail does not say "Your last Vercel deploy failed" a second time.
    expect(rep.evidence).toContainEqual({ label: "Your last Vercel deploy", status: "failed", detail: "app/page.tsx, line 6: Type error: Type 'string' is not assignable to type 'number'." });
    expect(s.engine.calls[0].prompt).toContain("app/page.tsx, line 6");
  });
  test("when it could not be read, Rescue is told why in the same plain line", async () => {
    const s = setup({ state: "unavailable", reason: "I could not read why the Vercel deploy failed: the Vercel tool is not installed. Install it with: npm install -g vercel" });
    await s.diagnose();
    expect(of(s.events, "rescue.report")[0].evidence).toContainEqual({ label: "Your last Vercel deploy", status: "skipped", detail: "I could not read why the Vercel deploy failed: the Vercel tool is not installed. Install it with: npm install -g vercel" });
  });
  test("a project that is not on Vercel gets no deploy line at all", async () => {
    const s = setup({ state: "not_linked" });
    await s.diagnose();
    expect(of(s.events, "rescue.report")[0].evidence.some((e: any) => /Vercel/.test(e.label))).toBe(false);
  });
});
