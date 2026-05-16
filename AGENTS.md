# AGENTS.md

## Project Shape

- This is an npm package that exposes an opencode provider by wrapping the Claude Code CLI (`claude`), not the Anthropic HTTP API directly.
- Package entrypoint is `src/index.ts`; runtime provider behavior lives mostly in `src/claude-code-language-model.ts`.
- `src/message-builder.ts` owns AI-SDK prompt → Claude CLI stream-json message conversion, including `/compact` transcript rendering.
- `src/session-manager.ts` owns Claude CLI process reuse, session ids, LRU eviction, and CLI arg construction.
- `src/cli-version.ts` gates optional CLI flags. Do not pass newly-added Claude CLI flags unconditionally.
- Build output is `dist/`, is gitignored, and is rebuilt by CI. Do not commit `dist/`.

## Commands

- Typecheck: `npm run typecheck` (`tsc --noEmit`).
- Test suite: `npm test`.
- Single focused test file: `npx tsx --test test-get-claude-user-message.ts` (replace file as needed).
- Build: `npm run build` (`tsup`, emits ESM + d.ts to `dist/`).
- Before release, run: `npm run typecheck && npm test && npm run build`.
- There is no lockfile. CI uses Node 24 and runs `npm install`, then `npm run build`.

## Release Workflow

- Never run `npm publish` manually. Tag push triggers `.github/workflows/publish.yml`, which publishes to npm.
- Release flow: commit code/docs, then `npm version patch` (or minor/major), then `git push origin master --follow-tags`.
- `npm version` creates the version commit and annotated `v*` tag. Prior release commit/tag messages are `v0.x.y`; keep that style.
- After pushing a release tag, confirm the publish workflow with `gh run list --repo khalilgharbaoui/opencode-claude-code-plugin --limit 3`.
- Do not add a Claude co-author trailer to commits.
- Keep `README.md` updated when adding public options, env vars, required CLI versions, or behavior users can observe.

## High-Signal Runtime Gotchas

- The `chat.params` hook tags opencode's active agent (`default`, `compaction`, `title`, etc.) into provider options. Write to `output.options` at the top level. opencode wraps that bag under the provider id later. Do not pre-nest under `output.options[providerID]`, or the model sees `providerOptions[id][id]`.
- `/compact` must not fall through the no-tools title stub. It is detected via `opencodeAgent === "compaction"`, runs through `doStream`, uses a fresh short-lived Claude CLI process, skips MCP/proxy/tool wiring, and defaults to `claude-haiku-4-5`.
- Compaction model precedence is: `CLAUDE_CODE_COMPACTION_MODEL` env var, then `compactionModel` provider option, then default `claude-haiku-4-5`.
- Opus 4.7 omits thinking summaries by default. The plugin asks for summaries with `--thinking-display summarized`, but only when `src/cli-version.ts` confirms Claude Code CLI >= 2.1.142. Older CLIs must skip that flag instead of crashing.
- Respect user Claude Code env vars. Do not delete or override `CLAUDE_CODE_DISABLE_THINKING`, `CLAUDE_CODE_DISABLE_ADAPTIVE_THINKING`, or explicit `CLAUDE_CODE_SHOW_THINKING_SUMMARIES` values.
- Reasoning stream parts are only started after the first non-empty `thinking_delta`. This prevents empty Thinking rows when the CLI opens a thinking block but streams no text.
- `signature_delta` is expected encrypted thinking metadata. Ignore it quietly; do not treat it as an error.
- Claude CLI emits internal tools (`Agent`, `ToolSearch`, `AskFollowupQuestion`, `TaskCreate`, `TaskUpdate`, `TaskList`, `TaskGet`, `TaskStop`) that have no opencode registry entry. They live in `CLAUDE_INTERNAL_TOOLS` in `src/tool-mapping.ts` and must be skipped, not forwarded. Forwarding them surfaces `⚙ invalid` tool rows in opencode. `TaskOutput` is the exception: it stays mapped to a `bash echo` so the result is visible.
- Verified compatible with opencode v1.15.0 (audit 2026-05-16). `ProviderV2` hook gained an optional `ctx` arg we ignore; `McpStatus` expanded to 5 variants but `enabled: status === "connected"` in `mcp-bridge.ts` still collapses non-connected to `false` correctly. opencode's `tools` argument to `doStream` is intentionally unused — Claude CLI only sees its own built-ins plus MCP servers bridged via `--mcp-config`, so opencode-native tools like `task_status` never reach the model and need no `mapTool` entry. Re-audit at the next opencode minor bump.
- `cwd` resolution at spawn must stay lazy. `opencodeProjectDirectory` captured from `PluginInput.directory` lives in `runtime-status.ts` and is consumed via `resolveSpawnCwd()` at spawn time only as a fallback when `process.cwd()` is unusable (`/`). Do NOT bake the captured value into `mergedOptions.cwd` during provider registration in `index.ts` — that freezes it at plugin init and breaks workspace switching mid-session. The v0.2.4 fix did exactly this and it shipped as the v0.4.21 regression report on issue #4. Tests live in `test-cwd-resolution.ts`.

## Tests To Touch When Editing

- Prompt/message conversion or compaction transcript behavior: `test-get-claude-user-message.ts`.
- Claude CLI arg construction / version-gated flags: `test-cli-args.ts`.
- Tool name/input mapping (`mapTool`, `CLAUDE_INTERNAL_TOOLS`): `test-tool-mapping.ts`.
- MCP bridge/proxy behavior: `test-bridge.ts`, `test-broker.ts`.
- Auto-continue / incomplete turn handling: `test-auto-continue.ts`, `test-has-new-user-content.ts`.
- Logger/env behavior: `test-logger.ts`.
- Spawn-time cwd resolution (`resolveSpawnCwd`, captured-directory fallback): `test-cwd-resolution.ts`.

## Known Follow-ups

- **Translate Claude CLI `Task*` family into opencode `todowrite` updates** (deferred). Today these are skipped via `CLAUDE_INTERNAL_TOOLS` so they don't render as `⚙ invalid`, but the user also doesn't see them in the opencode todo panel. If the CLI's system prompting shifts to prefer `Task*` over `TodoWrite` and the todo panel starts coming up empty, build a per-session task ledger in `src/tool-mapping.ts` (Claude emits granular create/update/stop; opencode's `todowrite` expects the full list each call) and re-emit as `todowrite` on each mutation. Requires status-field mapping, id strategy, ledger cleanup on session end/compaction, and live UI verification — `npm test` won't cover the panel rendering. Rough estimate: 1-3 hours.
