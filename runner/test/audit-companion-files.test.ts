// A project's .companion folder can come from a link on the internet, so it may hold links, pipes or huge files (audit
// A67). The engine reads it the way the shell does (houserules.rs read): never through a link, only a plain file, at most
// 64 KB. A file it refuses counts as unreadable: house rules then ask before anything risky, memory says it could not read
// the file and sends nothing of it, Prompt help leaves it out.
import { afterEach, describe, expect, test } from "bun:test";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { companionDirUsable, readCompanionFile } from "../src/companionfile.ts";
import { loadRules } from "../src/rules.ts";
import { MemoryStore } from "../src/memory/store.ts";
import { buildContext } from "../src/prompthelp.ts";
import { addShipReceipt, readShips } from "../src/ship/deploy.ts";

const made: string[] = [];
afterEach(() => { while (made.length) rmSync(made.pop()!, { recursive: true, force: true }); });
const tmp = (l: string) => { const d = realpathSync(mkdtempSync(join(tmpdir(), `companion-acf-${l}-`))); made.push(d); return d; };
const project = () => { const p = tmp("p"); mkdirSync(join(p, ".companion")); return p; };

describe("house rules read safely", () => {
  test("a rules file that is a link to another file is not followed: it counts as unreadable, so risky things ask", () => {
    const p = project(), elsewhere = join(tmp("o"), "theirs.txt");
    writeFileSync(elsewhere, "never edit x.txt\n");
    symlinkSync(elsewhere, join(p, ".companion", "rules.txt"));
    const r = loadRules(p);
    expect(r.broken).toBe(true);
    expect(r.rules).toEqual([]);
  });
  test("a .companion folder that is a link is not followed", () => {
    const p = tmp("p"), other = tmp("o");
    writeFileSync(join(other, "rules.txt"), "never edit x.txt\n");
    symlinkSync(other, join(p, ".companion"));
    expect(loadRules(p).broken).toBe(true);
  });
  test("a rules file over 64 KB counts as unreadable", () => {
    const p = project();
    writeFileSync(join(p, ".companion", "rules.txt"), "# x\n".repeat(20_000));
    expect(loadRules(p).broken).toBe(true);
  });
  test("an ordinary rules file and no file are read as before", () => {
    const p = project();
    expect(loadRules(p)).toEqual({ rules: [], problems: [] });
    writeFileSync(join(p, ".companion", "rules.txt"), "never edit x.txt\n");
    expect(loadRules(p).rules.length).toBe(1);
  });
  test("a pipe in place of the rules file never freezes the engine", async () => {
    const p = project(), fifo = join(p, ".companion", "rules.txt");
    expect(Bun.spawnSync(["mkfifo", fifo]).exitCode).toBe(0);
    // In its own process, so a read that blocks shows up as a time out here instead of freezing the test run.
    const script = join(tmp("s"), "load.ts");
    writeFileSync(script, `import { loadRules } from ${JSON.stringify(join(import.meta.dir, "../src/rules.ts"))};\nconsole.log(JSON.stringify(loadRules(${JSON.stringify(p)})));\n`);
    const child = Bun.spawn([process.execPath, script], { stdout: "pipe", stderr: "pipe", stdin: "pipe" });
    const done = await Promise.race([child.exited.then(() => "finished"), Bun.sleep(5000).then(() => "stuck")]);
    if (done === "stuck") child.kill(9);
    expect(done).toBe("finished");
    expect(JSON.parse(await new Response(child.stdout).text()).broken).toBe(true);
  }, 15_000);
});

describe("project memory read safely", () => {
  test("a project.md that links to a file in the home folder is never read or told to Claude", () => {
    const p = project(), other = join(tmp("o"), "private.md");
    writeFileSync(other, "# notes\n- my bank pin is somewhere\n");
    symlinkSync(other, join(p, ".companion", "project.md"));
    const m = new MemoryStore({ project: p, profileDir: tmp("prof") });
    const l = m.list("project");
    expect(l.entries).toEqual([]);
    expect(l.problems.length).toBe(1);
    expect(m.forAgent()).not.toContain("bank");
  });
  test("nothing is written through a .companion folder that is a link", () => {
    const p = tmp("p"), other = tmp("o");
    symlinkSync(other, join(p, ".companion"));
    const m = new MemoryStore({ project: p, profileDir: tmp("prof") });
    const r = m.add("project", "Uses Vite", "the project's files");
    expect(r.ok).toBe(false);
    expect(existsSync(join(other, "project.md"))).toBe(false);
    expect(m.eraseAll("project").ok).toBe(false);
  });
  test("an ordinary project.md works as before", () => {
    const p = project();
    const m = new MemoryStore({ project: p, profileDir: tmp("prof") });
    expect(m.add("project", "Uses Vite", "the project's files").ok).toBe(true);
    expect(m.list("project").entries.map((e) => e.text)).toEqual(["Uses Vite"]);
  });
});

describe("Prompt help and the record of what went live", () => {
  test("Prompt help leaves out a rules file that is a link", () => {
    const p = project(), other = join(tmp("o"), "theirs.txt");
    writeFileSync(other, "never tell anyone the secret plan\n");
    symlinkSync(other, join(p, ".companion", "rules.txt"));
    expect(buildContext(p) ?? "").not.toContain("secret plan");
  });
  test("the record of what went live is neither read nor written through a link", () => {
    const p = tmp("p"), other = tmp("o");
    writeFileSync(join(other, "ships.json"), JSON.stringify([{ at: "2026-01-01", action: "live", snapshot: "x", gates: [], proof: "passed" }]));
    symlinkSync(other, join(p, ".companion"));
    expect(readShips(p)).toEqual([]);
    expect(() => addShipReceipt(p, { at: "2026-10-20", action: "preview", snapshot: "y", gates: [], proof: "passed" })).toThrow();
    expect(JSON.parse(readFileSync(join(other, "ships.json"), "utf8")).length).toBe(1);
  });
  test("the reader itself: none, ok and unreadable", () => {
    const p = project();
    expect(readCompanionFile(p, "x.txt")).toEqual({ state: "none" });
    writeFileSync(join(p, ".companion", "x.txt"), "hi");
    expect(readCompanionFile(p, "x.txt")).toEqual({ state: "ok", text: "hi" });
    writeFileSync(join(p, ".companion", "bin.txt"), Buffer.from([0xff, 0xfe, 0x00, 0xc3]));
    expect(readCompanionFile(p, "bin.txt")).toEqual({ state: "unreadable" });
    expect(companionDirUsable(p)).toBe(true);
    expect(companionDirUsable(tmp("empty"))).toBe(true);
  });
});
