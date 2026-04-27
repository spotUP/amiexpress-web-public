/**
 * Conference Configuration Service
 * Handles conference/message area configuration
 */

import type { Database } from '../../database';
import type { ConfigRepository } from '../../database/config-repository';
import type { ConferenceConfig } from '../../database/types';
import { ConferenceConfigSchema, type RequestContext } from '../config.schemas';
import { ConferenceSetupService } from '../conference-setup.service';
import { loadConfConfig } from '../conf-config.service';
import { InfoFileParser } from '../info-file-parser';
import { config as appConfig } from '../../config';
import * as fs from 'fs';
import * as path from 'path';

export class ConferenceConfigService {
  private configRepo: ConfigRepository;
  private conferenceSetup: ConferenceSetupService;

  constructor(private database: Database) {
    this.configRepo = database.getConfigRepository();
    const bbsRoot = appConfig.get('dataDir');
    this.conferenceSetup = new ConferenceSetupService(bbsRoot);
  }

  async getConferenceConfig(conferenceId: number): Promise<ConferenceConfig | null> {
    return this.configRepo.getConferenceConfig(conferenceId);
  }

  async getConferenceConfigs(): Promise<ConferenceConfig[]> {
    const bbsRoot = appConfig.get('dataDir');
    const confConfig = loadConfConfig(bbsRoot);

    if (!confConfig || confConfig.confCount === 0) {
console.warn('[ConferenceConfigService] ConfConfig.info not found or empty');
      return this.configRepo.getConferenceConfigs();
    }

    const configs: ConferenceConfig[] = [];
    const parser = new InfoFileParser();

    for (let i = 1; i <= confConfig.confCount; i++) {
      const confInfoPath = path.join(bbsRoot, `Conf${i}.info`);

      if (!fs.existsSync(confInfoPath)) {
console.warn(`[ConferenceConfigService] Conf${i}.info not found, skipping`);
        continue;
      }

      try {
        const buffer = fs.readFileSync(confInfoPath);
        const stats = fs.statSync(confInfoPath);
        const parsed = parser.parse(buffer);

        const toolTypes = new Map<string, string>();
        for (const [key, value] of parsed.toolTypes.entries()) {
          toolTypes.set(key.toUpperCase(), value);
        }

        const ndirs = parseInt(toolTypes.get('NDIRS') || '0', 10);

        const config: ConferenceConfig = {
          id: i,
          conference_id: i,
          name: confConfig.entries[i - 1]?.name || `Conference ${i}`,
          ndirs,
          dlpath_1: toolTypes.get('DLPATH.1') || '',
          dlpath_2: toolTypes.get('DLPATH.2') || '',
          dlpath_3: toolTypes.get('DLPATH.3') || '',
          dlpath_4: toolTypes.get('DLPATH.4') || '',
          dlpath_5: toolTypes.get('DLPATH.5') || '',
          dlpath_6: toolTypes.get('DLPATH.6') || '',
          dlpath_7: toolTypes.get('DLPATH.7') || '',
          dlpath_8: toolTypes.get('DLPATH.8') || '',
          dlpath_9: toolTypes.get('DLPATH.9') || '',
          dlpath_10: toolTypes.get('DLPATH.10') || '',
          dlpath_11: toolTypes.get('DLPATH.11') || '',
          dlpath_12: toolTypes.get('DLPATH.12') || '',
          dlpath_13: toolTypes.get('DLPATH.13') || '',
          dlpath_14: toolTypes.get('DLPATH.14') || '',
          dlpath_15: toolTypes.get('DLPATH.15') || '',
          dlpath_16: toolTypes.get('DLPATH.16') || '',
          ulpath_1: toolTypes.get('ULPATH.1') || '',
          ulpath_2: toolTypes.get('ULPATH.2') || '',
          ulpath_3: toolTypes.get('ULPATH.3') || '',
          ulpath_4: toolTypes.get('ULPATH.4') || '',
          ulpath_5: toolTypes.get('ULPATH.5') || '',
          ulpath_6: toolTypes.get('ULPATH.6') || '',
          ulpath_7: toolTypes.get('ULPATH.7') || '',
          ulpath_8: toolTypes.get('ULPATH.8') || '',
          ulpath_9: toolTypes.get('ULPATH.9') || '',
          ulpath_10: toolTypes.get('ULPATH.10') || '',
          ulpath_11: toolTypes.get('ULPATH.11') || '',
          ulpath_12: toolTypes.get('ULPATH.12') || '',
          ulpath_13: toolTypes.get('ULPATH.13') || '',
          ulpath_14: toolTypes.get('ULPATH.14') || '',
          ulpath_15: toolTypes.get('ULPATH.15') || '',
          ulpath_16: toolTypes.get('ULPATH.16') || '',
          force_newscan: toolTypes.get('FORCENEWSCAN') === '1',
          no_newscan: false,
          show_new_files: true,
          no_new_files: false,
          free_downloads: false,
          exclude_ftp: toolTypes.get('EXCLUDEFTP') === '1',
          private_conf: toolTypes.get('PRIVATECONF') === '1',
          read_only: toolTypes.get('READONLY') === '1',
          menu_prompt: toolTypes.get('MENUPROMPT') || '',
          confdb_shared: 0,
          use_username: true,
          use_realname: false,
          use_internetname: false,
          min_access_level: parseInt(toolTypes.get('MINACCESSLEVEL') || '0', 10),
          max_access_level: parseInt(toolTypes.get('MAXACCESSLEVEL') || '255', 10),
          created_at: stats.birthtime,
          updated_at: stats.mtime
        };

        configs.push(config);
      } catch (error) {
console.error(`[ConferenceConfigService] Error reading Conf${i}.info:`, error);
      }
    }

console.log(`[ConferenceConfigService] Loaded ${configs.length} conferences`);
    return configs;
  }

  async createConferenceConfig(
    config: Omit<ConferenceConfig, 'id' | 'created_at' | 'updated_at'>,
    context: RequestContext
  ): Promise<ConferenceConfig> {
    const validated = ConferenceConfigSchema.parse(config) as Omit<ConferenceConfig, 'id' | 'created_at' | 'updated_at'>;
    const newConfig = this.configRepo.createConferenceConfig(validated);

    try {
      const bbsRoot = appConfig.get('dataDir');
      const confConfig = loadConfConfig(bbsRoot);
      const confEntry = confConfig?.entries[newConfig.conference_id - 1];
      const conferenceName = confEntry?.name || `Conference ${newConfig.conference_id}`;
      const location = confEntry?.location || `Conf${String(newConfig.conference_id).padStart(2, '0')}`;

      await this.conferenceSetup.setupConference({
        conferenceId: newConfig.conference_id,
        conferenceName,
        location,
        ndirs: validated.ndirs || 1,
        minAccessLevel: validated.min_access_level || 0,
        maxAccessLevel: validated.max_access_level || 255,
        forceNewscan: validated.force_newscan || false,
        excludeFTP: validated.exclude_ftp || false,
        privateConf: validated.private_conf || false,
        readOnly: validated.read_only || false
      });
console.log(`[ConferenceConfigService] Created Conf${newConfig.conference_id}.info`);
    } catch (error) {
console.error(`[ConferenceConfigService] Failed to create disk structure:`, error);
    }

    this.configRepo.logConfigChange('conference_config', newConfig.id, 'CREATE',
      context.userId, context.username, undefined, newConfig,
      context.ipAddress, context.userAgent);

    return newConfig;
  }

  async updateConferenceConfig(
    conferenceId: number,
    updates: Partial<ConferenceConfig>,
    context: RequestContext
  ): Promise<ConferenceConfig> {
    const validated = ConferenceConfigSchema.partial().parse(updates);
    const oldConfig = await this.getConferenceConfig(conferenceId);
    if (!oldConfig) throw new Error(`Conference config ${conferenceId} not found`);

    const confInfoUpdates: any = {};
    if (validated.ndirs !== undefined) confInfoUpdates.ndirs = validated.ndirs;
    if (validated.min_access_level !== undefined) confInfoUpdates.minAccessLevel = validated.min_access_level;
    if (validated.max_access_level !== undefined) confInfoUpdates.maxAccessLevel = validated.max_access_level;
    if (validated.force_newscan !== undefined) confInfoUpdates.forceNewscan = validated.force_newscan;
    if (validated.exclude_ftp !== undefined) confInfoUpdates.excludeFTP = validated.exclude_ftp;
    if (validated.private_conf !== undefined) confInfoUpdates.privateConf = validated.private_conf;
    if (validated.read_only !== undefined) confInfoUpdates.readOnly = validated.read_only;

    const dlpaths: { [key: number]: string } = {};
    const ulpaths: { [key: number]: string } = {};
    const validatedAny = validated as any;
    for (let i = 1; i <= 16; i++) {
      const dlKey = `dlpath_${i}`;
      const ulKey = `ulpath_${i}`;
      if (validatedAny[dlKey] && typeof validatedAny[dlKey] === 'string') {
        dlpaths[i] = validatedAny[dlKey];
      }
      if (validatedAny[ulKey] && typeof validatedAny[ulKey] === 'string') {
        ulpaths[i] = validatedAny[ulKey];
      }
    }
    if (Object.keys(dlpaths).length > 0) confInfoUpdates.dlpaths = dlpaths;
    if (Object.keys(ulpaths).length > 0) confInfoUpdates.ulpaths = ulpaths;

    if (Object.keys(confInfoUpdates).length > 0) {
      await this.conferenceSetup.updateConferenceInfoFile(conferenceId, confInfoUpdates);
    }

    const newConfig = this.configRepo.updateConferenceConfig(conferenceId, validated);

    this.configRepo.logConfigChange('conference_config', newConfig.id, 'UPDATE',
      context.userId, context.username, oldConfig, newConfig,
      context.ipAddress, context.userAgent);

    return newConfig;
  }

  async deleteConferenceConfig(conferenceId: number, context: RequestContext): Promise<boolean> {
    const oldConfig = await this.getConferenceConfig(conferenceId);
    if (!oldConfig) return false;

    const deleted = this.configRepo.deleteConferenceConfig(conferenceId);

    const bbsRoot = appConfig.get('dataDir');
    const confInfoPath = path.join(bbsRoot, `Conf${conferenceId}.info`);
    if (fs.existsSync(confInfoPath)) {
      try {
        fs.unlinkSync(confInfoPath);
console.log(`[ConferenceConfigService] Deleted ${confInfoPath}`);
      } catch (error) {
console.error(`[ConferenceConfigService] Failed to delete ${confInfoPath}:`, error);
      }
    }

    if (deleted) {
      this.configRepo.logConfigChange('conference_config', oldConfig.id, 'DELETE',
        context.userId, context.username, oldConfig, undefined,
        context.ipAddress, context.userAgent);
    }

    return deleted;
  }
}
