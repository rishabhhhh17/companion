// One plain row in the Memory tab: may other AI coding tools read this project's notes (AGENTS.md and CLAUDE.md)? Drawn only for a
// folder Squibby made; the shell says so (shared_files_state takes nothing from here). The same plain row and button as the
// rest of the Memory tab; the look is not decided. Add them sends the same yes as the shared files question card.
import { useEffect, useRef, useState } from "react";
import { addSharedFilesCommand, sharedFrom, sharedRow, type Shared } from "./sharedFiles.ts";
import { invoke } from "./tauri.ts";

/** `project`: asked again when it changes. `refresh`: any value that changes when the engine has written or taken out the
 *  files (the notice it sends), so "Added" shows without a restart. `send` is the card's own command sender. */
export function SharedFilesRow({ project, refresh, send }: { project: string; refresh: unknown; send: (c: unknown) => unknown }) {
  const [state, setState] = useState<Shared | null>(null);
  const [asked, setAsked] = useState<string | null>(null);   // the project Add them was pressed for
  const turn = useRef(0);
  useEffect(() => {
    const mine = ++turn.current;   // an answer that comes after a newer question is dropped
    void invoke("shared_files_state").then((v) => { if (mine === turn.current) setState(sharedFrom(v)); }).catch(() => { if (mine === turn.current) setState(null); });
  }, [project, refresh]);
  const row = sharedRow(state, asked === project);
  if (!row) return null;
  return (
    <div className="line">
      <span role="status">{row.text}</span>
      {row.button && <div className="row"><button className="btn" type="button" onClick={() => { setAsked(project); void send(addSharedFilesCommand(project)); }}>{row.button}</button></div>}
    </div>
  );
}
