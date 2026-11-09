# openviking-devin-memory

Community OpenViking memory integration for [Devin](https://devin.ai/) (Cognition).

Gives Devin automatic recall / capture plus OpenViking MCP tools where the host allows — the same class of experience as the official Cursor / Codex memory plugins, maintained as a community project.

## Status

Research complete enough to proceed with a **scoped MVP**. There is **no** official OpenViking Devin host and **no** product-related Devin issue/PR on [`volcengine/OpenViking`](https://github.com/volcengine/OpenViking) (as of 2026-10-30).

Devin’s public surface already has plugins, lifecycle hooks, and MCP — a community plugin is realistic. Capture must not be claimed until the local session store is fixture-tested.

## Findings (host)

- Package as a Devin plugin: `.devin-plugin/plugin.json` + hooks + `.mcp.json` + skills (`devin plugins install …`).
- Hook events include `SessionStart`, `UserPromptSubmit`, `Stop`, `SessionEnd`, `PreToolUse` / `PostToolUse`, and compaction events (`PreCompact`, `PostCompact`, `PostCompaction` — observed on CLI 3000.11.205).
- Hook stdin carries `session_id` / `prompt_id`; Stop stdin has **no** `transcript_path`. Use `DEVIN_PROJECT_DIR`. The full conversation lives in SQLite (`~/.local/share/devin/cli/sessions.db`), shared by CLI and Desktop — see [DESIGN.md](DESIGN.md).
- Plugin hooks are **fail-open** and currently strongest on **local CLI / Desktop**; cloud sessions differ — keep cloud auto-lifecycle out of v1 branding unless verified.
- Upstream contribution path: host contract DESIGN → prefer later `examples/agent-hook-plugin/hosts/devin` (or AstrBot-style external listing) → bilingual community-plugins docs; open an OV issue before a large PR. Integration reviewers include `@t0saki`, `@ZaynJarvis`.

## Planned shape

- **This public repo**: Devin-native plugin, community release cadence
- **Upstream**: thin `hosts/devin` (or docs link) into OpenViking once MVP is verified

## First milestone (MVP)

1. SessionStart profile injection + UserPromptSubmit recall
2. Stdio (or HTTP) OpenViking MCP proxy + memory skills
3. Defer durable capture/commit until `sessions.db` (or equivalent) decode is fixture-tested
4. Open an OpenViking feature issue describing the community Devin adapter

## Not yet

- Pinned Devin CLI version + verified hook envelopes / compaction event names
- SQLite transcript decoder + capture fixtures
- Installer / doctor
- Upstream PR + community-plugins docs link

## License

TBD (likely Apache-2.0 to match OpenViking).
