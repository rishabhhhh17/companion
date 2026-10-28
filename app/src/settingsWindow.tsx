// The Settings window (27 Oct 2026; grouped in M18): Settings in a normal titled Mac window of its own (settingswin.rs), the
// way notch apps keep theirs. A side list of Settings' sections under a few headings (Companion, Powers, Your Mac, Account,
// More), the open one marked with a fill and
// a bar, and one section at a time on the right, with search across everything. It follows the Mac's light and dark (the
// tokens in style.css), the text size and Less motion, and every change reaches Home, the island and the character at once
// (the shell tells every window, "settings-changed").
import { StrictMode, useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { invoke, listen } from "./tauri.ts";
import { S } from "./strings.ts";
import { SettingsPage, settingsPlaces } from "./settingsPage.tsx";
import { groupPlaces } from "./settingsGroups.ts";
import { characterName } from "./companion.ts";
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
  // Grouped under a few headings (settingsGroups.ts); Settings opens on the character's own part, called by its name.
  const first = groupPlaces(places)[0]?.places[0]?.id ?? "";
  const open = place && places.some((p) => p.id === place) ? place : first;
  const name = characterName(useSetting("character.name"));
  const titleOf = (p: { id: string; title: string }) => (p.id === "home" ? name : p.title);
  const content = useRef<HTMLDivElement>(null);
  // Practice and the walk through a permission happen in Home: it opens and does what was pressed (starts that lesson, or
  // shows Learn), and this window stays as it is.
  const toHome = (then: HomeArrival) => void invoke("open_card_cmd", { then });
  return (
    <main className="settings-window">
      <nav className="side" aria-label={S.settingsTitle}>
        {groupPlaces(places).map((g) => (
          <div key={g.group} className="side-group" data-group={g.group}>
            <h2 className="side-head" id={`side-${g.group}`}>{S.setGroups[g.group]}</h2>
            <ul className="side-list" aria-labelledby={`side-${g.group}`}>
              {g.places.map((p) => (
                <li key={p.id}><button className="side-item" type="button" aria-current={p.id === open ? "page" : undefined} onClick={() => { setPlace(p.id); content.current?.scrollTo({ top: 0 }); }}><i className="side-dot" aria-hidden="true" />{titleOf(p)}</button></li>
              ))}
            </ul>
          </div>
        ))}
      </nav>
      <div className="content" ref={content}>
        <div className="inner">
          <header className="top"><h1 id="settings-title">{(() => { const p = places.find((x) => x.id === open); return p ? titleOf(p) : S.settingsTitle; })()}</h1></header>
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
