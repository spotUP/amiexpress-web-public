/**
 * Save Manager - Game State Persistence
 *
 * Handles saving and loading game state for BBS doors.
 *
 * Features:
 * - Multiple save slots
 * - Auto-save functionality
 * - State compression
 * - Save validation
 * - Cloud sync (optional)
 * - Import/export saves
 *
 * @example Basic Usage
 * ```typescript
 * const saveMgr = new SaveManager({ userId: 123 });
 *
 * // Save game state
 * await saveMgr.save(1, {
 *   level: 5,
 *   score: 1000,
 *   inventory: ['sword', 'shield'],
 *   position: { x: 10, y: 20 }
 * });
 *
 * // Load game state
 * const data = await saveMgr.load(1);
 * console.log(data.level); // 5
 * ```
 *
 * @example Auto-save
 * ```typescript
 * saveMgr.enableAutoSave(60000); // Auto-save every minute
 *
 * saveMgr.onAutoSave(() => {
 *   console.log('Game auto-saved!');
 * });
 * ```
 */

import { EventEmitter } from 'events';
import { SaveData } from '../../core/types';
import * as fs from 'fs';
import * as path from 'path';

/**
 * Save manager configuration
 */
export interface SaveManagerConfig {
  /** User ID */
  userId: number;
  /** Game ID/name */
  gameId?: string;
  /** Save directory */
  saveDir?: string;
  /** Max save slots */
  maxSlots?: number;
  /** Enable compression */
  compression?: boolean;
  /** Enable cloud sync */
  cloudSync?: boolean;
}

/**
 * Save metadata
 */
export interface SaveMetadata {
  /** Save slot */
  slot: number;
  /** Save name/description */
  name?: string;
  /** Timestamp */
  timestamp: Date;
  /** Progress percentage */
  progress: number;
  /** Playtime (seconds) */
  playtime: number;
  /** Level/chapter name */
  location?: string;
  /** Screenshot/preview */
  preview?: string;
}

/**
 * Save Manager
 * Handles game state persistence
 */
export class SaveManager extends EventEmitter {
  private config: Required<Omit<SaveManagerConfig, 'cloudSync'>> & { cloudSync?: boolean };
  private saves: Map<number, SaveData> = new Map();
  private autoSaveTimer?: NodeJS.Timeout;
  private autoSaveInterval: number = 0;
  private currentSlot?: number;

  constructor(config: SaveManagerConfig) {
    super();

    this.config = {
      userId: config.userId,
      gameId: config.gameId || 'default',
      saveDir: config.saveDir || './saves',
      maxSlots: config.maxSlots || 10,
      compression: config.compression ?? false,
      cloudSync: config.cloudSync
    };

    this.ensureSaveDirectory();
    this.loadAllSaves();
  }

  /**
   * Save game state to slot
   */
  async save(slot: number, state: Record<string, any>, metadata?: Partial<SaveMetadata>): Promise<void> {
    if (slot < 1 || slot > this.config.maxSlots) {
      throw new Error(`Invalid save slot: ${slot} (must be 1-${this.config.maxSlots})`);
    }

    const saveData: SaveData = {
      slot,
      timestamp: new Date(),
      state,
      progress: metadata?.progress || 0,
      metadata: {
        name: metadata?.name,
        playtime: metadata?.playtime || 0,
        location: metadata?.location,
        preview: metadata?.preview,
        ...metadata
      }
    };

    this.saves.set(slot, saveData);
    this.currentSlot = slot;

    await this.writeSaveFile(saveData);

    this.emit('save-created', saveData);

    if (this.config.cloudSync) {
      await this.syncToCloud(saveData);
    }
  }

  /**
   * Load game state from slot
   */
  async load(slot: number): Promise<SaveData | null> {
    const saveData = this.saves.get(slot);
    if (!saveData) {
      // Try loading from file
      const loaded = await this.readSaveFile(slot);
      if (loaded) {
        this.saves.set(slot, loaded);
        this.currentSlot = slot;
        this.emit('save-loaded', loaded);
        return loaded;
      }
      return null;
    }

    this.currentSlot = slot;
    this.emit('save-loaded', saveData);
    return saveData;
  }

  /**
   * Delete save slot
   */
  async delete(slot: number): Promise<void> {
    this.saves.delete(slot);
    await this.deleteSaveFile(slot);
    this.emit('save-deleted', slot);
  }

  /**
   * Get save metadata
   */
  getMetadata(slot: number): SaveMetadata | null {
    const saveData = this.saves.get(slot);
    if (!saveData) return null;

    return {
      slot: saveData.slot,
      name: saveData.metadata.name,
      timestamp: saveData.timestamp,
      progress: saveData.progress,
      playtime: saveData.metadata.playtime || 0,
      location: saveData.metadata.location,
      preview: saveData.metadata.preview
    };
  }

  /**
   * List all save slots with metadata
   */
  listSaves(): SaveMetadata[] {
    const metadata: SaveMetadata[] = [];

    for (let slot = 1; slot <= this.config.maxSlots; slot++) {
      const meta = this.getMetadata(slot);
      if (meta) {
        metadata.push(meta);
      }
    }

    return metadata.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
  }

  /**
   * Check if slot has save
   */
  hasSave(slot: number): boolean {
    return this.saves.has(slot);
  }

  /**
   * Get current save slot
   */
  getCurrentSlot(): number | undefined {
    return this.currentSlot;
  }

  /**
   * Quick save to current slot
   */
  async quickSave(state: Record<string, any>): Promise<void> {
    if (!this.currentSlot) {
      this.currentSlot = this.findNextFreeSlot();
    }

    await this.save(this.currentSlot, state, { name: 'Quick Save' });
  }

  /**
   * Auto-save to dedicated slot
   */
  async autoSave(state: Record<string, any>): Promise<void> {
    const autoSaveSlot = this.config.maxSlots; // Use last slot for auto-save
    await this.save(autoSaveSlot, state, { name: 'Auto Save' });
    this.emit('auto-save', autoSaveSlot);
  }

  /**
   * Enable auto-save with interval
   */
  enableAutoSave(intervalMs: number, getState: () => Record<string, any>): void {
    this.disableAutoSave();

    this.autoSaveInterval = intervalMs;
    this.autoSaveTimer = setInterval(async () => {
      try {
        const state = getState();
        await this.autoSave(state);
      } catch (error) {
        this.emit('auto-save-error', error);
      }
    }, intervalMs);

    this.emit('auto-save-enabled', intervalMs);
  }

  /**
   * Disable auto-save
   */
  disableAutoSave(): void {
    if (this.autoSaveTimer) {
      clearInterval(this.autoSaveTimer);
      this.autoSaveTimer = undefined;
      this.emit('auto-save-disabled');
    }
  }

  /**
   * Export save to file
   */
  async exportSave(slot: number, filePath: string): Promise<void> {
    const saveData = this.saves.get(slot);
    if (!saveData) throw new Error(`No save in slot ${slot}`);

    const json = JSON.stringify(saveData, null, 2);
    await fs.promises.writeFile(filePath, json, 'utf8');

    this.emit('save-exported', slot, filePath);
  }

  /**
   * Import save from file
   */
  async importSave(filePath: string, slot?: number): Promise<number> {
    const json = await fs.promises.readFile(filePath, 'utf8');
    const saveData: SaveData = JSON.parse(json);

    const targetSlot = slot || saveData.slot || this.findNextFreeSlot();
    saveData.slot = targetSlot;

    this.saves.set(targetSlot, saveData);
    await this.writeSaveFile(saveData);

    this.emit('save-imported', targetSlot, filePath);
    return targetSlot;
  }

  /**
   * Copy save to another slot
   */
  async copySave(fromSlot: number, toSlot: number): Promise<void> {
    const saveData = this.saves.get(fromSlot);
    if (!saveData) throw new Error(`No save in slot ${fromSlot}`);

    const copy = JSON.parse(JSON.stringify(saveData));
    copy.slot = toSlot;
    copy.timestamp = new Date();

    await this.save(toSlot, copy.state, copy.metadata);
    this.emit('save-copied', fromSlot, toSlot);
  }

  /**
   * Validate save data integrity
   */
  validateSave(slot: number): boolean {
    const saveData = this.saves.get(slot);
    if (!saveData) return false;

    // Basic validation
    if (!saveData.state || typeof saveData.state !== 'object') {
      return false;
    }

    if (!saveData.timestamp || !(saveData.timestamp instanceof Date)) {
      return false;
    }

    // Could add checksum validation here
    return true;
  }

  /**
   * Find next available save slot
   */
  private findNextFreeSlot(): number {
    for (let slot = 1; slot <= this.config.maxSlots; slot++) {
      if (!this.saves.has(slot)) {
        return slot;
      }
    }
    return 1; // Overwrite first slot if all full
  }

  /**
   * Ensure save directory exists
   */
  private ensureSaveDirectory(): void {
    const dir = this.getSaveDirectory();
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
  }

  /**
   * Get save directory path
   */
  private getSaveDirectory(): string {
    return path.join(this.config.saveDir, this.config.gameId, String(this.config.userId));
  }

  /**
   * Get save file path
   */
  private getSaveFilePath(slot: number): string {
    return path.join(this.getSaveDirectory(), `save_${slot}.json`);
  }

  /**
   * Write save to file
   */
  private async writeSaveFile(saveData: SaveData): Promise<void> {
    const filePath = this.getSaveFilePath(saveData.slot);
    let data = JSON.stringify(saveData, null, 2);

    if (this.config.compression) {
      // In production, use actual compression (zlib, etc.)
      // For now, just write as-is
    }

    await fs.promises.writeFile(filePath, data, 'utf8');
  }

  /**
   * Read save from file
   */
  private async readSaveFile(slot: number): Promise<SaveData | null> {
    const filePath = this.getSaveFilePath(slot);

    if (!fs.existsSync(filePath)) {
      return null;
    }

    try {
      const data = await fs.promises.readFile(filePath, 'utf8');
      const saveData: SaveData = JSON.parse(data);

      // Convert timestamp string to Date
      if (typeof saveData.timestamp === 'string') {
        saveData.timestamp = new Date(saveData.timestamp);
      }

      return saveData;
    } catch (error) {
      this.emit('load-error', slot, error);
      return null;
    }
  }

  /**
   * Delete save file
   */
  private async deleteSaveFile(slot: number): Promise<void> {
    const filePath = this.getSaveFilePath(slot);

    if (fs.existsSync(filePath)) {
      await fs.promises.unlink(filePath);
    }
  }

  /**
   * Load all saves from disk
   */
  private loadAllSaves(): void {
    const dir = this.getSaveDirectory();
    if (!fs.existsSync(dir)) return;

    const files = fs.readdirSync(dir);

    for (const file of files) {
      if (file.startsWith('save_') && file.endsWith('.json')) {
        const slot = parseInt(file.match(/save_(\d+)\.json/)?.[1] || '0');
        if (slot > 0 && slot <= this.config.maxSlots) {
          this.readSaveFile(slot).then(saveData => {
            if (saveData) {
              this.saves.set(slot, saveData);
            }
          });
        }
      }
    }
  }

  /**
   * Sync save to cloud (placeholder)
   */
  private async syncToCloud(saveData: SaveData): Promise<void> {
    // In production, implement actual cloud sync
    // For now, just emit event
    this.emit('cloud-sync', saveData);
  }

  /**
   * Event: Auto-save triggered
   */
  onAutoSave(callback: () => void): void {
    this.on('auto-save', callback);
  }

  /**
   * Cleanup
   */
  dispose(): void {
    this.disableAutoSave();
    this.saves.clear();
    this.removeAllListeners();
  }
}
