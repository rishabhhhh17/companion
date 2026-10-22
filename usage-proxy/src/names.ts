// The product's name for the messages this server sends back, read from the one shared file (protocol/names.json; AGENTS.md
// rule 21). The pages, the engine and the shell read the same file; runner/test/names.test.ts checks all of them.
import names from "../../protocol/names.json";

/** The product's name ("Squibby"). */
export const PRODUCT: string = names.product;
/** The product's name with 's ("Squibby's"). */
export const PRODUCT_S: string = names.productPossessive;
