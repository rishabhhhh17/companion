// M58 step 3 (review fixes of 5 Nov): each test pins one finding from the shot review. Pure parts and the model; the card's
// source is read where the wiring itself is the thing to pin.
import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { initial, reduce, type Model } from "./model.ts";
import { heroWords } from "./homeHero.ts";
import { need } from "./home.ts";
import { stopCan } from "./homeHero.ts";
import { fixLadder, stuckRung, optionWords } from "./fixLadder.ts";
import { askChips as chipsFor } from "./askChips.ts";
import { S } from "./strings.ts";

const ev = (o: Record<string, unknown>) => ({ v: 1, id: "e", ...o });
const run = (events: Record<string, unknown>[], from: Model = initial()) => events.reduce<Model>((m, e) => reduce(m, e as never), from);
const card = readFileSync(join(import.meta.dir, "./card.tsx"), "utf8");
const place = { kind: "line", file: "src/App.tsx", line: 5, lineText: "const total: number = \"three\";", message: "Type 'string' is not assignable to type 'number'.", from: "checks" };
const found = [ev({ type: "ui.findProblem" }), ev({ type: "problem.found", project: "p", agent: "finder", verdict: "failed", label: "Building and checking the code", detail: "tsc failed", problem: place })];
const stuck = (options: { id: string; label: string }[]) => ev({ type: "loop.stuck", index: 0, title: "Fix it", failure: { label: "x", parts: [] }, options });

describe("the stuck card says one thing", () => {
  test("the hero does not send the person to the ask box for a card with choices", () => {
    const m = run([stuck([{ id: "different", label: "x" }, { id: "stop", label: "y" }])]);
    const h = heroWords(m, "/p");
    expect(h.line).toBe(S.look.pickBelow);
    expect(h.line).not.toContain("answer");
  });
  test("the card keeps its name for VoiceOver only, so the title is not said twice", () => {
    const at = card.indexOf("{m.stuck && (");
    const block = card.slice(at, card.indexOf("{m.paused && (", at));
    expect(block).toContain('<h2 className="sr">{S.stuckTitle}</h2>');
  });
  test("the current ladder row is the main button's own step, in the same words", () => {
    const opts: { id: string; label: string }[] = [{ id: "different", label: "x" }, { id: "research", label: "x" }, { id: "lastWorking", label: "x" }, { id: "stop", label: "x" }];
    expect(stuckRung(opts)).toBe("retry");
    const rows = fixLadder({ rung: stuckRung(opts), webSearch: true, lastWorking: "2:14 pm" });
    expect(rows.find((r) => r.current)!.words).toBe(optionWords(opts[0]));
    expect(stuckRung([{ id: "research", label: "x" }, { id: "stop", label: "x" }])).toBe("research");
    expect(stuckRung([{ id: "lastWorking", label: "x" }])).toBe("lastWorking");
  });
  test("a saved version with no known time has no placeholder bracket", () => {
    const row = fixLadder({ webSearch: false, lastWorking: "" }).find((r) => r.id === "lastWorking")!;
    expect(row.words).toBe(S.fix.ladder.lastWorking);
    expect(row.words).not.toContain("(");
  });
});

describe("Fix it pressed is working, not waiting", () => {
  const pressed = run([...found, ev({ type: "ui.pointFixing" })]);
  test("the hero says Fixing it with the safety copy line, and the raw error is not the headline", () => {
    const h = heroWords(pressed, "/p");
    expect(h.headline).toBe(S.fix.fixingTitle);
    expect(h.line).toBe(S.fix.startingLine);
    expect(h.tone).toBe("working");
  });
  test("Home is in the working mode, so the status hero does not still say the project has a problem", async () => {
    const { homeMode } = await import("./homeHero.ts");
    expect(homeMode(pressed)).toBe("working");
    expect(homeMode(run(found))).not.toBe("working");
  });
  test("nothing needs the person while it starts, so the badge is not Needs you", () => {
    expect(need(pressed)).toBeNull();
  });
  test("Stop is available while the fix starts, and the card has no Close then", () => {
    expect(stopCan(pressed)).toBe(true);
    expect(card).toContain("!m.point.fixing && <button className=\"btn\" type=\"button\" onClick={() => { putAside(m.point?.agent); void invoke(\"showme_clear\")");
  });
  test("the ask chip for the found problem is hidden while the fix starts", () => {
    expect(card).toContain('checkFound: m.point?.stage === "found" && !m.point.fixing');
    expect(chipsFor({ project: "/p", checkFound: true } as never).some((c) => c.id === "found")).toBe(true);
  });
});

describe("the finished practice shows one main step", () => {
  const panel = readFileSync(join(import.meta.dir, "./practicePanel.tsx"), "utf8");
  const done = panel.slice(panel.indexOf('{p.stage === "done" && <>'), panel.indexOf('{p.stage === "failed" && <>'));
  test("Undo is quiet, the extras sit in one More fold, and only one button is primary", () => {
    expect(panel).not.toContain('className="btn danger" type="button" onClick={() => act.undoAsk');
    expect(done).toContain("<details");
    expect(done.split("btn primary").length - 1).toBeLessThanOrEqual(3);
    // Back, Start over, Remove my copy and Close are all inside the fold.
    const fold = done.slice(done.indexOf("<details"));
    for (const w of ["act.back", "CopyButtons", "act.close"]) expect(fold).toContain(w);
    expect(S.practiceMoreNote).toMatch(/Close/);
    expect(S.practiceMoreNote).not.toMatch(/great|well done|streak/i);
  });
});

describe("the page and the go live card say the same thing", () => {
  const gate = (status: string) => ({ id: "checked", label: "Checked", status, detail: "" });
  const withShip = (gates: unknown[], canShip: boolean) => ({ ...initial(), ship: { gates, canShip, blockedBy: [], needsYou: [], confirmed: [] } }) as unknown as Model;
  test("every gate passed: not 'Not checked yet'", async () => {
    const { homeStatus } = await import("./homeHero.ts");
    const s = homeStatus(withShip([gate("passed")], true), "/p/my-shop", Date.now());
    expect(s.verdict.headline).toBe(S.home.checksPass("my-shop"));
    expect(s.verdict.headline).not.toBe(S.home.notChecked);
    expect(s.verdict.proven).toBe(false);   // checks pass is not a proven fix (rule 14)
  });
  test("a blocked or unchecked gate: not ready, never Ready", async () => {
    const { homeStatus } = await import("./homeHero.ts");
    for (const g of ["blocked", "could_not_check"]) {
      const s = homeStatus(withShip([gate("passed"), gate(g)], false), "/p/my-shop", Date.now());
      expect(s.verdict.headline).toBe(S.home.notReadyOnline("my-shop"));
      expect(s.verdict.headline).not.toMatch(/pass/i);
    }
  });
  test("no go live answer: the status is as before", async () => {
    const { homeStatus } = await import("./homeHero.ts");
    expect(homeStatus(initial(), "/p/my-shop", Date.now()).verdict.headline).toBe(S.home.notChecked);
  });
});

describe("a check that stopped at a sign in page", () => {
  test("the page says the result once and what is left, never the same words twice", async () => {
    const { homeStatus } = await import("./homeHero.ts");
    const m = run([
      ev({ type: "checkpoint.created", project: "/p/my-shop", agent: "a", checkpoint: "cp_1", label: "Before: Fix the sign up button", files: 1, skipped: [] }),
      ev({ type: "proof.step", agent: "a", rung: "browser", label: "Opening it in a browser", status: "passed", detail: "The page needs a sign in.", needs: "signIn" }),
      ev({ type: "receipt", agent: "a", checkpoint: "cp_1", changed: [{ file: "a.js", kind: "modified" }], commands: 0, notUndoable: [], usdEstimate: 0, proof: "passed_with_gaps", ended: "done" }),
    ]);
    expect(m.task?.proof?.steps.some((x) => x.needs === "signIn")).toBe(true);
    const s = homeStatus(m, "/p/my-shop", Date.now());
    expect(s.sub).toBe(S.home.signInRest);
    expect(s.verdict.proven).toBe(false);
    expect(S.fix.signInTurn).not.toMatch(/^Your turn/);
    expect(S.fix.signInTurn).toMatch(/not checked/);
  });
});

describe("the first run keeps Continue on the first screen and names what the check does", () => {
  const ob = readFileSync(join(import.meta.dir, "./onboarding.tsx"), "utf8");
  const css = readFileSync(join(import.meta.dir, "./ui/look.css"), "utf8");
  test("the optional question is behind one link and never shows by itself", () => {
    expect(ob).toContain("const [buildsOpen, setBuildsOpen] = useState(false);");
    expect(ob).toContain("{buildsOpen && <div className=\"fr-builds\"");
    expect(S.screens.buildsWithLink).toMatch(/optional/);
  });
  test("Continue sticks to the bottom of the slide", () => {
    expect(css).toMatch(/\.home \.fr \.fr-slide > \.fr-key \{ position: sticky; bottom:/);
  });
  test("the check button says what it does, and the line says it reads and runs, not edits", () => {
    expect(S.fr.checkGo("my-shop")).toBe("Look for problems in my-shop");
    expect(S.fr.checkWhat).toBe("I read your files and run your tests.");
    expect(ob).toContain("{S.fr.checkWhat} {S.fr.checkPromise}");
  });
});

describe("the key practice says Found it once, and Skip is quiet", () => {
  const panel = readFileSync(join(import.meta.dir, "./practicePanel.tsx"), "utf8");
  test("the bubble is quiet on a found problem; Skip the practice is a quiet button", () => {
    expect(panel).toContain('const quiet = stage === "fixing" || stage === "proving" || stage === "found";');
    expect(panel).toContain('<button className="btn quiet" type="button" onClick={act.close}>{S.practiceSkip}</button>');
  });
  test("the tall Home's title is for VoiceOver only (the row of places names the open one)", () => {
    expect(card).toContain('className={!side && home.tab !== "settings" ? "view-title sr" : "view-title"}');
  });
});

describe("History marks are separate tags, and Star looks like Name it", () => {
  const row = readFileSync(join(import.meta.dir, "./savePointsRow.tsx"), "utf8");
  test("no dotted string, a hint for Last working, and no filled Remove star", () => {
    expect(row).not.toContain('parts.join(" · ")');
    expect(row).toContain('className="hist-mark"');
    expect(row).toContain("S.fix.lastWorkingHint");
    expect(row).not.toContain("pressed={!!star}");
    expect(S.fix.lastWorkingHint).toMatch(/last working|keeps failing/i);
  });
});

describe("the review card: a key is never 'kept anyway', and the title is only the headline", () => {
  const rc = readFileSync(join(import.meta.dir, "./reviewCard.tsx"), "utf8");
  test("a key in the code names the consequence on the closing button", async () => {
    const { keepWords } = await import("./findingShape.ts");
    const key = { stage: "ready", count: 1, keys: [{ file: "pay.ts", line: 3 }] } as never;
    expect(keepWords(key)).toBe(S.review.leaveKey);
    const keyReviewed = { stage: "reviewed", count: 1, result: { rating: "stop", reasons: [{ kind: "secret_in_code" }] } } as never;
    expect(keepWords(keyReviewed)).toBe(S.review.leaveKey);
    const other = { stage: "reviewed", count: 1, result: { rating: "stop", reasons: [{ kind: "checks_failed" }] } } as never;
    expect(keepWords(other)).toBe(S.review.keepAnyway);
    expect(rc).not.toContain("{S.review.keepAnyway}</button>");
  });
  test("the explanation is its own paragraph, not part of the heading", () => {
    expect(rc).toContain('<h1 id={`${REVIEW_ID}-title`} className="rv-title"><span id={titleId}>{head.headline}</span></h1>');
    expect(rc).toContain('<p className="rv-why-line">{head.why}</p>');
  });
  test("the lead finding shows how to fix it in the primary card (the four parts are visible, not only in the fold)", () => {
    expect(rc).toContain("<LeadParts f={shapeFindings(r)[0]} />");
  });
});

describe("Vercel sign in: Check again checks, Close ends a waiting sign in, no stale instruction", () => {
  test("Check again runs the check before going live, never a preview deploy", () => {
    expect(card).toContain("onCheckAgain={() => shipIt()}");
    expect(card).not.toContain("onCheckAgain={shipOnline}");
  });
  test("a sign in still waiting is told apart, so the box can stop it", async () => {
    const { signingIn, detailShown } = await import("./shipFinish.ts");
    const f = (stage: string, signIn?: unknown) => ({ project: "/p", stage, detail: "x", ...(signIn ? { signIn } : {}) }) as never;
    expect(signingIn(f("not_signed_in", { stage: "asked" }))).toBe(true);
    expect(signingIn(f("not_signed_in", { stage: "opened", url: "https://vercel.com/device" }))).toBe(true);
    expect(signingIn(f("not_signed_in", { stage: "done" }))).toBe(false);
    expect(signingIn(f("not_signed_in"))).toBe(false);
    // The old "Press Sign in to Vercel" line is hidden once the person has pressed it (the button is gone).
    expect(detailShown(f("not_signed_in"))).toBe(true);
    for (const s of [{ stage: "asked" }, { stage: "opened", url: "https://vercel.com/device" }, { stage: "done" }]) expect(detailShown(f("not_signed_in", s))).toBe(false);
    expect(detailShown(f("failed"))).toBe(true);
  });
  test("while a sign in waits, the one way out ends it; the box has one Close", async () => {
    const { shipSignInStop } = await import("./commands.ts");
    const { parseCommand, serialize } = await import("../../protocol/index.ts");
    const c = shipSignInStop("/p");
    expect(c).toMatchObject({ type: "ship.signIn", project: "/p", stop: true });
    expect(parseCommand(serialize(c)).ok).toBe(true);
    const box = card.slice(card.indexOf("function OnlineBox"), card.indexOf("function OnlineBox") + 8500);
    expect(box).toContain("shipSignInStop(project)");
    expect(box).toContain("S.going.signInStop");
    expect(box.split("S.onlineClose").length - 1).toBe(1);
  });
  test("the done line says the sign in finished, not that the login was checked", () => {
    expect(S.going.signInDone).toBe("Vercel's sign in finished.");
  });
});

describe("after Stop, one main button", () => {
  test("Undo what it did is primary and the hero's Carry on is secondary while Undo is ready", () => {
    expect(card).toContain('kind={receiptVerdict(m)?.kind === "stopped" && undoCan(m, project) ? "secondary" : "primary"}');
  });
});

describe("a browser check that stopped at a sign in page is not a tick", () => {
  test("its proof tick is unfinished and says where it stopped", async () => {
    const { proofTicks } = await import("./runList.ts");
    const m = run([
      ev({ type: "checkpoint.created", project: "/p/my-shop", agent: "a", checkpoint: "cp_1", label: "Before: x", files: 1, skipped: [] }),
      ev({ type: "proof.step", agent: "a", rung: "browser", label: "Opening it in a browser", status: "passed", detail: "The page needs a sign in.", needs: "signIn" }),
      ev({ type: "receipt", agent: "a", checkpoint: "cp_1", changed: [{ file: "a.js", kind: "modified" }], commands: 0, notUndoable: [], usdEstimate: 0, proof: "passed_with_gaps", ended: "done" }),
    ]);
    const t = proofTicks(m).find((x) => x.rung === "browser")!;
    expect(t.state).toBe("unfinished");
    expect(t.words).toBe(S.fix.browserSignInStop);
  });
});

describe("the at rest hero says what the go live card says", () => {
  const gate = (status: string) => ({ id: "checked", label: "Checked", status, detail: "" });
  const input = (goLive: "ready" | "blocked" | null) => ({ project: "/p/my-shop", status: { kind: "unchecked", verdict: {}, sub: "", ago: "", main: "check" }, history: [], reviews: [], sinceChanged: false, now: Date.now(), goLive }) as never;
  test("ready is checks pass, blocked is not ready, none is as before", async () => {
    const { restHero } = await import("./homeRest.ts");
    expect(restHero(input("ready")).first).toBe(S.homeNow.checksPass("my-shop"));
    expect(restHero(input("blocked")).first).toBe(S.home.notReadyOnline("my-shop"));
    expect(restHero(input(null)).first).not.toBe(S.homeNow.checksPass("my-shop"));
  });
  test("goLiveAnswer is the one answer, and a practice or a newer result has none", async () => {
    const { goLiveAnswer } = await import("./homeHero.ts");
    const ship = (gates: unknown[], canShip: boolean) => ({ gates, canShip, blockedBy: [], needsYou: [], confirmed: [] }) as never;
    expect(goLiveAnswer({ ship: ship([gate("passed")], true) }, "/p/my-shop")).toBe("ready");
    expect(goLiveAnswer({ ship: ship([gate("passed"), gate("blocked")], false) }, "/p/my-shop")).toBe("blocked");
    expect(goLiveAnswer({ ship: ship([gate("passed")], false) }, "/p/my-shop")).toBe("blocked");
    expect(goLiveAnswer({ ship: null }, "/p/my-shop")).toBeNull();
    expect(goLiveAnswer({ ship: ship([gate("passed")], true), practice: { project: "/p/my-shop" } as never }, "/p/my-shop")).toBeNull();
  });
  test("the card passes it to the rest hero", () => {
    expect(card).toContain("goLive: goLiveAnswer(m, project)");
  });
});
