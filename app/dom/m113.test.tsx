// M113, the live feed in the notch (docs/milestones/M113-live-feed.md), rendered: pointing at the notch shows, under the
// usual row, what the person's own AI tool is editing and running; a press opens the review in Home; the counts are said in
// words; it steps aside for a question; the setting turns it off; the small chat shows it at the top.
import { describe, expect, test } from "bun:test";
import { IslandPanel } from "../src/islandPanel.tsx";
import { initial, reduce, type Model } from "../src/model.ts";
import { S } from "../src/strings.ts";
import { REVIEW_ID } from "../src/reviewCard.tsx";
import { AiToolsScreen } from "../src/aiToolsScreen.tsx";
import { PROJECT, act, app, emit, ev, fireEvent, hasButton, press, renderHome, renderPage, runner, screen } from "./render.tsx";

const batch = { type: "review.batch", project: PROJECT, batch: "rv_6c4d1e23f0", files: [{ file: "src/app.tsx", kind: "modified" }], count: 1, capped: false, secretFiles: [], auto: false };
const run = (events: Record<string, unknown>[], from: Model = initial()) => events.reduce<Model>((m, e) => reduce(m, ev(e) as never), from);
const atRest = () => run([{ type: "auth.status", method: "api_key", source: "keychain" }, { type: "ui.folderShown", project: PROJECT }]);
const feed = { type: "feed.update", sessions: [
  { key: "3f9a0c21b7d4", project: PROJECT, tool: "claude", via: "hook", state: "working", items: [{ kind: "edit", path: "src/app.tsx", added: 12, removed: 3, n: 2 }, { kind: "run", command: "npm test", n: 1 }] },
] };

describe("the hover panel", () => {
  test("lists the tool's edits and commands under the row, with the counts in words", async () => {
    await renderPage(<IslandPanel m={run([feed], atRest())} line="" shown />);
    const panel = document.querySelector(".island-panel")!;
    expect(panel.hasAttribute("data-feed")).toBe(true);
    const lf = panel.querySelector(".lf")!;
    expect(lf.getAttribute("aria-label")).toBe(S.m113.label);
    expect(lf.querySelector(".lf-head")?.textContent).toBe(`Claude Code in shop${S.m113.state.working}`);
    const rows = [...lf.querySelectorAll("button.lf-row")];
    expect(rows).toHaveLength(2);
    expect(rows[0]!.textContent).toBe("src/app.tsx+12−32×");
    expect(rows[0]!.getAttribute("aria-label")).toBe(`Edited src/app.tsx, 12 lines added, 3 lines taken away, 2 times. ${S.m113.open}`);
    expect(rows[1]!.getAttribute("data-kind")).toBe("run");
    expect(rows[1]!.getAttribute("aria-label")).toBe(`Ran npm test. ${S.m113.open}`);
    // The usual row is still there, first.
    expect(panel.firstElementChild?.classList.contains("nb-row")).toBe(true);
  });
  // M113 review: changed on purpose. A press opens Home only when there is something to open there (here, this work's
  // review waiting); while the tool still works the notch says when it comes instead (tests below).
  test("a press on a line opens Home for that session's work (its key only), and nothing else", async () => {
    await renderPage(<IslandPanel m={run([feed, batch], atRest())} line="" shown />);
    app.calls.length = 0;
    await act(async () => { fireEvent.click(document.querySelector("button.lf-row")!); await new Promise((r) => setTimeout(r, 20)); });
    // M113 review: the session's key goes with it, so Home shows this work's review or says when it comes.
    expect(app.invoked("island_go").map((c) => c.args)).toEqual([{ then: { do: "feed", key: "3f9a0c21b7d4" } }]);
    expect(app.sent()).toEqual([]);
  });
  test("it steps aside while a question waits, so the question keeps the room", async () => {
    const asked = run([feed, { type: "approval.request", approval: "ap_1", agent: "builder-1", checkpoint: "cp_1", toolUseId: "t", risk: "network", title: "curl reaches the internet", expiresAt: "2999-01-01T00:00:00Z" }], atRest());
    expect(asked.approvals).toHaveLength(1);
    await renderPage(<IslandPanel m={asked} line="" shown />);
    expect(document.querySelector(".ip-ask")).toBeTruthy();
    expect(document.querySelector(".lf")).toBeNull();
  });
  test("with nothing to say, the panel is exactly the row it was", async () => {
    await renderPage(<IslandPanel m={atRest()} line="" shown />);
    expect(document.querySelector(".lf")).toBeNull();
    expect(document.querySelector(".island-panel")!.hasAttribute("data-feed")).toBe(false);
  });
  test("Stop everything empties it at once", async () => {
    const stopped = reduce(run([feed], atRest()), { type: "app.stop_everything" } as never);
    await renderPage(<IslandPanel m={stopped} line="" shown />);
    expect(document.querySelector(".lf")).toBeNull();
  });
});

describe("Home", () => {
  // M113 review: changed on purpose. The review is waiting here, so the press opens it; with none yet, the chat says when
  // it comes (below).
  test("the small chat shows the feed above its thread, and a press opens the review", async () => {
    await renderHome();
    await runner(feed, batch);
    await emit("opened", { keyboard: false, instant: false, chat: true });
    const chat = document.querySelector(".notch-chat")!;
    const lf = chat.querySelector(".lf")!;
    expect(lf).toBeTruthy();
    expect(lf.getAttribute("data-where")).toBe("chat");
    // Above the thread, under the top row.
    expect(lf.nextElementSibling?.classList.contains("nc-news")).toBe(true);
    expect([...lf.querySelectorAll("button.lf-row")].map((b) => b.getAttribute("title"))).toEqual(["Edited src/app.tsx, 12 lines added, 3 lines taken away, 2 times", "Ran npm test"]);
    await act(async () => { fireEvent.click(lf.querySelector("button.lf-row")!); await new Promise((r) => setTimeout(r, 60)); });
    expect(document.querySelector("main.home")!.hasAttribute("data-chat")).toBe(false);
    expect(S.set["notch.liveFeed"].label).toBe("Show what your AI tools are doing");
  });
});

// M113 review (Compared with the best): the press lands on this work's review, never an older one.
const notices = () => [...document.querySelectorAll(".notice")].map((n) => n.textContent);
describe("a press from the notch, arriving in Home", () => {
  test("while the tool still works and no review of it is in: Home says when it comes", async () => {
    await renderHome();
    await runner(feed);
    await emit("opened", { keyboard: false, instant: false, then: { do: "feed", key: "3f9a0c21b7d4" } });
    expect(notices()).toContain(S.m113.later("Claude Code"));
  });
  test("a line from another project says where its changes are", async () => {
    await renderHome();
    await runner({ type: "feed.update", sessions: [{ ...feed.sessions[0], key: "aaaaaaaaaaaa", project: "/Users/me/site", tool: "codex" }] });
    await emit("opened", { keyboard: false, instant: false, then: { do: "feed", key: "aaaaaaaaaaaa" } });
    // M113 review: changed on purpose; the line now carries its Open site button.
    expect(notices().some((n) => n?.startsWith(S.m113.elsewhere("site")))).toBe(true);
  });
  test("with this work's review waiting, Home shows it and says nothing more", async () => {
    await renderHome();
    await runner(feed, { type: "review.batch", project: PROJECT, batch: "rv_6c4d1e23f0", files: [{ file: "src/app.tsx", kind: "modified" }], count: 1, capped: false, secretFiles: [], auto: false });
    await emit("opened", { keyboard: false, instant: false, then: { do: "feed", key: "3f9a0c21b7d4" } });
    expect(notices().some((n) => n === S.m113.later("Claude Code"))).toBe(false);
    expect(document.getElementById(REVIEW_ID)).toBeTruthy();
  });
});

// M113 review: a press with nothing to open yet keeps the person in the notch, with a short line under the block pressed.
describe("a press with nothing to open yet stays in the notch", () => {
  const said = () => [...document.querySelectorAll(".lf-said")].map((n) => n.textContent);
  test("while the tool still works: the line says when the review comes, and Home stays shut", async () => {
    await renderPage(<IslandPanel m={run([feed], atRest())} line="" shown />);
    app.calls.length = 0;
    await act(async () => { fireEvent.click(document.querySelector("button.lf-row")!); await new Promise((r) => setTimeout(r, 20)); });
    expect(app.invoked("island_go")).toEqual([]);
    expect(said()).toEqual([S.m113.laterHere("Claude Code")]);
    const line = document.querySelector(".lf-said")!;
    expect(line.getAttribute("role")).toBe("status");
    // Under the block it belongs to.
    expect(line.closest(".lf-block")).toBeTruthy();
    expect(app.sent()).toEqual([]);
  });
  test("a finished line with no review in yet says it starts in a moment, never still working", async () => {
    const done = { type: "feed.update", sessions: [{ ...feed.sessions[0], state: "done" }] };
    await renderPage(<IslandPanel m={run([done], atRest())} line="" shown />);
    await act(async () => { fireEvent.click(document.querySelector("button.lf-row")!); await new Promise((r) => setTimeout(r, 20)); });
    expect(app.invoked("island_go")).toEqual([]);
    expect(said()).toEqual([S.m113.settling("Claude Code")]);
  });
  test("the small chat does the same, and stays open", async () => {
    await renderHome();
    await runner(feed);
    await emit("opened", { keyboard: false, instant: false, chat: true });
    const chat = document.querySelector(".notch-chat")!;
    await act(async () => { fireEvent.click(chat.querySelector("button.lf-row")!); await new Promise((r) => setTimeout(r, 60)); });
    expect(document.querySelector("main.home")!.hasAttribute("data-chat")).toBe(true);
    expect([...chat.querySelectorAll(".lf-said")].map((n) => n.textContent)).toEqual([S.m113.laterHere("Claude Code")]);
  });
});

describe("a press arriving in Home, the M113 review's cases", () => {
  test("a finished line with no review in yet: Home says the review starts in a moment", async () => {
    await renderHome();
    await runner({ type: "feed.update", sessions: [{ ...feed.sessions[0], state: "done" }] });
    await emit("opened", { keyboard: false, instant: false, then: { do: "feed", key: "3f9a0c21b7d4" } });
    expect(notices()).toContain(S.m113.settling("Claude Code"));
    expect(notices()).not.toContain(S.m113.later("Claude Code"));
  });
  test("the work's session went before Home opened: a plain line, never an older review", async () => {
    const scrolled: string[] = [];
    const was = Element.prototype.scrollIntoView;
    Element.prototype.scrollIntoView = function (this: Element) { scrolled.push(this.id); };
    try {
      await renderHome();
      // An older review is there, and the feed no longer has the pressed session.
      await runner(batch);
      await act(async () => { await new Promise((r) => setTimeout(r, 30)); });
      // Only what the press does counts: Home opening by itself may bring a waiting review into view, so it opens first.
      await emit("opened", { keyboard: false, instant: false });
      await act(async () => { await new Promise((r) => setTimeout(r, 30)); });
      scrolled.length = 0;
      await emit("opened", { keyboard: false, instant: false, then: { do: "feed", key: "0c0c0c0c0c0c" } });
      await act(async () => { await new Promise((r) => setTimeout(r, 30)); });
      expect(notices()).toContain(S.m113.gone(true));
      expect(scrolled).not.toContain(REVIEW_ID);
    } finally { Element.prototype.scrollIntoView = was; }
  });
  test("a line from another project: one button opens that project, then the press is read again there", async () => {
    await renderHome();
    await runner({ type: "feed.update", sessions: [{ ...feed.sessions[0], key: "aaaaaaaaaaaa", project: "/Users/me/site", tool: "codex" }] });
    await emit("opened", { keyboard: false, instant: false, then: { do: "feed", key: "aaaaaaaaaaaa" } });
    expect(notices().some((n) => n?.startsWith(S.m113.elsewhere("site")))).toBe(true);
    expect(hasButton(S.m113.openProject("site"))).toBe(true);
    app.calls.length = 0;
    await press(S.m113.openProject("site"));
    expect(app.invoked("use_project").map((c) => c.args)).toEqual([{ path: "/Users/me/site" }]);
    // The shell says the project changed; the same press is read again in site: Codex still works there.
    await emit("project-changed", "/Users/me/site");
    await act(async () => { await new Promise((r) => setTimeout(r, 30)); });
    expect(notices()).toContain(S.m113.later("Codex"));
    expect(hasButton(S.m113.openProject("site"))).toBe(false);
  });
});

// M113 review: a tool connected before M113 has its feed off, and Your AI tools offers it right on the tool's row.
describe("Your AI tools offers the live feed to a tool connected before", () => {
  const row = (hook: string, on: boolean) => ({ tool: "claude", hook, on, file: ".claude/settings.local.json", adds: `{ "claude-${hook}": true }`, creates: false });
  const state = (feedOn: boolean) => ({ type: "donesignal.state", project: PROJECT, tools: [row("done", true), row("guard", true), row("waiting", true), row("start", false), row("feed", feedOn)] });
  test("Show edits live opens the feed's own card, and only its yes adds the feed", async () => {
    await renderPage(<AiToolsScreen project={PROJECT} />, { answers: { ai_tools_find: { apps: [], programs: ["claude"], folders: [] } } });
    await runner(state(false));
    expect(hasButton("Disconnect Claude Code")).toBe(true);
    expect(hasButton(S.m113.showLiveLabel("Claude Code"))).toBe(true);
    await press(S.m113.showLiveLabel("Claude Code"));
    expect(screen.getByText(S.m113.askTitle("Claude Code"))).toBeTruthy();
    expect(screen.getByText('{ "claude-feed": true }')).toBeTruthy();
    expect(app.sent().filter((c) => c.type === "donesignal.add")).toEqual([]);
    await press(S.doneSignal.yes);
    expect(app.sent().filter((c) => c.type === "donesignal.add").map((c) => [c.tool, c.hook, c.confirm, c.project])).toEqual([["claude", "feed", true, PROJECT]]);
    expect(screen.getByText(S.m113.liveSaid("Claude Code"))).toBeTruthy();
  });
  test("a long tool or project name never pushes the button off the row", async () => {
    // The row keeps its button whatever the words are; the words wrap (break-ui, below in the shots).
    await renderPage(<AiToolsScreen project={PROJECT} />, { answers: { ai_tools_find: { apps: [], programs: ["claude"], folders: [] } } });
    await runner(state(false));
    const btn = screen.getByRole("button", { name: S.m113.showLiveLabel("Claude Code") });
    expect(btn.textContent).toBe(S.m113.showLive);
  });
  test("with the feed on, the row says so and offers no button for it", async () => {
    await renderPage(<AiToolsScreen project={PROJECT} />, { answers: { ai_tools_find: { apps: [], programs: ["claude"], folders: [] } } });
    await runner(state(true));
    expect(hasButton(S.m113.showLiveLabel("Claude Code"))).toBe(false);
    expect(screen.getByText(new RegExp(S.m113.liveOn))).toBeTruthy();
  });
});
