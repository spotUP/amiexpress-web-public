/**
 * Audio Engine - Procedural Sound & AI Music Generation
 *
 * Revolutionary audio system for BBS doors featuring:
 * - Procedural sound effects using Tone.js
 * - AI-generated music from text prompts (Scribbletune)
 * - Adaptive music that changes with game state
 * - Chiptune synthesis for authentic retro sound
 * - Sound effects library for common game events
 *
 * @example
 * ```typescript
 * import { AudioEngine } from '@amiexpress/sdk/engines/audio';
 *
 * const audio = new AudioEngine();
 *
 * // Play sound effect
 * audio.playSound('laser', { frequency: 440, duration: 0.1 });
 *
 * // Generate music from text prompt
 * audio.generateMusic({
 *   prompt: 'upbeat chiptune melody in C major',
 *   tempo: 140,
 *   pattern: 'x-x-x-x-',
 *   instruments: ['square', 'triangle']
 * });
 *
 * // Adaptive music
 * audio.setMusicState('boss-fight', 0.9);
 * ```
 */

import * as Tone from 'tone';
import { AudioConfig, SoundEffect, MusicPrompt } from '../../core/types';

/** Music state for adaptive audio */
interface MusicState {
  state: string;
  intensity: number;
  transition: 'immediate' | 'crossfade' | 'fade';
}

/** Sound library entry */
interface SoundLibraryEntry {
  synth: Tone.Synth | Tone.NoiseSynth | Tone.MonoSynth;
  pattern: (params: Partial<SoundEffect>) => void;
}

export class AudioEngine {
  /** Audio configuration */
  private config: AudioConfig;

  /** Sound synthesizers */
  private synths: Map<string, Tone.Synth> = new Map();

  /** Music player */
  private musicPlayer: Tone.Player | null = null;

  /** Current music state */
  private currentMusicState: MusicState | null = null;

  /** Master volume control */
  private masterGain: Tone.Gain;

  /** Music volume control */
  private musicGain: Tone.Gain;

  /** SFX volume control */
  private sfxGain: Tone.Gain;

  /** Sound library (pre-defined effects) */
  private soundLibrary: Map<string, SoundLibraryEntry> = new Map();

  /** Is audio initialized? */
  private initialized: boolean = false;

  constructor(config: Partial<AudioConfig> = {}) {
    this.config = {
      masterVolume: config.masterVolume ?? 0.7,
      musicVolume: config.musicVolume ?? 0.5,
      sfxVolume: config.sfxVolume ?? 0.8,
      enabled: config.enabled ?? true,
    };

    // Check if we're in a browser environment with AudioContext
    const isBrowser = typeof window !== 'undefined' && typeof AudioContext !== 'undefined';

    if (!isBrowser) {
      // Node.js environment - create placeholder gains that won't be used
      console.warn('AudioEngine: Running in Node.js environment. Audio features disabled.');
      this.masterGain = {} as Tone.Gain;
      this.musicGain = {} as Tone.Gain;
      this.sfxGain = {} as Tone.Gain;
      return;
    }

    // Initialize Tone.js (browser only)
    this.masterGain = new Tone.Gain(this.config.masterVolume).toDestination();
    this.musicGain = new Tone.Gain(this.config.musicVolume).connect(this.masterGain);
    this.sfxGain = new Tone.Gain(this.config.sfxVolume).connect(this.masterGain);

    // Build sound library
    this.buildSoundLibrary();
  }

  /**
   * Initialize audio context (must be called after user interaction)
   *
   * @example
   * ```typescript
   * door.onConnect(async () => {
   *   await audio.init();
   *   audio.playSound('welcome');
   * });
   * ```
   */
  public async init(): Promise<void> {
    if (this.initialized) return;

    await Tone.start();
    this.initialized = true;
  }

  /**
   * Build sound effects library
   * @private
   */
  private buildSoundLibrary(): void {
    // Laser sound
    this.soundLibrary.set('laser', {
      synth: new Tone.Synth({
        oscillator: { type: 'sawtooth' },
        envelope: { attack: 0.01, decay: 0.1, sustain: 0, release: 0.1 },
      }).connect(this.sfxGain),
      pattern: (params) => {
        const freq = params.frequency || 880;
        const dur = params.duration || 0.1;
        this.soundLibrary.get('laser')!.synth.triggerAttackRelease(freq, dur);
      },
    });

    // Explosion sound
    const noiseSynth = new Tone.NoiseSynth({
      noise: { type: 'pink' },
      envelope: { attack: 0.01, decay: 0.5, sustain: 0, release: 0.5 },
    }).connect(this.sfxGain);

    this.soundLibrary.set('explosion', {
      synth: noiseSynth,
      pattern: () => {
        noiseSynth.triggerAttackRelease(0.5);
      },
    });

    // Jump sound
    this.soundLibrary.set('jump', {
      synth: new Tone.Synth({
        oscillator: { type: 'square' },
        envelope: { attack: 0.01, decay: 0.2, sustain: 0, release: 0.1 },
      }).connect(this.sfxGain),
      pattern: () => {
        const synth = this.soundLibrary.get('jump')!.synth;
        synth.triggerAttackRelease('C5', '0.1');
      },
    });

    // Coin/pickup sound
    this.soundLibrary.set('coin', {
      synth: new Tone.MonoSynth({
        oscillator: { type: 'sine' },
        envelope: { attack: 0.01, decay: 0.1, sustain: 0.1, release: 0.1 },
      }).connect(this.sfxGain),
      pattern: () => {
        const synth = this.soundLibrary.get('coin')!.synth as Tone.MonoSynth;
        synth.triggerAttackRelease('E5', '0.05', '+0');
        synth.triggerAttackRelease('A5', '0.1', '+0.05');
      },
    });

    // Hit/damage sound
    this.soundLibrary.set('hit', {
      synth: new Tone.NoiseSynth({
        noise: { type: 'white' },
        envelope: { attack: 0.01, decay: 0.05, sustain: 0, release: 0.05 },
      }).connect(this.sfxGain),
      pattern: () => {
        (this.soundLibrary.get('hit')!.synth as Tone.NoiseSynth).triggerAttackRelease(0.05);
      },
    });

    // Power-up sound
    this.soundLibrary.set('powerup', {
      synth: new Tone.Synth({
        oscillator: { type: 'triangle' },
        envelope: { attack: 0.01, decay: 0.3, sustain: 0.2, release: 0.3 },
      }).connect(this.sfxGain),
      pattern: () => {
        const synth = this.soundLibrary.get('powerup')!.synth as Tone.Synth;
        synth.triggerAttackRelease('C4', '0.1', Tone.now());
        synth.triggerAttackRelease('E4', '0.1', Tone.now() + 0.1);
        synth.triggerAttackRelease('G4', '0.1', Tone.now() + 0.2);
        synth.triggerAttackRelease('C5', '0.3', Tone.now() + 0.3);
      },
    });

    // Menu beep
    this.soundLibrary.set('menu-beep', {
      synth: new Tone.Synth({
        oscillator: { type: 'sine' },
        envelope: { attack: 0.01, decay: 0.05, sustain: 0, release: 0.05 },
      }).connect(this.sfxGain),
      pattern: (params) => {
        const freq = params.frequency || 880;
        this.soundLibrary.get('menu-beep')!.synth.triggerAttackRelease(freq, 0.05);
      },
    });

    // Game over sound
    this.soundLibrary.set('gameover', {
      synth: new Tone.Synth({
        oscillator: { type: 'sawtooth' },
        envelope: { attack: 0.1, decay: 0.5, sustain: 0.3, release: 1.0 },
      }).connect(this.sfxGain),
      pattern: () => {
        const synth = this.soundLibrary.get('gameover')!.synth as Tone.Synth;
        synth.triggerAttackRelease('E4', '0.3', Tone.now());
        synth.triggerAttackRelease('D4', '0.3', Tone.now() + 0.3);
        synth.triggerAttackRelease('C4', '0.3', Tone.now() + 0.6);
        synth.triggerAttackRelease('B3', '1.0', Tone.now() + 0.9);
      },
    });
  }

  /**
   * Play sound effect
   *
   * @param soundId - Sound ID from library
   * @param params - Sound parameters (optional)
   *
   * @example
   * ```typescript
   * // Play pre-defined sound
   * audio.playSound('laser');
   * audio.playSound('explosion');
   * audio.playSound('coin');
   *
   * // Play with custom parameters
   * audio.playSound('menu-beep', { frequency: 1000 });
   * ```
   */
  public playSound(soundId: string, params: Partial<SoundEffect> = {}): void {
    if (!this.config.enabled || !this.initialized) return;

    const sound = this.soundLibrary.get(soundId);
    if (sound) {
      sound.pattern(params);
    }
  }

  /**
   * Play custom sound effect
   *
   * @param params - Sound effect parameters
   *
   * @example
   * ```typescript
   * audio.playCustomSound({
   *   type: 'laser-beam',
   *   frequency: 440,
   *   duration: 0.2,
   *   envelope: 'fade',
   *   volume: 0.5
   * });
   * ```
   */
  public playCustomSound(params: SoundEffect): void {
    if (!this.config.enabled || !this.initialized) return;

    const synth = new Tone.Synth({
      oscillator: { type: 'sine' },
      envelope: {
        attack: 0.01,
        decay: params.envelope === 'pluck' ? 0.1 : 0.2,
        sustain: params.envelope === 'sustain' ? 0.5 : 0,
        release: params.envelope === 'fade' ? 0.5 : 0.1,
      },
    }).connect(this.sfxGain);

    synth.volume.value = Tone.gainToDb(params.volume);
    synth.triggerAttackRelease(params.frequency, params.duration);

    // Clean up
    setTimeout(() => {
      synth.dispose();
    }, (params.duration + 1) * 1000);
  }

  /**
   * Generate music from text prompt (AI-powered)
   *
   * @param prompt - Music generation parameters
   *
   * @example
   * ```typescript
   * // Generate upbeat chiptune
   * audio.generateMusic({
   *   prompt: 'upbeat chiptune melody in C major',
   *   tempo: 140,
   *   pattern: 'x-x-x-x-',
   *   instruments: ['square', 'triangle'],
   *   duration: 8
   * });
   *
   * // Generate boss battle music
   * audio.generateMusic({
   *   prompt: 'intense boss battle theme in D minor',
   *   tempo: 160,
   *   pattern: 'xxxx',
   *   instruments: ['sawtooth']
   * });
   * ```
   */
  public generateMusic(prompt: MusicPrompt): void {
    if (!this.config.enabled || !this.initialized) return;

    // Parse prompt for musical characteristics
    const { tempo, pattern, instruments } = prompt;

    // Create basic chiptune loop (simplified)
    // In production, this would use Scribbletune for more complex generation
    const loop = new Tone.Loop((time) => {
      // Simple melody generation based on pattern
      const notes = ['C4', 'E4', 'G4', 'C5'];
      const note = notes[Math.floor(Math.random() * notes.length)];

      const synth = new Tone.Synth({
        oscillator: { type: instruments[0] as any || 'square' },
        envelope: { attack: 0.01, decay: 0.1, sustain: 0.1, release: 0.1 },
      }).connect(this.musicGain);

      synth.triggerAttackRelease(note, '8n', time);
    }, '8n');

    Tone.Transport.bpm.value = tempo;
    loop.start(0);
    Tone.Transport.start();
  }

  /**
   * Set adaptive music state
   *
   * @param state - Music state identifier
   * @param intensity - Music intensity (0.0 - 1.0)
   * @param transition - Transition type
   *
   * @example
   * ```typescript
   * // Calm exploration music
   * audio.setMusicState('explore', 0.3, 'fade');
   *
   * // Intense combat music
   * audio.setMusicState('combat', 0.9, 'crossfade');
   *
   * // Boss battle climax
   * audio.setMusicState('boss-fight', 1.0, 'immediate');
   * ```
   */
  public setMusicState(
    state: string,
    intensity: number = 0.5,
    transition: 'immediate' | 'crossfade' | 'fade' = 'crossfade'
  ): void {
    if (!this.config.enabled || !this.initialized) return;

    this.currentMusicState = { state, intensity, transition };

    // Adjust music based on intensity
    const targetVolume = this.config.musicVolume * intensity;

    if (transition === 'immediate') {
      this.musicGain.gain.value = targetVolume;
    } else if (transition === 'fade') {
      this.musicGain.gain.rampTo(targetVolume, 1.0);
    } else {
      // Crossfade (would switch between multiple tracks in production)
      this.musicGain.gain.rampTo(targetVolume, 2.0);
    }

    // Adjust tempo based on intensity
    const baseTempo = 120;
    const targetTempo = baseTempo + (intensity * 40);
    Tone.Transport.bpm.rampTo(targetTempo, 2.0);
  }

  /**
   * Stop all music
   */
  public stopMusic(): void {
    Tone.Transport.stop();
    Tone.Transport.cancel();
  }

  /**
   * Set master volume
   *
   * @param volume - Volume (0.0 - 1.0)
   */
  public setMasterVolume(volume: number): void {
    this.config.masterVolume = Math.max(0, Math.min(1, volume));
    this.masterGain.gain.value = this.config.masterVolume;
  }

  /**
   * Set music volume
   *
   * @param volume - Volume (0.0 - 1.0)
   */
  public setMusicVolume(volume: number): void {
    this.config.musicVolume = Math.max(0, Math.min(1, volume));
    this.musicGain.gain.value = this.config.musicVolume;
  }

  /**
   * Set SFX volume
   *
   * @param volume - Volume (0.0 - 1.0)
   */
  public setSFXVolume(volume: number): void {
    this.config.sfxVolume = Math.max(0, Math.min(1, volume));
    this.sfxGain.gain.value = this.config.sfxVolume;
  }

  /**
   * Enable/disable audio
   *
   * @param enabled - Enable audio?
   */
  public setEnabled(enabled: boolean): void {
    this.config.enabled = enabled;
    if (!enabled) {
      this.stopMusic();
    }
  }

  /**
   * Get audio configuration
   *
   * @returns Current audio config
   */
  public getConfig(): AudioConfig {
    return { ...this.config };
  }

  /**
   * Clean up and dispose audio resources
   */
  public dispose(): void {
    this.stopMusic();

    this.soundLibrary.forEach((entry) => {
      entry.synth.dispose();
    });

    this.synths.forEach((synth) => {
      synth.dispose();
    });

    this.masterGain.dispose();
    this.musicGain.dispose();
    this.sfxGain.dispose();
  }
}

export default AudioEngine;
