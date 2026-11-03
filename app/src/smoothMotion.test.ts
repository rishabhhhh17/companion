// Smooth motion (M55 section 1, tests first, rule 17). Moving between places is a short fade and a small slide, cards grow
// in and fold away with no jump in the layout, the cost counts up, buttons answer a press, and Home drops from the notch in
// one motion. Durations and easing come from one place (ui/tokens.css), exits are faster than entrances, only transform and
// opacity move, and with Reduce motion or Less motion nothing moves at all. The pages need a real Mac to run, so the wiring
// is read as text; the arithmetic is plain code.
import { afterEach, describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { ALL_CSS, PARTS_CSS, STYLE_CSS, TOKENS_CSS } from "./ui/cssFiles.ts";
import { MOTION_TOKENS, MAX_FADES, MAX_SLIDE, countAt, counts, gone, msOf, onScreen, pxOf, readTokens, slides, translateYOf, type Spot } from "./smoothMotion.ts";
import { initial, reduce, type Model } from "./model.ts";
import { heroWords, timeLine, workingLine } from "./homeHero.ts";
import { _resetForTests, takeSnapshot } from "./settingsStore.ts";

const read = (p: string) => readFileSync(new URL(p, import.meta.url), "utf8");
const tokens = TOKENS_CSS(), css = ALL_CSS(), card = read("./card.tsx"), mod = read("./smoothMotion.ts");
const token = (name: string) => new RegExp(`${name}: ([^;]+);`).exec(tokens)?.[1]?.trim() ?? "";
const ms = (name: string) => msOf(token(name)) ?? NaN;
const g = globalThis as { matchMedia?: unknown };
/** One function of the module, from its first line to its closing brace. */
const fnOf = (name: string) => { const at = mod.indexOf(`function ${name}(`); return at < 0 ? "" : mod.slice(at, mod.indexOf("\n}\n", at)); };

describe("one set of motion tokens, in ui/tokens.css", () => {
  test("every motion the pages use has its token", () => {
    for (const name of Object.values(MOTION_TOKENS)) expect(token(name), name).not.toBe("");
    for (const name of ["--dur-press", "--dur-release", "--dur-hover", "--ease-hover", "--dur-open", "--dur-close", "--press-row"]) expect(token(name), name).not.toBe("");
  });
  test("a place change is about 180 ms on an ease out", () => {
    expect(ms("--dur-enter")).toBe(180);
    expect(token("--ease-enter")).toMatch(/^cubic-bezier\(/);
  });
  test("exits are faster than entrances, and a press is quicker than its let go", () => {
    expect(ms("--dur-exit")).toBeLessThan(ms("--dur-enter"));
    expect(ms("--dur-close")).toBeLessThan(ms("--dur-open"));
    expect(ms("--dur-press")).toBeLessThan(ms("--dur-release"));
  });
  test("every UI motion stays under 300 ms", () => {
    for (const name of ["--dur-press", "--dur-release", "--dur-hover", "--dur-enter", "--dur-exit", "--dur-move", "--dur-open", "--dur-close", "--dur-count"]) expect(ms(name), name).toBeLessThanOrEqual(300);
  });
  test("no ease in anywhere: it starts slow at the moment a person is watching", () => {
    expect(tokens).not.toMatch(/--ease-in:/);
    expect(css.replace(/ease-in-out/g, "")).not.toMatch(/\bease-in\b/);
    for (const name of ["--ease-enter", "--ease-exit", "--ease-move"]) {
      const v = token(name), b = /cubic-bezier\(([^)]*)\)/.exec(v)?.[1]?.split(",").map(Number) ?? [];
      // A curve that starts fast: its first handle rises at least as steeply as it runs (or the token names one that does).
      if (b.length === 4) expect(b[1] / Math.max(b[0], 0.001), name).toBeGreaterThanOrEqual(1);
      else expect(v, name).toMatch(/^var\(--ease-(out|enter)\)$/);
    }
  });
  test("the pages read the tokens and write no duration of their own", () => {
    const t = readTokens((n) => token(n));
    expect(t).not.toBeNull();
    expect(t!.enter).toBe(180);
    expect(t!.exit).toBeLessThan(t!.enter);
    expect(t!.slide).toBeGreaterThan(0);
    // A token that cannot be read means no motion, never a guess.
    expect(readTokens(() => "")).toBeNull();
    expect(mod).not.toMatch(/duration: \d/);
    expect(mod).not.toMatch(/\b\d{2,}ms\b/);
  });
  test("reading a duration or a length", () => {
    expect(msOf("180ms")).toBe(180);
    expect(msOf(" .2s ")).toBe(200);
    expect(msOf("fast")).toBeNull();
    expect(pxOf("6px")).toBe(6);
    expect(pxOf("1rem")).toBeNull();
    expect(translateYOf("0px 12.5px")).toBe(12.5);
    expect(translateYOf("4px")).toBe(0);
    expect(translateYOf("none")).toBe(0);
    expect(translateYOf("")).toBe(0);
  });
});

describe("what stays slides to its new place, never jumps", () => {
  const at = (top: number, left = 0): Spot => ({ top, left });
  test("a card that went: those below it start where they were and slide up", () => {
    const a = {}, b = {}, c = {};
    const before = new Map([[a, at(0)], [b, at(120)], [c, at(240)]]);
    const after = new Map([[a, at(0)], [c, at(120)]]);
    expect(slides(before, after)).toEqual([{ key: c, dy: 120 }]);
    expect(gone(before, after)).toEqual([b]);
  });
  test("a card that came in above: the rest start where they were and slide down", () => {
    const a = {}, n = {};
    expect(slides(new Map([[a, at(0)]]), new Map([[n, at(0)], [a, at(90)]]))).toEqual([{ key: a, dy: -90 }]);
  });
  test("a slide under way is carried on from where it is now, so a second change never snaps it back", () => {
    const a = {};
    expect(slides(new Map([[a, at(100)]]), new Map([[a, at(40)]]), () => -20)).toEqual([{ key: a, dy: 40 }]);
  });
  test("scrolling Home never moves anything: a box is measured inside the content, and only a change of the layout counts", () => {
    const a = {};
    // The person scrolled 100 points between two renders: the box is where it was in the content, so it does not slide.
    expect(slides(new Map([[a, at(500)]]), new Map([[a, at(500)]]))).toEqual([]);
    const hook = fnOf("useHomeMotion");
    expect(hook).toContain("seen = measure(content, boxes)");
    expect(fnOf("inContent")).toContain("top += n.offsetTop; left += n.offsetLeft;");
    expect(fnOf("measure")).not.toMatch(/scroll/i);
    // The person's own scrolling is kept up with as it happens, so only a scroll the page made itself is a shift.
    expect(hook).toContain('host.addEventListener("scroll", keep, { passive: true });');
    expect(hook).toContain("shift = now - scrolled.current");
    // And Home never moves its scroll by itself to hold things still, in any engine, so what moves is what slides.
    expect(css).toMatch(/\.home \{[^}]*overflow-anchor: none;/);
  });
  test("the tall Home moves too: its work column draws no box of its own, so its parts say what they sit in", () => {
    expect(fnOf("useHomeMotion")).toContain("const content = contentOf(top);");
    const of = fnOf("contentOf");
    expect(of).toContain("if (top.offsetParent) return top.offsetParent;");
    expect(of).toContain("for (const c of Array.from(top.children)) if (c instanceof HTMLElement && c.offsetParent) return c.offsetParent;");
  });
  test("content that got shorter pulls the scroll up: what stays slides from where it was on screen", () => {
    const a = {};
    // The scroll went from 300 to 250 as a card below went: the box, still at 400 in the content, is 50 lower on screen.
    expect(slides(new Map([[a, at(400)]]), new Map([[a, at(400)]]), () => 0, -50)).toEqual([{ key: a, dy: -50 }]);
  });
  test("of a place that went, only what was on screen is drawn again to fade, and never more than a few", () => {
    const a = {}, b = {}, c = {}, d = {};
    const before = new Map([[a, { ...at(0), height: 100 }], [b, { ...at(400), height: 100 }], [c, { ...at(120), height: 0 }], [d, { ...at(-80), height: 100 }]]);
    expect(onScreen([a, b, c, d], before, { top: 0, height: 300 })).toEqual([a, d]);
    expect(onScreen([a, b], before, { top: 350, height: 300 })).toEqual([b]);
    const many = Array.from({ length: MAX_FADES + 5 }, () => ({}));
    expect(onScreen(many, new Map(many.map((k, i) => [k, { ...at(i * 10), height: 10 }])), { top: 0, height: 1000 })).toHaveLength(MAX_FADES);
  });
  test("under a pixel is no move; a move that changed column, or flew further than a screen, is simply there", () => {
    const a = {}, b = {}, c = {};
    expect(slides(new Map([[a, at(10)], [b, at(0, 0)], [c, at(0)]]), new Map([[a, at(10.4)], [b, at(30, 200)], [c, at(MAX_SLIDE + 50)]]))).toEqual([]);
  });
});

describe("numbers count up rather than jumping", () => {
  test("it eases out from the old number to the new one, and ends exactly on it", () => {
    expect(countAt(0.1, 0.3, 0)).toBeCloseTo(0.1);
    expect(countAt(0.1, 0.3, 1)).toBe(0.3);
    expect(countAt(0.1, 0.3, 2)).toBe(0.3);
    expect(countAt(0, 1, 0.5)).toBeGreaterThan(0.5);   // an ease out: most of the way by half the time
    let last = -1;
    for (let t = 0; t <= 1; t += 0.05) { const v = countAt(0, 1, t); expect(v).toBeGreaterThanOrEqual(last); last = v; }
  });
  test("the clock's one second tick is simply the next second; a longer gap counts up", () => {
    expect(counts(4, 5, false, 1)).toBe(false);
    expect(counts(5, 35, false, 1)).toBe(true);
    expect(counts(5, 35, true, 1)).toBe(false);
  });
  test("the work card's time counts up to the time it is when Home comes back, on whole seconds, in the same words", () => {
    expect(timeLine(65)).toBe("1:05 so far");
    expect(timeLine(4.6), "a count on its way lands on whole seconds").toBe("0:05 so far");
    expect(timeLine(0)).toBe("0:00 so far");
    expect(card).toContain('<p className="job-meta"><span><CountUp value={Math.max(0, Math.floor((clock - (jobStart.current?.at ?? clock)) / 1000))} words={timeLine} step={1} /></span></p>');
  });
  test("it writes its words only when they change, and a new number takes over from wherever the count is", () => {
    const up = fnOf("CountUp");
    expect(up).toContain("if (el.textContent !== w) el.textContent = w;");
    expect(up).toContain("const from = shown.current");
    expect(up).toContain("return () => cancelAnimationFrame(frame);");
    // Timed by the frames' own clock from its first frame, so it ends on time whatever the page's clock says.
    expect(up).toContain("if (start < 0) start = at;");
    expect(up).not.toContain("performance.now()");
  });
  test("only up, only when motion is not reduced, and only for real numbers", () => {
    expect(counts(0.1, 0.3, false)).toBe(true);
    expect(counts(0.3, 0.1, false), "a new task starting lower is simply its number").toBe(false);
    expect(counts(0.3, 0.3, false)).toBe(false);
    expect(counts(0.1, 0.3, true), "Reduce motion or Less motion: the number is simply there").toBe(false);
    expect(counts(Number.NaN, 0.3, false)).toBe(false);
  });
  test("the working line's cost is what counts; its words are the same as before", () => {
    const ev = (o: Record<string, unknown>) => ({ v: 1, id: "e", ...o });
    const m = [ev({ type: "checkpoint.created", agent: "a", checkpoint: "cp_1", label: "Before: fix it", files: 1, skipped: [] }), ev({ type: "agent.state", agent: "a", state: "working" }), ev({ type: "cost.update", agent: "a", usdEstimate: 0.12 })]
      .reduce<Model>((s, e) => reduce(s, e as never), initial());
    const h = heroWords(m, "/p");
    expect(m.task?.costUsd).toBe(0.12);
    expect(h.count).toBe(0.12);
    expect(h.line).toBe(workingLine(0.12));
    expect(heroWords(initial(), "/p").count).toBeUndefined();
    expect(card).toContain("{heroShown.count != null ? <CountUp value={heroShown.count} words={workingLine} /> : heroShown.line}");
  });
});

describe("nothing moves with Reduce motion or Less motion", () => {
  afterEach(() => { delete g.matchMedia; _resetForTests(); });
  test("every move in the module asks the one helper first", () => {
    expect(mod).toMatch(/from "\.\/motion\.ts";/);
    for (const fn of ["enterPlace", "drawGhosts", "foldAway", "fadeAway", "slideTo"]) {
      const body = mod.slice(mod.indexOf(`function ${fn}(`));
      expect(body.split("\n")[1]?.trim(), fn).toBe("if (reducedMotion()) return;");
    }
  });
  test("nothing is measured while Home is away or motion is reduced, so a render then costs nothing", () => {
    expect(fnOf("useHomeMotion")).toContain("if (!shown || reducedMotion() || !host || !top) { last.current = null; return; }");
  });
  test("the stylesheets stop every animation and transition (the rule the new ones live under)", () => {
    const style = STYLE_CSS();
    expect(style).toContain("@media (prefers-reduced-motion: reduce) { *, *::before, *::after { animation: none !important; transition: none !important; } }");
    expect(style).toContain(":root[data-less-motion] *, :root[data-less-motion] *::before, :root[data-less-motion] *::after { animation: none !important; transition: none !important; }");
  });
  test("Less motion counts as reduced for the count too", () => {
    takeSnapshot({ values: { "character.motion": "less" }, usual: {}, project: "", migrated: ["pageStorage.v1"], problems: [], changed: [] }, null);
    expect(mod).toContain("counts(from, value, reducedMotion(), step)");
  });
});

describe("only transform and opacity move", () => {
  const frames = (name: string) => new RegExp(`@keyframes ${name} \\{([^\\n]*)\\}`).exec(css)?.[1] ?? "";
  const props = (body: string) => [...body.matchAll(/([a-z-]+):/g)].map((m) => m[1]);
  test("many ghosts cost one layout: each is drawn first (writes only), then all are read", () => {
    expect(fnOf("ghostOf")).not.toMatch(/offset[A-Z]|getComputedStyle|getBoundingClientRect/);
    const draw = fnOf("drawGhosts");
    expect(draw.indexOf("list.map(")).toBeLessThan(draw.indexOf("ghost.offsetParent"));
  });
  test("Home's drop, its roll up, a card growing in, a menu, a toast, a sheet", () => {
    for (const k of ["home-spring", "home-roll-up", "card-in", "ui-menu-in", "ui-toast-in", "ui-sheet-in", "ui-fade-in"]) {
      const body = frames(k);
      expect(body, k).not.toBe("");
      for (const p of props(body)) expect(["opacity", "transform"], `${k}: ${p}`).toContain(p);
    }
  });
  test("no transition: all, and no layout property in a transition", () => {
    expect(css).not.toMatch(/transition:\s*all\b/);
    for (const m of PARTS_CSS().matchAll(/transition: ([^;]+);/g)) expect(m[1]).not.toMatch(/\b(width|height|top|left|margin|padding)\b/);
  });
  test("the module moves things with transform, translate and opacity only", () => {
    const sets = [...mod.matchAll(/\.animate\(\[([^\]]*)\]/g), ...mod.matchAll(/drawGhosts\(list, shift, \[([^\]]*)\]/g)];
    expect(sets.length).toBeGreaterThanOrEqual(4);
    for (const m of sets) for (const p of props(m[1].replace(/"[^"]*"|`[^`]*`/g, "x"))) expect(["opacity", "transform", "translate"], p).toContain(p);
  });
});

describe("nothing moves at rest", () => {
  test("with the light off (the usual), the room it would draw is paused as well as hidden, so it makes no frames", () => {
    const off = /:root\[data-light="off"\] \{([^}]*)\}/.exec(tokens)?.[1] ?? "";
    expect(off).toContain("--room-show: 0;");
    expect(off).toContain("--room-play: paused;");
    // Read after every rule that starts the room's drift (a shorthand animation sets the play state back to running), as
    // specific as the most specific of them (three classes), and before How lively's Still, which stays the stronger.
    const hold = ":root .home .room > * { animation-play-state: var(--room-play); }";
    for (const start of ["animation: room-breathe", "animation: rays-sway", "animation: motes-rise"]) expect(css.indexOf(hold), start).toBeGreaterThan(css.lastIndexOf(start));
    expect(css.indexOf(hold)).toBeLessThan(css.indexOf(".home[data-still] .room > * { animation-play-state: paused; }"));
    expect(css.indexOf(hold)).toBeLessThan(css.indexOf('.home[data-still][data-tone="done"] .room-glow { animation-play-state: paused, running; }'));
  });
  test("the module's moves all end: none of them repeats", () => {
    expect(mod).not.toMatch(/iterations|Infinity|infinite/);
  });
});

describe("Home drops from the notch in one smooth motion", () => {
  test("one motion on the tokens, and its parts no longer come in one after another", () => {
    expect(css).toMatch(/\.home\.springing \{ animation: home-spring var\(--dur-open\) var\(--ease-enter\) both; \}/);
    expect(css).toMatch(/\.home\.closing \{ animation: home-roll-up var\(--dur-close\) var\(--ease-exit\) both; \}/);
    expect(css).not.toMatch(/\.home\.springing \.[\w-]+ \{ animation/);
  });
  test("it rolls back up in the time the shell waits before hiding it", () => {
    const main = read("../src-tauri/src/main.rs");
    expect(ms("--dur-close")).toBe(Number(/const HOME_CLOSE_MS: u64 = (\d+);/.exec(main)?.[1]));
  });
});

describe("cards grow in and fold away", () => {
  test("a card grows in from a little smaller, on the entrance tokens", () => {
    expect(css).toMatch(/@keyframes card-in \{ from \{ opacity: 0; transform: translateY\(var\(--rise\)\) scale\(var\(--grow-from\)\); \} \}/);
    expect(css).toMatch(/\.home \.view \.panel \{[^}]*animation: card-in var\(--dur-enter\) var\(--ease-enter\) both;/);
    expect(css).not.toMatch(/card-in var\(--dur-2\)/);
  });
  test("one that goes is drawn once more where it was, hidden from VoiceOver and the keyboard, and folds away", () => {
    const ghost = fnOf("ghostOf"), fold = fnOf("foldAway");
    expect(ghost).toContain('setAttribute("aria-hidden", "true")');
    expect(ghost).toContain("inert = true");
    expect(ghost).toContain('querySelectorAll("[id]")');
    expect(fold).toContain("t.exit");
    expect(fold).toContain("t.easeExit");
    expect(fnOf("drawGhosts")).toContain("ghost.remove()");
  });
  test("a copy never changes the real page: no name to join a choice's group, nothing that loads or plays again", () => {
    const ghost = fnOf("ghostOf");
    expect(ghost).toContain('querySelectorAll("[name]"))) n.removeAttribute("name")');
    expect(ghost).toContain("el.matches(LOADS) || el.querySelector(LOADS)");
    expect(mod).toContain('const LOADS = "iframe, video, audio, object, embed";');
    expect(ghost).toContain('transition: "none"');
    // Live Flowflow is drawn on a canvas, and a copied canvas comes up blank: the copy has none, and shows the still picture
    // of the same pose that sits under it instead (never a read back of the drawing).
    expect(ghost).toContain('ghost.querySelectorAll("canvas"))) c.remove();');
    expect(ghost).toContain('ghost.querySelectorAll(".flow-ready"))) n.classList.remove("flow-ready");');
    expect(ghost).not.toMatch(/drawImage|getImageData|toDataURL/);
    const ch = read("./homeCharacter.tsx");
    expect(ch).toContain('<img className={`home-pose${flow.ready ? " flow-ready" : ""}`}');
    // With Draw live on, the same still picture waits hidden under the live water, for the copy to show.
    expect(ch).toContain('<img className="home-pose flow-ready" src={poseUrl(pose)} alt="" draggable={false} />');
    expect(STYLE_CSS()).toContain(".home-pose.flow-ready { visibility: hidden; }");
  });
  test("Home follows it: places, cards and what stays", () => {
    expect(card).toMatch(/import \{ CountUp, useHomeMotion \} from "\.\/smoothMotion\.ts";/);
    expect(card).toContain("useHomeMotion(root, work, view, home.tab, homeOpen);");
    expect(card).toContain('<div className="work" ref={work}>');
    expect(card).toMatch(/<div className="view" ref=\{view\}/);
  });
});

describe("moving between places is a short cross fade and a small slide", () => {
  test("the place that went fades out where it was, quicker, and only then the new one fades and rises in", () => {
    const hook = fnOf("useHomeMotion");
    expect(hook).toContain("if (was.place !== place) {");
    expect(hook).toContain("fadeAway(went.filter((g) => shownBefore.has(g.el)), shift, t);");
    // Only what is new in the place comes in: what stays (a note shown on every place) is never faded out and in again.
    expect(hook).toContain("enterPlace(boxes.filter((b) => seen.has(b) && !was.seen.has(b)), t);");
    const fade = fnOf("fadeAway");
    expect(fade).toContain("[{ opacity: 1 }, { opacity: 0 }], t.exit, t.easeExit");
    const enter = fnOf("enterPlace");
    // The review, 3 Nov 2026: the old place under the new one drew text over text. The new place waits until the old one
    // is gone (it rises only after --dur-exit), and holds its first frame (invisible) while it waits.
    expect(enter).toContain("{ duration: t.enter, delay: t.exit, easing: t.easeEnter, fill: \"backwards\" }");
    expect(enter).toContain("translateY(${t.slide}px)");
    expect(ms("--dur-exit")).toBeLessThan(ms("--dur-enter"));
    expect(pxOf(token("--slide-place"))).toBeLessThanOrEqual(8);
  });
  test("the top bar never moves: it is how a person knows where they are", () => {
    expect(fnOf("enterPlace")).toContain('if (b.matches(".bar")) continue;');
  });
});

describe("buttons answer a press, and a hover is a soft change", () => {
  const parts = PARTS_CSS();
  test("a button presses in quickly and lets go a little slower; its colours change softly", () => {
    const btn = /\n\.btn \{([^}]*)\}/.exec(parts)?.[1] ?? "";
    expect(btn).toContain("transition: background-color var(--dur-hover) var(--ease-hover), color var(--dur-hover) var(--ease-hover), border-color var(--dur-hover) var(--ease-hover), box-shadow var(--dur-hover) var(--ease-hover), transform var(--dur-release) var(--ease-out);");
    expect(parts).toMatch(/\.btn:active:not\(:disabled\) \{[^}]*transform: scale\(var\(--press\)\);[^}]*transition-duration: var\(--dur-press\);/);
  });
  test("a row in a list presses in too, only a little", () => {
    for (const sel of [".sb-item", ".ui-recent"]) {
      expect(parts, sel).toMatch(new RegExp(`\\${sel}:active \\{[^}]*transform: scale\\(var\\(--press-row\\)\\);`));
      expect(parts, sel).toMatch(new RegExp(`\\n\\${sel} \\{[^}]*transition: [^;]*transform var\\(--dur-release\\)`));
    }
    expect(Number(token("--press-row"))).toBeGreaterThan(Number(token("--press")));
  });
  test("the back arrows, a notch row and a disclosure answer the same way: soft under the pointer, quick in, slower out", () => {
    const style = STYLE_CSS();
    expect(style).toContain(".back { transition: background-color var(--dur-hover) var(--ease-hover), color var(--dur-hover) var(--ease-hover), opacity var(--dur-hover) var(--ease-hover), transform var(--dur-release) var(--ease-out); }");
    for (const sel of ["\\.fr-back", "\\.island-panel \\.ip-job"]) expect(style, sel).toMatch(new RegExp(`\\n${sel} \\{[^}]*transition: background-color var\\(--dur-hover\\) var\\(--ease-hover\\), transform var\\(--dur-release\\) var\\(--ease-out\\); \\}`));
    expect(style).toContain(":is(.back, .fr-back, .island-panel .ip-job, .island-panel .ip-answer button):not(:disabled):active { transform: scale(var(--press)); transition-duration: var(--dur-press); }");
    expect(parts).toMatch(/\.ui-disc-head \{[^}]*transition: background-color var\(--dur-hover\) var\(--ease-hover\), transform var\(--dur-release\) var\(--ease-out\);/);
    expect(parts).toContain(".ui-disc-head:active { transform: scale(var(--press-row)); transition-duration: var(--dur-press); }");
  });
});
