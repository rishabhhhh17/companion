// M115 review with reviews Off and with Fix off (a file of its own: the settings are read once per page). A watch tool
// (Zed, Junie, the JetBrains AI Assistant, Xcode) shows its changes only through the review's folder watch, which does not
// run then (runner/src/review/service.ts). Its row and its Connect card say so, with where to turn it back on.
import { describe, expect, test } from "bun:test";
import { AiToolsScreen } from "../src/aiToolsScreen.tsx";
import { S } from "../src/strings.ts";
import { _resetForTests, startSettings } from "../src/settingsStore.ts";
import { PROJECT, act, press, renderPage, runner, screen, settle } from "./render.tsx";

const reread = async () => { await act(async () => { _resetForTests(); startSettings(); }); await settle(); };
const rows = [{ tool: "zed", hook: "watch", on: false, file: "", adds: "", creates: false }];
const has = (line: string) => screen.queryAllByText((t) => t.includes(line)).length;

describe("M115 review: a watch row while its folder is not watched", () => {
  test("reviews Off: the row and its card say it shows nothing, and where to turn reviews on", async () => {
    await renderPage(<AiToolsScreen project={PROJECT} />, { settings: { "review.mode": "off" }, answers: { ai_tools_find: { apps: ["dev.zed.Zed"], programs: [], folders: [] } } });
    await reread();
    await runner({ type: "donesignal.state", project: PROJECT, tools: rows });
    expect(has(S.m115.watchOff.reviews)).toBe(1);
    await press("Connect Zed");
    expect(has(S.m115.watchOff.reviews)).toBe(2);
  });
});
