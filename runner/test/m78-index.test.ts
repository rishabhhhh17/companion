// M78: the notes search index (a copy rebuilt from the files), the search command Claude runs (run for real with sh and
// macOS's own sqlite3), the SessionStart hook (its plan, add, remove, and its command run for real), and the start file
// written only while the hook is set up. Temporary folders only; no model, no Claude Code.
import { afterAll, describe, expect, test } from "bun:test";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { MemoryStore } from "../src/memory/store.ts";
import { ftsQuery, NotesIndex } from "../src/memory/notesindex.ts";
import { DoneSignals, HOOK_EVENT, HOOK_MATCHER, START_DIR, startCommand } from "../src/donesignal.ts";
import { SessionStartNotes } from "../src/memory/sessionstart.ts";

const made: string[] = [];
const tmp = () => { const d = realpathSync(mkdtempSync(join(tmpdir(), "m78ix-"))); made.push(d); return d; };
afterAll(() => { for (const d of made) rmSync(d, { recursive: true, force: true }); });
const NOW = new Date(2026, 10, 10, 10);
const TOKEN = "0123456789abcdef01234567";
function rig() {
  const project = tmp(), data = tmp(), m = new MemoryStore({ project, profileDir: data });
  m.add("project", "Decided: payments go through Stripe, because the client already has an account", "you wrote it", NOW);
  m.add("project", "Built with React, Vite", "package.json", NOW);
  m.add("project", "Tried and failed: Fix the checkout total. The checks still failed on The tests", "a fix that was not proven", NOW);
  m.add("profile", "Prefers short answers about payments", 'you said "shorter"', NOW);
  return { project, data, m, ix: new NotesIndex(data) };
}
const sh = (args: string[], env: Record<string, string> = {}) => spawnSync("/bin/sh", args, { encoding: "utf8", env: { PATH: "/usr/bin:/bin", ...env }, timeout: 10_000 });

describe("the index is a copy of the files", () => {
  test("a question finds the decision, best first, with its source", () => {
    const { project, m, ix } = rig();
    expect(ix.rebuild(project, m, TOKEN)).toBe(3);
    const found = ix.search(TOKEN, "what did we decide about payments");
    expect(found[0]).toMatchObject({ text: expect.stringContaining("payments go through Stripe"), source: "you wrote it", kind: "decision" });
  });
  test("the person's profile is never in it", () => {
    const { project, m, ix } = rig();
    ix.rebuild(project, m, TOKEN);
    expect(ix.search(TOKEN, "short answers").map((f) => f.text).join()).not.toContain("short answers");
  });
  test("a line forgotten in the file is gone after the next rebuild; deleting the index loses nothing", () => {
    const { project, m, ix } = rig();
    ix.rebuild(project, m, TOKEN);
    const id = m.list("project").entries.find((e) => e.text.startsWith("Decided"))!.id;
    m.forget("project", id);
    ix.rebuild(project, m, TOKEN);
    expect(ix.search(TOKEN, "payments")).toEqual([]);
    ix.remove(TOKEN);
    expect(existsSync(ix.fileOf(TOKEN))).toBe(false);
    expect(m.list("project").entries.length).toBe(2);
    ix.rebuild(project, m, TOKEN);
    expect(ix.search(TOKEN, "checkout").length).toBe(1);
  });
  test("only letters and digits of a question reach the query", () => {
    expect(ftsQuery(`payments"; DROP TABLE notes; --`)).toBe(`"payments"* OR "DROP"* OR "TABLE"* OR "notes"*`);
    expect(ftsQuery("? ! a")).toBe("");
  });
  test("the index file is the person's own (0600) and its folder is private", () => {
    const { project, m, ix, data } = rig();
    ix.rebuild(project, m, TOKEN);
    expect(statSync(ix.fileOf(TOKEN)).mode & 0o777).toBe(0o600);
    expect(statSync(join(data, "notes")).mode & 0o077).toBe(0);
  });
});

describe("the search command Claude runs", () => {
  test("it prints the matching lines with their source, read only", () => {
    const { project, m, ix } = rig();
    ix.rebuild(project, m, TOKEN);
    const before = readFileSync(ix.fileOf(TOKEN));
    const r = sh([ix.script, TOKEN, "what", "did", "we", "decide", "about", "payments?"]);
    expect(r.status).toBe(0);
    expect(r.stdout).toContain("- Decided: payments go through Stripe, because the client already has an account (you wrote it, 2026-11-10)");
    expect(readFileSync(ix.fileOf(TOKEN)).equals(before)).toBe(true);
  });
  test("quotes, semicolons and sqlite dot commands in the words do nothing", () => {
    const { project, m, ix, data } = rig();
    ix.rebuild(project, m, TOKEN);
    const r = sh([ix.script, TOKEN, `'); .shell touch ${join(data, "pwned")} --`, "payments"]);
    expect(r.status).toBe(0);
    expect(existsSync(join(data, "pwned"))).toBe(false);
    expect(r.stdout).toContain("payments go through Stripe");
  });
  test("a wrong token, no index, or no words: a plain answer and exit 0", () => {
    const { project, m, ix } = rig();
    ix.rebuild(project, m, TOKEN);
    expect(sh([ix.script, "../../etc", "x"]).stdout.trim()).toBe("Unknown project.");
    expect(sh([ix.script, "f".repeat(24), "payments"]).stdout.trim()).toBe("No notes yet.");
    expect(sh([ix.script, TOKEN, "?"]).stdout.trim()).toBe("Give a few words to search for.");
    const none = sh([ix.script, TOKEN, "zebra"]);
    expect(none.status).toBe(0); expect(none.stdout.trim()).toBe("Nothing found in the notes for that.");
  });
  test("the command the start block names is exactly the script and the token", () => {
    const { ix } = rig();
    expect(ix.command(TOKEN)).toBe(`/bin/sh '${ix.script}' ${TOKEN}`);
  });
});

describe("the SessionStart hook (Claude Code)", () => {
  test("its plan names the exact file and entry, and it is Claude Code's only", () => {
    const project = tmp(), data = tmp(), s = new DoneSignals(data);
    const p = s.plan(project, "claude", "start");
    expect(p).toMatchObject({ rel: ".claude/settings.local.json", on: false, creates: true });
    const adds = JSON.parse(p.adds);
    expect(Object.keys(adds.hooks)).toEqual(["SessionStart"]);
    expect(adds.hooks.SessionStart[0]).toMatchObject({ matcher: "startup|clear|compact", hooks: [{ type: "command", timeout: 5 }] });
    expect(HOOK_EVENT.start).toBe("SessionStart"); expect(HOOK_MATCHER.start).toBe("startup|clear|compact");
    expect(s.plan(project, "codex", "start").problem).toBeTruthy();
  });
  test("adding keeps every other hook, adding twice adds once, and Remove takes out only Squibby's", () => {
    const project = tmp(), data = tmp(), s = new DoneSignals(data);
    mkdirSync(join(project, ".claude"));
    const theirs = { matcher: "startup", hooks: [{ type: "command", command: "echo mine" }] };
    writeFileSync(join(project, ".claude/settings.local.json"), JSON.stringify({ permissions: { allow: ["Bash(npm test)"] }, hooks: { SessionStart: [theirs] } }, null, 2));
    expect(s.add(project, "claude", "start").on).toBe(true);
    s.add(project, "claude", "start");
    let j = JSON.parse(readFileSync(join(project, ".claude/settings.local.json"), "utf8"));
    expect(j.hooks.SessionStart.length).toBe(2);
    expect(j.hooks.SessionStart[0]).toEqual(theirs);
    expect(j.permissions.allow).toEqual(["Bash(npm test)"]);
    // The other kinds can sit beside it, and each Remove takes only its own.
    s.add(project, "claude", "done");
    expect(s.remove(project, "claude", "start").on).toBe(false);
    j = JSON.parse(readFileSync(join(project, ".claude/settings.local.json"), "utf8"));
    expect(j.hooks.SessionStart).toEqual([theirs]);
    expect(j.hooks.Stop.length).toBe(1);
  });
  test("its command prints the start file and ends 0; with no file it prints nothing and ends 0", () => {
    const data = tmp(), dir = join(data, START_DIR);
    mkdirSync(dir);
    const cmd = startCommand(dir, TOKEN);
    let r = sh(["-c", cmd]);
    expect(r.status).toBe(0); expect(r.stdout).toBe("");
    writeFileSync(join(dir, `${TOKEN}.md`), "Notes\n- House rule: never edit pricing.txt\n");
    r = sh(["-c", cmd]);
    expect(r.status).toBe(0); expect(r.stdout).toBe("Notes\n- House rule: never edit pricing.txt\n");
  });
  test("a data folder with a quote in its path still works", () => {
    const data = join(tmp(), "it's here"), dir = join(data, START_DIR);
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, `${TOKEN}.md`), "ok\n");
    expect(sh(["-c", startCommand(dir, TOKEN)]).stdout).toBe("ok\n");
  });
});

describe("the start file is written only while the hook is set up", () => {
  test("with the hook: the file holds exactly the block and the index is built; without it: neither is kept", () => {
    const { project, data, m } = rig();
    const signals = new DoneSignals(data), notes = new SessionStartNotes({ data, signals, memoryDir: data });
    const off = notes.refresh(project, m);
    expect(off.hook).toBe(false);
    expect(existsSync(join(data, START_DIR))).toBe(false);
    signals.add(project, "claude", "start");
    const on = notes.refresh(project, m);
    const token = signals.tokenFor(project, false)!;
    const file = join(data, START_DIR, `${token}.md`);
    expect(on.hook).toBe(true);
    expect(readFileSync(file, "utf8")).toBe(on.text);
    expect(statSync(file).mode & 0o777).toBe(0o600);
    expect(on.text).toContain("payments go through Stripe");
    // M79 (the memory lab, 11 Nov 2026: about 100 tokens a session, used 0 of 18 times): the block no longer names the
    // search command. The command, its script and the index stay and keep working for anyone who calls them.
    expect(on.text).not.toContain("search.sh");
    expect(on.text).not.toContain("More notes: run");
    expect(notes.index.search(token, "payments").length).toBe(1);
    expect(sh([notes.index.script, token, "payments"]).stdout).toContain("payments go through Stripe");
    expect(notes.index.command(token)).toBe(`/bin/sh '${join(data, "notes", "search.sh")}' ${token}`);
    // What the hook prints is exactly what the page shows.
    expect(sh(["-c", startCommand(join(data, START_DIR), token)]).stdout).toBe(on.text);
    // The hook removed: the copies go.
    signals.remove(project, "claude", "start");
    notes.refresh(project, m);
    expect(existsSync(file)).toBe(false);
    expect(existsSync(notes.index.fileOf(token))).toBe(false);
  });
  test("at the engine's start, the copies of a project whose hook is gone are removed", () => {
    const { project, data, m } = rig();
    const signals = new DoneSignals(data), notes = new SessionStartNotes({ data, signals, memoryDir: data });
    signals.add(project, "claude", "start");
    notes.refresh(project, m);
    const token = signals.tokenFor(project, false)!;
    // Taken out of the settings file by someone else (Delete everything's helper, leaving the project, by hand).
    writeFileSync(join(project, ".claude/settings.local.json"), "{}\n");
    writeFileSync(join(data, START_DIR, "not-ours.txt"), "x");
    notes.sweep();
    expect(existsSync(join(data, START_DIR, `${token}.md`))).toBe(false);
    expect(existsSync(join(data, START_DIR, "not-ours.txt"))).toBe(true);
  });
});
