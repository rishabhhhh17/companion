// M65 step 2, Home in the Instrument look (4 Nov 2026, the founder: the look is "too childish"; look A from the lab): the
// status line with its dot over a 17 point headline, one sentence under it, rectangle buttons, the small faceless orb with
// its ring at the right and no water band, a quiet ask field with its key caps, the footer line, and no chatty helper
// line. Friendly keeps today's Home whole. The logic is plain code (homeHero.ts); the page is read as text.
import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { heroLineSaid, heroRingOf, heroStatusOf, homeFoot, lineSaidByStatus, statusLineShown, statusSubShown, type HomeMode, type HeroTone, type HomeStatus } from "./homeHero.ts";
import { ALL_CSS } from "./ui/cssFiles.ts";
import { S } from "./strings.ts";
import { homeRingShown, ringOf } from "./characters.ts";

const read = (p: string) => readFileSync(new URL(p, import.meta.url), "utf8");
const card = read("./card.tsx"), homeChar = read("./homeCharacter.tsx"), onboarding = read("./onboarding.tsx"), home = read("./ui/home.css"), css = ALL_CSS();
const tokens = read("./ui/tokens.css");
const instrumentBlock = /\n:root\[data-style="instrument"\] \{([^}]*)\}/.exec(tokens)?.[1] ?? "";
const rootBlock = /\n:root \{([^}]*)\}/.exec(tokens)?.[1] ?? "";
const st = (kind: HomeStatus["kind"]): Pick<HomeStatus, "kind"> => ({ kind });

describe("the status line says the state in words", () => {
  test("a job at work is Working", () => {
    expect(heroStatusOf("working", st("unchecked"), "working")).toBe("working");
  });
  test("a question, something to look at, changes to review and a block are Needs you (never Not fixed yet for a missing key)", () => {
    for (const mode of ["question", "needs", "review", "blocked"] as HomeMode[]) expect(heroStatusOf(mode, st("works"), "needsYou")).toBe("needs");
  });
  test("changes rated stop (or a key in the code) say Fix this first in red, with a red ring, never amber (M65 step 4)", () => {
    expect(heroStatusOf("review", st("works"), "needsYou", true)).toBe("fixFirst");
    // M69 step 3: while the parts download there is nothing for the person to do yet: Working, not Needs you.
    expect(heroStatusOf("blocked", st("works"), "needsYou", false, "claudeGetting")).toBe("working");
    expect(heroStatusOf("blocked", st("works"), "needsYou", false, "key")).toBe("needs");
    expect(heroStatusOf("needs", st("works"), "needsYou", true)).toBe("needs");   // only the review's own stop
    expect(S.ui.status.fixFirst).toBe("Fix this first");
    expect(heroRingOf("review", "fixFirst")).toBe("stop");
    expect(card).toContain("heroStatusOf(mode, status, hero.tone, !!rlead?.stop, blocker)");
    expect(read("./ui/parts.tsx")).toMatch(/fixFirst: "stop"/);
  });
  test("a result says its verdict: only a proven fix is Proven", () => {
    const want: Record<HeroTone, string> = { done: "proven", notDone: "stop", partly: "notChecked", plain: "notChecked", needsYou: "needs", working: "working", idle: "notChecked" };
    for (const [tone, kind] of Object.entries(want)) expect(heroStatusOf("result", st("works"), tone as HeroTone)).toBe(kind as never);
  });
  test("at rest, how the project is from its last check", () => {
    expect(heroStatusOf("rest", st("works"), "idle")).toBe("proven");
    expect(heroStatusOf("rest", st("failing"), "idle")).toBe("stop");
    expect(heroStatusOf("rest", st("changed"), "idle")).toBe("notChecked");
    expect(heroStatusOf("rest", st("unchecked"), "idle")).toBe("notChecked");
  });
  test("no status line for an answer, or with no project yet", () => {
    expect(heroStatusOf("answer", st("works"), "done")).toBeNull();
    expect(heroStatusOf("rest", st("noProject"), "idle")).toBeNull();
  });
  test("a line under the headline that only says the status again is marked, so Instrument says it once", () => {
    expect(lineSaidByStatus("working", S.look.workingFree)).toBe(true);
    expect(lineSaidByStatus("working", S.look.working("12 cents"))).toBe(false);
    expect(lineSaidByStatus(null, "Working")).toBe(false);
    expect(card).toContain('"data-line-said": !statusFirst && heroLineSaid(heroStatus, heroShown.headline, heroLine)');   // M71: on the Lead's words
  });
  test("it steps aside when the headline already says the same words", () => {
    expect(statusLineShown("notChecked", S.home.notChecked)).toBe(false);
    expect(statusLineShown("notChecked", "my-shop changed since its last check")).toBe(true);
    expect(statusLineShown(null, "anything")).toBe(false);
  });
});

describe("the orb's ring agrees with the status line", () => {
  test("each status's ring is its meaning, and Not checked yet has none", () => {
    expect(heroRingOf("result", "proven")).toBe("proven");
    expect(heroRingOf("result", "stop")).toBe("stop");
    expect(heroRingOf("needs", "needs")).toBe("needs");
    expect(heroRingOf("working", "working")).toBe("working");
    expect(heroRingOf("result", "notChecked")).toBeNull();
    expect(heroRingOf("answer", null)).toBeNull();
  });
  test("at rest there is no ring, whatever the last check said (the lab)", () => {
    for (const k of ["proven", "stop", "notChecked"] as const) expect(heroRingOf("rest", k)).toBeNull();
  });
});

describe("the footer line", () => {
  test("when it was checked on one side and Undo is ready on the other", () => {
    expect(homeFoot({ ago: "4 minutes ago" }, true)).toEqual({ start: S.home.checkedAgo("4 minutes ago"), end: S.home.undoReady });
    expect(homeFoot({ ago: "4 minutes ago" }, false)).toEqual({ start: S.home.checkedAgo("4 minutes ago"), end: "" });
    expect(homeFoot({ ago: "" }, true)).toEqual({ start: "", end: S.home.undoReady });
  });
  test("none when it would say nothing", () => {
    expect(homeFoot({ ago: "" }, false)).toBeNull();
  });
  test("the line under the headline is not said twice when the footer says it", () => {
    const foot = homeFoot({ ago: "just now" }, false);
    expect(statusSubShown(S.home.checkedAgo("just now"), foot)).toBe("");
    expect(statusSubShown(S.home.inProject("my-shop"), foot)).toBe(S.home.inProject("my-shop"));
    expect(statusSubShown(S.home.checkedAgo("just now"), null)).toBe(S.home.checkedAgo("just now"));
  });
  test("its words are plain and live in strings.ts", () => {
    expect(S.home.undoReady).toBe("Undo is ready");
    expect(S.home.undoReady).not.toContain("—");
  });
});

describe("Home draws them for every style and the tokens show them only in Instrument", () => {
  test("the page never branches on the style: no look.style in card.tsx (lookChoices.test.ts)", () => {
    expect(card).not.toContain('"look.style"');
    expect(card).not.toContain("instrument &&");
  });
  test("the status line, the footer line and the ring come from homeHero.ts", () => {
    // M69 step 2: at rest the tag is homeRest.ts's (never Not checked yet next to a proven run); otherwise homeHero.ts's.
    // M71: the tag is the meaning's (meaning.ts), in its colour; a waiting practice says Practice ready, never needs you.
    expect(card).toContain(": statusLineShown(heroStatus, statusFirst ? status.verdict.headline : heroShown.headline) && <Tag meaning={leadMeaning}");
    expect(card).toContain("restWords.pill && <Tag meaning={PILL_MEANING[restWords.pill]} words={S.homeNow.pill[restWords.pill]} />");
    // M69 (one layout grammar, the YC benchmark spec 3): the footer line's words moved into the top bar's context line in
    // every look and both layouts (homeLayout.ts barContext), so no FootLine is drawn on Home any more.
    expect(card).not.toContain("<FootLine");
    // M69 step 3: only while the hero does not already say when it was checked (at rest and over a result it does).
    expect(card).toContain("const barLine = barContext({ project, foot: atRest || resHero ? null : foot, about: m.about, tall: !side });");
    expect(card).toContain("ring={heroRingOf(mode, heroStatus)}");
    expect(card).toContain('data-foot-says={status.sub && !statusSubShown(status.sub, foot) ? "" : undefined}');
  });
  test("Home's page loads home.css after the wide look", () => {
    expect(card).toContain('import "./ui/wide.css";\nimport "./ui/home.css";\n');
    expect(css).toContain(home);
  });
  test("Home's character is the faceless orb when the look's character is the orb, with no live water running under it", () => {
    expect(homeChar).toContain("const look = useCharacter();");   // M72: the character in force (settingsStore characterNow)
    expect(homeChar).toContain("const orb = look !== \"friendly\";");
    expect(homeChar).toContain("off: live || orb");
    expect(homeChar).toContain("const shownRing = homeRingShown(state, ring);");
    expect(homeChar).toContain("<Orb src={orbSrc} ring={shownRing} />");
    // M68: the Visor, the usual under Instrument, in the same place with the same ring.
    expect(homeChar).toContain("<Visor state={state} ring={shownRing} lively={mode} reacts={reacts} still={resting} glance={news} toward={-1} />");
    expect(homeChar).not.toMatch(/home-orb[^\n]*(eye|face|bubble)/);
  });
});

describe("home.css", () => {
  const rules = home.replace(/\/\*[\s\S]*?\*\//g, "").split("}").map((r) => r.trim()).filter(Boolean);
  const rule = (sel: string) => rules.find((r) => r.startsWith(sel + " {")) ?? "";
  test("it reads no look attribute: the orb is found by its own part, the style by tokens", () => {
    expect(home).not.toMatch(/\[data-(style|character|theme|tone)=/);
  });
  test("every style switch falls back to today's look, so Friendly is unchanged", () => {
    for (const t of ["--hero-status-show", "--home-foot-show", "--hero-chatty-show", "--hero-say-show", "--hero-mark-show", "--status-sub-indent", "--ask-shadow", "--ask-focus-shadow", "--ask-pad", "--ask-band", "--first-title-size", "--first-title-lh", "--first-title-track", "--first-title-2"]) {
      expect(home, t).toMatch(new RegExp(`var\\(${t}, `));
      expect(instrumentBlock, t).toContain(`${t}: `);
      expect(rootBlock, t).not.toContain(`${t}:`);
    }
    expect(rule(".home .hero-words > .ui-status")).toContain("display: var(--hero-status-show, none)");
    expect(rule(".home .askwrap > .ui-foot")).toContain("display: var(--home-foot-show, none)");
    expect(rule(".home .askwrap .ask")).toContain("box-shadow: var(--ask-shadow, inset 0 var(--hair) 3px var(--sheen-top), 0 var(--hair) 4px var(--sheen-drop), 0 14px 30px -14px var(--el-shadow))");
  });
  test("Instrument shows the status line and the footer, and leaves out the chatty lines and the bubble", () => {
    expect(instrumentBlock).toContain("--hero-status-show: flex;");
    expect(instrumentBlock).toContain("--home-foot-show: flex;");
    expect(instrumentBlock).toContain("--hero-chatty-show: none;");
    expect(instrumentBlock).toContain("--hero-say-show: none;");
    expect(rule(".home .askwrap .ask-hint")).toContain("display: var(--hero-chatty-show, block)");
    expect(rule(".home .hero .say")).toContain("display: var(--hero-say-show, inline-block)");
  });
  test("with the orb there is no water band, no sea under it, no glow and no fade", () => {
    expect(rule(".home:has(.hero .home-orb) .home-pond > .ch-water")).toContain("display: none");
    expect(rule(".home:has(.hero .home-orb) .home-pond .ch-char")).toContain("mask-image: none");
    // M71: the pond's glow and the sea fill are gone for every character, so they need no rule to hide them.
    expect(rule(".home .home-pond::after")).toBe("");
    expect(rule(".home[data-side] .sea-fill")).toBe("");
  });
  test("the orb is about 40 points at the right of the words, and the words keep their own column", () => {
    expect(rule(".home:has(.hero .home-orb) .hero[data-mode]")).toContain("--char: var(--orb);");
    const words = rule(".home:has(.hero .home-orb) .hero[data-mode] .hero-words");
    expect(words).toContain("grid-column: 1;");
    expect(words).toContain("padding-right: 0;");
  });
  test("the first run's orb has no water, no drop and no ripple, and settles in with no overshoot", () => {
    expect(onboarding).toContain('className="fr-tank"');
    expect(rule(".fr:has(.home-orb) .fr-tank .waterline")).toContain("display: none");
    expect(rule(".fr-hello:has(.home-orb) .fr-drop, .fr-hello:has(.home-orb) .fr-ripple")).toContain("display: none");
    expect(rule(".fr-hello .fr-rise:has(.home-orb)")).toContain("var(--ease-spring)");
  });
  test("no colour of its own, and corners and type from tokens", () => {
    expect(home).not.toMatch(/#[0-9a-f]{3,8}\b|\b(rgba?|hsla?)\(/i);
    for (const m of home.matchAll(/border-radius: ([^;]+);/g)) expect(m[1]).toMatch(/^var\(--r-[\w-]+\)$/);
    for (const m of home.matchAll(/font-size: ([^;]+);/g)) expect(m[1]).toMatch(/^var\(--(t-[\w-]+|first-title-size)/);
  });
});

describe("the review card leads with its one line when Home's top says the rating (M65 step 4)", () => {
  test("a stop or a key in the code: the status line says Fix this first, so the card does not say it again", async () => {
    const { reviewHeroSays, reviewLead } = await import("./homeHero.ts");
    const P = "/Users/me/shop";
    const rc = { project: P, batch: "rv_0123456789", stage: "ready", files: [], count: 4, capped: false, secretFiles: [], auto: false, proof: false, asked: false, fix: null, note: null, result: null, keys: [{ file: "src/pay.ts", line: 12 }] } as never;
    expect(reviewHeroSays("review", reviewLead(rc, P), rc)).toBe(true);
    const plain = { ...(rc as object), keys: undefined } as never;
    expect(reviewHeroSays("review", reviewLead(plain, P), plain)).toBe(false);
    expect(reviewHeroSays("rest", reviewLead(rc, P), rc)).toBe(false);
    expect(card.match(/heroSays=\{reviewHeroSays\(mode, rlead, m\.review\)\}/g)?.length).toBe(2);
  });
});

describe("Working is said once (M68 step 3)", () => {
  test("the line under the headline steps aside when the headline already says it, with or without the status line", () => {
    // The headline says Working, so the status line hides; the line under it said Working too and stayed (the review).
    expect(heroLineSaid("working", "Working", "Working")).toBe(true);
    expect(heroLineSaid("working", "Fix the header", S.look.workingFree)).toBe(true);
    expect(heroLineSaid(null, "Working", " working ")).toBe(true);
    expect(heroLineSaid("working", "Fix the header", S.look.working("12 cents"))).toBe(false);
    expect(heroLineSaid(null, "Fix the header", "Reading the files")).toBe(false);
  });
});

describe("listening shows one ring everywhere (M68 step 3)", () => {
  test("Home shows the same ring for hold to talk as the edge and the notch, even at rest", () => {
    expect(homeRingShown("listening", null)).toBe(ringOf("listening"));
    expect(homeRingShown("listening", undefined)).toBe(ringOf("listening"));
    expect(homeRingShown("idle", null)).toBe(null);
    expect(homeRingShown("working", "needs")).toBe("needs");
    expect(homeRingShown("done", undefined)).toBe(ringOf("done"));
    expect(homeChar).toContain("homeRingShown(state, ring)");
  });
});
