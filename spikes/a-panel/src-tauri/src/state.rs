//! Process wide state for the spike. Small on purpose.

use crate::config::Config;
use std::sync::{Mutex, OnceLock};
use tauri::AppHandle;

#[derive(Clone, Debug, serde::Serialize, serde::Deserialize)]
pub struct DockPref {
    /// The display the user wants the dock on (top left origin id from appkit::screens).
    pub screen_id: String,
    /// Vertical position as a share of the free height, 0.0 top to 1.0 bottom.
    pub offset_pct: f64,
}

#[derive(Clone, Debug)]
pub struct PendingRedock {
    pub target: [f64; 4],
    pub work: [f64; 4],
    pub started_ms: u128,
    pub reason: String,
}

pub struct State {
    pub cfg: Config,
    pub char_clicks: u64,
    pub preset: usize,
    pub last_key_request_ms: Option<u128>,
    pub compact: bool,
    pub mark: u64,
    pub last_front: String,
    pub dock_pref: DockPref,
    pub screens_sig: String,
    pub pending_redock: Option<PendingRedock>,
    pub dock_visible: bool,
    pub card_open: bool,
}

static STATE: OnceLock<Mutex<State>> = OnceLock::new();
pub static APP: OnceLock<AppHandle> = OnceLock::new();

pub fn init(cfg: Config) {
    let preset = cfg.preset;
    let _ = STATE.set(Mutex::new(State {
        cfg,
        char_clicks: 0,
        preset,
        last_key_request_ms: None,
        compact: false,
        mark: 0,
        last_front: String::new(),
        dock_pref: DockPref { screen_id: String::new(), offset_pct: 0.4 },
        screens_sig: String::new(),
        pending_redock: None,
        dock_visible: true,
        card_open: false,
    }));
}

pub fn with<T>(f: impl FnOnce(&mut State) -> T) -> T {
    let m = STATE.get().expect("state not initialised");
    let mut g = m.lock().unwrap_or_else(|e| e.into_inner());
    f(&mut g)
}

pub fn app() -> Option<&'static AppHandle> {
    APP.get()
}
