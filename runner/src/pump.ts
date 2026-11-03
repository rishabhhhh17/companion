// The engine's command loop, one line at a time (must fix 12, review of 4 Nov). A throw while handling one command must
// never end the loop: the engine would stop reading commands while the page was told it kept running, so buttons would do
// nothing and Stop might not stop. Each line is handled on its own; a throw is said as a protocol.error for that command
// (its reason in plain words, its detail with secrets hidden), and the next line is read as usual.
import { parseCommand, type Command } from "../../protocol/index.ts";
import { failure } from "./plainfail.ts";
import { label } from "./redact.ts";

export type PumpDeps = { takeKey: (line: string) => unknown; dispatch: (cmd: Command) => void; say: (e: Record<string, unknown>) => void };

export function pumpLine(line: string, d: PumpDeps): void {
  // The key handoff from the app is not part of the page protocol: it is taken here, before anything is parsed, logged
  // or echoed, and a damaged one is dropped without its text ever being repeated.
  if (line.startsWith('{"v":1,"type":"auth.key"')) { try { d.takeKey(line); } catch { /* takeKey says its own failure */ } return; }
  const sayIt = (e: Record<string, unknown>) => { try { d.say(e); } catch { /* nowhere to say it */ } };
  // A Google accounts line carries access tokens (M21): if it is damaged, only its type is ever repeated, never its text.
  const shown = line.includes('"google.accounts"') ? "google.accounts" : label(line, 200);
  let r: ReturnType<typeof parseCommand>;
  try { r = parseCommand(line); } catch { sayIt({ type: "protocol.error", ...failure("a line could not be read"), line: shown }); return; }   // never let one bad line stop the engine
  if (!r.ok) { sayIt({ type: "protocol.error", ...failure(r.error), line: shown }); return; }
  try { d.dispatch(r.msg); } catch (e) { sayIt({ type: "protocol.error", ...failure(e, r.msg.type) }); }
}
