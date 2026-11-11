// M59: Settings inside Home, rendered and clicked through: search finds a setting, its switch changes it through the shell
// (settings_set, never page storage), the row then says it is changed with the usual value, and Restore usual puts it back.
import { describe, expect, test } from "bun:test";
import { PROJECT, act, app, buttons, press, renderHome, screen, settle, type } from "./render.tsx";

const snapWith = (values: Record<string, unknown>) => ({ values, usual: {}, project: PROJECT, migrated: ["pageStorage.v1"], problems: [], changed: Object.keys(values) });
const labelOf = (el: Element) => document.getElementById(el.getAttribute("aria-labelledby") ?? "")?.textContent ?? el.getAttribute("aria-label") ?? "";
const pasteSwitch = () => screen.getAllByRole("switch").find((s) => labelOf(s) === "Offer Show me where to paste")!;

async function searchPaste() {
  await renderHome();
  await press("Settings");
  await type(screen.getByRole("searchbox", { name: "Search settings" }), "paste");
  await settle(60);
}

describe("Settings", () => {
  test("search finds the setting by a word it is known by, and only matching rows show", async () => {
    await searchPaste();
    expect(pasteSwitch()).toBeTruthy();
    expect(pasteSwitch().getAttribute("aria-checked")).toBe("true");
    // A setting with nothing to do with pasting is not in the results.
    expect(screen.queryAllByRole("switch").some((s) => labelOf(s) === "Close Home when I click another app")).toBe(false);
  });

  test("a switch changes the setting through the shell, and the row says it is changed and what the usual is", async () => {
    await searchPaste();
    app.answer("settings_set", (a: Record<string, unknown>) => snapWith({ [String(a.key)]: a.value }));
    await act(async () => { pasteSwitch().click(); await new Promise((r) => setTimeout(r, 80)); });
    expect(app.invoked("settings_set").map((c) => c.args)).toEqual([{ key: "paste.showWhere", value: false }]);
    expect(pasteSwitch().getAttribute("aria-checked")).toBe("false");
    expect(buttons()).toContain("Changed. Usual: On");
    // Settings never write page storage for a value (the shell keeps them, settings.json).
    expect(localStorage.getItem("paste.showWhere")).toBeNull();
  });

  test("Restore usual puts the usual value back through the shell", async () => {
    await searchPaste();
    app.answer("settings_set", (a: Record<string, unknown>) => snapWith({ [String(a.key)]: a.value }));
    app.answer("settings_reset", () => snapWith({}));
    await act(async () => { pasteSwitch().click(); await new Promise((r) => setTimeout(r, 80)); });
    await press("Changed. Usual: On");
    const item = screen.getByRole("menuitem", { name: "Restore usual" });
    await act(async () => { item.click(); await new Promise((r) => setTimeout(r, 80)); });
    const resets = app.invoked("settings_reset").map((c) => c.args);
    expect(resets.length).toBe(1);
    expect(resets[0]).toMatchObject({ key: "paste.showWhere" });
    expect(pasteSwitch().getAttribute("aria-checked")).toBe("true");
    expect(buttons()).not.toContain("Changed. Usual: On");
  });
});
