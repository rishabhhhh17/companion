//! F19: drop a file on the companion to convert it. A file dropped on Companion's own windows (the character's window or
//! the island in the notch; Tauri's drop events on those two windows only, never a global drag watch, never key events)
//! gets a ring of what can be done with it, chosen by its type. Everything runs on this Mac with the Mac's own tools only:
//! sips for pictures, PDFKit (through a fixed JavaScript for Automation script run by osascript) for PDFs and for
//! printing a document to PDF, textutil for documents, afconvert for sound and avconvert for video and trimming. No new
//! dependency and no ffmpeg (F19 item 4: its licence is the founder's call).
//!
//! The rules this file keeps:
//! - Nothing is sent anywhere: no file, name or content goes to Claude, the engine or the network. textutil runs with
//!   `-noload`, so an HTML file never fetches what it points at.
//! - Commands are argument lists, never a shell string. Paths are their own arguments (absolute, so none can be read as an
//!   option), and the PDF script is one fixed text that never contains a name.
//! - Only a readable regular file that is not a link is taken (`check_input`).
//! - Never over anything: each tool writes into Companion's own work folder; the result is then put next to the original
//!   (or in Downloads or on the Desktop, drop.saveTo) under a new name that is free ("photo (converted).png"), with a link
//!   or a copy that fails rather than replace a file that appeared meanwhile. Nothing is deleted except the work folder.
//! - Stop everything stops a running job (`Job::stop`): the tool is ended and nothing half made is put anywhere.
use serde_json::Value;
use std::ffi::OsString;
use std::io::Read;
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, Ordering};
use std::time::Duration;

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Kind { Image, Pdf, Document, Audio, Video }
impl Kind {
    pub fn id(self) -> &'static str {
        match self { Kind::Image => "image", Kind::Pdf => "pdf", Kind::Document => "document", Kind::Audio => "audio", Kind::Video => "video" }
    }
}

/// More than this in one drop is not offered anything (said in one line).
pub const MAX_FILES: usize = 20;

const SIPS: &str = "/usr/bin/sips";
const TEXTUTIL: &str = "/usr/bin/textutil";
const AFCONVERT: &str = "/usr/bin/afconvert";
const AVCONVERT: &str = "/usr/bin/avconvert";
const OSASCRIPT: &str = "/usr/bin/osascript";

const IMAGE_IN: &[&str] = &["png", "jpeg", "heic", "tiff", "webp", "gif", "bmp"];
const DOC_IN: &[&str] = &["docx", "doc", "rtf", "html", "txt", "odt"];
const AUDIO_IN: &[&str] = &["m4a", "mp3", "wav", "aiff", "caf", "aac"];
const VIDEO_IN: &[&str] = &["mov", "mp4", "m4v"];
/// Formats sips writes that a resized picture keeps; anything else becomes a PNG.
const SIPS_KEEPS: &[&str] = &["png", "jpeg", "heic", "tiff", "gif", "bmp"];

const IMAGE_TO: &[(&str, &str)] = &[("png", "toPng"), ("jpeg", "toJpeg"), ("heic", "toHeic"), ("tiff", "toTiff"), ("webp", "toWebp")];
const DOC_TO: &[(&str, &str)] = &[("pdf", "toPdf"), ("txt", "toText"), ("docx", "toDocx"), ("rtf", "toRtf"), ("html", "toHtml")];
const AUDIO_TO: &[(&str, &str)] = &[("m4a", "toM4a"), ("wav", "toWav"), ("aiff", "toAiff")];
const VIDEO_TO: &[(&str, &str)] = &[("mp4", "toMp4"), ("mov", "toMov")];

/// A file's extension, lower case, with the usual spellings made one (jpg is jpeg, tif is tiff, heif is heic, htm is
/// html, aif is aiff).
pub fn ext_of(p: &Path) -> String {
    let e = p.extension().map(|e| e.to_string_lossy().to_lowercase()).unwrap_or_default();
    match e.as_str() { "jpg" => "jpeg".into(), "tif" => "tiff".into(), "heif" => "heic".into(), "htm" => "html".into(), "aif" => "aiff".into(), _ => e }
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
    else { None }
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum SaveTo { NextTo, Downloads, Desktop }

/// The settings this feature reads (protocol/settings.json, section files), as the shell applies them.
#[derive(Clone, Debug, PartialEq)]
pub struct Prefs { pub image: String, pub doc: String, pub audio: String, pub video: String, pub resize: u32, pub quality: u8, pub save_to: SaveTo }
/// Every setting read here, so a test proves each is in the registry, kept in settings.json, for the shell.
#[cfg_attr(not(test), allow(dead_code))]   // checked by the tests
pub const KEYS: &[&str] = &["drop.on", "drop.imageFormat", "drop.docFormat", "drop.audioFormat", "drop.videoFormat", "drop.resizeTo", "drop.quality", "drop.saveTo"];
impl Prefs {
    /// The usual values (the registry's defaults).
    pub fn usual() -> Prefs {
        Prefs { image: "png".into(), doc: "pdf".into(), audio: "m4a".into(), video: "mp4".into(), resize: 1600, quality: 60, save_to: SaveTo::NextTo }
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
            save_to: match word("drop.saveTo").as_deref() { Some("downloads") => SaveTo::Downloads, Some("desktop") => SaveTo::Desktop, _ => u.save_to },
        }
    }
}

/// What a drop gets: the actions, in the order the ring shows them, or why nothing can be done.
#[derive(Clone, Debug, PartialEq)]
pub enum Offer { Actions(Kind, Vec<&'static str>), Refused(&'static str) }

/// The conversions to every format in `to` except the one all the files already are, the person's usual one first.
fn formats(to: &[(&'static str, &'static str)], own: Option<&str>, first: &str, skip: &[&str]) -> Vec<&'static str> {
    let mut list: Vec<(&str, &'static str)> = to.iter().copied().filter(|(f, _)| Some(*f) != own && !skip.contains(f)).collect();
    if let Some(i) = list.iter().position(|(f, _)| *f == first) { let one = list.remove(i); list.insert(0, one); }
    list.into_iter().map(|(_, a)| a).collect()
}

/// Which actions these files get. All of one kind, at most MAX_FILES. Trim is for one file at a time; merge is for
/// several PDFs. WebP is offered only when sips on this Mac can write it.
pub fn offer(paths: &[PathBuf], webp_writable: bool, prefs: &Prefs) -> Offer {
    if paths.is_empty() { return Offer::Refused("none"); }
    if paths.len() > MAX_FILES { return Offer::Refused("tooMany"); }
    let kinds: Vec<Option<Kind>> = paths.iter().map(|p| kind_of(p)).collect();
    let Some(kind) = kinds[0] else { return Offer::Refused("unknownKind") };
    if kinds.iter().any(|k| k.is_none()) { return Offer::Refused("unknownKind"); }
    if kinds.iter().any(|k| *k != Some(kind)) { return Offer::Refused("mixed"); }
    let exts: Vec<String> = paths.iter().map(|p| ext_of(p)).collect();
    let own = exts.iter().all(|e| *e == exts[0]).then(|| exts[0].as_str());
    let one = paths.len() == 1;
    let list = match kind {
        Kind::Image => {
            let mut v = formats(IMAGE_TO, own, &prefs.image, if webp_writable { &[] } else { &["webp"] });
            v.extend(["resize", "compress"]);
            v
        }
        Kind::Pdf => {
            let mut v = if one { vec![] } else { vec!["merge"] };
            v.extend(["split", "pdfCompress", "pagesToImages"]);
            v
        }
        Kind::Document => formats(DOC_TO, own, &prefs.doc, &[]),
        Kind::Audio => {
            let mut v = formats(AUDIO_TO, own, &prefs.audio, &[]);
            if one { v.push("trim"); }
            v
        }
        Kind::Video => {
            let mut v = formats(VIDEO_TO, own, &prefs.video, &[]);
            v.push("soundOnly");
            if one { v.push("trim"); }
            v
        }
    };
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

/// A dropped path is used only if it is absolute, there, a regular file (not a folder, not a link) and readable.
pub fn check_input(p: &Path) -> Result<(), &'static str> {
    if !p.is_absolute() { return Err("notAbsolute"); }
    let m = match std::fs::symlink_metadata(p) {
        Ok(m) => m,
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => return Err("missing"),
        Err(_) => return Err("unreadable"),
    };
    if m.file_type().is_symlink() { return Err("link"); }
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

// ---------- the commands ----------

/// One program (an absolute path to a tool macOS ships) and its arguments, never a shell string.
#[derive(Clone, Debug, PartialEq)]
pub struct Cmd { pub program: &'static str, pub args: Vec<OsString> }
fn cmd(program: &'static str, parts: Vec<OsString>) -> Cmd { Cmd { program, args: parts } }
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

/// Where a tool's result is in the work folder before it is put in place.
#[derive(Clone, Debug, PartialEq)]
pub enum Out { File { tmp: PathBuf, ext: String }, Folder { tmp: PathBuf } }
/// One result to make: from which original (its name and folder), the words in its new name, the commands, and where
/// the result is. `max_side`: a resize, which is skipped for a picture already that small (never made bigger).
#[derive(Clone, Debug, PartialEq)]
pub struct Unit { pub source: PathBuf, pub label: &'static str, pub cmds: Vec<Cmd>, pub out: Out, pub max_side: Option<u32> }

/// The extension a result is written with.
fn file_ext(fmt: &str) -> &str { if fmt == "jpeg" { "jpg" } else { fmt } }
fn real_ext(p: &Path) -> String { p.extension().map(|e| e.to_string_lossy().to_lowercase()).unwrap_or_default() }

/// The work for one action on these files. Refused unless the files are offered that action (`offer`; WebP is checked
/// against the menu by the shell), and a trim needs good times.
pub fn plan(action: &str, inputs: &[PathBuf], work: &Path, prefs: &Prefs, trim: Option<Trim>) -> Result<Vec<Unit>, &'static str> {
    let Offer::Actions(kind, offered) = offer(inputs, true, prefs) else { return Err("notOffered") };
    if !offered.contains(&action) { return Err("notOffered"); }
    if action == "trim" && !trim.is_some_and(trim_ok) { return Err("badTrim"); }
    if action == "merge" {
        let dir = work.join("0");
        let out = dir.join("out.pdf");
        let mut rest = vec![pth(&out)];
        rest.extend(inputs.iter().map(|p| pth(p)));
        return Ok(vec![Unit { source: inputs[0].clone(), label: "merged", cmds: vec![jxa("merge", rest)], out: Out::File { tmp: out, ext: "pdf".into() }, max_side: None }]);
    }
    let mut units = vec![];
    for (i, input) in inputs.iter().enumerate() {
        let dir = work.join(i.to_string());
        let file = |ext: &str| dir.join(format!("out.{ext}"));
        let ext = ext_of(input);
        let unit = |label: &'static str, cmds: Vec<Cmd>, out: PathBuf| {
            let e = out.extension().map(|e| e.to_string_lossy().into_owned()).unwrap_or_default();
            Unit { source: input.clone(), label, cmds, out: Out::File { tmp: out, ext: e }, max_side: None }
        };
        let folder = |label: &'static str, job: &str| {
            let out = dir.join("out");
            Unit { source: input.clone(), label, cmds: vec![jxa(job, vec![pth(&out), pth(input)])], out: Out::Folder { tmp: out }, max_side: None }
        };
        let u = match (kind, action) {
            (Kind::Image, a) if IMAGE_TO.iter().any(|(_, x)| *x == a) => {
                let fmt = IMAGE_TO.iter().find(|(_, x)| *x == a).map(|(f, _)| *f).unwrap_or("png");
                let out = file(file_ext(fmt));
                unit("converted", vec![cmd(SIPS, vec![os("-s"), os("format"), os(fmt), pth(input), os("--out"), pth(&out)])], out)
            }
            (Kind::Image, "resize") => {
                let keep = SIPS_KEEPS.contains(&ext.as_str());
                let out = file(if keep { file_ext(&ext) } else { "png" });
                let mut a = vec![os("-Z"), os(&prefs.resize.to_string())];
                if !keep { a.extend([os("-s"), os("format"), os("png")]); }
                a.extend([pth(input), os("--out"), pth(&out)]);
                Unit { max_side: Some(prefs.resize), ..unit("resized", vec![cmd(SIPS, a)], out) }
            }
            (Kind::Image, "compress") => {
                let fmt = if ext == "heic" { "heic" } else { "jpeg" };
                let out = file(file_ext(fmt));
                unit("smaller", vec![cmd(SIPS, vec![os("-s"), os("format"), os(fmt), os("-s"), os("formatOptions"), os(&prefs.quality.to_string()), pth(input), os("--out"), pth(&out)])], out)
            }
            (Kind::Pdf, "split") => folder("pages", "split"),
            (Kind::Pdf, "pagesToImages") => folder("page images", "images"),
            (Kind::Pdf, "pdfCompress") => { let out = file("pdf"); unit("smaller", vec![jxa("compress", vec![pth(&out), pth(input)])], out) }
            (Kind::Document, "toPdf") => {
                let mid = dir.join("mid.rtfd");
                let out = file("pdf");
                unit("converted", vec![
                    cmd(TEXTUTIL, vec![os("-noload"), os("-convert"), os("rtfd"), os("-output"), pth(&mid), os("--"), pth(input)]),
                    jxa("toPdf", vec![pth(&out), pth(&mid)]),
                ], out)
            }
            (Kind::Document, "toText") => {
                let out = file("txt");
                unit("converted", vec![cmd(TEXTUTIL, vec![os("-noload"), os("-convert"), os("txt"), os("-encoding"), os("UTF-8"), os("-output"), pth(&out), os("--"), pth(input)])], out)
            }
            (Kind::Document, "toHtml") => {
                let out = file("html");
                unit("converted", vec![cmd(TEXTUTIL, vec![os("-noload"), os("-nostore"), os("-convert"), os("html"), os("-output"), pth(&out), os("--"), pth(input)])], out)
            }
            (Kind::Document, a @ ("toDocx" | "toRtf")) => {
                let fmt = if a == "toDocx" { "docx" } else { "rtf" };
                let out = file(fmt);
                unit("converted", vec![cmd(TEXTUTIL, vec![os("-noload"), os("-convert"), os(fmt), os("-output"), pth(&out), os("--"), pth(input)])], out)
            }
            (Kind::Audio, a @ ("toM4a" | "toWav" | "toAiff")) => {
                let (fmt, file_type, data) = match a { "toM4a" => ("m4a", "m4af", "aac"), "toWav" => ("wav", "WAVE", "LEI16"), _ => ("aiff", "AIFF", "BEI16") };
                let out = file(fmt);
                unit("converted", vec![cmd(AFCONVERT, vec![os("-f"), os(file_type), os("-d"), os(data), pth(input), pth(&out)])], out)
            }
            (Kind::Video, a @ ("toMp4" | "toMov")) => {
                let out = file(if a == "toMp4" { "mp4" } else { "mov" });
                unit("converted", vec![avconvert(input, &out, "PresetHighestQuality", None)], out)
            }
            (Kind::Video, "soundOnly") => { let out = file("m4a"); unit("sound", vec![avconvert(input, &out, "PresetAppleM4A", None)], out) }
            (Kind::Audio | Kind::Video, "trim") => {
                let (out, preset) = if kind == Kind::Audio { (file("m4a"), "PresetAppleM4A") } else { (file(&real_ext(input)), "PresetHighestQuality") };
                unit("trimmed", vec![avconvert(input, &out, preset, trim)], out)
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

/// One job at a time. Stop everything (and the menu's own Stop) sets `stop`; the tool is ended within a moment.
#[derive(Default)]
pub struct Job { stop: AtomicBool }
impl Job {
    pub fn stop(&self) { self.stop.store(true, Ordering::SeqCst); }
    pub fn stopped(&self) -> bool { self.stop.load(Ordering::SeqCst) }
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Failure { Stopped, Failed(&'static str) }

/// How far a job is: results done of all, and the running tool's own percentage when it says one.
pub type Tell<'a> = &'a dyn Fn(usize, usize, Option<f64>);

/// Runs one program to its end, or ends it when the job is stopped. Its own output is read only for progress and for
/// the reason it failed; nothing it prints is kept. The program gets a plain environment: no key or token of
/// Companion's ever reaches it.
fn exec(c: &Cmd, job: &Job, on_text: &dyn Fn(&str)) -> Result<String, Failure> {
    use std::process::{Command, Stdio};
    let home = std::env::var_os("HOME").unwrap_or_default();
    let mut child = Command::new(c.program).args(&c.args).env_clear()
        .env("PATH", "/usr/bin:/bin:/usr/sbin:/sbin").env("HOME", home).env("TMPDIR", std::env::temp_dir()).env("LANG", "en_US.UTF-8")
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
    let status = loop {
        take(&mut seen);
        if job.stopped() { let _ = child.kill(); let _ = child.wait(); for r in readers { let _ = r.join(); } return Err(Failure::Stopped); }
        match child.try_wait() {
            Ok(Some(s)) => break s,
            Ok(None) => std::thread::sleep(Duration::from_millis(50)),
            Err(_) => { let _ = child.kill(); let _ = child.wait(); return Err(Failure::Failed("toolFailed")); }
        }
    };
    for r in readers { let _ = r.join(); }
    take(&mut seen);
    if status.success() { return Ok(seen); }
    Err(Failure::Failed(if seen.contains("Error: locked") { "locked" } else if seen.contains("Error: unreadable") { "unreadable" } else { "toolFailed" }))
}

/// Makes a new file with `src`'s bytes at `dst`, failing (AlreadyExists) rather than replacing anything there: a hard
/// link when both are on one disk, else a copy into a file created new.
fn link_or_copy_new(src: &Path, dst: &Path) -> std::io::Result<()> {
    match std::fs::hard_link(src, dst) {
        Ok(()) => Ok(()),
        Err(e) if e.kind() == std::io::ErrorKind::AlreadyExists => Err(e),
        Err(_) => {
            let mut to = std::fs::OpenOptions::new().write(true).create_new(true).open(dst)?;
            let r = std::fs::File::open(src).and_then(|mut from| std::io::copy(&mut from, &mut to));
            // A copy that failed half way is our own new file: it is taken away, never left half made.
            if let Err(e) = r { drop(to); let _ = std::fs::remove_file(dst); return Err(e); }
            Ok(())
        }
    }
}

/// Puts a finished result in `dir` under the first free name. A name taken between looking and writing is never written
/// over: the next free one is tried.
pub fn place(out: &Out, dir: &Path, stem: &str, label: &str) -> std::io::Result<PathBuf> {
    let exists = |p: &Path| std::fs::symlink_metadata(p).is_ok();
    let none = || std::io::Error::other("no free name");
    for _ in 0..50 {
        match out {
            Out::File { tmp, ext } => {
                let dest = free_name(dir, stem, label, Some(ext), exists).ok_or_else(none)?;
                match link_or_copy_new(tmp, &dest) {
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
                let mut files: Vec<PathBuf> = std::fs::read_dir(tmp)?.filter_map(|e| e.ok().map(|e| e.path())).filter(|p| p.is_file()).collect();
                files.sort_by_key(|p| page_number(p));
                for f in files { if let Some(name) = f.file_name() { link_or_copy_new(&f, &dest.join(name))?; } }
                return Ok(dest);
            }
        }
    }
    Err(none())
}
fn page_number(p: &Path) -> u32 { p.file_stem().and_then(|s| s.to_string_lossy().rsplit(' ').next().and_then(|n| n.parse().ok())).unwrap_or(0) }

fn made_something(out: &Out) -> bool {
    match out {
        Out::File { tmp, .. } => std::fs::metadata(tmp).map(|m| m.is_file() && m.len() > 0).unwrap_or(false),
        Out::Folder { tmp } => std::fs::read_dir(tmp).map(|mut d| d.next().is_some()).unwrap_or(false),
    }
}

/// Runs every unit in order, each result put in its place as soon as it is made (`dest` says where each goes). Returns
/// what was made and, if the job did not finish, why. What was already made stays (it is new and replaces nothing).
/// The work folder is removed at the end either way.
pub fn run(units: &[Unit], work: &Path, dest: &dyn Fn(&Unit) -> Option<PathBuf>, job: &Job, tell: Tell) -> (Vec<PathBuf>, Option<Failure>) {
    let mut made = vec![];
    let mut skipped = 0usize;
    let fail = run_units(units, dest, job, tell, &mut made, &mut skipped);
    let _ = std::fs::remove_dir_all(work);
    let fail = fail.or_else(|| (made.is_empty() && skipped > 0).then_some(Failure::Failed("alreadySmall")));
    (made, fail)
}

fn run_units(units: &[Unit], dest: &dyn Fn(&Unit) -> Option<PathBuf>, job: &Job, tell: Tell, made: &mut Vec<PathBuf>, skipped: &mut usize) -> Option<Failure> {
    use std::os::unix::fs::DirBuilderExt;
    let of = units.len();
    for (i, u) in units.iter().enumerate() {
        if job.stopped() { return Some(Failure::Stopped); }
        tell(i, of, None);
        // Checked again just before it is used: the file may have been moved, or swapped for a link, since the drop.
        if check_input(&u.source).is_err() { return Some(Failure::Failed("gone")); }
        let dir = match &u.out { Out::File { tmp, .. } => tmp.parent().map(Path::to_path_buf), Out::Folder { tmp } => Some(tmp.clone()) };
        if let Some(d) = dir { if std::fs::DirBuilder::new().recursive(true).mode(0o700).create(&d).is_err() { return Some(Failure::Failed("noWork")); } }
        if let Some(max) = u.max_side {
            let size = cmd(SIPS, vec![os("-g"), os("pixelWidth"), os("-g"), os("pixelHeight"), pth(&u.source)]);
            match exec(&size, job, &|_| {}) {
                Ok(text) => if sips_size(&text).is_some_and(|(w, h)| w.max(h) <= max) { *skipped += 1; continue; },
                Err(f) => return Some(f),
            }
        }
        let progress = |t: &str| {
            for piece in t.split(['\r', '\n']) {
                if let Some((a, b)) = jxa_step(piece) { if b > 0 { tell(i, of, Some((a as f64 / b as f64 * 100.0).min(100.0))); } }
                else if let Some(p) = avconvert_percent(piece) { tell(i, of, Some(p)); }
            }
        };
        for c in &u.cmds { if let Err(f) = exec(c, job, &progress) { return Some(f); } }
        if job.stopped() { return Some(Failure::Stopped); }
        if !made_something(&u.out) { return Some(Failure::Failed("toolFailed")); }
        let Some(to) = dest(u) else { return Some(Failure::Failed("noPlace")) };
        if !std::fs::metadata(&to).map(|m| m.is_dir()).unwrap_or(false) { return Some(Failure::Failed("noPlace")); }
        let stem = u.source.file_stem().map(|s| s.to_string_lossy().into_owned()).unwrap_or_else(|| "file".into());
        match place(&u.out, &to, &stem, u.label) { Ok(p) => made.push(p), Err(_) => return Some(Failure::Failed("noPlace")) }
        tell(i + 1, of, None);
    }
    None
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    fn p(s: &str) -> PathBuf { PathBuf::from(s) }
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
        assert_eq!(kind_of(&p("/a/x.zip")), None);
        assert_eq!(kind_of(&p("/a/noext")), None);
        assert_eq!(ext_of(&p("/a/b.JPG")), "jpeg");
        assert_eq!(ext_of(&p("/a/b.tif")), "tiff");
        assert_eq!(ext_of(&p("/a/b.aif")), "aiff");
    }

    #[test]
    fn an_image_gets_every_other_format_then_resize_and_compress_with_the_usual_format_first() {
        let u = Prefs::usual();
        assert_eq!(acts(offer(&ps(&["/a/x.jpg"]), false, &u)), vec!["toPng", "toHeic", "toTiff", "resize", "compress"]);
        assert_eq!(acts(offer(&ps(&["/a/x.png"]), false, &u)), vec!["toJpeg", "toHeic", "toTiff", "resize", "compress"]);
        // WebP only when sips on this Mac can write it.
        assert_eq!(acts(offer(&ps(&["/a/x.png"]), true, &u)), vec!["toJpeg", "toHeic", "toTiff", "toWebp", "resize", "compress"]);
        assert_eq!(acts(offer(&ps(&["/a/x.webp"]), false, &u)), vec!["toPng", "toJpeg", "toHeic", "toTiff", "resize", "compress"]);
        let heic_first = Prefs { image: "heic".into(), ..Prefs::usual() };
        assert_eq!(acts(offer(&ps(&["/a/x.png"]), false, &heic_first)), vec!["toHeic", "toJpeg", "toTiff", "resize", "compress"]);
    }

    #[test]
    fn pdfs_get_merge_only_when_there_are_several() {
        let u = Prefs::usual();
        assert_eq!(acts(offer(&ps(&["/a/x.pdf"]), false, &u)), vec!["split", "pdfCompress", "pagesToImages"]);
        assert_eq!(acts(offer(&ps(&["/a/x.pdf", "/a/y.PDF"]), false, &u)), vec!["merge", "split", "pdfCompress", "pagesToImages"]);
    }

    #[test]
    fn documents_go_to_pdf_text_and_between_word_rtf_and_html_never_to_their_own_format() {
        let u = Prefs::usual();
        assert_eq!(acts(offer(&ps(&["/a/x.docx"]), false, &u)), vec!["toPdf", "toText", "toRtf", "toHtml"]);
        assert_eq!(acts(offer(&ps(&["/a/x.txt"]), false, &u)), vec!["toPdf", "toDocx", "toRtf", "toHtml"]);
        assert_eq!(acts(offer(&ps(&["/a/x.htm"]), false, &u)), vec!["toPdf", "toText", "toDocx", "toRtf"]);
        let word = Prefs { doc: "docx".into(), ..Prefs::usual() };
        assert_eq!(acts(offer(&ps(&["/a/x.rtf"]), false, &word)), vec!["toDocx", "toPdf", "toText", "toHtml"]);
    }

    #[test]
    fn sound_and_video_convert_and_trim_one_file_at_a_time() {
        let u = Prefs::usual();
        assert_eq!(acts(offer(&ps(&["/a/x.mp3"]), false, &u)), vec!["toM4a", "toWav", "toAiff", "trim"]);
        assert_eq!(acts(offer(&ps(&["/a/x.m4a"]), false, &u)), vec!["toWav", "toAiff", "trim"]);
        assert_eq!(acts(offer(&ps(&["/a/x.wav", "/a/y.wav"]), false, &u)), vec!["toM4a", "toAiff"]);
        assert_eq!(acts(offer(&ps(&["/a/x.mov"]), false, &u)), vec!["toMp4", "soundOnly", "trim"]);
        assert_eq!(acts(offer(&ps(&["/a/x.mp4"]), false, &u)), vec!["toMov", "soundOnly", "trim"]);
        assert_eq!(acts(offer(&ps(&["/a/x.m4v"]), false, &u)), vec!["toMp4", "toMov", "soundOnly", "trim"]);
    }

    #[test]
    fn nothing_mixed_unknown_or_too_many_is_offered() {
        let u = Prefs::usual();
        assert_eq!(offer(&[], false, &u), Offer::Refused("none"));
        assert_eq!(offer(&ps(&["/a/x.zip"]), false, &u), Offer::Refused("unknownKind"));
        assert_eq!(offer(&ps(&["/a/x.png", "/a/y.pdf"]), false, &u), Offer::Refused("mixed"));
        let many: Vec<PathBuf> = (0..=MAX_FILES).map(|i| p(&format!("/a/{i}.png"))).collect();
        assert_eq!(offer(&many, false, &u), Offer::Refused("tooMany"));
    }

    #[test]
    fn several_images_get_the_formats_none_of_them_already_all_have() {
        let u = Prefs::usual();
        assert_eq!(acts(offer(&ps(&["/a/x.png", "/a/y.jpg"]), false, &u)), vec!["toPng", "toJpeg", "toHeic", "toTiff", "resize", "compress"]);
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
        assert_eq!(u.save_to, SaveTo::NextTo);
        let set = Prefs::read(|k| match k { "drop.resizeTo" => json!("2400"), "drop.quality" => json!("small"), "drop.saveTo" => json!("downloads"), "drop.imageFormat" => json!("rm -rf"), _ => Value::Null });
        assert_eq!((set.resize, set.quality, set.save_to, set.image.as_str()), (2400, 40, SaveTo::Downloads, "png"));
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
        assert_eq!(check_input(&dir), Err("notFile"));
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
        assert_eq!(args(&u.cmds[0]), vec!["-s", "format", "png", "/a/my photo.jpg", "--out", "/w/0/out.png"]);
        assert_eq!((u.label, u.out.clone()), ("converted", Out::File { tmp: p("/w/0/out.png"), ext: "png".into() }));
        assert_eq!(args(&one("toHeic", "/a/x.png").cmds[0]), vec!["-s", "format", "heic", "/a/x.png", "--out", "/w/0/out.heic"]);
        assert_eq!(args(&one("toJpeg", "/a/x.png").cmds[0]), vec!["-s", "format", "jpeg", "/a/x.png", "--out", "/w/0/out.jpg"]);
        assert_eq!(args(&one("toTiff", "/a/x.png").cmds[0]), vec!["-s", "format", "tiff", "/a/x.png", "--out", "/w/0/out.tiff"]);
    }

    #[test]
    fn resize_keeps_the_format_it_can_write_and_never_makes_a_picture_bigger() {
        let u = one("resize", "/a/x.png");
        assert_eq!(args(&u.cmds[0]), vec!["-Z", "1600", "/a/x.png", "--out", "/w/0/out.png"]);
        assert_eq!((u.label, u.max_side), ("resized", Some(1600)));
        // WebP cannot be written here, so a resized WebP is a PNG.
        assert_eq!(args(&one("resize", "/a/x.webp").cmds[0]), vec!["-Z", "1600", "-s", "format", "png", "/a/x.webp", "--out", "/w/0/out.png"]);
    }

    #[test]
    fn compress_makes_a_jpeg_at_the_chosen_quality_and_keeps_heic_as_heic() {
        let u = one("compress", "/a/x.png");
        assert_eq!(args(&u.cmds[0]), vec!["-s", "format", "jpeg", "-s", "formatOptions", "60", "/a/x.png", "--out", "/w/0/out.jpg"]);
        assert_eq!(u.label, "smaller");
        assert_eq!(args(&one("compress", "/a/x.heic").cmds[0]), vec!["-s", "format", "heic", "-s", "formatOptions", "60", "/a/x.heic", "--out", "/w/0/out.heic"]);
    }

    #[test]
    fn documents_use_textutil_without_loading_anything_from_the_web() {
        let u = one("toText", "/a/x.docx");
        assert_eq!(u.cmds[0].program, "/usr/bin/textutil");
        assert_eq!(args(&u.cmds[0]), vec!["-noload", "-convert", "txt", "-encoding", "UTF-8", "-output", "/w/0/out.txt", "--", "/a/x.docx"]);
        assert_eq!(args(&one("toDocx", "/a/x.rtf").cmds[0]), vec!["-noload", "-convert", "docx", "-output", "/w/0/out.docx", "--", "/a/x.rtf"]);
        assert_eq!(args(&one("toHtml", "/a/x.rtf").cmds[0]), vec!["-noload", "-nostore", "-convert", "html", "-output", "/w/0/out.html", "--", "/a/x.rtf"]);
    }

    #[test]
    fn a_document_to_pdf_goes_through_textutil_then_the_macs_own_printing() {
        let u = one("toPdf", "/a/x.html");
        assert_eq!(u.cmds.len(), 2);
        assert_eq!(args(&u.cmds[0]), vec!["-noload", "-convert", "rtfd", "-output", "/w/0/mid.rtfd", "--", "/a/x.html"]);
        assert_eq!(u.cmds[1].program, "/usr/bin/osascript");
        let a = args(&u.cmds[1]);
        assert_eq!(&a[..2], &["-l", "JavaScript"]);
        assert_eq!(a[2], "-e");
        assert_eq!(&a[4..], &["--", "toPdf", "/w/0/out.pdf", "/w/0/mid.rtfd"]);
    }

    #[test]
    fn pdfs_use_pdfkit_through_a_fixed_script_with_the_paths_as_arguments() {
        let m = plan("merge", &ps(&["/a/one.pdf", "/a/two.pdf"]), &p("/w"), &Prefs::usual(), None).unwrap();
        assert_eq!(m.len(), 1, "one merged file");
        assert_eq!((m[0].label, m[0].source.clone()), ("merged", p("/a/one.pdf")));
        assert_eq!(&args(&m[0].cmds[0])[4..], &["--", "merge", "/w/0/out.pdf", "/a/one.pdf", "/a/two.pdf"]);
        let s = one("split", "/a/x.pdf");
        assert_eq!((s.label, s.out.clone()), ("pages", Out::Folder { tmp: p("/w/0/out") }));
        assert_eq!(&args(&s.cmds[0])[4..], &["--", "split", "/w/0/out", "/a/x.pdf"]);
        let i = one("pagesToImages", "/a/x.pdf");
        assert_eq!(i.label, "page images");
        assert_eq!(&args(&i.cmds[0])[4..], &["--", "images", "/w/0/out", "/a/x.pdf"]);
        let c = one("pdfCompress", "/a/x.pdf");
        assert_eq!(c.label, "smaller");
        assert_eq!(&args(&c.cmds[0])[4..], &["--", "compress", "/w/0/out.pdf", "/a/x.pdf"]);
        // The script is the same fixed text every time: nothing from a file name is ever part of it.
        assert_eq!(args(&s.cmds[0])[3], args(&i.cmds[0])[3]);
    }

    #[test]
    fn sound_uses_afconvert_and_video_and_trimming_use_avconvert() {
        assert_eq!(one("toM4a", "/a/x.wav").cmds[0].program, "/usr/bin/afconvert");
        assert_eq!(args(&one("toM4a", "/a/x.wav").cmds[0]), vec!["-f", "m4af", "-d", "aac", "/a/x.wav", "/w/0/out.m4a"]);
        assert_eq!(args(&one("toWav", "/a/x.mp3").cmds[0]), vec!["-f", "WAVE", "-d", "LEI16", "/a/x.mp3", "/w/0/out.wav"]);
        assert_eq!(args(&one("toAiff", "/a/x.mp3").cmds[0]), vec!["-f", "AIFF", "-d", "BEI16", "/a/x.mp3", "/w/0/out.aiff"]);
        let v = one("toMp4", "/a/x.mov");
        assert_eq!(v.cmds[0].program, "/usr/bin/avconvert");
        assert_eq!(args(&v.cmds[0]), vec!["--source", "/a/x.mov", "--output", "/w/0/out.mp4", "--preset", "PresetHighestQuality", "--progress"]);
        assert_eq!(args(&one("soundOnly", "/a/x.mov").cmds[0]), vec!["--source", "/a/x.mov", "--output", "/w/0/out.m4a", "--preset", "PresetAppleM4A", "--progress"]);
        let t = plan("trim", &ps(&["/a/x.mov"]), &p("/w"), &Prefs::usual(), Some(Trim { start: 1.5, end: 10.0 })).unwrap();
        assert_eq!(args(&t[0].cmds[0]), vec!["--source", "/a/x.mov", "--output", "/w/0/out.mov", "--preset", "PresetHighestQuality", "--progress", "--start", "1.5", "--duration", "8.5"]);
        assert_eq!(t[0].label, "trimmed");
        let a = plan("trim", &ps(&["/a/x.wav"]), &p("/w"), &Prefs::usual(), Some(Trim { start: 0.0, end: 30.0 })).unwrap();
        assert_eq!(args(&a[0].cmds[0]), vec!["--source", "/a/x.wav", "--output", "/w/0/out.m4a", "--preset", "PresetAppleM4A", "--progress", "--start", "0", "--duration", "30"]);
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
        assert_eq!(args(&u[1].cmds[0]), vec!["-s", "format", "jpeg", "/b/y.png", "--out", "/w/1/out.jpg"]);
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
        run(&units, work, &|u| u.source.parent().map(Path::to_path_buf), &Job::default(), &|_, _, _| {})
    }

    #[test]
    fn placing_never_writes_over_a_file_that_is_there_and_takes_the_next_free_name() {
        let d = tmp("place");
        let made = d.join("made.png");
        std::fs::write(&made, b"new").unwrap();
        std::fs::write(d.join("photo (converted).png"), b"old").unwrap();
        let got = place(&Out::File { tmp: made.clone(), ext: "png".into() }, &d, "photo", "converted").unwrap();
        assert_eq!(got, d.join("photo (converted 2).png"));
        assert_eq!(std::fs::read(d.join("photo (converted).png")).unwrap(), b"old", "the file already there is untouched");
        assert_eq!(std::fs::read(&got).unwrap(), b"new");
        // A folder result keeps its pages in order.
        let pages = d.join("pages");
        std::fs::create_dir(&pages).unwrap();
        for n in [1, 2, 10] { std::fs::write(pages.join(format!("page {n}.pdf")), b"%PDF").unwrap(); }
        let f = place(&Out::Folder { tmp: pages }, &d, "report", "pages").unwrap();
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
        let unit = Unit { source: src.clone(), label: "converted", cmds: vec![Cmd { program: "/bin/sleep", args: vec![os("5")] }], out: Out::File { tmp: work.join("0/out.png"), ext: "png".into() }, max_side: None };
        let job = std::sync::Arc::new(Job::default());
        let j = job.clone();
        std::thread::spawn(move || { std::thread::sleep(Duration::from_millis(200)); j.stop(); });
        let t0 = std::time::Instant::now();
        let (made, fail) = run(&[unit], &work, &|u| u.source.parent().map(Path::to_path_buf), &job, &|_, _, _| {});
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
        let (made, fail) = run(&units, &d.join("work"), &|u| u.source.parent().map(Path::to_path_buf), &Job::default(), &|_, _, _| {});
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
        let (small, fail) = ran("compress", std::slice::from_ref(&src), &d.join("w4"), None);
        assert_eq!((small, fail), (vec![d.join("my photo (smaller).jpg")], None));
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
}

