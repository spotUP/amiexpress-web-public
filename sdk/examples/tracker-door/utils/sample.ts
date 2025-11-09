/**
 * Sample Management Utility
 * Handles sample loading, editing, and manipulation
 */

import { Instrument } from '../data/types';
import * as fs from 'fs';
import * as path from 'path';

export class SampleManager {
  private sampleDir: string;

  constructor(dataDir: string) {
    this.sampleDir = path.join(dataDir, 'samples');
    this.ensureSampleDir();
  }

  /**
   * Ensure sample directory exists
   */
  private ensureSampleDir(): void {
    if (!fs.existsSync(this.sampleDir)) {
      fs.mkdirSync(this.sampleDir, { recursive: true });
    }
  }

  /**
   * Load sample from file (simulated for BBS environment)
   * In a real implementation, this would decode WAV/MP3 files
   */
  loadSample(filename: string): Float32Array {
    const filepath = path.join(this.sampleDir, filename);

    if (!fs.existsSync(filepath)) {
      return this.generateTestSample();
    }

    try {
      const buffer = fs.readFileSync(filepath);
      return this.decodeWAV(buffer);
    } catch (error) {
      console.error('Failed to load sample:', error);
      return this.generateTestSample();
    }
  }

  /**
   * Generate test sample (sine wave for testing)
   */
  private generateTestSample(duration: number = 1.0, frequency: number = 440): Float32Array {
    const sampleRate = 44100;
    const length = Math.floor(sampleRate * duration);
    const data = new Float32Array(length);

    for (let i = 0; i < length; i++) {
      const t = i / sampleRate;
      data[i] = Math.sin(2 * Math.PI * frequency * t);
    }

    return data;
  }

  /**
   * Decode WAV file buffer (simplified)
   * Real implementation would use proper WAV decoder
   */
  private decodeWAV(buffer: Buffer): Float32Array {
    const dataOffset = 44;
    const bytesPerSample = 2;
    const numSamples = (buffer.length - dataOffset) / bytesPerSample;
    const samples = new Float32Array(numSamples);

    for (let i = 0; i < numSamples; i++) {
      const offset = dataOffset + i * bytesPerSample;
      const sample = buffer.readInt16LE(offset);
      samples[i] = sample / 32768.0;
    }

    return samples;
  }

  /**
   * Trim sample
   */
  trimSample(data: Float32Array, startSample: number, endSample: number): Float32Array {
    const start = Math.max(0, Math.min(startSample, data.length));
    const end = Math.max(start, Math.min(endSample, data.length));
    const length = end - start;

    const trimmed = new Float32Array(length);
    for (let i = 0; i < length; i++) {
      trimmed[i] = data[start + i];
    }

    return trimmed;
  }

  /**
   * Normalize sample (adjust volume to max)
   */
  normalizeSample(data: Float32Array): Float32Array {
    let max = 0;
    for (let i = 0; i < data.length; i++) {
      max = Math.max(max, Math.abs(data[i]));
    }

    if (max === 0) return data;

    const normalized = new Float32Array(data.length);
    for (let i = 0; i < data.length; i++) {
      normalized[i] = data[i] / max;
    }

    return normalized;
  }

  /**
   * Fade in sample
   */
  fadeIn(data: Float32Array, fadeDuration: number = 0.01): Float32Array {
    const sampleRate = 44100;
    const fadeSamples = Math.floor(sampleRate * fadeDuration);
    const faded = new Float32Array(data.length);

    for (let i = 0; i < data.length; i++) {
      if (i < fadeSamples) {
        const factor = i / fadeSamples;
        faded[i] = data[i] * factor;
      } else {
        faded[i] = data[i];
      }
    }

    return faded;
  }

  /**
   * Fade out sample
   */
  fadeOut(data: Float32Array, fadeDuration: number = 0.01): Float32Array {
    const sampleRate = 44100;
    const fadeSamples = Math.floor(sampleRate * fadeDuration);
    const faded = new Float32Array(data.length);
    const fadeStart = data.length - fadeSamples;

    for (let i = 0; i < data.length; i++) {
      if (i > fadeStart) {
        const factor = (data.length - i) / fadeSamples;
        faded[i] = data[i] * factor;
      } else {
        faded[i] = data[i];
      }
    }

    return faded;
  }

  /**
   * Detect loop points automatically
   */
  detectLoopPoints(data: Float32Array): { start: number; end: number } {
    const threshold = 0.01;
    let start = 0;
    let end = data.length - 1;

    for (let i = 0; i < data.length; i++) {
      if (Math.abs(data[i]) > threshold) {
        start = i;
        break;
      }
    }

    for (let i = data.length - 1; i >= 0; i--) {
      if (Math.abs(data[i]) > threshold) {
        end = i;
        break;
      }
    }

    return { start, end };
  }

  /**
   * List available samples
   */
  listSamples(): Array<{ name: string; size: number }> {
    if (!fs.existsSync(this.sampleDir)) {
      return [];
    }

    const files = fs.readdirSync(this.sampleDir);
    const samples: Array<{ name: string; size: number }> = [];

    for (const file of files) {
      if (file.endsWith('.wav') || file.endsWith('.mp3')) {
        const filepath = path.join(this.sampleDir, file);
        const stats = fs.statSync(filepath);
        samples.push({
          name: file,
          size: stats.size
        });
      }
    }

    return samples.sort((a, b) => a.name.localeCompare(b.name));
  }

  /**
   * Create instrument from sample
   */
  createInstrumentFromSample(
    id: number,
    name: string,
    sampleData: Float32Array,
    loopStart?: number,
    loopEnd?: number
  ): Instrument {
    return {
      id,
      name,
      type: 'sample',
      envelope: {
        attack: 0.001,
        decay: 0.1,
        sustain: 0.8,
        release: 0.3
      },
      effects: [],
      sample: {
        data: sampleData,
        sampleRate: 44100,
        loopStart,
        loopEnd,
        loopEnabled: loopStart !== undefined && loopEnd !== undefined
      }
    };
  }
}
