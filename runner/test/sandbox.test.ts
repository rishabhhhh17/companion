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
  // Go, Rust, Java, Kotlin, Swift and Xcode builds (the agent's own commands, as well as a check) keep downloaded packages in
  // their own folders. Only those folders, never the tool's whole folder (Maven's settings.xml, Gradle's gradle.properties and
  // Cargo's credentials sit next to them and can hold logins).
  test("the package caches of Go, Rust, Maven, Gradle, Swift and Xcode are writable, and only those", () => {
    const w = s.filesystem.allowWrite as string[];
    for (const c of ["go/pkg/mod", ".cargo/registry", ".cargo/git", ".cargo/.package-cache", ".cargo/.global-cache", ".m2/repository", ".m2/wrapper", ".gradle/caches", ".gradle/wrapper", ".gradle/native", ".gradle/daemon", "Library/org.swift.swiftpm", "Library/Developer/Xcode/DerivedData"]) expect(w, c).toContain(`${HOME}/${c}`);
    for (const bad of ["go", ".cargo", ".rustup", ".m2", ".gradle", ".swiftpm", "Library/Developer", "Library/Developer/Xcode", ".cargo/credentials.toml", ".cargo/config.toml", ".m2/settings.xml", ".gradle/gradle.properties", ".gradle/init.d"]) expect(w, bad).not.toContain(`${HOME}/${bad}`);
    expect(w.every((x) => x.startsWith(HOME + "/") && !x.includes(".."))).toBe(true);
  });
  test("the places those tools download from are open, and not a whole code host", () => {
    for (const d of ["proxy.golang.org", "sum.golang.org", "crates.io", "static.crates.io", "index.crates.io", "repo.maven.apache.org", "repo1.maven.org", "plugins.gradle.org", "services.gradle.org", "downloads.gradle.org"]) expect(s.network.allowedDomains, d).toContain(d);
    for (const bad of ["github.com", "gitlab.com", "*.gradle.org", "*.golang.org", "maven.org"]) expect(s.network.allowedDomains).not.toContain(bad);
  });
  test("a cache folder is never also a place that is refused for reading", () => {
    const denied = new Set(sensitivePaths(HOME));
    for (const c of cachePaths(HOME)) expect(denied.has(c), c).toBe(false);
  });
  test("reading the sensitive places is refused", () => expect(s.filesystem.denyRead).toEqual(sensitivePaths(HOME)));
  test("off on a system without this sandbox, never silently half on", () => expect((sandboxSettings(HOME, "linux") as any).enabled).toBe(false));
  // Claude Code's own default lets a shell command run inside the sandbox without asking. Companion's safety hook says yes
  // or no to every command itself, so this is turned off: a command the hook gave no answer for (if Claude Code ever gave
  // up waiting on it) goes on to canUseTool, which always says no, and never runs on the sandbox's say so.
  test("a shell command never runs on the sandbox's own say so, only on the safety hook's yes", () => {
    expect(s.autoAllowBashIfSandboxed).toBe(false);
    expect((sandboxSettings(HOME, "linux") as any).autoAllowBashIfSandboxed).toBe(false);
  });
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
  test("the SDK is told a shell command runs only on the safety hook's yes, and anything that falls through is a no", async () => {
    for (const planOnly of [false, true]) {
      const o: any = buildSdkOptions({ project: "/p", model: "m", budgetUsd: 1, claudeBinary: "/x/claude", env: {}, authorize: async () => ({ allow: true, reason: "" }), signal: new AbortController().signal, planOnly });
      expect(o.sandbox.autoAllowBashIfSandboxed).toBe(false);
      expect(o.sandbox.allowUnsandboxedCommands).toBe(false);
      expect(await o.canUseTool("Bash", { command: "npm test" }, {})).toMatchObject({ behavior: "deny" });
    }
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

// Companion itself writes a CLAUDE.md that is only "@AGENTS.md" (memory/agentsmd.ts), so an import line is followed, one
// level deep, only to a plain file inside the project, never through a link, and with the same size limit.
describe("a notes file that imports another file", () => {
  test("Companion's own one line CLAUDE.md gives Claude what AGENTS.md says, not the words '@AGENTS.md'", () => {
    const d = tmp("imp"); writeFileSync(join(d, "CLAUDE.md"), "@AGENTS.md\n"); writeFileSync(join(d, "AGENTS.md"), "# AGENTS.md\n\n- Built with Vite\n");
    const n = projectNotes(d)!;
    expect(n).toContain("Built with Vite");
    expect(n).not.toMatch(/^@AGENTS\.md$/m);
  });
  test("the person's own words around the import stay, in order", () => {
    const d = tmp("imp2"); writeFileSync(join(d, "CLAUDE.md"), "Use tabs.\n@docs/style.md\nNever touch pricing.\n");
    mkdirSync(join(d, "docs")); writeFileSync(join(d, "docs", "style.md"), "Short sentences.");
    const n = projectNotes(d)!;
    expect(n.indexOf("Use tabs.")).toBeLessThan(n.indexOf("Short sentences."));
    expect(n.indexOf("Short sentences.")).toBeLessThan(n.indexOf("Never touch pricing."));
  });
  test("Companion's marked block holding the import is followed too", () => {
    const d = tmp("imp3");
    writeFileSync(join(d, "CLAUDE.md"), "Mine.\n\n<!-- companion:begin (kept up to date by Companion; delete this whole block to stop) -->\n@AGENTS.md\n<!-- companion:end -->\n");
    writeFileSync(join(d, "AGENTS.md"), "- Uses Postgres");
    expect(projectNotes(d)).toContain("Uses Postgres");
  });
  test("only one level deep: an import inside the imported file is left as text", () => {
    const d = tmp("deep"); writeFileSync(join(d, "CLAUDE.md"), "@AGENTS.md"); writeFileSync(join(d, "AGENTS.md"), "top\n@more.md"); writeFileSync(join(d, "more.md"), "SECOND LEVEL");
    const n = projectNotes(d)!;
    expect(n).toContain("top"); expect(n).not.toContain("SECOND LEVEL");
  });
  test("a file outside the project is never read, however the path is written", () => {
    const out = tmp("out"); writeFileSync(join(out, "secret.md"), "TOP SECRET OUTSIDE");
    const d = tmp("esc");
    writeFileSync(join(d, "CLAUDE.md"), [`@../${out.split("/").pop()}/secret.md`, `@${join(out, "secret.md")}`, "@~/secret.md", "@sub/../../secret.md"].join("\n"));
    expect(projectNotes(d)).not.toContain("TOP SECRET OUTSIDE");
  });
  test("an absolute path that is inside the project is fine", () => {
    const d = tmp("abs"); writeFileSync(join(d, "notes.md"), "INSIDE NOTE"); writeFileSync(join(d, "CLAUDE.md"), `@${join(d, "notes.md")}`);
    expect(projectNotes(d)).toContain("INSIDE NOTE");
  });
  test("never through a link: not a linked file, and not a file inside a linked folder", () => {
    const out = tmp("lo"); writeFileSync(join(out, "secret.md"), "TOP SECRET OUTSIDE");
    const d = tmp("ln");
    symlinkSync(join(out, "secret.md"), join(d, "AGENTS.md"));
    symlinkSync(out, join(d, "docs"));
    writeFileSync(join(d, "CLAUDE.md"), "@AGENTS.md\n@docs/secret.md\n");
    const n = projectNotes(d)!;
    expect(n).not.toContain("TOP SECRET OUTSIDE");
    expect(n).toContain("@AGENTS.md");   // what could not be followed is left as it was
  });
  test("a link inside the project that points inside the project is not followed either", () => {
    const d = tmp("lin"); writeFileSync(join(d, "real.md"), "LINKED CONTENT"); symlinkSync(join(d, "real.md"), join(d, "AGENTS.md"));
    writeFileSync(join(d, "CLAUDE.md"), "@AGENTS.md");
    expect(projectNotes(d)).not.toContain("LINKED CONTENT");
  });
  test("a missing file or a folder is left as the line it was", () => {
    const d = tmp("miss"); mkdirSync(join(d, "folder")); writeFileSync(join(d, "CLAUDE.md"), "@nothing.md\n@folder\n");
    const n = projectNotes(d)!;
    expect(n).toContain("@nothing.md"); expect(n).toContain("@folder");
  });
  test("the notes file importing itself, or the same file twice, gives it once", () => {
    const d = tmp("twice"); writeFileSync(join(d, "CLAUDE.md"), "@CLAUDE.md\n@AGENTS.md\n@./AGENTS.md\n"); writeFileSync(join(d, "AGENTS.md"), "ONCE ONLY");
    const n = projectNotes(d)!;
    expect(n.split("ONCE ONLY").length - 1).toBe(1);
  });
  test("an import inside a code example is not followed", () => {
    const d = tmp("code"); writeFileSync(join(d, "AGENTS.md"), "SHOULD NOT APPEAR"); writeFileSync(join(d, "CLAUDE.md"), "Example:\n```\n@AGENTS.md\n```\n");
    expect(projectNotes(d)).not.toContain("SHOULD NOT APPEAR");
  });
  test("an @ inside a sentence is not an import", () => {
    const d = tmp("mention"); writeFileSync(join(d, "AGENTS.md"), "SHOULD NOT APPEAR"); writeFileSync(join(d, "CLAUDE.md"), "Ask @AGENTS.md first, or mail me@example.com.\n");
    expect(projectNotes(d)).not.toContain("SHOULD NOT APPEAR");
  });
  test("the same size limit holds for everything put together, and says so", () => {
    const d = tmp("bigimp"); writeFileSync(join(d, "CLAUDE.md"), "Start.\n@AGENTS.md\n@more.md\n"); writeFileSync(join(d, "AGENTS.md"), "y".repeat(100_000)); writeFileSync(join(d, "more.md"), "z".repeat(100_000));
    const n = projectNotes(d)!;
    expect(n.length).toBeLessThan(25_000); expect(n).toMatch(/cut/i); expect(n).toContain("Start.");
  });
  test("a CLAUDE.md that is only an import of a missing file is still passed on as it is", () => {
    const d = tmp("only"); writeFileSync(join(d, "CLAUDE.md"), "@AGENTS.md\n");
    expect(projectNotes(d)).toContain("@AGENTS.md");
  });
});

// A cloned project's CLAUDE.md could import a settings or key file, and the notes go into the instructions of every task,
// Plan, Rescue and Research included, where reading those files is refused. So they are never imported: the line stays.
describe("an import of a settings or key file", () => {
  const SECRET = "sk-live-NEVER-SENT";
  const imports = (rel: string) => {
    const d = tmp("secret");
    mkdirSync(join(d, rel, ".."), { recursive: true });
    writeFileSync(join(d, rel), SECRET);
    writeFileSync(join(d, "CLAUDE.md"), `Notes.\n@${rel}\n`);
    return projectNotes(d)!;
  };
  for (const rel of [".env", ".env.local", "config/.env.production", "id_rsa", "config/credentials.json", "secrets.yaml", "server.pem", ".npmrc"]) {
    test(`${rel} is never read, and the line is left as it was`, () => {
      const n = imports(rel);
      expect(n).not.toContain(SECRET);
      expect(n).toContain(`@${rel}`);
      expect(n).toContain("Notes.");
    });
  }
  for (const rel of [".claude/settings.local.json", ".claude/settings.json", ".git/config", ".companion/project.md", "sub/.git/config"]) {
    test(`${rel} (Claude's, git's or Companion's own folder) is never read`, () => {
      const n = imports(rel);
      expect(n).not.toContain(SECRET);
      expect(n).toContain(`@${rel}`);
    });
  }
  test("however the path is spelled", () => {
    const d = tmp("spell");
    mkdirSync(join(d, ".git")); writeFileSync(join(d, ".git", "config"), SECRET); writeFileSync(join(d, ".env"), SECRET); mkdirSync(join(d, "docs"));
    writeFileSync(join(d, "CLAUDE.md"), `@./.env\n@docs/../.env\n@${join(d, ".env")}\n@./.git/config\n@.GIT/config\n@${join(d, ".git", "config")}\n`);
    expect(projectNotes(d)).not.toContain(SECRET);
  });
  test("an ordinary file next to them is still imported", () => {
    const d = tmp("plain"); writeFileSync(join(d, ".env"), SECRET); writeFileSync(join(d, "AGENTS.md"), "Built with Vite.");
    writeFileSync(join(d, "CLAUDE.md"), "@.env\n@AGENTS.md\n");
    const n = projectNotes(d)!;
    expect(n).toContain("Built with Vite."); expect(n).not.toContain(SECRET);
  });
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
