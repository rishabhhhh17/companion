// The Settings window (27 Oct 2026): Settings in a normal titled Mac window of its own (settingswin.rs), the way notch apps
// keep theirs. The same layout as Settings in Home: a side list of Settings' sections, the open one marked with a fill and
// a bar, and one section at a time on the right, with search across everything. It follows the Mac's light and dark (the
// tokens in style.css), the text size and Less motion, and every change reaches Home, the island and the character at once
// (the shell tells every window, "settings-changed").
import { StrictMode, useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { invoke, listen } from "./tauri.ts";
import { S } from "./strings.ts";
import { SettingsPage, settingsPlaces } from "./settingsPage.tsx";
import { startSettings, useSetting } from "./settingsStore.ts";
import { useModel } from "./useModel.ts";
import { isBusy } from "./updates.ts";
import { workingOn } from "./practice.ts";
import { applyTextSize, textSize, textSizeFrom } from "./textsize.ts";
import { followLessMotion } from "./motion.ts";
import type { HomeArrival } from "./home.ts";
import "./style.css";

function SettingsWindow() {
  const [m] = useModel();
  const [project, setProject] = useState("");
  useEffect(() => {
    void invoke("get_project").then((p) => setProject(String(p ?? "")));
    const off = listen("project-changed", (e) => setProject(String(e.payload ?? "")));
    return () => { off.then((f) => f()); };
  }, []);
  const size = useSetting("display.textSize");
  useEffect(() => { applyTextSize(textSizeFrom(size)); }, [size]);
  const [place, setPlace] = useState("");
  const places = settingsPlaces();
  const open = place && places.some((p) => p.id === place) ? place : places[0]?.id ?? "";
  const content = useRef<HTMLDivElement>(null);
  // Practice and the walk through a permission happen in Home: it opens and does what was pressed (starts that lesson, or
  // shows Learn), and this window stays as it is.
  const toHome = (then: HomeArrival) => void invoke("open_card_cmd", { then });
  return (
    <main className="settings-window">
      <nav className="side" aria-label={S.settingsTitle}>
        <ul className="side-list" aria-label={S.look.settingsPlaces}>
          {places.map((p) => (
            <li key={p.id}><button className="side-item" type="button" aria-current={p.id === open ? "page" : undefined} onClick={() => { setPlace(p.id); content.current?.scrollTo({ top: 0 }); }}>{p.title}</button></li>
          ))}
        </ul>
      </nav>
      <div className="content" ref={content}>
        <div className="inner">
          <header className="top"><h1 id="settings-title">{places.find((p) => p.id === open)?.title ?? S.settingsTitle}</h1></header>
          <div role="region" aria-labelledby="settings-title">
            <SettingsPage place={open} working={isBusy(m)} practiceBusy={workingOn(m)} project={project} spending={m.spending}
              onClose={() => void invoke("close_settings_window")} onPracticeList={() => toHome({ place: "learn" })} onLesson={(lesson) => toHome({ lesson })} />
          </div>
        </div>
      </div>
    </main>
  );
}

startSettings();
applyTextSize(textSize());
followLessMotion();
createRoot(document.getElementById("root")!).render(<StrictMode><SettingsWindow /></StrictMode>);
