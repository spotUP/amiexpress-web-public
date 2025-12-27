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
 * Sound effect types
 */
export type SoundEffect =
  | 'move'
  | 'rotate'
  | 'lock'
  | 'line_clear'
  | 'tetris'
  | 'hold'
  | 'hard_drop'
  | 'level_up'
  | 'grade_up'
  | 'section_cool'
  | 'section_regret'
  | 'game_over'
  | 'ready'
  | 'go'
  | 'countdown'
  | 'menu_select'
  | 'error'
  | 'garbage'
  | 'attack';

/**
 * Music tracks
 */
export type MusicTrack =
  | 'menu'
  | 'master'
  | 'death'
  | 'credits'
  | 'game_over';

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

    // Emit socket event for BBS frontend to play the sound
    if (this.session.socket) {
      this.session.socket.emit('audio:sfx', {
        effect,
        volume: this.sfxVolume,
        file: `/doors/grandmaster/sounds/${effect}.wav`
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

    // Emit socket event for BBS frontend
    if (this.session.socket) {
      this.session.socket.emit('audio:music', {
        track,
        loop,
        volume: this.musicVolume,
        file: `/doors/grandmaster/music/${track}.mod`
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
        file: `/doors/grandmaster/voices/${sample}.wav`
      });
    }

    console.log(`[Voice] ${sample} (volume: ${this.sfxVolume})`);
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
