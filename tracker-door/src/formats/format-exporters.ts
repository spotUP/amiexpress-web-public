/**
 * Format Exporters
 * Export TrackerDoor songs to XM, IT, and AHX formats
 */

import { Song, Pattern, Instrument, Note } from '../data/types';
import { InstrumentRenderer } from '../utils/instrument-renderer';
import * as fs from 'fs';

/**
 * Export to FastTracker II XM format
 */
export class XMExporter {
  private static readonly NOTES: string[] = [
    'C-', 'C#', 'D-', 'D#', 'E-', 'F-', 'F#', 'G-', 'G#', 'A-', 'A#', 'B-'
  ];

  static async export(song: Song, filepath: string): Promise<void> {
    // Render any synth instruments to samples
    const renderedInstruments = await this.prepareInstruments(song.instruments);

    const numChannels = Math.min(song.channels, 32);
    const numPatterns = Math.max(...song.sequence) + 1;
    const numInstruments = Math.min(renderedInstruments.length, 128);

    // Calculate header size
    const headerSize = 336; // XM header size
    let totalSize = headerSize;

    // Build the XM file in memory
    const parts: Buffer[] = [];

    // Header
    const header = Buffer.alloc(336);
    let offset = 0;

    // ID text
    header.write('Extended Module: ', offset, 17, 'ascii');
    offset += 17;

    // Module name
    header.write(song.title.substring(0, 20).padEnd(20, ' '), offset, 20, 'ascii');
    offset += 20;

    // 0x1A
    header.writeUInt8(0x1A, offset++);

    // Tracker name
    header.write('TrackerDoor       20', offset, 20, 'ascii');
    offset += 20;

    // Version
    header.writeUInt16LE(0x0104, offset); // 1.04
    offset += 2;

    // Header size
    header.writeUInt32LE(276, offset);
    offset += 4;

    // Song length
    header.writeUInt16LE(Math.min(song.sequence.length, 256), offset);
    offset += 2;

    // Restart position
    header.writeUInt16LE(song.loopStart || 0, offset);
    offset += 2;

    // Number of channels
    header.writeUInt16LE(numChannels, offset);
    offset += 2;

    // Number of patterns
    header.writeUInt16LE(numPatterns, offset);
    offset += 2;

    // Number of instruments
    header.writeUInt16LE(numInstruments, offset);
    offset += 2;

    // Flags (linear frequency table)
    header.writeUInt16LE(0x0001, offset);
    offset += 2;

    // Default tempo
    header.writeUInt16LE(song.ticksPerRow || 6, offset);
    offset += 2;

    // Default BPM
    header.writeUInt16LE(song.bpm || 125, offset);
    offset += 2;

    // Pattern order table (256 bytes)
    for (let i = 0; i < 256; i++) {
      header.writeUInt8(i < song.sequence.length ? song.sequence[i] : 0, offset++);
    }

    parts.push(header);

    // Write patterns
    for (let p = 0; p < numPatterns; p++) {
      const pattern = song.patterns.find(pat => pat.id === p);
      const patternData = this.packPattern(pattern, numChannels);
      parts.push(patternData);
    }

    // Write instruments
    for (let i = 0; i < numInstruments; i++) {
      const inst = renderedInstruments[i];
      const instrumentData = await this.packInstrument(inst, i + 1);
      parts.push(instrumentData);
    }

    // Combine all parts and write
    const finalBuffer = Buffer.concat(parts);
    fs.writeFileSync(filepath, finalBuffer);
  }

  private static async prepareInstruments(instruments: Instrument[]): Promise<Instrument[]> {
    const rendered: Instrument[] = [];

    for (const inst of instruments) {
      if (inst.type === 'synth') {
        // Render synth to sample
        const sample = await InstrumentRenderer.renderInstrument(inst, 60);
        rendered.push({
          ...inst,
          type: 'sample',
          sample: {
            data: sample.data,
            sampleRate: sample.sampleRate,
            loopStart: sample.loopStart,
            loopEnd: sample.loopEnd,
            loopEnabled: sample.loopEnabled
          }
        });
      } else {
        rendered.push(inst);
      }
    }

    return rendered;
  }

  private static packPattern(pattern: Pattern | undefined, numChannels: number): Buffer {
    const rows = pattern?.rows || 64;

    // Pack pattern data
    const packedData: number[] = [];

    for (let row = 0; row < rows; row++) {
      for (let ch = 0; ch < numChannels; ch++) {
        const note = pattern?.data.get(`${row}:${ch}`);

        if (!note || note.note === '...') {
          packedData.push(0x80); // Empty note
        } else {
          // Pack note data
          let packByte = 0x80;
          const noteData: number[] = [];

          // Note (already validated not '...')
          packByte |= 0x01;
          const noteNum = this.noteToNumber(note.note);
          noteData.push(noteNum);

          // Instrument
          if (note.instrument) {
            packByte |= 0x02;
            noteData.push(note.instrument);
          }

          // Volume
          if (note.volume !== 0x80) {
            packByte |= 0x04;
            noteData.push(note.volume);
          }

          packedData.push(packByte);
          packedData.push(...noteData);
        }
      }
    }

    // Build pattern header + data
    const patternSize = 9 + packedData.length;
    const buffer = Buffer.alloc(patternSize);
    let offset = 0;

    // Pattern header length
    buffer.writeUInt32LE(9, offset);
    offset += 4;

    // Packing type
    buffer.writeUInt8(0, offset++);

    // Number of rows
    buffer.writeUInt16LE(rows, offset);
    offset += 2;

    // Packed pattern data size
    buffer.writeUInt16LE(packedData.length, offset);
    offset += 2;

    // Write packed data
    packedData.forEach(byte => buffer.writeUInt8(byte, offset++));

    return buffer;
  }

  private static async packInstrument(inst: Instrument, instNum: number): Promise<Buffer> {
    const parts: Buffer[] = [];

    // Instrument header
    const header = Buffer.alloc(263);
    let offset = 0;

    // Instrument header size
    header.writeUInt32LE(263, offset);
    offset += 4;

    // Instrument name
    header.write(inst.name.substring(0, 22).padEnd(22, ' '), offset, 22, 'ascii');
    offset += 22;

    // Instrument type (0 = ignore)
    header.writeUInt8(0, offset++);

    // Number of samples
    const numSamples = inst.sample ? 1 : 0;
    header.writeUInt16LE(numSamples, offset);
    offset += 2;

    if (numSamples > 0) {
      // Sample header size
      header.writeUInt32LE(40, offset);
      offset += 4;

      // Sample number for all notes (96 bytes)
      for (let i = 0; i < 96; i++) {
        header.writeUInt8(0, offset++);
      }

      // Volume envelope (12 points * 4 bytes)
      const volEnv = this.envelopeToXM(inst.envelope);
      volEnv.forEach(point => {
        header.writeUInt16LE(point.x, offset);
        offset += 2;
        header.writeUInt16LE(point.y, offset);
        offset += 2;
      });

      // Panning envelope (12 points * 4 bytes)
      for (let i = 0; i < 12; i++) {
        header.writeUInt16LE(0, offset);
        offset += 2;
        header.writeUInt16LE(32, offset);
        offset += 2;
      }

      // Number of volume points
      header.writeUInt8(volEnv.length, offset++);

      // Number of panning points
      header.writeUInt8(0, offset++);

      // Envelope points
      header.writeUInt8(0, offset++); // Volume sustain
      header.writeUInt8(0, offset++); // Volume loop start
      header.writeUInt8(0, offset++); // Volume loop end
      header.writeUInt8(0, offset++); // Panning sustain
      header.writeUInt8(0, offset++); // Panning loop start
      header.writeUInt8(0, offset++); // Panning loop end

      // Volume type (1 = enabled)
      header.writeUInt8(1, offset++);

      // Panning type
      header.writeUInt8(0, offset++);

      // Vibrato
      header.writeUInt8(0, offset++); // Type
      header.writeUInt8(0, offset++); // Sweep
      header.writeUInt8(0, offset++); // Depth
      header.writeUInt8(0, offset++); // Rate

      // Volume fadeout
      header.writeUInt16LE(0, offset);
      offset += 2;

      // Reserved
      offset += 22;

      parts.push(header);

      // Sample header
      const sampleHeader = Buffer.alloc(40);
      offset = 0;

      // Sample length
      sampleHeader.writeUInt32LE(inst.sample!.data.length, offset);
      offset += 4;

      // Loop start
      sampleHeader.writeUInt32LE(inst.sample!.loopStart || 0, offset);
      offset += 4;

      // Loop length
      const loopLen = inst.sample!.loopEnabled ?
        (inst.sample!.loopEnd || inst.sample!.data.length) - (inst.sample!.loopStart || 0) : 0;
      sampleHeader.writeUInt32LE(loopLen, offset);
      offset += 4;

      // Volume
      sampleHeader.writeUInt8(Math.floor(inst.envelope.sustain * 64), offset++);

      // Finetune
      sampleHeader.writeInt8(0, offset++);

      // Type (0 = no loop, 1 = forward loop, 2 = ping-pong, 16 = 16-bit)
      let sampleType = 0x10; // 16-bit
      if (inst.sample!.loopEnabled) sampleType |= 0x01;
      sampleHeader.writeUInt8(sampleType, offset++);

      // Panning
      sampleHeader.writeUInt8(128, offset++);

      // Relative note
      sampleHeader.writeInt8(0, offset++);

      // Reserved
      sampleHeader.writeUInt8(0, offset++);

      // Sample name
      sampleHeader.write(inst.name.substring(0, 22).padEnd(22, ' '), offset, 22, 'ascii');
      offset += 22;

      parts.push(sampleHeader);

      // Sample data (16-bit)
      const sampleData = Buffer.alloc(inst.sample!.data.length * 2);
      for (let i = 0; i < inst.sample!.data.length; i++) {
        sampleData.writeInt16LE(InstrumentRenderer.floatToInt16(inst.sample!.data[i]), i * 2);
      }
      parts.push(sampleData);
    } else {
      parts.push(header);
    }

    return Buffer.concat(parts);
  }

  private static envelopeToXM(env: { attack: number; decay: number; sustain: number; release: number }): Array<{ x: number; y: number }> {
    const points: Array<{ x: number; y: number }> = [];

    // Attack
    points.push({ x: 0, y: 0 });
    points.push({ x: Math.floor(env.attack * 1000), y: 64 });

    // Decay to sustain
    points.push({ x: Math.floor((env.attack + env.decay) * 1000), y: Math.floor(env.sustain * 64) });

    // Release
    points.push({ x: Math.floor((env.attack + env.decay + env.release) * 1000), y: 0 });

    return points;
  }

  private static noteToNumber(note: string): number {
    if (note === '...' || note === '---') return 0;

    const match = note.match(/([A-G]#?)-?(\d)/);
    if (!match) return 0;

    const [, noteName, octaveStr] = match;
    const noteIndex = this.NOTES.indexOf(noteName);
    const octave = parseInt(octaveStr);

    return octave * 12 + noteIndex + 1;
  }
}

/**
 * Export to Impulse Tracker IT format
 */
export class ITExporter {
  static async export(song: Song, filepath: string): Promise<void> {
    // Similar structure to XM but with IT-specific format
    // For brevity, showing simplified version

    console.warn('IT export not yet fully implemented');

    // Placeholder that writes basic IT structure
    const header = Buffer.alloc(192);
    header.write('IMPM', 0, 4, 'ascii');
    header.write(song.title.substring(0, 26).padEnd(26, '\0'), 4, 26, 'ascii');

    fs.writeFileSync(filepath, header);
  }
}

/**
 * Export to AHX (Abyss Highest Experience) format
 * Note: AHX does not support samples - only chip synthesis
 */
export class AHXExporter {
  static async export(song: Song, filepath: string): Promise<{ success: boolean; warnings: string[] }> {
    const warnings: string[] = [];

    // Check for samples
    const hasSamples = song.instruments.some(i => i.type === 'sample' && i.sample);
    if (hasSamples) {
      warnings.push('WARNING: AHX format does not support samples!');
      warnings.push('All sample-based instruments will be lost.');
      warnings.push('Please remove all samples before exporting to AHX, or use a different format.');

      return { success: false, warnings };
    }

    // AHX export is complex - requires conversion to chip synthesis
    // For now, provide detailed warning
    warnings.push('AHX export requires manual conversion of instruments to chip synthesis.');
    warnings.push('This is a complex format that uses:');
    warnings.push('- Square/sawtooth/triangle waveforms');
    warnings.push('- Ring modulation');
    warnings.push('- Filter effects');
    warnings.push('Automatic conversion is not yet implemented.');

    return { success: false, warnings };
  }

  /**
   * Check if song can be exported to AHX
   */
  static canExport(song: Song): { can: boolean; issues: string[] } {
    const issues: string[] = [];

    // Check for samples
    const sampleInstruments = song.instruments.filter(i => i.type === 'sample' && i.sample);
    if (sampleInstruments.length > 0) {
      issues.push(`${sampleInstruments.length} sample-based instruments detected`);
      issues.push('AHX only supports synthesized instruments');
    }

    // Check channel count
    if (song.channels > 4) {
      issues.push(`Song has ${song.channels} channels, AHX supports maximum 4`);
    }

    // Check pattern length
    const longPatterns = song.patterns.filter(p => p.rows > 64);
    if (longPatterns.length > 0) {
      issues.push(`${longPatterns.length} patterns exceed 64 rows (AHX maximum)`);
    }

    return {
      can: issues.length === 0,
      issues
    };
  }
}
