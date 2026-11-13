// M85: the pages' side of asking before live systems, HeyClicky's three choices on Squibby's own cards, the asks in History
// and the receipt's two new flags. Pure, no engine.
import { describe, expect, test } from "bun:test";
import { approvalChoices, alwaysFile } from "./approvals.ts";
import * as approvals from "./approvals.ts";
import { islandLine, SAVED_LINE_MS } from "./home.ts";
import { todayLine } from "./notchPeek.ts";
import { readFileSync } from "node:fs";
import { answerApproval } from "./commands.ts";
import { doneAsk, doneStateFrom } from "./doneSignal.ts";
import { resultHero } from "./homeRest.ts";
import { initial, reduce } from "./model.ts";
import { askedRowLook, askedRowsOf, commandParts, flagsOf } from "./safetyNet.ts";
import { S } from "./strings.ts";

const LINE = "allow reading /Users/demo/notes/plan.md";

describe("the three choices", () => {
  // M85 review: the page no longer reads or sends the house rules list for Always allow (the engine adds the one line to the
  // file as it is on disk), so the choice no longer depends on the page knowing the list. Expectation changed on purpose.
  test("Always allow only where the engine offered its line, never for a live command", () => {
    expect(approvalChoices({ always: LINE })).toEqual({ once: true, always: true, notNow: true });
    expect(approvalChoices({}).always).toBe(false);
    expect(approvalChoices({ always: LINE, live: true }).always).toBe(false);
    expect(approvalChoices({ always: "never edit x" }).always).toBe(false);
  });
  test("M85 review: the page never builds or sends a house rules list for Always allow; the engine says whether it saved", () => {
    expect((approvals as Record<string, unknown>).withAlwaysRule).toBeUndefined();
    const card = readFileSync(new URL("./card.tsx", import.meta.url), "utf8");
    expect(card).not.toContain('changeSetting("rules.house"');
    const asked = reduce(initial(), { v: 1, id: "e", type: "approval.request", approval: "ap_1", agent: "builder-1", checkpoint: "cp_1", toolUseId: "t", risk: "outside_project", title: "x", expiresAt: "2026-11-14T10:00:00Z", always: LINE } as never);
    expect(reduce(asked, { v: 1, id: "e", type: "approval.resolved", approval: "ap_1", agent: "builder-1", outcome: "allowed", always: "saved" } as never).notice).toBe(S.approval.alwaysSaved);
    expect(reduce(asked, { v: 1, id: "e", type: "approval.resolved", approval: "ap_1", agent: "builder-1", outcome: "allowed", always: "notSaved" } as never).notice).toBe(S.approval.alwaysFailed);
    expect(reduce(asked, { v: 1, id: "e", type: "approval.resolved", approval: "ap_1", agent: "builder-1", outcome: "allowed" } as never).notice).toBeNull();
  });
  test("M85 review: the card says openly which file Always allow would always allow", () => {
    expect(alwaysFile(LINE)).toEqual({ name: "plan.md", folder: "/Users/demo/notes" });
    expect(alwaysFile("never edit x")).toBeNull();
    expect(S.approval.alwaysWhat("plan.md", "/Users/demo/notes")).toBe("Always allow reading plan.md (in /Users/demo/notes)");
    const card = readFileSync(new URL("./card.tsx", import.meta.url), "utf8");
    expect(card).toContain("S.approval.alwaysWhat(");
  });
  test("the answer: project only with a yes; a no is always once", () => {
    expect(answerApproval("ap_1", true, "project")).toMatchObject({ type: "approval.resolve", decision: "allow", scope: "project" });
    expect(answerApproval("ap_1", false, "project")).toMatchObject({ decision: "deny", scope: "once" });
    expect(answerApproval("ap_1", true)).toMatchObject({ scope: "once" });
  });
  test("the words", () => {
    expect([S.approval.notNow, S.approval.once, S.approval.always]).toEqual(["Not now", "Allow once", "Always allow for this project"]);
  });
});

describe("the model", () => {
  const req = (extra: Record<string, unknown>) => ({ v: 1, id: "e", type: "approval.request", approval: "ap_1", agent: "builder-1", checkpoint: "cp_1", toolUseId: "t", risk: "outside_project", title: "x", expiresAt: "2026-11-14T10:00:00Z", ...extra });
  test("a card keeps the always line and the live mark; a live card never keeps always", () => {
    expect(reduce(initial(), req({ always: LINE }) as never).approvals[0]).toMatchObject({ always: LINE });
    const live = reduce(initial(), req({ always: LINE, live: true }) as never).approvals[0];
    expect(live.live).toBe(true);
    expect(live.always).toBeUndefined();
  });
  // M85 review: the notice names the command, only for the open project, and goes by itself. Expectation changed on purpose.
  const asked = (project: string, command = "supabase db reset --linked") => ({ v: 1, id: "e", type: "guard.asked", project, command, reason: "r" }) as never;
  test("an ask in the person's own tool: a notice with the command, only for the open project", () => {
    const here = { ...initial(), folder: "/p" };
    const m = reduce(here, asked("/p"));
    expect(m.notice).toBe(S.guard.askedNotice("supabase db reset --linked"));
    expect(m.notice).toContain("supabase db reset --linked");
    expect(m.guardAsked).toMatchObject({ project: "/p", command: "supabase db reset --linked" });
    const other = reduce(here, asked("/elsewhere"));
    expect(other.notice).toBeNull();
    expect(reduce(initial(), asked("/p")).notice).toBeNull();
  });
  test("the ask's notice goes by itself, and only if it is still the one shown", () => {
    const m = reduce({ ...initial(), folder: "/p" }, asked("/p"));
    expect(reduce(m, { type: "ui.noticeExpired", notice: m.notice } as never).notice).toBeNull();
    const later = { ...m, notice: "Something else" };
    expect(reduce(later, { type: "ui.noticeExpired", notice: m.notice } as never).notice).toBe("Something else");
  });
  test("the notch says the ask for a few seconds, like a saved copy (any project)", () => {
    const m = reduce(initial(), asked("/elsewhere", "vercel --prod"));
    const at = m.guardAsked!.at;
    expect(islandLine(m, { now: at + 1000 })).toBe(S.guard.askedLine("vercel --prod"));
    expect(islandLine(m, { now: at + SAVED_LINE_MS + 1 })).not.toBe(S.guard.askedLine("vercel --prod"));
    // Something that needs the person in Squibby itself comes first.
    const withCard = reduce(m, { v: 1, id: "e", type: "approval.request", approval: "ap_1", agent: "builder-1", checkpoint: "cp_1", toolUseId: "t", risk: "irreversible", title: "Delete it", expiresAt: "2099-01-01T00:00:00Z" } as never);
    expect(islandLine(withCard, { now: at + 1000 })).not.toBe(S.guard.askedLine("vercel --prod"));
  });
  test("asks land in Now's timeline of today", () => {
    const now = Date.parse("2026-11-14T12:00:00Z");
    const m = reduce({ ...initial(), folder: "/p" }, { v: 1, id: "e", type: "tasks.list", project: "/p", tasks: [], asked: [{ id: 4, at: "2026-11-14T11:58:00Z", command: "supabase db reset --linked", reason: "r", by: "tool" }] } as never);
    const t = todayLine(m, now);
    expect(t).toHaveLength(1);
    expect(t[0]).toMatchObject({ kind: "asked", words: S.m84.line.asked("supabase db reset --linked") });
  });
  test("the receipt keeps its flags; anything else is dropped", () => {
    const m = reduce(initial(), { v: 1, id: "e", type: "receipt", agent: "builder-1", checkpoint: "cp_1", changed: [], commands: 0, notUndoable: [], proof: "passed", usdEstimate: 0, flags: [{ kind: "said_other", say: "It said one thing." }, { kind: "made_up", say: "x" }] } as never);
    expect(m.receipt?.flags).toEqual([{ kind: "said_other", say: "It said one thing." }]);
    expect(flagsOf("nope")).toEqual({});
  });
  test("History's asks come from tasks.list", () => {
    const m = reduce(initial(), { v: 1, id: "e", type: "tasks.list", project: "/p", tasks: [], asked: [{ id: 1, at: "2026-11-14T10:00:00Z", command: "vercel --prod", reason: "This puts a new version of your site live.", by: "tool" }] } as never);
    expect(m.askedRows).toHaveLength(1);
  });
});

describe("the asks in History", () => {
  test("rows that keep to the protocol, with secrets hidden again", () => {
    const rows = askedRowsOf([
      { id: 1, at: "2026-11-14T10:00:00Z", command: `curl -H "x: sk-ant-api03-${"A".repeat(30)}"`, reason: "r", by: "tool" },
      { id: 2, at: "nope", command: "x", reason: "r", by: "tool" },
      { id: 3, at: "2026-11-14T10:00:00Z", command: "x", reason: "r", by: "someone" },
    ]);
    expect(rows.map((r) => r.id)).toEqual([1]);
    expect(rows[0].command).not.toContain("A".repeat(30));
  });
  test("each row says who asked and what was answered, with the reason under it", () => {
    const base = { id: 1, at: "2026-11-14T10:00:00Z", command: "vercel --prod", reason: "This puts a new version of your site live." };
    // M85 review: the row also carries its lead and the command on their own, so History draws the command in code type.
    expect(askedRowLook({ ...base, by: "tool" })).toEqual({ title: "Asked first: vercel --prod", lead: "Asked first:", command: "vercel --prod", line: base.reason, mark: "Your AI tool asked you", tone: "blue" });
    expect(askedRowLook({ ...base, by: "squibby", answer: "always" }).mark).toBe("Always allowed here");
    expect(askedRowLook({ ...base, by: "squibby", answer: "no" }).tone).toBe("red");
  });
});

test("a guard row older than today's says so and offers Update", () => {
  const st = doneStateFrom({ type: "donesignal.state", project: "/p", tools: [{ tool: "claude", hook: "guard", on: true, file: ".claude/settings.local.json", adds: "{}", creates: false, stale: true }, { tool: "cursor", hook: "guard", on: false, file: ".cursor/hooks.json", adds: "{}", creates: true, stale: true }] }, "/p")!;
  expect(st.tools.map((t) => t.stale)).toEqual([true, undefined]);
  expect(S.doneSignal.update).toBe("Update");
});

test("M85 review: the Update card says it replaces the older line, and what the new one does", () => {
  const row = { tool: "claude", hook: "guard", on: true, file: ".claude/settings.local.json", adds: "{}", creates: false, stale: true } as never;
  const w = doneAsk(row);
  expect(w.title).toBe(S.doneSignal.updateTitle(".claude/settings.local.json"));
  expect(w.title).toBe("Update Squibby's line in .claude/settings.local.json?");
  expect(w.where).toBe(S.doneSignal.updateWhere(".claude/settings.local.json"));
  expect(w.notes[0]).toBe(S.doneSignal.updateAsks("Claude Code"));
  expect(w.yes).toBe("Update it");
  // A tool that cannot ask yet is told so, never promised an ask.
  expect(doneAsk({ tool: "codex", hook: "guard", on: true, file: ".codex/hooks.json", adds: "{}", creates: false, stale: true } as never).notes[0]).toBe(S.doneSignal.updateSame("Codex"));
  // Setting it up for the first time keeps the Add card's words.
  expect(doneAsk({ tool: "claude", hook: "guard", on: false, file: ".claude/settings.local.json", adds: "{}", creates: false } as never).title).toBe(S.doneSignal.askTitleFor.guard);
});

test("M85 review: a proven result with flags says check these first, and the flags come before Keep", () => {
  const plain = resultHero({ project: "/p/signup-page", label: "", kind: "proven", said: "" })!;
  expect(resultHero({ project: "/p/signup-page", label: "", kind: "proven", said: "", flagged: true })).toEqual({ ...plain, first: S.homeNow.butCheck(plain.first) });
  expect(S.homeNow.butCheck("signup-page works.")).toBe("signup-page works, but check these first.");
  expect(resultHero({ project: "/p/x", label: "", kind: "failed", said: "", flagged: true })!.first).not.toContain("check these");
  const card = readFileSync(new URL("./card.tsx", import.meta.url), "utf8");
  const flags = card.indexOf('className="panel amber receipt-flags"'), keep = card.indexOf('className="row result-actions receipt-top"');
  expect(flags).toBeGreaterThan(0);
  expect(flags).toBeLessThan(keep);
});

test("M85 review: History's command breaks only between words, so --linked stays whole; a very long word may still break", () => {
  expect(commandParts("supabase db reset --linked")).toEqual([{ text: "supabase", whole: true }, { text: "db", whole: true }, { text: "reset", whole: true }, { text: "--linked", whole: true }]);
  const long = `/${"a".repeat(60)}/notes.md`;
  expect(commandParts(`cat ${long}`)).toEqual([{ text: "cat", whole: true }, { text: long, whole: false }]);
  const l = askedRowLook({ id: 1, at: "2026-11-14T10:00:00Z", command: "supabase db reset --linked", reason: "r", by: "tool" });
  expect(l.lead).toBe("Asked first:");
  expect(`${l.lead} ${l.command}`).toBe(l.title);
  const card = readFileSync(new URL("./card.tsx", import.meta.url), "utf8");
  expect(card).toContain('className="hist-cmd"');
});

test("M85 review: both new settings sit in More options, Fixing, and search finds them by live and always allow", async () => {
  const { searchSettingsFor } = await import("./settingsSearch.ts");
  expect(searchSettingsFor("live")[0]).toMatchObject({ hit: { key: "safety.askBeforeLive" }, page: "more", group: "more.fixing.run" });
  expect(searchSettingsFor("always allow")[0]).toMatchObject({ hit: { key: "approval.offerAlways" }, page: "more", group: "more.fixing.run" });
});
