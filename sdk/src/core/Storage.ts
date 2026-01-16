/**
 * Storage - Persistent Data Storage API
 *
 * Provides clean API for saving/loading door data
 */

import * as fs from 'fs';
import * as path from 'path';
import type { StorageAPI, StorageOptions } from './types';

export class Storage implements StorageAPI {
  private storageDir: string;

  constructor(options: StorageOptions, baseDir: string = process.cwd()) {
    const { doorName, userId, global } = options;

    // Build storage path
    let storagePath = path.join(baseDir, 'data', 'doors', doorName);

    if (!global && userId) {
      storagePath = path.join(storagePath, 'users', userId);
    } else if (!global) {
      throw new Error('Storage requires either userId or global flag');
    }

    this.storageDir = storagePath;

    // Ensure directory exists
    if (!fs.existsSync(this.storageDir)) {
      fs.mkdirSync(this.storageDir, { recursive: true });
    }
  }

  // ===== Core Methods =====

  async save(key: string, data: any): Promise<void> {
    const filePath = this.getFilePath(key);
    const json = JSON.stringify(data, null, 2);
    fs.writeFileSync(filePath, json, 'utf8');
  }

  async load<T = any>(key: string): Promise<T | null> {
    const filePath = this.getFilePath(key);

    if (!fs.existsSync(filePath)) {
      return null;
    }

    try {
      const json = fs.readFileSync(filePath, 'utf8');
      return JSON.parse(json) as T;
    } catch (error) {
      console.error(`[Storage] Error loading ${key}:`, error);
      return null;
    }
  }

  async delete(key: string): Promise<void> {
    const filePath = this.getFilePath(key);

    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }
  }

  async exists(key: string): Promise<boolean> {
    const filePath = this.getFilePath(key);
    return fs.existsSync(filePath);
  }

  async keys(): Promise<string[]> {
    if (!fs.existsSync(this.storageDir)) {
      return [];
    }

    const allEntries = fs.readdirSync(this.storageDir);

    const files = allEntries
      .filter(f => f.endsWith('.json'))
      .map(f => f.replace(/\.json$/, ''));

    return files;
  }

  async clear(): Promise<void> {
    const allKeys = await this.keys();
    for (const key of allKeys) {
      await this.delete(key);
    }
  }

  // ===== Helper Methods =====

  private getFilePath(key: string): string {
    const filename = `${key}.json`;
    return path.join(this.storageDir, filename);
  }

  getStorageDir(): string {
    return this.storageDir;
  }
}
