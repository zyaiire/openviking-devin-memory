# Working in this repo

Community OpenViking memory plugin for local Devin (CLI and Desktop). Host contract and decisions: [DESIGN.md](DESIGN.md). Phase plan: [specs/devin-ov-memory-mvp.md](specs/devin-ov-memory-mvp.md).

## Layout

- `plugin/` is the installable Devin plugin (`devin plugins install zyaiire/openviking-devin-memory#plugin`). Only runtime files go here: Devin injects a plugin-root `AGENTS.md` into every user session, so contributor docs stay at the repo root.
- `plugin/agent-integrations/memory-plugin-shared/`, the upstream files under `plugin/agent-integrations/devin/`, and `plugin/skills/` are vendored from OpenViking. Never edit them; bump the pin as described in [plugin/agent-integrations/PIN.md](plugin/agent-integrations/PIN.md).
- Devin-specific code is `plugin/agent-integrations/devin/hosts/index.mjs`, `devin.mjs` and `devin-turns.mjs`.

Tests live in `tests/` (`npm test`, Node 22.13+ for `node:sqlite`). `tests/fixtures/` holds synthetic `sessions.db` slices and hook stdin shaped like measured Devin data.

## Rules

- Node 18+ for hooks and the MCP proxy. Capture reads `sessions.db` with built-in `node:sqlite`, which needs a newer Node; without it capture is skipped, nothing else breaks.
- Hooks fail open: any error exits 0 with no output, never blocking Devin.
- Capture reads only `~/.local/share/devin/cli/sessions.db`, opened read-only in place. No ATIF / `--export` path.
- Never commit OpenViking credentials, `ovcli.conf`, `.env` files, or real `sessions.db` content. Fixtures must be anonymized.
