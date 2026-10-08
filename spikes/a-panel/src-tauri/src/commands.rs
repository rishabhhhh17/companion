//! Commands the panel pages may call. Typed enums reject unknown values.
//! No command accepts text: only lengths (privacy rule, linted by analyze.py).

use crate::log::{ev, now_ms};
use crate::state;
use serde::Deserialize;
use serde_json::{json, Value};
use std::collections::HashMap;
use std::sync::Mutex;
use tauri::AppHandle;

#[derive(Deserialize, Clone, Copy, Debug)]
#[serde(rename_all = "snake_case")]
pub enum Label {
    Dock,
    Card,
}

impl Label {
    fn as_str(self) -> &'static str {
        match self {
            Label::Dock => "dock",
            Label::Card => "card",
        }
    }
}

#[derive(Deserialize, Clone, Copy, Debug, serde::Serialize)]
#[serde(rename_all = "snake_case")]
pub enum UiKind {
    Pointerdown,
    TextboxFocus,
    TextboxBlur,
    Keydown,
}

#[derive(Deserialize, Clone, Copy, Debug, serde::Serialize)]
#[serde(rename_all = "snake_case")]
pub enum UiTarget {
    Character,
    Textbox,
    TypeButton,
    Compact,
    Readout,
    Background,
}

#[derive(Deserialize, Clone, Copy, Debug)]
#[serde(rename_all = "snake_case")]
pub enum Source {
    Textbox,
    Button,
    Hotkey,
}

impl Source {
    fn as_str(self) -> &'static str {
        match self {
            Source::Textbox => "textbox",
            Source::Button => "button",
            Source::Hotkey => "hotkey",
        }
    }
}

static HEARTBEATS: Mutex<Option<HashMap<&'static str, u128>>> = Mutex::new(None);

#[tauri::command]
pub fn get_state(app: AppHandle) -> Value {
    crate::observers::get_state(&app)
}

#[tauri::command]
pub fn char_click(js_ts: f64) -> u64 {
    let n = state::with(|s| {
        s.char_clicks += 1;
        s.char_clicks
    });
    ev("char_click", json!({ "n": n, "js_ts": js_ts }));
    n
}

#[tauri::command]
pub fn ui_event(label: Label, kind: UiKind, target: UiTarget, len: Option<u32>) {
    ev("ui_event", json!({ "label": label.as_str(), "kind": kind, "target": target, "len": len }));
}

#[tauri::command]
pub fn request_key(app: AppHandle, label: Label, source: Source) {
    crate::focus::request_key(&app, label.as_str(), source.as_str());
}

#[tauri::command]
pub fn release_key(app: AppHandle, label: Label, len: Option<u32>) {
    crate::focus::release_key(&app, label.as_str(), "esc", len);
}

#[tauri::command]
pub fn open_card(app: AppHandle, source: Source) {
    crate::focus::open_card(&app, source.as_str());
}

#[tauri::command]
pub fn close_card(app: AppHandle, len: Option<u32>) {
    crate::focus::close_card(&app, "esc", len);
}

#[tauri::command]
pub fn js_heartbeat(label: Label, n: u64) {
    let now = now_ms();
    let mut g = HEARTBEATS.lock().unwrap_or_else(|e| e.into_inner());
    let map = g.get_or_insert_with(HashMap::new);
    if let Some(prev) = map.insert(label.as_str(), now) {
        let gap = now.saturating_sub(prev);
        if gap > 2000 {
            ev("js_gap", json!({ "label": label.as_str(), "gap_ms": gap as u64, "n": n }));
        }
    }
}

#[tauri::command]
pub fn toggle_compact(app: AppHandle) {
    crate::docking::toggle_compact(&app);
}

#[tauri::command]
pub fn next_preset(app: AppHandle) {
    let next = state::with(|s| (s.preset + 1) % crate::presets::COUNT);
    crate::presets::apply(&app, next);
}
