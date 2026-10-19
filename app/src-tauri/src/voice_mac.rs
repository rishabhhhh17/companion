//! The real Mac behind hold to talk: the microphone, the speech model on this Mac, and the permission.
//! Audio never leaves this Mac and is never written to disk; only the words are used. The microphone is open only
//! between the key going down and the key coming up (voice.rs decides when).
#![cfg(target_os = "macos")]

use cpal::traits::{DeviceTrait, HostTrait, StreamTrait};
use cpal::{SampleFormat, SizedSample};
use sha2::{Digest, Sha256};
use std::io::Read;
use std::path::{Path, PathBuf};
use std::sync::mpsc::{self, Sender};
use std::sync::{Arc, Mutex};
use std::time::Duration;

pub const MODEL_NAME: &str = "ggml-base.bin";
pub const MODEL_URL: &str = "https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-base.bin";
pub const MODEL_BYTES: u64 = 147_951_465;
/// Checked against Hugging Face's own record of the file on 9 Oct 2026.
pub const MODEL_SHA256: &str = "60ed5bc3dd14eea856493d334349b405782ddcaf0028d4b5df4088345fba2efe";

pub fn model_path(data_dir: &Path) -> PathBuf { data_dir.join("models").join(MODEL_NAME) }

pub fn sha256_of(path: &Path) -> std::io::Result<String> {
    let mut f = std::fs::File::open(path)?;
    let mut h = Sha256::new(); let mut buf = vec![0u8; 1 << 20];
    loop { let n = f.read(&mut buf)?; if n == 0 { break; } h.update(&buf[..n]); }
    Ok(h.finalize().iter().map(|b| format!("{b:02x}")).collect())
}

/// A model that is there and is the file we expect.
pub fn model_ready(data_dir: &Path) -> bool {
    let p = model_path(data_dir);
    let Ok(m) = std::fs::metadata(&p) else { return false };
    if m.len() != MODEL_BYTES { return false; }
    // Reading 148 MB to check it takes a moment, and this runs on every press of the talk keys: remember the answer for as
    // long as the file is the same file (same size and last change).
    static CHECKED: std::sync::Mutex<Option<(std::path::PathBuf, std::time::SystemTime, bool)>> = std::sync::Mutex::new(None);
    let stamp = m.modified().unwrap_or(std::time::UNIX_EPOCH);
    if let Some((path, at, ok)) = CHECKED.lock().unwrap_or_else(|e| e.into_inner()).as_ref() { if *path == p && *at == stamp { return *ok; } }
    let ok = sha256_of(&p).map(|s| s == MODEL_SHA256).unwrap_or(false);
    *CHECKED.lock().unwrap_or_else(|e| e.into_inner()) = Some((p, stamp, ok));
    ok
}

/// Downloads the model once, into Companion's own folder, and only keeps it if it is exactly the expected file.
/// `progress` is told how many bytes have arrived. Uses the Mac's own `curl`, so no new network code is added.
pub fn download_model(data_dir: &Path, progress: &dyn Fn(u64)) -> Result<(), String> {
    let dir = data_dir.join("models");
    std::fs::create_dir_all(&dir).map_err(|e| format!("Could not make the folder: {e}"))?;
    let tmp = dir.join(format!("{MODEL_NAME}.part"));
    let _ = std::fs::remove_file(&tmp);
    let mut child = std::process::Command::new("/usr/bin/curl")
        .args(["-L", "--fail", "--silent", "--show-error", "--max-time", "1800", "-o"]).arg(&tmp).arg(MODEL_URL)
        .stdin(std::process::Stdio::null()).stdout(std::process::Stdio::null()).stderr(std::process::Stdio::piped())
        .spawn().map_err(|e| format!("Could not start the download: {e}"))?;
    loop {
        match child.try_wait() {
            Ok(Some(st)) => {
                if !st.success() { let mut e = String::new(); if let Some(mut s) = child.stderr.take() { let _ = s.read_to_string(&mut e); } let _ = std::fs::remove_file(&tmp); return Err(format!("The download failed. {}", e.trim())); }
                break;
            }
            Ok(None) => { progress(std::fs::metadata(&tmp).map(|m| m.len()).unwrap_or(0)); std::thread::sleep(Duration::from_millis(400)); }
            Err(e) => return Err(e.to_string()),
        }
    }
    let ok = std::fs::metadata(&tmp).map(|m| m.len() == MODEL_BYTES).unwrap_or(false) && sha256_of(&tmp).map(|s| s == MODEL_SHA256).unwrap_or(false);
    if !ok { let _ = std::fs::remove_file(&tmp); return Err("The downloaded file was not the expected one, so it was thrown away.".into()); }
    std::fs::rename(&tmp, model_path(data_dir)).map_err(|e| format!("Could not save the model: {e}"))
}

// ---------- microphone permission ----------

#[derive(Debug, PartialEq, Eq, Clone, Copy)]
pub enum Mic { NotAsked, Allowed, Refused }

pub fn mic_status() -> Mic {
    use objc2_av_foundation::{AVAuthorizationStatus, AVCaptureDevice, AVMediaTypeAudio};
    let Some(kind) = (unsafe { AVMediaTypeAudio }) else { return Mic::NotAsked };
    match unsafe { AVCaptureDevice::authorizationStatusForMediaType(kind) } {
        AVAuthorizationStatus::Authorized => Mic::Allowed,
        AVAuthorizationStatus::NotDetermined => Mic::NotAsked,
        _ => Mic::Refused,
    }
}

/// macOS shows its own question, once. Called only the first time hold to talk is used.
pub fn ask_for_mic() {
    use block2::RcBlock;
    use objc2_av_foundation::{AVCaptureDevice, AVMediaTypeAudio};
    let Some(kind) = (unsafe { AVMediaTypeAudio }) else { return };
    let block = RcBlock::new(|_granted: objc2::runtime::Bool| {});
    unsafe { AVCaptureDevice::requestAccessForMediaType_completionHandler(kind, &block) };
}

// ---------- recording ----------

use crate::voiceset::{self, Input, Named, OnError, Trouble};

/// The Mac's microphones, by their lasting id (Core Audio's device id) and name, and which one is the Mac's default now.
/// Names only: nothing is opened and nothing listens.
pub fn inputs() -> (Vec<Input>, Option<String>) {
    let host = cpal::default_host();
    (input_list(&host).into_iter().map(|(i, _)| i).collect(), default_id(&host))
}
/// A device's name, or None when it cannot be read (the device is going away). Never through the device's Display: cpal
/// fails that then, and turning a failed Display into text panics.
fn name_of(d: &cpal::Device) -> Option<String> { d.description().ok().map(|x| voiceset::device_name(x.name())) }
/// The microphones whose id and name can be read now; one going away may still be listed for a moment, and is left out.
fn input_list(host: &cpal::Host) -> Vec<(Input, cpal::Device)> {
    host.input_devices().map(|ds| ds.filter_map(|d| { let id = d.id().ok()?.to_string(); let name = name_of(&d)?; Some((Input { id, name }, d)) }).collect()).unwrap_or_default()
}
fn default_id(host: &cpal::Host) -> Option<String> { host.default_input_device().and_then(|d| d.id().ok()).map(|i| i.to_string()) }

// ---------- the lid (HeyClicky v1.0.53 parity: with the lid closed, another microphone listens) ----------
// Read without any permission and without a new library: whether the Mac's own screen is among the online displays
// (Core Graphics, already used), and which microphones are the Mac's own (Core Audio's transport type, as speak.rs reads
// the sound). Nothing is opened and nothing listens.

/// The lid is closed: no online display is the Mac's own screen. On a Mac with no screen of its own (a Mac mini) this is
/// true too, but it has no microphone of its own either, so `unheard` changes nothing there.
pub fn lid_closed() -> bool {
    let mut ids = [0u32; 32];
    let mut n = 0u32;
    let err = unsafe { objc2_core_graphics::CGGetOnlineDisplayList(ids.len() as u32, ids.as_mut_ptr(), &mut n) };
    if err != objc2_core_graphics::CGError::Success || n == 0 { return false; }
    !ids[..(n as usize).min(ids.len())].iter().any(|d| objc2_core_graphics::CGDisplayIsBuiltin(*d))
}

mod ca {
    #[repr(C)]
    struct Address { selector: u32, scope: u32, element: u32 }
    #[link(name = "CoreAudio", kind = "framework")]
    extern "C" {
        fn AudioObjectGetPropertyDataSize(object: u32, address: *const Address, qualifier_size: u32, qualifier: *const std::ffi::c_void, size: *mut u32) -> i32;
        fn AudioObjectGetPropertyData(object: u32, address: *const Address, qualifier_size: u32, qualifier: *const std::ffi::c_void, size: *mut u32, data: *mut std::ffi::c_void) -> i32;
    }
    const fn code(s: &[u8; 4]) -> u32 { u32::from_be_bytes(*s) }
    fn addr(selector: &[u8; 4], scope: &[u8; 4]) -> Address { Address { selector: code(selector), scope: code(scope), element: 0 } }
    fn size(object: u32, a: &Address) -> u32 { let mut n = 0u32; if unsafe { AudioObjectGetPropertyDataSize(object, a, 0, std::ptr::null(), &mut n) } == 0 { n } else { 0 } }
    /// Core Audio's ids of the Mac's own microphones: transport type built in, with input streams, and not the headphone
    /// jack (voiceset::own_mic, from the input data source in use when the device reports one).
    pub fn builtin_input_uids() -> Vec<String> {
        let all = addr(b"dev#", b"glob");
        let n = size(1, &all) as usize / std::mem::size_of::<u32>();
        if n == 0 || n > 256 { return Vec::new(); }
        let mut devs = vec![0u32; n];
        let mut bytes = (n * std::mem::size_of::<u32>()) as u32;
        if unsafe { AudioObjectGetPropertyData(1, &all, 0, std::ptr::null(), &mut bytes, devs.as_mut_ptr().cast()) } != 0 { return Vec::new(); }
        devs.truncate(bytes as usize / std::mem::size_of::<u32>());
        let mut out = Vec::new();
        for d in devs {
            let mut tran = 0u32; let mut sz = std::mem::size_of::<u32>() as u32;
            if unsafe { AudioObjectGetPropertyData(d, &addr(b"tran", b"glob"), 0, std::ptr::null(), &mut sz, (&mut tran as *mut u32).cast()) } != 0 || tran != code(b"bltn") { continue; }
            if size(d, &addr(b"stm#", b"inpt")) == 0 { continue; }   // no input: a speaker
            let mut uid: *const std::ffi::c_void = std::ptr::null();
            let mut sz = std::mem::size_of::<*const std::ffi::c_void>() as u32;
            if unsafe { AudioObjectGetPropertyData(d, &addr(b"uid ", b"glob"), 0, std::ptr::null(), &mut sz, (&mut uid as *mut *const std::ffi::c_void).cast()) } != 0 { continue; }
            // A CFString under the create rule: taken, read, released.
            let Some(p) = std::ptr::NonNull::new(uid as *mut objc2_core_foundation::CFString) else { continue };
            let id = unsafe { objc2_core_foundation::CFRetained::from_raw(p) }.to_string();
            // The input data source in use, when the device has one: the internal microphone, or a headset in the jack.
            let mut src = 0u32; let mut sz = std::mem::size_of::<u32>() as u32;
            let source = (unsafe { AudioObjectGetPropertyData(d, &addr(b"ssrc", b"inpt"), 0, std::ptr::null(), &mut sz, (&mut src as *mut u32).cast()) } == 0).then_some(src);
            if crate::voiceset::own_mic(&id, source) { out.push(id); }
        }
        out
    }
}

/// The microphones listed now, the Mac's default, and those that cannot hear now (for Settings, off the main thread).
pub fn mics() -> (Vec<Input>, Option<String>, Vec<String>) {
    let (inputs, default) = inputs();
    let quiet = quiet_now(&inputs);
    (inputs, default, quiet)
}
/// The microphones listed now, and those that cannot hear now (voiceset::unheard: the Mac's own with the lid closed).
pub fn hearing() -> (Vec<Input>, Vec<String>) {
    let (inputs, _) = inputs();
    let quiet = quiet_now(&inputs);
    (inputs, quiet)
}
/// voiceset::unheard for these microphones now. With the lid open (the usual case) only one Core Graphics call is made.
fn quiet_now(inputs: &[Input]) -> Vec<String> { if lid_closed() { voiceset::unheard(inputs, &ca::builtin_input_uids(), true) } else { Vec::new() } }

/// One open microphone: what it heard, in its own format, and the problems it reported (an error kind's name), the most
/// serious one waiting first (voiceset::Trouble).
struct Open { stream: cpal::Stream, buf: Arc<Mutex<Vec<f32>>>, ch: usize, rate: u32, trouble: Arc<Trouble> }
impl Open {
    /// Closes this microphone and gives what it heard at 16 kHz, one channel.
    fn close(self) -> Vec<f32> {
        drop(self.stream);
        let samples = self.buf.lock().map(|b| b.clone()).unwrap_or_default();
        crate::voice::to_mono_16k(&samples, self.ch, self.rate)
    }
}

/// How many samples the open microphone keeps: room for the hold's whole cap and ten seconds more (voice.rs
/// buffer_samples), set as the keys go down. A memory guard only: the cap itself closes the microphone.
static BUFFER_ROOM: std::sync::atomic::AtomicUsize = std::sync::atomic::AtomicUsize::new(16_000 * 4 * 70 * 2);
pub fn set_buffer_room(n: usize) { BUFFER_ROOM.store(n, std::sync::atomic::Ordering::SeqCst); }
fn buffer_room() -> usize { BUFFER_ROOM.load(std::sync::atomic::Ordering::SeqCst) }

fn collect<T: SizedSample + 'static>(dev: &cpal::Device, cfg: cpal::StreamConfig, buf: Arc<Mutex<Vec<f32>>>, trouble: Arc<Trouble>, to_f32: fn(T) -> f32) -> Result<cpal::Stream, String> {
    // The most serious problem waiting wins (voiceset::replaces): a microphone that went away is never hidden behind an overload.
    let on_error = move |e: cpal::Error| { let k = format!("{:?}", e.kind()); trouble.report(&k); };
    dev.build_input_stream(cfg, move |data: &[T], _| { if let Ok(mut b) = buf.lock() { if b.len() < buffer_room() { b.extend(data.iter().map(|s| to_f32(*s))); } } }, on_error, None).map_err(|e| e.to_string())
}

fn open(dev: &cpal::Device) -> Result<Open, String> {
    let sup = dev.default_input_config().map_err(|e| e.to_string())?;
    let (ch, rate, fmt) = (sup.channels() as usize, sup.sample_rate(), sup.sample_format());
    let cfg: cpal::StreamConfig = sup.into();
    let (buf, trouble) = (Arc::new(Mutex::new(Vec::<f32>::new())), Arc::new(Trouble::default()));
    let stream = match fmt {
        SampleFormat::F32 => collect::<f32>(dev, cfg, buf.clone(), trouble.clone(), |s| s),
        SampleFormat::I16 => collect::<i16>(dev, cfg, buf.clone(), trouble.clone(), |s| s as f32 / 32768.0),
        SampleFormat::U16 => collect::<u16>(dev, cfg, buf.clone(), trouble.clone(), |s| (s as f32 - 32768.0) / 32768.0),
        SampleFormat::I32 => collect::<i32>(dev, cfg, buf.clone(), trouble.clone(), |s| s as f32 / 2147483648.0),
        other => return Err(format!("This microphone uses a format I cannot read ({other:?}).")),
    }?;
    stream.play().map_err(|e| e.to_string())?;
    Ok(Open { stream, buf, ch, rate, trouble })
}

/// Which microphone was opened, and the picked one's name when it was not connected (then the Mac's default was used).
/// `quiet`: the one that listens cannot hear now (the Mac's own with the lid closed, when nothing else could listen).
pub struct Opened { pub name: String, pub missing: Option<String>, pub quiet: bool }
/// What was heard, at 16 kHz on one channel. `switched_to`: another microphone took over while the keys were held (the
/// one in use went away, Bluetooth headphones switched off). `lost`: it went away and no other one could listen, so this
/// is what was heard until then.
pub struct Heard { pub mono: Vec<f32>, pub switched_to: Option<String>, pub lost: bool }

/// The recorder lives on its own thread (the audio stream cannot move between threads) and is told to stop.
pub struct Recorder { stop: Sender<()>, result: mpsc::Receiver<Result<Heard, String>> }

impl Recorder {
    /// Opens the microphone picked in Settings, or the Mac's default when none is picked or the picked one is not connected
    /// or will not open (voiceset::open_at_start). While the keys are held, a microphone that goes away is replaced by
    /// another (voiceset::after_loss) and one that changes (a Bluetooth headset starting its microphone) is opened again, at
    /// most MAX_REOPENS times.
    pub fn start(saved: Option<Named>) -> Result<(Recorder, Opened), String> {
        let (stop_tx, stop_rx) = mpsc::channel::<()>();
        let (res_tx, res_rx) = mpsc::channel();
        let (ready_tx, ready_rx) = mpsc::channel::<Result<Opened, String>>();
        std::thread::spawn(move || {
            let host = cpal::default_host();
            let list = input_list(&host);
            let infos: Vec<Input> = list.iter().map(|(i, _)| i.clone()).collect();
            // With the lid closed, the Mac's own microphone cannot hear: another one listens (voiceset::unheard).
            let quiet = quiet_now(&infos);
            let fail = |e: String| { let _ = ready_tx.send(Err(e.clone())); let _ = res_tx.send(Err(e)); };
            let (mut using, mut live, missing) = if infos.is_empty() {
                // No microphone could be listed by name just now: the Mac's default, if it has one.
                let Some(d) = host.default_input_device() else { fail("No microphone was found.".into()); return };
                let using = Input { id: d.id().map(|x| x.to_string()).unwrap_or_default(), name: name_of(&d).unwrap_or_default() };
                match open(&d) { Ok(o) => (using, Some(o), saved.as_ref().map(|s| s.name.clone())), Err(e) => { fail(e); return } }
            } else {
                // The picked one (or the Mac's default), then, when it is listed but will not open, another in its place, named
                // in the one plain line (voiceset::open_at_start). A stop meanwhile wins, as in a reopen.
                let did = default_id(&host);
                let mut first_err: Option<String> = None;
                let opener = |i: usize| match open(&list[i].1) { Ok(o) => Some(o), Err(e) => { first_err.get_or_insert(e); None } };
                match voiceset::open_at_start(saved.as_ref(), &infos, did.as_deref(), &quiet, opener, || voiceset::stop_waiting(&stop_rx)) {
                    (voiceset::Reopen::Opened(i, o), missing) => (infos[i].clone(), Some(o), missing),
                    (voiceset::Reopen::NoneOpened, _) => { fail(first_err.unwrap_or_else(|| "No microphone would start.".into())); return }
                    (voiceset::Reopen::Stopped, _) => { fail("The microphone did not start.".into()); return }
                }
            };
            let _ = ready_tx.send(Ok(Opened { name: using.name.clone(), missing, quiet: quiet.contains(&using.id) }));
            let (mut heard, mut switched_to, mut lost, mut reopens) = (Vec::<f32>::new(), None, false, 0u32);
            loop {
                // The key came up (or Stop everything, or the recorder was dropped): stop listening.
                match stop_rx.recv_timeout(Duration::from_millis(100)) { Err(mpsc::RecvTimeoutError::Timeout) => {} _ => break }
                // Taken in one step: a problem reported right after this look waits for the next one (voiceset::Trouble).
                let Some(kind) = live.as_ref().and_then(|o| o.trouble.take()) else { continue };
                let what = voiceset::on_stream_error(&kind);
                if what == OnError::Ignore { continue; }
                if let Some(o) = live.take() { heard.extend(o.close()); }   // keep what it heard, and close it
                if reopens >= voiceset::MAX_REOPENS { lost = true; continue; }
                reopens += 1;
                let host = cpal::default_host();
                let list = input_list(&host);
                let infos: Vec<Input> = list.iter().map(|(i, _)| i.clone()).collect();
                let did = default_id(&host);
                // Changed: the same one again first. Gone, or the same one will not open: another (voiceset::after_loss).
                let same = if what == OnError::OpenSameAgain { infos.iter().position(|x| x.id == using.id) } else { None };
                let other = voiceset::after_loss(saved.as_ref(), &infos, did.as_deref(), &using.id, &quiet);
                // A stop that comes while another microphone opens (a Bluetooth or USB one can take a moment) wins: nothing more
                // is opened, and one that opened meanwhile is closed at once, with nothing it heard kept (rules 5 and 11).
                match voiceset::reopen_first([same, other].into_iter().flatten(), |i| open(&list[i].1).ok(), || voiceset::stop_waiting(&stop_rx)) {
                    voiceset::Reopen::Opened(i, o) => { if infos[i].id != using.id { switched_to = Some(infos[i].name.clone()); } using = infos[i].clone(); live = Some(o); }
                    voiceset::Reopen::NoneOpened => lost = true,
                    voiceset::Reopen::Stopped => break,
                }
            }
            if let Some(o) = live.take() { heard.extend(o.close()); }   // the microphone is closed here
            let _ = res_tx.send(Ok(Heard { mono: heard, switched_to, lost }));
        });
        let opened = ready_rx.recv_timeout(Duration::from_secs(5)).map_err(|_| "The microphone did not start.".to_string())??;
        Ok((Recorder { stop: stop_tx, result: res_rx }, opened))
    }
    /// Closes the microphone and returns what it heard.
    pub fn finish(self) -> Result<Heard, String> {
        let _ = self.stop.send(());
        self.result.recv_timeout(Duration::from_secs(5)).map_err(|_| "The microphone did not stop in time.".to_string())?
    }
}

// ---------- understanding ----------

pub use whisper_rs::WhisperContext as Speech;

/// Loads the speech model into memory. This takes a few seconds the first time, so it is done while the person is still
/// talking, and the model is let go again after a few idle minutes so it does not sit in memory all day.
pub fn load(model: &Path) -> Result<Speech, String> {
    use whisper_rs::WhisperContextParameters;
    Speech::new_with_params(model.to_str().ok_or("bad model path")?, WhisperContextParameters::default()).map_err(|e| format!("Could not load the speech model: {e}"))
}

/// `prompt`: the open project's own words (voicewords.rs), empty for none. `language`: a language code picked in Settings,
/// None to let the model tell. Neither may hold a NUL (whisper-rs would stop on one): both are dropped if they do.
pub fn transcribe_with(ctx: &Speech, samples_16k: &[f32], prompt: &str, language: Option<&str>) -> Result<String, String> {
    use whisper_rs::{FullParams, SamplingStrategy};
    let mut state = ctx.create_state().map_err(|e| e.to_string())?;
    let mut p = FullParams::new(SamplingStrategy::Greedy { best_of: 1 });
    p.set_language(language.filter(|l| !l.contains('\0'))); p.set_translate(false);
    if !prompt.is_empty() && !prompt.contains('\0') { p.set_initial_prompt(prompt); }
    p.set_print_special(false); p.set_print_progress(false); p.set_print_realtime(false); p.set_print_timestamps(false);
    p.set_no_context(true); p.set_single_segment(false);
    state.full(p, samples_16k).map_err(|e| format!("Could not understand the audio: {e}"))?;
    let mut out = String::new();
    for i in 0..state.full_n_segments() { if let Some(seg) = state.get_segment(i) { if let Ok(t) = seg.to_str() { out.push_str(t); out.push(' '); } } }
    Ok(out)
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn the_checksum_of_a_known_file_is_right_and_a_changed_file_is_noticed() {
        let d = std::env::temp_dir().join(format!("vm-{}", std::process::id())); std::fs::create_dir_all(&d).unwrap();
        let f = d.join("x"); std::fs::write(&f, b"abc").unwrap();
        assert_eq!(sha256_of(&f).unwrap(), "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
        std::fs::write(&f, b"abd").unwrap(); assert_ne!(sha256_of(&f).unwrap(), "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
    }
    #[test]
    fn a_missing_or_wrong_sized_model_is_not_ready() {
        let d = std::env::temp_dir().join(format!("vm2-{}", std::process::id())); std::fs::create_dir_all(d.join("models")).unwrap();
        assert!(!model_ready(&d));
        std::fs::write(model_path(&d), b"tiny").unwrap(); assert!(!model_ready(&d));
    }

    // ---- the recorder's own rules (found in review, 18 Oct 2026; the logic is voiceset's, tested there) ----
    const SRC: &str = include_str!("voice_mac.rs");
    fn code() -> &'static str { &SRC[..SRC.find("#[cfg(test)]").unwrap()] }
    #[test]
    fn a_device_name_is_read_without_a_panic() {
        // cpal's Display for a device fails when the device is going away, and to_string then panics.
        assert!(!code().contains("d.to_string()"), "never a device's Display");
        assert!(code().contains("d.description().ok().map(|x| voiceset::device_name(x.name()))"));
    }
    #[test]
    fn each_problem_is_taken_in_one_step_and_a_reopen_looks_for_a_stop_first() {
        let c = code();
        assert!(!c.contains("clear_trouble") && !c.contains("fn trouble("), "never read, then cleared in a second step");
        assert!(c.contains("live.as_ref().and_then(|o| o.trouble.take())"));
        assert!(c.contains("o.trouble.report(") || c.contains("trouble.report(&k)"));
        let reopen = &c[c.find("let other = voiceset::after_loss(").unwrap()..];
        assert!(reopen.contains("voiceset::reopen_first([same, other].into_iter().flatten(), |i| open(&list[i].1).ok(), || voiceset::stop_waiting(&stop_rx))"));
        assert!(reopen.contains("voiceset::Reopen::Stopped => break"), "a stop during a reopen ends the recording");
    }
    // Found in review, 18 Oct 2026: at the start, a picked microphone that was listed but would not open gave an error
    // instead of the default listening with the one plain line.
    #[test]
    fn the_start_falls_back_like_a_reopen_and_names_the_picked_microphone_when_another_listens() {
        let c = code();
        let start = &c[c.find("pub fn start(saved: Option<Named>)").unwrap()..c.find("let (mut heard, mut switched_to").unwrap()];
        assert!(start.contains("voiceset::open_at_start(saved.as_ref(), &infos, did.as_deref(),"), "{start}");
        assert!(start.contains("|| voiceset::stop_waiting(&stop_rx))"));
        assert!(!start.contains("voiceset::pick_mic("), "the start's choice is open_at_start's");
        assert!(start.contains("let _ = ready_tx.send(Ok(Opened { name: using.name.clone(), missing, quiet: quiet.contains(&using.id) }));"));
        // With the lid closed the Mac's own microphone is passed over at the start and when another one goes away.
        assert!(start.contains("let quiet = quiet_now(&infos);"));
        assert!(c.contains("fn quiet_now(inputs: &[Input]) -> Vec<String> { if lid_closed() { voiceset::unheard(inputs, &ca::builtin_input_uids(), true) } else { Vec::new() } }"));
        assert!(c.contains("voiceset::after_loss(saved.as_ref(), &infos, did.as_deref(), &using.id, &quiet)"));
    }

    /// Real speech in, real words out. Needs the model (downloaded once into the real app folder, about 140 MB).
    /// Run with: cargo test -- --ignored speech_round_trip
    #[test]
    #[ignore]
    fn speech_round_trip() {
        let data = PathBuf::from(std::env::var("HOME").unwrap()).join("Library/Application Support/dev.companion.app");
        if !model_ready(&data) { download_model(&data, &|got| eprintln!("downloaded {got}")).expect("download"); }
        let dir = std::env::temp_dir().join(format!("speech-{}", std::process::id())); std::fs::create_dir_all(&dir).unwrap();
        let (aiff, wav) = (dir.join("a.aiff"), dir.join("a.wav"));
        assert!(std::process::Command::new("say").args(["-o"]).arg(&aiff).arg("How do I deploy this website to the internet").status().unwrap().success());
        assert!(std::process::Command::new("afconvert").args(["-f", "WAVE", "-d", "LEI16@16000", "-c", "1"]).arg(&aiff).arg(&wav).status().unwrap().success());
        let bytes = std::fs::read(&wav).unwrap();
        let samples: Vec<f32> = bytes[44..].chunks_exact(2).map(|b| i16::from_le_bytes([b[0], b[1]]) as f32 / 32768.0).collect();
        let t_load = std::time::Instant::now();
        let ctx = load(&model_path(&data)).unwrap();
        eprintln!("model loaded in {:?}", t_load.elapsed());
        let t0 = std::time::Instant::now();
        let text = crate::voice::clean_transcript(&transcribe_with(&ctx, &samples, "", None).unwrap());
        eprintln!("heard: {text:?} in {:?}", t0.elapsed());
        let t1 = std::time::Instant::now();
        let again = crate::voice::clean_transcript(&transcribe_with(&ctx, &samples, "", None).unwrap());
        eprintln!("second time: {again:?} in {:?}", t1.elapsed());
        let low = text.to_lowercase();
        assert!(low.contains("deploy") && low.contains("website"), "{text}");
        let _ = std::fs::remove_dir_all(&dir);
    }

    /// The project's own words help the speech model write them the way the project does (voicewords.rs). Needs the model
    /// (see speech_round_trip). The sentence is made with the Mac's `say` into a file; nothing is played out loud.
    /// Run with: cargo test -- --ignored project_words_round_trip
    #[test]
    #[ignore]
    fn project_words_round_trip() {
        let data = PathBuf::from(std::env::var("HOME").unwrap()).join("Library/Application Support/dev.companion.app");
        assert!(model_ready(&data), "download the model first (speech_round_trip)");
        let dir = std::env::temp_dir().join(format!("companion-test-words-speech-{}", std::process::id())); std::fs::create_dir_all(&dir).unwrap();
        let (aiff, wav) = (dir.join("a.aiff"), dir.join("a.wav"));
        assert!(std::process::Command::new("say").args(["-o"]).arg(&aiff).arg("Why does use auth fail when I sign up with supabase, and how do I deploy it to vercel").status().unwrap().success());
        assert!(std::process::Command::new("afconvert").args(["-f", "WAVE", "-d", "LEI16@16000", "-c", "1"]).arg(&aiff).arg(&wav).status().unwrap().success());
        let bytes = std::fs::read(&wav).unwrap();
        let samples: Vec<f32> = bytes[44..].chunks_exact(2).map(|b| i16::from_le_bytes([b[0], b[1]]) as f32 / 32768.0).collect();
        let ctx = load(&model_path(&data)).unwrap();
        let words = crate::voicewords::prompt(&["supabase".to_string(), "vercel".to_string(), "useAuth".to_string(), "next".to_string()]);
        let plain = crate::voice::clean_transcript(&transcribe_with(&ctx, &samples, "", None).unwrap());
        let t0 = std::time::Instant::now();
        let with = crate::voice::clean_transcript(&transcribe_with(&ctx, &samples, &words, Some("en")).unwrap());
        eprintln!("without the words: {plain:?}\nwith the words ({:?}): {with:?}", t0.elapsed());
        assert!(!crate::voicewords::is_echo(&with, &words));
        assert!(with.contains("useAuth"), "{with}");
        assert!(with.to_lowercase().contains("supabase") && with.to_lowercase().contains("vercel"), "{with}");
        let _ = std::fs::remove_dir_all(&dir);
    }
}
