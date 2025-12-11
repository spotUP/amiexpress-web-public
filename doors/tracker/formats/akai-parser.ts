/**
 * AKAI Sampler Format Parser
 * Supports AKAI S1000, S3000, S5000, S6000 program and sample files
 */

import { Instrument } from '../data/types';
import * as fs from 'fs';
import * as path from 'path';

interface AKAISample {
  name: string;
  data: Float32Array;
  sampleRate: number;
  loopStart: number;
  loopEnd: number;
  loopMode: number;
  pitch: number;
  fineTune: number;
  gain: number;
}

/**
 * Parse AKAI S1000/S3000 Program File (.akp)
 */
export class AKAIProgramParser {
  static parse(filepath: string): Instrument {
    const buffer = fs.readFileSync(filepath);
    let offset = 0;

    // Read header (150 bytes for S1000, varies for S3000)
    const headerSize = buffer.readUInt16BE(offset);
    offset += 2;

    const programName = this.readAKAIString(buffer, offset, 12);
    offset += 12;

    const midiProgram = buffer.readUInt8(offset++);
    const midiChannel = buffer.readUInt8(offset++);

    const polyphony = buffer.readUInt8(offset++);
    const priority = buffer.readUInt8(offset++);
    const lowKey = buffer.readUInt8(offset++);
    const highKey = buffer.readUInt8(offset++);

    const octaveShift = buffer.readInt8(offset++);
    const auxOutputSelect = buffer.readUInt8(offset++);

    const mixOutputLevel = buffer.readUInt8(offset++);
    const mixOutputPan = buffer.readInt8(offset++);

    // Volume envelope (6 bytes)
    const volEnvAttack = buffer.readUInt8(offset++);
    const volEnvDecay = buffer.readUInt8(offset++);
    const volEnvSustain = buffer.readUInt8(offset++);
    const volEnvRelease = buffer.readUInt8(offset++);
    const volEnvVelocity = buffer.readUInt8(offset++);
    const volEnvKeyboardDecay = buffer.readInt8(offset++);

    // Filter settings
    const filterCutoff = buffer.readUInt8(offset++);
    const filterResonance = buffer.readUInt8(offset++);
    const filterEnvAmount = buffer.readUInt8(offset++);
    const filterVelocity = buffer.readUInt8(offset++);
    const filterKeyboard = buffer.readInt8(offset++);

    // Filter envelope (4 bytes)
    const filtEnvAttack = buffer.readUInt8(offset++);
    const filtEnvDecay = buffer.readUInt8(offset++);
    const filtEnvSustain = buffer.readUInt8(offset++);
    const filtEnvRelease = buffer.readUInt8(offset++);

    // Pitch settings
    const pitchBendUp = buffer.readUInt8(offset++);
    const pitchBendDown = buffer.readUInt8(offset++);

    // LFO settings
    const lfoRate = buffer.readUInt8(offset++);
    const lfoDelay = buffer.readUInt8(offset++);
    const lfoDepth = buffer.readUInt8(offset++);
    const lfoWaveform = buffer.readUInt8(offset++);

    // Modulation
    const modToFilter = buffer.readInt8(offset++);
    const modToPitch = buffer.readInt8(offset++);
    const modToAmplitude = buffer.readInt8(offset++);

    // Velocity settings
    const velocityToPitch = buffer.readInt8(offset++);
    const velocityToFilter = buffer.readInt8(offset++);
    const velocityToLevel = buffer.readInt8(offset++);

    // Aftertouch settings
    const aftertouchToPitch = buffer.readInt8(offset++);
    const aftertouchToFilter = buffer.readInt8(offset++);
    const aftertouchToLevel = buffer.readInt8(offset++);

    // Read keygroups (up to 99)
    const numKeygroups = buffer.readUInt8(offset++);
    const keygroups: any[] = [];

    for (let i = 0; i < numKeygroups; i++) {
      const kg = this.readKeygroup(buffer, offset);
      keygroups.push(kg.data);
      offset = kg.offset;
    }

    // Convert AKAI envelope to TrackerDoor format
    // AKAI envelope values are 0-99
    const envelope = {
      attack: this.akaiTimeToSeconds(volEnvAttack),
      decay: this.akaiTimeToSeconds(volEnvDecay),
      sustain: volEnvSustain / 99.0,
      release: this.akaiTimeToSeconds(volEnvRelease)
    };

    // For now, create a synth instrument
    // In full implementation, would load associated samples
    return {
      id: 1,
      name: programName,
      type: 'synth',
      envelope,
      effects: [],
      oscillator: {
        type: 'sawtooth',
        detune: octaveShift * 1200
      }
    };
  }

  private static readKeygroup(buffer: Buffer, offset: number): { data: any; offset: number } {
    const lowKey = buffer.readUInt8(offset++);
    const highKey = buffer.readUInt8(offset++);
    const tune = buffer.readInt16BE(offset);
    offset += 2;
    const filter = buffer.readUInt8(offset++);
    const level = buffer.readUInt8(offset++);
    const pan = buffer.readInt8(offset++);
    const output = buffer.readUInt8(offset++);

    // Zone data (up to 4 zones per keygroup)
    const numZones = buffer.readUInt8(offset++);
    const zones: any[] = [];

    for (let i = 0; i < numZones; i++) {
      const lowVelocity = buffer.readUInt8(offset++);
      const highVelocity = buffer.readUInt8(offset++);
      const sampleName = this.readAKAIString(buffer, offset, 12);
      offset += 12;
      const level = buffer.readInt8(offset++);
      const tune = buffer.readInt16BE(offset);
      offset += 2;
      const filter = buffer.readInt8(offset++);
      const pan = buffer.readInt8(offset++);
      const loopMode = buffer.readUInt8(offset++);
      const output = buffer.readUInt8(offset++);

      zones.push({
        lowVelocity,
        highVelocity,
        sampleName,
        level,
        tune,
        filter,
        pan,
        loopMode,
        output
      });
    }

    return {
      data: { lowKey, highKey, tune, filter, level, pan, output, zones },
      offset
    };
  }

  private static readAKAIString(buffer: Buffer, offset: number, length: number): string {
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

  private static akaiTimeToSeconds(akaiValue: number): number {
    // AKAI envelope times are logarithmic, 0-99
    // Approximate conversion: 0 = 0.001s, 99 = 10s
    if (akaiValue === 0) return 0.001;
    return 0.001 * Math.pow(10000, akaiValue / 99.0);
  }
}

/**
 * Parse AKAI S1000/S3000 Sample File (.wav or raw AKAI format)
 */
export class AKAISampleParser {
  static parse(filepath: string): AKAISample {
    const buffer = fs.readFileSync(filepath);
    let offset = 0;

    // Check for AKAI sample header (some files have custom headers)
    const possibleHeader = buffer.toString('ascii', 0, 4);

    // AKAI samples are typically 16-bit signed, big-endian
    // Sample rate is usually 22050 or 44100 Hz
    let sampleRate = 22050;
    let loopStart = 0;
    let loopEnd = 0;
    let loopMode = 0;
    let pitch = 60; // Middle C
    let fineTune = 0;
    let gain = 1.0;

    // Try to detect S1000/S3000 header format
    if (this.detectAKAIHeader(buffer)) {
      const header = this.parseAKAIHeader(buffer);
      sampleRate = header.sampleRate;
      loopStart = header.loopStart;
      loopEnd = header.loopEnd;
      loopMode = header.loopMode;
      pitch = header.pitch;
      fineTune = header.fineTune;
      offset = header.dataOffset;
    }

    // Read sample data (16-bit big-endian signed)
    const dataLength = buffer.length - offset;
    const numSamples = Math.floor(dataLength / 2);
    const sampleData = new Float32Array(numSamples);

    for (let i = 0; i < numSamples; i++) {
      const value = buffer.readInt16BE(offset + i * 2);
      sampleData[i] = value / 32768.0;
    }

    return {
      name: path.basename(filepath, path.extname(filepath)),
      data: sampleData,
      sampleRate,
      loopStart,
      loopEnd,
      loopMode,
      pitch,
      fineTune,
      gain
    };
  }

  private static detectAKAIHeader(buffer: Buffer): boolean {
    // S1000 samples may have a 150-byte header
    // Check for common AKAI markers
    if (buffer.length < 150) return false;

    // Look for AKAI-specific patterns
    // Sample name is typically at offset 0-12
    let nameBytes = 0;
    for (let i = 0; i < 12; i++) {
      const byte = buffer.readUInt8(i);
      if ((byte >= 32 && byte < 127) || byte === 0) {
        nameBytes++;
      }
    }

    return nameBytes >= 8; // At least 8 valid ASCII characters
  }

  private static parseAKAIHeader(buffer: Buffer): any {
    let offset = 0;

    const name = this.readAKAIString(buffer, offset, 12);
    offset += 12;

    // Sample parameters vary by AKAI model
    // S1000 format (simplified)
    const pitch = buffer.readUInt8(offset++);
    const fineTune = buffer.readInt8(offset++);
    const gain = buffer.readUInt8(offset++);

    const loopStartHi = buffer.readUInt16BE(offset);
    offset += 2;
    const loopStartLo = buffer.readUInt16BE(offset);
    offset += 2;
    const loopStart = (loopStartHi << 16) | loopStartLo;

    const loopEndHi = buffer.readUInt16BE(offset);
    offset += 2;
    const loopEndLo = buffer.readUInt16BE(offset);
    offset += 2;
    const loopEnd = (loopEndHi << 16) | loopEndLo;

    const loopMode = buffer.readUInt8(offset++);

    // Sample rate (typically 22050 or 44100)
    const sampleRateCode = buffer.readUInt8(offset++);
    const sampleRate = this.decodeSampleRate(sampleRateCode);

    return {
      name,
      pitch,
      fineTune,
      gain: gain / 255.0,
      loopStart,
      loopEnd,
      loopMode,
      sampleRate,
      dataOffset: 150 // Standard S1000 header size
    };
  }

  private static decodeSampleRate(code: number): number {
    // AKAI sample rate encoding
    const rates: { [key: number]: number } = {
      0: 22050,
      1: 44100,
      2: 11025,
      3: 48000,
      4: 32000,
      5: 16000,
      6: 8000
    };
    return rates[code] || 22050;
  }

  private static readAKAIString(buffer: Buffer, offset: number, length: number): string {
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
 * Auto-detect and parse AKAI format
 */
export class AKAIParser {
  static parse(filepath: string): Instrument {
    const ext = path.extname(filepath).toLowerCase();

    if (ext === '.akp') {
      return AKAIProgramParser.parse(filepath);
    } else if (ext === '.wav' || ext === '.snd' || ext === '') {
      // Parse as AKAI sample and convert to instrument
      const sample = AKAISampleParser.parse(filepath);
      return {
        id: 1,
        name: sample.name,
        type: 'sample',
        envelope: {
          attack: 0.001,
          decay: 0.1,
          sustain: 0.7,
          release: 0.3
        },
        effects: [],
        sample: {
          data: sample.data,
          sampleRate: sample.sampleRate,
          loopStart: sample.loopMode > 0 ? sample.loopStart : undefined,
          loopEnd: sample.loopMode > 0 ? sample.loopEnd : undefined,
          loopEnabled: sample.loopMode > 0
        }
      };
    } else {
      throw new Error(`Unsupported AKAI format: ${ext}`);
    }
  }

  static getSupportedFormats(): string[] {
    return ['.akp', '.wav', '.snd'];
  }
}
