// The error explainer, as the card sees it: the light and the read happen in the app (errhelp.rs); the card shows each
// stage, then the two sentences, where it lives, Show me where and Fix it. Only the answer to this press counts.
import { describe, expect, test } from "bun:test";
import { parseCommand, serialize } from "../../protocol/index.ts";
import { ERROR_FIX_PROMPT, fixError } from "./commands.ts";
import { ehLines, initial, reduce, type Model } from "./model.ts";
import { S, PRODUCT } from "./strings.ts";

const ev = (o: Record<string, unknown>) => ({ v: 1, id: "e", ...o });
const run = (events: Record<string, unknown>[], from: Model = initial()) => events.reduce<Model>((m, e) => reduce(m, e as never), from);
const stage = (s: string, o: Record<string, unknown> = {}) => ev({ type: "app.explain_error", stage: s, ...o });
const where = { kind: "line", file: "src/App.tsx", line: 5, lineText: "const total: number = \"three\";", message: "Type 'string' is not assignable to type 'number'.", from: "selection" };
const answer = (o: Record<string, unknown> = {}) => ev({ type: "error.explained", req: "eh_1", project: "p", ok: true, sentences: ["A number was given words instead.", "Use a number on line 5."], where, excerpt: "src/App.tsx(5,9): error TS2322", evidence: "src/App.tsx(5,9): error TS2322: Type 'string' is not assignable to type 'number'.", usdEstimate: 0.0004, ...o });

describe("each stage on the card", () => {
  test("reading, then thinking for this press, then the answer", () => {
    let m = run([stage("reading", { app: "Terminal" })]);
    expect(ehLines(m)).toEqual(["Reading what you selected in Terminal."]);
    m = run([stage("thinking", { app: "Terminal", req: "eh_1" })], m);
    expect(m.eh).toMatchObject({ stage: "thinking", req: "eh_1", app: "Terminal" });
    m = reduce(m, answer() as never);
    expect(m.eh).toMatchObject({ stage: "ready", sentences: ["A number was given words instead.", "Use a number on line 5."], where: { file: "src/App.tsx", line: 5 } });
    expect(ehLines(m)).toEqual(["A number was given words instead.", "Use a number on line 5.", "It is in src/App.tsx, line 5."]);
  });
  test("an answer to an older press is ignored", () => {
    const m = run([stage("thinking", { app: "Terminal", req: "eh_2" }), answer()]);
    expect(m.eh?.stage).toBe("thinking");
    expect(run([answer()]).eh).toBeNull();
  });
  test("no explanation still shows where it is and why", () => {
    const m = run([stage("thinking", { req: "eh_1" }), answer({ ok: false, sentences: [], reason: "Explaining needs Claude, which is not connected here. You can still look at where it is, or press Fix it." })]);
    expect(m.eh?.stage).toBe("unexplained");
    expect(ehLines(m)).toEqual(["Explaining needs Claude, which is not connected here. You can still look at where it is, or press Fix it.", "It is in src/App.tsx, line 5."]);
  });
  test("only a confirmed line is offered to point at", () => {
    const m = run([stage("thinking", { req: "eh_1" }), answer({ where: { kind: "message", message: "boom", from: "selection" } })]);
    expect(m.eh?.where).toBeUndefined();
  });
  test("asking about an app, refusals, nothing selected and Accessibility, in plain words naming the right key", () => {
    expect(ehLines(run([stage("consent", { app: "Terminal" })]))[0]).toBe(`Allow ${PRODUCT} to read what you select in Terminal? The same answer covers Prompt help there.`);
    for (const why of ["secure_field", "secure_input", "never_app", "refused_by_you", "own_app", "no_engine", "something_new"]) {
      const l = ehLines(run([stage(why === "own_app" || why === "no_engine" || why === "something_new" ? "error" : "refused", { why })]));
      expect(l.length, why).toBe(1); expect(l[0], why).toMatch(/\.$/); expect(l[0]).not.toMatch(/undefined|—/);
    }
    expect(ehLines(run([stage("nothing_selected", { app: "Terminal" })]))[0]).toContain("Control, Option, Command and E");
    expect(ehLines(run([stage("needs_accessibility")]))[0]).toContain("Control, Option, Command and E");
  });
  test("closing, Stop everything, a restart or another folder clears it", () => {
    for (const end of [stage("dismissed"), ev({ type: "app.stop_everything" }), ev({ type: "app.runner_restarted" }), ev({ type: "ui.projectChanged" }), ev({ type: "ui.ehClosed" })]) {
      expect(run([stage("thinking", { req: "eh_1" }), answer(), end]).eh, JSON.stringify(end)).toBeNull();
    }
  });
});

describe("Fix it", () => {
  test("starts a normal task with the error as evidence and the place it points at", () => {
    const c = fixError("/Users/me/site", "src/App.tsx(5,9): error TS2322: Type 'string' is not assignable to type 'number'.", where as never) as any;
    expect(parseCommand(serialize(c)).ok).toBe(true);
    expect(c).toMatchObject({ type: "agent.start", project: "/Users/me/site", mode: "drive" });
    expect(c.prompt.startsWith(ERROR_FIX_PROMPT)).toBe(true);
    expect(c.prompt).toContain("error TS2322");
    expect(c.prompt).toContain("src/App.tsx, line 5");
    expect((fixError("/p", "boom") as any).prompt).not.toContain("line");
  });
  test("is off the record: text read from another app is never kept in a saved conversation or learned into memory", () => {
    expect((fixError("/Users/me/site", "NameError: name 'x' is not defined", where as never) as any).offTheRecord).toBe(true);
    expect((fixError("/p", "boom") as any).offTheRecord).toBe(true);
  });
  test("the card's words are in the strings file", () => {
    for (const k of ["ehTitle", "ehFix", "errKeyHint"] as const) expect(typeof S[k]).toBe("string");
    expect(S.ehWhere("src/App.tsx", 5)).toBe("It is in src/App.tsx, line 5.");
  });
});
