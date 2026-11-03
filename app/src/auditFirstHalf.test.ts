// The ranked UI audit (2 Nov 2026), first half: the items that are logic are pinned here so they cannot come back. Each
// describe names its audit item. The decisions are plain code (homeHero.ts, approvals.ts, onboarding.ts, review.ts,
// settingsSearch.ts, model.ts, confirm.tsx); the stylesheets are read as text for the items that are only a look.
import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { characterWords, initial, reduce, visualState, type Model } from "./model.ts";
import { askRoute, blockerOf, heroCompact, heroWords, homeFixRoute, homeMode, homeStatus, jobNowWords, reviewLead, type HomeStatus } from "./homeHero.ts";
import { need } from "./home.ts";
import { whatOf, approvalWords } from "./approvals.ts";
import { firstCheckVerdict } from "./onboarding.ts";
import { ratingLook, type ReviewCard } from "./review.ts";
import { searchSettingsFor } from "./settingsSearch.ts";
import { openStep } from "./confirm.tsx";
import type { Focusable, Page } from "./focus.ts";
import { S } from "./strings.ts";
import { ALL_CSS, TOKENS_CSS } from "./ui/cssFiles.ts";

const P = "/Users/me/shop";
const lum = (hex: string) => { const n = parseInt(hex.slice(1), 16), f = (x: number) => { const v = x / 255; return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }; return 0.2126 * f(n >> 16) + 0.7152 * f((n >> 8) & 255) + 0.0722 * f(n & 255); };
const contrast = (a: string, b: string) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };
const ev = (o: Record<string, unknown>) => ({ v: 1, id: "e", ...o });
const run = (events: Record<string, unknown>[], from: Model = initial()) => events.reduce<Model>((m, e) => reduce(m, e as never), from);
const css = ALL_CSS(), tokens = TOKENS_CSS();
const card = readFileSync(new URL("./card.tsx", import.meta.url), "utf8");
const reviewCard = readFileSync(new URL("./reviewCard.tsx", import.meta.url), "utf8");
const onboardingTsx = readFileSync(new URL("./onboarding.tsx", import.meta.url), "utf8");
const found = (problem?: Record<string, unknown>): Model => ({ ...initial(), folder: P, point: { stage: "found", label: "Building and checking the code", message: "x is not defined", ...(problem ? { problem } : {}) } } as unknown as Model);

describe("(1) Home's Fix it fixes what was found, the way the point card's Fix it does", () => {
  test("a known failure takes the point card's route: a deeper look, or one small checked fix when Settings says so", () => {
    const m = found({ kind: "line", file: "app.js", line: 3, message: "x is not defined" });
    const s = homeStatus(m, P, Date.now());
    expect(s.main).toBe("fix");
    expect(homeFixRoute(m, s, P, "rescue")).toBe("rescue");
    expect(homeFixRoute(m, s, P, "smallFix")).toBe("smallFix");
  });
  test("a failure known only from the last task's result looks deeper first (there is no line to fix)", () => {
    const s: HomeStatus = { ...homeStatus(initial(), P, 0), kind: "failing", main: "fix" };
    expect(homeFixRoute(initial(), s, P, "smallFix")).toBe("rescue");
  });
  test("nothing known yet: the button is Check my project, and it checks", () => {
    const s = homeStatus(initial(), P, Date.now());
    expect(s.main).toBe("check");
    expect(S.home.main.check).toBe("Check my project");
    expect(homeFixRoute(initial(), s, P, "rescue")).toBe("check");
  });
  test("card.tsx sends Home's Fix it through that route, never the read only check", () => {
    expect(card).toMatch(/homeFixRoute\(/);
    expect(card).not.toMatch(/else if \(a === "folder"\) pickFolder\(\); else findFromHome\(\);/);
  });
});

describe("(2) Return with no project never makes a new project by itself", () => {
  test("no project: the words wait, and the person picks a project or a new one", () => {
    expect(askRoute({ prompt: "fix the signup button", project: "", newFolder: false })).toBe("chooseProject");
  });
  test("a new folder only when Make it in a new folder is ticked", () => {
    expect(askRoute({ prompt: "make a shop", project: P, newFolder: true })).toBe("newFolder");
    expect(askRoute({ prompt: "make a shop", project: "", newFolder: true })).toBe("newFolder");
  });
  test("with a project the words go there; with no words, nothing is sent", () => {
    expect(askRoute({ prompt: "fix it", project: P, newFolder: false })).toBe("here");
    expect(askRoute({ prompt: "  ", project: P, newFolder: false })).toBe("needWords");
    expect(askRoute({ prompt: "", project: "", newFolder: false })).toBe("needWords");
  });
  test("card.tsx no longer treats no project as a new folder, and offers both ways", () => {
    expect(card).not.toMatch(/const inNewFolder = !project \|\| newFolder/);
    expect(card).toMatch(/S\.home\.noProjectAsk/);
    expect(typeof S.home.noProjectAsk).toBe("string");
    expect(S.home.chooseMine).toBe("Choose my project");
    expect(S.home.startNewFrom).toBe("Start a new project from this");
  });
});

describe("(7) the review's Fix it question takes the keyboard, and Escape closes only the question", () => {
  type Fake = Focusable & { focused: number };
  const fake = (): Fake => { const el: Fake = { tagName: "BUTTON", isConnected: true, focused: 0, focus() { el.focused++; }, hasAttribute: () => false, setAttribute: () => {} }; return el; };
  const stepBox = (cancel: Fake) => ({ querySelector: (s: string) => (s === "[data-cancel]" ? cancel : null), querySelectorAll: () => [cancel] }) as unknown as HTMLElement;
  test("a step never takes the keyboard from an opener that stays on screen with it, so the opener must step aside", () => {
    const opener = fake(), cancel = fake();
    const page: Page = { active: () => opener, hasFocus: () => true, byId: () => opener, now: () => 0 };
    expect(openStep(stepBox(cancel), page)).toBe(false);
    expect(cancel.focused).toBe(0);
  });
  test("with the opener gone, the step has the keyboard on its safe choice", () => {
    const cancel = fake();
    const page: Page = { active: () => ({ tagName: "BODY" }), hasFocus: () => true, byId: () => null, now: () => 0 };
    expect(openStep(stepBox(cancel), page)).toBe(true);
    expect(cancel.focused).toBe(1);
  });
  test("Fix it hides while its question is open, and the question scrolls into view clear of the ask band", () => {
    expect(reviewCard).toMatch(/canFix\(r\) && r\.fix !== "confirm"/);
    const confirm = readFileSync(new URL("./confirm.tsx", import.meta.url), "utf8");
    expect(confirm).toMatch(/scrollIntoView\?\.\(\{ block: "nearest" \}\)/);
    expect(css).toMatch(/\.home \.confirm-step \{ scroll-margin-bottom:/);
  });
});

describe("(8) the first run's found problem says what broke, and offers Fix it", () => {
  test("the verdict's line is the problem itself, not the name of the check", () => {
    const v = firstCheckVerdict({ stage: "found", label: "Building and checking the code", problem: { kind: "line", file: "app.js", line: 3, message: "x is not defined" } } as never, "shop")!;
    expect(v.line).toBe("x is not defined");
    const plain = firstCheckVerdict({ stage: "found", label: "Building and checking the code" }, "shop")!;
    expect(plain.line).not.toMatch(/Failed: Building/);
    expect(plain.line).not.toMatch(/Press Fix it on Home/);
  });
  test("the screen shows the failing line and makes Fix it the main button, with Go to my project as the quiet link", () => {
    expect(onboardingTsx).toMatch(/<FailingLine problem=/);
    expect(onboardingTsx).toMatch(/S\.fr\.fixIt/);
    expect(S.fr.fixIt).toBe("Fix it");
    expect(onboardingTsx).toMatch(/fixFound/);
  });
});

describe("(9) one name for each action", () => {
  test("Fix it, Check my project, Check before going live, safety copy and Recent work", () => {
    expect(S.pointFix).toBe("Fix it");
    expect(S.practiceFix).toBe("Fix it");
    expect(S.look.chipFind).toBe("Check my project");
    expect(S.keyJobs.problem).toBe("Check my project");
    expect(S.practiceFind).toBe("Check my project");
    expect(S.look.chipSafe).toBe("Check before going live");
    expect(S.shipCheck).toBe("Check before going live");
    expect(S.shipTitle).toBe("Ready to go live?");
    expect(S.look.sideRecent).toBe("Recent work");
    expect(S.home.recentTitle).toBe("Recent work");
    expect(S.recentTitle).toBe("Recent work");
  });
  test("the practice no longer explains the difference between two fixes", () => {
    expect((S as Record<string, unknown>).practiceFixHelp).toBeUndefined();
  });
});

describe("(11) changes waiting for review lead Home", () => {
  const rc = (o: Partial<ReviewCard> = {}): ReviewCard => ({ project: P, batch: "rv_0123456789", stage: "ready", files: [], count: 4, capped: false, secretFiles: [], auto: false, proof: false, asked: false, fix: null, note: null, result: null, ...o });
  test("ready: the headline says what changed, and the main button is Review the changes", () => {
    const l = reviewLead(rc(), P)!;
    expect(l.headline).toBe(S.review.lead(4));
    expect(l.line).toBe(S.review.heroLine(4));
    expect(reviewLead(rc({ away: "closed" }), P)!.line).toBe(S.review.away.closed);
    expect(l.main).toBe("review");
    expect(S.home.reviewMain).toBe("Review the changes");
  });
  test("reviewing: no main button; reviewed and not safe: the rating leads and the card's own Fix it is the only one", () => {
    expect(reviewLead(rc({ stage: "reviewing" }), P)!.main).toBeNull();
    const done = reviewLead(rc({ stage: "reviewed", result: { rating: "stop", touches: [], summary: "", notes: [], reasons: [{ kind: "secret", say: "A key" }], checks: "notRun", sendBack: "", lane: "quick", usdEstimate: 0 } as never }), P)!;
    // M65 step 4: a stop's headline is the problem itself, and the status line over it says Fix this first in red.
    expect(done.headline).toBe("A key");
    expect(done.stop).toBe(true);
    expect(done.main).toBeNull();
    const look = reviewLead(rc({ stage: "reviewed", result: { rating: "worth_a_look", touches: [], summary: "", notes: [], reasons: [{ kind: "secret", say: "A key" }], checks: "notRun", sendBack: "", lane: "quick", usdEstimate: 0 } as never }), P)!;
    expect(look.headline).toBe(S.review.rating.worth_a_look);
    expect(look.stop).toBe(false);
  });
  test("a safe review, or another folder's, does not lead", () => {
    expect(reviewLead(rc({ stage: "reviewed", result: { rating: "safe", touches: [], summary: "", notes: [], reasons: [], checks: "passed", sendBack: "", lane: "quick", usdEstimate: 0 } as never }), P)).toBeNull();
    expect(reviewLead(rc(), "/Users/me/other")).toBeNull();
    expect(reviewLead(null, P)).toBeNull();
  });
  test("Home is in review mode then, so the status never says the project works with a tick above unreviewed code", () => {
    const m = { ...initial(), folder: P, review: rc() } as Model;
    expect(homeMode(m, need(m), { review: reviewLead(m.review, P) })).toBe("review");
  });
  test("the review card comes before the recent list in tall, and .review-busy has its live dot", () => {
    expect(card.indexOf("<ReviewCardView")).toBeLessThan(card.indexOf("mode === \"rest\" && !side && <RecentList"));
    expect(css).toMatch(/\.review-busy::before/);
  });
});

describe("(12) Home says what blocks it, with the one way out as the main button", () => {
  test("no key, the engine stopped, or Claude missing", () => {
    expect(blockerOf({ connected: "none", runnerUp: true, claude: "ready" })).toBe("key");
    expect(blockerOf({ connected: "api_key", runnerUp: false, claude: "ready" })).toBe("engine");
    expect(blockerOf({ connected: "api_key", runnerUp: true, claude: "missing" })).toBe("claude");
    expect(blockerOf({ connected: "api_key", runnerUp: true, claude: "failed" })).toBe("claude");
    expect(blockerOf({ connected: "api_key", runnerUp: true, claude: "installing" })).toBe("claudeGetting");
    expect(blockerOf({ connected: "unknown", runnerUp: true, claude: null })).toBeNull();
    expect(blockerOf({ connected: "plan", runnerUp: true, claude: "ready" })).toBeNull();
  });
  test("each has its own words and main button", () => {
    for (const b of ["key", "engine", "claude", "claudeGetting"] as const) expect(S.home.blocked[b].headline.length).toBeGreaterThan(0);
    expect(S.home.blocked.key.main).toBe("Add your key");
    expect(S.home.blocked.engine.main).toBe("Restart");
    expect(S.home.blocked.claude.main).toBe("Get Claude");
  });
  test("blocked is a mode of its own, and Flowflow takes its error pose", () => {
    const m = { ...initial(), folder: P, connected: "none" } as Model;
    expect(homeMode(m, need(m), { blocker: "key" })).toBe("blocked");
    expect(card).toMatch(/as=\{blocker && blocker !== "claudeGetting" \? "error" : undefined\}/);
  });
  test("Claude's own notice is a secondary button, and notes on the sea have a backing", () => {
    expect(card).not.toMatch(/claude-notice[\s\S]{0,400}btn primary/);
    expect(css).toMatch(/\.home \.error, \.home \.notice \{[^}]*background: color-mix\(in srgb, var\(--surface-1\) 82%/);
  });
});

describe("(13) in the wide Home a card that needs a tap has the room", () => {
  test("the hero folds to one line while an approval, a stuck card, a review, a found problem or a fresh result shows", () => {
    const base = { ...initial(), folder: P } as Model;
    expect(heroCompact({ ...base, approvals: [{ id: "a", agent: "x", title: "t", risk: "install", checkpoint: "c", expiresAt: "" }] } as Model, false)).toBe(true);
    expect(heroCompact(base, true)).toBe(true);
    expect(heroCompact(found(), false)).toBe(true);
    expect(heroCompact(base, false)).toBe(false);
  });
  test("compact is only a wide rule, the ask band pads the scroll, and the receipt comes before what was checked", () => {
    expect(css).toMatch(/\.home\[data-side\] \.hero\[data-compact\]/);
    expect(css).toMatch(/scroll-padding-bottom/);
    expect(card.indexOf('<section className="panel receipt"')).toBeLessThan(card.lastIndexOf("{m.receipt && proofPanel}"));
  });
});

describe("(15) Undo has one name, is neutral at rest, and red only on its yes", () => {
  test("one label in both places", () => {
    expect(S.home.undoFix).toBe("Undo these changes");
    expect(S.historyUndo).toBe("Undo these changes");
    expect(card).not.toMatch(/className="btn danger"[^>]*>\{S\.historyUndo\}/);
  });
  test("--bad-room reads on a raised card in each dark theme", () => {
    expect(tokens).toMatch(/--bad-room: #FF7A78/);
    expect(css).toMatch(/\.home \.btn\.danger \{[^}]*var\(--bad-room\)/);
    // A lit card: 10% of the room's card colour over the theme's card (Graphite, Deep), and Black's plain card.
    for (const raise of ["#1D262E", "#162B41", "#0A0A0A", "#171717", "#0F1D2C"]) expect(contrast("#FF7A78", raise)).toBeGreaterThanOrEqual(4.5);
  });
});

describe("(16) review labels say what happens", () => {
  test("Copy for my AI, Skip this one before a review, and Fix this first", () => {
    expect(S.review.sendBack).toBe("Copy for my AI");
    expect(S.review.skipThis).toBe("Skip this one");
    expect(S.review.rating).toEqual({ safe: "Looks safe", worth_a_look: "Worth a look", stop: "Fix this first" });
    expect(ratingLook("stop").words).toBe("Fix this first");
    expect(ratingLook("stop").icon).not.toBe("stop");
    expect(reviewCard).toMatch(/S\.review\.skipThis/);
  });
});

describe("(18, 19) placeholders follow the theme, and the ask box shows focus and a lit arrow", () => {
  test("placeholder colour", () => { expect(css).toMatch(/\.row input\[type="search"\]::placeholder[^{]*\{ color: var\(--fg-2\); \}/); });
  test("focus ring and a filled send arrow once there are words", () => {
    expect(css).toMatch(/\.home \.askwrap \.ask:focus-within \{[^}]*border-color: var\(--focus\)/);
    expect(css).toMatch(/\.home \.ask:has\(textarea:not\(:placeholder-shown\)\) \.send:not\(:disabled\) \{[^}]*background: var\(--el-base\)/);
    expect(css).toMatch(/\.home \.ask \.send:disabled \{[^}]*cursor: not-allowed/);
  });
});

describe("(20) Settings search finds dark mode and light mode, and keeps typo hits few", () => {
  test("the theme comes first for each", () => {
    for (const q of ["dark mode", "light mode", "appearance", "night", "white", "pure black"]) expect("key" in searchSettingsFor(q)[0].hit && (searchSettingsFor(q)[0].hit as { key: string }).key).toBe("look.theme");
  });
  test("an exact hit keeps typo matches to three", () => {
    expect(searchSettingsFor("night").length).toBeLessThanOrEqual(8);
    expect(searchSettingsFor("white").length).toBeLessThanOrEqual(8);
  });
  test("a query of several words falls back to its best word when no thing matches every word", () => {
    expect(searchSettingsFor("theme thingamajig").length).toBeGreaterThan(0);
  });
});

describe("(21, 22, 23, 24) the folder menu, the side list, the column edge and the switch", () => {
  test("the folder menu opens to the right in the bar and cuts a long name", () => {
    expect(css).toMatch(/\.home \.bar \.ui-menu-list \{ left: 0; right: auto; \}/);
    expect(css).toMatch(/\.home \.bar \.ui-menu-value \{[^}]*-webkit-line-clamp: 1/);
  });
  test("the selected bar sits inside the curve, hover is lighter than the selection", () => {
    expect(css).toMatch(/\[aria-current="page"\]::after \{[^}]*left: 3px/);
    expect(css).toMatch(/\.side \.sb-item:not\(\[aria-current="page"\]\):hover \{ background: color-mix\(in srgb, var\(--side-row\) 55%, transparent\); \}/);
  });
  test("headings and the tall places sit on the column edge", () => {
    expect(css).toMatch(/\.home\[data-side\] \.view-title \{ margin-left: 0; \}/);
    expect(css).toMatch(/\.home \.places \.btn\.quiet:not\(\[aria-pressed="true"\]\):hover/);
  });
  test("the on switch has a white knob", () => {
    expect(tokens).toMatch(/--knob-on: #fff/i);
    expect(css).toMatch(/\.ui-switch\[aria-checked="true"\]::after \{[^}]*background: var\(--knob-on/);
  });
});

describe("(25) the live line under Checking says the check under way", () => {
  test("a running check's label wins over the last tool step", () => {
    const m = { ...initial(), task: { agent: "a", label: "x", lines: [], costUsd: 0, proof: { steps: [{ rung: "build", label: "Building the code", status: "running" }] } } } as unknown as Model;
    expect(jobNowWords(m, null, [{ words: "Changing a file" }])).toBe("Building the code");
    expect(jobNowWords(m, "Trying again (2 of 3)", [{ words: "Changing a file" }])).toBe("Trying again (2 of 3)");
    expect(jobNowWords({ ...m, task: { ...m.task!, proof: undefined } } as Model, null, [{ words: "Changing a file" }])).toBe("Changing a file");
    expect(card).toMatch(/jobNowWords\(m, js\.retry, lines\)/);
    // Before the first step, what the character is doing (M65 step 6: Instrument says Getting started for a bare Working,
    // homeWords.test.ts).
    expect(jobNowWords({ ...m, task: { ...m.task!, proof: undefined } } as Model, null, [])).toBe(characterWords({ ...m, task: { ...m.task!, proof: undefined } } as Model));
  });
});

describe("(26) the approval card leads with the plain question, the command without its tool name, Don't allow first", () => {
  test("whatOf drops Bash:", () => {
    expect(whatOf("Bash: npm install zod")).toBe("npm install zod");
    expect(whatOf("Running: npm install zod")).toBe("npm install zod");
  });
  test("the heading is the engine's plain title, the risk line comes after the command", () => {
    const w = approvalWords({ risk: "install", title: "install the packages", action: "Bash: npm install" });
    expect(w.why).toBe("Install the packages.");
    expect(card).toMatch(/<h2>\{w\.why\}<\/h2>/);
    expect(card.indexOf("<code>{w.what}</code>")).toBeLessThan(card.indexOf("{w.question}</div>"));
  });
  test("Don't allow comes first on Home, as in the first run", () => {
    const at = card.indexOf("panel amber ask-card");
    const slice = card.slice(at, at + 3000);
    expect(slice.indexOf("{S.dontAllow}")).toBeLessThan(slice.indexOf("{S.allow}"));
  });
  test("in the tall Home the waiting cards come before the ask box", () => {
    expect(card).toMatch(/\{!side && urgentCards && /);
    expect(card.indexOf("{!side && urgentCards")).toBeLessThan(card.indexOf("<div className=\"askwrap\""));
  });
});

describe("(27) Return shows something at once", () => {
  test("ui.taskSent sets the hero to the words and Flowflow to thinking, until the engine answers", () => {
    let m = run([ev({ type: "ui.taskSent", words: "fix the signup button" })], { ...initial(), folder: P });
    expect(m.sending?.words).toBe("fix the signup button");
    expect(visualState(m)).toBe("thinking");
    const h = heroWords(m, P);
    expect(h.headline).toBe("Fix the signup button");
    expect(h.line).toBe(S.look.starting);
    expect(h.tone).toBe("working");
    m = run([ev({ type: "checkpoint.created", agent: "a", checkpoint: "c1", label: "Before: fix" })], m);
    expect(m.sending).toBeFalsy();
  });
  test("a refusal clears it", () => {
    const m = run([ev({ type: "ui.taskSent", words: "x" }), ev({ type: "ui.taskSendFailed" })]);
    expect(m.sending).toBeFalsy();
  });
});
