// M78: export and restore. One plain file with every note (project and profile) and the house rules, read back exactly;
// restore never removes, filters every line again, keeps forgotten lines forgotten. Temporary folders only.
import { afterAll, describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { MemoryStore } from "../src/memory/store.ts";
import { EXPORT_MARK, exportNotes, parseExport, restoreNotes } from "../src/memory/backup.ts";
import { AgentRunner } from "../src/agent.ts";
import { ScriptedEngine } from "../src/engine.ts";
import { TaskLog } from "../src/tasklog.ts";
import { parseCommand, parseEvent, type Event } from "../../protocol/index.ts";

const made: string[] = [];
const tmp = () => { const d = realpathSync(mkdtempSync(join(tmpdir(), "m78bk-"))); made.push(d); return d; };
afterAll(() => { for (const d of made) rmSync(d, { recursive: true, force: true }); });
const NOW = new Date(2026, 10, 10, 10);
const fresh = () => { const project = tmp(), data = tmp(); return { project, data, m: new MemoryStore({ project, profileDir: data }) }; };
function full() {
  const r = fresh();
  r.m.add("project", "Decided: payments go through Stripe, because the client already has an account", 'you said "we decided"', new Date(2026, 10, 8, 10));
  r.m.add("project", "Built with React, Vite", "package.json", NOW);
  r.m.add("profile", "Prefers short answers", 'you said "shorter"', NOW);
  mkdirSync(join(r.project, ".companion"), { recursive: true });
  writeFileSync(join(r.project, ".companion", "project.md"), readFileSync(join(r.project, ".companion", "project.md"), "utf8") + "- My own line\n");
  writeFileSync(join(r.project, ".companion", "rules.txt"), "# my rules\nnever edit pricing.txt\nask before installing packages\n");
  return r;
}

describe("export", () => {
  test("one plain file with both parts and the house rules, every line with its source and date", () => {
    const { project, m } = full();
    const out = exportNotes(project, m, NOW);
    expect(out).toContain(EXPORT_MARK);
    expect(out).toContain("Decided: payments go through Stripe, because the client already has an account — you said \"we decided\", 2026-11-08");
    expect(out).toContain("Prefers short answers — you said \"shorter\", 2026-11-10");
    expect(out).toContain("- My own line\n");
    expect(out).toContain("- never edit pricing.txt");
    expect(parseExport(out)).toMatchObject({ project: expect.any(Array), profile: [expect.stringContaining("Prefers short answers")], rules: ["- never edit pricing.txt", "- ask before installing packages"] });
  });
});

describe("restore", () => {
  test("into a new Mac: every line comes back with its source and date, and the rules too", () => {
    const a = full();
    const text = exportNotes(a.project, a.m, NOW);
    const b = fresh();
    const r = restoreNotes(b.project, b.m, text, NOW);
    expect(r).toEqual({ added: 6, skipped: 0, forgotten: 0, refused: 0 });
    expect(b.m.list("project").entries).toEqual(a.m.list("project").entries);
    expect(b.m.list("profile").entries).toEqual(a.m.list("profile").entries);
    expect(readFileSync(join(b.project, ".companion", "rules.txt"), "utf8")).toBe("never edit pricing.txt\nask before installing packages\n");
    // A second restore adds nothing.
    expect(restoreNotes(b.project, b.m, text, NOW)).toEqual({ added: 0, skipped: 6, forgotten: 0, refused: 0 });
  });
  test("nothing is ever removed: lines that are only here stay", () => {
    const a = full(), b = fresh();
    b.m.add("project", "Goal: a mug shop", "your approved plan", NOW);
    restoreNotes(b.project, b.m, exportNotes(a.project, a.m, NOW), NOW);
    expect(b.m.list("project").entries.map((e) => e.text)).toContain("Goal: a mug shop");
  });
  test("a line the person forgot stays forgotten, and the answer says so", () => {
    const a = full();
    const text = exportNotes(a.project, a.m, NOW);
    const id = a.m.list("project").entries.find((e) => e.text.startsWith("Decided"))!.id;
    a.m.forget("project", id);
    const r = restoreNotes(a.project, a.m, text, NOW);
    expect(r.forgotten).toBe(1);
    expect(a.m.list("project").entries.map((e) => e.text).join()).not.toContain("Stripe");
  });
  test("every line passes the filter again: health, keys and lines in the store's own form are refused", () => {
    const b = fresh();
    const text = `# x\n\nSquibby ${EXPORT_MARK}\n\n## About this project\n- The owner has depression — you wrote it, 2026-11-01 {m_aaaaaaaa}\n- key sk-ant-api03-abcdefghijklmnopqrstuvwxyz0123456789\n- Uses Vite — package.json, 2026-11-01 {m_bbbbbbbb}\n\n## House rules\n- please be nice\n- never run rm -rf\n`;
    const r = restoreNotes(b.project, b.m, text, NOW);
    expect(r).toEqual({ added: 2, skipped: 0, forgotten: 0, refused: 3 });
    expect(b.m.list("project").entries.map((e) => e.text)).toEqual(["Uses Vite"]);
    expect(readFileSync(join(b.project, ".companion", "rules.txt"), "utf8")).toBe("never run rm -rf\n");
  });
  test("a file that is not an export changes nothing", () => {
    const b = fresh();
    const r = restoreNotes(b.project, b.m, "# My notes\n- Uses Vite\n", NOW);
    expect(r.added).toBe(0); expect(r.problem).toContain("not a notes export");
    expect(b.m.list("project").entries).toEqual([]);
  });
  test("Pause does not stop a restore: it is the person's own act", () => {
    const a = full(), b = fresh();
    b.m.setPaused(true);
    expect(restoreNotes(b.project, b.m, exportNotes(a.project, a.m, NOW), NOW).added).toBe(6);
  });
});

describe("through the engine", () => {
  test("memory.export and memory.restore, with the yes the protocol requires", async () => {
    const a = full(), events: Event[] = [];
    const runner = new AgentRunner({ shadowRoot: tmp(), engine: new ScriptedEngine([]), log: new TaskLog(":memory:"), emit: (e) => events.push(e), memoryDir: a.data, proof: async () => ({ verdict: "passed", steps: [] }) });
    await runner.handle({ v: 1, id: "x1", type: "memory.export", project: a.project } as never);
    const text = (events.find((e) => (e.type as string) === "memory.exported") as unknown as { text: string }).text;
    expect(text).toContain(EXPORT_MARK);
    // Without confirm, the protocol refuses it before it reaches the engine.
    expect(parseCommand(JSON.stringify({ v: 1, id: "x2", type: "memory.restore", project: "/p", text }))).toMatchObject({ ok: false });
    const b = fresh();
    const rb = new AgentRunner({ shadowRoot: tmp(), engine: new ScriptedEngine([]), log: new TaskLog(":memory:"), emit: (e) => events.push(e), memoryDir: b.data, proof: async () => ({ verdict: "passed", steps: [] }) });
    const ok = parseCommand(JSON.stringify({ v: 1, id: "x3", type: "memory.restore", project: b.project, text, confirm: true })) as { ok: boolean; command?: unknown };
    expect(ok.ok).toBe(true);
    await rb.handle({ v: 1, id: "x3", type: "memory.restore", project: b.project, text, confirm: true } as never);
    const done = events.find((e) => (e.type as string) === "memory.restored") as unknown as Record<string, unknown>;
    expect(done).toMatchObject({ project: b.project, added: 6, skipped: 0, forgotten: 0, refused: 0 });
    expect(parseEvent(JSON.stringify({ v: 1, id: "e", ...done }))).toMatchObject({ ok: true });
    const st = events.filter((e) => (e.type as string) === "memory.state").at(-1) as unknown as { projectLines: unknown[] };
    expect(st.projectLines.length).toBe(3);
  });
});
