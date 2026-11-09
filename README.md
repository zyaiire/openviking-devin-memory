# openviking-devin-memory

Community [OpenViking](https://github.com/volcengine/OpenViking) memory plugin for local [Devin](https://devin.ai/) (CLI and Desktop).

It gives Devin the same automatic memory the OpenViking Cursor, Kimi Code and ZCode integrations have. Upstream tracking issue: [volcengine/OpenViking#7267](https://github.com/volcengine/OpenViking/issues/7267).

## What it does

| When | What happens |
| --- | --- |
| Session starts | Your OpenViking profile is injected as context. |
| You send a prompt | Memories relevant to the prompt are recalled and injected. |
| A turn ends (`Stop`) | New user prompts and assistant replies are read from Devin's local `~/.local/share/devin/cli/sessions.db` and sent to OpenViking. |
| Session ends, or before compaction | The OpenViking session is committed, so memories get extracted. |
| Any time | `openviking` MCP tools (search, read, remember, …) and four skills: `openviking-memory`, `openviking-skills`, `ov-experience-memory`, `openviking-rule-search`. |

Every hook fails open: if OpenViking is down or anything goes wrong, Devin carries on with no output from the plugin.

## Install

```sh
devin plugins install zyaiire/openviking-devin-memory#plugin
# or from a checkout
devin plugins install --local ./plugin
```

Requirements:

- An OpenViking server, configured in `~/.openviking/ovcli.conf` (the same file other OpenViking integrations use).
- Node on `PATH`: 18+ for context injection and MCP; 22.13+ for capture, which uses the built-in `node:sqlite`. On older Node, capture is skipped and everything else works.

## Configuration notes

- Turn capture off with `{"plugin": {"devin": {"autoCapture": false}}}` in `ovcli.conf`, or `OPENVIKING_AUTO_CAPTURE=false`.
- If you also use OpenViking in Cursor, Devin imports Cursor's `openviking` MCP server and skips the plugin's (same backend, so tools still work). Set `read_config_from.cursor: false` in Devin's config to use the plugin's.
- Capture reads `sessions.db` read-only and in place. Override the path with `OPENVIKING_DEVIN_SESSIONS_DB`.

## Limits

- Local CLI and Desktop only; Devin Cloud sessions are not covered.
- A long-running Desktop app commits when it quits. A crash or force-kill fires no `SessionEnd`: turns already sent stay in OpenViking but are not committed until that session ends normally (for example after resuming it).
- After a rewind or edit, turns already sent from the abandoned branch stay in OpenViking.
- No doctor command yet; the upstream doctor does not know the `devin` client.

## Development

- Host contract and measured Devin behavior: [DESIGN.md](DESIGN.md). Contributor rules: [AGENTS.md](AGENTS.md).
- `npm test` runs the decoder and host tests against synthetic fixtures (Node 22.13+).
- The OpenViking runtime under `plugin/agent-integrations/` and `plugin/skills/` is vendored verbatim; see [PIN.md](plugin/agent-integrations/PIN.md).

## License

[Apache-2.0](LICENSE). The vendored OpenViking runtime is Apache-2.0 from upstream `examples/`.
