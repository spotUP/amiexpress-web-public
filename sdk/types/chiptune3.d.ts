/**
 * Type declarations for chiptune3
 * Tracker music player for MOD, XM, S3M, IT formats
 */

declare module 'chiptune3' {
  export interface ChiptuneJsConfig {
    repeatCount?: number;
    stereoSeparation?: number;
    interpolationFilter?: number;
    context?: AudioContext;
  }

  export interface ChiptuneJsPlayer {
    setVol(volume: number): void;
    play(buffer: ArrayBuffer): void;
    stop(): void;
    pause(): void;
    unpause(): void;
    togglePause(): void;
    seek(position: number): void;
    getPosition(): number;
    getDuration(): number;
    getCurrentRow(): number;
    getCurrentPattern(): number;
    getCurrentOrder(): number;
    getMetadata(): {
      title: string;
      message: string;
      type: string;
      channels: number;
      patterns: number;
      orders: number;
      samples: number;
      instruments: number;
    };
    onInitialized(callback: () => void): void;
    onPlay(callback: () => void): void;
    onStop(callback: () => void): void;
    onEnded(callback: () => void): void;
    onError(callback: (error: Error) => void): void;
    onProgress(callback: (position: number, duration: number) => void): void;
  }

  export class ChiptuneJsPlayer implements ChiptuneJsPlayer {
    constructor(config?: ChiptuneJsConfig);
  }
}
