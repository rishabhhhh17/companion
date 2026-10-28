// Watch routines and Where was I on the pages (F21): what the model keeps from the engine's events, the island's one plain
// line, the commands the buttons send, and the rule that Fix it starts a task only after the person's own press.
import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { parseCommand } from "../../protocol/index.ts";
import { fixWatch, startTask, watchAdd, watchCheck, watchFix, watchList, watchPause, watchRemove, whereWasI } from "./commands.ts";
import { failingWatch, islandAlert, islandLine, islandWings } from "./home.ts";
import { initial, reduce, type Model } from "./model.ts";
import { S } from "./strings.ts";
import { usedBy } from "./groups.ts";
import { choiceOf, fixWhat, hostOf, nameOf, scheduleOf, stateLine, validView, watchesOf, whenText } from "./watch.ts";

const read = (p: string) => readFileSync(new URL(p, import.meta.url), "utf8");
const ev = (o: Record<string, unknown>) => ({ v: 1, id: "e", ...o });
const run = (events: Record<string, unknown>[], from: Model = initial()) => events.reduce<Model>((m, e) => reduce(m, e as never), from);
const P = "/Users/sam/shop";
const view = (o: Record<string, unknown> = {}) => ({ project: P, watch: "w_1", kind: "site_up", target: "https://shop.example.com/", schedule: "15m", state: "failing", since: "2026-10-22T10:02:00.000Z", reason: "The site answered with an error on its side (503).", checking: false, history: [], ...o });
const state = (o: Record<string, unknown> = {}) => ev({ type: "watch.state", ...view(o) });
const alert = (what: string, o: Record<string, unknown> = {}) => ev({ type: "watch.alert", project: P, watch: "w_1", what, kind: "site_up", target: "https://shop.example.com/", reason: "503", since: "2026-10-22T10:02:00.000Z", ...o });

describe("the commands the buttons send", () => {
  test("each one is a command the protocol accepts, and names the project", () => {
    const sent = [watchAdd(P, "site_up", "15m", " shop.example.com "), watchAdd(P, "deploy_status", "daily@9", "ignored"), watchList(P), watchRemove(P, "w_1"), watchPause(P, "w_1", true), watchCheck(P, "w_1"), watchFix(P, "w_1"), whereWasI(P), whereWasI(P, "2026-10-22T09:00:00.000Z")];
    for (const c of sent) { const r = parseCommand(JSON.stringify(c)); expect(r.ok, JSON.stringify(c)).toBe(true); expect((c as { project: string }).project).toBe(P); }
    expect(sent[0]).toMatchObject({ target: "shop.example.com" });
    expect(sent[1]).not.toHaveProperty("target");
  });
  test("Fix it starts an ordinary task with the evidence in it, on the record, and nothing more", () => {
    const c = fixWatch(P, "My site is down.", "The site answered 503.") as { type: string; mode: string; prompt: string; offTheRecord?: boolean; project: string };
    expect(c).toMatchObject({ type: "agent.start", mode: "drive", project: P });
    expect(c.offTheRecord).toBeUndefined();
    expect(c.prompt).toContain("My site is down.");
    expect(c.prompt).toContain("The site answered 503.");
    expect(c.prompt).toMatch(/smallest change/);
    expect(c.prompt).toMatch(/Do not weaken or delete tests/);
    expect(Object.keys(c).sort()).toEqual(Object.keys(startTask(P, "x")).sort());
    expect(fixWatch(P, "x", "y".repeat(10_000)) as { prompt: string }).toSatisfy((x: { prompt: string }) => x.prompt.length < 5000);
  });
});

describe("what the model keeps", () => {
  test("a watch's state, replaced as it changes; damaged events are dropped", () => {
    let m = run([state({ state: "ok", reason: "fine" })]);
    expect(m.watches.w_1).toMatchObject({ state: "ok", reason: "fine" });
    m = run([state({ state: "failing" })], m);
    expect(m.watches.w_1.state).toBe("failing");
    expect(run([ev({ type: "watch.state", project: P, watch: "w_1", kind: "nope", state: "ok" })], m)).toBe(m);
    expect(run([state({ state: "weird" })], m)).toBe(m);
    expect(run([state({ watch: "" })], m)).toBe(m);
    expect(validView(view())).toBe(true);
    expect(validView(null)).toBe(false);
  });
  test("a project's list replaces that project's watches only, and drops the alerts of watches that are gone", () => {
    let m = run([state(), state({ watch: "w_2", project: "/Users/sam/other" }), alert("failing")]);
    expect(Object.keys(m.watches).sort()).toEqual(["w_1", "w_2"]);
    expect(Object.keys(m.watchAlerts)).toEqual(["w_1"]);
    m = run([ev({ type: "watch.list", project: P, watches: [] })], m);
    expect(Object.keys(m.watches)).toEqual(["w_2"]);
    expect(m.watchAlerts).toEqual({});
    expect(watchesOf(m.watches, P)).toEqual([]);
    expect(run([ev({ type: "watch.list", project: P, watches: "no" })], m)).toBe(m);
  });
  test("an alert is kept while the watch is failing, and ends when it is fine, paused or removed", () => {
    let m = run([state(), alert("failing")]);
    expect(Object.keys(m.watchAlerts)).toEqual(["w_1"]);
    expect(run([state({ state: "ok" })], m).watchAlerts).toEqual({});
    expect(run([state({ state: "paused" })], m).watchAlerts).toEqual({});
    expect(run([alert("recovered")], m).watchAlerts).toEqual({});
    expect(run([state({ state: "failing" })], m).watchAlerts).toEqual(m.watchAlerts);
  });
  test("the reason in an alert has secrets hidden again", () => {
    const m = run([alert("failing", { reason: "token=abcdef123456789 said no" })]);
    expect(m.watchAlerts.w_1.reason).not.toContain("abcdef123456789");
  });
  test("evidence is kept only for a Fix it the person pressed", () => {
    const e = ev({ type: "watch.evidence", project: P, watch: "w_1", kind: "ci_status", text: "Failed: test" });
    expect(run([e]).watchFix).toBeNull();
    const asked = run([ev({ type: "ui.watchAsked", watch: "w_1" }), e]);
    expect(asked.watchFix).toMatchObject({ project: P, watch: "w_1", kind: "ci_status", text: "Failed: test" });
    expect(run([ev({ type: "ui.watchAsked", watch: "w_2" }), e]).watchFix).toBeNull();
    expect(run([ev({ type: "ui.watchFixUsed" })], asked)).toMatchObject({ watchFix: null, watchAsked: null });
    expect(run([ev({ type: "ui.watchAsked", watch: "w_1" }), ev({ type: "watch.evidence", project: P, watch: "w_1", kind: "ci_status", text: "key sk-abcdefghijklmnopqrstuv" })]).watchFix!.text).not.toContain("sk-abcdefghijklmnopqrstuv");
  });
  test("evidence marked stopped ends the wait and starts nothing, so the Fix it button never stays on 'reading'", () => {
    const stopped = ev({ type: "watch.evidence", project: P, watch: "w_1", kind: "ci_status", text: "down", stopped: true });
    const asked = run([ev({ type: "ui.watchAsked", watch: "w_1" })]);
    expect(asked.watchAsked).toBe("w_1");
    const after = run([stopped], asked);
    expect(after).toMatchObject({ watchAsked: null, watchFix: null });
    // a stopped answer for a watch that was not asked for changes nothing
    expect(run([ev({ type: "ui.watchAsked", watch: "w_2" }), stopped]).watchAsked).toBe("w_2");
  });
  test("Where was I keeps its lines and one next step; an unknown step is dropped, never guessed", () => {
    const ok = run([ev({ type: "where.ready", project: P, lines: ["a", "b"], next: { action: "fixWatch", watch: "w_1" } })]);
    expect(ok.recap).toEqual({ lines: ["a", "b"], next: { action: "fixWatch", watch: "w_1" } });
    expect(run([ev({ type: "where.ready", project: P, lines: ["a"], next: { action: "findProblem" } })]).recap!.next).toEqual({ action: "findProblem" });
    expect(run([ev({ type: "where.ready", project: P, lines: ["a"], next: { action: "deploy" } })]).recap).toEqual({ lines: ["a"] });
    expect(run([ev({ type: "where.ready", project: P, lines: ["a"], next: { action: "fixWatch" } })]).recap).toEqual({ lines: ["a"] });
    expect(run([ev({ type: "where.ready", project: P, lines: [], next: { action: "none" } })], ok).recap).toBeNull();
    expect(run([ev({ type: "ui.recapClosed" })], ok).recap).toBeNull();
  });
});

describe("the island", () => {
  test("a failing watch gives one plain line and the red mark; nothing else changes", () => {
    const quiet = initial();
    expect(islandAlert(quiet)).toBe(false);
    expect(islandLine(quiet)).toBe("");
    const m = run([state(), alert("failing")]);
    expect(failingWatch(m)).toMatchObject({ kind: "site_up" });
    expect(islandAlert(m)).toBe(true);
    expect(islandLine(m)).toBe("Your site (shop.example.com) is failing");
    expect(islandWings(m)).toEqual({ state: "error", mark: "red" });
    expect(islandAlert(run([alert("recovered")], m))).toBe(false);
    expect(islandLine(run([state({ state: "ok" })], m))).toBe("");
  });
  test("a question for the person still comes first, and with the engine off there is no alert", () => {
    const asking = run([state(), alert("failing"), ev({ type: "approval.request", approval: "ap_1", agent: "builder-1", checkpoint: "cp", toolUseId: "t", risk: "irreversible", title: "Delete the build folder", expiresAt: "2099-01-01T00:00:00Z" })]);
    expect(islandLine(asking)).toContain("Delete the build folder");
    const off: Model = { ...run([state(), alert("failing")]), runnerUp: false };
    expect(failingWatch(off)).toBeNull();
    expect(islandAlert(off)).toBe(false);
  });
  test("the island page draws it from the same model and adds no new command", () => {
    const page = read("./island.tsx");
    expect(page).toContain("islandWings(m");
    expect([...page.matchAll(/invoke\("(\w+)"/g)].map((x) => x[1]).sort()).toEqual(["island_alert", "island_click", "island_state"]);
    expect(page).not.toMatch(/\bfocus\(|keydown|keyup/);
  });
});

describe("the words and helpers", () => {
  test("schedules", () => {
    expect(scheduleOf("daily", 14)).toBe("daily@14");
    expect(scheduleOf("daily", 99)).toBe("daily@9");
    expect(scheduleOf("daily", 1.5)).toBe("daily@9");
    expect(scheduleOf("5m", 0)).toBe("5m");
    expect(scheduleOf("1m", 0)).toBe("30m");
    expect(choiceOf("15m")).toBe("15m");
    expect(choiceOf("2m")).toBe("30m");
    expect(S.watch.scheduleWords("daily@9")).toBe("Once a day at 9:00");
    expect(S.watch.scheduleWords("1h")).toBe("Every hour");
  });
  test("names, times and one line per watch", () => {
    expect(nameOf({ kind: "site_up", target: "https://shop.example.com/x" })).toBe("Your site (shop.example.com)");
    expect(nameOf({ kind: "ci_status" })).toBe("Your GitHub checks");
    expect(hostOf("nonsense")).toBe("nonsense");
    const now = new Date(2026, 9, 22, 15).getTime();
    expect(whenText(new Date(2026, 9, 22, 10, 2).toISOString(), now)).toBe("10:02");
    expect(whenText(new Date(2026, 9, 20, 9, 5).toISOString(), now)).toBe("20 Oct at 09:05");
    expect(whenText("not a time")).toBe("");
    const w = view() as never;
    expect(stateLine(w, now)).toMatch(/^Failing since .+\. The site answered with an error on its side \(503\)\.$/);
    expect(stateLine({ ...(view() as object), checking: true } as never, now)).toBe("Failing. Checking now.");
    expect(fixWhat("site_up", "https://shop.example.com/")).toBe("My site shop.example.com is not answering properly.");
    expect(fixWhat("deploy_status")).toBe("My latest Vercel deploy failed.");
  });
  test("no praise, score, streak, mood or em dash in anything a person reads about watches", () => {
    const all: string[] = [];
    const walk = (v: unknown) => { if (typeof v === "string") all.push(v); else if (typeof v === "function") all.push(String((v as (...a: string[]) => unknown)("x", "y"))); else if (v && typeof v === "object") Object.values(v).forEach(walk); };
    walk(S.watch); walk(S.recapNext); walk(S.recapSource);
    for (const k of Object.keys(S.set)) if (/^(watch|where)\./.test(k) || k === "rescue.readCiRun") walk((S.set as Record<string, unknown>)[k]);
    expect(all.length).toBeGreaterThan(40);
    const banned = /\b(score|streak|level|badge|great job|well done|awesome|amazing|nice work|good job|keep it up|congrat|proud|happy|sorry|oops|don'?t worry)\b/i;
    for (const s of all) { expect(s, s).not.toMatch(banned); expect(s, s).not.toContain("—"); expect(s, s).not.toContain("–"); }
  });
});

describe("a tool counts as tried only after a real use", () => {
  test("a watch that ran, Fix it's evidence and Where was I's answer", () => {
    expect(usedBy({ type: "watch.state", lastCheckedAt: "2026-10-22T10:00:00Z", checking: false })).toEqual(["watch"]);
    expect(usedBy({ type: "watch.state", checking: false })).toEqual([]);
    expect(usedBy({ type: "watch.state", lastCheckedAt: "2026-10-22T10:00:00Z", checking: true })).toEqual([]);
    expect(usedBy({ type: "watch.evidence", text: "x" })).toEqual(["connections"]);
    expect(usedBy({ type: "where.ready", lines: ["x"] })).toEqual(["whereWasI"]);
    expect(usedBy({ type: "where.ready" }, { read: (k) => (k === "flow.on" ? false : undefined) })).toEqual([]);
  });
});

describe("Home draws it, and starts nothing by itself", () => {
  const card = read("./card.tsx");
  test("the watch list is a plain panel of the existing components on the Now tab, only while Flow is on", () => {
    expect(card).toContain('show("watch") && project && groups.on("watch")');
    const panel = read("./watchPanel.tsx");
    for (const w of [S.watch.checkNow, S.watch.pause, S.watch.remove, S.watch.fixIt, S.watch.add]) expect(w.length).toBeGreaterThan(2);
    expect(panel).toContain("S.watch.checkNow");
    expect(panel).toContain("S.watch.fixIt");
    expect(panel).toContain("S.watch.addOne");
    expect(panel).not.toMatch(/setInterval|setTimeout|useEffect/);
  });
  test("Where was I is asked for only when Home opens after the break chosen in Settings, never on a timer", () => {
    expect(card.match(/whereWasI\(/g)!.length).toBe(1);
    const at = card.indexOf('const off = listen("opened"');
    expect(card.slice(at, card.indexOf("}, []);", at))).toContain("recapDue(last, Date.now())");
    expect(card).not.toMatch(/setInterval\([^)]*whereWasI/);
  });
  test("Fix it asks for the evidence on the press, and the task starts once the evidence comes, only for that press", () => {
    expect(card).toContain('dispatch({ type: "ui.watchAsked", watch: w.watch });');
    expect(card).toContain("void send(watchFix(project, w.watch))");
    const fixing = card.slice(card.indexOf("const fixing = m.watchFix;"), card.indexOf("// The Watch list's buttons"));
    expect(fixing).toContain('dispatch({ type: "ui.watchFixUsed" });');
    expect(fixing).toContain("fixing.project !== projectRef.current");
    expect(card.match(/fixWatch\(/g)!.length).toBe(1);
  });
  test("the next step of Where was I is a button; pressing it, not showing it, starts anything", () => {
    expect(card).toContain("onClick={whereNext}");
    const body = card.slice(card.indexOf("const whereNext = () => {"), card.indexOf("const whereNext = () => {") + 900);
    expect(body).toContain("watchHandlers.onFix(w)");
    expect(body).toContain("findProblem(project)");
  });
});
