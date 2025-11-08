/**
 * Module Export/Import System
 * Handles JSON and binary .trkmod formats
 */

import { Song, ModuleExport, Pattern, Instrument } from '../data/types';
import * as fs from 'fs';
import * as path from 'path';

export class ExportManager {
  private dataDir: string;

  constructor(dataDir: string) {
    this.dataDir = dataDir;
    this.ensureDataDir();
  }

  /**
   * Ensure data directory exists
   */
  private ensureDataDir(): void {
    if (!fs.existsSync(this.dataDir)) {
      fs.mkdirSync(this.dataDir, { recursive: true });
    }
  }

  /**
   * Export song to JSON format
   */
  exportJSON(song: Song, filename: string): string {
    const moduleData: ModuleExport = {
      version: '1.0',
      song: this.serializeSong(song),
      metadata: {
        created: Date.now(),
        modified: Date.now(),
        format: 'json'
      }
    };

    const json = JSON.stringify(moduleData, null, 2);
    const filepath = path.join(this.dataDir, `${filename}.json`);
    fs.writeFileSync(filepath, json, 'utf8');

    return filepath;
  }

  /**
   * Export song to binary .trkmod format
   */
  exportBinary(song: Song, filename: string): string {
    const moduleData: ModuleExport = {
      version: '1.0',
      song: this.serializeSong(song),
      metadata: {
        created: Date.now(),
        modified: Date.now(),
        format: 'binary'
      }
    };

    // Convert to compact binary format
    const json = JSON.stringify(moduleData);
    const buffer = Buffer.from(json, 'utf8');

    const filepath = path.join(this.dataDir, `${filename}.trkmod`);
    fs.writeFileSync(filepath, buffer);

    return filepath;
  }

  /**
   * Import song from JSON file
   */
  importJSON(filename: string): Song {
    const filepath = path.join(this.dataDir, filename);
    const json = fs.readFileSync(filepath, 'utf8');
    const moduleData: ModuleExport = JSON.parse(json);

    return this.deserializeSong(moduleData.song);
  }

  /**
   * Import song from binary .trkmod file
   */
  importBinary(filename: string): Song {
    const filepath = path.join(this.dataDir, filename);
    const buffer = fs.readFileSync(filepath);
    const json = buffer.toString('utf8');
    const moduleData: ModuleExport = JSON.parse(json);

    return this.deserializeSong(moduleData.song);
  }

  /**
   * List all saved modules
   */
  listModules(): Array<{ name: string; type: 'json' | 'binary'; size: number }> {
    const files = fs.readdirSync(this.dataDir);
    const modules: Array<{ name: string; type: 'json' | 'binary'; size: number }> = [];

    for (const file of files) {
      if (file.endsWith('.json') || file.endsWith('.trkmod')) {
        const filepath = path.join(this.dataDir, file);
        const stats = fs.statSync(filepath);
        modules.push({
          name: file,
          type: file.endsWith('.json') ? 'json' : 'binary',
          size: stats.size
        });
      }
    }

    return modules.sort((a, b) => a.name.localeCompare(b.name));
  }

  /**
   * Serialize song for export (convert Map to Array)
   */
  private serializeSong(song: Song): any {
    return {
      ...song,
      patterns: song.patterns.map(pattern => ({
        ...pattern,
        data: Array.from(pattern.data.entries()).map(([key, note]) => ({
          key,
          note
        }))
      })),
      instruments: song.instruments.map(inst => ({
        ...inst,
        sample: inst.sample ? {
          ...inst.sample,
          data: Array.from(inst.sample.data)
        } : undefined
      }))
    };
  }

  /**
   * Deserialize song from import (convert Array to Map)
   */
  private deserializeSong(data: any): Song {
    return {
      ...data,
      patterns: data.patterns.map((pattern: any) => ({
        ...pattern,
        data: new Map(pattern.data.map((item: any) => [item.key, item.note]))
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
   * Generate game-compatible export
   * Creates a simplified format for Door SDK games
   */
  exportForGame(song: Song, filename: string): string {
    const gameData = {
      title: song.title,
      bpm: song.bpm,
      patterns: song.patterns.map(pattern => {
        const notes: any[] = [];
        pattern.data.forEach((note, key) => {
          const [row, channel] = key.split(':').map(Number);
          if (note.note !== '...' && note.note !== '---') {
            notes.push({
              row,
              channel,
              note: note.note,
              instrument: note.instrument,
              volume: note.volume
            });
          }
        });
        return {
          id: pattern.id,
          rows: pattern.rows,
          notes
        };
      }),
      instruments: song.instruments.map(inst => ({
        id: inst.id,
        name: inst.name,
        type: inst.type,
        envelope: inst.envelope,
        oscillator: inst.oscillator
      })),
      sequence: song.sequence
    };

    const json = JSON.stringify(gameData, null, 2);
    const filepath = path.join(this.dataDir, `${filename}.game.json`);
    fs.writeFileSync(filepath, json, 'utf8');

    return filepath;
  }
}
