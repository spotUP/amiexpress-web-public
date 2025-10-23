/**
 * Directory Span Utility
 * Port from express.e:26857+ getDirSpan()
 *
 * Parses directory range input for file listings:
 * - "U" = Upload directory only (maxDirs)
 * - "A" = All directories (1 to maxDirs)
 * - "H" = HOLD directory (-1)
 * - "L" = Local/LCFILES directory (0)
 * - Number = Specific directory
 * - "1-5" = Range (future enhancement)
 */

export interface DirSpan {
  startDir: number;   // Starting directory number
  endDir: number;     // Ending directory number (-1 = HOLD, 0 = LCFILES)
  success: boolean;   // Parse success
  error?: string;     // Error message if failed
}

/**
 * Parse directory span from user input
 * Port from express.e:26857+ getDirSpan()
 *
 * @param input - User input string (e.g., "A", "U", "H", "1", "5")
 * @param maxDirs - Maximum directory number in conference
 * @param hasHoldAccess - Whether user can access HOLD directory
 * @returns DirSpan object with startDir and endDir
 */
export function parseDirSpan(
  input: string,
  maxDirs: number,
  hasHoldAccess: boolean = false
): DirSpan {
  // Empty input = prompt user (caller should handle)
  if (!input || input.trim().length === 0) {
    return {
      startDir: 0,
      endDir: 0,
      success: false,
      error: 'No directory specified'
    };
  }

  const trimmed = input.trim().toUpperCase();
  const firstChar = trimmed[0];

  // U = Upload directory only
  if (firstChar === 'U') {
    return {
      startDir: maxDirs,
      endDir: maxDirs,
      success: true
    };
  }

  // A = All directories
  if (firstChar === 'A') {
    return {
      startDir: 1,
      endDir: maxDirs,
      success: true
    };
  }

  // L = Local/LCFILES directory
  if (firstChar === 'L') {
    return {
      startDir: 0,
      endDir: 0,
      success: true
    };
  }

  // H = HOLD directory (requires permission)
  if (firstChar === 'H') {
    if (hasHoldAccess) {
      return {
        startDir: -1,
        endDir: -1,
        success: true
      };
    } else {
      return {
        startDir: 0,
        endDir: 0,
        success: false,
        error: 'No access to HOLD directory'
      };
    }
  }

  // Numeric input = specific directory
  const dirNum = parseInt(trimmed);
  if (!isNaN(dirNum)) {
    if (dirNum < 1 || dirNum > maxDirs) {
      return {
        startDir: 0,
        endDir: 0,
        success: false,
        error: `No such directory (1-${maxDirs})`
      };
    }

    return {
      startDir: dirNum,
      endDir: dirNum,
      success: true
    };
  }

  // Invalid input
  return {
    startDir: 0,
    endDir: 0,
    success: false,
    error: 'Invalid directory specification'
  };
}

/**
 * Generate directory selection prompt
 * Port from express.e:26857+ getDirSpan()
 */
export function getDirSpanPrompt(maxDirs: number, hasHoldAccess: boolean): string {
  if (hasHoldAccess) {
    return `\x1b[36mDirectories: \x1b[32m(\x1b[33m1-${maxDirs}\x1b[32m)\x1b[36m, \x1b[32m(\x1b[33mA\x1b[32m)\x1b[36mll, \x1b[32m(\x1b[33mU\x1b[32m)\x1b[36mpload, \x1b[32m(\x1b[33mH\x1b[32m)\x1b[36mold, \x1b[32m(\x1b[33mEnter\x1b[32m)\x1b[36m=none? \x1b[0m`;
  } else {
    return `\x1b[36mDirectories: \x1b[32m(\x1b[33m1-${maxDirs}\x1b[32m)\x1b[36m, \x1b[32m(\x1b[33mA\x1b[32m)\x1b[36mll, \x1b[32m(\x1b[33mU\x1b[32m)\x1b[36mpload, \x1b[32m(\x1b[33mEnter\x1b[32m)\x1b[36m=none? \x1b[0m`;
  }
}

/**
 * Get directory display name
 */
export function getDirDisplayName(dirNum: number, maxDirs: number): string {
  if (dirNum === -1) return 'HOLD';
  if (dirNum === 0) return 'LCFILES';
  if (dirNum === maxDirs) return `${dirNum} (Upload)`;
  return `${dirNum}`;
}

/**
 * Check if directory number is valid
 */
export function isValidDirNum(dirNum: number, maxDirs: number, hasHoldAccess: boolean): boolean {
  if (dirNum === -1 && hasHoldAccess) return true; // HOLD
  if (dirNum === 0) return true; // LCFILES
  if (dirNum >= 1 && dirNum <= maxDirs) return true;
  return false;
}
