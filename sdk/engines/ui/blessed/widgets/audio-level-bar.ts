/**
 * AudioLevelBar - Visual audio level indicator
 *
 * Features:
 * - Real-time audio level visualization
 * - Color gradient based on level (green -> yellow -> red)
 * - Configurable width and thresholds
 * - Percentage display
 * - Peak hold indicator (optional)
 */

import { Box } from './box';
import type { ElementOptions } from '../core/types';

export interface AudioLevelBarOptions extends ElementOptions {
  /** Bar width in characters (default: 40) */
  barWidth?: number;
  /** Show percentage label (default: true) */
  showPercentage?: boolean;
  /** Low threshold for yellow color (default: 0.3) */
  lowThreshold?: number;
  /** High threshold for red color (default: 0.7) */
  highThreshold?: number;
  /** Low color (default: "green") */
  lowColor?: string;
  /** Medium color (default: "yellow") */
  mediumColor?: string;
  /** High color (default: "red") */
  highColor?: string;
  /** Empty bar character (default: "-") */
  emptyChar?: string;
  /** Filled bar character (default: "=") */
  filledChar?: string;
  /** Show peak hold indicator (default: false) */
  showPeak?: boolean;
  /** Peak decay rate per update (default: 0.05) */
  peakDecay?: number;
  /** Label to show before the bar */
  label?: string;
}

export class AudioLevelBar extends Box {
  private _barWidth: number;
  private _showPercentage: boolean;
  private _lowThreshold: number;
  private _highThreshold: number;
  private _lowColor: string;
  private _mediumColor: string;
  private _highColor: string;
  private _emptyChar: string;
  private _filledChar: string;
  private _showPeak: boolean;
  private _peakDecay: number;
  private _currentLevel: number = 0;
  private _peakLevel: number = 0;
  private _label: string;

  constructor(options: AudioLevelBarOptions = {}) {
    super({
      ...options,
      height: options.height || 1,
      tags: true,
      style: {
        fg: 'white',
        bg: 'black',
        ...options.style,
      },
    });

    this._barWidth = options.barWidth ?? 40;
    this._showPercentage = options.showPercentage ?? true;
    this._lowThreshold = options.lowThreshold ?? 0.3;
    this._highThreshold = options.highThreshold ?? 0.7;
    this._lowColor = options.lowColor || 'green';
    this._mediumColor = options.mediumColor || 'yellow';
    this._highColor = options.highColor || 'red';
    this._emptyChar = options.emptyChar || '-';
    this._filledChar = options.filledChar || '=';
    this._showPeak = options.showPeak ?? false;
    this._peakDecay = options.peakDecay ?? 0.05;
    this._label = options.label || '';

    this._render();
  }

  /**
   * Set the audio level (0.0 - 1.0)
   */
  setLevel(level: number): void {
    this._currentLevel = Math.max(0, Math.min(1, level));

    // Update peak
    if (this._showPeak) {
      if (this._currentLevel > this._peakLevel) {
        this._peakLevel = this._currentLevel;
      } else {
        this._peakLevel = Math.max(this._currentLevel, this._peakLevel - this._peakDecay);
      }
    }

    this._render();
  }

  /**
   * Get the current level
   */
  getLevel(): number {
    return this._currentLevel;
  }

  /**
   * Get the peak level
   */
  getPeakLevel(): number {
    return this._peakLevel;
  }

  /**
   * Reset peak hold
   */
  resetPeak(): void {
    this._peakLevel = this._currentLevel;
    this._render();
  }

  /**
   * Render the bar as a string (for external use)
   */
  renderBar(level?: number): string {
    const lvl = level ?? this._currentLevel;
    const filled = Math.floor(lvl * this._barWidth);
    const empty = this._barWidth - filled;

    // Determine color based on level
    let color: string;
    if (lvl < this._lowThreshold) {
      color = this._lowColor;
    } else if (lvl < this._highThreshold) {
      color = this._mediumColor;
    } else {
      color = this._highColor;
    }

    let bar = `{${color}-fg}`;
    bar += this._filledChar.repeat(filled);
    bar += `{/${color}-fg}`;
    bar += this._emptyChar.repeat(empty);

    // Add peak indicator
    if (this._showPeak && this._peakLevel > lvl) {
      const peakPos = Math.floor(this._peakLevel * this._barWidth);
      if (peakPos < this._barWidth) {
        // Insert peak marker
        const beforePeak = bar.substring(0, peakPos);
        const afterPeak = bar.substring(peakPos + 1);
        bar = beforePeak + `{${this._highColor}-fg}|{/${this._highColor}-fg}` + afterPeak;
      }
    }

    // Add percentage
    if (this._showPercentage) {
      bar += ` ${Math.floor(lvl * 100)}%`;
    }

    return bar;
  }

  /**
   * Internal render
   */
  private _render(): void {
    let content = '';

    if (this._label) {
      content += this._label + ' ';
    }

    content += this.renderBar();

    this.setContent(content);
    this.screen?.render();
  }

  /**
   * Set bar width
   */
  setBarWidth(width: number): void {
    this._barWidth = width;
    this._render();
  }

  /**
   * Set thresholds
   */
  setThresholds(low: number, high: number): void {
    this._lowThreshold = low;
    this._highThreshold = high;
    this._render();
  }

  /**
   * Set colors
   */
  setColors(low: string, medium: string, high: string): void {
    this._lowColor = low;
    this._mediumColor = medium;
    this._highColor = high;
    this._render();
  }

  /**
   * Set label
   */
  setLabel(label: string): void {
    this._label = label;
    this._render();
  }
}

/**
 * Factory function
 */
export function audioLevelBar(options?: AudioLevelBarOptions): AudioLevelBar {
  return new AudioLevelBar(options);
}

/**
 * Standalone render function (doesn't require widget instance)
 * Useful for embedding in other content
 */
export function renderAudioLevel(
  level: number,
  options: {
    barWidth?: number;
    showPercentage?: boolean;
    lowThreshold?: number;
    highThreshold?: number;
    lowColor?: string;
    mediumColor?: string;
    highColor?: string;
    emptyChar?: string;
    filledChar?: string;
  } = {}
): string {
  const barWidth = options.barWidth ?? 40;
  const showPercentage = options.showPercentage ?? true;
  const lowThreshold = options.lowThreshold ?? 0.3;
  const highThreshold = options.highThreshold ?? 0.7;
  const lowColor = options.lowColor || 'green';
  const mediumColor = options.mediumColor || 'yellow';
  const highColor = options.highColor || 'red';
  const emptyChar = options.emptyChar || '-';
  const filledChar = options.filledChar || '=';

  const lvl = Math.max(0, Math.min(1, level));
  const filled = Math.floor(lvl * barWidth);
  const empty = barWidth - filled;

  let color: string;
  if (lvl < lowThreshold) {
    color = lowColor;
  } else if (lvl < highThreshold) {
    color = mediumColor;
  } else {
    color = highColor;
  }

  let bar = `{${color}-fg}`;
  bar += filledChar.repeat(filled);
  bar += `{/${color}-fg}`;
  bar += emptyChar.repeat(empty);

  if (showPercentage) {
    bar += ` ${Math.floor(lvl * 100)}%`;
  }

  return bar;
}
