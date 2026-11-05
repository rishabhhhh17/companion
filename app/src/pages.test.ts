// M69 step 2, the pages: History, Memory, Learn, Settings, the first run, setup problems and approvals, to the YC
// benchmark spec (3.5 to 3.12, section 5) with the M69 corrections: F29 (no key, no cost), M57's honest words, F28's keys,
// rule 16. Pure logic is tested directly; the pages are read as text, as the other page tests do.
import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { historyDays, historyTime } from "./history.ts";
import { setupList, setupNow } from "./setupList.ts";
import { practicePath, type ListRow } from "./practice.ts";
import { approvalWords } from "./approvals.ts";
import { COUNTED, STEPS } from "./onboarding.ts";
import { S } from "./strings.ts";

const read = (f: string) => readFileSync(new URL(f, import.meta.url), "utf8");
const at = (y: number, mo: number, d: number, h = 12, mi = 0) => new Date(y, mo - 1, d, h, mi).toISOString();
const NOW = new Date(2026, 10, 4, 15, 0).getTime();   // Wed 4 Nov 2026, 3 pm, the Mac's own time
const W = { today: S.screens.today, yesterday: S.screens.yesterday, earlier: S.screens.earlier };

describe("History as a timeline (spec 3.6)", () => {
  const item = (id: number, endedAt: string | null, startedAt = endedAt ?? "") => ({ id, startedAt, endedAt });
  test("grouped by day, newest day first, the order within a day kept", () => {
    const days = historyDays([item(5, at(2026, 11, 4, 14, 14)), item(4, at(2026, 11, 4, 9)), item(3, at(2026, 11, 3, 18)), item(2, at(2026, 11, 2, 10)), item(1, at(2025, 12, 30, 10))], NOW, W);
    expect(days.map((d) => d.label)).toEqual(["Today", "Yesterday", "Mon 2 Nov", "Tue 30 Dec 2025"]);
    expect(days[0].items.map((i) => i.id)).toEqual([5, 4]);
  });
  test("a running task files under the day it started; one with no readable time goes under Earlier, last", () => {
    const days = historyDays([item(9, null, at(2026, 11, 4, 14)), item(8, "nonsense", "nonsense")], NOW, W);
    expect(days.map((d) => [d.label, d.items.map((i) => i.id)])).toEqual([["Today", [9]], ["Earlier", [8]]]);
  });
  test("the time on the right is the time of day, short; unknown is null", () => {
    expect(historyTime(item(1, at(2026, 11, 4, 14, 14)))).toBe("2:14 pm");
    expect(historyTime(item(1, at(2026, 11, 4, 0, 5)))).toBe("12:05 am");
    expect(historyTime(item(1, "x", "x"))).toBeNull();
  });
  // M71 (one structure): the lead says the Undo order with the count, the one list says the day on each row (the time
  // today, else the day), and the empty list is one row with Start practice.
  test("the page: the Undo order said once in the lead, the day on each row, no cost, and an empty row that starts the practice", () => {
    const card = read("./card.tsx");
    const panel = card.slice(card.indexOf("function HistoryPanel("), card.indexOf("function MemoryList("));
    expect(panel.indexOf("S.screens.undoCaption")).toBeLessThan(panel.indexOf("<ListGroup"));
    expect(panel).toContain("historyDays([h], now, S.screens)");
    expect(panel).toContain('<time className="hist-time"');
    expect(panel).not.toContain("costWords");
    expect(panel).not.toContain("S.historyUndoWhy");
    expect(panel).toContain("<EmptyRow icon=\"undo\" title={S.screens.historyEmptyTitle} line={S.screens.historyEmptyLine}");
    expect(panel).toContain("{ label: S.screens.startPractice, colour: \"purple\", onClick: onPractice }");
    expect(card).toContain("onPractice={groups.groupOn(\"guide\") ? () => beginPractice(FIRST_PRACTICE) : undefined}");
  });
});

describe("Memory with named sections and named erase buttons (spec 3.7)", () => {
  test("the words", () => {
    expect(S.screens.aboutProject("my-shop")).toBe("About my-shop");
    expect(S.screens.eraseProject("my-shop")).toBe("Erase my-shop notes");
    expect(S.screens.eraseYou).toBe("Erase notes about you");
    expect(S.screens.memoryEmpty).toBe("Squibby fills this in as you work. Every line can be forgotten.");
  });
  test("the page names each section and its erase button, shows a marked example when empty, and Reactions moved to Settings", () => {
    const card = read("./card.tsx");
    expect(card).toContain("title={S.screens.aboutProject(projectName)} eraseLabel={S.screens.eraseProject(projectName)} scope=\"project\"");
    expect(card).toContain("title={S.screens.aboutYou} eraseLabel={S.screens.eraseYou} scope=\"profile\"");
    const list = card.slice(card.indexOf("function MemoryList("), card.indexOf("function Card()"));
    expect(list).toContain("{eraseLabel}</Button>");
    expect(list).not.toContain("{S.memoryErase}");
    expect(list).toContain("{S.screens.exampleTag}");
    expect(card).not.toContain('onChange={(on) => void changeSetting("fun.reactions", on)}');
    // Still a control for it, in Settings, Character (customizable everything).
    expect(read("./settingsPages.ts")).toContain('"fun.reactions"');
  });
});

describe("Learn, calm and useful (spec 3.8)", () => {
  const row = (id: string, state: ListRow["state"]) => ({ entry: { id } as ListRow["entry"], state });
  test("the practice to do now leads: one under way, else the first not done; none when all are done", () => {
    expect(practicePath([row("a", "done"), row("b", "notStarted"), row("c", "inProgress")])).toBe("c");
    expect(practicePath([row("a", "done"), row("b", "notStarted"), row("c", "notStarted")])).toBe("b");
    expect(practicePath([row("a", "done")])).toBeNull();
  });
  // M71: the practice to do now is Learn's featured card (what it teaches, its time, Start); every practice is one row.
  test("the lead is the practice to do now with what it teaches; each practice is one row; no cost line; no dead end Close", () => {
    const panel = read("./practicePanel.tsx");
    expect(panel).toContain("const leadId = openId ? null : practicePath(rows);");
    expect(panel).toContain("line={<><p className=\"ui-lead-line\">{lead.teaches}</p>");
    expect(panel).not.toContain("{r.time} · {r.cost}");
    const card = read("./card.tsx");
    expect(card).toContain("{S.screens.lessonsNone}");
    expect(card).not.toContain("{S.lessonsNone}");
    expect(S.screens.lessonsNone).toBe("Lessons appear when Squibby spots something in your project.");
  });
});

describe("the first run (spec 3.10, F29)", () => {
  test("Welcome, then Pick a project, then the hands on check; no key step", () => {
    expect([...STEPS]).toEqual(["hello", "project", "check"]);
    expect([...COUNTED]).toEqual(["hello", "project"]);
  });
  test("Replay the welcome tour is in Settings, General, and in search", () => {
    expect(S.setRows.replay).toBe(S.screens.replayTour);
    expect(S.setFixed.replay.title).toBe(S.screens.replayTour);
  });
});

describe("setup problems: one numbered list (spec 3.11, F29)", () => {
  test("not ready on this Mac: step 1 open with Try again, never a key to add", () => {
    const l = setupList({ blocker: "key", project: "", practiced: false })!;
    expect(l.map((r) => [r.id, r.state, r.act])).toEqual([["ready", "now", "retry"], ["project", "later", "pickFolder"], ["practice", "later", "practice"]]);
    expect(setupNow(l)).toEqual({ n: 1, of: 3 });
  });
  test("a missing part gets it; while it comes there is no button", () => {
    expect(setupList({ blocker: "claude", project: "/p", practiced: false })![0].act).toBe("getParts");
    expect(setupList({ blocker: "claudeGetting", project: "/p", practiced: false })![0].act).toBeNull();
  });
  test("ready with no project: step 1 ticked, Pick a project open, the practice ticked once done", () => {
    const l = setupList({ blocker: null, project: "", practiced: true })!;
    expect(l.map((r) => r.state)).toEqual(["done", "now", "done"]);
    expect(setupNow(l)).toEqual({ n: 2, of: 3 });
  });
  test("ready with a project: no list; a stopped engine is not setup", () => {
    expect(setupList({ blocker: null, project: "/p", practiced: false })).toBeNull();
    expect(setupList({ blocker: "engine", project: "/p", practiced: false })).toBeNull();
  });
  test("the words never ask for a key or Claude, and the hero has no second button while the list shows", () => {
    const words = [S.screens.setupTitle, ...Object.values(S.screens.setupSteps).flatMap((w) => Object.values(w)), S.home.blocked.key.headline, S.home.blocked.key.line, S.home.blocked.key.main, S.home.blocked.claude.headline, S.home.blocked.claude.main, S.home.blocked.claudeGetting.headline];
    for (const w of words) expect(w, w).not.toMatch(/key|Get Claude|sign in|log in/i);
    const card = read("./card.tsx");
    expect(card).toContain("const heroMain: { label: string; go: () => void; status: boolean } | null = compact || setup ? null");
    expect(card).toContain("{!setup && <ClaudeNotice st={claudeSt} setSt={setClaudeSt} />}");
    expect(read("./settingsPage.tsx")).not.toContain('{ id: "key", label: S.setRows.setupKey');
  });
});

describe("approvals (spec 3.12)", () => {
  test("an install asks in plain words; the command waits behind Show the command; Undo is said only when it can", () => {
    const w = approvalWords({ risk: "install", title: "Adds a small tool that checks form input. The fix needs it.", action: "Running: npm install zod", undoable: true });
    expect(w.question).toBe("Squibby needs your OK to add a tool.");
    expect(w.why).toBe("Adds a small tool that checks form input. The fix needs it.");
    expect(w.what).toBe("npm install zod");
    expect(S.approval.undoYes).toBe("You can undo this.");
    const card = read("./card.tsx");
    expect(card).toContain('<details className="ask-what-fold"><summary>{S.screens.showCommand}</summary>');
  });
});

describe("copy (spec 5, corrected)", () => {
  test("the new words: no em dashes, no cost, no key, no tool named as the one that changed files, no praise", () => {
    const all: string[] = [];
    const walk = (v: unknown) => { if (typeof v === "string") all.push(v); else if (typeof v === "function") { const r = (v as (...a: unknown[]) => unknown)(2, "my-shop"); if (typeof r === "string") all.push(r); } else if (v && typeof v === "object") Object.values(v).forEach(walk); };
    walk(S.screens);
    for (const t of all) {
      expect(t, t).not.toContain("—");
      expect(t, t).not.toMatch(/\bcents?\b|\$\d|your key|API key|changed by|(Lovable|Bolt|Replit|Cursor) changed/i);
      expect(t, t).not.toMatch(/welcome back|great job|well done|friend/i);
    }
  });
  test("Settings: no counts on folds, Check another AI's answer in user words, and no cost line on it", () => {
    const page = read("./settingsPage.tsx");
    expect(page).not.toMatch(/<Disclosure[^>]*count=/);
    expect(S.set["secondLook.on"].label).toBe("Check another AI's answer");
    expect(S.set["secondLook.on"].help).not.toMatch(/cost/i);
  });
});
