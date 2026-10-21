import { describe, expect, test } from "bun:test";
import { evaluate, evaluateReadOnly, isSettingsFile, taskScopeCovers } from "../src/safety.ts";
import { parseEvent } from "../../protocol/index.ts";

// T05 says the safety hook denies edits to .env files unless the step is about settings; the real run of 22 Oct 2026 found the hook allowed
// every one (Edit, Write, a shell redirect), with no card. Now any write to a private settings file asks, showing setting NAMES only.
const P = "/tmp/companion-settings-guard-project";
const ctx = { project: P } as never;
const ed = (file: string, new_string: string, tool = "Edit") => evaluate({ tool, input: { file_path: file, old_string: "x", new_string } } as never, ctx);
const sh = (command: string) => evaluate({ tool: "Bash", input: { command } } as never, ctx);

describe("which files are private settings files", () => {
  test("the dotenv family and name.env, in any folder of the project", () => {
    for (const f of [".env", ".env.local", ".env.production", ".env.development.local", "apps/web/.env", "config/prod.env", "/x/.ENV"]) expect(isSettingsFile(f), f).toBe(true);
  });
  test("not the templates people share, and not other files", () => {
    for (const f of [".env.example", ".env.sample", ".env.template", ".env.dist", ".env.defaults", "env.ts", "src/environment.js", "README.md", "config/env.json", "secrets.ts"]) expect(isSettingsFile(f), f).toBe(false);
  });
});

describe("file tools: a write to a settings file asks, with names only", () => {
  for (const f of [".env", ".env.local", "apps/web/.env", "config/prod.env"]) test(f, () => {
    const v = ed(`${P}/${f}`, "SITE_NAME=Demo Shop\n");
    expect(v.decision).toBe("ask");
    expect(v.risk).toBe("settings");
    expect(v.reason).toMatch(/private settings file/);
    expect(v.reason).toContain("SITE_NAME");
    expect(v.reason).not.toContain("Demo Shop");
    expect(v.undoable).toBe(true);
  });
  test("Write, MultiEdit and a line replaced in place all ask", () => {
    expect(evaluate({ tool: "Write", input: { file_path: `${P}/.env`, content: "SITE_NAME=Demo Shop\nSHOP_CURRENCY=GBP\n" } } as never, ctx).reason).toMatch(/SITE_NAME, SHOP_CURRENCY/);
    const m = evaluate({ tool: "MultiEdit", input: { file_path: `${P}/.env`, edits: [{ old_string: "a", new_string: "ONE=1" }, { old_string: "b", new_string: "TWO=2" }] } } as never, ctx);
    expect([m.decision, m.risk, m.reason]).toEqual(["ask", "settings", expect.stringMatching(/ONE, TWO/)]);
  });
  test("with no name to show it still asks, in plain words", () => {
    const v = ed(`${P}/.env`, "just some text");
    expect([v.decision, v.risk]).toEqual(["ask", "settings"]);
    expect(v.reason).not.toContain("just some text");
  });
  test("templates are free to edit, other files are unchanged, outside the project is still refused", () => {
    expect(ed(`${P}/.env.example`, "SITE_NAME=\n").decision).toBe("allow");
    expect(ed(`${P}/src/app.js`, "x").decision).toBe("allow");
    expect(ed("/tmp/elsewhere/.env", "A=1").decision).toBe("deny");
  });
  test("a key, token or password is never written for the person", () => {
    for (const n of ["STRIPE_SECRET_KEY", "API_KEY", "GITHUB_TOKEN", "DB_PASSWORD", "AUTH_SECRET", "AWS_ACCESS_KEY_ID", "PRIVATE_KEY"]) {
      const v = ed(`${P}/.env`, `${n}=abc123`);
      expect([v.decision, v.risk], n).toEqual(["deny", "settings"]);
      expect(v.reason).toMatch(/yourself/);
      expect(v.reason).not.toContain("abc123");
    }
  });
  test("read only parts (Plan, Rescue, Research) refuse the write", () => {
    expect(evaluateReadOnly({ tool: "Edit", input: { file_path: `${P}/.env`, old_string: "a", new_string: "A=1" } } as never, ctx).decision).toBe("deny");
  });
});

describe("shell commands that write a settings file ask too", () => {
  for (const c of ["echo SITE_NAME=Demo >> .env", "printf 'SITE_NAME=Demo\\n' >> .env", 'echo "SITE_NAME=Demo Shop" >> .env.local', "sed -i s/a/b/ .env", "echo A=1 | tee -a .env", "rm .env", "mv .env .env.bak", "cp .env.example .env", "truncate -s 0 .env"]) test(c, () => {
    const v = sh(c);
    expect([v.decision, v.risk], c).toEqual(["ask", "settings"]);
    expect(v.reason).toMatch(/private settings file/);
    expect(v.reason).not.toContain("Demo Shop");
  });
  test("an append shows the name, never the value", () => {
    const v = sh("printf 'SITE_NAME=Demo Shop\\n' >> .env");
    expect(v.reason).toContain("SITE_NAME");
    expect(v.reason).not.toMatch(/Demo|Shop/);
  });
  test("an append of a key, token or password is refused", () => {
    expect(sh("echo STRIPE_SECRET_KEY=sk_live_1 >> .env").decision).toBe("deny");
  });
  test("reading, templates and other files are unchanged", () => {
    expect(sh("cat .env.example").decision).toBe("allow");
    expect(sh("cp .env.example .env.sample").decision).toBe("allow");
    expect(sh("cp .env.example .env.example.bak").decision).toBe("ask");   // a backup of a template is not a template: the safe side
    expect(sh("echo hi >> notes.txt").decision).toBe("allow");
    expect(sh("ls -a").decision).toBe("allow");
  });
});

describe("a settings ask is its own tap every time", () => {
  test("a yes for the rest of the task never covers it", () => {
    const v = ed(`${P}/.env`, "SITE_NAME=x");
    expect(taskScopeCovers({ tool: "Edit", input: { file_path: `${P}/.env` } } as never, v, false)).toBe(false);
    expect(taskScopeCovers({ tool: "Edit", input: { file_path: `${P}/.env` } } as never, v, true)).toBe(false);
    expect(taskScopeCovers({ tool: "Bash", input: { command: "echo A=1 >> .env" } } as never, sh("echo A=1 >> .env"), false)).toBe(false);
  });
  test("the protocol accepts the new kind of card", () => {
    const e = { v: 1, id: "e", type: "approval.request", approval: "a1", agent: "b1", checkpoint: "cp1", toolUseId: "t1", risk: "settings", title: "adds SITE_NAME to your private settings file (.env)", expiresAt: "2026-10-22T10:00:00Z" };
    expect(parseEvent(JSON.stringify(e)).ok).toBe(true);
  });
});
