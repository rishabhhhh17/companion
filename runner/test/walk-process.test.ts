// A lesson through the real runner program, the way the app drives it: lines in, lines out. Covers the wiring the unit
// tests cannot: the shipped lessons are found, Stop everything ends a lesson, the place is saved on disk, beta numbers
// only count once turned on, and every line the runner says is valid protocol.
import { afterEach, describe, expect, test } from "bun:test";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { parseEvent } from "../../protocol/index.ts";

const made: string[] = [];
afterEach(() => { while (made.length) rmSync(made.pop()!, { recursive: true, force: true }); });
const tmp = (l: string) => { const d = realpathSync(mkdtempSync(join(tmpdir(), `companion-wp-${l}-`))); made.push(d); return d; };

function launch(data: string) {
  const proc = Bun.spawn(["bun", join(import.meta.dir, "../src/main.ts")], { stdin: "pipe", stdout: "pipe", stderr: "pipe", env: { ...process.env, COMPANION_DATA: data, COMPANION_ENGINE: "scripted", COMPANION_SCRIPT: "[]" } });
  const lines: string[] = []; let buf = "";
  const done = (async () => { const dec = new TextDecoder(); for await (const c of proc.stdout) { buf += dec.decode(c, { stream: true }); let i; while ((i = buf.indexOf("\n")) >= 0) { lines.push(buf.slice(0, i)); buf = buf.slice(i + 1); } } })();
  let n = 0;
  const send = (o: Record<string, unknown>) => { proc.stdin.write(JSON.stringify({ v: 1, id: `t${++n}`, ...o }) + "\n"); proc.stdin.flush(); };
  const events = () => lines.map((l) => JSON.parse(l));
  const of = (t: string) => events().filter((e) => e.type === t);
  const waitFor = async (cond: () => boolean, ms = 8000) => { const end = Date.now() + ms; while (!cond()) { if (Date.now() > end) throw new Error("timed out; saw: " + lines.join(" | ").slice(0, 800)); await new Promise((r) => setTimeout(r, 20)); } };
  const close = async () => { proc.stdin.end(); await proc.exited; await done; };
  return { send, events, of, lines, waitFor, close };
}

describe("a lesson through the real runner", () => {
  test("the shipped lessons are listed, all as drafts, and every line the runner says is valid protocol", async () => {
    const project = tmp("proj"), r = launch(tmp("data"));
    r.send({ type: "walk.list", project });
    await r.waitFor(() => r.of("walk.lessons").length === 1);
    const l = r.of("walk.lessons")[0];
    expect(l.problems).toBe(0);
    expect(l.lessons.map((x: any) => x.id)).toEqual(expect.arrayContaining(["companion-screen-recording", "vercel-add-env-var", "lovable-publish"]));
    for (const x of l.lessons) expect(x.status).toBe("draft");
    await r.close();
    for (const line of r.lines) expect(parseEvent(line).ok, line).toBe(true);
  });

  test("a lesson of your own in the data folder runs: steps, a click, a proof from the project, the place saved, Stop, and resume", async () => {
    const project = tmp("proj"), data = tmp("data");
    mkdirSync(join(data, "lessons"));
    writeFileSync(join(data, "lessons", "mine.json"), JSON.stringify({ id: "mine", title: "Mine", app: "Demo", goal: "g", steps: [
      { id: "one", say: "Do one", find: "the one button", check: { kind: "file_exists", path: "one.txt" } },
      { id: "two", say: "Do two", find: "the two button", check: { kind: "ask" } },
    ] }));
    const r = launch(data);
    r.send({ type: "walk.start", project, lesson: "mine" });
    await r.waitFor(() => r.of("walk.step").length === 1);
    const walk = r.of("walk.step")[0].walk;
    writeFileSync(join(project, "one.txt"), "x");
    r.send({ type: "walk.acted", walk, index: 0, how: "clicked" });
    await r.waitFor(() => r.of("walk.step").length === 2);
    expect(r.of("walk.step")[1]).toMatchObject({ index: 1, say: "Do two", ask: true });
    // The place is on disk after the move, holding step names and outcomes only.
    const saved = readdirSync(join(data, "walks"));
    expect(saved.length).toBe(1);
    expect(readFileSync(join(data, "walks", saved[0]), "utf8")).not.toContain(project);
    // Stop everything ends the lesson, and a late click does nothing.
    r.send({ type: "agent.interruptAll", reason: "stop" });
    await r.waitFor(() => r.of("walk.stopped").length === 1);
    const before = r.events().length;
    r.send({ type: "walk.acted", walk, index: 1, how: "clicked" });
    r.send({ type: "runner.ping" });
    await r.waitFor(() => r.of("runner.pong").length === 1);
    expect(r.events().length).toBe(before + 1);   // only the pong
    // Starting again picks up where it left off: step two is one only the person can confirm, so it asks first.
    r.send({ type: "walk.start", project, lesson: "mine" });
    await r.waitFor(() => r.of("walk.step").length === 3);
    expect(r.of("walk.step")[2]).toMatchObject({ index: 1, say: "Do two", already: true });
    r.send({ type: "walk.answer", walk: r.of("walk.step")[2].walk, index: 1, worked: true });
    await r.waitFor(() => r.of("walk.done").length === 1);
    await r.close();
    for (const line of r.lines) expect(parseEvent(line).ok, line).toBe(true);
  });

  test("a project that reads settings it does not have gets lessons made from it, first in the list", async () => {
    const project = tmp("proj"), r = launch(tmp("data"));
    writeFileSync(join(project, "package.json"), JSON.stringify({ name: "x", dependencies: { vite: "5", react: "18" } }));
    mkdirSync(join(project, "src")); writeFileSync(join(project, "src", "db.ts"), "createClient(import.meta.env.VITE_SUPABASE_URL)");
    r.send({ type: "walk.list", project });
    await r.waitFor(() => r.of("walk.lessons").length === 1);
    expect(r.of("walk.lessons")[0].lessons.slice(0, 2)).toMatchObject([{ id: "from-project-settings", fromProject: true, steps: 3 }, { id: "from-project-vercel", fromProject: true }]);
    r.send({ type: "walk.start", project, lesson: "from-project-settings" });
    await r.waitFor(() => r.of("walk.step").length === 1);
    expect(r.of("walk.step")[0]).toMatchObject({ lesson: "from-project-settings", index: 0, total: 3, ask: false });
    await r.close();
    for (const line of r.lines) expect(parseEvent(line).ok, line).toBe(true);
  });

  test("beta numbers count nothing until turned on, then only counts", async () => {
    const project = tmp("proj"), data = tmp("data");
    const r = launch(data);
    r.send({ type: "metrics.note", name: "session" });
    r.send({ type: "metrics.show" });
    await r.waitFor(() => r.of("metrics.summary").length === 1);
    expect(r.of("metrics.summary")[0]).toMatchObject({ enabled: false, days: {} });
    expect(existsSync(join(data, "metrics.json"))).toBe(false);
    r.send({ type: "metrics.set", enabled: true });
    r.send({ type: "metrics.note", name: "session" });
    r.send({ type: "metrics.note", name: "my secret words" });
    r.send({ type: "walk.start", project, lesson: "no-such-lesson" });
    await r.waitFor(() => r.of("walk.stopped").length === 1);
    r.send({ type: "metrics.show" });
    await r.waitFor(() => r.of("metrics.summary").length === 3);
    const t = r.of("metrics.summary")[2].totals;
    expect(t.session).toBe(1);
    expect(t.walk_started).toBe(1);
    expect(JSON.stringify(t)).not.toContain("secret");
    expect(readFileSync(join(data, "metrics.json"), "utf8")).not.toContain(project);
    await r.close();
  });
});
