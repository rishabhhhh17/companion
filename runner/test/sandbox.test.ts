// What the operating system sandbox is told, and what project notes Claude may be given. The sandbox is the hard backstop
// under Companion's own checks: it was shown to block writes outside the project and all network traffic by default.
import { afterEach, describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, realpathSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { cachePaths, projectNotes, readDenyRules, REGISTRY_DOMAINS, sandboxSettings, sensitivePaths } from "../src/sandbox.ts";
import { buildSdkOptions } from "../src/sdkEngine.ts";

const made: string[] = [];
afterEach(() => { while (made.length) rmSync(made.pop()!, { recursive: true, force: true }); });
const tmp = (l: string) => { const d = realpathSync(mkdtempSync(join(tmpdir(), `companion-sb-${l}-`))); made.push(d); return d; };
const HOME = "/Users/someone";

describe("places agents may never read", () => {
  const p = sensitivePaths(HOME);
  test("logins, keys and tokens", () => {
    for (const s of [".ssh", ".aws", ".gnupg", ".kube", ".docker", ".npmrc", ".netrc", ".git-credentials", ".config/gcloud", ".config/gh", ".azure"]) expect(p, s).toContain(`${HOME}/${s}`);
  });
  test("the person's own Claude login and Companion's own data", () => {
    for (const s of [".claude", ".claude.json", "Library/Application Support/Companion", "Library/Application Support/dev.companion.app"]) expect(p, s).toContain(`${HOME}/${s}`);
  });
  test("the Keychain, browser data, mail and messages", () => {
    for (const s of ["Library/Keychains", "Library/Application Support/Google/Chrome", "Library/Safari", "Library/Cookies", "Library/Messages", "Library/Mail"]) expect(p, s).toContain(`${HOME}/${s}`);
  });
  test("shell history", () => { expect(p).toContain(`${HOME}/.zsh_history`); expect(p).toContain(`${HOME}/.bash_history`); });
  test("every entry is a full path inside the home folder", () => { for (const x of p) { expect(x.startsWith(HOME + "/"), x).toBe(true); expect(x.includes("..")).toBe(false); } });
  test("ordinary places agents need are not on the list", () => {
    for (const ok of ["Documents", "Desktop", "Downloads", "Developer", ".cache", ".npm", ".bun", "Library/Caches", ".gitconfig"]) expect(p).not.toContain(`${HOME}/${ok}`);
  });
});

describe("the sandbox settings", () => {
  const s: any = sandboxSettings(HOME, "darwin");
  test("on, with no way out for commands, and failing safe when it cannot start", () => {
    expect(s.enabled).toBe(true); expect(s.allowUnsandboxedCommands).toBe(false);
    expect(s.failIfUnavailable).not.toBe(false);
  });
  test("the network is closed except the places packages come from", () => {
    expect(s.network.strictAllowlist).toBe(true);
    for (const d of ["registry.npmjs.org", "pypi.org"]) expect(s.network.allowedDomains).toContain(d);
    for (const bad of ["github.com", "example.com", "*", "*.com", "api.stripe.com", "vercel.com"]) expect(s.network.allowedDomains).not.toContain(bad);
    expect(s.network.allowedDomains).toEqual(REGISTRY_DOMAINS);
  });
  test("a dev server may listen on this Mac", () => expect(s.network.allowLocalBinding).toBe(true));
  test("package managers may write their download caches, and only those, in the home folder", () => {
    expect(s.filesystem.allowWrite).toEqual(cachePaths(HOME));
    for (const c of [".npm", ".cache", "Library/Caches"]) expect(s.filesystem.allowWrite).toContain(`${HOME}/${c}`);
    for (const bad of [HOME, `${HOME}/Documents`, `${HOME}/.ssh`, `${HOME}/.zshrc`, `${HOME}/Library`, `${HOME}/Desktop`]) expect(s.filesystem.allowWrite).not.toContain(bad);
  });
  test("a cache folder is never also a place that is refused for reading", () => {
    const denied = new Set(sensitivePaths(HOME));
    for (const c of cachePaths(HOME)) expect(denied.has(c), c).toBe(false);
  });
  test("reading the sensitive places is refused", () => expect(s.filesystem.denyRead).toEqual(sensitivePaths(HOME)));
  test("off on a system without this sandbox, never silently half on", () => expect((sandboxSettings(HOME, "linux") as any).enabled).toBe(false));
});

describe("Claude's own file reader obeys the same list", () => {
  const r = readDenyRules();
  test("each place is refused as a file and as a folder", () => {
    for (const p of [".ssh", ".aws", ".claude", ".pypirc", "Library/Keychains"]) { expect(r).toContain(`Read(~/${p})`); expect(r).toContain(`Read(~/${p}/**)`); }
  });
  test("the SDK is told to refuse them", () => {
    const o: any = buildSdkOptions({ project: "/p", model: "m", budgetUsd: 1, claudeBinary: "/x/claude", env: {}, authorize: async () => ({ allow: true, reason: "" }), signal: new AbortController().signal });
    for (const rule of r) expect(o.disallowedTools).toContain(rule);
  });
});

describe("what Claude is given from the project", () => {
  test("the project's own notes file is passed as text, so the project's hooks and settings never load", () => {
    const d = tmp("n"); writeFileSync(join(d, "CLAUDE.md"), "Use tabs. Never touch the pricing file.");
    expect(projectNotes(d)).toContain("Use tabs.");
  });
  test("a missing file is nothing", () => expect(projectNotes(tmp("none"))).toBeNull());
  test("a huge file is cut and says so", () => {
    const d = tmp("big"); writeFileSync(join(d, "CLAUDE.md"), "x".repeat(100_000));
    const n = projectNotes(d)!;
    expect(n.length).toBeLessThan(25_000); expect(n).toMatch(/cut/i);
  });
  test("a notes file that is a link to somewhere else is not read", () => {
    const out = tmp("o"); writeFileSync(join(out, "secret.txt"), "TOP SECRET OUTSIDE");
    const d = tmp("l"); symlinkSync(join(out, "secret.txt"), join(d, "CLAUDE.md"));
    expect(projectNotes(d)).toBeNull();
  });
  test("a folder named like the file is not read", () => { const d = tmp("dir"); mkdirSync(join(d, "CLAUDE.md")); expect(projectNotes(d)).toBeNull(); });
});

describe("the options handed to the SDK", () => {
  const d = tmp("opts"); writeFileSync(join(d, "CLAUDE.md"), "Project note: be careful.");
  const o: any = buildSdkOptions({ project: d, model: "m", budgetUsd: 1, claudeBinary: "/x/claude", env: {}, authorize: async () => ({ allow: true, reason: "" }), signal: new AbortController().signal });
  test("no settings files are loaded: a project's hooks, environment and key helpers can never run", () => expect(o.settingSources).toEqual([]));
  test("the project's notes still reach Claude, marked as notes and not as rules", () => {
    expect(o.systemPrompt.append).toContain("Project note: be careful.");
    expect(o.systemPrompt.append).toMatch(/notes from the project/i);
  });
  test("the sandbox settings are the tested ones", () => expect(o.sandbox).toMatchObject({ enabled: process.platform === "darwin", allowUnsandboxedCommands: false }));
  test("the agent's own tools may not write Companion's or Claude's settings folders", () => {
    for (const rule of ["Edit(.claude/**)", "Write(.claude/**)", "Edit(.companion/**)", "Write(.companion/**)"]) expect(o.disallowedTools).toContain(rule);
  });
});
