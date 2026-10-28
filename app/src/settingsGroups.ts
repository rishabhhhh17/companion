// The Settings side list in groups (M18): the parts of Settings under a few headings, the way Mac apps group theirs, so it
// reads as five places instead of twenty three. Every part has exactly one place; a part not listed here (a new section)
// still shows, under More, so nothing can go missing.
export type GroupId = "companion" | "powers" | "mac" | "account" | "more";
export const GROUP_ORDER: readonly GroupId[] = ["companion", "powers", "mac", "account", "more"];
const OF: Record<string, GroupId> = {
  home: "companion", look: "companion", talking: "companion", display: "companion",
  groups: "powers", pointing: "powers", files: "powers", checks: "powers", work: "powers", watch: "powers", memory: "powers",
  keys: "mac", otherApps: "mac", sharing: "mac", "fixed:permissions": "mac",
  "fixed:key": "account", "fixed:google": "account", spending: "account", updates: "account", numbers: "account",
  "fixed:practice": "more", "fixed:made": "more", "fixed:kept": "more", "fixed:acknowledgements": "more", "fixed:logs": "more",
};
export function groupOf(id: string): GroupId { return OF[id] ?? "more"; }
/** The parts that lead their group (the character's own section opens Settings), the rest in the registry's order. */
const FIRST = ["home", "look"];
/** The parts in their groups, each group in the order the parts came (the registry's order) with a leading part first,
 *  empty groups left out. */
export function groupPlaces<P extends { id: string }>(places: P[]): { group: GroupId; places: P[] }[] {
  const lead = (p: P) => (FIRST.includes(p.id) ? 0 : 1);
  return GROUP_ORDER.map((g) => ({ group: g, places: places.filter((p) => groupOf(p.id) === g).sort((a, b) => lead(a) - lead(b)) })).filter((x) => x.places.length > 0);
}
