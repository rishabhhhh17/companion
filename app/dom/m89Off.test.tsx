// M89 with its switches off (a file of its own: the settings are read once per page): Install updates while away off means
// the shell's quiet moment installs nothing, and Show how much of the Claude limit is used off means no ring in the notch.
import { describe, expect, test } from "bun:test";
import { IslandPanel } from "../src/islandPanel.tsx";
import { initial, reduce, type Model } from "../src/model.ts";
import { _resetForTests, startSettings } from "../src/settingsStore.ts";
import { PROJECT, act, app, emit, ev, renderHome, renderPage, screen, settle } from "./render.tsx";

/** The page reads its settings once as it loads (settingsStore.ts); read them again as a page opened with these off. */
const reread = async () => { await act(async () => { _resetForTests(); startSettings(); }); await settle(); };

const near = { type: "usage.runway", state: "near", source: "plan", usedPct: 91 };
const run = (events: Record<string, unknown>[], from: Model = initial()) => events.reduce<Model>((m, e) => reduce(m, ev(e) as never), from);

describe("M89 switched off", () => {
  test("updates.quiet off: the quiet moment installs nothing", async () => {
    app.reset();
    await renderHome({ settings: { "updates.quiet": false, "runway.mark": false } });
    await reread();
    await emit("update-quiet-ready", {});
    expect(app.invoked("install_update")).toEqual([]);
  });
  test("runway.mark off: no ring, even with a reading", async () => {
    app.reset();
    document.body.innerHTML = "";
    const r = await renderPage(<IslandPanel m={run([{ type: "auth.status", method: "api_key", source: "keychain" }, { type: "ui.folderShown", project: PROJECT }, near])} line="" shown />, { settings: { "updates.quiet": false, "runway.mark": false } });
    await reread();
    expect(r.container.querySelector(".island-panel")).not.toBeNull();
    expect(screen.queryByRole("img", { name: /Claude limit/ })).toBeNull();
  });
});
