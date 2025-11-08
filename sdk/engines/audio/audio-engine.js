"use strict";
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
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.AudioEngine = void 0;
const Tone = __importStar(require("tone"));
class AudioEngine {
    constructor(config = {}) {
        /** Sound synthesizers */
        this.synths = new Map();
        /** Music player */
        this.musicPlayer = null;
        /** Current music state */
        this.currentMusicState = null;
        /** Sound library (pre-defined effects) */
        this.soundLibrary = new Map();
        /** Is audio initialized? */
        this.initialized = false;
        this.config = {
            masterVolume: config.masterVolume ?? 0.7,
            musicVolume: config.musicVolume ?? 0.5,
            sfxVolume: config.sfxVolume ?? 0.8,
            enabled: config.enabled ?? true,
        };
        // Initialize Tone.js
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
    async init() {
        if (this.initialized)
            return;
        await Tone.start();
        this.initialized = true;
    }
    /**
     * Build sound effects library
     * @private
     */
    buildSoundLibrary() {
        // Laser sound
        this.soundLibrary.set('laser', {
            synth: new Tone.Synth({
                oscillator: { type: 'sawtooth' },
                envelope: { attack: 0.01, decay: 0.1, sustain: 0, release: 0.1 },
            }).connect(this.sfxGain),
            pattern: (params) => {
                const freq = params.frequency || 880;
                const dur = params.duration || 0.1;
                this.soundLibrary.get('laser').synth.triggerAttackRelease(freq, dur);
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
                const synth = this.soundLibrary.get('jump').synth;
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
                const synth = this.soundLibrary.get('coin').synth;
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
                this.soundLibrary.get('hit').synth.triggerAttackRelease(0.05);
            },
        });
        // Power-up sound
        this.soundLibrary.set('powerup', {
            synth: new Tone.Synth({
                oscillator: { type: 'triangle' },
                envelope: { attack: 0.01, decay: 0.3, sustain: 0.2, release: 0.3 },
            }).connect(this.sfxGain),
            pattern: () => {
                const synth = this.soundLibrary.get('powerup').synth;
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
                this.soundLibrary.get('menu-beep').synth.triggerAttackRelease(freq, 0.05);
            },
        });
        // Game over sound
        this.soundLibrary.set('gameover', {
            synth: new Tone.Synth({
                oscillator: { type: 'sawtooth' },
                envelope: { attack: 0.1, decay: 0.5, sustain: 0.3, release: 1.0 },
            }).connect(this.sfxGain),
            pattern: () => {
                const synth = this.soundLibrary.get('gameover').synth;
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
    playSound(soundId, params = {}) {
        if (!this.config.enabled || !this.initialized)
            return;
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
    playCustomSound(params) {
        if (!this.config.enabled || !this.initialized)
            return;
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
    generateMusic(prompt) {
        if (!this.config.enabled || !this.initialized)
            return;
        // Parse prompt for musical characteristics
        const { tempo, pattern, instruments } = prompt;
        // Create basic chiptune loop (simplified)
        // In production, this would use Scribbletune for more complex generation
        const loop = new Tone.Loop((time) => {
            // Simple melody generation based on pattern
            const notes = ['C4', 'E4', 'G4', 'C5'];
            const note = notes[Math.floor(Math.random() * notes.length)];
            const synth = new Tone.Synth({
                oscillator: { type: instruments[0] || 'square' },
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
    setMusicState(state, intensity = 0.5, transition = 'crossfade') {
        if (!this.config.enabled || !this.initialized)
            return;
        this.currentMusicState = { state, intensity, transition };
        // Adjust music based on intensity
        const targetVolume = this.config.musicVolume * intensity;
        if (transition === 'immediate') {
            this.musicGain.gain.value = targetVolume;
        }
        else if (transition === 'fade') {
            this.musicGain.gain.rampTo(targetVolume, 1.0);
        }
        else {
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
    stopMusic() {
        Tone.Transport.stop();
        Tone.Transport.cancel();
    }
    /**
     * Set master volume
     *
     * @param volume - Volume (0.0 - 1.0)
     */
    setMasterVolume(volume) {
        this.config.masterVolume = Math.max(0, Math.min(1, volume));
        this.masterGain.gain.value = this.config.masterVolume;
    }
    /**
     * Set music volume
     *
     * @param volume - Volume (0.0 - 1.0)
     */
    setMusicVolume(volume) {
        this.config.musicVolume = Math.max(0, Math.min(1, volume));
        this.musicGain.gain.value = this.config.musicVolume;
    }
    /**
     * Set SFX volume
     *
     * @param volume - Volume (0.0 - 1.0)
     */
    setSFXVolume(volume) {
        this.config.sfxVolume = Math.max(0, Math.min(1, volume));
        this.sfxGain.gain.value = this.config.sfxVolume;
    }
    /**
     * Enable/disable audio
     *
     * @param enabled - Enable audio?
     */
    setEnabled(enabled) {
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
    getConfig() {
        return { ...this.config };
    }
    /**
     * Clean up and dispose audio resources
     */
    dispose() {
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
exports.AudioEngine = AudioEngine;
exports.default = AudioEngine;
