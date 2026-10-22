// The folders made for you, in Settings: the folders directly inside the folder for all of them, each with Open as project, Show in
// Finder and Move to the Trash (asked first). Plain rows and buttons, the same as the practice list (practicePanel.tsx); the
// look is not decided. What is listed, and every refusal, is the shell's (made.rs); this only draws it and asks first. Every
// control has the folder's name in its words for VoiceOver, and the question takes the keyboard to its safe choice.
import { useEffect, useId, useRef, useState } from "react";
import { ConfirmStep } from "./confirm.tsx";
import { canOpen, canTrash, madeFrom, marks, sizeWords, trashAsk, whenWords, type MadeFolder, type MadeList } from "./made.ts";
import { S } from "./strings.ts";
import { invoke } from "./tauri.ts";

type Act = { open: (f: MadeFolder) => void; show: (f: MadeFolder) => void; trash: (f: MadeFolder) => void };

function Item({ f, busy, act, now }: { f: MadeFolder; busy: boolean; act: Act; now: number }) {
  const [ask, setAsk] = useState(false);
  const trashId = useId();
  const q = trashAsk(f);
  return (
    <div className="line" role="group" aria-label={f.name}>
      <b>{f.name}</b> <span className="muted">· {whenWords(f.madeMs, now)} · {sizeWords(f.bytes, f.rough)}</span>
      {marks(f).map((m) => <span className="muted" key={m}> · {m}</span>)}
      {!ask && <div className="row">
        <button className="btn" type="button" disabled={!canOpen(f, busy)} aria-label={`${S.made.open}: ${f.name}`} onClick={() => act.open(f)}>{S.made.open}</button>
        <button className="btn" type="button" aria-label={`${S.made.show}: ${f.name}`} onClick={() => act.show(f)}>{S.made.show}</button>
        <button id={trashId} className="btn" type="button" disabled={!canTrash(f, busy)} aria-label={`${S.made.trash}: ${f.name}`} onClick={() => setAsk(true)}>{S.made.trash}</button>
      </div>}
      {ask && (
        <ConfirmStep className="line" label={q.question} back={trashId} onCancel={() => setAsk(false)}><div>{q.question}</div>
          <div className="row">
            <button className="btn danger" type="button" onClick={() => { setAsk(false); act.trash(f); }}>{q.yes}</button>
            <button className="btn" type="button" data-cancel onClick={() => setAsk(false)}>{S.planCancel}</button>
          </div>
        </ConfirmStep>
      )}
    </div>
  );
}

/** `busy`: a task, a check or a lesson works or waits (the shell knows too). `project`: asked again when it changes. */
export function MadePanel({ busy, project }: { busy: boolean; project: string }) {
  const [list, setList] = useState<MadeList | null | undefined>(undefined);   // undefined: not asked yet
  const [problem, setProblem] = useState("");
  const [note, setNote] = useState("");
  const turn = useRef(0);
  const load = () => {
    const mine = ++turn.current;   // an answer that comes after a newer question is dropped
    void invoke("list_made", { busy }).then((v) => { if (mine !== turn.current) return; const l = madeFrom(v); setList(l); setProblem(l ? "" : S.made.unreadable); })
      .catch((e) => { if (mine !== turn.current) return; setList(null); setProblem(String(e)); });
  };
  useEffect(load, [project, busy]);
  const fail = (e: unknown) => { setNote(String(e)); load(); };
  const act: Act = {
    open: (f) => { setNote(""); void invoke("open_made", { name: f.name, busy }).then(() => { setNote(S.made.opened(f.name)); load(); }).catch(fail); },
    show: (f) => { setNote(""); void invoke("reveal_made", { name: f.name }).catch((e) => setNote(String(e))); },
    // git: this question was the git one (trashAsk), so its Yes is the person's confirm of that too.
    trash: (f) => { setNote(""); void invoke("trash_made", { name: f.name, git: trashAsk(f).git, busy }).then(() => { setNote(S.made.done(f.name)); load(); }).catch(fail); },
  };
  const now = Date.now();
  const stop = busy || !!list?.busy;
  return (
    <>
      {list && <div className="line muted">{S.made.help(list.where)}</div>}
      {note && <div className="line" role="status">{note}</div>}
      {problem && <div className="line" role="status">{problem}</div>}
      {list === undefined && <div className="line muted" role="status">{S.made.loading}</div>}
      {list && stop && list.folders.length > 0 && <div className="line muted">{S.made.busy}</div>}
      {list && list.folders.length === 0 && <div className="line muted">{S.made.empty}</div>}
      {list && list.folders.map((f) => <Item key={f.name} f={f} busy={stop} act={act} now={now} />)}
      {list && list.more > 0 && <div className="line muted">{S.made.more(list.more)}</div>}
    </>
  );
}
