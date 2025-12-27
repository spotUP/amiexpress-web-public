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
import { AudioConfig, SoundEffect, MusicPrompt } from '../../core/types';
export declare class AudioEngine {
    /** Audio configuration */
    private config;
    /** Sound synthesizers */
    private synths;
    /** Music player */
    private musicPlayer;
    /** Current music state */
    private currentMusicState;
    /** Master volume control */
    private masterGain;
    /** Music volume control */
    private musicGain;
    /** SFX volume control */
    private sfxGain;
    /** Sound library (pre-defined effects) */
    private soundLibrary;
    /** Is audio initialized? */
    private initialized;
    constructor(config?: Partial<AudioConfig>);
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
    init(): Promise<void>;
    /**
     * Build sound effects library
     * @private
     */
    private buildSoundLibrary;
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
    playSound(soundId: string, params?: Partial<SoundEffect>): void;
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
    playCustomSound(params: SoundEffect): void;
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
    generateMusic(prompt: MusicPrompt): void;
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
    setMusicState(state: string, intensity?: number, transition?: 'immediate' | 'crossfade' | 'fade'): void;
    /**
     * Stop all music
     */
    stopMusic(): void;
    /**
     * Set master volume
     *
     * @param volume - Volume (0.0 - 1.0)
     */
    setMasterVolume(volume: number): void;
    /**
     * Set music volume
     *
     * @param volume - Volume (0.0 - 1.0)
     */
    setMusicVolume(volume: number): void;
    /**
     * Set SFX volume
     *
     * @param volume - Volume (0.0 - 1.0)
     */
    setSFXVolume(volume: number): void;
    /**
     * Enable/disable audio
     *
     * @param enabled - Enable audio?
     */
    setEnabled(enabled: boolean): void;
    /**
     * Get audio configuration
     *
     * @returns Current audio config
     */
    getConfig(): AudioConfig;
    /**
     * Clean up and dispose audio resources
     */
    dispose(): void;
}
export default AudioEngine;
