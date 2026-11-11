// The shell's source as one text, for the page tests that read it. main.rs pulls much of its code in from the
// shell_*.rs files beside it (include!), so a test that looks for a line of the shell reads this instead of main.rs
// alone: main.rs with each include! line replaced by the file it pulls in, the same text as before the split.
import { readFileSync } from "node:fs";

const SHELL = new URL("../src-tauri/src/", import.meta.url);
const read = (f: string) => readFileSync(new URL(f, SHELL), "utf8");

let shell: string | null = null;
export function shellSource(): string {
  if (shell !== null) return shell;
  const main = read("main.rs");
  const files = [...main.matchAll(/^include!\("(shell_\w+\.rs)"\);\n/gm)].map((m) => m[1]);
  if (files.length === 0) throw new Error("main.rs pulls in no shell_*.rs file");
  let text = main;
  for (const f of files) text = text.replace(`include!("${f}");\n`, () => read(f));
  if (/^include!\(/m.test(text)) throw new Error("an include! line in main.rs was not replaced");
  shell = text;
  return text;
}
