import { describe, expect, test } from "bun:test";
import { parseCommand, serialize } from "../../protocol/index.ts";
import { eraseMemory, forgetLine, editLine, exportMemory, listMemory, pauseMemory, answerAgents, planDrive, startTask } from "./commands.ts";
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
