// Proof rung 7: for a risky change, a second model reads the change before it can be called done.
import { afterEach, describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { CheckpointStore } from "../src/checkpoints.ts";
import { runLadder } from "../src/proof/ladder.ts";
import { diffText, needsReview, parseReview, reviewPrompt } from "../src/proof/review.ts";
import { AgentRunner } from "../src/agent.ts";
import { ScriptedEngine, type Step } from "../src/engine.ts";
import { TaskLog } from "../src/tasklog.ts";
import type { Event } from "../../protocol/index.ts";
import { PRODUCT } from "../src/names.ts";

const made: string[] = [];
afterEach(() => { while (made.length) rmSync(made.pop()!, { recursive: true, force: true }); });
const tmp = (l: string) => { const d = realpathSync(mkdtempSync(join(tmpdir(), `companion-rv-${l}-`))); made.push(d); return d; };
const ch = (file: string, kind = "modified") => ({ file, kind });

describe("which changes are risky enough to review", () => {
  test("ordinary page and style changes are not", () => expect(needsReview([ch("index.html"), ch("style.css"), ch("src/App.tsx")])).toBe(false));
  test("the list of packages, secrets files and settings are", () => {
    for (const f of ["package.json", "bun.lock", "package-lock.json", ".env", ".env.local", "config/.env.production", "next.config.js", "vercel.json", "Dockerfile"]) expect(needsReview([ch(f)]), f).toBe(true);
  });
  test("anything about login, payments, keys or the database is", () => {
    for (const f of ["src/auth/login.ts", "lib/stripe.ts", "api/payment.js", "src/secrets.ts", "supabase/migrations/001.sql", "db/schema.sql", "src/api-key.ts", "firebase.json", "firestore.rules"]) expect(needsReview([ch(f)]), f).toBe(true);
  });
  test("a big change is, and so is deleting several files", () => {
    expect(needsReview(Array.from({ length: 16 }, (_, i) => ch(`f${i}.txt`)))).toBe(true);
    expect(needsReview(Array.from({ length: 4 }, (_, i) => ch(`f${i}.txt`, "deleted")))).toBe(true);
    expect(needsReview(Array.from({ length: 3 }, (_, i) => ch(`f${i}.txt`, "deleted")))).toBe(false);
  });
  test("a secret written into an ordinary file makes the change risky, whatever the file is called", () => {
    expect(needsReview([ch("public/app.js")], { "public/app.js": 'Stripe("sk_live_abcdefghijklmnopqrstuvwxyz")' })).toBe(true);
    expect(needsReview([ch("src/App.tsx")], { "src/App.tsx": 'const password = "correcthorsebatterystaple"' })).toBe(true);
    expect(needsReview([ch("index.html")], { "index.html": "<h1>Hello</h1>" })).toBe(false);
  });
  test("nothing changed means nothing to review", () => expect(needsReview([])).toBe(false));
});

describe("what the reviewer is shown", () => {
  test("lines added and removed, per file", () => {
    const d = diffText({ "a.txt": "one\ntwo\nthree" }, { "a.txt": "one\n2\nthree\nfour" }, 10_000);
    expect(d).toContain("a.txt");
    expect(d).toContain("-two");
    expect(d).toContain("+2");
    expect(d).toContain("+four");
    expect(d).not.toContain("+one");
  });
  test("a new file shows all its lines as added, a deleted file as removed", () => {
    const d = diffText({ "old.txt": "x" }, { "new.txt": "y" }, 10_000);
    expect(d).toMatch(/new\.txt[\s\S]*\+y/);
    expect(d).toMatch(/old\.txt[\s\S]*-x/);
  });
  test("it is cut to a size limit and says so", () => {
    const big = "line\n".repeat(5000);
    const d = diffText({}, { "big.txt": big }, 500);
    expect(d.length).toBeLessThan(700);
    expect(d).toMatch(/cut/i);
  });
  test("secret looking values are hidden before anything is sent", () => {
    const d = diffText({}, { ".env": "STRIPE_KEY=sk_live_abcdefghijklmnopqrstuvwxyz\nAPI_TOKEN=ghp_abcdefghijklmnopqrstuvwxyz0123456789" }, 10_000);
    expect(d).not.toContain("sk_live_abcdefghijklmnopqrstuvwxyz");
    expect(d).not.toContain("ghp_abcdefghijklmnopqrstuvwxyz0123456789");
    expect(d).toMatch(/\[hidden/);
  });
  test("a well known key sitting in plain code is hidden even without a name next to it", () => {
    const d = diffText({}, { "a.js": 'fetch(url, ["sk_live_abcdefghijklmnopqrstuvwxyz", "AKIAABCDEFGHIJKLMNOP", "ghp_abcdefghijklmnopqrstuvwxyz0123456789"])' }, 10_000);
    expect(d).not.toMatch(/sk_live_abc|AKIAABCD|ghp_abcdef/);
  });
  test("a value assigned to a name like password or secret is hidden even if it looks ordinary", () => {
    const d = diffText({}, { "a.js": 'const password = "correcthorsebatterystaple"\nlet client_secret: "a1b2c3d4e5f6g7h8i9"' }, 10_000);
    expect(d).not.toContain("correcthorsebatterystaple");
    expect(d).not.toContain("a1b2c3d4e5f6g7h8i9");
  });
  test("ordinary text is left alone", () => expect(diffText({}, { "a.txt": "Hello there, welcome to my site" }, 10_000)).toContain("Hello there, welcome to my site"));
  test("a hidden secret still says what kind of thing was there, so the reviewer can warn about it", () => {
    const d = diffText({}, { "a.js": 'const k = "sk_live_abcdefghijklmnopqrstuvwxyz"; const g = "ghp_abcdefghijklmnopqrstuvwxyz0123456789"; const a = "AKIAABCDEFGHIJKLMNOP"; const password = "correcthorsebatterystaple"' }, 10_000);
    expect(d).toContain("[hidden Stripe live key]");
    expect(d).toContain("[hidden GitHub token]");
    expect(d).toContain("[hidden AWS key]");
    expect(d).toMatch(/password\s*=\s*"?\[hidden secret value\]/);
    expect(d).not.toMatch(/abcdefghijklmnopqrstuvwxyz|correcthorse/);
  });
  test("the prompt explains the markers and lists what not to complain about", () => {
    const p = reviewPrompt("g", "d");
    expect(p).toMatch(/\[hidden/);
    expect(p).toMatch(/written (in|into) (this|the) (code|change)/i);
    expect(p).toMatch(/do not flag/i);
    expect(p).toMatch(/dependenc/i);
    expect(p).toMatch(/approve.*(doubt|unsure|unless)/i);
  });
  test("the prompt carries the goal and the change, and asks for a plain verdict", () => {
    const p = reviewPrompt("add a contact form", "DIFF HERE");
    expect(p).toContain("add a contact form"); expect(p).toContain("DIFF HERE");
    expect(p).toMatch(/approve/); expect(p).toMatch(/changes/);
  });
});

describe("reading the verdict", () => {
  test("approve, and changes with concerns", () => {
    expect(parseReview('{"verdict":"approve","concerns":[]}')).toEqual({ verdict: "approve", concerns: [] });
    expect(parseReview('```json\n{"verdict":"changes","concerns":["The key is in the page","No validation"]}\n```')).toEqual({ verdict: "changes", concerns: ["The key is in the page", "No validation"] });
  });
  test("changes without any concern is not trusted as a rejection", () => expect(parseReview('{"verdict":"changes","concerns":[]}')).toBeNull());
  test("anything else is no verdict, never a guess", () => {
    expect(parseReview('{"verdict":"maybe"}')).toBeNull(); expect(parseReview("looks good to me")).toBeNull(); expect(parseReview("")).toBeNull();
  });
});

describe("rung 7 in the ladder", () => {
  async function scenario(review: any, change = (d: string) => writeFileSync(join(d, "index.html"), `<h1>Hello from ${PRODUCT}</h1>`)) {
    const dir = tmp("d"); writeFileSync(join(dir, "notes.txt"), "x");
    const store = new CheckpointStore(tmp("s"), dir);
    const b = await store.snapshot("before"); change(dir); const a = await store.snapshot("after");
    const updates: any[] = [];
    const result = await runLadder({ project: dir, store, beforeId: b.id, afterId: a.id, onStep: (u) => updates.push(u), review, limits: { browserMs: 15000, startMs: 15000 } });
    return { result, updates };
  }
  test("approval adds a passed review step and keeps the verdict", async () => {
    const { result } = await scenario(async () => ({ verdict: "approve", concerns: [] }));
    expect(result.verdict).toBe("passed");
    expect(result.steps.at(-1)).toMatchObject({ rung: "review", status: "passed" });
  }, 60000);
  test("concerns fail it, with the reviewer's words as the evidence", async () => {
    const { result } = await scenario(async () => ({ verdict: "changes", concerns: ["The secret key is visible in the page"] }));
    expect(result.verdict).toBe("failed");
    expect(result.failedAt?.rung).toBe("review");
    expect(result.failedAt?.detail).toContain("secret key is visible");
  }, 60000);
  test("a review that could not be done is a gap, never a pass or a failure", async () => {
    for (const review of [async () => null, async () => { throw new Error("offline"); }]) {
      const { result } = await scenario(review);
      expect(result.verdict).toBe("passed_with_gaps");
      expect(result.steps.at(-1)).toMatchObject({ rung: "review", status: "skipped" });
    }
  }, 60000);
  test("it is not asked when an earlier check already failed", async () => {
    let asked = false;
    const { result } = await scenario(async () => { asked = true; return { verdict: "approve", concerns: [] }; }, (d) => writeFileSync(join(d, "index.html"), "<script>nope()</script>"));
    expect(result.verdict).toBe("failed");
    expect(asked).toBe(false);
  }, 60000);
  test("without a reviewer nothing changes", async () => {
    const { result } = await scenario(undefined);
    expect(result.steps.some((s) => s.rung === "review")).toBe(false);
  }, 60000);
  test("the review step is reported as running, then how it ended", async () => {
    const { updates } = await scenario(async () => ({ verdict: "approve", concerns: [] }));
    expect(updates.filter((u) => u.rung === "review").map((u) => u.status)).toEqual(["running", "passed"]);
  }, 60000);
});

describe("the reviewer in a real task", () => {
  const w = (f: string, c: string): Step => ({ tool: { name: "Write", input: { file_path: f, content: c } }, costUsd: 0.01 });
  const verdict = (o: object): Step => ({ text: JSON.stringify(o), costUsd: 0.02 });
  function setup(rounds: Step[][], reviews: Step[][]) {
    const project = tmp("p"); writeFileSync(join(project, "a.txt"), "x");
    const events: Event[] = [];
    const reviewer = new ScriptedEngine(reviews);
    const runner = new AgentRunner({ shadowRoot: tmp("s"), engine: new ScriptedEngine(rounds), reviewer, log: new TaskLog(":memory:"), emit: (e) => events.push(e), proof: async (c: any) => { const r = c.review ? await c.review() : undefined; return { verdict: "passed", steps: [], review: r } as never; } });
    const start = () => runner.handle({ v: 1, id: "c", type: "agent.start", project, agent: "a", mode: "drive", prompt: "add payments", model: "m", budgetUsd: 3 });
    return { project, events, reviewer, start };
  }
  test("a risky change is shown to the reviewer, with the goal and the change", async () => {
    const r = setup([[w("package.json", '{"name":"x","dependencies":{"stripe":"1"}}')]], [[verdict({ verdict: "approve", concerns: [] })]]);
    await r.start();
    expect(r.reviewer.calls.length).toBe(1);
    expect(r.reviewer.calls[0].prompt).toContain("add payments");
    expect(r.reviewer.calls[0].prompt).toContain('"stripe":"1"');
    expect(r.reviewer.calls[0].planOnly).toBe(true);
  });
  test("an ordinary looking file that contains a live key is reviewed anyway", async () => {
    const r = setup([[w("public/app.js", 'const s = Stripe("sk_live_abcdefghijklmnopqrstuvwxyz");')]], [[verdict({ verdict: "changes", concerns: ["A live key is in the page"] })]]);
    await r.start();
    expect(r.reviewer.calls.length).toBe(1);
    expect(r.reviewer.calls[0].prompt).toContain("[hidden Stripe live key]");
    expect(r.reviewer.calls[0].prompt).not.toContain("abcdefghijklmnopqrstuvwxyz");
  });
  test("an ordinary change is not reviewed, so nothing extra is spent", async () => {
    const r = setup([[w("index.html", "<h1>hi</h1>")]], [[verdict({ verdict: "approve", concerns: [] })]]);
    await r.start();
    expect(r.reviewer.calls.length).toBe(0);
  });
  test("the reviewer can look at nothing but the text it is given: every tool is refused", async () => {
    const r = setup([[w("package.json", "{}")]], [[{ tool: { name: "Read", input: { file_path: "a.txt" } }, costUsd: 0.01 }, { tool: { name: "Bash", input: { command: "ls" } }, costUsd: 0.01 }, verdict({ verdict: "approve", concerns: [] })]]);
    await r.start();
    const tools = r.events.filter((e) => e.type === "agent.tool") as any[];
    expect(tools.filter((t) => t.tool === "Read" || t.tool === "Bash").every((t) => t.outcome === "blocked")).toBe(true);
  });
});
