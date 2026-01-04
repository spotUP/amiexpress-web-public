/**
 * Drive Configuration Service
 * Handles drive path configuration (Drives.info / TOOLTYPE_DRIVES)
 */

import type { Database } from '../../database';
import type { ConfigRepository } from '../../database/config-repository';
import type { DriveConfig } from '../../database/types';
import { DriveConfigSchema, type RequestContext } from '../config.schemas';
import { InfoFileParser } from '../info-file-parser';
import { config as appConfig } from '../../config';
import * as fs from 'fs';
import * as path from 'path';

export class DriveConfigService {
  private configRepo: ConfigRepository;

  constructor(private database: Database) {
    this.configRepo = database.getConfigRepository();
  }

  async getAllDrives(): Promise<DriveConfig[]> {
    // DISK-BASED: Load from Drives.info
    const bbsRoot = appConfig.get('dataDir');
    const drivesInfoPath = path.join(bbsRoot, 'Drives.info');

    if (!fs.existsSync(drivesInfoPath)) {
console.warn('[DriveConfigService] Drives.info not found, falling back to database');
      return this.configRepo.getAllDrives();
    }

    try {
      const buffer = fs.readFileSync(drivesInfoPath);
      const stats = fs.statSync(drivesInfoPath);
      const parser = new InfoFileParser();
      const parsed = parser.parse(buffer);

      // Convert tooltypes to uppercase map
      const toolTypes = new Map<string, string>();
      for (const [key, value] of parsed.toolTypes.entries()) {
        toolTypes.set(key.toUpperCase(), value);
      }

      // Parse DRIVE.N tooltypes
      const drives: DriveConfig[] = [];
      let driveNum = 1;

      while (true) {
        const drivePath = toolTypes.get(`DRIVE.${driveNum}`);
        if (!drivePath) break;

        drives.push({
          id: driveNum,
          drive_number: driveNum,
          drive_path: drivePath,
          enabled: true,
          created_at: stats.birthtime,
          updated_at: stats.mtime
        });

        driveNum++;
        if (driveNum > 50) break; // Safety limit
      }

console.log(`[DriveConfigService] Loaded ${drives.length} drives from disk files`);
      return drives;
    } catch (error) {
console.error('[DriveConfigService] Error reading Drives.info:', error);
      return this.configRepo.getAllDrives();
    }
  }

  async getDrive(id: number): Promise<DriveConfig | null> {
    return this.configRepo.getDriveById(id);
  }

  async getDriveByNumber(driveNumber: number): Promise<DriveConfig | null> {
    return this.configRepo.getDriveByNumber(driveNumber);
  }

  async createDrive(
    drive: Omit<DriveConfig, 'id' | 'created_at' | 'updated_at'>,
    context: RequestContext
  ): Promise<DriveConfig> {
    // Validate input
    const validated = DriveConfigSchema.parse(drive);

    // Check for duplicate drive number
    const existing = await this.getDriveByNumber(validated.drive_number);
    if (existing) {
      throw new Error(`Drive number ${validated.drive_number} already exists`);
    }

    // Create in database
    const id = this.configRepo.createDrive({
      drive_number: validated.drive_number,
      drive_path: validated.drive_path,
      enabled: validated.enabled ?? true,
      description: validated.description
    });

    const newDrive = await this.getDrive(id);
    if (!newDrive) {
      throw new Error('Failed to create drive');
    }

    // DISK-BASED: Rewrite Drives.info with all drives
    this.writeDrivesInfoFile();

    // Log change
    this.configRepo.logConfigChange(
      'drives',
      id,
      'CREATE',
      context.userId,
      context.username,
      undefined,
      newDrive,
      context.ipAddress,
      context.userAgent
    );

    return newDrive;
  }

  async updateDrive(
    id: number,
    updates: Partial<DriveConfig>,
    context: RequestContext
  ): Promise<DriveConfig> {
    // Validate input
    const validated = DriveConfigSchema.partial().parse(updates);

    // Get old values
    const oldDrive = await this.getDrive(id);
    if (!oldDrive) {
      throw new Error(`Drive ${id} not found`);
    }

    // Check for duplicate drive number if changing
    if (validated.drive_number && validated.drive_number !== oldDrive.drive_number) {
      const existing = await this.getDriveByNumber(validated.drive_number);
      if (existing) {
        throw new Error(`Drive number ${validated.drive_number} already exists`);
      }
    }

    // Update in database
    const success = this.configRepo.updateDrive(id, validated);
    if (!success) {
      throw new Error(`Failed to update drive ${id}`);
    }

    const newDrive = await this.getDrive(id);
    if (!newDrive) {
      throw new Error('Failed to retrieve updated drive');
    }

    // DISK-BASED: Rewrite Drives.info with all drives
    this.writeDrivesInfoFile();

    // Log change
    this.configRepo.logConfigChange(
      'drives',
      id,
      'UPDATE',
      context.userId,
      context.username,
      oldDrive,
      newDrive,
      context.ipAddress,
      context.userAgent
    );

    return newDrive;
  }

  async deleteDrive(id: number, context: RequestContext): Promise<boolean> {
    // Get old values
    const oldDrive = await this.getDrive(id);
    if (!oldDrive) {
      return false;
    }

    // Delete from database
    const deleted = this.configRepo.deleteDrive(id);

    // DISK-BASED: Rewrite Drives.info without deleted drive
    this.writeDrivesInfoFile();

    if (deleted) {
      // Log change
      this.configRepo.logConfigChange(
        'drives',
        id,
        'DELETE',
        context.userId,
        context.username,
        oldDrive,
        undefined,
        context.ipAddress,
        context.userAgent
      );
    }

    return deleted;
  }

  /**
   * Write all drives to Drives.info file
   * DISK-BASED: Rewrites entire file with all current drives
   */
  private writeDrivesInfoFile(): void {
    const bbsRoot = appConfig.get('dataDir');
    const drivesInfoPath = path.join(bbsRoot, 'Drives.info');

    try {
      // Get all drives from database
      const drives = this.configRepo.getAllDrives();

      // Build tooltypes map with DRIVE.N entries
      const toolTypes = new Map<string, string>();

      for (const drive of drives) {
        if (drive.enabled !== false) {
          toolTypes.set(`DRIVE.${drive.drive_number}`, drive.drive_path);
        }
      }

      // Write .info file
      const parser = new InfoFileParser();
      const infoData = parser.write(toolTypes);
      fs.writeFileSync(drivesInfoPath, infoData);

console.log(`[DriveConfigService] Wrote ${drivesInfoPath} with ${drives.length} drives`);
    } catch (error) {
console.error(`[DriveConfigService] Failed to write ${drivesInfoPath}:`, error);
    }
  }
}
