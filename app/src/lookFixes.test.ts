// The graphite look (M51, the founder, 1 Nov 2026): the glitches a review found in the first build of it, each pinned so it
// cannot come back. Plain code where the glitch was logic (the stray dot, two Stop buttons), the stylesheets where it was
// drawing (Flowflow over the tab row, the marker, the first run's links, the Settings strip, the specks over Flowflow).
import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { initial, reduce, type Model } from "./model.ts";
import { need } from "./home.ts";
import { barStopCan, stopCan } from "./homeHero.ts";
import { ALL_CSS, LOOK_CSS, PARTS_CSS, STYLE_CSS, TOKENS_CSS } from "./ui/cssFiles.ts";
import { stripEdges } from "./ui/strip.ts";

const ev = (o: Record<string, unknown>) => ({ v: 1, id: "e", ...o });
const run = (events: Record<string, unknown>[], from: Model = initial()) => events.reduce<Model>((m, e) => reduce(m, e as never), from);
const read = (p: string) => readFileSync(new URL(p, import.meta.url), "utf8");
const P = "/Users/me/practice-signup";
const found = ev({ type: "problem.found", project: P, agent: "a", verdict: "failed", label: "Running the tests", detail: "The tests did not pass.", problem: { kind: "line", file: "test/signup.test.js", line: 17, lineText: "assert.strictEqual(res.status, 200)", message: "Pressing Join sends the email to /api/signup, which answered 404", from: "tests" } });
const fixing = () => run([
  ev({ type: "ui.practiceStarted", project: P, kind: "signup" }), ev({ type: "ui.findProblem" }), found,
  ev({ type: "checkpoint.created", project: P, agent: "a", checkpoint: "cp_1", label: "Before: Fix the signup button", files: 6, skipped: [], practice: "signup" }),
  ev({ type: "agent.state", agent: "a", state: "working" }),
]);
const rule = (css: string, sel: string) => {
  const at = css.indexOf(`\n${sel} {`);
  return at < 0 ? null : css.slice(at + sel.length + 3, css.indexOf("}", at));
};

describe("no stray dot on the back arrow while a practice fixes (review, 1 Nov)", () => {
  test("the problem a practice found is the practice's own: it never marks Now as waiting", () => {
    const m = fixing();
    expect(m.practice?.stage).toBe("fixing");
    expect(m.point?.stage).toBe("found");
    expect(need(m)?.tab ?? null).not.toBe("now");
  });
  test("outside a practice, a found problem still marks Now", () => {
    const m = run([ev({ type: "ui.findProblem" }), found]);
    expect(need(m)?.tab).toBe("now");
  });
});

describe("one Stop, in the card (review, 1 Nov)", () => {
  test("while a practice fixes or checks, Stop is the card's own, never a second one in the top row", () => {
    const m = fixing();
    expect(stopCan(m)).toBe(true);
    expect(barStopCan(m, "learn")).toBe(false);
    const proving: Model = { ...m, practice: { ...m.practice!, stage: "proving" } };
    expect(barStopCan(proving, "learn")).toBe(false);
  });
  test("on a place with no Stop of its own, the top row keeps it; Now has its own; nothing works, no Stop", () => {
    const m = fixing();
    expect(barStopCan(m, "did")).toBe(true);
    expect(barStopCan(m, "memory")).toBe(true);
    expect(barStopCan(m, "now")).toBe(false);
    expect(barStopCan(initial(), "did")).toBe(false);
  });
  test("the top row asks barStopCan, not stopCan alone", () => {
    const card = read("./card.tsx");
    expect(card).toContain("barStopCan(m, home.tab) && <Button kind=\"secondary\" size=\"sm\" className=\"bar-stop\"");
    expect(card).not.toContain('home.tab !== "now" && stopCan(m) && <Button kind="secondary" size="sm" className="bar-stop"');
  });
});

describe("Flowflow peeks over the practice card, never over the tab row (review, 1 Nov)", () => {
  const look = LOOK_CSS();
  test("the peek is in the flow above the card, so however tall its line grows it pushes the card down, never up over the bar", () => {
    const panel = read("./practicePanel.tsx");
    expect(panel).toMatch(/return \(<>\n\s*<Peek stage=\{p\.stage\} \/>\n\s*<section className="panel practice"/);
    const peek = rule(look, ".pr-peek") ?? "";
    expect(peek).not.toMatch(/position: absolute|translate:|top:/);
    expect(peek).toMatch(/display: flex;/);
    expect(peek).toMatch(/align-items: flex-end;/);
    // Its foot tucks under the card (drawn over it), which is what makes it peek over the card's edge.
    expect(peek).toMatch(/margin: [^;]* calc\(var\(--peek\) \* -\.25\);/);
    expect(rule(look, ".home .view .panel.practice")).toMatch(/position: relative; z-index: 1;/);
    expect(rule(look, ".home .view .panel.practice") ?? "").not.toMatch(/margin-top/);
    expect(rule(look, ".pr-char")).toMatch(/width: var\(--peek\);/);
    expect(rule(look, ".pr-char")).toMatch(/height: var\(--peek\);/);
  });
  test("no little sparks over it when proven: the peek holds Flowflow still at rest once the checks pass", () => {
    const panel = read("./practicePanel.tsx");
    // FlowMini's "done" plays the success flash (three drops); the bubble already says the checks pass.
    expect(panel).toContain('const state = stage === "fixing" || stage === "proving" ? "working" : "idle";');
    expect(panel).not.toMatch(/stage === "done" \? "done"/);
  });
});

// The line Flowflow found. The first review (1 Nov) found a muddy olive tint under white words, so it became a solid yellow
// highlighter; the polish review (1 Nov, next to HeyClicky) found that yellow the loudest thing on the screen, a worksheet's
// highlighter. It is drawn now as a code review draws a failing line: the quiet red wash of a removed line, a red rule at its
// left edge, the page's own words on it (their contrast is checked with every rule's in a11y.test.ts). Never a yellow tint.
describe("the failing line reads as a code review's failing line, never a highlighter or a muddy tint", () => {
  test("a red wash with a red rule, in the page's words; no marker yellow and no tint of it", () => {
    const r = rule(ALL_CSS(), ".found-line") ?? "";
    expect(r).toContain("background: linear-gradient(var(--removed), var(--removed))");
    expect(r).toContain("var(--bad)");
    expect(r).toContain("color: var(--fg)");
    expect(r).not.toContain("--marker");
  });
});

describe("the first run's links line up with its headings (review, 1 Nov)", () => {
  test("a link is a quiet Button, so its own inset is taken off: its words start at the column's edge", () => {
    // .fr .fr-link matches .btn.quiet's weight and comes later (style.css after parts.css), so it wins.
    expect(rule(STYLE_CSS(), ".fr .fr-link")).toMatch(/padding-inline: 0;/);
    const css = ALL_CSS();
    expect(css.indexOf("\n.fr .fr-link {")).toBeGreaterThan(css.indexOf("\n.btn.quiet {"));
  });
});

describe("the Settings strip never cuts a word without saying there is more (review, 1 Nov)", () => {
  const folded = /@container home \(width < 44rem\) \{([^\n]*)\}/.exec(PARTS_CSS())?.[1] ?? "";
  test("folded, the strip fades only at an edge with more past it, and shows an arrow there", () => {
    expect(folded).toMatch(/\.sb-strip\[data-more~="right"\] \.sb-list \{[^}]*mask-image/);
    expect(folded).toMatch(/\.sb-strip\[data-more~="left"\] \.sb-list \{[^}]*mask-image/);
    expect(folded).toMatch(/\.sb-more \{[^}]*display: grid;/);
  });
  test("which edges have more, from where the strip is scrolled (a point of slack, so a rounded scroll never shows a fade)", () => {
    expect(stripEdges(0, 300, 300)).toBe("");
    expect(stripEdges(0, 700, 300)).toBe("right");
    expect(stripEdges(200, 700, 300)).toBe("left right");
    expect(stripEdges(400, 700, 300)).toBe("left");
    expect(stripEdges(399.5, 700, 300)).toBe("left");
    expect(stripEdges(0.5, 700, 300)).toBe("right");
  });
  test("the page knows which edges have more, and the open page is scrolled into the strip", () => {
    const page = read("./settingsPage.tsx");
    expect(page).toContain("data-more={more || undefined}");
    expect(page).toContain('scrollIntoView({ block: "nearest", inline: "nearest" })');
    expect(page).toContain("stripEdges(");
  });
});

describe("proof rows in the system mono: the files a fix changed and the failing line (M51)", () => {
  const css = ALL_CSS();
  test("the failing line shows where it is and the line itself, in the code face, with the marker on the line", () => {
    const part = read("./failingLine.tsx");
    expect(part).toContain('<code className="failing-at">{`${file}:${line}`}</code>');
    expect(part).toContain('<mark className="found-line">{text}</mark>');
    expect(rule(css, ".failing-at")).toContain("var(--font-code)");
    expect(rule(css, ".failing-code")).toContain("var(--font-code)");
  });
  test("Practice and Home's Find the problem both show it when the problem is a line in the project", () => {
    expect(read("./practicePanel.tsx")).toContain("<FailingLine problem={p.problem} />");
    expect(read("./card.tsx")).toContain("<FailingLine problem={m.point.problem} />");
  });
  test("each changed file says how it changed in the code face too, beside its name", () => {
    expect(read("./changesCard.tsx")).toContain('<span className="changes-kind" aria-hidden="true">');
    expect(rule(css, ".changes-kind")).toContain("var(--font-code)");
    expect(rule(css, ".changes li b")).toContain("var(--font-code)");
  });
});
