# SDK v2.0 Session Brief

Quick, high-signal notes to ramp into SDK v2.0 work without re-reading all docs.

## What the SDK is

- TypeScript Core SDK (CoreDoor) with typed ctx.output/input/storage for BBS doors.
- ServerDoor and ClientDoor runtime (event emitter style) for legacy/preview use.
- 68K SDK for C/ASM doors compiled to Amiga HUNK and run in the MOIRA emulator.

## Package and entry points

- npm package: `@amiexpress/bbs-door-sdk` (some docs show `@amiexpress/sdk`).
- Root exports: CoreDoor, ServerDoor, ClientDoor, Door (alias to ServerDoor), Output/Input/Storage, AnsiColor, engines, components, tools.

## CoreDoor lifecycle (SDK v2.0)

- Hooks: onStart(ctx), onInput(ctx, key), onClose(ctx), onError(ctx, err).
- Exit: prefer ctx.close() to end the input loop cleanly; door.exit() only flips running state.

## DoorContext and APIs

- ctx.user, ctx.nodeId, ctx.params, ctx.close().
- ctx.output: write, writeLine, clear, moveCursor, setForeground/Background, setStyle, reset, saveCursor/restoreCursor, hide/show cursor, eraseToEndOfLine/Screen, scroll.
- ctx.input: waitForKey, waitForKeyPress, getLine, getChar, getYesNo, getNumber, getChoice, setTimeout/clearTimeout.
- ctx.storage: JSON save/load/exists/keys/clear (per-user by default).
- ctx.bbs: optional passthrough to advanced BBS API (docs list more methods than core types).

## Input caveats

- KeyPress.key is raw input; arrow keys are ANSI sequences (`\x1b[A`, `\x1b[B`, etc).
- Enter is `\r` or `\n`; backspace is `\x7f` or `\b`.
- ServerDoor preview mode normalizes some keys to ArrowUp/ArrowDown, etc.

## Storage behavior

- Data stored under `data/doors/<door>/users/<id>` for per-user saves.
- Global storage is possible via Storage({ global: true }) but CoreDoor constructs per-user storage by default.

## Door packaging and registration

- TypeScript door layout: `doors/<name>/index.ts`, `package.json`, `tsconfig.json`, build to `dist/index.js`.
- Command registration: `.info` file in `Commands/BBSCmd/` with `TYPE=TS` and `LOCATION` pointing to the built door.
- 68K doors use `TYPE=XIM` and point `LOCATION` to the compiled binary.

## Engines (TypeScript)

- AudioEngine, CardEngine, PokerEngine, GraphicsEngine (BrailleCanvas), PhysicsEngine, AIEngine, NetworkEngine, InputEngine, TacticalCombatEngine, UIEngine (neo-blessed).
- CardEngine defaults to ASCII output with ANSI colors; pass `style: "unicode"` or `color: "none"` if needed.
- UIEngine wraps neo-blessed widgets; `blessed` export exposes the neo-blessed API.

## Components and tools

- Components: MenuSystem, HUDBuilder, SaveManager, InventorySystem, DialogueSystem, QuestSystem, ClassSystem.
- Tools: create-door, pack, validate, runDoorWithSession, preview.

## 68K SDK essentials

- Toolchain: vbcc (C) + vasm (ASM) to HUNK.
- Use AEDoor.library and amigafs; do not use JS shims for Amiga libs.
- Use disk-based config; avoid background processes.

## Known gaps/mismatches

- `sdk/docs/GAME_DEVELOPMENT_GUIDE.md` is referenced but missing.
- Some docs refer to `sdk/src/core` but actual path is `sdk/core`.
- Import path examples vary between `@amiexpress/sdk` and `@amiexpress/bbs-door-sdk`.

## Project rules (AGENTS/CLAUDE)

- No background processes; check logs first.
- Use amigafs and real Amiga libraries for 68K doors.
- Keep `handoff.md` under 5KB; no emojis.
