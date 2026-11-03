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
export const STYLE_CSS = (): string => read("../style.css");
/** Every rule a page gets, as one text, in cascade order (style.css's own @import lines taken out: they are the other two). */
export const ALL_CSS = (): string => [TOKENS_CSS(), PARTS_CSS(), LOOK_CSS(), WIDE_CSS(), HOME_CSS(), STYLE_CSS().replace(/^@import [^;]+;\n/gm, "")].join("\n");
