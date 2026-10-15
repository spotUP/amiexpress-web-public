/**
 * Conditional debug logging utility
 *
 * Only logs when DEBUG_68K environment variable is set to '1' or 'true'
 * This prevents console.log overhead in production/normal mode
 */

const DEBUG_ENABLED = process.env.DEBUG_68K === '1' || process.env.DEBUG_68K === 'true';

/**
 * Debug log - only outputs when DEBUG_68K is enabled
 */
export function debugLog(...args: unknown[]): void {
  if (DEBUG_ENABLED) {
    console.log(...args);
  }
}

/**
 * Debug warn - only outputs when DEBUG_68K is enabled
 */
export function debugWarn(...args: unknown[]): void {
  if (DEBUG_ENABLED) {
    console.warn(...args);
  }
}

/**
 * Check if debug mode is enabled
 */
export function isDebugEnabled(): boolean {
  return DEBUG_ENABLED;
}
