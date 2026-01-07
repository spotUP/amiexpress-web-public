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
  private analyserNode: AnalyserNode | null = null;
  private audioLevelInterval: any = null;

  constructor(socket: Socket) {
    this.socket = socket;
    this.setupSocketHandlers();
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
      console.log('[MediaHandler] Received audio:play-sfx:', data.type, data.soundId || data.note || data.notes);
      if (this.isMuted) return;

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
      if (!this.mediaStream) {
        this.mediaStream = await navigator.mediaDevices.getUserMedia({
          video: { width: 640, height: 480 },
          audio: false
        });
      } else {
        // Add video track to existing stream
        const videoStream = await navigator.mediaDevices.getUserMedia({ video: true });
        const videoTrack = videoStream.getVideoTracks()[0];
        this.mediaStream.addTrack(videoTrack);
      }

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
   * Set local playback volume
   */
  setVolume(volume: number): void {
    this.volume = Math.max(0, Math.min(1, volume));
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
   */
  private playSound(soundId: string, params?: any): void {
    console.log('[MediaHandler] Playing sound:', soundId, params);
    // TODO: Implement sound library playback when needed
    // For now, play a simple beep
    this.playNote('C4', 100);
  }

  /**
   * Play a musical note using Web Audio API
   */
  private playNote(note: string, duration: number = 200): void {
    if (!this.audioContext) return;

    // Simple note-to-frequency mapping
    const noteFrequencies: { [key: string]: number } = {
      'C4': 261.63, 'D4': 293.66, 'E4': 329.63, 'F4': 349.23,
      'G4': 392.00, 'A4': 440.00, 'B4': 493.88, 'C5': 523.25
    };

    const frequency = noteFrequencies[note] || 440;
    const oscillator = this.audioContext.createOscillator();
    const gainNode = this.audioContext.createGain();

    oscillator.type = 'sine';
    oscillator.frequency.value = frequency;

    gainNode.gain.value = this.volume * 0.3; // Reduce volume for beeps
    gainNode.gain.exponentialRampToValueAtTime(
      0.01,
      this.audioContext.currentTime + duration / 1000
    );

    oscillator.connect(gainNode);
    gainNode.connect(this.audioContext.destination);

    oscillator.start();
    oscillator.stop(this.audioContext.currentTime + duration / 1000);
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
