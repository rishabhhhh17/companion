// M75, features batch one (docs/milestones/M75-features-one.md): the pages' side. The vague ask rule and its choices, the
// cost pause card (no amounts, Stop everything clears it), the sign in handover card (never proven while it waits), the
// private page finding in the fixed shape, the done signal's card words, and where the new settings live.
import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { REVIEW_REASONS } from "../../protocol/index.ts";
import { initial, reduce, type Model } from "./model.ts";
import { FINDING_LEVEL, findingParts, privateOpenFindings } from "./findingShape.ts";
import { doneAsk, doneStateFrom } from "./doneSignal.ts";
import { need } from "./home.ts";
import { isVague, vagueChoices, vagueStateOf } from "./vagueAsk.ts";
import { mainKeys, moreKeys, placeOf, SIDEBAR } from "./settingsPages.ts";
import { S } from "./strings.ts";

const read = (p: string) => readFileSync(new URL(p, import.meta.url), "utf8");
const ev = (m: Model, e: Record<string, unknown>) => reduce(m, { v: 1, id: "e", ...e } as never);
const NO_CENTS = /\$|\d+\s*(c|cents?|dollars?)\b|\d+\.\d\d/i;
const NO_DASH = /—|–/;

describe("vague asks", () => {
  test("the examples are vague", () => {
    for (const t of ["make it better", "Fix it", "clean this up", "fix it please", "make it nicer", "Can you improve this?", "tidy up the code", "make the app better", "fix", "polish it a bit"]) expect(isVague(t), t).toBe(true);
  });
  test("specific asks, file names, numbers, quotes and long asks are not", () => {
    for (const t of ["fix the login button", "make the header blue", "fix app.tsx", "make it 2 columns", 'change "Buy" to "Order"', "make it better and also add a dark mode toggle to the settings", "add a contact form", "why does it crash", "", "   ", "make the page faster", "fix src/pay.ts"]) expect(isVague(t), t).toBe(false);
  });
  test("two to four choices, built from real state, with Do it as I typed it always last", () => {
    const empty = vagueChoices("make it better", {});
    expect(empty.length).toBeGreaterThanOrEqual(3);
    expect(empty.at(-1)).toMatchObject({ kind: "asTyped", prompt: "make it better" });
    expect(empty.slice(0, -1).length).toBeGreaterThanOrEqual(2);
    const full = vagueChoices("fix it", { failing: "Running the tests", finding: "A secret password is written into the code.", changes: 3, hasPage: true });
    expect(full.length).toBe(4);
    expect(full[0]).toMatchObject({ id: "failing", kind: "task" });
    expect(full[0]!.words).toContain("Running the tests");
    expect(full[1]).toMatchObject({ id: "finding" });
    expect(full[2]).toMatchObject({ id: "review", kind: "review" });
    const clean = vagueChoices("clean this up", { hasPage: true });
    expect(clean[0]).toMatchObject({ id: "tidy" });
    const better = vagueChoices("make it better", { hasPage: true });
    expect(better.map((c) => c.id).slice(0, 2)).toEqual(["look", "fast"]);
    for (const c of [...full, ...clean, ...better]) expect(c.words).not.toMatch(NO_DASH);
  });
  test("the state is read for the project on screen only, from fixed words", () => {
    const m = { task: { project: "/p", proof: { verdict: "failed", steps: [{ rung: "tests", label: "Running the tests", status: "failed" }] } }, review: { project: "/p", stage: "reviewed", count: 2, result: { reasons: [{ kind: "secret_in_code" }] } } };
    expect(vagueStateOf(m, "/p")).toEqual({ failing: "Running the tests", finding: S.homeNow.reviewHead.secret_in_code![0], changes: 0, hasPage: false });
    expect(vagueStateOf(m, "/other")).toEqual({ failing: null, finding: null, changes: 0, hasPage: false });
  });
  test("nothing is sent without a tap: the ask box stops on a vague ask and keeps the words", () => {
    const card = read("./card.tsx");
    const at = card.indexOf("isVague(prompt)");
    expect(at).toBeGreaterThan(0);
    const line = card.slice(at, card.indexOf("\n", at));
    expect(line).toContain("setVague(vagueChoices(");
    expect(line).toContain("return;");
    expect(line).not.toContain("send(");
    expect(card).toContain('setting("ask.choices") !== false');
  });
});

describe("the cost pause card", () => {
  test("its words carry no amount, no cents and no dash", () => {
    for (const w of [S.costPause.title, S.costPause.line, S.costPause.keep, S.costPause.stop, S.costPause.undo, S.costPause.undoLine, ...Object.values(S.costPause.resolved)]) { expect(w).not.toMatch(NO_CENTS); expect(w).not.toMatch(NO_DASH); }
    expect(S.costPause.title).toBe("This one is taking a lot more than usual. Keep going?");
  });
  test("it waits on the person, Stop everything clears it, and its answer clears it", () => {
    let m = ev(initial(), { type: "cost.pause", agent: "a", project: "/p" });
    expect(m.costPause).toEqual({ agent: "a" });
    expect(need(m)).toMatchObject({ question: true, why: S.costPause.title });
    expect(ev(m, { type: "app.stop_everything" }).costPause).toBeNull();
    m = ev(m, { type: "cost.resolved", agent: "a", choice: "stop" });
    expect(m.costPause).toBeNull();
    expect(m.notice).toBe(S.costPause.resolved.stop);
  });
  test("the card has the three buttons, Keep going the main one, and sends only on a press", () => {
    const card = read("./card.tsx");
    const at = card.indexOf('className="panel amber cost-pause"');
    const block = card.slice(at, card.indexOf("</section>", at));
    for (const c of ['"keep"', '"stop"', '"undo"']) expect(block).toContain(`chooseCost(m.costPause!.agent, ${c})`);
    expect(block.indexOf("btn primary")).toBeLessThan(block.indexOf('"stop"'));
    expect(block.match(/onClick/g)?.length).toBe(3);
  });
});

describe("the sign in handover card", () => {
  test("it says the person's turn and is never proven while it waits", () => {
    let m = ev(initial(), { type: "proof.signIn", agent: "a", stage: "waiting" });
    expect(m.signIn).toMatchObject({ agent: "a", stage: "waiting" });
    expect(need(m)?.why).toBe("Your turn: sign in, then tap Continue, or skip this check.");
    m = ev(m, { type: "proof.signIn", agent: "a", stage: "opened" });
    expect(m.signIn?.stage).toBe("opened");
    expect(m.task?.proof?.verdict).toBeUndefined();
    const skipped = ev(m, { type: "proof.signIn", agent: "a", stage: "skipped" });
    expect(skipped.signIn).toBeNull();
    expect(skipped.notice).toContain("not proven");
    expect(ev(m, { type: "app.stop_everything" }).signIn).toBeNull();
  });
  test("its words never offer to type or read a password", () => {
    for (const w of Object.values(S.signInTurn).filter((x) => typeof x === "string") as string[]) { expect(w).not.toMatch(NO_DASH); expect(w).not.toMatch(/we('| wi)ll type|enter your password here/i); }
    expect(S.signInTurn.never).toMatch(/never types your password/);
  });
});

describe("a page that should need a sign in", () => {
  test("it is a Worth a look kind with all four parts", () => {
    expect((REVIEW_REASONS as readonly string[]).includes("open_private_page")).toBe(true);
    expect(FINDING_LEVEL.open_private_page).toBe("look");
    const p = findingParts("open_private_page", "");
    expect(p.wrong).toBe("This page should need a sign in but does not.");
    expect(p.means && p.how && p.fine).toBeTruthy();
    const f = privateOpenFindings(["/dashboard", "/settings"]);
    expect(f).toHaveLength(1);
    expect(f[0]!.parts.detail).toContain("/dashboard");
    expect(privateOpenFindings([])).toEqual([]);
  });
  test("the task's result keeps the paths, and only paths", () => {
    let m = ev(initial(), { type: "checkpoint.created", project: "/p", agent: "a", checkpoint: "cp_1", label: "Before: x", files: 1, skipped: [] });
    m = ev(m, { type: "proof.result", agent: "a", verdict: "passed", steps: [], tries: 1, privateOpen: ["/dashboard", 3] });
    expect(m.task?.proof?.privateOpen).toEqual(["/dashboard"]);
  });
});

describe("the done signal", () => {
  test("the card shows exactly the file and the lines before the yes, and Codex's trust step", () => {
    const st = doneStateFrom({ type: "donesignal.state", project: "/p", tools: [{ tool: "claude", on: false, file: ".claude/settings.local.json", adds: '{"hooks":{}}', creates: true }, { tool: "codex", on: true, file: ".codex/hooks.json", adds: "{}", creates: false }] }, "/p")!;
    expect(st.tools).toHaveLength(2);
    const a = doneAsk(st.tools[0]!);
    expect(a.where).toContain(".claude/settings.local.json");
    expect(a.what).toBe('{"hooks":{}}');
    expect(a.notes.join(" ")).not.toMatch(/codex/i);
    expect(doneAsk(st.tools[1]!).notes.join(" ")).toContain("/hooks");
    expect(doneStateFrom({ type: "donesignal.state", project: "/other", tools: [] }, "/p")).toBeNull();
  });
  test("only the card's yes sends the add", () => {
    const page = read("./settingsPage.tsx");
    expect(page.match(/addDoneSignal\(/g)?.length).toBe(1);
    const at = page.indexOf("addDoneSignal(project");
    expect(page.slice(at - 200, at)).toContain("kind=\"primary\"");
  });
});

describe("where the new settings live", () => {
  test("each has one place", () => {
    const all = SIDEBAR.flatMap((p) => [...mainKeys(p), ...moreKeys(p)]);
    for (const k of ["spend.pauseAt", "check.privatePages", "ask.choices"]) expect(all.filter((x) => x === k).length, k).toBe(1);
    expect(placeOf("spend.pauseAt")).toMatchObject({ page: "account", more: false });
    expect(placeOf("doneSignal")).toMatchObject({ page: "fixing", more: false });
    expect(placeOf("check.privatePages")).toMatchObject({ topic: "more.fixing.checks" });
    expect(placeOf("ask.choices")).toMatchObject({ topic: "more.fixing.run" });
    expect(placeOf("doneSignal")).toMatchObject({ group: "fixing.done" });
  });
});
