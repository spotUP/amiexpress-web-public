/**
 * Type declarations for chiptune3 module
 * Chiptune player for tracker music formats (MOD, XM, S3M, IT, etc.)
 */

declare module 'chiptune3' {
  export interface ChiptuneJsConfig {
    repeatCount?: number;
    stereoSeparation?: number;
    interpolationFilter?: number;
    context?: AudioContext;
  }

  export interface ChiptuneJsPlayer {
    constructor(config?: ChiptuneJsConfig);

    // Playback control
    load(input: string | ArrayBuffer): Promise<void>;
    play(buffer?: ArrayBuffer): void;
    stop(): void;
    pause(): void;
    togglePause(): void;

    // Volume control
    setVol(volume: number): void;
    getVol(): number;

    // Position control
    seek(position: number): void;
    getCurrentTime(): number;
    getDuration(): number;

    // Metadata
    getMetadata(): {
      title: string;
      message: string;
      type: string;
      channels: number;
      patterns: number;
      samples: number;
      instruments: number;
    };

    // Event handlers
    onEnded?: () => void;
    onError?: (error: Error) => void;

    // Cleanup
    cleanup(): void;
  }

  export class ChiptuneJsPlayer {
    constructor(config?: ChiptuneJsConfig);
    load(input: string | ArrayBuffer): Promise<void>;
    play(buffer?: ArrayBuffer): void;
    stop(): void;
    pause(): void;
    togglePause(): void;
    setVol(volume: number): void;
    getVol(): number;
    seek(position: number): void;
    getCurrentTime(): number;
    getDuration(): number;
    getMetadata(): {
      title: string;
      message: string;
      type: string;
      channels: number;
      patterns: number;
      samples: number;
      instruments: number;
    };
    onEnded?: () => void;
    onError?: (error: Error) => void;
    cleanup(): void;
  }

  export default ChiptuneJsPlayer;
}
