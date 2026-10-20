//! Groups of tools (F20, M12): which tool belongs to which group, and what a group that is switched off stops.
//!
//! `protocol/groups.json` is the one catalog (read here with include_str!, by the pages in `app/src/groups.ts` and by the
//! engine in `runner/src/groups.ts`). A tool is one thing a person can do; a group is a set of related tools with one
//! switch in the settings registry (`flow.on`, `guide.on`, `voice.on`, `files.on`). Every hotkey, every shell command and
//! every command the engine takes is in exactly one tool, so there is no way to add a way in that skips its group; the
//! tests below read main.rs, keymap.rs and protocol/index.ts and fail on one that is missing or listed twice.
//!
//! This module is plain code with no window and no settings file: main.rs says which switches are off, and these
//! functions answer. What a group that is off does (F20 item 2):
//!  - its hotkeys are let go through the key map (`keymap::start_held`, main.rs `groups_applied`), the person's choice of
//!    keys stays saved, and other apps may use them meanwhile;
//!  - a shell command of one of its tools answers with one plain line (`refuse_command`) and does nothing; so does a
//!    command a page sends to the engine (`refuse_runner`), and the engine refuses again itself (runner/src/groups.ts);
//!  - what only ends or takes back something (`stays`: Undo, stopping, dismissing, a lesson's Stop) still works;
//!  - the core (Stop everything, the ask box, the key, settings, memory, Ship, Research) has no switch and is never refused.
use serde_json::Value;
use std::collections::HashMap;
use std::sync::OnceLock;

pub const CATALOG_TEXT: &str = include_str!("../../../protocol/groups.json");

#[derive(Clone, Debug, PartialEq)]
pub struct Group { pub id: String, pub switch: Option<String> }
#[derive(Clone, Debug, PartialEq)]
pub struct Tool {
    pub id: String, pub group: String, pub hotkeys: Vec<String>, pub tried: Option<String>, pub commands: Vec<String>,
    pub runner: Vec<String>, pub agent_modes: Vec<String>, pub stays: Vec<String>,
}
#[derive(Debug)]
pub struct Catalog {
    pub off_line: String, pub groups: Vec<Group>, pub tools: Vec<Tool>,
    by_command: HashMap<String, usize>, by_hotkey: HashMap<String, usize>, by_runner: HashMap<String, usize>, by_mode: HashMap<String, usize>,
}

fn strs(v: Option<&Value>) -> Vec<String> { v.and_then(Value::as_array).map(|a| a.iter().filter_map(|x| x.as_str().map(str::to_string)).collect()).unwrap_or_default() }

pub fn parse(text: &str) -> Result<Catalog, String> {
    let v: Value = serde_json::from_str(text).map_err(|e| format!("the catalog is not JSON: {e}"))?;
    let groups: Vec<Group> = v.get("groups").and_then(Value::as_array).ok_or("no groups")?.iter()
        .map(|g| Group { id: g["id"].as_str().unwrap_or("").to_string(), switch: g.get("switch").and_then(Value::as_str).map(str::to_string) }).collect();
    let tools: Vec<Tool> = v.get("tools").and_then(Value::as_array).ok_or("no tools")?.iter().map(|t| Tool {
        id: t["id"].as_str().unwrap_or("").to_string(), group: t["group"].as_str().unwrap_or("").to_string(), hotkeys: strs(t.get("hotkeys")),
        tried: t.get("tried").and_then(Value::as_str).map(str::to_string), commands: strs(t.get("commands")), runner: strs(t.get("runner")),
        agent_modes: strs(t.get("agentModes")), stays: strs(t.get("stays")),
    }).collect();
    let (mut by_command, mut by_hotkey, mut by_runner, mut by_mode) = (HashMap::new(), HashMap::new(), HashMap::new(), HashMap::new());
    for (i, t) in tools.iter().enumerate() {
        for c in &t.commands { by_command.insert(c.clone(), i); }
        for h in &t.hotkeys { by_hotkey.insert(h.clone(), i); }
        for r in &t.runner { by_runner.insert(r.clone(), i); }
        for m in &t.agent_modes { by_mode.insert(m.clone(), i); }
    }
    Ok(Catalog { off_line: v["offLine"].as_str().unwrap_or("").to_string(), groups, tools, by_command, by_hotkey, by_runner, by_mode })
}

/// The catalog that ships with this version. A broken one is a build mistake the tests catch, so it is read once.
pub fn catalog() -> &'static Catalog {
    static C: OnceLock<Catalog> = OnceLock::new();
    C.get_or_init(|| parse(CATALOG_TEXT).expect("protocol/groups.json is part of the build"))
}

impl Catalog {
    pub fn tool(&self, id: &str) -> Option<&Tool> { self.tools.iter().find(|t| t.id == id) }
    /// The switch (a settings key) of the group a tool is in; none for the core.
    pub fn switch_of(&self, t: &Tool) -> Option<&str> { self.groups.iter().find(|g| g.id == t.group).and_then(|g| g.switch.as_deref()) }
    pub fn of_command(&self, name: &str) -> Option<&Tool> { self.by_command.get(name).map(|i| &self.tools[*i]) }
    pub fn of_hotkey(&self, id: &str) -> Option<&Tool> { self.by_hotkey.get(id).map(|i| &self.tools[*i]) }
    /// The tool an engine command belongs to. agent.start belongs to the tool of its mode.
    pub fn of_runner(&self, ty: &str, mode: Option<&str>) -> Option<&Tool> {
        if ty == "agent.start" { return mode.and_then(|m| self.by_mode.get(m)).map(|i| &self.tools[*i]); }
        self.by_runner.get(ty).map(|i| &self.tools[*i])
    }
    /// Every group switch (a settings key).
    pub fn switches(&self) -> Vec<&str> { self.groups.iter().filter_map(|g| g.switch.as_deref()).collect() }
}

/// Is this settings key one of the group switches?
pub fn is_switch(key: &str) -> bool { catalog().switches().contains(&key) }

/// The one plain line a refused command answers with.
pub fn off_line() -> &'static str { catalog().off_line.as_str() }

/// A shell command of a tool whose group is switched off is refused with one plain line. `is_off` says whether a switch
/// (a settings key) is off. Commands that only end or take back something still work, and so do the core's.
pub fn refuse_command(is_off: &dyn Fn(&str) -> bool, name: &str) -> Option<&'static str> {
    let c = catalog();
    let t = c.of_command(name)?;
    let sw = c.switch_of(t)?;
    (is_off(sw) && !t.stays.iter().any(|s| s == name)).then(off_line)
}

/// The same for a command a page sends to the engine (`cmd` has a type, and agent.start a mode).
pub fn refuse_runner(is_off: &dyn Fn(&str) -> bool, cmd: &Value) -> Option<&'static str> {
    let c = catalog();
    let ty = cmd.get("type").and_then(Value::as_str)?;
    let t = c.of_runner(ty, cmd.get("mode").and_then(Value::as_str))?;
    let sw = c.switch_of(t)?;
    (is_off(sw) && !t.stays.iter().any(|s| s == ty)).then(off_line)
}

/// Whether a hotkey's job (a keymap job id) is held back because its tool's group is switched off. The core's keys
/// (the ask box, Stop everything) are never held.
pub fn hotkey_held(is_off: &dyn Fn(&str) -> bool, job: &str) -> bool {
    let c = catalog();
    c.of_hotkey(job).and_then(|t| c.switch_of(t)).is_some_and(is_off)
}

/// A page may say it saw a real use only of a tool it can see being used.
pub fn page_may_mark(tool: &str) -> bool { catalog().tool(tool).is_some_and(|t| t.tried.as_deref() == Some("page")) }

/// The tools tried after a real use of `tool`: the list with it added, or none when nothing changes (a tool that does
/// not exist, one that is not triable, one already listed, or one whose group is switched off: a use that was refused is
/// not a use).
pub fn tried_after(current: &[String], tool: &str, is_off: &dyn Fn(&str) -> bool) -> Option<Vec<String>> {
    let c = catalog();
    let t = c.tool(tool)?;
    t.tried.as_ref()?;
    if c.switch_of(t).is_some_and(is_off) || current.iter().any(|x| x == tool) { return None; }
    let mut next = current.to_vec();
    next.push(tool.to_string());
    Some(next)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::keymap::{self, Action, Chord, Map};
    use serde_json::json;

    const MAIN: &str = include_str!("main.rs");
    const RUNNER: &str = include_str!("runner.rs");
    const PROTOCOL: &str = include_str!("../../../protocol/index.ts");
    const SWITCHED: [(&str, &str); 4] = [("flow", "flow.on"), ("guide", "guide.on"), ("voice", "voice.on"), ("files", "files.on")];

    fn off<'a>(keys: &'a [&'a str]) -> impl Fn(&str) -> bool + 'a { move |k| keys.contains(&k) }
    fn tools_in(g: &str) -> Vec<&'static Tool> { catalog().tools.iter().filter(|t| t.group == g).collect() }
    fn handler_names() -> Vec<String> {
        let at = MAIN.find("generate_handler![").unwrap() + "generate_handler![".len();
        let end = at + MAIN[at..].find("])").unwrap();
        let mut v: Vec<String> = MAIN[at..end].split(',').map(|s| s.trim().to_string()).filter(|s| !s.is_empty()).collect();
        v.sort(); v.dedup(); v
    }
    fn dups(v: &[String]) -> Vec<String> { let mut s = v.to_vec(); s.sort(); s.windows(2).filter(|w| w[0] == w[1]).map(|w| w[0].clone()).collect() }

    #[test]
    fn the_catalog_reads_and_has_four_switched_groups_and_the_core() {
        let c = catalog();
        let ids: Vec<&str> = c.groups.iter().map(|g| g.id.as_str()).collect();
        assert_eq!(ids, ["flow", "guide", "voice", "files", "core"]);
        for (g, sw) in SWITCHED { assert_eq!(c.groups.iter().find(|x| x.id == g).unwrap().switch.as_deref(), Some(sw)); }
        assert_eq!(c.groups.iter().find(|g| g.id == "core").unwrap().switch, None);
        assert!(c.tools.iter().all(|t| c.groups.iter().any(|g| g.id == t.group)), "every tool is in a known group");
        assert!(dups(&c.tools.iter().map(|t| t.id.clone()).collect::<Vec<_>>()).is_empty());
        assert!(off_line().contains("switched off in Settings"));
    }
    #[test]
    fn each_switch_is_a_registry_switch_usual_on_that_the_engine_is_also_given() {
        let r = crate::settings::registry();
        for (_, sw) in SWITCHED {
            let d = r.get(sw).unwrap_or_else(|| panic!("{sw} is in the registry"));
            assert_eq!(d.default, json!(true));
            assert!(d.applies_to("shell") && d.applies_to("runner") && d.applies_to("pages"), "{sw}");
            assert!(crate::settings::needs_apply(d), "{sw}: the engine is given it");
            assert!(is_switch(sw));
        }
        assert!(!is_switch("drop.on") && !is_switch("groups.tried"));
        for t in &catalog().tools { if t.tried.is_some() { assert!(r.get("groups.tried").unwrap().allowed_items.as_ref().unwrap().contains(&t.id), "{}", t.id); } }
    }
    #[test]
    fn every_hotkey_is_in_exactly_one_tool_and_the_stop_key_and_the_ask_box_are_in_the_core() {
        let c = catalog();
        let listed: Vec<String> = c.tools.iter().flat_map(|t| t.hotkeys.clone()).collect();
        assert!(dups(&listed).is_empty(), "a hotkey is in two tools");
        let mut ids: Vec<String> = keymap::ACTIONS.iter().map(|a| a.id().to_string()).collect();
        let mut got = listed.clone(); ids.sort(); got.sort();
        assert_eq!(got, ids, "every key map job is in a tool, and none is invented");
        assert_eq!(c.of_hotkey("stop").unwrap().group, "core");
        assert_eq!(c.of_hotkey("card").unwrap().group, "core");
        for (job, g) in [("problem", "flow"), ("showme", "guide"), ("read", "voice"), ("accept", "voice"), ("explain", "voice"), ("talk", "voice")] { assert_eq!(c.of_hotkey(job).unwrap().group, g, "{job}"); }
    }
    #[test]
    fn every_shell_command_is_in_exactly_one_tool_and_none_is_listed_that_does_not_exist() {
        let listed: Vec<String> = catalog().tools.iter().flat_map(|t| t.commands.clone()).collect();
        assert!(dups(&listed).is_empty(), "a command is in two tools");
        let mut got = listed; got.sort();
        assert_eq!(got, handler_names());
        assert!(got.len() > 70);
    }
    #[test]
    fn every_command_the_engine_takes_and_every_agent_mode_is_in_exactly_one_tool() {
        let at = PROTOCOL.find("const COMMANDS").unwrap();
        let block = &PROTOCOL[at..at + PROTOCOL[at..].find("\n};").unwrap()];
        let mut types: Vec<String> = block.lines().filter_map(|l| { let l = l.strip_prefix("  \"")?; Some(l[..l.find('"')?].to_string()) }).collect();
        types.sort();
        assert!(types.len() > 55);
        let mut listed: Vec<String> = catalog().tools.iter().flat_map(|t| t.runner.clone()).collect();
        assert!(dups(&listed).is_empty());
        listed.push("agent.start".into()); listed.sort();
        assert_eq!(listed, types);
        let modes_line = block.lines().find(|l| l.contains("\"agent.start\"")).unwrap();
        let mut modes: Vec<String> = modes_line[modes_line.find("oneOf(\"mode\"").unwrap()..].split(']').next().unwrap().split('"').skip(3).step_by(2).map(str::to_string).collect();
        modes.sort();
        let mut covered: Vec<String> = catalog().tools.iter().flat_map(|t| t.agent_modes.clone()).collect();
        assert!(dups(&covered).is_empty());
        covered.sort();
        assert_eq!(covered, modes);
        assert_eq!(modes, ["drive", "rescue", "research", "ship"]);
    }
    #[test]
    fn what_a_page_may_send_is_all_known_and_what_stays_on_names_its_own_commands() {
        let at = RUNNER.find("const ALLOWED").unwrap();
        let list = &RUNNER[at..at + RUNNER[at..].find("];").unwrap()];
        let known: Vec<&String> = catalog().tools.iter().flat_map(|t| t.runner.iter()).collect();
        for w in list.split('"').skip(1).step_by(2).filter(|w| w.contains('.')) {
            assert!(w == "agent.start" || known.iter().any(|k| *k == w), "{w} is allowed from a page but is in no tool");
        }
        for t in &catalog().tools { for s in &t.stays { assert!(t.commands.contains(s) || t.runner.contains(s), "{}: {s}", t.id); } }
    }

    // ---- a group switched off, one test per group ----

    fn refused_with_group_off(g: &str, sw: &str) {
        let keys = [sw];
        let is_off = off(&keys);
        let nothing = off(&[]);
        for t in catalog().tools.iter() {
            let mine = t.group == g;
            for c in &t.commands {
                let stays = t.stays.contains(c);
                let got = refuse_command(&is_off, c);
                if mine && !stays { assert_eq!(got, Some(off_line()), "{g} off: {c} answers with the one line"); }
                else { assert_eq!(got, None, "{g} off: {c} still works"); }
                assert_eq!(refuse_command(&nothing, c), None, "{c} works with everything on");
            }
            for r in &t.runner {
                let stays = t.stays.contains(r);
                let got = refuse_runner(&is_off, &json!({ "v": 1, "id": "x", "type": r }));
                if mine && !stays { assert_eq!(got, Some(off_line()), "{g} off: {r} is refused"); } else { assert_eq!(got, None, "{g} off: {r} still goes"); }
            }
            for m in &t.agent_modes {
                let got = refuse_runner(&is_off, &json!({ "type": "agent.start", "mode": m }));
                assert_eq!(got.is_some(), mine, "{g} off: agent.start in {m} mode");
            }
        }
    }
    fn keys_let_go_with_group_off(g: &str, sw: &str) {
        // The key map: the jobs of the group are started, found free, and let go again; every other job stays registered.
        let keys = [sw];
        let is_off = off(&keys);
        let mut held = [false; keymap::N];
        for a in keymap::ACTIONS { held[a.index()] = hotkey_held(&is_off, a.id()); }
        let expected: Vec<&str> = tools_in(g).iter().flat_map(|t| t.hotkeys.iter().map(String::as_str)).collect();
        for a in keymap::ACTIONS { assert_eq!(held[a.index()], expected.contains(&a.id()), "{g} off: {}", a.id()); }
        assert!(!held[Action::Stop.index()] && !held[Action::Card.index()], "Stop everything and the ask box are never held");
        let registered = std::cell::RefCell::new(std::collections::HashSet::<Chord>::new());
        let started = keymap::start_held(&Map::DEFAULT, &held, |_, c| registered.borrow_mut().insert(c), |c| { registered.borrow_mut().remove(&c); });
        for a in keymap::ACTIONS {
            let c = keymap::default(a);
            let live = registered.borrow().contains(&c);
            // use a suggestion is registered only while a result shows, so it is never live at start.
            let should = !held[a.index()] && !a.armed_only();
            assert_eq!(live, should, "{g} off: {} keys registered = {should}", a.id());
            assert_eq!(started[a.index()].using(), Some(c), "{g} off: the choice of keys stays: {}", a.id());
        }
    }
    #[test] fn flow_off_refuses_its_commands_and_keys_and_only_those() { refused_with_group_off("flow", "flow.on"); keys_let_go_with_group_off("flow", "flow.on"); }
    #[test] fn guide_off_refuses_its_commands_and_keys_and_only_those() { refused_with_group_off("guide", "guide.on"); keys_let_go_with_group_off("guide", "guide.on"); }
    #[test] fn voice_off_refuses_its_commands_and_keys_and_only_those() { refused_with_group_off("voice", "voice.on"); keys_let_go_with_group_off("voice", "voice.on"); }
    #[test] fn files_off_refuses_its_commands_and_only_those() { refused_with_group_off("files", "files.on"); keys_let_go_with_group_off("files", "files.on"); }

    #[test]
    fn with_every_group_off_stop_everything_the_ask_box_settings_and_the_rest_of_the_core_still_work() {
        let all = ["flow.on", "guide.on", "voice.on", "files.on"];
        let is_off = off(&all);
        for t in tools_in("core") {
            for c in &t.commands { assert_eq!(refuse_command(&is_off, c), None, "{c}"); }
            for r in &t.runner { assert_eq!(refuse_runner(&is_off, &json!({ "type": r })), None, "{r}"); }
            for m in &t.agent_modes { assert_eq!(refuse_runner(&is_off, &json!({ "type": "agent.start", "mode": m })), None, "{m}"); }
            for h in &t.hotkeys { assert!(!hotkey_held(&is_off, h), "{h}"); }
        }
        for c in ["showme_clear", "showme_hide", "speak_stop", "settings_get", "settings_set", "delete_everything", "save_api_key", "send_command", "toggle_card", "tried_mark"] { assert_eq!(refuse_command(&is_off, c), None, "{c}"); }
        for r in ["agent.interruptAll", "agent.interrupt", "approval.resolve", "settings.apply", "runner.ping", "research.ask", "ship.live", "memory.erase"] { assert_eq!(refuse_runner(&is_off, &json!({ "type": r })), None, "{r}"); }
        assert!(tools_in("core").iter().all(|t| t.tried.is_none()));
    }
    #[test]
    fn what_only_takes_back_stays_available_so_nothing_is_lost_by_switching_a_group_off() {
        let is_off = off(&["flow.on", "guide.on", "voice.on", "files.on"]);
        for r in ["checkpoint.restore", "bisect.undo", "walk.stop"] { assert_eq!(refuse_runner(&is_off, &json!({ "type": r })), None, "{r}"); }
        for c in ["remove_practice", "remove_all_practices", "ph_dismiss", "ph_disarm", "ph_restore", "eh_dismiss", "drop_stop", "drop_close", "drop_reveal"] { assert_eq!(refuse_command(&is_off, c), None, "{c}"); }
        for c in ["ph_accept", "ph_ready", "drop_pick", "drop_now", "showme_start", "speak", "voice_download", "point_problem", "create_practice"] { assert_eq!(refuse_command(&is_off, c), Some(off_line()), "{c}"); }
    }
    #[test]
    fn an_unknown_command_or_a_command_with_no_type_is_not_this_modules_to_refuse() {
        let is_off = off(&["flow.on", "guide.on", "voice.on", "files.on"]);
        assert_eq!(refuse_command(&is_off, "plugin:window|close"), None);
        assert_eq!(refuse_runner(&is_off, &json!({})), None);
        assert_eq!(refuse_runner(&is_off, &json!({ "type": 7 })), None);
        assert_eq!(refuse_runner(&is_off, &json!({ "type": "agent.start" })), None);
        assert_eq!(refuse_runner(&is_off, &json!({ "type": "agent.start", "mode": "elsewhere" })), None);
    }
    #[test]
    fn agent_start_follows_its_mode_so_research_and_ship_stay_while_a_task_and_rescue_stop_with_flow() {
        let is_off = off(&["flow.on"]);
        assert_eq!(refuse_runner(&is_off, &json!({ "type": "agent.start", "mode": "drive" })), Some(off_line()));
        assert_eq!(refuse_runner(&is_off, &json!({ "type": "agent.start", "mode": "rescue" })), Some(off_line()));
        assert_eq!(refuse_runner(&is_off, &json!({ "type": "agent.start", "mode": "research" })), None);
        assert_eq!(refuse_runner(&is_off, &json!({ "type": "agent.start", "mode": "ship" })), None);
    }

    // ---- main.rs really uses these rules (the repo's way of checking wiring: read the source) ----

    fn body<'a>(src: &'a str, from: &str) -> &'a str { let a = src.find(from).unwrap_or_else(|| panic!("{from}")); &src[a..a + src[a..].find("\n}\n").unwrap()] }
    #[test]
    fn main_asks_the_catalog_before_every_command_a_page_sends_and_before_the_engine_is_asked() {
        assert!(MAIN.contains("if let Some(line) = group_refusal(invoke.message.command()) { invoke.resolver.reject(line); return true; }"));
        assert!(body(MAIN, "fn group_refusal(").contains("groups::refuse_command(&group_off, command)"));
        assert!(body(MAIN, "fn send_command(").contains("groups::refuse_runner(&group_off, &cmd)"));
        let send = body(MAIN, "fn send_command(");
        assert!(send.find("refuse_runner").unwrap() < send.find(".send(&cmd)").unwrap(), "the refusal comes before the engine is asked");
    }
    #[test]
    fn main_lets_go_of_a_groups_keys_through_the_key_map_at_launch_and_on_every_change() {
        assert!(body(MAIN, "fn start_keys(").contains("keymap::start_held(&picked, &held,"));
        assert!(body(MAIN, "fn start_keys(").contains("groups::hotkey_held(&group_off, a.id())"));
        assert!(body(MAIN, "fn setting_applied(").contains("if groups::is_switch(key) { groups_applied(app); }"));
        let g = body(MAIN, "fn groups_applied(");
        assert!(g.contains("unregister(keymap::shortcut(c))") && g.contains("keymap::arm(a, key_using(a)"), "off lets go, on takes them again");
        assert!(g.contains("VoiceMsg::Cancel") && g.contains("showme_stop(app)") && g.contains("drop_stop_all()"), "a group just switched off stops its tools here");
        // Every place that decides whether a job's keys stay registered counts a held job.
        assert!(!MAIN.contains("keymap::keep_registered("), "main.rs asks key_keep, which counts the groups");
        assert!(body(MAIN, "fn key_registered(").contains("!key_held(a)") || MAIN.contains(".filter(|_| !key_held(a))"));
        assert!(body(MAIN, "fn arm_now(").contains("if on && key_held(accept) { return; }"));
    }
    #[test]
    fn a_file_dropped_with_files_off_is_ignored_like_with_the_convert_setting_off() {
        assert!(MAIN.contains(r#"fn drop_on() -> bool { setting_now("drop.on") != json!(false) && !group_off("files.on") }"#));
    }
    #[test]
    fn the_shell_notes_the_uses_only_it_can_see_where_they_really_happen() {
        assert!(body(MAIN, "fn speak(").contains(r#"mark_tried(&app, "speak")"#));
        assert!(MAIN.contains(r#"say_voice(&app, "heard", "", mic); mark_tried(&app, "talk")"#));
        assert!(body(MAIN, "fn practice_mark(").contains(r#"mark_tried(&app, "practice")"#));
        let at = MAIN.find("let end = convert::end_news(id, &ended);").unwrap();
        assert!(MAIN[at..at + 400].contains(r#"if !ended.made.is_empty() { mark_tried(&app, "convert"); }"#), "only when files were really made");
        // The page's mark goes through the same check, from Home only, and only for what a page can see.
        let m = body(MAIN, "fn tried_mark(");
        assert!(m.contains("only_card(window.label())") && m.contains("page_may_mark(&tool)"));
        assert!(body(MAIN, "fn mark_tried(").contains("groups::tried_after(&current, tool, &group_off)"));
    }

    // ---- tried: a real use only ----

    #[test]
    fn a_tool_is_added_once_and_only_when_it_can_be_tried_and_its_group_is_on() {
        let none = off(&[]);
        assert_eq!(tried_after(&[], "rescue", &none), Some(vec!["rescue".to_string()]));
        assert_eq!(tried_after(&["rescue".to_string()], "talk", &none), Some(vec!["rescue".to_string(), "talk".to_string()]));
        assert_eq!(tried_after(&["rescue".to_string()], "rescue", &none), None, "once is enough");
        assert_eq!(tried_after(&[], "stop", &none), None, "the core is not a tool to try");
        assert_eq!(tried_after(&[], "askBox", &none), None);
        assert_eq!(tried_after(&[], "nothing", &none), None);
        assert_eq!(tried_after(&[], "talk", &off(&["voice.on"])), None, "a refused use is not a use");
        assert_eq!(tried_after(&[], "talk", &off(&["flow.on"])), Some(vec!["talk".to_string()]));
    }
    #[test]
    fn a_page_can_mark_only_the_tools_a_page_sees_used() {
        for t in ["drive", "rescue", "showMe", "lessons", "promptHelp", "errorHelp", "undo"] { assert!(page_may_mark(t), "{t}"); }
        for t in ["talk", "speak", "convert", "practice", "stop", "settings", "nothing"] { assert!(!page_may_mark(t), "{t}: the shell sees it, or it cannot be tried"); }
    }
}
