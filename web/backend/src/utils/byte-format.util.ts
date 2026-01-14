/**
 * Byte Formatting Utility
 *
 * Provides consistent byte-to-human-readable formatting across the codebase.
 * Consolidated from multiple duplicate implementations.
 */

export interface FormatBytesOptions {
  /** Minimum width for padding (default: no padding) */
  width?: number;
  /** Use compact format without space (e.g., "1.5MB" vs "1.5 MB") */
  compact?: boolean;
  /** Number of decimal places (default: auto based on size) */
  decimals?: number;
}

/**
 * Format bytes to human-readable string with appropriate unit suffix.
 *
 * @param bytes - Number of bytes to format
 * @param options - Formatting options
 * @returns Formatted string like "1.5 MB" or "1.5MB" (compact)
 *
 * @example
 * formatBytes(1536) // "1.5 KB"
 * formatBytes(1536, { compact: true }) // "1.5KB"
 * formatBytes(1536, { width: 12 }) // "      1.5 KB"
 * formatBytes(0) // "0 B"
 */
export function formatBytes(bytes: number, options: FormatBytesOptions = {}): string {
  const { width, compact = false, decimals } = options;
  const separator = compact ? '' : ' ';

  if (bytes === 0) {
    const result = `0${separator}B`;
    return width ? result.padStart(width, ' ') : result;
  }

  if (bytes < 0) {
    const result = `0${separator}B`;
    return width ? result.padStart(width, ' ') : result;
  }

  let value: number;
  let suffix: string;

  if (bytes >= 1073741824) { // 1 GB
    value = bytes / 1073741824;
    suffix = 'GB';
  } else if (bytes >= 1048576) { // 1 MB
    value = bytes / 1048576;
    suffix = 'MB';
  } else if (bytes >= 1024) { // 1 KB
    value = bytes / 1024;
    suffix = 'KB';
  } else {
    value = bytes;
    suffix = 'B';
  }

  // Determine decimal places
  let decimalPlaces: number;
  if (decimals !== undefined) {
    decimalPlaces = decimals;
  } else {
    // Auto: 0 decimals for large values, 1-2 for smaller
    if (value >= 100) {
      decimalPlaces = 0;
    } else if (value >= 10) {
      decimalPlaces = 1;
    } else {
      decimalPlaces = 2;
    }
  }

  const numStr = value.toFixed(decimalPlaces);
  const result = `${numStr}${separator}${suffix}`;

  return width ? result.padStart(width, ' ') : result;
}

/**
 * Format bytes for BBS display (compact format without decimal for KB).
 * Matches original AmiExpress display style.
 *
 * @param bytes - Number of bytes to format
 * @returns Compact formatted string like "1536KB"
 */
export function formatBytesCompact(bytes: number): string {
  if (bytes === 0) return '0';
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1048576) return `${Math.round(bytes / 1024)}KB`;
  if (bytes < 1073741824) return `${(bytes / 1048576).toFixed(2)}MB`;
  return `${(bytes / 1073741824).toFixed(2)}GB`;
}

/**
 * Format bytes with fixed width padding (for aligned column output).
 *
 * @param bytes - Number of bytes to format
 * @param width - Minimum width (pads with spaces on left)
 * @returns Padded formatted string
 */
export function formatBytesPadded(bytes: number, width: number): string {
  return formatBytes(bytes, { width });
}
