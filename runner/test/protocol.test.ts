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
  // Found in the M11 audit (A72): two command fixtures shared c80, and two events each shared e60 and e61, so anything that
  // keys the cases by id (a "which case failed" report) kept only one of them or named the wrong one.
  test("every fixture has its own id", () => {
    for (const f of ["commands.jsonl", "events.jsonl"]) {
      const ids = lines(f).map((l) => JSON.parse(l).id as string);
      expect(ids.filter((id, i) => ids.indexOf(id) !== i), f).toEqual([]);
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
  test("a practice task names its practice by a short id, nothing else", () => {
    const base = { v: 1, id: "x", type: "agent.start", project: "p", agent: "a", mode: "drive", prompt: "hi", model: "m", budgetUsd: 0.6 };
    expect(parseCommand(JSON.stringify({ ...base, practice: "open-table" })).ok).toBe(true);
    for (const bad of ["", "../x", "Signup", 7, "a b", "x".repeat(41)]) expect(parseCommand(JSON.stringify({ ...base, practice: bad })).ok, String(bad)).toBe(false);
    const cp = { v: 1, id: "e", type: "checkpoint.created", project: "p", agent: "a", checkpoint: "cp", label: "Before: x", files: 1, skipped: [] };
    expect(parseEvent(JSON.stringify({ ...cp, practice: 3 })).ok).toBe(false);
    const rc = { v: 1, id: "e", type: "receipt", agent: "a", checkpoint: "cp", changed: [], commands: 0, notUndoable: [], proof: "passed", usdEstimate: 0 };
    expect(parseEvent(JSON.stringify({ ...rc, practice: "../x" })).ok).toBe(false);
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

describe("which task broke it, and the error explainer", () => {
  const c = (o: Record<string, unknown>) => parseCommand(JSON.stringify({ v: 1, id: "c", ...o })).ok;
  const e = (o: Record<string, unknown>) => parseEvent(JSON.stringify({ v: 1, id: "e", ...o })).ok;
  test("undoing one task needs a yes and the task's checkpoint", () => {
    expect(c({ type: "bisect.undo", project: "p", checkpoint: "cp_0001", confirm: true })).toBe(true);
    expect(c({ type: "bisect.undo", project: "p", checkpoint: "cp_0001" })).toBe(false);
    expect(c({ type: "bisect.undo", project: "p", checkpoint: "cp_0001", confirm: "yes" })).toBe(false);
    expect(c({ type: "bisect.undo", project: "p", confirm: true })).toBe(false);
  });
  test("a search names the project and the agent", () => {
    expect(c({ type: "bisect.start", project: "p", agent: "a" })).toBe(true);
    expect(c({ type: "bisect.start", project: "p" })).toBe(false);
  });
  test("a found task must say which saved version it starts from, and undo is safe or show only", () => {
    const base = { type: "bisect.result", project: "p", agent: "a", runs: 3, maxRuns: 6 };
    expect(e({ ...base, outcome: "found", task: { label: "x", at: "t", checkpoint: "cp_0002" }, undo: "safe" })).toBe(true);
    expect(e({ ...base, outcome: "found", task: { label: "x", at: "t" } })).toBe(false);
    expect(e({ ...base, outcome: "found", task: { label: "x", at: "t", checkpoint: "cp_0002" }, undo: "maybe" })).toBe(false);
    expect(e({ ...base, outcome: "guessed" })).toBe(false);
    expect(e({ ...base, outcome: "unsure" })).toBe(true);
  });
  test("progress says which version is being checked", () => {
    expect(e({ type: "bisect.progress", project: "p", agent: "a", run: 1, maxRuns: 6, what: "now" })).toBe(true);
    expect(e({ type: "bisect.progress", project: "p", agent: "a", run: 1, maxRuns: 6, what: "somewhere" })).toBe(false);
  });
  test("an explanation always carries its excerpt and evidence, even when it has no sentences", () => {
    expect(e({ type: "error.explained", req: "r", ok: false, sentences: [], excerpt: "", evidence: "", usdEstimate: 0 })).toBe(true);
    expect(e({ type: "error.explained", req: "r", ok: true, sentences: ["a", "b"], usdEstimate: 0 })).toBe(false);
    expect(c({ type: "error.explain", req: "r", app: "com.apple.Terminal", text: "boom" })).toBe(true);
    expect(c({ type: "error.explain", req: "r", app: "com.apple.Terminal", text: "" })).toBe(false);
    expect(c({ type: "error.explain", req: "r", app: "x", text: "boom", project: 5 })).toBe(false);
  });
});

describe("teaching from the change", () => {
  const e = (o: Record<string, unknown>) => parseEvent(JSON.stringify({ v: 1, id: "e", ...o })).ok;
  const c = (o: Record<string, unknown>) => parseCommand(JSON.stringify({ v: 1, id: "c", ...o })).ok;
  const receipt = { type: "receipt", agent: "a", checkpoint: "cp_1", changed: [], commands: 0, notUndoable: [], proof: "passed", usdEstimate: 0 };
  const at = { file: "src/a.js", line: 2, lineText: "const n = user?.name;" };
  test("a receipt may name the first changed line and the same change made twice, and must name them whole", () => {
    expect(e({ ...receipt, changedAt: at, repeat: { first: at, second: { ...at, file: "src/b.js" }, was: "user", now: "user?" } })).toBe(true);
    expect(e({ ...receipt, changedAt: { ...at, line: 0 } })).toBe(false);
    expect(e({ ...receipt, changedAt: { file: "a.js", line: 2 } })).toBe(false);
    expect(e({ ...receipt, changedAt: "src/a.js:2" })).toBe(false);
    expect(e({ ...receipt, repeat: { first: at, was: "a", now: "b" } })).toBe(false);
    expect(e({ ...receipt, repeat: { first: at, second: at, was: "a" } })).toBe(false);
  });
  test("a receipt may say how the task ended and the mode it ran in, and only with known words", () => {
    for (const ended of ["done", "needs_you", "stopped", "failed"]) expect(e({ ...receipt, ended })).toBe(true);
    for (const mode of ["drive", "rescue", "research", "ship"]) expect(e({ ...receipt, mode })).toBe(true);
    expect(e(receipt)).toBe(true);
    expect(e({ ...receipt, ended: "finished" })).toBe(false);
    expect(e({ ...receipt, mode: "chat" })).toBe(false);
  });
  test("an explanation for a Drive step names the step", () => {
    const x = { type: "explain.ready", agent: "a", checkpoint: "cp_1", bullets: ["Why."], usdEstimate: 0.001 };
    expect(e({ ...x, step: { index: 2, title: "Add the form" } })).toBe(true);
    expect(e({ ...x, step: { index: 0, title: "x" } })).toBe(false);
    expect(e({ ...x, step: "two" })).toBe(false);
  });
  test("your turn: try names the change, check names the agent too, and the answers say what happened", () => {
    expect(c({ type: "teach.try", project: "/p", checkpoint: "cp_1" })).toBe(true);
    expect(c({ type: "teach.try", project: "/p" })).toBe(false);
    expect(c({ type: "teach.check", project: "/p", agent: "a", checkpoint: "cp_1" })).toBe(true);
    expect(c({ type: "teach.check", project: "/p", checkpoint: "cp_1" })).toBe(false);
    expect(e({ type: "teach.ready", project: "/p", checkpoint: "cp_1", made: true, target: at, restore: "cp_2" })).toBe(true);
    expect(e({ type: "teach.ready", project: "/p", checkpoint: "cp_1", made: true })).toBe(false);
    expect(e({ type: "teach.ready", project: "/p", checkpoint: "cp_1", made: false, reason: "That file changed." })).toBe(true);
    expect(e({ type: "teach.result", project: "/p", checkpoint: "cp_1", verdict: "passed", same: true })).toBe(true);
    expect(e({ type: "teach.result", project: "/p", checkpoint: "cp_1", verdict: "great", same: true })).toBe(false);
    expect(e({ type: "teach.result", project: "/p", checkpoint: "cp_1", verdict: "passed" })).toBe(false);
  });
  test("a step of the person's own check names the project and the fix, and is a whole step", () => {
    const s = { type: "teach.step", project: "/p", checkpoint: "cp_1", rung: "tests", label: "Running the tests", status: "running", detail: "" };
    expect(e(s)).toBe(true);
    expect(e({ ...s, needs: "browser" })).toBe(true);
    expect(e({ ...s, checkpoint: undefined })).toBe(false);
    expect(e({ ...s, status: "great" })).toBe(false);
    expect(e({ ...s, detail: undefined })).toBe(false);
    expect(e({ ...s, needs: "chrome" })).toBe(false);
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

describe("files added to a request (agent.start files and images)", () => {
  const start = (o: Record<string, unknown>) => parseCommand(JSON.stringify({ v: 1, id: "c", type: "agent.start", project: "/p", agent: "builder-1", mode: "drive", prompt: "Fix it", model: "m", budgetUsd: 1, ...o })).ok;
  test("a request may carry text files and pictures, each named", () => {
    expect(start({})).toBe(true);
    expect(start({ files: [{ name: "notes.md", text: "Use blue." }] })).toBe(true);
    expect(start({ images: [{ name: "shot.png", mediaType: "image/png", base64: "iVBORw0KGgo=" }] })).toBe(true);
    expect(start({ files: [], images: [] })).toBe(true);
  });
  test("anything else is refused before the engine looks at it", () => {
    expect(start({ files: "notes.md" })).toBe(false);
    expect(start({ files: [{ name: "notes.md" }] })).toBe(false);
    expect(start({ files: [{ text: "x" }] })).toBe(false);
    expect(start({ files: [{ name: "", text: "x" }] })).toBe(false);
    expect(start({ images: [{ name: "a.gif", mediaType: "image/gif", base64: "R0lG" }] })).toBe(false);
    expect(start({ images: [{ name: "a.png", mediaType: "image/png" }] })).toBe(false);
    expect(start({ images: [null] })).toBe(false);
  });
});

// M45 (Tell the truth): additive fields only. The receipt says why a failed task stopped, a task row says it was undone, and
// a house rule has its own risk. Older engines send none of these, and their messages still parse.
describe("M45: why a task ended, undone rows and house rule asks", () => {
  const e = (o: Record<string, unknown>) => parseEvent(JSON.stringify({ v: 1, id: "e", ...o })).ok;
  const receipt = { type: "receipt", agent: "a", checkpoint: "cp_1", changed: [], commands: 0, notUndoable: [], proof: "failed", usdEstimate: 0, ended: "failed" };
  const ask = { type: "approval.request", approval: "ap_1", agent: "a", checkpoint: "cp_1", toolUseId: "t", risk: "irreversible", title: "x", expiresAt: "2026-10-30T10:00:00Z" };
  const row = { id: 1, label: "x", status: "done", usd: 0, startedAt: "2026-10-30T10:00:00Z", endedAt: null, checkpoint: "cp_1", changed: 1, proof: "passed" };
  test("endedWhy takes only its known words, and may be left out", () => {
    for (const endedWhy of ["check_failed", "spending_limit", "daily_limit", "turns", "no_connection", "claude_busy", "error"]) expect(e({ ...receipt, endedWhy }), endedWhy).toBe(true);
    expect(e(receipt)).toBe(true);
    for (const endedWhy of ["limit", "", 3, null]) expect(e({ ...receipt, endedWhy }), String(endedWhy)).toBe(false);
  });
  test("the ending itself keeps its four words", () => {
    expect(e({ ...receipt, ended: "limit" })).toBe(false);
  });
  test("house_rule is a risk an approval card may carry", () => {
    expect(e({ ...ask, risk: "house_rule", undoable: true })).toBe(true);
    expect(e({ ...ask, risk: "house rule" })).toBe(false);
  });
  test("TaskSummary.undone is optional", () => {
    expect(e({ type: "tasks.list", project: "p", tasks: [row] })).toBe(true);
    expect(e({ type: "tasks.list", project: "p", tasks: [{ ...row, undone: true }] })).toBe(true);
  });
  test("the new fixture lines validate", () => {
    const m45 = lines("events.jsonl").filter((l) => /"id":"em45/.test(l));
    expect(m45.length).toBe(4);
    for (const l of m45) expect(parseEvent(l).ok, l).toBe(true);
    const all = m45.map((l) => JSON.parse(l));
    expect(all.some((x) => x.type === "receipt" && x.ended === "failed" && x.endedWhy === "spending_limit")).toBe(true);
    expect(all.some((x) => x.type === "receipt" && x.ended === "stopped")).toBe(true);
    expect(all.some((x) => x.type === "approval.request" && x.risk === "house_rule" && x.undoable === true)).toBe(true);
    expect(all.some((x) => x.type === "tasks.list" && x.tasks[0].undone === true)).toBe(true);
  });
});

// M52, the review of every change: the shapes are checked, never guessed (the shared fixtures above hold one of each).
describe("the review of a change", () => {
  const fx = (t: string) => JSON.parse(lines(t.startsWith("review.") && ["review.now", "review.dismiss", "review.fix"].includes(t) ? "commands.jsonl" : "events.jsonl").find((l) => JSON.parse(l).type === t)!);
  const result = () => JSON.parse(lines("events.jsonl").find((l) => JSON.parse(l).id === "erv4")!);
  test("a command missing what it needs is refused", () => {
    expect(parseCommand(JSON.stringify({ ...fx("review.fix"), budgetUsd: undefined })).ok).toBe(false);
    expect(parseCommand(JSON.stringify({ ...fx("review.fix"), batch: "" })).ok).toBe(false);
    expect(parseCommand(JSON.stringify({ ...fx("review.now"), proof: "yes" })).ok).toBe(false);
    expect(parseCommand(JSON.stringify({ ...fx("review.dismiss"), project: undefined })).ok).toBe(false);
  });
  test("a batch names each file with its kind, and a whole count", () => {
    expect(parseEvent(JSON.stringify({ ...fx("review.batch"), files: [{ file: "a.ts" }] })).ok).toBe(false);
    expect(parseEvent(JSON.stringify({ ...fx("review.batch"), count: 1.5 })).ok).toBe(false);
    expect(parseEvent(JSON.stringify({ ...fx("review.batch"), secretFiles: [3] })).ok).toBe(false);
  });
  test("a review that ran has its batch, a known rating, known touches and reasons, the checks, send back and its lane", () => {
    expect(parseEvent(JSON.stringify(result())).ok).toBe(true);
    for (const [k, v] of [["batch", undefined], ["rating", "fine"], ["touches", ["love"]], ["reasons", [{ kind: "vibes", say: "x" }]], ["reasons", [{ kind: "secret_in_code", say: "x", line: 0 }]], ["checks", "maybe"], ["sendBack", ""], ["lane", "best"], ["summary", ""], ["count", -1]] as const) {
      expect(parseEvent(JSON.stringify({ ...result(), [k]: v })).ok, `${k}`).toBe(false);
    }
  });
  test("a review that did not run says why", () => {
    expect(parseEvent(JSON.stringify({ v: 1, id: "x", type: "review.result", project: "p", ok: false, usdEstimate: 0 })).ok).toBe(false);
    expect(parseEvent(JSON.stringify({ v: 1, id: "x", type: "review.result", project: "p", ok: false, reason: "Reviews of changes are off. Turn them on in Settings.", usdEstimate: 0 })).ok).toBe(true);
  });
});

// M55 section 2, live progress: a file the agent's own tool really changed, named from the project folder down.
describe("agent.file names one file from the project folder down", () => {
  const ev = (file: unknown, kind: unknown = "modified") => parseEvent(JSON.stringify({ v: 1, id: "x", type: "agent.file", agent: "builder-1", file, kind }));
  test("the shared fixtures parse, one for each way a file changes", () => {
    const kinds = lines("events.jsonl").map((l) => JSON.parse(l)).filter((e) => e.type === "agent.file").map((e) => e.kind).sort();
    expect(kinds).toEqual(["added", "deleted", "modified"]);
  });
  test("a path from the project down, in folders or not", () => {
    for (const f of ["index.html", "src/app.js", "a b/c.d.ts", ".env"]) expect(ev(f).ok, f).toBe(true);
  });
  test("never a whole path, a way up and out, an empty part, a backslash, or no file", () => {
    for (const f of ["/Users/me/site/a.js", "../other/a.js", "src/../../a.js", "src//a.js", "src/", "src\\a.js", "", 3, null, "a\u0000b", "x".repeat(1025)]) expect(ev(f).ok, String(f)).toBe(false);
  });
  test("only added, modified or deleted", () => {
    expect(ev("a.js", "renamed").ok).toBe(false);
    expect(parseEvent(JSON.stringify({ v: 1, id: "x", type: "agent.file", agent: "builder-1", file: "a.js" })).ok).toBe(false);
  });
});
