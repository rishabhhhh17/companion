// M66 fix 14, "Settings may not open". Two halves.
// 1. Settings must draw whatever is kept: every page, every deep link, and every setting holding a bad value, never throw
//    (a throw shows the part's failure line in place of Settings, which reads as "Settings did not open").
// 2. Settings must get its room. Since Home grows out of the notch (M66), the page sizes Home's shape from its content's
//    height. Settings fills Home and scrolls inside it, so its measured height is only the shape's own height: measured
//    from Now it stayed at Now's height (a few hundred points), and the shell's hit test thought it was 640 tall. Settings
//    now asks for its one fixed height (island.rs SETTINGS_H), whatever it measures.
import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { SettingsView } from "./settingsPage.tsx";
import { SIDEBAR } from "./settingsPages.ts";
import { REGISTRY } from "../../protocol/settings.ts";
import { takeSnapshot } from "./settingsStore.ts";
import { S } from "./strings.ts";
import { SETTINGS_H, shapeAsk } from "./settingsFit.ts";
import { bodyHeight, type HomeGeom } from "./homeShape.ts";

const read = (p: string) => readFileSync(new URL(p, import.meta.url), "utf8");
const noop = () => {};
const draw = (place: string) => renderToStaticMarkup(createElement(SettingsView, { place, working: false, practiceBusy: false, project: "", spending: null, onClose: noop, onPracticeList: noop, onLesson: noop }));
// Wrong kinds, empty, huge, not a number: what a damaged or hand edited settings.json could hold.
const BAD: unknown[] = [null, "zz", 7, -1, true, [], {}, [1, "x"], { a: 1 }, 1e308, "", "x".repeat(5000)];

describe("Settings always draws", () => {
  test("every page draws with the usual values, and none shows the failure line", () => {
    for (const p of SIDEBAR) { const html = draw(p); expect(html).toContain("settings-frame"); expect(html).not.toContain(S.partFailed); }
  });
  for (const bad of BAD) test(`every page draws with every setting holding ${JSON.stringify(bad)?.slice(0, 12)}`, () => {
    const values: Record<string, unknown> = {};
    for (const d of REGISTRY.settings) values[d.key] = bad;
    takeSnapshot({ values, usual: {}, problems: [{ key: "no.such.key", code: "bad" }, { key: null, code: "damaged" }, { key: null, code: "unreadable" }] });
    for (const p of SIDEBAR) expect(draw(p)).toContain("settings-frame");
  });
  test("every deep link draws, and a place that names nothing opens the first page", () => {
    takeSnapshot({ values: {}, usual: {} });
    for (const d of REGISTRY.settings) expect(draw(d.key)).toContain("settings-frame");
    for (const odd of ["", "nope", "constructor", "toString", "__proto__", "more:", "more:toString", "account.", "a".repeat(400)]) expect(draw(odd)).toContain("settings-frame");
  });
});

// The tall Home on a notched 14 inch: 640 wide, 300 to 640 tall (island.rs STANDARD with Settings: Large width, 640).
const tall: HomeGeom = { kind: "notch", pw: 728, ph: 696, cx: 364, rest: { w: 185, h: 32 }, band: { w: 265, h: 32 }, body: { w: 680, minH: 300, maxH: 640, top: 32 } };
const wide: HomeGeom = { ...tall, body: { w: 688, minH: 480, maxH: 480, top: 32 } };

describe("Settings gets its room in Home's shape", () => {
  test("Settings asks for its one height, the same as the shell's", () => {
    const rs = readFileSync(new URL("../src-tauri/src/island.rs", import.meta.url), "utf8");
    expect(rs).toContain(`pub const SETTINGS_H: f64 = ${SETTINGS_H.toFixed(1)};`);
    expect(shapeAsk("settings", 350)).toBe(SETTINGS_H);
    expect(shapeAsk("settings", 0)).toBe(SETTINGS_H);
    expect(shapeAsk("settings", Number.NaN)).toBe(SETTINGS_H);
  });
  test("every other place asks for what it measures", () => {
    for (const t of ["now", "learn", "did", "memory"]) expect(shapeAsk(t, 412)).toBe(412);
  });
  test("opened from Now, Settings takes its full height at once, not Now's", () => {
    // Settings fills the shape, so what it measures is the shape's height: the old way kept whatever Now had.
    let h = bodyHeight(tall, 350);
    const measure = () => h;   // Settings' measured height is the body's
    const before = bodyHeight(tall, measure());
    expect(before).toBe(350);   // the loop that kept it small
    h = bodyHeight(tall, shapeAsk("settings", measure()));
    expect(h).toBe(640);
    expect(bodyHeight(tall, shapeAsk("settings", measure()))).toBe(640);   // and stays
    // Back on Now, the shape follows Now's own height again.
    expect(bodyHeight(tall, shapeAsk("now", 350))).toBe(350);
    // The wide Home has one height, Settings or not.
    expect(bodyHeight(wide, shapeAsk("settings", 300))).toBe(480);
  });
  test("Home tells its shape and the shell the same height, through shapeAsk, on a resize and on a change of place", () => {
    const card = read("./card.tsx");
    expect(card).toContain("homeStage.setContentH(shapeAsk(tabNow.current, el.offsetHeight))");
    expect(card).toContain('invoke("resize_card", { height: shapeAsk(tabNow.current, el.offsetHeight), settings: tabNow.current === "settings" })');
    expect(card).not.toContain("homeStage.setContentH(el.offsetHeight)");
    // The change of place tells both, not only the shell.
    expect(card).toMatch(/useEffect\(\(\) => \{ const el = inner\.current; if \(el\) tellHeight\(el\); \}, \[home\.tab\]\);/);
  });
});
