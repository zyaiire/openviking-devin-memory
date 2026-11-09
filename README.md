# openviking-devin-memory

Community OpenViking memory integration for [Devin](https://devin.ai/) (Cognition).

Gives Devin automatic recall / capture plus OpenViking MCP tools where the host allows — the same class of experience as the official Cursor / Codex memory plugins, maintained as a community project.

## Status

Scaffold stage. There is no official OpenViking Devin host; the community adapter is tracked upstream in [volcengine/OpenViking#7267](https://github.com/volcengine/OpenViking/issues/7267).

The plugin installs and runs on local Devin CLI with the OpenViking runtime vendored from upstream. Capture (saving conversations) is not implemented yet: it stays off until the `sessions.db` decoder is fixture-tested.

## Install (development)

```sh
devin plugins install zyaiire/openviking-devin-memory#plugin
# or from a checkout
devin plugins install --local ./plugin
```

Needs Node 18+ on `PATH` and an OpenViking server configured in `~/.openviking/ovcli.conf`. If you also use OpenViking in Cursor, Devin imports Cursor’s `openviking` MCP server and skips the plugin’s; set `read_config_from.cursor: false` in Devin’s config to use the plugin’s.

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

- SQLite transcript decoder + capture fixtures
- Memory skills
- Doctor
- Upstream PR + community-plugins docs link

## License

Planned Apache-2.0 (root `LICENSE` not added yet). The vendored OpenViking runtime under `plugin/agent-integrations/` is Apache-2.0 from upstream `examples/` (see [PIN.md](plugin/agent-integrations/PIN.md)).
