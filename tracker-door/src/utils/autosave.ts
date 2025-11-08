/**
 * Auto-save System
 * Automatically saves work at regular intervals
 */

import { Song } from '../data/types';
import { ExportManager } from './export';
import * as fs from 'fs';
import * as path from 'path';

export class AutoSaveManager {
  private exportManager: ExportManager;
  private interval: NodeJS.Timeout | null = null;
  private autoSaveInterval: number = 120000; // 2 minutes
  private lastSaveTime: number = 0;
  private autoSaveDir: string;
  private maxAutoSaves: number = 5;

  constructor(dataDir: string, intervalMs?: number) {
    this.exportManager = new ExportManager(dataDir);
    this.autoSaveDir = path.join(dataDir, 'autosave');
    if (intervalMs) {
      this.autoSaveInterval = intervalMs;
    }

    // Ensure autosave directory exists
    if (!fs.existsSync(this.autoSaveDir)) {
      fs.mkdirSync(this.autoSaveDir, { recursive: true });
    }
  }

  /**
   * Start auto-save timer
   */
  start(getSongCallback: () => Song): void {
    if (this.interval) {
      this.stop();
    }

    this.interval = setInterval(() => {
      this.save(getSongCallback());
    }, this.autoSaveInterval);
  }

  /**
   * Stop auto-save timer
   */
  stop(): void {
    if (this.interval) {
      clearInterval(this.interval);
      this.interval = null;
    }
  }

  /**
   * Perform auto-save
   */
  save(song: Song): void {
    const now = Date.now();
    this.lastSaveTime = now;

    const timestamp = new Date(now).toISOString().replace(/[:.]/g, '-');
    const filename = `autosave_${timestamp}`;
    const filepath = path.join(this.autoSaveDir, `${filename}.json`);

    try {
      const exportData = {
        version: '1.0',
        song: this.serializeSong(song),
        metadata: {
          created: now,
          modified: now,
          format: 'json',
          autosave: true
        }
      };

      fs.writeFileSync(filepath, JSON.stringify(exportData, null, 2), 'utf8');

      // Clean up old auto-saves
      this.cleanupOldAutoSaves();
    } catch (error) {
      console.error('Auto-save failed:', error);
    }
  }

  /**
   * Get list of auto-save files
   */
  listAutoSaves(): Array<{ filename: string; time: Date; size: number }> {
    if (!fs.existsSync(this.autoSaveDir)) {
      return [];
    }

    const files = fs.readdirSync(this.autoSaveDir);
    const autoSaves: Array<{ filename: string; time: Date; size: number }> = [];

    for (const file of files) {
      if (file.startsWith('autosave_') && file.endsWith('.json')) {
        const filepath = path.join(this.autoSaveDir, file);
        const stats = fs.statSync(filepath);
        autoSaves.push({
          filename: file,
          time: stats.mtime,
          size: stats.size
        });
      }
    }

    return autoSaves.sort((a, b) => b.time.getTime() - a.time.getTime());
  }

  /**
   * Load auto-save file
   */
  loadAutoSave(filename: string): Song {
    const filepath = path.join(this.autoSaveDir, filename);
    const json = fs.readFileSync(filepath, 'utf8');
    const data = JSON.parse(json);

    return this.deserializeSong(data.song);
  }

  /**
   * Delete auto-save file
   */
  deleteAutoSave(filename: string): void {
    const filepath = path.join(this.autoSaveDir, filename);
    if (fs.existsSync(filepath)) {
      fs.unlinkSync(filepath);
    }
  }

  /**
   * Clean up old auto-saves, keeping only the most recent
   */
  private cleanupOldAutoSaves(): void {
    const autoSaves = this.listAutoSaves();

    if (autoSaves.length > this.maxAutoSaves) {
      const toDelete = autoSaves.slice(this.maxAutoSaves);
      for (const autosave of toDelete) {
        this.deleteAutoSave(autosave.filename);
      }
    }
  }

  /**
   * Get time since last save
   */
  getTimeSinceLastSave(): number {
    return Date.now() - this.lastSaveTime;
  }

  /**
   * Check if auto-save is enabled
   */
  isEnabled(): boolean {
    return this.interval !== null;
  }

  /**
   * Serialize song for storage
   */
  private serializeSong(song: Song): any {
    return {
      ...song,
      patterns: song.patterns.map(pattern => ({
        ...pattern,
        data: Array.from(pattern.data.entries()).map(([key, note]) => ({ key, note }))
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
   * Deserialize song from storage
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
}
