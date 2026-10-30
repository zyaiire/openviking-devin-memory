# openviking-devin-memory

Community OpenViking memory integration for [Devin](https://devin.ai/) (Cognition).

Gives Devin automatic recall / capture plus OpenViking MCP tools where the host allows — the same class of experience as the official Cursor / Codex memory plugins, maintained as a community project.

## Status

Scaffold only. Host contract, MVP scope, and upstream PR plan are still open. This repo is the current priority over `openviking-droid-memory`.

## Planned shape

- Public repo (this one): community install path and release cadence
- Upstream: thin host adapter PR into [`volcengine/OpenViking`](https://github.com/volcengine/OpenViking) once MVP is verified

## Local workflow (not published)

Trellis / GitButler agent scaffolding may live on this machine under ignored paths. Do not commit `.trellis/` or private agent hooks to the public remote.

## Not yet

- Host contract (hooks / MCP / session APIs Devin actually exposes)
- Adapters, installer, doctor
- Verified Devin version matrix
- Link from OpenViking community-plugins docs

## License

TBD (likely Apache-2.0 to match OpenViking).
