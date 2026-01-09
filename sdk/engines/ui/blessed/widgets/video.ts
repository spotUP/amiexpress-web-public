/**
 * Video - Video playback widget (browser-compatible placeholder)
 *
 * Responsive features:
 * - Auto-updates display on resize
 */

import { Box } from './box';
import type { ElementOptions, VideoOptions } from '../core/types';
import type { ResponsiveState } from '../core/responsive-mixin';
import type { BreakpointName } from '../core/responsive-constants';

export class Video extends Box {
  private src: string = '';
  private autoPlay: boolean;
  private loop: boolean;
  private controls: boolean;
  private muted: boolean;
  private playing: boolean = false;
  private streaming: boolean = false;
  private currentTime: number = 0;
  private duration: number = 0;

  constructor(options: VideoOptions = {}) {
    const { src, file, autoPlay, loop, controls, muted, ...boxOptions } = options;

    super({
      ...boxOptions,
      width: options.width || 60,
      height: options.height || 20,
      border: options.border !== undefined ? options.border : { type: 'line' },
    });

    this.autoPlay = autoPlay || false;
    this.loop = loop || false;
    this.controls = controls !== false;
    this.muted = muted || false;

    if (src) {
      this.setSource(src);
    } else if (file) {
      this.setSource(file);
    }

    // Setup controls if enabled
    if (this.controls) {
      this.setupControls();
    }
  }

  /**
   * Setup keyboard controls
   */
  private setupControls(): void {
    this.enableKeys();

    this.key(['space'], () => {
      this.togglePlay();
    });

    this.key(['left'], () => {
      this.seek(-5);
    });

    this.key(['right'], () => {
      this.seek(5);
    });

    this.key(['m'], () => {
      this.toggleMute();
    });

    this.key(['f'], () => {
      this.emit('fullscreen');
    });
  }

  /**
   * Set video source
   */
  setSource(src: string): void {
    this.src = src;
    this.currentTime = 0;
    this.playing = false;
    this.streaming = false;

    this.updateDisplay();
    this.emit('load', src);

    if (this.autoPlay) {
      this.play();
    }
  }

  /**
   * Set raw video frame (ASCII)
   */
  setFrame(frame: string): void {
    this.streaming = true;
    this.setContent(frame);
    if (this.screen) {
      this.screen.render();
    }
  }

  /**
   * Update display
   */
  private updateDisplay(): void {
    if (this.streaming) return;

    const w = typeof this.width === 'number' ? this.width : 60;
    const h = typeof this.height === 'number' ? this.height : 20;

    const lines: string[] = [];

    // Video frame placeholder
    for (let i = 0; i < h - 3; i++) {
      lines.push(' '.repeat(w));
    }

    // Video info
    const info = `[${this.playing ? 'Playing' : 'Paused'}] ${this.formatTime(this.currentTime)} / ${this.formatTime(this.duration)}`;
    const padding = Math.floor((w - info.length) / 2);
    lines.push(' '.repeat(padding) + info);

    // Controls
    if (this.controls) {
      const controlsText = `[Space] Play/Pause  [←→] Seek  [M] Mute  [F] Fullscreen`;
      const controlsPadding = Math.floor((w - controlsText.length) / 2);
      lines.push(' '.repeat(controlsPadding) + controlsText);
    }

    this.setContent(lines.join('\n'));

    if (this.screen) {
      this.screen.render();
    }
  }

  /**
   * Format time in MM:SS
   */
  private formatTime(seconds: number): string {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  }

  /**
   * Play video
   */
  play(): void {
    this.playing = true;
    this.updateDisplay();
    this.emit('play');
  }

  /**
   * Pause video
   */
  pause(): void {
    this.playing = false;
    this.updateDisplay();
    this.emit('pause');
  }

  /**
   * Toggle play/pause
   */
  togglePlay(): void {
    if (this.playing) {
      this.pause();
    } else {
      this.play();
    }
  }

  /**
   * Stop video
   */
  stop(): void {
    this.playing = false;
    this.currentTime = 0;
    this.updateDisplay();
    this.emit('stop');
  }

  /**
   * Seek by offset
   */
  seek(offset: number): void {
    this.currentTime = Math.max(0, Math.min(this.duration, this.currentTime + offset));
    this.updateDisplay();
    this.emit('seek', this.currentTime);
  }

  /**
   * Seek to time
   */
  seekTo(time: number): void {
    this.currentTime = Math.max(0, Math.min(this.duration, time));
    this.updateDisplay();
    this.emit('seek', this.currentTime);
  }

  /**
   * Get current time
   */
  getCurrentTime(): number {
    return this.currentTime;
  }

  /**
   * Get duration
   */
  getDuration(): number {
    return this.duration;
  }

  /**
   * Set duration
   */
  setDuration(duration: number): void {
    this.duration = duration;
    this.updateDisplay();
  }

  /**
   * Check if playing
   */
  isPlaying(): boolean {
    return this.playing;
  }

  /**
   * Check if muted
   */
  isMuted(): boolean {
    return this.muted;
  }

  /**
   * Mute audio
   */
  mute(): void {
    this.muted = true;
    this.emit('mute');
  }

  /**
   * Unmute audio
   */
  unmute(): void {
    this.muted = false;
    this.emit('unmute');
  }

  /**
   * Toggle mute
   */
  toggleMute(): void {
    if (this.muted) {
      this.unmute();
    } else {
      this.mute();
    }
  }

  /**
   * Get video source
   */
  getSource(): string {
    return this.src;
  }

  /**
   * Set loop mode
   */
  setLoop(loop: boolean): void {
    this.loop = loop;
  }

  /**
   * Check if looping
   */
  isLooping(): boolean {
    return this.loop;
  }

  // ============================================================================
  // Responsive Lifecycle Hooks
  // ============================================================================

  protected _handleBreakpointChange(
    breakpoint: BreakpointName,
    previousBreakpoint: BreakpointName,
    state: ResponsiveState
  ): void {
    super._handleBreakpointChange(breakpoint, previousBreakpoint, state);
    // Update display with new dimensions
    this.updateDisplay();
    this.emit('breakpoint-change', breakpoint, previousBreakpoint);
  }
}
