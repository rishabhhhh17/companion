// Watch routines as the real engine program (F21): the group switch refuses the commands with the one plain line, taking a
// watch away still works with Flow off, Stop everything stops checks, the file is written in the data folder, and nothing
// reaches the network (scheduled checks are off in these runs, and nothing is added that would look at a site).
import { afterEach, describe, expect, test } from "bun:test";
import { existsSync, mkdtempSync, readFileSync, realpathSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { OFF_LINE, TOOLS, refusal } from "../src/groups.ts";
import { makeChecks, makeEvidence } from "../src/watchwire.ts";
import { stopGroupWork } from "../src/groups.ts";

const made: string[] = [];
afterEach(() => { while (made.length) rmSync(made.pop()!, { recursive: true, force: true }); });
const tmp = (l: string) => { const d = realpathSync(mkdtempSync(join(tmpdir(), `companion-wp-${l}-`))); made.push(d); return d; };

function launch() {
  const data = tmp("data");
  const proc = Bun.spawn(["bun", join(import.meta.dir, "../src/main.ts")], {
    stdin: "pipe", stdout: "pipe", stderr: "pipe",
    env: { ...process.env, COMPANION_DATA: data, COMPANION_ENGINE: "scripted", COMPANION_SCRIPT: "[]" },
  });
  const lines: string[] = [];
  let buf = "";
  const done = (async () => { const dec = new TextDecoder(); for await (const chunk of proc.stdout) { buf += dec.decode(chunk, { stream: true }); let i; while ((i = buf.indexOf("\n")) >= 0) { lines.push(buf.slice(0, i)); buf = buf.slice(i + 1); } } })();
  const send = (o: unknown) => { proc.stdin.write(JSON.stringify(o) + "\n"); proc.stdin.flush(); };
  const events = () => lines.map((l) => JSON.parse(l));
  const waitFor = async (cond: () => boolean, ms = 8000) => { const end = Date.now() + ms; while (!cond()) { if (Date.now() > end) throw new Error("timed out; saw: " + lines.join(" | ").slice(0, 900)); await new Promise((r) => setTimeout(r, 20)); } };
  const close = async () => { proc.stdin.end(); await proc.exited; await done; };
  return { data, send, events, lines, waitFor, close };
}
let n = 0;
const msg = (type: string, extra: Record<string, unknown>) => ({ v: 1, id: `m${++n}`, type, ...extra });

describe("the catalog", () => {
  test("every watch command is in Flow once, and Flow off refuses them with the one line; taking a watch away stays", () => {
    const offFlow = (k: string) => (k === "flow.on" ? false : undefined);
    const cmds = ["watch.add", "watch.list", "watch.remove", "watch.pause", "watch.check", "watch.fix", "where.was.i"];
    for (const c of cmds) {
      expect(TOOLS.filter((t) => t.runner.includes(c)), c).toHaveLength(1);
      expect(TOOLS.find((t) => t.runner.includes(c))!.group, c).toBe("flow");
      expect(refusal(offFlow, { type: c }), c).toBe(c === "watch.remove" ? null : OFF_LINE);
      expect(refusal(() => undefined, { type: c }), c).toBeNull();
    }
    expect(TOOLS.find((t) => t.id === "connections")!.runner).toEqual(["watch.fix"]);
  });
  test("a group switched off ends the running checks", () => {
    let stopped = 0;
    const parts = { runner: { stopGroup() {} }, walks: { stopAll() {} }, browser: { stop() {} }, watches: { stopAll() { stopped++; } } };
    stopGroupWork(["guide"], parts as never);
    expect(stopped).toBe(0);
    stopGroupWork(["flow"], parts as never);
    expect(stopped).toBe(1);
  });
});

describe("the engine as a program", () => {
  test("add, list, pause, resume and remove; the list is a file in the data folder, and nothing is checked while Watch routines is off", async () => {
    const project = tmp("proj");
    const r = launch();
    await r.waitFor(() => r.lines.length >= 1);
    r.send(msg("settings.apply", { values: { "watch.on": false } }));
    await r.waitFor(() => r.events().some((e: any) => e.type === "settings.applied"));
    r.send(msg("watch.add", { project, kind: "site_up", target: "shop.example.com", schedule: "15m" }));
    await r.waitFor(() => r.events().some((e: any) => e.type === "watch.list" && e.watches.length === 1));
    const w = r.events().find((e: any) => e.type === "watch.list").watches[0];
    expect(w).toMatchObject({ kind: "site_up", target: "https://shop.example.com/", schedule: "15m", state: "unknown", checking: false });
    expect(JSON.parse(readFileSync(join(r.data, "watch.json"), "utf8")).watches).toHaveLength(1);
    r.send(msg("watch.pause", { project, watch: w.watch, paused: true }));
    await r.waitFor(() => r.events().some((e: any) => e.type === "watch.state" && e.state === "paused"));
    r.send(msg("watch.remove", { project, watch: w.watch }));
    await r.waitFor(() => r.events().filter((e: any) => e.type === "watch.list").length >= 2);
    expect(r.events().filter((e: any) => e.type === "watch.list").at(-1).watches).toEqual([]);
    expect(r.events().some((e: any) => e.type === "watch.alert")).toBe(false);
    await r.close();
    expect(JSON.parse(readFileSync(join(r.data, "watch.json"), "utf8")).watches).toEqual([]);
  });
  test("Flow off: adding, listing and checking are refused with the one line, nothing is written, and removing still works", async () => {
    const project = tmp("proj");
    const r = launch();
    await r.waitFor(() => r.lines.length >= 1);
    r.send(msg("settings.apply", { values: { "watch.on": false } }));
    await r.waitFor(() => r.events().some((e: any) => e.type === "settings.applied"));
    r.send(msg("watch.add", { project, kind: "site_up", target: "shop.example.com", schedule: "15m" }));
    await r.waitFor(() => r.events().some((e: any) => e.type === "watch.list"));
    const id = r.events().find((e: any) => e.type === "watch.list").watches[0].watch;
    r.send(msg("settings.apply", { values: { "watch.on": false, "flow.on": false } }));
    await r.waitFor(() => r.events().filter((e: any) => e.type === "settings.applied").length >= 2);
    const before = r.lines.length;
    for (const [t, extra] of [["watch.add", { kind: "site_up", target: "other.example.com", schedule: "15m" }], ["watch.list", {}], ["watch.check", { watch: id }], ["watch.pause", { watch: id, paused: true }], ["watch.fix", { watch: id }], ["where.was.i", {}]] as const)
      r.send(msg(t, { project, ...extra }));
    await r.waitFor(() => r.events().slice(before).filter((e: any) => e.type === "protocol.error").length >= 6);
    for (const e of r.events().slice(before).filter((x: any) => x.type === "protocol.error")) expect(e.reason).toBe(OFF_LINE);
    expect(JSON.parse(readFileSync(join(r.data, "watch.json"), "utf8")).watches).toHaveLength(1);
    r.send(msg("watch.remove", { project, watch: id }));
    await r.waitFor(() => r.events().slice(before).some((e: any) => e.type === "watch.list" && e.watches.length === 0));
    await r.close();
  });
  test("where.was.i answers with no model, and a bad command is refused by the protocol, not guessed at", async () => {
    const project = tmp("proj");
    const r = launch();
    await r.waitFor(() => r.lines.length >= 1);
    r.send(msg("where.was.i", { project }));
    await r.waitFor(() => r.events().some((e: any) => e.type === "where.ready"));
    expect(r.events().find((e: any) => e.type === "where.ready")).toMatchObject({ project, lines: ["You have not run a task in this project yet.", "Nothing is unfinished."], next: { action: "none" } });
    const before = r.lines.length;
    r.send(msg("watch.add", { project, kind: "nope", schedule: "15m" }));
    r.send(msg("watch.pause", { project, watch: "w_1" }));
    r.send(msg("where.was.i", { project, since: "yesterday-ish" }));
    await r.waitFor(() => r.events().slice(before).filter((e: any) => e.type === "protocol.error").length >= 3);
    await r.close();
    expect(existsSync(join(r.data, "watch.json"))).toBe(false);
  });
});

describe("the real checks are put together from the engine's parts", () => {
  test("each kind goes to its own reader, and a Stop is no result", async () => {
    const seen: string[] = [];
    const checks = makeChecks({
      site: { fetch: async () => ({ status: 200, headers: { get: () => null } }), lookup: async () => ["93.184.216.34"] },
      vercel: { lastFailedBuild: async () => ({ state: "none" as const }), latestDeploy: async () => { seen.push("vercel"); return { state: "ready" as const, url: "a", building: false }; } },
      gh: { latestRun: async () => { seen.push("gh"); return { state: "cancelled" as const }; }, failureLog: async () => null },
      project: async () => { seen.push("project"); return { outcome: "ok" as const, reason: "fine" }; },
    });
    const ac = new AbortController();
    expect(await checks.site("https://a.example.com/", ac.signal, 1000)).toMatchObject({ outcome: "ok" });
    expect(await checks.deploy("/p", ac.signal)).toEqual({ outcome: "ok", reason: "Your latest Vercel deploy is live." });
    expect(await checks.ci("/p", ac.signal)).toBeNull();
    expect(await checks.project("/p", ac.signal)).toMatchObject({ outcome: "ok" });
    expect(seen).toEqual(["vercel", "gh", "project"]);
  });
  test("the evidence for Fix it is read only and says what each kind saw", async () => {
    const ev = makeEvidence({
      vercel: { lastFailedBuild: async () => ({ state: "unavailable" as const, reason: "no tool" }), latestDeploy: async () => ({ state: "none" as const, building: false }) },
      gh: { latestRun: async () => ({ state: "failing" as const, reason: "Tests failed on main.", run: { id: 1, workflow: "Tests", branch: "main", url: "", title: "" }, failing: [] }), failureLog: async () => "Failed: test" },
    });
    const w = (kind: string, target = "") => ({ id: "w_1", project: "/p", kind, target, schedule: "15m", state: "failing", since: "", reason: "It said no.", lastCheckedAt: null, alerted: true, history: [], createdAt: "" }) as never;
    const ac = new AbortController();
    expect(await ev(w("site_up", "https://shop.example.com/"), ac.signal)).toBe("My site shop.example.com is not working. What a plain web request saw: It said no.");
    expect(await ev(w("deploy_status"), ac.signal)).toBe("no tool");
    expect(await ev(w("ci_status"), ac.signal)).toContain("Failed: test");
    expect(await ev(w("project_checks"), ac.signal)).toBe("My project's own checks are failing. It said no.");
  });
});
