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
  VoiceCapture,
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

import {
  renderAscii,
  renderHalfblock,
  renderBraille,
  fitPreservingAspect,
} from './video-encoders';
// fitColorMemory is applied HERE, not left to the renderer: it returns a
// NEW memory when the tile changes shape, and a caller that does not store
// it back throws away the colour history on every frame at the new size -
// which looks exactly like the shimmer the hysteresis was added to remove.
import { createColorMemory, fitColorMemory, type ColorMemory } from './video-hysteresis';
import { richCells, type RichFrame } from './video-cells';

/**
 * Source pixels per character cell, for the two-plane frame: the braille
 * grid, which is the finest any render mode needs.
 */
const RICH_PIXELS_PER_CHAR = { px: 2, py: 4 };

/**
 * How wide a source pixel is relative to its height, at that grid.
 *
 * A terminal cell is about twice as tall as it is wide, and the 2x4 grid
 * puts twice as many samples across as a 1x2 one - which cancels out, so
 * the source pixels are square.
 */
const RICH_PIXEL_ASPECT = 1;
import { encodeRichFrame, isKeyframeDue } from './video-codec';


/**
 * Ceiling on outgoing video, in bytes per second.
 *
 * An ASCII frame of a full-window tile measures about 10KB. At ten frames a
 * second that is 100KB/s of text written into the terminal and diffed by the
 * door - enough to freeze the browser tab. 48KB/s keeps a small tile at full
 * rate and makes a large one slow down instead.
 */
const VIDEO_BYTES_PER_SECOND = 48 * 1024;


// =============================================================================
// LiveChat Client
// =============================================================================

class LiveChatClient {
  private door: ClientDoor;
  private audio: AudioEngine;
  private audioInitialized: boolean = false;
  private pendingSounds: Array<{ soundId: string; params?: any }> = [];

  // Microphone capture state (managed by VoiceCapture)
  private voiceCapture: VoiceCapture | null = null;
  private audioContext: AudioContext | null = null;

  // Video capture state
  private videoStream: MediaStream | null = null;
  private videoElement: HTMLVideoElement | null = null;
  private videoCanvas: HTMLCanvasElement | null = null;
  /**
   * What each cell was last coloured, so camera noise cannot re-encode a
   * still picture from scratch every frame. Measured at 2x smaller frames
   * and 4x better fidelity - see video-hysteresis.ts.
   */
  private colorMemory: ColorMemory | null = null;
  /** The last frame we sent, so the next one can be a delta against it. */
  private previousFrame: RichFrame | null = null;
  /** Frames since the last full one, so receivers can always resync. */
  private framesSinceKeyframe = 0;
  private videoFrameErrors = 0;
  private videoFrameInterval: ReturnType<typeof setInterval> | null = null;
  /** True between the start request and the camera answering. */
  private videoStarting: boolean = false;
  /** The shape the running capture encodes to; read fresh on every frame. */
  private videoShape: { mode: string; charW: number; charH: number } = { mode: 'ascii', charW: 80, charH: 24 };

  // Voice state
  private isStreaming: boolean = false;
  private isMuted: boolean = false;
  private isSpeaking: boolean = false;
  /** Most recent microphone level, so 'speaking' can report how loudly. */
  private lastMicLevel: number = 0;
  private audioLevels: AudioLevels = { input: 0, output: 0 };

  // UI sound effects bus (reverb + echo) — matches the /sdk/ preview
  // SoundEffects chain so chat clicks/hovers/mentions feel like the same
  // space. Lazily built the first time audioContext is ready.
  private sfxReverb: ConvolverNode | null = null;
  private sfxDelay: DelayNode | null = null;
  private sfxFeedback: GainNode | null = null;
  private sfxWet: GainNode | null = null;
  private sfxDry: GainNode | null = null;
  private sfxMaster: GainNode | null = null;
  private sfxBusReady: boolean = false;

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

    this.door.on('audio:stop-streaming', () => {
      console.log('[LiveChatClient] Received stop-streaming command');
      this.stopCapture();
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

    // Incoming audio is played by VoiceCapture, which owns the microphone,
    // the playback context and the per-speaker scheduling. This class used
    // to subscribe as well and decode every packet a second time, which
    // achieved nothing except a second failure per packet.

    // ==========================================================================
    // Door Lifecycle
    // ==========================================================================

    this.door.on('connect', () => {
      console.log('[LiveChatClient] Connected to server');
    });

    // Leaving the door, or closing the tab, must put the camera light out.
    // This used to stop the microphone only, so the webcam stayed live after
    // the chat was gone - reported as "the camera doesn't turn off if I
    // close or leave the LiveChat". Both teardown paths release BOTH.
    this.door.on('disconnect', () => {
      console.log('[LiveChatClient] Disconnected from server');
      this.releaseLocalMedia();
    });

    this.door.on('shutdown', () => {
      this.releaseLocalMedia();
    });
  }

  // ============================================================================
  // UI Sound Playback
  // ============================================================================

  /**
   * Build a reverb-impulse + delay effects bus once audioContext exists,
   * mirroring sdk/tools/preview/frontend/src/components/ui/SoundEffects.
   * UI sounds (hover/click/message/mention/etc) route through wet+dry;
   * mic & remote audio bypass this and go straight to destination.
   */
  private setupSfxBus(): void {
    if (this.sfxBusReady || !this.audioContext) return;
    const ctx = this.audioContext;

    // Reverb: convolver fed by a synthetic 3s exponential-decay impulse.
    this.sfxReverb = ctx.createConvolver();
    this.sfxReverb.buffer = this.makeReverbImpulse(3.0, 3.0);

    // Echo: ~250ms delay with 30% feedback loop.
    this.sfxDelay = ctx.createDelay(2.0);
    this.sfxDelay.delayTime.value = 0.25;
    this.sfxFeedback = ctx.createGain();
    this.sfxFeedback.gain.value = 0.3;

    // Wet/dry mix + master.
    this.sfxWet = ctx.createGain(); this.sfxWet.gain.value = 0.5;
    this.sfxDry = ctx.createGain(); this.sfxDry.gain.value = 0.5;
    this.sfxMaster = ctx.createGain(); this.sfxMaster.gain.value = 1.0;

    // Echo feedback loop.
    this.sfxDelay.connect(this.sfxFeedback);
    this.sfxFeedback.connect(this.sfxDelay);
    // Wet: delay -> reverb -> wet -> master.
    this.sfxDelay.connect(this.sfxReverb);
    this.sfxReverb.connect(this.sfxWet);
    this.sfxWet.connect(this.sfxMaster);
    // Dry: dry -> master.
    this.sfxDry.connect(this.sfxMaster);
    // Master -> speakers.
    this.sfxMaster.connect(ctx.destination);

    this.sfxBusReady = true;
  }

  private makeReverbImpulse(durationSec: number, decay: number): AudioBuffer {
    const ctx = this.audioContext!;
    const sampleRate = ctx.sampleRate;
    const length = Math.floor(sampleRate * durationSec);
    const impulse = ctx.createBuffer(2, length, sampleRate);
    const l = impulse.getChannelData(0);
    const r = impulse.getChannelData(1);
    for (let i = 0; i < length; i++) {
      const envelope = Math.exp(-i / (sampleRate * decay));
      l[i] = (Math.random() * 2 - 1) * envelope;
      r[i] = (Math.random() * 2 - 1) * envelope;
    }
    return impulse;
  }

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

    // Route through the reverb+echo bus if it's been built. This matches
    // the /sdk/ preview's SoundEffects: oscillator -> gain -> (delay+reverb
    // wet path) + (dry path) -> master -> speakers. Falls back to a direct
    // connection if the bus isn't ready (first sound may still be queued).
    oscillator.connect(gainNode);
    this.setupSfxBus();
    if (this.sfxBusReady && this.sfxDry && this.sfxDelay) {
      gainNode.connect(this.sfxDry);
      gainNode.connect(this.sfxDelay);
    } else {
      gainNode.connect(this.audioContext.destination);
    }

    // Play
    oscillator.start(now);
    oscillator.stop(now + duration);
  }

  // ============================================================================
  // Microphone Capture (Voice Channels)
  // ============================================================================

  private async startCapture(options: AudioStreamOptions = {}): Promise<void> {
    if (this.voiceCapture) return;
    this.voiceCapture = new VoiceCapture(this.door, {
      echoCancellation: options.echoCancellation !== false,
      noiseSuppression: options.noiseSuppression !== false,
      autoGainControl: options.autoGainControl !== false,
      sampleRate: options.sampleRate || 48000,
      bitrate: options.bitrate || 32000,
    });
    this.voiceCapture.on('speaking', (speaking: boolean) => {
      this.isSpeaking = speaking;
      // The real level, not a hardcoded zero. Whoever draws a meter needs
      // something to draw, and "am I actually being heard?" is the one
      // question a voice UI has to answer.
      this.door.emit('voice:speaking', { isSpeaking: speaking, audioLevel: this.lastMicLevel });
    });
    this.voiceCapture.on('level', (rms: number) => {
      this.lastMicLevel = rms;
      this.audioLevels = { input: rms, output: 0 };
      this.door.emit('audio:levels', this.audioLevels);
    });
    this.voiceCapture.on('error', (err: Error) => {
      console.error('[LiveChatClient] VoiceCapture error:', err);
      this.door.emit('audio:error', { error: err.message });
    });
    await this.voiceCapture.start(options);
    this.isStreaming = true;
  }

  private stopCapture(): void {
    this.voiceCapture?.destroy();
    this.voiceCapture = null;
    this.isStreaming = false;
  }

  /**
   * Give back every capture device this door holds.
   *
   * One place, because "stop the microphone" and "stop the camera" being
   * separate is exactly how the camera got left running: the disconnect
   * path called one of them.
   */
  private releaseLocalMedia(): void {
    this.stopCapture();
    this.stopVideoCapture();
  }

  private setMuted(muted: boolean): void {
    this.isMuted = muted;
    if (muted) this.voiceCapture?.mute();
    else this.voiceCapture?.unmute();
  }

  // ============================================================================
  // Audio Playback from Other Users
  // ============================================================================


  // ==========================================================================
  // Video Capture (Webcam)
  // ==========================================================================

  private async startVideoCapture(options: any): Promise<void> {
    // Already running? Re-size the capture rather than starting a SECOND
    // one. Two captures at different sizes both wrote frames into the same
    // tile and the view alternated between them - which is the flicker
    // reported as "every second frame is broken", visible only in the 80x25
    // view because that is where the tile size changes (diagnosed from
    // frames arriving as 54x15 and 27x8 in turn, 2026-08-26).
    if (this.videoStream) {
      this.resizeVideoCapture(options);
      return;
    }

    // The old guard tested videoStream, which is not assigned until AFTER
    // getUserMedia resolves - so two starts in quick succession both sailed
    // past it and each set up its own stream and timer.
    if (this.videoStarting) {
      console.log('[LiveChatClient] Video already starting');
      return;
    }
    this.videoStarting = true;

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
    // ALWAYS braille resolution: two pixels across, four down, per cell.
    //
    // The canvas used to be sized per render mode, because each mode read
    // the pixels its own way. The frame now carries both planes so the
    // VIEWER can choose the mode, and the dot plane needs the finest grid
    // any mode uses - 2x4. Sizing the canvas for half-block's 1x2 while
    // sampling a 2x4 grid reads past the end of every row, which arrives as
    // horizontal streaks instead of a picture.
      const { px, py } = RICH_PIXELS_PER_CHAR;
      this.videoCanvas.width = charW * px;
      this.videoCanvas.height = charH * py;

      // Send frames at configured FPS. Never leave a previous timer running:
      // the handle lives in one field, so overwriting it orphaned the old
      // interval, which kept sending frames at the old size for ever.
      if (this.videoFrameInterval) {
        clearTimeout(this.videoFrameInterval);
        this.videoFrameInterval = null;
      }
      this.videoShape = { mode, charW, charH };
      const fps = options.fps || 10;
      const intervalMs = Math.max(50, Math.floor(1000 / fps));
      // Pace by BYTES, not by frames alone.
      //
      // A frame is one ASCII picture of the tile, and a big tile makes a big
      // picture: measured at 10KB each for a full-window tile. Ten of those a
      // second is 100KB/s of text written into the terminal and diffed by the
      // door on every frame, and the browser tab froze under it (reported
      // 2026-08-26, twice, on the fullscreen chat).
      //
      // So the interval is a FLOOR and the byte budget is the real limit: a
      // small tile still runs at full rate, a large one slows down instead of
      // drowning the terminal. Slower video beats a frozen page.
      const tick = () => {
        if (!this.videoStream) return;

        // One bad frame must not end the stream.
        //
        // The loop reschedules itself, so an exception thrown while
        // encoding did not just drop a frame - it broke the chain and video
        // stopped for good, silently, with the tile left saying "waiting
        // for video". Report it once and keep going.
        let bytes = 0;
        try {
          const shape = this.videoShape;
          bytes = this.sendVideoFrame(shape.mode, shape.charW, shape.charH) ?? 0;
        } catch (error) {
          this.videoFrameErrors++;
          if (this.videoFrameErrors === 1 || this.videoFrameErrors % 100 === 0) {
            const message = (error as Error)?.message ?? String(error);
            console.error('[LiveChatClient] Frame encode failed:', error);
            // Send it where it can be read without a browser console open.
            this.door.emit('video:error', {
              message: `frame encode failed (${this.videoFrameErrors}): ${message}`,
            });
          }
        }

        // How long this frame's size says we should wait, at the budget.
        const budgetMs = (bytes / VIDEO_BYTES_PER_SECOND) * 1000;
        // ceil, not round: rounding down puts throughput back OVER the
        // budget, and a ceiling that can be exceeded is not a ceiling.
        const wait = Math.max(intervalMs, Math.ceil(budgetMs));

        this.videoFrameInterval = setTimeout(tick, wait) as unknown as number;
      };

      this.videoFrameInterval = setTimeout(tick, intervalMs) as unknown as number;

      this.door.emit('video:started');
      console.log(`[LiveChatClient] Video capture started (${charW}x${charH} ${mode})`);
    } catch (error) {
      console.error('[LiveChatClient] Failed to start video:', error);
      this.door.emit('video:error', { message: (error as Error).message });
      this.stopVideoCapture();
    } finally {
      this.videoStarting = false;
    }
  }

  /**
   * Point an existing capture at a new tile size or render mode.
   *
   * One capture, one timer: the frame shape is read from videoShape on every
   * tick, so changing it here takes effect on the next frame without
   * touching the camera or the timer.
   */
  private resizeVideoCapture(options: any): void {
    const charW = options.width || this.videoShape.charW;
    const charH = options.height || this.videoShape.charH;
    const mode = (options.mode as string) || (options.colored ? 'color' : this.videoShape.mode);

    if (charW === this.videoShape.charW && charH === this.videoShape.charH && mode === this.videoShape.mode) {
      return;
    }

    // ALWAYS braille resolution: two pixels across, four down, per cell.
    //
    // The canvas used to be sized per render mode, because each mode read
    // the pixels its own way. The frame now carries both planes so the
    // VIEWER can choose the mode, and the dot plane needs the finest grid
    // any mode uses - 2x4. Sizing the canvas for half-block's 1x2 while
    // sampling a 2x4 grid reads past the end of every row, which arrives as
    // horizontal streaks instead of a picture.
    const { px, py } = RICH_PIXELS_PER_CHAR;
    if (this.videoCanvas) {
      this.videoCanvas.width = charW * px;
      this.videoCanvas.height = charH * py;
    }
    this.videoShape = { mode, charW, charH };
    console.log(`[LiveChatClient] Video capture resized to ${charW}x${charH} ${mode}`);
  }

  /** Returns the frame's size in bytes, so the caller can pace by bandwidth. */
  private sendVideoFrame(mode: string, charW: number, charH: number): number {
    if (!this.videoElement || !this.videoCanvas || !this.videoStream) return 0;
    if (this.videoElement.videoWidth === 0) return 0;
    const ctx = this.videoCanvas.getContext('2d');
    if (!ctx) return 0;
    // Flip horizontally so the webcam reads as a mirror (what the user
    // expects when looking at themselves) — the raw <video> feed would
    // otherwise show their left hand on the right side of the frame.
    // Fit the camera inside the canvas rather than stretching it to fill.
    // The tile can be any shape now, and stretching gave a wide tile a wide
    // face. pixelAspect is what makes the fit correct in a terminal, where a
    // cell is about twice as tall as it is wide.
    const fit = fitPreservingAspect(
      this.videoElement.videoWidth,
      this.videoElement.videoHeight,
      this.videoCanvas.width,
      this.videoCanvas.height,
      RICH_PIXEL_ASPECT
    );

    // Black behind it, so the letterboxing is empty rather than whatever the
    // last frame left there.
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, this.videoCanvas.width, this.videoCanvas.height);

    ctx.save();
    ctx.translate(this.videoCanvas.width, 0);
    ctx.scale(-1, 1);
    ctx.drawImage(
      this.videoElement,
      this.videoCanvas.width - fit.dx - fit.dw,
      fit.dy,
      fit.dw,
      fit.dh,
    );
    ctx.restore();
    const imgData = ctx.getImageData(
      0,
      0,
      this.videoCanvas.width,
      this.videoCanvas.height,
    );
    // Cells, not markup.
    //
    // The picture used to be turned into blessed tags here and sent as
    // text: twenty-four bytes every time the colour changed, the whole
    // picture every frame. One byte per cell, run-length encoded, with
    // unchanged stretches skipped against the last frame, is an order of
    // magnitude less - and since the client paces itself on bytes, that is
    // an order of magnitude more frames per second.
    this.colorMemory = fitColorMemory(
      this.colorMemory ?? createColorMemory(charW, charH), charW, charH);

    // Both planes, so the mode is the VIEWER's choice.
    //
    // Each mode used to have its own cell format, which made render mode a
    // property of the sender: cycling it changed what other people saw of
    // you, not what you saw of them. Dots and colours together can be drawn
    // as any of the modes, so everybody picks their own.
    const frame = richCells(imgData, charW, charH, this.colorMemory);

    // A delta is only valid against a frame of the same shape, and only
    // against a base the receiver actually holds. A resize forces a full
    // frame; so does the keyframe interval, which is what lets a viewer who
    // joined mid-stream - or missed a packet - recover instead of staring
    // at cells no delta ever mentions again.
    const sameShape = this.previousFrame !== null
      && this.previousFrame.dots.length === frame.dots.length;
    const keyframe = isKeyframeDue(this.framesSinceKeyframe) || !sameShape;

    const packet = encodeRichFrame(
      frame, charW, charH, keyframe ? null : this.previousFrame
    );
    this.previousFrame = frame;
    this.framesSinceKeyframe = keyframe ? 1 : this.framesSinceKeyframe + 1;

    this.door.emit('video:cells', packet);
    return packet.byteLength;
  }

  private stopVideoCapture(): void {
    if (this.videoFrameInterval) {
      clearTimeout(this.videoFrameInterval);
      this.videoFrameInterval = null;
    }
    if (this.videoStream) {
      this.videoStream.getTracks().forEach((t) => t.stop());
      this.videoStream = null;
    }
    if (this.videoElement) {
      // Take the element OUT of the page, not just off the stream.
      //
      // Every door:load-client builds a new client, and each one appended its
      // own hidden <video> to the body and left it there. Re-enter the chat
      // enough times and Chrome refuses to make any more:
      // "Blocked attempt to create a WebMediaPlayer as there are too many
      // WebMediaPlayers already in existence" - at which point video stops
      // working and nothing says why.
      this.videoElement.srcObject = null;
      this.videoElement.pause();
      this.videoElement.remove();
      this.videoElement = null;
    }
    // Forget the per-cell colours: the next stream may be a different
    // size, a different mode, or a different scene entirely. The frame
    // history goes with them, so the next stream opens with a full frame.
    this.colorMemory = null;
    this.previousFrame = null;
    this.framesSinceKeyframe = 0;

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
