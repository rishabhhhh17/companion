// The shared AGENTS.md: project facts for every editor and command line tool. Never personal, never overwrites.
import { afterAll, describe, expect, test } from "bun:test";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { MemoryStore } from "../src/memory/store.ts";
import { madeBySquibby, removeSection, syncAgentsFiles } from "../src/memory/agentsmd.ts";
import { NAMES, PRODUCT } from "../src/names.ts";

const made: string[] = [];
const tmp = () => { const d = mkdtempSync(join(tmpdir(), "agmd-")); made.push(d); return d; };
afterAll(() => { for (const d of made) rmSync(d, { recursive: true, force: true }); });
const NOW = new Date("2026-10-09T10:00:00Z");
const rig = () => {
  const project = tmp(), data = tmp(), m = new MemoryStore({ project, profileDir: data });
  m.add("project", "Built with React, Vite", "package.json", NOW); m.add("project", "Start it with: npm run dev", "package.json", NOW);
  m.add("profile", "Prefers short answers", 'you said "shorter"', NOW);
  return { project, data, m };
};
const read = (p: string, f: string) => readFileSync(join(p, f), "utf8");

describe("creating the files", () => {
  test("a project with neither file gets both, and CLAUDE.md imports AGENTS.md on its first line", () => {
    const { project, m } = rig();
    expect(syncAgentsFiles(project, m, { approved: false })).toEqual({ status: "written", files: ["AGENTS.md", "CLAUDE.md"] });
    expect(read(project, "AGENTS.md")).toContain("Built with React, Vite");
    expect(read(project, "CLAUDE.md").split("\n")[0]).toBe("@AGENTS.md");
  });
  test("it holds project facts only: nothing from the personal profile", () => {
    const { project, m } = rig();
    syncAgentsFiles(project, m, { approved: false });
    expect(read(project, "AGENTS.md")).not.toContain("short answers");
    expect(read(project, "AGENTS.md")).not.toContain("shorter");
  });
  test("house rules are included so every tool follows them", () => {
    const { project, m } = rig();
    mkdirSync(join(project, ".companion"), { recursive: true }); writeFileSync(join(project, ".companion", "rules.txt"), "# mine\nnever edit pricing.txt\n");
    syncAgentsFiles(project, m, { approved: false });
    expect(read(project, "AGENTS.md")).toContain("never edit pricing.txt");
  });
  test("a line that would not pass the filter today is left out even if it is in the file", () => {
    const { project, m } = rig();
    writeFileSync(join(project, ".companion", "project.md"), readFileSync(join(project, ".companion", "project.md"), "utf8") + "- The owner has depression\n");
    syncAgentsFiles(project, m, { approved: false });
    expect(read(project, "AGENTS.md")).not.toContain("depression");
  });
});

describe("a project that already has its own files", () => {
  test("they are not touched, and the answer is to ask", () => {
    const { project, m } = rig();
    writeFileSync(join(project, "AGENTS.md"), "# Team rules\nUse tabs.\n"); writeFileSync(join(project, "CLAUDE.md"), "Be careful.\n");
    expect(syncAgentsFiles(project, m, { approved: false })).toEqual({ status: "needs_ask", files: ["AGENTS.md", "CLAUDE.md"] });
    expect(read(project, "AGENTS.md")).toBe("# Team rules\nUse tabs.\n"); expect(read(project, "CLAUDE.md")).toBe("Be careful.\n");
  });
  test("once approved, one marked section is added at the end and everything else stays exactly as it was", () => {
    const { project, m } = rig();
    writeFileSync(join(project, "AGENTS.md"), "# Team rules\nUse tabs.\n"); writeFileSync(join(project, "CLAUDE.md"), "Be careful.\n");
    syncAgentsFiles(project, m, { approved: true });
    const a = read(project, "AGENTS.md");
    expect(a.startsWith("# Team rules\nUse tabs.\n")).toBe(true); expect(a).toContain("Built with React, Vite"); expect(a).toContain("companion:begin");
    expect(read(project, "CLAUDE.md").startsWith("Be careful.\n")).toBe(true); expect(read(project, "CLAUDE.md")).toContain("@AGENTS.md");
  });
  test("later updates replace only the marked section", () => {
    const { project, m } = rig();
    writeFileSync(join(project, "AGENTS.md"), "# Team rules\nUse tabs.\n");
    syncAgentsFiles(project, m, { approved: true });
    m.add("project", "Deploys to Vercel", "vercel.json", NOW);
    syncAgentsFiles(project, m, { approved: false });
    const a = read(project, "AGENTS.md");
    expect(a).toContain("Deploys to Vercel"); expect(a.match(/companion:begin/g)!.length).toBe(1); expect(a.startsWith("# Team rules\nUse tabs.\n")).toBe(true);
  });
  test("a section written under an earlier name is updated in place, not added a second time", () => {
    const { project, m } = rig();
    writeFileSync(join(project, "AGENTS.md"), "# Team rules\nUse tabs.\n\n<!-- companion:begin (kept up to date by Companion; delete this whole block to stop) -->\n## Project notes (from Companion)\n- Old fact\n<!-- companion:end -->\n");
    syncAgentsFiles(project, m, { approved: false });
    const a = read(project, "AGENTS.md");
    expect(a.match(/companion:begin/g)!.length).toBe(1); expect(a).not.toContain("Old fact"); expect(a).not.toContain("Companion"); expect(a).toContain("Built with React, Vite");
  });
  test("the section can be removed and the person's own text is left exactly as it was", () => {
    const { project, m } = rig();
    writeFileSync(join(project, "AGENTS.md"), "# Team rules\nUse tabs.\n");
    syncAgentsFiles(project, m, { approved: true });
    removeSection(join(project, "AGENTS.md"));
    expect(read(project, "AGENTS.md")).toBe("# Team rules\nUse tabs.\n");
  });
  test("declining leaves everything alone", () => {
    const { project, m } = rig();
    writeFileSync(join(project, "AGENTS.md"), "# Team rules\n");
    expect(syncAgentsFiles(project, m, { approved: false, declined: true })).toEqual({ status: "declined", files: [] });
    expect(read(project, "AGENTS.md")).toBe("# Team rules\n");
  });
});

describe("safety", () => {
  test("nothing is written when the project has no memory yet", () => {
    const project = tmp(), m = new MemoryStore({ project, profileDir: tmp() });
    expect(syncAgentsFiles(project, m, { approved: false })).toEqual({ status: "nothing_to_write", files: [] });
    expect(existsSync(join(project, "AGENTS.md"))).toBe(false);
  });
  test("a file we cannot read is never overwritten", () => {
    const { project, m } = rig();
    mkdirSync(join(project, "AGENTS.md"));   // a folder where the file should be
    expect(syncAgentsFiles(project, m, { approved: true }).status).toBe("failed");
  });
  test("a second run with nothing new changes nothing", () => {
    const { project, m } = rig();
    syncAgentsFiles(project, m, { approved: false });
    expect(syncAgentsFiles(project, m, { approved: false }).status).toBe("unchanged");
  });
});

describe("keeping in step", () => {
  test(`after a line is forgotten the block loses it, but only where ${PRODUCT} already wrote one`, () => {
    const { project, m } = rig();
    syncAgentsFiles(project, m, { approved: false });
    const id = m.list("project").entries.find((e) => e.text.startsWith("Built with"))!.id;
    m.forget("project", id);
    expect(syncAgentsFiles(project, m, { approved: false, onlyIfPresent: true }).status).toBe("written");
    expect(read(project, "AGENTS.md")).not.toContain("Built with");
    const other = rig();
    expect(syncAgentsFiles(other.project, other.m, { approved: false, onlyIfPresent: true }).status).toBe("unchanged");
    expect(existsSync(join(other.project, "AGENTS.md"))).toBe(false);
  });
  test("when nothing is left the block is taken out", () => {
    const { project, m } = rig();
    writeFileSync(join(project, "AGENTS.md"), "# Team\n"); syncAgentsFiles(project, m, { approved: true });
    m.eraseAll("project");
    syncAgentsFiles(project, m, { approved: true, onlyIfPresent: true });
    expect(read(project, "AGENTS.md")).toBe("# Team\n");
  });
});

describe("which folders Squibby made", () => {
  test("only a folder directly inside the folder for everything made", () => {
    expect(madeBySquibby(`/Users/sam/${NAMES.newFolderParent}/Website for my bakery`)).toBe(true);
    expect(madeBySquibby(`/Users/sam/Documents/${NAMES.newFolderParent}/Research`)).toBe(true);
    expect(madeBySquibby(`/Users/sam/${NAMES.newFolderParent}/Website/deeper`)).toBe(false);
    expect(madeBySquibby(`/Users/sam/${NAMES.newFolderParent}`)).toBe(false);
    expect(madeBySquibby("/Users/sam/Projects/Website")).toBe(false);
    expect(madeBySquibby("/Users/sam/Website")).toBe(false);
  });
});
