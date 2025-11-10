/**
 * Audio Engine - Tone.js Wrapper
 * Manages playback, synthesis, and effects
 *
 * Now runs in the browser with REAL Web Audio API!
 * No more mocking needed - this is genuine browser audio.
 */

import * as Tone from 'tone';
import { Instrument, Note, Pattern, Song, EffectPluginType } from '../data/types';

export class AudioEngine {
  private channels: ChannelStrip[] = [];
  private master: Tone.Channel;
  private currentRow: number = 0;
  private currentPattern: number = 0;
  private playing: boolean = false;
  private bpm: number = 140;
  private ticksPerRow: number = 6;

  constructor(channelCount: number = 16) {
    // Initialize master channel
    this.master = new Tone.Channel().toDestination();

    // Create channels
    for (let i = 0; i < channelCount; i++) {
      const channel = new ChannelStrip(i);
      channel.connect(this.master);
      this.channels.push(channel);
    }

    Tone.getTransport().bpm.value = this.bpm;
  }

  /**
   * Initialize audio context (must be called after user interaction)
   */
  async init(): Promise<void> {
    await Tone.start();
    console.log('Audio engine initialized');
  }

  /**
   * Play a single note on a channel
   */
  playNote(channel: number, note: Note, instrument: Instrument): void {
    if (channel >= this.channels.length) return;
    if (note.note === '---' || note.note === '...') return;

    const freq = this.noteToFrequency(note.note as string);
    const velocity = note.volume / 255;

    this.channels[channel].triggerNote(freq, velocity, instrument);
  }

  /**
   * Play entire pattern
   */
  playPattern(pattern: Pattern, instruments: Instrument[], loop: boolean = false): void {
    this.stop();
    this.currentRow = 0;
    this.currentPattern = pattern.id;
    this.playing = true;

    // Schedule pattern rows
    const rowDuration = 60 / this.bpm / this.ticksPerRow;

    const scheduleRow = (row: number) => {
      for (let ch = 0; ch < pattern.channels; ch++) {
        const key = `${row}:${ch}`;
        const noteData = pattern.data.get(key);

        if (noteData) {
          const inst = instruments.find(i => i.id === noteData.instrument);
          if (inst) {
            this.playNote(ch, noteData, inst);
          }
        }
      }

      this.currentRow = row;

      if (row < pattern.rows - 1) {
        setTimeout(() => scheduleRow(row + 1), rowDuration * 1000);
      } else if (loop) {
        setTimeout(() => scheduleRow(0), rowDuration * 1000);
      } else {
        this.playing = false;
      }
    };

    scheduleRow(0);
  }

  /**
   * Play entire song
   */
  playSong(song: Song, loop: boolean = true): void {
    this.stop();
    this.setBPM(song.bpm);
    this.playing = true;

    let sequenceIndex = 0;
    const rowDuration = 60 / this.bpm / this.ticksPerRow;

    const playNextPattern = () => {
      if (!this.playing) return;

      if (sequenceIndex >= song.sequence.length) {
        if (loop) {
          sequenceIndex = song.loopStart || 0;
        } else {
          this.playing = false;
          return;
        }
      }

      const patternId = song.sequence[sequenceIndex];
      const pattern = song.patterns.find(p => p.id === patternId);

      if (!pattern) {
        sequenceIndex++;
        playNextPattern();
        return;
      }

      this.currentPattern = patternId;
      this.currentRow = 0;

      const scheduleRow = (row: number) => {
        if (!this.playing) return;

        for (let ch = 0; ch < pattern.channels; ch++) {
          const key = `${row}:${ch}`;
          const noteData = pattern.data.get(key);

          if (noteData) {
            const inst = song.instruments.find(i => i.id === noteData.instrument);
            if (inst) {
              this.playNote(ch, noteData, inst);
            }
          }
        }

        this.currentRow = row;

        if (row < pattern.rows - 1) {
          setTimeout(() => scheduleRow(row + 1), rowDuration * 1000);
        } else {
          sequenceIndex++;
          setTimeout(() => playNextPattern(), rowDuration * 1000);
        }
      };

      scheduleRow(0);
    };

    playNextPattern();
  }

  /**
   * Stop playback
   */
  stop(): void {
    this.playing = false;
    this.channels.forEach(ch => ch.stopAll());
    this.currentRow = 0;
  }

  /**
   * Set BPM
   */
  setBPM(bpm: number): void {
    this.bpm = Math.max(40, Math.min(300, bpm));
    Tone.getTransport().bpm.value = this.bpm;
  }

  /**
   * Set master volume
   */
  setMasterVolume(volume: number): void {
    this.master.volume.value = Tone.gainToDb(volume);
  }

  /**
   * Convert note name to frequency
   */
  private noteToFrequency(note: string): number {
    // Parse note like "C-4", "D#5"
    const match = note.match(/([A-G]#?)-(\d)/);
    if (!match) return 440;

    const [, noteName, octave] = match;
    return Tone.Frequency(`${noteName}${octave}`).toFrequency();
  }

  /**
   * Dispose of all audio resources
   */
  dispose(): void {
    this.stop();
    this.channels.forEach(ch => ch.dispose());
    this.master.dispose();
  }
}

/**
 * Individual channel strip with synth/sampler and effects
 */
class ChannelStrip {
  private id: number;
  private synth: Tone.PolySynth | null = null;
  private sampler: Tone.Sampler | null = null;
  private effects: Tone.ToneAudioNode[] = [];
  private channel: Tone.Channel;
  private currentInstrument: Instrument | null = null;

  constructor(id: number) {
    this.id = id;
    this.channel = new Tone.Channel({ volume: 0 });

    // Create default synth
    this.createSynth({
      type: 'synth',
      oscillator: { type: 'sawtooth', detune: 0 },
      envelope: { attack: 0.01, decay: 0.2, sustain: 0.5, release: 0.5 }
    } as Instrument);
  }

  /**
   * Trigger a note
   */
  triggerNote(frequency: number, velocity: number, instrument: Instrument): void {
    // Update instrument if changed
    if (this.currentInstrument?.id !== instrument.id) {
      this.updateInstrument(instrument);
    }

    if (this.synth) {
      this.synth.triggerAttackRelease(frequency, '8n', undefined, velocity);
    } else if (this.sampler && instrument.sample) {
      // Trigger sample
      const midiNote = Tone.Frequency(frequency).toMidi();
      this.sampler.triggerAttackRelease(midiNote, '8n', undefined, velocity);
    }
  }

  /**
   * Update instrument configuration
   */
  private updateInstrument(instrument: Instrument): void {
    this.currentInstrument = instrument;

    if (instrument.type === 'synth') {
      this.createSynth(instrument);
    } else if (instrument.type === 'sample' && instrument.sample) {
      this.createSampler(instrument);
    }

    // Update effects chain
    this.updateEffects(instrument.effects || []);
  }

  /**
   * Create synthesizer
   */
  private createSynth(instrument: Instrument): void {
    if (this.synth) {
      this.synth.dispose();
    }

    // Map custom oscillator types to valid Tone.js types
    const mapOscillatorType = (type?: string): Tone.ToneOscillatorType => {
      if (!type) return 'sawtooth';
      // Map custom types to valid Tone.js types
      if (type === 'pwm' || type === 'pulse') return 'square';
      if (type === 'noise') return 'sine';
      // Valid types: sine, square, sawtooth, triangle
      return type as Tone.ToneOscillatorType;
    };

    const options: Partial<Tone.PolySynthOptions<Tone.Synth>> = {
      voice: Tone.Synth,
      maxPolyphony: 32,
      options: {
        oscillator: {
          type: mapOscillatorType(instrument.oscillator?.type) as any
        },
        envelope: {
          attack: instrument.envelope.attack,
          decay: instrument.envelope.decay,
          sustain: instrument.envelope.sustain,
          release: instrument.envelope.release
        }
      }
    };

    // Add filter if configured
    if (instrument.filter) {
      const filter = new Tone.Filter({
        type: instrument.filter.type,
        frequency: instrument.filter.cutoff,
        Q: instrument.filter.resonance
      });

      this.synth = new Tone.PolySynth(options);
      this.synth.connect(filter);
      filter.connect(this.channel);
    } else {
      this.synth = new Tone.PolySynth(options);
      this.synth.connect(this.channel);
    }
  }

  /**
   * Create sampler
   */
  private createSampler(instrument: Instrument): void {
    if (this.sampler) {
      this.sampler.dispose();
    }

    // Convert sample data to base64 for Tone.js
    // In production, this would load actual sample files
    this.sampler = new Tone.Sampler();
    this.sampler.connect(this.channel);
  }

  /**
   * Update effects chain
   */
  private updateEffects(effectConfigs: any[]): void {
    // Clear existing effects
    this.effects.forEach(fx => fx.dispose());
    this.effects = [];

    // Create new effects
    effectConfigs.forEach(config => {
      if (!config.enabled) return;

      let effect: Tone.ToneAudioNode | null = null;

      switch (config.type) {
        case EffectPluginType.REVERB:
          effect = new Tone.Reverb({
            decay: config.params.decay || 1.5,
            wet: config.params.wet || 0.3
          });
          break;

        case EffectPluginType.DELAY:
          effect = new Tone.FeedbackDelay({
            delayTime: config.params.time || 0.25,
            feedback: config.params.feedback || 0.5,
            wet: config.params.wet || 0.3
          });
          break;

        case EffectPluginType.CHORUS:
          effect = new Tone.Chorus({
            frequency: config.params.frequency || 1.5,
            delayTime: config.params.delay || 3.5,
            depth: config.params.depth || 0.7,
            wet: config.params.wet || 0.5
          });
          break;

        case EffectPluginType.COMPRESSOR:
          effect = new Tone.Compressor({
            threshold: config.params.threshold || -24,
            ratio: config.params.ratio || 4,
            attack: config.params.attack || 0.003,
            release: config.params.release || 0.25
          });
          break;

        case EffectPluginType.BITCRUSHER:
          effect = new Tone.BitCrusher(config.params.bits || 4);
          break;
      }

      if (effect) {
        this.effects.push(effect);
      }
    });

    // Chain effects
    // In production, properly chain: synth -> fx1 -> fx2 -> ... -> channel
  }

  /**
   * Stop all notes
   */
  stopAll(): void {
    if (this.synth) {
      this.synth.releaseAll();
    }
    if (this.sampler) {
      this.sampler.releaseAll();
    }
  }

  /**
   * Connect to destination
   */
  connect(destination: Tone.ToneAudioNode): void {
    this.channel.connect(destination);
  }

  /**
   * Dispose of resources
   */
  dispose(): void {
    this.stopAll();
    if (this.synth) this.synth.dispose();
    if (this.sampler) this.sampler.dispose();
    this.effects.forEach(fx => fx.dispose());
    this.channel.dispose();
  }
}
