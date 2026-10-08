// Panel Spike UI. Privacy rule: this page never sends typed text to Rust,
// only lengths.
(function () {
  const T = window.__TAURI__;
  const invoke = T.core.invoke;
  const listen = T.event.listen;
  const label = document.body.dataset.label;
  const $ = (id) => document.getElementById(id);
  const ui = (kind, target, len) =>
    invoke("ui_event", { label, kind, target, len: len ?? null }).catch(() => {});
  const textbox = () => (label === "dock" ? $("textbox") : $("cardbox"));

  function render(s) {
    if (!s) return;
    if ($("ipc")) $("ipc").textContent = "IPC: ok";
    if (label === "dock") {
      $("mode").textContent = `mode ${String(s.mode).toUpperCase()}, AFM ${s.afm ? "on" : "off"}`;
      $("clicks").textContent = s.clicks;
      const k = $("dockkey");
      k.textContent = s.dock_key ? "YES" : "no";
      k.className = s.dock_key ? "yes" : "no";
      $("front").textContent = (s.front && (s.front.name || s.front.bid)) || "?";
      $("preset").textContent = `preset ${s.preset_desc}  segment ${s.mark}`;
      const modeB = s.mode === "b";
      $("textbox").hidden = modeB;
      $("typebtn").hidden = !modeB;
      document.body.classList.toggle("compact", !!s.compact);
      $("compact-character").hidden = !s.compact;
    } else {
      const k = $("cardkey");
      k.textContent = s.card_key ? "YES" : "no";
      k.className = s.card_key ? "yes" : "no";
    }
  }

  invoke("get_state").then(render).catch((e) => { const i = $("ipc"); if (i) i.textContent = "IPC: failed " + e; });
  listen("state", (e) => render(e.payload));

  // Heartbeat: Rust logs a gap over 2 s (checks backgroundThrottling).
  let n = 0;
  setInterval(() => invoke("js_heartbeat", { label, n: ++n }).catch(() => {}), 1000);

  // One capture phase listener reports EVERY click on this page, so the
  // analyzer can match each native mouse down to a page event.
  function targetOf(el) {
    if (el.closest("#character, #compact-character")) return "character";
    if (el.closest("#textbox, #cardbox")) return "textbox";
    if (el.closest("#typebtn")) return "type_button";
    if (el.closest("#readout, #card")) return "readout";
    return "background";
  }
  document.addEventListener("pointerdown", (ev) => {
    const target = targetOf(ev.target);
    ui("pointerdown", target);
    if (target === "character") {
      invoke("char_click", { jsTs: ev.timeStamp }).then((c) => { const el = $("clicks"); if (el) el.textContent = c; });
    } else if (target === "textbox") {
      // Ask Rust to make this panel key before the input takes focus.
      invoke("request_key", { label, source: "textbox" });
      const box = textbox();
      setTimeout(() => box && box.focus(), 30);
    } else if (target === "type_button") {
      invoke("open_card", { source: "button" });
    }
  }, true);

  // Esc anywhere on the page hands the keyboard back, even if the input lost focus.
  document.addEventListener("keydown", (e) => {
    if (e.key !== "Escape") return;
    e.preventDefault();
    const box = textbox();
    const len = box ? box.value.length : null;
    if (box) box.blur();
    if (label === "dock") invoke("release_key", { label: "dock", len });
    else invoke("close_card", { len });
  }, true);

  const box = textbox();
  if (box) {
    box.addEventListener("focus", () => ui("textbox_focus", "textbox", box.value.length));
    box.addEventListener("blur", () => ui("textbox_blur", "textbox", box.value.length));
  }

  if (label === "dock") {
    listen("focus-textbox", () => setTimeout(() => $("textbox").focus(), 30));
    listen("compact", (e) => document.body.classList.toggle("compact", !!e.payload));
  } else {
    listen("card-opened", () => { box.value = ""; setTimeout(() => box.focus(), 30); });
  }
})();
