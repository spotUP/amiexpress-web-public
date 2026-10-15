---
date: 2026-04-27
topic: grandmaster-voice-chat
tags: [grandmaster, voice, sdk, livechat, audio]
status: draft
---

# Grandmaster Voice Chat — Design Spec

## Goal

Add always-on open-mic voice chat to the Grandmaster door so players can talk
during VS matches, in the lobby, and in menus. Extract the browser-side capture
and playback logic into a shared `VoiceCapture` SDK class. Refactor livechat to
use it. Grandmaster becomes the second consumer.

---

## 1. SDK — `sdk/media/VoiceCapture.ts` (new)

Browser-side only (runs in `client.ts` bundle). Pairs with the existing
server-side `sdk/media/Audio.ts`.

### Constructor

```typescript
new VoiceCapture(door: ClientDoor, options?: VoiceCaptureOptions)

interface VoiceCaptureOptions {
  echoCancellation?: boolean;   // default true
  noiseSuppression?: boolean;   // default true
  autoGainControl?: boolean;    // default true
  sampleRate?: number;          // default 48000
  bitrate?: number;             // default 32000
  chunkIntervalMs?: number;     // default 100
}
```

### API

| Method | Description |
|---|---|
| `start(): Promise<void>` | Request mic, start MediaRecorder, begin streaming |
| `stop(): void` | Stop recording, release MediaStreamTracks, close AudioContext |
| `mute(): void` | Disable audio track, emit `audio:mute {muted:true}` to server |
| `unmute(): void` | Re-enable audio track, emit `audio:mute {muted:false}` |
| `isMuted: boolean` | Current mute state |
| `destroy(): void` | `stop()` + remove door event listeners |

### Events emitted locally

| Event | Payload | When |
|---|---|---|
| `speaking` | `boolean` | RMS crosses 0.01 threshold (simple VAD) |
| `level` | `number` (0–1) | Every 100ms while streaming |
| `error` | `Error` | getUserMedia denied or MediaRecorder failure |

### Capture flow

1. `getUserMedia({ audio: { echoCancellation, noiseSuppression, autoGainControl } })`
2. Create `AudioContext` + `AnalyserNode` for level/VAD monitoring
3. Create `MediaRecorder` with `audio/webm;codecs=opus` at 100ms `timeslice`
4. On `dataavailable`: if not muted → `door.emitToServer('audio:data', chunk.arrayBuffer())`

### Playback flow

- Listens to `door.on('audio:data', { userId, chunk })` (forwarded by `ClientDoor` from socket)
- Per-sender `GainNode` map in a shared `AudioContext`
- `audioContext.decodeAudioData(chunk)` → `AudioBufferSourceNode` → `GainNode` → destination
- Unknown sender → create new `GainNode` entry

### Reacts to server commands

- `door.on('audio:start-streaming')` → `start()`
- `door.on('audio:stop-streaming')` → `stop()`
- `door.on('audio:mute', { muted })` → sync local mute state (e.g. server-side forced mute)

### Export

Added to `sdk/media/index.ts` (create if missing) and re-exported from the SDK
client entry so doors can `import { VoiceCapture } from '@amiexpress/bbs-door-sdk'`.

---

## 2. Livechat refactor

`Doors/livechat/client.ts` currently contains inline mic capture (~80 lines).

**Changes:**
- Import `VoiceCapture` from SDK
- Replace inline `getUserMedia` + `MediaRecorder` + `AnalyserNode` + playback
  code with `new VoiceCapture(door)`
- Wire `voiceCapture.on('speaking', ...)` → existing speaking indicator
- Wire `voiceCapture.on('level', ...)` → existing level bar
- Mute button: call `voiceCapture.mute()` / `voiceCapture.unmute()`
- Behaviour unchanged for livechat users

---

## 3. Grandmaster `client.ts`

`Doors/grandmaster/client.ts` (already exists, handles SFX/music playback).

**Changes:**
- Add `VoiceCapture` instance field, initially null
- On `door.on('audio:start-streaming')`: `voiceCapture = new VoiceCapture(door); voiceCapture.start()`
- On `door.on('audio:stop-streaming')`: `voiceCapture?.destroy(); voiceCapture = null`
- `voiceCapture.on('speaking', s => door.emitToServer('voice:speaking', { speaking: s }))`
- `voiceCapture.on('level', l => door.emitToServer('voice:level', { level: l }))`
- Export a `getMuted()` / `setMuted()` method so the server can poll or set mute state via door events

---

## 4. Grandmaster server (`app.ts` / door handler)

### When to start/stop streaming

| Context | Action |
|---|---|
| Enter lobby (`showLobby`) | `session.bbs.audio.startStreaming()` |
| Leave lobby (back to menu) | `session.bbs.audio.stopStreaming()` |
| Start VS game (`startVersusGame`) | streaming already active; no-op |
| VS game over (return to menu) | `session.bbs.audio.stopStreaming()` |
| Enter CPU battle | no voice (single player) |
| Enter 1P game modes | no voice (single player) |

### Audio relay

When a player's socket emits `audio:data`, the server must forward the chunk to
all other sockets in the same active match/lobby.

```typescript
socket.on('audio:data', (chunk: ArrayBuffer) => {
  const peers = getPeerSockets(session);   // from GrandmasterNetworkManager match state
  for (const peer of peers) {
    peer.emit('audio:data', { userId: session.user.id, chunk });
  }
});
```

`getPeerSockets` looks up the current match in `GrandmasterNetworkManager`, finds
other non-bot player socket IDs, and returns their Socket.IO socket references.
The backend session manager provides `getSocketByUserId`.

### Speaking state relay

```typescript
socket.on('voice:speaking', ({ speaking }) => {
  const peers = getPeerSockets(session);
  for (const peer of peers) {
    peer.emit('voice:speaking', { userId: session.user.id, speaking });
  }
});
```

### Mute toggle (server-initiated)

The server calls `session.bbs.audio.setMuted(true/false)` which emits
`audio:mute` to the client. `VoiceCapture` responds to `door.on('audio:mute')`.

---

## 5. Versus screen UI (`versus-screen.ts`)

Voice status lives in the existing VS info panel (right column, `opponentInfoBox`).

### Layout addition

Below the existing stats in the VS panel, append a voice section:

```
  ─── VOICE ───────────
  [*] spot         (speaking, green)
  [ ] sysop        (silent, gray)
  [M] sysop        (muted, red)
```

- `[*]` = speaking (cyan/green fg)
- `[ ]` = silent (gray fg)
- `[M]` = muted (red fg)

### Mute keybinding

- `M` key in game/lobby context toggles mute
- Gamepad: no default binding (can be added by user via settings)
- Visual feedback: local row changes immediately on keypress

### Data flow

- Server sends `voice:speaking { userId, speaking }` → `versus-screen.ts` updates its local map
- Server sends `voice:level { userId, level }` → optional level bar (future; omit for MVP)
- On mute key: call `session.bbs.audio.setMuted(!currentMute)` which propagates via socket

### Lobby UI

In the MultiplayerLobby widget (blessed), voice status appears as a system chat
message when someone joins/leaves voice, and as a persistent status line at the
bottom of the chat panel:
```
  Voice: [*] spot  [ ] sysop
```
Updated on each `voice:speaking` event.

---

## 6. Multiplayer scope

Voice is active **only in multiplayer contexts**:
- VS lobby (waiting for match)
- VS game (active match)
- Any screen while a VS lobby/match is open

Voice is **not active** in:
- 1P Master / Death / Sprint / Marathon / Ultra modes
- CPU Battle
- Settings / Stats / main menu when no match is open

---

## 7. Socket events summary

| Event | Direction | Payload | Description |
|---|---|---|---|
| `audio:start-streaming` | server → client | `AudioStreamOptions` | Start mic capture |
| `audio:stop-streaming` | server → client | — | Release mic |
| `audio:mute` | both | `{ muted: boolean }` | Mute state sync |
| `audio:data` | client → server → peers | `ArrayBuffer` | 100ms Opus chunk |
| `voice:speaking` | client → server → peers | `{ userId, speaking }` | VAD state |
| `voice:level` | client → server → peers | `{ userId, level }` | RMS level (0–1) |

---

## 8. Implementation order

1. `sdk/media/VoiceCapture.ts` — build and unit-test in isolation
2. Refactor livechat to use it — validates the API against a working door
3. Add relay logic to grandmaster `app.ts`
4. Update grandmaster `client.ts`
5. Add VS panel voice UI to `versus-screen.ts`
6. Add lobby voice status line to `MultiplayerLobby` widget or lobby chat

---

## 9. Out of scope (MVP)

- Push-to-talk
- Per-user volume control
- Noise gate / advanced VAD
- Voice in CPU battle or 1P modes
- Level bars in VS panel (show status only)
- Gamepad mute binding (keyboard M only)
