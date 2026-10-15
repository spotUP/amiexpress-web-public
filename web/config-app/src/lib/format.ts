/**
 * Value formatters for the admin interface.
 *
 * Every byte count, duration and timestamp on screen goes through one of
 * these, so a size reads the same on the Overview as it does in a table.
 */

const KILOBYTE = 1024;
const BYTE_UNITS = ['bytes', 'KB', 'MB', 'GB', 'TB'] as const;

/** 0 -> "0 bytes", 1536 -> "1.5 KB", 1073741824 -> "1 GB". */
export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 bytes';

  let value = bytes;
  let unit = 0;
  while (value >= KILOBYTE && unit < BYTE_UNITS.length - 1) {
    value /= KILOBYTE;
    unit += 1;
  }

  // Whole bytes never get a decimal point; larger units get one when it says
  // something ("1.5 MB" is useful, "1.0 MB" is noise).
  const rounded = unit === 0 ? Math.round(value) : Math.round(value * 10) / 10;
  return `${rounded} ${BYTE_UNITS[unit]}`;
}

/** Seconds to a compact duration: 45 -> "45s", 3900 -> "1h 5m", 90000 -> "1d 1h". */
export function formatDuration(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds <= 0) return '0s';

  const total = Math.floor(seconds);
  const days = Math.floor(total / 86400);
  const hours = Math.floor((total % 86400) / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const remainder = total % 60;

  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h ${minutes}m`;
  if (minutes > 0) return `${minutes}m ${remainder}s`;
  return `${remainder}s`;
}

/** Minutes remaining on a node, as the sysop thinks of it: 75 -> "1h 15m". */
export function formatMinutes(minutes: number): string {
  return formatDuration(Math.max(0, Math.round(minutes)) * 60);
}

/**
 * "just now", "3m ago", "2h ago", "5d ago". Returns an empty string for a
 * missing or unparseable timestamp rather than "Invalid Date".
 */
export function formatRelativeTime(timestamp: string | number | Date | null | undefined, now = Date.now()): string {
  if (timestamp === null || timestamp === undefined || timestamp === '') return '';

  const then = timestamp instanceof Date ? timestamp.getTime() : new Date(timestamp).getTime();
  if (Number.isNaN(then)) return '';

  const seconds = Math.round((now - then) / 1000);
  if (seconds < 0) return 'just now';
  if (seconds < 45) return 'just now';
  if (seconds < 3600) return `${Math.round(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  return `${Math.floor(seconds / 86400)}d ago`;
}

/** Wall-clock time for a "last updated" caption. */
export function formatClockTime(timestamp: string | number | Date = Date.now()): string {
  const date = timestamp instanceof Date ? timestamp : new Date(timestamp);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false });
}

/** Thousands separators with tabular figures in mind: 12345 -> "12,345". */
export function formatCount(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return '-';
  return value.toLocaleString('en-US');
}
