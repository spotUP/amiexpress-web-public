/**
 * Instrument to Sample Renderer
 * Converts synth instruments to sample data for export to sample-only formats
 */

import { Instrument } from '../data/types';
import * as Tone from 'tone';

export interface RenderedSample {
  data: Float32Array;
  sampleRate: number;
  loopStart?: number;
  loopEnd?: number;
  loopEnabled: boolean;
  baseNote: number; // MIDI note number this sample represents
}

export class InstrumentRenderer {
  private static readonly SAMPLE_RATE = 44100;
  private static readonly NOTE_DURATION = 2.0; // seconds
  private static readonly LOOP_DURATION = 0.5; // seconds for loop section

  /**
   * Render a synth instrument to sample data at a specific note
   */
  static async renderInstrument(
    instrument: Instrument,
    baseNote: number = 60 // Middle C
  ): Promise<RenderedSample> {
    if (instrument.type === 'sample' && instrument.sample) {
      // Already a sample, return as-is
      return {
        data: instrument.sample.data,
        sampleRate: instrument.sample.sampleRate || this.SAMPLE_RATE,
        loopStart: instrument.sample.loopStart,
        loopEnd: instrument.sample.loopEnd,
        loopEnabled: instrument.sample.loopEnabled || false,
        baseNote
      };
    }

    // Must be a synth instrument - render it
    await Tone.start();
    await Tone.context.resume();

    const numSamples = Math.floor(this.SAMPLE_RATE * this.NOTE_DURATION);
    const sampleData = new Float32Array(numSamples);

    // Create appropriate synth based on oscillator type
    const osc = instrument.oscillator?.type || 'sawtooth';
    const detune = instrument.oscillator?.detune || 0;
    const env = instrument.envelope;

    // Create offline context for rendering
    const offline = new Tone.OfflineContext(1, this.NOTE_DURATION, this.SAMPLE_RATE);
    Tone.setContext(offline);

    // Create synth with instrument parameters
    const synth = new Tone.Synth({
      oscillator: {
        type: osc as any
      },
      envelope: {
        attack: env.attack,
        decay: env.decay,
        sustain: env.sustain,
        release: env.release
      }
    }).toDestination();

    // Apply detune
    if (detune) {
      synth.detune.value = detune;
    }

    // Calculate frequency for the base note
    const frequency = this.midiNoteToFrequency(baseNote);

    // Trigger the note
    synth.triggerAttackRelease(frequency, this.NOTE_DURATION - env.release, 0);

    // Render
    const buffer = await offline.render();
    const channelData = buffer.getChannelData(0);

    // Copy rendered data
    for (let i = 0; i < Math.min(numSamples, channelData.length); i++) {
      sampleData[i] = channelData[i];
    }

    // Reset Tone.js context
    Tone.setContext(Tone.context);

    // Calculate loop points (if sustain is enabled)
    let loopStart: number | undefined;
    let loopEnd: number | undefined;
    let loopEnabled = false;

    if (env.sustain > 0.1) {
      // Loop the sustain portion
      const attackSamples = Math.floor(env.attack * this.SAMPLE_RATE);
      const decaySamples = Math.floor(env.decay * this.SAMPLE_RATE);
      loopStart = attackSamples + decaySamples;
      loopEnd = loopStart + Math.floor(this.LOOP_DURATION * this.SAMPLE_RATE);
      loopEnabled = true;
    }

    return {
      data: sampleData,
      sampleRate: this.SAMPLE_RATE,
      loopStart,
      loopEnd,
      loopEnabled,
      baseNote
    };
  }

  /**
   * Render an instrument across multiple octaves for better playback quality
   */
  static async renderMultisampled(
    instrument: Instrument,
    notes: number[] = [36, 48, 60, 72, 84] // C2, C3, C4, C5, C6
  ): Promise<Map<number, RenderedSample>> {
    const samples = new Map<number, RenderedSample>();

    for (const note of notes) {
      const sample = await this.renderInstrument(instrument, note);
      samples.set(note, sample);
    }

    return samples;
  }

  /**
   * Convert MIDI note number to frequency in Hz
   */
  private static midiNoteToFrequency(midiNote: number): number {
    return 440 * Math.pow(2, (midiNote - 69) / 12);
  }

  /**
   * Normalize sample data to prevent clipping
   */
  static normalizeSample(data: Float32Array): Float32Array {
    let peak = 0;
    for (let i = 0; i < data.length; i++) {
      peak = Math.max(peak, Math.abs(data[i]));
    }

    if (peak === 0) return data;

    const normalized = new Float32Array(data.length);
    const scale = 0.95 / peak; // Leave 5% headroom

    for (let i = 0; i < data.length; i++) {
      normalized[i] = data[i] * scale;
    }

    return normalized;
  }

  /**
   * Resample audio data to a different sample rate
   */
  static resample(
    data: Float32Array,
    fromRate: number,
    toRate: number
  ): Float32Array {
    if (fromRate === toRate) return data;

    const ratio = toRate / fromRate;
    const newLength = Math.floor(data.length * ratio);
    const resampled = new Float32Array(newLength);

    for (let i = 0; i < newLength; i++) {
      const srcIndex = i / ratio;
      const srcIndexFloor = Math.floor(srcIndex);
      const srcIndexCeil = Math.min(srcIndexFloor + 1, data.length - 1);
      const frac = srcIndex - srcIndexFloor;

      // Linear interpolation
      resampled[i] = data[srcIndexFloor] * (1 - frac) + data[srcIndexCeil] * frac;
    }

    return resampled;
  }

  /**
   * Convert floating point sample to 8-bit signed
   */
  static floatToInt8(value: number): number {
    return Math.max(-128, Math.min(127, Math.round(value * 127)));
  }

  /**
   * Convert floating point sample to 16-bit signed
   */
  static floatToInt16(value: number): number {
    return Math.max(-32768, Math.min(32767, Math.round(value * 32767)));
  }

  /**
   * Trim silence from start and end of sample
   */
  static trimSilence(
    data: Float32Array,
    threshold: number = 0.01
  ): { data: Float32Array; trimStart: number; trimEnd: number } {
    let start = 0;
    let end = data.length - 1;

    // Find first non-silent sample
    while (start < data.length && Math.abs(data[start]) < threshold) {
      start++;
    }

    // Find last non-silent sample
    while (end > start && Math.abs(data[end]) < threshold) {
      end--;
    }

    const trimmed = data.slice(start, end + 1);
    return {
      data: new Float32Array(trimmed),
      trimStart: start,
      trimEnd: data.length - end - 1
    };
  }
}
