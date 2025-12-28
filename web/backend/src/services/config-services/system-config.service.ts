/**
 * System Configuration Service
 * Handles BBS system-wide configuration (bbsConfig.info)
 */

import type { Database } from '../../database';
import type { ConfigRepository } from '../../database/config-repository';
import type { SystemConfig } from '../../database/types';
import { SystemConfigSchema, type RequestContext } from '../config.schemas';
import { loadBBSConfig, saveBBSConfig } from '../bbs-config-file.service';
import { config as appConfig } from '../../config';
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

    // Get file stats for stable timestamps
    const configPath = path.join(bbsRoot, 'bbsConfig.info');
    const stats = fs.existsSync(configPath) ? fs.statSync(configPath) : { birthtime: new Date(0), mtime: new Date(0) };

    // Convert BBSConfigData to SystemConfig format (add id and timestamps)
    const config: SystemConfig = {
      id: 1,
      ...diskConfig,
      created_at: stats.birthtime,
      updated_at: stats.mtime,
    } as SystemConfig;

    return config;
  }

  async updateSystemConfig(
    updates: Partial<SystemConfig>,
    context: RequestContext
  ): Promise<SystemConfig> {
    // Validate input
    const validated = SystemConfigSchema.partial().parse(updates);

    // Get old values for audit
    const oldConfig = await this.getSystemConfig();

    // DISK-BASED: Write to bbsConfig.info
    const bbsRoot = appConfig.get('dataDir');
    saveBBSConfig(bbsRoot, validated);

    // Get updated config from disk
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
