// Privacy: never sends typed text to Rust.
(function () {
  const T = window.__TAURI__, inv = T.core.invoke, label = document.body.dataset.label, $ = (i) => document.getElementById(i);
  T.event.listen("state", (e) => {
    const s = e.payload;
    if (label === "dock") { $("clicks").textContent = s.clicks; $("front").textContent = s.front; }
    else { $("key").textContent = s.card_key ? "YES" : "no"; }
  });
  document.addEventListener("pointerdown", (ev) => {
    if (ev.target.id === "circle") inv("char_click").then((n) => { $("clicks").textContent = n; });
    else if (ev.target.id === "type") { inv("ui_click", { label }); inv("open_card_cmd"); }
    else inv("ui_click", { label: label + ":" + (ev.target.id || ev.target.tagName) });
  }, true);
  if (label === "card") {
    T.event.listen("opened", () => { $("box").value = ""; setTimeout(() => $("box").focus(), 30); });
    document.addEventListener("keydown", (e) => { if (e.key === "Escape") { e.preventDefault(); $("box").blur(); inv("close_card"); } }, true);
  }
})();
