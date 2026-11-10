// M79: the weekly summary's row in History and its plain page. The words and the choices are in weekSummary.ts (tested);
// this draws them with the M71 parts. Asked for only on the press of the row: never pushed, never a notification.
import { useEffect, useRef, useState } from "react";
import type { WeekView } from "../../protocol/index.ts";
import { S } from "./strings.ts";
import { listen } from "./tauri.ts";
import { Button, ListGroup, ListRow } from "./ui/parts.tsx";
import { weekAsk, weekFrom, weekPage } from "./weekSummary.ts";

export function WeekPart({ project, send }: { project: string; send: (cmd: unknown) => unknown }) {
  const [open, setOpen] = useState(false);
  const [week, setWeek] = useState<WeekView | null>(null);
  const asked = useRef(false);
  useEffect(() => {
    setOpen(false); setWeek(null); asked.current = false;
    const off = listen("runner-event", (e) => { const w = asked.current ? weekFrom(e.payload, project) : null; if (w) { asked.current = false; setWeek(w); } });
    return () => { void off.then((f) => f()); };
  }, [project]);
  const press = () => { if (open) { setOpen(false); return; } setOpen(true); setWeek(null); asked.current = true; void send(weekAsk(project)); };
  const page = week ? weekPage(week) : null;
  return (
    <div className="hist-week-part" role="group" aria-label={S.m79.week.rowTitle}>
      <ListGroup label={S.m79.week.rowTitle}>
        <ListRow colour="blue" icon="tick" title={S.m79.week.rowTitle} line={S.m79.week.rowLine} expanded={open}
          action={{ label: open ? S.m79.week.close : S.m79.week.open, colour: "blue", ariaLabel: open ? S.m79.week.close : S.m79.week.openLabel, onClick: press }} />
      </ListGroup>
      {open && (
        <section className="week-page" aria-label={S.m79.week.title}>
          {!page ? <p className="line muted" role="status">{S.m79.week.counting}</p> : (<>
            <p className="ui-lead-title" role="heading" aria-level={3}>{page.title}</p>
            <p className="line muted">{page.range}</p>
            {page.empty ? <p className="line">{S.m79.week.empty}</p> : (<>
              {page.lines.map((l) => <p className="line" key={l}>{l}</p>)}
              <p className="line"><b>{S.m79.week.caughtTitle}</b></p>
              {page.caught.length ? <ul>{page.caught.map((l) => <li className="line" key={l}>{l}</li>)}</ul> : <p className="line">{S.m79.week.caughtNone}</p>}
            </>)}
            <p className="line"><b>{page.decisionsTitle}</b></p>
            {page.decisions.length ? <ul>{page.decisions.map((d) => <li className="line" key={d}>{d}</li>)}</ul> : <p className="line muted">{S.m79.week.decisionsNone}</p>}
            {page.rules && <p className="line">{page.rules}</p>}
            <p className="line muted">{S.m79.week.fromRows}</p>
            <div className="row"><Button size="sm" onClick={() => setOpen(false)}>{S.m79.week.close}</Button></div>
          </>)}
        </section>
      )}
    </div>
  );
}
