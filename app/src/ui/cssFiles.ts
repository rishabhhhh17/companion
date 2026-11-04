// For the tests that read the look as text (the pages need a real Mac to run): the three stylesheets in the order the
// page applies them. style.css imports ui/tokens.css and ui/parts.css first, so the cascade is tokens, then parts, then
// style. Never imported by a page.
import { readFileSync } from "node:fs";

const read = (p: string) => readFileSync(new URL(p, import.meta.url), "utf8");

export const TOKENS_CSS = (): string => read("./tokens.css");
export const PARTS_CSS = (): string => read("./parts.css");
export const LOOK_CSS = (): string => read("./look.css");
/** The wide Home (M51 step 2), loaded after look.css. */
export const WIDE_CSS = (): string => read("./wide.css");
/** Home in the Instrument look and the faceless orb in Home (M65 step 2), loaded after wide.css on Home's page. */
export const HOME_CSS = (): string => read("./home.css");
/** Home's flow (M66): the landing, the cross fades and the stream, loaded after home.css. */
export const HOME_FLOW_CSS = (): string => read("./homeFlow.css");
export const STYLE_CSS = (): string => read("../style.css");
/** M69, the system: one layout grammar for both looks, loaded last on Home's page. */
export const SYSTEM_CSS = (): string => read("./system.css");
/** M69 step 2, Fix it and proof: the run list, the proof ticks, the failing lead and the notch's mini receipt, loaded after it. */
export const FIX_CSS = (): string => read("./fix.css");
/** M69 step 2, Home: the hero at rest, the Last fix and Since then cards, the review card that leads (after system.css). */
export const HOME_NOW_CSS = (): string => read("./homeNow.css");
/** M69 step 2, the pages (History, Memory, Learn, the welcome, the setup list, approvals), loaded after system.css. */
export const PAGES_CSS = (): string => read("./pages.css");
/** Every rule a page gets, as one text, in the order card.tsx loads them (style.css's own @import lines taken out: they are
 *  tokens and parts, first). M69 step 4: every stylesheet Home loads is here, so every lint over ALL_CSS covers it. */
export const ALL_CSS = (): string => [TOKENS_CSS(), PARTS_CSS(), STYLE_CSS().replace(/^@import [^;]+;\n/gm, ""), LOOK_CSS(), WIDE_CSS(), HOME_CSS(), HOME_FLOW_CSS(), SYSTEM_CSS(), PAGES_CSS(), FIX_CSS(), HOME_NOW_CSS()].join("\n");
