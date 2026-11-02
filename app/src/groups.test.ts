// Groups of tools (F20, M12): the catalog is the one place that says which tool belongs to which group, and the pages read
// it. These tests read the real source files, so a new hotkey, shell command or engine command that nobody put in a
// group fails here.
import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { REGISTRY, defOf } from "../../protocol/settings.ts";
import {
  ASK_BUTTONS, GROUPS, SWITCHED, TOOLS, askButtons, buttonShown, groupOf, groupOn, groupLook, groupView, invitation, learnShown, offLine, permissionNeeded,
  toolById, toolOn, triedList, untriedIn, usedBy, activeGroup, switchKey, followPendingAfter, refusalNotice, type GroupId, type ToolId, NEEDS_FINISHED,
} from "./groups.ts";
import { initial } from "./model.ts";
import { islandLine } from "./home.ts";
import { searchSettings } from "./settingsRows.ts";
import { shownSettings } from "./modelChoice.ts";
import { S } from "./strings.ts";

const read = (p: string) => readFileSync(new URL(p, import.meta.url), "utf8");
const names = (...xs: string[][]) => xs.flat();
const none = (): unknown => undefined;
/** A reader that has these groups switched off. */
const off = (...g: GroupId[]) => (key: string): unknown => (g.some((x) => switchKey(x) === key) ? false : undefined);
/** A receipt of a task that really finished and changed something. */
const RECEIPT = { type: "receipt", agent: "a", changed: [{ file: "a.txt", kind: "added" }], proof: "passed", ended: "done", mode: "drive" };
const dup = (xs: string[]) => xs.filter((x, i) => xs.indexOf(x) !== i);

describe("the catalog is complete and consistent", () => {
  test("five groups with a switch (Prompt help split out of Voice), and the one that never has one", () => {
    expect(SWITCHED.map((g) => g.id)).toEqual(["flow", "guide", "voice", "files", "prompt"]);
    expect(GROUPS.filter((g) => !g.switch).map((g) => g.id)).toEqual(["core"]);
  });
  test("each switch is a registry switch, usual on but file conversion (F28), read by the shell, the engine and the pages", () => {
    for (const g of SWITCHED) {
      const d = defOf(g.switch!)!;
      expect(d, g.id).toBeTruthy();
      expect(d.kind).toBe("switch"); expect(d.default, g.id).toBe(g.id !== "files"); expect(d.section).toBe("groups"); expect(d.store).toBe("settings");
      expect(d.applies).toEqual(["shell", "runner", "pages"]);
    }
  });
  test("tool ids are unique, each is in a known group, and each setting it names exists", () => {
    expect(dup(TOOLS.map((t) => t.id))).toEqual([]);
    for (const t of TOOLS) {
      expect(GROUPS.map((g) => g.id), t.id).toContain(t.group);
      for (const k of t.settings) expect(defOf(k), `${t.id}: ${k}`).toBeTruthy();
      for (const p of t.permissions) expect(["screenRecording", "accessibility", "microphone"], t.id).toContain(p);
    }
  });
  test("a tool of the core is never tried and never switched; every other tool says who records its first use", () => {
    for (const t of TOOLS) {
      if (t.group === "core") expect(t.tried, t.id).toBeUndefined();
      else expect(["page", "shell"], t.id).toContain(t.tried as string);
    }
  });
  test("every hotkey is in exactly one tool, and the stop key and the ask box are in the core", () => {
    const src = read("../src-tauri/src/keymap.rs");
    const ids = [...src.slice(src.indexOf("pub fn id(self)"), src.indexOf("pub fn from_id(s: &str) -> Option<Action>")).matchAll(/Action::\w+ => "(\w+)"/g)].map((m) => m[1]);
    expect(ids.length).toBe(10);
    const listed = TOOLS.flatMap((t) => t.hotkeys ?? []);
    expect(dup(listed)).toEqual([]);
    expect(listed.sort()).toEqual([...ids].sort());
    expect(groupOf("stop")).toBe("core"); expect(groupOf("askBox")).toBe("core");
    expect(TOOLS.find((t) => t.hotkeys?.includes("stop"))!.group).toBe("core");
  });
  test("every shell command is in exactly one tool, and none is listed that does not exist", () => {
    const src = read("../src-tauri/src/main.rs");
    const body = src.slice(src.indexOf("generate_handler!["), src.indexOf("])", src.indexOf("generate_handler![")));
    const all = [...new Set(body.replace("generate_handler![", "").split(",").map((x) => x.trim()).filter(Boolean))];
    expect(all.length).toBeGreaterThan(70);
    const listed = TOOLS.flatMap((t) => t.commands);
    expect(dup(listed)).toEqual([]);
    expect(listed.sort()).toEqual([...all].sort());
  });
  test("every command the engine takes is in exactly one tool, and every mode of agent.start too", () => {
    const src = read("../../protocol/index.ts");
    const block = src.slice(src.indexOf("const COMMANDS"), src.indexOf("\n};", src.indexOf("const COMMANDS")));
    const types = [...block.matchAll(/^ {2}"([a-z]+(?:\.[A-Za-z]+)+)":/gm)].map((m) => m[1]);
    expect(types.length).toBeGreaterThan(55);
    const listed = TOOLS.flatMap((t) => t.runner);
    expect(dup(listed)).toEqual([]);
    expect([...listed, "agent.start"].sort()).toEqual([...types].sort());
    const modes = [...(block.match(/"agent.start": \[[^\n]*oneOf\("mode", \[([^\]]*)\]/)![1].matchAll(/"(\w+)"/g))].map((m) => m[1]);
    const covered = TOOLS.flatMap((t) => t.agentModes ?? []);
    expect(dup(covered)).toEqual([]);
    expect(covered.sort()).toEqual([...modes].sort());
  });
  test("what stays on with a group off only ends or takes back something, and names a command of its own tool", () => {
    for (const t of TOOLS) for (const s of t.stays ?? []) expect(names(t.commands, t.runner), `${t.id}: ${s}`).toContain(s);
    const allStays = TOOLS.flatMap((t) => t.stays ?? []);
    for (const s of allStays) expect(s).toMatch(/restore|undo|stop|dismiss|disarm|close|reveal|remove/);
  });
  test("the runner's page list and the catalog agree about what a page may send", () => {
    const rs = read("../src-tauri/src/runner.rs");
    const allowed = [...rs.slice(rs.indexOf("const ALLOWED"), rs.indexOf("];", rs.indexOf("const ALLOWED"))).matchAll(/"([a-z]+(?:\.[A-Za-z]+)+)"/g)].map((m) => m[1]);
    const known = new Set(TOOLS.flatMap((t) => t.runner).concat(["agent.start"]));
    for (const a of allowed) expect(known.has(a), a).toBe(true);
  });
});

describe("a group switched off", () => {
  test("every switch is on by default and nothing is off before the person says so", () => {
    for (const g of SWITCHED) expect(groupOn(g.id, none)).toBe(true);
    for (const t of TOOLS) expect(toolOn(t.id, none)).toBe(true);
  });
  for (const g of SWITCHED) {
    test(`${g.id} off: its tools are off, every other tool and the core stay on`, () => {
      for (const t of TOOLS) expect(toolOn(t.id, off(g.id)), t.id).toBe(t.group !== g.id);
      expect(toolOn("stop", off("flow", "guide", "voice", "files"))).toBe(true);
      expect(toolOn("askBox", off("flow", "guide", "voice", "files"))).toBe(true);
    });
    test(`${g.id} off: the page's buttons for its tools are hidden, and no other button is`, () => {
      const shown = askButtons(off(g.id));
      for (const b of ASK_BUTTONS) expect(shown.includes(b.id), b.id).toBe(groupOf(b.tool) !== g.id);
      expect(askButtons(none).length).toBe(ASK_BUTTONS.length);
    });
  }
  test("a button the page draws asks for its tool and nothing else", () => {
    expect(buttonShown("rescue", off("flow"))).toBe(false);
    expect(buttonShown("rescue", off("voice"))).toBe(true);
    expect(buttonShown("showMe", off("guide"))).toBe(false);
    expect(buttonShown("research", off("flow", "guide", "voice", "files"))).toBe(true);
    expect(buttonShown("shipCheck", off("flow", "guide", "voice", "files"))).toBe(true);
  });
  test("Learn shows lessons and practice only with Guide on", () => {
    expect(learnShown(none)).toBe(true);
    expect(learnShown(off("guide"))).toBe(false);
    expect(learnShown(off("flow", "voice", "files"))).toBe(true);
  });
  test("the one line a refused command answers with is plain, the same for the shell, and names nothing", () => {
    expect(offLine()).toMatch(/switched off in Settings/);
    expect(offLine()).not.toMatch(/Flow|Guide|Voice|Files/);
    expect(read("../../protocol/groups.json")).toContain(JSON.stringify(offLine()));
  });
  test("a permission is needed only while a group that may ask for it is on", () => {
    expect(permissionNeeded("screenRecording", none)).toBe(true);
    expect(permissionNeeded("screenRecording", off("guide"))).toBe(false);
    expect(permissionNeeded("microphone", off("guide", "flow", "files"))).toBe(true);
    expect(permissionNeeded("microphone", off("voice"))).toBe(false);
    // Talking off: Prompt help (split out of Voice) still reads text you select, so Accessibility may still be asked.
    expect(permissionNeeded("accessibility", off("voice"))).toBe(true);
    expect(permissionNeeded("accessibility", off("voice", "prompt"))).toBe(false);
    expect(permissionNeeded("accessibility", off("guide", "flow", "files"))).toBe(true);
    // F28: Type by voice, a tool with its own switch, asks for nothing while it is off.
    expect(permissionNeeded("microphone", (k) => (k === "voice.on" ? false : undefined))).toBe(false);
  });
});

describe("tried: a real use only", () => {
  test("nothing is tried at first, and only known tools are ever listed", () => {
    expect(triedList(none)).toEqual([]);
    expect(triedList((k) => (k === "groups.tried" ? ["rescue", "nothing", 7, "stop"] : undefined))).toEqual(["rescue"]);
    expect(triedList((k) => (k === "groups.tried" ? "rescue" : undefined))).toEqual([]);
  });
  test("a finished task, a diagnosis, a real check, an undo, a lesson step and a Show me answer each count once", () => {
    expect(usedBy(RECEIPT)).toEqual(["drive"]);
    expect(usedBy(RECEIPT, { followUp: true })).toEqual(["followUp"]);
    expect(usedBy({ type: "rescue.report", agent: "a" })).toEqual(["rescue"]);
    // M52: a review that ran counts; one that did not run (off, nothing changed, stopped) does not.
    expect(usedBy({ type: "review.result", project: "/p", batch: "rv_1", ok: true })).toEqual(["review"]);
    expect(usedBy({ type: "review.result", project: "/p", ok: false, reason: "Nothing has changed since the last review." })).toEqual([]);
    expect(usedBy({ type: "proof.result", verdict: "passed" })).toEqual(["proof"]);
    expect(usedBy({ type: "proof.result", verdict: "failed" })).toEqual(["proof"]);
    expect(usedBy({ type: "checkpoint.restored" })).toEqual(["undo"]);
    expect(usedBy({ type: "walk.step", index: 0 })).toEqual(["lessons"]);
    expect(usedBy({ type: "assist.point", step: 0 })).toEqual(["showMe"]);
    expect(usedBy({ type: "assist.prompt.done", text: "x" })).toEqual(["promptHelp"]);
    expect(usedBy({ type: "error.explained", ok: true })).toEqual(["errorHelp"]);
    expect(usedBy({ type: "bisect.result", outcome: "found" })).toEqual(["whichTask"]);
    expect(usedBy({ type: "problem.found", verdict: "failed" })).toEqual(["findProblem"]);
    expect(usedBy({ type: "diagram.ready", made: true }, { read: (k) => (k === "drawIt.on" ? true : undefined) })).toEqual(["drawIt"]);
    // Draw it starts off (F28): a use of a tool that is off is no use.
    expect(usedBy({ type: "diagram.ready", made: true })).toEqual([]);
    expect(usedBy({ type: "explain.ready" })).toEqual(["explain"]);
    expect(usedBy({ type: "teach.result", verdict: "passed" })).toEqual(["yourTurn"]);
  });
  test("a try that did not happen counts for nothing", () => {
    expect(usedBy({ type: "proof.result", verdict: "cancelled" })).toEqual([]);
    expect(usedBy({ type: "proof.result", verdict: "nothing_to_check" })).toEqual([]);
    expect(usedBy({ type: "bisect.result", outcome: "cancelled" })).toEqual([]);
    expect(usedBy({ type: "bisect.result", outcome: "busy" })).toEqual([]);
    expect(usedBy({ type: "problem.found", verdict: "cancelled" })).toEqual([]);
    expect(usedBy({ type: "diagram.ready", made: false })).toEqual([]);
    expect(usedBy({ type: "error.explained", ok: false })).toEqual([]);
    expect(usedBy({ type: "teach.result", verdict: "cancelled" })).toEqual([]);
    expect(usedBy({ type: "assist.error" })).toEqual([]);
    expect(usedBy({ type: "agent.state" })).toEqual([]);
    expect(usedBy(null)).toEqual([]);
    expect(usedBy("receipt")).toEqual([]);
  });
  test("a Show me answer inside a lesson is the lesson's, not Show me's", () => {
    expect(usedBy({ type: "assist.point", step: 0 }, { walk: true })).toEqual([]);
  });
  test("a tool that is switched off is never marked, even if its event arrives late", () => {
    expect(usedBy({ type: "rescue.report" }, { read: off("flow") })).toEqual([]);
    expect(usedBy({ type: "assist.point", step: 0 }, { read: off("guide") })).toEqual([]);
    expect(usedBy({ type: "rescue.report" }, { read: off("guide") })).toEqual(["rescue"]);
  });
  test("every tool the page marks is one of the page's own; the shell's are never marked from a page", () => {
    const samples: unknown[] = [RECEIPT, { type: "rescue.report" }, { type: "proof.result", verdict: "passed" }, { type: "checkpoint.restored" }, { type: "walk.step" }, { type: "assist.point" },
      { type: "assist.prompt.done" }, { type: "error.explained", ok: true }, { type: "bisect.result", outcome: "found" }, { type: "problem.found", verdict: "failed" }, { type: "diagram.ready", made: true }, { type: "explain.ready" }, { type: "teach.result", verdict: "passed" }];
    for (const e of samples) for (const t of usedBy(e)) expect(toolById(t)!.tried, t).toBe("page");
    for (const id of ["talk", "speak", "convert", "practice"]) expect(toolById(id as ToolId)!.tried).toBe("shell");
  });
});

describe("tried: a task that did not really finish counts for nothing", () => {
  test("a finished task, or one that stopped to ask something, counts, as Drive or as a follow up", () => {
    expect(usedBy({ ...RECEIPT, ended: "needs_you" })).toEqual(["drive"]);
    expect(usedBy({ ...RECEIPT, ended: "needs_you" }, { followUp: true })).toEqual(["followUp"]);
    expect(usedBy({ ...RECEIPT, changed: [], proof: "partial" })).toEqual(["drive"]);
  });
  test("a task the person stopped, one that failed and one that ran out of money count for nothing", () => {
    for (const ended of ["stopped", "failed"]) {
      expect(usedBy({ ...RECEIPT, ended }), ended).toEqual([]);
      expect(usedBy({ ...RECEIPT, ended }, { followUp: true }), ended).toEqual([]);
    }
  });
  test("a task that changed nothing and checked nothing counts for nothing", () => {
    expect(usedBy({ ...RECEIPT, changed: [], proof: "skipped" })).toEqual([]);
    expect(usedBy({ ...RECEIPT, changed: [], proof: "skipped" }, { followUp: true })).toEqual([]);
  });
  test("a task of another mode is not a Drive try, and a receipt that does not say how it ended is not trusted", () => {
    expect(usedBy({ ...RECEIPT, mode: "rescue" })).toEqual([]);
    expect(usedBy({ ...RECEIPT, mode: "ship" })).toEqual([]);
    expect(usedBy({ type: "receipt", agent: "a" })).toEqual([]);
    expect(usedBy({ ...RECEIPT, ended: undefined })).toEqual([]);
  });
  test("a follow up that was refused or never began does not make the next new task a follow up", () => {
    expect(followPendingAfter({ type: "receipt" }, true)).toBe(false);
    expect(followPendingAfter({ type: "protocol.error", reason: "no", line: "agent.send" }, true)).toBe(false);
    expect(followPendingAfter({ type: "protocol.error", reason: offLine() }, true)).toBe(false);
    expect(followPendingAfter({ type: "protocol.error", reason: "something else went wrong" }, true)).toBe(true);
    expect(followPendingAfter({ type: "agent.state", state: "working" }, true)).toBe(true);
    expect(followPendingAfter({ type: "agent.state", state: "working" }, false)).toBe(false);
    expect(followPendingAfter(null, true)).toBe(true);
  });
});

describe("what the shell's off line becomes on the card", () => {
  test("a refusal is shown as the one plain line; anything else is not turned into a notice", () => {
    expect(refusalNotice(offLine())).toBe(offLine());
    expect(refusalNotice(new Error(offLine()))).toBe(offLine());
    expect(refusalNotice("something else broke")).toBeNull();
    expect(refusalNotice(undefined)).toBeNull();
  });
});

describe("Practice leans on Flow, so its buttons follow Flow", () => {
  test("Find what is wrong, Fix it with me and Why did this break are not drawn with Flow off, and are with Flow on", () => {
    for (const id of ["practiceFind", "practiceFix", "practiceWhy"]) {
      expect(buttonShown(id, off("flow")), id).toBe(false);
      expect(buttonShown(id, none), id).toBe(true);
      expect(buttonShown(id, off("guide", "voice", "files")), id).toBe(true);
    }
  });
  test("with Flow off a practice cannot enter a waiting state: its panel and the card never send a Flow command unasked", () => {
    const panel = read("./practicePanel.tsx"), card = read("./card.tsx");
    expect(panel).toContain('buttonShown("practiceFind")');
    expect(panel).toContain('buttonShown("practiceFix")');
    expect(panel).toContain('buttonShown("practiceWhy")');
    expect(panel).toContain("S.groups.practiceNeedsFlow");
    // The same three, and the one that resumes a practice by itself, are guarded where they set a waiting state.
    expect(card).toContain('toolOn("findProblem")');
    expect(card).toContain('toolOn("drive")');
    expect(S.groups.practiceNeedsFlow).toMatch(/switched off in Settings/);
    expect(S.groups.practiceNeedsFlow).not.toMatch(/Flow|Guide|Voice|Files/);
  });
  test("every command that puts the page in a waiting state can come back: it goes through the wrapper that closes the state", () => {
    const card = read("./card.tsx");
    expect(card).toContain("const sendOrExplain =");
    for (const bare of [/void send\((findProblem|fixFound|findBreakingTask)\(/, /void send\(c\); setFollowText/, /void send\(cmd\);\n  \};/]) expect(card).not.toMatch(bare);
    for (const closed of ["ui.pointClosed", "ui.practiceFixRefused", "ui.bisectClosed", "ui.diagramClosed", "ui.practiceStopProving"]) expect(card, closed).toContain(closed);
  });
  test("the ask box says it is switched off instead of bouncing silently when Flow is off", () => {
    const card = read("./card.tsx");
    const submit = card.slice(card.indexOf("  const submit = () => {"), card.indexOf("const submitNow"));
    expect(submit).toContain('!toolOn("drive")');
    expect(submit).toContain("offLine()");
    expect(submit).toContain("explainRefusal(e)");
  });
});

describe("Home's invitations", () => {
  test("the first tool not tried yet of a group that is on, as one plain line", () => {
    const i = invitation(none, false)!;
    expect(i.tool).toBe("drive");
    expect(i.line).toBe(S.groups.tools.drive.invite);
    expect(untriedIn("flow", none).map((t) => t.id)).toEqual(["drive", "followUp", "rescue", "findProblem", "proof", "undo", "explain", "drawIt", "whichTask", "watch", "connections", "whereWasI", "review"]);
  });
  test("a tool leaves the list once tried, and the invitation moves on", () => {
    const r = (k: string) => (k === "groups.tried" ? ["drive", "followUp"] : undefined);
    expect(untriedIn("flow", r).map((t) => t.id)[0]).toBe("rescue");
    expect(invitation(r, false)!.tool).toBe("rescue");
  });
  // M51 polish: "Try a follow up under a finished task" under the ask box made no sense before any task had finished.
  test("a tool that needs a finished task is not invited until one has finished; the next one is", () => {
    const r = (k: string) => (k === "groups.tried" ? ["drive"] : undefined);
    expect(NEEDS_FINISHED).toEqual(["followUp", "undo", "yourTurn"]);
    expect(invitation(r, false, true)!.tool).toBe("followUp");
    expect(invitation(r, false, false)!.tool).toBe("rescue");
    expect(invitation(r, false)!.tool, "finished is assumed when not said").toBe("followUp");
    const onlyUndoLeft = (k: string) => (k === "groups.tried" ? TOOLS.filter((t) => t.tried && t.id !== "undo").map((t) => t.id) : undefined);
    expect(invitation(onlyUndoLeft, false, false)).toBeNull();
    expect(invitation(onlyUndoLeft, false, true)!.tool).toBe("undo");
  });
  test("nothing is invited for a group that is off, with the setting off, or while work is going on", () => {
    expect(invitation((k) => (k === "groups.showUntried" ? false : undefined), false)).toBeNull();
    expect(invitation(none, true)).toBeNull();
    const all = (k: string) => (k === "groups.tried" ? TOOLS.filter((t) => t.tried).map((t) => t.id) : undefined);
    expect(invitation(all, false)).toBeNull();
    const flowDone = (k: string) => (k === "groups.tried" ? TOOLS.filter((t) => t.group === "flow").map((t) => t.id) : k === "voice.on" || k === "files.on" ? false : undefined);
    expect(invitation(flowDone, false)!.tool).toBe("showMe");
    const onlyOff = (k: string) => (k === "flow.on" ? false : undefined);
    expect(invitation(onlyOff, false)!.tool).toBe("showMe");
  });
  test("every tool that can be tried has a name and an invitation, and every group has a name and a sentence", () => {
    for (const t of TOOLS.filter((x) => x.tried)) {
      const w = (S.groups.tools as Record<string, { name: string; invite: string }>)[t.id];
      expect(w?.name.length, t.id).toBeGreaterThan(2); expect(w?.invite.length, t.id).toBeGreaterThan(8);
    }
    for (const g of SWITCHED) {
      expect((S.groups.names as Record<string, string>)[g.id].length).toBeGreaterThan(2);
      expect((S.groups.lines as Record<string, string>)[g.id].length).toBeGreaterThan(30);
    }
  });
  test("no score, level, streak, praise or guilt in anything a person reads about groups", () => {
    const all: string[] = [];
    const walk = (v: unknown) => { if (typeof v === "string") all.push(v); else if (typeof v === "function") { all.push(String((v as (...a: string[]) => unknown)("x", "y", "2"))); } else if (v && typeof v === "object") Object.values(v).forEach(walk); };
    walk(S.groups);
    for (const k of Object.keys(S.set)) if (/^(flow|guide|voice|files|groups)\./.test(k)) walk((S.set as Record<string, unknown>)[k]);
    walk(S.sections.groups);
    expect(all.length).toBeGreaterThan(30);
    const banned = /\b(score|scores|level|levels|streak|streaks|points|xp|badge|badges|rank|unlock|unlocked|achievement|great job|well done|awesome|amazing|nice work|good job|keep it up|congrat|you haven'?t|you have not|don'?t miss|missing out|falling behind|only \d+ left|hurry)\b/i;
    for (const s of all) { expect(s, s).not.toMatch(banned); expect(s, s).not.toContain("—"); expect(s, s).not.toContain("–"); }
  });
  test("no user text anywhere has a streak, a score, a level to reach, praise or guilt (rule 16)", () => {
    const all: string[] = [];
    const walk = (v: unknown) => { if (typeof v === "string") all.push(v); else if (typeof v === "function") { try { all.push(String((v as (...a: string[]) => unknown)("x", "y", "2"))); } catch { /* a line that needs real input */ } } else if (v && typeof v === "object") Object.values(v).forEach(walk); };
    walk(S);
    expect(all.length).toBeGreaterThan(1500);
    // "level" alone is a plain word elsewhere ("row level security"), so only a level to reach is looked for here.
    const banned = /\b(streaks?|scores?|leaderboard|achievements?|badges?|xp|great job|well done|awesome|amazing|nice work|good job|congrat\w*|keep it up|level up|levels? \d|your level|new level|you haven'?t|you have not tried|don'?t miss|missing out|falling behind)\b/i;
    for (const s of all) expect(s, s.slice(0, 80)).not.toMatch(banned);
  });
  test("names live only in the strings file: no logic file holds a group's name as text", () => {
    for (const f of ["groups.ts", "home.ts", "onboarding.ts"]) {
      const src = read(`./${f}`);
      for (const n of Object.values(S.groups.names)) expect(src.includes(`"${n}"`), `${f}: ${n}`).toBe(false);
    }
  });
});

describe("the working group on the island and the character", () => {
  const model = (patch: object) => ({ ...initial(), runnerUp: true, ...patch }) as ReturnType<typeof initial>;
  test("none while nothing is going on", () => { expect(activeGroup(model({}), false)).toBeNull(); });
  test("listening is Voice, a Show me or a lesson is Guide, a task or a check is Flow, a conversion is Files", () => {
    expect(activeGroup(model({ voice: { stage: "listening" } }), false)).toBe("voice");
    expect(activeGroup(model({ showme: { stage: "looking" } }), false)).toBe("guide");
    expect(activeGroup(model({ walk: { id: "w", index: 0, stage: "step" } }), false)).toBe("guide");
    expect(activeGroup(model({ diagram: { stage: "asking" } }), false)).toBe("flow");
    expect(activeGroup(model({ point: { stage: "checking" } }), false)).toBe("flow");
    expect(activeGroup(model({ agents: { a: "working" }, character: "working" }), false)).toBe("flow");
    expect(activeGroup(model({}), true)).toBe("files");
  });
  test("the look of Flow follows the checks: clearer when they pass, murkier when they fail, calm otherwise", () => {
    expect(groupLook(model({}), "flow")).toEqual({ group: "flow", state: "calm" });
    expect(groupLook(model({ receipt: { proof: "passed" } as never }), "flow").state).toBe("clear");
    expect(groupLook(model({ receipt: { proof: "failed" } as never }), "flow").state).toBe("murky");
    expect(groupLook(model({ character: "error" }), "flow").state).toBe("murky");
    expect(groupLook(model({}), "guide").state).toBe("calm");
    expect(groupLook(model({}), null)).toEqual({ group: null, state: "calm" });
  });
  test("every state name a look can take is one the catalog lists, for the art to use", () => {
    for (const g of GROUPS) expect(g.states[0]).toBe("calm");
    for (const m of [model({}), model({ receipt: { proof: "passed" } as never }), model({ receipt: { proof: "failed" } as never })]) {
      const l = groupLook(m, "flow");
      expect(GROUPS.find((g) => g.id === "flow")!.states).toContain(l.state);
    }
  });
});

describe("the registry's side", () => {
  test("the group switches and the tried list are in the groups section, and the tried list is hidden from the page", () => {
    const keys = REGISTRY.settings.filter((d) => d.section === "groups").map((d) => d.key);
    expect(keys).toEqual(["flow.on", "guide.on", "voice.on", "files.on", "prompt.on", "groups.islandName", "groups.showUntried", "groups.tried", "groups.cutNotice"]);
    expect(defOf("groups.tried")!.hidden).toBe(true);
    expect(defOf("groups.tried")!.allowedItems!.sort()).toEqual(TOOLS.filter((t) => t.tried).map((t) => t.id).sort());
    expect(defOf("groups.islandName")!.default).toBe(true); expect(defOf("groups.showUntried")!.default).toBe(true);
  });
});

describe("the pages are wired to the catalog", () => {
  const card = read("./card.tsx"), dock = read("./dock.tsx"), island = read("./island.tsx"), page = read("./settingsPage.tsx"), ob = read("./onboarding.tsx");
  test("every button of the ask box asks for its tool before it is drawn", () => {
    for (const b of ASK_BUTTONS) expect(card, b.id).toContain(`buttonShown("${b.id}")`);
    // The voice switch moved to Settings, Keys and voice (the audit, item 40), so the ask box no longer draws it.
    for (const id of ["whichTask", "findProblem"]) expect(card, id).toContain(`buttonShown("${id}")`);
    expect(page).toContain('buttonShown("voiceTry")');
    // The follow up box under a receipt is Flow's too; Undo on the receipt stays (it only takes back).
    expect(card).toContain('canFollowUp(m, project) && groups.on("followUp")');
    expect(card).toContain('{groups.on("followUp") && (canFollowUp(m, project) || m.followUp === "sending") && (');
  });
  test("Learn holds lessons and practice only with Guide on, and says so otherwise", () => {
    for (const p of ['groups.groupOn("guide") && show("practice")', 'groups.groupOn("guide") && show("lessons")', 'groups.groupOn("guide") && show("walk")']) expect(card).toContain(p);
    expect(card).toContain("!learnShown()");
    expect(S.groups.learnOff).toMatch(/switched off/);
  });
  test("Home marks a tool tried only from what the engine reports, once, through the shell", () => {
    expect(card).toContain("usedBy(ev, { followUp: followPending.current, walk: !!nowModel.current.walk })");
    expect(card).toContain('invoke("tried_mark", { tool })');
    expect(card).toContain("if (!done.includes(tool))");
    // Nothing else in any page writes the list: it is never set by a button, a timer or the first run.
    for (const src of [card, dock, island, page, ob, read("./groupsPanel.tsx"), read("./home.ts")]) expect(src).not.toContain('"groups.tried", ');
  });
  test("the stuck key looks at the screen (Guide's Show me) only with Guide on; with it off it only checks the project", () => {
    expect(card).toContain('everyday: setting("point.everyday") !== false && toolOn("showMe")');
  });
  test("Speak to me says nothing with Voice off, whatever its own setting says", () => {
    const sp = read("./speech.ts");
    expect(sp).toContain('setting("talk.speak") === true && toolOn("speak")');
    expect(sp).toContain('setting("talk.speakReplies") === true && toolOn("speak")');
  });
  test("one invitation line on Now, from the first tool not tried yet, only when nothing is working", () => {
    // M51 polish: and only invites a tool that needs a finished task once one has finished.
    expect(card).toContain('invitation(setting, working, m.history.some((h) => h.status === "done"))');
  });
  test("the island starts its line with the group at work when the setting is on, and the dock names the look for the art", () => {
    const m = { ...initial(), runnerUp: true };
    // Idle the island has no words at all (the fun island, 27 Oct 2026), so no group name either.
    expect(islandLine(m, {})).toBe("");
    expect(islandLine(m, { group: S.groups.names.flow })).toBe("");
    const working = { ...m, character: "working" as const, task: { label: "x" } as never };
    expect(islandLine(working, { group: S.groups.names.flow })).toBe(S.groups.islandGroup(S.groups.names.flow, islandLine(working, {})));
    expect(islandLine({ ...m, runnerUp: false }, { group: "Flow" })).toBe(S.islandOff);
    expect(island).toContain('useSetting("groups.islandName") !== false');
    expect(dock).toContain("data-group={look.group ?? undefined} data-group-state={look.group ? look.state : undefined}");
  });
  test("a group with its state shows in Settings: on or off, what it may ask for, and what is not tried yet", () => {
    const v = groupView("guide", none);
    expect(v.on).toBe(true); expect(v.permissions).toEqual(["screenRecording"]); expect(v.untried).toEqual(["showMe", "lessons", "yourTurn", "practice"]);
    expect(groupView("voice", none).permissions).toEqual(["microphone", "accessibility"]);
    expect(groupView("files", none).permissions).toEqual([]);
    expect(groupView("guide", off("guide")).on).toBe(false);
    expect(groupView("guide", (k) => (k === "groups.showUntried" ? false : undefined)).untried).toEqual([]);
    // In More options, General's Tools topic, behind Learn more: never a wall on the page itself.
    expect(page).toContain('{topic.id === "more.general.tools" && <ToolsMore />}');
    expect(page).toContain("{open && <GroupsPanel />}");
  });
  test("the tools tried are kept and reset like any setting but never drawn as a row or found by a search", () => {
    expect(shownSettings().map((d) => d.key)).not.toContain("groups.tried");
    expect(searchSettings("tried").sections.flatMap((s) => s.keys)).not.toContain("groups.tried");
    expect(searchSettings("").sections.find((s) => s.id === "groups")!.keys).toEqual(["flow.on", "guide.on", "voice.on", "files.on", "prompt.on", "groups.islandName", "groups.showUntried"]);
    expect(searchSettings("group").sections.some((s) => s.id === "groups")).toBe(true);
  });
  test("the first run shows one short line for each group and a switch for it", () => {
    expect(ob).toContain("S.groups.short[id]");
    // The Switch part (ui/parts.tsx): on or off, said to VoiceOver as a switch.
    expect(ob).toContain("<Switch checked={on} label={S.groups.names[id]}");
  });
});
