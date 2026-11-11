// "Do what it can, then ask one short question" (HeyClicky v1.0.53 parity, M11). A task whose agent ends on a question to the
// person ends as "needs you": no automatic fix round buries the question (or spends more of the person's money), and the
// agent's last words reach the card on the receipt (`said`, secrets hidden and clipped), with `asks` set.
import { afterEach, describe, expect, test } from "bun:test";
// Must fix 29: an engine that does not run tools itself is given the test tool runner by the test, never by default.
import { testToolRunner } from "../src/engine.ts";
import { mkdtempSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { AgentRunner } from "../src/agent.ts";
import { asksForWhatOnlyTheyHave, asksPerson, MAX_SAID_CHARS, questionOf, saidLine } from "../src/asks.ts";
import { ScriptedEngine, type Step } from "../src/engine.ts";
import { answerPrompt, endingOf, freshAnswerPrompt } from "../src/followup.ts";
import { buildSdkOptions } from "../src/sdkEngine.ts";
import { TaskLog } from "../src/tasklog.ts";
import { RunnerSettings } from "../src/settings.ts";
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
function setup(rounds: Step[][], proofs: LadderResult[] = [good()], o: { empty?: boolean; values?: Record<string, unknown> } = {}) {
  const project = tmp("p");
  if (!o.empty) writeFileSync(join(project, "a.txt"), "original");
  const events: Event[] = [];
  const engine = new ScriptedEngine(rounds);
  const log = new TaskLog(":memory:");
  const settings = new RunnerSettings();
  if (o.values) settings.apply({ v: 1, id: "s", type: "settings.apply", values: o.values } as never);
  let n = 0;
  const runner = new AgentRunner({ shadowRoot: tmp("s"), engine, log, settings, emit: (e) => events.push(e), proof: async () => proofs[Math.min(n++, proofs.length - 1)] });
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
    expect(asksPerson("I need one thing from you: \"What is your Supabase project address?\"")).toBe(true);
    // A choice between two ways is the person's, even when it is worded as "should I".
    expect(asksPerson("I can send the welcome email with Resend or Postmark. Should I use Resend or Postmark?")).toBe(true);
    expect(asksPerson("This needs your own key. Can you add STRIPE_SECRET_KEY to your .env file? You can copy it from Stripe.")).toBe(true);
  });
  // Claude often ends on an offer or a check in. Neither asks for anything only the person has, so neither ends the task
  // as needs you (it would skip the fix round and the loop breaker, and the card would wait for an answer to an offer).
  test("an offer of more work, or a check in at the end, is not a question for the person", () => {
    for (const t of [
      "I updated the signup form. Want me to add a test for it too?",
      "I fixed it. Do you also want a test for it?",
      "The fix is in place. Anything else?",
      "Done. Would you like me to add tests for this?",
      "I fixed the button. Should I also update the README?",
      "The page works now. Shall I go ahead and tidy the styles?",
      "I made the change. Is there anything else you need?",
      "I fixed the typo. Does that look right?",
      "The price is 20 percent now. Did that fix it for you?",
      "I renamed the function. What do you think?",
      "That is done. Can I help with anything else?",
      "I added the form. Let me know if you want changes. Want a test too?",
      "I added the check. Do you want me to run the tests again?",
    ]) expect(asksPerson(t), t).toBe(false);
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

describe("does the question name something only the person has?", () => {
  // When the checks failed, only such a question ends the task as needs you; anything else gets the fix round as before.
  test("their own value, account or choice does", () => {
    expect(asksForWhatOnlyTheyHave(QUESTION)).toBe(true);
    expect(asksForWhatOnlyTheyHave("I made the form, but I need your Supabase address to finish. What is it?")).toBe(true);
    expect(asksForWhatOnlyTheyHave("Should the button be blue or green?")).toBe(true);
    expect(asksForWhatOnlyTheyHave("Which email address should the welcome email come from?")).toBe(true);
    expect(asksForWhatOnlyTheyHave("The test expects a price I cannot find in the project. What should the price be?")).toBe(true);
  });
  test("a question Claude could answer by looking does not, and neither does an offer", () => {
    expect(asksForWhatOnlyTheyHave("I changed the server. Is it meant to run on port 3000?")).toBe(false);
    expect(asksForWhatOnlyTheyHave("I updated the signup form. Want me to add a test for it too?")).toBe(false);
    expect(asksForWhatOnlyTheyHave("I fixed the null check. The tests pass now.")).toBe(false);
  });
  test("the question itself is picked out, for the task's name when the person answers", () => {
    expect(questionOf(QUESTION)).toBe("I need your Supabase project address to fix this: what is it?");
    expect(questionOf("I fixed it. Want me to add a test?")).toBeNull();
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
    const r = setup([[write("a.txt", "done"), say("I fixed it. Which email address should the welcome email come from?")]], [good()]);
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
  test("an offer after work whose checks failed gets the fix round, as before, and never waits for an answer", async () => {
    const r = setup([[write("a.txt", "half done"), say("I updated the signup form. Want me to add a test for it too?")], [write("a.txt", "fixed"), say("I fixed the failing check.")]], [bad("the form does not submit"), good()]);
    await r.start();
    expect(r.engine.calls.length).toBe(2);
    expect(r.engine.calls[1].prompt).toMatch(/checks on your work failed/);
    expect(r.ladderRuns()).toBe(2);
    const rec = of(r.events, "receipt")[0];
    expect(rec.proof).toBe("passed");
    expect(rec.asks).toBeUndefined();
    expect(r.log.list()[0].status).toBe("done");
  });
  test("an offer after work whose checks pass is done, without asks", async () => {
    const r = setup([[write("a.txt", "done"), say("The fix is in place. Anything else?")]], [good()]);
    await r.start();
    const rec = of(r.events, "receipt")[0];
    expect(rec.said).toBe("The fix is in place. Anything else?");
    expect(rec.asks).toBeUndefined();
    expect(r.log.list()[0].status).toBe("done");
    expect(states(r.events).at(-1)).toBe("done");
  });
  test("a question Claude could answer itself, after checks that failed, gets the fix round", async () => {
    const r = setup([[write("a.txt", "v1"), say("I changed the server. Is it meant to run on port 3000?")], [write("a.txt", "v2"), say("Fixed.")]], [bad("port in use"), good()]);
    await r.start();
    expect(r.engine.calls.length).toBe(2);
    expect(r.log.list()[0].status).toBe("done");
  });
  test("with Stop and wait when Claude asks you something turned off, a question gets the fix round as before", async () => {
    const r = setup([[write("a.txt", "half done"), say("I made the form, but I need your Supabase address to finish. What is it?")], [write("a.txt", "guess"), say("Done.")]], [bad("SUPABASE_URL is not set"), good()], { values: { "work.stopOnQuestion": false } });
    await r.start();
    expect(r.engine.calls.length).toBe(2);
    expect(of(r.events, "receipt")[0].asks).toBeUndefined();
    expect(r.log.list()[0].status).toBe("done");
  });
  test("with it turned off, a question with nothing changed ends as done, its words on the receipt without asks", async () => {
    const r = setup([[read("a.txt"), say(QUESTION)]], [good()], { values: { "work.stopOnQuestion": false } });
    await r.start();
    const rec = of(r.events, "receipt")[0];
    expect(rec.said).toContain("what is it?");
    expect(rec.asks).toBeUndefined();
    expect(r.log.list()[0].status).toBe("done");
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
    const runner = new AgentRunner({ executor: testToolRunner, shadowRoot: tmp("s"), engine: engine as never, log: new TaskLog(":memory:"), emit: (e) => events.push(e) });
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
  // A person may paste a key as the answer, although Claude is told never to ask for one. The answer is never the task's
  // name (tasks.db, What I did), and a key in it is hidden before it is sent to Claude, whose conversation is saved.
  test("an answer is named by the question it answers, never by what the person typed", async () => {
    const r = setup([[read("a.txt"), say("The welcome email needs a sending address. Which address should it come from?")], [read("a.txt"), say("Thanks.")]], [good()]);
    await r.start();
    await r.send("re_live_9f8e7d6c5b4a3f2e1d0c and STRIPE_SECRET_KEY=sk_live_abcdefghijklmnopqrstuvwx");
    const rows = r.log.list();
    expect(rows[0].label).toBe("Answer to: Which address should it come from?");
    for (const row of rows) { expect(row.label).not.toContain("re_live_9f8e7d6c5b4a3f2e1d0c"); expect(row.label).not.toContain("sk_live_abcdefghijklmnopqrstuvwx"); }
    expect(r.engine.calls[1].prompt).not.toContain("sk_live_abcdefghijklmnopqrstuvwx");
    const created = of(r.events, "checkpoint.created").at(-1);
    expect(String(created.label)).not.toContain("re_live_9f8e7d6c5b4a3f2e1d0c");
  });
  test("Try again after an answer tries the task, never names it by the answer", async () => {
    const r = setup([[read("a.txt"), say(QUESTION)], [write("a.txt", "v1"), say("Done.")], [write("a.txt", "v2"), say("Done.")]], [good()]);
    await r.start();
    await r.send("re_live_9f8e7d6c5b4a3f2e1d0c");
    await r.runner.handle({ v: 1, id: "c3", type: "agent.send", agent: "b1", project: r.project, retry: true });
    const labels = r.log.list().map((x) => x.label);
    expect(labels.some((l) => l.startsWith("Try again: Make signup work"))).toBe(true);
    for (const l of labels) expect(l).not.toContain("re_live_9f8e7d6c5b4a3f2e1d0c");
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
  const appended = (): string => (buildSdkOptions({ project: "/p", model: "m", budgetUsd: 1, claudeBinary: "/x", env: {}, authorize: async () => ({ allow: true, reason: "" }), signal: new AbortController().signal }) as any).systemPrompt.append;
  test("it is told to do what it can, then end on one short question, and never to make a value up", () => {
    const a = appended();
    expect(a).toMatch(/one short question/);
    expect(a).toMatch(/final message/);
    expect(a).toMatch(/never make up/i);
  });
  test("it is told to put the question on its own last line, and otherwise never to end on a question or an offer", () => {
    const a = appended();
    expect(a).toMatch(/last line/);
    expect(a).toMatch(/never end your final message with a question or an offer/i);
  });
  test("it is never told to ask for a key; it says which setting to add and where, so the person adds it", () => {
    const a = appended();
    expect(a).not.toMatch(/a key[,)]/);
    expect(a).toMatch(/Never ask for a password, a key or any other secret/);
    expect(a).toMatch(/\.env/);
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

// Second audit (asks.ts): habitual endings, questions answered by the agent itself, permission questions, the tail of a long
// message, and a Drive step that passed but still waits for an answer.
describe("second audit: what counts as a question for the person", () => {
  test("habitual offers and check ins in other words are not questions", () => {
    for (const t of [
      "Here is how the project is laid out. Would you like to see the routes?",
      "I updated the form. Would you like to see it?",
      "I updated the form. Do you want to deploy it?",
      "I updated the form. Do you want to continue?",
      "I fixed the bug. Would you like to add a test?",
      "I fixed the bug. Want to try it?",
      "The page is built. Ready to deploy?",
      "The page is built. Shall we continue?",
      "The page is built. Should we deploy it?",
      "That is how it works. Is that clear?",
      "I changed the layout. Have I covered everything?",
      "I fixed the button. Did the button work for you?",
      "I made the page. Would you like any changes?",
    ]) { expect(asksPerson(t), t).toBe(false); expect(asksForWhatOnlyTheyHave(t), t).toBe(false); }
  });
  test("a real choice in those words is still a question", () => {
    expect(asksPerson("I made the page. Would you like it blue or green?")).toBe(true);
    expect(asksPerson("Do you have a Stripe account?")).toBe(true);
  });
  test("a question Claude answers itself later in the message is not a question", () => {
    for (const t of [
      "Is the build passing? Yes it passes. The page is live.",
      "Why did it fail? The port was taken. I changed it to 3001.",
      "What changed? I added the footer. I fixed the link.",
    ]) expect(asksPerson(t), t).toBe(false);
  });
  test("a question followed only by where the answer lives, or that Claude waits, still is one", () => {
    expect(asksPerson("I need a value. What is your project address? You can copy it from the dashboard. Let me know.")).toBe(true);
    expect(asksPerson("Which email address should the form send to? Once you tell me, I will carry on.")).toBe(true);
    expect(asksPerson("Which address should it use? Want me to add a test too?")).toBe(true);
  });
  test("a question followed by an ordinary line is still a question; only an answer cancels it", () => {
    for (const t of [
      "What is your Stripe key? Without it I can't set up payments.",
      "What is your Stripe key? Please paste it here.",
      "Which email should I use? I'll need it before I continue.",
      "Which email address should I use? This is needed to send the form.",
      "Which email address should I use? Note: the form stays off until then.",
    ]) { expect(asksPerson(t), t).toBe(true); expect(questionOf(t), t).not.toBeNull(); }
    expect(asksForWhatOnlyTheyHave("What is your Stripe key? Without it I can't set up payments.")).toBe(true);
    for (const t of ["Is the build passing? The tests pass.", "Which port? I used 3001.", "Is it live? It is live."]) expect(asksPerson(t), t).toBe(false);
  });
  test("the other ways to ask before something destructive or theirs are questions too", () => {
    for (const t of [
      "Do you want me to delete the users table?",
      "Would you like me to overwrite your config?",
      "Do you want to delete your account data?",
      "Want me to wipe the database?",
    ]) { expect(asksPerson(t), t).toBe(true); expect(asksForWhatOnlyTheyHave(t), t).toBe(true); }
    for (const t of ["I fixed it. Do you want me to add a test?", "I fixed it. Would you like to see it?", "Done. Do you want to continue?", "Done. Want me to tidy the styles?"]) expect(asksPerson(t), t).toBe(false);
  });
  test("a yes or no before something destructive or that is theirs is a question, not an offer", () => {
    for (const t of [
      "Done. Should I delete the old users table?",
      "I stopped. Can I overwrite the existing .env file?",
      "I found old exports. May I delete these files?",
      "Should I use your existing Supabase project?",
    ]) { expect(asksPerson(t), t).toBe(true); expect(asksForWhatOnlyTheyHave(t), t).toBe(true); expect(questionOf(t), t).not.toBeNull(); }
    // Habitual endings with the same words stay offers.
    expect(asksPerson("I fixed it. Shall I go ahead and tidy the styles?")).toBe(false);
    expect(asksPerson("I fixed it. Should I proceed with your plan?")).toBe(false);
  });
});

describe("second audit: the receipt keeps the question", () => {
  test("a long message ending on a question keeps its end", () => {
    const text = `${"I built the signup page and wired up the form. ".repeat(15)}Which email address should the messages go to?`;
    expect(Array.from(text).length).toBeGreaterThan(MAX_SAID_CHARS);
    const s = saidLine(text);
    expect(Array.from(s).length).toBeLessThanOrEqual(MAX_SAID_CHARS);
    // M77b: in whole sentences, after the first one (it often says the cause).
    expect(s.startsWith("I built the signup page and wired up the form. … I built")).toBe(true);
    expect(s).toContain("Which email address should the messages go to?");
    expect(s.endsWith("?")).toBe(true);
  });
  test("a long message that asks nothing keeps its start, as before", () => {
    const s = saidLine("I built the signup page. ".repeat(60));
    expect(s.startsWith("I built")).toBe(true);
    expect(s.endsWith("…")).toBe(true);
  });
});

describe("second audit: a Drive step that passed but asks", () => {
  test("it stops the plan there, as needs you, and the next step does not start", async () => {
    const r = setup([[{ text: JSON.stringify(["Add the form", "Add the email"]), costUsd: 0 }], [write("b.txt", "form"), say("I added the form. Which email address should the form send to?")], [write("c.txt", "never")]], [good()], { empty: true });
    await r.runner.handle({ v: 1, id: "p1", type: "drive.plan", project: r.project, agent: "b1", goal: "signup", model: "m", budgetUsd: 3 });
    await r.runner.handle({ v: 1, id: "p2", type: "drive.approve", agent: "b1", steps: ["Add the form", "Add the email"] });
    expect(r.engine.calls.length).toBe(2);
    expect(of(r.events, "drive.done")[0].status).toBe("needs_you");
    const receipt = of(r.events, "receipt")[0];
    expect(receipt.asks).toBe(true);
    expect(receipt.proof).toBe("passed");
  });
  test("a step that ends on an offer carries on to the next step", async () => {
    const r = setup([[{ text: JSON.stringify(["Add the form", "Add the email"]), costUsd: 0 }], [write("b.txt", "form"), say("I added the form. Want me to add a test too?")], [write("c.txt", "email"), say("Done.")]], [good()], { empty: true });
    await r.runner.handle({ v: 1, id: "p1", type: "drive.plan", project: r.project, agent: "b1", goal: "signup", model: "m", budgetUsd: 3 });
    await r.runner.handle({ v: 1, id: "p2", type: "drive.approve", agent: "b1", steps: ["Add the form", "Add the email"] });
    expect(of(r.events, "drive.done")[0].status).toBe("done");
  });
});
