/**
 * Advanced Instrument Parameters
 * Professional synth features with filters, LFOs, and modulation
 */

import * as Tone from 'tone';
import { Instrument } from '../data/types';

export type FilterType = 'lowpass' | 'highpass' | 'bandpass' | 'notch' | 'allpass' | 'peaking' | 'lowshelf' | 'highshelf';
export type LFOWaveform = 'sine' | 'square' | 'sawtooth' | 'triangle' | 'random';
export type ModulationTarget = 'pitch' | 'filter' | 'amplitude' | 'pan';

export interface FilterParams {
  type: FilterType;
  frequency: number; // Hz
  Q: number; // Resonance
  gain?: number; // For peaking/shelf filters
  envelope: {
    amount: number; // -1 to 1
    attack: number;
    decay: number;
    sustain: number;
    release: number;
  };
  keyTracking: number; // 0 to 1
}

export interface LFOParams {
  waveform: LFOWaveform;
  frequency: number; // Hz
  depth: number; // 0 to 1
  target: ModulationTarget;
  phase: number; // 0 to 1
  sync: boolean; // Sync to note
}

export interface ModulationMatrix {
  sources: Array<{
    type: 'lfo1' | 'lfo2' | 'envelope' | 'velocity' | 'modwheel' | 'aftertouch';
    amount: number; // -1 to 1
    target: ModulationTarget;
  }>;
}

export interface AdvancedOscillator {
  type: 'sine' | 'square' | 'sawtooth' | 'triangle' | 'pulse' | 'pwm' | 'noise';
  detune: number; // Cents
  octave: number; // -2 to +2
  semitone: number; // -12 to +12
  cents: number; // -100 to +100
  phase: number; // 0 to 1
  width?: number; // For pulse wave
  count?: number; // Number of oscillators for unison
  spread?: number; // Detune spread for unison
}

export interface AdvancedInstrumentParams {
  oscillators: AdvancedOscillator[];
  oscillatorMix: number[]; // Mix level for each oscillator
  filter: FilterParams;
  filter2?: FilterParams; // Second filter for serial processing
  lfo1: LFOParams;
  lfo2?: LFOParams;
  modulation: ModulationMatrix;
  effects: {
    distortion?: { amount: number; type: 'soft' | 'hard' | 'fuzz' };
    chorus?: { rate: number; depth: number; feedback: number };
    bitcrusher?: { bits: number; sampleRate: number };
  };
}

/**
 * Advanced Synth Voice
 */
export class AdvancedSynthVoice {
  private oscillators: Tone.Oscillator[] = [];
  private filter: Tone.Filter;
  private filter2: Tone.Filter | null = null;
  private filterEnvelope: Tone.FrequencyEnvelope;
  private ampEnvelope: Tone.AmplitudeEnvelope;
  private lfo1: Tone.LFO;
  private lfo2: Tone.LFO | null = null;
  private distortion: Tone.Distortion | null = null;
  private chorus: Tone.Chorus | null = null;
  private bitcrusher: Tone.BitCrusher | null = null;
  private gain: Tone.Gain;
  private panner: Tone.Panner;

  constructor(params: AdvancedInstrumentParams, destination: Tone.ToneAudioNode) {
    // Create gain for mixing
    this.gain = new Tone.Gain(1.0);

    // Create panner
    this.panner = new Tone.Panner(0);

    // Map custom oscillator types to valid Tone.js types
    const mapOscillatorType = (type: string): Tone.ToneOscillatorType => {
      // Map custom types to valid Tone.js types
      if (type === 'pwm' || type === 'pulse') return 'square';
      if (type === 'noise') return 'sine';
      // Valid types: sine, square, sawtooth, triangle
      return type as Tone.ToneOscillatorType;
    };

    // Create oscillators
    for (let i = 0; i < params.oscillators.length; i++) {
      const oscParams = params.oscillators[i];
      const osc = new Tone.Oscillator({
        type: mapOscillatorType(oscParams.type),
        phase: oscParams.phase,
        detune: oscParams.detune
      });

      this.oscillators.push(osc);
    }

    // Create filter
    this.filter = new Tone.Filter({
      type: params.filter.type,
      frequency: params.filter.frequency,
      Q: params.filter.Q,
      gain: params.filter.gain
    });

    // Create filter envelope
    this.filterEnvelope = new Tone.FrequencyEnvelope({
      attack: params.filter.envelope.attack,
      decay: params.filter.envelope.decay,
      sustain: params.filter.envelope.sustain,
      release: params.filter.envelope.release,
      baseFrequency: params.filter.frequency,
      octaves: params.filter.envelope.amount * 4
    });

    // Create second filter if specified
    if (params.filter2) {
      this.filter2 = new Tone.Filter({
        type: params.filter2.type,
        frequency: params.filter2.frequency,
        Q: params.filter2.Q,
        gain: params.filter2.gain
      });
    }

    // Create amplitude envelope
    this.ampEnvelope = new Tone.AmplitudeEnvelope({
      attack: 0.01,
      decay: 0.1,
      sustain: 0.7,
      release: 0.3
    });

    // Map LFO waveforms to valid Tone.js types
    const mapLFOWaveform = (waveform: LFOWaveform): Tone.ToneOscillatorType => {
      // Map 'random' to 'sine', keep others as-is
      if (waveform === 'random') return 'sine';
      return waveform as Tone.ToneOscillatorType;
    };

    // Create LFO1
    this.lfo1 = new Tone.LFO({
      frequency: params.lfo1.frequency,
      type: mapLFOWaveform(params.lfo1.waveform),
      phase: params.lfo1.phase,
      min: -params.lfo1.depth,
      max: params.lfo1.depth
    });

    // Create LFO2 if specified
    if (params.lfo2) {
      this.lfo2 = new Tone.LFO({
        frequency: params.lfo2.frequency,
        type: mapLFOWaveform(params.lfo2.waveform),
        phase: params.lfo2.phase,
        min: -params.lfo2.depth,
        max: params.lfo2.depth
      });
    }

    // Create effects
    if (params.effects.distortion) {
      this.distortion = new Tone.Distortion(params.effects.distortion.amount);
    }

    if (params.effects.chorus) {
      this.chorus = new Tone.Chorus({
        frequency: params.effects.chorus.rate,
        delayTime: 2.5,
        depth: params.effects.chorus.depth,
        feedback: params.effects.chorus.feedback
      });
    }

    if (params.effects.bitcrusher) {
      this.bitcrusher = new Tone.BitCrusher(params.effects.bitcrusher.bits);
    }

    // Connect signal chain
    this.connectSignalChain(params, destination);

    // Set up modulation
    this.setupModulation(params);
  }

  /**
   * Connect audio signal chain
   */
  private connectSignalChain(params: AdvancedInstrumentParams, destination: Tone.ToneAudioNode): void {
    // Mix oscillators
    const mixer = new Tone.Gain(1.0);

    for (let i = 0; i < this.oscillators.length; i++) {
      const oscGain = new Tone.Gain(params.oscillatorMix[i] || 1.0 / this.oscillators.length);
      this.oscillators[i].connect(oscGain);
      oscGain.connect(mixer);
    }

    // Signal chain: oscillators -> filter -> effects -> envelope -> gain -> pan -> out
    let currentNode: Tone.ToneAudioNode = mixer;

    // Filters
    mixer.connect(this.filter);
    currentNode = this.filter;

    if (this.filter2) {
      this.filter.connect(this.filter2);
      currentNode = this.filter2;
    }

    // Effects
    if (this.distortion) {
      currentNode.connect(this.distortion);
      currentNode = this.distortion;
    }

    if (this.chorus) {
      currentNode.connect(this.chorus);
      currentNode = this.chorus;
    }

    if (this.bitcrusher) {
      currentNode.connect(this.bitcrusher);
      currentNode = this.bitcrusher;
    }

    // Amplitude envelope
    currentNode.connect(this.ampEnvelope);
    this.ampEnvelope.connect(this.gain);
    this.gain.connect(this.panner);
    this.panner.connect(destination);

    // Connect filter envelope
    this.filterEnvelope.connect(this.filter.frequency);
  }

  /**
   * Set up modulation routing
   */
  private setupModulation(params: AdvancedInstrumentParams): void {
    // LFO1 routing
    switch (params.lfo1.target) {
      case 'pitch':
        this.oscillators.forEach(osc => {
          this.lfo1.connect(osc.detune);
        });
        break;
      case 'filter':
        this.lfo1.connect(this.filter.frequency);
        break;
      case 'amplitude':
        this.lfo1.connect(this.gain.gain);
        break;
      case 'pan':
        this.lfo1.connect(this.panner.pan);
        break;
    }

    // LFO2 routing
    if (this.lfo2 && params.lfo2) {
      switch (params.lfo2.target) {
        case 'pitch':
          this.oscillators.forEach(osc => {
            this.lfo2!.connect(osc.detune);
          });
          break;
        case 'filter':
          if (this.filter2) {
            this.lfo2.connect(this.filter2.frequency);
          }
          break;
        case 'amplitude':
          this.lfo2.connect(this.gain.gain);
          break;
        case 'pan':
          this.lfo2.connect(this.panner.pan);
          break;
      }
    }
  }

  /**
   * Trigger attack
   */
  triggerAttack(note: string | number, time?: number, velocity: number = 1.0): void {
    // Start oscillators
    this.oscillators.forEach(osc => {
      osc.start(time);
    });

    // Trigger envelopes
    this.filterEnvelope.triggerAttack(time);
    this.ampEnvelope.triggerAttack(time, velocity);

    // Start LFOs
    this.lfo1.start(time);
    if (this.lfo2) {
      this.lfo2.start(time);
    }

    // Set oscillator frequencies
    const frequency = typeof note === 'string' ? Tone.Frequency(note).toFrequency() : note;
    this.oscillators.forEach(osc => {
      osc.frequency.setValueAtTime(frequency, time || Tone.now());
    });
  }

  /**
   * Trigger release
   */
  triggerRelease(time?: number): void {
    // Trigger envelopes
    this.filterEnvelope.triggerRelease(time);
    this.ampEnvelope.triggerRelease(time);

    // Stop oscillators after release
    const releaseSeconds = Tone.Time(this.ampEnvelope.release).toSeconds();
    const releaseTime = (time || Tone.now()) + releaseSeconds;
    this.oscillators.forEach(osc => {
      osc.stop(releaseTime);
    });
  }

  /**
   * Trigger attack and release
   */
  triggerAttackRelease(note: string | number, duration: number, time?: number, velocity: number = 1.0): void {
    this.triggerAttack(note, time, velocity);
    this.triggerRelease((time || Tone.now()) + Tone.Time(duration).toSeconds());
  }

  /**
   * Set filter cutoff
   */
  setFilterCutoff(frequency: number, rampTime: number = 0): void {
    if (rampTime > 0) {
      this.filter.frequency.rampTo(frequency, rampTime);
    } else {
      this.filter.frequency.value = frequency;
    }
  }

  /**
   * Set filter resonance
   */
  setFilterResonance(Q: number): void {
    this.filter.Q.value = Q;
  }

  /**
   * Set LFO rate
   */
  setLFORate(lfoNumber: 1 | 2, frequency: number): void {
    if (lfoNumber === 1) {
      this.lfo1.frequency.value = frequency;
    } else if (lfoNumber === 2 && this.lfo2) {
      this.lfo2.frequency.value = frequency;
    }
  }

  /**
   * Set LFO depth
   */
  setLFODepth(lfoNumber: 1 | 2, depth: number): void {
    if (lfoNumber === 1) {
      this.lfo1.min = -depth;
      this.lfo1.max = depth;
    } else if (lfoNumber === 2 && this.lfo2) {
      this.lfo2.min = -depth;
      this.lfo2.max = depth;
    }
  }

  /**
   * Dispose of all resources
   */
  dispose(): void {
    this.oscillators.forEach(osc => osc.dispose());
    this.filter.dispose();
    this.filter2?.dispose();
    this.filterEnvelope.dispose();
    this.ampEnvelope.dispose();
    this.lfo1.dispose();
    this.lfo2?.dispose();
    this.distortion?.dispose();
    this.chorus?.dispose();
    this.bitcrusher?.dispose();
    this.gain.dispose();
    this.panner.dispose();
  }
}

/**
 * Convert basic instrument to advanced parameters
 */
export function convertToAdvancedParams(inst: Instrument): AdvancedInstrumentParams {
  return {
    oscillators: [
      {
        type: inst.oscillator?.type || 'sawtooth',
        detune: inst.oscillator?.detune || 0,
        octave: 0,
        semitone: 0,
        cents: 0,
        phase: 0
      }
    ],
    oscillatorMix: [1.0],
    filter: {
      type: inst.filter?.type || 'lowpass',
      frequency: inst.filter?.cutoff || 2000,
      Q: inst.filter?.resonance || 1,
      envelope: {
        amount: 0.5,
        attack: 0.01,
        decay: 0.1,
        sustain: 0.5,
        release: 0.3
      },
      keyTracking: 0.5
    },
    lfo1: {
      waveform: 'sine',
      frequency: 5,
      depth: 0.5,
      target: 'filter',
      phase: 0,
      sync: false
    },
    modulation: {
      sources: []
    },
    effects: {}
  };
}
