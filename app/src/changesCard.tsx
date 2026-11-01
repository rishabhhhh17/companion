// What a fix changed, as one card (M39; Linear's agent results show one quiet card of what changed): how many files, then
// each file with a mark for how it changed (+ added, ● changed, − removed; the word itself is there for screen readers),
// its name, and its folder in grey.
import { S } from "./strings.ts";

const MARK: Record<string, string> = { added: "+", modified: "●", deleted: "−" };

/** A path split into its folder (with the last slash) and its name. */
export function splitPath(file: string): { dir: string; name: string } {
  const at = file.lastIndexOf("/");
  return at >= 0 ? { dir: file.slice(0, at + 1), name: file.slice(at + 1) } : { dir: "", name: file };
}

export function ChangesCard({ changed }: { changed: { file: string; kind: string }[] }) {
  return (
    <div className="changes" role="group" aria-label={S.changedFiles(changed.length)}>
      <div className="changes-head">{S.changedFiles(changed.length)}</div>
      <ul>
        {changed.map((c) => {
          const { dir, name } = splitPath(c.file);
          return (
            <li key={c.file} data-kind={c.kind}>
              <span className="changes-mark" aria-hidden="true">{MARK[c.kind] ?? "●"}</span>
              <span className="sr">{(S as unknown as Record<string, string>)[c.kind] ?? c.kind}: </span>
              <b>{name}</b>{dir && <span className="changes-dir">{dir}</span>}<span className="changes-kind" aria-hidden="true">{(S as unknown as Record<string, string>)[c.kind] ?? c.kind}</span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
