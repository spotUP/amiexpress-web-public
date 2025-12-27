/**
 * Type declarations for chiptune3
 * @see https://github.com/DrSnuggles/chiptune
 */

declare module 'chiptune3' {
  export interface ChiptuneConfig {
    /** Repeat count: -1 = endless, 0 = play once */
    repeatCount?: number;
    /** Stereo separation percentage (0-200, default 100) */
    stereoSeparation?: number;
    /** Interpolation filter (0-3) */
    interpolationFilter?: number;
    /** Custom AudioContext */
    context?: AudioContext;
  }

  export interface ChiptuneMetadata {
    /** Module title */
    title?: string;
    /** Song name (alias for title) */
    song?: string;
    /** Module type */
    type?: string;
    /** Tracker used to create module */
    tracker?: string;
    /** Number of channels */
    channels?: number;
    /** Number of patterns */
    patterns?: number;
    /** Number of orders */
    orders?: number;
    /** Number of instruments */
    instruments?: number;
    /** Number of samples */
    samples?: number;
    /** Duration in seconds */
    dur?: number;
    /** Number of subsongs */
    subsongs?: number;
    /** Module message */
    message?: string;
    /** Instrument names */
    instrumentNames?: string[];
    /** Sample names */
    sampleNames?: string[];
  }

  export interface ChiptuneProgressData {
    /** Position in seconds */
    pos?: number;
    /** Current order */
    order?: number;
    /** Current pattern */
    pattern?: number;
    /** Current row */
    row?: number;
  }

  export interface ChiptuneError {
    type: string;
    message?: string;
  }

  export type ChiptuneEventHandler<T = void> = (data: T) => void;

  export class ChiptuneJsPlayer {
    /** Module metadata (available after loading) */
    meta?: ChiptuneMetadata;
    /** Module duration in seconds */
    duration?: number;
    /** Current playback time in seconds */
    currentTime?: number;
    /** Current order */
    order?: number;
    /** Current pattern */
    pattern?: number;
    /** Current row */
    row?: number;

    constructor(config?: ChiptuneConfig);

    /** Register handler for player initialization */
    onInitialized(handler: ChiptuneEventHandler): void;
    /** Register handler for song end */
    onEnded(handler: ChiptuneEventHandler): void;
    /** Register handler for errors */
    onError(handler: ChiptuneEventHandler<ChiptuneError>): void;
    /** Register handler for metadata */
    onMetadata(handler: ChiptuneEventHandler<ChiptuneMetadata>): void;
    /** Register handler for playback progress */
    onProgress(handler: ChiptuneEventHandler<ChiptuneProgressData>): void;
    /** Register handler for full audio data */
    onFullAudioData(handler: ChiptuneEventHandler<any>): void;

    /** Load module from URL */
    load(url: string): void;
    /** Play module from ArrayBuffer */
    play(buffer: ArrayBuffer): void;
    /** Stop playback */
    stop(): void;
    /** Pause playback */
    pause(): void;
    /** Resume playback */
    unpause(): void;
    /** Toggle pause state */
    togglePause(): void;

    /** Set repeat count (-1 = infinite, 0 = once) */
    setRepeatCount(count: number): void;
    /** Set pitch adjustment */
    setPitch(semitones: number): void;
    /** Set tempo multiplier */
    setTempo(factor: number): void;
    /** Seek to position in seconds */
    setPos(seconds: number): void;
    /** Seek to order and row */
    setOrderRow(order: number, row: number): void;
    /** Set volume (0-1) */
    setVol(volume: number): void;
    /** Select subsong */
    selectSubsong(index: number): void;

    /** Alias for setPos */
    seek(seconds: number): void;
    /** Get current time in seconds */
    getCurrentTime(): number;
    /** Decode entire module to audio buffer */
    decodeAll(buffer: ArrayBuffer): void;
  }
}
