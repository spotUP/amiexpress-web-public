/**
 * Sample Format Parsers
 * Supports WAV, Raw PCM, AIFF, and other audio formats
 */

import * as fs from 'fs';
import * as path from 'path';

export interface SampleData {
  data: Float32Array;
  sampleRate: number;
  channels: number;
  loopStart?: number;
  loopEnd?: number;
  loopEnabled: boolean;
  name: string;
}

/**
 * Parse WAV file (RIFF WAVE format)
 */
export class WAVParser {
  static parse(filepath: string): SampleData {
    const buffer = fs.readFileSync(filepath);
    let offset = 0;

    // Read RIFF header
    const riff = buffer.toString('ascii', offset, offset + 4);
    offset += 4;
    if (riff !== 'RIFF') {
      throw new Error('Not a valid WAV file (missing RIFF header)');
    }

    const fileSize = buffer.readUInt32LE(offset);
    offset += 4;

    const wave = buffer.toString('ascii', offset, offset + 4);
    offset += 4;
    if (wave !== 'WAVE') {
      throw new Error('Not a valid WAV file (missing WAVE header)');
    }

    let formatChunk: any = null;
    let dataChunk: { offset: number; size: number } | null = null;
    let smplChunk: any = null;

    // Read chunks
    while (offset < buffer.length - 8) {
      const chunkId = buffer.toString('ascii', offset, offset + 4);
      offset += 4;
      const chunkSize = buffer.readUInt32LE(offset);
      offset += 4;

      if (chunkId === 'fmt ') {
        formatChunk = {
          audioFormat: buffer.readUInt16LE(offset),
          numChannels: buffer.readUInt16LE(offset + 2),
          sampleRate: buffer.readUInt32LE(offset + 4),
          byteRate: buffer.readUInt32LE(offset + 8),
          blockAlign: buffer.readUInt16LE(offset + 12),
          bitsPerSample: buffer.readUInt16LE(offset + 14)
        };
      } else if (chunkId === 'data') {
        dataChunk = { offset, size: chunkSize };
      } else if (chunkId === 'smpl') {
        // Parse sampler chunk for loop points
        const numSampleLoops = buffer.readUInt32LE(offset + 28);
        if (numSampleLoops > 0) {
          smplChunk = {
            loopStart: buffer.readUInt32LE(offset + 36 + 8),
            loopEnd: buffer.readUInt32LE(offset + 36 + 12)
          };
        }
      }

      offset += chunkSize;
      if (chunkSize % 2 !== 0) offset++; // Pad to even byte
    }

    if (!formatChunk || !dataChunk) {
      throw new Error('Invalid WAV file (missing fmt or data chunk)');
    }

    // Only support PCM format
    if (formatChunk.audioFormat !== 1) {
      throw new Error('Only PCM WAV files are supported');
    }

    // Read sample data
    const numSamples = dataChunk.size / formatChunk.blockAlign;
    const sampleData = new Float32Array(numSamples);
    let dataOffset = dataChunk.offset;

    if (formatChunk.bitsPerSample === 8) {
      // 8-bit unsigned
      for (let i = 0; i < numSamples; i++) {
        const value = buffer.readUInt8(dataOffset++);
        sampleData[i] = (value - 128) / 128.0;
      }
    } else if (formatChunk.bitsPerSample === 16) {
      // 16-bit signed
      for (let i = 0; i < numSamples; i++) {
        const value = buffer.readInt16LE(dataOffset);
        sampleData[i] = value / 32768.0;
        dataOffset += 2;
      }
    } else if (formatChunk.bitsPerSample === 24) {
      // 24-bit signed
      for (let i = 0; i < numSamples; i++) {
        const byte1 = buffer.readUInt8(dataOffset++);
        const byte2 = buffer.readUInt8(dataOffset++);
        const byte3 = buffer.readInt8(dataOffset++);
        const value = (byte3 << 16) | (byte2 << 8) | byte1;
        sampleData[i] = value / 8388608.0;
      }
    } else if (formatChunk.bitsPerSample === 32) {
      // 32-bit float or signed int
      for (let i = 0; i < numSamples; i++) {
        const value = buffer.readFloatLE(dataOffset);
        sampleData[i] = value;
        dataOffset += 4;
      }
    } else {
      throw new Error(`Unsupported bit depth: ${formatChunk.bitsPerSample}`);
    }

    // Mix stereo to mono if needed
    let finalData = sampleData;
    if (formatChunk.numChannels === 2) {
      finalData = new Float32Array(numSamples / 2);
      for (let i = 0; i < numSamples / 2; i++) {
        finalData[i] = (sampleData[i * 2] + sampleData[i * 2 + 1]) / 2;
      }
    }

    return {
      data: finalData,
      sampleRate: formatChunk.sampleRate,
      channels: formatChunk.numChannels,
      loopStart: smplChunk?.loopStart,
      loopEnd: smplChunk?.loopEnd,
      loopEnabled: smplChunk !== null,
      name: path.basename(filepath, path.extname(filepath))
    };
  }

  /**
   * Export sample to WAV file
   */
  static export(sample: SampleData, filepath: string): void {
    const numSamples = sample.data.length;
    const bitsPerSample = 16;
    const blockAlign = (bitsPerSample / 8) * sample.channels;
    const dataSize = numSamples * blockAlign;
    const fileSize = 36 + dataSize;

    const buffer = Buffer.alloc(44 + dataSize);
    let offset = 0;

    // RIFF header
    buffer.write('RIFF', offset, 'ascii');
    offset += 4;
    buffer.writeUInt32LE(fileSize, offset);
    offset += 4;
    buffer.write('WAVE', offset, 'ascii');
    offset += 4;

    // fmt chunk
    buffer.write('fmt ', offset, 'ascii');
    offset += 4;
    buffer.writeUInt32LE(16, offset); // Chunk size
    offset += 4;
    buffer.writeUInt16LE(1, offset); // Audio format (PCM)
    offset += 2;
    buffer.writeUInt16LE(sample.channels, offset);
    offset += 2;
    buffer.writeUInt32LE(sample.sampleRate, offset);
    offset += 4;
    buffer.writeUInt32LE(sample.sampleRate * blockAlign, offset); // Byte rate
    offset += 4;
    buffer.writeUInt16LE(blockAlign, offset);
    offset += 2;
    buffer.writeUInt16LE(bitsPerSample, offset);
    offset += 2;

    // data chunk
    buffer.write('data', offset, 'ascii');
    offset += 4;
    buffer.writeUInt32LE(dataSize, offset);
    offset += 4;

    // Write sample data as 16-bit PCM
    for (let i = 0; i < numSamples; i++) {
      const value = Math.max(-1, Math.min(1, sample.data[i]));
      buffer.writeInt16LE(Math.round(value * 32767), offset);
      offset += 2;
    }

    fs.writeFileSync(filepath, buffer);
  }
}

/**
 * Parse AIFF file (Audio Interchange File Format)
 */
export class AIFFParser {
  static parse(filepath: string): SampleData {
    const buffer = fs.readFileSync(filepath);
    let offset = 0;

    // Read FORM header
    const form = buffer.toString('ascii', offset, offset + 4);
    offset += 4;
    if (form !== 'FORM') {
      throw new Error('Not a valid AIFF file (missing FORM header)');
    }

    const fileSize = buffer.readUInt32BE(offset);
    offset += 4;

    const aiff = buffer.toString('ascii', offset, offset + 4);
    offset += 4;
    if (aiff !== 'AIFF' && aiff !== 'AIFC') {
      throw new Error('Not a valid AIFF file (missing AIFF/AIFC header)');
    }

    let commChunk: any = null;
    let ssndChunk: { offset: number; size: number } | null = null;
    let markChunk: any[] = [];
    let instChunk: any = null;

    // Read chunks
    while (offset < buffer.length - 8) {
      const chunkId = buffer.toString('ascii', offset, offset + 4);
      offset += 4;
      const chunkSize = buffer.readUInt32BE(offset);
      offset += 4;

      if (chunkId === 'COMM') {
        const numChannels = buffer.readUInt16BE(offset);
        const numSampleFrames = buffer.readUInt32BE(offset + 2);
        const sampleSize = buffer.readUInt16BE(offset + 6);
        const sampleRate = this.readExtended(buffer, offset + 8);

        commChunk = { numChannels, numSampleFrames, sampleSize, sampleRate };
      } else if (chunkId === 'SSND') {
        const ssndOffset = buffer.readUInt32BE(offset);
        const blockSize = buffer.readUInt32BE(offset + 4);
        ssndChunk = { offset: offset + 8 + ssndOffset, size: chunkSize - 8 };
      } else if (chunkId === 'MARK') {
        const numMarkers = buffer.readUInt16BE(offset);
        let markOffset = offset + 2;
        for (let i = 0; i < numMarkers; i++) {
          const id = buffer.readUInt16BE(markOffset);
          const position = buffer.readUInt32BE(markOffset + 2);
          const nameLength = buffer.readUInt8(markOffset + 6);
          const name = buffer.toString('ascii', markOffset + 7, markOffset + 7 + nameLength);
          markChunk.push({ id, position, name });
          markOffset += 7 + nameLength + (nameLength % 2 === 0 ? 1 : 0);
        }
      } else if (chunkId === 'INST') {
        const sustainLoopPlayMode = buffer.readUInt16BE(offset + 2);
        const sustainLoopBegin = buffer.readUInt16BE(offset + 4);
        const sustainLoopEnd = buffer.readUInt16BE(offset + 6);
        instChunk = { sustainLoopPlayMode, sustainLoopBegin, sustainLoopEnd };
      }

      offset += chunkSize;
      if (chunkSize % 2 !== 0) offset++; // Pad to even byte
    }

    if (!commChunk || !ssndChunk) {
      throw new Error('Invalid AIFF file (missing COMM or SSND chunk)');
    }

    // Read sample data
    const numSamples = commChunk.numSampleFrames * commChunk.numChannels;
    const sampleData = new Float32Array(numSamples);
    let dataOffset = ssndChunk.offset;

    if (commChunk.sampleSize === 8) {
      // 8-bit signed
      for (let i = 0; i < numSamples; i++) {
        const value = buffer.readInt8(dataOffset++);
        sampleData[i] = value / 128.0;
      }
    } else if (commChunk.sampleSize === 16) {
      // 16-bit signed
      for (let i = 0; i < numSamples; i++) {
        const value = buffer.readInt16BE(dataOffset);
        sampleData[i] = value / 32768.0;
        dataOffset += 2;
      }
    } else if (commChunk.sampleSize === 24) {
      // 24-bit signed
      for (let i = 0; i < numSamples; i++) {
        const byte1 = buffer.readInt8(dataOffset++);
        const byte2 = buffer.readUInt8(dataOffset++);
        const byte3 = buffer.readUInt8(dataOffset++);
        const value = (byte1 << 16) | (byte2 << 8) | byte3;
        sampleData[i] = value / 8388608.0;
      }
    } else if (commChunk.sampleSize === 32) {
      // 32-bit signed
      for (let i = 0; i < numSamples; i++) {
        const value = buffer.readInt32BE(dataOffset);
        sampleData[i] = value / 2147483648.0;
        dataOffset += 4;
      }
    } else {
      throw new Error(`Unsupported sample size: ${commChunk.sampleSize}`);
    }

    // Mix stereo to mono if needed
    let finalData = sampleData;
    if (commChunk.numChannels === 2) {
      finalData = new Float32Array(commChunk.numSampleFrames);
      for (let i = 0; i < commChunk.numSampleFrames; i++) {
        finalData[i] = (sampleData[i * 2] + sampleData[i * 2 + 1]) / 2;
      }
    }

    // Find loop points from markers
    let loopStart: number | undefined;
    let loopEnd: number | undefined;
    if (instChunk && instChunk.sustainLoopPlayMode !== 0) {
      const startMarker = markChunk.find(m => m.id === instChunk.sustainLoopBegin);
      const endMarker = markChunk.find(m => m.id === instChunk.sustainLoopEnd);
      loopStart = startMarker?.position;
      loopEnd = endMarker?.position;
    }

    return {
      data: finalData,
      sampleRate: commChunk.sampleRate,
      channels: commChunk.numChannels,
      loopStart,
      loopEnd,
      loopEnabled: loopStart !== undefined && loopEnd !== undefined,
      name: path.basename(filepath, path.extname(filepath))
    };
  }

  /**
   * Read 80-bit IEEE 754 extended precision float
   */
  private static readExtended(buffer: Buffer, offset: number): number {
    const exponent = buffer.readUInt16BE(offset);
    const mantissa = buffer.readBigUInt64BE(offset + 2);

    if (exponent === 0 && mantissa === 0n) return 0;

    const sign = (exponent & 0x8000) ? -1 : 1;
    const exp = (exponent & 0x7FFF) - 16383;
    const frac = Number(mantissa) / Math.pow(2, 63);

    return sign * Math.pow(2, exp) * frac;
  }
}

/**
 * Parse Raw PCM data
 */
export class RawPCMParser {
  static parse(
    filepath: string,
    options: {
      sampleRate: number;
      bitDepth: 8 | 16 | 24 | 32;
      channels: 1 | 2;
      signed?: boolean;
      bigEndian?: boolean;
      float?: boolean;
    }
  ): SampleData {
    const buffer = fs.readFileSync(filepath);
    const { sampleRate, bitDepth, channels, signed = true, bigEndian = false, float = false } = options;

    const bytesPerSample = bitDepth / 8;
    const numSamples = Math.floor(buffer.length / bytesPerSample / channels);
    const sampleData = new Float32Array(numSamples * channels);

    let offset = 0;

    for (let i = 0; i < numSamples * channels; i++) {
      let value: number;

      if (float && bitDepth === 32) {
        value = bigEndian ? buffer.readFloatBE(offset) : buffer.readFloatLE(offset);
      } else if (bitDepth === 8) {
        value = signed ? buffer.readInt8(offset) / 128.0 : (buffer.readUInt8(offset) - 128) / 128.0;
      } else if (bitDepth === 16) {
        const rawValue = bigEndian ? buffer.readInt16BE(offset) : buffer.readInt16LE(offset);
        value = rawValue / 32768.0;
      } else if (bitDepth === 24) {
        let rawValue: number;
        if (bigEndian) {
          const byte1 = buffer.readInt8(offset);
          const byte2 = buffer.readUInt8(offset + 1);
          const byte3 = buffer.readUInt8(offset + 2);
          rawValue = (byte1 << 16) | (byte2 << 8) | byte3;
        } else {
          const byte1 = buffer.readUInt8(offset);
          const byte2 = buffer.readUInt8(offset + 1);
          const byte3 = buffer.readInt8(offset + 2);
          rawValue = (byte3 << 16) | (byte2 << 8) | byte1;
        }
        value = rawValue / 8388608.0;
      } else if (bitDepth === 32) {
        const rawValue = bigEndian ? buffer.readInt32BE(offset) : buffer.readInt32LE(offset);
        value = rawValue / 2147483648.0;
      } else {
        throw new Error(`Unsupported bit depth: ${bitDepth}`);
      }

      sampleData[i] = value;
      offset += bytesPerSample;
    }

    // Mix stereo to mono if needed
    let finalData = sampleData;
    if (channels === 2) {
      finalData = new Float32Array(numSamples);
      for (let i = 0; i < numSamples; i++) {
        finalData[i] = (sampleData[i * 2] + sampleData[i * 2 + 1]) / 2;
      }
    }

    return {
      data: finalData,
      sampleRate,
      channels,
      loopStart: undefined,
      loopEnd: undefined,
      loopEnabled: false,
      name: path.basename(filepath, path.extname(filepath))
    };
  }
}

/**
 * Auto-detect and parse any supported sample format
 */
export class SampleParser {
  static parse(filepath: string, rawOptions?: any): SampleData {
    const ext = path.extname(filepath).toLowerCase();

    switch (ext) {
      case '.wav':
        return WAVParser.parse(filepath);
      case '.aif':
      case '.aiff':
      case '.aifc':
        return AIFFParser.parse(filepath);
      case '.raw':
      case '.pcm':
        if (!rawOptions) {
          throw new Error('Raw PCM files require format options (sampleRate, bitDepth, channels)');
        }
        return RawPCMParser.parse(filepath, rawOptions);
      default:
        throw new Error(`Unsupported sample format: ${ext}`);
    }
  }

  /**
   * Get supported file extensions
   */
  static getSupportedFormats(): string[] {
    return ['.wav', '.aif', '.aiff', '.aifc', '.raw', '.pcm'];
  }
}
