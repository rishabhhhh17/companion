//! M82: Connect your AI tools, and hand Squibby the job.
//!
//! Part 1, finding the AI tools on this Mac (`find`). Read only, and only when the Your AI tools screen opens (main.rs
//! `ai_tools_find`, never in the background). From the one list (`protocol/aitools.json`, which the pages read too) it asks
//! three things and nothing more: is an app with this bundle id installed (NSWorkspace, the same check as `editor_installed`),
//! is there a program file with this name in one of the folders (its metadata only: a file with an execute bit), and does
//! the project have this folder. It never runs a program and never reads any file's contents (pinned by a test below).
//! The folders are the app's own PATH and the usual ones in the list. The person's login shell PATH is not asked for: that
//! would mean running their shell. [verify] that the usual folders cover the tools as people install them.
//!
//! Part 2, Put it in (`put_in_step`): where the prompt goes when the person presses Put it in <tool>. The paste itself is
//! Type by voice's (dictate::insert_at_cursor: the clipboard saved and put back, never Return). Here only the decision, so
//! every rule is tested without a screen.
use std::path::{Path, PathBuf};
use std::sync::OnceLock;

pub const LIST_TEXT: &str = include_str!("../../../protocol/aitools.json");

#[derive(serde::Deserialize, Debug)]
pub struct Tool { pub id: String, pub apps: Vec<String>, pub programs: Vec<String>, pub folders: Vec<String> }

#[derive(serde::Deserialize, Debug)]
#[serde(rename_all = "camelCase")]
pub struct List { pub tools: Vec<Tool>, pub bin_folders: Vec<String> }

pub fn list() -> &'static List {
    static L: OnceLock<List> = OnceLock::new();
    L.get_or_init(|| serde_json::from_str(LIST_TEXT).expect("protocol/aitools.json is part of the build"))
}

/// The tool with this id, from the one list.
pub fn tool(id: &str) -> Option<&'static Tool> { list().tools.iter().find(|t| t.id == id) }

/// What was found: the bundle ids installed, the program names found, and the project's tool folders. Only names from the
/// list ever appear here.
#[derive(serde::Serialize, Debug, Default, PartialEq)]
pub struct Found { pub apps: Vec<String>, pub programs: Vec<String>, pub folders: Vec<String> }

/// The folders programs are looked for in: each absolute folder of `path_env`, then the list's own, with ~ as `home`. Each
/// once, in that order.
pub fn bin_dirs(path_env: &str, home: &Path, extra: &[String]) -> Vec<PathBuf> {
    let mut out: Vec<PathBuf> = vec![];
    let from_list = extra.iter().filter_map(|d| {
        if let Some(rest) = d.strip_prefix("~/") { if home.as_os_str().is_empty() { None } else { Some(home.join(rest)) } } else { Some(PathBuf::from(d)) }
    });
    for d in path_env.split(':').filter(|s| !s.is_empty()).map(PathBuf::from).chain(from_list) {
        if d.is_absolute() && !out.contains(&d) { out.push(d); }
    }
    out
}

/// Is there a program file with this name in this folder: a file (a link is followed) with an execute bit. Only its
/// metadata is asked for. A name with a slash or a dot at the start is never looked for.
pub fn is_program(dir: &Path, name: &str) -> bool {
    use std::os::unix::fs::PermissionsExt;
    if name.is_empty() || name.contains('/') || name.starts_with('.') { return false; }
    std::fs::metadata(dir.join(name)).is_ok_and(|m| m.is_file() && m.permissions().mode() & 0o111 != 0)
}

/// Does the project have this folder of a tool's own (a plain folder name from the list).
pub fn has_folder(project: &Path, name: &str) -> bool {
    if name.is_empty() || name.contains('/') || name == "." || name == ".." { return false; }
    std::fs::metadata(project.join(name)).is_ok_and(|m| m.is_dir())
}

/// Everything found for the list. `installed` answers whether an app with a bundle id is installed (NSWorkspace on the Mac).
/// `project` is the project open now, or none.
pub fn find(l: &List, path_env: &str, home: &Path, project: Option<&Path>, installed: impl Fn(&str) -> bool) -> Found {
    let dirs = bin_dirs(path_env, home, &l.bin_folders);
    let mut f = Found::default();
    for t in &l.tools {
        for a in &t.apps { if !f.apps.contains(a) && installed(a) { f.apps.push(a.clone()); } }
        for p in &t.programs { if !f.programs.contains(p) && dirs.iter().any(|d| is_program(d, p)) { f.programs.push(p.clone()); } }
        if let Some(pr) = project { for d in &t.folders { if !f.folders.contains(d) && has_folder(pr, d) { f.folders.push(d.clone()); } } }
    }
    f
}

// ---------- Part 2: Put it in ----------

/// What Put it in does, decided from what is known at each step. Each answer but Paste copies the prompt instead, and the
/// page says why in plain words (app/src/strings.ts S.m82.put).
#[derive(Debug, PartialEq, Eq, Clone, Copy)]
pub enum Step { NotOpen, NotFront, NoBox, Refused, Paste }
impl Step {
    /// The stage the page is told.
    pub fn stage(self) -> &'static str {
        match self { Step::NotOpen => "notOpen", Step::NotFront => "notFront", Step::NoBox => "noBox", Step::Refused => "refused", Step::Paste => "typed" }
    }
}
/// `running`: the tool's app is open. `in_front`: it came to the front. `place`: where its chat box is (pastehere.rs): only
/// a box the app itself labels as its chat box is typed into; a guess is never typed into (Show me where to paste rings it
/// instead). `focused_ok`: the box that has the keyboard after it was focused may be typed into (never a password box).
pub fn put_in_step(running: bool, in_front: bool, place: &crate::pastehere::Where, focused_ok: bool) -> Step {
    if !running { return Step::NotOpen; }
    if !in_front { return Step::NotFront; }
    if !matches!(place, crate::pastehere::Where::Confirmed(_)) { return Step::NoBox; }
    if !focused_ok { return Step::Refused; }
    Step::Paste
}
/// Every stage Put it in may answer with, the ones above and: needsPermission (Accessibility is not allowed yet; macOS's
/// own prompt was shown), stopped (Stop everything was pressed; nothing pasted), hidden (Squibby is hidden, so its light
/// could not be seen; nothing read) and copied (the box moved before the paste, dictate.rs). The page knows each one.
#[allow(dead_code)] // the tests and the page (app/src/handoff.ts PUT_STAGES) check every one is known
pub const STAGES: &[&str] = &["notOpen", "notFront", "noBox", "refused", "typed", "needsPermission", "stopped", "hidden", "copied"];

#[cfg(test)]
mod tests {
    use super::*;
    use crate::coords::R;
    use crate::pastehere::Where;

    fn tmp(name: &str) -> PathBuf {
        let d = std::env::temp_dir().join(format!("m82-{name}-{}-{}", std::process::id(), std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).unwrap().as_nanos()));
        std::fs::create_dir_all(&d).unwrap();
        d
    }
    fn exe(dir: &Path, name: &str, mode: u32) {
        use std::os::unix::fs::PermissionsExt;
        let p = dir.join(name);
        std::fs::write(&p, b"#!/bin/sh\nexit 0\n").unwrap();
        std::fs::set_permissions(&p, std::fs::Permissions::from_mode(mode)).unwrap();
    }

    #[test]
    fn the_list_is_the_done_signals_tools_each_once() {
        let ids: Vec<&str> = list().tools.iter().map(|t| t.id.as_str()).collect();
        assert_eq!(ids, ["claude", "codex", "cursor", "copilot", "antigravity", "gemini", "windsurf"]);
        // The plan's programs and the known app ids (pastehere.rs) are on it.
        for p in ["claude", "codex", "gemini", "agy", "devin"] { assert!(list().tools.iter().any(|t| t.programs.iter().any(|x| x == p)), "{p}"); }
        assert!(tool("cursor").unwrap().apps.contains(&"com.todesktop.230313mzl4w4u92".to_string()));
        assert!(tool("copilot").unwrap().apps.contains(&"com.microsoft.VSCode".to_string()));
        assert!(tool("windsurf").unwrap().apps.contains(&"com.exafunction.windsurf".to_string()));
        for b in ["~/.local/bin", "/opt/homebrew/bin", "/usr/local/bin", "~/.npm-global/bin"] { assert!(list().bin_folders.iter().any(|x| x == b), "{b}"); }
    }

    #[test]
    fn bin_folders_are_the_path_then_the_list_each_once_and_only_absolute() {
        let home = Path::new("/Users/sam");
        let d = bin_dirs("/usr/bin:relative/bin::/usr/local/bin", home, &["~/.local/bin".into(), "/usr/local/bin".into()]);
        assert_eq!(d, [PathBuf::from("/usr/bin"), PathBuf::from("/usr/local/bin"), PathBuf::from("/Users/sam/.local/bin")]);
        assert_eq!(bin_dirs("", Path::new(""), &["~/.local/bin".into()]), Vec::<PathBuf>::new(), "no home, no ~ folder");
    }

    #[test]
    fn a_program_is_a_file_with_an_execute_bit_and_a_folder_is_a_folder() {
        let bin = tmp("bin");
        exe(&bin, "claude", 0o755);
        exe(&bin, "codex", 0o644);   // not runnable
        std::fs::create_dir_all(bin.join("gemini")).unwrap();   // a folder is not a program
        assert!(is_program(&bin, "claude"));
        assert!(!is_program(&bin, "codex"));
        assert!(!is_program(&bin, "gemini"));
        assert!(!is_program(&bin, "agy"));
        assert!(!is_program(&bin, "../bin/claude") && !is_program(&bin, ".hidden") && !is_program(&bin, ""));
        // A link to a program counts (Homebrew and npm put links in their bin folders).
        std::os::unix::fs::symlink(bin.join("claude"), bin.join("devin")).unwrap();
        assert!(is_program(&bin, "devin"));
        let proj = tmp("proj");
        std::fs::create_dir_all(proj.join(".cursor")).unwrap();
        std::fs::write(proj.join(".codex"), b"not a folder").unwrap();
        assert!(has_folder(&proj, ".cursor") && !has_folder(&proj, ".codex") && !has_folder(&proj, ".claude"));
        assert!(!has_folder(&proj, "..") && !has_folder(&proj, "a/b"));
        let _ = std::fs::remove_dir_all(&bin); let _ = std::fs::remove_dir_all(&proj);
    }

    #[test]
    fn find_reports_only_what_is_there_each_once() {
        let bin = tmp("find-bin");
        exe(&bin, "claude", 0o755); exe(&bin, "gemini", 0o700);
        let proj = tmp("find-proj");
        std::fs::create_dir_all(proj.join(".codex")).unwrap();
        std::fs::create_dir_all(proj.join(".devin")).unwrap();
        let path = format!("{}:{}", bin.display(), bin.display());
        let f = find(list(), &path, Path::new("/nowhere"), Some(&proj), |b| b == "com.microsoft.VSCode" || b == "com.example.other");
        assert_eq!(f, Found { apps: vec!["com.microsoft.VSCode".into()], programs: vec!["claude".into(), "gemini".into()], folders: vec![".codex".into(), ".devin".into()] });
        // No project: no folders are looked at.
        assert!(find(list(), &path, Path::new("/nowhere"), None, |_| false).folders.is_empty());
        let _ = std::fs::remove_dir_all(&bin); let _ = std::fs::remove_dir_all(&proj);
    }

    #[test]
    fn finding_never_runs_a_program_and_never_reads_a_file() {
        let src = include_str!("aitools.rs");
        let body = &src[..src.find("// ---------- Part 2").unwrap()];
        for never in ["Command::new", "read_to_string", "File::open", "fs::read(", "read_dir", "process::", "spawn("] {
            assert!(!body.contains(never), "finding the tools never uses {never}");
        }
        // The shell's command runs it only when the screen asks, only from Home, and logs counts, never names or paths.
        let main = crate::main_src();
        let cmd = &main[main.find("fn ai_tools_find(").unwrap()..];
        let cmd = &cmd[..cmd.find("\n}\n").unwrap()];
        assert!(cmd.contains("settings::only_card(window.label())?"), "{cmd}");
        assert!(cmd.contains("aitools::find(aitools::list()") && cmd.contains("editor_installed"), "{cmd}");
        assert!(!cmd.contains("Command::new"));
        // Nothing calls it on a timer or at launch: only the command itself names it.
        assert_eq!(main.matches("aitools::find(").count(), 1);
    }

    #[test]
    fn put_in_types_only_into_a_confirmed_chat_box_in_the_tool_in_front() {
        let r = R { x: 10.0, y: 10.0, w: 300.0, h: 40.0 };
        assert_eq!(put_in_step(false, false, &Where::Confirmed(r), true), Step::NotOpen);
        assert_eq!(put_in_step(true, false, &Where::Confirmed(r), true), Step::NotFront);
        assert_eq!(put_in_step(true, true, &Where::Guess(r), true), Step::NoBox, "a guess is never typed into");
        assert_eq!(put_in_step(true, true, &Where::Words, true), Step::NoBox);
        assert_eq!(put_in_step(true, true, &Where::Confirmed(r), false), Step::Refused);
        assert_eq!(put_in_step(true, true, &Where::Confirmed(r), true), Step::Paste);
        for s in [Step::NotOpen, Step::NotFront, Step::NoBox, Step::Refused, Step::Paste] { assert!(STAGES.contains(&s.stage())); }
    }

    #[test]
    fn put_in_never_presses_return_pastes_through_type_by_voice_and_checks_stop_and_the_light_first() {
        let main = crate::main_src();
        let start = main.find("fn handoff_put_in_now(").expect("the put in body");
        let body = &main[start..];
        let body = &body[..body.find("\n}\n").unwrap()];
        for never in ["Return", "KEY_RETURN", "post_key", "press_paste", "press_menu", "value_of", "read_ladder", "select_all"] {
            assert!(!body.contains(never), "Put it in never uses {never}: {body}");
        }
        // The one paste path, Type by voice's, with Stop asked right before it.
        assert!(body.contains("dictate::insert_at_cursor(&target, &text, stopped)"), "{body}");
        assert!(body.contains("dictate::target_verdict("), "a password box is refused");
        // The light comes on before anything is read or brought forward; Accessibility is asked the first time.
        let light = body.find("say_showme(&app, \"looking\"").expect("the light");
        for after in [concat!("ax::trusted", "(true)"), "ax::ensure_front(", "ax::text_boxes(", "dictate::insert_at_cursor("] {
            assert!(light < body.find(after).unwrap_or_else(|| panic!("{after}")), "the light before {after}");
        }
        assert!(body.contains("ax::let_apps_sleep()"), "what was woken to read is put back to sleep");
        // Stop everything ends it: its count is taken first and asked before bringing the tool forward.
        assert!(body.find("VOICE_STOPS.load").unwrap() < body.find("ax::ensure_front(").unwrap());
        // Only from Home, and the text is never logged.
        let cmd = &main[main.find("async fn handoff_put_in(").unwrap()..];
        let cmd = &cmd[..cmd.find("\n}\n").unwrap()];
        assert!(cmd.contains("settings::only_card(window.label())?"), "{cmd}");
        assert!(!body.contains("\"text\":"), "the prompt is never logged");
    }
}
