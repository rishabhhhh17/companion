// What a fix changed, as one card (M39; Linear's agent results show one quiet card of what changed): how many files, then
// each file with a mark for how it changed (+ added, ● changed, − removed; the word itself is there for screen readers),
// its name, and its folder in grey. Three columns (the audit, item 35): the mark, the name with its folder (a long name
// wraps inside its own column), and how it changed at the row's end.
import { S } from "./strings.ts";

const MARK: Record<string, string> = { added: "+", modified: "●", deleted: "−" };

/** A path split into its folder (with the last slash) and its name. */
export function splitPath(file: string): { dir: string; name: string } {
  const at = file.lastIndexOf("/");
  return at >= 0 ? { dir: file.slice(0, at + 1), name: file.slice(at + 1) } : { dir: "", name: file };
}

/** `undone`: an Undo put these files back, so the head says so (the audit, item 36: it still said Changed 2 files). */
export function ChangesCard({ changed, undone = false }: { changed: { file: string; kind: string }[]; undone?: boolean }) {
  const head = undone ? S.putBackFiles(changed.length) : S.changedFiles(changed.length);
  return (
    <div className="changes" role="group" aria-label={head} data-undone={undone || undefined}>
      <div className="changes-head">{head}</div>
      <ul>
        {changed.map((c) => {
          const { dir, name } = splitPath(c.file);
          return (
            <li key={c.file} data-kind={c.kind}>
              <span className="changes-mark" aria-hidden="true">{MARK[c.kind] ?? "●"}</span>
              <span className="sr">{(S as unknown as Record<string, string>)[c.kind] ?? c.kind}: </span>
              <span className="changes-file"><b>{name}</b>{dir && <span className="changes-dir">{dir}</span>}</span><span className="changes-kind" aria-hidden="true">{(S as unknown as Record<string, string>)[c.kind] ?? c.kind}</span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
