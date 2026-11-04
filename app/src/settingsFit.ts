// Settings' room in Home's shape (M66 fix 14). Home grows out of the notch and the page sizes the shape from its content's
// height (homeShape.ts bodyHeight). Settings fills Home and its pages scroll inside it, so what it measures is only the
// shape's own height: left to that, Settings opened at whatever height the place before it had. It asks for its one fixed
// height instead, the same as the shell's (island.rs SETTINGS_H, with_settings), and the shape holds it between its least
// and its tallest. Every other place asks for what it measures.

/** Settings' one height in the tall Home (island.rs SETTINGS_H). The wide Home has one height for everything. */
export const SETTINGS_H = 640;

/** The height Home's shape (and the shell's hit test) is asked to take for the place open, from its measured height. */
export function shapeAsk(tab: string, measured: number): number {
  if (tab === "settings") return SETTINGS_H;
  return Number.isFinite(measured) ? measured : 0;
}
