//! When the character should be on screen. By default it stays out of full screen apps, so it
//! never covers a video, a presentation or a game (product doc, section 4); a setting can keep
//! it visible (character.overFullScreen). The user's own "hide" always wins. Pure logic, tested.

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct Inputs {
    pub full_screen_app_in_front: bool,
    pub show_over_full_screen: bool,   // the setting
    pub user_hid_it: bool,             // hidden from the menu bar icon
}

/// Whether Companion stays on screen over a full screen app: the person's setting (character.overFullScreen, off unless
/// turned on), or a developer's COMPANION_OVER_FULLSCREEN=1 (kept for developers).
pub fn over_full_screen(env: Option<&str>, setting: bool) -> bool { setting || env == Some("1") }

pub fn should_show(i: Inputs) -> bool {
    if i.user_hid_it { return false; }
    !(i.full_screen_app_in_front && !i.show_over_full_screen)
}

/// Smooths a noisy yes/no reading: the answer only changes after `need` identical readings in a row.
/// One odd reading (or a reading that flips every tick) can never make the character flicker.
#[derive(Clone, Debug)]
pub struct Debounce { stable: bool, run: u32, need: u32 }
impl Debounce {
    pub fn new(start: bool, need: u32) -> Self { Self { stable: start, run: 0, need } }
    pub fn push(&mut self, reading: bool) -> bool {
        if reading == self.stable { self.run = 0; return self.stable; }
        self.run += 1;
        if self.run >= self.need { self.stable = reading; self.run = 0; }
        self.stable
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    const fn i(fs: bool, over: bool, hid: bool) -> Inputs { Inputs { full_screen_app_in_front: fs, show_over_full_screen: over, user_hid_it: hid } }
    #[test] fn normally_visible() { assert!(should_show(i(false, false, false))); }
    #[test] fn hidden_over_a_full_screen_app_by_default() { assert!(!should_show(i(true, false, false))); }
    #[test] fn the_setting_keeps_it_visible_over_full_screen() { assert!(should_show(i(true, true, false))); }
    #[test] fn the_users_own_hide_always_wins() {
        assert!(!should_show(i(false, false, true)));
        assert!(!should_show(i(true, true, true)));
    }
    #[test] fn comes_back_when_the_full_screen_app_goes_away() {
        assert!(!should_show(i(true, false, false)));
        assert!(should_show(i(false, false, false)));
    }

    #[test] fn one_odd_reading_does_not_change_the_answer() {
        let mut d = Debounce::new(false, 3);
        assert!(!d.push(true));
        assert!(!d.push(false));
    }
    #[test] fn a_reading_that_flips_every_tick_never_changes_the_answer() {
        let mut d = Debounce::new(false, 3);
        for i in 0..40 { assert!(!d.push(i % 2 == 0), "tick {i}"); }
        let mut d = Debounce::new(true, 3);
        for i in 0..40 { assert!(d.push(i % 2 == 1), "tick {i}"); }
    }
    #[test] fn three_in_a_row_changes_it_and_it_stays_changed() {
        let mut d = Debounce::new(false, 3);
        assert!(!d.push(true));
        assert!(!d.push(true));
        assert!(d.push(true));
        assert!(d.push(false));
        assert!(d.push(true));
    }
    #[test] fn changing_back_also_takes_three_in_a_row() {
        let mut d = Debounce::new(true, 3);
        assert!(d.push(false)); assert!(d.push(false)); assert!(!d.push(false));
    }

    // M11 area 4: the setting (character.overFullScreen), with the developer's COMPANION_OVER_FULLSCREEN kept.
    #[test] fn over_full_screen_apps_only_when_the_setting_or_the_developer_switch_says_so() {
        assert!(!over_full_screen(None, false), "off unless turned on, as today");
        assert!(over_full_screen(None, true));
        assert!(over_full_screen(Some("1"), false), "the developer switch still works");
        for v in ["0", "", "yes", "true"] { assert!(!over_full_screen(Some(v), false), "{v}"); }
        // The person's own hide still wins over both.
        assert!(!should_show(i(true, over_full_screen(Some("1"), true), true)));
        assert!(should_show(i(true, over_full_screen(None, true), false)));
    }
}
