import { describe, expect, test } from "bun:test";
import { atLeast, doctor, parseVersion } from "../src/doctor.ts";

const run = (map: Record<string, { code: number; out: string }>) => async (cmd: string) => { const r = map[cmd] ?? { code: 127, out: "" }; return { code: r.code, stdout: r.out, stderr: "" }; };

describe("reading versions", () => {
  test("the numbers are found in the usual wordings", () => {
    expect(parseVersion("v20.11.1")).toEqual([20, 11, 1]); expect(parseVersion("git version 2.39.3 (Apple Git-145)")).toEqual([2, 39, 3]); expect(parseVersion("Vercel CLI 53.4.0")).toEqual([53, 4, 0]); expect(parseVersion("nothing")).toBeNull();
  });
  test("old, equal and newer are told apart", () => {
    expect(atLeast([18, 20, 8], [20, 0])).toBe(false); expect(atLeast([20, 0, 0], [20, 0])).toBe(true); expect(atLeast([22, 1, 0], [20, 0])).toBe(true); expect(atLeast(null, [20, 0])).toBe(false);
  });
});

describe("your Mac check", () => {
  test("everything present is fine", async () => {
    const items = await doctor(run({ "node --version": { code: 0, out: "v22.1.0" }, "command -v git": { code: 0, out: "/usr/bin/git" }, "xcode-select -p": { code: 0, out: "/Library/Developer/CommandLineTools" }, "git --version": { code: 0, out: "git version 2.39.3" }, "vercel --version": { code: 0, out: "Vercel CLI 53.4.0" } }), () => true);
    expect(items.every((i) => i.ok)).toBe(true);
  });
  test("an old Node and missing tools are explained with what to do", async () => {
    const items = await doctor(run({ "node --version": { code: 0, out: "v18.20.8" } }), () => false);
    const by = (id: string) => items.find((i) => i.id === id)!;
    expect(by("node")).toMatchObject({ ok: false }); expect(by("node").detail).toMatch(/20 or newer/); expect(by("node").fix).toMatch(/nodejs\.org/);
    expect(by("git").fix).toMatch(/xcode-select/); expect(by("vercel").fix).toMatch(/npm install -g vercel/); expect(by("browser").ok).toBe(false);
  });
  test("Node that is not there at all is marked missing, so a practice can wait for it; an old one still runs the practice's checks", async () => {
    const none = (await doctor(run({}), () => true)).find((i) => i.id === "node")!;
    expect(none).toMatchObject({ ok: false, missing: true });
    const old = (await doctor(run({ "node --version": { code: 0, out: "v18.20.8" } }), () => true)).find((i) => i.id === "node")!;
    expect(old.ok).toBe(false); expect(old.missing).toBeUndefined();
    const fine = (await doctor(run({ "node --version": { code: 0, out: "v22.1.0" } }), () => true)).find((i) => i.id === "node")!;
    expect(fine.missing).toBeUndefined();
  });
  test("the browser line tells the truth: nothing downloads on its own, and it says how to get it", async () => {
    const items = await doctor(run({}), () => false);
    const b = items.find((i) => i.id === "browser")!;
    expect(b.ok).toBe(false);
    expect(`${b.detail} ${b.fix ?? ""}`).not.toMatch(/downloads it the first time|automatically|on its own when/i);
    expect(b.detail).toMatch(/skip/i);
    expect(b.fix).toMatch(/Get the browser check/);
    expect(b.fix).toMatch(/200 MB/);
    const ok = (await doctor(run({}), () => true)).find((i) => i.id === "browser")!;
    expect(ok.ok).toBe(true);
    expect(ok.fix).toBeUndefined();
  });
  test("a tool that crashes or hangs is reported as missing, not as a crash", async () => {
    const items = await doctor(async () => { throw new Error("boom"); }, () => true);
    expect(items.find((i) => i.id === "node")!.ok).toBe(false);
  });
});

// Git is not optional: every task, check, Undo and Which task broke it keeps its undo points with it (audit A78).
describe("Git on the Mac check", () => {
  test("missing Git says it is needed, with the one thing to do", async () => {
    const git = (await doctor(run({ "xcode-select -p": { code: 0, out: "/Library/Developer/CommandLineTools" } }), () => true)).find((i) => i.id === "git")!;
    expect(git).toMatchObject({ ok: false, missing: true });
    expect(git.detail).toMatch(/needs Git/);
    expect(git.detail).not.toMatch(/Some projects/);
    expect(git.fix).toMatch(/xcode-select --install/);
  });
  test("with only Apple's stand in for git and no developer tools, git itself is never run (it would open Apple's install window)", async () => {
    const ran: string[] = [];
    const r = async (cmd: string) => { ran.push(cmd); if (cmd === "command -v git") return { code: 0, stdout: "/usr/bin/git\n", stderr: "" }; if (cmd === "xcode-select -p") return { code: 2, stdout: "", stderr: "xcode-select: error: unable to get active developer directory" }; return { code: 127, stdout: "", stderr: "" }; };
    const git = (await doctor(r, () => true)).find((i) => i.id === "git")!;
    expect(ran).not.toContain("git --version");
    expect(git).toMatchObject({ ok: false, missing: true });
  });
  test("a git of its own (Homebrew's) is used even without Apple's tools", async () => {
    const r = async (cmd: string) => (cmd === "command -v git" ? { code: 0, stdout: "/opt/homebrew/bin/git\n", stderr: "" } : cmd === "git --version" ? { code: 0, stdout: "git version 2.47.0", stderr: "" } : { code: 2, stdout: "", stderr: "" });
    expect((await doctor(r, () => true)).find((i) => i.id === "git")!.ok).toBe(true);
  });
});

describe("the undo store's failures when Git is missing", () => {
  test("xcrun's own words are said as what to do", async () => {
    const { friendlyGitError, NEEDS_GIT } = await import("../src/checkpoints.ts");
    for (const m of ["could not create the shadow store: xcrun: error: invalid active developer path (/Library/Developer/CommandLineTools), missing xcrun at: /Library/Developer/CommandLineTools/usr/bin/xcrun", "xcode-select: note: No developer tools were found, requesting install."]) {
      expect(friendlyGitError(new Error(m)).message).toBe(NEEDS_GIT);
    }
  });
});

describe("a task or a check on a Mac without Git says what to do, in plain words", () => {
  test("Start, Point at the problem and Rescue all say the one line, never xcrun's words", async () => {
    const { mkdtempSync, realpathSync, rmSync } = await import("node:fs");
    const { tmpdir } = await import("node:os");
    const { join } = await import("node:path");
    const { CheckpointStore, NEEDS_GIT, friendlyGitError } = await import("../src/checkpoints.ts");
    const { AgentRunner } = await import("../src/agent.ts");
    const { ScriptedEngine } = await import("../src/engine.ts");
    const { TaskLog } = await import("../src/tasklog.ts");
    const dirs = [0, 1].map(() => realpathSync(mkdtempSync(join(tmpdir(), "companion-nogit-"))));
    const real = CheckpointStore.prototype.snapshot;
    CheckpointStore.prototype.snapshot = async () => { throw friendlyGitError(new Error("could not create the shadow store: xcrun: error: invalid active developer path (/Library/Developer/CommandLineTools)")); };
    try {
      const events: any[] = [];
      const runner = new AgentRunner({ shadowRoot: dirs[1], engine: new ScriptedEngine([]), log: new TaskLog(":memory:"), emit: (e) => events.push(e), proof: async () => ({ verdict: "passed", steps: [] }) });
      await runner.handle({ v: 1, id: "s", type: "agent.start", project: dirs[0], agent: "a", mode: "drive", prompt: "x", model: "m", budgetUsd: 1 });
      await runner.handle({ v: 1, id: "f", type: "problem.find", project: dirs[0], agent: "a" } as never);
      await runner.handle({ v: 1, id: "r", type: "rescue.diagnose", project: dirs[0], agent: "a", model: "m", budgetUsd: 1 } as never);
      const said = events.filter((e) => e.type === "protocol.error").map((e) => e.reason);
      expect(said).toEqual([NEEDS_GIT, NEEDS_GIT, NEEDS_GIT]);
    } finally { CheckpointStore.prototype.snapshot = real; for (const d of dirs) rmSync(d, { recursive: true, force: true }); }
  });
});
