// M74: the names and paths a person adds in Settings (Folders and files reviews skip, Files never sent to Claude). Plain code
// with no file access, so the pages can use the same rule. A pattern without a slash is a file or folder name anywhere
// ("notes", "*.csv"); one with a slash is a path from the project folder ("docs/clients"). A folder covers everything in
// it. "*" is any part of one name, "**" any number of folders, "?" one letter. Capital letters do not matter, as on the Mac.
// A pattern that would cover everything ("*", "**", "/") is left out: it would stop all work, never what anyone means.

const MAX_PATTERNS = 30;
const MAX_LENGTH = 120;

/** One pattern as a test, or null when it is empty, too long or would cover everything. */
export function patternTest(raw: unknown): RegExp | null {
  if (typeof raw !== "string") return null;
  const p = raw.trim().replace(/\\/g, "/").replace(/^\.\//, "").replace(/^\/+/, "").replace(/\/+$/, "");
  if (!p || p.length > MAX_LENGTH || /^[*/.?]*$/.test(p)) return null;
  let re = "";
  for (let i = 0; i < p.length; i++) {
    const c = p[i];
    if (c === "*" && p[i + 1] === "*") { re += ".*"; i++; if (p[i + 1] === "/") i++; }
    else if (c === "*") re += "[^/]*";
    else if (c === "?") re += "[^/]";
    else re += c.replace(/[.+^${}()|[\]\\]/g, "\\$&");
  }
  // The pattern must start at a name and end at the end of a name: "notes" covers notes/a.txt and src/notes, never
  // footnotes.md. A path given from the root of the disk is matched the same way, by its last names.
  return new RegExp(`(^|/)${re}(/|$)`, "i");
}

/** The tests for a list from Settings: at most 30, each checked as above. Anything else in the list is ignored. */
export function patternTests(list: unknown): RegExp[] {
  if (!Array.isArray(list)) return [];
  return list.slice(0, MAX_PATTERNS).map(patternTest).filter((r): r is RegExp => r !== null);
}

/** Whether a path (from the project folder, or a whole path) is covered by one of the tests. */
export function coveredBy(path: string, tests: readonly RegExp[]): boolean {
  if (!path || !tests.length) return false;
  const clean = path.replace(/\\/g, "/").replace(/^\.\//, "");
  return tests.some((t) => t.test(clean));
}
