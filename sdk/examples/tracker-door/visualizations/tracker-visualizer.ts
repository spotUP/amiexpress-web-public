/**
 * Tracker Visualizations - Music Visualizer for TrackerDoor
 *
 * Provides real-time VU meters, waveforms, and spectrum analysis
 * using braille-based terminal graphics for smooth animations.
 */

import { BrailleCanvas, BrailleVUMeter, BrailleWaveform, BrailleSpectrum } from '@amiexpress/bbs-door-sdk';
import { AnsiColor } from '@amiexpress/bbs-door-sdk/client';

/**
 * Channel VU Meter Display
 * Shows volume levels for each tracker channel with peak indicators
 */
export class ChannelVUMeters {
  private meters: BrailleVUMeter[] = [];
  private channelLevels: number[] = [];

  constructor(private channelCount: number) {
    // Create VU meter for each channel
    for (let i = 0; i < channelCount; i++) {
      this.meters.push(new BrailleVUMeter(12, 32)); // Compact vertical meters
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
   * Render with ANSI color gradient (green -> yellow -> red)
   */
  renderColored(): string {
    const lines = this.render().split('\n');
    const totalLines = lines.length;

    return lines.map((line, idx) => {
      const position = 1 - (idx / totalLines);
      let color: AnsiColor;

      if (position > 0.8) {
        color = AnsiColor.RED;
      } else if (position > 0.5) {
        color = AnsiColor.YELLOW;
      } else {
        color = AnsiColor.GREEN;
      }

      return `\x1b[0;${30 + color}m${line}\x1b[0m`;
    }).join('\n');
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
  private waveform: BrailleWaveform;
  private samples: number[] = [];

  constructor(width: number = 160, height: number = 32) {
    this.waveform = new BrailleWaveform(width, height);
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
   * Render with ANSI color
   */
  renderColored(color: AnsiColor = AnsiColor.CYAN): string {
    const output = this.render();
    return `\x1b[0;${30 + color}m${output}\x1b[0m`;
  }
}

/**
 * Spectrum Analyzer Visualization
 * Shows frequency spectrum of the audio
 */
export class SpectrumAnalyzerViz {
  private spectrum: BrailleSpectrum;
  private frequencies: number[] = [];

  constructor(width: number = 160, height: number = 24) {
    this.spectrum = new BrailleSpectrum(width, height);
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
   * Render with color gradient
   */
  renderColored(): string {
    const lines = this.render().split('\n');
    const totalLines = lines.length;

    return lines.map((line, idx) => {
      const position = 1 - (idx / totalLines);
      let color: AnsiColor;

      if (position > 0.7) {
        color = AnsiColor.MAGENTA;
      } else if (position > 0.4) {
        color = AnsiColor.CYAN;
      } else {
        color = AnsiColor.BLUE;
      }

      return `\x1b[0;${30 + color}m${line}\x1b[0m`;
    }).join('\n');
  }
}

/**
 * Compact Pattern Progress Bar
 * Shows playback progress using braille graphics
 */
export class PatternProgressBar {
  private canvas: BrailleCanvas;

  constructor(private width: number = 160, private height: number = 8) {
    this.canvas = new BrailleCanvas(width, height);
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
   * Render with color
   */
  renderColored(current: number, total: number, color: AnsiColor = AnsiColor.YELLOW): string {
    const output = this.render(current, total);
    return `\x1b[0;${30 + color}m${output}\x1b[0m`;
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

    lines.push('\x1b[0;36m+---------------------- VISUALIZER ---------------------+\x1b[0m');

    switch (mode) {
      case 'vu':
        lines.push(this.vuMeters.renderColored());
        break;

      case 'waveform':
        lines.push(this.waveform.renderColored(AnsiColor.CYAN));
        break;

      case 'spectrum':
        lines.push(this.spectrum.renderColored());
        break;

      case 'progress':
        lines.push(this.progressBar.renderColored(currentRow, totalRows, AnsiColor.YELLOW));
        lines.push('');
        lines.push(`\x1b[0;33mRow ${currentRow}/${totalRows}\x1b[0m`);
        break;
    }

    lines.push('\x1b[0;36m+------------------------------------------------------+\x1b[0m');

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
