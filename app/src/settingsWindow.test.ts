// The Settings window (27 Oct 2026): Settings in its own normal Mac window (settingswin.rs). These read the page, the
// build and the shell's commands, since the window itself needs a real Mac to open.
import { describe, expect, test } from "bun:test";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join, normalize } from "node:path";

const here = dirname(new URL(import.meta.url).pathname);
const read = (p: string) => readFileSync(join(here, p), "utf8");
const main = read("../src-tauri/src/main.rs");
const fnBody = (name: string) => { const a = main.indexOf(`fn ${name}(`); return a < 0 ? "" : main.slice(a, main.indexOf("\n}\n", a)); };

/** Every shell command the page can call: its own and every module it imports, followed through the imports. */
function commandsFrom(entry: string): Map<string, string> {
  const seen = new Set<string>(), out = new Map<string, string>();
  const walk = (f: string) => {
    f = normalize(f);
    if (seen.has(f) || !existsSync(f) || !/\.tsx?$/.test(f)) return;
    seen.add(f);
    const s = readFileSync(f, "utf8");
    for (const m of s.matchAll(/(?:invoke|call)(?:<[^>]*>)?\("([a-z_]+)"/g)) out.set(m[1], f.split("/").pop()!);
    for (const m of s.matchAll(/from "(\.[^"]+)"/g)) walk(join(dirname(f), m[1]));
  };
  walk(join(here, entry));
  return out;
}

describe("the Settings window", () => {
  test("is its own page, built with the others", () => {
    expect(read("../settings.html")).toContain('src="/src/settingsWindow.tsx"');
    expect(read("../vite.config.ts")).toMatch(/settings: resolve\(__dirname, "settings\.html"\)/);
    expect(JSON.parse(read("../src-tauri/capabilities/default.json")).windows).toContain("settings");
  });
  test("shows the side list of Settings' sections, the open one marked, and one section at a time", () => {
    const page = read("./settingsWindow.tsx");
    expect(page).toContain("settingsPlaces()");
    expect(page).toContain('className="side-item" type="button" aria-current={p.id === open ? "page" : undefined}');
    expect(page).toContain("<SettingsPage place={open}");
    // The same rules as Settings in Home: the side list, its fill and bar, the groups, rows and switches.
    const css = read("./style.css");
    for (const r of ['.side-item[aria-current="page"] {', ".group {", ".setting {", '.setting button[role="switch"] {', ".settings-window {"]) expect(css, r).toContain(r);
    // It follows the Mac's light and dark through the same tokens, the text size and Less motion.
    expect(page).toContain("applyTextSize(textSize());");
    expect(page).toContain("followLessMotion();");
    expect(page).toContain("startSettings();");
    expect(page).not.toContain("migrateFromPageStorage");
  });
  test("every command the page can call is allowed from the Settings window", () => {
    const cmds = commandsFrom("./settingsWindow.tsx");
    expect(cmds.size).toBeGreaterThan(20);
    const handler = main.slice(main.indexOf("generate_handler!["), main.indexOf("]", main.indexOf("generate_handler![")));
    const refused: string[] = [];
    for (const [c, from] of cmds) {
      expect(handler, `${c} (${from}) is not a command`).toMatch(new RegExp(`[\\[ ,]${c}[,\\]]|[\\[ ,]${c}$`));
      const b = fnBody(c);
      expect(b, c).not.toBe("");
      // A command that checks the window must let the Settings window through (settings.rs card_or_settings).
      // settings_migrate is in the same store module, but only migrateFromPageStorage calls it, which only Home runs.
      if (c === "settings_migrate") continue;
      if (/window\.label\(\)/.test(b) && !/card_or_settings\(window\.label\(\)\)|keystore::remove_with\(window\.label\(\)|settingswin::may_close\(window\.label\(\)\)/.test(b)) refused.push(`${c} (${from})`);
    }
    expect(refused.join("; ")).toBe("");
    expect(read("../src-tauri/src/keystore.rs")).toContain('crate::settings::card_or_settings(window_label).is_ok() && confirm == REMOVE_PHRASE');
    expect([...cmds.keys()]).toContain("close_settings_window");
  });
  test("checks the shell did not widen for what the page does not use", () => {
    const cmds = commandsFrom("./settingsWindow.tsx");
    const widened = [...main.matchAll(/fn (\w+)\([^\n]*\n(?:[^\n]*\n){0,3}?[^\n]*card_or_settings\(window\.label\(\)\)/g)].map((m) => m[1]);
    expect(widened.length).toBeGreaterThan(10);
    for (const c of widened) expect(cmds.has(c), `${c} accepts the Settings window but the page never calls it`).toBe(true);
    // Moving the old page storage over stays Home's.
    expect(fnBody("settings_migrate")).toContain("settings::only_card(window.label())?");
  });
  test("Home and the island can open it, through one helper", () => {
    expect(read("./openSettings.ts")).toContain('invoke("open_settings_window")');
  });
});
