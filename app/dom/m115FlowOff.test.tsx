// M115 review with Fix off (a file of its own: the settings are read once per page): a watch row says it shows nothing.
import { describe, expect, test } from "bun:test";
import { AiToolsScreen } from "../src/aiToolsScreen.tsx";
import { S } from "../src/strings.ts";
import { _resetForTests, startSettings } from "../src/settingsStore.ts";
import { PROJECT, act, renderPage, runner, screen, settle } from "./render.tsx";

const reread = async () => { await act(async () => { _resetForTests(); startSettings(); }); await settle(); };

describe("M115 review: a watch row with Fix off", () => {
  test("the row says it shows nothing while Fix is off; a tool with hooks says nothing more", async () => {
    const rows = [{ tool: "zed", hook: "watch", on: true, file: "", adds: "", creates: false }, ...["done", "guard", "waiting", "feed", "approve", "answer"].map((h) => ({ tool: "claude", hook: h, on: true, file: ".claude/settings.local.json", adds: "{}", creates: false }))];
    await renderPage(<AiToolsScreen project={PROJECT} />, { settings: { "flow.on": false }, answers: { ai_tools_find: { apps: ["dev.zed.Zed"], programs: ["claude"], folders: [] } } });
    await reread();
    await runner({ type: "donesignal.state", project: PROJECT, tools: rows });
    expect(screen.queryAllByText((t) => t.includes(S.m115.watchOff.flow)).length).toBe(1);
  });
});
