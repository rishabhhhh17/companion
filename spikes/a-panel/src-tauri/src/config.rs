//! Launch settings: environment first, then launch.json (for Finder launches,
//! which carry no environment), then defaults. Every log line records where
//! the settings came from.

use serde::{Deserialize, Serialize};
use std::path::PathBuf;

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum Mode {
    /// The research's recipe: the dock can take typing on request.
    A,
    /// Plan B: the dock never takes typing; a separate card does.
    B,
}

#[derive(Clone, Debug, Serialize)]
pub struct Config {
    pub mode: Mode,
    pub afm: bool,
    pub preset: usize,
    pub reapply_on_space: bool,
    pub src: String,
}

#[derive(Deserialize, Default)]
struct LaunchFile {
    mode: Option<Mode>,
    afm: Option<bool>,
    preset: Option<usize>,
    reapply_on_space: Option<bool>,
}

pub fn data_dir() -> PathBuf {
    let home = std::env::var("HOME").unwrap_or_else(|_| "/tmp".into());
    PathBuf::from(home).join("Library/Application Support/dev.companion.spike.panel")
}

fn parse_bool(s: &str) -> Option<bool> {
    match s.trim() {
        "1" | "true" | "on" | "yes" => Some(true),
        "0" | "false" | "off" | "no" => Some(false),
        _ => None,
    }
}

fn parse_mode(s: &str) -> Option<Mode> {
    match s.trim().to_ascii_lowercase().as_str() {
        "a" => Some(Mode::A),
        "b" => Some(Mode::B),
        _ => None,
    }
}

pub fn load() -> Config {
    let file: LaunchFile = std::fs::read_to_string(data_dir().join("launch.json"))
        .ok()
        .and_then(|s| serde_json::from_str(&s).ok())
        .unwrap_or_default();
    resolve(
        std::env::var("PANEL_MODE").ok(),
        std::env::var("PANEL_AFM").ok(),
        std::env::var("PANEL_PRESET").ok(),
        std::env::var("PANEL_REAPPLY_ON_SPACE").ok(),
        file,
    )
}

fn resolve(
    env_mode: Option<String>,
    env_afm: Option<String>,
    env_preset: Option<String>,
    env_reapply: Option<String>,
    file: LaunchFile,
) -> Config {
    let mut src = Vec::new();
    let mode = match env_mode.as_deref().and_then(parse_mode) {
        Some(m) => {
            src.push("env:mode");
            m
        }
        None => match file.mode {
            Some(m) => {
                src.push("file:mode");
                m
            }
            None => Mode::A,
        },
    };
    let afm = match env_afm.as_deref().and_then(parse_bool) {
        Some(v) => {
            src.push("env:afm");
            v
        }
        None => match file.afm {
            Some(v) => {
                src.push("file:afm");
                v
            }
            None => true,
        },
    };
    let preset = match env_preset.as_deref().and_then(|s| s.trim().parse::<usize>().ok()) {
        Some(p) => {
            src.push("env:preset");
            p
        }
        None => match file.preset {
            Some(p) => {
                src.push("file:preset");
                p
            }
            None => 0,
        },
    } % crate::presets::COUNT;
    let reapply_on_space = match env_reapply.as_deref().and_then(parse_bool) {
        Some(v) => {
            src.push("env:reapply");
            v
        }
        None => file.reapply_on_space.unwrap_or(false),
    };
    Config {
        mode,
        afm,
        preset,
        reapply_on_space,
        src: if src.is_empty() { "default".into() } else { src.join(",") },
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn env_beats_file_beats_default() {
        let file = LaunchFile { mode: Some(Mode::B), afm: Some(false), preset: Some(4), reapply_on_space: None };
        let c = resolve(Some("a".into()), None, None, None, file);
        assert_eq!(c.mode, Mode::A);
        assert!(!c.afm);
        assert_eq!(c.preset, 4);
        assert_eq!(c.src, "env:mode,file:afm,file:preset");
    }

    #[test]
    fn defaults_when_nothing_set() {
        let c = resolve(None, None, None, None, LaunchFile::default());
        assert_eq!(c.mode, Mode::A);
        assert!(c.afm);
        assert_eq!(c.preset, 0);
        assert_eq!(c.src, "default");
    }

    #[test]
    fn bad_values_fall_through() {
        let c = resolve(Some("x".into()), Some("maybe".into()), Some("99".into()), None, LaunchFile::default());
        assert_eq!(c.mode, Mode::A);
        assert!(c.afm);
        assert_eq!(c.preset, 99 % crate::presets::COUNT);
    }
}
