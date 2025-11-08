/**
 * Instrument Format Parsers
 * Supports XI (FastTracker II), ITI (Impulse Tracker), XRNI (Renoise)
 */

import { Instrument } from '../data/types';
import * as fs from 'fs';
import * as path from 'path';

/**
 * Parse FastTracker II XI instrument file
 */
export class XIParser {
  static parse(filepath: string): Instrument {
    const buffer = fs.readFileSync(filepath);
    let offset = 0;

    // Read header
    const signature = buffer.toString('ascii', offset, offset + 21);
    offset += 21;

    if (!signature.startsWith('Extended Instrument:')) {
      throw new Error('Not a valid XI file');
    }

    const instName = this.readString(buffer, offset, 22);
    offset += 22;

    const programNum = buffer.readUInt8(offset++);
    const numSamples = buffer.readUInt16LE(offset);
    offset += 2;

    if (numSamples === 0) {
      return {
        id: 1,
        name: instName,
        type: 'synth',
        envelope: { attack: 0.01, decay: 0.1, sustain: 0.5, release: 0.3 },
        effects: []
      };
    }

    // Skip sample header size
    offset += 4;

    // Read sample number for all notes (96 bytes)
    const sampleMap: number[] = [];
    for (let i = 0; i < 96; i++) {
      sampleMap.push(buffer.readUInt8(offset++));
    }

    // Read volume envelope
    const volumeEnvelope: Array<{ x: number; y: number }> = [];
    for (let i = 0; i < 12; i++) {
      volumeEnvelope.push({
        x: buffer.readUInt16LE(offset),
        y: buffer.readUInt16LE(offset + 2)
      });
      offset += 4;
    }

    // Read panning envelope
    const panningEnvelope: Array<{ x: number; y: number }> = [];
    for (let i = 0; i < 12; i++) {
      panningEnvelope.push({
        x: buffer.readUInt16LE(offset),
        y: buffer.readUInt16LE(offset + 2)
      });
      offset += 4;
    }

    const numVolumePoints = buffer.readUInt8(offset++);
    const numPanningPoints = buffer.readUInt8(offset++);

    const volumeSustain = buffer.readUInt8(offset++);
    const volumeLoopStart = buffer.readUInt8(offset++);
    const volumeLoopEnd = buffer.readUInt8(offset++);

    const panningSustain = buffer.readUInt8(offset++);
    const panningLoopStart = buffer.readUInt8(offset++);
    const panningLoopEnd = buffer.readUInt8(offset++);

    const volumeType = buffer.readUInt8(offset++);
    const panningType = buffer.readUInt8(offset++);

    const vibratoType = buffer.readUInt8(offset++);
    const vibratoSweep = buffer.readUInt8(offset++);
    const vibratoDepth = buffer.readUInt8(offset++);
    const vibratoRate = buffer.readUInt8(offset++);

    const volumeFadeout = buffer.readUInt16LE(offset);
    offset += 2;

    offset += 22; // Reserved

    // Read first sample
    const sampleLength = buffer.readUInt32LE(offset);
    offset += 4;

    const loopStart = buffer.readUInt32LE(offset);
    offset += 4;

    const loopLength = buffer.readUInt32LE(offset);
    offset += 4;

    const volume = buffer.readUInt8(offset++);
    const finetune = buffer.readInt8(offset++);
    const sampleType = buffer.readUInt8(offset++);
    const panning = buffer.readUInt8(offset++);
    const relativeNote = buffer.readInt8(offset++);
    const reserved = buffer.readUInt8(offset++);

    const sampleName = this.readString(buffer, offset, 22);
    offset += 22;

    // Read sample data
    const is16Bit = (sampleType & 0x10) !== 0;
    const sampleData = new Float32Array(sampleLength);

    if (is16Bit) {
      for (let i = 0; i < sampleLength / 2; i++) {
        sampleData[i] = buffer.readInt16LE(offset) / 32768.0;
        offset += 2;
      }
    } else {
      for (let i = 0; i < sampleLength; i++) {
        sampleData[i] = buffer.readInt8(offset++) / 128.0;
      }
    }

    // Calculate envelope parameters
    const attack = numVolumePoints > 0 ? volumeEnvelope[0].x / 1000 : 0.01;
    const release = numVolumePoints > 1 ?
      (volumeEnvelope[numVolumePoints - 1].x - volumeEnvelope[numVolumePoints - 2].x) / 1000 : 0.3;

    return {
      id: 1,
      name: instName || sampleName,
      type: 'sample',
      envelope: {
        attack,
        decay: 0.1,
        sustain: volume / 64.0,
        release
      },
      effects: [],
      sample: {
        data: sampleData,
        sampleRate: 8363,
        loopStart: (sampleType & 0x03) ? loopStart : undefined,
        loopEnd: (sampleType & 0x03) ? loopStart + loopLength : undefined,
        loopEnabled: (sampleType & 0x03) !== 0
      }
    };
  }

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

/**
 * Parse Impulse Tracker ITI instrument file
 */
export class ITIParser {
  static parse(filepath: string): Instrument {
    const buffer = fs.readFileSync(filepath);
    let offset = 0;

    // Read header
    const signature = buffer.toString('ascii', offset, offset + 4);
    offset += 4;

    if (signature !== 'IMPI') {
      throw new Error('Not a valid ITI file');
    }

    const dosFilename = this.readString(buffer, offset, 12);
    offset += 12;

    offset++; // Zero byte

    const newNoteAction = buffer.readUInt8(offset++);
    const duplicateCheckType = buffer.readUInt8(offset++);
    const duplicateCheckAction = buffer.readUInt8(offset++);

    const fadeout = buffer.readUInt16LE(offset);
    offset += 2;

    const pitchPanSeparation = buffer.readInt8(offset++);
    const pitchPanCenter = buffer.readUInt8(offset++);

    const globalVolume = buffer.readUInt8(offset++);
    const defaultPan = buffer.readUInt8(offset++);

    const randomVolumeVariation = buffer.readUInt8(offset++);
    const randomPanVariation = buffer.readUInt8(offset++);

    const trackerVersion = buffer.readUInt16LE(offset);
    offset += 2;

    const numberOfSamples = buffer.readUInt8(offset++);
    offset++; // Reserved

    const instrumentName = this.readString(buffer, offset, 26);
    offset += 26;

    const initialFilterCutoff = buffer.readUInt8(offset++);
    const initialFilterResonance = buffer.readUInt8(offset++);

    const midiChannel = buffer.readUInt8(offset++);
    const midiProgram = buffer.readUInt8(offset++);
    const midiBank = buffer.readUInt16LE(offset);
    offset += 2;

    // Read note-sample keyboard table
    const noteSampleTable: Array<{ note: number; sample: number }> = [];
    for (let i = 0; i < 120; i++) {
      noteSampleTable.push({
        note: buffer.readUInt8(offset++),
        sample: buffer.readUInt8(offset++)
      });
    }

    // Read envelopes
    const volumeEnvelope = this.readITEnvelope(buffer, offset);
    offset += 82;

    const panningEnvelope = this.readITEnvelope(buffer, offset);
    offset += 82;

    const pitchEnvelope = this.readITEnvelope(buffer, offset);
    offset += 82;

    // For now, create a simple synth instrument
    // In a full implementation, we would also parse associated samples
    return {
      id: 1,
      name: instrumentName || dosFilename,
      type: 'synth',
      envelope: {
        attack: volumeEnvelope.enabled && volumeEnvelope.points.length > 0 ?
          volumeEnvelope.points[0].tick / 1000 : 0.01,
        decay: 0.1,
        sustain: globalVolume / 128.0,
        release: volumeEnvelope.enabled && volumeEnvelope.points.length > 1 ?
          (volumeEnvelope.points[volumeEnvelope.points.length - 1].tick -
            volumeEnvelope.points[volumeEnvelope.points.length - 2].tick) / 1000 : 0.3
      },
      effects: []
    };
  }

  private static readITEnvelope(buffer: Buffer, offset: number): any {
    const flags = buffer.readUInt8(offset);
    const numNodes = buffer.readUInt8(offset + 1);
    const loopBegin = buffer.readUInt8(offset + 2);
    const loopEnd = buffer.readUInt8(offset + 3);
    const sustainLoopBegin = buffer.readUInt8(offset + 4);
    const sustainLoopEnd = buffer.readUInt8(offset + 5);

    const points: Array<{ tick: number; value: number }> = [];
    let nodeOffset = offset + 6;

    for (let i = 0; i < 25; i++) {
      const value = buffer.readInt8(nodeOffset++);
      const tick = buffer.readUInt16LE(nodeOffset);
      nodeOffset += 2;

      if (i < numNodes) {
        points.push({ tick, value });
      }
    }

    offset++; // Reserved

    return {
      enabled: (flags & 1) !== 0,
      loop: (flags & 2) !== 0,
      sustainLoop: (flags & 4) !== 0,
      points,
      loopBegin,
      loopEnd,
      sustainLoopBegin,
      sustainLoopEnd
    };
  }

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

/**
 * Parse Renoise XRNI instrument file
 * Note: XRNI is a ZIP file containing XML
 */
export class XRNIParser {
  static parse(filepath: string): Instrument {
    // XRNI files are ZIP archives containing XML
    // For now, create a placeholder
    // Full implementation would require XML parsing

    const filename = path.basename(filepath, '.xrni');

    return {
      id: 1,
      name: filename,
      type: 'synth',
      envelope: {
        attack: 0.01,
        decay: 0.1,
        sustain: 0.7,
        release: 0.3
      },
      effects: [],
      oscillator: {
        type: 'sawtooth',
        detune: 0
      }
    };
  }
}
