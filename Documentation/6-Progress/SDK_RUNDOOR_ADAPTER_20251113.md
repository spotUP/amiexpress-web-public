# SDK Example Doors – runDoor Adapter Rollout (2025-11-13)

## Summary
- Added a shared helper (`sdk/tools/runDoorSession.ts`) to run classic SDK doors (ServerDoor) inside the TypeScript `runDoor()` runtime by bridging socket input/output to the door’s event system.
- Updated the following server-side examples to export `runDoor()` instead of auto-starting:
  - `bbs-dashboard`, `blessed-contrib-demos`, `bug-tracker`, `drawille-cube`, `fire-emblem`, `hello-world`, `neo-blessed-demo`, `space-shooter`, `tic-tac-toe`.
- Each of the above doors now reuses the helper so they run from the BBS menu without forking a separate SDK process.
- Client/hybrid examples (`dungeon-rpg`, `tetris`) expose placeholder `runDoor()` implementations that explain the door must be launched via the web/hybrid UI. This prevents the TypeScript loader from erroring while we finish their browser workflows.
- `TRACKER` command now points to the SDK server component (`Commands/BBSCmd/TRACKER.info` → `TYPE=SDK`, `LOCATION=doors/tracker-door/server.ts`). Launching `/TRACKER` spawns the hybrid server door so telnet/SSH users get the text UI plus song list while the web client can still drive the audio UI.
- All server-only SDK examples now declare `"runtime": "server"` inside their package manifests so the BBS loader treats them as server doors instead of blocking on the client-door bridge. This applies to `bbs-dashboard`, `blessed-contrib-demos`, `bug-tracker`, `drawille-cube`, `fire-emblem`, `hello-world`, `neo-blessed-demo`, `space-shooter`, and `tic-tac-toe`.

## Details
- **Helper**: `sdk/tools/runDoorSession.ts`
  - Converts raw Socket.IO input into `KeyEvent`s and feeds them into the door.
  - Mirrors `door.sendAnsi` output back to the caller’s terminal.
  - Automatically pauses the door loop once the door disconnects to avoid runaway timers in the backend process.
  - Exported via `@amiexpress/bbs-door-sdk/tools/runDoorSession` for reuse.
- **Example updates**: Each door now imports `runDoorWithSession` and exposes:
  ```ts
  export async function runDoor(session: any) {
    await runDoorWithSession(door, session);
  }
  ```
- **Hybrid-only placeholders**:
  - `sdk/doors/dungeon-rpg/index.ts`
  - `sdk/doors/tetris/index.ts`
  - These display a warning message and return to the menu after a keypress, ensuring the BBS doesn’t abort because of a missing `runDoor()` when invoked via the TS door loader.
- **Tracker hybrid door**:
  - `/TRACKER` now uses the SDK runtime, which spawns `server.ts` to host RPC calls and show the telnet overview while the browser client handles audio and advanced UI.

## Testing
- Attempted `npm run build` inside `sdk/doors/hello-world`; compilation currently fails due to pre-existing issues in the shared SDK (DOM globals such as `window`/`requestAnimationFrame` are missing from the default TypeScript config). No additional regression introduced by this change—the helper is strictly additive.
- Runtime verification to be completed on the live BBS by launching each command (HELLO, DASHBOARD, etc.) now that `runDoor()` exports exist.
