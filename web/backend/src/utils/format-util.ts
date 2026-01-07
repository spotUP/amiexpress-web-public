/**
 * Formatting Utility Functions
 *
 * Implements MiscFuncs.e formatting functions for AmiExpress compatibility.
 * All functions match express.e output formatting behavior.
 */

/**
 * Format IP address
 * Equivalent to MiscFuncs.e formatIP()
 *
 * Express.e usage: 3 instances
 * Converts numeric IP to dotted decimal notation
 *
 * @param ip - IP address as string or 32-bit number
 * @returns Formatted IP address (e.g., "192.168.1.1")
 */
export function formatIP(ip: string | number): string {
  if (typeof ip === 'string') {
    return ip; // Already formatted
  }

  // Convert 32-bit number to dotted decimal
  return [
    (ip >>> 24) & 0xFF,
    (ip >>> 16) & 0xFF,
    (ip >>> 8) & 0xFF,
    ip & 0xFF
  ].join('.');
}

/**
 * Format byte size with units
 * Equivalent to MiscFuncs.e formatSpaceValue()
 *
 * Express.e usage: 2 instances
 * Converts bytes to human-readable format (KB, MB, GB)
 *
 * @param bytes - File size in bytes
 * @param decimals - Number of decimal places (default: 2)
 * @returns Formatted size (e.g., "1.50 MB", "512 KB")
 */
export function formatSpaceValue(bytes: number, decimals: number = 2): string {
  if (bytes === 0) {
    return '0 B';
  }

  const units = ['B', 'KB', 'MB', 'GB', 'TB', 'PB'];
  let size = bytes;
  let unitIndex = 0;

  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024;
    unitIndex++;
  }

  return `${size.toFixed(decimals)} ${units[unitIndex]}`;
}

/**
 * Format byte size in Amiga style (uses K instead of KB)
 * Amiga traditionally shows "256K" instead of "256 KB"
 *
 * @param bytes - File size in bytes
 * @returns Formatted size (e.g., "1.5M", "512K")
 */
export function formatAmigaSize(bytes: number): string {
  if (bytes === 0) {
    return '0';
  }

  if (bytes < 1024) {
    return `${bytes}`;
  }

  const units = ['K', 'M', 'G', 'T'];
  let size = bytes / 1024;
  let unitIndex = 0;

  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024;
    unitIndex++;
  }

  const formatted = size % 1 === 0 ? size.toFixed(0) : size.toFixed(1);
  return `${formatted}${units[unitIndex]}`;
}

/**
 * Format number with thousands separator
 * @param num - Number to format
 * @param separator - Separator character (default: ',')
 * @returns Formatted number (e.g., "1,234,567")
 */
export function formatNumber(num: number, separator: string = ','): string {
  return num.toString().replace(/\B(?=(\d{3})+(?!\d))/g, separator);
}

/**
 * Format percentage
 * @param value - Value to format
 * @param total - Total value
 * @param decimals - Number of decimal places (default: 1)
 * @returns Formatted percentage (e.g., "75.5%")
 */
export function formatPercentage(value: number, total: number, decimals: number = 1): string {
  if (total === 0) {
    return '0%';
  }

  const percentage = (value / total) * 100;
  return `${percentage.toFixed(decimals)}%`;
}

/**
 * Format baud rate (modem speed)
 * @param baudRate - Baud rate in bps
 * @returns Formatted baud rate (e.g., "14400", "28.8K", "56K")
 */
export function formatBaudRate(baudRate: number): string {
  if (baudRate < 1000) {
    return baudRate.toString();
  }

  if (baudRate < 10000) {
    // 1200, 2400, 9600
    return baudRate.toString();
  }

  // 14400 → 14.4K, 28800 → 28.8K, 56000 → 56K
  const kbps = baudRate / 1000;
  return kbps % 1 === 0 ? `${kbps}K` : `${kbps.toFixed(1)}K`;
}

/**
 * Format phone number
 * @param phone - Phone number string
 * @returns Formatted phone number
 */
export function formatPhoneNumber(phone: string): string {
  if (!phone) {
    return '';
  }

  // Remove non-digit characters
  const digits = phone.replace(/\D/g, '');

  // Format based on length
  if (digits.length === 10) {
    // US format: (555) 555-1234
    return `(${digits.substring(0, 3)}) ${digits.substring(3, 6)}-${digits.substring(6)}`;
  } else if (digits.length === 7) {
    // Local format: 555-1234
    return `${digits.substring(0, 3)}-${digits.substring(3)}`;
  }

  // Return as-is for other lengths
  return phone;
}

/**
 * Format caller ID
 * Combines name and location
 *
 * @param name - Caller name
 * @param location - Caller location
 * @returns Formatted caller ID (e.g., "John Doe (New York, NY)")
 */
export function formatCallerID(name: string, location: string): string {
  if (!name) {
    return location || 'Unknown';
  }

  if (!location) {
    return name;
  }

  return `${name} (${location})`;
}

/**
 * Format uptime/duration in days, hours, minutes
 * @param seconds - Duration in seconds
 * @returns Formatted duration (e.g., "2d 5h 30m", "3h 15m", "45m")
 */
export function formatUptime(seconds: number): string {
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);

  const parts: string[] = [];

  if (days > 0) {
    parts.push(`${days}d`);
  }

  if (hours > 0) {
    parts.push(`${hours}h`);
  }

  if (minutes > 0 || parts.length === 0) {
    parts.push(`${minutes}m`);
  }

  return parts.join(' ');
}

/**
 * Format ratio (upload/download ratio)
 * @param uploaded - Bytes uploaded
 * @param downloaded - Bytes downloaded
 * @returns Formatted ratio (e.g., "1:2.5", "1:1")
 */
export function formatRatio(uploaded: number, downloaded: number): string {
  if (downloaded === 0) {
    return uploaded > 0 ? 'Inf:1' : '0:0';
  }

  const ratio = uploaded / downloaded;

  if (ratio >= 1) {
    return `${ratio.toFixed(1)}:1`;
  } else {
    return `1:${(1 / ratio).toFixed(1)}`;
  }
}

/**
 * Pad number with leading zeros
 * @param num - Number to pad
 * @param width - Target width
 * @returns Padded number string
 */
export function padNumber(num: number, width: number): string {
  return String(num).padStart(width, '0');
}

/**
 * Format boolean as Yes/No
 * @param value - Boolean value
 * @returns "Yes" or "No"
 */
export function formatYesNo(value: boolean): string {
  return value ? 'Yes' : 'No';
}

/**
 * Format boolean as On/Off
 * @param value - Boolean value
 * @returns "On" or "Off"
 */
export function formatOnOff(value: boolean): string {
  return value ? 'On' : 'Off';
}

/**
 * Format boolean as Enabled/Disabled
 * @param value - Boolean value
 * @returns "Enabled" or "Disabled"
 */
export function formatEnabled(value: boolean): string {
  return value ? 'Enabled' : 'Disabled';
}

/**
 * Format transfer speed (bytes per second)
 * @param bytesPerSecond - Transfer speed in bytes/sec
 * @returns Formatted speed (e.g., "15.2 KB/s", "1.2 MB/s")
 */
export function formatTransferSpeed(bytesPerSecond: number): string {
  if (bytesPerSecond < 1024) {
    return `${bytesPerSecond.toFixed(1)} B/s`;
  }

  if (bytesPerSecond < 1024 * 1024) {
    return `${(bytesPerSecond / 1024).toFixed(1)} KB/s`;
  }

  return `${(bytesPerSecond / (1024 * 1024)).toFixed(1)} MB/s`;
}

/**
 * Format CPS (characters per second) as traditional modem speed
 * @param cps - Characters per second
 * @returns Formatted CPS (e.g., "1200 cps", "2400 cps")
 */
export function formatCPS(cps: number): string {
  return `${cps} cps`;
}

/**
 * Format security level
 * @param level - Security level (0-255)
 * @returns Formatted security level
 */
export function formatSecurityLevel(level: number): string {
  if (level >= 250) {
    return `${level} (Sysop)`;
  } else if (level >= 200) {
    return `${level} (Co-Sysop)`;
  } else if (level >= 100) {
    return `${level} (Staff)`;
  } else if (level >= 50) {
    return `${level} (Privileged)`;
  } else {
    return `${level} (User)`;
  }
}

/**
 * Format credits/time remaining
 * @param credits - Credits or minutes remaining
 * @param unit - Unit name (default: "credits")
 * @returns Formatted credits (e.g., "150 credits", "60 minutes")
 */
export function formatCredits(credits: number, unit: string = 'credits'): string {
  return `${credits} ${unit}`;
}

/**
 * Center text in fixed width
 * @param text - Text to center
 * @param width - Total width
 * @param fillChar - Fill character (default: space)
 * @returns Centered text
 */
export function centerText(text: string, width: number, fillChar: string = ' '): string {
  if (text.length >= width) {
    return text;
  }

  const totalPadding = width - text.length;
  const leftPadding = Math.floor(totalPadding / 2);
  const rightPadding = totalPadding - leftPadding;

  return fillChar.repeat(leftPadding) + text + fillChar.repeat(rightPadding);
}
