// Home as one panel under the notch, status first in one column (F28, the overhaul spec 4.1 and 4.2): Flowflow living on
// its water at the top (the founder, 31 Oct), the project's status from its last check, one main button that status
// picks, the ask field, the recent fixes, quiet buttons with words at the top, and Undo and Stop only when they can act.
// The logic is plain code (homeHero.ts); the page is read as text, since it needs a real Mac to run.
import { describe, expect, test } from "bun:test";
import { ALL_CSS, TOKENS_CSS } from "./ui/cssFiles.ts";
import { readFileSync } from "node:fs";
import { initial, reduce, type HistoryItem, type Model } from "./model.ts";
import { agoWords, barPlaces, bringBackCan, clockWords, heroWords, homeMode, homeStatus, jobStep, lastResult, mainFor, notchStatusLine, placeAfter, recentOf, stopCan, undoCan, type HomeMode } from "./homeHero.ts";
import { arrivalFrom } from "./home.ts";
import { S } from "./strings.ts";

const read = (p: string) => readFileSync(new URL(p, import.meta.url), "utf8");
const card = read("./card.tsx"), css = ALL_CSS(), tokens = TOKENS_CSS(), html = read("../card.html");
const ev = (o: Record<string, unknown>) => ({ v: 1, id: "e", ...o });
const run = (events: Record<string, unknown>[], from: Model = initial()) => events.reduce<Model>((m, e) => reduce(m, e as never), from);
const task = (label = "add a sign up page") => [ev({ type: "checkpoint.created", agent: "a", checkpoint: "cp_1", label: `Before: ${label}`, files: 3, skipped: [] }), ev({ type: "agent.state", agent: "a", state: "working" })];
const approval = ev({ type: "approval.request", approval: "ap_1", agent: "a", checkpoint: "cp_1", toolUseId: "t", risk: "git", title: "git push sends your work to a remote", expiresAt: "2999-01-01T00:00:00Z" });
const receipt = (o: Record<string, unknown> = {}) => ev({ type: "receipt", agent: "a", checkpoint: "cp_1", changed: [{ file: "signup.js", kind: "modified" }], commands: 2, notUndoable: [], usdEstimate: 0.05, proof: "passed", ...o });
const done = (o: Record<string, unknown> = {}) => run([...task(), receipt(o), ev({ type: "agent.state", agent: "a", state: "done" })]);
const P = "/Users/me/test-shop";

describe("Home is Night in both Mac themes (Paper only when chosen)", () => {
  const night = /\n:root \{([^}]*)\}/.exec(tokens)?.[1] ?? "";
  test("its page carries the mark, on the root and the body", () => {
    expect(html).toContain('<html lang="en" class="home-page">');
    expect(html).toContain('<body class="home-page" data-label="card">');
  });
  test("one token set, Night, near black with white words, that no Mac theme changes", () => {
    // The overhaul spec, 2.1: one token per role in ui/tokens.css; the Mac's light or dark has no rule at all.
    // M51 (the founder, 1 Nov 2026): the graphite look, a neutral #111111 page with #FAFAFA words.
    expect(night).toMatch(/--bg: #111111;/);
    expect(night).toMatch(/--fg: #FAFAFA;/);
    expect(css).not.toMatch(/prefers-color-scheme/);
    expect(css).not.toMatch(/:root\.home-page \{/);
  });
  test("the window around the shape paints nothing; the shape is black, flush at the top and round at the bottom", () => {
    expect(css).toMatch(/html\.home-page, body\.home-page \{ background: transparent;/);
    const shape = /\n\.home \{([^}]*)\}/.exec(css)?.[1] ?? "";
    expect(shape).toContain("background: var(--bg)");
    expect(shape).toMatch(/border-radius: 0 0 var\(--r-xl\) var\(--r-xl\)/);
    expect(tokens).toContain("--r-xl: 24px;");   // M51: the open notch's own bottom corner
  });
});

describe("no side list, no title bar: quiet buttons with words at the top (F28, 4.1)", () => {
  test("the side list, its places and the tab list are gone from Home", () => {
    for (const gone of ['className="side"', "has-side", 'role="tablist"', 'aria-orientation="vertical"', "side-list", 'className="brand"', 'className="home-side"']) expect(card, gone).not.toContain(gone);
  });
  test("Learn shows only until the first practice is done (or while it waits for the person, or is open); then History, Memory, Settings", () => {
    expect(barPlaces({ practiceDone: false })).toEqual(["learn", "did", "memory", "settings"]);
    expect(barPlaces({ practiceDone: true })).toEqual(["did", "memory", "settings"]);
    expect(barPlaces({ practiceDone: true, learnWaits: true })).toEqual(["learn", "did", "memory", "settings"]);
    expect(barPlaces({ practiceDone: true, learnOpen: true })).toEqual(["learn", "did", "memory", "settings"]);
    expect(barPlaces({ practiceDone: false, learnOn: false })).toEqual(["did", "memory", "settings"]);
    expect([S.home.places.did, S.home.places.memory, S.home.places.settings]).toEqual(["History", "Memory", "Settings"]);
  });
  test("each place is a quiet Button with its word, its old id (focus.ts goes back to it) and whether it is open", () => {
    expect(card).toContain("places.map((t) =>");
    expect(card).toMatch(/<Button key=\{t\} id=\{tabId\(t\)\} kind="quiet" size="sm" pressed=\{t === home\.tab\}/);
    expect(card).toContain("{S.home.places[t]}");
    // A view open inside Home has a back arrow to Now.
    expect(card).toMatch(/className="back"[^>]*onClick=\{\(\) => pickTab\("now"\)\}/);
  });
  test("pressing the open one again goes back to Now", () => {
    expect(placeAfter("did", "did")).toBe("now");
    expect(placeAfter("now", "learn")).toBe("learn");
    expect(placeAfter("learn", "memory")).toBe("memory");
  });
  test("a place that waits for the person still shows its dot, and says so to VoiceOver", () => {
    const places = card.slice(card.indexOf("places.map((t) =>"), card.indexOf("places.map((t) =>") + 900);
    expect(places).toContain('<span className="tabdot" aria-hidden="true" />');
    expect(places).toContain("S.homeTabWaiting");
  });
  test("the project's name is a menu: change the folder, open one from a link, or one used before (no buttons at the foot)", () => {
    expect(card).toContain("<Menu id={linkId} value=\"\" size=\"sm\" label={S.folderLabel}");
    expect(card).toContain('const folderOptions = [{ id: "change", label: S.home.changeFolder }, { id: "link", label: S.home.openLink },');
    expect(card).toContain('if (id === "change") pickFolder(); else if (id === "link") setLinkOpen(true); else if (id.startsWith("r:")) useFolder(id.slice(2));');
    expect(card).not.toContain("{S.folderChange}</button>");
    expect(card).not.toContain("<select aria-label={S.folderRecent}");
  });
});

describe("the gear opens Settings inside Home, the one Settings (F28, T17: the separate window is retired)", () => {
  test("nothing asks for a Settings window any more", () => {
    expect(card).not.toContain("open_settings_window");
    expect(card).not.toContain("openSettings(invoke");
  });
  test("the page's gear opens Settings inside Home (M20: never a separate window), and is named Settings", () => {
    expect(card).toContain('const gear = () => pickTab("settings");');
    expect(card).not.toContain("openSettings(invoke");
    expect(card).toContain('pickTab(t.place === "settings" ? "settings" : "learn")');
    expect(card).toContain('onClick={t === "settings" ? gear : () => pickTab(placeAfter(home.tab, t))}');
  });
});

describe("the top says the job in big words", () => {
  test("idle: an open question, never Ready (the founder, 27 Oct 2026), and the folder it works in", () => {
    expect(heroWords(initial(), P)).toEqual({ headline: S.look.idleHeadline, line: S.look.inFolder("test-shop"), tone: "idle" });
    expect(heroWords(initial(), P).headline).toBe("What are we fixing?");
    expect(heroWords(initial(), P).headline).not.toMatch(/ready/i);
    expect(heroWords(initial(), "").line).toBe(S.look.noFolder);
  });
  test("working: what was asked, as an order with its first letter capital (4.2), and what it cost so far", () => {
    const h = heroWords(run(task("add a sign up page")), P);
    expect(h.headline).toBe("Add a sign up page");
    expect(h.tone).toBe("working");
    expect(h.line, "never \"free so far so far\"").toBe(S.look.workingFree);
  });
  test("a question to answer comes first, and points below", () => {
    const h = heroWords(run([...task(), approval]), P);
    expect(h).toEqual({ headline: S.needsYouTitle, line: S.look.below, tone: "needsYou" });
  });
  test("done: whether it was proven in big words, then what was asked and the cost (M45)", () => {
    expect(heroWords(done(), P)).toEqual({ headline: S.verdict.proven, line: S.look.doneLine("Add a sign up page", "5 cents"), tone: "done" });
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
    // heroShown: the hero's own words, or what blocks Home or the changes to review (the audit, items 11 and 12).
    expect(card).toContain('<h1 id={home.tab === "now" ? "home-title" : undefined} className="headline"><Said text={heroShown.headline} friendly={heroShown.friendly?.headline} /></h1>');
    // M55: while a job costs something, the line counts its cost up to the new number (smoothMotion.ts CountUp).
    expect(card).toContain('<p className="subline">{heroShown.count != null ? <CountUp value={heroShown.count} words={workingLine} /> : <Said text={heroShown.line} friendly={heroShown.friendly?.line} />}</p>');
    const h = /\.headline \{([^}]*)\}/.exec(css)?.[1] ?? "";
    expect(h).toMatch(/font-size: var\(--t-display\)/);
    expect(tokens).toContain("--t-display: calc(22rem / 14);");
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
  test("the page draws Undo in the result card and Stop in the working card only then, and names the key that stops everything", () => {
    const result = card.slice(card.indexOf('<section className="panel receipt"'), card.indexOf("</section>", card.indexOf('<section className="panel receipt"')));
    expect(result).toContain('{undoCan(m, project) && (\n            <div className="row result-actions">\n              <Button id={undoId}');
    expect(result).toContain('dispatch({ type: "ui.undoAsked", checkpoint: m.receipt.checkpoint })');
    const job = card.slice(card.indexOf('<section className="panel job"'), card.indexOf("</section>", card.indexOf('<section className="panel job"')));
    expect(job).toContain("{stopCan(m) && <Button");
    expect(job).toContain("onClick={() => void send(stopAgent())}");
    expect(job).toContain('keyHint("stop", S.look.stopKeys, keys)');
    expect(card.match(/id=\{undoId\}/g)?.length).toBe(1);
  });
});

describe("one ask field, and the main button does what the existing paths do", () => {
  const more = card.slice(card.indexOf('<details className="more">'), card.indexOf("</details>", card.indexOf('<details className="more">')));
  test("the ask field keeps its id and its keys; its placeholder is the spec's; Start is a quiet drawing, never a second silver", () => {
    expect(card).toContain("placeholder={S.home.ask} aria-label={S.home.ask}");
    expect(S.home.ask).toBe("Or tell me what's wrong");
    expect(card).toContain('<Button kind="icon" className="send" label={S.look.send} title={S.look.send} disabled={working} onClick={submit}>');
    expect(card).toMatch(/<textarea ref=\{box\} id=\{askId\}/);
  });
  test("Fix it and Check my project run the same check as the Fix it key, in the project; Check before going live runs the ship check", () => {
    // Fix it fixes a known problem by the point card's own route; only Check my project runs the check (the audit, item 1).
    expect(card).toContain('    if (a === "shipCheck") { shipIt(); return; }\n    if (a === "folder") { pickFolder(); return; }');
    expect(card).toContain('if (route === "check") findFromHome(); else fixKnown();');
    // Pro (the payments spec, section 3): only at the free fix limit, or on Ship with a plan that does not cover it (never
    // with payments off, plan.test.ts), does the main button show the limit card instead.
    const doMain = card.slice(card.indexOf("const doMain = (a: MainAct) => {"), card.indexOf("\n  };", card.indexOf("const doMain = (a: MainAct) => {")));
    // M55, adapts to you: and Carry on (a task left half way) and Explain an error (a terminal in front), two more.
    expect(doMain.match(/return; \}/g)?.length).toBe(5);
    expect(doMain).toContain('if (a === "fix" && atFreeLimit(pro, usage)) { dispatch({ type: "ui.proLimit", reason: "fixes", resetsOn: usage?.resetsOn }); return; }');
    // Every way into the check goes through shipIt; it is free (must fix 20, F25), going online asks the plan (plan.test.ts).
    expect(card).toContain("const shipIt = (o: { runChecks?: boolean; confirm?: string[] } = {}) => { if (!project) return;");
    const f = card.slice(card.indexOf("const findFromHome = "), card.indexOf("\n", card.indexOf("const findFromHome = ")));
    expect(f).toContain("latest.current.find(null)");
    expect(card).toContain("latest.current.find(e.payload)");
  });
  test("every other way to ask stays, behind one quiet line: Find the problem, Is it safe, Explain, Show me and the rest", () => {
    // M55, adapts to you: each way notes a real press (wayPress) before it does what it always did.
    expect(more).toContain('onClick={wayPress("find", findFromHome)}');
    expect(more).toContain('buttonShown("findProblem")');
    expect(more).toContain('toolOn("errorHelp")');
    expect(more).toContain('onClick={wayPress("explain", explainFromBox)}');
    expect(more).toContain('buttonShown("showMe")');
    expect(more).toContain('sentFromBox("showme"); showMe(q, q, []);');
    expect(more).toContain("pressed(); needWords(S.showMeHint);");
    for (const w of ["S.look.chipFind", "S.look.chipSafe", "S.look.chipExplain", "S.look.chipShowMe"]) expect(more, w).toContain(w);
  });
});

describe("it springs open from the notch, and not at all with less motion", () => {
  test("a short spring from the top centre, played again at each opening", () => {
    const spring = /@keyframes home-spring \{([^\n]*)\}/.exec(css)?.[1] ?? "";
    expect(spring).toContain("transform");
    // M25: it opens many times a day, so 240 ms on the strong ease out, no bounce. M55: one motion, on the tokens.
    expect(css).toMatch(/\.home\.springing \{ animation: home-spring var\(--dur-open\) var\(--ease-enter\) both; \}/);
    expect(tokens).toContain("--dur-open: 240ms;");
    expect(tokens).toContain("--ease-enter: cubic-bezier(.23, 1, .32, 1);");
    // It drops: a little above, slightly squashed, and grows down into place. Only transform and opacity, so nothing
    // lays out or paints again while it opens (the clip it had before was painted on every frame).
    expect(spring).toContain("scale(0.98, 0.94)"); expect(spring).toContain("translateY(");
    expect(spring).not.toContain("clip-path");
    expect(css).toMatch(/\.home \{[^}]*transform-origin: top center/);
    expect(card).toContain('el.classList.remove("springing"); if (!instant) { void el.offsetWidth; el.classList.add("springing"); }');
    // M26: opened by a keyboard shortcut it is simply there (the shell says so, island.rs animates_open).
    expect(card).toContain('const instant = !!(e.payload as { instant?: boolean } | null)?.instant;');
  });
  test("reduced motion and Less motion stop it (the rules that stop every animation in the file)", () => {
    expect(css).toContain("@media (prefers-reduced-motion: reduce) { *, *::before, *::after { animation: none !important; transition: none !important; } }");
    expect(css).toContain(":root[data-less-motion] *, :root[data-less-motion] *::before, :root[data-less-motion] *::after { animation: none !important; transition: none !important; }");
  });
  test("the character in Home is Flowflow, with the dock's own pose for each state", () => {
    const ch = read("./homeCharacter.tsx");
    // M65: no live water runs under the faceless orb either.
    expect(ch).toContain("useFlow({ pose, state, calm: reduced, off: live || orb })");
    // With Draw live on, the founder's live water, loaded only then; the pictures come back if it cannot start.
    expect(ch).toContain('useSetting("character.live") === true');
    expect(ch).toContain('import("./flowflow/view.tsx")');
    expect(ch).not.toMatch(/^import .* from "\.\/flowflow\//m);
    expect(ch).toContain("onFallback={() => setLiveFailed(true)}");
    expect(ch).toContain("poseFor(state");
    // The dock's state, except that a finished task that is not proven is drawn at rest (M45, lookState).
    expect(ch).toContain("lookState(m)");
    expect(ch).toContain("watchReducedMotion(setReduced)");
    // A finished task: the water splashes, only with reactions on and motion allowed.
    expect(ch).toContain("playful(reactionsOn(), reducedMotion())");
    expect(ch).not.toContain("skins.ts");
    // The founder, 31 Oct: Flowflow lives on its water at the top of Now again, seen (never hidden), and it rests (one still
    // frame, no loop) while Home is closed or another place is open.
    // Its error pose while something blocks every job (the audit, item 12).
    // M55 (the character reacts): it also gets the ask box, and the review card while changes wait (characterReacts.test.ts).
    expect(card).toContain('<div className="ch-char"><HomeCharacter m={m} as={blocker && blocker !== "claudeGetting" ? "error" : undefined} rest={!homeOpen || home.tab !== "now"} askId={askId}');
    expect(card).toContain('<div className="ch-water"><Waterline under /></div>');
    expect(ch).toContain("const resting = useRest() || !!rest;");
    expect(css).not.toContain(".hero .home-char { display: none; }");
    expect(ch).toContain("liveliness={mode} resting={resting}");
  });
});

describe("M45: Home's big words tell the truth", () => {
  const restored = (checkpoint = "cp_1", safety = "cp_2") => ev({ type: "checkpoint.restored", checkpoint, safety, recovered: [], largeLeftAlone: [], leftAlone: [] });
  test("after Undo the hero never says proven", () => {
    const m = run([ev({ type: "ui.undoAsked", checkpoint: "cp_1" }), ev({ type: "ui.undoSent" }), restored()], done());
    const h = heroWords(m, P);
    expect(h.tone).not.toBe("done");
    expect(h.headline).toBe(S.verdict.undone);
    expect(h.detail).toBe(S.verdict.undoneFix);
    expect(JSON.stringify(h)).not.toMatch(/proven/i);
    expect(undoCan(m, P)).toBe(false);
  });
  test("a proven fix: the verdict in big words, then what it was and what it cost", () => {
    expect(heroWords(done(), P)).toEqual({ headline: S.verdict.proven, line: S.look.doneLine("Add a sign up page", "5 cents"), tone: "done" });
  });
  test("a stopped task's hero is plain", () => {
    const h = heroWords(done({ ended: "stopped", proof: "skipped" }), P);
    expect(h.tone).toBe("plain");
    expect(h.headline).toBe(S.verdict.stopped);
  });
  test("a failed check reads Not fixed yet", () => {
    const h = heroWords(done({ ended: "failed", endedWhy: "check_failed", proof: "failed" }), P);
    expect([h.headline, h.tone]).toEqual([S.verdict.failed, "notDone"]);
  });
  test("a partial hero says some checks could not run, never a list that names the wrong check", () => {
    // M45 review: the ladder also skips harmless steps ("Nothing new to install."), so skipped steps are not the gaps. Until
    // the engine names its gap rungs, the line is the general one.
    const m = run([...task(), ev({ type: "proof.step", agent: "a", rung: "install", label: "Installing", status: "skipped", detail: "Nothing new to install." }),
      ev({ type: "proof.step", agent: "a", rung: "tests", label: "Running the tests", status: "passed", detail: "" }), ev({ type: "proof.step", agent: "a", rung: "browser", label: "Opening it in a browser", status: "skipped", detail: "No browser." }),
      receipt({ proof: "partial", ended: "done" }), ev({ type: "agent.state", agent: "a", state: "done" })]);
    const h = heroWords(m, P);
    expect(h.headline).toBe(S.verdict.partial);
    expect(h.detail).toBe(S.verdict.someCouldNotRun);
    expect(h.detail).not.toContain("install");
    expect(h.tone).toBe("partly");
  });
  test("zero cost says No cost", () => {
    const h = heroWords(done({ usdEstimate: 0 }), P);
    expect(h.line.endsWith(`· ${S.noCost}`)).toBe(true);
    expect(h.line).not.toContain("free so far");
  });
  test("Undo hides after a bisect undo", () => {
    const m: Model = { ...done(), undo: null, receipt: { ...done().receipt!, undone: true, undoSafety: "cp_9" } };
    expect(undoCan(m, P)).toBe(false);
    expect(bringBackCan(m, P)).toBe(true);
    expect(bringBackCan({ ...m, receipt: { ...m.receipt!, undoSafety: undefined } }, P)).toBe(false);
    expect(bringBackCan(m, "")).toBe(false);
  });
  test("the page draws the verdict's line under the hero's line", () => {
    expect(card).toContain("{heroShown.detail && !compact && <p className=\"subline muted\">{heroShown.detail}</p>}");
  });
});

// F28, the overhaul spec 4.1: how the project is, in its own name, from the last check only. The words come from M45's
// verdict and the project's last check, never from anything the page guesses.
describe("the status headline (F28, 4.1)", () => {
  const NOW = Date.parse("2026-10-31T12:00:00Z");
  const row = (o: Partial<HistoryItem>): HistoryItem => ({ id: 1, label: "Fix the join button", status: "done", usd: 0.05, startedAt: "2026-10-31T09:50:00Z", endedAt: "2026-10-31T10:00:00Z", checkpoint: "cp_9", changed: 1, proof: "passed", ...o });
  const withHistory = (rows: HistoryItem[]): Model => ({ ...initial(), history: rows });
  test("how long ago, in plain words; a time that cannot be read is just now, never a wrong date", () => {
    expect(agoWords("2026-10-31T11:59:30Z", NOW)).toBe("just now");
    expect(agoWords("2026-10-31T11:59:00Z", NOW)).toBe("1 minute ago");
    expect(agoWords("2026-10-31T11:15:00Z", NOW)).toBe("45 minutes ago");
    expect(agoWords("2026-10-31T10:00:00Z", NOW)).toBe("2 hours ago");
    expect(agoWords("2026-10-30T09:00:00Z", NOW)).toBe("yesterday");
    expect(agoWords("2026-10-27T12:00:00Z", NOW)).toBe("4 days ago");
    expect(agoWords(null, NOW)).toBe("just now");
    expect(agoWords("not a date", NOW)).toBe("just now");
    expect(agoWords("2026-11-01T12:00:00Z", NOW), "a clock that is ahead is never said as the future").toBe("just now");
  });
  test("a proven last fix: \"test-shop works\", checked how long ago, with the tick", () => {
    const s = homeStatus(withHistory([row({})]), P, NOW);
    expect(s.kind).toBe("works");
    expect(s.verdict.headline).toBe("test-shop works");
    expect(s.sub).toBe("Checked 2 hours ago");
    expect([s.verdict.icon, s.verdict.tone, s.verdict.proven]).toEqual(["tick", "good", true]);
  });
  test("a failed check: \"test-shop has a problem\", with the cross", () => {
    const s = homeStatus(withHistory([row({ status: "not_done", proof: "failed" })]), P, NOW);
    expect(s.kind).toBe("failing");
    expect(s.verdict.headline).toBe("test-shop has a problem");
    expect(s.sub).toBe("A check failed 2 hours ago");
    expect([s.verdict.icon, s.verdict.tone]).toEqual(["cross", "bad"]);
  });
  test("nothing proven yet: Not checked yet with the status dot, never a tick, never green", () => {
    const never = homeStatus(initial(), P, NOW);
    expect([never.kind, never.verdict.headline, never.sub]).toEqual(["unchecked", "Not checked yet", "In test-shop"]);
    for (const r of [row({ status: "interrupted", proof: "skipped" }), row({ proof: "partial" }), row({ proof: null }), row({ undone: true }), row({ status: "no_connection", proof: null })]) {
      const s = homeStatus(withHistory([r]), P, NOW);
      expect(s.kind, JSON.stringify(r)).toBe("unchecked");
      expect([s.verdict.icon, s.verdict.proven, s.verdict.tone], JSON.stringify(r)).toEqual(["wait", false, "plain"]);
      // M51 polish: "Last task", not "Last time", so the line under "Not checked yet" never reads as a check that happened.
      expect(s.sub.startsWith("Last task: "), s.sub).toBe(true);
    }
    // The last row says it; an older proven fix does not make a newer stop or failure read as works.
    const newer = homeStatus(withHistory([row({}), row({ id: 2, startedAt: "2026-10-31T11:00:00Z", endedAt: "2026-10-31T11:05:00Z", status: "interrupted", proof: "skipped" })]), P, NOW);
    expect(newer.kind).toBe("unchecked");
    // A task still running is not a check.
    expect(homeStatus(withHistory([row({ status: "running", proof: null, endedAt: null })]), P, NOW).kind).toBe("unchecked");
  });
  test("the result on Home now is the last check, before any History row; an Undo of it is never works", () => {
    const m = { ...done(), history: [row({ status: "not_done", proof: "failed" })] };
    expect(lastResult(m, P)?.verdict.proven).toBe(true);
    expect(homeStatus(m, P, NOW).kind).toBe("works");
    const undone = run([ev({ type: "ui.undoAsked", checkpoint: "cp_1" }), ev({ type: "ui.undoSent" }), ev({ type: "checkpoint.restored", checkpoint: "cp_1", safety: "cp_2", recovered: [], largeLeftAlone: [], leftAlone: [] })], done());
    expect(homeStatus(undone, P, NOW).kind).toBe("unchecked");
  });
  test("no project yet: say to choose one, and the main button chooses one", () => {
    const s = homeStatus(initial(), "", NOW);
    expect([s.kind, s.verdict.headline, s.main]).toEqual(["noProject", S.home.noProject, "folder"]);
  });
  test("the notch's one true line says the same, in a sentence", () => {
    expect(notchStatusLine(homeStatus(withHistory([row({})]), P, NOW), P)).toBe("test-shop works. Last fix proven 2 hours ago.");
    expect(notchStatusLine(homeStatus(withHistory([row({ status: "not_done", proof: "failed" })]), P, NOW), P)).toBe("test-shop has a problem. A check failed 2 hours ago.");
    expect(notchStatusLine(homeStatus(initial(), P, NOW), P)).toBe("test-shop is not checked yet.");
    expect(notchStatusLine(homeStatus(initial(), "", NOW), "")).toBe(S.home.notchNothing);
  });
  test("the page draws the status as a Verdict line at display size, as Home's heading, at rest and under a result", () => {
    // The heading is the verdict alone; its quiet line follows it, outside the heading (the audit, item 51).
    expect(card).toContain('role="heading" aria-level={1}><VerdictLine verdict={status.verdict} size="headline" /></div>{status.sub && <p className="subline status-sub">{status.sub}</p>}');
    // Under a result just in the status leads in both layouts; the result card says the verdict once (the review, 2 Nov 2026).
    expect(card).toContain('const statusFirst = mode === "rest" || mode === "result";');
  });
});

// One main button per state (the overhaul spec 4.1, 7.2): exactly one at rest and under a result, chosen by the status;
// none while a job works, a question waits, another card needs a look, or an answer is in (that card has the screen).
describe("one main button per state", () => {
  const NOW = Date.parse("2026-10-31T12:00:00Z");
  const proven = { ...initial(), history: [{ id: 1, label: "x", status: "done", usd: 0, startedAt: "2026-10-31T10:00:00Z", endedAt: "2026-10-31T10:00:00Z", checkpoint: "c", changed: 1, proof: "passed" }] } as Model;
  const failing = { ...proven, history: [{ ...proven.history[0], status: "not_done", proof: "failed" }] } as Model;
  const cases: [string, Model, HomeMode, string | null][] = [
    ["at rest, never checked", initial(), "rest", "check"],
    ["at rest, works", proven, "rest", "shipCheck"],
    ["at rest, a check failed", failing, "rest", "fix"],
    ["working", run(task()), "working", null],
    ["a question", run([...task(), approval]), "question", null],
    ["an answer", run([ev({ type: "research.done", agent: "a", title: "Taking payments", answer: "Use a hosted checkout page.", notes: [] })]), "answer", null],
    ["a proven result", done(), "result", "shipCheck"],
    ["a failed result", done({ ended: "failed", endedWhy: "check_failed", proof: "failed" }), "result", "fix"],
    ["a stopped result", done({ ended: "stopped", proof: "skipped" }), "result", "check"],
  ];
  for (const [name, m, mode, main] of cases) test(name, () => {
    expect(homeMode(m)).toBe(mode);
    expect(mainFor(homeMode(m), homeStatus(m, P, NOW))).toBe(main as never);
  });
  test("the main button follows the tool switches: with Fix off there is no Fix it or Check my project (F20; review, 31 Oct)", () => {
    const fixOff = (b: string) => b !== "findProblem";
    const shipOff = (b: string) => b !== "shipCheck";
    expect(mainFor("rest", homeStatus(failing, P, NOW), fixOff)).toBeNull();
    expect(mainFor("rest", homeStatus(initial(), P, NOW), fixOff)).toBeNull();
    expect(mainFor("result", homeStatus(done({ ended: "failed", endedWhy: "check_failed", proof: "failed" }), P, NOW), fixOff)).toBeNull();
    expect(mainFor("result", homeStatus(done(), P, NOW), shipOff)).toBeNull();
    expect(mainFor("result", homeStatus(done(), P, NOW), fixOff)).toBe("shipCheck");
    // Choose a project needs no tool, so it stays whatever is off.
    expect(mainFor("rest", homeStatus(initial(), "", NOW), () => false)).toBe("folder");
    // Home asks the same switch the chips ask (groups.ts buttonShown), and the main buttons' tools are the ask buttons'.
    // M55, adapts to you: the same, with the kind of app in front and a task left half way (adaptsToYou.test.ts).
    expect(card).toContain("const main = proLimit ? null : mainFor(mode, status, (b) => buttonShown(b), { front: frontFollowed(frontKind, followFront), halfWay: halfWay(m, project) });");
    const groups = read("./groups.ts");
    for (const b of ["findProblem", "shipCheck"]) expect(groups, b).toContain(`"${b}"`);
  });
  test("while a job runs, some Stop is in reach on every place (review, 31 Oct)", () => {
    // Now: in the hero, or in the working card. Every other place (Settings, History, Memory, Learn): in the top bar, except
    // Learn while its practice fixes or checks, where the practice card's own Stop is the one Stop (M51 review; barStopCan,
    // lookFixes.test.ts).
    expect(card).toContain("{stopCan(m) && !jobShown && <div className=\"hero-main\"><Button kind=\"secondary\" size=\"sm\"");
    const bar = card.slice(card.indexOf('<header className="bar">'), card.indexOf("</header>", card.indexOf('<header className="bar">')));
    expect(bar).toContain('{barStopCan(m, home.tab) && <Button kind="secondary" size="sm" className="bar-stop"');
    expect(bar).toContain("onClick={() => void send(stopAgent())}><Icon name=\"stop\" size={14} />{S.stop}</Button>}");
    // Drawn before the places, and outside the Settings condition, so Settings gets it too.
    expect(bar.indexOf("bar-stop")).toBeLessThan(bar.indexOf('{home.tab !== "settings" && places.map('));
  });
  test("the labels are the spec's, and a project not chosen yet has its own", () => {
    // M55, adapts to you: Carry on (a task left half way) and Explain an error (a terminal in front), by the same names.
    expect(S.home.main).toEqual({ fix: "Fix it", shipCheck: "Check before going live", check: "Check my project", folder: "Choose a project", carryOn: "Carry on", explain: "Explain an error" });
    expect(mainFor("rest", homeStatus(initial(), "", NOW))).toBe("folder");
  });
  test("the page draws at most one silver button on Now: the main one (the ask field's Start, Undo and Stop are not silver)", () => {
    const now = card.slice(card.indexOf('<section className="hero"'), card.indexOf('{show("notes") && <>'));
    expect(now.match(/kind="primary"/g)?.length).toBe(1);
    // One button: the status's main action, or (2 Nov 2026) the next step of what waits on another place (a practice).
    // 2 Nov 2026 (the ranked UI audit): or the way out of a block, or Review the changes; still one button (heroMain).
    expect(now).toContain('{heroMain && <div className="hero-main"><Button kind="primary" size="lg" onClick={heroMain.go}>{heroMain.label}</Button></div>}');
    expect(card).toContain(': main || needMain ? { label: main ? S.home.main[main] : S.home.needMain[needMain!], go: () => (main ? doMain(main) : doNeedMain()), status: !!main } : null;');
    expect(now).not.toMatch(/btn primary/);
    const result = card.slice(card.indexOf('<section className="panel receipt"'), card.indexOf("</section>", card.indexOf('<section className="panel receipt"')));
    const job = card.slice(card.indexOf('<section className="panel job"'), card.indexOf("</section>", card.indexOf('<section className="panel job"')));
    for (const part of [result, job]) { expect(part).not.toContain('kind="primary"'); expect(part).not.toContain("btn primary"); }
  });
  test("what can show beside the hero is never silver too: the update notice, Try again, a watch's Fix it, Learn's rows (review, 31 Oct)", () => {
    const silver = /kind="primary"|btn primary|btnClass\("primary"/;
    const between = (src: string, from: string, to: string) => { const a = src.indexOf(from); expect(a, from).toBeGreaterThan(-1); return src.slice(a, src.indexOf(to, a)); };
    // The notes on every place (the update notice's Install sits beside the hero's main button on Now).
    expect(between(card, '{show("notes") && <>', "</>}")).not.toMatch(silver);
    // The receipt's follow up box: Try again is its one primary, and only because the hero then has no main button of its own
    // (the audit, item 34, homeHero.ts retryOwnsMain); its Send stays secondary.
    expect(between(card, "function FollowUpBox(", "\n}\n").match(new RegExp(silver, "g"))?.length).toBe(1);
    expect(card).toMatch(/retryOwnsMain\(m, project\) \? null/);
    // The watches on Now.
    expect(readFileSync(new URL("./watchPanel.tsx", import.meta.url), "utf8")).not.toMatch(silver);
    // Learn: each lesson's and each practice's Start or Continue (the spec, 2.2: "Learn's Start buttons" are never silver).
    expect(between(card, "lessonsShown(m.lessons ?? [], project, practiceRec, VERCEL_LESSON_ID).map((l) => (", "))}")).not.toMatch(silver);
    const practice = readFileSync(new URL("./practicePanel.tsx", import.meta.url), "utf8");
    for (const w of ["S.practiceStart}: ${r.title}", "S.practiceContinue}: ${r.title}"]) {
      const at = practice.indexOf(w);
      expect(at, w).toBeGreaterThan(-1);
      expect(practice.slice(practice.lastIndexOf("<button", at), at)).not.toMatch(silver);
    }
  });
});

describe("the working card's four steps read only the runner's real states (4.2)", () => {
  const tool = (t: string, id: string) => ev({ type: "agent.tool", agent: "a", toolUseId: id, tool: t, summary: "x", outcome: "ran" });
  test("Finding while it reads, Fixing once a file is written, Checking while a check runs, Proven only for a proven fix", () => {
    expect(jobStep(run(task())).step).toBe(0);
    expect(jobStep(run([...task(), tool("Read", "t1"), tool("Grep", "t2")])).step).toBe(0);
    expect(jobStep(run([...task(), tool("Read", "t1"), tool("Edit", "t2")])).step).toBe(1);
    expect(jobStep(run([...task(), tool("Edit", "t2"), ev({ type: "proof.step", agent: "a", rung: "tests", label: "Running the tests", status: "running", detail: "" })])).step).toBe(2);
    // M55 (live progress): a proven result has all four steps done (4); Proven alone is "now" (3) only once the checks passed.
    expect(jobStep(done()).step).toBe(4);
    expect(jobStep(done({ proof: "partial" })).step, "never Proven for a partly checked fix").toBeLessThan(3);
    expect(jobStep(done({ ended: "failed", endedWhy: "check_failed", proof: "failed" })).step).toBeLessThan(3);
  });
  test("a retry steps back to Fixing and says which try", () => {
    const m = { ...run(task()), character: "working" as const };
    const retry: Model = { ...m, task: { ...m.task!, proof: { steps: [{ rung: "tests", label: "Tests", status: "failed", detail: "" }], verdict: "failed", tries: 1 } } };
    expect(jobStep(retry)).toEqual({ step: 1, retry: "Trying again (2 of 3)" });
    expect(jobStep({ ...retry, task: { ...retry.task!, proof: { ...retry.task!.proof!, tries: 4 } } }, 3).retry).toBe("Trying again (3 of 3)");
  });
  test("the time so far as m:ss", () => {
    expect(clockWords(0)).toBe("0:00");
    expect(clockWords(65_000)).toBe("1:05");
    expect(clockWords(3_725_000)).toBe("1:02:05");
    expect(clockWords(-5)).toBe("0:00");
  });
  test("the card says the safety copy only when there is one, and Stop is a secondary button in it", () => {
    const job = card.slice(card.indexOf('<section className="panel job"'), card.indexOf("</section>", card.indexOf('<section className="panel job"')));
    expect(job).toContain("{m.task.checkpoint && <p className=\"job-safe\">");
    expect(job).toContain('<ol className="job-strip" aria-label={S.home.stepsLabel}>');
    expect(job).toContain('aria-current={i === js.step ? "step" : undefined}');
    expect(S.home.steps).toEqual(["Finding", "Fixing", "Checking", "Proven"]);
  });
});

describe("the recent fixes (4.1)", () => {
  test("up to four, newest first, named, each opening its own receipt", () => {
    const rows = Array.from({ length: 6 }, (_, i) => ({ id: i, label: i === 3 ? "  " : `T${i}`, status: "done", usd: 0, startedAt: `2026-10-2${i}T10:00:00Z`, endedAt: null, checkpoint: `c${i}`, changed: 1, proof: "passed" }));
    expect(recentOf(rows).map((r) => r.label)).toEqual(["T5", "T4", "T2", "T1"]);
    expect(card).toContain("<RecentList items={project ? m.history : []} now={clock} onOpen={openRecent} />");
    expect(card).toContain("if (m.receipt && i.checkpoint && i.checkpoint === m.receipt.checkpoint) { pickTab(\"now\");");
    expect(card).toContain('setHistoryFocus(i.id); pickTab("did");');
  });
});

describe("Flowflow lives on Home's water again (the founder, 31 Oct), and follows how lively the person chose (M46)", () => {
  test("the pond sits beside the words, and the water's drift stops with Still", () => {
    expect(card).toContain('<div className="home-pond" data-lively={lively} data-glow={glow} aria-hidden="true">');
    expect(card).toContain('const lively = livelinessOf(useSetting("character.lively"));');
    // One water for Home's pond and Settings' preview (review, 31 Oct): the same flat sea, and both hold still with Still.
    expect(css).toContain('.home-pond[data-lively="still"] .ch-water .waterline svg, .companion-hero[data-lively="still"] .ch-water .waterline svg { animation: none; }');
    // Home: one line across the whole width (the founder, 31 Oct, as in M41), the sea fading out under it, never a box.
    expect(/\.hero \{([^}]*)\}/.exec(css)?.[1]).toContain("overflow: clip;");
    expect(/\.hero \{([^}]*)\}/.exec(css)?.[1]).toContain("margin: 0 calc(var(--space-6) * -1) var(--space-2);");
    expect(/\.home-pond \.ch-water \{([^}]*)\}/.exec(css)?.[1]).toContain("background: linear-gradient(180deg, transparent 0, transparent var(--wave-foot), var(--sea) var(--wave-foot), transparent 100%);");
    expect(/\.home-pond \{([^}]*)\}/.exec(css)?.[1]).not.toMatch(/box-shadow|border-radius|background/);
    // The preview keeps a flat sea in its own card.
    expect(/\.companion-hero \.ch-water \{([^}]*)\}/.exec(css)?.[1]).toContain("background: linear-gradient(180deg, transparent 0, transparent var(--wave-foot), var(--sea-tint, var(--sea)) var(--wave-foot));");
    // Home and the preview now draw the sea differently on purpose (a long fading line in Home, a card in Settings).
    expect(read("./settingsPage.tsx")).toContain('<div className="companion-hero" id={fixedAnchor("preview")} data-lively={lively}>');
    // The sky over the preview water is a token, so Paper never draws a black box on its light page; Home has no sky box.
    expect(/\.companion-hero \{([^}]*)\}/.exec(css)?.[1]).toContain("background: var(--pond);");
    expect(tokens).toMatch(/:root\[data-theme="paper"\] \{[^}]*--pond: var\(--surface-1\);/);
  });
});

describe("the notch's buttons ask Home for Undo's question and for Settings at the key (4.3)", () => {
  test("only these shapes pass, in the page as in the shell", () => {
    expect(arrivalFrom({ then: { do: "undo" } })).toEqual({ do: "undo" });
    expect(arrivalFrom({ then: { set: "account.claude" } })).toEqual({ set: "account.claude" });
    for (const bad of [{ do: "delete" }, { set: "" }, { set: "../x" }, { set: "a b" }, { set: "Account" }, { set: "x".repeat(61) }, { set: 3 }]) expect(arrivalFrom({ then: bad }), JSON.stringify(bad)).toBeNull();
    // Undo from the notch only asks the receipt's question in Home: nothing is undone without the person's yes there.
    expect(card).toContain('if (t.do === "undo") { pickTab("now"); if (m.receipt && undoCan(m, project)) dispatch({ type: "ui.undoAsked", checkpoint: m.receipt.checkpoint }); return; }');
    expect(card).toContain('if ("set" in t) { setSetPlace(t.set); pickTab("settings"); return; }');
  });
});
