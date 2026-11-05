// M67 bug bash fixes for memory: edit guards, one id per line, the local day, no project, and a refusal that stays shown.
// Temporary folders only.
import { afterAll, afterEach, expect, test } from "bun:test";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { MemoryStore } from "../src/memory/store.ts";
import { AgentRunner, NO_PROJECT } from "../src/agent.ts";
import { ScriptedEngine } from "../src/engine.ts";
import { TaskLog } from "../src/tasklog.ts";
import type { Event } from "../../protocol/index.ts";

const made: string[] = [];
const tmp = (l = "x") => { const d = realpathSync(mkdtempSync(join(tmpdir(), `m67-mem-${l}-`))); made.push(d); return d; };
const was = process.cwd();
afterEach(() => process.chdir(was));
afterAll(() => { for (const d of made) rmSync(d, { recursive: true, force: true }); });
const rig = () => { const project = tmp("p"), data = tmp("d"); return { project, data, m: new MemoryStore({ project, profileDir: data }) }; };
const NOW = new Date("2026-10-09T10:00:00Z");
const runnerFor = (events: any[]) => new AgentRunner({ shadowRoot: tmp("s"), engine: new ScriptedEngine([]), log: new TaskLog(":memory:"), emit: (e) => events.push(e), memoryDir: tmp("md"), proof: async () => ({ verdict: "passed", steps: [] }) });

test("edit refuses text in the store's own line format, as add does, and the line is kept", () => {
  const { m } = rig();
  const a = m.add("project", "Uses React", "package.json", NOW);
  if (!a.ok) throw new Error("add");
  const r = m.edit("project", a.entry.id, "Uses Vue — the plan, 2026-01-01", NOW);
  expect(r.ok).toBe(false);
  if (!r.ok) expect(r.reason).toMatch(/format/);
  expect(m.list("project").entries.map((e) => e.text)).toEqual(["Uses React"]);
});

test("editing a line to the words of another merges them, so every line keeps its own id", () => {
  const { m } = rig();
  const a = m.add("project", "Uses React", "package.json", NOW);
  const b = m.add("project", "Uses Vite", "package.json", NOW);
  if (!a.ok || !b.ok) throw new Error("add");
  expect(m.edit("project", b.entry.id, "uses react", NOW).ok).toBe(true);
  const e = m.list("project").entries;
  expect(e.map((x) => x.id)).toEqual([a.entry.id]);
});

test("two identical lines written by hand get two ids, and Forget takes only the one pressed", () => {
  const { m, project } = rig();
  mkdirSync(join(project, ".companion"), { recursive: true });
  writeFileSync(join(project, ".companion", "project.md"), "# x\n\n- Uses tabs\n- Keeps notes\n- Uses tabs\n");
  const before = m.list("project").entries;
  expect(new Set(before.map((x) => x.id)).size).toBe(3);
  expect(m.forget("project", before[2].id).ok).toBe(true);
  const after = m.list("project").entries;
  expect(after.map((x) => x.text)).toEqual(["Uses tabs", "Keeps notes"]);
  expect(after[0].id).toBe(before[0].id);
});

test("a line is dated with the day on this Mac's clock, not the UTC day", () => {
  const { m } = rig();
  const at = new Date("2026-10-10T03:00:00Z");
  const r = m.add("project", "Uses Svelte", "plan", at);
  if (!r.ok) throw new Error("add");
  const local = `${at.getFullYear()}-${String(at.getMonth() + 1).padStart(2, "0")}-${String(at.getDate()).padStart(2, "0")}`;
  expect(r.entry.date).toBe(local);
  const e = m.list("project").entries[0];
  expect(m.edit("project", e.id, "Uses SvelteKit", at).ok).toBe(true);
  expect(m.list("project").entries[0].date).toBe(local);
});

test("with no project, erase and add never touch .companion in the folder the engine runs in", () => {
  const here = tmp("cwd");
  mkdirSync(join(here, ".companion"));
  writeFileSync(join(here, ".companion", "project.md"), "# notes\n\n- Keep me — me, 2026-01-01 {m_aaaaaaaa}\n");
  process.chdir(here);
  const m = new MemoryStore({ project: "", profileDir: tmp("d") });
  expect(m.eraseAll("project").ok).toBe(true);
  expect(m.add("project", "Uses Rust", "x", NOW).ok).toBe(false);
  expect(readFileSync(join(here, ".companion", "project.md"), "utf8")).toContain("Keep me");
});

test("Forget everything with no folder chosen, through the runner, leaves the engine's folder alone", async () => {
  const here = tmp("cwd2");
  mkdirSync(join(here, ".companion"));
  writeFileSync(join(here, ".companion", "project.md"), "# notes\n\n- Keep me — me, 2026-01-01 {m_aaaaaaaa}\n");
  process.chdir(here);
  const events: any[] = [];
  await runnerFor(events).handle({ v: 1, id: "e1", type: "memory.erase", project: NO_PROJECT, scope: "project" } as never);
  expect(existsSync(join(here, ".companion", "project.md"))).toBe(true);
});

test("a refused edit's reason comes after the fresh memory.state, so the page keeps showing it", async () => {
  const project = tmp("p2");
  writeFileSync(join(project, "package.json"), "{}");
  const events: any[] = [];
  const runner = runnerFor(events);
  const cmd = (c: Record<string, unknown>) => runner.handle({ v: 1, id: "c" + Math.random(), project, ...c } as never);
  await cmd({ type: "memory.add", scope: "project", text: "Uses React", source: "package.json" });
  await cmd({ type: "memory.list" });
  const line = (events.filter((e) => e.type === "memory.state").at(-1) as any).projectLines[0].id;
  const from = events.length;
  await cmd({ type: "memory.edit", scope: "project", line, text: "Has a doctor appointment on Friday" });
  const after = events.slice(from).map((e) => e.type);
  expect(after.at(-1)).toBe("memory.refused");
  expect(after).toContain("memory.state");
  expect((events.at(-1) as any).reason).toMatch(/health/i);
});
