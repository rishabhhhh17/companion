// M68 step 2b, the notch has presence (the founder, 4 Nov 2026: "there is still no notch like how HeyClicky has, like hey
// Rishabh or something"). Written before the code (rule 17). At rest the notch shows small wings: the Visor's lights on the
// left, and on the right one short word or a tick when there is something, nothing when there is nothing. A hello widens
// it for about 3 seconds when the app starts, when the Mac wakes, or when the person comes back after more than an hour
// away: "Hey <name>" plus at most one plain fact. Never more than once an hour, never while a call app is in front (rule 7),
// never while Home is open or a question already has the notch, and never with its setting off. The name is the one the
// person typed (you.name); the Mac account name is never read.
import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { initial, type HistoryItem, type Model } from "./model.ts";
import type { ReviewCard } from "./review.ts";
import { AWAY_MS, cleanName, HELLO_GAP_MS, HELLO_SHOW_MS, helloDue, helloFact, helloLine, helloGate, lastHelloFrom, restWings, restWingState, SLEPT_GAP_MS, wokeAfter, type HelloCheck } from "./notchHello.ts";
import { S } from "./strings.ts";
import { DEFAULT_YOURS, NAME_MAX, yoursSettings } from "./onboarding.ts";
import { PAGES } from "./settingsPages.ts";

const read = (p: string) => readFileSync(new URL(p, import.meta.url), "utf8");
const P = "/Users/me/my-shop";
const NOW = Date.parse("2026-11-04T12:00:00Z");
const row = (o: Partial<HistoryItem> = {}): HistoryItem => ({ id: 1, label: "Fix the join button", status: "done", usd: 0.05, startedAt: "2026-11-04T09:50:00Z", endedAt: "2026-11-04T10:00:00Z", checkpoint: "cp_9", changed: 1, proof: "passed", ...o });
const review = (count: number, stage: ReviewCard["stage"] = "ready"): ReviewCard => ({ project: P, batch: "rv_1a2b", stage, files: [], count, capped: false, secretFiles: [], auto: false, proof: false, asked: false, fix: null, note: null, result: null });
const approval = { approval: "ap_1", agent: "a", checkpoint: "cp", toolUseId: "t", risk: "irreversible", title: "install a package", expiresAt: "2099-01-01T00:00:00Z" };
const m = (o: Partial<Model> = {}): Model => ({ ...initial(), folder: P, ...o });
const base: HelloCheck = { why: "start", now: NOW, last: null, on: true, quiet: false, homeOpen: false, asking: false, kind: "notch", hidden: false };

describe("when the hello shows, and when it never does", () => {
  test("when the app starts, and when the Mac wakes", () => {
    expect(helloDue(base)).toBe(true);
    expect(helloDue({ ...base, why: "wake" })).toBe(true);
  });
  test("back after more than an hour away, never after less", () => {
    expect(helloDue({ ...base, why: "back", awayMs: AWAY_MS + 1 })).toBe(true);
    expect(helloDue({ ...base, why: "back", awayMs: AWAY_MS })).toBe(false);
    expect(helloDue({ ...base, why: "back", awayMs: 20 * 60_000 })).toBe(false);
    expect(helloDue({ ...base, why: "back" })).toBe(false);
    expect(AWAY_MS).toBe(60 * 60_000);
  });
  test("at most once an hour, whatever the reason (a restart, a wake, a return)", () => {
    expect(HELLO_GAP_MS).toBe(60 * 60_000);
    for (const why of ["start", "wake", "back"] as const) {
      const c = { ...base, why, awayMs: 2 * AWAY_MS };
      expect(helloDue({ ...c, last: NOW - 5 * 60_000 }), why).toBe(false);
      expect(helloDue({ ...c, last: NOW - HELLO_GAP_MS + 1 }), why).toBe(false);
      expect(helloDue({ ...c, last: NOW - HELLO_GAP_MS }), why).toBe(true);
    }
    // A clock set back never blocks it for good.
    expect(helloDue({ ...base, last: NOW + 3 * HELLO_GAP_MS })).toBe(true);
  });
  test("only on a real notch: never on the pill in the menu bar or the edge line (step 4 review)", () => {
    expect(helloDue({ ...base, kind: "pill" })).toBe(false);
    expect(helloDue({ ...base, kind: "edge" })).toBe(false);
    expect(helloDue({ ...base, why: "wake", kind: "pill" })).toBe(false);
  });
  test("never while the island page is hidden: a hidden panel never uses up the hour (step 4 review)", () => {
    expect(helloDue({ ...base, hidden: true })).toBe(false);
    expect(helloDue({ ...base, why: "wake", hidden: true })).toBe(false);
  });
  test("never while a call app is in front (the presentation check, rule 7), never with its setting off", () => {
    expect(helloDue({ ...base, quiet: true })).toBe(false);
    expect(helloDue({ ...base, why: "wake", quiet: true })).toBe(false);
    expect(helloDue({ ...base, on: false })).toBe(false);
  });
  test("never over Home, and never over a question or a result that already has the notch", () => {
    expect(helloDue({ ...base, homeOpen: true })).toBe(false);
    expect(helloDue({ ...base, asking: true })).toBe(false);
  });
  test("it shows for about 3 seconds", () => {
    expect(HELLO_SHOW_MS).toBeGreaterThanOrEqual(2500);
    expect(HELLO_SHOW_MS).toBeLessThanOrEqual(3500);
  });
  test("a wake is a timer that fired a minute or more late (the Mac slept); a busy page is not a wake", () => {
    expect(SLEPT_GAP_MS).toBe(60_000);
    expect(wokeAfter(NOW - 15_000, NOW, 15_000)).toBe(0);
    expect(wokeAfter(NOW - 40_000, NOW, 15_000)).toBe(0);
    expect(wokeAfter(NOW - 15_000 - SLEPT_GAP_MS, NOW, 15_000)).toBe(15_000 + SLEPT_GAP_MS);
    expect(wokeAfter(NOW - 3 * AWAY_MS, NOW, 15_000)).toBe(3 * AWAY_MS);
    expect(wokeAfter(NOW + 5_000, NOW, 15_000), "a clock set back is not a wake").toBe(0);
  });
  test("the last hello's time is read safely: nothing, junk or a negative number is none", () => {
    expect(lastHelloFrom(null)).toBeNull();
    expect(lastHelloFrom("")).toBeNull();
    expect(lastHelloFrom("soon")).toBeNull();
    expect(lastHelloFrom("-4")).toBeNull();
    expect(lastHelloFrom(String(NOW))).toBe(NOW);
  });
});

describe("the hello's line: the name typed, or none, and one fact at most", () => {
  test("with a name: Hey and the name", () => {
    expect(helloLine("Rishabh", null)).toEqual({ greet: "Hey Rishabh", fact: null, say: "Hey Rishabh." });
  });
  test("with no name: a plain hello, never a guess at the person's name", () => {
    expect(helloLine("", null).greet).toBe("Hi there");
    expect(helloLine("   ", null).greet).toBe("Hi there");
    const page = read("./notchHello.ts") + read("./island.tsx");
    for (const banned of ["NSUserName", "userName", "os.userInfo", "USER", "fullName", "account_name"]) expect(page, banned).not.toContain(banned);
  });
  test("with a fact: the greeting, then the fact", () => {
    expect(helloLine("Rishabh", "my-shop has 3 changes to review")).toEqual({ greet: "Hey Rishabh", fact: "my-shop has 3 changes to review", say: "Hey Rishabh. my-shop has 3 changes to review." });
    expect(helloLine("", "Everything checked is fine").say).toBe("Hi there. Everything checked is fine.");
  });
  test("a name is one line, cut to 24, and nothing that is not a string", () => {
    expect(cleanName("  Rishabh  ")).toBe("Rishabh");
    expect(cleanName("Ri\nshabh\t K")).toBe("Ri shabh K");
    expect(cleanName("x".repeat(40))).toBe("x".repeat(24));
    for (const junk of [undefined, null, 3, {}, ["a"]]) expect(cleanName(junk), String(junk)).toBe("");
  });
  test("one fact at most, the most useful first: questions, changes to review, a problem, then all fine; none when nothing is known", () => {
    expect(helloFact(m(), NOW)).toBeNull();
    expect(helloFact(m({ folder: null }), NOW)).toBeNull();
    expect(helloFact(m({ history: [row()] }), NOW)).toBe("Everything checked is fine");
    expect(helloFact(m({ history: [row({ status: "not_done", proof: "failed" })] }), NOW)).toBe("my-shop has a problem");
    expect(helloFact(m({ history: [row()], review: review(3) }), NOW)).toBe("my-shop has 3 changes to review");
    expect(helloFact(m({ review: review(1) }), NOW)).toBe("my-shop has 1 change to review");
    expect(helloFact(m({ review: review(3, "reviewed") }), NOW), "a review already done is not news").toBeNull();
    expect(helloFact(m({ history: [row()], review: review(3), approvals: [approval as never] }), NOW)).toBe("1 question is waiting for you");
    expect(helloFact(m({ approvals: [approval as never, { ...approval, approval: "ap_2" } as never] }), NOW)).toBe("2 questions are waiting for you");
    expect(helloFact(m({ runnerUp: false, history: [row()] }), NOW), "the engine is down: no fact it cannot stand behind").toBeNull();
  });
  test("its words are a productivity tool's (rule 16): no moods, no missing you, no streaks, no emojis", () => {
    const words = [helloLine("Rishabh", null).greet, helloLine("", null).greet, S.hello.allFine, S.hello.changes("my-shop", 3), S.hello.questions(2), S.hello.changesShort(3)].join(" ");
    expect(words).not.toMatch(/miss|missed|welcome back|streak|mood|feel|happy|love|glad|\p{Extended_Pictographic}|—/iu);
  });
});

describe("the wings at rest: the Visor's lights on the left, one word or a tick on the right, nothing when there is nothing", () => {
  const on = { on: true, kind: "notch" as const };
  test("at rest with nothing to say: the lights only", () => {
    expect(restWings(m(), NOW, on)).toEqual({ state: "idle", word: null, tick: false });
  });
  test("changes waiting to be reviewed: a short count", () => {
    expect(restWings(m({ review: review(3) }), NOW, on)).toEqual({ state: "idle", word: "3 changes", tick: false });
    expect(restWings(m({ review: review(1) }), NOW, on)!.word).toBe("1 change");
  });
  test("after a proof: a green tick; changes since then come first", () => {
    expect(restWings(m({ history: [row()] }), NOW, on)).toEqual({ state: "idle", word: null, tick: true });
    expect(restWings(m({ history: [row()], review: review(2) }), NOW, on)).toEqual({ state: "idle", word: "2 changes", tick: false });
    expect(restWings(m({ history: [row({ status: "not_done", proof: "failed" })] }), NOW, on)!.tick).toBe(false);
  });
  test("the engine down: a dark band, nothing on the right", () => {
    expect(restWings(m({ runnerUp: false, review: review(3) }), NOW, on)).toEqual({ state: "off", word: null, tick: false });
  });
  test("only on a real notch, and never with Show wings at rest off: then the notch looks like the hardware", () => {
    expect(restWings(m(), NOW, { on: false, kind: "notch" })).toBeNull();
    expect(restWings(m(), NOW, { on: true, kind: "pill" })).toBeNull();
    expect(restWings(m(), NOW, { on: true, kind: "edge" })).toBeNull();
  });
  test("working, a question, listening, a proven tick: the island's live wings take over (home.ts islandWings), the page draws them", () => {
    const page = read("./island.tsx");
    expect(page).toContain("restWings(m, now, { on: wingsAtRest, kind: shape.kind })");
    expect(page).toContain("const rest = wings ? null : restAt;");
  });
});

describe("the page: wings and hello in the notch, black, non activating, quiet", () => {
  const page = read("./island.tsx");
  const panel = read("./islandPanel.tsx");
  test("the wings at rest ask the app for the wings' size (island.rs Alert), so they grow on the notch springs", () => {
    expect(page).toContain("const wingsOut = out || rest !== null || helloOn;");
    expect(page).toContain('invoke("island_alert", { on: wingsOut, panel: panelH, cheer: cheering, ask: ask || helloOn, wing: wingW, proven: ticking })');
  });
  test("the hello is asked as the panel under the wings, which the app never opens on a call or while hidden (island.rs mode)", () => {
    expect(page).toContain('invoke("quiet_now")');
    expect(panel).toContain("hello ? <div className=\"ip-hello\"");
    expect(panel).toContain("<FlowMini className=\"ip-agent\" state=\"idle\" still={!shown} />");
  });
  test("it never takes focus, makes no sound and stores only when it last said hello", () => {
    const hello = read("./notchHello.ts");
    expect(page + hello).not.toMatch(/\.focus\(|playSound|new Audio|sound_play/);
    expect(hello).toContain('export const LAST_HELLO_KEY = "companion.notchHello"');
  });
  test("the settings: wings and hello switches, off by default since M70, in the Notch section, the name in Account (your profile)", () => {
    const reg = JSON.parse(read("../../protocol/settings.json")) as { settings: Record<string, unknown>[] };
    const def = (k: string) => reg.settings.find((s) => s.key === k);
    expect(def("island.wings")).toMatchObject({ section: "home", kind: "switch", default: false, scope: "app", applies: ["pages"], store: "settings", live: true });
    expect(def("island.hello")).toMatchObject({ section: "home", kind: "switch", default: false, scope: "app", applies: ["pages"], store: "settings", live: true });
    expect(def("you.name")).toMatchObject({ section: "home", kind: "text", default: "", maxLength: 24, scope: "app", applies: ["pages"], store: "settings", live: true });
    expect(def("panel.showHello")).toMatchObject({ default: false, hidden: true });
    const notch = PAGES.general.more.find((t) => t.id === "more.general.notch")!.items;
    expect(notch).toContain("island.wings");
    expect(notch).toContain("island.hello");
    expect(PAGES.account.groups.find((g) => g.id === "account.you")!.items).toEqual(["you.name"]);
    for (const k of ["island.wings", "island.hello", "you.name"] as const) {
      expect(S.set[k].label, k).toBeTruthy();
      expect(S.set[k].help, k).not.toMatch(/—/);
      expect(S.short[k], k).toBeTruthy();
    }
    // Settings' labels carry no pronoun (the spec, 3.11), so Settings says Your name; the first run asks in words.
    expect(S.set["you.name"].label).toBe("Your name");
  });
});

describe("the first run asks, optionally, what to call you", () => {
  test("Make it yours writes you.name only when it was typed or changed, cut to 24", () => {
    expect(yoursSettings(DEFAULT_YOURS, "Flowflow")).toEqual([]);
    expect(yoursSettings({ ...DEFAULT_YOURS, you: "  Rishabh " }, "Flowflow")).toEqual([["you.name", "Rishabh"]]);
    expect(yoursSettings({ ...DEFAULT_YOURS, you: "Rishabh" }, "Flowflow", { name: "", lively: null, edge: null, you: "Rishabh" })).toEqual([]);
    expect(yoursSettings({ ...DEFAULT_YOURS, you: "" }, "Flowflow", { name: "", lively: null, edge: null, you: "Rishabh" })).toEqual([["you.name", ""]]);
    expect(yoursSettings({ ...DEFAULT_YOURS, you: "y".repeat(40) }, "Flowflow")[0][1]).toBe("y".repeat(NAME_MAX));
  });
  test("the screen has the field, labelled in plain words, optional", () => {
    const ui = read("./onboarding.tsx");
    expect(ui).toContain("<Field value={yours.you ?? \"\"} label={S.fr.youLabel}");
    expect(S.fr.youLabel).toBe("What should I call you?");
    expect(S.fr.youHint).toMatch(/optional/i);
  });
});

describe("the lights at rest agree with the tick beside them (M68 step 3)", () => {
  test("a proven project's tick shows the smile in the band, nothing new shows the resting lights", () => {
    expect(restWingState({ state: "idle", word: null, tick: true })).toBe("done");
    expect(restWingState({ state: "idle", word: null, tick: false })).toBe("idle");
    expect(restWingState({ state: "idle", word: "3 changes", tick: false })).toBe("idle");
    expect(restWingState({ state: "off", word: null, tick: false })).toBe("off");
  });
  test("the island draws the resting band from it", () => {
    expect(readFileSync(new URL("./island.tsx", import.meta.url), "utf8")).toContain("state={restWingState(r)}");
  });
});

describe("one hello at a time, at most once an hour, even when storage fails (step 4 review)", () => {
  const store = (v: number | null = null, broken = false) => {
    const s = { v, writes: 0, read: () => (broken ? null : s.v), write: (t: number) => { s.writes++; if (!broken) s.v = t; } };
    return s;
  };
  const check = (o: Partial<HelloCheck> = {}) => (last: number | null): HelloCheck => ({ ...base, ...o, last });
  test("two tries in flight at once: only the first says hello", async () => {
    const g = helloGate(store());
    let open!: (q: boolean) => void;
    const slow = new Promise<boolean>((r) => { open = r; });
    const a = g.attempt(check(), () => slow);
    const b = g.attempt(check({ why: "back", awayMs: 2 * AWAY_MS }), async () => false);
    open(false);
    expect([await a, await b]).toEqual([true, false]);
  });
  test("a second try after the first decided is blocked for the hour, even before the panel opened", async () => {
    const g = helloGate(store());
    expect(await g.attempt(check(), async () => false)).toBe(true);
    expect(await g.attempt(check({ why: "wake", now: NOW + 60_000 }), async () => false)).toBe(false);
  });
  test("storage that fails cannot lift the hourly limit", async () => {
    const s = store(null, true);
    const g = helloGate(s);
    expect(await g.attempt(check(), async () => false)).toBe(true);
    g.shown(NOW);
    expect(await g.attempt(check({ why: "wake", now: NOW + 5 * 60_000 }), async () => false)).toBe(false);
    expect(await g.attempt(check({ why: "wake", now: NOW + HELLO_GAP_MS }), async () => false)).toBe(true);
  });
  test("it rereads the kept time after the presentation check (another page may have said hello)", async () => {
    const s = store();
    const g = helloGate(s);
    const done = g.attempt(check(), async () => { s.v = NOW - 1000; return false; });
    expect(await done).toBe(false);
  });
  test("quiet after the check: no hello, and the next try is free", async () => {
    const g = helloGate(store());
    expect(await g.attempt(check(), async () => true)).toBe(false);
    expect(await g.attempt(check(), async () => false)).toBe(true);
  });
  test("the time is written to storage only when the panel has opened", async () => {
    const s = store();
    const g = helloGate(s);
    expect(await g.attempt(check(), async () => false)).toBe(true);
    expect(s.writes).toBe(0);
    g.shown(NOW + 200);
    expect(s.writes).toBe(1);
    expect(s.v).toBe(NOW + 200);
  });
});

describe("the page asks the gate, skips wake ticks while hidden, and keeps the time only once shown (step 4 review)", () => {
  const page = readFileSync(new URL("./island.tsx", import.meta.url), "utf8");
  test("the wake tick is skipped while the page is hidden, and the clock restarts on coming back", () => {
    expect(page).toContain("if (document.hidden) { prev = t; return; }");
    expect(page).toMatch(/if \(document\.hidden\) \{ away = Date\.now\(\); return; \}\s*prev = Date\.now\(\);/);
  });
  test("the hello asks for the notch's kind and the page's visibility, through one gate", () => {
    expect(page).toContain("kind: shapeKind.current");
    expect(page).toContain("hidden: document.hidden");
    expect(page).toContain("helloGate(");
    expect(page).toContain("gate.shown(Date.now())");
    expect(page).not.toContain("keepHello(Date.now());\n    setHello");
  });
  test("its help says what is checked: a call app in front, not a screen share", () => {
    expect(S.set["island.hello"].help).toMatch(/call app/);
    expect(S.set["island.hello"].help).not.toMatch(/screen is shared/);
    expect(S.set["island.hello"].help).toMatch(/Hide from screen sharing/);
  });
});
