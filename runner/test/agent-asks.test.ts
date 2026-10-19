// "Do what it can, then ask one short question" (HeyClicky v1.0.53 parity, M11). A task whose agent ends on a question to the
// person ends as "needs you": no automatic fix round buries the question (or spends more of the person's money), and the
// agent's last words reach the card on the receipt (`said`, secrets hidden and clipped), with `asks` set.
import { afterEach, describe, expect, test } from "bun:test";
import { mkdtempSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { AgentRunner } from "../src/agent.ts";
import { asksPerson, MAX_SAID_CHARS, saidLine } from "../src/asks.ts";
import { ScriptedEngine, type Step } from "../src/engine.ts";
import { answerPrompt, endingOf, freshAnswerPrompt } from "../src/followup.ts";
import { buildSdkOptions } from "../src/sdkEngine.ts";
import { TaskLog } from "../src/tasklog.ts";
import type { LadderResult } from "../src/proof/ladder.ts";
import { parseEvent, serialize, type Event } from "../../protocol/index.ts";

const made: string[] = [];
afterEach(() => { while (made.length) rmSync(made.pop()!, { recursive: true, force: true }); });
const tmp = (l: string) => { const d = realpathSync(mkdtempSync(join(tmpdir(), `companion-asks-${l}-`))); made.push(d); return d; };
const write = (f: string, c: string): Step => ({ tool: { name: "Write", input: { file_path: f, content: c } }, costUsd: 0.01 });
const read = (f: string): Step => ({ tool: { name: "Read", input: { file_path: f } }, costUsd: 0 });
const say = (text: string): Step => ({ text, costUsd: 0.01 });
const good = (): LadderResult => ({ verdict: "passed", steps: [{ rung: "tests", label: "Running the tests", status: "passed", detail: "", ms: 1 } as never] });
const bad = (detail: string): LadderResult => { const s = { rung: "tests", label: "Running the tests", status: "failed", detail, ms: 1 } as never; return { verdict: "failed", steps: [s], failedAt: s }; };
const of = (e: Event[], t: string) => e.filter((x) => x.type === t) as any[];
const states = (e: Event[]) => of(e, "agent.state").map((x) => x.state);

// empty: no file in the project to begin with (a Drive plan watches the folder, and a file written just before it starts can
// be reported late as the person's own change).
function setup(rounds: Step[][], proofs: LadderResult[] = [good()], o: { empty?: boolean } = {}) {
  const project = tmp("p");
  if (!o.empty) writeFileSync(join(project, "a.txt"), "original");
  const events: Event[] = [];
  const engine = new ScriptedEngine(rounds);
  const log = new TaskLog(":memory:");
  let n = 0;
  const runner = new AgentRunner({ shadowRoot: tmp("s"), engine, log, emit: (e) => events.push(e), proof: async () => proofs[Math.min(n++, proofs.length - 1)] });
  const start = () => runner.handle({ v: 1, id: "c1", type: "agent.start", project, agent: "b1", mode: "drive", prompt: "Make signup work", model: "m", budgetUsd: 3 });
  const send = (text: string) => runner.handle({ v: 1, id: "c2", type: "agent.send", agent: "b1", project, text });
  return { project, events, engine, log, runner, start, send, ladderRuns: () => n };
}
const QUESTION = "SUPABASE_URL is not set. I need your Supabase project address to fix this: what is it? You can copy it from the Supabase dashboard, under Project Settings, then API.";

describe("does the agent's final message ask the person something?", () => {
  test("a question near the end of it does", () => {
    expect(asksPerson(QUESTION)).toBe(true);
    expect(asksPerson(`${QUESTION} Put it in your settings as SUPABASE_URL.`)).toBe(true);
    expect(asksPerson("I added the signup form. Which email address should the welcome email come from?")).toBe(true);
    expect(asksPerson("Done.\n\n**Should the button be blue or green?**")).toBe(true);
    expect(asksPerson("I need one thing from you: \"What is your Stripe key?\"")).toBe(true);
  });
  test("a plain report does not", () => {
    expect(asksPerson("I fixed the null check in signup.js. The tests pass now.")).toBe(false);
    expect(asksPerson("")).toBe(false);
  });
  test("a question it asked itself and then answered, early in a longer message, does not", () => {
    expect(asksPerson("Why did the test fail? The function returned undefined when the name was empty. I made it return an empty string instead. The tests pass now.")).toBe(false);
  });
  test("a question mark inside code is not a question", () => {
    expect(asksPerson("I changed the check to:\n```js\nconst ok = user?.name ? true : false;\n```\nThe tests pass.")).toBe(false);
    expect(asksPerson("I changed `a ? b : c` to a plain if.")).toBe(false);
  });
});

describe("the agent's words on the receipt", () => {
  test("secrets are hidden and spaces folded", () => {
    const s = saidLine("Your key  sk_live_abcdefghijklmnopqrstuvwx\nis in .env. Is that the right one?");
    expect(s).not.toContain("sk_live_abcdefghijklmnopqrstuvwx");
    expect(s).toContain("Is that the right one?");
    expect(s).not.toMatch(/\s{2}|\n/);
  });
  test("they are clipped", () => expect(Array.from(saidLine("word ".repeat(1000))).length).toBeLessThanOrEqual(MAX_SAID_CHARS));
  test("the receipt event with them is valid protocol, and a broken one is refused", () => {
    const r = { v: 1, id: "e1", type: "receipt", agent: "b1", checkpoint: "cp_1", changed: [], commands: 0, notUndoable: [], proof: "skipped", usdEstimate: 0.01, said: "What is your Supabase address?", asks: true };
    expect(parseEvent(serialize(r as never)).ok).toBe(true);
    expect(parseEvent(JSON.stringify({ ...r, said: 3 })).ok).toBe(false);
    expect(parseEvent(JSON.stringify({ ...r, asks: "yes" })).ok).toBe(false);
  });
});

describe("a task that ends on a question needs you", () => {
  test("nothing changed: it ends as needs you, with the question on the receipt, after one round", async () => {
    const r = setup([[read("a.txt"), say(QUESTION)]]);
    await r.start();
    expect(r.engine.calls.length).toBe(1);
    const rec = of(r.events, "receipt")[0];
    expect(rec.asks).toBe(true);
    expect(rec.said).toContain("what is it?");
    expect(r.log.list()[0].status).toBe("needs_you");
    expect(states(r.events).at(-1)).toBe("needsYou");
  });
  test("files changed and the checks fail: they are checked once, and the failure is not sent back over the question", async () => {
    const r = setup([[write("a.txt", "half done"), say("I made the form, but I need your Supabase address to finish. What is it?")], [write("a.txt", "a guess")]], [bad("SUPABASE_URL is not set")]);
    await r.start();
    expect(r.ladderRuns()).toBe(1);
    expect(r.engine.calls.length).toBe(1);
    const rec = of(r.events, "receipt")[0];
    expect(rec.proof).toBe("failed");
    expect(rec.asks).toBe(true);
    expect(r.log.list()[0].status).toBe("needs_you");
    expect(states(r.events).at(-1)).toBe("needsYou");
    expect(of(r.events, "loop.stuck").length).toBe(0);
  });
  test("files changed and the checks pass: the work is done and proven, and the question is still on the receipt", async () => {
    const r = setup([[write("a.txt", "done"), say("I fixed it. Do you also want a test for it?")]], [good()]);
    await r.start();
    const rec = of(r.events, "receipt")[0];
    expect(rec.proof).toBe("passed");
    expect(rec.asks).toBe(true);
    expect(r.log.list()[0].status).toBe("done");
    expect(states(r.events).at(-1)).toBe("done");
  });
  test("a fix round that ends on a question stops the loop there, as needs you", async () => {
    const r = setup([[write("a.txt", "v1"), say("Done.")], [say("The test expects a price I cannot find in the project. What should the price be?")]], [bad("expected 9.99")]);
    await r.start();
    expect(r.engine.calls.length).toBe(2);
    expect(r.log.list()[0].status).toBe("needs_you");
    expect(of(r.events, "receipt")[0].said).toMatch(/What should the price be\?/);
  });
  test("a plain report is not a question: the receipt carries the words, without asks", async () => {
    const r = setup([[write("a.txt", "done"), say("I fixed the null check. The tests pass now.")]], [good()]);
    await r.start();
    const rec = of(r.events, "receipt")[0];
    expect(rec.said).toBe("I fixed the null check. The tests pass now.");
    expect(rec.asks).toBeUndefined();
  });
  test("only the words after the agent's last tool are its last words", async () => {
    const r = setup([[say("Should I look at signup.js first?"), write("a.txt", "done")]], [good()]);
    await r.start();
    const rec = of(r.events, "receipt")[0];
    expect(rec.said).toBeUndefined();
    expect(rec.asks).toBeUndefined();
  });
  test("a task that stopped on an error is tried again, not answered, even if its last words asked something", async () => {
    const project = tmp("p");
    writeFileSync(join(project, "a.txt"), "x");
    const events: Event[] = [];
    const engine = { executesTools: false, async *start(): AsyncGenerator<any, void, any> { yield { text: "Which file should I change?", costUsd: 0 }; throw new Error("the engine crashed"); } };
    const runner = new AgentRunner({ shadowRoot: tmp("s"), engine: engine as never, log: new TaskLog(":memory:"), emit: (e) => events.push(e) });
    await runner.handle({ v: 1, id: "c1", type: "agent.start", project, agent: "b1", mode: "drive", prompt: "x", model: "m", budgetUsd: 1 });
    const rec = of(events, "receipt")[0];
    expect(rec.said).toBe("Which file should I change?");
    expect(rec.asks).toBeUndefined();
    expect(states(events).at(-1)).toBe("error");
  });
  test("a secret in the last words never reaches the receipt", async () => {
    const r = setup([[read("a.txt"), say("I found STRIPE_SECRET_KEY=sk_live_abcdefghijklmnopqrstuvwx in your code. Is that a test key?")]]);
    await r.start();
    const rec = of(r.events, "receipt")[0];
    expect(rec.said).not.toContain("sk_live_abcdefghijklmnopqrstuvwx");
    expect(rec.asks).toBe(true);
  });
  test("the person's answer carries on the same conversation, told it is the answer", async () => {
    const r = setup([[read("a.txt"), say(QUESTION)], [write("a.txt", "done"), say("Thanks, it works now.")]], [good()]);
    await r.start();
    await r.send("https://abc.supabase.co");
    expect(r.engine.calls.length).toBe(2);
    expect(r.engine.calls[1].prompt).toContain("answered your question");
    expect(r.engine.calls[1].prompt).toContain("https://abc.supabase.co");
    expect(r.log.list()[0].status).toBe("done");
  });
  test("a step of a plan that ends on a question ends the plan there, as needs you", async () => {
    const r = setup([[{ text: JSON.stringify(["Add the form", "Add the email"]), costUsd: 0 }], [say("Which email address should send the welcome email?")], [write("b.txt", "never")]], [good()], { empty: true });
    await r.runner.handle({ v: 1, id: "p1", type: "drive.plan", project: r.project, agent: "b1", goal: "signup", model: "m", budgetUsd: 3 });
    await r.runner.handle({ v: 1, id: "p2", type: "drive.approve", agent: "b1", steps: ["Add the form", "Add the email"] });
    expect(r.engine.calls.length).toBe(2);
    expect(of(r.events, "drive.done")[0].status).toBe("needs_you");
    expect(of(r.events, "receipt")[0].asks).toBe(true);
  });
});

describe("the words Claude is given", () => {
  test("it is told to do what it can, then end on one short question, and never to make a value up", () => {
    const a: string = (buildSdkOptions({ project: "/p", model: "m", budgetUsd: 1, claudeBinary: "/x", env: {}, authorize: async () => ({ allow: true, reason: "" }), signal: new AbortController().signal }) as any).systemPrompt.append;
    expect(a).toMatch(/one short question/);
    expect(a).toMatch(/final message/);
    expect(a).toMatch(/never make up/i);
  });
  test("an answer is said as the answer, and off the record the request is said again", () => {
    expect(answerPrompt("blue")).toMatch(/answered your question/);
    expect(answerPrompt("blue")).toContain("blue");
    const f = freshAnswerPrompt("Make signup work", "blue");
    expect(f).toContain("Make signup work");
    expect(f).toContain("blue");
  });
  test("a task that asked ends as asked, so Try again never says it failed", () => expect(endingOf("needs_you", "skipped")).toBe("asked"));
});
