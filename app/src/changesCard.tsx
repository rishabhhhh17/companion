// What a fix changed, as one card (M39; Linear's agent results show one quiet card of what changed): how many files, then
// each file with a mark for how it changed (+ added, ● changed, − removed; the word itself is there for screen readers),
// its name, and its folder in grey. Three columns (the audit, item 35): the mark, the name with its folder (a long name
// wraps inside its own column), and how it changed at the row's end.
// M65, the Instrument look: each file is a row with a short tag (Added, Changed, Removed, or Key in code in red) and its
// added and taken away lines where they are known (changeRows.ts). The tag and the counts show only in Instrument
// (ui/look.css, at the end); Friendly keeps the mark and the word at the row's end, as before.
import { changeRow, splitPath, type ChangedFile } from "./changeRows.ts";
import { S } from "./strings.ts";

export { splitPath };

const MARK: Record<string, string> = { added: "+", modified: "●", deleted: "−" };

/** `undone`: an Undo put these files back, so the head says so (the audit, item 36: it still said Changed 2 files).
 *  `keys`: the files a key was found in, tagged Key in code (the review card, changeRows.ts keyFiles). */
export function ChangesCard({ changed, undone = false, keys = [] }: { changed: ChangedFile[]; undone?: boolean; keys?: readonly string[] }) {
  const head = undone ? S.putBackFiles(changed.length) : S.changedFiles(changed.length);
  return (
    <div className="changes" role="group" aria-label={head} data-undone={undone || undefined}>
      <div className="changes-head">{head}</div>
      <ul>
        {changed.map((c) => {
          const { dir, name } = splitPath(c.file);
          const row = changeRow(c, keys);
          return (
            <li key={c.file} data-kind={c.kind} data-key={row.stop || undefined}>
              <span className="changes-mark" aria-hidden="true">{MARK[c.kind] ?? "●"}</span>
              <span className="sr">{(S as unknown as Record<string, string>)[c.kind] ?? c.kind}: </span>
              <span className="changes-file"><b>{name}</b>{dir && <span className="changes-dir">{dir}</span>}</span><span className="changes-kind" aria-hidden="true">{(S as unknown as Record<string, string>)[c.kind] ?? c.kind}</span>
              <span className="ui-tag changes-tag" data-tone={row.stop ? "stop" : undefined}>{row.stop ? row.tag : <span aria-hidden="true">{row.tag}</span>}</span>
              {(row.added > 0 || row.removed > 0) && (
                <span className="changes-diff">
                  <span className="sr">{S.ui.fileDiff(row.added, row.removed)}</span>
                  {row.added > 0 && <span className="changes-plus" aria-hidden="true">+{row.added}</span>}
                  {row.removed > 0 && <span className="changes-minus" aria-hidden="true">{"−"}{row.removed}</span>}
                </span>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
