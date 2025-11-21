/**
 * Impulse Tracker IT Format Parser
 * Supports .it files with up to 64 channels and 256 samples
 */

import { Song, Pattern, Instrument, Note, NoteValue } from '../data/types';
import * as fs from 'fs';

export class ITParser {
  private static readonly NOTES: string[] = [
    'C-', 'C#', 'D-', 'D#', 'E-', 'F-', 'F#', 'G-', 'G#', 'A-', 'A#', 'B-'
  ];

  /**
   * Parse IT file and convert to TrackerDoor format
   */
  static parse(filepath: string): Song {
    const buffer = fs.readFileSync(filepath);
    let offset = 0;

    // Read header
    const signature = buffer.toString('ascii', offset, offset + 4);
    offset += 4;

    if (signature !== 'IMPM') {
      throw new Error('Not a valid IT file');
    }

    const songName = this.readString(buffer, offset, 26);
    offset += 26;

    const patternHighlight = buffer.readUInt16LE(offset);
    offset += 2;

    const orderCount = buffer.readUInt16LE(offset);
    offset += 2;

    const instrumentCount = buffer.readUInt16LE(offset);
    offset += 2;

    const sampleCount = buffer.readUInt16LE(offset);
    offset += 2;

    const patternCount = buffer.readUInt16LE(offset);
    offset += 2;

    const createdWithVersion = buffer.readUInt16LE(offset);
    offset += 2;

    const compatibleWithVersion = buffer.readUInt16LE(offset);
    offset += 2;

    const flags = buffer.readUInt16LE(offset);
    offset += 2;

    const special = buffer.readUInt16LE(offset);
    offset += 2;

    const globalVolume = buffer.readUInt8(offset++);
    const mixVolume = buffer.readUInt8(offset++);
    const initialSpeed = buffer.readUInt8(offset++);
    const initialTempo = buffer.readUInt8(offset++);

    const panningSeparation = buffer.readUInt8(offset++);
    const pitchWheelDepth = buffer.readUInt8(offset++);

    const messageLength = buffer.readUInt16LE(offset);
    offset += 2;

    const messageOffset = buffer.readUInt32LE(offset);
    offset += 4;

    const reserved = buffer.readUInt32LE(offset);
    offset += 4;

    // Read channel pan values (64 bytes)
    const channelPan: number[] = [];
    for (let i = 0; i < 64; i++) {
      channelPan.push(buffer.readUInt8(offset++));
    }

    // Read channel volume values (64 bytes)
    const channelVolume: number[] = [];
    for (let i = 0; i < 64; i++) {
      channelVolume.push(buffer.readUInt8(offset++));
    }

    // Read orders
    const orders: number[] = [];
    for (let i = 0; i < orderCount; i++) {
      orders.push(buffer.readUInt8(offset++));
    }

    // Read instrument offsets
    const instrumentOffsets: number[] = [];
    for (let i = 0; i < instrumentCount; i++) {
      instrumentOffsets.push(buffer.readUInt32LE(offset));
      offset += 4;
    }

    // Read sample offsets
    const sampleOffsets: number[] = [];
    for (let i = 0; i < sampleCount; i++) {
      sampleOffsets.push(buffer.readUInt32LE(offset));
      offset += 4;
    }

    // Read pattern offsets
    const patternOffsets: number[] = [];
    for (let i = 0; i < patternCount; i++) {
      patternOffsets.push(buffer.readUInt32LE(offset));
      offset += 4;
    }

    // Count active channels
    let numChannels = 0;
    for (let i = 0; i < 64; i++) {
      if (channelPan[i] < 128 || (channelPan[i] >= 128 && channelPan[i] < 255)) {
        numChannels = i + 1;
      }
    }

    // Read samples
    const samples: any[] = [];
    for (let i = 0; i < sampleCount; i++) {
      const sampleOffset = sampleOffsets[i];
      if (sampleOffset === 0) {
        samples.push(null);
        continue;
      }

      let sOffset = sampleOffset;
      const sampleSig = buffer.toString('ascii', sOffset, sOffset + 4);
      sOffset += 4;

      if (sampleSig !== 'IMPS') {
        samples.push(null);
        continue;
      }

      const dosFilename = this.readString(buffer, sOffset, 12);
      sOffset += 12;

      const globalVol = buffer.readUInt8(sOffset++);
      const sampleFlags = buffer.readUInt8(sOffset++);
      const defaultVolume = buffer.readUInt8(sOffset++);

      const sampleName = this.readString(buffer, sOffset, 26);
      sOffset += 26;

      const cvt = buffer.readUInt8(sOffset++);
      const dfp = buffer.readUInt8(sOffset++);

      const length = buffer.readUInt32LE(sOffset);
      sOffset += 4;

      const loopBegin = buffer.readUInt32LE(sOffset);
      sOffset += 4;

      const loopEnd = buffer.readUInt32LE(sOffset);
      sOffset += 4;

      const c5Speed = buffer.readUInt32LE(sOffset);
      sOffset += 4;

      const susLoopBegin = buffer.readUInt32LE(sOffset);
      sOffset += 4;

      const susLoopEnd = buffer.readUInt32LE(sOffset);
      sOffset += 4;

      const samplePointer = buffer.readUInt32LE(sOffset);
      sOffset += 4;

      const vibratoSpeed = buffer.readUInt8(sOffset++);
      const vibratoDepth = buffer.readUInt8(sOffset++);
      const vibratoRate = buffer.readUInt8(sOffset++);
      const vibratoWaveform = buffer.readUInt8(sOffset++);

      // Read sample data
      const is16Bit = (sampleFlags & 0x02) !== 0;
      const isStereo = (sampleFlags & 0x04) !== 0;
      const isCompressed = (sampleFlags & 0x08) !== 0;

      const sampleData = new Float32Array(length);
      if (samplePointer > 0 && !isCompressed) {
        let dataOffset = samplePointer;
        if (is16Bit) {
          for (let j = 0; j < length; j++) {
            sampleData[j] = buffer.readInt16LE(dataOffset) / 32768.0;
            dataOffset += 2;
          }
        } else {
          for (let j = 0; j < length; j++) {
            sampleData[j] = buffer.readInt8(dataOffset++) / 128.0;
          }
        }
      }

      samples.push({
        name: sampleName,
        length,
        loopBegin,
        loopEnd,
        volume: defaultVolume,
        flags: sampleFlags,
        data: sampleData
      });
    }

    // Read patterns
    const patterns: Pattern[] = [];
    for (let p = 0; p < patternCount; p++) {
      const patternOffset = patternOffsets[p];
      if (patternOffset === 0) {
        patterns.push({
          id: p,
          name: `Pattern ${String(p).padStart(2, '0')}`,
          rows: 64,
          channels: numChannels,
          data: new Map()
        });
        continue;
      }

      let pOffset = patternOffset;
      const patternLength = buffer.readUInt16LE(pOffset);
      pOffset += 2;

      const rows = buffer.readUInt16LE(pOffset);
      pOffset += 2;

      const reserved1 = buffer.readUInt32LE(pOffset);
      pOffset += 4;

      const pattern: Pattern = {
        id: p,
        name: `Pattern ${String(p).padStart(2, '0')}`,
        rows,
        channels: numChannels,
        data: new Map()
      };

      // Parse packed pattern data
      let row = 0;
      let lastMask: number[] = new Array(64).fill(0);
      let lastNote: Note[] = new Array(64).fill({ note: '...', instrument: 0, volume: 0x80 });

      while (row < rows && pOffset < patternOffset + patternLength) {
        const channelVariable = buffer.readUInt8(pOffset++);

        if (channelVariable === 0) {
          row++;
          continue;
        }

        const channel = (channelVariable - 1) & 63;
        let mask = lastMask[channel];

        if (channelVariable & 128) {
          mask = buffer.readUInt8(pOffset++);
          lastMask[channel] = mask;
        }

        let note: NoteValue = '...';
        let instrument = 0;
        let volume = 0x80;
        let effect: any = undefined;

        if (mask & 1) {
          const noteNum = buffer.readUInt8(pOffset++);
          if (noteNum < 120) {
            const noteName = this.NOTES[noteNum % 12];
            const octave = Math.floor(noteNum / 12);
            note = `${noteName}${octave}` as NoteValue;
          } else if (noteNum === 255) {
            note = '---';
          }
        }

        if (mask & 2) {
          instrument = buffer.readUInt8(pOffset++);
        }

        if (mask & 4) {
          volume = buffer.readUInt8(pOffset++);
        }

        if (mask & 8) {
          const effectType = buffer.readUInt8(pOffset++);
          const effectValue = buffer.readUInt8(pOffset++);
          effect = { type: effectType, param: effectValue };
        }

        if (mask & 16) {
          note = lastNote[channel].note;
        }

        if (mask & 32) {
          instrument = lastNote[channel].instrument;
        }

        if (mask & 64) {
          volume = lastNote[channel].volume;
        }

        if (mask & 128) {
          effect = lastNote[channel].effect;
        }

        const noteData: Note = { note, instrument, volume, effect };
        lastNote[channel] = noteData;

        if (note !== '...' || instrument !== 0 || volume !== 0x80 || effect) {
          pattern.data.set(`${row}:${channel}`, noteData);
        }
      }

      patterns.push(pattern);
    }

    // Convert samples to instruments
    const instruments: Instrument[] = samples
      .filter(s => s !== null)
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
          loopStart: (s.flags & 0x10) ? s.loopBegin : undefined,
          loopEnd: (s.flags & 0x10) ? s.loopEnd : undefined,
          loopEnabled: (s.flags & 0x10) !== 0
        }
      }));

    return {
      title: songName,
      artist: 'Unknown',
      comments: 'Imported from IT',
      bpm: initialTempo,
      ticksPerRow: initialSpeed,
      channels: numChannels,
      patterns,
      instruments,
      sequence: orders.filter(o => o < 254),
      loopStart: 0,
      loopEnd: orders.filter(o => o < 254).length - 1
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
      if (byte >= 32 && byte < 127) {
        str += String.fromCharCode(byte);
      }
    }
    return str.trim();
  }
}
