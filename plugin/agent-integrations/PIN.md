# Vendored OpenViking runtime

Pinned to [`volcengine/OpenViking@d2ef5dfaa3952f550d7587a4ef465ae378d9d95b`](https://github.com/volcengine/OpenViking/tree/d2ef5dfaa3952f550d7587a4ef465ae378d9d95b) (2026-11-09, upstream version 0.5.31).

Every file below is an unmodified copy of upstream `examples/`, licensed Apache-2.0 (`LICENSE`, copied from upstream `examples/LICENSE`). Do not edit these files. To change one, bump the pin: re-copy every file from the new commit, update the commit and hashes here, and re-run the tests.

Only `devin/hosts/index.mjs`, `devin/hosts/devin.mjs` and `devin/hosts/devin-turns.mjs` are this project's own code.

## Files

The layout matches what the upstream installer assembles for a plugin host (Kimi Code, CodeBuddy), so the upstream relative imports resolve unchanged.

| Here | Upstream |
| --- | --- |
| `memory-plugin-shared/lib/*` | `examples/memory-plugin-shared/lib/*`, exactly the files listed in `lib/MANIFEST` |
| `devin/scripts/hook.mjs`, `request-budget.mjs`, `uri-guard.mjs` | `examples/agent-hook-plugin/scripts/` |
| `devin/servers/mcp-proxy.mjs` | `examples/agent-hook-plugin/servers/` |
| `devin/hosts/incremental-turn-capture.mjs` | `examples/agent-hook-plugin/hosts/` |
| `LICENSE` | `examples/LICENSE` |

## SHA-256 (first 16 hex digits)

Check with `shasum -a 256 <file>` from this directory.

| File | SHA-256 |
| --- | --- |
| `LICENSE` | `081a54b68d890cdb` |
| `memory-plugin-shared/lib/MANIFEST` | `35b32f3c12bde25b` |
| `memory-plugin-shared/lib/agent-hook-runtime.mjs` | `da69c01e556ca6ae` |
| `memory-plugin-shared/lib/async-writer.mjs` | `2e5415193020cd4e` |
| `memory-plugin-shared/lib/batch-send.mjs` | `2e5903703bb5c07a` |
| `memory-plugin-shared/lib/capture-utils.mjs` | `b69e2707b16fb274` |
| `memory-plugin-shared/lib/config-schema.mjs` | `4f9c94d725a447dd` |
| `memory-plugin-shared/lib/credentials.mjs` | `a1a269319fc3d6b8` |
| `memory-plugin-shared/lib/debug-log.mjs` | `dddcccd257f46f39` |
| `memory-plugin-shared/lib/doctor-core.mjs` | `dd7f0aaed8f59460` |
| `memory-plugin-shared/lib/input-filters.mjs` | `0d6eb1ebbb4bac21` |
| `memory-plugin-shared/lib/mcp-proxy-config.mjs` | `1896a9998b9b8848` |
| `memory-plugin-shared/lib/mcp-proxy-core.mjs` | `53896627feadc843` |
| `memory-plugin-shared/lib/ov-http.mjs` | `dd9b62c2fc1b54c9` |
| `memory-plugin-shared/lib/pending-queue.mjs` | `d38f3a8aa523c95b` |
| `memory-plugin-shared/lib/plugin-config.mjs` | `ce1f48a474de3566` |
| `memory-plugin-shared/lib/profile-inject.mjs` | `79a9df0e1c0b0ffa` |
| `memory-plugin-shared/lib/recall-compress-core.mjs` | `13d5a6a71119a9e7` |
| `memory-plugin-shared/lib/recall-core.mjs` | `7a830ca959101e27` |
| `memory-plugin-shared/lib/retryable.mjs` | `e3e8b712d1d9930e` |
| `memory-plugin-shared/lib/session-model.mjs` | `4a1f5951662e4a6d` |
| `memory-plugin-shared/lib/uri-guard.mjs` | `a1b404906a18f0ac` |
| `memory-plugin-shared/lib/workspace-config.mjs` | `afaaa9cdf715d51c` |
| `memory-plugin-shared/lib/workspace-identity.mjs` | `8b4c2be78201300b` |
| `memory-plugin-shared/lib/workspace-peer.mjs` | `45e61fe33a4e3117` |
| `memory-plugin-shared/lib/workspace-registry.mjs` | `6733e8dfebae4792` |
| `devin/scripts/hook.mjs` | `737c89b01be65341` |
| `devin/scripts/request-budget.mjs` | `e63b832c9b31ebfb` |
| `devin/scripts/uri-guard.mjs` | `e18d747685ac1a9f` |
| `devin/servers/mcp-proxy.mjs` | `fe7c9e833887e28d` |
| `devin/hosts/incremental-turn-capture.mjs` | `7b590aa9f8e819f3` |

## Skills

`plugin/skills/*` are unmodified copies of upstream `examples/agent-hook-plugin/hosts/codebuddy/skills/*` (identical to the Cursor host's copies). Hashes are relative to `plugin/`.

| File | SHA-256 |
| --- | --- |
| `skills/openviking-memory/SKILL.md` | `7acc32358ba98c8b` |
| `skills/openviking-rule-search/SKILL.md` | `252cc2e0e36235ce` |
| `skills/openviking-skills/SKILL.md` | `83d4d71573b9a6fa` |
| `skills/ov-experience-memory/SKILL.md` | `9490d86db2fcfa57` |

## Not vendored

- `scripts/ov-memory-doctor.mjs`: its client table is hard-coded and has no `devin` entry, so it would diagnose the plugin as Cursor.
- `memory-plugin-shared/lib/install/*`: the upstream installer's helpers; this plugin is installed by `devin plugins install`.

## Known upstream gaps for `devin`

- `HARNESS_KEYS` in `config-schema.mjs` has no `devin` entry. Runtime config is unaffected (`plugin.devin` in `ovcli.conf` is still read); only the doctor's unknown-key check would flag it. An upstream `hosts/devin` PR would add the key.
