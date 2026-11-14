//! M89 (M86 in the M84 to M86 plans): Speech accuracy, Standard or Best, both on this Mac. Audio never leaves the Mac either
//! way (Wispr's API was looked at and left out: audio would leave the Mac). Each file is pinned by its exact size and SHA-256
//! from the ggerganov/whisper.cpp repo's own record on Hugging Face, and never used unless the file matches both.
//!   Standard: ggml-base.bin, the model already used (147,951,465 bytes).
//!   Best: ggml-large-v3-turbo-q5_0.bin (574,041,195 bytes), read from the Hugging Face API's file list on 14 Nov 2026
//!   (repo commit 5359861c739e955e79d9a303bcbc70fb988958b1) and checked against a download on this Mac the same day.
//! Best downloads only after the person picks it, one download at a time with progress; switching back to Standard deletes
//! it; Delete everything removes both (wipe.rs removes the whole models folder). Until Best is downloaded and checked,
//! Standard keeps working.

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct ModelFile { pub name: &'static str, pub url: &'static str, pub bytes: u64, pub sha256: &'static str, pub megabytes: u64 }

pub const STANDARD: ModelFile = ModelFile {
    name: "ggml-base.bin",
    url: "https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-base.bin",
    bytes: 147_951_465,
    sha256: "60ed5bc3dd14eea856493d334349b405782ddcaf0028d4b5df4088345fba2efe",
    megabytes: 148,
};
pub const BEST: ModelFile = ModelFile {
    name: "ggml-large-v3-turbo-q5_0.bin",
    url: "https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-large-v3-turbo-q5_0.bin",
    bytes: 574_041_195,
    sha256: "394221709cd5ad1f40c46e6031ca61bce88931e6e088c188294c6d5a55ffa7e2",
    megabytes: 574,
};

/// The setting talk.accuracy.
pub const KEY: &str = "talk.accuracy";
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Accuracy { Standard, Best }
/// The setting's value: "best" is Best, anything else (unset, damaged) is Standard.
pub fn accuracy_from(v: &serde_json::Value) -> Accuracy { if v.as_str() == Some("best") { Accuracy::Best } else { Accuracy::Standard } }

/// Which file to load: Best only once it is here and checked, else Standard (so talking keeps working during the download).
pub fn to_load(a: Accuracy, best_ready: bool) -> &'static ModelFile { if a == Accuracy::Best && best_ready { &BEST } else { &STANDARD } }

/// What a change of the setting does: Best picked and not here yet starts its download; Standard picked frees Best's file.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum OnChange { DownloadBest, DeleteBest, Nothing }
pub fn on_change(now: Accuracy, best_ready: bool) -> OnChange {
    match now { Accuracy::Best if !best_ready => OnChange::DownloadBest, Accuracy::Standard => OnChange::DeleteBest, _ => OnChange::Nothing }
}
/// A Best download that finished after the person switched back to Standard is not kept.
pub fn keep_finished_best(now: Accuracy) -> bool { now == Accuracy::Best }

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn m89_both_files_are_pinned_by_size_and_fingerprint_from_the_same_repo() {
        for f in [STANDARD, BEST] {
            assert!(f.url.starts_with("https://huggingface.co/ggerganov/whisper.cpp/resolve/main/") && f.url.ends_with(f.name), "{}", f.name);
            assert_eq!(f.sha256.len(), 64);
            assert!(f.sha256.chars().all(|c| c.is_ascii_hexdigit() && !c.is_ascii_uppercase()));
            assert_eq!(f.megabytes, (f.bytes as f64 / 1e6).round() as u64);
        }
        assert_eq!((BEST.bytes, BEST.sha256), (574_041_195, "394221709cd5ad1f40c46e6031ca61bce88931e6e088c188294c6d5a55ffa7e2"));
        // The Standard file is the one voice_mac.rs has always used.
        assert_eq!((STANDARD.name, STANDARD.bytes, STANDARD.sha256), (crate::voice_mac::MODEL_NAME, crate::voice_mac::MODEL_BYTES, crate::voice_mac::MODEL_SHA256));
    }
    #[test]
    fn m89_best_is_used_only_once_it_is_here_and_standard_keeps_working_meanwhile() {
        assert_eq!(accuracy_from(&serde_json::json!("best")), Accuracy::Best);
        for v in [serde_json::json!("standard"), serde_json::Value::Null, serde_json::json!(3), serde_json::json!("BEST")] { assert_eq!(accuracy_from(&v), Accuracy::Standard, "{v}"); }
        assert_eq!(to_load(Accuracy::Best, true), &BEST);
        assert_eq!(to_load(Accuracy::Best, false), &STANDARD);
        assert_eq!(to_load(Accuracy::Standard, true), &STANDARD);
    }
    #[test]
    fn m89_picking_best_downloads_it_switching_back_frees_it_and_a_late_download_is_not_kept() {
        assert_eq!(on_change(Accuracy::Best, false), OnChange::DownloadBest);
        assert_eq!(on_change(Accuracy::Best, true), OnChange::Nothing);
        assert_eq!(on_change(Accuracy::Standard, true), OnChange::DeleteBest);
        assert_eq!(on_change(Accuracy::Standard, false), OnChange::DeleteBest);
        assert!(keep_finished_best(Accuracy::Best));
        assert!(!keep_finished_best(Accuracy::Standard));
    }
    #[test]
    fn m89_delete_everything_takes_both_models() {
        let home = std::path::Path::new("/Users/x");
        let data = home.join("Library/Application Support/dev.companion.app");
        let speech = crate::wipe::items(home, &data).into_iter().find(|i| i.id == "speech").unwrap();
        assert!(speech.paths.iter().any(|p| data.join("models").join(BEST.name).starts_with(p)), "the models folder holds both");
    }
}
