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
        cpsUp: user.topUploadCPS || 0,
        cpsDown: user.topDownloadCPS || 0
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
 * User placeholders: %NN-WWXX or %NN.WWXX
 *   NN = user number (01-99)
 *   -/. = alignment (- left, . right)
 *   WW = width (number of characters)
 *   XX = field code
 *
 * Global placeholders: %-WWXX or %.WWXX
 *   -/. = alignment
 *   WW = width
 *   XX = field code
 */
function replacePlaceholders(
  template: string,
  users: UserStats[],
  globalStats: GlobalStats
): string {
  let result = template;

  // Replace user placeholders (%NN[-.]WWXX)
  // Note: we use [.-] to match either dot or minus
  const userRegex = /%(\d{2})([.-])(\d+)(\w{2})/g;
  result = result.replace(userRegex, (match, userNum, align, width, field) => {
    const userIndex = parseInt(userNum, 10) - 1;
    const w = parseInt(width, 10);

    // If user doesn't exist, return empty space
    if (userIndex < 0 || userIndex >= users.length) {
      return ''.padEnd(w, ' ');
    }

    const user = users[userIndex];
    let val = '';

    switch (field.toUpperCase()) {
      case 'UN':
        val = user.userName;
        break;
      case 'LT':
        val = user.location;
        break;
      case 'UB':
        val = user.uploadedBytes.toLocaleString();
        break;
      case 'UK':
        val = Math.floor(user.uploadedBytes / 1024).toString();
        break;
      case 'UM':
        val = (user.uploadedBytes / (1024 * 1024)).toFixed(1);
        break;
      case 'UF':
        val = user.uploadedFiles.toString();
        break;
      case 'DB':
        val = user.downloadedBytes.toLocaleString();
        break;
      case 'DK':
        val = Math.floor(user.downloadedBytes / 1024).toString();
        break;
      case 'DM':
        val = (user.downloadedBytes / (1024 * 1024)).toFixed(1);
        break;
      case 'DF':
        val = user.downloadedFiles.toString();
        break;
      case 'MS':
        val = user.messages.toString();
        break;
      case 'CS':
      case 'TC':
        val = user.calls.toString();
        break;
      case 'CU':
      case 'UC':
        val = user.cpsUp.toString();
        break;
      case 'CD':
      case 'DC':
        val = user.cpsDown.toString();
        break;
      default:
        return match;
    }

    return align === '-' ? val.padEnd(w, ' ') : val.padStart(w, ' ');
  });

  // Replace global placeholders (%[-.]WWXX or %WW[-.]XX)
  // This matches both formats: %-10VT and %42-VT
  const globalRegex = /%(?:([.-])(\d+)|(\d+)([.-]))(\w{2})/g;
  result = result.replace(globalRegex, (match, align1, width1, width2, align2, field) => {
    const align = align1 || align2;
    const widthStr = width1 || width2;
    const w = parseInt(widthStr, 10);
    let val = '';

    switch (field.toUpperCase()) {
      case 'UB':
        val = globalStats.totalBytesUp.toLocaleString();
        break;
      case 'UK':
        val = Math.floor(globalStats.totalBytesUp / 1024).toString();
        break;
      case 'UM':
        val = (globalStats.totalBytesUp / (1024 * 1024)).toFixed(1);
        break;
      case 'UF':
        val = globalStats.totalFilesUp.toString();
        break;
      case 'DB':
        val = globalStats.totalBytesDown.toLocaleString();
        break;
      case 'DK':
        val = Math.floor(globalStats.totalBytesDown / 1024).toString();
        break;
      case 'DM':
        val = (globalStats.totalBytesDown / (1024 * 1024)).toFixed(1);
        break;
      case 'DF':
        val = globalStats.totalFilesDown.toString();
        break;
      case 'TM':
        val = globalStats.totalMessages.toString();
        break;
      case 'TC':
      case 'SC':
        val = globalStats.totalCalls.toString();
        break;
      case 'AU':
      case 'TU':
        val = globalStats.activeUsers.toString();
        break;
      case 'LD':
        const now = new Date();
        val = now.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: '2-digit' }).replace(/ /g, '-');
        break;
      case 'LT':
        val = new Date().toTimeString().split(' ')[0];
        break;
      case 'VT':
        val = 'MultiTop v2.1';
        break;
      default:
        return match;
    }

    return align === '-' ? val.padEnd(w, ' ') : val.padStart(w, ' ');
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
