// M113 (docs/milestones/M113-live-feed.md): the live feed in the notch. Each tool's feed note becomes edit lines (path and
// line counts), each guard request a run line (the redacted short command); the ticker is newest first, collapses a file
// edited again, keeps sessions apart, ends with the done marker, and empties on Stop everything. The feed hook is the real
// command run by /bin/sh on temporary folders. No model, no key, no git.
import { afterEach, describe, expect, test } from "bun:test";
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { parseEvent, PROTOCOL_VERSION, HOOK_KINDS as PROTOCOL_HOOK_KINDS } from "../../protocol/index.ts";
import { DoneSignals, eventOf, feedCommand, FEED_MATCHER, GUARD_PID, HOOK_FILE, HOOK_KINDS, TOOL_HOOKS, type DoneTool } from "../src/donesignal.ts";
import { FEED_TMP_STALE_MS, HookGuard } from "../src/guard.ts";
import { editsOf, HOOKLESS_TOOLS, FEED_DONE_MS, FEED_FOLDER_HOLD_MS, FEED_HOOK_FRESH_MS, FEED_IDLE_MS, FEED_MAX_ITEMS, FEED_MAX_SESSIONS, FEED_TOOLS, LiveFeed, lineCounts, runOf, shownPath, type FeedEvent } from "../src/livefeed.ts";
import { ChangeBatcher, type WatchFn } from "../src/review/batcher.ts";

const made: string[] = [];
const signals: DoneSignals[] = [];
const guards: HookGuard[] = [];
afterEach(() => {
  while (signals.length) signals.pop()!.stop();
  while (guards.length) guards.pop()!.stop();
  while (made.length) rmSync(made.pop()!, { recursive: true, force: true });
});
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const tmp = (label: string) => { const d = realpathSync(mkdtempSync(join(tmpdir(), `companion-test-m113-${label}-`))); made.push(d); return d; };
const until = async (pred: () => boolean, ms = 6000) => { for (let i = 0; i < ms / 20 && !pred(); i++) await sleep(20); expect(pred()).toBe(true); };
const run = (cmd: string, input = "") => Bun.spawnSync(["/bin/sh", "-c", cmd], { stdin: new TextEncoder().encode(input) });
const commandsIn = (v: unknown): string[] => {
  if (Array.isArray(v)) return v.flatMap(commandsIn);
  if (v && typeof v === "object") return Object.entries(v as Record<string, unknown>).flatMap(([k, x]) => (k === "command" && typeof x === "string" ? [x] : commandsIn(x)));
  return [];
};
const P = "/Users/me/shop";
/** A feed with a clock the test moves, saying every update at once. */
function feedAt(t0 = 1_000_000, hookless: (project: string) => boolean = () => false) {
  let now = t0;
  const said: FeedEvent[] = [];
  const f = new LiveFeed({ emit: (e) => said.push(e), now: () => now, emitMs: 0, timers: false, hookless });
  return { f, said, last: () => said.at(-1)!, at: (ms: number) => { now = ms; }, add: (ms: number) => { now += ms; }, now: () => now };
}

describe("each tool's note becomes edit lines", () => {
  test("Claude Code: Edit, MultiEdit, Write, NotebookEdit, and its own structuredPatch when it is there", () => {
    const edit = JSON.stringify({ session_id: "s1", cwd: P, hook_event_name: "PostToolUse", tool_name: "Edit", tool_input: { file_path: `${P}/src/app.tsx`, old_string: "a\nb\nc", new_string: "a\nB\nc\nd" } });
    expect(editsOf(edit)).toEqual([{ path: `${P}/src/app.tsx`, added: 2, removed: 1, session: "s1", cwd: P }]);
    const multi = JSON.stringify({ tool_name: "MultiEdit", tool_input: { file_path: "src/a.ts", edits: [{ old_string: "x", new_string: "y" }, { old_string: "", new_string: "1\n2\n3" }] } });
    expect(editsOf(multi)).toEqual([{ path: "src/a.ts", added: 4, removed: 1 }]);
    // Write of a new file: every line is added. With Claude Code's own patch, its counts are used as they are.
    expect(editsOf(JSON.stringify({ tool_name: "Write", tool_input: { file_path: "README.md", content: "one\ntwo\n" }, tool_response: { type: "create" } }))).toEqual([{ path: "README.md", added: 2, removed: 0 }]);
    const patched = JSON.stringify({ tool_name: "Write", tool_input: { file_path: "a.ts", content: "whatever" }, tool_response: { type: "update", structuredPatch: [{ lines: [" keep", "-old", "-old2", "+new"] }, { lines: ["+more"] }] } });
    expect(editsOf(patched)).toEqual([{ path: "a.ts", added: 2, removed: 2 }]);
    // A Write over a file whose old text is not known: the lines added are known, the lines taken away are not.
    expect(editsOf(JSON.stringify({ tool_name: "Write", tool_input: { file_path: "b.ts", content: "x" } }))).toEqual([{ path: "b.ts", added: 1 }]);
    expect(editsOf(JSON.stringify({ tool_name: "NotebookEdit", tool_input: { notebook_path: "n.ipynb", new_source: "print(1)\nprint(2)" } }))).toEqual([{ path: "n.ipynb", added: 2 }]);
  });
  test("Codex: apply_patch with several files, each with its own counts", () => {
    const patch = ["*** Begin Patch", "*** Update File: src/a.ts", "@@", " keep", "-old", "+new", "+newer", "*** Add File: src/b.ts", "+line 1", "+line 2", "*** Delete File: old.txt", "*** End Patch"].join("\n");
    expect(editsOf(JSON.stringify({ session_id: "c1", cwd: P, tool_name: "apply_patch", tool_input: { command: patch } }))).toEqual([
      { path: "src/a.ts", added: 2, removed: 1, session: "c1", cwd: P },
      { path: "src/b.ts", added: 2, removed: 0, session: "c1", cwd: P },
      { path: "old.txt", session: "c1", cwd: P },
    ]);
    // A moved file is said by its new name.
    const moved = ["*** Begin Patch", "*** Update File: a.ts", "*** Move to: b.ts", "-x", "+y", "*** End Patch"].join("\n");
    expect(editsOf(JSON.stringify({ tool_name: "apply_patch", tool_input: { command: moved } }))).toEqual([{ path: "b.ts", added: 1, removed: 1 }]);
  });
  test("Cursor afterFileEdit, the VS Code agent and Gemini CLI, each in its own shape", () => {
    expect(editsOf(JSON.stringify({ hook_event_name: "afterFileEdit", conversation_id: "k", file_path: `${P}/x.ts`, edits: [{ old_string: "a", new_string: "b\nc" }], workspace_roots: [P] }))).toEqual([{ path: `${P}/x.ts`, added: 2, removed: 1, session: "k", cwd: P }]);
    expect(editsOf(JSON.stringify({ tool_name: "replace_string_in_file", tool_input: { filePath: "y.ts", oldString: "1\n2", newString: "1" } }))).toEqual([{ path: "y.ts", added: 0, removed: 1 }]);
    expect(editsOf(JSON.stringify({ toolName: "create_file", toolArgs: JSON.stringify({ filePath: "z.ts", content: "a\nb\nc" }) }))).toEqual([{ path: "z.ts", added: 3, removed: 0 }]);
    expect(editsOf(JSON.stringify({ hook_event_name: "AfterTool", tool_name: "replace", tool_input: { file_path: "g.ts", old_string: "a", new_string: "b" } }))).toEqual([{ path: "g.ts", added: 1, removed: 1 }]);
    expect(editsOf(JSON.stringify({ tool_name: "write_file", tool_input: { file_path: "h.ts", content: "a\n" } }))).toEqual([{ path: "h.ts", added: 1 }]);
  });
  test("anything else is nothing: a shell call, a read, a broken note, a tool we do not know", () => {
    for (const bad of ["", "not json", "[]", "null", JSON.stringify({ tool_name: "Bash", tool_input: { command: "ls" } }), JSON.stringify({ tool_name: "Read", tool_input: { file_path: "a" } }),
      JSON.stringify({ tool_name: "Edit", tool_input: {} }), JSON.stringify({ tool_name: "Edit", tool_input: { file_path: 3 } }), JSON.stringify({ tool_name: "mystery", tool_input: { file_path: "a" } })]) expect(editsOf(bad)).toEqual([]);
  });
});

describe("the line counts", () => {
  test("a line diff, not a guess", () => {
    expect(lineCounts("", "")).toEqual({ added: 0, removed: 0 });
    expect(lineCounts("", "a\nb\n")).toEqual({ added: 2, removed: 0 });
    expect(lineCounts("a\nb\n", "")).toEqual({ added: 0, removed: 2 });
    expect(lineCounts("a\nb\nc\n", "a\nx\nc\n")).toEqual({ added: 1, removed: 1 });
    // A line moved within the middle: one taken away, one added, never all of them.
    expect(lineCounts("1\n2\n3\n4\n5", "1\n3\n4\n2\n5")).toEqual({ added: 1, removed: 1 });
    expect(lineCounts("same\n", "same\n")).toEqual({ added: 0, removed: 0 });
  });
  test("a huge edit still counts at once, by its ends", () => {
    const a = Array.from({ length: 3000 }, (_, i) => `a${i}`).join("\n"), b = Array.from({ length: 3000 }, (_, i) => `b${i}`).join("\n");
    const t = performance.now();
    expect(lineCounts(a, b)).toEqual({ added: 3000, removed: 3000 });
    expect(performance.now() - t).toBeLessThan(500);
  });
});

describe("the redaction", () => {
  test("a command is said short, on one line, with secrets taken out", () => {
    expect(runOf(JSON.stringify({ tool_name: "Bash", session_id: "s", tool_input: { command: "npm test" } }))).toEqual({ command: "npm test", session: "s" });
    const said = runOf(JSON.stringify({ tool_name: "Bash", tool_input: { command: "curl -H 'Authorization: Bearer abcdefghijklmnopqrstuvwxyz0123' https://api.example.com\n&& echo done" } }))!;
    expect(said.command).not.toContain("abcdefghijklmnop");
    expect(said.command).not.toContain("\n");
    expect(Array.from(said.command).length).toBeLessThanOrEqual(60);
    expect(runOf(JSON.stringify({ tool_name: "Bash", tool_input: { command: "export STRIPE_SECRET_KEY=sk_live_abcdefghijklmnop" } }))!.command).not.toContain("sk_live_abc");
    // Cursor's beforeShellExecution has the command at the top.
    expect(runOf(JSON.stringify({ command: "bun run build", cwd: P, conversation_id: "k" }))).toEqual({ command: "bun run build", session: "k" });
    expect(runOf(JSON.stringify({ tool_name: "Read", tool_input: { file_path: "a" } }))).toBeNull();
  });
  test("a path is said from the project down; outside the project, by its name only", () => {
    expect(shownPath(P, `${P}/src/app.tsx`)).toBe("src/app.tsx");
    expect(shownPath(P, "src/app.tsx", P)).toBe("src/app.tsx");
    expect(shownPath(P, "app.tsx", `${P}/src`)).toBe("src/app.tsx");
    expect(shownPath(P, "/Users/me/.ssh/config")).toBe("config");
    expect(shownPath(P, `${P}/../other/x.ts`)).toBe("x.ts");
    expect(shownPath(P, `${P}/a\u0007b.ts`)).toBe("a b.ts");
    const deep = `${P}/${"very-long-folder-name/".repeat(8)}file.ts`;
    const s = shownPath(P, deep);
    expect(Array.from(s).length).toBeLessThanOrEqual(80);
    expect(s.startsWith("…")).toBe(true);
    expect(s.endsWith("file.ts")).toBe(true);
    expect(shownPath(P, `${P}/config/sk-abcdefghijklmnopqrstu.json`)).not.toContain("sk-abcdefghijklmnop");
  });
});

describe("the ticker", () => {
  const edit = (path: string, old: string, neu: string, session = "s1") => JSON.stringify({ session_id: session, cwd: P, tool_name: "Edit", tool_input: { file_path: `${P}/${path}`, old_string: old, new_string: neu } });
  const bash = (command: string, session = "s1") => JSON.stringify({ session_id: session, cwd: P, tool_name: "Bash", tool_input: { command } });
  test("newest first; a file edited again moves to the top with its counts added up", () => {
    const { f, last, add } = feedAt();
    f.edit(P, "claude", edit("a.ts", "", "1\n2"));
    add(10); f.ran(P, "claude", bash("npm test"));
    add(10); f.edit(P, "claude", edit("b.ts", "x", "y"));
    add(10); f.edit(P, "claude", edit("a.ts", "1", ""));
    const s = last().sessions;
    expect(s).toHaveLength(1);
    expect(s[0]).toMatchObject({ project: P, tool: "claude", via: "hook", state: "working" });
    expect(s[0]!.items).toEqual([
      { kind: "edit", path: "a.ts", added: 2, removed: 1, n: 2 },
      { kind: "edit", path: "b.ts", added: 1, removed: 1, n: 1 },
      { kind: "run", command: "npm test", n: 1 },
    ]);
  });
  test("the same command run twice in a row is one line that counts two; a different one is its own line", () => {
    const { f, last } = feedAt();
    f.ran(P, "claude", bash("npm test")); f.ran(P, "claude", bash("npm test")); f.ran(P, "claude", bash("npm run lint")); f.ran(P, "claude", bash("npm test"));
    expect(last().sessions[0]!.items).toEqual([{ kind: "run", command: "npm test", n: 1 }, { kind: "run", command: "npm run lint", n: 1 }, { kind: "run", command: "npm test", n: 2 }]);
  });
  test(`at most ${FEED_MAX_ITEMS} lines in a session, the oldest going first`, () => {
    const { f, last } = feedAt();
    for (let i = 0; i < 9; i++) f.edit(P, "claude", edit(`f${i}.ts`, "", "x"));
    expect(last().sessions[0]!.items.map((i) => (i as { path: string }).path)).toEqual(["f8.ts", "f7.ts", "f6.ts", "f5.ts"].slice(0, FEED_MAX_ITEMS));
  });
  test("several sessions stay apart: two Claude Code sessions in one project and Codex in another", () => {
    const { f, last, add } = feedAt();
    f.edit(P, "claude", edit("a.ts", "", "x", "one"));
    add(5); f.edit(P, "claude", edit("b.ts", "", "x", "two"));
    add(5); f.edit("/Users/me/site", "codex", JSON.stringify({ session_id: "c", cwd: "/Users/me/site", tool_name: "apply_patch", tool_input: { command: "*** Begin Patch\n*** Add File: index.html\n+<p>\n*** End Patch" } }));
    const s = last().sessions;
    expect(s.map((x) => [x.project, x.tool, (x.items[0] as { path: string }).path])).toEqual([["/Users/me/site", "codex", "index.html"], [P, "claude", "b.ts"], [P, "claude", "a.ts"]]);
    expect(new Set(s.map((x) => x.key)).size).toBe(3);
    // The tool's own session id is never said, only a short key made from it.
    for (const x of s) { expect(x.key).toMatch(/^[0-9a-f]{12}$/); expect(JSON.stringify(x)).not.toContain('"one"'); }
  });
  test(`at most ${FEED_MAX_SESSIONS} sessions are said, the busiest newest first, working before finished`, () => {
    const { f, last, add } = feedAt();
    for (let i = 0; i < 5; i++) { add(10); f.edit(`/p${i}`, "claude", JSON.stringify({ tool_name: "Edit", tool_input: { file_path: `/p${i}/a.ts`, old_string: "", new_string: "x" } })); }
    f.done("/p4", "claude");
    expect(last().sessions.map((s) => [s.project, s.state])).toEqual([["/p3", "working"], ["/p2", "working"], ["/p1", "working"]].slice(0, FEED_MAX_SESSIONS) as [string, string][]);
  });
  test("done says Finished, then the session goes after a minute; a new turn after done starts clean", () => {
    const { f, last, add } = feedAt();
    f.edit(P, "claude", edit("a.ts", "", "x"));
    f.done(P, "claude");
    expect(last().sessions[0]!.state).toBe("done");
    expect(last().sessions[0]!.items).toHaveLength(1);
    add(FEED_DONE_MS - 1); f.sweep();
    expect(last().sessions).toHaveLength(1);
    // A new turn: the old lines go, the new one shows.
    f.edit(P, "claude", edit("b.ts", "", "x"));
    expect(last().sessions[0]).toMatchObject({ state: "working", items: [{ kind: "edit", path: "b.ts", added: 1, removed: 0, n: 1 }] });
    f.done(P, null);
    add(FEED_DONE_MS + 1); f.sweep();
    expect(last().sessions).toEqual([]);
  });
  test("a session nothing happens in goes after the idle time, so a tool with no done signal never stays", () => {
    const { f, last, add } = feedAt();
    f.ran(P, "cursor", JSON.stringify({ command: "ls", cwd: P }));
    add(FEED_IDLE_MS - 1); f.sweep();
    expect(last().sessions).toHaveLength(1);
    add(2); f.sweep();
    expect(last().sessions).toEqual([]);
  });
  test("the done marker of one tool ends only that tool's sessions", () => {
    const { f, last } = feedAt();
    f.edit(P, "claude", edit("a.ts", "", "x"));
    f.ran(P, "codex", JSON.stringify({ tool_name: "Bash", tool_input: { command: "ls" } }));
    f.done(P, "codex");
    expect(last().sessions.map((s) => [s.tool, s.state]).sort()).toEqual([["claude", "working"], ["codex", "done"]]);
  });
  test("Stop everything empties the feed at once, and the next event fills it again", () => {
    const { f, last } = feedAt();
    f.edit(P, "claude", edit("a.ts", "", "x"));
    f.stop();
    expect(last().sessions).toEqual([]);
    f.ran(P, "claude", bash("ls"));
    expect(last().sessions).toHaveLength(1);
  });
  test("updates are said at most every 200 ms, the last one always", async () => {
    const said: FeedEvent[] = [];
    const f = new LiveFeed({ emit: (e) => said.push(e) });
    for (let i = 0; i < 20; i++) f.ran(P, "claude", JSON.stringify({ tool_name: "Bash", tool_input: { command: `echo ${i}` } }));
    expect(said.length).toBe(1);
    await until(() => said.length === 2, 1000);
    expect((said.at(-1)!.sessions[0]!.items[0] as { command: string }).command).toBe("echo 19");
    f.stop();
  });
  test("every update is a valid feed.update, with nothing of the edit's text in it", () => {
    const { f, said } = feedAt();
    f.edit(P, "claude", edit("a.ts", "SECRET_OLD_TEXT", "SECRET_NEW_TEXT"));
    f.ran(P, "claude", bash("npm test"));
    for (const e of said) {
      const line = JSON.stringify({ v: PROTOCOL_VERSION, id: "x", ts: new Date().toISOString(), ...e });
      expect(parseEvent(line).ok).toBe(true);
      expect(line).not.toContain("SECRET_");
    }
  });
});

describe("the folder watcher fills in for a tool with no hooks", () => {
  // M113 review: changed on purpose. The folder fills in only for a project with a hook-less tool connected (hookless), and
  // each path waits FEED_FOLDER_HOLD_MS first (the hook's own note may still be on its way), so the test lets that pass.
  test("a path the review counts shows with no counts, as seen in the folder, unless a hook spoke for that project just now", () => {
    const { f, last, add: move } = feedAt(1_000_000, () => true);
    const add = (ms: number) => { move(ms); };
    const folder = (rel: string) => { f.folder(P, rel); move(FEED_FOLDER_HOLD_MS); f.sweep(); };
    folder("src/a.ts");
    expect(last().sessions[0]).toMatchObject({ project: P, via: "folder", state: "working", items: [{ kind: "edit", path: "src/a.ts", n: 1 }] });
    expect(last().sessions[0]!.tool).toBeUndefined();
    const before = last();
    f.edit(P, "claude", JSON.stringify({ tool_name: "Edit", tool_input: { file_path: `${P}/b.ts`, old_string: "", new_string: "x" } }));
    add(FEED_HOOK_FRESH_MS - 1);
    folder("src/c.ts");
    expect(last().sessions.find((s) => s.via === "folder")!.items.map((i) => (i as { path: string }).path)).toEqual(["src/a.ts"]);
    expect(before).toBeDefined();
    add(2);
    folder("src/c.ts");
    expect(last().sessions.find((s) => s.via === "folder")!.items.map((i) => (i as { path: string }).path)).toEqual(["src/c.ts", "src/a.ts"]);
  });
  test("M113 review: the hook-less tools are exactly those with no feed hook", () => {
    expect([...HOOKLESS_TOOLS].sort()).toEqual((Object.keys(TOOL_HOOKS) as DoneTool[]).filter((t) => !TOOL_HOOKS[t].includes("feed")).sort());
    expect(HOOKLESS_TOOLS.some((t) => FEED_TOOLS.includes(t))).toBe(false);
  });
  test("M113 review: with no hook-less tool connected, nothing from the folder shows (the person's own saves stay out)", () => {
    const { f, said } = feedAt();
    f.folder(P, "src/a.ts");
    f.sweep();
    expect(said.filter((e) => e.sessions.length)).toEqual([]);
    expect(f.view()).toEqual([]);
  });
  test("M113 review: a path is held a moment; a hook naming it in that time wins, so no Changes block doubles the tool's", () => {
    const { f, add } = feedAt(1_000_000, () => true);
    // The watcher sees the edit before Claude Code's own note lands (it thought for more than 15 seconds first).
    f.folder(P, "src/a.ts");
    add(FEED_FOLDER_HOLD_MS - 500);
    f.sweep();
    expect(f.view()).toEqual([]);
    f.edit(P, "claude", JSON.stringify({ tool_name: "Edit", tool_input: { file_path: `${P}/src/a.ts`, old_string: "a", new_string: "b" } }));
    add(1000);
    f.sweep();
    expect(f.view().map((s) => s.via)).toEqual(["hook"]);
    expect(f.view()[0]!.items).toEqual([{ kind: "edit", path: "src/a.ts", added: 1, removed: 1, n: 1 }]);
  });
  test("M113 review: a held path shows on its own timer, and Stop everything drops what is held", async () => {
    const said: FeedEvent[] = [];
    const f = new LiveFeed({ emit: (e) => said.push(e), emitMs: 0, hookless: () => true, folderHoldMs: 30 });
    f.folder(P, "src/a.ts");
    expect(f.view()).toEqual([]);
    await until(() => f.view().length === 1, 2000);
    expect(f.view()[0]).toMatchObject({ via: "folder", items: [{ kind: "edit", path: "src/a.ts", n: 1 }] });
    f.folder(P, "src/b.ts");
    f.stop();
    await sleep(80);
    expect(f.view()).toEqual([]);
    f.stop();
  });
  test("M113 review: whether a hook-less tool is connected is asked at most now and then, not for each path", () => {
    let asked = 0;
    const { f, add } = feedAt(1_000_000, () => { asked++; return true; });
    for (let i = 0; i < 50; i++) f.folder(P, `src/${i}.ts`);
    expect(asked).toBe(1);
    add(10_000);
    f.folder(P, "src/x.ts");
    expect(asked).toBe(2);
  });
  test("the review's watcher tells it each path it counts, and never the engine's own work", async () => {
    const p = tmp("watch");
    let fire: (rel: string) => void = () => {};
    const watch: WatchFn = (_d, on) => { fire = on; return { close() {} }; };
    const seen: string[] = [];
    const b = new ChangeBatcher({ project: p, quietMs: () => 10_000, onReady: () => {}, watch, onPath: (rel) => seen.push(rel), graceMs: 0 });
    b.start();
    writeFileSync(join(p, "a.ts"), "x");
    fire("a.ts"); fire("node_modules/x/index.js"); fire(".DS_Store");
    b.holdOwn(); fire("own.ts"); b.releaseOwn();
    await sleep(5);
    fire("b.ts");
    b.stop();
    expect(seen).toEqual(["a.ts", "b.ts"]);
  });
});

describe("the feed hook", () => {
  test("the feed is a hook of the tools that have an after edit event, under that event, with its matcher", () => {
    expect(HOOK_KINDS).toContain("feed");
    expect(PROTOCOL_HOOK_KINDS as readonly string[]).toContain("feed");
    expect(FEED_TOOLS).toEqual(["claude", "codex", "cursor", "copilot", "gemini"]);
    for (const t of ["claude", "codex", "cursor", "copilot", "gemini", "antigravity", "windsurf"] as DoneTool[]) expect(TOOL_HOOKS[t].includes("feed")).toBe(FEED_TOOLS.includes(t));
    expect(eventOf("claude", "feed")).toBe("PostToolUse");
    expect(eventOf("codex", "feed")).toBe("PostToolUse");
    expect(eventOf("copilot", "feed")).toBe("PostToolUse");
    expect(eventOf("cursor", "feed")).toBe("afterFileEdit");
    expect(eventOf("gemini", "feed")).toBe("AfterTool");
    expect(FEED_MATCHER).toEqual({ claude: "Edit|Write|MultiEdit|NotebookEdit", codex: "apply_patch|Edit|Write", gemini: "write_file|replace" });
  });
  test("its command hands the note to Squibby's folder and exits 0 at once; with Squibby closed it writes nothing", () => {
    const data = tmp("data");
    const guard = join(data, "guard");
    mkdirSync(guard, { recursive: true });
    const token = "0123456789abcdef01234567";
    const cmd = feedCommand(guard, token, "claude");
    // Closed: no pid file, so nothing is written and it ends at once.
    let t = performance.now();
    let r = run(cmd, '{"tool_name":"Edit"}');
    expect(r.exitCode).toBe(0);
    expect(r.stdout.length).toBe(0);
    expect(readdirSync(guard)).toEqual([]);
    expect(performance.now() - t).toBeLessThan(1500);
    // Open (this test's own pid stands for the engine): the note lands under its name, whole, and nothing waits.
    writeFileSync(join(guard, GUARD_PID), String(process.pid));
    t = performance.now();
    r = run(cmd, '{"tool_name":"Edit","tool_input":{"file_path":"a"}}');
    expect(r.exitCode).toBe(0);
    expect(r.stdout.length).toBe(0);
    expect(performance.now() - t).toBeLessThan(1500);
    const notes = readdirSync(guard).filter((n) => n.endsWith(".feed"));
    expect(notes).toHaveLength(1);
    expect(notes[0]).toMatch(new RegExp(`^${token}\\.\\d+\\.claude\\.feed$`));
    expect(readFileSync(join(guard, notes[0]!), "utf8")).toBe('{"tool_name":"Edit","tool_input":{"file_path":"a"}}');
    expect(cmd).not.toMatch(/sleep|while/);
    expect(cmd).not.toContain("git");
  });
  test("added after the yes in each tool's own shape, found as on, and taken out by Remove with nothing of the person's lost", () => {
    const data = tmp("data"), p = tmp("proj");
    const s = new DoneSignals(data);
    for (const t of FEED_TOOLS) {
      const file = join(p, HOOK_FILE[t]);
      mkdirSync(join(file, ".."), { recursive: true });
      writeFileSync(file, JSON.stringify(t === "cursor" ? { version: 1, hooks: { afterFileEdit: [{ command: "./mine.sh" }] } } : { hooks: { [eventOf(t, "feed")]: [{ hooks: [{ type: "command", command: "./mine.sh" }] }] } }, null, 2));
      expect(s.plan(p, t, "feed").on).toBe(false);
      const after = s.add(p, t, "feed");
      expect(after.on).toBe(true);
      expect(after.adds).toContain(eventOf(t, "feed"));
      const j = JSON.parse(readFileSync(file, "utf8"));
      const cmds = commandsIn(j);
      expect(cmds).toContain("./mine.sh");
      expect(cmds.some((c) => c.includes(".feed\"") && c.startsWith("d="))).toBe(true);
      s.remove(p, t, "feed");
      expect(s.plan(p, t, "feed").on).toBe(false);
      expect(commandsIn(JSON.parse(readFileSync(file, "utf8")))).toEqual(["./mine.sh"]);
    }
    // A tool with no after edit event has no feed row to add.
    expect(s.add(p, "windsurf", "feed").problem).toBeTruthy();
    expect(existsSync(join(p, HOOK_FILE.windsurf))).toBe(false);
  });
  test("the guard folder's reader takes a .feed note, hands it on with its tool, and removes it as it reads", async () => {
    const data = tmp("data"), p = tmp("proj");
    const s = new DoneSignals(data);
    const token = s.tokenFor(p)!;
    const notes: [string, string | null, string][] = [];
    const runs: [string, string | null, string][] = [];
    const busy: string[] = [];
    const g = new HookGuard(s.guardFolder, { projectOf: (t) => s.projectOf(t), snapshot: async () => ({ id: "x" }), emit: () => {}, feed: (q, tool, text) => notes.push([q, tool, text]), ran: (q, tool, text) => runs.push([q, tool, text]), busy: (q) => busy.push(q) });
    guards.push(g);
    expect(g.start()).toBe(true);
    const note = JSON.stringify({ tool_name: "Edit", tool_input: { file_path: `${p}/a.ts`, old_string: "", new_string: "x" } });
    run(feedCommand(s.guardFolder, token, "claude"), note);
    await until(() => notes.length === 1);
    expect(notes[0]).toEqual([p, "claude", note]);
    await until(() => readdirSync(s.guardFolder).filter((n) => n !== GUARD_PID).length === 0, 2000);
    // A feed note is never answered (nothing waits for it) and says the tool is working.
    expect(readdirSync(s.guardFolder).some((n) => n.endsWith(".ok"))).toBe(false);
    expect(busy).toEqual([p]);
    // A guard request is handed to the feed as a run.
    writeFileSync(join(s.guardFolder, `${token}.123.claude.ask`), JSON.stringify({ tool_name: "Bash", tool_input: { command: "npm test" } }));
    await until(() => runs.length === 1);
    expect(runs[0]![0]).toBe(p);
    expect(runs[0]![1]).toBe("claude");
    await g.idle();
  });
  // M113 review: FSEvents can drop or coalesce the rename from .tmp; a note must never sit in the data folder.
  test("a note whose watch event never came is still read and removed, and a left .tmp goes after a few seconds", async () => {
    const data = tmp("data"), p = tmp("proj");
    const s = new DoneSignals(data);
    const token = s.tokenFor(p)!;
    const notes: string[] = [];
    let now = Date.now();
    // A watcher that never says anything.
    const g = new HookGuard(s.guardFolder, { projectOf: (t) => s.projectOf(t), snapshot: async () => ({ id: "x" }), emit: () => {}, feed: (_q, _t, text) => notes.push(text), watch: (() => ({ close() {}, on() {} })) as never, rescanMs: 20, now: () => now });
    guards.push(g);
    expect(g.start()).toBe(true);
    const note = JSON.stringify({ tool_name: "Write", tool_input: { file_path: `${p}/.env`, content: "SECRET=1" } });
    writeFileSync(join(s.guardFolder, `${token}.77.claude.feed`), note);
    writeFileSync(join(s.guardFolder, `${token}.78.claude.feed.tmp`), note);
    await until(() => notes.length === 1, 2000);
    expect(existsSync(join(s.guardFolder, `${token}.77.claude.feed`))).toBe(false);
    // A .tmp still being written is left alone; once old, it goes.
    await sleep(60);
    expect(existsSync(join(s.guardFolder, `${token}.78.claude.feed.tmp`))).toBe(true);
    now += FEED_TMP_STALE_MS + 1000;
    await until(() => !existsSync(join(s.guardFolder, `${token}.78.claude.feed.tmp`)), 2000);
    expect(notes).toHaveLength(1);
    // Nothing else of the folder is touched.
    expect(readdirSync(s.guardFolder).sort()).toEqual([GUARD_PID]);
  });
  test("a huge note is never read whole: its file's name is taken from its start, with no counts", async () => {
    const data = tmp("data"), p = tmp("proj");
    const s = new DoneSignals(data);
    const token = s.tokenFor(p)!;
    const notes: string[] = [];
    const g = new HookGuard(s.guardFolder, { projectOf: (t) => s.projectOf(t), snapshot: async () => ({ id: "x" }), emit: () => {}, feed: (_q, _t, text) => notes.push(text) });
    guards.push(g);
    g.start();
    const big = JSON.stringify({ tool_name: "Write", tool_input: { file_path: `${p}/big.txt`, content: "x".repeat(5 * 1024 * 1024) } });
    writeFileSync(join(s.guardFolder, `${token}.9.claude.feed`), big);
    await until(() => notes.length === 1);
    expect(notes[0]!.length).toBeLessThan(1000);
    expect(editsOf(notes[0]!)).toEqual([{ path: `${p}/big.txt` }]);
  });
});

describe("the protocol", () => {
  const fx = () => readFileSync(join(import.meta.dir, "../../protocol/fixtures/events.jsonl"), "utf8").split("\n").filter((l) => l.includes('"id":"m113e'));
  test("the fixtures parse, for Rust and TypeScript alike", () => {
    expect(fx()).toHaveLength(3);
    for (const l of fx()) expect(parseEvent(l).ok, l).toBe(true);
  });
  test("anything more than names, counts and short commands is refused", () => {
    const base = JSON.parse(fx()[0]!);
    const bad = (f: (e: { sessions: Record<string, unknown>[] }) => void) => { const e = structuredClone(base); f(e); return parseEvent(JSON.stringify(e)).ok; };
    expect(bad(() => {})).toBe(true);
    expect(bad((e) => { (e.sessions[0]!.items as Record<string, unknown>[])[0]!.path = "/Users/me/shop/src/app.tsx"; })).toBe(false);
    expect(bad((e) => { (e.sessions[0]!.items as Record<string, unknown>[])[0]!.path = "../secret.txt"; })).toBe(false);
    expect(bad((e) => { (e.sessions[0]!.items as Record<string, unknown>[])[0]!.text = "the edit's own words"; })).toBe(false);
    expect(bad((e) => { (e.sessions[0]!.items as Record<string, unknown>[])[1]!.command = "x".repeat(81); })).toBe(false);
    expect(bad((e) => { (e.sessions[0]!.items as Record<string, unknown>[])[0]!.added = -1; })).toBe(false);
    expect(bad((e) => { e.sessions[0]!.session_id = "abc"; })).toBe(false);
    expect(bad((e) => { e.sessions[0]!.key = "not-a-key"; })).toBe(false);
    // M115 (changed on purpose): Zed is one of the tools now; a tool that is not on the list is still refused.
    expect(bad((e) => { e.sessions[0]!.tool = "lovable"; })).toBe(false);
    expect(bad((e) => { e.sessions.push(e.sessions[0]!, e.sessions[0]!); })).toBe(false);
    expect(bad((e) => { const it = e.sessions[0]!.items as unknown[]; it.push(it[0], it[0], it[0]); })).toBe(false);
  });
});
