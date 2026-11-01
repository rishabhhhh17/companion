// The control choice rule (the overhaul spec, 3.5): which part draws a setting, decided from the registry's data only, so
// every row of the same kind looks the same. ui/controlRule.test.ts runs it over every setting in protocol/settings.json.
import type { Def } from "../../../protocol/settings.ts";

export type Control = "switch" | "segmented" | "menu" | "pictures" | "stepper" | "field" | "editor";

/** Choices a person picks by looking (the water, how lively Flowflow is, and since M51's polish Home's layout, theme, main
 *  button and corners): picture cards, never a menu or words alone. */
export const VISUAL_CHOICES: readonly string[] = ["look.water", "character.lively", "look.layout", "look.theme", "look.gloss", "look.corners"];
/** A segmented control holds two or three options; four or more are a menu (Apple HIG: a pop up past 3 to 5). */
export const SEGMENTED_MAX = 3;

/** The part for a choice with this many options. One option is still a choice the person can see. */
export const choiceControl = (count: number): "segmented" | "menu" => (count <= SEGMENTED_MAX ? "segmented" : "menu");

/** The part a setting is drawn with. `count`: the options really offered now (a model row offers only those whose smoke
 *  test passed; check.start adds the project's own scripts), when it differs from the registry's list. */
export function controlFor(d: Pick<Def, "key" | "kind" | "options" | "optionsFrom">, count?: number): Control {
  switch (d.kind) {
    case "switch": return "switch";
    case "choice":
      if (VISUAL_CHOICES.includes(d.key)) return "pictures";
      // A choice that grows with the project (its own scripts) can always reach four, so it is a menu from the start.
      if (d.optionsFrom) return "menu";
      return choiceControl(count ?? d.options?.length ?? 0);
    case "number": return "stepper";
    case "text": return "field";
    // A list, or a setting with its own editor: a summary and "Edit", which opens a sheet (keys.hotkeys and talk.voice
    // have named editors).
    case "list": case "custom": return "editor";
  }
}
