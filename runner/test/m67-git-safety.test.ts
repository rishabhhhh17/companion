// M67 bug bash: a project script or a project tool that writes the person's git asks first (rule 10). evaluate() only, on
// temporary fixture folders.
import { afterAll, describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { evaluate } from "../src/safety.ts";

const made: string[] = [];
afterAll(() => { for (const d of made) rmSync(d, { recursive: true, force: true }); });
const project = (files: Record<string, string> = {}) => {
  const d = realpathSync(mkdtempSync(join(tmpdir(), "m67-git-"))); made.push(d);
  for (const [p, c] of Object.entries(files)) { mkdirSync(join(d, p, ".."), { recursive: true }); writeFileSync(join(d, p), c); }
  return d;
};
const bash = (command: string, p = project()) => evaluate({ tool: "Bash", input: { command } }, { project: p });

describe("tools that write git", () => {
  for (const c of ["npx git-cz", "npx cz", "npx simple-git-hooks", "npx lint-staged", "bunx lint-staged", "npx husky", "npx husky init", "npx husky@9 init", "npm exec git-cz", "npx standard-version", "npx release-it", "npx changeset version", "npx semantic-release"]) {
    test(`asks as git: ${c}`, () => {
      const v = bash(c);
      expect(v.decision).toBe("ask");
      expect(v.risk).toBe("git");
    });
  }
  test("a changeset of your own (no version) does not ask", () => { expect(bash("npx changeset status").decision).toBe("allow"); });
});

describe("package scripts", () => {
  const pkg = (scripts: Record<string, string>) => JSON.stringify({ name: "x", scripts });
  test("npm run of a script that commits asks as git, and says what it runs", () => {
    const p = project({ "package.json": pkg({ save: "git add -A && git commit -q -m wip", commit: "cz" }) });
    const v = bash("npm run save", p);
    expect(v.decision).toBe("ask");
    expect(v.risk).toBe("git");
    expect(v.reason).toMatch(/git commit/);
    expect(bash("npm run commit", p).risk).toBe("git");
    expect(bash("yarn save", p).risk).toBe("git");
    expect(bash("pnpm run save", p).risk).toBe("git");
    expect(bash("bun run save", p).risk).toBe("git");
  });
  test("npm install runs the project's prepare script: husky there asks as git", () => {
    const p = project({ "package.json": pkg({ prepare: "husky" }) });
    expect(bash("npm install", p).risk).toBe("git");
    expect(bash("npm ci", p).risk).toBe("git");
  });
  test("ordinary scripts still run without a card", () => {
    const p = project({ "package.json": pkg({ build: "vite build", test: "vitest run", dev: "cd ../other && vite", lint: "eslint ." }) });
    for (const c of ["npm run build", "npm test", "npm run dev", "npm run lint", "npm install", "npm run missing"]) expect(bash(c, p).decision).toBe("allow");
  });
  test("a script that runs itself again does not loop", () => {
    const p = project({ "package.json": pkg({ a: "npm run b", b: "npm run a" }) });
    expect(bash("npm run a", p).decision).toBe("allow");
  });
});

describe("script files that write git", () => {
  const commitPy = "import subprocess\nsubprocess.run([\"git\", \"add\", \"-A\"])\nsubprocess.run([\"git\", \"commit\", \"-m\", \"wip\"], check=True)\n";
  test("python3 scripts/commit.py, whose code runs git commit, asks as git and names the file", () => {
    const p = project({ "scripts/commit.py": commitPy });
    const v = bash("python3 scripts/commit.py", p);
    expect(v.decision).toBe("ask");
    expect(v.risk).toBe("git");
    expect(v.reason).toMatch(/scripts\/commit\.py/);
  });
  test("node, bun and python scripts that push, tag, set config or move a branch ask as git", () => {
    const p = project({
      "push.js": "const { execSync } = require('child_process');\nexecSync('git push origin main');\n",
      "hooks.mjs": "import { $ } from 'bun';\nawait $`git config core.hooksPath .hooks`;\n",
      "ref.ts": "Bun.spawnSync(['git', 'update-ref', 'refs/heads/main', 'HEAD~1']);\n",
      "stage.py": "import os\nos.system('git add .')\n",
    });
    for (const c of ["node push.js", "bun hooks.mjs", "bun run ref.ts", "python stage.py"]) {
      const v = bash(c, p);
      expect(v.decision).toBe("ask");
      expect(v.risk).toBe("git");
    }
  });
  test("a script that only reads git, or does not touch git, runs without a card", () => {
    const p = project({
      "log.py": "import subprocess\nprint(subprocess.check_output(['git', 'log', '--oneline']))\n",
      "build.js": "console.log('building');\n",
    });
    expect(bash("python3 log.py", p).decision).toBe("allow");
    expect(bash("node build.js", p).decision).toBe("allow");
  });
});
