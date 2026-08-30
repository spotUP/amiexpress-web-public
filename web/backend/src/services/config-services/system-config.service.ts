/**
 * System Configuration Service
 * Handles BBS system-wide configuration (bbsConfig.info)
 *
 * HYBRID STORAGE ARCHITECTURE:
 * - Most config stored on disk (bbsConfig.info, bbsConfig.info.txt)
 * - Sensitive fields (reg_key, smtp_password, etc.) stored encrypted in database
 * - getSystemConfig() merges disk + database values
 * - updateSystemConfig() routes fields to appropriate storage
 */

import type { Database } from '../../database';
import type { ConfigRepository } from '../../database/config-repository';
import type { SystemConfig } from '../../database/types';
import { SystemConfigSchema, type RequestContext } from '../config.schemas';
import { loadBBSConfig, saveBBSConfig } from '../bbs-config-file.service';
import { config as appConfig } from '../../config';
import { isSensitiveField, isDatabaseOnlyField, isMaskedValue, SENSITIVE_FIELDS } from '../../utils/secrets-encryption.util';
import * as fs from 'fs';
import * as path from 'path';

export class SystemConfigService {
  private configRepo: ConfigRepository;

  constructor(private database: Database) {
    this.configRepo = database.getConfigRepository();
  }

  async getSystemConfig(): Promise<SystemConfig> {
    // DISK-BASED: Read from bbsConfig.info
    const bbsRoot = appConfig.get('dataDir');
    const diskConfig = loadBBSConfig(bbsRoot);

    // DATABASE: Read sensitive fields (stored encrypted)
    const dbConfig = this.configRepo.getSystemConfig();

    // Get file stats for stable timestamps
    const configPath = path.join(bbsRoot, 'bbsConfig.info');
    const stats = fs.existsSync(configPath) ? fs.statSync(configPath) : { birthtime: new Date(0), mtime: new Date(0) };

    // Convert BBSConfigData to SystemConfig format (add id and timestamps)
    // Start with disk config, then merge in sensitive fields from database
    const config: SystemConfig = {
      id: 1,
      ...diskConfig,
      created_at: stats.birthtime,
      updated_at: stats.mtime,
    } as SystemConfig;

    // Merge sensitive fields from database (they're stored encrypted there)
    if (dbConfig) {
      for (const field of SENSITIVE_FIELDS) {
        const dbValue = (dbConfig as any)[field];
        if (dbValue !== undefined && dbValue !== null && dbValue !== '') {
          (config as any)[field] = dbValue;
        }
      }
      // Also check for other sensitive field patterns, and for the fields
      // that live in the database without being secret - both were written
      // there, so both have to be read back or the form shows them empty.
      for (const key of Object.keys(dbConfig)) {
        if (isSensitiveField(key) || isDatabaseOnlyField(key)) {
          const dbValue = (dbConfig as any)[key];
          if (dbValue !== undefined && dbValue !== null && dbValue !== '') {
            (config as any)[key] = dbValue;
          }
        }
      }
    }

    return config;
  }

  /**
   * Set when the last save could not update bbsConfig.info itself. Read by
   * the route so the sysop is told, rather than the divergence being silent.
   */
  lastSaveWarning?: string;

  async updateSystemConfig(
    updates: Partial<SystemConfig>,
    context: RequestContext
  ): Promise<SystemConfig> {
    // A secret the form was shown as "***" comes back as "***". Writing that
    // would replace the secret with the mask that was hiding it, and the only
    // guard on the way in dropped a secret when it was EMPTY - which the mask
    // is not. Dropping it here means "leave it alone", which is what showing
    // a mask promised.
    const submitted: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(updates)) {
      if (isMaskedValue(value)) continue;
      submitted[key] = value;
    }

    // Validate input
    const validated = SystemConfigSchema.partial().parse(submitted);

    // Get old values for audit
    const oldConfig = await this.getSystemConfig();

    // Separate sensitive fields from disk fields
    const sensitiveUpdates: Partial<SystemConfig> = {};
    const diskUpdates: Partial<SystemConfig> = {};

    for (const [key, value] of Object.entries(validated)) {
      // Database-resident fields go the same way as the secrets - the
      // difference between them is encryption, not destination. Without this
      // the VAPID settings fell into the disk bucket, where the writer has no
      // tooltype for them and dropped them silently.
      if (isSensitiveField(key) || isDatabaseOnlyField(key)) {
        (sensitiveUpdates as any)[key] = value;
      } else {
        (diskUpdates as any)[key] = value;
      }
    }

    // DATABASE: Save sensitive fields (encrypted by config-repository)
    if (Object.keys(sensitiveUpdates).length > 0) {
      this.configRepo.updateSystemConfig(sensitiveUpdates);
    }

    // DISK-BASED: Write non-sensitive fields to bbsConfig.info
    if (Object.keys(diskUpdates).length > 0) {
      const bbsRoot = appConfig.get('dataDir');
      const saved = saveBBSConfig(bbsRoot, diskUpdates);

      // The writer refuses to re-serialise an icon whose tooltype array it
      // could only read heuristically. The change is still saved - in
      // bbsConfig.info.txt, which this BBS reads - but the icon no longer
      // agrees with it, and a sysop who never sees this would not know.
      this.lastSaveWarning = saved.warning;
    }

    // Get updated config (merged from disk + database)
    const newConfig = await this.getSystemConfig();

    // Log change to audit table (database still used for audit trail)
    this.configRepo.logConfigChange(
      'system_config',
      1,
      'UPDATE',
      context.userId,
      context.username,
      oldConfig,
      newConfig,
      context.ipAddress,
      context.userAgent
    );

    return newConfig;
  }
}
