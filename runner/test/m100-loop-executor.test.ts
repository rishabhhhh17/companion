// M100 (F29): the fixing loop's tools and where they run. The screen refuses before anyone is asked; the executor runs only
// inside the project, never through a link, and every command in the safety box with no key or token in its environment.
// Fixture folders only; no model, no network.
import { afterEach, describe, expect, test } from "bun:test";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { GIT_REFUSED, KEPT_FOLDER, NO_BOX, NOT_THIS_LOOP, OUTSIDE, SECRET_FILE, boxedExecutor, screen } from "../src/engine/messages-loop/executor.ts";
import { LOOP_LOOK_TOOLS, LOOP_TOOLS, LOOP_TOOL_DEFS, isLoopToolList, loopToolsFor } from "../src/engine/messages-loop/tools.ts";
import { NOT_GIVEN } from "../src/safety.ts";
import { boxReady, nestedSandbox } from "../src/proof/box.ts";
import type { RunOptions, RunResult } from "../src/proof/exec.ts";

const made: string[] = [];
afterEach(() => { while (made.length) rmSync(made.pop()!, { recursive: true, force: true }); });
const tmp = (l: string) => { const d = realpathSync(mkdtempSync(join(tmpdir(), `companion-m100-${l}-`))); made.push(d); return d; };
function project() {
  const p = tmp("p");
  mkdirSync(join(p, "src"), { recursive: true });
  writeFileSync(join(p, "src", "add.js"), "export const add = (a, b) => a - b;\n");
  writeFileSync(join(p, "README.md"), "A tiny adder.\n");
  writeFileSync(join(p, ".env"), "API_KEY=sk-live-should-never-be-read\n");
  mkdirSync(join(p, ".git"), { recursive: true }); writeFileSync(join(p, ".git", "HEAD"), "ref: refs/heads/main\n");
  mkdirSync(join(p, "node_modules", "dep"), { recursive: true }); writeFileSync(join(p, "node_modules", "dep", "add.js"), "nope");
  return p;
}
const call = (name: string, input: Record<string, unknown>) => ({ name, input });
const ok: RunResult = { code: 0, signal: null, stdout: "ok", stderr: "", timedOut: false, ms: 1 };

describe("the loop's tools", () => {
  test("the same names and input fields as a Claude Code task, and nothing that hands work away or leaves the project", () => {
    expect(LOOP_TOOLS).toEqual(["Read", "Glob", "Grep", "Edit", "Write", "Bash"]);
    for (const t of LOOP_TOOLS) expect(NOT_GIVEN.has(t)).toBe(false);
    for (const t of ["Agent", "Task", "EnterWorktree", "ExitWorktree", "WebFetch", "WebSearch"]) expect(LOOP_TOOLS).not.toContain(t);
    expect(LOOP_TOOL_DEFS.find((t) => t.name === "Edit")!.input_schema.required).toEqual(["file_path", "old_string", "new_string"]);
  });
  test("looking only gets only the looking tools; a flow's own list is honoured, never widened", () => {
    expect(loopToolsFor({ planOnly: true }).map((t) => t.name)).toEqual([...LOOP_LOOK_TOOLS]);
    expect(loopToolsFor({ tools: ["Read", "Bash", "WebSearch", "Agent"] }).map((t) => t.name)).toEqual(["Read", "Bash"]);
    expect(loopToolsFor({ planOnly: true, tools: ["Read", "Bash"] }).map((t) => t.name)).toEqual(["Read"]);
    expect(isLoopToolList(loopToolsFor({}))).toBe(true);
    expect(isLoopToolList([])).toBe(false);
  });
});

describe("the screen: refused before anyone is asked", () => {
  const p = "/nonexistent-m100-project";
  test("every git write, in any part of a command, in any spelling", () => {
    for (const c of ["git commit -am fix", "git add .", "npm test && git push", "git -C . add -A", "git --no-pager commit -m x", "cd src && git stash", "git config user.name x", "git checkout -- .", "git reset --hard", "echo hi; git tag v1", "node -e \"require('child_process').execSync('git commit -m x')\"", "git init", "git clean -fdx"]) {
      expect(screen(call("Bash", { command: c }), p), c).toBe(GIT_REFUSED);
    }
  });
  test("git that only looks is not refused here (the runner's own judge decides it)", () => {
    for (const c of ["git status", "git diff", "git log --oneline -5", "npm test", "ls src"]) expect(screen(call("Bash", { command: c }), p), c).toBeNull();
  });
  test("M100 review: git words inside a search or a message are not a git write", () => {
    for (const c of ['grep -r "git commit" .', 'echo "then git add"', "grep -rn 'git push' src", 'cat notes.md | grep "git reset"', 'rg "git checkout" -g "*.md"']) expect(screen(call("Bash", { command: c }), p), c).toBeNull();
  });
  test("M100 review: git run through a wrapper, a shell string, a pipe into a shell or code is still refused", () => {
    for (const c of ["env FOO=1 git add .", "/usr/bin/git push", "xargs git add", 'sh -c "git commit -m x"', 'bash -lc "npm test && git push"', 'echo "git commit -m x" | sh', "python3 -c \"import os; os.system('git commit -m x')\"", "nice -n 5 git reset --hard", "FOO=1 git stash", "ls $(git add .)", "find . -name x.js -exec git add {} +"]) {
      expect(screen(call("Bash", { command: c }), p), c).toBe(GIT_REFUSED);
    }
  });
  test("a file outside the project, in a kept folder, or a settings or key file", () => {
    const pr = project();
    expect(screen(call("Read", { file_path: "../other/x.js" }), pr)).toBe(OUTSIDE);
    expect(screen(call("Read", { file_path: "/etc/hosts" }), pr)).toBe(OUTSIDE);
    expect(screen(call("Read", { file_path: "~/.ssh/id_rsa" }), pr)).toBe(OUTSIDE);
    expect(screen(call("Write", { file_path: ".git/config", content: "x" }), pr)).toBe(KEPT_FOLDER);
    expect(screen(call("Edit", { file_path: ".companion/rules.json", old_string: "a", new_string: "b" }), pr)).toBe(KEPT_FOLDER);
    expect(screen(call("Write", { file_path: ".claude/settings.json", content: "{}" }), pr)).toBe(KEPT_FOLDER);
    expect(screen(call("Read", { file_path: ".env" }), pr)).toBe(SECRET_FILE);
    expect(screen(call("Read", { file_path: "config/id_rsa" }), pr)).toBe(SECRET_FILE);
    expect(screen(call("Grep", { pattern: "x", path: "/Users" }), pr)).toBe(OUTSIDE);
    expect(screen(call("Read", { file_path: "src/add.js" }), pr)).toBeNull();
    expect(screen(call("Read", { file_path: join(pr, "src/add.js") }), pr)).toBeNull();
    expect(screen(call("Grep", { pattern: "x" }), pr)).toBeNull();
    expect(screen(call("Glob", { pattern: "**/*.js", path: pr }), pr)).toBeNull();
  });
  test("a tool this loop does not have", () => {
    for (const t of ["Agent", "Task", "WebFetch", "EnterWorktree", "mcp__google__gmail_read", "TodoWrite"]) expect(screen(call(t, {}), p), t).toBe(NOT_THIS_LOOP);
  });
});

describe("the executor: files", () => {
  test("read, edit and write inside the project", async () => {
    const pr = project(), ex = boxedExecutor({ boxReady: () => false });
    const r = await ex(call("Read", { file_path: "src/add.js" }), { project: pr });
    expect(r.ok).toBe(true); expect(r.output).toContain("a - b");
    expect((await ex(call("Edit", { file_path: "src/add.js", old_string: "a - b", new_string: "a + b" }), { project: pr })).ok).toBe(true);
    expect(readFileSync(join(pr, "src", "add.js"), "utf8")).toContain("a + b");
    expect((await ex(call("Write", { file_path: "test/add.test.js", content: "ok" }), { project: pr })).ok).toBe(true);
    expect(readFileSync(join(pr, "test", "add.test.js"), "utf8")).toBe("ok");
  });
  test("an edit whose text is missing or appears twice changes nothing and says why", async () => {
    const pr = project(), ex = boxedExecutor({ boxReady: () => false });
    writeFileSync(join(pr, "two.js"), "x\nx\n");
    expect((await ex(call("Edit", { file_path: "two.js", old_string: "x", new_string: "y" }), { project: pr })).output).toMatch(/2 times/);
    expect((await ex(call("Edit", { file_path: "two.js", old_string: "zzz", new_string: "y" }), { project: pr })).output).toMatch(/not found/);
    expect(readFileSync(join(pr, "two.js"), "utf8")).toBe("x\nx\n");
  });
  test("never through a link: a link inside the project to a file outside is neither read nor written", async () => {
    const pr = project(), outside = tmp("o"), ex = boxedExecutor({ boxReady: () => false });
    writeFileSync(join(outside, "secret.txt"), "outside words");
    symlinkSync(join(outside, "secret.txt"), join(pr, "link.txt"));
    symlinkSync(outside, join(pr, "linkdir"));
    const r = await ex(call("Read", { file_path: "link.txt" }), { project: pr });
    expect(r.ok).toBe(false); expect(r.output).not.toContain("outside words");
    expect((await ex(call("Write", { file_path: "linkdir/new.txt", content: "x" }), { project: pr })).ok).toBe(false);
    expect((await ex(call("Write", { file_path: "link.txt", content: "x" }), { project: pr })).ok).toBe(false);
    expect(existsSync(join(outside, "new.txt"))).toBe(false);
    expect(readFileSync(join(outside, "secret.txt"), "utf8")).toBe("outside words");
  });
  test("a write is refused in kept folders and for key files, whatever the runner said", async () => {
    const pr = project(), ex = boxedExecutor({ boxReady: () => false });
    expect((await ex(call("Write", { file_path: ".git/HEAD", content: "x" }), { project: pr })).output).toBe(KEPT_FOLDER);
    expect((await ex(call("Write", { file_path: ".env", content: "x" }), { project: pr })).output).toBe(SECRET_FILE);
    expect(readFileSync(join(pr, ".git", "HEAD"), "utf8")).toContain("refs/heads/main");
  });
  test("Glob and Grep skip installed packages, git's folder and key files", async () => {
    const pr = project(), ex = boxedExecutor({ boxReady: () => false });
    const g = await ex(call("Glob", { pattern: "**/add.js" }), { project: pr });
    expect(g.output).toBe("src/add.js");
    const s = await ex(call("Grep", { pattern: "sk-live|a - b|nope|refs" }), { project: pr });
    expect(s.output).toContain("src/add.js:1:");
    expect(s.output).not.toContain("sk-live"); expect(s.output).not.toContain("nope"); expect(s.output).not.toContain("refs/heads");
  });
});

describe("the executor: commands", () => {
  test("every command runs in the safety box, with no internet, and the task's stop signal", async () => {
    const pr = project(), seen: { command: string; o: RunOptions }[] = [];
    const ex = boxedExecutor({ boxReady: () => true, run: async (command, o) => { seen.push({ command, o }); return ok; } });
    const stop = new AbortController();
    const r = await ex(call("Bash", { command: "npm test" }), { project: pr, signal: stop.signal });
    expect(r.ok).toBe(true);
    expect(seen[0].o.box).toEqual({ project: pr, net: "local" });
    expect(seen[0].o.cwd).toBe(pr);
    expect(seen[0].o.signal).toBe(stop.signal);
    expect(seen[0].o.env).toBeUndefined();   // only the short allow list runCommand always uses (env.ts minimalEnv)
  });
  test("only an install the person was asked about gets the internet; a project install with no card does not", async () => {
    const pr = project(), seen: RunOptions[] = [];
    const ex = boxedExecutor({ boxReady: () => true, run: async (_c, o) => { seen.push(o); return ok; } });
    await ex(call("Bash", { command: "pip install requests" }), { project: pr });   // asks first (safety.ts), so it ran after a yes
    await ex(call("Bash", { command: "npm install left-pad" }), { project: pr });   // no card: no internet, the checks install
    await ex(call("Bash", { command: "curl https://example.com" }), { project: pr });
    expect(seen.map((o) => o.box?.net)).toEqual(["open", "local", "local"]);
  });
  test("with no box on this Mac, nothing runs at all", async () => {
    const pr = project(); let ran = 0;
    const ex = boxedExecutor({ boxReady: () => false, run: async () => { ran++; return ok; } });
    const r = await ex(call("Bash", { command: "echo hi" }), { project: pr });
    expect(r).toEqual({ ok: false, output: NO_BOX });
    expect(ran).toBe(0);
  });
  test("a git write that reached the executor anyway is still refused, and never run", async () => {
    const pr = project(); let ran = 0;
    const ex = boxedExecutor({ boxReady: () => true, run: async () => { ran++; return ok; } });
    expect((await ex(call("Bash", { command: "npm test && git commit -am x" }), { project: pr })).output).toBe(GIT_REFUSED);
    expect(ran).toBe(0);
  });
  test("a command's output is cut to its end and keys in it are hidden", async () => {
    const pr = project();
    const ex = boxedExecutor({ boxReady: () => true, run: async () => ({ ...ok, code: 1, stdout: "x".repeat(50_000) + "\nANTHROPIC_API_KEY=sk-ant-api03-" + "a".repeat(40) + "\nError: 1 failing" }) });
    const r = await ex(call("Bash", { command: "npm test" }), { project: pr });
    expect(r.ok).toBe(false);
    expect(r.output.length).toBeLessThan(21_000);
    expect(r.output).toContain("1 failing"); expect(r.output).toContain("[exit code 1]");
    expect(r.output).not.toContain("a".repeat(40));
  });
});

// The real box, when this Mac can make one (not inside another app's sandbox): no key or token reaches a command, and a
// command cannot write git's folder or outside the project.
const real = boxReady() && !(await nestedSandbox());
describe.if(real)("the executor in the real safety box", () => {
  test("no key, token or account setting reaches a command", async () => {
    const pr = project();
    const was = { ...process.env };
    process.env.ANTHROPIC_API_KEY = "sk-ant-api03-" + "k".repeat(40);
    process.env.COMPANION_TEST_TOKEN = "cmp_" + "t".repeat(40);
    process.env.CLAUDE_CODE_OAUTH_TOKEN = "sk-ant-oat01-" + "o".repeat(40);
    try {
      const r = await boxedExecutor()(call("Bash", { command: "env" }), { project: pr });
      expect(r.ok).toBe(true);
      for (const s of ["k".repeat(40), "t".repeat(40), "o".repeat(40), "ANTHROPIC", "COMPANION_TEST_TOKEN", "OAUTH"]) expect(r.output).not.toContain(s);
    } finally { process.env = was; }
  });
  test("a command cannot write git's folder or outside the project", async () => {
    const pr = project(), outside = tmp("o");
    // A write into .git named in the command is refused before it runs; one a script makes is stopped by the box.
    expect((await boxedExecutor()(call("Bash", { command: "echo x > .git/HEAD" }), { project: pr })).output).toBe(GIT_REFUSED);
    writeFileSync(join(pr, "sneak.sh"), "echo x > .git/HEAD\n");
    await boxedExecutor()(call("Bash", { command: "sh sneak.sh" }), { project: pr });
    await boxedExecutor()(call("Bash", { command: `echo y > ${JSON.stringify(join(outside, "y.txt"))}; echo z > inside.txt` }), { project: pr });
    expect(readFileSync(join(pr, ".git", "HEAD"), "utf8")).toContain("refs/heads/main");
    expect(existsSync(join(outside, "y.txt"))).toBe(false);
    expect(readFileSync(join(pr, "inside.txt"), "utf8")).toBe("z\n");
  });
});
