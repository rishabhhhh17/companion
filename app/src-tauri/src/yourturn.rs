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

/// Words that send, pay, delete, publish or leave, in English and the main languages of the apps people use (written
/// without accents: labels are folded the same way before they are compared).
const RISKY_WORDS: &[&str] = &["delet", "remov", "pay", "buy", "purchas", "send", "submit", "sign out", "log out", "logout", "publish", "deploy", "reset", "checkout", "order", "erase", "clear", "cancel", "unsubscribe", "subscribe", "post", "confirm", "donat", "upload", "install", "transfer", "withdraw", "go live", "make live", "promote", "rollback", "roll back", "merge", "drop", "destroy", "revoke", "archive", "close account",
    "trash", "discard", "accept", "approve", "share", "reply", "commit", "push", "leave", "book", "sign up", "register", "agree", "allow", "grant", "invite", "kick", "ban", "overwrite", "replace", "apply", "continue",
    // Spanish, French, German, Portuguese, Italian
    "eliminar", "borrar", "pagar", "comprar", "enviar", "publicar", "cerrar sesion", "confirmar", "desplegar", "supprimer", "effacer", "payer", "acheter", "envoyer", "publier", "deconnexion", "confirmer", "deployer",
    "loschen", "entfernen", "bezahlen", "kaufen", "senden", "veroffentlichen", "abmelden", "bestatigen", "excluir", "apagar", "sair", "elimina", "cancella", "paga", "acquista", "invia", "pubblica", "esci",
    // Japanese, Chinese, Korean
    "\u{524a}\u{9664}", "\u{652f}\u{6255}", "\u{8cfc}\u{5165}", "\u{9001}\u{4fe1}", "\u{516c}\u{958b}", "\u{30ed}\u{30b0}\u{30a2}\u{30a6}\u{30c8}", "\u{78ba}\u{8a8d}", "\u{5220}\u{9664}", "\u{652f}\u{4ed8}", "\u{8d2d}\u{4e70}", "\u{53d1}\u{9001}", "\u{53d1}\u{5e03}", "\u{9000}\u{51fa}", "\u{786e}\u{8ba4}", "\u{c0ad}\u{c81c}", "\u{acb0}\u{c81c}", "\u{ad6c}\u{b9e4}", "\u{c804}\u{c1a1}"];

/// A label as a person reads it, with the tricks taken out: invisible characters, accents, capitals, and letters of
/// another alphabet that look like Latin ones ("D\u{435}lete" with a Cyrillic e).
fn fold(label: &str) -> String {
    let mut out = String::with_capacity(label.len());
    for c in label.chars() {
        if matches!(c, '\u{ad}' | '\u{200b}'..='\u{200f}' | '\u{2060}' | '\u{feff}' | '\u{300}'..='\u{36f}') { continue; }
        for c in c.to_lowercase() {   // capitals first, so a Cyrillic capital O is handled like a small one
        let c = match c {
            '\u{430}' | '\u{3b1}' | '\u{e0}'..='\u{e5}' | '\u{c0}'..='\u{c5}' => 'a',
            '\u{435}' | '\u{3b5}' | '\u{e8}'..='\u{eb}' | '\u{c8}'..='\u{cb}' => 'e',
            '\u{43e}' | '\u{3bf}' | '\u{f2}'..='\u{f6}' | '\u{d2}'..='\u{d6}' => 'o',
            '\u{440}' | '\u{3c1}' => 'p', '\u{441}' | '\u{e7}' | '\u{c7}' => 'c', '\u{445}' => 'x', '\u{456}' | '\u{3b9}' | '\u{ec}'..='\u{ef}' | '\u{cc}'..='\u{cf}' => 'i',
            '\u{443}' | '\u{fd}' | '\u{ff}' => 'y', '\u{43a}' | '\u{3ba}' => 'k', '\u{43c}' => 'm', '\u{43d}' => 'h', '\u{442}' | '\u{3c4}' => 't', '\u{432}' | '\u{3bd}' => 'v',
            '\u{f1}' | '\u{d1}' => 'n', '\u{f9}'..='\u{fc}' | '\u{d9}'..='\u{dc}' => 'u',
            '\u{4cf}' | '\u{3b9}' | '\u{399}' | '\u{406}' | '\u{2160}' | '\u{ff4c}' => 'l',
            other => other,
        };
        out.push(c);
        }
    }
    skeleton(&out)
}
/// Letters, digits and signs that stand for one another in a disguise (l, I, 1 and | for an i or an l; 0 for o; 5 and $ for s;
/// 3 for e; 4 and @ for a) become one letter, so "Pub1ish" and "Publ1sh" and "P\u{430}y" read the same as the words they imitate.
/// The words in the list are folded the same way before they are compared.
fn skeleton(s: &str) -> String {
    s.chars().map(|c| match c { 'l' | '1' | '|' | '!' => 'i', '0' => 'o', '5' | '$' => 's', '3' => 'e', '4' | '@' => 'a', o => o }).collect()
}
fn compact(s: &str) -> String { s.chars().filter(|c| !c.is_whitespace() && !matches!(c, '-' | '_' | '.' | '\u{b7}')).collect() }

/// Labels that send, pay, delete or publish: "Do it for me" never presses these; the person clicks them (rule 13). Spaced
/// out, accented, mixed alphabet and other language spellings count too.
pub fn risky(label: &str) -> bool {
    let f = fold(label);
    let c = compact(&f);
    RISKY_WORDS.iter().any(|w| { let w = skeleton(w); f.contains(&w) || c.contains(&compact(&w)) })
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
    if words.iter().any(|t| risky(t)) || words.iter().any(|t| matches!(compact(&fold(t)).as_str(), "ok" | "yes" | "y" | "oui" | "si" | "ja" | "sim" | "\u{306f}\u{3044}" | "\u{597d}" | "\u{662f}" | "\u{c608}")) { return Err("risky"); }
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

#[cfg(test)]
mod attacks {
    use super::*;
    fn t(v: &[&str]) -> Vec<String> { v.iter().map(|s| s.to_string()).collect() }
    // Labels that mean "delete / pay / send / publish / sign out" in disguise or in other languages. None may be pressed.
    const RISKY: &[&str] = &[
        "D\u{435}lete", "Del\u{200b}ete", "D e l e t e", "DELETE", "d\u{435}l\u{435}t\u{435}", "Dele\u{301}te", "P\u{430}y now", "S\u{435}nd", "Pub\u{3b9}ish", "Pub1ish", "PubIish", "Pub|ish", "D3lete", "P@y", "S3nd", "D0n\u{430}te", "Cl\u{435}\u{430}r", "Remove\u{200d} member", "De\u{ad}lete",
        "Eliminar", "Borrar cuenta", "Pagar ahora", "Comprar", "Enviar", "Publicar", "Cerrar sesi\u{f3}n", "Confirmar", "Desplegar",
        "Supprimer", "Effacer", "Payer", "Acheter", "Envoyer", "Publier", "D\u{e9}connexion", "Confirmer", "D\u{e9}ployer",
        "L\u{f6}schen", "Loschen", "Entfernen", "Bezahlen", "Kaufen", "Senden", "Ver\u{f6}ffentlichen", "Abmelden", "Best\u{e4}tigen",
        "Excluir", "Apagar", "Sair", "Elimina", "Cancella", "Paga", "Acquista", "Invia", "Pubblica", "Esci",
        "\u{524a}\u{9664}", "\u{652f}\u{6255}\u{3046}", "\u{8cfc}\u{5165}", "\u{9001}\u{4fe1}", "\u{516c}\u{958b}", "\u{30ed}\u{30b0}\u{30a2}\u{30a6}\u{30c8}", "\u{78ba}\u{8a8d}",
        "\u{5220}\u{9664}", "\u{652f}\u{4ed8}", "\u{8d2d}\u{4e70}", "\u{53d1}\u{9001}", "\u{53d1}\u{5e03}", "\u{9000}\u{51fa}", "\u{786e}\u{8ba4}",
        "\u{c0ad}\u{c81c}", "\u{acb0}\u{c81c}", "\u{ad6c}\u{b9e4}", "\u{c804}\u{c1a1}",
    ];
    const SAFE: &[&str] = &["Settings", "New project", "Save changes", "Next", "Environment variables", "Privacy & Security", "Screen Recording", "Open settings", "Add to cart", "Search", "Home", "Back", "Show details", "Ajustes", "Param\u{e8}tres", "Einstellungen", "\u{8a2d}\u{5b9a}", "\u{8bbe}\u{7f6e}"];

    #[test]
    fn risky_labels_in_disguise_or_in_other_languages_are_never_pressed() {
        for l in RISKY { assert!(risky(l), "{l:?} must count as risky"); assert_eq!(may_press("AXButton", &t(&[l]), false, false), Err("risky"), "{l:?}"); }
    }
    #[test]
    fn a_bare_yes_or_ok_is_never_pressed_whatever_the_spelling_or_language() {
        for l in ["OK", "\u{41e}\u{43a}", "O K", "Yes", "Y", "Oui", "Ja", "Sim", "\u{306f}\u{3044}", "\u{597d}"] { assert_eq!(may_press("AXButton", &t(&[l]), false, false), Err("risky"), "{l:?}"); }
    }
    #[test]
    fn ordinary_labels_are_still_pressable() {
        for l in SAFE { assert_eq!(may_press("AXButton", &t(&[l]), false, false), Ok(()), "{l:?} must stay pressable"); }
    }
}
