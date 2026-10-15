# Scripts Directory Map
This repository centralizes every CLI/door/testing script under `Scripts/` so AI agents and maintainers can find automation tooling quickly.

## Layout
- `Scripts/` holds general utilities (`run-amiga-door.ts`, `debug-samilog-store.ts`, `bbs-cli.ts`, `analyze-door-pc.ts`, etc.) plus the canonical `test-*` harnesses that drive doors and backend regression coverage.
- `Scripts/dev/` contains the legacy `dev/scripts/test-*` suites (e.g., `test-all-commands.ts`, `test-bbs-comprehensive.ts`).
- `Scripts/backend/` now hosts `web/backend/test-*` helpers plus any backend-specific utilities (e.g., `test-door-interactive.ts`, `test-door.ts`, `test-bulls-debug.ts`).
- `Scripts/backend-dev/` contains the former `web/backend/dev-scripts/test-*` modules used for infrastructure/system-level verification.
- `Scripts/emulation/` gathers the Amiga emulation unit tests from `web/backend/src/amiga-emulation/test/` (e.g., `test-jsr-simple.ts`, `test-hunk-loader.ts`).
- `Scripts/legacy/` keeps extra tooling such as `test-door-direct-argc.ts` that no longer lives in a code package but still documents how to rerun specialized scenarios.
- `Scripts/archive/` preserves older runs for reference.

## Usage
1. Pick the relevant directory from above.
2. Run `npx tsx Scripts/<subdir>/<script>.ts` or `node Scripts/<script>.ts` where appropriate.
3. For door runs, use the harness (`run-amiga-door.ts`) alongside `Scripts/test-*` to reproduce AquaScan/WHO behavior.

## Notes for AI
- Always start at this README when asked for automation help; it points to the current home for test scripts.
- If a script is missing here, check `Documentation/3-Developers/archive/dev-scripts/` for archived plans and `Documentation/5-Reference/archive/mcp-server/` for MCP-run docs.
