// M80: the Settings rows and the card before the yes for the other tools' done signal and saved copy. Pure, no engine.
import { describe, expect, test } from "bun:test";
import { doneAsk, doneStateFrom, hookLabel } from "./doneSignal.ts";
import { S } from "./strings.ts";

const row = (tool: string, hook: string, file: string) => ({ tool, hook, on: false, file, adds: "{}", creates: true });
describe("the other tools' rows", () => {
  const st = doneStateFrom({ type: "donesignal.state", project: "/p", tools: [row("cursor", "guard", ".cursor/hooks.json"), row("copilot", "done", ".github/hooks/companion.json"), row("antigravity", "guard", ".agents/hooks.json"), row("windsurf", "done", "x")] }, "/p")!;
  test("every known tool is read, and an unknown one is dropped", () => {
    expect(st.tools.map((t) => t.tool)).toEqual(["cursor", "copilot", "antigravity"]);
  });
  test("another tool's guard row and card name that tool, never Claude", () => {
    const l = hookLabel(st.tools[0]!);
    expect(l.label).toBe("Save a copy before Cursor runs a destructive command");
    expect(l.line).toContain("Cursor decided");
    const w = doneAsk(st.tools[2]!);
    expect(w.title).toBe("Add the saved copy signal for Antigravity?");
    expect(w.notes.join(" ")).not.toContain("Claude");
    expect(w.notes).toContain(S.doneSignal.askTool.antigravity);
  });
  test("the VS Code row says the Claude extension uses the Claude Code rows", () => {
    const w = doneAsk(st.tools[1]!);
    expect(w.title).toBe("Add a done signal for VS Code (Copilot)?");
    expect(w.notes).toContain(S.doneSignal.askTool.copilot);
    expect(S.doneSignal.askTool.copilot).toContain("Claude extension");
  });
  test("plain words: no em dashes", () => {
    const all = [S.doneSignal.title, S.doneSignal.line, ...Object.values(S.doneSignal.askTool), S.doneSignal.guardOther.line("Cursor"), S.doneSignal.guardOther.askWhat("Cursor")];
    for (const t of all) expect(t).not.toContain("—");
  });
});
