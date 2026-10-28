// M15 wave 2: a check panel shows a plain summary and the file and line; the check's own output goes behind Details.
import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { checkParts } from "./checkDetail.tsx";
import { initial, reduce } from "./model.ts";
import { S } from "./strings.ts";

const card = readFileSync(new URL("./card.tsx", import.meta.url), "utf8");
const comp = readFileSync(new URL("./checkDetail.tsx", import.meta.url), "utf8");
const at = { kind: "line" as const, file: "src/App.tsx", line: 12, lineText: "x", message: "m", from: "checks" };

describe("a check's result in plain words", () => {
  test("a failed step leads with the engine's summary and the place, the raw output behind Details", () => {
    const p = checkParts({ status: "failed", detail: "build failed. src/App.tsx(12,3): error TS2304: Cannot find name 'x'.\nexit code 2", summary: "The build did not pass.", problem: at });
    expect(p.summary).toBe("The build did not pass.");
    expect(p.place).toBe(S.ehWhere("src/App.tsx", 12));
    expect(p.raw).toContain("error TS2304");
    expect(p.summary + p.place).not.toMatch(/exit code|TS2304/);
  });
  test("with no summary: the first sentence when it reads plainly, otherwise 'It did not pass.'", () => {
    expect(checkParts({ status: "failed", detail: "The tests did not pass. FAIL a.test.ts\nexpected 1" }).summary).toBe("The tests did not pass.");
    expect(checkParts({ status: "failed", detail: "The tests did not pass. FAIL a.test.ts\nexpected 1" }).raw).toBe("FAIL a.test.ts\nexpected 1");
    const raw = checkParts({ status: "failed", detail: "TypeError: x is undefined at /a/b.ts:3" });
    expect(raw.summary).toBe(S.checkDidNotPass);
    expect(raw.raw).toBe("TypeError: x is undefined at /a/b.ts:3");
  });
  test("a step that did not fail is its own plain sentence, with nothing behind Details", () => {
    expect(checkParts({ status: "skipped", detail: "This project has no tests to run." })).toEqual({ summary: "This project has no tests to run.", place: "", raw: "" });
    expect(checkParts({ status: "passed", detail: "The tests passed." })).toEqual({ summary: "", place: "", raw: "" });
  });
  test("the model keeps the engine's summary and place from proof.step", () => {
    const m = reduce(reduce(initial(), { type: "agent.state", agent: "builder-1", state: "working" }), { type: "task.started", agent: "builder-1", project: "/p", label: "x" });
    const withTask = m.task ? m : { ...m, task: { project: "/p", label: "x", lines: [], proof: undefined } as any };
    const after = reduce(withTask, { type: "proof.step", agent: "builder-1", rung: "checks", label: "Build", status: "failed", detail: "d", summary: "The build did not pass.", problem: at });
    expect(after.task?.proof?.steps[0]).toMatchObject({ summary: "The build did not pass.", problem: at });
  });
  test("both check panels use it, and Details is a native disclosure the keyboard opens", () => {
    expect(card).toContain("<CheckDetail parts={checkParts(s)} />");
    expect(card).toContain("<CheckDetail parts={checkParts(e)} />");
    expect(card).not.toContain('s.status !== "passed" && s.detail ? <span className="muted"> {s.detail}</span>');
    expect(comp).toContain("<details className=\"raw\">\n          <summary>{S.checkDetails}</summary>");
  });
});
