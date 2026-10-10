//! Your turn: the pointer shows where to click and waits for the person to click it themselves.
//! Noticing the click needs no permission: while the ring is up (and only then), Companion reads the two things any app
//! may read, where the mouse is and whether a button is down, about 60 times a second. It never reads keys, never
//! reads what is on screen, and stops the moment the click comes or the ring goes away.
use crate::coords::{Pt, R};

pub const POLL_MS: u64 = 16;
pub const WAIT_MS: u64 = 90_000;
/// A click this close to the ring still counts: people aim at the middle, not the edge.
const REACH: f64 = 10.0;

#[derive(Debug, PartialEq, Clone, Copy)]
pub enum Heard { Hit, Miss, Ignored }

/// Watches samples of (button down?, where). Only the moment the button goes down counts, once per press.
/// Companion's own character and card are looked up at the moment of the press (`ours`), because the card grows and
/// moves while the ring is up.
pub struct Watch { target: R, was_down: bool, pub misses: u32 }

impl Watch {
    /// `started_down`: a button already held when the ring appeared (mid drag) is not a click on the target.
    pub fn new(target: R, started_down: bool) -> Watch { Watch { target, was_down: started_down, misses: 0 } }

    pub fn sample(&mut self, down: bool, at: Pt, ours: impl FnOnce() -> Vec<R>) -> Option<Heard> {
        let pressed = down && !self.was_down;
        self.was_down = down;
        if !pressed { return None; }
        // Clicks on Companion's own card or character are the person talking to us, not a try.
        if ours().iter().any(|r| r.contains(at)) { return Some(Heard::Ignored); }
        let t = &self.target;
        let near = R { x: t.x - REACH, y: t.y - REACH, w: t.w + 2.0 * REACH, h: t.h + 2.0 * REACH };
        if near.contains(at) { Some(Heard::Hit) } else { self.misses += 1; Some(Heard::Miss) }
    }
}

/// Labels that send, pay, delete or publish: "Do it for me" never presses these; the person clicks them (rule 13).
pub fn risky(label: &str) -> bool {
    let l = label.to_lowercase();
    ["delet", "remov", "pay", "buy", "purchas", "send", "submit", "sign out", "log out", "logout", "publish", "deploy", "reset", "checkout", "order", "erase", "clear", "cancel", "unsubscribe", "subscribe", "post", "confirm", "donat", "upload", "install", "transfer", "withdraw", "go live", "make live", "promote", "rollback", "roll back", "merge", "drop", "destroy", "revoke", "archive", "close account",
     "trash", "discard", "accept", "approve", "share", "reply", "commit", "push", "leave", "book", "sign up", "register", "agree", "allow", "grant", "invite", "kick", "ban", "overwrite", "replace", "apply", "continue"]
        .iter().any(|w| l.contains(w))
}

/// What Do it for me may press: only a plain button, link or tab, never inside a dialog or sheet (where "OK" may mean
/// "yes, delete"), never one with no words on it (an unlabelled icon could be a bin), never one whose words are risky,
/// and never one of Companion's own. `texts` is everything the element says about itself: title, description, help,
/// value and the text inside it.
pub fn may_press(role: &str, texts: &[String], in_dialog: bool, ours: bool) -> Result<(), &'static str> {
    if ours { return Err("ours"); }
    if !["AXButton", "AXLink", "AXTab", "AXRadioButton"].contains(&role) { return Err("not_a_button"); }
    if in_dialog { return Err("dialog"); }
    let words: Vec<&String> = texts.iter().filter(|t| t.chars().any(|c| c.is_alphanumeric())).collect();
    if words.is_empty() { return Err("no_label"); }
    if words.iter().any(|t| risky(t)) || words.iter().any(|t| matches!(t.trim().to_lowercase().as_str(), "ok" | "yes" | "y")) { return Err("risky"); }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    const T: R = R { x: 500.0, y: 300.0, w: 120.0, h: 36.0 };
    fn p(x: f64, y: f64) -> Pt { Pt { x, y } }

    #[test]
    fn a_click_on_the_target_is_a_hit() {
        let mut w = Watch::new(T, false);
        assert_eq!(w.sample(false, p(560.0, 318.0), Vec::new), None);
        assert_eq!(w.sample(true, p(560.0, 318.0), Vec::new), Some(Heard::Hit));
    }
    #[test]
    fn a_click_just_outside_the_edge_still_counts_but_a_far_one_is_a_miss() {
        let mut w = Watch::new(T, false);
        assert_eq!(w.sample(true, p(495.0, 298.0), Vec::new), Some(Heard::Hit));
        w.sample(false, p(0.0, 0.0), Vec::new);
        assert_eq!(w.sample(true, p(100.0, 100.0), Vec::new), Some(Heard::Miss));
        assert_eq!(w.misses, 1);
    }
    #[test]
    fn holding_the_button_is_one_press_not_many() {
        let mut w = Watch::new(T, false);
        assert_eq!(w.sample(true, p(10.0, 10.0), Vec::new), Some(Heard::Miss));
        for _ in 0..20 { assert_eq!(w.sample(true, p(560.0, 318.0), Vec::new), None); }   // dragged onto the target while held
        assert_eq!(w.misses, 1);
    }
    #[test]
    fn a_button_already_down_when_the_ring_appears_is_not_a_click() {
        let mut w = Watch::new(T, true);
        assert_eq!(w.sample(true, p(560.0, 318.0), Vec::new), None);
        assert_eq!(w.sample(false, p(560.0, 318.0), Vec::new), None);
        assert_eq!(w.sample(true, p(560.0, 318.0), Vec::new), Some(Heard::Hit));
    }
    #[test]
    fn clicks_on_companions_own_card_are_not_tries() {
        let card = R { x: 1200.0, y: 200.0, w: 300.0, h: 400.0 };
        let mut w = Watch::new(T, false);
        assert_eq!(w.sample(true, p(1300.0, 300.0), || vec![card]), Some(Heard::Ignored));
        assert_eq!(w.misses, 0);
    }
    #[test]
    fn do_it_for_me_never_presses_anything_that_sends_pays_deletes_or_publishes() {
        for l in ["Delete project", "Pay now", "Send", "Deploy", "Make live", "Sign out", "Buy", "Remove member", "Submit"] { assert!(risky(l), "{l}"); }
        for l in ["Settings", "New project", "Save changes", "Next", "Environment variables", "Add to cart"] { assert!(!risky(l), "{l}"); }
    }
    #[test]
    fn do_it_for_me_presses_only_plain_labelled_safe_buttons() {
        let t = |v: &[&str]| v.iter().map(|s| s.to_string()).collect::<Vec<_>>();
        assert_eq!(may_press("AXButton", &t(&["Settings"]), false, false), Ok(()));
        assert_eq!(may_press("AXLink", &t(&["", "Environment variables"]), false, false), Ok(()));
        assert_eq!(may_press("AXButton", &t(&["", " ", "🗑"]), false, false), Err("no_label"));   // an icon with no words could be a bin
        assert_eq!(may_press("AXButton", &t(&["OK"]), false, false), Err("risky"));
        assert_eq!(may_press("AXButton", &t(&["Next"]), true, false), Err("dialog"));   // inside a "Delete project?" sheet
        assert_eq!(may_press("AXRow", &t(&["Delete"]), false, false), Err("not_a_button"));
        assert_eq!(may_press("AXCell", &t(&["Settings"]), false, false), Err("not_a_button"));
        assert_eq!(may_press("AXButton", &t(&["", "Move to Trash"]), false, false), Err("risky"));   // the words inside count too
        assert_eq!(may_press("AXButton", &t(&["Settings"]), false, true), Err("ours"));
    }
}
