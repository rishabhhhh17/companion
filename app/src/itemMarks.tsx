// The two small details of an item in a list (M51 step 3; the logic is itemLook.ts): its tile, a small square whose drawing
// and colour both say what kind of work it was, and its badge, a small upright outlined label (M51 polish: tilted stamps
// read as stickers). Both are drawn from tokens (ui/look.css, ui/tokens.css), so Settings' Icons and Stamps choices reach
// them with no code here.
import { Icon } from "./icons.tsx";
import { KIND_GLYPH, KIND_TINT, kindOf, type Kind, type Stamp as StampKind } from "./itemLook.ts";
import { S } from "./strings.ts";

/** An item's tile. Hidden from VoiceOver: the item's own words name it. `big`: the size in History and Learn. `kind`: a kind
 *  that is always right for the item (every practice is a stuck moment to fix), in place of one read from its words. */
export function ItemTile({ label, big, kind }: { label: string; big?: boolean; kind?: Kind }) {
  const k = kind ?? kindOf(label);
  return <span className={`tile${big ? " tile-lg" : ""}`} data-tint={KIND_TINT[k]} aria-hidden="true"><Icon name={KIND_GLYPH[k]} size={big ? 14 : 12} /></span>;
}

/** The small drawing inside a badge's dot in the side list, so its states are never told by colour alone (the audit,
 *  item 31): a turning ring at work, a small light for new, a tick for proven, ! for needs you. */
export const DOT_GLYPH = { working: "spin", new: "sparkle", proven: "tick", needsYou: "alert", notFixed: "cross" } as const;

/** An item's badge, in sentence case. `spoken`: it is the only place its words show (Learn and History, where it stands for
 *  the plain state, which is hidden while badges are on); elsewhere the row already says it, so VoiceOver skips it. `dot`:
 *  the badge's dot alone, with no words (the side list, where the row's tooltip and its spoken name carry them). */
export function Stamp({ kind, spoken, dot }: { kind: StampKind; spoken?: boolean; dot?: boolean }) {
  // Working is Flow at work, so its badge keeps the water's light in any room (a sunbeam badge would read as Needs you).
  return <span className="stamp" data-stamp={kind} data-dot={dot ? "" : undefined} data-element={kind === "working" ? "flow" : undefined} aria-hidden={spoken ? undefined : "true"}>{dot ? <Icon name={DOT_GLYPH[kind]} size={10} /> : S.look.stamp[kind]}</span>;
}
