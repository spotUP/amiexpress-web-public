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
export class AudioEngine {
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
        // Check if we're in a browser environment with AudioContext
        const isBrowser = typeof globalThis !== 'undefined' &&
            globalThis.window !== undefined &&
            typeof globalThis.window.AudioContext !== 'undefined';
        if (!isBrowser) {
            // Node.js environment - create placeholder gains that won't be used
            console.warn('AudioEngine: Running in Node.js environment. Audio features disabled.');
            this.masterGain = {};
            this.musicGain = {};
            this.sfxGain = {};
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
    async init() {
        if (this.initialized)
            return;
        await Tone.start();
        this.initialized = true;
    }
    /**
     * Build comprehensive sound effects library
     * @private
     */
    buildSoundLibrary() {
        // Helper to create disposable synth for one-shot complex sounds
        const oneShot = (createFn) => ({
            synth: null,
            pattern: createFn,
        });
        // ========================================
        // UI SOUNDS
        // ========================================
        // Click - crisp UI click
        this.soundLibrary.set('click', {
            synth: new Tone.Synth({
                oscillator: { type: 'sine' },
                envelope: { attack: 0.001, decay: 0.03, sustain: 0, release: 0.02 },
            }).connect(this.sfxGain),
            pattern: () => {
                this.soundLibrary.get('click').synth.triggerAttackRelease('A5', 0.03);
            },
        });
        // Hover - subtle UI hover
        this.soundLibrary.set('hover', {
            synth: new Tone.Synth({
                oscillator: { type: 'sine' },
                envelope: { attack: 0.001, decay: 0.02, sustain: 0, release: 0.01 },
            }).connect(this.sfxGain),
            pattern: () => {
                const synth = this.soundLibrary.get('hover').synth;
                synth.volume.value = -12;
                synth.triggerAttackRelease('E5', 0.02);
            },
        });
        // Error - dissonant buzz
        this.soundLibrary.set('error', oneShot(() => {
            const synth = new Tone.Synth({
                oscillator: { type: 'square' },
                envelope: { attack: 0.01, decay: 0.15, sustain: 0, release: 0.1 },
            }).connect(this.sfxGain);
            synth.volume.value = -10;
            synth.triggerAttackRelease('C3', 0.08, Tone.now());
            synth.triggerAttackRelease('B2', 0.12, Tone.now() + 0.08);
            setTimeout(() => synth.dispose(), 400);
        }));
        // Success - bright confirmation
        this.soundLibrary.set('success', oneShot(() => {
            const synth = new Tone.Synth({
                oscillator: { type: 'sine' },
                envelope: { attack: 0.01, decay: 0.15, sustain: 0.1, release: 0.2 },
            }).connect(this.sfxGain);
            synth.triggerAttackRelease('G5', 0.08, Tone.now());
            synth.triggerAttackRelease('C6', 0.15, Tone.now() + 0.1);
            setTimeout(() => synth.dispose(), 500);
        }));
        // Notification - gentle bell
        this.soundLibrary.set('notification', {
            synth: new Tone.Synth({
                oscillator: { type: 'triangle' },
                envelope: { attack: 0.01, decay: 0.2, sustain: 0.05, release: 0.3 },
            }).connect(this.sfxGain),
            pattern: () => {
                this.soundLibrary.get('notification').synth.triggerAttackRelease('G5', 0.15);
            },
        });
        // Typing - keyboard tick
        this.soundLibrary.set('typing', {
            synth: new Tone.NoiseSynth({
                noise: { type: 'white' },
                envelope: { attack: 0.001, decay: 0.015, sustain: 0, release: 0.01 },
            }).connect(this.sfxGain),
            pattern: () => {
                const synth = this.soundLibrary.get('typing').synth;
                synth.volume.value = -15;
                synth.triggerAttackRelease(0.015);
            },
        });
        // Confirm - positive action
        this.soundLibrary.set('confirm', oneShot(() => {
            const synth = new Tone.Synth({
                oscillator: { type: 'sine' },
                envelope: { attack: 0.01, decay: 0.1, sustain: 0.05, release: 0.1 },
            }).connect(this.sfxGain);
            synth.triggerAttackRelease('C5', 0.06, Tone.now());
            synth.triggerAttackRelease('E5', 0.06, Tone.now() + 0.06);
            synth.triggerAttackRelease('G5', 0.1, Tone.now() + 0.12);
            setTimeout(() => synth.dispose(), 400);
        }));
        // Cancel - negative/back action
        this.soundLibrary.set('cancel', oneShot(() => {
            const synth = new Tone.Synth({
                oscillator: { type: 'sine' },
                envelope: { attack: 0.01, decay: 0.1, sustain: 0, release: 0.1 },
            }).connect(this.sfxGain);
            synth.triggerAttackRelease('E4', 0.08, Tone.now());
            synth.triggerAttackRelease('C4', 0.1, Tone.now() + 0.08);
            setTimeout(() => synth.dispose(), 300);
        }));
        // Toggle - switch sound
        this.soundLibrary.set('toggle', {
            synth: new Tone.Synth({
                oscillator: { type: 'square' },
                envelope: { attack: 0.001, decay: 0.04, sustain: 0, release: 0.02 },
            }).connect(this.sfxGain),
            pattern: (params) => {
                const synth = this.soundLibrary.get('toggle').synth;
                synth.volume.value = -8;
                const note = params.frequency && params.frequency > 500 ? 'G5' : 'C5';
                synth.triggerAttackRelease(note, 0.04);
            },
        });
        // Menu beep (legacy alias)
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
        // ========================================
        // COMBAT SOUNDS
        // ========================================
        // Sword swing - whoosh with metallic
        this.soundLibrary.set('sword-swing', oneShot(() => {
            const noise = new Tone.NoiseSynth({
                noise: { type: 'white' },
                envelope: { attack: 0.01, decay: 0.12, sustain: 0, release: 0.05 },
            }).connect(this.sfxGain);
            const filter = new Tone.Filter(800, 'bandpass').connect(this.sfxGain);
            noise.connect(filter);
            filter.frequency.rampTo(2000, 0.1);
            noise.triggerAttackRelease(0.12);
            setTimeout(() => { noise.dispose(); filter.dispose(); }, 300);
        }));
        // Arrow - quick whistle
        this.soundLibrary.set('arrow', oneShot(() => {
            const synth = new Tone.Synth({
                oscillator: { type: 'sine' },
                envelope: { attack: 0.001, decay: 0.15, sustain: 0, release: 0.05 },
            }).connect(this.sfxGain);
            synth.volume.value = -8;
            synth.frequency.setValueAtTime(2000, Tone.now());
            synth.frequency.exponentialRampTo(800, 0.15, Tone.now());
            synth.triggerAttackRelease(2000, 0.15);
            setTimeout(() => synth.dispose(), 300);
        }));
        // Magic cast - mystical shimmer
        this.soundLibrary.set('magic-cast', oneShot(() => {
            const synth = new Tone.PolySynth(Tone.Synth).connect(this.sfxGain);
            synth.set({
                oscillator: { type: 'sine' },
                envelope: { attack: 0.05, decay: 0.3, sustain: 0.1, release: 0.4 },
            });
            synth.volume.value = -6;
            synth.triggerAttackRelease(['C5', 'E5', 'G5'], 0.2, Tone.now());
            synth.triggerAttackRelease(['D5', 'F#5', 'A5'], 0.2, Tone.now() + 0.1);
            synth.triggerAttackRelease(['E5', 'G#5', 'B5'], 0.3, Tone.now() + 0.2);
            setTimeout(() => synth.dispose(), 800);
        }));
        // Shield block - metallic clang
        this.soundLibrary.set('shield-block', oneShot(() => {
            const metal = new Tone.MetalSynth({
                envelope: { attack: 0.001, decay: 0.15, release: 0.1 },
                harmonicity: 5.1,
                modulationIndex: 32,
                resonance: 4000,
                octaves: 1.5,
            }).connect(this.sfxGain);
            metal.frequency.value = 200;
            metal.volume.value = -8;
            metal.triggerAttackRelease(0.15, Tone.now());
            setTimeout(() => metal.dispose(), 400);
        }));
        // Critical hit - impactful strike
        this.soundLibrary.set('critical-hit', oneShot(() => {
            const noise = new Tone.NoiseSynth({
                noise: { type: 'white' },
                envelope: { attack: 0.001, decay: 0.08, sustain: 0, release: 0.05 },
            }).connect(this.sfxGain);
            const synth = new Tone.Synth({
                oscillator: { type: 'sawtooth' },
                envelope: { attack: 0.001, decay: 0.2, sustain: 0, release: 0.1 },
            }).connect(this.sfxGain);
            synth.volume.value = -6;
            noise.triggerAttackRelease(0.08);
            synth.triggerAttackRelease('C3', 0.2);
            setTimeout(() => { noise.dispose(); synth.dispose(); }, 400);
        }));
        // Punch - impact thud
        this.soundLibrary.set('punch', oneShot(() => {
            const membrane = new Tone.MembraneSynth({
                pitchDecay: 0.05,
                octaves: 6,
                oscillator: { type: 'sine' },
                envelope: { attack: 0.001, decay: 0.15, sustain: 0, release: 0.1 },
            }).connect(this.sfxGain);
            membrane.volume.value = -4;
            membrane.triggerAttackRelease('C2', 0.15);
            setTimeout(() => membrane.dispose(), 300);
        }));
        // Slash - quick cut
        this.soundLibrary.set('slash', oneShot(() => {
            const noise = new Tone.NoiseSynth({
                noise: { type: 'white' },
                envelope: { attack: 0.001, decay: 0.06, sustain: 0, release: 0.03 },
            }).connect(this.sfxGain);
            const filter = new Tone.Filter(3000, 'highpass').connect(this.sfxGain);
            noise.connect(filter);
            noise.triggerAttackRelease(0.06);
            setTimeout(() => { noise.dispose(); filter.dispose(); }, 200);
        }));
        // Parry - defensive deflect
        this.soundLibrary.set('parry', oneShot(() => {
            const metal = new Tone.MetalSynth({
                envelope: { attack: 0.001, decay: 0.08, release: 0.05 },
                harmonicity: 3,
                modulationIndex: 16,
                resonance: 3000,
                octaves: 1,
            }).connect(this.sfxGain);
            metal.frequency.value = 400;
            metal.volume.value = -10;
            metal.triggerAttackRelease(0.08, Tone.now());
            setTimeout(() => metal.dispose(), 250);
        }));
        // Hit/damage (legacy)
        this.soundLibrary.set('hit', {
            synth: new Tone.NoiseSynth({
                noise: { type: 'white' },
                envelope: { attack: 0.01, decay: 0.05, sustain: 0, release: 0.05 },
            }).connect(this.sfxGain),
            pattern: () => {
                this.soundLibrary.get('hit').synth.triggerAttackRelease(0.05);
            },
        });
        // Laser (legacy)
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
        // Explosion (legacy)
        const explosionSynth = new Tone.NoiseSynth({
            noise: { type: 'pink' },
            envelope: { attack: 0.01, decay: 0.5, sustain: 0, release: 0.5 },
        }).connect(this.sfxGain);
        this.soundLibrary.set('explosion', {
            synth: explosionSynth,
            pattern: () => explosionSynth.triggerAttackRelease(0.5),
        });
        // ========================================
        // ITEM SOUNDS
        // ========================================
        // Pickup - collect item
        this.soundLibrary.set('pickup', oneShot(() => {
            const synth = new Tone.Synth({
                oscillator: { type: 'sine' },
                envelope: { attack: 0.01, decay: 0.1, sustain: 0.05, release: 0.1 },
            }).connect(this.sfxGain);
            synth.triggerAttackRelease('E5', 0.05, Tone.now());
            synth.triggerAttackRelease('A5', 0.1, Tone.now() + 0.05);
            setTimeout(() => synth.dispose(), 300);
        }));
        // Drop - item falls
        this.soundLibrary.set('drop', oneShot(() => {
            const synth = new Tone.Synth({
                oscillator: { type: 'triangle' },
                envelope: { attack: 0.01, decay: 0.15, sustain: 0, release: 0.1 },
            }).connect(this.sfxGain);
            synth.triggerAttackRelease('G4', 0.08, Tone.now());
            synth.triggerAttackRelease('D4', 0.12, Tone.now() + 0.08);
            setTimeout(() => synth.dispose(), 350);
        }));
        // Equip - gear on
        this.soundLibrary.set('equip', oneShot(() => {
            const metal = new Tone.MetalSynth({
                envelope: { attack: 0.001, decay: 0.1, release: 0.05 },
                harmonicity: 2,
                modulationIndex: 8,
                resonance: 2000,
                octaves: 1,
            }).connect(this.sfxGain);
            metal.frequency.value = 250;
            metal.volume.value = -12;
            metal.triggerAttackRelease(0.1, Tone.now());
            setTimeout(() => metal.dispose(), 300);
        }));
        // Potion drink - gulp
        this.soundLibrary.set('potion-drink', oneShot(() => {
            const synth = new Tone.Synth({
                oscillator: { type: 'sine' },
                envelope: { attack: 0.05, decay: 0.2, sustain: 0, release: 0.1 },
            }).connect(this.sfxGain);
            synth.volume.value = -8;
            synth.triggerAttackRelease('G3', 0.1, Tone.now());
            synth.triggerAttackRelease('C4', 0.1, Tone.now() + 0.12);
            synth.triggerAttackRelease('E4', 0.15, Tone.now() + 0.24);
            setTimeout(() => synth.dispose(), 600);
        }));
        // Chest open - creaky with sparkle
        this.soundLibrary.set('chest-open', oneShot(() => {
            const noise = new Tone.NoiseSynth({
                noise: { type: 'brown' },
                envelope: { attack: 0.1, decay: 0.3, sustain: 0, release: 0.2 },
            }).connect(this.sfxGain);
            const synth = new Tone.PolySynth(Tone.Synth).connect(this.sfxGain);
            synth.set({
                oscillator: { type: 'sine' },
                envelope: { attack: 0.1, decay: 0.2, sustain: 0.1, release: 0.3 },
            });
            synth.volume.value = -6;
            noise.volume.value = -15;
            noise.triggerAttackRelease(0.3);
            synth.triggerAttackRelease(['C5', 'E5', 'G5'], 0.3, Tone.now() + 0.2);
            setTimeout(() => { noise.dispose(); synth.dispose(); }, 800);
        }));
        // Key collect - jingle
        this.soundLibrary.set('key-collect', oneShot(() => {
            const metal = new Tone.MetalSynth({
                envelope: { attack: 0.001, decay: 0.15, release: 0.1 },
                harmonicity: 8,
                modulationIndex: 4,
                resonance: 5000,
                octaves: 0.5,
            }).connect(this.sfxGain);
            metal.frequency.value = 800;
            metal.volume.value = -10;
            metal.triggerAttackRelease(0.15, Tone.now());
            setTimeout(() => metal.dispose(), 400);
        }));
        // Gold collect - coin clink
        this.soundLibrary.set('gold-collect', oneShot(() => {
            const synth = new Tone.Synth({
                oscillator: { type: 'sine' },
                envelope: { attack: 0.001, decay: 0.08, sustain: 0.02, release: 0.08 },
            }).connect(this.sfxGain);
            synth.triggerAttackRelease('E6', 0.04, Tone.now());
            synth.triggerAttackRelease('A6', 0.08, Tone.now() + 0.04);
            setTimeout(() => synth.dispose(), 250);
        }));
        // Coin (legacy alias)
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
        // ========================================
        // MOVEMENT SOUNDS
        // ========================================
        // Footstep - soft step
        this.soundLibrary.set('footstep', {
            synth: new Tone.NoiseSynth({
                noise: { type: 'brown' },
                envelope: { attack: 0.001, decay: 0.04, sustain: 0, release: 0.02 },
            }).connect(this.sfxGain),
            pattern: () => {
                const synth = this.soundLibrary.get('footstep').synth;
                synth.volume.value = -18;
                synth.triggerAttackRelease(0.04);
            },
        });
        // Jump (legacy)
        this.soundLibrary.set('jump', {
            synth: new Tone.Synth({
                oscillator: { type: 'square' },
                envelope: { attack: 0.01, decay: 0.2, sustain: 0, release: 0.1 },
            }).connect(this.sfxGain),
            pattern: () => {
                this.soundLibrary.get('jump').synth.triggerAttackRelease('C5', '0.1');
            },
        });
        // Land - impact thud
        this.soundLibrary.set('land', oneShot(() => {
            const membrane = new Tone.MembraneSynth({
                pitchDecay: 0.02,
                octaves: 4,
                oscillator: { type: 'sine' },
                envelope: { attack: 0.001, decay: 0.1, sustain: 0, release: 0.05 },
            }).connect(this.sfxGain);
            membrane.volume.value = -10;
            membrane.triggerAttackRelease('G1', 0.1);
            setTimeout(() => membrane.dispose(), 250);
        }));
        // Dash - quick whoosh
        this.soundLibrary.set('dash', oneShot(() => {
            const noise = new Tone.NoiseSynth({
                noise: { type: 'white' },
                envelope: { attack: 0.01, decay: 0.1, sustain: 0, release: 0.05 },
            }).connect(this.sfxGain);
            const filter = new Tone.Filter(1000, 'bandpass').connect(this.sfxGain);
            noise.connect(filter);
            noise.volume.value = -8;
            filter.frequency.rampTo(3000, 0.08);
            noise.triggerAttackRelease(0.1);
            setTimeout(() => { noise.dispose(); filter.dispose(); }, 250);
        }));
        // Teleport - sci-fi warp
        this.soundLibrary.set('teleport', oneShot(() => {
            const synth = new Tone.Synth({
                oscillator: { type: 'sine' },
                envelope: { attack: 0.05, decay: 0.3, sustain: 0, release: 0.2 },
            }).connect(this.sfxGain);
            synth.frequency.setValueAtTime(200, Tone.now());
            synth.frequency.exponentialRampTo(2000, 0.2, Tone.now());
            synth.triggerAttackRelease(200, 0.3);
            setTimeout(() => synth.dispose(), 600);
        }));
        // Swim - water splash
        this.soundLibrary.set('swim', oneShot(() => {
            const noise = new Tone.NoiseSynth({
                noise: { type: 'pink' },
                envelope: { attack: 0.02, decay: 0.15, sustain: 0, release: 0.1 },
            }).connect(this.sfxGain);
            const filter = new Tone.Filter(600, 'lowpass').connect(this.sfxGain);
            noise.connect(filter);
            noise.volume.value = -12;
            noise.triggerAttackRelease(0.15);
            setTimeout(() => { noise.dispose(); filter.dispose(); }, 350);
        }));
        // Climb - grip sound
        this.soundLibrary.set('climb', {
            synth: new Tone.NoiseSynth({
                noise: { type: 'brown' },
                envelope: { attack: 0.01, decay: 0.06, sustain: 0, release: 0.03 },
            }).connect(this.sfxGain),
            pattern: () => {
                const synth = this.soundLibrary.get('climb').synth;
                synth.volume.value = -15;
                synth.triggerAttackRelease(0.06);
            },
        });
        // ========================================
        // ENVIRONMENT SOUNDS
        // ========================================
        // Door open - creaky
        this.soundLibrary.set('door-open', oneShot(() => {
            const synth = new Tone.Synth({
                oscillator: { type: 'sawtooth' },
                envelope: { attack: 0.1, decay: 0.4, sustain: 0, release: 0.2 },
            }).connect(this.sfxGain);
            synth.volume.value = -15;
            synth.frequency.setValueAtTime(80, Tone.now());
            synth.frequency.linearRampTo(120, 0.3, Tone.now());
            synth.triggerAttackRelease(80, 0.4);
            setTimeout(() => synth.dispose(), 700);
        }));
        // Door close - thud
        this.soundLibrary.set('door-close', oneShot(() => {
            const membrane = new Tone.MembraneSynth({
                pitchDecay: 0.03,
                octaves: 3,
                oscillator: { type: 'sine' },
                envelope: { attack: 0.001, decay: 0.2, sustain: 0, release: 0.1 },
            }).connect(this.sfxGain);
            membrane.volume.value = -8;
            membrane.triggerAttackRelease('E1', 0.2);
            setTimeout(() => membrane.dispose(), 400);
        }));
        // Switch - mechanical click
        this.soundLibrary.set('switch', oneShot(() => {
            const synth = new Tone.Synth({
                oscillator: { type: 'square' },
                envelope: { attack: 0.001, decay: 0.02, sustain: 0, release: 0.01 },
            }).connect(this.sfxGain);
            const noise = new Tone.NoiseSynth({
                noise: { type: 'white' },
                envelope: { attack: 0.001, decay: 0.02, sustain: 0, release: 0.01 },
            }).connect(this.sfxGain);
            synth.volume.value = -8;
            noise.volume.value = -12;
            synth.triggerAttackRelease('C6', 0.02);
            noise.triggerAttackRelease(0.02);
            setTimeout(() => { synth.dispose(); noise.dispose(); }, 150);
        }));
        // Alarm - warning siren
        this.soundLibrary.set('alarm', oneShot(() => {
            const synth = new Tone.Synth({
                oscillator: { type: 'square' },
                envelope: { attack: 0.01, decay: 0.1, sustain: 0.8, release: 0.1 },
            }).connect(this.sfxGain);
            synth.volume.value = -6;
            synth.triggerAttackRelease('A4', 0.15, Tone.now());
            synth.triggerAttackRelease('E5', 0.15, Tone.now() + 0.15);
            synth.triggerAttackRelease('A4', 0.15, Tone.now() + 0.3);
            synth.triggerAttackRelease('E5', 0.15, Tone.now() + 0.45);
            setTimeout(() => synth.dispose(), 800);
        }));
        // ========================================
        // CARD/CASINO SOUNDS
        // ========================================
        // Card deal - quick snap
        this.soundLibrary.set('card-deal', oneShot(() => {
            const noise = new Tone.NoiseSynth({
                noise: { type: 'white' },
                envelope: { attack: 0.001, decay: 0.04, sustain: 0, release: 0.02 },
            }).connect(this.sfxGain);
            const filter = new Tone.Filter(2000, 'highpass').connect(this.sfxGain);
            noise.connect(filter);
            noise.triggerAttackRelease(0.04);
            setTimeout(() => { noise.dispose(); filter.dispose(); }, 150);
        }));
        // Card flip - layered snap
        this.soundLibrary.set('card-flip', oneShot(() => {
            const noise = new Tone.NoiseSynth({
                noise: { type: 'white' },
                envelope: { attack: 0.001, decay: 0.08, sustain: 0, release: 0.03 },
            }).connect(this.sfxGain);
            const synth = new Tone.Synth({
                oscillator: { type: 'triangle' },
                envelope: { attack: 0.001, decay: 0.05, sustain: 0, release: 0.02 },
            }).connect(this.sfxGain);
            synth.volume.value = -12;
            noise.triggerAttackRelease(0.08);
            synth.triggerAttackRelease(800 + Math.random() * 200, 0.05);
            setTimeout(() => { noise.dispose(); synth.dispose(); }, 200);
        }));
        // Card shuffle - multiple snaps
        this.soundLibrary.set('card-shuffle', oneShot(() => {
            const noise = new Tone.NoiseSynth({
                noise: { type: 'pink' },
                envelope: { attack: 0.001, decay: 0.02, sustain: 0, release: 0.01 },
            }).connect(this.sfxGain);
            const filter = new Tone.Filter(3000, 'lowpass').connect(this.sfxGain);
            noise.connect(filter);
            for (let i = 0; i < 8; i++) {
                setTimeout(() => {
                    filter.frequency.value = 2000 + Math.random() * 2000;
                    noise.triggerAttackRelease(0.02);
                }, i * 25 + Math.random() * 10);
            }
            setTimeout(() => { noise.dispose(); filter.dispose(); }, 350);
        }));
        // Card flap (legacy)
        const flapSynth = new Tone.NoiseSynth({
            noise: { type: 'white' },
            envelope: { attack: 0.001, decay: 0.12, sustain: 0, release: 0.02 },
        }).connect(this.sfxGain);
        this.soundLibrary.set('card-flap', {
            synth: flapSynth,
            pattern: () => flapSynth.triggerAttackRelease(0.12),
        });
        // Chips bet - ceramic click
        this.soundLibrary.set('chips-bet', oneShot(() => {
            const metal = new Tone.MetalSynth({
                envelope: { attack: 0.001, decay: 0.08, release: 0.05 },
                harmonicity: 3.1,
                modulationIndex: 8,
                resonance: 2000,
                octaves: 1,
            }).connect(this.sfxGain);
            metal.frequency.value = 300;
            metal.volume.value = -8;
            metal.triggerAttackRelease(0.08, Tone.now());
            setTimeout(() => metal.dispose(), 250);
        }));
        // Chips win - cascading
        this.soundLibrary.set('chips-win', oneShot(() => {
            for (let i = 0; i < 6; i++) {
                setTimeout(() => {
                    const metal = new Tone.MetalSynth({
                        envelope: { attack: 0.001, decay: 0.1, release: 0.08 },
                        harmonicity: 2.5 + Math.random(),
                        modulationIndex: 6,
                        resonance: 1500 + Math.random() * 1000,
                        octaves: 1,
                    }).connect(this.sfxGain);
                    metal.frequency.value = 250 + Math.random() * 150;
                    metal.volume.value = -10;
                    metal.triggerAttackRelease(0.1, Tone.now());
                    setTimeout(() => metal.dispose(), 300);
                }, i * 50 + Math.random() * 30);
            }
        }));
        // Chips pot - single chip
        this.soundLibrary.set('chips-pot', oneShot(() => {
            const metal = new Tone.MetalSynth({
                envelope: { attack: 0.001, decay: 0.12, release: 0.06 },
                harmonicity: 2.8,
                modulationIndex: 10,
                resonance: 1800,
                octaves: 1.2,
            }).connect(this.sfxGain);
            metal.frequency.value = 280;
            metal.volume.value = -6;
            metal.triggerAttackRelease(0.12, Tone.now());
            setTimeout(() => metal.dispose(), 300);
        }));
        // Dice roll - rattling
        this.soundLibrary.set('dice-roll', oneShot(() => {
            const noise = new Tone.NoiseSynth({
                noise: { type: 'white' },
                envelope: { attack: 0.001, decay: 0.03, sustain: 0, release: 0.02 },
            }).connect(this.sfxGain);
            noise.volume.value = -10;
            for (let i = 0; i < 12; i++) {
                setTimeout(() => noise.triggerAttackRelease(0.03), i * 30 + Math.random() * 15);
            }
            setTimeout(() => noise.dispose(), 500);
        }));
        // Slot spin - mechanical whir
        this.soundLibrary.set('slot-spin', oneShot(() => {
            const synth = new Tone.Synth({
                oscillator: { type: 'sawtooth' },
                envelope: { attack: 0.1, decay: 0.5, sustain: 0.3, release: 0.3 },
            }).connect(this.sfxGain);
            synth.volume.value = -15;
            synth.frequency.setValueAtTime(100, Tone.now());
            synth.frequency.exponentialRampTo(300, 0.3, Tone.now());
            synth.frequency.exponentialRampTo(80, 0.5, Tone.now() + 0.5);
            synth.triggerAttackRelease(100, 1.0);
            setTimeout(() => synth.dispose(), 1500);
        }));
        // Jackpot - celebratory
        this.soundLibrary.set('jackpot', oneShot(() => {
            const synth = new Tone.PolySynth(Tone.Synth).connect(this.sfxGain);
            synth.set({
                oscillator: { type: 'square' },
                envelope: { attack: 0.01, decay: 0.15, sustain: 0.1, release: 0.2 },
            });
            synth.volume.value = -6;
            synth.triggerAttackRelease(['C5', 'E5'], 0.12, Tone.now());
            synth.triggerAttackRelease(['E5', 'G5'], 0.12, Tone.now() + 0.12);
            synth.triggerAttackRelease(['G5', 'C6'], 0.12, Tone.now() + 0.24);
            synth.triggerAttackRelease(['C5', 'E5', 'G5', 'C6'], 0.4, Tone.now() + 0.4);
            setTimeout(() => synth.dispose(), 1200);
        }));
        // ========================================
        // RETRO/CHIPTUNE SOUNDS
        // ========================================
        // Blip - classic beep
        this.soundLibrary.set('blip', {
            synth: new Tone.Synth({
                oscillator: { type: 'square' },
                envelope: { attack: 0.001, decay: 0.03, sustain: 0, release: 0.01 },
            }).connect(this.sfxGain),
            pattern: () => {
                this.soundLibrary.get('blip').synth.triggerAttackRelease('C5', 0.03);
            },
        });
        // Boop - lower beep
        this.soundLibrary.set('boop', {
            synth: new Tone.Synth({
                oscillator: { type: 'square' },
                envelope: { attack: 0.001, decay: 0.04, sustain: 0, release: 0.02 },
            }).connect(this.sfxGain),
            pattern: () => {
                this.soundLibrary.get('boop').synth.triggerAttackRelease('G3', 0.04);
            },
        });
        // Zap - electric
        this.soundLibrary.set('zap', oneShot(() => {
            const synth = new Tone.Synth({
                oscillator: { type: 'sawtooth' },
                envelope: { attack: 0.001, decay: 0.1, sustain: 0, release: 0.05 },
            }).connect(this.sfxGain);
            synth.frequency.setValueAtTime(1500, Tone.now());
            synth.frequency.exponentialRampTo(100, 0.1, Tone.now());
            synth.triggerAttackRelease(1500, 0.1);
            setTimeout(() => synth.dispose(), 250);
        }));
        // Warp - teleport whoosh
        this.soundLibrary.set('warp', oneShot(() => {
            const synth = new Tone.Synth({
                oscillator: { type: 'sine' },
                envelope: { attack: 0.02, decay: 0.25, sustain: 0, release: 0.1 },
            }).connect(this.sfxGain);
            synth.frequency.setValueAtTime(100, Tone.now());
            synth.frequency.exponentialRampTo(3000, 0.15, Tone.now());
            synth.frequency.exponentialRampTo(200, 0.1, Tone.now() + 0.15);
            synth.triggerAttackRelease(100, 0.25);
            setTimeout(() => synth.dispose(), 500);
        }));
        // 1up - extra life
        this.soundLibrary.set('1up', oneShot(() => {
            const synth = new Tone.Synth({
                oscillator: { type: 'square' },
                envelope: { attack: 0.01, decay: 0.1, sustain: 0.05, release: 0.1 },
            }).connect(this.sfxGain);
            synth.volume.value = -8;
            synth.triggerAttackRelease('E5', 0.08, Tone.now());
            synth.triggerAttackRelease('G5', 0.08, Tone.now() + 0.08);
            synth.triggerAttackRelease('E6', 0.08, Tone.now() + 0.16);
            synth.triggerAttackRelease('C6', 0.08, Tone.now() + 0.24);
            synth.triggerAttackRelease('D6', 0.08, Tone.now() + 0.32);
            synth.triggerAttackRelease('G6', 0.15, Tone.now() + 0.4);
            setTimeout(() => synth.dispose(), 800);
        }));
        // Death - game over
        this.soundLibrary.set('death', oneShot(() => {
            const synth = new Tone.Synth({
                oscillator: { type: 'square' },
                envelope: { attack: 0.01, decay: 0.2, sustain: 0.1, release: 0.3 },
            }).connect(this.sfxGain);
            synth.volume.value = -6;
            synth.triggerAttackRelease('B4', 0.15, Tone.now());
            synth.triggerAttackRelease('G4', 0.15, Tone.now() + 0.15);
            synth.triggerAttackRelease('E4', 0.15, Tone.now() + 0.3);
            synth.triggerAttackRelease('C4', 0.4, Tone.now() + 0.45);
            setTimeout(() => synth.dispose(), 1200);
        }));
        // Pause - game pause
        this.soundLibrary.set('pause', oneShot(() => {
            const synth = new Tone.Synth({
                oscillator: { type: 'square' },
                envelope: { attack: 0.01, decay: 0.08, sustain: 0, release: 0.05 },
            }).connect(this.sfxGain);
            synth.volume.value = -10;
            synth.triggerAttackRelease('E5', 0.06, Tone.now());
            synth.triggerAttackRelease('C5', 0.08, Tone.now() + 0.08);
            setTimeout(() => synth.dispose(), 250);
        }));
        // Unpause - resume
        this.soundLibrary.set('unpause', oneShot(() => {
            const synth = new Tone.Synth({
                oscillator: { type: 'square' },
                envelope: { attack: 0.01, decay: 0.08, sustain: 0, release: 0.05 },
            }).connect(this.sfxGain);
            synth.volume.value = -10;
            synth.triggerAttackRelease('C5', 0.06, Tone.now());
            synth.triggerAttackRelease('E5', 0.08, Tone.now() + 0.08);
            setTimeout(() => synth.dispose(), 250);
        }));
        // Select - menu selection
        this.soundLibrary.set('select', {
            synth: new Tone.Synth({
                oscillator: { type: 'square' },
                envelope: { attack: 0.001, decay: 0.05, sustain: 0, release: 0.02 },
            }).connect(this.sfxGain),
            pattern: () => {
                const synth = this.soundLibrary.get('select').synth;
                synth.volume.value = -10;
                synth.triggerAttackRelease('A4', 0.05);
            },
        });
        // Start - game start
        this.soundLibrary.set('start', oneShot(() => {
            const synth = new Tone.Synth({
                oscillator: { type: 'square' },
                envelope: { attack: 0.01, decay: 0.15, sustain: 0.1, release: 0.1 },
            }).connect(this.sfxGain);
            synth.volume.value = -8;
            synth.triggerAttackRelease('C4', 0.1, Tone.now());
            synth.triggerAttackRelease('G4', 0.1, Tone.now() + 0.1);
            synth.triggerAttackRelease('C5', 0.15, Tone.now() + 0.2);
            setTimeout(() => synth.dispose(), 500);
        }));
        // Powerup (legacy)
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
        // Gameover (legacy)
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
        // Level up - achievement
        this.soundLibrary.set('level-up', oneShot(() => {
            const synth = new Tone.Synth({
                oscillator: { type: 'square' },
                envelope: { attack: 0.01, decay: 0.1, sustain: 0.1, release: 0.15 },
            }).connect(this.sfxGain);
            synth.volume.value = -6;
            synth.triggerAttackRelease('C5', 0.08, Tone.now());
            synth.triggerAttackRelease('E5', 0.08, Tone.now() + 0.08);
            synth.triggerAttackRelease('G5', 0.08, Tone.now() + 0.16);
            synth.triggerAttackRelease('C6', 0.2, Tone.now() + 0.24);
            setTimeout(() => synth.dispose(), 700);
        }));
        // Countdown beep
        this.soundLibrary.set('countdown', {
            synth: new Tone.Synth({
                oscillator: { type: 'sine' },
                envelope: { attack: 0.01, decay: 0.15, sustain: 0, release: 0.1 },
            }).connect(this.sfxGain),
            pattern: () => {
                this.soundLibrary.get('countdown').synth.triggerAttackRelease('A4', 0.15);
            },
        });
        // Countdown go
        this.soundLibrary.set('countdown-go', oneShot(() => {
            const synth = new Tone.Synth({
                oscillator: { type: 'sine' },
                envelope: { attack: 0.01, decay: 0.3, sustain: 0.1, release: 0.2 },
            }).connect(this.sfxGain);
            synth.triggerAttackRelease('A5', 0.4);
            setTimeout(() => synth.dispose(), 700);
        }));
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
            if (entry.synth) {
                entry.synth.dispose();
            }
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
