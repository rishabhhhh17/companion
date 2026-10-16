import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { parseCommand, parseEvent, serialize, PROTOCOL_VERSION } from "../../protocol/index.ts";

const lines = (f: string) => readFileSync(new URL(`../../protocol/fixtures/${f}`, import.meta.url), "utf8").split("\n").filter(Boolean);

describe("protocol v1 fixtures", () => {
  test("every command fixture parses", () => {
    for (const l of lines("commands.jsonl")) {
      const r = parseCommand(l);
      expect(r.ok, l).toBe(true);
    }
  });
  test("every event fixture parses", () => {
    for (const l of lines("events.jsonl")) {
      const r = parseEvent(l);
      expect(r.ok, l).toBe(true);
    }
  });
  test("serialize then parse gives the same message", () => {
    for (const l of lines("commands.jsonl")) {
      const r = parseCommand(l);
      if (!r.ok) throw new Error("fixture broke");
      expect(parseCommand(serialize(r.msg))).toEqual(r);
    }
  });
});

describe("protocol refuses what it does not understand", () => {
  test("unknown version is refused, not guessed", () => {
    const r = parseCommand('{"v":2,"id":"x","type":"agent.interrupt","agent":"a"}');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toContain("version");
  });
  test("missing version is refused", () => {
    expect(parseCommand('{"id":"x","type":"agent.interrupt","agent":"a"}').ok).toBe(false);
  });
  test("unknown type is refused", () => {
    expect(parseCommand('{"v":1,"id":"x","type":"agent.explode"}').ok).toBe(false);
  });
  test("not JSON is refused", () => {
    expect(parseCommand("hello").ok).toBe(false);
    expect(parseCommand("").ok).toBe(false);
  });
  test("a line that is a JSON array or number is refused", () => {
    expect(parseCommand("[1,2]").ok).toBe(false);
    expect(parseCommand("7").ok).toBe(false);
  });
  test("missing id is refused", () => {
    expect(parseCommand('{"v":1,"type":"agent.interruptAll","reason":"x"}').ok).toBe(false);
  });
  test("missing required field is refused", () => {
    expect(parseCommand('{"v":1,"id":"x","type":"agent.start","project":"p"}').ok).toBe(false);
    expect(parseCommand('{"v":1,"id":"x","type":"approval.resolve","approval":"a","decision":"maybe","scope":"once"}').ok).toBe(false);
  });
  test("a negative or non numeric budget is refused", () => {
    const base = { v: 1, id: "x", type: "agent.start", project: "p", agent: "a", mode: "drive", prompt: "hi", model: "m" };
    expect(parseCommand(JSON.stringify({ ...base, budgetUsd: -1 })).ok).toBe(false);
    expect(parseCommand(JSON.stringify({ ...base, budgetUsd: "3" })).ok).toBe(false);
  });
  test("a command is not accepted as an event, nor an event as a command", () => {
    expect(parseEvent('{"v":1,"id":"c1","type":"agent.interrupt","agent":"a"}').ok).toBe(false);
    expect(parseCommand('{"v":1,"id":"e1","type":"runner.hello","runnerVersion":"1","sdk":"1"}').ok).toBe(false);
  });
  test("the version constant is 1", () => expect(PROTOCOL_VERSION).toBe(1));
});

describe("names that every object has are not message types", () => {
  test("they are refused, never thrown on", () => {
    for (const t of ["constructor", "toString", "__proto__", "hasOwnProperty", "valueOf"]) {
      for (const parse of [parseCommand, parseEvent]) {
        const r = parse(JSON.stringify({ v: 1, id: "a", type: t }));
        expect(r.ok, t).toBe(false);
      }
    }
  });
});

describe("the browser check's download", () => {
  const e = (o: Record<string, unknown>) => parseEvent(JSON.stringify({ v: 1, id: "e", ...o })).ok;
  test("the progress, done, failed and stopped events need a known stage and words", () => {
    expect(e({ type: "browser.install", stage: "downloading", detail: "Downloading.", percent: 40, mb: 94 })).toBe(true);
    expect(e({ type: "browser.install", stage: "exploded", detail: "x" })).toBe(false);
    expect(e({ type: "browser.install", stage: "done" })).toBe(false);
  });
  test("a percent outside 0 to 100 is refused, not shown", () => {
    expect(e({ type: "browser.install", stage: "downloading", detail: "x", percent: 140 })).toBe(false);
    expect(e({ type: "browser.install", stage: "downloading", detail: "x", percent: "40" })).toBe(false);
  });
  test("the status says both whether it is installed and whether a download is running", () => {
    expect(e({ type: "browser.status", installed: true, installing: false })).toBe(true);
    expect(e({ type: "browser.status", installed: true })).toBe(false);
  });
  test("a check that names what it needs may only name the browser", () => {
    const step = { type: "proof.step", agent: "a", rung: "browser", label: "Opening it in a browser", status: "skipped", detail: "x" };
    expect(e({ ...step, needs: "browser" })).toBe(true);
    expect(e({ ...step, needs: "chrome" })).toBe(false);
    expect(e({ type: "problem.found", project: "p", agent: "a", verdict: "passed_with_gaps", needs: "something" })).toBe(false);
    expect(e({ type: "proof.result", agent: "a", verdict: "passed_with_gaps", steps: [{ rung: "browser", status: "skipped", needs: "nope" }], tries: 1 })).toBe(false);
  });
  test("a note on Point at the problem's answer is words, never anything else", () => {
    expect(e({ type: "problem.found", project: "p", agent: "a", verdict: "passed", note: "I could not read why the Vercel deploy failed." })).toBe(true);
    expect(e({ type: "problem.found", project: "p", agent: "a", verdict: "passed", note: { html: "<b>x</b>" } })).toBe(false);
    expect(e({ type: "problem.found", project: "p", agent: "a", verdict: "passed", note: "" })).toBe(false);
  });
  test("the commands carry nothing a page could point elsewhere: no address, no folder", () => {
    expect(parseCommand('{"v":1,"id":"c","type":"browser.install"}').ok).toBe(true);
    expect(parseCommand('{"v":1,"id":"c","type":"browser.check"}').ok).toBe(true);
  });
});

describe("a follow up or Try again (agent.send)", () => {
  const c = (o: Record<string, unknown>) => parseCommand(JSON.stringify({ v: 1, id: "c", type: "agent.send", agent: "builder-1", ...o })).ok;
  test("names the project it is for, so the app can hold it to the chosen folder", () => {
    expect(c({ project: "/p", text: "the button is still grey" })).toBe(true);
    expect(c({ text: "the button is still grey" })).toBe(false);
  });
  test("a follow up needs words; Try again needs none", () => {
    expect(c({ project: "/p" })).toBe(false);
    expect(c({ project: "/p", text: "" })).toBe(false);
    expect(c({ project: "/p", retry: true })).toBe(true);
    expect(c({ project: "/p", retry: "yes" })).toBe(false);
    expect(c({ project: "/p", retry: true, text: 7 })).toBe(false);
  });
  test("a single task's loop card has no step number (index 0)", () => {
    expect(parseEvent(JSON.stringify({ v: 1, id: "e", type: "loop.stuck", agent: "builder-1", index: 0, title: "Fix the signup page", failure: { label: "Running the tests", detail: "1 failed" }, options: [] })).ok).toBe(true);
  });
});
