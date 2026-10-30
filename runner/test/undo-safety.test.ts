// Undo through the runner (found by the 15 Oct 2026 review): it must not run while work is going on in the project, it
// must say what it did (so the card never claims "Undone" without proof), and it must hold up on awkward folders.
import { afterEach, describe, expect, test } from "bun:test";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { join } from "node:path";
import { AgentRunner } from "../src/agent.ts";
import { CheckpointStore } from "../src/checkpoints.ts";
import { ScriptedEngine, type Step } from "../src/engine.ts";
import { TaskLog } from "../src/tasklog.ts";
import { parseEvent } from "../../protocol/index.ts";
import type { Event } from "../../protocol/index.ts";

const made: string[] = [];
afterEach(() => { while (made.length) rmSync(made.pop()!, { recursive: true, force: true }); });
const tmp = (l: string) => { const d = realpathSync(mkdtempSync(join(tmpdir(), `companion-undo-${l}-`))); made.push(d); return d; };

function setup(script: Step[]) {
  const project = tmp("proj"); writeFileSync(join(project, "a.txt"), "original");
  const events: Event[] = [];
  const shadowRoot = tmp("shadow");
  const runner = new AgentRunner({ shadowRoot, engine: new ScriptedEngine(script), log: new TaskLog(":memory:"), emit: (e) => events.push(e), now: () => new Date("2026-10-15T12:00:00Z") });
  return { project, events, runner, shadowRoot };
}
const start = (project: string) => ({ v: 1 as const, id: "c1", type: "agent.start" as const, project, agent: "b1", mode: "drive" as const, prompt: "x", model: "m", budgetUsd: 3 });
const restore = (project: string, checkpoint: string) => ({ v: 1 as const, id: "r1", type: "checkpoint.restore" as const, project, checkpoint });

describe("undo through the runner", () => {
  test("it says what happened, in an event the card can show", async () => {
    const r = setup([{ tool: { name: "Write", input: { file_path: "a.txt", content: "changed" } }, costUsd: 0.01 }, { text: "done", costUsd: 0.01 }]);
    await r.runner.handle(start(r.project));
    const cp = (r.events.find((e) => e.type === "checkpoint.created") as any).checkpoint;
    expect(readFileSync(join(r.project, "a.txt"), "utf8")).toBe("changed");
    await r.runner.handle(restore(r.project, cp));
    expect(readFileSync(join(r.project, "a.txt"), "utf8")).toBe("original");
    const done = r.events.find((e) => e.type === "checkpoint.restored") as any;
    expect(done).toMatchObject({ project: r.project, checkpoint: cp, recovered: [], largeLeftAlone: [], leftAlone: [] });
    expect(done.safety).toMatch(/^cp_/);
    expect(parseEvent(JSON.stringify({ v: 1, id: "x", ...done })).ok).toBe(true);
  });

  test("it will not run while an agent is still working in the project, and says so in plain words", async () => {
    const r = setup([{ text: "thinking", costUsd: 0, delayMs: 1500 }]);
    const run = r.runner.handle(start(r.project));
    await new Promise((res) => setTimeout(res, 150));
    await r.runner.handle(restore(r.project, "cp_0001"));
    const err = r.events.filter((e) => e.type === "protocol.error").map((e: any) => e.reason).join(" ");
    expect(err).toMatch(/still working|wait/i);
    expect(r.events.some((e) => e.type === "checkpoint.restored")).toBe(false);
    await r.runner.handle({ v: 1, id: "k", type: "agent.interruptAll", reason: "test" } as never);
    await run;
  });

  test("an unknown checkpoint is a plain sentence, not a stack trace", async () => {
    const r = setup([{ text: "x", costUsd: 0 }]);
    await r.runner.handle(restore(r.project, "cp_9999"));
    const err = (r.events.find((e) => e.type === "protocol.error") as any)?.reason as string;
    expect(err).toBeTruthy(); expect(err).not.toMatch(/git |Error:|at \//);
  });
});

describe("folders that are not a project", () => {
  test("the whole disk, the home folder or a system folder is refused, with a plain sentence", () => {
    for (const dir of ["/", homedir(), "/Users", "/Library", "/usr"]) expect(() => new CheckpointStore(tmp("shadow"), dir), dir).toThrow(/too broad.*one project/i);
  });
  test("a folder with far too many files is refused instead of hanging", async () => {
    const d = tmp("many"); for (let i = 0; i < 60; i++) writeFileSync(join(d, `f${i}.txt`), "x");
    const store = new CheckpointStore(tmp("shadow"), d, { maxFiles: 50 });
    await expect(store.snapshot("x")).rejects.toThrow(/too many files/i);
    const ok = tmp("ok"); writeFileSync(join(ok, "a.txt"), "x");
    await expect(new CheckpointStore(tmp("shadow"), ok, { maxFiles: 50 }).snapshot("x")).resolves.toBeTruthy();
  });
  test("a Mac without git says what to do, in plain words", async () => {
    const d = tmp("nogit"); writeFileSync(join(d, "a.txt"), "x");
    const saved = process.env.PATH; process.env.PATH = "/nonexistent";
    try {
      const store = new CheckpointStore(tmp("shadow"), d);
      await expect(store.snapshot("x")).rejects.toThrow(/xcode-select --install/);
    } finally { process.env.PATH = saved; }
  });
});

describe("undo is exact", () => {
  test("a CRLF file comes back byte for byte even when the project asks git to change line endings", async () => {
    const d = tmp("crlf");
    writeFileSync(join(d, ".gitattributes"), "* text=auto eol=lf\n");
    writeFileSync(join(d, "win.txt"), "line1\r\nline2\r\n");
    const store = new CheckpointStore(tmp("shadow"), d);
    const cp = await store.snapshot("start");
    writeFileSync(join(d, "win.txt"), "changed");
    await store.restore(cp.id);
    expect(readFileSync(join(d, "win.txt"), "utf8")).toBe("line1\r\nline2\r\n");
  });
  test("two projects whose checkpoints have the same number do not share a receipt picture name", () => {
    const { receiptPictureName } = require("../src/agent.ts");
    expect(receiptPictureName("/a/site", "cp_0007")).not.toBe(receiptPictureName("/b/site", "cp_0007"));
    expect(receiptPictureName("/a/site", "cp_0007")).toBe(receiptPictureName("/a/site/", "cp_0007"));
    expect(receiptPictureName("/a/site", "cp_0007")).toMatch(/^[a-z0-9_.-]+\.jpg$/);
  });
});

// M45 [verify]: "Bring the fix back" is a restore of the safety copy the Undo made first. It ships only if this holds on a
// real restore: the runner accepts that safety id and puts the task's files back exactly. Temporary folders only, and only
// the shadow snapshots: nothing here runs or writes the project's git (rule 10).
describe("bring the fix back", () => {
  const tasksOf = async (r: ReturnType<typeof setup>) => {
    const before = r.events.length;
    await r.runner.handle({ v: 1, id: "t", type: "tasks.list", project: r.project } as never);
    return (r.events.slice(before).find((e) => e.type === "tasks.list") as any).tasks as { undone?: boolean; back?: boolean }[];
  };
  test("[verify] the safety copy can be restored, and it puts the task's files back", async () => {
    const r = setup([
      { tool: { name: "Write", input: { file_path: "a.txt", content: "fixed" } }, costUsd: 0.01 },
      { tool: { name: "Write", input: { file_path: "src/new.txt", content: "added by the task" } }, costUsd: 0.01 },
      { text: "done", costUsd: 0.01 },
    ]);
    await r.runner.handle(start(r.project));
    const cp = (r.events.find((e) => e.type === "checkpoint.created") as any).checkpoint;
    expect(readFileSync(join(r.project, "a.txt"), "utf8")).toBe("fixed");
    expect((await tasksOf(r))[0].undone).toBeUndefined();

    // Undo: the files go back, and the task is marked undone in the history.
    await r.runner.handle(restore(r.project, cp));
    const undo = r.events.find((e) => e.type === "checkpoint.restored") as any;
    expect(readFileSync(join(r.project, "a.txt"), "utf8")).toBe("original");
    expect(existsSync(join(r.project, "src/new.txt"))).toBe(false);
    expect(undo.safety).toMatch(/^cp_/);
    expect((await tasksOf(r))[0].undone).toBe(true);

    // Bring the fix back: the same command, with the safety id from the first restore.
    await r.runner.handle({ ...restore(r.project, undo.safety), id: "r2" });
    expect(r.events.filter((e) => e.type === "protocol.error")).toEqual([]);
    const back = r.events.filter((e) => e.type === "checkpoint.restored").at(-1) as any;
    expect(back.checkpoint).toBe(undo.safety);
    expect(back.yours).toEqual([]);
    expect(readFileSync(join(r.project, "a.txt"), "utf8")).toBe("fixed");
    expect(readFileSync(join(r.project, "src/new.txt"), "utf8")).toBe("added by the task");
    // The history says it is back (and was not checked since), as the receipt does: never "Fixed and proven".
    expect((await tasksOf(r))[0]).toMatchObject({ undone: true, back: true });
    expect(parseEvent(JSON.stringify({ v: 1, id: "x", ...back })).ok).toBe(true);
  });
});

// M45 review: Bring back leaves a fix file the person edited after the Undo as their own version, and says which. "Put those
// back too" (the same command as after an Undo, with the safety copy) then puts the fix's version back.
describe("bring the fix back over the person's own edit", () => {
  test("their edit is kept and named, and Put those back too brings the fix's version", async () => {
    const r = setup([
      { tool: { name: "Write", input: { file_path: "a.txt", content: "fixed" } }, costUsd: 0.01 },
      { tool: { name: "Write", input: { file_path: "b.txt", content: "b1" } }, costUsd: 0.01 },
      { text: "done", costUsd: 0.01 },
    ]);
    await r.runner.handle(start(r.project));
    const cp = (r.events.find((e) => e.type === "checkpoint.created") as any).checkpoint;
    await r.runner.handle(restore(r.project, cp));
    const undo = r.events.find((e) => e.type === "checkpoint.restored") as any;
    writeFileSync(join(r.project, "a.txt"), "my own edit");
    await r.runner.handle({ ...restore(r.project, undo.safety), id: "r2" });
    const back = r.events.filter((e) => e.type === "checkpoint.restored").at(-1) as any;
    expect(back.yours).toEqual(["a.txt"]);
    expect(readFileSync(join(r.project, "a.txt"), "utf8")).toBe("my own edit");
    expect(readFileSync(join(r.project, "b.txt"), "utf8")).toBe("b1");
    await r.runner.handle({ v: 1, id: "p1", type: "checkpoint.putBack", project: r.project, checkpoint: undo.safety, confirm: true, files: back.yours } as never);
    const put = r.events.find((e) => e.type === "checkpoint.putBackDone") as any;
    expect(put).toMatchObject({ ok: true, putBack: ["a.txt"] });
    expect(readFileSync(join(r.project, "a.txt"), "utf8")).toBe("fixed");
  });
});
