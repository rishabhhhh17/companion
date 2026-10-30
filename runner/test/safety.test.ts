// Safety rules live in code, not in prompts (rule 12). These decide every tool call.
import { afterEach, describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync, realpathSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { evaluate, evaluateReadOnly, buildChildEnv, type Verdict } from "../src/safety.ts";

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

// M45 (Tell the truth): Undo puts back project files from a shadow snapshot. It never touches .git (rule 10) and never
// takes back anything that left the Mac, so a card that asks about one of those must never say Undo can take it back.
// Decisions do not change anywhere: only the undoable flag, the house rule risk and the reason words do.
describe("M45: what Undo can take back", () => {
  const DEEP = 'sh -c "sh -c \\"sh -c \\\\\\"sh -c \\\\\\\\\\\\\\"sh -c \\\\\\\\\\\\\\\\\\\\\\\\\\\\\\"sh -c x\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\"\\\\\\\\\\\\\\"\\\\\\"\\""';
  const IRREVERSIBLE_BASH = ["sh x.sh", "./deploy.sh", "xargs rm", "bun -e 1", "node <<EOF\nconsole.log(1)\nEOF", "python -c 'print(1)'", "find src -exec rm {} \;", "find src -delete", "$CMD y", "rm $(cat list)", "echo hi > $F", "npm config set x y", DEEP];
  const IRREVERSIBLE_TOOLS: [string, Record<string, unknown>][] = [["Mystery", {}], ["mcp__google__foo", {}], ["Bash", {}], ["TaskStop", { task_id: "x" }], ["KillShell", { shell_id: "x" }]];
  const GIT_WRITES = ["git commit -m x", "git add .", "git reset --hard", "git checkout main", "git switch main", "git restore a.txt", "git merge x", "git rebase main", "git cherry-pick abc", "git revert abc", "git pull", "git clean -fdx", "git rm a.txt", "git mv a.txt b.txt", "git stash", "git tag -a v1 -m x", "git branch -d x", "git remote add o https://x.example.com/r.git", "git config user.name x", "git -C ../other commit -m x"];
  const READS = ["cat /etc/hosts", "cat < $F", "cat < /etc/hosts", "cpio -o < list", "tar -c -T list -f a.tar", "zip -@ a.zip", "gzip -d /tmp/x.gz", "git diff /etc/hosts"];
  const tool = (p: string, name: string, input: Record<string, unknown>) => evaluate({ tool: name, input }, { project: p });

  test("every irreversible ask is not undoable", () => {
    const p = proj();
    for (const c of IRREVERSIBLE_BASH) expect(bash(p, c), c).toMatchObject({ decision: "ask", risk: "irreversible", undoable: false });
    for (const [name, input] of IRREVERSIBLE_TOOLS) expect(tool(p, name, input), name).toMatchObject({ decision: "ask", risk: "irreversible", undoable: false });
  });
  test("every git write is not undoable", () => {
    const p = proj();
    for (const c of GIT_WRITES) expect(bash(p, c), c).toMatchObject({ decision: "ask", undoable: false });
    expect(bash(p, "git -C ../other commit -m x").risk).toBe("outside_project");
    expect(bash(p, "git commit -m x").risk).toBe("git");
  });
  test("reading output of a program this task did not start is a read, which Undo has nothing to take back from", () => {
    expect(tool(proj(), "BashOutput", { bash_id: "x" })).toMatchObject({ decision: "ask", risk: "outside_project", undoable: true });
  });
  test("reads outside the project and private settings asks keep their undo fact", () => {
    const p = proj();
    for (const c of READS) expect(bash(p, c), c).toMatchObject({ decision: "ask", risk: "outside_project", undoable: true });
    expect(tool(p, "Read", {})).toMatchObject({ decision: "ask", risk: "outside_project", undoable: true });
    expect(tool(p, "Read", { file_path: "/etc/hosts" })).toMatchObject({ decision: "ask", risk: "outside_project", undoable: true });
    expect(tool(p, "Write", { file_path: ".env", content: "SITE_NAME=x" })).toMatchObject({ decision: "ask", risk: "settings", undoable: true });
    expect(bash(p, "echo SITE_NAME=x >> .env")).toMatchObject({ decision: "ask", risk: "settings", undoable: true });
  });
  // Taken from the code as it was before M45, so a change in a word or a flag can never move a decision.
  const BEFORE: Record<string, "allow" | "ask" | "deny"> = {
    "sh x.sh": "ask", "./deploy.sh": "ask", "xargs rm": "ask", "bun -e 1": "ask", "node <<EOF\nconsole.log(1)\nEOF": "ask", "python -c 'print(1)'": "ask",
    "find src -exec rm {} \;": "ask", "find src -delete": "ask", "$CMD y": "ask", "rm $(cat list)": "ask", "echo hi > $F": "ask", "npm config set x y": "ask", [DEEP]: "ask",
    "git commit -m x": "ask", "git add .": "ask", "git reset --hard": "ask", "git checkout main": "ask", "git switch main": "ask", "git restore a.txt": "ask", "git merge x": "ask",
    "git rebase main": "ask", "git cherry-pick abc": "ask", "git revert abc": "ask", "git pull": "ask", "git clean -fdx": "ask", "git rm a.txt": "ask", "git mv a.txt b.txt": "ask",
    "git stash": "ask", "git tag -a v1 -m x": "ask", "git branch -d x": "ask", "git remote add o https://x.example.com/r.git": "ask", "git config user.name x": "ask",
    "git -C ../other commit -m x": "ask", "git -C ../other status": "ask", "GIT_SSH=x git fetch": "ask", "git -c core.x=y status": "ask", "git push": "ask", "git reflog expire --all": "ask",
    "cat /etc/hosts": "ask", "cat < $F": "ask", "cat < /etc/hosts": "ask", "cpio -o < list": "ask", "tar -c -T list -f a.tar": "ask", "zip -@ a.zip": "ask", "gzip -d /tmp/x.gz": "ask",
    "git diff /etc/hosts": "ask", "brew install ffmpeg": "ask", "docker run x": "ask", "npm i -g x": "ask",
    "git status": "allow", "git diff": "allow", "git log": "allow", "git fetch": "allow", "node < x": "allow", "`x` y": "allow", "rm -rf node_modules dist": "allow", "npm install": "allow",
    "rm -rf /": "deny", "sudo ls": "deny", "rm -rf ~/Documents": "deny",
  };
  test("decisions did not change", () => {
    const p = proj();
    for (const [c, d] of Object.entries(BEFORE)) expect(bash(p, c).decision, c).toBe(d);
    for (const [name, input] of [...IRREVERSIBLE_TOOLS, ["BashOutput", { bash_id: "x" }] as [string, Record<string, unknown>], ["Read", {}] as [string, Record<string, unknown>]]) expect(tool(p, name, input).decision, name).toBe("ask");
  });
  test("git reads still allowed", () => {
    const p = proj();
    for (const c of ["git status", "git diff", "git log", "git fetch"]) expect(bash(p, c), c).toMatchObject({ decision: "allow" });
  });
  test("a commit the person asked for lands in Cannot be undone", () => {
    expect(bash(proj(), "git commit -m x", { userAskedCommit: true })).toMatchObject({ decision: "allow", undoable: false });
    expect(bash(proj(), "git add .", { userAskedCommit: true })).toMatchObject({ decision: "allow", undoable: false });
  });
  test("a part that asks never makes a commit next to it look undoable", () => {
    // The stricter part decides, but Undo can take the whole command back only if it can take back every part (M45).
    const p = proj();
    for (const c of ["git commit -m x && cat ../other.txt", "cat /etc/hosts && git commit -m x", "git add . ; cat ../f"]) {
      expect(bash(p, c, { userAskedCommit: true }), c).toMatchObject({ decision: "ask", undoable: false });
    }
    // Two parts that can both be taken back stay undoable.
    expect(bash(p, "cat ../a.txt && cat ../b.txt")).toMatchObject({ decision: "ask", undoable: true });
  });
  test("reasons are plain", () => {
    const was = process.env.VIRTUAL_ENV; delete process.env.VIRTUAL_ENV;
    try {
      const p = proj();
      const changed = [
        ...[...IRREVERSIBLE_BASH, ...GIT_WRITES, ...READS, "git -C ../other status", "GIT_SSH=x git fetch", "git -c core.x=y status", "git push", "git reflog expire --all", "brew install ffmpeg", "pip install requests", "docker run x", "npm i -g x"].map((c) => bash(p, c)),
        ...[...IRREVERSIBLE_TOOLS, ["BashOutput", { bash_id: "x" }] as [string, Record<string, unknown>], ["Read", {}] as [string, Record<string, unknown>], ["Read", { file_path: "/etc/hosts" }] as [string, Record<string, unknown>]].map(([n, i]) => tool(p, n, i)),
      ];
      for (const v of changed) {
        expect(v.reason, v.reason).not.toMatch(/I cannot|cannot check|—/);
        // One full sentence: a capital first (or the path it names), and a full stop at the end.
        expect(v.reason, v.reason).toMatch(/^([A-Z]|\/|\.\.)/);
        expect(v.reason.endsWith("."), v.reason).toBe(true);
      }
      expect(bash(p, "sh x.sh").reason).toBe("This runs a script. What a script does can't be checked first.");
      expect(bash(p, "git push").reason).toBe("This sends your work to another computer.");
      expect(bash(p, "git commit -m x").reason).toBe("This changes your project's Git history.");
      expect(bash(p, "cat /etc/hosts").reason).toBe("/etc/hosts is outside your project folder.");
      expect(tool(p, "Mystery", {}).reason).toBe("This uses a tool that has not been checked yet (Mystery). It might send or change something.");
      // A read only part adds its own sentence, with one full stop between them.
      expect(evaluateReadOnly({ tool: "Bash", input: { command: "sh x.sh" } }, { project: p }).reason).not.toContain("..");
    } finally { if (was !== undefined) process.env.VIRTUAL_ENV = was; }
  });
});
