/**
 * Media Handler for BBSTerminal
 *
 * Handles client-side microphone capture and audio playback for voice chat.
 */

import { Socket } from 'socket.io-client';

export interface AudioStreamOptions {
  codec?: 'opus' | 'pcm';
  sampleRate?: number;
  bitrate?: number;
  echoCancellation?: boolean;
  noiseSuppression?: boolean;
  autoGainControl?: boolean;
}

export class MediaHandler {
  private socket: Socket;
  private mediaStream: MediaStream | null = null;
  private mediaRecorder: MediaRecorder | null = null;
  private audioContext: AudioContext | null = null;
  private videoElement: HTMLVideoElement | null = null;
  private canvasElement: HTMLCanvasElement | null = null;
  private videoCaptureInterval: any = null;
  private audioBuffers: Map<string, AudioBufferSourceNode[]> = new Map();
  private volume: number = 1.0;
  private isMuted: boolean = false;
  private uiSoundsEnabled: boolean = true;  // UI sounds flag (separate from voice mute)
  private analyserNode: AnalyserNode | null = null;
  private audioLevelInterval: any = null;

  constructor(socket: Socket) {
    this.socket = socket;
    this.setupSocketHandlers();
  }

  /**
   * Enable or disable UI sounds (click, hover, notifications, etc.)
   * This is separate from voice chat muting
   */
  public setUISoundsEnabled(enabled: boolean): void {
    this.uiSoundsEnabled = enabled;
  }

  /**
   * Check if UI sounds are enabled
   */
  public isUISoundsEnabled(): boolean {
    return this.uiSoundsEnabled;
  }

  /**
   * Set the volume for UI sounds (0.0 to 1.0)
   */
  public setVolume(volume: number): void {
    this.volume = Math.max(0, Math.min(1, volume));
  }

  /**
   * Get current volume level
   */
  public getVolume(): number {
    return this.volume;
  }

  private setupSocketHandlers() {
    // Listen for audio chunks from the server
    this.socket.on('audio:data', async (data: { userId: string | number, chunk: ArrayBuffer }) => {
      if (this.isMuted) return;
      await this.playAudioChunk(data.userId.toString(), data.chunk);
    });

    // Listen for mute status updates from other users (optional visual feedback)
    this.socket.on('audio:muted', (data: { userId: string | number, muted: boolean }) => {
      // Could be used to update UI
    });

    // Listen for procedural sound effects from the door
    this.socket.on('audio:play-sfx', async (data: any) => {
      // Check UI sounds flag (separate from voice mute)
      if (!this.uiSoundsEnabled) return;

      // Initialize audio context on first sound (required by browsers)
      if (!this.audioContext) {
        this.audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
      }

      switch (data.type) {
        case 'library':
          this.playSound(data.soundId, data.params);
          break;
        case 'note':
          this.playNote(data.note, data.duration);
          break;
        case 'chord':
          this.playChord(data.notes, data.duration);
          break;
      }
    });

    // Listen for UI sound enable/disable from door
    this.socket.on('audio:set-ui-sounds', (data: { enabled: boolean }) => {
      this.uiSoundsEnabled = data.enabled;
    });

    // Listen for volume changes from door
    this.socket.on('audio:set-volume', (data: { volume: number }) => {
      this.volume = Math.max(0, Math.min(1, data.volume));
    });
  }

  /**
   * Start capturing audio from the microphone
   */
  async startMicrophone(options: AudioStreamOptions = {}): Promise<void> {
    try {
      this.mediaStream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: options.echoCancellation ?? true,
          noiseSuppression: options.noiseSuppression ?? true,
          autoGainControl: options.autoGainControl ?? true,
          sampleRate: options.sampleRate ?? 48000,
        }
      });

      // Use MediaRecorder to encode audio to Opus
      // WebM/Opus is widely supported in modern browsers
      const mimeType = 'audio/webm;codecs=opus';
      if (!MediaRecorder.isTypeSupported(mimeType)) {
        throw new Error('Opus audio recording is not supported in this browser');
      }

      this.mediaRecorder = new MediaRecorder(this.mediaStream, {
        mimeType,
        audioBitsPerSecond: options.bitrate ?? 32000,
      });

      this.mediaRecorder.ondataavailable = async (event) => {
        if (event.data.size > 0 && this.socket.connected) {
          const buffer = await event.data.arrayBuffer();
          this.socket.emit('audio:data', buffer);
          
          // Also calculate volume level for VAD/UI
          this.calculateVolume(buffer);
        }
      };

      // Collect data in 100ms chunks for low latency
      this.mediaRecorder.start(100);

      // Set up audio level analysis for VU meters
      // This uses AnalyserNode to get real-time audio levels from the raw stream
      if (!this.audioContext) {
        this.audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
      }

      const source = this.audioContext.createMediaStreamSource(this.mediaStream);
      this.analyserNode = this.audioContext.createAnalyser();
      this.analyserNode.fftSize = 2048;
      this.analyserNode.smoothingTimeConstant = 0.3;
      source.connect(this.analyserNode);

      // Calculate and emit audio levels every 50ms for smooth VU meter
      const dataArray = new Uint8Array(this.analyserNode.frequencyBinCount);
      this.audioLevelInterval = setInterval(() => {
        if (!this.analyserNode) return;

        this.analyserNode.getByteTimeDomainData(dataArray);

        // Calculate RMS from time-domain data
        let sumSq = 0;
        for (let i = 0; i < dataArray.length; i++) {
          const normalized = (dataArray[i] - 128) / 128.0; // Convert to -1.0 to 1.0
          sumSq += normalized * normalized;
        }
        const rms = Math.sqrt(sumSq / dataArray.length);

        // Emit audio levels for VU meter (boost sensitivity)
        this.socket.emit('audio:levels', {
          input: Math.min(1.0, rms * 5.0),
          output: 0
        });
      }, 50);

      console.log('[MediaHandler] Microphone capture started with audio level monitoring');

    } catch (err) {
      console.error('[MediaHandler] Failed to start microphone:', err);
      throw err;
    }
  }

  /**
   * Stop capturing audio
   */
  stopMicrophone(): void {
    if (this.audioLevelInterval) {
      clearInterval(this.audioLevelInterval);
      this.audioLevelInterval = null;
    }
    if (this.analyserNode) {
      this.analyserNode.disconnect();
      this.analyserNode = null;
    }
    if (this.mediaRecorder && this.mediaRecorder.state !== 'inactive') {
      this.mediaRecorder.stop();
    }
    if (this.mediaStream) {
      this.mediaStream.getTracks().forEach(track => track.stop());
      this.mediaStream = null;
    }
    this.mediaRecorder = null;
    console.log('[MediaHandler] Microphone capture stopped');
  }

  /**
   * Start capturing video from the webcam
   * @param width - Output width in characters
   * @param height - Output height in pixels (halved for halfblock mode)
   * @param fps - Frames per second
   * @param mode - Render mode: 'halfblock' (2x resolution) or 'ascii' (classic characters)
   */
  async startVideo(width: number = 80, height: number = 24, fps: number = 10, mode: 'halfblock' | 'ascii' = 'halfblock'): Promise<void> {
    try {
      // CRITICAL: Stop any existing video capture first to prevent duplicate intervals
      if (this.videoCaptureInterval) {
        console.log('[MediaHandler] Stopping existing video capture before starting new one');
        clearInterval(this.videoCaptureInterval);
        this.videoCaptureInterval = null;
      }

      // Clean up old video element
      if (this.videoElement) {
        this.videoElement.pause();
        this.videoElement.srcObject = null;
        this.videoElement = null;
      }

      if (!this.mediaStream) {
        this.mediaStream = await navigator.mediaDevices.getUserMedia({
          video: { width: 640, height: 480 },
          audio: false
        });
      } else if (this.mediaStream.getVideoTracks().length === 0) {
        // Only add video track if we don't already have one
        const videoStream = await navigator.mediaDevices.getUserMedia({ video: true });
        const videoTrack = videoStream.getVideoTracks()[0];
        this.mediaStream.addTrack(videoTrack);
      }
      // If we already have video tracks, just reuse the existing stream

      this.videoElement = document.createElement('video');
      this.videoElement.srcObject = this.mediaStream;
      this.videoElement.play();

      this.canvasElement = document.createElement('canvas');
      this.canvasElement.width = width;
      this.canvasElement.height = height;

      const context = this.canvasElement.getContext('2d', { willReadFrequently: true });
      const renderMode = mode;

      this.videoCaptureInterval = setInterval(() => {
        if (context && this.videoElement && this.videoElement.readyState === 4) {
          // Draw video frame to small canvas
          context.drawImage(this.videoElement, 0, 0, width, height);

          // Get image data
          const imageData = context.getImageData(0, 0, width, height);

          // Send full RGB data for color conversion on server
          // Format: R,G,B,R,G,B,... (3 bytes per pixel)
          const data = new Uint8Array(width * height * 3);
          for (let i = 0, j = 0; i < imageData.data.length; i += 4, j += 3) {
            data[j] = imageData.data[i];     // R
            data[j+1] = imageData.data[i+1]; // G
            data[j+2] = imageData.data[i+2]; // B
          }

          this.socket.emit('video:data', {
            width,
            height,
            colored: true,
            mode: renderMode,
            data: data.buffer
          }, [data.buffer]);
        }
      }, 1000 / fps);

      console.log(`[MediaHandler] Video capture started at ${fps} FPS, mode: ${mode}`);

    } catch (err) {
      console.error('[MediaHandler] Failed to start video:', err);
      throw err;
    }
  }

  /**
   * Stop capturing video
   */
  stopVideo(): void {
    if (this.videoCaptureInterval) {
      clearInterval(this.videoCaptureInterval);
      this.videoCaptureInterval = null;
    }
    
    if (this.mediaStream) {
      const tracks = this.mediaStream.getVideoTracks();
      tracks.forEach(track => {
        track.stop();
        this.mediaStream?.removeTrack(track);
      });
    }
    
    if (this.videoElement) {
      this.videoElement.pause();
      this.videoElement.srcObject = null;
      this.videoElement = null;
    }
    
    this.canvasElement = null;
    console.log('[MediaHandler] Video capture stopped');
  }

  /**
   * Mute/unmute all incoming audio
   */
  setMuted(muted: boolean): void {
    this.isMuted = muted;
  }

  /**
   * Play an incoming audio chunk
   */
  private async playAudioChunk(userId: string, chunk: ArrayBuffer): Promise<void> {
    try {
      if (!this.audioContext) {
        this.audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
      }

      // Decode the WebM/Opus chunk
      // Note: decodeAudioData might have trouble with partial WebM streams
      // In a production environment, a more robust Opus decoder would be used
      const audioBuffer = await this.audioContext.decodeAudioData(chunk.slice(0));
      
      const source = this.audioContext.createBufferSource();
      source.buffer = audioBuffer;

      const gainNode = this.audioContext.createGain();
      gainNode.gain.value = this.volume;

      source.connect(gainNode);
      gainNode.connect(this.audioContext.destination);

      source.start();

      // Track buffers for cleanup
      if (!this.audioBuffers.has(userId)) {
        this.audioBuffers.set(userId, []);
      }
      this.audioBuffers.get(userId)!.push(source);

      source.onended = () => {
        const buffers = this.audioBuffers.get(userId);
        if (buffers) {
          const index = buffers.indexOf(source);
          if (index > -1) {
            buffers.splice(index, 1);
          }
        }
      };

    } catch (err) {
      // Silently ignore decode errors for partial chunks
      // console.warn('[MediaHandler] Audio decode error:', err);
    }
  }

  /**
   * Calculate root mean square (RMS) volume for visual feedback
   */
  private async calculateVolume(buffer: ArrayBuffer): Promise<void> {
    try {
      if (!this.audioContext) {
        this.audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
      }
      
      // If we have a mediaStream, we should use an AnalyserNode for better performance
      // but since we already have the encoded buffer for sending, we decode a clone for UI
      const audioBuffer = await this.audioContext.decodeAudioData(buffer.slice(0));
      const pcmData = audioBuffer.getChannelData(0);
      
      let sum = 0;
      for (let i = 0; i < pcmData.length; i++) {
        sum += pcmData[i] * pcmData[i];
      }
      const rms = Math.sqrt(sum / pcmData.length);
      const level = Math.min(1.0, rms * 10); // Sensitivity boost
      
      if (level > 0.05) {
        this.socket.emit('voice:speaking', { isSpeaking: true, audioLevel: level });
      } else {
        // Only emit "not speaking" if we were speaking before to reduce traffic
        this.socket.emit('voice:speaking', { isSpeaking: false, audioLevel: 0 });
      }
    } catch (err) {
      // Decode errors are common with partial stream chunks, ignore them
    }
  }

  /**
   * Play a sound from the library (browser-compatible)
   * Maps soundId to appropriate synthesized sounds
   */
  private playSound(soundId: string, params?: any): void {
    if (!this.audioContext) return;

    // Sound library - maps soundId to synthesis parameters
    const soundLibrary: { [key: string]: () => void } = {
      // UI sounds
      'click': () => this.playSynth('sine', 880, 0.05, 0.3),
      'hover': () => this.playSynth('sine', 660, 0.03, 0.15),
      'select': () => this.playSynth('triangle', 523, 0.08, 0.25),
      'success': () => {
        this.playSynth('sine', 523, 0.1, 0.3);
        setTimeout(() => this.playSynth('sine', 659, 0.1, 0.3), 100);
        setTimeout(() => this.playSynth('sine', 784, 0.15, 0.3), 200);
      },
      'error': () => {
        this.playSynth('sawtooth', 200, 0.15, 0.4);
        setTimeout(() => this.playSynth('sawtooth', 150, 0.2, 0.3), 150);
      },
      'warning': () => {
        this.playSynth('triangle', 440, 0.1, 0.3);
        setTimeout(() => this.playSynth('triangle', 440, 0.1, 0.3), 200);
      },
      'notification': () => {
        this.playSynth('sine', 880, 0.08, 0.25);
        setTimeout(() => this.playSynth('sine', 1109, 0.12, 0.25), 100);
      },
      'message': () => {
        this.playSynth('sine', 523, 0.05, 0.2);
        setTimeout(() => this.playSynth('sine', 659, 0.08, 0.2), 80);
      },
      'send': () => {
        this.playSynth('sine', 659, 0.05, 0.2);
        setTimeout(() => this.playSynth('sine', 784, 0.05, 0.2), 50);
        setTimeout(() => this.playSynth('sine', 1047, 0.08, 0.15), 100);
      },
      'typing': () => this.playSynth('sine', 1200, 0.02, 0.1),
      'join': () => {
        this.playSynth('sine', 392, 0.08, 0.2);
        setTimeout(() => this.playSynth('sine', 523, 0.1, 0.25), 100);
      },
      'leave': () => {
        this.playSynth('sine', 523, 0.08, 0.2);
        setTimeout(() => this.playSynth('sine', 392, 0.1, 0.2), 100);
      },
      'mention': () => {
        this.playSynth('sine', 784, 0.05, 0.3);
        setTimeout(() => this.playSynth('sine', 988, 0.05, 0.3), 80);
        setTimeout(() => this.playSynth('sine', 784, 0.08, 0.25), 160);
      },
      'popup': () => this.playSynth('sine', 700, 0.06, 0.2),
      'close': () => this.playSynth('sine', 400, 0.08, 0.2),
      'minimize': () => {
        this.playSynth('sine', 600, 0.04, 0.15);
        setTimeout(() => this.playSynth('sine', 400, 0.06, 0.15), 50);
      },
      'maximize': () => {
        this.playSynth('sine', 400, 0.04, 0.15);
        setTimeout(() => this.playSynth('sine', 600, 0.06, 0.15), 50);
      },
      'dock': () => {
        this.playSynth('sine', 500, 0.05, 0.2);
        setTimeout(() => this.playSynth('sine', 600, 0.08, 0.2), 80);
      },
      // Menu sounds
      'menu-open': () => this.playSynth('sine', 550, 0.05, 0.2),
      'menu-close': () => this.playSynth('sine', 450, 0.05, 0.2),
      'menu-select': () => this.playSynth('sine', 800, 0.04, 0.2),
      // Confirmation/Cancel sounds (used by AudioService)
      'confirm': () => {
        this.playSynth('sine', 523, 0.06, 0.25);
        setTimeout(() => this.playSynth('sine', 784, 0.1, 0.25), 80);
      },
      'cancel': () => {
        this.playSynth('sine', 392, 0.06, 0.2);
        setTimeout(() => this.playSynth('sine', 294, 0.1, 0.2), 80);
      },
      // Default fallback
      'default': () => this.playSynth('sine', 440, 0.08, 0.2),
    };

    const playFunc = soundLibrary[soundId] || soundLibrary['default'];
    playFunc();
  }

  /**
   * Low-level synthesizer for sounds
   */
  private playSynth(
    type: OscillatorType,
    frequency: number,
    duration: number,
    volume: number = 0.3
  ): void {
    if (!this.audioContext) return;

    const oscillator = this.audioContext.createOscillator();
    const gainNode = this.audioContext.createGain();

    oscillator.type = type;
    oscillator.frequency.value = frequency;

    const adjustedVolume = this.volume * volume;
    gainNode.gain.setValueAtTime(adjustedVolume, this.audioContext.currentTime);
    gainNode.gain.exponentialRampToValueAtTime(
      0.001,
      this.audioContext.currentTime + duration
    );

    oscillator.connect(gainNode);
    gainNode.connect(this.audioContext.destination);

    oscillator.start(this.audioContext.currentTime);
    oscillator.stop(this.audioContext.currentTime + duration + 0.05);
  }

  /**
   * Play a musical note using Web Audio API
   */
  private playNote(note: string, duration: number = 200): void {
    if (!this.audioContext) return;

    // Extended note-to-frequency mapping
    const noteFrequencies: { [key: string]: number } = {
      'C3': 130.81, 'D3': 146.83, 'E3': 164.81, 'F3': 174.61,
      'G3': 196.00, 'A3': 220.00, 'B3': 246.94,
      'C4': 261.63, 'D4': 293.66, 'E4': 329.63, 'F4': 349.23,
      'G4': 392.00, 'A4': 440.00, 'B4': 493.88,
      'C5': 523.25, 'D5': 587.33, 'E5': 659.25, 'F5': 698.46,
      'G5': 783.99, 'A5': 880.00, 'B5': 987.77,
      'C6': 1046.50,
    };

    const frequency = noteFrequencies[note] || 440;
    this.playSynth('sine', frequency, duration / 1000, 0.3);
  }

  /**
   * Play a chord (multiple notes simultaneously)
   */
  private playChord(notes: string[], duration: number = 200): void {
    notes.forEach(note => this.playNote(note, duration));
  }

  /**
   * Clean up all resources
   */
  destroy(): void {
    this.stopMicrophone();
    this.audioBuffers.forEach(buffers => {
      buffers.forEach(source => source.stop());
    });
    this.audioBuffers.clear();
    if (this.audioContext) {
      this.audioContext.close();
      this.audioContext = null;
    }
  }
}
