/**
 * Security Level Constants
 *
 * Defines standard security level thresholds used throughout AmiExpress.
 * Security levels range from 0-255.
 * Based on AmiExpress express.e security level usage patterns
 *
 * ACS level files use multiples of 5 (0, 5, 10, 15, ..., 255) for organization,
 * but user.secLevel can be any value 0-255.
 */

/**
 * Standard Security Level Thresholds
 */
export const SecurityLevel = {
  /** Locked out / No access */
  LOCKED: 0,

  /** New user (minimal access) */
  NEW_USER: 10,

  /** Regular user (basic access) */
  REGULAR_USER: 20,

  /** Validated user (full user access) */
  VALIDATED_USER: 50,

  /** Co-Sysop (elevated privileges) */
  CO_SYSOP: 100,

  /** High-level Sysop (advanced privileges) */
  HIGH_SYSOP: 200,

  /** Full Sysop (all privileges) */
  FULL_SYSOP: 255
} as const;

/**
 * Security Level Descriptions
 */
export const SecurityLevelNames: Record<number, string> = {
  0: 'Locked Out',
  10: 'New User',
  20: 'Regular User',
  50: 'Validated User',
  100: 'Co-Sysop',
  200: 'High Sysop',
  255: 'Full Sysop'
};

/**
 * Get security level name for a given level
 * @param level - Security level (0-255)
 * @returns Human-readable security level name
 */
export function getSecurityLevelName(level: number): string {
  // Find closest matching level
  if (level === 0) return SecurityLevelNames[0];
  if (level < 10) return `Level ${level}`;
  if (level < 20) return SecurityLevelNames[10];
  if (level < 50) return SecurityLevelNames[20];
  if (level < 100) return SecurityLevelNames[50];
  if (level < 200) return SecurityLevelNames[100];
  if (level < 255) return SecurityLevelNames[200];
  return SecurityLevelNames[255];
}

/**
 * ACS Level File Step
 * ACS access files use multiples of 5
 */
export const ACS_LEVEL_STEP = 5;

/**
 * Find the appropriate ACS level file for a given security level
 * Rounds down to nearest multiple of 5
 * Based on express.e findAcsLevel() - lines 3025-3035
 *
 * @param secLevel - User's security level (0-255)
 * @returns ACS level for file lookup (0, 5, 10, ..., 255)
 */
export function findAcsLevel(secLevel: number): number {
  return Math.floor(secLevel / ACS_LEVEL_STEP) * ACS_LEVEL_STEP;
}
