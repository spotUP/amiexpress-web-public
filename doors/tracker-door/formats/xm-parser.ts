/**
 * FastTracker II XM Format Parser
 * Supports .xm files with up to 32 channels and 128 instruments
 */

import { Song, Pattern, Instrument, Note, NoteValue } from '../data/types';
import * as fs from 'fs';

interface XMInstrument {
  name: string;
  samples: XMSample[];
  volumeEnvelope: { points: Array<{ x: number; y: number }>; enabled: boolean };
  panningEnvelope: { points: Array<{ x: number; y: number }>; enabled: boolean };
  volumeFadeout: number;
}

interface XMSample {
  name: string;
  length: number;
  loopStart: number;
  loopLength: number;
  volume: number;
  finetune: number;
  loopType: number;
  panning: number;
  relativeNote: number;
  data: Float32Array;
}

export class XMParser {
  private static readonly NOTES: string[] = [
    'C-', 'C#', 'D-', 'D#', 'E-', 'F-', 'F#', 'G-', 'G#', 'A-', 'A#', 'B-'
  ];

  /**
   * Parse XM file and convert to TrackerDoor format
   */
  static parse(filepath: string): Song {
    const buffer = fs.readFileSync(filepath);
    let offset = 0;

    // Read header (80 bytes)
    const idText = buffer.toString('ascii', offset, offset + 17);
    offset += 17;

    if (!idText.startsWith('Extended Module:')) {
      throw new Error('Not a valid XM file');
    }

    const moduleName = this.readString(buffer, offset, 20);
    offset += 20;

    const _0x1A = buffer.readUInt8(offset++);
    const trackerName = this.readString(buffer, offset, 20);
    offset += 20;

    const version = buffer.readUInt16LE(offset);
    offset += 2;

    const headerSize = buffer.readUInt32LE(offset);
    offset += 4;

    const songLength = buffer.readUInt16LE(offset);
    offset += 2;

    const restartPosition = buffer.readUInt16LE(offset);
    offset += 2;

    const numChannels = buffer.readUInt16LE(offset);
    offset += 2;

    const numPatterns = buffer.readUInt16LE(offset);
    offset += 2;

    const numInstruments = buffer.readUInt16LE(offset);
    offset += 2;

    const flags = buffer.readUInt16LE(offset);
    offset += 2;

    const defaultTempo = buffer.readUInt16LE(offset);
    offset += 2;

    const defaultBPM = buffer.readUInt16LE(offset);
    offset += 2;

    // Read pattern order table (256 bytes)
    const patternOrder: number[] = [];
    for (let i = 0; i < 256; i++) {
      patternOrder[i] = buffer.readUInt8(offset++);
    }

    // Read patterns
    const patterns: Pattern[] = [];
    for (let p = 0; p < numPatterns; p++) {
      const patternHeaderLength = buffer.readUInt32LE(offset);
      offset += 4;

      const packingType = buffer.readUInt8(offset++);
      const numRows = buffer.readUInt16LE(offset);
      offset += 2;

      const patternDataSize = buffer.readUInt16LE(offset);
      offset += 2;

      const pattern: Pattern = {
        id: p,
        name: `Pattern ${String(p).padStart(2, '0')}`,
        rows: numRows,
        channels: numChannels,
        data: new Map()
      };

      if (patternDataSize > 0) {
        const patternDataEnd = offset + patternDataSize;

        for (let row = 0; row < numRows; row++) {
          for (let ch = 0; ch < numChannels; ch++) {
            if (offset >= patternDataEnd) break;

            const note = this.readXMNote(buffer, offset);
            offset += note.bytesRead;

            if (note.data) {
              pattern.data.set(`${row}:${ch}`, note.data);
            }
          }
        }

        offset = patternDataEnd;
      }

      patterns.push(pattern);
    }

    // Read instruments
    const instruments: Instrument[] = [];
    for (let i = 0; i < numInstruments; i++) {
      const instHeaderSize = buffer.readUInt32LE(offset);
      offset += 4;

      const instName = this.readString(buffer, offset, 22);
      offset += 22;

      const instType = buffer.readUInt8(offset++);

      const numSamples = buffer.readUInt16LE(offset);
      offset += 2;

      if (numSamples > 0) {
        const sampleHeaderSize = buffer.readUInt32LE(offset);
        offset += 4;

        // Read sample number for all notes
        const sampleNumbers: number[] = [];
        for (let n = 0; n < 96; n++) {
          sampleNumbers.push(buffer.readUInt8(offset++));
        }

        // Read volume envelope points
        const volumePoints: Array<{ x: number; y: number }> = [];
        for (let p = 0; p < 12; p++) {
          volumePoints.push({
            x: buffer.readUInt16LE(offset),
            y: buffer.readUInt16LE(offset + 2)
          });
          offset += 4;
        }

        // Read panning envelope points
        const panningPoints: Array<{ x: number; y: number }> = [];
        for (let p = 0; p < 12; p++) {
          panningPoints.push({
            x: buffer.readUInt16LE(offset),
            y: buffer.readUInt16LE(offset + 2)
          });
          offset += 4;
        }

        const numVolumePoints = buffer.readUInt8(offset++);
        const numPanningPoints = buffer.readUInt8(offset++);

        const volumeSustainPoint = buffer.readUInt8(offset++);
        const volumeLoopStartPoint = buffer.readUInt8(offset++);
        const volumeLoopEndPoint = buffer.readUInt8(offset++);

        const panningSustainPoint = buffer.readUInt8(offset++);
        const panningLoopStartPoint = buffer.readUInt8(offset++);
        const panningLoopEndPoint = buffer.readUInt8(offset++);

        const volumeType = buffer.readUInt8(offset++);
        const panningType = buffer.readUInt8(offset++);

        const vibratoType = buffer.readUInt8(offset++);
        const vibratoSweep = buffer.readUInt8(offset++);
        const vibratoDepth = buffer.readUInt8(offset++);
        const vibratoRate = buffer.readUInt8(offset++);

        const volumeFadeout = buffer.readUInt16LE(offset);
        offset += 2;

        const reserved = buffer.readUInt16LE(offset);
        offset += 2;

        // Read samples
        const samples: XMSample[] = [];
        for (let s = 0; s < numSamples; s++) {
          const sampleLength = buffer.readUInt32LE(offset);
          offset += 4;

          const sampleLoopStart = buffer.readUInt32LE(offset);
          offset += 4;

          const sampleLoopLength = buffer.readUInt32LE(offset);
          offset += 4;

          const sampleVolume = buffer.readUInt8(offset++);
          const sampleFinetune = buffer.readInt8(offset++);
          const sampleType = buffer.readUInt8(offset++);
          const samplePanning = buffer.readUInt8(offset++);
          const sampleRelativeNote = buffer.readInt8(offset++);
          const sampleReserved = buffer.readUInt8(offset++);

          const sampleName = this.readString(buffer, offset, 22);
          offset += 22;

          samples.push({
            name: sampleName,
            length: sampleLength,
            loopStart: sampleLoopStart,
            loopLength: sampleLoopLength,
            volume: sampleVolume,
            finetune: sampleFinetune,
            loopType: sampleType & 0x03,
            panning: samplePanning,
            relativeNote: sampleRelativeNote,
            data: new Float32Array(0)
          });
        }

        // Read sample data
        for (let s = 0; s < numSamples; s++) {
          if (samples[s].length > 0) {
            const is16Bit = (buffer.readUInt8(offset - (numSamples - s) * 40 + 14) & 0x10) !== 0;
            const sampleData = new Float32Array(samples[s].length);

            if (is16Bit) {
              for (let j = 0; j < samples[s].length; j += 2) {
                const value = buffer.readInt16LE(offset);
                sampleData[j / 2] = value / 32768.0;
                offset += 2;
              }
            } else {
              for (let j = 0; j < samples[s].length; j++) {
                const value = buffer.readInt8(offset++);
                sampleData[j] = value / 128.0;
              }
            }

            samples[s].data = sampleData;
          }
        }

        // Convert to TrackerDoor instrument
        const mainSample = samples[0];
        const attack = volumePoints[0] ? volumePoints[0].x / 1000 : 0.01;
        const release = volumePoints[numVolumePoints - 1] ?
          (volumePoints[numVolumePoints - 1].x - volumePoints[numVolumePoints - 2].x) / 1000 : 0.3;

        instruments.push({
          id: i + 1,
          name: instName || `Instrument ${i + 1}`,
          type: 'sample',
          envelope: {
            attack,
            decay: 0.1,
            sustain: mainSample.volume / 64.0,
            release
          },
          effects: [],
          sample: {
            data: mainSample.data,
            sampleRate: 8363,
            loopStart: mainSample.loopType > 0 ? mainSample.loopStart : undefined,
            loopEnd: mainSample.loopType > 0 ? mainSample.loopStart + mainSample.loopLength : undefined,
            loopEnabled: mainSample.loopType > 0
          }
        });
      } else {
        offset += instHeaderSize - 29;
      }
    }

    return {
      title: moduleName,
      artist: 'Unknown',
      comments: `Imported from XM (${trackerName})`,
      bpm: defaultBPM,
      ticksPerRow: defaultTempo,
      channels: numChannels,
      patterns,
      instruments,
      sequence: patternOrder.slice(0, songLength),
      loopStart: restartPosition,
      loopEnd: songLength - 1
    };
  }

  /**
   * Read XM note data
   */
  private static readXMNote(buffer: Buffer, offset: number): { data: Note | null; bytesRead: number } {
    const packByte = buffer.readUInt8(offset);

    if (packByte & 0x80) {
      // Packed note
      let bytesRead = 1;
      let note: NoteValue = '...';
      let instrument = 0;
      let volume = 0x80;
      let effect: any = undefined;

      if (packByte & 0x01) {
        const noteNum = buffer.readUInt8(offset + bytesRead++);
        if (noteNum > 0 && noteNum <= 96) {
          const noteName = this.NOTES[(noteNum - 1) % 12];
          const octave = Math.floor((noteNum - 1) / 12);
          note = `${noteName}${octave}` as NoteValue;
        } else if (noteNum === 97) {
          note = '---';
        }
      }

      if (packByte & 0x02) {
        instrument = buffer.readUInt8(offset + bytesRead++);
      }

      if (packByte & 0x04) {
        volume = buffer.readUInt8(offset + bytesRead++);
      }

      if (packByte & 0x08) {
        const effectType = buffer.readUInt8(offset + bytesRead++);
        const effectParam = buffer.readUInt8(offset + bytesRead++);
        effect = { type: effectType, param: effectParam };
      }

      if (note === '...' && instrument === 0 && volume === 0x80 && !effect) {
        return { data: null, bytesRead };
      }

      return {
        data: { note, instrument, volume, effect },
        bytesRead
      };
    } else {
      // Unpacked note (5 bytes)
      const noteNum = buffer.readUInt8(offset);
      const instrument = buffer.readUInt8(offset + 1);
      const volumeColumn = buffer.readUInt8(offset + 2);
      const effectType = buffer.readUInt8(offset + 3);
      const effectParam = buffer.readUInt8(offset + 4);

      let note: NoteValue = '...';
      if (noteNum > 0 && noteNum <= 96) {
        const noteName = this.NOTES[(noteNum - 1) % 12];
        const octave = Math.floor((noteNum - 1) / 12);
        note = `${noteName}${octave}` as NoteValue;
      } else if (noteNum === 97) {
        note = '---';
      }

      if (note === '...' && instrument === 0 && volumeColumn === 0 && effectType === 0) {
        return { data: null, bytesRead: 5 };
      }

      const noteData: any = {
        note,
        instrument,
        volume: 0x40, // Default volume
      };

      // Add volume column if present
      if (volumeColumn > 0) {
        noteData.volumeColumn = volumeColumn;
      }

      return {
        data: noteData,
        bytesRead: 5
      };
    }
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
}
