/**
 * Sound Engine
 *
 * Manages game audio and sound effects using tone.js
 * Plays authentic TGM3 sound samples via Socket.IO audio events
 */
/**
 * Door session interface
 */
interface DoorSession {
    socket: any;
    user: any;
    bbsSession: any;
    bbs: any;
    params?: string[];
    args?: string[];
}
/**
 * Sound effect types (mapped to TGM3 filenames)
 */
export type SoundEffect = 'move' | 'rotate' | 'lock' | 'hold' | 'hard_drop' | 'soft_drop' | 'line_clear' | 'tetris' | 't_spin' | 'combo' | 'pre_rotate' | 'pre_hold' | 'spawn_i' | 'spawn_j' | 'spawn_l' | 'spawn_o' | 'spawn_s' | 'spawn_t' | 'spawn_z' | 'level_up' | 'section_up' | 'grade_up' | 'section_cool' | 'section_regret' | 'ready' | 'go' | 'countdown' | 'game_over' | 'game_clear' | 'menu_select' | 'menu_ok' | 'error' | 'garbage' | 'attack' | 'siren' | 'bell';
/**
 * Music tracks
 */
export type MusicTrack = 'menu' | 'master_1' | 'master_2' | 'master_3' | 'master_4' | 'master_5' | 'master_6' | 'death' | 'credits' | 'credits_2' | 'game_over' | 'opening' | 'name_entry' | 'stats' | 'versus' | 'sakura';
/**
 * Voice samples
 */
export type VoiceSample = 'excellent' | 'cool' | 'regret' | 'double' | 'triple' | 'tetris_voice' | 'combo' | 'perfect' | 'bravo';
/**
 * Sound engine for TGM3-style audio
 */
export declare class SoundEngine {
    private session;
    private sfxVolume;
    private musicVolume;
    private currentTrack;
    private muted;
    private toneStarted;
    private synth;
    private noiseSynth;
    constructor(session: DoorSession);
    /**
     * Initialize tone.js synthesizers
     */
    private initializeTone;
    /**
     * Start Tone.js audio context (required for browser)
     */
    start(): Promise<void>;
    /**
     * Play sound effect
     */
    playSfx(effect: SoundEffect): void;
    /**
     * Play synthesized sound effect using tone.js
     */
    private playSynthesizedSfx;
    /**
     * Play music track
     */
    playMusic(track: MusicTrack, loop?: boolean): void;
    /**
     * Stop current music
     */
    stopMusic(): void;
    /**
     * Play voice sample
     */
    playVoice(sample: VoiceSample): void;
    /**
     * Update Master mode music based on level
     */
    updateMasterMusic(level: number): void;
    /**
     * Set SFX volume (0.0 to 1.0)
     */
    setSfxVolume(volume: number): void;
    /**
     * Set music volume (0.0 to 1.0)
     */
    setMusicVolume(volume: number): void;
    /**
     * Mute/unmute all audio
     */
    setMuted(muted: boolean): void;
    /**
     * Get current volumes
     */
    getVolumes(): {
        sfx: number;
        music: number;
    };
    /**
     * Clean up resources
     */
    destroy(): void;
}
export {};
//# sourceMappingURL=sounds.d.ts.map