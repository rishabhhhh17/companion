// M121 (docs/milestones/M121-notch-overhaul.md): the notch's attention block names the work. Tests first.
import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { initial, type Model } from "./model.ts";
import { S } from "./strings.ts";
import { attentionBlock, attentionPress, attentionPressLine } from "./notchFeed.ts";
import { attentionSummary, type AgentSession } from "../../runner/src/attention.ts";

describe("M121 the notch's attention block", () => {
  const s = (id: string, state: AgentSession["state"], summary: string, updatedAt: number): AgentSession => ({
    id,
    tool: "claude",
    repo: `repo-${id}`,
    state,
    summary,
    updatedAt,
  });

  test("names the work the top session that needs the person is doing", () => {
    const sessions: AgentSession[] = [
      s("idle", "idle", "Idle", 100),
      s("work", "working", "Working on checkout", 200),
      s("issues", "finished_with_issues", "Two changes to review", 150),
      s("blocked", "blocked", "Blocked on a decision", 120),
      s("approve", "needs_approval", "Approve the deploy", 110),
    ];
    const b = attentionBlock(sessions);
    expect(b).not.toBeNull();
    // The 24 Nov review: the engine gives counts; the words are strings.ts's.
    expect(b?.headline).toBe(S.m119.headline(attentionSummary(sessions).attentionCount, attentionSummary(sessions).workingCount));
    expect(b?.headline).toBe("3 agents need you");
    expect(b?.top?.id).toBe("approve");
    expect(b?.what).toBe("Approve the deploy");
  });

  test("names the work for a blocked session, so the notch can say what it is stuck on", () => {
    const b = attentionBlock([s("fix", "blocked", "Fix the failing check", 10)]);
    expect(b?.headline).toBe("1 agent needs you");
    expect(b?.what).toBe("Fix the failing check");
  });

  test("is null when all agents are quiet", () => {
    expect(attentionBlock([s("a", "working", "Working", 10), s("b", "idle", "Idle", 5)])).toBeNull();
  });

  // M121 slice 2: press flow — the row's press goes where it should (Home for news or an ask)
  test("attentionPress returns the project of the top session when there is work waiting", () => {
    const sessions: AgentSession[] = [
      s("approve", "needs_approval", "Approve the deploy", 110),
      s("blocked", "blocked", "Blocked on a decision", 120),
    ];
    const press = attentionPress(sessions);
    expect(press).not.toBeNull();
    expect(press).toEqual({ project: "repo-approve", action: "home" });
  });

  test("attentionPress returns null when all agents are quiet", () => {
    const sessions: AgentSession[] = [s("a", "working", "Working", 10), s("b", "idle", "Idle", 5)];
    const press = attentionPress(sessions);
    expect(press).toBeNull();
  });

  // The press line: what the notch says when there's something to open (Home) — null because it goes to Home
  test("attentionPressLine returns null (the press opens Home, no short line in the notch)", () => {
    const sessions: AgentSession[] = [s("approve", "needs_approval", "Approve the deploy", 110)];
    const line = attentionPressLine(sessions);
    expect(line).toBeNull();
  });

  // M121 slice 3: customization — the greet, hint, pill and action words come from the person's choices.
  test("the default greet keeps the typed name's hello", async () => {
    const { hoverGreeting } = await import("./notchMinimal.ts");
    expect(hoverGreeting("Rishabh")).toBe("hey rishabh");
    expect(hoverGreeting(undefined, "hey sam")).toBe("hey sam");
  });

  test("a chosen greet replaces the typed name's hello", async () => {
    const { hoverGreeting } = await import("./notchMinimal.ts");
    expect(hoverGreeting("Rishabh", "good morning")).toBe("good morning");
    expect(hoverGreeting(undefined, "")).toBe("hey there");
  });

  // The 24 Nov review: a chosen hint never hides the moment's own line; it only takes the place of the key line.
  test("a chosen hint replaces only the key line, never the moment's own line", async () => {
    const { hoverHint } = await import("./notchMinimal.ts");
    expect(hoverHint({ words: "hey there", news: false }, "2 changes to look at", "Press ⌃⌥⌘F when stuck", "All quiet here")).toBe("2 changes to look at");
    expect(hoverHint({ words: "hey there", news: false }, null, "Press ⌃⌥⌘F when stuck", "All quiet here")).toBe("All quiet here");
    expect(hoverHint({ words: "hey there", news: false }, "2 changes to look at", "Press ⌃⌥⌘F when stuck")).toBe("2 changes to look at");
    expect(hoverHint({ words: "hey there", news: false }, null, "")).toBe("");
  });

  // The 24 Nov review: a chosen pill relabels only the idle Check my project; Stop, Answer, See why, Review and the rest
  // keep their own words, so the moment is never hidden behind the person's label.
  test("a chosen pill relabels only the idle check action", async () => {
    const { hoverAction, hoverPill } = await import("./notchMinimal.ts");
    const { S } = await import("./strings.ts");
    const P = "/Users/me/shop";
    const m = (o: Partial<Model> = {}): Model => ({ ...initial(), runnerUp: true, connected: "api_key", folder: P, ...o });
    const NOW = Date.now();
    const idle = hoverAction(m(), NOW, { layout: "quick" }, { label: "Look over it" });
    expect(idle.id).toBe("check");
    expect(idle.label).toBe("Look over it");
    expect(hoverPill(idle, m(), "Look over it").words).toBe("Look over it");
    const approval = { id: "a1", agent: "claude", title: "Add a test", risk: "low", checkpoint: "", expiresAt: new Date(NOW + 60000).toISOString(), action: "add_test" } as Model["approvals"][number];
    const keep: [Model, Parameters<typeof hoverAction>[2], string][] = [
      [m(), { layout: "job" }, "stop"],
      [m({ runnerUp: false }), { layout: "quick" }, "seeWhy"],
      [m({ approvals: [approval] }), { layout: "quick" }, "answer"],
      [m({ connected: "none" }), { layout: "quick" }, "home"],
      [m(), { layout: "quick", buttons: false }, "home"],
    ];
    for (const [x, o, id] of keep) {
      const a = hoverAction(x, NOW, o, { label: "Look over it" });
      expect(a.id).toBe(id as never);
      expect(a.label).toBe(S.m96.act[a.id]);
      expect(hoverPill(a, x, "Look over it").words).not.toBe("Look over it");
    }
  });
  // The 24 Nov review: the button says Open in Home, so it opens Home (main.rs island_go), never another app.
  test("the attention block's Open in Home opens Home, with an existing class and no new look", () => {
    const src = readFileSync(new URL("./notchFeed.tsx", import.meta.url), "utf8");
    const at = src.indexOf("S.m121.openAttention");
    const btn = src.slice(src.lastIndexOf("<button", at), src.indexOf("</button>", at));
    expect(btn).toContain('invoke("island_go")');
    expect(btn).not.toContain("jumpTo");
    expect(btn).not.toContain("send_command");
    expect(btn).toContain('className="lf-go"');
  });
});
