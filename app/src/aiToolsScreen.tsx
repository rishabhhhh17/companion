// M82, Part 1: the Your AI tools screen. Settings (Fixing), the first run (after Pick a project) and Now's row all show this
// one part. Opening it is the only time the shell looks for the tools (ai_tools_find: read only, nothing run, no file read).
// Connect opens one card that shows every file and every line for that tool; only its yes sends the adds (aiTools.ts).
import { useEffect, useState } from "react";
import { ConfirmStep } from "./confirm.tsx";
import { anyConnected, anyLineFrom, connectAsk, connectCommands, connection, connectProblem, connectRows, disconnectCommands, feedOffRow, findTools, foundFrom, supportsLine, toolName, watchNote, type Found, type ToolId } from "./aiTools.ts";
import { addDoneSignal, askAnyLine, showDoneSignal } from "./commands.ts";
import { doneAsk, doneStateFrom, type DoneState } from "./doneSignal.ts";
import { S } from "./strings.ts";
import { reviewModeOf } from "../../protocol/index.ts";
import { useSetting } from "./settingsStore.ts";
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
  // M113 review: the live feed's own card, for a tool connected before M113 (its feed row is off).
  const [askingFeed, setAskingFeed] = useState<ToolId | null>(null);
  const [said, setSaid] = useState("");
  const [notHereOpen, setNotHereOpen] = useState(false);
  // M115: the open tag's line for this project, asked when its part is opened.
  const [anyOpen, setAnyOpen] = useState(false);
  const anyLine = useAnyLine(project, anyOpen);
  const [anySaid, setAnySaid] = useState("");
  // M115 review: a watch tool's changes come from the review's folder watch, which runs only while reviews are on here and
  // Fix is on; its row and its card say so (aiTools.ts watchNote).
  const reviewMode = reviewModeOf(useSetting("review.mode"), useSetting("review.modeHere"));
  const flowOn = useSetting("flow.on");
  if (found === null) return <Row label={S.m82.title} description={S.m82.looking} />;
  if (found === "failed") return <Row label={S.m82.title} description={S.m82.couldNotLook} />;
  const { here, notHere, via } = findTools(found);
  const ask = asking ? connectAsk(st, asking) : null;
  const connect = (t: ToolId) => { setSaid(""); setAskingFeed(null); setAsking(t); };
  const feedRow = askingFeed ? feedOffRow(st, askingFeed) : null;
  const feedCard = feedRow ? doneAsk(feedRow) : null;
  const feedYes = (t: ToolId) => { setAskingFeed(null); setSaid(S.m113.liveSaid(toolName(t))); void send(addDoneSignal(project, t, "feed")).catch(() => {}); };
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
      // M113: a connected tool whose live feed is on says so too.
      const live = connectRows(st, t).some((r) => r.hook === "feed" && r.on) ? ` ${S.m113.liveOn}` : "";
      // M115: each tool says what Squibby does with it, by what its hooks can do.
      const note = watchNote(t, reviewMode, flowOn);
      const line = note ? `${supportsLine(t)} ${note}` : supportsLine(t);
      return <Row key={t} indent label={toolName(t)} description={problem ?? (c === "on" ? `${S.m82.connected}. ${line}${live}` : c === "partly" ? `${S.m82.partly}. ${line}` : line)}
        control={!project || problem || !st ? null
          : c === "on" ? <>
            {feedOffRow(st, t) && <Button size="sm" kind="secondary" id={`ai-feed-${t}`} label={S.m113.showLiveLabel(toolName(t))} onClick={() => { setSaid(""); setAsking(null); setAskingFeed(t); }}>{S.m113.showLive}</Button>}
            <Button size="sm" kind="quiet" label={S.m82.disconnectLabel(toolName(t))} onClick={() => disconnect(t)}>{S.m82.disconnect}</Button></>
          : <Button size="sm" id={`ai-connect-${t}`} label={S.m82.connectLabel(toolName(t))} onClick={() => connect(t)}>{S.m82.connect}</Button>} />;
    })}
    {/* M115: a tool that runs another one (Claude Desktop runs Claude Code): that tool's state, and its Connect. */}
    {via.map((v) => {
      const c = connection(st, v.via), viaName = toolName(v.via);
      return <Row key={v.id} indent label={v.name} description={c === "on" ? `${S.m82.connected}. ${S.m115.viaLine(v.name, viaName)}` : S.m115.viaLine(v.name, viaName)}
        control={!project || !st || c === "on" || connectProblem(st, v.via) ? null : <Button size="sm" kind="secondary" {...(here.includes(v.via) ? {} : { id: `ai-connect-${v.via}` })} label={S.m115.viaConnectLabel(v.name, viaName)} onClick={() => connect(v.via)}>{S.m82.connect}</Button>} />;
    })}
    {asking && ask && (
      <ConfirmStep className="set-confirm done-ask ai-connect-ask" label={ask.title} back={`ai-connect-${asking}`} onCancel={() => setAsking(null)}>
        <p><b>{ask.title}</b></p>
        {ask.parts.map((p) => (<div key={p.hook} className="ai-connect-part">
          <p>{p.label}. {p.where}</p>
          {/* M115: a watch part writes nothing, so it shows no lines. */}
          {p.what && <div className="ask-what" role="group" aria-label={p.label}><code>{p.what}</code></div>}
        </div>))}
        {ask.notes.map((n) => <p key={n}>{n}</p>)}
        {watchNote(asking, reviewMode, flowOn) && <p>{watchNote(asking, reviewMode, flowOn)}</p>}
        <div className="set-buttons"><Button kind="primary" onClick={() => yes(asking)}>{S.m82.yes}</Button><Button cancel onClick={() => setAsking(null)}>{S.m82.no}</Button></div>
      </ConfirmStep>
    )}
    {askingFeed && feedCard && (
      <ConfirmStep className="set-confirm done-ask ai-connect-ask" label={feedCard.title} back={`ai-feed-${askingFeed}`} onCancel={() => setAskingFeed(null)}>
        <p><b>{feedCard.title}</b></p>
        <p>{feedCard.where}</p>
        <div className="ask-what" role="group" aria-label={S.approval.what}><code>{feedCard.what}</code></div>
        {feedCard.notes.map((n) => <p key={n}>{n}</p>)}
        <div className="set-buttons"><Button kind="primary" onClick={() => feedYes(askingFeed)}>{feedCard.yes}</Button><Button cancel onClick={() => setAskingFeed(null)}>{S.doneSignal.no}</Button></div>
      </ConfirmStep>
    )}
    {notHere.length > 0 && (
      <Disclosure title={S.m82.notHere} count={notHere.length} open={notHereOpen} onToggle={setNotHereOpen}>
        <p className="set-note">{S.m82.notHereLine}</p>
        <ul className="ai-not-here">{notHere.map((t) => <li key={t}>{toolName(t)}</li>)}</ul>
      </Disclosure>
    )}
    {/* M115: the open tag, so any other tool can say it is done (docs/any-tool-hook.md). */}
    {project && (
      <Disclosure title={S.m115.anyTitle} open={anyOpen} onToggle={(o) => { setAnyOpen(o); setAnySaid(""); }}>
        <p className="set-note">{S.m115.anyLine}</p>
        {anyLine ? <>
          <div className="ask-what" role="group" aria-label={S.m115.anyTitle}><code>{anyLine}</code></div>
          <div className="set-buttons"><Button size="sm" kind="secondary" onClick={() => { void invoke("copy_text", { text: anyLine }).then(() => setAnySaid(S.m115.anyCopied), () => setAnySaid(S.m115.anyCopyFailed)); }}>{S.m115.anyCopy}</Button></div>
        </> : <p className="set-note" role="status">{S.m115.anyLoading}</p>}
        {anySaid && <p className="set-note" role="status">{anySaid}</p>}
      </Disclosure>
    )}
    {said && <p className="set-note" role="status">{said}</p>}
  </div>);
}

/** M115: the open tag's line for this project (donesignal.anyLine), asked only once its part is opened. */
function useAnyLine(project: string, open: boolean): string | null {
  const [line, setLine] = useState<string | null>(null);
  useEffect(() => {
    setLine(null);
    if (!project || !open) return;
    const off = listen("runner-event", (e) => { const l = anyLineFrom(e.payload, project); if (l) setLine(l); });
    void send(askAnyLine(project)).catch(() => {});
    return () => { void off.then((f) => f()); };
  }, [project, open]);
  return line;
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
