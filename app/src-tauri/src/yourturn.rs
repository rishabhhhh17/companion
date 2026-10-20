//! Your turn: the pointer shows where to click and waits for the person to click it themselves.
//! Noticing the click needs no permission: while the ring is up (and only then), Companion reads the two things any app
//! may read, where the mouse is and whether a button is down, about 60 times a second. It never reads keys, never
//! reads what is on screen, and stops the moment the click comes or the ring goes away.
use crate::coords::{Pt, R};

pub const POLL_MS: u64 = 16;
/// How long a your turn ring waits for the click unless changed (point.yourTurnSeconds in Settings, 30 to 300 seconds).
/// The mouse is read only while the ring is up, so this is also the longest it is read for one ring.
pub const WAIT_MS: u64 = 90_000;
/// The wait from the setting's value; anything its rules refuse is the usual 90 seconds.
pub fn wait_ms(v: &serde_json::Value) -> u64 {
    crate::settings::registry().get("point.yourTurnSeconds").and_then(|d| crate::settings::validate(d, v).ok()).and_then(|n| n.as_f64()).map(|s| (s * 1000.0).round() as u64).unwrap_or(WAIT_MS)
}
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

/// Words that send, pay, delete, publish, leave, sign in or connect an account, in English and the main languages of the apps people use (written
/// without accents: labels are folded the same way before they are compared).
const RISKY_WORDS: &[&str] = &["delet", "remov", "pay", "buy", "purchas", "send", "submit", "sign out", "log out", "logout", "publish", "deploy", "reset", "checkout", "order", "erase", "clear", "cancel", "unsubscribe", "subscribe", "post", "confirm", "donat", "upload", "install", "transfer", "withdraw", "go live", "make live", "promote", "rollback", "roll back", "merge", "drop", "destroy", "revoke", "archive", "close account",
    "trash", "discard", "accept", "approve", "share", "reply", "commit", "push", "leave", "book", "sign up", "register", "agree", "allow", "grant", "invite", "kick", "ban", "overwrite", "replace", "apply", "continue",
    // Connecting an account (reconnect and disconnect too): the person's own step, in any app. Signing in is below.
    "connect", "authoriz", "authoris",
    // Spanish, French, German, Portuguese, Italian
    "eliminar", "borrar", "pagar", "comprar", "enviar", "publicar", "cerrar sesion", "confirmar", "desplegar", "supprimer", "effacer", "payer", "acheter", "envoyer", "publier", "deconnexion", "confirmer", "deployer",
    "loschen", "entfernen", "bezahlen", "kaufen", "senden", "veroffentlichen", "abmelden", "bestatigen", "excluir", "apagar", "sair", "elimina", "cancella", "paga", "acquista", "invia", "pubblica", "esci",
    // Japanese, Chinese, Korean
    "\u{524a}\u{9664}", "\u{652f}\u{6255}", "\u{8cfc}\u{5165}", "\u{9001}\u{4fe1}", "\u{516c}\u{958b}", "\u{30ed}\u{30b0}\u{30a2}\u{30a6}\u{30c8}", "\u{78ba}\u{8a8d}", "\u{5220}\u{9664}", "\u{652f}\u{4ed8}", "\u{8d2d}\u{4e70}", "\u{53d1}\u{9001}", "\u{53d1}\u{5e03}", "\u{9000}\u{51fa}", "\u{786e}\u{8ba4}", "\u{c0ad}\u{c81c}", "\u{acb0}\u{c81c}", "\u{ad6c}\u{b9e4}", "\u{c804}\u{c1a1}",
    // Signing in sends what was typed (a password); a free trial signs up to pay later (20 Oct 2026: with the everyday tutor a
    // ring can land on a site's sign in page, the App Store or the TV app). Rent and "trial" are whole words, below.
    "sign in", "signin", "log in", "login", "try free", "try it free", "try for free", "start free",
    "iniciar sesion", "acceder", "se connecter", "connexion", "anmelden", "einloggen", "entrar", "iniciar sessao", "accedi",
    "alquilar", "louer", "mieten", "leihen", "alugar", "noleggia", "prueba gratis", "essai gratuit", "kostenlos testen", "teste gratis", "prova gratis",
    "\u{30ed}\u{30b0}\u{30a4}\u{30f3}", "\u{30b5}\u{30a4}\u{30f3}\u{30a4}\u{30f3}", "\u{767b}\u{5f55}", "\u{767b}\u{5165}", "\u{b85c}\u{adf8}\u{c778}",
    "\u{30ec}\u{30f3}\u{30bf}\u{30eb}", "\u{79df}", "\u{b300}\u{c5ec}", "\u{7121}\u{6599}\u{4f53}\u{9a13}", "\u{8bd5}\u{7528}", "\u{8a66}\u{7528}", "\u{bb34}\u{b8cc} \u{ccb4}\u{d5d8}"];
/// Short words that are risky only as a whole word, since other words hold the same letters ("Current", "Industrial").
const RISKY_WHOLE_WORDS: &[&str] = &["rent", "trial"];
/// A button whose whole label is one of these installs an app (the App Store's Get, in the main languages). "Get Info"
/// and "Get started" stay pressable.
const INSTALL_LABELS: &[&str] = &["get", "obtener", "obtenir", "laden", "obter", "ottieni", "\u{5165}\u{624b}", "\u{83b7}\u{53d6}", "\u{bc1b}\u{ae30}"];
/// Currency signs, and currency codes as words: next to a number they make a price, and a price pays.
const CURRENCY_SIGNS: &[char] = &['$', '\u{20ac}', '\u{a3}', '\u{a5}', '\u{20b9}', '\u{20a9}', '\u{20bd}', '\u{20ba}', '\u{20aa}', '\u{e3f}', '\u{20ab}', '\u{20b1}', '\u{a2}', '\u{ff04}', '\u{ffe5}', '\u{ffe1}', '\u{5186}', '\u{5143}'];
const CURRENCY_CODES: &[&str] = &["usd", "eur", "gbp", "jpy", "inr", "cad", "aud", "nzd", "chf", "cny", "rmb", "hkd", "sgd", "sek", "nok", "dkk", "pln", "brl", "mxn", "krw", "rub", "zar", "kr", "rs"];

/// A price shown on the label: a currency sign or code right next to a number ("$4.99", "4,99 \u{20ac}", "USD 9.99", "500\u{5186}").
/// Read before the label is folded, which turns "$" into "s".
fn priced(label: &str) -> bool {
    let s: String = label.chars().filter(|c| !matches!(c, '\u{ad}' | '\u{200b}'..='\u{200f}' | '\u{2060}' | '\u{feff}')).flat_map(|c| c.to_lowercase()).collect();
    let digit = |c: char| c.is_ascii_digit() || ('\u{ff10}'..='\u{ff19}').contains(&c);
    let chars: Vec<char> = s.chars().collect();
    for (i, &c) in chars.iter().enumerate() {
        if !CURRENCY_SIGNS.contains(&c) { continue; }
        let before = chars[..i].iter().rev().find(|c| !c.is_whitespace()).copied();
        let after = chars[i + 1..].iter().find(|c| !c.is_whitespace()).copied();
        if before.is_some_and(digit) || after.is_some_and(digit) { return true; }
    }
    // Runs of letters and runs of digits, in order: a code run next to a number run is a price.
    let mut runs: Vec<(bool, String)> = Vec::new();
    let mut prev: Option<bool> = None;
    for c in chars {
        let kind = if digit(c) { Some(true) } else if c.is_alphabetic() { Some(false) } else if matches!(c, '.' | ',') && prev == Some(true) { Some(true) } else { None };
        match (kind, runs.last_mut()) {
            (Some(k), Some(r)) if prev == Some(k) && r.0 == k => r.1.push(c),
            (Some(k), _) => runs.push((k, c.to_string())),
            (None, _) => {}
        }
        prev = kind;
    }
    runs.iter().enumerate().any(|(i, (num, w))| !num && CURRENCY_CODES.contains(&w.as_str()) && ((i > 0 && runs[i - 1].0) || runs.get(i + 1).is_some_and(|r| r.0)))
}

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
            '\u{4cf}' | '\u{2160}' | '\u{2170}' | '\u{ff4c}' | '\u{ff49}' => 'l',
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

/// Labels that send, pay, delete, publish, sign in or connect an account: "Do it for me" never presses these; the person
/// clicks them (rule 13). Spaced out, accented, mixed alphabet and other language spellings count too.
pub fn risky(label: &str) -> bool {
    let f = fold(label);
    let c = compact(&f);
    RISKY_WORDS.iter().any(|w| { let w = skeleton(w); f.contains(&w) || c.contains(&compact(&w)) })
        || RISKY_WHOLE_WORDS.iter().any(|w| { let w = skeleton(w); c == w || f.split(|ch: char| !ch.is_alphanumeric()).any(|t| t == w) })
        || priced(label)
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
    if words.iter().any(|t| { let c = compact(&fold(t)); INSTALL_LABELS.iter().any(|w| c == compact(&skeleton(w))) }) { return Err("risky"); }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn a_your_turn_ring_waits_as_long_as_the_setting_says_and_ninety_seconds_unless_changed() {
        // point.yourTurnSeconds: 30 to 300 seconds in steps of 15, usual 90 (today). The mouse is read only while the ring
        // is up, so this is also how long the mouse may be read for one ring.
        assert_eq!(WAIT_MS, 90_000);
        assert_eq!(wait_ms(&serde_json::json!(90)), 90_000);
        assert_eq!(wait_ms(&serde_json::json!(30)), 30_000);
        assert_eq!(wait_ms(&serde_json::json!(300)), 300_000);
        assert_eq!(wait_ms(&serde_json::json!(100)), 105_000, "on its step");
        for odd in [serde_json::json!(15), serde_json::json!(301), serde_json::json!(86_400), serde_json::json!("90"), serde_json::json!(null)] {
            assert_eq!(wait_ms(&odd), WAIT_MS, "{odd}");
        }
        let main = include_str!("main.rs");
        let f = &main[main.find("fn your_turn(").unwrap()..];
        let f = &f[..f.find("\n}\n").unwrap()];
        assert!(f.contains("yourturn::wait_ms(&setting_now(\"point.yourTurnSeconds\"))"), "read when the ring goes up");
        assert!(f.contains("t0.elapsed().as_millis() < wait as u128"), "and the loop that reads the mouse ends then");
    }
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
    #[test]
    fn do_it_for_me_never_signs_in_rents_starts_a_trial_or_presses_a_price() {
        // With the everyday tutor a your turn ring can land in Mail, the App Store, the TV app or any web page, where Sign In
        // sends a typed password, Rent and a price pay, and a free trial signs up to pay later (rule 13).
        let t = |v: &[&str]| v.iter().map(|s| s.to_string()).collect::<Vec<_>>();
        for l in ["Sign In", "Sign in", "Log In", "Log in", "Login", "LOGIN", "Signin", "Sign in with Apple", "Log in with Google", "Rent", "Rent $3.99", "Rent HD", "R3nt",
            "$4.99", "\u{20ac}4,99", "4,99 \u{20ac}", "\u{a3}12", "USD 9.99", "9.99 usd", "usd9.99", "\u{a5}500", "500\u{5186}", "R$ 10", "Buy for \u{20b9}499",
            "Start Free Trial", "Free trial", "Try It Free", "Try for free", "Try free", "Start free"] {
            assert!(risky(l), "{l:?} must count as risky");
            assert_eq!(may_press("AXButton", &t(&[l]), false, false), Err("risky"), "{l:?}");
        }
        // The words inside a button with a plain title count too: a price under "Movie".
        assert_eq!(may_press("AXButton", &t(&["Movie", "$3.99"]), false, false), Err("risky"));
        // A bare Get installs an app (the App Store): never pressed. Get Info and Get started stay pressable.
        for l in ["Get", "GET", "Obtener", "Laden", "\u{5165}\u{624b}", "\u{83b7}\u{53d6}", "\u{bc1b}\u{ae30}"] { assert_eq!(may_press("AXButton", &t(&[l]), false, false), Err("risky"), "{l:?}"); }
        // Not a sign in, a rental, a trial or a price: the same letters inside other words, and numbers with no currency.
        for l in ["Get Info", "Get started", "Current plan", "Parent folder", "Different view", "Transparent", "Industrial", "Tutorial", "Page 2", "2 items", "Version 2.5",
            "Players 2", "Top 10", "Rentals", "Show 25 per page", "Zoom 100%"] {
            assert!(!risky(l), "{l:?} must stay pressable");
            assert_eq!(may_press("AXButton", &t(&[l]), false, false), Ok(()), "{l:?}");
        }
    }
    #[test]
    fn the_words_when_it_will_not_press_say_signing_in_too() {
        let main = include_str!("main.rs");
        let at = main.find("const SELF: &str = ").expect("the message is in main.rs");
        let line = &main[at..at + main[at..].find('\n').unwrap()];
        assert!(line.contains("signs in"), "{line}");
        for w in ["sends", "pays", "deletes", "publishes", "answers a question"] { assert!(line.contains(w), "{line}"); }
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
        // Sign in, rent and a free trial, in the same languages.
        "Iniciar sesi\u{f3}n", "Acceder", "Se connecter", "Connexion", "Anmelden", "Einloggen", "Entrar", "Iniciar sess\u{e3}o", "Accedi",
        "Alquilar", "Louer", "Mieten", "Leihen", "Alugar", "Noleggia", "Prueba gratis", "Essai gratuit", "Kostenlos testen", "Teste gr\u{e1}tis", "Prova gratis",
        "\u{30ed}\u{30b0}\u{30a4}\u{30f3}", "\u{30b5}\u{30a4}\u{30f3}\u{30a4}\u{30f3}", "\u{767b}\u{5f55}", "\u{767b}\u{5165}", "\u{b85c}\u{adf8}\u{c778}",
        "\u{30ec}\u{30f3}\u{30bf}\u{30eb}", "\u{79df}\u{501f}", "\u{b300}\u{c5ec}", "\u{7121}\u{6599}\u{4f53}\u{9a13}", "\u{514d}\u{8d39}\u{8bd5}\u{7528}", "\u{bb34}\u{b8cc} \u{ccb4}\u{d5d8}",
        // In disguise.
        "S\u{456}gn in", "Log\u{200b}in", "L0g in", "\u{24}4.99",
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
    fn signing_in_or_connecting_an_account_is_never_pressed_for_the_person() {
        // The everyday look offers Do it for me in any app (Mail, Zapier, Notion, System Settings): a sign in or a
        // reconnect is the person's own step (rule 13), whatever a prompt says (rule 12).
        for l in ["Sign in", "Sign In", "Signin", "Sign in with Google", "Log in", "Login", "Log In", "Connect", "Reconnect", "Reconnect account", "Disconnect", "Connect Gmail", "Authorize", "Authorise Zapier", "Re-authorize"] {
            assert!(risky(l), "{l:?} must count as risky");
            assert_eq!(may_press("AXButton", &t(&[l]), false, false), Err("risky"), "{l:?}");
        }
    }
    #[test]
    fn ordinary_labels_are_still_pressable() {
        for l in SAFE { assert_eq!(may_press("AXButton", &t(&[l]), false, false), Ok(()), "{l:?} must stay pressable"); }
    }
}
