// Must fix 13 (review of 4 Nov): Go live, Roll back and Undo failed silently when the shell refused to pass the command on
// (the engine restarting, its queue full, a group switched off). A refused send now says so in one plain line, and the card
// that was waiting for the engine's answer is put back (bar rule 11: no silent failures).
import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { refusedEvent, refusedLine } from "./sendRefused.ts";
import { initial, reduce, type Model } from "./model.ts";
import { offLine } from "./groups.ts";
import { PRODUCT, S } from "./strings.ts";

const card = readFileSync(new URL("./card.tsx", import.meta.url), "utf8");
const P = "/Users/me/site";
const run = (events: Record<string, unknown>[], from: Model = { ...initial(), folder: P }) => events.reduce<Model>((m, e) => reduce(m, e as never), from);

describe("a refused send is said in plain words", () => {
  test("the shell's own plain lines are kept; anything else is one plain line", () => {
    expect(refusedLine(new Error(`${PRODUCT} is not ready yet. Try again in a moment.`))).toBe(`${PRODUCT} is not ready yet. Try again in a moment.`);
    expect(refusedLine(`${PRODUCT} is busy and did not answer. Try again in a moment.`)).toBe(`${PRODUCT} is busy and did not answer. Try again in a moment.`);
    expect(refusedLine(offLine())).toBe(offLine());
    expect(refusedLine("the command ship.live is not allowed from a page")).toBe(S.sendRefused);
    expect(refusedLine(undefined)).toBe(S.sendRefused);
    expect(S.sendRefused).toMatch(/^That did not reach .+\. Try again in a moment\.$/);
  });
  test("it reaches the model as the engine's own refusal of that command would", () => {
    expect(refusedEvent("x", { type: "ship.live", agent: "a" })).toEqual({ type: "protocol.error", reason: S.sendRefused, failed: "ship.live", agent: "a" });
    expect(refusedEvent("x", null)).toEqual({ type: "protocol.error", reason: S.sendRefused });
  });
  test("Go live and Roll back that were refused leave a line on Home", () => {
    const m = run([refusedEvent("x", { type: "ship.live" })]);
    expect(m.error).toBe(S.sendRefused);
  });
  test("an Undo that was refused stops waiting and says why", () => {
    const m = run([{ type: "ui.undoAsked", checkpoint: "cp_1" }, { type: "ui.undoSent" }, refusedEvent(`${PRODUCT} is not ready yet. Try again in a moment.`, { type: "checkpoint.restore" })]);
    expect(m.undo?.stage).toBe("failed");
    expect(m.undo?.note).toBe(`${PRODUCT} is not ready yet. Try again in a moment.`);
  });
  test("send says a refusal by default; the page's own background asks and handled presses are quiet", () => {
    expect(card).toContain("const sendQuiet = (cmd: unknown) => invoke(\"send_command\", { cmd });");
    expect(card).toMatch(/const send = \(cmd: unknown\) => \{ const p = sendQuiet\(cmd\); p\.catch\(\(e\) => refused\?\.\(refusedEvent\(e, cmd\)\)\); return p; \};/);
    // The card registers where a refusal goes.
    expect(card).toContain("refused = (ev) => dispatch(ev);");
    // Background asks never put a line on Home.
    for (const quiet of ["sendQuiet(listTasks(project))", "sendQuiet(warmEngine())", "sendQuiet(checkBrowser())", "sendQuiet(inspectProject(project))", "sendQuiet(metricsNote(name))"]) expect(card, quiet).toContain(quiet);
    // Go live, Roll back and Undo use the default.
    expect(card).toContain("void send(shipLive(project, f.previewUrl!))");
    expect(card).toContain("void send(shipRollback(project))");
    expect(card).toContain("void send(undo(project, m.undo!.checkpoint))");
    // A press with its own handling says every refusal, not only a switched off group.
    expect(card).toContain("const explainRefusal = (e: unknown) => dispatch({ type: \"app.notice\", message: refusedLine(e) });");
  });
});
