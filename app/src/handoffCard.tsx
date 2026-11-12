// M82, Part 2: the hand off card under the ask box (handoff.ts holds its states). Have my AI do it opens it with the words
// from the box: a clear prompt is written first (Prompt help's own rewrite, shown with what changed, and editable), then
// Claude Code runs it through the usual task path, or another tool gets it by Put it in (the shell's paste, never Return)
// or Copy, and the card waits for that tool to finish. The review that follows is the usual review card.
import { useEffect, useReducer, useRef, useState } from "react";
import { appsOf, connectRows, findTools, hasApp, toolName, type ToolId } from "./aiTools.ts";
import { useDoneState, useFoundTools } from "./aiToolsScreen.tsx";
import { showDoneSignal } from "./commands.ts";
import { DONE_TOOLS } from "./doneSignal.ts";
import { effectsFor, IDLE, LAST_TOOL_KEY, offeredTools, PUT_STAGES, putCopied, reduce, toolFor, type Action, type Handoff, type PutStage } from "./handoff.ts";
import { setting } from "./settingsStore.ts";
import { S } from "./strings.ts";
import { invoke, listen } from "./tauri.ts";
import { Button, Menu } from "./ui/parts.tsx";

const send = (cmd: unknown) => invoke("send_command", { cmd });
let n = 0;
const newId = () => `ho${Date.now().toString(36)}${++n}`;
const readLast = (project: string): string | null => { try { return localStorage.getItem(LAST_TOOL_KEY(project)); } catch { return null; } };
const keepLast = (project: string, tool: ToolId) => { try { localStorage.setItem(LAST_TOOL_KEY(project), tool); } catch { /* storage may be unavailable */ } };

export function HandoffCard({ project, words, onRun, onClose }: { project: string; words: string; onRun: (prompt: string) => void; onClose: () => void }) {
  const found = useFoundTools();
  const here = found && found !== "failed" ? findTools(found).here : [];
  const offered = offeredTools(here);
  const [h, dispatch0] = useReducer(reduce, IDLE);
  const hNow = useRef<Handoff>(IDLE);
  hNow.current = h;
  const st = useDoneState(project);
  const [said, setSaid] = useState("");
  const act = (a: Action) => {
    for (const f of effectsFor(hNow.current, a, project)) {
      // Prompt help switched off, or the engine out of reach: the person's own words, said so.
      if (f.kind === "prompt") void invoke("handoff_prompt", { tool: f.tool, text: f.text, req: f.req }).catch(() => dispatch0({ type: "event", project, e: { type: "assist.error", req: f.req, reason: "refused" } }));
    }
    dispatch0(a);
  };
  // The ask, once, as the card opens: with the tool last used in this project (Claude Code at first).
  const asked = useRef(false);
  useEffect(() => {
    if (asked.current) return;
    asked.current = true;
    act({ type: "ask", tool: toolFor(readLast(project), DONE_TOOLS), words, req: newId(), improve: setting("handoff.improve") !== false });
  }, []);
  // The engine's answers (the clearer prompt, the review starting) and Stop everything.
  useEffect(() => {
    const off = listen("runner-event", (e) => dispatch0({ type: "event", e: e.payload, project }));
    return () => { void off.then((f) => f()); };
  }, [project]);
  // While waiting: whether the tool's done signal is connected here decides what the card says about when the check starts.
  const tool = h.stage === "idle" ? null : h.tool;
  const doneOn = !!tool && connectRows(st, tool).some((r) => r.hook === "done" && r.on);
  useEffect(() => { if (h.stage === "waiting") dispatch0({ type: "signal", on: doneOn }); }, [h.stage, doneOn]);
  useEffect(() => { if (h.stage === "waiting") void send(showDoneSignal(project)).catch(() => {}); }, [h.stage]);
  if (h.stage === "idle" || !tool) return null;
  const name = toolName(tool);
  const close = () => { dispatch0({ type: "close" }); onClose(); };
  const copy = (text: string) => invoke("copy_text", { text });
  const putIn = () => {
    if (h.stage !== "ready") return;
    const text = h.prompt;
    keepLast(project, h.tool);
    act({ type: "putIn" });
    void invoke("handoff_put_in", { tool: h.tool, text, looking: S.m82.putting(name) }).then(
      (v) => dispatch0({ type: "putResult", stage: (PUT_STAGES as readonly unknown[]).includes(v) ? (v as PutStage) : "failed" }),
      () => { void copy(text).catch(() => {}); dispatch0({ type: "putResult", stage: "failed" }); });
  };
  const copyIt = () => {
    if (h.stage !== "ready") return;
    keepLast(project, h.tool);
    void copy(h.prompt).then(() => act({ type: "copied" }), () => setSaid(S.m82.put.failed(name)));
  };
  const run = () => {
    if (h.stage !== "ready") return;
    keepLast(project, "claude");
    const prompt = h.prompt.trim();
    dispatch0({ type: "run" });
    onRun(prompt);
  };
  return (
    <section className="card handoff" role="region" aria-label={S.m82.haveAi} data-stage={h.stage}>
      {h.stage === "writing" && (<>
        <p className="line"><span className="live" aria-hidden="true" /><b>{S.m82.writing}</b></p>
        <p className="line muted" role="status">{S.m82.writingLine(name)}</p>
      </>)}
      {h.stage === "ready" && (<>
        <p className="line"><b>{S.m82.readyFor(name)}</b></p>
        <p className="line muted" role="status">{h.own ? S.m82.ownWords : S.m82.readyLine}</p>
        <div className="row handoff-tool"><span className="muted">{S.m82.pickTool}</span>
          <Menu label={S.m82.pickTool} value={h.tool} options={[...new Set([...offered, h.tool])].map((t) => ({ id: t, label: toolName(t) }))} onChange={(t) => { keepLast(project, t); dispatch0({ type: "pick", tool: t }); }} /></div>
        {h.diff.length > 0 && <details className="handoff-diff"><summary>{S.m82.whatChanged}</summary>
          <div className="answer">{h.diff.map(([op, t], i) => op === "+" ? <ins key={i} className="added"><span className="sr">{S.diffAdded} </span>{t}</ins> : op === "-" ? <del key={i} className="removed"><span className="sr">{S.diffRemoved} </span>{t}</del> : <span key={i}>{t}</span>)}</div>
        </details>}
        <textarea className="handoff-prompt" aria-label={S.m82.promptLabel} value={h.prompt} rows={5} spellCheck={false} onChange={(e) => dispatch0({ type: "edit", prompt: e.currentTarget.value })} />
        {h.tool === "claude"
          ? <><p className="line muted">{S.m82.runLine}</p><div className="row"><Button kind="primary" disabled={!h.prompt.trim()} onClick={run}>{S.m82.runIt}</Button><Button kind="quiet" onClick={close}>{S.m82.close}</Button></div></>
          : <><p className="line muted">{hasApp(found && found !== "failed" ? found : null, h.tool) ? S.m82.putInLine(name) : S.m82.copyOnly(name)}</p>
            <div className="row">
              {hasApp(found && found !== "failed" ? found : null, h.tool) && appsOf(h.tool).length > 0 && <Button kind="primary" disabled={!h.prompt.trim()} onClick={putIn}>{S.m82.putIn(name)}</Button>}
              <Button kind={hasApp(found && found !== "failed" ? found : null, h.tool) ? "secondary" : "primary"} disabled={!h.prompt.trim()} onClick={copyIt}>{S.m82.copy}</Button>
              <Button kind="quiet" onClick={close}>{S.m82.close}</Button>
            </div></>}
      </>)}
      {h.stage === "putIn" && <p className="line" role="status"><span className="live" aria-hidden="true" />{S.m82.putting(name)}</p>}
      {h.stage === "waiting" && (<>
        <p className="line"><span className="live" aria-hidden="true" /><b>{S.m82.waiting(name)}</b></p>
        <p className="line" role="status">{h.put === "copiedByHand" ? S.m82.copied : S.m82.put[h.put](name)}</p>
        <p className="line muted">{h.signal ? S.m82.waitingSignal(name) : S.m82.waitingQuiet(name)}</p>
        <div className="row">
          {putCopied(h.put) && setting("paste.showWhere") !== false && <Button size="sm" title={S.pasteHere.help} onClick={() => void invoke("point_paste").catch(() => {})}>{S.pasteHere.button}</Button>}
          {putCopied(h.put) && <Button size="sm" onClick={() => void copy(h.prompt).then(() => setSaid(S.m82.copied), () => setSaid(S.m82.put.failed(name)))}>{S.m82.copy}</Button>}
          <Button size="sm" kind="quiet" onClick={close}>{S.m82.close}</Button>
        </div>
      </>)}
      {h.stage === "reviewed" && <><p className="line" role="status">{S.m82.reviewed(name)}</p><div className="row"><Button size="sm" kind="quiet" onClick={close}>{S.m82.close}</Button></div></>}
      {h.stage === "stopped" && <><p className="line" role="status">{S.m82.stopped}</p><div className="row"><Button size="sm" kind="quiet" onClick={close}>{S.m82.close}</Button></div></>}
      {said && <p className="line muted" role="status">{said}</p>}
    </section>
  );
}
