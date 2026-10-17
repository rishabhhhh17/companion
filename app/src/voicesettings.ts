// Voice settings (M11 wave 4, item 2), page side: what the app says about the Mac's voices and microphones, read safely,
// and every line about them in plain words. The app keeps the choices on this Mac (voice.json) and applies them
// (app/src-tauri/src/voiceset.rs); nothing here makes a sound or listens.
import { S } from "./strings.ts";

export type VoiceChoice = { id: string; name: string; lang: string; quality: number };
export type MicChoice = { id: string; name: string };
export type Sound = "on" | "muted" | "zero" | "none";
/** What `voice_settings` answers (voiceset::state_json): the lists, what is picked (null: the Mac's own), what is away. */
export type VoiceSettings = {
  voices: VoiceChoice[]; macLang: string; voice: string | null; voiceMissing: string | null; voiceUsing: string | null;
  speed: number; speeds: number[]; inputs: MicChoice[]; defaultInput: string | null; mic: string | null; micMissing: string | null;
  language: string; languages: string[]; sound: Sound;
};
const SPEEDS = [0.5, 0.75, 1, 1.25, 1.5];
export const VOICE_START: VoiceSettings = {
  voices: [], macLang: "", voice: null, voiceMissing: null, voiceUsing: null, speed: 1, speeds: SPEEDS, inputs: [], defaultInput: null,
  mic: null, micMissing: null, language: "auto", languages: ["auto"], sound: "on",
};

const text = (v: unknown): string | null => (typeof v === "string" && v.length > 0 ? v : null);
/** What the app answered, read safely. Anything that cannot be read keeps the Mac's own choices, and nothing is said to be
 *  away or off unless the app clearly said so. */
export function voiceSettingsFrom(v: unknown): VoiceSettings {
  if (typeof v !== "object" || v === null || Array.isArray(v)) return VOICE_START;
  const o = v as Record<string, unknown>;
  const list = (x: unknown) => (Array.isArray(x) ? x.filter((e): e is Record<string, unknown> => typeof e === "object" && e !== null) : []);
  const voices = list(o.voices).filter((e) => text(e.id) && text(e.name)).map((e) => ({ id: e.id as string, name: e.name as string, lang: typeof e.lang === "string" ? e.lang : "", quality: typeof e.quality === "number" ? e.quality : 1 }));
  const inputs = list(o.inputs).filter((e) => text(e.id) && text(e.name)).map((e) => ({ id: e.id as string, name: e.name as string }));
  const speeds = Array.isArray(o.speeds) ? o.speeds.filter((n): n is number => typeof n === "number" && SPEEDS.includes(n)) : [];
  const languages = Array.isArray(o.languages) ? o.languages.filter((l): l is string => typeof l === "string" && /^[a-z]{2,4}$/.test(l)) : [];
  const sound = (["on", "muted", "zero", "none"] as const).find((s) => s === o.sound) ?? "on";
  return {
    voices, macLang: typeof o.macLang === "string" ? o.macLang : "", voice: text(o.voice), voiceMissing: text(o.voiceMissing), voiceUsing: text(o.voiceUsing),
    speed: typeof o.speed === "number" && SPEEDS.includes(o.speed) ? o.speed : 1, speeds: speeds.length ? speeds : SPEEDS,
    inputs, defaultInput: text(o.defaultInput), mic: text(o.mic), micMissing: text(o.micMissing),
    language: typeof o.language === "string" && languages.includes(o.language) ? o.language : "auto", languages: languages.includes("auto") ? languages : ["auto", ...languages], sound,
  };
}

/** A language code in words, from the Mac's own names for languages ("en-GB" gives English and the place). */
function langWords(code: string): string {
  try { return new Intl.DisplayNames(["en"], { type: "language", languageDisplay: "standard" }).of(code) ?? code; } catch { return code; }
}
/** "Ava, English (United States), enhanced". The quality is said only when better than the default, and not twice. */
export function voiceLabel(v: VoiceChoice): string {
  const q = v.quality >= 3 ? S.voiceQualityPremium : v.quality === 2 ? S.voiceQualityEnhanced : "";
  const says = q && !v.name.toLowerCase().includes(q);
  return [v.name, v.lang ? langWords(v.lang) : "", says ? q : ""].filter(Boolean).join(", ");
}
export const speedLabel = (n: number): string => S.voiceSpeedNames[String(n)] ?? S.voiceSpeedOther(n);
export const languageLabel = (code: string): string => (code === "auto" ? S.voiceLanguageAuto : S.voiceLanguageNames[code] ?? code);

/** The picked voice is gone from this Mac: which one, and what speaks instead. Empty when nothing is away. */
export const voiceLine = (s: VoiceSettings): string => (s.voiceMissing ? S.voiceMissingLine(s.voiceMissing, s.voiceUsing) : "");
/** The picked microphone is not connected (the default listens until it is back), or there is no microphone at all. */
export function micLine(s: VoiceSettings): string {
  if (s.inputs.length === 0) return S.micNone;
  return s.micMissing ? S.micMissingLine(s.micMissing, s.defaultInput) : "";
}
export const micDefaultLabel = (s: VoiceSettings): string => (s.defaultInput ? S.micDefaultNamed(s.defaultInput) : S.micDefault);
/** The Mac's sound is off: spoken lines are shown as words only, and what to do. Empty when the sound is on. */
export const soundLine = (sound: Sound): string => ({ on: "", muted: S.soundMuted, zero: S.soundZero, none: S.soundNone })[sound];
/** Why a change was not kept, from the code the app sends (set_voice_settings and voiceset::apply). */
export function voiceProblem(code: string): string {
  if (code === "not_saved") return S.voiceNotSaved;
  if (code === "unknown_voice" || code === "unknown_mic") return S.voiceGone;
  return S.voiceSaveFailed;
}
/** What Settings sends for one change: everything else exactly as it is, so changing the speed keeps a voice or a
 *  microphone that is away for now (the app keeps it when it is the one already picked). */
export function voiceAsk(s: VoiceSettings, change: Partial<Pick<VoiceSettings, "voice" | "speed" | "mic" | "language">>) {
  return { voice: s.voice, speed: s.speed, mic: s.mic, language: s.language, ...change };
}
