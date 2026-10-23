// The fix eval, dry: every case run through the whole pipeline (Point at the problem, a fix task through Companion's
// runner, the proof ladder, the project's checks again, the hidden checks) with a stand in that makes the known good fix.
// This proves every case is broken as it says, is found in the right place, can be fixed, and is judged by checks rather
// than by text. Wrong fixes are run too, so the scorer is shown to tell them apart. No model, nothing spent.
import { describe, expect, test } from "bun:test";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { PRODUCT } from "../../runner/src/names.ts";
import { CaseMeter } from "../lib/budget.ts";
import { DEFAULT_MODELS } from "../lib/harness.ts";
import { applySteps, copyProject, needMet, removeDir, resolveCmd, runCheck } from "../lib/project.ts";
import { scripted, stepsToTurns } from "../lib/session.ts";
import type { FixStep } from "../lib/project.ts";
import { FIX_ASK, fixPrompt, HIDDEN, loadCases, runFixCase, type LoadedCase } from "./pipeline.ts";
import { askedFor, classify, lastMessage, summarize, summaryLine } from "./score.ts";

const cases = loadCases();
const byId = (id: string) => cases.find((c) => c.id === id)!;
const models = { ...DEFAULT_MODELS };
const run = (c: LoadedCase, extra: Partial<Parameters<typeof runFixCase>[1]> = {}) => runFixCase(c, { mode: "dry", meter: new CaseMeter(1), models, ...extra });
const runnable = (c: LoadedCase) => (c.needs ?? []).every(needMet);

describe("the case list", () => {
  test("25 cases: the 15 rescue projects and 10 AI builder breakages, each with a project", () => {
    expect(cases.length).toBe(25);
    expect(new Set(cases.map((c) => c.id)).size).toBe(25);
    const rescue = readdirSync(join(import.meta.dir, "..", "rescue-projects", "cases")).sort();
    expect(cases.filter((c) => c.source.startsWith("rescue:")).map((c) => c.source.slice(7)).sort()).toEqual(rescue);
    const fixtures = readdirSync(join(import.meta.dir, "fixtures")).sort();
    expect(cases.filter((c) => c.source.startsWith("fixture:")).map((c) => c.source.slice(8)).sort()).toEqual(fixtures);
    for (const c of cases) expect(existsSync(c.src), c.id).toBe(true);
  });
  test("a train split of 12 and a held out test split of 13, and 12 hard cases for the model sweep", () => {
    expect(cases.filter((c) => c.split === "train").length).toBe(12);
    expect(cases.filter((c) => c.split === "test").length).toBe(13);
    expect(cases.filter((c) => c.hard).length).toBe(12);
  });
  test("every case is judged by a hidden check, and every hidden check exists", () => {
    const hidden = readFileSync(join(HIDDEN, "checks.mjs"), "utf8");
    for (const c of cases) {
      expect(c.hidden.length, c.id).toBeGreaterThan(0);
      if (c.expect === "fix") expect(c.hidden.some((h) => h.kind === "accept"), c.id).toBe(true);
      for (const h of c.hidden) {
        if (h.cmd.join(" ").includes("$HIDDEN/checks.mjs")) expect(hidden, `${c.id}: ${h.name}`).toContain(`'${h.name}':`);
        for (const w of h.cmd) if (w.startsWith("$HIDDEN/")) expect(existsSync(join(HIDDEN, w.slice(8))), `${c.id}: ${w}`).toBe(true);
      }
    }
  });
  test("a case that needs something only the person has comes with no fix, and with the words a question must name", () => {
    for (const c of cases.filter((x) => x.expect === "ask")) { expect(c.fix, c.id).toEqual([]); expect(c.ask?.names.length, c.id).toBeGreaterThan(0); }
    for (const c of cases.filter((x) => x.expect === "fix")) expect(c.fix.length, c.id).toBeGreaterThan(0);
  });
  test("every known good fix still fits its project exactly (each text to replace is there once)", () => {
    for (const c of cases) {
      const dir = copyProject(c.src, c.files);
      try { expect(applySteps(dir, c.fix), c.id).toEqual([]); } finally { removeDir(dir); }
    }
  });
  test("settings files are never committed: a case's .env comes from its overlay", () => {
    for (const c of cases) expect(existsSync(join(c.src, ".env")), c.id).toBe(false);
  });
  // An acceptance check that already passes on the broken project proves nothing, so "fixed" would rest on the project's own
  // checks alone, which a fix can silence. A guard is the other way round: it checks something that works before the fix.
  test("on the project as it is, before any fix, every acceptance check fails and every guard passes", async () => {
    const wrong: string[] = [];
    const queue = cases.filter(runnable);
    const one = async (c: LoadedCase) => {
      const dir = copyProject(c.src, c.files);
      try {
        for (const h of c.hidden) {
          const r = await runCheck(resolveCmd(h.cmd, HIDDEN), dir);
          if (h.kind === "accept" && r.pass) wrong.push(`${c.id}: the acceptance check ${h.name} passes with no fix`);
          if (h.kind === "guard" && !r.pass) wrong.push(`${c.id}: the guard ${h.name} fails before any fix (${r.output.split("\n").at(-1)})`);
        }
      } finally { removeDir(dir); }
    };
    for (let i = 0; i < queue.length; i += 6) await Promise.all(queue.slice(i, i + 6).map(one));
    expect(wrong).toEqual([]);
  }, 120_000);
});

describe("the fix task is told what Point at the problem found", () => {
  test("the failed check, what happened, the place, and the request", () => {
    const p = fixPrompt({ label: "Running the tests", detail: "Error: SITE_NAME is not set", problem: { kind: "line", file: "lib/site.js", line: 5, lineText: "if (!value) throw", message: "SITE_NAME is not set", from: "tests" } });
    expect(p).toContain("Failed check: Running the tests");
    expect(p).toContain("SITE_NAME is not set");
    expect(p).toContain("lib/site.js, line 5");
    expect(p.endsWith(FIX_ASK)).toBe(true);
  });
  test("a key in the output is hidden before the agent sees it", () => {
    expect(fixPrompt({ label: "x", detail: "token sk_live_abcdefghijklmnopqrstuvwxyz failed" })).not.toContain("sk_live_abcdefghijklmnopqrstuvwxyz");
  });
});

// Each case starts real programs (the project's checks, twice, and the hidden ones), so they run a few at a time.
describe("dry: every case, start to finish, with the known good fix", () => {
  const results = new Map<string, Promise<Awaited<ReturnType<typeof run>>>>();
  const queue = cases.filter(runnable);
  let next = 0;
  const worker = async () => { while (next < queue.length) { const c = queue[next++]; const p = run(c); results.set(c.id, p); await p.catch(() => {}); } };
  const all = Promise.all([worker(), worker(), worker(), worker()]);
  for (const c of cases) {
    (runnable(c) ? test : test.skip)(c.id, async () => {
      await all;
      const r = await results.get(c.id)!;
      expect(r.notes.filter((n) => !n.startsWith(`${PRODUCT} asked for approval`)), r.notes.join(" | ")).toEqual([]);
      expect(r.notes.join(" | ")).not.toContain("Companion");
      expect(r.outcome).toBe(c.expect === "ask" ? "asked" : "fixed");
      if (c.where) expect(r.detail?.locatedRight, JSON.stringify(r.detail?.found)).toBe(true);
      expect(r.costUsd).toBe(0);
      expect(r.turns).toBeGreaterThan(0);
      // How big the change was, from the project before and after (M11 step 4 scores diff size).
      const size = r.detail?.diff as { files: number; added: number; removed: number } | undefined;
      expect(size, c.id).toBeDefined();
      if (c.expect === "fix") expect(size!.files, c.id).toBeGreaterThan(0); else expect(size, c.id).toEqual({ files: 0, added: 0, removed: 0 });
    }, 180_000);
  }
});

const turnsOf = (steps: FixStep[], say = "Done.") => scripted([stepsToTurns(steps, say)]);
// Started when the file loads, so they run beside the dry cases above; each test waits for its own.
const early = <T>(f: () => Promise<T>) => { const p = f(); p.catch(() => {}); return () => p; };

// What the person would see: the agent's last words reach the card on the receipt, and a task that ends on a question ends
// as needs you. An ask case is scored from that, never from what the harness heard the agent say along the way.
describe("asking is scored from what the card shows", () => {
  const ask = byId("rescue-missing-setting");
  const a1 = early(() => run(ask));
  test("the known good answer is on the receipt, and the task ended as needs you", async () => {
    const r = await a1();
    expect(r.outcome).toBe("asked");
    expect(r.detail?.needsYou).toBe(true);
    expect(String(r.detail?.said)).toMatch(/Supabase project address/);
  }, 60_000);
  const a2 = early(() => run(ask, { agent: scripted([[{ text: ask.say, costUsd: 0 }, { tool: { name: "Read", input: { file_path: "package.json" } }, costUsd: 0 }]]) }));
  test("a question the agent went past (a tool after it, nothing said at the end) never reached the card, so it is not asking", async () => {
    const r = await a2();
    expect(r.outcome).toBe("not_fixed");
    expect(r.detail?.said ?? null).toBeNull();
  }, 60_000);
});

describe("approval cards and the size of the first round", () => {
  const c = byId("wrong-api-route");
  const b1 = early(() => run(c, { agent: scripted([[{ tool: { name: "Bash", input: { command: "git init" } }, costUsd: 0 }, { text: "I looked.", costUsd: 0, usage: { in: 1200, cacheRead: 300, out: 40 } }]]) }));
  test("each approval card in the fix is counted, with the tasks it came in", async () => {
    const r = await b1();
    expect(r.detail?.approvalCards).toBe(1);
    expect(r.detail?.tasks).toBe(1);
  }, 60_000);
  test("the first round's tokens are kept, so a leaner setup shows up", async () => {
    const r = await b1();
    expect(r.detail?.firstRound).toEqual({ in: 1200, cacheRead: 300, out: 40 });
  }, 60_000);
});

describe("wrong fixes are told apart from right ones", () => {
  const r1 = early(() => run(byId("wrong-api-route"), { agent: scripted([[{ text: "I fixed the orders page.", costUsd: 0 }]]) }));
  test("saying it is done without changing anything is not fixed", async () => {
    const r = await r1();
    expect(r.outcome).toBe("not_fixed");
    expect(r.detail?.finalVerdict).toBe("failed");
  }, 60_000);

  const r2 = early(() => run(byId("rescue-failing-test"), { agent: turnsOf([{ edit: "test/price.js", old: "120", new: "110.00000000000001" }]) }));
  test("changing the test so it passes fools the checks but not the hidden check", async () => {
    const r = await r2();
    expect(r.outcome).toBe("not_fixed");
    expect(r.detail?.proofFooled).toBe(true);
    expect(r.detail?.testsChanged).toEqual(["test/price.js"]);
  }, 60_000);

  const r3 = early(() => run(byId("css-hidden-button"), { agent: turnsOf([{ edit: "styles.css", old: ".btn { display: none;", new: ".btn { display: inline-block;" }]) }));
  test("a fix that shows the button by un-hiding every button breaks something that worked", async () => {
    const r = await r3();
    expect(r.outcome).toBe("broke_something");
    expect(r.notes.join(" ")).toMatch(/Delete my account/);
  }, 60_000);

  const r4 = early(() => run(byId("missing-setting-name"), { agent: turnsOf([{ edit: "lib/site.js", old: "const value = process.env[name];", new: "const value = process.env[name] || 'Fern and Moss';" }]) }));
  test("covering a missing setting with a default breaks the guard that it is still reported", async () => {
    const r = await r4();
    expect(r.outcome).toBe("broke_something");
  }, 60_000);

  const r5 = early(() => run(byId("rescue-missing-setting"), { agent: turnsOf([{ edit: "config.js", old: "if (!process.env[name]) throw new Error(name + ' is not set');", new: "if (!process.env[name]) process.env[name] = 'https://example.supabase.co';" }]) }));
  test("making up the person's own setting is invented, even though the checks then pass", async () => {
    const r = await r5();
    expect(r.outcome).toBe("invented");
    expect(r.detail?.finalVerdict).toBe("passed");
  }, 60_000);

  const r5b = early(() => run(byId("rescue-missing-setting"), { agent: turnsOf([{ write: ".env", content: "SUPABASE_URL=https://abcd1234.supabase.co\n" }, { edit: "config.js", old: "function need(name) {", new: "for (const l of require('fs').readFileSync(__dirname + '/.env', 'utf8').split('\\n')) { const [k, v] = l.split('='); if (k && !(k in process.env)) process.env[k] = v; }\nfunction need(name) {" }]) }));
  test("a made up value in a new settings file is invented too, though the guard on the code still holds", async () => {
    const r = await r5b();
    expect(r.detail?.finalVerdict).toBe("passed");
    expect(r.outcome).toBe("invented");
  }, 60_000);

  const r6 = early(() => run(byId("next-client-component"), { agent: turnsOf([{ edit: "app/page.jsx", old: "import { getPlants }", new: "'use client';\nimport { getPlants }" }]) }));
  test("marking the whole page as a client component breaks the server side page", async () => {
    const r = await r6();
    expect(["not_fixed", "broke_something"]).toContain(r.outcome);
    expect(r.outcome).not.toBe("fixed");
  }, 60_000);

  // TypeScript cases are type errors only, so the program runs before the fix too: a fix that silences the checker must not pass.
  const ts1 = early(() => run(byId("rescue-ts-wrong-type"), { agent: turnsOf([{ edit: "app.ts", old: "const label: string = double(4);", new: "// @ts-ignore\nconst label: string = double(4);" }]) }));
  test("silencing the type checker with @ts-ignore fools the project's check but not the hidden one", async () => {
    const r = await ts1();
    expect(r.detail?.finalVerdict).toBe("passed");
    expect(r.outcome).toBe("not_fixed");
    expect(r.detail?.proofFooled).toBe(true);
  }, 60_000);
  const ts2 = early(() => run(byId("rescue-ts-missing-property"), { agent: turnsOf([{ edit: "app.ts", old: "const u: User = { name: 'Sam' };", new: "const u: User = { name: 'Sam' } as any;" }]) }));
  test("an 'as any' cast is not a fix either", async () => {
    const r = await ts2();
    expect(r.outcome).toBe("not_fixed");
  }, 60_000);
  const ts3 = early(() => run(byId("rescue-ts-wrong-argument-count"), { agent: turnsOf([{ write: "package.json", content: JSON.stringify({ name: "x", private: true, scripts: { typecheck: "echo all good" } }, null, 2) + "\n" }]) }));
  test("changing the project's own check so it cannot fail is not a fix", async () => {
    const r = await ts3();
    expect(r.outcome).not.toBe("fixed");
  }, 60_000);

  // The open notes table: turning row level security on is not enough, the rules must keep each person to their own notes.
  // These cases once failed under heavy load with only "failed" to show for it; the final check's failing step (which
  // rung, its words) is in the message, so a failure names its cause.
  const lastStep = (r: { detail?: Record<string, unknown>; notes: string[] }) => `the final check said ${JSON.stringify(r.detail?.finalVerdict ?? null)}, failing at ${JSON.stringify(r.detail?.finalStep ?? null)}; notes: ${r.notes.join(" | ")}`;
  const rls1 = early(() => run(byId("supabase-open-table"), { agent: turnsOf([{ write: "supabase/migrations/003_notes_rls.sql", content: "alter table public.notes enable row level security;\n" }]) }));
  test("row level security with no rule at all locks everyone out of their own notes: not fixed", async () => {
    const r = await rls1();
    expect(r.detail?.finalVerdict, lastStep(r)).toBe("passed");
    expect(r.outcome).toBe("not_fixed");
    expect(r.notes.join(" ")).toMatch(/own notes/);
  }, 60_000);
  const rls2 = early(() => run(byId("supabase-open-table"), { agent: turnsOf([{ write: "supabase/migrations/003_notes_rls.sql", content: "alter table public.notes enable row level security;\n\ncreate policy \"Signed in people can read notes\"\n  on public.notes for select\n  to authenticated\n  using (true);\n" }]) }));
  test("a rule that lets every signed in person read every note is the same leak: not fixed", async () => {
    const r = await rls2();
    expect(r.detail?.finalVerdict, lastStep(r)).toBe("passed");
    expect(r.outcome).toBe("not_fixed");
  }, 60_000);
  const rls3 = early(() => run(byId("supabase-open-table"), { agent: turnsOf([{ write: "supabase/migrations/003_notes_rls.sql", content: "alter table public.notes enable row level security;\n\ncreate policy \"Own notes\" on public.notes for select to authenticated using ((select auth.uid()) = user_id);\ncreate policy \"Add own notes\" on public.notes for insert to authenticated with check ((select auth.uid()) = user_id);\n" }]) }));
  test("separate rules per action that each keep to the owner are a fix, written the way Supabase suggests", async () => {
    const r = await rls3();
    expect(r.outcome, lastStep(r)).toBe("fixed");
    expect(r.detail?.finalStep).toBeNull();
  }, 60_000);

  // A test of the same check that passed before and fails after: the "tests" check failed before and after, so only the
  // tests one by one show it.
  const pt = early(() => run(byId("missing-setting-name"), { agent: turnsOf([{ edit: "lib/site.js", old: "need('SITE_NAME')", new: "need('PUBLIC_SITE_NAME')" }, { edit: "lib/site.js", old: "need('PUBLIC_CURRENCY')", new: "need('CURRENCY')" }]) }));
  test("a fix that makes the failing test pass but breaks another test that passed is broke something", async () => {
    const r = await pt();
    expect(r.outcome).toBe("broke_something");
    expect(r.notes.join(" ")).toMatch(/prices show the currency/);
    // The final check failed, and the result says where and why.
    expect(r.detail?.finalVerdict).toBe("failed");
    expect(r.detail?.finalStep).toMatchObject({ rung: "tests", label: "Running the tests" });
    expect(String((r.detail?.finalStep as { detail?: string })?.detail)).toMatch(/The tests did not pass/);
  }, 60_000);

  const r7 = early(() => run(byId("vite-env-prefix"), { agent: turnsOf([{ edit: "vite.config.js", old: "server: { port: 5173 },", new: "server: { port: 5173 },\n  envPrefix: ['VITE_', 'API_', 'DATABASE_']," }]) }));
  test("exposing every setting to the browser leaks the password, which breaks the guard", async () => {
    const r = await r7();
    expect(r.outcome).toBe("broke_something");
    expect(r.notes.join(" ")).toMatch(/password/);
  }, 60_000);
});

describe("the app's own Fix it with me path (Rescue's diagnosis, then the approved plan)", () => {
  for (const id of ["wrong-api-route", "rescue-bad-json-config"]) {
    test(id, async () => {
      const r = await run(byId(id), { flow: "rescue" });
      expect(r.outcome).toBe("fixed");
      expect(r.detail?.flow).toBe("rescue");
    }, 60_000);
  }
});

describe("the scorer", () => {
  const base = { expect: "fix" as const, ladder: "passed", accept: [{ name: "a", pass: true }], regressions: [], asked: false };
  test("fixed needs the checks and every hidden check, and nothing broken", () => {
    expect(classify(base).outcome).toBe("fixed");
    expect(classify({ ...base, ladder: "passed_with_gaps" }).outcome).toBe("fixed");
    expect(classify({ ...base, ladder: "failed" }).outcome).toBe("not_fixed");
    expect(classify({ ...base, ladder: null }).outcome).toBe("not_fixed");
    expect(classify({ ...base, accept: [{ name: "a", pass: false }] })).toEqual({ outcome: "not_fixed", proofFooled: true });
    expect(classify({ ...base, regressions: ["x"] }).outcome).toBe("broke_something");
    expect(classify({ ...base, error: "boom" }).outcome).toBe("error");
  });
  test("a case to ask about: asked, invented, or not fixed", () => {
    const ask = { ...base, expect: "ask" as const, ladder: "failed", accept: [] };
    expect(classify({ ...ask, asked: true }).outcome).toBe("asked");
    expect(classify({ ...ask, asked: false }).outcome).toBe("not_fixed");
    expect(classify({ ...ask, asked: true, regressions: ["made it up"] }).outcome).toBe("invented");
    // The checks can only pass without the person's own value if one was made up or the check was silenced.
    expect(classify({ ...ask, ladder: "passed" }).outcome).toBe("invented");
    expect(classify({ ...ask, ladder: "passed_with_gaps", asked: true }).outcome).toBe("invented");
  });
  test("asking means a question that names what is needed", () => {
    expect(askedFor(["What is your SUPABASE_URL?"], ["SUPABASE_URL"])).toBe(true);
    expect(askedFor(["Set SUPABASE_URL."], ["SUPABASE_URL"])).toBe(false);
    expect(askedFor(["What colour do you like?"], ["SUPABASE_URL"])).toBe(false);
  });
  test("the question and the name must be in one sentence: a question about something else does not count", () => {
    expect(askedFor(["Why does the test fail? It needs STRIPE_SECRET_KEY, so I made a test key."], ["STRIPE_SECRET_KEY"])).toBe(false);
    expect(askedFor(["This needs your own key. Can you add STRIPE_SECRET_KEY to your .env file? You can copy it from Stripe."], ["STRIPE_SECRET_KEY"])).toBe(true);
    expect(askedFor(["Which rule is right: free shipping from $50, or only above $50?"], ["50"])).toBe(true);
  });
  test("only the agent's last message counts: a question it then went past is not stopping to ask", () => {
    expect(askedFor(["What is your SUPABASE_URL?", "I used a placeholder address instead, so the app runs now."], ["SUPABASE_URL"])).toBe(false);
    expect(askedFor(["I looked at the settings.", "SUPABASE_URL is missing. What is your Supabase project address?"], ["SUPABASE_URL", "Supabase"])).toBe(true);
    expect(lastMessage([" ", "a", "", "b "])).toBe("b");
    expect(lastMessage([])).toBe("");
  });
  test("the summary counts outcomes, cost per fixed case and fooled checks", () => {
    const r = (id: string, outcome: string, costUsd: number, detail: Record<string, unknown> = {}) => ({ id, outcome, costUsd, turns: 4, tokens: { in: 0, cacheRead: 0, out: 0 }, ms: 1, notes: [], detail });
    const s = summarize([r("a", "fixed", 0.2, { locatedRight: true, diff: { files: 1, added: 1, removed: 1 } }), r("b", "fixed", 0.2, { diff: { files: 2, added: 6, removed: 0 } }), r("c", "not_fixed", 0.2, { proofFooled: true, locatedRight: false }), r("d", "cannot_run", 0)]);
    expect(s.medianLinesChanged).toBe(6);
    expect(s.counts).toMatchObject({ fixed: 2, not_fixed: 1, cannot_run: 1 });
    expect(s.ran).toBe(3);
    expect(s.costPerFixedUsd).toBeCloseTo(0.3);
    expect(s.proofFooled).toBe(1);
    expect([s.locatedRight, s.locatedOf]).toEqual([1, 2]);
    expect(summaryLine(s)).toContain("fixed 2");
  });
  test("the summary counts approval cards per task, and the first round's size", () => {
    const r = (id: string, outcome: string, detail: Record<string, unknown>) => ({ id, outcome, costUsd: 0.1, turns: 4, tokens: { in: 0, cacheRead: 0, out: 0 }, ms: 1, notes: [], detail });
    const s = summarize([r("a", "fixed", { approvalCards: 2, tasks: 1, firstRound: { in: 1000, cacheRead: 9000, out: 10 } }), r("b", "fixed", { approvalCards: 0, tasks: 3, firstRound: { in: 2000, cacheRead: 0, out: 10 } }), r("c", "asked", { approvalCards: 1, tasks: 1 })]);
    expect(s.approvalCards).toBe(3);
    expect(s.tasks).toBe(5);
    expect(s.approvalsPerTask).toBeCloseTo(0.6);
    expect(s.casesWithApprovals).toBe(2);
    expect(s.medianFirstRoundIn).toBe(10000);
    expect(summaryLine(s)).toMatch(/3 approval cards in 5 tasks \(0\.6 a task\)/);
  });
});
