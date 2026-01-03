/**
 * MultiTop Generator - TypeScript port of MultiTop v2.1
 *
 * Generates top user statistics bulletins from design files.
 * 1:1 compatible with 68K MultiTop design file format.
 *
 * Original by Darren Coles
 * TypeScript port for AmiExpress-Web
 */

import * as fs from 'fs';
import * as path from 'path';
import { db } from '../database';

interface DesignConfig {
  sortField: SortField;
  template: string;
}

type SortField =
  | 'UPLOADEDBYTES'
  | 'UPLOADEDFILES'
  | 'DOWNLOADEDBYTES'
  | 'DOWNLOADEDFILES'
  | 'MESSAGES'
  | 'CALLS'
  | 'CPSUP'
  | 'CPSDOWN';

interface UserStats {
  userName: string;
  location: string;
  uploadedBytes: number;
  uploadedFiles: number;
  downloadedBytes: number;
  downloadedFiles: number;
  messages: number;
  calls: number;
  cpsUp: number;
  cpsDown: number;
}

interface GlobalStats {
  totalCalls: number;
  totalBytesUp: number;
  totalFilesUp: number;
  totalBytesDown: number;
  totalFilesDown: number;
  totalMessages: number;
  activeUsers: number;
}

/**
 * Parse MultiTop design file
 * Format:
 *   @> = Comment line
 *   @SORT=FIELDNAME = Sort directive
 *   Template lines with placeholders:
 *     %NN-WWXX = User NN's field XX, max width WW
 *     %WW.XX = Global total field XX, width WW
 */
export function parseDesignFile(designPath: string): DesignConfig | null {
  try {
    if (!fs.existsSync(designPath)) {
      console.error(`[MultiTop] Design file not found: ${designPath}`);
      return null;
    }

    const content = fs.readFileSync(designPath, 'utf-8');
    const lines = content.split('\n');

    let sortField: SortField = 'UPLOADEDBYTES'; // Default
    const templateLines: string[] = [];

    for (const line of lines) {
      // Skip comment lines
      if (line.startsWith('@>')) {
        continue;
      }

      // Parse sort directive
      if (line.startsWith('@SORT=')) {
        const field = line.substring(6).trim().toUpperCase();
        if (isValidSortField(field)) {
          sortField = field as SortField;
        }
        continue;
      }

      // Add to template
      templateLines.push(line);
    }

    return {
      sortField,
      template: templateLines.join('\n')
    };
  } catch (error) {
    console.error('[MultiTop] Error parsing design file:', error);
    return null;
  }
}

function isValidSortField(field: string): boolean {
  return [
    'UPLOADEDBYTES',
    'UPLOADEDFILES',
    'DOWNLOADEDBYTES',
    'DOWNLOADEDFILES',
    'MESSAGES',
    'CALLS',
    'CPSUP',
    'CPSDOWN'
  ].includes(field);
}

/**
 * Get all user statistics from database
 */
async function getAllUserStats(ignoreSysop: boolean = false): Promise<UserStats[]> {
  try {
    const users = await db.getUsers({});
    const stats: UserStats[] = [];

    for (const user of users) {
      // Skip sysop if requested
      if (ignoreSysop && user.secLevel >= 255) {
        continue;
      }

      // Get message count
      // Note: We use messagesPosted from user record instead of querying message_posts
      // This matches the original 68K implementation which reads from user.data
      const messageCount = user.messagesPosted || 0;

      stats.push({
        userName: user.username,
        location: user.location || '',
        uploadedBytes: user.bytesUpload || 0,
        uploadedFiles: user.uploads || 0,
        downloadedBytes: user.bytesDownload || 0,
        downloadedFiles: user.downloads || 0,
        messages: messageCount,
        calls: user.timesCalled || user.calls || 0,
        cpsUp: 0, // TODO: Get from user.keys equivalent if available
        cpsDown: 0 // TODO: Get from user.keys equivalent if available
      });
    }

    return stats;
  } catch (error) {
    console.error('[MultiTop] Error getting user stats:', error);
    return [];
  }
}

/**
 * Sort users by specified field
 */
function sortUsers(users: UserStats[], sortField: SortField): UserStats[] {
  const sorted = [...users];

  sorted.sort((a, b) => {
    let aVal = 0;
    let bVal = 0;

    switch (sortField) {
      case 'UPLOADEDBYTES':
        aVal = a.uploadedBytes;
        bVal = b.uploadedBytes;
        break;
      case 'UPLOADEDFILES':
        aVal = a.uploadedFiles;
        bVal = b.uploadedFiles;
        break;
      case 'DOWNLOADEDBYTES':
        aVal = a.downloadedBytes;
        bVal = b.downloadedBytes;
        break;
      case 'DOWNLOADEDFILES':
        aVal = a.downloadedFiles;
        bVal = b.downloadedFiles;
        break;
      case 'MESSAGES':
        aVal = a.messages;
        bVal = b.messages;
        break;
      case 'CALLS':
        aVal = a.calls;
        bVal = b.calls;
        break;
      case 'CPSUP':
        aVal = a.cpsUp;
        bVal = b.cpsUp;
        break;
      case 'CPSDOWN':
        aVal = a.cpsDown;
        bVal = b.cpsDown;
        break;
    }

    // Sort descending (highest first)
    return bVal - aVal;
  });

  return sorted;
}

/**
 * Calculate global statistics
 */
function calculateGlobalStats(users: UserStats[]): GlobalStats {
  return {
    totalCalls: users.reduce((sum, u) => sum + u.calls, 0),
    totalBytesUp: users.reduce((sum, u) => sum + u.uploadedBytes, 0),
    totalFilesUp: users.reduce((sum, u) => sum + u.uploadedFiles, 0),
    totalBytesDown: users.reduce((sum, u) => sum + u.downloadedBytes, 0),
    totalFilesDown: users.reduce((sum, u) => sum + u.downloadedFiles, 0),
    totalMessages: users.reduce((sum, u) => sum + u.messages, 0),
    activeUsers: users.length
  };
}

/**
 * Format bytes with appropriate suffix (bytes, KB, MB, GB)
 */
function formatBytes(bytes: number, width: number): string {
  let value: number;
  let suffix: string;

  if (bytes >= 1073741824) {
    value = bytes / 1073741824;
    suffix = 'GB';
  } else if (bytes >= 1048576) {
    value = bytes / 1048576;
    suffix = 'MB';
  } else if (bytes >= 1024) {
    value = bytes / 1024;
    suffix = 'KB';
  } else {
    value = bytes;
    suffix = 'bytes';
  }

  const numStr = value.toFixed(value >= 10 ? 0 : 1);
  const result = `${numStr} ${suffix}`;
  return result.padStart(width, ' ');
}

/**
 * Format number with proper width
 */
function formatNumber(num: number, width: number): string {
  return num.toString().padStart(width, ' ');
}

/**
 * Truncate or pad string to exact width
 */
function formatString(str: string, width: number): string {
  if (str.length > width) {
    return str.substring(0, width);
  }
  return str.padEnd(width, ' ');
}

/**
 * Replace placeholders in template
 *
 * User placeholders: %NN-WWXX
 *   NN = user number (01-99)
 *   WW = width (number of characters)
 *   XX = field code:
 *     UN = username
 *     LT = location
 *     UB = uploaded bytes
 *     UF = uploaded files
 *     DB = downloaded bytes
 *     DF = downloaded files
 *     MS = messages
 *     TC = total calls
 *     CU = CPS upload
 *     CD = CPS download
 *
 * Global placeholders: %WW.XX
 *   WW = width
 *   XX = field code:
 *     UB = total uploaded bytes
 *     UF = total uploaded files
 *     DB = total downloaded bytes
 *     DF = total downloaded files
 *     TM = total messages
 *     TC = total calls
 *     AU = active users
 *     VT = version/timestamp
 */
function replacePlaceholders(
  template: string,
  users: UserStats[],
  globalStats: GlobalStats
): string {
  let result = template;

  // Replace user placeholders (%NN-WWXX)
  const userRegex = /%(\d{2})-(\d+)(\w{2})/g;
  result = result.replace(userRegex, (match, userNum, width, field) => {
    const userIndex = parseInt(userNum, 10) - 1;
    const w = parseInt(width, 10);

    // If user doesn't exist, return empty space
    if (userIndex < 0 || userIndex >= users.length) {
      return ''.padEnd(w, ' ');
    }

    const user = users[userIndex];

    switch (field.toUpperCase()) {
      case 'UN':
        return formatString(user.userName, w);
      case 'LT':
        return formatString(user.location, w);
      case 'UB':
        return formatBytes(user.uploadedBytes, w);
      case 'UF':
        return formatNumber(user.uploadedFiles, w);
      case 'DB':
        return formatBytes(user.downloadedBytes, w);
      case 'DF':
        return formatNumber(user.downloadedFiles, w);
      case 'MS':
        return formatNumber(user.messages, w);
      case 'TC':
        return formatNumber(user.calls, w);
      case 'CU':
        return formatNumber(user.cpsUp, w);
      case 'CD':
        return formatNumber(user.cpsDown, w);
      default:
        return match;
    }
  });

  // Replace global placeholders (%WW.XX)
  const globalRegex = /%(\d+)\.(\w{2})/g;
  result = result.replace(globalRegex, (match, width, field) => {
    const w = parseInt(width, 10);

    switch (field.toUpperCase()) {
      case 'UB':
        return formatBytes(globalStats.totalBytesUp, w);
      case 'UF':
        return formatNumber(globalStats.totalFilesUp, w);
      case 'DB':
        return formatBytes(globalStats.totalBytesDown, w);
      case 'DF':
        return formatNumber(globalStats.totalFilesDown, w);
      case 'TM':
        return formatNumber(globalStats.totalMessages, w);
      case 'TC':
        return formatNumber(globalStats.totalCalls, w);
      case 'AU':
        return formatNumber(globalStats.activeUsers, w);
      case 'VT':
        // Version/timestamp string
        const now = new Date();
        const dateStr = now.toISOString().substring(0, 10);
        return formatString(`Generated ${dateStr}`, w);
      default:
        return match;
    }
  });

  return result;
}

/**
 * Generate MultiTop bulletin from design file
 */
export async function generateMultiTop(
  designPath: string,
  outputPath?: string,
  options: {
    ignoreSysop?: boolean;
    sortField?: string;
  } = {}
): Promise<string | null> {
  try {
    console.log(`[MultiTop] Generating from design: ${designPath}`);

    // Parse design file
    const design = parseDesignFile(designPath);
    if (!design) {
      return null;
    }

    // Override sort field if provided
    if (options.sortField && isValidSortField(options.sortField.toUpperCase())) {
      design.sortField = options.sortField.toUpperCase() as SortField;
    }

    console.log(`[MultiTop] Sort field: ${design.sortField}`);

    // Get all user stats
    const allUsers = await getAllUserStats(options.ignoreSysop || false);
    console.log(`[MultiTop] Found ${allUsers.length} users`);

    // Sort users
    const sortedUsers = sortUsers(allUsers, design.sortField);

    // Calculate global stats
    const globalStats = calculateGlobalStats(allUsers);

    // Replace placeholders
    const output = replacePlaceholders(design.template, sortedUsers, globalStats);

    // Write to output file if specified
    if (outputPath) {
      const fullPath = path.isAbsolute(outputPath) ? outputPath : path.join(process.cwd(), outputPath);
      const dir = path.dirname(fullPath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      fs.writeFileSync(fullPath, output, 'utf-8');
      console.log(`[MultiTop] Wrote output to ${fullPath}`);
    }

    return output;
  } catch (error) {
    console.error('[MultiTop] Error generating MultiTop:', error);
    return null;
  }
}
