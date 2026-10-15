/**
 * Voice Chat - Hybrid Door Client Component
 *
 * This client runs in the browser and handles:
 * - Audio capture via Web Audio API (getUserMedia)
 * - Opus encoding via MediaRecorder
 * - Audio level calculation (RMS)
 * - Voice Activity Detection
 * - Audio playback of other users' streams
 *
 * The UI is rendered server-side via neo-blessed and sent as ANSI to the terminal.
 * This client only handles audio - the UI remains unchanged.
 */

import { ClientDoor } from '@amiexpress/bbs-door-sdk/client';

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
  testMode?: boolean;
}

interface AudioLevels {
  input: number;
  output: number;
  waveform?: number[];
}

// =============================================================================
// Voice Chat Client
// =============================================================================

class VoiceChatClient {
  private door: ClientDoor;

  // Audio capture state
  private mediaStream: MediaStream | null = null;
  private audioContext: AudioContext | null = null;
  private analyserNode: AnalyserNode | null = null;
  private mediaRecorder: MediaRecorder | null = null;
  private sourceNode: MediaStreamAudioSourceNode | null = null;

  // Audio playback state
  private audioPlayers: Map<string | number, HTMLAudioElement> = new Map();

  // State
  private isStreaming: boolean = false;
  private isMuted: boolean = false;
  private streamId: string | null = null;
  private currentOptions: AudioStreamOptions = {};

  // Audio level monitoring
  private levelInterval: ReturnType<typeof setInterval> | null = null;
  private lastSpeakingState: boolean = false;
  private speakingThreshold: number = 0.01;

  constructor() {
    this.door = new ClientDoor({
      name: 'Voice Chat',
      version: '2.0.0',
      author: 'AmiExpress Team',
      description: 'Multi-party voice chat with Web Audio',
      runtime: 'hybrid',
      hybrid: true,
    });

    this.setupEventHandlers();
    this.setupUserGestureHandler();
  }

  /**
   * Browser autoplay policy requires user gesture to start audio.
   * Listen for first user interaction to initialize AudioContext.
   */
  private setupUserGestureHandler(): void {
    const initOnGesture = async () => {
      if (this.audioContext) return;

      try {
        this.audioContext = new AudioContext();
        console.log('[VoiceChatClient] AudioContext initialized on user gesture');
      } catch (error) {
        console.error('[VoiceChatClient] AudioContext init failed:', error);
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
    // Handle start streaming command from server
    this.door.on('audio:start-streaming', async (data: { options?: AudioStreamOptions; streamId?: string }) => {
      console.log('[VoiceChatClient] Received start-streaming command:', data);
      await this.startCapture(data.options || {}, data.streamId);
    });

    // Handle stop streaming command from server
    this.door.on('audio:stop-streaming', async () => {
      console.log('[VoiceChatClient] Received stop-streaming command');
      await this.stopCapture();
    });

    // Handle mute command from server
    this.door.on('audio:mute', (data: { muted: boolean }) => {
      console.log('[VoiceChatClient] Received mute command:', data.muted);
      this.setMuted(data.muted);
    });

    // Handle incoming audio data from other users
    this.door.on('audio:data', (data: { userId: string | number; chunk: ArrayBuffer }) => {
      this.playAudioChunk(data.userId, data.chunk);
    });

    // Handle door lifecycle
    this.door.on('connect', () => {
      console.log('[VoiceChatClient] Connected to server');
    });

    this.door.on('disconnect', () => {
      console.log('[VoiceChatClient] Disconnected from server');
      this.stopCapture();
    });
  }

  /**
   * Start audio capture
   */
  private async startCapture(options: AudioStreamOptions, streamId?: string): Promise<void> {
    if (this.isStreaming) {
      console.log('[VoiceChatClient] Already streaming');
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

      this.currentOptions = options;
      this.streamId = streamId || `audio-${Date.now()}`;

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

      console.log('[VoiceChatClient] Got media stream:', this.mediaStream.id);

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

      console.log('[VoiceChatClient] Audio capture started');

    } catch (error) {
      console.error('[VoiceChatClient] Failed to start capture:', error);
      this.door.emit('audio:error', { message: (error as Error).message });
    }
  }

  /**
   * Stop audio capture
   */
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
    this.streamId = null;

    console.log('[VoiceChatClient] Audio capture stopped');
  }

  /**
   * Set mute state
   */
  private setMuted(muted: boolean): void {
    this.isMuted = muted;

    // Mute the audio track if we have one
    if (this.mediaStream) {
      this.mediaStream.getAudioTracks().forEach((track) => {
        track.enabled = !muted;
      });
    }

    console.log('[VoiceChatClient] Muted:', muted);
  }

  /**
   * Start monitoring audio levels and send updates
   */
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

  /**
   * Stop monitoring audio levels
   */
  private stopLevelMonitoring(): void {
    if (this.levelInterval) {
      clearInterval(this.levelInterval);
      this.levelInterval = null;
    }
    this.lastSpeakingState = false;
  }

  /**
   * Play audio chunk from another user
   */
  private playAudioChunk(userId: string | number, chunk: ArrayBuffer): void {
    // For now, we'll use simple audio playback
    // A more sophisticated implementation would use AudioWorklet for seamless streaming
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
        console.debug('[VoiceChatClient] Playback blocked (needs user gesture):', error);
      });

      // Clean up blob URL after playback
      player.onended = () => {
        URL.revokeObjectURL(url);
      };
    } catch (error) {
      console.error('[VoiceChatClient] Failed to play audio chunk:', error);
    }
  }

  /**
   * Get current audio levels (for external queries)
   */
  public getAudioLevels(): AudioLevels {
    if (!this.analyserNode || !this.isStreaming) {
      return { input: 0, output: 0, waveform: [] };
    }

    const dataArray = new Uint8Array(this.analyserNode.frequencyBinCount);
    this.analyserNode.getByteFrequencyData(dataArray);

    let sum = 0;
    for (let i = 0; i < dataArray.length; i++) {
      const normalized = dataArray[i] / 255;
      sum += normalized * normalized;
    }
    const rms = Math.sqrt(sum / dataArray.length);

    return {
      input: rms,
      output: 0,
      waveform: [],
    };
  }

  public start(): void {
    this.door.start();
    console.log('[VoiceChatClient] Started - listening for audio commands');
  }
}

// =============================================================================
// Entry Point
// =============================================================================

const client = new VoiceChatClient();
client.start();
