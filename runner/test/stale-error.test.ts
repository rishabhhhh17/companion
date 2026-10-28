// Finding A (first Mac session): a fix started from an error must first check that the error still applies, and say so
// and change nothing when it does not. The rule is words to the model; what is tested here is that it reaches the model on
// every path that carries a pasted error (a single task, a plan, a fresh off the record step) and on none that does not.
import { afterEach, describe, expect, test } from "bun:test";
import { mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { AgentRunner } from "../src/agent.ts";
import { ScriptedEngine, type Step } from "../src/engine.ts";
import { TaskLog } from "../src/tasklog.ts";
import { freshStepPrompt, planPrompt } from "../src/drive.ts";
import { fixFoundPrompt } from "../src/fixfound.ts";
import { carriesPastedError, STALE_ERROR_RULE, withStaleCheck } from "../src/staleerror.ts";
import { COMPANION_APPEND } from "../src/sdkEngine.ts";
import type { Event } from "../../protocol/index.ts";

const made: string[] = [];
afterEach(() => { while (made.length) rmSync(made.pop()!, { recursive: true, force: true }); });
const tmp = (l: string) => { const d = realpathSync(mkdtempSync(join(tmpdir(), `companion-se-${l}-`))); made.push(d); return d; };
const say = (text: string, costUsd = 0.01): Step => ({ text, costUsd });

// What the page sends for Fix it on an explained error (app/src/commands.ts fixError).
const FIX_ERROR = "Fix this error. Find the cause and make the smallest change that fixes it, then check that it works. Do not weaken or delete tests.\n\nThe error, as I saw it:\nUncaught ReferenceError: showGallery is not defined\n    at HTMLButtonElement.onclick (index.html:12:30)\n\nIt points at index.html, line 12.";

describe("which requests carry a pasted error", () => {
  test("the Fix it request, and error text a person pasted into a plain request", () => {
    expect(carriesPastedError(FIX_ERROR)).toBe(true);
    expect(carriesPastedError("fix this: TypeError: undefined is not a function")).toBe(true);
    expect(carriesPastedError("Please fix\nTraceback (most recent call last):\n  File \"app.py\", line 3\nNameError: name 'x' is not defined")).toBe(true);
    expect(carriesPastedError("src/App.tsx(5,9): error TS2322: Type 'string' is not assignable to type 'number'.")).toBe(true);
  });
  test("ordinary requests do not", () => {
    for (const p of ["Add a pricing section to the home page", "Make the heading blue", "Why is my site slow?", "Add error handling to the form"]) expect(carriesPastedError(p), p).toBe(false);
  });
  test("a check Squibby just ran itself is fresh, so it does not", () => {
    expect(carriesPastedError(fixFoundPrompt({ label: "Running the tests", detail: "TypeError: x is not a function" }))).toBe(false);
  });
});

describe("the rule", () => {
  test("says: check first, say it is already fixed in plain words, change nothing, invent no cause", () => {
    expect(STALE_ERROR_RULE).toMatch(/still applies/i);
    expect(STALE_ERROR_RULE).toMatch(/read the file and line/i);
    expect(STALE_ERROR_RULE).toMatch(/already fixed/i);
    expect(STALE_ERROR_RULE).toMatch(/change nothing/i);
    expect(STALE_ERROR_RULE).toMatch(/never (?:make up|invent)/i);
    expect(STALE_ERROR_RULE).not.toMatch(/—|hook|sandbox/i);
  });
  test("is added to a request that carries an error, once, and to no other", () => {
    expect(withStaleCheck(FIX_ERROR)).toContain(STALE_ERROR_RULE);
    expect(withStaleCheck(FIX_ERROR).startsWith(FIX_ERROR)).toBe(true);
    expect(withStaleCheck(withStaleCheck(FIX_ERROR)).split(STALE_ERROR_RULE).length).toBe(2);
    expect(withStaleCheck("Make the heading blue")).toBe("Make the heading blue");
  });
  test("is in the instructions every task gets, in general words", () => {
    expect(COMPANION_APPEND).toMatch(/error|failed check/i);
    expect(COMPANION_APPEND).toMatch(/already fixed/i);
  });
});

function setup(rounds: Step[][]) {
  const project = tmp("p");
  writeFileSync(join(project, "index.html"), "<button onclick=\"showGallery()\">Gallery</button>\n<script>function showGallery() {}</script>\n");
  const events: Event[] = [];
  const engine = new ScriptedEngine(rounds);
  const runner = new AgentRunner({ shadowRoot: tmp("s"), engine, log: new TaskLog(":memory:"), emit: (e) => events.push(e), proof: async () => ({ verdict: "passed", steps: [] }) });
  return { project, events, engine, runner };
}

describe("on the paths a person meets", () => {
  test("a Fix it task is told to check first, and an error already fixed changes nothing", async () => {
    const r = setup([[say("This error looks already fixed: showGallery is defined now. I changed nothing.")]]);
    await r.runner.handle({ v: 1, id: "1", type: "agent.start", project: r.project, agent: "a1", mode: "drive", prompt: FIX_ERROR, model: "m", budgetUsd: 1, offTheRecord: true });
    expect(r.engine.calls[0].prompt).toContain(STALE_ERROR_RULE);
    expect(r.engine.calls[0].prompt.startsWith(FIX_ERROR)).toBe(true);
    expect(readFileSync(join(r.project, "index.html"), "utf8")).toContain("function showGallery");
    const receipt = r.events.find((e) => e.type === "receipt") as any;
    expect(receipt.changed ?? receipt.files ?? []).toHaveLength(0);
    expect(receipt.said).toMatch(/already fixed/i);
  });
  test("an ordinary task is not told anything extra", async () => {
    const r = setup([[say("Done.")]]);
    await r.runner.handle({ v: 1, id: "1", type: "agent.start", project: r.project, agent: "a1", mode: "drive", prompt: "Make the heading blue", model: "m", budgetUsd: 1 });
    expect(r.engine.calls[0].prompt).toBe("Make the heading blue");
  });
  test("a plan for a goal that carries an error says what a fixed error becomes, and a plain goal does not", () => {
    expect(planPrompt(FIX_ERROR)).toContain(STALE_ERROR_RULE);
    expect(planPrompt(FIX_ERROR)).toMatch(/one step/i);
    expect(planPrompt("Build a booking page")).not.toContain(STALE_ERROR_RULE);
  });
  test("an off the record step, which starts afresh, is told the goal's rule too", () => {
    expect(freshStepPrompt(FIX_ERROR, "Step 1 of 1: Fix it")).toContain(STALE_ERROR_RULE);
    expect(freshStepPrompt("Build a booking page", "Step 1 of 1: Add it")).not.toContain(STALE_ERROR_RULE);
  });
});
