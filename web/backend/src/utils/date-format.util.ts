/**
 * Date Formatting Utility
 *
 * Provides consistent date formatting across the codebase.
 * Consolidated from multiple duplicate implementations.
 */

export type DateSeparator = '-' | '/';

export interface FormatDateOptions {
  /** Separator character (default: '/') */
  separator?: DateSeparator;
  /** Include full 4-digit year instead of 2-digit (default: false) */
  fullYear?: boolean;
}

/**
 * Format a date to MM/DD/YY or MM-DD-YY format.
 *
 * @param date - Date object or date string to format
 * @param options - Formatting options
 * @returns Formatted date string like "01/15/25" or "01-15-25"
 *
 * @example
 * formatDate(new Date('2025-01-15')) // "01/15/25"
 * formatDate(new Date('2025-01-15'), { separator: '-' }) // "01-15-25"
 * formatDate('2025-01-15') // "01/15/25"
 */
export function formatDate(date: Date | string, options: FormatDateOptions = {}): string {
  const { separator = '/', fullYear = false } = options;

  const d = typeof date === 'string' ? new Date(date) : date;

  // Handle invalid dates
  if (isNaN(d.getTime())) {
    return `00${separator}00${separator}00`;
  }

  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  const year = fullYear
    ? String(d.getFullYear())
    : String(d.getFullYear()).slice(-2);

  return `${month}${separator}${day}${separator}${year}`;
}

/**
 * Format a date with slash separator (MM/DD/YY).
 * Convenience wrapper for common use case.
 *
 * @param date - Date object or date string
 * @returns Formatted date string like "01/15/25"
 */
export function formatDateSlash(date: Date | string): string {
  return formatDate(date, { separator: '/' });
}

/**
 * Format a date with dash separator (MM-DD-YY).
 * Convenience wrapper for common use case.
 *
 * @param date - Date object or date string
 * @returns Formatted date string like "01-15-25"
 */
export function formatDateDash(date: Date | string): string {
  return formatDate(date, { separator: '-' });
}

/**
 * Format a time to HH:MM:SS format.
 *
 * @param date - Date object to format
 * @param includeSeconds - Include seconds (default: true)
 * @returns Formatted time string like "14:30:00" or "14:30"
 */
export function formatTime(date: Date, includeSeconds: boolean = true): string {
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');

  if (includeSeconds) {
    const seconds = String(date.getSeconds()).padStart(2, '0');
    return `${hours}:${minutes}:${seconds}`;
  }

  return `${hours}:${minutes}`;
}

/**
 * Format date and time together.
 *
 * @param date - Date object to format
 * @param options - Date formatting options
 * @returns Formatted date and time like "01/15/25 14:30:00"
 */
export function formatDateTime(date: Date, options: FormatDateOptions = {}): string {
  return `${formatDate(date, options)} ${formatTime(date)}`;
}
