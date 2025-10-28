/**
 * Parameter Parsing Utility
 * Handles command parameter parsing similar to AmiExpress parseParams
 */

export class ParamsUtil {
  /**
   * Parse space-separated parameters into an array
   * Converts to uppercase and filters empty strings
   *
   * @param paramString - Space-separated parameter string
   * @returns Array of parsed, uppercase parameters
   *
   * @example
   * parseParams("NS R 1-10") // ["NS", "R", "1-10"]
   * parseParams("") // []
   */
  static parse(paramString: string): string[] {
    if (!paramString.trim()) return [];

    return paramString.split(' ')
      .map(p => p.trim().toUpperCase())
      .filter(p => p.length > 0);
  }

  /**
   * Check if a specific flag is present in parameters
   *
   * @param params - Array of parsed parameters
   * @param flag - Flag to check for (case-insensitive)
   * @returns True if flag is present
   */
  static hasFlag(params: string[], flag: string): boolean {
    return params.includes(flag.toUpperCase());
  }

  /**
   * Extract a numeric range from parameters (e.g., "1-10")
   *
   * @param params - Array of parsed parameters
   * @returns Object with start and end numbers, or null if not found
   */
  static extractRange(params: string[]): { start: number; end: number } | null {
    for (const param of params) {
      const match = param.match(/^(\d+)-(\d+)$/);
      if (match) {
        return {
          start: parseInt(match[1], 10),
          end: parseInt(match[2], 10)
        };
      }
    }
    return null;
  }

  /**
   * Extract a single number from parameters
   *
   * @param params - Array of parsed parameters
   * @returns First number found, or null
   */
  static extractNumber(params: string[]): number | null {
    for (const param of params) {
      if (/^\d+$/.test(param)) {
        return parseInt(param, 10);
      }
    }
    return null;
  }

  /**
   * Extract a date from parameters (MM/DD/YY or MM/DD/YYYY)
   *
   * @param params - Array of parsed parameters
   * @returns Date object or null if not found
   */
  static extractDate(params: string[]): Date | null {
    for (const param of params) {
      const match = param.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
      if (match) {
        const month = parseInt(match[1], 10) - 1; // JS months are 0-indexed
        const day = parseInt(match[2], 10);
        let year = parseInt(match[3], 10);

        // Handle 2-digit years
        if (year < 100) {
          year += year < 50 ? 2000 : 1900;
        }

        return new Date(year, month, day);
      }
    }
    return null;
  }
}
