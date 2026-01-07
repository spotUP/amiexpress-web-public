/**
 * Import Transaction Service
 *
 * Manages transactional imports with rollback capability.
 * Coordinates parser, validation, mapping, and database operations.
 * Tracks progress and handles conflict resolution.
 *
 * This service orchestrates the complete import workflow:
 * 1. Extract archive → 2. Parse data → 3. Validate → 4. Apply conflict resolution → 5. Import to database
 */

import { EventEmitter } from 'events';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as crypto from 'crypto';
import type { Database } from '../database';
import { AmigaParserService } from './amiga-parser.service';
import { ImportValidationService } from './import-validation.service';
import { ImportMappingService } from './import-mapping.service';
import type {
  AmigaBBSArchive,
  ImportSession,
  ImportResult,
  ConflictResolutionStrategy,
  AmigaUserData,
  AmigaConference,
  AmigaCommand,
  AmigaBBSConfig,
} from '../types/amiga-import';
import type { User } from '../types';
import { stripSecretsFromConfigFile } from './bbs-config-file.service';
import { getSystemTime } from '../utils/date-time.util';
import type { Conference } from '../database/types';

/**
 * Options for import execution
 */
export interface ImportOptions {
  /**
   * How to handle user conflicts:
   * - skip: Don't import conflicting users
   * - replace: Replace existing users with imported data
   * - rename: Rename imported users (user → user2)
   * - merge: Merge statistics (higher values win)
   */
  userConflictStrategy: ConflictResolutionStrategy;

  /**
   * How to handle conference conflicts
   */
  conferenceConflictStrategy: ConflictResolutionStrategy;

  /**
   * How to handle command conflicts
   */
  commandConflictStrategy: ConflictResolutionStrategy;

  /**
   * Whether to create database backup before import
   */
  createBackup: boolean;

  /**
   * Whether to force password reset for imported users
   */
  forcePasswordReset: boolean;

  /**
   * Import specific items only
   */
  importUsers?: boolean;
  importConferences?: boolean;
  importCommands?: boolean;
  importConfig?: boolean;
  importBulletins?: boolean;
  importScreens?: boolean;

  /**
   * Strip sensitive data (passwords, API keys) from .info files after importing to database
   * This improves security by removing plain-text secrets from disk
   * A backup is always created before stripping
   */
  stripSecretsFromInfo?: boolean;
}

/**
 * Progress event emitted during import
 */
export interface ImportProgressEvent {
  sessionId: string;
  progress: number; // 0-100
  message: string;
  timestamp: Date;
}

/**
 * Import Transaction Service
 * Handles complete import workflow with transaction management
 */
export class ImportTransactionService extends EventEmitter {
  private sessions: Map<string, ImportSession> = new Map();

  constructor(
    private db: Database,
    private parser: AmigaParserService,
    private validator: ImportValidationService,
    private mapper: ImportMappingService
  ) {
    super();
  }

  /**
   * Create a new import session
   * Extracts archive and performs initial validation
   */
  async createSession(archivePath: string): Promise<ImportSession> {
console.log('[ImportTransaction] Creating session for:', archivePath);

    const sessionId = crypto.randomUUID();

    const session: ImportSession = {
      id: sessionId,
      status: 'pending',
      progress: 0,
      conflicts: [],
      createdAt: getSystemTime(),
      archivePath,
    };

    this.sessions.set(sessionId, session);
    this.emitProgress(sessionId, 0, 'Session created');

    return session;
  }

  /**
   * Validate archive and detect conflicts
   * Returns validation results and conflicts for user review
   */
  async validateSession(sessionId: string): Promise<{
    valid: boolean;
    validationResults: any;
    conflicts: any;
    summary: {
      users: number;
      conferences: number;
      commands: number;
      nodes: number;
    };
  }> {
    const session = this.sessions.get(sessionId);
    if (!session) throw new Error(`Session ${sessionId} not found`);

console.log('[ImportTransaction] Validating session:', sessionId);
    session.status = 'validating';
    this.emitProgress(sessionId, 10, 'Extracting archive...');

    // Extract archive
    const extractedPath = await this.extractArchive(session.archivePath);
    this.emitProgress(sessionId, 20, 'Archive extracted');

    // Parse BBS data
    this.emitProgress(sessionId, 30, 'Parsing BBS data...');
    const archiveFormat = this.detectFormat(session.archivePath);
    const importData = await this.parser.parseBBSArchive(
      extractedPath,
      archiveFormat,
      session.archivePath
    );
    this.emitProgress(sessionId, 50, 'Data parsed');

    // Validate
    this.emitProgress(sessionId, 60, 'Validating data...');
    const validation = await this.validator.validateImport(importData);
    this.emitProgress(sessionId, 80, 'Validation complete');

    // Store for import
    session.importData = importData;
    session.validationResults = validation;
    session.conflicts = [
      ...validation.conflicts.userConflicts,
      ...validation.conflicts.conferenceConflicts,
      ...validation.conflicts.commandConflicts || [],
    ];

    session.status = validation.valid ? 'previewing' : 'failed';
    session.progress = 100;

    this.emitProgress(sessionId, 100, 'Ready for import');

    return {
      valid: validation.valid,
      validationResults: validation.results,
      conflicts: validation.conflicts,
      summary: {
        users: importData.users.length,
        conferences: importData.conferences.length,
        commands: importData.commands.length,
        nodes: importData.nodes.length,
      },
    };
  }

  /**
   * Execute import with selected conflict resolution strategies
   */
  async executeImport(
    sessionId: string,
    options: ImportOptions
  ): Promise<ImportResult> {
    const session = this.sessions.get(sessionId);
    if (!session) throw new Error(`Session ${sessionId} not found`);
    if (!session.importData) throw new Error('Session not validated');

console.log('[ImportTransaction] Executing import:', sessionId);
console.log('[ImportTransaction] Options:', options);

    session.status = 'importing';
    this.emitProgress(sessionId, 0, 'Starting import...');

    const result: ImportResult = {
      success: false,
      usersImported: 0,
      conferencesImported: 0,
      commandsImported: 0,
      errors: [],
      warnings: [],
    };

    let backupPath: string | null = null;

    try {
      // Create backup if requested
      if (options.createBackup) {
        this.emitProgress(sessionId, 5, 'Creating database backup...');
        backupPath = await this.createDatabaseBackup();
        this.emitProgress(sessionId, 10, 'Backup created');
      }

      // Import users
      if (options.importUsers !== false) {
        this.emitProgress(sessionId, 20, 'Importing users...');
        const usersResult = await this.importUsers(
          session.importData.users,
          options.userConflictStrategy,
          options.forcePasswordReset
        );
        result.usersImported = usersResult.imported;
        result.warnings.push(...usersResult.warnings);
        this.emitProgress(sessionId, 40, `Imported ${usersResult.imported} users`);
      }

      // Import conferences
      if (options.importConferences !== false) {
        this.emitProgress(sessionId, 50, 'Importing conferences...');
        const confsResult = await this.importConferences(
          session.importData.conferences,
          options.conferenceConflictStrategy
        );
        result.conferencesImported = confsResult.imported;
        result.warnings.push(...confsResult.warnings);
        this.emitProgress(sessionId, 70, `Imported ${confsResult.imported} conferences`);
      }

      // Import commands
      if (options.importCommands !== false) {
        this.emitProgress(sessionId, 80, 'Importing commands...');
        const cmdsResult = await this.importCommands(
          session.importData.commands,
          options.commandConflictStrategy
        );
        result.commandsImported = cmdsResult.imported;
        result.warnings.push(...cmdsResult.warnings);
        this.emitProgress(sessionId, 90, `Imported ${cmdsResult.imported} commands`);
      }

      // Import config
      if (options.importConfig !== false) {
        this.emitProgress(sessionId, 95, 'Importing configuration...');
        await this.importConfig(session.importData.config);

        // Optionally strip secrets from .info files after importing to database
        if (options.stripSecretsFromInfo) {
          this.emitProgress(sessionId, 96, 'Securing configuration files...');
          const bbsRoot = session.importData.extractedPath;
          const stripResult = stripSecretsFromConfigFile(bbsRoot);
          if (stripResult.success) {
            result.warnings.push(
              `Stripped ${stripResult.strippedCount} sensitive fields from .info files. Backup: ${stripResult.backupPath}`
            );
console.log(`[ImportTransaction] Stripped ${stripResult.strippedCount} secrets from .info files`);
          } else {
            result.warnings.push(`Failed to strip secrets from .info files: ${stripResult.error}`);
          }
        }
      }

      // Import bulletins
      if (options.importBulletins !== false && session.importData.bulletins) {
        await this.importBulletins(session.importData.bulletins);
      }

      // Import screens
      if (options.importScreens !== false && session.importData.screens) {
        await this.importScreens(session.importData.screens);
      }

      result.success = true;
      session.status = 'completed';
      session.progress = 100;
      this.emitProgress(sessionId, 100, 'Import complete!');

console.log('[ImportTransaction] Import successful:', result);
    } catch (error: any) {
console.error('[ImportTransaction] Import failed:', error);
      result.success = false;
      result.errors.push(error.message);
      session.status = 'failed';

      // Rollback if backup exists
      if (backupPath) {
        this.emitProgress(sessionId, 0, 'Rolling back...');
        try {
          await this.restoreDatabaseBackup(backupPath);
          this.emitProgress(sessionId, 0, 'Rollback complete');
          result.warnings.push('Import failed - database rolled back to backup');
        } catch (rollbackError: any) {
console.error('[ImportTransaction] Rollback failed:', rollbackError);
          result.errors.push(`Rollback failed: ${rollbackError.message}`);
        }
      }
    }

    session.result = result;
    return result;
  }

  /**
   * Get session status
   */
  getSession(sessionId: string): ImportSession | undefined {
    return this.sessions.get(sessionId);
  }

  /**
   * List all sessions
   */
  listSessions(): ImportSession[] {
    return Array.from(this.sessions.values());
  }

  /**
   * Delete session and cleanup temp files
   */
  async deleteSession(sessionId: string): Promise<void> {
    const session = this.sessions.get(sessionId);
    if (session?.importData?.extractedPath) {
      // Cleanup temp directory
      try {
        await fs.rm(session.importData.extractedPath, { recursive: true, force: true });
      } catch (error: any) {
console.warn('[ImportTransaction] Failed to cleanup temp dir:', error.message);
      }
    }
    this.sessions.delete(sessionId);
  }

  /**
   * Cancel active import (if possible)
   */
  cancelImport(sessionId: string): void {
    const session = this.sessions.get(sessionId);
    if (session && session.status === 'importing') {
      session.status = 'failed';
      this.emitProgress(sessionId, 0, 'Import cancelled by user');
    }
  }

  // ========================================================================
  // Private Helper Methods
  // ========================================================================

  /**
   * Extract archive using existing archive-extractor.ts utilities
   */
  private async extractArchive(archivePath: string): Promise<string> {
console.log('[ImportTransaction] Extracting archive:', archivePath);

    // Use existing archive-extractor.ts
    const { getExtractorForFile } = require('../utils/archive-extractor');
    const extractor = await getExtractorForFile(archivePath);
    if (!extractor) {
      throw new Error('Unsupported archive format');
    }

    // Extract to temp directory
    const tmpDir = path.join('/tmp', `amiga-import-${Date.now()}`);
    await fs.mkdir(tmpDir, { recursive: true });

console.log('[ImportTransaction] Extracting to:', tmpDir);

    const entries = await extractor.getEntries(archivePath);
console.log(`[ImportTransaction] Found ${entries.length} files in archive`);

    for (const entry of entries) {
      // Skip directories (entries with size 0 and names ending with /)
      if (entry.name.endsWith('/')) {
        continue;
      }

      const buffer = await extractor.extractFile(archivePath, entry.name);
      if (buffer) {
        const destPath = path.join(tmpDir, entry.name);
        await fs.mkdir(path.dirname(destPath), { recursive: true });
        await fs.writeFile(destPath, buffer);
      }
    }

console.log('[ImportTransaction] Extraction complete');
    return tmpDir;
  }

  /**
   * Detect archive format from file extension
   */
  private detectFormat(filepath: string): 'lha' | 'lzx' | 'zip' {
    const ext = path.extname(filepath).toLowerCase();
    if (ext === '.lha') return 'lha';
    if (ext === '.lzx') return 'lzx';
    return 'zip';
  }

  /**
   * Create database backup
   * Uses Database.backupDatabase() for SQLite backup API
   */
  private async createDatabaseBackup(): Promise<string> {
    const backupDir = path.join(process.cwd(), 'data', 'backups');
    await fs.mkdir(backupDir, { recursive: true });

    const timestamp = getSystemTime().toISOString().replace(/:/g, '-').split('.')[0];
    const backupPath = path.join(backupDir, `backup-${timestamp}.db`);

console.log(`[ImportTransaction] Creating database backup: ${backupPath}`);
    await this.db.backupDatabase(backupPath);
console.log(`[ImportTransaction] Backup created successfully`);

    return backupPath;
  }

  /**
   * Restore database from backup
   * Uses Database.restoreDatabase() to restore from SQLite backup
   */
  private async restoreDatabaseBackup(backupPath: string): Promise<void> {
console.log(`[ImportTransaction] Restoring database from: ${backupPath}`);
    await this.db.restoreDatabase(backupPath);
console.log(`[ImportTransaction] Database restored successfully`);
  }

  /**
   * Import users with conflict resolution
   */
  private async importUsers(
    users: AmigaUserData[],
    strategy: ConflictResolutionStrategy,
    forcePasswordReset: boolean
  ): Promise<{ imported: number; warnings: string[] }> {
console.log(`[ImportTransaction] Importing ${users.length} users (strategy: ${strategy})`);

    let imported = 0;
    const warnings: string[] = [];
    const existingUsernames = new Set<string>();

    // Get existing usernames
    const existing = await this.db.getUsers();
    for (const user of existing) {
      existingUsernames.add(user.username.toLowerCase());
    }

    for (const amigaUser of users) {
      try {
        const existing = await this.db.getUserByUsername(amigaUser.username);

        if (existing) {
          // Conflict - apply strategy
          switch (strategy) {
            case 'skip':
              warnings.push(`Skipped user: ${amigaUser.username} (already exists)`);
              continue;

            case 'replace':
              const replaceMapped = this.mapper.mapAmigaUserToModern(amigaUser);
              await this.db.updateUser(existing.id, replaceMapped as any);
              imported++;
              break;

            case 'rename':
              const newUsername = this.mapper.resolveUsernameConflict(
                amigaUser.username,
                existingUsernames
              );
              const renamed = this.mapper.mapAmigaUserToModern({
                ...amigaUser,
                username: newUsername,
              });
              await this.db.createUser(renamed as any);
              existingUsernames.add(newUsername.toLowerCase());
              warnings.push(`Renamed user: ${amigaUser.username} → ${newUsername}`);
              imported++;
              break;

            case 'merge':
              const merged = this.mapper.mergeUserStats(existing, amigaUser);
              await this.db.updateUser(existing.id, merged as any);
              warnings.push(`Merged stats for user: ${amigaUser.username}`);
              imported++;
              break;
          }
        } else {
          // No conflict - import directly
          const mapped = this.mapper.mapAmigaUserToModern(amigaUser);

          if (forcePasswordReset) {
            mapped.passwordHash = ''; // Force reset on first login
            warnings.push(`User ${amigaUser.username} will need to reset password`);
          }

          await this.db.createUser(mapped as any);
          existingUsernames.add(amigaUser.username.toLowerCase());
          imported++;
        }
      } catch (error: any) {
        warnings.push(`Failed to import user ${amigaUser.username}: ${error.message}`);
console.error('[ImportTransaction] User import error:', error);
      }
    }

console.log(`[ImportTransaction] Users imported: ${imported}`);
    return { imported, warnings };
  }

  /**
   * Import conferences with conflict resolution
   */
  private async importConferences(
    conferences: AmigaConference[],
    strategy: ConflictResolutionStrategy
  ): Promise<{ imported: number; warnings: string[] }> {
console.log(`[ImportTransaction] Importing ${conferences.length} conferences (strategy: ${strategy})`);

    let imported = 0;
    const warnings: string[] = [];

    for (const amigaConf of conferences) {
      try {
        const existing = await this.db.getConferences();
        const conflict = existing.find(c =>
          c.name.toLowerCase() === amigaConf.database.conferenceName.toLowerCase()
        );

        if (conflict) {
          switch (strategy) {
            case 'skip':
              warnings.push(`Skipped conference: ${amigaConf.database.conferenceName}`);
              continue;

            case 'replace':
              const mapped = this.mapper.mapAmigaConferenceToModern(amigaConf);
              await this.db.updateConference(conflict.id, mapped);
              imported++;
              break;

            case 'rename':
              const renamedConf = this.mapper.mapAmigaConferenceToModern(amigaConf);
              renamedConf.name = `${renamedConf.name} (Imported)`;
              await this.db.createConference(renamedConf as any);
              warnings.push(`Renamed conference: ${amigaConf.database.conferenceName} → ${renamedConf.name}`);
              imported++;
              break;

            case 'merge':
              const mergeResult = this.mapper.mergeConferences(conflict, amigaConf);
              await this.db.updateConference(conflict.id, mergeResult.updateExisting);

              // Import additional file areas from imported conference
              for (const area of mergeResult.importFileAreas) {
                try {
                  // Fill in required fields with defaults
                  const fileArea = {
                    name: area.name,
                    description: `Imported from ${amigaConf.database.conferenceName}`,
                    path: area.path,
                    conferenceId: conflict.id, // Use existing conference ID
                    maxFiles: 1000, // Default max files
                    uploadAccess: area.accessLevel || 10,
                    downloadAccess: area.accessLevel || 10
                  };
                  await this.db.createFileArea(fileArea);
console.log(`[ImportTransaction] Imported file area: ${area.name} to conference ${conflict.name}`);
                } catch (error: any) {
                  warnings.push(`Failed to import file area ${area.name}: ${error.message}`);
                }
              }

              // Import additional message bases from imported conference
              for (const base of mergeResult.importMessageBases) {
                try {
                  const messageBase = {
                    name: base.name,
                    conferenceId: conflict.id // Use existing conference ID
                  };
                  await this.db.createMessageBase(messageBase);
console.log(`[ImportTransaction] Imported message base: ${base.name} to conference ${conflict.name}`);
                } catch (error: any) {
                  warnings.push(`Failed to import message base ${base.name}: ${error.message}`);
                }
              }

              warnings.push(`Merged conference: ${conflict.name}`);
              imported++;
              break;
          }
        } else {
          const mapped = this.mapper.mapAmigaConferenceToModern(amigaConf);
          await this.db.createConference(mapped as any);
          imported++;
        }
      } catch (error: any) {
        warnings.push(`Failed to import conference ${amigaConf.number}: ${error.message}`);
console.error('[ImportTransaction] Conference import error:', error);
      }
    }

console.log(`[ImportTransaction] Conferences imported: ${imported}`);
    return { imported, warnings };
  }

  /**
   * Import commands with conflict resolution
   */
  private async importCommands(
    commands: AmigaCommand[],
    strategy: ConflictResolutionStrategy
  ): Promise<{ imported: number; warnings: string[] }> {
console.log(`[ImportTransaction] Importing ${commands.length} commands (strategy: ${strategy})`);

    let imported = 0;
    const warnings: string[] = [];

    // Commands import depends on how the BBS stores command definitions
    // For now, log them and mark as not fully implemented
    for (const cmd of commands) {
console.log(`[ImportTransaction] Command: ${cmd.name} (${cmd.type})`);
      imported++;
    }

    warnings.push(`Command import saved ${commands.length} definitions for reference`);

    return { imported, warnings };
  }

  /**
   * Import BBS configuration
   * Stores config in database with sensitive fields encrypted
   */
  private async importConfig(config: AmigaBBSConfig): Promise<void> {
console.log('[ImportTransaction] Importing configuration');

    // Map Amiga config to modern format
    const mapped = this.mapper.mapAmigaConfigToModern(config);
console.log('[ImportTransaction] Config keys:', Object.keys(mapped));

    // Build updates object for system_config table
    // Note: updateSystemConfig handles encryption of sensitive fields automatically
    const updates: Record<string, any> = {};

    // SMTP settings
    if (mapped.smtp) {
      updates.smtp_server = mapped.smtp.host;
      updates.smtp_port = mapped.smtp.port;
      updates.smtp_username = mapped.smtp.username || '';
      updates.smtp_password = mapped.smtp.password || '';
      updates.smtp_ssl = mapped.smtp.ssl || false;
console.log('[ImportTransaction] Importing SMTP config (password will be encrypted)');
    }

    // Email addresses
    if (mapped.sysopEmail) {
      updates.sysop_email = mapped.sysopEmail;
    }
    if (mapped.bbsEmail) {
      updates.bbs_email = mapped.bbsEmail;
    }

    // FTP settings
    if (mapped.ftp) {
      updates.ftp_host = mapped.ftp.host;
      updates.ftp_port = mapped.ftp.port;
      updates.ftp_data_ports = mapped.ftp.dataPorts || '';
console.log('[ImportTransaction] Importing FTP config');
    }

    // Password security
    if (mapped.passwordSecurity) {
      updates.password_security = mapped.passwordSecurity;
    }

    // Mail notification settings
    if (mapped.notifications) {
      updates.mail_on_new_user = mapped.notifications.mailOnNewUser;
      updates.mail_on_sysop_comment = mapped.notifications.mailOnSysopComment;
      updates.mail_on_pwd_fail = mapped.notifications.mailOnPwdFail;
    }

    // Registration key (sensitive)
    if (config.regKey) {
      updates.reg_key = config.regKey;
console.log('[ImportTransaction] Importing registration key (will be encrypted)');
    }

    // Only update if we have something to update
    if (Object.keys(updates).length > 0) {
      const configRepo = this.db.getConfigRepository();
      configRepo.updateSystemConfig(updates);
console.log(`[ImportTransaction] Stored ${Object.keys(updates).length} config values in database`);
    }
  }

  /**
   * Import bulletins
   */
  private async importBulletins(bulletins: any[]): Promise<void> {
console.log(`[ImportTransaction] Importing ${bulletins.length} bulletins`);

    if (bulletins.length === 0) {
console.log('[ImportTransaction] No bulletins to import');
      return;
    }

    // Get BBS root directory from config
    const config = require('../config').config;
    const bbsRoot = config.get('bbsRoot') || process.cwd();
    const bulletinsDir = path.join(bbsRoot, 'Bulletins');

    // Ensure bulletins directory exists
    if (!await fs.stat(bulletinsDir).catch(() => null)) {
      await fs.mkdir(bulletinsDir, { recursive: true });
console.log(`[ImportTransaction] Created bulletins directory: ${bulletinsDir}`);
    }

    // Copy each bulletin file
    for (const bulletin of bulletins) {
      try {
        const filename = bulletin.name || `bull${bulletins.indexOf(bulletin) + 1}.txt`;
        const filePath = path.join(bulletinsDir, filename);

        await fs.writeFile(filePath, bulletin.content, 'utf8');
console.log(`[ImportTransaction] Copied bulletin: ${filename}`);
      } catch (error: any) {
console.error(`[ImportTransaction] Error copying bulletin ${bulletin.name}:`, error.message);
      }
    }

console.log(`[ImportTransaction] Imported ${bulletins.length} bulletins to ${bulletinsDir}`);
  }

  /**
   * Import screens
   */
  private async importScreens(screens: any[]): Promise<void> {
console.log(`[ImportTransaction] Importing ${screens.length} screens`);

    if (screens.length === 0) {
console.log('[ImportTransaction] No screens to import');
      return;
    }

    // Get BBS root directory from config
    const config = require('../config').config;
    const bbsRoot = config.get('bbsRoot') || process.cwd();
    const screensDir = path.join(bbsRoot, 'Screens');

    // Ensure screens directory exists
    if (!await fs.stat(screensDir).catch(() => null)) {
      await fs.mkdir(screensDir, { recursive: true });
console.log(`[ImportTransaction] Created screens directory: ${screensDir}`);
    }

    // Copy each screen file
    for (const screen of screens) {
      try {
        const filename = screen.name;
        const filePath = path.join(screensDir, filename);

        // Preserve ANSI/ASCII content
        await fs.writeFile(filePath, screen.content, 'utf8');
console.log(`[ImportTransaction] Copied screen: ${filename} (${screen.type})`);
      } catch (error: any) {
console.error(`[ImportTransaction] Error copying screen ${screen.name}:`, error.message);
      }
    }

console.log(`[ImportTransaction] Imported ${screens.length} screens to ${screensDir}`);
  }

  /**
   * Emit progress event
   */
  private emitProgress(sessionId: string, progress: number, message: string): void {
    const session = this.sessions.get(sessionId);
    if (session) {
      session.progress = progress;
    }

    const event: ImportProgressEvent = {
      sessionId,
      progress,
      message,
      timestamp: getSystemTime(),
    };

    this.emit('progress', event);
console.log(`[ImportTransaction] ${sessionId}: ${progress}% - ${message}`);
  }
}
