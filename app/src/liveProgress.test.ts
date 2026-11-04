// M55 section 2, live progress (tests first, rule 17). The work card shows what is happening as it happens, and only what
// the engine said happened (rule 14): each of the four steps ticks the moment it finishes, the files appear one by one as
// the agent's tools really change them (agent.file), each check shows running, passed or failed as it goes, and the time
// and the cost tick. The notch shows the step too, in a word, with a thin line of the four steps under it, quiet: nothing
// on it loops, and it only moves when a step changes.
import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { ALL_CSS } from "./ui/cssFiles.ts";
import { initial, reduce, type Model } from "./model.ts";
import { jobLive, jobStep, liveFiles, LIVE_FILES_MAX } from "./homeHero.ts";
import { islandWings } from "./home.ts";
import { notchStep } from "./islandPanel.ts";
import { S } from "./strings.ts";

const read = (p: string) => readFileSync(new URL(p, import.meta.url), "utf8");
const card = read("./card.tsx"), island = read("./island.tsx"), live = read("./jobLive.tsx"), css = ALL_CSS();
const ev = (o: Record<string, unknown>) => ({ v: 1, id: "e", ...o });
const run = (events: Record<string, unknown>[], from: Model = { ...initial(), runnerUp: true }) => events.reduce<Model>((m, e) => reduce(m, e as never), from);
const task = (agent = "a") => [ev({ type: "checkpoint.created", project: "/p", agent, checkpoint: "cp_1", label: "Before: fix the signup button", files: 3, skipped: [] }), ev({ type: "agent.state", agent, state: "working" })];
const file = (f: string, kind = "modified", agent = "a") => ev({ type: "agent.file", agent, file: f, kind });
const tool = (t: string, id: string, outcome = "ran") => ev({ type: "agent.tool", agent: "a", toolUseId: id, tool: t, summary: `${t}: /p/src/x.js`, undoable: true, outcome });
const check = (rung: string, status: string) => ev({ type: "proof.step", agent: "a", rung, label: { install: "Installing", build: "Building it", tests: "Running the tests", browser: "Opening it in a browser" }[rung] ?? rung, status, detail: "" });
const result = (verdict: string) => ev({ type: "proof.result", agent: "a", verdict, steps: [], tries: 1 });
const checking = ev({ type: "agent.state", agent: "a", state: "checking" });
const receipt = (o: Record<string, unknown> = {}) => ev({ type: "receipt", agent: "a", checkpoint: "cp_1", changed: [{ file: "src/x.js", kind: "modified" }], commands: 0, notUndoable: [], usdEstimate: 0.05, proof: "passed", ended: "done", ...o });

describe("the files appear one by one, only as the engine says each one really changed", () => {
  test("in the order they changed, each with how it changed", () => {
    const m = run([...task(), file("src/signup.js"), file("src/components/Form.jsx", "added"), file("old.css", "deleted")]);
    expect(m.task?.files).toEqual([{ file: "src/signup.js", kind: "modified" }, { file: "src/components/Form.jsx", kind: "added" }, { file: "old.css", kind: "deleted" }]);
  });
  test("a file changed again keeps its place, and says how it changed over the whole task", () => {
    const m = run([...task(), file("a.js", "added"), file("b.js"), file("a.js"), file("b.js", "deleted"), file("c.js", "deleted"), file("c.js", "added")]);
    expect(m.task?.files).toEqual([{ file: "a.js", kind: "added" }, { file: "b.js", kind: "deleted" }, { file: "c.js", kind: "modified" }]);
    // Made and taken away again in the same task: nothing changed, so it is not listed.
    expect(run([...task(), file("tmp.js", "added"), file("tmp.js", "deleted")]).task?.files).toEqual([]);
  });
  test("never for work in another folder, another agent, no task, a new task, or a line that is not a file", () => {
    expect(run([file("a.js")]).task).toBeNull();
    expect(run([...task(), file("a.js", "modified", "other")]).task?.files ?? []).toEqual([]);
    const away = run([...task(), ev({ type: "checkpoint.created", project: "/elsewhere", agent: "b", checkpoint: "cp_2", label: "Before: x", files: 1, skipped: [] }), file("a.js", "modified", "b")], { ...initial(), runnerUp: true, folder: "/p" });
    expect(away.task?.files ?? []).toEqual([]);
    for (const bad of [file("/abs/a.js"), file("../a.js"), file(""), ev({ type: "agent.file", agent: "a", file: 3, kind: "modified" }), file("a.js", "renamed")]) expect(run([...task(), bad]).task?.files ?? []).toEqual([]);
    expect(run([...task(), file("a.js"), ...task()]).task?.files ?? []).toEqual([]);
  });
  test("the card shows the newest few, oldest first, and how many more there are", () => {
    const names = Array.from({ length: LIVE_FILES_MAX + 3 }, (_, i) => `f${i}.js`);
    const m = run([...task(), ...names.map((n) => file(n))]);
    const v = liveFiles(m);
    expect(v.shown.map((f) => f.file)).toEqual(names.slice(-LIVE_FILES_MAX));
    expect(v.more).toBe(3);
    expect(liveFiles(run(task()))).toEqual({ shown: [], more: 0 });
  });
});

describe("each of the four steps ticks the moment the engine says it finished, never before (rule 14)", () => {
  test("Finding while it reads; a refused, denied or waiting edit is not yet Fixing", () => {
    expect(jobStep(run(task())).step).toBe(0);
    for (const o of ["blocked", "denied", "needs_approval"]) expect(jobStep(run([...task(), tool("Edit", "t1", o)])).step, o).toBe(0);
  });
  test("Fixing once an edit was let through, or a file really changed", () => {
    expect(jobStep(run([...task(), tool("Edit", "t1")])).step).toBe(1);
    expect(jobStep(run([...task(), file("a.js")])).step).toBe(1);
  });
  test("Checking while the checks run, and still Checking once they passed, until the result is proven; then all four tick", () => {
    expect(jobStep(run([...task(), file("a.js"), checking, check("build", "running")])).step).toBe(2);
    // The review, 3 Nov 2026: step 3 under way read "Proven" before the engine said so (rule 14). All checks passed is not
    // proven yet (Stop or a spending limit can still end it), so the card and the notch stay on Checking until the receipt.
    expect(jobStep(run([...task(), file("a.js"), checking, check("build", "passed"), result("passed")])).step).toBe(2);
    // Partly checked (a check could not run) is never shown past Checking: the result says what it means.
    expect(jobStep(run([...task(), file("a.js"), checking, check("browser", "skipped"), result("passed_with_gaps")])).step).toBe(2);
    expect(jobStep(run([...task(), file("a.js"), checking, result("passed"), receipt(), ev({ type: "agent.state", agent: "a", state: "done" })])).step).toBe(4);
    expect(jobStep(run([...task(), file("a.js"), checking, result("passed"), receipt({ proof: "partial" }), ev({ type: "agent.state", agent: "a", state: "done" })])).step).toBeLessThan(4);
  });
  test("a failed check steps back to Fixing and says which try", () => {
    const m = run([...task(), file("a.js"), checking, check("tests", "failed"), result("failed"), ev({ type: "agent.state", agent: "a", state: "working" })]);
    expect(jobStep(m)).toEqual({ step: 1, retry: S.home.tryingAgain(2, 3) });
  });
});

describe("what the live part of the work card shows at each step", () => {
  test("nothing extra while Finding; the files while Fixing; the checks while Checking", () => {
    expect(jobLive(run(task()))).toEqual({ kind: "none" });
    expect(jobLive(run([...task(), tool("Edit", "t1")]))).toEqual({ kind: "none" });
    const fixing = jobLive(run([...task(), file("a.js")]));
    expect(fixing.kind).toBe("files");
    const c = jobLive(run([...task(), file("a.js"), checking, check("install", "passed"), check("build", "running")]));
    expect(c).toEqual({ kind: "checks", checks: [{ rung: "install", label: "Installing", status: "passed" }, { rung: "build", label: "Building it", status: "running" }] });
  });
  test("after a failed check it is fixing again: the files, while the failed check is said in the checks card", () => {
    const m = run([...task(), file("a.js"), checking, check("tests", "failed"), result("failed"), ev({ type: "agent.state", agent: "a", state: "working" })]);
    expect(jobLive(m).kind).toBe("files");
  });
  test("the card draws them, and says the step under way only where the list does not already say it", () => {
    expect(card).toMatch(/<JobLive view=\{live\} \/>/);
    // The review, 3 Nov 2026: "Changing signup.js" sat right over the list row "signup.js". While a list shows, the line
    // under way is left out, except a new try, which only that line says.
    expect(card).toMatch(/\(live\.kind === "none" \|\| js\.retry\) && <p className="job-now"><Said \{\.\.\.jobNowSays\(jobNowWords\(m, js\.retry, lines\)\)\} \/><\/p>/);
    // Every step's state is drawn from jobStep, the four of them done once the result is proven.
    expect(card).toMatch(/data-state=\{i < js\.step \? "done" : i === js\.step \? "now" : undefined\}/);
  });
  test("each check row says its state in words for VoiceOver, with a mark that holds still while it runs", () => {
    expect(live).toMatch(/S\.stepRunning/);
    expect(live).toMatch(/S\.stepPassed/);
    expect(live).toMatch(/S\.stepFailed/);
    expect(live).toMatch(/S\.stepSkipped/);
    expect(live).toMatch(/S\.home\.filesSoFar/);
    expect(live).toMatch(/S\.home\.moreFiles/);
  });
});

describe("the work card ticks live, calm (nothing loops, every move from the tokens, none with motion reduced)", () => {
  const rule = (sel: string) => { const at = css.indexOf(`${sel} {`); expect(at, sel).toBeGreaterThan(-1); return css.slice(at, css.indexOf("}", at)); };
  test("a step's tick draws in once when the step finishes, on the entrance tokens", () => {
    expect(rule(".job-strip li[data-state=\"done\"] .job-label .ic")).toMatch(/animation: job-tick var\(--dur-enter\) var\(--ease-out\) both/);
    expect(css).toMatch(/@keyframes job-tick \{/);
  });
  test("a file or a check that arrives grows in once; a check's mark changes colour, never spins", () => {
    expect(rule(".job-live li")).toMatch(/animation: job-row-in var\(--dur-enter\) var\(--ease-out\) both/);
    expect(css).toMatch(/@keyframes job-row-in \{/);
    expect(rule(".job-mark")).toMatch(/transition: (background-color|color)/);
    const block = css.slice(css.indexOf("/* M55 live progress */"), css.indexOf("/* end M55 live progress */"));
    expect(block.length).toBeGreaterThan(100);
    expect(block).not.toMatch(/infinite/);
  });
  test("with Reduce motion or Less motion everything is simply there (the page wide rules stop every animation)", () => {
    expect(css).toMatch(/@media \(prefers-reduced-motion: reduce\) \{ \*, \*::before, \*::after \{ animation: none !important; transition-property: opacity, color, background-color, border-color, outline-color, fill, stroke !important;/);
    expect(css).toMatch(/:root\[data-less-motion\] \*, :root\[data-less-motion\] \*::before, :root\[data-less-motion\] \*::after \{ animation: none !important; transition-property: opacity,/);
  });
});

describe("the notch says the step in a word, with a thin line of the four steps, only while a job works", () => {
  const at = (events: Record<string, unknown>[]) => { const m = run(events); return notchStep(m, islandWings(m)); };
  test("the word and the line follow the work card's own steps", () => {
    expect(at(task())).toEqual({ word: "Finding", marks: ["now", "ahead", "ahead", "ahead"] });
    expect(at([...task(), file("a.js")])).toEqual({ word: "Fixing", marks: ["done", "now", "ahead", "ahead"] });
    expect(at([...task(), file("a.js"), checking, check("build", "running")])).toEqual({ word: "Checking", marks: ["done", "done", "now", "ahead"] });
    // Checks passed but no proven result yet: still Checking. "Proven" is never said while it works (rule 14).
    expect(at([...task(), file("a.js"), checking, result("passed")])).toEqual({ word: "Checking", marks: ["done", "done", "now", "ahead"] });
  });
  test("the notch never says Proven: the step it shows is one under way, and Proven is only ever a result", () => {
    const passedThenStopped = [...task(), file("a.js"), checking, check("build", "passed"), result("passed")];
    expect(at(passedThenStopped)?.word).not.toBe(S.home.steps[3]);
    expect(at([...passedThenStopped, receipt({ ended: "stopped" }), ev({ type: "agent.state", agent: "a", state: "idle" })])).toBeNull();
    expect(at([...passedThenStopped, receipt(), ev({ type: "agent.state", agent: "a", state: "done" })])).toBeNull();
  });
  test("never when nothing works, a question waits, it listens, it looks at the screen, or the job is done", () => {
    expect(at([])).toBeNull();
    expect(at([...task(), ev({ type: "approval.request", approval: "ap_1", agent: "a", checkpoint: "cp_1", toolUseId: "t", risk: "git", title: "x", expiresAt: "2999-01-01T00:00:00Z" })])).toBeNull();
    expect(at([...task(), ev({ type: "app.voice", stage: "listening" })])).toBeNull();
    expect(at([...task(), file("a.js"), checking, result("passed"), receipt(), ev({ type: "agent.state", agent: "a", state: "done" })])).toBeNull();
    const m = run(task());
    expect(notchStep({ ...m, showme: { stage: "looking" } as never }, islandWings({ ...m, showme: { stage: "looking" } as never }))).toBeNull();
  });
  test("the island draws it only with Show the step on the notch on, and asks the app for wings wide enough for the longest word", () => {
    expect(island).toMatch(/useSetting\("island\.showStep"\) !== false/);
    expect(island).toMatch(/invoke\("island_alert", \{ on: wingsOut, panel: panelH, cheer: cheering, ask: ask \|\| helloOn, wing: wingW \}\)/);
    // The wings are as wide as the longest of the four words needs, so they grow once when work starts, never at each step.
    expect(island).toMatch(/S\.home\.steps\.map/);
  });
  test("the line on the notch only changes colour when a step changes: no loop, no sound", () => {
    const seg = css.slice(css.indexOf(".island-step-line i {"), css.indexOf("}", css.indexOf(".island-step-line i {")));
    expect(seg).toMatch(/transition: background-color var\(--dur-2\)/);
    expect(seg).not.toMatch(/animation/);
    expect(island).not.toMatch(/new Audio|play\(\)/);
  });
});
