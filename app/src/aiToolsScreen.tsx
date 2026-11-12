// M82, Part 1: the Your AI tools screen. Settings (Fixing), the first run (after Pick a project) and Now's row all show this
// one part. Opening it is the only time the shell looks for the tools (ai_tools_find: read only, nothing run, no file read).
// Connect opens one card that shows every file and every line for that tool; only its yes sends the adds (aiTools.ts).
import { useEffect, useState } from "react";
import { ConfirmStep } from "./confirm.tsx";
import { anyConnected, connectAsk, connectCommands, connection, connectProblem, disconnectCommands, findTools, foundFrom, toolName, type Found, type ToolId } from "./aiTools.ts";
import { showDoneSignal } from "./commands.ts";
import { doneStateFrom, type DoneState } from "./doneSignal.ts";
import { S } from "./strings.ts";
import { invoke, listen } from "./tauri.ts";
import { Button, Disclosure, Row } from "./ui/parts.tsx";

const send = (cmd: unknown) => invoke("send_command", { cmd });

/** The tools found, asked once each time the screen opens (never on a timer). Null while looking; "failed" when the shell
 *  could not answer. */
export function useFoundTools(): Found | null | "failed" {
  const [found, setFound] = useState<Found | null | "failed">(null);
  useEffect(() => {
    let live = true;
    void invoke("ai_tools_find").then((v) => { if (live) setFound(foundFrom(v)); }, () => { if (live) setFound("failed"); });
    return () => { live = false; };
  }, []);
  return found;
}

/** The engine's hook state for the project (donesignal.state), asked once when the part opens. */
export function useDoneState(project: string): DoneState | null {
  const [st, setSt] = useState<DoneState | null>(null);
  useEffect(() => {
    setSt(null);
    if (!project) return;
    const off = listen("runner-event", (e) => { const d = doneStateFrom(e.payload, project); if (d) setSt(d); });
    void send(showDoneSignal(project)).catch(() => {});
    return () => { void off.then((f) => f()); };
  }, [project]);
  return st;
}

export function AiToolsScreen({ project }: { project: string }) {
  const found = useFoundTools();
  const st = useDoneState(project);
  const [asking, setAsking] = useState<ToolId | null>(null);
  const [said, setSaid] = useState("");
  const [notHereOpen, setNotHereOpen] = useState(false);
  if (found === null) return <Row label={S.m82.title} description={S.m82.looking} />;
  if (found === "failed") return <Row label={S.m82.title} description={S.m82.couldNotLook} />;
  const { here, notHere } = findTools(found);
  const ask = asking ? connectAsk(st, asking) : null;
  const connect = (t: ToolId) => { setSaid(""); setAsking(t); };
  const yes = (t: ToolId) => {
    // Everything for the tool goes after this one yes, in order; nothing was written before it.
    const cmds = connectCommands(project, st, t);
    setAsking(null);
    setSaid(S.m82.connectedSaid(toolName(t)));
    for (const c of cmds) void send(c).catch(() => {});
  };
  const disconnect = (t: ToolId) => { setSaid(S.m82.disconnectedSaid(toolName(t))); for (const c of disconnectCommands(project, st, t)) void send(c).catch(() => {}); };
  return (<div className="ai-tools" role="group" aria-label={S.m82.title}>
    <Row label={S.m82.title} description={project ? S.m82.line : S.m82.noProject} />
    {here.length === 0 && <Row indent label={S.m82.noneFound} />}
    {here.map((t) => {
      const c = connection(st, t), problem = connectProblem(st, t);
      return <Row key={t} indent label={toolName(t)} description={problem ?? (c === "on" ? `${S.m82.connected}. ${t === "claude" ? S.m82.toolLineClaude : S.m82.toolLine}` : c === "partly" ? `${S.m82.partly}. ${t === "claude" ? S.m82.toolLineClaude : S.m82.toolLine}` : t === "claude" ? S.m82.toolLineClaude : S.m82.toolLine)}
        control={!project || problem || !st ? null
          : c === "on" ? <Button size="sm" kind="quiet" label={S.m82.disconnectLabel(toolName(t))} onClick={() => disconnect(t)}>{S.m82.disconnect}</Button>
          : <Button size="sm" id={`ai-connect-${t}`} label={S.m82.connectLabel(toolName(t))} onClick={() => connect(t)}>{S.m82.connect}</Button>} />;
    })}
    {asking && ask && (
      <ConfirmStep className="set-confirm done-ask ai-connect-ask" label={ask.title} back={`ai-connect-${asking}`} onCancel={() => setAsking(null)}>
        <p><b>{ask.title}</b></p>
        {ask.parts.map((p) => (<div key={p.hook} className="ai-connect-part">
          <p>{p.label}. {p.where}</p>
          <div className="ask-what" role="group" aria-label={p.label}><code>{p.what}</code></div>
        </div>))}
        {ask.notes.map((n) => <p key={n}>{n}</p>)}
        <div className="set-buttons"><Button kind="primary" onClick={() => yes(asking)}>{S.m82.yes}</Button><Button cancel onClick={() => setAsking(null)}>{S.m82.no}</Button></div>
      </ConfirmStep>
    )}
    {notHere.length > 0 && (
      <Disclosure title={S.m82.notHere} count={notHere.length} open={notHereOpen} onToggle={setNotHereOpen}>
        <p className="set-note">{S.m82.notHereLine}</p>
        <ul className="ai-not-here">{notHere.map((t) => <li key={t}>{toolName(t)}</li>)}</ul>
      </Disclosure>
    )}
    {said && <p className="set-note" role="status">{said}</p>}
  </div>);
}

/** M82: Now's one row while no AI tool is connected in this project (aiTools.nowRow, on as usual). It opens Your AI tools;
 *  it never looks for the tools itself. */
export function AiToolsNowRow({ project, shown, onOpen }: { project: string; shown: boolean; onOpen: () => void }) {
  const st = useDoneState(project);
  if (!shown || !st || anyConnected(st)) return null;
  return (<div className="line ai-now-row" role="note">
    <span>{S.m82.nowRowLine}</span>{" "}
    <Button size="sm" kind="secondary" onClick={onOpen}>{S.m82.nowRow}</Button>
  </div>);
}
