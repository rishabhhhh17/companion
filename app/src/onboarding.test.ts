import { describe, expect, test } from "bun:test";
import { addMemory } from "./commands.ts";
import { back, canContinue, commandsFor, COUNTED, countOf, DEFAULT_ANSWERS, DEFAULT_YOURS, effectsOf, groupSettingsFor, keyCheck, keyLooksRight, KEY_PAGE, LEVEL, NAME_MAX, next, QUESTIONS, REQUIRED, settingsFor, STEPS, yoursSettings } from "./onboarding.ts";
import { characterName, COMPANIONS } from "./companion.ts";
import { readFileSync } from "node:fs";
import { S } from "./strings.ts";

describe("moving through the first run", () => {
  test("hello, see it work, choose and make it yours, powers, connect, folder, and a last screen; the ends have nowhere to go", () => {
    expect([...STEPS]).toEqual(["hello", "look", "pick", "yours", "powers", "claude", "connect", "folder", "ready"]);
    expect(next("hello")).toBe("look"); expect(next("folder")).toBe("ready"); expect(next("ready")).toBeNull();
    expect(back("look")).toBe("hello"); expect(back("hello")).toBeNull();
    expect([...REQUIRED]).toEqual(["connect", "folder"]);
  });
  test("the hero comes before any key, folder or question (F17; product doc section 4: a demo before connecting)", () => {
    expect(STEPS.indexOf("look")).toBeLessThan(STEPS.indexOf("connect"));
    expect(STEPS.indexOf("look")).toBeLessThan(STEPS.indexOf("folder"));
    expect(STEPS.slice(0, STEPS.indexOf("look"))).toEqual(["hello"]);   // only the hello, which asks nothing, comes first
    for (const s of ["hello", "look"] as const) expect(canContinue(s, { connected: false, project: "" })).toBe(true);
    const ui = readFileSync(new URL("./onboarding.tsx", import.meta.url), "utf8");
    expect(ui).toContain("<FirstLook onGo={() => go(next(step))} />");
    // The real practice is one press away on the last screen, and taking it ends the first run there.
    expect(ui).toContain("onDone(); startPractice(first.id);");
  });
  test("you cannot move past connecting Claude or choosing a folder until it is done", () => {
    expect(canContinue("connect", { connected: false, project: "/p" })).toBe(false);
    expect(canContinue("connect", { connected: true, project: "" })).toBe(true);
    expect(canContinue("folder", { connected: true, project: "" })).toBe(false);
    expect(canContinue("folder", { connected: true, project: "/p" })).toBe(true);
    for (const s of ["pick", "yours", "powers", "ready"] as const) expect(canContinue(s, { connected: false, project: "" })).toBe(true);
    // M22: Anthropic's Claude must be installed before Connect; until then Continue waits.
    expect(canContinue("claude", { connected: false, project: "", claude: false })).toBe(false);
    expect(canContinue("claude", { connected: false, project: "", claude: true })).toBe(true);
  });
  test("the count in words covers the five steps in the middle", () => {
    expect([...COUNTED]).toEqual(["pick", "yours", "powers", "connect", "folder"]);
    expect(countOf("pick")).toEqual({ n: 1, of: 5 }); expect(countOf("folder")).toEqual({ n: 5, of: 5 });
    expect(countOf("hello")).toBeNull(); expect(countOf("ready")).toBeNull();
  });
  test("the water rises with every counted step and ends nearly full", () => {
    const levels = COUNTED.map((s) => LEVEL[s]);
    for (let i = 1; i < levels.length; i++) expect(levels[i]).toBeGreaterThan(levels[i - 1]);
    expect(LEVEL.ready).toBeGreaterThan(LEVEL.folder);
    expect(LEVEL.ready).toBeLessThan(100);
    for (const s of STEPS) expect(LEVEL[s]).toBeGreaterThan(0);
  });
});

describe("make it yours", () => {
  test("only what was chosen changes; its own name, or nothing typed, keeps the name empty", () => {
    expect(yoursSettings(DEFAULT_YOURS, "Flowflow")).toEqual([]);
    expect(yoursSettings({ name: "Flowflow", lively: null, edge: null }, "Flowflow")).toEqual([]);
    expect(yoursSettings({ name: "  Blub  ", lively: "gentle", edge: "left" }, "Flowflow")).toEqual([["character.name", "Blub"], ["character.lively", "gentle"], ["character.edge", "left"]]);
    expect(yoursSettings({ name: "", lively: "lively", edge: null }, "Flowflow")).toEqual([["character.lively", "lively"]]);
    expect(yoursSettings({ name: "", lively: "still", edge: null }, "Flowflow")).toEqual([["character.lively", "still"]]);
    expect(yoursSettings({ name: "", lively: null, edge: null, follow: "drop" }, "Flowflow")).toEqual([["character.follow", "drop"]]);
  });
  test("M46: how lively is three choices, Still pressed first; it writes character.lively, never the reactions, and the follow step is gone", () => {
    const page = readFileSync(new URL("./onboarding.tsx", import.meta.url), "utf8");
    expect(page).toContain('const LIVELY: Liveliness[] = ["still", "gentle", "lively"];');
    expect(page).toContain('aria-pressed={(yours.lively ?? "still") === l}');
    expect(page).not.toContain("FOLLOWS");
    expect(page).not.toContain("S.fr.follow");
    expect(page).not.toContain("fr-follow");
    for (const l of ["still", "gentle", "lively"]) { expect(S.fr.lively[l], l).toBeTruthy(); expect(S.fr.livelyLine[l], l).toBeTruthy(); }
    expect(S.fr.livelyLine.still).toBe("Moves only when it has news");
    expect((S.fr as Record<string, unknown>).followLabel).toBeUndefined();
    expect(yoursSettings({ name: "", lively: "gentle", edge: null }, "Flowflow").some(([k]) => k === "fun.reactions")).toBe(false);
  });
  test("a name is cut to the most the setting takes, and the setting exists in the registry", () => {
    const long = "x".repeat(40);
    expect(yoursSettings({ name: long, lively: null, edge: null }, "Flowflow")[0][1]).toBe("x".repeat(NAME_MAX));
    const reg = JSON.parse(readFileSync(new URL("../../protocol/settings.json", import.meta.url), "utf8")) as { settings: { key: string; kind: string; maxLength?: number; default: unknown; options?: string[] }[] };
    const name = reg.settings.find((x) => x.key === "character.name")!;
    expect(name).toMatchObject({ kind: "text", default: "", maxLength: NAME_MAX });
    expect(reg.settings.find((x) => x.key === "character.edge")!.options).toEqual(["left", "right", "top", "bottom"]);
    expect(reg.settings.find((x) => x.key === "fun.reactions")!.kind).toBe("switch");
  });
  test("the character is called by the name chosen, or its own", () => {
    expect(characterName("")).toBe("Flowflow"); expect(characterName(undefined)).toBe("Flowflow");
    expect(characterName("  Blub ")).toBe("Blub");
  });
  test("Flowflow is the only companion ready; the others are empty places, one per group, with no art", () => {
    expect(COMPANIONS.filter((c) => c.ready).map((c) => c.id)).toEqual(["water"]);
    expect(COMPANIONS.map((c) => c.group)).toEqual(["flow", "guide", "voice", "files"]);
  });
});

describe("the questions", () => {
  test("there are at most five, and every answer says what it changes", () => {
    expect(QUESTIONS.length).toBeLessThanOrEqual(5);
    for (const q of QUESTIONS) { expect(q.yesEffect.length).toBeGreaterThan(10); expect(q.noEffect.length).toBeGreaterThan(10); expect(q.yesEffect).not.toBe(q.noEffect); }
  });
  test("the effects shown match the answers given", () => {
    const e = effectsOf({ ...DEFAULT_ANSWERS, short: true, autoSend: true });
    expect(e.some((x) => /short/i.test(x))).toBe(true); expect(e.some((x) => /straight away/i.test(x))).toBe(true);
  });
  test("answers become lines in the profile with their source, and settings changed through the shell", () => {
    const cmds = commandsFor({ explain: false, short: true, plain: true, autoSend: false }, "/p", (scope, text, source) => addMemory("/p", scope, text, source)) as any[];
    expect(cmds.some((c) => c.type === "explain.set")).toBe(false);
    expect(settingsFor({ explain: false, short: true, plain: true, autoSend: true })).toEqual([["explain.mode", "off"], ["talk.autoSend", true]]);
    expect(settingsFor(DEFAULT_ANSWERS)).toEqual([["explain.mode", "reasonsAndQuestion"], ["talk.autoSend", false]]);
    // Explain and auto send are settings (T16): the first run changes them the way Settings does, never by its own command.
    const ui = readFileSync(new URL("./onboarding.tsx", import.meta.url), "utf8");
    expect(ui).toContain("for (const [key, on] of settingsFor(answers)) void changeSetting(key, on);");
    expect(ui).not.toContain("setExplain");
    expect(cmds.filter((c) => c.type === "memory.add").map((c) => c.text)).toEqual(["Prefers short answers", "Prefers plain words, no jargon"]);
    expect(cmds.every((c) => c.type !== "memory.add" || c.source === "your answer at setup")).toBe(true);
  });
  test("saying no to everything adds nothing to the profile", () => {
    const cmds = commandsFor({ explain: true, short: false, plain: false, autoSend: false }, "/p", (s, t, so) => addMemory("/p", s, t, so)) as any[];
    expect(cmds.filter((c) => c.type === "memory.add")).toEqual([]);
  });
});

describe("the key is checked with Anthropic when it is saved", () => {
  test("nothing before a save; checking until the answer for this save arrives; an older answer is never shown", () => {
    expect(keyCheck(null, { result: "works", at: 5 })).toBeNull();
    expect(keyCheck(100, null)).toBe("checking");
    expect(keyCheck(100, { result: "works", at: 50 })).toBe("checking");
    expect(keyCheck(100, { result: "refused", at: 120 })).toBe("refused");
    expect(keyCheck(100, { result: "works", at: 100 })).toBe("works");
  });
  test("a refused key cannot be continued past, and every answer is in plain words", () => {
    const ui = readFileSync(new URL("./onboarding.tsx", import.meta.url), "utf8");
    const connect = ui.slice(ui.indexOf('{step === "connect" && ('), ui.indexOf('{step === "folder" && ('));
    expect(connect).toContain('main(S.obContinue, () => go(next(step)), !canContinue(step, ctx) || (step === "connect" && check === "refused"))');
    // The one main button of each step is the Button part's primary, large (the flat silver).
    expect(ui).toContain('const main = (label: string, onClick: () => void, disabled = false) => <button className="btn primary lg fr-key" type="button" disabled={disabled} onClick={onClick}>{label}</button>;');
    for (const k of ["checking", "works", "refused", "no_connection", "unknown"] as const) { expect(S.obKeyCheck[k].length).toBeGreaterThan(10); expect(S.obKeyCheck[k]).not.toMatch(/40[13]|status|HTTP|models/); }
  });
  test("Get a key opens Anthropic's own page, only on the person's press, and a failure never shows a raw error", () => {
    expect(KEY_PAGE).toBe("https://console.anthropic.com/settings/keys");
    const ui = readFileSync(new URL("./onboarding.tsx", import.meta.url), "utf8");
    expect(ui).toContain('onClick={() => void invoke("open_link", { url: KEY_PAGE })');
    expect(ui).not.toContain("String(e)");
  });
});

describe("the key box", () => {
  const good = "sk-ant-api03-AbCdEfGhIjKlMnOpQrStUvWxYz0123456789_-abcdefgh";
  test("a good key passes; mistakes are explained in plain words", () => {
    expect(keyLooksRight(good)).toBeNull(); expect(keyLooksRight(` ${good}\n`)).toBeNull();
    for (const bad of ["", "hello", "sk-ant-short", `${good} extra`, "sk-proj-abcdefghijklmnopqrstuvwxyz0123456789abcdef"]) expect(keyLooksRight(bad)).toMatch(/\.$/);
  });
  test("the message never repeats what was typed", () => { expect(keyLooksRight("sk-ant-secretsecret space")).not.toContain("secretsecret"); });
});

// Found in the M11 audit (A81): the first run said Screen Recording comes only with Show me and Accessibility only with
// Prompt help and the error explainer, and INSTALL.md gave other, incomplete reasons. Both now name every feature that asks.
describe("the first run and INSTALL name every feature that asks for each permission", () => {
  const install = readFileSync(new URL("../../docs/alpha/INSTALL.md", import.meta.url), "utf8");
  const section = install.slice(install.indexOf("## What it asks for, and when"), install.indexOf("## The keys"));
  test("Accessibility: Prompt help, the error explainer and Do it for me", () => {
    for (const t of [S.obPerm1, section]) for (const f of ["Prompt help", "error", "Do it for me"]) expect(t, f).toContain(f);
  });
  test("Screen Recording: Show me, a lesson's step and Point at the problem", () => {
    for (const t of [S.obPerm2, section]) for (const f of ["Show me", "lesson", "Point at the problem"]) expect(t, f).toContain(f);
    expect(S.obPerm2).not.toMatch(/only the first time you use Show me,/);
  });
});

describe("the first run explains the four groups (F20 item 6)", () => {
  test("the groups have their own step before Connect, and the optional questions are folded away on the last screen", () => {
    const ui = readFileSync(new URL("./onboarding.tsx", import.meta.url), "utf8");
    expect(STEPS.indexOf("powers")).toBeLessThan(STEPS.indexOf("connect"));
    expect(ui.slice(ui.indexOf('{step === "powers" && (')).indexOf("SWITCHED.map")).toBeGreaterThan(0);
    const ready = ui.slice(ui.indexOf('{step === "ready" && ('));
    expect(ready.indexOf("<details")).toBeLessThan(ready.indexOf("QUESTIONS.map"));
    for (const s of ["powers", "ready"] as const) expect(canContinue(s, { connected: false, project: "" })).toBe(true);
  });
  test("each group is explained in one short line, four lines in all, in plain words with no score or level", () => {
    const lines = Object.values(S.groups.short);
    expect(lines.length).toBe(4);
    for (const l of lines) { expect(l.length).toBeGreaterThan(20); expect(l.length).toBeLessThan(110); expect(l).toMatch(/\.$/); }
  });
  test("switching a group off in the first run changes the same setting Settings does, and leaving it on changes nothing", () => {
    expect(groupSettingsFor([])).toEqual([]);
    expect(groupSettingsFor(["voice", "files"])).toEqual([["voice.on", false], ["files.on", false]]);
    const ui = readFileSync(new URL("./onboarding.tsx", import.meta.url), "utf8");
    expect(ui).toContain("for (const [key, on] of groupSettingsFor(groupsOff)) void changeSetting(key, on);");
  });
  test("the choices made on the way are kept however the first run ends; the questions only with Go to my project", () => {
    const ui = readFileSync(new URL("./onboarding.tsx", import.meta.url), "utf8");
    const keep = ui.slice(ui.indexOf("const keepChoices = () => {"), ui.indexOf("const finish = () => {"));
    expect(keep).toContain("yoursSettings(yours, own)"); expect(keep).toContain("groupSettingsFor(groupsOff)");
    expect(keep).not.toContain("settingsFor(answers)"); expect(keep).not.toContain("commandsFor(");
    const fin = ui.slice(ui.indexOf("const finish = () => {"), ui.indexOf("const saveKey"));
    expect(fin).toContain("keepChoices();"); expect(fin).toContain("settingsFor(answers)");
    expect(ui).toContain("onClick={() => { keepChoices(); onDone(); startPractice(first.id); }}");
    expect(ui).toContain("onClick={finish}>{S.fr.goProject}");
  });
});

describe("Home opens by itself at the very first launch", () => {
  test("the page asks once when the first run is not finished; the shell opens Home once per launch, without the keyboard", () => {
    const card = readFileSync(new URL("./card.tsx", import.meta.url), "utf8");
    expect(card).toContain('useEffect(() => { if (!onboarded) void invoke("first_run_open").catch(() => {}); }, []);');
    const main = readFileSync(new URL("../src-tauri/src/main.rs", import.meta.url), "utf8");
    const fn = main.slice(main.indexOf("fn first_run_open("), main.indexOf("\n}\n", main.indexOf("fn first_run_open(")));
    expect(fn).toContain('if window.label() != "card"');
    expect(fn).toContain("FIRST_RUN_OPENED.swap(true, Ordering::SeqCst)");
    expect(fn).toContain('open_card(&app, "first_run", false);');   // rule 9: never the keyboard unasked
    expect(fn).not.toContain("makeKey");
  });
});

describe("the last screen's keys", () => {
  test("are shown in the Mac's own symbols, the words kept for VoiceOver", async () => {
    const { keySymbols } = await import("./onboarding.tsx");
    expect(keySymbols("Control, Option, Command and K")).toBe("\u2303\u2325\u2318K");
    expect(keySymbols("Option and Space")).toBe("\u2325Space");
    const ui = readFileSync(new URL("./onboarding.tsx", import.meta.url), "utf8");
    expect(ui).toContain("<kbd aria-label={r.keys}>{keySymbols(r.keys)}</kbd>");
  });
});

describe("the first run shows only what is ready (M28)", () => {
  test("no empty Coming soon slots; one ready companion is introduced, not offered as a choice of one", () => {
    const src = readFileSync(new URL("./onboarding.tsx", import.meta.url), "utf8");
    expect(src).toContain("const cast = COMPANIONS.filter((c) => c.ready);");
    expect(src).not.toContain("fr-soon");
    expect(S.fr.meetTitle("Flowflow")).toBe("Meet Flowflow.");
  });
});

describe("the first run has no dead end without a key (M28)", () => {
  test("the connect step offers Skip for now, which goes on to the next step", () => {
    const src = readFileSync(new URL("./onboarding.tsx", import.meta.url), "utf8");
    expect(src).toContain('<button className="fr-link fr-skip" type="button" onClick={() => go(next(step))}>{S.fr.skipKey}</button>');
    expect(src).not.toContain("S.obPlanLater");
  });
});

describe("two tone headline (M41)", () => {
  test("the first sentence, then the rest", async () => {
    const { twoTone } = await import("./onboarding.tsx");
    expect(twoTone("Your AI built it. Let's finish it.")).toEqual(["Your AI built it.", "Let's finish it."]);
    expect(twoTone("One sentence only")).toEqual(["One sentence only", ""]);
  });
});
