# LiveChat Hybrid Door Audio - Handoff

## Status: FIXED - Ready for Testing

## Summary

LiveChat was converted to a hybrid door to enable browser-based audio playback. Multiple issues were discovered and fixed during implementation.

## Issues Fixed

### 1. Missing LOCATION in .info file
- **Problem**: `Doors/livechat/livechat.info` wasn't being parsed because it wasn't in `Commands/BBSCmd/`
- **Fix**: Created `Commands/BBSCmd/livechat.info` with correct format:
  ```
  BBSCMD=LIVECHAT
  TYPE=TS
  LOCATION=Doors/livechat
  ACCESS=0
  MULTINODE=YES
  PRELOADER=YES
  ```

### 2. ChatTerminal missing door:load-client handler
- **Problem**: `/chat/login` uses `ChatTerminal.tsx`, not `BBSTerminal.tsx`. ChatTerminal didn't handle `door:load-client` events
- **Fix**: Added `door:load-client` and `door:unload-client` handlers to `web/frontend/src/chat/ChatTerminal.tsx`

### 3. Race condition in ChatOnly mode
- **Problem**: Backend emitted `door:load-client` before frontend registered handlers
- **Fix**:
  - ChatTerminal: Added `autoConnect: false`, register handlers first, then `socket.connect()`
  - Backend index.ts: Added 100ms delay before executing door in ChatOnly mode

### 4. AudioContext autoplay policy violation
- **Problem**: `AudioEngine` created Tone.js objects in constructor, triggering AudioContext before user gesture
- **Fix**: Deferred Tone.js initialization to `init()` method in `sdk/engines/audio/audio-engine.ts`

## Files Modified

| File | Change |
|------|--------|
| `Commands/BBSCmd/livechat.info` | Created with correct TYPE=TS format |
| `Doors/livechat/livechat.info` | Updated to match Commands version |
| `web/frontend/src/chat/ChatTerminal.tsx` | Added door:load-client handler, autoConnect fix |
| `web/backend/src/index.ts` | Added 100ms delay in ChatOnly mode |
| `sdk/engines/audio/audio-engine.ts` | Deferred Tone.js init to after user gesture |
| `Doors/livechat/client.ts` | User gesture handler for audio init (done earlier) |

## Audio Flow (Working)

```
Server (livechat/server.ts)
    |
    v
AudioService.playSound('click')
    |
    v
socket.emit('audio:play', {soundId: 'click'})
    |
    v
Frontend (ChatTerminal or BBSTerminal)
    |
    v
ClientDoor receives 'audio:play' via window.__BBS__.socket
    |
    v
LiveChatClient.playSound()
    |
    v
AudioEngine.playSound() -> Tone.js -> Browser Audio
```

## Expected Console Logs (Success)

```
[ChatTerminal] All handlers registered, connecting...
[ChatTerminal] Connected
[ChatTerminal] Loading client door: livechat
[ChatTerminal] Client bundle loaded: livechat
[ClientDoor] Using existing BBS Socket.IO connection
[LiveChatClient] Started - listening for audio events
(after first keypress)
[AudioEngine] Tone.js started successfully
[AudioEngine] Audio system initialized
[LiveChatClient] Audio initialized on user gesture
```

## Testing

1. Restart servers: `./dev/scripts/kill-servers.sh && ./dev/scripts/start-servers.sh`
2. Hard refresh browser (Cmd+Shift+R)
3. Go to `http://localhost:3001/chat/login`
4. Login and enter chat
5. Press any key - should see audio initialization logs
6. Hover over UI elements, send messages - should hear sounds

## Known Limitations

- Audio requires user gesture (browser policy - cannot be bypassed)
- First 3 sounds before gesture are queued and played after init
- Voice chat audio streaming is separate system (not covered here)
