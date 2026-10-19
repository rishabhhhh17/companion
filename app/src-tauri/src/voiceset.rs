//! Voice settings (M11 wave 4, item 2): which of the Mac's voices speaks and how fast, which microphone listens and what
//! happens when it goes away, which language is spoken, and whether the Mac's sound is on. Kept on this Mac in
//! `voice.json` in Companion's folder (delete everything removes it with the other settings). The rules are plain code so
//! they can be tested with no microphone, no speaker and no sound: the Mac parts are in voice_mac.rs and speak.rs.
use serde_json::{json, Value};

/// The speeds Settings offers, as a multiple of the Mac's normal speaking speed.
pub const SPEEDS: [f64; 5] = [0.5, 0.75, 1.0, 1.25, 1.5];
/// "auto" lets the speech model tell which language it hears; the others are the speech model's own language codes.
pub const LANGUAGES: &[&str] = &["auto", "en", "hi", "es", "fr", "de", "pt", "it", "nl", "ja", "zh", "ko", "ar", "ru", "tr", "pl", "id", "vi", "uk", "bn", "ta", "ur"];
const MAX_ID: usize = 300;
const MAX_NAME: usize = 120;

/// A voice or a microphone the person picked, kept with its name (and, for a voice, its language) so Companion can say
/// which one went away and pick a near one instead.
#[derive(Clone, Debug, PartialEq)]
pub struct Named { pub id: String, pub name: String, pub lang: String }

/// What is kept in voice.json. None means the Mac's own default (voice or microphone).
#[derive(Clone, Debug, PartialEq)]
pub struct Saved { pub voice: Option<Named>, pub speed: f64, pub mic: Option<Named>, pub language: String }
impl Default for Saved { fn default() -> Self { Saved { voice: None, speed: 1.0, mic: None, language: "auto".into() } } }

fn clean(v: &Value, max: usize) -> Option<String> {
    let s = v.as_str()?.trim();
    if s.is_empty() || s.chars().any(|c| c.is_control()) { return None; }
    if s.chars().count() > max { return None; }
    Some(s.to_string())
}
fn named_from(v: &Value, with_lang: bool) -> Option<Named> {
    let id = clean(v.get("id")?, MAX_ID)?;
    // A name is only for words; one too long is cut, never trusted to fit.
    let name: String = v.get("name").and_then(Value::as_str).unwrap_or("").chars().filter(|c| !c.is_control()).take(MAX_NAME).collect();
    let lang = if with_lang { v.get("lang").and_then(|l| clean(l, 20)).unwrap_or_default() } else { String::new() };
    Some(Named { id, name: name.trim().to_string(), lang })
}

/// Reads voice.json. Anything missing, damaged or odd gives the Mac's own choice for that part, never an error.
pub fn parse(text: Option<&str>) -> Saved {
    let v: Value = text.and_then(|t| serde_json::from_str(t).ok()).unwrap_or(Value::Null);
    if !v.is_object() { return Saved::default(); }
    let speed = v.get("speed").and_then(Value::as_f64).map(snap_speed).unwrap_or(1.0);
    let language = v.get("language").and_then(Value::as_str).filter(|l| LANGUAGES.contains(l)).unwrap_or("auto").to_string();
    Saved { voice: v.get("voice").and_then(|x| named_from(x, true)), speed, mic: v.get("mic").and_then(|x| named_from(x, false)), language }
}
pub fn to_json(s: &Saved) -> Value {
    let n = |x: &Option<Named>, with_lang: bool| x.as_ref().map(|n| if with_lang { json!({ "id": n.id, "name": n.name, "lang": n.lang }) } else { json!({ "id": n.id, "name": n.name }) }).unwrap_or(Value::Null);
    json!({ "voice": n(&s.voice, true), "speed": s.speed, "mic": n(&s.mic, false), "language": s.language })
}
/// The nearest of the offered speeds. Nonsense is normal speed.
pub fn snap_speed(x: f64) -> f64 {
    if x.is_nan() { return 1.0; }
    let x = x.clamp(SPEEDS[0], SPEEDS[SPEEDS.len() - 1]);
    let mut best = SPEEDS[0];
    for s in SPEEDS { if (s - x).abs() < (best - x).abs() { best = s; } }
    best
}
/// The speaking rate macOS takes (AVSpeechUtterance's rate, between its minimum and maximum): normal speed is the Mac's
/// own default rate, half speed is halfway from it down to the minimum, one and a half times is halfway up to the maximum.
pub fn rate_for(speed: f64, min: f32, default: f32, max: f32) -> f32 {
    let s = snap_speed(speed) as f32;
    let r = if s <= 1.0 { default - (1.0 - s) * (default - min) } else { default + (s - 1.0) * (max - default) };
    r.clamp(min.min(max), max.max(min))
}
/// The language code to give the speech model, or None to let it tell which language it hears.
pub fn language(saved: &str) -> Option<&'static str> { LANGUAGES.iter().copied().find(|l| *l == saved && *l != "auto") }

fn base(lang: &str) -> &str { lang.split(['-', '_']).next().unwrap_or(lang) }
/// Best first: higher quality, then by name, so the same Mac always gives the same answer.
fn better(a: &VoiceInfo, b: &VoiceInfo) -> std::cmp::Ordering { b.quality.cmp(&a.quality).then_with(|| a.name.cmp(&b.name)).then_with(|| a.id.cmp(&b.id)) }

// ---------- voices ----------

/// One of the Mac's voices (AVSpeechSynthesisVoice): quality 1 is the default, 2 enhanced, 3 premium.
#[derive(Clone, Debug, PartialEq)]
pub struct VoiceInfo { pub id: String, pub name: String, pub lang: String, pub quality: i64, pub novelty: bool }

/// The voice to speak with: None is the Mac's own default voice. `missing` names the picked voice when it is gone.
#[derive(Clone, Debug, PartialEq)]
pub struct VoiceUse { pub id: Option<String>, pub missing: Option<String> }

pub fn pick_voice(saved: Option<&Named>, voices: &[VoiceInfo]) -> VoiceUse {
    let Some(want) = saved else { return VoiceUse { id: None, missing: None } };
    if voices.iter().any(|v| v.id == want.id) { return VoiceUse { id: Some(want.id.clone()), missing: None }; }
    let usable = || voices.iter().filter(|v| !v.novelty);
    let exact = usable().filter(|v| !want.lang.is_empty() && v.lang == want.lang).min_by(|a, b| better(a, b));
    let cousin = || usable().filter(|v| !want.lang.is_empty() && base(&v.lang) == base(&want.lang)).min_by(|a, b| better(a, b));
    VoiceUse { id: exact.or_else(cousin).map(|v| v.id.clone()), missing: Some(want.name.clone()) }
}
/// The voices Settings lists: no novelty voices (Bells, Bubbles...), the Mac's own language first, then the same language
/// from other places, then the rest by language; best first within each.
pub fn listable(voices: &[VoiceInfo], mac_lang: &str) -> Vec<VoiceInfo> {
    let rank = |v: &VoiceInfo| if v.lang == mac_lang { 0 } else if base(&v.lang) == base(mac_lang) { 1 } else { 2 };
    let mut out: Vec<VoiceInfo> = voices.iter().filter(|v| !v.novelty).cloned().collect();
    out.sort_by(|a, b| rank(a).cmp(&rank(b)).then_with(|| if rank(a) == 2 { a.lang.cmp(&b.lang) } else { std::cmp::Ordering::Equal }).then_with(|| better(a, b)));
    out
}

// ---------- microphones ----------

#[derive(Clone, Debug, PartialEq)]
pub struct Input { pub id: String, pub name: String }
/// Which input to open (an index into the list; None when there is no microphone at all), and the picked one's name when
/// it is not connected now.
#[derive(Clone, Debug, PartialEq)]
pub struct MicUse { pub index: Option<usize>, pub missing: Option<String> }

/// The microphones that cannot hear right now: the Mac's own while its lid is closed (it is cut off in hardware, yet it can
/// stay listed and stay the Mac's default). `builtin`: Core Audio's ids of the Mac's own microphones, matched against each
/// input's id after the host's name ("coreaudio:<id>"), never against a name. Empty with the lid open, or on a Mac with no
/// microphone of its own.
pub fn unheard(inputs: &[Input], builtin: &[String], lid_closed: bool) -> Vec<String> {
    if !lid_closed { return Vec::new(); }
    inputs.iter().filter(|x| x.id.split_once(':').is_some_and(|(_, uid)| builtin.iter().any(|b| b == uid))).map(|x| x.id.clone()).collect()
}
/// Every microphone listed cannot hear right now (the lid is closed and only the Mac's own is there): nothing to listen with.
pub fn only_unheard(inputs: &[Input], unheard: &[String]) -> bool { !inputs.is_empty() && inputs.iter().all(|x| unheard.contains(&x.id)) }

/// `unheard`: microphones that cannot hear now (`unheard()`), passed over while any other is listed. The picked one that
/// cannot hear is not called missing: it is connected.
pub fn pick_mic(saved: Option<&Named>, inputs: &[Input], default_id: Option<&str>, unheard: &[String]) -> MicUse {
    let hears = |i: &usize| !unheard.contains(&inputs[*i].id);
    let saved_at = saved.and_then(|want| inputs.iter().position(|x| x.id == want.id));
    if let Some(i) = saved_at.filter(hears) { return MicUse { index: Some(i), missing: None }; }
    let missing = if saved_at.is_some() { None } else { saved.map(|s| s.name.clone()) };
    let default = default_id.and_then(|d| inputs.iter().position(|x| x.id == d));
    if let Some(i) = default.filter(hears).or_else(|| (0..inputs.len()).find(|i| hears(i))) { return MicUse { index: Some(i), missing }; }
    // Nothing else can hear: the choice as before (the worker says why before it listens).
    let index = saved_at.or(default).or(if inputs.is_empty() { None } else { Some(0) });
    MicUse { index, missing }
}
/// The microphone in use went away while the keys were held: the picked one if it is still there and is not the lost one,
/// else the Mac's default, else any other. Never the lost one again (the list may still name it for a moment), and never one
/// that cannot hear now (`unheard`).
pub fn after_loss(saved: Option<&Named>, inputs: &[Input], default_id: Option<&str>, lost_id: &str, unheard: &[String]) -> Option<usize> {
    let ok = |i: usize| inputs[i].id != lost_id && !unheard.contains(&inputs[i].id);
    if let Some(i) = saved.and_then(|s| inputs.iter().position(|x| x.id == s.id)).filter(|i| ok(*i)) { return Some(i); }
    if let Some(i) = default_id.and_then(|d| inputs.iter().position(|x| x.id == d)).filter(|i| ok(*i)) { return Some(i); }
    (0..inputs.len()).find(|i| ok(*i))
}

/// What to do when the open microphone reports a problem while the keys are held (cpal 0.18's error kinds, by name).
/// Gone (`DeviceNotAvailable`, cpal pauses the stream): another microphone. A changed rate (`StreamInvalidated`, as a
/// Bluetooth headset does when its microphone starts, cpal pauses it too): the same one again. Anything else, including
/// `DeviceChanged` (rerouted, still running) and an overload, keeps listening.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum OnError { OpenAnother, OpenSameAgain, Ignore }
pub fn on_stream_error(kind: &str) -> OnError {
    match kind { "DeviceNotAvailable" => OnError::OpenAnother, "StreamInvalidated" => OnError::OpenSameAgain, _ => OnError::Ignore }
}
pub const MAX_REOPENS: u32 = 4;
/// The microphone reports problems one by one; a new one replaces the one waiting only when it asks for more.
pub fn replaces(waiting: Option<&str>, new: &str) -> bool {
    let rank = |k: &str| match on_stream_error(k) { OnError::OpenAnother => 2, OnError::OpenSameAgain => 1, OnError::Ignore => 0 };
    waiting.is_none_or(|w| rank(new) > rank(w))
}

/// The problems an open microphone reports, from its audio thread, for the recorder to look at between its waits. The most
/// serious one waiting is kept (`replaces`), and a look takes it in the same step, so one reported meanwhile is never
/// erased: a microphone going away is reported only once.
#[derive(Debug, Default)]
pub struct Trouble(std::sync::Mutex<Option<String>>);
impl Trouble {
    pub fn report(&self, kind: &str) {
        let mut t = self.0.lock().unwrap_or_else(|e| e.into_inner());
        if replaces(t.as_deref(), kind) { *t = Some(kind.to_string()); }
    }
    pub fn take(&self) -> Option<String> { self.0.lock().unwrap_or_else(|e| e.into_inner()).take() }
}

/// What came of opening another microphone while the keys are held.
#[derive(Debug, PartialEq)]
pub enum Reopen<T> { Opened(usize, T), NoneOpened, Stopped }
/// Tries the candidates in order and keeps the first that opens. A stop (the keys let go, Stop everything) is looked for
/// before each try and after one that opened: then nothing more is tried, and a microphone that opened meanwhile is let go
/// at once, with nothing it heard kept.
pub fn reopen_first<T>(candidates: impl IntoIterator<Item = usize>, mut open: impl FnMut(usize) -> Option<T>, mut stopped: impl FnMut() -> bool) -> Reopen<T> {
    for i in candidates {
        if stopped() { return Reopen::Stopped; }
        if let Some(o) = open(i) {
            if stopped() { drop(o); return Reopen::Stopped; }
            return Reopen::Opened(i, o);
        }
    }
    Reopen::NoneOpened
}
/// Opening a microphone when the keys go down: the one pick_mic gives, then, when that one is listed but will not open
/// (headphones just switched off can stay in the list for a moment), the one after_loss gives in its place, looking for a
/// stop the same way a reopen does. The second part names the picked microphone whenever another one listens instead,
/// so the one plain line is said (MicNote).
pub fn open_at_start<T>(saved: Option<&Named>, inputs: &[Input], default_id: Option<&str>, unheard: &[String], open: impl FnMut(usize) -> Option<T>, stopped: impl FnMut() -> bool) -> (Reopen<T>, Option<String>) {
    let Some(first) = pick_mic(saved, inputs, default_id, unheard).index else { return (Reopen::NoneOpened, None) };
    let instead = after_loss(saved, inputs, default_id, &inputs[first].id, unheard);
    let r = reopen_first([Some(first), instead].into_iter().flatten(), open, stopped);
    // The picked one is named only when it is not connected or would not open, never when it is connected but cannot hear.
    let missing = match &r { Reopen::Opened(i, _) => saved.filter(|s| s.id != inputs[*i].id && !unheard.contains(&s.id)).map(|s| s.name.clone()), _ => None };
    (r, missing)
}
/// A reading from Core Audio (the microphones, whether the sound is on) for a command on the main thread, which every panel
/// shares: Core Audio can stall just after the Mac wakes or while Bluetooth headphones connect, and a wait there freezes the
/// island, Home, the character and the rings (a beachball). `read` runs on a helper thread and is waited for at most
/// `limit`; a slow one gives the last answer (or `fallback` when none is known yet), and its late answer is kept for next
/// time. While one read is still stuck, no second one is started.
pub struct Recent<T> { last: std::sync::Mutex<Option<T>>, busy: std::sync::atomic::AtomicBool }
impl<T: Clone + Send + 'static> Recent<T> {
    pub const fn new() -> Self { Recent { last: std::sync::Mutex::new(None), busy: std::sync::atomic::AtomicBool::new(false) } }
    pub fn last(&self) -> Option<T> { self.last.lock().unwrap_or_else(|e| e.into_inner()).clone() }
    pub fn read(&'static self, limit: std::time::Duration, fallback: impl FnOnce() -> T, read: impl FnOnce() -> T + Send + 'static) -> T {
        use std::sync::atomic::Ordering::SeqCst;
        if self.busy.swap(true, SeqCst) { return self.last().unwrap_or_else(fallback); }
        let (tx, rx) = std::sync::mpsc::channel::<T>();
        std::thread::spawn(move || {
            let v = read();
            *self.last.lock().unwrap_or_else(|e| e.into_inner()) = Some(v.clone());
            self.busy.store(false, SeqCst);
            let _ = tx.send(v);
        });
        rx.recv_timeout(limit).ok().or_else(|| self.last()).unwrap_or_else(fallback)
    }
}

/// Whether the recorder was told to stop, or went away, without waiting.
pub fn stop_waiting(rx: &std::sync::mpsc::Receiver<()>) -> bool { !matches!(rx.try_recv(), Err(std::sync::mpsc::TryRecvError::Empty)) }
/// A device's name for Settings and the card: no control characters, at most MAX_NAME characters.
pub fn device_name(raw: &str) -> String { raw.chars().filter(|c| !c.is_control()).take(MAX_NAME).collect::<String>().split_whitespace().collect::<Vec<_>>().join(" ") }

/// The one plain line about a picked microphone that is not connected: said once each time it goes away.
#[derive(Default, Debug)]
pub struct MicNote { told: Option<String> }
impl MicNote {
    pub const fn new() -> Self { MicNote { told: None } }
    /// `missing`: the picked microphone's name when it is not connected now, None when it is (or none was picked).
    pub fn tell(&mut self, missing: Option<&str>) -> bool {
        match missing {
            None => { self.told = None; false }
            Some(m) if self.told.as_deref() == Some(m) => false,
            Some(m) => { self.told = Some(m.to_string()); true }
        }
    }
}

// ---------- the Mac's sound ----------

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Sound { On, Muted, Zero, NoOutput }
/// The default output device (0 when there is none), whether it is muted (None when it cannot say), and its volume on
/// each channel it reports (empty when it has no volume control).
pub fn sound(device: u32, muted: Option<bool>, volumes: &[f32]) -> Sound {
    if device == 0 { return Sound::NoOutput; }
    if muted == Some(true) { return Sound::Muted; }
    let known: Vec<f32> = volumes.iter().copied().filter(|v| v.is_finite()).collect();
    if !known.is_empty() && known.iter().all(|v| *v <= 0.001) { return Sound::Zero; }
    Sound::On
}
pub fn sound_word(s: Sound) -> &'static str { match s { Sound::On => "on", Sound::Muted => "muted", Sound::Zero => "zero", Sound::NoOutput => "none" } }
/// Said once each time the sound goes off (muted, at zero, no speaker), not at every line.
#[derive(Default, Debug)]
pub struct SoundNote { told: bool }
impl SoundNote {
    pub const fn new() -> Self { SoundNote { told: false } }
    pub fn tell(&mut self, s: Sound) -> bool {
        if s == Sound::On { self.told = false; return false; }
        if self.told { return false; }
        self.told = true; true
    }
}

// ---------- a change from Settings ----------

/// What Settings asks for. A voice or microphone id must be one on this Mac now, or the one already picked (so changing
/// only the speed keeps a voice that is away for now). Errors are codes the page puts in words.
pub struct Ask<'a> { pub voice: Option<&'a str>, pub speed: f64, pub mic: Option<&'a str>, pub language: &'a str }
pub fn apply(saved: &Saved, ask: &Ask, voices: &[VoiceInfo], inputs: &[Input]) -> Result<Saved, &'static str> {
    let voice = match ask.voice {
        None => None,
        Some(id) if saved.voice.as_ref().is_some_and(|v| v.id == id) => saved.voice.clone(),
        Some(id) => { let v = voices.iter().find(|v| v.id == id && !v.novelty).ok_or("unknown_voice")?; Some(Named { id: v.id.clone(), name: v.name.clone(), lang: v.lang.clone() }) }
    };
    let mic = match ask.mic {
        None => None,
        Some(id) if saved.mic.as_ref().is_some_and(|m| m.id == id) => saved.mic.clone(),
        Some(id) => { let m = inputs.iter().find(|m| m.id == id).ok_or("unknown_mic")?; Some(Named { id: m.id.clone(), name: m.name.clone(), lang: String::new() }) }
    };
    if !LANGUAGES.contains(&ask.language) { return Err("unknown_language"); }
    Ok(Saved { voice, speed: snap_speed(ask.speed), mic, language: ask.language.to_string() })
}

/// What Settings is told.
pub fn state_json(s: &Saved, voices: &[VoiceInfo], mac_lang: &str, inputs: &[Input], default_id: Option<&str>, sound: Sound) -> Value {
    let vu = pick_voice(s.voice.as_ref(), voices);
    let using = if vu.missing.is_some() { vu.id.as_ref().and_then(|id| voices.iter().find(|v| &v.id == id)).map(|v| v.name.clone()) } else { None };
    let mu = pick_mic(None, inputs, default_id, &[]);
    let mic_missing = s.mic.as_ref().filter(|m| !inputs.iter().any(|x| x.id == m.id)).map(|m| m.name.clone());
    json!({
        "voices": listable(voices, mac_lang).iter().map(|v| json!({ "id": v.id, "name": v.name, "lang": v.lang, "quality": v.quality })).collect::<Vec<_>>(),
        "macLang": mac_lang,
        "voice": s.voice.as_ref().map(|v| v.id.clone()), "voiceMissing": vu.missing, "voiceUsing": using,
        "speed": s.speed, "speeds": SPEEDS,
        "inputs": inputs.iter().map(|i| json!({ "id": i.id, "name": i.name })).collect::<Vec<_>>(),
        "defaultInput": mu.index.map(|i| inputs[i].name.clone()),
        "mic": s.mic.as_ref().map(|m| m.id.clone()), "micMissing": mic_missing,
        "language": s.language, "languages": LANGUAGES,
        "sound": sound_word(sound),
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    fn v(id: &str, name: &str, lang: &str, quality: i64) -> VoiceInfo { VoiceInfo { id: id.into(), name: name.into(), lang: lang.into(), quality, novelty: false } }
    fn named(id: &str, name: &str, lang: &str) -> Named { Named { id: id.into(), name: name.into(), lang: lang.into() } }
    fn inp(id: &str, name: &str) -> Input { Input { id: id.into(), name: name.into() } }
    fn mac_voices() -> Vec<VoiceInfo> {
        let mut bad = v("com.apple.speech.synthesis.voice.Bells", "Bells", "en-US", 1); bad.novelty = true;
        vec![v("com.apple.voice.compact.en-US.Samantha", "Samantha", "en-US", 1), v("com.apple.voice.enhanced.en-US.Ava", "Ava", "en-US", 2),
             v("com.apple.voice.compact.en-GB.Daniel", "Daniel", "en-GB", 1), v("com.apple.voice.premium.en-GB.Jamie", "Jamie", "en-GB", 3),
             v("com.apple.voice.compact.hi-IN.Lekha", "Lekha", "hi-IN", 1), v("com.apple.voice.compact.fr-FR.Thomas", "Thomas", "fr-FR", 1), bad]
    }

    #[test]
    fn nothing_saved_or_a_damaged_file_gives_the_macs_own_choices() {
        for t in [None, Some(""), Some("not json"), Some("[]"), Some("{\"speed\":\"fast\",\"voice\":5,\"mic\":[],\"language\":7}")] {
            assert_eq!(parse(t), Saved::default(), "{t:?}");
        }
        let d = Saved::default();
        assert!(d.voice.is_none() && d.mic.is_none() && d.speed == 1.0 && d.language == "auto");
    }
    #[test]
    fn what_is_saved_reads_back_the_same() {
        let s = Saved { voice: Some(named("com.apple.voice.enhanced.en-US.Ava", "Ava", "en-US")), speed: 1.25, mic: Some(named("coreaudio:AB-12", "AirPods Pro", "")), language: "hi".into() };
        assert_eq!(parse(Some(&to_json(&s).to_string())), s);
    }
    #[test]
    fn odd_values_in_the_file_are_made_safe_never_trusted() {
        let t = json!({ "voice": { "id": "", "name": "x", "lang": "en" }, "speed": 9.0, "mic": { "id": "a\u{0}b", "name": "m" }, "language": "klingon" }).to_string();
        let s = parse(Some(&t));
        assert!(s.voice.is_none(), "an empty id is no pick");
        assert!(s.mic.is_none(), "an id with a control character is no pick");
        assert_eq!(s.speed, 1.5, "snapped to the fastest offered");
        assert_eq!(s.language, "auto");
        let long = json!({ "voice": { "id": "x".repeat(5000), "name": "n", "lang": "en" } }).to_string();
        assert!(parse(Some(&long)).voice.is_none(), "an id far too long is no pick");
        let named_long = json!({ "mic": { "id": "coreaudio:1", "name": "n".repeat(5000) } }).to_string();
        assert!(parse(Some(&named_long)).mic.unwrap().name.chars().count() <= MAX_NAME);
    }
    #[test]
    fn speed_snaps_to_the_offered_steps() {
        assert_eq!(snap_speed(1.0), 1.0); assert_eq!(snap_speed(0.5), 0.5); assert_eq!(snap_speed(1.5), 1.5);
        assert_eq!(snap_speed(0.1), 0.5); assert_eq!(snap_speed(3.0), 1.5); assert_eq!(snap_speed(-1.0), 0.5);
        assert_eq!(snap_speed(1.1), 1.0); assert_eq!(snap_speed(1.2), 1.25); assert_eq!(snap_speed(0.7), 0.75);
        assert_eq!(snap_speed(f64::NAN), 1.0); assert_eq!(snap_speed(f64::INFINITY), 1.5);
    }
    #[test]
    fn normal_speed_is_the_macs_normal_rate_and_the_ends_stay_inside_its_range() {
        // macOS: minimum 0.0, default 0.5, maximum 1.0.
        assert_eq!(rate_for(1.0, 0.0, 0.5, 1.0), 0.5);
        assert!((rate_for(0.5, 0.0, 0.5, 1.0) - 0.25).abs() < 1e-6);
        assert!((rate_for(1.5, 0.0, 0.5, 1.0) - 0.75).abs() < 1e-6);
        let steps: Vec<f32> = SPEEDS.iter().map(|s| rate_for(*s, 0.0, 0.5, 1.0)).collect();
        assert!(steps.windows(2).all(|w| w[0] < w[1]), "faster is always faster: {steps:?}");
        // Other constants: normal is still their default, and nothing goes outside their range.
        assert_eq!(rate_for(1.0, 0.1, 0.4, 0.9), 0.4);
        for s in [0.0, 0.5, 1.5, 9.0, f64::NAN] { let r = rate_for(s, 0.1, 0.4, 0.9); assert!((0.1..=0.9).contains(&r), "{s} gave {r}"); }
    }
    #[test]
    fn the_language_is_automatic_unless_a_listed_one_is_picked() {
        assert_eq!(language("auto"), None); assert_eq!(language(""), None); assert_eq!(language("xx"), None); assert_eq!(language("en\u{0}"), None);
        assert_eq!(language("en"), Some("en")); assert_eq!(language("hi"), Some("hi"));
        assert!(LANGUAGES.iter().all(|l| l.len() <= 4 && l.chars().all(|c| c.is_ascii_lowercase())));
    }

    #[test]
    fn the_picked_voice_is_used_while_it_is_on_this_mac() {
        let ava = named("com.apple.voice.enhanced.en-US.Ava", "Ava", "en-US");
        assert_eq!(pick_voice(Some(&ava), &mac_voices()), VoiceUse { id: Some(ava.id.clone()), missing: None });
        assert_eq!(pick_voice(None, &mac_voices()), VoiceUse { id: None, missing: None }, "nothing picked: the Mac's own voice");
    }
    #[test]
    fn a_picked_voice_that_is_gone_is_replaced_by_the_best_one_in_its_language() {
        let gone = named("com.apple.voice.premium.en-US.Zoe", "Zoe", "en-US");
        assert_eq!(pick_voice(Some(&gone), &mac_voices()), VoiceUse { id: Some("com.apple.voice.enhanced.en-US.Ava".into()), missing: Some("Zoe".into()) });
        // No voice in that exact language: the same language from another place, best first.
        let au = named("com.apple.voice.premium.en-AU.Lee", "Lee", "en-AU");
        assert_eq!(pick_voice(Some(&au), &mac_voices()).id.as_deref(), Some("com.apple.voice.premium.en-GB.Jamie"));
        // None in that language at all: the Mac's own voice, and still said which one is gone.
        let de = named("com.apple.voice.compact.de-DE.Anna", "Anna", "de-DE");
        assert_eq!(pick_voice(Some(&de), &mac_voices()), VoiceUse { id: None, missing: Some("Anna".into()) });
    }
    #[test]
    fn a_novelty_voice_is_never_picked_for_you_or_listed() {
        let mut only_bells = vec![v("bells", "Bells", "en-US", 3)]; only_bells[0].novelty = true;
        assert_eq!(pick_voice(Some(&named("gone", "Zoe", "en-US")), &only_bells).id, None);
        assert!(listable(&mac_voices(), "en-US").iter().all(|x| !x.novelty));
    }
    #[test]
    fn the_list_puts_the_macs_language_first_then_its_cousins_then_the_rest_best_first() {
        let names: Vec<String> = listable(&mac_voices(), "en-GB").into_iter().map(|x| x.name).collect();
        assert_eq!(names, ["Jamie", "Daniel", "Ava", "Samantha", "Thomas", "Lekha"].map(String::from).to_vec());
        let names: Vec<String> = listable(&mac_voices(), "hi-IN").into_iter().map(|x| x.name).collect();
        assert_eq!(names[0], "Lekha");
    }

    #[test]
    fn no_pick_uses_the_macs_default_microphone_and_follows_it_when_it_changes() {
        let list = [inp("coreaudio:built-in", "MacBook Pro Microphone"), inp("coreaudio:airpods", "AirPods Pro")];
        assert_eq!(pick_mic(None, &list, Some("coreaudio:built-in"), &[]), MicUse { index: Some(0), missing: None });
        assert_eq!(pick_mic(None, &list, Some("coreaudio:airpods"), &[]), MicUse { index: Some(1), missing: None }, "the default changed: it follows");
        assert_eq!(pick_mic(None, &list, None, &[]), MicUse { index: Some(0), missing: None }, "no default known: the first one");
        assert_eq!(pick_mic(None, &[], None, &[]), MicUse { index: None, missing: None }, "no microphone at all");
    }
    #[test]
    fn a_picked_microphone_is_used_and_when_it_is_gone_the_default_is_used_and_named() {
        let list = [inp("coreaudio:built-in", "MacBook Pro Microphone"), inp("coreaudio:usb", "Blue Yeti")];
        let yeti = named("coreaudio:usb", "Blue Yeti", "");
        assert_eq!(pick_mic(Some(&yeti), &list, Some("coreaudio:built-in"), &[]), MicUse { index: Some(1), missing: None });
        let pods = named("coreaudio:airpods", "AirPods Pro", "");
        assert_eq!(pick_mic(Some(&pods), &list, Some("coreaudio:built-in"), &[]), MicUse { index: Some(0), missing: Some("AirPods Pro".into()) });
        assert_eq!(pick_mic(Some(&pods), &[], None, &[]), MicUse { index: None, missing: Some("AirPods Pro".into()) });
    }
    #[test]
    fn a_microphone_lost_while_talking_is_replaced_by_another_never_by_itself() {
        // Bluetooth headphones switched off mid hold: the list may still name them for a moment.
        let list = [inp("coreaudio:airpods", "AirPods Pro"), inp("coreaudio:built-in", "MacBook Pro Microphone")];
        let pods = named("coreaudio:airpods", "AirPods Pro", "");
        assert_eq!(after_loss(Some(&pods), &list, Some("coreaudio:airpods"), "coreaudio:airpods", &[]), Some(1));
        assert_eq!(after_loss(None, &list, Some("coreaudio:airpods"), "coreaudio:airpods", &[]), Some(1), "the default itself went away");
        assert_eq!(after_loss(None, &list, Some("coreaudio:built-in"), "coreaudio:airpods", &[]), Some(1), "the new default");
        assert_eq!(after_loss(None, &list[..1], Some("coreaudio:airpods"), "coreaudio:airpods", &[]), None, "nothing else to listen with");
    }
    #[test]
    fn a_microphone_that_went_away_means_another_and_a_changed_one_means_open_it_again() {
        assert_eq!(on_stream_error("DeviceNotAvailable"), OnError::OpenAnother);
        // Bluetooth headsets change their rate when their microphone starts: the same one is opened again.
        assert_eq!(on_stream_error("StreamInvalidated"), OnError::OpenSameAgain);
        // cpal 0.18: DeviceChanged means the stream was rerouted and keeps running, so reopening it would only lose words.
        for k in ["DeviceChanged", "Xrun", "DeviceBusy", "RealtimeDenied", "anything"] { assert_eq!(on_stream_error(k), OnError::Ignore, "{k}"); }
    }
    #[test]
    fn a_microphone_going_away_is_never_hidden_behind_a_smaller_problem_reported_first() {
        assert!(replaces(None, "Xrun"));
        assert!(replaces(Some("Xrun"), "DeviceNotAvailable"), "an overload, then the device went away");
        assert!(replaces(Some("StreamInvalidated"), "DeviceNotAvailable"));
        assert!(replaces(Some("Xrun"), "StreamInvalidated"));
        assert!(!replaces(Some("DeviceNotAvailable"), "Xrun"));
        assert!(!replaces(Some("DeviceNotAvailable"), "StreamInvalidated"), "gone stays gone");
        assert!(!replaces(Some("StreamInvalidated"), "StreamInvalidated"), "the first of the same kind is kept");
        assert!(!replaces(Some("StreamInvalidated"), "DeviceChanged"), "a reroute never hides a changed rate");
    }
    // Found in review, 18 Oct 2026: the recorder read the problem waiting and cleared it in a second step, so a microphone
    // that went away in between (an overload waiting, then the AirPods switched off) was erased and nothing opened another.
    #[test]
    fn looking_at_a_problem_takes_it_in_one_step_so_one_reported_meanwhile_is_kept() {
        let t = Trouble::default();
        assert_eq!(t.take(), None);
        t.report("Xrun");
        assert_eq!(t.take().as_deref(), Some("Xrun"), "the overload is looked at");
        t.report("DeviceNotAvailable");   // right after the look, before the next one
        assert_eq!(t.take().as_deref(), Some("DeviceNotAvailable"), "the loss is still there for the next look");
        assert_eq!(t.take(), None, "taken once");
        t.report("Xrun"); t.report("DeviceNotAvailable"); t.report("Xrun");
        assert_eq!(t.take().as_deref(), Some("DeviceNotAvailable"), "the most serious one waiting wins");
    }
    // Found in review, 18 Oct 2026: a reopen opened the next microphone without looking for a stop first, so after the keys
    // were let go or Stop everything was pressed, a slow Bluetooth or USB microphone could still come on, and a few
    // milliseconds of it were kept.
    struct Mic(std::rc::Rc<std::cell::Cell<bool>>);
    impl Drop for Mic { fn drop(&mut self) { self.0.set(true); } }
    #[test]
    fn a_reopen_keeps_the_first_microphone_that_opens() {
        let tried = std::cell::RefCell::new(Vec::new());
        let r = reopen_first([3, 1, 0], |i| { tried.borrow_mut().push(i); (i == 1).then_some(i * 10) }, || false);
        assert_eq!(r, Reopen::Opened(1, 10));
        assert_eq!(*tried.borrow(), [3, 1], "nothing after the one that opened");
        assert_eq!(reopen_first([2, 5], |_| None::<u8>, || false), Reopen::NoneOpened);
        assert_eq!(reopen_first(std::iter::empty(), |_| Some(1u8), || false), Reopen::NoneOpened);
    }
    #[test]
    fn a_reopen_stops_when_the_keys_are_let_go_and_never_keeps_a_microphone_opened_meanwhile() {
        // Let go before anything is tried: nothing is opened.
        let opened = std::cell::Cell::new(0);
        assert_eq!(reopen_first([0, 1], |_| { opened.set(opened.get() + 1); Some(1u8) }, || true), Reopen::Stopped);
        assert_eq!(opened.get(), 0);
        // Let go while a slow microphone was opening: it is let go at once, and nothing it heard is kept.
        let gone = std::rc::Rc::new(std::cell::Cell::new(false));
        let looks = std::cell::Cell::new(0);
        let g = gone.clone();
        let r = reopen_first([0], move |_| Some(Mic(g.clone())), || { looks.set(looks.get() + 1); looks.get() > 1 });
        assert!(matches!(r, Reopen::Stopped));
        assert!(gone.get(), "the microphone opened meanwhile was closed");
        // Let go after the first one would not open: the next is not tried.
        let tried = std::cell::RefCell::new(Vec::new());
        let looks = std::cell::Cell::new(0);
        let r = reopen_first([4, 7], |i| { tried.borrow_mut().push(i); None::<u8> }, || { looks.set(looks.get() + 1); looks.get() > 1 });
        assert_eq!(r, Reopen::Stopped);
        assert_eq!(*tried.borrow(), [4]);
    }
    // Found in review, 18 Oct 2026: when the keys went down, a picked microphone that was still listed but would not open
    // (AirPods just switched off can stay in the list for a moment) gave an error, instead of the default listening with
    // the one plain line. Only a microphone lost while the keys were held tried another.
    #[test]
    fn at_the_start_a_picked_microphone_that_is_listed_but_will_not_open_gives_way_to_the_default_and_is_named() {
        let list = [inp("coreaudio:airpods", "AirPods Pro"), inp("coreaudio:built-in", "MacBook Pro Microphone"), inp("coreaudio:usb", "Blue Yeti")];
        let pods = named("coreaudio:airpods", "AirPods Pro", "");
        let tried = std::cell::RefCell::new(Vec::new());
        let (r, missing) = open_at_start(Some(&pods), &list, Some("coreaudio:built-in"), &[], |i| { tried.borrow_mut().push(i); (i != 0).then_some(i) }, || false);
        assert_eq!(r, Reopen::Opened(1, 1), "the Mac's default listens");
        assert_eq!(missing.as_deref(), Some("AirPods Pro"), "so the one plain line names the picked one");
        assert_eq!(*tried.borrow(), [0, 1]);
        // It opens: nothing else is tried and nothing is said.
        let tried = std::cell::RefCell::new(Vec::new());
        assert_eq!(open_at_start(Some(&pods), &list, Some("coreaudio:built-in"), &[], |i| { tried.borrow_mut().push(i); Some(i) }, || false), (Reopen::Opened(0, 0), None));
        assert_eq!(*tried.borrow(), [0]);
        // Not listed at all: the default, named as before (pick_mic).
        let gone = named("coreaudio:gone", "Old Headset", "");
        assert_eq!(open_at_start(Some(&gone), &list, Some("coreaudio:built-in"), &[], Some, || false), (Reopen::Opened(1, 1), Some("Old Headset".into())));
    }
    #[test]
    fn at_the_start_the_default_that_will_not_open_gives_way_to_another_and_a_stop_or_nothing_opening_is_said() {
        let list = [inp("coreaudio:built-in", "MacBook Pro Microphone"), inp("coreaudio:usb", "Blue Yeti")];
        // Nothing picked, the default will not open: another one listens, with nothing to name.
        assert_eq!(open_at_start(None, &list, Some("coreaudio:built-in"), &[], |i| (i == 1).then_some(i), || false), (Reopen::Opened(1, 1), None));
        // Nothing opens.
        assert_eq!(open_at_start(None, &list, Some("coreaudio:built-in"), &[], |_| None::<usize>, || false).0, Reopen::NoneOpened);
        // Let go, or Stop everything, first: nothing is opened.
        let opened = std::cell::Cell::new(0);
        assert_eq!(open_at_start(Some(&named("coreaudio:usb", "Blue Yeti", "")), &list, None, &[], |i| { opened.set(opened.get() + 1); Some(i) }, || true), (Reopen::Stopped, None));
        assert_eq!(opened.get(), 0);
        // No microphone listed: nothing to open here (the recorder then asks the Mac for its default itself).
        assert_eq!(open_at_start(None, &[], None, &[], |i| Some(i), || false).0, Reopen::NoneOpened);
    }
    #[test]
    fn a_stop_is_seen_whether_it_was_sent_or_the_recorder_went_away_and_is_not_seen_otherwise() {
        let (tx, rx) = std::sync::mpsc::channel::<()>();
        assert!(!stop_waiting(&rx));
        tx.send(()).unwrap();
        assert!(stop_waiting(&rx));
        drop(tx);
        assert!(stop_waiting(&rx), "the recorder was dropped");
    }
    // Found in review, 18 Oct 2026: a device's name was read through its Display, which cpal fails when the device is going
    // away, and turning that into text panics (the recorder thread died and everything heard was lost).
    #[test]
    fn a_device_name_has_no_control_characters_and_a_sensible_length() {
        assert_eq!(device_name("AirPods Pro"), "AirPods Pro");
        assert_eq!(device_name(" Blue\u{7} Yeti\n "), "Blue Yeti");
        assert_eq!(device_name(&"m".repeat(500)).chars().count(), MAX_NAME);
        assert_eq!(device_name(""), "");
    }

    #[test]
    fn the_missing_microphone_line_is_said_once_each_time_it_goes_away() {
        let mut n = MicNote::default();
        assert!(!n.tell(None));
        assert!(n.tell(Some("AirPods Pro")));
        assert!(!n.tell(Some("AirPods Pro")), "not at every press");
        assert!(!n.tell(None), "back again: nothing to say");
        assert!(n.tell(Some("AirPods Pro")), "gone again: said again");
        assert!(n.tell(Some("Blue Yeti")), "another one gone");
    }

    #[test]
    fn the_sound_is_off_when_muted_at_zero_or_with_no_speaker() {
        assert_eq!(sound(0, None, &[]), Sound::NoOutput);
        assert_eq!(sound(42, Some(true), &[0.8]), Sound::Muted);
        assert_eq!(sound(42, Some(false), &[0.0, 0.0]), Sound::Zero);
        assert_eq!(sound(42, None, &[0.0001]), Sound::Zero);
        assert_eq!(sound(42, Some(false), &[0.0, 0.6]), Sound::On, "one channel up is sound");
        assert_eq!(sound(42, None, &[]), Sound::On, "a speaker with no volume control (HDMI, AirPlay) counts as on");
        assert_eq!(sound(42, Some(false), &[f32::NAN]), Sound::On, "a reading that makes no sense is not taken as silence");
        assert_eq!([Sound::On, Sound::Muted, Sound::Zero, Sound::NoOutput].map(sound_word), ["on", "muted", "zero", "none"]);
    }
    #[test]
    fn the_sound_is_off_line_is_said_once_until_the_sound_is_back() {
        let mut n = SoundNote::default();
        assert!(!n.tell(Sound::On));
        assert!(n.tell(Sound::Muted)); assert!(!n.tell(Sound::Muted)); assert!(!n.tell(Sound::Zero), "still off");
        assert!(!n.tell(Sound::On));
        assert!(n.tell(Sound::NoOutput));
    }

    #[test]
    fn settings_may_pick_only_what_is_on_this_mac() {
        let (voices, inputs) = (mac_voices(), vec![inp("coreaudio:built-in", "MacBook Pro Microphone")]);
        let base = Saved::default();
        let ok = apply(&base, &Ask { voice: Some("com.apple.voice.enhanced.en-US.Ava"), speed: 1.25, mic: Some("coreaudio:built-in"), language: "en" }, &voices, &inputs).unwrap();
        assert_eq!(ok, Saved { voice: Some(named("com.apple.voice.enhanced.en-US.Ava", "Ava", "en-US")), speed: 1.25, mic: Some(named("coreaudio:built-in", "MacBook Pro Microphone", "")), language: "en".into() });
        assert_eq!(apply(&base, &Ask { voice: Some("made.up"), speed: 1.0, mic: None, language: "auto" }, &voices, &inputs), Err("unknown_voice"));
        assert_eq!(apply(&base, &Ask { voice: None, speed: 1.0, mic: Some("coreaudio:nope"), language: "auto" }, &voices, &inputs), Err("unknown_mic"));
        assert_eq!(apply(&base, &Ask { voice: None, speed: 1.0, mic: None, language: "xx" }, &voices, &inputs), Err("unknown_language"));
        assert!(apply(&base, &Ask { voice: Some("com.apple.speech.synthesis.voice.Bells"), speed: 1.0, mic: None, language: "auto" }, &voices, &inputs).is_err(), "a novelty voice cannot be picked");
        let back = apply(&ok, &Ask { voice: None, speed: 9.0, mic: None, language: "auto" }, &voices, &inputs).unwrap();
        assert_eq!(back, Saved { speed: 1.5, ..Saved::default() }, "back to the Mac's own, speed snapped");
    }
    #[test]
    fn changing_only_the_speed_keeps_a_voice_and_a_microphone_that_are_away_for_now() {
        let away = Saved { voice: Some(named("gone.voice", "Zoe", "en-US")), speed: 1.0, mic: Some(named("coreaudio:airpods", "AirPods Pro", "")), language: "auto".into() };
        let s = apply(&away, &Ask { voice: Some("gone.voice"), speed: 0.75, mic: Some("coreaudio:airpods"), language: "auto" }, &mac_voices(), &[]).unwrap();
        assert_eq!(s, Saved { speed: 0.75, ..away.clone() });
    }
    #[test]
    fn settings_are_told_the_lists_the_picks_and_what_is_away() {
        let s = Saved { voice: Some(named("gone.voice", "Zoe", "en-US")), speed: 1.25, mic: Some(named("coreaudio:airpods", "AirPods Pro", "")), language: "hi".into() };
        let inputs = [inp("coreaudio:built-in", "MacBook Pro Microphone")];
        let j = state_json(&s, &mac_voices(), "en-US", &inputs, Some("coreaudio:built-in"), Sound::Muted);
        assert_eq!(j["voice"], "gone.voice"); assert_eq!(j["voiceMissing"], "Zoe"); assert_eq!(j["voiceUsing"], "Ava");
        assert_eq!(j["speed"], 1.25); assert_eq!(j["speeds"].as_array().unwrap().len(), SPEEDS.len());
        assert_eq!(j["mic"], "coreaudio:airpods"); assert_eq!(j["micMissing"], "AirPods Pro"); assert_eq!(j["defaultInput"], "MacBook Pro Microphone");
        assert_eq!(j["inputs"][0]["name"], "MacBook Pro Microphone");
        assert_eq!(j["language"], "hi"); assert_eq!(j["languages"].as_array().unwrap().len(), LANGUAGES.len());
        assert_eq!(j["sound"], "muted"); assert_eq!(j["macLang"], "en-US");
        assert_eq!(j["voices"][0]["name"], "Ava", "best in the Mac's language first");
        assert!(j["voices"].as_array().unwrap().iter().all(|x| x["name"] != "Bells"));
        let plain = state_json(&Saved::default(), &mac_voices(), "en-US", &inputs, None, Sound::On);
        assert!(plain["voice"].is_null() && plain["voiceMissing"].is_null() && plain["voiceUsing"].is_null() && plain["mic"].is_null() && plain["micMissing"].is_null());
        assert_eq!(plain["defaultInput"], "MacBook Pro Microphone", "the first one when the Mac names no default");
    }

    // ---- HeyClicky v1.0.53 parity: with the lid closed, hold to talk uses another microphone ----
    // With the lid closed the Mac's own microphone is cut off in hardware, yet it can stay listed and stay the Mac's
    // default, so a held talk recorded silence. It counts as one that cannot hear (unheard) and is passed over.
    fn lid_list() -> [Input; 3] { [inp("coreaudio:BuiltInMicrophoneDevice", "MacBook Pro Microphone"), inp("coreaudio:usb-1", "Blue Yeti"), inp("coreaudio:pods", "AirPods Pro")] }
    #[test]
    fn with_the_lid_closed_the_macs_own_microphone_cannot_hear_and_with_it_open_it_can() {
        let builtin = ["BuiltInMicrophoneDevice".to_string()];
        assert_eq!(unheard(&lid_list(), &builtin, true), vec!["coreaudio:BuiltInMicrophoneDevice".to_string()]);
        assert!(unheard(&lid_list(), &builtin, false).is_empty(), "lid open: every microphone can hear");
        assert!(unheard(&lid_list(), &[], true).is_empty(), "no microphone of its own (a Mac mini): nothing changes");
        // Matched by Core Audio's own id after the host's name, never by the microphone's name.
        assert!(unheard(&[inp("coreaudio:other", "MacBook Pro Microphone")], &builtin, true).is_empty());
    }
    #[test]
    fn the_macs_own_microphone_picked_or_the_default_gives_way_to_another_one_with_the_lid_closed() {
        let list = lid_list();
        let off = ["coreaudio:BuiltInMicrophoneDevice".to_string()];
        // The default is the Mac's own: the first other one listens.
        assert_eq!(pick_mic(None, &list, Some("coreaudio:BuiltInMicrophoneDevice"), &off), MicUse { index: Some(1), missing: None });
        // Picked: the same, and it is not called "not connected" (it is connected; the lid is closed).
        let own = named("coreaudio:BuiltInMicrophoneDevice", "MacBook Pro Microphone", "");
        assert_eq!(pick_mic(Some(&own), &list, Some("coreaudio:pods"), &off), MicUse { index: Some(2), missing: None }, "the Mac's default next");
        // Another one picked is used as before.
        let yeti = named("coreaudio:usb-1", "Blue Yeti", "");
        assert_eq!(pick_mic(Some(&yeti), &list, Some("coreaudio:BuiltInMicrophoneDevice"), &off), MicUse { index: Some(1), missing: None });
        // Lid open: exactly as before.
        assert_eq!(pick_mic(None, &list, Some("coreaudio:BuiltInMicrophoneDevice"), &[]), MicUse { index: Some(0), missing: None });
        // Nothing else to listen with: the old choice stands (and the worker says the lid line before listening).
        assert_eq!(pick_mic(None, &list[..1], Some("coreaudio:BuiltInMicrophoneDevice"), &off).index, Some(0));
        assert!(only_unheard(&list[..1], &off));
        assert!(!only_unheard(&list, &off) && !only_unheard(&[], &off) && !only_unheard(&list[..1], &[]));
    }
    #[test]
    fn with_the_lid_closed_a_lost_microphone_is_never_replaced_by_the_macs_own() {
        let list = lid_list();
        let off = ["coreaudio:BuiltInMicrophoneDevice".to_string()];
        // AirPods went away mid hold; the default is the Mac's own: the Yeti, not the silent one.
        assert_eq!(after_loss(None, &list, Some("coreaudio:BuiltInMicrophoneDevice"), "coreaudio:pods", &off), Some(1));
        assert_eq!(after_loss(None, &[list[0].clone(), list[2].clone()], Some("coreaudio:BuiltInMicrophoneDevice"), "coreaudio:pods", &off), None, "nothing that can hear is left");
        // At the start: the Mac's own is never even tried while another can hear.
        let tried = std::cell::RefCell::new(Vec::new());
        let (r, missing) = open_at_start(None, &list, Some("coreaudio:BuiltInMicrophoneDevice"), &off, |i| { tried.borrow_mut().push(i); Some(i) }, || false);
        assert_eq!((r, missing), (Reopen::Opened(1, 1), None));
        assert_eq!(*tried.borrow(), [1]);
    }

    // ---- HeyClicky v1.0.53 parity: no beachball after sleep or a headset change ----
    // Core Audio can stall just after the Mac wakes or while AirPods connect. Settings and speaking read the microphones and
    // the sound on a helper thread and wait at most a moment; a slow read gives the last answer (or a safe one), and is
    // kept for next time. While one read is still stuck, no second one is started.
    #[test]
    fn a_slow_core_audio_read_gives_the_last_answer_at_once_and_never_starts_a_second_read() {
        static R: Recent<u32> = Recent::new();
        let calls = std::sync::Arc::new(std::sync::atomic::AtomicU32::new(0));
        let slow = |c: std::sync::Arc<std::sync::atomic::AtomicU32>| move || { c.fetch_add(1, std::sync::atomic::Ordering::SeqCst); std::thread::sleep(std::time::Duration::from_millis(400)); 7u32 };
        let t0 = std::time::Instant::now();
        assert_eq!(R.read(std::time::Duration::from_millis(50), || 0, slow(calls.clone())), 0, "nothing known yet: the safe answer");
        assert!(t0.elapsed() < std::time::Duration::from_millis(300), "it never waits for the slow read: {:?}", t0.elapsed());
        assert_eq!(R.read(std::time::Duration::from_millis(50), || 0, slow(calls.clone())), 0);
        assert_eq!(calls.load(std::sync::atomic::Ordering::SeqCst), 1, "no second read while the first is stuck");
        std::thread::sleep(std::time::Duration::from_millis(500));
        assert_eq!(R.last(), Some(7), "the late answer is kept");
        // A quick read gives its own answer at once.
        assert_eq!(R.read(std::time::Duration::from_millis(300), || 0, || 9u32), 9);
        assert_eq!(R.last(), Some(9));
    }
    #[test]
    fn when_a_read_is_slow_again_the_last_good_answer_is_used() {
        static R: Recent<&'static str> = Recent::new();
        assert_eq!(R.read(std::time::Duration::from_millis(300), || "none", || "AirPods"), "AirPods");
        assert_eq!(R.read(std::time::Duration::from_millis(20), || "none", || { std::thread::sleep(std::time::Duration::from_millis(200)); "Yeti" }), "AirPods");
    }

    // ---- the wiring in main.rs and runner.rs (they are compiled with the rest, so a test reads their source) ----
    const MAIN: &str = include_str!("main.rs");
    fn body(sig: &str) -> &'static str {
        let at = MAIN.find(sig).unwrap_or_else(|| panic!("{sig} is gone"));
        let rest = &MAIN[at..];
        &rest[..rest.find("\n}\n").map(|i| i + 2).unwrap_or(rest.len())]
    }
    fn in_order(text: &str, parts: &[&str]) {
        let at: Vec<usize> = parts.iter().map(|p| text.find(p).unwrap_or_else(|| panic!("missing {p}"))).collect();
        assert!(at.windows(2).all(|w| w[0] < w[1]), "in this order: {parts:?}");
    }
    #[test]
    fn the_settings_commands_reach_the_pages_once_and_only_from_the_card() {
        let h = &MAIN[MAIN.find("generate_handler![").unwrap()..];
        let h = &h[..h.find(']').unwrap()];
        let cmds: Vec<&str> = h["generate_handler![".len()..].split(',').map(str::trim).collect();
        for c in ["voice_settings", "set_voice_settings", "speak", "speak_stop"] { assert_eq!(cmds.iter().filter(|x| **x == c).count(), 1, "{c} is a command once"); }
        for f in ["fn voice_settings(", "fn set_voice_settings(", "fn speak("] { assert!(body(f).contains("window.label() != \"card\""), "{f} is card only"); }
        assert!(body("fn set_voice_settings(").contains("voiceset::apply(&before, &ask, &voices, &inputs)"), "only what is on this Mac");
        assert!(MAIN.contains("fn voice_path() -> PathBuf { data_dir().join(\"voice.json\") }"));
    }
    #[test]
    fn speaking_checks_calls_then_the_sound_then_repeats_and_uses_the_picked_voice_and_speed() {
        // The sound is read off the main thread now (sound_reading, a Core Audio stall never freezes the panels).
        in_order(body("fn speak("), &["speak::prepare_reply(&text", "if quiet()", "sound_reading()", "if sound != voiceset::Sound::On", "should_say(&line", "speak::mac::say(&line, set.voice.as_ref(), set.speed)"]);
    }
    // Found in review, 18 Oct 2026: key down silenced speech once, but a line or a whole reply (up to 600 characters) that
    // arrived while the keys were held was still said, into the open microphone, and could be written into the box.
    #[test]
    fn nothing_is_said_while_hold_to_talk_listens() {
        let sp = body("fn speak(");
        in_order(sp, &["speak::prepare_reply(&text", "if listening_now()", "\"why\": \"listening\"", "if quiet()", "sound_reading()", "speak::mac::say(&line"]);
        assert!(MAIN.contains("never over the person's own voice"), "the promise is kept in the doc comment");
        let w = body("fn voice_worker(");
        // On before the light and the microphone, with anything already being said cut off.
        in_order(w, &["listening(true);", "speech_off(&app);", "say_voice(&app, \"listening\", LISTENING", "voice_mac::Recorder::start("]);
        // Off once the microphone is closed: let go, the cap running out or Companion hidden, a cancel, or a microphone that
        // would not start.
        let up = &w[w.find("let heard = r.finish();").unwrap()..]; assert!(up[..up.find("if !long_enough").unwrap()].contains("listening(false);"), "let go");
        assert!(w.matches("listening(false);").count() >= 5, "every way the microphone closes turns it off");
        let tl = &w[w.find("if let Some(why) = hold.must_close(").unwrap()..]; assert!(tl[..tl.find("\n        }").unwrap()].contains("listening(false);"));
        let c = &w[w.find("Ok(VoiceMsg::Cancel)").unwrap()..]; assert!(c[..c.find('\n').unwrap()].contains("listening(false);"));
        let st = &w[w.find("match voice_mac::Recorder::start(").unwrap()..]; let e = &st[st.find("Err(e) =>").unwrap()..]; assert!(e[..e.find('\n').unwrap()].contains("listening(false);"), "would not start");
    }
    #[test]
    fn settings_and_speaking_never_wait_on_core_audio_on_the_main_thread() {
        // voice_settings, set_voice_settings and speak are sync commands, so they run on the main thread every panel shares.
        for f in ["fn voice_state(", "fn set_voice_settings(", "fn speak("] {
            let b = body(f);
            assert!(!b.contains("voice_mac::inputs()") && !b.contains("speak::mac::sound_now()"), "{f} reads Core Audio itself");
        }
        assert!(body("fn voice_state(").contains("inputs_now()") && body("fn voice_state(").contains("sound_reading()"));
        assert!(body("fn set_voice_settings(").contains("inputs_now()"));
        assert!(body("fn speak(").contains("let sound = sound_reading();"));
        assert!(MAIN.contains("fn inputs_now() -> (Vec<voiceset::Input>, Option<String>) { MIC_LIST.read(CORE_AUDIO_WAIT, || (Vec::new(), None), voice_mac::inputs) }"));
        assert!(MAIN.contains("fn sound_reading() -> voiceset::Sound { SOUND_NOW.read(CORE_AUDIO_WAIT, || voiceset::Sound::On, speak::mac::sound_now) }"), "never claimed off without a reading");
        assert!(MAIN.contains("const CORE_AUDIO_WAIT: Duration = Duration::from_millis(300);"));
        // The Mac's voices are still read where they must be (AVSpeechSynthesisVoice, on the main thread).
        assert!(body("fn voice_settings(").contains("speak::mac::voices()"));
    }
    #[test]
    fn with_the_lid_closed_and_no_other_microphone_it_says_so_before_the_light_and_never_listens() {
        let w = body("fn voice_worker(");
        let check = w.find("if voiceset::only_unheard(&mics, &quiet)").expect("the lid check");
        assert!(check < w.find("listening(true);").unwrap(), "said before the light comes on or the microphone opens");
        let line = &w[check..]; let line = &line[..line.find('\n').unwrap()];
        assert!(line.contains("say_voice(&app, \"blocked\"") && line.contains("\"why\": \"lid\"") && line.contains("continue;"), "{line}");
        // Silence is never blamed on the permission when the permission is granted.
        let blocked = &w[w.find("voice::Heard::Blocked =>").unwrap()..]; let blocked = &blocked[..blocked.find('\n').unwrap()];
        assert!(blocked.contains("voice::why_silent(crate::permissions::current().microphone == crate::permissions::Status::Granted, quiet_mic)"), "{blocked}");
        assert!(blocked.contains("mic[\"why\"] = json!(why.word());"), "{blocked}");
    }
    #[test]
    fn the_card_reads_only_the_saved_speed_at_its_start() {
        let b = body("fn voice_speed(");
        assert!(b.contains("window.label() != \"card\"") && b.contains("voice_now().speed"));
        assert!(!b.contains("inputs(") && !b.contains("voices("), "no device or voice is listed for it");
    }
    #[test]
    fn hold_to_talk_lights_first_then_opens_the_picked_microphone_and_listens_with_the_projects_words() {
        let w = body("fn voice_worker(");
        in_order(w, &["say_voice(&app, \"listening\", LISTENING", "std::thread::sleep(Duration::from_millis(150))", "voice_mac::Recorder::start(voice_now().mic)", ".tell(opened.missing.as_deref())"]);
        in_order(w, &["voicewords::collect(std::path::Path::new(&project), &voicewords::settings_for(&project))", "voice_mac::transcribe_with(c, &mono, &words, language)", "voicewords::is_echo(&text, &words)", "mic[\"text\"] = json!(text)"]);
        assert!(w.contains("voiceset::language(&voice_now().language)"));
        // What is logged: counts and timing, never the words or what was said.
        assert!(w.contains("\"words\": words.split(\", \").filter(|w| !w.is_empty()).count()"));
        assert!(!w.contains("\"words\": words,") && !w.contains("\"text\": text") , "never the words in the log");
    }
    #[test]
    fn the_projects_setting_names_come_from_the_project_check_as_it_passes_through() {
        let runner = include_str!("runner.rs");
        let publish = &runner[runner.find("pub fn publish(").unwrap()..];
        let publish = &publish[..publish.find("\n    }\n").unwrap()];
        assert!(publish.contains("crate::voicewords::note_report(&v)"), "{publish}");
    }
    #[test]
    fn delete_everything_removes_the_voice_settings_with_the_other_settings() {
        let root = std::env::temp_dir().join(format!("companion-test-voiceset-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&root);
        let (home, data) = (root.join("home"), root.join("home/Library/Application Support/dev.companion.app"));
        std::fs::create_dir_all(&data).unwrap();
        std::fs::write(data.join("voice.json"), to_json(&Saved::default()).to_string()).unwrap();
        let groups = crate::wipe::items(&home, &data);
        assert!(groups.iter().find(|g| g.id == "settings").unwrap().paths.iter().any(|p| p.ends_with("voice.json")));
        let _ = std::fs::remove_dir_all(&root);
    }
}
