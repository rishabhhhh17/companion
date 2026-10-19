// Every practice in the catalog (app/sample/practices.json), start to finish, with no model: a copy of the sample as the
// shell makes it (its files and the house rule that protects its check), Find (Point at the problem, or for the open table
// the check before going live), the fix through the normal task path (a stand in agent makes the small fix: snapshot,
// safety rules, house rules, proof ladder, receipt), Find again shows it fixed, Undo brings the failure back, and an edit to
// a protected file is refused in code. The events Find records here are the shared fixtures the pages are fed
// (protocol/fixtures/practice-found.jsonl), so the engine and the pages agree on them. Temporary folders only, never git,
// never the network (the samples need no packages; the page check, when a browser is installed, opens 127.0.0.1 only).
import { afterEach, describe, expect, test } from "bun:test";
import { cpSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { AgentRunner } from "../src/agent.ts";
import { ScriptedEngine, type Step } from "../src/engine.ts";
import { TaskLog } from "../src/tasklog.ts";
import { FIX_ASK, fixFoundPrompt, PRACTICE_BUDGET_USD } from "../src/fixfound.ts";
import { parseEvent, type Event } from "../../protocol/index.ts";

type Entry = { id: string; folder: string; find: "checks" | "gate"; expect: { file: string; line: number; about?: string; gate?: string; findings?: string[] }; fix: "task" | "lesson"; prove: string; protect: string[] };
const ROOT = join(import.meta.dir, "../..");
const CATALOG = JSON.parse(readFileSync(join(ROOT, "app/sample/practices.json"), "utf8")) as { practices: Entry[] };
const FIXTURES = new Map(readFileSync(join(ROOT, "protocol/fixtures/practice-found.jsonl"), "utf8").split("\n").filter(Boolean).map((l) => { const x = JSON.parse(l); return [x.practice as string, x.event as Record<string, any>]; }));

const made: string[] = [];
afterEach(() => { while (made.length) rmSync(made.pop()!, { recursive: true, force: true }); });
const tmp = (l: string) => { const d = realpathSync(mkdtempSync(join(tmpdir(), `companion-pe2e-${l}-`))); made.push(d); return d; };
const of = (e: Event[], t: string) => e.filter((x) => x.type === t) as any[];

// The copy as practice.rs makes it: the sample's files, then one "never edit" house rule for each protected file.
function copyOf(e: Entry): string {
  const p = tmp(e.id);
  cpSync(join(ROOT, "app/sample", e.folder), p, { recursive: true });
  mkdirSync(join(p, ".companion"), { recursive: true });
  writeFileSync(join(p, ".companion/rules.txt"), `# Companion added these rules to its practice copy, so the fix cannot pass by changing the check.\n${e.protect.map((f) => `never edit ${f}`).join("\n")}\n`);
  return p;
}

// The small fix a person (or Claude) would make, as the stand in agent's tool calls through Companion's own tools.
const FIX: Record<string, Step[]> = {
  signup: [{ tool: { name: "Edit", input: { file_path: "public/signup.js", old_string: 'fetch("/api/signup"', new_string: 'fetch("/api/register"' } }, costUsd: 0.01 }],
  route: [{ tool: { name: "Edit", input: { file_path: "index.html", old_string: 'href="/prices"', new_string: 'href="/pricing"' } }, costUsd: 0.01 }],
  import: [{ tool: { name: "Edit", input: { file_path: "server.js", old_string: 'require("./lib/format-price")', new_string: 'require("./lib/money")' } }, costUsd: 0.01 }],
  "open-table": [{ tool: { name: "Write", input: { file_path: "supabase/migrations/20261003090000_protect_notes.sql", content: "alter table public.notes enable row level security;\ncreate policy \"Each person reads their own notes\" on public.notes for select to authenticated using ((select auth.uid()) = user_id);\n" } }, costUsd: 0.01 }],
};
// The same request, aimed at the protected file instead: the house rule must refuse it.
const CHEAT: Record<string, Step[]> = Object.fromEntries(CATALOG.practices.map((e) => [e.id, [{ tool: { name: "Edit", input: { file_path: e.protect[0], old_string: readFileSync(join(ROOT, "app/sample", e.folder, e.protect[0]), "utf8").split("\n").find((l) => l.trim())!, new_string: "// changed" } }, costUsd: 0.01 }]]));

function runnerFor(project: string, rounds: Step[][]) {
  const events: Event[] = [];
  const engine = new ScriptedEngine(rounds);
  const runner = new AgentRunner({ shadowRoot: tmp("shadow"), engine, log: new TaskLog(":memory:"), emit: (e) => events.push(e) });
  // Find: the key (problem.find), or for the open table the check before going live (ship.check, the files only).
  const find = async (e: Entry) => {
    const n = events.length;
    await runner.handle(e.find === "gate" ? { v: 1, id: `f${n}`, type: "ship.check", project } : { v: 1, id: `f${n}`, type: "problem.find", project, agent: "builder-1" });
    return events.slice(n).find((x) => x.type === (e.find === "gate" ? "ship.gates" : "problem.found")) as any;
  };
  return { events, engine, runner, find };
}
const gateOf = (ev: any, e: Entry) => ev.gates.find((g: any) => g.id === e.expect.gate);
const foundFor = (e: Entry, ev: any) => (e.find === "gate"
  ? { label: gateOf(ev, e).label, detail: gateOf(ev, e).detail, problem: { kind: "line", file: gateOf(ev, e).places[0].file, line: gateOf(ev, e).places[0].line, lineText: gateOf(ev, e).places[0].lineText, message: gateOf(ev, e).detail, from: "ship" } as const }
  : { label: ev.label, detail: ev.detail, problem: ev.problem });

describe("every practice in the catalog, start to finish, with no model", () => {
  test("the catalog and the shared fixtures name the same five practices", () => {
    expect(CATALOG.practices.map((e) => e.id)).toEqual(["signup", "setting", "route", "import", "open-table"]);
    expect([...FIXTURES.keys()]).toEqual(CATALOG.practices.map((e) => e.id));
    for (const ev of FIXTURES.values()) expect(parseEvent(JSON.stringify(ev)).ok).toBe(true);
    for (const e of CATALOG.practices) if (e.fix === "task") expect(FIX[e.id], e.id).toBeDefined();
  });

  for (const e of CATALOG.practices) {
    test(`${e.id}: Find shows the failure the catalog expects, as the shared fixture records it`, async () => {
      const s = runnerFor(copyOf(e), []);
      const ev = await s.find(e);
      const fx = FIXTURES.get(e.id)!;
      if (e.find === "gate") {
        const g = gateOf(ev, e);
        expect(g).toMatchObject({ status: "blocked", findings: e.expect.findings, places: [{ file: e.expect.file, line: e.expect.line }] });
        expect(g).toEqual(gateOf(fx, e));
      } else {
        expect(ev).toMatchObject({ verdict: "failed", label: fx.label, problem: { kind: "line", file: e.expect.file, line: e.expect.line } });
        const { column: _c, ...want } = fx.problem;
        expect(ev.problem).toMatchObject(want);
        expect(ev.problem.message.toLowerCase()).toContain(e.expect.about!.toLowerCase());
      }
      expect(s.engine.calls).toHaveLength(0);   // Find never asks Claude
    }, 120_000);

    if (e.fix === "lesson") {
      test(`${e.id}: the person's own step (the value in .env.local) makes Find pass, with no task and no model`, async () => {
        const p = copyOf(e);
        const s = runnerFor(p, []);
        writeFileSync(join(p, ".env.local"), "SHOP_NAME=Sam's Plants\n");
        expect((await s.find(e)).verdict).not.toBe("failed");
        expect(s.engine.calls).toHaveLength(0);
      }, 120_000);
      continue;
    }

    test(`${e.id}: the small fix runs as a normal checked task named for its practice; Find then shows it fixed, and Undo brings the failure back`, async () => {
      const p = copyOf(e);
      const s = runnerFor(p, [FIX[e.id]]);
      const found = foundFor(e, await s.find(e));
      const prompt = fixFoundPrompt(found);
      expect(prompt.endsWith(FIX_ASK)).toBe(true);
      expect(prompt).toContain(`${e.expect.file}, line ${e.expect.line}`);
      await s.runner.handle({ v: 1, id: "fix", type: "agent.start", project: p, agent: "builder-1", mode: "drive", prompt, model: "m", budgetUsd: PRACTICE_BUDGET_USD, practice: e.id });
      const cp = of(s.events, "checkpoint.created")[0], rc = of(s.events, "receipt")[0];
      expect(cp.practice).toBe(e.id); expect(rc.practice).toBe(e.id); expect(rc.checkpoint).toBe(cp.checkpoint);
      expect(["passed", "partial"]).toContain(rc.proof);   // partial: the page check was skipped because no browser is installed
      expect(rc.changed.map((c: any) => c.file).some((f: string) => e.protect.includes(f))).toBe(false);
      for (const ev of [cp, rc]) expect(parseEvent(JSON.stringify(ev)).ok).toBe(true);
      // Find again: fixed.
      const after = await s.find(e);
      if (e.find === "gate") expect(gateOf(after, e).status).not.toBe("blocked");
      else expect(after.verdict).not.toBe("failed");
      // Undo the practice's own fix: the failure is back, in the same place.
      await s.runner.handle({ v: 1, id: "undo", type: "checkpoint.restore", project: p, checkpoint: rc.checkpoint });
      expect(of(s.events, "checkpoint.restored")).toHaveLength(1);
      const back = await s.find(e);
      if (e.find === "gate") expect(gateOf(back, e)).toMatchObject({ status: "blocked", findings: e.expect.findings });
      else expect(back).toMatchObject({ verdict: "failed", problem: { file: e.expect.file, line: e.expect.line } });
    }, 240_000);

    test(`${e.id}: an edit to the protected file is refused by the house rule, and the file stays exactly as it was`, async () => {
      const p = copyOf(e);
      const before = readFileSync(join(p, e.protect[0]));
      const s = runnerFor(p, [CHEAT[e.id]]);
      await s.runner.handle({ v: 1, id: "cheat", type: "agent.start", project: p, agent: "builder-1", mode: "drive", prompt: "Make the checks pass.", model: "m", budgetUsd: PRACTICE_BUDGET_USD, practice: e.id });
      expect(of(s.events, "agent.tool").some((t) => t.outcome === "blocked" || t.outcome === "denied")).toBe(true);
      expect(readFileSync(join(p, e.protect[0]))).toEqual(before);
      expect(of(s.events, "receipt")[0]).toMatchObject({ changed: [], practice: e.id });
    }, 120_000);
  }
});

describe("the open table's fix is proven by its check, not by the task's own checks", () => {
  // Review fix (20 Oct 2026): row level security turned on with a rule that says "true" still leaves the table open. The
  // task's checks pass, so only the database check can tell; its answer (the table still in its findings) is what the page
  // must never take for fixed (app/src/practice.ts gateFinding, tested with the same check in app/src/practice.test.ts).
  test("a fix that adds a rule that says true passes the task's checks, and the check still finds the table open", async () => {
    const e = CATALOG.practices.find((x) => x.id === "open-table")!;
    const p = copyOf(e);
    const wide: Step[] = [{ tool: { name: "Write", input: { file_path: "supabase/migrations/20261003090000_protect_notes.sql", content: "alter table public.notes enable row level security;\ncreate policy \"Anyone reads notes\" on public.notes for select using (true);\n" } }, costUsd: 0.01 }];
    const s = runnerFor(p, [wide]);
    const prompt = fixFoundPrompt(foundFor(e, await s.find(e)));
    await s.runner.handle({ v: 1, id: "fix", type: "agent.start", project: p, agent: "builder-1", mode: "drive", prompt, model: "m", budgetUsd: PRACTICE_BUDGET_USD, practice: e.id });
    expect(["passed", "partial"]).toContain(of(s.events, "receipt")[0].proof);
    const g = gateOf(await s.find(e), e);
    expect(g.status).not.toBe("passed");
    expect(g.findings).toContain("notes");
  }, 240_000);
});

describe("a follow up or Try again on a practice's fix is still that practice's", () => {
  test("the practice id carries on to the next task, and a task started without one has none", async () => {
    const e = CATALOG.practices.find((x) => x.id === "signup")!;
    const p = copyOf(e);
    const fail: Step[] = [{ tool: { name: "Write", input: { file_path: "notes.txt", content: "x" } }, costUsd: 0.01 }];
    const s = runnerFor(p, [fail, [], [], FIX.signup, []]);
    await s.runner.handle({ v: 1, id: "a", type: "agent.start", project: p, agent: "builder-1", mode: "drive", prompt: "fix it", model: "m", budgetUsd: PRACTICE_BUDGET_USD, practice: "signup" });
    await s.runner.handle({ v: 1, id: "b", type: "agent.send", project: p, agent: "builder-1", retry: true });
    const receipts = of(s.events, "receipt");
    expect(receipts.length).toBeGreaterThanOrEqual(2);
    expect(receipts.every((r) => r.practice === "signup")).toBe(true);
    const n = s.events.length;
    await s.runner.handle({ v: 1, id: "c", type: "agent.start", project: p, agent: "builder-1", mode: "drive", prompt: "add a footer", model: "m", budgetUsd: 1 });
    for (const ev of s.events.slice(n).filter((x) => x.type === "receipt" || x.type === "checkpoint.created")) expect((ev as any).practice).toBeUndefined();
  }, 240_000);

  // Merge of main (PR 120): a task that ends on a question ends as needs you and is answered in the follow up box. A
  // practice's fix that asks says so on its receipt with its practice id, and the answer is that practice's fix, checked.
  test("a fix that stops to ask ends as needs you with the practice id, and the answer is the practice's fix, checked", async () => {
    const e = CATALOG.practices.find((x) => x.id === "signup")!;
    const p = copyOf(e);
    const Q = "The form could post to /api/register or /api/signup. Which one does your server use?";
    const s = runnerFor(p, [[{ text: Q, costUsd: 0.01 }], [...FIX.signup, { text: "Done: the form posts to /api/register now.", costUsd: 0.01 }]]);
    const prompt = fixFoundPrompt(foundFor(e, await s.find(e)));
    await s.runner.handle({ v: 1, id: "fix", type: "agent.start", project: p, agent: "builder-1", mode: "drive", prompt, model: "m", budgetUsd: PRACTICE_BUDGET_USD, practice: e.id });
    const first = of(s.events, "receipt")[0];
    expect(first).toMatchObject({ practice: e.id, changed: [], asks: true, said: Q });
    expect(of(s.events, "agent.state").at(-1)).toMatchObject({ agent: "builder-1", state: "needsYou" });
    const n = s.events.length;
    await s.runner.handle({ v: 1, id: "ans", type: "agent.send", project: p, agent: "builder-1", text: "Use /api/register" });
    const later = s.events.slice(n);
    const cp = later.find((x) => x.type === "checkpoint.created") as any, rc = later.find((x) => x.type === "receipt") as any;
    expect(cp.practice).toBe(e.id); expect(rc.practice).toBe(e.id); expect(rc.checkpoint).toBe(cp.checkpoint);
    expect(cp.label).toContain("Answer to:");
    expect(["passed", "partial"]).toContain(rc.proof);
    expect(rc.asks).toBeUndefined();
    for (const ev of [first, cp, rc]) expect(parseEvent(JSON.stringify(ev)).ok).toBe(true);
    expect((await s.find(e)).verdict).not.toBe("failed");
  }, 240_000);
});
