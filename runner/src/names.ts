// The product's names for the engine, read from the one shared file (protocol/names.json; AGENTS.md rule 21). Prompts and
// messages the engine says use these, never a word typed into the logic. The pages (app/src/strings.ts) and the shell
// (app/src-tauri/src/names.rs) read the same file, and runner/test/names.test.ts fails if any of them stops doing so.
import names from "../../protocol/names.json";

export const NAMES = names;
/** The product's name, as a person reads it ("Squibby"). */
export const PRODUCT: string = names.product;
/** The product's name with 's ("Squibby's"). */
export const PRODUCT_S: string = names.productPossessive;
/** The first character's name ("Flowflow"). */
export const CHARACTER: string = names.character;

/** Fills {product}, {product_s}, {character} and {character_s} in a text that cannot hold the names itself (the lesson
 *  files, which are data). Anything else in braces is left as it is. */
export function fillNames(text: string): string {
  return text.replace(/\{(product_s|product|character_s|character)\}/g, (_m, k: string) => (k === "product_s" ? PRODUCT_S : k === "product" ? PRODUCT : k === "character_s" ? names.characterPossessive : CHARACTER));
}
