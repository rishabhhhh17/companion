// The panel under the notch (islandPanel.ts decides what is in it). It hangs from the notch like the notch grown down, the
// way the best notch apps do it: a hello in big words while nothing runs, one lime key for the main thing ("Fix
// something"), a card for each piece of work while there is some, then a row of small pills and a button to open Home in full. Every
// press opens Home, where the answer, the plan and Undo are; nothing here acts on the project by itself. It never takes the
// keyboard (the island is a borderless panel); Home does, when Fix something opens it. Its height is measured (island.tsx).
import { forwardRef } from "react";
import { poseFor, poseUrl } from "./characters.ts";
import { Icon } from "./icons.tsx";
import { islandJobs, panelNote, PANEL_DO } from "./islandPanel.ts";
import type { Model } from "./model.ts";
import { S } from "./strings.ts";
import { invoke } from "./tauri.ts";

type Props = { m: Model; line: string; shown: boolean };

export const IslandPanel = forwardRef<HTMLDivElement, Props>(function IslandPanel({ m, line, shown }, ref) {
  const jobs = islandJobs(m);
  const tab = shown ? 0 : -1;
  const note = panelNote(line, jobs);
  return (
    <div className="island-panel" ref={ref} data-shown={shown ? "yes" : undefined} aria-hidden={!shown} role="group" aria-label={S.panel.label}>
      {jobs.length === 0 && !note && <p className="ip-hi">{S.panel.hiLead} {S.panel.hiWord}?</p>}
      <button className="ip-go" type="button" tabIndex={tab} onClick={() => void invoke("open_card_cmd").catch(() => {})}>
        <span className="ip-plus" aria-hidden="true">+</span>{S.panel.go}
      </button>
      {jobs.length > 0 && <ul className="ip-jobs" aria-label={S.panel.jobs}>
        {jobs.map((j, i) => (
          <li key={j.key} style={{ animationDelay: `${60 + i * 50}ms` }}>
            <button className="ip-job" type="button" data-tone={j.tone} tabIndex={tab} onClick={() => void invoke("island_click").catch(() => {})}>
              <img className="ip-agent" src={poseUrl(poseFor(j.state))} alt="" draggable={false} />
              <span className="ip-text"><b>{j.title}</b><span>{j.sub}</span></span>
              {j.cost && <span className="ip-cost">{j.cost}</span>}
            </button>
          </li>
        ))}
      </ul>}
      {note && <div className="ip-note" role="status">{note}</div>}
      <div className="ip-row">
        <button className="ip-pill find" type="button" tabIndex={tab} onClick={() => void invoke("open_card_cmd", { then: PANEL_DO.find }).catch(() => {})}><Icon name="find" size={13} />{S.look.chipFind}</button>
        <button className="ip-pill live" type="button" tabIndex={tab} onClick={() => void invoke("open_card_cmd", { then: PANEL_DO.ship }).catch(() => {})}><Icon name="shield" size={13} />{S.look.chipSafe}</button>
        <button className="ip-open" type="button" tabIndex={tab} aria-label={S.panel.open} title={S.panel.open} onClick={() => void invoke("island_click").catch(() => {})}><Icon name="resize" size={14} /></button>
      </div>
    </div>
  );
});
