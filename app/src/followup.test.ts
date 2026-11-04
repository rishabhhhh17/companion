// "Fixes it with you" on the card: the follow up box under the receipt, Try again after a task that was not done, and the
// loop card for a single task.
import { describe, expect, test } from "bun:test";
import { parseCommand, serialize } from "../../protocol/index.ts";
import { AGENT, followUp, retryTask } from "./commands.ts";
import { canFollowUp, canRetry, initial, reduce, stuckWords, type Model } from "./model.ts";
import { S } from "./strings.ts";

const P = "/Users/me/site";
const ev = (o: Record<string, unknown>) => ({ v: 1, id: "e", ...o });
const run = (events: Record<string, unknown>[], from: Model = initial()) => events.reduce<Model>((m, e) => reduce(m, e as never), from);
const begin = (project = P, checkpoint = "cp_0001") => [ev({ type: "checkpoint.created", project, agent: AGENT, checkpoint, label: "Before: add a signup button", files: 3, skipped: [] }), ev({ type: "agent.state", agent: AGENT, state: "thinking" })];
const receipt = (proof: string, checkpoint = "cp_0001") => ev({ type: "receipt", agent: AGENT, checkpoint, changed: [{ file: "a.txt", kind: "modified" }], commands: 0, notUndoable: [], proof, usdEstimate: 0.02 });
const state = (s: string) => ev({ type: "agent.state", agent: AGENT, state: s });
const done = [...begin(), state("working"), receipt("passed"), state("done")];
const notDone = [...begin(), state("working"), receipt("failed"), state("error")];

describe("the follow up command", () => {
  test("is valid protocol, names the project and says what is still wrong", () => {
    const c = followUp(P, "  the button   is still grey ")!;
    expect(parseCommand(serialize(c)).ok).toBe(true);
    expect(c).toMatchObject({ type: "agent.send", agent: AGENT, project: P, text: "the button is still grey" });
  });
  test("empty words send nothing", () => expect(followUp(P, "   ")).toBeNull());
  test("a very long follow up is cut", () => expect((followUp(P, "a".repeat(9000)) as any).text.length).toBeLessThanOrEqual(2000));
  test("Try again is valid protocol and names the project", () => {
    const c = retryTask(P);
    expect(parseCommand(serialize(c)).ok).toBe(true);
    expect(c).toMatchObject({ type: "agent.send", agent: AGENT, project: P, retry: true });
  });
});

describe("the follow up box", () => {
  test("appears once a task has finished, for the same project", () => {
    expect(canFollowUp(run(done), P)).toBe(true);
    expect(canFollowUp(run(notDone), P)).toBe(true);
  });
  test("is not there before any task, or while it works", () => {
    expect(canFollowUp(initial(), P)).toBe(false);
    expect(canFollowUp(run([...begin(), state("working")]), P)).toBe(false);
    expect(canFollowUp(run([...begin(), state("checking")]), P)).toBe(false);
    expect(canFollowUp(run([...begin(), state("needsYou")]), P)).toBe(false);
  });
  test("is not there for a different project", () => {
    expect(canFollowUp(run(done), "/Users/me/other")).toBe(false);
    expect(canFollowUp(run(done), "")).toBe(false);
  });
  test("goes when the folder changes", () => {
    expect(canFollowUp(reduce(run(done), { type: "ui.projectChanged", project: P } as never), P)).toBe(false);
  });
  test("waits after sending, and comes back if the engine refuses it", () => {
    const sent = reduce(run(done), { type: "ui.followUpSent" } as never);
    expect(canFollowUp(sent, P)).toBe(false);
    expect(canFollowUp(reduce(sent, ev({ type: "protocol.error", reason: "That agent is already working. Wait for it to finish, or press Stop." }) as never), P)).toBe(true);
  });
  test("the follow up's own task replaces the old receipt, and its own receipt brings the box back", () => {
    const sent = reduce(run(done), { type: "ui.followUpSent" } as never);
    const working = run([...begin(P, "cp_0002"), state("working")], sent);
    expect(working.receipt).toBeNull();
    expect(canFollowUp(working, P)).toBe(false);
    expect(canFollowUp(run([receipt("passed", "cp_0002"), state("done")], working), P)).toBe(true);
  });
  test("is not offered in the middle of a plan, only once it has ended", () => {
    const step = run([...done, ev({ type: "drive.step", agent: AGENT, index: 1, total: 3, title: "One", status: "done" })]);
    expect(canFollowUp(step, P)).toBe(false);
    expect(canFollowUp(run([ev({ type: "drive.done", agent: AGENT, status: "done", completed: 3, total: 3, usdEstimate: 0.1 })], step), P)).toBe(true);
  });
  test("goes once Which task broke it has undone a task in this project", () => {
    const answer = ev({ type: "bisect.result", project: P, agent: AGENT, outcome: "found", runs: 3, maxRuns: 6, task: { label: "x", at: "t", checkpoint: "cp_0001" }, undo: "safe" });
    const asked = run([...done, { type: "ui.bisectAsked" }, answer, { type: "ui.bisectUndoAsked" }, { type: "ui.bisectUndoSent" }]);
    expect(canFollowUp(run([ev({ type: "bisect.undone", project: P, checkpoint: "cp_0001", ok: false, reverted: [], reason: "Nothing was changed." })], asked), P)).toBe(true);
    const undone = run([ev({ type: "bisect.undone", project: P, checkpoint: "cp_0001", ok: true, reverted: ["a.txt"], safety: "cp_0009" })], asked);
    expect(canFollowUp(undone, P)).toBe(false);
    expect(canFollowUp(reduce(undone, { type: "ui.bisectClosed" } as never), P)).toBe(false);
  });
  test("is not offered while undo is asked or after it", () => {
    expect(canFollowUp(reduce(run(done), { type: "ui.undoAsked", checkpoint: "cp_0001" } as never), P)).toBe(false);
  });
  // The conversation would no longer match the files, so the box stays hidden once the work is undone, whatever closes the
  // undo note afterwards.
  const undone = [...done, { type: "ui.undoAsked", checkpoint: "cp_0001" }, { type: "ui.undoSent" }, ev({ type: "checkpoint.restored", project: P, checkpoint: "cp_0001", safety: "cp_0002", recovered: [], largeLeftAlone: [], leftAlone: [] })];
  test("stays hidden after Undo, when the undo note is closed", () => {
    expect(canFollowUp(run([...undone, { type: "ui.undoClosed" }]), P)).toBe(false);
    expect(canRetry(run([...notDone, ...undone.slice(done.length), { type: "ui.undoClosed" }]), P)).toBe(false);
  });
  test("stays hidden after Undo then Stop everything", () => {
    expect(canFollowUp(run([...undone, { type: "app.stop_everything" }]), P)).toBe(false);
  });
  test("an older undo point restored from the timeline hides it too", () => {
    expect(canFollowUp(run([...done, ev({ type: "checkpoint.restored", project: P, checkpoint: "cp_0000", safety: "cp_0002", recovered: [], largeLeftAlone: [], leftAlone: [] })]), P)).toBe(false);
  });
  test("an undo in another project does not hide it", () => {
    expect(canFollowUp(run([...done, ev({ type: "checkpoint.restored", project: "/Users/me/other", checkpoint: "cp_0009", safety: "cp_0010", recovered: [], largeLeftAlone: [], leftAlone: [] })]), P)).toBe(true);
  });
  test("a new task after Undo brings it back once that task has finished", () => {
    expect(canFollowUp(run([...undone, { type: "ui.undoClosed" }, ...begin(P, "cp_0003"), receipt("passed", "cp_0003"), state("done")]), P)).toBe(true);
  });
  test("is not offered while a loop card waits for an answer", () => {
    expect(canFollowUp(run([...done, ev({ type: "loop.stuck", agent: AGENT, index: 0, title: "x", failure: { label: "a", detail: "b" }, options: [] })]), P)).toBe(false);
  });
  test("Stop everything brings a waiting box back", () => {
    const sent = reduce(run(done), { type: "ui.followUpSent" } as never);
    expect(reduce(sent, { type: "app.stop_everything" } as never).followUp).toBe("idle");
  });
});

describe("Try again", () => {
  test("is offered after a task that was not done", () => expect(canRetry(run(notDone), P)).toBe(true));
  test("is offered when the check failed, whatever the character shows now", () => expect(canRetry(run([...begin(), receipt("failed"), state("idle")]), P)).toBe(true));
  test("is not offered after a task that passed, or one that was stopped", () => {
    expect(canRetry(run(done), P)).toBe(false);
    expect(canRetry(run([...begin(), receipt("skipped"), state("idle")]), P)).toBe(false);
  });
  test("is not offered while work runs, or for another project", () => {
    expect(canRetry(run([...notDone, state("working")]), P)).toBe(false);
    expect(canRetry(run(notDone), "/Users/me/other")).toBe(false);
  });
});

describe("the loop card", () => {
  const stuck = (index: number, title: string) => ev({ type: "loop.stuck", agent: AGENT, index, title, failure: { label: "Running the tests", detail: "1 failed" }, options: [{ id: "different", label: "Try a different approach" }, { id: "stop", label: "Stop here" }] });
  test("for a single task it names the task, with no step number", () => {
    expect(stuckWords(run([stuck(0, "Fix the signup page")]))).toBe("Fix the signup page");
  });
  test("for a plan it names the step", () => {
    expect(stuckWords(run([stuck(2, "Add a form")]))).toBe(`${S.stepOf} 2: Add a form`);
  });
  test("the task's receipt clears it (Stop answered it)", () => {
    expect(run([...begin(), stuck(0, "Fix the signup page"), receipt("failed")]).stuck).toBeNull();
  });
});

// HeyClicky v1.0.53 parity: to follow up on a finished task, point at its result in Home and hold the talk keys. The words
// go into that task's follow up box (askbox.ts heardGoesTo), only with Follow up by pointing on (talk.followUpByPointing,
// off unless turned on), and are never sent by themselves unless Send spoken words automatically is on.
describe("following up by voice", () => {
  const card = require("node:fs").readFileSync(new URL("./card.tsx", import.meta.url), "utf8") as string;
  const heard = card.slice(card.indexOf('ev.stage === "heard"'), card.indexOf('dispatch({ type: "ui.voiceClosed" })', card.indexOf('ev.stage === "heard"')));
  test("the follow up box's words are kept by the card, so spoken words can be put there", () => {
    expect(card).toMatch(/function FollowUpBox\(\{[^}]*\btext\b[^}]*\bsetText\b/);
    expect(card).not.toMatch(/function FollowUpBox[\s\S]{0,200}useState\(""\)/);
    expect(card).toContain("text={followText}");
  });
  test("Esc empties a box with words in it and keeps Home open; an empty box lets Esc close Home as before", () => {
    const box = card.slice(card.indexOf("function FollowUpBox("), card.indexOf("function ExplainBox("));
    expect(box).toMatch(/e\.key === "Escape" && !composing\(e\) && text\) \{ e\.preventDefault\(\); e\.stopPropagation\(\); setText\(""\); \}/);
  });
  test("Stop everything ends the Show me key's question, so words heard after it are never a question about the screen", () => {
    expect(card).toContain('const offStop = listen("runner-event", (e) => { if ((e.payload as { type?: string } | null)?.type === "app.stop_everything") setAskMode("task"); });');
  });
  test("the words go where heardGoesTo says, from what was true as the keys went down", () => {
    expect(heard).toContain('heardGoesTo({ showme: askModeRef.current === "showme", atKeysDown: keysDown.current, followUpShownNow: followShown.current })');
    // Taken when listening begins (the one line that follows for a microphone that is away keeps it), cleared when the
    // hold ends any other way, and used once.
    expect(card).toContain('if (ev.type === "app.voice" && ev.stage === "listening" && !ev.micMissing) keysDown.current = { followUpShown: followShown.current, overReceipt: overReceipt.current, byPointing: setting("talk.followUpByPointing") === true, homeShown: homeShown.current };');
    expect(card).toContain('else if (ev.type === "app.voice" && ev.stage !== "listening" && ev.stage !== "transcribing" && ev.stage !== "heard") keysDown.current = null;');
    expect(heard).toContain("keysDown.current = null;");
    const into = heard.slice(heard.indexOf('if (to === "followUp")'), heard.indexOf("} else {", heard.indexOf('if (to === "followUp")')));
    expect(into).toContain("setFollowText(ev.text)");
    // Sent by itself only with auto send on, and then only a clear request for work.
    expect(into).toContain("if (autoSend && sendsItself(ev.text, lang)) setTimeout(() => sendFollowNow.current(), 0);");
    expect(into).not.toContain("setBox(");
  });
  test("the pointer is noticed only on the receipt, inside Home's own window, and forgotten when Home opens or closes", () => {
    expect(card).toContain('<section className="panel receipt" data-landed={landed ? "" : undefined} onPointerEnter={() => { overReceipt.current = true; }} onPointerLeave={() => { overReceipt.current = false; }}>');
    const opened = card.slice(card.indexOf('listen("opened"'), card.indexOf("warmSoon();", card.indexOf('listen("opened"')));
    expect(opened).toContain("overReceipt.current = false;");
    expect(opened).toContain("homeShown.current = true;");
    // Every way Home goes away (Esc, Close, a click elsewhere, the island or the character, a full screen app, Hide) goes
    // through the shell's home_closed, which tells the page: no pointerleave fires for a window that was just hidden.
    expect(card).toContain('listen("closed", () => { overReceipt.current = false; homeShown.current = false; setHomeOpen(false); keysDown.current = null; })');
    const main = require("node:fs").readFileSync(new URL("../src-tauri/src/main.rs", import.meta.url), "utf8") as string;
    const closed = main.slice(main.indexOf("fn home_closed()"), main.indexOf("\n}\n", main.indexOf("fn home_closed()")));
    expect(closed).toContain('if let Some(a) = APP.get() {');
    expect(closed).toContain('let _ = a.emit_to("card", "closed", json!({}));');
    expect(card).toContain('followShown.current = show("receipt") && !!m.receipt && canFollowUp(m, project) && groups.on("followUp");');
  });
  test("a follow up sent by itself goes through the same checks as the Send button", () => {
    const now = card.slice(card.indexOf("sendFollowNow.current = () => {"), card.indexOf("};", card.indexOf("sendFollowNow.current = () => {")));
    expect(now).toContain("followUp(project, followText)");
    expect(now).toContain('m.followUp === "sending" || !followShown.current');
    expect(now).toContain("followSent(true); void sendQuiet(c).catch(followRefused);");
  });
});
