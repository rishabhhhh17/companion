// The panel under the notch (islandPanel.ts decides what is in it). It hangs from the notch like the notch grown down, the
// way the best notch apps do it: a hello in big words while nothing runs, one lime key for the main thing ("Fix
// something"), a card for each piece of work while there is some, then a row of small pills and a button to open Home in full. Every
// press opens Home, where the answer, the plan and Undo are; nothing here acts on the project by itself. It never takes the
// keyboard (the island is a borderless panel); Home does, when Fix something opens it. Its height is measured (island.tsx).
import { forwardRef, useEffect, useRef, useState } from "react";
import { FlowMini } from "./flowflowMini.tsx";
import { Icon } from "./icons.tsx";
import { ARM_MS, answerHere, armed, greeting, islandJobs, panelNote, PANEL_DO, type JobCard } from "./islandPanel.ts";
import { keyHint, keysFrom, setKeysNow } from "./keys.ts";
import { answerApproval } from "./commands.ts";
import type { Model } from "./model.ts";
import { S } from "./strings.ts";
import { invoke } from "./tauri.ts";
import { useSetting } from "./settingsStore.ts";

/** `brief` (M26): the panel opened by itself (a question, or a moment of work), so it shows only the cards; the pointer
 *  opens the whole panel. */
type Props = { m: Model; line: string; shown: boolean; brief?: boolean };

// M33: the Mac account's first name for the greeting, asked once.
let firstName: string | null = null;
void invoke("first_name").then((v) => { firstName = typeof v === "string" && v ? v : null; }).catch(() => {});
void invoke("key_map").then((v) => setKeysNow(keysFrom(v))).catch(() => {});

export const IslandPanel = forwardRef<HTMLDivElement, Props>(function IslandPanel({ m, line, shown, brief }, ref) {
  // What the panel shows and its size (M19, Look and feel): the hello, the work, the quick actions, usual or compact.
  const showHello = useSetting("panel.showHello") !== false, showWork = useSetting("panel.showWork") !== false, showButtons = useSetting("panel.showButtons") !== false;
  const compact = useSetting("panel.size") === "compact";
  const jobs = showWork || brief ? islandJobs(m) : [];
  const tab = shown ? 0 : -1;
  const note = panelNote(line, jobs);
  // M23: when each question's card was first seen with the panel open; its buttons wait ARM_MS from then.
  const seen = useRef(new Map<string, number>());
  const [now, setNow] = useState(() => Date.now());
  const asks = jobs.filter((j) => j.approval).map((j) => j.key).join(" ");
  useEffect(() => {
    if (!shown) { seen.current.clear(); return; }
    const t = Date.now();
    for (const k of asks.split(" ").filter(Boolean)) if (!seen.current.has(k)) seen.current.set(k, t);
    setNow(t);
    if (!asks) return;
    const id = setTimeout(() => setNow(Date.now()), ARM_MS + 20);
    return () => clearTimeout(id);
  }, [shown, asks]);
  const answer = (j: JobCard, allow: boolean) => {
    if (!j.approval || !armed(seen.current.get(j.key) ?? null, Date.now())) return;
    void invoke("send_command", { cmd: answerApproval(j.approval, allow) }).catch(() => {});
  };
  // A question waiting comes before the big key: it is the one thing that needs the person now (M23).
  const asking = jobs.some((j) => j.approval);
  const list = jobs.length > 0 && <ul className="ip-jobs" aria-label={S.panel.jobs}>
      {jobs.map((j, i) => j.approval ? (
        <li key={j.key}>
          <div className="ip-job ip-ask" data-tone={j.tone} data-armed={armed(seen.current.get(j.key) ?? null, now) ? "yes" : undefined}>
            <FlowMini className="ip-agent" state={j.state} still={!shown} />
            <span className="ip-text"><b>{j.title}</b><span>{j.sub}</span></span>
            <span className="ip-answer">
              {j.here ?? answerHere(j.risk ?? "") ? <>
                <button className="ip-no" type="button" tabIndex={tab} aria-label={`${S.dontAllow}: ${j.title}`} onClick={() => answer(j, false)}>{S.dontAllow}</button>
                <button className="ip-yes" type="button" tabIndex={tab} aria-label={`${S.allow}: ${j.title}`} onClick={() => answer(j, true)}>{S.allow}</button>
              </> : <button className="ip-yes" type="button" tabIndex={tab} onClick={() => void invoke("island_click").catch(() => {})}>{S.panel.lookFirst}</button>}
            </span>
          </div>
        </li>
      ) : (
        <li key={j.key}>
          <button className="ip-job" type="button" data-tone={j.tone} tabIndex={tab} onClick={() => void invoke("island_click").catch(() => {})}>
            <FlowMini className="ip-agent" state={j.state} still={!shown} />
            <span className="ip-text"><b>{j.title}</b><span>{j.sub}</span></span>
            {j.cost && <span className="ip-cost">{j.cost}</span>}
          </button>
        </li>
      ))}
    </ul>;
  return (
    <div className="island-panel" ref={ref} data-shown={shown ? "yes" : undefined} data-size={compact ? "compact" : undefined} data-brief={brief ? "yes" : undefined} aria-hidden={!shown} role="group" aria-label={S.panel.label}>
      {brief ? list : <>
      {showHello && jobs.length === 0 && !note && <div className="ip-hello"><p className="ip-hi">{greeting(new Date().getHours(), firstName)}</p><p className="ip-talk">{keyHint("talk", S.panel.talkLine)}</p></div>}
      {asking && list}
      <button className="ip-go" type="button" tabIndex={tab} onClick={() => void invoke("open_card_cmd").catch(() => {})}>
        <span className="ip-plus" aria-hidden="true">+</span>{S.panel.go}
      </button>
      {!asking && list}
      {note && <div className="ip-note" role="status">{note}</div>}
      {showButtons && <div className="ip-row">
        <button className="ip-pill find" type="button" tabIndex={tab} onClick={() => void invoke("open_card_cmd", { then: PANEL_DO.find }).catch(() => {})}><Icon name="find" size={13} />{S.look.chipFind}</button>
        <button className="ip-pill live" type="button" tabIndex={tab} onClick={() => void invoke("open_card_cmd", { then: PANEL_DO.ship }).catch(() => {})}><Icon name="shield" size={13} />{S.look.chipSafe}</button>
        {/* M40: Settings and Open Home are two quiet round buttons at the end of the one row, so the row never wraps. */}
        <button className="ip-open ip-set" type="button" tabIndex={tab} aria-label={S.panel.settings} title={S.panel.settings} onClick={() => void invoke("open_card_cmd", { then: PANEL_DO.settings }).catch(() => {})}><Icon name="gear" size={14} /></button>
        <button className="ip-open" type="button" tabIndex={tab} aria-label={S.panel.open} title={S.panel.open} onClick={() => void invoke("island_click").catch(() => {})}><Icon name="resize" size={14} /></button>
      </div>}
      </>}
    </div>
  );
});
