// M114, approve and answer from the notch (docs/milestones/M114-approve-from-notch.md), rendered: a permission request of the
// person's own AI tool shows in the notch's question list with what it wants, Don't allow, Always allow (its rule shown
// first) and Allow, and Answer in the tool; a question shows one question at a time with its choices. A press is one
// toolask.answer, only once the card is armed; nothing else is sent, and nothing opens Home.
import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { IslandPanel } from "../src/islandPanel.tsx";
import { initial, reduce, type Model } from "../src/model.ts";
import { S } from "../src/strings.ts";
import { ARM_MS } from "../src/islandPanel.ts";
import { PROJECT, act, app, ev, fireEvent, renderPage } from "./render.tsx";

const fx = readFileSync(new URL("../../protocol/fixtures/events.jsonl", import.meta.url), "utf8").split("\n").filter((l) => l.includes('"id":"m114e')).map((l) => JSON.parse(l) as Record<string, unknown>);
const later = (e: Record<string, unknown>) => ({ ...e, expiresAt: "2999-01-01T00:00:00.000Z" });
const [perm, question, codexEdit] = [later(fx[0]!), later(fx[1]!), later(fx[2]!)];
const run = (events: Record<string, unknown>[], from: Model = initial()) => events.reduce<Model>((m, e) => reduce(m, ev(e) as never), from);
const atRest = () => run([{ type: "auth.status", method: "api_key", source: "keychain" }, { type: "ui.folderShown", project: PROJECT }]);
const wait = (ms: number) => act(async () => { await new Promise((r) => setTimeout(r, ms)); });
const click = async (el: Element) => { await act(async () => { fireEvent.click(el); await new Promise((r) => setTimeout(r, 10)); }); };
const button = (name: string) => [...document.querySelectorAll(".ta-card button")].find((b) => (b.querySelector(".ta-label")?.textContent ?? b.textContent) === name)!;
const sentAsks = () => app.sent().filter((c) => (c as { type?: string }).type === "toolask.answer");

describe("a permission request", () => {
  test("shows what the tool wants, the command, the project, the rule Always saves, and the buttons", async () => {
    await renderPage(<IslandPanel m={run([perm], atRest())} line="" shown />);
    const card = document.querySelector(".ta-card")!;
    expect(card).toBeTruthy();
    expect(card.getAttribute("role")).toBe("group");
    expect(card.getAttribute("aria-label")).toBe(`${S.m114.wants.run("Claude Code")}: npm test. ${S.m114.inProject("shop")}.`);
    expect(card.querySelector(".ip-text b")!.textContent).toBe(S.m114.wants.run("Claude Code"));
    expect(card.querySelector(".ip-text code")!.textContent).toBe("npm test");
    // Always allow's rule is on the card before any press, in code type.
    expect(card.querySelector(".ta-rule")!.textContent).toBe(S.m114.alwaysLine("Bash(npm test:*)"));
    expect(card.querySelector(".ta-rule code")!.textContent).toBe("Bash(npm test:*)");
    expect([...card.querySelectorAll(".ip-answer button")].map((b) => b.textContent)).toEqual([S.dontAllow, S.m114.always, S.allow]);
    expect(card.querySelector("button.ta-intool")!.textContent).toBe(S.m114.inTool("Claude Code"));
    expect(card.querySelector("button.ta-intool")!.getAttribute("aria-label")).toBe(S.m114.inToolSay("Claude Code"));
    // It is the question view: the live feed and the greeting row's pill step aside.
    expect(document.querySelector(".lf")).toBeNull();
  });
  test("a press before the card is armed does nothing; after, it sends one toolask.answer and opens nothing", async () => {
    await renderPage(<IslandPanel m={run([perm], atRest())} line="" shown />);
    app.calls.length = 0;
    await click(button(S.allow));
    expect(sentAsks()).toEqual([]);
    await wait(ARM_MS + 60);
    expect(document.querySelector(".ta-card")!.getAttribute("data-armed")).toBe("yes");
    await click(button(S.allow));
    expect(sentAsks()).toMatchObject([{ type: "toolask.answer", ask: "ta_0123456789ab", choice: "allow" }]);
    expect(app.invoked("island_go")).toEqual([]);
    expect(app.invoked("island_click")).toEqual([]);
  });
  test("Always allow, Don't allow and Answer in the tool each send their own choice", async () => {
    for (const [name, choice] of [[S.m114.always, "always"], [S.dontAllow, "deny"], [S.m114.inTool("Claude Code"), "tool"]] as const) {
      const r = await renderPage(<IslandPanel m={run([perm], atRest())} line="" shown />);
      await wait(ARM_MS + 60);
      app.calls.length = 0;
      await click(button(name));
      expect(sentAsks()).toMatchObject([{ choice }]);
      r.unmount();
    }
  });
  test("Codex: a file, Don't allow and Allow, no Always", async () => {
    await renderPage(<IslandPanel m={run([codexEdit], atRest())} line="" shown />);
    const card = document.querySelector(".ta-card")!;
    expect(card.querySelector(".ip-text b")!.textContent).toBe(S.m114.wants.edit("Codex"));
    expect(card.querySelector(".ta-rule")).toBeNull();
    expect([...card.querySelectorAll(".ip-answer button")].map((b) => b.textContent)).toEqual([S.dontAllow, S.allow]);
    expect(card.querySelector("button.ta-intool")!.textContent).toBe(S.m114.inTool("Codex"));
  });
  test("one card at a time, with how many more wait; resolved, the next one shows", async () => {
    const m = run([perm, codexEdit], atRest());
    const r = await renderPage(<IslandPanel m={m} line="" shown />);
    expect(document.querySelectorAll(".ta-card")).toHaveLength(1);
    expect(document.querySelector(".ta-more")!.textContent).toBe(S.m114.more(1));
    await act(async () => { r.rerender(<IslandPanel m={reduce(m, ev({ type: "toolask.resolved", ask: "ta_0123456789ab", outcome: "elsewhere" }) as never)} line="" shown />); await new Promise((res) => setTimeout(res, 20)); });
    expect(document.querySelector(".ta-card .ip-text b")!.textContent).toBe(S.m114.wants.edit("Codex"));
    expect(document.querySelector(".ta-more")).toBeNull();
  });
  test("Stop everything takes every card away", async () => {
    await renderPage(<IslandPanel m={reduce(run([perm, codexEdit], atRest()), { type: "app.stop_everything" } as never)} line="" shown />);
    expect(document.querySelector(".ta-card")).toBeNull();
  });
});

describe("a question", () => {
  test("one question at a time: a one pick choice goes on, several toggle, Send sends every pick", async () => {
    await renderPage(<IslandPanel m={run([question], atRest())} line="" shown />);
    await wait(ARM_MS + 60);
    app.calls.length = 0;
    const card = document.querySelector(".ta-card")!;
    expect(card.querySelector(".ip-text b")!.textContent).toBe("Which database should we use?");
    expect(card.querySelector(".ta-count")!.textContent).toBe(S.m114.of(1, 2));
    const choices = () => [...document.querySelectorAll(".ta-choices button")];
    expect(choices().map((b) => b.querySelector(".ta-label")!.textContent)).toEqual(["SQLite", "Postgres"]);
    // A choice's own words are said and shown as its tooltip.
    expect(choices()[0]!.getAttribute("aria-label")).toBe("SQLite. A file in the project");
    expect(choices()[0]!.getAttribute("title")).toBe("A file in the project");
    // M114 review: with three choices or fewer, each one's own words show under its label, not only as a tooltip.
    expect(choices().map((b) => b.querySelector(".ta-about")?.textContent ?? null)).toEqual(["A file in the project", "A server"]);
    expect(choices()[0]!.querySelector(".ta-label")!.textContent).toBe("SQLite");
    await click(choices()[1]!);
    expect(sentAsks()).toEqual([]);
    expect(document.querySelector(".ta-card .ip-text b")!.textContent).toBe("Which pages need a sign in?");
    expect(document.querySelector(".ta-count")!.textContent).toBe(S.m114.of(2, 2));
    // M114 review (changed on purpose): the next question waits its own moment before a press counts.
    await wait(ARM_MS + 60);
    // Several allowed: pressed state, and Send waits for one.
    const send = button(S.m114.send);
    expect((send as HTMLButtonElement).disabled).toBe(true);
    await click(choices()[0]!);
    await click(choices()[2]!);
    expect(choices().map((b) => b.getAttribute("aria-pressed"))).toEqual(["true", "false", "true"]);
    await click(button(S.m114.send));
    expect(sentAsks()).toMatchObject([{ type: "toolask.answer", ask: "ta_a1b2c3d4e5f6", choice: "answer", picks: [[1], [0, 2]] }]);
  });
  test("Answer in Claude Code is there on a question too", async () => {
    await renderPage(<IslandPanel m={run([question], atRest())} line="" shown />);
    await wait(ARM_MS + 60);
    app.calls.length = 0;
    await click(document.querySelector("button.ta-intool")!);
    expect(sentAsks()).toMatchObject([{ choice: "tool" }]);
  });
});

// M114 review findings.
const qs = (question as unknown as { questions: Record<string, unknown>[] }).questions;
const twoSingle = { ...question, ask: "ta_bbbbbbbbbbbb", questions: [qs[0], { ...qs[1], multi: false }] };
const fourChoices = { ...question, ask: "ta_cccccccccccc", questions: [{ question: "Which host?", multi: false, options: [{ label: "Vercel", about: "Pushes on every commit" }, { label: "Netlify", about: "Forms built in" }, { label: "Fly", about: "Runs a server" }, { label: "Later" }] }] };
const choices = () => [...document.querySelectorAll(".ta-choices button")];

describe("M114 review: every question waits its own moment", () => {
  test("a quick second click right after question 1 never answers question 2; once armed it does", async () => {
    await renderPage(<IslandPanel m={run([twoSingle], atRest())} line="" shown />);
    await wait(ARM_MS + 60);
    app.calls.length = 0;
    await click(choices()[0]!);
    expect(document.querySelector(".ta-count")!.textContent).toBe(S.m114.of(2, 2));
    // The new question's choices are dimmed again, and a press within ARM_MS does nothing.
    expect(document.querySelector(".ta-card")!.getAttribute("data-armed")).toBeNull();
    await click(choices()[1]!);
    expect(sentAsks()).toEqual([]);
    expect(document.querySelector(".ta-count")!.textContent).toBe(S.m114.of(2, 2));
    await wait(ARM_MS + 60);
    expect(document.querySelector(".ta-card")!.getAttribute("data-armed")).toBe("yes");
    await click(choices()[1]!);
    expect(sentAsks()).toMatchObject([{ choice: "answer", picks: [[0], [1]] }]);
  });
  test("on a pick several question, a toggle or Send right after moving on does nothing", async () => {
    await renderPage(<IslandPanel m={run([question], atRest())} line="" shown />);
    await wait(ARM_MS + 60);
    await click(choices()[1]!);
    await click(choices()[0]!);
    expect(choices()[0]!.getAttribute("aria-pressed")).toBe("false");
  });
});

describe("M114 review: a picked choice reads as picked, not as focused", () => {
  test("a tick inside the chip and its name says picked; a choice not picked has neither", async () => {
    await renderPage(<IslandPanel m={run([question], atRest())} line="" shown />);
    await wait(ARM_MS + 60);
    await click(choices()[1]!);
    await wait(ARM_MS + 60);
    await click(choices()[0]!);
    expect(choices()[0]!.querySelector(".ta-tick svg")).toBeTruthy();
    expect(choices()[0]!.getAttribute("aria-label")).toBe(S.m114.picked("Settings"));
    expect(choices()[1]!.querySelector(".ta-tick")).toBeNull();
    expect(choices()[1]!.getAttribute("aria-label")).toBe("Billing");
  });
});

describe("M114 review: a choice's own words are seen without a tooltip", () => {
  test("more than three choices: one muted line under them says the pointed or focused choice's words", async () => {
    await renderPage(<IslandPanel m={run([fourChoices], atRest())} line="" shown />);
    await wait(ARM_MS + 60);
    const line = () => document.querySelector(".ta-card .ta-hint")!.textContent;
    expect(choices().some((b) => b.querySelector(".ta-about"))).toBe(false);
    expect(line()).toBe(S.m114.aboutHint);
    await act(async () => { fireEvent.pointerOver(choices()[1]!); });
    expect(line()).toBe("Forms built in");
    await act(async () => { fireEvent.pointerOut(choices()[1]!); fireEvent.focusIn(choices()[2]!); });
    expect(line()).toBe("Runs a server");
    // A choice with no words of its own says the hint again.
    await act(async () => { fireEvent.focusOut(choices()[2]!); fireEvent.focusIn(choices()[3]!); });
    expect(line()).toBe(S.m114.aboutHint);
  });
  test("no choice has words of its own: no line at all", async () => {
    await renderPage(<IslandPanel m={run([{ ...fourChoices, questions: [{ question: "Which?", multi: false, options: [{ label: "A" }, { label: "B" }, { label: "C" }, { label: "D" }] }] }], atRest())} line="" shown />);
    expect(document.querySelector(".ta-card .ta-hint")).toBeNull();
  });
});

describe("M114 review: a press takes the card away at once", () => {
  test("the panel tells the page the ask was pressed (ui.toolAskAnswered), and the notch wires it to its model", async () => {
    const pressed: string[] = [];
    await renderPage(<IslandPanel m={run([perm], atRest())} line="" shown onAsked={(a) => pressed.push(a)} />);
    await click(button(S.allow));
    expect(pressed).toEqual([]);
    await wait(ARM_MS + 60);
    await click(button(S.allow));
    expect(pressed).toEqual(["ta_0123456789ab"]);
    const island = readFileSync(new URL("../src/island.tsx", import.meta.url), "utf8");
    expect(island).toContain(`onAsked={(ask) => dispatch({ type: "ui.toolAskAnswered", ask })}`);
  });
});
