/**
 * Tracker Engine - MOD/XM/S3M/IT Module Player
 *
 * High-accuracy tracker music playback using libopenmpt (via chiptune3).
 * Supports 50+ tracker formats with authentic playback matching original
 * trackers (ProTracker, FastTracker 2, Scream Tracker 3, Impulse Tracker).
 *
 * @example
 * ```typescript
 * import { TrackerEngine } from '@amiexpress/bbs-door-sdk';
 *
 * const tracker = new TrackerEngine();
 *
 * // Wait for initialization
 * tracker.on('initialized', async () => {
 *   // Load and play a module
 *   await tracker.load('/music/song.mod');
 *
 *   // Or load from ArrayBuffer
 *   const buffer = await fetch('/music/song.xm').then(r => r.arrayBuffer());
 *   tracker.play(buffer);
 * });
 *
 * // Track playback position
 * tracker.on('progress', (info) => {
 *   console.log(`Pattern ${info.pattern}, Row ${info.row}`);
 * });
 *
 * // Handle song end
 * tracker.on('ended', () => {
 *   console.log('Song finished');
 * });
 * ```
 *
 * @see https://lib.openmpt.org/libopenmpt - libopenmpt documentation
 * @see https://github.com/DrSnuggles/chiptune - chiptune3 library
 */

// ============================================================================
// Types
// ============================================================================

/** Supported tracker formats */
export type TrackerFormat =
  | 'mod'   // ProTracker MOD (Amiga)
  | 'xm'    // FastTracker 2 Extended Module
  | 's3m'   // Scream Tracker 3
  | 'it'    // Impulse Tracker
  | 'mptm'  // OpenMPT Module
  | 'stm'   // Scream Tracker 2
  | 'nst'   // NoiseTracker
  | 'm15'   // 15-sample MOD
  | 'stk'   // SoundTracker
  | 'wow'   // Mod's Grave WOW
  | 'ult'   // UltraTracker
  | '669'   // Composer 669
  | 'mtm'   // MultiTracker
  | 'med'   // OctaMED
  | 'far'   // Farandole
  | 'mdl'   // DigiTracker
  | 'ams'   // Extreme's Tracker / Velvet Studio
  | 'dsm'   // DSIK
  | 'amf'   // ASYLUM / DMP
  | 'okt'   // Oktalyzer
  | 'dmf'   // X-Tracker
  | 'ptm'   // PolyTracker
  | 'psm'   // Epic MegaGames MASI
  | 'mt2'   // MadTracker 2
  | 'dbm'   // DigiBooster Pro
  | 'digi'  // DigiBooster
  | 'imf'   // Imago Orpheus
  | 'j2b'   // Galaxy Sound System
  | 'gdm'   // General DigiMusic
  | 'umx'   // Unreal Music
  | 'plm'   // Disorder Tracker 2
  | 'mo3';  // MO3 compressed module

/** Interpolation filter types */
export enum InterpolationFilter {
  /** No interpolation (harsh, authentic) */
  None = 0,
  /** Linear interpolation */
  Linear = 1,
  /** Cubic interpolation */
  Cubic = 2,
  /** Windowed sinc with 8 taps (high quality) */
  Sinc8 = 3,
}

/** Tracker engine configuration */
export interface TrackerConfig {
  /** Repeat count: -1 = endless, 0 = play once, n = repeat n times */
  repeatCount?: number;
  /** Stereo separation percentage (0-200, default 100) */
  stereoSeparation?: number;
  /** Interpolation filter for resampling */
  interpolationFilter?: InterpolationFilter;
  /** Custom AudioContext (optional, creates new one if not provided) */
  audioContext?: AudioContext;
  /** Initial volume (0.0 - 1.0, default 1.0) */
  volume?: number;
  /** Auto-play when loading (default false) */
  autoPlay?: boolean;
}

/** Module metadata */
export interface ModuleMetadata {
  /** Module title */
  title: string;
  /** Module type/format */
  type: string;
  /** Original tracker used to create the module */
  tracker: string;
  /** Number of channels */
  channels: number;
  /** Number of patterns */
  patterns: number;
  /** Number of orders in the song */
  orders: number;
  /** Number of instruments */
  instruments: number;
  /** Number of samples */
  samples: number;
  /** Module duration in seconds */
  duration: number;
  /** Number of subsongs */
  subsongs: number;
  /** Module message/comments */
  message: string;
  /** Instrument names */
  instrumentNames: string[];
  /** Sample names */
  sampleNames: string[];
}

/** Playback position information */
export interface PlaybackPosition {
  /** Current position in seconds */
  position: number;
  /** Current order (song position) */
  order: number;
  /** Current pattern number */
  pattern: number;
  /** Current row within pattern */
  row: number;
}

/** Error information */
export interface TrackerError {
  /** Error type */
  type: 'Load' | 'Decode' | 'Playback' | 'Unknown';
  /** Error message */
  message?: string;
}

/** Event types */
export type TrackerEventType =
  | 'initialized'
  | 'metadata'
  | 'progress'
  | 'ended'
  | 'error'
  | 'statechange';

/** Playback state */
export enum PlaybackState {
  Stopped = 'stopped',
  Playing = 'playing',
  Paused = 'paused',
  Loading = 'loading',
}

/** Event handler types */
export type TrackerEventHandler<T = void> = (data: T) => void;

export interface TrackerEvents {
  initialized: TrackerEventHandler;
  metadata: TrackerEventHandler<ModuleMetadata>;
  progress: TrackerEventHandler<PlaybackPosition>;
  ended: TrackerEventHandler;
  error: TrackerEventHandler<TrackerError>;
  statechange: TrackerEventHandler<PlaybackState>;
}

// ============================================================================
// TrackerEngine Class
// ============================================================================

/**
 * Tracker music player engine using libopenmpt.
 *
 * Provides high-accuracy playback of MOD, XM, S3M, IT, and 50+ other
 * tracker formats with authentic sound reproduction.
 */
export class TrackerEngine {
  /** Engine configuration */
  private config: Required<Omit<TrackerConfig, 'audioContext'>> & { audioContext?: AudioContext };

  /** Underlying chiptune3 player instance */
  private player: any = null;

  /** Event handlers */
  private eventHandlers: Map<TrackerEventType, Set<TrackerEventHandler<any>>> = new Map();

  /** Current playback state */
  private _state: PlaybackState = PlaybackState.Stopped;

  /** Module metadata */
  private _metadata: ModuleMetadata | null = null;

  /** Current position */
  private _position: PlaybackPosition = { position: 0, order: 0, pattern: 0, row: 0 };

  /** Is engine initialized? */
  private _initialized: boolean = false;

  /** Is browser environment? */
  private readonly isBrowser: boolean;

  /**
   * Create a new TrackerEngine instance.
   *
   * @param config - Engine configuration
   *
   * @example
   * ```typescript
   * // Default configuration
   * const tracker = new TrackerEngine();
   *
   * // Custom configuration
   * const tracker = new TrackerEngine({
   *   repeatCount: 0,           // Play once
   *   stereoSeparation: 100,    // Normal stereo
   *   interpolationFilter: InterpolationFilter.Sinc8,
   *   volume: 0.8
   * });
   * ```
   */
  constructor(config: TrackerConfig = {}) {
    this.config = {
      repeatCount: config.repeatCount ?? -1,
      stereoSeparation: config.stereoSeparation ?? 100,
      interpolationFilter: config.interpolationFilter ?? InterpolationFilter.Linear,
      audioContext: config.audioContext,
      volume: config.volume ?? 1.0,
      autoPlay: config.autoPlay ?? false,
    };

    // Check if we're in a browser environment
    this.isBrowser = typeof globalThis !== 'undefined' &&
      (globalThis as any).window !== undefined &&
      typeof (globalThis as any).window.AudioContext !== 'undefined';

    if (!this.isBrowser) {
      console.warn('TrackerEngine: Running in Node.js environment. Audio playback disabled.');
      return;
    }

    // Initialize the player
    this.initPlayer();
  }

  /**
   * Initialize the chiptune3 player.
   * @private
   */
  private async initPlayer(): Promise<void> {
    try {
      // Dynamic import to avoid issues in Node.js
      const { ChiptuneJsPlayer } = await import('chiptune3');

      this.player = new ChiptuneJsPlayer({
        repeatCount: this.config.repeatCount,
        stereoSeparation: this.config.stereoSeparation,
        interpolationFilter: this.config.interpolationFilter,
        context: this.config.audioContext,
      });

      // Set initial volume
      this.player.setVol(this.config.volume);

      // Wire up event handlers
      this.player.onInitialized(() => {
        this._initialized = true;
        this.emit('initialized');
      });

      this.player.onMetadata((meta: any) => {
        this._metadata = this.parseMetadata(meta);
        this.emit('metadata', this._metadata);
      });

      this.player.onProgress((data: any) => {
        this._position = {
          position: data.pos || 0,
          order: data.order || 0,
          pattern: data.pattern || 0,
          row: data.row || 0,
        };
        this.emit('progress', this._position);
      });

      this.player.onEnded(() => {
        this.setState(PlaybackState.Stopped);
        this.emit('ended');
      });

      this.player.onError((err: any) => {
        this.emit('error', {
          type: err?.type || 'Unknown',
          message: err?.message,
        });
      });

    } catch (error) {
      console.error('TrackerEngine: Failed to initialize chiptune3:', error);
      this.emit('error', { type: 'Unknown', message: String(error) });
    }
  }

  /**
   * Parse raw metadata from libopenmpt into structured format.
   * @private
   */
  private parseMetadata(meta: any): ModuleMetadata {
    return {
      title: meta?.title || meta?.song || 'Unknown',
      type: meta?.type || 'Unknown',
      tracker: meta?.tracker || 'Unknown',
      channels: meta?.channels || 0,
      patterns: meta?.patterns || 0,
      orders: meta?.orders || 0,
      instruments: meta?.instruments || 0,
      samples: meta?.samples || 0,
      duration: meta?.dur || 0,
      subsongs: meta?.subsongs || 1,
      message: meta?.message || '',
      instrumentNames: meta?.instrumentNames || [],
      sampleNames: meta?.sampleNames || [],
    };
  }

  /**
   * Set playback state and emit event.
   * @private
   */
  private setState(state: PlaybackState): void {
    if (this._state !== state) {
      this._state = state;
      this.emit('statechange', state);
    }
  }

  /**
   * Emit an event to all registered handlers.
   * @private
   */
  private emit<K extends TrackerEventType>(
    event: K,
    data?: K extends keyof TrackerEvents ? Parameters<TrackerEvents[K]>[0] : never
  ): void {
    const handlers = this.eventHandlers.get(event);
    if (handlers) {
      handlers.forEach(handler => {
        try {
          handler(data as any);
        } catch (error) {
          console.error(`TrackerEngine: Error in ${event} handler:`, error);
        }
      });
    }
  }

  // ==========================================================================
  // Public API
  // ==========================================================================

  /**
   * Check if engine is initialized and ready.
   */
  get initialized(): boolean {
    return this._initialized;
  }

  /**
   * Get current playback state.
   */
  get state(): PlaybackState {
    return this._state;
  }

  /**
   * Get module metadata (available after loading).
   */
  get metadata(): ModuleMetadata | null {
    return this._metadata;
  }

  /**
   * Get current playback position.
   */
  get position(): PlaybackPosition {
    return { ...this._position };
  }

  /**
   * Get current time in seconds.
   */
  get currentTime(): number {
    return this.player?.getCurrentTime?.() || this._position.position;
  }

  /**
   * Get module duration in seconds.
   */
  get duration(): number {
    return this._metadata?.duration || 0;
  }

  /**
   * Register an event handler.
   *
   * @param event - Event type
   * @param handler - Event handler function
   * @returns this (for chaining)
   *
   * @example
   * ```typescript
   * tracker.on('progress', (pos) => {
   *   console.log(`Row: ${pos.row}/${pos.pattern}`);
   * });
   *
   * tracker.on('ended', () => {
   *   console.log('Song finished');
   * });
   * ```
   */
  on<K extends TrackerEventType>(
    event: K,
    handler: K extends keyof TrackerEvents ? TrackerEvents[K] : TrackerEventHandler
  ): this {
    if (!this.eventHandlers.has(event)) {
      this.eventHandlers.set(event, new Set());
    }
    this.eventHandlers.get(event)!.add(handler);
    return this;
  }

  /**
   * Remove an event handler.
   *
   * @param event - Event type
   * @param handler - Handler to remove
   * @returns this (for chaining)
   */
  off<K extends TrackerEventType>(
    event: K,
    handler: K extends keyof TrackerEvents ? TrackerEvents[K] : TrackerEventHandler
  ): this {
    const handlers = this.eventHandlers.get(event);
    if (handlers) {
      handlers.delete(handler);
    }
    return this;
  }

  /**
   * Load a module from a URL.
   *
   * @param url - URL to the module file
   * @returns Promise that resolves when loading starts
   *
   * @example
   * ```typescript
   * await tracker.load('/music/cool_song.mod');
   * await tracker.load('https://example.com/music.xm');
   * ```
   */
  async load(url: string): Promise<void> {
    if (!this.isBrowser || !this.player) {
      throw new Error('TrackerEngine: Cannot load - not in browser environment');
    }

    this.setState(PlaybackState.Loading);
    this._metadata = null;

    return new Promise((resolve, reject) => {
      const errorHandler = (err: TrackerError) => {
        this.off('error', errorHandler);
        this.off('metadata', metaHandler);
        this.setState(PlaybackState.Stopped);
        reject(new Error(`Failed to load: ${err.type}`));
      };

      const metaHandler = () => {
        this.off('error', errorHandler);
        this.off('metadata', metaHandler);
        this.setState(PlaybackState.Playing);
        resolve();
      };

      this.on('error', errorHandler);
      this.on('metadata', metaHandler);

      this.player.load(url);
    });
  }

  /**
   * Play a module from an ArrayBuffer.
   *
   * @param buffer - Module data as ArrayBuffer
   *
   * @example
   * ```typescript
   * // From fetch
   * const response = await fetch('/music/song.xm');
   * const buffer = await response.arrayBuffer();
   * tracker.play(buffer);
   *
   * // From File input
   * const file = input.files[0];
   * const buffer = await file.arrayBuffer();
   * tracker.play(buffer);
   * ```
   */
  play(buffer: ArrayBuffer): void {
    if (!this.isBrowser || !this.player) {
      console.warn('TrackerEngine: Cannot play - not in browser environment');
      return;
    }

    this.setState(PlaybackState.Loading);
    this._metadata = null;
    this.player.play(buffer);
  }

  /**
   * Stop playback and reset position.
   */
  stop(): void {
    if (!this.player) return;

    this.player.stop();
    this._position = { position: 0, order: 0, pattern: 0, row: 0 };
    this.setState(PlaybackState.Stopped);
  }

  /**
   * Pause playback.
   */
  pause(): void {
    if (!this.player || this._state !== PlaybackState.Playing) return;

    this.player.pause();
    this.setState(PlaybackState.Paused);
  }

  /**
   * Resume playback after pause.
   */
  resume(): void {
    if (!this.player || this._state !== PlaybackState.Paused) return;

    this.player.unpause();
    this.setState(PlaybackState.Playing);
  }

  /**
   * Toggle between playing and paused states.
   */
  togglePause(): void {
    if (!this.player) return;

    this.player.togglePause();

    if (this._state === PlaybackState.Playing) {
      this.setState(PlaybackState.Paused);
    } else if (this._state === PlaybackState.Paused) {
      this.setState(PlaybackState.Playing);
    }
  }

  /**
   * Seek to a position in seconds.
   *
   * @param seconds - Position in seconds
   *
   * @example
   * ```typescript
   * tracker.seek(30);  // Seek to 30 seconds
   * tracker.seek(tracker.duration / 2);  // Seek to middle
   * ```
   */
  seek(seconds: number): void {
    if (!this.player) return;
    this.player.setPos(Math.max(0, seconds));
  }

  /**
   * Seek to a specific order and row position.
   *
   * @param order - Order/position in song
   * @param row - Row within pattern (optional, default 0)
   *
   * @example
   * ```typescript
   * tracker.seekToPosition(5, 0);   // Jump to order 5, row 0
   * tracker.seekToPosition(10, 32); // Jump to order 10, row 32
   * ```
   */
  seekToPosition(order: number, row: number = 0): void {
    if (!this.player) return;
    this.player.setOrderRow(order, row);
  }

  /**
   * Set playback volume.
   *
   * @param volume - Volume level (0.0 - 1.0)
   *
   * @example
   * ```typescript
   * tracker.setVolume(0.5);  // 50% volume
   * tracker.setVolume(1.0);  // Full volume
   * ```
   */
  setVolume(volume: number): void {
    if (!this.player) return;
    const clamped = Math.max(0, Math.min(1, volume));
    this.config.volume = clamped;
    this.player.setVol(clamped);
  }

  /**
   * Get current volume.
   */
  getVolume(): number {
    return this.config.volume;
  }

  /**
   * Set tempo adjustment factor.
   *
   * @param factor - Tempo multiplier (1.0 = normal, 2.0 = double speed)
   *
   * @example
   * ```typescript
   * tracker.setTempo(1.5);  // 50% faster
   * tracker.setTempo(0.75); // 25% slower
   * ```
   */
  setTempo(factor: number): void {
    if (!this.player) return;
    this.player.setTempo(Math.max(0.1, factor));
  }

  /**
   * Set pitch adjustment.
   *
   * @param semitones - Pitch shift in semitones
   *
   * @example
   * ```typescript
   * tracker.setPitch(2);   // Up 2 semitones
   * tracker.setPitch(-3);  // Down 3 semitones
   * ```
   */
  setPitch(semitones: number): void {
    if (!this.player) return;
    this.player.setPitch(semitones);
  }

  /**
   * Set repeat/loop mode.
   *
   * @param count - -1 = infinite loop, 0 = play once, n = repeat n times
   *
   * @example
   * ```typescript
   * tracker.setRepeat(-1);  // Loop forever
   * tracker.setRepeat(0);   // Play once
   * tracker.setRepeat(3);   // Play 4 times total
   * ```
   */
  setRepeat(count: number): void {
    if (!this.player) return;
    this.config.repeatCount = count;
    this.player.setRepeatCount(count);
  }

  /**
   * Select a subsong (for modules with multiple songs).
   *
   * @param index - Subsong index (0-based)
   */
  selectSubsong(index: number): void {
    if (!this.player) return;
    this.player.selectSubsong(index);
  }

  /**
   * Get list of supported file extensions.
   */
  static getSupportedFormats(): string[] {
    return [
      'mod', 'xm', 's3m', 'it', 'mptm',
      'stm', 'nst', 'm15', 'stk', 'wow',
      'ult', '669', 'mtm', 'med', 'far',
      'mdl', 'ams', 'dsm', 'amf', 'okt',
      'dmf', 'ptm', 'psm', 'mt2', 'dbm',
      'digi', 'imf', 'j2b', 'gdm', 'umx',
      'plm', 'mo3', 'xpk', 'ppm', 'mmcmp',
    ];
  }

  /**
   * Check if a file extension is supported.
   *
   * @param extension - File extension (with or without dot)
   */
  static isFormatSupported(extension: string): boolean {
    const ext = extension.toLowerCase().replace(/^\./, '');
    return TrackerEngine.getSupportedFormats().includes(ext);
  }

  /**
   * Clean up resources.
   */
  dispose(): void {
    this.stop();
    this.eventHandlers.clear();
    this.player = null;
    this._initialized = false;
  }
}

export default TrackerEngine;
