// The fix eval, dry: every case run through the whole pipeline (Point at the problem, a fix task through Companion's
// runner, the proof ladder, the project's checks again, the hidden checks) with a stand in that makes the known good fix.
// This proves every case is broken as it says, is found in the right place, can be fixed, and is judged by checks rather
// than by text. Wrong fixes are run too, so the scorer is shown to tell them apart. No model, nothing spent.
import { describe, expect, test } from "bun:test";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { CaseMeter } from "../lib/budget.ts";
import { DEFAULT_MODELS } from "../lib/harness.ts";
import { applySteps, copyProject, needMet, removeDir } from "../lib/project.ts";
import { scripted, stepsToTurns } from "../lib/session.ts";
import type { FixStep } from "../lib/project.ts";
import { FIX_ASK, fixPrompt, HIDDEN, loadCases, runFixCase, type LoadedCase } from "./pipeline.ts";
import { askedFor, classify, summarize, summaryLine } from "./score.ts";

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
      expect(r.notes.filter((n) => !/^Companion asked for approval/.test(n)), r.notes.join(" | ")).toEqual([]);
      expect(r.outcome).toBe(c.expect === "ask" ? "asked" : "fixed");
      if (c.where) expect(r.detail?.locatedRight, JSON.stringify(r.detail?.found)).toBe(true);
      expect(r.costUsd).toBe(0);
      expect(r.turns).toBeGreaterThan(0);
    }, 180_000);
  }
});

const turnsOf = (steps: FixStep[], say = "Done.") => scripted([stepsToTurns(steps, say)]);
// Started when the file loads, so they run beside the dry cases above; each test waits for its own.
const early = <T>(f: () => Promise<T>) => { const p = f(); p.catch(() => {}); return () => p; };

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
  test("the summary counts outcomes, cost per fixed case and fooled checks", () => {
    const r = (id: string, outcome: string, costUsd: number, detail: Record<string, unknown> = {}) => ({ id, outcome, costUsd, turns: 4, tokens: { in: 0, cacheRead: 0, out: 0 }, ms: 1, notes: [], detail });
    const s = summarize([r("a", "fixed", 0.2, { locatedRight: true }), r("b", "fixed", 0.2), r("c", "not_fixed", 0.2, { proofFooled: true, locatedRight: false }), r("d", "cannot_run", 0)]);
    expect(s.counts).toMatchObject({ fixed: 2, not_fixed: 1, cannot_run: 1 });
    expect(s.ran).toBe(3);
    expect(s.costPerFixedUsd).toBeCloseTo(0.3);
    expect(s.proofFooled).toBe(1);
    expect([s.locatedRight, s.locatedOf]).toEqual([1, 2]);
    expect(summaryLine(s)).toContain("fixed 2");
  });
});
