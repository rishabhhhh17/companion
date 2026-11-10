// M78: a small local search index over the project's notes, so Claude can ask for what it needs instead of being handed
// everything (the research, section 5: "index first, details on demand", without a vector database or a cloud).
// The plain files stay the source of truth: this index holds nothing they do not, is written again from them in full each
// time (rebuild), and can be deleted at any time. SQLite FTS5 through Bun's own bun:sqlite; no new dependency.
// One file per project in Squibby's own data folder (notes/<token>.db), the token being the project's hook token
// (donesignal.ts), so no project path or name is in a file name. The person's profile is never indexed: only project notes
// and house rules, the same lines the start block draws from.
// The search command Claude runs (search.sh) is macOS's own /usr/bin/sqlite3, read only, on the same file. Only letters and
// digits of the words reach the query, so nothing in them is read as query syntax or SQL.
import { Database } from "bun:sqlite";
import { chmodSync, existsSync, mkdirSync, readFileSync, renameSync, rmSync } from "node:fs";
import { join, resolve } from "node:path";
import { randomBytes } from "node:crypto";
import { writeAtomic } from "../atomic.ts";
import type { MemoryStore } from "./store.ts";
import { pickNotes, type NoteKind } from "./startblock.ts";
import { PRODUCT_S } from "../names.ts";

export const NOTES_DIR = "notes";
export const SEARCH_SCRIPT = "search.sh";
export const SEARCH_LIMIT = 8;
const TOKEN = /^[0-9a-f]{24}$/;

export type Found = { text: string; source: string; date: string; kind: NoteKind };

/** The words of a question as an FTS5 query: letters and digits only, words of two or more, each as a prefix, any of them.
 *  The same rule search.sh uses. Empty when there is nothing to search for. */
export function ftsQuery(words: string): string {
  const ws = words.replace(/[^A-Za-z0-9]+/g, " ").trim().split(" ").filter((w) => w.length >= 2).map((w) => w.slice(0, 40)).slice(0, 12);
  return ws.map((w) => `"${w}"*`).join(" OR ");
}

/** The search command's script, written into Squibby's notes folder. It takes the project's token and the words. */
export const SEARCH_SH = `#!/bin/sh
# ${PRODUCT_S} notes search (M78). Read only: it opens the project's notes index with macOS's own sqlite3 and prints the
# lines that match. Only letters and digits of the words are used.
LC_ALL=C; export LC_ALL
t="$1"; shift
case "$t" in ""|*[!0-9a-f]*) echo "Unknown project."; exit 0;; esac
[ \${#t} -eq 24 ] || { echo "Unknown project."; exit 0; }
db="$(dirname "$0")/$t.db"
[ -f "$db" ] || { echo "No notes yet."; exit 0; }
q=$(printf '%s ' "$@" | tr -cs 'A-Za-z0-9' ' ')
e=""; n=0
for w in $q; do
  [ \${#w} -ge 2 ] || continue
  [ $n -lt 12 ] || break
  w=$(printf '%s' "$w" | cut -c1-40)
  e="\${e:+$e OR }\\"$w\\"*"; n=$((n+1))
done
[ -n "$e" ] || { echo "Give a few words to search for."; exit 0; }
out=$(/usr/bin/sqlite3 -readonly -batch "$db" "SELECT '- ' || text || ' (' || source || CASE WHEN date <> '' THEN ', ' || date ELSE '' END || ')' FROM notes WHERE notes MATCH '$e' ORDER BY bm25(notes) LIMIT ${SEARCH_LIMIT};" 2>/dev/null)
[ -n "$out" ] && printf '%s\\n' "$out" || echo "Nothing found in the notes for that."
exit 0
`;

export class NotesIndex {
  private dir: string;
  constructor(data: string) { this.dir = join(resolve(data), NOTES_DIR); }
  /** The index file of a project's token. */
  fileOf(token: string): string { if (!TOKEN.test(token)) throw new Error("not a token"); return join(this.dir, `${token}.db`); }
  get script(): string { return join(this.dir, SEARCH_SCRIPT); }
  /** The exact command Claude is told to run (the words go after it). */
  command(token: string): string { return `/bin/sh '${this.script.replace(/'/g, `'\\''`)}' ${token}`; }

  /** Writes the whole index again from the files, into a new file renamed over the old one, so a search never reads a half
   *  written index. Returns how many lines it holds. */
  rebuild(project: string, m: MemoryStore, token: string): number {
    mkdirSync(this.dir, { recursive: true, mode: 0o700 });
    this.writeScript();
    const rows = pickNotes(project, m, { allFailed: true });
    const file = this.fileOf(token), tmp = `${file}.${randomBytes(4).toString("hex")}.tmp`;
    const db = new Database(tmp, { create: true });
    try {
      db.run("CREATE VIRTUAL TABLE notes USING fts5(text, source UNINDEXED, date UNINDEXED, kind UNINDEXED, tokenize = 'porter unicode61')");
      const put = db.prepare("INSERT INTO notes (text, source, date, kind) VALUES (?, ?, ?, ?)");
      db.transaction(() => { for (const r of rows) put.run(r.text, r.source, r.date, r.kind); })();
    } catch (e) { db.close(); rmSync(tmp, { force: true }); throw e; }
    db.close();
    try { chmodSync(tmp, 0o600); } catch { /* best effort */ }
    renameSync(tmp, file);
    return rows.length;
  }

  /** The best matching lines, best first. Nothing for an empty question or a project with no index yet. */
  search(token: string, words: string, limit = SEARCH_LIMIT): Found[] {
    const q = ftsQuery(words), file = this.fileOf(token);
    if (!q || !existsSync(file)) return [];
    const db = new Database(file, { readonly: true });
    try { return db.query("SELECT text, source, date, kind FROM notes WHERE notes MATCH ? ORDER BY bm25(notes) LIMIT ?").all(q, limit) as Found[]; }
    catch { return []; }
    finally { db.close(); }
  }

  /** Removes one project's index (leaving a project, the hook removed). The files are still the truth. */
  remove(token: string) { try { rmSync(this.fileOf(token), { force: true }); } catch { /* gone */ } }

  private writeScript() {
    try { if (readFileSync(this.script, "utf8") === SEARCH_SH) return; } catch { /* none yet: write it */ }
    writeAtomic(this.script, SEARCH_SH, 0o700);
  }
}
