//! The settings registry (T16): one list of every setting a person can change (`protocol/settings.json`, read here with
//! include_str!, and by the pages and the engine through `protocol/settings.ts`), the rules for what each value may be,
//! and Companion's own settings file, `settings.json` in the data folder. This module is plain code with no window, no
//! Keychain and no network: main.rs does the reading, writing and telling the pages.
//!
//! Rules that never bend here:
//!  - Only the shell writes settings.json (pages call `settings_set`, card only). It is written whole and atomically, owner
//!    only (0600). Only values that differ from the usual one are kept, so putting a setting back means removing it.
//!  - Names this version does not know, and fields it does not know, are kept untouched, so going back a version loses nothing.
//!  - A project's values are kept under a hash of its folder ("p_" and 12 hex of its sha256), never under the path.
//!  - A file that is not JSON is moved aside as settings.damaged.json and Companion starts on the usual values. One bad
//!    value falls back to its usual value; both are listed as problems, never thrown.
//!  - Protective settings (lists a person adds protections to) are never touched by Reset this section or Reset all.
//!  - The values are checked with the same rules as `protocol/settings.ts`; both run `protocol/fixtures/settings-cases.jsonl`.
//!  - Refusals are codes (the same as settings.ts); the pages put them in words.
use serde_json::{json, Map, Value};
use sha2::{Digest, Sha256};
use std::path::{Path, PathBuf};
use std::sync::OnceLock;

pub const REGISTRY_TEXT: &str = include_str!("../../../protocol/settings.json");
pub const FILE: &str = "settings.json";
pub const DAMAGED: &str = "settings.damaged.json";
/// The problem code for a settings.json that is there but could not be read (no permission, an I/O error, a folder in its
/// place): it is never moved aside or saved over (`ready_to_save`).
pub const UNREADABLE: &str = "unreadable";
/// The one migration so far: the choices the pages kept in their own storage before the registry.
pub const PAGE_STORAGE_MARK: &str = "pageStorage.v1";
/// The stores the engine keeps itself, reached only through its own commands (spending.set, explain.set, memory.pause,
/// metrics.set), which only the shell sends.
pub const RUNNER_STORES: &[&str] = &["spending", "memory", "metrics"];
#[cfg_attr(not(test), allow(dead_code))]   // the registry is checked by the tests; the app reads the shipped one
const STORES: &[&str] = &["settings", "dock", "presentation", "keys", "voice", "promptHelpApps", "spending", "memory", "metrics", "rules"];
/// The stores with their own editor, shown by a custom row: the keys, the voice, and the per app answers (prompt_help.json).
#[cfg_attr(not(test), allow(dead_code))]   // the registry is checked by the tests; the app reads the shipped one
pub const EDITOR_STORES: &[&str] = &["keys", "voice", "promptHelpApps"];
/// The one custom setting that holds protections a person added (apps never to read): never reset, only its own controls.
#[cfg_attr(not(test), allow(dead_code))]   // the registry is checked by the tests; the app reads the shipped one
pub const PROTECTIVE_EDITOR: &str = "promptHelpApps";
#[cfg_attr(not(test), allow(dead_code))]   // the registry is checked by the tests; the app reads the shipped one
const UNITS: &[&str] = &["dollars", "seconds", "minutes", "percent", "count", "words"];
#[cfg_attr(not(test), allow(dead_code))]   // the registry is checked by the tests; the app reads the shipped one
const MAPS: &[&str] = &["isOn", "notOff", "isOne", "notZero", "textSize"];
#[cfg_attr(not(test), allow(dead_code))]   // the registry is checked by the tests; the app reads the shipped one
const APPLIES: &[&str] = &["shell", "runner", "pages"];

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Kind { Switch, Choice, Number, Text, List, Custom }
impl Kind {
    fn from(s: &str) -> Option<Kind> {
        Some(match s { "switch" => Kind::Switch, "choice" => Kind::Choice, "number" => Kind::Number, "text" => Kind::Text, "list" => Kind::List, "custom" => Kind::Custom, _ => return None })
    }
}

/// One setting, as the registry describes it.
#[derive(Clone, Debug, PartialEq)]
pub struct Def {
    pub key: String, pub section: String, pub kind: Kind, pub default: Value,
    pub options: Vec<String>, pub options_from: Option<String>, pub min: f64, pub max: f64, pub step: f64, pub unit: String,
    pub max_length: usize, pub max_items: usize, pub item_max_length: usize, pub allowed_items: Option<Vec<String>>,
    /// A list's items must also have this shape: empty for any one line, or "appId" (an app's bundle id, as stored for
    /// Apps that count as a call: ids only, never anything else, rule 7).
    pub item_shape: String,
    pub project: bool, pub applies: Vec<String>, pub store: String, pub live: bool, pub protective: bool,
    pub floor: Option<String>, pub renamed_from: Vec<String>, pub from_page: Option<(String, String)>,
}
impl Def {
    pub fn applies_to(&self, who: &str) -> bool { self.applies.iter().any(|a| a == who) }
    pub fn runner_store(&self) -> bool { RUNNER_STORES.contains(&self.store.as_str()) }
}

#[derive(Clone, Debug, PartialEq)]
pub struct Registry { pub version: u64, pub sections: Vec<String>, pub defs: Vec<Def>, problems: Vec<String> }
impl Registry {
    pub fn get(&self, key: &str) -> Option<&Def> { self.defs.iter().find(|d| d.key == key) }
    pub fn in_section(&self, section: &str) -> Vec<&Def> { self.defs.iter().filter(|d| d.section == section).collect() }
}

#[cfg_attr(not(test), allow(dead_code))]   // the registry is checked by the tests; the app reads the shipped one
fn key_ok(k: &str) -> bool {
    let parts: Vec<&str> = k.split('.').collect();
    parts.len() >= 2 && parts.iter().all(|p| p.chars().next().is_some_and(|c| c.is_ascii_lowercase()) && p.chars().all(|c| c.is_ascii_alphabetic()))
}

/// Reads a registry. What cannot even be read as a definition is a problem in `check_registry`, never a panic.
pub fn parse_registry(text: &str) -> Result<Registry, String> {
    let v: Value = serde_json::from_str(text).map_err(|e| format!("the registry is not JSON: {e}"))?;
    let mut problems = vec![];
    let strs = |v: Option<&Value>| -> Vec<String> { v.and_then(Value::as_array).map(|a| a.iter().filter_map(|x| x.as_str().map(str::to_string)).collect()).unwrap_or_default() };
    let sections = strs(v.get("sections"));
    let mut defs = vec![];
    for d in v.get("settings").and_then(Value::as_array).cloned().unwrap_or_default() {
        let s = |k: &str| d.get(k).and_then(Value::as_str).unwrap_or("").to_string();
        let n = |k: &str| d.get(k).and_then(Value::as_f64).unwrap_or(f64::NAN);
        let u = |k: &str| d.get(k).and_then(Value::as_u64).unwrap_or(0) as usize;
        let key = s("key");
        let Some(kind) = Kind::from(&s("kind")) else { problems.push(format!("{key}: its kind does not exist")); continue };
        let page = d.get("from").map(|f| f.get("pageStorage").map(|p| (p.get("name").and_then(Value::as_str).unwrap_or("").to_string(), p.get("map").and_then(Value::as_str).unwrap_or("").to_string())).unwrap_or_default());
        let scope = s("scope");
        if scope != "app" && scope != "project" { problems.push(format!("{key}: scope must be app or project")); }
        if !d.get("live").is_some_and(Value::is_boolean) { problems.push(format!("{key}: live must be true or false")); }
        if d.get("protective").is_some_and(|p| !p.is_boolean()) { problems.push(format!("{key}: protective must be true or false")); }
        if d.get("floor").is_some_and(|f| !f.as_str().is_some_and(|t| !t.is_empty())) { problems.push(format!("{key}: floor must name its words")); }
        defs.push(Def {
            key: key.clone(), section: s("section"), kind, default: d.get("default").cloned().unwrap_or(Value::Null),
            options: strs(d.get("options")), options_from: d.get("optionsFrom").and_then(Value::as_str).map(str::to_string), min: n("min"), max: n("max"), step: n("step"), unit: s("unit"),
            max_length: u("maxLength"), max_items: u("maxItems"), item_max_length: d.get("item").and_then(|i| i.get("maxLength")).and_then(Value::as_u64).unwrap_or(0) as usize,
            item_shape: d.get("item").and_then(|i| i.get("shape")).map(|x| x.as_str().unwrap_or("?").to_string()).unwrap_or_default(),
            allowed_items: d.get("allowedItems").map(|a| strs(Some(a))),
            project: scope == "project", applies: strs(d.get("applies")), store: s("store"), live: d.get("live").and_then(Value::as_bool).unwrap_or(false),
            protective: d.get("protective").and_then(Value::as_bool).unwrap_or(false), floor: d.get("floor").and_then(Value::as_str).map(str::to_string),
            renamed_from: strs(d.get("renamedFrom")), from_page: page,
        });
    }
    Ok(Registry { version: v.get("version").and_then(Value::as_u64).unwrap_or(0), sections, defs, problems })
}

/// Everything wrong with a registry, in developer words (empty when it is fine): the same checks as settings.ts.
#[cfg_attr(not(test), allow(dead_code))]   // the registry is checked by the tests; the app reads the shipped one
pub fn check_registry(r: &Registry) -> Vec<String> {
    let mut out = r.problems.clone();
    if r.version != 1 { out.push("version must be 1".into()); }
    let mut seen_sections = std::collections::BTreeSet::new();
    if r.sections.is_empty() || !r.sections.iter().all(|s| seen_sections.insert(s.clone()) && s.chars().next().is_some_and(|c| c.is_ascii_lowercase()) && s.chars().all(|c| c.is_ascii_alphabetic())) { out.push("sections must be unique lowerCamel names".into()); }
    let mut keys = std::collections::BTreeSet::new();
    for d in &r.defs {
        let mut bad = |m: &str| out.push(format!("{}: {m}", d.key));
        if !key_ok(&d.key) { bad("the name must be dotted lowerCamel"); }
        if !keys.insert(d.key.clone()) { bad("the name is used twice"); }
        for old in &d.renamed_from { if !key_ok(old) || r.defs.iter().any(|x| &x.key == old) { bad("an old name is not usable"); } }
        if !r.sections.contains(&d.section) { bad("its section does not exist"); }
        let mut uniq = std::collections::BTreeSet::new();
        if d.applies.is_empty() || !d.applies.iter().all(|a| APPLIES.contains(&a.as_str()) && uniq.insert(a.clone())) { bad("applies must name shell, runner or pages"); }
        if !STORES.contains(&d.store.as_str()) { bad("its store does not exist"); }
        if d.protective && d.kind != Kind::List && !(d.kind == Kind::Custom && d.store == PROTECTIVE_EDITOR) { bad("only a list (or the per app answers) can be protective"); }
        if d.kind == Kind::Custom {
            if !EDITOR_STORES.contains(&d.store.as_str()) { bad("custom is only for the editors that already exist"); }
            if !d.default.is_null() { bad("a custom setting's usual value lives in its own store"); }
            continue;
        }
        if EDITOR_STORES.contains(&d.store.as_str()) { bad("that store has its own editor"); }
        if d.store == "rules" && !(d.kind == Kind::List && d.protective && d.project) { bad("the house rules file holds only a protective list for a project"); }
        if d.options_from.as_deref().is_some_and(|f| f != "projectScripts") || (d.options_from.is_some() && d.kind != Kind::Choice) { bad("only a choice can take its other options from the project's scripts"); }
        if d.runner_store() && (d.applies != ["runner"] || d.project) { bad("the engine's own stores are applied by the engine, for every project"); }
        if d.kind == Kind::Choice { let mut u = std::collections::BTreeSet::new(); if d.options.len() < if d.options_from.is_some() { 1 } else { 2 } || !d.options.iter().all(|o| !o.is_empty() && u.insert(o.clone())) { bad("a choice needs two or more different options"); } }
        if d.kind == Kind::Number {
            if !(d.min.is_finite() && d.max.is_finite() && d.step.is_finite() && d.min < d.max && d.step > 0.0) { bad("a number needs min below max and a step above 0"); }
            else { let n = (d.max - d.min) / d.step; if (n - n.round()).abs() > 1e-9 { bad("the step must fit from min to max"); } }
            if !UNITS.contains(&d.unit.as_str()) { bad("a number needs a unit"); }
        }
        if d.kind == Kind::Text && d.max_length == 0 { bad("text needs a maxLength"); }
        if d.kind == Kind::List {
            if d.max_items == 0 { bad("a list needs maxItems"); }
            match &d.allowed_items {
                Some(a) => { let mut u = std::collections::BTreeSet::new(); if a.is_empty() || !a.iter().all(|x| u.insert(x.clone())) { bad("allowedItems must be different words"); } }
                None => if d.item_max_length == 0 { bad("a list needs item.maxLength or allowedItems"); },
            }
            if !ITEM_SHAPES.contains(&d.item_shape.as_str()) { bad("item.shape must be one the rules know (appId)"); }
        }
        if let Some((name, map)) = &d.from_page {
            if name.is_empty() || !MAPS.contains(&map.as_str()) { bad("its migration names a map that does not exist"); }
            if d.store != "settings" { bad("only settings kept in settings.json migrate from page storage"); }
        }
        match validate(d, &d.default) { Ok(v) if same(&v, &d.default) => {}, _ => bad("its usual value does not pass its own rules") }
    }
    out
}

/// The registry that ships with this version. A broken one is a build mistake the tests catch, so it is read once.
pub fn registry() -> &'static Registry {
    static R: OnceLock<Registry> = OnceLock::new();
    R.get_or_init(|| parse_registry(REGISTRY_TEXT).expect("protocol/settings.json is part of the build"))
}

// ---------- what a value may be (the same rules as protocol/settings.ts) ----------

/// Two values are the same setting value: numbers compared as numbers (80 and 80.0), at any depth (a voice's speed of 1
/// read back from a page is the 1.0 it was), everything else exactly.
pub fn same(a: &Value, b: &Value) -> bool {
    match (a, b) {
        (Value::Number(x), Value::Number(y)) => x.as_f64() == y.as_f64(),
        (Value::Array(x), Value::Array(y)) => x.len() == y.len() && x.iter().zip(y).all(|(p, q)| same(p, q)),
        (Value::Object(x), Value::Object(y)) => x.len() == y.len() && x.iter().all(|(k, p)| y.get(k).is_some_and(|q| same(p, q))),
        _ => a == b,
    }
}
fn half(x: f64) -> f64 { (x + 0.5).floor() }
/// A number on its nearest step from min, tidied to ten places, never past max. Written as a whole number when it is one.
pub fn snap(v: f64, min: f64, step: f64, max: f64) -> Value {
    let n = (half((min + half((v - min) / step) * step) * 1e10) / 1e10).min(max);
    if n.fract() == 0.0 && n.abs() < 9.0e15 { json!(n as i64) } else { json!(n) }
}
/// The item shapes a list may ask for (none, or an app's bundle id).
const ITEM_SHAPES: [&str; 2] = ["", "appId"];
/// An app's bundle id as macOS gives them: letters, digits, dots, dashes and underscores, up to 200 characters, never
/// starting with a dot or holding two dots in a row. The same rule as settings.ts `appIdOk`.
pub fn app_id_ok(id: &str) -> bool {
    !id.is_empty() && id.len() <= 200 && !id.starts_with('.') && !id.contains("..") && id.chars().all(|c| c.is_ascii_alphanumeric() || ".-_".contains(c))
}
fn one_line(v: &Value, max: usize) -> Result<String, &'static str> {
    let Some(s) = v.as_str() else { return Err("notText") };
    if s.chars().any(|c| { let n = c as u32; n <= 0x1f || (0x7f..=0x9f).contains(&n) || n == 0x2028 || n == 0x2029 }) { return Err("notOneLine"); }
    let t = s.trim_matches(' ');
    if t.chars().count() > max { return Err("tooLong"); }
    if !t.is_empty() && crate::redact::is_sensitive(t) { return Err("secret"); }
    Ok(t.to_string())
}

/// A choice whose other options come from the project (check.start) takes a script's name, never a command: a letter or
/// digit first, then letters, digits and : . _ -, up to 60 of them (the same as settings.ts SCRIPT_NAME).
pub fn script_name(s: &str) -> bool {
    let b = s.as_bytes();
    !b.is_empty() && b.len() <= 60 && b[0].is_ascii_alphanumeric() && b.iter().all(|c| c.is_ascii_alphanumeric() || b":._-".contains(c))
}

/// And only a script that starts the project: dev, develop, start, serve or preview, alone or with more after a : . _ or -
/// (dev:web, start.local). Never a build, a lint, the tests, an install step or a deploy (the same as settings.ts
/// isStartScript); the engine checks again at use that the script is there and does not sound like it deploys or deletes.
pub fn start_script(s: &str) -> bool {
    const WORDS: [&str; 5] = ["dev", "develop", "start", "serve", "preview"];
    script_name(s) && WORDS.iter().any(|w| s == *w || (s.len() > w.len() + 1 && s.starts_with(w) && b":._-".contains(&s.as_bytes()[w.len()])))
}

/// Checks one value against its definition and gives it back tidied (trimmed, on its step). The error is a code.
pub fn validate(d: &Def, v: &Value) -> Result<Value, &'static str> {
    match d.kind {
        Kind::Switch => v.as_bool().map(Value::Bool).ok_or("notSwitch"),
        Kind::Choice => v.as_str().filter(|s| d.options.iter().any(|o| o == s) || (d.options_from.as_deref() == Some("projectScripts") && start_script(s))).map(|s| json!(s)).ok_or("notChoice"),
        Kind::Number => {
            let Some(n) = v.as_f64().filter(|_| v.is_number()) else { return Err("notNumber") };
            if !n.is_finite() { return Err("notNumber"); }
            if n < d.min { return Err("tooLow"); }
            if n > d.max { return Err("tooHigh"); }
            Ok(snap(n, d.min, d.step, d.max))
        }
        Kind::Text => one_line(v, d.max_length).map(Value::String),
        Kind::List => {
            let Some(items) = v.as_array() else { return Err("notList") };
            if items.len() > d.max_items { return Err("tooMany"); }
            let mut out: Vec<String> = vec![];
            for item in items {
                let one = match &d.allowed_items {
                    Some(allowed) => { let Some(s) = item.as_str() else { return Err("notText") }; if !allowed.iter().any(|a| a == s) { return Err("notAllowed"); } s.to_string() }
                    None => {
                        let s = one_line(item, d.item_max_length)?;
                        if s.is_empty() { return Err("empty"); }
                        if d.item_shape == "appId" && !app_id_ok(&s) { return Err("notAppId"); }
                        s
                    }
                };
                if out.contains(&one) { return Err("duplicate"); }
                out.push(one);
            }
            Ok(json!(out))
        }
        Kind::Custom => Err("custom"),
    }
}
#[cfg_attr(not(test), allow(dead_code))]   // the registry is checked by the tests; the app reads the shipped one
pub fn validate_key(r: &Registry, key: &str, v: &Value) -> Result<Value, &'static str> {
    r.get(key).ok_or("unknown").and_then(|d| validate(d, v))
}

// ---------- the settings file ----------

/// What settings.json holds. `values` are the app's values, `projects` each project's (under its hash), `migrated` the
/// migrations already run, `extra` any other field (kept as it is).
#[derive(Clone, Debug, Default, PartialEq)]
pub struct File { pub values: Map<String, Value>, pub projects: Map<String, Value>, pub migrated: Vec<String>, pub extra: Map<String, Value> }

/// Something wrong with what was read: the whole file (`damaged`, key None) or one value (`badValue`).
#[derive(Clone, Debug, PartialEq)]
pub struct Problem { pub key: Option<String>, pub code: &'static str }
impl Problem { pub fn to_json(&self) -> Value { json!({ "key": self.key, "code": self.code }) } }

/// The key a project's values are kept under: "p_" and the first 12 hex of the sha256 of its folder path.
pub fn project_key(path: &str) -> String {
    let h = Sha256::digest(path.as_bytes());
    let hex: String = h.iter().map(|b| format!("{b:02x}")).collect();
    format!("p_{}", &hex[..12])
}

/// Keeps a value only when it is valid and not the usual one. A bad one is listed. Unknown names stay as they are.
fn clean(r: &Registry, m: &Map<String, Value>, project: bool, problems: &mut Vec<Problem>) -> Map<String, Value> {
    let mut out = Map::new();
    for (k, v) in m {
        let Some(d) = r.get(k) else { out.insert(k.clone(), v.clone()); continue };
        if d.store != "settings" || d.kind == Kind::Custom || d.project != project { continue; }   // never kept here
        match validate(d, v) {
            Ok(n) => { if !same(&n, &d.default) { out.insert(k.clone(), n); } }
            Err(_) => problems.push(Problem { key: Some(k.clone()), code: "badValue" }),
        }
    }
    // An old name read once into the new one, when the new one is not set yet.
    for d in &r.defs {
        for old in &d.renamed_from {
            if let Some(v) = out.remove(old) {
                if out.contains_key(&d.key) || d.store != "settings" || d.project != project { continue; }
                if let Ok(n) = validate(d, &v) { if !same(&n, &d.default) { out.insert(d.key.clone(), n); } }
            }
        }
    }
    out
}

/// Reads the file's text (None when there is none). Ok(None) is a missing file; Err is a damaged one.
pub fn parse_file(r: &Registry, text: Option<&str>) -> (File, Vec<Problem>, bool) {
    let Some(text) = text else { return (File::default(), vec![], false) };
    let damaged = || (File::default(), vec![Problem { key: None, code: "damaged" }], true);
    let Ok(Value::Object(top)) = serde_json::from_str::<Value>(text) else { return damaged() };
    let obj = |k: &str| match top.get(k) { None => Some(Map::new()), Some(Value::Object(m)) => Some(m.clone()), Some(_) => None };
    let (Some(values), Some(projects)) = (obj("values"), obj("projects")) else { return damaged() };
    let mut problems = vec![];
    let values = clean(r, &values, false, &mut problems);
    let mut kept = Map::new();
    for (p, m) in projects {
        match m { Value::Object(m) => { let c = clean(r, &m, true, &mut problems); if !c.is_empty() { kept.insert(p, Value::Object(c)); } } other => { kept.insert(p, other); } }
    }
    let migrated = top.get("migrated").and_then(Value::as_array).map(|a| a.iter().filter_map(|x| x.as_str().map(str::to_string)).collect()).unwrap_or_default();
    let extra = top.into_iter().filter(|(k, _)| !["version", "values", "projects", "migrated"].contains(&k.as_str())).collect();
    (File { values, projects: kept, migrated, extra }, problems, false)
}

pub fn to_json(f: &File) -> Value {
    let mut o = f.extra.clone();
    o.insert("version".into(), json!(1));
    o.insert("values".into(), Value::Object(f.values.clone()));
    o.insert("projects".into(), Value::Object(f.projects.iter().filter(|(_, v)| !v.as_object().is_some_and(Map::is_empty)).map(|(k, v)| (k.clone(), v.clone())).collect()));
    o.insert("migrated".into(), json!(f.migrated));
    Value::Object(o)
}

pub fn path(dir: &Path) -> PathBuf { dir.join(FILE) }

/// Reads settings.json from Companion's folder.
///  - None there: the usual values.
///  - Read, but not a settings file (not JSON, not text): moved aside as settings.damaged.json (kept for support, removed by
///    Delete everything) and Companion starts on the usual values. The migration mark is kept and a fresh file holding
///    only it is written at once: a settings.json is only ever written after Home has run the migration (the first thing
///    it does), so the damaged one had it, and without it the old page storage would copy the choices from before the
///    update back in over the person's own.
///  - There but not readable at all: the usual values for this session and one problem (`UNREADABLE`). Nothing is known
///    about what it holds, so it is not moved and not saved over (`ready_to_save`).
pub fn load(r: &Registry, dir: &Path) -> (File, Vec<Problem>) {
    let p = path(dir);
    let text = match std::fs::read(&p) {
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => None,
        Err(_) => return (File::default(), vec![Problem { key: None, code: UNREADABLE }]),
        Ok(b) => Some(String::from_utf8(b).unwrap_or_default()),   // bytes that are not text: a damaged file
    };
    let (mut f, problems, damaged) = parse_file(r, text.as_deref());
    if damaged {
        f.migrated = vec![PAGE_STORAGE_MARK.to_string()];
        if std::fs::rename(&p, dir.join(DAMAGED)).is_ok() { let _ = save(dir, &f); }
    }
    (f, problems)
}

/// Before a change is saved. A settings.json that could not be read is read again first: still not readable, the change
/// is refused ("notSaved") and nothing is written over it; readable now, what it holds is taken (with its own problems),
/// so the change goes on top of the person's values, never over them. Ok(true) when it was read again just now.
pub fn ready_to_save(r: &Registry, dir: &Path, file: &mut File, problems: &mut Vec<Problem>) -> Result<bool, &'static str> {
    if !problems.iter().any(|p| p.code == UNREADABLE) { return Ok(false); }
    let (f, p) = load(r, dir);
    let still = p.iter().any(|x| x.code == UNREADABLE);
    *file = f;
    *problems = p;
    if still { Err("notSaved") } else { Ok(true) }
}

/// Writes the whole file at once (owner only). The error is the code the page puts in words.
pub fn save(dir: &Path, f: &File) -> Result<(), &'static str> {
    std::fs::create_dir_all(dir).map_err(|_| "notSaved")?;
    crate::logfile::write_atomic(&path(dir), to_json(f).to_string().as_bytes()).map_err(|_| "notSaved")
}

// ---------- reading and changing values ----------

fn project_map<'a>(f: &'a File, project: Option<&str>) -> Option<&'a Map<String, Value>> {
    project.filter(|p| !p.is_empty()).and_then(|p| f.projects.get(&project_key(p))).and_then(Value::as_object)
}

/// The value in force for a setting kept in settings.json: the project's (for a project setting), else the app's, else
/// the usual one. A project setting with no folder chosen is its usual value.
pub fn value_of(r: &Registry, f: &File, key: &str, project: Option<&str>) -> Option<Value> {
    let d = r.get(key)?;
    let v = if d.project { project_map(f, project).and_then(|m| m.get(key)) } else { f.values.get(key) };
    Some(v.cloned().unwrap_or_else(|| d.default.clone()))
}

/// Every setting kept in settings.json, with its value in force.
pub fn effective(r: &Registry, f: &File, project: Option<&str>) -> Map<String, Value> {
    r.defs.iter().filter(|d| d.store == "settings" && d.kind != Kind::Custom).filter_map(|d| value_of(r, f, &d.key, project).map(|v| (d.key.clone(), v))).collect()
}

/// Checks a change before anything is written: the setting exists, is not one with its own editor, and the value passes.
pub fn check<'a>(r: &'a Registry, key: &str, v: &Value) -> Result<(&'a Def, Value), &'static str> {
    let d = r.get(key).ok_or("unknown")?;
    Ok((d, validate(d, v)?))
}

/// Changes one setting kept in settings.json. Returns whether its value in force changed. A value equal to the usual one
/// is removed, never stored. A project setting needs a folder.
pub fn set(r: &Registry, f: &mut File, key: &str, v: &Value, project: Option<&str>) -> Result<bool, &'static str> {
    let (d, n) = check(r, key, v)?;
    if d.store != "settings" { return Err("notHere"); }
    let before = value_of(r, f, key, project);
    let map = if d.project {
        let p = project.filter(|p| !p.is_empty() && *p != crate::runner::NO_PROJECT).ok_or("noProject")?;
        let e = f.projects.entry(project_key(p)).or_insert_with(|| json!({}));
        if !e.is_object() { *e = json!({}); }
        e.as_object_mut().unwrap()
    } else { &mut f.values };
    if same(&n, &d.default) { map.remove(key); } else { map.insert(key.to_string(), n); }
    Ok(before != value_of(r, f, key, project))
}

/// What a reset covers.
#[derive(Clone, Copy, Debug, PartialEq)]
pub enum Which<'a> { Key(&'a str), Section(&'a str), All }

/// The settings a reset puts back, in every store: one setting, a section, or everything. Protective ones are never in a
/// section or everything, and a protective one alone is refused (only its own control removes an item).
pub fn reset_targets<'a>(r: &'a Registry, which: Which) -> Result<Vec<&'a Def>, &'static str> {
    match which {
        Which::Key(k) => { let d = r.get(k).ok_or("unknown")?; if d.protective { Err("protective") } else { Ok(vec![d]) } }
        Which::Section(s) => { if !r.sections.iter().any(|x| x == s) { return Err("unknown"); } Ok(r.in_section(s).into_iter().filter(|d| !d.protective).collect()) }
        Which::All => Ok(r.defs.iter().filter(|d| !d.protective).collect()),
    }
}

/// What a reset puts back, decided from exactly what the page was shown, so the page can name each one before and keep each
/// one for Undo: every setting in the reset (`reset_targets`, never a protective one) whose value in the snapshot differs
/// from its usual one (`values` and `usual` are the snapshot's), and of the engine's own settings only the ones the page
/// names in `engine` (those it has heard from the engine away from usual). One the page has not heard is left as it is:
/// the page could neither name it nor put it back. The usual value of keys and voice is their own (the snapshot's), and
/// the registry's for every other setting, as on the page (settingsStore.ts usualOf).
pub fn reset_plan(r: &Registry, which: Which, values: &Map<String, Value>, usual: &Map<String, Value>, engine: &[String]) -> Result<Vec<String>, &'static str> {
    Ok(reset_targets(r, which)?.into_iter().filter(|d| {
        if d.runner_store() { return engine.iter().any(|k| *k == d.key); }
        let u = if d.kind == Kind::Custom { usual.get(&d.key).unwrap_or(&d.default) } else { &d.default };
        values.get(&d.key).is_some_and(|v| !same(v, u))
    }).map(|d| d.key.clone()).collect())
}

/// Puts the settings kept in settings.json back to their usual values (removing them): the app's value and this project's,
/// for one setting, a section or everything. Another project's own values stay as they are: the page was shown only this
/// project's, so it could neither name the others first nor put them back with Undo. Names this version does not know stay.
/// Returns the settings whose value in force changed.
pub fn reset(r: &Registry, f: &mut File, which: Which, project: Option<&str>) -> Result<Vec<String>, &'static str> {
    let targets: Vec<Def> = reset_targets(r, which)?.into_iter().filter(|d| d.store == "settings" && d.kind != Kind::Custom).cloned().collect();
    let before = effective(r, f, project);
    for d in &targets {
        f.values.remove(&d.key);
        if let Some(p) = project.filter(|p| !p.is_empty()) {
            if let Some(m) = f.projects.get_mut(&project_key(p)).and_then(Value::as_object_mut) { m.remove(&d.key); }
        }
    }
    f.projects.retain(|_, v| !v.as_object().is_some_and(Map::is_empty));
    let after = effective(r, f, project);
    Ok(targets.iter().filter(|d| before.get(&d.key) != after.get(&d.key)).map(|d| d.key.clone()).collect())
}

/// Takes the choices the pages kept before the registry (the card reads them with today's meaning and sends them once).
/// Only settings that came from there, only ones not already set, only valid values; the mark is recorded and a second
/// run is refused. Returns the settings written.
pub fn migrate(r: &Registry, f: &mut File, from: &str, values: &Map<String, Value>) -> Result<Vec<String>, &'static str> {
    if from != PAGE_STORAGE_MARK { return Err("unknownMigration"); }
    if f.migrated.iter().any(|m| m == from) { return Err("alreadyMigrated"); }
    let mut written = vec![];
    for (k, v) in values {
        let Some(d) = r.get(k) else { continue };
        if d.from_page.is_none() || d.store != "settings" || d.project || f.values.contains_key(k) { continue; }
        let Ok(n) = validate(d, v) else { continue };
        if !same(&n, &d.default) { f.values.insert(k.clone(), n); written.push(k.clone()); }
    }
    f.migrated.push(from.to_string());
    Ok(written)
}

/// The line the engine reads first after every start (and after each change it applies): every setting kept here that
/// the engine applies and that is not its usual value, and the current project's own. Each replaces the one before, so a
/// setting put back reaches the engine as a missing name.
pub fn apply_line(r: &Registry, f: &File, project: Option<&str>, id: &str) -> String {
    let runner = |d: &&Def| d.store == "settings" && d.kind != Kind::Custom && d.applies_to("runner");
    let values: Map<String, Value> = r.defs.iter().filter(runner).filter(|d| !d.project).filter_map(|d| f.values.get(&d.key).map(|v| (d.key.clone(), v.clone()))).collect();
    let mut line = json!({ "v": 1, "id": id, "type": "settings.apply", "values": values });
    if let Some(p) = project.filter(|p| !p.is_empty() && *p != crate::runner::NO_PROJECT) {
        let pv: Map<String, Value> = r.defs.iter().filter(runner).filter(|d| d.project).filter_map(|d| project_map(f, Some(p)).and_then(|m| m.get(&d.key)).map(|v| (d.key.clone(), v.clone()))).collect();
        line["project"] = json!(p);
        line["projectValues"] = Value::Object(pv);
    }
    line.to_string()
}

/// Whether a change to this setting must reach the engine as a new settings.apply line.
pub fn needs_apply(d: &Def) -> bool { d.store == "settings" && d.applies_to("runner") }

/// The engine's own command for a setting it keeps itself, with a value already checked. `project` is the folder in
/// use, or the stand in when none is chosen (these apply to every project, and the engine reads no folder for them).
pub fn runner_command(key: &str, v: &Value, project: &str, id: &str) -> Option<Value> {
    let p = if project.is_empty() { crate::runner::NO_PROJECT } else { project };
    Some(match key {
        "spend.dailyLimit" => json!({ "v": 1, "id": id, "type": "spending.set", "project": p, "limitUsd": v.as_f64()? }),
        "explain.mode" => json!({ "v": 1, "id": id, "type": "explain.set", "project": p, "mode": v.as_str()? }),
        "memory.paused" => json!({ "v": 1, "id": id, "type": "memory.pause", "project": p, "paused": v.as_bool()? }),
        "numbers.on" => json!({ "v": 1, "id": id, "type": "metrics.set", "enabled": v.as_bool()? }),
        _ => return None,
    })
}

/// Only Home's own window may change settings (as with every other change in Settings).
pub fn only_card(window: &str) -> Result<(), &'static str> { if window == "card" { Ok(()) } else { Err("not_card") } }

/// The project a change is for. A page that says which project it was shown (house rules always do) has its change kept
/// only while that is still the project in Home: the folder can change by itself in between (a copy from a link that
/// finishes opens its folder), and one project's house rules must never be written over another's ("projectChanged").
/// A change that names no project (Undo after a reset) is for the current one, as before.
pub fn for_project<'a>(d: &Def, asked: Option<&'a str>, current: Option<&'a str>) -> Result<Option<&'a str>, &'static str> {
    match asked {
        Some(a) if Some(a) == current => Ok(Some(a)),
        Some(_) => Err("projectChanged"),
        None if d.store == "rules" => Err("projectChanged"),
        None => Ok(current),
    }
}

// ---------- the stores that stay where they were (wrapped) ----------

/// dock.json: "Come to what it is about", and the character's place on the display it is on now (`last_screen`, the
/// display apply_dock put it on): its edge, its position along it in percent on the row's step (0 the top or left end,
/// 100 the bottom or right end; a place dragged by hand is shown on the nearest step, and kept exactly in dock.json), and
/// "Same place on every display".
pub fn dock_value(p: &crate::docking::Prefs, key: &str) -> Option<Value> {
    let (edge, pct) = crate::docking::choice(p, &p.last_screen);
    Some(match key {
        "character.comeTo" => json!(p.come_to),
        "character.edge" => json!(edge.word()),
        "character.position" => { let d = registry().get(key)?; snap(pct * 100.0, d.min, d.step, d.max) }
        "character.sameEverywhere" => json!(p.same_everywhere.is_some()),
        _ => return None,
    })
}
/// A place dragged off the step is shown on the nearest one, so Undo after a reset needs more to put the character back
/// exactly where it was: the position's Undo value, the fraction along the edge as dock.json keeps it. None when the
/// place is on its step (Undo then sends the shown value, as for every other setting).
pub fn dock_restore(p: &crate::docking::Prefs) -> Option<(&'static str, Value)> {
    let (_, pct) = crate::docking::choice(p, &p.last_screen);
    let shown = dock_value(p, "character.position")?.as_f64()?;
    ((shown - pct * 100.0).abs() > 1e-9).then(|| ("character.position", json!({ "fraction": pct })))
}
/// Undo's exact place for the position: `{"fraction": 0 to 1}` and nothing else.
pub fn place_from(v: &Value) -> Option<f64> {
    let o = v.as_object().filter(|o| o.len() == 1)?;
    o.get("fraction")?.as_f64().filter(|f| f.is_finite() && (0.0..=1.0).contains(f))
}
/// What a change to a dock.json setting may be: a value its definition allows (put on its step), or for the position
/// Undo's exact place (`place_from`). The error is a code, as from `validate`.
pub fn dock_input(d: &Def, v: &Value) -> Result<Value, &'static str> {
    if d.key == "character.position" && place_from(v).is_some() { return Ok(v.clone()); }
    validate(d, v)
}
/// The same, changed: a place is changed on the display the character is on now, and only there (each other display keeps
/// its own), and with Same place on every display on the copy follows it. None when nothing can change (a value that is
/// not one, or no display known yet).
pub fn dock_with(p: &crate::docking::Prefs, key: &str, v: &Value) -> Option<crate::docking::Prefs> {
    let mut next = p.clone();
    let here = p.last_screen.clone();
    let place = |next: &mut crate::docking::Prefs, at: (crate::docking::Edge, f64)| {
        next.per_screen.insert(here.clone(), at);
        if next.same_everywhere.is_some() { next.same_everywhere = Some(at); }
    };
    let (edge, pct) = crate::docking::choice(p, &here);
    match key {
        "character.comeTo" => next.come_to = v.as_bool()?,
        _ if here.is_empty() => return None,
        "character.edge" => place(&mut next, (crate::docking::Edge::of(v.as_str()?)?, pct)),
        "character.position" => place(&mut next, (edge, match place_from(v) { Some(f) => f, None => (v.as_f64().filter(|n| n.is_finite())? / 100.0).clamp(0.0, 1.0) })),
        "character.sameEverywhere" => next.same_everywhere = if v.as_bool()? { Some((edge, pct)) } else { None },
        _ => return None,
    }
    Some(next)
}
/// presentation.json: hide from screen sharing and quiet during calls.
pub fn presentation_value(s: &crate::presentation::Settings, key: &str) -> Option<Value> {
    match key { "sharing.hide" => Some(json!(s.hide_from_sharing)), "calls.quiet" => Some(json!(s.quiet_on_calls)), _ => None }
}
pub fn presentation_with(s: &crate::presentation::Settings, key: &str, v: &Value) -> Option<crate::presentation::Settings> {
    let b = v.as_bool()?;
    match key { "sharing.hide" => Some(crate::presentation::Settings { hide_from_sharing: b, ..*s }), "calls.quiet" => Some(crate::presentation::Settings { quiet_on_calls: b, ..*s }), _ => None }
}
/// keys.json and voice.json have their own editors; their values are shown whole so Reset and Undo can work on them.
pub fn keys_value(m: &crate::keymap::Map) -> Value { crate::keymap::to_json(m)["keys"].clone() }
pub fn voice_value(s: &crate::voiceset::Saved) -> Value { crate::voiceset::to_json(s) }

/// Undo's value for the voice: the voice settings whole, exactly as the snapshot showed them. Read with voice.json's own
/// rules; a value those rules would have to repair (a speed not offered, a language not known, a voice with no id) is
/// refused, so Undo never keeps something the person did not have.
pub fn voice_from(v: &Value) -> Result<crate::voiceset::Saved, &'static str> {
    if !v.is_object() { return Err("custom"); }
    let s = crate::voiceset::parse(Some(&v.to_string()));
    if same(&voice_value(&s), v) { Ok(s) } else { Err("custom") }
}
/// Undo's value for the keys: every job's keys exactly as the snapshot showed them, read with keys.json's own rules; keys
/// not on a job's list, two jobs on the same keys or anything else they would repair is refused.
pub fn keys_from(v: &Value) -> Result<crate::keymap::Map, &'static str> {
    if !v.is_object() { return Err("custom"); }
    let (m, damaged) = crate::keymap::parse(Some(&json!({ "keys": v }).to_string()), None);
    if damaged { Err("custom") } else { Ok(m) }
}

/// What the wrapped stores hold now, read by main.rs. `ph_apps`: the per app answers as prompt_help.json keeps them
/// (prompthelp.rs `Consent::to_json`).
/// `rules`: the current project's own .companion/rules.txt (houserules.rs): Ok(None) when there is none or no project.
pub struct Wrapped { pub dock: crate::docking::Prefs, pub presentation: crate::presentation::Settings, pub keys: crate::keymap::Map, pub voice: crate::voiceset::Saved, pub ph_apps: Value, pub rules: Result<Option<String>, &'static str> }

/// What every page is told ("settings-changed", and settings_get's answer): each value in force the shell keeps (the
/// engine's own three come from its events), each setting's usual value (for keys and voice, their own usual ones),
/// the project (its folder, or empty), the migrations done, the problems found when the file was read, and what changed.
pub fn snapshot(r: &Registry, f: &File, project: Option<&str>, w: &Wrapped, problems: &[Problem], changed: &[String]) -> Value {
    let mut values = Map::new();
    let mut usual = Map::new();
    let mut problems = problems.to_vec();
    let has_project = project.is_some_and(|p| !p.is_empty() && p != crate::runner::NO_PROJECT);
    for d in &r.defs {
        if d.runner_store() { usual.insert(d.key.clone(), d.default.clone()); continue; }
        let v = match d.store.as_str() {
            "settings" => value_of(r, f, &d.key, project),
            "dock" => dock_value(&w.dock, &d.key),
            "presentation" => presentation_value(&w.presentation, &d.key),
            "keys" => Some(keys_value(&w.keys)),
            "voice" => Some(voice_value(&w.voice)),
            "promptHelpApps" => Some(w.ph_apps.clone()),
            // The project's own rules file: shown only for a project, and a file that cannot be read here is a problem.
            "rules" if has_project => match &w.rules {
                Ok(text) => Some(json!(crate::houserules::value(text.as_deref()))),
                Err(code) => { problems.push(Problem { key: Some(d.key.clone()), code }); None }
            },
            _ => None,
        };
        if let Some(v) = v { values.insert(d.key.clone(), v); }
        let u = match d.store.as_str() { "keys" => keys_value(&crate::keymap::Map::DEFAULT), "voice" => voice_value(&crate::voiceset::Saved::default()), "promptHelpApps" => crate::prompthelp::Consent::default().to_json(), _ => d.default.clone() };
        usual.insert(d.key.clone(), u);
    }
    // A value shown rounded, and what Undo sends to put it back exactly (settingsStore.ts undoValues).
    let restore: Map<String, Value> = dock_restore(&w.dock).into_iter().map(|(k, v)| (k.to_string(), v)).collect();
    json!({
        "values": values, "usual": usual, "project": project.unwrap_or(""), "migrated": f.migrated,
        "problems": problems.iter().map(Problem::to_json).collect::<Vec<_>>(), "changed": changed, "restore": restore,
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::keymap;

    fn cases() -> Vec<Value> { include_str!("../../../protocol/fixtures/settings-cases.jsonl").lines().filter(|l| !l.trim().is_empty()).map(|l| serde_json::from_str(l).expect("a case is JSON")).collect() }
    fn def_from(v: &Value) -> Def {
        let text = json!({ "version": 1, "sections": [v["section"].clone()], "settings": [v] }).to_string();
        parse_registry(&text).unwrap().defs.remove(0)
    }
    fn dir(name: &str) -> PathBuf { let d = std::env::temp_dir().join(format!("companion-settings-{name}-{}", std::process::id())); let _ = std::fs::remove_dir_all(&d); std::fs::create_dir_all(&d).unwrap(); d }
    /// A registry for tests only, with a protective list and a project setting, so reset rules can be shown.
    fn test_registry() -> Registry {
        parse_registry(r#"{ "version": 1, "sections": ["work", "checks"], "settings": [
            { "key": "work.maxTurns", "section": "work", "kind": "number", "default": 80, "min": 20, "max": 200, "step": 10, "unit": "count", "scope": "app", "applies": ["runner"], "store": "settings", "live": false },
            { "key": "work.fun", "section": "work", "kind": "switch", "default": true, "scope": "app", "applies": ["pages"], "store": "settings", "live": true, "from": { "pageStorage": { "name": "companion.fun", "map": "notOff" } } },
            { "key": "work.size", "section": "work", "kind": "choice", "default": "standard", "options": ["standard", "large"], "scope": "app", "applies": ["pages"], "store": "settings", "live": true, "from": { "pageStorage": { "name": "companion.size", "map": "textSize" } } },
            { "key": "checks.mustSee", "section": "checks", "kind": "list", "default": [], "maxItems": 5, "item": { "maxLength": 80 }, "scope": "project", "applies": ["runner"], "store": "settings", "live": false },
            { "key": "checks.rules", "section": "checks", "kind": "list", "default": [], "maxItems": 50, "item": { "maxLength": 200 }, "scope": "project", "applies": ["runner"], "store": "settings", "live": false, "protective": true },
            { "key": "checks.limit", "section": "checks", "kind": "number", "default": 10, "min": 1, "max": 500, "step": 0.01, "unit": "dollars", "scope": "app", "applies": ["runner"], "store": "spending", "live": true }
        ] }"#).unwrap()
    }

    #[test]
    fn the_shipped_registry_reads_and_every_definition_is_valid() {
        let r = registry();
        assert_eq!(check_registry(r), Vec::<String>::new());
        assert_eq!(r.sections.first().map(String::as_str), Some("keys"));
        assert!(r.get("work.maxTurns").is_some_and(|d| d.applies == ["runner"] && !d.live && d.store == "settings"));
        assert_eq!(check_registry(&test_registry()), Vec::<String>::new());
    }
    #[test]
    fn a_broken_registry_is_caught() {
        let broken = |patch: &str| { let mut v: Value = serde_json::from_str(REGISTRY_TEXT).unwrap(); let p: Value = serde_json::from_str(patch).unwrap(); let d = v["settings"].as_array_mut().unwrap().iter_mut().find(|d| d["key"] == "work.maxTurns").unwrap(); for (k, x) in p.as_object().unwrap() { d[k] = x.clone(); } check_registry(&parse_registry(&v.to_string()).unwrap()) };
        for patch in [r#"{"default": 500}"#, r#"{"min": 200, "max": 20}"#, r#"{"step": 7}"#, r#"{"section": "nowhere"}"#, r#"{"store": "cloud"}"#, r#"{"kind": "slider"}"#, r#"{"applies": []}"#, r#"{"key": "Work.max_turns"}"#, r#"{"protective": true}"#, r#"{"unit": "miles"}"#] {
            assert!(!broken(patch).is_empty(), "{patch} was not caught");
        }
    }
    #[test]
    fn validation_matches_every_shared_case() {
        let r = registry();
        let mut n = 0;
        for c in cases() {
            if c.get("migrate").is_some() { continue; }
            n += 1;
            let got = match c.get("def") { Some(d) => validate(&def_from(d), &c["value"]), None => validate_key(r, c["key"].as_str().unwrap(), &c["value"]) };
            match got {
                Ok(v) => { assert!(c["ok"] == true, "{c} was accepted as {v}"); assert!(same(&v, &c["normalized"]) || v == c["normalized"], "{c}: got {v}"); }
                Err(code) => { assert!(c["ok"] == false, "{c} was refused: {code}"); assert_eq!(code, c["reason"].as_str().unwrap(), "{c}"); }
            }
        }
        assert!(n >= 50, "only {n} cases");
    }
    #[test]
    fn a_whole_number_is_written_as_one() {
        assert_eq!(snap(124.0, 20.0, 10.0, 200.0).to_string(), "120");
        assert_eq!(snap(10.004, 1.0, 0.01, 500.0).to_string(), "10");
        assert_eq!(snap(10.006, 1.0, 0.01, 500.0).as_f64(), Some(10.01));
    }
    #[test]
    fn a_missing_file_gives_the_usual_values() {
        let r = registry();
        let d = dir("missing");
        let (f, problems) = load(r, &d);
        assert_eq!(f, File::default());
        assert!(problems.is_empty());
        let e = effective(r, &f, None);
        assert_eq!(e["work.maxTurns"], json!(80));
        assert_eq!(e["fun.reactions"], json!(true));
        assert_eq!(e["display.textSize"], json!("standard"));
        let _ = std::fs::remove_dir_all(&d);
    }
    #[test]
    fn a_damaged_file_is_kept_aside_and_companion_starts_on_the_usual_values() {
        let r = registry();
        let d = dir("damaged");
        std::fs::write(d.join(FILE), "{ not json").unwrap();
        let (f, problems) = load(r, &d);
        assert!(f.values.is_empty() && f.projects.is_empty());
        assert_eq!(problems, vec![Problem { key: None, code: "damaged" }]);
        assert_eq!(std::fs::read_to_string(d.join(DAMAGED)).unwrap(), "{ not json");
        for bad in ["[]", "7", r#"{"values": 3}"#, r#"{"projects": []}"#] { assert!(parse_file(r, Some(bad)).2, "{bad}"); }
        // Bytes that are not text are a damaged file too: moved aside the same way.
        let e = dir("damaged-bytes");
        std::fs::write(e.join(FILE), [0xff, 0xfe, 0x00, 0x7b]).unwrap();
        assert_eq!(load(r, &e).1, vec![Problem { key: None, code: "damaged" }]);
        assert_eq!(std::fs::read(e.join(DAMAGED)).unwrap(), vec![0xff, 0xfe, 0x00, 0x7b]);
        let _ = std::fs::remove_dir_all(&d);
        let _ = std::fs::remove_dir_all(&e);
    }
    #[test]
    fn a_damaged_file_keeps_the_migration_mark_so_the_choices_from_before_the_update_never_come_back() {
        // A settings.json is only written once Home has run the migration (it is the first thing Home does), so a damaged
        // one had the mark. Losing it would let the old page storage copy the choices from before the update back in.
        let r = registry();
        let d = dir("damaged-mark");
        std::fs::write(d.join(FILE), "{\"version\":1,\"values\":{\"fun.reactions\":fal").unwrap();
        let (mut f, problems) = load(r, &d);
        assert_eq!(problems, vec![Problem { key: None, code: "damaged" }]);
        assert_eq!(f.migrated, vec![PAGE_STORAGE_MARK.to_string()]);
        // The migration the page would send now writes nothing.
        let mut old = Map::new();
        old.insert("fun.reactions".into(), json!(false));
        old.insert("display.textSize".into(), json!("large"));
        assert_eq!(migrate(r, &mut f, PAGE_STORAGE_MARK, &old), Err("alreadyMigrated"));
        assert!(f.values.is_empty());
        // The fresh file with the mark is written at once, so the next start has it too (the damaged one stays aside).
        let (again, problems) = load(r, &d);
        assert!(problems.is_empty(), "{problems:?}");
        assert_eq!(again.migrated, vec![PAGE_STORAGE_MARK.to_string()]);
        assert!(again.values.is_empty());
        assert!(d.join(DAMAGED).exists());
        let _ = std::fs::remove_dir_all(&d);
    }
    #[test]
    fn a_file_that_cannot_be_read_is_never_moved_aside_or_saved_over() {
        let r = registry();
        // A folder where the file should be: reading it fails, but it is not a damaged file.
        let d = dir("unreadable");
        std::fs::create_dir_all(d.join(FILE).join("inside")).unwrap();
        let (mut f, mut problems) = load(r, &d);
        assert_eq!(f, File::default());
        assert_eq!(problems, vec![Problem { key: None, code: UNREADABLE }]);
        assert!(d.join(FILE).join("inside").is_dir(), "left where it was");
        assert!(!d.join(DAMAGED).exists(), "never moved aside");
        // A change cannot be saved while it still cannot be read.
        assert_eq!(ready_to_save(r, &d, &mut f, &mut problems), Err("notSaved"));
        assert_eq!(problems, vec![Problem { key: None, code: UNREADABLE }]);
        // Once it can be read, what it holds is taken first, so a change goes on top of the person's values.
        std::fs::remove_dir_all(d.join(FILE)).unwrap();
        std::fs::write(d.join(FILE), r#"{"version":1,"values":{"fun.reactions":false},"migrated":["pageStorage.v1"]}"#).unwrap();
        assert_eq!(ready_to_save(r, &d, &mut f, &mut problems), Ok(true));
        assert!(problems.is_empty());
        assert_eq!(value_of(r, &f, "fun.reactions", None), Some(json!(false)));
        assert_eq!(f.migrated, vec![PAGE_STORAGE_MARK.to_string()]);
        // A file read fine needs nothing more.
        assert_eq!(ready_to_save(r, &d, &mut f, &mut problems), Ok(false));
        // No permission to read it: the same, and the file is untouched.
        #[cfg(unix)] {
            use std::os::unix::fs::PermissionsExt;
            let e = dir("no-permission");
            std::fs::write(e.join(FILE), r#"{"version":1,"values":{"fun.reactions":false}}"#).unwrap();
            std::fs::set_permissions(e.join(FILE), std::fs::Permissions::from_mode(0o000)).unwrap();
            if std::fs::read(e.join(FILE)).is_err() {   // (anyone who can read every file, such as root, skips this part)
                let (g, p) = load(r, &e);
                assert_eq!((g, p), (File::default(), vec![Problem { key: None, code: UNREADABLE }]));
                assert!(!e.join(DAMAGED).exists());
                std::fs::set_permissions(e.join(FILE), std::fs::Permissions::from_mode(0o600)).unwrap();
                assert_eq!(std::fs::read_to_string(e.join(FILE)).unwrap(), r#"{"version":1,"values":{"fun.reactions":false}}"#);
            }
            let _ = std::fs::set_permissions(e.join(FILE), std::fs::Permissions::from_mode(0o600));
            let _ = std::fs::remove_dir_all(&e);
        }
        let _ = std::fs::remove_dir_all(&d);
    }
    #[test]
    fn one_bad_value_falls_back_to_its_usual_value_and_is_listed() {
        let r = registry();
        let (f, problems, damaged) = parse_file(r, Some(r#"{"version":1,"values":{"work.maxTurns":5000,"fun.reactions":false}}"#));
        assert!(!damaged);
        assert_eq!(problems, vec![Problem { key: Some("work.maxTurns".into()), code: "badValue" }]);
        assert_eq!(value_of(r, &f, "work.maxTurns", None), Some(json!(80)));
        assert_eq!(value_of(r, &f, "fun.reactions", None), Some(json!(false)));
    }
    #[test]
    fn names_and_fields_this_version_does_not_know_survive_a_write() {
        let r = registry();
        let text = r#"{"version":1,"values":{"later.setting":{"a":1},"fun.reactions":false},"projects":{"p_000000000000":{"later.project":7}},"migrated":["pageStorage.v1","later.v2"],"comment":"kept"}"#;
        let (mut f, _, _) = parse_file(r, Some(text));
        set(r, &mut f, "work.maxTurns", &json!(120), None).unwrap();
        let back = to_json(&f);
        assert_eq!(back["values"]["later.setting"], json!({"a":1}));
        assert_eq!(back["values"]["work.maxTurns"], json!(120));
        assert_eq!(back["projects"]["p_000000000000"]["later.project"], json!(7));
        assert_eq!(back["migrated"], json!(["pageStorage.v1", "later.v2"]));
        assert_eq!(back["comment"], json!("kept"));
        let d = dir("roundtrip");
        save(&d, &f).unwrap();
        let (again, problems) = load(r, &d);
        assert_eq!(again, f);
        assert!(problems.is_empty());
        #[cfg(unix)] { use std::os::unix::fs::PermissionsExt; assert_eq!(std::fs::metadata(path(&d)).unwrap().permissions().mode() & 0o777, 0o600); }
        let _ = std::fs::remove_dir_all(&d);
    }
    #[test]
    fn a_value_equal_to_its_usual_one_is_not_stored() {
        let r = registry();
        let mut f = File::default();
        assert!(set(r, &mut f, "work.maxTurns", &json!(120), None).unwrap());
        assert!(f.values.contains_key("work.maxTurns"));
        assert!(set(r, &mut f, "work.maxTurns", &json!(80), None).unwrap());
        assert!(!f.values.contains_key("work.maxTurns"));
        assert!(!set(r, &mut f, "work.maxTurns", &json!(80.0), None).unwrap(), "no change");
        assert_eq!(set(r, &mut f, "work.maxTurns", &json!(5000), None), Err("tooHigh"));
        assert_eq!(set(r, &mut f, "keys.hotkeys", &json!({}), None), Err("custom"));
        assert_eq!(set(r, &mut f, "character.comeTo", &json!(false), None), Err("notHere"));
        assert_eq!(set(r, &mut f, "no.suchThing", &json!(1), None), Err("unknown"));
        // A parsed file drops a usual value too.
        let (g, _, _) = parse_file(r, Some(r#"{"values":{"work.maxTurns":80}}"#));
        assert!(g.values.is_empty());
    }
    #[test]
    fn reset_puts_back_one_a_section_or_everything_and_never_a_protective_list() {
        let r = test_registry();
        let (site, other) = ("/Users/me/site", "/Users/me/other");
        let mut f = File::default();
        set(&r, &mut f, "work.maxTurns", &json!(120), None).unwrap();
        set(&r, &mut f, "work.fun", &json!(false), None).unwrap();
        set(&r, &mut f, "checks.mustSee", &json!(["Welcome"]), Some(site)).unwrap();
        set(&r, &mut f, "checks.mustSee", &json!(["Hello"]), Some(other)).unwrap();
        set(&r, &mut f, "checks.rules", &json!(["never edit .env"]), Some(site)).unwrap();
        assert_eq!(reset(&r, &mut f, Which::Key("work.maxTurns"), None).unwrap(), vec!["work.maxTurns".to_string()]);
        assert_eq!(value_of(&r, &f, "work.fun", None), Some(json!(false)), "one reset leaves the others");
        assert_eq!(reset(&r, &mut f, Which::Key("checks.rules"), Some(site)), Err("protective"));
        // A section: this project's values in it, never the protective list.
        assert_eq!(reset(&r, &mut f, Which::Section("checks"), Some(site)).unwrap(), vec!["checks.mustSee".to_string()]);
        assert_eq!(value_of(&r, &f, "checks.rules", Some(site)), Some(json!(["never edit .env"])));
        assert_eq!(value_of(&r, &f, "checks.mustSee", Some(other)), Some(json!(["Hello"])), "another project is left alone by a section");
        // Everything: the app's and this project's, still never the protective list; the migration mark stays. Another
        // project keeps its own: the page was shown only this project's values, so Undo could only put those back.
        set(&r, &mut f, "checks.mustSee", &json!(["Welcome"]), Some(site)).unwrap();
        f.migrated.push(PAGE_STORAGE_MARK.into());
        reset(&r, &mut f, Which::All, Some(site)).unwrap();
        assert_eq!(value_of(&r, &f, "work.fun", None), Some(json!(true)));
        assert_eq!(value_of(&r, &f, "checks.mustSee", Some(site)), Some(json!([])));
        assert_eq!(value_of(&r, &f, "checks.mustSee", Some(other)), Some(json!(["Hello"])), "another project keeps its own");
        assert_eq!(value_of(&r, &f, "checks.rules", Some(site)), Some(json!(["never edit .env"])));
        assert_eq!(f.migrated, vec![PAGE_STORAGE_MARK.to_string()]);
        // The engine's own store is in a reset's targets (main.rs sends its command), and the protective one is not.
        let all: Vec<&str> = reset_targets(&r, Which::All).unwrap().iter().map(|d| d.key.as_str()).collect();
        assert!(all.contains(&"checks.limit") && !all.contains(&"checks.rules"));
        assert_eq!(reset_targets(&r, Which::Section("nowhere")).err(), Some("unknown"));
    }
    fn reset_cases() -> Vec<Value> { include_str!("../../../protocol/fixtures/settings-reset-cases.jsonl").lines().filter(|l| !l.trim().is_empty()).map(|l| serde_json::from_str(l).expect("a case is JSON")).collect() }
    fn which_of(v: &Value) -> Which<'_> {
        if v["all"] == true { Which::All } else if let Some(s) = v["section"].as_str() { Which::Section(s) } else { Which::Key(v["key"].as_str().unwrap()) }
    }
    fn strings(v: &Value) -> Vec<String> { v.as_array().unwrap().iter().map(|x| x.as_str().unwrap().to_string()).collect() }
    #[test]
    fn what_a_reset_changes_matches_every_shared_case_and_so_what_undo_puts_back() {
        // The same cases run on the page (settingsStore.test.ts): what the page counts, names and keeps for Undo is
        // exactly what the shell resets.
        let r = registry();
        let cases = reset_cases();
        assert!(cases.len() >= 10);
        for c in cases {
            let mut got = reset_plan(r, which_of(&c["which"]), c["values"].as_object().unwrap(), c["usual"].as_object().unwrap(), &strings(&c["sent"])).unwrap();
            got.sort();
            assert_eq!(got, strings(&c["resets"]), "{}", c["name"]);
        }
    }
    #[test]
    fn the_engines_own_settings_are_reset_only_when_the_page_could_show_them() {
        let r = registry();
        let none = Map::new();
        // Not heard from: left as they are, even for Reset all, so Undo never misses one.
        assert!(reset_plan(r, Which::All, &none, &none, &[]).unwrap().is_empty());
        // Named by the page: reset, but only inside what was asked for.
        let sent = vec!["memory.paused".to_string(), "spend.dailyLimit".to_string()];
        assert_eq!(reset_plan(r, Which::Section("memory"), &none, &none, &sent).unwrap(), vec!["memory.paused".to_string()]);
        assert_eq!(reset_plan(r, Which::Key("spend.dailyLimit"), &none, &none, &sent).unwrap(), vec!["spend.dailyLimit".to_string()]);
        // A name that is not one of the engine's own, or not a setting, changes nothing.
        let odd = vec!["fun.reactions".to_string(), "no.suchThing".to_string()];
        assert!(reset_plan(r, Which::All, &none, &none, &odd).unwrap().is_empty());
        assert_eq!(reset_plan(r, Which::Section("nowhere"), &none, &none, &[]).err(), Some("unknown"));
        // A protective setting is never in it (test registry: checks.rules), and the engine's store is (checks.limit).
        let t = test_registry();
        let mut v = Map::new();
        v.insert("checks.rules".into(), json!(["never edit .env"]));
        v.insert("checks.mustSee".into(), json!(["Welcome"]));
        let mut got = reset_plan(&t, Which::All, &v, &none, &["checks.limit".to_string()]).unwrap();
        got.sort();
        assert_eq!(got, vec!["checks.limit".to_string(), "checks.mustSee".to_string()]);
    }
    #[test]
    fn what_a_reset_changes_in_each_shell_store_comes_from_the_values_the_page_was_shown() {
        // Fake stores: come to off, quiet during calls off, other keys for Stop everything, another voice.
        let stop = keymap::choices(keymap::Action::Stop)[1];
        let voice = crate::voiceset::Saved { voice: Some(crate::voiceset::Named { id: "v".into(), name: "Ava".into(), lang: "en-US".into() }), speed: 1.25, ..Default::default() };
        let w = Wrapped { dock: crate::docking::Prefs { come_to: false, ..Default::default() }, presentation: crate::presentation::Settings { quiet_on_calls: false, ..Default::default() }, keys: keymap::Map::DEFAULT.with(keymap::Action::Stop, stop), voice, ph_apps: json!({ "apps": { "com.example.chat": "always" } }), rules: Ok(None) };
        let mut f = File::default();
        set(registry(), &mut f, "fun.reactions", &json!(false), None).unwrap();
        let snap = snapshot(registry(), &f, None, &w, &[], &[]);
        let (values, usual) = (snap["values"].as_object().unwrap(), snap["usual"].as_object().unwrap());
        let mut all = reset_plan(registry(), Which::All, values, usual, &[]).unwrap();
        all.sort();
        assert_eq!(all, ["calls.quiet", "character.comeTo", "fun.reactions", "keys.hotkeys", "talk.voice"].map(String::from).to_vec());
        assert_eq!(reset_plan(registry(), Which::Section("sharing"), values, usual, &[]).unwrap(), vec!["calls.quiet".to_string()]);
        assert!(reset_plan(registry(), Which::Key("sharing.hide"), values, usual, &[]).unwrap().is_empty(), "already usual");
        // Every store at its usual value: nothing to reset.
        let plain = Wrapped { dock: Default::default(), presentation: Default::default(), keys: keymap::Map::DEFAULT, voice: Default::default(), ph_apps: json!({ "apps": {} }), rules: Ok(None) };
        let s2 = snapshot(registry(), &File::default(), None, &plain, &[], &[]);
        assert!(reset_plan(registry(), Which::All, s2["values"].as_object().unwrap(), s2["usual"].as_object().unwrap(), &[]).unwrap().is_empty());
    }
    #[test]
    fn undo_puts_back_the_voice_and_the_keys_only_exactly_as_the_page_was_shown_them() {
        // The voice: what the snapshot showed comes back whole.
        let voice = crate::voiceset::Saved { voice: Some(crate::voiceset::Named { id: "v".into(), name: "Ava".into(), lang: "en-US".into() }), speed: 1.25, mic: Some(crate::voiceset::Named { id: "m".into(), name: "Desk mic".into(), lang: String::new() }), language: "en".into() };
        assert_eq!(voice_from(&voice_value(&voice)), Ok(voice.clone()));
        assert_eq!(voice_from(&voice_value(&Default::default())), Ok(Default::default()));
        // Through the page, 1.0 comes back as 1: still the same value.
        assert_eq!(voice_from(&json!({ "voice": null, "speed": 1, "mic": null, "language": "auto" })), Ok(Default::default()));
        // Anything the voice file's own rules would have to repair is refused, never stored as something else.
        for bad in [json!(null), json!("Ava"), json!([]), json!({ "voice": null, "speed": 9, "mic": null, "language": "auto" }), json!({ "voice": null, "speed": 1, "mic": null, "language": "klingon" }), json!({ "voice": { "id": "" }, "speed": 1, "mic": null, "language": "auto" })] {
            assert_eq!(voice_from(&bad), Err("custom"), "{bad}");
        }
        // The keys: every job's keys as shown come back; anything to repair (not on the job's list, two jobs on the same
        // keys, not an object) is refused.
        let stop = keymap::choices(keymap::Action::Stop)[1];
        let m = keymap::Map::DEFAULT.with(keymap::Action::Stop, stop);
        assert_eq!(keys_from(&keys_value(&m)), Ok(m));
        assert_eq!(keys_from(&json!({})), Ok(keymap::Map::DEFAULT));
        let card = keymap::id(keymap::default(keymap::Action::Card));
        let spare = keymap::id(keymap::choices(keymap::Action::Card)[2]);
        assert_eq!(keymap::choices(keymap::Action::Card)[2], keymap::choices(keymap::Action::Stop)[2], "a spare chord is on both lists");
        for bad in [json!(null), json!([]), json!("ctrl"), json!({ "stop": "nonsense" }), json!({ "stop": card }), json!({ "card": spare, "stop": spare })] {
            assert_eq!(keys_from(&bad), Err("custom"), "{bad}");
        }
    }
    #[test]
    fn a_project_setting_needs_a_folder_and_is_kept_under_its_hash_never_its_path() {
        let r = test_registry();
        let mut f = File::default();
        assert_eq!(set(&r, &mut f, "checks.mustSee", &json!(["Welcome"]), None), Err("noProject"));
        assert_eq!(set(&r, &mut f, "checks.mustSee", &json!(["Welcome"]), Some(crate::runner::NO_PROJECT)), Err("noProject"));
        set(&r, &mut f, "checks.mustSee", &json!(["Welcome"]), Some("/Users/me/Secret Client Site")).unwrap();
        let text = to_json(&f).to_string();
        assert!(!text.contains("Secret Client Site") && !text.contains("/Users/me"), "{text}");
        let k = project_key("/Users/me/Secret Client Site");
        assert!(k.starts_with("p_") && k.len() == 14 && k[2..].chars().all(|c| c.is_ascii_hexdigit()));
        assert!(text.contains(&k));
        assert_eq!(project_key("/a"), project_key("/a"));
        assert_ne!(project_key("/a"), project_key("/b"));
        assert_eq!(value_of(&r, &f, "checks.mustSee", Some("/Users/me/other")), Some(json!([])));
    }
    #[test]
    fn migration_takes_only_unset_valid_values_once() {
        let r = test_registry();
        let mut f = File::default();
        set(&r, &mut f, "work.size", &json!("large"), None).unwrap();
        let mut given = Map::new();
        given.insert("work.fun".into(), json!(false));          // written
        given.insert("work.size".into(), json!("standard"));    // already set: left as it is
        given.insert("work.maxTurns".into(), json!(120));       // did not come from page storage: ignored
        given.insert("later.thing".into(), json!(1));           // unknown: ignored
        assert_eq!(migrate(&r, &mut f, PAGE_STORAGE_MARK, &given).unwrap(), vec!["work.fun".to_string()]);
        assert_eq!(value_of(&r, &f, "work.size", None), Some(json!("large")));
        assert_eq!(value_of(&r, &f, "work.maxTurns", None), Some(json!(80)));
        assert!(!f.values.contains_key("later.thing"));
        assert_eq!(f.migrated, vec![PAGE_STORAGE_MARK.to_string()]);
        assert_eq!(migrate(&r, &mut f, PAGE_STORAGE_MARK, &given), Err("alreadyMigrated"));
        assert_eq!(migrate(&r, &mut f, "other.v1", &given), Err("unknownMigration"));
        // An invalid value is dropped, never stored.
        let mut g = File::default();
        let mut bad = Map::new();
        bad.insert("work.fun".into(), json!("off"));
        bad.insert("work.size".into(), json!("enormous"));
        assert!(migrate(&r, &mut g, PAGE_STORAGE_MARK, &bad).unwrap().is_empty());
        assert!(g.values.is_empty());
        // The real registry: every setting that came from page storage is in settings.json and app wide.
        for d in registry().defs.iter().filter(|d| d.from_page.is_some()) { assert!(d.store == "settings" && !d.project, "{}", d.key); }
    }
    #[test]
    fn the_engine_is_given_only_what_it_applies() {
        let r = test_registry();
        let mut f = File::default();
        set(&r, &mut f, "work.maxTurns", &json!(120), None).unwrap();
        set(&r, &mut f, "work.fun", &json!(false), None).unwrap();
        set(&r, &mut f, "checks.mustSee", &json!(["Welcome"]), Some("/Users/me/site")).unwrap();
        let line: Value = serde_json::from_str(&apply_line(&r, &f, Some("/Users/me/site"), "s1")).unwrap();
        assert_eq!(line["type"], "settings.apply");
        assert_eq!(line["v"], 1);
        assert_eq!(line["values"], json!({ "work.maxTurns": 120 }));
        assert_eq!(line["project"], "/Users/me/site");
        assert_eq!(line["projectValues"], json!({ "checks.mustSee": ["Welcome"] }));
        let none: Value = serde_json::from_str(&apply_line(&r, &File::default(), None, "s2")).unwrap();
        assert_eq!(none["values"], json!({}));
        assert!(none.get("project").is_none());
        let np: Value = serde_json::from_str(&apply_line(&r, &f, Some(crate::runner::NO_PROJECT), "s3")).unwrap();
        assert!(np.get("project").is_none());
        // The shipped registry: the engine's own stores are never in the line (they reach it through their own commands).
        let mut g = File::default();
        set(registry(), &mut g, "work.maxTurns", &json!(150), None).unwrap();
        set(registry(), &mut g, "fun.reactions", &json!(false), None).unwrap();
        let l: Value = serde_json::from_str(&apply_line(registry(), &g, None, "s4")).unwrap();
        assert_eq!(l["values"], json!({ "work.maxTurns": 150 }));
        // Memory, Explain and teaching (area 3): what the engine reads reaches it, Your turn included; the pages' own do not.
        let mut h = File::default();
        let area = [("explain.after", json!("plansOnly")), ("memory.learnFromFiles", json!(false)), ("memory.learnFromWords", json!(false)), ("memory.rememberGoals", json!(false)), ("memory.tellClaude", json!(false)), ("memory.recallLength", json!("long")), ("teach.yourTurn", json!(true)), ("task.offRecordByDefault", json!(true)), ("memory.toastSeconds", json!("60")), ("recap.after", json!("off"))];
        for (k, v) in area.iter() { assert!(set(registry(), &mut h, k, v, None).unwrap(), "{k}"); }
        let l: Value = serde_json::from_str(&apply_line(registry(), &h, None, "s5")).unwrap();
        assert_eq!(l["values"], json!({ "explain.after": "plansOnly", "memory.learnFromFiles": false, "memory.learnFromWords": false, "memory.rememberGoals": false, "memory.tellClaude": false, "memory.recallLength": "long", "teach.yourTurn": true }));
        // Explain after a task is the engine's own (memory-settings.json), so it is never kept here.
        assert!(set(registry(), &mut h, "explain.mode", &json!("off"), None).is_err());
    }
    #[test]
    fn a_migrated_setting_the_engine_reads_reaches_it_at_once() {
        // Your turn came from page storage, and the engine reads it now (it works out an offer only when it is on), so the
        // migration sends the engine its settings again, as any other change it applies does.
        let d = registry().get("teach.yourTurn").unwrap();
        assert!(d.from_page.is_some() && needs_apply(d));
        let main = include_str!("main.rs");
        let at = main.find("fn settings_migrate(").unwrap();
        let body = &main[at..at + main[at..].find("\n}\n").unwrap()];
        assert!(body.contains("if written.iter().any(|k| settings::registry().get(k).is_some_and(settings::needs_apply)) { send_settings(&app); }"), "{body}");
    }
    #[test]
    fn area_1_the_engine_is_given_how_work_runs_and_never_the_budgets_or_models_the_pages_send() {
        let mut f = File::default();
        for (k, v) in [("work.tries", json!(5)), ("work.askOnAnyFailure", json!(true)), ("work.tryAgain", json!("fresh")), ("drive.maxSteps", json!(3)), ("approval.waitMinutes", json!(20)), ("model.quick", json!("recommended")),
                       ("budget.task", json!(12.5)), ("budget.plan", json!(20)), ("budget.rescue", json!(1)), ("budget.research", json!(50)), ("model.work", json!("careful")), ("model.rescue", json!("recommended"))] {
            assert_eq!(set(registry(), &mut f, k, &v, None), Ok(true), "{k}");
            let d = registry().get(k).unwrap();
            assert_eq!(needs_apply(d), d.applies_to("runner"), "{k}");
        }
        let l: Value = serde_json::from_str(&apply_line(registry(), &f, None, "a1")).unwrap();
        assert_eq!(l["values"], json!({ "work.tries": 5, "work.askOnAnyFailure": true, "work.tryAgain": "fresh", "drive.maxSteps": 3, "approval.waitMinutes": 20, "model.quick": "recommended" }));
        // The usual values are never stored, so putting one back reaches the engine as a missing name.
        for k in ["work.tries", "approval.waitMinutes"] { let usual = registry().get(k).unwrap().default.clone(); set(registry(), &mut f, k, &usual, None).unwrap(); }
        let l: Value = serde_json::from_str(&apply_line(registry(), &f, None, "a2")).unwrap();
        assert!(l["values"].get("work.tries").is_none() && l["values"].get("approval.waitMinutes").is_none());
        // Out of range is refused here too, before anything is kept or sent.
        assert_eq!(set(registry(), &mut f, "budget.task", &json!(50.5), None), Err("tooHigh"));
        assert_eq!(set(registry(), &mut f, "approval.waitMinutes", &json!(4), None), Err("tooLow"));
        // The longest wait is 30 minutes until a real run shows a safety hook still waiting past 32 minutes is honoured (T05).
        assert_eq!(set(registry(), &mut f, "approval.waitMinutes", &json!(35), None), Err("tooHigh"));
        assert_eq!(set(registry(), &mut f, "approval.waitMinutes", &json!(120), None), Err("tooHigh"));
        assert_eq!(set(registry(), &mut f, "model.work", &json!("claude-opus-5-5"), None), Err("notChoice"));
    }
    #[test]
    fn the_engines_own_settings_go_to_it_as_its_own_commands() {
        let c = runner_command("spend.dailyLimit", &json!(25), "", "i").unwrap();
        assert_eq!((c["type"].as_str(), c["project"].as_str(), c["limitUsd"].as_f64()), (Some("spending.set"), Some(crate::runner::NO_PROJECT), Some(25.0)));
        assert_eq!(runner_command("explain.mode", &json!("reasons"), "/p", "i").unwrap(), json!({ "v": 1, "id": "i", "type": "explain.set", "project": "/p", "mode": "reasons" }));
        assert_eq!(runner_command("explain.mode", &json!("off"), "", "i").unwrap()["project"], crate::runner::NO_PROJECT);
        assert_eq!(runner_command("memory.paused", &json!(true), "/p", "i").unwrap()["type"], "memory.pause");
        assert_eq!(runner_command("numbers.on", &json!(true), "/p", "i").unwrap(), json!({ "v": 1, "id": "i", "type": "metrics.set", "enabled": true }));
        assert!(runner_command("fun.reactions", &json!(true), "/p", "i").is_none());
        assert!(runner_command("explain.mode", &json!(true), "/p", "i").is_none());
        assert!(runner_command("explain.on", &json!(false), "/p", "i").is_none());   // replaced by explain.mode
        // Every one of the engine's own settings in the registry has its command.
        for d in registry().defs.iter().filter(|d| d.runner_store()) { assert!(runner_command(&d.key, &d.default, "", "i").is_some(), "{}", d.key); }
    }
    #[test]
    fn only_homes_own_window_may_change_settings() {
        assert!(only_card("card").is_ok());
        for w in ["dock", "overlay", "island", "", "Card"] { assert_eq!(only_card(w), Err("not_card"), "{w}"); }
        // Every command that changes settings checks the window first (main.rs).
        let main = include_str!("main.rs");
        for c in ["fn settings_set(", "fn settings_reset(", "fn settings_migrate(", "fn front_app(", "fn app_names("] {
            let at = main.find(c).unwrap_or_else(|| panic!("{c} is missing"));
            let body = &main[at..at + main[at..].find("\n}\n").unwrap()];
            assert!(body.contains("settings::only_card(window.label())?"), "{c} does not check the window");
        }
        // The per app answers change only through settings_set and prompthelp.rs's rules, with the id of the app in front.
        let at = main.find("fn setting_change(").unwrap();
        let change = &main[at..at + main[at..].find("\n}\n").unwrap()];
        assert!(change.contains("\"promptHelpApps\" => {") && change.contains("phelp::apps_change(value, &front_id())?"), "{change}");
        // The app in front, for Add the app in front: its id and name only, never Companion itself.
        let at = main.find("fn front_app(").unwrap();
        let front = &main[at..at + main[at..].find("\n}\n").unwrap()];
        assert!(front.contains("front_id()") && front.contains("dev.companion") && !front.contains("on_screen_windows"), "{front}");
        for c in ["front_app", "app_names"] { assert!(main.contains(&format!(", {c},")) || main.contains(&format!(", {c}]")), "{c} is not a command"); }
    }
    #[test]
    fn the_shell_resets_and_puts_back_only_through_these_rules() {
        let main = include_str!("main.rs");
        let body = |c: &str| { let at = main.find(c).unwrap_or_else(|| panic!("{c} is missing")); main[at..at + main[at..].find("\n}\n").unwrap()].to_string() };
        // Reset: what changes in the shell's own stores and the engine's is the plan (reset_plan, tested above), never a
        // decision of its own; settings.json is reset by reset(), tested above.
        let reset = body("fn settings_reset(");
        assert!(reset.contains("settings::reset_plan(") && reset.contains("for d in plan.iter()"), "{reset}");
        assert!(!reset.contains("for d in targets") && !reset.contains("keys_picked() !=") && !reset.contains("before != voiceset"), "{reset}");
        // Undo: the voice and the keys come back only as voice_from and keys_from read them.
        let change = body("fn setting_change(");
        assert!(change.contains("settings::voice_from(value)?") && change.contains("settings::keys_from(value)?"), "{change}");
        assert!(!change.contains("voiceset::parse(") && !change.contains("keymap::parse("), "{change}");
        // A file that could not be read is never saved over: every path that writes settings.json asks first.
        for c in ["fn settings_migrate(", "fn setting_change(", "fn settings_reset("] { assert!(body(c).contains("settings_writable("), "{c}"); }
        assert!(body("fn settings_writable(").contains("settings::ready_to_save("));
    }
    #[test]
    fn house_rules_are_shown_from_the_projects_own_file_and_no_reset_ever_touches_them() {
        let w = |rules: Result<Option<String>, &'static str>| Wrapped { dock: Default::default(), presentation: Default::default(), keys: crate::keymap::Map::DEFAULT, voice: Default::default(), ph_apps: json!({ "apps": {} }), rules };
        let snap = snapshot(registry(), &File::default(), Some("/p"), &w(Ok(Some("# mine\nnever edit .env\nask before installing packages\n".into()))), &[], &[]);
        assert_eq!(snap["values"]["rules.house"], json!(["never edit .env", "ask before installing packages"]));
        assert_eq!(snap["usual"]["rules.house"], json!([]));
        // A file that cannot be read here: no value, and one plain problem, so the row can say so and Save is refused.
        let bad = snapshot(registry(), &File::default(), Some("/p"), &w(Err(crate::houserules::UNREADABLE)), &[], &[]);
        assert!(bad["values"].get("rules.house").is_none());
        assert_eq!(bad["problems"], json!([{ "key": "rules.house", "code": "rulesUnreadable" }]));
        // No project chosen: no rules shown.
        let none = snapshot(registry(), &File::default(), None, &w(Ok(None)), &[], &[]);
        assert!(none["values"].get("rules.house").is_none());
        // Protective: never in a reset, whatever the page was shown, and never reset on its own.
        let (values, usual) = (snap["values"].as_object().unwrap(), snap["usual"].as_object().unwrap());
        for which in [Which::All, Which::Section("checks")] { assert!(!reset_plan(registry(), which, values, usual, &[]).unwrap().contains(&"rules.house".to_string())); }
        assert_eq!(reset_targets(registry(), Which::Key("rules.house")).err(), Some("protective"));
        // And it is never in the engine's settings line: the engine reads the file itself.
        assert!(!apply_line(registry(), &File::default(), Some("/p"), "x").contains("rules.house"));
    }
    #[test]
    fn a_change_for_one_project_is_never_kept_for_another() {
        let r = registry();
        let (rules, skip, reactions) = (r.get("rules.house").unwrap(), r.get("check.skip").unwrap(), r.get("fun.reactions").unwrap());
        // House rules always say which project's list they are; kept only while that is still the project in Home.
        assert_eq!(for_project(rules, Some("/a"), Some("/a")), Ok(Some("/a")));
        assert_eq!(for_project(rules, Some("/a"), Some("/b")), Err("projectChanged"));
        assert_eq!(for_project(rules, None, Some("/b")), Err("projectChanged"));
        assert_eq!(for_project(rules, Some("/a"), None), Err("projectChanged"));
        // Any other change that says its project is refused the same way; one that does not (Undo after a reset) is as before.
        assert_eq!(for_project(skip, Some("/a"), Some("/b")), Err("projectChanged"));
        assert_eq!(for_project(skip, None, Some("/b")), Ok(Some("/b")));
        assert_eq!(for_project(reactions, None, None), Ok(None));
        // The shell asks it for every change, and writes the rules file of the project the list came from.
        let main = include_str!("main.rs");
        let set = &main[main.find("fn settings_set(").unwrap()..];
        let set = &set[..set.find("\n}\n").unwrap()];
        assert!(set.contains("project: Option<String>"), "settings_set takes the project the page was shown");
        let change = &main[main.find("fn setting_change(").unwrap()..];
        assert!(change.contains("settings::for_project(d, asked, project_opt().as_deref())?"));
        let rules_arm = &change[change.find("\"rules\" => {").unwrap()..];
        let rules_arm = &rules_arm[..rules_arm.find("\n        }\n").unwrap()];
        assert!(!rules_arm.contains("project_opt()"), "the rules are written to the project they came from, never to whichever is current");
    }
    #[test]
    fn a_start_is_one_of_the_projects_own_scripts_and_never_a_command() {
        let d = registry().get("check.start").unwrap();
        assert_eq!(d.options_from.as_deref(), Some("projectScripts"));
        for ok in ["auto", "dev", "start:prod", "serve.b_c-d"] { assert_eq!(validate(d, &json!(ok)), Ok(json!(ok)), "{ok}"); }
        for no in ["dev; rm -rf ~", "npm run dev", "", "-x", "dev server", "$(id)", "a.b_c-d"] { assert_eq!(validate(d, &json!(no)), Err("notChoice"), "{no}"); }
        // Only a script that starts the project: never a build, a lint, the tests, an install step or a deploy.
        for no in ["build", "lint", "test", "deploy", "postinstall", "predev", "devserver", "dev:"] { assert_eq!(validate(d, &json!(no)), Err("notChoice"), "{no}"); assert!(!start_script(no), "{no}"); }
        // Only a choice may take its options from the project, and it still needs its fixed one.
        let broken = |key: &str, patch: Value| { let mut v: Value = serde_json::from_str(REGISTRY_TEXT).unwrap(); let d = v["settings"].as_array_mut().unwrap().iter_mut().find(|d| d["key"] == key).unwrap(); for (k, x) in patch.as_object().unwrap() { d[k] = x.clone(); } check_registry(&parse_registry(&v.to_string()).unwrap()) };
        assert!(!broken("check.start", json!({ "optionsFrom": null })).is_empty());
        assert!(!broken("check.start", json!({ "optionsFrom": "files" })).is_empty());
        assert!(!broken("check.press", json!({ "optionsFrom": "projectScripts" })).is_empty());
        assert!(!broken("rules.house", json!({ "protective": false })).is_empty(), "the house rules store holds only a protective list");
        assert!(broken("check.time", json!({ "optionsFrom": "projectScripts" })).is_empty());
    }
    #[test]
    fn the_wrapped_stores_read_and_change_through_their_own_files() {
        let p = crate::docking::Prefs::default();
        assert_eq!(dock_value(&p, "character.comeTo"), Some(json!(true)));
        let off = dock_with(&p, "character.comeTo", &json!(false)).unwrap();
        assert!(!off.come_to);
        assert_eq!(off.per_screen, p.per_screen);
        assert!(dock_with(&p, "character.comeTo", &json!("no")).is_none());
        let s = crate::presentation::Settings::default();
        assert_eq!(presentation_value(&s, "sharing.hide"), Some(json!(true)));
        let q = presentation_with(&s, "calls.quiet", &json!(false)).unwrap();
        assert!(q.hide_from_sharing && !q.quiet_on_calls);
        assert!(presentation_with(&s, "sharing.hide", &json!(1)).is_none());
        // What every page is told: values the shell keeps, usual values, never the engine's own three as values.
        let w = Wrapped { dock: off, presentation: q, keys: crate::keymap::Map::DEFAULT, voice: crate::voiceset::Saved::default(), ph_apps: json!({ "apps": { "com.example.chat": "never" } }), rules: Ok(None) };
        let snap = snapshot(registry(), &File::default(), Some("/p"), &w, &[], &["calls.quiet".to_string()]);
        assert_eq!(snap["values"]["character.comeTo"], json!(false));
        assert_eq!(snap["values"]["calls.quiet"], json!(false));
        assert_eq!(snap["values"]["keys.hotkeys"], json!({}));
        assert_eq!(snap["usual"]["keys.hotkeys"], json!({}));
        assert_eq!(snap["values"]["talk.voice"], snap["usual"]["talk.voice"]);
        assert!(snap["values"].get("spend.dailyLimit").is_none());
        assert_eq!(snap["usual"]["spend.dailyLimit"], json!(10));
        assert_eq!(snap["changed"], json!(["calls.quiet"]));
        assert_eq!(snap["project"], "/p");
        // The per app answers (prompt_help.json) are shown whole, with their own usual value: no answers kept.
        assert_eq!(snap["values"]["ph.appAnswers"], json!({ "apps": { "com.example.chat": "never" } }));
        assert_eq!(snap["usual"]["ph.appAnswers"], json!({ "apps": {} }));
    }

    // ---- area 5: pointing, talking and other apps ----
    #[test]
    fn the_per_app_answers_are_never_reset_from_their_row_a_section_or_everything() {
        // Never entries the person added are protections (the built in never list cannot change at all): only the
        // editor's own Forget, after an inline confirm, removes one. So no reset ever touches the answers.
        let r = registry();
        let d = r.get("ph.appAnswers").unwrap();
        assert!(d.protective && d.kind == Kind::Custom && d.store == "promptHelpApps" && d.applies == ["shell"]);
        assert_eq!(reset_targets(r, Which::Key("ph.appAnswers")).err(), Some("protective"));
        let mut values = Map::new();
        values.insert("ph.appAnswers".into(), json!({ "apps": { "com.example.chat": "always", "com.example.notes": "never" } }));
        values.insert("ph.style".into(), json!("light"));
        let mut usual = Map::new();
        usual.insert("ph.appAnswers".into(), json!({ "apps": {} }));
        for which in [Which::All, Which::Section("otherApps")] {
            let plan = reset_plan(r, which, &values, &usual, &[]).unwrap();
            assert_eq!(plan, vec!["ph.style".to_string()], "{which:?}");
        }
        // And it is never kept in settings.json, whatever a file says.
        let (f, _, _) = parse_file(r, Some(r#"{"version":1,"values":{"ph.appAnswers":{"apps":{"x":"always"}}}}"#));
        assert!(f.values.get("ph.appAnswers").is_none());
        assert_eq!(set(r, &mut File::default(), "ph.appAnswers", &json!({ "op": "forgetAll" }), None), Err("custom"));
    }
    #[test]
    fn custom_and_protective_stay_narrow() {
        let patched = |key: &str, patch: &str| { let mut v: Value = serde_json::from_str(REGISTRY_TEXT).unwrap(); let p: Value = serde_json::from_str(patch).unwrap(); let d = v["settings"].as_array_mut().unwrap().iter_mut().find(|d| d["key"] == key).unwrap(); for (k, x) in p.as_object().unwrap() { d[k] = x.clone(); } check_registry(&parse_registry(&v.to_string()).unwrap()) };
        assert!(!patched("point.colour", r#"{"protective": true}"#).is_empty(), "a choice is never protective");
        assert!(!patched("ph.style", r#"{"store": "promptHelpApps"}"#).is_empty(), "a plain setting never uses an editor's store");
        assert!(!patched("ph.appAnswers", r#"{"store": "settings"}"#).is_empty(), "a custom row only for a store with its own editor");
        assert!(!patched("talk.voice", r#"{"protective": true}"#).is_empty(), "only the per app answers among the editors protect");
    }
    #[test]
    fn the_area_five_settings_keep_todays_behaviour_as_their_usual_values() {
        let r = registry();
        let usual = |k: &str| r.get(k).unwrap_or_else(|| panic!("{k} missing")).default.clone();
        assert_eq!(usual("point.ringSeconds"), json!(10));
        assert_eq!(usual("point.yourTurnSeconds"), json!(90));
        assert_eq!(usual("talk.maxHold"), json!("60"));
        assert_eq!(usual("drawIt.seconds"), json!("15"));
        assert_eq!(usual("point.guesses"), json!("softRing"));
        assert_eq!(usual("ph.style"), json!("full"));
        assert_eq!(usual("pointat.editor"), json!("editorInFront"));
        assert_eq!(usual("calls.apps"), json!(crate::presentation::CALL_APPS));
        // The ones the shell applies say so; the engine gets only its own two in the settings line.
        for k in ["point.ringSeconds", "point.yourTurnSeconds", "talk.maxHold", "drawIt.seconds", "point.guesses", "ph.style", "pointat.editor", "calls.apps", "ph.appAnswers"] {
            assert!(r.get(k).unwrap().applies_to("shell"), "{k}");
        }
        let mut f = File::default();
        for (k, v) in [("ph.useProjectInfo", json!(false)), ("ph.handBack", json!("copy")), ("ph.style", json!("light")), ("talk.maxHold", json!("30"))] { set(r, &mut f, k, &v, None).unwrap(); }
        let line: Value = serde_json::from_str(&apply_line(r, &f, None, "x")).unwrap();
        assert_eq!(line["values"], json!({ "ph.useProjectInfo": false, "ph.handBack": "copy" }));
    }

    #[test]
    fn the_characters_place_is_read_and_changed_on_the_display_it_is_on_in_dock_json() {
        use crate::docking::{Edge, Prefs};
        // The usual place (nothing saved): the right edge, halfway, the same as today.
        let none = Prefs { last_screen: "a".into(), ..Default::default() };
        assert_eq!((dock_value(&none, "character.edge"), dock_value(&none, "character.position"), dock_value(&none, "character.sameEverywhere")), (Some(json!("right")), Some(json!(50)), Some(json!(false))));
        // A place dragged by hand is shown on its step (5 percent), as the row's plus and minus move it.
        let mut p = Prefs { last_screen: "a".into(), ..Default::default() };
        p.per_screen.insert("a".into(), (Edge::Left, 0.3712));
        p.per_screen.insert("b".into(), (Edge::Bottom, 0.9));
        assert_eq!(dock_value(&p, "character.edge"), Some(json!("left")));
        assert_eq!(dock_value(&p, "character.position"), Some(json!(35)));
        for (at, shown) in [(0.0, 0), (0.024, 0), (0.026, 5), (0.4812, 50), (0.9, 90), (0.99, 100), (1.0, 100)] {
            let q = Prefs { last_screen: "a".into(), per_screen: [("a".to_string(), (Edge::Right, at))].into_iter().collect(), ..Default::default() };
            assert_eq!(dock_value(&q, "character.position"), Some(json!(shown)), "{at}");
        }
        // A change is made on the display the character is on, and only there; the other keeps its own place.
        let top = dock_with(&p, "character.edge", &json!("top")).unwrap();
        assert_eq!(top.per_screen["a"], (Edge::Top, 0.3712));
        assert_eq!(top.per_screen["b"], (Edge::Bottom, 0.9));
        let at = dock_with(&p, "character.position", &json!(80)).unwrap();
        assert_eq!(at.per_screen["a"], (Edge::Left, 0.8));
        for (v, want) in [(0, 0.0), (100, 1.0), (50, 0.5)] { assert_eq!(dock_with(&none, "character.position", &json!(v)).unwrap().per_screen["a"], (Edge::Right, want), "{v}"); }
        // Same place on every display: on copies this display's place; a change here then moves the copy too; off drops it.
        let same = dock_with(&p, "character.sameEverywhere", &json!(true)).unwrap();
        assert_eq!(same.same_everywhere, Some((Edge::Left, 0.3712)));
        assert_eq!(dock_value(&same, "character.sameEverywhere"), Some(json!(true)));
        assert_eq!(dock_with(&same, "character.edge", &json!("bottom")).unwrap().same_everywhere, Some((Edge::Bottom, 0.3712)));
        assert_eq!(dock_with(&same, "character.sameEverywhere", &json!(false)).unwrap().same_everywhere, None);
        // Come to what it is about is untouched by these, and they leave it alone.
        assert_eq!(dock_with(&p, "character.edge", &json!("top")).unwrap().come_to, p.come_to);
        // Nothing to change it on (no display known yet), or a value that is not one: nothing changes.
        assert!(dock_with(&Prefs::default(), "character.edge", &json!("top")).is_none());
        assert!(dock_with(&p, "character.edge", &json!("middle")).is_none());
        assert!(dock_with(&p, "character.position", &json!("half")).is_none());
        assert!(dock_with(&p, "character.sameEverywhere", &json!(1)).is_none());
        // What every page is told, and what a reset of the section puts back.
        let w = Wrapped { dock: p.clone(), presentation: Default::default(), keys: crate::keymap::Map::DEFAULT, voice: Default::default(), ph_apps: json!({ "apps": {} }), rules: Ok(None) };
        let snap = snapshot(registry(), &File::default(), None, &w, &[], &[]);
        assert_eq!((snap["values"]["character.edge"].clone(), snap["values"]["character.position"].clone()), (json!("left"), json!(35)));
        let mut plan = reset_plan(registry(), Which::Section("home"), snap["values"].as_object().unwrap(), snap["usual"].as_object().unwrap(), &[]).unwrap();
        plan.sort();
        assert_eq!(plan, vec!["character.edge".to_string(), "character.position".to_string()]);
        // The exact place behind the shown one, for Undo only: a place on its step needs none.
        assert_eq!(snap["restore"], json!({ "character.position": { "fraction": 0.3712 } }));
        let on_step = Wrapped { dock: at.clone(), ..w };
        assert_eq!(snapshot(registry(), &File::default(), None, &on_step, &[], &[])["restore"], json!({}));
    }

    #[test]
    fn undo_after_a_reset_puts_a_dragged_place_back_exactly() {
        use crate::docking::{Edge, Prefs};
        let d = registry().get("character.position").unwrap();
        let p = Prefs { last_screen: "a".into(), per_screen: [("a".to_string(), (Edge::Left, 0.5))].into_iter().collect(), ..Default::default() };
        // Undo's value is the exact fraction along the edge, as dock.json keeps it: it is not snapped to the step.
        let v = dock_input(d, &json!({ "fraction": 0.3712 })).unwrap();
        assert_eq!(dock_with(&p, "character.position", &v).unwrap().per_screen["a"], (Edge::Left, 0.3712));
        // A plain number is still checked and put on its step, as from the row.
        let n = dock_input(d, &json!(37)).unwrap();
        assert_eq!(n, json!(35));
        assert_eq!(dock_with(&p, "character.position", &n).unwrap().per_screen["a"], (Edge::Left, 0.35));
        assert_eq!(dock_input(d, &json!(120)), Err("tooHigh"));
        // Anything else is refused: outside the edge, not a number, more than the one field, or for another setting.
        for bad in [json!({ "fraction": 1.5 }), json!({ "fraction": -0.1 }), json!({ "fraction": "half" }), json!({ "fraction": 0.3, "edge": "top" }), json!({})] { assert!(dock_input(d, &bad).is_err(), "{bad}"); }
        assert!(dock_input(registry().get("character.edge").unwrap(), &json!({ "fraction": 0.3 })).is_err());
        assert!(place_from(&json!(0.3)).is_none());
        // Every Undo value in the shared reset cases is one the shell takes and puts back exactly (settingsStore.test.ts
        // checks the page keeps exactly these).
        let mut seen = 0;
        for c in reset_cases().iter().filter(|c| c.get("undo").is_some()) {
            for pair in c["undo"].as_array().unwrap() {
                let (k, v) = (pair[0].as_str().unwrap(), &pair[1]);
                let def = registry().get(k).unwrap();
                if def.store != "dock" { continue; }
                let next = dock_with(&p, k, &dock_input(def, v).unwrap()).unwrap();
                assert_eq!(dock_value(&next, k).unwrap(), c["values"][k], "{k}: shown as before the reset");
                if let Some(f) = place_from(v) { assert_eq!(next.per_screen["a"].1, f, "{k}: exactly"); seen += 1; }
            }
        }
        assert!(seen > 0, "a shared case covers a dragged place");
    }
}
