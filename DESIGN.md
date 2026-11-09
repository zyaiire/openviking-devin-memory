# Devin host contract (provisional)

Status: **locked product choices + implementation decisions (2026-11-09) + partial local inspection**.
Capture decode is still unproven: the local `sessions.db` has never held a real conversation row. Re-verify against a real local session, then replace “provisional / unverified” notes with measured facts.

Working baseline for the next fixture pass (2026-11-09):

| Item | Value |
| --- | --- |
| Devin CLI (Homebrew) | `3000.11.205` |
| Devin Desktop bundled binary (`/Applications/Devin.app/.../devin acp`) | `3000.11.238` |
| `sessions.db` schema migration (`refinery_schema_history` max version) | `20` (`live_row_times`) |
| Node target | 18+ for profile / recall / MCP; capture needs a Node with `node:sqlite` (exact floor measured in Phase 3) |

Versions move fast (205, 216, 234 and 238 all appeared in one week of local logs), so the **schema migration number is the test baseline**, not the CLI version.

## Product contract (locked)

- Install as a Devin plugin: `.devin-plugin/plugin.json` + `hooks.json` + `.mcp.json` + skills (`devin plugins install …`).
- Capability bar matches community ZCode / Kimi: SessionStart profile · UserPromptSubmit recall · Stop capture · MCP tools / memory skills.
- Runtime: **local Devin CLI / Desktop only**. No Devin Cloud auto-hooks in v1. If Phase 1 shows plugin hooks do not fire under Desktop (ACP mode), v1 narrows to **CLI only**.
- Shared runtime: pin and **vendor** OpenViking's shared hook runtime into this repo (see Vendor layout). This adapter owns only Devin event mapping, `sessions.db` decoding, and commit policy.
- Capture authority: durable full conversation text. Stop stdin is **trigger + metadata only**, never the transcript itself.
- Capture source (v1): **`sessions.db` only**. Do not implement ATIF / `devin --export` as a parallel path (community Kimi/ZCode each have one primary on-disk store; ZCode’s stdin fallback is compatibility, not a second product store).
- Delivery shape toward OpenViking: decode host rows into unified turns `{ role, content, turn_id? }`, then `addAgentMessages` / `commitAgentSession` like Kimi — do **not** upload raw SQLite rows.

## Hooks (documented; re-measure on pin)

Source: [Devin CLI hooks](https://docs.devin.ai/cli/extensibility/hooks/overview), [configuration](https://docs.devin.ai/cli/reference/configuration), plus local CLI logs.

- Documented events: `PreToolUse`, `PostToolUse`, `PermissionRequest`, `UserPromptSubmit`, `Stop`, `PostCompaction`, `SessionStart`, `SessionEnd` (not fired in cloud sessions).
- The 3000.11.205 config parser additionally accepts `PreCompact`, `PostCompact`, `Notification`, `SubagentStop`. `PreCompact` is undocumented — **verify it actually fires**. There is **no** `Interrupt` event.
- Stdin carries `hook_event_name`, `session_id` (stable per session) and `prompt_id` (rotated on every user prompt; absent on `SessionStart`). No `cwd` / `transcript_path`.
- `DEVIN_PROJECT_DIR` is set for hook processes. The shared runtime resolves cwd from `input.cwd` → `workspace_roots` → `CURSOR_PROJECT_DIR` → `process.cwd()`, so the adapter's `normalizeInput` copies `DEVIN_PROJECT_DIR` into `cwd`.
- Context injection: `{ "hookSpecificOutput": { "hookEventName", "additionalContext" } }` for `SessionStart` and `UserPromptSubmit`.
- Hook timeout is in seconds. Exit code 2 blocks; any other non-zero exit is logged and ignored. Hooks are **fail-open / best-effort**: OpenViking down must not break Devin.
- Hook sources: Devin's own config files plus Claude Code files (`.claude/settings*.json`, `~/.claude.json`), the latter gated by `read_config_from.claude`. Cursor's `hooks.json` is **not** a hook source, so the Cursor OpenViking hooks never run inside Devin.

## Conversation store (partially inspected)

Path on this macOS machine (shared by CLI and Desktop’s bundled `devin acp`):

```text
~/.local/share/devin/cli/sessions.db   (+ sessions.db-wal, sessions.db-shm)
```

Linux follows `$XDG_DATA_HOME/devin/cli/…`; Windows is unchecked. Resolve path: documented env override if any → platform default → fail-open skip capture.

**WAL matters:** the main file is a 4 KB shell with no tables; schema and all rows live in `sessions.db-wal` until a checkpoint. Any reader that ignores the WAL (copying the `.db` alone, sql.js) sees an empty database.

Tables of interest:

- `sessions` — `id`, `working_directory`, `main_chain_id`, `hidden`, `metadata`, …
- `message_nodes` — `session_id`, `node_id` (`UNIQUE(session_id, node_id)`), `parent_node_id`, `chat_message` (JSON text), `created_at`, `metadata`.
- `subagent_heads` — subagent chains share the session’s message forest.
- `refinery_schema_history` — schema migration numbers (compatibility gate).
- Built-in FTS triggers index only `role = 'assistant'`, or `role = 'user'` with `metadata.is_user_input = 1`, where `content` is non-empty text.

## Implementation decisions (2026-11-09)

**SQLite reader.** Use Node’s built-in `node:sqlite`, opened read-only on the original path so the WAL is included. Never copy the DB elsewhere. If `node:sqlite` is unavailable, skip capture and log why; profile, recall and MCP still run on Node 18. No sql.js, no better-sqlite3, no `sqlite3` CLI fallback.

**Turn decoding** (mirrors Kimi `kimicode-turns.mjs` and ZCode `zcode-turns.mjs`):

1. `turn_id` is `chat_message.message_id` (a UUID Devin stores on every message). Devin rebuilds context by copying nodes; copies keep the same `message_id` and identical content, so `${turn_id}:${role}` dedups them. The adapter never invents turn ids from `node_id` or positions. Hook `prompt_id` is not persisted in the DB and is not used as `turn_id`.
2. If a message lacks `message_id`, send it without `turn_id`; the shared `incremental-turn-capture.mjs` then dedups by `stableHash(role, content)`, as upstream does when a host id is missing.
3. Walk the main chain only: start at `sessions.main_chain_id` and follow `parent_node_id` to the root. Never scan all rows (old rebuilt chains remain as separate roots). Skip subagent and summarizer chains. Compaction starts a new root chain whose summary node (role `system`, node `metadata.summarized_from = <old tip node_id>`) replaces the history; when the walk meets `summarized_from`, continue the walk from that old tip so pre-compaction turns stay reachable without depending on the `PreCompact` hook.
4. Keep only `role = 'user'` with `metadata.is_user_input = true`, and `role = 'assistant'` with non-empty string `content`. Drop `system` (also injected mid-chain), `tool`, and assistant rows that only carry `tool_calls`.
5. One message is one turn (each has its own `message_id`); assistant messages are not merged.
6. Strip plugin-injected blocks (`<openviking-context>`, `<relevant-memories>`, `<system-reminder>`) before sending.

**Branches.** After a rewind or edit, already-sent turns from the abandoned branch stay in OpenViking (no retraction). If the cursor is not on the current main chain, rescan the chain from the start and rely on the acknowledged set to suppress duplicates — the upstream Kimi/ZCode behavior.

**Commit policy** (rule decided now, outcome measured in Phase 1):

| Phase 1 result | Policy |
| --- | --- |
| `SessionEnd` fires on `/exit`, Ctrl-C and closing the Desktop window | Kimi: Stop only appends; commit on `SessionEnd` and `PreCompact` |
| Any of those exits does not fire `SessionEnd` | ZCode: commit on every Stop that sent new turns |

**Compatibility gate.** Before each capture, check that the needed columns (`message_nodes.node_id`, `parent_node_id`, `chat_message`, `sessions.main_chain_id`) and JSON paths (`$.role`, `$.content`, `$.metadata.is_user_input`) exist. Missing → skip capture and log “unknown schema”. Higher migration number with all fields present → capture and log a warning.

**MCP duplication.** Devin imports Cursor’s MCP servers by default (`read_config_from.cursor`), so a user with Cursor OpenViking already gets Cursor’s `mcp-proxy.mjs` inside Devin. The plugin still ships its own `openviking` server (same upstream proxy, same OpenViking backend); no detection code. README notes that `read_config_from.cursor: false` removes the imported copy.

## Vendor layout

Pinned to an OpenViking main-repo commit, copied verbatim, mirroring Kimi’s installed layout so upstream relative imports resolve unchanged:

```text
agent-integrations/
  PIN.md                          upstream commit + list of verbatim files (do not edit)
  memory-plugin-shared/lib/       verbatim (24 files per lib/MANIFEST)
  devin/
    scripts/                      verbatim (hook.mjs, request-budget.mjs, uri-guard.mjs, …)
    servers/                      verbatim (mcp-proxy.mjs)
    hosts/
      incremental-turn-capture.mjs  verbatim
      index.mjs                     ours: export const HOSTS = { devin }
      devin.mjs                     ours: host object (stages, envelope, prompt, capture, normalizeInput)
      devin-turns.mjs               ours: sessions.db decoder
```

The shared runtime treats the client id as a free string (state under `~/.openviking/hook-state/devin/`, log `devin-hooks.log`), so adding `devin` needs no vendor patch.

## Explicit non-goals (v1)

- Devin Cloud auto memory.
- ATIF / `--export` capture path.
- Treating Stop stdin as the full transcript.
- Retracting abandoned-branch content from OpenViking.
- Detecting or de-duplicating MCP servers imported from other tools.
- Waiting on upstream reply before implementing (still open an OV issue first).

## Phase 1 sampling matrix (must pass before claiming capture)

- [x] Record CLI version, Desktop bundled version and schema migration number. CLI 3000.11.205, Desktop bundled 3000.11.238, schema 20.
- [x] CLI chat: rows exist **when Stop fires** (2026-11-09, `devin -p` and `devin -c -p` in a lab dir; Stop saw `main_chain_id` pointing at the final assistant reply). CLI itself runs through `devin acp`. Hook stdin: SessionStart `{source: startup|resume}` without `prompt_id`; UserPromptSubmit `{prompt, prompt_id}`; Stop `{stop_hook_active, last_assistant_message, prompt_id}`; SessionEnd `{reason, prompt_id}`. `DEVIN_PROJECT_DIR` and cwd are set. SessionStart fires before any rows exist.
- [x] Desktop (bundled `devin acp`, 2026-11-09): hooks fire and rows exist when Stop fires, so v1 keeps Desktop. The lab was attached as an additional workspace dir (session `working_directory` = the window's main folder, `workspace_dirs` = lab); its project hooks registered after session creation, so `SessionStart` did not fire, while `UserPromptSubmit`, `Stop` and `SessionEnd` did, with `DEVIN_PROJECT_DIR` = the lab dir. Whether installed-plugin hooks get `SessionStart` under Desktop is checked in Phase 3; the hook must locate the session by `session_id`, not by directory.
- [x] One chat with tool calls: main-chain walk plus the filter in decoding rule 4 yields exactly the on-screen user prompts and assistant replies (also checked on two older real sessions: user inputs on chain = `prompt_history` count). Subagent not yet sampled.
- [x] Per-turn id: hook `prompt_id` is **not** persisted (no match anywhere in the DB; user messages carry a different `from_event_id`). Every message has a stable `message_id` → decoding rule 1.
- [x] `devin -p` exit fires `SessionEnd` with `reason: "other"`. On resume (`-c`) Devin copies the last node (new `node_id`, same `message_id`) before the new prompt.
- [ ] One rewind/edit: does Devin branch (new node) or rewrite the row in place?
- [x] One compaction (manual `/compact`, 2026-11-09): `PreCompact` fires while `main_chain_id` still points at the old tip; then `PostCompaction` and `PostCompact`. Old rows are kept, not rewritten or deleted. The new main chain is system prefix + summary node with `summarized_from` → decoding rule 3. `PreCompact`/`PostCompact` stdin also carries `trigger`, `cwd`, `model`, `turn_id` (equals the hook `prompt_id`) and `transcript_path` (`~/.local/share/devin/cli/transcripts/<id>.json`, `schema_version: ATIF-v1.7`); the transcript is not used (ATIF is out of scope).
- [x] `/exit`, Ctrl-C and closing the Desktop window: which fire `SessionEnd` (selects commit policy). CLI: `/exit` and Ctrl-C both fired `SessionEnd` with `reason: "prompt_input_exit"` (user-confirmed which session used which); `-p` fires `reason: "other"`. Desktop: quitting dispatches `SessionEnd` (`reason: "other"`) for every live session of that `devin acp` process. All sampled exits fire `SessionEnd` → **Kimi policy selected**. Known gap: a long-running Desktop commits only when it quits, and a crash/kill fires nothing.
- [x] Other hook sources seen in the user environment: global Devin and Windsurf hooks (status-bar bridges, no OpenViking). `~/.claude/settings.json` fails to import into Devin (`unknown variant SubagentStart`), so Claude-side hooks do not run in Devin.
- [ ] Plugin `openviking` MCP alongside Cursor’s imported `openviking`: overridden, coexisting, or error.
- [ ] Anonymized fixture: hook stdin samples + DB slice + expected turns golden.
- [ ] Incremental cursor does not double-send on repeated Stop; fail-open when DB missing / locked / unknown schema.

## References

- This repo: [[README.md]], [[specs/devin-ov-memory-mvp.md]]
- Pattern hosts: OpenViking `examples/agent-hook-plugin/hosts/kimicode/DESIGN.md`, `kimicode-turns.mjs`, `zcode-turns.mjs`, `incremental-turn-capture.mjs`, `scripts/hook.mjs`
- Devin docs: [hooks overview](https://docs.devin.ai/cli/extensibility/hooks/overview), [configuration](https://docs.devin.ai/cli/reference/configuration)
- Local store observed: `~/.local/share/devin/cli/sessions.db`
