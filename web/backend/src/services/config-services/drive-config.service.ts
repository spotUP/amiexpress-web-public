/**
 * Drive Configuration Service
 * Handles drive path configuration (Drives.info / TOOLTYPE_DRIVES)
 */

import type { Database } from '../../database';
import type { ConfigRepository } from '../../database/config-repository';
import type { DriveConfig } from '../../database/types';
import { DriveConfigSchema, type RequestContext } from '../config.schemas';
import { applyTooltypes, readTooltypeMap } from '../../utils/info-file.util';
import { mergeForWrite } from './config-merge.util';
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
      const stats = fs.statSync(drivesInfoPath);
      // Convert tooltypes to uppercase map
      const toolTypes = readTooltypeMap(drivesInfoPath);

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

    // DISK-BASED: merge the new drive over what Drives.info already holds
    await this.writeDrivesInfoFile({ entry: newDrive });

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

    // DISK-BASED: merge the edited drive over what Drives.info already holds
    await this.writeDrivesInfoFile({ entry: newDrive });

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

    // DISK-BASED: remove just this drive from what Drives.info already holds
    await this.writeDrivesInfoFile({ removeNumber: oldDrive.drive_number });

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
   * Rewrite Drives.info.
   *
   * Disk first. This built the file from configRepo.getAllDrives() alone
   * while the page reads its list from Drives.info, which is the same
   * asymmetry that erased screen types, computer types and transfer
   * protocols: with a stale or empty drives table, saving one drive wiped
   * every drive that existed only on disk. The database is a mirror, and a
   * mirror that has fallen behind must not truncate what it mirrors.
   *
   * It also rebuilt the tooltype map from scratch, so any key in Drives.info
   * that is not a DRIVE.n - anything the sysop or another tool put there -
   * was dropped on every save.
   *
   * `change` describes what the caller just did: the drive they added or
   * edited, and the number they removed.
   */
  private async writeDrivesInfoFile(
    change: { entry?: DriveConfig; removeNumber?: number } = {}
  ): Promise<void> {
    const bbsRoot = appConfig.get('dataDir');
    const drivesInfoPath = path.join(bbsRoot, 'Drives.info');

    try {
      const onDisk = await this.getAllDrives();
      // ONLY the caller's entry. Handing mergeForWrite the whole mirror let it
      // overwrite and append as well as protect: a stale row rewrote an entry
      // the sysop never touched, and a row disk had never heard of was added
      // to the file. mergeForWrite exists to stop the mirror TRUNCATING disk,
      // not to make it a second source.
      const changed = change.entry ? [change.entry] : [];

      const merged = mergeForWrite(
        onDisk,
        changed,
        (drive: DriveConfig) => String(drive.drive_number),
        { remove: change.removeNumber !== undefined ? [String(change.removeNumber)] : [] }
      );

      // Only the DRIVE.n series is this writer's; applyTooltypes keeps the
      // icon and every other tooltype in the file, so there is nothing to
      // read back and re-assert.
      const toolTypes = new Map<string, string>();
      for (const drive of merged) {
        if (drive.enabled !== false) {
          toolTypes.set(`DRIVE.${drive.drive_number}`, drive.drive_path);
        }
      }

      applyTooltypes(drivesInfoPath, toolTypes, {
        removeKeys: key => /^DRIVE\.\d+$/.test(key),
      });

console.log(`[DriveConfigService] Wrote ${drivesInfoPath} with ${merged.length} drives`);
    } catch (error) {
console.error(`[DriveConfigService] Failed to write ${drivesInfoPath}:`, error);
    }
  }
}
