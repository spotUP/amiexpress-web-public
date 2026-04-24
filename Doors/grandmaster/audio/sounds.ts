/**
 * Sound Engine
 *
 * Manages game audio and sound effects using tone.js
 * Plays authentic TGM3 sound samples via Socket.IO audio events
 */

import * as Tone from 'tone';

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
export type SoundEffect =
  // Basic gameplay
  | 'move'
  | 'rotate'
  | 'lock'
  | 'hold'
  | 'hard_drop'
  | 'soft_drop'
  | 'line_clear'
  | 'tetris'
  | 't_spin'
  | 'combo'
  // Initial systems
  | 'pre_rotate'
  | 'pre_hold'
  // Piece-specific spawn/lock (TGM3 SEB_mino1-7)
  | 'spawn_i' | 'spawn_j' | 'spawn_l' | 'spawn_o' | 'spawn_s' | 'spawn_t' | 'spawn_z'
  // Progress
  | 'level_up'      // Level increment
  | 'section_up'    // Section change (every 100)
  | 'grade_up'      // Rank increase
  | 'section_cool'  // COOL!!
  | 'section_regret' // REGRET!!
  // System
  | 'ready'
  | 'go'
  | 'countdown'
  | 'game_over'
  | 'game_clear'
  | 'menu_select'
  | 'menu_ok'
  | 'error'
  // Multiplayer/Special
  | 'garbage'
  | 'attack'
  | 'siren'
  | 'bell';

/**
 * Music tracks
 */
export type MusicTrack =
  | 'menu'
  | 'master_1' | 'master_2' | 'master_3' | 'master_4' | 'master_5' | 'master_6'
  | 'death'
  | 'credits'
  | 'credits_2'
  | 'game_over'
  | 'opening'
  | 'name_entry'
  | 'stats'
  | 'versus'
  | 'sakura';

/**
 * Voice samples
 */
export type VoiceSample =
  | 'excellent'
  | 'cool'
  | 'regret'
  | 'double'
  | 'triple'
  | 'tetris_voice'
  | 'combo'
  | 'perfect'
  | 'bravo';

/**
 * Mapping of internal effect names to original TGM3 filenames (now MP3)
 */
const SFX_MAP: Record<SoundEffect, string> = {
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
const BGM_MAP: Record<MusicTrack, string> = {
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
export class SoundEngine {
  private session: DoorSession;
  private sfxVolume: number = 1.0;
  private musicVolume: number = 0.8;
  private currentTrack: MusicTrack | null = null;
  private muted: boolean = false;
  private toneStarted: boolean = false;

  // Tone.js synthesizers for fallback
  private synth: Tone.Synth | null = null;
  private noiseSynth: Tone.NoiseSynth | null = null;

  constructor(session: DoorSession) {
    this.session = session;
    this.initializeTone();
  }

  /**
   * Initialize tone.js synthesizers
   */
  private initializeTone(): void {
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
    } catch (error) {
      // Tone.js not available in Node.js context - will use socket events only
      console.log('[SoundEngine] Tone.js synthesis not available, using socket events');
    }
  }

  /**
   * Start Tone.js audio context (required for browser)
   */
  async start(): Promise<void> {
    if (this.toneStarted) return;

    try {
      await Tone.start();
      this.toneStarted = true;
      console.log('[SoundEngine] Tone.js audio context started');
    } catch (error) {
      console.log('[SoundEngine] Could not start Tone.js:', error);
    }
  }

  /**
   * Play sound effect
   */
  playSfx(effect: SoundEffect): void {
    if (this.muted || this.sfxVolume === 0) return;

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
  private playSynthesizedSfx(effect: SoundEffect): void {
    if (!this.synth || !this.noiseSynth || !this.toneStarted) return;

    const now = Tone.now();
    const volume = this.sfxVolume;

    try {
      switch (effect) {
        case 'move':
        case 'spawn_i': case 'spawn_j': case 'spawn_l': case 'spawn_o':
        case 'spawn_s': case 'spawn_t': case 'spawn_z':
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
    } catch (error) {
      // Tone.js error, ignore
    }
  }

  /**
   * Play music track
   */
  playMusic(track: MusicTrack, loop: boolean = true): void {
    if (this.muted || this.musicVolume === 0) return;
    if (this.currentTrack === track) return;

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
  stopMusic(): void {
    this.currentTrack = null;

    if (this.session.socket) {
      this.session.socket.emit('audio:music:stop');
    }
  }

  /**
   * Play voice sample
   */
  playVoice(sample: VoiceSample): void {
    if (this.muted || this.sfxVolume === 0) return;

    // Emit socket event for BBS frontend
    if (this.session.socket) {
      this.session.socket.emit('audio:voice', {
        sample,
        volume: this.sfxVolume,
        file: `/api/doors/grandmaster/assets/voices/${sample}.mp3`
      });
    }

    console.log(`[Voice] ${sample} (volume: ${this.sfxVolume})`);
  }

  /**
   * Update Master mode music based on level
   */
  updateMasterMusic(level: number): void {
    let track: MusicTrack = 'master_1';
    
    if (level >= 900) track = 'master_6';
    else if (level >= 800) track = 'master_5';
    else if (level >= 600) track = 'master_4';
    else if (level >= 400) track = 'master_3';
    else if (level >= 200) track = 'master_2';
    
    this.playMusic(track);
  }

  /**
   * Set SFX volume (0.0 to 1.0)
   */
  setSfxVolume(volume: number): void {
    this.sfxVolume = Math.max(0, Math.min(1, volume));
  }

  /**
   * Set music volume (0.0 to 1.0)
   */
  setMusicVolume(volume: number): void {
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
  setMuted(muted: boolean): void {
    this.muted = muted;
    if (muted) {
      this.stopMusic();
    }
  }

  /**
   * Get current volumes
   */
  getVolumes(): { sfx: number; music: number } {
    return {
      sfx: this.sfxVolume,
      music: this.musicVolume,
    };
  }

  /**
   * Clean up resources
   */
  destroy(): void {
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