// Safety rules live in code, not in prompts (rule 12). These decide every tool call.
import { afterEach, describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync, realpathSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { evaluate, buildChildEnv, type Verdict } from "../src/safety.ts";

const made: string[] = [];
afterEach(() => { while (made.length) rmSync(made.pop()!, { recursive: true, force: true }); });
function proj(): string {
  const d = realpathSync(mkdtempSync(join(tmpdir(), "companion-safety-")));
  made.push(d);
  return d;
}
const bash = (project: string, command: string, opts = {}): Verdict => evaluate({ tool: "Bash", input: { command } }, { project, ...opts });
const write = (project: string, tool: string, file_path: string): Verdict => evaluate({ tool, input: { file_path } }, { project });

describe("writes stay inside the project", () => {
  test("a write to ../outside.txt is denied, even though edits are otherwise auto approved", () => {
    const p = proj();
    const v = write(p, "Write", join(p, "../outside.txt"));
    expect(v.decision).toBe("deny");
    expect(v.risk).toBe("outside_project");
  });
  test("an absolute path elsewhere is denied", () => {
    expect(write(proj(), "Edit", "/etc/hosts").decision).toBe("deny");
    expect(write(proj(), "Write", "/Users/someone/.zshrc").decision).toBe("deny");
  });
  test("a relative path that climbs out is denied", () => {
    const p = proj();
    expect(evaluate({ tool: "Write", input: { file_path: "../../x.txt" } }, { project: p }).decision).toBe("deny");
  });
  test("a symlink inside the project that points outside is denied", () => {
    const p = proj();
    const outside = proj();
    symlinkSync(outside, join(p, "escape"));
    expect(write(p, "Write", join(p, "escape/stolen.txt")).decision).toBe("deny");
  });
  test("a write inside the project is allowed, including new folders", () => {
    const p = proj();
    expect(write(p, "Write", join(p, "src/new/file.ts")).decision).toBe("allow");
    expect(evaluate({ tool: "Edit", input: { file_path: "src/a.ts" } }, { project: p }).decision).toBe("allow");
  });
  test("the project's own .git folder is never written by an agent tool", () => {
    const p = proj();
    mkdirSync(join(p, ".git"));
    expect(write(p, "Write", join(p, ".git/config")).decision).toBe("deny");
    expect(write(p, "Edit", join(p, ".git/hooks/pre-commit")).decision).toBe("deny");
  });
  test("a path that only starts with the project name is not inside it", () => {
    const p = proj();
    expect(write(p, "Write", p + "-evil/x.txt").decision).toBe("deny");
  });
  test("NotebookEdit is checked like Write", () => {
    expect(write(proj(), "NotebookEdit", "/tmp/x.ipynb").decision).toBe("deny");
  });
  test("reading is allowed anywhere inside the project, and tools we don't know are refused", () => {
    const p = proj();
    expect(evaluate({ tool: "Read", input: { file_path: join(p, "a.txt") } }, { project: p }).decision).toBe("allow");
    expect(evaluate({ tool: "Mystery", input: {} }, { project: p }).decision).toBe("ask");
  });
});

describe("commands that would change the user's git need a tap (F13, decision A for push)", () => {
  const needsTap = [
    "git commit -m x", "git checkout main", "git switch -c feature", "git reset --hard HEAD~1", "git branch -D old", "git stash",
    "git rebase main", "git merge feature", "git tag v1", "git push", "git push origin main --force", "git pull", "git cherry-pick abc",
    "git revert HEAD", "git clean -fd", "git add -A", "git init", "git restore a.txt",
    "git -C . commit -m x", "git -c user.name=x commit -m y", "cd app && git push", "npm test; git push origin main",
    "echo hi | git commit -F -", "sh -c 'git push'", "bash -lc \"git reset --hard\"", "env FOO=1 git push", "command git commit -m x", "time git checkout .",
    "(git commit -m x)", "echo $(git push)",
  ];
  for (const c of needsTap) {
    test(`asks: ${c}`, () => {
      const v = bash(proj(), c);
      expect(v.decision, c).toBe("ask");
      expect(v.risk, c).toBe("git");
    });
  }
  test("git push is flagged as not undoable", () => {
    expect(bash(proj(), "git push origin main").undoable).toBe(false);
  });
  const readOnly = ["git status", "git diff", "git log --oneline", "git show HEAD", "git branch", "git branch --list", "git stash list", "git tag", "git -C app status", "git remote -v", "git fetch"];
  for (const c of readOnly) test(`allowed (read only): ${c}`, () => expect(bash(proj(), c).decision, c).toBe("allow"));

  test("a commit the user asked for in this task may pass, but a push still needs a tap", () => {
    const p = proj();
    expect(bash(p, "git add -A && git commit -m done", { userAskedCommit: true }).decision).toBe("allow");
    expect(bash(p, "git push", { userAskedCommit: true }).decision).toBe("ask");
    expect(bash(p, "git reset --hard", { userAskedCommit: true }).decision).toBe("ask");
  });
});

describe("other dangerous commands", () => {
  test("sudo is denied outright", () => {
    expect(bash(proj(), "sudo rm -rf /").decision).toBe("deny");
    expect(bash(proj(), "echo hi && sudo ls").decision).toBe("deny");
  });
  test("deleting outside the project is denied", () => {
    const p = proj();
    expect(bash(p, "rm -rf /").decision).toBe("deny");
    expect(bash(p, "rm -rf ~/Documents").decision).toBe("deny");
    expect(bash(p, "rm -rf ../other").decision).toBe("deny");
    expect(bash(p, "rm -rf $HOME").decision).toBe("deny");
  });
  test("deleting inside the project is allowed (undo covers it)", () => {
    const p = proj();
    expect(bash(p, "rm -rf node_modules dist").decision).toBe("allow");
    expect(bash(p, `rm ${join(p, "old.txt")}`).decision).toBe("allow");
  });
  const irreversible = [
    "npx wrangler deploy", "vercel deploy --prod", "netlify deploy --prod", "npm publish", "supabase db push", "prisma migrate deploy",
    "psql postgres://user@db.example.com/prod -c 'drop table x'", "curl -X POST https://api.example.com/send", "curl -d 'a=1' https://x.example.com", "pnpm publish",
  ];
  for (const c of irreversible) {
    test(`asks and is marked not undoable: ${c}`, () => {
      const v = bash(proj(), c);
      expect(v.decision, c).toBe("ask");
      expect(v.undoable, c).toBe(false);
    });
  }
  test("installing things on the Mac needs a tap", () => {
    expect(bash(proj(), "npm i -g typescript").risk).toBe("install");
    expect(bash(proj(), "brew install ffmpeg").risk).toBe("install");
    expect(bash(proj(), "npm install -g pnpm").decision).toBe("ask");
  });
  // technical_research section 6: an install on the Mac is outside the project, so Undo cannot take it back.
  for (const c of ["npm i -g typescript", "npm install --global pnpm", "pnpm add -g x", "yarn global add pnpm", "brew install ffmpeg", "brew upgrade", "brew uninstall wget", "gem install rails", "port install x", "apt-get install x"]) {
    test(`an install on the Mac is marked not undoable: ${c}`, () => {
      const v = bash(proj(), c);
      expect(v.decision, c).toBe("ask");
      expect(v.risk, c).toBe("install");
      expect(v.undoable, c).toBe(false);
    });
  }
  test("pip install outside a project environment is marked not undoable", () => {
    const was = process.env.VIRTUAL_ENV;
    delete process.env.VIRTUAL_ENV;
    try { expect(bash(proj(), "pip install requests")).toMatchObject({ decision: "ask", risk: "install", undoable: false }); }
    finally { if (was !== undefined) process.env.VIRTUAL_ENV = was; }
  });
  test("ordinary project commands are allowed", () => {
    const p = proj();
    for (const c of ["npm install", "npm run build", "bun test", "ls -la", "cat package.json", "node script.js", "curl https://example.com/data.json", "mkdir -p src && touch src/a.ts"]) {
      expect(bash(p, c).decision, c).toBe("allow");
    }
  });
  test("curl that only reads is allowed; any database command asks, because Undo cannot bring back database changes", () => {
    const p = proj();
    expect(bash(p, "curl -s https://example.com").decision).toBe("allow");
    expect(bash(p, "psql postgres://localhost/dev -c 'select 1'").decision).toBe("ask");
  });
});

describe("the agent's commands never see your key (rule 2)", () => {
  const parent = {
    PATH: "/usr/bin", HOME: "/Users/x", ANTHROPIC_API_KEY: "sk-ant-secret", ANTHROPIC_AUTH_TOKEN: "tok", CLAUDE_CODE_OAUTH_TOKEN: "oauth",
    CLAUDE_CODE_USE_BEDROCK: "1", AWS_SECRET_ACCESS_KEY: "aws", OPENAI_API_KEY: "sk-openai", GITHUB_TOKEN: "ghp_x", FOO: "bar",
  };
  test("the API key route passes the key to Claude Code and scrubs it from child commands", () => {
    const e = buildChildEnv(parent, { route: "api_key", apiKey: "sk-ant-from-keychain" });
    expect(e.ANTHROPIC_API_KEY).toBe("sk-ant-from-keychain");
    expect(e.CLAUDE_CODE_SUBPROCESS_ENV_SCRUB).toBe("1");
  });
  test("the plan route removes every variable that could supply a key or token", () => {
    const e = buildChildEnv(parent, { route: "plan" });
    for (const k of ["ANTHROPIC_API_KEY", "ANTHROPIC_AUTH_TOKEN", "CLAUDE_CODE_OAUTH_TOKEN", "CLAUDE_CODE_USE_BEDROCK", "CLAUDE_CODE_USE_VERTEX", "ANTHROPIC_BASE_URL", "CLAUDE_CONFIG_DIR_KEY"]) {
      expect(e[k], k).toBeUndefined();
    }
    expect(e.CLAUDE_CODE_SUBPROCESS_ENV_SCRUB).toBe("1");
  });
  test("settings and memory switches are set so nothing outside our control loads", () => {
    const e = buildChildEnv(parent, { route: "plan" });
    expect(e.CLAUDE_CODE_DISABLE_AUTO_MEMORY).toBe("1");
    expect(e.DISABLE_UPDATES).toBe("1");
    expect(e.PATH).toBe("/usr/bin");
    expect(e.HOME).toBe("/Users/x");
  });
  test("the key is never copied under another name", () => {
    const e = buildChildEnv(parent, { route: "api_key", apiKey: "sk-ant-from-keychain" });
    const copies = Object.entries(e).filter(([k, v]) => v === "sk-ant-from-keychain" && k !== "ANTHROPIC_API_KEY");
    expect(copies).toEqual([]);
  });
  test("the parent's key is not used on the API route, only the one from the Keychain", () => {
    const e = buildChildEnv(parent, { route: "api_key", apiKey: "sk-ant-from-keychain" });
    expect(Object.values(e)).not.toContain("sk-ant-secret");
  });
  test("an API key route without a key is an error, not an empty variable", () => {
    expect(() => buildChildEnv(parent, { route: "api_key" })).toThrow(/key/i);
  });
});
