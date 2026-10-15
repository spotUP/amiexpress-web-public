/**
 * Menu shortcut handling (express.e:6567-6575, 28469-28479)
 * Loads .keys files and exposes a map of key -> command
 */
import * as fs from 'fs';

export class ShortcutMap {
  private map = new Map<string, string>();

  clear() {
    this.map.clear();
  }

  load(filePath: string) {
    this.clear();
    const content = fs.readFileSync(filePath, 'utf-8');
    const lines = content.split(/\r?\n/);
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;  // Skip empty lines after trimming
      const sep = trimmed.indexOf('=');
      if (sep >= 0) {
        const key = trimmed.substring(0, sep).trim().toUpperCase();
        const value = trimmed.substring(sep + 1).trim();
        this.map.set(key, value);
      } else {
        this.map.set(trimmed.toUpperCase(), trimmed);
      }
    }
  }

  get(key: string): string | undefined {
    return this.map.get(key.toUpperCase());
  }

  entries(): Array<[string, string]> {
    return Array.from(this.map.entries());
  }
}
