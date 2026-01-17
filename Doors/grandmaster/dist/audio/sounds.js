"use strict";
/**
 * Sound Engine
 *
 * Manages game audio and sound effects using tone.js
 * Plays authentic TGM3 sound samples via Socket.IO audio events
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
exports.SoundEngine = void 0;
const Tone = __importStar(require("tone"));
/**
 * Mapping of internal effect names to original TGM3 filenames (now MP3)
 */
const SFX_MAP = {
    move: 'SEB_fall.mp3',
    rotate: 'SEB_mino1.mp3',
    lock: 'SEB_fixa.mp3',
    hold: 'SEB_hold.mp3',
    hard_drop: 'SEB_instal.mp3',
    soft_drop: 'SEB_fall.mp3',
    line_clear: 'KIE01.mp3',
    tetris: 'SEP_tetris.mp3',
    t_spin: 'SEP_t_spin.mp3',
    combo: 'SEP_combo.mp3',
    pre_rotate: 'SEB_prerotate.mp3',
    pre_hold: 'SEB_prehold.mp3',
    spawn_i: 'SEB_mino1.mp3',
    spawn_j: 'SEB_mino2.mp3',
    spawn_l: 'SEB_mino3.mp3',
    spawn_o: 'SEB_mino4.mp3',
    spawn_s: 'SEB_mino5.mp3',
    spawn_t: 'SEB_mino6.mp3',
    spawn_z: 'SEB_mino7.mp3',
    level_up: 'SEB_fall.mp3',
    section_up: 'SEP_levelchange.mp3',
    grade_up: 'SEP_lankup.mp3',
    section_cool: 'SEP_cool.mp3',
    section_regret: 'SEP_booing.mp3',
    ready: 'ready.mp3',
    go: 'go.mp3',
    countdown: 'SEP_timecount.mp3',
    game_over: 'SEP_gameover.mp3',
    game_clear: 'SEP_gameclear.mp3',
    menu_select: 'SEI_name_select.mp3',
    menu_ok: 'SEI_mode_ok.mp3',
    error: 'SEI_data_error.mp3',
    garbage: 'SEP_atack.mp3',
    attack: 'SEP_lasershot.mp3',
    siren: 'SEP_siren.mp3',
    bell: 'bell.mp3',
};
/**
 * Mapping of music tracks to MP3 files
 */
const BGM_MAP = {
    menu: 'BGM_mode_select.mp3',
    master_1: 'BGM_1p_lv1.mp3', // 0-199
    master_2: 'BGM_1p_lv2.mp3', // 200-399
    master_3: 'BGM_1p_lv3.mp3', // 400-599
    master_4: 'BGM_1p_lv4.mp3', // 600-799
    master_5: 'BGM_1p_lv5.mp3', // 800-899
    master_6: 'BGM_1p_lv6.mp3', // 900-999
    death: 'BGM_1p_lv6.mp3',
    credits: 'BGM_ending.mp3',
    credits_2: 'BGM_ending2.mp3',
    game_over: 'BGM_result.mp3',
    opening: 'BGM_opening.mp3',
    name_entry: 'BGM_name.mp3',
    stats: 'BGM_player_data.mp3',
    versus: 'BGM_vs_game.mp3',
    sakura: 'BGM_sakura_nomal.mp3',
};
/**
 * Sound engine for TGM3-style audio
 */
class SoundEngine {
    constructor(session) {
        this.sfxVolume = 1.0;
        this.musicVolume = 0.8;
        this.currentTrack = null;
        this.muted = false;
        this.toneStarted = false;
        // Tone.js synthesizers for fallback
        this.synth = null;
        this.noiseSynth = null;
        this.session = session;
        this.initializeTone();
    }
    /**
     * Initialize tone.js synthesizers
     */
    initializeTone() {
        try {
            // Create synthesizers for fallback sounds
            this.synth = new Tone.Synth({
                oscillator: { type: 'square' },
                envelope: { attack: 0.005, decay: 0.1, sustain: 0, release: 0.1 }
            }).toDestination();
            this.noiseSynth = new Tone.NoiseSynth({
                noise: { type: 'white' },
                envelope: { attack: 0.005, decay: 0.1, sustain: 0, release: 0.05 }
            }).toDestination();
        }
        catch (error) {
            // Tone.js not available in Node.js context - will use socket events only
            console.log('[SoundEngine] Tone.js synthesis not available, using socket events');
        }
    }
    /**
     * Start Tone.js audio context (required for browser)
     */
    async start() {
        if (this.toneStarted)
            return;
        try {
            await Tone.start();
            this.toneStarted = true;
            console.log('[SoundEngine] Tone.js audio context started');
        }
        catch (error) {
            console.log('[SoundEngine] Could not start Tone.js:', error);
        }
    }
    /**
     * Play sound effect
     */
    playSfx(effect) {
        if (this.muted || this.sfxVolume === 0)
            return;
        const filename = SFX_MAP[effect] || `${effect}.mp3`;
        // Emit socket event for BBS frontend to play the sound
        if (this.session.socket) {
            this.session.socket.emit('audio:sfx', {
                effect,
                volume: this.sfxVolume,
                file: `/api/doors/grandmaster/assets/sounds/${filename}`
            });
        }
        // Also play tone.js approximation as fallback
        this.playSynthesizedSfx(effect);
    }
    /**
     * Play synthesized sound effect using tone.js
     */
    playSynthesizedSfx(effect) {
        if (!this.synth || !this.noiseSynth || !this.toneStarted)
            return;
        const now = Tone.now();
        const volume = this.sfxVolume;
        try {
            switch (effect) {
                case 'move':
                case 'spawn_i':
                case 'spawn_j':
                case 'spawn_l':
                case 'spawn_o':
                case 'spawn_s':
                case 'spawn_t':
                case 'spawn_z':
                    // Quick chirp
                    this.synth.volume.value = Tone.gainToDb(volume * 0.3);
                    this.synth.triggerAttackRelease('C6', '0.03', now);
                    break;
                case 'rotate':
                    // Higher pitched blip
                    this.synth.volume.value = Tone.gainToDb(volume * 0.4);
                    this.synth.triggerAttackRelease('E6', '0.05', now);
                    break;
                case 'lock':
                    // Solid thunk
                    this.noiseSynth.volume.value = Tone.gainToDb(volume * 0.5);
                    this.noiseSynth.triggerAttackRelease('0.05', now);
                    break;
                case 'hard_drop':
                    // Deep thud
                    this.synth.volume.value = Tone.gainToDb(volume * 0.6);
                    this.synth.triggerAttackRelease('C3', '0.1', now);
                    break;
                case 'hold':
                case 'pre_hold':
                    // Soft whoosh
                    this.noiseSynth.volume.value = Tone.gainToDb(volume * 0.4);
                    this.noiseSynth.triggerAttackRelease('0.08', now);
                    break;
                case 'line_clear':
                    // Rising tone
                    this.synth.volume.value = Tone.gainToDb(volume * 0.5);
                    this.synth.triggerAttackRelease('G5', '0.15', now);
                    this.synth.triggerAttackRelease('C6', '0.15', now + 0.05);
                    break;
                case 'tetris':
                    // Triumphant chord sequence
                    this.synth.volume.value = Tone.gainToDb(volume * 0.6);
                    this.synth.triggerAttackRelease('C5', '0.1', now);
                    this.synth.triggerAttackRelease('E5', '0.1', now + 0.05);
                    this.synth.triggerAttackRelease('G5', '0.1', now + 0.1);
                    this.synth.triggerAttackRelease('C6', '0.2', now + 0.15);
                    break;
                case 'section_up':
                case 'level_up':
                    // Ascending arpeggio
                    this.synth.volume.value = Tone.gainToDb(volume * 0.5);
                    this.synth.triggerAttackRelease('C5', '0.08', now);
                    this.synth.triggerAttackRelease('E5', '0.08', now + 0.06);
                    this.synth.triggerAttackRelease('G5', '0.08', now + 0.12);
                    break;
                case 'grade_up':
                    // Epic fanfare
                    this.synth.volume.value = Tone.gainToDb(volume * 0.7);
                    this.synth.triggerAttackRelease('C5', '0.15', now);
                    this.synth.triggerAttackRelease('G5', '0.15', now + 0.1);
                    this.synth.triggerAttackRelease('C6', '0.3', now + 0.2);
                    break;
                case 'section_cool':
                    // Success chime
                    this.synth.volume.value = Tone.gainToDb(volume * 0.6);
                    this.synth.triggerAttackRelease('G5', '0.1', now);
                    this.synth.triggerAttackRelease('C6', '0.2', now + 0.08);
                    break;
                case 'section_regret':
                    // Warning siren
                    this.synth.volume.value = Tone.gainToDb(volume * 0.5);
                    this.synth.triggerAttackRelease('F5', '0.1', now);
                    this.synth.triggerAttackRelease('D5', '0.1', now + 0.1);
                    break;
                case 'game_over':
                    // Descending failure tone
                    this.synth.volume.value = Tone.gainToDb(volume * 0.6);
                    this.synth.triggerAttackRelease('C5', '0.2', now);
                    this.synth.triggerAttackRelease('G4', '0.2', now + 0.15);
                    this.synth.triggerAttackRelease('C4', '0.4', now + 0.3);
                    break;
                case 'ready':
                    // Anticipation tone
                    this.synth.volume.value = Tone.gainToDb(volume * 0.5);
                    this.synth.triggerAttackRelease('E5', '0.2', now);
                    break;
                case 'go':
                    // Start tone
                    this.synth.volume.value = Tone.gainToDb(volume * 0.6);
                    this.synth.triggerAttackRelease('C6', '0.3', now);
                    break;
                case 'countdown':
                    // Tick
                    this.synth.volume.value = Tone.gainToDb(volume * 0.4);
                    this.synth.triggerAttackRelease('G5', '0.05', now);
                    break;
                case 'menu_select':
                case 'menu_ok':
                    // UI blip
                    this.synth.volume.value = Tone.gainToDb(volume * 0.3);
                    this.synth.triggerAttackRelease('C5', '0.05', now);
                    break;
                case 'error':
                    // Error buzz
                    this.synth.volume.value = Tone.gainToDb(volume * 0.5);
                    this.synth.triggerAttackRelease('F4', '0.1', now);
                    this.synth.triggerAttackRelease('E4', '0.1', now + 0.1);
                    break;
                case 'garbage':
                    // Incoming attack warning
                    this.noiseSynth.volume.value = Tone.gainToDb(volume * 0.6);
                    this.noiseSynth.triggerAttackRelease('0.1', now);
                    break;
                case 'attack':
                    // Outgoing attack
                    this.synth.volume.value = Tone.gainToDb(volume * 0.5);
                    this.synth.triggerAttackRelease('G5', '0.08', now);
                    this.synth.triggerAttackRelease('C6', '0.08', now + 0.06);
                    break;
                default:
                    // Generic beep
                    this.synth.volume.value = Tone.gainToDb(volume * 0.3);
                    this.synth.triggerAttackRelease('C5', '0.05', now);
            }
        }
        catch (error) {
            // Tone.js error, ignore
        }
    }
    /**
     * Play music track
     */
    playMusic(track, loop = true) {
        if (this.muted || this.musicVolume === 0)
            return;
        if (this.currentTrack === track)
            return;
        this.currentTrack = track;
        const filename = BGM_MAP[track] || `${track}.mp3`;
        // Emit socket event for BBS frontend
        if (this.session.socket) {
            this.session.socket.emit('audio:music', {
                track,
                loop,
                volume: this.musicVolume,
                file: `/api/doors/grandmaster/assets/music/${filename}`
            });
        }
        console.log(`[Music] ${track} (loop: ${loop}, volume: ${this.musicVolume})`);
    }
    /**
     * Stop current music
     */
    stopMusic() {
        this.currentTrack = null;
        if (this.session.socket) {
            this.session.socket.emit('audio:music:stop');
        }
    }
    /**
     * Play voice sample
     */
    playVoice(sample) {
        if (this.muted || this.sfxVolume === 0)
            return;
        // Emit socket event for BBS frontend
        if (this.session.socket) {
            this.session.socket.emit('audio:voice', {
                sample,
                volume: this.sfxVolume,
                file: `/api/doors/grandmaster/assets/voices/${sample}.wav`
            });
        }
        console.log(`[Voice] ${sample} (volume: ${this.sfxVolume})`);
    }
    /**
     * Update Master mode music based on level
     */
    updateMasterMusic(level) {
        let track = 'master_1';
        if (level >= 900)
            track = 'master_6';
        else if (level >= 800)
            track = 'master_5';
        else if (level >= 600)
            track = 'master_4';
        else if (level >= 400)
            track = 'master_3';
        else if (level >= 200)
            track = 'master_2';
        this.playMusic(track);
    }
    /**
     * Set SFX volume (0.0 to 1.0)
     */
    setSfxVolume(volume) {
        this.sfxVolume = Math.max(0, Math.min(1, volume));
    }
    /**
     * Set music volume (0.0 to 1.0)
     */
    setMusicVolume(volume) {
        this.musicVolume = Math.max(0, Math.min(1, volume));
        // Update current playing track volume
        if (this.currentTrack && this.session.socket) {
            this.session.socket.emit('audio:music:volume', {
                volume: this.musicVolume
            });
        }
    }
    /**
     * Mute/unmute all audio
     */
    setMuted(muted) {
        this.muted = muted;
        if (muted) {
            this.stopMusic();
        }
    }
    /**
     * Get current volumes
     */
    getVolumes() {
        return {
            sfx: this.sfxVolume,
            music: this.musicVolume,
        };
    }
    /**
     * Clean up resources
     */
    destroy() {
        this.stopMusic();
        if (this.synth) {
            this.synth.dispose();
            this.synth = null;
        }
        if (this.noiseSynth) {
            this.noiseSynth.dispose();
            this.noiseSynth = null;
        }
    }
}
exports.SoundEngine = SoundEngine;
//# sourceMappingURL=sounds.js.map