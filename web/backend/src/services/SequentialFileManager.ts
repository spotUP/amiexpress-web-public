/**
 * Sequential File Manager - Sequential File Display Counter Storage
 *
 * Manages sequential file display counters for ~SX_ MCI code.
 * Based on express.e lines 5505-5530.
 */

import * as fs from 'fs';
import * as path from 'path';

export class SequentialFileManager {
  private counterDir: string;
  private counters: Map<string, number> = new Map();

  constructor(counterDir: string = './data/counters') {
    this.counterDir = counterDir;
    // Ensure counter directory exists
    if (!fs.existsSync(counterDir)) {
      fs.mkdirSync(counterDir, { recursive: true });
    }
  }

  /**
   * Read counter value from file
   * Returns -1 if counter doesn't exist (first time)
   */
  private readCounter(basePath: string): number {
    const counterFile = this.getCounterFilePath(basePath);

    // Check memory cache first
    if (this.counters.has(basePath)) {
      return this.counters.get(basePath)!;
    }

    // Try to read from disk
    try {
      if (fs.existsSync(counterFile)) {
        const content = fs.readFileSync(counterFile, 'utf-8');
        const value = parseInt(content.trim(), 10);
        if (!isNaN(value)) {
          this.counters.set(basePath, value);
          return value;
        }
      }
    } catch (error) {
      console.error(`[SequentialFileManager] Error reading counter for ${basePath}:`, error);
    }

    return -1; // Counter doesn't exist
  }

  /**
   * Write counter value to file
   */
  private writeCounter(basePath: string, value: number): void {
    const counterFile = this.getCounterFilePath(basePath);

    try {
      fs.writeFileSync(counterFile, value.toString(), 'utf-8');
      this.counters.set(basePath, value);
    } catch (error) {
      console.error(`[SequentialFileManager] Error writing counter for ${basePath}:`, error);
    }
  }

  /**
   * Get counter file path for a base path
   */
  private getCounterFilePath(basePath: string): string {
    // Convert path to safe filename (replace special chars with underscores)
    const safeFilename = basePath.replace(/[^a-zA-Z0-9]/g, '_') + '.counter';
    return path.join(this.counterDir, safeFilename);
  }

  /**
   * Get next sequential file number
   * Returns: { number: N, filename: "base.N" }
   * If current counter is 3, returns 4 and updates counter to 4
   * If counter doesn't exist, starts at 1
   */
  getNextFile(basePath: string): { number: number; filename: string } {
    let currentValue = this.readCounter(basePath);

    if (currentValue === -1) {
      // First time - start at 1
      currentValue = 1;
    } else {
      // Increment
      currentValue++;
    }

    // Write new value
    this.writeCounter(basePath, currentValue);

    // Extract directory and basename
    const dirname = path.dirname(basePath);
    const basename = path.basename(basePath);

    // Format: base.N (with 3-digit zero-padded number like express.e)
    const filename = path.join(dirname, `${basename}.${currentValue}`);

    return {
      number: currentValue,
      filename
    };
  }

  /**
   * Reset counter to start from beginning
   */
  resetCounter(basePath: string): void {
    this.writeCounter(basePath, 0);
  }

  /**
   * Get current counter value without incrementing
   */
  getCurrentValue(basePath: string): number {
    const value = this.readCounter(basePath);
    return value === -1 ? 0 : value;
  }
}

// Singleton instance
export const sequentialFileManager = new SequentialFileManager();
