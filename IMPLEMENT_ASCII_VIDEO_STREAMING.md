# Implementation Prompt: ASCII Video Streaming for SDK

**Created:** 2025-12-28
**Status:** Not Started
**Priority:** Feature Enhancement
**Complexity:** High

---

## Overview

Implement real-time ASCII video streaming capability in the BBS Door SDK to enable video chat/streaming features in doors like livechat. This will allow doors to stream video content (webcam, video files, screen sharing) as ASCII art with ANSI colors to multiple BBS clients simultaneously.

## Goals

1. Add ASCII video streaming API to SDK (`@amiexpress/bbs-door-sdk`)
2. Support real-time video-to-ASCII conversion on server
3. Enable multi-client broadcast via Socket.IO
4. Integrate with neo-blessed for display in doors
5. Provide livechat door as reference implementation
6. Maintain compatibility with 80x24 terminal constraints
7. Support 16 ANSI colors only (per CLAUDE.md rule #6)

## Technical Requirements

### Core Library
- **Package:** `image-and-video-to-ascii` (npm)
- **Why:** Server-side Node.js, terminal output, ANSI support, actively maintained
- **Alternatives rejected:** React-only components, browser-only libs, outdated packages

### Constraints (from CLAUDE.md)
- **Colors:** ONLY 16 ANSI colors (black, red, green, yellow, blue, magenta, cyan, white, gray)
- **Terminal:** 80x24 character grid maximum
- **Neo-blessed:** Must integrate with existing SDK UI system
- **Performance:** Real-time streaming to multiple clients
- **No background processes:** All streaming must use proper async/await patterns

### Platform Stack
- **Backend:** Node.js/TypeScript (web/backend)
- **SDK:** TypeScript (`sdk/`)
- **Frontend:** xterm.js terminal emulator
- **Transport:** Socket.IO (existing BBS websocket infrastructure)
- **Video Processing:** ffmpeg for capture, image-and-video-to-ascii for conversion

## Architecture Design

### Component Structure

```
┌─────────────────────────────────────────────────────────────┐
│ Video Source (webcam/file/screen)                           │
└─────────────────┬───────────────────────────────────────────┘
                  │
                  ▼
┌─────────────────────────────────────────────────────────────┐
│ Video Capture Service (ffmpeg/node-stream)                  │
│ - Capture frames at configurable FPS (10-15 recommended)    │
│ - Scale to terminal dimensions                              │
└─────────────────┬───────────────────────────────────────────┘
                  │
                  ▼
┌─────────────────────────────────────────────────────────────┐
│ ASCII Converter (image-and-video-to-ascii)                  │
│ - Convert frames to ASCII with 16-color ANSI palette        │
│ - Apply brightness/contrast adjustments                     │
│ - Output ANSI escape sequences                              │
└─────────────────┬───────────────────────────────────────────┘
                  │
                  ▼
┌─────────────────────────────────────────────────────────────┐
│ Stream Manager (SDK Component)                              │
│ - Manage active streams                                     │
│ - Handle multiple simultaneous streams                      │
│ - Broadcast frames to subscribers                           │
└─────────────────┬───────────────────────────────────────────┘
                  │
                  ▼
┌─────────────────────────────────────────────────────────────┐
│ Socket.IO Transport Layer                                   │
│ - Emit 'ascii-video-frame' events                           │
│ - Room-based broadcasting (per door instance)               │
│ - Bandwidth throttling if needed                            │
└─────────────────┬───────────────────────────────────────────┘
                  │
                  ▼
┌─────────────────────────────────────────────────────────────┐
│ Door Client (Neo-blessed Widget)                            │
│ - VideoDisplay widget for rendering frames                  │
│ - Buffer management for smooth playback                     │
│ - Audio placeholder (future enhancement)                    │
└─────────────────────────────────────────────────────────────┘
```

### Data Flow

1. **Stream Initiation:**
   - Door calls `door.video.startStream(source, options)`
   - Backend creates VideoStream instance
   - Stream assigned unique ID and Socket.IO room

2. **Frame Processing:**
   - Capture service extracts frames at configured FPS
   - Each frame converted to ASCII via image-and-video-to-ascii
   - Output: ANSI string with embedded color codes

3. **Broadcasting:**
   - ASCII frame emitted to Socket.IO room
   - All connected clients in room receive frame
   - Frame includes: stream_id, frame_number, timestamp, ascii_data

4. **Client Rendering:**
   - VideoDisplay widget receives frame event
   - Updates neo-blessed display
   - Maintains frame buffer for smooth playback

## Implementation Steps

### Phase 1: Core SDK Infrastructure

**Files to create:**
- `sdk/media/VideoStream.ts` - Stream management class
- `sdk/media/AsciiConverter.ts` - Wrapper for image-and-video-to-ascii
- `sdk/media/FrameCapture.ts` - Video frame extraction
- `sdk/media/types.ts` - Type definitions
- `sdk/engines/ui/blessed/widgets/video-display.ts` - Neo-blessed widget

**Files to modify:**
- `sdk/core/Door.ts` - Add `door.video` API
- `sdk/package.json` - Add image-and-video-to-ascii dependency
- `web/backend/src/doors/DoorManager.ts` - Handle video stream events

**API Design:**

```typescript
// sdk/core/Door.ts additions
interface Door {
  video: VideoAPI;
}

interface VideoAPI {
  // Start streaming from source
  startStream(source: VideoSource, options?: StreamOptions): Promise<VideoStream>;

  // Stop an active stream
  stopStream(streamId: string): Promise<void>;

  // Get all active streams
  getStreams(): VideoStream[];

  // Subscribe to a stream (for viewers)
  subscribeToStream(streamId: string): Promise<void>;

  // Unsubscribe from a stream
  unsubscribeFromStream(streamId: string): Promise<void>;
}

type VideoSource =
  | { type: 'webcam'; deviceId?: string }
  | { type: 'file'; path: string }
  | { type: 'url'; url: string }
  | { type: 'screen'; displayId?: number };

interface StreamOptions {
  width?: number;        // ASCII width (default: 80)
  height?: number;       // ASCII height (default: 24)
  fps?: number;          // Frames per second (default: 10)
  brightness?: number;   // -1 to 1 (default: 0)
  contrast?: number;     // 0 to 2 (default: 1)
  colored?: boolean;     // Use ANSI colors (default: true)
  charSet?: 'blocks' | 'gradient' | 'simple';  // Character set
}

interface VideoStream {
  id: string;
  source: VideoSource;
  options: StreamOptions;
  status: 'starting' | 'active' | 'paused' | 'stopped';
  startedAt: Date;
  frameCount: number;
  subscribers: number;

  pause(): Promise<void>;
  resume(): Promise<void>;
  stop(): Promise<void>;
}
```

**Neo-blessed Widget:**

```typescript
// sdk/engines/ui/blessed/widgets/video-display.ts
import blessed from 'neo-blessed';

interface VideoDisplayOptions extends blessed.Widgets.BoxOptions {
  streamId?: string;
  autoScale?: boolean;
  showStats?: boolean;  // FPS counter
}

class VideoDisplay extends blessed.Box {
  private streamId: string | null;
  private frameBuffer: string[];
  private currentFrame: string | null;
  private fps: number;

  constructor(options: VideoDisplayOptions);

  setStream(streamId: string): void;
  clearStream(): void;

  private onFrame(data: AsciiFrame): void;
  private render(): void;
}
```

### Phase 2: Backend Implementation

**Files to create:**
- `web/backend/src/services/video-stream.service.ts` - Core stream management
- `web/backend/src/services/ascii-converter.service.ts` - Conversion service
- `web/backend/src/handlers/video-stream.handler.ts` - Socket.IO handlers

**Socket.IO Events:**

```typescript
// Server -> Client
interface ServerToClientEvents {
  'ascii-video-frame': (data: AsciiFrameData) => void;
  'ascii-video-started': (data: StreamStartedData) => void;
  'ascii-video-stopped': (data: StreamStoppedData) => void;
  'ascii-video-error': (data: StreamErrorData) => void;
}

// Client -> Server
interface ClientToServerEvents {
  'ascii-video-start': (source: VideoSource, options: StreamOptions, callback: (streamId: string) => void) => void;
  'ascii-video-stop': (streamId: string) => void;
  'ascii-video-subscribe': (streamId: string) => void;
  'ascii-video-unsubscribe': (streamId: string) => void;
}

interface AsciiFrameData {
  streamId: string;
  frameNumber: number;
  timestamp: number;
  width: number;
  height: number;
  asciiData: string;  // ANSI-encoded ASCII art
}
```

**Service Implementation:**

```typescript
// web/backend/src/services/video-stream.service.ts
export class VideoStreamService {
  private streams: Map<string, ActiveStream>;
  private converter: AsciiConverterService;

  async startStream(
    userId: number,
    source: VideoSource,
    options: StreamOptions
  ): Promise<string>;

  async stopStream(streamId: string): Promise<void>;

  async subscribeToStream(
    userId: number,
    streamId: string,
    socketId: string
  ): Promise<void>;

  private processFrame(streamId: string, frameBuffer: Buffer): Promise<void>;
  private broadcastFrame(streamId: string, asciiData: string): void;
}
```

### Phase 3: Livechat Integration

**Files to modify:**
- `sdk/doors/livechat/app.ts` - Add video streaming UI
- `sdk/doors/livechat/ui/screen.ts` - Add VideoDisplay widget
- `sdk/doors/livechat/core/state.ts` - Track active streams

**UI Layout:**

```
┌─────────────────────────────────────────────────────────────┐
│ Livechat - Video Enabled                                    │
├─────────────────────────────────────────────────────────────┤
│ ┌───────────────────┐ ┌──────────────────────────────────┐ │
│ │                   │ │ Chat Messages                    │ │
│ │   Video Display   │ │ User1: Hello!                    │ │
│ │   (ASCII Stream)  │ │ User2: Nice video!               │ │
│ │                   │ │                                  │ │
│ │   80x20 chars     │ │                                  │ │
│ │                   │ │                                  │ │
│ └───────────────────┘ └──────────────────────────────────┘ │
├─────────────────────────────────────────────────────────────┤
│ [Start Video] [Stop Video] [Settings]                       │
│ Message: _                                          [Send]   │
└─────────────────────────────────────────────────────────────┘
```

**Example Usage:**

```typescript
// In livechat door
import { VideoDisplay } from '@amiexpress/bbs-door-sdk/engines/ui/blessed/widgets/video-display';

// Create video display widget
const videoDisplay = new VideoDisplay({
  parent: screen,
  top: 2,
  left: 2,
  width: 40,
  height: 20,
  border: { type: 'line' },
  label: ' Video Stream ',
});

// Start streaming when user clicks "Start Video"
startVideoButton.on('press', async () => {
  const stream = await door.video.startStream(
    { type: 'webcam' },
    { width: 38, height: 18, fps: 10, colored: true }
  );

  videoDisplay.setStream(stream.id);
  statusBar.setContent('Streaming...');
});

// Stop streaming
stopVideoButton.on('press', async () => {
  await door.video.stopStream(currentStreamId);
  videoDisplay.clearStream();
  statusBar.setContent('Stream stopped');
});
```

### Phase 4: Testing & Optimization

**Create test files:**
- `sdk/media/__tests__/VideoStream.test.ts`
- `sdk/media/__tests__/AsciiConverter.test.ts`
- `web/backend/src/services/__tests__/video-stream.service.test.ts`

**Test scenarios:**
1. Single stream to single client
2. Single stream to multiple clients (5+)
3. Multiple concurrent streams
4. Stream start/stop lifecycle
5. Error handling (invalid source, network issues)
6. Performance: CPU usage, memory, bandwidth
7. Frame rate stability (measure actual FPS vs target)
8. ANSI color accuracy (16-color palette only)
9. Integration with neo-blessed rendering

**Performance targets:**
- CPU usage: <50% for single stream at 10 FPS
- Memory: <100MB per active stream
- Latency: <200ms from capture to display
- Frame drops: <5% under normal conditions
- Bandwidth: ~100KB/s per client at 10 FPS

## Dependencies to Add

```json
{
  "dependencies": {
    "image-and-video-to-ascii": "^latest",
    "fluent-ffmpeg": "^2.1.2",
    "@types/fluent-ffmpeg": "^2.1.24"
  },
  "optionalDependencies": {
    "node-webcam": "^0.8.1"  // For webcam capture (if needed)
  }
}
```

## Configuration

Add to `sdk/config.ts`:

```typescript
export interface VideoConfig {
  maxStreamsPerUser: number;      // Default: 1
  maxConcurrentStreams: number;   // Default: 10
  defaultFps: number;              // Default: 10
  maxFps: number;                  // Default: 15
  defaultWidth: number;            // Default: 80
  defaultHeight: number;           // Default: 24
  enableWebcam: boolean;           // Default: true
  enableFileStreaming: boolean;   // Default: true
  enableScreenSharing: boolean;   // Default: false
  maxStreamDuration: number;       // Default: 3600 (1 hour)
}
```

## Security Considerations

1. **Access Control:**
   - Check user permissions before allowing stream creation
   - Validate user has webcam/file access permissions
   - Rate limit stream creation (max 1 stream per user)

2. **Resource Limits:**
   - Set maximum concurrent streams per BBS instance
   - Implement bandwidth throttling if needed
   - Auto-stop streams after timeout
   - Monitor CPU/memory usage

3. **Privacy:**
   - Only allow streaming in doors that explicitly enable it
   - No recording/saving of streams by default
   - Users must consent to video streaming
   - Show indicator when being streamed

4. **Input Validation:**
   - Validate video source paths (no directory traversal)
   - Sanitize stream IDs and user inputs
   - Validate stream options (width, height, fps ranges)

## Documentation to Create

1. **SDK Documentation:**
   - `sdk/docs/VIDEO_STREAMING.md` - Complete video streaming guide
   - API reference for VideoAPI
   - Widget documentation for VideoDisplay
   - Example door implementations

2. **Developer Guide:**
   - `Documentation/4-Door-Developers/VIDEO_STREAMING_GUIDE.md`
   - Best practices for video in doors
   - Performance optimization tips
   - Troubleshooting common issues

3. **User Guide:**
   - `Documentation/1-Users/VIDEO_CHAT.md`
   - How to use video in livechat
   - System requirements
   - Privacy and permissions

## Implementation Checklist

### Phase 1: Core SDK (Week 1-2)
- [ ] Create `sdk/media/` directory structure
- [ ] Implement `VideoStream.ts` class
- [ ] Implement `AsciiConverter.ts` wrapper
- [ ] Implement `FrameCapture.ts` service
- [ ] Create type definitions
- [ ] Add `door.video` API to Door class
- [ ] Create `VideoDisplay` neo-blessed widget
- [ ] Write unit tests for media components
- [ ] Update SDK README with video features

### Phase 2: Backend (Week 2-3)
- [ ] Create video-stream.service.ts
- [ ] Create ascii-converter.service.ts
- [ ] Implement Socket.IO handlers
- [ ] Add stream management to DoorManager
- [ ] Implement multi-client broadcasting
- [ ] Add stream lifecycle management
- [ ] Write integration tests
- [ ] Add logging and monitoring

### Phase 3: Livechat Integration (Week 3-4)
- [ ] Add VideoDisplay to livechat UI
- [ ] Implement start/stop controls
- [ ] Add stream settings panel
- [ ] Update chat layout for video
- [ ] Test with multiple users
- [ ] Add error handling and recovery
- [ ] Update livechat documentation

### Phase 4: Testing & Polish (Week 4-5)
- [ ] Performance testing and optimization
- [ ] Multi-user stress testing
- [ ] CPU/memory profiling
- [ ] Bandwidth optimization
- [ ] Cross-browser testing (xterm.js)
- [ ] Documentation review
- [ ] Create example doors
- [ ] User acceptance testing

## Known Challenges & Solutions

### Challenge 1: Performance
**Problem:** ASCII conversion is CPU-intensive
**Solution:**
- Use low FPS (10-15 recommended)
- Implement frame skipping under load
- Consider offloading to worker threads
- Cache conversion results for static frames

### Challenge 2: Bandwidth
**Problem:** Even ASCII uses significant bandwidth
**Solution:**
- Compress ANSI output (gzip Socket.IO messages)
- Implement adaptive quality (lower resolution under high latency)
- Delta encoding (only send changed regions)
- Limit concurrent streams per BBS instance

### Challenge 3: Synchronization
**Problem:** Frames may arrive out of order or delayed
**Solution:**
- Include frame numbers and timestamps
- Implement client-side buffering (2-3 frames)
- Drop late frames rather than queue them
- Show latency indicator to users

### Challenge 4: 16-Color Limit
**Problem:** image-and-video-to-ascii may use 256 colors
**Solution:**
- Post-process ANSI output to map to 16 colors only
- Use nearest color matching algorithm
- Provide color palette configuration
- Test with actual BBS terminal emulator

### Challenge 5: Terminal Size
**Problem:** 80x24 is very small for video
**Solution:**
- Use half the screen (40x20) for video
- Optimize for faces/simple scenes
- Higher contrast settings
- Simple character sets (blocks work better than gradients)

## Success Criteria

1. ✅ Stream 10 FPS ASCII video to 5+ simultaneous clients
2. ✅ CPU usage stays below 50% per stream
3. ✅ Latency under 200ms from capture to display
4. ✅ Only 16 ANSI colors used (no 256-color codes)
5. ✅ Integrated with neo-blessed rendering
6. ✅ Works in livechat door without modifications to core SDK
7. ✅ Comprehensive documentation and examples
8. ✅ All tests passing (unit + integration)
9. ✅ No background process zombies (per CLAUDE.md)
10. ✅ Compatible with xterm.js terminal emulator

## Future Enhancements (Post-MVP)

- [ ] Audio support (ASCII waveform visualization)
- [ ] Screen sharing capability
- [ ] Video recording/playback
- [ ] Picture-in-picture for multiple streams
- [ ] Filters and effects (brightness, contrast, edge detection)
- [ ] Bandwidth-adaptive quality
- [ ] Hardware acceleration (GPU) if available
- [ ] Mobile client optimization

## References

- **Primary Package:** https://www.npmjs.com/package/image-and-video-to-ascii
- **ANSI Escape Codes:** https://en.wikipedia.org/wiki/ANSI_escape_code
- **Neo-blessed Docs:** sdk/engines/ui/blessed/README.md
- **Socket.IO Rooms:** https://socket.io/docs/v4/rooms/
- **CLAUDE.md Rules:** See rule #6 (16 colors), rule #9 (no background processes)

## Notes

- This is a NEW feature, not in express.e - use `WEB_VIDEO` or `MODERN_VIDEO` prefix for commands
- Test with actual Amiga terminal emulator to ensure ANSI compatibility
- Consider adding to BBS configuration: enable/disable video globally
- May need ffmpeg installed on server - document system requirements
- Performance will vary based on server hardware
- Start with file-based streaming (easier) before implementing webcam

---

**Implementation Date:** TBD
**Assigned To:** Claude Code Agent
**Estimated Effort:** 4-5 weeks
**Dependencies:** image-and-video-to-ascii, fluent-ffmpeg, Socket.IO (existing)
