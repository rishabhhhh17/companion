import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { parseCommand, serialize } from "../../protocol/index.ts";
import { eraseMemory, forgetLine, editLine, exportMemory, listMemory, pauseMemory, answerAgents, shipLive, shipPreview, shipRollback, askRecap, planDrive, startTask } from "./commands.ts";
import { initial, reduce, savedWords, type Model } from "./model.ts";

const run = (events: Record<string, unknown>[], from: Model = initial()): Model => events.reduce<Model>((m, e) => reduce(m, e), from);
const line = (id: string, text: string) => ({ id, text, source: "package.json", date: "2026-10-09" });

describe("memory commands are valid protocol", () => {
  for (const [name, c] of [["list", listMemory("/p")], ["forget", forgetLine("/p", "project", "m_1")], ["edit", editLine("/p", "profile", "m_1", "Prefers short answers")], ["pause", pauseMemory("/p", true)], ["erase", eraseMemory("/p", "profile")], ["export", exportMemory("/p")], ["agents yes", answerAgents("/p", "yes")]] as const) {
    test(name, () => expect(parseCommand(serialize(c)).ok).toBe(true));
  }
  test("a task can be off the record", () => {
    expect((startTask("/p", "x", true) as any).offTheRecord).toBe(true);
    expect((startTask("/p", "x") as any).offTheRecord).toBeUndefined();
    expect((planDrive("/p", "x", true) as any).offTheRecord).toBe(true);
    expect(parseCommand(serialize(startTask("/p", "x", true))).ok).toBe(true);
  });
});

describe("the memory page's state", () => {
  test("the lines, the pause setting and any problem are kept as the runner sent them", () => {
    const m = run([{ type: "memory.state", project: "/p", paused: true, projectLines: [line("m_1", "Uses React")], profileLines: [], problems: ["The memory file could not be read."] }]);
    expect(m.memory).toMatchObject({ paused: true, problems: ["The memory file could not be read."] });
    expect(m.memory!.projectLines[0].text).toBe("Uses React");
  });
  test("the stand in project Settings asks with no folder chosen never becomes the Memory tab's state", () => {
    const m = run([{ type: "memory.state", project: "no-project", paused: true, projectLines: [], profileLines: [line("m_2", "Prefers short answers")], problems: [] }]);
    expect(m.memory).toBeNull();
  });
  test("a refusal is shown in plain words, and a new state clears it", () => {
    const refused = run([{ type: "memory.refused", project: "/p", reason: "Health is never saved." }]);
    expect(refused.memoryNote).toBe("Health is never saved.");
    expect(run([{ type: "memory.state", project: "/p", paused: false, projectLines: [], profileLines: [], problems: [] }], refused).memoryNote).toBeNull();
  });
  test("an export is kept for the page to show", () => {
    expect(run([{ type: "memory.exported", project: "/p", text: "# Everything" }]).exported).toBe("# Everything");
  });
});

describe("the 'remembered' toast", () => {
  const saved = (id: string, text: string) => ({ type: "memory.saved", project: "/p", scope: "project", line: id, text, source: "package.json" });
  test("new lines gather into one toast", () => {
    const m = run([saved("m_1", "Built with React"), saved("m_2", "Start it with: npm run dev")]);
    expect(m.toast!.lines.map((l) => l.id)).toEqual(["m_1", "m_2"]);
    expect(savedWords(m)).toBe("Remembered 2 new things");
  });
  test("one new line is said as that line", () => {
    expect(savedWords(run([saved("m_1", "Built with React")]))).toBe("Remembered: Built with React");
  });
  test("clearing the toast, or a stop, removes it", () => {
    const m = run([saved("m_1", "x")]);
    expect(run([{ type: "ui.toastClear" }], m).toast).toBeNull();
    expect(savedWords(run([{ type: "ui.toastClear" }], m))).toBeNull();
  });
  test("the toast never lists the same line twice", () => {
    expect(run([saved("m_1", "x"), saved("m_1", "x")]).toast!.lines.length).toBe(1);
  });
});

describe("sharing with other tools", () => {
  test("a question about the person's own files is shown once, then answered away", () => {
    const m = run([{ type: "memory.agents_ask", project: "/p", files: ["AGENTS.md", "CLAUDE.md"] }]);
    expect(m.agentsAsk).toEqual(["AGENTS.md", "CLAUDE.md"]);
    expect(run([{ type: "ui.agentsAnswered" }], m).agentsAsk).toBeNull();
  });
  test("writing the files is told in plain words", () => {
    expect(run([{ type: "memory.agents_written", project: "/p", files: ["AGENTS.md", "CLAUDE.md"] }]).notice).toMatch(/AGENTS\.md and CLAUDE\.md/);
  });
});

describe("Explain and Where was I in the pages", () => {
  const ready = { type: "explain.ready", agent: "builder-1", checkpoint: "cp_1", bullets: ["A plain form works everywhere."], question: { text: "Why?", options: ["a", "b"], correct: 1 }, usdEstimate: 0.002 };
  test("the explanation is kept for the result card, and a new task clears it", () => {
    const m = run([{ type: "receipt", agent: "builder-1", checkpoint: "cp_1", changed: [], commands: 0, notUndoable: [], proof: "passed", usdEstimate: 0 }, ready]);
    expect(m.explain).toMatchObject({ checkpoint: "cp_1", bullets: ["A plain form works everywhere."] });
    expect(run([{ type: "checkpoint.created", project: "/p", agent: "builder-1", checkpoint: "cp_2", label: "Before: x", files: 0, skipped: [] }], m).explain).toBeNull();
  });
  test("an explanation for an older task is ignored", () => {
    const m = run([{ type: "checkpoint.created", project: "/p", agent: "builder-1", checkpoint: "cp_2", label: "Before: x", files: 0, skipped: [] }, ready]);
    expect(m.explain).toBeNull();
  });
  test("the recap shows only when there is something to say, and can be dismissed", () => {
    expect(run([{ type: "recap.ready", project: "/p", lines: [] }]).recap).toBeNull();
    const m = run([{ type: "recap.ready", project: "/p", lines: ["You were working on: a", "b", "c"] }]);
    expect(m.recap!.lines.length).toBe(3);
    expect(run([{ type: "ui.recapClosed" }], m).recap).toBeNull();
  });
  test("whether explanations are on is kept", () => {
    expect(run([{ type: "explain.state", project: "/p", enabled: false }]).explainOn).toBe(false);
    expect(initial().explainOn).toBe(true);
  });
  test("the commands are valid protocol", () => {
    expect(parseCommand(serialize(askRecap("/p", "2026-10-09T10:00:00.000Z"))).ok).toBe(true);
    // Explain after a task is a setting the shell sends the engine itself (explain.set is off the page allow list), so the
    // pages have no command for it.
    expect(readFileSync(new URL("./commands.ts", import.meta.url), "utf8")).not.toContain('"explain.set"');
  });
});

describe("putting a project online", () => {
  test("the commands are valid protocol, and going live and rolling back carry the yes", () => {
    for (const c of [shipPreview("/p"), shipLive("/p", "https://a.vercel.app"), shipRollback("/p")]) expect(parseCommand(serialize(c)).ok).toBe(true);
    expect((shipLive("/p", "https://a.vercel.app") as any).confirm).toBe(true);
    expect((shipRollback("/p") as any).confirm).toBe(true);
  });
  test("the card follows the steps, and only a checked preview can be made live", () => {
    let m = run([{ type: "ship.status", project: "/p", stage: "deploying", detail: "Putting up a preview" }]);
    expect(m.shipFlow).toMatchObject({ stage: "deploying", canGoLive: false });
    m = run([{ type: "ship.status", project: "/p", stage: "ready", detail: "Works", previewUrl: "https://a.vercel.app", canGoLive: true }], m);
    expect(m.shipFlow).toMatchObject({ stage: "ready", canGoLive: true, previewUrl: "https://a.vercel.app" });
    m = run([{ type: "ship.status", project: "/p", stage: "failed", detail: "Broken", previewUrl: "https://a.vercel.app", canGoLive: false }], m);
    expect(m.shipFlow!.canGoLive).toBe(false);
  });
  test("closing the ship card clears both the report and the steps", () => {
    const m = run([{ type: "ship.status", project: "/p", stage: "live", detail: "ok" }, { type: "ui.shipClosed" }]);
    expect(m.shipFlow).toBeNull();
  });
});

describe("choosing the project folder", () => {
  test("switching folders clears everything that belonged to the old one", () => {
    const m = run([
      { type: "receipt", agent: "builder-1", checkpoint: "cp_1", changed: [], commands: 0, notUndoable: [], proof: "passed", usdEstimate: 0 },
      { type: "memory.state", project: "/a", paused: false, projectLines: [line("m_1", "Uses React")], profileLines: [], problems: [] },
      { type: "memory.saved", project: "/a", scope: "project", line: "m_1", text: "Uses React", source: "package.json" },
      { type: "tasks.list", project: "/a", tasks: [{ id: 1, label: "x", status: "done", usd: 0, startedAt: "", endedAt: null, checkpoint: null, changed: null, proof: null }] },
      { type: "ui.projectChanged" },
    ]);
    expect(m.receipt).toBeNull(); expect(m.memory).toBeNull(); expect(m.toast).toBeNull(); expect(m.history).toEqual([]);
  });
  test("what the character is doing is not cleared by switching folders", () => {
    const m = run([{ type: "agent.state", agent: "a", state: "working" }, { type: "ui.projectChanged" }]);
    expect(m.character).toBe("working");
  });
});
