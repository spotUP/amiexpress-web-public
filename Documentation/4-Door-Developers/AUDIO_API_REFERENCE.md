# Audio Streaming API Reference

Complete TypeScript API reference for audio streaming in AmiExpress BBS.

## Table of Contents

- [Core Interfaces](#core-interfaces)
- [Audio API](#audio-api)
- [Socket.IO Events](#socketio-events)
- [Configuration](#configuration)
- [Type Definitions](#type-definitions)

---

## Core Interfaces

### AudioAPI

Main audio streaming interface available as `ctx.audio` in door context.

```typescript
interface AudioAPI {
  /**
   * Start streaming audio from microphone
   * @param options - Audio stream configuration
   * @returns Promise<string> - Stream ID
   * @throws Error if already streaming or permission denied
   */
  startStreaming(options?: AudioStreamOptions): Promise<string>;

  /**
   * Stop streaming audio
   * @throws Error if not streaming
   */
  stopStreaming(): Promise<void>;

  /**
   * Get all active audio streams
   * @returns Array of active stream information
   */
  getActiveStreams(): AudioStreamInfo[];

  /**
   * Mute/unmute local microphone
   * @param muted - Mute state (true = muted, false = unmuted)
   */
  setMuted(muted: boolean): void;

  /**
   * Set playback volume for incoming audio
   * @param volume - Volume level 0.0 to 1.0
   */
  setVolume(volume: number): void;

  /**
   * Get current audio levels and visualization data
   * @returns Audio levels object
   */
  getAudioLevels(): AudioLevels;

  /**
   * Subscribe to a specific user's audio stream
   * @param userId - User ID to subscribe to
   */
  subscribe(userId: number | string): Promise<void>;

  /**
   * Unsubscribe from a user's audio stream
   * @param userId - User ID to unsubscribe from
   */
  unsubscribe(userId: number | string): Promise<void>;
}
```

---

## Audio API

### AudioStreamOptions

Configuration options for audio streaming.

```typescript
interface AudioStreamOptions {
  /**
   * Audio codec
   * - 'opus': High-quality compressed codec (recommended)
   * - 'pcm': Uncompressed raw audio (high bandwidth)
   * @default 'opus'
   */
  codec?: 'opus' | 'pcm';

  /**
   * Sample rate in Hz
   * - 48000: Full bandwidth (20-20kHz) - recommended
   * - 16000: Telephone quality (8kHz bandwidth)
   * @default 48000
   */
  sampleRate?: 48000 | 16000;

  /**
   * Bitrate in bits per second (applies to Opus codec)
   * Common values:
   * - 16000: Low bandwidth, acceptable quality
   * - 32000: Good quality (recommended)
   * - 64000: High quality
   * @default 32000
   */
  bitrate?: number;

  /**
   * Enable echo cancellation
   * Removes echo from speakers - essential for speaker+mic setups
   * @default true
   */
  echoCancellation?: boolean;

  /**
   * Enable noise suppression
   * Reduces background noise (keyboard, fans, etc.)
   * @default true
   */
  noiseSuppression?: boolean;

  /**
   * Enable automatic gain control
   * Normalizes volume levels across users
   * @default true
   */
  autoGainControl?: boolean;

  /**
   * Number of audio channels
   * - 1: Mono (recommended for voice chat)
   * - 2: Stereo
   * @default 1
   */
  channelCount?: 1 | 2;

  /**
   * Enable waveform and frequency visualization data
   * @default true
   */
  visualize?: boolean;
}
```

**Example:**

```typescript
await ctx.audio.startStreaming({
  codec: 'opus',
  sampleRate: 48000,
  bitrate: 32000,
  echoCancellation: true,
  noiseSuppression: true,
  autoGainControl: true,
  channelCount: 1,
  visualize: true,
});
```

### AudioStreamInfo

Information about an active audio stream.

```typescript
interface AudioStreamInfo {
  /**
   * User ID of the speaker
   */
  userId: number | string;

  /**
   * Username of the speaker
   */
  username: string;

  /**
   * Whether user is currently speaking (voice activity detection)
   */
  isSpeaking: boolean;

  /**
   * Current audio level (0.0 to 1.0)
   * Calculated using RMS (Root Mean Square) energy
   */
  audioLevel: number;
}
```

**Example:**

```typescript
const streams = ctx.audio.getActiveStreams();

for (const stream of streams) {
  console.log(`${stream.username}:`);
  console.log(`  Speaking: ${stream.isSpeaking}`);
  console.log(`  Level: ${Math.floor(stream.audioLevel * 100)}%`);
}
```

### AudioLevels

Real-time audio level monitoring and visualization data.

```typescript
interface AudioLevels {
  /**
   * Microphone input level (0.0 to 1.0)
   * RMS audio level from local microphone
   */
  input: number;

  /**
   * Speaker output level (0.0 to 1.0)
   * Combined level of all incoming audio streams
   */
  output: number;

  /**
   * Waveform data for visualization
   * Last 50 audio samples from microphone
   * Values range from -1.0 to 1.0
   */
  waveform: number[];
}
```

**Example:**

```typescript
const levels = ctx.audio.getAudioLevels();

// Input VU meter
const inputBars = Math.floor(levels.input * 20);
console.log(`Input:  [${'='.repeat(inputBars)}${' '.repeat(20 - inputBars)}]`);

// Output VU meter
const outputBars = Math.floor(levels.output * 20);
console.log(`Output: [${'='.repeat(outputBars)}${' '.repeat(20 - outputBars)}]`);

// Simple waveform
const waveform = levels.waveform.map((s) => {
  const height = Math.floor(Math.abs(s) * 10);
  return height > 0 ? '|' : '·';
}).join('');
console.log(`Wave: ${waveform}`);
```

---

## Socket.IO Events

### Client to Server

#### audio-start-streaming

Request to start audio streaming.

```typescript
socket.emit(
  'audio-start-streaming',
  options: AudioStreamOptions,
  callback: (result: {
    success: boolean;
    streamId?: string;
    error?: string;
  }) => void
);
```

**Example:**

```typescript
ctx.socket.emit('audio-start-streaming', options, (result) => {
  if (result.success) {
    console.log(`Stream started: ${result.streamId}`);
  } else {
    console.error(`Failed: ${result.error}`);
  }
});
```

#### audio-stop-streaming

Request to stop audio streaming.

```typescript
socket.emit(
  'audio-stop-streaming',
  callback: (result: {
    success: boolean;
    error?: string;
  }) => void
);
```

#### audio-chunk-send

Send audio chunk to server (called automatically by SDK).

```typescript
socket.emit(
  'audio-chunk-send',
  chunk: ArrayBuffer,
  sequenceNumber: number,
  audioLevel: number
);
```

**Note:** This is called internally by the SDK. You don't need to call it manually.

#### audio-mute

Mute/unmute microphone.

```typescript
socket.emit('audio-mute', muted: boolean);
```

#### audio-subscribe

Subscribe to a specific user's audio stream.

```typescript
socket.emit(
  'audio-subscribe',
  userId: number | string,
  callback: (result: {
    success: boolean;
    error?: string;
  }) => void
);
```

#### audio-unsubscribe

Unsubscribe from a user's audio stream.

```typescript
socket.emit(
  'audio-unsubscribe',
  userId: number | string,
  callback: (result: {
    success: boolean;
    error?: string;
  }) => void
);
```

### Server to Client

#### audio-stream-started

Broadcast when a user starts streaming.

```typescript
socket.on('audio-stream-started', (data: {
  userId: number | string;
  username: string;
  streamId: string;
  codec: 'opus' | 'pcm';
  sampleRate: number;
}) => void);
```

**Example:**

```typescript
ctx.socket.on('audio-stream-started', (data) => {
  console.log(`${data.username} started streaming`);
  console.log(`Codec: ${data.codec} @ ${data.sampleRate}Hz`);

  // Subscribe to their audio
  await ctx.audio.subscribe(data.userId);
});
```

#### audio-stream-stopped

Broadcast when a user stops streaming.

```typescript
socket.on('audio-stream-stopped', (data: {
  userId: number | string;
  streamId: string;
  reason: string;
}) => void);
```

**Reason values:**
- `'user'` - User manually stopped
- `'disconnect'` - User disconnected
- `'max_duration'` - Stream exceeded max duration
- `'idle_timeout'` - Stream was idle too long

**Example:**

```typescript
ctx.socket.on('audio-stream-stopped', (data) => {
  console.log(`Stream stopped: ${data.reason}`);
});
```

#### audio-speaking-status

Broadcast when a user's speaking status changes.

```typescript
socket.on('audio-speaking-status', (data: {
  userId: number | string;
  username: string;
  isSpeaking: boolean;
  audioLevel: number;
}) => void);
```

**Example:**

```typescript
ctx.socket.on('audio-speaking-status', (data) => {
  if (data.isSpeaking) {
    console.log(`${data.username} is speaking (${Math.floor(data.audioLevel * 100)}%)`);
    // Show green indicator
  } else {
    // Show gray indicator
  }
});
```

#### audio-chunk

Receive audio chunk from another user (handled automatically by SDK).

```typescript
socket.on('audio-chunk', (data: {
  userId: number | string;
  username: string;
  chunk: ArrayBuffer;
  timestamp: number;
  sequenceNumber: number;
}) => void);
```

**Note:** Audio chunks are automatically played by the SDK's AudioPlayer. You don't need to handle this event manually.

#### audio-error

Server error notification.

```typescript
socket.on('audio-error', (data: {
  code: string;
  message: string;
}) => void);
```

**Error codes:**
- `'CHUNK_PROCESS_ERROR'` - Failed to process audio chunk
- `'MUTE_ERROR'` - Failed to mute/unmute
- `'STREAM_ERROR'` - General stream error

**Example:**

```typescript
ctx.socket.on('audio-error', (data) => {
  console.error(`Audio error [${data.code}]: ${data.message}`);
});
```

---

## Configuration

### AudioConfig (Server-Side)

Server configuration for audio streaming service.

Located in: `web/backend/src/services/audio-stream.service.ts`

```typescript
interface AudioConfig {
  /**
   * Maximum number of concurrent speakers
   * @default 10
   */
  maxConcurrentSpeakers: number;

  /**
   * Maximum stream duration in seconds
   * @default 3600 (1 hour)
   */
  maxStreamDuration: number;

  /**
   * Automatically stop streams that are idle
   * @default true
   */
  autoStopOnIdle: boolean;

  /**
   * Idle timeout in seconds
   * Stream is considered idle if no chunks received
   * @default 300 (5 minutes)
   */
  idleTimeout: number;

  /**
   * Voice activity detection threshold
   * RMS level above this is considered "speaking"
   * @default 0.01 (1%)
   */
  vadThreshold: number;

  /**
   * Default sample rate for streams
   * @default 48000
   */
  defaultSampleRate: number;

  /**
   * Default bitrate for Opus codec
   * @default 32000
   */
  defaultBitrate: number;

  /**
   * Jitter buffer size in milliseconds
   * @default 50
   */
  jitterBufferMs: number;
}
```

**Default configuration:**

```typescript
const DEFAULT_CONFIG: AudioConfig = {
  maxConcurrentSpeakers: 10,
  maxStreamDuration: 3600,
  autoStopOnIdle: true,
  idleTimeout: 300,
  vadThreshold: 0.01,
  defaultSampleRate: 48000,
  defaultBitrate: 32000,
  jitterBufferMs: 50,
};
```

---

## Type Definitions

### AudioStream Class

Internal class for managing audio stream lifecycle.

```typescript
class AudioStream extends EventEmitter {
  /** Unique stream ID */
  readonly id: string;

  /** User ID */
  readonly userId: number | string;

  /** Username */
  readonly username: string;

  /** Stream status */
  status: 'starting' | 'active' | 'muted' | 'stopped';

  /** Mute state */
  isMuted: boolean;

  /** Playback volume */
  volume: number;

  /** Start timestamp */
  startedAt: Date;

  /**
   * Start audio stream
   * @param onChunk - Callback for each audio chunk
   */
  async start(
    onChunk: (chunk: ArrayBuffer, sequenceNumber: number) => void
  ): Promise<void>;

  /**
   * Stop audio stream
   */
  async stop(): Promise<void>;

  /**
   * Mute the stream
   */
  mute(): void;

  /**
   * Unmute the stream
   */
  unmute(): void;

  /**
   * Get current audio level
   * @returns RMS audio level (0.0 - 1.0)
   */
  getAudioLevel(): number;

  /**
   * Get waveform data for visualization
   * @returns Array of last 50 audio samples
   */
  getWaveform(): number[];

  /**
   * Get frequency spectrum data
   * @returns Array of frequency bins
   */
  getFrequencyData(): Uint8Array;
}
```

### AudioCapture Class

Internal class for microphone capture using Web Audio API.

```typescript
class AudioCapture extends EventEmitter {
  /**
   * Start capturing audio from microphone
   */
  async start(): Promise<void>;

  /**
   * Stop capturing audio
   */
  stop(): void;

  /**
   * Get current audio level
   */
  getAudioLevel(): number;

  /**
   * Get waveform data
   */
  getWaveform(): number[];

  /**
   * Get frequency data
   */
  getFrequencyData(): Uint8Array;
}
```

### AudioPlayer Class

Internal class for playing received audio chunks.

```typescript
class AudioPlayer extends EventEmitter {
  /**
   * Play an audio chunk
   * @param audioData - Audio data to play
   * @param sequenceNumber - Sequence number for ordering
   */
  async playChunk(
    audioData: ArrayBuffer,
    sequenceNumber: number
  ): Promise<void>;

  /**
   * Set playback volume
   * @param volume - Volume level (0.0 - 1.0)
   */
  setVolume(volume: number): void;

  /**
   * Get current playback volume
   */
  getVolume(): number;

  /**
   * Stop playback and cleanup
   */
  stop(): void;
}
```

---

## Usage Examples

### Basic Setup

```typescript
import type { DoorContext } from '@amiexpress/bbs-door-sdk';

async function startVoiceChat(ctx: DoorContext) {
  if (!ctx.audio) {
    console.log('Audio API not available');
    return;
  }

  // Start streaming
  const streamId = await ctx.audio.startStreaming({
    codec: 'opus',
    sampleRate: 48000,
    bitrate: 32000,
  });

  console.log(`Streaming: ${streamId}`);
}
```

### Monitor Audio Levels

```typescript
setInterval(() => {
  const levels = ctx.audio.getAudioLevels();

  console.log(`Input: ${Math.floor(levels.input * 100)}%`);
  console.log(`Output: ${Math.floor(levels.output * 100)}%`);
}, 100);
```

### Track Active Speakers

```typescript
const speakers = new Map();

ctx.socket.on('audio-stream-started', (data) => {
  speakers.set(data.userId, {
    username: data.username,
    isSpeaking: false,
    level: 0,
  });
});

ctx.socket.on('audio-speaking-status', (data) => {
  const speaker = speakers.get(data.userId);
  if (speaker) {
    speaker.isSpeaking = data.isSpeaking;
    speaker.level = data.audioLevel;
  }
});

ctx.socket.on('audio-stream-stopped', (data) => {
  speakers.delete(data.userId);
});
```

---

## See Also

- [Audio Streaming Guide](./AUDIO_STREAMING.md) - Complete usage guide
- [Voice Chat Example](../../sdk/doors/voice-chat/) - Working example
- [Door Development Guide](./DOOR_DEVELOPMENT.md) - General door development
