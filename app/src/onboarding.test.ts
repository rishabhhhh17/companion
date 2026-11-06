import { describe, expect, test } from "bun:test";
import { addMemory, findProblem } from "./commands.ts";
import { ALL_ANSWERED, back, canContinue, checkAnnounce, checkEndLine, checkStage, commandsFor, COUNTED, countOf, DEFAULT_ANSWERS, DEFAULT_YOURS, effectsOf, FIRST_KEYS, firstCheckVerdict, groupSettingsFor, honestLines, keyShownFirst, installAsks, keyCheck, keyLooksRight, KEY_PAGE, LEVEL, NAME_MAX, next, QUESTIONS, settingsFor, skipTo, STEPS, yoursSettings, type PointNow } from "./onboarding.ts";
import { characterName, COMPANIONS } from "./companion.ts";
import { OFF, planCard, type PlanStatus } from "./plan.ts";
import { readFileSync } from "node:fs";
import { initial, reduce, type Model } from "./model.ts";
import { S } from "./strings.ts";

const read = (f: string) => readFileSync(new URL(f, import.meta.url), "utf8");
/** One step's part of the first run's page, from its `{step === "x" && (` to the next step's. */
const stepOf = (ui: string, step: string) => { const at = ui.indexOf(`{step === "${step}" && (`); const after = ui.indexOf("{step === ", at + 10); return ui.slice(at, after < 0 ? undefined : after); };

describe("the three screens and their order (M49)", () => {
  test("M69 (F29): Welcome, Pick a project, then the first check; no Your Claude step; the ends have nowhere to go", () => {
    expect([...STEPS]).toEqual(["hello", "project", "check"]);
    expect(next("hello")).toBe("project"); expect(next("project")).toBe("check"); expect(next("check")).toBeNull();
    expect(back("check")).toBe("project"); expect(back("project")).toBe("hello"); expect(back("hello")).toBeNull();
  });
  test("the count covers the two screens, and the first check comes after them, uncounted", () => {
    expect([...COUNTED]).toEqual(["hello", "project"]);
    expect(countOf("hello")).toEqual({ n: 1, of: 2 }); expect(countOf("project")).toEqual({ n: 2, of: 2 });
    expect(countOf("check")).toBeNull();
  });
  test("the water rises with every step after the hello, and Flowflow rides on it", () => {
    const after = STEPS.slice(1).map((s) => LEVEL[s]);
    for (let i = 1; i < after.length; i++) expect(after[i]).toBeGreaterThan(after[i - 1]);
    for (const s of STEPS) { expect(LEVEL[s]).toBeGreaterThan(0); expect(LEVEL[s]).toBeLessThan(100); }
    const ui = read("./onboarding.tsx");
    expect(ui).toContain('<div className="fr-tank" aria-hidden="true"><Waterline under />{step !== "hello" && open === null && <div className="fr-float"><HomeCharacter as={look} /></div>}</div>');
    expect(read("./style.css")).toContain(".fr-tank .fr-float {");
  });
  test("M69: the welcome says the promise, the three promises, and plays a short loop of a real fix with a Pause (spec 3.10)", () => {
    const hello = stepOf(read("./onboarding.tsx"), "hello");
    expect(hello).toContain("twoTone(S.screens.welcomeTitle)");
    expect(hello).toContain("S.screens.promises.map(");
    expect(S.screens.promises).toHaveLength(3);
    expect(S.screens.promises[2]).toContain("Nothing is saved.");
    expect(hello).toContain("<FirstLook loop label={S.screens.loopLabel} />");
    expect(hello).toContain("main(S.obContinue, () => go(next(step)))");
    expect(hello).not.toContain("Field");
    // The key named is the Fix it key in use, and nothing when it has none (F28: no new default keys).
    expect(hello).toContain("{keys.using.problem && <p className=\"fr-key-line\">");
    // The loop keeps its Pause in view (spec 4) and starts again by itself; never with Reduce motion.
    const fl = read("./firstLook.tsx");
    expect(fl).toContain("{(!done || loop) && !reduced && picked === null && <button");
    expect(fl).toContain("if (!loop || !done || reduced || paused || picked !== null) return;");
    expect(fl).toContain("{!loop && onGo && <button");
    // Step chips: "01 Welcome", "02 Pick a project".
    expect(S.screens.stepChip(1, S.screens.stepNames.hello)).toBe("01 Welcome");
    expect(S.screens.stepChip(2, S.screens.stepNames.project)).toBe("02 Pick a project");
  });
  test("Your project offers a folder, GitHub or Lovable through the existing Open from a link, and the practice", () => {
    const proj = stepOf(read("./onboarding.tsx"), "project");
    // M71: the three ways to start are rows of one grouped list (ui/parts.tsx ListRow), each opening its way.
    expect(proj).toContain("title={S.fr.pickFolder} line={S.fr.pickFolderLine} onOpen={pickFolder}");
    expect(proj).toContain("{S.fr.pickLink}");
    expect(proj).toContain("S.fr.linkLovable");
    expect(read("./onboarding.tsx")).toContain("void cloneLink(u).then(() => setLink(\"\")).catch((e) => { if (e !== \"\") setLinkNote(failNote(e, \"folder\")); });");
    expect(proj).toContain("onOpen={first.needsNode && !!noNode ? undefined : () => { keepChoices(); onDone(); startPractice(first.id); }}");
    const card = read("./card.tsx");
    expect(card).toContain('const cloneLink = (u: string) => { dispatch({ type: "ui.cloneNoteClosed" }); return invoke("clone_project", { url: u })');
    for (const t of [S.fr.pickFolder, S.fr.pickLink, S.fr.pickPractice]) expect(t).toMatch(/^[A-Z][^.]*[a-z]$/);
    expect(S.fr.pickLink).toContain("GitHub"); expect(S.fr.pickLink).toContain("Lovable");
  });
});

describe("every step can be skipped and has a way back", () => {
  test("Skip goes on to the next screen, or out of the first run where the next step needs what was skipped", () => {
    expect(skipTo("hello")).toBe("project");
    expect(skipTo("project")).toBe("done");
    expect(skipTo("check")).toBe("done");
  });
  test("each step draws its own way to skip, and Back on every step after the hello", () => {
    const ui = read("./onboarding.tsx");
    expect(stepOf(ui, "hello")).toContain("onClick={finish}>{S.fr.skipSetup}</Button>");
    expect(ui).not.toContain('step === "claude"');
    expect(stepOf(ui, "project")).toContain("onClick={skip}>{S.fr.skipProject}</Button>");
    expect(stepOf(ui, "project")).toContain("onClick={finish}>{S.fr.skipCheck}</Button>");
    // While the check runs, its one way out is Stop the check; then Go to my project (the audit, item 52: Skip the check
    // beside it was a near twin).
    expect(stepOf(ui, "check")).toContain("onClick={stopCheck}>{S.fr.checkStop}</Button>");
    expect(stepOf(ui, "check")).toContain("main(S.fr.goProject, finish,");
    expect(ui).toContain('{back(step) && <button className="fr-back" type="button" aria-label={S.obBack}');
    // Back while the check runs stops it first, so nothing keeps running behind the first run.
    expect(ui).toContain("if (stage === \"checking\" || stage === \"asking\") stopCheck();\n    go(b.to);");   // M72: through backPress
  });
  test("Continue waits for a folder on Pick a project; the rest never wait, and never for a key (F29)", () => {
    expect(canContinue("project", { connected: true, project: "" })).toBe(false);
    expect(canContinue("project", { connected: false, project: "/p" })).toBe(true);
    for (const s of ["hello", "check"] as const) expect(canContinue(s, { connected: false, project: "" })).toBe(true);
  });
  test("a returning person never sees it again unless they choose Replay", () => {
    const card = read("./card.tsx");
    expect(card).toContain('const [onboarded, setOnboarded] = useState(() => { try { return localStorage.getItem("companion.onboarded") === "1"; } catch { return true; } });');
    expect(card).toContain("{!onboarded && <PartBoundary part=\"firstRun\"><Onboarding ");
    expect(card).toContain('localStorage.setItem("companion.onboarded", "1")');
    expect(read("./settingsPage.tsx")).toContain("showFirstRunAgain();");
  });
});

describe("the first check of the real project", () => {
  const found: PointNow = { stage: "found", label: "Building and checking the code", message: "tsc failed" };
  test("it is the free check with first set, so the engine saves a safety copy first and asks before installs", () => {
    const c = findProblem("/p/shop", true) as Record<string, unknown>;
    expect(c).toMatchObject({ type: "problem.find", project: "/p/shop", first: true });
    expect(findProblem("/p/shop") as Record<string, unknown>).not.toHaveProperty("first");
    // The engine side (snapshot before the ladder, auto held to ask, the usual install card): runner/test/first-check.test.ts.
    expect(read("../../runner/test/first-check.test.ts")).toContain("a safety copy of the project is saved before anything runs");
    const card = read("./card.tsx");
    expect(card).toContain('const firstCheck = () => { pressed(); dispatch({ type: "ui.findProblem", fresh: true }); void sendOrExplain(findProblem(project, true), () => dispatch({ type: "ui.pointClosed" })); };');
  });
  test("it runs only on the person's press of Check <name>, and says first that a safety copy comes first and installs ask", () => {
    const ui = read("./onboarding.tsx");
    expect(ui).toContain("const startCheck = () => { setAsked(true); setStoppedByMe(false); firstCheck(); go(\"check\"); };");
    expect((ui.match(/firstCheck\(\)/g) ?? []).length).toBe(2);   // Check <name>, and Check again after a stop
    expect(stepOf(ui, "project")).toContain("main(project ? S.fr.checkGo(folderName(project)) : S.obContinue, startCheck, !canContinue(step, ctx))");
    expect(stepOf(ui, "project")).toContain("{S.fr.checkPromise}");
    expect(S.fr.checkPromise).toBe("A safety copy is saved first, and I'll ask before installing anything.");
    expect(S.fr.checkPromise).not.toMatch(/nothing (will )?change/i);
  });
  test("a check that ended without the person's Stop says why, never that it was stopped", () => {
    // No Apple developer tools (the engine's own words), a refused send, or nothing said: never "You stopped the check".
    const needsGit = "Squibby needs Apple's developer tools to save a safety copy. Run xcode-select --install in Terminal, then try again.";
    expect(checkEndLine(false, needsGit)).toBe(needsGit);
    expect(checkEndLine(false, "That is switched off in Settings. Turn it back on there to use it.")).toContain("switched off");
    expect(checkEndLine(false, null)).toBe(S.fr.checkCouldNot);
    expect(checkEndLine(false, "  ")).toBe(S.fr.checkCouldNot);
    // Only after Stop the check, Back or Skip.
    expect(checkEndLine(true, needsGit)).toBe(S.fr.checkStopped);
    expect(S.fr.checkStopped).toMatch(/^You stopped/);
    const ui = read("./onboarding.tsx");
    expect(ui).toContain("const stopCheck = () => { setStoppedByMe(true); void send(stopAgent()); };");
    expect(ui).toContain("const startCheck = () => { setAsked(true); setStoppedByMe(false); firstCheck(); go(\"check\"); };");
    // The reason is Home's error or notice line, which the first run covers, cleared when the check is pressed.
    const card = read("./card.tsx");
    expect(card).toContain("why={m.error ?? m.notice} /></PartBoundary>}");
    expect(read("./model.ts")).toContain('case "ui.findProblem": return { ...m, point: { stage: "checking" }, ...(e.fresh ? { error: null, notice: null } : {}) };');
  });
  test("through the model: a NEEDS_GIT failure and a refused send each reach the check screen as its reason", () => {
    const needsGit = "Squibby needs Apple's free developer tools to keep a safe copy of your project. Open Terminal, type  xcode-select --install  and press Return. When it finishes, try again.";
    const run = (evs: Record<string, unknown>[]): Model => evs.reduce<Model>((m, e) => reduce(m, e), { ...initial(), error: "an old error", notice: "an old notice" });
    // The engine: the safety copy cannot be made, so it says why and ends the check.
    const git = run([{ type: "ui.findProblem", fresh: true }, { type: "protocol.error", reason: needsGit, failed: "problem.find" }, { type: "problem.found", project: "/p", agent: "builder-1", verdict: "cancelled" }]);
    expect(checkStage(true, git.point, false)).toBe("stopped");
    expect(checkEndLine(false, git.error ?? git.notice)).toContain("xcode-select --install");
    // The shell refused the send (Flow switched off): the notice, and the point closed.
    const off = "That is switched off in Settings. Turn it back on there to use it.";
    const refused = run([{ type: "ui.findProblem", fresh: true }, { type: "app.notice", message: off }, { type: "ui.pointClosed" }]);
    expect(checkStage(true, refused.point, false)).toBe("stopped");
    expect(checkEndLine(false, refused.error ?? refused.notice)).toBe(off);
    // An old error from before the press is not this check's reason.
    const quiet = run([{ type: "ui.findProblem", fresh: true }, { type: "ui.pointClosed" }]);
    expect(checkEndLine(false, quiet.error ?? quiet.notice)).toBe(S.fr.checkCouldNot);
    // Home's own Point at the problem keeps its notice as before.
    expect(run([{ type: "ui.findProblem" }]).notice).toBe("an old notice");
  });
  test("the live line says the check, the question, the verdict's own words, or why it ended", () => {
    expect(checkAnnounce("checking", "shop", null, "")).toBe(`${S.fr.checking("shop")}. ${S.fr.checkPromise}`);
    expect(checkAnnounce("asking", "shop", null, "")).toBe(S.fr.checkAsk);
    const v = firstCheckVerdict({ stage: "clear" }, "shop")!;
    expect(checkAnnounce("done", "shop", v, "")).toBe(v.say);
    expect(v.say).toContain(S.fr.checkClear("shop"));
    expect(checkAnnounce("stopped", "shop", null, S.fr.checkCouldNot)).toBe(S.verdict.say(S.home.notChecked, S.fr.checkCouldNot));
    expect(checkAnnounce("idle", "shop", null, "")).toBe("");
  });
  test("a fold left open on one screen does not hide Flowflow on the next", () => {
    expect(read("./onboarding.tsx")).toContain('setDir(STEPS.indexOf(target) >= STEPS.indexOf(step) ? "on" : "back"); setOpen(null); setStep(target);');
  });
  test("where it is: not asked, running, waiting on an install question, answered, or stopped; an old answer is never this one", () => {
    expect(checkStage(false, { stage: "clear" }, false)).toBe("idle");
    expect(checkStage(true, { stage: "checking" }, false)).toBe("checking");
    expect(checkStage(true, { stage: "checking" }, true)).toBe("asking");
    expect(checkStage(true, found, false)).toBe("done");
    expect(checkStage(true, null, false)).toBe("stopped");
  });
  test("the install question is shown on the check screen, Don't allow first, and neither answer is silver", () => {
    const asks = installAsks([{ id: "a", risk: "install", agent: "builder-1" }, { id: "b", risk: "irreversible", agent: "builder-1" }, { id: "c", risk: "install", agent: "other" }, { id: "d", risk: "network", agent: "builder-1" }], "builder-1");
    expect(asks.map((a) => a.id)).toEqual(["a", "d"]);
    const chk = stepOf(read("./onboarding.tsx"), "check");
    const no = chk.indexOf("onClick={() => answer(a.id, false)}"), yes = chk.indexOf("onClick={() => answer(a.id, true)}");
    expect(no).toBeGreaterThan(0); expect(yes).toBeGreaterThan(no);
    expect(chk.slice(chk.indexOf("asks.map"), yes + 60)).not.toContain('kind="primary"');
    expect(read("./card.tsx")).toContain('const answerFromFirstRun = (approval: string, allow: boolean) => { void send(answerApproval(approval, allow)); dispatch({ type: "ui.approvalAnswered", approval }); };');
  });
  test("M67 review: the first check's other questions (run the scripts, with or without the safety box) are shown there too", () => {
    const asks = installAsks([{ id: "s", risk: "scripts", agent: "builder-1", check: true }, { id: "u", risk: "irreversible", agent: "builder-1", check: true }, { id: "t", risk: "irreversible", agent: "builder-1" }, { id: "o", risk: "scripts", agent: "other", check: true }], "builder-1");
    expect(asks.map((a) => a.id)).toEqual(["s", "u"]);
    // The engine's mark is kept on the card, so the screen can find it.
    const m = reduce(initial(), { v: 1, id: "e", ts: "", type: "approval.request", approval: "u", agent: "builder-1", checkpoint: "cp", toolUseId: "t", risk: "irreversible", title: "The safety box for checks is not working on this Mac.", expiresAt: "2999-01-01T00:00:00Z", check: true } as never);
    expect(installAsks(m.approvals, "builder-1").map((a) => a.id)).toEqual(["u"]);
  });
  test("the result is shown with the verdict line, and a project check is never called proven (M45)", () => {
    for (const p of [{ stage: "clear" }, { stage: "gaps" }, { stage: "nothing" }, found] as const) {
      const v = firstCheckVerdict(p, "shop")!;
      expect(v.proven).toBe(false);
      expect(v.offer).toBeNull();
      expect(v.headline).toContain("shop");
      expect(v.say).toBe(S.verdict.say(v.headline, v.line));
    }
    // What broke, in the check's own words (the audit, item 8); the check's name only when nothing else was said.
    expect(firstCheckVerdict(found, "shop")).toMatchObject({ kind: "failed", tone: "bad", icon: "cross", headline: S.home.failing("shop"), line: "tsc failed" });
    expect(firstCheckVerdict({ stage: "found", label: "Building and checking the code" }, "shop")?.line).toBe(S.fr.checkFoundAt("Building and checking the code"));
    expect(firstCheckVerdict({ stage: "clear" }, "shop")).toMatchObject({ tone: "good", icon: "tick" });
    expect(firstCheckVerdict({ stage: "gaps" }, "shop")).toMatchObject({ tone: "mixed" });
    expect(firstCheckVerdict({ stage: "checking" }, "shop")).toBeNull();
    expect(stepOf(read("./onboarding.tsx"), "check")).toContain("<VerdictLine verdict={result} size=\"headline\" inline />");
  });
});

describe("Your Claude: the honest lines, the key field and Test, and never a login form", () => {
  test("the three lines come from strings.ts: the key goes only to Claude, you pay Anthropic with a limit you can change, and the plan's own state", () => {
    const off = honestLines({ limitUsd: 10, plan: planCard(OFF, null) });
    expect(off.privacy).toBe(S.fr.keyPrivacy);
    expect(off.privacy).toContain("Keychain"); expect(off.privacy).toContain("only to Claude");
    expect(off.cost).toBe(S.fr.keyCost("$10"));
    expect(off.cost).toContain("pay Anthropic directly"); expect(off.cost).toContain("change that in Settings");
    expect(off.plan).toBe(S.fr.keyPlan(`${S.plan.earlyAccess}. ${S.plan.nothingCharged}`));
    expect(honestLines({ limitUsd: 12.5, plan: planCard(OFF, null) }).cost).toContain("$12.50");
    // With payments on, the line follows the Plan card, not a fixed promise.
    const free: PlanStatus = { ...OFF, paymentsOn: true, state: "free" };
    expect(honestLines({ limitUsd: 10, plan: planCard(free, null) }).plan).toBe(S.fr.keyPlan(S.plan.freeNew(3)));
    for (const l of Object.values(off)) { expect(l).not.toContain("\u2014"); expect(l).toMatch(/\.$/); }
  });
  test("M69 (F29): the first run has no key field, no password box, no cost words and never a login form (rule 2)", () => {
    const ui = read("./onboarding.tsx");
    expect(ui).not.toContain('type="password"');
    expect(ui).not.toContain("save_api_key");
    expect(ui).not.toContain("KEY_PAGE");
    expect(ui).not.toContain("honest.cost");
    for (const banned of ["auth login", "auth_login", "claude.ai", 'type="email"', "plan_login", "S.obPlanLater", "oauth"]) expect(ui.toLowerCase(), banned).not.toContain(banned.toLowerCase());
    for (const t of Object.values(S.fr)) if (typeof t === "string") expect(t, t).not.toMatch(/sign in with|log ?in with|your claude password/i);
    // What the welcome and its loop say carry no cost and no key.
    for (const t of [...S.screens.promises, S.screens.welcomeTitle, ...Object.values(S.firstLook.more), ...Object.values(S.firstLook.beats)]) expect(t, t).not.toMatch(/cents?\b|\$\d|your key|your own Claude|API key/i);
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
  test("the fold starts from what is in force: an unchanged name, lively or edge writes nothing, and a change is written (rereading the first run)", () => {
    const now = { name: "Blub", lively: "lively" as const, edge: "left" as const };
    expect(yoursSettings({ name: "Blub", lively: "lively", edge: "left" }, "Flowflow", now)).toEqual([]);
    expect(yoursSettings({ name: "Blub", lively: "still", edge: "left" }, "Flowflow", now)).toEqual([["character.lively", "still"]]);
    expect(yoursSettings({ name: "Blub", lively: "lively", edge: "top" }, "Flowflow", now)).toEqual([["character.edge", "top"]]);
    // Typing the character's own name resets a name that was chosen; clearing the box does too; neither writes when none was chosen.
    expect(yoursSettings({ name: "Flowflow", lively: "lively", edge: "left" }, "Flowflow", now)).toEqual([["character.name", ""]]);
    expect(yoursSettings({ name: "  ", lively: "lively", edge: "left" }, "Flowflow", now)).toEqual([["character.name", ""]]);
    expect(yoursSettings({ name: "Flowflow", lively: "still", edge: "right" }, "Flowflow", { name: "", lively: "still", edge: "right" })).toEqual([]);
  });
  test("the page seeds the fold from the settings in force, not from empty choices", () => {
    const ui = readFileSync(new URL("./onboarding.tsx", import.meta.url), "utf8");
    expect(ui).toContain("const yoursNow = (): Pick<Yours, \"name\" | \"lively\" | \"edge\">");
    expect(ui).toContain("useState<Yours>(() => ({ ...DEFAULT_YOURS, ...yoursNow() }))");
    expect(ui).toContain("yoursSettings(yours, own, yoursNow())");
  });
  test("M46: how lively is three choices, Still pressed first; it writes character.lively, never the reactions, and the follow step is gone", () => {
    const page = readFileSync(new URL("./onboarding.tsx", import.meta.url), "utf8");
    expect(page).toContain('const LIVELY: Liveliness[] = ["still", "gentle", "lively"];');
    expect(page).toContain('<Segmented label={S.fr.livelyLabel} value={yours.lively ?? "still"}');
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
    expect(characterName("")).toBe("Squibby"); expect(characterName(undefined)).toBe("Squibby");   // M72 (item 7): one product name
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
    expect(ui).toContain("for (const [key, on] of settingsFor(answers, answered)) void changeSetting(key, on);");
    expect(ui).not.toContain("setExplain");
    expect(cmds.filter((c) => c.type === "memory.add").map((c) => c.text)).toEqual(["Prefers short answers", "Prefers plain words, no jargon"]);
    expect(cmds.every((c) => c.type !== "memory.add" || c.source === "your answer at setup")).toBe(true);
  });
  test("only the questions the person answered are saved: a pre-filled answer is never said to be theirs (rule 15)", () => {
    const add = (scope: "profile", text: string, source: string) => addMemory("/p", scope, text, source);
    const only = new Set(["autoSend"] as const);
    // Plain words starts as yes, but nobody answered it: no "Prefers plain words" line with "your answer at setup".
    expect((commandsFor({ ...DEFAULT_ANSWERS, autoSend: true }, "/p", add, only) as any[]).filter((c) => c.type === "memory.add")).toEqual([]);
    expect(settingsFor({ ...DEFAULT_ANSWERS, autoSend: true }, only)).toEqual([["talk.autoSend", true]]);
    expect(settingsFor(DEFAULT_ANSWERS, new Set())).toEqual([]);
    expect((commandsFor(DEFAULT_ANSWERS, "/p", add, new Set(["plain"])) as any[]).map((c) => c.text)).toEqual(["Prefers plain words, no jargon"]);
    expect([...ALL_ANSWERED].sort()).toEqual(QUESTIONS.map((q) => q.key).sort());
    const ui = read("./onboarding.tsx");
    expect(ui).toContain("setAnswered((s) => new Set(s).add(q.key));");
    expect(ui).toContain("commandsFor(answers, project, (scope, text, source) => addMemory(project, scope, text, source) as Command, answered)");
    expect(ui).toContain("settingsFor(answers, answered)");
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
  test("every answer about a key (Settings, developer route) is in plain words", () => {
    for (const k of ["checking", "works", "refused", "no_connection", "unknown"] as const) { expect(S.obKeyCheck[k].length).toBeGreaterThan(10); expect(S.obKeyCheck[k]).not.toMatch(/40[13]|status|HTTP|models/); }
    expect(KEY_PAGE).toBe("https://console.anthropic.com/settings/keys");
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
// Prompt help and the error explainer, and INSTALL.md gave other, incomplete reasons. INSTALL.md names every feature that
// asks; what the first run itself says (S.fr.powersLine and S.fr.asks) is checked in launchCut.test.ts.
describe("INSTALL names every feature that asks for each permission", () => {
  const install = readFileSync(new URL("../../docs/alpha/INSTALL.md", import.meta.url), "utf8");
  const section = install.slice(install.indexOf("## What it asks for, and when"), install.indexOf("## The keys"));
  test("Accessibility: Prompt help, the error explainer and Do it for me", () => {
    for (const f of ["Prompt help", "error", "Do it for me"]) expect(section, f).toContain(f);
  });
  test("Screen Recording: Show me, a lesson's step and Point at the problem", () => {
    for (const f of ["Show me", "lesson", "Point at the problem"]) expect(section, f).toContain(f);
  });
});

describe("the first run explains the groups (F20 item 6)", () => {
  test("the groups keep their place in the first run, folded on the last screen with the optional questions", () => {
    const ui = readFileSync(new URL("./onboarding.tsx", import.meta.url), "utf8");
    const chk = stepOf(ui, "check");
    expect(chk).toContain('fold("powers", S.fr.powersTitle,');
    expect(chk.indexOf('fold("powers"')).toBeLessThan(chk.indexOf("SWITCHED.map"));
    expect(chk.indexOf('fold("questions"')).toBeLessThan(chk.indexOf("QUESTIONS.map"));
    expect(chk).toContain('fold("yours", S.fr.yoursTitle(own),');
    expect(ui).toContain("<Disclosure title={title} open={open === id} onToggle={(o) => setOpen(o ? id : null)}>{body}</Disclosure>");
  });
  test("each group is explained in one short line, five lines in all, in plain words with no score or level", () => {
    const lines = Object.values(S.groups.short);
    expect(lines.length).toBe(5);
    for (const l of lines) { expect(l.length).toBeGreaterThan(20); expect(l.length).toBeLessThan(110); expect(l).toMatch(/\.$/); }
  });
  test("switching a group off in the first run changes the same setting Settings does, and leaving it on changes nothing", () => {
    // Only what differs from the values in force (F28: file conversion starts off, so leaving it off changes nothing).
    const usual = (k: string) => (k === "files.on" ? false : undefined);
    expect(groupSettingsFor(["files"], usual)).toEqual([]);
    expect(groupSettingsFor(["voice", "files"], usual)).toEqual([["voice.on", false]]);
    expect(groupSettingsFor([], usual)).toEqual([["files.on", true]]);
    const ui = readFileSync(new URL("./onboarding.tsx", import.meta.url), "utf8");
    expect(ui).toContain("for (const [key, on] of groupSettingsFor(groupsOff)) void changeSetting(key, on);");
  });
  test("the choices made on the way are kept however the first run ends; the questions only with Go to my project", () => {
    const ui = readFileSync(new URL("./onboarding.tsx", import.meta.url), "utf8");
    const keep = ui.slice(ui.indexOf("const keepChoices = () => {"), ui.indexOf("const finish = () => {"));
    expect(keep).toContain("yoursSettings(yours, own, yoursNow())"); expect(keep).toContain("groupSettingsFor(groupsOff)");
    expect(keep).not.toContain("settingsFor(answers)"); expect(keep).not.toContain("commandsFor(");
    const fin = ui.slice(ui.indexOf("const finish = () => {"), ui.indexOf("const saveKey"));
    expect(fin).toContain("keepChoices();"); expect(fin).toContain("settingsFor(answers, answered)");
    // A skip never saves answers the person did not give (rule 15: the profile learns only from explicit signals).
    expect(fin).toContain("if (answered.size > 0) {");
    expect(ui).toContain("onChange={(v) => { setAnswered((s) => new Set(s).add(q.key)); setAnswers({ ...answers, [q.key]: v === \"yes\" }); }}");
    expect(ui).toContain("onClick={() => { keepChoices(); onDone(); startPractice(first.id); }}");
    expect(ui).toContain("main(S.fr.goProject, finish, ");
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
  test("only the four keys of F28 that can be pressed now, in the Mac's own caps (KeyLabel reads the words to VoiceOver)", () => {
    expect([...FIRST_KEYS]).toEqual(["problem", "talk", "read", "stop"]);
    const ui = readFileSync(new URL("./onboarding.tsx", import.meta.url), "utf8");
    expect(ui).toContain("keyRows(keys).filter((r) => FIRST_KEYS.includes(r.job) && !r.none && keys.using[r.job as keyof typeof keys.using] && keyShownFirst(r.job, groupsOff))");
    expect(ui).toContain("<KeyLabel chord={keys.using[r.job as keyof typeof keys.using]} />");
  });
});

describe("the last screen's keys follow the groups switched off on the same screen", () => {
  test("Hold to talk and Prompt help leave the list once their groups are off here, and come back when they are on", () => {
    const on = () => undefined as unknown, none: string[] = [];
    expect(FIRST_KEYS.filter((j) => keyShownFirst(j, none, on))).toEqual(["problem", "talk", "read", "stop"]);
    expect(keyShownFirst("talk", ["voice"], on)).toBe(false);
    expect(keyShownFirst("read", ["prompt"], on)).toBe(false);
    expect(keyShownFirst("problem", ["voice", "prompt"], on)).toBe(true);
    expect(keyShownFirst("stop", ["flow", "guide", "voice", "files", "prompt"], on)).toBe(true);   // Stop is core: always there
    expect(keyShownFirst("talk", ["prompt"], on)).toBe(true);
  });
});

describe("the first run offers no choice of one companion (M28, M49)", () => {
  test("Flowflow is met on the hello and lives on the water; there is no pick step and no empty slot", () => {
    const src = readFileSync(new URL("./onboarding.tsx", import.meta.url), "utf8");
    expect(src).not.toContain("fr-pick");
    expect(src).not.toContain("fr-soon");
    expect(src).not.toContain("COMPANIONS");
    expect((S.fr as Record<string, unknown>).pickTitle).toBeUndefined();
    expect((S.fr as Record<string, unknown>).helloGo).toBeUndefined();   // "Say hello" is gone (the executive review)
  });
});

describe("the first run has no dead end (M28, M69)", () => {
  test("Welcome's Skip finishes, and Pick a project's Skip leaves the first run", () => {
    const src = readFileSync(new URL("./onboarding.tsx", import.meta.url), "utf8");
    expect(stepOf(src, "hello")).toContain("onClick={finish}>{S.fr.skipSetup}</Button>");
    expect(skipTo("project")).toBe("done");
    expect(src).not.toContain("S.obPlanLater");
  });
});

describe("keyboard, VoiceOver and motion", () => {
  test("after Continue, Back or Skip the keyboard goes to the new screen's heading, and the check says where it is", () => {
    const ui = readFileSync(new URL("./onboarding.tsx", import.meta.url), "utf8");
    expect(ui).toContain("}, [view]);");
    const chk = stepOf(ui, "check");
    // One live line, always there on the check screen, carries each change (WebKit may not read a live region that is
    // added with its words already in it); the lines the eye reads are not live, so nothing is said twice.
    expect(chk).toContain('<p className="sr" role="status" aria-live="polite">{announce}</p>');
    expect(chk.match(/role="status"/g)?.length).toBe(1);
    expect(chk).toContain('<p className="fr-line fr-live"><span className="live" aria-hidden="true" />{point?.label || S.fr.checkPromise}</p>');
    expect(chk).toContain('{stage === "stopped" && <p className="fr-line">{endLine}</p>}');
    // Every button is the Button part (named by its words), but Back, which is named for VoiceOver.
    expect((ui.match(/<button /g) ?? []).length).toBe(1);
    expect(ui).toContain('<button className="fr-back" type="button" aria-label={S.obBack}');
  });
  test("with Reduce motion or Less motion nothing moves: the recording waits for Next step, and the drop and rise are off", () => {
    const look = readFileSync(new URL("./firstLook.tsx", import.meta.url), "utf8");
    expect(look).toContain("const playing = !reduced && !paused && picked === null;");
    const css = readFileSync(new URL("./style.css", import.meta.url), "utf8");
    expect(css).toContain("@media (prefers-reduced-motion: reduce) { .fr-hello .fr-rise { opacity: 1; } .fr-hello .fr-drop { display: none; } }");
    // Squibby's own Less motion turns every animation off, so the rise must not wait at its starting opacity of 0.
    expect(css).toContain(":root[data-less-motion] .fr-hello .fr-rise { opacity: 1; }");
    expect(css).toContain(":root[data-less-motion] .fr-hello .fr-drop { display: none; }");
    expect(css).toContain("@media (prefers-reduced-motion: reduce) { *, *::before, *::after { animation: none !important; transition-property: opacity, color, background-color, border-color, outline-color, fill, stroke !important;");
  });
});

describe("two tone headline (M41)", () => {
  test("the first sentence, then the rest", async () => {
    const { twoTone } = await import("./onboarding.tsx");
    expect(twoTone("Your AI built it. Let's finish it.")).toEqual(["Your AI built it.", "Let's finish it."]);
    expect(twoTone("One sentence only")).toEqual(["One sentence only", ""]);
  });
});

describe("the first run's wording and cards match Home's", () => {
  test("the key steps do not point back at a fix that may not have been watched", () => {
    expect(S.obKeySteps.join(" ")).not.toMatch(/you just saw/);
  });
  test("the first check's question shows the command the way Home's approval card does (no Running: prefix)", () => {
    const ui = readFileSync(new URL("./onboarding.tsx", import.meta.url), "utf8");
    expect(ui).toContain("whatOf(a.action, project)");
    expect(ui).not.toContain("{a.action}");
  });
});
