// M108 (docs/milestones/M108-house-rules-other-tools.md): the start block's rows and yes cards for Codex, Gemini CLI and
// Antigravity. Pure: each names its tool, shows exactly the lines it adds, says when the tool is handed the notes (Codex also
// after it sums up a long conversation), never claims the rules are kept, and Remove says so in that tool's name.
import { describe, expect, test } from "bun:test";
import { S } from "./strings.ts";
import { doneAsk, doneStateFrom, hookLabel, removedLine } from "./doneSignal.ts";
import { CONNECT_HOOKS } from "./aiTools.ts";
import { readFileSync } from "node:fs";
import { START_SETTINGS, startFrom, startSeen } from "./memoryStart.ts";
import { placeOf } from "./settingsPages.ts";

const P = "/Users/aleksandra/Projects/northwind-industries-holdings-customer-portal";
const ADDS = '{\n  "hooks": {\n    "SessionStart": [ { "matcher": "startup|clear|compact" } ]\n  }\n}';
const row = (tool: string, on = false) => doneStateFrom({ type: "donesignal.state", project: P, tools: [{ tool, hook: "start", on, file: tool === "codex" ? ".codex/hooks.json" : tool === "gemini" ? ".gemini/settings.json" : tool === "antigravity" ? ".agents/hooks.json" : ".claude/settings.local.json", adds: ADDS, creates: true }] }, P)!.tools[0]!;

describe("the start block's row and card in the other tools", () => {
  test("each row is named for its tool and says when the notes are handed over", () => {
    expect(hookLabel(row("codex"))).toEqual({ label: S.m108.rowTitle("Codex"), line: S.m108.rowLine("Codex", true) });
    expect(hookLabel(row("gemini")).label).toBe("Give Gemini CLI my notes as each session starts");
    expect(hookLabel(row("antigravity")).label).toBe("Give Antigravity my notes as each session starts");
    expect(hookLabel(row("codex")).line).toContain("after it sums up a long conversation");
    expect(hookLabel(row("gemini")).line).not.toContain("sums up");
    // break-ui: "a Antigravity session" read wrong; every tool name now reads right in the line.
    expect(hookLabel(row("antigravity")).line).toStartWith("When Antigravity starts a session here, it is handed");
    // Claude Code keeps its own words.
    expect(hookLabel(row("claude"))).toEqual({ label: S.doneSignal.hookTitle.start, line: S.doneSignal.hookLine.start });
  });
  test("the yes card names the tool, shows exactly the lines it adds and the tool's own trust note", () => {
    const c = doneAsk(row("codex"));
    expect(c.title).toBe("Give Codex your notes at the start?");
    expect(c.what).toBe(ADDS);
    expect(c.where).toBe(S.doneSignal.askWhere(".codex/hooks.json", true));
    expect(c.notes).toEqual([S.m108.askWhat("Codex", true), S.doneSignal.askGit, S.doneSignal.askCodex, S.m108.checking("Codex")]);
    expect(doneAsk(row("gemini")).notes).toContain(S.doneSignal.askTool.gemini);
    expect(doneAsk(row("antigravity")).notes).toContain(S.doneSignal.askTool.antigravity);
    expect(doneAsk(row("claude")).title).toBe(S.doneSignal.askTitleFor.start);
  });
  test("the words never claim the rules are kept, never say Claude Code for another tool, and use no em dash", () => {
    for (const t of ["codex", "gemini", "antigravity"]) {
      const c = doneAsk(row(t)), l = hookLabel(row(t));
      const all = [c.title, ...c.notes, l.label, l.line ?? "", removedLine(row(t))].join(" ");
      expect(all).not.toMatch(/keeps to them|follows? (your|the) rules|always/i);
      expect(all).not.toContain("Claude Code");
      expect(all).not.toContain("—");
      expect(all).toContain(S.doneSignal.tool[t as "codex"]);
    }
  });
  test("Remove says it in the tool's name; the start block stays out of Connect", () => {
    expect(removedLine(row("gemini", true))).toBe("Removed. Gemini CLI is no longer handed your notes here.");
    expect(removedLine(row("claude", true))).toBe(S.doneSignal.removedOther);
    for (const t of ["claude", "codex", "gemini", "antigravity"] as const) expect(CONNECT_HOOKS[t]).not.toContain("start");
  });
});

// M108 review: the Memory page shows exactly what each tool set up is handed, one view per different text, named for the
// tools that are handed it; the shared fixture (m108e1) has Claude Code's view and Gemini CLI's longer one.
const fixture = (id: string) => JSON.parse(readFileSync(new URL("../../protocol/fixtures/events.jsonl", import.meta.url), "utf8").split("\n").find((l) => l.includes(`"id":"${id}"`))!);
describe("the Memory page shows what each tool is handed", () => {
  test("one view per tool set up, each exactly its text, named for it", () => {
    const st = startFrom(fixture("m108e1").start)!;
    expect(st.forms).toEqual(fixture("m108e1").start.forms);
    const seen = startSeen(st);
    expect(seen).toEqual([
      { label: "Show it exactly as Claude Code sees it", text: st.forms![0]!.text },
      { label: "Show it exactly as Gemini CLI sees it", text: st.forms![1]!.text },
    ]);
    expect(seen[1]!.text).toContain("payments go through Stripe");
  });
  test("tools handed the same text share one view; a tool handed nothing has none", () => {
    const t = "Notes\n- one\n";
    const st = startFrom({ hook: true, text: t, lines: [], forms: [{ tool: "claude", text: t }, { tool: "codex", text: t }, { tool: "antigravity", text: t }, { tool: "gemini", text: "" }] })!;
    expect(startSeen(st)).toEqual([{ label: "Show it exactly as Claude Code, Codex and Antigravity see it", text: t }]);
  });
  test("an older engine, or nothing set up yet: the one view of the block as it would be", () => {
    const st = startFrom(fixture("m78e1").start)!;
    expect(st.forms).toEqual([]);
    expect(startSeen(st)).toEqual([{ label: S.m78.startAsSeen, text: st.text }]);
    expect(startSeen(startFrom({ hook: false, text: "", lines: [] }))).toEqual([]);
    expect(startSeen(null)).toEqual([]);
    // A form of a tool the page does not know is dropped, never shown with a made up name.
    expect(startFrom({ hook: true, text: "", lines: [], forms: [{ tool: "nobody", text: "x" }, { tool: "gemini", text: 3 }] })!.forms).toEqual([]);
  });
  test("the cards' words match: the page shows what each tool is handed, so they say so plainly", () => {
    expect(S.m108.askWhat("Gemini CLI", false)).toContain("the lines the Memory page shows");
    expect(S.m108.checking("Gemini CLI")).toContain("The Memory page shows exactly what Gemini CLI is handed");
  });
});

// M108 review: the four start rows have their own small group on Fixing, and Set up in Settings goes there.
describe("your notes at the start have their own place", () => {
  test("Set up in Settings opens the start group, on Fixing, right after Start reviews sooner", () => {
    expect(placeOf(START_SETTINGS.hook)).toMatchObject({ page: "fixing", group: "fixing.start", more: false });
    expect(S.setGroupTitles["fixing.start"]).toBe("Your notes at the start");
    expect(placeOf("startNotes")).toMatchObject({ group: "fixing.start" });
  });
});
