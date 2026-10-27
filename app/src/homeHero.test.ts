// Home as one black panel under the notch (27 Oct 2026): black in both Mac themes, no side list, the job in big words, one
// ask box with three quick actions, round buttons at the top (Settings in its own window), and Undo and Stop only when they
// can act. The logic is plain code (homeHero.ts); the page is read as text, since it needs a real Mac to run.
import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { initial, reduce, type Model } from "./model.ts";
import { HOME_PLACES, heroWords, openSettings, placeAfter, stopCan, undoCan } from "./homeHero.ts";
import { S } from "./strings.ts";

const read = (p: string) => readFileSync(new URL(p, import.meta.url), "utf8");
const card = read("./card.tsx"), css = read("./style.css"), html = read("../card.html");
const ev = (o: Record<string, unknown>) => ({ v: 1, id: "e", ...o });
const run = (events: Record<string, unknown>[], from: Model = initial()) => events.reduce<Model>((m, e) => reduce(m, e as never), from);
const task = (label = "add a sign up page") => [ev({ type: "checkpoint.created", agent: "a", checkpoint: "cp_1", label: `Before: ${label}`, files: 3, skipped: [] }), ev({ type: "agent.state", agent: "a", state: "working" })];
const approval = ev({ type: "approval.request", approval: "ap_1", agent: "a", checkpoint: "cp_1", toolUseId: "t", risk: "git", title: "git push sends your work to a remote", expiresAt: "2999-01-01T00:00:00Z" });
const receipt = (o: Record<string, unknown> = {}) => ev({ type: "receipt", agent: "a", checkpoint: "cp_1", changed: [{ file: "signup.js", kind: "modified" }], commands: 2, notUndoable: [], usdEstimate: 0.05, proof: "passed", ...o });
const done = (o: Record<string, unknown> = {}) => run([...task(), receipt(o), ev({ type: "agent.state", agent: "a", state: "done" })]);
const P = "/Users/me/test-shop";

describe("Home is black in both Mac themes", () => {
  const home = /:root\.home-page \{([^}]*)\}/.exec(css)?.[1] ?? "";
  test("its page carries the mark, on the root and the body", () => {
    expect(html).toContain('<html lang="en" class="home-page">');
    expect(html).toContain('<body class="home-page" data-label="card">');
  });
  test("one token set for Home, black with white words, that no Mac theme changes", () => {
    expect(home).toContain("--bg: #000000");
    expect(home).toContain("--fg: #f5f5f7");
    // Stronger than the theme rules (a class on the root), and never inside a theme's own rule.
    for (const m of css.matchAll(/@media \(prefers-color-scheme: (light|dark)\) \{([^\n]*)/g)) expect(m[2], m[0]).not.toContain(".home-page");
  });
  test("the window around the shape paints nothing; the shape is black, flush at the top and round at the bottom", () => {
    expect(css).toMatch(/html\.home-page, body\.home-page \{ background: transparent;/);
    const shape = /\n\.home \{([^}]*)\}/.exec(css)?.[1] ?? "";
    expect(shape).toContain("background: var(--bg)");
    expect(shape).toMatch(/border-radius: 0 0 var\(--r-xl\) var\(--r-xl\)/);
    expect(css).toContain("--r-xl: 30px;");
  });
});

describe("no side list, no title bar: round buttons at the top", () => {
  test("the side list, its places and the tab list are gone from Home", () => {
    for (const gone of ['className="side"', "has-side", 'role="tablist"', 'aria-orientation="vertical"', "side-list", 'className="brand"']) expect(card, gone).not.toContain(gone);
  });
  test("What I did, Learn and Memory open inside Home; Settings is not one of them", () => {
    expect([...HOME_PLACES]).toEqual(["did", "learn", "memory"]);
    expect(card).toContain("HOME_PLACES.map((t) =>");
    // Each is a round button with its drawing, its name for VoiceOver, and its old id (focus.ts goes back to it).
    expect(card).toMatch(/<button key=\{t\} id=\{tabId\(t\)\} className="icon-btn"[^>]*aria-label=\{tabName\(t\)\}[^>]*aria-pressed=\{t === home\.tab\}/);
    // A view open inside Home has a back arrow to Now.
    expect(card).toMatch(/className="back"[^>]*onClick=\{\(\) => pickTab\("now"\)\}/);
  });
  test("pressing the open one again goes back to Now", () => {
    expect(placeAfter("did", "did")).toBe("now");
    expect(placeAfter("now", "learn")).toBe("learn");
    expect(placeAfter("learn", "memory")).toBe("memory");
  });
  test("a place that waits for the person still shows its dot, and says so to VoiceOver", () => {
    const places = card.slice(card.indexOf("HOME_PLACES.map((t) =>"), card.indexOf("HOME_PLACES.map((t) =>") + 900);
    expect(places).toContain('<span className="tabdot" aria-hidden="true" />');
    expect(places).toContain("S.homeTabWaiting");
  });
});

describe("the gear opens Settings in its own window, with a way back if it cannot", () => {
  test("it asks for the window", async () => {
    const asked: string[] = []; let inHome = 0;
    await openSettings((c) => { asked.push(c); return Promise.resolve(); }, () => { inHome++; });
    expect(asked).toEqual(["open_settings_window"]);
    expect(inHome).toBe(0);
  });
  test("if the app has no such window yet, Settings opens inside Home", async () => {
    let inHome = 0;
    await openSettings(() => Promise.reject(new Error("unknown command")), () => { inHome++; });
    expect(inHome).toBe(1);
  });
  test("the page's gear uses it, with Settings inside Home as the fallback, and is named Settings", () => {
    expect(card).toContain('openSettings(invoke, () => pickTab("settings"))');
    expect(card).toMatch(/aria-label=\{tabName\("settings"\)\}[^>]*onClick=\{gear\}/);
  });
});

describe("the top says the job in big words", () => {
  test("idle: an open question, never Ready (the founder, 27 Oct 2026), and the folder it works in", () => {
    expect(heroWords(initial(), P)).toEqual({ headline: S.look.idleHeadline, line: S.look.inFolder("test-shop"), tone: "idle" });
    expect(heroWords(initial(), P).headline).toBe("What are we fixing?");
    expect(heroWords(initial(), P).headline).not.toMatch(/ready/i);
    expect(heroWords(initial(), "").line).toBe(S.look.noFolder);
  });
  test("working: what was asked, and what it cost so far", () => {
    const h = heroWords(run(task("add a sign up page")), P);
    expect(h.headline).toBe("add a sign up page");
    expect(h.tone).toBe("working");
    expect(h.line, "never \"free so far so far\"").toBe(S.look.workingFree);
  });
  test("a question to answer comes first, and points below", () => {
    const h = heroWords(run([...task(), approval]), P);
    expect(h).toEqual({ headline: S.needsYouTitle, line: S.look.below, tone: "needsYou" });
  });
  test("done: what was asked, whether it was checked, and the cost", () => {
    expect(heroWords(done(), P)).toEqual({ headline: "add a sign up page", line: S.look.doneLine(S.proven, "5 cents"), tone: "done" });
    expect(heroWords(done({ proof: "failed" }), P).tone).toBe("notDone");
  });
  test("an answer from Look it up: its name, and that it is just below", () => {
    const m = run([ev({ type: "research.done", agent: "a", title: "Taking payments", answer: "Use a hosted checkout page.", notes: [] })]);
    expect(heroWords(m, P)).toEqual({ headline: "Taking payments", line: S.look.answerBelow, tone: "done" });
  });
  test("plain words only: no mood, no praise (rule 16)", () => {
    const all = Object.values(S.look).filter((v) => typeof v === "string").join(" ") + S.look.working("1 cent") + S.look.doneLine("x", "y") + S.look.inFolder("a");
    expect(all).not.toMatch(/!|great|awesome|yay|love|happy|friend|streak|proud|nice/i);
  });
  test("the headline is Home's heading, large, with one short line under it", () => {
    expect(card).toContain('<h1 id={home.tab === "now" ? "home-title" : undefined} className="headline">{hero.headline}</h1>');
    expect(card).toContain('<p className="subline">{hero.line}</p>');
    const h = /\.headline \{([^}]*)\}/.exec(css)?.[1] ?? "";
    expect(h).toMatch(/font-size: var\(--t-display\)/);
    expect(css).toContain("--t-display: calc(22rem / 14);");
  });
});

describe("Undo and Stop show only when they can act", () => {
  test("Undo: only after a task that changed files, with a folder, and nothing undone yet", () => {
    expect(undoCan(initial(), P)).toBe(false);
    expect(undoCan(run(task()), P)).toBe(false);
    expect(undoCan(done(), P)).toBe(true);
    expect(undoCan(done(), "")).toBe(false);
    expect(undoCan(done({ changed: [] }), P)).toBe(false);
    expect(undoCan(reduce(done(), { type: "ui.undoAsked", checkpoint: "cp_1" } as never), P)).toBe(false);
  });
  test("Stop: only while something works, never for a finished task", () => {
    expect(stopCan(initial())).toBe(false);
    expect(stopCan(run(task()))).toBe(true);
    expect(stopCan(done())).toBe(false);
  });
  test("the page draws each pill only then, keeps Undo's id and name, and names the key that stops everything", () => {
    const pills = card.slice(card.indexOf('<div className="strip"'), card.indexOf("</div>", card.indexOf("{keyHint(\"stop\"")));
    expect(pills).toContain("{undoCan(m, project) && (");
    expect(pills).toContain("id={undoId}");
    expect(pills).toContain("aria-label={S.undo}");
    expect(pills).toContain('dispatch({ type: "ui.undoAsked", checkpoint: m.receipt.checkpoint })');
    expect(pills).toContain("{stopCan(m) && (");
    expect(pills).toContain("onClick={() => void send(stopAgent())}");
    expect(pills).toContain('keyHint("stop", S.look.stopKeys, keys)');
    expect(card.match(/id=\{undoId\}/g)?.length).toBe(1);
  });
});

describe("one ask box and three quick actions that do what the existing paths do", () => {
  const chips = card.slice(card.indexOf('<div className="chips quick"'), card.indexOf("</div>", card.indexOf('<div className="chips quick"')));
  test("the ask box keeps its words, its id and its keys; its one filled button starts", () => {
    expect(card).toContain("placeholder={S.look.ask} aria-label={S.look.ask}");
    expect(card).toContain('<button className="btn primary send" type="button" aria-label={S.look.send} title={S.look.send} onClick={submit}>');
  });
  test("Find the problem runs the same check as its key, in the project", () => {
    expect(chips).toContain("onClick={findFromHome}");
    expect(chips).toContain('buttonShown("findProblem")');
    const f = card.slice(card.indexOf("const findFromHome = "), card.indexOf("\n", card.indexOf("const findFromHome = ")));
    expect(f).toContain("latest.current.find(null)");
    // The key's listener and the chip share one path.
    expect(card).toContain("latest.current.find(e.payload)");
  });
  test("Explain an error explains the words in the box, or says how (nodeadbuttons.test.ts)", () => {
    expect(chips).toContain('toolOn("errorHelp")');
    expect(chips).toContain("onClick={explainFromBox}");
  });
  test("Show me is the Show me button that was behind More: the question in the box, or how to ask one", () => {
    expect(chips).toContain('buttonShown("showMe")');
    expect(chips).toContain('sentFromBox("showme"); showMe(q, q, []);');
    expect(chips).toContain("pressed(); needWords(S.showMeHint);");
  });
  test("each chip is a drawing and a word", () => {
    for (const w of ["S.look.chipFind", "S.look.chipExplain", "S.look.chipShowMe"]) expect(chips, w).toContain(w);
    expect((chips.match(/<Icon name=/g) ?? []).length).toBeGreaterThanOrEqual(3);
  });
});

describe("it springs open from the notch, and not at all with less motion", () => {
  test("a short spring from the top centre, played again at each opening", () => {
    const spring = /@keyframes home-spring \{([^\n]*)\}/.exec(css)?.[1] ?? "";
    expect(spring).toContain("transform");
    expect(css).toMatch(/\.home\.springing \{ animation: home-spring var\(--dur-4\) var\(--ease-spring\) both; \}/);
    expect(css).toContain("--dur-4: 400ms;");
    // It unrolls: a squashed scale and a clip that opens from the top.
    expect(spring).toContain("scale(0.96, 0.6)"); expect(spring).toContain("clip-path: inset(0 0 100% 0)");
    expect(css).toMatch(/\.home \{[^}]*transform-origin: top center/);
    expect(card).toContain('el.classList.remove("springing"); void el.offsetWidth; el.classList.add("springing");');
  });
  test("reduced motion and Less motion stop it (the rules that stop every animation in the file)", () => {
    expect(css).toContain("@media (prefers-reduced-motion: reduce) { *, *::before, *::after { animation: none !important; transition: none !important; } }");
    expect(css).toContain(":root[data-less-motion] *, :root[data-less-motion] *::before, :root[data-less-motion] *::after { animation: none !important; transition: none !important; }");
  });
  test("the character in Home is Flowflow, with the dock's own pose for each state", () => {
    const ch = read("./homeCharacter.tsx");
    expect(ch).toContain("useFlow({ pose, state, calm: reduced, off: live })");
    // With Draw live on, the founder's live water, loaded only then; the pictures come back if it cannot start.
    expect(ch).toContain('useSetting("character.live") === true');
    expect(ch).toContain('import("./flowflow/view.tsx")');
    expect(ch).not.toMatch(/^import .* from "\.\/flowflow\//m);
    expect(ch).toContain("onFallback={() => setLiveFailed(true)}");
    expect(ch).toContain("poseFor(state");
    expect(ch).toContain("visualState(m)");
    expect(ch).toContain("watchReducedMotion(setReduced)");
    // A finished task: the water splashes, only with reactions on and motion allowed.
    expect(ch).toContain("playful(reactionsOn(), reducedMotion())");
    expect(ch).not.toContain("skins.ts");
    expect(card).toContain("<HomeCharacter m={m} />");
  });
});
