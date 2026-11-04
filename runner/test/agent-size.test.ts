// M66 (the size of a change on the result card): the receipt carries each file's added and removed lines from the
// checkpoint diff, and how many words the ask had. A stand in for Claude plays a script; temporary folders only.
import { afterEach, describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { AgentRunner, wordsIn } from "../src/agent.ts";
import { ScriptedEngine, type Step } from "../src/engine.ts";
import { TaskLog } from "../src/tasklog.ts";
import type { Event } from "../../protocol/index.ts";

const made: string[] = [];
afterEach(() => { while (made.length) rmSync(made.pop()!, { recursive: true, force: true }); });
const tmp = (l: string) => { const d = realpathSync(mkdtempSync(join(tmpdir(), `companion-size-${l}-`))); made.push(d); return d; };
const lines = (n: number, w = "line") => Array.from({ length: n }, (_, i) => `${w} ${i + 1}`).join("\n") + "\n";
const write = (file: string, content: string): Step => ({ tool: { name: "Write", input: { file_path: file, content } }, costUsd: 0.01 });

describe("the receipt says how big the change was", () => {
  test("each file's lines come from the checkpoint diff, and the ask's words are counted", async () => {
    const project = tmp("proj");
    for (const [p, c] of Object.entries({ "login.js": lines(20), "page.html": lines(300) })) { mkdirSync(join(project, p, ".."), { recursive: true }); writeFileSync(join(project, p), c); }
    const events: Event[] = [];
    const runner = new AgentRunner({ shadowRoot: tmp("shadow"), engine: new ScriptedEngine([write("login.js", lines(20).replace("line 2\n", "line two\n")), write("page.html", lines(412, "new")), { text: "Done", costUsd: 0.01 }]), log: new TaskLog(":memory:"), emit: (e) => events.push(e), now: () => new Date("2026-11-04T12:00:00Z") });
    await runner.handle({ v: 1, id: "c1", type: "agent.start", project, agent: "builder-1", mode: "drive", prompt: "Fix the login button colour", model: "claude-sonnet-5-5", budgetUsd: 3 });
    const r = events.find((e) => e.type === "receipt") as any;
    const by = Object.fromEntries(r.changed.map((c: any) => [c.file, c]));
    expect(by["login.js"]).toEqual({ file: "login.js", kind: "modified", added: 1, removed: 1 });
    expect(by["page.html"]).toEqual({ file: "page.html", kind: "modified", added: 412, removed: 300, was: 300 });
    expect(r.askWords).toBe(5);
  });
  test("words are counted plainly", () => {
    expect(wordsIn("  fix   the\nbutton ")).toBe(3);
    expect(wordsIn("")).toBe(0);
    expect(wordsIn(undefined)).toBe(0);
  });
});
