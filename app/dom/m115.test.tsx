// M115 (docs/milestones/M115-every-tool-and-jump.md), rendered: once the engine has seen where a session runs, the notch's
// card for that tool's ask offers Answer in iTerm (it hands the ask back and brings that tab forward in one press), and the
// live feed's working block offers Go to iTerm. Both send tool.jump, which names only the project and the tool. Your AI
// tools says what Squibby does with each tool, lists Claude Desktop through Claude Code, the watch tools with nothing
// written, and the open tag's line with Copy. Worst case words wrap or are cut with the whole name kept for VoiceOver.
import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { IslandPanel } from "../src/islandPanel.tsx";
import { initial, reduce, type Model } from "../src/model.ts";
import { S } from "../src/strings.ts";
import { ARM_MS } from "../src/islandPanel.ts";
import { AiToolsScreen } from "../src/aiToolsScreen.tsx";
import { PROJECT, act, app, ev, fireEvent, hasButton, press, renderPage, runner, screen } from "./render.tsx";

const fx = (id: string) => JSON.parse(readFileSync(new URL("../../protocol/fixtures/events.jsonl", import.meta.url), "utf8").split("\n").find((l) => l.includes(`"id":"${id}"`))!) as Record<string, unknown>;
const perm = { ...fx("m114e1"), project: PROJECT, expiresAt: "2999-01-01T00:00:00.000Z" };
const run = (events: Record<string, unknown>[], from: Model = initial()) => events.reduce<Model>((m, e) => reduce(m, ev(e) as never), from);
const atRest = () => run([{ type: "auth.status", method: "api_key", source: "keychain" }, { type: "ui.folderShown", project: PROJECT }]);
const where = (app_: string, tool = "claude") => ({ type: "tool.where", project: PROJECT, tool, app: app_, tab: true });
const feed = { type: "feed.update", sessions: [{ key: "3f9a0c21b7d4", project: PROJECT, tool: "claude", via: "hook", state: "working", items: [{ kind: "edit", path: "src/app.tsx", added: 12, removed: 3, n: 1 }] }] };
const wait = (ms: number) => act(async () => { await new Promise((r) => setTimeout(r, ms)); });
const click = async (el: Element) => { await act(async () => { fireEvent.click(el); await new Promise((r) => setTimeout(r, 10)); }); };

describe("Go to, from a card in the notch", () => {
  test("with no session seen, the card is as before: Answer in Claude Code only hands it back", async () => {
    await renderPage(<IslandPanel m={run([perm], atRest())} line="" shown />);
    const b = document.querySelector("button.ta-intool")!;
    expect(b.textContent).toBe(S.m114.inTool("Claude Code"));
    await wait(ARM_MS + 60);
    app.calls.length = 0;
    await click(b);
    expect(app.sentTypes()).toEqual(["toolask.answer"]);
  });
  test("with a session seen in iTerm: Answer in iTerm hands it back and goes there, in one press, once armed", async () => {
    await renderPage(<IslandPanel m={run([where("iTerm"), perm], atRest())} line="" shown />);
    const b = document.querySelector("button.ta-intool")!;
    expect(b.textContent).toBe(S.m115.answerIn("iTerm"));
    expect(b.getAttribute("aria-label")).toBe(S.m115.answerInSay("Claude Code", "iTerm"));
    app.calls.length = 0;
    await click(b);
    expect(app.sent()).toEqual([]);
    await wait(ARM_MS + 60);
    await click(b);
    expect(app.sent()).toMatchObject([{ type: "toolask.answer", choice: "tool" }, { type: "tool.jump", project: PROJECT, tool: "claude" }]);
    expect(Object.keys(app.sent()[1]!).sort()).toEqual(["id", "project", "tool", "type", "v"]);
    expect(app.invoked("island_go")).toEqual([]);
  });
});

describe("Go to, from the live feed", () => {
  test("a working block of a session seen offers Go to, named for VoiceOver, and sends only tool.jump", async () => {
    await renderPage(<IslandPanel m={run([where("Visual Studio Code - Insiders"), feed], atRest())} line="" shown />);
    const go = document.querySelector("button.lf-go")!;
    expect(go.textContent).toBe(S.m115.goTo("Visual Studio Code - Insiders"));
    expect(go.getAttribute("aria-label")).toBe(S.m115.goToSay("Claude Code", "Visual Studio Code - Insiders"));
    app.calls.length = 0;
    await click(go);
    expect(app.sent()).toMatchObject([{ type: "tool.jump", project: PROJECT, tool: "claude" }]);
    expect(app.invoked("island_go")).toEqual([]);
  });
  test("no Go to before a session is seen, or once it finished", async () => {
    await renderPage(<IslandPanel m={run([feed], atRest())} line="" shown />);
    expect(document.querySelector("button.lf-go")).toBeNull();
  });
});

describe("Your AI tools", () => {
  const rows = [
    { tool: "opencode", hook: "done", on: false, file: ".opencode/plugins/companion.js", adds: "// companion-done-signal", creates: true },
    { tool: "zed", hook: "watch", on: false, file: "", adds: "", creates: false },
    ...["done", "guard", "waiting", "feed", "approve", "answer"].map((h) => ({ tool: "claude", hook: h, on: false, file: ".claude/settings.local.json", adds: `{"${h}":1}`, creates: true })),
  ];
  test("each tool says what it does; Claude Desktop is through Claude Code; a watch tool writes nothing", async () => {
    await renderPage(<AiToolsScreen project={PROJECT} />, { answers: { ai_tools_find: { apps: ["com.anthropic.claudefordesktop", "dev.zed.Zed"], programs: ["opencode", "claude"], folders: [] } } });
    await runner({ type: "donesignal.state", project: PROJECT, tools: rows });
    expect(screen.getByText(S.m115.supports.done)).toBeTruthy();
    expect(screen.getByText(S.m115.supports.watch)).toBeTruthy();
    expect(screen.getByText(S.m115.viaLine("Claude Desktop", "Claude Code"))).toBeTruthy();
    expect(hasButton(S.m115.viaConnectLabel("Claude Desktop", "Claude Code"))).toBe(true);
    await press("Connect Zed");
    expect(screen.getByText(`${S.m82.partLabel.watch("Zed")}. ${S.m115.watchWhere}`)).toBeTruthy();
    expect(document.querySelector(".ai-connect-ask .ask-what")).toBeNull();
    await press(S.m82.yes);
    expect(app.sent().filter((c) => c.type === "donesignal.add")).toMatchObject([{ tool: "zed", hook: "watch", confirm: true }]);
  });
  test("Any other tool: its line is asked only when opened, shown whole, and copied on a press", async () => {
    await renderPage(<AiToolsScreen project={PROJECT} />, { answers: { ai_tools_find: { apps: [], programs: [], folders: [] }, copy_text: null } });
    await runner({ type: "donesignal.state", project: PROJECT, tools: rows });
    expect(app.sentTypes()).not.toContain("donesignal.anyLine");
    await press(S.m115.anyTitle);
    expect(app.sentTypes()).toContain("donesignal.anyLine");
    const line = fx("m115e5").line as string;
    await runner({ ...fx("m115e5"), project: PROJECT });
    expect(screen.getByText(line)).toBeTruthy();
    await press(S.m115.anyCopy);
    expect(app.invoked("copy_text").map((c) => c.args?.text)).toEqual([line]);
    expect(screen.getByText(S.m115.anyCopied)).toBeTruthy();
  });
});

describe("M115 review", () => {
  const jumped = (why: "failed" | "unknown", tool = "claude") => ({ type: "tool.jumped", project: PROJECT, tool, ok: false, why });
  test("a Go to that did not go says so under that tool's feed block, as a status line, and then goes", async () => {
    await renderPage(<IslandPanel m={run([where("iTerm"), feed, jumped("failed")], atRest())} line="" shown />);
    const line = screen.getByText(S.m115.jumpFailed("Claude Code"));
    expect(line.getAttribute("role")).toBe("status");
    expect(line.closest(".lf-block")).toBeTruthy();
    await wait(5100);
    expect(screen.queryByText(S.m115.jumpFailed("Claude Code"))).toBeNull();
  }, 9000);
  test("with no feed block for it (Answer in the tool from a card), the line shows in the panel", async () => {
    await renderPage(<IslandPanel m={run([perm, jumped("unknown")], atRest())} line="" shown />);
    const line = screen.getByText(S.m115.jumpUnknown("Claude Code"));
    expect(line.getAttribute("role")).toBe("status");
  });
  test("a tool that is an app of its own gets Go to before any session was seen; it sends only tool.jump", async () => {
    const zed = { type: "feed.update", sessions: [{ key: "5b2c7d9e1f30", project: PROJECT, tool: "zed", via: "folder", state: "working", items: [{ kind: "edit", path: "src/app.tsx", n: 1 }] }] };
    await renderPage(<IslandPanel m={run([zed], atRest())} line="" shown />);
    const go = document.querySelector("button.lf-go")!;
    expect(go.textContent).toBe(S.m115.goTo("Zed"));
    expect(go.getAttribute("aria-label")).toBe(S.m115.goToOpenSay("Zed"));
    app.calls.length = 0;
    await click(go);
    expect(app.sent()).toMatchObject([{ type: "tool.jump", project: PROJECT, tool: "zed" }]);
  });
  test("the feed head reads as a state, then a button: a separator VoiceOver does not hear sits between them", async () => {
    await renderPage(<IslandPanel m={run([where("iTerm"), feed], atRest())} line="" shown />);
    const head = document.querySelector(".lf-head")!;
    const sep = head.querySelector(".lf-sep")!;
    expect(sep.textContent).toBe(S.m115.goSep);
    expect(sep.getAttribute("aria-hidden")).toBe("true");
    expect(sep.previousElementSibling?.className).toBe("lf-state");
    expect(sep.nextElementSibling?.className).toBe("lf-go");
  });
  test("Claude Desktop found without Claude Code: its Connect card's Cancel puts the keyboard back on its own button", async () => {
    const off = ["done", "guard", "waiting", "feed", "approve", "answer"].map((h) => ({ tool: "claude", hook: h, on: false, file: ".claude/settings.local.json", adds: `{"${h}":1}`, creates: true }));
    await renderPage(<AiToolsScreen project={PROJECT} />, { answers: { ai_tools_find: { apps: ["com.anthropic.claudefordesktop"], programs: [], folders: [] } } });
    await runner({ type: "donesignal.state", project: PROJECT, tools: off });
    expect(hasButton(S.m82.connectLabel("Claude Code"))).toBe(false);
    const via = screen.getByRole("button", { name: S.m115.viaConnectLabel("Claude Desktop", "Claude Code") });
    // The card's way back (ConfirmStep back, focus.ts) is the id ai-connect-claude: with no Claude Code row, it is this one.
    expect(document.getElementById("ai-connect-claude")).toBe(via);
    await press(S.m115.viaConnectLabel("Claude Desktop", "Claude Code"));
    expect(document.querySelector(".ai-connect-ask")).toBeTruthy();
    await press(S.m82.no);
    expect(document.getElementById("ai-connect-claude")).toBe(screen.getByRole("button", { name: S.m115.viaConnectLabel("Claude Desktop", "Claude Code") }));
  });
  test("with reviews on, a watch row says nothing more", async () => {
    const rows = [{ tool: "zed", hook: "watch", on: true, file: "", adds: "", creates: false }];
    await renderPage(<AiToolsScreen project={PROJECT} />, { settings: { "review.mode": "ask" }, answers: { ai_tools_find: { apps: ["dev.zed.Zed"], programs: [], folders: [] } } });
    await runner({ type: "donesignal.state", project: PROJECT, tools: rows });
    expect(screen.queryAllByText((t) => t.includes(S.m115.watchOff.reviews))).toEqual([]);
    expect(screen.queryAllByText((t) => t.includes(S.m115.watchOff.flow))).toEqual([]);
  });
});
