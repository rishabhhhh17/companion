//! Every Companion hotkey, and the keys the person picked for each (M11 wave 4, building on hold to talk, F18 item 3).
//!
//! One map from each job to its keys: open the ask box, Point at the problem, Show me how, Prompt help (read, and use a
//! suggestion while one shows), the error explainer, Second Look, hold to talk and Stop everything. Every one is a chord, one or more
//! modifiers held with one key, registered through the global shortcut plugin: the Mac's hot key service reports it, so
//! nothing reads key events and nothing asks for Input Monitoring (rule 8). A modifier alone, a double tap or the Fn key
//! are not possible, and no list here has one.
//!
//! F28: only four jobs have keys by usual: Point at the problem (Fix it), hold to talk, Prompt help and Stop everything,
//! plus use a suggestion, which works only while a Prompt help suggestion shows. The other five (open Home, Show me how,
//! explain an error, Second Look, type by voice) keep their own suggested keys (`SUGGESTED`, first on their list) and have
//! no keys until the person picks some in Settings. An install from before F28 keeps every key the person picked; only a
//! job still on its old usual keys loses them, and Settings says so once, calmly (`dropped_by_new_usual`).
//!
//! Each job also has a short list a person can pick from in Settings:
//! a letter job its own letter with Shift added, or one of a few spare letters no job uses by default, all with Control,
//! Option and Command; hold to talk its own two key list (talkkeys.rs). No two jobs may share keys. The spare letters sit
//! in the same place on QWERTY, QWERTZ and AZERTY keyboards (the hot key service names a key by its place, not its label).
//!
//! What the person picked is kept on this Mac (`keys.json` in Companion's folder; delete everything removes it), and only
//! what differs from the usual keys, so a job they never changed keeps Companion's own. The file is checked when it is
//! read: an entry that is not on its job's list, or two jobs on the same keys, go back to the usual keys, and the person is
//! told once (the repaired file is written back). Before every key could be changed only hold to talk was kept, in
//! `talk-keys.json`; that choice is read when there is no `keys.json` yet, and the old file goes once a new one is saved.
//!
//! At launch each job's keys are tried, then its usual ones; nothing else is taken without the person asking. Stop
//! everything is tried the same way and, if both fail, the launch notice says so first and points to the menu bar icon,
//! which can always stop everything (rule 11). A change in Settings registers the new keys before the old ones are let go
//! and saves them only once they work; keys that fail leave everything as it was, so Stop everything always keeps a
//! working chord once it has one. Use a suggestion is registered only while a Prompt help result shows (with Esc, which
//! is not on any list), so at launch and in Settings its keys are only tried and let go again (`keep_registered`). Each
//! result tries them again, and keys another app held at launch work from the first result after it lets go (`arm`).
//! main.rs only calls these rules; a test checks that it does.
//!
//! Settings shows a chord as taken when macOS refuses it, which happens only when another app asked for the keys alone
//! (talkkeys.rs and T13 say what that means for Option and Space).

use serde_json::{json, Value};
use tauri_plugin_global_shortcut::{Code, Modifiers, Shortcut};

pub const CONTROL: u8 = 1;
pub const OPTION: u8 = 2;
pub const SHIFT: u8 = 4;
pub const COMMAND: u8 = 8;
/// Control, Option and Command: the letter jobs' modifiers, as they always were.
pub const LETTER: u8 = CONTROL | OPTION | COMMAND;

/// The modifiers in the order a Mac names them, each with its id (the page and the saved file use it), the word a person
/// reads and the plugin's flag. The page names them with the same words (strings.ts keyWords); hotkeys.test.ts checks.
const MODS: [(u8, &str, &str, Modifiers); 4] = [
    (CONTROL, "control", "Control", Modifiers::CONTROL),
    (OPTION, "option", "Option", Modifiers::ALT),
    (SHIFT, "shift", "Shift", Modifiers::SHIFT),
    (COMMAND, "command", "Command", Modifiers::SUPER),
];

/// The keys a chord can end with: the letters and digits (the same place on QWERTY, QWERTZ and AZERTY keyboards: the hot key
/// service names a key by its place, not its label), Space, and Return for hold to talk's list. A job's usual and preset keys use a
/// few of them; any of them may be picked in Settings (`custom_ok`).
#[derive(Clone, Copy, Debug, PartialEq, Eq, Hash)]
pub enum Key { A, B, C, D, E, F, G, H, I, J, K, L, M, N, O, P, Q, R, S, T, U, V, W, X, Y, Z, N0, N1, N2, N3, N4, N5, N6, N7, N8, N9, Space, Return }
/// Each key, in the order of `Key`, with the plugin's code, its id and the word a person reads.
const KEYS: [(Key, Code, &str, &str); 38] = [
    (Key::A, Code::KeyA, "a", "A"),
    (Key::B, Code::KeyB, "b", "B"),
    (Key::C, Code::KeyC, "c", "C"),
    (Key::D, Code::KeyD, "d", "D"),
    (Key::E, Code::KeyE, "e", "E"),
    (Key::F, Code::KeyF, "f", "F"),
    (Key::G, Code::KeyG, "g", "G"),
    (Key::H, Code::KeyH, "h", "H"),
    (Key::I, Code::KeyI, "i", "I"),
    (Key::J, Code::KeyJ, "j", "J"),
    (Key::K, Code::KeyK, "k", "K"),
    (Key::L, Code::KeyL, "l", "L"),
    (Key::M, Code::KeyM, "m", "M"),
    (Key::N, Code::KeyN, "n", "N"),
    (Key::O, Code::KeyO, "o", "O"),
    (Key::P, Code::KeyP, "p", "P"),
    (Key::Q, Code::KeyQ, "q", "Q"),
    (Key::R, Code::KeyR, "r", "R"),
    (Key::S, Code::KeyS, "s", "S"),
    (Key::T, Code::KeyT, "t", "T"),
    (Key::U, Code::KeyU, "u", "U"),
    (Key::V, Code::KeyV, "v", "V"),
    (Key::W, Code::KeyW, "w", "W"),
    (Key::X, Code::KeyX, "x", "X"),
    (Key::Y, Code::KeyY, "y", "Y"),
    (Key::Z, Code::KeyZ, "z", "Z"),
    (Key::N0, Code::Digit0, "0", "0"),
    (Key::N1, Code::Digit1, "1", "1"),
    (Key::N2, Code::Digit2, "2", "2"),
    (Key::N3, Code::Digit3, "3", "3"),
    (Key::N4, Code::Digit4, "4", "4"),
    (Key::N5, Code::Digit5, "5", "5"),
    (Key::N6, Code::Digit6, "6", "6"),
    (Key::N7, Code::Digit7, "7", "7"),
    (Key::N8, Code::Digit8, "8", "8"),
    (Key::N9, Code::Digit9, "9", "9"),
    (Key::Space, Code::Space, "space", "Space"), (Key::Return, Code::Enter, "return", "Return"),
];

/// One or more modifiers held with one key.
#[derive(Clone, Copy, Debug, PartialEq, Eq, Hash)]
pub struct Chord { pub mods: u8, pub key: Key }
impl Chord { pub const fn new(mods: u8, key: Key) -> Chord { Chord { mods, key } } }

/// "control-option-command-k": the modifiers in the Mac's order, then the key. The page and the saved file use it.
pub fn id(c: Chord) -> String {
    let mut parts: Vec<&str> = MODS.iter().filter(|m| c.mods & m.0 != 0).map(|m| m.1).collect();
    parts.push(KEYS[c.key as usize].2);
    parts.join("-")
}
/// Reads an id back, only in exactly the form `id` writes, with at least one modifier.
pub fn from_id(s: &str) -> Option<Chord> {
    let (mods_part, key_part) = s.rsplit_once('-')?;
    let key = KEYS.iter().find(|k| k.2 == key_part)?.0;
    let mut mods = 0u8;
    for p in mods_part.split('-') {
        let m = MODS.iter().find(|m| m.1 == p)?.0;
        if mods & m != 0 { return None; }
        mods |= m;
    }
    let c = Chord::new(mods, key);
    (mods != 0 && id(c) == s).then_some(c)
}
/// "Control, Option, Command and K", "Option and Space": how every line names a chord.
pub fn label(c: Chord) -> String {
    let m: Vec<&str> = MODS.iter().filter(|m| c.mods & m.0 != 0).map(|m| m.2).collect();
    format!("{} and {}", m.join(", "), KEYS[c.key as usize].3)
}
/// The global shortcut for a chord.
pub fn shortcut(c: Chord) -> Shortcut {
    let m = MODS.iter().filter(|m| c.mods & m.0 != 0).fold(Modifiers::empty(), |a, m| a | m.3);
    Shortcut::new(Some(m), KEYS[c.key as usize].1)
}

/// A chord as one number, so the hotkey handler can read each job's keys without a lock. `NONE`: no keys.
pub const NONE: u32 = u32::MAX;
pub fn encode(c: Chord) -> u32 { ((c.mods as u32) << 8) | c.key as u32 }
pub fn decode(v: u32) -> Option<Chord> {
    if v == NONE || v >> 12 != 0 { return None; }
    let mods = (v >> 8) as u8;
    let key = KEYS.get((v & 0xff) as usize)?.0;
    (mods != 0).then_some(Chord::new(mods, key))
}

/// Each job that has keys, in the order Settings shows them.
#[derive(Clone, Copy, Debug, PartialEq, Eq, Hash)]
pub enum Action { Card, Problem, ShowMe, Read, Accept, Explain, SecondLook, Talk, Dictate, Stop }
pub const N: usize = 10;
pub const ACTIONS: [Action; N] = [Action::Card, Action::Problem, Action::ShowMe, Action::Read, Action::Accept, Action::Explain, Action::SecondLook, Action::Talk, Action::Dictate, Action::Stop];
impl Action {
    pub fn index(self) -> usize { self as usize }
    /// The id the page and the saved file use.
    pub fn id(self) -> &'static str {
        match self {
            Action::Card => "card", Action::Problem => "problem", Action::ShowMe => "showme", Action::Read => "read",
            Action::Accept => "accept", Action::Explain => "explain", Action::SecondLook => "secondlook", Action::Talk => "talk", Action::Dictate => "dictate", Action::Stop => "stop",
        }
    }
    pub fn from_id(s: &str) -> Option<Action> { ACTIONS.into_iter().find(|a| a.id() == s) }
    /// How the launch notice names the job.
    pub fn job(self) -> &'static str {
        match self {
            Action::Card => "open the ask box", Action::Problem => "point at the problem", Action::ShowMe => "Show me how",
            Action::Read => "Prompt help", Action::Accept => "use a Prompt help suggestion", Action::Explain => "explain an error",
            Action::SecondLook => "Second Look", Action::Talk => "hold to talk", Action::Dictate => "type by voice", Action::Stop => "stop everything",
        }
    }
    /// Registered only while a Prompt help result shows (with Esc), never at launch; elsewhere its keys are only tried.
    pub fn armed_only(self) -> bool { self == Action::Accept }
}

/// Each job's own suggested keys, the ones Companion always had: first on its list, and the usual keys of the jobs that
/// have keys by usual. hotkeys.test.ts reads this table and checks every hint against it.
pub const SUGGESTED: [(Action, Chord); N] = [
    (Action::Card, Chord::new(CONTROL | OPTION | COMMAND, Key::K)),
    (Action::Problem, Chord::new(CONTROL | OPTION | COMMAND, Key::F)),
    (Action::ShowMe, Chord::new(CONTROL | OPTION | COMMAND, Key::S)),
    (Action::Read, Chord::new(CONTROL | OPTION | COMMAND, Key::R)),
    (Action::Accept, Chord::new(CONTROL | OPTION | COMMAND, Key::A)),
    (Action::Explain, Chord::new(CONTROL | OPTION | COMMAND, Key::E)),
    // Second Look (M14), added 22 Oct 2026: C for check, in the same place on QWERTY, QWERTZ and AZERTY keyboards.
    (Action::SecondLook, Chord::new(CONTROL | OPTION | COMMAND, Key::C)),
    (Action::Talk, Chord::new(OPTION, Key::Space)),
    // Type by voice into any app (M36, F26), held like hold to talk.
    (Action::Dictate, Chord::new(OPTION | SHIFT, Key::Space)),
    (Action::Stop, Chord::new(CONTROL | OPTION | COMMAND, Key::X)),
];
pub const fn suggested(a: Action) -> Chord { SUGGESTED[a as usize].1 }
/// F28: the jobs that have keys by usual. Every other job has none until the person picks some.
pub const USUAL: [Action; 5] = [Action::Problem, Action::Read, Action::Accept, Action::Talk, Action::Stop];
const fn has_usual(a: Action) -> bool { let mut i = 0; while i < USUAL.len() { if USUAL[i] as usize == a as usize { return true; } i += 1; } false }
/// Each job's usual keys: its suggested keys for the four jobs of F28 and use a suggestion, none for the others.
pub const DEFAULTS: [(Action, Option<Chord>); N] = {
    let mut t = [(Action::Card, None); N];
    let mut i = 0;
    while i < N { let a = SUGGESTED[i].0; t[i] = (a, if has_usual(a) { Some(SUGGESTED[i].1) } else { None }); i += 1; }
    t
};
pub fn default(a: Action) -> Option<Chord> { DEFAULTS[a.index()].1 }

/// The spare letters every letter job may pick, none of them a job's usual letter. Each is in the same place on QWERTY,
/// QWERTZ and AZERTY keyboards.
pub const SPARE: [Key; 6] = [Key::I, Key::J, Key::L, Key::O, Key::P, Key::U];

/// The short list a job's keys can be picked from, its suggested keys first. Hold to talk's own list is in talkkeys.rs.
pub fn choices(a: Action) -> Vec<Chord> {
    if a == Action::Talk { return crate::talkkeys::CHOICES.to_vec(); }
    if a == Action::Dictate { return crate::talkkeys::DICTATE_CHOICES.to_vec(); }
    let d = suggested(a);
    let mut v = vec![d, Chord::new(d.mods | SHIFT, d.key)];
    v.extend(SPARE.iter().map(|k| Chord::new(LETTER, *k)));
    v
}

/// Chords the Mac itself uses, which a picked chord may never be (a global shortcut could take them from the system, or the
/// system could keep them): screenshots, log out, lock the screen, hide the Dock, the emoji picker and Finder search.
const MAC_OWN: [Chord; 8] = [
    Chord::new(COMMAND | SHIFT, Key::N3), Chord::new(COMMAND | SHIFT, Key::N4), Chord::new(COMMAND | SHIFT, Key::N5),
    Chord::new(COMMAND | SHIFT, Key::Q), Chord::new(CONTROL | COMMAND, Key::Q), Chord::new(COMMAND | OPTION, Key::D),
    Chord::new(CONTROL | COMMAND, Key::Space), Chord::new(COMMAND | OPTION, Key::Space),
];
/// Why a chord picked in Settings, one that is not on the job's short list, cannot be used. None when it can. Always checked
/// here, never taken from the page: at least two modifiers, one of them Control or Command (Option and Shift alone type
/// characters, and one modifier is typed or taken by other apps all the time), and none of the Mac's own shortcuts. Nothing
/// here reads a key press: the person ticks the modifiers and chooses the key from a list (rule 8).
pub fn why_not(c: Chord) -> Option<NotChanged> {
    if c.mods.count_ones() < 2 || c.mods & (CONTROL | COMMAND) == 0 { Some(NotChanged::NotEnoughKeys) }
    else if MAC_OWN.contains(&c) { Some(NotChanged::Reserved) }
    else { None }
}
pub fn custom_ok(c: Chord) -> bool { why_not(c).is_none() }
/// May this chord be a job's keys: on its short list, or one the person picked that passes `why_not`.
pub fn allowed(a: Action, c: Chord) -> bool { choices(a).contains(&c) || custom_ok(c) }

/// The keys every job is to use, in the order of `ACTIONS`: none for a job with no keys (F28: not picked yet).
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct Map(pub [Option<Chord>; N]);
impl Map {
    pub const DEFAULT: Map = { let mut m = [None; N]; let mut i = 0; while i < N { m[i] = DEFAULTS[i].1; i += 1; } Map(m) };
    /// Every job on its own suggested keys: the usual keys from before F28.
    pub const EVERY: Map = { let mut m = [None; N]; let mut i = 0; while i < N { m[i] = Some(SUGGESTED[i].1); i += 1; } Map(m) };
    pub fn get(&self, a: Action) -> Option<Chord> { self.0[a.index()] }
    pub fn with(mut self, a: Action, c: Chord) -> Map { self.0[a.index()] = Some(c); self }
    pub fn without(mut self, a: Action) -> Map { self.0[a.index()] = None; self }
}
/// What each job uses right now (registered, or for use a suggestion, armed while a result shows), none when another app
/// holds its keys.
pub type Using = [Option<Chord>; N];

/// Whether a job's keys stay registered once they work: always, except use a suggestion while no Prompt help result
/// shows (`armed` is whether one shows with its keys taken). T11: those keys are taken from other apps only for a result.
pub fn keep_registered(a: Action, armed: bool) -> bool { !a.armed_only() || armed }
/// What is registered for a job right now: the keys it uses, but use a suggestion's only while a result shows.
pub fn registered(a: Action, using: Option<Chord>, armed: bool) -> Option<Chord> { using.filter(|_| keep_registered(a, armed)) }
/// Every other job's keys, in use and picked (they differ after a fall back): Companion's own, so never offered to `a`,
/// never touched for it, and never saved for it (two jobs on the same keys would be a damaged file at the next launch).
pub fn others(a: Action, using: &Using, picked: &Map) -> Vec<(Action, Chord)> {
    ACTIONS.into_iter().filter(|b| *b != a).flat_map(|b| [using[b.index()], picked.get(b)].into_iter().flatten().map(move |c| (b, c))).collect()
}

/// Every job whose keys another job also has.
pub fn clashes(m: &Map) -> Vec<Action> {
    ACTIONS.into_iter().filter(|a| m.get(*a).is_some() && ACTIONS.iter().any(|b| b != a && m.get(*b) == m.get(*a))).collect()
}

/// The file, in Companion's own folder.
pub const FILE: &str = "keys.json";
/// Where hold to talk's keys were kept before every key could be changed.
pub const OLD_TALK_FILE: &str = "talk-keys.json";

/// What was read: the keys to use, and whether the file was damaged (the person is then told once, at launch).
pub fn parse(text: Option<&str>, old_talk: Option<&str>) -> (Map, bool) {
    let on_list = |a: Action, v: Option<&Value>| v.and_then(Value::as_str).and_then(from_id).filter(|c| choices(a).contains(c));
    // A job's entry: keys on its list or picked within the rules, or null for no keys at all (never Stop everything's).
    let picked_ok = |a: Action, v: Option<&Value>| -> Option<Option<Chord>> {
        match v {
            Some(Value::Null) if a != Action::Stop => Some(None),
            // Never another job's own suggested keys (as Change refuses them): each job can always be given its own.
            _ => v.and_then(Value::as_str).and_then(from_id).filter(|c| allowed(a, *c) && !SUGGESTED.iter().any(|(b, d)| *b != a && d == c)).map(Some),
        }
    };
    let Some(text) = text else {
        // Nothing saved yet: hold to talk's keys from before, if they were picked. That file never said anything when it
        // could not be read, and still does not.
        let old: Option<Value> = old_talk.and_then(|t| serde_json::from_str(t).ok());
        let talk = on_list(Action::Talk, old.as_ref().and_then(|v| v.get("holdToTalk")));
        return (talk.map_or(Map::DEFAULT, |c| Map::DEFAULT.with(Action::Talk, c)), false);
    };
    let v: Value = match serde_json::from_str(text) { Ok(v) => v, Err(_) => return (Map::DEFAULT, true) };
    let Some(keys) = v.get("keys").and_then(Value::as_object) else { return (Map::DEFAULT, true) };
    let (mut m, mut damaged) = (Map::DEFAULT, false);
    // A job this version does not know (a newer Companion's) is left alone.
    for a in ACTIONS {
        let Some(entry) = keys.get(a.id()) else { continue };
        match picked_ok(a, Some(entry)) { Some(c) => m.0[a.index()] = c, None => damaged = true }
    }
    // No two jobs on the same keys: each goes back to its own (no job's usual keys are on another job's list, tested).
    let clash = clashes(&m);
    if !clash.is_empty() {
        damaged = true;
        for a in clash { m.0[a.index()] = default(a); }
        if !clashes(&m).is_empty() { return (Map::DEFAULT, true); }
    }
    (m, damaged)
}
/// The saved file as `parse` takes it, from reading it off the disk. Only a missing file is nothing saved: one that is
/// there but cannot be opened, or holds bytes that are not text, is damaged (empty text), so the person is told and hold
/// to talk's old file is not read in its place. (Told once when the repaired file can be written back; a file that cannot
/// be opened most likely cannot be written either, and then each launch says so, which is true.)
pub fn saved_text(r: std::io::Result<Vec<u8>>) -> Option<String> {
    match r {
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => None,
        Err(_) => Some(String::new()),
        Ok(b) => Some(String::from_utf8(b).unwrap_or_default()),
    }
}
/// What is written: only the jobs whose keys differ from the usual ones (null for a job whose usual keys were taken away).
pub fn to_json(m: &Map) -> Value {
    let keys: serde_json::Map<String, Value> = ACTIONS.iter().filter(|a| m.get(**a) != default(**a)).map(|a| (a.id().to_string(), m.get(*a).map_or(Value::Null, |c| json!(id(c))))).collect();
    json!({ "keys": keys })
}

/// Which usual keys the saved file was written against: 2 since F28 (four jobs with keys). A file without it, or no file
/// at all in a Companion that was used before, is from before.
pub const USUAL_VERSION: u64 = 2;
/// The whole saved file: the keys, which usual keys they were written against, and the jobs whose old usual keys F28 took
/// away (said once in Settings, until the person has seen it).
pub fn file_json(m: &Map, dropped: &[Action]) -> Value {
    let mut v = to_json(m);
    v["usual"] = json!(USUAL_VERSION);
    if !dropped.is_empty() { v["dropped"] = json!(dropped.iter().map(|a| a.id()).collect::<Vec<_>>()); }
    v
}
/// Whether the saved file was written against F28's usual keys.
pub fn on_new_usual(text: Option<&str>) -> bool {
    text.and_then(|t| serde_json::from_str::<Value>(t).ok()).and_then(|v| v.get("usual").and_then(Value::as_u64)).is_some_and(|n| n >= USUAL_VERSION)
}
/// The jobs F28 took keys from in a Companion that was used before (`used_before`: anything of it was on this Mac): the
/// jobs that had keys by usual before and have none now, and that the person never picked keys for (no entry in the
/// file). A key the person picked is never taken. Nothing for a new Companion, or a file already on the new usual keys,
/// whose own list of what was taken (still to be seen) is read back as it is.
pub fn dropped_by_new_usual(text: Option<&str>, used_before: bool) -> Vec<Action> {
    let v: Option<Value> = text.and_then(|t| serde_json::from_str(t).ok());
    if on_new_usual(text) {
        let listed = v.as_ref().and_then(|v| v.get("dropped")).and_then(Value::as_array).cloned().unwrap_or_default();
        return ACTIONS.into_iter().filter(|a| default(*a).is_none() && listed.iter().any(|x| x.as_str() == Some(a.id()))).collect();
    }
    if !used_before && text.is_none() { return vec![]; }
    let keys = v.as_ref().and_then(|v| v.get("keys")).and_then(Value::as_object);
    ACTIONS.into_iter().filter(|a| default(*a).is_none() && !keys.is_some_and(|k| k.contains_key(a.id()))).collect()
}

/// How a job's keys started at launch.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Started {
    /// The keys the person picked (the usual ones until they pick) work.
    Ready(Chord),
    /// Another app holds the keys the person picked, so the usual ones are used for now. The choice stays saved.
    FellBack { picked: Chord, using: Chord },
    /// Another app holds the keys the person expects (and the usual ones too): the job has no keys until they pick.
    Taken(Chord),
    /// F28: no keys picked for this job, and none by usual. Nothing is tried, and nothing is said at launch.
    NoKeys,
}
impl Started {
    pub fn using(&self) -> Option<Chord> { match self { Started::Ready(c) => Some(*c), Started::FellBack { using, .. } => Some(*using), Started::Taken(_) | Started::NoKeys => None } }
    pub fn picked(&self) -> Option<Chord> { match self { Started::Ready(c) | Started::Taken(c) => Some(*c), Started::FellBack { picked, .. } => Some(*picked), Started::NoKeys => None } }
}

/// The two tries every job gets: the keys picked, else the usual ones. Nothing else is tried behind the person's back,
/// and a job with no keys picked tries nothing.
fn try_keys(p: Option<Chord>, d: Option<Chord>, mut register: impl FnMut(Chord) -> bool) -> Started {
    let Some(p) = p else { return Started::NoKeys };
    if register(p) { Started::Ready(p) }
    else if let Some(d) = d.filter(|d| *d != p && register(*d)) { Started::FellBack { picked: p, using: d } }
    else { Started::Taken(p) }
}

/// At launch, for each job: the keys picked, else the usual ones. Keys that work stay registered, except use a
/// suggestion's, which are let go again at once (`keep_registered`): they are taken only while a result shows.
pub fn start(picked: &Map, register: impl FnMut(Action, Chord) -> bool, unregister: impl FnMut(Chord)) -> [Started; N] {
    start_held(picked, &[false; N], register, unregister)
}
/// Whether a job's keys stay registered: `keep_registered`, and never while the job is held back because its group is
/// switched off (F20, groups.rs). The person's choice of keys stays saved either way.
pub fn keep_registered_in(a: Action, armed: bool, held: bool) -> bool { !held && keep_registered(a, armed) }
/// When a job comes back (its group is switched on again), its keys are registered at once, except use a suggestion's:
/// those are taken only while a Prompt help result shows (`arm`).
pub fn registered_on_return(a: Action) -> bool { !a.armed_only() }
/// `start`, with the jobs of groups that are switched off (`held`): their keys are tried like any other job's, so the
/// choice and a fall back are known, and let go again at once. They are registered when the group is switched on.
pub fn start_held(picked: &Map, held: &[bool; N], mut register: impl FnMut(Action, Chord) -> bool, mut unregister: impl FnMut(Chord)) -> [Started; N] {
    ACTIONS.map(|a| {
        let s = try_keys(picked.get(a), default(a), |c| register(a, c));
        if let Some(c) = s.using() { if !keep_registered_in(a, false, held[a.index()]) { unregister(c); } }
        s
    })
}

/// When a Prompt help result shows: the keys for use a suggestion (`a`), registered until the result goes. The keys in
/// use first. When it has none (another app held them at launch), or another app took them since, the keys picked and
/// then the usual ones, the same two tries as at launch, so keys that are free again work from this result on. None when
/// every try fails: then only the button and Esc work, and the result names no keys.
pub fn arm(a: Action, using: Option<Chord>, picked: &Map, mut register: impl FnMut(Chord) -> bool) -> Option<Chord> {
    let mut tried: Vec<Chord> = vec![];
    for c in [using, picked.get(a), default(a)].into_iter().flatten() {
        if tried.contains(&c) { continue; }
        tried.push(c);
        if register(c) { return Some(c); }
    }
    None
}

pub(crate) const WHERE_TO_PICK: &str = "in Settings, under Keys to remember";

/// The one notice at launch: a saved file that could not be read, then Stop everything first if it has no keys, then
/// every other job without keys, then each job using its usual keys for now. None when everything works as picked.
pub fn launch_notice(started: &[Started; N], damaged: bool) -> Option<String> {
    let mut out: Vec<String> = vec![];
    if damaged { out.push(concat!(crate::product!(), " could not read the keys you saved, so some jobs are back to their usual keys.").into()); }
    let at = |a: Action| started[a.index()];
    if let Started::Taken(c) = at(Action::Stop) {
        out.push(format!("Another app is already using {}, so the key for Stop everything does not work right now. Stop everything is still in the menu bar icon.", label(c)));
    }
    let without: Vec<&str> = ACTIONS.iter().filter(|a| !matches!(a, Action::Stop | Action::Talk) && matches!(at(**a), Started::Taken(_))).map(|a| a.job()).collect();
    if !without.is_empty() { out.push(format!("Another app is already using the keys for: {}, so those shortcuts do not work right now.", without.join(", "))); }
    if let Started::Taken(c) = at(Action::Talk) { out.push(format!("Another app is already using {}, so hold to talk is off.", label(c))); }
    for a in ACTIONS {
        let Started::FellBack { picked, using } = at(a) else { continue };
        out.push(if a == Action::Talk {
            format!("Another app is already using the keys you picked for hold to talk ({}), so hold to talk uses {} for now.", label(picked), label(using))
        } else {
            format!(concat!("Another app is already using the keys you picked for {} ({}), so ", crate::product!(), " uses {} for it for now."), a.job(), label(picked), label(using))
        });
    }
    if out.is_empty() { return None; }
    out.push(format!("You can pick other keys {WHERE_TO_PICK}."));
    Some(out.join(" "))
}

/// Settings, Change: which of a job's list can be picked on this Mac now.
#[derive(Debug, PartialEq, Eq)]
pub struct Free {
    /// The chords that can be pressed: the job's own keys registered now, and every chord macOS let Companion register.
    pub free: Vec<Chord>,
    /// Chords another of Companion's jobs uses or picked, with that job: never offered, never touched.
    pub ours: Vec<(Chord, Action)>,
}
/// `current` is what is registered for the job now (Companion's own, so free and never touched). Every other chord on the
/// list that no other job has is registered and let go again at once; one macOS refuses is held by another app.
pub fn free(a: Action, current: Option<Chord>, others: &[(Action, Chord)], mut register: impl FnMut(Chord) -> bool, mut unregister: impl FnMut(Chord)) -> Free {
    let mut f = Free { free: vec![], ours: vec![] };
    for c in choices(a) {
        if current == Some(c) { f.free.push(c); continue; }
        if let Some((b, _)) = others.iter().find(|(_, o)| *o == c) { f.ours.push((c, *b)); continue; }
        if !register(c) { continue; }
        unregister(c);
        f.free.push(c);
    }
    f
}

/// What the page is told about every job: the keys used now (none when another app holds them) and the ones picked.
pub fn state_json(using: &Using, picked: &Map) -> Value {
    let used: serde_json::Map<String, Value> = ACTIONS.iter().map(|a| (a.id().to_string(), using[a.index()].map_or(Value::Null, |c| json!(id(c))))).collect();
    let chosen: serde_json::Map<String, Value> = ACTIONS.iter().map(|a| (a.id().to_string(), picked.get(*a).map_or(Value::Null, |c| json!(id(c))))).collect();
    json!({ "using": used, "picked": chosen })
}
/// What the page is told when Change is pressed: the list, which can be pressed, and which other job has the others.
pub fn choices_json(a: Action, f: &Free) -> Value {
    let ours: serde_json::Map<String, Value> = f.ours.iter().map(|(c, b)| (id(*c), json!(b.id()))).collect();
    json!({
        "action": a.id(),
        "choices": choices(a).into_iter().map(id).collect::<Vec<_>>(),
        "free": f.free.iter().map(|c| id(*c)).collect::<Vec<_>>(),
        "ours": ours,
    })
}

/// Why a change in Settings did not happen. The page turns the code into words (keys.ts, keyProblem).
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum NotChanged { Taken, InUse, NotSaved, NotEnoughKeys, Reserved }
impl NotChanged {
    pub fn code(&self) -> &'static str {
        match self { NotChanged::Taken => "taken", NotChanged::InUse => "in_use", NotChanged::NotSaved => "not_saved", NotChanged::NotEnoughKeys => "not_enough", NotChanged::Reserved => "reserved" }
    }
}

/// Settings: use `wanted` for job `a` from now on. `current` is what is registered for it now; `keep` is false for use a
/// suggestion while no result shows (its keys are only tried); `others` are every other job's keys, used and picked.
/// The new keys are registered before the old ones are let go, so there is never a moment with neither; keys another app
/// holds, or another job has, leave everything as it was. Saved only once they work; if saving fails, the new keys are
/// let go again and the old ones stay.
#[allow(clippy::too_many_arguments)]
pub fn switch(
    a: Action, wanted: Chord, current: Option<Chord>, keep: bool, picked: &Map, others: &[(Action, Chord)],
    register: impl FnOnce(Chord) -> bool, save: impl FnOnce(&Map) -> bool, mut unregister: impl FnMut(Chord),
) -> Result<Map, NotChanged> {
    if !choices(a).contains(&wanted) { if let Some(why) = why_not(wanted) { return Err(why); } }
    // Another job's keys, in use or picked, and every other job's suggested keys: Companion's own, even while that job has
    // others or none yet (so each job can always be given its own).
    if others.iter().any(|(_, c)| *c == wanted) || SUGGESTED.iter().any(|(b, d)| *b != a && *d == wanted) { return Err(NotChanged::InUse); }
    let next = picked.with(a, wanted);
    if current == Some(wanted) { return if save(&next) { Ok(next) } else { Err(NotChanged::NotSaved) }; }
    if !register(wanted) { return Err(NotChanged::Taken); }
    if !save(&next) { unregister(wanted); return Err(NotChanged::NotSaved); }
    if !keep { unregister(wanted); }
    if let Some(old) = current { unregister(old); }
    Ok(next)
}

/// What Reset to the usual keys did.
#[derive(Debug, PartialEq, Eq)]
pub struct Reset { pub picked: Map, pub using: Using, pub kept: Vec<Action> }
/// Settings: every job back to its usual keys. `registered` is what is registered for each job now (use a suggestion
/// only while a result shows), `keep` whether a job's keys stay registered after. A job whose usual keys another app
/// holds keeps what it has (so Stop everything keeps working keys). A job with no usual keys (F28) has none after: what
/// it had is let go. Saved once, only if every new chord worked; if saving fails, every new chord is let go and nothing
/// changes.
pub fn reset(
    picked: &Map, using: &Using, registered: &Using, keep: impl Fn(Action) -> bool,
    mut register: impl FnMut(Chord) -> bool, save: impl FnOnce(&Map) -> bool, mut unregister: impl FnMut(Chord),
) -> Result<Reset, NotChanged> {
    let (mut next, mut now, mut kept, mut fresh, mut cleared) = (*picked, *using, vec![], vec![], vec![]);
    for a in ACTIONS {
        let i = a.index();
        let Some(d) = default(a) else {
            if picked.get(a).is_some() || using[i].is_some() { next = next.without(a); now[i] = None; cleared.push(a); }
            continue;
        };
        if picked.get(a) == Some(d) && using[i] == Some(d) { continue; }
        // Already on its usual keys after a fall back: only the choice that failed is forgotten.
        if registered[i] == Some(d) { next = next.with(a, d); now[i] = Some(d); continue; }
        if register(d) { fresh.push(a); next = next.with(a, d); now[i] = Some(d); } else { kept.push(a); }
    }
    if next != *picked && !save(&next) {
        for a in &fresh { if let Some(d) = default(*a) { unregister(d); } }
        return Err(NotChanged::NotSaved);
    }
    for a in fresh {
        if !keep(a) { if let Some(d) = default(a) { unregister(d); } }
        if let Some(old) = registered[a.index()] { unregister(old); }
    }
    for a in cleared { if let Some(old) = registered[a.index()] { unregister(old); } }
    Ok(Reset { picked: next, using: now, kept })
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::cell::RefCell;
    use Action::*;

    /// Control, Option, Command and a letter, and the same with Shift.
    const fn k(key: Key) -> Chord { Chord::new(LETTER, key) }
    const fn shift(key: Key) -> Chord { Chord::new(LETTER | SHIFT, key) }
    const OPT_SPACE: Chord = Chord::new(OPTION, Key::Space);
    const OPT_RETURN: Chord = Chord::new(OPTION, Key::Return);
    const CTRL_RETURN: Chord = Chord::new(CONTROL, Key::Return);
    // Most tests here are about how the keys work, with every job given keys: `Map::EVERY`, the usual keys from before
    // F28, and `old(a)`, a job's own suggested keys. The F28 tests (at the end) use the usual keys as they are now.
    fn old(a: Action) -> Chord { suggested(a) }

    #[test]
    fn the_usual_keys_are_exactly_the_ones_companion_always_had() {
        let three = Modifiers::CONTROL | Modifiers::ALT | Modifiers::SUPER;
        for (a, code) in [(Card, Code::KeyK), (Problem, Code::KeyF), (ShowMe, Code::KeyS), (Read, Code::KeyR), (Accept, Code::KeyA), (Explain, Code::KeyE), (SecondLook, Code::KeyC), (Stop, Code::KeyX)] {
            assert_eq!(shortcut(old(a)), Shortcut::new(Some(three), code), "{a:?}");
        }
        assert_eq!(shortcut(old(Talk)), Shortcut::new(Some(Modifiers::ALT), Code::Space));
        for (i, (a, c)) in SUGGESTED.iter().enumerate() { assert_eq!(*a, ACTIONS[i]); assert_eq!(a.index(), i); assert_eq!(Map::EVERY.get(*a), Some(*c)); }
        for (i, (a, c)) in DEFAULTS.iter().enumerate() { assert_eq!(*a, ACTIONS[i]); assert_eq!(Map::DEFAULT.get(*a), *c); assert_eq!(c.is_some(), USUAL.contains(a), "{a:?}"); }
        assert!(clashes(&Map::EVERY).is_empty(), "the suggested keys are all different");
    }
    #[test]
    fn every_job_has_its_own_id_and_reads_back() {
        let ids: std::collections::HashSet<_> = ACTIONS.iter().map(|a| a.id()).collect();
        assert_eq!(ids.len(), N);
        for a in ACTIONS { assert_eq!(Action::from_id(a.id()), Some(a)); assert!(!a.job().is_empty()); }
        assert_eq!(Action::from_id("Card"), None); assert_eq!(Action::from_id(""), None);
        assert!(Accept.armed_only() && ACTIONS.iter().filter(|a| a.armed_only()).count() == 1);
    }
    #[test]
    fn a_chord_has_a_name_a_person_reads_and_an_id_that_reads_back_exactly() {
        assert_eq!(label(k(Key::K)), "Control, Option, Command and K");
        assert_eq!(label(shift(Key::K)), "Control, Option, Shift, Command and K");
        assert_eq!(label(OPT_SPACE), "Option and Space");
        assert_eq!(label(CTRL_RETURN), "Control and Return");
        assert_eq!(id(k(Key::K)), "control-option-command-k");
        assert_eq!(id(shift(Key::X)), "control-option-shift-command-x");
        assert_eq!(id(OPT_SPACE), "option-space");
        for a in ACTIONS { for c in choices(a) { assert_eq!(from_id(&id(c)), Some(c), "{}", id(c)); assert_eq!(decode(encode(c)), Some(c)); } }
        for junk in ["", "k", "option", "-k", "option-", "command-control-option-k", "control-control-k", "control-option-command-K",
            "control-option-command-tab", "control-option-command-f1", "control-option-command-escape", "fn-k", "control-fn-k", "control-option-command-k-x", "control option command k", "Control, Option, Command and K"] {
            assert_eq!(from_id(junk), None, "{junk:?}");
        }
        assert_eq!(decode(NONE), None); assert_eq!(decode(0x5_0000), None); assert_eq!(decode(0x0001), None, "no modifier");
    }
    #[test]
    fn every_choice_is_a_chord_never_a_modifier_alone_never_fn_and_each_list_is_short() {
        for a in ACTIONS {
            let list = choices(a);
            assert_eq!(list[0], old(a), "{a:?}: the usual keys come first");
            assert!(list.len() <= 8, "{a:?}: a short list");
            let uniq: std::collections::HashSet<_> = list.iter().collect();
            assert_eq!(uniq.len(), list.len(), "{a:?}");
            for c in list {
                assert!(c.mods != 0 && c.mods & !(CONTROL | OPTION | SHIFT | COMMAND) == 0, "{}", id(c));
                assert!(shortcut(c).mods != Modifiers::empty());
                // Never the bare Esc a Prompt help result takes, and never the old four key hold to talk (V).
                assert_ne!(shortcut(c), Shortcut::new(None, Code::Escape));
                assert_ne!(shortcut(c).key, Code::KeyV);
            }
        }
    }
    #[test]
    fn a_letter_job_offers_its_letter_with_shift_and_the_spare_letters_and_hold_to_talk_its_own_list() {
        assert_eq!(choices(Card), vec![k(Key::K), shift(Key::K), k(Key::I), k(Key::J), k(Key::L), k(Key::O), k(Key::P), k(Key::U)]);
        assert_eq!(choices(Stop), vec![k(Key::X), shift(Key::X), k(Key::I), k(Key::J), k(Key::L), k(Key::O), k(Key::P), k(Key::U)]);
        assert_eq!(choices(Talk), vec![OPT_SPACE, OPT_RETURN, CTRL_RETURN]);
        for s in SPARE { assert!(SUGGESTED.iter().all(|(_, d)| d.key != s), "{s:?} is nobody's own letter"); }
    }
    #[test]
    fn a_jobs_usual_keys_are_on_no_other_jobs_list_so_falling_back_never_takes_another_jobs_keys() {
        for a in ACTIONS { for b in ACTIONS { if a != b { assert!(!choices(b).contains(&old(a)), "{a:?}'s usual keys on {b:?}'s list"); } } }
    }

    #[test]
    fn nothing_saved_is_the_usual_keys_with_no_notice() {
        assert_eq!(parse(None, None), (Map::DEFAULT, false));
    }
    #[test]
    fn a_saved_choice_reads_back_and_only_what_differs_from_the_usual_keys_is_written() {
        let m = Map::DEFAULT.with(Card, k(Key::J)).with(Talk, OPT_RETURN);
        assert_eq!(to_json(&m), json!({ "keys": { "card": "control-option-command-j", "talk": "option-return" } }));
        assert_eq!(parse(Some(&to_json(&m).to_string()), None), (m, false));
        assert_eq!(to_json(&Map::DEFAULT), json!({ "keys": {} }));
        assert_eq!(parse(Some("{\"keys\":{}}"), None), (Map::DEFAULT, false));
        // Writing the usual keys out on purpose is fine too.
        assert_eq!(parse(Some("{\"keys\":{\"stop\":\"control-option-command-x\"}}"), None), (Map::DEFAULT, false));
    }
    #[test]
    fn a_file_that_cannot_be_read_falls_back_to_every_usual_key_and_says_so() {
        for junk in ["", "not json", "[]", "7", "null", "{}", "{\"keys\":7}", "{\"keys\":[]}", "{\"keys\":\"card\"}"] {
            assert_eq!(parse(Some(junk), None), (Map::DEFAULT, true), "{junk:?}");
        }
    }
    #[test]
    fn a_file_that_is_there_but_cannot_be_read_as_text_is_damaged_and_only_a_missing_one_is_nothing_saved() {
        use std::io::{Error, ErrorKind};
        assert_eq!(saved_text(Err(Error::from(ErrorKind::NotFound))), None);
        assert_eq!(saved_text(Ok(b"{\"keys\":{}}".to_vec())).as_deref(), Some("{\"keys\":{}}"));
        // Bytes that are not text, or a file that is there but cannot be opened, must not pass for "nothing saved".
        for r in [Ok(vec![0xff, 0xfe, 0x00, 0x7b]), Err(Error::from(ErrorKind::PermissionDenied)), Err(Error::from(ErrorKind::InvalidData))] {
            let t = saved_text(r);
            assert!(t.is_some());
            assert_eq!(parse(t.as_deref(), Some("{\"holdToTalk\":\"control-return\"}")), (Map::DEFAULT, true), "said once, and the old file is not read instead");
        }
    }
    #[test]
    fn an_entry_that_is_not_on_its_jobs_list_goes_back_to_its_usual_keys_and_the_rest_are_kept() {
        assert_eq!(parse(Some("{\"keys\":{\"card\":7}}"), None), (Map::DEFAULT, true));
        assert_eq!(parse(Some("{\"keys\":{\"card\":\"control-option-command-tab\"}}"), None), (Map::DEFAULT, true));
        assert_eq!(parse(Some("{\"keys\":{\"card\":\"option-space\"}}"), None), (Map::DEFAULT, true), "hold to talk's keys are not on the card's list");
        assert_eq!(parse(Some("{\"keys\":{\"talk\":\"option-j\"}}"), None), (Map::DEFAULT, true), "one modifier is never a picked chord");
        assert_eq!(parse(Some("{\"keys\":{\"card\":\"control-option-command-f\"}}"), None), (Map::DEFAULT, true), "another job's usual keys");
        let (m, damaged) = parse(Some("{\"keys\":{\"card\":\"control-option-command-j\",\"showme\":\"bogus\"}}"), None);
        assert!(damaged); assert_eq!(m, Map::DEFAULT.with(Card, k(Key::J)));
    }
    #[test]
    fn two_jobs_on_the_same_keys_both_go_back_to_their_own_and_say_so() {
        let (m, damaged) = parse(Some("{\"keys\":{\"card\":\"control-option-command-j\",\"showme\":\"control-option-command-j\",\"stop\":\"control-option-command-l\"}}"), None);
        assert!(damaged);
        assert_eq!(m, Map::DEFAULT.with(Stop, k(Key::L)));
        assert!(clashes(&m).is_empty());
        assert_eq!(clashes(&Map::DEFAULT.with(Card, k(Key::J)).with(Read, k(Key::J))), vec![Card, Read]);
    }
    #[test]
    fn a_job_this_version_does_not_know_is_left_alone() {
        // A newer Companion may keep keys for a job this one does not have.
        assert_eq!(parse(Some("{\"keys\":{\"later\":\"control-option-command-j\",\"card\":\"control-option-command-l\"}}"), None), (Map::DEFAULT.with(Card, k(Key::L)), false));
    }
    #[test]
    fn the_hold_to_talk_keys_picked_before_every_key_could_change_are_kept() {
        assert_eq!(parse(None, Some("{\"holdToTalk\":\"control-return\"}")), (Map::DEFAULT.with(Talk, CTRL_RETURN), false));
        for junk in ["", "not json", "{}", "{\"holdToTalk\":7}", "{\"holdToTalk\":\"control-space\"}", "{\"holdToTalk\":\"control-option-command-j\"}"] {
            assert_eq!(parse(None, Some(junk)), (Map::DEFAULT, false), "{junk:?}: the old file never said anything when it was junk");
        }
        assert_eq!(parse(Some("{\"keys\":{}}"), Some("{\"holdToTalk\":\"control-return\"}")), (Map::DEFAULT, false), "the new file wins");
    }

    /// A fake hot key service: which chords another app holds, and every chord we asked for, in order.
    fn ask(held_elsewhere: &[Chord], picked: &Map) -> ([Started; N], Vec<String>) {
        let (s, asked, _) = ask_and_let_go(held_elsewhere, picked);
        (s, asked)
    }
    /// The same, with every chord let go again after it was tried, in order.
    fn ask_and_let_go(held_elsewhere: &[Chord], picked: &Map) -> ([Started; N], Vec<String>, Vec<Chord>) {
        let (asked, gone) = (RefCell::new(vec![]), RefCell::new(vec![]));
        let s = start(picked,
            |a, c| { asked.borrow_mut().push(format!("{} {}", a.id(), id(c))); !held_elsewhere.contains(&c) },
            |c| gone.borrow_mut().push(c));
        (s, asked.into_inner(), gone.into_inner())
    }
    #[test]
    fn at_launch_use_a_suggestions_keys_are_only_tried_and_let_go_at_once_and_every_other_jobs_stay() {
        // T11: Control, Option, Command and A are taken from other apps only while a Prompt help result shows.
        let (s, _, gone) = ask_and_let_go(&[], &Map::EVERY);
        assert_eq!(s[Accept.index()], Started::Ready(k(Key::A)), "tried, so Settings and the first result know they are free");
        assert_eq!(gone, vec![k(Key::A)], "only use a suggestion's keys are let go");
        // Picked keys another app holds: the usual ones are tried and let go; the ones that failed were never taken.
        let (s, _, gone) = ask_and_let_go(&[k(Key::U)], &Map::EVERY.with(Accept, k(Key::U)));
        assert_eq!(s[Accept.index()], Started::FellBack { picked: k(Key::U), using: k(Key::A) });
        assert_eq!(gone, vec![k(Key::A)]);
        let (_, _, gone) = ask_and_let_go(&[], &Map::EVERY.with(Accept, k(Key::U)).with(Card, k(Key::J)));
        assert_eq!(gone, vec![k(Key::U)]);
        // Taken altogether: nothing to let go.
        let (s, _, gone) = ask_and_let_go(&[k(Key::A)], &Map::EVERY);
        assert_eq!(s[Accept.index()], Started::Taken(k(Key::A))); assert!(gone.is_empty(), "{gone:?}");
    }

    #[test]
    fn only_use_a_suggestion_lets_its_keys_go_and_only_while_no_result_shows() {
        for a in ACTIONS {
            assert!(keep_registered(a, true), "{a:?}");
            assert_eq!(keep_registered(a, false), a != Accept, "{a:?}");
        }
    }
    #[test]
    fn what_is_registered_for_use_a_suggestion_is_nothing_while_no_result_shows() {
        for a in ACTIONS {
            let c = old(a);
            assert_eq!(registered(a, Some(c), true), Some(c), "{a:?}");
            assert_eq!(registered(a, Some(c), false), (a != Accept).then_some(c), "{a:?}");
            assert_eq!(registered(a, None, true), None); assert_eq!(registered(a, None, false), None);
        }
    }
    #[test]
    fn every_other_jobs_keys_in_use_and_picked_are_companions_own_and_never_the_jobs_own() {
        // Show me how fell back to its usual keys (J taken at launch); hold to talk has none; Read picked L.
        let picked = Map::EVERY.with(ShowMe, k(Key::J)).with(Read, k(Key::L));
        let mut using = all_used(); using[Read.index()] = Some(k(Key::L)); using[Talk.index()] = None;
        let o = others(Card, &using, &picked);
        assert!(o.iter().all(|(b, _)| *b != Card), "{o:?}");
        for (b, c) in [(ShowMe, k(Key::S)), (ShowMe, k(Key::J)), (Read, k(Key::L)), (Talk, OPT_SPACE), (Stop, k(Key::X)), (Accept, k(Key::A))] {
            assert!(o.contains(&(b, c)), "{b:?} {}: {o:?}", id(c));
        }
        assert!(!o.iter().any(|(_, c)| *c == k(Key::K)), "the card's own keys are not another job's");
        // The keys picked count even when another job uses something else now: saving them for Card would be two jobs on
        // the same keys, which the next launch reads as a damaged file.
        let (r, _) = try_switch(Card, k(Key::J), Some(k(Key::K)), true, &picked, &others(Card, &using, &picked), true, true);
        assert_eq!(r, Err(NotChanged::InUse));
        let (f, _) = check(Card, Some(k(Key::K)), &others(Card, &using, &picked), &[]);
        assert!(!f.free.contains(&k(Key::J)) && f.ours.contains(&(k(Key::J), ShowMe)), "{f:?}");
    }

    /// Records every chord arming tries, in order; `held_elsewhere` are refused.
    fn try_arm(using: Option<Chord>, picked: &Map, held_elsewhere: &[Chord]) -> (Option<Chord>, Vec<Chord>) {
        let tried = RefCell::new(vec![]);
        let r = arm(Accept, using, picked, |c| { tried.borrow_mut().push(c); !held_elsewhere.contains(&c) });
        (r, tried.into_inner())
    }
    #[test]
    fn a_result_takes_the_use_keys_in_use_and_nothing_else_when_they_are_free() {
        assert_eq!(try_arm(Some(k(Key::A)), &Map::EVERY, &[]), (Some(k(Key::A)), vec![k(Key::A)]));
        let picked = Map::EVERY.with(Accept, k(Key::U));
        assert_eq!(try_arm(Some(k(Key::U)), &picked, &[]), (Some(k(Key::U)), vec![k(Key::U)]));
        // After a fall back at launch the usual keys are in use, and stay so while they work.
        assert_eq!(try_arm(Some(k(Key::A)), &picked, &[]), (Some(k(Key::A)), vec![k(Key::A)]));
    }
    #[test]
    fn use_keys_another_app_held_at_launch_are_tried_again_for_each_result_picked_first_then_the_usual_ones() {
        // Another app held A when Companion opened and has let go since: the keys work from the next result on.
        assert_eq!(try_arm(None, &Map::EVERY, &[]), (Some(k(Key::A)), vec![k(Key::A)]));
        let picked = Map::EVERY.with(Accept, k(Key::U));
        assert_eq!(try_arm(None, &picked, &[]), (Some(k(Key::U)), vec![k(Key::U)]));
        assert_eq!(try_arm(None, &picked, &[k(Key::U)]), (Some(k(Key::A)), vec![k(Key::U), k(Key::A)]));
        assert_eq!(try_arm(None, &picked, &[k(Key::U), k(Key::A)]), (None, vec![k(Key::U), k(Key::A)]));
        assert_eq!(try_arm(None, &Map::EVERY, &[k(Key::A)]), (None, vec![k(Key::A)]), "the usual keys are tried once");
    }
    #[test]
    fn use_keys_another_app_took_since_launch_fall_back_the_same_way() {
        let picked = Map::EVERY.with(Accept, k(Key::U));
        assert_eq!(try_arm(Some(k(Key::U)), &picked, &[k(Key::U)]), (Some(k(Key::A)), vec![k(Key::U), k(Key::A)]), "each chord tried once");
        assert_eq!(try_arm(Some(k(Key::A)), &picked, &[k(Key::A)]), (Some(k(Key::U)), vec![k(Key::A), k(Key::U)]));
        assert_eq!(try_arm(Some(k(Key::A)), &Map::EVERY, &[k(Key::A)]), (None, vec![k(Key::A)]));
    }
    #[test]
    fn at_launch_every_job_gets_its_usual_keys_when_they_are_free() {
        let (s, asked) = ask(&[], &Map::EVERY);
        assert_eq!(s, ACTIONS.map(|a| Started::Ready(old(a))));
        assert_eq!(asked, ACTIONS.map(|a| format!("{} {}", a.id(), id(old(a)))));
    }
    #[test]
    fn at_launch_keys_another_app_holds_fall_back_to_the_usual_ones_and_stay_saved() {
        // Prompt help has usual keys (F28): picked keys another app holds fall back to them.
        let (s, asked) = ask(&[k(Key::J)], &Map::EVERY.with(Read, k(Key::J)));
        assert_eq!(s[Read.index()], Started::FellBack { picked: k(Key::J), using: k(Key::R) });
        assert_eq!(s[Read.index()].using(), Some(k(Key::R))); assert_eq!(s[Read.index()].picked(), Some(k(Key::J)));
        assert_eq!(asked.iter().filter(|l| l.starts_with("read ")).collect::<Vec<_>>(), ["read control-option-command-j", "read control-option-command-r"]);
        // Show me how has none by usual: keys another app holds leave it without keys, and nothing else is tried.
        let (s, asked) = ask(&[k(Key::J)], &Map::EVERY.with(ShowMe, k(Key::J)));
        assert_eq!(s[ShowMe.index()], Started::Taken(k(Key::J)));
        assert_eq!(asked.iter().filter(|l| l.starts_with("showme ")).collect::<Vec<_>>(), ["showme control-option-command-j"]);
    }
    #[test]
    fn at_launch_usual_keys_another_app_holds_leave_the_job_without_keys_and_nothing_else_is_tried() {
        let (s, asked) = ask(&[k(Key::R)], &Map::EVERY);
        assert_eq!(s[Read.index()], Started::Taken(k(Key::R))); assert_eq!(s[Read.index()].using(), None);
        assert_eq!(asked.iter().filter(|l| l.starts_with("read ")).count(), 1);
        let (s, asked) = ask(&[k(Key::J), k(Key::R)], &Map::EVERY.with(Read, k(Key::J)));
        assert_eq!(s[Read.index()], Started::Taken(k(Key::J)), "named by the person's own choice");
        assert_eq!(asked.iter().filter(|l| l.starts_with("read ")).collect::<Vec<_>>(), ["read control-option-command-j", "read control-option-command-r"]);
    }
    #[test]
    fn at_launch_stop_everything_tries_its_keys_then_its_usual_ones_and_nothing_else() {
        let (s, _) = ask(&[k(Key::L)], &Map::EVERY.with(Stop, k(Key::L)));
        assert_eq!(s[Stop.index()], Started::FellBack { picked: k(Key::L), using: k(Key::X) });
        let (s, asked) = ask(&[k(Key::L), k(Key::X)], &Map::EVERY.with(Stop, k(Key::L)));
        assert_eq!(s[Stop.index()], Started::Taken(k(Key::L)));
        assert_eq!(asked.iter().filter(|l| l.starts_with("stop ")).collect::<Vec<_>>(), ["stop control-option-command-l", "stop control-option-command-x"]);
    }

    fn ready() -> [Started; N] { ACTIONS.map(|a| Started::Ready(old(a))) }
    #[test]
    fn the_launch_notice_is_quiet_when_everything_works_as_picked() {
        assert_eq!(launch_notice(&ready(), false), None);
        let mut s = ready(); s[Card.index()] = Started::Ready(k(Key::J));
        assert_eq!(launch_notice(&s, false), None);
    }
    #[test]
    fn a_damaged_file_is_said_once_with_where_to_pick_again() {
        assert_eq!(launch_notice(&ready(), true).unwrap(), concat!(crate::product!(), " could not read the keys you saved, so some jobs are back to their usual keys. You can pick other keys in Settings, under Keys to remember."));
    }
    #[test]
    fn stop_everything_without_keys_is_said_first_and_plainly_with_the_menu_bar_icon() {
        let mut s = ready(); s[Stop.index()] = Started::Taken(k(Key::X)); s[Read.index()] = Started::Taken(k(Key::R));
        let n = launch_notice(&s, false).unwrap();
        assert_eq!(n, "Another app is already using Control, Option, Command and X, so the key for Stop everything does not work right now. Stop everything is still in the menu bar icon. Another app is already using the keys for: Prompt help, so those shortcuts do not work right now. You can pick other keys in Settings, under Keys to remember.");
    }
    #[test]
    fn the_launch_notice_names_every_job_without_keys_and_every_fall_back() {
        let mut s = ready();
        s[Problem.index()] = Started::Taken(k(Key::F)); s[ShowMe.index()] = Started::Taken(k(Key::S));
        s[Talk.index()] = Started::Taken(OPT_SPACE);
        s[Explain.index()] = Started::FellBack { picked: k(Key::J), using: k(Key::E) };
        let n = launch_notice(&s, false).unwrap();
        assert_eq!(n, concat!("Another app is already using the keys for: point at the problem, Show me how, so those shortcuts do not work right now. Another app is already using Option and Space, so hold to talk is off. Another app is already using the keys you picked for explain an error (Control, Option, Command and J), so ", crate::product!(), " uses Control, Option, Command and E for it for now. You can pick other keys in Settings, under Keys to remember."));
        let mut t = ready(); t[Talk.index()] = Started::FellBack { picked: OPT_RETURN, using: OPT_SPACE };
        assert_eq!(launch_notice(&t, false).unwrap(), "Another app is already using the keys you picked for hold to talk (Option and Return), so hold to talk uses Option and Space for now. You can pick other keys in Settings, under Keys to remember.");
        let mut both = s; both[Stop.index()] = Started::FellBack { picked: k(Key::L), using: k(Key::X) };
        let all = launch_notice(&both, true).unwrap();
        assert!(all.starts_with(concat!(crate::product!(), " could not read the keys you saved")), "{all}");
        assert!(all.contains(concat!("for stop everything (Control, Option, Command and L), so ", crate::product!(), " uses Control, Option, Command and X for it for now.")), "{all}");
        assert!(all.ends_with("You can pick other keys in Settings, under Keys to remember.") && all.matches("You can pick").count() == 1);
        for x in [n, all] { assert!(!x.contains('—'), "no em dashes"); }
    }

    /// Records every register and unregister the free check makes, in order; `held_elsewhere` are refused.
    fn check(a: Action, current: Option<Chord>, others: &[(Action, Chord)], held_elsewhere: &[Chord]) -> (Free, Vec<String>) {
        let log = RefCell::new(vec![]);
        let f = free(a, current, others,
            |c| { log.borrow_mut().push(format!("register {}", id(c))); !held_elsewhere.contains(&c) },
            |c| log.borrow_mut().push(format!("unregister {}", id(c))));
        (f, log.into_inner())
    }
    #[test]
    fn change_tries_each_chord_on_the_list_and_lets_it_go_at_once_never_touching_the_keys_in_use() {
        let (f, log) = check(Talk, Some(OPT_SPACE), &[], &[]);
        assert_eq!(f, Free { free: vec![OPT_SPACE, OPT_RETURN, CTRL_RETURN], ours: vec![] });
        assert_eq!(log, ["register option-return", "unregister option-return", "register control-return", "unregister control-return"]);
    }
    #[test]
    fn a_chord_another_app_holds_is_not_free_and_nothing_is_let_go_for_it() {
        let (f, log) = check(Talk, Some(OPT_SPACE), &[], &[OPT_RETURN]);
        assert_eq!(f.free, vec![OPT_SPACE, CTRL_RETURN]);
        assert_eq!(log, ["register option-return", "register control-return", "unregister control-return"]);
        // Hold to talk off since launch: its usual keys another app holds are not offered as a button that can only fail.
        let (f, _) = check(Talk, None, &[], &[OPT_SPACE]);
        assert_eq!(f.free, vec![OPT_RETURN, CTRL_RETURN]);
    }
    #[test]
    fn keys_another_job_uses_or_picked_are_companions_own_never_offered_and_never_touched() {
        let others = [(ShowMe, k(Key::J)), (ShowMe, k(Key::S)), (Read, k(Key::L)), (Read, k(Key::R))];
        let (f, log) = check(Card, Some(k(Key::K)), &others, &[k(Key::U)]);
        assert_eq!(f.free, vec![k(Key::K), shift(Key::K), k(Key::I), k(Key::O), k(Key::P)]);
        assert_eq!(f.ours, vec![(k(Key::J), ShowMe), (k(Key::L), Read)]);
        for c in [k(Key::J), k(Key::L), k(Key::K)] {
            assert!(!log.iter().any(|l| l == &format!("register {}", id(c)) || l == &format!("unregister {}", id(c))), "{} was touched: {log:?}", id(c));
        }
    }
    #[test]
    fn use_a_suggestion_while_no_result_shows_has_its_own_keys_tried_too() {
        let (f, log) = check(Accept, None, &[], &[k(Key::A)]);
        assert!(!f.free.contains(&k(Key::A)));
        assert_eq!(log[0], "register control-option-command-a");
    }

    /// Records every call a switch makes, in order.
    fn calls() -> RefCell<Vec<String>> { RefCell::new(vec![]) }
    /// What a map holds apart from every job on its own suggested keys (these tests start from `Map::EVERY`).
    fn from_every(m: &Map) -> Value {
        let o: serde_json::Map<String, Value> = ACTIONS.iter().filter(|a| m.get(**a) != Some(suggested(**a))).map(|a| (a.id().to_string(), m.get(*a).map_or(Value::Null, |c| json!(id(c))))).collect();
        Value::Object(o)
    }
    fn try_switch(a: Action, wanted: Chord, current: Option<Chord>, keep: bool, picked: &Map, others: &[(Action, Chord)], works: bool, saves: bool) -> (Result<Map, NotChanged>, Vec<String>) {
        let log = calls();
        let r = switch(a, wanted, current, keep, picked, others,
            |c| { log.borrow_mut().push(format!("register {}", id(c))); works },
            |m| { log.borrow_mut().push(format!("save {}", from_every(m))); saves },
            |c| log.borrow_mut().push(format!("unregister {}", id(c))));
        (r, log.into_inner())
    }
    #[test]
    fn changing_registers_the_new_keys_saves_them_then_lets_the_old_ones_go() {
        let (r, log) = try_switch(Card, k(Key::J), Some(k(Key::K)), true, &Map::EVERY, &[], true, true);
        assert_eq!(r, Ok(Map::EVERY.with(Card, k(Key::J))));
        assert_eq!(log, ["register control-option-command-j", "save {\"card\":\"control-option-command-j\"}", "unregister control-option-command-k"]);
    }
    #[test]
    fn keys_another_app_holds_change_nothing_and_are_not_saved() {
        let (r, log) = try_switch(Stop, k(Key::L), Some(k(Key::X)), true, &Map::EVERY, &[], false, true);
        assert_eq!(r, Err(NotChanged::Taken)); assert_eq!(NotChanged::Taken.code(), "taken");
        assert_eq!(log, ["register control-option-command-l"], "Stop everything keeps its working keys");
    }
    #[test]
    fn if_the_choice_cannot_be_saved_the_new_keys_are_let_go_and_the_old_ones_stay() {
        let (r, log) = try_switch(Stop, k(Key::L), Some(k(Key::X)), true, &Map::EVERY, &[], true, false);
        assert_eq!(r, Err(NotChanged::NotSaved)); assert_eq!(NotChanged::NotSaved.code(), "not_saved");
        assert_eq!(log, ["register control-option-command-l", "save {\"stop\":\"control-option-command-l\"}", "unregister control-option-command-l"]);
    }
    #[test]
    fn keys_another_job_has_or_that_cannot_be_a_chord_are_refused_without_touching_anything() {
        let (r, log) = try_switch(Card, k(Key::J), Some(k(Key::K)), true, &Map::EVERY, &[(ShowMe, k(Key::J))], true, true);
        assert_eq!(r, Err(NotChanged::InUse)); assert!(log.is_empty()); assert_eq!(NotChanged::InUse.code(), "in_use");
        // Another job's usual keys, even when that job picked others for now.
        let (r, log) = try_switch(Card, k(Key::F), Some(k(Key::K)), true, &Map::EVERY.with(Problem, k(Key::J)), &[(Problem, k(Key::J))], true, true);
        assert_eq!(r, Err(NotChanged::InUse)); assert!(log.is_empty());
        let (r, log) = try_switch(Card, OPT_SPACE, Some(k(Key::K)), true, &Map::EVERY, &[], true, true);
        assert_eq!(r, Err(NotChanged::NotEnoughKeys)); assert!(log.is_empty());
        assert_eq!(NotChanged::NotEnoughKeys.code(), "not_enough"); assert_eq!(NotChanged::Reserved.code(), "reserved");
    }
    #[test]
    fn picking_the_keys_already_in_use_only_saves_them() {
        // For example after a fall back: the person keeps the usual keys, and the choice that failed is forgotten.
        let picked = Map::EVERY.with(ShowMe, k(Key::J));
        let (r, log) = try_switch(ShowMe, k(Key::S), Some(k(Key::S)), true, &picked, &[], true, true);
        assert_eq!(r, Ok(Map::EVERY)); assert_eq!(log, ["save {}"]);
        let (r, _) = try_switch(ShowMe, k(Key::S), Some(k(Key::S)), true, &picked, &[], true, false);
        assert_eq!(r, Err(NotChanged::NotSaved));
    }
    #[test]
    fn a_job_without_keys_gets_them_with_nothing_to_let_go() {
        let (r, log) = try_switch(Talk, CTRL_RETURN, None, true, &Map::EVERY, &[], true, true);
        assert_eq!(r, Ok(Map::EVERY.with(Talk, CTRL_RETURN)));
        assert_eq!(log, ["register control-return", "save {\"talk\":\"control-return\"}"]);
    }
    #[test]
    fn use_a_suggestion_while_no_result_shows_is_only_tried_then_let_go() {
        let (r, log) = try_switch(Accept, k(Key::U), None, false, &Map::EVERY, &[], true, true);
        assert_eq!(r, Ok(Map::EVERY.with(Accept, k(Key::U))));
        assert_eq!(log, ["register control-option-command-u", "save {\"accept\":\"control-option-command-u\"}", "unregister control-option-command-u"]);
    }

    fn all_used() -> Using { ACTIONS.map(|a| Some(old(a))) }
    fn try_reset(picked: &Map, using: &Using, registered: &Using, held_elsewhere: &[Chord], saves: bool) -> (Result<Reset, NotChanged>, Vec<String>) {
        let log = calls();
        let r = reset(picked, using, registered, |a| keep_registered(a, false),
            |c| { log.borrow_mut().push(format!("register {}", id(c))); !held_elsewhere.contains(&c) },
            |m| { log.borrow_mut().push(format!("save {}", to_json(m)["keys"])); saves },
            |c| log.borrow_mut().push(format!("unregister {}", id(c))));
        (r, log.into_inner())
    }
    #[test]
    fn reset_puts_every_changed_job_back_to_its_usual_keys_saving_once() {
        // F28: the jobs with no usual keys have none after a reset; what they had is let go once the reset is saved.
        let picked = Map::EVERY.with(Card, k(Key::J)).with(Talk, OPT_RETURN);
        let mut using = all_used(); using[Card.index()] = Some(k(Key::J)); using[Talk.index()] = Some(OPT_RETURN);
        let mut registered = using; registered[Accept.index()] = None;
        let (r, log) = try_reset(&picked, &using, &registered, &[], true);
        assert_eq!(r, Ok(Reset { picked: Map::DEFAULT, using: Map::DEFAULT.0, kept: vec![] }));
        assert_eq!(log, ["register option-space", "save {}", "unregister option-return", "unregister control-option-command-j", "unregister control-option-command-s",
            "unregister control-option-command-e", "unregister control-option-command-c", "unregister option-shift-space"]);
    }
    #[test]
    fn reset_leaves_a_job_whose_usual_keys_another_app_holds_with_what_it_has() {
        let picked = Map::DEFAULT.with(Stop, k(Key::L));
        let mut using = Map::DEFAULT.0; using[Stop.index()] = Some(k(Key::L));
        let (r, log) = try_reset(&picked, &using, &using, &[k(Key::X)], true);
        let r = r.unwrap();
        assert_eq!(r.kept, vec![Stop]); assert_eq!(r.picked, picked); assert_eq!(r.using[Stop.index()], Some(k(Key::L)), "Stop everything keeps working keys");
        assert!(!log.contains(&"unregister control-option-command-l".to_string()), "{log:?}");
    }
    #[test]
    fn reset_forgets_a_choice_that_fell_back_and_turns_on_a_job_whose_usual_keys_are_free_again() {
        let picked = Map::DEFAULT.with(Read, k(Key::J));
        let mut using = Map::DEFAULT.0; using[Talk.index()] = None;   // fell back for Prompt help; hold to talk off since launch
        let (r, log) = try_reset(&picked, &using, &using, &[], true);
        let r = r.unwrap();
        assert_eq!(r.picked, Map::DEFAULT); assert_eq!(r.using, Map::DEFAULT.0); assert!(r.kept.is_empty());
        assert_eq!(log, ["register option-space", "save {}"]);
    }
    #[test]
    fn reset_that_cannot_be_saved_lets_every_new_chord_go_and_changes_nothing() {
        let picked = Map::DEFAULT.with(Problem, k(Key::J));
        let mut using = Map::DEFAULT.0; using[Problem.index()] = Some(k(Key::J));
        let (r, log) = try_reset(&picked, &using, &using, &[], false);
        assert_eq!(r, Err(NotChanged::NotSaved));
        assert_eq!(log, ["register control-option-command-f", "save {}", "unregister control-option-command-f"]);
        // Keys picked for a job with no usual keys are not let go when the reset cannot be saved.
        let picked = Map::DEFAULT.with(Card, k(Key::J));
        let mut using = Map::DEFAULT.0; using[Card.index()] = Some(k(Key::J));
        let (r, log) = try_reset(&picked, &using, &using, &[], false);
        assert_eq!(r, Err(NotChanged::NotSaved)); assert_eq!(log, ["save {}"]);
    }
    #[test]
    fn reset_of_use_a_suggestion_while_no_result_shows_only_tries_its_usual_keys() {
        let picked = Map::DEFAULT.with(Accept, k(Key::U));
        let mut using = Map::DEFAULT.0; using[Accept.index()] = Some(k(Key::U));
        let mut registered = using; registered[Accept.index()] = None;
        let (r, log) = try_reset(&picked, &using, &registered, &[], true);
        assert_eq!(r.unwrap().using, Map::DEFAULT.0);
        assert_eq!(log, ["register control-option-command-a", "save {}", "unregister control-option-command-a"]);
    }
    #[test]
    fn nothing_to_reset_touches_nothing() {
        let (r, log) = try_reset(&Map::DEFAULT, &Map::DEFAULT.0, &Map::DEFAULT.0, &[], true);
        assert_eq!(r.unwrap().kept, vec![]); assert!(log.is_empty(), "{log:?}");
    }

    #[test]
    fn the_shell_wires_the_map_as_these_rules_say() {
        let main = include_str!("main.rs");
        let body = |name: &str| { let s = &main[main.find(name).unwrap_or_else(|| panic!("{name} missing"))..]; s[..s.find("\n}\n").unwrap()].to_string() };
        // A damaged file is written back repaired, so the person is told once; the old hold to talk file goes only after
        // the new one is written.
        let start = body("fn start_keys(");
        assert!(start.contains("keymap::parse(") && start.contains("if damaged || rewrite { let _ = save_keys(&picked); }"), "{start}");
        // F28: what the new usual keys took away is worked out from the file as it was read, before anything is written.
        assert!(start.find("keymap::dropped_by_new_usual(saved.as_deref(), used_before)").unwrap() < start.find("save_keys(&picked)").unwrap(), "{start}");
        assert!(start.contains("keymap::saved_text(std::fs::read(keys_path()))"), "only a missing file is nothing saved: {start}");
        let save = body("fn save_keys(");
        assert!(save.find("write_atomic(").unwrap() < save.find("remove_file(").unwrap() && save.contains("if ok {"), "{save}");
        // Every change or check is a sync command (the main thread, like the plugin's own work), card only, one at a time.
        // Reset and the registry's Reset and Undo (settings_reset, settings_set, T16) go through keys_to_usual and
        // keys_restore, which take the same one at a time lock; the registry's commands check the window first too.
        for c in ["fn key_choices(", "fn set_key(", "fn reset_keys(", "fn settings_set(", "fn settings_reset("] {
            let at = main.find(c).unwrap();
            assert!(main[..at].trim_end().ends_with("#[tauri::command]"), "{c} must be a plain sync command");
            let b = body(c);
            // Home only (settings.rs only_card), never another window.
            let check = b.find("settings::only_card(window.label())").unwrap_or_else(|| panic!("{c} checks no window"));
            let work = ["KEYS_SWITCH.lock()", "keys_to_usual(", "setting_change("].iter().filter_map(|w| b.find(w)).min().unwrap_or_else(|| panic!("{c}"));
            assert!(check < work, "{c}");
        }
        for c in ["fn keys_to_usual(", "fn keys_restore("] { assert!(body(c).contains("KEYS_SWITCH.lock()"), "{c}"); }
        assert!(body("fn arm_now(").contains("KEYS_SWITCH.lock()") && body("fn arm_result_keys(").contains("run_on_main_thread"));
        // New hold to talk keys end a hold still going on the old ones.
        for c in ["fn set_key(", "fn keys_to_usual(", "fn keys_restore("] { let b = body(c); assert!(b.contains("TALK_HELD.lock()") && b.contains("VoiceMsg::Cancel"), "{c}"); }
        // Only the keys in use reach a job, and the one notice comes from these rules.
        assert!(body("fn key_action(").contains("key_using(*a)"));
        assert!(main.contains("keymap::launch_notice(&launch.started, launch.damaged)"));
        // Use a suggestion's keys are taken from other apps only while a result shows (T11), and every other job's keys
        // stay off limits: these rules decide, tested above, and the shell only calls them.
        let line = |name: &str| { let s = &main[main.find(name).unwrap_or_else(|| panic!("{name} missing"))..]; s[..s.find('\n').unwrap()].to_string() };
        assert!(start.contains("keymap::start_held(&picked, &held,") && start.contains("|c| let_go_logged(c, gs.unregister(keymap::shortcut(c)).is_ok())"), "{start}");
        // Whether a job's keys stay registered is still the rule here (keep_registered), with a job held back by its group
        // switched off counted in one place (key_keep, groups.rs).
        assert!(line("fn key_keep(").contains("{ keymap::keep_registered_in(a, armed, key_held(a)) }"));
        assert!(body("fn set_key(").contains("let keep = key_keep(a, ACCEPT_ARMED.load(Ordering::SeqCst));"));
        assert!(body("fn set_key(").contains("keymap::switch(a, wanted, before, keep, &picked, &key_others(a, &picked),"));
        assert!(body("fn keys_to_usual(").contains("keymap::reset(&picked, &using, &registered, |a| key_keep(a, armed),"));
        assert!(body("fn keys_restore(").contains("let keep = key_keep(a, ACCEPT_ARMED.load(Ordering::SeqCst));"));
        assert!(body("fn keys_to_usual(").contains("let registered = keymap::ACTIONS.map(key_registered);"));
        assert!(line("fn key_registered(").contains("{ keymap::registered(a, key_using(a), ACCEPT_ARMED.load(Ordering::SeqCst)).filter(|_| !key_held(a)) }"));
        assert!(body("fn key_others(").contains("keymap::others(a, &keys_using(), picked)"));
        assert!(body("fn key_choices(").contains("keymap::free(a, key_registered(a), &key_others(a, &keys_picked()),"));
        assert!(!main.contains("armed_only()"), "no job's rule for when its keys stay registered is decided in main.rs");
        // Each result tries the use keys again (keymap::arm), and the answer names only the keys taken for it.
        let arm_body = body("fn arm_now(");
        assert!(arm_body.contains("keymap::arm(accept, was, &keys_picked(), |c| gs.register(keymap::shortcut(c)).is_ok())"), "{arm_body}");
        assert!(arm_body.contains("if got != was { set_key_using(accept, got);") && arm_body.contains("ACCEPT_ARMED.store(got.is_some(), Ordering::SeqCst);"), "{arm_body}");
        assert!(body("#[tauri::command] fn ph_ready(").contains("arm_result_keys(&app, true); key_registered(keymap::Action::Accept).map(keymap::id)"));
    }
    #[test]
    fn the_result_keys_go_back_whichever_way_home_closes() {
        // Use a suggestion's keys and the bare Esc work in every app while a Prompt help result shows (T11). Every way Home
        // goes away (Esc or Close, the island or the character clicked again, a full screen app, Hide in the menu bar)
        // orders the card out and then runs home_closed, which gives them back, so none of them can leave the keys taken
        // for a result nobody can see.
        let main = include_str!("main.rs");
        let body = |name: &str| { let s = &main[main.find(name).unwrap_or_else(|| panic!("{name} missing"))..]; s[..s.find("\n}\n").unwrap()].to_string() };
        let closed = body("fn home_closed(");
        assert!(closed.contains("std::thread::spawn(move || arm_result_keys(&a, false))"), "home_closed gives the keys back, on its own thread: {closed}");
        let outs: Vec<usize> = main.match_indices("c.orderOut(None)").map(|(i, _)| i).collect();
        assert_eq!(outs.len(), 3, "close_home_rolled (for close_card and toggle_home), the full screen hide and Hide in the menu bar");
        for f in ["fn close_card(", "fn toggle_home("] { assert!(body(f).contains("close_home_rolled("), "{f} closes through close_home_rolled"); }
        for at in outs {
            let rest = &main[at..];
            let next = rest.find("home_closed();").unwrap_or_else(|| panic!("the card is ordered out at {at} with no home_closed after it"));
            assert!(!rest[..next].contains("\nfn "), "the card is ordered out at {at} and home_closed is not in the same function");
        }
        // close_card has no second way of its own: the one in home_closed is the only one.
        assert!(!body("fn close_card(").contains("arm_result_keys"));
        // The keys are taken only while Home shows the result of the request waiting now.
        let ready = body("#[tauri::command] fn ph_ready(");
        assert!(ready.contains("if !card_visible()") && ready.find("card_visible()").unwrap() < ready.find("arm_result_keys(&app, true)").unwrap(), "{ready}");
        assert!(main.contains("#[tauri::command] fn ph_disarm(app: AppHandle) { arm_result_keys(&app, false); }"));
    }
    #[test]
    fn the_page_is_told_every_jobs_keys_now_and_picked() {
        let mut using = all_used(); using[Talk.index()] = None;
        let v = state_json(&using, &Map::EVERY.with(Card, k(Key::J)));
        assert_eq!(v["using"]["card"], "control-option-command-k"); assert_eq!(v["using"]["talk"], Value::Null);
        assert_eq!(v["picked"]["card"], "control-option-command-j"); assert_eq!(v["picked"]["stop"], "control-option-command-x");
        assert_eq!(v["using"].as_object().unwrap().len(), N); assert_eq!(v["picked"].as_object().unwrap().len(), N);
    }
    #[test]
    fn the_page_is_told_a_jobs_list_what_can_be_pressed_and_which_job_has_the_rest() {
        let f = Free { free: vec![OPT_SPACE, CTRL_RETURN], ours: vec![] };
        assert_eq!(choices_json(Talk, &f), json!({ "action": "talk", "choices": ["option-space", "option-return", "control-return"], "free": ["option-space", "control-return"], "ours": {} }));
        let g = Free { free: vec![k(Key::K)], ours: vec![(k(Key::J), ShowMe)] };
        assert_eq!(choices_json(Card, &g)["ours"], json!({ "control-option-command-j": "showme" }));
    }

    // ---- finding L: any chord, picked by ticking modifiers and choosing a key ----
    const fn m(mods: u8, key: Key) -> Chord { Chord::new(mods, key) }
    #[test]
    fn a_picked_chord_needs_two_modifiers_and_one_of_them_control_or_command() {
        for c in [m(CONTROL | OPTION, Key::Z), m(CONTROL | COMMAND, Key::N7), m(CONTROL | SHIFT, Key::M), m(COMMAND | SHIFT, Key::Space), m(LETTER, Key::V), m(LETTER | SHIFT, Key::Return), m(COMMAND | OPTION, Key::G)] {
            assert!(custom_ok(c), "{}", id(c));
        }
        // One modifier (it would be typed in other apps, or taken by them), none, or only Option and Shift (they type characters).
        for c in [m(CONTROL, Key::Z), m(OPTION, Key::Z), m(SHIFT, Key::Z), m(COMMAND, Key::Z), m(0, Key::Z), m(OPTION | SHIFT, Key::A), m(OPTION | SHIFT, Key::N1)] {
            assert!(!custom_ok(c), "{}", id(c));
        }
        assert_eq!(why_not(m(OPTION | SHIFT, Key::A)), Some(NotChanged::NotEnoughKeys));
        assert_eq!(why_not(m(CONTROL, Key::A)), Some(NotChanged::NotEnoughKeys));
        assert_eq!(why_not(m(CONTROL | OPTION, Key::A)), None);
    }
    #[test]
    fn the_macs_own_shortcuts_are_never_taken() {
        for c in [m(COMMAND | SHIFT, Key::N3), m(COMMAND | SHIFT, Key::N4), m(COMMAND | SHIFT, Key::N5), m(COMMAND | SHIFT, Key::Q), m(CONTROL | COMMAND, Key::Q),
                  m(COMMAND | OPTION, Key::D), m(CONTROL | COMMAND, Key::Space), m(COMMAND | OPTION, Key::Space)] {
            assert!(!custom_ok(c), "{}", id(c));
            assert_eq!(why_not(c), Some(NotChanged::Reserved), "{}", id(c));
        }
        assert_eq!(why_not(m(COMMAND | SHIFT, Key::N2)), None, "only the named ones");
    }
    #[test]
    fn every_key_a_person_can_pick_has_its_own_name_and_keys_and_reads_back() {
        assert_eq!(KEYS.len(), 38, "26 letters, 10 digits, Space and Return");
        let ids: std::collections::HashSet<_> = KEYS.iter().map(|k| k.2).collect();
        let codes: std::collections::HashSet<_> = KEYS.iter().map(|k| format!("{:?}", k.1)).collect();
        assert_eq!((ids.len(), codes.len()), (38, 38));
        for (i, (key, _, kid, word)) in KEYS.iter().enumerate() {
            assert_eq!(*key as usize, i, "the table is in the order of the enum");
            let c = Chord::new(CONTROL | COMMAND, *key);
            assert_eq!(from_id(&id(c)), Some(c), "{kid}"); assert_eq!(decode(encode(c)), Some(c));
            assert_eq!(label(c), format!("Control, Command and {word}"));
        }
        assert_eq!(id(m(CONTROL | SHIFT, Key::N7)), "control-shift-7"); assert_eq!(label(m(CONTROL | SHIFT, Key::N7)), "Control, Shift and 7");
        assert_eq!(shortcut(m(CONTROL | SHIFT, Key::N7)), Shortcut::new(Some(Modifiers::CONTROL | Modifiers::SHIFT), Code::Digit7));
    }
    #[test]
    fn the_preset_lists_are_unchanged() {
        assert_eq!(choices(Card).len(), 8); assert_eq!(choices(Talk).len(), 3);
        for a in ACTIONS { for c in choices(a) { assert_ne!(shortcut(c).key, Code::KeyV); } }
    }
    #[test]
    fn a_picked_chord_is_registered_saved_and_the_old_keys_let_go_like_any_change() {
        let want = m(CONTROL | OPTION, Key::Z);
        let (r, log) = try_switch(Card, want, Some(k(Key::K)), true, &Map::EVERY, &[], true, true);
        assert_eq!(r, Ok(Map::EVERY.with(Card, want)));
        assert_eq!(log, ["register control-option-z", "save {\"card\":\"control-option-z\"}", "unregister control-option-command-k"]);
        // Hold to talk may take one too.
        let (r, _) = try_switch(Talk, m(CONTROL | SHIFT, Key::M), Some(OPT_SPACE), true, &Map::EVERY, &[], true, true);
        assert_eq!(r, Ok(Map::EVERY.with(Talk, m(CONTROL | SHIFT, Key::M))));
    }
    #[test]
    fn a_picked_chord_another_app_holds_or_another_job_has_changes_nothing() {
        let want = m(CONTROL | OPTION, Key::Z);
        let (r, log) = try_switch(Card, want, Some(k(Key::K)), true, &Map::EVERY, &[], false, true);
        assert_eq!(r, Err(NotChanged::Taken)); assert_eq!(log, ["register control-option-z"]);
        let (r, log) = try_switch(Card, want, Some(k(Key::K)), true, &Map::EVERY.with(Read, want), &[(Read, want)], true, true);
        assert_eq!(r, Err(NotChanged::InUse)); assert!(log.is_empty());
    }
    #[test]
    fn a_chord_that_cannot_be_picked_never_reaches_the_keyboard_service() {
        for (c, why) in [(m(OPTION, Key::Z), NotChanged::NotEnoughKeys), (m(OPTION | SHIFT, Key::Z), NotChanged::NotEnoughKeys), (m(COMMAND | SHIFT, Key::N4), NotChanged::Reserved), (m(CONTROL | COMMAND, Key::Q), NotChanged::Reserved)] {
            let (r, log) = try_switch(Card, c, Some(k(Key::K)), true, &Map::EVERY, &[], true, true);
            assert_eq!(r, Err(why), "{}", id(c)); assert!(log.is_empty(), "{}", id(c));
        }
    }
    #[test]
    fn picked_chords_are_saved_and_read_back_and_a_file_with_a_bad_one_is_repaired() {
        let picked = Map::EVERY.with(Card, m(CONTROL | OPTION, Key::Z)).with(Talk, m(CONTROL | SHIFT, Key::M));
        assert_eq!(parse(Some(&to_json(&picked).to_string()), None), (picked, false));
        // A hand edited file is checked the same way as a change: the page is never trusted, nor the file.
        for bad in ["option-z", "option-shift-z", "command-shift-4", "control-command-q"] {
            let (got, damaged) = parse(Some(&format!("{{\"keys\":{{\"card\":\"{bad}\",\"stop\":\"control-option-z\"}}}}")), None);
            assert!(damaged, "{bad}"); assert_eq!(got, Map::DEFAULT.with(Stop, m(CONTROL | OPTION, Key::Z)), "{bad}");
        }
        // The old hold to talk file only ever held its three presets.
        assert_eq!(parse(None, Some("{\"holdToTalk\":\"control-option-z\"}")), (Map::DEFAULT, false));
    }

    // ---- F28: four jobs with keys by usual, and an install from before keeps every key the person picked ----

    fn fixture() -> Value { serde_json::from_str(include_str!("../../../protocol/fixtures/launch-cut.json")).unwrap() }
    fn map_of(v: &Value) -> Map {
        let mut m = Map([None; N]);
        for a in ACTIONS { m.0[a.index()] = v[a.id()].as_str().map(|s| from_id(s).unwrap_or_else(|| panic!("{s}"))); }
        m
    }
    #[test]
    fn the_usual_keys_are_f28s_four_jobs_and_use_a_suggestion_and_the_rest_have_none() {
        let f = fixture();
        for (job, chord) in f["keys"]["bound"].as_object().unwrap() {
            let a = Action::from_id(job).unwrap();
            assert_eq!(default(a).map(id).as_deref(), chord.as_str(), "{job}");
            assert_eq!(default(a), Some(suggested(a)), "{job}: its usual keys are its own suggested ones");
        }
        let unbound: Vec<&str> = f["keys"]["unbound"].as_array().unwrap().iter().map(|v| v.as_str().unwrap()).collect();
        for a in ACTIONS { assert_eq!(default(a).is_none(), unbound.contains(&a.id()), "{a:?}"); }
        assert_eq!(unbound.len() + f["keys"]["bound"].as_object().unwrap().len(), N);
        assert!(default(Stop).is_some() && default(Talk).is_some(), "rule 11: Stop everything always has keys by usual");
        // A job with no keys still offers its own suggested keys first.
        for a in ACTIONS { assert_eq!(choices(a)[0], suggested(a), "{a:?}"); }
    }
    #[test]
    fn an_install_from_before_keeps_every_key_the_person_picked_and_only_old_usual_keys_go() {
        for c in fixture()["keyMigration"].as_array().unwrap() {
            let name = c["name"].as_str().unwrap();
            let saved = c["saved"].as_str();
            let old_talk = c.get("oldTalk").and_then(Value::as_str);
            let (m, damaged) = parse(saved, old_talk);
            assert!(!damaged, "{name}");
            assert_eq!(m, map_of(&c["keys"]), "{name}");
            let dropped: Vec<&str> = dropped_by_new_usual(saved, c["usedBefore"].as_bool().unwrap()).iter().map(|a| a.id()).collect();
            let want: Vec<&str> = c["dropped"].as_array().unwrap().iter().map(|v| v.as_str().unwrap()).collect();
            assert_eq!(dropped, want, "{name}");
            // Written once on the new usual keys, it reads back the same and nothing more is taken.
            let file = file_json(&m, &dropped_by_new_usual(saved, c["usedBefore"].as_bool().unwrap())).to_string();
            assert!(on_new_usual(Some(&file)), "{name}");
            assert_eq!(parse(Some(&file), None), (m, false), "{name}");
            assert_eq!(dropped_by_new_usual(Some(&file), true).iter().map(|a| a.id()).collect::<Vec<_>>(), want, "{name}: still to be said");
            let seen = file_json(&m, &[]).to_string();
            assert!(dropped_by_new_usual(Some(&seen), true).is_empty(), "{name}: said once");
        }
        // Never a job that has keys by usual, and a file from before with no keys entry at all counts as nothing picked.
        assert!(dropped_by_new_usual(Some("not json"), true).iter().all(|a| default(*a).is_none()));
        assert!(!on_new_usual(None) && !on_new_usual(Some("{\"keys\":{}}")) && !on_new_usual(Some("{\"keys\":{},\"usual\":1}")));
    }
    #[test]
    fn a_job_with_no_keys_tries_nothing_at_launch_and_the_launch_notice_says_nothing_about_it() {
        let (s, asked) = ask(&[], &Map::DEFAULT);
        for a in ACTIONS {
            if default(a).is_none() { assert_eq!(s[a.index()], Started::NoKeys, "{a:?}"); assert!(!asked.iter().any(|l| l.starts_with(&format!("{} ", a.id()))), "{a:?}"); }
            else { assert_eq!(s[a.index()], Started::Ready(default(a).unwrap()), "{a:?}"); }
        }
        assert_eq!(launch_notice(&s, false), None);
        assert_eq!(Started::NoKeys.using(), None); assert_eq!(Started::NoKeys.picked(), None);
        // Picked keys another app holds, for a job with no usual keys: it has none for now, and the notice says so.
        let (s, _) = ask(&[k(Key::J)], &Map::DEFAULT.with(Card, k(Key::J)));
        assert_eq!(s[Card.index()], Started::Taken(k(Key::J)));
        assert!(launch_notice(&s, false).unwrap().contains("open the ask box"));
    }
    #[test]
    fn a_job_with_no_keys_can_be_given_its_own_suggested_keys_and_no_other_job_can_take_them() {
        let (r, log) = try_switch(ShowMe, k(Key::S), None, true, &Map::DEFAULT, &[], true, true);
        assert_eq!(r, Ok(Map::DEFAULT.with(ShowMe, k(Key::S))));
        assert_eq!(log[0], "register control-option-command-s");
        // Open Home has no keys yet, but its own K is still kept for it.
        assert_eq!(try_switch(Stop, k(Key::K), Some(k(Key::X)), true, &Map::DEFAULT, &[], true, true).0, Err(NotChanged::InUse));
        // And with no keys, nobody clashes.
        assert!(clashes(&Map::DEFAULT).is_empty() && clashes(&Map([None; N])).is_empty());
    }
    #[test]
    fn no_keys_is_written_as_null_only_where_the_usual_keys_were_taken_away_and_never_for_stop_everything() {
        let m = Map::DEFAULT.without(Read).with(Card, k(Key::J));
        assert_eq!(to_json(&m), json!({ "keys": { "card": "control-option-command-j", "read": null } }));
        assert_eq!(parse(Some(&to_json(&m).to_string()), None), (m, false));
        assert_eq!(parse(Some("{\"keys\":{\"stop\":null}}"), None), (Map::DEFAULT, true), "Stop everything never loses its keys");
        assert_eq!(file_json(&Map::DEFAULT, &[Card, ShowMe]), json!({ "keys": {}, "usual": 2, "dropped": ["card", "showme"] }));
        assert_eq!(file_json(&Map::DEFAULT, &[]), json!({ "keys": {}, "usual": 2 }));
        assert_eq!(state_json(&Map::DEFAULT.0, &Map::DEFAULT)["picked"]["card"], Value::Null);
    }
}
