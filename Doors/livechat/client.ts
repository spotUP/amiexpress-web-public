/**
 * LiveChat - Hybrid Door Client Component
 *
 * This client runs in the browser and handles:
 * - Audio playback via SDK AudioEngine (UI sounds)
 * - Microphone capture for voice channels
 * - Audio streaming to/from other users
 *
 * The UI is rendered server-side via neo-blessed and sent as ANSI to the terminal.
 * This client only handles audio - the UI remains unchanged.
 */

import {
  ClientDoor,
  AudioEngine,
} from '@amiexpress/bbs-door-sdk/client';

// =============================================================================
// Types
// =============================================================================

interface AudioStreamOptions {
  sampleRate?: number;
  bitrate?: number;
  echoCancellation?: boolean;
  noiseSuppression?: boolean;
  autoGainControl?: boolean;
  channelCount?: number;
}

interface AudioLevels {
  input: number;
  output: number;
  waveform?: number[];
}

// =============================================================================
// Video render modes (browser-side ASCII encoders)
// =============================================================================

/**
 * Source pixels per output char for each render mode.
 *  - ascii / color: 1 char = 1 pixel
 *  - halfblock:     1 char = 1x2 pixels (top half + bottom half)
 *  - braille:       1 char = 2x4 pixels (8 dots)
 */
function pixelsPerChar(mode: string): { px: number; py: number } {
  switch (mode) {
    case 'braille': return { px: 2, py: 4 };
    case 'halfblock': return { px: 1, py: 2 };
    case 'color':
    case 'ascii':
    default: return { px: 1, py: 1 };
  }
}

const ASCII_RAMP = ' .:-=+*#%@';

function renderAscii(img: ImageData, w: number, h: number, colored: boolean): string {
  let out = '';
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      const r = img.data[i];
      const g = img.data[i + 1];
      const b = img.data[i + 2];
      const lum = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
      const ch = ASCII_RAMP[Math.floor(lum * (ASCII_RAMP.length - 1))] || ' ';
      out += colored ? `\x1b[38;2;${r};${g};${b}m${ch}` : ch;
    }
    if (colored) out += '\x1b[0m';
    out += '\n';
  }
  return out.replace(/\n+$/, '');
}

/**
 * Half-block: U+2580 with fg=top pixel, bg=bottom pixel. Source canvas is
 * w x (h*2) pixels; each output char encodes one column over two rows. This
 * doubles the vertical resolution and shows real colour on both halves.
 */
function renderHalfblock(img: ImageData, w: number, h: number): string {
  const sw = w; // source width = char width (1 pixel per char column)
  let out = '';
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const topI = ((y * 2) * sw + x) * 4;
      const botI = ((y * 2 + 1) * sw + x) * 4;
      const tr = img.data[topI], tg = img.data[topI + 1], tb = img.data[topI + 2];
      const br = img.data[botI], bg = img.data[botI + 1], bb = img.data[botI + 2];
      out += `\x1b[38;2;${tr};${tg};${tb}m\x1b[48;2;${br};${bg};${bb}m▀`;
    }
    out += '\x1b[0m\n';
  }
  return out.replace(/\n+$/, '');
}

/**
 * Braille: 1 char = 2x4 source pixels mapped to 8 braille dots. Mono only
 * (Unicode braille blocks have no fg/bg style by themselves; renderer
 * picks a threshold). 8x effective resolution.
 *
 * Dot positions in U+2800..U+28FF:
 *   1 4
 *   2 5
 *   3 6
 *   7 8
 */
function renderBraille(img: ImageData, w: number, h: number): string {
  const sw = w * 2;
  // (col, row) in the 2x4 cell -> dot bit
  const dotBits = [
    [0x01, 0x08], // row 0
    [0x02, 0x10], // row 1
    [0x04, 0x20], // row 2
    [0x40, 0x80], // row 3
  ];
  let out = '';
  for (let cy = 0; cy < h; cy++) {
    for (let cx = 0; cx < w; cx++) {
      let bits = 0;
      for (let dy = 0; dy < 4; dy++) {
        for (let dx = 0; dx < 2; dx++) {
          const px = cx * 2 + dx;
          const py = cy * 4 + dy;
          const i = (py * sw + px) * 4;
          const r = img.data[i], g = img.data[i + 1], b = img.data[i + 2];
          const lum = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
          if (lum > 0.5) bits |= dotBits[dy][dx];
        }
      }
      out += String.fromCharCode(0x2800 + bits);
    }
    out += '\n';
  }
  return out.replace(/\n+$/, '');
}

// =============================================================================
// LiveChat Client
// =============================================================================

class LiveChatClient {
  private door: ClientDoor;
  private audio: AudioEngine;
  private audioInitialized: boolean = false;
  private pendingSounds: Array<{ soundId: string; params?: any }> = [];

  // Microphone capture state
  private mediaStream: MediaStream | null = null;
  private audioContext: AudioContext | null = null;
  private analyserNode: AnalyserNode | null = null;
  private mediaRecorder: MediaRecorder | null = null;
  private sourceNode: MediaStreamAudioSourceNode | null = null;

  // Video capture state
  private videoStream: MediaStream | null = null;
  private videoElement: HTMLVideoElement | null = null;
  private videoCanvas: HTMLCanvasElement | null = null;
  private videoFrameInterval: ReturnType<typeof setInterval> | null = null;

  // Voice state
  private isStreaming: boolean = false;
  private isMuted: boolean = false;
  private levelInterval: ReturnType<typeof setInterval> | null = null;
  private lastSpeakingState: boolean = false;
  private speakingThreshold: number = 0.01;

  // Audio playback for other users (using Web Audio API for continuous streaming)
  private audioPlayers: Map<string | number, {
    source: AudioBufferSourceNode | null;
    gainNode: GainNode;
    chunks: ArrayBuffer[];
  }> = new Map();

  constructor() {
    this.door = new ClientDoor({
      name: 'LiveChat',
      version: '3.2.0',
      author: 'AmiExpress-Web',
      description: 'Multi-user chat with audio support',
      runtime: 'hybrid',
      hybrid: true,
    });

    this.audio = new AudioEngine({
      masterVolume: 0.7,
      musicVolume: 0.3,
      sfxVolume: 0.6,
    });

    this.setupEventHandlers();
    this.setupUserGestureHandler();
  }

  /**
   * Browser autoplay policy requires user gesture to start audio.
   * Listen for first user interaction to initialize AudioEngine and AudioContext.
   */
  private setupUserGestureHandler(): void {
    const initOnGesture = async () => {
      if (this.audioInitialized) return;

      try {
        await this.audio.init();
        this.audioContext = new AudioContext();
        this.audioInitialized = true;
        console.log('[LiveChatClient] Audio initialized on user gesture');

        // Play any sounds that were queued before initialization
        for (const pending of this.pendingSounds) {
          this.audio.playSound(pending.soundId, pending.params);
        }
        this.pendingSounds = [];
      } catch (error) {
        console.debug('[LiveChatClient] Audio init failed:', error);
      }

      // Remove listeners after successful init
      document.removeEventListener('keydown', initOnGesture);
      document.removeEventListener('click', initOnGesture);
      document.removeEventListener('touchstart', initOnGesture);
    };

    // Listen for any user interaction
    document.addEventListener('keydown', initOnGesture, { once: false });
    document.addEventListener('click', initOnGesture, { once: false });
    document.addEventListener('touchstart', initOnGesture, { once: false });
  }

  private setupEventHandlers(): void {
    // ==========================================================================
    // UI Sound Events
    // ==========================================================================

    this.door.on('audio:play', async (data: { soundId: string; params?: any }) => {
      await this.playSound(data.soundId, data.params);
    });

    this.door.on('audio:set-enabled', (data: { enabled: boolean }) => {
      if (data.enabled) {
        this.audio.setUISoundsEnabled(true);
      } else {
        this.audio.setUISoundsEnabled(false);
      }
    });

    this.door.on('audio:set-volume', (data: { volume: number }) => {
      this.audio.setSfxVolume(data.volume);
    });

    // ==========================================================================
    // Voice Channel Events (Microphone Capture)
    // ==========================================================================

    this.door.on('audio:start-streaming', async (data: { options?: AudioStreamOptions }) => {
      console.log('[LiveChatClient] Received start-streaming command:', data);
      await this.startCapture(data.options || {});
    });

    this.door.on('audio:stop-streaming', async () => {
      console.log('[LiveChatClient] Received stop-streaming command');
      await this.stopCapture();
    });

    this.door.on('audio:mute', (data: { muted: boolean }) => {
      console.log('[LiveChatClient] Received mute command:', data.muted);
      this.setMuted(data.muted);
    });

    // ==========================================================================
    // Video Capture
    // ==========================================================================

    this.door.on('video:start-stream', async (data: any) => {
      console.log('[LiveChatClient] Received video:start-stream command:', data);
      await this.startVideoCapture(data?.options || {});
    });

    this.door.on('video:stop-stream', async () => {
      console.log('[LiveChatClient] Received video:stop-stream command');
      this.stopVideoCapture();
    });

    // Incoming audio from other users in voice channel
    this.door.on('audio:data', (data: { userId: string | number; chunk: ArrayBuffer }) => {
      this.playAudioChunk(data.userId, data.chunk);
    });

    // ==========================================================================
    // Door Lifecycle
    // ==========================================================================

    this.door.on('connect', () => {
      console.log('[LiveChatClient] Connected to server');
    });

    this.door.on('disconnect', () => {
      console.log('[LiveChatClient] Disconnected from server');
      this.stopCapture();
    });
  }

  // ============================================================================
  // UI Sound Playback
  // ============================================================================

  /**
   * Synthesize and play a note-based sound using Web Audio API
   */
  private async playSound(soundId: string, params?: any): Promise<void> {
    // Queue sounds if audio isn't initialized yet (waiting for user gesture)
    if (!this.audioInitialized || !this.audioContext) {
      // Only queue a few recent sounds to avoid overwhelming on first interaction
      if (this.pendingSounds.length < 3) {
        this.pendingSounds.push({ soundId, params });
      }
      console.debug('[LiveChatClient] Audio not ready, queued sound:', soundId);
      return;
    }

    try {
      // Synthesize sound from SOUNDS configuration
      await this.synthesizeSound(soundId);
    } catch (error) {
      console.debug('[LiveChatClient] Audio playback failed:', error);
    }
  }

  /**
   * Synthesize a sound from note configuration
   */
  private async synthesizeSound(soundId: string): Promise<void> {
    if (!this.audioContext) return;

    // Sound definitions (matches sounds.ts)
    const SOUNDS: Record<string, { note?: string; notes?: string[]; duration: number }> = {
      message: { note: 'C5', duration: 0.05 },
      mention: { notes: ['E5', 'G5', 'C6'], duration: 0.1 },
      join: { notes: ['C4', 'E4', 'G4'], duration: 0.15 },
      leave: { notes: ['G4', 'E4', 'C4'], duration: 0.15 },
      error: { note: 'C3', duration: 0.2 },
      notification: { note: 'A4', duration: 0.05 },
      reaction: { note: 'E5', duration: 0.03 },
      dm: { notes: ['C5', 'E5'], duration: 0.1 },
    };

    const soundConfig = SOUNDS[soundId];
    if (!soundConfig) {
      console.debug('[LiveChatClient] Unknown sound:', soundId);
      return;
    }

    const notes = soundConfig.notes || (soundConfig.note ? [soundConfig.note] : []);
    const duration = soundConfig.duration;

    // Play each note in sequence
    let offset = 0;
    for (const note of notes) {
      this.playNote(note, duration, offset);
      offset += duration;
    }
  }

  /**
   * Play a single musical note
   */
  private playNote(note: string, duration: number, startOffset: number = 0): void {
    if (!this.audioContext) return;

    // Note to frequency mapping
    const noteFrequencies: Record<string, number> = {
      'C3': 130.81, 'D3': 146.83, 'E3': 164.81, 'F3': 174.61, 'G3': 196.00, 'A3': 220.00, 'B3': 246.94,
      'C4': 261.63, 'D4': 293.66, 'E4': 329.63, 'F4': 349.23, 'G4': 392.00, 'A4': 440.00, 'B4': 493.88,
      'C5': 523.25, 'D5': 587.33, 'E5': 659.25, 'F5': 698.46, 'G5': 783.99, 'A5': 880.00, 'B5': 987.77,
      'C6': 1046.50, 'D6': 1174.66, 'E6': 1318.51, 'F6': 1396.91, 'G6': 1567.98, 'A6': 1760.00, 'B6': 1975.53,
    };

    const frequency = noteFrequencies[note];
    if (!frequency) {
      console.debug('[LiveChatClient] Unknown note:', note);
      return;
    }

    const now = this.audioContext.currentTime + startOffset;

    // Create oscillator for tone
    const oscillator = this.audioContext.createOscillator();
    oscillator.type = 'sine';
    oscillator.frequency.setValueAtTime(frequency, now);

    // Create gain for volume envelope
    const gainNode = this.audioContext.createGain();
    gainNode.gain.setValueAtTime(0, now);
    gainNode.gain.linearRampToValueAtTime(0.3, now + 0.01); // Attack
    gainNode.gain.exponentialRampToValueAtTime(0.01, now + duration); // Decay

    // Connect nodes
    oscillator.connect(gainNode);
    gainNode.connect(this.audioContext.destination);

    // Play
    oscillator.start(now);
    oscillator.stop(now + duration);
  }

  // ============================================================================
  // Microphone Capture (Voice Channels)
  // ============================================================================

  private async startCapture(options: AudioStreamOptions): Promise<void> {
    if (this.isStreaming) {
      console.log('[LiveChatClient] Already streaming');
      return;
    }

    try {
      // Initialize AudioContext if not already done
      if (!this.audioContext) {
        this.audioContext = new AudioContext();
      }

      // Resume context if suspended
      if (this.audioContext.state === 'suspended') {
        await this.audioContext.resume();
      }

      // Request microphone access
      this.mediaStream = await navigator.mediaDevices.getUserMedia({
        audio: {
          sampleRate: options.sampleRate || 48000,
          echoCancellation: options.echoCancellation !== false,
          noiseSuppression: options.noiseSuppression !== false,
          autoGainControl: options.autoGainControl !== false,
          channelCount: options.channelCount || 1,
        },
        video: false,
      });

      console.log('[LiveChatClient] Got media stream:', this.mediaStream.id);

      // Create audio nodes for level analysis
      this.sourceNode = this.audioContext.createMediaStreamSource(this.mediaStream);
      this.analyserNode = this.audioContext.createAnalyser();
      this.analyserNode.fftSize = 256;
      this.analyserNode.smoothingTimeConstant = 0.8;
      this.sourceNode.connect(this.analyserNode);

      // Setup MediaRecorder for audio chunks
      const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
        ? 'audio/webm;codecs=opus'
        : 'audio/webm';

      this.mediaRecorder = new MediaRecorder(this.mediaStream, {
        mimeType,
        audioBitsPerSecond: options.bitrate || 32000,
      });

      this.mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0 && !this.isMuted) {
          // Send audio chunk to server
          event.data.arrayBuffer().then((buffer) => {
            this.door.emit('audio:data', buffer);
          });
        }
      };

      // Start recording with 100ms chunks
      this.mediaRecorder.start(100);
      this.isStreaming = true;

      // Start audio level monitoring
      this.startLevelMonitoring();

      // Notify server
      this.door.emit('audio:started');

      console.log('[LiveChatClient] Audio capture started');

    } catch (error) {
      console.error('[LiveChatClient] Failed to start capture:', error);
      this.door.emit('audio:error', { message: (error as Error).message });
    }
  }

  private async stopCapture(): Promise<void> {
    if (!this.isStreaming) return;

    // Stop level monitoring
    this.stopLevelMonitoring();

    // Stop MediaRecorder
    if (this.mediaRecorder && this.mediaRecorder.state !== 'inactive') {
      this.mediaRecorder.stop();
    }
    this.mediaRecorder = null;

    // Disconnect audio nodes
    if (this.sourceNode) {
      this.sourceNode.disconnect();
      this.sourceNode = null;
    }
    this.analyserNode = null;

    // Stop media stream tracks
    if (this.mediaStream) {
      this.mediaStream.getTracks().forEach((track) => track.stop());
      this.mediaStream = null;
    }

    this.isStreaming = false;
    this.isMuted = false;

    // Notify server
    this.door.emit('audio:stopped');

    console.log('[LiveChatClient] Audio capture stopped');
  }

  private setMuted(muted: boolean): void {
    this.isMuted = muted;

    // Mute the audio track if we have one
    if (this.mediaStream) {
      this.mediaStream.getAudioTracks().forEach((track) => {
        track.enabled = !muted;
      });
    }

    console.log('[LiveChatClient] Muted:', muted);
  }

  private startLevelMonitoring(): void {
    if (this.levelInterval) return;

    const dataArray = new Uint8Array(this.analyserNode?.frequencyBinCount || 128);

    this.levelInterval = setInterval(() => {
      if (!this.analyserNode || !this.isStreaming) return;

      // Get frequency data
      this.analyserNode.getByteFrequencyData(dataArray);

      // Calculate RMS (root mean square) for audio level
      let sum = 0;
      for (let i = 0; i < dataArray.length; i++) {
        const normalized = dataArray[i] / 255;
        sum += normalized * normalized;
      }
      const rms = Math.sqrt(sum / dataArray.length);

      // Get time domain data for waveform
      const waveformData = new Uint8Array(this.analyserNode.fftSize);
      this.analyserNode.getByteTimeDomainData(waveformData);
      const waveform = Array.from(waveformData.slice(0, 30)).map((v) => (v - 128) / 128);

      // Send audio levels to server
      const levels: AudioLevels = {
        input: rms,
        output: 0,
        waveform,
      };
      this.door.emit('audio:levels', levels);

      // Detect speaking state change
      const isSpeaking = rms > this.speakingThreshold && !this.isMuted;
      if (isSpeaking !== this.lastSpeakingState) {
        this.lastSpeakingState = isSpeaking;
        this.door.emit('voice:speaking', {
          isSpeaking,
          audioLevel: rms,
        });
      }
    }, 50); // 20 updates per second
  }

  private stopLevelMonitoring(): void {
    if (this.levelInterval) {
      clearInterval(this.levelInterval);
      this.levelInterval = null;
    }
    this.lastSpeakingState = false;
  }

  // ============================================================================
  // Audio Playback from Other Users
  // ============================================================================

  /**
   * Play incoming audio chunk from another user
   * Uses Web Audio API for better streaming performance
   */
  private async playAudioChunk(userId: string | number, chunk: ArrayBuffer): Promise<void> {
    if (!this.audioContext) {
      console.debug('[LiveChatClient] AudioContext not ready');
      return;
    }

    try {
      // Get or create player state for this user
      let playerState = this.audioPlayers.get(userId);
      if (!playerState) {
        const gainNode = this.audioContext.createGain();
        gainNode.gain.value = 0.8;
        gainNode.connect(this.audioContext.destination);

        playerState = {
          source: null,
          gainNode,
          chunks: [],
        };
        this.audioPlayers.set(userId, playerState);
      }

      // Decode the audio chunk
      const audioBuffer = await this.audioContext.decodeAudioData(chunk.slice(0));

      // Create and play the audio buffer
      const source = this.audioContext.createBufferSource();
      source.buffer = audioBuffer;
      source.connect(playerState.gainNode);

      // Start playback immediately
      source.start(0);

      // Store reference (so we can stop it if needed)
      playerState.source = source;

      // Clean up when finished
      source.onended = () => {
        if (playerState && playerState.source === source) {
          playerState.source = null;
        }
      };

    } catch (error) {
      console.debug('[LiveChatClient] Failed to decode/play audio chunk:', error);

      // Fallback to simple Audio element for compatibility
      this.playAudioChunkFallback(userId, chunk);
    }
  }

  /**
   * Fallback audio playback using HTML Audio element
   * Used if Web Audio API decoding fails
   */
  private playAudioChunkFallback(userId: string | number, chunk: ArrayBuffer): void {
    try {
      const blob = new Blob([chunk], { type: 'audio/webm;codecs=opus' });
      const url = URL.createObjectURL(blob);

      const audio = new Audio(url);
      audio.volume = 0.8;
      audio.play().catch((error) => {
        console.debug('[LiveChatClient] Fallback playback failed:', error);
      });

      // Clean up blob URL after playback
      audio.onended = () => {
        URL.revokeObjectURL(url);
      };
    } catch (error) {
      console.error('[LiveChatClient] Fallback playback error:', error);
    }
  }

  // ==========================================================================
  // Video Capture (Webcam)
  // ==========================================================================

  private async startVideoCapture(options: any): Promise<void> {
    if (this.videoStream) {
      console.log('[LiveChatClient] Video already capturing');
      return;
    }

    try {
      console.log('[LiveChatClient] Requesting camera access...');
      this.videoStream = await navigator.mediaDevices.getUserMedia({
        video: {
          width: { ideal: 320 },
          height: { ideal: 240 },
          frameRate: { ideal: options.fps || 10 },
        },
        audio: false,
      });

      console.log('[LiveChatClient] Got video stream:', this.videoStream.id);

      // Create a hidden <video> to play the stream
      if (!this.videoElement) {
        this.videoElement = document.createElement('video');
        this.videoElement.autoplay = true;
        this.videoElement.muted = true;
        this.videoElement.playsInline = true;
        this.videoElement.style.display = 'none';
        document.body.appendChild(this.videoElement);
      }
      this.videoElement.srcObject = this.videoStream;
      await this.videoElement.play().catch(() => {});

      // Create hidden canvas for frame capture
      if (!this.videoCanvas) {
        this.videoCanvas = document.createElement('canvas');
        this.videoCanvas.style.display = 'none';
        document.body.appendChild(this.videoCanvas);
      }
      // Capture canvas is sized to the *source* pixel resolution required
      // by the chosen render mode. halfblock packs 1 char per 1x2 pixels;
      // braille packs 1 char per 2x4 pixels. ascii/color = 1:1.
      const charW = options.width || 80;
      const charH = options.height || 24;
      const mode = (options.mode as string) || (options.colored ? 'color' : 'ascii');
      const { px, py } = pixelsPerChar(mode);
      this.videoCanvas.width = charW * px;
      this.videoCanvas.height = charH * py;

      // Send frames at configured FPS
      const fps = options.fps || 10;
      const intervalMs = Math.max(50, Math.floor(1000 / fps));
      this.videoFrameInterval = setInterval(() => {
        this.sendVideoFrame(mode, charW, charH);
      }, intervalMs);

      this.door.emit('video:started');
      console.log('[LiveChatClient] Video capture started');
    } catch (error) {
      console.error('[LiveChatClient] Failed to start video:', error);
      this.door.emit('video:error', { message: (error as Error).message });
      this.stopVideoCapture();
    }
  }

  private sendVideoFrame(mode: string, charW: number, charH: number): void {
    if (!this.videoElement || !this.videoCanvas || !this.videoStream) return;
    if (this.videoElement.videoWidth === 0) return;
    const ctx = this.videoCanvas.getContext('2d');
    if (!ctx) return;
    // Flip horizontally so the webcam reads as a mirror (what the user
    // expects when looking at themselves) — the raw <video> feed would
    // otherwise show their left hand on the right side of the frame.
    ctx.save();
    ctx.translate(this.videoCanvas.width, 0);
    ctx.scale(-1, 1);
    ctx.drawImage(
      this.videoElement,
      0,
      0,
      this.videoCanvas.width,
      this.videoCanvas.height,
    );
    ctx.restore();
    const imgData = ctx.getImageData(
      0,
      0,
      this.videoCanvas.width,
      this.videoCanvas.height,
    );
    let frame: string;
    switch (mode) {
      case 'braille':
        frame = renderBraille(imgData, charW, charH);
        break;
      case 'halfblock':
        frame = renderHalfblock(imgData, charW, charH);
        break;
      case 'color':
        frame = renderAscii(imgData, charW, charH, true);
        break;
      case 'ascii':
      default:
        frame = renderAscii(imgData, charW, charH, false);
        break;
    }
    this.door.emit('video:frame', { frame });
  }

  private stopVideoCapture(): void {
    if (this.videoFrameInterval) {
      clearInterval(this.videoFrameInterval);
      this.videoFrameInterval = null;
    }
    if (this.videoStream) {
      this.videoStream.getTracks().forEach((t) => t.stop());
      this.videoStream = null;
    }
    if (this.videoElement) {
      this.videoElement.srcObject = null;
    }
    this.door.emit('video:stopped');
    console.log('[LiveChatClient] Video capture stopped');
  }

  public start(): void {
    // No FPS needed - we're not rendering, just handling events
    this.door.start();
    console.log('[LiveChatClient] Started - listening for audio events');
  }
}

// =============================================================================
// Entry Point
// =============================================================================

const client = new LiveChatClient();
client.start();
