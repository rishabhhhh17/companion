// Bug bash (m48/launch, step 3): five pages bugs confirmed by reading the code, each pinned here before its fix.
import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { checkAnnounce, firstCheckVerdict } from "./onboarding.ts";
import { initial, reduce } from "./model.ts";
import { askRoute } from "./homeHero.ts";
import { forgetOutcome, forgetStart, forgetStep } from "./settings.ts";
import { growMs, homeNext } from "./homeShape.ts";
import { S } from "./strings.ts";

const read = (p: string) => readFileSync(new URL(p, import.meta.url), "utf8");
const NOTE = "pytest is not installed. To install it, run: pip install pytest";

describe("1. the first run shows what could not run on a partly checked result", () => {
  test("the engine's note reaches the point, the verdict line and the live line", () => {
    let m = reduce(initial(), { type: "ui.findProblem", fresh: true } as never);
    m = reduce(m, { v: 1, id: "e", ts: "2026-11-05T00:00:00Z", type: "problem.found", project: "/p/my-shop", agent: "builder-1", verdict: "passed_with_gaps", note: NOTE } as never);
    expect(m.point?.stage).toBe("gaps");
    const v = firstCheckVerdict(m.point as never, "my-shop")!;
    expect(v.headline).toBe(S.fr.checkGaps("my-shop"));
    expect(v.line).toContain(S.fr.checkGapsLine);
    expect(v.line).toContain(NOTE);
    expect(checkAnnounce("done", "my-shop", v, "")).toContain(NOTE);
  });
  test("with no note the line is the usual one", () => {
    expect(firstCheckVerdict({ stage: "gaps" }, "my-shop")!.line).toBe(S.fr.checkGapsLine);
    expect(firstCheckVerdict({ stage: "gaps", note: "  " }, "my-shop")!.line).toBe(S.fr.checkGapsLine);
  });
});

describe("2. Return and auto send do nothing while a job works", () => {
  test("askRoute says busy while working, before any send", () => {
    expect(askRoute({ prompt: "also make it bigger", project: "/p", newFolder: false, working: true })).toBe("busy");
    expect(askRoute({ prompt: "also make it bigger", project: "/p", newFolder: false, working: false })).toBe("here");
    // Empty words still ask for words; a new folder keeps its own busy check (startNew).
    expect(askRoute({ prompt: "", project: "/p", newFolder: false, working: true })).toBe("needWords");
    expect(askRoute({ prompt: "x", project: "/p", newFolder: true, working: true })).toBe("newFolder");
  });
  test("submit asks askRoute with working and keeps the words with one quiet line", () => {
    const card = read("./card.tsx");
    const body = card.slice(card.indexOf("const submit = () => {"), card.indexOf("const submitNow = useRef(submit)"));
    expect(body).toMatch(/askRoute\(\{ prompt, project, newFolder, working \}\)/);
    const busy = body.indexOf('route === "busy"');
    expect(busy).toBeGreaterThan(-1);
    expect(body.slice(busy, body.indexOf("\n", busy))).toContain("needWords(S.askBusy)");
    expect(busy).toBeLessThan(body.indexOf("startTask("));
    expect(S.askBusy).toMatch(/still in the box/);
  });
});

describe("3. Plan it and Look up say what to type with an empty box", () => {
  const card = read("./card.tsx");
  const fn = (start: string, end: string) => card.slice(card.indexOf(start), card.indexOf(end));
  test("Plan it", () => {
    const body = fn("const plan = () => {", "const hero = heroWords(");
    expect(body).toContain("if (!goal) { pressed(); needWords(S.planHint); return; }");
    expect(body.indexOf("needWords(S.planHint)")).toBeLessThan(body.indexOf("if (!goal || !project) return;"));
  });
  test("Look up", () => {
    const body = fn("const research = () => {", "const plan = () => {");
    expect(body).toContain("needWords(S.researchHint)");
    expect(body.indexOf("needWords(S.researchHint)")).toBeLessThan(body.indexOf("askResearch("));
  });
  test("the hints name the button and what to type", () => {
    expect(S.planHint).toContain(S.planIt);
    expect(S.researchHint).toContain(S.researchIt);
  });
});

describe("4. Forget everything says done only after both erases are answered", () => {
  // The runner answers each command with a memory.state that names it (answers) and carries its refusal (refused); the
  // separate memory.refused comes after it, for the Memory page's note (runner/src/agent.ts memoryCommand).
  const ev = (type: string, extra: Record<string, unknown> = {}) => ({ type, project: "/p", ...extra });
  const start = () => forgetStart(["e1", "e2"]);
  test("two answers with no refusal: done", () => {
    let t = start();
    t = forgetStep(t, ev("memory.state", { answers: "e1" }));
    expect(forgetOutcome(t)).toBeNull();
    t = forgetStep(t, ev("memory.state", { answers: "e2" }));
    expect(forgetOutcome(t)).toEqual({ ok: true });
  });
  test("a refused profile erase, in the runner's real order (state, then refused): its reason, never Forgotten", () => {
    const why = "Could not erase (EACCES: permission denied).";
    let t = start();
    t = forgetStep(t, ev("memory.state", { answers: "e1" }));
    t = forgetStep(t, ev("memory.state", { answers: "e2", refused: why }));
    expect(forgetOutcome(t)).toEqual({ ok: false, reason: why });
    // The memory.refused that follows changes nothing.
    expect(forgetStep(t, ev("memory.refused", { reason: why }))).toEqual(t);
  });
  test("a refused project erase shows its reason too", () => {
    const why = "The project's .companion folder is a link, so nothing was erased there.";
    let t = start();
    t = forgetStep(t, ev("memory.state", { answers: "e1", refused: why }));
    t = forgetStep(t, ev("memory.refused", { reason: why }));
    expect(forgetOutcome(t)).toBeNull();
    t = forgetStep(t, ev("memory.state", { answers: "e2" }));
    expect(forgetOutcome(t)).toEqual({ ok: false, reason: why });
  });
  test("a stray memory.state (a listing, a saved line, another erase) never counts as an answer", () => {
    let t = start();
    t = forgetStep(t, ev("memory.state", { answers: "e1" }));
    t = forgetStep(t, ev("memory.state"));
    t = forgetStep(t, ev("memory.state", { answers: "other" }));
    t = forgetStep(t, ev("memory.state", { answers: "e1" }));
    expect(forgetOutcome(t)).toBeNull();
  });
  test("an engine error on memory.erase counts as an answer with its reason", () => {
    let t = start();
    t = forgetStep(t, ev("protocol.error", { reason: "Could not erase (EACCES)", failed: "memory.erase" }));
    t = forgetStep(t, ev("memory.state", { answers: "e2" }));
    expect(forgetOutcome(t)).toEqual({ ok: false, reason: "Could not erase (EACCES)" });
  });
  test("other events change nothing", () => {
    expect(forgetStep(start(), ev("metrics.summary"))).toEqual(start());
    expect(forgetStep(start(), ev("protocol.error", { reason: "x", failed: "agent.start" }))).toEqual(start());
  });
  test("the page waits for the answers before it says Forgotten", () => {
    const page = read("./settingsPage.tsx");
    const body = page.slice(page.indexOf("const forget = () => {"), page.indexOf("const removeKey = () => {"));
    expect(body).toContain("forgetOutcome(");
    // Forgotten is said only from the outcome, never straight after the sends.
    expect(body).not.toMatch(/send\(eraseMemory\(p, "profile"\)\);\s*setStep\(""\); c\.say\(S\.danger\.forgetDone\)/);
    expect(body).toContain("S.danger.forgetNoAnswer");
  });
});

describe("5. Home's stage reaches open however it opened", () => {
  test("growMs: at once for a keyboard opening, short with less motion, the springs otherwise", () => {
    expect(growMs(true, false)).toBe(0);
    expect(growMs(true, true)).toBe(0);
    expect(growMs(false, true)).toBeGreaterThan(0);
    expect(growMs(false, true)).toBeLessThan(growMs(false, false));
    expect(growMs(false, false)).toBeLessThan(3000);
    expect(homeNext("opening", "shown")).toBe("open");
  });
  test("every opening sets a backstop that says shown", () => {
    const stage = read("./homeStage.tsx");
    const open = stage.slice(stage.indexOf("const open = (now = false"), stage.indexOf("return { geom, phase"));
    expect((open.match(/grownLater\(/g) ?? []).length).toBeGreaterThanOrEqual(2);
    expect(stage).toMatch(/const grownLater = \(now: boolean\) => \{[^}]*growMs\(now, reducedMotion\(\)\)/);
    expect(stage).toMatch(/homeNext\(p, "open"\)\); grownLater\(false\)/);
  });
});
