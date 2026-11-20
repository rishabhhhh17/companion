// M113 (docs/milestones/M113-live-feed.md): the live feed, drawn. Under the hover row of the notch and at the top of the small
// chat: one block per session (the tool and the project, then Working or Finished), and its newest rows: a file with the
// lines added and taken away, or a command. A press on a row opens Home for that session's work (main.rs island_go,
// arrival.rs "feed") when there is something there: the existing review diff with its Undo. While the tool still works, or
// its review is settling, a short line under the block says when it comes, and the person stays here (notchFeed.ts
// feedPress, pressLine). It never takes the keys (rule 9). Words in strings.ts (notchFeed.ts picks
// them), colours from tokens.css (notch.css and black.css draw it). A new row arrives with one short move, a fade with
// Reduce Motion; rows already there stay still.
import { useEffect, useState } from "react";
import { reviewModeOf } from "../../protocol/index.ts";
import type { Model } from "./model.ts";
import { CHAT_ROWS, feedBlocks, feedPress, pressLine } from "./notchFeed.ts";
import { useSetting } from "./settingsStore.ts";
import { S } from "./strings.ts";
import { jumpTo } from "./commands.ts";
import { goToFor, jumpSaidNow, JUMP_SAID_MS } from "./goTo.ts";
import { invoke } from "./tauri.ts";

/** M113 review: how long the notch's own short line stays under the line pressed. */
const SAID_MS = 5000;

/** M113 review: what the notch asks Home for on a press: that session's work, by its key only (arrival.rs, home.ts). */
export const feedGo = (key: string) => ({ do: "feed", key }) as const;

/** M115 review: the line a Go to that did not go says (goTo.ts jumpSaidNow), drawn again when it should go. */
export function useJumpSaid(m: Model): ReturnType<typeof jumpSaidNow> {
  const at = m.jumpSaid?.at ?? null;
  const [, tick] = useState(0);
  useEffect(() => {
    if (at === null) return;
    const left = at + JUMP_SAID_MS - Date.now();
    if (left <= 0) return;
    const t = setTimeout(() => tick((n) => n + 1), left + 10);
    return () => clearTimeout(t);
  }, [at]);
  return jumpSaidNow(m, Date.now());
}
/** Whether the feed draws a block for this project and tool now (so a Go to's line goes under it, not in the panel). */
export const feedHasBlock = (m: Model, project: string, tool: string, where: "notch" | "chat" = "notch"): boolean =>
  feedBlocks(m.feed, where === "chat" ? CHAT_ROWS : undefined).some((b) => { const s = m.feed?.find((x) => x.key === b.key); return s?.project === project && s.tool === tool; });

/** project: the one open (a line of another project opens Home, which offers to open that one). */
type Props = { m: Model; project: string; where: "notch" | "chat"; tabIndex?: number; onOpen: (key: string) => void };

export function NotchFeed({ m, project, where, tabIndex = 0, onOpen }: Props) {
  const on = useSetting("notch.liveFeed") !== false;
  const reviewsOn = reviewModeOf(useSetting("review.mode"), useSetting("review.modeHere")) !== "off";
  // M113 review: a press with nothing to open yet (the tool still works, or its review is settling) keeps the person here,
  // with a short line under the block pressed; every other press opens Home (onOpen).
  const [said, setSaid] = useState<{ key: string; text: string } | null>(null);
  useEffect(() => { if (!said) return; const t = setTimeout(() => setSaid(null), SAID_MS); return () => clearTimeout(t); }, [said]);
  const jumped = useJumpSaid(m);
  const blocks = on ? feedBlocks(m.feed, where === "chat" ? CHAT_ROWS : undefined) : [];
  if (!blocks.length) return null;
  const press = (key: string) => {
    const s = m.feed?.find((x) => x.key === key);
    const line = s ? pressLine(feedPress(s, project, m.review, reviewsOn), s.tool ? S.doneSignal.tool[s.tool] : "") : null;
    if (line) setSaid({ key, text: line });
    else { setSaid(null); onOpen(key); }
  };
  return (
    <div className="lf" data-where={where} role="group" aria-label={S.m113.label}>
      {blocks.map((b) => {
        // M115: Go to the app this session runs in, while it works, once the engine has seen where; for a tool that is an app
        // of its own, at once (goTo.ts goToFor).
        const s = m.feed?.find((x) => x.key === b.key);
        const go = s?.tool && b.state === "working" ? goToFor(m, s.project, s.tool) : null;
        const jumpLine = jumped && s && jumped.project === s.project && jumped.tool === s.tool ? jumped.text : null;
        return (
        <section key={b.key} className="lf-block" data-state={b.state} aria-label={`${b.head}. ${b.stateWords}`}>
          <div className="lf-head"><span className="lf-who" aria-hidden="true">{b.head}</span><span className="lf-state" aria-hidden="true">{b.stateWords}</span>
            {/* M115 review: a separator VoiceOver does not hear, so the state and the button never read as one phrase. */}
            {go && s?.tool && <><span className="lf-sep" aria-hidden="true">{S.m115.goSep}</span><button type="button" className="lf-go" tabIndex={tabIndex} aria-label={go.say} title={go.say} onClick={() => { void invoke("send_command", { cmd: jumpTo(s.project, s.tool!) }).catch(() => {}); }}>{go.text}</button></>}
          </div>
          <ul className="lf-rows">
            {b.rows.map((r) => (
              <li key={r.key}>
                <button type="button" className="lf-row" data-kind={r.kind} tabIndex={tabIndex} aria-label={`${r.say}. ${S.m113.open}`} title={r.say} onClick={() => press(b.key)}>
                  {/* M113 review: the stem is cut with an ellipsis, the extension never (fileParts). */}
                  <span className="lf-name" aria-hidden="true">{r.dir && <span className="lf-dir">{r.dir}</span>}<span className="lf-file"><span className="lf-stem">{r.stem}</span>{r.ext && <span className="lf-ext">{r.ext}</span>}</span></span>
                  <span className="lf-meta" aria-hidden="true">
                    {/* Only a count of more than none is drawn (+4, never +4 −0), as the words say. */}
                    {!!r.added && <span className="lf-add">+{S.m113.num(r.added)}</span>}
                    {!!r.removed && <span className="lf-del">−{S.m113.num(r.removed)}</span>}
                    {r.kind === "seen" && <span className="lf-seen">{S.m113.seen}</span>}
                    {r.times > 1 && <span className="lf-times">{S.m113.times(r.times)}</span>}
                  </span>
                </button>
              </li>
            ))}
          </ul>
          {said?.key === b.key && <p className="lf-said" role="status">{said.text}</p>}
          {/* M115 review: a Go to that did not go says why, with a plain next step, for a few seconds. */}
          {jumpLine && <p className="lf-said" role="status">{jumpLine}</p>}
        </section>
      ); })}
    </div>
  );
}
