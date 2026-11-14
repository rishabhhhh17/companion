// M89, rendered and clicked through: the usage runway's ring in the notch's panel, the warning before a big job near the
// Claude limit (Hand Squibby the job here) with Save for after the reset, the saved job started later with one tap, and an
// update that installs while the person is away only when the page agrees nothing runs, with the note after the restart.
import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { IslandPanel } from "../src/islandPanel.tsx";
import { initial, reduce, type Model } from "../src/model.ts";
import { S } from "../src/strings.ts";
import { LIMIT_HIT_MS, resetWords } from "../src/runway.ts";
import { PROJECT, app, emit, ev, press, renderHome, renderPage, runner, screen, settle, type } from "./render.tsx";

const fixture = (id: string) => JSON.parse(readFileSync(new URL("../../protocol/fixtures/events.jsonl", import.meta.url), "utf8").split("\n").find((l) => l.includes(`"id":"${id}"`))!);
const PROMPT = "Add a contact form to the home page.";
const RESET = new Date(Date.now() + 2 * 3600_000).toISOString();
const near = { type: "usage.runway", state: "near", source: "plan", usedPct: 91, resetsAt: RESET, window: "five_hour" };
const tasks = () => app.sent().filter((c) => c.type === "agent.start");
const sentOf = (t: string) => app.sent().filter((c) => c.type === t);
const STARTED = { type: "checkpoint.created", project: PROJECT, agent: "builder-1", checkpoint: "cp_0042", label: "Before: a saved job", files: 3, skipped: [] };
const savedList = (jobs: Record<string, unknown>[]) => ({ type: "jobs.saved", project: PROJECT, jobs: jobs.map((j) => ({ savedAt: new Date().toISOString(), ...j })) });

async function handOffReady(answers: Record<string, unknown> = {}) {
  await renderHome({ answers: { ai_tools_find: { apps: [], programs: ["claude"], folders: [] }, ...answers } });
  await type(screen.getAllByRole("textbox")[0]!, "add a contact form");
  await press("Have my AI do it");
  const req = (app.invoked("handoff_prompt")[0]!.args as { req: string }).req;
  await runner({ type: "assist.prompt.done", req, text: PROMPT, diff: [["=", PROMPT]], usdEstimate: 0, handback: "paste" });
}

describe("the warning before a big job near the limit", () => {
  test("no reading: Run it starts at once, with no warning (nothing is guessed)", async () => {
    app.reset();
    await handOffReady();
    await press("Run it");
    expect(tasks().map((c) => c.prompt)).toEqual([PROMPT]);
    expect(screen.queryByRole("alertdialog")).toBeNull();
  });

  test("near the limit: Run it asks first; Save keeps the job and starts nothing; one tap starts it later", async () => {
    app.reset();
    await handOffReady();
    await runner(near);
    await press("Run it");
    expect(tasks()).toEqual([]);
    const warn = screen.getByRole("alertdialog", { name: S.m89.warn.title });
    expect(warn.textContent).toContain(S.m89.warn.job(resetWords(RESET, Date.now())));
    await press(S.m89.warn.save);
    expect(tasks()).toEqual([]);
    expect(sentOf("jobs.save").map((c) => [c.project, c.kind, c.prompt, c.resetsAt])).toEqual([[PROJECT, "job", PROMPT, RESET]]);
    expect(screen.queryByRole("alertdialog")).toBeNull();
    await settle(40);
    expect(screen.getByText(S.m89.saved.savedNote)).toBeTruthy();
    // The engine keeps it and lists it: Now shows it with Start and Remove.
    await runner({ type: "jobs.saved", project: PROJECT, jobs: [{ id: "sj_7", kind: "job", prompt: PROMPT, savedAt: new Date().toISOString(), resetsAt: RESET }] });
    const list = screen.getByRole("region", { name: S.m89.saved.title });
    expect(list.textContent).toContain(PROMPT);
    // Still near the limit: Start asks again; Start anyway starts it and takes it off the list.
    await press(S.m89.saved.startLabel(PROMPT));
    expect(tasks()).toEqual([]);
    await press(S.m89.warn.startAnyway);
    expect(tasks().map((c) => c.prompt)).toEqual([PROMPT]);
    await runner(STARTED);
    expect(sentOf("jobs.drop").map((c) => c.job)).toEqual(["sj_7"]);
  });

  test("Not now closes the warning and nothing is sent; Remove takes a saved job off the list", async () => {
    app.reset();
    await handOffReady();
    await runner(fixture("m89e3"));
    await press("Run it");
    expect(screen.getByRole("alertdialog", { name: S.m89.warn.titleHit })).toBeTruthy();
    await press(S.m89.warn.notNow);
    expect(screen.queryByRole("alertdialog")).toBeNull();
    expect(tasks()).toEqual([]);
    expect(sentOf("jobs.save")).toEqual([]);
    await runner({ ...fixture("m89e4"), project: PROJECT });
    await press(S.m89.saved.removeLabel(S.m89.saved.rescue));
    expect(sentOf("jobs.drop").map((c) => c.job)).toEqual(["sj_11"]);
    expect(sentOf("rescue.diagnose")).toEqual([]);
  });

  test("the saved jobs are asked for when the project opens", async () => {
    app.reset();
    await renderHome();
    await settle(40);
    expect(sentOf("jobs.list").map((c) => c.project)).toContain(PROJECT);
  });
});

describe("the M89 review", () => {
  test("after a limit hit with no reset (the API key route), the saved job waits for the end of the wait, never 'Ready to start'", async () => {
    app.reset();
    await handOffReady();
    await runner(fixture("m89e3"));
    await press("Run it");
    const before = Date.now();
    await press(S.m89.warn.saveWait);
    const saved = sentOf("jobs.save");
    expect(saved.length).toBe(1);
    const at = Date.parse(String(saved[0]!.resetsAt));
    expect(at).toBeGreaterThanOrEqual(before + LIMIT_HIT_MS - 2000);
    expect(at).toBeLessThanOrEqual(Date.now() + LIMIT_HIT_MS);
    await runner(savedList([{ id: "sj_8", kind: "job", prompt: PROMPT, resetsAt: saved[0]!.resetsAt }]));
    const list = screen.getByRole("region", { name: S.m89.saved.title });
    expect(list.textContent).toContain(S.m89.saved.waits(""));
    expect(list.textContent).not.toContain(S.m89.saved.ready);
  });

  test("the warning names the job and when the limit resets", async () => {
    app.reset();
    await handOffReady();
    await runner(near);
    await press("Run it");
    const warn = screen.getByRole("alertdialog", { name: S.m89.warn.title });
    expect(warn.textContent).toContain(PROMPT);
    expect(warn.textContent).toContain(resetWords(RESET, Date.now()));
  });

  test("Start on a saved job, then Save on the warning: still one saved copy, and the box is left as it was", async () => {
    app.reset();
    await renderHome();
    await runner(near, savedList([{ id: "sj_7", kind: "job", prompt: PROMPT, resetsAt: RESET }]));
    const box = screen.getAllByRole("textbox")[0] as HTMLTextAreaElement;
    await type(box, "my own draft");
    await press(S.m89.saved.startLabel(PROMPT));
    await press(S.m89.warn.save);
    expect(screen.queryByRole("alertdialog")).toBeNull();
    expect(sentOf("jobs.save")).toEqual([]);
    expect(sentOf("jobs.drop")).toEqual([]);
    expect(tasks()).toEqual([]);
    expect((screen.getAllByRole("textbox")[0] as HTMLTextAreaElement).value).toBe("my own draft");
  });

  test("a saved job stays on the list when its start is refused, and leaves once the task really began", async () => {
    app.reset();
    await renderHome();
    await runner(savedList([{ id: "sj_7", kind: "job", prompt: PROMPT }]));
    await press(S.m89.saved.startLabel(PROMPT));
    expect(tasks().map((c) => c.prompt)).toEqual([PROMPT]);
    expect(sentOf("jobs.drop")).toEqual([]);
    await runner({ type: "protocol.error", agent: "builder-1", reason: "Over the budget." });
    await settle(40);
    expect(sentOf("jobs.drop")).toEqual([]);
    // A later task that is not the saved one never takes it off the list.
    await runner(STARTED);
    expect(sentOf("jobs.drop")).toEqual([]);
    await press(S.m89.saved.startLabel(PROMPT));
    expect(tasks().length).toBe(2);
    await runner(STARTED);
    expect(sentOf("jobs.drop").map((c) => c.job)).toEqual(["sj_7"]);
  });

  test("a saved Rescue leaves the list once the Rescue is at work, not before", async () => {
    app.reset();
    await renderHome();
    await runner(savedList([{ id: "sj_11", kind: "rescue", prompt: "" }]));
    await press(S.m89.saved.startLabel(S.m89.saved.rescue));
    expect(sentOf("rescue.diagnose").length).toBe(1);
    expect(sentOf("jobs.drop")).toEqual([]);
    await runner({ type: "agent.state", agent: "builder-1", state: "checking" });
    expect(sentOf("jobs.drop").map((c) => c.job)).toEqual(["sj_11"]);
  });

  test("a saved job the shell refused to send stays on the list: a later start of something else never takes it off", async () => {
    for (const kind of ["job", "rescue"] as const) {
      app.reset();
      await renderHome();
      app.answer("send_command", (a: { cmd?: { type?: string } } | undefined) => { if (a?.cmd?.type === "agent.start" || a?.cmd?.type === "rescue.diagnose") throw new Error("Squibby is not ready yet."); return undefined; });
      const prompt = kind === "job" ? PROMPT : "";
      await runner(savedList([{ id: "sj_9", kind, prompt }]));
      await press(S.m89.saved.startLabel(kind === "job" ? PROMPT : S.m89.saved.rescue));
      await settle(40);
      expect(sentOf(kind === "job" ? "agent.start" : "rescue.diagnose").length).toBe(1);
      await runner(kind === "job" ? STARTED : { type: "agent.state", agent: "builder-1", state: "checking" });
      expect(sentOf("jobs.drop")).toEqual([]);
    }
  });

  test("the saved jobs sit in Now's own column, not under the ask box", async () => {
    app.reset();
    await renderHome();
    await runner(savedList([{ id: "sj_7", kind: "job", prompt: PROMPT, resetsAt: RESET }]));
    const list = screen.getByRole("region", { name: S.m89.saved.title });
    expect(list.closest(".askwrap")).toBeNull();
    expect(list.closest(".view")).not.toBeNull();
  });
});

describe("updates that install while the person is away", () => {
  test("the shell's quiet moment installs only when the page agrees nothing runs, and says it is a quiet install", async () => {
    app.reset();
    await renderHome();
    await emit("update-quiet-ready", {});
    expect(app.invoked("install_update").map((c) => c.args)).toEqual([{ quiet: true }]);
    await runner({ type: "agent.state", agent: "builder-1", state: "working" });
    await emit("update-quiet-ready", {});
    expect(app.invoked("install_update").length).toBe(1);
  });
  test("after the restart, the note says it was updated", async () => {
    app.reset();
    await renderHome({ answers: { update_note_take: { version: "1.4.0" } } });
    await settle(60);
    expect(screen.getByText(S.m89.updated("1.4.0"))).toBeTruthy();
  });
});

describe("the runway's ring in the notch's panel", () => {
  const run = (events: Record<string, unknown>[], from: Model = initial()) => events.reduce<Model>((m, e) => reduce(m, ev(e) as never), from);
  const atRest = () => run([{ type: "auth.status", method: "api_key", source: "keychain" }, { type: "ui.folderShown", project: PROJECT }]);
  test("the share used, said in words, beside Settings", async () => {
    app.reset();
    await renderPage(<IslandPanel m={run([near], atRest())} line="" shown />);
    const ring = screen.getByRole("img", { name: /The Claude limit is 91% used/ });
    expect(ring.getAttribute("data-level")).toBe("near");
    expect(ring.textContent).toBe(S.m89.runway.used(91));
  });
  test("nothing reported: no ring (switched off is in m89Off.test.tsx: the settings are read once per page)", async () => {
    app.reset();
    await renderPage(<IslandPanel m={atRest()} line="" shown />);
    expect(screen.queryByRole("img", { name: /Claude limit/ })).toBeNull();
  });
});
