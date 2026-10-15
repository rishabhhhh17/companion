// Every model id Companion uses by default, in one place (T10: "keep model ids in config, not code"). The runner reads them
// here and the app's pages send the agent ones with each command. For testing, settings can switch them: COMPANION_MODEL for
// agent sessions, COMPANION_FAST_MODEL and COMPANION_VISION_MODEL for the two small lanes, COMPANION_AIM_MODEL for the
// experimental pointing lane (see engines.ts). Haiku 4.5 retires "not sooner than October 15, 2026": check before then.
export const MODELS = {
  // Agent sessions (Drive, Research, the practice fix). T10 names Opus 5.5 for planning; planning still uses this one today.
  agent: "claude-sonnet-5-5",
  // Rescue's diagnosis.
  diagnose: "claude-opus-5-5",
  // The second reviewer of risky changes (proof rung 7), when it is switched on.
  review: "claude-opus-5-5",
  // The fast lane: Prompt help, Explain, Draw it for me.
  fast: "claude-haiku-4-5-20251001",
  // The vision lane: Show me how.
  vision: "claude-sonnet-5-5",
  // The experimental pointing lane through the Computer Use tool (COMPANION_AIM=computer_use).
  aim: "claude-sonnet-5-5",
} as const;
