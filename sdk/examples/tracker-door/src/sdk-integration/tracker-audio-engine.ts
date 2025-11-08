/**
 * TrackerDoor SDK Integration
 * Seamless integration with AmiExpress Door SDK for game music
 */

import { Song, Pattern, Instrument, Note } from '../data/types';
import * as Tone from 'tone';

/**
 * TrackerDoor Audio Engine for SDK Games
 * Extends the Door SDK audio engine with tracker music playback
 */
export class TrackerAudioEngine {
  private song: Song | null = null;
  private currentPattern: number = 0;
  private currentRow: number = 0;
  private isPlaying: boolean = false;
  private loopEnabled: boolean = true;
  private masterGain: Tone.Gain;
  private channelGains: Tone.Gain[] = [];
  private channelSynths: Map<number, Tone.Synth | Tone.Sampler>[] = [];
  private playbackInterval: NodeJS.Timeout | null = null;

  constructor(masterGain?: Tone.Gain) {
    this.masterGain = masterGain || new Tone.Gain(0.7).toDestination();
  }

  /**
   * Load a TrackerDoor song
   */
  async loadSong(song: Song): Promise<void> {
    this.stop();
    this.song = song;
    this.currentPattern = 0;
    this.currentRow = 0;

    // Set up channels
    this.channelGains = [];
    this.channelSynths = [];

    for (let i = 0; i < song.channels; i++) {
      const gain = new Tone.Gain(1.0).connect(this.masterGain);
      this.channelGains.push(gain);
      this.channelSynths.push(new Map());
    }

    // Initialize instruments
    await this.initializeInstruments();

    // Set tempo
    Tone.Transport.bpm.value = song.bpm || 125;
  }

  /**
   * Load song from JSON file
   */
  async loadSongFromFile(filepath: string): Promise<void> {
    const fs = await import('fs');
    const data = JSON.parse(fs.readFileSync(filepath, 'utf8'));
    await this.loadSong(this.deserializeSong(data));
  }

  /**
   * Load song from SDK-optimized format
   */
  async loadFromSDKFormat(data: SDKMusicData): Promise<void> {
    const song: Song = {
      title: data.title,
      artist: data.artist,
      comments: data.comments || '',
      bpm: data.bpm,
      ticksPerRow: data.ticksPerRow,
      channels: data.channels,
      patterns: data.patterns.map(p => ({
        id: p.id,
        name: p.name,
        rows: p.rows,
        channels: p.channels,
        data: new Map(p.notes)
      })),
      instruments: data.instruments,
      sequence: data.sequence,
      loopStart: data.loopStart,
      loopEnd: data.loopEnd
    };

    await this.loadSong(song);
  }

  /**
   * Initialize Tone.js instruments from song data
   */
  private async initializeInstruments(): Promise<void> {
    if (!this.song) return;

    for (const inst of this.song.instruments) {
      if (inst.type === 'sample' && inst.sample) {
        // Create sampler from sample data
        // (Simplified - in production would handle multisampling)
        const buffer = new Tone.ToneAudioBuffer();
        buffer.fromArray(inst.sample.data);

        // Sampler creation would go here
        // Tone.Sampler doesn't directly support Float32Array,
        // so we'd need to convert to AudioBuffer
      }
      // Synth instruments are created on-demand during playback
    }
  }

  /**
   * Start playback
   */
  play(): void {
    if (!this.song || this.isPlaying) return;

    this.isPlaying = true;
    const msPerRow = (60000 / (this.song.bpm || 125)) / (this.song.ticksPerRow || 6);

    this.playbackInterval = setInterval(() => {
      this.processRow();
    }, msPerRow);
  }

  /**
   * Stop playback
   */
  stop(): void {
    this.isPlaying = false;

    if (this.playbackInterval) {
      clearInterval(this.playbackInterval);
      this.playbackInterval = null;
    }

    // Stop all playing notes
    this.channelSynths.forEach(channelMap => {
      channelMap.forEach(synth => {
        if (synth instanceof Tone.Synth) {
          synth.triggerRelease();
        }
      });
    });
  }

  /**
   * Pause playback
   */
  pause(): void {
    this.isPlaying = false;
    if (this.playbackInterval) {
      clearInterval(this.playbackInterval);
      this.playbackInterval = null;
    }
  }

  /**
   * Process current row
   */
  private processRow(): void {
    if (!this.song || !this.isPlaying) return;

    const patternIndex = this.song.sequence[this.currentPattern];
    const pattern = this.song.patterns.find(p => p.id === patternIndex);

    if (!pattern) {
      this.nextPattern();
      return;
    }

    // Process each channel
    for (let ch = 0; ch < this.song.channels; ch++) {
      const key = `${this.currentRow}:${ch}`;
      const note = pattern.data.get(key);

      if (note) {
        this.playNote(ch, note);
      }
    }

    // Advance to next row
    this.currentRow++;
    if (this.currentRow >= pattern.rows) {
      this.nextPattern();
    }
  }

  /**
   * Play a note on a channel
   */
  private playNote(channel: number, note: Note): void {
    if (!this.song) return;

    // Get instrument
    const inst = this.song.instruments.find(i => i.id === note.instrument);
    if (!inst) return;

    // Stop previous note on this channel
    const channelMap = this.channelSynths[channel];
    channelMap.forEach(synth => {
      if (synth instanceof Tone.Synth) {
        synth.triggerRelease();
      }
    });
    channelMap.clear();

    // Handle note-off
    if (note.note === '---') return;
    if (note.note === '...') return;

    // Create synth based on instrument type
    let synth: Tone.Synth;

    if (inst.type === 'synth') {
      synth = new Tone.Synth({
        oscillator: {
          type: inst.oscillator?.type || 'sawtooth'
        },
        envelope: {
          attack: inst.envelope.attack,
          decay: inst.envelope.decay,
          sustain: inst.envelope.sustain,
          release: inst.envelope.release
        }
      }).connect(this.channelGains[channel]);

      // Apply detune if specified
      if (inst.oscillator?.detune) {
        synth.detune.value = inst.oscillator.detune;
      }

      // Apply volume
      if (note.volume !== 0x80) {
        synth.volume.value = Tone.gainToDb(note.volume / 64.0);
      }

      // Trigger note
      synth.triggerAttack(note.note);

      channelMap.set(0, synth);
    } else if (inst.type === 'sample' && inst.sample) {
      // Handle sample playback
      // (Simplified implementation)
      synth = new Tone.Synth().connect(this.channelGains[channel]);
      synth.triggerAttackRelease(note.note, '8n');
      channelMap.set(0, synth);
    }
  }

  /**
   * Advance to next pattern
   */
  private nextPattern(): void {
    if (!this.song) return;

    this.currentRow = 0;
    this.currentPattern++;

    if (this.currentPattern >= this.song.sequence.length) {
      if (this.loopEnabled) {
        this.currentPattern = this.song.loopStart || 0;
      } else {
        this.stop();
      }
    }
  }

  /**
   * Set channel volume
   */
  setChannelVolume(channel: number, volume: number): void {
    if (channel >= 0 && channel < this.channelGains.length) {
      this.channelGains[channel].gain.value = Math.max(0, Math.min(1, volume));
    }
  }

  /**
   * Mute/unmute channel
   */
  setChannelMute(channel: number, muted: boolean): void {
    if (channel >= 0 && channel < this.channelGains.length) {
      this.channelGains[channel].gain.value = muted ? 0 : 1;
    }
  }

  /**
   * Enable/disable looping
   */
  setLoopEnabled(enabled: boolean): void {
    this.loopEnabled = enabled;
  }

  /**
   * Jump to pattern
   */
  jumpToPattern(patternIndex: number): void {
    if (!this.song || patternIndex < 0 || patternIndex >= this.song.sequence.length) return;

    this.currentPattern = patternIndex;
    this.currentRow = 0;
  }

  /**
   * Get current playback position
   */
  getPosition(): { pattern: number; row: number } {
    return {
      pattern: this.currentPattern,
      row: this.currentRow
    };
  }

  /**
   * Get song info
   */
  getSongInfo(): { title: string; artist: string; duration: number } | null {
    if (!this.song) return null;

    // Calculate approximate duration
    const totalRows = this.song.sequence.reduce((sum, patIdx) => {
      const pattern = this.song!.patterns.find(p => p.id === patIdx);
      return sum + (pattern?.rows || 64);
    }, 0);

    const msPerRow = (60000 / (this.song.bpm || 125)) / (this.song.ticksPerRow || 6);
    const duration = (totalRows * msPerRow) / 1000;

    return {
      title: this.song.title,
      artist: this.song.artist,
      duration
    };
  }

  /**
   * Deserialize song from JSON
   */
  private deserializeSong(data: any): Song {
    return {
      ...data,
      patterns: data.patterns.map((pattern: any) => ({
        ...pattern,
        data: new Map(pattern.data)
      })),
      instruments: data.instruments.map((inst: any) => ({
        ...inst,
        sample: inst.sample ? {
          ...inst.sample,
          data: new Float32Array(inst.sample.data)
        } : undefined
      }))
    };
  }

  /**
   * Clean up resources
   */
  dispose(): void {
    this.stop();

    this.channelGains.forEach(gain => gain.dispose());
    this.channelSynths.forEach(channelMap => {
      channelMap.forEach(synth => synth.dispose());
    });
  }
}

/**
 * SDK-optimized music data format
 * Designed for minimal file size and fast loading in games
 */
export interface SDKMusicData {
  version: string;
  title: string;
  artist: string;
  comments?: string;
  bpm: number;
  ticksPerRow: number;
  channels: number;
  patterns: Array<{
    id: number;
    name: string;
    rows: number;
    channels: number;
    notes: Array<[string, Note]>; // Serialized Map entries
  }>;
  instruments: Instrument[];
  sequence: number[];
  loopStart: number;
  loopEnd: number;
}

/**
 * Export song to SDK-optimized format
 */
export function exportToSDKFormat(song: Song): SDKMusicData {
  return {
    version: '1.0',
    title: song.title,
    artist: song.artist,
    comments: song.comments,
    bpm: song.bpm,
    ticksPerRow: song.ticksPerRow,
    channels: song.channels,
    patterns: song.patterns.map(pattern => ({
      id: pattern.id,
      name: pattern.name,
      rows: pattern.rows,
      channels: pattern.channels,
      notes: Array.from(pattern.data.entries())
    })),
    instruments: song.instruments.map(inst => ({
      ...inst,
      sample: inst.sample ? {
        ...inst.sample,
        data: Array.from(inst.sample.data) as any
      } : undefined
    })),
    sequence: song.sequence,
    loopStart: song.loopStart,
    loopEnd: song.loopEnd
  };
}

/**
 * Helper function to integrate TrackerDoor music with SDK AudioEngine
 *
 * @example
 * ```typescript
 * import { AudioEngine } from '@amiexpress/sdk/engines/audio';
 * import { createTrackerMusic } from '@amiexpress/tracker-door/sdk-integration';
 *
 * const audio = new AudioEngine();
 * const trackerMusic = createTrackerMusic(audio);
 *
 * // Load and play tracker music
 * await trackerMusic.loadSongFromFile('./music/theme.json');
 * trackerMusic.play();
 *
 * // Control playback
 * trackerMusic.setChannelMute(2, true); // Mute channel 2
 * trackerMusic.jumpToPattern(5); // Jump to pattern 5
 * ```
 */
export function createTrackerMusic(audioEngine?: any): TrackerAudioEngine {
  const masterGain = audioEngine?.musicGain;
  return new TrackerAudioEngine(masterGain);
}
