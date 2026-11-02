// The parts (ui/parts.tsx), read as text because the pages need a real Mac to run: their words come from strings.ts, a
// verdict is only ever read (M45), the one main button is primary, a menu is never a plain select, a stepper's minus is
// the minus sign, a toast waits under the pointer, a sheet keeps unsaved work, and nothing takes the keyboard unasked.
import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { S } from "../strings.ts";
import { TOAST_MS, btnClass } from "./parts.tsx";

const src = readFileSync(new URL("./parts.tsx", import.meta.url), "utf8");
const part = (name: string) => src.slice(src.indexOf(`export function ${name}`), src.indexOf("\n}\n", src.indexOf(`export function ${name}`)));

describe("the parts", () => {
  test("every word a person reads comes from strings.ts: no words written between tags", () => {
    // Bun's own TSX transpiler turns the words between tags into children strings; none of them may hold a letter.
    const js = new Bun.Transpiler({ loader: "tsx" }).transformSync(src);
    const kids = [...js.matchAll(/children: "((?:[^"\\]|\\.)*)"/g)].map((m) => m[1]);
    expect(kids.length).toBeGreaterThan(0);
    for (const k of kids) expect(/[A-Za-z]/.test(k), k).toBe(false);
    expect(Object.keys(S.ui).length).toBeGreaterThan(15);
  });
  test("a button is secondary unless it says otherwise, and the class names match the parts' CSS", () => {
    expect(btnClass()).toBe("btn secondary");
    expect(btnClass("primary", "lg")).toBe("btn primary lg");
    expect(btnClass("icon", "md", "close")).toBe("btn icon close");
    expect(part("Button(")).toContain('kind = "secondary"');
    // The parts themselves have one main button: a sheet's Save, or Done for a sheet whose changes apply at once.
    expect(src.match(/kind="primary"/g)?.length).toBe(2);
    expect(part("Sheet(")).toContain('instant ? <Button kind="primary" onClick={onClose}>{S.ui.done}</Button> : <Button kind="primary" disabled={!dirty} onClick={onSave}>');
  });
  test("a switch is a switch to VoiceOver; a choice of two or three is a radio group; four or more is a menu, never a select", () => {
    expect(part("Switch(")).toContain('role="switch" className="ui-switch" aria-checked={checked}');
    expect(part("Segmented<")).toContain('role="radiogroup"');
    const menu = part("Menu<");
    expect(menu).toContain('aria-haspopup="listbox"');
    expect(menu).toContain('role="listbox"');
    expect(menu).toContain('role="option"');
    expect(src).not.toContain("<select");
    // Escape closes the open list without closing Home under it.
    expect(menu).toContain('if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); close(); return; }');
  });
  test("a stepper's minus is the minus sign, each button names what it changes, and a typed value is kept on Return or leaving", () => {
    const st = part("Stepper(");
    expect(st).toContain('{"\u2212"}');   // U+2212, the minus sign, not a hyphen
    expect(st).not.toMatch(/>-</);
    expect(st).toContain("aria-label={S.ui.stepLess(label)}");
    expect(st).toContain("aria-label={S.ui.stepMore(label)}");
    expect(st).toContain('if (e.key === "Enter") { e.preventDefault(); keep(commitText(text, r)); }');
    expect(st).toContain("onBlur={() => { if (editing.current) keep(commitText(text, r)); }}");
    expect(S.ui.setToMax("10")).toBe("Set to 10, the most it can be.");
  });
  test("a verdict is only read: the Verdict line and a Recent row never decide a result (M45)", () => {
    expect(src).not.toContain("verdictOf(");
    expect(part("VerdictLine(")).toContain("verdictMark(verdict)");
    expect(part("VerdictLine(")).toContain("{verdict.headline}");
    expect(part("RecentRow(")).toContain("verdictMark(verdict)");
  });
  test("a key label shows the Mac's caps and reads the words", () => {
    expect(part("KeyLabel(")).toContain("keycaps(chord)");
    expect(part("KeyLabel(")).toContain("aria-label={label ? `${label}: ${chordLabel(chord!)}` : chordLabel(chord!)}");
  });
  test("a toast stays ten seconds and waits while the pointer is on it", () => {
    expect(TOAST_MS).toBe(10_000);
    expect(part("Toast(")).toContain("onPointerEnter={hold} onPointerLeave={run}");
    expect(part("Toast(")).toContain('role="status"');
  });
  test("a sheet keeps unsaved work: closing it asks Keep editing or Discard changes", () => {
    const sh = part("Sheet(");
    expect(sh).toContain("const leave = () => { if (dirty && !instant) setAsking(true); else onClose(); };");
    expect(sh).toContain("{S.ui.keepEditing}");
    expect(sh).toContain("{S.ui.discardChanges}");
    expect(sh).toContain('role="dialog" aria-modal="true"');
  });
  test("a sheet keeps Tab inside itself: it wraps at both ends instead of reaching the covered page", () => {
    const sh = part("Sheet(");
    expect(sh).toContain('e.key === "Tab"');
    expect(sh).toContain("tabWrap(");
  });
  test("nothing takes the keyboard on its own (rule 9): only a menu the person opened and a sheet the person opened", () => {
    const focusCalls = [...src.matchAll(/\.focus\(\)/g)].length;
    // Segmented and Picture choice move it within themselves on an arrow; Menu on open and on close; Sheet on open and when Tab wraps round inside it.
    expect(focusCalls).toBeLessThanOrEqual(6);
    expect(part("Menu<")).toContain("if (!open || !list.current || !btn.current) return;");
    expect(src).not.toMatch(/autoFocus/);
  });
});
