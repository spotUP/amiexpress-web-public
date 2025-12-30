# Discord-Style Voice/Video Channel Integration

Discord-style voice channels have been integrated into LiveChat, allowing users to join voice rooms for real-time audio/video communication.

## Features

### Voice Channel Panel (Right Sidebar)
- Toggleable sidebar showing voice channel participants
- Join/Leave voice channel button
- Real-time participant list with indicators
- Network quality monitoring
- Quality profile display
- Control panel

### Participant Display
Each participant shows:
- **Speaking indicator**: `[*]` green when speaking, `[ ]` gray when idle
- **Video indicator**: `[V]` cyan when video is on
- **Muted indicator**: `[M]` red when muted
- **Audio level bar**: Visual representation of audio levels (10-segment bar)
- **Username**: Bold when active

### Network Quality Monitor
Real-time display of:
- Connection status with colored indicators (green/yellow/red)
- Quality symbol: `[***]` excellent → `[X  ]` critical
- RTT (round-trip time) in milliseconds
- Packet loss percentage
- Quality score (0-100%)

### Adaptive Quality Profile
Current streaming quality:
- Profile name (Studio/High/Medium/Low/Emergency)
- Bitrate (kbps) and sample rate (kHz)
- Auto-adjust status (ON/OFF)

## Controls

| Key | Action |
|-----|--------|
| **F8** | Toggle voice channel panel |
| **M** | Toggle microphone (mute/unmute) |
| **V** | Toggle video camera |
| **A** | Toggle auto-quality adjustment |
| **+/-** | Manually adjust quality up/down |
| **ESC** | Leave voice channel |

## Architecture

### Frontend (LiveChat Door)
- **File**: `Doors/livechat/features/voice-chat.ts`
- **Class**: `VoiceChannel`
- **Integrates with**:
  - NetworkQualityMonitor (SDK)
  - AdaptiveQualityManager (SDK)
  - Audio streaming API (ctx.audio)
  - Blessed UI widgets

### Backend (Socket Handlers)
- **File**: `web/backend/src/handlers/voice-channel.handler.ts`
- **Exports**: `registerVoiceChannelHandlers()`
- **Manages**:
  - Voice channel participant tracking
  - Join/leave events
  - Mute/video/screenshare state
  - Broadcasting speaking status

## Socket.IO Events

### Client → Server

**voice:join**
```typescript
socket.emit('voice:join', (response) => {
  // response.success: boolean
  // response.participants: VoiceParticipant[]
  // response.roomId: string
});
```

**voice:leave**
```typescript
socket.emit('voice:leave');
```

**voice:mute**
```typescript
socket.emit('voice:mute', { isMuted: boolean });
```

**voice:video-toggle**
```typescript
socket.emit('voice:video-toggle', { hasVideo: boolean });
```

**voice:screenshare-toggle**
```typescript
socket.emit('voice:screenshare-toggle', { hasScreenShare: boolean });
```

**voice:speaking**
```typescript
socket.emit('voice:speaking', {
  isSpeaking: boolean,
  audioLevel: number // 0.0 - 1.0
});
```

### Server → Client

**voice:joined**
```typescript
socket.on('voice:joined', (data: {
  userId: number | string,
  username: string,
  isMuted: boolean,
  hasVideo: boolean,
  hasScreenShare: boolean
}) => {});
```

**voice:left**
```typescript
socket.on('voice:left', (data: {
  userId: number | string
}) => {});
```

**voice:speaking**
```typescript
socket.on('voice:speaking', (data: {
  userId: number | string,
  isSpeaking: boolean,
  audioLevel: number
}) => {});
```

**voice:video-toggle**
```typescript
socket.on('voice:video-toggle', (data: {
  userId: number | string,
  hasVideo: boolean
}) => {});
```

## Integration with Audio Streaming

The voice channel integrates seamlessly with the existing audio streaming infrastructure:

1. **Network Monitoring**: Automatic RTT measurement via ping/pong
2. **Adaptive Quality**: Adjusts bitrate/sample rate based on network conditions
3. **Voice Activity Detection (VAD)**: Detects when users are speaking
4. **Multi-party Support**: Up to 10 concurrent speakers (configurable)
5. **Audio Processing**: Echo cancellation, noise suppression, auto-gain

## Quality Profiles

| Network Score | Audio Profile | Bitrate | Sample Rate | Use Case |
|--------------|---------------|---------|-------------|----------|
| 80-100% | Studio | 64kbps | 48kHz | Music/broadcast |
| 60-79% | High Voice | 32kbps | 48kHz | Excellent voice |
| 40-59% | Voice | 16kbps | 48kHz | Good voice |
| 20-39% | Telephone | 8kbps | 16kHz | Acceptable |
| 0-19% | Emergency | 6kbps | 16kHz | Minimal |

## User Experience Flow

### Joining Voice Channel

1. User presses **F8** to open voice channel panel
2. Panel slides in from right side (25% width)
3. User clicks "Join Voice" button
4. Client sends `voice:join` event to server
5. Server adds user to voice channel room
6. Server broadcasts `voice:joined` to other participants
7. Client receives list of existing participants
8. Network monitoring starts automatically
9. Audio streaming begins with recommended quality
10. User appears in other participants' panels

### Speaking Indicators

1. Client monitors microphone audio levels (50ms intervals)
2. Voice Activity Detection (VAD) determines if speaking
3. Client broadcasts `voice:speaking` to server
4. Server relays to all participants in voice room
5. Speaking indicator `[*]` lights up green
6. Audio level bar animates based on volume
7. Indicators update in real-time (<100ms latency)

### Adaptive Quality

1. Network monitor sends ping every 2 seconds
2. Server responds with pong immediately
3. Client calculates RTT, packet loss, jitter
4. Quality manager generates recommendation
5. If auto-adjust enabled, quality changes automatically
6. Quality change notification displayed briefly
7. New bitrate/sample rate applied to audio stream

### Leaving Voice Channel

1. User presses **ESC** or leaves chat room
2. Audio streaming stops
3. Network monitoring stops
4. Client sends `voice:leave` to server
5. Server removes user from voice channel
6. Server broadcasts `voice:left` to participants
7. User removed from others' participant lists
8. Voice channel panel closes (or stays open)

## UI Layout

```
┌──────────────────────────────────────────────────┬──────────────┐
│ Chat Messages                                    │ Voice Channel│
│                                                  │              │
│ [10:30] Alice: Hey everyone!                     │ [ Join Voice]│
│ [10:31] Bob: What's up?                          │              │
│                                                  │ Participants │
│                                                  │ [*] [V]   Al │
│                                                  │  =======---- │
│                                                  │              │
│                                                  │ [ ] [V]   Bob│
│                                                  │  ===-------- │
│                                                  │              │
│                                                  │ Network      │
│                                                  │ [**] GOOD    │
│                                                  │ RTT: 45ms    │
│                                                  │ Score: 75%   │
│                                                  │              │
│                                                  │ Quality      │
│                                                  │ High Voice   │
│                                                  │ 32kbps @ 48k │
│                                                  │ Auto: ON     │
│                                                  │              │
│                                                  │ Controls     │
│                                                  │ [M] Mic      │
│                                                  │ [V] Video    │
│                                                  │ [A] Auto-Q   │
│                                                  │ [ESC] Leave  │
└──────────────────────────────────────────────────┴──────────────┘
```

## Implementation Notes

### Similarities to Discord

1. **Voice Channels**: Like Discord, voice is per-room/channel
2. **Join/Leave**: Click to join, persist until explicit leave
3. **Participant Grid**: Visual grid of participants with status
4. **Speaking Indicators**: Green border/icon when speaking
5. **Video Tiles**: Participant boxes with video/avatar
6. **Controls**: Mic, video, screenshare toggles

### BBS-Specific Adaptations

1. **ASCII UI**: Terminal-based instead of GUI
2. **Blessed Widgets**: Neo-blessed components instead of React
3. **Limited Colors**: 16-color ANSI palette
4. **Keyboard Controls**: Function keys instead of mouse-only
5. **ASCII Video**: Video converted to ASCII art (future)
6. **Lower Resolution**: Optimized for 80x24 terminal

## Future Enhancements

### Video Streaming
- ASCII video tiles for each participant
- Screen sharing support
- Picture-in-picture mode
- Video quality profiles

### Stage Channels
- Large-audience mode (up to 50+ viewers)
- Speaker queue system
- Moderator controls
- Raise hand feature

### Enhancements
- Spatial audio (left/right panning)
- Voice effects (filters, pitch, reverb)
- Recording/playback
- Statistics dashboard
- Bandwidth usage graphs

## Testing

To test voice channels:

1. Start BBS servers: `./dev/scripts/start-servers.sh`
2. Connect to BBS via telnet/web
3. Login and go to LiveChat
4. Press **F8** to open voice channel
5. Click "Join Voice" button
6. Open second client in another terminal
7. Join same chat room and voice channel
8. Speak into microphone - should see indicators
9. Check network quality and adaptive quality
10. Test mute, video toggle, quality controls

## Troubleshooting

### Voice channel not appearing
- Check F8 keyboard shortcut is working
- Verify voice-channel.handler.ts is registered
- Check browser console for errors
- Ensure microphone permissions granted

### No audio
- Check microphone is selected in browser settings
- Verify audio streaming service is running
- Check network-monitor handler is registered
- Test with voice-chat standalone door first

### Poor quality
- Check network quality panel (should show RTT, loss)
- Enable auto-quality adjustment (press A)
- Manually decrease quality with - key
- Check server bandwidth/CPU usage

### Participants not appearing
- Verify both users in same chat room
- Check voice:join event is emitted
- Check server logs for voice channel events
- Ensure socket connection is stable
