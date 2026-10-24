// The checks on protocol/names.json. This file is included by build.rs (so a bad file stops the build, in plain words,
// before any name reaches the compiler) and by names.rs (whose tests run the same function). It has no `use` of its own
// beyond serde_json, which both have. Nothing here is a name: it only says what a names file may hold.

/// Why `text` cannot be the names file, or Ok. Everything `names::Names` needs at run time is checked here, so a file that
/// passes cannot panic when a name is first asked for.
pub fn check(text: &str) -> Result<(), String> {
    let v: serde_json::Value = serde_json::from_str(text).map_err(|e| format!("it is not JSON ({e})"))?;
    let o = v.as_object().ok_or("it is not an object")?;
    const KEYS: [&str; 9] = ["version", "about", "product", "productPossessive", "character", "characterPossessive", "practiceCopyBase", "earlierPracticeCopyBases", "newFolderParent"];
    for k in KEYS { if !o.contains_key(k) { return Err(format!("{k} is missing")); } }
    if let Some(k) = o.keys().find(|k| !KEYS.contains(&k.as_str())) { return Err(format!("{k} is not a key the shell knows (names.rs refuses unknown keys)")); }
    if !o["version"].as_u64().is_some_and(|n| n <= u64::from(u32::MAX)) { return Err("version must be a whole number".into()); }
    if !o["about"].is_string() { return Err("about must be text".into()); }
    let text_of = |k: &str| o[k].as_str().ok_or_else(|| format!("{k} must be text"));

    // Names shown in sentences. They go into concat!/format! strings and Info.plist words: one plain line, nothing that is
    // invisible or breaks a line, no braces (a format string would not build). Quotes, percent signs and backslashes are
    // only text to env!() and concat!(), so they are fine.
    fn invisible(c: char) -> bool {
        c.is_control() || matches!(c, '\u{00ad}' | '\u{061c}' | '\u{180e}' | '\u{200b}'..='\u{200f}' | '\u{2028}'..='\u{202e}' | '\u{2060}'..='\u{206f}' | '\u{feff}' | '\u{fff9}'..='\u{fffb}' | '\u{e0000}'..='\u{e007f}')
    }
    let line = |k: &str, s: &str| -> Result<(), String> {
        if s.is_empty() || s.trim() != s { return Err(format!("{k} must be a name with no space at either end")); }
        if s.chars().any(|c| invisible(c) || c == '{' || c == '}') { return Err(format!("{k} must be one plain line (no line break, invisible character or brace)")); }
        if s.chars().count() > 40 { return Err(format!("{k} is longer than 40 characters")); }
        Ok(())
    };
    for k in ["product", "productPossessive", "character", "characterPossessive"] { line(k, text_of(k)?)?; }

    // Names that are also folder names under the home folder (and are matched against folder names): the same, and also
    // never a path, a hidden name or a name the Mac does not allow.
    let folder = |k: &str, s: &str| -> Result<(), String> {
        line(k, s)?;
        if s.starts_with('.') || s.contains(['/', '\\', ':']) || s.len() > 60 { return Err(format!("{k} is used as a folder name: no slash, backslash or colon, not hidden, at most 60 bytes")); }
        Ok(())
    };
    folder("practiceCopyBase", text_of("practiceCopyBase")?)?;
    folder("newFolderParent", text_of("newFolderParent")?)?;
    let earlier = o["earlierPracticeCopyBases"].as_array().ok_or("earlierPracticeCopyBases must be a list of text")?;
    for e in earlier { folder("earlierPracticeCopyBases", e.as_str().ok_or("earlierPracticeCopyBases must be a list of text")?)?; }
    Ok(())
}
