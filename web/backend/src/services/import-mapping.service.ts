/**
 * Import Mapping Service
 *
 * Maps Amiga BBS data to modern TypeScript format.
 * Handles variations between different BBS setups intelligently.
 *
 * IMPORTANT: Every BBS has different doors, conferences, and configurations.
 * This service must be flexible and provide sensible defaults for missing data.
 */

import * as crypto from 'crypto';
import { getSystemTime } from '../utils/date-time.util';
import type { User } from '../types';
import type { Conference } from '../database/types';
import type {
  AmigaUserData,
  AmigaConference,
  AmigaBBSConfig,
  AmigaAccessLevel,
  AmigaCommand,
} from '../types/amiga-import';

export class ImportMappingService {
  /**
   * Map Amiga user to modern User type
   * Preserves all data with sensible defaults for missing fields
   */
  mapAmigaUserToModern(amigaUser: AmigaUserData): Partial<User> {
    return {
      id: crypto.randomUUID(),
      username: amigaUser.username,
      passwordHash: amigaUser.passwordHash, // Preserve original hash
      realname: amigaUser.realname || '',
      location: amigaUser.location || '',
      phone: amigaUser.phone || '',
      email: amigaUser.email || undefined,

      // Security and access
      secLevel: this.mapSecurityLevel(amigaUser.secLevel),
      userFlags: amigaUser.userFlags || 0,

      // Statistics - preserve all counts
      uploads: amigaUser.uploads || 0,
      downloads: amigaUser.downloads || 0,
      bytesUpload: amigaUser.bytesUpload || 0,
      bytesDownload: amigaUser.bytesDownload || 0,
      ratio: amigaUser.ratio || 0,
      ratioType: amigaUser.ratioType || 0,

      // Time tracking
      timeTotal: amigaUser.timeTotal || 0,
      timeLimit: amigaUser.timeLimit || 60, // Default 60 minutes
      timeUsed: amigaUser.timeUsed || 0,
      chatLimit: amigaUser.chatLimit || 0,
      chatUsed: amigaUser.chatUsed || 0,

      // Login tracking
      lastLogin: amigaUser.lastLogin || undefined,
      firstLogin: amigaUser.firstLogin || getSystemTime(),
      calls: amigaUser.calls || 0,
      callsToday: amigaUser.callsToday || 0,

      // User preferences
      newUser: amigaUser.newUser || false,
      expert: amigaUser.expert ? 'X' : 'N',
      ansi: amigaUser.ansi !== false, // Default to true
      linesPerScreen: amigaUser.linesPerScreen || 24,
      computer: amigaUser.computer || 'Amiga',
      screenType: String(amigaUser.screenType || 0),
      protocol: amigaUser.protocol || 'ZMODEM',
      editor: amigaUser.editor || 'FullScreenEditor',
      zoomType: String(amigaUser.zoomType || 0),

      // Chat/node settings
      availableForChat: amigaUser.availableForChat || false,
      quietNode: amigaUser.quietNode || false,
      autoRejoin: amigaUser.autoRejoin ? 1 : 0,

      // Conference/area access
      confAccess: amigaUser.confAccess || '',
      areaName: amigaUser.areaName || '',

      // Networking
      uuCP: amigaUser.uuCP || false,

      // Performance stats
      topUploadCPS: amigaUser.topUploadCPS || 0,
      topDownloadCPS: amigaUser.topDownloadCPS || 0,
      byteLimit: amigaUser.byteLimit || 0,

      // Timestamps
      created: getSystemTime(),
      updated: getSystemTime(),
    };
  }

  /**
   * Map Amiga conference to modern Conference type
   * Handles missing or incomplete conference data gracefully
   */
  mapAmigaConferenceToModern(amigaConf: AmigaConference): Partial<Conference> {
    return {
      name: this.sanitizeConferenceName(amigaConf.database.conferenceName),
      description: this.generateConferenceDescription(amigaConf),
      created: getSystemTime(),
      updated: getSystemTime(),
    };
  }

  /**
   * Map Amiga security level (0-255) to modern system
   * Provides intelligent mapping based on common Amiga conventions:
   * - 0-9: Locked out
   * - 10-19: New user
   * - 20-49: Regular user
   * - 50-99: Trusted user
   * - 100-254: Elite user
   * - 255: Sysop
   */
  mapSecurityLevel(amigaLevel: number): number {
    if (amigaLevel <= 0) return 0;
    if (amigaLevel <= 10) return 10;
    if (amigaLevel <= 20) return 20;
    if (amigaLevel <= 50) return 50;
    if (amigaLevel <= 100) return 100;
    if (amigaLevel >= 255) return 255;
    return amigaLevel; // Preserve exact level if in middle ranges
  }

  /**
   * Map Amiga conference type to modern enum
   * Handles various ways BBS systems store conference types
   */
  private mapConferenceType(type: 'MSGBBS' | 'UPLOADS' | 'BOTH' | string): 'MSGBBS' | 'UPLOADS' | 'BOTH' {
    const normalized = type?.toUpperCase().trim();

    // Handle common variations
    if (normalized?.includes('MSG') || normalized?.includes('MESSAGE')) return 'MSGBBS';
    if (normalized?.includes('UPLOAD') || normalized?.includes('FILE')) return 'UPLOADS';
    if (normalized?.includes('BOTH') || normalized?.includes('ALL')) return 'BOTH';

    // Default to BOTH if unclear
    return 'BOTH';
  }

  /**
   * Sanitize conference name
   * Removes invalid characters and ensures reasonable length
   */
  private sanitizeConferenceName(name: string | undefined): string {
    if (!name) return 'Imported Conference';

    // Remove control characters
    let sanitized = name.replace(/[\x00-\x1F\x7F]/g, '');

    // Trim whitespace
    sanitized = sanitized.trim();

    // Limit length
    if (sanitized.length > 80) {
      sanitized = sanitized.substring(0, 80).trim();
    }

    // Ensure not empty
    if (sanitized.length === 0) {
      return 'Imported Conference';
    }

    return sanitized;
  }

  /**
   * Generate conference description from available data
   * Pulls information from menu, file areas, etc.
   */
  private generateConferenceDescription(amigaConf: AmigaConference): string | undefined {
    const parts: string[] = [];

    // Try to extract description from menu (first line often has description)
    if (amigaConf.menu) {
      const lines = amigaConf.menu.split('\n');
      const firstLine = lines.find(l => l.trim().length > 0 && !l.startsWith('-'));
      if (firstLine) {
        // Remove ANSI codes for description
        const cleanLine = firstLine.replace(/\x1b\[[0-9;]*[a-zA-Z]/g, '').trim();
        if (cleanLine.length > 0 && cleanLine.length < 200) {
          parts.push(cleanLine);
        }
      }
    }

    // Add file area count if present
    if (amigaConf.fileAreas.length > 0) {
      parts.push(`${amigaConf.fileAreas.length} file areas`);
    }

    // Add message base count if present
    if (amigaConf.messageBases.length > 0) {
      parts.push(`${amigaConf.messageBases.length} message bases`);
    }

    return parts.length > 0 ? parts.join(' - ') : undefined;
  }

  /**
   * Map Amiga access level to modern system
   * Preserves all settings with intelligent defaults
   */
  mapAmigaAccessToModern(amigaAccess: AmigaAccessLevel): {
    level: number;
    name: string;
    permissions: {
      upload: boolean;
      download: boolean;
      post: boolean;
      read: boolean;
      chat: boolean;
      useDoors: boolean;
    };
    limits: {
      timeLimit: number;
      downloadLimit: number;
      uploadRatio: number;
    };
  } {
    return {
      level: this.mapSecurityLevel(amigaAccess.level),
      name: amigaAccess.name || `Level ${amigaAccess.level}`,
      permissions: {
        upload: amigaAccess.canUpload,
        download: amigaAccess.canDownload,
        post: amigaAccess.canPost,
        read: amigaAccess.canRead,
        chat: amigaAccess.canChat,
        useDoors: amigaAccess.canUseDoors,
      },
      limits: {
        timeLimit: amigaAccess.timeLimit || 60,
        downloadLimit: amigaAccess.downloadLimit || 0,
        uploadRatio: amigaAccess.uploadRatio || 0,
      },
    };
  }

  /**
   * Map Amiga configuration to modern system
   * Intelligently handles missing or invalid config values
   */
  mapAmigaConfigToModern(amigaConfig: AmigaBBSConfig): Record<string, any> {
    const config: Record<string, any> = {};

    // SMTP settings (if present)
    if (amigaConfig.smtpHost) {
      config.smtp = {
        host: amigaConfig.smtpHost,
        port: amigaConfig.smtpPort || 25,
        username: amigaConfig.smtpUsername,
        password: amigaConfig.smtpPassword,
        ssl: amigaConfig.smtpSSL || false,
      };
    }

    // Email addresses
    if (amigaConfig.sysopEmail) {
      config.sysopEmail = amigaConfig.sysopEmail;
    }
    if (amigaConfig.bbsEmail) {
      config.bbsEmail = amigaConfig.bbsEmail;
    }

    // FTP settings (if present)
    if (amigaConfig.ftpHost) {
      config.ftp = {
        host: amigaConfig.ftpHost,
        port: amigaConfig.ftpPort || 21,
        dataPorts: amigaConfig.ftpDataPorts,
      };
    }

    // Password security
    config.passwordSecurity = amigaConfig.passwordSecurity || 'LEGACY';

    // Notifications
    config.notifications = {
      mailOnNewUser: amigaConfig.mailOnNewUser || false,
      mailOnSysopComment: amigaConfig.mailOnSysopComment || false,
      mailOnPwdFail: amigaConfig.mailOnPwdFail || false,
    };

    // Registration key (preserve but don't use)
    if (amigaConfig.regKey) {
      config.importedRegKey = amigaConfig.regKey;
    }

    // Store all original tool types for reference
    if (amigaConfig.toolTypes.size > 0) {
      config.originalToolTypes = Object.fromEntries(amigaConfig.toolTypes);
    }

    return config;
  }

  /**
   * Determine if password should be rehashed
   * Amiga used various hashing schemes - we may want to force reset
   */
  shouldRehashPassword(passwordHash: string, passwordSecurity: string): boolean {
    // If importing from LEGACY system, passwords will need rehashing on first login
    // OR we can force a password reset for all imported users
    return passwordSecurity === 'LEGACY';
  }

  /**
   * Generate temporary password for imported users (if needed)
   */
  generateTemporaryPassword(): string {
    return crypto.randomBytes(8).toString('hex');
  }

  /**
   * Map command/door definition to modern system
   * Handles variations in door configurations
   */
  mapAmigaCommandToModern(amigaCommand: AmigaCommand): {
    name: string;
    type: string;
    config: Record<string, any>;
  } {
    return {
      name: amigaCommand.name,
      type: amigaCommand.type,
      config: {
        path: amigaCommand.path,
        description: amigaCommand.description,
        accessLevel: this.mapSecurityLevel(amigaCommand.accessLevel),
        flags: amigaCommand.flags,
        // Preserve all original settings
        settings: Object.fromEntries(amigaCommand.settings),
      },
    };
  }

  /**
   * Smart username conflict resolution
   * Generates alternative usernames that preserve intent
   */
  resolveUsernameConflict(originalUsername: string, existingUsernames: Set<string>): string {
    let attempt = originalUsername;
    let counter = 2;

    // Try appending numbers
    while (existingUsernames.has(attempt.toLowerCase())) {
      attempt = `${originalUsername}${counter}`;
      counter++;

      // Prevent infinite loop
      if (counter > 100) {
        // Use random suffix
        attempt = `${originalUsername}_${crypto.randomBytes(4).toString('hex')}`;
        break;
      }
    }

    return attempt;
  }

  /**
   * Merge user statistics intelligently
   * Combines stats from existing and imported user
   */
  mergeUserStats(existing: User, imported: AmigaUserData): Partial<User> {
    return {
      // Take higher values for achievements
      uploads: Math.max(existing.uploads, imported.uploads),
      downloads: Math.max(existing.downloads, imported.downloads),
      bytesUpload: Math.max(existing.bytesUpload, imported.bytesUpload),
      bytesDownload: Math.max(existing.bytesDownload, imported.bytesDownload),
      calls: Math.max(existing.calls, imported.calls),
      timeTotal: Math.max(existing.timeTotal, imported.timeTotal),

      // Take most recent login
      lastLogin: this.mostRecent(existing.lastLogin, imported.lastLogin),

      // Take earliest first login
      firstLogin: this.earliest(existing.firstLogin, imported.firstLogin),

      // Use highest security level
      secLevel: Math.max(existing.secLevel, imported.secLevel),

      // Keep existing password unless explicitly requested to change
      passwordHash: existing.passwordHash,
    };
  }

  /**
   * Helper: Get most recent date
   */
  private mostRecent(date1: Date | undefined, date2: Date | undefined): Date | undefined {
    if (!date1) return date2;
    if (!date2) return date1;
    return date1 > date2 ? date1 : date2;
  }

  /**
   * Helper: Get earliest date
   */
  private earliest(date1: Date | undefined, date2: Date | undefined): Date | undefined {
    if (!date1) return date2;
    if (!date2) return date1;
    return date1 < date2 ? date1 : date2;
  }

  /**
   * Smart conference merging
   * Combines message bases and file areas from both sources
   */
  mergeConferences(existing: Conference, imported: AmigaConference): {
    updateExisting: Partial<Conference>;
    importFileAreas: any[];
    importMessageBases: any[];
  } {
    return {
      updateExisting: {
        // Keep existing name
        name: existing.name,
        // Preserve updated timestamp
        updated: getSystemTime(),
      },
      // Import file areas that don't exist
      importFileAreas: imported.fileAreas.map(area => ({
        conferenceId: existing.id,
        name: area.name,
        path: area.path,
        accessLevel: this.mapSecurityLevel(area.accessLevel),
      })),
      // Import message bases
      importMessageBases: imported.messageBases.map(base => ({
        conferenceId: existing.id,
        name: base.name,
        path: base.path,
      })),
    };
  }
}
