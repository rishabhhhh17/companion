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
    std::fs::metadata(&p).map(|m| m.len() == MODEL_BYTES).unwrap_or(false) && sha256_of(&p).map(|s| s == MODEL_SHA256).unwrap_or(false)
}

/// Downloads the model once, into Companion's own folder, and only keeps it if it is exactly the expected file.
/// `progress` is told how many bytes have arrived. Uses the Mac's own `curl`, so no new network code is added.
pub fn download_model(data_dir: &Path, progress: &dyn Fn(u64)) -> Result<(), String> {
    let dir = data_dir.join("models");
    std::fs::create_dir_all(&dir).map_err(|e| format!("Could not make the folder: {e}"))?;
    let tmp = dir.join(format!("{MODEL_NAME}.part"));
    let _ = std::fs::remove_file(&tmp);
    let mut child = std::process::Command::new("curl")
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

/// The recorder lives on its own thread (the audio stream cannot move between threads) and is told to start and stop.
pub struct Recorder { stop: Sender<()>, result: mpsc::Receiver<Result<(Vec<f32>, usize, u32), String>> }

fn collect<T: SizedSample + 'static>(dev: &cpal::Device, cfg: cpal::StreamConfig, buf: Arc<Mutex<Vec<f32>>>, to_f32: fn(T) -> f32) -> Result<cpal::Stream, String> {
    dev.build_input_stream(cfg, move |data: &[T], _| { if let Ok(mut b) = buf.lock() { if b.len() < 16_000 * 4 * 70 * 2 { b.extend(data.iter().map(|s| to_f32(*s))); } } }, |_e| {}, None).map_err(|e| e.to_string())
}

impl Recorder {
    pub fn start() -> Result<Recorder, String> {
        let (stop_tx, stop_rx) = mpsc::channel::<()>();
        let (res_tx, res_rx) = mpsc::channel();
        let (ready_tx, ready_rx) = mpsc::channel::<Result<(), String>>();
        std::thread::spawn(move || {
            let go = || -> Result<(cpal::Stream, Arc<Mutex<Vec<f32>>>, usize, u32), String> {
                let host = cpal::default_host();
                let dev = host.default_input_device().ok_or("No microphone was found.")?;
                let sup = dev.default_input_config().map_err(|e| e.to_string())?;
                let (ch, rate, fmt) = (sup.channels() as usize, sup.sample_rate(), sup.sample_format());
                let cfg: cpal::StreamConfig = sup.into();
                let buf = Arc::new(Mutex::new(Vec::<f32>::new()));
                let stream = match fmt {
                    SampleFormat::F32 => collect::<f32>(&dev, cfg, buf.clone(), |s| s),
                    SampleFormat::I16 => collect::<i16>(&dev, cfg, buf.clone(), |s| s as f32 / 32768.0),
                    SampleFormat::U16 => collect::<u16>(&dev, cfg, buf.clone(), |s| (s as f32 - 32768.0) / 32768.0),
                    SampleFormat::I32 => collect::<i32>(&dev, cfg, buf.clone(), |s| s as f32 / 2147483648.0),
                    other => return Err(format!("This microphone uses a format I cannot read ({other:?}).")),
                }?;
                stream.play().map_err(|e| e.to_string())?;
                Ok((stream, buf, ch, rate))
            };
            match go() {
                Ok((stream, buf, ch, rate)) => {
                    let _ = ready_tx.send(Ok(()));
                    let _ = stop_rx.recv();          // the key came up (or Stop everything)
                    drop(stream);                     // the microphone is closed here
                    let samples = buf.lock().map(|b| b.clone()).unwrap_or_default();
                    let _ = res_tx.send(Ok((samples, ch, rate)));
                }
                Err(e) => { let _ = ready_tx.send(Err(e.clone())); let _ = res_tx.send(Err(e)); }
            }
        });
        ready_rx.recv_timeout(Duration::from_secs(5)).map_err(|_| "The microphone did not start.".to_string())??;
        Ok(Recorder { stop: stop_tx, result: res_rx })
    }
    /// Closes the microphone and returns what it heard: samples, channels, sample rate.
    pub fn finish(self) -> Result<(Vec<f32>, usize, u32), String> {
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

pub fn transcribe_with(ctx: &Speech, samples_16k: &[f32]) -> Result<String, String> {
    use whisper_rs::{FullParams, SamplingStrategy};
    let mut state = ctx.create_state().map_err(|e| e.to_string())?;
    let mut p = FullParams::new(SamplingStrategy::Greedy { best_of: 1 });
    p.set_language(None); p.set_translate(false);
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
        let text = crate::voice::clean_transcript(&transcribe_with(&ctx, &samples).unwrap());
        eprintln!("heard: {text:?} in {:?}", t0.elapsed());
        let t1 = std::time::Instant::now();
        let again = crate::voice::clean_transcript(&transcribe_with(&ctx, &samples).unwrap());
        eprintln!("second time: {again:?} in {:?}", t1.elapsed());
        let low = text.to_lowercase();
        assert!(low.contains("deploy") && low.contains("website"), "{text}");
        let _ = std::fs::remove_dir_all(&dir);
    }
}
