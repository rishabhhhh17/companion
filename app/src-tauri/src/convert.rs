//! F19: drop a file on the companion to convert it. A file dropped on Companion's own windows (the character's window or
//! the island in the notch; Tauri's drop events on those two windows only, never a global drag watch, never key events)
//! gets a ring of what can be done with it, chosen by its type. Everything runs on this Mac with the Mac's own tools only:
//! sips for pictures, PDFKit (through a fixed JavaScript for Automation script run by osascript) for PDFs and for
//! printing a document to PDF, textutil for documents, afconvert for sound and avconvert for video and trimming, ImageIO
//! and AVFoundation (through a second fixed script) for stripping a picture's details, thumbnails and a still frame, and
//! ditto for zip and unzip. No new dependency and no ffmpeg (F19 item 4: its licence is the founder's call). What a Mac
//! can write is read from its own tools at runtime (`Caps`), so a format is offered only when this Mac can make it.
//!
//! The rules this file keeps:
//! - Nothing is sent anywhere: no file, name or content goes to Claude, the engine or the network. textutil runs with
//!   `-noload`, so a web page fetches nothing from the network. That does not stop it reading pictures from this Mac (by a
//!   full path, or one relative to the page), so a document goes to PDF through plain RTF, which keeps no pictures at all
//!   (`plan`, toPdf), and the tools only ever read Companion's own copy of the file, in the work folder (`take_input`).
//! - Commands are argument lists, never a shell string. Paths are their own arguments (absolute, so none can be read as an
//!   option), and the PDF script is one fixed text that never contains a name.
//! - Only a readable regular file that is not a link is taken (`check_input` at the drop; `take_input`, which opens it
//!   once without following a link and copies exactly what it opened, just before the tools run).
//! - Never over anything: each tool writes into Companion's own work folder; the result is then put next to the original
//!   (or in Downloads or on the Desktop, drop.saveTo) under a new name that is free ("photo (converted).png"), with a link
//!   or a copy that fails rather than replace a file that appeared meanwhile. Nothing is deleted except the work folder,
//!   and a folder result Companion itself just made and could not finish.
//! - A zip is read before anything is extracted (`zip_vet`): a path that climbs out of its folder, a link, a password, too
//!   many files or too much once opened is refused, and while ditto runs the folder it writes is watched (`Guard`) and
//!   the tool is ended the moment it passes the caps or makes a link. No link is ever followed, when zipping or unzipping.
//! - Stop everything stops a running job (`Job::stop`): the tool, and anything it started, is ended and nothing half made
//!   is put anywhere. Quitting waits a moment for that (`Job::wait_ended`), and a work folder left by a Companion that
//!   was ended mid job is removed at the next launch (`sweep`).
use serde_json::{json, Value};
use std::ffi::OsString;
use std::io::{Read, Write};
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Condvar, Mutex};
use std::time::Duration;

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Kind { Image, Pdf, Document, Audio, Video, Archive, Folder, Other }
impl Kind {
    pub fn id(self) -> &'static str {
        match self {
            Kind::Image => "image", Kind::Pdf => "pdf", Kind::Document => "document", Kind::Audio => "audio", Kind::Video => "video",
            Kind::Archive => "archive", Kind::Folder => "folder", Kind::Other => "other",
        }
    }
}

/// More than this in one drop is not offered anything (said in one line).
pub const MAX_FILES: usize = 20;

const SIPS: &str = "/usr/bin/sips";
const TEXTUTIL: &str = "/usr/bin/textutil";
const AFCONVERT: &str = "/usr/bin/afconvert";
const AVCONVERT: &str = "/usr/bin/avconvert";
const OSASCRIPT: &str = "/usr/bin/osascript";
const DITTO: &str = "/usr/bin/ditto";

const IMAGE_IN: &[&str] = &["png", "jpeg", "heic", "tiff", "webp", "gif", "bmp", "jp2", "tga", "avif", "icns", "ico"];
const DOC_IN: &[&str] = &["docx", "doc", "rtf", "html", "txt", "odt", "md", "webarchive"];
const AUDIO_IN: &[&str] = &["m4a", "mp3", "wav", "aiff", "caf", "aac", "flac", "au"];
const VIDEO_IN: &[&str] = &["mov", "mp4", "m4v"];
/// Formats sips writes that a resized, turned or flipped picture keeps; anything else becomes a PNG.
const SIPS_KEEPS: &[&str] = &["png", "jpeg", "heic", "tiff", "gif", "bmp"];
/// The grey profile works for these four only; a GIF or a BMP made grey is saved as a PNG.
const GRAY_KEEPS: &[&str] = &["png", "jpeg", "heic", "tiff"];
/// Pictures whose details can be taken off and the picture saved in the same format (ImageIO writes these four).
const STRIP_KEEPS: &[&str] = &["png", "jpeg", "heic", "tiff"];
/// The profile sips matches a picture to, to make it grey (shipped with macOS).
pub const GRAY_PROFILE: &str = "/System/Library/ColorSync/Profiles/Generic Gray Profile.icc";

/// Every format a picture can be converted to, in the order the ring shows them (a format the Mac cannot write is left out
/// by `Caps`).
const IMAGE_TO: &[(&str, &str)] = &[("png", "toPng"), ("jpeg", "toJpeg"), ("heic", "toHeic"), ("tiff", "toTiff"), ("webp", "toWebp"), ("gif", "toGif"), ("bmp", "toBmp"), ("jp2", "toJp2"), ("tga", "toTga"), ("avif", "toAvif")];
const DOC_TO: &[(&str, &str)] = &[("pdf", "toPdf"), ("txt", "toText"), ("docx", "toDocx"), ("rtf", "toRtf"), ("html", "toHtml"), ("doc", "toDoc"), ("odt", "toOdt"), ("wordml", "toWordml")];
const AUDIO_TO: &[(&str, &str)] = &[("m4a", "toM4a"), ("wav", "toWav"), ("aiff", "toAiff"), ("alac", "toAlac"), ("caf", "toCaf"), ("flac", "toFlac"), ("aac", "toAac")];
const VIDEO_TO: &[(&str, &str)] = &[("mp4", "toMp4"), ("mov", "toMov"), ("m4v", "toM4v")];

/// A file's extension, lower case, with the usual spellings made one (jpg is jpeg, tif is tiff, heif is heic, htm is
/// html, aif is aiff, markdown is md).
pub fn ext_of(p: &Path) -> String {
    let e = p.extension().map(|e| e.to_string_lossy().to_lowercase()).unwrap_or_default();
    match e.as_str() { "jpg" => "jpeg".into(), "tif" => "tiff".into(), "heif" => "heic".into(), "htm" => "html".into(), "aif" => "aiff".into(), "markdown" => "md".into(), _ => e }
}

/// What kind of file this is, from its extension only (nothing is read to decide).
pub fn kind_of(p: &Path) -> Option<Kind> {
    let e = ext_of(p);
    let e = e.as_str();
    if IMAGE_IN.contains(&e) { Some(Kind::Image) }
    else if e == "pdf" { Some(Kind::Pdf) }
    else if DOC_IN.contains(&e) { Some(Kind::Document) }
    else if AUDIO_IN.contains(&e) { Some(Kind::Audio) }
    else if VIDEO_IN.contains(&e) { Some(Kind::Video) }
    else if e == "zip" { Some(Kind::Archive) }
    else { None }
}

/// The kind of anything dropped: a folder is a folder whatever it is named, a file is by its extension, and a file of no
/// known kind is Other (it can only be zipped).
pub fn kind_at(p: &Path) -> Kind {
    if std::fs::symlink_metadata(p).is_ok_and(|m| m.is_dir()) { return Kind::Folder; }
    kind_of(p).unwrap_or(Kind::Other)
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum SaveTo { NextTo, Downloads, Desktop }

/// The settings this feature reads (protocol/settings.json, section files), as the shell applies them.
#[derive(Clone, Debug, PartialEq)]
pub struct Prefs { pub image: String, pub doc: String, pub audio: String, pub video: String, pub resize: u32, pub quality: u8, pub rate: u32, pub save_to: SaveTo }
/// Every setting read here, so a test proves each is in the registry, kept in settings.json, for the shell.
#[cfg_attr(not(test), allow(dead_code))]   // checked by the tests
pub const KEYS: &[&str] = &["drop.on", "drop.imageFormat", "drop.docFormat", "drop.audioFormat", "drop.videoFormat", "drop.resizeTo", "drop.quality", "drop.sampleRate", "drop.saveTo"];
impl Prefs {
    /// The usual values (the registry's defaults).
    pub fn usual() -> Prefs {
        Prefs { image: "png".into(), doc: "pdf".into(), audio: "m4a".into(), video: "mp4".into(), resize: 1600, quality: 60, rate: 44_100, save_to: SaveTo::NextTo }
    }
    /// The values in force; one that is not set, or not one this version knows, is the usual one.
    pub fn read(get: impl Fn(&str) -> Value) -> Prefs {
        let u = Prefs::usual();
        let word = |k: &str| get(k).as_str().map(str::to_string);
        let pick = |k: &str, from: &[(&str, &str)], usual: String| word(k).filter(|w| from.iter().any(|(f, _)| f == w)).unwrap_or(usual);
        Prefs {
            image: pick("drop.imageFormat", IMAGE_TO, u.image),
            doc: pick("drop.docFormat", DOC_TO, u.doc),
            audio: pick("drop.audioFormat", AUDIO_TO, u.audio),
            video: pick("drop.videoFormat", VIDEO_TO, u.video),
            resize: match word("drop.resizeTo").as_deref() { Some("1024") => 1024, Some("2400") => 2400, _ => u.resize },
            quality: match word("drop.quality").as_deref() { Some("high") => 80, Some("small") => 40, _ => u.quality },
            rate: match word("drop.sampleRate").as_deref() { Some("16000") => 16_000, Some("22050") => 22_050, Some("48000") => 48_000, _ => u.rate },
            save_to: match word("drop.saveTo").as_deref() { Some("downloads") => SaveTo::Downloads, Some("desktop") => SaveTo::Desktop, _ => u.save_to },
        }
    }
}

// ---------- what this Mac can write ----------

/// What this Mac's own tools can write, read from the tools' own words (`probe`), so a format is offered only when the Mac
/// can make it. Macs differ: macOS 14 is the minimum and each newer one adds and drops formats (on macOS 27.0.1 sips reads
/// WebP but cannot write it). The few every Mac has are always there (`core`).
#[derive(Clone, Debug, PartialEq)]
pub struct Caps {
    /// File name endings sips lists as Writable (png, jpeg, gif, icns, ...).
    pub image: Vec<String>,
    /// afconvert's file format and data format pairs: ("m4af", "alac"), ("flac", "flac"), ...
    pub audio: Vec<(String, String)>,
    /// The formats textutil converts to that are offered here (doc, odt, wordml).
    pub doc: Vec<String>,
    /// avconvert's preset names.
    pub preset: Vec<String>,
    /// Whether the grey profile sips matches a picture to is on this Mac.
    pub gray: bool,
}

const IMAGE_ALWAYS: &[&str] = &["png", "jpeg", "heic", "tiff"];
const DOC_ALWAYS: &[&str] = &["pdf", "txt", "docx", "rtf", "html"];
const DOC_EXTRA: &[&str] = &["doc", "odt", "wordml"];
/// Never offered, though textutil lists them: a web archive or an RTFD carries pictures from elsewhere on the Mac.
const AUDIO_ALWAYS: &[(&str, &str)] = &[("WAVE", "LEI16"), ("AIFF", "BEI16"), ("m4af", "aac")];
const PRESET_ALWAYS: &[&str] = &["PresetHighestQuality", "PresetAppleM4A"];
const PRESETS_USED: &[&str] = &["PresetHEVCHighestQuality", "PresetAppleM4V720pHD", "Preset640x480", "Preset1280x720", "Preset1920x1080"];
/// The (file format, data format) afconvert is told for each sound format.
const AUDIO_PAIRS: &[(&str, &str, &str)] = &[("m4a", "m4af", "aac"), ("wav", "WAVE", "LEI16"), ("aiff", "AIFF", "BEI16"), ("alac", "m4af", "alac"), ("caf", "caff", "LEI16"), ("flac", "flac", "flac"), ("aac", "adts", "aac")];

impl Caps {
    /// Only what every Mac has.
    pub fn core() -> Caps { Caps { image: vec![], audio: vec![], doc: vec![], preset: vec![], gray: false } }
    /// Everything this file knows how to ask for (used to check an action is one that exists, and by tests).
    pub fn all() -> Caps {
        Caps {
            image: IMAGE_TO.iter().map(|(f, _)| f.to_string()).chain(["icns".to_string(), "ico".to_string()]).collect(),
            audio: AUDIO_PAIRS.iter().map(|(_, f, d)| (f.to_string(), d.to_string())).collect(),
            doc: DOC_EXTRA.iter().map(|d| d.to_string()).collect(),
            preset: PRESETS_USED.iter().map(|d| d.to_string()).collect(),
            gray: true,
        }
    }
    /// The tools' own words: `sips --formats`, `afconvert -hf`, `textutil -help`, `avconvert --help`, and whether the grey
    /// profile is there. Words that say nothing give `core`.
    pub fn probe(sips: &str, afconvert: &str, textutil: &str, avconvert: &str, gray: bool) -> Caps {
        let image = sips.lines().filter_map(|l| {
            let t: Vec<&str> = l.split_whitespace().collect();
            (t.len() >= 3 && t[2] == "Writable").then(|| t[1].to_lowercase())
        }).collect();
        // The formats textutil says it converts to: the words in the brackets after "-convert fmt".
        let at = textutil.find("-convert fmt").map(|i| &textutil[i..]).unwrap_or("");
        let listed = at.find('(').zip(at.find(')')).filter(|(a, b)| a < b).map(|(a, b)| &at[a + 1..b]).unwrap_or("");
        let doc = DOC_EXTRA.iter().filter(|d| listed.split(|c: char| !c.is_ascii_alphanumeric()).any(|w| w == **d)).map(|d| d.to_string()).collect();
        let preset = avconvert.split("Supported presets").nth(1).map(|rest| rest.lines().map(str::trim).filter(|l| l.starts_with("Preset") && l.chars().all(|c| c.is_ascii_alphanumeric())).map(str::to_string).collect()).unwrap_or_default();
        Caps { image, audio: audio_pairs(afconvert), doc, preset, gray }
    }
    pub fn image_ok(&self, fmt: &str) -> bool { IMAGE_ALWAYS.contains(&fmt) || self.image.iter().any(|f| f == fmt) }
    /// Whether afconvert can write this data format inside this file format ("a data format only counts inside the file
    /// format that lists it").
    pub fn audio_ok(&self, file: &str, data: &str) -> bool { AUDIO_ALWAYS.contains(&(file, data)) || self.audio.iter().any(|(f, d)| f == file && d == data) }
    pub fn doc_ok(&self, fmt: &str) -> bool { DOC_ALWAYS.contains(&fmt) || self.doc.iter().any(|f| f == fmt) }
    pub fn preset_ok(&self, name: &str) -> bool { PRESET_ALWAYS.contains(&name) || self.preset.iter().any(|p| p == name) }
}

/// afconvert's list ("'caff' = CAF (.caf, .caff)" then "data_formats: ..." over one or more lines) as pairs.
fn audio_pairs(text: &str) -> Vec<(String, String)> {
    let mut out = vec![];
    let mut file: Option<String> = None;
    for line in text.lines() {
        let t = line.trim();
        if let Some(rest) = t.strip_prefix('\'') {
            if let Some((id, tail)) = rest.split_once('\'') { if tail.trim_start().starts_with('=') { file = Some(id.trim().to_string()); continue; } }
        }
        let Some(f) = &file else { continue };
        let body = t.strip_prefix("data_formats:").unwrap_or(t);
        let mut chars = body.chars().peekable();
        while let Some(&c) = chars.peek() {
            if c.is_whitespace() { chars.next(); continue; }
            let mut tok = String::new();
            if c == '\'' {
                chars.next();
                for c in chars.by_ref() { if c == '\'' { break; } tok.push(c); }
            } else {
                while let Some(&c) = chars.peek() { if c.is_whitespace() { break; } tok.push(c); chars.next(); }
            }
            let tok = tok.trim().to_string();
            if !tok.is_empty() { out.push((f.clone(), tok)); }
        }
    }
    out
}

/// Asks this Mac's own tools what they write. Read only, nothing is converted; each tool is run with a plain environment.
/// Their words come on stdout or stderr and some exit with a failure code after printing them, so both are read.
pub fn probe_tools() -> Caps {
    let say = |program: &str, args: &[&str]| -> String {
        std::process::Command::new(program).args(args).env_clear().env("PATH", "/usr/bin:/bin").stdin(std::process::Stdio::null()).output()
            .map(|o| format!("{}\n{}", String::from_utf8_lossy(&o.stdout), String::from_utf8_lossy(&o.stderr))).unwrap_or_default()
    };
    Caps::probe(&say(SIPS, &["--formats"]), &say(AFCONVERT, &["-hf"]), &say(TEXTUTIL, &["-help"]), &say(AVCONVERT, &["--help"]), Path::new(GRAY_PROFILE).is_file())
}

/// What a drop gets: the actions, in the order the ring shows them, or why nothing can be done.
#[derive(Clone, Debug, PartialEq)]
pub enum Offer { Actions(Kind, Vec<&'static str>), Refused(&'static str) }

/// The conversions to every format in `to` except the one all the files already are, the person's usual one first. `ok`
/// says whether this Mac can write a format.
fn formats(to: &[(&'static str, &'static str)], own: Option<&str>, first: &str, ok: &dyn Fn(&str) -> bool) -> Vec<&'static str> {
    let same = |f: &str| Some(f) == own || (f == "alac" && own == Some("m4a"));
    let mut list: Vec<(&str, &'static str)> = to.iter().copied().filter(|(f, _)| !same(f) && ok(f)).collect();
    if let Some(i) = list.iter().position(|(f, _)| *f == first) { let one = list.remove(i); list.insert(0, one); }
    list.into_iter().map(|(_, a)| a).collect()
}

/// How a sound is written when only its channels or its rate change: its own format when the Mac writes it (and the file
/// ending that goes with it), else an M4A.
fn keep_audio(ext: &str) -> (&'static str, &'static str, &'static str) {
    match ext {
        "wav" => ("WAVE", "LEI16", "wav"),
        "aiff" => ("AIFF", "BEI16", "aiff"),
        "caf" => ("caff", "LEI16", "caf"),
        "flac" => ("flac", "flac", "flac"),
        "aac" => ("adts", "aac", "aac"),
        _ => ("m4af", "aac", "m4a"),
    }
}

/// The action that makes a dropped folder the project and finds what is wrong in it. Not a conversion: main.rs drop_pick
/// handles it before any tool, and `plan` never sees it.
pub const OPEN_PROJECT: &str = "openProject";

/// Which actions these files get. All of one kind, at most MAX_FILES (a folder and a file of no known kind go together:
/// both can only be zipped). Trim is for one file at a time; merge is for several PDFs. Every format is offered only when
/// `caps` says this Mac can write it.
pub fn offer(paths: &[PathBuf], caps: &Caps, prefs: &Prefs) -> Offer {
    if paths.is_empty() { return Offer::Refused("none"); }
    if paths.len() > MAX_FILES { return Offer::Refused("tooMany"); }
    let kinds: Vec<Kind> = paths.iter().map(|p| kind_at(p)).collect();
    let loose = |k: &Kind| matches!(k, Kind::Folder | Kind::Other);
    let kind = if kinds.iter().all(|k| *k == kinds[0]) { kinds[0] }
        else if kinds.iter().all(loose) { Kind::Other }
        else { return Offer::Refused("mixed") };
    let exts: Vec<String> = paths.iter().map(|p| ext_of(p)).collect();
    let own = exts.iter().all(|e| *e == exts[0]).then(|| exts[0].as_str());
    let one = paths.len() == 1;
    let mut list: Vec<&'static str> = match kind {
        Kind::Archive => return Offer::Actions(kind, vec!["unzip"]),
        // One folder may be the project Squibby works on (main.rs drop_pick: it is checked like any folder chosen).
        Kind::Folder if one => vec![OPEN_PROJECT],
        Kind::Folder | Kind::Other => vec![],
        Kind::Image => {
            let mut v = formats(IMAGE_TO, own, &prefs.image, &|f| caps.image_ok(f));
            v.extend(["resize", "compress", "turnRight", "turnLeft", "turnAround", "flipHorizontal", "flipVertical"]);
            if caps.gray { v.push("grayscale"); }
            if exts.iter().all(|e| STRIP_KEEPS.contains(&e.as_str())) { v.push("stripInfo"); }
            v.push("thumbnails");
            if caps.image_ok("icns") && own != Some("icns") { v.push("toIcns"); }
            if caps.image_ok("ico") && own != Some("ico") { v.push("toIco"); }
            v.push("imageToPdf");
            if !one { v.push("imagesToPdf"); }
            v
        }
        Kind::Pdf => {
            let mut v = if one { vec![] } else { vec!["merge"] };
            v.extend(["split", "pdfCompress", "pagesToImages", "pdfText", "turnRight", "turnLeft", "turnAround", "dropFirstPage", "dropLastPage", "keepFirstPage"]);
            v
        }
        Kind::Document => formats(DOC_TO, own, &prefs.doc, &|f| caps.doc_ok(f)),
        Kind::Audio => {
            let mut v = formats(AUDIO_TO, own, &prefs.audio, &|f| {
                let (_, file, data) = AUDIO_PAIRS.iter().find(|(n, _, _)| *n == f).copied().unwrap_or((f, "", ""));
                caps.audio_ok(file, data)
            });
            if one { v.push("trim"); }
            // Channels and rate keep the sound's own format; they are offered when the Mac writes it for every file.
            if exts.iter().all(|e| { let (f, d, _) = keep_audio(e); caps.audio_ok(f, d) }) { v.extend(["mono", "stereo", "sampleRate"]); }
            v
        }
        Kind::Video => {
            let mut v = formats(VIDEO_TO, own, &prefs.video, &|f| f != "m4v" || caps.preset_ok("PresetAppleM4V720pHD"));
            v.push("soundOnly");
            if one { v.push("trim"); }
            for (id, preset) in [("toHevc", "PresetHEVCHighestQuality"), ("video480", "Preset640x480"), ("video720", "Preset1280x720"), ("video1080", "Preset1920x1080")] {
                if caps.preset_ok(preset) { v.push(id); }
            }
            v.extend(["stillStart", "stillMiddle"]);
            v
        }
    };
    list.push("zip");
    if !one { list.push("zipTogether"); }
    Offer::Actions(kind, list)
}

/// Whether `sips --formats` lists this extension as one it can write.
pub fn writable(formats: &str, ext: &str) -> bool {
    formats.lines().any(|l| { let t: Vec<&str> = l.split_whitespace().collect(); t.len() >= 3 && t[1] == ext && t[2] == "Writable" })
}

// ---------- names ----------

/// The name of a result: "photo (converted).png", then "photo (converted 2).png" and so on. A folder has no extension.
/// A name never passes macOS's 255 byte limit: the original part is shortened, never cut inside a letter.
pub fn name_for(stem: &str, label: &str, ext: Option<&str>, n: u32) -> String {
    let tail = match (n, ext) {
        (1, Some(e)) => format!(" ({label}).{e}"),
        (1, None) => format!(" ({label})"),
        (n, Some(e)) => format!(" ({label} {n}).{e}"),
        (n, None) => format!(" ({label} {n})"),
    };
    let room = 255usize.saturating_sub(tail.len());
    let mut cut = stem.len().min(room);
    while !stem.is_char_boundary(cut) { cut -= 1; }
    format!("{}{tail}", &stem[..cut])
}

/// The first of those names that nothing in `dir` has. None after 999 (never a name already taken).
pub fn free_name(dir: &Path, stem: &str, label: &str, ext: Option<&str>, exists: impl Fn(&Path) -> bool) -> Option<PathBuf> {
    (1..=999).map(|n| dir.join(name_for(stem, label, ext, n))).find(|p| !exists(p))
}

// ---------- paths ----------

/// A dropped path is used only if it is absolute, there, a regular file or a folder (not a link, nothing else) and
/// readable. A folder can only be zipped.
pub fn check_input(p: &Path) -> Result<(), &'static str> {
    if !p.is_absolute() { return Err("notAbsolute"); }
    let m = match std::fs::symlink_metadata(p) {
        Ok(m) => m,
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => return Err("missing"),
        Err(_) => return Err("unreadable"),
    };
    if m.file_type().is_symlink() { return Err("link"); }
    if m.is_dir() { return std::fs::read_dir(p).map(|_| ()).map_err(|_| "unreadable"); }
    if !m.is_file() { return Err("notFile"); }
    std::fs::File::open(p).map(|_| ()).map_err(|_| "unreadable")
}

/// Where a result goes: next to its original (the usual), or in Downloads or on the Desktop.
pub fn dest_dir(source: &Path, to: SaveTo, home: &Path) -> Option<PathBuf> {
    match to {
        SaveTo::NextTo => source.parent().map(Path::to_path_buf),
        SaveTo::Downloads => Some(home.join("Downloads")),
        SaveTo::Desktop => Some(home.join("Desktop")),
    }
}

/// Whether new files can be made in this folder: it is a folder, and this user may write in it. Checked before any tool
/// runs, so a long job is never done for a result that cannot be saved (a disk image, a share that is read only).
pub fn writable_dir(p: &Path) -> bool {
    use std::os::unix::ffi::OsStrExt;
    std::fs::metadata(p).is_ok_and(|m| m.is_dir())
        && std::ffi::CString::new(p.as_os_str().as_bytes()).is_ok_and(|c| unsafe { libc::access(c.as_ptr(), libc::W_OK) } == 0)
}

/// A dropped file bigger than this that cannot be cloned (it is on another disk than the work folder) is read where it is
/// rather than copied first: copying a long video from an external disk would double the time and the space it takes.
const COPY_MAX: u64 = 512 * 1024 * 1024;

/// Takes a dropped file for the tools, just before they run. It is opened once, never through a link (the last part of
/// the path), and must be a regular file; the tools are then given Companion's own copy of exactly what was opened, at
/// `copy` in the work folder: an instant clone on the same disk, else a copy. So a file swapped after this changes nothing
/// they read, and a web page's relative links point into the work folder, where nothing else is. A file too big to copy
/// from another disk is read where it is, after the same check made by its path (`copy` is then a link to it).
/// The copy is made in pieces and stops when the job is stopped ("stopped"), taking away the half made copy.
pub fn take_input(from: &Path, copy: &Path, real_max: Option<u64>, job: &Job) -> Result<(), &'static str> {
    let free = copy.parent().and_then(free_space);
    match std::fs::symlink_metadata(from) {
        Ok(m) if m.is_dir() => take_folder(from, copy, true, FOLDER_LIMITS, free, job),
        _ => take(from, copy, Terms { clone: true, copy_max: COPY_MAX, real_max, free }, job),
    }
}

/// How a file is taken. `clone`: an instant clone may be tried first. `copy_max`: a file bigger than this that cannot be
/// cloned is read where it is (a link) rather than copied. `real_max`: when set, the file must be Companion's own real
/// copy, never a link (a zip stores a link as a link, and an unzip must vet the very bytes it extracts): a file bigger
/// than this is refused ("tooBig"). `free`: the room on the work folder's disk, when known.
#[derive(Clone, Copy, Debug)]
struct Terms { clone: bool, copy_max: u64, real_max: Option<u64>, free: Option<u64> }

/// Room kept free on the work folder's disk, beyond what a copy takes.
const SPARE: u64 = 256 << 20;
/// Whether `need` bytes fit in `free` (when the room is not known, it is taken as there).
pub fn room_ok(free: Option<u64>, need: u64) -> bool { free.is_none_or(|f| f >= need) }
/// The bytes free for a new file on the disk `dir` is on.
pub fn free_space(dir: &Path) -> Option<u64> {
    use std::os::unix::ffi::OsStrExt;
    let c = std::ffi::CString::new(dir.as_os_str().as_bytes()).ok()?;
    let mut v: libc::statvfs = unsafe { std::mem::zeroed() };
    if unsafe { libc::statvfs(c.as_ptr(), &mut v) } != 0 { return None; }
    Some((v.f_bavail as u64).saturating_mul(v.f_frsize as u64))
}

/// Caps on what is walked, copied or written: how many things (files, folders and links) and how many bytes in all.
#[derive(Clone, Copy, Debug, PartialEq)]
pub struct Limits { pub files: u64, pub bytes: u64 }
/// A folder that is zipped is copied first, so it is capped.
pub const FOLDER_LIMITS: Limits = Limits { files: 100_000, bytes: 16 << 30 };
/// What an unzip may make: counted by what the zip says before it is extracted, and watched while it is.
pub const UNZIP_LIMITS: Limits = Limits { files: 10_000, bytes: 4 << 30 };
/// Folders nested deeper than this are refused rather than walked.
const MAX_DEPTH: usize = 64;

/// Counts everything under `dir` (not `dir` itself) without following a link: how many things and how many bytes of
/// files. A link counts as one thing and is never entered. Refused when over the caps ("tooBig"), when nested absurdly
/// deep ("tooBig"), when it cannot be read ("unreadable"), and, unless links are allowed, when there is a link or
/// anything that is not a file or a folder ("unsafeZip"). With links allowed, a pipe, a socket or a device is refused
/// ("special").
pub fn tree_stats(dir: &Path, lim: Limits, allow_links: bool) -> Result<(u64, u64), &'static str> {
    let (mut count, mut bytes) = (0u64, 0u64);
    let mut todo = vec![(dir.to_path_buf(), 1usize)];
    while let Some((d, depth)) = todo.pop() {
        if depth > MAX_DEPTH { return Err("tooBig"); }
        for e in std::fs::read_dir(&d).map_err(|_| "unreadable")? {
            let path = e.map_err(|_| "unreadable")?.path();
            let m = std::fs::symlink_metadata(&path).map_err(|_| "unreadable")?;
            let t = m.file_type();
            count += 1;
            if t.is_dir() { todo.push((path, depth + 1)); }
            else if t.is_file() { bytes += m.len(); }
            else if !allow_links { return Err("unsafeZip"); }
            // A link is allowed (it is copied as a link); a pipe, a socket or a device is not: it would be waited on.
            else if !t.is_symlink() { return Err("special"); }
            if count > lim.files || bytes > lim.bytes { return Err("tooBig"); }
        }
    }
    Ok((count, bytes))
}

/// Gives a new file the "downloaded from the internet" mark of the one it was copied from, if it has one, so what is made
/// from it (an unzip) keeps being checked by macOS. No mark is made up.
fn copy_quarantine(from: std::os::fd::RawFd, to: std::os::fd::RawFd) {
    let name = c"com.apple.quarantine";
    let mut buf = [0u8; 512];
    let n = unsafe { libc::fgetxattr(from, name.as_ptr(), buf.as_mut_ptr().cast(), buf.len(), 0, 0) };
    if n > 0 { unsafe { libc::fsetxattr(to, name.as_ptr(), buf.as_ptr().cast(), n as usize, 0, 0); } }
}

fn take(from: &Path, copy: &Path, t: Terms, job: &Job) -> Result<(), &'static str> {
    use std::os::fd::AsRawFd;
    use std::os::unix::ffi::OsStrExt;
    use std::os::unix::fs::OpenOptionsExt;
    if !from.is_absolute() { return Err("gone"); }
    // O_NONBLOCK: a pipe put in the file's place cannot hang the open; it is then refused as not a regular file.
    let mut f = std::fs::OpenOptions::new().read(true).custom_flags(libc::O_NOFOLLOW | libc::O_NONBLOCK).open(from)
        .map_err(|e| if e.kind() == std::io::ErrorKind::PermissionDenied { "unreadable" } else { "gone" })?;
    let m = f.metadata().map_err(|_| "gone")?;
    if !m.is_file() { return Err("gone"); }
    let real = t.real_max.is_some();
    if t.real_max.is_some_and(|max| m.len() > max) { return Err("tooBig"); }
    // A file that is zipped makes a zip about as big as itself, even when the file itself is only cloned.
    if real && !room_ok(t.free, m.len().saturating_add(SPARE)) { return Err("noRoom"); }
    let to = std::ffi::CString::new(copy.as_os_str().as_bytes()).map_err(|_| "noWork")?;
    if t.clone && unsafe { libc::fclonefileat(f.as_raw_fd(), libc::AT_FDCWD, to.as_ptr(), 0) } == 0 { return Ok(()); }
    if real || m.len() <= t.copy_max {
        // A copy that will be zipped is a second copy of it, besides the zip.
        let need = m.len().saturating_mul(if real { 2 } else { 1 }).saturating_add(SPARE);
        if !room_ok(t.free, need) { return Err("noRoom"); }
        let mut out = std::fs::OpenOptions::new().write(true).create_new(true).mode(0o600).open(copy).map_err(|_| "noWork")?;
        let mut buf = vec![0u8; 1 << 20];
        copy_quarantine(f.as_raw_fd(), out.as_raw_fd());
        let r: Result<(), &'static str> = loop {
            if job.stopped() { break Err("stopped"); }
            match f.read(&mut buf) {
                Ok(0) => break Ok(()),
                Ok(n) => if out.write_all(&buf[..n]).is_err() { break Err("noWork"); },
                Err(e) if e.kind() == std::io::ErrorKind::Interrupted => {}
                Err(_) => break Err("noWork"),
            }
        };
        if let Err(why) = r { drop(out); let _ = std::fs::remove_file(copy); return Err(why); }
        return Ok(());
    }
    std::os::unix::fs::symlink(from, copy).map_err(|_| "noWork")?;
    check_input(from).map_err(|_| "gone")
}

/// Takes a dropped folder for the tools, the way `take` takes a file: refused if it is a link or not a folder ("gone"), or
/// bigger than the caps ("tooBig"), and copied without ever following a link (a link inside is copied as a link). An
/// instant clone on the same disk (`may_clone`), else a copy made piece by piece that stops when the job is stopped
/// ("stopped"), taking away what was half made. `copy` must not be there yet.
fn take_folder(from: &Path, copy: &Path, may_clone: bool, lim: Limits, free: Option<u64>, job: &Job) -> Result<(), &'static str> {
    use std::os::unix::ffi::OsStrExt;
    if !from.is_absolute() { return Err("gone"); }
    if !std::fs::symlink_metadata(from).is_ok_and(|m| m.is_dir()) { return Err("gone"); }
    let (_, bytes) = tree_stats(from, lim, true)?;
    // A folder is always zipped: the zip is about as big as the folder, and a copy that is not a clone is another one.
    if !room_ok(free, bytes.saturating_add(SPARE)) { return Err("noRoom"); }
    let cleanup = |why: &'static str| { let _ = remove_tree(copy); why };
    if may_clone {
        let (a, b) = (std::ffi::CString::new(from.as_os_str().as_bytes()).map_err(|_| "gone")?, std::ffi::CString::new(copy.as_os_str().as_bytes()).map_err(|_| "noWork")?);
        // CLONE_NOFOLLOW (1): the folder itself is never followed if it was swapped for a link meanwhile.
        if unsafe { libc::clonefile(a.as_ptr(), b.as_ptr(), 1) } == 0 {
            // What was cloned is Companion's own and cannot change: it is counted again, in case the folder grew meanwhile.
            return tree_stats(copy, lim, true).and_then(|_| own_folders(copy).map_err(|_| "noWork")).map_err(cleanup);
        }
    }
    if !room_ok(free, bytes.saturating_mul(2).saturating_add(SPARE)) { return Err("noRoom"); }
    let mut seen = (0u64, 0u64);
    std::fs::create_dir(copy).map_err(|_| "noWork")?;
    copy_tree(from, copy, lim, &mut seen, 1, job).and_then(|_| own_folders(copy).map_err(|_| "noWork")).map_err(cleanup)
}

fn copy_tree(from: &Path, to: &Path, lim: Limits, seen: &mut (u64, u64), depth: usize, job: &Job) -> Result<(), &'static str> {
    use std::os::fd::AsRawFd;
    use std::os::unix::fs::OpenOptionsExt;
    if depth > MAX_DEPTH { return Err("tooBig"); }
    for e in std::fs::read_dir(from).map_err(|_| "unreadable")? {
        if job.stopped() { return Err("stopped"); }
        let path = e.map_err(|_| "unreadable")?.path();
        let name = path.file_name().ok_or("gone")?;
        let dest = to.join(name);
        let m = std::fs::symlink_metadata(&path).map_err(|_| "gone")?;
        let t = m.file_type();
        seen.0 += 1;
        if t.is_symlink() {
            std::os::unix::fs::symlink(std::fs::read_link(&path).map_err(|_| "gone")?, &dest).map_err(|_| "noWork")?;
        } else if t.is_dir() {
            std::fs::create_dir(&dest).map_err(|_| "noWork")?;
            copy_tree(&path, &dest, lim, seen, depth + 1, job)?;
        } else if t.is_file() {
            seen.1 += m.len();
            let mut f = std::fs::OpenOptions::new().read(true).custom_flags(libc::O_NOFOLLOW | libc::O_NONBLOCK).open(&path).map_err(|_| "unreadable")?;
            if !f.metadata().is_ok_and(|m| m.is_file()) { return Err("gone"); }
            let mut out = std::fs::OpenOptions::new().write(true).create_new(true).mode(0o600).open(&dest).map_err(|_| "noWork")?;
            copy_quarantine(f.as_raw_fd(), out.as_raw_fd());
            let mut buf = vec![0u8; 1 << 20];
            loop {
                if job.stopped() { return Err("stopped"); }
                match f.read(&mut buf) {
                    Ok(0) => break,
                    Ok(n) => out.write_all(&buf[..n]).map_err(|_| "noWork")?,
                    Err(e) if e.kind() == std::io::ErrorKind::Interrupted => {}
                    Err(_) => return Err("unreadable"),
                }
            }
        } else {
            // A pipe, a socket or a device: never copied, and never left out without a word (the zip would be missing it).
            return Err("special");
        }
        if seen.0 > lim.files || seen.1 > lim.bytes { return Err("tooBig"); }
    }
    Ok(())
}

/// Whether an unzip that says it holds `total` bytes has room to be written.
pub fn unzip_room(total: u64, free: Option<u64>) -> Result<(), &'static str> {
    if room_ok(free, total.saturating_add(SPARE)) { Ok(()) } else { Err("noRoom") }
}
/// A flip's two directions swapped, for a picture stored on its side: sips flips the stored pixels, and the Orientation tag
/// it keeps then turns them, so the flip is seen across the other way.
fn swap_flip(c: &Cmd) -> Cmd {
    let mut c = c.clone();
    for a in c.args.iter_mut() {
        if a == "horizontal" { *a = os("vertical"); } else if a == "vertical" { *a = os("horizontal"); }
    }
    c
}
/// The Orientation tag a picture is stored with, as the picture script prints it (sips cannot say: it has no such property).
fn orientation_of(text: &str) -> Option<u32> { text.trim().parse().ok() }
/// The tags that store a picture on its side (a quarter turn, with or without a mirror).
fn on_its_side(tag: u32) -> bool { (5..=8).contains(&tag) }

/// Removes a folder Companion made, whatever modes its folders came with (a read only folder in a zip, or in a folder that
/// was cloned): every folder under it is made ours to change first, without following a link, then it is all removed.
pub fn remove_tree(p: &Path) -> std::io::Result<()> {
    if !std::fs::symlink_metadata(p)?.is_dir() { return std::fs::remove_file(p); }
    own_folders(p)?;
    std::fs::remove_dir_all(p)
}

/// Makes every folder at and under `dir` readable, writable and enterable by us, without following a link, so that it can
/// be changed or removed. Only ever run on what Companion itself made (a copy, a work folder, an unzip).
fn own_folders(dir: &Path) -> std::io::Result<()> {
    use std::os::unix::fs::PermissionsExt;
    let mut todo = vec![dir.to_path_buf()];
    while let Some(d) = todo.pop() {
        let m = std::fs::symlink_metadata(&d)?;
        if !m.is_dir() { continue; }
        let mode = m.permissions().mode();
        if mode & 0o700 != 0o700 { std::fs::set_permissions(&d, std::fs::Permissions::from_mode(mode | 0o700))?; }
        for e in std::fs::read_dir(&d)? { todo.push(e?.path()); }
    }
    Ok(())
}

/// The folder every job's work folder is made in: Companion's own, in the Mac's temporary folder.
pub fn work_root() -> PathBuf { std::env::temp_dir().join("dev.companion.app-convert") }

/// Removes what jobs left in `root` when Companion was ended mid job (a crash, or macOS ending it). Run at launch only,
/// when this copy of Companion holds the one copy lock, so no job of this or another copy is using it. Only a real folder
/// is removed, never through a link. True when something was removed.
pub fn sweep(root: &Path) -> bool {
    match std::fs::symlink_metadata(root) {
        Ok(m) if m.is_dir() => remove_tree(root).is_ok(),
        _ => false,
    }
}

// ---------- the commands ----------

/// One program (an absolute path to a tool macOS ships) and its arguments, never a shell string.
#[derive(Clone, Debug, PartialEq)]
pub struct Cmd { pub program: &'static str, pub args: Vec<OsString>, pub guard: Option<Guard> }
fn cmd(program: &'static str, parts: Vec<OsString>) -> Cmd { Cmd { program, args: parts, guard: None } }
/// A folder a tool writes into that is watched while it runs: the tool is ended at once if what is in it passes the caps or
/// contains a link (or anything that is not a file or a folder). So even a zip that lied about itself cannot fill the disk
/// or plant a link.
#[derive(Clone, Debug, PartialEq)]
pub struct Guard { pub dir: PathBuf, pub limits: Limits }
fn os(s: &str) -> OsString { OsString::from(s) }
fn pth(p: &Path) -> OsString { p.as_os_str().to_os_string() }

/// A trim: from `start` to `end`, in seconds.
#[derive(Clone, Copy, Debug, PartialEq)]
pub struct Trim { pub start: f64, pub end: f64 }
/// At most a day long, starting at or after zero, ending after it starts.
pub fn trim_ok(t: Trim) -> bool { t.start.is_finite() && t.end.is_finite() && t.start >= 0.0 && t.end > t.start && t.end <= 86_400.0 }
fn secs(v: f64) -> String {
    let s = format!("{:.3}", v);
    let s = s.trim_end_matches('0').trim_end_matches('.');
    if s.is_empty() { "0".into() } else { s.to_string() }
}

/// The PDF and printing jobs, through PDFKit and AppKit. One fixed script; what it works on comes as its arguments
/// (`run(argv)`: the job, where to write, then the files). It writes only where it is told: Companion's work folder.
const PDF_SCRIPT: &str = r#"ObjC.import('Quartz'); ObjC.import('AppKit');
function open(p) { var d = $.PDFDocument.alloc.initWithURL($.NSURL.fileURLWithPath(p)); if (!d || d.isNil()) throw new Error('unreadable'); if (d.isLocked) throw new Error('locked'); return d; }
function run(argv) {
  var job = argv[0], out = argv[1];
  if (job === 'merge') {
    var d = $.PDFDocument.alloc.init;
    for (var i = 2; i < argv.length; i++) { var s = open(argv[i]); for (var p = 0; p < s.pageCount; p++) d.insertPageAtIndex(s.pageAtIndex(p).copy, d.pageCount); console.log('step ' + (i - 1) + ' ' + (argv.length - 2)); }
    if (!d.writeToFile(out)) throw new Error('write'); return 'ok';
  }
  if (job === 'split') {
    var s = open(argv[2]);
    for (var p = 0; p < s.pageCount; p++) { var d = $.PDFDocument.alloc.init; d.insertPageAtIndex(s.pageAtIndex(p).copy, 0); if (!d.writeToFile(out + '/page ' + (p + 1) + '.pdf')) throw new Error('write'); console.log('step ' + (p + 1) + ' ' + s.pageCount); }
    return 'ok';
  }
  if (job === 'compress') {
    var s = open(argv[2]);
    var f = $.QuartzFilter.quartzFilterWithURL($.NSURL.fileURLWithPath('/System/Library/Filters/Reduce File Size.qfilter'));
    if (!f || f.isNil()) throw new Error('filter');
    var o = $.NSMutableDictionary.alloc.init; o.setObjectForKey(f, 'QuartzFilter');
    if (!s.writeToURLWithOptions($.NSURL.fileURLWithPath(out), o)) throw new Error('write'); return 'ok';
  }
  if (job === 'images') {
    var s = open(argv[2]);
    for (var p = 0; p < s.pageCount; p++) {
      var pg = s.pageAtIndex(p), b = pg.boundsForBox($.kPDFDisplayBoxMediaBox);
      var img = pg.thumbnailOfSizeForBox($.NSMakeSize(b.size.width * 2, b.size.height * 2), $.kPDFDisplayBoxMediaBox);
      var rep = $.NSBitmapImageRep.imageRepWithData(img.TIFFRepresentation);
      var data = rep.representationUsingTypeProperties($.NSBitmapImageFileTypePNG, $({}));
      if (!data.writeToFileAtomically(out + '/page ' + (p + 1) + '.png', true)) throw new Error('write');
      console.log('step ' + (p + 1) + ' ' + s.pageCount);
    }
    return 'ok';
  }
  if (job === 'fromImages') {
    var d = $.PDFDocument.alloc.init;
    for (var i = 2; i < argv.length; i++) {
      var img = $.NSImage.alloc.initWithContentsOfFile(argv[i]);
      if (!img || img.isNil()) throw new Error('unreadable');
      var pg = $.PDFPage.alloc.initWithImage(img);
      if (!pg || pg.isNil()) throw new Error('unreadable');
      d.insertPageAtIndex(pg, d.pageCount); console.log('step ' + (i - 1) + ' ' + (argv.length - 2));
    }
    if (!d.writeToFile(out)) throw new Error('write'); return 'ok';
  }
  if (job === 'rotate') {
    var s = open(argv[2]), by = parseInt(argv[3], 10);
    for (var p = 0; p < s.pageCount; p++) { var pg = s.pageAtIndex(p); pg.rotation = ((pg.rotation + by) % 360 + 360) % 360; console.log('step ' + (p + 1) + ' ' + s.pageCount); }
    if (!s.writeToFile(out)) throw new Error('write'); return 'ok';
  }
  if (job === 'pages') {
    var s = open(argv[2]), n = s.pageCount, how = argv[3];
    if (n < 2) throw new Error('onePage');
    if (how === 'dropFirst') s.removePageAtIndex(0);
    else if (how === 'dropLast') s.removePageAtIndex(n - 1);
    else if (how === 'keepFirst') { for (var p = n - 1; p >= 1; p--) s.removePageAtIndex(p); }
    else throw new Error('job');
    if (!s.writeToFile(out)) throw new Error('write'); return 'ok';
  }
  if (job === 'text') {
    var s = open(argv[2]), parts = [];
    for (var p = 0; p < s.pageCount; p++) { var t = s.pageAtIndex(p).string; parts.push(t && !t.isNil() ? ObjC.unwrap(t) : ''); console.log('step ' + (p + 1) + ' ' + s.pageCount); }
    var all = parts.join('\n\n');
    if (!all.trim()) throw new Error('noText');
    if (!$(all).writeToFileAtomicallyEncodingError(out, true, $.NSUTF8StringEncoding, null)) throw new Error('write'); return 'ok';
  }
  if (job === 'toPdf') {
    var src = $.NSAttributedString.alloc.initWithURLOptionsDocumentAttributesError($.NSURL.fileURLWithPath(argv[2]), $({}), null, null);
    if (!src || src.isNil()) throw new Error('unreadable');
    var info = $.NSPrintInfo.sharedPrintInfo.copy;
    info.jobDisposition = $.NSPrintSaveJob;
    info.dictionary.setObjectForKey($.NSURL.fileURLWithPath(out), $.NSPrintJobSavingURL);
    info.horizontalPagination = $.NSPrintingPaginationModeFit; info.verticallyCentered = false;
    var tv = $.NSTextView.alloc.initWithFrame($.NSMakeRect(0, 0, info.paperSize.width - info.leftMargin - info.rightMargin, 100));
    tv.textStorage.setAttributedString(src); tv.sizeToFit;
    var op = $.NSPrintOperation.printOperationWithViewPrintInfo(tv, info);
    op.showsPrintPanel = false; op.showsProgressPanel = false;
    if (!op.runOperation) throw new Error('write'); return 'ok';
  }
  throw new Error('job');
}"#;

fn jxa(job: &str, rest: Vec<OsString>) -> Cmd {
    let mut a = vec![os("-l"), os("JavaScript"), os("-e"), os(PDF_SCRIPT), os("--"), os(job)];
    a.extend(rest);
    cmd(OSASCRIPT, a)
}

/// The picture and video jobs, through ImageIO and AVFoundation. One fixed script, like the PDF one: what it works on comes
/// as its arguments (`run(argv)`: the job, where to write, then the file). Details taken off a picture are the place, the
/// camera and its settings, the text a PNG carries (author, description) and any XMP; the way it is turned is kept, so it still looks the same. Keys are written out as their words
/// because JavaScript for Automation does not hand out ImageIO's constants.
const PIC_SCRIPT: &str = r#"ObjC.import('ImageIO'); ObjC.import('Foundation'); ObjC.import('AVFoundation'); ObjC.import('CoreMedia'); ObjC.import('CoreGraphics');
function source(p) { var s = $.CGImageSourceCreateWithURL($.NSURL.fileURLWithPath(p), $()); if (!s || $.CGImageSourceGetCount(s) < 1) throw new Error('unreadable'); return s; }
function put(img, path) {
  var d = $.CGImageDestinationCreateWithURL($.NSURL.fileURLWithPath(path), $('public.png'), 1, $());
  if (!d) throw new Error('write');
  $.CGImageDestinationAddImage(d, img, $());
  if (!$.CGImageDestinationFinalize(d)) throw new Error('write');
}
function run(argv) {
  var job = argv[0], out = argv[1], inp = argv[2];
  if (job === 'strip') {
    var s = source(inp), d = $.CGImageDestinationCreateWithURL($.NSURL.fileURLWithPath(out), $.CGImageSourceGetType(s), 1, $());
    if (!d) throw new Error('write');
    var o = $.NSMutableDictionary.alloc.init;
    o.setObjectForKey($(true), 'kCGImageMetadataShouldExcludeGPS');
    o.setObjectForKey($(true), 'kCGImageMetadataShouldExcludeXMP');
    ['{GPS}', '{TIFF}', '{Exif}', '{ExifAux}', '{IPTC}', '{PNG}', '{MakerApple}', '{MakerCanon}', '{MakerNikon}'].forEach(function (k) { o.setObjectForKey($.NSNull.null, k); });
    $.CGImageDestinationAddImageFromSource(d, s, 0, o);
    if (!$.CGImageDestinationFinalize(d)) throw new Error('write');
    return 'ok';
  }
  if (job === 'orientation') {
    var pr = ObjC.deepUnwrap(ObjC.castRefToObject($.CGImageSourceCopyPropertiesAtIndex(source(inp), 0, $())));
    return String(pr.Orientation || 1);
  }
  if (job === 'thumbs') {
    var s = source(inp), pr = ObjC.deepUnwrap(ObjC.castRefToObject($.CGImageSourceCopyPropertiesAtIndex(s, 0, $())));
    var side = Math.max(pr.PixelWidth || 0, pr.PixelHeight || 0), sizes = [64, 128, 256, 512].filter(function (n) { return n < side; });
    if (!sizes.length) throw new Error('tooSmall');
    sizes.forEach(function (n, i) {
      var o = $.NSMutableDictionary.alloc.init;
      o.setObjectForKey($(true), 'kCGImageSourceCreateThumbnailFromImageAlways');
      o.setObjectForKey($(true), 'kCGImageSourceCreateThumbnailWithTransform');
      o.setObjectForKey($(n), 'kCGImageSourceThumbnailMaxPixelSize');
      var img = $.CGImageSourceCreateThumbnailAtIndex(s, 0, o);
      if (!img) throw new Error('write');
      put(img, out + '/thumbnail ' + n + '.png');
      console.log('step ' + (i + 1) + ' ' + sizes.length);
    });
    return 'ok';
  }
  if (job === 'stillStart' || job === 'stillMiddle') {
    var a = $.NSClassFromString('AVURLAsset').URLAssetWithURLOptions($.NSURL.fileURLWithPath(inp), $());
    if (a.tracksWithMediaType($.AVMediaTypeVideo).count < 1) throw new Error('noFrame');
    var g = $.NSClassFromString('AVAssetImageGenerator').assetImageGeneratorWithAsset(a);
    g.appliesPreferredTrackTransform = true;
    var secs = a.duration.value / a.duration.timescale;
    var t = $.CMTimeMakeWithSeconds(job === 'stillStart' || !isFinite(secs) ? 0 : secs / 2, 600);
    var img = g.copyCGImageAtTimeActualTimeError(t, null, Ref());
    if (!img) throw new Error('noFrame');
    put(img, out);
    return 'ok';
  }
  throw new Error('job');
}"#;

fn jxa_pic(job: &str, rest: Vec<OsString>) -> Cmd {
    let mut a = vec![os("-l"), os("JavaScript"), os("-e"), os(PIC_SCRIPT), os("--"), os(job)];
    a.extend(rest);
    cmd(OSASCRIPT, a)
}

/// Where a tool's result is in the work folder before it is put in place.
#[derive(Clone, Debug, PartialEq)]
pub enum Out { File { tmp: PathBuf, ext: String }, Folder { tmp: PathBuf } }
/// A dropped file a tool reads: where it is, and where Companion's own copy of it goes in the work folder, which is what
/// the tool is given (`take_input`).
#[derive(Clone, Debug, PartialEq)]
pub struct Input { pub from: PathBuf, pub copy: PathBuf, pub real: bool }
/// One result to make: from which original (its name, and the folder it goes next to), every dropped file its tools read
/// (several for a merge), the words in its new name, the commands, and where the result is.
/// `max_side`: a resize, which is skipped for a picture already that small (never made bigger).
/// `shrink`: a compress, which is kept only when it is smaller than the original.
/// `already`: one of several files dropped together that is already in the format asked for; nothing is made from it.
/// `square`: an icon, which is made only from a square picture (nothing is stretched).
/// `stem`: the name the result is built on, when it is not the original's (a zip is "report.txt (zipped).zip").
/// `unzip`: the copy of the zip is read and vetted first, and nothing is extracted from one that could do harm.
/// `flip`: a left to right or top to bottom flip, which is made on the picture as it is seen: for one stored on its side
/// (its Orientation tag) the two are swapped, since sips flips the stored pixels.
#[derive(Clone, Debug, PartialEq)]
pub struct Unit { pub source: PathBuf, pub inputs: Vec<Input>, pub label: &'static str, pub cmds: Vec<Cmd>, pub out: Out, pub max_side: Option<u32>, pub shrink: bool, pub already: bool, pub square: bool, pub stem: Option<String>, pub unzip: bool, pub flip: bool }
impl Unit {
    fn new(source: PathBuf, inputs: Vec<Input>, label: &'static str, cmds: Vec<Cmd>, out: Out) -> Unit {
        Unit { source, inputs, label, cmds, out, max_side: None, shrink: false, already: false, square: false, stem: None, unzip: false, flip: false }
    }
}

/// The extension a result is written with.
fn file_ext(fmt: &str) -> &str { if fmt == "jpeg" { "jpg" } else { fmt } }
fn real_ext(p: &Path) -> String { p.extension().map(|e| e.to_string_lossy().to_lowercase()).unwrap_or_default() }
fn file_name_of(p: &Path) -> String { p.file_name().map(|n| n.to_string_lossy().into_owned()).unwrap_or_else(|| "file".into()) }

/// The names things have inside a zip: their own, and a name used twice gets a number before its ending ("one.txt",
/// "one 2.txt"), so nothing is written over anything.
fn stage_names(paths: &[PathBuf]) -> Vec<String> {
    let mut used: Vec<String> = vec![];
    paths.iter().map(|p| {
        let name = file_name_of(p);
        let (stem, end) = match name.rfind('.') { Some(i) if i > 0 => (name[..i].to_string(), name[i..].to_string()), _ => (name.clone(), String::new()) };
        let mut pick = name.clone();
        let mut n = 2;
        while used.contains(&pick.to_lowercase()) { pick = format!("{stem} {n}{end}"); n += 1; }
        used.push(pick.to_lowercase());
        pick
    }).collect()
}

/// The work for one action on these files. Refused unless the files are offered that action (`offer`; what this Mac can
/// write is checked against the menu by the shell), and a trim needs good times. Every tool reads Companion's own copy of
/// a dropped file, in the work folder (`Input`), never the file where it is.
pub fn plan(action: &str, inputs: &[PathBuf], work: &Path, prefs: &Prefs, trim: Option<Trim>) -> Result<Vec<Unit>, &'static str> {
    let Offer::Actions(kind, offered) = offer(inputs, &Caps::all(), prefs) else { return Err("notOffered") };
    if !offered.contains(&action) { return Err("notOffered"); }
    if action == "trim" && !trim.is_some_and(trim_ok) { return Err("badTrim"); }
    // The copy keeps the file's own extension, which is how the tools tell what kind of file it is.
    let copy_of = |dir: &Path, name: &str, p: &Path| Input { from: p.to_path_buf(), copy: dir.join(format!("{name}.{}", real_ext(p))), real: false };
    if action == "merge" || action == "imagesToPdf" {
        let dir = work.join("0");
        let out = dir.join("out.pdf");
        let ins: Vec<Input> = inputs.iter().enumerate().map(|(k, p)| copy_of(&dir, &format!("in {}", k + 1), p)).collect();
        let mut rest = vec![pth(&out)];
        rest.extend(ins.iter().map(|i| pth(&i.copy)));
        let (job, label) = if action == "merge" { ("merge", "merged") } else { ("fromImages", "merged") };
        return Ok(vec![Unit::new(inputs[0].clone(), ins, label, vec![jxa(job, rest)], Out::File { tmp: out, ext: "pdf".into() })]);
    }
    // Zipping: every file or folder is copied under its own name into a folder of its own, and ditto zips that folder.
    let zip_unit = |paths: &[PathBuf], dir: &Path| {
        let (stage, out) = (dir.join("stage"), dir.join("out.zip"));
        let names = stage_names(paths);
        let ins: Vec<Input> = paths.iter().zip(&names).map(|(p, n)| Input { from: p.clone(), copy: stage.join(n), real: true }).collect();
        let c = cmd(DITTO, vec![os("-c"), os("-k"), os("--norsrc"), os("--noextattr"), os("--noacl"), pth(&stage), pth(&out)]);
        let stem = if paths.len() == 1 { names[0].clone() } else { format!("{} and {} more", names[0], paths.len() - 1) };
        Unit { stem: Some(stem), ..Unit::new(paths[0].clone(), ins, "zipped", vec![c], Out::File { tmp: out, ext: "zip".into() }) }
    };
    if action == "zipTogether" { return Ok(vec![zip_unit(inputs, &work.join("0"))]); }
    let mut units = vec![];
    for (i, input) in inputs.iter().enumerate() {
        let dir = work.join(i.to_string());
        if action == "zip" { units.push(zip_unit(std::slice::from_ref(input), &dir)); continue; }
        let take = copy_of(&dir, "in", input);
        let src = take.copy.clone();
        let file = |ext: &str| dir.join(format!("out.{ext}"));
        let ext = ext_of(input);
        let unit = |label: &'static str, cmds: Vec<Cmd>, out: PathBuf| {
            let e = out.extension().map(|e| e.to_string_lossy().into_owned()).unwrap_or_default();
            Unit::new(input.clone(), vec![take.clone()], label, cmds, Out::File { tmp: out, ext: e })
        };
        // To a format: one of several files dropped together may already be in it, and is then left as it is.
        let convert = |fmt: &str, cmds: Vec<Cmd>, out: PathBuf| {
            let u = unit("converted", cmds, out);
            if ext == fmt { Unit { cmds: vec![], already: true, ..u } } else { u }
        };
        let folder = |label: &'static str, cmds: Vec<Cmd>| {
            let out = dir.join("out");
            Unit::new(input.clone(), vec![take.clone()], label, cmds, Out::Folder { tmp: out })
        };
        // A picture changed in place: its own format when sips writes it, else a PNG.
        let sips_edit = |label: &'static str, first: Vec<OsString>, keeps: &[&str]| {
            let keep = keeps.contains(&ext.as_str());
            let out = file(if keep { file_ext(&ext) } else { "png" });
            let mut a = first;
            if !keep { a.extend([os("-s"), os("format"), os("png")]); }
            a.extend([pth(&src), os("--out"), pth(&out)]);
            unit(label, vec![cmd(SIPS, a)], out)
        };
        // textutil: always without loading what a page points at; a markdown file is read as plain text, whatever it says.
        let tu = |tail: Vec<OsString>| {
            let mut a = vec![os("-noload")];
            if ext == "md" { a.extend([os("-format"), os("txt")]); }
            a.extend(tail);
            cmd(TEXTUTIL, a)
        };
        let afc = |file_type: &str, data: &str, more: Vec<OsString>, out: &Path| {
            let mut a = vec![os("-f"), os(file_type), os("-d"), os(data)];
            a.extend(more);
            a.extend([pth(&src), pth(out)]);
            cmd(AFCONVERT, a)
        };
        let u = match (kind, action) {
            (Kind::Image, a) if IMAGE_TO.iter().any(|(_, x)| *x == a) => {
                let fmt = IMAGE_TO.iter().find(|(_, x)| *x == a).map(|(f, _)| *f).unwrap_or("png");
                let out = file(file_ext(fmt));
                convert(fmt, vec![cmd(SIPS, vec![os("-s"), os("format"), os(fmt), pth(&src), os("--out"), pth(&out)])], out)
            }
            (Kind::Image, a @ ("toIcns" | "toIco")) => {
                // An icon is a square picture at a size the icon formats take; one that is not square is refused first.
                let (fmt, side) = if a == "toIcns" { ("icns", "512") } else { ("ico", "256") };
                let out = file(fmt);
                Unit { square: true, ..convert(fmt, vec![cmd(SIPS, vec![os("-s"), os("format"), os(fmt), os("-z"), os(side), os(side), pth(&src), os("--out"), pth(&out)])], out) }
            }
            (Kind::Image, "resize") => Unit { max_side: Some(prefs.resize), ..sips_edit("resized", vec![os("-Z"), os(&prefs.resize.to_string())], SIPS_KEEPS) },
            (Kind::Image, a @ ("turnRight" | "turnLeft" | "turnAround")) => {
                let deg = match a { "turnRight" => "90", "turnLeft" => "270", _ => "180" };
                sips_edit("turned", vec![os("-r"), os(deg)], SIPS_KEEPS)
            }
            (Kind::Image, a @ ("flipHorizontal" | "flipVertical")) => Unit { flip: true, ..sips_edit("flipped", vec![os("-f"), os(if a == "flipHorizontal" { "horizontal" } else { "vertical" })], SIPS_KEEPS) },
            (Kind::Image, "grayscale") => sips_edit("gray", vec![os("-m"), os(GRAY_PROFILE)], GRAY_KEEPS),
            (Kind::Image, "compress") => {
                let fmt = if ext == "heic" { "heic" } else { "jpeg" };
                let out = file(file_ext(fmt));
                Unit { shrink: true, ..unit("smaller", vec![cmd(SIPS, vec![os("-s"), os("format"), os(fmt), os("-s"), os("formatOptions"), os(&prefs.quality.to_string()), pth(&src), os("--out"), pth(&out)])], out) }
            }
            (Kind::Image, "stripInfo") => { let out = file(file_ext(&ext)); unit("cleaned", vec![jxa_pic("strip", vec![pth(&out), pth(&src)])], out) }
            (Kind::Image, "thumbnails") => { let out = dir.join("out"); folder("thumbnails", vec![jxa_pic("thumbs", vec![pth(&out), pth(&src)])]) }
            (Kind::Image, "imageToPdf") => { let out = file("pdf"); unit("converted", vec![jxa("fromImages", vec![pth(&out), pth(&src)])], out) }
            (Kind::Pdf, "split") => { let out = dir.join("out"); folder("pages", vec![jxa("split", vec![pth(&out), pth(&src)])]) }
            (Kind::Pdf, "pagesToImages") => { let out = dir.join("out"); folder("page images", vec![jxa("images", vec![pth(&out), pth(&src)])]) }
            (Kind::Pdf, "pdfCompress") => { let out = file("pdf"); Unit { shrink: true, ..unit("smaller", vec![jxa("compress", vec![pth(&out), pth(&src)])], out) } }
            (Kind::Pdf, a @ ("turnRight" | "turnLeft" | "turnAround")) => {
                let deg = match a { "turnRight" => "90", "turnLeft" => "270", _ => "180" };
                let out = file("pdf");
                unit("turned", vec![jxa("rotate", vec![pth(&out), pth(&src), os(deg)])], out)
            }
            (Kind::Pdf, a @ ("dropFirstPage" | "dropLastPage" | "keepFirstPage")) => {
                let (how, label) = match a { "dropFirstPage" => ("dropFirst", "without first page"), "dropLastPage" => ("dropLast", "without last page"), _ => ("keepFirst", "first page") };
                let out = file("pdf");
                unit(label, vec![jxa("pages", vec![pth(&out), pth(&src), os(how)])], out)
            }
            (Kind::Pdf, "pdfText") => { let out = file("txt"); unit("text", vec![jxa("text", vec![pth(&out), pth(&src)])], out) }
            (Kind::Document, "toPdf") => {
                // Through plain RTF, never RTFD: the Mac's reader takes any web page (also one saved as .doc, .docx or
                // .odt) and would copy into an RTFD the pictures it points at elsewhere on this Mac, which would then be
                // printed into the PDF. RTF keeps the words and their look, and no pictures.
                let mid = dir.join("mid.rtf");
                let out = file("pdf");
                unit("converted", vec![
                    tu(vec![os("-convert"), os("rtf"), os("-output"), pth(&mid), os("--"), pth(&src)]),
                    jxa("toPdf", vec![pth(&out), pth(&mid)]),
                ], out)
            }
            (Kind::Document, "toText") => {
                let out = file("txt");
                convert("txt", vec![tu(vec![os("-convert"), os("txt"), os("-encoding"), os("UTF-8"), os("-output"), pth(&out), os("--"), pth(&src)])], out)
            }
            (Kind::Document, "toHtml") => {
                let out = file("html");
                convert("html", vec![tu(vec![os("-nostore"), os("-convert"), os("html"), os("-output"), pth(&out), os("--"), pth(&src)])], out)
            }
            (Kind::Document, a @ ("toDocx" | "toRtf" | "toDoc" | "toOdt" | "toWordml")) => {
                let (fmt, end) = match a { "toDocx" => ("docx", "docx"), "toRtf" => ("rtf", "rtf"), "toDoc" => ("doc", "doc"), "toOdt" => ("odt", "odt"), _ => ("wordml", "xml") };
                let out = file(end);
                convert(end, vec![tu(vec![os("-convert"), os(fmt), os("-output"), pth(&out), os("--"), pth(&src)])], out)
            }
            (Kind::Audio, a @ ("toM4a" | "toWav" | "toAiff" | "toAlac" | "toCaf" | "toFlac" | "toAac")) => {
                let name = AUDIO_TO.iter().find(|(_, x)| *x == a).map(|(f, _)| *f).unwrap_or("m4a");
                let (_, file_type, data) = AUDIO_PAIRS.iter().find(|(n, _, _)| *n == name).copied().unwrap_or(("m4a", "m4af", "aac"));
                let end = if name == "alac" { "m4a" } else { name };
                let out = file(end);
                convert(end, vec![afc(file_type, data, vec![], &out)], out)
            }
            (Kind::Audio, a @ ("mono" | "stereo" | "sampleRate")) => {
                // The sound's own format when the Mac writes it, else an M4A. A rate rides on the data format ("aac@16000").
                let (file_type, data, end) = keep_audio(&ext);
                let out = file(end);
                let (label, data, more): (&'static str, String, Vec<OsString>) = match a {
                    "mono" => ("mono", data.into(), vec![os("-c"), os("1")]),
                    "stereo" => ("stereo", data.into(), vec![os("-c"), os("2")]),
                    _ => ("resampled", format!("{data}@{}", prefs.rate), vec![]),
                };
                unit(label, vec![afc(file_type, &data, more, &out)], out)
            }
            (Kind::Video, a @ ("toMp4" | "toMov" | "toM4v")) => {
                let fmt = match a { "toMp4" => "mp4", "toMov" => "mov", _ => "m4v" };
                let out = file(fmt);
                convert(fmt, vec![avconvert(&src, &out, "PresetHighestQuality", None)], out)
            }
            (Kind::Video, "toHevc") => {
                // Its label promises a smaller video, and the best quality HEVC of a video that is already small can come out
                // bigger: then nothing is made.
                let out = file("mp4");
                Unit { shrink: true, ..unit("converted", vec![avconvert(&src, &out, "PresetHEVCHighestQuality", None)], out) }
            }
            (Kind::Video, a @ ("video480" | "video720" | "video1080")) => {
                // A size choice that does not make the file smaller makes nothing.
                let preset = match a { "video480" => "Preset640x480", "video720" => "Preset1280x720", _ => "Preset1920x1080" };
                let out = file("mp4");
                Unit { shrink: true, ..unit("smaller", vec![avconvert(&src, &out, preset, None)], out) }
            }
            (Kind::Video, "soundOnly") => { let out = file("m4a"); unit("sound", vec![avconvert(&src, &out, "PresetAppleM4A", None)], out) }
            (Kind::Video, a @ ("stillStart" | "stillMiddle")) => { let out = file("png"); unit("still", vec![jxa_pic(a, vec![pth(&out), pth(&src)])], out) }
            (Kind::Audio | Kind::Video, "trim") => {
                let (out, preset) = if kind == Kind::Audio { (file("m4a"), "PresetAppleM4A") } else { (file(&real_ext(input)), "PresetHighestQuality") };
                unit("trimmed", vec![avconvert(&src, &out, preset, trim)], out)
            }
            (Kind::Archive, "unzip") => {
                // ditto -x with --qtn gives what comes out the zip's own "downloaded from the internet" mark. The folder it
                // writes is watched while it runs; the zip was read first (`zip_vet`).
                let out = dir.join("out");
                let c = Cmd { guard: Some(Guard { dir: out.clone(), limits: UNZIP_LIMITS }), ..cmd(DITTO, vec![os("-x"), os("-k"), os("--qtn"), os("--norsrc"), os("--noacl"), pth(&src), pth(&out)]) };
                Unit { unzip: true, inputs: vec![Input { real: true, ..take.clone() }], ..folder("unzipped", vec![c]) }
            }
            _ => return Err("notOffered"),
        };
        units.push(u);
    }
    Ok(units)
}

fn avconvert(input: &Path, out: &Path, preset: &str, trim: Option<Trim>) -> Cmd {
    let mut a = vec![os("--source"), pth(input), os("--output"), pth(out), os("--preset"), os(preset), os("--progress")];
    if let Some(t) = trim { a.extend([os("--start"), os(&secs(t.start)), os("--duration"), os(&secs(t.end - t.start))]); }
    cmd(AVCONVERT, a)
}

// ---------- reading a zip before it is extracted ----------

fn le16(b: &[u8]) -> u16 { u16::from_le_bytes([b[0], b[1]]) }
fn le32(b: &[u8]) -> u32 { u32::from_le_bytes([b[0], b[1], b[2], b[3]]) }
/// The biggest central directory read (a zip says how big its own list of files is).
const CD_MAX: u64 = 64 << 20;

/// A name in a zip that is safe to extract: not empty, no NUL, not absolute (also with a backslash or a drive letter), and
/// no part of it is "..". A dot inside a name ("my..file") is not a way out.
fn zip_name_ok(name: &[u8]) -> bool {
    if name.is_empty() || name.contains(&0) || name[0] == b'/' || name[0] == b'\\' { return false; }
    if name.len() > 1 && name[1] == b':' && name[0].is_ascii_alphabetic() { return false; }
    !name.split(|c| *c == b'/' || *c == b'\\').any(|part| part == b"..")
}

/// One file of a zip as its list says: its name, where its own header is, how many bytes it takes and its flags.
struct ZipEntry { name: Vec<u8>, local: u32, csize: u32, size: u32 }
/// A zip's files, and where its list starts.
struct ZipList { entries: Vec<ZipEntry>, cd_at: u64 }

/// A zip's list of files (its central directory), each as a `ZipEntry`. Everything here is read from the list
/// alone, so nothing has been extracted: refused as not a zip ("notZip", also an empty one), too big by what it says
/// ("tooBig": too many files, too many bytes once opened, or sizes in the zip64 form, which are not read at all), with a
/// password ("zipLocked"), or holding a link, any other kind of thing than a file or a folder, or a name that leads out of
/// the folder it is extracted into ("unsafeZip").
fn zip_read<R: Read + std::io::Seek>(r: &mut R, lim: Limits) -> Result<ZipList, &'static str> {
    use std::io::SeekFrom;
    let bad = |_| "notZip";
    let len = r.seek(SeekFrom::End(0)).map_err(bad)?;
    if len < 22 { return Err("notZip"); }
    let tail_len = len.min(22 + 65_535);
    r.seek(SeekFrom::Start(len - tail_len)).map_err(bad)?;
    let mut tail = vec![0u8; tail_len as usize];
    r.read_exact(&mut tail).map_err(bad)?;
    // The end record is the last 22 bytes plus a comment; its comment length has to reach exactly the end of the file.
    let at = (0..=tail.len() - 22).rev().find(|&i| le32(&tail[i..]) == 0x0605_4b50 && i + 22 + le16(&tail[i + 20..]) as usize == tail.len()).ok_or("notZip")?;
    let end = &tail[at..];
    let (disk, cd_disk, count, cd_size, cd_off) = (le16(&end[4..]), le16(&end[6..]), le16(&end[10..]) as u64, le32(&end[12..]), le32(&end[16..]));
    if disk != 0 || cd_disk != 0 { return Err("notZip"); }
    if count == 0xFFFF || cd_size == u32::MAX || cd_off == u32::MAX { return Err("tooBig"); }
    if count > lim.files || cd_size as u64 > CD_MAX { return Err("tooBig"); }
    if count == 0 { return Err("notZip"); }
    let end_at = len - tail_len + at as u64;
    // The list has to end exactly where the end record starts, with nothing between: the end record is how it is found.
    if cd_off as u64 + cd_size as u64 != end_at { return Err("notZip"); }
    r.seek(SeekFrom::Start(cd_off as u64)).map_err(bad)?;
    let mut cd = vec![0u8; cd_size as usize];
    r.read_exact(&mut cd).map_err(bad)?;
    let (mut pos, mut total, mut out) = (0usize, 0u64, vec![]);
    for _ in 0..count {
        if pos + 46 > cd.len() || le32(&cd[pos..]) != 0x0201_4b50 { return Err("notZip"); }
        let e = &cd[pos..];
        let (flags, csize, usize_, nlen, xlen, clen, attrs, local) = (le16(&e[8..]), le32(&e[20..]), le32(&e[24..]), le16(&e[28..]) as usize, le16(&e[30..]) as usize, le16(&e[32..]) as usize, le32(&e[38..]), le32(&e[42..]));
        if pos + 46 + nlen + xlen + clen > cd.len() { return Err("notZip"); }
        let name = cd[pos + 46..pos + 46 + nlen].to_vec();
        if flags & 0x41 != 0 { return Err("zipLocked"); }
        if csize == u32::MAX || usize_ == u32::MAX { return Err("tooBig"); }
        if !zip_name_ok(&name) { return Err("unsafeZip"); }
        // The top of the attributes is the file's mode, and ditto reads it whatever system the zip says it was made on
        // (a link in a zip said to be made on Windows is still made as a link): only files and folders are allowed.
        let kind = (attrs >> 16) & 0o170000;
        if kind != 0 && kind != 0o100000 && kind != 0o040000 { return Err("unsafeZip"); }
        total += usize_ as u64;
        if total > lim.bytes { return Err("tooBig"); }
        out.push(ZipEntry { name, local, csize, size: usize_ });
        pos += 46 + nlen + xlen + clen;
    }
    Ok(ZipList { entries: out, cd_at: cd_off as u64 })
}

/// `zip_read`, for anything that can be read and sought in. Nothing but the zip's list is read.
pub fn zip_vet_reader<R: Read + std::io::Seek>(r: &mut R, lim: Limits) -> Result<(), &'static str> { zip_read(r, lim).map(|_| ()) }

/// A zip on disk, vetted: its list as above, and also the file itself. ditto does not use the list: it reads each file's
/// own header one after another. So the pieces have to follow each other exactly, from the first byte to the start of the
/// list, each with the name the list gives it and the size the list gives it, with nothing in between and nothing the list
/// does not name. Gives what the zip says it holds, in bytes.
pub fn zip_vet(path: &Path, lim: Limits) -> Result<u64, &'static str> {
    use std::io::{Seek, SeekFrom};
    let mut f = std::fs::File::open(path).map_err(|_| "unreadable")?;
    let ZipList { mut entries, cd_at } = zip_read(&mut f, lim)?;
    entries.sort_by_key(|e| e.local);
    let mut at = 0u64;
    let mut total = 0u64;
    for e in &entries {
        if e.local as u64 != at { return Err("notZip"); }
        f.seek(SeekFrom::Start(at)).map_err(|_| "notZip")?;
        let mut head = [0u8; 30];
        f.read_exact(&mut head).map_err(|_| "notZip")?;
        if le32(&head) != 0x0403_4b50 { return Err("notZip"); }
        let (flags, csize, nlen, xlen) = (le16(&head[6..]), le32(&head[18..]), le16(&head[26..]) as usize, le16(&head[28..]) as u64);
        let mut own = vec![0u8; nlen];
        f.read_exact(&mut own).map_err(|_| "notZip")?;
        if own != e.name { return Err("unsafeZip"); }
        let mut end = at + 30 + nlen as u64 + xlen + e.csize as u64;
        if flags & 8 == 0 {
            // The sizes are in the header itself: they have to be the list's.
            if csize != e.csize { return Err("notZip"); }
        } else {
            // The sizes follow the data, with or without the mark that says so: the size in it has to be the list's.
            f.seek(SeekFrom::Start(end)).map_err(|_| "notZip")?;
            let mut d = [0u8; 16];
            let got = f.read(&mut d).map_err(|_| "notZip")?;
            let (skip, size_at) = if got >= 4 && le32(&d) == 0x0807_4b50 { (16, 8) } else { (12, 4) };
            if got < skip || le32(&d[size_at..]) != e.csize { return Err("notZip"); }
            end += skip as u64;
        }
        if end > cd_at { return Err("notZip"); }
        total += e.size as u64;
        at = end;
    }
    if at != cd_at { return Err("notZip"); }
    Ok(total)
}

// ---------- progress ----------

/// The last percentage avconvert printed ("avconvert progress:  42.50% complete").
pub fn avconvert_percent(text: &str) -> Option<f64> {
    text.rsplit("progress:").filter(|seg| seg.contains('%')).find_map(|seg| seg.trim_start().split('%').next()?.trim().parse::<f64>().ok())
        .filter(|p| p.is_finite() && (0.0..=100.0).contains(p))
}
/// The PDF script's "step 3 10" (page or file 3 of 10).
pub fn jxa_step(line: &str) -> Option<(u32, u32)> {
    let t: Vec<&str> = line.split_whitespace().collect();
    if t.len() != 3 || t[0] != "step" { return None; }
    Some((t[1].parse().ok()?, t[2].parse().ok()?))
}
/// A picture's size from `sips -g pixelWidth -g pixelHeight`.
pub fn sips_size(text: &str) -> Option<(u32, u32)> {
    let get = |k: &str| text.lines().find_map(|l| l.trim().strip_prefix(k).and_then(|v| v.trim().parse::<u32>().ok()));
    Some((get("pixelWidth:")?, get("pixelHeight:")?))
}

// ---------- running a job ----------

/// One job at a time. Stop everything (and the menu's own Stop) sets `stop`; the tool is ended within a moment. `run`
/// says when the job has ended (its tool gone, its work folder removed), which quitting waits for (`wait_ended`).
#[derive(Default)]
pub struct Job { stop: AtomicBool, ended: Mutex<bool>, ended_now: Condvar }
impl Job {
    pub fn stop(&self) { self.stop.store(true, Ordering::SeqCst); }
    pub fn stopped(&self) -> bool { self.stop.load(Ordering::SeqCst) }
    fn end(&self) {
        *self.ended.lock().unwrap_or_else(|e| e.into_inner()) = true;
        self.ended_now.notify_all();
    }
    /// Waits at most `max` for the job to end. True when it has.
    pub fn wait_ended(&self, max: Duration) -> bool {
        let g = self.ended.lock().unwrap_or_else(|e| e.into_inner());
        let (g, _) = self.ended_now.wait_timeout_while(g, max, |ended| !*ended).unwrap_or_else(|e| e.into_inner());
        *g
    }
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Failure { Stopped, Failed(&'static str) }

/// How far a job is: results done of all, and the running tool's own percentage when it says one.
pub type Tell<'a> = &'a dyn Fn(usize, usize, Option<f64>);

/// Ends a tool and everything it started: each tool runs in a process group of its own, which is ended whole, so no
/// helper it started can keep working (or keep its output open) after Stop.
fn end_tool(child: &mut std::process::Child) {
    // The tool is not yet waited for, so its number still names its group and nothing else.
    unsafe { libc::killpg(child.id() as libc::pid_t, libc::SIGKILL); }
    let _ = child.kill();
    let _ = child.wait();
}

/// Runs one program to its end, or ends it when the job is stopped. Its own output is read only for progress and for
/// the reason it failed; nothing it prints is kept. The program gets a plain environment: no key or token of
/// Companion's ever reaches it.
fn exec(c: &Cmd, job: &Job, on_text: &dyn Fn(&str)) -> Result<String, Failure> {
    use std::os::unix::process::CommandExt;
    use std::process::{Command, Stdio};
    let home = std::env::var_os("HOME").unwrap_or_default();
    let mut child = Command::new(c.program).args(&c.args).env_clear()
        .env("PATH", "/usr/bin:/bin:/usr/sbin:/sbin").env("HOME", home).env("TMPDIR", std::env::temp_dir()).env("LANG", "en_US.UTF-8")
        .process_group(0)
        .stdin(Stdio::null()).stdout(Stdio::piped()).stderr(Stdio::piped()).spawn().map_err(|_| Failure::Failed("toolMissing"))?;
    let (tx, rx) = std::sync::mpsc::channel::<String>();
    let mut readers = vec![];
    let pipes: Vec<Box<dyn Read + Send>> = [child.stdout.take().map(|p| Box::new(p) as Box<dyn Read + Send>), child.stderr.take().map(|p| Box::new(p) as Box<dyn Read + Send>)].into_iter().flatten().collect();
    for mut pipe in pipes {
        let tx = tx.clone();
        readers.push(std::thread::spawn(move || {
            let mut buf = [0u8; 4096];
            while let Ok(n) = pipe.read(&mut buf) { if n == 0 || tx.send(String::from_utf8_lossy(&buf[..n]).into_owned()).is_err() { break; } }
        }));
    }
    drop(tx);
    let mut seen = String::new();
    let take = |seen: &mut String| { for t in rx.try_iter() { on_text(&t); if seen.len() < 16_384 { seen.push_str(&t); } } };
    // The folder a guarded tool writes into is looked at a few times a second (a walk of it is not free).
    let guarded = |c: &Cmd| c.guard.as_ref().map(|g| tree_stats(&g.dir, g.limits, false)).and_then(Result::err);
    let mut last_look = std::time::Instant::now();
    let status = loop {
        take(&mut seen);
        if job.stopped() { end_tool(&mut child); for r in readers { let _ = r.join(); } return Err(Failure::Stopped); }
        if last_look.elapsed() >= Duration::from_millis(200) {
            last_look = std::time::Instant::now();
            if let Some(why) = guarded(c) { end_tool(&mut child); for r in readers { let _ = r.join(); } return Err(Failure::Failed(why)); }
        }
        match child.try_wait() {
            Ok(Some(s)) => break s,
            Ok(None) => std::thread::sleep(Duration::from_millis(50)),
            Err(_) => { end_tool(&mut child); return Err(Failure::Failed("toolFailed")); }
        }
    };
    for r in readers { let _ = r.join(); }
    take(&mut seen);
    // A last look, for what a tool did in its final moments.
    if let Some(why) = guarded(c) { return Err(Failure::Failed(why)); }
    if status.success() { return Ok(seen); }
    // The reasons the fixed scripts give for themselves: what is wrong with this file, not with the Mac.
    let why = ["locked", "unreadable", "noText", "onePage", "noFrame", "tooSmall"].into_iter().find(|w| seen.contains(&format!("Error: {w}"))).unwrap_or("toolFailed");
    Err(Failure::Failed(why))
}

fn interrupted() -> std::io::Error { std::io::Error::from(std::io::ErrorKind::Interrupted) }

/// Makes a new file with `src`'s bytes at `dst`, failing (AlreadyExists) rather than replacing anything there: a hard
/// link when both are on one disk, else a copy into a file created new. A copy (to another disk, which can take a while
/// for a video) stops when the job is stopped.
fn link_or_copy_new(src: &Path, dst: &Path, job: &Job) -> std::io::Result<()> {
    match std::fs::hard_link(src, dst) {
        Ok(()) => Ok(()),
        Err(e) if e.kind() == std::io::ErrorKind::AlreadyExists => Err(e),
        Err(_) => {
            use std::os::fd::AsRawFd;
            let mut to = std::fs::OpenOptions::new().write(true).create_new(true).open(dst)?;
            let r = std::fs::File::open(src).and_then(|mut from| {
                // What was unzipped keeps its mark when it has to be copied to another disk.
                copy_quarantine(from.as_raw_fd(), to.as_raw_fd());
                let mut buf = vec![0u8; 1 << 20];
                loop {
                    if job.stopped() { return Err(interrupted()); }
                    let n = from.read(&mut buf)?;
                    if n == 0 { return Ok(()); }
                    to.write_all(&buf[..n])?;
                }
            });
            // A copy that failed or was stopped half way is our own new file: it is taken away, never left half made.
            if let Err(e) = r { drop(to); let _ = std::fs::remove_file(dst); return Err(e); }
            Ok(())
        }
    }
}

/// Puts a finished result in `dir` under the first free name. A name taken between looking and writing is never written
/// over: the next free one is tried. A folder result (split, pages to pictures) is a new folder filled page by page; if
/// a page cannot go in, or the job is stopped meanwhile, that folder (made just now, Companion's own) is taken away with
/// what was put in it, so a half filled folder is never left. Stopped: an error of kind Interrupted.
pub fn place(out: &Out, dir: &Path, stem: &str, label: &str, job: &Job) -> std::io::Result<PathBuf> {
    let exists = |p: &Path| std::fs::symlink_metadata(p).is_ok();
    let none = || std::io::Error::other("no free name");
    for _ in 0..50 {
        match out {
            Out::File { tmp, ext } => {
                let dest = free_name(dir, stem, label, Some(ext), exists).ok_or_else(none)?;
                match link_or_copy_new(tmp, &dest, job) {
                    Ok(()) => return Ok(dest),
                    Err(e) if e.kind() == std::io::ErrorKind::AlreadyExists => continue,
                    Err(e) => return Err(e),
                }
            }
            Out::Folder { tmp } => {
                let dest = free_name(dir, stem, label, None, exists).ok_or_else(none)?;
                match std::fs::create_dir(&dest) {
                    Ok(()) => {}
                    Err(e) if e.kind() == std::io::ErrorKind::AlreadyExists => continue,
                    Err(e) => return Err(e),
                }
                if let Err(e) = put_tree(tmp, &dest, job) { let _ = remove_tree(&dest); return Err(e); }
                return Ok(dest);
            }
        }
    }
    Err(none())
}
/// Fills a new folder from a finished one, folders and all, in order (pages by their number). A link, or anything that is
/// not a file or a folder, is never put in place.
fn put_tree(src: &Path, dst: &Path, job: &Job) -> std::io::Result<()> {
    let mut items: Vec<PathBuf> = std::fs::read_dir(src)?.filter_map(|e| e.ok().map(|e| e.path())).collect();
    items.sort_by(|a, b| (page_number(a), a.file_name()).cmp(&(page_number(b), b.file_name())));
    for item in items {
        if job.stopped() { return Err(interrupted()); }
        let Some(name) = item.file_name() else { continue };
        let to = dst.join(name);
        let t = std::fs::symlink_metadata(&item)?.file_type();
        if t.is_dir() { std::fs::create_dir(&to)?; put_tree(&item, &to, job)?; }
        else if t.is_file() { link_or_copy_new(&item, &to, job)?; }
        else { return Err(std::io::Error::other("not a file")); }
    }
    Ok(())
}
fn page_number(p: &Path) -> u32 { p.file_stem().and_then(|s| s.to_string_lossy().rsplit(' ').next().and_then(|n| n.parse().ok())).unwrap_or(0) }

fn made_something(out: &Out) -> bool {
    match out {
        Out::File { tmp, .. } => std::fs::metadata(tmp).map(|m| m.is_file() && m.len() > 0).unwrap_or(false),
        Out::Folder { tmp } => std::fs::read_dir(tmp).map(|mut d| d.next().is_some()).unwrap_or(false),
    }
}

/// Whether a compressed result is smaller than the file it was made from (a picture already saved small, or a PDF of
/// words only, can come out bigger).
fn smaller(out: &Out, than: &Path) -> bool {
    match out {
        Out::File { tmp, .. } => match (std::fs::metadata(tmp), std::fs::metadata(than)) { (Ok(a), Ok(b)) => a.len() < b.len(), _ => false },
        Out::Folder { .. } => true,
    }
}

/// How a job ended: what was made, in order; how many files were left as they were (already that small, already in that
/// format, or not made any smaller); how many could not be converted (one bad file does not stop the others), with the
/// name and the reason of the first; and why it ended early, if it did. What was made before a Stop or a failure is
/// listed too: it is new, replaces nothing, and stays.
#[derive(Debug, Default, PartialEq)]
pub struct Ended { pub made: Vec<PathBuf>, pub skipped: usize, pub failed: usize, pub first_failed: Option<(String, &'static str)>, pub fail: Option<Failure> }

/// Runs every unit in order, each result put in its place as soon as it is made (`dest` says where each goes). One file
/// that cannot be converted is counted and the next is tried; only a problem of the whole job (a Stop, no place to save,
/// no room to work) ends it early. A unit's own work folder is removed as soon as it is done, so a long job never piles
/// up copies of every file. The whole work folder is removed at the end either way, and only then is the job said to have
/// ended. When nothing was made and a file failed, the job failed for that file's reason.
pub fn run(units: &[Unit], work: &Path, dest: &dyn Fn(&Unit) -> Option<PathBuf>, job: &Job, tell: Tell) -> Ended {
    let mut e = Ended::default();
    let mut why = "alreadySmall";
    let fail = run_units(units, work, dest, job, tell, &mut e, &mut why);
    let _ = remove_tree(work);
    e.fail = fail.or_else(|| {
        if !e.made.is_empty() { return None; }
        if let Some((_, w)) = e.first_failed { return Some(Failure::Failed(w)); }
        (e.skipped > 0).then_some(Failure::Failed(why))
    });
    job.end();
    e
}

/// How one unit went: on to the next, a file that could not be converted (the reason), or the whole job ends.
enum Flow { Next, Bad(&'static str), End(Failure) }
/// A failure of one file goes on to the next file; a Stop, or a lack of a place or room to work, ends the job.
fn per_file(f: Failure) -> Flow {
    match f { Failure::Failed(w) if !matches!(w, "noWork" | "noPlace" | "toolMissing") => Flow::Bad(w), f => Flow::End(f) }
}

fn run_units(units: &[Unit], work: &Path, dest: &dyn Fn(&Unit) -> Option<PathBuf>, job: &Job, tell: Tell, e: &mut Ended, why: &mut &'static str) -> Option<Failure> {
    let of = units.len();
    for (i, u) in units.iter().enumerate() {
        if job.stopped() { return Some(Failure::Stopped); }
        tell(i, of, None);
        let flow = one_unit(u, i, of, dest, job, tell, e, why);
        // This unit's copy of the input and its output are not needed any more.
        let dir = match &u.out { Out::File { tmp, .. } | Out::Folder { tmp } => tmp.parent() };
        if let Some(d) = dir { if d != work && d.starts_with(work) { let _ = remove_tree(d); } }
        match flow {
            Flow::Next => tell(i + 1, of, None),
            Flow::Bad(w) => {
                e.failed += 1;
                if e.first_failed.is_none() { e.first_failed = Some((u.source.file_name().map(|n| n.to_string_lossy().into_owned()).unwrap_or_default(), w)); }
                tell(i + 1, of, None);
            }
            Flow::End(f) => return Some(f),
        }
    }
    None
}

fn one_unit(u: &Unit, i: usize, of: usize, dest: &dyn Fn(&Unit) -> Option<PathBuf>, job: &Job, tell: Tell, e: &mut Ended, why: &mut &'static str) -> Flow {
    use std::os::unix::fs::DirBuilderExt;
    let mut skip = |e: &mut Ended, reason: &'static str| { e.skipped += 1; *why = reason; Flow::Next };
    if u.already { return skip(e, "alreadyThat"); }
    // Where the result goes is checked first: nothing is run for a result that could not be saved.
    let Some(to) = dest(u) else { return Flow::End(Failure::Failed("noPlace")) };
    if !writable_dir(&to) { return Flow::End(Failure::Failed("noPlace")); }
    let dir = match &u.out { Out::File { tmp, .. } => tmp.parent().map(Path::to_path_buf), Out::Folder { tmp } => Some(tmp.clone()) };
    if let Some(d) = dir { if std::fs::DirBuilder::new().recursive(true).mode(0o700).create(&d).is_err() { return Flow::End(Failure::Failed("noWork")); } }
    // Every dropped file this unit reads is taken again just before it is used: it may have been moved, or swapped
    // for a link, since the drop. The tools read the copy taken here.
    for input in &u.inputs {
        if let Some(d) = input.copy.parent() { if std::fs::DirBuilder::new().recursive(true).mode(0o700).create(d).is_err() { return Flow::End(Failure::Failed("noWork")); } }
        let real_max = input.real.then(|| if u.unzip { UNZIP_LIMITS.bytes } else { FOLDER_LIMITS.bytes });
        match take_input(&input.from, &input.copy, real_max, job) {
            Ok(()) => {}
            Err("stopped") => return Flow::End(Failure::Stopped),
            Err(w) => return per_file(Failure::Failed(w)),
        }
    }
    let read = u.inputs.first().map(|i| i.copy.clone()).unwrap_or_else(|| u.source.clone());
    // A zip is read before anything is extracted from it: one that could do harm is refused, and nothing is written.
    if u.unzip {
        let said = match zip_vet(&read, UNZIP_LIMITS) { Ok(n) => n, Err(why) => return per_file(Failure::Failed(why)) };
        if let Err(why) = unzip_room(said, read.parent().and_then(free_space)) { return per_file(Failure::Failed(why)); }
    }
    if u.max_side.is_some() || u.square {
        let size = cmd(SIPS, vec![os("-g"), os("pixelWidth"), os("-g"), os("pixelHeight"), pth(&read)]);
        match exec(&size, job, &|_| {}) {
            Ok(text) => {
                let wh = sips_size(&text);
                if u.square && !wh.is_some_and(|(w, h)| w == h) { return Flow::Bad("notSquare"); }
                if let (Some(max), Some((w, h))) = (u.max_side, wh) { if w.max(h) <= max { return skip(e, "alreadySmall"); } }
            }
            Err(f) => return per_file(f),
        }
    }
    let progress = |t: &str| {
        for piece in t.split(['\r', '\n']) {
            if let Some((a, b)) = jxa_step(piece) { if b > 0 { tell(i, of, Some((a as f64 / b as f64 * 100.0).min(100.0))); } }
            else if let Some(p) = avconvert_percent(piece) { tell(i, of, Some(p)); }
        }
    };
    // A flip is made on the picture as it is seen: one stored on its side (its Orientation tag) has its two directions swapped.
    let swapped = u.flip && {
        let ask = jxa_pic("orientation", vec![os("-"), pth(&read)]);
        match exec(&ask, job, &|_| {}) { Ok(text) => orientation_of(&text).is_some_and(on_its_side), Err(f) => return per_file(f) }
    };
    for c in &u.cmds {
        let c = if swapped { swap_flip(c) } else { c.clone() };
        if let Err(f) = exec(&c, job, &progress) { return per_file(f); }
    }
    if job.stopped() { return Flow::End(Failure::Stopped); }
    if !made_something(&u.out) { return Flow::Bad("toolFailed"); }
    if u.shrink && !smaller(&u.out, &read) { return skip(e, "notSmaller"); }
    if !std::fs::metadata(&to).map(|m| m.is_dir()).unwrap_or(false) { return Flow::End(Failure::Failed("noPlace")); }
    let stem = u.stem.clone().or_else(|| u.source.file_stem().map(|s| s.to_string_lossy().into_owned())).unwrap_or_else(|| "file".into());
    match place(&u.out, &to, &stem, u.label, job) {
        Ok(p) => e.made.push(p),
        Err(err) if err.kind() == std::io::ErrorKind::Interrupted => return Flow::End(Failure::Stopped),
        Err(_) => return Flow::End(Failure::Failed("noPlace")),
    }
    Flow::Next
}

/// What the pages are told when a job ends: the new files' names only (never a path) with their number for Show in
/// Finder, how many were left as they were, and why it ended early. A job stopped or failed part way still names what it
/// made before, so the person can find those files.
pub fn end_news(id: u64, e: &Ended) -> Value {
    let made: Vec<Value> = e.made.iter().enumerate().map(|(i, p)| json!({ "name": p.file_name().map(|n| n.to_string_lossy().into_owned()).unwrap_or_default(), "i": i })).collect();
    match e.fail {
        None => {
            let mut v = json!({ "id": id, "phase": "done", "made": made, "skipped": e.skipped });
            // Only said when a file could not be converted: its number, and the first one's name (never a path) and reason.
            if let (true, Some((name, why))) = (e.failed > 0, &e.first_failed) {
                v["failed"] = json!(e.failed); v["failedName"] = json!(name); v["failedWhy"] = json!(why);
            }
            v
        }
        Some(Failure::Stopped) => json!({ "id": id, "phase": "stopped", "made": made }),
        Some(Failure::Failed(why)) => json!({ "id": id, "phase": "failed", "why": why, "made": made }),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    fn p(s: &str) -> PathBuf { PathBuf::from(s) }
    fn terms(clone: bool, copy_max: u64) -> Terms { Terms { clone, copy_max, real_max: None, free: None } }
    fn ps(v: &[&str]) -> Vec<PathBuf> { v.iter().map(|s| p(s)).collect() }
    fn args(c: &Cmd) -> Vec<String> { c.args.iter().map(|a| a.to_string_lossy().into_owned()).collect() }
    fn acts(o: Offer) -> Vec<&'static str> { match o { Offer::Actions(_, a) => a, Offer::Refused(r) => panic!("refused {r}") } }

    // ---- which actions a file type gets ----

    #[test]
    fn kinds_come_from_the_extension_in_any_case() {
        assert_eq!(kind_of(&p("/a/Photo.JPG")), Some(Kind::Image));
        assert_eq!(kind_of(&p("/a/x.heic")), Some(Kind::Image));
        assert_eq!(kind_of(&p("/a/x.webp")), Some(Kind::Image));
        assert_eq!(kind_of(&p("/a/x.pdf")), Some(Kind::Pdf));
        assert_eq!(kind_of(&p("/a/x.docx")), Some(Kind::Document));
        assert_eq!(kind_of(&p("/a/x.htm")), Some(Kind::Document));
        assert_eq!(kind_of(&p("/a/x.txt")), Some(Kind::Document));
        assert_eq!(kind_of(&p("/a/x.mp3")), Some(Kind::Audio));
        assert_eq!(kind_of(&p("/a/x.mov")), Some(Kind::Video));
        assert_eq!(kind_of(&p("/a/x.zip")), Some(Kind::Archive));
        assert_eq!(kind_of(&p("/a/x.md")), Some(Kind::Document));
        assert_eq!(kind_of(&p("/a/x.flac")), Some(Kind::Audio));
        assert_eq!(kind_of(&p("/a/x.pages")), None);
        assert_eq!(kind_of(&p("/a/noext")), None);
        assert_eq!(ext_of(&p("/a/b.JPG")), "jpeg");
        assert_eq!(ext_of(&p("/a/b.tif")), "tiff");
        assert_eq!(ext_of(&p("/a/b.aif")), "aiff");
    }

    /// What every picture also gets, after its formats (the checked ones are not in it).
    fn image_more(strip: bool, several: bool) -> Vec<&'static str> {
        let mut v = vec!["resize", "compress", "turnRight", "turnLeft", "turnAround", "flipHorizontal", "flipVertical"];
        if strip { v.push("stripInfo"); }
        v.extend(["thumbnails", "imageToPdf"]);
        if several { v.push("imagesToPdf"); }
        v.push("zip");
        if several { v.push("zipTogether"); }
        v
    }
    fn cat(a: &[&'static str], b: Vec<&'static str>) -> Vec<&'static str> { a.iter().copied().chain(b).collect() }
    fn webp() -> Caps { Caps { image: vec!["webp".into()], ..Caps::core() } }

    #[test]
    fn an_image_gets_every_other_format_then_its_own_actions_with_the_usual_format_first() {
        let u = Prefs::usual();
        let core = Caps::core();
        assert_eq!(acts(offer(&ps(&["/a/x.jpg"]), &core, &u)), cat(&["toPng", "toHeic", "toTiff"], image_more(true, false)));
        assert_eq!(acts(offer(&ps(&["/a/x.png"]), &core, &u)), cat(&["toJpeg", "toHeic", "toTiff"], image_more(true, false)));
        // WebP only when sips on this Mac can write it.
        assert_eq!(acts(offer(&ps(&["/a/x.png"]), &webp(), &u)), cat(&["toJpeg", "toHeic", "toTiff", "toWebp"], image_more(true, false)));
        // A picture the Mac can read but not write is not stripped in place (its result would be another format).
        assert_eq!(acts(offer(&ps(&["/a/x.webp"]), &core, &u)), cat(&["toPng", "toJpeg", "toHeic", "toTiff"], image_more(false, false)));
        let heic_first = Prefs { image: "heic".into(), ..Prefs::usual() };
        assert_eq!(acts(offer(&ps(&["/a/x.png"]), &core, &heic_first)), cat(&["toHeic", "toJpeg", "toTiff"], image_more(true, false)));
    }

    #[test]
    fn pdfs_get_merge_only_when_there_are_several() {
        let u = Prefs::usual();
        let tail = ["split", "pdfCompress", "pagesToImages", "pdfText", "turnRight", "turnLeft", "turnAround", "dropFirstPage", "dropLastPage", "keepFirstPage", "zip"];
        assert_eq!(acts(offer(&ps(&["/a/x.pdf"]), &Caps::core(), &u)), tail.to_vec());
        assert_eq!(acts(offer(&ps(&["/a/x.pdf", "/a/y.PDF"]), &Caps::core(), &u)), cat(&["merge"], tail.to_vec()).into_iter().chain(["zipTogether"]).collect::<Vec<_>>());
    }

    #[test]
    fn documents_go_to_pdf_text_and_between_word_rtf_and_html_never_to_their_own_format() {
        let u = Prefs::usual();
        let core = Caps::core();
        assert_eq!(acts(offer(&ps(&["/a/x.docx"]), &core, &u)), vec!["toPdf", "toText", "toRtf", "toHtml", "zip"]);
        assert_eq!(acts(offer(&ps(&["/a/x.txt"]), &core, &u)), vec!["toPdf", "toDocx", "toRtf", "toHtml", "zip"]);
        assert_eq!(acts(offer(&ps(&["/a/x.htm"]), &core, &u)), vec!["toPdf", "toText", "toDocx", "toRtf", "zip"]);
        let word = Prefs { doc: "docx".into(), ..Prefs::usual() };
        assert_eq!(acts(offer(&ps(&["/a/x.rtf"]), &core, &word)), vec!["toDocx", "toPdf", "toText", "toHtml", "zip"]);
        // Markdown is plain text here: a source file, not a rendered page.
        assert_eq!(acts(offer(&ps(&["/a/notes.md"]), &core, &u)), vec!["toPdf", "toText", "toDocx", "toRtf", "toHtml", "zip"]);
        // The Mac's other word formats, only when textutil says it writes them.
        let all = Caps::all();
        assert_eq!(acts(offer(&ps(&["/a/x.docx"]), &all, &u)), vec!["toPdf", "toText", "toRtf", "toHtml", "toDoc", "toOdt", "toWordml", "zip"]);
        assert_eq!(acts(offer(&ps(&["/a/x.odt"]), &all, &u)), vec!["toPdf", "toText", "toDocx", "toRtf", "toHtml", "toDoc", "toWordml", "zip"]);
        assert_eq!(acts(offer(&ps(&["/a/x.webarchive"]), &core, &u))[0], "toPdf");
    }

    #[test]
    fn sound_and_video_convert_and_trim_one_file_at_a_time() {
        let u = Prefs::usual();
        let core = Caps::core();
        let sound = ["mono", "stereo", "sampleRate", "zip"];
        assert_eq!(acts(offer(&ps(&["/a/x.mp3"]), &core, &u)), cat(&["toM4a", "toWav", "toAiff", "trim"], sound.to_vec()));
        assert_eq!(acts(offer(&ps(&["/a/x.m4a"]), &core, &u)), cat(&["toWav", "toAiff", "trim"], sound.to_vec()));
        assert_eq!(acts(offer(&ps(&["/a/x.wav", "/a/y.wav"]), &core, &u)), cat(&["toM4a", "toAiff"], vec!["mono", "stereo", "sampleRate", "zip", "zipTogether"]));
        let video = ["stillStart", "stillMiddle", "zip"];
        assert_eq!(acts(offer(&ps(&["/a/x.mov"]), &core, &u)), cat(&["toMp4", "soundOnly", "trim"], video.to_vec()));
        assert_eq!(acts(offer(&ps(&["/a/x.mp4"]), &core, &u)), cat(&["toMov", "soundOnly", "trim"], video.to_vec()));
        assert_eq!(acts(offer(&ps(&["/a/x.m4v"]), &core, &u)), cat(&["toMp4", "toMov", "soundOnly", "trim"], video.to_vec()));
    }

    #[test]
    fn nothing_mixed_or_too_many_is_offered_and_a_file_of_no_known_kind_can_only_be_zipped() {
        let u = Prefs::usual();
        let core = Caps::core();
        assert_eq!(offer(&[], &core, &u), Offer::Refused("none"));
        assert_eq!(offer(&ps(&["/a/x.png", "/a/y.pdf"]), &core, &u), Offer::Refused("mixed"));
        let many: Vec<PathBuf> = (0..=MAX_FILES).map(|i| p(&format!("/a/{i}.png"))).collect();
        assert_eq!(offer(&many, &core, &u), Offer::Refused("tooMany"));
        assert_eq!(offer(&ps(&["/a/x.pages"]), &core, &u), Offer::Actions(Kind::Other, vec!["zip"]));
        assert_eq!(offer(&ps(&["/a/x.pages", "/a/noext"]), &core, &u), Offer::Actions(Kind::Other, vec!["zip", "zipTogether"]));
        assert_eq!(offer(&ps(&["/a/x.zip"]), &core, &u), Offer::Actions(Kind::Archive, vec!["unzip"]));
        assert_eq!(offer(&ps(&["/a/x.zip", "/a/y.zip"]), &core, &u), Offer::Actions(Kind::Archive, vec!["unzip"]));
        assert_eq!(offer(&ps(&["/a/x.zip", "/a/y.png"]), &core, &u), Offer::Refused("mixed"));
    }

    #[test]
    fn several_images_get_the_formats_none_of_them_already_all_have() {
        let u = Prefs::usual();
        assert_eq!(acts(offer(&ps(&["/a/x.png", "/a/y.jpg"]), &Caps::core(), &u)), cat(&["toPng", "toJpeg", "toHeic", "toTiff"], image_more(true, true)));
        // Stripping needs every one of them to be a kind it can write back as it is.
        assert!(!acts(offer(&ps(&["/a/x.png", "/a/y.gif"]), &Caps::core(), &u)).contains(&"stripInfo"));
    }

    #[test]
    fn the_settings_are_read_with_their_usual_values_when_unset_or_wrong() {
        let u = Prefs::read(|_| Value::Null);
        assert_eq!(u, Prefs::usual());
        assert_eq!(u.image, "png");
        assert_eq!(u.doc, "pdf");
        assert_eq!(u.audio, "m4a");
        assert_eq!(u.video, "mp4");
        assert_eq!(u.resize, 1600);
        assert_eq!(u.quality, 60);
        assert_eq!(u.rate, 44_100);
        assert_eq!(u.save_to, SaveTo::NextTo);
        let set = Prefs::read(|k| match k { "drop.resizeTo" => json!("2400"), "drop.quality" => json!("small"), "drop.saveTo" => json!("downloads"), "drop.imageFormat" => json!("rm -rf"), "drop.sampleRate" => json!("22050"), _ => Value::Null });
        assert_eq!((set.resize, set.quality, set.save_to, set.image.as_str(), set.rate), (2400, 40, SaveTo::Downloads, "png", 22_050));
        let odd = Prefs::read(|k| match k { "drop.sampleRate" => json!("96000"), "drop.audioFormat" => json!("mp3"), "drop.imageFormat" => json!("gif"), "drop.videoFormat" => json!("m4v"), "drop.docFormat" => json!("odt"), _ => Value::Null });
        assert_eq!((odd.rate, odd.audio.as_str(), odd.image.as_str(), odd.video.as_str(), odd.doc.as_str()), (44_100, "m4a", "gif", "m4v", "odt"), "a rate or format this version does not know is the usual one; the new formats are choices");
    }

    #[test]
    fn every_setting_read_here_is_in_the_registry_for_the_shell_kept_in_settings_json() {
        let r = crate::settings::registry();
        for k in KEYS {
            let d = r.get(k).unwrap_or_else(|| panic!("{k} is not in protocol/settings.json"));
            assert!(d.applies_to("shell"), "{k}");
            assert_eq!(d.store, "settings", "{k}");
        }
        assert_eq!(r.get("drop.on").unwrap().default, json!(true), "on, since the founder asked for it");
        assert_eq!(r.get("drop.saveTo").unwrap().default, json!("nextTo"));
    }

    #[test]
    fn webp_is_writable_only_when_sips_says_so() {
        let text = "Supported Formats:\npublic.png                   png   Writable\norg.webmproject.webp         webp  \npublic.heic                  heic  Writable\n";
        assert!(writable(text, "png"));
        assert!(writable(text, "heic"));
        assert!(!writable(text, "webp"));
        assert!(writable("org.webmproject.webp         webp  Writable\n", "webp"));
        assert!(!writable("", "webp"));
    }

    // ---- the output name ----

    #[test]
    fn the_output_name_says_what_was_done_and_never_takes_a_name_already_there() {
        assert_eq!(name_for("photo", "converted", Some("png"), 1), "photo (converted).png");
        assert_eq!(name_for("photo", "converted", Some("png"), 2), "photo (converted 2).png");
        assert_eq!(name_for("report", "pages", None, 1), "report (pages)");
        let taken = ["/d/photo (converted).png", "/d/photo (converted 2).png"];
        let got = free_name(&p("/d"), "photo", "converted", Some("png"), |q| taken.iter().any(|t| Path::new(t) == q));
        assert_eq!(got, Some(p("/d/photo (converted 3).png")));
        assert_eq!(free_name(&p("/d"), "photo", "converted", Some("png"), |_| true), None, "gives up rather than overwrite");
    }

    #[test]
    fn a_very_long_name_is_shortened_to_fit_and_never_cut_inside_a_letter() {
        let stem = "é".repeat(200);
        let n = name_for(&stem, "converted", Some("png"), 12);
        assert!(n.len() <= 255, "{}", n.len());
        assert!(n.ends_with(" (converted 12).png"));
    }

    // ---- the path checks ----

    #[test]
    fn only_a_readable_regular_file_that_is_not_a_link_is_taken() {
        let dir = std::env::temp_dir().join(format!("companion-convert-check-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(&dir).unwrap();
        let f = dir.join("a.png");
        std::fs::write(&f, b"x").unwrap();
        assert_eq!(check_input(&f), Ok(()));
        let link = dir.join("link.png");
        std::os::unix::fs::symlink(&f, &link).unwrap();
        assert_eq!(check_input(&link), Err("link"));
        assert_eq!(check_input(&dir), Ok(()), "a folder can be zipped");
        let pipe = dir.join("pipe");
        let c = std::ffi::CString::new(pipe.to_str().unwrap()).unwrap();
        assert_eq!(unsafe { libc::mkfifo(c.as_ptr(), 0o600) }, 0);
        assert_eq!(check_input(&pipe), Err("notFile"), "neither a file nor a folder");
        assert_eq!(check_input(&dir.join("gone.png")), Err("missing"));
        assert_eq!(check_input(Path::new("a.png")), Err("notAbsolute"));
        let locked = dir.join("locked.png");
        std::fs::write(&locked, b"x").unwrap();
        use std::os::unix::fs::PermissionsExt;
        std::fs::set_permissions(&locked, std::fs::Permissions::from_mode(0o000)).unwrap();
        assert_eq!(check_input(&locked), Err("unreadable"));
        std::fs::set_permissions(&locked, std::fs::Permissions::from_mode(0o600)).unwrap();
        std::fs::remove_dir_all(&dir).unwrap();
    }

    #[test]
    fn results_go_next_to_the_original_unless_settings_say_downloads_or_desktop() {
        let home = p("/Users/me");
        assert_eq!(dest_dir(&p("/Users/me/Work/a.png"), SaveTo::NextTo, &home), Some(p("/Users/me/Work")));
        assert_eq!(dest_dir(&p("/Users/me/Work/a.png"), SaveTo::Downloads, &home), Some(p("/Users/me/Downloads")));
        assert_eq!(dest_dir(&p("/Users/me/Work/a.png"), SaveTo::Desktop, &home), Some(p("/Users/me/Desktop")));
    }

    // ---- the argument lists, one per tool ----

    fn one(action: &str, input: &str) -> Unit {
        let mut u = plan(action, &ps(&[input]), &p("/w"), &Prefs::usual(), None).unwrap();
        assert_eq!(u.len(), 1);
        u.remove(0)
    }

    #[test]
    fn images_use_sips_with_the_paths_as_their_own_arguments() {
        let u = one("toPng", "/a/my photo.jpg");
        assert_eq!(u.cmds.len(), 1);
        assert_eq!(u.cmds[0].program, "/usr/bin/sips");
        assert_eq!(args(&u.cmds[0]), vec!["-s", "format", "png", "/w/0/in.jpg", "--out", "/w/0/out.png"]);
        assert_eq!((u.label, u.out.clone()), ("converted", Out::File { tmp: p("/w/0/out.png"), ext: "png".into() }));
        assert_eq!(args(&one("toHeic", "/a/x.png").cmds[0]), vec!["-s", "format", "heic", "/w/0/in.png", "--out", "/w/0/out.heic"]);
        assert_eq!(args(&one("toJpeg", "/a/x.png").cmds[0]), vec!["-s", "format", "jpeg", "/w/0/in.png", "--out", "/w/0/out.jpg"]);
        assert_eq!(args(&one("toTiff", "/a/x.png").cmds[0]), vec!["-s", "format", "tiff", "/w/0/in.png", "--out", "/w/0/out.tiff"]);
    }

    #[test]
    fn resize_keeps_the_format_it_can_write_and_never_makes_a_picture_bigger() {
        let u = one("resize", "/a/x.png");
        assert_eq!(args(&u.cmds[0]), vec!["-Z", "1600", "/w/0/in.png", "--out", "/w/0/out.png"]);
        assert_eq!((u.label, u.max_side), ("resized", Some(1600)));
        // WebP cannot be written here, so a resized WebP is a PNG.
        assert_eq!(args(&one("resize", "/a/x.webp").cmds[0]), vec!["-Z", "1600", "-s", "format", "png", "/w/0/in.webp", "--out", "/w/0/out.png"]);
    }

    #[test]
    fn compress_makes_a_jpeg_at_the_chosen_quality_and_keeps_heic_as_heic() {
        let u = one("compress", "/a/x.png");
        assert_eq!(args(&u.cmds[0]), vec!["-s", "format", "jpeg", "-s", "formatOptions", "60", "/w/0/in.png", "--out", "/w/0/out.jpg"]);
        assert_eq!(u.label, "smaller");
        assert_eq!(args(&one("compress", "/a/x.heic").cmds[0]), vec!["-s", "format", "heic", "-s", "formatOptions", "60", "/w/0/in.heic", "--out", "/w/0/out.heic"]);
    }

    #[test]
    fn documents_use_textutil_without_loading_anything_from_the_web() {
        let u = one("toText", "/a/x.docx");
        assert_eq!(u.cmds[0].program, "/usr/bin/textutil");
        assert_eq!(args(&u.cmds[0]), vec!["-noload", "-convert", "txt", "-encoding", "UTF-8", "-output", "/w/0/out.txt", "--", "/w/0/in.docx"]);
        assert_eq!(args(&one("toDocx", "/a/x.rtf").cmds[0]), vec!["-noload", "-convert", "docx", "-output", "/w/0/out.docx", "--", "/w/0/in.rtf"]);
        assert_eq!(args(&one("toHtml", "/a/x.rtf").cmds[0]), vec!["-noload", "-nostore", "-convert", "html", "-output", "/w/0/out.html", "--", "/w/0/in.rtf"]);
    }

    #[test]
    fn a_document_to_pdf_goes_through_textutil_then_the_macs_own_printing() {
        let u = one("toPdf", "/a/x.html");
        assert_eq!(u.cmds.len(), 2);
        assert_eq!(args(&u.cmds[0]), vec!["-noload", "-convert", "rtf", "-output", "/w/0/mid.rtf", "--", "/w/0/in.html"]);
        assert_eq!(u.cmds[1].program, "/usr/bin/osascript");
        let a = args(&u.cmds[1]);
        assert_eq!(&a[..2], &["-l", "JavaScript"]);
        assert_eq!(a[2], "-e");
        assert_eq!(&a[4..], &["--", "toPdf", "/w/0/out.pdf", "/w/0/mid.rtf"]);
    }

    #[test]
    fn pdfs_use_pdfkit_through_a_fixed_script_with_the_paths_as_arguments() {
        let m = plan("merge", &ps(&["/a/one.pdf", "/a/two.pdf"]), &p("/w"), &Prefs::usual(), None).unwrap();
        assert_eq!(m.len(), 1, "one merged file");
        assert_eq!((m[0].label, m[0].source.clone()), ("merged", p("/a/one.pdf")));
        assert_eq!(&args(&m[0].cmds[0])[4..], &["--", "merge", "/w/0/out.pdf", "/w/0/in 1.pdf", "/w/0/in 2.pdf"]);
        let s = one("split", "/a/x.pdf");
        assert_eq!((s.label, s.out.clone()), ("pages", Out::Folder { tmp: p("/w/0/out") }));
        assert_eq!(&args(&s.cmds[0])[4..], &["--", "split", "/w/0/out", "/w/0/in.pdf"]);
        let i = one("pagesToImages", "/a/x.pdf");
        assert_eq!(i.label, "page images");
        assert_eq!(&args(&i.cmds[0])[4..], &["--", "images", "/w/0/out", "/w/0/in.pdf"]);
        let c = one("pdfCompress", "/a/x.pdf");
        assert_eq!(c.label, "smaller");
        assert_eq!(&args(&c.cmds[0])[4..], &["--", "compress", "/w/0/out.pdf", "/w/0/in.pdf"]);
        // The script is the same fixed text every time: nothing from a file name is ever part of it.
        assert_eq!(args(&s.cmds[0])[3], args(&i.cmds[0])[3]);
    }

    #[test]
    fn sound_uses_afconvert_and_video_and_trimming_use_avconvert() {
        assert_eq!(one("toM4a", "/a/x.wav").cmds[0].program, "/usr/bin/afconvert");
        assert_eq!(args(&one("toM4a", "/a/x.wav").cmds[0]), vec!["-f", "m4af", "-d", "aac", "/w/0/in.wav", "/w/0/out.m4a"]);
        assert_eq!(args(&one("toWav", "/a/x.mp3").cmds[0]), vec!["-f", "WAVE", "-d", "LEI16", "/w/0/in.mp3", "/w/0/out.wav"]);
        assert_eq!(args(&one("toAiff", "/a/x.mp3").cmds[0]), vec!["-f", "AIFF", "-d", "BEI16", "/w/0/in.mp3", "/w/0/out.aiff"]);
        let v = one("toMp4", "/a/x.mov");
        assert_eq!(v.cmds[0].program, "/usr/bin/avconvert");
        assert_eq!(args(&v.cmds[0]), vec!["--source", "/w/0/in.mov", "--output", "/w/0/out.mp4", "--preset", "PresetHighestQuality", "--progress"]);
        assert_eq!(args(&one("soundOnly", "/a/x.mov").cmds[0]), vec!["--source", "/w/0/in.mov", "--output", "/w/0/out.m4a", "--preset", "PresetAppleM4A", "--progress"]);
        let t = plan("trim", &ps(&["/a/x.mov"]), &p("/w"), &Prefs::usual(), Some(Trim { start: 1.5, end: 10.0 })).unwrap();
        assert_eq!(args(&t[0].cmds[0]), vec!["--source", "/w/0/in.mov", "--output", "/w/0/out.mov", "--preset", "PresetHighestQuality", "--progress", "--start", "1.5", "--duration", "8.5"]);
        assert_eq!(t[0].label, "trimmed");
        let a = plan("trim", &ps(&["/a/x.wav"]), &p("/w"), &Prefs::usual(), Some(Trim { start: 0.0, end: 30.0 })).unwrap();
        assert_eq!(args(&a[0].cmds[0]), vec!["--source", "/w/0/in.wav", "--output", "/w/0/out.m4a", "--preset", "PresetAppleM4A", "--progress", "--start", "0", "--duration", "30"]);
    }

    #[test]
    fn a_trim_needs_an_end_after_its_start() {
        assert!(trim_ok(Trim { start: 0.0, end: 1.0 }));
        assert!(!trim_ok(Trim { start: 5.0, end: 5.0 }));
        assert!(!trim_ok(Trim { start: -1.0, end: 5.0 }));
        assert!(!trim_ok(Trim { start: 0.0, end: f64::NAN }));
        assert!(!trim_ok(Trim { start: 0.0, end: 200_000.0 }));
        assert_eq!(plan("trim", &ps(&["/a/x.mov"]), &p("/w"), &Prefs::usual(), None), Err("badTrim"));
    }

    #[test]
    fn a_batch_makes_one_result_per_file_each_in_its_own_work_folder() {
        let u = plan("toJpeg", &ps(&["/a/x.png", "/b/y.png"]), &p("/w"), &Prefs::usual(), None).unwrap();
        assert_eq!(u.len(), 2);
        assert_eq!(args(&u[1].cmds[0]), vec!["-s", "format", "jpeg", "/w/1/in.png", "--out", "/w/1/out.jpg"]);
        assert_eq!(u[1].source, p("/b/y.png"));
    }

    #[test]
    fn an_action_the_files_were_not_offered_is_refused() {
        assert_eq!(plan("merge", &ps(&["/a/x.pdf"]), &p("/w"), &Prefs::usual(), None), Err("notOffered"));
        assert_eq!(plan("toPng", &ps(&["/a/x.pdf"]), &p("/w"), &Prefs::usual(), None), Err("notOffered"));
        assert_eq!(plan("rm", &ps(&["/a/x.png"]), &p("/w"), &Prefs::usual(), None), Err("notOffered"));
    }

    // ---- progress ----

    #[test]
    fn progress_is_read_from_avconvert_and_from_the_pdf_script() {
        assert_eq!(avconvert_percent("avconvert progress:  0.00% complete\ravconvert progress:  42.50% complete"), Some(42.5));
        assert_eq!(avconvert_percent("nothing here"), None);
        assert_eq!(jxa_step("step 3 10"), Some((3, 10)));
        assert_eq!(jxa_step("step 3"), None);
        assert_eq!(sips_size("/a/x.png\n  pixelWidth: 565\n  pixelHeight: 800\n"), Some((565, 800)));
        assert_eq!(sips_size("garbage"), None);
    }
    // ---- putting results in place, and the real tools on files in a temporary folder only ----

    fn tmp(name: &str) -> PathBuf {
        let d = std::env::temp_dir().join(format!("companion-convert-{name}-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&d);
        std::fs::create_dir_all(&d).unwrap();
        d
    }
    fn jpeg(at: &Path) {
        let (w, h) = (40u16, 30u16);
        let px: Vec<u8> = (0..(w as usize * h as usize)).flat_map(|i| [(i % 255) as u8, 80, 160]).collect();
        jpeg_encoder::Encoder::new_file(at, 90).unwrap().encode(&px, w, h, jpeg_encoder::ColorType::Rgb).unwrap();
    }
    fn ran(action: &str, inputs: &[PathBuf], work: &Path, trim: Option<Trim>) -> (Vec<PathBuf>, Option<Failure>) {
        let units = plan(action, inputs, work, &Prefs::usual(), trim).unwrap();
        let e = run(&units, work, &|u| u.source.parent().map(Path::to_path_buf), &Job::default(), &|_, _, _| {});
        (e.made, e.fail)
    }

    #[test]
    fn placing_never_writes_over_a_file_that_is_there_and_takes_the_next_free_name() {
        let d = tmp("place");
        let made = d.join("made.png");
        std::fs::write(&made, b"new").unwrap();
        std::fs::write(d.join("photo (converted).png"), b"old").unwrap();
        let got = place(&Out::File { tmp: made.clone(), ext: "png".into() }, &d, "photo", "converted", &Job::default()).unwrap();
        assert_eq!(got, d.join("photo (converted 2).png"));
        assert_eq!(std::fs::read(d.join("photo (converted).png")).unwrap(), b"old", "the file already there is untouched");
        assert_eq!(std::fs::read(&got).unwrap(), b"new");
        // A folder result keeps its pages in order.
        let pages = d.join("pages");
        std::fs::create_dir(&pages).unwrap();
        for n in [1, 2, 10] { std::fs::write(pages.join(format!("page {n}.pdf")), b"%PDF").unwrap(); }
        let f = place(&Out::Folder { tmp: pages }, &d, "report", "pages", &Job::default()).unwrap();
        assert_eq!(f, d.join("report (pages)"));
        assert_eq!(std::fs::read_dir(&f).unwrap().count(), 3);
        std::fs::remove_dir_all(&d).unwrap();
    }

    #[test]
    fn stop_ends_a_running_tool_and_nothing_is_put_anywhere() {
        let d = tmp("stop");
        let src = d.join("a.png");
        std::fs::write(&src, b"x").unwrap();
        let work = d.join("work");
        let unit = Unit { source: src.clone(), inputs: vec![Input { from: src.clone(), copy: work.join("0/in.png"), real: false }], label: "converted", cmds: vec![Cmd { program: "/bin/sleep", args: vec![os("5")], guard: None }], out: Out::File { tmp: work.join("0/out.png"), ext: "png".into() }, max_side: None, shrink: false, already: false, square: false, stem: None, unzip: false, flip: false };
        let job = std::sync::Arc::new(Job::default());
        let j = job.clone();
        std::thread::spawn(move || { std::thread::sleep(Duration::from_millis(200)); j.stop(); });
        let t0 = std::time::Instant::now();
        let Ended { made, fail, .. } = run(&[unit], &work, &|u| u.source.parent().map(Path::to_path_buf), &job, &|_, _, _| {});
        assert!(t0.elapsed() < Duration::from_secs(3), "stopped in a moment, not after the tool finished");
        assert_eq!((made, fail), (vec![], Some(Failure::Stopped)));
        assert!(!work.exists(), "the work folder is removed");
        assert_eq!(std::fs::read_dir(&d).unwrap().count(), 1, "only the original is left");
        std::fs::remove_dir_all(&d).unwrap();
    }

    #[test]
    fn a_file_swapped_for_a_link_after_the_drop_is_refused_before_any_tool_runs() {
        let d = tmp("swap");
        let real = d.join("real.png");
        jpeg(&real);
        let src = d.join("a.png");
        std::os::unix::fs::symlink(&real, &src).unwrap();
        let units = plan("toJpeg", &[src], &d.join("work"), &Prefs::usual(), None).unwrap();
        let Ended { made, fail, .. } = run(&units, &d.join("work"), &|u| u.source.parent().map(Path::to_path_buf), &Job::default(), &|_, _, _| {});
        assert_eq!((made.len(), fail), (0, Some(Failure::Failed("gone"))));
        std::fs::remove_dir_all(&d).unwrap();
    }

    #[test]
    fn the_real_sips_converts_resizes_only_when_bigger_and_compresses_in_a_temporary_folder() {
        let d = tmp("sips");
        let src = d.join("my photo.jpg");
        jpeg(&src);
        let (made, fail) = ran("toPng", std::slice::from_ref(&src), &d.join("w1"), None);
        assert_eq!(fail, None);
        assert_eq!(made, vec![d.join("my photo (converted).png")]);
        assert_eq!(&std::fs::read(&made[0]).unwrap()[1..4], b"PNG");
        // A second run never takes the first one's name.
        let (again, _) = ran("toPng", std::slice::from_ref(&src), &d.join("w2"), None);
        assert_eq!(again, vec![d.join("my photo (converted 2).png")]);
        // 40 by 30 is already smaller than 1600: nothing is made bigger.
        let (none, fail) = ran("resize", std::slice::from_ref(&src), &d.join("w3"), None);
        assert_eq!((none.len(), fail), (0, Some(Failure::Failed("alreadySmall"))));
        // A big picture saved at high quality really does get smaller.
        let big = d.join("big photo.jpg");
        noise_jpeg(&big, 95);
        let (small, fail) = ran("compress", std::slice::from_ref(&big), &d.join("w4"), None);
        assert_eq!((small.clone(), fail), (vec![d.join("big photo (smaller).jpg")], None));
        assert!(std::fs::metadata(&small[0]).unwrap().len() < std::fs::metadata(&big).unwrap().len());
        std::fs::remove_dir_all(&d).unwrap();
    }

    #[test]
    fn the_real_textutil_and_pdfkit_make_documents_and_pdfs_in_a_temporary_folder() {
        let d = tmp("docs");
        let src = d.join("notes.txt");
        std::fs::write(&src, "Hello there.\nA second line.\n").unwrap();
        let (html, fail) = ran("toHtml", std::slice::from_ref(&src), &d.join("w1"), None);
        assert_eq!(fail, None);
        assert!(std::fs::read_to_string(&html[0]).unwrap().contains("Hello there."));
        let (pdf, fail) = ran("toPdf", std::slice::from_ref(&src), &d.join("w2"), None);
        assert_eq!(fail, None, "document to PDF");
        assert_eq!(pdf, vec![d.join("notes (converted).pdf")]);
        assert_eq!(&std::fs::read(&pdf[0]).unwrap()[..4], b"%PDF");
        let second = d.join("second.pdf");
        std::fs::copy(&pdf[0], &second).unwrap();
        let (merged, fail) = ran("merge", &[pdf[0].clone(), second.clone()], &d.join("w3"), None);
        assert_eq!((merged.clone(), fail), (vec![d.join("notes (converted) (merged).pdf")], None));
        let (pages, fail) = ran("split", std::slice::from_ref(&merged[0]), &d.join("w4"), None);
        assert_eq!(fail, None);
        assert_eq!(std::fs::read_dir(&pages[0]).unwrap().count(), 2, "two pages, each its own PDF");
        let (images, fail) = ran("pagesToImages", std::slice::from_ref(&second), &d.join("w5"), None);
        assert_eq!(fail, None);
        assert!(images[0].join("page 1.png").is_file());
        // The originals are all still there, unchanged.
        assert_eq!(std::fs::read_to_string(&src).unwrap(), "Hello there.\nA second line.\n");
        std::fs::remove_dir_all(&d).unwrap();
    }
    #[test]
    fn the_real_afconvert_and_avconvert_convert_and_trim_sound_in_a_temporary_folder() {
        let ping = Path::new("/System/Library/Sounds/Ping.aiff");
        if !ping.is_file() { return; }
        let d = tmp("sound");
        // A copy in the temporary folder: the tools only ever work on that.
        let src = d.join("ping.aiff");
        std::fs::copy(ping, &src).unwrap();
        let (m4a, fail) = ran("toM4a", std::slice::from_ref(&src), &d.join("w1"), None);
        assert_eq!((m4a, fail), (vec![d.join("ping (converted).m4a")], None));
        let (wav, fail) = ran("toWav", std::slice::from_ref(&src), &d.join("w2"), None);
        assert_eq!(fail, None);
        assert_eq!(&std::fs::read(&wav[0]).unwrap()[..4], b"RIFF");
        let (cut, fail) = ran("trim", std::slice::from_ref(&src), &d.join("w3"), Some(Trim { start: 0.1, end: 0.5 }));
        assert_eq!((cut, fail), (vec![d.join("ping (trimmed).m4a")], None));
        std::fs::remove_dir_all(&d).unwrap();
    }

    // ---- review fixes (20 Oct 2026): each of these failed before its fix ----

    /// A 320 by 240 picture of noise saved at this JPEG quality.
    fn noise_jpeg(at: &Path, quality: u8) {
        let (w, h) = (320u16, 240u16);
        let mut seed = 7u32;
        let px: Vec<u8> = (0..(w as usize * h as usize * 3)).map(|_| { seed = seed.wrapping_mul(1_103_515_245).wrapping_add(12_345); (seed >> 16) as u8 }).collect();
        jpeg_encoder::Encoder::new_file(at, quality).unwrap().encode(&px, w, h, jpeg_encoder::ColorType::Rgb).unwrap();
    }
    /// A picture already saved small, the way many web pictures come.
    fn small_jpeg(at: &Path) { noise_jpeg(at, 25) }
    fn only_these_in(d: &Path) -> Vec<String> {
        let mut v: Vec<String> = std::fs::read_dir(d).unwrap().flatten().map(|e| e.file_name().to_string_lossy().into_owned()).collect();
        v.sort();
        v
    }

    #[test]
    fn compress_never_keeps_a_result_that_is_not_smaller_than_the_original() {
        let d = tmp("notsmaller");
        let src = d.join("photo.jpg");
        small_jpeg(&src);
        let (made, fail) = ran("compress", std::slice::from_ref(&src), &d.join("w1"), None);
        assert_eq!((made, fail), (vec![], Some(Failure::Failed("notSmaller"))));
        assert_eq!(only_these_in(&d), vec!["photo.jpg"], "no bigger \"(smaller)\" file is left next to it");
        std::fs::remove_dir_all(&d).unwrap();
    }

    #[test]
    fn a_pdf_of_text_only_that_the_filter_cannot_shrink_gives_no_smaller_pdf() {
        let d = tmp("pdfnotsmaller");
        let txt = d.join("notes.txt");
        std::fs::write(&txt, "Only words here.\n".repeat(200)).unwrap();
        let (pdf, fail) = ran("toPdf", std::slice::from_ref(&txt), &d.join("w1"), None);
        assert_eq!(fail, None);
        let (small, fail) = ran("pdfCompress", std::slice::from_ref(&pdf[0]), &d.join("w2"), None);
        assert_eq!((small, fail), (vec![], Some(Failure::Failed("notSmaller"))));
        std::fs::remove_dir_all(&d).unwrap();
    }

    #[test]
    fn a_folder_result_that_cannot_be_finished_is_taken_away_not_left_half_filled() {
        let d = tmp("halffolder");
        let pages = d.join("pages");
        std::fs::create_dir(&pages).unwrap();
        std::fs::write(pages.join("page 1.pdf"), b"%PDF one").unwrap();
        // Page 2's name fits on its own, but not inside the deep folder the result goes to (macOS's 1024 byte path limit),
        // so putting it in fails after page 1 is already there.
        let long = format!("{} 2.pdf", "p".repeat(200));
        std::fs::write(pages.join(&long), b"%PDF two").unwrap();
        let mut deep = d.join("to");
        while deep.as_os_str().len() < 760 { deep = deep.join("x".repeat(60)); }
        std::fs::create_dir_all(&deep).unwrap();
        let r = place(&Out::Folder { tmp: pages }, &deep, "report", "pages", &Job::default());
        assert!(r.is_err(), "page 2 cannot go in");
        assert_eq!(std::fs::read_dir(&deep).unwrap().count(), 0, "no half filled \"report (pages)\" is left");
        std::fs::remove_dir_all(&d).unwrap();
    }

    #[test]
    fn a_place_that_cannot_be_written_is_found_before_any_tool_runs() {
        use std::os::unix::fs::PermissionsExt;
        let d = tmp("readonly");
        let src = d.join("a.png");
        jpeg(&src);
        let shut = d.join("shut");
        std::fs::create_dir(&shut).unwrap();
        std::fs::set_permissions(&shut, std::fs::Permissions::from_mode(0o500)).unwrap();
        let ran_tool = d.join("the tool ran");
        let work = d.join("work");
        let mut units = plan("toJpeg", std::slice::from_ref(&src), &work, &Prefs::usual(), None).unwrap();
        units[0].cmds = vec![Cmd { program: "/usr/bin/touch", args: vec![pth(&ran_tool)], guard: None }];
        let Ended { made, fail, .. } = run(&units, &work, &|_| Some(shut.clone()), &Job::default(), &|_, _, _| {});
        std::fs::set_permissions(&shut, std::fs::Permissions::from_mode(0o700)).unwrap();
        assert_eq!((made, fail), (vec![], Some(Failure::Failed("noPlace"))));
        assert!(!ran_tool.exists(), "nothing ran for a result that could not be saved");
        std::fs::remove_dir_all(&d).unwrap();
    }

    #[test]
    fn every_pdf_of_a_merge_is_checked_again_not_only_the_first() {
        let d = tmp("mergeswap");
        let pic = d.join("pic.jpg");
        jpeg(&pic);
        let (a, b, elsewhere) = (d.join("a.pdf"), d.join("b.pdf"), d.join("elsewhere.pdf"));
        for p in [&a, &b, &elsewhere] {
            assert!(std::process::Command::new(SIPS).args(["-s", "format", "pdf"]).arg(&pic).arg("--out").arg(p).output().unwrap().status.success());
        }
        let work = d.join("work");
        let units = plan("merge", &[a.clone(), b.clone()], &work, &Prefs::usual(), None).unwrap();
        // After the drop, the second PDF is swapped for a link to another one.
        std::fs::remove_file(&b).unwrap();
        std::os::unix::fs::symlink(&elsewhere, &b).unwrap();
        let Ended { made, fail, .. } = run(&units, &work, &|u| u.source.parent().map(Path::to_path_buf), &Job::default(), &|_, _, _| {});
        assert_eq!((made, fail), (vec![], Some(Failure::Failed("gone"))));
        assert!(!d.join("a (merged).pdf").exists());
        std::fs::remove_dir_all(&d).unwrap();
    }

    #[test]
    fn a_file_already_in_the_format_asked_for_is_left_as_it_is() {
        let d = tmp("alreadythat");
        let y = d.join("y.jpg");
        jpeg(&y);
        let x = d.join("x.png");
        assert!(std::process::Command::new(SIPS).args(["-s", "format", "png"]).arg(&y).arg("--out").arg(&x).output().unwrap().status.success());
        let (made, fail) = ran("toJpeg", &[x.clone(), y.clone()], &d.join("w1"), None);
        assert_eq!((made, fail), (vec![d.join("x (converted).jpg")], None));
        assert!(!d.join("y (converted).jpg").exists(), "a JPEG is not made into a JPEG again");
        std::fs::remove_dir_all(&d).unwrap();
    }

    #[test]
    fn a_web_page_to_pdf_never_takes_in_pictures_from_elsewhere_on_the_mac() {
        let d = tmp("htmlpics");
        std::fs::create_dir_all(d.join("other")).unwrap();
        std::fs::create_dir_all(d.join("downloads")).unwrap();
        let secret = d.join("other/secret.jpg");
        jpeg(&secret);
        let page = format!("<html><body><p>Fill in this form.</p><img src=\"../other/secret.jpg\"><img src=\"file://{}\"></body></html>", secret.display());
        // An HTML page, and the same page saved as a Word file, which the Mac's reader also takes as a web page.
        for name in ["form.html", "form.doc"] {
            let src = d.join("downloads").join(name);
            std::fs::write(&src, &page).unwrap();
            let (pdf, fail) = ran("toPdf", std::slice::from_ref(&src), &d.join(format!("w-{name}")), None);
            assert_eq!(fail, None, "{name}");
            let bytes = std::fs::read(&pdf[0]).unwrap();
            assert_eq!(&bytes[..4], b"%PDF");
            assert!(!bytes.windows(6).any(|w| w == b"/Image"), "{name}: the PDF has no picture in it");
        }
        std::fs::remove_dir_all(&d).unwrap();
    }

    #[test]
    fn stop_ends_the_tool_and_anything_it_started_at_once() {
        let d = tmp("group");
        let src = d.join("a.png");
        jpeg(&src);
        let pidfile = d.join("pid");
        let work = d.join("work");
        let mut units = plan("toJpeg", std::slice::from_ref(&src), &work, &Prefs::usual(), None).unwrap();
        // A tool that starts a helper of its own, which holds its output open.
        units[0].cmds = vec![Cmd { program: "/bin/sh", args: vec![os("-c"), os("sleep 8 & echo $! > \"$1\"; wait"), os("sh"), pth(&pidfile)], guard: None }];
        let job = std::sync::Arc::new(Job::default());
        let j = job.clone();
        std::thread::spawn(move || { std::thread::sleep(Duration::from_millis(400)); j.stop(); });
        let t0 = std::time::Instant::now();
        let fail = run(&units, &work, &|u| u.source.parent().map(Path::to_path_buf), &job, &|_, _, _| {}).fail;
        assert_eq!(fail, Some(Failure::Stopped));
        assert!(t0.elapsed() < Duration::from_secs(3), "stopped in a moment, not when the helper finished");
        let pid: i32 = std::fs::read_to_string(&pidfile).unwrap().trim().parse().unwrap();
        let gone = (0..60).any(|_| { let dead = unsafe { libc::kill(pid, 0) } != 0; if !dead { std::thread::sleep(Duration::from_millis(50)); } dead });
        assert!(gone, "the helper the tool started was ended too");
        std::fs::remove_dir_all(&d).unwrap();
    }

    #[test]
    fn the_tools_get_a_copy_of_exactly_the_file_that_was_opened_never_a_link_or_a_pipe() {
        let d = tmp("take");
        let f = d.join("photo.png");
        std::fs::write(&f, b"the dropped picture").unwrap();
        // A clone (same disk), a copy (another disk, small enough), and a big file on another disk, read where it is.
        for (n, may_clone, max) in [(1, true, COPY_MAX), (2, false, COPY_MAX), (3, false, 0)] {
            let copy = d.join(format!("copy {n}.png"));
            assert_eq!(take(&f, &copy, terms(may_clone, max), &Job::default()), Ok(()), "{n}");
            assert_eq!(std::fs::read(&copy).unwrap(), b"the dropped picture", "{n}");
            assert_eq!(std::fs::symlink_metadata(&copy).unwrap().file_type().is_symlink(), n == 3, "{n}");
        }
        // Changing the file afterwards changes nothing the tools read.
        std::fs::write(&f, b"swapped").unwrap();
        assert_eq!(std::fs::read(d.join("copy 1.png")).unwrap(), b"the dropped picture");
        assert_eq!(std::fs::read(d.join("copy 2.png")).unwrap(), b"the dropped picture");
        let link = d.join("link.png");
        std::os::unix::fs::symlink(&f, &link).unwrap();
        assert_eq!(take_input(&link, &d.join("from link.png"), None, &Job::default()), Err("gone"));
        assert!(!d.join("from link.png").exists());
        let pipe = d.join("pipe.png");
        let c = std::ffi::CString::new(pipe.to_str().unwrap()).unwrap();
        assert_eq!(unsafe { libc::mkfifo(c.as_ptr(), 0o600) }, 0);
        assert_eq!(take_input(&pipe, &d.join("from pipe.png"), None, &Job::default()), Err("gone"), "refused at once, never waiting on the pipe");
        // A folder is taken as a folder (it can be zipped); that is tested with `take_folder`. A path that is nothing is gone.
        assert_eq!(take_input(&d.join("nothing"), &d.join("from nothing"), None, &Job::default()), Err("gone"));
        assert_eq!(take_input(&d.join("missing.png"), &d.join("from missing.png"), None, &Job::default()), Err("gone"));
        std::fs::remove_dir_all(&d).unwrap();
    }

    #[test]
    fn one_bad_file_does_not_stop_the_others_and_is_named() {
        let d = tmp("onebad");
        let (a, c) = (d.join("a.png"), d.join("c.png"));
        jpeg(&a);
        jpeg(&c);
        let b = d.join("b.png");
        std::fs::write(&b, b"this is not a picture").unwrap();
        let work = d.join("work");
        let units = plan("toJpeg", &[a, b, c], &work, &Prefs::usual(), None).unwrap();
        let e = run(&units, &work, &|u| u.source.parent().map(Path::to_path_buf), &Job::default(), &|_, _, _| {});
        assert_eq!(e.fail, None, "the job went on to the end");
        assert_eq!(e.made.len(), 2, "the files after the bad one were made");
        assert_eq!(e.failed, 1);
        assert_eq!(e.first_failed, Some(("b.png".to_string(), "toolFailed")));
        let news = end_news(9, &e);
        assert_eq!((news["failed"].clone(), news["failedName"].clone()), (json!(1), json!("b.png")));
        // When nothing at all was made, the job fails for that file's reason, as before.
        let work2 = d.join("work2");
        let units = plan("toJpeg", std::slice::from_ref(&d.join("b.png")), &work2, &Prefs::usual(), None).unwrap();
        let e = run(&units, &work2, &|u| u.source.parent().map(Path::to_path_buf), &Job::default(), &|_, _, _| {});
        assert_eq!((e.made.len(), e.fail), (0, Some(Failure::Failed("toolFailed"))));
        std::fs::remove_dir_all(&d).unwrap();
    }

    #[test]
    fn a_finished_unit_takes_its_copy_and_output_out_of_the_work_folder_at_once() {
        let d = tmp("tidy");
        let (a, b) = (d.join("a.png"), d.join("b.png"));
        jpeg(&a);
        jpeg(&b);
        let work = d.join("work");
        let units = plan("toJpeg", &[a, b], &work, &Prefs::usual(), None).unwrap();
        let seen = Mutex::new(vec![]);
        let tell = |done: usize, _of: usize, _p: Option<f64>| { if done >= 1 { seen.lock().unwrap().push(work.join("0").exists()); } };
        let e = run(&units, &work, &|u| u.source.parent().map(Path::to_path_buf), &Job::default(), &tell);
        assert_eq!(e.made.len(), 2);
        let seen = seen.into_inner().unwrap();
        assert!(!seen.is_empty() && seen.iter().all(|x| !x), "the first file's folder was gone before the next one began");
        std::fs::remove_dir_all(&d).unwrap();
    }

    #[test]
    fn copying_a_big_file_for_the_tools_stops_when_the_job_is_stopped_and_leaves_no_copy() {
        let d = tmp("stopcopy");
        let f = d.join("big.mov");
        std::fs::write(&f, vec![7u8; 3 << 20]).unwrap();
        let job = Job::default();
        job.stop();
        let copy = d.join("copy.mov");
        assert_eq!(take(&f, &copy, terms(false, COPY_MAX), &job), Err("stopped"));
        assert!(!copy.exists(), "no half made copy is left");
        std::fs::remove_dir_all(&d).unwrap();
    }

    #[test]
    fn a_stopped_job_takes_away_the_folder_it_was_filling() {
        let d = tmp("stopfolder");
        let pages = d.join("pages");
        std::fs::create_dir(&pages).unwrap();
        for n in [1, 2] { std::fs::write(pages.join(format!("page {n}.pdf")), b"%PDF").unwrap(); }
        let to = d.join("to");
        std::fs::create_dir(&to).unwrap();
        let job = Job::default();
        job.stop();
        let r = place(&Out::Folder { tmp: pages }, &to, "report", "pages", &job);
        assert_eq!(r.map_err(|e| e.kind()), Err(std::io::ErrorKind::Interrupted));
        assert_eq!(std::fs::read_dir(&to).unwrap().count(), 0);
        std::fs::remove_dir_all(&d).unwrap();
    }

    #[test]
    fn quitting_can_wait_for_a_stopped_job_to_end_its_tool_and_remove_its_work_folder() {
        let d = tmp("quitwait");
        let src = d.join("a.png");
        jpeg(&src);
        let work = d.join("work");
        let mut units = plan("toJpeg", std::slice::from_ref(&src), &work, &Prefs::usual(), None).unwrap();
        units[0].cmds = vec![Cmd { program: "/bin/sleep", args: vec![os("30")], guard: None }];
        let job = std::sync::Arc::new(Job::default());
        let (j, w) = (job.clone(), work.clone());
        let t = std::thread::spawn(move || run(&units, &w, &|u| u.source.parent().map(Path::to_path_buf), &j, &|_, _, _| {}));
        assert!(!job.wait_ended(Duration::from_millis(300)), "still running");
        assert!(work.exists());
        job.stop();
        assert!(job.wait_ended(Duration::from_secs(2)), "ended within the wait");
        assert!(!work.exists(), "its work folder is gone by then");
        assert_eq!(t.join().unwrap().fail, Some(Failure::Stopped));
        std::fs::remove_dir_all(&d).unwrap();
    }

    #[test]
    fn a_work_folder_left_behind_is_removed_at_launch_but_never_through_a_link() {
        let d = tmp("sweep");
        let root = d.join("dev.companion.app-convert");
        std::fs::create_dir_all(root.join("7-123/0")).unwrap();
        std::fs::write(root.join("7-123/0/out.mp4"), b"half a video").unwrap();
        assert!(sweep(&root));
        assert!(!root.exists());
        assert!(!sweep(&root), "nothing there, nothing done");
        // A link in its place is left alone, and so is what it points at.
        let theirs = d.join("theirs");
        std::fs::create_dir(&theirs).unwrap();
        std::fs::write(theirs.join("keep.txt"), b"keep").unwrap();
        std::os::unix::fs::symlink(&theirs, &root).unwrap();
        assert!(!sweep(&root));
        assert!(std::fs::symlink_metadata(&root).unwrap().file_type().is_symlink());
        assert_eq!(std::fs::read(theirs.join("keep.txt")).unwrap(), b"keep");
        assert!(work_root().ends_with("dev.companion.app-convert"));
        std::fs::remove_dir_all(&d).unwrap();
    }

    #[test]
    fn the_pages_are_told_what_was_made_even_when_the_job_was_stopped_part_way() {
        let made = vec![p("/Users/me/Pictures/a (converted).png"), p("/Users/me/Pictures/b (converted).png")];
        let stopped = end_news(4, &Ended { made: made.clone(), fail: Some(Failure::Stopped), ..Default::default() });
        assert_eq!(stopped, json!({ "id": 4, "phase": "stopped", "made": [{ "name": "a (converted).png", "i": 0 }, { "name": "b (converted).png", "i": 1 }] }));
        let done = end_news(4, &Ended { made: made[..1].to_vec(), skipped: 1, ..Default::default() });
        assert_eq!(done, json!({ "id": 4, "phase": "done", "made": [{ "name": "a (converted).png", "i": 0 }], "skipped": 1 }));
        let failed = end_news(4, &Ended { fail: Some(Failure::Failed("noPlace")), ..Default::default() });
        assert_eq!(failed, json!({ "id": 4, "phase": "failed", "why": "noPlace", "made": [] }));
        // Names only: no path ever reaches the pages.
        assert!(!stopped.to_string().contains("/Users"));
    }

    #[test]
    fn the_real_pdf_compress_makes_a_new_pdf_in_a_temporary_folder() {
        let d = tmp("pdfsmall");
        let pic = d.join("pic.jpg");
        jpeg(&pic);
        let pdf = d.join("scan.pdf");
        let ok = std::process::Command::new(SIPS).args(["-s", "format", "pdf"]).arg(&pic).arg("--out").arg(&pdf).output().unwrap().status.success();
        assert!(ok);
        let (small, fail) = ran("pdfCompress", std::slice::from_ref(&pdf), &d.join("w1"), None);
        assert_eq!((small.clone(), fail), (vec![d.join("scan (smaller).pdf")], None));
        assert_eq!(&std::fs::read(&small[0]).unwrap()[..4], b"%PDF");
        std::fs::remove_dir_all(&d).unwrap();
    }

    // =====================================================================================================================
    // M13: more formats with the Mac's own tools (F19 build notes, "More formats"). Written before the code; each failed
    // first. The real tools run only on files in a temporary folder, and a test returns quietly when this Mac cannot do
    // what it checks (a tool or a format is missing here).
    // =====================================================================================================================

    // ---- what this Mac can write, read from the tools' own words ----

    /// Cut from what the tools said on macOS 27.0.1 (the lines that matter, in their own shape).
    const SIPS_SAYS: &str = "Supported Formats:\n-------------------------------------------\ncom.adobe.pdf                pdf   Writable\ncom.apple.icns               icns  Writable\ncom.compuserve.gif           gif   Writable\ncom.microsoft.bmp            bmp   Writable\ncom.microsoft.ico            ico   Writable\ncom.truevision.tga-image     tga   Writable\norg.webmproject.webp         webp  \npublic.avci                  avci  \npublic.avif                  avif  Writable\npublic.heic                  heic  Writable\npublic.jpeg                  jpeg  Writable\npublic.jpeg-2000             jp2   Writable\npublic.jpeg-xl               jxl   \npublic.png                   png   Writable\npublic.tiff                  tiff  Writable\n";
    const AFCONVERT_SAYS: &str = "Audio file and data formats:\n    '3gpp' = 3GP Audio (.3gp, .3gpp)\n               data_formats: 'aac ' 'aace' 'aacf' 'aacg' 'aach' 'aacl' \n                             'aacp' 'samr' 'sawb' 'usac' \n    'adts' = AAC ADTS (.aac, .adts)\n               data_formats: 'aac ' 'aach' 'aacp' \n    'AIFF' = AIFF (.aiff, .aif)\n               data_formats: I8 BEI16 BEI24 BEI32 \n    'caff' = CAF (.caf, .caff)\n               data_formats: '.mp1' '.mp2' '.mp3' 'aac ' 'aace' 'alac' \n                             'flac' I8 BEI16 LEI16 LEI24 \n    'flac' = FLAC (.flac)\n               data_formats: 'flac' \n    'm4af' = Apple MPEG-4 Audio (.m4a, .m4r)\n               data_formats: '.mp1' '.mp2' '.mp3' 'aac ' 'aace' 'alac' \n                             'flac' LEI16 BEI16 \n    'MPG3' = MPEG Layer 3 (.mp3, .mpeg, .mpa, .m1a, .m2a)\n               data_formats: '.mp3' \n    'Oggf' = Ogg (.opus, .ogg, .oga)\n               data_formats: 'opus' 'flac' 'vorb' \n    'WAVE' = WAVE (.wav)\n               data_formats: UI8 LEI16 LEI24 \n";
    const TEXTUTIL_SAYS: &str = "textutil: [command_option] [other_options] file...\nCommand options are (-help is the default):\n -help          show this message and exit\n -info          display information about each file\n -convert fmt   convert each input file to format (txt, rtf, rtfd,\n                html, doc, docx, odt, wordml, or webarchive)\n -cat fmt       concatenate input files into one output file\n";
    const AVCONVERT_SAYS: &str = "usage: avconvert [--param <value> ...]\n\n    Supported presets:\n        Preset640x480\n        Preset960x540\n        Preset1280x720\n        Preset1920x1080\n        PresetAppleM4A\n        PresetAppleM4V720pHD\n        PresetHEVC1920x1080\n        PresetHEVCHighestQuality\n        PresetHighestQuality\n        PresetLowQuality\n";

    fn this_mac() -> Caps { Caps::probe(SIPS_SAYS, AFCONVERT_SAYS, TEXTUTIL_SAYS, AVCONVERT_SAYS, true) }

    #[test]
    fn what_the_tools_say_they_can_write_is_read_from_their_own_words() {
        let c = this_mac();
        for f in ["gif", "bmp", "jp2", "tga", "avif", "icns", "ico"] { assert!(c.image_ok(f), "{f}"); }
        assert!(!c.image_ok("webp") && !c.image_ok("jxl"), "read only here");
        assert!(c.image_ok("png") && c.image_ok("heic"), "the usual ones are always there");
        for (f, d) in [("flac", "flac"), ("caff", "LEI16"), ("m4af", "alac"), ("adts", "aac")] { assert!(c.audio_ok(f, d), "{f} {d}"); }
        assert!(!c.audio_ok("flac", "alac"), "a data format only counts inside the file format that lists it");
        assert!(c.audio_ok("WAVE", "LEI16") && c.audio_ok("m4af", "aac"), "the usual ones are always there");
        for f in ["doc", "odt", "wordml"] { assert!(c.doc_ok(f), "{f}"); }
        assert!(c.doc_ok("pdf") && c.doc_ok("docx"));
        assert!(!c.doc_ok("rtfd") && !c.doc_ok("webarchive"), "listed by textutil but never offered: they would carry pictures from elsewhere on the Mac");
        for pr in ["PresetHEVCHighestQuality", "PresetAppleM4V720pHD", "Preset640x480", "Preset1280x720", "Preset1920x1080"] { assert!(c.preset_ok(pr), "{pr}"); }
        assert!(!c.preset_ok("PresetAppleProRes422LPCM") && !c.preset_ok("nonsense"));
        // Nothing said at all (a tool that would not run): only what every Mac has.
        let none = Caps::probe("", "", "", "", false);
        assert!(!none.image_ok("gif") && !none.doc_ok("odt") && !none.preset_ok("PresetHEVCHighestQuality") && !none.gray);
        assert!(none.image_ok("png") && none.doc_ok("html") && none.audio_ok("AIFF", "BEI16") && none.preset_ok("PresetHighestQuality"));
    }

    #[test]
    fn only_what_the_probe_found_is_offered() {
        let u = Prefs::usual();
        let c = this_mac();
        let png = acts(offer(&ps(&["/a/x.png"]), &c, &u));
        assert_eq!(png, vec!["toJpeg", "toHeic", "toTiff", "toGif", "toBmp", "toJp2", "toTga", "toAvif", "resize", "compress", "turnRight", "turnLeft", "turnAround", "flipHorizontal", "flipVertical", "grayscale", "stripInfo", "thumbnails", "toIcns", "toIco", "imageToPdf", "zip"]);
        assert!(!png.contains(&"toWebp"), "this Mac reads WebP but cannot write it");
        let doc = acts(offer(&ps(&["/a/x.docx"]), &c, &u));
        assert_eq!(doc, vec!["toPdf", "toText", "toRtf", "toHtml", "toDoc", "toOdt", "toWordml", "zip"]);
        let wav = acts(offer(&ps(&["/a/x.wav"]), &c, &u));
        assert_eq!(wav, vec!["toM4a", "toAiff", "toAlac", "toCaf", "toFlac", "toAac", "trim", "mono", "stereo", "sampleRate", "zip"]);
        let mov = acts(offer(&ps(&["/a/x.mov"]), &c, &u));
        assert_eq!(mov, vec!["toMp4", "toM4v", "soundOnly", "trim", "toHevc", "video480", "video720", "video1080", "stillStart", "stillMiddle", "zip"]);
        // The same Mac without the grey profile or the extra presets simply offers less.
        let bare = Caps::probe(SIPS_SAYS, AFCONVERT_SAYS, TEXTUTIL_SAYS, "Supported presets:\n PresetHighestQuality\n", false);
        let png = acts(offer(&ps(&["/a/x.png"]), &bare, &u));
        assert!(!png.contains(&"grayscale"));
        assert_eq!(acts(offer(&ps(&["/a/x.mov"]), &bare, &u)), vec!["toMp4", "soundOnly", "trim", "stillStart", "stillMiddle", "zip"]);
        // Formats this Mac cannot write have no action at all, so there is nothing to offer for them.
        for id in png.iter().chain(&wav).chain(&mov).chain(&doc) {
            assert!(!["toMp3", "toOgg", "toOpus", "toWebm", "toMkv", "toAvi", "toWma", "toJxl", "toRtfd", "toWebarchive", "toProRes"].contains(id), "{id}");
        }
    }

    #[test]
    fn the_real_tools_of_this_mac_say_what_they_write() {
        if !Path::new(SIPS).is_file() { return; }
        let c = probe_tools();
        assert!(c.image_ok("png") && c.image_ok("jpeg") && c.image_ok("heic") && c.image_ok("tiff"));
        // Whatever the extra formats are, a format the Mac lists as writable has to really be written (checked below).
        let r = Caps::probe("", "", "", "", false);
        assert!(!r.image_ok("gif"));
    }

    // ---- kinds: folders, zips, anything else ----

    #[test]
    fn a_folder_is_a_folder_a_zip_an_archive_and_any_other_file_only_gets_zipped() {
        let d = tmp("kinds");
        std::fs::create_dir(d.join("Photos.png")).unwrap();
        assert_eq!(kind_at(&d.join("Photos.png")), Kind::Folder, "a folder named like a picture is still a folder");
        assert_eq!(kind_at(&p("/a/x.zip")), Kind::Archive);
        assert_eq!(kind_at(&p("/a/x.pages")), Kind::Other);
        assert_eq!(kind_at(&p("/a/x.PNG")), Kind::Image);
        // One folder: work on it as a project first (M15: the most natural "help me with this"), or zip it.
        assert_eq!(offer(&[d.join("Photos.png")], &Caps::core(), &Prefs::usual()), Offer::Actions(Kind::Folder, vec![OPEN_PROJECT, "zip"]));
        // Two folders cannot both be the project: they are only zipped.
        std::fs::create_dir(d.join("Other")).unwrap();
        assert_eq!(offer(&[d.join("Photos.png"), d.join("Other")], &Caps::core(), &Prefs::usual()), Offer::Actions(Kind::Folder, vec!["zip", "zipTogether"]));
        // A loose file is never offered as a project.
        assert!(!matches!(offer(&[p("/a/x.pages")], &Caps::core(), &Prefs::usual()), Offer::Actions(_, a) if a.contains(&OPEN_PROJECT)));
        assert_eq!((Kind::Archive.id(), Kind::Folder.id(), Kind::Other.id()), ("archive", "folder", "other"));
        std::fs::remove_dir_all(&d).unwrap();
    }

    // ---- the argument lists of every new action ----

    #[test]
    fn more_picture_formats_are_made_by_sips() {
        for (a, f, e) in [("toGif", "gif", "gif"), ("toBmp", "bmp", "bmp"), ("toJp2", "jp2", "jp2"), ("toTga", "tga", "tga"), ("toAvif", "avif", "avif")] {
            let u = one(a, "/a/x.png");
            assert_eq!(args(&u.cmds[0]), vec!["-s".to_string(), "format".into(), f.into(), "/w/0/in.png".into(), "--out".into(), format!("/w/0/out.{e}")], "{a}");
            assert_eq!((u.cmds[0].program, u.label), ("/usr/bin/sips", "converted"));
        }
        // An icon is a square picture at the size the icon formats take: a picture that is not square is refused first.
        let i = one("toIcns", "/a/x.png");
        assert_eq!(args(&i.cmds[0]), vec!["-s", "format", "icns", "-z", "512", "512", "/w/0/in.png", "--out", "/w/0/out.icns"]);
        assert!(i.square);
        let o = one("toIco", "/a/x.png");
        assert_eq!(args(&o.cmds[0]), vec!["-s", "format", "ico", "-z", "256", "256", "/w/0/in.png", "--out", "/w/0/out.ico"]);
        assert!(o.square && !one("toGif", "/a/x.png").square);
    }

    #[test]
    fn turning_flipping_and_greying_a_picture_keeps_a_format_the_mac_can_write() {
        let r = one("turnRight", "/a/x.jpg");
        assert_eq!(args(&r.cmds[0]), vec!["-r", "90", "/w/0/in.jpg", "--out", "/w/0/out.jpg"]);
        assert_eq!(r.label, "turned");
        assert_eq!(args(&one("turnLeft", "/a/x.png").cmds[0]), vec!["-r", "270", "/w/0/in.png", "--out", "/w/0/out.png"]);
        assert_eq!(args(&one("turnAround", "/a/x.heic").cmds[0]), vec!["-r", "180", "/w/0/in.heic", "--out", "/w/0/out.heic"]);
        let f = one("flipHorizontal", "/a/x.png");
        assert_eq!((args(&f.cmds[0]), f.label), (vec!["-f".to_string(), "horizontal".into(), "/w/0/in.png".into(), "--out".into(), "/w/0/out.png".into()], "flipped"));
        assert_eq!(args(&one("flipVertical", "/a/x.png").cmds[0])[..2], ["-f", "vertical"]);
        // A format sips can only read is saved as a PNG.
        assert_eq!(args(&one("turnRight", "/a/x.webp").cmds[0]), vec!["-r", "90", "-s", "format", "png", "/w/0/in.webp", "--out", "/w/0/out.png"]);
        let g = one("grayscale", "/a/x.jpg");
        assert_eq!(args(&g.cmds[0]), vec!["-m", GRAY_PROFILE, "/w/0/in.jpg", "--out", "/w/0/out.jpg"]);
        assert_eq!(g.label, "gray");
        // The grey profile only works for these four; a GIF or BMP comes out as a PNG.
        assert_eq!(args(&one("grayscale", "/a/x.gif").cmds[0]), vec!["-m", GRAY_PROFILE, "-s", "format", "png", "/w/0/in.gif", "--out", "/w/0/out.png"]);
    }

    #[test]
    fn taking_off_location_and_camera_details_and_making_small_sizes_use_the_fixed_picture_script() {
        let s = one("stripInfo", "/a/x.jpg");
        let a = args(&s.cmds[0]);
        assert_eq!((s.cmds[0].program, &a[..2], &a[4..]), ("/usr/bin/osascript", &["-l".to_string(), "JavaScript".into()][..], &["--".to_string(), "strip".into(), "/w/0/out.jpg".into(), "/w/0/in.jpg".into()][..]));
        assert_eq!((s.label, s.out.clone()), ("cleaned", Out::File { tmp: p("/w/0/out.jpg"), ext: "jpg".into() }));
        assert_eq!(args(&one("stripInfo", "/a/x.heic").cmds[0])[5..], ["strip", "/w/0/out.heic", "/w/0/in.heic"]);
        let t = one("thumbnails", "/a/x.png");
        assert_eq!((t.label, t.out.clone()), ("thumbnails", Out::Folder { tmp: p("/w/0/out") }));
        assert_eq!(args(&t.cmds[0])[5..], ["thumbs", "/w/0/out", "/w/0/in.png"]);
        // One script text each, never holding a name from a file.
        assert_eq!(args(&s.cmds[0])[3], args(&t.cmds[0])[3]);
        assert_ne!(args(&s.cmds[0])[3], args(&one("split", "/a/x.pdf").cmds[0])[3], "the picture and video jobs have a script of their own");
        assert!(!args(&s.cmds[0])[3].contains("/a/"));
    }

    #[test]
    fn pictures_become_pdfs_one_each_or_all_in_one() {
        let u = one("imageToPdf", "/a/x.jpg");
        assert_eq!((u.label, u.out.clone()), ("converted", Out::File { tmp: p("/w/0/out.pdf"), ext: "pdf".into() }));
        assert_eq!(args(&u.cmds[0])[5..], ["fromImages", "/w/0/out.pdf", "/w/0/in.jpg"]);
        let m = plan("imagesToPdf", &ps(&["/a/one.png", "/a/two.jpg", "/a/three.heic"]), &p("/w"), &Prefs::usual(), None).unwrap();
        assert_eq!(m.len(), 1, "one PDF");
        assert_eq!((m[0].label, m[0].source.clone()), ("merged", p("/a/one.png")));
        assert_eq!(args(&m[0].cmds[0])[5..], ["fromImages", "/w/0/out.pdf", "/w/0/in 1.png", "/w/0/in 2.jpg", "/w/0/in 3.heic"]);
        assert_eq!(plan("imagesToPdf", &ps(&["/a/one.png"]), &p("/w"), &Prefs::usual(), None), Err("notOffered"), "several only");
    }

    #[test]
    fn pdf_pages_are_turned_taken_out_or_kept_and_the_words_are_read_out() {
        let r = one("turnRight", "/a/x.pdf");
        assert_eq!(args(&r.cmds[0])[5..], ["rotate", "/w/0/out.pdf", "/w/0/in.pdf", "90"]);
        assert_eq!(r.label, "turned");
        assert_eq!(args(&one("turnLeft", "/a/x.pdf").cmds[0])[8], "270");
        assert_eq!(args(&one("turnAround", "/a/x.pdf").cmds[0])[8], "180");
        for (a, mode, label) in [("dropFirstPage", "dropFirst", "without first page"), ("dropLastPage", "dropLast", "without last page"), ("keepFirstPage", "keepFirst", "first page")] {
            let u = one(a, "/a/x.pdf");
            assert_eq!(args(&u.cmds[0])[5..], ["pages", "/w/0/out.pdf", "/w/0/in.pdf", mode], "{a}");
            assert_eq!(u.label, label);
        }
        let t = one("pdfText", "/a/x.pdf");
        assert_eq!(args(&t.cmds[0])[5..], ["text", "/w/0/out.txt", "/w/0/in.pdf"]);
        assert_eq!((t.label, t.out.clone()), ("text", Out::File { tmp: p("/w/0/out.txt"), ext: "txt".into() }));
    }

    #[test]
    fn more_document_formats_use_textutil_and_markdown_is_read_as_plain_text() {
        for (a, f, e) in [("toDoc", "doc", "doc"), ("toOdt", "odt", "odt"), ("toWordml", "wordml", "xml")] {
            let u = one(a, "/a/x.docx");
            assert_eq!(args(&u.cmds[0]), vec!["-noload".to_string(), "-convert".into(), f.into(), "-output".into(), format!("/w/0/out.{e}"), "--".into(), "/w/0/in.docx".into()], "{a}");
            assert_eq!(u.out, Out::File { tmp: p(&format!("/w/0/out.{e}")), ext: e.into() });
        }
        // A markdown file is text: textutil is told so, whatever its name says, and nothing is rendered.
        assert_eq!(args(&one("toText", "/a/notes.md").cmds[0]), vec!["-noload", "-format", "txt", "-convert", "txt", "-encoding", "UTF-8", "-output", "/w/0/out.txt", "--", "/w/0/in.md"]);
        let pdf = one("toPdf", "/a/notes.markdown");
        assert_eq!(args(&pdf.cmds[0]), vec!["-noload", "-format", "txt", "-convert", "rtf", "-output", "/w/0/mid.rtf", "--", "/w/0/in.markdown"]);
        assert_eq!(args(&one("toDocx", "/a/x.rtf").cmds[0])[1], "-convert", "other documents get no forced input format");
        assert_eq!(ext_of(&p("/a/x.markdown")), "md");
    }

    #[test]
    fn more_sound_formats_sample_rates_and_channels_use_afconvert() {
        for (a, ext, file, data) in [("toAlac", "m4a", "m4af", "alac"), ("toCaf", "caf", "caff", "LEI16"), ("toFlac", "flac", "flac", "flac"), ("toAac", "aac", "adts", "aac")] {
            let u = one(a, "/a/x.wav");
            assert_eq!(args(&u.cmds[0]), vec!["-f".to_string(), file.into(), "-d".into(), data.into(), "/w/0/in.wav".into(), format!("/w/0/out.{ext}")], "{a}");
            assert_eq!((u.cmds[0].program, u.label), ("/usr/bin/afconvert", "converted"));
        }
        // Mono, stereo and a new rate keep the sound's own format when the Mac can write it, else they make an M4A.
        assert_eq!(args(&one("mono", "/a/x.wav").cmds[0]), vec!["-f", "WAVE", "-d", "LEI16", "-c", "1", "/w/0/in.wav", "/w/0/out.wav"]);
        assert_eq!(args(&one("stereo", "/a/x.flac").cmds[0]), vec!["-f", "flac", "-d", "flac", "-c", "2", "/w/0/in.flac", "/w/0/out.flac"]);
        assert_eq!(args(&one("mono", "/a/x.mp3").cmds[0]), vec!["-f", "m4af", "-d", "aac", "-c", "1", "/w/0/in.mp3", "/w/0/out.m4a"]);
        assert_eq!(args(&one("sampleRate", "/a/x.aiff").cmds[0]), vec!["-f", "AIFF", "-d", "BEI16@44100", "/w/0/in.aiff", "/w/0/out.aiff"]);
        let slow = Prefs { rate: 16_000, ..Prefs::usual() };
        let u = plan("sampleRate", &ps(&["/a/x.m4a"]), &p("/w"), &slow, None).unwrap().remove(0);
        assert_eq!(args(&u.cmds[0]), vec!["-f", "m4af", "-d", "aac@16000", "/w/0/in.m4a", "/w/0/out.m4a"]);
        assert_eq!((u.label, one("mono", "/a/x.wav").label, one("stereo", "/a/x.wav").label), ("resampled", "mono", "stereo"));
        assert_eq!(args(&one("mono", "/a/x.au").cmds[0])[1], "m4af");
    }

    #[test]
    fn more_video_formats_sizes_and_still_pictures_use_avconvert_presets_and_a_fixed_script() {
        assert_eq!(args(&one("toM4v", "/a/x.mov").cmds[0]), vec!["--source", "/w/0/in.mov", "--output", "/w/0/out.m4v", "--preset", "PresetHighestQuality", "--progress"]);
        let h = one("toHevc", "/a/x.mov");
        assert_eq!(args(&h.cmds[0]), vec!["--source", "/w/0/in.mov", "--output", "/w/0/out.mp4", "--preset", "PresetHEVCHighestQuality", "--progress"]);
        assert!(h.shrink, "its label promises a smaller video, so one that is not smaller is not kept");
        for (a, preset) in [("video480", "Preset640x480"), ("video720", "Preset1280x720"), ("video1080", "Preset1920x1080")] {
            let u = one(a, "/a/x.mov");
            assert_eq!(args(&u.cmds[0]), vec!["--source".to_string(), "/w/0/in.mov".into(), "--output".into(), "/w/0/out.mp4".into(), "--preset".into(), preset.into(), "--progress".into()], "{a}");
            assert!(u.shrink, "{a}: a size choice that does not make the file smaller makes nothing");
            assert_eq!(u.label, "smaller");
        }
        let s = one("stillStart", "/a/x.mov");
        assert_eq!(args(&s.cmds[0])[5..], ["stillStart", "/w/0/out.png", "/w/0/in.mov"]);
        assert_eq!((s.label, s.out.clone()), ("still", Out::File { tmp: p("/w/0/out.png"), ext: "png".into() }));
        assert_eq!(args(&one("stillMiddle", "/a/x.mp4").cmds[0])[5], "stillMiddle");
    }

    #[test]
    fn zipping_stages_the_files_under_their_own_names_and_unzipping_keeps_the_quarantine() {
        let z = one("zip", "/a/My Notes.txt");
        assert_eq!(z.cmds[0].program, "/usr/bin/ditto");
        assert_eq!(args(&z.cmds[0]), vec!["-c", "-k", "--norsrc", "--noextattr", "--noacl", "/w/0/stage", "/w/0/out.zip"]);
        assert_eq!(z.inputs[0].copy, p("/w/0/stage/My Notes.txt"), "the zip holds the file under its own name");
        assert_eq!((z.label, z.stem.as_deref()), ("zipped", Some("My Notes.txt")));
        let t = plan("zipTogether", &ps(&["/a/one.txt", "/b/one.txt", "/b/two.png"]), &p("/w"), &Prefs::usual(), None);
        // Different kinds cannot be dropped together, but several of one kind (or of no known kind) go into one zip.
        assert_eq!(t, Err("notOffered"));
        let t = plan("zipTogether", &ps(&["/a/one.txt", "/b/one.txt", "/b/two.txt"]), &p("/w"), &Prefs::usual(), None).unwrap();
        assert_eq!(t.len(), 1);
        let names: Vec<PathBuf> = t[0].inputs.iter().map(|i| i.copy.clone()).collect();
        assert_eq!(names, vec![p("/w/0/stage/one.txt"), p("/w/0/stage/one 2.txt"), p("/w/0/stage/two.txt")], "a name used twice gets a number, nothing is overwritten");
        assert_eq!(t[0].stem.as_deref(), Some("one.txt and 2 more"));
        let u = one("unzip", "/a/x.zip");
        assert_eq!(args(&u.cmds[0]), vec!["-x", "-k", "--qtn", "--norsrc", "--noacl", "/w/0/in.zip", "/w/0/out"]);
        assert_eq!((u.label, u.out.clone(), u.unzip), ("unzipped", Out::Folder { tmp: p("/w/0/out") }, true));
        assert_eq!(u.cmds[0].guard, Some(Guard { dir: p("/w/0/out"), limits: UNZIP_LIMITS }));
        assert_eq!(one("zip", "/a/x.txt").cmds[0].guard, None);
    }

    // ---- reading a zip before anything is extracted ----

    struct Ze<'a> { name: &'a str, size: u32, mode: u32, flags: u16, host: u8 }
    fn ze<'a>(name: &'a str) -> Ze<'a> { Ze { name, size: 5, mode: 0o100644, flags: 0, host: 3 } }
    /// A zip's central directory (the part read first), with the entries as described. No data: it is only read, never extracted.
    fn zip_with(entries: &[Ze]) -> Vec<u8> {
        let mut cd: Vec<u8> = vec![];
        for e in entries {
            cd.extend(0x0201_4b50u32.to_le_bytes());
            cd.extend(((e.host as u16) << 8 | 20).to_le_bytes());
            cd.extend(20u16.to_le_bytes());
            cd.extend(e.flags.to_le_bytes());
            cd.extend([0u8; 2 + 2 + 2 + 4]);
            cd.extend(e.size.to_le_bytes());
            cd.extend(e.size.to_le_bytes());
            cd.extend((e.name.len() as u16).to_le_bytes());
            cd.extend([0u8; 2 + 2 + 2 + 2]);
            cd.extend((e.mode << 16).to_le_bytes());
            cd.extend(0u32.to_le_bytes());
            cd.extend(e.name.as_bytes());
        }
        let mut z = vec![];
        z.extend(&cd);
        z.extend(0x0605_4b50u32.to_le_bytes());
        z.extend([0u8; 4]);
        z.extend((entries.len() as u16).to_le_bytes());
        z.extend((entries.len() as u16).to_le_bytes());
        z.extend((cd.len() as u32).to_le_bytes());
        z.extend(0u32.to_le_bytes());
        z.extend(0u16.to_le_bytes());
        z
    }
    fn vet(entries: &[Ze], lim: Limits) -> Result<(), &'static str> { zip_vet_reader(&mut std::io::Cursor::new(zip_with(entries)), lim) }
    const LIM: Limits = Limits { files: 10, bytes: 1000 };

    #[test]
    fn a_zip_is_read_before_it_is_extracted_and_refused_when_it_could_do_harm() {
        assert_eq!(vet(&[ze("a.txt"), Ze { mode: 0o040755, size: 0, ..ze("d/") }, ze("d/b.txt")], LIM), Ok(()));
        assert_eq!(vet(&[ze("__MACOSX/._a.txt"), ze("my..file.txt"), ze("a/b..c")], LIM), Ok(()), "dots in a name are not a way out");
        // Paths that would land outside the folder.
        for bad in ["../evil.txt", "a/../../evil.txt", "/etc/evil", "a/..", "..", "a\\..\\evil.txt", "a/./../../b", ""] {
            assert_eq!(vet(&[ze(bad)], LIM), Err("unsafeZip"), "{bad:?}");
        }
        assert_eq!(vet(&[ze("a\0b")], LIM), Err("unsafeZip"));
        // A link could point anywhere, and a later entry could then be written through it: no link is ever made.
        assert_eq!(vet(&[Ze { mode: 0o120777, ..ze("link") }], LIM), Err("unsafeZip"));
        assert_eq!(vet(&[ze("a.txt"), Ze { mode: 0o120777, ..ze("d/link") }], LIM), Err("unsafeZip"));
        // Made on Windows, the mode bits still count: ditto reads them whatever the host says (checked in its own test).
        assert_eq!(vet(&[Ze { host: 0, mode: 0o120000, ..ze("a.txt") }], LIM), Err("unsafeZip"));
        // A password.
        assert_eq!(vet(&[Ze { flags: 1, ..ze("a.txt") }], LIM), Err("zipLocked"));
        // Too many files, or too much once opened (a zip bomb), by what the zip says.
        let many: Vec<Ze> = (0..11).map(|_| ze("a.txt")).collect();
        assert_eq!(vet(&many, LIM), Err("tooBig"));
        assert_eq!(vet(&[Ze { size: 600, ..ze("a") }, Ze { size: 600, ..ze("b") }], LIM), Err("tooBig"));
        assert_eq!(vet(&[Ze { size: 0xFFFF_FFFF, ..ze("big") }], Limits { files: 10, bytes: u64::MAX }), Err("tooBig"), "zip64 sizes are not read at all");
        // Not a zip at all, and an empty one.
        assert_eq!(zip_vet_reader(&mut std::io::Cursor::new(b"this is not a zip file at all".to_vec()), LIM), Err("notZip"));
        assert_eq!(zip_vet_reader(&mut std::io::Cursor::new(vec![]), LIM), Err("notZip"));
        assert_eq!(vet(&[], LIM), Err("notZip"));
        let mut cut = zip_with(&[ze("a.txt")]);
        cut.truncate(cut.len() - 30);
        assert_eq!(zip_vet_reader(&mut std::io::Cursor::new(cut), LIM), Err("notZip"));
        // A directory that says it has a million entries is not read to the end.
        let mut lie = zip_with(&[ze("a.txt")]);
        let n = lie.len();
        lie[n - 10..n - 6].copy_from_slice(&u32::MAX.to_le_bytes());
        assert_eq!(zip_vet_reader(&mut std::io::Cursor::new(lie), LIM), Err("tooBig"));
        assert_eq!(UNZIP_LIMITS, Limits { files: 10_000, bytes: 4 << 30 });
    }

    // ---- counting what is on disk ----

    #[test]
    fn a_tree_on_disk_is_counted_without_following_a_link_and_refused_when_too_big_or_not_allowed_links() {
        let d = tmp("tree");
        std::fs::create_dir_all(d.join("a/b")).unwrap();
        std::fs::write(d.join("a/one.txt"), vec![1u8; 100]).unwrap();
        std::fs::write(d.join("a/b/two.txt"), vec![2u8; 200]).unwrap();
        assert_eq!(tree_stats(&d.join("a"), Limits { files: 10, bytes: 1000 }, false), Ok((3, 300)), "a folder and two files, not counting the one asked about");
        assert_eq!(tree_stats(&d.join("a"), Limits { files: 2, bytes: 1000 }, false), Err("tooBig"));
        assert_eq!(tree_stats(&d.join("a"), Limits { files: 10, bytes: 299 }, false), Err("tooBig"));
        // A link to a huge place is one entry, not what it points at.
        std::os::unix::fs::symlink("/System", d.join("a/b/to system")).unwrap();
        assert_eq!(tree_stats(&d.join("a"), Limits { files: 10, bytes: 1000 }, true), Ok((4, 300)));
        assert_eq!(tree_stats(&d.join("a"), Limits { files: 10, bytes: 1000 }, false), Err("unsafeZip"));
        // Folders nested absurdly deep are refused rather than walked.
        let mut deep = d.join("deep");
        for _ in 0..70 { deep = deep.join("x"); }
        std::fs::create_dir_all(&deep).unwrap();
        assert_eq!(tree_stats(&d.join("deep"), Limits { files: 1000, bytes: 1000 }, true), Err("tooBig"));
        std::fs::remove_dir_all(&d).unwrap();
    }

    #[test]
    fn a_tool_that_writes_more_than_the_cap_is_ended_at_once() {
        let d = tmp("guard");
        let out = d.join("out");
        std::fs::create_dir(&out).unwrap();
        let big = Cmd { program: "/bin/sh", args: vec![os("-c"), os("head -c 3000000 /dev/zero > \"$1/big\"; sleep 20"), os("sh"), pth(&out)], guard: Some(Guard { dir: out.clone(), limits: Limits { files: 100, bytes: 1_000_000 } }) };
        let t0 = std::time::Instant::now();
        assert_eq!(exec(&big, &Job::default(), &|_| {}), Err(Failure::Failed("tooBig")));
        assert!(t0.elapsed() < Duration::from_secs(5), "ended in a moment, not when the tool was done");
        // A link made meanwhile is refused too.
        let out2 = d.join("out2");
        std::fs::create_dir(&out2).unwrap();
        let link = Cmd { program: "/bin/sh", args: vec![os("-c"), os("ln -s /etc \"$1/l\"; sleep 20"), os("sh"), pth(&out2)], guard: Some(Guard { dir: out2.clone(), limits: Limits { files: 100, bytes: 1_000_000 } }) };
        assert_eq!(exec(&link, &Job::default(), &|_| {}), Err(Failure::Failed("unsafeZip")));
        std::fs::remove_dir_all(&d).unwrap();
    }

    #[test]
    fn the_reasons_the_picture_and_pdf_scripts_give_are_told_apart() {
        for (said, why) in [("Error: Error: noText", "noText"), ("Error: Error: onePage", "onePage"), ("Error: Error: noFrame", "noFrame"), ("Error: Error: tooSmall", "tooSmall"), ("Error: Error: locked", "locked"), ("Error: Error: unreadable", "unreadable"), ("Error: Error: write", "toolFailed")] {
            let c = Cmd { program: "/bin/sh", args: vec![os("-c"), os(&format!("echo '{said}' >&2; exit 1"))], guard: None };
            assert_eq!(exec(&c, &Job::default(), &|_| {}), Err(Failure::Failed(why)), "{said}");
        }
    }

    // ---- folders and quarantine ----

    fn quarantine(p: &Path) -> Option<Vec<u8>> {
        use std::os::unix::ffi::OsStrExt;
        let c = std::ffi::CString::new(p.as_os_str().as_bytes()).unwrap();
        let name = std::ffi::CString::new("com.apple.quarantine").unwrap();
        let mut buf = vec![0u8; 256];
        let n = unsafe { libc::getxattr(c.as_ptr(), name.as_ptr(), buf.as_mut_ptr().cast(), buf.len(), 0, libc::XATTR_NOFOLLOW) };
        (n >= 0).then(|| buf[..n as usize].to_vec())
    }
    fn set_quarantine(p: &Path) {
        use std::os::unix::ffi::OsStrExt;
        let c = std::ffi::CString::new(p.as_os_str().as_bytes()).unwrap();
        let name = std::ffi::CString::new("com.apple.quarantine").unwrap();
        let v = b"0083;5f000000;Safari;";
        assert_eq!(unsafe { libc::setxattr(c.as_ptr(), name.as_ptr(), v.as_ptr().cast(), v.len(), 0, 0) }, 0);
    }

    #[test]
    fn a_copy_made_for_the_tools_keeps_the_downloaded_from_the_internet_mark() {
        let d = tmp("qtn");
        let f = d.join("download.zip");
        std::fs::write(&f, b"PK").unwrap();
        set_quarantine(&f);
        for (n, may_clone) in [(1, true), (2, false)] {
            let copy = d.join(format!("copy {n}.zip"));
            assert_eq!(take(&f, &copy, terms(may_clone, COPY_MAX), &Job::default()), Ok(()));
            assert!(quarantine(&copy).is_some(), "copy {n} keeps the mark, so what is unzipped from it keeps it too");
        }
        let plain = d.join("plain.zip");
        std::fs::write(&plain, b"PK").unwrap();
        let copy = d.join("plain copy.zip");
        assert_eq!(take(&plain, &copy, terms(false, COPY_MAX), &Job::default()), Ok(()));
        assert!(quarantine(&copy).is_none(), "no mark is made up");
        std::fs::remove_dir_all(&d).unwrap();
    }

    #[test]
    fn a_folder_is_copied_for_the_tools_without_following_a_link_and_only_when_it_is_not_too_big() {
        let d = tmp("takedir");
        let src = d.join("Photos");
        std::fs::create_dir_all(src.join("sub")).unwrap();
        std::fs::write(src.join("a.txt"), b"alpha").unwrap();
        std::fs::write(src.join("sub/b.txt"), b"beta").unwrap();
        std::os::unix::fs::symlink("/etc/hosts", src.join("link")).unwrap();
        for (n, may_clone) in [(1, true), (2, false)] {
            let copy = d.join(format!("stage {n}")).join("Photos");
            std::fs::create_dir_all(copy.parent().unwrap()).unwrap();
            assert_eq!(take_folder(&src, &copy, may_clone, FOLDER_LIMITS, None, &Job::default()), Ok(()), "{n}");
            assert_eq!(std::fs::read(copy.join("sub/b.txt")).unwrap(), b"beta", "{n}");
            assert_eq!(std::fs::read_link(copy.join("link")).unwrap(), Path::new("/etc/hosts"), "{n}: a link is copied as a link, never followed");
        }
        // Changing the folder afterwards changes nothing in the copy.
        std::fs::write(src.join("a.txt"), b"changed").unwrap();
        assert_eq!(std::fs::read(d.join("stage 2/Photos/a.txt")).unwrap(), b"alpha");
        // Too big by files or bytes: nothing is copied.
        for lim in [Limits { files: 2, bytes: 1 << 20 }, Limits { files: 100, bytes: 3 }] {
            let copy = d.join("big stage").join("Photos");
            std::fs::create_dir_all(copy.parent().unwrap()).unwrap();
            assert_eq!(take_folder(&src, &copy, false, lim, None, &Job::default()), Err("tooBig"));
            assert!(!copy.exists());
        }
        // A link in the folder's place is refused, and a stopped copy leaves nothing half made.
        let link = d.join("PhotosLink");
        std::os::unix::fs::symlink(&src, &link).unwrap();
        assert_eq!(take_folder(&link, &d.join("from link"), false, FOLDER_LIMITS, None, &Job::default()), Err("gone"));
        let stopped = Job::default();
        stopped.stop();
        let copy = d.join("stopped").join("Photos");
        std::fs::create_dir_all(copy.parent().unwrap()).unwrap();
        assert_eq!(take_folder(&src, &copy, false, FOLDER_LIMITS, None, &stopped), Err("stopped"));
        assert!(!copy.exists());
        std::fs::remove_dir_all(&d).unwrap();
    }

    #[test]
    fn a_folder_result_is_put_in_place_with_everything_in_it() {
        let d = tmp("placetree");
        let out = d.join("out");
        std::fs::create_dir_all(out.join("Photos/sub")).unwrap();
        std::fs::write(out.join("Photos/a.txt"), b"alpha").unwrap();
        std::fs::write(out.join("Photos/sub/b.txt"), b"beta").unwrap();
        std::fs::write(out.join("top.txt"), b"top").unwrap();
        let to = d.join("to");
        std::fs::create_dir(&to).unwrap();
        let made = place(&Out::Folder { tmp: out }, &to, "My Zip", "unzipped", &Job::default()).unwrap();
        assert_eq!(made, to.join("My Zip (unzipped)"));
        assert_eq!(std::fs::read(made.join("Photos/sub/b.txt")).unwrap(), b"beta");
        assert_eq!(std::fs::read(made.join("top.txt")).unwrap(), b"top");
        // Never into a name that is taken.
        let again = place(&Out::Folder { tmp: d.join("to/My Zip (unzipped)") }, &to, "My Zip", "unzipped", &Job::default()).unwrap();
        assert_eq!(again, to.join("My Zip (unzipped 2)"));
        std::fs::remove_dir_all(&d).unwrap();
    }

    // ---- the words and the page ----

    #[test]
    fn every_action_the_menu_can_offer_has_words_on_the_pages_and_every_new_reason_has_a_line() {
        let strings = std::fs::read_to_string(Path::new(env!("CARGO_MANIFEST_DIR")).join("../src/strings.ts")).unwrap();
        let mut ids = std::collections::BTreeSet::new();
        let all = Caps::all();
        let sets: [&[&str]; 12] = [&["/a/x.png"], &["/a/x.png", "/a/y.png"], &["/a/x.pdf"], &["/a/x.pdf", "/a/y.pdf"], &["/a/x.docx"], &["/a/x.md"], &["/a/x.wav"], &["/a/x.wav", "/a/y.wav"], &["/a/x.mov"], &["/a/x.zip"], &["/a/x.pages", "/a/y.pages"], &["/a/x.m4v"]];
        for s in sets { ids.extend(acts(offer(&ps(s), &all, &Prefs::usual()))); }
        assert!(ids.len() > 55, "{}", ids.len());
        for id in &ids { assert!(strings.contains(&format!("      {id}: {{ short: \"")), "{id} has no words in strings.ts"); }
        for why in ["noText", "onePage", "noFrame", "tooSmall", "notSquare", "unsafeZip", "zipLocked", "notZip", "tooBig", "special", "noRoom"] {
            assert!(strings.contains(&format!("      {why}: \"")) || strings.contains(&format!("      {why}: `")), "{why} has no line in strings.ts");
        }
    }

    // ---- the real tools, on files in a temporary folder only ----

    /// Reads a PDF's pages and turns, and a picture's properties, and makes a picture with a place and a camera in it. Test
    /// helpers only; they run on the test's own temporary files.
    const READ_SCRIPT: &str = r#"ObjC.import('Quartz'); ObjC.import('ImageIO'); ObjC.import('Foundation'); ObjC.import('AppKit');
function run(a) {
  if (a[0] === 'pdf') { var d = $.PDFDocument.alloc.initWithURL($.NSURL.fileURLWithPath(a[1])); var r = []; for (var i = 0; i < d.pageCount; i++) r.push(d.pageAtIndex(i).rotation); return d.pageCount + ' ' + r.join(','); }
  if (a[0] === 'props') { var s = $.CGImageSourceCreateWithURL($.NSURL.fileURLWithPath(a[1]), $({})); return JSON.stringify(ObjC.deepUnwrap(ObjC.castRefToObject($.CGImageSourceCopyPropertiesAtIndex(s, 0, $({}))))); }
  if (a[0] === 'corner') {
    var s = $.CGImageSourceCreateWithURL($.NSURL.fileURLWithPath(a[1]), $({}));
    var o = $.NSMutableDictionary.alloc.init;
    o.setObjectForKey($(true), 'kCGImageSourceCreateThumbnailFromImageAlways');
    o.setObjectForKey($(true), 'kCGImageSourceCreateThumbnailWithTransform');
    o.setObjectForKey($(2000), 'kCGImageSourceThumbnailMaxPixelSize');
    var rep = $.NSBitmapImageRep.alloc.initWithCGImage($.CGImageSourceCreateThumbnailAtIndex(s, 0, o)), w = rep.pixelsWide, h = rep.pixelsHigh, hit = [];
    [[0.1, 0.1, 'TL'], [0.9, 0.1, 'TR'], [0.1, 0.9, 'BL'], [0.9, 0.9, 'BR']].forEach(function (q) {
      var c = rep.colorAtXY(Math.floor(q[0] * w), Math.floor(q[1] * h)).colorUsingColorSpace($.NSColorSpace.sRGBColorSpace);
      if (c.redComponent > 0.6 && c.greenComponent < 0.4) hit.push(q[2]);
    });
    return w + 'x' + h + ' ' + hit.join(',');
  }
  if (a[0] === 'pngmeta') {
    var s = $.CGImageSourceCreateWithURL($.NSURL.fileURLWithPath(a[1]), $({}));
    var d = $.CGImageDestinationCreateWithURL($.NSURL.fileURLWithPath(a[2]), $('public.png'), 1, $({}));
    $.CGImageDestinationAddImageFromSource(d, s, 0, $({ '{PNG}': $({ Author: 'Alice Smith', Description: 'secret comment', Software: 'Foo' }), '{TIFF}': $({ Make: 'AcmeCam' }) }));
    return String($.CGImageDestinationFinalize(d));
  }
  if (a[0] === 'gps') {
    var s = $.CGImageSourceCreateWithURL($.NSURL.fileURLWithPath(a[1]), $({}));
    var d = $.CGImageDestinationCreateWithURL($.NSURL.fileURLWithPath(a[2]), $('public.jpeg'), 1, $({}));
    $.CGImageDestinationAddImageFromSource(d, s, 0, $({ '{GPS}': $({ Latitude: 12.5, LatitudeRef: 'N', Longitude: 77.5, LongitudeRef: 'E' }), '{TIFF}': $({ Make: 'AcmeCam', Model: 'X1' }) }));
    return String($.CGImageDestinationFinalize(d));
  }
}"#;
    fn osa(args: &[&Path]) -> String {
        let o = std::process::Command::new(OSASCRIPT).args(["-l", "JavaScript", "-e", READ_SCRIPT, "--"]).args(args.iter().map(|a| a.as_os_str())).output().unwrap();
        String::from_utf8_lossy(&o.stdout).trim().to_string()
    }
    fn osa_word(job: &str, file: &Path) -> String {
        let o = std::process::Command::new(OSASCRIPT).args(["-l", "JavaScript", "-e", READ_SCRIPT, "--", job]).arg(file).output().unwrap();
        String::from_utf8_lossy(&o.stdout).trim().to_string()
    }
    fn pdf_info(f: &Path) -> (usize, Vec<i32>) {
        let t = osa_word("pdf", f);
        let (n, r) = t.split_once(' ').unwrap_or((&t, ""));
        (n.parse().unwrap_or(0), r.split(',').filter_map(|x| x.parse().ok()).collect())
    }
    fn sips_get(f: &Path, key: &str) -> String {
        let o = std::process::Command::new(SIPS).args(["-g", key]).arg(f).output().unwrap();
        String::from_utf8_lossy(&o.stdout).lines().last().and_then(|l| l.split_once(':')).map(|(_, v)| v.trim().to_string()).unwrap_or_default()
    }
    fn square_jpeg(at: &Path) {
        let px: Vec<u8> = (0..32 * 32).flat_map(|i| [(i % 255) as u8, 90, 200]).collect();
        jpeg_encoder::Encoder::new_file(at, 90).unwrap().encode(&px, 32, 32, jpeg_encoder::ColorType::Rgb).unwrap();
    }
    /// Whether the real tools of this Mac offer this action for these files.
    fn offered(caps: &Caps, files: &[PathBuf], action: &str) -> bool { matches!(offer(files, caps, &Prefs::usual()), Offer::Actions(_, a) if a.contains(&action)) }
    fn magic(f: &Path, n: usize) -> Vec<u8> { std::fs::read(f).unwrap().into_iter().take(n).collect() }

    #[test]
    fn the_real_sips_writes_every_other_picture_format_the_probe_says_it_can() {
        if !Path::new(SIPS).is_file() { return; }
        let caps = probe_tools();
        let d = tmp("morepics");
        let src = d.join("pic.jpg");
        jpeg(&src);
        let mut tried = 0;
        for (action, format) in [("toGif", "gif"), ("toBmp", "bmp"), ("toJp2", "jp2"), ("toTga", "tga"), ("toAvif", "avif")] {
            if !offered(&caps, std::slice::from_ref(&src), action) { continue; }
            tried += 1;
            let (made, fail) = ran(action, std::slice::from_ref(&src), &d.join(format!("w-{action}")), None);
            assert_eq!(fail, None, "{action}");
            assert_eq!(sips_get(&made[0], "format"), format, "{action} made a real {format}");
            assert!(made[0].file_name().unwrap().to_string_lossy().starts_with("pic (converted)."), "{action}");
        }
        eprintln!("picture formats tried on this Mac: {tried}");
        // Icons: a square picture only.
        let sq = d.join("square.jpg");
        square_jpeg(&sq);
        for (action, head) in [("toIcns", b"icns".to_vec()), ("toIco", vec![0, 0, 1, 0])] {
            if !offered(&caps, std::slice::from_ref(&sq), action) { continue; }
            let (made, fail) = ran(action, std::slice::from_ref(&sq), &d.join(format!("wi-{action}")), None);
            assert_eq!(fail, None, "{action}");
            assert_eq!(magic(&made[0], head.len()), head, "{action}");
            let (none, fail) = ran(action, std::slice::from_ref(&src), &d.join(format!("wn-{action}")), None);
            assert_eq!((none.len(), fail), (0, Some(Failure::Failed("notSquare"))), "{action}: 40 by 30 is not square, and nothing is stretched");
        }
        assert!(only_these_in(&d).iter().all(|n| !n.contains("(converted 2)")), "{:?}", only_these_in(&d));
        std::fs::remove_dir_all(&d).unwrap();
    }

    #[test]
    fn the_real_tools_turn_flip_grey_clean_and_shrink_a_picture_into_a_set_of_sizes() {
        if !Path::new(SIPS).is_file() { return; }
        let caps = probe_tools();
        let d = tmp("picops");
        let src = d.join("photo.jpg");
        noise_jpeg(&src, 90);   // 320 by 240
        let (turned, fail) = ran("turnRight", std::slice::from_ref(&src), &d.join("w1"), None);
        assert_eq!((turned.clone(), fail), (vec![d.join("photo (turned).jpg")], None));
        assert_eq!((sips_get(&turned[0], "pixelWidth"), sips_get(&turned[0], "pixelHeight")), ("240".into(), "320".into()), "turned a quarter");
        let (around, _) = ran("turnAround", std::slice::from_ref(&src), &d.join("w2"), None);
        assert_eq!(sips_get(&around[0], "pixelWidth"), "320");
        let (flipped, fail) = ran("flipVertical", std::slice::from_ref(&src), &d.join("w3"), None);
        assert_eq!((flipped.clone(), fail), (vec![d.join("photo (flipped).jpg")], None));
        assert_eq!(sips_get(&flipped[0], "pixelHeight"), "240");
        if offered(&caps, std::slice::from_ref(&src), "grayscale") {
            let (grey, fail) = ran("grayscale", std::slice::from_ref(&src), &d.join("w4"), None);
            assert_eq!((grey.clone(), fail), (vec![d.join("photo (gray).jpg")], None));
            assert_eq!(sips_get(&grey[0], "space"), "Gray");
            assert_eq!(sips_get(&src, "space"), "RGB", "the original is as it was");
        }
        // Thumbnails: a folder of the sizes smaller than the picture, never made bigger.
        let (thumbs, fail) = ran("thumbnails", std::slice::from_ref(&src), &d.join("w5"), None);
        assert_eq!((thumbs.clone(), fail), (vec![d.join("photo (thumbnails)")], None));
        assert_eq!(only_these_in(&thumbs[0]), vec!["thumbnail 128.png", "thumbnail 256.png", "thumbnail 64.png"]);
        assert_eq!(sips_get(&thumbs[0].join("thumbnail 128.png"), "pixelWidth"), "128");
        let tiny = d.join("tiny.jpg");
        square_jpeg(&tiny);
        let (none, fail) = ran("thumbnails", std::slice::from_ref(&tiny), &d.join("w6"), None);
        assert_eq!((none.len(), fail), (0, Some(Failure::Failed("tooSmall"))), "32 pixels is smaller than every size");
        // Location and camera details: gone from the new file, still in the original.
        let gps = d.join("holiday.jpg");
        assert_eq!(osa(&[Path::new("gps"), &src, &gps]), "true");
        assert!(osa_word("props", &gps).contains("AcmeCam") && osa_word("props", &gps).contains("Latitude"), "the test picture has a place and a camera");
        let (clean, fail) = ran("stripInfo", std::slice::from_ref(&gps), &d.join("w7"), None);
        assert_eq!((clean.clone(), fail), (vec![d.join("holiday (cleaned).jpg")], None));
        let props = osa_word("props", &clean[0]);
        assert!(!props.contains("AcmeCam") && !props.contains("Latitude") && !props.contains("{GPS}"), "{props}");
        assert!(props.contains("\"PixelWidth\":320"), "the picture itself is still there: {props}");
        assert!(osa_word("props", &gps).contains("AcmeCam"), "the original is unchanged");
        std::fs::remove_dir_all(&d).unwrap();
    }

    #[test]
    fn the_real_pdfkit_makes_pdfs_from_pictures_turns_pages_takes_them_out_and_reads_the_words() {
        if !Path::new(OSASCRIPT).is_file() { return; }
        let d = tmp("pdfops");
        let pics: Vec<PathBuf> = ["one.jpg", "two.jpg", "three.jpg"].iter().map(|n| { let f = d.join(n); noise_jpeg(&f, 60); f }).collect();
        let (each, fail) = ran("imageToPdf", &pics[..2], &d.join("w1"), None);
        assert_eq!((each.len(), fail), (2, None));
        assert_eq!(each[0], d.join("one (converted).pdf"));
        assert_eq!(pdf_info(&each[0]).0, 1);
        let (one, fail) = ran("imagesToPdf", &pics, &d.join("w2"), None);
        assert_eq!((one.clone(), fail), (vec![d.join("one (merged).pdf")], None));
        assert_eq!(pdf_info(&one[0]), (3, vec![0, 0, 0]), "one PDF with a page for each picture");
        let (right, fail) = ran("turnRight", std::slice::from_ref(&one[0]), &d.join("w3"), None);
        assert_eq!(fail, None);
        assert_eq!(pdf_info(&right[0]), (3, vec![90, 90, 90]));
        let (left, _) = ran("turnLeft", std::slice::from_ref(&one[0]), &d.join("w3b"), None);
        assert_eq!(pdf_info(&left[0]).1, vec![270, 270, 270]);
        let (fewer, fail) = ran("dropFirstPage", std::slice::from_ref(&one[0]), &d.join("w4"), None);
        assert_eq!((fewer.clone(), fail), (vec![d.join("one (merged) (without first page).pdf")], None));
        assert_eq!(pdf_info(&fewer[0]).0, 2);
        let (last, _) = ran("dropLastPage", std::slice::from_ref(&one[0]), &d.join("w5"), None);
        assert_eq!(pdf_info(&last[0]).0, 2);
        let (first, fail) = ran("keepFirstPage", std::slice::from_ref(&one[0]), &d.join("w6"), None);
        assert_eq!(fail, None);
        assert_eq!(pdf_info(&first[0]).0, 1);
        let (none, fail) = ran("dropFirstPage", std::slice::from_ref(&first[0]), &d.join("w7"), None);
        assert_eq!((none.len(), fail), (0, Some(Failure::Failed("onePage"))), "a one page PDF is not made into nothing");
        // A PDF with words gives them out; a PDF of pictures has none to give.
        let words = d.join("notes.txt");
        std::fs::write(&words, "Hello from the PDF text test.\n").unwrap();
        let (pdf, _) = ran("toPdf", std::slice::from_ref(&words), &d.join("w8"), None);
        let (text, fail) = ran("pdfText", std::slice::from_ref(&pdf[0]), &d.join("w9"), None);
        assert_eq!(fail, None);
        assert_eq!(text, vec![d.join("notes (converted) (text).txt")]);
        assert!(std::fs::read_to_string(&text[0]).unwrap().contains("Hello from the PDF text test."));
        let (nothing, fail) = ran("pdfText", std::slice::from_ref(&one[0]), &d.join("w10"), None);
        assert_eq!((nothing.len(), fail), (0, Some(Failure::Failed("noText"))), "a scan has no words in it");
        // The originals are all still there.
        assert_eq!(pdf_info(&one[0]).0, 3);
        std::fs::remove_dir_all(&d).unwrap();
    }

    #[test]
    fn the_real_textutil_writes_the_other_word_formats_and_reads_markdown_as_plain_text() {
        if !Path::new(TEXTUTIL).is_file() { return; }
        let caps = probe_tools();
        let d = tmp("moredocs");
        let src = d.join("letter.txt");
        std::fs::write(&src, "Dear reader,\nHello there.\n").unwrap();
        for (action, ext) in [("toDoc", "doc"), ("toOdt", "odt"), ("toWordml", "xml")] {
            if !offered(&caps, std::slice::from_ref(&src), action) { continue; }
            let (made, fail) = ran(action, std::slice::from_ref(&src), &d.join(format!("w-{action}")), None);
            assert_eq!(fail, None, "{action}");
            assert_eq!(made, vec![d.join(format!("letter (converted).{ext}"))]);
            if ext != "xml" {
                // Read back by the same Mac: the words survived.
                let (back, fail) = ran("toText", &made, &d.join(format!("wb-{action}")), None);
                assert_eq!(fail, None, "{action} back");
                assert!(std::fs::read_to_string(&back[0]).unwrap().contains("Hello there."), "{action}");
            } else {
                assert!(std::fs::read_to_string(&made[0]).unwrap().contains("Hello there."));
            }
        }
        // None of these carries a picture the page pointed at elsewhere on the Mac.
        std::fs::create_dir_all(d.join("other")).unwrap();
        let secret = d.join("other/secret.jpg");
        jpeg(&secret);
        let page = d.join("page.docx");
        std::fs::write(&page, format!("<html><body><p>Words.</p><img src=\"{}\"></body></html>", secret.display())).unwrap();
        for action in ["toDoc", "toOdt", "toWordml", "toDocx", "toRtf"] {
            if !offered(&caps, std::slice::from_ref(&page), action) { continue; }
            let (made, fail) = ran(action, std::slice::from_ref(&page), &d.join(format!("wp-{action}")), None);
            assert_eq!(fail, None, "{action}");
            let bytes = std::fs::read(&made[0]).unwrap();
            assert!(!bytes.windows(3).any(|w| w == b"\xFF\xD8\xFF") && !bytes.windows(4).any(|w| w == b"\x89PNG"), "{action}: a picture is in it");
        }
        // Markdown is text: not rendered, not changed.
        let md = d.join("notes.md");
        std::fs::write(&md, "# Heading\n\nSome *words* here.\n").unwrap();
        let (txt, fail) = ran("toText", std::slice::from_ref(&md), &d.join("w2"), None);
        assert_eq!((txt.clone(), fail), (vec![d.join("notes (converted).txt")], None));
        assert_eq!(std::fs::read_to_string(&txt[0]).unwrap().trim(), "# Heading\n\nSome *words* here.");
        let (pdf, fail) = ran("toPdf", std::slice::from_ref(&md), &d.join("w3"), None);
        assert_eq!(fail, None);
        assert_eq!(&std::fs::read(&pdf[0]).unwrap()[..4], b"%PDF");
        let (words, _) = ran("pdfText", std::slice::from_ref(&pdf[0]), &d.join("w4"), None);
        assert!(std::fs::read_to_string(&words[0]).unwrap().contains("# Heading"), "the marks are in the PDF as they were typed");
        std::fs::remove_dir_all(&d).unwrap();
    }

    #[test]
    fn the_real_afconvert_writes_the_other_sound_formats_and_changes_channels_and_rate() {
        let ping = Path::new("/System/Library/Sounds/Ping.aiff");
        if !ping.is_file() || !Path::new(AFCONVERT).is_file() { return; }
        let caps = probe_tools();
        let d = tmp("moresound");
        let src = d.join("ping.aiff");
        std::fs::copy(ping, &src).unwrap();
        let info = |f: &Path| String::from_utf8_lossy(&std::process::Command::new("/usr/bin/afinfo").arg(f).output().unwrap().stdout).into_owned();
        for (action, ext, head, at) in [("toAlac", "m4a", &b"ftyp"[..], 4), ("toCaf", "caf", &b"caff"[..], 0), ("toFlac", "flac", &b"fLaC"[..], 0)] {
            if !offered(&caps, std::slice::from_ref(&src), action) { continue; }
            let (made, fail) = ran(action, std::slice::from_ref(&src), &d.join(format!("w-{action}")), None);
            assert_eq!(fail, None, "{action}");
            assert_eq!(made, vec![d.join(format!("ping (converted).{ext}"))]);
            assert_eq!(&magic(&made[0], at + head.len())[at..], head, "{action}");
        }
        if offered(&caps, std::slice::from_ref(&src), "toAac") {
            let (aac, fail) = ran("toAac", std::slice::from_ref(&src), &d.join("w-aac"), None);
            assert_eq!(fail, None);
            assert_eq!(magic(&aac[0], 1), vec![0xFF], "an AAC stream starts with its sync bytes");
        }
        let (mono, fail) = ran("mono", std::slice::from_ref(&src), &d.join("w1"), None);
        assert_eq!((mono.clone(), fail), (vec![d.join("ping (mono).aiff")], None), "an AIFF stays an AIFF");
        assert!(info(&mono[0]).contains("1 ch"), "{}", info(&mono[0]));
        let (stereo, fail) = ran("stereo", std::slice::from_ref(&mono[0]), &d.join("w2"), None);
        assert_eq!(fail, None);
        assert!(info(&stereo[0]).contains("2 ch"), "{}", info(&stereo[0]));
        let (rate, fail) = ran("sampleRate", std::slice::from_ref(&src), &d.join("w3"), None);
        assert_eq!((rate.clone(), fail), (vec![d.join("ping (resampled).aiff")], None));
        assert!(info(&rate[0]).contains("44100 Hz"), "{}", info(&rate[0]));
        assert!(info(&src).contains("48000 Hz"), "the original is as it was");
        std::fs::remove_dir_all(&d).unwrap();
    }

    #[test]
    fn the_real_avconvert_and_avfoundation_make_other_video_formats_and_a_still_picture() {
        let sample = Path::new("/Applications/Numbers.app/Contents/Resources/PlaceholderMovie.mov");
        if !sample.is_file() || !Path::new(AVCONVERT).is_file() { return; }
        let caps = probe_tools();
        let d = tmp("morevideo");
        let src = d.join("clip.mov");
        std::fs::copy(sample, &src).unwrap();
        for (action, ext) in [("toM4v", "m4v"), ("toMp4", "mp4")] {
            if !offered(&caps, std::slice::from_ref(&src), action) { continue; }
            // Each in a folder of its own, so every name is the first free one.
            let sub = d.join(format!("in-{action}"));
            std::fs::create_dir(&sub).unwrap();
            let one = sub.join("clip.mov");
            std::fs::copy(&src, &one).unwrap();
            let (made, fail) = ran(action, std::slice::from_ref(&one), &d.join(format!("w-{action}")), None);
            assert_eq!(fail, None, "{action}");
            assert_eq!(made, vec![sub.join(format!("clip (converted).{ext}"))]);
            assert_eq!(&magic(&made[0], 8)[4..], b"ftyp", "{action}");
        }
        for action in ["video480", "video720", "video1080"] {
            if !offered(&caps, std::slice::from_ref(&src), action) { continue; }
            // The clip is already smaller than any of them: nothing is made bigger, and that is said, not failed.
            let (made, fail) = ran(action, std::slice::from_ref(&src), &d.join(format!("w-{action}")), None);
            assert!(matches!((made.len(), fail), (1, None) | (0, Some(Failure::Failed("notSmaller")))), "{action}: {made:?} {fail:?}");
        }
        for (action, label) in [("stillStart", "still"), ("stillMiddle", "still")] {
            let (made, fail) = ran(action, std::slice::from_ref(&src), &d.join(format!("w-{action}")), None);
            assert_eq!(fail, None, "{action}");
            assert!(made[0].file_name().unwrap().to_string_lossy().starts_with(&format!("clip ({label}")));
            assert_eq!(&magic(&made[0], 4)[1..], b"PNG");
            assert_eq!((sips_get(&made[0], "pixelWidth"), sips_get(&made[0], "pixelHeight")), ("320".into(), "320".into()));
        }
        // Something that is not a video gives a clear reason and nothing is made.
        let bad = d.join("bad.mov");
        std::fs::write(&bad, b"not a movie").unwrap();
        let (none, fail) = ran("stillStart", std::slice::from_ref(&bad), &d.join("w-bad"), None);
        assert_eq!(none.len(), 0);
        assert!(matches!(fail, Some(Failure::Failed("noFrame")) | Some(Failure::Failed("toolFailed"))), "{fail:?}");
        std::fs::remove_dir_all(&d).unwrap();
    }

    // ---- zip and unzip with ditto ----

    #[test]
    fn the_real_ditto_zips_a_file_and_a_folder_without_following_links_and_unzips_into_a_new_folder() {
        if !Path::new(DITTO).is_file() { return; }
        let d = tmp("zips");
        let folder = d.join("My Photos");
        std::fs::create_dir_all(folder.join("sub")).unwrap();
        std::fs::write(folder.join("a.txt"), b"alpha").unwrap();
        std::fs::write(folder.join("sub/b.txt"), b"beta").unwrap();
        let secret = d.join("secret.txt");
        std::fs::write(&secret, b"never to be read through a link").unwrap();
        std::os::unix::fs::symlink(&secret, folder.join("link to secret")).unwrap();
        let (zips, fail) = ran("zip", std::slice::from_ref(&folder), &d.join("w1"), None);
        assert_eq!((zips.clone(), fail), (vec![d.join("My Photos (zipped).zip")], None));
        // What is in it: read by this file's own zip reader, and checked against the real unzip.
        let listing = String::from_utf8_lossy(&std::process::Command::new("/usr/bin/unzip").arg("-Z").arg("-1").arg(&zips[0]).output().unwrap().stdout).into_owned();
        assert!(listing.contains("My Photos/a.txt") && listing.contains("My Photos/sub/b.txt"), "{listing}");
        let bytes = std::fs::read(&zips[0]).unwrap();
        assert!(!bytes.windows(7).any(|w| w == b"never t"), "the link was stored as a link, not followed to the file it points at");
        assert!(folder.join("a.txt").is_file(), "the original folder is as it was");
        // A file: its own name in the zip, and the name of the zip says which file.
        let one = d.join("report.final.txt");
        std::fs::write(&one, b"the report").unwrap();
        let (z1, fail) = ran("zip", std::slice::from_ref(&one), &d.join("w2"), None);
        assert_eq!((z1.clone(), fail), (vec![d.join("report.final.txt (zipped).zip")], None));
        // Several into one.
        let other = d.join("second.txt");
        std::fs::write(&other, b"two").unwrap();
        let (both, fail) = ran("zipTogether", &[one.clone(), other.clone()], &d.join("w3"), None);
        assert_eq!((both.clone(), fail), (vec![d.join("report.final.txt and 1 more (zipped).zip")], None));
        let listing = String::from_utf8_lossy(&std::process::Command::new("/usr/bin/unzip").arg("-Z").arg("-1").arg(&both[0]).output().unwrap().stdout).into_owned();
        assert!(listing.contains("report.final.txt") && listing.contains("second.txt"));
        // Unzip a zip made without links: a new folder next to it, holding everything, the zip untouched.
        let plain = d.join("plain");
        std::fs::create_dir_all(plain.join("deep/er")).unwrap();
        std::fs::write(plain.join("deep/er/c.txt"), b"gamma").unwrap();
        let (pz, fail) = ran("zip", std::slice::from_ref(&plain), &d.join("w4"), None);
        assert_eq!(fail, None);
        let (out, fail) = ran("unzip", std::slice::from_ref(&pz[0]), &d.join("w5"), None);
        assert_eq!((out.clone(), fail), (vec![d.join("plain (zipped) (unzipped)")], None));
        assert_eq!(std::fs::read(out[0].join("plain/deep/er/c.txt")).unwrap(), b"gamma");
        let (again, _) = ran("unzip", std::slice::from_ref(&pz[0]), &d.join("w6"), None);
        assert_eq!(again, vec![d.join("plain (zipped) (unzipped 2)")], "never into a folder that is there");
        std::fs::remove_dir_all(&d).unwrap();
    }

    #[test]
    fn unzipping_keeps_the_downloaded_from_the_internet_mark_on_what_comes_out() {
        if !Path::new(DITTO).is_file() { return; }
        let d = tmp("unzipqtn");
        let f = d.join("tool.txt");
        std::fs::write(&f, b"x").unwrap();
        let (z, _) = ran("zip", std::slice::from_ref(&f), &d.join("w1"), None);
        // This zip came from the internet: so does everything in it.
        set_quarantine(&z[0]);
        let (out, fail) = ran("unzip", std::slice::from_ref(&z[0]), &d.join("w2"), None);
        assert_eq!(fail, None);
        assert!(quarantine(&out[0].join("tool.txt")).is_some(), "Gatekeeper still checks what was in a downloaded zip");
        // A zip made here, never downloaded, gives files with no mark.
        let (clean, _) = ran("unzip", std::slice::from_ref(&{ let (z2, _) = ran("zip", std::slice::from_ref(&f), &d.join("w3"), None); z2[0].clone() }), &d.join("w4"), None);
        assert!(quarantine(&clean[0].join("tool.txt")).is_none());
        std::fs::remove_dir_all(&d).unwrap();
    }

    #[test]
    fn a_zip_that_could_harm_is_refused_before_anything_is_written() {
        if !Path::new(DITTO).is_file() { return; }
        let d = tmp("badzips");
        let marker = d.join("outside.txt");
        // A path that climbs out of the folder it is unzipped into.
        std::fs::write(d.join("climb.zip"), zip_with(&[ze("../outside.txt")])).unwrap();
        // A link.
        std::fs::write(d.join("link.zip"), zip_with(&[Ze { mode: 0o120777, ..ze("l") }])).unwrap();
        // A bomb: small on disk, enormous by what it says.
        std::fs::write(d.join("bomb.zip"), zip_with(&(0..4).map(|_| Ze { size: 3_000_000_000, ..ze("big.bin") }).collect::<Vec<_>>())).unwrap();
        // Not a zip at all, and a zip with a password.
        std::fs::write(d.join("fake.zip"), b"this is not a zip").unwrap();
        std::fs::write(d.join("locked.zip"), zip_with(&[Ze { flags: 1, ..ze("a.txt") }])).unwrap();
        for (name, why) in [("climb", "unsafeZip"), ("link", "unsafeZip"), ("bomb", "tooBig"), ("fake", "notZip"), ("locked", "zipLocked")] {
            let zip = d.join(format!("{name}.zip"));
            let (made, fail) = ran("unzip", std::slice::from_ref(&zip), &d.join(format!("w-{name}")), None);
            assert_eq!((made.len(), fail), (0, Some(Failure::Failed(why))), "{name}");
        }
        assert!(!marker.exists(), "nothing was written outside the folder");
        assert_eq!(only_these_in(&d).iter().filter(|n| n.contains("unzipped")).count(), 0, "no folder was left");
        // One bad zip among good ones does not stop the others.
        let f = d.join("ok.txt");
        std::fs::write(&f, b"fine").unwrap();
        let (good, _) = ran("zip", std::slice::from_ref(&f), &d.join("wg"), None);
        let work = d.join("wm");
        let units = plan("unzip", &[d.join("climb.zip"), good[0].clone()], &work, &Prefs::usual(), None).unwrap();
        let e = run(&units, &work, &|u| u.source.parent().map(Path::to_path_buf), &Job::default(), &|_, _, _| {});
        assert_eq!((e.made.len(), e.failed, e.first_failed.map(|f| f.1)), (1, 1, Some("unsafeZip")));
        std::fs::remove_dir_all(&d).unwrap();
    }

    // ---- review fixes: real copies for zips, room, odd files, read only folders, the zip's whole shape, flips, details ----

    fn crc32(b: &[u8]) -> u32 {
        let mut c = !0u32;
        for &x in b { c ^= x as u32; for _ in 0..8 { c = if c & 1 != 0 { (c >> 1) ^ 0xEDB8_8320 } else { c >> 1 }; } }
        !c
    }
    struct Rz<'a> { name: &'a str, data: &'a [u8], mode: u32, host: u8, listed: bool }
    fn rz<'a>(name: &'a str, data: &'a [u8]) -> Rz<'a> { Rz { name, data, mode: 0o100644, host: 3, listed: true } }
    /// A whole zip (stored, not squeezed): each entry with its own header and bytes, then the list of the listed ones.
    /// `gap`: junk bytes put after the first entry.
    fn real_zip(entries: &[Rz], gap: usize) -> Vec<u8> {
        let (mut z, mut cd, mut listed) = (vec![], vec![], 0u16);
        for (k, e) in entries.iter().enumerate() {
            let at = z.len() as u32;
            let (crc, n) = (crc32(e.data), e.data.len() as u32);
            z.extend(0x0403_4b50u32.to_le_bytes());
            z.extend(20u16.to_le_bytes());
            z.extend([0u8; 2 + 2 + 2 + 2]);
            z.extend(crc.to_le_bytes());
            z.extend(n.to_le_bytes());
            z.extend(n.to_le_bytes());
            z.extend((e.name.len() as u16).to_le_bytes());
            z.extend(0u16.to_le_bytes());
            z.extend(e.name.as_bytes());
            z.extend(e.data);
            if k == 0 { z.extend(vec![0u8; gap]); }
            if !e.listed { continue; }
            listed += 1;
            cd.extend(0x0201_4b50u32.to_le_bytes());
            cd.extend(((e.host as u16) << 8 | 20).to_le_bytes());
            cd.extend(20u16.to_le_bytes());
            cd.extend([0u8; 2 + 2 + 2 + 2]);
            cd.extend(crc.to_le_bytes());
            cd.extend(n.to_le_bytes());
            cd.extend(n.to_le_bytes());
            cd.extend((e.name.len() as u16).to_le_bytes());
            cd.extend([0u8; 2 + 2 + 2 + 2]);
            cd.extend((e.mode << 16).to_le_bytes());
            cd.extend(at.to_le_bytes());
            cd.extend(e.name.as_bytes());
        }
        let cd_at = z.len() as u32;
        z.extend(&cd);
        z.extend(0x0605_4b50u32.to_le_bytes());
        z.extend([0u8; 4]);
        z.extend(listed.to_le_bytes());
        z.extend(listed.to_le_bytes());
        z.extend((cd.len() as u32).to_le_bytes());
        z.extend(cd_at.to_le_bytes());
        z.extend(0u16.to_le_bytes());
        z
    }
    const ZLIM: Limits = Limits { files: 100, bytes: 1 << 20 };

    #[test]
    fn a_file_that_goes_into_a_zip_is_always_copied_never_left_as_a_link() {
        let d = tmp("realcopy");
        let f = d.join("big.bin");
        let bytes: Vec<u8> = (0..4000u32).map(|i| (i * 7 % 251) as u8).collect();
        std::fs::write(&f, &bytes).unwrap();
        let t = |real_max| Terms { clone: false, copy_max: 10, real_max, free: None };
        // Read where it is, for the tools that only look (a long video on another disk): a link, as it always was.
        let link = d.join("looked at.bin");
        assert_eq!(take(&f, &link, t(None), &Job::default()), Ok(()));
        assert!(std::fs::symlink_metadata(&link).unwrap().file_type().is_symlink());
        // A zip stores a link as a link, so a file that is zipped is always a real copy of its bytes, however big.
        let stage = d.join("stage");
        std::fs::create_dir(&stage).unwrap();
        let copy = stage.join("big.bin");
        assert_eq!(take(&f, &copy, t(Some(1 << 20)), &Job::default()), Ok(()));
        assert!(std::fs::symlink_metadata(&copy).unwrap().file_type().is_file());
        assert_eq!(std::fs::read(&copy).unwrap(), bytes);
        if Path::new(DITTO).is_file() && Path::new("/usr/bin/unzip").is_file() {
            let out = d.join("out.zip");
            let c = cmd(DITTO, vec![os("-c"), os("-k"), os("--norsrc"), os("--noextattr"), os("--noacl"), pth(&stage), pth(&out)]);
            assert_eq!(exec(&c, &Job::default(), &|_| {}).map(|_| ()), Ok(()));
            let inside = std::process::Command::new("/usr/bin/unzip").arg("-p").arg(&out).arg("big.bin").output().unwrap().stdout;
            assert_eq!(inside, bytes, "the zip holds the file's bytes, not a link to where it was");
        }
        // Too big even to copy for a zip: refused, and nothing is left.
        let big = d.join("too big.bin");
        assert_eq!(take(&f, &big, t(Some(3999)), &Job::default()), Err("tooBig"));
        assert!(!big.exists());
        // The units say which inputs must be real copies: what is zipped, and the zip that is opened.
        let z = one("zip", "/a/My Notes.txt");
        assert!(z.inputs.iter().all(|i| i.real));
        let t2 = plan("zipTogether", &ps(&["/a/one.txt", "/b/two.txt"]), &p("/w"), &Prefs::usual(), None).unwrap();
        assert!(t2[0].inputs.iter().all(|i| i.real));
        assert!(one("unzip", "/a/x.zip").inputs.iter().all(|i| i.real), "a zip is vetted from the very bytes that are extracted");
        assert!(one("toPng", "/a/x.jpg").inputs.iter().all(|i| !i.real));
        std::fs::remove_dir_all(&d).unwrap();
    }

    #[test]
    fn nothing_is_copied_or_opened_without_room_for_it_on_the_work_disk() {
        assert!(room_ok(None, u64::MAX) && room_ok(Some(10), 10) && !room_ok(Some(9), 10));
        assert!(free_space(&std::env::temp_dir()).is_some_and(|f| f > 0));
        assert_eq!(free_space(Path::new("/no/such/place")), None);
        let d = tmp("room");
        let f = d.join("a.bin");
        std::fs::write(&f, vec![1u8; 100]).unwrap();
        let t = |clone, real_max, free| Terms { clone, copy_max: COPY_MAX, real_max, free: Some(free) };
        // A copy takes its size and a margin; a copy that will be zipped takes it twice (the zip is another copy).
        let copy = d.join("c1.bin");
        assert_eq!(take(&f, &copy, t(false, None, 10), &Job::default()), Err("noRoom"));
        assert!(!copy.exists());
        assert_eq!(take(&f, &copy, t(false, None, SPARE + 100), &Job::default()), Ok(()));
        let zipped = d.join("c2.bin");
        assert_eq!(take(&f, &zipped, t(false, Some(1 << 20), SPARE + 150), &Job::default()), Err("noRoom"));
        assert!(!zipped.exists());
        assert_eq!(take(&f, &zipped, t(false, Some(1 << 20), SPARE + 250), &Job::default()), Ok(()));
        // A clone that is only read costs nothing; one that is zipped needs the room for the zip.
        assert_eq!(take(&f, &d.join("c3.bin"), t(true, None, 10), &Job::default()), Ok(()));
        assert_eq!(take(&f, &d.join("c4.bin"), t(true, Some(1 << 20), 10), &Job::default()), Err("noRoom"));
        assert!(!d.join("c4.bin").exists());
        // A folder is always zipped: room for the zip first, and for the copy too when it cannot be cloned.
        let src = d.join("Folder");
        std::fs::create_dir(&src).unwrap();
        std::fs::write(src.join("a.txt"), vec![2u8; 100]).unwrap();
        for (n, clone) in [(1, true), (2, false)] {
            let into = d.join(format!("stage {n}"));
            assert_eq!(take_folder(&src, &into, clone, FOLDER_LIMITS, Some(10), &Job::default()), Err("noRoom"), "{n}");
            assert!(!into.exists(), "{n}");
        }
        assert_eq!(take_folder(&src, &d.join("stage 3"), false, FOLDER_LIMITS, Some(SPARE + 150), &Job::default()), Err("noRoom"));
        assert_eq!(take_folder(&src, &d.join("stage 4"), false, FOLDER_LIMITS, Some(SPARE + 250), &Job::default()), Ok(()));
        assert_eq!(take_folder(&src, &d.join("stage 5"), true, FOLDER_LIMITS, Some(SPARE + 150), &Job::default()), Ok(()), "a clone needs only the room for the zip");
        // An unzip writes what the zip says it holds.
        assert_eq!(unzip_room(1000, Some(10)), Err("noRoom"));
        assert_eq!(unzip_room(1000, Some(SPARE + 999)), Err("noRoom"));
        assert_eq!(unzip_room(1000, Some(SPARE + 1000)), Ok(()));
        assert_eq!(unzip_room(1000, None), Ok(()));
        std::fs::remove_dir_all(&d).unwrap();
    }

    #[test]
    fn a_folder_with_a_pipe_in_it_is_refused_not_zipped_halfway_or_left_waiting() {
        use std::os::unix::ffi::OsStrExt;
        let d = tmp("fifo");
        let folder = d.join("Project");
        std::fs::create_dir(&folder).unwrap();
        std::fs::write(folder.join("a.txt"), b"alpha").unwrap();
        let pipe = std::ffi::CString::new(folder.join("a pipe").as_os_str().as_bytes()).unwrap();
        assert_eq!(unsafe { libc::mkfifo(pipe.as_ptr(), 0o600) }, 0);
        assert_eq!(tree_stats(&folder, FOLDER_LIMITS, true), Err("special"));
        assert_eq!(tree_stats(&folder, FOLDER_LIMITS, false), Err("unsafeZip"), "as before when links are not allowed");
        for (n, clone) in [(1, true), (2, false)] {
            let copy = d.join(format!("stage {n}"));
            assert_eq!(take_folder(&folder, &copy, clone, FOLDER_LIMITS, None, &Job::default()), Err("special"), "{n}");
            assert!(!copy.exists(), "{n}");
        }
        // The whole job ends at once with the reason; a stop timer only keeps a wrong result from hanging the test.
        let work = d.join("w");
        let units = plan("zip", std::slice::from_ref(&folder), &work, &Prefs::usual(), None).unwrap();
        let job = std::sync::Arc::new(Job::default());
        let j = job.clone();
        std::thread::spawn(move || { std::thread::sleep(Duration::from_secs(4)); j.stop(); });
        let t0 = std::time::Instant::now();
        let e = run(&units, &work, &|u| u.source.parent().map(Path::to_path_buf), &job, &|_, _, _| {});
        assert_eq!((e.made.len(), e.fail), (0, Some(Failure::Failed("special"))));
        assert!(t0.elapsed() < Duration::from_secs(3), "not waiting on the pipe");
        assert!(!work.exists());
        std::fs::remove_dir_all(&d).unwrap();
    }

    /// A tree with folders nobody can write in, a file in each, and a link out.
    fn locked_tree(root: &Path, theirs: &Path) {
        use std::os::unix::fs::PermissionsExt;
        std::fs::create_dir_all(root.join("a/b")).unwrap();
        std::fs::write(root.join("a/b/f.txt"), b"in a locked folder").unwrap();
        std::fs::write(root.join("a/g.txt"), b"in another").unwrap();
        std::os::unix::fs::symlink(theirs, root.join("a/link out")).unwrap();
        for sub in ["a/b", "a"] { std::fs::set_permissions(root.join(sub), std::fs::Permissions::from_mode(0o555)).unwrap(); }
    }

    #[test]
    fn folders_nobody_can_write_in_are_still_removed_so_no_space_is_lost_for_good() {
        use std::os::unix::fs::PermissionsExt;
        let d = tmp("locked");
        let theirs = d.join("theirs");
        std::fs::create_dir(&theirs).unwrap();
        std::fs::write(theirs.join("keep.txt"), b"keep").unwrap();
        // The helper itself: everything goes, a link is taken away and never followed.
        locked_tree(&d.join("t1"), &theirs);
        assert!(remove_tree(&d.join("t1")).is_ok());
        assert!(!d.join("t1").exists());
        assert_eq!(std::fs::read(theirs.join("keep.txt")).unwrap(), b"keep");
        assert_eq!(std::fs::metadata(&theirs).unwrap().permissions().mode() & 0o700, 0o700, "what a link points at is not touched");
        assert!(remove_tree(&d.join("not there")).is_err(), "nothing there is not a success");
        // The launch sweep.
        let root = d.join("dev.companion.app-convert");
        locked_tree(&root.join("7-123/0"), &theirs);
        assert!(sweep(&root));
        assert!(!root.exists(), "a work folder with read only folders in it is swept too");
        assert_eq!(std::fs::read(theirs.join("keep.txt")).unwrap(), b"keep");
        // A folder with a read only subfolder, zipped: the copy made for the zip is ours, so it is writable, and the work
        // folder is gone when the job ends. Cloned and copied alike.
        let folder = d.join("Locked");
        locked_tree(&folder, &theirs);
        for (n, clone) in [(1, true), (2, false)] {
            let copy = d.join(format!("copy {n}"));
            assert_eq!(take_folder(&folder, &copy, clone, FOLDER_LIMITS, None, &Job::default()), Ok(()), "{n}");
            assert!(std::fs::metadata(copy.join("a/b")).unwrap().permissions().mode() & 0o200 != 0, "{n}: made ours to change");
            assert!(remove_tree(&copy).is_ok() && !copy.exists(), "{n}");
        }
        let (made, fail) = ran("zip", std::slice::from_ref(&folder), &d.join("w1"), None);
        assert_eq!((made.len(), fail), (1, None));
        assert!(!d.join("w1").exists(), "the work folder is gone");
        // An unzip whose zip says a folder is read only: the work folder is gone either way.
        if Path::new(DITTO).is_file() {
            let z = d.join("ro.zip");
            std::fs::write(&z, real_zip(&[Rz { mode: 0o040555, ..rz("d/", b"") }, rz("d/a.txt", b"alpha")], 0)).unwrap();
            let (_, fail) = ran("unzip", std::slice::from_ref(&z), &d.join("w2"), None);
            eprintln!("read only folder unzip: {fail:?}");
            assert!(!d.join("w2").exists(), "the work folder is gone");
        }
        remove_tree(&d).unwrap();
    }

    #[test]
    fn a_zip_is_refused_unless_its_pieces_fill_the_space_up_to_its_list_with_nothing_unlisted() {
        let d = tmp("zipwalk");
        let write = |name: &str, bytes: Vec<u8>| { let f = d.join(name); std::fs::write(&f, bytes).unwrap(); f };
        let dir = |n| Rz { mode: 0o040755, ..rz(n, b"") };
        let good = real_zip(&[rz("a.txt", b"alpha"), dir("d/"), rz("d/b.txt", b"beta"), rz("empty.txt", b"")], 0);
        assert_eq!(zip_vet(&write("good.zip", good.clone()), ZLIM).map(|_| ()), Ok(()));
        // Something in the pieces that the list does not name: ditto reads the pieces one after another, not the list.
        let hidden = real_zip(&[rz("a.txt", b"alpha"), Rz { listed: false, ..rz("evil.txt", b"x") }, rz("b.txt", b"beta")], 0);
        assert_eq!(zip_vet(&write("hidden.zip", hidden), ZLIM), Err("notZip"));
        // Junk between pieces, and junk between the list and the end record the list is found by.
        assert_eq!(zip_vet(&write("gap.zip", real_zip(&[rz("a.txt", b"alpha"), rz("b.txt", b"beta")], 7)), ZLIM), Err("notZip"));
        let mut apart = good.clone();
        let at = apart.len() - 22;
        apart.splice(at..at, [9u8; 5]);
        assert_eq!(zip_vet(&write("apart.zip", apart.clone()), ZLIM), Err("notZip"));
        assert_eq!(zip_vet_reader(&mut std::io::Cursor::new(apart), ZLIM), Err("notZip"), "also from the list alone");
        // A header that names something else than the list does, as before.
        let mut renamed = good.clone();
        let pos = renamed.windows(5).position(|w| w == b"a.txt").unwrap();
        renamed[pos] = b'z';
        assert_eq!(zip_vet(&write("renamed.zip", renamed), ZLIM), Err("unsafeZip"));
        // Zips the Mac itself and the usual zip tool make are not refused: squeezed, with sizes after the data.
        if Path::new(DITTO).is_file() {
            let src = d.join("Made");
            std::fs::create_dir_all(src.join("sub/deeper")).unwrap();
            std::fs::write(src.join("text.txt"), "all the same words ".repeat(500)).unwrap();
            std::fs::write(src.join("sub/deeper/small.txt"), b"x").unwrap();
            std::fs::write(src.join("sub/empty.txt"), b"").unwrap();
            let out = d.join("made.zip");
            let c = cmd(DITTO, vec![os("-c"), os("-k"), os("--norsrc"), os("--noextattr"), os("--noacl"), pth(&src), pth(&out)]);
            assert_eq!(exec(&c, &Job::default(), &|_| {}).map(|_| ()), Ok(()));
            assert_eq!(zip_vet(&out, UNZIP_LIMITS).map(|_| ()), Ok(()), "a zip made by ditto");
        }
        if Path::new("/usr/bin/zip").is_file() {
            let out = d.join("tool.zip");
            let ok = std::process::Command::new("/usr/bin/zip").current_dir(&d).args(["-q", "-r"]).arg(&out).arg("Made").status().map(|s| s.success()).unwrap_or(false);
            if ok { assert_eq!(zip_vet(&out, UNZIP_LIMITS).map(|_| ()), Ok(()), "a zip made by the usual zip tool"); }
        }
        std::fs::remove_dir_all(&d).unwrap();
    }

    #[test]
    fn the_mode_of_an_entry_counts_whatever_system_the_zip_says_it_was_made_on() {
        // ditto uses the mode bits for any host, so a link is a link whatever the zip claims.
        for host in [0u8, 3, 10, 11, 19] {
            assert_eq!(vet(&[Ze { host, mode: 0o120000, ..ze("a.txt") }], LIM), Err("unsafeZip"), "link, host {host}");
            assert_eq!(vet(&[Ze { host, mode: 0o010644, ..ze("a.txt") }], LIM), Err("unsafeZip"), "pipe, host {host}");
            assert_eq!(vet(&[Ze { host, mode: 0o060644, ..ze("a.txt") }], LIM), Err("unsafeZip"), "device, host {host}");
            assert_eq!(vet(&[Ze { host, mode: 0o100644, ..ze("a.txt") }], LIM), Ok(()), "file, host {host}");
            assert_eq!(vet(&[Ze { host, mode: 0o040755, size: 0, ..ze("d/") }], LIM), Ok(()), "folder, host {host}");
            assert_eq!(vet(&[Ze { host, mode: 0, ..ze("a.txt") }], LIM), Ok(()), "no mode, host {host}");
        }
    }

    // ---- flips follow what is seen ----

    /// A picture 304 by 200 that is white with a red square in the top right corner as stored, with the Orientation tag
    /// given (1 is no tag).
    fn corner_jpeg(at: &Path, orientation: u8) {
        let (w, h) = (304usize, 200usize);
        let px: Vec<u8> = (0..w * h).flat_map(|i| if i % w >= 208 && i / w < 96 { [255u8, 0, 0] } else { [255, 255, 255] }).collect();
        jpeg_encoder::Encoder::new_file(at, 95).unwrap().encode(&px, w as u16, h as u16, jpeg_encoder::ColorType::Rgb).unwrap();
        if orientation == 1 { return; }
        let mut app1 = vec![0xFF, 0xE1, 0, 34];
        app1.extend(b"Exif\0\0");
        app1.extend([b'I', b'I', 42, 0, 8, 0, 0, 0, 1, 0]);
        app1.extend([0x12, 0x01, 3, 0, 1, 0, 0, 0, orientation, 0, 0, 0]);
        app1.extend([0, 0, 0, 0]);
        let jpg = std::fs::read(at).unwrap();
        let mut out = jpg[..2].to_vec();
        out.extend(app1);
        out.extend(&jpg[2..]);
        std::fs::write(at, out).unwrap();
    }
    /// Where the red square is as the picture is seen (the tag applied): the corner's name.
    fn seen_corner(f: &Path) -> String { osa_word("corner", f).split(' ').nth(1).unwrap_or("").to_string() }

    #[test]
    fn a_flip_swaps_its_two_directions_for_a_picture_stored_on_its_side() {
        let c = cmd(SIPS, vec![os("-f"), os("horizontal"), os("/w/0/in.jpg"), os("--out"), os("/w/0/out.jpg")]);
        let s = swap_flip(&c);
        assert_eq!(args(&s), vec!["-f", "vertical", "/w/0/in.jpg", "--out", "/w/0/out.jpg"]);
        assert_eq!(args(&swap_flip(&s)), args(&c));
        assert_eq!(args(&swap_flip(&cmd(SIPS, vec![os("-r"), os("90")]))), vec!["-r", "90"], "anything else is left alone");
        assert_eq!(orientation_of("6\n"), Some(6));
        assert_eq!(orientation_of("\n"), None);
        assert!(on_its_side(5) && on_its_side(8) && !on_its_side(1) && !on_its_side(3) && !on_its_side(4));
        assert!(one("flipHorizontal", "/a/x.jpg").flip && one("flipVertical", "/a/x.png").flip);
        assert!(!one("turnRight", "/a/x.jpg").flip && !one("resize", "/a/x.jpg").flip);
    }

    #[test]
    fn the_real_sips_flips_a_picture_the_way_it_is_seen_even_when_it_is_stored_turned() {
        if !Path::new(SIPS).is_file() || !Path::new(OSASCRIPT).is_file() { return; }
        let d = tmp("flipseen");
        let mirror_h = |c: &str| match c { "TL" => "TR", "TR" => "TL", "BL" => "BR", _ => "BL" };
        let mirror_v = |c: &str| match c { "TL" => "BL", "BL" => "TL", "TR" => "BR", _ => "TR" };
        for o in [1u8, 3, 5, 6, 7, 8] {
            let src = d.join(format!("o{o}.jpg"));
            corner_jpeg(&src, o);
            let seen = seen_corner(&src);
            assert!(["TL", "TR", "BL", "BR"].contains(&seen.as_str()), "o{o}: the test picture shows one red corner: {seen:?}");
            for (action, want) in [("flipHorizontal", mirror_h(&seen)), ("flipVertical", mirror_v(&seen))] {
                let (made, fail) = ran(action, std::slice::from_ref(&src), &d.join(format!("w{o}{action}")), None);
                assert_eq!(fail, None, "o{o} {action}");
                assert_eq!(seen_corner(&made[0]), want, "o{o} {action}: seen at {seen}, expected to be seen at {want}");
            }
        }
        std::fs::remove_dir_all(&d).unwrap();
    }

    // ---- details taken off ----

    #[test]
    fn taking_off_details_also_clears_the_text_and_author_a_png_carries() {
        if !Path::new(SIPS).is_file() || !Path::new(OSASCRIPT).is_file() { return; }
        let d = tmp("pngtext");
        let plain = d.join("plain.jpg");
        jpeg(&plain);
        let base = d.join("base.png");
        let o = std::process::Command::new(SIPS).args(["-s", "format", "png"]).arg(&plain).arg("--out").arg(&base).output().unwrap();
        assert!(o.status.success());
        let tagged = d.join("notes.png");
        assert_eq!(osa(&[Path::new("pngmeta"), &base, &tagged]), "true");
        let has = |f: &Path, s: &str| std::fs::read(f).unwrap().windows(s.len()).any(|w| w == s.as_bytes());
        for s in ["Alice Smith", "secret comment", "AcmeCam"] { assert!(has(&tagged, s), "the test picture carries {s:?}"); }
        let (clean, fail) = ran("stripInfo", std::slice::from_ref(&tagged), &d.join("w"), None);
        assert_eq!((clean.clone(), fail), (vec![d.join("notes (cleaned).png")], None));
        for s in ["Alice Smith", "secret comment", "AcmeCam", "tEXt", "iTXt", "zTXt", "xmpmeta"] { assert!(!has(&clean[0], s), "{s:?} is still in the new picture"); }
        assert_eq!(sips_get(&clean[0], "pixelWidth"), "40", "the picture itself is still there");
        assert!(has(&tagged, "Alice Smith"), "the original is unchanged");
        std::fs::remove_dir_all(&d).unwrap();
    }

    // ---- HEVC ----

    #[test]
    fn a_hevc_conversion_is_kept_only_when_it_is_smaller_as_its_words_say() {
        assert!(one("toHevc", "/a/x.mov").shrink, "the label promises a smaller video");
        assert!(!one("toMp4", "/a/x.mov").shrink, "a plain format change is not held to that");
        let sample = Path::new("/Applications/Numbers.app/Contents/Resources/PlaceholderMovie.mov");
        if !sample.is_file() || !Path::new(AVCONVERT).is_file() || !offered(&probe_tools(), &[sample.to_path_buf()], "toHevc") { return; }
        let d = tmp("hevc");
        let src = d.join("clip.mov");
        std::fs::copy(sample, &src).unwrap();
        let (made, fail) = ran("toHevc", std::slice::from_ref(&src), &d.join("w"), None);
        match (made.first(), fail) {
            (Some(m), None) => assert!(std::fs::metadata(m).unwrap().len() < std::fs::metadata(&src).unwrap().len(), "kept only because it is smaller"),
            (None, Some(Failure::Failed("notSmaller"))) => {}
            other => panic!("{other:?}"),
        }
        std::fs::remove_dir_all(&d).unwrap();
    }
}
