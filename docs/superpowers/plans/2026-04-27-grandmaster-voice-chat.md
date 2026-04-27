# Grandmaster Voice Chat Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add always-on open-mic voice chat to Grandmaster VS lobbies and games, backed by a shared `VoiceCapture` SDK class that livechat also uses.

**Architecture:** A new `sdk/media/VoiceCapture.ts` handles browser-side mic capture (getUserMedia + MediaRecorder) and audio playback (WebAudio), wired through the existing `ClientDoor` event bus. The server-side relay uses Socket.IO rooms keyed to the match ID. The VS panel shows speaking indicators; `M` toggles mute.

**Tech Stack:** MediaRecorder API, Web Audio API, Socket.IO rooms, blessed (server-side ANSI UI), TypeScript.

---

## File Map

| Path | Change |
|---|---|
| `sdk/media/VoiceCapture.ts` | **CREATE** — browser-side mic capture + playback |
| `sdk/media/index.ts` | **MODIFY** — add `VoiceCapture` export |
| `sdk/client/index.ts` | **MODIFY** — export `VoiceCapture`; add `voice:level` to `SERVER_FORWARD_EVENTS`; forward `voice:speaking` from socket to door |
| `Doors/livechat/client.ts` | **MODIFY** — replace inline mic/playback with `VoiceCapture` |
| `Doors/grandmaster/client.ts` | **MODIFY** — add `VoiceCapture` wiring |
| `Doors/grandmaster/app.ts` | **MODIFY** — Socket.IO room relay, streaming lifecycle |
| `Doors/grandmaster/ui/versus-screen.ts` | **MODIFY** — voice section in VS panel, M mute key |

---

## Task 1: Create `sdk/media/VoiceCapture.ts`

**Files:**
- Create: `sdk/media/VoiceCapture.ts`

- [ ] **Step 1: Create the file**

```typescript
// sdk/media/VoiceCapture.ts
import { EventEmitter } from 'events';

export interface VoiceCaptureOptions {
  echoCancellation?: boolean;
  noiseSuppression?: boolean;
  autoGainControl?: boolean;
  sampleRate?: number;
  bitrate?: number;
  chunkIntervalMs?: number;
}

/**
 * Browser-side mic capture and playback for door voice chat.
 * Pairs with the server-side sdk/media/Audio.ts.
 *
 * Usage:
 *   const vc = new VoiceCapture(door);
 *   vc.on('speaking', (s: boolean) => ...);
 *   vc.on('level', (l: number) => ...);
 *   // Server calls session.bbs.audio.startStreaming() to trigger start().
 *   vc.destroy(); // on cleanup
 */
export class VoiceCapture extends EventEmitter {
  private door: any; // ClientDoor — typed as any to avoid circular import
  private opts: Required<VoiceCaptureOptions>;
  private mediaStream: MediaStream | null = null;
  private mediaRecorder: MediaRecorder | null = null;
  private audioContext: AudioContext | null = null;
  private analyserNode: AnalyserNode | null = null;
  private sourceNode: MediaStreamAudioSourceNode | null = null;
  private levelInterval: ReturnType<typeof setInterval> | null = null;
  private audioPlayers = new Map<string | number, {
    gainNode: GainNode;
    source: AudioBufferSourceNode | null;
  }>();
  private _isMuted = false;
  private lastSpeaking = false;
  private doorListeners: Array<[string, (...args: any[]) => void]> = [];

  constructor(door: any, options?: VoiceCaptureOptions) {
    super();
    this.door = door;
    this.opts = {
      echoCancellation: options?.echoCancellation ?? true,
      noiseSuppression: options?.noiseSuppression ?? true,
      autoGainControl: options?.autoGainControl ?? true,
      sampleRate: options?.sampleRate ?? 48000,
      bitrate: options?.bitrate ?? 32000,
      chunkIntervalMs: options?.chunkIntervalMs ?? 100,
    };
    this.bindDoorEvents();
  }

  get isMuted(): boolean { return this._isMuted; }

  private bindDoorEvents(): void {
    const onStart = (opts?: VoiceCaptureOptions) => void this.start(opts);
    const onStop = () => this.stop();
    const onMuteCmd = (data: { muted: boolean }) => {
      if (data.muted) this._applyMute(true); else this._applyMute(false);
    };
    const onData = (data: { userId: string | number; chunk: ArrayBuffer }) =>
      void this.playChunk(data.userId, data.chunk);

    this.door.on('audio:start-streaming', onStart);
    this.door.on('audio:stop-streaming', onStop);
    this.door.on('audio:mute', onMuteCmd);
    this.door.on('audio:data', onData);
    this.doorListeners.push(
      ['audio:start-streaming', onStart],
      ['audio:stop-streaming', onStop],
      ['audio:mute', onMuteCmd],
      ['audio:data', onData],
    );
  }

  async start(opts?: VoiceCaptureOptions): Promise<void> {
    if (this.mediaStream) return;
    try {
      const o = { ...this.opts, ...opts };
      this.mediaStream = await navigator.mediaDevices.getUserMedia({
        audio: {
          sampleRate: o.sampleRate,
          echoCancellation: o.echoCancellation,
          noiseSuppression: o.noiseSuppression,
          autoGainControl: o.autoGainControl,
          channelCount: 1,
        },
        video: false,
      });

      this.audioContext = new AudioContext();
      this.analyserNode = this.audioContext.createAnalyser();
      this.analyserNode.fftSize = 256;
      this.analyserNode.smoothingTimeConstant = 0.8;
      this.sourceNode = this.audioContext.createMediaStreamSource(this.mediaStream);
      this.sourceNode.connect(this.analyserNode);

      const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
        ? 'audio/webm;codecs=opus'
        : 'audio/webm';
      this.mediaRecorder = new MediaRecorder(this.mediaStream, {
        mimeType,
        audioBitsPerSecond: o.bitrate,
      });
      this.mediaRecorder.ondataavailable = (ev) => {
        if (ev.data.size > 0 && !this._isMuted) {
          void ev.data.arrayBuffer().then((buf) => this.door.emit('audio:data', buf));
        }
      };
      this.mediaRecorder.start(o.chunkIntervalMs);
      this.startLevelMonitor();
    } catch (err) {
      this.emit('error', err instanceof Error ? err : new Error(String(err)));
    }
  }

  stop(): void {
    if (this.levelInterval) { clearInterval(this.levelInterval); this.levelInterval = null; }
    if (this.mediaRecorder && this.mediaRecorder.state !== 'inactive') this.mediaRecorder.stop();
    this.mediaRecorder = null;
    this.mediaStream?.getTracks().forEach(t => t.stop());
    this.mediaStream = null;
    if (this.audioContext) { void this.audioContext.close(); this.audioContext = null; }
    this.analyserNode = null;
    this.sourceNode = null;
    this.audioPlayers.clear();
  }

  mute(): void {
    this._applyMute(true);
    this.door.emit('audio:mute', { muted: true });
  }

  unmute(): void {
    this._applyMute(false);
    this.door.emit('audio:mute', { muted: false });
  }

  destroy(): void {
    this.stop();
    for (const [ev, fn] of this.doorListeners) this.door.off(ev, fn);
    this.doorListeners = [];
    this.removeAllListeners();
  }

  private _applyMute(muted: boolean): void {
    this._isMuted = muted;
    this.mediaStream?.getAudioTracks().forEach(t => { t.enabled = !muted; });
  }

  private startLevelMonitor(): void {
    if (this.levelInterval) return;
    const buf = new Uint8Array(this.analyserNode?.frequencyBinCount ?? 128);
    this.levelInterval = setInterval(() => {
      if (!this.analyserNode || !this.mediaStream) return;
      this.analyserNode.getByteFrequencyData(buf);
      let sum = 0;
      for (let i = 0; i < buf.length; i++) { const n = buf[i] / 255; sum += n * n; }
      const rms = Math.sqrt(sum / buf.length);
      this.emit('level', rms);
      const speaking = rms > 0.01 && !this._isMuted;
      if (speaking !== this.lastSpeaking) {
        this.lastSpeaking = speaking;
        this.emit('speaking', speaking);
      }
    }, 100);
  }

  private async playChunk(userId: string | number, chunk: ArrayBuffer): Promise<void> {
    if (!this.audioContext) return;
    try {
      let p = this.audioPlayers.get(userId);
      if (!p) {
        const gainNode = this.audioContext.createGain();
        gainNode.gain.value = 0.8;
        gainNode.connect(this.audioContext.destination);
        p = { gainNode, source: null };
        this.audioPlayers.set(userId, p);
      }
      const decoded = await this.audioContext.decodeAudioData(chunk.slice(0));
      const src = this.audioContext.createBufferSource();
      src.buffer = decoded;
      src.connect(p.gainNode);
      src.start(0);
      p.source = src;
      src.onended = () => { if (p && p.source === src) p.source = null; };
    } catch { /* decode failed — skip chunk */ }
  }
}
```

- [ ] **Step 2: Verify types compile**

```bash
cd ~/Code/amiexpress-web/sdk && npx tsc --noEmit 2>&1 | head -20
```
Expected: no errors for `sdk/media/VoiceCapture.ts`.

---

## Task 2: Export VoiceCapture from SDK

**Files:**
- Modify: `sdk/media/index.ts`
- Modify: `sdk/client/index.ts`

- [ ] **Step 1: Add export to `sdk/media/index.ts`**

In `sdk/media/index.ts`, add after the existing `export { Audio } from './Audio';` line:

```typescript
export { VoiceCapture, type VoiceCaptureOptions } from './VoiceCapture';
```

- [ ] **Step 2: Add `voice:level` to SERVER_FORWARD_EVENTS in `sdk/client/index.ts`**

In `sdk/client/index.ts`, the `SERVER_FORWARD_EVENTS` set currently ends with `'voice:speaking'` at line 90. Add `'voice:level'` after it:

```typescript
    // Voice activity detection
    'voice:speaking',
    'voice:level',
```

- [ ] **Step 3: Forward incoming `voice:speaking` from socket to door in `sdk/client/index.ts`**

In `sdk/client/index.ts`, in the block where socket events are forwarded to the door (around lines 199–225), add after the existing `socket.on('audio:data', ...)` handler:

```typescript
        // Voice speaking state from peers (server → client)
        socket.on('voice:speaking', (data: any) => {
          this.emit('voice:speaking', data);
        });
```

- [ ] **Step 4: Export VoiceCapture from `sdk/client/index.ts`**

At the bottom of `sdk/client/index.ts`, after the existing `export { AudioEngine }` line (line 706), add:

```typescript
export { VoiceCapture, type VoiceCaptureOptions } from '../media/VoiceCapture';
```

- [ ] **Step 5: Typecheck SDK**

```bash
cd ~/Code/amiexpress-web/sdk && npx tsc --noEmit 2>&1 | head -20
```
Expected: clean.

- [ ] **Step 6: Commit**

```bash
cd ~/Code/amiexpress-web
git add sdk/media/VoiceCapture.ts sdk/media/index.ts sdk/client/index.ts
git commit -m "feat(sdk): add VoiceCapture class for shared browser mic capture/playback"
```

---

## Task 3: Refactor livechat to use VoiceCapture

**Files:**
- Modify: `Doors/livechat/client.ts`

The inline mic/playback code in `LiveChatClient` lives in `startCapture()` (lines 546–612), `playAudioChunk()` (721–770), `setMuted()` (648–659), and `startLevelMonitoring()` (661–703). Replace all of it with `VoiceCapture`.

- [ ] **Step 1: Add import at top of `Doors/livechat/client.ts`**

After the existing `import { ClientDoor } from '@amiexpress/bbs-door-sdk/client';` line, add:

```typescript
import { VoiceCapture } from '@amiexpress/bbs-door-sdk/client';
```

- [ ] **Step 2: Add `voiceCapture` field to `LiveChatClient`**

In the `LiveChatClient` class, after the existing `private audioContext: AudioContext | null = null;` field, add:

```typescript
  private voiceCapture: VoiceCapture | null = null;
```

- [ ] **Step 3: Replace `startCapture()` body**

Find the `startCapture()` method (starts around line 539). Replace its body with:

```typescript
  private async startCapture(options: AudioStreamOptions = {}): Promise<void> {
    if (this.voiceCapture) return;
    this.voiceCapture = new VoiceCapture(this.door, {
      echoCancellation: options.echoCancellation !== false,
      noiseSuppression: options.noiseSuppression !== false,
      autoGainControl: options.autoGainControl !== false,
      sampleRate: options.sampleRate || 48000,
      bitrate: options.bitrate || 32000,
    });
    this.voiceCapture.on('speaking', (speaking: boolean) => {
      this.isSpeaking = speaking;
      // Existing speaking indicator update — same event livechat already uses
      this.door.emit('voice:speaking', { isSpeaking: speaking, audioLevel: 0 });
    });
    this.voiceCapture.on('level', (rms: number) => {
      this.audioLevels = { input: rms, output: 0 };
      this.door.emit('audio:levels', this.audioLevels);
    });
    this.voiceCapture.on('error', (err: Error) => {
      console.error('[LiveChatClient] VoiceCapture error:', err);
      this.door.emit('audio:error', { error: err.message });
    });
    await this.voiceCapture.start(options);
    this.isStreaming = true;
  }
```

- [ ] **Step 4: Replace `stopCapture()` body**

Find `stopCapture()`. Replace its body with:

```typescript
  private stopCapture(): void {
    this.voiceCapture?.destroy();
    this.voiceCapture = null;
    this.isStreaming = false;
  }
```

- [ ] **Step 5: Replace `setMuted()` body**

Find `setMuted(muted: boolean)` (line 648). Replace its body with:

```typescript
  private setMuted(muted: boolean): void {
    this.isMuted = muted;
    if (muted) this.voiceCapture?.mute();
    else this.voiceCapture?.unmute();
  }
```

- [ ] **Step 6: Delete now-unused private methods**

Delete the following methods entirely from `LiveChatClient` (they are replaced by VoiceCapture):
- `startLevelMonitoring()` (lines 661–703)
- `playAudioChunk()` (lines 721–770)
- `playAudioChunkFallback()` (if it exists and is only called from `playAudioChunk`)

Also remove the now-unused private fields: `mediaStream`, `mediaRecorder`, `analyserNode`, `sourceNode`, `levelInterval`, `audioPlayers` (if they were declared for these methods). **Check before deleting — only remove fields no longer referenced.**

- [ ] **Step 7: Build livechat**

```bash
cd ~/Code/amiexpress-web/Doors/livechat && npx tsc --noEmit 2>&1 | head -20
npm run build 2>&1 | tail -5
```
Expected: clean.

- [ ] **Step 8: Commit**

```bash
cd ~/Code/amiexpress-web
git add Doors/livechat/client.ts
git commit -m "refactor(livechat): use VoiceCapture SDK class for mic capture and playback"
```

---

## Task 4: Wire VoiceCapture into grandmaster's client

**Files:**
- Modify: `Doors/grandmaster/client.ts`

- [ ] **Step 1: Add import**

At the top of `Doors/grandmaster/client.ts`, after the existing `import { ClientDoor }` line:

```typescript
import { VoiceCapture } from '@amiexpress/bbs-door-sdk/client';
```

- [ ] **Step 2: Add field to `GrandmasterAudioClient`**

In `GrandmasterAudioClient`, after `private door: ClientDoor;`:

```typescript
  private voiceCapture: VoiceCapture | null = null;
```

- [ ] **Step 3: Wire voice events in `bindSocketEvents()`**

In `bindSocketEvents()`, after the existing `on('door-active', ...)` block, add:

```typescript
    // Voice chat — VoiceCapture reacts to audio:start-streaming / audio:stop-streaming
    // automatically via door events. We only need to forward speaking/level to server.
    const vc = new VoiceCapture(this.door);
    this.voiceCapture = vc;

    vc.on('speaking', (speaking: boolean) => {
      this.door.emit('voice:speaking', { speaking });
    });
    // voice:level is forwarded by SERVER_FORWARD_EVENTS automatically via door.emit
    vc.on('level', (level: number) => {
      this.door.emit('voice:level', { level });
    });
    vc.on('error', (err: Error) => {
      console.warn('[GrandmasterAudioClient] Mic error:', err.message);
    });
```

- [ ] **Step 4: Destroy voice capture in `cleanup()`**

In `cleanup()`, after `this.socketHandlers = [];`, add:

```typescript
    this.voiceCapture?.destroy();
    this.voiceCapture = null;
```

- [ ] **Step 5: Build grandmaster**

```bash
cd ~/Code/amiexpress-web/Doors/grandmaster && npx tsc --noEmit 2>&1 | head -20
npm run build 2>&1 | tail -5
```
Expected: clean.

- [ ] **Step 6: Commit**

```bash
cd ~/Code/amiexpress-web
git add Doors/grandmaster/client.ts
git commit -m "feat(grandmaster): add VoiceCapture wiring in hybrid client"
```

---

## Task 5: Server-side relay and streaming lifecycle in `app.ts`

**Files:**
- Modify: `Doors/grandmaster/app.ts`

The grandmaster door has `this.session.bbsSession.socket` (a server-side Socket.IO socket). Socket.IO rooms are used for the voice relay: all players in the same match join `voice:<matchId>`.

- [ ] **Step 1: Add a `_voiceRoom` field to `GrandmasterApp`**

In `GrandmasterApp`, after `private currentScreen:` field declaration, add:

```typescript
  private _voiceRoom: string | null = null;
  private _voiceSocketHandlers: Array<[string, (...args: any[]) => void]> = [];
```

- [ ] **Step 2: Add `startVoice()` helper method**

Add this private method to `GrandmasterApp` (near the other private helpers):

```typescript
  private startVoice(matchId: string): void {
    const socket = (this.session as any).bbsSession?.socket;
    if (!socket) return;

    const roomName = `voice:${matchId}`;
    this._voiceRoom = roomName;
    socket.join(roomName);

    // Relay audio chunks to all other players in the voice room
    const onAudioData = (chunk: ArrayBuffer) => {
      socket.to(roomName).emit('audio:data', {
        userId: this.session.user?.id ?? 'unknown',
        chunk,
      });
    };
    // Relay speaking state to all other players
    const onSpeaking = (data: { speaking: boolean }) => {
      socket.to(roomName).emit('voice:speaking', {
        userId: this.session.user?.id ?? 'unknown',
        speaking: data.speaking,
      });
    };

    socket.on('audio:data', onAudioData);
    socket.on('voice:speaking', onSpeaking);
    this._voiceSocketHandlers = [
      ['audio:data', onAudioData],
      ['voice:speaking', onSpeaking],
    ];

    // Tell the browser client to start the mic
    void (this.session as any).bbsSession?.audio?.startStreaming?.();
  }
```

- [ ] **Step 3: Add `stopVoice()` helper method**

```typescript
  private stopVoice(): void {
    const socket = (this.session as any).bbsSession?.socket;
    if (socket && this._voiceRoom) {
      for (const [ev, fn] of this._voiceSocketHandlers) socket.off(ev, fn);
      socket.leave(this._voiceRoom);
    }
    this._voiceRoom = null;
    this._voiceSocketHandlers = [];

    // Tell the browser client to release the mic
    void (this.session as any).bbsSession?.audio?.stopStreaming?.();
  }
```

- [ ] **Step 4: Call `startVoice` in `showLobby()`**

In `showLobby()`, after `this.inputManager.suspend();` (and the `createMenuNav` line), add:

```typescript
    // Start voice chat for the duration of the lobby + subsequent VS game.
    // Use the network's match ID once available; fall back to a session-unique room.
    const matchId = this.network?.getMatchState()?.matchId ?? `lobby-${this.session.user?.id ?? Date.now()}`;
    this.startVoice(matchId);
```

- [ ] **Step 5: Call `stopVoice` at every `showLobby` exit**

In `showLobby()`, in the error early-return block (after `nav.destroy()`), add `this.stopVoice();`:

```typescript
      nav.destroy();
      this.stopVoice();
      return;
```

In the "back to menu" block (after `nav.destroy()`):

```typescript
    nav.destroy();
    this.stopVoice();
    return;
```

In the normal completion block (after `nav.destroy()`), note: **do NOT stop voice here** — it continues into the VS game. Voice is stopped after the game ends (next step).

- [ ] **Step 6: Stop voice after VS game ends**

In `startVersusGame()` (line ~2186), after `versusScreen.cleanup();`, add:

```typescript
    // Voice was started in showLobby(); stop it now that the game is over.
    this.stopVoice();
```

- [ ] **Step 7: Stop voice if lobby result is 'cancel' (player left without starting)**

In `showLobby()`, after `const result = await lobbyScreen.show(...)`, the normal path goes to `nav.destroy()` and then checks `result.action`. Add a guard so if result is 'cancel' we also stop voice:

```typescript
    const result = await lobbyScreen.show('matchmaking', selectedMode);

    nav.destroy();
    this.inputHandler.setEnabled(true);
    this.inputManager.resume();
    if (this.session.bbs?.enableGameMode) {
      this.session.bbs.enableGameMode();
    }

    if (result.action !== 'start') {
      this.stopVoice();
      return;
    }
```

Remove the old inline `inputHandler`/`inputManager` resume block that was there before if it duplicates these lines.

- [ ] **Step 8: Typecheck grandmaster**

```bash
cd ~/Code/amiexpress-web/Doors/grandmaster && npx tsc --noEmit 2>&1 | head -20
```
Expected: clean.

- [ ] **Step 9: Build grandmaster**

```bash
npm run build 2>&1 | tail -5
```
Expected: clean.

- [ ] **Step 10: Commit**

```bash
cd ~/Code/amiexpress-web
git add Doors/grandmaster/app.ts
git commit -m "feat(grandmaster): server-side voice relay via Socket.IO rooms"
```

---

## Task 6: Voice UI in VersusScreen

**Files:**
- Modify: `Doors/grandmaster/ui/versus-screen.ts`

The `opponentInfoBox` content is currently set via `.setContent()` at line 803. We extend it with a voice section. A `voiceStates` map tracks speaking/muted state per userId. The server sends `voice:speaking` events to the socket; VersusScreen listens and re-renders.

- [ ] **Step 1: Add `voiceStates` field and session reference**

In `VersusScreen`, after the `private screen: Screen;` declaration, add:

```typescript
  private voiceStates = new Map<string, { speaking: boolean; muted: boolean }>();
  private localMuted = false;
  private sessionSocket: any = null; // socket for voice:speaking listener
  private voiceSpeakingHandler: ((data: any) => void) | null = null;
```

- [ ] **Step 2: Update `VersusScreen` constructor to accept session**

Find the constructor signature. Change it to accept an optional `sessionRef` parameter (add at the end of existing params):

```typescript
  constructor(
    screen: Screen,
    engine: GameEngine,
    inputHandler: InputHandler,
    sounds: SoundEngine,
    state: AppState,
    network: GrandmasterNetworkManager | null,
    attackManager: AttackManager | null,
    sessionRef?: any,
  ) {
    // ... existing body ...
    this.sessionSocket = sessionRef?.bbsSession?.socket ?? null;
  }
```

- [ ] **Step 3: Update `app.ts` to pass session**

In `app.ts`, in the `startVersusGame()` method where `VersusScreen` is constructed (line ~2160):

```typescript
    const versusScreen = new VersusScreen(
      this.screen,
      this.gameEngine,
      this.inputHandler,
      this.sounds,
      this.state,
      this.network,
      this.attackManager,
      this.session,   // ← add this
    );
```

- [ ] **Step 4: Register voice socket listener in `run()` or `setupUI()`**

In `VersusScreen.setupUI()`, after the existing screen setup, add:

```typescript
    // Voice speaking indicators
    if (this.sessionSocket) {
      this.voiceSpeakingHandler = (data: { userId: string; speaking: boolean }) => {
        const existing = this.voiceStates.get(data.userId) ?? { speaking: false, muted: false };
        this.voiceStates.set(data.userId, { ...existing, speaking: data.speaking });
        this.screen.render();
      };
      this.sessionSocket.on('voice:speaking', this.voiceSpeakingHandler);
    }
```

- [ ] **Step 5: Remove voice listener in `cleanup()`**

In `VersusScreen.cleanup()`, add:

```typescript
    if (this.sessionSocket && this.voiceSpeakingHandler) {
      this.sessionSocket.off('voice:speaking', this.voiceSpeakingHandler);
      this.voiceSpeakingHandler = null;
    }
```

- [ ] **Step 6: Add M-key mute toggle in `setupUI()`**

In `VersusScreen.setupUI()`, after registering the voice socket listener:

```typescript
    // M key toggles mic mute
    this.screen.key(['m', 'M'], () => {
      if (!this.sessionSocket) return;
      this.localMuted = !this.localMuted;
      // Tell the browser client to mute/unmute via the server Audio proxy
      this.sessionSocket.emit('audio:mute', { muted: this.localMuted });
      this.screen.render();
    });
```

- [ ] **Step 7: Add `renderVoiceSection()` helper**

Add this private method to `VersusScreen`:

```typescript
  private renderVoiceSection(localUserId: string, opponentUserId: string): string {
    const fmt = (uid: string, label: string) => {
      const s = this.voiceStates.get(uid);
      const muted = uid === localUserId ? this.localMuted : (s?.muted ?? false);
      if (muted)          return `{red-fg}[M]{/red-fg} ${label}`;
      if (s?.speaking)    return `{green-fg}[*]{/green-fg} ${label}`;
      return `{gray-fg}[ ]{/gray-fg} ${label}`;
    };
    const localName = this.state.playerName || 'You';
    const oppName   = this.getOpponents()[0]?.name || 'Opponent';
    return (
      `\n{cyan-fg}─ VOICE ─────────{/cyan-fg}\n` +
      `${fmt(localUserId, localName)}\n` +
      `${fmt(opponentUserId, oppName)}\n` +
      `{gray-fg}[M] mute{/gray-fg}`
    );
  }
```

- [ ] **Step 8: Inject voice section into opponentInfoBox render**

In the block where `opponentInfoBox.setContent()` is called (line ~803), append the voice section. The `localUserId` and `opponentUserId` need to come from the session/network. Modify the render to:

```typescript
      const localUserId = String(this.network?.getMatchState()?.players.find(p => !p.isBot && !opponents.some(o => o.id === p.id))?.id ?? '');
      const oppUserId   = String(opp?.id ?? '');
      const voiceSection = this._voiceRoom !== null   // only show when voice is active
        ? this.renderVoiceSection(localUserId, oppUserId)
        : '';

      this.opponentInfoBox.setContent(
        `{cyan-fg}${oppName}{/cyan-fg}\n\n` +
        `Level: {yellow-fg}${oppLevel}{/yellow-fg}\n` +
        `Grade: {magenta-fg}${oppGrade}{/magenta-fg}\n` +
        `Status: {${oppAlive ? 'green' : 'red'}-fg}${oppAlive ? 'ALIVE' : 'TOPPED OUT'}{/${oppAlive ? 'green' : 'red'}-fg}\n\n` +
        (attackPending > 0
          ? `{red-fg}INCOMING: ${attackPending} line${attackPending > 1 ? 's' : ''}{/red-fg}`
          : `{gray-fg}No incoming attack{/gray-fg}`) +
        voiceSection
      );
```

Note: `this._voiceRoom` is not accessible in VersusScreen directly. Instead, pass a `voiceActive: boolean` flag from app.ts, or simply always render the voice section when `sessionSocket` is set:

```typescript
      const voiceSection = this.sessionSocket
        ? this.renderVoiceSection(localUserId, oppUserId)
        : '';
```

- [ ] **Step 9: Typecheck and build**

```bash
cd ~/Code/amiexpress-web/Doors/grandmaster && npx tsc --noEmit 2>&1 | head -20
npm run build 2>&1 | tail -5
```
Expected: clean.

- [ ] **Step 10: Commit**

```bash
cd ~/Code/amiexpress-web
git add Doors/grandmaster/ui/versus-screen.ts Doors/grandmaster/app.ts
git commit -m "feat(grandmaster): voice speaking indicators and M-key mute in VS panel"
```

---

## Task 7: Final typecheck and SDK rebuild

- [ ] **Step 1: Typecheck SDK**

```bash
cd ~/Code/amiexpress-web/sdk && npx tsc --noEmit 2>&1
```
Expected: clean.

- [ ] **Step 2: Typecheck backend**

```bash
cd ~/Code/amiexpress-web/web/backend && npx tsc --noEmit 2>&1 | grep -v node_modules | head -20
```
Expected: clean.

- [ ] **Step 3: Full grandmaster build**

```bash
cd ~/Code/amiexpress-web/Doors/grandmaster && npm run build 2>&1 | tail -5
```
Expected: `dist/client.bundle.js` updated, no errors.

- [ ] **Step 4: Livechat build**

```bash
cd ~/Code/amiexpress-web/Doors/livechat && npm run build 2>&1 | tail -5
```
Expected: clean.

- [ ] **Step 5: Final commit**

```bash
cd ~/Code/amiexpress-web
git add -p  # stage any remaining changes
git commit -m "feat: grandmaster voice chat — VoiceCapture SDK, relay, VS panel UI"
```

---

## Manual Verification Checklist

After all tasks complete and servers are restarted:

- [ ] Two browser tabs, two users logged in, both enter Grandmaster → VS lobby
- [ ] Both players press Start → VS game begins
- [ ] Player A speaks → Player B's VS panel shows `[*] PlayerA` (green)
- [ ] Player A stops speaking → indicator returns to `[ ] PlayerA` (gray)
- [ ] Player A presses M → their own row shows `[M] PlayerA` (red), no audio reaches Player B
- [ ] Player A presses M again → unmuted, audio resumes
- [ ] Game ends → mic released (no browser mic indicator lingering)
- [ ] Livechat voice still works unchanged
