# Implementation Prompt: Real-Time Audio Streaming for SDK

**Created:** 2025-12-28
**Status:** Not Started
**Priority:** Feature Enhancement
**Complexity:** High
**Dependencies:** IMPLEMENT_ASCII_VIDEO_STREAMING.md (recommended to implement first)

---

## Overview

Implement real-time audio streaming capability in the BBS Door SDK to enable voice chat features in doors like livechat. This will complement the ASCII video streaming feature, allowing users to have complete audio+video chat sessions within the BBS terminal environment.

## Goals

1. Add real-time audio streaming API to SDK (`@amiexpress/bbs-door-sdk`)
2. Support multi-party voice chat (3+ simultaneous speakers)
3. Enable WebRTC peer-to-peer OR Socket.IO streaming approaches
4. Integrate with xterm.js frontend for audio playback
5. Optional: ASCII waveform visualization in terminal
6. Synchronize with ASCII video streams
7. Provide livechat door as reference implementation
8. Low latency (<100ms) for natural conversation

## Technical Requirements

### Core Technologies

**Recommended Approach: Hybrid Architecture**
- **WebRTC** for P2P audio when 2 users (lowest latency)
- **mediasoup SFU** for 3+ users (scalable multi-party)
- **Socket.IO** as signaling layer
- **Opus codec** for audio encoding (best quality/bandwidth ratio)

**Alternative: Pure Socket.IO Streaming**
- Simpler implementation (no WebRTC complexity)
- Higher latency (~200-300ms)
- More server bandwidth usage
- Easier to debug and maintain

### Constraints (from CLAUDE.md)

- **No background processes:** All streaming must use proper async/await
- **Terminal environment:** 80x24 characters (audio visualization optional)
- **Real-time performance:** <100ms latency for WebRTC, <300ms for Socket.IO
- **Multi-client support:** Scale to 5+ simultaneous speakers
- **Browser compatibility:** Works with xterm.js + Web Audio API

### Audio Specifications

- **Sample Rate:** 48kHz (Opus standard)
- **Bitrate:** 24-64 kbps (voice optimized)
- **Codec:** Opus (WebRTC standard, royalty-free)
- **Channels:** Mono (sufficient for voice chat)
- **Frame Size:** 20ms (960 samples at 48kHz)
- **Packet Loss:** Opus built-in FEC (Forward Error Correction)

## Architecture Design

### Option 1: WebRTC + mediasoup (RECOMMENDED)

**Pros:**
- Ultra-low latency (<100ms)
- Industry standard (Zoom, Google Meet use this)
- Built-in encryption (DTLS-SRTP)
- NAT traversal with STUN/TURN
- Scales to 10+ participants with SFU

**Cons:**
- Complex setup (STUN/TURN servers)
- Requires understanding of WebRTC signaling
- More moving parts to debug

**Architecture:**

```
┌─────────────────────────────────────────────────────────────┐
│ Client 1 (Browser)                                          │
│ ┌─────────────────┐    WebRTC Audio    ┌─────────────────┐ │
│ │ Microphone      │───────────────────→│ mediasoup SFU   │ │
│ │ (getUserMedia)  │                    │ (Node.js)       │ │
│ └─────────────────┘                    └────────┬────────┘ │
│                                                  │          │
│ ┌─────────────────┐                             │          │
│ │ Audio Output    │←────────────────────────────┘          │
│ │ (Web Audio API) │    WebRTC Audio                        │
│ └─────────────────┘                                        │
│                                                             │
│ ┌─────────────────┐    Socket.IO       ┌─────────────────┐│
│ │ xterm.js        │←──────────────────→│ BBS Server      ││
│ │ (Terminal UI)   │    Signaling       │ (Socket.IO)     ││
│ └─────────────────┘                    └─────────────────┘│
└─────────────────────────────────────────────────────────────┘
```

### Option 2: Socket.IO Audio Streaming (SIMPLER)

**Pros:**
- Simpler implementation
- No STUN/TURN servers needed
- Easier to debug
- Uses existing Socket.IO infrastructure

**Cons:**
- Higher latency (~200-300ms)
- More server bandwidth
- No built-in encryption (need to add)
- Server CPU overhead for mixing

**Architecture:**

```
┌─────────────────────────────────────────────────────────────┐
│ Client 1 (Browser)                                          │
│ ┌─────────────────┐                                         │
│ │ Microphone      │                                         │
│ │ (getUserMedia)  │                                         │
│ └────────┬────────┘                                         │
│          │                                                   │
│          ▼                                                   │
│ ┌─────────────────┐    MediaRecorder API                   │
│ │ Opus Encoder    │───→ chunks (20ms)                       │
│ │ (opus-recorder) │                                         │
│ └────────┬────────┘                                         │
│          │                                                   │
│          ▼                                                   │
│ ┌─────────────────┐    Socket.IO        ┌─────────────────┐│
│ │ Socket Client   │────'audio-chunk'───→│ BBS Server      ││
│ └─────────────────┘                     │ (Node.js)       ││
│                                          └────────┬────────┘│
│                                                   │          │
│                                                   ▼          │
│                                          ┌─────────────────┐│
│                                          │ Audio Mixer     ││
│                                          │ (mix N streams) ││
│                                          └────────┬────────┘│
│                                                   │          │
│                                                   ▼          │
│ ┌─────────────────┐    Socket.IO         ┌────────────────┐│
│ │ Audio Output    │←───'mixed-audio'────│ Broadcast      ││
│ │ (Web Audio API) │                      │ to room        ││
│ └─────────────────┘                      └────────────────┘│
└─────────────────────────────────────────────────────────────┘
```

### Recommended: Start with Socket.IO, Add WebRTC Later

**Phase 1:** Implement Socket.IO streaming (weeks 1-3)
**Phase 2:** Add WebRTC/mediasoup for better quality (weeks 4-6)
**Phase 3:** Intelligent fallback (WebRTC preferred, Socket.IO backup)

## Implementation Steps

### Phase 1: Core SDK Infrastructure (Socket.IO Approach)

**Files to create:**
- `sdk/media/AudioStream.ts` - Audio stream management class
- `sdk/media/AudioCapture.ts` - Microphone capture wrapper
- `sdk/media/AudioPlayer.ts` - Audio playback wrapper
- `sdk/media/AudioMixer.ts` - Mix multiple audio streams
- `sdk/media/OpusCodec.ts` - Opus encoding/decoding wrapper

**Note:** No custom audio visualizer needed - neo-blessed already has:
- `contrib/widgets/sparkline` - Compact waveform (▁▂▃▄▅▆▇█)
- `contrib/widgets/line` - Detailed line chart for spectrum/waveform
- `contrib/widgets/gauge` - VU meter for audio levels

**Files to modify:**
- `sdk/core/Door.ts` - Add `door.audio` API
- `sdk/package.json` - Add audio dependencies
- `web/backend/src/doors/DoorManager.ts` - Handle audio stream events

**API Design:**

```typescript
// sdk/core/Door.ts additions
interface Door {
  audio: AudioAPI;
}

interface AudioAPI {
  // Start streaming from microphone
  startStreaming(options?: AudioStreamOptions): Promise<AudioStream>;

  // Stop streaming
  stopStreaming(): Promise<void>;

  // Get all active audio streams in room
  getActiveStreams(): AudioStreamInfo[];

  // Mute/unmute local microphone
  setMuted(muted: boolean): void;

  // Set volume for playback (0.0 - 1.0)
  setVolume(volume: number): void;

  // Get current audio levels (for visualization)
  getAudioLevels(): AudioLevels;

  // Subscribe to someone's audio stream
  subscribe(userId: number): Promise<void>;

  // Unsubscribe from audio stream
  unsubscribe(userId: number): Promise<void>;
}

interface AudioStreamOptions {
  codec?: 'opus' | 'pcm';           // Default: 'opus'
  sampleRate?: 48000 | 16000;       // Default: 48000
  bitrate?: number;                  // Default: 32000 (32kbps)
  echoCancellation?: boolean;        // Default: true
  noiseSuppression?: boolean;        // Default: true
  autoGainControl?: boolean;         // Default: true
  channelCount?: 1 | 2;              // Default: 1 (mono)
  visualize?: boolean;               // Show ASCII waveform
}

interface AudioStream {
  id: string;
  userId: number;
  username: string;
  status: 'starting' | 'active' | 'muted' | 'stopped';
  startedAt: Date;
  isMuted: boolean;
  volume: number;

  mute(): void;
  unmute(): void;
  stop(): Promise<void>;
}

interface AudioStreamInfo {
  userId: number;
  username: string;
  isSpeaking: boolean;  // Voice activity detection
  audioLevel: number;    // 0.0 - 1.0
}

interface AudioLevels {
  input: number;   // Microphone level (0.0 - 1.0)
  output: number;  // Speaker level (0.0 - 1.0)
}
```

**Use Neo-blessed Built-in Widgets:**

Neo-blessed already includes excellent visualization widgets in `contrib/`:

```typescript
// Use Sparkline for compact waveform
import { sparkline } from '@amiexpress/bbs-door-sdk/engines/ui/blessed/contrib/widgets/sparkline';

const waveform = new sparkline({
  parent: screen,
  label: ' Audio Waveform ',
  tags: true,
  width: 40,
  height: 3,
  style: {
    fg: 'green',
    border: { fg: 'cyan' }
  }
});

// Update with audio data (array of numbers 0.0-1.0)
waveform.setData(['Input'], [audioLevels]);

// Use Gauge for VU meter
import { Gauge } from '@amiexpress/bbs-door-sdk/engines/ui/blessed/contrib/widgets/gauge';

const vuMeter = new Gauge({
  parent: screen,
  label: ' Mic Level ',
  width: 30,
  height: 3,
  stroke: 'green',
  fill: 'white'
});

// Update with audio level (0-100)
vuMeter.setPercent(audioLevel * 100);

// Use Line for detailed spectrum
import { Line } from '@amiexpress/bbs-door-sdk/engines/ui/blessed/contrib/widgets/line';

const spectrum = new Line({
  parent: screen,
  label: ' Audio Spectrum ',
  width: 60,
  height: 10,
  showLegend: false,
  style: {
    line: 'yellow',
    baseline: 'white'
  }
});

// Update with FFT data
spectrum.setData([{
  title: 'Frequency',
  x: freqLabels,
  y: fftData
}]);
```

**Example visualization using Sparkline:**
```
┌─ Audio Waveform ──────────┐
│ ▂▃▅▆▇█▇▆▅▃▂▁▂▃▅▆▇█▇▅▃▂▁  │
└───────────────────────────┘
```

**Example VU meter using Gauge:**
```
┌─ Mic Level ───────────────┐
│ ████████████░░░░░░  65%   │
└───────────────────────────┘
```

### Phase 2: Backend Socket.IO Implementation

**Files to create:**
- `web/backend/src/services/audio-stream.service.ts` - Core audio streaming
- `web/backend/src/services/audio-mixer.service.ts` - Mix multiple audio streams
- `web/backend/src/services/opus-codec.service.ts` - Server-side codec
- `web/backend/src/handlers/audio-stream.handler.ts` - Socket.IO handlers

**Socket.IO Events:**

```typescript
// Server -> Client
interface ServerToClientEvents {
  'audio-chunk': (data: AudioChunkData) => void;
  'audio-stream-started': (data: StreamStartedData) => void;
  'audio-stream-stopped': (data: StreamStoppedData) => void;
  'audio-speaking-status': (data: SpeakingStatusData) => void;
  'audio-error': (data: AudioErrorData) => void;
}

// Client -> Server
interface ClientToServerEvents {
  'audio-start-streaming': (options: AudioStreamOptions, callback: (streamId: string) => void) => void;
  'audio-stop-streaming': () => void;
  'audio-chunk-send': (chunk: ArrayBuffer) => void;
  'audio-mute': (muted: boolean) => void;
}

interface AudioChunkData {
  userId: number;
  username: string;
  chunk: ArrayBuffer;      // Opus-encoded audio data
  timestamp: number;
  sequenceNumber: number;  // For ordering/loss detection
  isFinal?: boolean;       // Last chunk before stop
}

interface StreamStartedData {
  userId: number;
  username: string;
  streamId: string;
  codec: string;
  sampleRate: number;
}

interface SpeakingStatusData {
  userId: number;
  username: string;
  isSpeaking: boolean;
  audioLevel: number;  // 0.0 - 1.0
}
```

**Service Implementation:**

```typescript
// web/backend/src/services/audio-stream.service.ts
import { OpusEncoder, OpusDecoder } from '@discordjs/opus';

export class AudioStreamService {
  private streams: Map<number, UserAudioStream>;
  private mixer: AudioMixerService;

  async startStreaming(
    userId: number,
    socketId: string,
    options: AudioStreamOptions
  ): Promise<string>;

  async stopStreaming(userId: number): Promise<void>;

  async processAudioChunk(
    userId: number,
    chunk: ArrayBuffer,
    sequenceNumber: number
  ): Promise<void>;

  private detectVoiceActivity(audioData: Float32Array): boolean;
  private mixAudioStreams(streams: Float32Array[]): Float32Array;
  private broadcastMixedAudio(roomId: string, mixedAudio: ArrayBuffer): void;
}
```

**Audio Mixer:**

```typescript
// web/backend/src/services/audio-mixer.service.ts
export class AudioMixerService {
  // Mix multiple PCM audio streams into one
  mixStreams(streams: Float32Array[]): Float32Array {
    if (streams.length === 0) return new Float32Array(0);
    if (streams.length === 1) return streams[0];

    const length = streams[0].length;
    const mixed = new Float32Array(length);

    for (let i = 0; i < length; i++) {
      let sum = 0;
      for (const stream of streams) {
        sum += stream[i];
      }
      // Normalize to prevent clipping
      mixed[i] = Math.max(-1.0, Math.min(1.0, sum / streams.length));
    }

    return mixed;
  }

  // Apply voice activity detection
  detectVoiceActivity(
    audioData: Float32Array,
    threshold: number = 0.01
  ): boolean {
    let sum = 0;
    for (let i = 0; i < audioData.length; i++) {
      sum += Math.abs(audioData[i]);
    }
    const average = sum / audioData.length;
    return average > threshold;
  }
}
```

### Phase 3: Client-Side Implementation (Browser)

**Frontend audio capture:**

```typescript
// Client-side code (runs in browser via xterm.js)
class AudioCaptureClient {
  private mediaStream: MediaStream | null = null;
  private audioContext: AudioContext;
  private mediaRecorder: MediaRecorder;
  private socket: Socket;

  async startCapture(options: AudioStreamOptions): Promise<void> {
    // Get microphone access
    this.mediaStream = await navigator.mediaDevices.getUserMedia({
      audio: {
        echoCancellation: options.echoCancellation,
        noiseSuppression: options.noiseSuppression,
        autoGainControl: options.autoGainControl,
        channelCount: options.channelCount,
        sampleRate: options.sampleRate,
      }
    });

    // Create MediaRecorder with Opus codec
    this.mediaRecorder = new MediaRecorder(this.mediaStream, {
      mimeType: 'audio/webm;codecs=opus',
      audioBitsPerSecond: options.bitrate,
    });

    // Send chunks to server
    this.mediaRecorder.ondataavailable = (event) => {
      if (event.data.size > 0) {
        event.data.arrayBuffer().then(buffer => {
          this.socket.emit('audio-chunk-send', buffer);
        });
      }
    };

    // Start recording in 20ms chunks
    this.mediaRecorder.start(20);
  }

  stopCapture(): void {
    this.mediaRecorder?.stop();
    this.mediaStream?.getTracks().forEach(track => track.stop());
  }
}
```

**Frontend audio playback:**

```typescript
// Client-side audio playback
class AudioPlaybackClient {
  private audioContext: AudioContext;
  private audioQueue: AudioBufferSourceNode[] = [];
  private socket: Socket;

  constructor(socket: Socket) {
    this.audioContext = new AudioContext({ sampleRate: 48000 });
    this.socket = socket;

    // Listen for audio chunks from server
    this.socket.on('audio-chunk', this.handleAudioChunk.bind(this));
  }

  private async handleAudioChunk(data: AudioChunkData): Promise<void> {
    // Decode Opus audio chunk
    const audioBuffer = await this.decodeOpusChunk(data.chunk);

    // Create source node and play
    const source = this.audioContext.createBufferSource();
    source.buffer = audioBuffer;
    source.connect(this.audioContext.destination);
    source.start();

    this.audioQueue.push(source);
  }

  private async decodeOpusChunk(chunk: ArrayBuffer): Promise<AudioBuffer> {
    // Use Web Audio API to decode
    return await this.audioContext.decodeAudioData(chunk);
  }

  setVolume(volume: number): void {
    const gainNode = this.audioContext.createGain();
    gainNode.gain.value = volume;
    // Connect to audio graph
  }
}
```

### Phase 4: Livechat Integration

**Files to modify:**
- `sdk/doors/livechat/app.ts` - Add audio streaming UI
- `sdk/doors/livechat/ui/screen.ts` - Add AudioVisualizer widget
- `sdk/doors/livechat/core/state.ts` - Track active speakers

**UI Layout with Audio:**

```
┌─────────────────────────────────────────────────────────────┐
│ Livechat - Audio+Video Enabled                              │
├─────────────────────────────────────────────────────────────┤
│ ┌───────────────────┐ ┌──────────────────────────────────┐ │
│ │                   │ │ Chat Messages                    │ │
│ │   Video Display   │ │ User1: Hello!                    │ │
│ │   (ASCII Stream)  │ │ User2: Nice!                     │ │
│ │                   │ │                                  │ │
│ │                   │ └──────────────────────────────────┘ │
│ │                   │ ┌──────────────────────────────────┐ │
│ └───────────────────┘ │ 🔊 Active Speakers               │ │
│ ┌───────────────────┐ │ User1 ████████░░ 75%       🔇   │ │
│ │ Audio Waveform    │ │ User2 ███░░░░░░░ 25%       🔇   │ │
│ │ ╱╲  ╱╲  ╱╲  ╱╲   │ │ You   ██████████ 100% 🎤   🔇   │ │
│ │╱  ╲╱  ╲╱  ╲╱  ╲  │ └──────────────────────────────────┘ │
│ └───────────────────┘                                       │
├─────────────────────────────────────────────────────────────┤
│ [🎤 Unmuted] [🔊 Volume: 80%] [⚙️ Settings]                 │
│ Message: _                                          [Send]   │
└─────────────────────────────────────────────────────────────┘
```

**Example Usage:**

```typescript
// In livechat door
import { sparkline } from '@amiexpress/bbs-door-sdk/engines/ui/blessed/contrib/widgets/sparkline';
import { Gauge } from '@amiexpress/bbs-door-sdk/engines/ui/blessed/contrib/widgets/gauge';

// Create sparkline for waveform
const audioViz = new sparkline({
  parent: screen,
  top: 22,
  left: 2,
  width: 40,
  height: 3,
  tags: true,
  style: {
    fg: 'green',
    border: { fg: 'cyan' }
  },
  border: { type: 'line' },
  label: ' Audio ',
});

// Create gauge for mic level
const micLevel = new Gauge({
  parent: screen,
  top: 22,
  left: 44,
  width: 30,
  height: 3,
  stroke: 'green',
  fill: 'white',
  border: { type: 'line' },
  label: ' Mic Level '
});

// Start audio streaming when user clicks mic button
micButton.on('press', async () => {
  if (isMuted) {
    await door.audio.startStreaming({
      codec: 'opus',
      sampleRate: 48000,
      bitrate: 32000,
      echoCancellation: true,
      noiseSuppression: true,
      visualize: true,
    });

    micButton.setContent('🎤 Unmuted');
    isMuted = false;

    // Update visualizer with audio levels
    setInterval(() => {
      const levels = door.audio.getAudioLevels();

      // Update sparkline waveform
      audioViz.setData(['Audio'], [levels.waveform]); // array of 0.0-1.0 values

      // Update VU meter
      micLevel.setPercent(levels.input * 100);

      screen.render();
    }, 50);
  } else {
    await door.audio.stopStreaming();
    micButton.setContent('🎤 Muted');
    isMuted = true;
  }
});

// Display active speakers
door.on('audio-speaking-status', (data) => {
  const speakersList = screen.getChild('speakers-list');
  speakersList.setContent(
    data.speakers.map(s =>
      `${s.username} ${'█'.repeat(s.audioLevel * 10)}${'░'.repeat(10 - s.audioLevel * 10)} ${Math.round(s.audioLevel * 100)}%`
    ).join('\n')
  );
  screen.render();
});
```

### Phase 5: WebRTC Enhancement (Optional)

**Add mediasoup SFU for better quality:**

```typescript
// web/backend/src/services/mediasoup.service.ts
import mediasoup from 'mediasoup';

export class MediasoupService {
  private router: mediasoup.types.Router;
  private transports: Map<string, mediasoup.types.WebRtcTransport>;
  private producers: Map<string, mediasoup.types.Producer>;
  private consumers: Map<string, mediasoup.types.Consumer>;

  async initialize(): Promise<void> {
    const worker = await mediasoup.createWorker();
    this.router = await worker.createRouter({
      mediaCodecs: [
        {
          kind: 'audio',
          mimeType: 'audio/opus',
          clockRate: 48000,
          channels: 2,
        }
      ]
    });
  }

  async createWebRtcTransport(userId: number): Promise<TransportOptions>;
  async connectTransport(transportId: string, dtlsParameters: any): Promise<void>;
  async produce(transportId: string, rtpParameters: any): Promise<string>;
  async consume(producerId: string, rtpCapabilities: any): Promise<ConsumerOptions>;
}
```

**Signaling via Socket.IO:**

```typescript
// WebRTC signaling events
interface WebRTCSignalingEvents {
  'webrtc-get-router-capabilities': (callback: (capabilities: any) => void) => void;
  'webrtc-create-transport': (callback: (options: any) => void) => void;
  'webrtc-connect-transport': (transportId: string, dtlsParameters: any) => void;
  'webrtc-produce': (transportId: string, kind: 'audio', rtpParameters: any, callback: (id: string) => void) => void;
  'webrtc-consume': (producerId: string, rtpCapabilities: any, callback: (options: any) => void) => void;
}
```

## Dependencies to Add

```json
{
  "dependencies": {
    // Socket.IO Approach (Phase 1-2)
    "@discordjs/opus": "^0.9.0",           // Opus codec bindings
    "microphone-stream": "^6.0.1",         // Microphone capture
    "opus-recorder": "^8.0.5",             // Browser Opus encoding

    // WebRTC Approach (Phase 5)
    "mediasoup": "^3.13.0",                // SFU for multi-party
    "mediasoup-client": "^3.7.0",          // Client library

    // Audio Processing
    "node-audiorecorder": "^3.0.0",        // Node.js audio recording
    "pcm-convert": "^1.6.5",               // PCM format conversion
    "web-audio-api": "^0.2.2",             // Server-side Web Audio

    // Visualization (Optional)
    "cli-spectrum": "^1.0.0",              // ASCII audio spectrum
    "node-audio-graph": "^1.0.0"           // Waveform generation
  },
  "devDependencies": {
    "@types/mediasoup": "^3.0.0",
    "@types/microphone-stream": "^6.0.0"
  }
}
```

## Configuration

Add to `sdk/config.ts`:

```typescript
export interface AudioConfig {
  enabled: boolean;                    // Default: true
  codec: 'opus' | 'pcm';              // Default: 'opus'
  sampleRate: 48000 | 16000;          // Default: 48000
  bitrate: number;                     // Default: 32000 (32kbps)
  echoCancellation: boolean;           // Default: true
  noiseSuppression: boolean;           // Default: true
  autoGainControl: boolean;            // Default: true

  // Server limits
  maxConcurrentSpeakers: number;       // Default: 10
  maxStreamDuration: number;           // Default: 3600 (1 hour)

  // Quality settings
  jitterBufferSize: number;            // Default: 50ms
  packetLossThreshold: number;         // Default: 5%

  // WebRTC (if enabled)
  useWebRTC: boolean;                  // Default: false
  stunServers: string[];               // STUN server URLs
  turnServers: TurnServerConfig[];     // TURN server configs
}

interface TurnServerConfig {
  urls: string;
  username?: string;
  credential?: string;
}
```

## Testing & Optimization

**Create test files:**
- `sdk/media/__tests__/AudioStream.test.ts`
- `sdk/media/__tests__/AudioMixer.test.ts`
- `sdk/media/__tests__/OpusCodec.test.ts`
- `web/backend/src/services/__tests__/audio-stream.service.test.ts`

**Test scenarios:**
1. Single speaker to single listener
2. Multi-party (5+ speakers) simultaneous audio
3. Start/stop/mute/unmute lifecycle
4. Packet loss simulation (5%, 10%, 20%)
5. Network latency simulation (50ms, 100ms, 200ms)
6. CPU/memory usage under load
7. Integration with video streaming
8. Error handling (mic permissions, network issues)
9. Browser compatibility (Chrome, Firefox, Safari)

**Performance targets:**
- **Latency:** <100ms (WebRTC), <300ms (Socket.IO)
- **CPU usage:** <30% for 5 concurrent speakers
- **Memory:** <50MB per active stream
- **Bandwidth:** 32kbps per speaker (Opus encoding)
- **Packet loss:** <5% before noticeable degradation
- **Jitter:** <20ms variance
- **Audio quality:** MOS score >4.0 (1-5 scale)

**Benchmarking:**

```bash
# Test latency
npm run test:audio:latency

# Test multi-party (5 speakers)
npm run test:audio:multiparty

# Stress test (10+ speakers)
npm run test:audio:stress

# Measure bandwidth usage
npm run test:audio:bandwidth
```

## Security Considerations

1. **Access Control:**
   - Verify user permissions before enabling microphone
   - Check room membership before broadcasting audio
   - Rate limit audio chunk uploads (prevent spam)

2. **Privacy:**
   - Request explicit microphone permission
   - Show indicator when mic is active
   - No server-side recording without consent
   - Mute by default on join

3. **Resource Protection:**
   - Limit concurrent speakers (max 10)
   - Auto-mute after inactivity timeout
   - Detect and block audio flooding
   - Monitor CPU/bandwidth usage

4. **Data Security:**
   - Use DTLS-SRTP encryption (WebRTC)
   - Or WSS (secure websockets) for Socket.IO
   - No plain HTTP audio transmission
   - Sanitize all user inputs

5. **Abuse Prevention:**
   - Voice activity detection (prevent silence spam)
   - Audio level limits (prevent ear damage)
   - Report/block abusive users
   - Moderator controls (mute users, kick from voice)

## Documentation to Create

1. **SDK Documentation:**
   - `sdk/docs/AUDIO_STREAMING.md` - Complete audio guide
   - API reference for AudioAPI
   - Widget documentation for AudioVisualizer
   - Example implementations

2. **Developer Guide:**
   - `Documentation/4-Door-Developers/AUDIO_STREAMING_GUIDE.md`
   - Best practices for voice chat
   - Codec selection guide
   - Troubleshooting audio issues

3. **User Guide:**
   - `Documentation/1-Users/VOICE_CHAT.md`
   - How to use voice in livechat
   - Microphone setup and permissions
   - Audio quality tips

4. **Admin Guide:**
   - `Documentation/2-Sysops/AUDIO_CONFIGURATION.md`
   - Server requirements (STUN/TURN)
   - Bandwidth planning
   - Performance tuning

## Implementation Checklist

### Phase 1: Socket.IO Audio (Weeks 1-2)
- [ ] Create `sdk/media/` audio components
- [ ] Implement AudioStream class
- [ ] Implement OpusCodec wrapper
- [ ] Add `door.audio` API to Door class
- [ ] Document usage of neo-blessed visualization widgets (sparkline, gauge, line)
- [ ] Write unit tests
- [ ] Update SDK README

### Phase 2: Backend (Weeks 2-3)
- [ ] Create audio-stream.service.ts
- [ ] Create audio-mixer.service.ts
- [ ] Implement Socket.IO audio handlers
- [ ] Add voice activity detection
- [ ] Implement multi-speaker mixing
- [ ] Add audio level monitoring
- [ ] Write integration tests
- [ ] Add logging and metrics

### Phase 3: Frontend (Week 3)
- [ ] Implement browser audio capture
- [ ] Implement audio playback
- [ ] Add mute/unmute controls
- [ ] Add volume controls
- [ ] Test browser compatibility
- [ ] Add error handling
- [ ] Optimize for mobile (if needed)

### Phase 4: Livechat Integration (Week 4)
- [ ] Add audio UI to livechat
- [ ] Implement speaker list
- [ ] Add audio visualizer
- [ ] Sync with video streams
- [ ] Test with multiple users
- [ ] Polish UX
- [ ] Update livechat docs

### Phase 5: WebRTC (Weeks 5-6, Optional)
- [ ] Set up mediasoup server
- [ ] Implement WebRTC signaling
- [ ] Add STUN/TURN server config
- [ ] Implement fallback logic (WebRTC → Socket.IO)
- [ ] Test P2P mode (2 users)
- [ ] Test SFU mode (5+ users)
- [ ] Performance comparison
- [ ] Documentation

### Phase 6: Polish (Week 6-7)
- [ ] Performance optimization
- [ ] Multi-user stress testing
- [ ] CPU/memory profiling
- [ ] Bandwidth optimization
- [ ] Cross-browser testing
- [ ] Mobile testing (if needed)
- [ ] Documentation review
- [ ] User acceptance testing

## Known Challenges & Solutions

### Challenge 1: Latency
**Problem:** Audio latency >300ms feels unnatural
**Solution:**
- Use WebRTC (sub-100ms latency)
- Reduce jitter buffer size
- Use UDP-like transport (WebRTC DataChannels)
- Optimize Opus frame size (20ms minimum)

### Challenge 2: Packet Loss
**Problem:** Audio dropouts on poor networks
**Solution:**
- Opus built-in FEC (Forward Error Correction)
- Implement jitter buffer
- Graceful degradation (lower bitrate)
- Show network quality indicator

### Challenge 3: Echo
**Problem:** Users hear their own voice
**Solution:**
- Enable browser echo cancellation
- Server-side echo suppression
- Headphone recommendation in UI
- Acoustic echo cancellation (AEC)

### Challenge 4: Multi-Party Mixing
**Problem:** 5+ speakers → audio mush
**Solution:**
- Implement voice activity detection
- Auto-duck (lower volume of non-speaking)
- Limit simultaneous speakers (max 3)
- Spatial audio (pan speakers left/right)

### Challenge 5: Bandwidth
**Problem:** 10 speakers = 320kbps upload per user
**Solution:**
- Server-side mixing (SFU reduces client upload)
- Adaptive bitrate (lower quality on slow connections)
- Opus DTX (Discontinuous Transmission) for silence
- Voice activity detection (don't send silence)

### Challenge 6: Browser Compatibility
**Problem:** Different browsers, different APIs
**Solution:**
- Use adapter.js for WebRTC polyfills
- Test on Chrome, Firefox, Safari
- Graceful fallback for unsupported browsers
- Clear error messages

## Audio Synchronization with Video

**Challenge:** Keep audio and video in sync

**Solution:**

```typescript
interface SyncedAVStream {
  videoStream: VideoStream;
  audioStream: AudioStream;

  // Timestamp alignment
  videoTimestamp: number;
  audioTimestamp: number;

  // Sync drift (ms)
  getDrift(): number {
    return this.videoTimestamp - this.audioTimestamp;
  }

  // Auto-adjust if drift >50ms
  autoSync(): void {
    const drift = this.getDrift();
    if (Math.abs(drift) > 50) {
      if (drift > 0) {
        // Video ahead, drop video frames
        this.videoStream.skipFrames(Math.floor(drift / 100));
      } else {
        // Audio ahead, insert silence
        this.audioStream.insertSilence(Math.abs(drift));
      }
    }
  }
}
```

## ASCII Audio Visualization

**Use Neo-blessed Built-in Widgets:**

Neo-blessed already includes three excellent widgets for audio visualization:

### 1. Sparkline (Compact Waveform)
```typescript
import { sparkline } from '@amiexpress/bbs-door-sdk/engines/ui/blessed/contrib/widgets/sparkline';

const waveform = new sparkline({
  parent: screen,
  label: ' Waveform ',
  width: 50,
  height: 3,
  tags: true,
  style: { fg: 'green' }
});

// Convert audio samples to sparkline
// Input: Float32Array of audio samples (-1.0 to 1.0)
// Output: Array of normalized values (0.0 to 1.0)
const normalized = audioSamples.map(s => (s + 1) / 2);
waveform.setData(['Audio'], [normalized]);

// Renders as: ▁▂▃▄▅▆▇█▇▆▅▄▃▂▁
```

### 2. Gauge (VU Meter)
```typescript
import { Gauge } from '@amiexpress/bbs-door-sdk/engines/ui/blessed/contrib/widgets/gauge';

const vuMeter = new Gauge({
  parent: screen,
  label: ' Mic Level ',
  stroke: 'green',
  fill: 'white',
  showLabel: true
});

// Update with RMS audio level (0-100)
const rms = calculateRMS(audioSamples) * 100;
vuMeter.setPercent(rms);

// Renders as: ████████████░░░░ 65%
```

### 3. Line Chart (Frequency Spectrum)
```typescript
import { Line } from '@amiexpress/bbs-door-sdk/engines/ui/blessed/contrib/widgets/line';

const spectrum = new Line({
  parent: screen,
  label: ' Spectrum ',
  width: 60,
  height: 10,
  showLegend: false,
  style: { line: 'yellow' }
});

// Update with FFT frequency data
const fft = performFFT(audioSamples);
spectrum.setData([{
  title: 'Frequency',
  x: ['20Hz', '100Hz', '500Hz', '1kHz', '5kHz', '10kHz'],
  y: fft.slice(0, 6)
}]);

// Renders as line chart with axes
```

**Helper function for RMS calculation:**
```typescript
function calculateRMS(samples: Float32Array): number {
  let sum = 0;
  for (let i = 0; i < samples.length; i++) {
    sum += samples[i] * samples[i];
  }
  return Math.sqrt(sum / samples.length);
}
```

## Success Criteria

1. ✅ Stream audio to 5+ simultaneous users
2. ✅ Latency <100ms (WebRTC) or <300ms (Socket.IO)
3. ✅ CPU usage <30% for 5 speakers
4. ✅ Clear audio quality (MOS >4.0)
5. ✅ Works with video streaming simultaneously
6. ✅ Mute/unmute without glitches
7. ✅ Voice activity detection working
8. ✅ Works on Chrome, Firefox, Safari
9. ✅ Comprehensive documentation
10. ✅ All tests passing

## Future Enhancements (Post-MVP)

- [ ] Spatial audio (3D positioning)
- [ ] Background noise filtering (AI-based)
- [ ] Voice effects (pitch shift, echo, etc.)
- [ ] Audio recording/playback
- [ ] Speech-to-text for accessibility
- [ ] Text-to-speech for announcements
- [ ] Music streaming (higher bitrate mode)
- [ ] Screen reader support
- [ ] Mobile app support
- [ ] Push-to-talk mode

## References

- **WebRTC:** [Live Audio Streaming with Node.js, Web Audio API, and WebRTC](https://chankapure.medium.com/live-audio-streaming-with-node-js-web-audio-api-and-webrtc-1cec0655ea09)
- **Socket.IO Voice:** [Real-Time Audio Chat with Socket.IO and Node.js](https://medium.com/@tajammalmaqbool11/harnessing-real-time-audio-chat-with-socket-io-nodejs-9ffd9b3716eb)
- **mediasoup:** [mediasoup.org](https://mediasoup.org/)
- **Opus Codec:** [opus-codec.org](https://opus-codec.org/)
- **microphone-stream:** [npm package](https://www.npmjs.com/package/microphone-stream)
- **@discordjs/opus:** [npm package](https://www.npmjs.com/package/@discordjs/opus)
- **CAVA Visualizer:** [GitHub](https://github.com/karlstav/cava)
- **Web Audio API:** [MDN Docs](https://developer.mozilla.org/en-US/docs/Web/API/Web_Audio_API)

## Notes

- Start with Socket.IO approach (simpler) before attempting WebRTC
- Test with real users early to validate latency/quality
- Consider server costs (bandwidth for audio is significant)
- STUN/TURN servers required for WebRTC (use public servers for testing)
- Mobile browsers may have different audio constraints
- Headphone echo cancellation works better than speakers
- Consider adding "join voice channel" UI pattern (like Discord)
- Audio-only mode (no video) should also work
- This is a NEW feature - use `WEB_VOICE` or `MODERN_VOICE` prefix

---

**Implementation Date:** TBD
**Assigned To:** Claude Code Agent
**Estimated Effort:** 6-7 weeks (Socket.IO), 8-10 weeks (+ WebRTC)
**Dependencies:** Socket.IO (existing), @discordjs/opus, microphone-stream
**Recommended:** Implement after ASCII video streaming is complete
