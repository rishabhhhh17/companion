// M76 (roadmap 16): after Copy for my AI, Show me where to paste. The page only asks the shell to look (main.rs point_paste),
// on the person's press. The shell lights the indicator first, reads the front app's accessibility structure once, and rings
// the chat box: a solid ring only on a confirmed box, a dashed hint for a guess, words only otherwise (pastehere.rs). It never
// types, pastes or presses in that app; the person pastes. What the shell says comes back as app.showme, as Point at the
// problem's does.
import { invoke } from "./tauri.ts";

/** Asks the shell to show where to paste. Nothing is read until this press. */
export const showWherePaste = (): Promise<void> => invoke("point_paste", {}).then(() => undefined, () => undefined);
