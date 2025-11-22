/**
 * Amiga BBS Export Service
 *
 * Exports current BBS data to Amiga-compatible archive format.
 * Creates archives that can be imported into classic Amiga AmiExpress BBS.
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import type { Database } from '../database';
import type { AmigaBBSArchive, AmigaUserData, AmigaConference, AmigaBBSConfig } from '../types/amiga-import';
import { createLhaArchive, isLhaAvailable } from '../utils/lha-archiver.util';

// eslint-disable-next-line @typescript-eslint/no-var-requires
const AdmZip = require('adm-zip');

export interface ExportOptions {
  includeUsers?: boolean;
  includeConferences?: boolean;
  includeMessages?: boolean;
  includeFiles?: boolean;
  includeConfig?: boolean;
  includeBulletins?: boolean;
  includeScreens?: boolean;
  format?: 'zip' | 'lha' | 'lzx';
}

export interface ExportResult {
  success: boolean;
  archivePath?: string;
  filename?: string;
  size?: number;
  itemsExported: {
    users: number;
    conferences: number;
    messages: number;
    files: number;
    bulletins: number;
    screens: number;
  };
  errors: string[];
  warnings: string[];
}

export class AmigaExportService {
  private db: Database;

  constructor(db: Database) {
    this.db = db;
  }

  /**
   * Export BBS data to Amiga-compatible archive
   */
  async exportBBS(options: ExportOptions = {}): Promise<ExportResult> {
    const errors: string[] = [];
    const warnings: string[] = [];
    const itemsExported = {
      users: 0,
      conferences: 0,
      messages: 0,
      files: 0,
      bulletins: 0,
      screens: 0,
    };

    try {
      // Create temporary export directory
      const timestamp = Date.now();
      const exportDir = path.join(process.cwd(), 'data', 'exports', `export-${timestamp}`);
      await fs.mkdir(exportDir, { recursive: true });

      // Export data sections
      if (options.includeUsers !== false) {
        try {
          itemsExported.users = await this.exportUsers(exportDir);
        } catch (error: any) {
          errors.push(`Failed to export users: ${error.message}`);
        }
      }

      if (options.includeConferences !== false) {
        try {
          itemsExported.conferences = await this.exportConferences(exportDir);
        } catch (error: any) {
          errors.push(`Failed to export conferences: ${error.message}`);
        }
      }

      if (options.includeMessages !== false) {
        try {
          itemsExported.messages = await this.exportMessages(exportDir);
        } catch (error: any) {
          errors.push(`Failed to export messages: ${error.message}`);
        }
      }

      if (options.includeFiles !== false) {
        try {
          itemsExported.files = await this.exportFiles(exportDir);
        } catch (error: any) {
          errors.push(`Failed to export files: ${error.message}`);
        }
      }

      if (options.includeConfig !== false) {
        try {
          await this.exportConfig(exportDir);
        } catch (error: any) {
          errors.push(`Failed to export config: ${error.message}`);
        }
      }

      if (options.includeBulletins !== false) {
        try {
          itemsExported.bulletins = await this.exportBulletins(exportDir);
        } catch (error: any) {
          errors.push(`Failed to export bulletins: ${error.message}`);
        }
      }

      if (options.includeScreens !== false) {
        try {
          itemsExported.screens = await this.exportScreens(exportDir);
        } catch (error: any) {
          errors.push(`Failed to export screens: ${error.message}`);
        }
      }

      // Create archive
      const format = options.format || 'zip';
      const archivePath = await this.createArchive(exportDir, format, timestamp);
      const stats = await fs.stat(archivePath);

      // Clean up temp directory
      await fs.rm(exportDir, { recursive: true, force: true });

      return {
        success: errors.length === 0,
        archivePath,
        filename: path.basename(archivePath),
        size: stats.size,
        itemsExported,
        errors,
        warnings,
      };
    } catch (error: any) {
      errors.push(`Export failed: ${error.message}`);
      return {
        success: false,
        itemsExported,
        errors,
        warnings,
      };
    }
  }

  /**
   * Export users to JSON format
   */
  private async exportUsers(exportDir: string): Promise<number> {
    const users = await this.db.getUsers({});

    // Convert to Amiga format
    const amigaUsers: any[] = users.map((user: any) => ({
      username: user.username,
      passwordHash: user.password_hash,
      realname: user.real_name || '',
      location: user.location || '',
      phone: user.phone || '',
      email: user.email || '',
      secLevel: user.security_level,
      userFlags: user.user_flags || 0,
      uploads: user.uploads || 0,
      downloads: user.downloads || 0,
      bytesUpload: user.bytes_upload || 0,
      bytesDownload: user.bytes_download || 0,
      ratio: user.ratio || 0,
      ratioType: user.ratio_type || 0,
      timeTotal: user.time_total || 0,
      timeLimit: user.time_limit || 0,
      timeUsed: user.time_used || 0,
      chatLimit: user.chat_limit || 0,
      chatUsed: user.chat_used || 0,
      lastLogin: user.last_login ? new Date(user.last_login) : undefined,
      firstLogin: new Date(user.created_at),
      calls: user.calls || 0,
      callsToday: user.calls_today || 0,
      newUser: user.new_user === 1,
      expert: user.expert === 'X',
      ansi: user.ansi === 1,
      linesPerScreen: user.lines_per_screen || 24,
      computer: user.computer || '',
      screenType: user.screen_type || 0,
      protocol: user.protocol || '',
      editor: user.editor || '',
      zoomType: user.zoom_type || 0,
      availableForChat: user.available_for_chat === 1,
      quietNode: user.quiet_node === 1,
      autoRejoin: user.auto_rejoin === 1,
      confAccess: user.conf_access || '',
      areaName: user.area_name || '',
      uuCP: user.uucp === 1,
      topUploadCPS: user.top_upload_cps || 0,
      topDownloadCPS: user.top_download_cps || 0,
      birthdate: user.birthdate ? new Date(user.birthdate) : undefined,
      signature: user.signature || '',
      notes: user.notes || '',
      banned: user.banned === 1,
      deleted: user.deleted === 1,
    }));

    // Write to JSON file
    await fs.writeFile(
      path.join(exportDir, 'users.json'),
      JSON.stringify(amigaUsers, null, 2),
      'utf-8'
    );

    return users.length;
  }

  /**
   * Export conferences to JSON format
   */
  private async exportConferences(exportDir: string): Promise<number> {
    const conferences = await this.db.getConferences();

    // Convert to Amiga format
    const amigaConferences: any[] = conferences.map((conf: any) => ({
      name: conf.name,
      description: conf.description || '',
      confNumber: conf.id,
      confType: 'message' as const,
      accessLevel: conf.access_level || 0,
      readSecLevel: conf.read_sec_level || 0,
      writeSecLevel: conf.write_sec_level || 0,
      sysopSecLevel: conf.sysop_sec_level || 255,
      maxMessages: conf.max_messages || 1000,
      networkType: 'local' as const,
      messageCount: 0, // Will be calculated from messages
    }));

    await fs.writeFile(
      path.join(exportDir, 'conferences.json'),
      JSON.stringify(amigaConferences, null, 2),
      'utf-8'
    );

    return conferences.length;
  }

  /**
   * Export messages to JSON format
   */
  private async exportMessages(exportDir: string): Promise<number> {
    // Get all conferences and their message bases
    const conferences = await this.db.getConferences();
    const allMessages: any[] = [];

    // Get messages from each conference
    for (const conf of conferences) {
      try {
        const messageBases = await this.db.getMessageBases(conf.id);
        for (const base of messageBases) {
          const messages = await this.db.getMessages(conf.id, base.id);
          allMessages.push(...messages);
        }
      } catch (error) {
        console.error(`Failed to get messages from conference ${conf.id}:`, error);
      }
    }

    await fs.writeFile(
      path.join(exportDir, 'messages.json'),
      JSON.stringify(allMessages, null, 2),
      'utf-8'
    );

    return allMessages.length;
  }

  /**
   * Export files metadata to JSON format
   */
  private async exportFiles(exportDir: string): Promise<number> {
    // Get all conferences and their file areas
    const conferences = await this.db.getConferences();
    const allFiles: any[] = [];

    // Get files from each conference's file areas
    for (const conf of conferences) {
      try {
        const fileAreas = await this.db.getFileAreas(conf.id);
        for (const area of fileAreas) {
          const files = await this.db.getFilesByArea(area.id);
          allFiles.push(...files);
        }
      } catch (error) {
        console.error(`Failed to get files from conference ${conf.id}:`, error);
      }
    }

    await fs.writeFile(
      path.join(exportDir, 'files.json'),
      JSON.stringify(allFiles, null, 2),
      'utf-8'
    );

    return allFiles.length;
  }

  /**
   * Export system configuration
   */
  private async exportConfig(exportDir: string): Promise<void> {
    const config = this.db.getConfigRepository().getSystemConfig();

    if (!config) {
      // No system config exists - create default export
      const defaultConfig: any = {
        bbsName: 'AmiExpress BBS',
        sysopName: 'Sysop',
        minPasswordLength: 8,
        maxPasswordFails: -1,
        maxSessionTime: 120,
        idleTimeout: 10,
        ansiEnabled: true,
      };

      await fs.writeFile(
        path.join(exportDir, 'config.json'),
        JSON.stringify(defaultConfig, null, 2),
        'utf-8'
      );
      return;
    }

    const amigaConfig: any = {
      bbsName: config.bbs_name,
      sysopName: config.sysop_name,
      minPasswordLength: config.min_password_length,
      maxPasswordFails: config.max_password_fails,
      maxSessionTime: config.max_session_time,
      idleTimeout: config.idle_timeout,
      ansiEnabled: config.ansi_enabled,
    };

    await fs.writeFile(
      path.join(exportDir, 'config.json'),
      JSON.stringify(amigaConfig, null, 2),
      'utf-8'
    );
  }

  /**
   * Export bulletins
   */
  private async exportBulletins(exportDir: string): Promise<number> {
    const bulletinsDir = path.join(exportDir, 'Bulletins');
    await fs.mkdir(bulletinsDir, { recursive: true });

    // Copy bulletin files from BBS/Conf1/Bulletins
    const sourceBulletinsDir = path.join(process.cwd(), 'data', 'bbs', 'BBS', 'Conf1', 'Bulletins');

    try {
      const files = await fs.readdir(sourceBulletinsDir);
      let count = 0;

      for (const file of files) {
        if (file.endsWith('.TXT')) {
          const sourcePath = path.join(sourceBulletinsDir, file);
          const destPath = path.join(bulletinsDir, file);
          await fs.copyFile(sourcePath, destPath);
          count++;
        }
      }

      return count;
    } catch (error: any) {
      // Directory might not exist
      return 0;
    }
  }

  /**
   * Export screen files
   */
  private async exportScreens(exportDir: string): Promise<number> {
    const screensDir = path.join(exportDir, 'Screens');
    await fs.mkdir(screensDir, { recursive: true });

    // Copy screen files from BBS/Screens
    const sourceScreensDir = path.join(process.cwd(), 'data', 'bbs', 'BBS', 'Screens');

    try {
      const files = await fs.readdir(sourceScreensDir);
      let count = 0;

      for (const file of files) {
        if (file.endsWith('.TXT') || file.endsWith('.ANS')) {
          const sourcePath = path.join(sourceScreensDir, file);
          const destPath = path.join(screensDir, file);
          await fs.copyFile(sourcePath, destPath);
          count++;
        }
      }

      return count;
    } catch (error: any) {
      // Directory might not exist
      return 0;
    }
  }

  /**
   * Create archive from export directory
   * Supports ZIP and LHA formats
   */
  private async createArchive(exportDir: string, format: string, timestamp: number): Promise<string> {
    const exportsDir = path.join(process.cwd(), 'data', 'exports');
    await fs.mkdir(exportsDir, { recursive: true });

    const archivePath = path.join(exportsDir, `amiexpress-export-${timestamp}.${format}`);

    if (format === 'zip') {
      // Create ZIP archive using adm-zip
      const zip = new AdmZip();
      zip.addLocalFolder(exportDir);
      zip.writeZip(archivePath);
      console.log(`[Export] ZIP archive created: ${archivePath}`);
      return archivePath;
    } else if (format === 'lha') {
      // Create LHA archive using lha binary
      const lhaAvailable = await isLhaAvailable();
      if (!lhaAvailable) {
        throw new Error(
          'LHA binary not available. Please compile it:\n' +
          '  cd web/backend && mkdir -p tools/bin && cd tools/bin && \n' +
          '  wget https://github.com/jca02266/lha/archive/refs/tags/release-20211125.tar.gz && \n' +
          '  tar -xzf release-20211125.tar.gz && cd lha-release-20211125 && \n' +
          '  autoreconf -i && ./configure --prefix=$PWD/../../ && make && make install'
        );
      }

      await createLhaArchive(archivePath, exportDir, {
        compressionMethod: 'lh5', // Standard Amiga BBS compression
        recursive: true,
        verbose: true,
      });

      console.log(`[Export] LHA archive created: ${archivePath}`);
      return archivePath;
    } else {
      throw new Error(`Format ${format} not supported. Supported formats: zip, lha`);
    }
  }

  /**
   * Get list of available exports
   */
  async listExports(): Promise<Array<{ filename: string; size: number; created: Date }>> {
    const exportsDir = path.join(process.cwd(), 'data', 'exports');

    try {
      const files = await fs.readdir(exportsDir);
      const exports = [];

      for (const file of files) {
        if (file.startsWith('amiexpress-export-') && (file.endsWith('.zip') || file.endsWith('.lha'))) {
          const filePath = path.join(exportsDir, file);
          const stats = await fs.stat(filePath);
          exports.push({
            filename: file,
            size: stats.size,
            created: stats.birthtime,
          });
        }
      }

      // Sort by creation date, newest first
      exports.sort((a, b) => b.created.getTime() - a.created.getTime());

      return exports;
    } catch (error: any) {
      // Directory might not exist
      return [];
    }
  }

  /**
   * Delete an export file
   */
  async deleteExport(filename: string): Promise<void> {
    const exportsDir = path.join(process.cwd(), 'data', 'exports');
    const filePath = path.join(exportsDir, filename);

    // Security check: ensure filename is just a basename
    if (filename !== path.basename(filename)) {
      throw new Error('Invalid filename');
    }

    // Security check: ensure it's an export file
    if (!filename.startsWith('amiexpress-export-')) {
      throw new Error('Invalid export filename');
    }

    await fs.unlink(filePath);
  }
}
