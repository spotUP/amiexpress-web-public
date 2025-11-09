/**
 * Tracker Data Types
 * Core type definitions for the music tracker
 */

/**
 * Musical note value (e.g., "C-4", "D#5", "---", "...")
 */
export type NoteValue = string;

/**
 * Note data in pattern
 */
export interface Note {
  note: string;              // Note value: "C-4", "D#5", "---" (note off), "..." (empty)
  instrument: number;        // Instrument number (0 = none)
  volume: number;            // Volume (0-255)
  volumeColumn?: number;     // Volume column command
  effect?: string;           // Effect command (e.g., "01", "0C")
  effectParam?: number;      // Effect parameter
}

/**
 * Pattern - contains note data for all channels
 */
export interface Pattern {
  id: number;
  name: string;
  rows: number;              // Number of rows (usually 64)
  channels: number;          // Number of channels
  data: Map<string, Note>;   // Key format: "row:channel"
}

/**
 * Oscillator configuration
 */
export interface Oscillator {
  type: 'sine' | 'square' | 'sawtooth' | 'triangle' | 'pwm' | 'pulse' | 'noise';
  detune?: number;
  phase?: number;
  count?: number;
  spread?: number;
}

/**
 * Filter configuration
 */
export interface Filter {
  type: 'lowpass' | 'highpass' | 'bandpass' | 'notch' | 'allpass';
  frequency: number;
  cutoff?: number;           // Alias for frequency
  Q?: number;
  resonance?: number;        // Alias for Q
  rolloff?: -12 | -24 | -48 | -96;
}

/**
 * ADSR Envelope
 */
export interface Envelope {
  attack: number;
  decay: number;
  sustain: number;
  release: number;
}

/**
 * Default envelope for instruments without one specified
 */
export const DEFAULT_ENVELOPE: Envelope = {
  attack: 0.01,
  decay: 0.2,
  sustain: 0.5,
  release: 0.3
};

/**
 * Sample data with metadata
 */
export interface Sample {
  data: Float32Array;
  sampleRate: number;
  loopStart?: number;
  loopEnd?: number;
  loopEnabled?: boolean;
}

/**
 * Effect plugin types
 */
export enum EffectPluginType {
  REVERB = 'reverb',
  DELAY = 'delay',
  CHORUS = 'chorus',
  DISTORTION = 'distortion',
  BITCRUSHER = 'bitcrusher',
  PHASER = 'phaser',
  TREMOLO = 'tremolo',
  VIBRATO = 'vibrato',
  EQ = 'eq',
  COMPRESSOR = 'compressor',
  LIMITER = 'limiter'
}

/**
 * Effect command types (MOD/XM/IT style)
 */
export type EffectType =
  | 'arpeggio'         // 0xy
  | 'portamento_up'    // 1xx
  | 'portamento_down'  // 2xx
  | 'tone_portamento'  // 3xx
  | 'vibrato'          // 4xy
  | 'volume_slide'     // Axy
  | 'position_jump'    // Bxx
  | 'set_volume'       // Cxx
  | 'pattern_break'    // Dxx
  | 'set_tempo'        // Fxx
  | 'retrigger'        // Exy
  | 'tremolo'          // 7xy
  | 'panning'          // 8xx
  | 'sample_offset';   // 9xx

/**
 * Effect command
 */
export interface EffectCommand {
  type: EffectType;
  param: number;
}

/**
 * Effect plugin instance
 */
export interface EffectPlugin {
  type: EffectPluginType | string;
  params: Record<string, number | string | boolean>;
  enabled: boolean;
}

/**
 * Instrument definition
 */
export interface Instrument {
  id: number;
  name: string;
  type: 'synth' | 'sample' | 'fm';

  // Synth parameters
  oscillator?: Oscillator;
  filter?: Filter;
  envelope: Envelope;  // Required - use DEFAULT_ENVELOPE if not specified

  // Sample parameters
  sample?: Sample;           // Sample with metadata
  sampleData?: Float32Array; // Raw sample data (deprecated)
  sampleRate?: number;       // Sample rate (when not using Sample object)
  loopStart?: number;        // Loop start (when not using Sample object)
  loopEnd?: number;          // Loop end (when not using Sample object)
  loopEnabled?: boolean;     // Loop enabled (when not using Sample object)

  // Effects chain
  effects: EffectPlugin[];

  // Other
  volume?: number;
  panning?: number;
  transpose?: number;
  finetune?: number;
}

/**
 * Song / Module
 */
export interface Song {
  title: string;
  artist: string;
  comments: string;

  // Playback settings
  bpm: number;              // Beats per minute
  ticksPerRow: number;      // Ticks per row (speed)
  channels: number;         // Number of channels

  // Song data
  patterns: Pattern[];
  instruments: Instrument[];
  sequence: number[];       // Pattern order

  // Loop points
  loopStart: number;
  loopEnd: number;

  // Metadata
  created?: Date;
  modified?: Date;
  tracker?: string;
}

/**
 * Module export format
 */
export interface ModuleExport {
  format?: 'MOD' | 'XM' | 'IT' | 'S3M' | 'JSON';
  version?: string;
  metadata?: Record<string, any>;
  song: Song | any;
  buffer?: ArrayBuffer;
}

/**
 * Instrument preset for initialization
 */
export interface InstrumentPreset {
  name: string;
  type: 'synth' | 'sample' | 'fm';
  oscillator?: Oscillator;
  filter?: Filter;
  envelope?: Envelope;
  effects?: EffectPlugin[];
}

/**
 * Default instrument presets
 */
export const DEFAULT_INSTRUMENTS: InstrumentPreset[] = [
  {
    name: 'Square Lead',
    type: 'synth',
    oscillator: { type: 'square', detune: 0 },
    envelope: { attack: 0.01, decay: 0.1, sustain: 0.7, release: 0.3 },
    effects: []
  },
  {
    name: 'Saw Bass',
    type: 'synth',
    oscillator: { type: 'sawtooth', detune: 0 },
    filter: { type: 'lowpass', frequency: 800, Q: 5 },
    envelope: { attack: 0.01, decay: 0.2, sustain: 0.5, release: 0.1 },
    effects: []
  },
  {
    name: 'Sine Pad',
    type: 'synth',
    oscillator: { type: 'sine', detune: 0 },
    envelope: { attack: 0.5, decay: 0.2, sustain: 0.8, release: 1.0 },
    effects: [
      { type: 'reverb', params: { decay: 3, wet: 0.5 }, enabled: true }
    ]
  },
  {
    name: 'Triangle Arp',
    type: 'synth',
    oscillator: { type: 'triangle', detune: 0 },
    envelope: { attack: 0.01, decay: 0.05, sustain: 0.3, release: 0.2 },
    effects: []
  },
  {
    name: 'PWM Synth',
    type: 'synth',
    oscillator: { type: 'pwm', detune: 0 },
    envelope: { attack: 0.05, decay: 0.1, sustain: 0.6, release: 0.4 },
    effects: [
      { type: 'chorus', params: { frequency: 2, depth: 0.7, wet: 0.5 }, enabled: true }
    ]
  },
  {
    name: 'Noise Drum',
    type: 'synth',
    oscillator: { type: 'noise' },
    filter: { type: 'highpass', frequency: 2000, Q: 1 },
    envelope: { attack: 0.001, decay: 0.05, sustain: 0.0, release: 0.1 },
    effects: []
  },
  {
    name: 'FM Bell',
    type: 'fm',
    oscillator: { type: 'sine', detune: 0 },
    envelope: { attack: 0.01, decay: 1.0, sustain: 0.0, release: 2.0 },
    effects: [
      { type: 'reverb', params: { decay: 2, wet: 0.3 }, enabled: true }
    ]
  },
  {
    name: 'Distorted Lead',
    type: 'synth',
    oscillator: { type: 'sawtooth', detune: 0 },
    filter: { type: 'lowpass', frequency: 3000, Q: 3 },
    envelope: { attack: 0.01, decay: 0.2, sustain: 0.6, release: 0.3 },
    effects: [
      { type: 'distortion', params: { amount: 0.7 }, enabled: true }
    ]
  }
];
