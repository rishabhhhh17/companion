// A task keeps going in the folder it started in when the person picks another folder on Home (M11 audit A52, 20 Oct
// 2026). Before this, its next step made a task with no folder on the new folder's Now, and its receipt was shown there
// with Undo and Show me what changed. Undo points are numbered per project (cp_0001, cp_0002...), so Undo restored the new
// folder's own undo point of that number and rewrote its files to an unrelated older state. Now Home knows the folder it
// shows, and nothing from a task that belongs to another folder (its steps, checks, receipt, picture or explanation) is
// shown until that agent starts again in the folder on screen. Its questions still show, named with their folder.
import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { AGENT } from "./commands.ts";
import { awayFolder, canFollowUp, cardWorking, initial, reduce, releasable, type Model } from "./model.ts";
import { S } from "./strings.ts";

const ev = (o: Record<string, unknown>) => ({ v: 1, id: "e", ...o });
const run = (events: Record<string, unknown>[], from: Model = initial()) => events.reduce<Model>((m, e) => reduce(m, e as never), from);
const A = "/Users/me/shop", B = "/Users/me/blog";
const state = (s: string) => ev({ type: "agent.state", agent: AGENT, state: s });
const cp = (project: string, checkpoint: string) => ev({ type: "checkpoint.created", project, agent: AGENT, checkpoint, label: "Before: fix the cart", files: 3, skipped: [] });
const tool = ev({ type: "agent.tool", agent: AGENT, tool: "Edit", summary: "Edit x.js", toolUseId: "t1", undoable: true, outcome: "ran" });
const proof = ev({ type: "proof.result", agent: AGENT, verdict: "passed", steps: [{ rung: "checks", label: "Running the tests", status: "passed", detail: "" }], tries: 1 });
const receipt = (checkpoint: string, o: Record<string, unknown> = {}) => ev({ type: "receipt", agent: AGENT, checkpoint, changed: [{ file: "x.js", kind: "modified" }], commands: 1, notUndoable: [], proof: "passed", usdEstimate: 0.1, changedAt: { file: "x.js", line: 3, lineText: "const a = 1;" }, ...o });
// Shop's task is running (its third undo point), then the person picks Blog from Recent.
const moved = run([ev({ type: "ui.folderShown", project: A }), cp(A, "cp_0003"), state("working"), ev({ type: "ui.projectChanged", project: B })]);

describe("A52: a task from the folder before never shows on the new folder's Now", () => {
  test("its steps, checks and receipt are not shown, so there is no Undo for the wrong project", () => {
    const m = run([tool, ev({ type: "cost.update", agent: AGENT, usdEstimate: 0.08, basis: "x", tokens: { in: 1, cacheRead: 0, out: 1 } }), proof, receipt("cp_0003"), state("done")], moved);
    expect(m.receipt).toBeNull();
    expect(m.task).toBeNull();
    expect(canFollowUp(m, B)).toBe(false);
  });
  test("its picture and its explanation are not shown either", () => {
    const m = run([receipt("cp_0003"), ev({ type: "receipt.visual", agent: AGENT, project: A, checkpoint: "cp_0003", made: true, image: "abc", caption: "x", circles: 0 }), ev({ type: "explain.ready", agent: AGENT, checkpoint: "cp_0003", bullets: ["b"], usdEstimate: 0 })], moved);
    expect(m.receipt).toBeNull();
    expect(m.explain).toBeNull();
  });
  test("while it works, Home says it keeps going in the folder it started in", () => {
    expect(awayFolder(moved)).toBe("me/shop");
    expect(S.awayWorking("me/shop")).toContain("me/shop");
    const card = readFileSync(new URL("./card.tsx", import.meta.url), "utf8");
    expect(card).toContain("{awayFolder(m) && <div className=\"line muted\" role=\"status\">{S.awayWorking(awayFolder(m)!)}</div>}");
  });
  test("when it ends, Home says where to find what it did, and is not left waiting on it", () => {
    // Its question cannot be answered here (its receipt is not shown), so Home asks the engine to let the agent rest.
    const ended = run([receipt("cp_0003", { said: "Which colour?", asks: true }), state("needsYou")], moved);
    expect(ended.notice).toBe(S.awayFinished("me/shop"));
    expect(releasable(ended, AGENT)).toBe(true);
    const card = readFileSync(new URL("./card.tsx", import.meta.url), "utf8");
    expect(card).toContain("const awayRest = Object.keys(m.away).filter((a) => releasable(m, a)).join(\"|\");");
    expect(card).toContain("for (const a of awayRest.split(\"|\").filter(Boolean)) void send(releaseAgent(a));");
    // The engine's answer: the agent rests, Home is free, and the line about the other folder goes.
    const m = run([state("idle")], ended);
    expect(m.agents[AGENT]).toBe("idle");
    expect(cardWorking(m)).toBe(false);
    expect(awayFolder(m)).toBeNull();
    expect(m.away).toEqual({});
  });
  test("a Drive plan that carries on in the folder before is not shown here either", () => {
    const m = run([cp(A, "cp_0004"), tool, receipt("cp_0004")], moved);
    expect(m.task).toBeNull();
    expect(m.receipt).toBeNull();
  });
  test("its question still shows, with the folder it is about, and it still holds the agent", () => {
    const m = run([ev({ type: "approval.request", approval: "ap_1", agent: AGENT, checkpoint: "cp_0003", toolUseId: "t", risk: "git", title: "Run git push?", expiresAt: "2999-01-01T00:00:00Z" }), state("needsYou")], moved);
    expect(m.approvals.map((a) => a.id)).toEqual(["ap_1"]);
    expect(m.agents[AGENT]).toBe("needsYou");
    const card = readFileSync(new URL("./card.tsx", import.meta.url), "utf8");
    expect(card).toContain("{m.away[a.agent] && <div className=\"line muted\">{S.awayQuestion(folderName(m.away[a.agent]))}</div>}");
  });
  test("a task started in the folder on screen shows as before, with its own receipt", () => {
    const m = run([receipt("cp_0003"), state("idle"), cp(B, "cp_0006"), state("working"), tool, receipt("cp_0006")], moved);
    expect(m.task?.project).toBe(B);
    expect(m.receipt?.checkpoint).toBe("cp_0006");
    expect(m.task?.lines).toHaveLength(1);
  });
  test("an agent that had finished in the folder before is not held back in the new one: its plan there shows", () => {
    const looked = run([ev({ type: "ui.folderShown", project: A }), state("thinking"), tool, ev({ type: "research.done", agent: AGENT, title: "t", answer: "a", notes: [] }), state("idle"), ev({ type: "ui.projectChanged", project: B })]);
    expect(looked.away).toEqual({});
    const m = run([state("thinking"), tool, ev({ type: "plan.ready", agent: AGENT, steps: [{ id: 1, title: "Make the page" }], truncated: false, estimateUsd: 0.2 }), state("needsYou")], looked);
    expect(m.plan?.steps).toEqual(["Make the page"]);
    expect(run([state("thinking"), tool], looked).task?.lines).toHaveLength(1);   // and what it does while it looks
  });
  test("a task that had just begun when the folder changed is away even before its agent says it works", () => {
    const m = run([ev({ type: "ui.folderShown", project: A }), cp(A, "cp_0003"), ev({ type: "ui.projectChanged", project: B }), state("working"), tool, receipt("cp_0003")]);
    expect(m.receipt).toBeNull();
  });
  test("back in the folder the task works in, its receipt shows again, for that folder", () => {
    const m = run([ev({ type: "ui.projectChanged", project: A }), tool, receipt("cp_0003")], moved);
    expect(m.away).toEqual({});
    expect(m.task?.project).toBe(A);
    expect(m.receipt?.checkpoint).toBe("cp_0003");
  });
  test("with the folder not known yet (nothing changed it), nothing is dropped", () => {
    const m = run([cp(A, "cp_0003"), tool, receipt("cp_0003")]);
    expect(m.receipt?.checkpoint).toBe("cp_0003");
  });
  test("the folder Home starts with is told to the model without clearing anything", () => {
    const card = readFileSync(new URL("./card.tsx", import.meta.url), "utf8");
    expect(card).toContain("void invoke(\"get_project\").then((p) => { setProject(String(p ?? \"\")); dispatch({ type: \"ui.folderShown\", project: String(p ?? \"\") }); });");
    const m = run([cp(A, "cp_0001"), ev({ type: "ui.folderShown", project: A })]);
    expect(m.task?.project).toBe(A);
    expect(m.folder).toBe(A);
  });
});
