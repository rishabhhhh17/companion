@AGENTS.md

# Claude Code notes

Everything that applies to every coding agent lives in `AGENTS.md` (imported above). These notes are only for Claude Code.

**Plan mode.** Use plan mode for anything bigger than a small fix, and for the start of every milestone.

**Testing Companion with Claude Code itself.** Companion drives Claude Code through the Agent SDK, so tests and spikes run real Claude Code processes. In every one:
- Never use `bypassPermissions`.
- Use the SDK's bundled binary through `pathToClaudeCodeExecutable`, never the `claude` on your `PATH`.
- Keep `settingSources` explicit, and also set `strictMcpConfig: true`, `CLAUDE_CODE_DISABLE_AUTO_MEMORY=1` and `CLAUDE_CODE_SUBPROCESS_ENV_SCRUB=1`. `settingSources` alone does not stop the developer's claude.ai connectors or auto memory from loading. Check that `system/init` lists only the tools the test expects.
- Use a throwaway `CLAUDE_CONFIG_DIR` at a non default path for tests that don't need a real login. Tests that do need the founder's real plan login leave `CLAUDE_CONFIG_DIR` unset (never set it to `~/.claude`, which picks a different Keychain slot) and run as few times as possible.
- Never read credential files or Claude Code's Keychain item, never run `claude auth status` in a loop, and never sign the founder out of their real login.
- Keep keys out of the conversation: read them from the Keychain in code, never ask the founder to paste one into chat.

**Background work.** Long research or review tasks can run as background agents or workflows. Their results are drafts until checked against the research docs.
