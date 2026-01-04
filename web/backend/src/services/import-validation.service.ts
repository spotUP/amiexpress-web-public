/**
 * Import Validation Service
 *
 * Validates imported Amiga BBS data before applying to database.
 * Checks for data integrity, conflicts, and compatibility.
 */

import type { Database } from '../database';
import type {
  AmigaBBSArchive,
  AmigaUserData,
  AmigaConference,
  AmigaBBSConfig,
  ValidationResult,
  ConflictReport,
  ImportConflict,
} from '../types/amiga-import';

export class ImportValidationService {
  constructor(private db: Database) {}

  /**
   * Validate complete archive structure
   * Checks if the extracted directory contains required files
   */
  async validateArchiveStructure(extractedPath: string): Promise<ValidationResult> {
    const errors: string[] = [];
    const warnings: string[] = [];
    const info: string[] = [];

    // Check for core files (optional since not all BBS have everything)
    const { promises: fs } = require('fs');
    const path = require('path');

    try {
      // Check for user files
      const userDataPath = path.join(extractedPath, 'User.data');
      try {
        await fs.access(userDataPath);
        info.push('Found User.data');
      } catch {
        warnings.push('User.data not found - no users will be imported');
      }

      // Check for conference directories
      const entries = await fs.readdir(extractedPath, { withFileTypes: true });
      const confDirs = entries.filter((e: any) => e.isDirectory() && /^Conf\d+$/i.test(e.name));
      if (confDirs.length > 0) {
        info.push(`Found ${confDirs.length} conference directories`);
      } else {
        warnings.push('No conference directories found');
      }

      // Check for Commands directory
      const commandsPath = path.join(extractedPath, 'Commands');
      try {
        await fs.access(commandsPath);
        info.push('Found Commands directory');
      } catch {
        warnings.push('Commands directory not found');
      }

      // Check for configuration
      const configPath = path.join(extractedPath, 'bbsConfig.info');
      try {
        await fs.access(configPath);
        info.push('Found bbsConfig.info');
      } catch {
        warnings.push('bbsConfig.info not found - using default configuration');
      }

      return {
        valid: errors.length === 0,
        errors,
        warnings,
        info,
      };
    } catch (error: any) {
      errors.push(`Archive structure validation failed: ${error.message}`);
      return {
        valid: false,
        errors,
        warnings,
        info,
      };
    }
  }

  /**
   * Validate user data
   */
  validateUsers(users: AmigaUserData[]): ValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];
    const info: string[] = [];

    if (users.length === 0) {
      warnings.push('No users to import');
      return { valid: true, errors, warnings, info };
    }

    info.push(`Validating ${users.length} users`);

    // Check for duplicate usernames in import data
    const usernames = new Set<string>();
    const duplicates = new Set<string>();

    for (const user of users) {
      // Validate username
      if (!user.username || user.username.trim().length === 0) {
        errors.push('Found user with empty username');
        continue;
      }

      // Check for duplicates
      const username = user.username.toLowerCase();
      if (usernames.has(username)) {
        duplicates.add(user.username);
        errors.push(`Duplicate username in import: ${user.username}`);
      } else {
        usernames.add(username);
      }

      // Validate security level
      if (user.secLevel < 0 || user.secLevel > 255) {
        warnings.push(`User ${user.username} has invalid security level: ${user.secLevel}`);
      }

      // Validate dates
      if (user.firstLogin && user.lastLogin) {
        if (user.firstLogin > user.lastLogin) {
          warnings.push(`User ${user.username} has first login after last login`);
        }
      }

      // Validate stats
      if (user.bytesUpload < 0 || user.bytesDownload < 0) {
        warnings.push(`User ${user.username} has negative byte counts`);
      }
    }

    if (duplicates.size > 0) {
      errors.push(`Found ${duplicates.size} duplicate usernames in import data`);
    }

    info.push(`Validated ${users.length} users, ${duplicates.size} duplicates found`);

    return {
      valid: errors.length === 0,
      errors,
      warnings,
      info,
    };
  }

  /**
   * Validate conferences
   */
  validateConferences(conferences: AmigaConference[]): ValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];
    const info: string[] = [];

    if (conferences.length === 0) {
      warnings.push('No conferences to import');
      return { valid: true, errors, warnings, info };
    }

    info.push(`Validating ${conferences.length} conferences`);

    // Check for duplicate conference numbers
    const confNumbers = new Set<number>();
    const confNames = new Set<string>();

    for (const conf of conferences) {
      // Validate conference number
      if (confNumbers.has(conf.number)) {
        errors.push(`Duplicate conference number: ${conf.number}`);
      } else {
        confNumbers.add(conf.number);
      }

      // Validate conference name
      const name = conf.database.conferenceName.toLowerCase();
      if (confNames.has(name)) {
        warnings.push(`Duplicate conference name: ${conf.database.conferenceName}`);
      } else {
        confNames.add(name);
      }

      // Validate access level
      if (conf.database.accessLevel < 0 || conf.database.accessLevel > 255) {
        warnings.push(`Conference ${conf.number} has invalid access level: ${conf.database.accessLevel}`);
      }

      // Check for file areas
      if (conf.fileAreas.length === 0) {
        warnings.push(`Conference ${conf.number} has no file areas`);
      }
    }

    info.push(`Validated ${conferences.length} conferences`);

    return {
      valid: errors.length === 0,
      errors,
      warnings,
      info,
    };
  }

  /**
   * Validate configuration
   */
  validateConfig(config: AmigaBBSConfig): ValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];
    const info: string[] = [];

    info.push('Validating BBS configuration');

    // Validate SMTP settings
    if (config.smtpHost && !config.smtpPort) {
      warnings.push('SMTP host specified but no port - defaulting to 25');
    }

    if (config.smtpUsername && !config.smtpPassword) {
      warnings.push('SMTP username specified but no password');
    }

    // Validate FTP settings
    if (config.ftpPort && (config.ftpPort < 1 || config.ftpPort > 65535)) {
      errors.push(`Invalid FTP port: ${config.ftpPort}`);
    }

    // Validate email addresses
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (config.sysopEmail && !emailRegex.test(config.sysopEmail)) {
      warnings.push(`Invalid sysop email: ${config.sysopEmail}`);
    }

    if (config.bbsEmail && !emailRegex.test(config.bbsEmail)) {
      warnings.push(`Invalid BBS email: ${config.bbsEmail}`);
    }

    info.push('Configuration validation complete');

    return {
      valid: errors.length === 0,
      errors,
      warnings,
      info,
    };
  }

  /**
   * Check for conflicts with existing data
   */
  async checkConflicts(importData: AmigaBBSArchive): Promise<ConflictReport> {
    const report: ConflictReport = {
      userConflicts: [],
      conferenceConflicts: [],
      commandConflicts: [],
      configConflicts: [],
      recommendations: [],
    };

    // Check user conflicts
    for (const amigaUser of importData.users) {
      const existing = await this.db.getUserByUsername(amigaUser.username);
      if (existing) {
        report.userConflicts.push({
          id: `user-${amigaUser.username}`,
          type: 'user',
          field: 'username',
          existing: {
            username: existing.username,
            secLevel: existing.secLevel,
            calls: existing.calls,
            lastLogin: existing.lastLogin,
          },
          import: {
            username: amigaUser.username,
            secLevel: amigaUser.secLevel,
            calls: amigaUser.calls,
            lastLogin: amigaUser.lastLogin,
          },
        });
      }
    }

    // Check conference conflicts
    for (const amigaConf of importData.conferences) {
      const conferences = await this.db.getConferences();
      const existing = conferences.find(c =>
        c.name.toLowerCase() === amigaConf.database.conferenceName.toLowerCase()
      );

      if (existing) {
        report.conferenceConflicts.push({
          id: `conf-${amigaConf.number}`,
          type: 'conference',
          field: 'name',
          existing: {
            id: existing.id,
            name: existing.name,
          },
          import: {
            number: amigaConf.number,
            name: amigaConf.database.conferenceName,
            accessLevel: amigaConf.database.accessLevel,
          },
        });
      }
    }

    // Generate recommendations
    if (report.userConflicts.length > 0) {
      report.recommendations.push(
        `${report.userConflicts.length} user conflicts detected. Options: skip, replace, rename, or merge stats.`
      );
    }

    if (report.conferenceConflicts.length > 0) {
      report.recommendations.push(
        `${report.conferenceConflicts.length} conference conflicts detected. Options: skip, replace, or rename.`
      );
    }

    if (report.userConflicts.length === 0 && report.conferenceConflicts.length === 0) {
      report.recommendations.push('No conflicts detected - import can proceed without conflicts.');
    }

    return report;
  }

  /**
   * Comprehensive validation of entire import
   */
  async validateImport(importData: AmigaBBSArchive): Promise<{
    valid: boolean;
    results: {
      structure: ValidationResult;
      users: ValidationResult;
      conferences: ValidationResult;
      config: ValidationResult;
    };
    conflicts: ConflictReport;
  }> {
console.log('[ImportValidation] Running comprehensive validation...');

    const results = {
      structure: await this.validateArchiveStructure(importData.extractedPath),
      users: this.validateUsers(importData.users),
      conferences: this.validateConferences(importData.conferences),
      config: this.validateConfig(importData.config),
    };

    const conflicts = await this.checkConflicts(importData);

    const valid =
      results.structure.valid &&
      results.users.valid &&
      results.conferences.valid &&
      results.config.valid;

console.log('[ImportValidation] Validation complete:');
console.log(`  Structure: ${results.structure.valid ? 'PASS' : 'FAIL'}`);
console.log(`  Users: ${results.users.valid ? 'PASS' : 'FAIL'}`);
console.log(`  Conferences: ${results.conferences.valid ? 'PASS' : 'FAIL'}`);
console.log(`  Config: ${results.config.valid ? 'PASS' : 'FAIL'}`);
console.log(`  Conflicts: ${conflicts.userConflicts.length + conflicts.conferenceConflicts.length}`);

    return { valid, results, conflicts };
  }
}
