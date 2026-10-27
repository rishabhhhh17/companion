// One plain sentence for a failure from Squibby's own machinery on a press in a page (M15 wave 2): picking a folder, saving
// the key, saving a picture, the logs. The shell's own sentences written for a person are shown as they are; anything else
// (an error code, an OS error, a path) is the plain sentence for what was being done, and the raw words go to the log
// (main.rs note_failure), never on screen.
import { WRITTEN_FOR_A_PERSON } from "./model.ts";
import { S } from "./strings.ts";
import { invoke } from "./tauri.ts";

export type PageFail = keyof typeof S.fail;

/** What the person reads for a failure while doing `kind`. */
export function failLine(e: unknown, kind: PageFail): string {
  const raw = String((e as Error)?.message ?? e ?? "").trim();
  return raw && WRITTEN_FOR_A_PERSON(raw) ? raw : S.fail[kind];
}

/** failLine, and the raw words to the log when they are not what is shown. */
export function failNote(e: unknown, kind: PageFail): string {
  const line = failLine(e, kind);
  const raw = String((e as Error)?.message ?? e ?? "").trim();
  if (raw && raw !== line) void invoke("note_failure", { kind, detail: raw.slice(0, 400) }).catch(() => {});
  return line;
}
