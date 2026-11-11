// M70, a practical notch: the small panel's greeting, fact, layout and quick actions (notchQuick.ts), the resting notch with
// the new defaults, and the wiring that keeps every action an arrival in Home that never takes the keyboard.
import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { initial, reduce, type HistoryItem, type Model } from "./model.ts";
import type { ReviewCard } from "./review.ts";
import { GEAR_DO, LAYOUT_H, QUICK_DO, QUICK_MAX, QUICK_SLOTS, panelLayout, quickActions, quickFact, quickGo, quickGreeting, quickLabel, factLines, type PanelLayout } from "./notchQuick.ts";
import { islandJobs, miniReceipt, panelView } from "./islandPanel.ts";
import { latched, rowMarkShown } from "./notchQuick.ts";
import { openness } from "./islandSpring.ts";
import { receiptVerdict } from "./model.ts";
import { arrivalFrom } from "./home.ts";
import { restWings } from "./notchHello.ts";
import { S } from "./strings.ts";
import { fromOf, geomFrom, shapeRects } from "./homeShape.ts";
import { shellSource } from "../dom/sourceText.ts";

const read = (p: string) => readFileSync(new URL(p, import.meta.url), "utf8");
const P = "/Users/me/my-shop";
const NOW = Date.parse("2026-11-04T12:00:00Z");
const row = (o: Partial<HistoryItem> = {}): HistoryItem => ({ id: 1, label: "Fix the join button", status: "done", usd: 0.05, startedAt: "2026-11-04T09:50:00Z", endedAt: "2026-11-04T10:00:00Z", checkpoint: "cp_9", changed: 1, proof: "passed", ...o });
const review = (count: number, stage: ReviewCard["stage"] = "ready"): ReviewCard => ({ project: P, batch: "rv_1a2b", stage, files: [], count, capped: false, secretFiles: [], auto: false, proof: false, asked: false, fix: null, note: null, result: null });
const m = (o: Partial<Model> = {}): Model => ({ ...initial(), folder: P, ...o });
const ev = (o: Record<string, unknown>) => ({ v: 1, id: "e", ...o });
const run = (events: Record<string, unknown>[], from: Model = initial()) => events.reduce<Model>((x, e) => reduce(x, e as never), from);
const started = [ev({ type: "checkpoint.created", project: P, agent: "a", checkpoint: "cp_1", label: "Before: fix the join button", files: 3, skipped: [] }), ev({ type: "agent.state", agent: "a", state: "working" })];
const finished = (o: Record<string, unknown> = {}) => run([...started, ev({ type: "receipt", agent: "a", checkpoint: "cp_1", changed: [{ file: "join.js", kind: "modified" }], commands: 1, notUndoable: [], proof: "passed", usdEstimate: 0.05, ended: "done", ...o }), ev({ type: "agent.state", agent: "a", state: "done" })]);
const q = (x: Model, layout: PanelLayout = "quick", on?: (t: string) => boolean) => quickActions(x, { now: NOW, layout, on: on as never });

describe("the greeting (M70: Hey <you.name> or Hi there)", () => {
  test("with a name, without, and with a name that is not one", () => {
    expect(quickGreeting("Rishabh")).toBe("Hey Rishabh");
    expect(quickGreeting("")).toBe(S.hello.hiThere);
    expect(quickGreeting("   ")).toBe(S.hello.hiThere);
    expect(quickGreeting(42)).toBe(S.hello.hiThere);
    expect(quickGreeting("\u0000\u0007")).toBe(S.hello.hiThere);
    expect(quickGreeting("Ana\nMaria")).toBe("Hey Ana Maria");
    expect(quickGreeting("x".repeat(80)).length).toBeLessThanOrEqual("Hey ".length + 24);
  });
});

describe("the one fact (M70)", () => {
  test("in order: a line the island must say, questions, no project, changes, a problem, the last check, not checked yet", () => {
    expect(quickFact(m(), NOW, S.islandOff)).toBe(S.islandOff);
    expect(quickFact(m({ runnerUp: false }), NOW)).toBe(S.islandOff);
    expect(quickFact(m({ connected: "none" }), NOW)).toBe(S.islandNotConnected);
    const asked = run([...started, ev({ type: "approval.request", approval: "ap1", agent: "a", checkpoint: "cp_1", toolUseId: "t", risk: "install", title: "Q", expiresAt: "2099-01-01T00:00:00Z" })]);
    expect(quickFact(asked, NOW)).toBe(S.hello.questions(1));
    expect(quickFact(m({ folder: null }), NOW)).toBe(S.notch.pickProject);
    expect(quickFact(m({ review: review(3), history: [row()] }), NOW)).toBe("my-shop: 3 changes to review");
    expect(quickFact(m({ review: review(1) }), NOW)).toBe("my-shop: 1 change to review");
    expect(quickFact(m({ review: review(3, "reviewed"), history: [row()] }), NOW)).toBe("my-shop: last check passed 2 hours ago");
    // M71: the short form, so the name moves up beside the greeting and the fact is never cut (factLines).
    expect(quickFact(m({ history: [row({ proof: "failed", status: "error" })] }), NOW)).toMatch(/^my-shop: a check failed /);
    // M70 step 4 (the review): never the filler "Ready when you are" for a project. A project never checked says so, as
    // Home's own headline does, which is the reason its Check my project button is there.
    expect(quickFact(m(), NOW)).toBe("my-shop: not checked yet");
    expect(quickFact(m({ history: [row({ proof: "skipped", status: "stopped" })] }), NOW)).toBe("my-shop: not checked yet");
    for (const x of [m(), m({ folder: null }), m({ review: review(3) }), m({ history: [row()] })]) expect(quickFact(x, NOW)).not.toBe(S.notch.ready);
  });
  test("honest words: changes are to review, never credited to or blamed on another tool, and one line only", () => {
    const facts = [quickFact(m({ review: review(3) }), NOW), quickFact(m({ history: [row()] }), NOW), quickFact(m(), NOW)];
    for (const f of facts) {
      expect(f).not.toMatch(/Cursor|Claude Code|Copilot|Windsurf|another (AI|tool)|made by|your AI/i);
      expect(f).not.toContain("\n");
    }
  });
});

describe("the quick actions (M70: chosen from state, fixed slots, at most three)", () => {
  test("each row of the plan's table", () => {
    // M70 step 4: with no project, a button that picks one (Home on Now, where the folder picker is), then Ask.
    expect(q(m({ folder: null }))).toEqual(["pick", "ask"]);
    expect(q(m({ runnerUp: false }))).toEqual([]);
    expect(q(m({ connected: "none" }))).toEqual([]);
    const asked = run([...started, ev({ type: "approval.request", approval: "ap1", agent: "a", checkpoint: "cp_1", toolUseId: "t", risk: "install", title: "Q", expiresAt: "2099-01-01T00:00:00Z" })]);
    expect(q(asked)).toEqual([]);
    expect(q(finished(), "result")).toEqual([]);
    expect(q(asked, "question")).toEqual([]);
    // M70 step 4: a running job is one row with Stop; Open is there for more. No row of one Ask button under it.
    expect(q(run(started), "job")).toEqual([]);
    expect(q(m({ review: review(3) }))).toEqual(["ask", "review", "check"]);
    expect(q(finished())).toEqual(["ask", "check", "undo"]);
    expect(q(m({ history: [row()] }))).toEqual(["ask", "check", "ship"]);
    expect(q(m())).toEqual(["ask", "check"]);
    expect(q(m({ history: [row({ proof: "failed", status: "error" })] }))).toEqual(["ask", "check"]);
  });
  test("a project with a problem offers to find and fix it, in the Check slot; everywhere else the plain words", () => {
    const failing = m({ history: [row({ proof: "failed", status: "error" })] });
    expect(quickLabel("check", failing, NOW)).toBe(S.notch.quick.fix);
    expect(S.notch.quick.fix).toBe("Fix it");   // M72 (item 15): Home's own words, and Home's own Fix it
    for (const x of [m(), m({ history: [row()] }), m({ review: review(2) })]) expect(quickLabel("check", x, NOW)).toBe(S.notch.quick.check);
    for (const id of ["ask", "review", "ship", "undo", "pick"] as const) expect(quickLabel(id, failing, NOW)).toBe(S.notch.quick[id]);
    // The same press either way: Home finds the problem, then offers Fix it, with today's approvals.
    expect(QUICK_DO.check).toEqual({ do: "find" });
  });
  test("Review only above zero and not once reviewed; Undo only where offered and not while an undo runs", () => {
    expect(q(m({ review: review(0) }))).not.toContain("review");
    expect(q(m({ review: review(2, "reviewed") }))).not.toContain("review");
    const undoing = run([ev({ type: "ui.undoAsked", checkpoint: "cp_1" })], finished());
    expect(q(undoing)).not.toContain("undo");
    const stopped = finished({ ended: "stopped", proof: "skipped", changed: [] });
    expect(q(stopped)).not.toContain("undo");
  });
  test("never more than three, always in slot order, and a turned off tool is not offered", () => {
    const all = [m(), m({ review: review(3) }), finished(), m({ history: [row()] }), m({ review: review(3), history: [row()] })];
    for (const x of all) {
      const a = q(x);
      expect(a.length).toBeLessThanOrEqual(QUICK_MAX);
      expect([...a].sort((i, j) => QUICK_SLOTS.indexOf(i) - QUICK_SLOTS.indexOf(j))).toEqual(a);
      expect(a[0]).toBe("ask");
    }
    expect(QUICK_SLOTS[0]).toBe("pick");
    expect(q(m({ review: review(3) }), "quick", (t) => t !== "review")).toEqual(["ask", "check"]);
    expect(q(m(), "quick", (t) => t !== "askBox")).toEqual(["check"]);
  });
  test("each action is an arrival Home and the shell both accept, and none runs anything from the notch", () => {
    expect(QUICK_DO).toEqual({ pick: null, ask: { place: "ask" }, review: { do: "review" }, check: { do: "find" }, ship: { do: "shipCheck" }, undo: { do: "undo" } });
    for (const t of [...Object.values(QUICK_DO).filter((x) => x !== null), GEAR_DO]) expect(arrivalFrom({ then: t })).toEqual(t as never);
    // Pick a project is plain Open: Home on Now, whose hero offers the folder picker.
    expect(quickGo("pick")).toEqual({});
    expect(quickGo("check")).toEqual({ then: { do: "find" } });
    const rs = read("../src-tauri/src/arrival.rs");
    expect(rs).toContain('Some("review") => Some(serde_json::json!({ "do": "review" })),');
    expect(rs).toContain('Some("ask") => Some(serde_json::json!({ "place": "ask" })),');
    const view = read("./islandPanel.tsx");
    // Every press in the small panel goes to island_go, which opens Home without the keyboard (main.rs).
    expect(view).toContain('invoke("island_go", quickGo(id))');
    expect(view).toContain('invoke("island_go", { then: GEAR_DO })');
    expect(view).toContain('invoke("island_go", {})');
    const quick = view.slice(view.indexOf('className="ip-quick"'), view.indexOf("</nav>"));
    expect(quick).not.toContain("send_command");
    const main = shellSource();
    const go = main.slice(main.indexOf("fn island_go("), main.indexOf("fn island_go(") + 600);
    expect(go).toContain('open_card_then(&app, "notch_panel", false,');
    expect(go).toContain("arrival::arrival");
  });
  test("Ask opens Home on the ask box without focusing it; Review goes to the card without the keyboard", () => {
    const card = read("./card.tsx");
    const arrive = card.slice(card.indexOf("onArrival.current = (t: HomeArrival) => {"), card.indexOf("const practiceLesson"));
    expect(arrive).toContain('if (t.place === "ask") { pickTab("now"); showAsk(); return; }');
    expect(arrive).toContain('if (t.do === "review") { pickTab("now"); if (nowModel.current.review) showReview(); return; }');
    const show = card.slice(card.indexOf("const showAsk = "), card.indexOf("const showAsk = ") + 400);
    expect(show).not.toContain("focus(");
  });
});

describe("the layout and its fixed heights (M70: no jumps)", () => {
  test("each view to its layout; quick and job are fixed and inside the shell's limits; CSS says the same", () => {
    const o = { note: "", status: "" };
    expect(panelLayout(panelView(m(), islandJobs(m()), o))).toBe("quick");
    const w = run(started);
    expect(panelLayout(panelView(w, islandJobs(w), o))).toBe("job");
    const f = finished();
    expect(panelLayout(panelView(f, islandJobs(f), o))).toBe("result");
    const rs = read("../src-tauri/src/island.rs");
    const min = Number(/pub const PANEL_MIN: f64 = ([\d.]+);/.exec(rs)![1]), max = Number(/pub const PANEL_MAX: f64 = ([\d.]+);/.exec(rs)![1]);
    for (const h of Object.values(LAYOUT_H)) { expect(h).toBeGreaterThanOrEqual(min); expect(h).toBeLessThanOrEqual(max); }
    const css = read("./ui/notch.css");
    expect(css).toContain(`.island-panel[data-layout="quick"], .island-panel[data-layout="job"] { height: ${LAYOUT_H.quick}px;`);
    expect(LAYOUT_H.quick).toBe(LAYOUT_H.job);
    // M70 step 4: two rows (the fact with Settings and Open, then the buttons or the job), short like HeyClicky's peek.
    expect(LAYOUT_H.quick).toBeLessThanOrEqual(96);
    expect(css).toMatch(/\.ip-fact \{[^}]*text-overflow: ellipsis/);
    // The founder: a small greeting first ("hey Rishabh"), from the typed name only, over the fact.
    const panel = read("./islandPanel.tsx");
    expect(panel).toContain('const greet = quickGreeting(useSetting("you.name"));');
    expect(panel).toContain('<span className="ip-lead"><span className="ip-greet" title={lines.top}>{lines.top}</span><b className="ip-fact" title={lines.fact}><Dot colour={dot} />{lines.fact}</b></span>');
    // M70 step 4: the panel's one column never grows past it, or a long fact pushed Open out of the panel.
    expect(read("./style.css")).toMatch(/\.island-panel \{[^}]*display: grid; grid-template-columns: minmax\(0, 1fr\);/);
  });
});

describe("at rest (M70: the bare notch by default)", () => {
  const reg = JSON.parse(read("../../protocol/settings.json")).settings as { key: string; default: unknown; options?: string[]; hidden?: boolean }[];
  const def = (k: string) => reg.find((d) => d.key === k)!;
  test("wings and hello are off by default, switches kept; pointing opens the small panel", () => {
    expect(def("island.wings").default).toBe(false);
    expect(def("island.hello").default).toBe(false);
    expect(def("island.pointOpens")).toMatchObject({ default: "status", options: ["home", "status"] });
    expect(S.setSeg["island.pointOpens"]).toEqual({ home: "Home", status: "Small panel" });
    expect(S.set["island.pointOpens"].options).toEqual({ home: "Home right away", status: "A small panel first" });
    expect(def("panel.showHello")).toMatchObject({ default: false, hidden: true });
  });
  test("with the new default nothing shows at rest; a stored true still brings the M68 wings back", () => {
    for (const x of [m(), m({ review: review(3) }), m({ history: [row()] })]) expect(restWings(x, NOW, { on: false, kind: "notch" })).toBeNull();
    expect(restWings(m({ review: review(3) }), NOW, { on: true, kind: "notch" })).toMatchObject({ word: S.hello.changesShort(3) });
    const page = read("./island.tsx");
    expect(page).toContain('const wingsAtRest = useSetting("island.wings") === true;');
    expect(page).toContain('on: setting("island.hello") === true');
  });
  test("while live with wings off, only the mark: no lights, no step word", () => {
    const page = read("./island.tsx");
    expect(page).toContain("const step = showStep && wingsAtRest ? notchStep(m, wings, tries) : null;");
    expect(page).toContain("{wingsAtRest && <FlowMini className=\"island-flow\" state={w.state} band />}");
  });
});

describe("the small panel never takes focus and goes on into Home (M70)", () => {
  test("only Stop shows a key hint, and only from keys.ts", () => {
    const view = read("./islandPanel.tsx");
    expect(view.match(/keyHint\(/g)?.length).toBe(2);
    expect(view).toContain('keyHint("stop", S.look.stopKeys)');
    const quick = view.slice(view.indexOf('className="ip-quick"'), view.indexOf("</nav>"));
    for (const hint of ["⌘", "kbd", "keyHint"]) expect(quick).not.toContain(hint);
  });
  test("Home grows from the panel the island showed: the shell sends its size, the page starts the shape there", () => {
    const main = shellSource();
    const open = main.slice(main.indexOf("fn open_card_then("), main.indexOf("fn card_visible("));
    expect(open).toContain("island::panel_rect(");
    expect(open.indexOf("island::panel_rect(")).toBeLessThan(open.indexOf("reset_hover()"));
    expect(open).toContain('opened["from"] = json!({ "w": w, "h": h });');
    const card = read("./card.tsx");
    expect(card).toContain("stageOpen.current(!!(e.payload as { instant?: boolean } | null)?.instant, fromOf(e.payload));");
  });
  test("Stop everything closes the panel: the hotkey and the menu fold Home and forget the hover", () => {
    const main = shellSource();
    const body = (n: string) => main.slice(main.indexOf(n), main.indexOf("\n}\n", main.indexOf(n)));
    expect(body("fn home_stop_now(")).toContain("home_fold(");
    expect(body("fn home_fold(")).toContain("home_closed();");
    expect(body("fn home_closed(")).toContain("reset_hover();");
    expect(body("fn home_closed(")).toContain('place_island(mtm, false, "home_closed")');
    expect(main.match(/home_stop_now\("stop_everything"\)/g)?.length).toBe(2);
  });
});

describe("Home grows on from the small panel as one black shape (M70, homeShape.ts from)", () => {
  const g = geomFrom({ kind: "notch", pw: 736, ph: 600, cx: 368, rest: { w: 185, h: 32 }, band: { w: 265, h: 32 }, body: { w: 688, minH: 480, maxH: 480, top: 32 } })!;
  const from = { w: 400, h: 164 };
  test("closed with from: exactly the panel, the band keeping the row's height so it never parts from the body", () => {
    const r = shapeRects(g, { phase: "closed", hover: false, bodyH: 480, from });
    expect(r.band).toEqual([368 - 200, 0, 400, 32]);
    expect(r.body).toEqual([368 - 200, 32, 400, 164 - 32]);
    expect(r.band[1] + r.band[3]).toBe(r.body[1]);
    // Open, the same band row and body top: only widths and the body's height move, so no gap opens between them.
    const o = shapeRects(g, { phase: "opening", hover: false, bodyH: 480, from });
    expect(o.band[3]).toBe(r.band[3]);
    expect(o.body[1]).toBe(r.body[1]);
    // Without from (and folding back), the notch at rest, as before.
    expect(shapeRects(g, { phase: "closed", hover: false, bodyH: 480 }).band[2]).toBe(185);
  });
  test("the shell's from is checked; nonsense is none", () => {
    expect(fromOf({ from: { w: 400, h: 164 } })).toEqual({ w: 400, h: 164 });
    for (const bad of [null, {}, { from: null }, { from: { w: -1, h: 3 } }, { from: { w: "400", h: 164 } }, { from: { w: 0, h: 10 } }]) expect(fromOf(bad)).toBeNull();
  });
  test("the page snaps to the panel for one frame without motion, then grows; a close calls the start off", () => {
    const st = read("./homeStage.tsx");
    expect(st).toContain("if (f && !now && phaseRef.current === \"closed\" && !reducedMotion()) {");
    expect(st).toContain("if (tok.current !== t) return;");
    expect(st).toContain("data-instant={(stage.instant || stage.snap) && phase !== \"closing\" ? \"\" : undefined}");
    // M70 step 4: the from is kept until Home closes (the band keeps the panel's width while it opens, the content's clip).
    expect(st).toContain("const from = phase === \"closing\" ? null : stage.from;");
  });
});

// M70 step 4, the fixes from the review of the shots (5 Nov 2026).
describe("M70 step 4: the small panel says something useful at once, and leaves the way it came", () => {
  const view = read("./islandPanel.tsx"), page = read("./island.tsx");
  test("the head row is the fact with Settings and Open in words; no character anywhere in the panel but the opt in hello", () => {
    const head = view.slice(view.indexOf('<div className="ip-head">'), view.indexOf("</div>", view.indexOf('<div className="ip-head">')));
    expect(head).toContain("{lines.fact}");
    expect(head).toContain("{S.notch.settings}");
    expect(head).toContain("{S.notch.openShort}");
    expect(head).toContain("label={S.notch.open}");
    expect(head).not.toContain("<Icon");
    expect(view).not.toContain("ip-fact\" role=\"status\" title={fact}>{fact}</p>");
    expect(view.match(/<FlowMini /g)?.length).toBe(1);
    expect(view).toContain('<FlowMini className="ip-agent" state="idle" still={!shown} />');
  });
  test("every action looks like a button, each with its colour tile (M71: the mock's raised pills, no blue main one)", () => {
    expect(view).toContain('kind="secondary" size="sm" className="ip-act"');
    expect(view).toContain('<Tile colour={look.colour} icon={look.icon} size="btn" />');
    expect(view).not.toContain('kind={i === 0 ? "secondary" : "quiet"}');
    expect(view).toContain("{quickLabel(id, m, now)}");
  });
  test("a proven result's second line is its proof, not the verdict said again (a failed one keeps its verdict)", () => {
    const f = finished();
    const v = receiptVerdict(f)!;
    const mini = miniReceipt(f, v);
    expect(mini.line).not.toBe(v.headline);
    expect(mini.line).toMatch(/^Check passed/);
    expect(S.panel.proofLine(2)).toBe("Check passed · 2 changes");
    expect(S.panel.proofLine(1)).toBe("Check passed · 1 change");
    expect(S.panel.proofLine(0)).toBe("Check passed");
  });
  test("the mark in the notch's row hides while the panel is open, except listening and looking (rule 5)", () => {
    for (const mark of ["dots", "arc", "amber", "tick", "red"] as const) {
      expect(rowMarkShown("peek", mark), mark).toBe(false);
      expect(rowMarkShown("wingsPeek", mark), mark).toBe(false);
      expect(rowMarkShown("wings", mark), mark).toBe(true);
    }
    for (const mark of ["bars", "look"] as const) for (const mode of ["rest", "wings", "peek", "wingsPeek"] as const) expect(rowMarkShown(mode, mark), `${mode} ${mark}`).toBe(true);
    expect(page).toContain("rowMarkShown(rowMode, w.mark) && <Mark");
  });
  test("what the panel shows is kept while it leaves, so its words fade instead of blinking out", () => {
    expect(latched(true, true, false)).toBe(false);
    expect(latched(true, false, false)).toBe(true);
    expect(latched<string | null>("a", false, null)).toBe("a");
    expect(page).toContain("briefRef.current = latched(briefRef.current, parts.panel, !shape.hover);");
    expect(page).toContain("brief={briefRef.current}");
    expect(page).toContain("hello={helloRef.current}");
  });
  test("the corner follows the shape's height on the same spring, never the mode", () => {
    expect(openness(32, 32, 88)).toBe(0);
    expect(openness(32 + 44, 32, 88)).toBe(0.5);
    expect(openness(32 + 88, 32, 88)).toBe(1);
    expect(openness(500, 32, 88)).toBe(1);
    expect(openness(10, 32, 88)).toBe(0);
    expect(openness(80, 32, 0)).toBe(0);
    const css = read("./style.css");
    expect(css).not.toContain('.island.notch[data-mode="peek"], .island.notch[data-mode="wingsPeek"] { --r: 22px; }');
    expect(css).toContain("@property --open { syntax: \"<number>\"; inherits: false; initial-value: 0; }");
    expect(page).toContain('el.style.setProperty("--open", String(openness(s.y.x, look.current.row, look.current.panel)));');
  });
  test("the island holds the panel's black shape while Home grows from it, so neither window shows the bare notch between", () => {
    expect(page).toContain("const held = homeUp && fromPanel ? heldBox.current : null;");
    expect(page).toContain("const fromPanel = panelNow || tucking === \"peek\" || tucking === \"wingsPeek\";");
    // Its words stay until Home's shape covers them, then fade (never cut by the island hiding).
    expect(page).toContain("const panelShown = parts.panel || held !== null;");
    expect(page).toContain("shown={panelShown}");
  });
});

describe("M70 step 5: the words say what the panel does (a fact and buttons, no greeting)", () => {
  test("Settings help never promises a greeting when you point at the notch", () => {
    const help = [S.set["island.pointOpens"].help, S.set["island.hello"].help, S.set["you.name"].help, S.short["you.name"], S.short["island.pointOpens"]];
    for (const h of help) expect(h).not.toMatch(/your greeting|already greets you|call you when you point/i);
    // The panel: one fact and a few buttons.
    expect(S.set["island.pointOpens"].help).toMatch(/one thing worth knowing and a few buttons/);
    // The name is used only by the hello, and Settings says so.
    expect(S.set["you.name"].help).toMatch(/only by the hello/i);
    expect(S.set["island.hello"].help).not.toMatch(/Pointing at the notch already/);
  });
  test("copy nothing reads is gone", () => {
    expect((S.notch as Record<string, unknown>).label).toBeUndefined();
  });
  test("the decision records say the step 4 result: the fact first, no greeting", () => {
    const f28 = read("../../docs/decisions/F28-one-product-status-first-quiet-by-choice.md");
    const f18 = read("../../docs/decisions/F18-notch-home-companion-anywhere.md");
    for (const d of [f28, f18]) expect(d).not.toMatch(/holds a greeting|greeting lives there|a greeting, one fact/);
    for (const d of [f28, f18]) expect(d).toMatch(/fact first, no greeting/);
  });
});

describe("M70 step 5: Home grown from the panel, the band the shell hit tests (island.rs shape_rects_from)", () => {
  test("opening from the panel, the band is the panel's 400 points centred on the notch, in the row", () => {
    const g = geomFrom({ kind: "notch", pw: 736, ph: 600, cx: 368, rest: { w: 185, h: 32 }, band: { w: 265, h: 32 }, body: { w: 688, minH: 480, maxH: 480, top: 32 } })!;
    expect(shapeRects(g, { phase: "opening", hover: false, bodyH: 480, from: { w: 400, h: 120 } }).band).toEqual([368 - 200, 0, 400, 32]);
    // Open, it eases back to the notch and its wings; the shell keeps the panel's band only for FROM_BAND_MS.
    expect(shapeRects(g, { phase: "open", hover: false, bodyH: 480, from: { w: 400, h: 120 } }).band[2]).toBe(265);
    const rs = read("../src-tauri/src/island.rs");
    expect(rs).toContain("pub fn shape_rects_from(");
    expect(rs).toContain("pub const FROM_BAND_MS: u64 = 780;");
  });
});

// 5 Nov 2026, the founder's screenshot on a black wallpaper: the panel's words looked loose (no edge on black), and a long
// project name cut the fact ("Squibby practice signup page: not chec..."). The project moves to the small line, the fact
// keeps its own words, and the open shape draws a faint edge that grows with it.
describe("the fact never loses its words to a long project name", () => {
  test("a fact about the project moves the name up beside the greeting", () => {
    expect(factLines("Hey Rishabh", "my-shop: 3 changes to review", "/Users/a/my-shop")).toEqual({ top: "Hey Rishabh · my-shop", fact: "3 changes to review" });
    expect(factLines("Hi there", "Squibby practice signup page: not checked yet", "/p/Squibby practice signup page")).toEqual({ top: "Hi there · Squibby practice signup page", fact: "Not checked yet" });
  });
  test("a fact not about the project, or no project, stays as it is", () => {
    expect(factLines("Hi there", S.notch.ready, "/p/my-shop")).toEqual({ top: "Hi there", fact: S.notch.ready });
    expect(factLines("Hi there", "my-shop works", "/p/my-shop")).toEqual({ top: "Hi there", fact: "my-shop works" });
    expect(factLines("Hi there", "x: y", "")).toEqual({ top: "Hi there", fact: "x: y" });
  });
  test("the panel uses it, and the open shape has an edge from the notch tokens that grows with the shape", () => {
    const panel = read("./islandPanel.tsx");
    expect(panel).toContain("factLines(greet, fact, project)");
    const css = read("./ui/notch.css");
    expect(css).toMatch(/\.island-shape \{[^}]*box-shadow:[^}]*var\(--notch-edge-open\)[^}]*var\(--open\)/);
    expect(read("./ui/tokens.css")).toContain("--notch-edge-open:");
  });
});

// M71, black with colour: the fact's dot and each button's tile take the same meaning colours as Home (meaning.ts).
import { factColour, quickFactKind, quickLook, QUICK_LOOK } from "./notchQuick.ts";
describe("M71: the hover panel's colours mean what Home's mean", () => {
  test("the fact's dot: changes orange, a problem red, a passed check green, not checked grey", () => {
    expect(factColour("changes")).toBe("orange");
    expect(factColour("failing")).toBe("red");
    expect(factColour("passed")).toBe("green");
    expect(factColour("notChecked")).toBe("grey");
    expect(factColour("working")).toBe("blue");
    expect(quickFactKind(m({ history: [row({ proof: "failed", status: "error" })] }), NOW)).toBe("failing");
  });
  test("each button's tile: Ask blue, Review changes orange, Check green; Check after a failed check is red", () => {
    expect(QUICK_LOOK.ask.colour).toBe("blue");
    expect(QUICK_LOOK.review.colour).toBe("orange");
    expect(QUICK_LOOK.check.colour).toBe("green");
    expect(quickLook("check", m({ history: [row({ proof: "failed", status: "error" })] }), NOW).colour).toBe("red");
  });
});
