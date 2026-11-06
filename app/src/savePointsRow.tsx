// M58 (the shortlist, item 5): a History row's save point marks. Last working said plainly, a star, and a name the person
// types. Marking changes only the shadow store's own notes (checkpoint.mark), never the project and never git; rolling
// back stays the row's own Undo, which asks first.
import { useState } from "react";
import { Button } from "./ui/parts.tsx";
import { Icon } from "./icons.tsx";
import { S } from "./strings.ts";
import { saveName } from "./savePoints.ts";

type Mark = { star?: boolean; name?: string };

/** The marks shown in the row's quiet line: Last working, Starred, and the name. */
export function SaveMarksLine({ lastWorking, star, name }: { lastWorking?: boolean; star?: boolean; name?: string }) {
  // Each mark is its own small tag, not one dotted string, and Last working says what it is for (the review of 5 Nov).
  const tags: { kind: string; words: string }[] = [];
  if (lastWorking) tags.push({ kind: "lastWorking", words: S.fix.lastWorking });
  if (star) tags.push({ kind: "star", words: S.fix.starred });
  if (name) tags.push({ kind: "name", words: name });
  if (!tags.length) return null;
  return <>
    <span className="hist-marks">{tags.map((t) => <span key={t.kind} className="hist-mark" data-kind={t.kind}>{t.words}</span>)}</span>
    {lastWorking && <span className="hist-hint">{S.fix.lastWorkingHint}</span>}
  </>;
}

/** Star and Name it, for a row with a save point. send gets the mark to send (markSave in commands.ts). M72 (the
 *  walkthrough, item 9): real buttons, drawn right under the row they belong to; Star shows its state (a filled star and
 *  aria-pressed) and names the task it marks. */
export function SaveMarksActions({ star, name, onMark, subject = "" }: { star?: boolean; name?: string; onMark: (m: Mark) => void; subject?: string }) {
  const [naming, setNaming] = useState(false);
  const [text, setText] = useState(name ?? "");
  if (naming) return (
    <form className="row" onSubmit={(e) => { e.preventDefault(); onMark({ name: saveName(text) }); setNaming(false); }}>
      <input type="text" autoComplete="off" spellCheck={false} maxLength={40} value={text} placeholder={S.fix.namePlaceholder} aria-label={S.fix.namePlaceholder}
        onChange={(e) => setText(e.target.value)} onKeyDown={(e) => { if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); setNaming(false); } }} />
      <Button size="sm" kind="secondary" onClick={() => { onMark({ name: saveName(text) }); setNaming(false); }}>{S.fix.nameSave}</Button>
      <Button size="sm" kind="quiet" onClick={() => setNaming(false)}>{S.fix.nameCancel}</Button>
    </form>
  );
  return (
    <div className="row hist-marks-acts">
      {/* The state is the filled star and its words (Starred), never a filled button (the review of 5 Nov). */}
      <Button size="sm" kind="secondary" label={`${star ? S.fix.unstar : S.fix.star}${subject ? `: ${subject}` : ""}`} onClick={() => onMark({ star: !star })}><Icon name={star ? "starFilled" : "star"} size={14} />{star ? S.fix.starred : S.fix.star}</Button>
      <Button size="sm" kind="secondary" label={subject ? `${S.fix.nameIt}: ${subject}` : undefined} onClick={() => { setText(name ?? ""); setNaming(true); }}>{S.fix.nameIt}</Button>
    </div>
  );
}
