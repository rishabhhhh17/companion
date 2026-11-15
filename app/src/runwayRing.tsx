// M89: the usage runway's small ring (runway.ts runwayMark): how full the person's Claude limit is, as Claude itself said on
// Squibby's own runs, with the percent beside it. Drawn and said: its label is the whole sentence. M93 (the founder, 14 Nov
// 2026: the hover panel is "too much for just a notch"): the ring moves from the notch's hover panel to Now in Home.
import { useEffect, useState } from "react";
import type { Model } from "./model.ts";
import { runwayMark, type RunwayMark } from "./runway.ts";
import { useSetting } from "./settingsStore.ts";
import { S } from "./strings.ts";

export function RunwayRing({ mark }: { mark: RunwayMark }) {
  return (
    <span className="runway-ring" data-level={mark.level} role="img" aria-label={mark.say} title={mark.say}>
      <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true"><circle className="runway-ring-track" cx="8" cy="8" r="6" /><circle className="runway-ring-fill" cx="8" cy="8" r="6" pathLength={100} style={{ strokeDasharray: `${Math.round(mark.fill * 100)} 100` }} /></svg>
      {mark.short && (mark.over ? <span className="runway-ring-text" aria-hidden="true"><small>{mark.over}</small><span>{mark.short}</span></span> : <span aria-hidden="true">{mark.short}</span>)}
    </span>
  );
}

/** Now's small usage row: a caption and the ring, only when Claude has said how full the limit is (or turned a request
 *  away) and runway.mark is on. The clock is read again each minute only while a reading shows (a reset passes). */
export function NowRunway({ m }: { m: Pick<Model, "runway"> }) {
  const on = useSetting("runway.mark");
  const warnAt = useSetting("runway.warnAt");
  const [now, setNow] = useState(() => Date.now());
  const has = !!m.runway;
  useEffect(() => {
    if (!has) return;
    setNow(Date.now());
    const id = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(id);
  }, [has, m.runway]);
  const mark = runwayMark(m.runway, now, on, undefined, warnAt);
  if (!mark) return null;
  return <div className="now-runway"><span className="now-runway-label">{S.m93.runwayLabel}</span><RunwayRing mark={mark} /></div>;
}
