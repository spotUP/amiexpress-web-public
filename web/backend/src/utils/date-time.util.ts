/**
 * Date/Time Utility Functions
 *
 * Implements MiscFuncs.e date/time functions for AmiExpress compatibility.
 * All functions match express.e formatting and behavior.
 */

/**
 * Get current system time
 * Equivalent to MiscFuncs.e getSystemTime()
 *
 * Express.e usage: 74 instances
 * Centralizes time handling for consistency across BBS
 *
 * @returns Current Date object
 */
export function getSystemTime(): Date {
  return new Date();
}

/**
 * Get current system date (alias for compatibility)
 * @returns Current Date object
 */
export function getSystemDate(): Date {
  return new Date();
}

/**
 * Format date as "DD-MMM-YYYY" (Amiga long date format)
 * Equivalent to MiscFuncs.e formatLongDate()
 *
 * Express.e usage: 22 instances
 * Examples: "07-Jan-2026", "15-Dec-1995"
 *
 * @param date - Date to format
 * @returns Formatted date string "DD-MMM-YYYY"
 */
export function formatLongDate(date: Date): string {
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
                  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

  const day = String(date.getDate()).padStart(2, '0');
  const month = months[date.getMonth()];
  const year = date.getFullYear();

  return `${day}-${month}-${year}`;
}

/**
 * Format time as "HH:MM:SS" (24-hour format)
 * Equivalent to MiscFuncs.e formatLongTime()
 *
 * Express.e usage: 10 instances
 * Examples: "14:32:15", "09:05:00"
 *
 * @param date - Date to format
 * @returns Formatted time string "HH:MM:SS"
 */
export function formatLongTime(date: Date): string {
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  const seconds = String(date.getSeconds()).padStart(2, '0');

  return `${hours}:${minutes}:${seconds}`;
}

/**
 * Format date and time as "DD-MMM-YYYY HH:MM:SS"
 * Equivalent to MiscFuncs.e formatLongDateTime()
 *
 * Express.e usage: 21 instances
 * Examples: "07-Jan-2026 14:32:15", "25-Dec-1995 09:00:00"
 *
 * @param date - Date to format
 * @returns Formatted datetime string "DD-MMM-YYYY HH:MM:SS"
 */
export function formatLongDateTime(date: Date): string {
  return `${formatLongDate(date)} ${formatLongTime(date)}`;
}

/**
 * Format date/time in C-style format (ISO 8601)
 * Equivalent to MiscFuncs.e formatCDateTime()
 *
 * Express.e usage: 6 instances
 * Used for compatibility with C doors and external programs
 *
 * @param date - Date to format
 * @returns ISO 8601 formatted string
 */
export function formatCDateTime(date: Date): string {
  return date.toISOString();
}

/**
 * Convert Amiga DateStamp to JavaScript Date
 * Equivalent to MiscFuncs.e dateStampToDateTime()
 *
 * Express.e usage: 4 instances
 *
 * Amiga DateStamp structure:
 * - days: Number of days since January 1, 1978
 * - minutes: Number of minutes since midnight
 * - ticks: Number of ticks (1/50 second) since start of minute
 *
 * @param days - Days since 1978-01-01
 * @param minutes - Minutes since midnight
 * @param ticks - Ticks (1/50 second) since start of minute
 * @returns JavaScript Date object
 */
export function dateStampToDateTime(days: number, minutes: number, ticks: number): Date {
  // Amiga epoch: January 1, 1978 00:00:00 UTC
  const amigaEpoch = new Date('1978-01-01T00:00:00Z');

  // Add days
  const date = new Date(amigaEpoch);
  date.setUTCDate(date.getUTCDate() + days);

  // Add minutes
  date.setUTCMinutes(date.getUTCMinutes() + minutes);

  // Add ticks (1 tick = 1/50 second = 20 milliseconds)
  const milliseconds = ticks * 20;
  date.setUTCMilliseconds(date.getUTCMilliseconds() + milliseconds);

  return date;
}

/**
 * Convert JavaScript Date to Amiga DateStamp
 * Inverse of dateStampToDateTime()
 *
 * @param date - JavaScript Date to convert
 * @returns Object with days, minutes, ticks
 */
export function dateTimeToDateStamp(date: Date): { days: number; minutes: number; ticks: number } {
  const amigaEpoch = new Date('1978-01-01T00:00:00Z');
  const diffMs = date.getTime() - amigaEpoch.getTime();

  // Calculate days
  const days = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  // Calculate minutes since midnight
  const midnight = new Date(date);
  midnight.setUTCHours(0, 0, 0, 0);
  const minutesSinceMidnight = Math.floor((date.getTime() - midnight.getTime()) / (1000 * 60));

  // Calculate ticks (1/50 second) within current minute
  const secondsInMinute = date.getUTCSeconds();
  const millisecondsInMinute = date.getUTCMilliseconds();
  const totalMillisecondsInMinute = (secondsInMinute * 1000) + millisecondsInMinute;
  const ticks = Math.floor(totalMillisecondsInMinute / 20); // 1 tick = 20ms

  return {
    days,
    minutes: minutesSinceMidnight,
    ticks
  };
}

/**
 * Format duration in seconds as "HH:MM:SS"
 * Useful for displaying elapsed time, session duration, etc.
 *
 * @param seconds - Duration in seconds
 * @returns Formatted duration "HH:MM:SS"
 */
export function formatDuration(seconds: number): string {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);

  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}

/**
 * Format date as "DD/MM/YYYY" (alternative format)
 * @param date - Date to format
 * @returns Formatted date string "DD/MM/YYYY"
 */
export function formatShortDate(date: Date): string {
  const day = String(date.getDate()).padStart(2, '0');
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const year = date.getFullYear();

  return `${day}/${month}/${year}`;
}

/**
 * Format time as "HH:MM" (short format without seconds)
 * @param date - Date to format
 * @returns Formatted time string "HH:MM"
 */
export function formatShortTime(date: Date): string {
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');

  return `${hours}:${minutes}`;
}
