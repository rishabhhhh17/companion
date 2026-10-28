// Opens Settings in its own window (27 Oct 2026; notch apps keep their settings in a normal window, never in the notch).
// Home and the island call this on the person's press; the shell refuses any other window (settingswin.rs `may_open`).
import { invoke } from "./tauri.ts";

export const openSettingsWindow = (): Promise<unknown> => invoke("open_settings_window");
