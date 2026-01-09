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

  // Voice state
  private isStreaming: boolean = false;
  private isMuted: boolean = false;
  private levelInterval: ReturnType<typeof setInterval> | null = null;
  private lastSpeakingState: boolean = false;
  private speakingThreshold: number = 0.01;

  // Audio playback for other users
  private audioPlayers: Map<string | number, HTMLAudioElement> = new Map();

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

  private async playSound(soundId: string, params?: any): Promise<void> {
    // Queue sounds if audio isn't initialized yet (waiting for user gesture)
    if (!this.audioInitialized) {
      // Only queue a few recent sounds to avoid overwhelming on first interaction
      if (this.pendingSounds.length < 3) {
        this.pendingSounds.push({ soundId, params });
      }
      console.debug('[LiveChatClient] Audio not ready, queued sound:', soundId);
      return;
    }

    try {
      this.audio.playSound(soundId, params);
    } catch (error) {
      console.debug('[LiveChatClient] Audio playback failed:', error);
    }
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

  private playAudioChunk(userId: string | number, chunk: ArrayBuffer): void {
    try {
      const blob = new Blob([chunk], { type: 'audio/webm;codecs=opus' });
      const url = URL.createObjectURL(blob);

      // Get or create audio player for this user
      let player = this.audioPlayers.get(userId);
      if (!player) {
        player = new Audio();
        player.autoplay = true;
        this.audioPlayers.set(userId, player);
      }

      // Play the chunk
      player.src = url;
      player.play().catch((error) => {
        // Autoplay may be blocked - this is expected
        console.debug('[LiveChatClient] Playback blocked (needs user gesture):', error);
      });

      // Clean up blob URL after playback
      player.onended = () => {
        URL.revokeObjectURL(url);
      };
    } catch (error) {
      console.error('[LiveChatClient] Failed to play audio chunk:', error);
    }
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
