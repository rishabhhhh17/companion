//! Files into the ask box, documents (M14 day one: drag a file in or paste one, and ask about it). Home's page reads a
//! dropped or pasted file itself (attachfiles.ts); a text file it reads as it is, but a PDF, a Word file or an Excel sheet
//! it hands here, and only the text read from it goes back. Everything runs on this Mac with the Mac's own tools, no new
//! dependency (the same tools as F19's conversions, convert.rs):
//!  - a PDF: PDFKit's own text of the document (`PDFDocument.string`), through one fixed JavaScript for Automation script
//!    run by osascript. A PDF with a password is refused as locked, never opened with one; a scan has no text to read.
//!  - Word (.docx, .doc), rich text (.rtf) and OpenDocument text (.odt): textutil, to plain UTF-8 text. `-noload` keeps it
//!    from fetching anything, and it never reads pictures into plain text.
//!  - Excel (.xlsx): a zip of XML files. Its list is vetted first (convert::zip_vet: no password, nothing that climbs out,
//!    not too many files or bytes once opened), then only the few parts needed are read with unzip `-p`, straight into
//!    memory (nothing is extracted to disk), and the small reader here turns each sheet into lines of comma separated
//!    values under the sheet's name. The old binary .xls, Numbers, Pages and Keynote are not read: nothing on a Mac reads
//!    their text without a new dependency.
//!
//! The rules this file keeps:
//! - Nothing is stored and nothing is logged: not the text, not the name, not a line about the file. The text goes back
//!   to the page only (the page hides its secrets and clips it to the limit in Settings, runner/src/attach.ts).
//! - The only thing written to disk is what the tools strictly need: Companion's copy of the file (never named after it)
//!   and, for a PDF or a Word file, the tool's text, in a private folder (owner only) made for this one read in the Mac's
//!   temporary folder, and removed when the read ends, whatever happened (`Work`'s drop). A folder left by a Companion
//!   that was ended mid read is removed at the next launch (`sweep`, as convert.rs does with its own).
//! - Commands are argument lists with absolute paths, never a shell string, with a plain environment (no key or token of
//!   Companion's ever reaches a tool), and each is ended if it takes longer than `TIMEOUT`.
//! - Caps: a document up to `MAX_INPUT` bytes; at most `MAX_TEXT` bytes of text go back (said with `cut`), far more than
//!   the most the page sends (100 KB), so the page can clip it to the person's limit and say so.
use serde_json::{json, Value};
use std::io::{Read, Write};
use std::path::{Path, PathBuf};
use std::process::{Command, Stdio};
use std::sync::atomic::{AtomicU64, Ordering};
use std::time::{Duration, Instant};

const TEXTUTIL: &str = "/usr/bin/textutil";
const OSASCRIPT: &str = "/usr/bin/osascript";
const UNZIP: &str = "/usr/bin/unzip";

/// The biggest document read (the page checks the same cap first, attach.ts maxDocBytes).
pub const MAX_INPUT: usize = 20_000_000;
/// The most text that goes back to the page.
pub const MAX_TEXT: usize = 400_000;
/// The longest a tool may take before it is ended.
pub const TIMEOUT: Duration = Duration::from_secs(30);
/// The most of one part of a sheet (its XML) that is read: a sheet longer than this is read from its start only.
const MAX_PART: usize = 32 << 20;
/// What an Excel file may hold once opened, by what its own list says (it is never extracted).
const SHEET_LIMITS: crate::convert::Limits = crate::convert::Limits { files: 5_000, bytes: 1 << 30 };
/// The same for a Word (.docx) or OpenDocument (.odt) file, which are zips too: read from the zip's own list before textutil is started.
const WORD_LIMITS: crate::convert::Limits = SHEET_LIMITS;
/// The most sheets read from one workbook.
const MAX_SHEETS: usize = 50;

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Doc { Pdf, Word, Sheet }

/// Which reader a document's name calls for, by its ending alone (lower case). None for anything else.
pub fn doc_of(name: &str) -> Option<Doc> {
    let ext = Path::new(name).extension()?.to_str()?.to_ascii_lowercase();
    match ext.as_str() { "pdf" => Some(Doc::Pdf), "docx" | "doc" | "rtf" | "odt" => Some(Doc::Word), "xlsx" => Some(Doc::Sheet), _ => None }
}
fn ext_of(d: Doc, name: &str) -> String {
    match d { Doc::Pdf => "pdf".into(), Doc::Sheet => "xlsx".into(), Doc::Word => Path::new(name).extension().and_then(|e| e.to_str()).unwrap_or("docx").to_ascii_lowercase() }
}

/// Settings and key files by a document's name: the page refuses them first (secretfiles.ts `isEnvFile`); this is the
/// same rule for the names that can reach here (a document's ending), kept as a second check.
pub fn secret_name(name: &str) -> bool {
    let base = name.rsplit(['/', '\\']).next().unwrap_or("").to_ascii_lowercase();
    if base.starts_with(".env") || base.ends_with(".env") { return true; }
    let stem = base.split_once('.').map(|(s, _)| s).unwrap_or(&base);
    let one_ending = base.matches('.').count() <= 1;
    one_ending && matches!(stem, "credentials" | "secret" | "secrets")
}

/// Why a document's text could not be read, as one word the page puts in plain words.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Refuse { Kind, TooBig, Locked, NoText, Unreadable }
impl Refuse {
    pub fn word(self) -> &'static str {
        match self { Refuse::Kind => "kind", Refuse::TooBig => "tooBig", Refuse::Locked => "locked", Refuse::NoText => "noText", Refuse::Unreadable => "unreadable" }
    }
}

/// A document's text; `cut` when only its start came back.
#[derive(Debug, PartialEq, Eq)]
pub struct Text { pub text: String, pub cut: bool }

/// What the page is given: `{ text, cut }` or `{ error }`.
pub fn reply(r: Result<Text, Refuse>) -> Value {
    match r { Ok(t) => json!({ "text": t.text, "cut": t.cut }), Err(e) => json!({ "error": e.word() }) }
}

/// The folder each read's own private folder is made in.
pub fn read_root() -> PathBuf { std::env::temp_dir().join("dev.companion.app-read") }

/// One read's private folder: made owner only, never over anything, and removed with everything in it when this ends.
pub struct Work { pub dir: PathBuf }
impl Work {
    pub fn new(root: &Path) -> std::io::Result<Work> {
        use std::os::unix::fs::DirBuilderExt;
        static N: AtomicU64 = AtomicU64::new(0);
        use std::os::unix::fs::{MetadataExt, PermissionsExt};
        std::fs::DirBuilder::new().recursive(true).mode(0o700).create(root)?;
        // The root must be a real folder of ours, not a link someone put there, and owner only even when it was there before
        // (a folder somebody else owns is never used; one of ours with wider modes is tightened).
        let m = std::fs::symlink_metadata(root)?;
        if !m.is_dir() { return Err(std::io::Error::other("not a folder")); }
        if m.uid() != unsafe { libc::geteuid() } { return Err(std::io::Error::other("not our folder")); }
        if m.permissions().mode() & 0o077 != 0 { std::fs::set_permissions(root, std::fs::Permissions::from_mode(0o700))?; }
        let nanos = std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).map(|d| d.as_nanos()).unwrap_or(0);
        let dir = root.join(format!("{}-{}-{}", std::process::id(), N.fetch_add(1, Ordering::SeqCst), nanos));
        std::fs::DirBuilder::new().mode(0o700).create(&dir)?;   // fails if anything is there already
        Ok(Work { dir })
    }
    /// Writes a new file (owner only) in the folder; never over one.
    fn put(&self, name: &str, bytes: &[u8]) -> std::io::Result<PathBuf> {
        use std::os::unix::fs::OpenOptionsExt;
        let p = self.dir.join(name);
        let mut f = std::fs::OpenOptions::new().write(true).create_new(true).mode(0o600).open(&p)?;
        f.write_all(bytes)?;
        Ok(p)
    }
}
impl Drop for Work {
    fn drop(&mut self) { let _ = std::fs::remove_dir_all(&self.dir); }
}

/// Removes what reads left in `root` when Companion was ended mid read. Launch only (the same moment as convert's sweep).
pub fn sweep(root: &Path) -> bool { crate::convert::sweep(root) }

/// Reads a document's text, in a private folder under `root` that is gone when this returns.
pub fn read(root: &Path, name: &str, bytes: &[u8]) -> Result<Text, Refuse> {
    let Some(doc) = doc_of(name) else { return Err(Refuse::Kind) };
    if secret_name(name) { return Err(Refuse::Kind); }
    if bytes.len() > MAX_INPUT { return Err(Refuse::TooBig); }
    if bytes.is_empty() { return Err(Refuse::NoText); }
    if doc == Doc::Word && bytes.starts_with(b"PK") && crate::convert::zip_vet_reader(&mut std::io::Cursor::new(bytes), WORD_LIMITS) == Err("tooBig") { return Err(Refuse::TooBig); }
    let work = Work::new(root).map_err(|_| Refuse::Unreadable)?;
    // Companion's copy is never named after the file: only its ending, which the tools go by.
    let input = work.put(&format!("in.{}", ext_of(doc, name)), bytes).map_err(|_| Refuse::Unreadable)?;
    let got = match doc {
        Doc::Pdf => pdf_text(&work, &input),
        Doc::Word => word_text(&work, &input),
        Doc::Sheet => sheet_text(&input),
    }?;
    let t = got.text.replace('\0', "");
    if t.trim().is_empty() { return Err(Refuse::NoText); }
    Ok(Text { text: t, cut: got.cut })
}

/// A tool's way out, read: what it printed (up to `cap` bytes), whether there was more, and whether it ended well.
struct Ran { out: Vec<u8>, more: bool, ok: bool, err: String }

/// Runs one of the Mac's tools with a plain environment and nothing on its input, reading at most `cap` bytes of what it
/// prints (it is ended once it passes that) and ending it at `timeout`. Its own words on stderr are kept short, for the
/// reason a fixed script gives.
fn run(program: &str, args: &[&std::ffi::OsStr], cap: usize, timeout: Duration) -> Option<Ran> {
    use std::os::unix::process::CommandExt;
    let mut child = Command::new(program).args(args).env_clear().env("PATH", "/usr/bin:/bin")
        .stdin(Stdio::null()).stdout(Stdio::piped()).stderr(Stdio::piped()).process_group(0).spawn().ok()?;
    let end = |c: &mut std::process::Child| { unsafe { libc::killpg(c.id() as libc::pid_t, libc::SIGKILL); } let _ = c.kill(); let _ = c.wait(); };
    let mut out_pipe = child.stdout.take()?;
    let mut err_pipe = child.stderr.take()?;
    let (tx, rx) = std::sync::mpsc::channel::<(Vec<u8>, bool)>();
    std::thread::spawn(move || {
        let (mut out, mut buf, mut more) = (Vec::new(), [0u8; 65_536], false);
        while let Ok(n) = out_pipe.read(&mut buf) {
            if n == 0 { break; }
            let room = cap.saturating_sub(out.len());
            out.extend_from_slice(&buf[..n.min(room)]);
            if n > room { more = true; break; }
        }
        let _ = tx.send((out, more));
    });
    let errs = std::thread::spawn(move || { let mut e = Vec::new(); let _ = err_pipe.by_ref().take(4096).read_to_end(&mut e); String::from_utf8_lossy(&e).into_owned() });
    let started = Instant::now();
    loop {
        if let Ok((out, more)) = rx.try_recv() {
            // Everything wanted is in (or the cap was passed): the tool is not needed any more.
            if more { end(&mut child); return Some(Ran { out, more, ok: true, err: String::new() }); }
            let status = loop {
                match child.try_wait() {
                    Ok(Some(s)) => break Some(s),
                    Ok(None) if started.elapsed() < timeout => std::thread::sleep(Duration::from_millis(20)),
                    _ => { end(&mut child); break None; }
                }
            };
            let err = errs.join().unwrap_or_default();
            return status.map(|s| Ran { out, more, ok: s.success(), err });
        }
        if started.elapsed() >= timeout { end(&mut child); return None; }
        std::thread::sleep(Duration::from_millis(20));
    }
}

/// UTF-8 text from a file a tool wrote, at most `MAX_TEXT` bytes of it, cut between characters.
fn text_file(p: &Path) -> Result<Text, Refuse> {
    let f = std::fs::File::open(p).map_err(|_| Refuse::Unreadable)?;
    let mut b = Vec::new();
    f.take(MAX_TEXT as u64 + 1).read_to_end(&mut b).map_err(|_| Refuse::Unreadable)?;
    Ok(cut_text(b, MAX_TEXT))
}

/// Bytes as text, at most `max` of them, cut at a character's start (a bad sequence becomes the replacement mark).
pub fn cut_text(mut b: Vec<u8>, max: usize) -> Text {
    let mut cut = false;
    if b.len() > max {
        cut = true;
        let mut at = max;
        while at > 0 && (b[at] & 0xC0) == 0x80 { at -= 1; }
        b.truncate(at);
    }
    let text = String::from_utf8(b).unwrap_or_else(|e| String::from_utf8_lossy(e.as_bytes()).into_owned());
    Text { text, cut }
}

/// The PDF job: one fixed script, given only the two paths in the private folder. Its text is written there as UTF-8.
const PDF_SCRIPT: &str = r#"ObjC.import('PDFKit'); ObjC.import('Foundation');
function run(argv) {
  var d = $.PDFDocument.alloc.initWithURL($.NSURL.fileURLWithPath(argv[0]));
  if (!d || d.isNil()) throw new Error('unreadable');
  if (d.isLocked) throw new Error('locked');
  var s = d.string;
  if (!s || s.isNil()) s = $('');
  if (!s.writeToFileAtomicallyEncodingError(argv[1], false, $.NSUTF8StringEncoding, null)) throw new Error('unreadable');
  return '';
}"#;

fn pdf_text(work: &Work, input: &Path) -> Result<Text, Refuse> {
    let out = work.dir.join("text.txt");
    let a: Vec<&std::ffi::OsStr> = vec!["-l".as_ref(), "JavaScript".as_ref(), "-e".as_ref(), PDF_SCRIPT.as_ref(), "--".as_ref(), input.as_os_str(), out.as_os_str()];
    let r = run(OSASCRIPT, &a, 4096, TIMEOUT).ok_or(Refuse::Unreadable)?;
    if !r.ok { return Err(if r.err.contains("Error: locked") { Refuse::Locked } else { Refuse::Unreadable }); }
    text_file(&out)
}

fn word_text(work: &Work, input: &Path) -> Result<Text, Refuse> {
    let out = work.dir.join("text.txt");
    let a: Vec<&std::ffi::OsStr> = vec!["-convert".as_ref(), "txt".as_ref(), "-encoding".as_ref(), "UTF-8".as_ref(), "-noload".as_ref(), "-output".as_ref(), out.as_os_str(), input.as_os_str()];
    let r = run(TEXTUTIL, &a, 4096, TIMEOUT).ok_or(Refuse::Unreadable)?;
    if !r.ok || !out.is_file() { return Err(Refuse::Unreadable); }
    text_file(&out)
}

// ---------- Excel (.xlsx) ----------

/// One part of the workbook, straight into memory (`unzip -p`), at most `MAX_PART` bytes; `more` when it is longer. Only
/// names this file chose and checked (`part_ok`) are asked for, so none can be read as a pattern or an option.
fn part(input: &Path, name: &str) -> Option<(String, bool)> {
    if !part_ok(name) { return None; }
    let a: Vec<&std::ffi::OsStr> = vec!["-p".as_ref(), "-q".as_ref(), input.as_os_str(), name.as_ref()];
    let r = run(UNZIP, &a, MAX_PART, TIMEOUT)?;
    if !r.ok { return None; }
    Some((String::from_utf8_lossy(&r.out).into_owned(), r.more))
}

/// A part's name inside the workbook that may be asked for: under xl/ (so it never starts with a dash and cannot be read
/// as an option), letters, digits, dots, dashes, underscores and slashes only (no pattern characters for unzip, no
/// space), never "..", ending in .xml or .rels.
pub fn part_ok(name: &str) -> bool {
    name.starts_with("xl/") && name.len() <= 200 && !name.contains("..") && !name.contains("//")
        && name.chars().all(|c| c.is_ascii_alphanumeric() || "._-/".contains(c)) && (name.ends_with(".xml") || name.ends_with(".rels"))
}

fn sheet_text(input: &Path) -> Result<Text, Refuse> {
    match crate::convert::zip_vet(input, SHEET_LIMITS) {
        Ok(_) => {}
        Err("zipLocked") => return Err(Refuse::Locked),
        Err("tooBig") => return Err(Refuse::TooBig),
        Err(_) => return Err(Refuse::Unreadable),
    }
    let (workbook, _) = part(input, "xl/workbook.xml").ok_or(Refuse::Unreadable)?;
    let rels = part(input, "xl/_rels/workbook.xml.rels").map(|p| p.0).unwrap_or_default();
    let shared = part(input, "xl/sharedStrings.xml").map(|p| shared_strings(&p.0)).unwrap_or_default();
    let mut out = String::new();
    let mut cut = false;
    for (n, (name, path)) in sheets(&workbook, &rels).into_iter().enumerate() {
        if n >= MAX_SHEETS { cut = true; break; }
        let Some((xml, more)) = part(input, &path) else { continue };
        cut |= more;
        if !out.is_empty() { out.push('\n'); }
        out.push_str(&format!("Sheet: {name}\n"));
        for row in sheet_rows(&xml, &shared) {
            out.push_str(&csv_line(&row));
            out.push('\n');
            if out.len() > MAX_TEXT { break; }
        }
        if out.len() > MAX_TEXT { break; }
    }
    let t = cut_text(out.into_bytes(), MAX_TEXT);
    Ok(Text { text: t.text, cut: t.cut || cut })
}

/// XML's five named characters and numbered ones, as text. Anything unknown is left as it is.
pub fn unescape(s: &str) -> String {
    if !s.contains('&') { return s.to_string(); }
    let mut out = String::with_capacity(s.len());
    let mut rest = s;
    while let Some(i) = rest.find('&') {
        out.push_str(&rest[..i]);
        rest = &rest[i..];
        // The look ahead is over bytes: a cut at byte 12 can fall inside a letter such as "é", which a text slice would panic on.
        let Some(j) = rest.as_bytes()[..rest.len().min(12)].iter().position(|b| *b == b';') else { out.push('&'); rest = &rest[1..]; continue };
        let ent = &rest[1..j];
        let ch = match ent {
            "lt" => Some('<'), "gt" => Some('>'), "amp" => Some('&'), "quot" => Some('"'), "apos" => Some('\''),
            _ if ent.starts_with("#x") || ent.starts_with("#X") => u32::from_str_radix(&ent[2..], 16).ok().and_then(char::from_u32),
            _ if ent.starts_with('#') => ent[1..].parse::<u32>().ok().and_then(char::from_u32),
            _ => None,
        };
        match ch { Some(c) => { out.push(c); rest = &rest[j + 1..]; } None => { out.push('&'); rest = &rest[1..]; } }
    }
    out.push_str(rest);
    out
}

/// Each element `<tag ...>...</tag>` or `<tag .../>` in `xml`, whole, in order. Not for a tag that holds itself.
fn elements<'a>(xml: &'a str, tag: &str) -> Vec<&'a str> {
    let open = format!("<{tag}");
    let close = format!("</{tag}>");
    let mut out = Vec::new();
    let mut at = 0;
    while let Some(i) = xml[at..].find(&open).map(|i| at + i) {
        let after = xml.as_bytes().get(i + open.len()).copied();
        if !matches!(after, Some(b' ') | Some(b'>') | Some(b'/') | Some(b'\n') | Some(b'\r') | Some(b'\t')) { at = i + open.len(); continue; }
        let Some(gt) = xml[i..].find('>').map(|g| i + g) else { break };
        if xml.as_bytes()[gt - 1] == b'/' { out.push(&xml[i..=gt]); at = gt + 1; continue; }
        let Some(end) = xml[gt..].find(&close).map(|e| gt + e + close.len()) else { break };   // cut short: stop here
        out.push(&xml[i..end]);
        at = end;
    }
    out
}

/// An attribute of an element's start tag, unescaped. `name` may be a local name with any prefix ("id" finds "r:id").
fn attr(el: &str, name: &str) -> Option<String> {
    let head = &el[..el.find('>').unwrap_or(el.len())];
    let mut rest = head;
    while let Some(eq) = rest.find('=') {
        let key = rest[..eq].trim_end().rsplit(|c: char| c.is_whitespace()).next().unwrap_or("");
        let after = rest[eq + 1..].trim_start();
        let q = after.chars().next()?;
        if q != '"' && q != '\'' { return None; }
        let end = after[1..].find(q)?;
        let local = key.rsplit(':').next().unwrap_or(key);
        if key == name || (name == "id" && key.contains(':') && local == "id") { return Some(unescape(&after[1..1 + end])); }
        rest = &after[1 + end + 1..];
    }
    None
}

/// The text inside an element, through every `<t>` in it (rich text runs), leaving out phonetic guides (`<rPh>`).
fn t_text(el: &str) -> String {
    // One pass, so a text with a million guides is as quick as one with none (cutting each out of a copy was quadratic).
    let (mut s, mut rest) = (String::with_capacity(el.len()), el);
    while let Some(i) = rest.find("<rPh") {
        s.push_str(&rest[..i]);
        match rest[i..].find("</rPh>") { Some(j) => rest = &rest[i + j + 6..], None => break }   // cut short: what is left stays as it is
    }
    s.push_str(rest);
    elements(&s, "t").iter().map(|t| inner(t)).collect::<Vec<_>>().join("")
}
/// An element's own text between its start and end tags, unescaped ("" for `<x/>`).
fn inner(el: &str) -> String {
    if el.ends_with("/>") && !el.contains("</") { return String::new(); }
    let start = el.find('>').map(|i| i + 1).unwrap_or(0);
    let end = el.rfind("</").unwrap_or(el.len()).max(start);
    unescape(&el[start..end])
}

/// The workbook's shared strings, in order.
pub fn shared_strings(xml: &str) -> Vec<String> { elements(xml, "si").iter().map(|si| t_text(si)).collect() }

/// The sheets in the workbook's order: each one's name and its part's path, from the workbook and its links. A sheet whose
/// path is not a plain part of the workbook is left out.
pub fn sheets(workbook: &str, rels: &str) -> Vec<(String, String)> {
    let links: Vec<(String, String)> = elements(rels, "Relationship").iter().filter_map(|r| Some((attr(r, "Id")?, attr(r, "Target")?))).collect();
    elements(workbook, "sheet").iter().filter_map(|s| {
        let name = attr(s, "name")?;
        let id = attr(s, "id")?;
        let target = links.iter().find(|(i, _)| *i == id)?.1.clone();
        let path = match target.strip_prefix('/') { Some(abs) => abs.to_string(), None => format!("xl/{target}") };
        part_ok(&path).then_some((name, path))
    }).collect()
}

/// A cell reference's column ("C7" is 2, "AA1" is 26). None when it has no letters.
pub fn col_of(r: &str) -> Option<usize> {
    let letters: Vec<u8> = r.bytes().take_while(|b| b.is_ascii_alphabetic()).collect();
    if letters.is_empty() || letters.len() > 3 { return None; }
    Some(letters.iter().fold(0usize, |n, b| n * 26 + (b.to_ascii_uppercase() - b'A' + 1) as usize) - 1)
}

/// The most columns a row is drawn with (cells further right are left out).
const MAX_COLS: usize = 200;

/// A sheet's rows, each cell as its text: shared strings looked up, inline strings, numbers as written, TRUE and FALSE.
/// Empty cells between filled ones are kept empty so each value stays under its column; empty rows are left out.
///
/// At most `MAX_TEXT` bytes of cell text are built in all (a few over, so the caller still sees it was cut), and the rest of
/// the sheet is not read: a cell that names a shared string is a copy of it, so a sheet of cells that name one big string
/// would otherwise fill the memory long before the text is cut.
pub fn sheet_rows(xml: &str, shared: &[String]) -> Vec<Vec<String>> {
    let data = xml.find("<sheetData").map(|i| &xml[i..]).unwrap_or(xml);
    let mut room = MAX_TEXT + 8;
    let mut rows = Vec::new();
    for row in elements(data, "row") {
        let mut cells: Vec<String> = Vec::new();
        let body = &row[row.find('>').map(|i| i + 1).unwrap_or(0)..];
        for c in elements(body, "c") {
            let col = attr(c, "r").and_then(|r| col_of(&r)).unwrap_or(cells.len());
            if col >= MAX_COLS { continue; }
            let v = elements(c, "v").first().map(|v| inner(v)).unwrap_or_default();
            let (text, cut) = match attr(c, "t").as_deref() {
                Some("s") => v.trim().parse::<usize>().ok().and_then(|i| shared.get(i)).map(|s| clip(s, room)).unwrap_or_default(),
                Some("inlineStr") => clip(&elements(c, "is").first().map(|i| t_text(i)).unwrap_or_default(), room),
                Some("b") => (match v.trim() { "1" => "TRUE".into(), "0" => "FALSE".into(), o => o.into() }, false),
                _ => clip(&v, room),
            };
            if text.is_empty() && !cut { continue; }
            room = if cut { 0 } else { room.saturating_sub(text.len()) };
            if !text.is_empty() {
                if cells.len() <= col { cells.resize(col + 1, String::new()); }
                cells[col] = text;
            }
            if room == 0 { break; }
        }
        if !cells.is_empty() { rows.push(cells); }
        if room == 0 { break; }
    }
    rows
}
/// At most `max` bytes of `s`, cut at a character's start, and whether it was cut.
fn clip(s: &str, max: usize) -> (String, bool) {
    if s.len() <= max { return (s.to_string(), false); }
    let mut at = max;
    while !s.is_char_boundary(at) { at -= 1; }
    (s[..at].to_string(), true)
}

/// One row as a line of comma separated values: a value with a comma, a quote or a line break is put in quotes, its
/// quotes doubled.
pub fn csv_line(cells: &[String]) -> String {
    cells.iter().map(|c| if c.contains([',', '"', '\n', '\r']) { format!("\"{}\"", c.replace('"', "\"\"")) } else { c.clone() }).collect::<Vec<_>>().join(",")
}

#[cfg(test)]
mod tests {
    use super::*;

    /// A root of its own for each test, removed after.
    struct Root(PathBuf);
    impl Root {
        fn new(label: &str) -> Root {
            static N: AtomicU64 = AtomicU64::new(0);
            let p = std::env::temp_dir().join(format!("companion-docread-test-{label}-{}-{}", std::process::id(), N.fetch_add(1, Ordering::SeqCst)));
            let _ = std::fs::remove_dir_all(&p);
            Root(p)
        }
        /// What is left in the root: every read removes its own folder, so nothing.
        fn left(&self) -> Vec<String> {
            std::fs::read_dir(&self.0).map(|d| d.flatten().map(|e| e.file_name().to_string_lossy().into_owned()).collect()).unwrap_or_default()
        }
    }
    impl Drop for Root { fn drop(&mut self) { let _ = std::fs::remove_dir_all(&self.0); } }

    /// A small real PDF with one line of text, in Helvetica (every Mac has it).
    fn pdf_with(text: &str) -> Vec<u8> {
        let stream = if text.is_empty() { String::new() } else { format!("BT /F1 12 Tf 20 100 Td ({text}) Tj ET") };
        let objs = [
            "<< /Type /Catalog /Pages 2 0 R >>".to_string(),
            "<< /Type /Pages /Kids [3 0 R] /Count 1 >>".to_string(),
            "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 400 200] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>".to_string(),
            format!("<< /Length {} >>\nstream\n{stream}\nendstream", stream.len()),
            "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>".to_string(),
        ];
        let mut out = b"%PDF-1.4\n".to_vec();
        let mut offs = vec![];
        for (i, o) in objs.iter().enumerate() { offs.push(out.len()); out.extend(format!("{} 0 obj\n{o}\nendobj\n", i + 1).bytes()); }
        let x = out.len();
        out.extend(format!("xref\n0 {}\n0000000000 65535 f \n", objs.len() + 1).bytes());
        for o in offs { out.extend(format!("{o:010} 00000 n \n").bytes()); }
        out.extend(format!("trailer\n<< /Size {} /Root 1 0 R >>\nstartxref\n{x}\n%%EOF\n", objs.len() + 1).bytes());
        out
    }

    /// A Word file (or rich text), made by textutil itself from plain text, in a folder of the test's own.
    fn word_with(root: &Root, text: &str, to: &str) -> Vec<u8> {
        let d = root.0.with_extension("make");
        std::fs::create_dir_all(&d).unwrap();
        let (src, out) = (d.join("src.txt"), d.join(format!("made.{to}")));
        std::fs::write(&src, text).unwrap();
        assert!(Command::new(TEXTUTIL).args(["-convert", to, "-output"]).arg(&out).arg(&src).status().unwrap().success());
        let b = std::fs::read(&out).unwrap();
        let _ = std::fs::remove_dir_all(&d);
        b
    }

    const WORKBOOK: &str = r#"<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="Sales &amp; costs" sheetId="1" r:id="rId1"/><sheet name="Notes" sheetId="2" r:id="rId2"/></sheets></workbook>"#;
    const RELS: &str = r#"<?xml version="1.0" encoding="UTF-8"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="/xl/worksheets/sheet2.xml"/><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId3" Type="x" Target="styles.xml"/></Relationships>"#;
    const SHARED: &str = r#"<sst xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" count="4" uniqueCount="4"><si><t>Item</t></si><si><t>Price</t></si><si><r><rPr><b/></rPr><t>Bread</t></r><r><t xml:space="preserve">, sliced</t></r></si><si><t>Say "hi" &lt;now&gt;</t><rPh sb="0" eb="1"><t>ignored</t></rPh></si></sst>"#;
    const SHEET1: &str = r#"<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><dimension ref="A1:D3"/><sheetData><row r="1"><c r="A1" t="s"><v>0</v></c><c r="B1" t="s"><v>1</v></c></row><row r="2"><c r="A2" t="s" s="1"><v>2</v></c><c r="B2"><v>4.5</v></c><c r="D2" t="b"><v>1</v></c></row><row r="3"/><row r="4"><c r="A4" t="inlineStr"><is><t>Total</t></is></c><c r="B4"><f>SUM(B2:B3)</f><v>4.5</v></c><c r="C4" t="s"><v>3</v></c></row></sheetData></worksheet>"#;
    const SHEET2: &str = r#"<worksheet><sheetData><row r="1"><c r="AA1" t="str"><v>far right</v></c></row></sheetData></worksheet>"#;

    /// A real .xlsx: the parts above, zipped by the Mac's own zip.
    fn xlsx_with(root: &Root, parts: &[(&str, &str)]) -> Vec<u8> {
        let d = root.0.with_extension("xlsx-make");
        let _ = std::fs::remove_dir_all(&d);
        for (name, body) in parts { let p = d.join(name); std::fs::create_dir_all(p.parent().unwrap()).unwrap(); std::fs::write(p, body).unwrap(); }
        let out = d.join("book.xlsx");
        let names: Vec<&str> = parts.iter().map(|p| p.0).collect();
        assert!(Command::new("/usr/bin/zip").current_dir(&d).args(["-q", "-X", "book.xlsx"]).args(&names).status().unwrap().success());
        let b = std::fs::read(&out).unwrap();
        let _ = std::fs::remove_dir_all(&d);
        b
    }
    fn full_book() -> Vec<(&'static str, &'static str)> {
        vec![("[Content_Types].xml", "<Types/>"), ("xl/workbook.xml", WORKBOOK), ("xl/_rels/workbook.xml.rels", RELS), ("xl/sharedStrings.xml", SHARED), ("xl/worksheets/sheet1.xml", SHEET1), ("xl/worksheets/sheet2.xml", SHEET2)]
    }

    #[test]
    fn which_documents_are_read_by_their_ending() {
        for (n, d) in [("report.pdf", Doc::Pdf), ("Plan.PDF", Doc::Pdf), ("letter.docx", Doc::Word), ("old.DOC", Doc::Word), ("notes.rtf", Doc::Word), ("essay.odt", Doc::Word), ("budget.xlsx", Doc::Sheet), ("Q3.XLSX", Doc::Sheet)] {
            assert_eq!(doc_of(n), Some(d), "{n}");
        }
        for n in ["notes.txt", "a.md", "data.csv", "old.xls", "doc.pages", "sheet.numbers", "slides.pptx", "pdf", "report", "a.pdf.zip", ""] { assert_eq!(doc_of(n), None, "{n}"); }
    }

    #[test]
    fn settings_and_key_files_are_refused_here_too_and_nothing_is_written() {
        // The same names secretfiles.ts refuses, for the endings that can reach here.
        for n in ["secrets.pdf", "secret.docx", "credentials.xlsx", "Credentials.DOCX", ".env.pdf", "prod.env", "x/.env.local.pdf"] { assert!(secret_name(n), "{n}"); }
        for n in ["secret plans.pdf", "my secrets.docx", "credentials-2024.xlsx", "report.pdf", "secrets.backup.pdf"] { assert!(!secret_name(n), "{n}"); }
        let root = Root::new("secret");
        assert_eq!(read(&root.0, "credentials.xlsx", b"PK"), Err(Refuse::Kind));
        assert!(!root.0.exists(), "refused before any folder is made");
    }

    #[test]
    fn a_pdf_gives_its_text_and_its_private_folder_is_gone_after() {
        let root = Root::new("pdf");
        let t = read(&root.0, "Invoice March.pdf", &pdf_with("Invoice total 42 dollars")).unwrap();
        assert!(t.text.contains("Invoice total 42 dollars"), "{:?}", t.text);
        assert!(!t.cut);
        assert!(root.0.is_dir(), "the root stays, empty");
        assert_eq!(root.left(), Vec::<String>::new());
    }

    #[test]
    fn a_pdf_with_no_text_a_locked_pdf_and_a_broken_one_are_each_refused_with_their_reason() {
        let root = Root::new("pdfbad");
        assert_eq!(read(&root.0, "scan.pdf", &pdf_with("")), Err(Refuse::NoText));
        assert_eq!(read(&root.0, "broken.pdf", b"%PDF-1.4 not really"), Err(Refuse::Unreadable));
        // A PDF with a password, made by PDFKit itself in the test's own folder.
        let d = root.0.with_extension("lock");
        std::fs::create_dir_all(&d).unwrap();
        let (open, locked) = (d.join("open.pdf"), d.join("locked.pdf"));
        std::fs::write(&open, pdf_with("Top secret plan")).unwrap();
        let script = "ObjC.import('PDFKit'); function run(a) { var d = $.PDFDocument.alloc.initWithURL($.NSURL.fileURLWithPath(a[0])); var o = $.NSMutableDictionary.alloc.init; o.setObjectForKey($('pw1234'), $.PDFDocumentUserPasswordOption); o.setObjectForKey($('owner1234'), $.PDFDocumentOwnerPasswordOption); if (!d.writeToFileWithOptions(a[1], o)) throw new Error('write'); return ''; }";
        assert!(Command::new(OSASCRIPT).args(["-l", "JavaScript", "-e", script, "--"]).arg(&open).arg(&locked).status().unwrap().success());
        let bytes = std::fs::read(&locked).unwrap();
        let _ = std::fs::remove_dir_all(&d);
        assert_eq!(read(&root.0, "locked.pdf", &bytes), Err(Refuse::Locked));
        assert_eq!(root.left(), Vec::<String>::new(), "removed after a refusal too");
    }

    #[test]
    fn word_rich_text_and_opendocument_files_give_their_text() {
        let root = Root::new("word");
        for to in ["docx", "doc", "rtf", "odt"] {
            let b = word_with(&root, "Dear team,\nThe launch is on Friday. Café opens at 9.\n", to);
            let t = read(&root.0, &format!("letter.{to}"), &b).unwrap();
            assert!(t.text.contains("The launch is on Friday. Café opens at 9."), "{to}: {:?}", t.text);
        }
        assert_eq!(read(&root.0, "broken.docx", b"PK\x03\x04 not a document"), Err(Refuse::Unreadable));
        assert_eq!(root.left(), Vec::<String>::new());
    }

    #[test]
    fn an_excel_sheet_gives_each_sheet_by_name_as_comma_separated_lines() {
        let root = Root::new("xlsx");
        let t = read(&root.0, "budget.xlsx", &xlsx_with(&root, &full_book())).unwrap();
        let want = "Sheet: Sales & costs\nItem,Price\n\"Bread, sliced\",4.5,,TRUE\nTotal,4.5,\"Say \"\"hi\"\" <now>\"\n\nSheet: Notes\n,,,,,,,,,,,,,,,,,,,,,,,,,,far right\n";
        assert_eq!(t.text, want);
        assert!(!t.cut);
        assert_eq!(root.left(), Vec::<String>::new());
    }

    #[test]
    fn an_excel_file_that_is_not_one_or_has_no_workbook_or_a_password_is_refused() {
        let root = Root::new("xlsxbad");
        assert_eq!(read(&root.0, "a.xlsx", b"not a zip at all"), Err(Refuse::Unreadable));
        assert_eq!(read(&root.0, "b.xlsx", &xlsx_with(&root, &[("readme.txt", "hello")])), Err(Refuse::Unreadable));
        // A workbook with sheets but no cells has no text.
        let empty = xlsx_with(&root, &[("xl/workbook.xml", WORKBOOK), ("xl/_rels/workbook.xml.rels", RELS), ("xl/worksheets/sheet1.xml", "<worksheet><sheetData/></worksheet>"), ("xl/worksheets/sheet2.xml", "<worksheet><sheetData/></worksheet>")]);
        let t = read(&root.0, "c.xlsx", &empty).unwrap();
        assert_eq!(t.text, "Sheet: Sales & costs\n\nSheet: Notes\n", "the sheet names are text; the page refuses only a document with none");
        assert_eq!(root.left(), Vec::<String>::new());
    }

    #[test]
    fn too_big_or_empty_is_refused_before_anything_is_written() {
        let root = Root::new("big");
        assert_eq!(read(&root.0, "huge.pdf", &vec![b'%'; MAX_INPUT + 1]), Err(Refuse::TooBig));
        assert_eq!(read(&root.0, "none.pdf", b""), Err(Refuse::NoText));
        assert_eq!(read(&root.0, "notes.md", b"hello"), Err(Refuse::Kind));
        assert!(!root.0.exists());
    }

    #[test]
    fn the_private_folder_is_owner_only_never_named_after_the_file_and_removed_even_when_dropped_early() {
        use std::os::unix::fs::PermissionsExt;
        let root = Root::new("work");
        let w = Work::new(&root.0).unwrap();
        assert_eq!(std::fs::metadata(&w.dir).unwrap().permissions().mode() & 0o777, 0o700);
        assert_eq!(std::fs::metadata(&root.0).unwrap().permissions().mode() & 0o777, 0o700);
        let p = w.put("in.pdf", b"x").unwrap();
        assert_eq!(std::fs::metadata(&p).unwrap().permissions().mode() & 0o777, 0o600);
        assert!(w.put("in.pdf", b"y").is_err(), "never over a file");
        let dir = w.dir.clone();
        drop(w);
        assert!(!dir.exists());
        // A root that is a link (planted by someone else) is not used.
        let link_root = Root::new("link");
        std::fs::create_dir_all(link_root.0.with_extension("real")).unwrap();
        std::os::unix::fs::symlink(link_root.0.with_extension("real"), &link_root.0).unwrap();
        assert!(Work::new(&link_root.0).is_err());
        let _ = std::fs::remove_dir_all(link_root.0.with_extension("real"));
        let _ = std::fs::remove_file(&link_root.0);
        // The source copies the file under a fixed name only.
        let src = include_str!("docread.rs");
        let body = &src[src.find("pub fn read(").unwrap()..src.find("/// A tool's way out").unwrap()];
        assert!(body.contains("format!(\"in.{}\", ext_of(doc, name))"));
    }

    #[test]
    fn a_tool_that_takes_too_long_is_ended_and_output_past_the_cap_is_cut() {
        let t0 = Instant::now();
        assert!(run("/bin/sleep", &["5".as_ref()], 100, Duration::from_millis(300)).is_none());
        assert!(t0.elapsed() < Duration::from_secs(3));
        let r = run("/usr/bin/yes", &[], 1000, Duration::from_secs(5)).unwrap();
        assert!(r.more && r.out.len() == 1000);
        let r = run("/bin/echo", &["hi".as_ref()], 1000, Duration::from_secs(5)).unwrap();
        assert!(r.ok && !r.more && r.out == b"hi\n");
    }

    #[test]
    fn text_is_cut_between_characters_and_said_to_be_cut() {
        assert_eq!(cut_text("hello".into(), 10), Text { text: "hello".into(), cut: false });
        assert_eq!(cut_text("ééé".as_bytes().to_vec(), 3), Text { text: "é".into(), cut: true });
        assert_eq!(cut_text("a😀".as_bytes().to_vec(), 4), Text { text: "a".into(), cut: true });
    }

    #[test]
    fn the_sheet_reader_parts() {
        assert_eq!(unescape("a &lt;b&gt; &amp;&amp; &quot;c&quot; &apos;d&apos; &#65;&#x42; &bogus; & x"), "a <b> && \"c\" 'd' AB &bogus; & x");
        assert_eq!(shared_strings(SHARED), vec!["Item", "Price", "Bread, sliced", "Say \"hi\" <now>"]);
        assert_eq!(sheets(WORKBOOK, RELS), vec![("Sales & costs".to_string(), "xl/worksheets/sheet1.xml".to_string()), ("Notes".to_string(), "xl/worksheets/sheet2.xml".to_string())]);
        assert_eq!(col_of("A1"), Some(0));
        assert_eq!(col_of("C7"), Some(2));
        assert_eq!(col_of("AA10"), Some(26));
        assert_eq!(col_of("12"), None);
        assert_eq!(csv_line(&["a".into(), "b,c".into(), "say \"x\"".into(), "two\nlines".into(), "".into()]), "a,\"b,c\",\"say \"\"x\"\"\",\"two\nlines\",");
        // A sheet cut short (read from its start only) gives its whole rows and stops.
        let cut = &SHEET1[..SHEET1.find("<row r=\"4\"").unwrap() + 20];
        assert_eq!(sheet_rows(cut, &shared_strings(SHARED)).len(), 2);
        // Cells far to the right are left out rather than making a row of hundreds of commas.
        assert!(sheet_rows("<sheetData><row><c r=\"ZZZ1\"><v>1</v></c></row></sheetData>", &[]).is_empty());
    }

    #[test]
    fn a_sheet_whose_link_leads_anywhere_but_a_plain_part_of_the_workbook_is_left_out() {
        for target in ["../../etc/passwd", "/etc/passwd", "worksheets/sheet 1.xml", "worksheets/*.xml", "worksheets/[a].xml", "../xl/worksheets/sheet1.xml", "worksheets/sheet1.bin"] {
            let rels = format!(r#"<Relationships><Relationship Id="rId1" Target="{target}"/></Relationships>"#);
            assert!(sheets(r#"<sheets><sheet name="A" r:id="rId1"/></sheets>"#, &rels).is_empty(), "{target}");
        }
        for ok in ["xl/worksheets/sheet1.xml", "xl/_rels/workbook.xml.rels", "xl/sharedStrings.xml"] { assert!(part_ok(ok), "{ok}"); }
        for bad in ["xl/../x.xml", "docProps/app.xml", "xl/a b.xml", "xl/a?.xml", "xl//a.xml", "xl/a.txt"] { assert!(!part_ok(bad), "{bad}"); }
    }

    // ---------- audit round 3 (shell): found by reading, each with a test that failed first ----------

    /// A zip (made by the Mac's own zip) holding one file named `name`.
    fn zip_with(root: &Root, name: &str, body: &[u8]) -> Vec<u8> {
        let d = root.0.with_extension("zip-make");
        let _ = std::fs::remove_dir_all(&d);
        std::fs::create_dir_all(&d).unwrap();
        std::fs::write(d.join(name), body).unwrap();
        assert!(Command::new("/usr/bin/zip").current_dir(&d).args(["-q", "-X", "made.zip", name]).status().unwrap().success());
        let b = std::fs::read(d.join("made.zip")).unwrap();
        let _ = std::fs::remove_dir_all(&d);
        b
    }

    #[test]
    fn an_ampersand_followed_by_accented_text_never_panics_the_sheet_reader() {
        // The look ahead for ";" cut the text at byte 12, which can fall inside a letter such as "é" (two bytes). A real
        // Excel cell "R&D ééé" is stored as "R&amp;D ééé", so the reader panicked and the whole document came back unreadable.
        assert_eq!(unescape("&amp;D ééé"), "&D ééé");
        assert_eq!(unescape("R&amp;D ééééé"), "R&D ééééé");
        assert_eq!(unescape("&ééééééé"), "&ééééééé");
        assert_eq!(unescape("& 名前 ウェブ サイト &amp; 🎂🎂🎂"), "& 名前 ウェブ サイト & 🎂🎂🎂");
        for cut in 0..40 { let s = format!("{}&amp;é{}&é", "x".repeat(cut), "é".repeat(8)); let _ = unescape(&s); }
        let root = Root::new("amp");
        let book = full_book().into_iter().map(|(n, b)| if n == "xl/sharedStrings.xml" { (n, r#"<sst><si><t>R&amp;D ééé</t></si><si><t>x</t></si><si><t>x</t></si><si><t>x</t></si></sst>"#) } else { (n, b) }).collect::<Vec<_>>();
        let t = read(&root.0, "budget.xlsx", &xlsx_with(&root, &book)).unwrap();
        assert!(t.text.contains("R&D ééé,x"), "{:?}", t.text);
    }

    #[test]
    fn a_cell_text_with_thousands_of_phonetic_guides_is_read_in_a_moment() {
        // Each <rPh> was cut out of a copy of the whole text and the text found again from its start, so a few thousand of
        // them in one string took minutes (a 32 MB part holds a million) and nothing ended it (the tool timeout covers only
        // the Mac's tools).
        let mut si = String::from("<si><t>start</t>");
        for _ in 0..150_000 { si.push_str("<rPh sb=\"0\" eb=\"1\"><t>x</t></rPh>"); }
        si.push_str("<t>end</t></si>");
        let t0 = Instant::now();
        let got = shared_strings(&format!("<sst>{si}</sst>"));
        assert_eq!(got, vec!["startend".to_string()]);
        assert!(t0.elapsed() < Duration::from_secs(2), "took {:?}", t0.elapsed());
    }

    #[test]
    fn a_big_shared_text_used_by_many_cells_cannot_fill_the_memory() {
        // Every cell that pointed at a shared string got its own copy, and the whole sheet was built before the text was cut
        // at MAX_TEXT: 300 cells at a 1 MB string was 300 MB, and a sheet of 32 MB of cells that name one big string was
        // far more than the Mac has.
        let big = "x".repeat(1_000_000);
        let cells: String = (1..=300).map(|i| format!("<c r=\"A{i}\" t=\"s\"><v>0</v></c>")).collect();
        let xml = format!("<sheetData><row r=\"1\">{cells}</row></sheetData>");
        let rows = sheet_rows(&xml, &[big]);
        let held: usize = rows.iter().flatten().map(|c| c.len()).sum();
        assert!(held <= MAX_TEXT + 16, "{held} bytes were held for text that is cut at {MAX_TEXT}");
        // And what is read still ends as a cut text, not as a whole one.
        let rows_many: String = (1..=300).map(|i| format!("<row r=\"{i}\"><c r=\"A{i}\" t=\"s\"><v>0</v></c></row>")).collect();
        let held: usize = sheet_rows(&format!("<sheetData>{rows_many}</sheetData>"), &["y".repeat(1_000_000)]).iter().flatten().map(|c| c.len()).sum();
        assert!(held <= MAX_TEXT + 16, "{held}");
        // The whole read says it was cut, and gives no more than it always did.
        let root = Root::new("bigshared");
        let sst = format!("<sst><si><t>{}</t></si></sst>", "z".repeat(1_000_000));
        let sheet = format!("<worksheet><sheetData>{rows_many}</sheetData></worksheet>");
        let book = vec![("xl/workbook.xml", WORKBOOK), ("xl/_rels/workbook.xml.rels", RELS), ("xl/sharedStrings.xml", sst.as_str()), ("xl/worksheets/sheet1.xml", sheet.as_str()), ("xl/worksheets/sheet2.xml", "<worksheet><sheetData/></worksheet>")];
        let t = read(&root.0, "big.xlsx", &xlsx_with(&root, &book)).unwrap();
        assert!(t.cut && t.text.len() <= MAX_TEXT, "{} {}", t.cut, t.text.len());
        assert_eq!(root.left(), Vec::<String>::new());
    }

    #[test]
    fn a_word_or_opendocument_file_that_says_it_opens_to_gigabytes_is_refused_before_the_tool_is_started() {
        // Only Excel files were vetted. A .docx or .odt is a zip too, and a small one can say it holds a document of
        // gigabytes (textutil would try to load it for up to the time limit).
        let root = Root::new("wordbomb");
        let mut z = zip_with(&root, "word.xml", b"<w/>");
        // The zip's list (central directory) says the file is 1.75 GB once opened.
        let cd = z.windows(4).rposition(|w| w == [0x50, 0x4b, 0x01, 0x02]).unwrap();
        z[cd + 24..cd + 28].copy_from_slice(&0x7000_0000u32.to_le_bytes());
        for n in ["bomb.docx", "bomb.odt"] { assert_eq!(read(&root.0, n, &z), Err(Refuse::TooBig), "{n}"); }
        assert_eq!(root.left(), Vec::<String>::new());
        // A fine zip, and a file that is not a zip at all, still go to textutil as before.
        let ok = word_with(&root, "Hello there", "docx");
        assert!(read(&root.0, "fine.docx", &ok).unwrap().text.contains("Hello there"));
    }

    #[test]
    fn the_folder_reads_are_made_in_is_ours_and_owner_only_even_when_it_was_there_before() {
        use std::os::unix::fs::{MetadataExt, PermissionsExt};
        let root = Root::new("oldroot");
        std::fs::create_dir_all(&root.0).unwrap();
        std::fs::set_permissions(&root.0, std::fs::Permissions::from_mode(0o777)).unwrap();   // made earlier by something that was not careful
        let w = Work::new(&root.0).expect("a folder of ours is tightened, not refused");
        assert_eq!(std::fs::metadata(&root.0).unwrap().permissions().mode() & 0o777, 0o700);
        assert_eq!(std::fs::metadata(&root.0).unwrap().uid(), unsafe { libc::geteuid() });
        drop(w);
    }

    #[test]
    fn what_the_page_is_given() {
        assert_eq!(reply(Ok(Text { text: "hi".into(), cut: true })), json!({ "text": "hi", "cut": true }));
        for (e, w) in [(Refuse::Kind, "kind"), (Refuse::TooBig, "tooBig"), (Refuse::Locked, "locked"), (Refuse::NoText, "noText"), (Refuse::Unreadable, "unreadable")] {
            assert_eq!(reply(Err(e)), json!({ "error": w }));
        }
    }

    #[test]
    fn nothing_about_a_document_is_logged_and_only_home_may_ask() {
        let main = include_str!("main.rs");
        let at = main.find("fn read_document(").expect("the command");
        let body = &main[at..at + main[at..].find("\n}\n").unwrap()];
        assert!(!body.contains("log("), "no line about a document is logged: {body}");
        assert!(body.contains("window.label() != \"card\""), "only Home's page may ask");
        assert!(body.contains("docread::read(&docread::read_root()"));
        let src = include_str!("docread.rs");
        let code = &src[..src.find("#[cfg(test)]").unwrap()];
        for no in ["log(", "println!", "eprintln!", "dbg!"] { assert!(!code.contains(no), "{no}"); }
        // A read left over from a Companion ended mid read is removed at launch, with convert's.
        assert!(main.contains("docread::sweep(&docread::read_root())"));
    }
}
