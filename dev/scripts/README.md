# Dev scripts

Developer tooling for the board: start/stop scripts, door harnesses, XIM
tools, probes, migrations and one-off test drivers. None of it ships in the
Docker image; the board never reads this folder.

Run TypeScript scripts from the repository root, because most of them resolve
board paths (`Doors/`, `Utils/`, `Screens/`) against the current directory:

```sh
npx tsx dev/scripts/<script>.ts
```

## Layout

- `dev/scripts/` - general utilities (`start-servers.sh`, `kill-servers.sh`,
  `bbs_telnet.py`, `run-door-harness.ts`, `edit-info.ts`, the `xim-*` tools)
  and the `test-*` drivers for single doors (WHO, RTW, GetAnswer, AquaScan).
- `dev/scripts/dev/` - whole-board drivers (`test-all-commands.ts`,
  `test-bbs-comprehensive.ts`, the AmigaFS checks).
- `dev/scripts/backend-dev/` - chat and inter-node checks against
  `web/backend`.
- `dev/scripts/emulation/` - `generate-test-door.ts`.
- `dev/scripts/archive/` - older runs kept for reference.

XIM tools: see `XIM_TOOLS_README.md`. The door file watcher: see
`DOOR_WATCHER.md`.

## restore-npm-access.sh

Runs `npm install --prefix web/backend` from the repository root. Use it to
refresh backend dependencies when the sandbox loses access to
`registry.npmjs.org`; it needs network access.
