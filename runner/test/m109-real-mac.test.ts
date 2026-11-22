// M109 (docs/milestones/M109-real-mac-guide.md): the guided session per tool for the seven tools, the result recorder, the
// RESULTS template and the summary that names only proven tools. Every folder is a temporary fixture; the real hook commands
// Squibby writes are run with sh against the practice guard (Squibby's real HookGuard and a real shadow store in a throwaway
// data folder). No model, no AI tool, no key and no git in a project is touched.
import { afterAll, describe, expect, test } from "bun:test";
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, realpathSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { canAsk, canBlock, guardEntryFor, HOOK_FILE } from "../src/donesignal.ts";
import {
  CORE_STEPS, EXTRA_STEPS, LIVE_COMMAND, LOGIN_ASK, LOGIN_COMMAND, LOGIN_VIA, PRACTICE_LINE, SEVEN, TOOL_NAME, emptyFacts, gather, judge, newSession, nextStep,
  parseResult, practiceGuard, record, resultsMarkdown, stepsFor, summary, template, verdict, type Facts, type SevenTool,
} from "../src/realmac.ts";

const made: string[] = [];
const tmp = (l: string) => { const d = realpathSync(mkdtempSync(join(tmpdir(), `companion-test-m109-${l}-`))); made.push(d); return d; };
afterAll(() => { for (const d of made) rmSync(d, { recursive: true, force: true }); });
const SCRIPT = join(import.meta.dir, "..", "scripts", "m109-session.ts");
const run = (...args: string[]) => spawnSync(process.execPath, [SCRIPT, ...args], { encoding: "utf8", timeout: 30_000 });
const P = { folder: "/tmp/practice", data: "/tmp/data", script: "/repo/scripts/m109-session.sh", claudeBin: "/repo/runner/node_modules/x/claude" };
const DAY = "2026-11-22T10:00:00.000Z";
const passAll = (tool: SevenTool, ids = stepsFor(tool, P).map((s) => s.id)) => {
  let s = newSession(tool, P.folder, P.data, DAY);
  for (const id of ids) s = record(s, id, "pass", id === "version" ? "1.2.3" : "", DAY);
  return s;
};

describe("one guided session per tool, one step per message", () => {
  test("the seven tools, each with a plain name", () => {
    expect([...SEVEN]).toEqual(["claude", "codex", "cursor", "copilot", "gemini", "windsurf", "antigravity"]);
    for (const t of SEVEN) expect(TOOL_NAME[t].length).toBeGreaterThan(3);
  });
  for (const tool of SEVEN) {
    test(`${tool}: every step is one thing to do, at most one line to paste, what to see and one question`, () => {
      const steps = stepsFor(tool, P);
      expect(steps[0]!.id).toBe("version");
      expect(new Set(steps.map((s) => s.id)).size).toBe(steps.length);
      for (const s of steps) {
        expect(s.do.length).toBeGreaterThan(10);
        expect(s.see.length).toBeGreaterThan(10);
        expect(s.ask.trim().endsWith("?")).toBe(true);
        expect(s.ask.split("?").length - 1).toBe(1);                       // exactly one question
        if (s.paste !== undefined) expect(s.paste.includes("\n")).toBe(false);  // one line at most
        // Plain words: no em dashes in anything the founder reads.
        for (const w of [s.title, s.do, s.see, s.ask, s.paste ?? ""]) expect(w).not.toContain("—");
      }
      // The core checks of the plan, in order, and the extras where the tool has them.
      const ids = steps.map((s) => s.id);
      expect<string[]>(ids.filter((i) => (CORE_STEPS as readonly string[]).includes(i))).toEqual(
        ["version", "watch", "open", ...(tool === "claude" ? ["mcp", "hooks"] : []), "done", "guard", "live", "logins", ...(canAsk(tool) ? [] : canBlock(tool) ? ["block", "blocked"] : [])]);
      expect(ids.includes("start")).toBe(["codex", "gemini", "antigravity"].includes(tool));
      expect(ids.includes("putin")).toBe(["cursor", "copilot", "windsurf", "antigravity"].includes(tool));
      for (const i of ids) expect([...CORE_STEPS, ...EXTRA_STEPS] as string[]).toContain(i);
    });
  }
  test("the live and login steps say what each tool can do: ask where it can, run as documented where it cannot", () => {
    for (const tool of SEVEN) {
      const live = stepsFor(tool, P).find((s) => s.id === "live")!, logins = stepsFor(tool, P).find((s) => s.id === "logins")!;
      expect(live.do).toContain(LIVE_COMMAND);
      if (canAsk(tool)) {
        expect(live.see).toContain("asks you");
        expect(logins.see).toContain(LOGIN_ASK);
      } else {
        expect(live.see).toContain("without asking");
        expect(logins.see).toContain(PRACTICE_LINE);
      }
    }
  });
  test("the saved logins step asks for what the tool's guard can see: a shell command where it sees only the shell", () => {
    expect(LOGIN_COMMAND).toBe("cat .env");
    for (const tool of SEVEN) {
      const logins = stepsFor(tool, P).find((s) => s.id === "logins")!, blocked = stepsFor(tool, P).find((s) => s.id === "blocked");
      const asks = LOGIN_VIA[tool] === "shell" ? `Run this command exactly: ${LOGIN_COMMAND}` : "Show me what is in .env";
      expect(logins.do).toContain(asks);
      if (blocked) expect(blocked.do).toContain(asks);
    }
    // Cursor's guard is beforeShellExecution only and Windsurf's matcher is exec: neither sees a file reader.
    for (const t of ["cursor", "windsurf", "codex"] as const) expect(LOGIN_VIA[t]).toBe("shell");
    for (const t of ["claude", "copilot", "gemini", "antigravity"] as const) expect(LOGIN_VIA[t]).toBe("read");
  });
  test("where the tool asks, the login words allow for the full path the tool may show", () => {
    for (const tool of SEVEN.filter(canAsk)) {
      const see = stepsFor(tool, P).find((s) => s.id === "logins")!.see;
      expect(see).toContain(LOGIN_ASK);
      expect(see).toContain("full path");
    }
  });
  test("Claude Code: after it opens, /mcp lists no servers and /hooks only the product's two lines, as core steps", () => {
    const steps = stepsFor("claude", P);
    const mcp = steps.find((s) => s.id === "mcp")!, hooks = steps.find((s) => s.id === "hooks")!;
    expect(mcp.paste).toBe("/mcp");
    expect(hooks.paste).toBe("/hooks");
    expect((CORE_STEPS as readonly string[]).includes("mcp") && (CORE_STEPS as readonly string[]).includes("hooks")).toBe(true);
    for (const t of SEVEN.filter((x) => x !== "claude")) expect(stepsFor(t, P).some((s) => s.id === "mcp" || s.id === "hooks")).toBe(false);
    expect(verdict(record(passAll("claude"), "mcp", "fail", "a claude.ai connector showed", DAY))).toBe("failed");
    expect(template()).toMatch(/\| mcp \|.*\| Claude Code \|/);
  });
  test("Claude Code runs the SDK's bundled binary with the CLAUDE.md test rules, never bypassPermissions", () => {
    const open = stepsFor("claude", P).find((s) => s.id === "open")!.paste!;
    expect(open).toContain(P.claudeBin);
    expect(open).toContain("--setting-sources project,local");
    expect(open).toContain("--strict-mcp-config");
    expect(open).toContain("CLAUDE_CODE_DISABLE_AUTO_MEMORY=1");
    expect(open).toContain("CLAUDE_CODE_SUBPROCESS_ENV_SCRUB=1");
    expect(open).not.toContain("bypassPermissions");
    expect(open).not.toContain("dangerously");
    expect(open).not.toContain("CLAUDE_CONFIG_DIR");
    expect(stepsFor("claude", P).find((s) => s.id === "version")!.paste).toBe(`'${P.claudeBin}' --version`);
    for (const t of SEVEN) for (const s of stepsFor(t, P)) expect(`${s.do} ${s.paste ?? ""}`).not.toMatch(/bypassPermissions|--yolo|--dangerously/);
  });
  test("next step: the first one not answered, then none", () => {
    let s = newSession("codex", P.folder, P.data, DAY);
    expect(nextStep(s, P)!.id).toBe("version");
    s = record(s, "version", "pass", "codex-cli 0.99.0", DAY);
    expect(nextStep(s, P)!.id).toBe("watch");
    s = record(s, "watch", "fail", "it said nothing", DAY);
    expect(nextStep(s, P)!.id).toBe("open");               // a fail is kept and the session goes on
    expect(nextStep(passAll("codex"), P)).toBeNull();
  });
});

describe("the result recorder", () => {
  test("keeps each answer with its date and what was seen, and never changes the session it was given", () => {
    const s0 = newSession("cursor", P.folder, P.data, DAY);
    const s1 = record(s0, "done", "pass", "  the marker came within a second ", "2026-11-22T10:05:00.000Z");
    expect(s0.answers).toEqual({});
    expect(s1.answers.done).toEqual({ answer: "pass", note: "the marker came within a second", at: "2026-11-22T10:05:00.000Z" });
  });
  test("refuses a step the tool does not have, an answer that is not pass, fail or skip, and a version with no words", () => {
    const s = newSession("claude", P.folder, P.data, DAY);
    expect(() => record(s, "block", "pass", "", DAY)).toThrow(/not a step/);
    expect(() => record(s, "nope", "pass", "", DAY)).toThrow(/not a step/);
    expect(() => record(s, "done", "maybe" as never, "", DAY)).toThrow(/pass, fail or skip/);
    expect(() => record(s, "version", "pass", "  ", DAY)).toThrow(/version/);
  });
  test("a PASS the check does not agree with is refused, and the check's words are kept with the answer", () => {
    const s = newSession("claude", P.folder, P.data, DAY);
    const none = emptyFacts();
    expect(() => record(s, "guard", "pass", "", DAY, none)).toThrow(/check does not agree/);
    expect(record(s, "guard", "fail", "it refused", DAY, none).answers.guard!.answer).toBe("fail");
    const seen = { ...none, saved: ["rm -rf build"], buildGone: true };
    expect(record(s, "guard", "pass", "", DAY, seen).answers.guard!.check).toContain("saved copy");
    // A step only the founder can see is his answer alone.
    expect(record(s, "open", "pass", "", DAY, none).answers.open!.check).toBeUndefined();
    expect(() => record(s, "watch", "pass", "", DAY, none)).toThrow(/check does not agree/);
    expect(record(s, "watch", "pass", "", DAY, { ...none, guardAlive: true }).answers.watch!.answer).toBe("pass");
  });
  test("a key typed into a note is never kept", () => {
    const s = record(newSession("codex", P.folder, P.data, DAY), "logins", "pass", "it printed sk_live_1234567890abcdefghij then stopped", DAY);
    expect(s.answers.logins!.note).not.toContain("sk_live_1234567890abcdefghij");
    expect(s.answers.logins!.note).toContain("then stopped");
    expect(record(newSession("codex", P.folder, P.data, DAY), "done", "pass", "x".repeat(2000), DAY).answers.done!.note.length).toBeLessThanOrEqual(300);
  });
});

describe("a tool is proven only when every core step passed", () => {
  test("all passed: proven; one failed: failed; one skipped or missing: not finished", () => {
    expect(verdict(passAll("gemini"))).toBe("proven");
    expect(verdict(record(passAll("gemini"), "guard", "fail", "no copy", DAY))).toBe("failed");
    expect(verdict(record(passAll("gemini"), "live", "skip", "", DAY))).toBe("not finished");
    expect(verdict(newSession("gemini", P.folder, P.data, DAY))).toBe("not finished");
  });
  test("the extras (M107 and M108 checks) are shown but never decide the verdict", () => {
    const core = stepsFor("antigravity", P).map((s) => s.id).filter((i) => (CORE_STEPS as readonly string[]).includes(i));
    const s = record(passAll("antigravity", core), "putin", "fail", "the chat box was not found", DAY);
    expect(verdict(s)).toBe("proven");
    expect(resultsMarkdown(s, P)).toContain("the chat box was not found");
  });
});

describe("what the check sees, judged per tool", () => {
  const f = (o: Partial<Facts>): Facts => ({ ...emptyFacts(), ...o });
  test("done: a marker named for this tool and the change made", () => {
    expect(judge("codex", "done", f({ doneTools: ["codex"], helloChanged: true })).answer).toBe("pass");
    expect(judge("codex", "done", f({ doneTools: ["claude"], helloChanged: true })).answer).toBe("fail");
    expect(judge("codex", "done", f({})).answer).toBe("wait");
  });
  test("guard: a saved copy made before the command, and the command still ran", () => {
    expect(judge("cursor", "guard", f({ saved: ["rm -rf build"], buildGone: true })).answer).toBe("pass");
    expect(judge("cursor", "guard", f({ saved: [], buildGone: true })).answer).toBe("fail");
    const held = judge("cursor", "guard", f({ saved: ["rm -rf build"], buildGone: false }));
    expect(held.answer).toBe("fail");
    expect(held.why).toContain("did not run");
    expect(judge("cursor", "guard", f({})).answer).toBe("wait");
  });
  test("live: asked with Squibby's reason where the tool can ask; seen and let run where it cannot", () => {
    const asked = { kind: "live" as const, outcome: "asked" as const, reason: "This uses STRIPE_SECRET_KEY, a key that can change a whole account", command: LIVE_COMMAND };
    expect(judge("claude", "live", f({ asked: [asked] })).answer).toBe("pass");
    expect(judge("claude", "live", f({ ran: [LIVE_COMMAND] })).answer).toBe("fail");
    expect(judge("codex", "live", f({ ran: [LIVE_COMMAND] })).answer).toBe("pass");
    expect(judge("codex", "live", f({})).answer).toBe("wait");
  });
  test("logins: asked where the tool can ask, a note where it cannot, blocked when Block was chosen", () => {
    const row = (outcome: "asked" | "ran" | "blocked") => ({ kind: "login" as const, outcome, reason: "This reads .env", command: "cat .env" });
    expect(judge("copilot", "logins", f({ asked: [row("asked")] })).answer).toBe("pass");
    expect(judge("copilot", "logins", f({ asked: [row("ran")] })).answer).toBe("fail");
    expect(judge("gemini", "logins", f({ asked: [row("ran")] })).answer).toBe("pass");
    expect(judge("gemini", "blocked", f({ asked: [row("ran"), row("blocked")] })).answer).toBe("pass");
    expect(judge("gemini", "blocked", f({ asked: [row("ran")] })).answer).toBe("wait");
  });
  test("the steps only the founder can see are left to his answer", () => {
    for (const id of ["version", "open", "start", "putin", "block"]) expect(judge("antigravity", id, f({})).answer).toBe("person");
  });
  test("watch: the practice guard is alive", () => {
    expect(judge("codex", "watch", f({ guardAlive: true })).answer).toBe("pass");
    expect(judge("codex", "watch", f({})).answer).toBe("wait");
  });
});

describe("the RESULTS file, its template and the summary", () => {
  test("a RESULTS file reads back to the same tool, version, date and verdict", () => {
    const s = passAll("windsurf");
    const md = resultsMarkdown(s, P);
    expect(md).toContain("# M109 results: Windsurf");
    expect(md).toContain("1.2.3");
    expect(md).not.toContain("—");
    expect(parseResult(md)).toEqual({ tool: "windsurf", version: "1.2.3", date: "2026-11-22", verdict: "proven", steps: Object.fromEntries(stepsFor("windsurf", P).map((st) => [st.id, "pass"])) });
    expect(parseResult("# something else")).toBeNull();
  });
  test("a RESULTS file whose written verdict does not match its own steps is not believed", () => {
    const md = resultsMarkdown(record(passAll("windsurf"), "guard", "skip", "", DAY), P);
    expect(parseResult(md)!.verdict).toBe("not finished");
    const tampered = md.replace('"verdict":"not finished"', '"verdict":"proven"');
    expect(tampered).not.toBe(md);
    expect(parseResult(tampered)).toBeNull();
    // A step answer that is not pass, fail or skip, or a step the tool does not have, is not believed either.
    expect(parseResult(md.replace('"guard":"skip"', '"guard":"maybe"'))).toBeNull();
    const failed = resultsMarkdown(record(passAll("codex"), "live", "fail", "", DAY), P);
    expect(parseResult(failed.replace('"verdict":"failed"', '"verdict":"proven"'))).toBeNull();
    expect(summary([parseResult(tampered), parseResult(md)].filter((x) => x !== null)).claim).toEqual([]);
  });
  test("the summary lists all seven and claims only the proven ones; a later file for a tool wins", () => {
    const failed = record(passAll("codex"), "guard", "fail", "", DAY);
    const later = { ...passAll("codex"), started: "2026-11-23T10:00:00.000Z" };
    const files = [resultsMarkdown(passAll("claude"), P), resultsMarkdown(failed, P), resultsMarkdown(passAll("cursor", ["version"]), P)];
    const sum = summary(files.map((m) => parseResult(m)!));
    expect(sum.rows.map((r) => r.tool)).toEqual([...SEVEN]);
    expect(sum.claim).toEqual(["claude"]);
    expect(sum.rows.find((r) => r.tool === "codex")!.verdict).toBe("failed");
    expect(sum.rows.find((r) => r.tool === "cursor")!.verdict).toBe("not finished");
    expect(sum.rows.find((r) => r.tool === "gemini")!.verdict).toBe("not run");
    expect(summary([...files, resultsMarkdown(later, P)].map((m) => parseResult(m)!)).claim).toEqual(["claude", "codex"]);
  });
  test("the template in the repo is the one the code makes", () => {
    const committed = readFileSync(join(import.meta.dir, "..", "..", "docs", "milestones", "M109-results-template.md"), "utf8");
    expect(committed).toBe(template());
    for (const t of SEVEN) expect(template()).toContain(TOOL_NAME[t]);
  });
});

describe("the practice folder and the stand in guard, with the real hook commands", () => {
  // The command of Squibby's own entry in the tool's hook file: the one that names the given folder.
  const commandIn = (file: string, needle: string): string => {
    const found: string[] = [];
    const walk = (v: unknown) => { if (typeof v === "string") { if (v.includes(needle)) found.push(v); } else if (v && typeof v === "object") for (const x of Object.values(v)) walk(x); };
    walk(JSON.parse(readFileSync(file, "utf8")));
    expect(found.length).toBe(1);
    return found[0]!;
  };
  const sh = (cmd: string, input: string, cwd: string) => Bun.spawn(["/bin/sh", "-c", cmd], { stdin: new TextEncoder().encode(input), cwd, stdout: "pipe" });
  const setup = (tool: SevenTool) => {
    const folder = tmp(`${tool}-p`), data = tmp(`${tool}-d`);
    const r = run("setup", tool, folder, data);
    expect(r.status).toBe(0);
    return { folder, data };
  };

  test("setup writes the practice files and the tool's done and guard lines, and refuses a folder that is not empty", () => {
    for (const tool of SEVEN) {
      const { folder, data } = setup(tool);
      expect(readFileSync(join(folder, "hello.txt"), "utf8")).toBe("hello world\n");
      expect(statSync(join(folder, "build")).isDirectory()).toBe(true);
      expect(readFileSync(join(folder, ".env"), "utf8")).toBe(`${PRACTICE_LINE}\n`);
      expect(existsSync(join(folder, HOOK_FILE[tool]))).toBe(true);
      expect(existsSync(join(data, "m109-session.json"))).toBe(true);
      expect(JSON.parse(readFileSync(join(data, "m109-session.json"), "utf8")).tool).toBe(tool);
    }
    const mine = tmp("mine");
    writeFileSync(join(mine, "mine.txt"), "my own file\n");
    expect(run("setup", "codex", mine, tmp("mine-d")).status).not.toBe(0);
    expect(readdirSync(mine)).toEqual(["mine.txt"]);
    const inside = tmp("inside");
    expect(run("setup", "codex", inside, join(inside, "data")).status).not.toBe(0);
    expect(run("setup", "zed", tmp("z"), tmp("zd")).status).not.toBe(0);
  });

  test("Claude Code: the guard makes a saved copy and lets rm run, asks about the live key, asks about .env, and the done marker names Claude", async () => {
    const { folder, data } = setup("claude");
    const g = practiceGuard(folder, data, { logins: "ask" });
    expect(g.start()).toBe(true);
    try {
      const file = join(folder, HOOK_FILE.claude);
      const guardCmd = commandIn(file, "kill -0"), doneCmd = commandIn(file, "/usr/bin/touch");
      const p1 = sh(guardCmd, JSON.stringify({ tool_name: "Bash", tool_input: { command: "rm -rf build" }, cwd: folder }), folder);
      expect(await p1.exited).toBe(0);
      rmSync(join(folder, "build"), { recursive: true, force: true });   // the tool runs the command once the hook lets it go
      const p2 = sh(guardCmd, JSON.stringify({ tool_name: "Bash", tool_input: { command: LIVE_COMMAND }, cwd: folder }), folder);
      expect(await new Response(p2.stdout).text()).toContain('"permissionDecision":"ask"');
      const p3 = sh(guardCmd, JSON.stringify({ tool_name: "Read", tool_input: { file_path: join(folder, ".env") }, cwd: folder }), folder);
      expect(await new Response(p3.stdout).text()).toContain('"permissionDecision":"ask"');
      writeFileSync(join(folder, "hello.txt"), "hello there\n");
      expect(await sh(doneCmd, "{}", folder).exited).toBe(0);
      await g.idle();
      const facts = gather(folder, data);
      for (const id of ["watch", "done", "guard", "live", "logins"]) expect(`${id}: ${judge("claude", id, facts).answer}`).toBe(`${id}: pass`);
      // Nothing of the file's contents is kept in the log: only the short command and the reason.
      expect(readFileSync(join(data, "m109-events.jsonl"), "utf8")).not.toContain("not-a-real-key");
    } finally { g.stop(); }
  });

  test("Codex: the live command runs as documented, .env is noted, and with Block it is blocked", async () => {
    const { folder, data } = setup("codex");
    const file = join(folder, HOOK_FILE.codex);
    const guardCmd = commandIn(file, "kill -0");
    const ask = async (command: string) => { const p = sh(guardCmd, JSON.stringify({ tool_name: "Bash", tool_input: { command }, cwd: folder }), folder); return new Response(p.stdout).text(); };
    let g = practiceGuard(folder, data, { logins: "ask" });
    g.start();
    try {
      expect(await ask(LIVE_COMMAND)).not.toContain("deny");
      expect(await ask("cat .env")).not.toContain("deny");
      await g.idle();
    } finally { g.stop(); }
    g = practiceGuard(folder, data, { logins: "block" });
    g.start();
    try {
      expect(await ask("cat .env")).toContain('"permissionDecision":"deny"');
      await g.idle();
    } finally { g.stop(); }
    const facts = gather(folder, data);
    expect(judge("codex", "live", facts).answer).toBe("pass");
    expect(judge("codex", "logins", facts).answer).toBe("pass");
    expect(judge("codex", "blocked", facts).answer).toBe("pass");
  });

  /** The input each tool's documented hook hands the guard: a shell command, or a file read where the tool's guard sees one. */
  const shellIn = (tool: SevenTool, command: string, cwd: string): string => {
    if (tool === "cursor") return JSON.stringify({ command, cwd, hook_event_name: "beforeShellExecution" });
    if (tool === "antigravity") return JSON.stringify({ toolCall: { name: "run_command", args: { CommandLine: command, Cwd: cwd } }, workspacePaths: [cwd] });
    if (tool === "copilot") return JSON.stringify({ hookEventName: "PreToolUse", toolName: "run_in_terminal", toolArgs: { command }, cwd });
    if (tool === "gemini") return JSON.stringify({ hook_event_name: "BeforeTool", tool_name: "run_shell_command", tool_input: { command }, cwd });
    if (tool === "windsurf") return JSON.stringify({ hook_event_name: "PreToolUse", tool_name: "exec", tool_input: { command }, cwd });
    return JSON.stringify({ hook_event_name: "PreToolUse", tool_name: "Bash", tool_input: { command }, cwd });
  };
  const readIn = (tool: SevenTool, path: string, cwd: string): string => {
    if (tool === "claude") return JSON.stringify({ hook_event_name: "PreToolUse", tool_name: "Read", tool_input: { file_path: path }, cwd });
    if (tool === "copilot") return JSON.stringify({ hookEventName: "PreToolUse", toolName: "read_file", toolArgs: { filePath: path, startLine: 1, endLine: 20 }, cwd });
    if (tool === "gemini") return JSON.stringify({ hook_event_name: "BeforeTool", tool_name: "read_file", tool_input: { absolute_path: path }, cwd });
    if (tool === "antigravity") return JSON.stringify({ toolCall: { name: "view_file", args: { AbsolutePath: path } }, workspacePaths: [cwd] });
    throw new Error(`${tool} has no read tool its guard can see`);
  };
  /** The tool name in an input, and whether the tool's own guard matcher lets that input reach the hook at all. */
  const reaches = (tool: SevenTool, input: string): boolean => {
    const o = JSON.parse(input) as Record<string, unknown>;
    const name = (o.toolCall as { name?: string } | undefined)?.name ?? o.tool_name ?? o.toolName;
    const m = (guardEntryFor(tool, "/g", "0123456789abcdef01234567") as { matcher?: string }).matcher;
    if (tool === "cursor") return name === undefined;           // beforeShellExecution: shell commands only
    if (m === undefined) return true;                           // the VS Code agent's hook sees every tool
    return new RegExp(`^(?:${m})$`).test(String(name));
  };
  for (const tool of SEVEN) {
    test(`${tool}: its real done and guard lines, given the input its own steps produce, give a PASS for every step the check can see`, async () => {
      const { folder, data } = setup(tool);
      const file = join(folder, HOOK_FILE[tool]);
      const guardCmd = commandIn(file, "kill -0"), doneCmd = commandIn(file, "/usr/bin/touch");
      const hand = async (input: string) => {
        expect(reaches(tool, input)).toBe(true);
        const p = sh(guardCmd, input, folder);
        const out = await new Response(p.stdout).text();
        await p.exited;
        return out;
      };
      // The login step's input, from the step's own words: a shell command, or the tool's file reader on .env.
      const loginIn = () => {
        const step = stepsFor(tool, P).find((s) => s.id === "logins")!;
        if (step.do.includes(`Run this command exactly: ${LOGIN_COMMAND}`)) return shellIn(tool, LOGIN_COMMAND, folder);
        expect(step.do).toContain("Show me what is in .env");
        return readIn(tool, join(folder, ".env"), folder);
      };
      let g = practiceGuard(folder, data, { logins: "ask" });
      expect(g.start()).toBe(true);
      try {
        await hand(shellIn(tool, "rm -rf build", folder));
        rmSync(join(folder, "build"), { recursive: true, force: true });  // the tool runs the command once the hook lets it go
        const live = await hand(shellIn(tool, LIVE_COMMAND, folder));
        if (canAsk(tool)) expect(live).toContain("ask");
        const login = await hand(loginIn());
        if (canAsk(tool)) expect(login).toContain("ask");
        else expect(login).not.toMatch(/deny|block/);
        writeFileSync(join(folder, "hello.txt"), "hello there\n");
        expect(await sh(doneCmd, "{}", folder).exited).toBe(0);
        await g.idle();
      } finally { g.stop(); }
      const facts = gather(folder, data);
      // watch is judged while the guard runs; here it has stopped, so it is checked on its own below.
      for (const id of ["done", "guard", "live", "logins"]) expect(`${tool} ${id}: ${judge(tool, id, facts).answer}`).toBe(`${tool} ${id}: pass`);
      if (stepsFor(tool, P).some((s) => s.id === "blocked")) {
        g = practiceGuard(folder, data, { logins: "block" });
        expect(g.start()).toBe(true);
        try {
          expect(judge(tool, "watch", gather(folder, data)).answer).toBe("pass");
          expect(await hand(loginIn())).toMatch(/deny|block/);
          await g.idle();
        } finally { g.stop(); }
        expect(judge(tool, "blocked", gather(folder, data)).answer).toBe("pass");
      } else {
        g = practiceGuard(folder, data, { logins: "ask" });
        expect(g.start()).toBe(true);
        try { expect(judge(tool, "watch", gather(folder, data)).answer).toBe("pass"); } finally { g.stop(); }
      }
      expect(readFileSync(join(data, "m109-events.jsonl"), "utf8")).not.toContain("not-a-real-key");
    });
  }

  test("every row of the events log is redacted the same way: a key in a command never reaches the file", async () => {
    const { folder, data } = setup("claude");
    const key = "sk_live_1234567890abcdefghij";
    const g = practiceGuard(folder, data, { logins: "ask" });
    g.start();
    try {
      const guardCmd = commandIn(join(folder, HOOK_FILE.claude), "kill -0");
      for (const command of [`STRIPE_SECRET_KEY=${key} rm -rf build`, `cat .env ${key}`]) {
        const p = sh(guardCmd, shellIn("claude", command, folder), folder);
        await new Response(p.stdout).text();
        await p.exited;
      }
      await g.idle();
    } finally { g.stop(); }
    const log = readFileSync(join(data, "m109-events.jsonl"), "utf8");
    const types = log.split("\n").filter(Boolean).map((l) => (JSON.parse(l) as { type: string }).type);
    expect(types).toContain("saved");
    expect(types).toContain("asked");
    expect(types).toContain("ran");
    expect(log).not.toContain(key);
    expect(log).not.toContain("1234567890abcdefghij");
  });

  test("the shell script names no product in its temporary folders (names live in one place)", () => {
    const text = readFileSync(join(import.meta.dir, "..", "..", "scripts", "m109-session.sh"), "utf8");
    for (const l of text.split("\n").filter((x) => x.includes("mktemp"))) expect(l.toLowerCase()).not.toMatch(/squibby|companion/);
  });

  test("the script: next prints one step, record keeps the answer, results writes the RESULTS file", () => {
    const { data } = setup("gemini");
    const n = run("next", data);
    expect(n.status).toBe(0);
    expect(n.stdout).toContain("version");
    expect(run("record", data, "version", "pass", "0.31.0").status).toBe(0);
    expect(run("next", data).stdout).toContain("watch");
    expect(run("record", data, "nope", "pass").status).not.toBe(0);
    // The practice guard is not running, so the check refuses a PASS for watch.
    const refused = run("record", data, "watch", "pass");
    expect(refused.status).not.toBe(0);
    expect(refused.stderr).toContain("check does not agree");
    const out = tmp("out");
    const r = run("results", data, out);
    expect(r.status).toBe(0);
    const files = readdirSync(out);
    expect(files.length).toBe(1);
    expect(files[0]).toMatch(/^\d{4}-\d{2}-\d{2}-m109-gemini\.md$/);
    const back = parseResult(readFileSync(join(out, files[0]!), "utf8"))!;
    expect(back.version).toBe("0.31.0");
    expect(back.verdict).toBe("not finished");
    mkdirSync(join(out, "more"));
    const s = run("summary", out);
    expect(s.status).toBe(0);
    expect(s.stdout).toContain("Gemini CLI");
    expect(s.stdout).toContain("Claim only: none yet");
    // The summary covers the seven tools of this guide only; the M115 tools are proven in their own section.
    expect(s.stdout).toContain("seven tools in this guide");
    expect(s.stdout).toContain("M115");
  });
});
