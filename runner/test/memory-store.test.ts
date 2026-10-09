import { afterAll, describe, expect, test } from "bun:test";
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { MemoryStore } from "../src/memory/store.ts";

const made: string[] = [];
const tmp = () => { const d = mkdtempSync(join(tmpdir(), "mem-")); made.push(d); return d; };
afterAll(() => { for (const d of made) { try { chmodSync(d, 0o755); } catch {} rmSync(d, { recursive: true, force: true }); } });
const rig = () => { const project = tmp(), data = tmp(); return { project, data, m: new MemoryStore({ project, profileDir: data }) }; };
const NOW = new Date("2026-10-09T10:00:00Z");

describe("saving a line", () => {
  test("a line is saved with its source and date, in a file a person can read", () => {
    const { m, project } = rig();
    const r = m.add("project", "Uses React and Vite", "package.json", NOW);
    expect(r.ok).toBe(true);
    const text = readFileSync(join(project, ".companion", "project.md"), "utf8");
    expect(text).toContain("Uses React and Vite");
    expect(text).toContain("package.json");
    expect(text).toContain("2026-10-09");
    expect(m.list("project").entries[0]).toMatchObject({ text: "Uses React and Vite", source: "package.json", date: "2026-10-09" });
  });
  test("the same line twice is saved once", () => {
    const { m } = rig();
    m.add("project", "Uses React", "package.json", NOW); m.add("project", "uses react", "plan", NOW);
    expect(m.list("project").entries.length).toBe(1);
  });
  test("a line that fails the filter is refused and nothing is written", () => {
    const { m, project } = rig();
    const r = m.add("project", "Owner has depression", "chat", NOW);
    expect(r.ok).toBe(false);
    expect(existsSync(join(project, ".companion", "project.md"))).toBe(false);
  });
  test("a source or text that smuggles a newline or marker cannot forge another line", () => {
    const { m } = rig();
    expect(m.add("project", "Uses Vite\n- Fake line — from you, 2026-01-01 {m_zzzzzz}", "x", NOW).ok).toBe(false);
    expect(m.add("project", "Uses Vite", "x\n- Fake line — from you, 2026-01-01 {m_zzzzzz}", NOW).ok).toBe(true);
    const e = m.list("project").entries;
    expect(e.length).toBe(1); expect(e[0].id).not.toBe("m_zzzzzz"); expect(e[0].source).not.toContain("\n");
  });
  test("the profile file is private to the user", () => {
    const { m, data } = rig();
    m.add("profile", "Prefers short answers", "you said shorter", NOW);
    expect(statSync(join(data, "profile.md")).mode & 0o077).toBe(0);
  });
});

describe("forgetting, editing, erasing", () => {
  test("forget removes exactly that line from the file", () => {
    const { m, project } = rig();
    const a = m.add("project", "Uses React", "a", NOW), b = m.add("project", "Deploys to Cloudflare", "b", NOW);
    if (!a.ok || !b.ok) throw new Error("setup");
    expect(m.forget("project", a.entry.id).ok).toBe(true);
    const text = readFileSync(join(project, ".companion", "project.md"), "utf8");
    expect(text).not.toContain("Uses React"); expect(text).toContain("Deploys to Cloudflare");
  });
  test("forgetting an unknown line says so and changes nothing", () => {
    const { m } = rig(); m.add("project", "Uses React", "a", NOW);
    expect(m.forget("project", "m_nope").ok).toBe(false);
    expect(m.list("project").entries.length).toBe(1);
  });
  test("an edit is screened like a new line, and keeps the source", () => {
    const { m } = rig(); const a = m.add("project", "Uses React", "package.json", NOW); if (!a.ok) throw 0;
    expect(m.edit("project", a.entry.id, "Uses Svelte", NOW).ok).toBe(true);
    expect(m.list("project").entries[0]).toMatchObject({ text: "Uses Svelte", source: "you edited it" });
    expect(m.edit("project", a.entry.id, "Earns a salary of 90k", NOW).ok).toBe(false);
    expect(m.list("project").entries[0].text).toBe("Uses Svelte");
  });
  test("erase all removes the memory file", () => {
    const { m, project } = rig(); m.add("project", "Uses React", "a", NOW);
    m.eraseAll("project");
    expect(m.list("project").entries).toEqual([]);
    expect(existsSync(join(project, ".companion", "project.md"))).toBe(false);
  });
});

describe("pausing", () => {
  test("while paused nothing new is learned, and what is there stays", () => {
    const { m } = rig(); m.add("profile", "Prefers short answers", "a", NOW);
    m.setPaused(true);
    expect(m.add("profile", "Likes plain words", "a", NOW).ok).toBe(false);
    expect(m.list("profile").entries.length).toBe(1);
    expect(m.isPaused()).toBe(true);
    m.setPaused(false);
    expect(m.add("profile", "Likes plain words", "a", NOW).ok).toBe(true);
  });
  test("the paused setting survives a restart", () => {
    const { project, data, m } = rig(); m.setPaused(true);
    expect(new MemoryStore({ project, profileDir: data }).isPaused()).toBe(true);
  });
});

describe("hand edited and damaged files", () => {
  test("a line a person typed in by hand is read, marked as theirs, and kept when the file is rewritten", () => {
    const { m, project } = rig();
    mkdirSync(join(project, ".companion"), { recursive: true });
    writeFileSync(join(project, ".companion", "project.md"), "# Notes\n\nSome prose I wrote.\n\n- Always use tabs\n");
    expect(m.list("project").entries[0]).toMatchObject({ text: "Always use tabs", source: "you wrote it" });
    m.add("project", "Uses Vite", "package.json", NOW);
    const text = readFileSync(join(project, ".companion", "project.md"), "utf8");
    expect(text).toContain("Some prose I wrote."); expect(text).toContain("Always use tabs"); expect(text).toContain("Uses Vite");
  });
  test("a file that cannot be read is reported and never overwritten", () => {
    const { m, project } = rig();
    mkdirSync(join(project, ".companion"), { recursive: true });
    const f = join(project, ".companion", "project.md");
    writeFileSync(f, "- Keep me\n"); chmodSync(f, 0o000);
    const r = m.add("project", "Uses Vite", "a", NOW);
    chmodSync(f, 0o644);
    expect(r.ok).toBe(false);
    expect(readFileSync(f, "utf8")).toBe("- Keep me\n");
    expect(m.list("project").problems.length).toBe(0);   // readable again
  });
});

describe("size caps", () => {
  test("the profile is trimmed to 200 lines, oldest first", () => {
    const { m } = rig();
    for (let i = 0; i < 205; i++) m.add("profile", `Likes option number ${i} of the style guide`, "a", new Date(NOW.getTime() + i * 1000));
    const list = m.list("profile").entries;
    expect(list.length).toBe(200);
    expect(list.some((e) => e.text.includes("number 0 "))).toBe(false);
    expect(list.some((e) => e.text.includes("number 204 "))).toBe(true);
  });
  test("what is given to an agent is capped in words, and the profile comes first", () => {
    const { m } = rig();
    m.add("profile", "Prefers short answers", "a", NOW);
    for (let i = 0; i < 400; i++) m.add("project", `Fact number ${i} ${"word ".repeat(10)}`, "a", new Date(NOW.getTime() + i));
    const text = m.forAgent(50);
    expect(text.split(/\s+/).length).toBeLessThanOrEqual(120);
    expect(text.indexOf("Prefers short answers")).toBeGreaterThanOrEqual(0);
    expect(text.indexOf("Prefers short answers")).toBeLessThan(text.indexOf("Fact number"));
  });
  test("nothing is given to an agent when memory is empty or paused is irrelevant", () => {
    const { m } = rig();
    expect(m.forAgent()).toBe("");
  });
});

describe("export", () => {
  test("export is one readable text with both parts and every source", () => {
    const { m } = rig(); m.add("project", "Uses React", "package.json", NOW); m.add("profile", "Prefers short answers", "you said shorter", NOW);
    const out = m.exportText();
    expect(out).toContain("Uses React"); expect(out).toContain("package.json"); expect(out).toContain("Prefers short answers"); expect(out).toContain("you said shorter");
  });
});
