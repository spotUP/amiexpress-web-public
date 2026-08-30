/**
 * Conference Configuration Service
 * Handles conference/message area configuration
 */

import type { Database } from '../../database';
import type { ConfigRepository } from '../../database/config-repository';
import { readConferenceFields } from './conference-info-file.service';
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

        // Reader and writer share one map of field -> tooltype, so the two
        // cannot drift apart again. They had: six settings were written under
        // one spelling and read back from another.
        const fromDisk = readConferenceFields(toolTypes);

        const config: ConferenceConfig = {
          id: i,
          conference_id: i,
          name: confConfig.entries[i - 1]?.name || `Conference ${i}`,
          ndirs: fromDisk.ndirs,
          dlpath_1: fromDisk.dlpaths[1],
          dlpath_2: fromDisk.dlpaths[2],
          dlpath_3: fromDisk.dlpaths[3],
          dlpath_4: fromDisk.dlpaths[4],
          dlpath_5: fromDisk.dlpaths[5],
          dlpath_6: fromDisk.dlpaths[6],
          dlpath_7: fromDisk.dlpaths[7],
          dlpath_8: fromDisk.dlpaths[8],
          dlpath_9: fromDisk.dlpaths[9],
          dlpath_10: fromDisk.dlpaths[10],
          dlpath_11: fromDisk.dlpaths[11],
          dlpath_12: fromDisk.dlpaths[12],
          dlpath_13: fromDisk.dlpaths[13],
          dlpath_14: fromDisk.dlpaths[14],
          dlpath_15: fromDisk.dlpaths[15],
          dlpath_16: fromDisk.dlpaths[16],
          ulpath_1: fromDisk.ulpaths[1],
          ulpath_2: fromDisk.ulpaths[2],
          ulpath_3: fromDisk.ulpaths[3],
          ulpath_4: fromDisk.ulpaths[4],
          ulpath_5: fromDisk.ulpaths[5],
          ulpath_6: fromDisk.ulpaths[6],
          ulpath_7: fromDisk.ulpaths[7],
          ulpath_8: fromDisk.ulpaths[8],
          ulpath_9: fromDisk.ulpaths[9],
          ulpath_10: fromDisk.ulpaths[10],
          ulpath_11: fromDisk.ulpaths[11],
          ulpath_12: fromDisk.ulpaths[12],
          ulpath_13: fromDisk.ulpaths[13],
          ulpath_14: fromDisk.ulpaths[14],
          ulpath_15: fromDisk.ulpaths[15],
          ulpath_16: fromDisk.ulpaths[16],
          force_newscan: fromDisk.force_newscan,
          no_newscan: fromDisk.no_newscan,
          show_new_files: fromDisk.show_new_files,
          no_new_files: fromDisk.no_new_files,
          // No tooltype exists for these; they live in the database only.
          free_downloads: false,
          exclude_ftp: fromDisk.exclude_ftp,
          private_conf: fromDisk.private_conf,
          read_only: fromDisk.read_only,
          menu_prompt: fromDisk.menu_prompt,
          confdb_shared: fromDisk.confdb_shared,
          use_username: true,
          use_realname: false,
          use_internetname: false,
          min_access_level: fromDisk.min_access_level,
          max_access_level: fromDisk.max_access_level,
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
      // An EMPTY path is a change: it clears the file area. Testing the
      // string for truth meant a path could be set and never removed - the
      // sysop cleared the field, the form said saved, the path stayed.
      if (typeof validatedAny[dlKey] === 'string') {
        dlpaths[i] = validatedAny[dlKey];
      }
      if (typeof validatedAny[ulKey] === 'string') {
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
