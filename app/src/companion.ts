// The companion (M18): what the character is called, and who you can choose. Flowflow is the only character today; the
// places beside it are for the companions to come, one per group (F20), with no art until the founder supplies it.
import names from "../../protocol/names.json";
import type { SwitchedId } from "./groups.ts";

/** The character's name: the one chosen in Settings (character.name), or its own. */
export function characterName(v: unknown): string {
  const s = typeof v === "string" ? v.trim().slice(0, 24) : "";
  return s || names.character;
}

/** Who can be chosen. `ready`: has a character today. A place that is not ready is shown empty, saying it is coming. */
export type Companion = { id: string; group: SwitchedId; ready: boolean };
export const COMPANIONS: readonly Companion[] = [
  { id: "water", group: "flow", ready: true },
  { id: "guide", group: "guide", ready: false },
  { id: "voice", group: "voice", ready: false },
  { id: "files", group: "files", ready: false },
];
