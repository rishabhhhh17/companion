// M88 (a): Your numbers turned off in Settings, Privacy (numbers.yours): no row in History, and nothing is asked for it. Its
// own file, since the page reads its settings once when it starts.
import { describe, expect, test } from "bun:test";
import { S } from "../src/strings.ts";
import { _resetForTests, startSettings } from "../src/settingsStore.ts";
import { PROJECT, act, app, press, renderHome, runner, screen, settle } from "./render.tsx";

describe("Your numbers, turned off", () => {
  test("no row, and opening History asks for no tools state on its behalf", async () => {
    app.reset();
    await renderHome({ settings: { "numbers.yours": false } });
    // The page reads its settings once as it loads (settingsStore.ts); read them again as a page opened with this one off.
    await act(async () => { _resetForTests(); startSettings(); });
    await settle();
    await press("History");
    await runner({ type: "tasks.list", project: PROJECT, tasks: [] });
    expect(screen.queryByRole("button", { name: S.m88.numbers.openLabel })).toBeNull();
    expect(screen.queryByRole("button", { name: S.m79.week.openLabel })).not.toBeNull();
  });
});
