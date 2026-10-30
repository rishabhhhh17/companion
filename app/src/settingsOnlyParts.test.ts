// Settings is built only from the parts (the overhaul spec, 3 and 7.2; the founder, 31 Oct: "does not look very planned"):
// no bare select, no bare text button, no tick box, no box of its own, and every choice through the control rule. And it
// is one Settings, inside Home (F28, T17): the separate window, its page and its commands are gone.
import { describe, expect, test } from "bun:test";
import { existsSync, readFileSync } from "node:fs";

const read = (p: string) => readFileSync(new URL(p, import.meta.url), "utf8");
const page = read("./settingsPage.tsx");
const js = new Bun.Transpiler({ loader: "tsx" }).transformSync(page);

describe("every Settings page renders only parts", () => {
  test("no bare select, button, input, text area or tick box: the parts draw every control", () => {
    for (const bare of ["<select", "<button", "<input", "<textarea", 'type="checkbox"', "<label className=\"check\""]) expect(page, bare).not.toContain(bare);
    // The JSX really calls the parts (the transpiled page names them).
    for (const part of ["Button", "Row", "Group", "Switch", "Segmented", "Menu", "Stepper", "Field", "PictureChoice", "Sheet", "SidebarItem", "Toast", "Disclosure", "KeyLabel", "ProofChip", "PageHead", "Card"]) {
      expect(js, part).toMatch(new RegExp(`jsx\\w*\\(${part},`));
    }
  });
  test("no button class written by hand, and no old row or line layout", () => {
    expect(page).not.toMatch(/className="btn|className=\{"btn|btnClass\(/);
    expect(page).not.toMatch(/className="(row|line|line muted|error|check|setting|group|panel settings)"/);
    expect(page).not.toMatch(/style=\{\{/);
  });
  test("every choice goes through the control rule, and long help sits behind Learn more", () => {
    const fn = (name: string) => page.slice(page.indexOf(`function ${name}`), page.indexOf("\n}\n", page.indexOf(`function ${name}`)));
    expect(fn("ChoiceControl(")).toContain("controlFor(d, options.length)");
    expect(fn("SettingRow(")).toContain("const under = controlFor(d) === \"pictures\";");
    expect(fn("SettingRow(")).toContain("more={moreWords(d.key)}>");
    // The Row part holds them behind a small info button beside the control, opened on a press.
    expect(read("./ui/parts.tsx")).toContain('{hasMore && <Button kind="icon" size="sm" label={S.ui.learnMore} describedBy={lid} expanded={showMore} controls={moreId}');
    // Lists and editors are a summary and Edit, which opens a sheet.
    for (const k of ["rules.house", "calls.apps", "ph.appAnswers"]) expect(fn("SettingRow("), k).toContain(`if (d.key === "${k}") {`);
    expect(fn("EditorRow(")).toContain("{S.setFrame.edit}</Button>");
  });
  test("one main button per screen: the danger zone has only danger buttons, and the Plan card at most one primary", () => {
    const danger = page.slice(page.indexOf("function DangerZone("), page.indexOf("\n}\n", page.indexOf("function DangerZone(")));
    expect(danger).not.toContain('kind="primary"');
    expect(danger.match(/kind="danger"/g)?.length).toBeGreaterThanOrEqual(5);
    // The danger zone's card has the red edge, its title stays quiet (parts.css), and two of its rows ask for words typed.
    expect(danger).toContain("<Group id=\"privacy.danger\" title={S.setGroupTitles[\"privacy.danger\"]} danger>");
    expect(read("./ui/parts.css")).toContain('.ui-group[data-tone="danger"] .ui-group-card { border-color: var(--bad-edge); }');
    expect(danger).toContain("typeBox(REMOVE_KEY_PHRASE)");
    expect(danger).toContain("typeBox(DELETE_PHRASE)");
  });
});

describe("one Settings, inside Home (F28, T17)", () => {
  test("the separate window, its page and its helpers are gone", () => {
    for (const f of ["../settings.html", "./settingsWindow.tsx", "./settingsGroups.ts", "./openSettings.ts", "../src-tauri/src/settingswin.rs"]) expect(existsSync(new URL(f, import.meta.url)), f).toBe(false);
    expect(read("../vite.config.ts")).not.toContain("settings.html");
    expect(JSON.parse(read("../src-tauri/capabilities/default.json")).windows).not.toContain("settings");
    const main = read("../src-tauri/src/main.rs");
    for (const c of ["open_settings_window", "close_settings_window", "card_or_settings"]) expect(main, c).not.toContain(c);
    expect(read("../../protocol/groups.json")).not.toContain("settings_window");
    for (const f of ["./card.tsx", "./island.tsx", "./islandPanel.tsx", "./homeHero.ts"]) expect(read(f), f).not.toContain("open_settings_window");
  });
  test("the gear, Command comma, the notch and the menu bar all open Home on Settings, at the last page viewed", () => {
    const card = read("./card.tsx");
    expect(card).toContain('const gear = () => pickTab("settings");');
    expect(card).toContain("const [setPlace, setSetPlace] = useState<string>(() => lastPage());");
    expect(card).toContain("<SettingsView place={setPlace} onPlace={setSetPlace}");
    expect(page).toContain("localStorage.setItem(LAST_PAGE, page)");
    expect(read("../src-tauri/src/main.rs")).toContain('"settings" => open_card_then(app, "menu", true, Some(arrival::menu_settings())),');
    // In Settings the top bar is Back, its name and Close: the place buttons (Settings among them) step back.
    expect(card).toContain('{home.tab !== "settings" && places.map((t) => {');
    expect(card).toContain('onClick={t === "settings" ? gear : () => pickTab(placeAfter(home.tab, t))}');
  });
  test("Command F searches, Esc clears the search first, Command [ goes back to Now, and the arrows move through the sidebar", () => {
    const view = page.slice(page.indexOf("export function SettingsView("));
    expect(view).toContain('if (e.key === "f") { e.preventDefault(); search.current?.focus(); }');
    expect(view).toContain('else if (e.key === "[") { e.preventDefault(); onClose(); }');
    expect(view).toContain('if (e.key === "Escape" && !e.nativeEvent.isComposing && q) { e.preventDefault(); e.stopPropagation(); setQ(""); }');
    expect(view).toContain('if (e.key !== "ArrowDown" && e.key !== "ArrowUp") return;');
    // Its keys are read only in Home's own window, while Settings shows (rule 8: never a global monitor).
    expect(view).toContain('window.addEventListener("keydown", onKey);');
    expect(view).toContain('return () => window.removeEventListener("keydown", onKey);');
  });
  test("Settings asks the shell for the Large width and one fixed height while it is open", () => {
    const card = read("./card.tsx");
    expect(card).toContain('settings: tabNow.current === "settings" });');
    expect(card).toContain('settings: home.tab === "settings" }); }, [home.tab]);');
  });
});
