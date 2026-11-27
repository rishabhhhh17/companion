// GLASS, the menu bar (the founder, 19 Nov 2026: "the menu bar, I think you need to change it and make it better"). A left
// click on the menu bar icon opens this small glass popover under it (the shell's traypop.rs places it; the panel never
// becomes key, so it never takes the keyboard from the app in front: rule 9). What it shows comes only from real state
// (glass.ts trayView): what Squibby is doing now or Nothing needs you, the project with a switch, the last check with its
// result, three quick actions, the plan and usage (only while payments are on), Settings, Stop everything with its keys, and
// Quit. Every press goes to the shell (tray_do), which does exactly what the same press does elsewhere in the app: nothing
// is sent, pasted or deleted from here. A right click on the icon keeps the short native menu.
import { StrictMode, useEffect, useLayoutEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { startSettings } from "./settingsStore.ts";
import { followLessMotion } from "./motion.ts";
import { invoke, listen } from "./tauri.ts";
import { useModel } from "./useModel.ts";
import { useLook } from "./useLook.ts";
import { usePlan } from "./usePlan.ts";
import { useKeys } from "./useKeys.ts";
import { S } from "./strings.ts";
import { PartBoundary } from "./partBoundary.tsx";
import { trayActionWord, trayView, type TrayAction } from "./glass.ts";
import { statusDot } from "./meaning.ts";
import { Dot, KeyLabel, Menu } from "./ui/parts.tsx";
import { Icon } from "./icons.tsx";
import "./style.css";
import "./ui/glass.css";
import "./ui/squibby.css";

type Do = TrayAction | "settings" | "stop" | "quit" | "now" | "review";
const press = (action: Do) => { void invoke("tray_do", { action }).catch(() => {}); };

export function TrayPanel() {
  useLook();
  const [m] = useModel();
  const plan = usePlan();
  const keys = useKeys();
  const [clock, setClock] = useState(() => Date.now());
  const [projects, setProjects] = useState<string[]>([]);
  // Shut while it is closed, so each open fades it in from the icon (glass.css .tray[data-shut]); never on a timer.
  const [shut, setShut] = useState(false);
  // The project the shell has open (Home asks the same way); the model alone may not have heard it on this page yet.
  const [folder, setFolder] = useState<string>("");
  const root = useRef<HTMLElement>(null);
  // Fresh each time it opens (the shell says so): the time words and the list of projects. No timer runs while it is shut.
  useEffect(() => {
    const load = () => { setClock(Date.now()); void invoke("get_project").then((p) => setFolder(typeof p === "string" ? p : "")).catch(() => {}); void invoke("list_projects").then((l) => setProjects(Array.isArray(l) ? (l as string[]) : [])).catch(() => {}); };
    load();
    const off = listen("tray-open", () => { load(); setShut(false); });
    const close = listen("tray-close", () => setShut(true));
    const moved = listen("project-changed", (e) => { setFolder(String(e.payload ?? "")); load(); });
    return () => { void off.then((f) => f()); void moved.then((f) => f()); void close.then((f) => f()); };
  }, []);
  const v = trayView(folder && !m.folder ? { ...m, folder } : m, clock, plan, m.proUsage ?? null);
  // The menu bar icon's dot follows what needs the person; the shell swaps the template image only on a change.
  useEffect(() => { void invoke("tray_dot", { on: v.dot }).catch(() => {}); }, [v.dot]);
  // The panel is as tall as what it holds (the plan row comes and goes); the shell keeps its top under the icon.
  useLayoutEffect(() => {
    const el = root.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(() => { void invoke("tray_size", { h: Math.ceil(el.getBoundingClientRect().height) }).catch(() => {}); });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const stopKeys = keys.using.stop ?? null;
  const options = projects.filter((p) => p !== v.project?.path).map((p) => ({ id: p, label: p.split("/").filter(Boolean).slice(-2).join("/") }));
  return (
    <main className="tray" ref={root} aria-label={S.glass.popoverLabel} data-shut={shut ? "" : undefined}>
      <section className="tr-now" data-tone={v.doing.tone} aria-labelledby="tr-now-title">
        <h1 id="tr-now-title" className="sr">{S.glass.nowLabel}</h1>
        {/* The GLASS review: a waiting question, changes to review or the work running is one press away, as in the notch;
            calm and Starting up are words only. The words stop at two lines; the whole of them are the tooltip. */}
        {v.go ? (
          <button type="button" className="tr-now-in tr-now-go" onClick={() => press(v.go!)}>
            <span className="tr-now-mark" aria-hidden="true" />
            <span className="tr-now-words" title={v.whole}>{v.doing.words}</span>
            <span className="sr">, {S.glass.nowGo[v.go]}</span>
            <Icon name="chevron" size={14} />
          </button>
        ) : (
          <div className="tr-now-in">
            <span className="tr-now-mark" aria-hidden="true" />
            <span className="tr-now-words" title={v.whole}>{v.doing.words}</span>
          </div>
        )}
        <p className="sr" role="status">{v.whole}</p>
      </section>
      <div className="tr-rows">
        <div className="tr-row">
          <span className="tr-key" id="tr-project">{S.glass.projectLabel}</span>
          {v.project ? (
            <span className="tr-val tr-project">
              {options.length > 0
                ? <Menu value="" size="sm" labelledBy="tr-project" placeholder={v.project.name} title={v.project.path} options={options} onChange={(p) => void invoke("use_project", { path: p }).catch(() => {})} />
                : <span className="tr-name" title={v.project.path}>{v.project.name}</span>}
            </span>
          ) : (
            // With no project, Choose a project is the one filled button below (glass.ts trayView); this row only says so.
            <span className="tr-val tr-quiet">{S.glass.noProject}</span>
          )}
        </div>
        <div className="tr-row">
          <span className="tr-key">{S.glass.lastCheck}</span>
          <span className="tr-val">{v.check ? <><Dot colour={statusDot(v.check.kind as Parameters<typeof statusDot>[0])} />{v.check.words}</> : <span className="tr-quiet">{S.glass.notChecked}</span>}</span>
        </div>
        {v.plan && <div className="tr-row"><span className="tr-key">{S.glass.planLabel}</span><span className="tr-val">{v.plan}</span></div>}
      </div>
      <div className="tr-actions">
        {v.actions.map((a) => (
          <button key={a.id} type="button" className={`tr-act${a.primary ? " primary" : ""}`} title={S.glass.actionsHelp[a.id]} onClick={() => press(a.id)}>{trayActionWord(a.id)}</button>
        ))}
      </div>
      <div className="tr-foot">
        <button type="button" className="tr-item" onClick={() => press("settings")}><Icon name="gear" size={14} /><span>{S.glass.settings}</span></button>
        <button type="button" className="tr-item" onClick={() => press("stop")} ><Icon name="stop" size={14} /><span>{S.glass.stop}</span><KeyLabel chord={stopKeys} /></button>
        <button type="button" className="tr-item" onClick={() => press("quit")}><Icon name="close" size={14} /><span>{S.glass.quit}</span></button>
      </div>
    </main>
  );
}

if (typeof document !== "undefined" && document.getElementById("root") && document.body.dataset.label === "tray") {
  startSettings();
  followLessMotion();
  createRoot(document.getElementById("root")!).render(<StrictMode><PartBoundary part="tray" auto><TrayPanel /></PartBoundary></StrictMode>);
}
