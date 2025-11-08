/**
 * Protracker MOD Format Parser
 * Supports 4-channel .mod files (31 instruments)
 */

import { Song, Pattern, Instrument, Note, NoteValue } from '../data/types';
import * as fs from 'fs';

interface MODSample {
  name: string;
  length: number;
  finetune: number;
  volume: number;
  repeatStart: number;
  repeatLength: number;
  data: Float32Array;
}

export class MODParser {
  private static readonly PERIODS: number[] = [
    1712, 1616, 1525, 1440, 1357, 1281, 1209, 1141, 1077, 1017, 961, 907,
    856, 808, 762, 720, 678, 640, 604, 570, 538, 508, 480, 453,
    428, 404, 381, 360, 339, 320, 302, 285, 269, 254, 240, 226,
    214, 202, 190, 180, 170, 160, 151, 143, 135, 127, 120, 113
  ];

  private static readonly NOTES: string[] = [
    'C-', 'C#', 'D-', 'D#', 'E-', 'F-', 'F#', 'G-', 'G#', 'A-', 'A#', 'B-'
  ];

  /**
   * Parse MOD file and convert to TrackerDoor format
   */
  static parse(filepath: string): Song {
    const buffer = fs.readFileSync(filepath);

    // Read song name (20 bytes at offset 0)
    const title = this.readString(buffer, 0, 20);

    // Read samples (31 samples, 30 bytes each, starting at offset 20)
    const samples: MODSample[] = [];
    let offset = 20;

    for (let i = 0; i < 31; i++) {
      const sample: MODSample = {
        name: this.readString(buffer, offset, 22),
        length: buffer.readUInt16BE(offset + 22) * 2,
        finetune: buffer.readInt8(offset + 24) & 0x0F,
        volume: buffer.readUInt8(offset + 25),
        repeatStart: buffer.readUInt16BE(offset + 26) * 2,
        repeatLength: buffer.readUInt16BE(offset + 28) * 2,
        data: new Float32Array(0)
      };
      samples.push(sample);
      offset += 30;
    }

    // Read song length and pattern order
    const songLength = buffer.readUInt8(offset);
    offset++; // Skip restart position
    offset++;

    // Read pattern order (128 bytes)
    const patternOrder: number[] = [];
    for (let i = 0; i < 128; i++) {
      patternOrder[i] = buffer.readUInt8(offset + i);
    }
    offset += 128;

    // Read MOD signature (4 bytes) - should be "M.K." or "M!K!" for 31-instrument
    const signature = buffer.toString('ascii', offset, offset + 4);
    offset += 4;

    // Determine number of patterns
    const numPatterns = Math.max(...patternOrder.slice(0, songLength)) + 1;

    // Read pattern data (64 rows, 4 channels, 4 bytes per note)
    const patterns: Pattern[] = [];
    for (let p = 0; p < numPatterns; p++) {
      const pattern: Pattern = {
        id: p,
        name: `Pattern ${String(p).padStart(2, '0')}`,
        rows: 64,
        channels: 4,
        data: new Map()
      };

      for (let row = 0; row < 64; row++) {
        for (let ch = 0; ch < 4; ch++) {
          const noteData = this.readNote(buffer, offset);
          offset += 4;

          if (noteData) {
            pattern.data.set(`${row}:${ch}`, noteData);
          }
        }
      }

      patterns.push(pattern);
    }

    // Read sample data
    for (let i = 0; i < 31; i++) {
      if (samples[i].length > 0) {
        const sampleData = new Float32Array(samples[i].length);
        for (let j = 0; j < samples[i].length; j++) {
          const byte = buffer.readInt8(offset++);
          sampleData[j] = byte / 128.0;
        }
        samples[i].data = sampleData;
      }
    }

    // Convert to TrackerDoor format
    const instruments: Instrument[] = samples
      .filter(s => s.length > 0)
      .map((s, idx) => ({
        id: idx + 1,
        name: s.name || `Sample ${idx + 1}`,
        type: 'sample' as const,
        envelope: {
          attack: 0.001,
          decay: 0.1,
          sustain: s.volume / 64.0,
          release: 0.3
        },
        effects: [],
        sample: {
          data: s.data,
          sampleRate: 8363,
          loopStart: s.repeatLength > 2 ? s.repeatStart : undefined,
          loopEnd: s.repeatLength > 2 ? s.repeatStart + s.repeatLength : undefined,
          loopEnabled: s.repeatLength > 2
        }
      }));

    return {
      title,
      artist: 'Unknown',
      comments: `Imported from MOD: ${signature}`,
      bpm: 125,
      ticksPerRow: 6,
      channels: 4,
      patterns,
      instruments,
      sequence: patternOrder.slice(0, songLength),
      loopStart: 0,
      loopEnd: songLength - 1
    };
  }

  /**
   * Read a note from pattern data
   */
  private static readNote(buffer: Buffer, offset: number): Note | null {
    const byte1 = buffer.readUInt8(offset);
    const byte2 = buffer.readUInt8(offset + 1);
    const byte3 = buffer.readUInt8(offset + 2);
    const byte4 = buffer.readUInt8(offset + 3);

    // Extract period (12 bits)
    const period = ((byte1 & 0x0F) << 8) | byte2;

    // Extract sample number (4 bits + 4 bits)
    const sampleNum = (byte1 & 0xF0) | ((byte3 & 0xF0) >> 4);

    // Extract effect (12 bits)
    const effect = ((byte3 & 0x0F) << 8) | byte4;

    if (period === 0 && sampleNum === 0 && effect === 0) {
      return null;
    }

    // Convert period to note
    let note: NoteValue = '...';
    if (period > 0) {
      const noteIndex = this.findClosestPeriod(period);
      if (noteIndex >= 0) {
        const noteName = this.NOTES[noteIndex % 12];
        const octave = Math.floor(noteIndex / 12) + 1;
        note = `${noteName}${octave}` as NoteValue;
      }
    }

    return {
      note,
      instrument: sampleNum,
      volume: 0x80,
      effect: effect > 0 ? this.parseEffect(effect) : undefined
    };
  }

  /**
   * Find closest period to convert to note
   */
  private static findClosestPeriod(period: number): number {
    let closest = 0;
    let minDiff = Math.abs(this.PERIODS[0] - period);

    for (let i = 1; i < this.PERIODS.length; i++) {
      const diff = Math.abs(this.PERIODS[i] - period);
      if (diff < minDiff) {
        minDiff = diff;
        closest = i;
      }
    }

    return closest;
  }

  /**
   * Parse MOD effect
   */
  private static parseEffect(effect: number): any {
    const cmd = (effect >> 8) & 0x0F;
    const param = effect & 0xFF;

    // Map MOD effects to tracker effects
    const effectMap: Record<number, string> = {
      0x0: 'arpeggio',
      0x1: 'portamento_up',
      0x2: 'portamento_down',
      0x3: 'tone_portamento',
      0x4: 'vibrato',
      0x5: 'vol_slide_porta',
      0x6: 'vol_slide_vibrato',
      0x7: 'tremolo',
      0x8: 'panning',
      0x9: 'sample_offset',
      0xA: 'volume_slide',
      0xB: 'position_jump',
      0xC: 'volume',
      0xD: 'pattern_break',
      0xE: 'extended',
      0xF: 'set_speed'
    };

    return {
      type: effectMap[cmd] || 'unknown',
      param
    };
  }

  /**
   * Read null-terminated string
   */
  private static readString(buffer: Buffer, offset: number, length: number): string {
    let str = '';
    for (let i = 0; i < length; i++) {
      const byte = buffer.readUInt8(offset + i);
      if (byte === 0) break;
      str += String.fromCharCode(byte);
    }
    return str.trim();
  }

  /**
   * Export song to MOD format
   */
  static export(song: Song, filepath: string): void {
    // Calculate total size needed
    const numPatterns = Math.max(...song.sequence) + 1;
    const headerSize = 1084; // 20 + (31 * 30) + 1 + 1 + 128 + 4
    const patternDataSize = numPatterns * 1024; // 64 rows * 4 channels * 4 bytes
    const sampleDataSize = song.instruments
      .filter(i => i.sample)
      .reduce((sum, i) => sum + (i.sample?.data.length || 0), 0);

    const buffer = Buffer.alloc(headerSize + patternDataSize + sampleDataSize);
    let offset = 0;

    // Write song title
    buffer.write(song.title.substring(0, 20).padEnd(20, '\0'), offset, 20, 'ascii');
    offset += 20;

    // Write sample headers (31 slots)
    const samples = song.instruments.filter(i => i.sample).slice(0, 31);
    for (let i = 0; i < 31; i++) {
      if (i < samples.length) {
        const inst = samples[i];
        const sampleLen = Math.min(inst.sample!.data.length, 65535);
        const loopStart = inst.sample!.loopStart || 0;
        const loopLen = inst.sample!.loopEnabled ?
          (inst.sample!.loopEnd || sampleLen) - loopStart : 2;

        buffer.write(inst.name.substring(0, 22).padEnd(22, '\0'), offset, 22, 'ascii');
        buffer.writeUInt16BE(Math.floor(sampleLen / 2), offset + 22);
        buffer.writeUInt8(0, offset + 24); // Finetune
        buffer.writeUInt8(Math.floor(inst.envelope.sustain * 64), offset + 25);
        buffer.writeUInt16BE(Math.floor(loopStart / 2), offset + 26);
        buffer.writeUInt16BE(Math.floor(loopLen / 2), offset + 28);
      } else {
        buffer.fill(0, offset, offset + 30);
      }
      offset += 30;
    }

    // Write song length and pattern order
    buffer.writeUInt8(Math.min(song.sequence.length, 128), offset++);
    buffer.writeUInt8(0, offset++); // Restart position

    for (let i = 0; i < 128; i++) {
      buffer.writeUInt8(i < song.sequence.length ? song.sequence[i] : 0, offset++);
    }

    // Write MOD signature
    buffer.write('M.K.', offset, 4, 'ascii');
    offset += 4;

    // Write pattern data
    for (let p = 0; p < numPatterns; p++) {
      const pattern = song.patterns.find(pat => pat.id === p);
      if (pattern) {
        for (let row = 0; row < 64; row++) {
          for (let ch = 0; ch < 4; ch++) {
            const note = pattern.data.get(`${row}:${ch}`);
            this.writeNote(buffer, offset, note);
            offset += 4;
          }
        }
      } else {
        buffer.fill(0, offset, offset + 1024);
        offset += 1024;
      }
    }

    // Write sample data
    samples.forEach(inst => {
      if (inst.sample) {
        inst.sample.data.forEach(sample => {
          buffer.writeInt8(Math.floor(sample * 127), offset++);
        });
      }
    });

    fs.writeFileSync(filepath, buffer);
  }

  /**
   * Write note to pattern data
   */
  private static writeNote(buffer: Buffer, offset: number, note?: Note): void {
    if (!note || note.note === '...') {
      buffer.writeUInt32BE(0, offset);
      return;
    }

    // Convert note to period
    const match = note.note.match(/([A-G]#?)-(\d)/);
    let period = 0;
    if (match) {
      const [, noteName, octaveStr] = match;
      const noteIndex = this.NOTES.indexOf(noteName);
      const octave = parseInt(octaveStr);
      const periodIndex = (octave - 1) * 12 + noteIndex;
      if (periodIndex >= 0 && periodIndex < this.PERIODS.length) {
        period = this.PERIODS[periodIndex];
      }
    }

    const sampleNum = note.instrument || 0;
    const effect = 0; // TODO: Convert effects

    buffer.writeUInt8((sampleNum & 0xF0) | ((period >> 8) & 0x0F), offset);
    buffer.writeUInt8(period & 0xFF, offset + 1);
    buffer.writeUInt8(((sampleNum & 0x0F) << 4) | ((effect >> 8) & 0x0F), offset + 2);
    buffer.writeUInt8(effect & 0xFF, offset + 3);
  }
}
