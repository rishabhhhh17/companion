//! M76 (closing M75's gap): Delete everything, and a project leaving (moved to the Trash from Home or Settings), take out
//! the done signal hooks Squibby added to that project's own tool settings, exactly as Remove does in
//! runner/src/donesignal.ts:
//! - only Squibby's own entries go: under Stop, a command that starts with `/usr/bin/touch -- ` and names Squibby's own
//!   `done` folder in its data folder; under PreToolUse and Notification (M77, the guard and waiting hooks), a command that
//!   opens with `d='<Squibby's guard folder>';`. Every other key and hook stays, in the order it was in.
//! - a file that is not plain JSON, or a link, is left exactly as it was.
//! - a file Squibby made (recorded in its own `done-signals.json`) that holds nothing else is removed, and its folder too if
//!   Squibby made that and it is empty. A file the person had is kept, even when empty.
//! Nothing here runs git or reads anything but these two files and Squibby's own index (rule 10).
use std::fs;
use std::path::{Path, PathBuf};

/// Each tool's project hook file, as donesignal.ts HOOK_FILE says.
pub const HOOK_FILES: &[(&str, &str)] = &[("claude", ".claude/settings.local.json"), ("codex", ".codex/hooks.json")];
/// The index of tokens and what Squibby made, in the engine's data folder (donesignal.ts DONE_INDEX).
pub const INDEX: &str = "done-signals.json";
/// The events Squibby's hooks sit under (donesignal.ts HOOK_EVENT): the done signal, the guard and the waiting hook (M77),
/// and the start block (M78).
pub const EVENTS: &[&str] = &["Stop", "PreToolUse", "Notification", "SessionStart"];

// ---------- a small JSON reader and writer that keeps the order of keys ----------
// The app's serde_json sorts the keys of an object, which would reorder the person's file. This keeps them as written.

#[derive(Debug, Clone, PartialEq)]
pub enum J { Obj(Vec<(String, J)>), Arr(Vec<J>), Str(String), /** a number, true, false or null, as written */ Raw(String) }

struct P<'a> { s: &'a [u8], i: usize }
impl<'a> P<'a> {
    fn ws(&mut self) { while self.i < self.s.len() && matches!(self.s[self.i], b' ' | b'\n' | b'\r' | b'\t') { self.i += 1; } }
    fn val(&mut self, depth: usize) -> Option<J> {
        if depth > 64 { return None; }
        self.ws();
        match *self.s.get(self.i)? {
            b'{' => {
                self.i += 1; let mut out = vec![]; self.ws();
                if self.s.get(self.i) == Some(&b'}') { self.i += 1; return Some(J::Obj(out)); }
                loop {
                    self.ws();
                    let J::Str(k) = self.string()? else { return None };
                    self.ws(); if self.s.get(self.i) != Some(&b':') { return None; } self.i += 1;
                    let v = self.val(depth + 1)?;
                    out.push((k, v)); self.ws();
                    match self.s.get(self.i)? { b',' => self.i += 1, b'}' => { self.i += 1; return Some(J::Obj(out)); } _ => return None }
                }
            }
            b'[' => {
                self.i += 1; let mut out = vec![]; self.ws();
                if self.s.get(self.i) == Some(&b']') { self.i += 1; return Some(J::Arr(out)); }
                loop {
                    out.push(self.val(depth + 1)?); self.ws();
                    match self.s.get(self.i)? { b',' => self.i += 1, b']' => { self.i += 1; return Some(J::Arr(out)); } _ => return None }
                }
            }
            b'"' => self.string(),
            _ => {
                let a = self.i;
                while self.i < self.s.len() && !matches!(self.s[self.i], b',' | b'}' | b']' | b' ' | b'\n' | b'\r' | b'\t') { self.i += 1; }
                let raw = std::str::from_utf8(&self.s[a..self.i]).ok()?.to_string();
                // Checked by serde_json: a plain number, true, false or null only.
                match serde_json::from_str::<serde_json::Value>(&raw).ok()? { serde_json::Value::Number(_) | serde_json::Value::Bool(_) | serde_json::Value::Null => Some(J::Raw(raw)), _ => None }
            }
        }
    }
    fn string(&mut self) -> Option<J> {
        if self.s.get(self.i) != Some(&b'"') { return None; }
        let a = self.i; self.i += 1;
        while self.i < self.s.len() { match self.s[self.i] { b'\\' => self.i += 2, b'"' => { self.i += 1; let raw = std::str::from_utf8(&self.s[a..self.i]).ok()?; return serde_json::from_str::<String>(raw).ok().map(J::Str); } _ => self.i += 1 } }
        None
    }
}

/// The text as JSON, keys in their order. None for anything that is not one whole JSON value.
pub fn parse(text: &str) -> Option<J> {
    let mut p = P { s: text.as_bytes(), i: 0 };
    let v = p.val(0)?; p.ws();
    (p.i == p.s.len()).then_some(v)
}

/// Written the way the engine writes it (JSON.stringify with two spaces).
pub fn write(v: &J) -> String { let mut s = String::new(); put(v, 0, &mut s); s }
fn put(v: &J, ind: usize, s: &mut String) {
    let pad = |n: usize| " ".repeat(n * 2);
    match v {
        J::Raw(r) => s.push_str(r),
        J::Str(t) => s.push_str(&serde_json::to_string(t).unwrap_or_default()),
        J::Arr(a) if a.is_empty() => s.push_str("[]"),
        J::Obj(o) if o.is_empty() => s.push_str("{}"),
        J::Arr(a) => { s.push_str("[\n"); for (n, x) in a.iter().enumerate() { s.push_str(&pad(ind + 1)); put(x, ind + 1, s); if n + 1 < a.len() { s.push(','); } s.push('\n'); } s.push_str(&pad(ind)); s.push(']'); }
        J::Obj(o) => { s.push_str("{\n"); for (n, (k, x)) in o.iter().enumerate() { s.push_str(&pad(ind + 1)); s.push_str(&serde_json::to_string(k).unwrap_or_default()); s.push_str(": "); put(x, ind + 1, s); if n + 1 < o.len() { s.push(','); } s.push('\n'); } s.push_str(&pad(ind)); s.push('}'); }
    }
}
fn get<'a>(o: &'a [(String, J)], k: &str) -> Option<&'a J> { o.iter().find(|(x, _)| x == k).map(|(_, v)| v) }

// ---------- Squibby's own entries ----------

/// A path inside single quotes for /bin/sh, as donesignal.ts shQuote writes it.
fn sh_quote(s: &str) -> String { format!("'{}'", s.replace('\'', "'\\''")) }
/// Whether an entry is a Squibby hook of this data folder (donesignal.ts anyOurs): the done signal's touch of the done
/// folder, a guard or waiting command that opens with the guard folder, or (M78) a start command that opens with the start
/// folder.
fn ours(entry: &J, done_dir: &str, guard_dir: &str, start_dir: &str) -> bool {
    let J::Obj(o) = entry else { return false };
    let Some(J::Arr(hooks)) = get(o, "hooks") else { return false };
    let guard_open = format!("d={};", sh_quote(guard_dir));
    let start_open = format!("s={};", sh_quote(start_dir));
    hooks.iter().any(|h| matches!(h, J::Obj(ho) if matches!(get(ho, "command"), Some(J::Str(c)) if (c.starts_with("/usr/bin/touch -- ") && c.contains(&format!("{done_dir}/"))) || c.starts_with(&guard_open) || c.starts_with(&start_open))))
}

#[derive(Debug, Default, Clone, PartialEq)]
struct Rec { made: Vec<String>, folders: Vec<String> }

fn index(runner_data: &Path) -> serde_json::Map<String, serde_json::Value> {
    fs::read_to_string(runner_data.join(INDEX)).ok().and_then(|t| serde_json::from_str::<serde_json::Value>(&t).ok()).and_then(|v| v.as_object().cloned()).unwrap_or_default()
}
fn rec_of(runner_data: &Path, project: &Path) -> Rec {
    let all = index(runner_data);
    let Some(r) = all.get(&project.to_string_lossy().to_string()).and_then(|v| v.as_object()) else { return Rec::default() };
    let list = |k: &str| r.get(k).and_then(|v| v.as_array()).map(|a| a.iter().filter_map(|x| x.as_str().map(String::from)).collect()).unwrap_or_default();
    Rec { made: list("made"), folders: list("folders") }
}

/// The projects Squibby's index names (where a hook may have been added). Only absolute paths that are folders now.
pub fn projects_with_hooks(runner_data: &Path) -> Vec<PathBuf> {
    index(runner_data).keys().map(PathBuf::from).filter(|p| p.is_absolute() && fs::symlink_metadata(p).is_ok_and(|m| m.is_dir())).collect()
}

/// Takes Squibby's own entries (Stop, PreToolUse, Notification) out of one project's hook files. Returns the files it
/// changed or removed, by their path from the project folder down.
pub fn remove(project: &Path, runner_data: &Path) -> Vec<String> {
    let done_dir = runner_data.join("done").to_string_lossy().to_string();
    let guard_dir = runner_data.join("guard").to_string_lossy().to_string();
    let start_dir = runner_data.join("start").to_string_lossy().to_string();
    let rec = rec_of(runner_data, project);
    let mut said = vec![];
    for (tool, rel) in HOOK_FILES {
        let file = project.join(rel);
        // A link, a folder, or no file at all: left alone.
        if !fs::symlink_metadata(&file).is_ok_and(|m| m.is_file()) { continue; }
        let Ok(text) = fs::read_to_string(&file) else { continue };
        let Some(J::Obj(mut top)) = parse(&text) else { continue };   // not plain JSON: never changed
        let Some(pos) = top.iter().position(|(k, _)| k == "hooks") else { continue };
        let J::Obj(mut hooks) = top[pos].1.clone() else { continue };
        let mut changed = false;
        for event in EVENTS {
            let Some(sp) = hooks.iter().position(|(k, _)| k == event) else { continue };
            let J::Arr(list) = hooks[sp].1.clone() else { continue };
            let kept: Vec<J> = list.iter().filter(|e| !ours(e, &done_dir, &guard_dir, &start_dir)).cloned().collect();
            if kept.len() == list.len() { continue; }   // nothing of Squibby's under this event
            changed = true;
            if kept.is_empty() { hooks.remove(sp); } else { hooks[sp].1 = J::Arr(kept); }
        }
        if !changed { continue; }
        if hooks.is_empty() { top.remove(pos); } else { top[pos].1 = J::Obj(hooks); }
        if top.is_empty() && rec.made.iter().any(|t| t == tool) {
            if fs::remove_file(&file).is_ok() {
                said.push(rel.to_string());
                if rec.folders.iter().any(|t| t == tool) { let _ = fs::remove_dir(project.join(rel.split('/').next().unwrap_or(""))); }   // only if empty
            }
        } else if crate::wipe::replace_file(&file, format!("{}\n", write(&J::Obj(top))).as_bytes()).is_ok() {
            said.push(rel.to_string());
        }
    }
    said
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs::{create_dir_all, write as fwrite};

    struct T { root: PathBuf, project: PathBuf, data: PathBuf }
    impl Drop for T { fn drop(&mut self) { let _ = fs::remove_dir_all(&self.root); } }
    fn t(name: &str) -> T {
        let root = std::env::temp_dir().join(format!("companion-donehooks-{name}-{}", std::process::id()));
        let _ = fs::remove_dir_all(&root);
        let project = root.join("site"); let data = root.join("data/runner");
        create_dir_all(&project).unwrap(); create_dir_all(data.join("done")).unwrap();
        T { root, project, data }
    }
    fn cmd(data: &Path) -> String { format!("/usr/bin/touch -- '{}/done/0123456789abcdef01234567' 2>/dev/null; printf '{{}}'", data.display()) }
    fn ours_entry(data: &Path) -> String { format!("{{ \"hooks\": [ {{ \"type\": \"command\", \"command\": {} }} ] }}", serde_json::to_string(&cmd(data)).unwrap()) }
    fn index_with(t: &T, made: &[&str], folders: &[&str]) {
        let v = serde_json::json!({ t.project.to_string_lossy().to_string(): { "token": "0123456789abcdef01234567", "made": made, "folders": folders } });
        fwrite(t.data.join(INDEX), v.to_string()).unwrap();
    }

    #[test]
    fn only_squibbys_entry_goes_and_every_other_key_and_hook_stays_in_its_order() {
        let t = t("keep");
        create_dir_all(t.project.join(".claude")).unwrap();
        let theirs = r#"{ "hooks": [ { "type": "command", "command": "npm run lint" } ] }"#;
        let text = format!("{{\n  \"permissions\": {{ \"allow\": [\"Bash(npm test)\"] }},\n  \"hooks\": {{\n    \"Stop\": [ {theirs}, {} ],\n    \"PreToolUse\": [ {{ \"matcher\": \"Bash\", \"hooks\": [] }} ]\n  }},\n  \"model\": \"x\",\n  \"n\": 1.50\n}}\n", ours_entry(&t.data));
        fwrite(t.project.join(".claude/settings.local.json"), &text).unwrap();
        index_with(&t, &[], &[]);
        assert_eq!(remove(&t.project, &t.data), vec![".claude/settings.local.json"]);
        let after = fs::read_to_string(t.project.join(".claude/settings.local.json")).unwrap();
        assert!(!after.contains("/usr/bin/touch"), "{after}");
        assert!(after.contains("npm run lint") && after.contains("PreToolUse") && after.contains("Bash(npm test)") && after.contains("1.50"), "{after}");
        let order: Vec<usize> = ["\"permissions\"", "\"hooks\"", "\"model\"", "\"n\""].iter().map(|k| after.find(k).unwrap()).collect();
        assert!(order.windows(2).all(|w| w[0] < w[1]), "the keys keep their order: {after}");
        assert!(serde_json::from_str::<serde_json::Value>(&after).is_ok());
        // Removing again changes nothing.
        assert!(remove(&t.project, &t.data).is_empty());
    }
    fn guard_cmd(data: &Path) -> String { format!("d='{}/guard'; p=$(cat \"$d/pid\" 2>/dev/null) && kill -0 \"$p\" 2>/dev/null || exit 0; r=\"$d/0123456789abcdef01234567.$$\"; exit 0", data.display()) }
    #[test]
    fn m77_the_guard_and_waiting_entries_go_with_the_stop_entry_and_the_persons_own_pretooluse_stays() {
        let t = t("guard");
        create_dir_all(t.project.join(".claude")).unwrap();
        let theirs = r#"{ "matcher": "Bash", "hooks": [ { "type": "command", "command": "echo hi" } ] }"#;
        let guard = format!("{{ \"matcher\": \"Bash\", \"hooks\": [ {{ \"type\": \"command\", \"command\": {}, \"timeout\": 10 }} ] }}", serde_json::to_string(&guard_cmd(&t.data)).unwrap());
        let waiting = format!("{{ \"matcher\": \"permission_prompt|idle_prompt\", \"hooks\": [ {{ \"type\": \"command\", \"command\": {}, \"timeout\": 5 }} ] }}", serde_json::to_string(&guard_cmd(&t.data).replace("r=", "n=")).unwrap());
        let text = format!("{{\n  \"hooks\": {{\n    \"Stop\": [ {} ],\n    \"PreToolUse\": [ {theirs}, {guard} ],\n    \"Notification\": [ {waiting} ]\n  }},\n  \"model\": \"x\"\n}}\n", ours_entry(&t.data));
        fwrite(t.project.join(".claude/settings.local.json"), &text).unwrap();
        index_with(&t, &[], &[]);
        assert_eq!(remove(&t.project, &t.data), vec![".claude/settings.local.json"]);
        let after = fs::read_to_string(t.project.join(".claude/settings.local.json")).unwrap();
        assert!(!after.contains("/guard'") && !after.contains("/usr/bin/touch"), "{after}");
        assert!(after.contains("echo hi") && after.contains("PreToolUse") && !after.contains("Notification") && !after.contains("\"Stop\""), "{after}");
        assert!(after.find("\"hooks\"").unwrap() < after.find("\"model\"").unwrap(), "the keys keep their order: {after}");
        let v: serde_json::Value = serde_json::from_str(&after).unwrap();
        assert_eq!(v["hooks"]["PreToolUse"].as_array().unwrap().len(), 1);
        // Another data folder's guard hook stays.
        let other = format!("{{ \"matcher\": \"Bash\", \"hooks\": [ {{ \"type\": \"command\", \"command\": \"d='/tmp/elsewhere/guard'; exit 0\" }} ] }}");
        fwrite(t.project.join(".claude/settings.local.json"), format!("{{ \"hooks\": {{ \"PreToolUse\": [ {other} ] }} }}")).unwrap();
        assert!(remove(&t.project, &t.data).is_empty());
    }
    #[test]
    fn m78_the_start_entry_goes_too_and_the_persons_own_session_start_hook_stays() {
        let t = t("start");
        create_dir_all(t.project.join(".claude")).unwrap();
        let start = format!("s='{}/start'; f=\"$s/0123456789abcdef01234567.md\"; [ -f \"$f\" ] && /bin/cat -- \"$f\" 2>/dev/null; exit 0", t.data.display());
        let ours = format!("{{ \"matcher\": \"startup|clear|compact\", \"hooks\": [ {{ \"type\": \"command\", \"command\": {}, \"timeout\": 5 }} ] }}", serde_json::to_string(&start).unwrap());
        let theirs = r#"{ "matcher": "startup", "hooks": [ { "type": "command", "command": "cat notes.md" } ] }"#;
        fwrite(t.project.join(".claude/settings.local.json"), format!("{{\n  \"hooks\": {{\n    \"SessionStart\": [ {theirs}, {ours} ]\n  }}\n}}\n")).unwrap();
        index_with(&t, &[], &[]);
        assert_eq!(remove(&t.project, &t.data), vec![".claude/settings.local.json"]);
        let after = fs::read_to_string(t.project.join(".claude/settings.local.json")).unwrap();
        assert!(!after.contains("/start'") && after.contains("cat notes.md"), "{after}");
        // Another data folder's start hook stays.
        fwrite(t.project.join(".claude/settings.local.json"), r#"{ "hooks": { "SessionStart": [ { "hooks": [ { "type": "command", "command": "s='/tmp/elsewhere/start'; exit 0" } ] } ] } }"#).unwrap();
        assert!(remove(&t.project, &t.data).is_empty());
    }
    #[test]
    fn another_data_folders_touch_hook_and_the_persons_own_touch_stay() {
        let t = t("others");
        create_dir_all(t.project.join(".codex")).unwrap();
        let other = r#"{ "hooks": [ { "type": "command", "command": "/usr/bin/touch -- '/tmp/elsewhere/done/x'" } ] }"#;
        fwrite(t.project.join(".codex/hooks.json"), format!("{{ \"hooks\": {{ \"Stop\": [ {other} ] }} }}")).unwrap();
        index_with(&t, &["codex"], &[]);
        assert!(remove(&t.project, &t.data).is_empty());
        assert!(fs::read_to_string(t.project.join(".codex/hooks.json")).unwrap().contains("/tmp/elsewhere"));
    }
    #[test]
    fn a_file_that_is_not_plain_json_is_left_exactly_as_it_was() {
        let t = t("bad");
        create_dir_all(t.project.join(".claude")).unwrap();
        let text = format!("// my notes\n{{ \"hooks\": {{ \"Stop\": [ {} ] }} }}", ours_entry(&t.data));
        fwrite(t.project.join(".claude/settings.local.json"), &text).unwrap();
        assert!(remove(&t.project, &t.data).is_empty());
        assert_eq!(fs::read_to_string(t.project.join(".claude/settings.local.json")).unwrap(), text);
    }
    #[test]
    fn a_link_is_never_followed() {
        let t = t("link");
        create_dir_all(t.project.join(".claude")).unwrap();
        let outside = t.root.join("outside.json");
        let text = format!("{{ \"hooks\": {{ \"Stop\": [ {} ] }} }}", ours_entry(&t.data));
        fwrite(&outside, &text).unwrap();
        std::os::unix::fs::symlink(&outside, t.project.join(".claude/settings.local.json")).unwrap();
        assert!(remove(&t.project, &t.data).is_empty());
        assert_eq!(fs::read_to_string(&outside).unwrap(), text);
    }
    #[test]
    fn a_file_and_folder_squibby_made_go_once_empty_and_a_file_the_person_had_stays() {
        let t = t("made");
        create_dir_all(t.project.join(".claude")).unwrap(); create_dir_all(t.project.join(".codex")).unwrap();
        let only = format!("{{\n  \"hooks\": {{\n    \"Stop\": [ {} ]\n  }}\n}}\n", ours_entry(&t.data));
        fwrite(t.project.join(".codex/hooks.json"), &only).unwrap();
        fwrite(t.project.join(".claude/settings.local.json"), &only).unwrap();
        index_with(&t, &["codex"], &["codex"]);
        let mut said = remove(&t.project, &t.data); said.sort();
        assert_eq!(said, vec![".claude/settings.local.json", ".codex/hooks.json"]);
        assert!(!t.project.join(".codex").exists(), "the file and folder Squibby made are gone");
        assert_eq!(fs::read_to_string(t.project.join(".claude/settings.local.json")).unwrap(), "{}\n", "the person's own file stays, without the entry");
    }
    #[test]
    fn the_index_names_the_projects_with_hooks() {
        let t = t("index");
        index_with(&t, &[], &[]);
        assert_eq!(projects_with_hooks(&t.data), vec![t.project.clone()]);
        fwrite(t.data.join(INDEX), "{ not json").unwrap();
        assert!(projects_with_hooks(&t.data).is_empty());
    }
    #[test]
    fn the_reader_keeps_order_and_refuses_anything_that_is_not_one_json_value() {
        let v = parse(r#"{"b":1,"a":[true,null,"x\"y"],"c":{}}"#).unwrap();
        assert_eq!(write(&v), "{\n  \"b\": 1,\n  \"a\": [\n    true,\n    null,\n    \"x\\\"y\"\n  ],\n  \"c\": {}\n}");
        for bad in ["", "{", "{} {}", "{\"a\":}", "{a:1}", "[1,]", "{\"a\":nope}"] { assert!(parse(bad).is_none(), "{bad}"); }
    }
    #[test]
    fn a_project_leaving_for_the_trash_loses_its_hooks_first() {
        let main = include_str!("main.rs");
        let f = &main[main.find("fn leave_to_trash(").unwrap()..]; let f = &f[..f.find("\n}\n").unwrap()];
        assert!(f.find("donehooks::remove(").unwrap() < f.find("move_to_trash(p)").unwrap(), "{f}");
        for caller in ["fn trash_made(", "fn remove_practice(", "fn trash_practice_copies(", "fn restart_practice("] {
            let Some(at) = main.find(caller) else { continue };
            let body = &main[at..]; let body = &body[..body.find("\n}\n").unwrap()];
            assert!(!body.contains(", move_to_trash)"), "{caller} moves a project away through leave_to_trash");
        }
    }
    #[test]
    fn this_file_never_runs_git_and_the_runners_rule_is_the_same() {
        let src = include_str!("donehooks.rs");
        let code = &src[..src.find("#[cfg(test)]").unwrap()];
        assert!(!code.contains("Command::new"), "nothing is run");
        let ts = include_str!("../../../runner/src/donesignal.ts");
        assert!(ts.contains("h.command.startsWith(\"/usr/bin/touch -- \")") && ts.contains("`${dir}/`"), "the runner finds its entries the same way");
        assert!(ts.contains("claude: \".claude/settings.local.json\", codex: \".codex/hooks.json\"") && ts.contains("DONE_INDEX = \"done-signals.json\""));
        // M77: the same three events and the same guard folder opening on both sides.
        assert!(ts.contains("done: \"Stop\", guard: \"PreToolUse\", waiting: \"Notification\"") && ts.contains("GUARD_DIR = \"guard\"") && ts.contains("h.command.startsWith(`d=${shQuote(guardDir)};`)"), "the runner finds its guard entries the same way");
        // M78: the start hook under SessionStart, found by its start folder opening on both sides.
        assert!(ts.contains("start: \"SessionStart\"") && ts.contains("START_DIR = \"start\"") && ts.contains("h.command.startsWith(`s=${shQuote(startDir)};`)"), "the runner finds its start entries the same way");
    }
}
