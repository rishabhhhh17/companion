// M113 with its switch off (a file of its own: the settings are read once per page): Show what your AI tools are doing off
// means the hover panel is exactly its row, with no feed under it.
import { describe, expect, test } from "bun:test";
import { IslandPanel } from "../src/islandPanel.tsx";
import { initial, reduce, type Model } from "../src/model.ts";
import { _resetForTests, startSettings } from "../src/settingsStore.ts";
import { PROJECT, act, ev, renderPage, settle } from "./render.tsx";

const reread = async () => { await act(async () => { _resetForTests(); startSettings(); }); await settle(); };
const run = (events: Record<string, unknown>[], from: Model = initial()) => events.reduce<Model>((m, e) => reduce(m, ev(e) as never), from);

describe("M113 switched off", () => {
  test("notch.liveFeed off: nothing shows, and the panel keeps its one row", async () => {
    const m = run([{ type: "auth.status", method: "api_key", source: "keychain" }, { type: "ui.folderShown", project: PROJECT },
      { type: "feed.update", sessions: [{ key: "3f9a0c21b7d4", project: PROJECT, tool: "claude", via: "hook", state: "working", items: [{ kind: "run", command: "npm test", n: 1 }] }] }]);
    expect(m.feed).toHaveLength(1);
    await renderPage(<IslandPanel m={m} line="" shown />, { settings: { "notch.liveFeed": false } });
    await reread();
    expect(document.querySelector(".lf")).toBeNull();
    expect(document.querySelector(".island-panel")!.hasAttribute("data-feed")).toBe(false);
  });
});
