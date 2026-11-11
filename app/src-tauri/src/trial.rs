//! The 14 day Pro trial with no card (F25, Option A, payments spec section 6). It runs on this Mac: one tap starts it, with
//! no email, no browser and no network. The page offers it only after the first proven fix, or on a limit or Pro tag card;
//! it never starts on its own.
//!
//! One Keychain item (service `keystore::service()`, account `pro-trial`) holds when it started and the latest clock time
//! seen. Days left count from the later of the clock and that time, so turning the clock back adds no days, and while the
//! app runs the time it judges by moves on in real time whatever the clock says (license.rs `steady_now`), so a clock set
//! back does not pause the trial either. The item
//! survives a reinstall and Delete everything (spec section 10, Option 2, named on that screen), so the trial is once per
//! Mac. These are honest user checks (spec section 5): the item can be removed by hand in Keychain Access.

use serde::{Deserialize, Serialize};

pub const ACCOUNT: &str = "pro-trial";
/// Exactly 14 times 24 hours.
pub const LENGTH: u64 = 14 * 24 * 3600;
/// How much later the clock must be before the latest time seen is written again (one write an hour at most).
pub const SEEN_EVERY: u64 = 3600;

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Trial { pub started_at: u64, pub latest_seen: u64 }

impl Trial {
    pub fn ends_at(&self) -> u64 { self.started_at + LENGTH }
    /// The later of the clock and the latest time seen.
    pub fn now(&self, now: u64) -> u64 { now.max(self.latest_seen) }
    /// Running until exactly 14 x 24 hours after it started.
    pub fn active(&self, now: u64) -> bool { self.now(now) < self.ends_at() }
    /// Whole days left, counting a part day as one ("9 days left"); 0 once ended.
    pub fn days_left(&self, now: u64) -> u64 { self.ends_at().saturating_sub(self.now(now)).div_ceil(crate::license::DAY) }
    /// Notes a later clock time. True when it should be written back.
    pub fn seen(&mut self, now: u64) -> bool { if now >= self.latest_seen + SEEN_EVERY { self.latest_seen = now; true } else { false } }
    pub fn to_json(&self) -> String { serde_json::to_string(self).unwrap_or_default() }
    pub fn from_json(s: &str) -> Option<Trial> { serde_json::from_str::<Trial>(s).ok().filter(|t| t.started_at > 0 && t.latest_seen >= t.started_at) }
}

/// The trial as kept, with the latest clock time noted (written back at most once an hour). Err: the Keychain could not
/// be read, which is never taken for "no trial yet". An item that cannot be read as a trial counts as a used one.
#[cfg(test)]
pub fn load(v: &dyn crate::license::Vault, now: u64) -> Result<Option<Trial>, ()> {
    let Some(mut t) = peek(v)? else { return Ok(None) };
    if t.seen(now) { let _ = v.set(ACCOUNT, &t.to_json()); }
    Ok(Some(t))
}
/// The trial as kept, written nothing back. A damaged item reads as a trial that ended long ago.
pub fn peek(v: &dyn crate::license::Vault) -> Result<Option<Trial>, ()> {
    Ok(v.get(ACCOUNT)?.map(|text| Trial::from_json(&text).unwrap_or(Trial { started_at: 1, latest_seen: 1 })))
}

/// Starts the trial, once per Mac. Refused while payments are off (nothing is gated then), when this Mac already has Pro,
/// when a trial was started before (even one that ended), and when the Keychain cannot say whether one was.
pub fn start(v: &dyn crate::license::Vault, payments_on: bool, pro_active: bool, now: u64) -> Result<Trial, &'static str> {
    if !payments_on { return Err("paymentsOff"); }
    if pro_active { return Err("alreadyPro"); }
    match v.get(ACCOUNT) {
        Err(()) => return Err("keychain"),
        Ok(Some(_)) => return Err("trialUsed"),
        Ok(None) => {}
    }
    let t = Trial { started_at: now, latest_seen: now };
    v.set(ACCOUNT, &t.to_json()).map_err(|_| "keychain")?;
    Ok(t)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::license::tests::{Mem, NoVault};
    use crate::license::{Vault, DAY};
    const T0: u64 = 1_793_000_000;

    #[test]
    fn it_starts_once_and_a_second_start_is_refused_even_after_it_ended() {
        let v = Mem::default();
        let t = start(&v, true, false, T0).unwrap();
        assert_eq!((t.started_at, t.ends_at()), (T0, T0 + LENGTH));
        assert_eq!(start(&v, true, false, T0 + 1), Err("trialUsed"));
        assert_eq!(start(&v, true, false, T0 + 30 * DAY), Err("trialUsed"));
        assert_eq!(load(&v, T0 + 1).unwrap().unwrap().started_at, T0, "the first start is kept");
    }
    #[test]
    fn it_never_starts_with_payments_off_with_pro_or_when_the_keychain_cannot_say() {
        assert_eq!(start(&NoVault, false, false, T0), Err("paymentsOff"));
        assert_eq!(start(&NoVault, true, true, T0), Err("alreadyPro"));
        assert_eq!(start(&Mem { broken: true, ..Default::default() }, true, false, T0), Err("keychain"));
        // A damaged item counts as a used trial.
        let v = Mem::default(); v.set(ACCOUNT, "garbage").unwrap();
        assert_eq!(start(&v, true, false, T0), Err("trialUsed"));
        assert!(!load(&v, T0).unwrap().unwrap().active(T0));
    }
    #[test]
    fn it_ends_at_exactly_14_times_24_hours() {
        let t = Trial { started_at: T0, latest_seen: T0 };
        assert_eq!(LENGTH, 1_209_600);
        assert!(t.active(T0 + LENGTH - 1));
        assert!(!t.active(T0 + LENGTH));
        assert_eq!((t.days_left(T0), t.days_left(T0 + 1), t.days_left(T0 + 5 * DAY), t.days_left(T0 + LENGTH - 1), t.days_left(T0 + LENGTH)), (14, 14, 9, 1, 0));
    }
    #[test]
    fn turning_the_clock_back_adds_no_days() {
        let v = Mem::default();
        start(&v, true, false, T0).unwrap();
        let seen = load(&v, T0 + 5 * DAY).unwrap().unwrap();
        assert_eq!(seen.days_left(T0 + 5 * DAY), 9);
        // The clock is set back to the first day: still 9 days left, from the latest time seen.
        let back = load(&v, T0 + DAY).unwrap().unwrap();
        assert_eq!(back.latest_seen, T0 + 5 * DAY);
        assert_eq!(back.days_left(T0 + DAY), 9);
        assert!(back.active(T0 + DAY) && !back.active(T0 + LENGTH), "it still ends at 14 days");
    }
    #[test]
    fn a_clock_set_back_does_not_pause_the_trial_while_real_time_passes() {
        // Day 13, the clock set back 30 days, then a real day and a bit: the trial has ended (license.rs steady_now).
        let v = Mem::default();
        start(&v, true, false, T0).unwrap();
        let mut anchor = None;
        let r = crate::license::read(&v, T0 + 13 * DAY, 1_000, &mut anchor).unwrap();
        assert_eq!(r.trial.as_ref().unwrap().days_left(r.now), 1);
        let r = crate::license::read(&v, T0 - 17 * DAY, 1_000 + DAY + 60, &mut anchor).unwrap();
        assert!(!r.trial.as_ref().unwrap().active(r.now), "ended after 14 real days, whatever the clock says");
        assert_eq!(peek(&v).unwrap().unwrap().latest_seen, T0 + 14 * DAY + 60, "the later time is kept for the next launch");
    }
    #[test]
    fn the_latest_time_seen_is_written_at_most_once_an_hour() {
        let mut t = Trial { started_at: T0, latest_seen: T0 };
        assert!(!t.seen(T0 + 60));
        assert!(t.seen(T0 + SEEN_EVERY));
        assert!(!t.seen(T0), "an earlier clock is never written");
        assert_eq!(t.latest_seen, T0 + SEEN_EVERY);
    }
    #[test]
    fn the_item_is_the_apps_own_service_and_account() {
        assert_eq!(ACCOUNT, "pro-trial");
        let main = crate::main_src();
        assert!(main.contains("trial::start(&license::Keychain::new()"), "the trial lives under keystore::service()");
    }
}
