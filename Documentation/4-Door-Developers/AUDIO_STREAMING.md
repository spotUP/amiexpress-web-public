# Audio Streaming Guide

Complete guide to implementing real-time audio streaming in AmiExpress BBS doors.

## Table of Contents

- [Overview](#overview)
- [Quick Start](#quick-start)
- [Architecture](#architecture)
- [API Reference](#api-reference)
- [Audio Options](#audio-options)
- [Voice Activity Detection](#voice-activity-detection)
- [Multi-Party Audio](#multi-party-audio)
- [Performance Optimization](#performance-optimization)
- [Troubleshooting](#troubleshooting)
- [Examples](#examples)

---

## Overview

The AmiExpress Audio Streaming API provides real-time voice chat capabilities for BBS doors with:

- **Opus codec** - High-quality, low-latency audio compression
- **Voice Activity Detection (VAD)** - Automatic speaking detection
- **Multi-party support** - Up to 10 concurrent speakers (configurable)
- **Client-side processing** - Zero server CPU overhead for audio processing
- **Browser-native** - No external dependencies, uses Web Audio API
- **Real-time visualization** - Audio levels, waveforms, frequency data

### Key Features

✅ **Low Latency** - Typically <100ms end-to-end
✅ **Efficient** - 32kbps default bitrate, client-side encoding/decoding
✅ **Scalable** - Server only routes packets, no audio processing
✅ **Reliable** - Sequence numbering, jitter buffer, packet loss detection
✅ **Easy to Use** - Simple API, automatic resource cleanup

---

## Quick Start

### Basic Voice Chat

```typescript
import { CoreDoor as Door } from '@amiexpress/bbs-door-sdk';
import type { DoorContext } from '@amiexpress/bbs-door-sdk';

const door = new Door({
  name: 'Voice Chat',
  version: '1.0.0',
});

door.onStart(async (ctx: DoorContext) => {
  if (!ctx.audio) {
    console.log('Audio API not available');
    return;
  }

  // Start streaming audio
  const streamId = await ctx.audio.startStreaming({
    codec: 'opus',
    sampleRate: 48000,
    bitrate: 32000,
  });

  console.log(`Streaming started: ${streamId}`);

  // Listen for other speakers
  ctx.socket.on('audio-stream-started', (data) => {
    console.log(`${data.username} joined the chat`);
  });

  ctx.socket.on('audio-speaking-status', (data) => {
    if (data.isSpeaking) {
      console.log(`${data.username} is speaking (level: ${data.audioLevel})`);
    }
  });
});

door.onClose(async (ctx: DoorContext) => {
  // Cleanup - stop streaming
  if (ctx.audio) {
    await ctx.audio.stopStreaming();
  }
});

export default door;
```

### Running the Example

```bash
cd sdk/doors/voice-chat
npm install
npm run build

# Run the door (server must be running)
# Access via BBS menu or direct door execution
```

---

## Architecture

### Client-Side (Browser)

```
┌─────────────────────────────────────────────────────────┐
│  Door Application (Your Code)                          │
└────────────────┬────────────────────────────────────────┘
                 │
                 ▼
┌─────────────────────────────────────────────────────────┐
│  Audio API (ctx.audio)                                  │
│  - startStreaming()                                     │
│  - stopStreaming()                                      │
│  - setMuted()                                           │
│  - getAudioLevels()                                     │
└────────────────┬────────────────────────────────────────┘
                 │
                 ▼
┌─────────────────────────────────────────────────────────┐
│  AudioStream Class                                      │
│  - Manages stream lifecycle                            │
│  - Coordinates capture and callbacks                   │
└────────────────┬────────────────────────────────────────┘
                 │
                 ├──────────────────┐
                 ▼                  ▼
┌─────────────────────────┐  ┌──────────────────────────┐
│  AudioCapture           │  │  AudioPlayer             │
│  - Web Audio API        │  │  - Web Audio API         │
│  - MediaRecorder (Opus) │  │  - Decode & playback     │
│  - RMS calculation      │  │  - Jitter buffer         │
│  - Waveform/FFT         │  │  - Sequence ordering     │
└────────────┬────────────┘  └──────────┬───────────────┘
             │                          │
             │ audio chunks             │ audio chunks
             │ + audioLevel             │
             ▼                          ▲
┌─────────────────────────────────────────────────────────┐
│  Socket.IO Connection                                   │
└─────────────────────────────────────────────────────────┘
```

### Server-Side (Node.js)

```
┌─────────────────────────────────────────────────────────┐
│  Socket.IO Server                                       │
└────────────────┬────────────────────────────────────────┘
                 │
                 ▼
┌─────────────────────────────────────────────────────────┐
│  Audio Stream Handlers                                  │
│  - audio-start-streaming                                │
│  - audio-stop-streaming                                 │
│  - audio-chunk-send                                     │
│  - audio-mute                                           │
└────────────────┬────────────────────────────────────────┘
                 │
                 ▼
┌─────────────────────────────────────────────────────────┐
│  AudioStreamService                                     │
│  - Track active streams                                 │
│  - Voice activity detection (using client RMS)         │
│  - Broadcast chunks to subscribers                     │
│  - Resource limits & cleanup                           │
└─────────────────────────────────────────────────────────┘
                 │
                 ▼
┌─────────────────────────────────────────────────────────┐
│  Broadcast to all connected clients                     │
│  (except sender)                                        │
└─────────────────────────────────────────────────────────┘
```

### Key Design Decisions

**Client-Side Audio Processing**
All CPU-intensive operations (encoding, decoding, RMS calculation) happen in the browser to prevent server overload.

**No Server-Side Mixing**
Server broadcasts raw audio chunks to clients. Each client's browser mixes received streams. This scales better than server-side mixing.

**Voice Activity Detection**
Client calculates RMS audio level and sends it with each chunk. Server uses this for VAD instead of processing audio data.

**Opus Codec via MediaRecorder**
Uses browser-native MediaRecorder API for Opus encoding - no external libraries needed.

---

## API Reference

### ctx.audio

The audio API is available in the door context as `ctx.audio`.

#### startStreaming(options?)

Start streaming audio from the local microphone.

```typescript
const streamId = await ctx.audio.startStreaming({
  codec: 'opus',           // 'opus' or 'pcm' (default: 'opus')
  sampleRate: 48000,       // 48000 or 16000 (default: 48000)
  bitrate: 32000,          // bits per second (default: 32000)
  echoCancellation: true,  // Enable echo cancellation (default: true)
  noiseSuppression: true,  // Enable noise suppression (default: true)
  autoGainControl: true,   // Enable auto gain control (default: true)
  channelCount: 1,         // 1 (mono) or 2 (stereo) (default: 1)
  visualize: true,         // Enable waveform/FFT data (default: true)
});
```

**Returns:** Promise<string> - Stream ID
**Throws:** Error if already streaming or permission denied

#### stopStreaming()

Stop streaming audio.

```typescript
await ctx.audio.stopStreaming();
```

**Returns:** Promise<void>
**Throws:** Error if not streaming

#### setMuted(muted)

Mute or unmute the local microphone.

```typescript
ctx.audio.setMuted(true);  // Mute
ctx.audio.setMuted(false); // Unmute
```

**Parameters:**
- `muted` (boolean) - Mute state

**Note:** Audio stream continues but chunks are not sent when muted.

#### setVolume(volume)

Set playback volume for incoming audio.

```typescript
ctx.audio.setVolume(0.8); // 80% volume
```

**Parameters:**
- `volume` (number) - Volume level 0.0 to 1.0

#### getAudioLevels()

Get current audio levels and visualization data.

```typescript
const levels = ctx.audio.getAudioLevels();

console.log(levels.input);    // 0.0 - 1.0 (microphone level)
console.log(levels.output);   // 0.0 - 1.0 (speaker level)
console.log(levels.waveform); // Array<number> - Last 50 samples
```

**Returns:** AudioLevels object

#### getActiveStreams()

Get information about all active audio streams.

```typescript
const streams = ctx.audio.getActiveStreams();

for (const stream of streams) {
  console.log(`${stream.username}: speaking=${stream.isSpeaking}, level=${stream.audioLevel}`);
}
```

**Returns:** Array<AudioStreamInfo>

#### subscribe(userId)

Subscribe to a specific user's audio stream (for targeted listening).

```typescript
await ctx.audio.subscribe(targetUserId);
```

**Parameters:**
- `userId` (number | string) - User ID to subscribe to

**Returns:** Promise<void>

#### unsubscribe(userId)

Unsubscribe from a user's audio stream.

```typescript
await ctx.audio.unsubscribe(targetUserId);
```

**Parameters:**
- `userId` (number | string) - User ID to unsubscribe from

**Returns:** Promise<void>

---

## Audio Options

### Codec Selection

**Opus (Recommended)**
- High quality at low bitrates
- 32kbps provides excellent voice quality
- Browser-native via MediaRecorder API
- 20-40ms latency

**PCM**
- Uncompressed raw audio
- Much higher bandwidth (768kbps @ 48kHz mono)
- No encoding latency
- Use only for local/LAN deployments

```typescript
// Opus (recommended for internet)
await ctx.audio.startStreaming({
  codec: 'opus',
  bitrate: 32000, // 32kbps
});

// PCM (local/LAN only)
await ctx.audio.startStreaming({
  codec: 'pcm',
  sampleRate: 16000, // Lower sample rate to reduce bandwidth
});
```

### Sample Rate

**48000 Hz (Recommended)**
- Full audio bandwidth (20-20kHz)
- Best quality for music/high-fidelity
- Standard for Opus codec

**16000 Hz**
- Telephone quality (8kHz bandwidth)
- Lower bandwidth usage
- Sufficient for voice-only chat

```typescript
// High quality
await ctx.audio.startStreaming({
  sampleRate: 48000,
  bitrate: 32000,
});

// Lower bandwidth
await ctx.audio.startStreaming({
  sampleRate: 16000,
  bitrate: 16000,
});
```

### Audio Processing

Enable browser-native audio processing for better quality:

```typescript
await ctx.audio.startStreaming({
  echoCancellation: true,  // Remove echo from speakers
  noiseSuppression: true,  // Reduce background noise
  autoGainControl: true,   // Automatic volume normalization
});
```

**Echo Cancellation** - Essential for speaker + microphone setups
**Noise Suppression** - Reduces background noise (keyboard, fans, etc.)
**Auto Gain Control** - Normalizes volume across users

---

## Voice Activity Detection

Automatic detection of when users are speaking using RMS (Root Mean Square) energy calculation.

### How It Works

1. **Client calculates RMS** for each audio chunk (20ms)
2. **Server compares** RMS to threshold (default: 0.01 = 1%)
3. **Speaking status** broadcast to all clients
4. **Visual indicators** can be shown for active speakers

### Configuration

Server-side configuration in `audio-stream.service.ts`:

```typescript
const DEFAULT_CONFIG: AudioConfig = {
  vadThreshold: 0.01, // 1% audio level
  // ...
};
```

### Using VAD in Your Door

```typescript
ctx.socket.on('audio-speaking-status', (data) => {
  const { userId, username, isSpeaking, audioLevel } = data;

  if (isSpeaking) {
    // Show green indicator, highlight user, etc.
    console.log(`${username} is speaking (${Math.floor(audioLevel * 100)}%)`);
  } else {
    // Show gray indicator
    console.log(`${username} is idle`);
  }
});
```

### Audio Level Visualization

```typescript
function renderAudioBar(level: number): string {
  const barWidth = 40;
  const filled = Math.floor(level * barWidth);
  const empty = barWidth - filled;

  let bar = '';
  if (level < 0.3) {
    bar = '{green-fg}';
  } else if (level < 0.7) {
    bar = '{yellow-fg}';
  } else {
    bar = '{red-fg}';
  }

  bar += '='.repeat(filled) + '{/}' + '-'.repeat(empty);
  return bar + ` ${Math.floor(level * 100)}%`;
}
```

---

## Multi-Party Audio

### Concurrent Speaker Limits

Default limit: **10 concurrent speakers**

Configurable in `audio-stream.service.ts`:

```typescript
const DEFAULT_CONFIG: AudioConfig = {
  maxConcurrentSpeakers: 10,
  // ...
};
```

### Managing Speakers

**Track active speakers:**

```typescript
const speakers = new Map<number | string, SpeakerInfo>();

ctx.socket.on('audio-stream-started', (data) => {
  speakers.set(data.userId, {
    userId: data.userId,
    username: data.username,
    isSpeaking: false,
    audioLevel: 0,
  });

  updateSpeakersList();
});

ctx.socket.on('audio-stream-stopped', (data) => {
  speakers.delete(data.userId);
  updateSpeakersList();
});

ctx.socket.on('audio-speaking-status', (data) => {
  const speaker = speakers.get(data.userId);
  if (speaker) {
    speaker.isSpeaking = data.isSpeaking;
    speaker.audioLevel = data.audioLevel;
    updateSpeakersList();
  }
});
```

**Subscribe to specific speakers:**

```typescript
// Subscribe to all speakers
for (const speaker of speakers.values()) {
  await ctx.audio.subscribe(speaker.userId);
}

// Unsubscribe from a speaker
await ctx.audio.unsubscribe(userId);
```

### Audio Mixing

**Client-side mixing** (automatic) - Browser mixes all received audio streams into speaker output. No configuration needed.

**Server-side mixing** (not implemented by default) - Would require `AudioMixerService` integration for server-side mixing before broadcast.

---

## Performance Optimization

### Client-Side Processing

All CPU-intensive work happens in the browser:

✅ **Audio capture** - Web Audio API
✅ **Opus encoding** - MediaRecorder API
✅ **RMS calculation** - Client-side
✅ **Decoding & playback** - Web Audio API
✅ **Waveform/FFT analysis** - AnalyserNode

### Server Optimization

The server **NEVER** processes audio data:

- ✅ Receives encoded chunks from clients
- ✅ Broadcasts chunks to other clients
- ✅ Uses client-provided RMS for VAD
- ✅ Simple state tracking (mute, speakers)

**Bandwidth usage per speaker:**
- Opus 32kbps: ~4 KB/s upload, ~40 KB/s download (10 speakers)
- Opus 16kbps: ~2 KB/s upload, ~20 KB/s download (10 speakers)

### Resource Limits

**Auto-cleanup:**
- Max stream duration: 1 hour (default)
- Idle timeout: 5 minutes (default)
- Automatic disconnect cleanup

**Configuration:**

```typescript
const DEFAULT_CONFIG: AudioConfig = {
  maxStreamDuration: 3600,  // 1 hour
  autoStopOnIdle: true,
  idleTimeout: 300,         // 5 minutes
};
```

---

## Troubleshooting

### Microphone Permission Denied

**Problem:** Browser blocks microphone access

**Solution:**
- Ensure HTTPS connection (required for getUserMedia)
- Check browser permission settings
- User must explicitly grant microphone permission

```typescript
try {
  await ctx.audio.startStreaming();
} catch (error) {
  if (error.message.includes('Permission denied')) {
    console.log('Please allow microphone access in your browser');
  }
}
```

### No Audio Output

**Problem:** Can't hear other speakers

**Symptoms:**
- Seeing speaking indicators
- Audio chunks being received
- No sound from speakers

**Solutions:**

1. **Check volume:**
```typescript
ctx.audio.setVolume(1.0); // 100% volume
```

2. **Check browser audio:**
- Ensure browser tab is not muted
- Check system volume
- Verify speaker output device

3. **Check subscriptions:**
```typescript
// Make sure you're subscribed to speakers
const streams = ctx.audio.getActiveStreams();
for (const stream of streams) {
  await ctx.audio.subscribe(stream.userId);
}
```

### High Latency

**Problem:** Delay between speaking and hearing

**Causes:**
- Network latency
- Jitter buffer too large
- Too many concurrent streams

**Solutions:**

1. **Reduce jitter buffer:**
```typescript
// In AudioPlayer.ts (SDK modification)
private jitterBufferMs = 30; // Reduce from 50ms
```

2. **Lower bitrate:**
```typescript
await ctx.audio.startStreaming({
  bitrate: 16000, // Lower bitrate
});
```

3. **Reduce sample rate:**
```typescript
await ctx.audio.startStreaming({
  sampleRate: 16000, // Lower quality but faster
});
```

### Echo/Feedback

**Problem:** Hearing your own voice back

**Solutions:**

1. **Enable echo cancellation:**
```typescript
await ctx.audio.startStreaming({
  echoCancellation: true, // Should be enabled by default
});
```

2. **Use headphones** instead of speakers

3. **Check audio routing:**
- Make sure you're not in your own subscribers list
- Server should not send your own chunks back to you

### Stream Not Starting

**Problem:** startStreaming() fails

**Common errors:**

1. **Already streaming:**
```typescript
// Stop existing stream first
await ctx.audio.stopStreaming();
await ctx.audio.startStreaming();
```

2. **Max speakers reached:**
```typescript
// Server-side: increase limit in config
maxConcurrentSpeakers: 20,
```

3. **User not authenticated:**
```typescript
// Ensure user is logged in
if (!ctx.user || !ctx.user.id) {
  console.log('User not authenticated');
}
```

### Audio Quality Issues

**Problem:** Poor audio quality, crackling, dropouts

**Solutions:**

1. **Increase bitrate:**
```typescript
await ctx.audio.startStreaming({
  bitrate: 64000, // Higher quality
});
```

2. **Check packet loss:**
```typescript
// Monitor sequence numbers for gaps
ctx.socket.on('audio-chunk', (data) => {
  console.log(`Seq: ${data.sequenceNumber}`);
});
```

3. **Network issues:**
- Check bandwidth
- Reduce number of concurrent speakers
- Lower sample rate/bitrate

---

## Examples

### Example 1: Simple Voice Chat

See `sdk/doors/voice-chat/` for complete implementation.

### Example 2: Push-to-Talk

```typescript
let isTransmitting = false;

screen.key(['space'], async () => {
  if (!isTransmitting) {
    // Start transmitting when space pressed
    await ctx.audio.startStreaming();
    isTransmitting = true;
    updateStatus('TRANSMITTING');
  }
});

screen.key(['space'], async () => {
  if (isTransmitting) {
    // Stop transmitting when space released
    await ctx.audio.stopStreaming();
    isTransmitting = false;
    updateStatus('IDLE');
  }
});
```

### Example 3: Selective Listening

```typescript
// Only listen to specific users
const allowedSpeakers = [user1Id, user2Id, user3Id];

ctx.socket.on('audio-stream-started', async (data) => {
  if (allowedSpeakers.includes(data.userId)) {
    await ctx.audio.subscribe(data.userId);
    console.log(`Subscribed to ${data.username}`);
  }
});
```

### Example 4: Audio Level Meter

```typescript
setInterval(() => {
  const levels = ctx.audio.getAudioLevels();

  // Draw VU meter
  const bars = Math.floor(levels.input * 20);
  const meter = '[' + '='.repeat(bars) + ' '.repeat(20 - bars) + ']';

  meterBox.setContent(`Input: ${meter} ${Math.floor(levels.input * 100)}%`);
  screen.render();
}, 50);
```

### Example 5: Recording Status Indicator

```typescript
let recordingIndicator: NodeJS.Timeout;

ctx.socket.on('audio-stream-started', (data) => {
  if (data.userId === ctx.user.id) {
    // Blink red "REC" indicator
    let visible = true;
    recordingIndicator = setInterval(() => {
      statusBox.setContent(visible ? '{red-fg}[REC]{/red-fg}' : '     ');
      visible = !visible;
      screen.render();
    }, 500);
  }
});

ctx.socket.on('audio-stream-stopped', (data) => {
  if (data.userId === ctx.user.id && recordingIndicator) {
    clearInterval(recordingIndicator);
    statusBox.setContent('');
    screen.render();
  }
});
```

---

## Best Practices

### Resource Management

✅ **Always cleanup on close:**
```typescript
door.onClose(async (ctx) => {
  if (ctx.audio) {
    await ctx.audio.stopStreaming();
  }
});
```

✅ **Handle disconnects gracefully:**
Server automatically cleans up streams on disconnect.

✅ **Monitor active streams:**
```typescript
const streams = ctx.audio.getActiveStreams();
if (streams.length >= 10) {
  console.log('Chat room full');
}
```

### User Experience

✅ **Show visual feedback:**
- Speaking indicators for active speakers
- Audio level meters
- Waveform visualization
- Connection status

✅ **Provide controls:**
- Mute/unmute button
- Volume control
- Speaker list
- Push-to-talk option

✅ **Handle errors gracefully:**
- Microphone permission denied
- Stream limit reached
- Network disconnection

### Performance

✅ **Use Opus codec** for internet connections
✅ **Enable audio processing** (echo cancellation, noise suppression)
✅ **Monitor bandwidth** usage
✅ **Set appropriate limits** on concurrent speakers

---

## See Also

- [Door Development Guide](./DOOR_DEVELOPMENT.md)
- [Video Streaming Guide](./VIDEO_STREAMING.md)
- [SDK API Reference](../../sdk/README.md)
- [Voice Chat Example](../../sdk/doors/voice-chat/)
