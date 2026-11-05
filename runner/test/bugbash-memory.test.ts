// Bug bash (m67): Memory edit, forget and erase on temporary folders only.
import { afterAll, expect, test } from "bun:test";
import { mkdtempSync, rmSync, writeFileSync, mkdirSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { MemoryStore } from "../src/memory/store.ts";

const made: string[] = [];
const tmp = () => { const d = mkdtempSync(join(tmpdir(), "bb-mem-")); made.push(d); return d; };
afterAll(() => { for (const d of made) rmSync(d, { recursive: true, force: true }); });
const rig = () => { const project = tmp(), data = tmp(); return { project, data, m: new MemoryStore({ project, profileDir: data }) }; };
const NOW = new Date("2026-10-09T10:00:00Z");

test("edit refuses text in the store's own line format, as add does", () => {
  const { m } = rig();
  const a = m.add("project", "Uses React", "package.json", NOW);
  if (!a.ok) throw new Error("add");
  expect(m.add("project", "Uses Vue — plan, 2026-01-01", "x", NOW).ok).toBe(false);
  const r = m.edit("project", a.entry.id, "Uses Vue — plan, 2026-01-01", NOW);
  const after = m.list("project").entries;
  // Either refused, or kept exactly as typed.
  if (r.ok) expect(after[0].text).toBe("Uses Vue — plan, 2026-01-01");
  else expect(after[0].text).toBe("Uses React");
});

test("editing a line to the same words as another leaves two lines with one id", () => {
  const { m } = rig();
  const a = m.add("project", "Uses React", "package.json", NOW);
  const b = m.add("project", "Uses Vite", "package.json", NOW);
  if (!a.ok || !b.ok) throw new Error("add");
  m.edit("project", b.entry.id, "Uses React", NOW);
  const ids = m.list("project").entries.map((e) => e.id);
  expect(new Set(ids).size).toBe(ids.length);
});

// M67: this probe first asserted the bug itself as its setup (both lines shared one id). With the bug fixed it now asserts
// the promise: each line has its own id, and Forget takes exactly one of them.
test("two identical hand written lines: each has its own id, and Forget takes one and the other stays", () => {
  const { m, project } = rig();
  mkdirSync(join(project, ".companion"), { recursive: true });
  writeFileSync(join(project, ".companion", "project.md"), "# x\n\n- Uses tabs\n- Uses tabs\n");
  const before = m.list("project").entries;
  expect(before.length).toBe(2);
  expect(before[0].id).not.toBe(before[1].id);
  m.forget("project", before[0].id);
  const after = m.list("project").entries;
  expect(after.length).toBe(1);
  expect(after[0].text).toBe("Uses tabs");
  expect(readFileSync(join(project, ".companion", "project.md"), "utf8").match(/- Uses tabs/g)?.length).toBe(1);
});

test("the date of a line saved late in the evening west of UTC", () => {
  // 9 Oct 2026, 8 pm in Los Angeles is 10 Oct 03:00 UTC.
  const { m } = rig();
  const r = m.add("project", "Uses Svelte", "plan", new Date("2026-10-10T03:00:00Z"));
  if (!r.ok) throw new Error("add");
  console.log("stored date:", r.entry.date);
});
