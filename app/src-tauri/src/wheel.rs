//! "Take the wheel": notice when the person brings their editor or terminal to the front while a plan is
//! running, and ask the runner to pause. It looks only at which app is in front (its id), never at any
//! window content or keys, and needs no permission.

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Class { Editor, Terminal }

impl Class {
    pub fn reason(self) -> &'static str { match self { Class::Editor => "editor", Class::Terminal => "terminal" } }
}

const EDITORS: &[&str] = &[
    "com.microsoft.VSCode", "com.microsoft.VSCodeInsiders", "com.todesktop.230313mzl4w4u92", // VS Code, Cursor
    "com.apple.dt.Xcode", "dev.zed.Zed", "dev.zed.Zed-Preview", "com.panic.Nova", "com.sublimetext.4", "com.sublimetext.3",
    "com.github.atom", "org.vim.MacVim", "com.exafunction.windsurf", "com.visualstudio.code.oss",
];
const EDITOR_PREFIXES: &[&str] = &["com.jetbrains."];
const TERMINALS: &[&str] = &[
    "com.apple.Terminal", "com.googlecode.iterm2", "dev.warp.Warp-Stable", "net.kovidgoyal.kitty", "com.mitchellh.ghostty",
    "org.alacritty", "co.zeit.hyper", "com.github.wez.wezterm", "io.alacritty",
];

pub fn classify(bundle_id: &str) -> Option<Class> {
    if EDITORS.contains(&bundle_id) || EDITOR_PREFIXES.iter().any(|p| bundle_id.starts_with(p)) { return Some(Class::Editor); }
    if TERMINALS.contains(&bundle_id) { return Some(Class::Terminal); }
    None
}

#[derive(Default)]
pub struct Wheel { running: bool, paused: bool, last: Option<Class> }

impl Wheel {
    /// Learn from the runner's event types (the type only, never the content).
    pub fn on_runner_event(&mut self, ty: &str) {
        match ty {
            "drive.step" => { self.running = true; self.paused = false; }
            "drive.paused" => self.paused = true,
            "drive.done" | "app.runner_down" => { self.running = false; self.paused = false; }
            _ => {}
        }
    }
    /// The app in front changed or was looked at again. Returns the reason to pause, once per arrival.
    pub fn on_front(&mut self, bundle_id: &str) -> Option<&'static str> {
        let now = classify(bundle_id);
        let arrived = now.is_some() && now != self.last;
        self.last = now;
        match now {
            Some(c) if arrived && self.running && !self.paused => { self.paused = true; Some(c.reason()) }
            _ => None,
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    fn running() -> Wheel { let mut w = Wheel::default(); w.on_runner_event("drive.step"); w }

    #[test] fn knows_common_editors_and_terminals() {
        for id in ["com.microsoft.VSCode", "com.todesktop.230313mzl4w4u92", "com.apple.dt.Xcode", "dev.zed.Zed", "com.jetbrains.intellij", "com.jetbrains.WebStorm"] { assert_eq!(classify(id), Some(Class::Editor), "{id}"); }
        for id in ["com.apple.Terminal", "com.googlecode.iterm2", "dev.warp.Warp-Stable", "com.mitchellh.ghostty"] { assert_eq!(classify(id), Some(Class::Terminal), "{id}"); }
    }
    #[test] fn other_apps_are_not_either() {
        for id in ["com.apple.Safari", "com.google.Chrome", "com.apple.finder", "com.tinyspeck.slackmacgap", "", "com.jetbrainsfake"] { assert_eq!(classify(id), None, "{id}"); }
    }
    #[test] fn opening_the_editor_while_a_plan_runs_asks_for_a_pause() {
        let mut w = running();
        assert_eq!(w.on_front("com.microsoft.VSCode"), Some("editor"));
    }
    #[test] fn the_terminal_has_its_own_reason() {
        let mut w = running();
        assert_eq!(w.on_front("com.apple.Terminal"), Some("terminal"));
    }
    #[test] fn nothing_is_asked_when_no_plan_is_running() {
        let mut w = Wheel::default();
        assert_eq!(w.on_front("com.microsoft.VSCode"), None);
        w.on_runner_event("drive.done");
        assert_eq!(w.on_front("com.apple.Terminal"), None);
    }
    #[test] fn staying_in_the_editor_asks_only_once() {
        let mut w = running();
        assert_eq!(w.on_front("com.microsoft.VSCode"), Some("editor"));
        assert_eq!(w.on_front("com.microsoft.VSCode"), None);
        assert_eq!(w.on_front("com.microsoft.VSCode"), None);
    }
    #[test] fn while_paused_nothing_more_is_asked_and_resuming_re_arms_it() {
        let mut w = running();
        w.on_front("com.microsoft.VSCode");
        assert_eq!(w.on_front("com.apple.Terminal"), None);          // already paused
        w.on_front("com.apple.Safari");
        w.on_runner_event("drive.step");                             // resumed: the plan is moving again
        assert_eq!(w.on_front("com.apple.Terminal"), Some("terminal"));
    }
    #[test] fn a_file_change_pause_counts_as_paused_too() {
        let mut w = running();
        w.on_runner_event("drive.paused");
        assert_eq!(w.on_front("com.microsoft.VSCode"), None);
    }
    #[test] fn coming_back_to_the_editor_after_another_app_asks_again_once_resumed() {
        let mut w = running();
        w.on_front("com.microsoft.VSCode");
        w.on_runner_event("drive.step");
        w.on_front("com.apple.Safari");
        assert_eq!(w.on_front("com.microsoft.VSCode"), Some("editor"));
    }
    #[test] fn a_runner_that_goes_down_stops_watching() {
        let mut w = running();
        w.on_runner_event("app.runner_down");
        assert_eq!(w.on_front("com.microsoft.VSCode"), None);
    }
    #[test] fn other_events_change_nothing() {
        let mut w = running();
        for t in ["agent.state", "cost.update", "plan.ready", "receipt"] { w.on_runner_event(t); }
        assert_eq!(w.on_front("com.microsoft.VSCode"), Some("editor"));
    }
}
