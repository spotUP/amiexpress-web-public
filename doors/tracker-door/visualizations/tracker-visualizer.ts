/**
 * Tracker Visualizations - Music Visualizer for TrackerDoor
 *
 * Provides real-time VU meters, waveforms, and spectrum analysis
 * using braille-based terminal graphics for smooth animations.
 */

import { BrailleCanvas, BrailleVUMeter } from '@amiexpress/bbs-door-sdk';
import { AnsiColor } from '@amiexpress/bbs-door-sdk/client';

class FallbackVUMeter {
  private height: number;

  constructor(_width: number, height: number) {
    this.height = height;
  }

  update(level: number): string {
    const clamped = Math.max(0, Math.min(1, level));
    const filled = Math.floor(clamped * this.height);
    const lines: string[] = [];
    for (let i = 0; i < this.height; i++) {
      lines.push(i >= this.height - filled ? '####' : '    ');
    }
    return lines.join('\n');
  }

  resetPeak(): void {
    // no-op
  }
}

const MeterCtor = typeof BrailleVUMeter === 'function' ? BrailleVUMeter : FallbackVUMeter;
// Always use fallback waveform/spectrum/canvas; avoids constructor mismatches in browser bundles
const WaveformCtor = class {
  private width: number;
  private height: number;
  constructor(width: number, height: number) {
    this.width = width;
    this.height = height;
  }
  update(samples: number[]): string {
    const lines: string[] = [];
    const len = Math.min(this.width, samples.length);
    const max = samples.reduce((m, v) => Math.max(m, Math.abs(v || 0)), 1) || 1;
    for (let row = 0; row < this.height; row++) {
      let line = '';
      const threshold = 1 - row / this.height;
      for (let i = 0; i < len; i++) {
        const val = Math.abs(samples[i] || 0) / max;
        line += val >= threshold ? '#' : ' ';
      }
      lines.push(line);
    }
    return lines.join('\n');
  }
};

const SpectrumCtor = class {
  private width: number;
  private height: number;
  constructor(width: number, height: number) {
    this.width = width;
    this.height = height;
  }
  update(freqs: number[]): string {
    const lines: string[] = [];
    const len = Math.min(this.width, freqs.length);
    const max = freqs.reduce((m, v) => Math.max(m, v || 0), 1) || 1;
    for (let row = 0; row < this.height; row++) {
      let line = '';
      const threshold = 1 - row / this.height;
      for (let i = 0; i < len; i++) {
        const val = (freqs[i] || 0) / max;
        line += val >= threshold ? '#' : ' ';
      }
      lines.push(line);
    }
    return lines.join('\n');
  }
};

type CanvasLike = {
  clear: () => void;
  drawRect: (x: number, y: number, w: number, h: number, filled: boolean) => void;
  set: (x: number, y: number) => void;
  frame: () => string;
};

const CanvasCtor = class implements CanvasLike {
  private width: number;
  private height: number;
  private buffer: string[];
  constructor(width: number, height: number) {
    this.width = width;
    this.height = height;
    this.buffer = Array.from({ length: height }, () => ' '.repeat(width));
  }
  clear(): void {
    this.buffer = Array.from({ length: this.height }, () => ' '.repeat(this.width));
  }
  drawRect(x: number, y: number, w: number, h: number, filled: boolean): void {
    const x0 = Math.max(0, x);
    const y0 = Math.max(0, y);
    const x1 = Math.min(this.width - 1, x + w - 1);
    const y1 = Math.min(this.height - 1, y + h - 1);
    for (let row = y0; row <= y1; row++) {
      const line = this.buffer[row].split('');
      for (let col = x0; col <= x1; col++) {
        if (filled || row === y0 || row === y1 || col === x0 || col === x1) {
          line[col] = '#';
        }
      }
      this.buffer[row] = line.join('');
    }
  }
  set(x: number, y: number): void {
    if (x < 0 || x >= this.width || y < 0 || y >= this.height) return;
    const line = this.buffer[y].split('');
    line[x] = '#';
    this.buffer[y] = line.join('');
  }
  frame(): string {
    return this.buffer.join('\n');
  }
};

/**
 * Channel VU Meter Display
 * Shows volume levels for each tracker channel with peak indicators
 */
export class ChannelVUMeters {
  private meters: Array<BrailleVUMeter | FallbackVUMeter> = [];
  private channelLevels: number[] = [];

  constructor(private channelCount: number) {
    // Create VU meter for each channel
    for (let i = 0; i < channelCount; i++) {
      this.meters.push(new MeterCtor(12, 32)); // Compact vertical meters
      this.channelLevels.push(0);
    }
  }

  /**
   * Update channel level
   */
  setChannelLevel(channel: number, level: number): void {
    if (channel >= 0 && channel < this.channelCount) {
      this.channelLevels[channel] = Math.max(0, Math.min(1, level));
    }
  }

  /**
   * Render all VU meters side by side
   */
  render(): string {
    const meterOutputs = this.meters.map((meter, idx) => {
      return meter.update(this.channelLevels[idx]);
    });

    // Combine meters horizontally
    const lines: string[] = [];
    const meterLines = meterOutputs.map(output => output.split('\n'));
    const maxLines = Math.max(...meterLines.map(m => m.length));

    for (let lineIdx = 0; lineIdx < maxLines; lineIdx++) {
      let line = '';
      meterLines.forEach((meter, meterIdx) => {
        const meterLine = meter[lineIdx] || ' '.repeat(6);
        line += meterLine + ' ';
      });
      lines.push(line);
    }

    return lines.join('\n');
  }

  /**
   * Render (monochrome)
   */
  renderColored(): string {
    return this.render();
  }

  /**
   * Reset all peak holds
   */
  resetPeaks(): void {
    this.meters.forEach(meter => meter.resetPeak());
  }
}

/**
 * Pattern Waveform Visualization
 * Shows the waveform of the currently playing pattern
 */
export class PatternWaveformViz {
  private waveform: InstanceType<typeof WaveformCtor>;
  private samples: number[] = [];

  constructor(width: number = 160, height: number = 32) {
    this.waveform = new WaveformCtor(width, height);
  }

  /**
   * Update with new audio samples
   */
  updateSamples(samples: number[]): void {
    this.samples = samples;
  }

  /**
   * Render waveform
   */
  render(): string {
    return this.waveform.update(this.samples);
  }

  /**
   * Render (monochrome)
   */
  renderColored(color?: AnsiColor): string {
    return this.render();
  }
}

/**
 * Spectrum Analyzer Visualization
 * Shows frequency spectrum of the audio
 */
export class SpectrumAnalyzerViz {
  private spectrum: InstanceType<typeof SpectrumCtor>;
  private frequencies: number[] = [];

  constructor(width: number = 160, height: number = 24) {
    this.spectrum = new SpectrumCtor(width, height);
  }

  /**
   * Update with frequency data
   */
  updateFrequencies(frequencies: number[]): void {
    this.frequencies = frequencies;
  }

  /**
   * Render spectrum
   */
  render(): string {
    return this.spectrum.update(this.frequencies);
  }

  /**
   * Render (monochrome)
   */
  renderColored(): string {
    return this.render();
  }
}

/**
 * Compact Pattern Progress Bar
 * Shows playback progress using braille graphics
 */
export class PatternProgressBar {
  private canvas: CanvasLike;

  constructor(private width: number = 160, private height: number = 8) {
    try {
      const ctor = (BrailleCanvas && typeof (BrailleCanvas as any) === 'function') ? (BrailleCanvas as any) : CanvasCtor;
      this.canvas = new ctor(width, height);
    } catch {
      this.canvas = new CanvasCtor(width, height);
    }
  }

  /**
   * Render progress bar
   *
   * @param current - Current row
   * @param total - Total rows in pattern
   */
  render(current: number, total: number): string {
    this.canvas.clear();

    const progress = current / total;
    const fillWidth = Math.floor(this.width * progress);

    // Draw background
    this.canvas.drawRect(0, 0, this.width, this.height, false);

    // Draw filled portion
    if (fillWidth > 0) {
      this.canvas.drawRect(1, 1, fillWidth - 1, this.height - 2, true);
    }

    // Draw position marker
    const markerX = Math.floor(this.width * progress);
    for (let y = 0; y < this.height; y++) {
      this.canvas.set(markerX, y);
    }

    return this.canvas.frame();
  }

  /**
   * Render (monochrome)
   */
  renderColored(current: number, total: number, color?: AnsiColor): string {
    return this.render(current, total);
  }
}

/**
 * Full Tracker Visualizer
 * Combines all visualizations into a comprehensive display
 */
export class TrackerVisualizer {
  private vuMeters: ChannelVUMeters;
  private waveform: PatternWaveformViz;
  private spectrum: SpectrumAnalyzerViz;
  private progressBar: PatternProgressBar;

  constructor(channelCount: number = 8) {
    this.vuMeters = new ChannelVUMeters(channelCount);
    this.waveform = new PatternWaveformViz(120, 20);
    this.spectrum = new SpectrumAnalyzerViz(120, 16);
    this.progressBar = new PatternProgressBar(120, 8);
  }

  /**
   * Update channel level
   */
  setChannelLevel(channel: number, level: number): void {
    this.vuMeters.setChannelLevel(channel, level);
  }

  /**
   * Update waveform samples
   */
  updateWaveform(samples: number[]): void {
    this.waveform.updateSamples(samples);
  }

  /**
   * Update spectrum frequencies
   */
  updateSpectrum(frequencies: number[]): void {
    this.spectrum.updateFrequencies(frequencies);
  }

  /**
   * Render complete visualization layout
   */
  renderLayout(mode: 'vu' | 'waveform' | 'spectrum' | 'progress', currentRow: number = 0, totalRows: number = 64): string {
    const lines: string[] = [];

    lines.push('+---------------------- VISUALIZER ---------------------+');

    switch (mode) {
      case 'vu':
        lines.push(this.vuMeters.renderColored());
        break;

      case 'waveform':
        lines.push(this.waveform.renderColored());
        break;

      case 'spectrum':
        lines.push(this.spectrum.renderColored());
        break;

      case 'progress':
        lines.push(this.progressBar.renderColored(currentRow, totalRows));
        lines.push('');
        lines.push(`Row ${currentRow}/${totalRows}`);
        break;
    }

    lines.push('+------------------------------------------------------+');

    return lines.join('\n');
  }

  /**
   * Render compact mode (for pattern editor sidebar)
   */
  renderCompact(currentRow: number, totalRows: number): string {
    const lines: string[] = [];

    // Channel VU meters (horizontal)
    const vuLines = this.vuMeters.renderColored().split('\n');
    vuLines.slice(0, 6).forEach(line => lines.push(line));

    lines.push('');

    // Progress bar
    const progressLines = this.progressBar.renderColored(currentRow, totalRows).split('\n');
    progressLines.forEach(line => lines.push(line));

    return lines.join('\n');
  }

  /**
   * Reset all visualizations
   */
  reset(): void {
    this.vuMeters.resetPeaks();
  }
}

export default TrackerVisualizer;
