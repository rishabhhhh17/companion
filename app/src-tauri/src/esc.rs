//! Esc takes back control (M26, after HeyClicky: "you regain control by pressing Escape"). Esc belongs to the person's apps;
//! Squibby borrows it only while it has a reason to, and gives it back the moment the last reason ends. Two reasons today:
//! a Prompt help result is showing (Esc dismisses it, T11), and Squibby is drawing on the screen (a pointer ring, a Show me
//! walk, a diagram: Esc clears it and stops anything being said). The work of registering is main.rs's; this is the count.

/// A Prompt help result is showing.
pub const RESULT: u8 = 1;
/// Squibby is drawing on the screen.
pub const SCREEN: u8 = 2;

/// What the shell must do with the Esc key after a change.
#[derive(Debug, PartialEq, Eq, Clone, Copy)]
pub enum Change { Take, GiveBack, Keep }

/// Why Esc is held now, if at all.
#[derive(Debug, Default, Clone, Copy)]
pub struct Holds(u8);
impl Holds {
    pub const fn new() -> Self { Holds(0) }
    pub fn set(&mut self, why: u8, on: bool) -> Change {
        let was = self.0 != 0;
        if on { self.0 |= why } else { self.0 &= !why }
        match (was, self.0 != 0) { (false, true) => Change::Take, (true, false) => Change::GiveBack, _ => Change::Keep }
    }
    pub fn has(&self, why: u8) -> bool { self.0 & why != 0 }
}

/// A drawing left on the screen gives Esc back after this long even if nothing cleared it, so a forgotten ring can never
/// keep Esc from the person's apps.
pub const SCREEN_MAX_SECS: u64 = 180;

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn esc_is_taken_once_and_given_back_only_when_no_reason_is_left() {
        let mut h = Holds::new();
        assert_eq!(h.set(SCREEN, true), Change::Take);
        assert_eq!(h.set(RESULT, true), Change::Keep);
        assert_eq!(h.set(SCREEN, false), Change::Keep, "the result still needs it");
        assert!(h.has(RESULT) && !h.has(SCREEN));
        assert_eq!(h.set(RESULT, false), Change::GiveBack);
        assert_eq!(h.set(RESULT, false), Change::Keep, "giving back twice does nothing");
    }
    #[test]
    fn a_forgotten_drawing_never_keeps_esc_long() { assert!(SCREEN_MAX_SECS <= 300); }
}
