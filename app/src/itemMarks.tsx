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

/** An item's badge, in sentence case. `spoken`: it is the only place its words show (Learn and History, where it stands for
 *  the plain state, which is hidden while badges are on); elsewhere the row already says it, so VoiceOver skips it. */
export function Stamp({ kind, spoken }: { kind: StampKind; spoken?: boolean }) {
  return <span className="stamp" data-stamp={kind} aria-hidden={spoken ? undefined : "true"}>{S.look.stamp[kind]}</span>;
}
