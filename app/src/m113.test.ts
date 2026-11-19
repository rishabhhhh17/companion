// M113 (docs/milestones/M113-live-feed.md): the live feed's words and order in the notch. Pure: the model keeps only a valid
// feed.update and drops it on Stop everything; notchFeed.ts turns it into blocks of rows within the notch's room, with the
// counts said in words for VoiceOver and keys that never move under a new line.
import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { initial, reduce, type Model } from "./model.ts";
import { CHAT_ROWS, FEED_ROWS, feedBlocks, feedFrom, feedPress, fileParts, pressLine } from "./notchFeed.ts";
import { arrivalFrom } from "./home.ts";
import { S } from "./strings.ts";
import { CONNECT_HOOKS, connection, connectAsk, connectCommands, feedOffRow, OPTIONAL_HOOKS } from "./aiTools.ts";
import { doneAsk, doneStateFrom, hookLabel, removedLine } from "./doneSignal.ts";

const P = "/Users/me/shop";
const ev = (o: Record<string, unknown>) => ({ v: 1, id: `x${Math.random()}`, ...o });
const fx = readFileSync(new URL("../../protocol/fixtures/events.jsonl", import.meta.url), "utf8").split("\n").filter((l) => l.includes('"id":"m113e')).map((l) => JSON.parse(l));
const sess = (o: Record<string, unknown> = {}) => ({ key: "3f9a0c21b7d4", project: P, tool: "claude", via: "hook", state: "working", items: [{ kind: "edit", path: "src/app.tsx", added: 12, removed: 3, n: 1 }], ...o });
const withFeed = (sessions: unknown[], m: Model = initial()) => reduce(m, ev({ type: "feed.update", sessions }) as never);

describe("the model", () => {
  test("keeps a valid feed.update, and nothing for a broken one", () => {
    const m = reduce(initial(), fx[0] as never);
    expect(m.feed).toHaveLength(2);
    expect(withFeed([]).feed).toBeNull();
    // Anything the protocol refuses leaves the feed as it was.
    const bad = withFeed([sess({ items: [{ kind: "edit", path: "/abs/path.ts", n: 1 }] })], m);
    expect(bad.feed).toEqual(m.feed);
    expect(withFeed([sess({ text: "x" })], m).feed).toEqual(m.feed);
  });
  test("Stop everything drops it at once", () => {
    const m = withFeed([sess()]);
    expect(m.feed).toHaveLength(1);
    expect(reduce(m, { type: "app.stop_everything" } as never).feed).toBeNull();
  });
  test("feedFrom reads the sessions only when they are what the protocol allows", () => {
    expect(feedFrom([sess()])).toHaveLength(1);
    expect(feedFrom("nope")).toBeNull();
    expect(feedFrom([sess({ key: "x" })])).toBeNull();
  });
});

describe("the blocks", () => {
  test("one session: its head names the tool and the project, and up to three rows", () => {
    const items = [
      { kind: "edit", path: "src/app.tsx", added: 12, removed: 3, n: 2 },
      { kind: "run", command: "npm test", n: 1 },
      { kind: "edit", path: "README.md", added: 1, removed: 0, n: 1 },
      { kind: "run", command: "ls", n: 3 },
    ];
    const [b] = feedBlocks(feedFrom([sess({ items })]));
    expect(b!.head).toBe("Claude Code in shop");
    expect(b!.state).toBe("working");
    expect(b!.stateWords).toBe(S.m113.state.working);
    expect(b!.rows).toHaveLength(FEED_ROWS[0]);
    expect(b!.rows[0]).toMatchObject({ kind: "edit", name: "app.tsx", dir: "src/", added: 12, removed: 3, times: 2, say: "Edited src/app.tsx, 12 lines added, 3 lines taken away, 2 times" });
    expect(b!.rows[1]).toMatchObject({ kind: "run", name: "npm test", dir: "", added: null, removed: null, times: 1, say: "Ran npm test" });
    expect(b!.rows[2]).toMatchObject({ kind: "edit", name: "README.md", dir: "", say: "Edited README.md, 1 line added" });
  });
  test("more sessions share the room: two rows each for two, one each for three", () => {
    const four = [{ kind: "run", command: "a", n: 1 }, { kind: "run", command: "b", n: 1 }, { kind: "run", command: "c", n: 1 }];
    const two = feedBlocks(feedFrom([sess({ items: four }), sess({ key: "a1b2c3d4e5f6", tool: "codex", project: "/Users/me/site", items: four })]));
    expect(two.map((b) => b.rows.length)).toEqual([FEED_ROWS[1], FEED_ROWS[1]]);
    expect(two[1]!.head).toBe("Codex in site");
    const three = feedBlocks(feedFrom([sess({ items: four }), sess({ key: "a1b2c3d4e5f6", items: four }), sess({ key: "0c0c0c0c0c0c", items: four })]));
    expect(three.map((b) => b.rows.length)).toEqual([FEED_ROWS[2], FEED_ROWS[2], FEED_ROWS[2]]);
    expect(FEED_ROWS).toEqual([3, 2, 1]);
    // The small chat keeps its thread in view: two blocks at most, fewer rows.
    expect(feedBlocks(feedFrom([sess({ items: four })]), CHAT_ROWS).map((b) => b.rows.length)).toEqual([2]);
    expect(feedBlocks(feedFrom([sess({ items: four }), sess({ key: "a1b2c3d4e5f6", items: four }), sess({ key: "0c0c0c0c0c0c", items: four })]), CHAT_ROWS).map((b) => b.rows.length)).toEqual([1, 1]);
  });
  test("a finished session says Finished; a folder session names no tool and has no counts", () => {
    const [done] = feedBlocks(feedFrom([sess({ state: "done" })]));
    expect(done!.stateWords).toBe(S.m113.state.done);
    const [seen] = feedBlocks(feedFrom([sess({ tool: undefined, via: "folder", items: [{ kind: "edit", path: "src/b.ts", n: 1 }] })]));
    expect(seen!.head).toBe("Changes in shop");
    // M113 review: a folder block never says Working (it may be the person's own saves): it says Seen.
    expect(seen!.stateWords).toBe(S.m113.state.seen);
    expect(seen!.stateWords).toBe("Seen");
    expect(seen!.rows[0]).toMatchObject({ kind: "seen", name: "b.ts", dir: "src/", added: null, removed: null, say: "Changed src/b.ts, seen in the folder" });
  });
  test("a counted edit with only lines added says only that; none is never said as a count", () => {
    const [b] = feedBlocks(feedFrom([sess({ items: [{ kind: "edit", path: "b.ts", added: 4, n: 1 }] })]));
    expect(b!.rows[0]).toMatchObject({ added: 4, removed: null, say: "Edited b.ts, 4 lines added" });
    const [c] = feedBlocks(feedFrom([sess({ items: [{ kind: "edit", path: "c.ts", added: 0, removed: 2, n: 1 }, { kind: "edit", path: "d.ts", added: 0, removed: 0, n: 1 }] })]));
    expect(c!.rows.map((r) => r.say)).toEqual(["Edited c.ts, 2 lines taken away", "Edited d.ts, no lines changed"]);
  });
  test("a row's key never moves when a new line arrives on top", () => {
    const older = feedBlocks(feedFrom([sess({ items: [{ kind: "run", command: "npm test", n: 1 }, { kind: "edit", path: "a.ts", added: 1, removed: 0, n: 1 }] })]))[0]!.rows;
    const newer = feedBlocks(feedFrom([sess({ items: [{ kind: "run", command: "npm test", n: 1 }, { kind: "run", command: "npm test", n: 1 }, { kind: "edit", path: "a.ts", added: 1, removed: 0, n: 1 }] })]))[0]!.rows;
    expect(newer[1]!.key).toBe(older[0]!.key);
    expect(newer[2]!.key).toBe(older[1]!.key);
    expect(new Set(newer.map((r) => r.key)).size).toBe(newer.length);
  });
  test("nothing to say: no blocks, and no block with no rows", () => {
    expect(feedBlocks(null)).toEqual([]);
    expect(feedBlocks(feedFrom([sess({ items: [] })]))).toEqual([]);
  });
});

describe("Settings and Connect", () => {
  const state = (on: Record<string, boolean>) => doneStateFrom({ type: "donesignal.state", project: P, tools: ["done", "guard", "waiting", "start", "feed"].map((hook) => ({ tool: "claude", hook, on: on[hook] ?? false, file: ".claude/settings.local.json", adds: "{}", creates: false })) }, P);
  test("the feed row is read, named for its tool, and has its own card and Remove words", () => {
    const st = state({ feed: false })!;
    const row = st.tools.find((r) => r.hook === "feed")!;
    expect(row).toBeTruthy();
    expect(hookLabel(row)).toEqual({ label: S.m113.rowTitle("Claude Code"), line: S.m113.rowLine("Claude Code") });
    const ask = doneAsk(row);
    expect(ask.title).toBe(S.m113.askTitle("Claude Code"));
    expect(ask.notes[0]).toBe(S.m113.askWhat("Claude Code"));
    expect(ask.notes[0]).toContain("never kept");
    expect(removedLine(row)).toBe(S.m113.removed("Claude Code"));
  });
  test("Connect adds the feed for the tools that have one; a tool connected before still counts as connected", () => {
    for (const t of ["claude", "codex", "cursor", "copilot", "gemini"] as const) { expect(CONNECT_HOOKS[t]).toContain("feed"); expect(OPTIONAL_HOOKS[t]).toContain("feed"); }
    for (const t of ["antigravity", "windsurf"] as const) expect(CONNECT_HOOKS[t]).not.toContain("feed");
    expect(connection(state({ done: true, guard: true, waiting: true }), "claude")).toBe("on");
    const ask = connectAsk(state({}), "claude")!;
    expect(ask.parts.map((p) => p.hook)).toEqual(["done", "guard", "waiting", "feed"]);
    expect(ask.parts.at(-1)!.label).toBe(S.m82.partLabel.feed("Claude Code"));
    expect(ask.notes[0]).toBe(S.m82.connectWhat("Claude Code", true));
    expect(ask.notes[0]).toContain("which file it just edited");
  });
  test("M113 review: a connected tool with its feed off offers the feed's own row; on, partly, or with no feed row, nothing", () => {
    expect(feedOffRow(state({ done: true, guard: true, waiting: true }), "claude")).toMatchObject({ tool: "claude", hook: "feed", on: false });
    expect(feedOffRow(state({ done: true, guard: true, waiting: true, feed: true }), "claude")).toBeNull();
    // Not connected (Connect's own card already has the feed), or partly.
    expect(feedOffRow(state({}), "claude")).toBeNull();
    expect(feedOffRow(state({ done: true }), "claude")).toBeNull();
    // An engine from before M113 lists no feed row.
    const older = doneStateFrom({ type: "donesignal.state", project: P, tools: ["done", "guard", "waiting"].map((hook) => ({ tool: "claude", hook, on: true, file: ".claude/settings.local.json", adds: "{}", creates: false })) }, P);
    expect(feedOffRow(older, "claude")).toBeNull();
    // A tool with no feed hook.
    expect(feedOffRow(state({ done: true, guard: true }), "windsurf")).toBeNull();
  });
  test("the yes sends exactly the parts its card showed: the feed only when the engine listed its row", () => {
    const hooks = (st: ReturnType<typeof state>) => connectCommands(P, st, "claude").map((c) => (c as { hook?: string }).hook ?? "done");
    expect(hooks(state({}))).toEqual(["done", "guard", "waiting", "feed"]);
    expect(hooks(state({ done: true, guard: true, waiting: true }))).toEqual(["feed"]);
    // An engine from before M113 lists no feed row: nothing is sent for it.
    const older = doneStateFrom({ type: "donesignal.state", project: P, tools: ["done", "guard", "waiting"].map((hook) => ({ tool: "claude", hook, on: false, file: ".claude/settings.local.json", adds: "{}", creates: false })) }, P);
    expect(hooks(older)).toEqual(["done", "guard", "waiting"]);
    expect(connectAsk(older, "claude")!.parts.map((p) => p.hook)).toEqual(["done", "guard", "waiting"]);
  });
});

// M113 review (Compared with the best, 19 Nov 2026): a press on a line goes where that line's change really is. Coucou
// opens the edit's own diff; Squibby opens the review of it, so the press must never land on an older review: while the
// tool still works and no review of this work is in, Home says when it will be; a line from another project says so.
describe("where a press on a line goes", () => {
  const card = (stage: "ready" | "reviewing" | "reviewed", project = P) => ({ project, stage });
  const s = (o: Record<string, unknown> = {}) => feedFrom([sess(o)])![0]!;
  test("the review of this work when it is in (waiting, being reviewed, or done after the tool finished)", () => {
    expect(feedPress(s(), P, card("ready"), true)).toBe("review");
    expect(feedPress(s(), P, card("reviewing"), true)).toBe("review");
    expect(feedPress(s({ state: "done" }), P, card("reviewed"), true)).toBe("review");
  });
  test("while the tool still works and only an older review is there: later, never the old one", () => {
    expect(feedPress(s(), P, card("reviewed"), true)).toBe("later");
    expect(feedPress(s(), P, null, true)).toBe("later");
  });
  // M113 review: a Finished line with no review yet is the review's settle time, never "still working".
  test("a finished line with no review in yet: settling, said as finished", () => {
    expect(feedPress(s({ state: "done" }), P, null, true)).toBe("settling");
    expect(feedPress(s({ state: "done" }), P, card("ready", "/Users/me/site"), true)).toBe("settling");
    expect(S.m113.settling("Claude Code")).toBe("Claude Code finished. Its review starts in a moment.");
    expect(S.m113.settling("")).toBe("Your AI tool finished. Its review starts in a moment.");
  });
  test("the notch's own short line for later and settling, and nothing for the rest", () => {
    expect(pressLine("later", "Claude Code")).toBe("The review shows when Claude Code finishes.");
    expect(pressLine("later", "")).toBe("The review shows when your AI tool finishes.");
    expect(pressLine("settling", "Codex")).toBe(S.m113.settling("Codex"));
    for (const go of ["review", "elsewhere", "home"] as const) expect(pressLine(go, "Codex")).toBeNull();
  });
  test("a line from another project, or with reviews off, opens Home and promises nothing", () => {
    expect(feedPress(s({ project: "/Users/me/site" }), P, card("ready", "/Users/me/site"), true)).toBe("elsewhere");
    expect(feedPress(s(), "", null, true)).toBe("elsewhere");
    expect(feedPress(s(), P, card("reviewed"), false)).toBe("home");
    // A review card of another project never counts for this one.
    expect(feedPress(s(), P, card("ready", "/Users/me/site"), true)).toBe("later");
  });
  test("the words say what happens, plainly, with the tool and the project", () => {
    expect(S.m113.later("Claude Code")).toBe("Claude Code is still working. The review of these changes shows here when it finishes.");
    expect(S.m113.later("")).toBe("Your AI tool is still working. The review of these changes shows here when it finishes.");
    // M113 review: the line comes with one button that opens that project, so its words no longer send the person to do it.
    expect(S.m113.elsewhere("site")).toBe("These changes are in site.");
    expect(S.m113.openProject("site")).toBe("Open site");
    // The work's session went (Finished for its minute, or idle): never an older review, a plain line instead.
    expect(S.m113.gone(true)).toBe("That work has finished. Its review is on Now or in History.");
    expect(S.m113.gone(false)).toBe("That work has finished.");
    for (const w of [S.m113.later("Codex"), S.m113.elsewhere("site"), S.m113.settling("Codex"), S.m113.gone(true), pressLine("later", "Codex")!]) expect(w).not.toMatch(/—|–/);
  });
  test("the press carries only the session's key, and Home reads only that shape", () => {
    expect(arrivalFrom({ then: { do: "feed", key: "3f9a0c21b7d4" } })).toEqual({ do: "feed", key: "3f9a0c21b7d4" });
    for (const bad of [{ do: "feed" }, { do: "feed", key: "XYZ" }, { do: "feed", key: "3f9a0c21b7d4a" }, { do: "feed", key: 3 }]) expect(arrivalFrom({ then: bad }), JSON.stringify(bad)).toBeNull();
  });
});

// break-ui (19 Nov 2026): a huge count is grouped, in the row and in the words, so 12345 never reads as a code.
describe("huge counts", () => {
  test("are grouped by thousands, drawn and said", () => {
    expect(S.m113.num(12345)).toBe("12,345");
    expect(S.m113.num(7)).toBe("7");
    expect(S.m113.editSay("a.ts", 12345, 1, 1)).toBe("Edited a.ts, 12,345 lines added, 1 line taken away");
    expect(S.m113.times(1200)).toBe("1,200×");
  });
});

// M113 review: a long file's name keeps its extension (shot 1d): the stem is cut, the extension never.
describe("a file's name and its extension", () => {
  test("split into stem and extension, so only the stem is cut", () => {
    expect(fileParts("SignupFormWithAVeryLongNameThatGoesOnAndOn.tsx")).toEqual({ stem: "SignupFormWithAVeryLongNameThatGoesOnAndOn", ext: ".tsx" });
    expect(fileParts("app.test.ts")).toEqual({ stem: "app.test", ext: ".ts" });
    expect(fileParts("README")).toEqual({ stem: "README", ext: "" });
    // A dot file is all name; a long tail after the last dot is not an extension.
    expect(fileParts(".env")).toEqual({ stem: ".env", ext: "" });
    expect(fileParts("notes.averyveryverylongtail")).toEqual({ stem: "notes.averyveryverylongtail", ext: "" });
    expect(fileParts("a.")).toEqual({ stem: "a.", ext: "" });
  });
  test("each edit row carries both parts; a command row has none", () => {
    const [b] = feedBlocks(feedFrom([sess({ items: [{ kind: "edit", path: "src/components/SignupFormWithAVeryLongNameThatGoesOnAndOn.tsx", added: 1, removed: 0, n: 1 }, { kind: "run", command: "npm test", n: 1 }] })]));
    expect(b!.rows[0]).toMatchObject({ name: "SignupFormWithAVeryLongNameThatGoesOnAndOn.tsx", stem: "SignupFormWithAVeryLongNameThatGoesOnAndOn", ext: ".tsx" });
    expect(b!.rows[1]).toMatchObject({ name: "npm test", stem: "npm test", ext: "" });
  });
});
