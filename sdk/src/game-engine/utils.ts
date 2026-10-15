/**
 * Game utility functions for common game development tasks
 */
export class GameUtils {
  /**
   * Generate a random number between min and max (inclusive)
   */
  static random(min: number, max: number): number {
    return Math.floor(Math.random() * (max - min + 1)) + min;
  }

  /**
   * Shuffle an array using Fisher-Yates algorithm
   */
  static shuffle<T>(array: T[]): T[] {
    const shuffled = [...array];
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    return shuffled;
  }

  /**
   * Create a simple dice roll
   */
  static rollDice(sides: number = 6, count: number = 1): number {
    let total = 0;
    for (let i = 0; i < count; i++) {
      total += this.random(1, sides);
    }
    return total;
  }

  /**
   * Generate a random string of specified length
   */
  static randomString(length: number, charset: string = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'): string {
    let result = '';
    for (let i = 0; i < length; i++) {
      result += charset.charAt(Math.floor(Math.random() * charset.length));
    }
    return result;
  }

  /**
   * Calculate percentage and format as string
   */
  static formatPercent(value: number, total: number): string {
    if (total === 0) return '0%';
    return Math.round((value / total) * 100) + '%';
  }

  /**
   * Format number with commas
   */
  static formatNumber(num: number): string {
    return num.toLocaleString();
  }

  /**
   * Clamp a number between min and max
   */
  static clamp(value: number, min: number, max: number): number {
    return Math.min(Math.max(value, min), max);
  }

  /**
   * Check if two arrays are equal
   */
  static arraysEqual<T>(a: T[], b: T[]): boolean {
    if (a.length !== b.length) return false;
    return a.every((val, index) => val === b[index]);
  }

  /**
   * Get unique elements from array
   */
  static unique<T>(array: T[]): T[] {
    return [...new Set(array)];
  }

  /**
   * Count occurrences in array
   */
  static countOccurrences<T>(array: T[], value: T): number {
    return array.filter(item => item === value).length;
  }

  /**
   * Linear interpolation between two values
   */
  static lerp(start: number, end: number, t: number): number {
    return start + (end - start) * t;
  }

  /**
   * Map a value from one range to another
   */
  static map(value: number, inMin: number, inMax: number, outMin: number, outMax: number): number {
    return ((value - inMin) * (outMax - outMin)) / (inMax - inMin) + outMin;
  }

  /**
   * Distance between two points
   */
  static distance(x1: number, y1: number, x2: number, y2: number): number {
    return Math.sqrt((x2 - x1) ** 2 + (y2 - y1) ** 2);
  }

  /**
   * Center text for given width
   */
  static centerText(text: string, width: number = 80): string {
    const padding = Math.max(0, Math.floor((width - text.length) / 2));
    return ' '.repeat(padding) + text;
  }
}
