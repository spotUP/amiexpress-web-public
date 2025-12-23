/**
 * Video - Video playback widget (browser-compatible placeholder)
 */
import { Box } from './box';
import type { ElementOptions } from '../core/types';
export interface VideoOptions extends ElementOptions {
    src?: string;
    file?: string;
    autoPlay?: boolean;
    loop?: boolean;
    controls?: boolean;
    muted?: boolean;
}
export declare class Video extends Box {
    private src;
    private autoPlay;
    private loop;
    private controls;
    private muted;
    private playing;
    private currentTime;
    private duration;
    constructor(options?: VideoOptions);
    /**
     * Setup keyboard controls
     */
    private setupControls;
    /**
     * Set video source
     */
    setSource(src: string): void;
    /**
     * Update display
     */
    private updateDisplay;
    /**
     * Format time in MM:SS
     */
    private formatTime;
    /**
     * Play video
     */
    play(): void;
    /**
     * Pause video
     */
    pause(): void;
    /**
     * Toggle play/pause
     */
    togglePlay(): void;
    /**
     * Stop video
     */
    stop(): void;
    /**
     * Seek by offset
     */
    seek(offset: number): void;
    /**
     * Seek to time
     */
    seekTo(time: number): void;
    /**
     * Get current time
     */
    getCurrentTime(): number;
    /**
     * Get duration
     */
    getDuration(): number;
    /**
     * Set duration
     */
    setDuration(duration: number): void;
    /**
     * Check if playing
     */
    isPlaying(): boolean;
    /**
     * Check if muted
     */
    isMuted(): boolean;
    /**
     * Mute audio
     */
    mute(): void;
    /**
     * Unmute audio
     */
    unmute(): void;
    /**
     * Toggle mute
     */
    toggleMute(): void;
    /**
     * Get video source
     */
    getSource(): string;
    /**
     * Set loop mode
     */
    setLoop(loop: boolean): void;
    /**
     * Check if looping
     */
    isLooping(): boolean;
}
